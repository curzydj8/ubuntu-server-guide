# CSS-12：Foundation、UIkit 完整教程

> 任务编号：CSS-12（网站建设与部署实战指南 · CSS 框架第 4 篇）
> 上一篇：[CSS-11 Bulma](./03-bulma.md)；下一篇：[CSS-13 Pico CSS、Materialize](./05-pico-materialize.md)。
> 本篇一次讲两个框架：Foundation 的 XY Grid 与常用组件、UIkit 的组件体系，两者的 Sass / Less 定制方法，以及两者适用场景的对照。不讲 Bootstrap、Tailwind、Bulma（那是本系列前面的框架篇），不重讲 Grid 布局的基础概念（那是 CSS-05）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 用 Foundation 的 XY Grid 写出 12 列响应式布局，并说出 `grid-x`、`cell`、`grid-margin-x` 各自的职责；
2. 用 Foundation 的 Button、Callout、Card、Menu 写出一个不需要 JavaScript 也能正常显示的页面区块；
3. 用 UIkit 的 `uk-grid`、`uk-card`、`uk-navbar`、`uk-button` 写出同类页面区块，并说出 UIkit 与 Foundation 在组件写法上的最大区别；
4. 分别用 Foundation 的 Sass 变量和 UIkit 的 Less 变量改掉主色，知道改完之后要重新编译、不能只改变量文件就期望页面变色；
5. 面对一个新项目，能按本篇第 7 节的对照表判断该选 Foundation、UIkit，还是两个都不选。

## 2. 适用人群

已经学完本指南 CSS-01 至 CSS-08 的读者：会写选择器、盒模型、Flex、Grid、响应式，知道 Sass 是什么、CSS 文件怎么组织。本篇不从零讲 HTML 标签和 CSS 语法，遇到不懂的基础概念请先回看 CSS-01 至 CSS-08。

如果你只想快速搭一个管理后台、产品介绍页、企业官网，不想自己从零写全部组件样式，本篇就是为你准备的。如果你要做的是高度定制的设计稿还原、或者团队已经定了 Tailwind / Bootstrap，本篇可以只读第 7 节的对照表做决策参考。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Ubuntu 均可，本篇的完整示例只需要一个浏览器，不依赖任何操作系统特有的工具。
- 浏览器：Chrome、Edge、Firefox、Safari 的近两年版本。两个框架都不支持 IE，旧项目如果必须兼容 IE，请不要选这两个框架的新版本。
- Foundation：**Foundation for Sites 6.9.0**（2024 年 9 月 27 日发布，核查日期 2026-11-03，来源为 Foundation 官方 GitHub 仓库的 Releases 页与 jsDelivr 的版本列表）。6.9.0 要求 Node.js 18 以上，并且只用 Dart Sass，不再支持 LibSass / Ruby Sass。截至核查日没有 Foundation 7 的正式版，6.9.0 就是当前能用的最新稳定版。
- UIkit：**UIkit 3.25.28**（2026 年 10 月 26 日发布，核查日期 2026-11-03，来源为 UIkit 官网的 Changelog 页与官网首页显示的版本号）。UIkit 3 不依赖 jQuery，JavaScript 组件用原生 JavaScript 写成。
- 版本提醒：框架版本号变化很快，上面两个版本号只代表 2026-11-03 核查到的结果。安装时请以各自官网为准：Foundation 看 GitHub Releases，UIkit 看官网 Changelog。如果官网已经出了新版，优先用新版，但要先看新版的破坏性变更说明。

## 4. 使用前提

1. 会写 HTML 文档结构（`<!DOCTYPE html>`、`<head>`、`<body>`），会用浏览器打开本地 HTML 文件。
2. 理解 CSS-05 的 Grid 概念：行、列、跨列、断点。Foundation 的 XY Grid 和 UIkit 的 Grid 都是对原生 Grid / Flex 的封装，不懂原生概念就只能照抄类名，改布局时会无从下手。
3. 理解 CSS-08 的 Sass / Less 概念：变量、编译。只用 CDN 快速体验可以不懂编译，但要做主题定制就必须会编译。
4. 本地有一个能编辑文本文件的编辑器（VS Code、记事本均可），不需要装 Node.js——除非你要走 Sass / Less 定制路线（见第 9 节第 4 步）。

