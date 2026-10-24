package dev.toolkit.feature.tools.analyze

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import dev.toolkit.feature.tools.ToolOutput

/** B 类本地分析器集合：全部粘贴即分析、不落盘、不外发；敏感值绝不回显。 */
object Analyzers {

    private const val MAX_LINES = 2000
    private fun linesOf(text: String): AppResult<List<String>> {
        val lines = text.lines().filter { it.isNotBlank() }
        if (lines.isEmpty()) return AppResult.Failure(AppError.Validation("内容为空"))
        if (lines.size > MAX_LINES) return AppResult.Failure(AppError.Validation("内容超过 $MAX_LINES 行上限"))
        return AppResult.Success(lines)
    }
    private fun ok(lines: List<String>) = AppResult.Success(ToolOutput(lines))

    // ---------- N-12：Docker Compose 安全审查 ----------
    fun composeReview(input: String): AppResult<ToolOutput> {
        val lines = when (val r = linesOf(input)) {
            is AppResult.Success -> r.value
            is AppResult.Failure -> return r
        }
        val findings = mutableListOf<String>()
        lines.forEachIndexed { idx, raw ->
            val line = raw.trim()
            val n = idx + 1
            when {
                line.matches(Regex("privileged:\\s*true")) ->
                    findings += "[高] 第 $n 行：privileged: true 等于完整宿主机权限，非必要不要用"
                line.matches(Regex("network_mode:\\s*host")) ->
                    findings += "[中] 第 $n 行：network_mode: host 与宿主机共享网络命名空间"
                line.matches(Regex("user:\\s*[\"']?(root|0)[\"']?")) ->
                    findings += "[中] 第 $n 行：显式以 root 运行，建议改为非 root 用户"
                line.contains("/var/run/docker.sock") ->
                    findings += "[高] 第 $n 行：挂载 docker.sock 等于宿主机 root 权限"
                line.matches(Regex("cap_add:\\s*.*")) || line.matches(Regex("-\\s*(SYS_ADMIN|ALL|NET_ADMIN)")) ->
                    findings += "[中] 第 $n 行：cap_add 含高权能力（SYS_ADMIN/ALL/NET_ADMIN），请确认必要性"
                Regex("image:\\s*(\\S+)").find(line)?.let { m ->
                    val image = m.groupValues[1]
                    if (!image.contains(":") || image.endsWith(":latest")) {
                        findings += "[低] 第 $n 行：镜像未固定版本（$image），建议固定到具体标签或摘要"
                    }
                    null
                } != null -> Unit
                Regex("(?i)(password|passwd|secret|token)\\s*[:=]\\s*\\S+").containsMatchIn(line) &&
                    !line.contains("\${") ->
                    findings += "[高] 第 $n 行：疑似明文密钥写在 Compose 中（值不回显），请改用 .env/secret 管理"
            }
        }
        if (!lines.any { it.trim().startsWith("user:") }) {
            findings += "[提示] 未见 user: 配置：服务默认以容器内 root 运行，建议显式指定非 root 用户"
        }
        if (findings.isEmpty()) findings += "未发现清单内风险项（审查范围：privileged/host 网络/docker.sock/高权 cap/镜像版本/明文密钥/root 用户）"
        return ok(listOf("Compose 安全审查（共 ${lines.size} 行）：") + findings)
    }

    // ---------- N-15：日志分析 ----------
    fun logAnalyze(input: String): AppResult<ToolOutput> {
        val lines = when (val r = linesOf(input)) {
            is AppResult.Success -> r.value
            is AppResult.Failure -> return r
        }
        val levels = linkedMapOf("ERROR" to 0, "WARN" to 0, "INFO" to 0, "DEBUG" to 0, "FATAL" to 0)
        val ipCounts = mutableMapOf<String, Int>()
        val errorSamples = mutableListOf<String>()
        val ipRegex = Regex("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b")
        for (line in lines) {
            val upper = line.uppercase()
            for (level in levels.keys) {
                if (Regex("\\b$level\\b").containsMatchIn(upper)) {
                    levels[level] = levels.getValue(level) + 1
                    break
                }
            }
            ipRegex.findAll(line).forEach { ipCounts.merge(it.value, 1, Int::plus) }
            if (upper.contains("ERROR") || upper.contains("FATAL")) {
                if (errorSamples.size < 5) errorSamples += line.take(160)
            }
        }
        val out = mutableListOf("日志分析（共 ${lines.size} 行）：")
        out += "级别计数：" + levels.entries.joinToString("，") { "${it.key} ${it.value}" }
        val topIps = ipCounts.entries.sortedByDescending { it.value }.take(5)
        if (topIps.isNotEmpty()) {
            out += "出现最多的 IP：" + topIps.joinToString("，") { "${it.key}×${it.value}" }
        }
        if (errorSamples.isNotEmpty()) {
            out += "错误样本（最多 5 条，截断显示）："
            errorSamples.forEach { out += "  $it" }
        } else {
            out += "未发现 ERROR/FATAL 行"
        }
        return ok(out)
    }

