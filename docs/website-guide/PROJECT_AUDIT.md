# WEB-00 现有项目审计报告

> 任务编号：WEB-00（本次只审计和规划，禁止编写大量新文章）
> 审计时间：2026-11-03 晚（以工作区当时状态为准）
> 审计范围：本地工作区 `guide-src`、MkDocs 配置、导航、文档目录、线上 crozz.me
> 保护红线：本次不改 `mkdocs.yml`、不改导航、不改首页、不改其他已有文档和配置、不发布、不 Git 提交。
> 工作区已有未提交修改（见下），本次只新增 `docs/website-guide/` 下的规划文件，不覆盖、不删除任何已有文件。

## 1. Git 状态（只读检查，未做任何提交）

- 分支：`main`，HEAD：`fa337f1`（批次 3：TLS 证书检查 / 权限计算器 / Hash 计算器 / 版本号比较器 / Docker 资源换算 / HTTP 状态码查询）
- 工作区状态：**有大量未提交修改和未跟踪文件**，这是已知状态，不是本次审计造成的问题。
  - 已修改（部分）：`.github/workflows/ci.yml`、`docs/index.md`、`docs/compatibility.md`、`docs/02-security/index.md`、`docs/04-network/06-haproxy.md`、`docs/09-web-hosting/03-lnmp-lamp.md`、`docs/11-databases/` 多篇、`mkdocs.yml`、`overrides/main.html` 等。
  - 未跟踪（部分）：`.github/dependabot.yml`、`.github/pull_request_template.md`、`CONTENT_SYNC_PROTOCOL.md`、各期工具清单（`TOOLS_*.md`）等。
- 结论：后续任何建站任务开始前，必须先 `git status`，只改本任务文件，不得覆盖这些未提交修改；规划文件本身是新增的未跟踪文件，同样不提交（除非站长另行批准）。

## 2. MkDocs 配置

- 站点名：`Ubuntu Server 终极指南与实战教程`
- `site_url`（工作区版）：`https://curzydj8.github.io/ubuntu-server-guide/`（服务器版构建时才在副本里改成 `https://crozz.me/`，源文件本身不动）
- 主题：Material，`custom_dir: overrides`
- 自定义资源（仅 2 个）：`stylesheets/tabs-arrows.css`、`javascripts/tabs-arrows.js`
- 模板覆盖：`overrides/main.html`（Open Graph / Twitter Card + AdSense 代码段，extrahead 块）、`overrides/partials/nav.html`
- 功能（`features`，节选）：`navigation.tabs`、`navigation.sections`、`navigation.instant`、`navigation.footer`、`navigation.top`、`navigation.indexes`、`toc.follow`、`content.code.copy`、`content.code.annotate`、`search.suggest`、`search.highlight`、`search.share`
- 构建命令（沿用现有流程）：`uv tool run --from mkdocs-material mkdocs build --strict -d <输出目录>`

## 3. 文档与导航统计（实测，不是估计）

- `docs/` 下 Markdown 文件总数：**120 篇**（与线上 sitemap 的 120 条一致）
- 按目录分（`docs/<目录>/*.md`，不含根目录单篇）：

| 目录 | 篇数 | 主题 |
|---|---:|---|
| 01-basics | 8 | 基础入门与安装 |
| 02-security | 11 | 系统安全与权限管理 |
| 03-storage | 6 | 磁盘、文件系统与存储 |
| 04-network | 9 | 网络服务与核心架构 |
| 05-containers | 5 | 容器化与云原生 |
| 06-monitoring | 8 | 系统监控、日志与性能调优 |
| 07-automation | 5 | 自动化运维与脚本 |
| 08-troubleshooting | 8 | 故障排查与应急响应 |
| 09-web-hosting | 7 | 网站搭建、域名与应用部署 |
| 10-game-servers | 5 | 游戏服务器部署与端口映射 |
| 11-databases | 13 | 数据库安装、管理与高可用 |
| 12-virtualization | 4 | 硬件、虚拟化与私有云 |
| 13-ai-ops | 4 | AI 工具与智能化运维 |
| 14-ssh | 7 | SSH 专题 |
| 15-command-reference | 7 | Linux 命令速查手册 |
| tools | 1（index.md） | 互动工具总索引（内含约 37–38 个工具条目，工具本身是浏览器端实现） |
| reference | 6 | 参考索引 |
| app | 0 篇 md（只有 `latest.json`，App 本身不在指南构建内） |

- 导航（一级，`mkdocs.yml` 现状）：首页、版本兼容与验证状态、01–15 共 15 个部分、参考索引、互动工具、开源软件精选目录（外链到 https://crozz.me/software/）、更新日志、本站信息。
- 线上实测（2026-11-03 晚）：主页 200 / 98,566 字节，软件页 200 / 34,852 字节（已是动态加载版），sitemap 120 条。

