package dev.toolkit.core.knowledge

import dev.toolkit.core.database.KnowledgeArticleDao
import dev.toolkit.core.database.KnowledgeArticleEntity
import dev.toolkit.core.sync.ContentExportImporter
import kotlinx.coroutines.flow.Flow

/** 知识库数据入口：导入（保留既有收藏标记）、查询、搜索、收藏。 */
class KnowledgeRepository(
    private val dao: KnowledgeArticleDao,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun observeAll(): Flow<List<KnowledgeArticleEntity>> = dao.observeAll()

    fun observeArticle(id: String): Flow<KnowledgeArticleEntity?> = dao.observeById(id)

    fun search(query: String): Flow<List<KnowledgeArticleEntity>> =
        if (query.isBlank()) dao.observeAll() else dao.search(query.trim())

    suspend fun count(): Int = dao.count()

    suspend fun setFavorite(id: String, favorite: Boolean) = dao.setFavorite(id, favorite)

    /** 导入已校验的同步包；重导入时保留用户已收藏文章的标记。返回导入篇数。 */
    suspend fun importPackage(pkg: ContentExportImporter.Package): Int {
        val favorites = dao.favoriteIds().toSet()
        val now = clock()
        dao.upsertAll(pkg.articles.map { a ->
            KnowledgeArticleEntity(
                articleId = a.id,
                title = a.title,
                section = a.section,
                sha256 = a.sha256,
                updatedAtMillis = now,
                body = a.body,
                favorite = a.id in favorites,
            )
        })
        return pkg.articles.size
    }
}
