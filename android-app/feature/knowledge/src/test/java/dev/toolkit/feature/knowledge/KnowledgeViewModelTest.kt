package dev.toolkit.feature.knowledge

import dev.toolkit.core.database.KnowledgeArticleDao
import dev.toolkit.core.database.KnowledgeArticleEntity
import dev.toolkit.core.knowledge.KnowledgeRepository
import dev.toolkit.core.testing.TestDispatcherProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class KnowledgeViewModelTest {

    private class FakeDao : KnowledgeArticleDao {
        val all = MutableStateFlow<List<KnowledgeArticleEntity>>(emptyList())
        override fun observeAll(): Flow<List<KnowledgeArticleEntity>> = all
        override fun observeById(id: String): Flow<KnowledgeArticleEntity?> =
            all.map { list -> list.firstOrNull { it.articleId == id } }
        override fun search(q: String): Flow<List<KnowledgeArticleEntity>> =
            all.map { list -> list.filter { it.title.contains(q) || it.body.contains(q) } }
        override suspend fun favoriteIds(): List<String> = all.value.filter { it.favorite }.map { it.articleId }
        override suspend fun setFavorite(id: String, favorite: Boolean) {
            all.value = all.value.map { if (it.articleId == id) it.copy(favorite = favorite) else it }
        }
        override suspend fun upsertAll(articles: List<KnowledgeArticleEntity>) {
            all.value = (all.value.associateBy { it.articleId } + articles.associateBy { it.articleId }).values.toList()
        }
        override suspend fun count(): Int = all.value.size
    }

    private lateinit var dao: FakeDao
    private lateinit var viewModel: KnowledgeViewModel

    private fun article(id: String, title: String, body: String) =
        KnowledgeArticleEntity(id, title, "01-basics", "sha-$id", 0L, body = body)

    @Before fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        dao = FakeDao()
        dao.all.value = listOf(
            article("01-basics/01-a", "安装指南", "正文含 防火墙"),
            article("02-security/01-b", "安全基线", "正文"),
        )
        viewModel = KnowledgeViewModel(KnowledgeRepository(dao) { 0L }, TestDispatcherProvider())
    }

    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun `lists all articles initially`() {
        assertEquals(2, viewModel.state.value.articles.size)
    }

    @Test fun `search narrows by body keyword`() {
        viewModel.onQueryChange("防火墙")
        assertEquals(listOf("01-basics/01-a"), viewModel.state.value.articles.map { it.articleId })
    }

    @Test fun `favorite toggle persists via repository`() = runTest {
        val target = dao.all.value.first()
        viewModel.onToggleFavorite(target)
        assertEquals(true, dao.all.value.first { it.articleId == target.articleId }.favorite)
    }
}
