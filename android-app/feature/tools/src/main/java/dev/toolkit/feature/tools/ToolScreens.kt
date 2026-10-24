package dev.toolkit.feature.tools

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.ToolId
import dev.toolkit.feature.tools.diff.DiffLogic
import dev.toolkit.feature.tools.dres.DockerResourceLogic
import dev.toolkit.feature.tools.hash.HashLogic
import dev.toolkit.feature.tools.http.HttpStatusLogic
import dev.toolkit.feature.tools.permissions.PermissionToolScreen
import dev.toolkit.feature.tools.subnet.SubnetToolScreen
import dev.toolkit.feature.tools.version.VersionLogic
import dev.toolkit.feature.tools.gen.ActionsLogic
import dev.toolkit.feature.tools.gen.CloudInitLogic
import dev.toolkit.feature.tools.gen.ComposeLogic
import dev.toolkit.feature.tools.gen.CurlLogic
import dev.toolkit.feature.tools.gen.GitLogic
import dev.toolkit.feature.tools.gen.LvmLogic
import dev.toolkit.feature.tools.gen.NetplanLogic
import dev.toolkit.feature.tools.gen.NginxLogic
import dev.toolkit.feature.tools.gen.SshCommandLogic
import dev.toolkit.feature.tools.gen.SshdLogic
import dev.toolkit.feature.tools.gen.SystemdLogic
import dev.toolkit.feature.tools.gen.UfwLogic
import dev.toolkit.feature.tools.misc.CronLogic
import dev.toolkit.feature.tools.misc.FirewallMatrixLogic
import dev.toolkit.feature.tools.misc.FormatLogic
import dev.toolkit.feature.tools.misc.PlannerLogic
import dev.toolkit.feature.tools.misc.RegexLogic
import dev.toolkit.feature.tools.kb.DiagScreen
import dev.toolkit.feature.tools.dns.DnsToolScreen
import dev.toolkit.feature.tools.netcheck.HeadersToolScreen
import dev.toolkit.feature.tools.netcheck.TlsToolScreen
import dev.toolkit.feature.tools.analyze.Analyzers
import dev.toolkit.feature.tools.kb.ExplainLogic
import java.time.LocalDateTime

