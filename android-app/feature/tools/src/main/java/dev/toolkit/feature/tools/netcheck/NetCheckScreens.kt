package dev.toolkit.feature.tools.netcheck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.AppResult
import dev.toolkit.core.network.HeaderAnalyzer
import dev.toolkit.core.network.OkHttpNetworkClient
import dev.toolkit.core.network.TlsAnalyzer
import dev.toolkit.core.network.TlsFetcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** N-02 TLS 证书检查：在线抓取（平台校验）或粘贴 PEM 本地解析。 */
@Composable
fun TlsToolScreen(modifier: Modifier = Modifier) {
    var mode by remember { mutableStateOf(0) } // 0=在线 1=粘贴
    var host by remember { mutableStateOf("") }
    var pem by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val fmt = remember { SimpleDateFormat("yyyy-MM-dd", Locale.ROOT) }

    fun showReport(report: TlsAnalyzer.Report) {
        lines = buildList {
            add("主题：${report.subject}")
            add("颁发者：${report.issuer}")
            if (report.sanDns.isNotEmpty()) add("SAN（域名）：${report.sanDns.joinToString(", ")}")
            if (report.sanIp.isNotEmpty()) add("SAN（IP）：${report.sanIp.joinToString(", ")}")
            add("有效期：${fmt.format(Date(report.notBeforeMillis))} ~ ${fmt.format(Date(report.notAfterMillis))}（剩余 ${report.daysRemaining} 天）")
            add("状态：${report.status}")
            add("序列号：${report.serialHex}；签名算法：${report.signatureAlgorithm}")
            if (report.selfSigned) add("注意：自签名证书（不受默认信任）")
            addAll(TlsAnalyzer.renewalAdvice(report).map { "建议：$it" })
        }
        error = null
    }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("TLS 证书检查", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = mode == 0, onClick = { mode = 0 }, label = { Text("在线检查") })
            FilterChip(selected = mode == 1, onClick = { mode = 1 }, label = { Text("粘贴 PEM") })
        }
        if (mode == 0) {
            OutlinedTextField(
                value = host,
                onValueChange = { host = it },
                label = { Text("域名（如 example.com，可带 :端口）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    val h = host.trim()
                    if (h.isEmpty()) { error = "请填写域名"; return@Button }
                    val hp = h.removePrefix("https://").split("/")
                    val name = hp[0].substringBefore(':')
                    val port = hp[0].substringAfter(':', "443").toIntOrNull() ?: 443
                    busy = true; error = null; lines = null
                    scope.launch {
                        when (val r = withContext(Dispatchers.IO) { TlsFetcher.fetch(name, port) }) {
                            is AppResult.Success -> showReport(r.value.report)
                            is AppResult.Failure -> error = r.error.message
                        }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "检查中…" else "检查") }
        } else {
            OutlinedTextField(
                value = pem,
                onValueChange = { pem = it },
                label = { Text("粘贴 PEM 证书（-----BEGIN CERTIFICATE-----）") },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    when (val parsed = TlsAnalyzer.parsePem(pem)) {
                        is AppResult.Success -> showReport(TlsAnalyzer.analyze(parsed.value, System.currentTimeMillis()))
                        is AppResult.Failure -> error = parsed.error.message
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("解析") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        lines?.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
    }
}

/** N-03 响应头分析：粘贴响应头或输入 URL 在线取头，共用判定口径。 */
@Composable
fun HeadersToolScreen(modifier: Modifier = Modifier) {
    var mode by remember { mutableStateOf(0) } // 0=粘贴 1=在线
    var pasted by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val client = remember { OkHttpNetworkClient() }

    fun show(headers: Map<String, List<String>>) {
        lines = HeaderAnalyzer.analyze(headers).map { "[${it.status}] ${it.name} — ${it.detail}" }
        error = null
    }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("HTTP 响应头与安全分析", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = mode == 0, onClick = { mode = 0 }, label = { Text("粘贴响应头") })
            FilterChip(selected = mode == 1, onClick = { mode = 1 }, label = { Text("在线取头") })
        }
        if (mode == 0) {
            OutlinedTextField(
                value = pasted,
                onValueChange = { pasted = it },
                label = { Text("粘贴响应头（curl -I 输出即可）") },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    when (val parsed = HeaderAnalyzer.parsePasted(pasted)) {
                        is AppResult.Success -> show(parsed.value)
                        is AppResult.Failure -> error = parsed.error.message
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("分析") }
        } else {
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("URL（https://…）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    val u = url.trim()
                    if (!u.startsWith("http://") && !u.startsWith("https://")) {
                        error = "请填写完整 URL"
                        return@Button
                    }
                    busy = true; error = null; lines = null
                    scope.launch {
                        when (val r = withContext(Dispatchers.IO) { client.fetchHeaders(u) }) {
                            is AppResult.Success -> show(r.value)
                            is AppResult.Failure -> error = r.error.message
                        }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "获取中…" else "取头并分析") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        lines?.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
    }
}
