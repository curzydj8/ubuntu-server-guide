# CSS-13：Pico CSS、Materialize 完整教程

> 任务编号：CSS-13（网站建设与部署实战指南 · CSS 框架第 5 篇）
> 上一篇：CSS 工程化在 CSS-08 讲，本篇不重讲；Bootstrap、Tailwind、Bulma、Foundation、UIkit 各自独立成章，不在本篇展开。
> 本篇一次讲两个框架：Pico CSS 的无类名写法，和 Materialize 的 Material Design 组件。两个框架的维护状态差别很大，动手前先看第 3 节，不要只看“用法简单”就直接用在新项目上。

## 1. 本章目标

读完本章，你能做到以下四件事：

1. 用 Pico CSS 给一段语义化 HTML 直接套上样式，不写布局类名，做出一个能看的文档页、表单页。
2. 用 Materialize 写出按钮、卡片、导航栏、模态框这类 Material Design 组件，并正确初始化它的 JavaScript 组件。
3. 说清楚两个框架各自适合什么场景、不适合什么场景，以及为什么 Pico 不适合作为新项目的长期依赖。
4. 把 Pico 的主题变量改成自己想要的颜色和圆角，并把改动收进一个单独的主题文件，而不是直接改框架原文件。

## 2. 适用人群

- 已经读过 CSS-01 到 CSS-03，会写语义化 HTML、知道选择器和盒模型，想快速给页面套样式的人。
- 想给内部工具页、文档页、演示页快速出样式，不想先搭一套构建流程的人。
- 正在维护一个用了 Materialize 的老项目，需要看懂它的类名和初始化写法的人。
- 不适合只想学某一个框架全部组件的人：本篇讲的是两个框架的代表性用法和选型判断，不是把两份官方文档全文抄一遍，组件全表请看第 19 节的官方文档链接。

## 3. 适用系统和版本

本节的版本号和维护状态是 2026-11-03 用公开搜索核查的结果，写文章时不要凭印象改动它们，选用前请再到官网核对一次。

### 3.1 Pico CSS：最终版 v2.1.1，仓库已归档，不再维护

- 最新也是最终版本：**v2.1.1**。
- 维护状态：**已停止维护**。维护者于 2026-10-04 归档了 Pico CSS 的仓库，并宣布 v2.1.1 为最终版本。归档后不再接受新的 Issue、Pull Request，也不再发布新版本。
- 已有网站不会因此立刻坏掉：npm 包、jsDelivr CDN 和 picocss.com 网站仍在线，官方说明是长期保留。所以老项目可以继续跑，但浏览器变化、新需求、安全问题出现时，不会再有官方修复。
- 注意一个容易混淆的点：2026 年 7 月的一些介绍文章还写 Pico“在积极维护”，那是归档之前的说法，已被 2026-10-04 的归档决定取代，以归档决定为准。
- 结论：**新项目不要把 Pico 当作长期依赖**。本篇教它的写法，是因为它的无类名思路值得学、老项目还在用，以及临时演示页用它确实快；长期项目请选仍在维护的框架（见第 17 节）。

### 3.2 Materialize：原版停在 1.0.0，社区分支在继续维护

Materialize 有两个“版本线”，不要混在一起：

| 版本线 | 版本 | 状态 |
| --- | --- | --- |
| 原版 `materialize-css`（Dogfalo/materialize） | 1.0.0，2018 年 9 月发布 | 原仓库自 2020 年起无提交，实际已停滞；不要把它当作“最新版” |
| 社区分支 `@materializecss/materialize`（materializecss/materialize） | 2025 年有 2.2.2 的说法，jsDelivr 列表里出现过 2.3.3，2026 年 9 月的一份对照表写 2.4.0 | 社区在维护，但不同来源给出的最新号不完全一致 |

