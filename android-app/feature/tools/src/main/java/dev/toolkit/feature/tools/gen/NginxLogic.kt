package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** Nginx 反向代理生成器（N-19）：域名 + 后端 → server 块；权重只接受裸数字（照 Web 版约定）。 */
object NginxLogic {
    fun reverseProxy(
        serverName: String, backendHost: String, backendPort: Int,
        websocket: Boolean, clientMaxBodyMb: Int,
    ): AppResult<String> {
        if (!serverName.matches(Regex("([A-Za-z0-9-]+\\.)*[A-Za-z0-9-]+"))) return fail("域名不合法")
        if (backendHost.isBlank() || backendHost.any { it.isWhitespace() || it == '/' }) return fail("后端地址不合法")
        if (backendPort !in 1..65535) return fail("后端端口必须在 1..65535")
        if (clientMaxBodyMb !in 1..1024) return fail("client_max_body_size 建议在 1..1024 MB")
        val lines = mutableListOf(
            "server {",
            "    listen 80;",
            "    server_name $serverName;",
            "",
            "    client_max_body_size ${clientMaxBodyMb}m;",
            "",
            "    location / {",
            "        proxy_pass http://$backendHost:$backendPort;",
            "        proxy_set_header Host \$host;",
            "        proxy_set_header X-Real-IP \$remote_addr;",
            "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;",
            "        proxy_set_header X-Forwarded-Proto \$scheme;",
        )
        if (websocket) {
            lines += "        proxy_http_version 1.1;"
            lines += "        proxy_set_header Upgrade \$http_upgrade;"
            lines += "        proxy_set_header Connection \"upgrade\";"
        }
        lines += "    }"
        lines += "}"
        lines += "# 改完先校验再 reload：sudo nginx -t && sudo systemctl reload nginx"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
