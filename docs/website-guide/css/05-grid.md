# CSS-05：Grid 完整教程

> 任务编号：CSS-05（网站建设与部署实战指南 · CSS 完整教程第 5 篇）
> 上一篇：[CSS-04 Flexbox 完整教程](./04-flexbox.md)；下一篇：[CSS-06 响应式设计](./06-responsive.md)。
> 前置：CSS-01 基础语法与选择器、CSS-02 单位与颜色、CSS-03 盒模型与定位；Flex 的一维排列在 CSS-04 讲，本篇只讲 Grid 与 Flex 的分工，不展开 Flex 的细节。
> 本篇只讲 Grid 布局，不讲动画（那是 CSS-07），不讲响应式断点设计（那是 CSS-06，本篇只讲 `auto-fit` / `minmax` 的自适应，不展开媒体查询）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 Grid 是什么、它和 Flex 的分工：二维布局用 Grid，一维排列用 Flex；
2. 用 `grid-template-columns` / `grid-template-rows`、`fr`、`repeat()`、`minmax()` 定义行和列；
3. 用 `grid-template-areas` + `grid-area` 做命名区域布局，画出后台管理系统那种顶栏 + 侧栏 + 主内容 + 页脚；
4. 用 `gap` 控制行列间距，用 `grid-column` / `grid-row` 做跨列跨行；
5. 分清 `auto-fit` 和 `auto-fill`，用 `repeat(auto-fit, minmax(...))` 做出列数随宽度自适应的卡片网格；
6. 说清楚隐式网格（`grid-auto-rows`、`grid-auto-flow`）和对齐（容器级与项目级的区别）；
7. 从零搭出两个实战：后台管理系统布局、卡片网格。

## 2. 适用人群

- 已完成 CSS-01、CSS-02、CSS-03，知道选择器、单位、盒模型，能写出简单规则的人；
- 做过“顶栏 + 侧栏 + 主内容”或“卡片墙”，但一直用浮动、`inline-block` 或多层嵌套硬凑的人；
- 听说过 Grid，但分不清它和 Flex 该用哪个、什么时候该用哪个的人。

## 3. 适用系统和版本

- 与 CSS-01、CSS-02、CSS-03 相同：Windows、macOS、Linux 均可，任意现代浏览器，任意纯文本编辑器。
- CSS 版本：CSS Grid Layout Level 1，现代浏览器全部支持，不需要加浏览器前缀；极老浏览器（IE 时代的旧 Grid 语法）不在本篇范围内，不要用老语法写新项目。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级）和 CSS-02（单位、颜色、边框、背景），本篇的示例会直接用这些属性；
- 已完成 CSS-03（盒模型），知道 `box-sizing: border-box` 的统一写法，示例里会沿用它；
- 知道 HTML 的语义化骨架（WEB-01），能看懂示例里的 `header`、`nav`、`main`、`aside`、`footer`；
- 知道怎么保存 UTF-8 编码的 `.html` 文件。

## 5. 所需资源

- 一台能打开浏览器的电脑，一个练习文件夹（沿用 CSS-01～CSS-03 的练习文件夹即可）；
- 本篇第 10 节的完整代码；
- 可选：浏览器的开发者工具（按 F12），用来做第 14 节的“看网格线”检查，Firefox 和 Chrome 的开发者工具里都有 Grid 布局检查器，没有也不影响前三项验证。

## 6. 技术原理

### Grid 是什么：先画格子，再把项目放进格子

Grid 的思路和 Flex 正好反过来：Flex 是先有一排项目，再想办法让它们排得好看；Grid 是先在父级上画好行和列的格子，再把每个子项目放进指定的格子。

关键概念只有四个，记住了后面全通了：

- **容器（Grid Container）**：写了 `display: grid` 的那个父级元素。Grid 的所有布局属性都写在容器上，`display: grid` 本身也写在容器上，不是写在项目上——这是新手最常见的错误，把 `display: grid` 写到项目上，网格就永远出不来。
- **项目（Grid Item）**：容器的直接子元素。注意是“直接子元素”，隔了一层的孙子元素不是项目，除非那个子元素自己又是一个 Grid 容器。
- **轨道（Track）**：一行或一列，就是 `grid-template-columns` / `grid-template-rows` 定义出来的那一条条行和列。
- **网格线（Grid Line）**：行和列之间的分隔线，从 1 开始编号，也可以从 -1 倒着数（-1 是最后一条线）。`grid-column: 1 / -1` 的意思就是“从第 1 条线横跨到最后一条线”，也就是占满整行。

