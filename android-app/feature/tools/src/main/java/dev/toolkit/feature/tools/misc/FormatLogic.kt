package dev.toolkit.feature.tools.misc

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * N-04 格式校验与转换（子集）：JSON <-> YAML 互转。
 * 子集口径照 Web 版成文限制：支持对象/数组/字符串/数字/布尔/null 的嵌套结构；
 * YAML 侧只认 2 空格缩进、标量与「- 」列表，不支持锚点/多行字符串/流式集合，超子集明确报错。
 */
object FormatLogic {

    sealed interface Node {
        data class Obj(val entries: List<Pair<String, Node>>) : Node
        data class Arr(val items: List<Node>) : Node
        data class Str(val value: String) : Node
        data class Num(val raw: String) : Node
        data class Bool(val value: Boolean) : Node
        data object Null : Node
    }

    // ---------- JSON 解析（手写子集解析器） ----------
    fun parseJson(text: String): AppResult<Node> {
        val parser = JsonParser(text)
        return try {
            val node = parser.parseValue()
            parser.skipWs()
            if (!parser.atEnd()) fail("JSON 尾部有多余内容")
            else AppResult.Success(node)
        } catch (e: JsonException) {
            fail("JSON 不合法：${e.message}")
        }
    }

    private class JsonException(msg: String) : Exception(msg)

    private class JsonParser(private val s: String) {
        var pos = 0
        fun atEnd() = pos >= s.length
        fun skipWs() { while (pos < s.length && s[pos] in " \t\r\n") pos++ }
        private fun peek(): Char {
            skipWs()
            if (pos >= s.length) throw JsonException("意外结束")
            return s[pos]
        }
        fun parseValue(): Node = when (val c = peek()) {
            '{' -> parseObj()
            '[' -> parseArr()
            '"' -> Node.Str(parseString())
            't' -> { expect("true"); Node.Bool(true) }
            'f' -> { expect("false"); Node.Bool(false) }
            'n' -> { expect("null"); Node.Null }
            else -> {
                if (c == '-' || c.isDigit()) parseNumber()
                else throw JsonException("位置 $pos 出现意外字符 '$c'")
            }
        }
        private fun expect(word: String) {
            if (!s.regionMatches(pos, word, 0, word.length)) throw JsonException("位置 $pos 期望 $word")
            pos += word.length
        }
        private fun parseObj(): Node {
            pos++ // {
            val entries = mutableListOf<Pair<String, Node>>()
            if (peek() == '}') { pos++; return Node.Obj(entries) }
            while (true) {
                if (peek() != '"') throw JsonException("对象键必须是字符串（位置 $pos）")
                val key = parseString()
                if (peek() != ':') throw JsonException("对象键后缺 ':'（位置 $pos）")
                pos++
                entries += key to parseValue()
                when (peek()) {
                    ',' -> pos++
                    '}' -> { pos++; return Node.Obj(entries) }
                    else -> throw JsonException("对象内缺 ',' 或 '}'（位置 $pos）")
                }
            }
        }
        private fun parseArr(): Node {
            pos++ // [
            val items = mutableListOf<Node>()
            if (peek() == ']') { pos++; return Node.Arr(items) }
            while (true) {
                items += parseValue()
                when (peek()) {
                    ',' -> pos++
                    ']' -> { pos++; return Node.Arr(items) }
                    else -> throw JsonException("数组内缺 ',' 或 ']'（位置 $pos）")
                }
            }
        }
        private fun parseString(): String {
            pos++ // "
            val sb = StringBuilder()
            while (true) {
                if (pos >= s.length) throw JsonException("字符串未闭合")
                when (val c = s[pos++]) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        if (pos >= s.length) throw JsonException("转义未闭合")
                        when (val e = s[pos++]) {
                            'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r')
                            'b' -> sb.append('\b'); 'f' -> sb.append('')
                            '/' -> sb.append('/'); '\\' -> sb.append('\\'); '"' -> sb.append('"')
                            'u' -> {
                                if (pos + 4 > s.length) throw JsonException("\\u 转义不完整")
                                val hex = s.substring(pos, pos + 4)
                                sb.append(hex.toIntOrNull(16)?.toChar() ?: throw JsonException("\\u 转义不合法"))
                                pos += 4
                            }
                            else -> throw JsonException("未知转义 \\$e")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }
        private fun parseNumber(): Node {
            val start = pos
            if (s[pos] == '-') pos++
            while (pos < s.length && (s[pos].isDigit() || s[pos] in ".eE+-")) pos++
            val raw = s.substring(start, pos)
            raw.toDoubleOrNull() ?: throw JsonException("数字不合法：$raw")
            return Node.Num(raw)
        }
    }

