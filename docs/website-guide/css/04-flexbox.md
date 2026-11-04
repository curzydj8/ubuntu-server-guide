# CSS-04：Flexbox 完整教程

> 任务编号：CSS-04（网站建设与部署实战指南 · CSS 完整教程第 4 篇）
> 上一篇：[CSS-03 CSS 盒模型与定位](./03-box-position.md)；下一篇：[CSS-05 Grid 完整教程](./05-grid.md)。
> 本篇只讲 Flexbox（一维布局）：容器与项目、主轴与交叉轴、方向、对齐、换行、伸缩、间距、顺序，以及导航栏、卡片列表、侧边栏、居中四个实战。不讲 Grid（那是 CSS-05）、不讲响应式断点设计（CSS-06，换行加媒体查询的完整做法在那里讲，本篇只提一句）、不讲动画（那是 CSS-07）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 Flex 容器和 Flex 项目的区别，知道 `display: flex` 要写在父级上，不是写在子级上；
2. 分清主轴和交叉轴，知道 `flex-direction` 一改，两个轴的方向就跟着换；
3. 用 `justify-content` 控制主轴对齐，用 `align-items`、`align-self`、`align-content` 控制交叉轴对齐，并说出三者各管什么；
4. 用 `flex-wrap` 让项目换行，用 `flex-flow` 把方向和换行写在一行；
5. 用 `flex-grow`、`flex-shrink`、`flex-basis` 和 `flex` 简写控制项目“多出来的空间怎么分、不够时怎么缩、没分之前多大”；
6. 用 `gap` 做间距，并说出它和 `margin` 的区别；
7. 用 `order` 改视觉顺序，并知道它为什么不能滥用（读屏顺序和键盘顺序还是按 DOM 顺序走）；
8. 独立写出导航栏、卡片列表、侧边栏加主内容、水平垂直居中这四个最常见的布局。

## 2. 适用人群

- 已完成 CSS-01～CSS-03，知道选择器、优先级、单位、盒模型、定位，能写出简单规则的人；
- 布局还在用 `float`、用 `inline-block` 加 `margin` 硬凑、或者用绝对定位把每个块摆到固定位置的人；
- 想做导航栏、卡片墙、两栏布局、居中弹窗，但每次都要现查 Flex 写法的人。

## 3. 适用系统和版本

- 与 CSS-01～CSS-03 相同：Windows、macOS、Linux 均可，任意现代浏览器，任意纯文本编辑器。
- CSS 版本：CSS3 及之后的标准；`display: flex`、`gap` 在 Flex 容器里的支持在现代浏览器里都不需要加前缀，极老浏览器上的兼容问题本篇只在备注里提一句，不展开前缀表。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级）和 CSS-02（单位、颜色、边框），本篇的示例会直接用这些属性；
- 已完成 CSS-03（盒模型、`display`），知道 `block`、`inline`、`inline-block` 的区别，知道 `box-sizing: border-box` 的统一写法；
- 知道 HTML 的语义化骨架（WEB-01），能看懂示例里的 `header`、`nav`、`main`、`section`；
- 知道怎么保存 UTF-8 编码的 `.html` 文件。

## 5. 所需资源

- 一台能打开浏览器的电脑，一个练习文件夹（沿用 CSS-01～CSS-03 的练习文件夹即可）；
- 本篇第 10 节的完整代码；
- 可选：浏览器的开发者工具（按 F12），用来做第 14 节的“看主轴方向和项目尺寸”检查，没有也不影响前三项验证。

## 6. 技术原理

### 容器和项目：`display: flex` 写在父级上

Flexbox 的基本关系是“一父多子”：

- 给父级写 `display: flex`，这个父级就成了 **Flex 容器**；
- 它的直接子元素就成了 **Flex 项目**，隔了一层的孙子元素不是项目，不受容器控制；
- 容器上的属性管“整体怎么排”，项目上的属性管“自己怎么特殊处理”。

最常见的错误就是把 `display: flex` 写在子级上：子级自己成了容器，它的兄弟们还是按老办法排，布局一点没变。记住一句话：**想让谁排成一行，就给谁的父级写 `display: flex`**。

### 主轴和交叉轴：方向一改，两个轴就换位

Flex 布局有两个轴，永远互相垂直：

