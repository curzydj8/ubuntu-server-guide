# 贡献指南（仓库级）

面向读者的完整贡献规范在站内 [参与共建](docs/reference/contributing.md) 页；本文件只补充仓库层面的操作约定，两者冲突时以站内规范的内容标准为准、本文件的流程标准为准。

## 本地开发

```bash
pip install -r requirements.txt   # 构建依赖已锁定版本
mkdocs build --strict             # 构建校验（警告即失败，与 CI 一致）
mkdocs serve                      # 本地预览
```

## 提交前

- 用仓库根 `.markdownlint.json` 规则跑 `npx markdownlint-cli2 "docs/**/*.md" "TOOLS_*.md" "CONTRIBUTING.md" "SECURITY.md"`，0 问题再提交（历史报告 AUDIT_REPORT.md 不纳入格式门禁）。
- 改动工具页（`docs/tools/index.md`）后，按 `tests/tools/README.md` 跑全套工具测试。
- 章节类变更必须带「效果验证」与「回滚/恢复」内容，且回滚/恢复须为标题含「回滚」或「恢复」二字的独立小节（可检索核查），新增操作步骤要写清出错时如何退回，这是本仓库的强制子节要求。
- 命令与配置示例不许出现未加引号的尖括号占位符挂在 shell 参数位（会被解析为重定向）；占位符放注释、引号或配置文件中。
- 验证级别如实标注：没在实机跑过的写「文档核对」，没核对的写「待核验」，禁止把计划写成完成、把未跑的测试写成通过。

## 依赖与自动化

- 构建依赖锁定在 `requirements.txt`，工具测试依赖锁定在 `tests/tools/package.json`（含 lockfile）；升级走 Dependabot PR 并过完整 CI。
- GitHub Actions 一律按完整 commit SHA 固定（行尾注释对应版本），禁止只写浮动标签。
- 分支保护等仓库设置不在代码内管理，调整需仓库所有者单独批准。

工具清单与测试证据见 `TOOLS_MASTER_INVENTORY.md` 与 `TOOLS_TEST_MATRIX.md`；安全问题报告见 `SECURITY.md`。
