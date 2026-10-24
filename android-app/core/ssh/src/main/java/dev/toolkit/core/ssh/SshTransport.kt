package dev.toolkit.core.ssh

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.io.ByteArrayOutputStream
import java.security.PublicKey
import java.security.Security
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.common.KeyType
import net.schmizz.sshj.connection.channel.direct.Session
import net.schmizz.sshj.transport.verification.HostKeyVerifier
import net.schmizz.sshj.userauth.keyprovider.KeyProvider
import org.bouncycastle.jce.provider.BouncyCastleProvider

/** 主机密钥信任存储（TOFU）：由数据层实现，core:ssh 只依赖本接口。 */
interface HostKeyStore {
    suspend fun lookup(host: String, port: Int): String?
    suspend fun save(host: String, port: Int, fingerprint: String, keyType: String)
}

data class SshEndpoint(val host: String, val port: Int = 22, val username: String)

sealed interface SshAuth {
    data class Password(val password: CharArray) : SshAuth
    data class PrivateKey(val pem: String, val passphrase: CharArray? = null) : SshAuth
}

/** 首次见到主机密钥时的决策回调（UI 层弹窗确认）；返回 true 表示信任并保存。 */
fun interface UnknownHostKeyHandler {
    suspend fun confirm(host: String, port: Int, fingerprint: String, keyType: String): Boolean
}

data class ExecResult(val stdout: String, val stderr: String, val exitCode: Int?)

class HostKeyChangedException(val expected: String, val actual: String) :
    Exception("主机密钥已变更：期望 $expected，实际 $actual")

object SshEnvironment {
    @Volatile private var ready = false

    /** 注册完整 BouncyCastle（Android 自带 BC 残缺，ed25519 等算法需要完整实现）。 */
    @Synchronized
    fun ensureProviders() {
        if (ready) return
        Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME)
        Security.insertProviderAt(BouncyCastleProvider(), 1)
        ready = true
    }
}

/**
 * SSH 传输层：连接、主机密钥 TOFU 校验、认证、一次性命令执行。
 * 纪律：exec 单次尝试、绝不自动重试（网络失败不得重复执行命令——任务书要求）；
 * 所有阻塞调用在 IO 线程；超时可配；凭据不写任何日志。
 */
class SshTransport(private val hostKeyStore: HostKeyStore) {

    suspend fun openSession(
        endpoint: SshEndpoint,
        auth: SshAuth,
        connectTimeoutMs: Int = 15_000,
        onUnknownHostKey: UnknownHostKeyHandler,
    ): AppResult<SshSession> = withContext(Dispatchers.IO) {
        SshEnvironment.ensureProviders()
        val client = SSHClient()
        client.connectTimeout = connectTimeoutMs
        client.timeout = 0 // exec 读超时由命令级控制，不用 socket 读超时误杀长命令
        val changed = AtomicReference<HostKeyChangedException?>()
        val rejected = AtomicBoolean(false)
        client.addHostKeyVerifier(TofuVerifier(endpoint, changed, rejected, onUnknownHostKey))
        try {
            client.connect(endpoint.host, endpoint.port)
        } catch (e: Exception) {
            runCatching { client.disconnect() }
            changed.get()?.let { return@withContext AppResult.Failure(AppError.Security(it.message ?: "主机密钥已变更")) }
            if (rejected.get()) return@withContext AppResult.Failure(AppError.Security("已拒绝信任该主机密钥"))
            return@withContext AppResult.Failure(AppError.Io("连接失败：${e.message}", e))
        }
        try {
            when (auth) {
                is SshAuth.Password -> client.authPassword(endpoint.username, auth.password)
                is SshAuth.PrivateKey -> {
                    val provider: KeyProvider = if (auth.passphrase == null) {
                        client.loadKeys(auth.pem, null, null)
                    } else {
                        client.loadKeys(
                            auth.pem, null,
                            net.schmizz.sshj.userauth.password.PasswordUtils.createOneOff(auth.passphrase),
                        )
                    }
                    client.authPublickey(endpoint.username, provider)
                }
            }
        } catch (e: Exception) {
            runCatching { client.disconnect() }
            return@withContext AppResult.Failure(AppError.Security("认证失败：${e.message}"))
        }
        AppResult.Success(SshSession(client))
    }

    /** 只探测主机指纹（不做认证）：用于添加主机时预检与指纹变更核对。 */
    suspend fun probeFingerprint(
        endpoint: SshEndpoint,
        connectTimeoutMs: Int = 10_000,
    ): AppResult<String> = withContext(Dispatchers.IO) {
        SshEnvironment.ensureProviders()
        val client = SSHClient()
        client.connectTimeout = connectTimeoutMs
        val seen = AtomicReference<String?>()
        client.addHostKeyVerifier(object : HostKeyVerifier {
            override fun verify(hostname: String, port: Int, key: PublicKey): Boolean {
                seen.set(Fingerprint.of(key)); return true
            }
            override fun findExistingAlgorithms(hostname: String, port: Int): List<String> = emptyList()
        })
        try {
            client.connect(endpoint.host, endpoint.port)
        } catch (e: Exception) {
            // 认证阶段必然失败（无凭据），但指纹已在校验阶段拿到也算成功
            seen.get()?.let { return@withContext AppResult.Success(it) }
            return@withContext AppResult.Failure(AppError.Io("连接失败：${e.message}", e))
        } finally {
            runCatching { client.disconnect() }
        }
        val fp = seen.get()
        if (fp != null) AppResult.Success(fp)
        else AppResult.Failure(AppError.Io("未取得主机指纹"))
    }

