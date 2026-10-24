package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/**
 * Git 命令生成器（N-29）：场景化命令序列。护栏照 Web 版：绝不生成裸 --force，
 * 强推只给 --force-with-lease 并附风险说明。
 */
object GitLogic {
    data class Scenario(val key: String, val title: String, val lines: (String) -> List<String>)

    val SCENARIOS: List<Scenario> = listOf(
        Scenario("undo-commit", "撤销最近一次提交（保留改动）") { _ ->
            listOf(
                "git reset --soft HEAD~1",
                "# 改动会回到暂存区；若已推送，改用 revert 生成反向提交",
            )
        },
        Scenario("revert-commit", "安全撤销已推送的提交") { arg ->
            val target = arg.ifBlank { "<commit>" }
            listOf(
                "git revert $target",
                "git push",
                "# revert 不改历史，是团队仓库的正确做法",
            )
        },
        Scenario("force-push-safe", "改写历史后安全强推") { arg ->
            val branch = arg.ifBlank { "main" }
            listOf(
                "git push --force-with-lease origin $branch",
                "# 警告：只准对自己的分支使用；--force-with-lease 会在远程有新提交时拒绝覆盖",
                "# 本工具绝不生成裸 --force",
            )
        },
        Scenario("new-branch", "从当前提交拉新分支并推送") { arg ->
            val branch = arg.ifBlank { "feature/x" }
            listOf(
                "git switch -c $branch",
                "git push -u origin $branch",
            )
        },
        Scenario("sync-fork", "同步上游仓库到 fork") { arg ->
            val upstream = arg.ifBlank { "https://github.com/OWNER/REPO.git" }
            listOf(
                "git remote add upstream $upstream   # 已添加过则跳过",
                "git fetch upstream",
                "git switch main",
                "git merge upstream/main",
                "git push",
            )
        },
        Scenario("clean-merged", "清理已合并的本地分支") { _ ->
            listOf(
                "git branch --merged main | grep -vE '^\\*|main' | xargs -r git branch -d",
                "# -d 只删已合并分支（安全）；未合并的不会被误删",
            )
        },
    )

    fun generate(key: String, arg: String): AppResult<String> {
        val scenario = SCENARIOS.firstOrNull { it.key == key }
            ?: return fail("未知场景（可选 ${SCENARIOS.joinToString("/") { it.key }}）")
        if (arg.any { it in ";|&`\$" }) return fail("参数含 shell 特殊字符，已拒绝")
        return AppResult.Success(
            (listOf("# ${scenario.title}") + scenario.lines(arg.trim())).joinToString("\n")
        )
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
