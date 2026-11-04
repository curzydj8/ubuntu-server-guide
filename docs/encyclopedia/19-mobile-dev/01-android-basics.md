---
description: "19 移动应用与跨平台开发：Android 开发基础——应用组件、生命周期、权限模型、Gradle 构建的概念与分工。"
---

# Android 开发基础

## 1. 本章目标

读完本篇能理解：Android 应用由哪几种组件构成、Activity 生命周期为什么这样设计、权限模型如何保护用户、Gradle 构建中各部分的分工。

## 2. 背景与问题

手机不是缩小版电脑。它的屏幕会旋转、会被电话打断、会被系统随时回收内存、电量有限、用户随时可能切走。一个桌面程序可以假设“自己一直在前台、内存一直够用”，移动应用不能。Android 的整套设计就是围绕这几个现实展开的：用组件拆分应用，用生命周期管理“可见、可用、被回收”三种状态，用权限模型管住敏感能力，用构建系统把一份源码变成能在成千上万种机型上安装的包。

本篇讲 Android 原生开发的基础概念，不讲具体界面写法（界面写法见 03 域前端文章，思想相通、API 不同）；iOS 的对应概念见本域第二篇的选型对照。

## 3. 总体架构

Android 系统自下而上分四层（文字结构图）：

```
应用层
├── 你的应用：Activity、Service、BroadcastReceiver、ContentProvider
└── 系统应用：电话、短信、设置（同样是应用，权限与你的应用平等）
应用框架层（Java/Kotlin API）
├── Activity Manager、Window Manager、Content Providers、View System
├── Notification Manager、Package Manager、Resource Manager
└── Location、Telephony、Camera 等服务接口
运行时与原生库层
├── ART（Android Runtime，运行 Dex 字节码，AOT + JIT 混合编译）
├── 核心库（Kotlin/Java 标准库子集）与原生库（OpenGL、SQLite、WebKit、libc 等）
└── HAL 与驱动之上的原生接口
Linux 内核层
├── 进程、内存、驱动、电源管理、Binder 驱动（进程间通信）
└── 每个应用跑在独立的 Linux 进程、独立的用户 ID（UID）下
```

两个要点决定了后面的一切：第一，应用不是“一个程序”，而是一组由系统调度的组件；第二，每个应用是独立的 Linux 用户，沙箱隔离是操作系统层面的，不是应用自觉遵守的约定。

## 4. 工作机制

### 4.1 四大组件：各司其职

- **Activity（活动）**：有界面的单个屏幕。用户看到的几乎每个页面都是一个 Activity。Activity 不直接创建另一个 Activity，而是向系统发 Intent（意图），由系统决定启动哪个组件——这就是 Android 能实现“分享到微信”“用浏览器打开链接”的基础：跨应用跳转是系统能力，不是应用私下调用。
- **Service（服务）**：无界面的后台任务。分两类：前台服务（必须挂常驻通知，用户看得见，例如音乐播放）和后台服务（系统随时可能在内存紧张时杀掉）。Android 8.0 之后后台服务受到严格限制，周期性任务应交给 WorkManager（见第三篇），而不是常驻 Service。
- **BroadcastReceiver（广播接收器）**：监听系统或应用广播（如开机完成、网络变化、电池低）。Android 8.0 之后，多数隐式广播不再允许静态注册接收，目的是省电：不让每个应用都为了一条广播常驻内存。
- **ContentProvider（内容提供者）**：应用间共享结构化数据的标准接口（通讯录、媒体库都由它提供）。它不解决“怎么存”，只解决“怎么安全地给别人读”：调用方要过权限检查，数据格式由 URI + Cursor 约定。

### 4.2 Activity 生命周期：状态机，不是流程图

Activity 在任何时刻只处于一个状态，状态变化由系统回调通知：

```
启动：onCreate → onStart → onResume（获得焦点，可交互）
切走（仍可见，如弹对话框）：onPause
切走（不可见）：onPause → onStop
返回：onRestart → onStart → onResume
销毁：onPause → onStop → onDestroy
```

关键理解有三点：

- **onCreate 只保证调用一次，onStart/onResume 会反复调用**。初始化放 onCreate，刷新数据、注册监听放 onResume/在 onPause 里反向释放——放错位置就会出现“返回页面数据不刷新”或“切后台还在耗电”。
- **系统可以在不经过 onDestroy 的情况下杀死后台进程**。所以重要状态不能只存在内存变量里，要在 onPause/onSaveInstanceState 时持久化。认为“进程被杀是异常”的写法，在 Android 上是错误写法。
- **配置变更（旋转、语言切换、深色模式切换）会重建 Activity**。默认行为是销毁重建，界面状态靠 SavedState 恢复；用 ViewModel 保存数据可以跨越重建，但 ViewModel 也救不了进程被杀——持久化与内存缓存是两回事。

### 4.3 任务栈与返回栈：返回键的行为由此决定

Activity 按启动顺序压入任务栈（Task），返回键弹栈回到上一个 Activity。启动模式（standard、singleTop、singleTask、singleInstance）控制“同一个 Activity 是否复用、是否独占任务”。新手最常见的坑是滥用 singleTask 导致返回路径混乱：除非确实需要“全局唯一入口”（如主界面），否则默认 standard 最符合用户对返回键的预期。

### 4.4 权限模型：安装时声明，运行时申请

Android 权限分三档：

- **普通权限**（如联网、震动）：安装时自动授予，用户无感知。
- **危险权限**（如位置、相机、通讯录、存储）：必须运行时动态申请，用户可以“仅本次”“使用时允许”“拒绝”。申请前应先说明用途；被拒绝后不应反复弹窗，而应降级功能或引导用户去设置页手动开启。
- **特殊权限**（如悬浮窗、修改系统设置、无障碍）：需引导用户到专门设置页，系统不提供标准弹窗。