- **主轴**：项目排列的方向，默认是从左到右；
- **交叉轴**：和主轴垂直的方向，默认是从上到下。

`flex-direction` 决定主轴的方向，主轴一改，交叉轴就跟着换：

| `flex-direction` | 主轴方向 | 交叉轴方向 |
|---|---|---|
| `row`（默认值） | 从左到右 | 从上到下 |
| `row-reverse` | 从右到左 | 从上到下 |
| `column` | 从上到下 | 从左到右 |
| `column-reverse` | 从下到上 | 从左到右 |

所以 `justify-content` 永远管主轴，`align-items` 永远管交叉轴，不要死记“`justify-content` 是水平、`align-items` 是垂直”——方向一改成 `column`，`justify-content` 管的就是垂直方向了。这个换位是 Flex 新手最容易晕的地方，记住“主轴交叉轴跟着 `flex-direction` 走”就通了。

### 伸缩：多出来的空间怎么分，不够时怎么缩

Flex 项目的尺寸分三步算，理解了这三步，`flex` 就全通了：

1. **起步尺寸**：`flex-basis`，就是项目在分空间之前的“理想尺寸”，比如 `flex-basis: 200px` 是先按 200px 算，`flex-basis: auto` 是先按内容本身的大小算；
2. **有多余空间**：容器比所有项目起步尺寸之和还宽，多出来的空间按 `flex-grow` 的比例分，`flex-grow: 2` 的项目分到的就是 `flex-grow: 1` 的两倍，`flex-grow: 0` 的项目不参与分，分不到；
3. **空间不够**：容器比所有项目起步尺寸之和还窄，不够的部分按 `flex-shrink` 的比例缩，`flex-shrink: 0` 的项目不缩（比如侧边栏固定 200px 就不能缩），`flex-shrink: 1` 是默认值，会跟着缩。

`flex` 简写就是把这三个值写在一行，顺序固定是 `flex: grow shrink basis;`，比如 `flex: 1 1 200px`。常用的简写有三个，要记住各自的含义，不要只记数字：

- `flex: 1` 等于 `flex: 1 1 0%`：起步尺寸按 0 算，全靠按比例分空间，几个项目写 `flex: 1` 就是等分；
- `flex: none` 等于 `flex: 0 0 auto`：不伸不缩，起步尺寸就是内容本身大小，固定尺寸的侧边栏、固定宽度的按钮常用它；
- `flex: auto` 等于 `flex: 1 1 auto`：起步尺寸按内容算，多余空间再按比例分，内容长的项目起步就长，分完还是比别人长。

### 间距：`gap` 和 `margin` 不是一回事

`gap` 是写在容器上的行列间距，比如 `gap: 16px` 是项目之间横竖都隔 16px，`row-gap` 只管行间距，`column-gap` 只管列间距。`gap` 和 `margin` 的区别有两点：

- `gap` 只出现在项目之间，容器边缘不会多出一圈间距；`margin` 是每个项目自己带的外边距，写在第一个项目上会在容器边缘也留出间距，写在最后一个项目上同理，算起来容易多一圈；
- `gap` 不会合并，`margin` 在上下方向会合并（CSS-03 讲过），所以 Flex 布局里的间距用 `gap` 更可预测。

### 顺序：`order` 只改视觉顺序，不改 DOM 顺序

`order` 是写在项目上的数字，默认值是 0，数字越小越靠前，数字相同按 DOM 顺序排。比如三个项目 DOM 顺序是 A、B、C，给 C 写 `order: -1`，视觉上 C 就跑到最前面了。但要注意：**读屏软件读的顺序、键盘 Tab 走的顺序，仍然是 DOM 顺序**，不是视觉顺序。视觉上 C 在最前，读屏软件还是先读 A，这就造成“看到的顺序和听到的顺序不一致”，对无障碍不友好。所以 `order` 只在“视觉微调、且不影响理解顺序”的小范围用，不要靠它做大范围重排；真正需要换顺序的，先改 DOM 结构。

## 7. 架构说明

本篇完整示例的页面结构，仍然是 CSS-01～CSS-03 的骨架，只在 `main` 里加了五节，每节演示一组概念，最后四节是实战：

