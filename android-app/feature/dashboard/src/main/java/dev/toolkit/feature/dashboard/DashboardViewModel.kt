package dev.toolkit.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.toolkit.core.common.DispatcherProvider
import dev.toolkit.core.common.ToolMeta
import dev.toolkit.core.common.ToolRegistry
import dev.toolkit.core.database.ToolUsageRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

data class DashboardUiState(
    val query: String = "",
    val tools: List<ToolMeta> = emptyList(),
    val favoriteIds: Set<String> = emptySet(),
    val recentIds: List<String> = emptyList(),
    val loading: Boolean = true,
)

/** 首页逻辑：注册表全量工具 + 收藏/最近来自数据库，搜索按注册表契约过滤。 */
class DashboardViewModel(
    private val registry: ToolRegistry,
    private val usage: ToolUsageRepository,
    dispatchers: DispatcherProvider,
) : ViewModel() {

    private val query = MutableStateFlow("")
    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch(dispatchers.default) {
            combine(
                query,
                usage.observeFavorites(),
                usage.observeRecents(),
            ) { q, favorites, recents ->
                DashboardUiState(
                    query = q,
                    tools = if (q.isBlank()) registry.all() else registry.search(q),
                    favoriteIds = favorites.map { it.toolId }.toSet(),
                    recentIds = recents.map { it.toolId },
                    loading = false,
                )
            }.collect { _state.value = it }
        }
    }

    fun onQueryChange(value: String) { query.value = value }

    fun onToggleFavorite(meta: ToolMeta, currentlyFavorite: Boolean) {
        viewModelScope.launch { usage.setFavorite(meta.id.value, !currentlyFavorite) }
    }

    fun onToolOpened(meta: ToolMeta) {
        viewModelScope.launch { usage.recordUse(meta.id.value) }
    }
}
