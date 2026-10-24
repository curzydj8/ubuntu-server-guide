package dev.toolkit.feature.tools.kb

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * N-32 Linux 命令解释器（引擎 + 种子知识库）。
 * 完整 57 命令知识库随内容同步协议下发（第三阶段）；本阶段内置高频命令种子集验证拆解与风险标注引擎。
 */
object ExplainLogic {
    data class CommandInfo(val name: String, val purpose: String, val risk: String?, val flags: Map<String, String>)

    val KB: Map<String, CommandInfo> = listOf(
        CommandInfo("ls", "列出目录内容", null, mapOf("-l" to "长格式（含权限/大小）", "-a" to "含隐藏文件", "-h" to "人类可读大小")),
        CommandInfo("cd", "切换工作目录", null, mapOf("-" to "回到上一个目录")),
        CommandInfo("cp", "复制文件/目录", "覆盖目标前不提示时可能丢数据", mapOf("-r" to "递归复制目录", "-i" to "覆盖前询问", "-a" to "归档模式（保留属性）")),
        CommandInfo("mv", "移动/重命名", "跨文件系统移动大目录耗时且中断风险高", mapOf("-i" to "覆盖前询问", "-n" to "不覆盖已有文件")),
        CommandInfo("rm", "删除文件/目录", "删除默认不可恢复；rm -rf 指向错误路径是经典事故", mapOf("-r" to "递归删除目录", "-f" to "强制不询问", "-i" to "逐个询问")),
        CommandInfo("chmod", "修改权限", "777 与对系统目录递归改权是常见安全坑", mapOf("-R" to "递归", "-v" to "显示过程")),
        CommandInfo("chown", "修改属主/属组", "对系统目录递归改属主可能破坏服务", mapOf("-R" to "递归")),
        CommandInfo("grep", "按模式搜索文本", null, mapOf("-r" to "递归目录", "-n" to "显示行号", "-i" to "忽略大小写", "-v" to "反选")),
        CommandInfo("find", "按条件查找文件", "配合 -delete/-exec 时先用 -print 验证范围", mapOf("-name" to "按名匹配", "-type" to "按类型（f/d）", "-mtime" to "按修改天数", "-exec" to "对结果执行命令")),
        CommandInfo("tar", "归档/解包", "解包到当前目录前先 -t 查看清单防目录穿越", mapOf("-c" to "创建归档", "-x" to "解包", "-z" to "gzip", "-f" to "指定文件", "-t" to "列清单")),
        CommandInfo("df", "查看文件系统空间", null, mapOf("-h" to "人类可读", "-i" to "看 inode")),
        CommandInfo("du", "统计目录占用", null, mapOf("-h" to "人类可读", "-s" to "只给总计", "--max-depth" to "限制层数")),
        CommandInfo("ps", "查看进程", null, mapOf("aux" to "全进程全格式（BSD 风格）", "-ef" to "全格式（SysV 风格）")),
        CommandInfo("systemctl", "管理 systemd 服务", "stop/disable 核心服务前确认依赖影响", mapOf("status" to "查看状态", "restart" to "重启", "enable" to "设开机自启", "journal" to "日志请用 journalctl")),
        CommandInfo("journalctl", "查看 systemd 日志", null, mapOf("-u" to "按单元", "-f" to "跟随", "-n" to "最近 N 行", "--disk-usage" to "日志占用")),
        CommandInfo("ss", "查看套接字/监听端口", null, mapOf("-t" to "TCP", "-u" to "UDP", "-l" to "监听中", "-n" to "数字端口", "-p" to "显示进程")),
        CommandInfo("curl", "HTTP 客户端", "-k 跳过证书校验仅可调试用", mapOf("-I" to "只看响应头", "-o" to "保存到文件", "-d" to "POST 数据", "-H" to "加请求头", "-v" to "详细过程")),
        CommandInfo("ssh", "远程登录", null, mapOf("-p" to "端口", "-i" to "私钥", "-J" to "跳板机", "-L" to "本地端口转发")),
        CommandInfo("scp", "远程复制", null, mapOf("-P" to "端口（大写）", "-r" to "递归", "-i" to "私钥")),
        CommandInfo("rsync", "增量同步", "--delete 会删目标端多余文件，先 --dry-run", mapOf("-a" to "归档模式", "-v" to "详细", "-z" to "压缩传输", "--delete" to "删除目标端多余文件", "-n" to "试运行")),
    ).associateBy { it.name }

    fun explain(commandLine: String): AppResult<List<String>> {
        val tokens = tokenize(commandLine)
        if (tokens.isEmpty()) return AppResult.Failure(AppError.Validation("请输入命令"))
        val cmd = tokens.first().removePrefix("sudo ")
        val info = KB[cmd] ?: return AppResult.Failure(
            AppError.Validation("种子知识库暂未收录「$cmd」（完整 57 命令库随第三阶段同步下发）"))
        val lines = mutableListOf("$cmd — ${info.purpose}")
        for (token in tokens.drop(1)) {
            val desc = info.flags[token]
                ?: info.flags.entries.firstOrNull { token.startsWith(it.key) && it.key.length > 1 }?.value
            lines += if (desc != null) "  $token — $desc" else "  $token — （参数/路径）"
        }
        info.risk?.let { lines += "风险提示：$it" }
        return AppResult.Success(lines)
    }

    internal fun tokenize(input: String): List<String> {
        val out = mutableListOf<String>()
        val sb = StringBuilder()
        var quote: Char? = null
        for (c in input.trim()) {
            when {
                quote != null -> { if (c == quote) quote = null else sb.append(c) }
                c == '"' || c == '\'' -> quote = c
                c.isWhitespace() -> { if (sb.isNotEmpty()) { out += sb.toString(); sb.clear() } }
                else -> sb.append(c)
            }
        }
        if (sb.isNotEmpty()) out += sb.toString()
        return out
    }
}
