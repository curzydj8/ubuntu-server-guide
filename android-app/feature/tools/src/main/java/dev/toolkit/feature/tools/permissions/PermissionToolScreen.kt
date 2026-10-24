package dev.toolkit.feature.tools.permissions

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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.AppResult

/** N-17 权限计算器界面：输入八进制 → 符号权限与 chmod 命令，可复制。 */
@Composable
fun PermissionToolScreen(modifier: Modifier = Modifier) {
    var input by remember { mutableStateOf("755") }
    var result by remember { mutableStateOf<AppResult<PermissionLogic.Permissions>?>(null) }
    val clipboard = LocalClipboardManager.current

    Column(
        modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Linux 权限计算器", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            label = { Text("八进制权限（如 755）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { result = PermissionLogic.fromOctal(input) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("计算") }
        when (val r = result) {
            is AppResult.Success -> {
                val p = r.value
                Text("符号权限：${p.toSymbolic()}", style = MaterialTheme.typography.bodyLarge)
                Text("属主 ${p.owner.toSymbol()} · 属组 ${p.group.toSymbol()} · 其他 ${p.others.toSymbol()}")
                val cmd = p.chmodCommand("/path/to/file")
                Text("示例命令：$cmd")
                Button(onClick = { clipboard.setText(AnnotatedString(cmd)) }) { Text("复制命令") }
            }
            is AppResult.Failure -> Text(
                r.error.message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
            null -> Text("输入三位八进制后点计算。")
        }
    }
}
