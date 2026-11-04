# 任务索引（TASK_INDEX）

> 使用规则：一次只做一个任务，验收通过才进下一个。任务编号是唯一的，文件范围、依赖、完成标准以本表为准。
> 状态说明：`待开始` = 未动工；`进行中` = 正在做；`已验收` = 已按验收报告通过。本次 WEB-00 完成后，WEB-00 标记为已验收，其余全部待开始。
> 编号说明：WEB-00 是本次审计任务；WEB-01 起按用户文件里的顺序展开，同时在括号里标注对应的 18 领域编号，方便对照 MASTER_PLAN.md。

| 任务编号 | 领域 | 任务标题 | 文件范围（建议） | 依赖 | 状态 |
|---|---|---|---|---|---|
| WEB-00 | 0 审计 | 现有项目审计与建站知识体系目录设计 | docs/website-guide/PROJECT_AUDIT.md、CONTENT_MAP.md、MASTER_PLAN.md、TASK_INDEX.md、CONTENT_COVERAGE.md、ROADMAP.md | — | 已验收（本次） |
| WEB-01 | 02 HTML | HTML 基础与语义化标签 | docs/website-guide/html/01-basics.md | WEB-00 | 已完成 |
| WEB-02 | 02 HTML | HTML 表单、表格、媒体 | docs/website-guide/html/02-forms-tables-media.md | WEB-01 | 已完成 |
| WEB-03 | 02 HTML | HTML SEO 与无障碍（title/meta/canonical/ARIA） | docs/website-guide/html/03-seo-a11y.md | WEB-02 | 已完成 |
| CSS-01 | 03 CSS | CSS 基础语法与选择器、优先级、继承 | docs/website-guide/css/01-basics.md | WEB-00 | 已完成 |
| CSS-02 | 03 CSS | CSS 单位与颜色、字体、背景、边框 | docs/website-guide/css/02-units-colors.md | CSS-01 | 已完成 |
| CSS-03 | 03 CSS | CSS 盒模型与定位（box-sizing/display/position/float/z-index） | docs/website-guide/css/03-box-position.md | CSS-02 | 已完成 |
| CSS-04 | 03 CSS | Flexbox 完整教程（含导航栏、卡片、侧边栏实战） | docs/website-guide/css/04-flexbox.md | CSS-03 | 已完成 |
| CSS-05 | 03 CSS | Grid 完整教程（含后台管理系统布局实战） | docs/website-guide/css/05-grid.md | CSS-04 | 已完成 |
| CSS-06 | 03 CSS | 响应式设计（Media Queries、移动优先、rem/vw/clamp） | docs/website-guide/css/06-responsive.md | CSS-05 | 已完成 |
| CSS-07 | 03 CSS | 动画与高级效果（transition/transform/animation/变量/暗黑模式） | docs/website-guide/css/07-animation.md | CSS-06 | 已完成 |
| CSS-08 | 03 CSS | CSS 工程化（文件组织、Modules、Sass/Less、PostCSS、BEM） | docs/website-guide/css/08-engineering.md | CSS-07 | 已完成 |
| CSS-09 | 04 CSS 框架 | Bootstrap（CDN/npm、栅格、组件、Sass 定制、完整实战） | docs/website-guide/css-frameworks/01-bootstrap.md | CSS-08 | 已完成 |
| CSS-10 | 04 CSS 框架 | Tailwind CSS（Vite 集成、工具类、响应式、暗黑模式、后台实战） | docs/website-guide/css-frameworks/02-tailwind.md | CSS-09 | 已完成 |
| CSS-11 | 04 CSS 框架 | Bulma（Columns、Navbar、Hero、Card、主题变量） | docs/website-guide/css-frameworks/03-bulma.md | CSS-10 | 已完成 |
| CSS-12 | 04 CSS 框架 | Foundation、UIkit（XY Grid、组件、Sass 定制） | docs/website-guide/css-frameworks/04-foundation-uikit.md | CSS-11 | 已完成 |
| CSS-13 | 04 CSS 框架 | Pico CSS、Materialize（无类名写法、Material Design、维护状态说明） | docs/website-guide/css-frameworks/05-pico-materialize.md | CSS-12 | 已完成 |
| CSS-14 | 04 CSS 框架 | 自己编写 CSS 框架 | docs/website-guide/css-frameworks/06-own-framework.md | CSS-13 | 已完成 |
| CSS-15 | 04 CSS 框架 | 完整 Design System（自建设计系统） | docs/website-guide/css-frameworks/07-design-system.md | CSS-14 | 已完成 |
| CSS-16 | 04 CSS 框架 | 同一页面需求的多框架对照实战 | docs/website-guide/css-frameworks/08-comparison.md | CSS-15 | 已完成 |
| JS-01 | 05 JS | JavaScript 基础（变量、类型、函数、对象、数组） | docs/website-guide/javascript/01-basics.md | CSS-08 | 已完成 |
| JS-02 | 05 JS | DOM、事件、异步（Promise/async/Fetch、模块） | docs/website-guide/javascript/02-dom-async.md | JS-01 | 已完成 |
| JS-03 | 06 TS | TypeScript（类型、接口、泛型、工程实践） | docs/website-guide/javascript/03-typescript.md | JS-02 | 已完成 |
| JS-04 | 07 工程化 | npm、pnpm、Vite、前端工程化（构建、ESLint、Prettier） | docs/website-guide/javascript/04-tooling.md | JS-03 | 已完成 |
| FE-01 | 08 前端框架 | Vue 3（Composition API、组件、路由、Pinia） | docs/website-guide/frontend/01-vue.md | JS-04 | 已完成 |
| FE-02 | 08 前端框架 | React（JSX、Hooks、组件、状态管理） | docs/website-guide/frontend/02-react.md | FE-01 | 已完成 |
| FE-03 | 08 前端框架 | Angular（TypeScript、模块、服务、依赖注入） | docs/website-guide/frontend/03-angular.md | FE-02 | 已完成 |
| FE-04 | 08 前端框架 | Svelte（响应式、组件、事件、状态） | docs/website-guide/frontend/04-svelte.md | FE-03 | 已完成 |
| FE-05 | 08 前端框架 | Next.js（SSR、SSG、路由、Server Components） | docs/website-guide/frontend/05-nextjs.md | FE-04 | 已完成 |
| FE-06 | 08 前端框架 | Nuxt（Vue 全栈、SSR、部署） | docs/website-guide/frontend/06-nuxt.md | FE-05 | 已完成 |
| UI-01 | 09 UI 库 | Element Plus、Ant Design、Vuetify、MUI（各库独立小节） | docs/website-guide/frontend/07-ui-libraries.md | FE-06 | 已完成 |
| UX-01 | 10 设计 | 网站设计与用户体验（布局、色彩、字体、交互、移动端、无障碍） | docs/website-guide/design/01-ux.md | UI-01 | 已完成 |
| NET-01 | 01 基础 | 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口 | docs/website-guide/basics/01-internet.md | WEB-00 | 已完成 |
| NET-02 | 01 基础 | 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名 | docs/website-guide/basics/02-domain.md | NET-01 | 已完成 |
| ARCH-01 | 14 架构 | 网站完整架构总览（用户层、网络层、Web 层、前端层、后端层、API 层、数据层、存储层、运行层、运维层） | docs/website-guide/architecture/01-overview.md | FE-06 | 已完成 |
| ARCH-02 | 14 架构 | 单体、前后端分离、SSR、SSG、微服务、多站点架构对比与升级路径 | docs/website-guide/architecture/02-patterns.md | ARCH-01 | 已完成 |
| ARCH-03 | 14 架构 | 建站方案选型决策树（静态/博客/后台/高并发 API/多站点） | docs/website-guide/architecture/03-decision-tree.md | ARCH-02 | 已完成 |
| BE-01 | 11 后端 | PHP 框架：Laravel、Symfony、ThinkPHP（各框架独立小节） | docs/website-guide/backend/01-php.md | ARCH-03 | 已完成 |
| BE-02 | 11 后端 | Python 框架：Django、Flask、FastAPI | docs/website-guide/backend/02-python.md | BE-01 | 已完成 |
| BE-03 | 11 后端 | Node.js 框架：Express、NestJS、Fastify | docs/website-guide/backend/03-nodejs.md | BE-02 | 已完成 |
| BE-04 | 11 后端 | Go 框架：Gin、Echo、Fiber、标准库 | docs/website-guide/backend/04-go.md | BE-03 | 已完成 |
| BE-05 | 11 后端 | Java 框架：Spring Boot、Spring MVC、Quarkus | docs/website-guide/backend/05-java.md | BE-04 | 已完成 |
| DB-01 | 12 数据库 | 数据库选型、表设计、SQL、索引、事务、连接池 | docs/website-guide/database/01-design.md | BE-05 | 已完成 |
| DB-02 | 12 数据库 | 备份、恢复、迁移、慢查询、主从复制、高可用 | docs/website-guide/database/02-ops.md | DB-01 | 已完成 |
| API-01 | 13 API | REST、GraphQL、WebSocket、JSON、OAuth、JWT、第三方接口 | docs/website-guide/api/01-integration.md | DB-02 | 已完成 |
| SRV-01 | 15 服务器 | Nginx、Apache、Caddy 完整配置与多站点（复用现有章节，只补模板与缺口） | docs/website-guide/server/01-web-servers.md | API-01 | 已完成 |
| SRV-02 | 15 服务器 | PHP-FPM、systemd、运行环境与进程管理 | docs/website-guide/server/02-runtime.md | SRV-01 | 已完成 |
| DEPLOY-01 | 16 部署 | Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署 | docs/website-guide/deploy/01-cicd.md | SRV-02 | 已完成 |
| DEPLOY-02 | 16 部署 | Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚 | docs/website-guide/deploy/02-docker.md | DEPLOY-01 | 已完成 |
| DEPLOY-03 | 16 部署 | HTTPS、CDN、域名解析上线全流程 | docs/website-guide/deploy/03-launch.md | DEPLOY-02 | 已完成 |
| OPS-01 | 17 运营 | SEO、性能、缓存、图片优化、访问统计 | docs/website-guide/ops/01-seo-performance.md | DEPLOY-03 | 已完成 |
| OPS-02 | 17 运营 | 安全：WAF、限流、漏洞修复、安全响应头、密钥管理 | docs/website-guide/ops/02-security.md | OPS-01 | 已完成 |
| OPS-03 | 17 运营 | 监控、日志、告警、压力测试、可用性检测 | docs/website-guide/ops/03-monitoring.md | OPS-02 | 已完成 |
| OPS-04 | 17 运营 | 备份、迁移、灾难恢复、RTO/RPO、恢复演练 | docs/website-guide/ops/04-backup-recovery.md | OPS-03 | 已完成 |
| PROJ-01 | 18 实战 | 静态网站从零部署 | docs/website-guide/projects/01-static.md | OPS-04 | 已完成 |
| PROJ-02 | 18 实战 | WordPress 企业网站 / 博客从零部署 | docs/website-guide/projects/02-wordpress.md | PROJ-01 | 已完成 |
| PROJ-03 | 18 实战 | Python 网站（Flask/Django）从零部署 | docs/website-guide/projects/03-python.md | PROJ-02 | 已完成 |
| PROJ-04 | 18 实战 | Node.js 网站从零部署 | docs/website-guide/projects/04-nodejs.md | PROJ-03 | 已完成 |
| PROJ-05 | 18 实战 | PHP 网站、Go API 服务从零部署 | docs/website-guide/projects/05-php-go.md | PROJ-04 | 已完成 |
| PROJ-06 | 18 实战 | Docker 多容器网站平台 | docs/website-guide/projects/06-docker-platform.md | PROJ-05 | 已完成 |
| PROJ-07 | 18 实战 | 论坛、电商、CMS、后台管理、SaaS（各项目独立小节） | docs/website-guide/projects/07-systems.md | PROJ-06 | 已完成 |
| PROJ-08 | 18 实战 | 旗舰：一台服务器托管多网站（WordPress + Django + Node.js + PHP + Go API + 数据库 + Redis + Docker） | docs/website-guide/projects/08-multi-site.md | PROJ-07 | 已完成 |
| TOOL-01 | 11 工具 | 建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器 | docs/website-guide/tools/01-config-generators.md | PROJ-08 | 已完成 |
| TOOL-02 | 11 工具 | 建站工具 2：Docker Compose、systemd、备份脚本、部署检查清单生成器 | docs/website-guide/tools/02-deploy-tools.md | TOOL-01 | 已完成 |
| TOOL-03 | 11 工具 | 建站工具 3：SSL 到期计算器、DNS 检查、HTTPS/安全/上线前检查工具 | docs/website-guide/tools/03-checkers.md | TOOL-02 | 已完成 |
| FINAL-01 | 12 验收 | 全站整合验收：内容、链接、导航、构建、手机端、发布验证；网站和 App 同步更新 | docs/website-guide/FINAL_REPORT.md | TOOL-03 | 已完成 |

> 任务总数：本表共 **76 个任务**（含 WEB-00）。其中框架级、实战级任务内部还会再拆小节，但验收以本表任务为单位，不再无限拆分。
> 依赖说明：上表依赖列是“建议顺序”，不是硬性技术依赖；站长可以按需跳过某个框架（比如不做 Angular），跳过时在验收报告里注明，不影响后续任务。
> 下一项建议任务：WEB-01（HTML 基础与语义化标签），待站长确认后开始。
