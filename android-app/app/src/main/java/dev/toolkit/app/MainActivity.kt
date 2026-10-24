package dev.toolkit.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.currentBackStackEntryAsState
import dev.toolkit.core.ui.ThemeMode
import dev.toolkit.core.ui.ToolkitTheme
import dev.toolkit.feature.dashboard.DashboardScreen
import dev.toolkit.feature.settings.SettingsScreen
import dev.toolkit.feature.knowledge.ArticleScreen
import dev.toolkit.feature.knowledge.KnowledgeScreen
import dev.toolkit.feature.tools.ToolScreens
import dev.toolkit.feature.tools.ToolsRegistryImpl
import dev.toolkit.core.common.ToolId
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)
        setContent {
            val themeMode by container.settingsRepository.themeMode
                .collectAsState(initial = ThemeMode.SYSTEM)
            val themePalette by container.settingsRepository.themePalette
                .collectAsState(initial = dev.toolkit.core.ui.ThemePalette.WEBSITE)
            ToolkitTheme(mode = themeMode, palette = themePalette) {
                ToolkitApp(container, themeMode, themePalette)
            }
        }
    }
}

@Composable
private fun ToolkitApp(container: AppContainer, themeMode: ThemeMode, themePalette: dev.toolkit.core.ui.ThemePalette) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    val dashboardViewModel = remember { container.dashboardViewModel() }
    val knowledgeViewModel = remember { container.knowledgeViewModel() }
    val context = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.LaunchedEffect(Unit) {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            runCatching { container.importBundledContentIfEmpty(context) }
        }
    }
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    fun tabSelected(tab: String): Boolean = when (tab) {
        "knowledge" -> currentRoute == "knowledge" || currentRoute?.startsWith("article") == true
        "dashboard" -> currentRoute == "dashboard" || currentRoute?.startsWith("tool") == true
        else -> currentRoute == tab
    }
    fun goTab(route: String) {
        navController.navigate(route) {
            popUpTo(navController.graph.startDestinationId) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tabSelected("knowledge"),
                    onClick = { goTab("knowledge") },
                    icon = { Text("⌂") },
                    label = { Text("首页") },
                )
                NavigationBarItem(
                    selected = tabSelected("dashboard"),
                    onClick = { goTab("dashboard") },
                    icon = { Text("▦") },
                    label = { Text("工具") },
                )
                NavigationBarItem(
                    selected = tabSelected("settings"),
                    onClick = { goTab("settings") },
                    icon = { Text("⚙") },
                    label = { Text("设置") },
                )
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "knowledge",
            modifier = Modifier.padding(padding),
        ) {
            composable("dashboard") {
                DashboardScreen(
                    viewModel = dashboardViewModel,
                    onToolClick = { meta -> navController.navigate("tool/${meta.id.value}") },
                )
            }
            composable("tool/{toolId}") { entry ->
                val toolId = entry.arguments?.getString("toolId") ?: ""
                val toolName = runCatching { ToolsRegistryImpl.find(ToolId(toolId))?.name }.getOrNull()
                Column {
                    BackBar(title = toolName ?: "工具") { navController.popBackStack() }
                    ToolScreens.Content(toolId)
                }
            }
            composable("knowledge") {
                KnowledgeScreen(
                    viewModel = knowledgeViewModel,
                    onArticleClick = { article ->
                        navController.navigate("article/" + article.articleId.replace('/', ':'))
                    },
                )
            }
            composable("article/{key}") { entry ->
                val id = (entry.arguments?.getString("key") ?: "").replace(':', '/')
                val article by remember(id) { container.knowledgeRepository.observeArticle(id) }
                    .collectAsState(initial = null)
                val current = article
                if (current == null) {
                    Column {
                        BackBar(title = "教程") { navController.popBackStack() }
                        Text("文章加载中或不存在")
                    }
                } else {
                    Column {
                        BackBar(title = "教程") { navController.popBackStack() }
                        ArticleScreen(
                        article = current,
                        onToggleFavorite = {
                            scope.launch { container.knowledgeRepository.setFavorite(id, !current.favorite) }
                        },
                        onToolClick = { toolId -> navController.navigate("tool/$toolId") },
                    )
                    }
                }
            }
            composable("settings") {
                val pkgInfo = remember {
                    runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
                }
                @Suppress("DEPRECATION")
                val installedCode = pkgInfo?.versionCode ?: 0
                SettingsScreen(
                    versionName = pkgInfo?.versionName ?: "未知",
                    versionCode = installedCode,
                    themeMode = themeMode,
                    onThemeModeChange = { mode ->
                        scope.launch { container.settingsRepository.setThemeMode(mode) }
                    },
                    themePalette = themePalette,
                    onThemePaletteChange = { palette ->
                        scope.launch { container.settingsRepository.setThemePalette(palette) }
                    },
                )
            }
        }
    }
}

/** 详情页返回栏：工具页与文章页共用，保证任何入口都有明确的返回路径。 */
@Composable
private fun BackBar(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onBack) { Text("← 返回") }
        Text(title, style = MaterialTheme.typography.titleMedium)
    }
}
