---
description: "构建系统与依赖管理入门：Make、CMake、Gradle、Maven、npm、pip 的通用模型，锁文件、版本解析与冲突处理；JS 工具链细节只链接、不展开。"
---

# 构建系统与依赖管理入门

## 1. 一句话定义

构建系统是把源代码按规则变成可运行产物（可执行文件、库、安装包）的自动化工具；依赖管理是声明、解析、下载并锁定项目所用的第三方库版本的一整套机制。

## 2. 为什么需要它

三个文件时，手动编译是一条命令；三百个文件加二十个第三方库时，手动编译是一场灾难：改了一个头文件要重编哪些文件？哪个库的哪个版本与当前代码兼容？同事装的库版本比你新半个版本，行为为什么不一样？

构建系统解决“怎么从源码到产物，并且只重做必要的部分”；依赖管理解决“项目到底用了哪些外部代码、各自是哪个版本、以及如何让所有人拿到同一套”。两者合起来，目标只有一个：**同一份源码，在任何机器上构建出行为一致的产物**。

## 3. 核心含义

### 3.1 构建的基本模型：任务、依赖与增量

无论工具名字怎么变，构建的核心模型是相通的：一张**任务依赖图**。每个任务（如“编译 A 文件”“链接生成可执行文件”）声明它依赖什么输入、产出什么；构建工具按依赖顺序执行任务，并跳过输入没变、产物已存在的任务——这就是“增量构建”。理解了这张图，就理解了所有构建工具的一半。

另一半是“声明式还是命令式”：声明式构建（如 Maven、Gradle 的常规写法、CMake 的目标声明）说“要什么结果”，工具决定步骤；命令式构建（如 Make 的规则）直接写“每一步怎么做”。声明式更容易维护，命令式更灵活也更容易写乱；实际项目里两者常常混用。

### 3.2 Make：最老也最直白的构建工具

Make 的规则是“目标：依赖”，下面跟一条真正执行的命令（**命令前必须是 Tab，不是空格**，这是新手最常见的报错来源）。实测（GNU Make 4.3，本 VM，见 3.6 节）：

```makefile
hello: main.c
	cc -o hello main.c
```

```bash
make && ./hello
```

实测输出：

```text
cc -o hello main.c
hello make
```

Make 只按文件时间戳判断是否重编：它不知道编译器版本变了、不知道某个宏定义来自哪里。够简单，也因此只适合小项目或作为其他构建系统的底层。

### 3.3 CMake：生成构建文件的“元构建系统”

CMake 本身不编译代码，它**生成**本机构建文件（本机是 Makefile，在别的系统上可以是 Visual Studio 工程或 Ninja 文件），再由那个构建系统真正编译。标准做法是**源码外构建**（out-of-source build）：构建产物放在单独的 `build/` 目录，不污染源码目录。实测（CMake 3.28.3，本 VM）：

```cmake
cmake_minimum_required(VERSION 3.10)
project(hello C)
add_executable(hello main.c)
```

```bash
cmake -S . -B build && cmake --build build && ./build/hello
```

实测输出（节选）：

```text
-- Build files have been written to: /tmp/devenv-test/cmake-demo/build
[100%] Built target hello
hello cmake
```

CMake 的价值在跨平台：同一份 `CMakeLists.txt` 在 Linux、macOS、Windows 上各自生成当地的构建文件，项目不用为每个平台手写一套构建规则。

### 3.4 Gradle 与 Maven：JVM 生态的两条路线

- **Gradle**：以任务图为核心，构建脚本用 Groovy 或 Kotlin DSL 编写；版本集中管理用 `gradle/libs.versions.toml` 版本目录（versions、libraries、plugins 三段），把全项目的依赖版本收进一个文件；可复现构建用**依赖锁定**：开启锁定后执行 `./gradlew dependencies --write-locks` 生成 `gradle.lockfile`，该文件应提交进版本控制，后续构建按锁定版本解析。锁定对动态版本有效，但不应用于内容会变的版本（如 `-SNAPSHOT`），这是 Gradle 官方文档明确提醒的误用。
- **Maven**：以 `pom.xml` 为核心、按生命周期（编译、测试、打包等阶段顺序执行）工作；版本冲突用 **“最近定义优先”（nearest definition）** 规则：依赖树里离项目最近的那个版本胜出，同深度时先声明的胜出；想稳稳地压住某个传递依赖的版本，就在自己项目的 `dependencyManagement` 里显式声明，或引入一份 BOM（Bill of Materials，即只含 `dependencyManagement` 的 POM，一次对齐一整组模块的版本）。