正因为分支的最新号在不同来源里对不上，本篇**不把某一个分支号写死成“当前最新”**。安装分支时，务必以该分支仓库的 Releases 页或 npm 页当场查到的号为准。另外注意：分支 2.x 改了部分 JavaScript API，从原版 1.0.0 升级前要先看分支的迁移说明，不能只换链接就上线。

### 3.3 系统和浏览器要求

- 操作系统：Windows、macOS、Linux 都可以，本篇只用到浏览器和文本编辑器，不依赖某个系统。
- 浏览器：Pico v2 只面向最新稳定版 Chrome、Firefox、Edge、Safari，不支持任何 IE；Materialize 1.0.0 的文档面向现代浏览器，老 IE 行为不要指望。
- Node.js：本篇的 CDN 用法不需要 Node；只有当你想用 Sass 改 Materialize 变量、或用 npm 装分支版时，才需要 Node 和 Sass（见第 5 节）。

## 4. 使用前提

1. 会写第 1 节那种语义化 HTML：`header`、`nav`、`main`、`article`、`section`、`form`、`table` 都会用，知道 `label` 要配 `for` 和 `id`。
2. 知道 CSS 选择器、盒模型、颜色和单位的基本概念（CSS-01、CSS-02、CSS-03 的内容），否则看到 Pico 的变量覆盖会不知道改的是什么。
3. 有一台能上网的电脑：本篇示例走 CDN，先保证能打开 jsDelivr 或 cdnjs；离线环境请先把 CSS 文件下载到本地（见第 9 节第 4 步）。
4. Materialize 的交互组件需要 JavaScript：只引 CSS 不引 JS，按钮和卡片能看，但模态框、下拉框、侧边导航这类组件点开不会动，这是正常的，不是样式坏了。

## 5. 所需资源

| 资源 | 用途 | 备注 |
| --- | --- | --- |
| 文本编辑器 | 写 HTML 和主题文件 | 记事本、VS Code 都可以 |
| 现代浏览器 | 打开示例页 | Chrome、Firefox、Edge、Safari 最新稳定版 |
| Pico CSS v2.1.1 的 CDN 链接 | 第 10 节示例的样式来源 | 固定版本号，不要用不带版本号的浮动链接 |
| Materialize 1.0.0 的 cdnjs 链接 | 第 10 节末尾小片段的样式和脚本来源 | 原版链接，换分支时要换对应地址 |
| 一个本地文件夹 | 放示例页和主题文件 | 本篇用 `pico-demo/` 做例子，路径见第 11 节 |

不需要数据库、不需要后端、不需要构建工具。Pico 的主题覆盖只用纯 CSS 变量，不用 Sass 编译；Materialize 想改 Sass 变量才需要 Sass，那是进阶做法，本篇只在第 12 节提一句，不展开。

## 6. 技术原理

### 6.1 Pico CSS：样式直接长在语义标签上

普通框架的思路是“写类名，类名带样式”：按钮要写 `class="btn"`，卡片要写 `class="card"`。Pico 反过来：**样式选择器直接写在 `h1`、`p`、`button`、`input`、`table` 这些语义标签上**。你写一段本来就语义正确的 HTML，不加任何类名，页面就已经有排版、间距、表单样式和表格样式。

这带来两个直接后果：

- 好处：HTML 干净，写文档页、说明页、表单页特别快；换主题主要靠改 CSS 变量，不用满页改类名。
- 代价：控制粒度粗。想要“这个按钮红、那个按钮蓝”，光靠标签选择器不够，必须加少量类名或自己写覆盖样式；想要完全自定义的设计系统，Pico 的默认样式反而会成为要覆盖的包袱。

Pico 还有一套类名版（文件名是 `pico.min.css`）和无类名版（文件名是 `pico.classless.min.css`）。类名版多给了 `container`、`grid` 这类布局类名；无类名版连这些都不用，纯语义标签。本篇第 10 节用类名版的 CDN 链接，并只用一个 `container` 类名做居中容器，其余全部靠语义标签，这样两种版本的差别你一眼就能看出来。

