package dev.toolkit.feature.servers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.DispatcherProvider
import dev.toolkit.core.database.OpAuditEntity
import dev.toolkit.core.database.ServerDataRepository
import dev.toolkit.core.database.SshHostEntity
import dev.toolkit.core.security.CredentialVault
import dev.toolkit.core.ssh.CommandRisk
import dev.toolkit.core.ssh.Redact
import dev.toolkit.core.ssh.RiskLevel
import dev.toolkit.core.ssh.ShellChannel
import dev.toolkit.core.ssh.SshAuth
import dev.toolkit.core.ssh.SshEndpoint
import dev.toolkit.core.ssh.SshSession
import dev.toolkit.core.ssh.SshTransport
import dev.toolkit.core.ssh.UnknownHostKeyHandler
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** 首次连接的指纹确认请求：UI 弹窗展示，deferred 承载用户决策（超时视为拒绝）。 */
data class FingerprintPrompt(
    val host: String, val port: Int, val fingerprint: String, val keyType: String,
    val deferred: CompletableDeferred<Boolean>,
)

/** 高风险命令的二次确认请求：展示目标主机 + 命令 + 风险等级（任务书护栏）。 */
data class ConfirmPrompt(
    val hostLabel: String, val command: String, val risk: RiskLevel,
    val deferred: CompletableDeferred<Boolean>,
)

enum class ConnPhase { DISCONNECTED, CONNECTING, CONNECTED, FAILED }
data class ConnInfo(val phase: ConnPhase, val message: String? = null)

data class DiagUiState(
    val hostId: Long? = null,
    val running: Boolean = false,
    val sections: List<DiagSection> = emptyList(),
)

/**
 * 服务器管理状态与会话管理：
 * - 凭据只经 Keystore 保险库进出，数据库档案仅存引用；审计写入前统一脱敏。
 * - exec 纪律沿用 core:ssh：单次执行、绝不重试；终端高风险命令先确认后发送。
 */
