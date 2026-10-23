# 内容同步协议（Content Sync Protocol）V1

本站是唯一内容源。本协议定义如何把 `docs/` 的文章导出为结构化内容包，供安卓 App 及其他消费端离线同步。生成器为 `scripts/export-content.py`（Python 标准库，无第三方依赖），导出物默认写到仓库根 `content-export/`（构建产物，已在 `.gitignore` 中排除，不入库）。

## 导出物结构

```text
content-export/
├── manifest.json   # 入口清单
├── catalog.json    # 全部文章元数据
└── articles/       # 文章 Markdown 原文，按 docs/ 相对路径镜像
    └── 04-network/07-keepalived-vrrp.md
```

## manifest.json 字段

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 协议版本（整数）。字段语义不兼容变更时 +1；消费端只处理自己认识的版本 |
| `generated_at` | 导出时间（UTC，ISO 8601） |
| `article_count` / `section_count` | 本次导出的文章与部分总数 |
| `catalog_file` / `catalog_sha256` | catalog 文件名与其内容 SHA-256，消费端下载后先验哈希再解析 |
| `articles_prefix` | 文章原文的路径前缀（相对内容包根） |

## catalog.json 结构

- `sections[]`：`section`（部分目录名，如 `04-network`）、`title`（该部分导览页标题）、`order`。
- `articles[]` 每篇字段：
  - `article_id`：**稳定标识**。规则 = 文章在 `docs/` 下的相对路径去掉 `.md` 后缀（如 `04-network/07-keepalived-vrrp`）。文件不改名，ID 不变；**改名即新 ID**，旧 ID 不复用（预留 `aliases` 机制，本版本未启用，启用时以新增字段方式扩展，不改既有字段语义）。
  - `title`（正文第一个一级标题）、`description`（front matter）、`section`、`order`（文件名数字前缀）。
  - `path`（原文相对路径）、`sha256`（原文文件字节的 SHA-256）、`bytes`。
  - `verification`（可选）：该篇在 Ubuntu 22.04 / 24.04 / 26.04 的验证状态，源头是 `docs/compatibility.md` 的逐章表；兼容表无此篇时字段缺省，消费端应按「未标注」处理，不要自行推断。

导出范围：`docs/` 下全部非 `index.md` 文章，不含站点首页与工具页——工具页是交互程序而非文章，工具在 App 端按 `TOOLS_ANDROID_REUSE_PLAN.md` 的 A/B/C 分类另行实现与下发，不走本文协议。各部分导览（`index.md`）只贡献部分标题，不作为文章导出。

## 消费端同步流程（以 App 为例）

1. 拉取 `manifest.json`，比对本地记录的 `catalog_sha256`：相同则已是最新，结束。
2. 拉取 `catalog.json` 并校验其 SHA-256 与 manifest 记录一致；不一致丢弃并报错，不入库。
3. 逐篇比对本地已存文章的 `sha256`：新增或哈希不同的，按 `articles/<path>` 拉取原文，校验单篇哈希后写入本地库；catalog 中已消失的文章在本地删除（或按产品策略下架）。
4. 全部完成后更新本地 `catalog_sha256` 基线。任一步失败保留旧基线，下次重试——不允许出现「目录是新的、正文是旧的」半同步状态对外可见（先写库、后切基线）。

## 版本与兼容规则

- 消费端见到高于自身支持的 `schema_version` 时应停止同步并提示升级，不要猜测解析。
- 协议扩展只允许新增可选字段；删除或改名字段必须升 `schema_version` 并在本文件记录迁移说明。
- 生成器对同一份 `docs/` 内容必须产出除 `generated_at` 外逐字节一致的 catalog（文章排序键为 section、order、article_id），以便哈希比对稳定。

## 生成与校验

```bash
python3 scripts/export-content.py            # 生成 content-export/ 并自动跑一遍校验
python3 scripts/export-content.py --verify   # 只校验已有导出包（哈希、计数、与源对账）
```

校验项：manifest/catalog 存在、catalog 哈希与 manifest 一致、文章数一致、article_id 唯一、逐篇哈希一致、与 `docs/` 源扫描集合对账（无漏篇、无陈旧篇）。CI 的构建作业会运行生成+校验，导出包与源不一致时 CI 失败。