### 6.2 Pico 的主题：CSS 变量 + `data-theme`

Pico 把颜色、字体、圆角、间距都写成 CSS 变量，例如 `--pico-primary`（主色）、`--pico-font-family`（字体）、`--pico-border-radius`（圆角）。改主题就是在自己的样式文件里重新给这些变量赋值，框架其余规则不动。

亮暗模式靠 `data-theme` 属性：`data-theme="light"` 强制浅色，`data-theme="dark"` 强制深色，不写则跟随系统偏好。这比“写两套类名、靠 JavaScript 切换”简单得多，也是 Pico 最值得学的一点。

### 6.3 Materialize：Material Design 的组件库

Materialize 实现的是 Google 的 Material Design：纸片、阴影、涟漪点击效果、浮动按钮、卡片、导航栏、模态框、日期选择器都按这套设计语言做。它的思路和 Pico 相反，是**类名驱动**：写 `class="btn waves-effect waves-light"` 才是一个 Material 按钮，写 `class="card"` 才是一张卡片。

布局用 12 列网格：`row` 里放 `col s12 m6 l4`，意思是手机占 12 列、平板占 6 列、桌面占 4 列。交互组件分两步：先写 HTML 结构，再用 JavaScript 初始化，例如 `M.Modal.init(...)`；不初始化，模态框不会弹出来。1.0.0 的文档里还有 `M.AutoInit()`，可以一次性初始化页面上所有组件，演示页用它最省事，正式项目建议按组件逐个初始化，出了问题好定位。

### 6.4 两个框架的对照

| 维度 | Pico CSS | Materialize |
| --- | --- | --- |
| 写样式靠什么 | 语义标签本身 | 类名 |
| 上手速度 | 最快，链接一个文件就能看 | 要记类名和初始化写法 |
| 自定义程度 | 改变量容易，大改设计难 | 类名组合多，Sass 变量可调 |
| JavaScript | 不需要 | 交互组件需要 |
| 适合页面 | 文档页、表单页、演示页 | 需要成套组件的管理后台、工具页 |
| 维护状态（2026-11-03 核查） | 已归档，最终版 v2.1.1 | 原版停滞，社区分支在维护 |

## 7. 架构说明

本篇的示例项目只有一个页面加一个主题文件，没有后端，没有构建步骤：

```text
pico-demo/
  index.html        ← 第 10 节的完整示例页，Pico CDN 链接写在这里
  css/
    theme.css       ← 第 11 节的主题文件，覆盖 Pico 变量，不动框架原文件
```

页面加载顺序是：浏览器先读 Pico 的 CDN 样式，再读本地 `css/theme.css`。因为后读的规则在层叠里胜出，主题文件里的变量赋值会覆盖框架默认值，而框架的其余规则保持不变。这就是“不要改框架原文件”的落地方式：框架升级（如果还有升级）时只换 CDN 链接，自己的改动都在 `theme.css` 里，不会丢。

Materialize 的小片段不单独成页：它只是说明“同一个需求换 Materialize 要怎么写”，你把它单独存成一个文件、按第 10 节末尾的链接引入 CSS 和 JS，就能打开看。两个框架不要混在同一个页面里引：它们的按钮、表单、表格默认值会互相打架，排障会很痛苦。

## 8. 操作前检查

动手前逐项打勾，缺一项先补齐再往下做：

1. 浏览器是最新稳定版，不是 IE，也不是多年没更新的旧版。
2. 能打开 jsDelivr 和 cdnjs（先在浏览器里直接打开第 10 节的两个 CDN 地址，看到 CSS 文本才算通）。
3. 已经读过第 3 节，知道 Pico 已归档、Materialize 原版已停滞，选型结论心里有数。
4. 本地建好了 `pico-demo/` 和 `pico-demo/css/` 两个目录，示例页和主题文件的路径和第 11 节一致。
5. 如果公司或学校网络屏蔽 CDN，先把 Pico 的 CSS 文件下载到本地 `css/` 目录，改成本地路径再继续，不要在“样式没加载”的状态下调主题。