### Grid 与 Flex 的分工：二维用 Grid，一维用 Flex

这句话是本篇最重要的选型结论，记住它，以后就不会纠结：

- **二维布局用 Grid**：同时要管行和列的布局，比如后台管理系统（顶栏、侧栏、主内容、页脚，行和列都要定）、卡片墙（几行几列都要定）、整体页面骨架。
- **一维排列用 Flex**：只管一行或一列的排列，比如导航栏里几个链接横着排、按钮组横着排、卡片内部标题和按钮竖着排。

两者不是对立的，是配合的：一个 Grid 项目内部，经常又是一个 Flex 容器（比如卡片里的内容用 Flex 竖着排）；一个 Flex 项目内部，也可以是一个 Grid 容器。判断标准只有一个：这个布局要不要同时定行和列？要，就用 Grid；只要一排，就用 Flex。

### 显式网格与隐式网格

- **显式网格**：你用 `grid-template-columns` / `grid-template-rows` 明确定义出来的行和列。
- **隐式网格**：项目比显式网格的格子多时，浏览器自动补出来的行和列。补出来的行高、列宽由 `grid-auto-rows` / `grid-auto-columns` 控制，补的方向由 `grid-auto-flow` 控制（默认是按行补，`column` 是按列补）。

隐式网格不是错误，是 Grid 的正常机制：卡片数量不固定时，你不可能提前把每一行都写死，浏览器自动补行就是为这种情况准备的。

### 对齐：容器级管整体，项目级管单个

对齐分两个层面，不要混用：

- **容器级**：`justify-content`（整组轨道在水平方向怎么放）、`align-content`（整组轨道在垂直方向怎么放），管的是“所有格子作为一个整体，在容器里靠左、居中还是分散”。
- **项目级**：`justify-items` / `align-items`（容器上写，管所有项目）、`justify-self` / `align-self`（项目上写，只管自己一个），管的是“项目在它自己的格子里怎么放”。

一句话记：`content` 管整组，`items` / `self` 管单个；`justify` 管水平（主轴是行方向时），`align` 管垂直。`justify-content` 和 `justify-items` 只差一个词，作用完全不同，排查对齐问题时先看你写的是哪个。

## 7. 架构说明

本篇完整示例的页面结构，仍然是 CSS-01～CSS-03 的骨架，只在 `main` 里加了三节，每节演示一组 Grid 用法：

```text
header（标题）
main
├── section#admin（实战一：后台管理系统布局）
│   └── div.admin-layout（Grid 容器，grid-template-areas 命名区域）
│       ├── header.admin-header（grid-area: header）
│       ├── nav.admin-sidebar（grid-area: sidebar）
│       ├── main.admin-main（grid-area: main）
│       └── footer.admin-footer（grid-area: footer）
├── section#cards（实战二：卡片网格）
│   └── div.card-grid（Grid 容器，repeat(auto-fit, minmax(200px, 1fr))）
│       └── 6 个 div.card（Grid 项目，数量可增减，列数随宽度自适应）
└── section#span（跨列跨行与隐式网格演示）
    └── div.span-grid（Grid 容器，显式 3 列 + 隐式行高 + 跨列跨行项目）
footer（页脚）
```

三节之间没有依赖关系，可以单独拿出来用：只要后台布局，就复制后台那一节；只要卡片墙，就复制卡片那一节。每一节内部也是独立的，删掉一节不影响另外两节。

注意一个细节：后台布局那一节里，`header`、`nav`、`main`、`footer` 是 `div.admin-layout` 的直接子元素，所以它们才是 Grid 项目；如果在它们外面再包一层 `div`，那层 `div` 才是项目，布局就全变了——Grid 只认直接子元素，这一点在写结构时就要想好。

## 8. 操作前检查

