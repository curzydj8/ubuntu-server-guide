# Linux Server Toolkit

与《Ubuntu Server 终极指南》同源的原生 Android 工具集（Kotlin + Jetpack Compose）。
32 个工具与网站同源编号（N-01 起），离线优先；凭据只存 Android Keystore 保险库，绝不明文落库。

## 构建

```bash
./build.sh   # 组装 Debug + JVM 单元测试 + Lint（验收口径）
```

环境要求：JDK 21、Android SDK（platform 36、build-tools 36.0.0），版本矩阵见
`docs/验收记录-第一阶段.md` 与任务书实施前输出。

## 结构

- `app`：装配与导航
- `core:common / ui / database / network / security / testing`
- `feature:dashboard / tools / settings`（knowledge、sync、ssh、monitoring 按阶段启用）
