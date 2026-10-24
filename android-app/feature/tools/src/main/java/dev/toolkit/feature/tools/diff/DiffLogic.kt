package dev.toolkit.feature.tools.diff

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * N-26 配置差异比较器：行级 LCS diff。上限照 Web 版：每侧 ≤5000 行、LCS 乘积 ≤ 4,000,000，
 * 超限明确报错，不做静默截断。
 */
object DiffLogic {
    const val MAX_LINES = 5000
    const val MAX_PRODUCT = 4_000_000L

    enum class Kind { EQUAL, ADD, DEL }
    data class Line(val kind: Kind, val text: String)
    data class DiffResult(val lines: List<Line>, val added: Int, val deleted: Int, val unchanged: Int)

    fun diff(left: String, right: String): AppResult<DiffResult> {
        val a = left.split("\n")
        val b = right.split("\n")
        if (a.size > MAX_LINES || b.size > MAX_LINES) {
            return AppResult.Failure(AppError.Validation("每侧最多 $MAX_LINES 行"))
        }
        if (a.size.toLong() * b.size.toLong() > MAX_PRODUCT) {
            return AppResult.Failure(AppError.Validation("内容过大（行数乘积超上限），请分段比较"))
        }
        val n = a.size; val m = b.size
        val dp = Array(n + 1) { IntArray(m + 1) }
        for (i in n - 1 downTo 0) {
            for (j in m - 1 downTo 0) {
                dp[i][j] = if (a[i] == b[j]) dp[i + 1][j + 1] + 1 else maxOf(dp[i + 1][j], dp[i][j + 1])
            }
        }
        val out = mutableListOf<Line>()
        var i = 0; var j = 0
        while (i < n && j < m) {
            when {
                a[i] == b[j] -> { out += Line(Kind.EQUAL, a[i]); i++; j++ }
                dp[i + 1][j] >= dp[i][j + 1] -> { out += Line(Kind.DEL, a[i]); i++ }
                else -> { out += Line(Kind.ADD, b[j]); j++ }
            }
        }
        while (i < n) { out += Line(Kind.DEL, a[i]); i++ }
        while (j < m) { out += Line(Kind.ADD, b[j]); j++ }
        return AppResult.Success(
            DiffResult(
                lines = out,
                added = out.count { it.kind == Kind.ADD },
                deleted = out.count { it.kind == Kind.DEL },
                unchanged = out.count { it.kind == Kind.EQUAL },
            )
        )
    }

    fun render(result: DiffResult): List<String> = buildList {
        add("新增 ${result.added} 行 · 删除 ${result.deleted} 行 · 未变 ${result.unchanged} 行")
        result.lines.forEach {
            add(
                when (it.kind) {
                    Kind.EQUAL -> "  ${it.text}"
                    Kind.ADD -> "+ ${it.text}"
                    Kind.DEL -> "- ${it.text}"
                }
            )
        }
    }
}
