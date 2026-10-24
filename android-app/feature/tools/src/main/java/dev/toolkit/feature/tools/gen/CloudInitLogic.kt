package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** cloud-init 配置生成器（N-16）：表单 → #cloud-config YAML。 */
object CloudInitLogic {
    fun generate(user: String, sshKey: String, packages: List<String>, timezone: String): AppResult<String> {
        if (!user.matches(Regex("[a-z_][a-z0-9_-]*"))) return fail("用户名不合法（小写字母开头）")
        if (sshKey.isNotBlank() && !sshKey.startsWith("ssh-")) return fail("SSH 公钥应以 ssh- 开头")
        if (timezone.isNotBlank() && !timezone.matches(Regex("[A-Za-z]+/[A-Za-z_]+"))) {
            return fail("时区格式如 Asia/Shanghai")
        }
        val sb = StringBuilder("#cloud-config\n")
        sb.appendLine("users:")
        sb.appendLine("  - name: $user")
        sb.appendLine("    sudo: ALL=(ALL) NOPASSWD:ALL")
        sb.appendLine("    groups: sudo")
        sb.appendLine("    shell: /bin/bash")
        if (sshKey.isNotBlank()) {
            sb.appendLine("    ssh_authorized_keys:")
            sb.appendLine("      - $sshKey")
        }
        if (timezone.isNotBlank()) sb.appendLine("timezone: $timezone")
        val pkgs = packages.filter { it.isNotBlank() }
        if (pkgs.isNotEmpty()) {
            sb.appendLine("package_update: true")
            sb.appendLine("packages:")
            pkgs.forEach { sb.appendLine("  - $it") }
        }
        sb.appendLine("ssh_pwauth: false")
        return AppResult.Success(sb.toString().trimEnd())
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
