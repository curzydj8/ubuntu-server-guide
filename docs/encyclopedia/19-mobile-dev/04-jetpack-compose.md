---
description: "19 移动应用与跨平台开发：Jetpack Compose 入门——声明式 UI 思想、Composable 与状态管理、与 View 体系的对比与互操作、常用组件与布局、主题与 Material 3。"
---

# Jetpack Compose 入门

## 1. 本章目标

读完本篇能理解：声明式 UI 与命令式 UI 的根本区别、Composable 函数如何描述界面、状态变化如何驱动界面更新、Compose 与 View 体系如何在一部应用中共存，以及 Material 3 主题如何统一应用外观。

## 2. 背景与问题

第一篇讲过，Android 传统的 View 体系用 XML 描述布局、用代码操作 View 对象：找到一个 TextView，再调用 `setText()` 改它的内容。界面越复杂，这种“先找到控件、再逐个改”的写法就越难维护：一个状态变化要改五处控件，漏改一处界面就与数据不一致；屏幕旋转重建后，还要把每一处控件的状态逐一恢复。

Jetpack Compose 是 Android 官方的现代 UI 工具包，用 Kotlin 代码以声明式的方式写界面：不描述“怎么一步步改界面”，只描述“给定当前状态，界面应该长什么样”。状态变了，框架负责把界面更新到与状态一致的样子。理解这一句话，就理解了 Compose 一半的内容；另一半是理解它更新界面的具体机制——重组（Recomposition）与状态管理。

本篇讲 Compose 的概念与用法思想，不讲某一具体控件的全部 API（参数细节以官方文档为准）；与 View 体系的取舍对照见本节第 5 节，跨平台框架中的声明式思想对照见本域第二篇。

## 3. 总体架构

Compose 应用的界面是一棵由 Composable 函数调用构成的树（文字结构图）：

```
应用状态（State：数据、UI 状态）
        │ 状态变化
        ▼
Composable 函数（纯描述：状态 → 界面）
├── 布局：Column / Row / Box / LazyColumn
├── 组件：Text / Button / TextField / Image / Card
└── 修饰符：Modifier（尺寸、边距、点击、背景……）
        │ 框架按需重组
        ▼
渲染层（与 View 体系不同的渲染路径，直接由 Compose 运行时绘制）
```

三个要点决定了后面的一切：第一，界面是状态的函数，同一状态总画出同一界面；第二，Composable 函数本身不持有界面对象，它只在被调用时“描述”界面；第三，状态变化时框架只重新执行受影响的 Composable 函数（重组），而不是重建整个界面。

## 4. 工作机制

### 4.1 声明式 UI：描述“应该是什么样”，而不是“怎么改”

命令式写法（View 体系）的思路是：“界面现在长这样，我要把它改成那样”，代码是一连串修改指令。声明式写法（Compose）的思路是：“当前状态是这样，界面就该长这样”，代码是一次描述。

一个计数器的例子能看清区别。命令式要写：按钮点击时取计数、加一、再找到 TextView 把新数字写回去。声明式只写两件事：一个保存计数的状态，和一个“显示当前计数”的界面描述。点击只改状态，界面更新由框架接手。状态与界面的同步关系从“开发者每次手动保证”变成了“框架结构性保证”，漏同步的那类 Bug 从根上消失了——代价是开发者必须先想清楚“状态是什么、放在哪”，而不是“控件在哪、怎么改它”。

### 4.2 Composable 函数：界面的基本单位

Composable 函数是用 `@Composable` 注解标记的 Kotlin 函数：

```kotlin
@Composable
fun Greeting(name: String) {
    Text(text = "你好，$name")
}
```

理解 Composable 函数有四点：

- **它描述界面，不返回界面对象**。调用 `Greeting("dawei")` 不会得到一个 TextView 对象；它只是在组合（Composition）这棵界面树里记下“这里有个 Text”。
- **它可以像普通函数一样组合**。一个屏幕的 Composable 函数调用布局函数，布局函数再调用更小的组件函数，层层嵌套成界面树；复用就是把一段界面抽成一个函数。
- **它可以带参数，也可以不带参数**。参数通常是“要显示的数据”和“用户操作发生时调用的回调”（例如 `onClick: () -> Unit`），这正是状态提升（见 4.3）的落点。
- **它应该是无副作用的**。同一状态下重复执行应得到同一界面描述；网络请求、写数据库、注册监听这类副作用不该直接写在 Composable 函数体里，而应放在副作用 API（如 `LaunchedEffect`、`DisposableEffect`）或 ViewModel 里。把副作用写进函数体，会在重组时被重复执行，是新手最常见的 Bug 来源之一。

### 4.3 状态与重组：界面如何“跟着数据变”

