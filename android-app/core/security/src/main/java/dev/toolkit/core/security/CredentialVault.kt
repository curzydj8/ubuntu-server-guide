package dev.toolkit.core.security

import dev.toolkit.core.common.AppResult

/**
 * 凭据保险库契约：SSH 密码/私钥/令牌等敏感材料只经此接口存取，
 * 绝不落明文数据库或 DataStore。实现见 KeystoreCredentialVault（Android Keystore）。
 */
interface CredentialVault {
    suspend fun put(ref: String, secret: CharArray): AppResult<Unit>
    suspend fun get(ref: String): AppResult<CharArray?>
    suspend fun remove(ref: String): AppResult<Unit>
    suspend fun contains(ref: String): Boolean
}

/** 日志脱敏：敏感字段一律替换，任何日志路径都必须先过这里。 */
object LogRedactor {
    private val KEY_VALUE = Regex("(?i)(password|passwd|secret|token|private[_-]?key)\\s*[:=]\\s*\\S+")
    fun redact(text: String): String = KEY_VALUE.replace(text) { m -> "${m.groupValues[1]}=***" }
}
