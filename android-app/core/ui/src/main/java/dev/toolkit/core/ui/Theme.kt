package dev.toolkit.core.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** 应用主题模式：跟随系统 / 强制浅色 / 强制深色（DataStore 持久化，见 feature:settings）。 */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/**
 * 主题配色（设置页可选，DataStore 持久化）：
 * WEBSITE 与指南网站同色系（Material Deep Orange）；DYNAMIC 为跟随壁纸的动态色（旧行为）；
 * 其余为固定配色。每套固定配色都含浅/深两版，与 ThemeMode 正交组合。
 */
enum class ThemePalette(val swatch: Color) {
    WEBSITE(Color(0xFFFF5722)),
    DYNAMIC(Color(0xFF8A8A8A)),
    DEEP_SEA(Color(0xFF0B57D0)),
    FOREST(Color(0xFF146C2E)),
    VIOLET(Color(0xFF6750A4)),
}

private val WebsiteLight = lightColorScheme(
    primary = Color(0xFFD84315), onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFDBCF), onPrimaryContainer = Color(0xFF5F1900),
    secondary = Color(0xFF8D5B4C), tertiary = Color(0xFF6C5D2E),
    secondaryContainer = Color(0xFFFFDBCF), onSecondaryContainer = Color(0xFF5F1900),
    background = Color(0xFFFFF9F6), surface = Color(0xFFFFF9F6),
    surfaceVariant = Color(0xFFF7DCD2), onSurface = Color(0xFF2A1710),
    onSurfaceVariant = Color(0xFF57423A),
    // 容器色显式给定（网站浅色系暖灰），避免回落到 Material 基线紫灰
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFBF3EE),
    surfaceContainer = Color(0xFFF6EDE8),
    surfaceContainerHigh = Color(0xFFF0E6E0),
    surfaceContainerHighest = Color(0xFFEADFD8),
    surfaceDim = Color(0xFFE3D5CE), surfaceBright = Color(0xFFFFF9F6),
    outline = Color(0xFF8D7166), outlineVariant = Color(0xFFDCC3B8),
)
private val WebsiteDark = darkColorScheme(
    primary = Color(0xFFFFB59D), onPrimary = Color(0xFF5F1900),
    primaryContainer = Color(0xFF8A3A14), onPrimaryContainer = Color(0xFFFFDBCF),
    secondary = Color(0xFFE7BFA9), tertiary = Color(0xFFD3C48C),
    secondaryContainer = Color(0xFF6E3418), onSecondaryContainer = Color(0xFFFFDBCF),
    // 深色背景改用网站 slate 原色（hue 225 / 15%）：背景 14%、面板 18%、最深 8%
    // 取自网站 palette CSS 的 --md-default-bg-color / --md-code-bg-color / footer
    background = Color(0xFF1E2129), surface = Color(0xFF1E2129),
    surfaceVariant = Color(0xFF272A35), onSurface = Color(0xFFD7DAE0),
    onSurfaceVariant = Color(0xFFB7BAC2),
    surfaceContainerLowest = Color(0xFF0E1013),
    surfaceContainerLow = Color(0xFF23262F),
    surfaceContainer = Color(0xFF272A35),
    surfaceContainerHigh = Color(0xFF2D303B),
    surfaceContainerHighest = Color(0xFF333743),
    surfaceDim = Color(0xFF111317), surfaceBright = Color(0xFF383C47),
    outline = Color(0xFF8B9099), outlineVariant = Color(0xFF43464E),
)
private val DeepSeaLight = lightColorScheme(
    primary = Color(0xFF0B57D0), onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD3E3FD), onPrimaryContainer = Color(0xFF041E49),
    secondary = Color(0xFF00639B), tertiary = Color(0xFF007B83),
    background = Color(0xFFF9FAFE), surface = Color(0xFFF9FAFE),
    surfaceVariant = Color(0xFFDDE3EA), onSurface = Color(0xFF131B2C),
    outline = Color(0xFF737B89),
)
private val DeepSeaDark = darkColorScheme(
    primary = Color(0xFFA8C7FA), onPrimary = Color(0xFF062E6F),
    primaryContainer = Color(0xFF0842A0), onPrimaryContainer = Color(0xFFD3E3FD),
    secondary = Color(0xFF7FD0FF), tertiary = Color(0xFF6FD8D2),
    background = Color(0xFF0A111E), surface = Color(0xFF0A111E),
    surfaceVariant = Color(0xFF232A35), onSurface = Color(0xFFDCE3F0),
    outline = Color(0xFF8A919E),
)
private val ForestLight = lightColorScheme(
    primary = Color(0xFF146C2E), onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFC4EED0), onPrimaryContainer = Color(0xFF072711),
    secondary = Color(0xFF386A20), tertiary = Color(0xFF19686B),
    background = Color(0xFFF7FBF2), surface = Color(0xFFF7FBF2),
    surfaceVariant = Color(0xFFDCE5D4), onSurface = Color(0xFF131A12),
    outline = Color(0xFF71796C),
)
private val ForestDark = darkColorScheme(
    primary = Color(0xFF88D99A), onPrimary = Color(0xFF00391A),
    primaryContainer = Color(0xFF005227), onPrimaryContainer = Color(0xFFB6F2C0),
    secondary = Color(0xFFA9D68B), tertiary = Color(0xFF7BD8D2),
    background = Color(0xFF0B130C), surface = Color(0xFF0B130C),
    surfaceVariant = Color(0xFF232D24), onSurface = Color(0xFFDDE8DC),
    outline = Color(0xFF8B9489),
)
private val VioletLight = lightColorScheme(
    primary = Color(0xFF6750A4), onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFEADDFF), onPrimaryContainer = Color(0xFF21005D),
    secondary = Color(0xFF625B71), tertiary = Color(0xFF7D5260),
    background = Color(0xFFFEF7FF), surface = Color(0xFFFEF7FF),
    surfaceVariant = Color(0xFFE7E0EC), onSurface = Color(0xFF1D1B20),
    outline = Color(0xFF79747E),
)
private val VioletDark = darkColorScheme(
    primary = Color(0xFFD0BCFF), onPrimary = Color(0xFF381E72),
    primaryContainer = Color(0xFF4F378B), onPrimaryContainer = Color(0xFFEADDFF),
    secondary = Color(0xFFCCC2DC), tertiary = Color(0xFFEFB8C8),
    background = Color(0xFF141218), surface = Color(0xFF141218),
    surfaceVariant = Color(0xFF49454F), onSurface = Color(0xFFE6E0E9),
    outline = Color(0xFF938F99),
)

private fun ThemePalette.fixedScheme(dark: Boolean): ColorScheme = when (this) {
    ThemePalette.WEBSITE -> if (dark) WebsiteDark else WebsiteLight
    ThemePalette.DEEP_SEA -> if (dark) DeepSeaDark else DeepSeaLight
    ThemePalette.FOREST -> if (dark) ForestDark else ForestLight
    ThemePalette.VIOLET -> if (dark) VioletDark else VioletLight
    ThemePalette.DYNAMIC -> if (dark) darkColorScheme() else lightColorScheme()
}

@Composable
fun ToolkitTheme(
    mode: ThemeMode = ThemeMode.SYSTEM,
    palette: ThemePalette = ThemePalette.WEBSITE,
    content: @Composable () -> Unit,
) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val context = LocalContext.current
    val colors = when {
        palette == ThemePalette.DYNAMIC && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        else -> palette.fixedScheme(dark)
    }
    MaterialTheme(colorScheme = colors, content = content)
}
