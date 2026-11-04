# 建站指南路线图（ROADMAP）

> 顺序即依赖顺序：一次只做一个任务，验收通过才进下一个。站长可以跳过某个框架任务，跳过时在验收报告里注明，不影响后续。
> 本文件是路线图的简版，完整任务表见 TASK_INDEX.md，总计划见 MASTER_PLAN.md。

## 阶段顺序

1. **阶段 0：审计与目录设计（WEB-00，本次）**
   - 交付：PROJECT_AUDIT.md、CONTENT_MAP.md、MASTER_PLAN.md、TASK_INDEX.md、CONTENT_COVERAGE.md、ROADMAP.md（本文件）
   - 不改导航、不改首页、不改配置、不发布、不提交，完成后停止，等站长下一条指令。

2. **阶段 1：Web 基础（WEB-01～WEB-03）**
   - HTML 基础与语义化 → 表单、表格、媒体 → SEO 与无障碍

3. **阶段 2：CSS 深度（CSS-01～CSS-08）**
   - 基础语法 → 单位与颜色 → 盒模型与定位 → Flexbox → Grid → 响应式 → 动画 → 工程化

4. **阶段 3：CSS 框架大全（CSS-09～CSS-16）**
   - Bootstrap → Tailwind → Bulma → Foundation/UIkit → Pico/Materialize → 自建框架 → Design System → 多框架对照实战

5. **阶段 4：JavaScript 与前端工程化（JS-01～JS-04）**
   - JS 基础 → DOM/事件/异步 → TypeScript → npm/Vite 工程化

6. **阶段 5：前端开发框架（FE-01～FE-06、UI-01）**
   - Vue → React → Angular → Svelte → Next.js → Nuxt → UI 组件库

7. **阶段 6：基础与架构（NET-01、NET-02、ARCH-01～ARCH-03、UX-01）**
   - 互联网/域名基础 → 架构总览 → 架构模式对比 → 选型决策树 → 设计与用户体验
   - 注：NET 任务在顺序上可以提前到阶段 1 之前做，表里放在这里是因为它与架构决策强相关；站长如果想先补域名基础，可以直接先做 NET-01、NET-02，不影响后续。

8. **阶段 7：后端开发技术栈（BE-01～BE-05）**
   - PHP → Python → Node.js → Go → Java（各框架独立成章）

9. **阶段 8：数据库与 API（DB-01、DB-02、API-01）**
   - 表设计与 SQL → 备份/恢复/高可用 → REST/GraphQL/WebSocket/OAuth/JWT

10. **阶段 9：服务器与部署（SRV-01、SRV-02、DEPLOY-01～DEPLOY-03）**
    - Web 服务器完整模板 → 运行环境与进程管理 → CI/CD → Docker 多容器 → HTTPS/CDN 上线

11. **阶段 10：生产环境运营（OPS-01～OPS-04）**
    - SEO/性能 → 安全 → 监控/日志/告警 → 备份/迁移/灾难恢复

12. **阶段 11：完整实战（PROJ-01～PROJ-08）**
    - 静态站 → WordPress → Python → Node.js → PHP/Go → Docker 平台 → 论坛/电商/CMS/后台/SaaS → 旗舰：一台服务器托管多网站

13. **阶段 12：工具与整合验收（TOOL-01～TOOL-03、FINAL-01）**
    - 配置生成器 → 部署工具 → 检查工具 → 全站整合验收、导航接入（需站长批准）、发布验证、网站和 App 同步更新

## 每个任务的结束格式（固定不变）

1. 任务编号；2. 完成内容；3. 新增文件；4. 修改文件；
5. 代码和配置验证结果；6. 自动化测试结果；7. MkDocs 构建结果；
8. 未完成内容；9. 下一项建议任务编号。

完成后停止，等待站长下一条指令，不得自行进入下一个任务。

## 下一项建议任务

**WEB-01：HTML 基础与语义化标签**，待站长确认后开始。
在 WEB-01 开始前，先用一个测试文件验证一件事：未接入导航的 `docs/website-guide/` 文章在 `--strict` 构建下是否会警告或失败，验证结果写进 WEB-01 的验收报告里，再决定后续文章是先放本地目录、还是先以草稿形式管理。