## 9. 逐步操作

### 第 1 步：建目录

在你放练习文件的地方建 `pico-demo/`，里面再建 `css/` 子目录。

### 第 2 步：写示例页

把第 10 节的完整示例原样存为 `pico-demo/index.html`。注意三点：`lang="zh-CN"` 不要丢；`meta name="viewport"` 不要丢，否则手机上排版会缩成一团；Pico 的 CDN 链接必须带固定版本号 `@2.1.1`，不要写成不带版本号的浮动地址。

### 第 3 步：写主题文件

把第 11 节的 `theme.css` 原样存为 `pico-demo/css/theme.css`，并确认 `index.html` 里在 Pico 链接之后引用了它。改颜色只改这个文件里的变量值，不要去改 CDN 文件（你也改不了，那是远程文件）。

### 第 4 步：离线备用（可选，但建议做一次）

把 Pico 的 CSS 文件下载到本地，存为 `pico-demo/css/pico.min.css`，把 `index.html` 里的 CDN 链接临时换成本地路径再打开一次，确认页面长得一样。这一步是为第 14 节的验证和以后离线演示准备的，做完记得把链接换回 CDN 版，或者保留本地版并在文件头注明来源和版本号。

### 第 5 步：看 Materialize 的写法

把第 10 节末尾的 Materialize 小片段单独存成一个文件，按片段里的 cdnjs 链接引入 CSS 和 JS，用浏览器打开，点一下模态框按钮，确认弹框能打开、能关闭。关不上的常见原因在第 15 节。

### 第 6 步：做亮暗切换实验

把 `index.html` 里 `html` 标签的 `data-theme` 分别改成 `light`、`dark`、删掉三种情况，各刷新一次，看页面是不是跟着变。这一步是理解 Pico 主题机制最快的方法。

## 10. 完整代码

