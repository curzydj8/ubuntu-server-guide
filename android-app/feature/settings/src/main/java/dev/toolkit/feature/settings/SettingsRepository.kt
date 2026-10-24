package dev.toolkit.feature.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dev.toolkit.core.ui.ThemeMode
import dev.toolkit.core.ui.ThemePalette
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "toolkit-settings")

/** 设置仓库：主题模式等轻量偏好走 DataStore（凭据类数据严禁入此，走 core:security 保险库）。 */
class SettingsRepository(private val context: Context) {
    private val themeKey = stringPreferencesKey("theme_mode")

    val themeMode: Flow<ThemeMode> = context.dataStore.data.map { prefs ->
        when (prefs[themeKey]) {
            "LIGHT" -> ThemeMode.LIGHT
            "DARK" -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        context.dataStore.edit { it[themeKey] = mode.name }
    }

    private val paletteKey = stringPreferencesKey("theme_palette")

    val themePalette: Flow<ThemePalette> = context.dataStore.data.map { prefs ->
        ThemePalette.entries.firstOrNull { it.name == prefs[paletteKey] } ?: ThemePalette.WEBSITE
    }

    suspend fun setThemePalette(palette: ThemePalette) {
        context.dataStore.edit { it[paletteKey] = palette.name }
    }
}
