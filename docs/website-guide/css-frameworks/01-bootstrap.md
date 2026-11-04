# CSS-09：Bootstrap 完整教程

> 任务编号：CSS-09（网站建设与部署实战指南 · CSS 框架第 1 篇）
> 上一篇：[CSS-08 CSS 工程化](../css/08-engineering.md)；下一篇：[CSS-10 Tailwind CSS](./02-tailwind.md)
> 本篇只讲 Bootstrap：CDN 引入与 npm 安装、栅格系统、常用组件、Sass 定制、一个完整实战页。不讲 Tailwind CSS（那是 CSS-10）、Bulma、Foundation 等其他框架，也不展开讲 Vite、Webpack 等构建工具的完整配置（那是 JS-04 前端工程化阶段）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 Bootstrap 是什么、它帮你省了什么、它不适合什么场景；
2. 用 CDN 和 npm 两种方式把 Bootstrap 装进一个页面，并说清楚两种方式各在什么时候用；
3. 用栅格系统写出桌面多列、手机单列的布局，不再手写媒体查询去切列数；
4. 用 Bootstrap 的导航栏、卡片、按钮、表单、提示框、模态框搭出一个像样的页面；
5. 用 Sass 改掉 Bootstrap 的主色、圆角、字体，编译出属于自己的主题，而不是全站都长着默认的蓝色；
6. 独立写出一个完整实战页：导航栏 + 首页大标题 + 三列卡片 + 表单 + 模态框，复制下来就能在浏览器里打开。

## 2. 适用人群

- 已完成 CSS-01 至 CSS-08，能写选择器、盒模型、Flex、Grid、响应式的人；
- 想快速做出一个“看起来不丑”的管理后台、官网、活动页，不想从零手写每一块样式的人；
- 听说过 Bootstrap，但只会复制粘贴，不知道栅格为什么是 12 列、组件为什么有时点不动的人；
- 还没有用过任何 CSS 框架的人——本篇从“先不用装任何东西的 CDN 方式”讲起。

## 3. 适用系统和版本

- 系统：Windows、macOS、Linux 均可；浏览器：任意现代浏览器（Chrome、Edge、Firefox、Safari 的近几年版本）；编辑器：任意纯文本编辑器。
- Bootstrap 版本（核查日期 2026-11-03，公开搜索核查）：最新稳定版是 **Bootstrap 5.3.8**，2025 年 8 月 25 日发布，是目前生产环境应该用的版本。Bootstrap 6 在核查时只有 Alpha 预览版（6.0.0-alpha），不是稳定版，新项目不要用它做生产页面；本篇全部写法都按 5.3.8 写。
- Bootstrap 5 与 4 的关键区别：5 不再依赖 jQuery，交互组件用原生 JavaScript 实现；属性名从 `data-toggle`、`data-target` 改成了 `data-bs-toggle`、`data-bs-target`；5 引入了 CSS 变量和暗黑模式支持。
- Node.js：如果走 npm 安装路线，需要 Node.js（建议 18 或更新版本，执行 `node -v` 能看到版本号即可）；只走 CDN 路线则不需要 Node.js。
- Sass：如果做第 9 节的 Sass 定制，需要能运行 Sass 编译的工具，本篇用 npm 安装的 `sass` 包，命令在第 9 节给出；不做定制的人可以跳过 Sass 部分。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级、继承），能看懂类选择器的写法；
- 已完成 CSS-02（单位、颜色、字体、背景、边框），能看懂示例里的颜色和字号；
- 已完成 CSS-03（盒模型、定位），知道 `box-sizing`、`margin`、`padding` 是什么；
- 已完成 CSS-04（Flexbox），因为 Bootstrap 的栅格和很多组件内部就是 Flex 布局，知道主轴、交叉轴能帮你理解对齐类；
- 已完成 CSS-06（响应式设计），因为栅格的断点就是响应式的具体应用；
- 已完成 CSS-08（CSS 工程化），因为 Sass 定制部分要用到变量、导入、编译的概念；
- 知道怎么保存 UTF-8 编码的 `.html` 文件，知道浏览器刷新、按 F12 打开开发者工具怎么操作。

## 5. 所需资源

