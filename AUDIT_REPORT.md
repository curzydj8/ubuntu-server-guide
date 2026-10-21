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

## 第二期扩展报告（v7.0，2026-10-21）

### 一、审计基线与范围

- 动手前远程 HEAD：main `cd843c08bacf10fa88428de378a659aeb8aabf46`、gh-pages `6aa26e57d9705abf5a147949851c7770916ea22b`。
- 范围：扩展清单第二期「生产深度专题」，共 13 个新章，全部挂现有部分（01/02/03/04/05/06/07/08/11），未新建大部、未动 CI 配置与 lint 规则。

### 二、新增文件（13 章，磁盘字节数）

- `docs/01-basics/06-release-upgrade-lifecycle.md`（29,277）：do-release-upgrade 全流程与前置检查、Prompt 通道、第三方源/PPA 升级时禁用与逐个恢复、EOL/ESM、Ubuntu Pro、Livepatch；如实说明发行版升级无官方回滚，回退只靠快照/备份。
- `docs/01-basics/07-multiarch.md`（14,876）：x86-64 与 ARM64 差异、dpkg 架构与多架构支持、容器镜像 manifest/buildx、qemu-user 边界与排坑。
- `docs/02-security/08-certificate-lifecycle.md`（27,909）：证书链结构、私钥权限与存放、续期失败处置、吊销 CRL/OCSP、密钥轮换、到期监控脚本加 systemd timer；与 09 部分 HTTPS 签发章互链分工。
- `docs/02-security/09-secrets-management.md`（21,926）：凭据分类与反模式、EnvironmentFile 边界、LoadCredential、Vault/KMS/SOPS 选型、轮换五步、泄露应急；与 13 部分 AI 凭据章互链。
- `docs/03-storage/05-hardware-health.md`（14,978）：SMART/NVMe 健康判读、smartd、ECC 与 rasdaemon、温度、mdadm 状态、换盘流程衔接。
- `docs/04-network/06-haproxy.md`：HAProxy 完整配置逐段讲解、主动健康检查、故障摘除、Runtime API 连接排空、统计页安全（danger 标注）、与 Nginx 反代分工、TLS 终止与证书章互链。
- `docs/05-containers/04-supply-chain-security.md`（23,382）：digest 锁定、cosign 签名、syft SBOM、trivy/grype 扫描实操、基础镜像更新与回滚、provenance 说明。
- `docs/06-monitoring/05-observability-alerting.md`（19,992）：指标/日志/追踪三支柱、OpenTelemetry 与 Collector 最小配置、COS 与现有 Prometheus/Grafana 章分工、告警抑制/分组/升级、postmortem 模板。
- `docs/06-monitoring/06-capacity-log-governance.md`（20,965）：容量增长预测、journald 上限逐行讲解、logrotate、远程日志回链、敏感数据脱敏规范。
- `docs/07-automation/04-systemd-engineering-drift.md`（27,784）：unit 依赖语义、重启策略、WatchdogSec、资源限制、完整 unit 示例；Ansible 加 Git 的漂移检查（--check --diff）与回滚；与 07-03、13-03、02-09 互链。
- `docs/08-troubleshooting/06-kernel-boot-remote-recovery.md`（23,976）：GRUB 旧内核启动、initramfs 重建、DKMS 失败处置、kdump 要点；远程失联分级处置（云控制台、串口、救援模式、带外 IPMI）。
- `docs/08-troubleshooting/07-incident-response.md`（20,835）：SEV 分级、止血与证据保全取舍、时间线模板、dd 取证 danger 标注、全量凭据轮换清单、复盘模板；与 8.5 灾难恢复章互链。
- `docs/11-databases/10-ha-recovery-drills.md`（23,971）：仲裁 quorum 与见证、fencing/STONITH、脑裂成因与防护、Pacemaker/Corosync 最小示例、DRBD 概念、切换与回切检查表、PG PITR 到新主机演练、复制延迟双口径判读、备份一致性三关；与 11-04/06/09 互链不重复。

