package dev.toolkit.core.ssh

import java.security.MessageDigest
import java.security.PublicKey
import java.util.Base64
import net.schmizz.sshj.common.Buffer

/**
 * OpenSSH 风格 SHA256 指纹：对公钥的 SSH 线格式 blob 做 SHA-256，
 * Base64（去填充）并加 "SHA256:" 前缀，与 `ssh-keygen -lf` 的输出一致。
 */
object Fingerprint {
    fun ofBlob(blob: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(blob)
        return "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(digest)
    }

    fun of(publicKey: PublicKey): String = ofBlob(Buffer.PlainBuffer().putPublicKey(publicKey).compactData)

    /** 展示用短指纹：去掉前缀后的前 16 字符分组，方便口头核对。 */
    fun short(fingerprint: String): String =
        fingerprint.removePrefix("SHA256:").take(16).chunked(4).joinToString(" ")
}
