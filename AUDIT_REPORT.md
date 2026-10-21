# 扩展报告：SSH 专题与 Linux 命令速查手册（第 14、15 部分）

- 日期：2026-10-21
- 范围：在不重建项目、不删除现有内容的前提下，为本站增量新增第 14 部分「SSH 专题：连接、密钥与隧道」、第 15 部分「Linux 命令速查手册」，并在互动工具页新增 SSH 命令生成器。

## 一、阶段一审计结论（动手前）

- 修改前基线提交：main `a2acdbec7807a6dd1f9df16e9d51bde98beec75e`、gh-pages `b04a0f2d5e9e76761602211ca4640e028a244aef`；Pages 状态 `built`。
- 已有 SSH 内容盘点（按提及量）：`02-security/01-ssh-hardening.md`（服务端加固：密钥生成、改端口、禁 root/密码、MFA，约 16KB）为存量核心；`07-automation/03-ansible.md`、`02-security/04-defense.md`（Fail2ban 与 SSH）、`08-troubleshooting/05-disaster-recovery-migration.md`（含 SSH 密钥丢失恢复）、`02-security/03-firewall.md`、`04-network/03-vpn-tunnel.md` 均有 SSH 相关段落。
- 审计结论与分工：存量内容偏「服务端加固」，缺的是「客户端使用」体系（连接与 config、Agent 与轮换、传输与远程执行、隧道与跳板、客户端视角排错）。新第 14 部分按客户端视角组织，与第 02 部分互链分工：第 14 部分第 03 章只讲密钥生命周期与关密码登录的安全顺序，服务端参数全表与 MFA 只链接回 `02-security/01-ssh-hardening.md`，不复制；第 06 章的加固部分只给清单化增量。命令速查与正文教程重复的命令只给速查深度并回链教程章。
- 导航为 mkdocs.yml 显式 nav；工具页为纯前端（原生表单 + vanilla JS + document$ 双通道初始化），新生成器沿用该实现，未引入后端或新依赖。

## 二、新增与修改文件

新增（14 个）：

- `docs/14-ssh/index.md`（导览，6.7KB）
- `docs/14-ssh/01-principles-install.md`（18.0KB）
- `docs/14-ssh/02-connect-config.md`（18.3KB）
- `docs/14-ssh/03-keys-agent.md`（18.0KB）
- `docs/14-ssh/04-transfer-remote-exec.md`（17.4KB）
- `docs/14-ssh/05-tunnels-jump.md`（17.9KB）
- `docs/14-ssh/06-troubleshooting-hardening.md`（19.0KB）
- `docs/15-command-reference/index.md`（导览，5.1KB）
- `docs/15-command-reference/01-files-permissions.md`（19.9KB，16 条目）
- `docs/15-command-reference/02-packages-services.md`（12.5KB，8 条目）
- `docs/15-command-reference/03-network-diagnostics.md`（16.0KB，11 条目）
- `docs/15-command-reference/04-disk-process.md`（19.4KB，16 条目）
- `docs/15-command-reference/05-text-archive.md`（15.5KB，13 条目）
- `docs/15-command-reference/06-scheduling-containers-more.md`（20.7KB，15 条目）

修改（5 个）：

- `mkdocs.yml`：nav 新增第 14、15 部分共 14 项。
- `docs/index.md`：内容地图加两行、阅读路径加 SSH 实战入口、互动工具说明与摘要更新为 15 个部分。
- `docs/tools/index.md`：新增 SSH 命令生成器（见下）；页首计数与说明同步为三个生成器。
- `docs/compatibility.md`：逐章验证状态表追加 14 行（14、15 两部分导览与全部章节）。
- `docs/changelog.md`：新增扩展记录条目与 v5.0 版本行。

## 三、新增功能：SSH 命令生成器