- 一台能上网的电脑：CDN 路线需要联网加载 Bootstrap 文件；npm 路线需要联网下载安装包。
- 一个空文件夹，用来放本篇的练习文件，建议在桌面新建一个 `bootstrap-demo` 文件夹。
- 不需要服务器：本篇的页面都是静态页面，双击 `.html` 文件或用本地静态服务打开都可以。
- 不需要数据库、不需要后端：表单在本篇只做界面演示，提交后不会真的保存数据，后端处理在后端阶段（BE-02 等）再讲。

## 6. 技术原理

Bootstrap 本质上是一套别人已经写好、测好的 CSS 和 JavaScript，核心是三样东西：

1. **预置样式（Reboot）**：先把各浏览器的默认样式统一成一样（标题、段落、列表、表单的默认外观），这样你写的页面在不同浏览器里起点一致。
2. **工具类（Utility）**：把常用样式拆成一个个小类名，例如 `text-center` 是居中、`mt-3` 是上边距、`bg-primary` 是主色背景、`d-flex` 是弹性布局。你不用再为每个小样式单独写 CSS，拼类名就能出效果。
3. **组件（Component）**：把导航栏、卡片、按钮、表单、提示框、模态框这些常见界面块做成固定结构 + 固定类名，你按结构写 HTML，再加少量自己的内容，就能得到外观和交互都完整的块。

栅格系统的原理是一句话：一行（`row`）固定分成 12 列，你用 `col-*` 说“我这个块占几列”，Bootstrap 用 Flex 布局把它们排开；不同断点下占几列可以不一样，例如桌面占 4 列、手机占 12 列（即独占一行），浏览器宽度一变，列数自动跟着变，你不需要为每个断点手写媒体查询。

交互组件的原理也是一句话：HTML 里用 `data-bs-*` 属性声明“我要点这个按钮就打开那个模态框”，Bootstrap 的 JavaScript 在页面加载后读到这些属性，自动给元素绑上点击、打开、关闭的逻辑；你也可以用 JavaScript 直接调用，例如 `new bootstrap.Modal(...)`，但入门先用属性方式就够了。

为什么 Bootstrap 能省时间：因为“导航栏长什么样、卡片怎么排、按钮什么颜色”这些问题，别人已经替你定好了默认答案，你只需要做选择题（用哪个组件、占几列、什么颜色），而不是从零做问答题。但代价也要说清楚：默认答案会让很多网站长得很像；你要做出完全独特的视觉，就得做 Sass 定制（第 9 节）或者自己写覆盖样式。

## 7. 架构说明

本篇涉及两条路线，文件结构不一样，先分清再动手：

**CDN 路线（学习、演示、单页活动页）的文件结构：**

```text
bootstrap-demo/
  index.html        ← 唯一的文件，里面同时引用 CDN 的 CSS 和 JS
  css/
    custom.css      ← 可选：你自己的覆盖样式，放在 Bootstrap 之后引入
```

**npm + Sass 路线（长期项目、要定制主题）的标准结构：**

```text
bootstrap-demo/
  package.json      ← 项目说明和依赖，见第 11 节
  index.html        ← 页面，引用编译后的 css/custom.css
  scss/
    custom.scss     ← 你的入口：先改变量，再导入 Bootstrap，见第 11 节
  css/
    custom.css      ← Sass 编译出来的成品，浏览器真正加载的是它
```

两条路线在浏览器里的加载关系是一样的：先加载 Bootstrap 的样式，再加载你自己的样式（如果有），最后加载 Bootstrap 的 JavaScript；你自己的样式放在后面，才能覆盖 Bootstrap 的默认值。CDN 路线的 CSS 和 JS 来自公共 CDN 服务器；npm 路线的 CSS 来自你本地编译的 `css/custom.css`，JS 来自 `node_modules/bootstrap/dist/js/bootstrap.bundle.min.js`，或者你把它复制到自己的 `js/` 目录再引用。

## 8. 操作前检查

动手前先确认下面四项，缺哪项补哪项，不要带着问题往下走：

1. 浏览器能正常打开任意网页（确认网络通畅，CDN 路线尤其需要这一步）。
2. 能新建文件夹、保存 `.html` 文件，并且知道文件保存到了哪里。
3. 走 npm 路线的人：在终端执行 `node -v` 和 `npm -v`，两个命令都要能输出版本号；输出“找不到命令”说明 Node.js 没装好，先装好再继续。
4. 走 Sass 定制的人：先确认已经按第 9 节装好了 `sass`，不要在没装好的情况下直接运行编译命令。

## 9. 逐步操作

