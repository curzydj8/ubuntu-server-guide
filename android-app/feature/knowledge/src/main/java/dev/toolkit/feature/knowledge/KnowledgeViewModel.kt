package dev.toolkit.feature.knowledge

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.toolkit.core.common.DispatcherProvider
import dev.toolkit.core.database.KnowledgeArticleEntity
import dev.toolkit.core.knowledge.KnowledgeRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

data class KnowledgeUiState(
    val query: String = "",
    val articles: List<KnowledgeArticleEntity> = emptyList(),
    val totalCount: Int = 0,
    val loading: Boolean = true,
)

/** 知识库列表逻辑：全量/搜索由仓库提供，章节集合从结果派生。 */
@OptIn(ExperimentalCoroutinesApi::class)
class KnowledgeViewModel(
    private val repository: KnowledgeRepository,
    dispatchers: DispatcherProvider,
) : ViewModel() {

    private val query = MutableStateFlow("")
    private val _state = MutableStateFlow(KnowledgeUiState())
    val state: StateFlow<KnowledgeUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch(dispatchers.default) {
            query.flatMapLatest { q -> repository.search(q) }.collect { articles ->
                _state.value = _state.value.copy(
                    articles = articles,
                    totalCount = if (_state.value.query.isEmpty()) articles.size else _state.value.totalCount.coerceAtLeast(articles.size),
                    loading = false,
                )
            }
        }
    }

    fun onQueryChange(value: String) {
        query.value = value
        _state.value = _state.value.copy(query = value)
    }

    fun sections(): List<String> = _state.value.articles.map { it.section }.distinct().sorted()

    fun onToggleFavorite(article: KnowledgeArticleEntity) {
        viewModelScope.launch { repository.setFavorite(article.articleId, !article.favorite) }
    }
}
