package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** SSH 服务端配置生成器（N-06）：表单 → sshd_config 片段；认证方式全关时直接报错（照 Web 版互斥校验）。 */
object SshdLogic {
    fun generate(
        port: Int, permitRoot: String, passwordAuth: Boolean, pubkeyAuth: Boolean,
        allowUsers: String, maxAuthTries: Int,
    ): AppResult<String> {
        if (port !in 1..65535) return fail("端口必须在 1..65535")
        if (permitRoot !in listOf("yes", "no", "prohibit-password", "forced-commands-only")) {
            return fail("PermitRootLogin 取值不合法")
        }
        if (!passwordAuth && !pubkeyAuth) {
            return fail("密码与密钥认证不能同时关闭，否则无人能登录")
        }
        if (maxAuthTries !in 1..10) return fail("MaxAuthTries 建议在 1..10")
        val lines = mutableListOf(
            "Port $port",
            "PermitRootLogin $permitRoot",
            "PasswordAuthentication ${if (passwordAuth) "yes" else "no"}",
            "PubkeyAuthentication ${if (pubkeyAuth) "yes" else "no"}",
            "MaxAuthTries $maxAuthTries",
            "X11Forwarding no",
        )
        if (allowUsers.isNotBlank()) lines += "AllowUsers $allowUsers"
        lines += "# 改完先用 sshd -t 校验，再 reload：sudo sshd -t && sudo systemctl reload ssh"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
