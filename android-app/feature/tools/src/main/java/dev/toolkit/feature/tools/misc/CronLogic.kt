package dev.toolkit.feature.tools.misc

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.time.LocalDateTime

/**
 * Cron 工具（承载 N-11）：五字段表达式的校验、中文释义与未来 3 次运行时刻推算。
 * 支持 * , - / 语法；星期 0/7 均表示周日（照 cron 口径）。
 */
object CronLogic {

    data class CronExpr(val minute: String, val hour: String, val dom: String, val month: String, val dow: String)

    fun parse(expression: String): AppResult<CronExpr> {
        val parts = expression.trim().split(Regex("\\s+"))
        if (parts.size != 5) return fail("Cron 表达式须为 5 个字段（分 时 日 月 周）")
        val ranges = listOf(0..59, 0..23, 1..31, 1..12, 0..7)
        for ((idx, field) in parts.withIndex()) {
            validateField(field, ranges[idx])?.let { return fail("第 ${idx + 1} 字段：$it") }
        }
        return AppResult.Success(CronExpr(parts[0], parts[1], parts[2], parts[3], parts[4]))
    }

    private fun validateField(field: String, range: IntRange): String? {
        for (token in field.split(",")) {
            val base = token.substringBefore("/")
            val step = token.substringAfter("/", "")
            if (step.isNotEmpty() && (step.toIntOrNull() ?: 0) <= 0) return "步长须为正整数：$token"
            when {
                base == "*" -> Unit
                base.contains("-") -> {
                    val (a, b) = base.split("-", limit = 2)
                    val ai = a.toIntOrNull() ?: return "数值不合法：$token"
                    val bi = b.toIntOrNull() ?: return "数值不合法：$token"
                    if (ai !in range || bi !in range || ai > bi) return "范围不合法：$token"
                }
                else -> {
                    val v = base.toIntOrNull() ?: return "数值不合法：$token"
                    if (v !in range) return "超出范围 ${range.first}..${range.last}：$token"
                }
            }
        }
        return null
    }

    private fun fieldMatches(field: String, value: Int, min: Int, max: Int, dowMode: Boolean = false): Boolean {
        val target = if (dowMode && value == 7) 0 else value
        return field.split(",").any { token ->
            val base = token.substringBefore("/")
            val step = token.substringAfter("/", "1").toInt().coerceAtLeast(1)
            val candidates: List<Int> = when {
                base == "*" -> (min..max step step).toList()
                base.contains("-") -> {
                    val (a, b) = base.split("-", limit = 2)
                    (a.toInt()..b.toInt() step step).toList()
                }
                else -> listOf(base.toInt())
            }
            candidates.any { raw -> (if (dowMode && raw == 7) 0 else raw) == target }
        }
    }

    fun nextRuns(expr: CronExpr, from: LocalDateTime, count: Int = 3): List<LocalDateTime> {
        val out = mutableListOf<LocalDateTime>()
        var cursor = from.plusMinutes(1).withSecond(0).withNano(0)
        val deadline = from.plusYears(2)
        while (out.size < count && cursor.isBefore(deadline)) {
            val dow = cursor.dayOfWeek.value % 7
            val ok = fieldMatches(expr.minute, cursor.minute, 0, 59) &&
                fieldMatches(expr.hour, cursor.hour, 0, 23) &&
                fieldMatches(expr.dom, cursor.dayOfMonth, 1, 31) &&
                fieldMatches(expr.month, cursor.monthValue, 1, 12) &&
                fieldMatches(expr.dow, dow, 0, 7, dowMode = true)
            if (ok) out += cursor
            cursor = cursor.plusMinutes(1)
        }
        return out
    }

    fun humanize(expr: CronExpr): String {
        fun f(field: String, unit: String, every: String): String = when {
            field == "*" -> every
            field.startsWith("*/") -> "每 ${field.removePrefix("*/")} $unit"
            else -> "在 $field $unit"
        }
        return buildString {
            append(f(expr.minute, "分钟", "每分钟"))
            append("、"); append(f(expr.hour, "时", "每小时"))
            append("、"); append(f(expr.dom, "日", "每日"))
            append("、"); append(f(expr.month, "月", "每月"))
            append("、"); append(f(expr.dow, "（周）", "每天"))
            append(" 执行")
        }
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