下面是完整示例页，**没有省略号**，原样存为 `pico-demo/index.html` 就能打开。页面结构是：页眉导航、主内容（一段介绍、一个反馈表单、一张表格、一个折叠说明）、页脚。除了居中容器用了一个 `container` 类名，其余样式全部来自语义标签。

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pico CSS 示例：反馈表单页</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css">
<link rel="stylesheet" href="css/theme.css">
<style>
.demo-note {
  border-left: 4px solid var(--pico-primary);
  padding: 0.75rem 1rem;
  background: var(--pico-card-background-color);
}
.demo-note p {
  margin-bottom: 0;
}
</style>
</head>
<body>
<header class="container">
<nav>
<ul>
<li><strong>演示站点</strong></li>
</ul>
<ul>
<li><a href="#">首页</a></li>
<li><a href="#">文档</a></li>
<li><a href="#">反馈</a></li>
</ul>
</nav>
</header>
<main class="container">
<h1>给我们提反馈</h1>
<p>这是一个 Pico CSS 示例页：标题、段落、表单、表格都没有写布局类名，样式来自语义标签本身。</p>
<section class="demo-note">
<p>提示：把 html 标签的 data-theme 改成 dark 再刷新，页面会切换成深色；删掉 data-theme，则跟随系统偏好。</p>
</section>
<h2>反馈表单</h2>
<form action="#" method="post">
<label for="nickname">昵称</label>
<input type="text" id="nickname" name="nickname" placeholder="请填写昵称" required>
<label for="contact">联系方式</label>
<input type="email" id="contact" name="contact" placeholder="邮箱地址（选填）">
<label for="kind">反馈类型</label>
<select id="kind" name="kind">
<option value="bug">发现问题</option>
<option value="idea">功能建议</option>
<option value="other">其他</option>
</select>
<label for="content">详细内容</label>
<textarea id="content" name="content" rows="5" placeholder="请描述问题或建议" required></textarea>
<label for="agree">
<input type="checkbox" id="agree" name="agree" required>
我已阅读并同意公开这条反馈
</label>
<button type="submit">提交反馈</button>
<button type="reset">清空重填</button>
</form>
<h2>已收到的反馈</h2>
<table>
<thead>
<tr>
<th>编号</th>
<th>类型</th>
<th>状态</th>
</tr>
</thead>
<tbody>
<tr>
<td>001</td>
<td>发现问题</td>
<td>已处理</td>
</tr>
<tr>
<td>002</td>
<td>功能建议</td>
<td>处理中</td>
</tr>
</tbody>
<tfoot>
<tr>
<td colspan="3">表格来自语义化 table 标签，没有写任何布局类名。</td>
</tr>
</tfoot>
</table>
<h2>常见问题</h2>
<details>
<summary>提交后会发生什么？</summary>
<p>这只是前端演示页，表单的 action 写的是占位地址，不会真的把数据发到服务器。接后端的做法在后端框架篇讲。</p>
</details>
<details>
<summary>为什么按钮不需要写类名？</summary>
<p>因为 Pico 直接给 button 标签写了样式。想让某个按钮换个颜色，要么加类名，要么在主题文件里改变量，见第 11 节。</p>
</details>
</main>
<footer class="container">
<p>演示页，仅用于学习 Pico CSS 的无类名写法。</p>
</footer>
</body>
</html>
```

Materialize 的用法用下面这个小片段说明，同样没有省略号，单独存成一个文件就能打开。注意两点：CSS 和 JS 都要引，缺一个都不行；脚本里的 `M.AutoInit()` 负责把页面上的模态框初始化好。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Materialize 示例：卡片与模态框</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css">
</head>
<body>
<div class="container">
<div class="row">
<div class="col s12 m6">
<div class="card">
<div class="card-content">
<span class="card-title">一张 Material 卡片</span>
<p>卡片、按钮、模态框都是靠类名组合出来的，类名写错一个，样式就对不上。</p>
</div>
<div class="card-action">
<a class="waves-effect waves-light btn modal-trigger" href="#demo-modal">打开模态框</a>
</div>
</div>
</div>
</div>
<div id="demo-modal" class="modal">
<div class="modal-content">
<h4>模态框标题</h4>
<p>这个弹框能打开，是因为页面底部的脚本调用了 M.AutoInit()。</p>
</div>
<div class="modal-footer">
<a href="#" class="modal-close waves-effect waves-green btn-flat">关闭</a>
</div>
</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  M.AutoInit();
});
</script>
</body>
</html>
```

## 11. 完整配置文件

Pico 没有传统意义上的配置文件，它的“配置”就是主题文件。下面这份 `pico-demo/css/theme.css` 是完整的，没有省略号，存好就能用。**存放路径：`pico-demo/css/theme.css`，在 `index.html` 里用 `css/theme.css` 引用，引用顺序必须在 Pico CDN 链接之后。**

```css
:root {
  --pico-font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --pico-primary: #1565c0;
  --pico-primary-hover: #0d47a1;
  --pico-border-radius: 0.5rem;
  --pico-form-element-spacing-vertical: 0.75rem;
  --pico-form-element-spacing-horizontal: 1rem;
}

[data-theme="dark"] {
  --pico-primary: #64b5f6;
  --pico-primary-hover: #90caf9;
}
```

Materialize 如果要改主题，做法不同：它用 Sass 变量，改完要编译，编译产物才是浏览器用的 CSS。本篇不展开 Sass 编译流程，需要时按分支文档操作，变量名和编译命令以所用版本的文档为准，不要拿原版 1.0.0 的旧教程直接套分支 2.x。

## 12. 每个关键配置项的解释

### Pico 主题变量（第 11 节的 `theme.css`）

