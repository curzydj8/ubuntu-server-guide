package dev.toolkit.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        FavoriteToolEntity::class,
        RecentToolEntity::class,
        KnowledgeArticleEntity::class,
        SshHostEntity::class,
        HostKeyEntity::class,
        OpAuditEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class ToolkitDatabase : RoomDatabase() {
    abstract fun favoriteToolDao(): FavoriteToolDao
    abstract fun recentToolDao(): RecentToolDao
    abstract fun knowledgeArticleDao(): KnowledgeArticleDao
    abstract fun sshHostDao(): SshHostDao
    abstract fun hostKeyDao(): HostKeyDao
    abstract fun opAuditDao(): OpAuditDao

    companion object {
        /** v1 -> v2：knowledge_articles 增加正文与收藏列（同步导入与文章收藏所需）。 */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE knowledge_articles ADD COLUMN body TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE knowledge_articles ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
            }
        }

        /**
         * v2 -> v3（第五阶段）：ssh_hosts 补分组/标签/认证方式/备注；
         * 新增 host_keys（TOFU 信任库，回填 ssh_hosts 既有指纹）与 op_audit（操作审计）。
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE ssh_hosts ADD COLUMN groupName TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE ssh_hosts ADD COLUMN tags TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE ssh_hosts ADD COLUMN authType TEXT NOT NULL DEFAULT 'PASSWORD'")
                db.execSQL("ALTER TABLE ssh_hosts ADD COLUMN note TEXT NOT NULL DEFAULT ''")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS host_keys (" +
                        "host TEXT NOT NULL, port INTEGER NOT NULL, fingerprint TEXT NOT NULL, " +
                        "keyType TEXT NOT NULL, firstSeenAtMillis INTEGER NOT NULL, " +
                        "lastSeenAtMillis INTEGER NOT NULL, PRIMARY KEY(host, port))"
                )
                db.execSQL(
                    "INSERT OR IGNORE INTO host_keys (host, port, fingerprint, keyType, firstSeenAtMillis, lastSeenAtMillis) " +
                        "SELECT host, port, hostKeyFingerprint, '', 0, 0 FROM ssh_hosts WHERE hostKeyFingerprint IS NOT NULL"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS op_audit (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, atMillis INTEGER NOT NULL, " +
                        "profileId INTEGER, hostLabel TEXT NOT NULL, action TEXT NOT NULL, " +
                        "command TEXT, risk TEXT, exitCode INTEGER)"
                )
            }
        }

        fun create(context: Context): ToolkitDatabase =
            Room.databaseBuilder(context, ToolkitDatabase::class.java, "toolkit.db")
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()
    }
}
