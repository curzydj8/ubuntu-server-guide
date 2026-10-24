package dev.toolkit.feature.knowledge

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.toolkit.core.database.KnowledgeArticleEntity
import dev.toolkit.core.knowledge.InlineParser
import dev.toolkit.core.knowledge.MarkdownRenderer
import dev.toolkit.core.knowledge.ToolLinkExtractor
import dev.toolkit.core.ui.EmptyState

/** 知识库首页：搜索 + 文章列表（按章节分组标题呈现）。 */
@Composable
fun KnowledgeScreen(
    viewModel: KnowledgeViewModel,
    onArticleClick: (KnowledgeArticleEntity) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsState()
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Ubuntu Server 终极指南", style = MaterialTheme.typography.headlineMedium)
        Text(
            "离线知识库 · ${state.articles.size} 篇教程，进工具页可做计算与生成；内容与网站同源同步。",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            label = { Text("搜索教程（标题与正文）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (!state.loading && state.articles.isEmpty()) {
            EmptyState(if (state.query.isBlank()) "知识库为空（等待导入内容包）" else "没有匹配的文章")
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.articles, key = { it.articleId }) { article ->
                Card(
                    Modifier.fillMaxWidth().clickable { onArticleClick(article) },
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(article.title, style = MaterialTheme.typography.titleMedium)
                        Text(article.section, style = MaterialTheme.typography.labelMedium)
                        if (article.favorite) Text("★ 已收藏", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

/** 文章阅读页：块级渲染 + 收藏 + 相关工具互链。 */
@Composable
fun ArticleScreen(
    article: KnowledgeArticleEntity,
    onToggleFavorite: () -> Unit,
    onToolClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val blocks = MarkdownRenderer.render(article.body)
    val toolIds = ToolLinkExtractor.extract(article.body)
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = article.favorite,
                onClick = onToggleFavorite,
                label = { Text(if (article.favorite) "★ 已收藏" else "☆ 收藏") },
            )
        }
        if (toolIds.isNotEmpty()) {
            Text("相关工具", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                toolIds.forEach { id ->
                    FilterChip(selected = false, onClick = { onToolClick(id) }, label = { Text(id) })
                }
            }
        }
        blocks.forEach { block ->
            when (block) {
                is MarkdownRenderer.Block.Heading -> Text(
                    block.text,
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.headlineMedium
                        2 -> MaterialTheme.typography.headlineSmall
                        else -> MaterialTheme.typography.titleMedium
                    },
                )
                is MarkdownRenderer.Block.Paragraph -> Text(inlineAnnotated(block.text), style = MaterialTheme.typography.bodyLarge)
                is MarkdownRenderer.Block.Code -> Card(Modifier.fillMaxWidth()) {
                    Text(
                        block.code,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                is MarkdownRenderer.Block.Bullets -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    block.items.forEach { Text("• " + it) }
                }
                is MarkdownRenderer.Block.Numbered -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    block.items.forEachIndexed { idx, item -> Text("${idx + 1}. $item") }
                }
                is MarkdownRenderer.Block.Quote -> Card(Modifier.fillMaxWidth()) {
                    Text(block.text, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium)
                }
                is MarkdownRenderer.Block.Table -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(block.headers.joinToString(" | "), fontWeight = FontWeight.Bold)
                    block.rows.forEach { row -> Text(row.joinToString(" | ")) }
                }
                MarkdownRenderer.Block.Divider -> Text("———")
            }
        }
    }
}

@Composable
private fun inlineAnnotated(text: String) = buildAnnotatedString {
    for (span in InlineParser.parse(text)) {
        when (span) {
            is InlineParser.Span.Text -> append(span.value)
            is InlineParser.Span.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(span.value) }
            is InlineParser.Span.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(span.value) }
        }
    }
}
