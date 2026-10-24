package dev.toolkit.core.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * 基于 Android Keystore 的保险库实现：AES-256/GCM 密钥由 Keystore 生成且不可导出，
 * 密文落在应用私有目录。密钥别名按 ref 派生，互不干扰。
 * 注：本类依赖 Android 运行时，JVM 单元测试覆盖契约层（见 InMemoryCredentialVault 与契约测试），
 * 真机验证在第五阶段随 SSH 模块一并完成。
 */
class KeystoreCredentialVault(private val storeDir: File) : CredentialVault {

    override suspend fun put(ref: String, secret: CharArray): AppResult<Unit> = runCatchingVault {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, keyFor(ref))
        val bytes = String(secret).toByteArray(Charsets.UTF_8)
        val encrypted = cipher.doFinal(bytes)
        bytes.fill(0)
        fileFor(ref).writeText(
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
                Base64.encodeToString(encrypted, Base64.NO_WRAP)
        )
    }

    override suspend fun get(ref: String): AppResult<CharArray?> {
        // fileFor 的 ref 校验在 runCatchingVault 之外时会把 IllegalArgumentException 抛给调用方
        // （0.6.0 真机闪退根因之一），此处先收口：非法 ref 一律回 Failure，绝不抛。
        val file = try { fileFor(ref) } catch (e: Exception) {
            return AppResult.Failure(AppError.Security("保险库引用不合法：${e.message}"))
        }
        if (!file.exists()) return AppResult.Success(null)
        return runCatchingVault {
            val (ivB64, dataB64) = file.readText().split(":", limit = 2)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE, keyFor(ref),
                GCMParameterSpec(TAG_BITS, Base64.decode(ivB64, Base64.DEFAULT)),
            )
            val plain = cipher.doFinal(Base64.decode(dataB64, Base64.DEFAULT))
            val chars = String(plain, Charsets.UTF_8).toCharArray()
            plain.fill(0)
            chars
        }
    }

    override suspend fun remove(ref: String): AppResult<Unit> = runCatchingVault {
        fileFor(ref).delete()
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (ks.containsAlias(aliasFor(ref))) ks.deleteEntry(aliasFor(ref))
        Unit
    }

    override suspend fun contains(ref: String): Boolean =
        runCatching { fileFor(ref).exists() }.getOrDefault(false)

    private fun fileFor(ref: String): File {
        require(ref.matches(Regex("[A-Za-z0-9._-]{1,64}"))) { "ref 仅允许字母数字与 ._-" }
        // storeDir（filesDir/vault）默认不存在，File.writeText 不建父目录——
        // 0.6.1 真机实测 put 恒 FileNotFoundException 的根因，此处统一兜底创建。
        if (!storeDir.exists()) storeDir.mkdirs()
        return File(storeDir, "vault-$ref.bin")
    }

    private fun aliasFor(ref: String) = "toolkit-vault-$ref"

    private fun keyFor(ref: String): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getEntry(aliasFor(ref), null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                aliasFor(ref),
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private inline fun <T> runCatchingVault(block: () -> T): AppResult<T> =
        try { AppResult.Success(block()) }
        catch (e: Exception) {
            // 带上异常信息便于真机问题定位（IO/Keystore 异常信息不含凭据内容）
            AppResult.Failure(AppError.Security("保险库操作失败：${e.javaClass.simpleName}: ${e.message}"))
        }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
    }
}