权限模型的核心取舍是：把决定权交给用户，代价是开发者必须写“无权限也能跑”的降级路径。把权限申请写成“不同意就闪退”，是设计错误，不是用户错误。敏感权限还受“自动重置”机制影响：长期不用的应用，其权限会被系统收回，下次启动要重新申请。

### 4.5 Gradle 构建：概念与分工

Android 构建不是“点一下运行”那么简单，分工如下：

- **Gradle**：通用构建工具，负责任务编排（编译、打包、签名、测试）和依赖解析。它不懂 Android，只懂任务图。
- **Android Gradle Plugin（AGP）**：Gradle 的 Android 插件，负责把源码、资源、清单文件变成 APK/AAB，处理构建变体、混淆（R8）、签名。AGP 版本与 Gradle 版本、JDK 版本有对应关系，升级要按官方对应表一起升，单升一个常导致构建失败。
- **构建变体**：`buildTypes`（debug/release，如是否可调试、是否混淆）× `productFlavors`（免费版/付费版、不同渠道）组合出最终产物。同一份源码出多个包靠变体，不靠复制工程。
- **依赖与版本目录**：第三方库由 Maven 坐标引入，版本集中管理（Version Catalog）。依赖冲突时 Gradle 按“最新版本胜出”解析，冲突解决失败要显式处理，不能靠“多引一个旧版试试”。

一个最小的模块级构建配置概念（示例，未经本机编译验证）：

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.myapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.myapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
}
```

其中 `compileSdk` 是编译时可用的 API 上限，`minSdk` 是能安装的最低系统，`targetSdk` 是声明“我已按该版本的行为规范测试过”——系统对旧 targetSdk 的应用会启用兼容行为，对新 targetSdk 则执行更严格的规则。Google Play 自 2026 年 8 月 31 日起要求新应用与更新 target Android 16（API 36）或更高，见来源。

## 5. 关键设计取舍

- **组件化换灵活性，代价是状态管理变难**：Intent 跨应用跳转很强大，但 Activity 随时可被销毁重建，状态管理必须按生命周期设计，不能假设内存常在。
- **沙箱换安全，代价是共享要走标准接口**：应用间不能直接读对方文件，分享数据要走 ContentProvider 或系统分享通道；绕过沙箱的写法（如共享 UID、root 前提）在正常分发渠道不可行。
- **后台限制换电量，代价是后台任务要重构**：从常驻 Service 转向 WorkManager、闹钟、推送，任务的及时性由系统调度决定，应用不能保证“每分钟准时跑一次”。
- **运行时权限换隐私，代价是降级路径必须写**：没有“用户一定同意”的假设，功能设计要从“有权限时增强、无权限时可用”出发。

## 6. 分类与变体

- **语言**：Kotlin 是 Android 官方首选语言（空安全、协程），Java 仍可维护老项目；新项目无特殊原因应选 Kotlin。
- **界面体系**：View 体系（XML 布局 + View）与 Jetpack Compose（Kotlin 代码声明式 UI）并存。Compose 是新方向，老项目迁移按页面逐步替换，不必一次性重写。
- **架构模式**：官方推荐 MVVM + Repository：界面层（Activity/Fragment + ViewModel）只管展示，数据层（Repository + Room/网络）只管来源；界面层直接调数据库或网络，是后期最难维护的写法。
- **分发格式**：AAB（Android App Bundle）是上架格式，由商店按设备生成优化后的 APK；直接分发可用 APK。签名是身份，丢了签名密钥就等于丢了该应用的更新权，必须离线备份。

## 7. 应用与限制

- 适用：需要完整系统能力（后台服务、传感器、系统分享、硬件接口）的产品；对启动速度、动画帧率、包体积敏感的产品。
- 不适用：只做内容展示且需同时覆盖 iOS 的产品（见本域第二篇选型）；团队无 Android 经验又要求双端快速上线时，原生双写成本最高。
- 本站的 Linux Server Toolkit 应用即为原生 Android 应用的一个产品实践，本文不展开其源码与实现。

## 8. 常见误解

- “Activity 的 onDestroy 一定会执行。”错：进程被杀时不保证回调，持久化不能依赖它。
- “申请了权限用户就会同意。”错：用户可以拒绝、可以只给一次、可以事后收回，降级路径是必写项。
- “Service 可以一直在后台跑。”错：现代 Android 对后台执行有严格限制，周期任务应走 WorkManager，见第三篇。

---

## 文章信息

- 来源：Android Developers《应用基础知识》《Activity 生命周期》《权限》《Gradle 与 Android Gradle Plugin》官方文档；Google Play 目标 API 要求：https://developer.android.com/google/play/requirements/target-sdk?hl=en
- 适用版本：Android 16（API 36）为 Google Play 目标基线（2026 年 8 月 31 日起对新应用与更新生效）；Android 17（API 37）已于 2026 年 6 月发布，Play 尚未强制要求
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[数字逻辑与组成基础](../01-computer-basics/01-digital-logic.md)（二进制与位概念）、[JavaScript 基础完整教程](../../website-guide/javascript/01-basics.md)（编程基础，02 域）、[HTML 基础与语义化标签](../../website-guide/html/01-basics.md)（界面结构思想，03 域）
- 相关主题：[跨平台框架选型](02-cross-platform.md)（下一篇：何时不选原生）、[移动端性能与适配](03-performance-adaptation.md)（第三篇：生命周期与性能的关系）、[流媒体与直播基础](../22-digital-media/02-streaming-live-basics.md)（媒体播放场景，22 域）
- 未完成项：iOS 对应概念的真机验证未做（本篇只讲 Android）；AGP 与 Gradle 的最新对应表以官方发布为准，本文不锁定小版本