Compose 的状态是可观察的数据：状态变了，读取它的 Composable 函数会被重新执行（重组），界面随之更新。

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
    Column {
        Text(text = "计数：$count")
        Button(onClick = { count++ }) {
            Text("加一")
        }
    }
}
```

（示例未实测：以上代码为说明概念的示例，未在本机编译运行。）

关键概念有四个：

- **State（状态）**：用 `mutableStateOf` 创建的可观察值。读它时 Compose 会记录“这个函数依赖这个状态”；写它时，依赖它的函数被安排重组。
- **remember（记忆）**：让一个值在重组之间存活下来。没有 `remember`，每次重组都会重新创建状态，计数器一点就归零。`remember` 只保住重组之间的值，配置变更（旋转屏幕）导致 Activity 重建时它会丢失；需要跨越配置变更的状态应使用 `rememberSaveable` 或放到 ViewModel 里。
- **状态提升（State Hoisting）**：把状态放到调用方持有，通过参数往下传数据、通过回调往上传事件。子组件只管“显示与上报”，不管“保存与决定”。提升之后，同一个状态可以被多个组件共享，状态的唯一来源（Single Source of Truth）只有一个，界面不可能出现“两处显示不一致”。
- **重组的范围**：框架会尽量只重组读取了变化状态的函数，而不是整棵树。写出“重组范围过大”的代码（如在高层读取了一个频繁变化的状态，导致整屏重组）会拖慢帧率；性能排查思路见第三篇，排查方向是“哪个状态被谁读取、重组范围有多大”。

状态的存放位置按生命周期分三档：只在一次组合内有效的放 `remember`；要跨越配置变更的放 `rememberSaveable` 或 ViewModel；要跨越进程、需要持久化的放数据库或文件（见第一篇生命周期：进程被杀时内存状态同样会丢失）。

### 4.4 与 View 体系的对比与互操作

| 维度 | View 体系 | Jetpack Compose |
|---|---|---|
| 描述方式 | XML 布局 + 代码操作 View 对象（命令式） | Kotlin 函数描述界面（声明式） |
| 状态与界面同步 | 开发者手动改控件 | 状态变化驱动重组，框架保证同步 |
| 布局 | ViewGroup 嵌套（LinearLayout、ConstraintLayout 等） | Column / Row / Box 等 Composable 布局 |
| 复用单位 | 自定义 View / Fragment | Composable 函数 |
| 状态恢复 | SavedState、ViewModel | rememberSaveable、ViewModel（同一套） |

两者不是“新旧替代、只能二选一”的关系，官方支持双向互操作：

- **Compose 里用 View**：`AndroidView` 可把任意 View（例如地图、WebView、尚无 Compose 版本的第三方控件）嵌进 Compose 界面。
- **View 里用 Compose**：`ComposeView` 可把一段 Compose 界面嵌进 Activity 或 Fragment 的 View 层级里；`AndroidViewBinding` 可复用已有的 XML 布局绑定。

老项目迁移的常规做法是按页面逐步替换：新页面用 Compose 写，旧页面保持 View 不动，共存期间用互操作 API 衔接。第一篇提到的架构分工（MVVM + Repository、ViewModel 跨越配置变更）对两套 UI 体系同样适用——换 UI 层不必换架构层，这是迁移成本可控的原因。

### 4.5 常用组件与布局：先掌握最小集合

Compose 内置组件数量很多，入门先掌握最小集合，再按需扩展：

- **布局**：`Column`（纵向排列）、`Row`（横向排列）、`Box`（层叠）、`LazyColumn` / `LazyRow`（只渲染可见项的滚动列表，是长列表的默认选择；一次性渲染全部项的 `Column` 加滚动只适合短列表）。
- **组件**：`Text`（文字）、`Button`（按钮）、`TextField`（输入框）、`Image`（图片）、`Card`（卡片容器）、`Icon`（图标）、`Checkbox` / `Switch`（选择类控件）。
- **修饰符 Modifier**：几乎所有外观与行为都挂在 `Modifier` 链上：`Modifier.padding()`、`Modifier.fillMaxWidth()`、`Modifier.clickable {}`、`Modifier.background()`。修饰符的顺序有意义（例如先裁剪后加边距，与先加边距后裁剪，结果不同），链的顺序即生效顺序。
- **对齐与排列**：`Column` / `Row` 用 `horizontalAlignment` / `verticalArrangement` 控制子项的对齐与间距；`Box` 用 `contentAlignment` 控制层叠位置。先想清楚“子项沿哪个方向排、如何对齐”，再写修饰符。

### 4.6 主题与 Material 3：外观的统一来源

Material 3（Material You）是 Android 当前的设计语言，Compose 的 Material 3 库（`androidx.compose.material3`）提供了对应的组件与主题机制。主题的核心是集中定义三组值，界面各处引用主题值而不是写死具体数值：

- **色彩（ColorScheme）**：主色、次色、背景、表面、错误色等一套语义化颜色；深色模式由系统切换，主题提供深浅两套配色，界面代码不用为深色模式写分支。
- **排版（Typography）**：标题、正文、标签等层级的字号、字重、行高；同一层级的文字在全应用长得一致。
- **形状（Shapes）**：卡片、按钮、对话框的圆角档位。

使用方式是：在应用根部用 `MaterialTheme` 包裹界面树，主题值通过组合局部变量向下传递，任何子组件都可读取。换主题（如用户切换深色模式、换品牌色）时只需换主题值，不必改每个组件。第一篇提到的“网站同款深橙”这类品牌色，落实到 Compose 里就是主题的 `ColorScheme`——颜色是主题的属性，不是某个界面的属性。

## 5. 关键设计取舍

- **声明式换同步正确性，代价是状态设计前置**：不用再手动同步界面与数据，但必须先想清“状态是什么、放在哪、谁能改它”。状态放错位置（例如把共享状态塞进某个子组件内部），复用与测试都会变难。
- **重组换局部更新，代价是函数必须纯净**：重组只更新受影响的部分，但前提是 Composable 函数无副作用、参数稳定。副作用写错位置、每帧新建对象，都会放大重组开销。
- **Kotlin 代码写界面换表达力，代价是预览与调试方式变了**：界面即代码，条件、循环、复用都用语言本身表达；但 XML 的可视化编辑器不再适用，取而代之的是 `@Preview` 预览与重组调试，排查思路要跟着换。
- **渐进迁移换风险可控，代价是双体系共存期**：互操作让迁移可以按页面逐步做，但共存期间团队要同时维护两套 UI 写法与两套排查经验，迁移要有明确的收尾计划，而不是无限期共存。

## 6. 分类与变体

- **按界面来源分**：纯 Compose 页面（新页面首选）、Compose 嵌 View（复用无 Compose 版本的控件）、View 嵌 Compose（老页面逐步替换的过渡形态）。
- **按状态来源分**：界面内部状态（`remember`，如输入框焦点、展开收起）、界面共享状态（ViewModel，如列表数据、加载状态）、持久化状态（数据库 / DataStore，如用户设置）。
- **按主题分**：Material 3 默认主题、自定义品牌主题（改 `ColorScheme` / `Typography` / `Shapes`）、深色模式（系统切换，两套配色）。

## 7. 应用与限制

- 适用：新 Android 项目的界面层（官方推荐方向）；已有项目的增量页面；需要与 View 体系共存的渐进迁移。
- 不适用：只做内容展示且需同时覆盖 iOS 的产品（见本域第二篇选型，跨平台框架另有声明式方案）；团队无 Kotlin 经验又要求立即交付时，学习成本要算进排期。
- 本篇所述 API 用法均为概念级描述，未经本机编译验证；具体函数签名与参数以官方文档为准，Compose 版本号以官方发布为准，本文不锁定小版本。

## 8. 常见误解

- “Compose 就是不用写 XML 了，所以更简单。”错：省掉的是布局文件，不是布局思考——排列、对齐、重组范围、状态位置的思考一点没少，只是换了表达方式。
- “状态变了整屏都会重绘。”错：重组按依赖关系局部发生；但写错代码（如高层读取高频变化的状态）确实会放大重组范围，性能问题要按“状态—读取者—重组范围”排查。
- “Compose 和 View 不能混用，迁移必须一次性重写。”错：官方提供双向互操作 API，常规做法是按页面逐步替换。
- “把副作用写在 Composable 函数里没关系，反正只执行一次。”错：重组会重复执行函数体，副作用必须放在副作用 API 或 ViewModel 里。

---

## 文章信息

- 来源：Android Developers《Jetpack Compose》《Compose 状态》《Compose 与 View 互操作》《Material Design 3》官方文档
- 适用版本：Jetpack Compose 稳定版（以官方发布为准，本文不锁定小版本）；Kotlin 为官方首选语言；Google Play 目标 API 基线见第一篇
- 核实日期：2026-11-06
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[Android 开发基础](01-android-basics.md)（本组第一篇：Activity 生命周期、View 体系、MVVM 架构）、[移动端性能与适配](03-performance-adaptation.md)（第三篇：帧率与重组范围的排查思路）
- 相关主题：[跨平台框架选型](02-cross-platform.md)（第二篇：Flutter / React Native 的声明式 UI 对照）、[Vue 完整教程](../../website-guide/frontend/01-vue.md)（03 域：声明式 UI 思想的 Web 对照）
- 未完成项：本文代码示例未实测（未在本机编译运行）；Compose 各组件的最新 API 参数与版本号以官方发布为准（待核实）；真机上的重组性能表现未实测
