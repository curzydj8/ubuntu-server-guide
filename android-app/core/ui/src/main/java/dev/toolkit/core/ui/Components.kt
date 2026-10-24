package dev.toolkit.core.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.toolkit.core.common.ToolMeta

/** 工具条目卡片：首页、工具列表、搜索结果共用。 */
@Composable
fun ToolCard(meta: ToolMeta, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = "${meta.name}，${meta.category.label}" },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(meta.name, style = MaterialTheme.typography.titleMedium)
            Text(meta.summary, style = MaterialTheme.typography.bodyMedium)
            Text(
                if (meta.connectivity == dev.toolkit.core.common.ToolConnectivity.ONLINE) "联网工具" else "离线工具",
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { CircularProgressIndicator() }
}

@Composable
fun EmptyState(title: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { Text(title, style = MaterialTheme.typography.bodyLarge) }
}

@Composable
fun ErrorState(message: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("出错了", style = MaterialTheme.typography.titleMedium)
        Text(message, style = MaterialTheme.typography.bodyMedium)
    }
}
