package dev.toolkit.core.network

import dev.toolkit.core.common.AppResult
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/** 以本机原始套接字 HTTP 服务器为可控端点实测：重试、状态码、取头与超时行为。 */
class OkHttpNetworkClientTest {

    private lateinit var serverSocket: ServerSocket
    private val flakyHits = AtomicInteger(0)
    private var base = ""
    @Volatile private var running = true

    @Before fun setUp() {
        serverSocket = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        base = "http://127.0.0.1:${serverSocket.localPort}"
        thread(isDaemon = true) {
            while (running) {
                try {
                    val socket = serverSocket.accept()
                    thread(isDaemon = true) { handle(socket) }
                } catch (e: Exception) {
                    if (running) throw e
                }
            }
        }
    }

    private fun handle(socket: java.net.Socket) {
        socket.use { s ->
            val reader = BufferedReader(InputStreamReader(s.getInputStream()))
            val requestLine = reader.readLine() ?: return
            val path = requestLine.split(" ").getOrNull(1) ?: "/"
            // 读完请求头
            while (true) {
                val line = reader.readLine()
                if (line.isNullOrEmpty()) break
            }
            val out = s.getOutputStream()
            fun respond(code: Int, body: String, extraHeaders: Map<String, String> = emptyMap()) {
                val head = buildString {
                    append("HTTP/1.1 $code ${if (code == 200) "OK" else "Error"}\r\n")
                    append("Content-Length: ${body.toByteArray().size}\r\n")
                    extraHeaders.forEach { (k, v) -> append("$k: $v\r\n") }
                    append("Connection: close\r\n\r\n")
                }
                out.write(head.toByteArray())
                out.write(body.toByteArray())
                out.flush()
            }
            when {
                path.startsWith("/flaky") -> {
                    val n = flakyHits.incrementAndGet()
                    if (n < 3) respond(500, "boom") else respond(200, "recovered")
                }
                path.startsWith("/slow") -> {
                    Thread.sleep(1500)
                    respond(200, "slow")
                }
                path.startsWith("/headers") -> respond(
                    200, "ok",
                    mapOf(
                        "X-Test-Marker" to "yes",
                        "Strict-Transport-Security" to "max-age=63072000",
                    ),
                )
                else -> respond(404, "not found")
            }
        }
    }

    @After fun tearDown() {
        running = false
        serverSocket.close()
    }

    @Test fun `get retries on server error then succeeds`() = runTest {
        val client = OkHttpNetworkClient(TimeoutPolicy(connectMillis = 1000, readMillis = 3000, callMillis = 5000))
        val result = client.getText("$base/flaky", RetryPolicy(maxAttempts = 3, baseDelayMillis = 10, maxDelayMillis = 50))
        assertTrue(result is AppResult.Success)
        assertEquals("recovered", (result as AppResult.Success).value)
        assertEquals(3, flakyHits.get())
    }

    @Test fun `get gives up after max attempts`() = runTest {
        val client = OkHttpNetworkClient()
        val result = client.getText("$base/flaky", RetryPolicy(maxAttempts = 2, baseDelayMillis = 10, maxDelayMillis = 20))
        assertTrue(result is AppResult.Failure)
        assertEquals(2, flakyHits.get())
    }

    @Test fun `headers are fetched lowercased`() {
        val client = OkHttpNetworkClient()
        val result = client.fetchHeaders("$base/headers")
        assertTrue(result is AppResult.Success)
        val headers = (result as AppResult.Success).value
        assertEquals(listOf("yes"), headers["x-test-marker"])
        assertTrue(headers.containsKey("strict-transport-security"))
    }

    @Test fun `read timeout surfaces as network failure`() = runTest {
        val client = OkHttpNetworkClient(TimeoutPolicy(connectMillis = 500, readMillis = 300, callMillis = 900))
        val result = client.getText("$base/slow", RetryPolicy(maxAttempts = 1))
        assertTrue(result is AppResult.Failure)
    }
}
