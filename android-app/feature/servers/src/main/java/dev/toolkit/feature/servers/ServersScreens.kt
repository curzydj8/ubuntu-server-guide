package dev.toolkit.feature.servers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.toolkit.core.database.SshHostEntity
import dev.toolkit.core.ssh.Fingerprint
import dev.toolkit.core.ui.EmptyState
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 指纹确认与高风险确认弹窗：挂在服务器各页共用，确保任何入口触发都能弹出。 */
@Composable
fun ServersDialogs(viewModel: ServersViewModel) {
    val fp by viewModel.fingerprintPrompt.collectAsState()
    fp?.let { prompt ->
        AlertDialog(
            onDismissRequest = { viewModel.answerFingerprint(false) },
            title = { Text("确认主机指纹") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("首次连接 ${prompt.host}:${prompt.port}，请核对服务器指纹（可在服务器上执行 ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub 比对）：")
                    SelectionContainer {
                        Text(
                            "${prompt.keyType}\n${Fingerprint.short(prompt.fingerprint)}\n${prompt.fingerprint}",
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Text("信任后将保存，后续连接自动比对；指纹变更会被拦截。")
                }
            },
            confirmButton = { Button(onClick = { viewModel.answerFingerprint(true) }) { Text("信任并连接") } },
            dismissButton = { TextButton(onClick = { viewModel.answerFingerprint(false) }) { Text("拒绝") } },
        )
    }
    val cp by viewModel.confirmPrompt.collectAsState()
    cp?.let { prompt ->
        AlertDialog(
            onDismissRequest = { viewModel.answerConfirm(false) },
            title = { Text("高风险命令确认") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("目标主机：${prompt.hostLabel}")
                    Text("风险等级：${prompt.risk.label}")
                    SelectionContainer {
                        Text(prompt.command, fontFamily = FontFamily.Monospace)
                    }
                    Text("该命令可能造成不可逆影响，请确认后再执行。")
                }
            },
            confirmButton = { Button(onClick = { viewModel.answerConfirm(true) }) { Text("确认执行") } },
            dismissButton = { TextButton(onClick = { viewModel.answerConfirm(false) }) { Text("取消") } },
        )
    }
}

@Composable
fun ServerListScreen(
    viewModel: ServersViewModel,
    onAdd: () -> Unit,
    onEdit: (SshHostEntity) -> Unit,
    onTerminal: (SshHostEntity) -> Unit,
    onDiagnostics: (SshHostEntity) -> Unit,
    onAudit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hosts by viewModel.hosts.collectAsState()
    val conn by viewModel.conn.collectAsState()
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf<String?>(null) }
    var pendingDelete by remember { mutableStateOf<SshHostEntity?>(null) }

    val groups = remember(hosts) { hosts.map { it.groupName }.filter { it.isNotBlank() }.distinct().sorted() }
    val filtered = hosts.filter { h ->
        (group == null || h.groupName == group) &&
            (query.isBlank() || h.alias.contains(query, true) || h.host.contains(query, true) ||
                h.tags.contains(query, true) || h.username.contains(query, true))
    }

    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onAdd, modifier = Modifier.weight(1f)) { Text("＋ 添加主机") }
            OutlinedButton(onClick = onAudit) { Text("操作审计") }
        }
        OutlinedTextField(
            value = query, onValueChange = { query = it },
            label = { Text("搜索别名 / 地址 / 标签 / 用户名") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        if (groups.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = group == null, onClick = { group = null }, label = { Text("全部分组") })
                groups.forEach { g ->
                    FilterChip(selected = group == g, onClick = { group = g }, label = { Text(g) })
                }
            }
        }
        if (filtered.isEmpty()) {
            EmptyState(if (hosts.isEmpty()) "还没有主机档案，点上方按钮添加" else "没有匹配的主机")
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { host ->
                val info = conn[host.id]
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(host.alias, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${host.username}@${host.host}:${host.port}" +
                                (if (host.groupName.isNotBlank()) " · ${host.groupName}" else "") +
                                (if (host.tags.isNotBlank()) " · ${host.tags}" else ""),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            when (info?.phase) {
                                ConnPhase.CONNECTED -> "● 已连接"
                                ConnPhase.CONNECTING -> "● 连接中…"
                                ConnPhase.FAILED -> "● 连接失败：${info.message ?: ""}"
                                else -> "○ 未连接"
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (info?.phase == ConnPhase.CONNECTED) {
                                OutlinedButton(onClick = { viewModel.disconnect(host) }) { Text("断开") }
                            } else {
                                Button(onClick = { viewModel.connect(host) }) { Text("连接") }
                            }
                            OutlinedButton(onClick = { onTerminal(host) }) { Text("终端") }
                            OutlinedButton(onClick = { onDiagnostics(host) }) { Text("诊断") }
                            OutlinedButton(onClick = { onEdit(host) }) { Text("编辑") }
                            OutlinedButton(onClick = { pendingDelete = host }) { Text("删除") }
                        }
                        if (info?.phase == ConnPhase.FAILED && (info.message ?: "").contains("变更")) {
                            OutlinedButton(onClick = { viewModel.forgetHostKey(host) }) {
                                Text("忘记旧指纹（服务器换钥后用）")
                            }
                        }
                    }
                }
            }
        }
    }

    pendingDelete?.let { host ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除主机档案") },
            text = { Text("确定删除「${host.alias}」？保存在保险库中的凭据会一并删除。") },
            confirmButton = {
                Button(onClick = { viewModel.deleteHost(host); pendingDelete = null }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } },
        )
    }
    ServersDialogs(viewModel)
}

