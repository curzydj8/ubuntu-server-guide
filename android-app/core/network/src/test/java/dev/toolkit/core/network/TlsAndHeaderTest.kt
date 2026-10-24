package dev.toolkit.core.network

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.security.KeyStore
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.X509TrustManager
import java.security.cert.X509Certificate
import kotlin.concurrent.thread

class TlsAndHeaderTest {

    private fun resource(name: String): File {
        // 单元测试工作目录为模块根
        val f = File("src/test/resources/$name")
        assertTrue("测试资源应存在：${f.path}", f.exists())
        return f
    }

    @Test fun `pem parses and analyzes with san and expiry math`() {
        val pem = resource("test-cert.pem").readText()
        val cert = (TlsAnalyzer.parsePem(pem) as AppResult.Success).value
        val report = TlsAnalyzer.analyze(cert, cert.notBefore.time + 10L * 86_400_000L)
        assertTrue(report.subject.contains("CN=localhost"))
        assertEquals(listOf("localhost"), report.sanDns)
        assertEquals(listOf("127.0.0.1"), report.sanIp)
        assertEquals(355L, report.daysRemaining)
        assertEquals("有效", report.status)
        assertTrue(report.selfSigned)
        val advice = TlsAnalyzer.renewalAdvice(report)
        assertTrue(advice.any { it.contains("自签名") })
    }

    @Test fun `expired status when now beyond notAfter`() {
        val pem = resource("test-cert.pem").readText()
        val cert = (TlsAnalyzer.parsePem(pem) as AppResult.Success).value
        val report = TlsAnalyzer.analyze(cert, cert.notAfter.time + 86_400_000L)
        assertEquals("已过期", report.status)
        assertTrue(report.daysRemaining < 0)
    }

    @Test fun `fetches leaf cert from local tls server`() {
        val ks = KeyStore.getInstance("JKS")
        FileInputStream(resource("test-keystore.jks")).use { ks.load(it, "changeit".toCharArray()) }
        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(ks, "changeit".toCharArray())
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(kmf.keyManagers, null, null)
        val server = ctx.serverSocketFactory.createServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1")) as SSLServerSocket
        val port = server.localPort
        val serverThread = thread(isDaemon = true) {
            try {
                server.accept().use { s -> s.getOutputStream().write(1) }
            } catch (e: Exception) { /* 客户端断开即可 */ }
        }
        // 测试用宽松信任策略（本机自签），生产默认走平台校验
        val permissive = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        val result = TlsFetcher.fetch("127.0.0.1", port, 5_000, trustManagerOverride = permissive)
        assertTrue("抓取应成功：$result", result is AppResult.Success)
        val fetched = (result as AppResult.Success).value
        assertTrue(fetched.report.subject.contains("CN=localhost"))
        assertEquals(listOf("localhost"), fetched.report.sanDns)
        server.close()
        serverThread.join(2_000)
    }

    @Test fun `garbage pem rejected`() {
        assertTrue(TlsAnalyzer.parsePem("not a cert") is AppResult.Failure)
    }

    @Test fun `header checks cover hsts csp and disclosure`() {
        val headers = mapOf(
            "strict-transport-security" to listOf("max-age=63072000; includeSubDomains"),
            "content-security-policy" to listOf("default-src 'self'; script-src 'unsafe-inline'"),
            "x-content-type-options" to listOf("nosniff"),
            "server" to listOf("nginx/1.24.0"),
        )
        val checks = HeaderAnalyzer.analyze(headers).associateBy { it.name }
        assertEquals("通过", checks["Strict-Transport-Security"]?.status)
        assertEquals("警告", checks["Content-Security-Policy"]?.status)
        assertEquals("缺失", checks["点击劫持防护"]?.status)
        assertEquals("警告", checks["版本泄露（server）"]?.status)
    }

    @Test fun `pasted headers parse including status line`() {
        val pasted = """
            HTTP/2 200
            content-type: text/html
            X-Content-Type-Options: nosniff
        """.trimIndent()
        val parsed = (HeaderAnalyzer.parsePasted(pasted) as AppResult.Success).value
        assertEquals(listOf("nosniff"), parsed["x-content-type-options"])
        assertTrue(HeaderAnalyzer.parsePasted("没有冒号的一行") is AppResult.Failure)
    }
}
