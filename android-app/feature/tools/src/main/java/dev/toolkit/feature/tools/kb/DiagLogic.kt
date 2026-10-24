package dev.toolkit.feature.tools.kb

/**
 * N-10 Linux 故障诊断决策树（引擎 + 种子数据）。
 * 完整 35 终点数据随内容同步协议下发（第三阶段）；本阶段内置 3 条高频路径的种子树验证引擎。
 */
object DiagLogic {
    sealed interface Node {
        val id: String
        data class Question(
            override val id: String, val text: String,
            val options: List<Pair<String, String>>, // 选项文案 -> 下一节点 id
        ) : Node
        data class Conclusion(
            override val id: String, val title: String,
            val checks: List<String>, val fix: List<String>,
        ) : Node
    }

    val NODES: Map<String, Node> = listOf(
        Node.Question("root", "先选故障类型", listOf(
            "网站/服务打不开" to "web-1", "SSH 连不上" to "ssh-1", "磁盘空间不足" to "disk-1")),
        Node.Question("web-1", "服务进程还在吗？（systemctl status 或 ss -tlnp 看端口）", listOf(
            "进程不在/端口没监听" to "web-dead", "进程在且端口监听" to "web-2")),
        Node.Conclusion("web-dead", "服务未运行",
            listOf("systemctl status <服务>", "journalctl -u <服务> -n 100 --no-pager"),
            listOf("先看日志报错再启动：systemctl start <服务>", "若反复崩溃，按日志中的配置/权限/端口占用逐项排查")),
        Node.Question("web-2", "本机 curl 127.0.0.1 能通吗？", listOf(
            "本机不通" to "web-local", "本机通、外网不通" to "web-net")),
        Node.Conclusion("web-local", "应用层/本机配置问题",
            listOf("curl -v 127.0.0.1:<端口>", "ss -tlnp | grep <端口>（确认绑定的地址）"),
            listOf("若只绑定 127.0.0.1 而期望外部访问，改绑 0.0.0.0 后重启服务")),
        Node.Conclusion("web-net", "网络/防火墙层问题",
            listOf("sudo ufw status", "云厂商安全组是否放行端口", "curl -v http://<公网IP>:<端口>"),
            listOf("按 UFW → 安全组 → 运营商拦截的顺序逐层放行并复测")),
        Node.Question("ssh-1", "能 ping 通主机吗？", listOf(
            "ping 不通" to "web-net", "ping 通但 SSH 超时/拒绝" to "ssh-2")),
        Node.Question("ssh-2", "服务端 sshd 在运行吗？（控制台/带外登录确认）", listOf(
            "sshd 未运行" to "ssh-dead", "sshd 运行中" to "ssh-auth")),
        Node.Conclusion("ssh-dead", "sshd 未运行或端口被挡",
            listOf("systemctl status ssh", "ss -tlnp | grep 22"),
            listOf("systemctl restart ssh；并核对防火墙 22/tcp 放行")),
        Node.Conclusion("ssh-auth", "认证层问题",
            listOf("ssh -v user@host 看协商细节", "服务端 tail -f /var/log/auth.log"),
            listOf("核对用户名/密钥权限（.ssh 700、authorized_keys 600）与 sshd 的 AllowUsers/PasswordAuthentication 设置")),
        Node.Question("disk-1", "df -h 看是哪个挂载点满了？", listOf(
            "根分区 /" to "disk-root", "数据盘" to "disk-data")),
        Node.Conclusion("disk-root", "根分区清理路径",
            listOf("sudo du -x -h / | sort -h | tail -20", "journalctl --disk-usage", "sudo apt-get clean"),
            listOf("清日志（journalctl --vacuum-time=7d）、包缓存与旧内核；大文件定位后迁移或扩容")),
        Node.Conclusion("disk-data", "数据盘清理/扩容路径",
            listOf("sudo du -h --max-depth=1 <挂载点> | sort -h"),
            listOf("先清可再生数据（缓存/旧备份）；仍不足走 LVM 扩容（见 G-06 LVM 扩容步骤生成器）")),
    ).associateBy { it.id }

    fun node(id: String): Node? = NODES[id]
    fun start(): Node = NODES.getValue("root")
}
