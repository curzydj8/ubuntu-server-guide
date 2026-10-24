package dev.toolkit.core.network

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.io.ByteArrayInputStream
import java.net.InetSocketAddress
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** N-02 TLS 证书分析：解析 PEM/DER、提取字段、到期与续期计算（口径：剩余天数与 30 天预警）。 */
object TlsAnalyzer {

    data class Report(
        val subject: String,
        val issuer: String,
        val sanDns: List<String>,
        val sanIp: List<String>,
        val notBeforeMillis: Long,
        val notAfterMillis: Long,
        val daysRemaining: Long,
        val status: String,
        val serialHex: String,
        val signatureAlgorithm: String,
        val selfSigned: Boolean,
    )

    fun parsePem(text: String): AppResult<X509Certificate> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return fail("证书内容为空")
        return try {
            val factory = CertificateFactory.getInstance("X.509")
            val cert = factory.generateCertificate(ByteArrayInputStream(trimmed.toByteArray(Charsets.UTF_8)))
                as? X509Certificate ?: return fail("不是 X.509 证书")
            AppResult.Success(cert)
        } catch (e: Exception) {
            fail("证书解析失败：${e.message ?: e.javaClass.simpleName}")
        }
    }

    fun analyze(cert: X509Certificate, nowMillis: Long): Report {
        val sanDns = mutableListOf<String>()
        val sanIp = mutableListOf<String>()
        cert.subjectAlternativeNames?.forEach { entry ->
            val type = entry.getOrNull(0) as? Int
            val value = entry.getOrNull(1) as? String
            if (value != null) {
                when (type) {
                    2 -> sanDns += value   // dNSName
                    7 -> sanIp += value    // iPAddress
                }
            }
        }
        val days = (cert.notAfter.time - nowMillis) / 86_400_000L
        val selfSigned = try {
            cert.verify(cert.publicKey)
            cert.subjectX500Principal == cert.issuerX500Principal
        } catch (e: Exception) {
            cert.subjectX500Principal == cert.issuerX500Principal
        }
        return Report(
            subject = cert.subjectX500Principal.name,
            issuer = cert.issuerX500Principal.name,
            sanDns = sanDns,
            sanIp = sanIp,
            notBeforeMillis = cert.notBefore.time,
            notAfterMillis = cert.notAfter.time,
            daysRemaining = days,
            status = when {
                nowMillis < cert.notBefore.time -> "尚未生效"
                days < 0 -> "已过期"
                days <= 30 -> "30 天内到期，建议尽快续期"
                else -> "有效"
            },
            serialHex = cert.serialNumber.toString(16).uppercase(),
            signatureAlgorithm = cert.sigAlgName,
            selfSigned = selfSigned,
        )
    }

    /** 续期窗口建议：与 Web 版口径一致——到期前 30 天进入续期窗口，建议提前 7 天完成切换。 */
    fun renewalAdvice(report: Report): List<String> = buildList {
        if (report.selfSigned) add("自签名证书：浏览器与客户端默认不信任，公网服务请使用受信任 CA 签发的证书")
        if (report.sanDns.isEmpty() && report.sanIp.isEmpty()) add("证书无 SAN：现代浏览器只认 SAN，CN 已被忽略，请重签带 SAN 的证书")
        when {
            report.daysRemaining < 0 -> add("证书已过期 ${-report.daysRemaining} 天，请立即续期并重载服务")
            report.daysRemaining <= 30 -> add("已进入续期窗口（剩余 ${report.daysRemaining} 天），建议 7 天内完成续期与切换")
            else -> add("距到期 ${report.daysRemaining} 天，未进入 30 天续期窗口")
        }
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}

/**
 * 在线抓取站点证书链：默认走平台校验（校验失败即报错——检查工具的正确行为）；
 * 链通过校验后分析叶子证书。测试可注入信任策略以连本机自签服务器。
 */
object TlsFetcher {

    data class FetchResult(val report: TlsAnalyzer.Report, val protocol: String, val cipherSuite: String)

    fun fetch(
        host: String,
        port: Int = 443,
        timeoutMillis: Int = 10_000,
        nowMillis: Long = System.currentTimeMillis(),
        trustManagerOverride: X509TrustManager? = null,
    ): AppResult<FetchResult> {
        val captured = arrayOfNulls<X509Certificate>(1)
        val platformTm = defaultTrustManager()
        val recorder = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                if (chain != null && chain.isNotEmpty()) captured[0] = chain[0]
                if (trustManagerOverride != null) {
                    trustManagerOverride.checkServerTrusted(chain, authType)
                } else {
                    platformTm.checkServerTrusted(chain, authType)
                }
            }
            override fun getAcceptedIssuers(): Array<X509Certificate> =
                (trustManagerOverride ?: platformTm).acceptedIssuers
        }
        return try {
            val context = SSLContext.getInstance("TLS")
            context.init(null, arrayOf<TrustManager>(recorder), null)
            val socket = context.socketFactory.createSocket() as SSLSocket
            socket.use {
                it.connect(InetSocketAddress(host, port), timeoutMillis)
                it.soTimeout = timeoutMillis
                it.startHandshake()
                val leaf = captured[0]
                    ?: return AppResult.Failure(AppError.Network("未获取到服务器证书"))
                val session = it.session
                AppResult.Success(
                    FetchResult(TlsAnalyzer.analyze(leaf, nowMillis), session.protocol, session.cipherSuite)
                )
            }
        } catch (e: Exception) {
            AppResult.Failure(AppError.Network("TLS 连接失败：${e.message ?: e.javaClass.simpleName}"))
        }
    }

    private fun defaultTrustManager(): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as KeyStore?)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }
}
