package dev.toolkit.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface FavoriteToolDao {
    @Query("SELECT * FROM favorite_tools ORDER BY addedAtMillis DESC")
    fun observeAll(): Flow<List<FavoriteToolEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: FavoriteToolEntity)

    @Query("DELETE FROM favorite_tools WHERE toolId = :toolId")
    suspend fun delete(toolId: String)
}

@Dao
interface RecentToolDao {
    @Query("SELECT * FROM recent_tools ORDER BY usedAtMillis DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<RecentToolEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: RecentToolEntity)

    @Query("DELETE FROM recent_tools WHERE toolId NOT IN (SELECT toolId FROM recent_tools ORDER BY usedAtMillis DESC LIMIT :keep)")
    suspend fun trimTo(keep: Int)
}

@Dao
interface KnowledgeArticleDao {
    @Query("SELECT * FROM knowledge_articles ORDER BY section, title")
    fun observeAll(): Flow<List<KnowledgeArticleEntity>>

    @Query("SELECT * FROM knowledge_articles WHERE articleId = :id")
    fun observeById(id: String): Flow<KnowledgeArticleEntity?>

    @Query("SELECT * FROM knowledge_articles WHERE title LIKE '%' || :q || '%' OR body LIKE '%' || :q || '%' ORDER BY section, title")
    fun search(q: String): Flow<List<KnowledgeArticleEntity>>

    @Query("SELECT articleId FROM knowledge_articles WHERE favorite = 1")
    suspend fun favoriteIds(): List<String>

    @Query("UPDATE knowledge_articles SET favorite = :favorite WHERE articleId = :id")
    suspend fun setFavorite(id: String, favorite: Boolean)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(articles: List<KnowledgeArticleEntity>)

    @Query("SELECT COUNT(*) FROM knowledge_articles")
    suspend fun count(): Int
}

@Dao
interface SshHostDao {
    @Query("SELECT * FROM ssh_hosts ORDER BY alias")
    fun observeAll(): Flow<List<SshHostEntity>>

    @Query("SELECT * FROM ssh_hosts WHERE id = :id")
    suspend fun getById(id: Long): SshHostEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(host: SshHostEntity): Long

    @androidx.room.Update
    suspend fun update(host: SshHostEntity)

    @Query("DELETE FROM ssh_hosts WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface HostKeyDao {
    @Query("SELECT * FROM host_keys WHERE host = :host AND port = :port")
    suspend fun get(host: String, port: Int): HostKeyEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: HostKeyEntity)

    @Query("DELETE FROM host_keys WHERE host = :host AND port = :port")
    suspend fun delete(host: String, port: Int)
}

@Dao
interface OpAuditDao {
    @Query("SELECT * FROM op_audit ORDER BY atMillis DESC LIMIT :limit")
    fun observeRecent(limit: Int = 200): Flow<List<OpAuditEntity>>

    @Insert
    suspend fun insert(entity: OpAuditEntity): Long

    @Query("DELETE FROM op_audit WHERE atMillis < :beforeMillis")
    suspend fun pruneOlderThan(beforeMillis: Long)
}