### 三、集成改动

- `mkdocs.yml`：nav 新增 13 条，全部挂现有部分。
- 部分导览：01/02/03/04/05/06/07/08/11 共 9 个 index.md 按现有格式加行或条目。
- `docs/index.md`：内容地图 9 行同步更新。
- `docs/compatibility.md`：逐章表新增 13 行；新增内容 22.04/24.04 标「文档核对」、26.04 标「待核验」，口径与前两期一致。
- `docs/changelog.md`：新增 v7.0 条目段与版本表行。

### 四、自动化检查结果

- `npx markdownlint-cli2 "docs/**/*.md"`：111 个文件 0 issues（未改 ci.yml、未放宽 .markdownlint.json）。
- `mkdocs build`：成功，零内容警告。
- Shell 语法：13 个新章共 157 个 bash 代码块全部 `bash -n` 通过（0 失败）。
- 搜索索引：构建后 1423 条；新关键词命中——Livepatch 10、HAProxy 17、OpenTelemetry 2、cosign 6、fencing 7、kdump 3；新页构建产物含侧边导航与上一篇/下一篇页脚。
- 线上抽查（Pages built 后）：HAProxy 章、系统升级与版本生命周期章、数据库高可用实战章三页均可访问且内容完整。

### 五、如实项与已知缺口

- 13 个新章全部为「文档核对」级别：命令与配置按官方文档核对整理，未在本机实测，章内均已如实标注。
- 26.04 全部新内容为「待核验」：zhang-new2（Ubuntu 26.04.1）SSH 链路仍未恢复，本期未做任何 26.04 实机冒烟；兼容页口径与全站一致。
- Pacemaker 最小示例只演示资源与约束写法，章内已标注不可直接上生产。

### 六、发布状态

- 发布通道：Git Database API 增量建树推送（main 源码 + gh-pages 构建产物），逐文件 SHA 比对。
- main 新提交 `77929ee34bcba9efd55f607bb26b4c37efe4e534`（125 文件，VERIFY PASS）；gh-pages 新提交 `5cdace42abffdb6fb1945d59c8c0ba61365f377b`（161 文件，VERIFY PASS）；Pages API 状态 built。
- CI：main 77929ee3 触发的 Actions run 39575166218 结论 success（五 Job 全绿）；pages 部署 run 39575718811 结论 success。本报告补推后以最新一轮 CI 结论为终验。

## 第三期扩展报告（v8.0，2026-10-21）

### 一、审计基线与范围

- 动手前远程 HEAD：main `f272ad135e035a5630b4cda118ea57fb084e196c`、gh-pages `5cdace42abffdb6fb1945d59c8c0ba61365f377b`。
- 范围：扩展清单第三期「运维工具箱」——工具页新增 6 个生成器 + SSL 速查卡 + 页首边界声明；不新增部分、nav 不变；已有 Netplan / UFW / SSH 三工具的实现与文案未动（仅页首工具计数与说明更新）。

### 二、新增工具（全部位于 `docs/tools/index.md`）