| 配置项 | 含义 | 改了会怎样 |
| --- | --- | --- |
| `--pico-font-family` | 全站字体栈 | 按顺序找字体，找不到就往后 fallback，中文放在西文字体后面 |
| `--pico-primary` | 主色：链接、按钮、选中态都用它 | 全站主色一起变，不用逐个元素改 |
| `--pico-primary-hover` | 主色的悬停色 | 鼠标悬停时按钮和链接变这个颜色 |
| `--pico-border-radius` | 圆角 | 按钮、输入框、卡片的圆角一起变 |
| `--pico-form-element-spacing-vertical` | 表单元素上下内边距 | 输入框变高或变矮 |
| `--pico-form-element-spacing-horizontal` | 表单元素左右内边距 | 输入框变宽或变窄 |
| `[data-theme="dark"]` 里的同名变量 | 深色模式下的覆盖值 | 只在深色下生效，浅色不受影响 |

### Pico 页面结构里的关键写法

| 写法 | 含义 |
| --- | --- |
| `class="container"` | Pico 类名版的居中容器，限制内容宽度并水平居中；无类名版不需要它 |
| `data-theme="light"` / `data-theme="dark"` | 写在 `html` 标签上，强制浅色或深色；不写则跟随系统 |
| `label` 配 `for` 和 `id` | 不只是语义正确：点文字就能聚焦到输入框，Pico 的表单样式也依赖这套结构 |
| `details` + `summary` | 原生折叠组件，不用 JavaScript 就能展开收起，Pico 直接给了它样式 |

### Materialize 小片段里的关键写法

| 写法 | 含义 |
| --- | --- |
| `container`、`row`、`col s12 m6` | 容器、行、列；`s12` 是手机占 12 列，`m6` 是平板及以上占 6 列 |
| `card`、`card-content`、`card-action`、`card-title` | 卡片的三段结构，少写一段，卡片的间距就会乱 |
| `btn waves-effect waves-light` | 按钮 + 涟漪点击效果 + 浅色涟漪；只写 `btn` 也能看，但没有涟漪 |
| `modal-trigger` + `href="#demo-modal"` | 触发器：点它打开 `id` 为 `demo-modal` 的模态框，`href` 里的 `#` 后名字必须和模态框 `id` 一致 |
| `modal-close` | 点它关闭模态框，写在模态框的按钮上 |
| `M.AutoInit()` | 页面加载后初始化所有 Materialize 组件；演示页够用，正式项目建议按组件逐个初始化 |

## 13. 执行结果示例

按第 9 节做完，浏览器里应该看到：

1. Pico 示例页：页眉导航左右分开，标题和段落有正常行距，反馈表单的输入框、选择框、多行文本框、复选框、两个按钮都已经有样式，表格有表头底线和行分隔，折叠说明点一下能展开、再点能收起。
2. 把 `data-theme` 改成 `dark` 再刷新：背景变深、文字变浅、主色变成第 11 节深色分支里写的那种浅蓝，表单和表格仍然清晰可读。
3. Materialize 小片段：卡片带阴影，按钮是 Material 风格的实心按钮，点“打开模态框”弹出居中弹框，点“关闭”弹框消失，页面其余部分变暗（遮罩层）。
4. 如果页面是一片没样式的默认黑白文字，说明 CSS 根本没加载，先看第 16 节，不要急着改主题变量。

## 14. 成功验证

按下面顺序验证，全部通过才算本篇完成：

