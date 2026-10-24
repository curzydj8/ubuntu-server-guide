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
)
