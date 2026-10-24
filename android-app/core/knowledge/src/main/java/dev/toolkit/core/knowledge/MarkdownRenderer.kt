package dev.toolkit.core.knowledge

/**
 * Markdown 子集渲染（结构层）：把指南文章解析为块序列，供 Compose 侧排版。
 * 覆盖标题/段落/代码块/列表/引用/表格/分隔线；MkDocs 提示块（!!! / ???）降级为引用块；
 * 未识别语法按段落原文呈现（不吞内容）。行内样式由 InlineParser 处理。
 */
object MarkdownRenderer {

    sealed interface Block {
        data class Heading(val level: Int, val text: String) : Block
        data class Paragraph(val text: String) : Block
        data class Code(val code: String, val language: String?) : Block
        data class Bullets(val items: List<String>) : Block
        data class Numbered(val items: List<String>) : Block
        data class Quote(val text: String) : Block
        data class Table(val headers: List<String>, val rows: List<List<String>>) : Block
        data object Divider : Block
    }

    fun render(markdown: String): List<Block> {
        val lines = markdown.lines()
        val blocks = mutableListOf<Block>()
        var i = 0
        val paragraph = StringBuilder()
        fun flushParagraph() {
            if (paragraph.isNotBlank()) {
                blocks += Block.Paragraph(paragraph.toString().trim())
                paragraph.clear()
            }
        }
        while (i < lines.size) {
            val line = lines[i]
            val trimmed = line.trim()
            when {
                trimmed.startsWith("```") -> {
                    flushParagraph()
                    val lang = trimmed.removePrefix("```").trim().ifBlank { null }
                    val code = StringBuilder()
                    i++
                    while (i < lines.size && !lines[i].trim().startsWith("```")) {
                        code.appendLine(lines[i]); i++
                    }
                    i++ // 结束围栏
                    blocks += Block.Code(code.toString().trimEnd('\n'), lang)
                }
                trimmed.startsWith("!!!") || trimmed.startsWith("???") -> {
                    flushParagraph()
                    val title = trimmed.drop(3).trim().trim('"')
                    val body = StringBuilder()
                    i++
                    while (i < lines.size && (lines[i].startsWith("    ") || lines[i].isBlank())) {
                        if (lines[i].isNotBlank()) body.appendLine(lines[i].trim())
                        i++
                    }
                    blocks += Block.Quote((title + "\n" + body.toString().trim()).trim())
                }
                trimmed.matches(Regex("#{1,6} .*")) -> {
                    flushParagraph()
                    val level = trimmed.takeWhile { it == '#' }.length
                    blocks += Block.Heading(level, trimmed.drop(level).trim())
                    i++
                }
                trimmed == "---" || trimmed == "***" -> {
                    flushParagraph(); blocks += Block.Divider; i++
                }
                trimmed.startsWith("|") && i + 1 < lines.size &&
                    lines[i + 1].trim().matches(Regex("\\|[\\s:|-]+\\|")) -> {
                    flushParagraph()
                    val headers = splitRow(trimmed)
                    i += 2
                    val rows = mutableListOf<List<String>>()
                    while (i < lines.size && lines[i].trim().startsWith("|")) {
                        rows += splitRow(lines[i].trim()); i++
                    }
                    blocks += Block.Table(headers, rows)
                }
                trimmed.startsWith("> ") || trimmed == ">" -> {
                    flushParagraph()
                    val quote = StringBuilder()
                    while (i < lines.size && lines[i].trim().startsWith(">")) {
                        quote.appendLine(lines[i].trim().removePrefix(">").trim()); i++
                    }
                    blocks += Block.Quote(quote.toString().trim())
                }
                trimmed.matches(Regex("([-*+] )\\S.*")) || trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                    flushParagraph()
                    val items = mutableListOf<String>()
                    while (i < lines.size && lines[i].trim().matches(Regex("[-*+] .*"))) {
                        items += lines[i].trim().substring(2).trim(); i++
                    }
                    blocks += Block.Bullets(items)
                }
                trimmed.matches(Regex("\\d+[.)] .*")) -> {
                    flushParagraph()
                    val items = mutableListOf<String>()
                    while (i < lines.size && lines[i].trim().matches(Regex("\\d+[.)] .*"))) {
                        items += lines[i].trim().replace(Regex("^\\d+[.)] "), ""); i++
                    }
                    blocks += Block.Numbered(items)
                }
                trimmed.isEmpty() -> { flushParagraph(); i++ }
                else -> {
                    if (paragraph.isNotEmpty()) paragraph.append('\n')
                    paragraph.append(line.trim())
                    i++
                }
            }
        }
        flushParagraph()
        return blocks
    }

    private fun splitRow(row: String): List<String> =
        row.trim().trim('|').split('|').map { it.trim() }
}

/** 行内样式切分：**粗体**、`代码`、普通文本。 */
object InlineParser {
    sealed interface Span {
        data class Text(val value: String) : Span
        data class Bold(val value: String) : Span
        data class Code(val value: String) : Span
    }

    fun parse(text: String): List<Span> {
        val spans = mutableListOf<Span>()
        var i = 0
        val buf = StringBuilder()
        fun flush() {
            if (buf.isNotEmpty()) { spans += Span.Text(buf.toString()); buf.clear() }
        }
        while (i < text.length) {
            when {
                text.startsWith("**", i) -> {
                    val end = text.indexOf("**", i + 2)
                    if (end > i) { flush(); spans += Span.Bold(text.substring(i + 2, end)); i = end + 2 }
                    else { buf.append(text[i]); i++ }
                }
                text[i] == '`' -> {
                    val end = text.indexOf('`', i + 1)
                    if (end > i) { flush(); spans += Span.Code(text.substring(i + 1, end)); i = end + 1 }
                    else { buf.append(text[i]); i++ }
                }
                else -> { buf.append(text[i]); i++ }
            }
        }
        flush()
        return spans
    }
}

/** 教程 ↔ 工具互链：从正文提取工具编号（N-xx / G-xx）。 */
object ToolLinkExtractor {
    private val PATTERN = Regex("(?<![A-Z0-9])[NG]-\\d{2}(?![0-9])")
    fun extract(text: String): List<String> =
        PATTERN.findAll(text).map { it.value }.distinct().toList()
}