    private inner class TofuVerifier(
        private val endpoint: SshEndpoint,
        private val changed: AtomicReference<HostKeyChangedException?>,
        private val rejected: AtomicBoolean,
        private val onUnknownHostKey: UnknownHostKeyHandler,
    ) : HostKeyVerifier {
        override fun verify(hostname: String, port: Int, key: PublicKey): Boolean {
            val fp = Fingerprint.of(key)
            val keyType = KeyType.fromKey(key).toString()
            val known = kotlinx.coroutines.runBlocking { hostKeyStore.lookup(endpoint.host, endpoint.port) }
            return when {
                known == null -> {
                    // sshj 校验运行在传输线程（阻塞安全）：直接等待 UI 层决策
                    val trust = kotlinx.coroutines.runBlocking {
                        runCatching { onUnknownHostKey.confirm(endpoint.host, endpoint.port, fp, keyType) }
                            .getOrDefault(false)
                    }
                    if (!trust) {
                        rejected.set(true); false
                    } else {
                        kotlinx.coroutines.runBlocking { hostKeyStore.save(endpoint.host, endpoint.port, fp, keyType) }
                        true
                    }
                }
                known == fp -> true
                else -> {
                    changed.set(HostKeyChangedException(known, fp))
                    false
                }
            }
        }

        override fun findExistingAlgorithms(hostname: String, port: Int): List<String> = emptyList()
    }
}

class SshSession internal constructor(private val client: SSHClient) : AutoCloseable {

    /** 执行一条命令并收集输出；单次尝试、绝不重试。timeoutMs<=0 表示不限时（由用户取消）。 */
    suspend fun exec(commandText: String, timeoutMs: Long = 0): AppResult<ExecResult> =
        withContext(Dispatchers.IO) {
            var session: Session? = null
            try {
                session = client.startSession()
                val command = session.exec(commandText)
                val out = ByteArrayOutputStream()
                val err = ByteArrayOutputStream()
                val copyOut = Thread { command.inputStream.copyTo(out) }
                val copyErr = Thread { command.errorStream.copyTo(err) }
                copyOut.start(); copyErr.start()
                if (timeoutMs > 0) command.join(timeoutMs, TimeUnit.MILLISECONDS)
                else command.join()
                copyOut.join(2_000); copyErr.join(2_000)
                AppResult.Success(
                    ExecResult(
                        stdout = String(out.toByteArray(), Charsets.UTF_8),
                        stderr = String(err.toByteArray(), Charsets.UTF_8),
                        exitCode = command.exitStatus,
                    )
                )
            } catch (e: Exception) {
                AppResult.Failure(AppError.Io("命令执行中断：${e.message}", e))
            } finally {
                runCatching { session?.close() }
            }
        }

    val isConnected: Boolean get() = client.isConnected && client.isAuthenticated

    /** 打开交互式 shell 通道（终端页用）：PTY + shell，输出为流式字节流，由调用方持续读取。 */
    fun openShell(): AppResult<ShellChannel> {
        var session: Session? = null
        return try {
            session = client.startSession()
            session.allocateDefaultPTY()
            AppResult.Success(ShellChannel(session, session.startShell()))
        } catch (e: Exception) {
            runCatching { session?.close() }
            // 真机首测时此处异常 message 为 null、栈被吞，导致无从定位（0.6.2 教训）：
            // 失败信息带上异常类名与完整 cause 链，并把栈打进 logcat（标签 SshTransport）。
            runCatching {
                android.util.Log.e("SshTransport", "openShell failed", e)
            }
            AppResult.Failure(AppError.Io("打开终端失败：${describeChain(e)}", e))
        }
    }

    override fun close() {
        runCatching { client.disconnect() }
    }
}

/** 交互式 shell 通道：input 为远端输出流（阻塞读，须在 IO 线程），write 向远端发送按键/命令。 */
class ShellChannel internal constructor(
    private val session: Session,
    private val shell: Session.Shell,
) : AutoCloseable {
    val input: java.io.InputStream get() = shell.inputStream

    fun write(text: String) {
        shell.outputStream.write(text.toByteArray(Charsets.UTF_8))
        shell.outputStream.flush()
    }

    val isAlive: Boolean get() = shell.isOpen

    override fun close() {
        runCatching { shell.close() }
        runCatching { session.close() }
    }
}

/** 把异常链压成一行可读文本：类名: message ← 类名: message …（诊断用，避免 message=null 时无信息）。 */
internal fun describeChain(e: Throwable): String {
    val sb = StringBuilder()
    var cur: Throwable? = e
    var depth = 0
    while (cur != null && depth < 5) {
        if (depth > 0) sb.append(" <- ")
        sb.append(cur.javaClass.simpleName).append(": ").append(cur.message ?: "(无消息)")
        cur = cur.cause
        depth++
    }
    return sb.toString()
}
