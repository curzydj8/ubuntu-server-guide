# GitHub 同步说明（android-app/）

本目录是 Linux Server Toolkit 安卓 App 的源码镜像，与指南站同仓同步（站长 2026-10-24 决定）。
本地工程（独立 git）为准，GitHub 此目录为快照推送，不含本地提交历史。

## 未纳入同步的文件（均为可再生成的二进制/产物）

| 文件 | 再生成方式 |
|---|---|
| `app/src/main/assets/content-export.zip` | 在指南站仓库运行 `python3 scripts/export-content.py` 导出后，压缩 `content-export/` 并放入 assets |
| `gradle/wrapper/gradle-wrapper.jar` | 用系统 Gradle 8.14.3 在工程根执行 `gradle wrapper --gradle-version 8.14.3 --distribution-type bin` |
| `keystore/debug.keystore` | 工程固定的调试密钥（非发布密钥）：`keytool -genkeypair -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Linux Server Toolkit' -keystore keystore/debug.keystore -storepass android -keypass android`（说明见 keystore/README.md） |
| `core/network/src/test/resources/test-keystore.jks` | 测试用自签证书库，生成方式见工程 docs/ 验收记录-第四阶段 |
| 各模块 `build/`、`.gradle/` 等 | 构建产物，不入库 |
| `local.properties` | 本机构建机 SDK 路径（`sdk.dir=…/devtools/android-sdk`），与他人机器无关，不入库 |

## 构建

```bash
./build.sh   # = gradlew assembleDebug + testDebugUnitTest + lintDebug
```

环境与版本矩阵见工程 docs/ 与指南站仓库的任务书记录。