```text
header（标题）
nav.navbar（实战 1：导航栏，左右两端对齐）
main
├── section#axes（主轴与交叉轴：方向对照，row / row-reverse / column）
├── section#align（对齐：justify-content、align-items、align-self、align-content 对照）
├── section#grow-shrink（伸缩：flex-grow、flex-shrink、flex-basis、flex 简写对照）
├── section#order-gap（顺序与间距：order 视觉顺序、gap 与 margin 对照）
├── section#cards（实战 2：卡片列表，换行 + gap + 等分）
├── section#layout（实战 3：侧边栏 + 主内容，侧边栏固定、主内容自适应）
└── section#center（实战 4：居中，水平垂直都居中的盒子）
footer（页脚）
```

各节之间没有依赖关系，可以单独拿出来用：只要导航栏，就复制导航栏那一节；只要卡片列表，就复制卡片列表那一节。每一节内部也是独立的，删掉一节不影响另外几节。

## 8. 操作前检查

1. 练习文件夹里有 CSS-01～CSS-03 的练习文件，或者你新建了一个空文件夹，准备放本篇的 `flexbox.html`；
2. 编辑器保存编码是 UTF-8；
3. 如果你想做第 14 节的开发者工具检查，先确认按 F12 能打开开发者工具，找不到 Flex 面板也没关系，前三项验证不用它。

## 9. 逐步操作

1. 在练习文件夹里新建文件 `flexbox.html`；
2. 把第 10 节的完整代码从头到尾复制进去；
3. 保存，UTF-8，双击用浏览器打开，看第 13 节描述的效果是否出现；
4. 先看导航栏：站名是不是在左、链接是不是在右、上下是不是居中对齐了——三处都对，导航栏就通了；
5. 再看卡片列表：窗口窄一点时卡片是不是自动换行了、卡片之间是不是有均匀的间距、同一行的卡片是不是一样宽——三处都对，换行加 `gap` 加等分就通了；
6. 再看侧边栏：主内容区是不是把剩下的宽度都占满了、侧边栏是不是一直 200px 不缩——两处都对，`flex: 1` 和 `flex: none` 就通了；
7. 把导航栏的 `justify-content` 从 `space-between` 改成 `center`，保存刷新，看链接是不是都跑到中间去了；再改回去。这个练习是让你建立信心：对齐方式就是改一个值的事，不用改 HTML 结构；
8. 把顺序演示里 `order: -1` 那一项删掉，保存刷新，看它的视觉顺序是不是回到 DOM 顺序了；再加回去，顺序是不是又变了——这一步是让你亲眼看到 `order` 只改视觉顺序。

## 10. 完整代码

下面是本篇的完整示例，没有省略号，复制下来就是一个能打开的页面。存放位置：练习文件夹里的 `flexbox.html`，样式写在 `head` 里的 `<style>` 标签里，是内部引入方式。示例里用了颜色和边框做区分，颜色本身不是本篇重点，只要能看清每个项目的位置就行。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flexbox 完整示例</title>
  <style>
    html {
      box-sizing: border-box;
    }
    *, *::before, *::after {
      box-sizing: inherit;
    }
    body {
      color: #333333;
      font-size: 16px;
    }
    .demo-box {
      border: 1px solid #999999;
      padding: 8px;
      background-color: #d6eaf8;
    }
    .navbar {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      background-color: #1a5276;
      color: #ffffff;
      padding: 12px 16px;
    }
    .navbar-links {
      display: flex;
      gap: 16px;
    }
    .direction-row {
      display: flex;
      flex-direction: row;
      gap: 8px;
    }
    .direction-reverse {
      display: flex;
      flex-direction: row-reverse;
      gap: 8px;
    }
    .direction-column {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .align-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      height: 120px;
      border: 1px solid #999999;
    }
    .align-self-end {
      align-self: flex-end;
    }
    .align-multi {
      display: flex;
      flex-wrap: wrap;
      align-content: space-between;
      gap: 8px;
      height: 160px;
      border: 1px solid #999999;
    }
    .grow-row {
      display: flex;
      gap: 8px;
    }
    .grow-one {
      flex-grow: 1;
      flex-shrink: 1;
      flex-basis: 100px;
    }
    .grow-two {
      flex-grow: 2;
      flex-shrink: 1;
      flex-basis: 100px;
    }
    .shrink-fixed {
      flex-grow: 0;
      flex-shrink: 0;
      flex-basis: 160px;
    }
    .order-row {
      display: flex;
      gap: 8px;
    }
    .order-first {
      order: -1;
    }
    .order-last {
      order: 3;
    }
    .cards {
      display: flex;
      flex-flow: row wrap;
      justify-content: space-between;
      gap: 16px;
    }
    .card {
      flex: 1 1 200px;
      border: 2px solid #1a5276;
      padding: 16px;
      background-color: #f9e79f;
    }
    .layout {
      display: flex;
      gap: 16px;
    }
    .sidebar {
      flex: none;
      width: 200px;
      background-color: #d5f5e3;
      padding: 16px;
    }
    .main-content {
      flex: 1;
      background-color: #d6eaf8;
      padding: 16px;
    }
    .center-box {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 200px;
      border: 2px solid #1a5276;
    }
    .center-inner {
      background-color: #c0392b;
      color: #ffffff;
      padding: 16px;
    }
  </style>
