package dev.toolkit.core.ssh

/** 命令风险等级：执行前展示，高风险必须二次确认（任务书护栏）。 */
enum class RiskLevel(val label: String) {
    READ_ONLY("只读"), NORMAL("一般"), HIGH("高风险"),
}

/**
 * 风险分级：保守策略——命中破坏性模式即 HIGH；sudo 一律至少 HIGH；
 * 已知只读命令为 READ_ONLY；其余 NORMAL。分级只做提示与确认门，不代替用户判断。
 */
object CommandRisk {
    private val highPatterns = listOf(
        Regex("""\brm\b"""), Regex("""\bdd\b"""), Regex("""\bmkfs\b"""),
        Regex("""\bshutdown\b"""), Regex("""\breboot\b"""), Regex("""\bpoweroff\b"""),
        Regex("""\bkill(all)?\b"""), Regex("""\buser(add|del|mod)\b"""), Regex("""\bpasswd\b"""),
        Regex("""\b(iptables|nft)\b"""), Regex("""\b(umount|mount)\b"""),
        Regex("""\bapt(-get)?\s+(remove|purge|autoremove)"""),
        Regex("""\bdocker\s+(rm|stop|kill|prune|rmi)"""),
        Regex("""\bsystemctl\s+(stop|restart|disable|mask|kill)"""),
        Regex("""\bchmod\s+(-R\s+)?777\b"""), Regex("""\bchown\s+-R\b"""),
        Regex(""">\s*/dev/(sd|nvme|disk)"""), Regex("""\b(curl|wget)\b[^|]*\|\s*(sh|bash)"""),
        Regex("""\b(fdisk|parted|wipefs|shred)\b"""), Regex("""\btruncate\s+-s\s*0"""),
    )
    private val readOnlyHeads = setOf(
        "ls", "cat", "head", "tail", "df", "du", "free", "uptime", "ps", "ss", "netstat",
        "uname", "hostname", "id", "whoami", "pwd", "echo", "date", "lscpu", "lsblk",
        "systemctl status", "systemctl is-active", "systemctl is-enabled", "systemctl --failed", "journalctl",
        "ip a", "ip addr", "ip route", "ping", "dig", "nslookup", "env", "printenv",
        "grep", "find", "stat", "file", "wc", "sort", "uniq", "awk", "sed -n",
    )

    fun assess(command: String): RiskLevel {
        val cmd = command.trim()
        if (cmd.isEmpty()) return RiskLevel.NORMAL
        if (Regex("""(^|\s)sudo\b""").containsMatchIn(cmd)) return RiskLevel.HIGH
        if (highPatterns.any { it.containsMatchIn(cmd) }) return RiskLevel.HIGH
        val head = cmd.split(Regex("""\s+"""), limit = 3).joinToString(" ")
        if (readOnlyHeads.any { head == it || head.startsWith("$it ") || cmd.startsWith(it) } &&
            !cmd.contains("|") && !cmd.contains(">") && !cmd.contains(";") && !cmd.contains("&&")
        ) return RiskLevel.READ_ONLY
        if (cmd.contains("|") || cmd.contains(";") || cmd.contains("&&") || cmd.contains(">")) return RiskLevel.NORMAL
        return RiskLevel.NORMAL
    }

    fun requiresConfirmation(level: RiskLevel): Boolean = level == RiskLevel.HIGH
}
