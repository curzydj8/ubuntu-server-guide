package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** systemd Unit 生成器（编号外）与 Timer 生成器（N-08）。 */
object SystemdLogic {

    fun unit(
        description: String, execStart: String, user: String,
        workingDirectory: String, restart: String, afterNetwork: Boolean,
    ): AppResult<String> {
        if (description.isBlank()) return fail("Description 不能为空")
        if (execStart.isBlank() || !execStart.trimStart().startsWith("/")) {
            return fail("ExecStart 必须为绝对路径命令")
        }
        if (restart !in listOf("no", "on-failure", "always", "on-success")) {
            return fail("Restart 取值不合法")
        }
        val lines = mutableListOf("[Unit]", "Description=$description")
        if (afterNetwork) lines += "After=network.target"
        lines += ""
        lines += "[Service]"
        lines += "ExecStart=$execStart"
        if (user.isNotBlank()) lines += "User=$user"
        if (workingDirectory.isNotBlank()) lines += "WorkingDirectory=$workingDirectory"
        lines += "Restart=$restart"
        lines += ""
        lines += "[Install]"
        lines += "WantedBy=multi-user.target"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private val ONCALENDAR_CHARS = Regex("[A-Za-z0-9*:.,/\\- ]+")

    fun timer(unitName: String, onCalendar: String, persistent: Boolean): AppResult<String> {
        if (!unitName.matches(Regex("[A-Za-z0-9_.-]+"))) return fail("单元名不合法")
        val oc = onCalendar.trim()
        if (oc.isEmpty() || !oc.matches(ONCALENDAR_CHARS)) return fail("OnCalendar 含非法字符")
        val lines = mutableListOf(
            "[Unit]",
            "Description=Timer for $unitName",
            "",
            "[Timer]",
            "OnCalendar=$oc",
            "Persistent=${if (persistent) "true" else "false"}",
            "Unit=$unitName.service",
            "",
            "[Install]",
            "WantedBy=timers.target",
            "# 启用：sudo systemctl enable --now $unitName.timer；校验表达式：systemd-analyze calendar \"$oc\"",
        )
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
