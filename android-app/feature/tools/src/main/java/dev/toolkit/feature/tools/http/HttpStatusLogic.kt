package dev.toolkit.feature.tools.http

/** N-31 HTTP 状态码查询：内置常用状态码表（离线静态数据），按代码或关键词检索。 */
object HttpStatusLogic {
    data class Entry(val code: Int, val name: String, val zh: String, val category: String)

    val ENTRIES: List<Entry> = listOf(
        Entry(100, "Continue", "继续发送请求体", "信息"),
        Entry(101, "Switching Protocols", "切换协议", "信息"),
        Entry(200, "OK", "请求成功", "成功"),
        Entry(201, "Created", "已创建", "成功"),
        Entry(202, "Accepted", "已接受待处理", "成功"),
        Entry(204, "No Content", "成功但无响应体", "成功"),
        Entry(206, "Partial Content", "部分内容（断点续传）", "成功"),
        Entry(301, "Moved Permanently", "永久重定向", "重定向"),
        Entry(302, "Found", "临时重定向", "重定向"),
        Entry(304, "Not Modified", "缓存未修改", "重定向"),
        Entry(307, "Temporary Redirect", "临时重定向（保持方法）", "重定向"),
        Entry(308, "Permanent Redirect", "永久重定向（保持方法）", "重定向"),
        Entry(400, "Bad Request", "请求语法或参数错误", "客户端错误"),
        Entry(401, "Unauthorized", "未认证（需登录）", "客户端错误"),
        Entry(403, "Forbidden", "已认证但无权限", "客户端错误"),
        Entry(404, "Not Found", "资源不存在", "客户端错误"),
        Entry(405, "Method Not Allowed", "方法不允许", "客户端错误"),
        Entry(408, "Request Timeout", "请求超时", "客户端错误"),
        Entry(409, "Conflict", "状态冲突", "客户端错误"),
        Entry(410, "Gone", "资源已被永久删除", "客户端错误"),
        Entry(413, "Content Too Large", "请求体过大", "客户端错误"),
        Entry(415, "Unsupported Media Type", "媒体类型不支持", "客户端错误"),
        Entry(422, "Unprocessable Content", "语义错误无法处理", "客户端错误"),
        Entry(429, "Too Many Requests", "被限流", "客户端错误"),
        Entry(500, "Internal Server Error", "服务器内部错误", "服务器错误"),
        Entry(501, "Not Implemented", "未实现该功能", "服务器错误"),
        Entry(502, "Bad Gateway", "网关收到无效上游响应（反向代理常见）", "服务器错误"),
        Entry(503, "Service Unavailable", "服务不可用（过载/维护）", "服务器错误"),
        Entry(504, "Gateway Timeout", "网关等待上游超时", "服务器错误"),
    )

    fun byCode(code: Int): Entry? = ENTRIES.firstOrNull { it.code == code }

    fun search(query: String): List<Entry> {
        val q = query.trim()
        if (q.isEmpty()) return ENTRIES
        return ENTRIES.filter {
            it.code.toString() == q || it.name.contains(q, ignoreCase = true) || it.zh.contains(q)
        }
    }
}