@Composable
fun ServerEditScreen(
    viewModel: ServersViewModel,
    existing: SshHostEntity?,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var alias by remember(existing?.id) { mutableStateOf(existing?.alias ?: "") }
    var host by remember(existing?.id) { mutableStateOf(existing?.host ?: "") }
    var port by remember(existing?.id) { mutableStateOf((existing?.port ?: 22).toString()) }
    var username by remember(existing?.id) { mutableStateOf(existing?.username ?: "") }
    var authType by remember(existing?.id) { mutableStateOf(existing?.authType ?: HostForm.AUTH_PASSWORD) }
    var groupName by remember(existing?.id) { mutableStateOf(existing?.groupName ?: "") }
    var tags by remember(existing?.id) { mutableStateOf(existing?.tags ?: "") }
    var note by remember(existing?.id) { mutableStateOf(existing?.note ?: "") }
    var credential by remember(existing?.id) { mutableStateOf("") }
    var passphrase by remember(existing?.id) { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OutlinedTextField(alias, { alias = it }, label = { Text("别名 *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(host, { host = it }, label = { Text("主机地址 *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(port, { port = it }, label = { Text("端口 *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(username, { username = it }, label = { Text("用户名 *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = authType == HostForm.AUTH_PASSWORD,
                onClick = { authType = HostForm.AUTH_PASSWORD },
                label = { Text("密码认证") },
            )
            FilterChip(
                selected = authType == HostForm.AUTH_PRIVATE_KEY,
                onClick = { authType = HostForm.AUTH_PRIVATE_KEY },
                label = { Text("私钥认证") },
            )
        }
        if (authType == HostForm.AUTH_PASSWORD) {
            OutlinedTextField(
                credential, { credential = it },
                label = { Text(if (existing == null) "密码 *" else "密码（留空 = 不修改）") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
        } else {
            OutlinedTextField(
                credential, { credential = it },
                label = { Text(if (existing == null) "私钥 PEM *" else "私钥 PEM（留空 = 不修改）") },
                minLines = 4, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                passphrase, { passphrase = it },
                label = { Text("私钥口令（无口令留空）") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
        }
        Text("凭据只存入本机加密保险库（Android Keystore），档案与审计中不会出现明文。", style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(groupName, { groupName = it }, label = { Text("分组（可空）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(tags, { tags = it }, label = { Text("标签（逗号分隔，可空）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(note, { note = it }, label = { Text("备注（可空）") }, modifier = Modifier.fillMaxWidth())
        error?.let { Text("⚠ $it", color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                viewModel.saveHost(
                    existing, alias, host, port, username, authType, groupName, tags, note,
                    credential, passphrase,
                ) { err -> if (err == null) onDone() else error = err }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("保存") }
    }
}

@Composable
fun AuditScreen(viewModel: ServersViewModel, modifier: Modifier = Modifier) {
    val entries by viewModel.audit.collectAsState()
    val format = remember { SimpleDateFormat("MM-dd HH:mm:ss", Locale.CHINA) }
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("连接、诊断与终端命令都会记录在此（命令已脱敏，不含凭据）。", style = MaterialTheme.typography.bodySmall)
        if (entries.isEmpty()) EmptyState("暂无审计记录")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(entries, key = { it.id }) { e ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "${format.format(Date(e.atMillis))} · ${e.action}" +
                                (e.risk?.let { " · $it" } ?: "") +
                                (e.exitCode?.let { " · 退出码 $it" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(e.hostLabel, style = MaterialTheme.typography.bodySmall)
                        e.command?.let {
                            Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
