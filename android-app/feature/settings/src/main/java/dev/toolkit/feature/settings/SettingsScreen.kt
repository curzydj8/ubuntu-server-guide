package dev.toolkit.feature.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.toolkit.core.network.OkHttpNetworkClient
import dev.toolkit.core.ui.ThemeMode
import dev.toolkit.core.ui.ThemePalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 设置页：主题、版本与检查更新、关于。 */
@Composable
fun SettingsScreen(
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    themePalette: ThemePalette = ThemePalette.WEBSITE,
    onThemePaletteChange: (ThemePalette) -> Unit = {},
    versionName: String = "未知",
    versionCode: Int = 0,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember { OkHttpNetworkClient() }
    var updateText by remember { mutableStateOf<String?>(null) }
    var downloadUrl by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }

    Column(
        modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("设置", style = MaterialTheme.typography.headlineSmall)
        Text("主题模式", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ThemeMode.entries.forEach { mode ->
                FilterChip(
                    selected = themeMode == mode,
                    onClick = { onThemeModeChange(mode) },
                    label = {
                        Text(
                            when (mode) {
                                ThemeMode.SYSTEM -> "跟随系统"
                                ThemeMode.LIGHT -> "浅色"
                                ThemeMode.DARK -> "深色"
                            }
                        )
                    },
                )
            }
        }
        Text("主题颜色", style = MaterialTheme.typography.titleMedium)
        ThemePalette.entries.chunked(3).forEach { rowPalettes ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowPalettes.forEach { palette ->
                    FilterChip(
                        selected = themePalette == palette,
                        onClick = { onThemePaletteChange(palette) },
                        leadingIcon = {
                            androidx.compose.foundation.layout.Box(
                                Modifier
                                    .size(14.dp)
                                    .background(palette.swatch, androidx.compose.foundation.shape.CircleShape)
                            )
                        },
                        label = {
                            Text(
                                when (palette) {
                                    ThemePalette.WEBSITE -> "网站同款"
                                    ThemePalette.DYNAMIC -> "跟随壁纸"
                                    ThemePalette.DEEP_SEA -> "深海蓝"
                                    ThemePalette.FOREST -> "墨绿"
                                    ThemePalette.VIOLET -> "紫罗兰"
                                }
                            )
                        },
                    )
                }
            }
        }
        Text("版本与更新", style = MaterialTheme.typography.titleMedium)
        Text("当前版本：$versionName（$versionCode）")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    checking = true; updateText = null; downloadUrl = null
                    scope.launch {
                        val result = withContext(Dispatchers.IO) {
                            UpdateChecker.check(client, versionCode)
                        }
                        updateText = when (result) {
                            is UpdateChecker.Result.UpToDate -> "已是最新版本"
                            is UpdateChecker.Result.Available -> {
                                downloadUrl = result.apkUrl.ifBlank { null }
                                "发现新版 ${result.versionName}" +
                                    if (result.notes.isNotBlank()) "：${result.notes}" else ""
                            }
                            is UpdateChecker.Result.Failed -> "检查失败：${result.reason}"
                        }
                        checking = false
                    }
                },
                enabled = !checking,
            ) { Text(if (checking) "检查中…" else "检查更新") }
            downloadUrl?.let { url ->
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }) { Text("打开下载页") }
            }
        }
        updateText?.let { Text(it) }
        Text("关于", style = MaterialTheme.typography.titleMedium)
        Text("Linux Server Toolkit $versionName\n与 Ubuntu Server 终极指南同源的离线工具集：工具数据来自内容同步协议，凭据只存本机 Keystore 保险库。")
    }
}
