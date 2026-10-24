package dev.toolkit.feature.tools.misc

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.util.regex.Pattern
import java.util.regex.PatternSyntaxException

/**
 * N-24 正则表达式测试器：基于 java.util.regex。
 * 与 Web 版（ECMAScript）差异须知：不支持 (?<name>) 之外的 JS 独有写法差异、\d 仅 ASCII（同 JS）、
 * Unicode 属性用 \p{...}；本工具在结果中固定给出差异提醒。另对灾难性回溯形态做启发式预警
 * （匹配本身运行在调用方给定的文本上，超长文本请先截断）。
 */
object RegexLogic {
    data class Match(val index: Int, val text: String, val groups: List<String?>)
    data class Result(val matches: List<Match>, val warnings: List<String>)

    private val DANGER_PATTERNS = listOf(
        Regex("""\([^)]*[+*][^)]*\)[+*]"""),      // (a+)+ 型嵌套量词
        Regex("""\([^)]*\|[^)]*\)[+*]"""),          // (a|a)+ 型交替加量词
    )

    fun test(pattern: String, text: String, ignoreCase: Boolean): AppResult<Result> {
        if (text.length > 100_000) {
            return AppResult.Failure(AppError.Validation("文本过长（上限 100000 字符），请截断"))
        }
        val compiled = try {
            Pattern.compile(pattern, if (ignoreCase) Pattern.CASE_INSENSITIVE else 0)
        } catch (e: PatternSyntaxException) {
            return AppResult.Failure(AppError.Validation("正则不合法：${e.description}（位置 ${e.index}）"))
        }
        val warnings = mutableListOf(
            "语义提醒：本工具为 Java 正则，与 Web 版 ECMAScript 语义存在差异（如 \\p{} Unicode 属性、命名组 (?<n>) 语法）"
        )
        if (DANGER_PATTERNS.any { it.containsMatchIn(pattern) }) {
            warnings += "回溯风险：模式含嵌套量词形态，在不匹配的长文本上可能指数级耗时"
        }
        val matcher = compiled.matcher(text)
        val matches = mutableListOf<Match>()
        var guard = 0
        while (matcher.find() && guard < 1000) {
            guard++
            val groups = (1..matcher.groupCount()).map { g ->
                try { matcher.group(g) } catch (e: Exception) { null }
            }
            matches += Match(matcher.start(), matcher.group(), groups)
            if (matcher.start() == matcher.end()) {
                if (matcher.end() >= text.length) break
                matcher.region(matcher.end() + 1, text.length)
            }
        }
        return AppResult.Success(Result(matches, warnings))
    }

    private fun failSafe(msg: String) = AppError.Validation(msg)
}
