package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** GitHub Actions 工作流生成器（N-05）：常见运行时 CI 模板。 */
object ActionsLogic {
    fun generate(name: String, branch: String, runtime: String, version: String): AppResult<String> {
        if (name.isBlank()) return fail("工作流名不能为空")
        if (!branch.matches(Regex("[A-Za-z0-9/_.-]+"))) return fail("分支名不合法")
        val setup = when (runtime) {
            "node" -> """
                |      - uses: actions/setup-node@v4
                |        with:
                |          node-version: '$version'
                |      - run: npm ci
                |      - run: npm test""".trimMargin()
            "python" -> """
                |      - uses: actions/setup-python@v5
                |        with:
                |          python-version: '$version'
                |      - run: pip install -r requirements.txt
                |      - run: python -m pytest""".trimMargin()
            "go" -> """
                |      - uses: actions/setup-go@v5
                |        with:
                |          go-version: '$version'
                |      - run: go build ./...
                |      - run: go test ./...""".trimMargin()
            else -> return fail("运行时可选 node/python/go")
        }
        if (!version.matches(Regex("[0-9]+(\\.[0-9]+)*"))) return fail("版本号格式如 20、3.12、1.22")
        val text = """
            |name: $name
            |
            |on:
            |  push:
            |    branches: [$branch]
            |  pull_request:
            |
            |jobs:
            |  build:
            |    runs-on: ubuntu-latest
            |    steps:
            |      - uses: actions/checkout@v4
            |$setup
            """.trimMargin()
        return AppResult.Success(text)
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
