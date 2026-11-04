# 现有内容地图（CONTENT_MAP）

> 目的：让后续每个建站任务开始前，先查这张表——已有内容直接引用，不要重写。
> 统计口径与 PROJECT_AUDIT.md 一致：2026-11-03 晚实测，`docs/` 共 120 篇 md。

## 1. 目录树（文档部分，节选到目录级）

```text
docs/
├── index.md                  # 首页（含欢迎段、阅读路径、另有段：参考索引 / 互动工具 / 软件目录 / 更新日志）
├── compatibility.md          # 版本兼容与验证状态
├── changelog.md              # 更新日志
├── 01-basics/                # 8 篇：版本、安装、首次登录、包管理等
├── 02-security/              # 11 篇：用户、sudo、防御、证书、加密等
├── 03-storage/               # 6 篇：LVM、ZFS/Btrfs、挂载共享等
├── 04-network/               # 9 篇：DNS、Web 代理、VPN 隧道、HAProxy、Keepalived 等
├── 05-containers/            # 5 篇：Docker、Podman、轻量 K8s 等
├── 06-monitoring/            # 8 篇：监控、日志、调优、容量、OpenTelemetry 等
├── 07-automation/            # 5 篇：脚本、systemd、Ansible 等
├── 08-troubleshooting/       # 8 篇：启动、网络、磁盘、CPU/内存、灾难恢复等
├── 09-web-hosting/           # 7 篇：见第 2 节（建站核心复用区）
├── 10-game-servers/          # 5 篇：端口、游戏服、NAT 穿透等
├── 11-databases/             # 13 篇：见第 2 节
├── 12-virtualization/        # 4 篇：GPU、虚拟化、私有云等
├── 13-ai-ops/                # 4 篇：本地 LLM、AI CLI、IaC/GitOps 等
├── 14-ssh/                   # 7 篇：SSH 连接、密钥、隧道、远程执行等
├── 15-command-reference/     # 7 篇：文件权限、包与服务、网络诊断、文本归档等
├── tools/index.md            # 互动工具总索引（约 37–38 个浏览器端工具）
├── reference/                # 6 篇：术语表、命令索引、端口与协议、配置文件索引等
├── app/latest.json           # App 更新清单（不是 md，不参与指南构建）
├── assets/                   # og-image.png、favicon.png 等
├── stylesheets/tabs-arrows.css
└── javascripts/tabs-arrows.js
```

## 2. 建站相关已有内容清单（按复用方式分）

### 直接引用（建站指南里只给结论 + 链接，不展开）

| 现有文件 | 建站指南引用点 |
|---|---|
| 09-web-hosting/01-dns-resolution.md | DNS 原理、解析、故障排查的基础 |
| 09-web-hosting/02-baota-panel.md | 面板建站路线（与手工 Nginx 路线并列，不贬低） |
| 09-web-hosting/03-lnmp-lamp.md | LNMP/LAMP 环境搭建 |
| 09-web-hosting/04-docker-apps.md | Docker 部署应用的基础 |
| 09-web-hosting/05-https-certificates.md | HTTPS 证书基础 |
| 04-network/02-web-proxy.md | Nginx 反向代理基础 |
| 05-containers/01-docker.md | Docker 基础 |
| 11-databases/01-mysql-install-security.md 等 | MySQL/PostgreSQL/Redis 安装与安全 |
| 02-security/02-users-sudo-pam.md | 服务器用户与 sudo |
| 06-monitoring/02-prometheus-grafana.md | 监控基础 |
| 08-troubleshooting/05-disaster-recovery-migration.md | 灾难恢复与迁移基础 |

### 需要补充 / 升级（已有基础，但建站场景下不够用）

| 现有内容 | 建站指南要补的缺口 |
|---|---|
| Nginx 基础（web-proxy、LNMP） | 完整配置模板、多站点虚拟主机、upstream、WebSocket、上传限制、超时、缓存策略 |
| HTTPS 证书基础 | Let's Encrypt 自动续期、泛域名、HSTS、安全响应头、TLS 版本与密码套件 |
| Docker 基础 | 多容器网站平台、容器网络与数据卷、蓝绿/滚动部署、自动回滚 |
| 数据库安装与备份 | 建站表设计、连接池、慢查询与索引、整站备份脚本、恢复演练 |
| 域名/DNS 基础 | 注册商选择、实名、ICP/公安备案适用范围、泛域名、多域名管理 |
| 监控基础 | 网站可用性检测、告警通知、访问统计、压力测试 |

### 全新内容（现有站里没有，必须新建）

- HTML 全教程（标签级）、CSS 全教程（属性级）、JavaScript、TypeScript。
- CSS 框架：Bootstrap、Tailwind CSS、Bulma、Foundation、UIkit、Pico CSS、Materialize（各独立成章）。
- 前端框架：Vue 3、React、Angular、Svelte、Next.js、Nuxt（各独立成章）。
- 前端工程化：npm/pnpm、Vite、Webpack、Babel、ESLint、Prettier。
- UI 组件库与设计系统：Element Plus、Ant Design、Vuetify、MUI、自建 Design System。
- 后端框架：Laravel、Symfony、ThinkPHP、Django、Flask、FastAPI、Express、NestJS、Fastify、Gin、Echo、Fiber、Spring Boot（各独立成章）。
- API 与集成：REST、GraphQL、WebSocket、OAuth、JWT、第三方接口。
- 架构：单体、前后端分离、SSR、SSG、微服务、多站点、Docker 多容器架构。
- 建站决策树、配置文件库、一台服务器托管多网站的旗舰实战。
- 完整实战：企业官网、个人博客、论坛、电商、CMS、后台管理、SaaS、多站点平台。
- 建站工具：Nginx/Apache/Caddy 配置生成器、Docker Compose 生成器、systemd 生成器、SSL 到期计算器、部署检查清单等（与现有运维工具区分）。

## 3. 不属于建站指南的内容（不要往里塞）

- 游戏服务器部署（10-game-servers）、GPU/CUDA、私有云、AI 运维（13-ai-ops）——这些是服务器手册的内容，建站指南只在“需要用到时”给链接，不展开。
- 邮件服务器（09-web-hosting/06-mail-server.md）：站长已定本地邮件服务“先不做”，建站指南引用时必须注明适用范围，不得把它当成建站必备步骤。
- 安卓 App（Linux Server Toolkit）：它是本站配套应用，不是建站教程的一部分，建站指南里只在“App 同步更新”阶段提及发布流程，不写 App 开发教程。
