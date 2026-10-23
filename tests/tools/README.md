# 工具页测试（tests/tools）

工具页 `docs/tools/index.md` 的全部自动化测试。分两层：

- `unit/`：按开发批次组织的单元测试（batch-a 51 项、batch-b 84 项、batch-c 86 项、batch-d 含 F-1 复核与 Nginx 黄金回归共 80 项，合计 301 项）。每批把该批工具的 HTML 片段与 JS 组装成最小页面用 jsdom 驱动，另从仓库的工具页原文摘录全站共用助手函数，模拟真实集成环境。
- `integration/`：整页集成测试，对 `mkdocs build` 的成品页运行：三套冒烟（smoke-full / smoke-bc / smoke-d）、命令解释器专项（explain-check）、P0-1 专项矩阵（test-p0-1，Netplan/UFW，含 PyYAML 结构断言，需要 python3 + PyYAML）。

## 运行

前提：Node.js 20+、python3（仅 P0-1 矩阵需要 PyYAML）。

```bash
cd tests/tools
npm install        # 安装锁定的 jsdom
cd ../..
pip install -r requirements.txt
mkdocs build --strict -d /tmp/guide-site
bash tests/tools/run.sh /tmp/guide-site/tools/index.html
```

`run.sh` 依次跑全部单元与集成套件，任一失败以非零码退出并指出失败套件。CI 的 `tools-tests` 作业执行同一脚本（见 `.github/workflows/ci.yml`）。

## 维护约定

- 新增/修改工具时，断言优先加到对应批次的单元套件；整页行为变化同步更新冒烟。
- `unit/batch-d/test-nginx.mjs` 的黄金输出是回归基线：Nginx 生成器单后端输出若有意变更，先人工核对新输出再更新黄金值，并在提交说明里注明。
- 测试只在本地/CI 的 jsdom 与构建成品上运行，不触碰任何真实服务器。