## 4. 已有建站相关内容（可复用，禁止重写）

核心复用区，建站指南必须交叉引用、不得重复编写：

- **09-web-hosting（7 篇）**：`01-dns-resolution.md`（DNS 解析）、`02-baota-panel.md`（宝塔面板）、`03-lnmp-lamp.md`（LNMP/LAMP）、`04-docker-apps.md`（Docker 应用部署）、`05-https-certificates.md`（HTTPS 证书）、`06-mail-server.md`（邮件服务器，注：站长已定“先不做”本地邮件服务，建站指南引用时必须注明适用范围）、`index.md`。
- **04-network/02-web-proxy.md**：Web 反向代理；`04-network/06-haproxy.md`：HAProxy；`04-network/03-vpn-tunnel.md`：隧道。
- **05-containers**：Docker、Podman、轻量 Kubernetes。
- **11-databases（13 篇）**：MySQL 安装/用户/调优/备份、PostgreSQL 安装/扩展/备份、Redis、MongoDB、高可用容器化、恢复演练、PgBouncer 连接池、MySQL 集群 + ProxySQL。
- **02-security**：用户与 sudo、防御、证书生命周期；**06-monitoring**：Prometheus + Grafana、日志栈、容量规划；**08-troubleshooting**：网络诊断、磁盘爆满、CPU/内存、灾难恢复与迁移。
- **14-ssh**：连接、密钥、隧道、远程执行；**07-automation**：Ansible、systemd 等。
- **互动工具**：工具总索引 1 篇，内含 Netplan、UFW、SSH、Nginx、Docker Compose、systemd 等浏览器端生成器（38 个在线工具口径，见首页“另有”段）。

## 5. 缺口（全新内容，几乎没有现成教程）

- 前端全线缺失：HTML、CSS、JavaScript、TypeScript 没有独立教程；现有 grep 命中（web-proxy、Docker、宝塔、LNMP 等）只是顺带提到，不是教程。
- CSS 框架全线缺失：Bootstrap、Tailwind CSS、Bulma、Foundation、UIkit、Pico CSS、Materialize 均无教程。
- 前端框架全线缺失：Vue、React、Angular、Svelte、Next.js、Nuxt 均无教程。
- 后端框架教程缺失：现有内容讲的是运行环境和部署（PHP-FPM、Flask 部署思路、Docker），没有 Laravel / Django / Express / Gin / Spring Boot 这种“从项目创建到部署”的框架级教程。
- 建站决策、架构选型、完整实战项目缺失：没有“只展示产品选静态、博客选 WordPress、企业后台选 Django/Laravel”这种决策树，也没有企业官网 / 博客 / 电商 / 论坛 / SaaS 的完整实战。
- 建站专用工具缺失：现有工具是运维工具（Nginx 进阶、SSH、systemd 等），建站指南要的 Nginx 配置生成器、Docker Compose 部署生成器、systemd 服务生成器、SSL 到期计算器、部署检查清单等是新增的，不能把运维工具当成建站工具。

## 6. 重复风险清单（建站任务开始前必须先查）

1. Nginx：已有 04-network/02-web-proxy + 09-web-hosting/03-lnmp-lamp + 工具里的 Nginx 进阶生成器，新指南的 Nginx 章节只能做“完整配置模板 + 逐项解释 + 多站点”，不得重写基础反向代理。
2. HTTPS：已有 09-web-hosting/05-https-certificates + 02-security/08-certificate-lifecycle，新指南只能补 Let's Encrypt 自动续期、HSTS、安全响应头、泛域名证书这些缺口。
3. Docker：已有 05-containers/01-docker + 09-web-hosting/04-docker-apps，新指南的 Docker 章节只能做“多容器网站平台、蓝绿/滚动部署”，不得重写 Docker 安装。
4. 数据库：已有 11-databases 全套，新指南只能做“建站场景下的表设计、连接池、备份恢复脚本”，不得重写安装。
5. 域名/DNS：已有 09-web-hosting/01-dns-resolution，新指南只能补注册商选择、实名、备案适用范围、泛域名、多域名管理。
6. 备份/迁移：已有 08-troubleshooting/05-disaster-recovery-migration + 11-databases 备份篇，新指南只能做“网站文件 + 数据库 + 配置的整站备份脚本和恢复演练”。

## 7. 审计结论

- 现有站是一本已经成型的 Ubuntu 服务器手册，建站指南必须做成**独立一级导航**，与 01–15 并列，而不是插进现有章节里。
- 复用策略是“交叉引用 + 补缺口”，不是“重写一遍”：凡是已有章节讲过的，建站指南里只给一句话结论 + 链接，篇幅留给新增内容。
- 本次 WEB-00 只交付规划文件，不改导航、不改首页、不发布、不提交；下一任务从 WEB-01 开始，且一次只做一个小任务，验收通过才进下一个。
