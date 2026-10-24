package dev.toolkit.core.network

import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.AppError

/** N-03 HTTP 响应头与安全头分析（粘贴或在线取头共用同一套判定口径）。 */
object HeaderAnalyzer {

    data class Check(val name: String, val status: String, val detail: String)

    fun parsePasted(text: String): AppResult<Map<String, List<String>>> {
        val map = linkedMapOf<String, MutableList<String>>()
        for (raw in text.lines()) {
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("HTTP/")) continue
            val idx = line.indexOf(':')
            if (idx <= 0) continue
            val key = line.substring(0, idx).trim().lowercase()
            val value = line.substring(idx + 1).trim()
            map.getOrPut(key) { mutableListOf() } += value
        }
        if (map.isEmpty()) return AppResult.Failure(AppError.Validation("未解析到响应头（格式：每行「名: 值」，可直接粘 curl -I 输出）"))
        return AppResult.Success(map)
    }

    fun analyze(headers: Map<String, List<String>>): List<Check> {
        fun first(name: String) = headers[name.lowercase()]?.firstOrNull()
        val checks = mutableListOf<Check>()

        val hsts = first("strict-transport-security")
        checks += when {
            hsts == null -> Check("Strict-Transport-Security", "缺失", "未设置 HSTS，HTTPS 降级与中间人风险存在")
            else -> {
                val maxAge = Regex("max-age=(\\d+)").find(hsts)?.groupValues?.get(1)?.toLongOrNull() ?: 0
                if (maxAge >= 31_536_000) Check("Strict-Transport-Security", "通过", "max-age=$maxAge（≥1 年）")
                else Check("Strict-Transport-Security", "建议", "max-age=$maxAge 偏短，建议 ≥31536000")
            }
        }

        val csp = first("content-security-policy")
        checks += when {
            csp == null -> Check("Content-Security-Policy", "缺失", "未设置 CSP")
            else -> {
                val risks = buildList {
                    if (csp.contains("'unsafe-inline'")) add("含 'unsafe-inline'")
                    if (csp.contains("'unsafe-eval'")) add("含 'unsafe-eval'")
                    if (Regex("default-src[^;]*\\*").containsMatchIn(csp)) add("default-src 含通配 *")
                }
                if (risks.isEmpty()) Check("Content-Security-Policy", "通过", "已设置且无明显宽松项")
                else Check("Content-Security-Policy", "警告", risks.joinToString("；"))
            }
        }

        val xcto = first("x-content-type-options")
        checks += if (xcto?.lowercase() == "nosniff") {
            Check("X-Content-Type-Options", "通过", "nosniff")
        } else {
            Check("X-Content-Type-Options", "缺失", "应设置为 nosniff")
        }

        val xfo = first("x-frame-options")
        val frameAncestors = csp?.contains("frame-ancestors") == true
        checks += when {
            xfo != null -> Check("点击劫持防护", "通过", "X-Frame-Options: $xfo")
            frameAncestors -> Check("点击劫持防护", "通过", "CSP frame-ancestors 已设置")
            else -> Check("点击劫持防护", "缺失", "X-Frame-Options 与 CSP frame-ancestors 均未设置")
        }

        checks += if (first("referrer-policy") != null) {
            Check("Referrer-Policy", "通过", "已设置")
        } else {
            Check("Referrer-Policy", "建议", "建议设置（如 strict-origin-when-cross-origin）")
        }

        checks += if (first("permissions-policy") != null) {
            Check("Permissions-Policy", "通过", "已设置")
        } else {
            Check("Permissions-Policy", "建议", "建议按需收敛浏览器特性权限")
        }

        listOf("server", "x-powered-by").forEach { name ->
            first(name)?.let { value ->
                if (Regex("\\d+\\.\\d+").containsMatchIn(value)) {
                    checks += Check("版本泄露（$name）", "警告", "$name 暴露了版本号：$value，建议隐藏")
                }
            }
        }
        return checks
    }
}
