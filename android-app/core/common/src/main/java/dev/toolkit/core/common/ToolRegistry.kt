package dev.toolkit.core.common

/**
 * 工具注册契约：与网站 32 工具同源编号（N-01 起）。
 * feature:tools 负责登记实现，dashboard 与搜索只依赖本契约，不硬编码工具列表。
 */
data class ToolId(val value: String) {
    // N-xx 为网站编号工具；G-xx 为网站「编号外」生成器在 App 侧的登记号。
    init { require(value.matches(Regex("[NG]-\\d{2}"))) { "工具编号必须形如 N-17 或 G-01" } }
}

enum class ToolCategory(val label: String) {
    NETWORK("网络"), SYSTEM("系统"), SECURITY("安全"), TEXT("文本与数据"), DEVOPS("运维")
}

enum class ToolConnectivity { OFFLINE, ONLINE, HYBRID }

data class ToolMeta(
    val id: ToolId,
    val name: String,
    val category: ToolCategory,
    val connectivity: ToolConnectivity,
    val summary: String,
)

interface ToolRegistry {
    fun all(): List<ToolMeta>
    fun find(id: ToolId): ToolMeta?
    fun search(query: String): List<ToolMeta> =
        all().filter { it.name.contains(query, ignoreCase = true) || it.summary.contains(query, ignoreCase = true) }
}
