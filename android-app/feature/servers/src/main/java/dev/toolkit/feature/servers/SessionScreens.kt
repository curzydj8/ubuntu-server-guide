package dev.toolkit.feature.servers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.toolkit.core.database.SshHostEntity

/**
 * 终端页（文本流）：命令逐行发送、输出流式追加；高风险命令发送前会被 ViewModel 拦截二次确认。
 * 边界（实施计划）：不做完整 ANSI/xterm 仿真，vim/top 等全屏程序不可用。
 */
@Composable
fun TerminalScreen(
    viewModel: ServersViewModel,
    host: SshHostEntity,
    modifier: Modifier = Modifier,
) {
    val output by viewModel.terminalOutput.collectAsState()
    val conn by viewModel.conn.collectAsState()
    var input by remember(host.id) { mutableStateOf("") }
    val scroll = rememberScrollState()

    LaunchedEffect(host.id) { viewModel.openTerminal(host) }
    LaunchedEffect(output) { scroll.animateScrollTo(scroll.maxValue) }

    Column(modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val info = conn[host.id]
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${host.alias} · " + when (info?.phase) {
                    ConnPhase.CONNECTED -> "已连接"
                    ConnPhase.CONNECTING -> "连接中…"
                    ConnPhase.FAILED -> "连接失败：${info.message ?: ""}"
                    else -> "未连接"
                },
                style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = { viewModel.disconnect(host) }) { Text("断开") }
        }
        Card(Modifier.fillMaxWidth().weight(1f)) {
            Text(
                output.ifEmpty { "（等待连接与输出…）" },
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(10.dp).verticalScroll(scroll),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = input, onValueChange = { input = it },
                label = { Text("输入命令，回车或点发送") },
                singleLine = true, modifier = Modifier.weight(1f),
            )
            Button(onClick = {
                if (input.isNotBlank()) { viewModel.sendTerminalLine(host, input); input = "" }
            }) { Text("发送") }
        }
        Text(
            "文本流终端：不支持 vim/top 等全屏程序；高风险命令会先弹窗确认；所有命令记入审计（已脱敏）。",
            style = MaterialTheme.typography.bodySmall,
        )
    }
    ServersDialogs(viewModel)
}

/** 只读诊断页：一键依次采集预设只读命令并分段展示；连接与每项执行都落审计。 */
@Composable
fun DiagnosticsScreen(
    viewModel: ServersViewModel,
    host: SshHostEntity,
    modifier: Modifier = Modifier,
) {
    val diag by viewModel.diag.collectAsState()
    val sections = if (diag.hostId == host.id) diag.sections else emptyList()

    Column(modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = { viewModel.runDiagnostics(host) },
            enabled = !diag.running,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (sections.isEmpty()) "开始采集" else "重新采集") }
        Text(
            "共 ${Diagnostics.presets.size} 项预设只读命令，逐项执行、互不影响；结果只展示不修改服务器。",
            style = MaterialTheme.typography.bodySmall,
        )
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(sections, key = { it.preset.id }) { section ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(section.preset.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            when {
                                section.running -> CircularProgressIndicator(Modifier.padding(2.dp))
                                section.error != null -> Text("失败", color = MaterialTheme.colorScheme.error)
                                section.output != null -> Text("完成${section.exitCode?.let { " · 退出码 $it" } ?: ""}")
                                else -> Text("等待")
                            }
                        }
                        Text(section.preset.command, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        section.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        section.output?.let {
                            Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
    ServersDialogs(viewModel)
}