Gradle 与 Maven 的构建示例**均未实测**：本 VM 上 Gradle 守护进程无法通信、Maven 插件解析失败（详见 3.6 节与文末未完成项），下面的脚本仅为按官方文档写法的示意，不得当作实测结果引用：

```kotlin
// build.gradle.kts 示意（示例未实测）
tasks.register("hello") {
    doLast { println("hello gradle") }
}
```

```xml
<!-- pom.xml 最小骨架示意（示例未实测） -->
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>hello</artifactId>
  <version>1.0</version>
</project>
```

### 3.5 npm 与 pip：语言自带的包管理器

- **npm（JavaScript）**：`package.json` 声明依赖（直接依赖）与版本范围，`package-lock.json` 记录解析后的**整棵依赖树的确切版本与来源**，从而让后续安装不再重新算版本，而是复现锁文件描述的树。`npm ci` 严格按锁文件安装，常用于 CI。JS 工具链的完整细节（npm 与 pnpm 的取舍、Vite、ESLint 与 Prettier 分工等）不在本篇展开，见 [JS-04 前端工程化](../../website-guide/javascript/04-tooling.md)。
- **pip（Python）**：`requirements.txt` 每行一个依赖，版本写法遵循 PEP 440：`==` 精确、`>=` 下限、`<` 上限、组合表示区间（如 `>=1.10,<2.0`）、`~=` 兼容发布（如 `~=2.0` 约为 `>=2.0, ==2.*`）。注意 pip 里**没有** npm 风格的 `^` 写法；想复现环境用 `pip freeze` 导出当前已装包的精确版本。包隔离靠虚拟环境（`python -m venv`），而不是全局安装——全局装包是“换个项目就互相污染”的最快路径。

### 3.6 本篇实测记录

以下示例均在本 VM（Ubuntu 24.04，Python 3.12.3）上真实运行通过，命令与输出一一对应：

- **Make**：GNU Make 4.3，`make && ./hello` 输出 `hello make`（见 3.2 节）。
- **CMake**：CMake 3.28.3，`cmake -S . -B build && cmake --build build` 后运行输出 `hello cmake`（见 3.3 节）。
- **npm**：Node.js v24.22.1、npm 10.9.4。`npm init -y` 后 `npm install is-odd@3.0.1` 成功（`added 2 packages`），生成 `package-lock.json`，`node -e "console.log(require('is-odd')(3))"` 输出 `true`。
- **pip**：pip 24.0。`python3 -m venv` 创建虚拟环境后，`pip install requests==2.32.3` 成功，`pip freeze` 输出含 `requests==2.32.3` 及其传递依赖（如 `urllib3==2.8.0`、`certifi==2026.10.23`）。

未实测的部分：Gradle（本 VM 上 `gradle --version` 可显示 8.14.3，但执行任务时守护进程无法通信而失败）、Maven（`mvn -version` 可显示 3.9.9，但 `mvn compile` 在本 VM 上插件解析失败）、Docker 相关示例（见第 14 篇）。这些失败是本 VM 环境受限所致，不代表工具本身不可用；示例已按“示例未实测”标注。

## 4. 分类

按“版本是怎么定的”分，依赖声明有三种姿态，适用场景不同：

- **精确钉死**（如 `1.2.3`、`==2.32.3`）：行为最确定，适合应用发布、复现问题。代价是升级全靠手动，安全补丁不会自动进来。
- **范围声明**（如 npm 的 `^1.2.3`、`~1.2.3`，pip 的 `>=1.10,<2.0`）：允许在约定区间内自动取新版，兼顾新功能与兼容性。代价是“今天能构建”不等于“下周还能构建出同样的东西”——除非有锁文件兜底。
- **锁文件**（如 `package-lock.json`、`gradle.lockfile`、`pip freeze` 的导出结果）：记录某一次解析出的确切版本树，是“范围声明 + 可复现”的组合：平时用范围声明保持升级空间，发布与 CI 用锁文件保证同一套版本。

