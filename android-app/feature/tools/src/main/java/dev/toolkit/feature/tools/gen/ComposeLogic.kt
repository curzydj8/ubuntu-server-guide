package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** Docker Compose 模板生成器（编号外）：从服务目录勾选拼装，版本与端口照常用口径。 */
object ComposeLogic {
    data class ServiceDef(val image: String, val ports: List<String>, val environment: Map<String, String>, val volumes: List<String>)

    val CATALOG: Map<String, ServiceDef> = mapOf(
        "mysql" to ServiceDef("mysql:8.4", listOf("3306:3306"),
            mapOf("MYSQL_ROOT_PASSWORD" to "change-me-root-pw"), listOf("mysql-data:/var/lib/mysql")),
        "postgres" to ServiceDef("postgres:17", listOf("5432:5432"),
            mapOf("POSTGRES_PASSWORD" to "change-me-pg-pw"), listOf("pg-data:/var/lib/postgresql/data")),
        "redis" to ServiceDef("redis:7", listOf("6379:6379"), emptyMap(), listOf("redis-data:/data")),
        "nginx" to ServiceDef("nginx:1.27", listOf("80:80", "443:443"), emptyMap(),
            listOf("./nginx.conf:/etc/nginx/conf.d/default.conf:ro")),
    )

    fun generate(selected: List<String>): AppResult<String> {
        if (selected.isEmpty()) return fail("至少选择一个服务（${CATALOG.keys.joinToString("/")}）")
        for (s in selected) if (s !in CATALOG) return fail("未知服务：$s")
        val sb = StringBuilder("services:\n")
        val volumes = mutableListOf<String>()
        for (name in selected) {
            val def = CATALOG.getValue(name)
            sb.appendLine("  $name:")
            sb.appendLine("    image: ${def.image}")
            sb.appendLine("    restart: unless-stopped")
            if (def.ports.isNotEmpty()) {
                sb.appendLine("    ports:")
                def.ports.forEach { sb.appendLine("      - \"$it\"") }
            }
            if (def.environment.isNotEmpty()) {
                sb.appendLine("    environment:")
                def.environment.forEach { (k, v) -> sb.appendLine("      $k: \"$v\"") }
            }
            if (def.volumes.isNotEmpty()) {
                sb.appendLine("    volumes:")
                def.volumes.forEach {
                    sb.appendLine("      - $it")
                    val named = it.substringBefore(":")
                    if (!named.startsWith(".")) volumes += named
                }
            }
        }
        if (volumes.isNotEmpty()) {
            sb.appendLine("volumes:")
            volumes.distinct().forEach { sb.appendLine("  $it:") }
        }
        sb.appendLine("# 占位密码仅供本地起步，生产使用前必须替换并改用 .env / secrets 管理")
        return AppResult.Success(sb.toString().trimEnd())
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
