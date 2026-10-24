package dev.toolkit.core.database

import kotlinx.coroutines.flow.Flow

/** 收藏与最近使用的数据入口，供 dashboard / tools 使用。 */
class ToolUsageRepository(
    private val favorites: FavoriteToolDao,
    private val recents: RecentToolDao,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun observeFavorites(): Flow<List<FavoriteToolEntity>> = favorites.observeAll()

    fun observeRecents(limit: Int = 10): Flow<List<RecentToolEntity>> = recents.observeRecent(limit)

    suspend fun setFavorite(toolId: String, favorite: Boolean) {
        if (favorite) favorites.upsert(FavoriteToolEntity(toolId, clock()))
        else favorites.delete(toolId)
    }

    suspend fun recordUse(toolId: String) {
        recents.upsert(RecentToolEntity(toolId, clock()))
        recents.trimTo(RECENT_KEEP)
    }

    companion object { const val RECENT_KEEP = 50 }
}