1. 练习文件夹里有 CSS-01～CSS-03 的练习文件，或者你新建了一个空文件夹，准备放本篇的 `grid.html`；
2. 编辑器保存编码是 UTF-8；
3. 如果你想做第 14 节的开发者工具检查，先确认按 F12 能打开开发者工具，找不到 Grid 检查器也没关系，前三项验证不用它。

## 9. 逐步操作

1. 在练习文件夹里新建文件 `grid.html`；
2. 把第 10 节的完整代码从头到尾复制进去；
3. 保存，UTF-8，双击用浏览器打开，看第 13 节描述的效果是否出现；
4. 先看后台布局那一节：顶栏是不是占满一行，侧栏是不是在左边，主内容是不是在右边，页脚是不是在最下面——四个区域位置都对，才算命名区域写对了；
5. 再看卡片那一节：把浏览器窗口从宽拖到窄，看卡片列数是不是从 3 列变成 2 列、再变成 1 列——列数跟着宽度变，就是 `auto-fit` + `minmax` 在起作用；
6. 把卡片从 6 张删到 4 张，再加到 8 张，保存刷新，看网格是不是自动补行、没有留白错位——行数跟着数量变，就是隐式网格在起作用；
7. 把后台布局里的 `grid-template-areas` 某一行的名字拼错一个字母（比如把 `sidebar` 写成 `sideba`），保存刷新，看侧栏是不是跑到奇怪的位置去了；再改回来。这个练习是让你建立信心：区域名字拼错，项目就找不到自己的格子，排查时先查名字拼写。

## 10. 完整代码

下面是本篇的完整示例，没有省略号，复制下来就是一个能打开的页面。存放位置：练习文件夹里的 `grid.html`，样式写在 `head` 里的 `<style>` 标签里，是内部引入方式。示例里用了颜色和边框做区分，颜色本身不是本篇重点，只要能看清每个格子的边界就行。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS Grid 完整示例</title>
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
    .admin-layout {
      display: grid;
      grid-template-columns: 200px 1fr;
      grid-template-rows: 60px 1fr 50px;
      grid-template-areas:
        "header header"
        "sidebar main"
        "footer footer";
      gap: 12px;
    }
    .admin-header {
      grid-area: header;
      background-color: #1a5276;
      color: #ffffff;
    }
    .admin-sidebar {
      grid-area: sidebar;
      background-color: #d6eaf8;
    }
    .admin-main {
      grid-area: main;
      background-color: #fef9e7;
    }
    .admin-footer {
      grid-area: footer;
      background-color: #d5f5e3;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      grid-template-rows: auto;
      gap: 16px;
      justify-items: stretch;
      align-items: start;
      justify-content: start;
      align-content: start;
    }
    .card {
      border: 2px solid #1a5276;
      padding: 16px;
      background-color: #eaf2f8;
    }
    .span-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: 80px 80px;
      grid-auto-rows: 80px;
      grid-auto-flow: row;
      gap: 10px;
    }
    .span-wide {
      grid-column: 1 / -1;
      grid-row: 1 / 2;
      background-color: #f9e79f;
    }
    .span-tall {
      grid-column: 1 / 2;
      grid-row: 2 / 4;
      background-color: #d5f5e3;
    }
    .span-cell {
      background-color: #d6eaf8;
    }
  </style>