### 第一步：CDN 方式，5 分钟做出第一个 Bootstrap 页面

1. 在 `bootstrap-demo` 文件夹里新建 `index.html`。
2. 在 `<head>` 里加入 Bootstrap 5.3.8 的 CSS 链接（用 jsDelivr CDN，版本号写死 5.3.8，不要写成浮动版本，以免将来大版本升级把你的页面改坏）。
3. 在 `</body>` 之前加入 Bootstrap 5.3.8 的 JS 包（`bootstrap.bundle.min.js`，里面已经包含 Popper，下拉菜单、提示框、弹出框都依赖它，不要只引不含 Popper 的 `bootstrap.min.js`）。
4. 在 `<body>` 里写一个 `container`、一个标题、一个按钮，保存后用浏览器打开，看到标题和蓝色按钮，就说明 CDN 加载成功了。

CDN 引入的两个链接（版本号 5.3.8，复制时按官网给出的完整链接为准，生产环境建议同时复制官网给出的完整性校验值，不要自己编一个校验值）：

```text
CSS：https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css
JS：https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js
```

### 第二步：npm 方式，把 Bootstrap 装到本地项目

1. 在 `bootstrap-demo` 文件夹里打开终端，执行 `npm init -y`，生成 `package.json`。
2. 执行 `npm install bootstrap@5.3.8`，把 Bootstrap 装到 `node_modules`。
3. 在页面里引用本地文件：CSS 引用 `node_modules/bootstrap/dist/css/bootstrap.min.css`（仅本地学习时这样写），JS 引用 `node_modules/bootstrap/dist/js/bootstrap.bundle.min.js`。
4. 长期项目不要直接引用 `node_modules` 里的路径上线：要么用构建工具打包（JS-04 再讲），要么把 `dist` 里的 CSS 和 JS 复制到自己的 `css/`、`js/` 目录再引用。

### 第三步：栅格系统，写出桌面三列、手机一列

1. 外层写 `container`（固定宽度、居中）或 `container-fluid`（占满全宽），二选一，不要两个都套。
2. 里面写 `row`，一行里放若干个 `col`。
3. 每个 `col` 上写断点类：例如 `col-12 col-md-4` 表示手机（小于 768px）占 12 列即独占一行，平板及以上占 4 列即一行三列。
4. 记住断点表：`sm` 是 576px 及以上，`md` 是 768px 及以上，`lg` 是 992px 及以上，`xl` 是 1200px 及以上，`xxl` 是 1400px 及以上；不写断点前缀的 `col` 表示所有宽度都按这个规则。
5. 列与列之间的间距用 `g-*` 控制，例如 `g-3`；不要在 `col` 上直接加 `margin` 去调间距，那会把 12 列的宽度算乱。

### 第四步：常用组件，按结构抄，不要自己发明结构

1. 导航栏：外层 `nav` 加 `navbar`、`navbar-expand-lg`、`bg-body-tertiary`，里面依次是品牌、折叠按钮、折叠区里的链接列表；手机上折叠按钮靠 `data-bs-toggle="collapse"` 和 `data-bs-target` 控制展开收起。
2. 卡片：外层 `card`，里面依次是 `card-body`、`card-title`、`card-text`，再加一个 `btn`；卡片本身不负责排几列，排几列是栅格 `col` 的事，卡片只负责长什么样。
3. 按钮：基础类 `btn` 必须写，再加颜色类，例如 `btn-primary`、`btn-outline-secondary`；只写颜色类不写 `btn`，按钮样式出不来。
4. 表单：每个输入框外包一层 `mb-3`，标签用 `form-label`，输入框用 `form-control`，多选框和单选框用 `form-check` 加 `form-check-input`。
5. 提示框：`alert alert-success`、`alert alert-warning` 之类，颜色类决定语义，不要用颜色去表达相反的意思（例如成功用红色）。
6. 模态框：按钮上写 `data-bs-toggle="modal"` 和 `data-bs-target="#demoModal"`，页面里再写一个 `id="demoModal"` 的 `modal` 结构，按钮和模态框的 `id` 必须对得上，对不上点按钮没反应。

### 第五步：Sass 定制，改主色和圆角

