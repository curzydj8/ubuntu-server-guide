package dev.toolkit.feature.tools.dns

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import dev.toolkit.core.network.DnsClient
import dev.toolkit.core.network.OkHttpNetworkClient
import kotlinx.coroutines.launch

/**
 * N-01 DNS 查询界面：用户点击才发请求；只把查询名与类型发给所选解析商（页面明示）。
 */
@Composable
fun DnsToolScreen(modifier: Modifier = Modifier) {
    var name by remember { mutableStateOf("example.com") }
    var type by remember { mutableStateOf("A") }
    var provider by remember { mutableStateOf(DnsClient.Provider.CLOUDFLARE) }
    var lines by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val client = remember { OkHttpNetworkClient() }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("DNS 解析查询", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("域名") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DnsClient.RECORD_TYPES.take(5).forEach { t ->
                FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DnsClient.RECORD_TYPES.drop(5).forEach { t ->
                FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t) })
            }
        }
        Text("解析商（查询只发给所选一家）", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DnsClient.Provider.entries.forEach { p ->
                FilterChip(selected = provider == p, onClick = { provider = p }, label = { Text(p.label) })
            }
        }
        Button(
            onClick = {
                val valid = DnsClient.validateName(name)
                if (valid is AppResult.Failure) {
                    error = valid.error.message
                    return@Button
                }
                val domain = (valid as AppResult.Success).value
                busy = true; error = null; lines = emptyList()
                scope.launch {
                    val url = DnsClient.buildUrl(provider, domain, type)
                    when (val r = client.executeOnce(url, mapOf("Accept" to "application/dns-json"))) {
                        is AppResult.Success -> {
                            when (val parsed = DnsClient.parseResponse(r.value.second)) {
                                is AppResult.Success -> {
                                    lines = buildList {
                                        add("状态：${parsed.value.statusText}")
                                        if (parsed.value.records.isEmpty()) add("（无记录）")
                                        parsed.value.records.forEach {
                                            add("${it.type}  ${it.data}  （TTL ${it.ttl}）")
                                        }
                                    }
                                }
                                is AppResult.Failure -> error = parsed.error.message
                            }
                        }
                        is AppResult.Failure -> error = r.error.message
                    }
                    busy = false
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) "查询中…" else "查询") }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        lines.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
        Text(
            "隐私说明：点击查询后，本工具只把域名与记录类型发送给你选择的解析商（Cloudflare 或 Google 的 DoH 服务），不经过任何第三方服务器；不查询时不发任何请求。",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