</head>
<body>
  <header>
    <h1>Grid 完整示例</h1>
    <p>本页演示后台管理系统布局、卡片网格、跨列跨行与隐式网格。</p>
  </header>
  <main>
    <section id="admin">
      <h2>实战一：后台管理系统布局</h2>
      <div class="admin-layout">
        <header class="admin-header">顶栏：系统名称与用户信息</header>
        <nav class="admin-sidebar">侧栏：菜单一、菜单二、菜单三</nav>
        <main class="admin-main">主内容：这里是后台的主要工作区，宽度随窗口自适应。</main>
        <footer class="admin-footer">页脚：版权与版本信息</footer>
      </div>
    </section>
    <section id="cards">
      <h2>实战二：卡片网格</h2>
      <div class="card-grid">
        <div class="card">卡片一：标题与简介</div>
        <div class="card">卡片二：标题与简介</div>
        <div class="card">卡片三：标题与简介</div>
        <div class="card">卡片四：标题与简介</div>
        <div class="card">卡片五：标题与简介</div>
        <div class="card">卡片六：标题与简介</div>
      </div>
    </section>
    <section id="span">
      <h2>跨列跨行与隐式网格</h2>
      <div class="span-grid">
        <div class="span-wide">通栏：横跨整行，从第 1 条线到最后一条线。</div>
        <div class="span-tall">通列：纵跨两行，从第 2 行到第 4 行。</div>
        <div class="span-cell">普通格子</div>
        <div class="span-cell">普通格子</div>
        <div class="span-cell">普通格子</div>
        <div class="span-cell">普通格子</div>
      </div>
    </section>
  </main>
  <footer>
    <p>© 2026 Grid 完整示例</p>
  </footer>
