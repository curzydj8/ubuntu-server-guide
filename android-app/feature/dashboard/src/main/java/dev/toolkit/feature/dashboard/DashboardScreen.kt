package dev.toolkit.feature.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.ToolMeta
import dev.toolkit.core.ui.EmptyState
import dev.toolkit.core.ui.ToolCard

/** 首页：搜索 + 工具列表（收藏/最近的排序呈现随第二阶段完善，本阶段先打通数据流）。 */
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onToolClick: (ToolMeta) -> Unit,
    modifier: Modifier = Modifier,
    onServersClick: () -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            label = { Text("搜索工具") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (!state.loading && state.tools.isEmpty()) {
            EmptyState("没有匹配的工具")
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.tools, key = { it.id.value }) { meta ->
                ToolCard(meta) {
                    viewModel.onToolOpened(meta)
                    onToolClick(meta)
                }
            }
        }
        // 服务器管理入口置于工具页最后（站长 2026-10-24 指定）
        Card(onClick = onServersClick, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("🖥 服务器管理（SSH）", style = MaterialTheme.typography.titleMedium)
                Text(
                    "主机档案 · 终端 · 只读诊断 · 操作审计",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
