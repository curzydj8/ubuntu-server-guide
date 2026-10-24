package dev.toolkit.feature.tools.version

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * N-27 版本号比较器：Debian 版本序（epoch:upstream-revision），与 Web 版规格一致。
 * 比较规则照 dpkg：数字段按数值、非数字段按 ASCII 且 ~ 排在一切之前（含结尾）。
 */
object VersionLogic {

    data class DebVersion(val epoch: Int, val upstream: String, val revision: String)

    fun parse(raw: String): AppResult<DebVersion> {
        val s = raw.trim()
        if (s.isEmpty()) return fail("版本号不能为空")
        var rest = s
        var epoch = 0
        val colon = s.indexOf(':')
        if (colon >= 0) {
            val e = s.substring(0, colon)
            epoch = e.toIntOrNull() ?: return fail("epoch 必须是整数")
            if (epoch < 0) return fail("epoch 不能为负")
            rest = s.substring(colon + 1)
        }
        val dash = rest.lastIndexOf('-')
        val upstream = if (dash >= 0) rest.substring(0, dash) else rest
        val revision = if (dash >= 0) rest.substring(dash + 1) else "0"
        if (upstream.isEmpty() || !upstream.first().isDigit()) return fail("上游版本必须以数字开头")
        if (upstream.any { !(it.isLetterOrDigit() || it in ".+~") } || revision.any { !(it.isLetterOrDigit() || it in ".+~") }) {
            return fail("版本只允许字母、数字与 . + ~ -")
        }
        return AppResult.Success(DebVersion(epoch, upstream, revision))
    }

    /** 返回负/零/正：a 小于/等于/大于 b。 */
    fun compare(a: DebVersion, b: DebVersion): Int {
        if (a.epoch != b.epoch) return a.epoch.compareTo(b.epoch)
        val up = comparePart(a.upstream, b.upstream)
        if (up != 0) return up
        return comparePart(a.revision, b.revision)
    }

    fun compareStrings(a: String, b: String): AppResult<Int> {
        val va = parse(a); if (va is AppResult.Failure) return va
        val vb = parse(b); if (vb is AppResult.Failure) return vb
        return AppResult.Success(compare((va as AppResult.Success).value, (vb as AppResult.Success).value))
    }

    internal fun comparePart(a: String, b: String): Int {
        var i = 0; var j = 0
        while (i < a.length || j < b.length) {
            // 非数字段
            var diff = 0
            while ((i < a.length && !a[i].isDigit()) || (j < b.length && !b[j].isDigit())) {
                val ac = if (i < a.length) order(a[i]) else 0
                val bc = if (j < b.length) order(b[j]) else 0
                if (ac != bc) { diff = ac - bc; break }
                i++; j++
            }
            if (diff != 0) return diff
            // 跳过前导零后比数字段：先比长度再比字典序
            while (i < a.length && a[i] == '0') i++
            while (j < b.length && b[j] == '0') j++
            var firstDiff = 0
            while (i < a.length && j < b.length && a[i].isDigit() && b[j].isDigit()) {
                if (firstDiff == 0) firstDiff = a[i] - b[j]
                i++; j++
            }
            when {
                i < a.length && a[i].isDigit() -> return 1
                j < b.length && b[j].isDigit() -> return -1
                firstDiff != 0 -> return firstDiff
            }
        }
        return 0
    }

    private fun order(c: Char): Int = when {
        c == '~' -> -1
        c.isLetter() -> c.code
        else -> c.code + 256
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
