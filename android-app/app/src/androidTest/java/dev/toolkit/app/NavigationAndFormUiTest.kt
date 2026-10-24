package dev.toolkit.app

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Rule
import org.junit.Test

/**
 * W1 仪器化 UI 测试（真机，确定性断言）。
 * 不依赖服务器与网络：不点检查更新（结果依赖被污染的网络），不进终端/诊断（需真实会话）。
 */
class NavigationAndFormUiTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    /**
     * 容忍式滚动：工具列表为普通 Column 时节点没有可滚动父布局，performScrollTo 会抛
     * "no parent layout with a Scroll SemanticsAction"（W1 真机实测：3 条失败同根因）。
     * 此时节点多半已可见，直接继续，后续 assertIsDisplayed / performClick 会如实判定。
     */
    private fun SemanticsNodeInteraction.scrollIfPossible(): SemanticsNodeInteraction {
        try {
            performScrollTo()
        } catch (e: AssertionError) {
            // 已可见或不可滚动：不掩盖后续真实断言
        }
        return this
    }

    private fun goTools() {
        composeRule.onNodeWithText("工具").performClick()
        composeRule.onNodeWithText("🖥 服务器管理（SSH）").scrollIfPossible()
    }

    @Test
    fun bottomNav_navigatesToToolsAndSettings() {
        composeRule.onNodeWithText("Ubuntu Server 终极指南").assertIsDisplayed()
        goTools()
        composeRule.onNodeWithText("🖥 服务器管理（SSH）").assertIsDisplayed()
        composeRule.onNodeWithText("设置").performClick()
        composeRule.onNodeWithText("版本与更新").assertIsDisplayed()
    }

    @Test
    fun serversEntry_opensServerManagement() {
        goTools()
        composeRule.onNodeWithText("🖥 服务器管理（SSH）").performClick()
        composeRule.onNodeWithText("＋ 添加主机").assertIsDisplayed()
    }

    @Test
    fun serverEdit_blankSaveShowsValidationError() {
        goTools()
        composeRule.onNodeWithText("🖥 服务器管理（SSH）").performClick()
        composeRule.onNodeWithText("＋ 添加主机").performClick()
        composeRule.onNodeWithText("别名 *").assertIsDisplayed()
        composeRule.onNodeWithText("保存").scrollIfPossible().performClick()
        composeRule.onNode(hasText("⚠", substring = true)).assertIsDisplayed()
    }

    @Test
    fun settings_showsVersionAndUpdateButton() {
        composeRule.onNodeWithText("设置").performClick()
        composeRule.onNode(hasText("当前版本：", substring = true)).assertIsDisplayed()
        composeRule.onNodeWithText("检查更新").assertIsDisplayed()
    }
}