</head>
<body>
  <header>
    <h1>Flexbox 完整示例</h1>
  </header>
  <nav class="navbar">
    <p>我的学习笔记站</p>
    <div class="navbar-links">
      <a href="#axes">主轴</a>
      <a href="#cards">卡片</a>
      <a href="#layout">侧边栏</a>
      <a href="#center">居中</a>
    </div>
  </nav>
  <main>
    <section id="axes">
      <h2>主轴与交叉轴：方向对照</h2>
      <div class="direction-row">
        <span class="demo-box">一</span>
        <span class="demo-box">二</span>
        <span class="demo-box">三</span>
      </div>
      <div class="direction-reverse">
        <span class="demo-box">一</span>
        <span class="demo-box">二</span>
        <span class="demo-box">三</span>
      </div>
      <div class="direction-column">
        <span class="demo-box">一</span>
        <span class="demo-box">二</span>
        <span class="demo-box">三</span>
      </div>
    </section>
    <section id="align">
      <h2>对齐对照</h2>
      <div class="align-row">
        <span class="demo-box">居中项</span>
        <span class="demo-box align-self-end">自己靠下</span>
      </div>
      <div class="align-multi">
        <span class="demo-box">第一行左</span>
        <span class="demo-box">第一行右</span>
        <span class="demo-box">第二行左</span>
        <span class="demo-box">第二行右</span>
      </div>
    </section>
    <section id="grow-shrink">
      <h2>伸缩对照</h2>
      <div class="grow-row">
        <span class="demo-box grow-one">grow 1，basis 100px</span>
        <span class="demo-box grow-two">grow 2，basis 100px，分到两倍空间</span>
        <span class="demo-box shrink-fixed">不伸不缩，固定 160px</span>
      </div>
    </section>
    <section id="order-gap">
      <h2>顺序与间距</h2>
      <div class="order-row">
        <span class="demo-box">DOM 第一项</span>
        <span class="demo-box order-first">DOM 第二项，order -1，视觉上跑到最前</span>
        <span class="demo-box order-last">DOM 第三项，order 3，视觉上跑到最后</span>
      </div>
    </section>
    <section id="cards">
      <h2>实战：卡片列表</h2>
      <div class="cards">
        <article class="card"><h3>卡片一</h3><p>换行加间距加等分，窗口窄了自动换行。</p></article>
        <article class="card"><h3>卡片二</h3><p>每张卡片起步 200px，多余空间按比例分。</p></article>
        <article class="card"><h3>卡片三</h3><p>同一行的卡片一样宽，不用算 margin。</p></article>
      </div>
    </section>
    <section id="layout">
      <h2>实战：侧边栏加主内容</h2>
      <div class="layout">
        <aside class="sidebar"><p>侧边栏，固定 200px，不伸不缩。</p></aside>
        <div class="main-content"><p>主内容，剩下的宽度全归它，窗口缩放时它跟着变。</p></div>
      </div>
    </section>
    <section id="center">
      <h2>实战：水平垂直居中</h2>
      <div class="center-box">
        <p class="center-inner">这个盒子水平垂直都居中，只用了两行对齐属性。</p>
      </div>
    </section>
  </main>
  <footer>
    <p>© 2026 Flexbox 完整示例</p>
  </footer>
