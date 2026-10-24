package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** SSH 命令生成器（编号外）：拼装 ssh/scp 命令，参数做 shell 单引号转义。 */
object SshCommandLogic {
    fun shellQuote(value: String): String =
        "'" + value.replace("'", "'\\''") + "'"

    fun ssh(
        user: String, host: String, port: Int, keyPath: String,
        jump: String, remoteCommand: String,
    ): AppResult<String> {
        if (host.isBlank() || host.any { it.isWhitespace() }) return fail("主机不能为空且不能含空白")
        if (port !in 1..65535) return fail("端口必须在 1..65535")
        val sb = StringBuilder("ssh")
        if (port != 22) sb.append(" -p ").append(port)
        if (keyPath.isNotBlank()) sb.append(" -i ").append(shellQuote(keyPath))
        if (jump.isNotBlank()) sb.append(" -J ").append(jump)
        sb.append(' ')
        sb.append(if (user.isBlank()) host else "$user@$host")
        if (remoteCommand.isNotBlank()) sb.append(' ').append(shellQuote(remoteCommand))
        return AppResult.Success(sb.toString())
    }

    fun configSnippet(alias: String, user: String, host: String, port: Int, keyPath: String): AppResult<String> {
        if (alias.isBlank() || alias.any { it.isWhitespace() }) return fail("别名不能为空且不能含空白")
        if (host.isBlank()) return fail("主机不能为空")
        val lines = mutableListOf("Host $alias", "    HostName $host")
        if (user.isNotBlank()) lines += "    User $user"
        if (port != 22) lines += "    Port $port"
        if (keyPath.isNotBlank()) lines += "    IdentityFile $keyPath"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
