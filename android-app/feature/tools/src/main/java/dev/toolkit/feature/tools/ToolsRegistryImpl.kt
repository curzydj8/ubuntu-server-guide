package dev.toolkit.feature.tools

import dev.toolkit.core.common.ToolCategory
import dev.toolkit.core.common.ToolConnectivity
import dev.toolkit.core.common.ToolId
import dev.toolkit.core.common.ToolMeta
import dev.toolkit.core.common.ToolRegistry

/** 工具登记表：随各阶段逐批补齐；编号与网站同源。 */
object ToolsRegistryImpl : ToolRegistry {
    private val tools = listOf(
        ToolMeta(
            ToolId("N-02"), "TLS 证书检查", ToolCategory.SECURITY,
            ToolConnectivity.HYBRID, "在线抓取校验或粘贴 PEM 解析：有效期/续期/SAN",
        ),
        ToolMeta(
            ToolId("N-03"), "HTTP 响应头与安全分析", ToolCategory.SECURITY,
            ToolConnectivity.HYBRID, "安全头清单判定：粘贴或在线取头",
        ),
        ToolMeta(
            ToolId("N-01"), "DNS 解析查询", ToolCategory.NETWORK,
            ToolConnectivity.ONLINE, "DoH 查询（Cloudflare/Google 二选一，点击才请求）",
        ),
        ToolMeta(
            ToolId("N-17"), "Linux 权限计算器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "八进制与 rwx 符号权限互转、chmod 命令生成",
        ),
        ToolMeta(
            ToolId("N-21"), "子网 / CIDR 计算器", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "IPv4/IPv6 子网掩码、网络地址与可用范围计算",
        ),
        ToolMeta(
            ToolId("N-25"), "Hash 计算器", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "文本 MD5/SHA-1/SHA-256/SHA-512 摘要",
        ),
        ToolMeta(
            ToolId("N-26"), "配置差异比较器", ToolCategory.TEXT,
            ToolConnectivity.OFFLINE, "两段配置的行级差异（LCS）对比",
        ),
        ToolMeta(
            ToolId("N-27"), "版本号比较器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "Debian 版本序比较（epoch/波浪线规则）",
        ),
        ToolMeta(
            ToolId("N-30"), "Docker 资源换算器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "内存单位与 CPU shares/nanoCPUs 互算",
        ),
        ToolMeta(
            ToolId("N-31"), "HTTP 状态码查询", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "常用 HTTP 状态码含义速查",
        ),
        ToolMeta(
            ToolId("N-10"), "故障诊断决策树", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "交互式排障问答（完整 35 终点数据随第三阶段同步）",
        ),
        ToolMeta(
            ToolId("N-32"), "Linux 命令解释器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "拆解命令与选项含义并标注风险（完整 57 命令库随第三阶段同步）",
        ),
        ToolMeta(
            ToolId("N-04"), "格式校验与转换", ToolCategory.TEXT,
            ToolConnectivity.OFFLINE, "JSON 与 YAML 子集互转与校验（限制口径照 Web 版）",
        ),
        ToolMeta(
            ToolId("N-07"), "磁盘容量规划器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "按日增量与保留期估算容量与可用天数",
        ),
        ToolMeta(
            ToolId("N-09"), "端口与防火墙规划矩阵", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "常用服务端口的暴露风险与处置建议",
        ),
        ToolMeta(
            ToolId("N-11"), "Cron 表达式工具", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "Cron 校验、中文释义与未来运行时刻推算",
        ),
        ToolMeta(
            ToolId("N-13"), "备份 RPO/RTO 计算器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "按备份间隔与恢复速率估算 RPO/RTO",
        ),
        ToolMeta(
            ToolId("N-14"), "服务器资源规划器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "按峰值并发估算 CPU/内存规格（假设明示）",
        ),
        ToolMeta(
            ToolId("N-20"), "服务器迁移计划生成器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "传输时长估算与迁移清单（增量两段式）",
        ),
        ToolMeta(
            ToolId("N-24"), "正则表达式测试器", ToolCategory.TEXT,
            ToolConnectivity.OFFLINE, "Java 正则匹配测试（含与 JS 语义差异与回溯提醒）",
        ),
        ToolMeta(
            ToolId("N-05"), "GitHub Actions 生成器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "Node/Python/Go 的 CI 工作流模板",
        ),
        ToolMeta(
            ToolId("N-06"), "sshd 配置生成器", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "sshd_config 安全基线片段生成",
        ),
        ToolMeta(
            ToolId("N-08"), "systemd Timer 生成器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "OnCalendar 定时器单元生成",
        ),
        ToolMeta(
            ToolId("N-16"), "cloud-init 生成器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "#cloud-config 用户/密钥/软件包配置",
        ),
        ToolMeta(
            ToolId("N-19"), "Nginx 反向代理生成器", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "反向代理 server 块生成（含 WebSocket 选项）",
        ),
        ToolMeta(
            ToolId("N-22"), "curl 命令构建器", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "curl 命令拼装与转义（只生成不执行）",
        ),
        ToolMeta(
            ToolId("N-29"), "Git 命令生成器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "场景化 Git 命令（强推只给 --force-with-lease）",
        ),
        ToolMeta(
            ToolId("G-01"), "Netplan 配置生成器", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "静态地址/DHCP 的 Netplan YAML 生成",
        ),
        ToolMeta(
            ToolId("G-02"), "UFW 规则生成器", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "按服务生成 UFW 放行命令（SSH 先行）",
        ),
        ToolMeta(
            ToolId("G-03"), "SSH 命令生成器", ToolCategory.NETWORK,
            ToolConnectivity.OFFLINE, "ssh 命令与 ~/.ssh/config 片段拼装",
        ),
        ToolMeta(
            ToolId("G-04"), "systemd Unit 生成器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "服务单元文件生成",
        ),
        ToolMeta(
            ToolId("G-05"), "Docker Compose 模板生成器", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "常用服务组合的 compose.yaml 拼装",
        ),
        ToolMeta(
            ToolId("G-06"), "LVM 扩容步骤生成器", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "按文件系统给出 LVM 扩容命令序列",
        ),
        ToolMeta(
            ToolId("N-12"), "Docker Compose 安全审查", ToolCategory.DEVOPS,
            ToolConnectivity.OFFLINE, "粘贴 Compose：高权/明文密钥/版本固定审查（值不回显）",
        ),
        ToolMeta(
            ToolId("N-15"), "日志分析", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "粘贴日志：级别计数/错误样本/高频 IP（上限 2000 行）",
        ),
        ToolMeta(
            ToolId("N-18"), "APT 源检查与版本固定", ToolCategory.SYSTEM,
            ToolConnectivity.OFFLINE, "源域名分类与风险提示 + preferences 固定片段",
        ),
        ToolMeta(
            ToolId("N-23"), "SSH 日志分析", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "auth.log：失败/成功统计与爆破风险分级",
        ),
        ToolMeta(
            ToolId("N-28"), ".env 配置检查", ToolCategory.SECURITY,
            ToolConnectivity.OFFLINE, "重复/空值/弱密钥长度检查（绝不回显值、不保存）",
        ),
    )

    override fun all(): List<ToolMeta> = tools
    override fun find(id: ToolId): ToolMeta? = tools.firstOrNull { it.id == id }
}