1. 执行 `npm install sass`，装好 Sass 编译器。
2. 新建 `scss/custom.scss`，先写变量覆盖（例如 `$primary`、`$border-radius`），再写导入 Bootstrap 的语句，顺序不能反——先覆盖、后导入，导入之后再改变量就不生效了。
3. 执行编译命令，把 `scss/custom.scss` 编译成 `css/custom.css`。
4. 把页面的 CSS 引用从 CDN 或 `node_modules` 改成 `css/custom.css`，刷新页面，看到主色变了，说明定制生效了；如果主色没变，先检查是不是页面还在引用旧的 CSS 文件，这是最常见的错误。

### 第六步：做第 10 节的完整实战页

把第 10 节的完整示例保存成 `index.html`，用浏览器打开，按第 14 节的清单逐项验证：导航栏、卡片、表单、模态框都要能正常工作，有一项不行就先看第 15、16 节，不要急着改结构。

## 10. 完整代码

下面是本篇唯一的完整示例页，复制下来保存为 `index.html` 就能打开，没有省略号，没有“其余部分略”：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bootstrap 实战页：我的小站</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
.hero-box {
  background-color: #eef4ff;
  border-radius: 12px;
  padding: 48px 24px;
}
.demo-block {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
}
</style>
</head>
<body>
<nav class="navbar navbar-expand-lg bg-body-tertiary">
<div class="container">
<a class="navbar-brand" href="#">我的小站</a>
<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="切换导航">
<span class="navbar-toggler-icon"></span>
</button>
<div class="collapse navbar-collapse" id="mainNav">
<ul class="navbar-nav ms-auto">
<li class="nav-item"><a class="nav-link active" href="#">首页</a></li>
<li class="nav-item"><a class="nav-link" href="#cards">服务</a></li>
<li class="nav-item"><a class="nav-link" href="#contact">联系</a></li>
</ul>
</div>
</div>
</nav>
<main class="container my-5">
<section class="hero-box text-center">
<h1>用 Bootstrap 快速搭一个页面</h1>
<p class="lead">栅格负责排版，组件负责长相，你只负责内容。</p>
<button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#demoModal">了解更多</button>
<a class="btn btn-outline-secondary" href="#cards">看看服务</a>
</section>
<div class="alert alert-success mt-4" role="alert">提示：这个页面已经加载了 Bootstrap 5.3.8，按钮和模态框都可以点。</div>
<section id="cards" class="row g-3 mt-2">
<div class="col-12 col-md-4">
<div class="card h-100">
<div class="card-body">
<h2 class="card-title h5">快速上手</h2>
<p class="card-text">CDN 两行链接就能开始，不用装任何工具。</p>
<a class="btn btn-primary" href="#">开始学习</a>
</div>
</div>
</div>
<div class="col-12 col-md-4">
<div class="card h-100">
<div class="card-body">
<h2 class="card-title h5">响应式布局</h2>
<p class="card-text">桌面三列，手机自动变成一列，不用手写媒体查询。</p>
<a class="btn btn-outline-primary" href="#">看看栅格</a>
</div>
</div>
</div>
<div class="col-12 col-md-4">
<div class="card h-100">
<div class="card-body">
<h2 class="card-title h5">可以定制</h2>
<p class="card-text">用 Sass 改主色和圆角，做出自己的主题。</p>
<a class="btn btn-outline-primary" href="#">看看定制</a>
</div>
</div>
</div>
</section>
<section id="contact" class="demo-block mt-4 text-start">
<h2 class="h5">联系我们</h2>
<form>
<div class="mb-3">
<label class="form-label" for="userName">姓名</label>
<input class="form-control" type="text" id="userName" placeholder="请输入姓名">
</div>
<div class="mb-3">
<label class="form-label" for="userMessage">留言</label>
<textarea class="form-control" id="userMessage" rows="3" placeholder="请输入留言"></textarea>
</div>
<div class="mb-3 form-check">
<input class="form-check-input" type="checkbox" id="agreeBox">
<label class="form-check-label" for="agreeBox">我已阅读并同意联系说明</label>
</div>
<button class="btn btn-primary" type="button">提交留言</button>
</form>
</section>
</main>
<div class="modal fade" id="demoModal" tabindex="-1" aria-labelledby="demoModalLabel" aria-hidden="true">
<div class="modal-dialog">
<div class="modal-content">
<div class="modal-header">
<h2 class="modal-title fs-5" id="demoModalLabel">关于这个页面</h2>
<button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="关闭"></button>
</div>
<div class="modal-body">
<p>这个模态框证明 Bootstrap 的 JavaScript 已经正常工作：如果只引了 CSS、没引 JS 包，点按钮是打不开它的。</p>
</div>
<div class="modal-footer">
<button class="btn btn-secondary" type="button" data-bs-dismiss="modal">关闭</button>
</div>
</div>
</div>
</div>
<footer class="container text-center text-muted pb-4">
<p>本页仅作 Bootstrap 学习演示，表单提交不会真的保存数据。</p>
</footer>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

