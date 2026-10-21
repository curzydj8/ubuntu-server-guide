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


---

# 第一期扩展报告：对标官方文档 / CIS 基线（v6.0）

- 日期：2026-10-21
- 范围：按站长确认的分期，第一期实施「现有分类容易遗漏的运维领域」内容补强 8 项 + 索引基础设施 1 组；不重建项目、不删除现有内容，全部增量挂接现有 15 个部分与导航。

## 一、动手前审计

- 修改前基线提交：main `a2acdbec7807a6dd1f9df16e9d51bde98beec75e`、gh-pages `b04a0f2d5e9e76761602211ca4640e028a244aef`（沿用上一波报告记录；本地工作区非 git 仓库，发布走 Git Database API 校验推送）。
- 存量盘点：03 章《挂载与存储共享》已有 fstab/NFS/Samba/iSCSI 骨架，Samba 仅基础共享，缺权限映射与治理 → 本期扩写；04 章《时间同步与系统日志》已有 chrony 客户端/服务端与日志三件套，时间部分缺选型与连锁影响 → 本期扩写；04 章《DNS 服务器搭建》为三家软件安装配置，缺角色模型/DNSSEC/迁移 → 新增进阶章互链；邮件、企业身份、CIS 基线、自动更新、cloud-init 在站内此前无专章 → 全部新建。

## 二、新增与修改文件

新增（12 个）：

- `docs/01-basics/05-cloud-init-autoinstall.md`（21,888 字节）：四阶段与数据源、完整 user-data 逐段讲解与幂等性、NoCloud 本地验证、镜像制作与重建、Autoinstall 逐段与批量装机，与 07 Ansible 互链分工。
- `docs/02-security/05-enterprise-identity.md`（20,225 字节）：LDAP/Kerberos/SSSD/PAM 概念与组件关系、realmd 加入 AD 全流程、AD 组 sudo 映射、域控不可用时应急访问专节、时钟偏差等 4 个排坑。
- `docs/02-security/06-cis-baseline.md`（18,738 字节）：CIS Level 1/2 取舍、USG 流程与 Ubuntu Pro 边界如实标注、手工审计六域、26 项可勾选安全检查清单、落地四步与恢复顺序。
- `docs/02-security/07-unattended-upgrades.md`（16,591 字节）：50/20 号配置逐行、自动重启策略与时间窗、dry-run 日志判读、与 Livepatch 的关系、降级限制如实说明。
- `docs/04-network/05-dnssec-advanced.md`（21,973 字节）：权威/递归/缓存三角色、区域文件逐行与记录全解、DNSSEC 签名验证链与轮换、TTL 迁移五步、解析不一致/污染诊断。
- `docs/09-web-hosting/06-mail-server.md`（21,991 字节）：Postfix+Dovecot 完整路线、SPF/DKIM/DMARC/PTR 四件套、云厂商封 25 端口醒目提示与 relayhost 中继备选、队列与投递失败分类排查。
- `docs/reference/index.md`（5,568 字节）、`docs/reference/glossary.md`（9,398 字节，38 条术语）、`docs/reference/command-index.md`（17,355 字节，78 行 = 79 条目合并 hostnamectl）、`docs/reference/ports.md`（9,285 字节，29 行）、`docs/reference/config-files.md`（9,031 字节，24 行）、`docs/reference/contributing.md`（9,509 字节，含六段式模板骨架与过期内容标记规范）。

扩写（2 个，原内容零删改）：

- `docs/03-storage/03-mount-sharing.md`：16,296 → 26,551 字节。新增《Samba 深化：权限映射与多用户治理》（权限两道门、凭据文件保护、配额、回收站、只读+审计、多用户完整案例、断线/性能）、NFS Kerberos sec 选项小段，验证/排坑/实践各追加对应条目。
- `docs/04-network/04-time-logging.md`：15,382 → 23,213 字节。新增《时间同步深化：选型、漂移与连锁影响》（chrony vs timesyncd 对比、timedatectl/chronyc 判读、VM/容器时钟、对 TLS、日志、数据库复制、Kerberos 的连锁影响表），日志部分未动。

修改（集成类）：

- `mkdocs.yml`：nav 新增 6 个章节条目 + 「参考索引」组 6 项。
- `docs/index.md`：内容地图 01/02/03/04/09 五行更新、「另有」行加参考索引入口。
- `docs/compatibility.md`：逐章状态表新增 12 行（6 新章 + 参考索引 6 行）；新增内容 22.04/24.04 标「文档核对」、26.04 标「待核验」。
- `docs/changelog.md`：新增 v6.0 条目与版本行。
- 部分导览：01/02/03/04/09 的 index.md 各按现有格式加行或补简介；`docs/04-network/01-dns.md` 加一处指向 DNSSEC 进阶章的互链注记。

## 三、自动化检查结果

- `mkdocs build` 成功且无链接类警告（首轮唯一警告为命令索引一处锚点 slug，已修正为 `#apt-search-show` 并复检）。
- 命令索引锚点全量审计：脚本逐个核对 79 个速查锚点在构建产物 HTML 中的 `id` 存在性，79/79 通过。
- 搜索索引：构建后索引 1216 条；新关键词抽查命中——DKIM 15 篇、SSSD 15 篇、cloud-init 34 篇、CIS 11 篇、unattended-upgrades 14 篇、脑裂 2 篇、Autoinstall 13 篇、realmd 4 篇；12 个新页面 location 全部在索引中；新章页脚上一篇/下一篇存在。
- Shell 语法：8 个内容文件共 125 个 bash 代码块全部 `bash -n` 通过（0 失败）。

## 四、未完成项与已知风险

- **CI 仍未落地（延续阻塞）**：`.github/workflows/ci.yml` 本地完好，但推送凭据缺 workflow scope，API 写 workflows 路径返回 404，仓库内至今无此文件；「Actions 能正常构建发布」无法验证，待站长重新授权连接（加 workflow 权限）或在网页端手动新建后补验。本报告不声称 CI 已通过。
- 26.04 全部新内容为「待核验」：zhang-new2（26.04.1）SSH 链路仍未恢复，本期未做任何 26.04 实机冒烟；兼容页口径与全站一致。
- 邮件章虚拟用户路线只给选型说明未给完整配置；DNSSEC 章 ip6.arpa 只讲原理（写手明确申报的取舍）。
- CIS 检查清单 26 项（规划约 30 项，覆盖六域无缺项）。

## 五、发布状态

- 发布通道：Git Database API 增量建树推送（main 源码 + gh-pages 构建产物），逐 blob SHA 断言、推后递归 tree 与本地全量比对。本节定稿时推送执行中，最终 commit ID 以仓库历史为准，并由本期交付回报给出（main / gh-pages 双 commit 均已在回报中列明）；Pages 状态以 API 查询 `built` 为准。
- CI 首跑修复（2026-10-21）：首轮 Actions（run 39569371392）中 Markdown 格式校验（79 项：MD001/012/022/029/031/032）与脚本冒烟（shellcheck SC1091）两 Job 红；未改 ci.yml 与 .markdownlint.json，仅修内容文件——速查三章与 changelog 条目标题 ### → ##（slug 不变、锚点无损）、SSH 章列表缩进修复、全文空行机械修复、两脚本在 `. /etc/os-release` 上方加 `# shellcheck disable=SC1091`。本地复验 markdownlint 0 error、shellcheck exit 0；修复后 Actions run 39572377654 结论 success，五 Job（MkDocs 构建 / 死链扫描 / Markdown 校验 / 脚本冒烟 ×22.04 与 24.04）全绿。
