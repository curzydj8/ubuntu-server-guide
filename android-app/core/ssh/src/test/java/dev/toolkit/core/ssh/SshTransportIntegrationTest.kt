package dev.toolkit.core.ssh

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.io.InputStream
import java.io.OutputStream
import java.security.PublicKey
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking
import org.apache.sshd.common.keyprovider.KeyPairProvider
import org.apache.sshd.server.Environment
import org.apache.sshd.server.ExitCallback
import org.apache.sshd.server.SshServer
import org.apache.sshd.server.auth.password.PasswordAuthenticator
import org.apache.sshd.server.channel.ChannelSession
import org.apache.sshd.server.command.Command
import org.apache.sshd.server.command.CommandFactory
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * sshj 与 Apache MINA sshd 的真协议集成测试（进程内服务器、临时端口）：
 * 覆盖 TOFU 首次确认、二次免打扰、指纹变更拦截、密码认证成功/失败、exec 往返。
 */
class SshTransportIntegrationTest {

    private class MemoryHostKeyStore : HostKeyStore {
        val map = mutableMapOf<String, String>()
        override suspend fun lookup(host: String, port: Int): String? = map["$host:$port"]
        override suspend fun save(host: String, port: Int, fingerprint: String, keyType: String) {
            map["$host:$port"] = fingerprint
        }
    }

    /** 把收到的命令以 EXEC: 前缀写回 stdout 并以 0 退出的测试命令。 */
    private class EchoCommand(private val commandText: String) : Command {
        private var out: OutputStream? = null
        private var callback: ExitCallback? = null
        override fun setInputStream(inputStream: InputStream?) {}
        override fun setOutputStream(outputStream: OutputStream?) { out = outputStream }
        override fun setErrorStream(errorStream: OutputStream?) {}
        override fun setExitCallback(callback: ExitCallback?) { this.callback = callback }
        override fun start(channel: ChannelSession?, env: Environment?) {
            out?.write("EXEC:$commandText\n".toByteArray())
            out?.flush()
            callback?.onExit(0)
        }
        override fun destroy(channel: ChannelSession?) {}
    }

    private lateinit var server: SshServer
    private lateinit var serverPublicKey: PublicKey
    private val store = MemoryHostKeyStore()
    private val transport = SshTransport(store)

    /** 静态主机密钥提供者：测试自备密钥对，指纹可预期。 */
    private class StaticKeyPairProvider(private val pair: java.security.KeyPair) : KeyPairProvider {
        override fun loadKeys(session: org.apache.sshd.common.session.SessionContext?): Iterable<java.security.KeyPair> =
            listOf(pair)
        override fun loadKey(session: org.apache.sshd.common.session.SessionContext?, type: String?): java.security.KeyPair = pair
    }

    @Before fun startServer() {
        server = startServerWithFreshKey()
    }

    @After fun stopServer() {
        runCatching { server.stop(true) }
    }

    /** 只睡不退出的命令：模拟远端长命令，destroy 时中断（供 exec 超时测试）。 */
    private class BlockingCommand : Command {
        private var callback: ExitCallback? = null
        private var sleeper: Thread? = null
        override fun setInputStream(inputStream: InputStream?) {}
        override fun setOutputStream(outputStream: OutputStream?) {}
        override fun setErrorStream(errorStream: OutputStream?) {}
        override fun setExitCallback(callback: ExitCallback?) { this.callback = callback }
        override fun start(channel: ChannelSession?, env: Environment?) {
            sleeper = Thread {
                try {
                    Thread.sleep(30_000)
                    callback?.onExit(0)
                } catch (_: InterruptedException) {
                    // 被 destroy 中断：不回调退出码，模拟命令被杀
                }
            }.also { it.start() }
        }
        override fun destroy(channel: ChannelSession?) {
            sleeper?.interrupt()
        }
    }

    private fun startServerWithFreshKey(
        fixedPort: Int = 0,
        factory: CommandFactory = CommandFactory { _, command -> EchoCommand(command) },
    ): SshServer {
        val generator = java.security.KeyPairGenerator.getInstance("RSA")
        generator.initialize(2048)
        val pair = generator.generateKeyPair()
        serverPublicKey = pair.public
        val s = SshServer.setUpDefaultServer()
        s.port = fixedPort
        s.keyPairProvider = StaticKeyPairProvider(pair)
        s.passwordAuthenticator = PasswordAuthenticator { u, p, _ ->
            u == "zhangdawei" && p == "test-pass"
        }
        s.commandFactory = factory
        s.start()
        return s
    }

    private fun endpoint() = SshEndpoint("127.0.0.1", server.port, "zhangdawei")
    private fun passwordAuth() = SshAuth.Password("test-pass".toCharArray())

    @Test fun `first connect asks, trusts, exec works`() = runBlocking {
        var askedFp: String? = null
        val result = transport.openSession(endpoint(), passwordAuth()) { _, _, fp, _ ->
            askedFp = fp; true
        }
        val session = (result as AppResult.Success).value
        assertEquals(Fingerprint.of(serverPublicKey), askedFp)
        assertEquals(askedFp, store.map["127.0.0.1:${server.port}"])
        val exec = session.exec("echo hello")
        val value = (exec as AppResult.Success).value
        assertEquals(0, value.exitCode)
        assertTrue(value.stdout.contains("EXEC:echo hello"))
        session.close()
    }

    @Test fun `second connect does not ask again`() = runBlocking {
        transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ -> true }
        val asks = AtomicInteger(0)
        val result = transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ ->
            asks.incrementAndGet(); true
        }
        assertTrue(result is AppResult.Success)
        assertEquals(0, asks.get())
        (result as AppResult.Success).value.close()
    }

    @Test fun `changed host key is blocked`() = runBlocking {
        transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ -> true }
        val samePort = server.port
        server.stop(true)
        // 同端口重启但换主机密钥，模拟服务器密钥变更（TOFU 必须拦截）
        server = startServerWithFreshKey(samePort)
        val result = transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ -> true }
        assertTrue(result is AppResult.Failure)
        val error = (result as AppResult.Failure).error
        assertTrue("actual error: $error", error is AppError.Security)
        assertTrue("actual message: ${error.message}", error.message.contains("变更"))
    }

    @Test fun `wrong password fails as security error`() = runBlocking {
        val result = transport.openSession(
            endpoint(), SshAuth.Password("wrong".toCharArray()),
        ) { _, _, _, _ -> true }
        assertTrue(result is AppResult.Failure)
        assertTrue((result as AppResult.Failure).error is AppError.Security)
    }

    @Test fun `rejecting unknown host key refuses connection`() = runBlocking {
        val result = transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ -> false }
        assertTrue(result is AppResult.Failure)
        assertTrue(store.map.isEmpty())
    }

    @Test fun `exec timeout is reported as failure, not success`() = runBlocking {
        server.stop(true)
        server = startServerWithFreshKey(0, CommandFactory { _, _ -> BlockingCommand() })
        val result = transport.openSession(endpoint(), passwordAuth()) { _, _, _, _ -> true }
        val session = (result as AppResult.Success).value
        val timedOut = session.exec("sleep 30", timeoutMs = 500)
        assertTrue("actual: $timedOut", timedOut is AppResult.Failure)
        assertTrue(
            "actual message: ${(timedOut as AppResult.Failure).error.message}",
            timedOut.error.message.contains("超时"),
        )
        // 超时只杀命令，不杀连接：底层 SSH 连接仍在
        assertTrue(session.isConnected)
        session.close()
    }
}