上面示例里的两处自定义样式（`hero-box`、`demo-block`）是故意留的：它们证明“Bootstrap 之外，你自己的少量样式应该怎么写”——写在 `<style>` 里，放在 Bootstrap 的 CSS 链接之后，这样你的样式才能覆盖默认值；生产项目里建议把它们移到独立的 `css/custom.css` 文件里引用，结构见第 11 节。

## 11. 完整配置文件

### CDN 路线：没有配置文件，但文件位置要固定

CDN 路线不需要 `package.json`，只需要固定下面两个文件的存放路径：

```text
bootstrap-demo/index.html      ← 第 10 节的完整示例，直接放这里
bootstrap-demo/css/custom.css  ← 可选：你自己的覆盖样式，页面里在 Bootstrap 的 CSS 链接之后再引用它
```

引用顺序必须是：先 Bootstrap 的 CSS，再 `css/custom.css`；顺序反了，你的覆盖样式会被 Bootstrap 的默认值盖掉。

### npm + Sass 路线：三个文件，路径和内容如下

**文件一：`bootstrap-demo/package.json`（项目根目录，`npm init -y` 生成后补上依赖）**

```json
{
  "name": "bootstrap-demo",
  "version": "1.0.0",
  "description": "Bootstrap 5.3.8 学习演示",
  "private": true,
  "scripts": {
    "build-css": "sass scss/custom.scss css/custom.css"
  },
  "dependencies": {
    "bootstrap": "5.3.8"
  },
  "devDependencies": {
    "sass": "^1.0.0"
  }
}
```

**文件二：`bootstrap-demo/scss/custom.scss`（Sass 入口，先改变量、后导入）**

```scss
$primary: #0f766e;
$secondary: #475569;
$border-radius: 0.75rem;
$font-family-base: "PingFang SC", "Microsoft YaHei", sans-serif;

@import "../node_modules/bootstrap/scss/bootstrap";
```

**文件三：编译命令（在 `bootstrap-demo` 目录的终端里执行，生成 `bootstrap-demo/css/custom.css`）**

```bash
npm install
npm run build-css
```

编译完成后，页面里只引用编译产物，不要再同时引用 CDN 或 `node_modules` 里的 Bootstrap CSS，否则两份样式会互相干扰：

```text
bootstrap-demo/index.html  →  引用 css/custom.css
bootstrap-demo/css/custom.css  →  编译产物，浏览器真正加载的文件
bootstrap-demo/js/bootstrap.bundle.min.js  →  从 node_modules/bootstrap/dist/js/ 复制来的 JS 包（如果页面里有模态框、下拉菜单等交互组件，必须引用它）
```

## 12. 每个关键配置项的解释

| 配置项 / 类名 / 写法 | 含义 | 不写会怎样 |
|---|---|---|
| `container` | 固定宽度、水平居中的内容容器 | 内容贴边，没有居中和左右留白 |
| `container-fluid` | 占满全宽的容器 | 与 `container` 二选一，两个都套会多一层不必要的宽度限制 |
| `row` | 栅格的一行，内部用 Flex 排布 | `col` 不在 `row` 里，列间距和换行规则会乱 |
| `col-12 col-md-4` | 手机占 12 列（独占一行），768px 及以上占 4 列（一行三列） | 只写 `col-4`，手机上也会硬挤三列，字会挤得很小 |
| `g-3` | 行内列与列之间的间距 | 不写，卡片会贴在一起；直接在 `col` 上加 `margin` 会算乱 12 列宽度 |
| `navbar-expand-lg` | 992px 及以上展开导航，992px 以下折叠成汉堡按钮 | 不写，导航在所有宽度下都折叠；写成 `navbar-expand` 则在所有宽度下都展开，手机上会溢出 |
| `data-bs-toggle="modal"` | 声明“点这个按钮要打开模态框” | 不写，按钮只是个普通按钮，点它什么都不会发生 |
| `data-bs-target="#demoModal"` | 指明要打开的模态框的 `id` | `id` 对不上，按钮点了也没反应，这是最常见的“点不动”原因 |
| `bootstrap.bundle.min.js` | 包含 Popper 的完整 JS 包 | 只引 `bootstrap.min.js`（不含 Popper），下拉菜单、提示框、弹出框会失效 |
| `$primary`（Sass 变量） | Bootstrap 的主色，按钮、链接、高亮都用它 | 不改，全站都是默认蓝色；改了但放在导入语句之后，改动不生效 |
| `$border-radius`（Sass 变量） | 全站默认圆角 | 不改，圆角就是 Bootstrap 默认值 |
| `@import "../node_modules/bootstrap/scss/bootstrap"` | 把 Bootstrap 的全部 Sass 源码编译进你的 CSS | 不写，页面只有你自己的变量，没有任何 Bootstrap 样式 |