/** 工具屏路由：注册表编号 → 对应界面。新增工具只需在此登记一行。 */
object ToolScreens {
    @Composable
    fun Content(toolId: String, modifier: Modifier = Modifier) {
        when (toolId) {
            "N-01" -> DnsToolScreen(modifier)
            "N-02" -> TlsToolScreen(modifier)
            "N-03" -> HeadersToolScreen(modifier)
            "N-12" -> SimpleToolScreen(
                title = "Docker Compose 安全审查",
                fields = listOf(ToolField("text", "粘贴 docker-compose.yml 内容", singleLine = false, minLines = 6)),
                actionLabel = "审查",
                compute = { Analyzers.composeReview(it["text"].orEmpty()) },
                modifier = modifier,
            )
            "N-15" -> SimpleToolScreen(
                title = "日志分析",
                fields = listOf(ToolField("text", "粘贴日志（最多 2000 行）", singleLine = false, minLines = 6)),
                actionLabel = "分析",
                compute = { Analyzers.logAnalyze(it["text"].orEmpty()) },
                modifier = modifier,
            )
            "N-18" -> SimpleToolScreen(
                title = "APT 源检查与版本固定",
                fields = listOf(
                    ToolField("sources", "粘贴 sources.list 内容", singleLine = false, minLines = 4),
                    ToolField("pkg", "（可选）要固定的包名"),
                    ToolField("ver", "（可选）版本，如 1.24.*"),
                ),
                actionLabel = "检查",
                compute = { Analyzers.aptHelper(it["sources"].orEmpty(), it["pkg"].orEmpty(), it["ver"].orEmpty()) },
                modifier = modifier,
            )
            "N-23" -> SimpleToolScreen(
                title = "SSH 日志分析",
                fields = listOf(ToolField("text", "粘贴 auth.log 片段（最多 2000 行）", singleLine = false, minLines = 6)),
                actionLabel = "分析",
                compute = { Analyzers.sshLogAnalyze(it["text"].orEmpty()) },
                modifier = modifier,
            )
            "N-28" -> SimpleToolScreen(
                title = ".env 配置检查",
                fields = listOf(ToolField("text", "粘贴 .env 内容（值不会被回显或保存）", singleLine = false, minLines = 5)),
                actionLabel = "检查",
                compute = { Analyzers.envCheck(it["text"].orEmpty()) },
                modifier = modifier,
            )
            "N-17" -> PermissionToolScreen(modifier)
            "N-21" -> SubnetToolScreen(modifier)
            "N-25" -> SimpleToolScreen(
                title = "Hash 计算器",
                fields = listOf(ToolField("text", "待计算文本", singleLine = false, minLines = 3)),
                compute = { v ->
                    when (val r = HashLogic.allDigests(v["text"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(
                            ToolOutput(r.value.map { (algo, hex) -> "$algo: $hex" })
                        )
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-26" -> SimpleToolScreen(
                title = "配置差异比较器",
                fields = listOf(
                    ToolField("left", "原文（每行一条）", singleLine = false, minLines = 5),
                    ToolField("right", "新文（每行一条）", singleLine = false, minLines = 5),
                ),
                actionLabel = "比较",
                compute = { v ->
                    when (val r = DiffLogic.diff(v["left"] ?: "", v["right"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(DiffLogic.render(r.value)))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-27" -> SimpleToolScreen(
                title = "版本号比较器（Debian）",
                fields = listOf(
                    ToolField("a", "版本 A", "1.0~rc1"),
                    ToolField("b", "版本 B", "1.0"),
                ),
                actionLabel = "比较",
                compute = { v ->
                    val a = v["a"] ?: ""; val b = v["b"] ?: ""
                    when (val r = VersionLogic.compareStrings(a, b)) {
                        is AppResult.Success -> {
                            val symbol = when {
                                r.value < 0 -> "<"; r.value > 0 -> ">"; else -> "="
                            }
                            val verdict = when {
                                r.value < 0 -> "A 较旧"; r.value > 0 -> "A 较新"; else -> "两版本相同"
                            }
                            AppResult.Success(ToolOutput(listOf("$a $symbol $b", verdict)))
                        }
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-30" -> SimpleToolScreen(
                title = "Docker 资源换算器",
                fields = listOf(
                    ToolField("mem", "内存（如 512m / 2g）", "512m"),
                    ToolField("cpus", "CPU 核数（如 1.5）", "1.5"),
                ),
                compute = { v ->
                    val mem = DockerResourceLogic.parseMemory(v["mem"] ?: "")
                    if (mem is AppResult.Failure) return@SimpleToolScreen mem
                    val bytes = (mem as AppResult.Success).value
                    val cpus = (v["cpus"] ?: "").toDoubleOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(
                            dev.toolkit.core.common.AppError.Validation("核数不合法"))
                    val shares = DockerResourceLogic.cpusToShares(cpus)
                    if (shares is AppResult.Failure) return@SimpleToolScreen shares
                    val nano = DockerResourceLogic.cpusToNanoCpus(cpus)
                    if (nano is AppResult.Failure) return@SimpleToolScreen nano
                    AppResult.Success(
                        ToolOutput(
                            listOf(
                                "内存：$bytes B = ${DockerResourceLogic.formatMemory(bytes)}（Docker 写法 ${DockerResourceLogic.dockerMemoryString(bytes)}）",
                                "CPU：$cpus 核 → shares ${(shares as AppResult.Success).value}，nanoCPUs ${(nano as AppResult.Success).value}",
                            )
                        )
                    )
                },
                modifier = modifier,
            )
            "N-31" -> SimpleToolScreen(
                title = "HTTP 状态码查询",
                fields = listOf(ToolField("q", "代码或关键词（如 502 / 网关）")),
                actionLabel = "查询",
                compute = { v ->
                    val hits = HttpStatusLogic.search(v["q"] ?: "")
                    if (hits.isEmpty()) {
                        AppResult.Failure(dev.toolkit.core.common.AppError.Validation("没有匹配的状态码"))
                    } else {
                        AppResult.Success(ToolOutput(hits.map { "${it.code} ${it.name} — ${it.zh}（${it.category}）" }))
                    }
                },
                modifier = modifier,
            )

            "N-05" -> SimpleToolScreen(
                title = "GitHub Actions 生成器",
                fields = listOf(
                    ToolField("name", "工作流名", "CI"),
                    ToolField("branch", "触发分支", "main"),
                    ToolField("runtime", "运行时（node/python/go）", "node"),
                    ToolField("version", "版本（如 20 / 3.12 / 1.22）", "20"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = ActionsLogic.generate(v["name"] ?: "", v["branch"] ?: "", v["runtime"] ?: "", v["version"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-06" -> SimpleToolScreen(
                title = "sshd 配置生成器",
                fields = listOf(
                    ToolField("port", "端口", "22"),
                    ToolField("root", "PermitRootLogin（yes/no/prohibit-password/forced-commands-only）", "no"),
                    ToolField("password", "允许密码登录（是/否）", "否"),
                    ToolField("pubkey", "允许密钥登录（是/否）", "是"),
                    ToolField("users", "AllowUsers（可空，空格分隔）"),
                    ToolField("tries", "MaxAuthTries", "3"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    val port = (v["port"] ?: "").toIntOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("端口须为整数"))
                    val tries = (v["tries"] ?: "").toIntOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("MaxAuthTries 须为整数"))
                    when (val r = SshdLogic.generate(port, v["root"] ?: "no", v["password"] == "是", v["pubkey"] != "否", v["users"] ?: "", tries)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-08" -> SimpleToolScreen(
                title = "systemd Timer 生成器",
                fields = listOf(
                    ToolField("unit", "服务单元名（不含 .timer）", "backup"),
                    ToolField("calendar", "OnCalendar（如 daily / *-*-* 02:00:00）", "daily"),
                    ToolField("persistent", "错过补跑 Persistent（是/否）", "是"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = SystemdLogic.timer(v["unit"] ?: "", v["calendar"] ?: "", v["persistent"] != "否")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-16" -> SimpleToolScreen(
                title = "cloud-init 生成器",
                fields = listOf(
                    ToolField("user", "用户名", "ubuntu"),
                    ToolField("key", "SSH 公钥（可空）"),
                    ToolField("packages", "软件包（逗号分隔，可空）", "curl, vim"),
                    ToolField("tz", "时区", "Asia/Shanghai"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = CloudInitLogic.generate(v["user"] ?: "", v["key"] ?: "",
                        (v["packages"] ?: "").split(",").map { it.trim() }, v["tz"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-19" -> SimpleToolScreen(
                title = "Nginx 反向代理生成器",
                fields = listOf(
                    ToolField("server", "域名", "example.com"),
                    ToolField("host", "后端地址", "127.0.0.1"),
                    ToolField("port", "后端端口", "8080"),
                    ToolField("ws", "WebSocket（是/否）", "否"),
                    ToolField("body", "请求体上限 MB", "10"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    val port = (v["port"] ?: "").toIntOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("端口须为整数"))
                    val body = (v["body"] ?: "").toIntOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("上限须为整数"))
                    when (val r = NginxLogic.reverseProxy(v["server"] ?: "", v["host"] ?: "", port, v["ws"] == "是", body)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-22" -> SimpleToolScreen(
                title = "curl 命令构建器",
                fields = listOf(
                    ToolField("url", "URL", "https://example.com/api"),
                    ToolField("method", "方法（GET/POST/PUT/PATCH/DELETE/HEAD）", "GET"),
                    ToolField("headers", "请求头（每行一条，可空）", singleLine = false, minLines = 2),
                    ToolField("body", "请求体（可空）"),
                    ToolField("insecure", "跳过证书校验 -k（是/否）", "否"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = CurlLogic.build(v["url"] ?: "", v["method"] ?: "GET",
                        (v["headers"] ?: "").lines(), v["body"] ?: "", v["insecure"] == "是")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-29" -> SimpleToolScreen(
                title = "Git 命令生成器",
                fields = listOf(
                    ToolField("scenario", "场景（undo-commit/revert-commit/force-push-safe/new-branch/sync-fork/clean-merged）", "undo-commit"),
                    ToolField("arg", "参数（分支名/提交号等，可空）"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = GitLogic.generate(v["scenario"] ?: "", v["arg"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-01" -> SimpleToolScreen(
                title = "Netplan 配置生成器",
                fields = listOf(
                    ToolField("iface", "接口名", "eth0"),
                    ToolField("dhcp", "使用 DHCP（是/否）", "否"),
                    ToolField("addr", "静态地址 CIDR（DHCP 时忽略）", "192.168.1.10/24"),
                    ToolField("gw", "网关（可空）", "192.168.1.1"),
                    ToolField("dns", "DNS（逗号分隔，可空）", "1.1.1.1, 8.8.8.8"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = NetplanLogic.generate(NetplanLogic.Input(
                        iface = v["iface"] ?: "", dhcp = v["dhcp"] == "是",
                        addressCidr = v["addr"] ?: "", gateway = v["gw"] ?: "",
                        dns = (v["dns"] ?: "").split(",").map { it.trim() }))) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-02" -> SimpleToolScreen(
                title = "UFW 规则生成器",
                fields = listOf(
                    ToolField("services", "服务（逗号分隔：ssh/http/https/mysql/postgres/redis）", "ssh, http, https"),
                    ToolField("ports", "自定义端口（逗号分隔，可空，如 8080/tcp）"),
                    ToolField("source", "来源 CIDR（可空，支持 IPv6）"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    val source = (v["source"] ?: "").trim()
                    val sv = UfwLogic.validateSource(source)
                    if (sv is AppResult.Failure) return@SimpleToolScreen sv
                    when (val r = UfwLogic.generate(
                        (v["services"] ?: "").split(",").map { it.trim() }.filter { it.isNotEmpty() },
                        (v["ports"] ?: "").split(",").map { it.trim() }.filter { it.isNotEmpty() },
                        source)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-03" -> SimpleToolScreen(
                title = "SSH 命令生成器",
                fields = listOf(
                    ToolField("user", "用户名", "ubuntu"),
                    ToolField("host", "主机", "192.0.2.10"),
                    ToolField("port", "端口", "22"),
                    ToolField("key", "私钥路径（可空）", "~/.ssh/id_ed25519"),
                    ToolField("jump", "跳板机 user@host（可空）"),
                    ToolField("cmd", "远程命令（可空）"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    val port = (v["port"] ?: "").toIntOrNull()
                        ?: return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("端口须为整数"))
                    when (val r = SshCommandLogic.ssh(v["user"] ?: "", v["host"] ?: "", port,
                        v["key"] ?: "", v["jump"] ?: "", v["cmd"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-04" -> SimpleToolScreen(
                title = "systemd Unit 生成器",
                fields = listOf(
                    ToolField("desc", "Description", "My Service"),
                    ToolField("exec", "ExecStart（绝对路径）", "/usr/local/bin/my-service"),
                    ToolField("user", "运行用户（可空）", "www-data"),
                    ToolField("workdir", "WorkingDirectory（可空）"),
                    ToolField("restart", "Restart（no/on-failure/always/on-success）", "on-failure"),
                    ToolField("network", "After network.target（是/否）", "是"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = SystemdLogic.unit(v["desc"] ?: "", v["exec"] ?: "", v["user"] ?: "",
                        v["workdir"] ?: "", v["restart"] ?: "no", v["network"] != "否")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-05" -> SimpleToolScreen(
                title = "Docker Compose 模板生成器",
                fields = listOf(
                    ToolField("services", "服务（逗号分隔：mysql/postgres/redis/nginx）", "mysql, redis"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = ComposeLogic.generate(
                        (v["services"] ?: "").split(",").map { it.trim() }.filter { it.isNotEmpty() })) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "G-06" -> SimpleToolScreen(
                title = "LVM 扩容步骤生成器",
                fields = listOf(
                    ToolField("vg", "VG 名", "vg0"),
                    ToolField("lv", "LV 名", "data"),
                    ToolField("size", "扩容量（如 +10G / +100%FREE）", "+10G"),
                    ToolField("fs", "文件系统（ext4/xfs）", "ext4"),
                    ToolField("disk", "新盘 /dev 路径（可空）"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    when (val r = LvmLogic.extendSteps(v["vg"] ?: "", v["lv"] ?: "", v["size"] ?: "",
                        v["fs"] ?: "", v["disk"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )

            "N-04" -> SimpleToolScreen(
                title = "格式校验与转换（子集）",
                fields = listOf(
                    ToolField("mode", "模式（json2yaml / yaml2json / check）", "json2yaml"),
                    ToolField("text", "内容", "{\"name\": \"demo\", \"replicas\": 2}", singleLine = false, minLines = 6),
                ),
                actionLabel = "转换",
                compute = { v ->
                    val text = v["text"] ?: ""
                    val r = when (v["mode"]?.trim()) {
                        "json2yaml" -> FormatLogic.jsonToYaml(text)
                        "yaml2json" -> FormatLogic.yamlToJson(text)
                        "check" -> FormatLogic.validateJson(text)
                        else -> AppResult.Failure(dev.toolkit.core.common.AppError.Validation("模式可选 json2yaml/yaml2json/check"))
                    }
                    when (r) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value.lines(), copyText = r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-07" -> SimpleToolScreen(
                title = "磁盘容量规划器",
                fields = listOf(
                    ToolField("growth", "日增量 GB", "5"),
                    ToolField("days", "保留天数", "30"),
                    ToolField("factor", "冗余系数（≥1）", "1.5"),
                    ToolField("free", "当前可用 GB", "200"),
                ),
                compute = { v ->
                    fun num(key: String): Double? = v[key]?.toDoubleOrNull()
                    val g = num("growth"); val f = num("factor"); val fr = num("free")
                    val d = v["days"]?.toIntOrNull()
                    if (g == null || f == null || fr == null || d == null) {
                        return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("参数须为数字"))
                    }
                    when (val r = PlannerLogic.diskPlan(g, d, f, fr)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-09" -> SimpleToolScreen(
                title = "端口与防火墙规划矩阵",
                fields = listOf(ToolField("q", "服务/端口/风险（如 MySQL / 3306 / 极高）")),
                actionLabel = "查询",
                compute = { v ->
                    val hits = FirewallMatrixLogic.search(v["q"] ?: "")
                    if (hits.isEmpty()) {
                        AppResult.Failure(dev.toolkit.core.common.AppError.Validation("矩阵中没有匹配项"))
                    } else {
                        AppResult.Success(ToolOutput(hits.map { "${it.service}（${it.port}）风险：${it.exposure} — ${it.advice}" }))
                    }
                },
                modifier = modifier,
            )
            "N-11" -> SimpleToolScreen(
                title = "Cron 表达式工具",
                fields = listOf(
                    ToolField("expr", "表达式（分 时 日 月 周）", "30 2 * * 1-5"),
                ),
                compute = { v ->
                    when (val r = CronLogic.parse(v["expr"] ?: "")) {
                        is AppResult.Success -> {
                            val runs = CronLogic.nextRuns(r.value, LocalDateTime.now())
                            AppResult.Success(ToolOutput(buildList {
                                add("释义：${CronLogic.humanize(r.value)}")
                                add("未来 3 次运行：")
                                runs.forEach { add("  $it") }
                            }))
                        }
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-13" -> SimpleToolScreen(
                title = "备份 RPO/RTO 计算器",
                fields = listOf(
                    ToolField("interval", "备份间隔（小时）", "24"),
                    ToolField("minutes", "单次备份用时（分钟）", "30"),
                    ToolField("data", "数据量 GB", "100"),
                    ToolField("rate", "恢复速率 GB/小时", "50"),
                ),
                compute = { v ->
                    val nums = listOf("interval", "minutes", "data", "rate").map { v[it]?.toDoubleOrNull() }
                    if (nums.any { it == null }) {
                        return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("参数须为数字"))
                    }
                    when (val r = PlannerLogic.backupPlan(nums[0]!!, nums[1]!!, nums[2]!!, nums[3]!!)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-14" -> SimpleToolScreen(
                title = "服务器资源规划器",
                fields = listOf(
                    ToolField("conc", "峰值并发", "200"),
                    ToolField("cpu", "单请求 CPU（毫秒）", "25"),
                    ToolField("mem", "单请求内存 MB", "8"),
                    ToolField("base", "基础内存 GB", "2"),
                ),
                compute = { v ->
                    val conc = v["conc"]?.toIntOrNull()
                    val cpu = v["cpu"]?.toDoubleOrNull()
                    val mem = v["mem"]?.toDoubleOrNull()
                    val base = v["base"]?.toDoubleOrNull()
                    if (conc == null || cpu == null || mem == null || base == null) {
                        return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("参数须为数字"))
                    }
                    when (val r = PlannerLogic.resourcePlan(conc, cpu, mem, base)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-20" -> SimpleToolScreen(
                title = "服务器迁移计划生成器",
                fields = listOf(
                    ToolField("data", "数据量 GB", "500"),
                    ToolField("bw", "可用带宽 Mbps", "100"),
                    ToolField("window", "停机窗口（小时）", "4"),
                ),
                actionLabel = "生成",
                compute = { v ->
                    val nums = listOf("data", "bw", "window").map { v[it]?.toDoubleOrNull() }
                    if (nums.any { it == null }) {
                        return@SimpleToolScreen AppResult.Failure(dev.toolkit.core.common.AppError.Validation("参数须为数字"))
                    }
                    when (val r = PlannerLogic.migrationPlan(nums[0]!!, nums[1]!!, nums[2]!!)) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-24" -> SimpleToolScreen(
                title = "正则表达式测试器",
                fields = listOf(
                    ToolField("pattern", "正则表达式", "\\d+"),
                    ToolField("text", "待测文本", "order 123 and 456", singleLine = false, minLines = 3),
                    ToolField("icase", "忽略大小写（是/否）", "否"),
                ),
                actionLabel = "测试",
                compute = { v ->
                    when (val r = RegexLogic.test(v["pattern"] ?: "", v["text"] ?: "", v["icase"] == "是")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(buildList {
                            add("命中 ${r.value.matches.size} 处")
                            r.value.matches.take(50).forEach { m ->
                                add("  @${m.index}: 「${m.text}」" +
                                    if (m.groups.any { it != null }) " 分组：" + m.groups.joinToString(", ") { it ?: "∅" } else "")
                            }
                            r.value.warnings.forEach { add("注：$it") }
                        }))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            "N-10" -> DiagScreen(modifier)
            "N-32" -> SimpleToolScreen(
                title = "Linux 命令解释器",
                fields = listOf(
                    ToolField("cmd", "命令（如 rsync -avz --delete src/ dst/）", "tar -czf backup.tar.gz /data"),
                ),
                actionLabel = "解释",
                compute = { v ->
                    when (val r = ExplainLogic.explain(v["cmd"] ?: "")) {
                        is AppResult.Success -> AppResult.Success(ToolOutput(r.value))
                        is AppResult.Failure -> r
                    }
                },
                modifier = modifier,
            )
            else -> androidx.compose.material3.Text("工具建设中", modifier = modifier)
        }
    }
}
