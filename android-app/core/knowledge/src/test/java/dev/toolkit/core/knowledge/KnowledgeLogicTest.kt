package dev.toolkit.core.knowledge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KnowledgeLogicTest {

    @Test fun `renderer covers core blocks`() {
        val md = """
            # 标题一
            段落含 **粗体** 与 `代码`。

            ```bash
            sudo apt update
            ```

            - 项一
            - 项二

            1. 第一步
            2. 第二步

            | 列A | 列B |
            | --- | --- |
            | 1 | 2 |

            > 引用一行

            ---

            !!! note "提示"
                提示正文一行
        """.trimIndent()
        val blocks = MarkdownRenderer.render(md)
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Heading && it.level == 1 })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Code && it.code.contains("apt update") })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Bullets && it.items.size == 2 })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Numbered && it.items.size == 2 })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Table && it.rows.size == 1 && it.headers.size == 2 })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Quote })
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Divider })
    }

    @Test fun `inline parser splits bold and code`() {
        val spans = InlineParser.parse("前 **粗** 中 `code` 后")
        assertEquals(
            listOf("前 ", "粗", " 中 ", "code", " 后"),
            spans.map {
                when (it) {
                    is InlineParser.Span.Text -> it.value
                    is InlineParser.Span.Bold -> it.value
                    is InlineParser.Span.Code -> it.value
                }
            },
        )
        assertTrue(spans[1] is InlineParser.Span.Bold)
        assertTrue(spans[3] is InlineParser.Span.Code)
    }

    @Test fun `tool link extractor finds ids`() {
        val ids = ToolLinkExtractor.extract("可用 N-17 权限计算器与 N-21；编号 G-02 也相关；XN-99 不算，N-1 不算")
        assertEquals(listOf("N-17", "N-21", "G-02"), ids)
    }

    @Test fun `renderer never swallows unknown syntax`() {
        val blocks = MarkdownRenderer.render("普通一行\n=== 分隔样式标题\n另一行")
        assertTrue(blocks.any { it is MarkdownRenderer.Block.Paragraph && it.text.contains("普通一行") })
    }
}