</body>
</html>
```

## 11. 完整配置文件

本篇不需要服务器配置文件，也不需要构建工具。唯一的文件就是第 10 节的 `flexbox.html`，放在练习文件夹根目录。以后部署时，这个文件要和它引用的资源（如果以后加了背景图片）一起放到网站目录里，并且保持相对路径不变；本篇示例没有引用外部图片文件，所以不存在裂图问题。

## 12. 每个关键属性的解释

### 容器属性（写在父级上）

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `display: flex` | 把父级变成 Flex 容器，直接子元素变成 Flex 项目 | 写在子级上没用，想让谁排成一行就给谁的父级写 |
| `flex-direction: row` | 主轴从左到右（默认值），交叉轴从上到下 | 默认值就是 `row`，不写也是 `row`，不要以为不写就没有主轴 |
| `flex-direction: row-reverse` | 主轴从右到左，项目顺序视觉上反过来 | 只是视觉反过来，DOM 顺序、读屏顺序、Tab 顺序还是原来的，不要靠它做真正的重排 |
| `flex-direction: column` | 主轴从上到下，交叉轴从左到右 | 改成 `column` 后，`justify-content` 管的是垂直方向，`align-items` 管的是水平方向，不要按 `row` 时的直觉记 |
| `flex-direction: column-reverse` | 主轴从下到上 | 和 `row-reverse` 一样，只是视觉反过来，DOM 顺序不变 |
| `justify-content: flex-start` | 主轴起点对齐（默认，`row` 时是左对齐） | 默认值就是它，不写也是起点对齐 |
| `justify-content: center` | 主轴居中 | 居中只对主轴有效，想水平垂直都居中还要加 `align-items: center` |
| `justify-content: flex-end` | 主轴终点对齐（`row` 时是右对齐） | 和 `space-between` 混淆：`flex-end` 是全挤到终点，`space-between` 是两端贴边、中间均分 |
| `justify-content: space-between` | 两端贴边，中间间距均分 | 只有两个项目时就是一个贴左、一个贴右，中间没有项目分间距，不要误以为它会居中 |
| `justify-content: space-around` | 每个项目两侧间距相等，项目之间的间距是边缘间距的两倍 | 和 `space-evenly` 混淆：`space-around` 的边缘间距只有中间间距的一半 |
| `justify-content: space-evenly` | 所有间距（包括边缘）都相等 | 想要“包括边缘在内全相等”时用它，不要用 `space-around` 凑 |
| `align-items: stretch`（默认值） | 交叉轴拉伸，项目在交叉轴上占满容器 | 项目自己写了高度（`column` 时是宽度）就不会被拉伸，不要以为 `stretch` 总能拉满 |
| `align-items: flex-start` / `center` / `flex-end` | 交叉轴起点 / 居中 / 终点对齐 | `column` 时 `align-items: center` 是水平居中，不要按 `row` 时的直觉记 |
| `align-items: baseline` | 按第一行文字的基线对齐 | 字号不一样的几个项目想让文字底线对齐时用，平时少用 |
| `align-content: flex-start` / `center` / `space-between` 等 | 多行时，行与行之间在交叉轴上的对齐 | 只有换行后有多行时才生效，单行时写了也没用；取值和 `justify-content` 类似，只是管的是行与行之间 |
| `flex-wrap: nowrap`（默认值） | 不换行，项目再多也挤在一行，可能会溢出 | 默认不换行，卡片列表忘了写 `wrap` 就会溢出，不是 Flex 的 bug |
| `flex-wrap: wrap` | 换行，放不下就换到下一行 | 卡片列表、标签列表都要写它，否则窗口一窄就溢出 |
| `flex-wrap: wrap-reverse` | 换行，但行的顺序反过来 | 只是行的视觉顺序反过来，DOM 顺序不变，和 `row-reverse` 的注意事项一样 |
| `flex-flow` | `flex-direction` 和 `flex-wrap` 的简写，比如 `flex-flow: row wrap` | 顺序是方向在前、换行在后，写反了整条失效，新手建议先分开写 |
| `gap: 16px` | 项目之间的行列间距都是 16px | 只出现在项目之间，容器边缘不会多一圈 |
| `row-gap` / `column-gap` | 只管行间距 / 只管列间距 | 行列间距不一样时分开写，不要用两个 `gap` 互相覆盖 |
| `gap` 和 `margin` 的区别 | `gap` 写在容器上、只在项目之间、不合并；`margin` 写在项目自己身上、边缘也会留间距、上下会合并 | Flex 布局里的间距优先用 `gap`，不要用 `margin` 凑，凑出来的边缘间距和合并问题最难查 |

### 项目属性（写在子级上）

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `flex-grow: 0`（默认值） | 不参与分多余空间 | 忘了写 `flex-grow`，项目就不会伸，分到的空间还是起步尺寸 |
| `flex-grow: 1` / `2` | 按比例分多余空间，2 是 1 的两倍 | 比例是按 `flex-grow` 的值比的，不是按项目个数均分的，`grow: 2` 和 `grow: 1` 的两个项目不是一样宽 |
| `flex-shrink: 1`（默认值） | 空间不够时跟着缩 | 默认就是 1，不写也会缩，不要以为不写就不缩 |
| `flex-shrink: 0` | 空间不够时不缩 | 侧边栏、固定宽度按钮、图标都要写 0，否则窗口一窄就被压扁 |
| `flex-basis: auto`（默认值） | 起步尺寸按内容本身大小算 | `auto` 不是 0，内容长的项目起步就长，`flex: 1`（起步按 0 算）和 `flex: auto`（起步按内容算）分完的结果不一样 |
| `flex-basis: 200px` / `50%` | 起步尺寸固定值或按容器比例 | `flex-basis` 是“起步”，不是“最终”，最终还要经过伸缩，分完可能比起步大也可能比起步小 |
| `flex: 1` | 等于 `flex: 1 1 0%`，起步按 0 算，全靠比例分 | 几个项目都写 `flex: 1` 就是等分，但等分的前提是起步都是 0，内容长短不影响最终宽度 |
| `flex: none` | 等于 `flex: 0 0 auto`，不伸不缩，起步就是内容大小 | 固定侧边栏常用它，但侧边栏还要再写 `width: 200px`，光写 `flex: none` 不定宽，宽度还是由内容决定 |
| `flex: auto` | 等于 `flex: 1 1 auto`，起步按内容算，再按比例分多余空间 | 内容长的项目分完还是比别人长，想要严格等分不要用 `auto`，用 `flex: 1` |
| `flex` 简写的顺序 | 固定是 `grow shrink basis`，比如 `flex: 1 1 200px` | 顺序写错整条失效；只写一个数字时它是 `grow`，只写一个长度时它是 `basis`，不要混淆 |
| `align-self: auto`（默认值） | 跟容器的 `align-items` 走 | 默认值就是它，不写也是跟容器走 |
| `align-self: flex-start` / `center` / `flex-end` | 单个项目在交叉轴上的对齐，盖过容器的 `align-items` | 只对写了它的那一个项目生效，别的项目还是按容器走，不要以为它会改全行 |
| `order: 0`（默认值） | 视觉顺序，数字越小越靠前，相同按 DOM 顺序 | 只改视觉顺序，不改 DOM 顺序、读屏顺序、Tab 顺序，不要滥用；负数也可以写，`order: -1` 就是跑到最前 |

### 换行加媒体查询的说明（只提一句）

本篇的换行讲的是“容器窄了项目自动换行”，完整响应式做法（窗口到某个宽度时改方向、改列数、改间距）要配合媒体查询，那是 CSS-06 的内容，本篇不展开；不要以为只写 `flex-wrap: wrap` 就是做完了响应式。

## 13. 执行结果示例

双击打开后，你应该看到：

- 顶部导航栏：站名在左、四个链接在右、上下居中对齐，背景深蓝、文字白色；
- 主轴对照：第一组从左到右是一、二、三；第二组从右到左看过去也是一、二、三，但位置是反的（第一个格子是三）；第三组从上到下是一、二、三；
- 对齐对照：第一个框里两个项目都垂直居中，其中“自己靠下”那个贴着框的底边；第二个框里四项分两行，两行之间在垂直方向上是两端贴边；
- 伸缩对照：`grow 1` 和 `grow 2` 的两个项目起步都是 100px，但 `grow 2` 那个分到的多余空间是 `grow 1` 的两倍，所以明显更宽；固定 160px 那个不管窗口怎么变都是 160px；
- 顺序对照：视觉顺序是“DOM 第二项、DOM 第一项、DOM 第三项”，因为第二项写了 `order: -1`，第三项写了 `order: 3`；
- 卡片列表：三张卡片同一行、一样宽、之间有均匀间距，窗口窄到放不下三张时自动换行；
- 侧边栏布局：左侧侧边栏固定 200px，右侧主内容把剩下的宽度全占满，窗口缩放时主内容跟着变、侧边栏不动；
- 居中示例：一个 200px 高的框，里面的红色盒子水平垂直都居中。

如果你看到的效果是“所有项目都挤在一行溢出了”，先查卡片容器是不是写了 `flex-wrap: wrap`（或 `flex-flow: row wrap`）；如果你看到“导航栏链接不在右边”，先查导航栏容器是不是写了 `justify-content: space-between`。

## 14. 成功验证

按顺序做，全部通过才算本篇完成：

1. **文件验证**：`flexbox.html` 在练习文件夹里，双击能打开，不是 `.txt`；
2. **导航栏验证**：站名在左、链接在右、上下居中，三处都对；
3. **方向验证**：`row` 组从左到右、`row-reverse` 组视觉上反过来、`column` 组从上到下，三组都对；
4. **对齐验证**：居中框里的项目垂直居中，`align-self` 那个项目自己贴底，多行框的两行在垂直方向两端贴边；
5. **伸缩验证**：`grow 2` 的项目比 `grow 1` 的明显宽，固定 160px 的项目窗口缩放时宽度不变；
6. **顺序验证**：删掉 `order: -1`，视觉顺序回到 DOM 顺序；加回去，顺序又变了；
7. **卡片验证**：窗口窄到放不下三张卡片时自动换行，卡片之间间距均匀，同一行卡片一样宽；
8. **侧边栏验证**：侧边栏一直 200px 不缩，主内容把剩下宽度全占满；
9. **居中验证**：居中框里的红色盒子水平垂直都居中，只用了 `justify-content: center` 和 `align-items: center` 两行；
10. **开发者工具验证（可选）**：按 F12，选中导航栏容器，看样式面板里是不是有 `display: flex`、`justify-content: space-between`、`align-items: center`，再选中一个卡片，看是不是有 `flex: 1 1 200px`。

## 15. 常见错误

| 错误 | 现象 | 改法 |
|---|---|---|
| `display: flex` 写在子级上 | 布局一点没变，项目还是按老办法排 | 想让谁排成一行，就给谁的父级写 `display: flex` |
| 以为 `justify-content` 永远是水平、`align-items` 永远是垂直 | 改成 `column` 后对齐全乱了 | 记住主轴交叉轴跟着 `flex-direction` 走，`justify-content` 管主轴，`align-items` 管交叉轴 |
| 卡片列表忘了 `flex-wrap: wrap` | 窗口一窄卡片就溢出 | 卡片列表、标签列表都要写 `wrap`，或用 `flex-flow: row wrap` |
| `flex: 1` 和 `flex: auto` 混用 | 想要等分，结果内容长的卡片更宽 | 严格等分写 `flex: 1`（起步按 0 算），想按内容起步再分写 `flex: auto` |
| 固定侧边栏没写 `flex-shrink: 0` | 窗口一窄侧边栏被压扁 | 固定宽度的项目写 `flex: none` 或 `flex-shrink: 0`，再加 `width` |
| 只写 `flex: none` 不写 `width` | 侧边栏宽度由内容决定，不是想要的 200px | `flex: none` 只管不伸不缩，宽度还要单独写 `width: 200px` |
| 用 `margin` 做 Flex 间距 | 容器边缘多一圈间距，或上下间距合并 | 间距优先用 `gap`，不要用 `margin` 凑 |
| `align-content` 写在单行容器上 | 写了没反应 | `align-content` 只在多行时生效，单行时用 `align-items` |
| `order` 滥用做大范围重排 | 视觉顺序和读屏顺序、Tab 顺序不一致 | 真正需要换顺序先改 DOM 结构，`order` 只做小范围视觉微调 |
| `flex-basis` 当成最终宽度 | 分完的宽度和起步不一样，以为写错了 | `flex-basis` 是起步，最终还要经过伸缩，分完可能比起步大也可能比起步小 |
| `flex` 简写顺序写错 | 整条声明失效，项目回到默认尺寸 | 顺序固定是 `grow shrink basis`，只写一个数字是 `grow`，只写一个长度是 `basis` |
| 忘了 `align-items` 默认是 `stretch` | 项目被拉得和容器一样高，以为是 bug | 想要项目按内容高度排，写 `align-items: flex-start` 或 `center` |
| `gap` 和 `grid-gap` 混用 | 旧写法在 Flex 里不生效或被忽略 | Flex 里的间距写 `gap`（或 `row-gap` / `column-gap`），不要写 `grid-gap` |

## 16. 故障排查

- **布局完全没变**：先看 `display: flex` 是不是写在了父级上，再看选择器是不是选中了父级（类名、ID 有没有写错一个字母），再看样式是不是写进了 `<style>` 里且 `<style>` 在 `head` 里。
- **项目溢出容器**：先看是不是忘了 `flex-wrap: wrap`，再看是不是某个项目写了 `flex-shrink: 0` 又写了固定宽度、几个固定宽度加起来超过了容器，再看是不是 `min-width` 把项目撑住了（Flex 项目默认 `min-width: auto`，内容很长时不会自动缩到比内容还小，必要时写 `min-width: 0`）。
- **对齐和预想的不一样**：先确认 `flex-direction` 是什么，再按“`justify-content` 管主轴、`align-items` 管交叉轴”重新算一遍，不要按 `row` 时的直觉去套 `column`。
- **卡片宽度不一样**：先看是不是用了 `flex: auto`（起步按内容算），想等分就改成 `flex: 1`；再看是不是某个卡片内容特别长，把起步撑大了。
- **侧边栏被压扁**：先看是不是忘了 `flex-shrink: 0`，再看 `width` 是不是写在了侧边栏自己身上而不是容器上。
- **顺序改了但读屏顺序没变**：这不是 bug，是 `order` 本来就只改视觉顺序，读屏和 Tab 还是按 DOM 顺序，想改读屏顺序必须改 DOM 结构。
- **改了 CSS 刷新没变**：确认保存了，再按 Ctrl+F5 强制刷新，排除浏览器缓存。

## 17. 安全注意事项

- Flexbox 本身没有直接的安全风险，但 `order` 造成的“视觉顺序和读屏顺序不一致”是一个无障碍问题：不要用 `order` 把“确认”“提交”这类关键按钮在视觉上调到前面、而 DOM 里还在后面，用户按 Tab 走到的顺序会和看到的顺序不一致，容易点错。
- `display: none` 的 Flex 项目不显示也不占位置，不要把重要提示、错误信息、操作按钮藏在 `display: none` 的项目里，用户和读屏软件都看不到它。
- 不要把真实用户的隐私信息写进示例代码里，占位文字就够了。

## 18. 回滚和恢复

本篇和 CSS-01～CSS-03、WEB 系列一样，没有服务器、没有数据库、没有配置改动，回滚就是：

- 改错了：编辑器里 Ctrl+Z 撤销，或把第 10 节的完整代码重新复制覆盖一次；
- 布局改乱了：把容器的 `display` 改回 `block`，项目就回到正常文档流，再一步一步加 Flex 属性；
- 文件删错了：重新新建 `flexbox.html`，把第 10 节代码再贴一遍；
- 没有任何线上内容会被影响，因为本篇文件只在你的练习文件夹里，还没有部署到 crozz.me。

## 19. 延伸阅读

- MDN Flexbox 入门：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flexible_box_layout
- MDN `display: flex`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/display
- MDN `flex` 简写：https://developer.mozilla.org/zh-CN/docs/Web/CSS/flex
- MDN `justify-content`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/justify-content
- MDN `align-items`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/align-items

## 20. 相关章节链接

- 上一篇：[CSS-03 CSS 盒模型与定位](./03-box-position.md)
- 再往前：[CSS-01 CSS 基础语法与选择器](./01-basics.md)、[CSS-02 CSS 单位与颜色、字体、背景、边框](./02-units-colors.md)、[WEB-03 HTML SEO 与无障碍](../html/03-seo-a11y.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[CSS-05 Grid 完整教程](./05-grid.md)
- 再往后：CSS-06 响应式设计、CSS-07 动画与高级效果（都在任务索引里，顺序见路线图）