## 5. 所需资源

| 资源 | 用途 | 获取方式 |
|---|---|---|
| Foundation 编译好的 CSS | 第 10 节完整示例的样式来源 | CDN 链接，见第 10 节（不需要下载） |
| UIkit 编译好的 CSS / JS | 第 10 节小片段的样式与交互来源 | CDN 或官网下载，见第 10 节说明 |
| 一个浏览器 | 打开示例、调窗口宽度看响应式变化 | 本机已有 |
| Node.js 18+ 与 Dart Sass（可选） | 只做 Sass / Less 主题定制时需要 | Node.js 官网下载，Sass 用 `npm install -g sass` |
| 本指南 CSS-05、CSS-08 | 回顾 Grid 概念与 Sass / Less 编译流程 | 见第 20 节链接 |

不需要注册账号，不需要服务器，不需要数据库。第 10 节的示例是纯静态页面，双击或用本地服务打开都能看。

## 6. 技术原理

### 6.1 框架到底替你做了什么

自己写 CSS 时，每个按钮、卡片、导航栏都要自己写颜色、内边距、圆角、悬停效果，还要自己处理手机、平板、桌面三种宽度。框架把这些重复工作做成了两样东西：

1. **一套现成的类名**：写上类名就有样式，不用自己写样式规则。例如 Foundation 的 `button` 类就是一个现成的按钮，UIkit 的 `uk-button uk-button-primary` 就是一个现成的主按钮。
2. **一套栅格系统**：把页面宽度分成 12 列（Foundation）或按比例分（UIkit），用类名控制每个区块占几列、什么宽度下换行，不用自己算百分比和写媒体查询。

框架不是魔法，它最终仍然生成普通的 CSS，只不过是你没亲手写，而是调用了别人写好的规则。出了样式问题，仍然要用浏览器开发者工具看是哪条规则在生效，和自己写 CSS 时的排查方法一样。

### 6.2 Foundation 的 XY Grid 原理

Foundation 6 的 XY Grid 有两套方向：横向（X 轴）管列宽，纵向（Y 轴）管行高，日常页面布局几乎只用 X 轴。核心是三个类名：

- `grid-container`：最外层容器，定最大宽度并居中。
- `grid-x`：一行，内部用 Flex 排列。
- `cell`：一个格子，配合 `small-12 medium-6 large-4` 这类类名控制它在不同断点占几列。

断点名字是 Foundation 约定的：`small` 是手机（默认，0 宽度起就生效），`medium` 是平板及以上（640px 起），`large` 是桌面及以上（1024px 起）。写 `small-12 medium-6 large-4` 的意思是：手机上占满 12 列，平板上占 6 列，桌面上占 4 列。Foundation 的列总数默认是 12，和 CSS-05 讲的 12 列栅格是同一个思路，只是类名不同。

`grid-margin-x` 加在 `grid-x` 旁边，表示格子之间留间距；不加它，格子之间就是紧贴的。`grid-padding-x` 则是格子内部留白。初学者最容易混淆的就是这两个：margin 是格子与格子之间的缝，padding 是格子里面的留白。

### 6.3 UIkit 的 Grid 与组件原理

UIkit 的 Grid 写法和 Foundation 不一样，它用 `uk-grid` 属性（不是类名）标记一行，用 `uk-child-width-1-3@m` 这类类名控制子元素宽度。`uk-child-width-1-3@m` 的意思是：在 `@m`（中等尺寸，640px 起）及以上，每个子元素占三分之一宽度。`@s`、`@m`、`@l`、`@xl` 是 UIkit 的断点后缀，分别对应小、中、大、超大屏幕。

UIkit 的交互组件（手风琴、弹窗、下拉菜单）也用 `uk-` 开头的属性来开启，例如 `uk-accordion`、`uk-modal`。页面加载时 UIkit 的 JavaScript 会扫描这些属性并给对应元素绑定行为，不需要你自己写 JavaScript 初始化代码。这是 UIkit 和 Foundation 在写法上最大的区别：Foundation 的交互组件大多用 `data-` 属性加 jQuery 初始化，UIkit 用 `uk-` 属性加原生 JavaScript 自动初始化。

