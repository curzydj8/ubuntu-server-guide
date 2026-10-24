package dev.toolkit.feature.tools.kb

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** N-10 诊断决策树界面：逐问推进到结论（检查命令 + 修复步骤），可重开。 */
@Composable
fun DiagScreen(modifier: Modifier = Modifier) {
    var currentId by remember { mutableStateOf("root") }
    val node = DiagLogic.node(currentId) ?: DiagLogic.start()
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("故障诊断决策树", style = MaterialTheme.typography.headlineSmall)
        when (node) {
            is DiagLogic.Node.Question -> {
                Text(node.text, style = MaterialTheme.typography.titleMedium)
                node.options.forEach { (label, nextId) ->
                    Button(
                        onClick = { currentId = nextId },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(label) }
                }
            }
            is DiagLogic.Node.Conclusion -> {
                Text("结论：${node.title}", style = MaterialTheme.typography.titleMedium)
                Text("先运行这些检查：", style = MaterialTheme.typography.titleSmall)
                node.checks.forEach { Text("  $it") }
                Text("处置：", style = MaterialTheme.typography.titleSmall)
                node.fix.forEach { Text("  $it") }
            }
        }
        if (currentId != "root") {
            OutlinedButton(onClick = { currentId = "root" }) { Text("重新开始") }
        }
        Text(
            "种子数据含 3 条高频路径；完整决策树（35 个终点）随内容同步协议在第三阶段下发。",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