## 13. 执行结果示例

按第 10 节保存 `index.html` 并用浏览器打开，你应该看到：

1. 顶部一条浅灰色导航栏，左边是“我的小站”，右边是“首页、服务、联系”三个链接；把浏览器窗口拖窄到手机宽度，右侧链接会收进一个汉堡按钮，点汉堡按钮能展开、再点能收起。
2. 中间一块浅蓝色大标题区，标题是“用 Bootstrap 快速搭一个页面”，下面有两个按钮：实心主色按钮“了解更多”和描边按钮“看看服务”。
3. 大标题区下面一条绿色提示框，写着页面已经加载了 Bootstrap 5.3.8。
4. 再下面是三张卡片：桌面宽度下一行三列，手机宽度下自动变成一列三行；每张卡片都有标题、一段文字和一个按钮。
5. 最下面是一个“联系我们”表单：姓名输入框、留言多行框、一个复选框、一个提交按钮。
6. 点“了解更多”按钮，屏幕中间弹出一个模态框，标题是“关于这个页面”，点右上角叉号或底部“关闭”都能关掉它。

如果第 6 条点按钮没反应，先不要怀疑结构写错了：先看第 15、16 节，十有八九是 JS 包没引、引错了版本、或者 `data-bs-target` 的 `id` 对不上。

## 14. 成功验证

逐项打勾，全部通过才算本篇完成：

1. 页面能正常打开，没有“找不到文件”的报错，标题、导航栏、卡片、表单都看得见。
2. 把浏览器窗口从桌面宽度一路拖到手机宽度：三张卡片从一行三列变成一列三行，导航栏从展开变成汉堡按钮，过程中没有出现横向滚动条（出现横向滚动条说明有元素宽度溢出了，先检查是不是在 `col` 外面直接放了固定宽度的块）。
3. 点汉堡按钮，导航能展开；再点一次，能收起。
4. 点“了解更多”，模态框能打开；点叉号或“关闭”，模态框能关掉。
5. 表单的输入框能点进去打字，复选框能勾选（本篇不验证提交，因为没有后端，提交按钮特意写成了 `type="button"`，点它不会跳转也不会报错）。
6. 走 Sass 路线的人：改一下 `scss/custom.scss` 里的 `$primary`，重新执行 `npm run build-css`，刷新页面，主色按钮的颜色跟着变了，说明定制链路是通的。
7. 用浏览器开发者工具看网络请求：CDN 路线的 CSS 和 JS 请求状态是 200；如果看到 404 或长时间转圈，说明 CDN 链接写错了或者网络不通，先核对第 9 节第一步的两个链接。

如实说明：上面第 7 条只能证明你自己这台电脑、这个网络下 CDN 能加载；读者的网络环境不一样，CDN 在读者浏览器里不一定每次都能加载，生产项目如果对可用性要求高，应该把 CSS 和 JS 放到自己的服务器或构建产物里，不要只依赖公共 CDN。本篇第 10 节示例的本地文件验证（curl 拿到 200）也只能证明本地文件本身能返回，不能证明 CDN 在读者浏览器里一定能加载，不要把这两件事混为一谈。

## 15. 常见错误

下面是新手最容易踩的坑，全部用表格列出，反面写法只用行内代码，不单独成段展示错误页面：

