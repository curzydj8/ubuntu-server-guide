package dev.toolkit.feature.servers

import dev.toolkit.core.ssh.CommandRisk
import dev.toolkit.core.ssh.RiskLevel

/** 只读诊断的一项：预设命令经 CommandRisk 校验必须全部为 READ_ONLY（单测断言，护栏不可放宽）。 */
data class DiagPreset(val id: String, val title: String, val command: String)

object Diagnostics {
    val presets: List<DiagPreset> = listOf(
        DiagPreset("os", "系统版本", "cat /etc/os-release"),
        DiagPreset("kernel", "内核与主机名", "uname -a"),
        DiagPreset("uptime", "运行时间与负载", "uptime"),
        DiagPreset("memory", "内存", "free -h"),
        DiagPreset("disk", "磁盘", "df -h"),
        DiagPreset("block", "块设备", "lsblk"),
        DiagPreset("ports", "监听端口", "ss -tuln"),
        DiagPreset("failed", "失败的服务", "systemctl --failed --no-pager"),
    )

    /** 护栏自检：全部预设必须被分级为只读；UI 运行前也会调用，不合格的条目会被跳过并标注。 */
    fun riskOf(preset: DiagPreset): RiskLevel = CommandRisk.assess(preset.command)
}

/** 一项诊断的采集结果（界面状态）。 */
data class DiagSection(
    val preset: DiagPreset,
    val running: Boolean = false,
    val output: String? = null,
    val error: String? = null,
    val exitCode: Int? = null,
)