### 6.4 为什么两个框架的定制语言不一样

Foundation 的源码是 Sass 写的，主题定制就是改 Sass 变量（`_settings.scss`），改完用 Dart Sass 编译成 CSS。UIkit 3 的源码是 Less 写的，主题定制就是改 Less 变量，改完用 Less 编译器编译。语言不同，但思路完全一样：变量集中定义，组件样式引用变量，改一个变量就能影响所有用到它的组件。不要把两个框架的变量文件混用：Sass 变量以 `$` 开头，Less 变量以 `@` 开头，编译器也各不相同。

## 7. 架构说明

### 7.1 一页里只用一个框架

本篇把两个框架放在一篇文章里讲，是为了对照学习，不是让你在一页里同时引入两个框架。两个框架都有自己的按钮、卡片、栅格类名，同时引入会互相覆盖样式，出了问题很难定位。正式项目里，一个页面只选一个框架。本篇第 10 节的完整示例只用 Foundation，UIkit 的用法单独用小片段说明，两者不在同一个完整页里混用。

### 7.2 两框架对照表

| 对照项 | Foundation 6.9.0 | UIkit 3.25.28 |
|---|---|---|
| 出身与定位 | ZURB 出品的老牌响应式框架，偏企业级、偏“大而全” | YOOtheme 出品的轻量模块化框架，偏快速做界面 |
| 栅格写法 | `grid-container` + `grid-x` + `cell` + `small-12 medium-6 large-4`，12 列 | `uk-grid` + `uk-child-width-1-3@m`，按比例分 |
| 组件数量 | 非常多：按钮、卡片、菜单、顶栏、手风琴、轮播、弹窗、表单、表格等 | 也很多：卡片、导航栏、按钮、手风琴、弹窗、下拉、幻灯片等 |
| JavaScript 依赖 | 交互组件需要 jQuery（6.x 的 JS 插件基于 jQuery） | 不依赖 jQuery，原生 JavaScript |
| 组件开启方式 | `data-` 属性 + jQuery 初始化（部分组件） | `uk-` 属性，JS 自动扫描初始化 |
| 定制语言 | Sass（Dart Sass），变量文件 `_settings.scss` | Less，变量覆盖主题文件 |
| 维护状态（截至 2026-11-03） | 更新很慢，6.9.0 是 2024 年的版本，尚无 Foundation 7 | 更新活跃，2026 年仍在频繁发布小版本 |
| 适合场景 | 已有 Foundation 存量项目、需要大量现成组件的企业站、团队熟悉 Sass | 新项目快速搭界面、管理后台、产品介绍页、想少引依赖的项目 |
| 不适合场景 | 追求最新生态、想摆脱 jQuery、团队没人维护老框架 | 需要 Foundation 特有组件（如 XY Grid 的 Y 轴布局）、团队只熟悉 Sass |

### 7.3 选型建议

- 新项目、从零开始、团队没有历史包袱：优先看 UIkit，它的更新更活跃，又不依赖 jQuery。
- 维护老项目、项目里已经用了 Foundation：继续用 Foundation，不要为了追新而重写，6.9.0 仍然能正常工作。
- 设计稿定制程度非常高、几乎每个组件都要重画：两个框架都不太合适，框架的现成样式反而会成为负担，这时更适合 Tailwind（见本系列 CSS-10）或自己写 CSS（见 CSS-14）。
- 选型一旦定了就不要中途换框架，换框架等于把所有类名重写一遍，成本比一开始多花一天选型高得多。

## 8. 操作前检查

动手之前，先确认下面 5 项，缺一项都不要往下做：

1. 浏览器能正常打开本地 HTML 文件（随便写一个带 `你好` 的 HTML 文件双击能打开即可）。
2. 网络能访问 CDN（第 10 节的示例依赖 CDN 加载 Foundation 的 CSS；如果你的网络打不开 jsDelivr，请先下载 CSS 文件到本地再引用，见第 16 节）。
3. 知道自己要做的是“体验”还是“定制”：只体验，跳过第 9 节第 4 步；要定制主色，必须先装 Node.js 18+ 和 Dart Sass（Foundation）或 Less 编译器（UIkit）。
4. 确认页面里没有同时引入两个框架的 CSS（对照第 7.1 节）。
5. 确认你分得清 `grid-margin-x`（格子之间的缝）和 `grid-padding-x`（格子里面的留白），分不清请先回看第 6.2 节。