class ServersViewModel(
    private val repo: ServerDataRepository,
    private val vault: CredentialVault,
    private val transport: SshTransport,
    private val dispatchers: DispatcherProvider,
) : ViewModel() {

    val hosts: StateFlow<List<SshHostEntity>> = repo.observeHosts()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val audit: StateFlow<List<OpAuditEntity>> = repo.observeAudit()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _conn = MutableStateFlow<Map<Long, ConnInfo>>(emptyMap())
    val conn: StateFlow<Map<Long, ConnInfo>> = _conn.asStateFlow()

    private val _fingerprintPrompt = MutableStateFlow<FingerprintPrompt?>(null)
    val fingerprintPrompt: StateFlow<FingerprintPrompt?> = _fingerprintPrompt.asStateFlow()

    private val _confirmPrompt = MutableStateFlow<ConfirmPrompt?>(null)
    val confirmPrompt: StateFlow<ConfirmPrompt?> = _confirmPrompt.asStateFlow()

    private val _terminalOutput = MutableStateFlow("")
    val terminalOutput: StateFlow<String> = _terminalOutput.asStateFlow()

    private val _terminalHostId = MutableStateFlow<Long?>(null)
    val terminalHostId: StateFlow<Long?> = _terminalHostId.asStateFlow()

    private val _diag = MutableStateFlow(DiagUiState())
    val diag: StateFlow<DiagUiState> = _diag.asStateFlow()

    private val sessions = mutableMapOf<Long, SshSession>()
    private var shell: ShellChannel? = null
    private var shellReader: Job? = null

    // ---------- 连接 ----------

    fun connect(host: SshHostEntity) {
        viewModelScope.launch { ensureConnected(host) }
    }

    fun disconnect(host: SshHostEntity) {
        if (_terminalHostId.value == host.id) closeTerminal()
        sessions.remove(host.id)?.let { runCatching { it.close() } }
        setConn(host.id, ConnInfo(ConnPhase.DISCONNECTED))
        audit(host, "disconnect", null, null, null)
    }

    private suspend fun ensureConnected(host: SshHostEntity): SshSession? {
        sessions[host.id]?.let { if (it.isConnected) { setConn(host.id, ConnInfo(ConnPhase.CONNECTED)); return it } }
        setConn(host.id, ConnInfo(ConnPhase.CONNECTING))
        val auth = loadAuth(host) ?: run {
            setConn(host.id, ConnInfo(ConnPhase.FAILED, "保险库中找不到该主机的凭据，请编辑档案重新填写"))
            return null
        }
        val handler = UnknownHostKeyHandler { h, p, fp, kt ->
            val deferred = CompletableDeferred<Boolean>()
            _fingerprintPrompt.value = FingerprintPrompt(h, p, fp, kt, deferred)
            val answer = withTimeoutOrNull(90_000) { deferred.await() } ?: false
            _fingerprintPrompt.value = null
            answer
        }
        val result = transport.openSession(
            SshEndpoint(host.host, host.port, host.username), auth, onUnknownHostKey = handler,
        )
        return when (result) {
            is AppResult.Success -> {
                sessions[host.id] = result.value
                setConn(host.id, ConnInfo(ConnPhase.CONNECTED))
                audit(host, "connect", null, null, 0)
                result.value
            }
            is AppResult.Failure -> {
                setConn(host.id, ConnInfo(ConnPhase.FAILED, result.error.message))
                audit(host, "connect-failed", null, null, null)
                null
            }
        }
    }

    fun answerFingerprint(trust: Boolean) {
        _fingerprintPrompt.value?.deferred?.complete(trust)
        _fingerprintPrompt.value = null
    }

    fun forgetHostKey(host: SshHostEntity) {
        viewModelScope.launch {
            repo.forgetHostKey(host.host, host.port)
            setConn(host.id, ConnInfo(ConnPhase.DISCONNECTED, "已忘记旧指纹，下次连接将重新确认新指纹"))
        }
    }

    private suspend fun loadAuth(host: SshHostEntity): SshAuth? {
        val base = host.credentialRef ?: return null
        return when (host.authType) {
            HostForm.AUTH_PRIVATE_KEY -> {
                val pem = (vault.get(CredentialRefs.privateKey(base)) as? AppResult.Success)?.value ?: return null
                val pass = (vault.get(CredentialRefs.keyPassphrase(base)) as? AppResult.Success)?.value
                SshAuth.PrivateKey(String(pem), pass)
            }
            else -> {
                val pw = (vault.get(CredentialRefs.password(base)) as? AppResult.Success)?.value ?: return null
                SshAuth.Password(pw)
            }
        }
    }

    // ---------- 终端 ----------

    fun openTerminal(host: SshHostEntity) {
        if (_terminalHostId.value == host.id && shell != null) return
        closeTerminal()
        _terminalHostId.value = host.id
        _terminalOutput.value = ""
        viewModelScope.launch {
            val session = ensureConnected(host) ?: run {
                _terminalOutput.value = "连接失败，见上方状态。\n"
                return@launch
            }
            // 0.6.3 真机教训：openShell 是阻塞网络调用，跑在主线程必抛
            // NetworkOnMainThreadException（且该异常 message 为 null，表现为“打开终端失败：null”）。
            when (val r = withContext(dispatchers.io) { session.openShell() }) {
                is AppResult.Failure -> _terminalOutput.value = "打开终端失败：${r.error.message}\n"
                is AppResult.Success -> {
                    shell = r.value
                    shellReader = viewModelScope.launch(dispatchers.io) {
                        val buffer = ByteArray(4096)
                        try {
                            while (true) {
                                val n = r.value.input.read(buffer)
                                if (n < 0) break
                                val chunk = String(buffer, 0, n, Charsets.UTF_8)
                                _terminalOutput.value = TerminalText.append(_terminalOutput.value, chunk)
                            }
                        } catch (_: Exception) {
                            // 通道关闭/断线：读循环退出，下方统一提示
                        }
                        _terminalOutput.value += "\n[连接已断开]\n"
                        if (_terminalHostId.value == host.id) {
                            setConn(host.id, ConnInfo(ConnPhase.DISCONNECTED, "连接已断开"))
                        }
                    }
                }
            }
        }
    }

    fun sendTerminalLine(host: SshHostEntity, line: String) {
        val channel = shell ?: return
        viewModelScope.launch {
            val risk = CommandRisk.assess(line)
            if (CommandRisk.requiresConfirmation(risk)) {
                val deferred = CompletableDeferred<Boolean>()
                _confirmPrompt.value = ConfirmPrompt(label(host), line, risk, deferred)
                val ok = withTimeoutOrNull(60_000) { deferred.await() } ?: false
                _confirmPrompt.value = null
                if (!ok) {
                    _terminalOutput.value += "\n[已取消高风险命令]\n"
                    return@launch
                }
            }
            try {
                withContext(dispatchers.io) { channel.write(line + "\n") }
                audit(host, "term-exec", line, risk.label, null)
            } catch (e: Exception) {
                _terminalOutput.value += "\n[发送失败：${e.message}]\n"
            }
        }
    }

    fun answerConfirm(ok: Boolean) {
        _confirmPrompt.value?.deferred?.complete(ok)
        _confirmPrompt.value = null
    }

    fun closeTerminal() {
        shellReader?.cancel(); shellReader = null
        runCatching { shell?.close() }; shell = null
        _terminalHostId.value = null
    }

    // ---------- 只读诊断 ----------

    fun runDiagnostics(host: SshHostEntity) {
        viewModelScope.launch {
            _diag.value = DiagUiState(
                hostId = host.id, running = true,
                sections = Diagnostics.presets.map { DiagSection(it) },
            )
            val session = ensureConnected(host)
            if (session == null) {
                _diag.value = _diag.value.copy(
                    running = false,
                    sections = _diag.value.sections.map { it.copy(error = "未连接") },
                )
                return@launch
            }
            for ((index, preset) in Diagnostics.presets.withIndex()) {
                updateSection(index) { it.copy(running = true) }
                if (Diagnostics.riskOf(preset) != RiskLevel.READ_ONLY) {
                    updateSection(index) { it.copy(running = false, error = "护栏拦截：预设命令未通过只读校验") }
                    continue
                }
                // 同上：exec 也是阻塞网络调用，必须走 IO 线程，否则主线程抛 NetworkOnMainThreadException。
                when (val r = withContext(dispatchers.io) { session.exec(preset.command, timeoutMs = 20_000) }) {
                    is AppResult.Success -> {
                        val out = (r.value.stdout + r.value.stderr).trim()
                        updateSection(index) {
                            it.copy(running = false, output = out.ifEmpty { "（无输出）" }, exitCode = r.value.exitCode)
                        }
                        audit(host, "diag", preset.command, RiskLevel.READ_ONLY.label, r.value.exitCode)
                    }
                    is AppResult.Failure ->
                        updateSection(index) { it.copy(running = false, error = r.error.message) }
                }
            }
            _diag.value = _diag.value.copy(running = false)
        }
    }

    private fun updateSection(index: Int, change: (DiagSection) -> DiagSection) {
        _diag.value = _diag.value.copy(
            sections = _diag.value.sections.mapIndexed { i, s -> if (i == index) change(s) else s },
        )
    }

    // ---------- 档案 CRUD ----------

    /**
     * 保存档案：凭据只入保险库（密码 pw / 私钥 key / 私钥口令 kp），档案只存引用。
     * credentialInput 为空且为编辑既有档案时保留原凭据。回调 error=null 表示成功。
     */
    fun saveHost(
        existing: SshHostEntity?,
        alias: String, host: String, portText: String, username: String,
        authType: String, groupName: String, tagsRaw: String, note: String,
        credentialInput: String, keyPassphrase: String,
        onResult: (String?) -> Unit,
    ) {
        viewModelScope.launch {
            val keepCredential = existing?.credentialRef != null && credentialInput.isBlank()
            val error = HostForm.validate(
                alias, host, portText, username, authType,
                credentialProvided = credentialInput.isNotBlank() || keepCredential,
            )
            if (error != null) { onResult(error); return@launch }
            val entity = SshHostEntity(
                id = existing?.id ?: 0,
                alias = alias.trim(), host = host.trim(), port = portText.toInt(),
                username = username.trim(), credentialRef = existing?.credentialRef,
                hostKeyFingerprint = existing?.hostKeyFingerprint,
                groupName = groupName.trim(), tags = HostForm.joinTags(HostForm.parseTags(tagsRaw)),
                authType = authType, note = note.trim(),
            )
            val id = if (existing == null) repo.addHost(entity) else { repo.updateHost(entity); entity.id }
            val saved = if (existing == null) entity.copy(id = id) else entity
            val base = saved.credentialRef ?: CredentialRefs.baseFor(id)
            if (saved.credentialRef == null) repo.updateHost(saved.copy(credentialRef = base))
            if (credentialInput.isNotBlank()) {
                when (authType) {
                    HostForm.AUTH_PRIVATE_KEY -> {
                        val r1 = vault.put(CredentialRefs.privateKey(base), credentialInput.toCharArray())
                        val r2 = if (keyPassphrase.isNotBlank()) {
                            vault.put(CredentialRefs.keyPassphrase(base), keyPassphrase.toCharArray())
                        } else {
                            vault.remove(CredentialRefs.keyPassphrase(base))
                        }
                        vault.remove(CredentialRefs.password(base))
                        val fail = listOf(r1, r2).firstOrNull { it is AppResult.Failure } as? AppResult.Failure
                        if (fail != null) { onResult("凭据写入保险库失败：${fail.error.message}"); return@launch }
                    }
                    else -> {
                        val r1 = vault.put(CredentialRefs.password(base), credentialInput.toCharArray())
                        if (r1 is AppResult.Failure) { onResult("凭据写入保险库失败：${r1.error.message}"); return@launch }
                        vault.remove(CredentialRefs.privateKey(base)); vault.remove(CredentialRefs.keyPassphrase(base))
                    }
                }
            }
            onResult(null)
        }
    }

    fun deleteHost(host: SshHostEntity) {
        viewModelScope.launch {
            disconnect(host)
            host.credentialRef?.let { base ->
                vault.remove(CredentialRefs.password(base)); vault.remove(CredentialRefs.privateKey(base)); vault.remove(CredentialRefs.keyPassphrase(base))
            }
            repo.deleteHost(host.id)
            audit(host, "profile-delete", null, null, null)
        }
    }

    // ---------- 内部 ----------

    private fun setConn(id: Long, info: ConnInfo) {
        _conn.value = _conn.value + (id to info)
    }

    private fun label(host: SshHostEntity) = "${host.alias}（${host.username}@${host.host}:${host.port}）"

    private fun audit(host: SshHostEntity, action: String, command: String?, risk: String?, exitCode: Int?) {
        viewModelScope.launch {
            repo.appendAudit(
                OpAuditEntity(
                    atMillis = System.currentTimeMillis(),
                    profileId = host.id,
                    hostLabel = label(host),
                    action = action,
                    command = command?.let { Redact.text(it) },
                    risk = risk,
                    exitCode = exitCode,
                )
            )
        }
    }

    override fun onCleared() {
        closeTerminal()
        sessions.values.forEach { runCatching { it.close() } }
        sessions.clear()
        super.onCleared()
    }
}