    fun toJson(node: Node, indent: Int = 0): String {
        val pad = "  ".repeat(indent)
        val childPad = "  ".repeat(indent + 1)
        return when (node) {
            is Node.Obj -> if (node.entries.isEmpty()) "{}" else buildString {
                append("{\n")
                node.entries.forEachIndexed { i, (k, v) ->
                    append(childPad).append(jsonString(k)).append(": ").append(toJson(v, indent + 1))
                    if (i < node.entries.size - 1) append(",")
                    append("\n")
                }
                append(pad).append("}")
            }
            is Node.Arr -> if (node.items.isEmpty()) "[]" else buildString {
                append("[\n")
                node.items.forEachIndexed { i, v ->
                    append(childPad).append(toJson(v, indent + 1))
                    if (i < node.items.size - 1) append(",")
                    append("\n")
                }
                append(pad).append("]")
            }
            is Node.Str -> jsonString(node.value)
            is Node.Num -> node.raw
            is Node.Bool -> node.value.toString()
            Node.Null -> "null"
        }
    }

    private fun jsonString(v: String): String = buildString {
        append('"')
        for (c in v) {
            when (c) {
                '"' -> append("\\\""); '\\' -> append("\\\\"); '\n' -> append("\\n")
                '\t' -> append("\\t"); '\r' -> append("\\r")
                else -> append(c)
            }
        }
        append('"')
    }

    // ---------- YAML 发射（子集） ----------
    fun toYaml(node: Node): String {
        val sb = StringBuilder()
        emitYaml(node, 0, sb)
        return sb.toString().trimEnd()
    }

    private fun emitYaml(node: Node, indent: Int, sb: StringBuilder) {
        val pad = "  ".repeat(indent)
        when (node) {
            is Node.Obj -> {
                if (node.entries.isEmpty()) { sb.appendLine("{}"); return }
                for ((k, v) in node.entries) {
                    when (v) {
                        is Node.Obj, is Node.Arr -> {
                            if ((v is Node.Obj && v.entries.isEmpty()) || (v is Node.Arr && v.items.isEmpty())) {
                                sb.appendLine("$pad$k: ${if (v is Node.Obj) "{}" else "[]"}")
                            } else {
                                sb.appendLine("$pad$k:")
                                emitYaml(v, indent + 1, sb)
                            }
                        }
                        else -> sb.appendLine("$pad$k: ${yamlScalar(v)}")
                    }
                }
            }
            is Node.Arr -> {
                if (node.items.isEmpty()) { sb.appendLine("[]"); return }
                for (item in node.items) {
                    when (item) {
                        is Node.Obj, is Node.Arr -> {
                            sb.appendLine("$pad-")
                            emitYaml(item, indent + 1, sb)
                        }
                        else -> sb.appendLine("$pad- ${yamlScalar(item)}")
                    }
                }
            }
            else -> sb.appendLine("$pad${yamlScalar(node)}")
        }
    }

    private fun yamlScalar(node: Node): String = when (node) {
        is Node.Str -> {
            val v = node.value
            if (v.isEmpty() || v.any { it in ":#{}[],&*!|>'\"%@`" } || v.first().isWhitespace() || v.last().isWhitespace() ||
                v in listOf("true", "false", "null", "~") || v.toDoubleOrNull() != null) {
                jsonString(v)
            } else v
        }
        is Node.Num -> node.raw
        is Node.Bool -> node.value.toString()
        Node.Null -> "null"
        else -> throw IllegalStateException("标量位置出现复合节点")
    }

