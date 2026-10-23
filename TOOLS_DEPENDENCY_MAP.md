# 工具依赖关系图（TOOLS_DEPENDENCY_MAP）

- 基准日期：2026-10-23
- 基线声明：本图描述**本地工作区完成态**的 `docs/tools/index.md`（仓库 `main` = `fa337f1`，工具改动尚未推送）。依赖结论均以当前文件实查为准（函数定义/调用行号、网络调用点计数），不画未实证的依赖。
- 一句话结论：38 个工具是单文件内的原生 JS，运行期只依赖三样东西——MkDocs Material 提供的页面运行时（`document$`）、浏览器原生 API（Clipboard、WebCrypto）、以及全页共享的少数基础函数；**外部网络依赖只有 N-01 一个工具、两个可选中端点**，其余 37 个工具零网络请求、零第三方库、零 CDN。

## 一、运行期依赖

| 依赖 | 提供方 | 用途 | 失效时影响 | 备注 |
|---|---|---|---|---|
| MkDocs Material 主题运行时（`document$` 可观察对象） | 构建时引入的 Material 主题包 | 工具 init 的订阅注册通道之一，适配 Material 的即时导航（instant navigation）页面切换 | init 另有 DOMContentLoaded 与直接调用两条兜底通道，单一通道失效不至全灭（三通道注册制，见 §三） | 工具不依赖 Material 的其他组件；页面脱离主题独立打开时靠兜底通道初始化 |
| 浏览器 DOM / 事件模型 | 浏览器原生 | 全部表单交互与输出渲染 | 无此则页面不可用（浏览器基本前提） | 代码为 ES5 风格（`var`/`function`），无框架、无构建转译 |
| Clipboard API（`navigator.clipboard.writeText`） | 浏览器原生 | 「复制结果」按钮 | 复制按钮不可用时用户可手动选中输出区文本复制，生成/计算功能不受影响 | 需安全上下文（HTTPS 或 localhost）；经共享 `bindCopy` 统一调用 |
| WebCrypto（`crypto.subtle.digest`） | 浏览器原生 | N-02 证书指纹、N-25 Hash 的 SHA 系列摘要计算 | 两个工具在不支持 SubtleCrypto 的环境下明确报错「需要 HTTPS 页面」，不静默失败 | 仅此两个工具使用；其余工具不依赖 |
| fetch（仅 N-01） | 浏览器原生 | DNS 查询向所选 DoH 解析商发 GET 请求 | 无网络/解析商不可达时 N-01 报错并给 `dig` 兜底命令，不影响其余 37 个工具 | 全页仅 1 处 fetch 调用点，见 §四 |

非依赖（明确排除）：无 jQuery/Vue/React 等框架，无任何第三方 JS 库，无外部字体/脚本 CDN，无 localStorage/cookie 持久化（工具状态不落盘），无分析/统计脚本参与工具逻辑。

## 二、页面内共享基础函数

全部工具同居一个 `<script>` 块，以下函数为多工具共用的基础设施（定义行号以本地工作区当前文件为准）。批次工具（A–D）开发时即按规格复用同一套 init/复制模式，未另起实现。

| 共享函数 | 定义位置 | 共用方 | 职责 |
|---|---|---|---|
| `bindCopy(btnId, outId, msgId)` + `showCopyToast()` | 第 4380 / 4365 行 | **全部 38 个工具**的复制按钮 | 读输出区 `textContent` → Clipboard API 写入 → msg 区/Toast 反馈；复制行为全页一致 |
| init 三通道注册（每工具一个 `initXxx`） | 各 init 函数尾部 | 全部 38 个工具 | 同一 init 同时以 `document$.subscribe`、DOMContentLoaded、直接调用三种方式注册并以 `data-ready` 防重复绑定，适配整页加载与 Material 即时导航两种进入方式 |
| `parseCidr4(v)` | 第 1792 行 | Netplan 生成器、UFW 生成器、Nginx 生成器 | IPv4 CIDR 结构校验（内部调用 `subParseIp`） |
| `parseCidr6(v)` / `isValidIpv6(v)` | 第 1835 / 1802 行 | Netplan 生成器、UFW 生成器（含 P0-1 新增的 IPv6 来源分支）、Nginx 生成器 | IPv6 地址与 CIDR 校验；P0-1 的 UFW IPv6 支持即复用此组，未新写解析器 |
| `subParseIp(v)` | 第 2416 行 | `parseCidr4`、UFW 生成器、子网计算器 | IPv4 点分四段解析基础函数（函数声明提升，故定义虽在子网工具区，前部工具亦可调用） |
| `parsePortStrict(raw)` | 第 1844 行 | UFW 生成器、SSH 命令生成器（config 片段）、Nginx 生成器 | 端口严格解析（整数、1–65535），拒绝含糊输入 |
| IPv6 展开/压缩组（`ipv6ExpandGroups` 等） | 第 2431 行起 | 子网计算器（N-21 的 v6 路径） | IPv6 展开、压缩与大整数换算，工具内专用，不跨工具共用——列此行以示与上表共享组的区分 |

