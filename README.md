# Ubuntu Server 终极指南与实战教程

全面、深度的 Ubuntu Server 全栈教程站：基础安装、安全加固、存储、网络服务、容器、监控、自动化、故障排查、网站部署与游戏服务器，共 10 个部分、40 章正文 + 9 篇导览，全部按「概述 → 前置条件 → 手把手步骤 → 验证 → 排坑 → 最佳实践」六段式模板撰写，命令开箱即用，适配 Ubuntu 22.04 / 24.04 LTS。

**在线阅读**：https://curzydj8.github.io/ubuntu-server-guide/

## 本地构建

```bash
pip install mkdocs-material jieba
mkdocs serve   # 本地预览 http://127.0.0.1:8000
mkdocs build   # 构建到 site/
```

## 目录

- `mkdocs.yml` — 站点配置与导航
- `docs/` — 全部章节 Markdown 源文件
- `site/` — 构建产物（发布到 gh-pages 分支，不纳入 main）

## 姊妹教程

偏桌面与远程控制场景的旧版教程：https://github.com/curzydj8/ubuntu-server-tutorial
