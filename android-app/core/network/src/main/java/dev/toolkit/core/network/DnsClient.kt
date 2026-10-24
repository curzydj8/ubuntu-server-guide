package dev.toolkit.core.network

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.MiniJson
import java.net.URLEncoder

/**
 * N-01 DNS 查询（全站唯一联网工具）：DNS over HTTPS JSON API。
 * 口径与 Web 版一致：仅在用户点击查询时请求；只向所选解析商发送查询名与记录类型；
 * 解析商二选一（Cloudflare / Google）。无网或失败时明确报错，绝不伪造离线结果。
 */
object DnsClient {

    enum class Provider(val label: String, val baseUrl: String) {
        CLOUDFLARE("Cloudflare", "https://cloudflare-dns.com/dns-query"),
        GOOGLE("Google", "https://dns.google/resolve"),
    }

    val RECORD_TYPES = listOf("A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "CAA", "PTR")

    private val TYPE_NAMES = mapOf(
        1 to "A", 2 to "NS", 5 to "CNAME", 6 to "SOA", 12 to "PTR", 15 to "MX",
        16 to "TXT", 28 to "AAAA", 33 to "SRV", 257 to "CAA",
    )

    private val STATUS_TEXT = mapOf(
        0 to "NOERROR（成功）", 1 to "FORMERR（格式错误）", 2 to "SERVFAIL（服务器失败）",
        3 to "NXDOMAIN（域名不存在）", 5 to "REFUSED（被拒绝）",
    )

    data class Record(val name: String, val type: String, val ttl: Long, val data: String)
    data class Response(val status: Int, val statusText: String, val records: List<Record>)

    fun buildUrl(provider: Provider, name: String, type: String): String {
        val q = URLEncoder.encode(name.trim(), "UTF-8")
        val t = URLEncoder.encode(type.uppercase(), "UTF-8")
        return "${provider.baseUrl}?name=$q&type=$t"
    }

    fun validateName(name: String): AppResult<String> {
        val n = name.trim().trimEnd('.')
        if (n.isEmpty() || n.length > 253) return fail("域名不合法")
        val labelOk = n.split(".").all { label ->
            label.isNotEmpty() && label.length <= 63 &&
                label.all { it.isLetterOrDigit() || it == '-' } &&
                !label.startsWith("-") && !label.endsWith("-")
        }
        if (!labelOk) return fail("域名不合法（标签须为字母数字与连字符）")
        return AppResult.Success(n)
    }

    fun parseResponse(json: String): AppResult<Response> {
        val root = try {
            (MiniJson.parse(json) as? MiniJson.V.Obj)?.map
        } catch (e: Exception) { null } ?: return fail("解析商返回内容无法解析")
        val status = (root["Status"] as? MiniJson.V.Num)?.raw?.toIntOrNull()
            ?: return fail("解析商返回缺少 Status")
        val answers = (root["Answer"] as? MiniJson.V.Arr)?.items ?: emptyList()
        val records = answers.mapNotNull { item ->
            val o = (item as? MiniJson.V.Obj)?.map ?: return@mapNotNull null
            Record(
                name = (o["name"] as? MiniJson.V.Str)?.value ?: return@mapNotNull null,
                type = TYPE_NAMES[(o["type"] as? MiniJson.V.Num)?.raw?.toIntOrNull()] ?: (o["type"] as? MiniJson.V.Num)?.raw ?: "?",
                ttl = (o["TTL"] as? MiniJson.V.Num)?.raw?.toLongOrNull() ?: 0,
                data = (o["data"] as? MiniJson.V.Str)?.value ?: return@mapNotNull null,
            )
        }
        return AppResult.Success(
            Response(status, STATUS_TEXT[status] ?: "状态码 $status", records)
        )
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