## 9. 逐步操作

### 第 1 步：建一个空页面

新建文件夹 `foundation-uikit-demo/`，在里面新建 `index.html`，先只写文档骨架（`<!DOCTYPE html>`、`<head>`、`<body>`），不要急着加组件。骨架能用浏览器打开、标题正确，再往下做。

### 第 2 步：引入 Foundation 的 CSS

在 `<head>` 里加一行 Foundation 6.9.0 的 CSS 链接（完整链接见第 10 节）。只引 CSS、不引 JS，这样按钮、卡片、栅格这些纯样式组件就能用，又避开了 jQuery 的问题。需要手风琴、弹窗这类交互组件时，再按第 12 节的说明补 jQuery 和 Foundation 的 JS。

### 第 3 步：用 XY Grid 搭出三列布局

在 `<body>` 里按 `grid-container` → `grid-x grid-margin-x` → 三个 `cell small-12 medium-6 large-4` 的结构写三张卡片。先不写卡片内容，只放“卡片一、卡片二、卡片三”三个字，用浏览器打开，把窗口从宽拖到窄，确认三列在桌面上并排、手机上变成一列竖排。布局对了，再往卡片里填内容。

### 第 4 步（可选）：改主色——Foundation 走 Sass，UIkit 走 Less

- Foundation：把 `_settings.scss` 复制到自己的项目里（见第 11 节），改 `$primary-color` 的值，用 Dart Sass 重新编译，生成的 CSS 替换掉原来引用的 CSS 文件。
- UIkit：新建自己的 Less 主题文件，覆盖 `@global-primary-background` 这类变量，用 Less 编译器编译，生成的 CSS 替换掉原来引用的 CSS 文件。
- 改完变量必须重新编译，只改变量文件、页面引用的还是旧 CSS，页面是不会变色的，这是新手最常见的“改了没效果”的原因。

### 第 5 步：对照着写一个 UIkit 版本

另新建一个页面，只引 UIkit 的 CSS 和 JS，用 `uk-grid` + `uk-child-width-1-3@m` + `uk-card` 写出同样的三张卡片。两个页面都跑通后，对照着看类名差异，而不是把两个框架的代码贴进同一个页面。

## 10. 完整代码

下面是 Foundation 版本的完整示例页，复制下来保存为 `index.html` 就能打开。它只用 Foundation 的 CSS，不依赖 jQuery，按钮、卡片、栅格、提示框都是纯样式组件。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Foundation XY Grid 与组件示例</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/foundation-sites@6.9.0/dist/css/foundation.min.css">
<style>
.demo-wrap { padding: 2rem 0; }
.demo-card { height: 100%; }
.demo-card h3 { font-size: 1.25rem; }
</style>
</head>
<body>
<div class="grid-container demo-wrap">
  <h1>我们的服务</h1>
  <p>下面是三张卡片：桌面上三列并排，平板上两列，手机上一列竖排。</p>
  <div class="callout primary">
    <p>提示：这个提示框是 Foundation 的 Callout 组件，不需要 JavaScript 就能显示。</p>
  </div>
  <div class="grid-x grid-margin-x">
    <div class="cell small-12 medium-6 large-4">
      <div class="card demo-card">
        <div class="card-section">
          <h3>网站建设</h3>
          <p>从域名购买到上线维护，一套流程走完。</p>
          <a class="button" href="#">了解详情</a>
          <a class="button hollow" href="#">看看案例</a>
        </div>
      </div>
    </div>
    <div class="cell small-12 medium-6 large-4">
      <div class="card demo-card">
        <div class="card-section">
          <h3>服务器运维</h3>
          <p>备份、监控、日志，出问题能快速定位。</p>
          <a class="button" href="#">了解详情</a>
          <a class="button clear" href="#">看看案例</a>
        </div>
      </div>
    </div>
    <div class="cell small-12 medium-6 large-4">
      <div class="card demo-card">
        <div class="card-section">
          <h3>性能优化</h3>
          <p>缓存、压缩、图片优化，首屏更快打开。</p>
          <a class="button" href="#">了解详情</a>
          <a class="button secondary" href="#">看看案例</a>
        </div>
      </div>
    </div>
  </div>
  <ul class="menu">
    <li><a href="#">首页</a></li>
    <li><a href="#">服务</a></li>
    <li><a href="#">关于</a></li>
    <li><a href="#">联系</a></li>
  </ul>
