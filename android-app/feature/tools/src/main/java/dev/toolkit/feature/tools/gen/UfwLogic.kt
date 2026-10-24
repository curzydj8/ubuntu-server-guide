package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * UFW 规则生成器（编号外）：SSH 恒先放行并给出锁门警告；端口与来源校验照 Web 版（含 P0-1 的 IPv6 来源）。
 */
object UfwLogic {
    private val SERVICES = mapOf(
        "ssh" to "22/tcp", "http" to "80/tcp", "https" to "443/tcp",
        "mysql" to "3306/tcp", "postgres" to "5432/tcp", "redis" to "6379/tcp",
    )

    fun generate(services: List<String>, customPorts: List<String>, source: String): AppResult<String> {
        val lines = mutableListOf<String>()
        lines += "# 1) 先放行 SSH，避免改规则时把自己锁在门外"
        val ordered = mutableListOf<String>()
        if ("ssh" in services) ordered += "ssh"
        ordered += services.filter { it != "ssh" }
        for (svc in ordered) {
            val target = SERVICES[svc] ?: return fail("未知服务：$svc（可选 ${SERVICES.keys.joinToString("/")}）")
            lines += rule(target, source)
            if (svc in listOf("mysql", "postgres", "redis")) {
                lines += "# 警告：数据库端口不应直接对全网开放，务必配合来源限制"
            }
        }
        for (p in customPorts) {
            if (!p.matches(Regex("\\d{1,5}(/(tcp|udp))?"))) return fail("端口格式不合法：$p（如 8080/tcp）")
            val num = p.substringBefore("/").toInt()
            if (num !in 1..65535) return fail("端口超出范围：$p")
            lines += rule(p, source)
        }
        lines += "# 2) 设定默认策略并启用"
        lines += "sudo ufw default deny incoming"
        lines += "sudo ufw default allow outgoing"
        lines += "sudo ufw enable"
        lines += "sudo ufw status verbose"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun rule(target: String, source: String): String =
        if (source.isBlank()) "sudo ufw allow $target"
        else "sudo ufw allow from $source to any port ${target.substringBefore("/")} proto ${target.substringAfter("/", "tcp")}"

    fun validateSource(source: String): AppResult<Unit> {
        if (source.isBlank()) return AppResult.Success(Unit)
        val ok = if (source.contains(':')) {
            // IPv6 CIDR：粗校验前缀与地址形态（细校验与子网工具同源口径）
            val parts = source.split("/")
            parts.size == 2 && (parts[1].toIntOrNull() ?: -1) in 0..128 &&
                dev.toolkit.feature.tools.subnet.Ipv6Format.expand(parts[0]) is AppResult.Success
        } else {
            dev.toolkit.feature.tools.subnet.SubnetLogic.ipv4(
                if (source.contains('/')) source else "$source/32"
            ) is AppResult.Success
        }
        return if (ok) AppResult.Success(Unit) else fail("来源地址/CIDR 不合法：$source")
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