    // ---------- N-23：SSH 日志（auth.log）分析 ----------
    fun sshLogAnalyze(input: String): AppResult<ToolOutput> {
        val lines = when (val r = linesOf(input)) {
            is AppResult.Success -> r.value
            is AppResult.Failure -> return r
        }
        val failIp = mutableMapOf<String, Int>()
        val failUser = mutableMapOf<String, Int>()
        var failed = 0
        var accepted = 0
        var invalidUser = 0
        val failRegex = Regex("Failed (?:password|publickey) for (?:invalid user )?(\\S+) from (\\d+\\.\\d+\\.\\d+\\.\\d+)")
        val okRegex = Regex("Accepted (?:password|publickey) for (\\S+) from (\\d+\\.\\d+\\.\\d+\\.\\d+)")
        for (line in lines) {
            failRegex.find(line)?.let { m ->
                failed++
                failUser.merge(m.groupValues[1], 1, Int::plus)
                failIp.merge(m.groupValues[2], 1, Int::plus)
            }
            if (okRegex.containsMatchIn(line)) accepted++
            if (line.contains("Invalid user")) invalidUser++
        }
        val risk = when {
            failed >= 100 -> "高风险：失败次数 ≥100，建议立即封禁主要来源 IP、禁用密码登录改密钥、检查成功登录记录"
            failed >= 10 -> "注意：存在持续尝试，建议启用 fail2ban 并核对来源"
            failed > 0 -> "观察：少量失败在公网暴露的 SSH 上常见，先观察并确认无异常成功登录"
            else -> "未发现失败登录记录"
        }
        val out = mutableListOf(
            "SSH 日志分析（共 ${lines.size} 行）：",
            "登录失败 $failed 次；登录成功 $accepted 次；无效用户名尝试 $invalidUser 次",
            "风险评级：$risk",
        )
        val topIp = failIp.entries.sortedByDescending { it.value }.take(5)
        if (topIp.isNotEmpty()) out += "失败来源 IP（前 5）：" + topIp.joinToString("，") { "${it.key}×${it.value}" }
        val topUser = failUser.entries.sortedByDescending { it.value }.take(5)
        if (topUser.isNotEmpty()) out += "被尝试用户名（前 5）：" + topUser.joinToString("，") { "${it.key}×${it.value}" }
        return ok(out)
    }

    // ---------- N-18：APT 源检查与版本固定 ----------
    fun aptHelper(sources: String, pinPackage: String, pinVersion: String): AppResult<ToolOutput> {
        val lines = when (val r = linesOf(sources)) {
            is AppResult.Success -> r.value
            is AppResult.Failure -> return r
        }
        val official = setOf("archive.ubuntu.com", "security.ubuntu.com", "ports.ubuntu.com", "cn.archive.ubuntu.com")
        val out = mutableListOf("APT 源检查（共 ${lines.size} 行）：")
        var checked = 0
        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith("#")) continue
            val m = Regex("^(deb|deb-src)\\s+(?:\\[[^]]*\\]\\s+)?(\\S+)\\s+(\\S+)\\s*(.*)$").find(line)
            if (m == null) {
                out += "[格式] 无法按一行式源解析：$line"
                continue
            }
            checked++
            val uri = m.groupValues[2]
            val suite = m.groupValues[3]
            val host = uri.substringAfter("://").substringBefore("/").substringBefore(":")
            when {
                uri.startsWith("http://") ->
                    out += "[建议] $host $suite：明文 HTTP 源，建议改 https"
                host in official ->
                    out += "[官方] $host $suite"
                else ->
                    out += "[第三方] $host $suite：非 Ubuntu 官方域名，请确认来源可信"
            }
        }
        if (checked == 0) out += "未解析到 deb 行"
        val pkg = pinPackage.trim()
        val ver = pinVersion.trim()
        if (pkg.isNotEmpty() && ver.isNotEmpty()) {
            out += listOf(
                "",
                "版本固定片段（写入 /etc/apt/preferences.d/pin-$pkg）：",
                "Package: $pkg",
                "Pin: version $ver",
                "Pin-Priority: 1001",
            )
        } else if (pkg.isNotEmpty() || ver.isNotEmpty()) {
            return AppResult.Failure(AppError.Validation("生成固定片段需同时填写包名与版本"))
        }
        return ok(out)
    }

    // ---------- N-28：.env 检查（绝不回显值） ----------
    fun envCheck(input: String): AppResult<ToolOutput> {
        val lines = when (val r = linesOf(input)) {
            is AppResult.Success -> r.value
            is AppResult.Failure -> return r
        }
        val out = mutableListOf(" .env 检查（值不回显、不保存）：".trim())
        val seen = mutableMapOf<String, Int>()
        var entries = 0
        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith("#")) continue
            val body = line.removePrefix("export ").trim()
            val eq = body.indexOf('=')
            if (eq <= 0) {
                out += "[格式] 无法解析的一行（已跳过，内容不回显）"
                continue
            }
            entries++
            val key = body.substring(0, eq).trim()
            val value = body.substring(eq + 1).trim()
            if (seen.containsKey(key)) out += "[重复] 键 $key 出现多次，后者会覆盖前者"
            seen.merge(key, 1, Int::plus)
            if (!key.matches(Regex("[A-Z][A-Z0-9_]*"))) {
                out += "[命名] 键 $key 非常规（建议大写字母、数字与下划线）"
            }
            if (value.isEmpty()) {
                out += "[空值] 键 $key 的值为空"
                continue
            }
            val quoted = (value.startsWith("\"") && value.endsWith("\"")) ||
                (value.startsWith("'") && value.endsWith("'"))
            if (!quoted && value.contains(' ')) {
                out += "[格式] 键 $key 的值含空格但未加引号，不同解析器行为可能不一致"
            }
            val secretLike = listOf("SECRET", "TOKEN", "PASSWORD", "PASSWD", "API_KEY", "PRIVATE").any { key.contains(it) }
            val rawValue = value.removeSurrounding("\"").removeSurrounding("'")
            if (secretLike && rawValue.length < 16) {
                out += "[弱密钥] 键 $key 的值长度仅 ${rawValue.length}（疑似过短，长度以外不做任何展示）"
            }
        }
        out += "共检查 $entries 个条目；以上仅显示键名与规则，未显示任何值。"
        if (entries == 0) out += "（未解析到 KEY=VALUE 条目）"
        return ok(out)
    }
}