    // ---------- YAML 解析（子集：2 空格缩进映射/列表/标量） ----------
    fun parseYaml(text: String): AppResult<Node> {
        val lines = text.lines().filter { it.isNotBlank() && !it.trimStart().startsWith("#") }
        if (lines.isEmpty()) return AppResult.Success(Node.Obj(emptyList()))
        return try {
            val (node, consumed) = parseYamlBlock(lines, 0, 0)
            if (consumed != lines.size) fail("YAML 第 ${consumed + 1} 行起无法解析（超出子集）")
            else AppResult.Success(node)
        } catch (e: JsonException) {
            fail("YAML 不合法：${e.message}")
        }
    }

    private fun indentOf(line: String): Int {
        var n = 0
        while (n < line.length && line[n] == ' ') n++
        if (n < line.length && line[n] == '\t') throw JsonException("缩进不能用 Tab")
        return n
    }

    private fun parseYamlBlock(lines: List<String>, start: Int, indent: Int): Pair<Node, Int> {
        var i = start
        val first = lines[i].substring(indent)
        if (first.startsWith("- ") || first == "-") {
            val items = mutableListOf<Node>()
            while (i < lines.size && indentOf(lines[i]) == indent &&
                (lines[i].substring(indent).startsWith("- ") || lines[i].substring(indent) == "-")) {
                val content = lines[i].substring(indent).removePrefix("-").trimStart()
                if (content.isEmpty()) {
                    val (child, next) = parseYamlBlock(lines, i + 1, indent + 2)
                    items += child; i = next
                } else if (content.contains(": ") || content.endsWith(":")) {
                    // 行内起一个映射：把该行改写为子块首行再递归
                    val patched = lines.toMutableList()
                    patched[i] = " ".repeat(indent + 2) + content
                    val (child, next) = parseYamlBlock(patched, i, indent + 2)
                    items += child; i = next
                    // patched 已替换原行，后续行号不变
                } else {
                    items += parseYamlScalar(content); i++
                }
            }
            return Node.Arr(items) to i
        }
        // 映射
        val entries = mutableListOf<Pair<String, Node>>()
        while (i < lines.size && indentOf(lines[i]) == indent) {
            val content = lines[i].substring(indent)
            if (content.startsWith("- ") || content == "-") break
            val colon = content.indexOf(":")
            if (colon < 0) throw JsonException("第 ${i + 1} 行缺 ':'")
            val key = content.substring(0, colon).trim().trim('"', '\'')
            val rest = content.substring(colon + 1).trim()
            if (rest.isEmpty()) {
                if (i + 1 < lines.size && indentOf(lines[i + 1]) > indent) {
                    val (child, next) = parseYamlBlock(lines, i + 1, indentOf(lines[i + 1]))
                    entries += key to child; i = next
                } else {
                    entries += key to Node.Null; i++
                }
            } else {
                entries += key to parseYamlScalar(rest); i++
            }
        }
        if (entries.isEmpty()) throw JsonException("第 ${start + 1} 行无法识别结构")
        return Node.Obj(entries) to i
    }

    private fun parseYamlScalar(raw: String): Node {
        val v = raw.trim()
        return when {
            v == "null" || v == "~" -> Node.Null
            v == "true" -> Node.Bool(true)
            v == "false" -> Node.Bool(false)
            v.startsWith("\"") && v.endsWith("\"") && v.length >= 2 ->
                Node.Str((parseJson(v) as? AppResult.Success)?.value?.let { (it as? Node.Str)?.value } ?: v.trim('"'))
            v.startsWith("'") && v.endsWith("'") && v.length >= 2 -> Node.Str(v.substring(1, v.length - 1))
            v.toLongOrNull() != null || v.toDoubleOrNull() != null -> Node.Num(v)
            else -> Node.Str(v)
        }
    }

    fun jsonToYaml(text: String): AppResult<String> =
        when (val r = parseJson(text)) {
            is AppResult.Success -> AppResult.Success(toYaml(r.value))
            is AppResult.Failure -> r
        }

    fun yamlToJson(text: String): AppResult<String> =
        when (val r = parseYaml(text)) {
            is AppResult.Success -> AppResult.Success(toJson(r.value))
            is AppResult.Failure -> r
        }

    fun validateJson(text: String): AppResult<String> =
        when (val r = parseJson(text)) {
            is AppResult.Success -> AppResult.Success("JSON 合法（子集解析通过）")
            is AppResult.Failure -> r
        }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