1. Pico 示例页在浏览器里打开，标题、表单、表格、折叠组件都有样式，不是浏览器默认的裸 HTML。
2. `data-theme` 的三种情况（`light`、`dark`、删掉）各刷新一次，亮暗表现符合第 13 节的描述。
3. 主题文件验证：把 `theme.css` 里的 `--pico-primary` 临时改成一个很显眼的颜色（例如红色系），刷新后按钮和链接颜色跟着变，改回去再刷新，颜色恢复。这一步证明主题覆盖真的生效，而不是“看起来像默认样式”。
4. Materialize 小片段：模态框能打开、能关闭；把 `M.AutoInit()` 那行删掉再刷新，模态框点开没反应——这个反向验证能证明初始化脚本确实是起作用的那一行。
5. 本地文件验证（第 10 节示例）：把示例页另存到临时目录、用本地服务起起来、curl 拿到 HTTP 200 且字节数一致，见本篇作者的验证数字（汇报里）。注意：这一步只证明本地文件能返回，**不证明 CDN 在读者浏览器里一定能加载**，CDN 加载要靠读者自己在浏览器里打开页面、看样式是否出来、看开发者工具的网络面板里 CDN 请求是不是 200。

## 15. 常见错误

| 错误现象 | 常见原因 | 正确做法 |
| --- | --- | --- |
| Pico 页面完全没样式 | CDN 地址写错、版本号写错、网络打不开 CDN | 先在浏览器里直接打开 CDN 地址看能不能看到 CSS 文本，再核对版本号是不是 `2.1.1` |
| Pico 主题改了没效果 | `theme.css` 引用写在 Pico 链接之前，或路径写错 | 引用顺序必须是 Pico 在前、主题在后；路径按第 11 节写成 `css/theme.css` |
| Pico 里写 `class="card"` 却没出卡片 | Pico 没有 `card` 这个组件类名 | Pico 不靠类名出卡片，用 `article` 语义标签；要卡片组件就换 Materialize 这类组件库 |
| Materialize 模态框点开没反应 | 只引了 CSS，没引 JS；或没调用初始化 | CSS 和 JS 都要引，脚本里要有 `M.AutoInit()` 或 `M.Modal.init(...)` |
| Materialize 触发器打不开弹框 | `href="#demo-modal"` 里的名字和模态框 `id` 对不上 | 两处名字必须一字不差，包括大小写 |
| Materialize 页面样式乱了 | 把 Pico 和 Materialize 引到了同一个页面 | 两个框架分开用，不要混引；混引的默认值冲突很难逐条排 |
| 升级 Materialize 后组件行为变了 | 原版 1.0.0 直接换成社区分支 2.x，没看迁移说明 | 先看分支的迁移说明，再换链接和初始化写法 |

## 16. 故障排查

按“先确认文件到了，再确认顺序对了，最后确认名字对了”的顺序排，不要一上来就重写页面：

1. **样式全没加载**：浏览器开发者工具 → 网络面板 → 刷新 → 看 Pico 或 Materialize 的 CSS 请求状态。404 说明地址或版本号错了；失败（blocked、超时）说明网络或 CDN 被屏蔽，换本地文件（第 9 节第 4 步）再试。
2. **只有部分样式**：看是不是两个框架混引了，或者主题文件路径 404 了。网络面板里 404 的那个文件就是线索。
3. **主题变量不生效**：检查三点：主题文件是不是在 Pico 链接之后引用；变量名是不是 `--pico-` 开头且拼写正确；是不是在浏览器缓存里看到的还是旧文件（强制刷新一次）。
4. **深色模式不切换**：检查 `data-theme` 是不是写在 `html` 标签上，而不是写在 `body` 上；再检查主题文件里 `[data-theme="dark"]` 那一段有没有被误删。
5. **Materialize 模态框打不开**：控制台有没有报错；JS 文件是不是 200；初始化脚本是不是在 DOM 加载后执行（本篇用 `DOMContentLoaded` 包起来就是为这个）；触发器的 `href` 和模态框 `id` 是不是一致。
6. **换了分支版本后报错**：先退回原来能跑的版本组合，确认是版本问题还是写法问题；再按分支文档的迁移说明逐项改，不要同时改链接、改类名、改初始化写法三件事。

## 17. 安全注意事项

