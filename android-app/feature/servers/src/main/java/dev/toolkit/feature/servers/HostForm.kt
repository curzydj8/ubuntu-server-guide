package dev.toolkit.feature.servers

/** 主机档案表单的纯逻辑校验与标签解析（可单测，不依赖 Android 框架）。 */
object HostForm {
    const val AUTH_PASSWORD = "PASSWORD"
    const val AUTH_PRIVATE_KEY = "PRIVATE_KEY"

    /** 返回首个校验错误（中文），全部合法返回 null。凭据是否必填由调用方按新建/编辑区分后传入。 */
    fun validate(
        alias: String,
        host: String,
        portText: String,
        username: String,
        authType: String,
        credentialProvided: Boolean,
    ): String? {
        if (alias.isBlank()) return "别名不能为空"
        if (host.isBlank()) return "主机地址不能为空"
        if (host.any { it.isWhitespace() }) return "主机地址不能包含空白"
        val port = portText.toIntOrNull() ?: return "端口必须是数字"
        if (port !in 1..65535) return "端口须在 1–65535 之间"
        if (username.isBlank()) return "用户名不能为空"
        if (authType != AUTH_PASSWORD && authType != AUTH_PRIVATE_KEY) return "认证方式不合法"
        if (!credentialProvided) {
            return if (authType == AUTH_PASSWORD) "请填写密码（只存入本机加密保险库）"
            else "请粘贴私钥（只存入本机加密保险库）"
        }
        return null
    }

    fun parseTags(raw: String): List<String> =
        raw.split(',', '，').map { it.trim() }.filter { it.isNotEmpty() }.distinct()

    fun joinTags(tags: List<String>): String = tags.joinToString(",")
}

/**
 * 保险库引用命名：core:security 的 KeystoreCredentialVault 只接受 [A-Za-z0-9._-] 的 ref
 * （0.6.0 曾用斜杠拼接 ref 导致连接时抛 IllegalArgumentException 闪退——此处为唯一命名来源，
 * 单测断言全部 ref 符合该模式）。
 */
object CredentialRefs {
    fun baseFor(hostId: Long): String = "ssh-host-$hostId"
    fun password(base: String): String = "$base-pw"
    fun privateKey(base: String): String = "$base-key"
    fun keyPassphrase(base: String): String = "$base-kp"
}