按“冲突时谁赢”分，主流解析策略也不同：Maven 是最近定义优先（离项目近的赢，不看新旧）；Gradle 默认取最高版本；npm 则靠锁文件把整棵树定下来。**同一组依赖换个工具可能解析出不同版本**，这是跨生态迁移时最容易踩的坑——先看解析结果（依赖树输出），再谈代码问题。

## 5. 典型应用

- **新项目起手**：先选构建工具与包管理器，再写第一行代码；反过来（代码写了一半才补依赖声明）必然补出一堆“不知道哪来的版本”。
- **复现线上问题**：按锁文件重建与线上同一套依赖，确认问题是代码问题还是某个库悄悄升级带来的行为变化。
- **安全升级**：锁文件让“升级某一个库”变成一次有 diff 的、可评审的变更，而不是所有依赖一起漂移；配合依赖扫描，先知道要升哪一个，再升。
- **多模块项目**：版本目录（Gradle）、BOM（Maven）或工作区（npm workspaces 等，细节见 JS-04 链接）把几十个模块的版本收进一处，避免每个模块各写一套、最后对不上。

## 6. 限制与常见误解

限制，必须说清：

- **锁文件只锁版本，不锁行为**：锁住的版本本身可能含有 bug 或漏洞；锁文件保证的是“同一套”，不是“正确的一套”。升级与安全扫描仍要定期做。
- **构建可复现不等于产物字节相同**：时间戳、路径、编译器版本都可能让两次构建的产物字节不同；“可复现构建”在严格语境下另有专门定义，本篇只讲到“同一依赖树、同一构建规则”这一层。
- **传递依赖是真实的依赖**：直接依赖只有几个，不代表项目只依赖几个；`pip freeze`、依赖树输出里那些没亲手写过的名字，同样会进产物、同样可能出漏洞，升级时要一起看。

常见误解：

- **“`package.json` 里写了版本就等于锁定了”**：错。范围声明每次安装都可能解析出新版；真正锁定的是锁文件，而且锁文件必须提交进版本控制才对团队生效。
- **“最新版一定最兼容”**：错。语义化版本（SemVer：主版本.次版本.补丁号，主版本变表示可能不兼容）只是约定，不是强制；上游不遵守约定时，小版本升级也可能破坏构建——这正是锁文件与测试存在的理由。
- **“构建工具都一样，换一个无非换个命令”**：错。解析策略（最近优先 vs 最高版本）、生命周期、插件机制都不同；换工具要先对齐解析结果，不能只翻译命令。

## 7. 小结

构建系统是任务依赖图加增量执行，依赖管理是声明、解析与锁定的组合拳：范围声明留升级空间，锁文件保可复现，冲突规则因工具而异。边界是：本篇讲跨语言通用模型，JS 专属工具链细节只链接、不展开；各工具的最新版本与命令以官方发布为准。

---

## 文章信息（统一字段）

- 来源：npm 官方文档“package-locks”（https://docs.npmjs.com/cli/v6/configuring-npm/package-locks/）；Gradle 官方文档“Locking Versions”（https://docs.gradle.org/9.4.0/userguide/dependency_locking.html）；Maven 官方文档“Introduction to the Dependency Mechanism”（https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html）；pip 版本写法遵循 PEP 440（经联网核查多方来源一致）。
- 适用版本：实测版本：GNU Make 4.3、CMake 3.28.3、npm 10.9.4（Node.js v24.22.1）、pip 24.0（Python 3.12.3）；仅核对 `--version` 未跑通构建示例：Gradle 8.14.3、Maven 3.9.9；其余工具版本以官方发布为准。
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[版本控制进阶：Git 工作流](02-git-workflows.md)（锁文件与构建配置都要提交进版本控制，工作流见该篇）
- 相关主题：[开发环境搭建与容器化开发](14-dev-environment-setup.md)（本域第 14 篇，语言版本与编辑器环境）；[JS-04 前端工程化](../../website-guide/javascript/04-tooling.md)（JS 工具链细节：npm 与 pnpm 取舍、Vite、ESLint 与 Prettier 分工，本篇不展开，只做引用）
- 未完成项：Gradle 任务示例与 Maven 编译示例未实测（本 VM 上 Gradle 守护进程无法通信、Maven 插件解析失败，需在正常开发机上实测）；Maven 是否有与 npm/Gradle 对等的官方锁文件机制，写作时未在 Maven 官方依赖机制文档中找到对应内容，以官方发布为准；各工具的最新主版本（Gradle、Maven、npm）以官方发布为准。
