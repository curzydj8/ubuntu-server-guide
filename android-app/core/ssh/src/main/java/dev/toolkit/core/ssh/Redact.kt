package dev.toolkit.core.ssh

/**
 * 日志/审计脱敏：审计与日志禁止记录密码、私钥、令牌（任务书安全要求）。
 * 显式传入的机密值逐一替换；再兜底处理 password=、Bearer、PEM 私钥块等常见形态。
 */
object Redact {
    private const val MASK = "***"
    private val kvPattern = Regex("""(?i)(password|passwd|token|secret|api[-_]?key)(\s*[:=]\s*)\S+""")
    private val bearerPattern = Regex("""(?i)Bearer\s+\S+""")
    private val pemPattern = Regex(
        """-----BEGIN[^-]*PRIVATE KEY-----.*?-----END[^-]*PRIVATE KEY-----""",
        RegexOption.DOT_MATCHES_ALL,
    )

    fun text(input: String, vararg secrets: String): String {
        var out = input
        secrets.filter { it.isNotBlank() }.forEach { out = out.replace(it, MASK) }
        out = pemPattern.replace(out, MASK)
        out = bearerPattern.replace(out, "Bearer $MASK")
        out = kvPattern.replace(out) { m -> "${m.groupValues[1]}${m.groupValues[2]}$MASK" }
        return out
    }
}