| 错误现象 | 常见原因 | 正确做法 |
|---|---|---|
| 按钮点了没反应，模态框打不开 | 只引了 CSS，没引 JS 包；或者引的是不含 Popper 的 `bootstrap.min.js` | 同时引用 CSS 和 `bootstrap.bundle.min.js`，JS 放在 `</body>` 之前 |
| 下拉菜单点不开 | 同上，Popper 缺失 | 用 `bootstrap.bundle.min.js`，不要用不含 Popper 的版本 |
| 导航栏在手机上溢出、出现横向滚动条 | 导航栏没写 `navbar-expand-lg`，或者在 `container` 外面又套了一层固定宽度 | 按第 9 节第四步的结构写导航栏，容器只用一层 |
| 手机上三列挤在一起，字很小 | 只写了 `col-4`，没写 `col-12` | 写成 `col-12 col-md-4`，手机先独占一行 |
| 卡片贴在一起，没有间距 | 忘记写 `g-3`，或者在 `col` 上直接加了 `margin` | 在 `row` 上写 `g-3`，不要在 `col` 上加 `margin` |
| 按钮只有颜色、没有按钮形状 | 只写了 `btn-primary`，漏了基础类 `btn` | 两个都要写，例如 `btn btn-primary` |
| Sass 改了主色，页面还是默认蓝 | 变量写在了导入语句之后，或者页面还在引用旧的 CSS 文件 | 变量写在导入之前，改完重新编译，页面引用编译后的 `css/custom.css` |
| 用了 Bootstrap 4 的写法，组件不工作 | 写了 `data-toggle`、`data-target`，Bootstrap 5 不认这两个属性 | Bootstrap 5 一律用 `data-bs-toggle`、`data-bs-target` |
| 复制了网上旧教程的 CDN 链接，样式全乱 | 链接指向 Bootstrap 4 甚至 3，类名和结构都对不上 | 按第 3 节核查到的 5.3.8 版本写链接，旧教程先核对版本再抄 |
| 表单一点提交就跳转、页面刷新 | 提交按钮默认是 `type="submit"`，没有后端也会触发表单提交 | 演示阶段把按钮写成 `type="button"`，有后端之后再按后端阶段的做法处理 |

## 16. 故障排查

按下面顺序查，不要一上来就重写整个页面：

1. **先看浏览器控制台有没有红色报错。** 按 F12 打开开发者工具，看 Console：如果提示 `bootstrap is not defined` 或找不到某个文件，说明 JS 包没加载成功，先核对 JS 链接和网络。
2. **再看网络请求。** 在 Network 面板里找 `bootstrap.min.css` 和 `bootstrap.bundle.min.js`：状态不是 200，就说明链接写错了或者 CDN 暂时不通，先核对版本号 5.3.8 和域名 `cdn.jsdelivr.net` 有没有拼错。
3. **再核对 `id`。** 模态框、下拉菜单、折叠导航点不动时，先核对按钮上的 `data-bs-target` 和目标元素的 `id` 是不是一模一样，包括 `#` 号和大小写，差一个字母都不行。
4. **再核对结构。** 栅格乱了，先检查是不是 `container → row → col` 三层都在，有没有漏掉 `row`、有没有把 `col` 直接放在 `container` 里；卡片变形了，先检查 `card` 里面是不是 `card-body`、`card-title`、`card-text` 的顺序。
5. **再核对版本。** 样式和旧教程对不上时，先看自己引的是不是 5.3.8，再看旧教程写的是不是 Bootstrap 4 或 3，两个大版本混用是查不完的，先统一到 5.3.8。
6. **Sass 不生效时。** 先看编译命令有没有报错，再看变量是不是写在导入之前，最后看页面引用的是不是编译后的 `css/custom.css` 而不是旧文件。
7. **还是不行时。** 把页面缩减到最小：只留一个按钮和一个模态框（第 10 节里就有现成的），如果最小页面能工作，说明问题出在你后来加的那部分，把加的部分一段一段加回来，哪一段加回来就坏，就是哪一段的问题。

## 17. 安全注意事项