</div>
</body>
</html>
```

UIkit 版本不用整页重写，同一组三张卡片用 UIkit 的写法是下面这个片段。把它放进一个已经引入 UIkit CSS 和 JS 的页面里才能用，不要把它和上面的 Foundation 整页拼在一起。

```html
<div class="uk-container uk-margin-large-top">
  <h1>我们的服务</h1>
  <div class="uk-child-width-1-3@m uk-grid-small" uk-grid>
    <div>
      <div class="uk-card uk-card-default uk-card-body">
        <h3 class="uk-card-title">网站建设</h3>
        <p>从域名购买到上线维护，一套流程走完。</p>
        <a class="uk-button uk-button-primary" href="#">了解详情</a>
      </div>
    </div>
    <div>
      <div class="uk-card uk-card-default uk-card-body">
        <h3 class="uk-card-title">服务器运维</h3>
        <p>备份、监控、日志，出问题能快速定位。</p>
        <a class="uk-button uk-button-primary" href="#">了解详情</a>
      </div>
    </div>
    <div>
      <div class="uk-card uk-card-default uk-card-body">
        <h3 class="uk-card-title">性能优化</h3>
        <p>缓存、压缩、图片优化，首屏更快打开。</p>
        <a class="uk-button uk-button-primary" href="#">了解详情</a>
      </div>
    </div>
  </div>
</div>
```

UIkit 完整页需要在 `<head>` 里引入 UIkit 的 CSS，在 `</body>` 前引入 UIkit 的 JS 和图标 JS（官网下载页和 CDN 都有对应链接，安装时以官网当前版本为准，版本号用 3.25.28）。手风琴的写法是：外层容器加 `uk-accordion` 属性，里面每组标题用 `uk-accordion-title` 类、内容用 `uk-accordion-content` 类，JS 会自动处理展开收起，不需要你自己写点击逻辑。

## 11. 完整配置文件

框架篇没有服务器配置文件，这里的“配置文件”是指主题定制文件，存放路径如下：

- Foundation Sass 定制文件：`scss/_settings.scss`（放在你自己的项目根目录下的 `scss/` 文件夹里，不要直接改框架源码包里的同名文件，否则升级框架时会丢修改）。
- UIkit Less 定制文件：`less/custom-theme.less`（放在你自己的项目根目录下的 `less/` 文件夹里，编译时先引入 UIkit 的 Less 源码，再引入这个文件覆盖变量）。

Foundation 的 `_settings.scss` 不需要全文照抄，实际项目里通常只保留自己要改的变量，文件内容示例：

```scss
// scss/_settings.scss：只放自己要改的变量，其余变量用框架默认值
$primary-color: #1779ba;
$secondary-color: #767676;
$global-radius: 4px;

// 引入框架主文件（路径按你自己的项目结构调整）
@import "foundation";
```

UIkit 的 `custom-theme.less` 示例：

```less
// less/custom-theme.less：覆盖 UIkit 的全局变量
@global-primary-background: #1e87f0;
@global-link-color: #1e87f0;

// 再引入 UIkit 的 Less 入口（路径按你自己的项目结构调整）
@import "uikit/src/less/uikit.less";
```

编译命令（在项目根目录执行，输出文件替换页面原来引用的 CSS）：

```bash
# Foundation：Dart Sass 编译
sass scss/_settings.scss css/foundation-custom.css

