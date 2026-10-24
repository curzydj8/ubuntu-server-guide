package dev.toolkit.core.common

/** core:sync 内部的最小 JSON 解析器（对象/数组/字符串/数字/布尔/null），够目录与清单用。 */
object MiniJson {
    sealed interface V {
        data class Obj(val map: Map<String, V>) : V
        data class Arr(val items: List<V>) : V
        data class Str(val value: String) : V
        data class Num(val raw: String) : V
        data class Bool(val value: Boolean) : V
        data object Null : V
    }

    fun parse(text: String): V {
        val p = Parser(text)
        val v = p.value()
        p.ws()
        require(p.atEnd()) { "JSON 尾部有多余内容" }
        return v
    }

    private class Parser(private val s: String) {
        var pos = 0
        fun atEnd() = pos >= s.length
        fun ws() { while (pos < s.length && s[pos] in " \t\r\n") pos++ }
        private fun peek(): Char { ws(); require(pos < s.length) { "JSON 意外结束" }; return s[pos] }
        fun value(): V = when (val c = peek()) {
            '{' -> obj(); '[' -> arr(); '"' -> V.Str(str())
            't' -> { lit("true"); V.Bool(true) }
            'f' -> { lit("false"); V.Bool(false) }
            'n' -> { lit("null"); V.Null }
            else -> {
                require(c == '-' || c.isDigit()) { "JSON 位置 $pos 字符非法" }
                num()
            }
        }
        private fun lit(word: String) {
            require(s.regionMatches(pos, word, 0, word.length)) { "JSON 位置 $pos 期望 $word" }
            pos += word.length
        }
        private fun obj(): V {
            pos++
            val map = linkedMapOf<String, V>()
            if (peek() == '}') { pos++; return V.Obj(map) }
            while (true) {
                require(peek() == '"') { "对象键须为字符串" }
                val key = str()
                require(peek() == ':') { "对象缺 ':'" }
                pos++
                map[key] = value()
                when (peek()) {
                    ',' -> pos++
                    '}' -> { pos++; return V.Obj(map) }
                    else -> throw IllegalArgumentException("对象缺 ',' 或 '}'")
                }
            }
        }
        private fun arr(): V {
            pos++
            val items = mutableListOf<V>()
            if (peek() == ']') { pos++; return V.Arr(items) }
            while (true) {
                items += value()
                when (peek()) {
                    ',' -> pos++
                    ']' -> { pos++; return V.Arr(items) }
                    else -> throw IllegalArgumentException("数组缺 ',' 或 ']'")
                }
            }
        }
        private fun str(): String {
            pos++
            val sb = StringBuilder()
            while (true) {
                require(pos < s.length) { "字符串未闭合" }
                when (val c = s[pos++]) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        require(pos < s.length) { "转义未闭合" }
                        when (val e = s[pos++]) {
                            'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r')
                            'b' -> sb.append('\b'); 'f' -> sb.append('')
                            '/', '\\', '"' -> sb.append(e)
                            'u' -> {
                                require(pos + 4 <= s.length) { "\\u 不完整" }
                                sb.append(s.substring(pos, pos + 4).toInt(16).toChar()); pos += 4
                            }
                            else -> throw IllegalArgumentException("未知转义 \\$e")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }
        private fun num(): V {
            val start = pos
            if (s[pos] == '-') pos++
            while (pos < s.length && (s[pos].isDigit() || s[pos] in ".eE+-")) pos++
            val raw = s.substring(start, pos)
            raw.toDoubleOrNull() ?: throw IllegalArgumentException("数字非法：$raw")
            return V.Num(raw)
        }
    }
}
