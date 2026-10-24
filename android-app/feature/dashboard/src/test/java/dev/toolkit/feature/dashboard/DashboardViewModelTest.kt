package dev.toolkit.feature.dashboard

import dev.toolkit.core.common.ToolCategory
import dev.toolkit.core.common.ToolConnectivity
import dev.toolkit.core.common.ToolId
import dev.toolkit.core.common.ToolMeta
import dev.toolkit.core.common.ToolRegistry
import dev.toolkit.core.database.FavoriteToolDao
import dev.toolkit.core.database.FavoriteToolEntity
import dev.toolkit.core.database.RecentToolDao
import dev.toolkit.core.database.RecentToolEntity
import dev.toolkit.core.database.ToolUsageRepository
import dev.toolkit.core.testing.TestDispatcherProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

    private class FakeFavorites : FavoriteToolDao {
        val flow = MutableStateFlow<List<FavoriteToolEntity>>(emptyList())
        override fun observeAll(): Flow<List<FavoriteToolEntity>> = flow
        override suspend fun upsert(entity: FavoriteToolEntity) {
            flow.value = flow.value.filterNot { it.toolId == entity.toolId } + entity
        }
        override suspend fun delete(toolId: String) {
            flow.value = flow.value.filterNot { it.toolId == toolId }
        }
    }

    private class FakeRecents : RecentToolDao {
        val flow = MutableStateFlow<List<RecentToolEntity>>(emptyList())
        override fun observeRecent(limit: Int): Flow<List<RecentToolEntity>> = flow
        override suspend fun upsert(entity: RecentToolEntity) {
            flow.value = (flow.value.filterNot { it.toolId == entity.toolId } + entity)
                .sortedByDescending { it.usedAtMillis }
        }
        override suspend fun trimTo(keep: Int) {
            flow.value = flow.value.sortedByDescending { it.usedAtMillis }.take(keep)
        }
    }

    private val registry = object : ToolRegistry {
        private val tools = listOf(
            ToolMeta(ToolId("N-17"), "Linux 权限计算器", ToolCategory.SYSTEM, ToolConnectivity.OFFLINE, "权限换算"),
            ToolMeta(ToolId("N-21"), "子网 / CIDR 计算器", ToolCategory.NETWORK, ToolConnectivity.OFFLINE, "子网计算"),
        )
        override fun all() = tools
        override fun find(id: ToolId) = tools.firstOrNull { it.id == id }
    }

    private lateinit var favorites: FakeFavorites
    private lateinit var recents: FakeRecents
    private lateinit var viewModel: DashboardViewModel

    @Before fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        favorites = FakeFavorites()
        recents = FakeRecents()
        val repo = ToolUsageRepository(favorites, recents) { 1_000L }
        viewModel = DashboardViewModel(registry, repo, TestDispatcherProvider())
    }

    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun `initial state lists all tools`() {
        assertEquals(2, viewModel.state.value.tools.size)
    }

    @Test fun `search filters tools`() {
        viewModel.onQueryChange("子网")
        assertEquals(listOf("N-21"), viewModel.state.value.tools.map { it.id.value })
    }

    @Test fun `opening a tool records it as recent`() = runTest {
        viewModel.onToolOpened(registry.all().first())
        assertEquals(listOf("N-17"), viewModel.state.value.recentIds)
    }

    @Test fun `toggling favorite updates state`() = runTest {
        viewModel.onToggleFavorite(registry.all().first(), currentlyFavorite = false)
        assertEquals(setOf("N-17"), viewModel.state.value.favoriteIds)
    }
}