- 子网 / CIDR 计算器：IPv4 + 前缀/掩码双模式，输出网络地址、广播地址、可用主机范围与主机数；`/31`、`/32` 特例单列；非法 IP 与不连续掩码拦截报错、不给结果。
- Cron 表达式生成器：五字段三模式（每 / 每隔 / 指定）+ 6 个常用预设；人话解读；OnCalendar 等价映射（分/时步进用 `0/n` 形式，日/月/周步进明确提示无直接等价、改相对计时）；「日」与「周」同时受限时提示 cron 或关系与 systemd 且关系的语义差异。
- systemd Unit 生成器：服务名、描述、ExecStart、工作目录、运行用户、重启策略、RestartSec、MemoryMax、CPUQuota；注释一律独占一行（行尾注释会被当成参数一部分的坑点已在页内说明）；附 daemon-reload、enable --now、status、journalctl 落地命令；ExecStart 非绝对路径拦截。
- Nginx 反向代理生成器：域名、后端协议/地址/端口，WebSocket 升级头与强制 HTTPS（443 块 + 80 跳转 + Let's Encrypt 路径）可选；`proxy_set_header` 真实 IP 头全套；附备份、`nginx -t` 后再 reload 的固定顺序提示。
- Docker Compose 模板生成器：5 服务勾选（Nginx、MySQL、PostgreSQL、Redis、WordPress），`CHANGE_ME_*` 占位密码、命名卷、统一 appnet 网络、数据库 healthcheck、WordPress 自动带 MySQL 并等 `service_healthy`、端口仅本地绑定选项；与 09 部分 Docker 应用章互链不重复长文。
- LVM 扩容步骤生成器：PV 设备、VG、LV、挂载点、扩容量或扩到 100%FREE、ext4/XFS；步骤含 pvcreate（可选）、vgextend、lvextend、resize2fs 或 xfs_growfs 与每步检查命令；强警告区：只给步骤不自动执行、扩容前备份、缩容不在本工具范围；工具不生成任何缩容命令（回归用例已断言）。
- 附带内容：SSL 证书有效期检查速查卡（openssl s_client 与 curl 两查法、输出判读、30/15 天阈值建议，链接 02 证书生命周期章与 09 HTTPS 证书章）；工具页顶部统一标准补边界声明（只在浏览器本地生成文本、不连接服务器、不执行命令、生成结果需在目标机审阅验证后使用）。

### 三、集成改动

- `docs/tools/index.md`：页首 description 与工具计数更新（三 → 九），新增 6 个工具分节与 SSL 速查卡；脚本新增 6 组生成/初始化函数，沿用既有 document$ 双通道初始化 + 防重复绑定与统一复制 toast。
- `docs/index.md`：内容地图后的互动工具入口文案更新为九个工具清单。
- `docs/changelog.md`：新增 v8.0 条目段与版本表行，注明工具适用 22.04 / 24.04、26.04「待核验」口径不变。兼容页未加行（工具非章节）。

### 四、自动化检查结果

- 前端回归：vm 沙盒 + DOM 桩（从页面 HTML 解析真实元素与默认值）共 **78 项用例全过**——新工具 68 项（正常生成、模式切换、边界/非法输入拦截）、旧三工具回归 5 项、复制与 toast 5 项。首轮曾抓出 Cron 生成器一处不可达分支（分钟步进的 OnCalendar 映射与相对计时建议优先级冲突），已删死分支并复跑全过。
- `npx markdownlint-cli2 "docs/**/*.md"`：111 个文件 **0 issues**（未改 ci.yml、未放宽 .markdownlint.json）。
- `mkdocs build`：成功，零 WARNING/ERROR 日志行（构建输出中一行横幅为 Material 主题自身提示，非构建警告）。
- 搜索索引：1431 条；新词命中工具页——CIDR → `tools/#cidr`、OnCalendar → `tools/#cron`、`proxy_set_header` → `tools/#nginx`（该词原只存在于生成器脚本字符串中，为使其可检索已在 Nginx 分节正文显式写出）。
- 内链：新工具分节链接指向的 01/02/03/04/07/09/15 章节均真实存在，构建零链接警告。

### 五、如实项

- 全部工具为纯前端字符串生成与格式/逻辑校验，**未在任何真实服务器上执行验证**；页面文案已明确此边界，不声称已验证。
- OnCalendar 等价写法为规则映射结果，复杂步进组合已在工具输出与页内提示先用 `systemd-analyze calendar` 在目标机校验。
- Compose 镜像版本标签（mysql:8.0、postgres:16、redis:7、wordpress:6-apache、nginx:stable）为生成时的主流稳定标签，页内已提示按 Docker Hub 当前发布核对后锁定。

### 六、发布状态

- 发布通道同前：Git Database API 增量建树推送（main 源码 + gh-pages 构建产物），逐文件 SHA 比对；本节定稿时推送待执行，最终 commit ID、Pages 状态与推送后 CI 结论以本期交付回报为准。