1. **Pico 已归档，意味着不再有安全修复**。这是本篇最重要的安全结论：新项目不要用 Pico 承载会长期演进的正式页面；已有 Pico 页面要定期检查浏览器兼容性变化，出问题只能自己修或换框架，不能等官方补丁。
2. **Materialize 原版 1.0.0 同样没有新修复**。要用 Materialize，请走社区分支并跟进它的更新，或者接受“只用于维护中的老项目、演示页”这个定位；不要在新项目里默认引用 2018 年的原版链接。
3. **CDN 链接要钉死版本号**。不要用不带版本号的浮动地址，否则上游一旦变动，你的页面样式会在你不知情的情况下变。条件允许时，给 CDN 链接加 SRI 完整性校验（`integrity` 属性），哈希值以 CDN 提供方当场给出的为准，**不要凭印象编一个哈希值贴上去**，错的哈希会直接让浏览器拒绝加载。
4. **不要把用户输入拼进模态框内容**。Materialize 的模态框内容如果是用户提交的文字，要先转义再放进页面，否则就是现成的跨站脚本（XSS）入口；表单提交到后端时，后端也要再校验一次，前端校验从来不算数。
5. **第三方样式和脚本只从可信 CDN 拿**。不要从不明网站复制“据说更快”的框架链接，链接域名、包名、版本号三处都要核对；内网或涉密页面优先用本地文件，不走外网 CDN。
6. **归档和停滞项目的许可证不等于可以乱用名字**。Pico 是 MIT 许可，可以 fork 后自己改，但 Pico 的名字和 Logo 不在 MIT 许可的转让范围内；fork 后对外发布时不要冒用原项目的名字。

## 18. 回滚和恢复

- **主题改坏了**：删掉 `theme.css` 里的改动，或者直接把 `index.html` 里引用 `theme.css` 的那一行注释掉，页面立刻回到 Pico 默认样式；主题文件本身不影响 HTML 结构，删它不会丢内容。
- **CDN 挂了**：把 `index.html` 里的 CDN 链接换成本地 `css/pico.min.css`（第 9 节第 4 步下载的那份），页面恢复；等 CDN 恢复后再换回去，换的时候核对版本号仍是 `2.1.1`。
- **Materialize 升级后组件坏了**：把 CSS 和 JS 链接同时换回原来能跑的版本组合（原版就是 1.0.0 的 cdnjs 链接），不要只换 CSS 不换 JS；确认恢复后，再按分支迁移说明一步步升。
- **整个示例页改乱了**：删掉改动，重新从第 10 节复制一份完整示例，本篇的示例没有后端、不依赖数据库，重建成本就是复制粘贴一次。

## 19. 延伸阅读

- Pico CSS 官网：看无类名版和类名版的文件区别、全部 CSS 变量表、颜色主题的 CDN 写法（选用前先确认仓库归档状态，见第 3 节）。
- Materialize 原版文档（materializecss.com）：看 1.0.0 的组件全表和初始化写法；社区分支文档（materializecss.github.io/materialize）：看分支版的安装、迁移说明和最新版本号，安装前以它为准。
- CSS-08 工程化：样式文件怎么组织、命名规范怎么写，本篇的 `theme.css` 就是按那一篇的“单独主题文件”思路放的。
- CSS-04 Flexbox、CSS-05 Grid：Pico 和 Materialize 的网格只是封装，底层仍是 Flex 和 Grid，排障时回到这两篇看原理最快。

## 20. 相关章节链接

- [CSS-01 CSS 基础语法与选择器](../css/01-basics.md)
- [CSS-02 CSS 单位与颜色、字体、背景、边框](../css/02-units-colors.md)
- [CSS-03 CSS 盒模型与定位](../css/03-box-position.md)
- [CSS-08 CSS 工程化](../css/08-engineering.md)
- [HTML 基础与语义化标签](../html/01-basics.md)
- [建站指南总计划](../MASTER_PLAN.md)
- [任务索引](../TASK_INDEX.md)
- [路线图](../ROADMAP.md)

- 下一篇：[CSS-14 自己编写 CSS 框架](./06-own-framework.md)
