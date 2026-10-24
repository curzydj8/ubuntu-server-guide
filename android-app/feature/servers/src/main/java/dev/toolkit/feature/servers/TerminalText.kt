package dev.toolkit.feature.servers

/**
 * 终端文本处理（纯逻辑）：shell 原始输出含 ANSI 转义与回车改写，
 * 本 App 终端为文本流（实施计划明确边界，不做完整 ANSI 仿真）：
 * 剥离转义序列、\r\n 归一、行内 \r 取最后一段（提示符重绘的常见形态）；
 * 缓冲上限保留尾部（最新输出优先）。
 */
object TerminalText {
    const val MAX_CHARS = 200_000

    private val ansi = Regex("\u001B\\[[0-9;?]*[A-Za-z]|\u001B\\][^\u0007]*\u0007|\u001B[()][0-9A-B]|\u001B[=>#][0-9]?")

    fun strip(chunk: String): String {
        val noEsc = ansi.replace(chunk, "")
        val normalized = noEsc.replace("\r\n", "\n")
        if (!normalized.contains('\r')) return normalized
        val sb = StringBuilder(normalized.length)
        for (line in normalized.split('\n')) {
            sb.append(line.substringAfterLast('\r'))
            sb.append('\n')
        }
        return sb.toString().trimEnd('\n').let { if (normalized.endsWith("\n")) it + "\n" else it }
    }

    fun append(current: String, chunk: String): String {
        val merged = current + strip(chunk)
        return if (merged.length > MAX_CHARS) merged.substring(merged.length - MAX_CHARS) else merged
    }
}
