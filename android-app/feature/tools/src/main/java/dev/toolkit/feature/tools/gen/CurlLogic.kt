package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import dev.toolkit.feature.tools.gen.SshCommandLogic.shellQuote

/** curl 命令构建器（N-22）：拼装并做 shell 转义；安卓侧只生成文本，不执行。 */
object CurlLogic {
    fun build(url: String, method: String, headers: List<String>, body: String, insecure: Boolean): AppResult<String> {
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return fail("URL 须以 http:// 或 https:// 开头")
        val m = method.uppercase()
        if (m !in listOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD")) return fail("方法不合法")
        val sb = StringBuilder("curl")
        if (m != "GET") sb.append(" -X ").append(m)
        if (insecure) sb.append(" -k   # 警告：-k 跳过证书校验，仅限调试")
        for (h in headers.filter { it.isNotBlank() }) {
            if (!h.contains(':')) return fail("请求头格式应为 Name: Value：$h")
            sb.append(" \\\n  -H ").append(shellQuote(h))
        }
        if (body.isNotBlank()) sb.append(" \\\n  -d ").append(shellQuote(body))
        sb.append(" \\\n  ").append(shellQuote(url))
        return AppResult.Success(sb.toString())
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
