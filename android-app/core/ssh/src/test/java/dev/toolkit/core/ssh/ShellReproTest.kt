package dev.toolkit.core.ssh

import dev.toolkit.core.common.AppResult
import kotlinx.coroutines.runBlocking
import org.apache.sshd.common.keyprovider.KeyPairProvider
import org.apache.sshd.server.SshServer
import org.apache.sshd.server.auth.password.PasswordAuthenticator
import org.apache.sshd.server.shell.InvertedShellWrapper
import org.apache.sshd.server.shell.ShellFactory
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.security.KeyPair
import java.security.PublicKey

/** 真机复现：openShell 在真机上以 message=null 的异常失败，此测试在 JVM 上跑同路径并打印完整异常链。 */
class ShellReproTest {
    private lateinit var server: SshServer
    private lateinit var serverPublicKey: PublicKey
    private val store = object : HostKeyStore {
        val map = mutableMapOf<String, String>()
        override suspend fun lookup(host: String, port: Int): String? = map["$host:$port"]
        override suspend fun save(host: String, port: Int, fingerprint: String, keyType: String) {
            map["$host:$port"] = fingerprint
        }
    }
    private val transport = SshTransport(store)

    private class StaticKeyPairProvider(private val pair: KeyPair) : KeyPairProvider {
        override fun loadKeys(session: org.apache.sshd.common.session.SessionContext?): MutableIterable<KeyPair> =
            mutableListOf(pair)
    }

    @Before fun setUp() {
        val generator = java.security.KeyPairGenerator.getInstance("RSA")
        generator.initialize(2048)
        val pair = generator.generateKeyPair()
        serverPublicKey = pair.public
        server = SshServer.setUpDefaultServer()
        server.port = 0
        server.keyPairProvider = StaticKeyPairProvider(pair)
        server.passwordAuthenticator = PasswordAuthenticator { u, p, _ -> u == "zhangdawei" && p == "test-pass" }
        server.shellFactory = ShellFactory { InvertedShellWrapper(EchoShell()) }
        server.start()
    }

    @After fun tearDown() { runCatching { server.stop(true) } }

    @Test fun `open shell and echo`() = runBlocking {
        val result = transport.openSession(
            SshEndpoint("127.0.0.1", server.port, "zhangdawei"),
            SshAuth.Password("test-pass".toCharArray()),
        ) { _, _, _, _ -> true }
        val session = (result as AppResult.Success).value
        when (val shell = session.openShell()) {
            is AppResult.Failure -> {
                var c: Throwable? = (shell.error as? dev.toolkit.core.common.AppError.Io)?.cause
                val chain = StringBuilder("openShell failed: ${shell.error.message}\n")
                while (c != null) {
                    chain.append("  cause: ${c.javaClass.name}: ${c.message}\n")
                    c.stackTrace.take(6).forEach { chain.append("    at $it\n") }
                    c = c.cause
                }
                fail(chain.toString())
            }
            is AppResult.Success -> {
                val channel = shell.value
                val sb = StringBuilder()
                val reader = Thread {
                    val buf = ByteArray(4096)
                    while (true) {
                        val n = runCatching { channel.input.read(buf) }.getOrElse { -1 }
                        if (n <= 0) break
                        synchronized(sb) { sb.append(String(buf, 0, n)) }
                    }
                }
                reader.isDaemon = true
                reader.start()
                channel.write("echo SHELL-OK-123\n")
                val deadline = System.currentTimeMillis() + 8000
                var seen = false
                while (System.currentTimeMillis() < deadline) {
                    if (synchronized(sb) { sb.contains("SHELL-OK-123") }) { seen = true; break }
                    Thread.sleep(100)
                }
                channel.close()
                assertTrue("expected echo in shell output, got: ${synchronized(sb) { sb.toString() }}", seen)
            }
        }
        session.close()
    }
}
