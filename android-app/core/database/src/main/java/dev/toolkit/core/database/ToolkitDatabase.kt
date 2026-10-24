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
    ],
    version = 2,
    exportSchema = true,
)
abstract class ToolkitDatabase : RoomDatabase() {
    abstract fun favoriteToolDao(): FavoriteToolDao
    abstract fun recentToolDao(): RecentToolDao
    abstract fun knowledgeArticleDao(): KnowledgeArticleDao
    abstract fun sshHostDao(): SshHostDao

    companion object {
        /** v1 -> v2：knowledge_articles 增加正文与收藏列（同步导入与文章收藏所需）。 */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE knowledge_articles ADD COLUMN body TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE knowledge_articles ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
            }
        }

        fun create(context: Context): ToolkitDatabase =
            Room.databaseBuilder(context, ToolkitDatabase::class.java, "toolkit.db")
                .addMigrations(MIGRATION_1_2)
                .build()
    }
}