# UIkit：Less 编译（需先安装 lessc）
lessc less/custom-theme.less css/uikit-custom.css
```

## 12. 每个关键配置项的解释

### Foundation XY Grid 相关

| 类名 / 变量 | 解释 |
|---|---|
| `grid-container` | 最外层容器，定最大宽度并水平居中，没有它，栅格会贴到浏览器边缘 |
| `grid-x` | 一行，内部用 Flex 横向排列格子 |
| `cell` | 一个格子，必须放在 `grid-x` 里面 |
| `small-12` | 手机宽度下占 12 列，即占满整行 |
| `medium-6` | 平板宽度（640px）起占 6 列，即半行，两个格子并排 |
| `large-4` | 桌面宽度（1024px）起占 4 列，即三分之一行，三个格子并排 |
| `grid-margin-x` | 写在 `grid-x` 旁边，格子之间留间距；不写就是紧贴 |
| `grid-padding-x` | 格子内部留白，和 `grid-margin-x` 不是一回事 |
| `$primary-color` | Sass 变量，主色，按钮、链接等主元素都用它，改它等于换主题色 |
| `$global-radius` | Sass 变量，全局圆角，改它会影响按钮、卡片等圆角 |

### Foundation 组件相关

| 类名 | 解释 |
|---|---|
| `button` | 实心主按钮；再加 `hollow` 变描边按钮，加 `clear` 变无边框文字按钮，加 `secondary` 变灰色按钮 |
| `callout` | 提示框容器；再加 `primary`、`success`、`warning`、`alert` 换颜色 |
| `card` + `card-section` | 卡片容器与卡片内容区，卡片内容必须放在 `card-section` 里 |
| `menu` | 横向菜单列表，`li` 里面放链接 |

### UIkit 相关

| 类名 / 属性 | 解释 |
|---|---|
| `uk-grid`（属性） | 标记一行是 UIkit 栅格，必须写在容器元素上，JS 和 CSS 都靠它识别 |
| `uk-child-width-1-3@m` | 子元素在中等尺寸及以上各占三分之一；`@m` 是断点后缀，去掉它就是所有尺寸都三分之一 |
| `uk-grid-small` | 格子之间的间距改小一档，还有 `uk-grid-medium`、`uk-grid-large` 可选 |
| `uk-container` | 最外层容器，定最大宽度并居中，和 Foundation 的 `grid-container` 对应 |
| `uk-card` + `uk-card-default` + `uk-card-body` | 卡片容器、默认样式、卡片内边距，三者缺一不可 |
| `uk-card-title` | 卡片标题样式 |
| `uk-button` + `uk-button-primary` | 按钮基础样式 + 主按钮颜色，缺了 `uk-button`，颜色类单独不起作用 |
| `uk-accordion`（属性） | 标记一个手风琴容器，JS 自动绑定展开收起 |
| `@global-primary-background` | Less 变量，UIkit 的主色，改它会影响主按钮、链接等 |

### 交互组件的 JavaScript 说明

Foundation 的手风琴、弹窗、轮播、下拉菜单是 JavaScript 插件，6.x 需要先引入 jQuery，再引入 Foundation 的 JS，最后调用初始化。UIkit 的同类组件不需要 jQuery，引入 UIkit 的 JS 后，带 `uk-` 属性的元素会自动初始化。第 10 节的完整示例刻意避开了交互组件，就是为了让示例在不引 jQuery 的情况下也能完整运行。需要交互组件时，请按各自官网当前版本的引入顺序写，不要凭记忆拼顺序，顺序错了组件会静默失效、不报错。

## 13. 执行结果示例

把第 10 节的 Foundation 示例保存为 `index.html` 并用浏览器打开，你应该看到：

- 页面顶部是标题“我们的服务”和一行说明文字；
- 说明文字下方是一个浅蓝色提示框，写着 Callout 组件的提示；
- 提示框下方是三张卡片，宽窗口下三张并排，每张卡片里有标题、一段话、一个实心按钮和一个描边 / 文字 / 灰色按钮；
- 卡片下方是一行横向菜单：首页、服务、关于、联系；
- 把浏览器窗口从宽拖到窄：窗口窄到平板宽度时，第三张卡片会掉到第二行；再窄到手机宽度时，三张卡片变成一列竖排，每张占满整行；
- 按钮悬停时颜色会变深，这是框架自带的悬停样式，不需要你自己写。

如果打开后页面完全没有样式、文字贴在左上角挤成一团，说明 Foundation 的 CSS 没有加载成功，先按第 16 节排查 CDN，而不是改自己的 HTML。

## 14. 成功验证

按顺序做下面 6 步，全部通过才算成功：

1. 浏览器打开 `index.html`，标题、提示框、三张卡片、菜单都显示出来，页面不是无样式的裸文字。
2. 把窗口拖到桌面宽度（大于 1024px），三张卡片并排成一行。
3. 把窗口拖到手机宽度（小于 640px），三张卡片变成一列竖排。
4. 打开浏览器开发者工具，点中一张卡片，确认它的 class 里有 `cell small-12 medium-6 large-4`，并且生效的宽度规则来自 Foundation 的 CSS 文件，不是你自己的 `<style>`。
5. UIkit 片段单独验证：新建一个只引 UIkit 的页面，贴入第 10 节的 UIkit 片段，确认三张卡片同样能并排显示，按钮是 UIkit 的主按钮样式。
6. 定制验证（只做定制时需要）：改完 `$primary-color` 或 `@global-primary-background` 并重新编译后，刷新页面，按钮颜色确实变了；如果没变，先确认页面引用的是新编译的 CSS 文件，而不是旧的 CDN 链接。

## 15. 常见错误

| 错误现象 | 原因 | 改正方法 |
|---|---|---|
| 页面完全没有样式 | CDN 链接打不开，或链接写错版本号 | 先在浏览器里直接打开 CSS 链接看能不能返回内容；打不开就下载 CSS 到本地引用 |
| 格子没有间距，卡片贴在一起 | `grid-x` 旁边漏了 `grid-margin-x` | 在 `grid-x` 后面补上 `grid-margin-x` |
| 格子换行位置不对 | 断点类名写错，例如把 `medium-6` 写成 `medium-4` | 按 12 列重新算：两个并排用 6，三个并排用 4，四个并排用 3 |
| 按钮只有颜色没有按钮形状 | UIkit 只写了 `uk-button-primary`，漏了 `uk-button` | 两个类名都要写，基础类在前、颜色类在后 |
| UIkit 栅格不起作用 | 容器上漏了 `uk-grid` 属性 | 在栅格容器上补 `uk-grid`，光写 `uk-child-width-*` 是不够的 |
| 手风琴点了没反应 | Foundation 漏引 jQuery 或漏了初始化；UIkit 漏引 JS | 按第 12 节的引入顺序补齐，先确认 JS 文件真的加载了 |
| 改了主色页面没变 | 只改了变量文件，没重新编译，或页面引的还是旧 CSS | 重新编译，并确认页面引用的是新生成的 CSS 文件 |
| 两个框架的样式互相打架 | 同一页同时引入了 Foundation 和 UIkit 的 CSS | 一页只留一个框架，另一个框架的页面另起文件写 |

反面例子只用一句话说清楚，不要照抄：例如把 `grid-margin-x` 写成 `grid-padding-x` 会导致格子之间的缝变成格子里面的留白；把 UIkit 的 `uk-button-primary` 单独拿出来用、前面不加 `uk-button`，按钮会只有颜色没有形状。

## 16. 故障排查

1. **先看 CSS 到底加载没有**：在浏览器里直接打开第 10 节里的 CSS 链接，能看到一堆 CSS 代码就是加载成功，看到 404 或打不开就是 CDN 或网络问题。CDN 打不开时，把 CSS 文件下载到本地，用相对路径引用，页面效果完全一样。
2. **再看类名拼写**：框架类名拼错一个字母就完全失效，而且不报错。用开发者工具点中元素，看它的 class 列表，再对照第 12 节的表格一个一个对。
3. **交互组件不动时，先看控制台**：按 F12 打开控制台，有红色报错就按报错信息查缺了哪个 JS 文件；没有任何报错但组件不动，多半是引入顺序错了，或者初始化代码漏了。
4. **布局在某个宽度突然乱掉**：先确认是不是断点问题。把窗口慢慢拖宽，看乱掉的临界宽度是 640px 还是 1024px，再去查这个断点下哪个类名在生效，不要一上来就改全部样式。
5. **定制编译报错**：Foundation 编译报错先看 Node.js 版本是不是 18 以上、是不是用了 Dart Sass 而不是 LibSass；UIkit 编译报错先看 Less 编译器装好没有、引入路径对不对。编译器的报错信息通常会直接指出哪一行变量找不到。
6. **升级框架后页面变样**：先看新版的破坏性变更说明，再逐个对照类名。不要同时升级框架版本和改页面结构，两个变化叠在一起就分不清是谁的问题。

## 17. 安全注意事项

1. **CDN 链接要核对来源**：只用官网或 jsDelivr 这类正规 CDN 上的框架文件，不要引用来路不明的第三方 CDN 链接。别人控制的 CDN 文件里如果被加了恶意脚本，你的页面就会跟着中招。
2. **生产环境优先用本地文件**：CDN 方便体验，但生产站点建议把 CSS / JS 下载到自己服务器上引用，避免 CDN 故障导致全站无样式，也避免 CDN 被劫持的风险。
3. **不要把密钥、密码写进示例页**：框架示例页是静态文件，任何人打开源码都能看到。需要调接口的地方，密钥放服务器端，不要出现在 HTML 里。
4. **弹窗、手风琴里不要直接插用户输入的 HTML**：用户提交的内容要先转义再显示，否则就是跨站脚本（XSS）漏洞。框架本身不会替你过滤用户输入。
5. **升级框架要先看安全公告**：老版本框架可能有已知漏洞，长期不升级等于留着已知漏洞。升级前先在测试页验证，再推到正式站。

## 18. 回滚和恢复

- **只改了页面，还没上线**：直接删掉引入框架 CSS 的那一行链接，页面就回到无框架状态；或者把 `index.html` 改回上一个能用的版本。
- **已经上线、发现样式全乱**：先把页面引用的 CSS 换回上一个版本的链接或本地备份文件，不要在正式站上边改边试。改类名导致的乱布局，逐个恢复类名比整页重写更快。
- **主题定制改坏了**：重新编译一次改动前的变量文件，生成旧的 CSS 覆盖回去。所以 `_settings.scss` 和 `custom-theme.less` 每次改动前都要先备份一份，备份方法就是复制一份加 `.bak` 后缀放在同一个文件夹里。
- **升级框架后出问题**：把 `package.json` 里的版本号或 CDN 链接里的版本号改回升级前的版本，重新部署，页面即恢复。升级前同样要备份旧版本号的链接和旧的编译产物。

## 19. 延伸阅读

- Foundation 官方文档（get.foundation 官网的 Sites 文档）：XY Grid、全部组件、Sass 变量表的权威来源，遇到类名记不清时先查这里。
- Foundation 官方 GitHub 仓库 Releases 页：版本号、发布日期、破坏性变更的权威来源，升级前必看。
- UIkit 官方文档（getuikit.com）：全部组件、Grid、JavaScript 用法的权威来源，`uk-` 属性的完整列表都在这里。
- UIkit 官网 Changelog 页：版本号与发布日期的权威来源。
- 本指南 CSS-05 Grid：原生 Grid 概念，理解框架栅格的前提。
- 本指南 CSS-08 CSS 工程化：Sass / Less 编译、文件组织，主题定制的前提。
- 本指南 CSS-04 Flexbox：Foundation XY Grid 内部用 Flex 排列，理解 Flex 有助于排查栅格问题。

## 20. 相关章节链接

- [网站建设与部署实战指南总计划](../MASTER_PLAN.md)
- [任务索引](../TASK_INDEX.md)
- [路线图](../ROADMAP.md)
- [CSS-01 基础语法与选择器](../css/01-basics.md)
- [CSS-02 单位与颜色](../css/02-units-colors.md)
- [CSS-03 盒模型与定位](../css/03-box-position.md)
- [CSS-05 Grid 完整教程](../css/05-grid.md)
- [CSS-08 CSS 工程化](../css/08-engineering.md)
- [HTML-01 基础与语义化标签](../html/01-basics.md)
- [HTML-02 表单、表格、媒体](../html/02-forms-tables-media.md)
- 下一篇：[CSS-13 Pico CSS、Materialize](./05-pico-materialize.md)
