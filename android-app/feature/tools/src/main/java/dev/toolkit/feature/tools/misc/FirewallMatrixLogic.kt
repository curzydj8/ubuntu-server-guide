package dev.toolkit.feature.tools.misc

/** N-09 端口与防火墙规划矩阵：常用服务的端口、暴露风险与建议（离线静态数据）。 */
object FirewallMatrixLogic {
    data class Entry(val service: String, val port: String, val exposure: String, val advice: String)

    val ENTRIES: List<Entry> = listOf(
        Entry("SSH", "22/tcp", "高", "改非默认端口 + 仅密钥登录 + 来源白名单/跳板机"),
        Entry("HTTP", "80/tcp", "低", "可对全网开放，建议强制跳转 HTTPS"),
        Entry("HTTPS", "443/tcp", "低", "对全网开放；证书与 TLS 版本保持更新"),
        Entry("MySQL", "3306/tcp", "极高", "禁止直接对公网开放；走内网/SSH 隧道/VPN"),
        Entry("PostgreSQL", "5432/tcp", "极高", "同 MySQL；pg_hba 按来源收紧"),
        Entry("Redis", "6379/tcp", "极高", "禁止公网；必须设 requirepass 并绑定内网"),
        Entry("MongoDB", "27017/tcp", "极高", "禁止公网直连；开启认证与内网绑定"),
        Entry("Docker API", "2375/2376", "极高", "绝不裸露 2375；2376 须双向 TLS"),
        Entry("Kubernetes API", "6443/tcp", "高", "仅管理网段可达，RBAC 最小权限"),
        Entry("SMTP", "25/tcp", "中", "仅邮件服务器开放，注意开放中继风险"),
        Entry("DNS", "53/udp", "中", "仅权威/递归分离，防反射放大"),
        Entry("NTP", "123/udp", "低", "对内提供即可，避免对公网开放反射面"),
        Entry("RDP", "3389/tcp", "高", "禁止公网直连，走 VPN/网关"),
        Entry("SMB", "445/tcp", "极高", "禁止公网，历史上多次蠕虫入口"),
    )

    fun search(query: String): List<Entry> {
        val q = query.trim()
        if (q.isEmpty()) return ENTRIES
        return ENTRIES.filter {
            it.service.contains(q, ignoreCase = true) || it.port.contains(q) || it.exposure == q
        }
    }
}
