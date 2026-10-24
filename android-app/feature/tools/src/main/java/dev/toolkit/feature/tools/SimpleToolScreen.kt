package dev.toolkit.feature.tools

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.AppResult

/** 通用工具输出：展示行 + 可复制文本（缺省复制全部行）。 */
data class ToolOutput(val lines: List<String>, val copyText: String? = null)

/** 通用工具的字段定义。 */
data class ToolField(
    val key: String,
    val label: String,
    val initial: String = "",
    val singleLine: Boolean = true,
    val minLines: Int = 1,
)

/**
 * 通用工具屏：字段输入 → 计算 → 输出/错误四态，带复制。
 * 适用于绝大多数「输入→纯计算→文本输出」工具；复杂交互的工具有自己的屏。
 */
@Composable
fun SimpleToolScreen(
    title: String,
    fields: List<ToolField>,
    actionLabel: String = "计算",
    compute: (Map<String, String>) -> AppResult<ToolOutput>,
    modifier: Modifier = Modifier,
) {
    val values = remember { mutableStateMapOf<String, String>().apply {
        fields.forEach { put(it.key, it.initial) }
    } }
    var output by remember { mutableStateOf<ToolOutput?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val clipboard = LocalClipboardManager.current

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        fields.forEach { field ->
            OutlinedTextField(
                value = values[field.key] ?: "",
                onValueChange = { values[field.key] = it },
                label = { Text(field.label) },
                singleLine = field.singleLine,
                minLines = field.minLines,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Button(
            onClick = {
                when (val r = compute(values.toMap())) {
                    is AppResult.Success -> { output = r.value; error = null }
                    is AppResult.Failure -> { output = null; error = r.error.message }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(actionLabel) }
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        output?.let { out ->
            out.lines.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
            Button(onClick = {
                clipboard.setText(AnnotatedString(out.copyText ?: out.lines.joinToString("\n")))
            }) { Text("复制结果") }
        }
    }
}