依赖方向是单向的：工具 → 共享函数 → 浏览器 API。共享函数之间除 `parseCidr4 → subParseIp` 一处外不互相调用；任一工具的 generate 函数不调用其他工具的 generate 函数（N-09 矩阵与 UFW 生成器、N-08 Timer 与 Unit 生成器等相邻对是「各写各的、输出口径对齐」，非代码调用——审计已确认补缺非重写、亦非互相依赖）。

## 三、外部网络依赖（全站工具页仅一处）

| 项目 | 内容 |
|---|---|
| 唯一联网工具 | N-01 DNS 解析与记录查询（ID 前缀 `dns`），全页脚本仅 1 处 `fetch` 调用点（`dnsRun`） |
| 触发条件 | **仅用户点击「查询」按钮后**；init、切换下拉、输入变化均不发请求（批次 D 断言：fetch 计数为 0） |
| 端点（二选一，用户在工具内选定） | Cloudflare：`https://cloudflare-dns.com/dns-query`（请求头 `Accept: application/dns-json`）；Google：`https://dns.google/resolve`；均为 GET + JSON 响应 |
| 发送的数据 | 仅用户填写的查询名与记录类型；不发送任何其他页面数据 |
| 其余 37 个工具 | 零网络请求：无 fetch/XHR、无图片/字体外链、无 CDN；断网环境下（页面已加载）功能完整 |

注：N-03 响应头分析「生成 curl 命令」不算网络依赖——工具只拼命令文本供用户在自己机器执行，工具本身不发请求（批次 D 断言其无 fetch 代码路径）。

## 四、构建期依赖

| 依赖 | 用途 | 备注 |
|---|---|---|
| MkDocs + MkDocs Material | 站点构建与主题（含 §一 的 `document$` 运行时与搜索 UI） | 已锁定版本：仓库根 `requirements.txt`（mkdocs 1.6.1 / mkdocs-material 9.7.7，与 jieba 0.42.1 一并锁定，2026-10-23 治理批次落地）；CI 按该文件安装 |
| jieba | 中文搜索分词（`search` 插件 `lang: zh` 的分词支持） | 与工具逻辑无关，仅影响站内搜索质量；工具页被搜索索引收录但工具本身不依赖搜索 |
| Python + PyYAML（仅测试期，见 §五） | Netplan 产物与云配置产物的结构断言 | 不进构建产物 |

## 五、测试期依赖

| 依赖 | 用途 | 备注 |
|---|---|---|
| Node.js（实测 v24.22.1） | 运行全部 jsdom 测试脚本 | 脚本正迁入仓库 `tests/tools/`，运行方法以该目录 README 为准（见 `TOOLS_TEST_MATRIX.md`） |
| jsdom | 在 Node 内驱动批次片段页与构建成品页做 DOM 断言 | 剪贴板、fetch 在测试中以桩替换；桩的边界（不等于真实浏览器/真实网络）已在测试矩阵的未覆盖项中如实列明 |
| python3 + PyYAML / tomllib / systemd-analyze / openssl（交叉验证，按需） | 产物回读解析（YAML/TOML）、Timer 表达式验算、证书 DER 对照 | 只在对应批次的交叉验证中使用，不是全量测试的前置 |

## 六、依赖风险摘要

| 风险 | 等级 | 说明 |
|---|---|---|
| 单文件巨页（38 工具同一文件） | 中 | 任一工具改动需整页回归（现以三套整页冒烟 + 专项矩阵兜底）；拆分独立页属信息架构批次范围 |
| `document$` 随 Material 大版本变化 | 低 | 三通道注册有兜底；升级主题后应复跑整页冒烟 |
| DoH 解析商接口变更 | 低 | 仅影响 N-01；返回形状已留 curl 基线（见测试矩阵 §五）便于比对定位 |
| 构建依赖版本漂移 | 低 | 已由 `requirements.txt` 锁定 + Dependabot 周巡检缓解（2026-10-23 治理批次）；升级走 PR 并过完整 CI |