1. **CDN 链接要从官网复制，不要从不明博客复制。** 博客里的链接可能指向被改过的旧版本；生产环境引用 CDN 时，复制官网给出的完整链接和完整性校验值（`integrity` 属性），浏览器会校验文件有没有被篡改；校验值不要自己编，编一个错的值浏览器会直接拒绝加载。
2. **不要把密钥、密码、Token 写进前端页面。** Bootstrap 页面是静态的，任何人打开开发者工具都能看到源码；需要密钥的接口调用必须走后端，绝不能写在 HTML 或 JS 里。
3. **表单演示不等于表单安全。** 本篇表单没有后端校验，生产环境的表单必须在后端再校验一次，前端校验（例如 `required`）只能改善体验，不能当作安全防线；用户输入在后端展示时要做转义，防止跨站脚本。
4. **CDN 不可用时的降级。** 对可用性要求高的生产页面，不要只依赖一个公共 CDN：要么把文件放到自己的服务器，要么准备本地备用文件，CDN 加载失败时切换成本地文件；本篇是学习演示，可以只用 CDN，但要知道这个风险。
5. **保持版本更新。** Bootstrap 5.3.8 是核查时的最新稳定版，将来出了安全修复版本要及时升级；长期不升级的旧版本可能带有已知漏洞，升级前先在测试环境验证页面有没有变形。

## 18. 回滚和恢复

1. **CDN 路线回滚最简单。** 改坏了就把 `index.html` 恢复到第 10 节的完整示例，或者把你改过的那一段删掉、重新复制第 10 节对应的那一段；因为只有一个文件，没有构建产物需要清理。
2. **npm 路线回滚。** 如果 `npm install` 装错了版本，执行 `npm install bootstrap@5.3.8` 装回正确版本；如果 `package.json` 改乱了，对照第 11 节的文件一重新写一份。
3. **Sass 定制回滚。** 如果改完主色全站变得难看，把 `scss/custom.scss` 里的变量覆盖删掉，只保留导入语句，重新执行 `npm run build-css`，页面就回到默认主题；或者直接把页面 CSS 引用改回 CDN 链接，先恢复、再慢慢调。
4. **改之前先备份。** 动手改任何一个能工作的页面之前，先把能工作的版本复制一份，命名为 `index-backup.html` 或 `custom-backup.scss`，改坏了直接用备份覆盖回来，不要凭记忆重写。
5. **不要删 `node_modules` 之外的东西来“清理”。** 删错 `scss`、`css`、`package.json` 会导致项目无法恢复；`node_modules` 删了可以 `npm install` 装回来，其他文件删了只能靠备份。

## 19. 延伸阅读

- Bootstrap 官方文档（英文，5.3 版本）：按“Getting started → Layout → Components → Utilities”的顺序读，入门先读栅格和常用组件，Sass 定制读“Customize”一章；读文档时先确认左上角显示的是 5.3.x，不要误读成 6 的 Alpha 文档。
- Bootstrap 官方示例库：里面有现成的相册页、定价页、登录页、后台仪表盘骨架，适合在第 10 节之后照着改，不要直接照搬到生产项目，先理解结构再改。
- 本指南 CSS-04 Flexbox、CSS-05 Grid：Bootstrap 栅格内部就是 Flex，理解了 Flex 才能理解 `justify-content`、`align-items` 这些工具类为什么那样命名。
- 本指南 CSS-06 响应式设计：栅格断点就是响应式的应用，断点选不准时回头看 CSS-06 的“按内容选断点”。
- 本指南 CSS-08 CSS 工程化：Sass 变量、导入、编译的概念在那里讲得更全，本篇只用了其中定制主题必需的一小部分。
- 本指南 JS-04 前端工程化（待开始）：npm 路线做到生产级别时，需要构建工具打包，本篇的“复制 dist 文件”只是过渡做法，正式做法在 JS-04 讲。

## 20. 相关章节链接

- 上一篇：[CSS-08 CSS 工程化](../css/08-engineering.md)
- 再往前：[CSS-01 CSS 基础语法与选择器](../css/01-basics.md)、[CSS-02 CSS 单位与颜色、字体、背景、边框](../css/02-units-colors.md)、[CSS-03 CSS 盒模型与定位](../css/03-box-position.md)、[CSS-04 Flexbox 完整教程](../css/04-flexbox.md)、[CSS-05 Grid 完整教程](../css/05-grid.md)、[CSS-06 响应式设计](../css/06-responsive.md)、[CSS-07 动画和高级效果](../css/07-animation.md)
- HTML 基础：[WEB-01 HTML 基础与语义化标签](../html/01-basics.md)、[WEB-02 HTML 表单、表格、媒体](../html/02-forms-tables-media.md)、[WEB-03 HTML SEO 与无障碍](../html/03-seo-a11y.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[CSS-10 Tailwind CSS](./02-tailwind.md)