</body>
</html>
```

## 11. 完整配置文件

本篇不需要服务器配置文件，也不需要构建工具。唯一的文件就是第 10 节的 `grid.html`，放在练习文件夹根目录。以后部署时，这个文件要和它引用的资源（如果以后加了背景图片）一起放到网站目录里，并且保持相对路径不变；本篇示例没有引用外部图片文件，所以不存在裂图问题。

## 12. 每个关键属性的解释

### 容器：定义网格

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `display: grid` | 把元素变成 Grid 容器，它的所有直接子元素变成 Grid 项目 | 写在项目上不生效，必须写在父级上；`display: inline-grid` 是行内容器的版本，容器本身不独占一行，布局场景少，本篇只用 `grid` |
| `grid-template-columns` | 定义列：个数、宽度，值之间用空格分隔 | 列数就是值的个数，`200px 1fr` 是 2 列，`1fr 1fr 1fr` 是 3 列；漏写一个值就少一列，项目会被挤到隐式网格里 |
| `grid-template-rows` | 定义行：个数、高度，值之间用空格分隔 | 行数就是值的个数；行高写 `auto` 是按内容撑开，写固定值是固定高度；后台布局里顶栏 60px、页脚 50px、中间 `1fr` 就是“上下固定、中间自适应” |
| `fr`（fraction，份数） | 剩余空间的份数，`1fr` 是 1 份，`2fr` 是 2 份 | `fr` 分的是“扣掉固定列宽、间距之后的剩余空间”，不是总宽度；`200px 1fr` 里，`1fr` 是总宽减 200px 再减间距后剩下的全部，不是总宽的一半 |
| `repeat()` | 重复写相同的轨道，`repeat(3, 1fr)` 等于 `1fr 1fr 1fr` | 第一个参数是次数，第二个参数是轨道定义；`repeat(auto-fit, ...)` 里的 `auto-fit` 不是次数，是“按容器宽度自动算列数”，见下文 |
| `minmax(min, max)` | 轨道尺寸的下限和上限，`minmax(200px, 1fr)` 是“至少 200px，最多 1 份” | 下限大于上限就无效，比如 `minmax(300px, 1fr)` 在窄容器里会溢出，要先算好下限在窄屏下还放不放得下 |
| `grid-template-areas` | 用名字画区域图，每行一个字符串，每列一个名字，空格分隔 | 每行的名字个数必须和列数一致，少一个名字那一行就对不齐；想留空格子用 `.`（点）占位，不要空着 |
| `grid-area` | 项目声明自己属于哪个命名区域，值就是 `grid-template-areas` 里的名字 | 名字拼错一个字母，项目就找不到区域，会被放到自动位置，看起来像“跑偏了”，排查时先对名字拼写 |
| `gap` / `row-gap` / `column-gap` | 行列间距，`gap: 12px` 是行列都是 12px，`gap: 10px 20px` 是行 10px、列 20px | `gap` 是轨道之间的间距，不是项目的外边距；用 `margin` 做间距会在边缘多出一圈，用 `gap` 不会，这是 Grid 布局比浮动布局干净的原因之一 |
| `grid-auto-rows` / `grid-auto-columns` | 隐式网格的行高 / 列宽，项目超出显式网格时，补出来的行列就按这个尺寸 | 不写 `grid-auto-rows`，隐式行高默认是 `auto`（按内容撑开），行高参差不齐时要显式写一个固定值或 `minmax` |
| `grid-auto-flow` | 隐式网格的补方向，`row` 按行补（默认），`column` 按列补，`dense` 是“尽量填满空位” | `dense` 会打乱项目的视觉顺序（后面的项目可能填到前面的空位里），无障碍上读屏顺序和视觉顺序可能不一致，慎用 |

### 项目：放进格子

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `grid-column` | 项目占哪几列，`grid-column: 1 / 3` 是从第 1 条线到第 3 条线，占第 1、2 列 | 线号和列号差 1：3 列有 4 条线，`1 / 3` 是占 2 列，不是占 3 列；数线不要数列 |
| `grid-row` | 项目占哪几行，和 `grid-column` 同理 | 同上，行号和线号差 1 |
| `grid-column: 1 / -1` | 从第 1 条线到最后一条线，占满整行 | `-1` 是最后一条线，不是最后一列；写 `1 / -1` 是通栏的常用写法，不用数总共有几列 |
| `grid-column: span 2` / `grid-row: span 2` | 从当前位置起跨 2 列 / 2 行，不用算线号 | `span` 是“跨几格”，不是“到第几条线”，和 `1 / 3` 的写法不要混用 |
| `justify-self` / `align-self` | 单个项目在自己格子里的水平 / 垂直对齐，只管自己一个 | 和容器级的 `justify-items` / `align-items` 混淆：`items` 是容器上写、管所有项目，`self` 是项目上写、只管自己；项目上写的会盖过容器上的 |

### 对齐：容器级与项目级

| 属性 | 写在哪 | 管什么 | 容易错的地方 |
|---|---|---|---|
| `justify-content` | 容器 | 整组轨道在水平方向的分布：`start` 靠左、`center` 居中、`space-between` 两端对齐、`space-around` / `space-evenly` 均匀分布 | 轨道已经占满容器宽度时，`justify-content` 看不出效果，因为没有剩余空间可分；要留出剩余空间（比如轨道总宽小于容器）才看得到 |
| `align-content` | 容器 | 整组轨道在垂直方向的分布，值和 `justify-content` 同理 | 同上，轨道已经占满容器高度时看不出效果 |
| `justify-items` | 容器 | 所有项目在各自格子里的水平对齐：`start`、`center`、`end`、`stretch`（拉伸填满，默认值） | `stretch` 时项目会被拉满格子宽，项目自己写了固定宽度就拉不开了，排查时先看项目宽度 |
| `align-items` | 容器 | 所有项目在各自格子里的垂直对齐，值和 `justify-items` 同理 | 同上，项目自己写了固定高度就拉不开了 |
| `justify-self` / `align-self` | 项目 | 单个项目的对齐，盖过容器级的 `items` | 只在某个项目想特殊处理时写，不要每个项目都写一遍，通用规则写在容器上 |

### `auto-fit` 与 `auto-fill`：只差一个词，效果差很多

| 写法 | 行为 | 适用场景 |
|---|---|---|
| `repeat(auto-fit, minmax(200px, 1fr))` | 列数按容器宽度自动算，空列会被折叠掉，剩下的列拉伸填满整行 | 卡片墙：卡片只有 2 张时，2 张卡片拉伸填满整行，不留空白列 |
| `repeat(auto-fill, minmax(200px, 1fr))` | 列数按容器宽度自动算，空列也会保留，剩下的列保持原宽，行尾留白 | 占位网格：想让卡片保持固定宽度、行尾留白时用，卡片墙一般不用它 |

一句话记：`fit` 是“合身”，空列折叠、剩下列拉满；`fill` 是“填满格子数”，空列也占着、不拉伸。卡片网格九成场景用 `auto-fit`，本篇的实战二就是 `auto-fit`。

## 13. 执行结果示例

双击打开后，你应该看到（没有复杂样式，所以还是朴素的上下排列，区域位置和列数对了就是成功）：

- 后台布局那一节：顶栏是一条深蓝横条占满一行，侧栏在左边 200px 宽，主内容在右边占剩余宽度，页脚在最下面占满一行，四个区域之间有 12px 间距；
- 卡片那一节：6 张卡片排成网格，宽窗口下是 3 列，窗口拖窄后变成 2 列，再窄变成 1 列，卡片之间有 16px 间距；
- 跨列跨行那一节：第一行是一条通栏（占满整行），第二行起左边是一个纵跨两行的色块，右边是几个普通格子，格子之间有 10px 间距；
- 把浏览器窗口从宽拖到窄，卡片列数跟着变，后台布局的主内容宽度跟着变，顶栏和页脚始终占满一行。

如果你看到后台布局的四个区域是竖着一列排下来的，先查 `display: grid` 是不是写在了 `div.admin-layout` 上，而不是写在了某个项目上；如果你看到卡片列数不变，先查 `grid-template-columns` 是不是写成了固定列数（比如 `1fr 1fr 1fr`），而不是 `repeat(auto-fit, minmax(200px, 1fr))`。

## 14. 成功验证

按顺序做，全部通过才算本篇完成：

1. **文件验证**：`grid.html` 在练习文件夹里，双击能打开，不是 `.txt`；
2. **后台布局验证**：顶栏占满一行，侧栏在左、主内容在右、页脚在最下面，四个区域位置都对；
3. **区域名字验证**：把 `grid-template-areas` 里一个名字拼错，侧栏位置跑偏；改回来，位置恢复——这一步证明命名区域确实是靠名字对上号的；
4. **卡片自适应验证**：浏览器窗口从宽拖到窄，卡片列数从 3 列变成 2 列、再变成 1 列；
5. **数量自适应验证**：卡片从 6 张删到 4 张，再加到 8 张，网格自动补行，没有留白错位；
6. **跨列跨行验证**：通栏确实占满整行，通列确实纵跨两行，不是只占一格；
7. **开发者工具验证（可选）**：按 F12，选中卡片网格容器，看开发者工具的 Grid 检查器里画出的网格线是不是和你写的列数一致，线号是不是从 1 开始数。

## 15. 常见错误

| 错误 | 现象 | 改法 |
|---|---|---|
| `display: grid` 写在项目上 | 网格出不来，项目还是竖着排 | `display: grid` 写在父级容器上，项目上只写 `grid-column`、`grid-area` 等项目属性 |
| 列数和 `grid-template-areas` 每行名字个数对不上 | 某一行区域错位，项目跑到奇怪位置 | 每行名字个数必须等于列数，少了补 `.` 占位，多了删掉 |
| 区域名字拼错 | 项目找不到区域，被放到自动位置，看起来跑偏了 | `grid-area` 的值和 `grid-template-areas` 里的名字一个字母一个字母对 |
| 线号和列号混淆 | `grid-column: 1 / 3` 以为占 3 列，实际只占 2 列 | 线比列多 1 条，`1 / 3` 是占第 1、2 列；想占满整行用 `1 / -1`，不用数列数 |
| `auto-fit` 和 `auto-fill` 用反 | 卡片只有 2 张时，行尾留了一大片空白（用了 `fill`），或卡片被拉得过宽（用了 `fit` 但下限太小） | 卡片墙一般用 `auto-fit`；想保持固定宽度、行尾留白时才用 `auto-fill` |
| `minmax` 下限太大 | 窄屏下卡片溢出容器，出现横向滚动条 | 下限按窄屏下还能放得下的宽度算，比如 200px，不要写 400px |
| `gap` 当成 `margin` 用 | 边缘多出一圈间距，或间距算不准 | 间距用 `gap`，不要给每个项目加 `margin`；`gap` 只在轨道之间，不在边缘 |
| `justify-content` 和 `justify-items` 混用 | 想让整组居中，结果是每个项目在格子里居中，或反过来 | 整组分布用 `content`，单个项目对齐用 `items` / `self`，先看你想动的是整组还是单个 |
| `justify-self` 写在容器上 | 不生效，因为 `self` 是项目属性 | `self` 写在项目上，`items` 写在容器上 |
| 隐式行高没写，行高参差不齐 | 卡片行高一高一矮，网格看起来乱 | 显式写 `grid-auto-rows`，比如 `80px` 或 `minmax(80px, auto)`，让补出来的行高一致 |
| `grid-auto-flow: dense` 打乱顺序 | 视觉顺序和读屏顺序不一致，无障碍上出问题 | 不要轻易用 `dense`，除非你确认视觉顺序打乱后读屏顺序还能接受 |
| 用 Grid 做一维排列 | 导航栏几个链接用 Grid 写，代码比 Flex 繁琐，还容易错 | 只管一排的布局用 Flex，Grid 留给二维布局，见第 6 节的分工 |

## 16. 故障排查

- **网格出不来，全是竖排**：先看 `display: grid` 是不是写在容器上，再看容器是不是真的包住了那些项目（中间是不是多包了一层 `div`，导致直接子元素只有一个）。
- **区域位置跑偏**：先对 `grid-template-areas` 每行名字个数和列数，再对 `grid-area` 名字拼写，两个都对了位置就对了。
- **列数不对**：先数 `grid-template-columns` 里值的个数，再看是不是写成了固定列数而不是 `auto-fit`，再看容器宽度是不是被父级限制住了。
- **卡片溢出容器**：先看 `minmax` 下限是不是太大，再看项目是不是写了固定宽度大于格子宽，再看 `box-sizing` 是不是 `border-box`（CSS-03 的统一写法）。
- **间距不对**：先看是不是 `gap` 和 `margin` 混用了，再看 `gap` 的两个值顺序是不是行在前、列在后（`gap: 行 列`）。
- **对齐没效果**：先分清是整组还是单个：整组用 `justify-content` / `align-content`，单个用 `justify-items` / `align-items` / `self`；再看有没有剩余空间可分（轨道占满容器时 `content` 类属性看不出效果）。
- **跨列跨行没跨上**：先数线号（线比列多 1），再看是不是写成了列号，再看项目是不是被别的项目占了格子（Grid 自动放置会跳过已被占的格子）。
- **改了 CSS 刷新没变**：确认保存了，再按 Ctrl+F5 强制刷新，排除浏览器缓存。

## 17. 安全注意事项

- Grid 布局本身没有直接的安全风险，但 `grid-auto-flow: dense` 打乱视觉顺序后，读屏顺序和视觉顺序可能不一致，这是无障碍问题，不要轻易用，见第 15 节。
- 用 Grid 做弹窗、遮罩层时，`z-index` 很大的元素可以盖住页面上的重要按钮（比如“取消”“关闭”），不要用超大 `z-index` 盖住用户必须能点的按钮，CSS-03 第 17 节讲过这个原则。
- 不要把真实用户的隐私信息写进示例代码里，占位文字就够了。

## 18. 回滚和恢复

本篇和 CSS-01～CSS-03、WEB 系列一样，没有服务器、没有数据库、没有配置改动，回滚就是：

- 改错了：编辑器里 Ctrl+Z 撤销，或把第 10 节的完整代码重新复制覆盖一次；
- 布局改乱了：把容器的 `display` 改回 `block`，项目就回到正常文档流，再一步一步加 Grid 属性；
- 文件删错了：重新新建 `grid.html`，把第 10 节代码再贴一遍；
- 没有任何线上内容会被影响，因为本篇文件只在你的练习文件夹里，还没有部署到 crozz.me。

## 19. 延伸阅读

- MDN Grid 布局入门：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout
- MDN `display: grid`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/display
- MDN `grid-template-areas`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/grid-template-areas
- MDN `grid-auto-flow`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/grid-auto-flow
- MDN 对齐（Grid 与 Flex 通用）：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_box_alignment

## 20. 相关章节链接

- 前置：[WEB-03 HTML SEO 与无障碍](../html/03-seo-a11y.md)、[CSS-01 CSS 基础语法与选择器](./01-basics.md)、[CSS-02 CSS 单位与颜色、字体、背景、边框](./02-units-colors.md)、[CSS-03 CSS 盒模型与定位](./03-box-position.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[CSS-06 响应式设计](./06-responsive.md)
- 再往后：CSS-07 动画和高级效果、JS-01 JavaScript 基础（都在任务索引里，顺序见路线图）