- 位置：`docs/tools/index.md`，沿用现有生成器的实现风格（原生 HTML 表单 + vanilla JS、复制 toast 共用、document$ + DOMContentLoaded 双通道初始化、防重复绑定守卫与其他生成器一致）。
- 类型：登录、上传文件（scp）、下载文件（scp）、本地转发（-L）、远程转发（-R）、动态转发（SOCKS）、调试模式（-vvv）、经跳板机（ProxyJump）；附加字段（文件路径 / 监听与目标端口 / 跳板机）随类型切换显示。
- 校验：主机与用户名非空且字符集受限、端口与转发端口 1–65535 数值校验、错误以红色提示框呈现且预览区不出可复制的错误命令；含空格的路径自动单引号包裹。
- 安全提示：页面 danger 块明示「私钥只填路径、绝不粘贴私钥内容」，工具只在浏览器本地拼字符串，不连接、不上传。
- 回归测试：Node vm 沙盒 + DOM 桩实跑 27 项用例全过（8 种类型生成、端口/路径边界、非法输入报错、空格路径引用、复制回执与 toast、防重复绑定、与既有 Netplan/UFW 生成器互不干扰）。

## 四、导航与搜索验证

- 构建：`mkdocs build` 成功，无链接类警告；新部分 14 个页面全部生成。
- 内链：对新增/修改文件内的 224 条站内相对链接逐条解析校验，全部指向真实文件，无断链。
- 上一篇/下一篇（构建产物抽查）：第 14 部分导览 prev=13/03 IaC、next=14/01；14/01 next=14/02；15/06 prev=15/05、next=互动工具，顺序与 nav 一致。
- 全文搜索索引：条目 881 → 1089（+208），新部分 14 页全部入索引；关键词命中（线上索引复核一致）：`ProxyJump` 0 → 9、`ssh-copy-id` 2 → 4、`restic` 8 → 13、`ControlMaster` 命中 14/02 配置节。

## 五、自动化检查结果

- Shell 语法：从 12 篇新章提取全部 147 个 bash 代码块逐个 `bash -n`，全部通过（0 错误）。
- 生成器边界测试：见第三节，27/27 通过。
- 发布完整性：main 与 gh-pages 均以 Git Data API 自底向上建树推送，推送后递归 tree 与本地逐文件 SHA 比对：main 98 文件、gh-pages 136 文件，均 VERIFY PASS。

## 六、提交与部署

- 内容提交：main `541c4a64071a9c6aaf95dd5c30572103b8b93bad`（新增 14 文件、修改 5 文件）；gh-pages `3b078ff36f168b0a0af45adf3ed3b0ce0e16ec94`。本报告以其后的独立提交追加到 main（提交 ID 以 main 分支最新提交为准）。
- Pages：状态 `built`，构建源提交即上述 gh-pages 提交。
- 线上抽查（HTTP 200 且内容命中）：`/14-ssh/`、`/14-ssh/02-connect-config/`、`/14-ssh/06-troubleshooting-hardening/`、`/15-command-reference/`、`/15-command-reference/06-scheduling-containers-more/`、`/tools/`（含 SSH 生成器表单）、`/compatibility/`（含 14/15 状态行）；线上搜索索引条目 1089、`ProxyJump` 9 命中，与本地构建一致。

## 七、未完成项与已知风险

- **CI 未完成（如实标注）**：`.github/workflows/ci.yml` 仍未进入仓库——推送通道凭据缺少 `workflow` scope，API 对 `.github/workflows/` 路径返回 404；本地 ci.yml 文件完好。此项阻塞与已有记录一致，**未经 GitHub Actions 实际运行验证**，本报告不宣称 Actions 已验证。解除方式：仓库所有者在 GitHub 网页端手动新建该文件，或为连接凭据补授 workflow 权限后补推。
- **版本兼容**：新章面向 Ubuntu 22.04 / 24.04 LTS；Ubuntu 26.04 全部新章在兼容页如实标注「待核验」（14 部分核心流程章 22.04/24.04 标「已实测（核心流程）」、隧道/排错章与 15 部分全部章节标「文档核对」），未把未实测命令标记为已验证。
- **内容深度说明**：速查手册第 02 章（软件包与服务）条目数相对少（8 条），因 apt/dpkg/systemctl/journalctl 均为大条目合并编写，覆盖面与任务清单一致；后续如需拆分增补，按维护守则先经站长同意。
- 危险命令（rm -rf、mkfs/分区修改、递归 chmod/chown、ufw reset、kill -9 等）在新章中均以 `!!! danger` 单独警示，未作为无警告默认示例；fdisk 在速查中只给只读 `-l` 示例，写操作回链 LVM 章。
