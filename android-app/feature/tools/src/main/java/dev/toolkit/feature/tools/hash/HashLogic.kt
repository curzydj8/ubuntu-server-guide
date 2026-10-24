package dev.toolkit.feature.tools.hash

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.security.MessageDigest

/** N-25 Hash 计算器：文本的 MD5/SHA-1/SHA-256/SHA-512（UTF-8），与 Web 版向量同源校验。 */
object HashLogic {
    val ALGORITHMS = listOf("MD5", "SHA-1", "SHA-256", "SHA-512")

    fun digestHex(text: String, algorithm: String): AppResult<String> {
        if (algorithm !in ALGORITHMS) {
            return AppResult.Failure(AppError.Validation("不支持的算法：$algorithm"))
        }
        val bytes = MessageDigest.getInstance(algorithm).digest(text.toByteArray(Charsets.UTF_8))
        return AppResult.Success(bytes.joinToString("") { "%02x".format(java.util.Locale.ROOT, it) })
    }

    fun allDigests(text: String): AppResult<List<Pair<String, String>>> =
        AppResult.Success(ALGORITHMS.map { it to (digestHex(text, it) as AppResult.Success).value })
}
