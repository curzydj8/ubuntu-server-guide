package dev.toolkit.core.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/** 收藏的工具（toolId 与网站同源编号，如 N-17）。 */
@Entity(tableName = "favorite_tools")
data class FavoriteToolEntity(
    @PrimaryKey val toolId: String,
    val addedAtMillis: Long,
)

/** 最近使用记录：同一工具只留一行，靠 usedAtMillis 排序。 */
@Entity(tableName = "recent_tools")
data class RecentToolEntity(
    @PrimaryKey val toolId: String,
    val usedAtMillis: Long,
)

/** 知识库文章索引（第三阶段由内容同步协议导出包填充）。 */
@Entity(tableName = "knowledge_articles")
data class KnowledgeArticleEntity(
    @PrimaryKey val articleId: String,
    val title: String,
    val section: String,
    val sha256: String,
    val updatedAtMillis: Long,
    val body: String = "",
    val favorite: Boolean = false,
)

/** SSH 主机（第五阶段使用；凭据本体不进数据库，只存 Keystore 引用名）。 */
@Entity(tableName = "ssh_hosts")
data class SshHostEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val alias: String,
    val host: String,
    val port: Int = 22,
    val username: String,
    val credentialRef: String?,
    val hostKeyFingerprint: String?,
    // v3 扩展：分组、标签（逗号分隔）、认证方式 PASSWORD/KEY、备注
    val groupName: String = "",
    val tags: String = "",
    val authType: String = "PASSWORD",
    val note: String = "",
)

/** 已信任主机密钥（TOFU 信任库，按 host+port 唯一；指纹变化即视为异常）。 */
@Entity(tableName = "host_keys", primaryKeys = ["host", "port"])
data class HostKeyEntity(
    val host: String,
    val port: Int,
    val fingerprint: String,
    val keyType: String,
    val firstSeenAtMillis: Long,
    val lastSeenAtMillis: Long,
)

/**
 * 操作审计（第五阶段）：连接与命令执行留痕。
 * command 字段只存脱敏后的文本——调用方写入前必须过 Redact，禁止明文机密入表。
 */
@Entity(tableName = "op_audit")
data class OpAuditEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val atMillis: Long,
    val profileId: Long?,
    val hostLabel: String,
    val action: String,
    val command: String?,
    val risk: String?,
    val exitCode: Int?,
)
