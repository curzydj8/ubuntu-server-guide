package dev.toolkit.feature.tools.subnet

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.AppResult
import androidx.compose.foundation.layout.Row

/** N-21 子网计算界面：含冒号按 IPv6 处理，否则按 IPv4 CIDR。 */
@Composable
fun SubnetToolScreen(modifier: Modifier = Modifier) {
    var input by remember { mutableStateOf("192.168.1.10/24") }
    var lines by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("子网 / CIDR 计算器", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            label = { Text("CIDR（如 192.168.1.10/24 或 2001:db8::1/64）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                error = null
                lines = emptyList()
                if (input.contains(':')) {
                    when (val r = SubnetLogic.ipv6(input)) {
                        is AppResult.Success -> lines = listOf(
                            "网络地址：${r.value.network}/${r.value.prefixLength}",
                            "首地址：${r.value.firstAddress}",
                            "末地址：${r.value.lastAddress}",
                            "地址总数：${r.value.totalAddresses}",
                        )
                        is AppResult.Failure -> error = r.error.message
                    }
                } else {
                    when (val r = SubnetLogic.ipv4(input)) {
                        is AppResult.Success -> lines = listOf(
                            "网络地址：${r.value.network}",
                            "广播地址：${r.value.broadcast}",
                            "子网掩码：${r.value.netmask}",
                            "可用范围：${r.value.firstUsable} - ${r.value.lastUsable}",
                            "主机数：共 ${r.value.totalHosts}，可用 ${r.value.usableHosts}",
                        )
                        is AppResult.Failure -> error = r.error.message
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("计算") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                val addr = input.substringBefore("/")
                when (val r = Ipv6Format.expand(addr)) {
                    is AppResult.Success -> { lines = listOf("展开：${r.value}"); error = null }
                    is AppResult.Failure -> error = r.error.message
                }
            }) { Text("展开 IPv6") }
            Button(onClick = {
                val addr = input.substringBefore("/")
                when (val r = Ipv6Format.compress(addr)) {
                    is AppResult.Success -> { lines = listOf("压缩：${r.value}"); error = null }
                    is AppResult.Failure -> error = r.error.message
                }
            }) { Text("压缩 IPv6") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        lines.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
    }
}
