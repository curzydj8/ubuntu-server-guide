# CSS-03：CSS 盒模型与定位

> 任务编号：CSS-03（网站建设与部署实战指南 · CSS 完整教程第 3 篇）
> 上一篇：[CSS-02 CSS 单位与颜色、字体、背景、边框](./02-units-colors.md)；下一篇（待开始）：CSS-04 Flexbox 完整教程。
> 本篇只讲盒模型与定位：内容、内边距、边框、外边距、`box-sizing`、`display`、外边距合并、浮动、溢出、`position`、`z-index`、层叠上下文。不讲 Flex 和 Grid 的布局细节（那是 CSS-04、CSS-05），不讲响应式断点（那是 CSS-06）。边框本身的写法在 CSS-02 已经讲过，本篇只讲边框在盒模型里占的那一层，不重复讲边框样式。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 画出任何一个元素的盒模型四层图，并算出它在页面上实际占多宽、多高；
2. 说清楚 `content-box` 和 `border-box` 的区别，并知道正式项目为什么统一用 `border-box`；
3. 分清 `block`、`inline`、`inline-block`、`none`，知道为什么 `span` 设了宽高没反应、为什么 `display: none` 和 `visibility: hidden` 不一样；
4. 预判并解决外边距合并（两个盒子上下挨着时，间距不是相加而是取大值）；
5. 用 `relative`、`absolute`、`fixed`、`sticky` 把元素放到想放的位置，并说清楚绝对定位是相对于谁定位的；
6. 用 `z-index` 控制重叠顺序，并知道为什么有时候 `z-index` 写得再大也不生效（层叠上下文）。

## 2. 适用人群

- 已完成 CSS-01、CSS-02，知道选择器、优先级、单位、颜色、字体、边框，能写出简单规则的人；
- 盒子宽度总算不对（写了 200px，实际占了 240px）、两个盒子间距总不是预期、绝对定位总跑到意想不到的地方的人；
- 看老代码时总遇到 `float`、`clear`，想知道它们是干什么、现在还用不用的 人。

## 3. 适用系统和版本

- 与 CSS-01、CSS-02 相同：Windows、macOS、Linux 均可，任意现代浏览器，任意纯文本编辑器。
- CSS 版本：CSS3 及之后的标准；`box-sizing`、`position: sticky` 在现代浏览器里都不需要加前缀，极老浏览器上的 `sticky` 兼容问题本篇只在备注里提一句。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级）和 CSS-02（单位、边框、背景），本篇的示例会直接用这些属性；
- 知道 HTML 的语义化骨架（WEB-01），能看懂示例里的 `header`、`main`、`section`；
- 知道怎么保存 UTF-8 编码的 `.html` 文件。

## 5. 所需资源

- 一台能打开浏览器的电脑，一个练习文件夹（沿用 CSS-01、CSS-02 的练习文件夹即可）；
- 本篇第 10 节的完整代码；
- 可选：浏览器的开发者工具（按 F12），用来做第 14 节的“看盒模型四层”检查，没有也不影响前三项验证。

## 6. 技术原理

### 盒模型：一个元素就是四个套在一起的盒子

浏览器把每个元素都看成一个盒子，从内到外是四层：

```text
┌──────────── margin（外边距：盒子与别的盒子之间的距离）────────────┐
│ ┌────────── border（边框：CSS-02 讲过的那一圈）──────────┐ │
│ │ ┌──────── padding（内边距：内容与边框之间的距离）────────┐ │ │
│ │ │                                                        │ │ │
│ │ │  content（内容：文字、图片等实际内容，width/height 指的就是这一层） │ │ │
│ │ │                                                        │ │ │
│ │ └────────────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

关键公式（默认的 `content-box` 下）：

- 元素在页面上实际占的宽度 = `margin-left + border-left + padding-left + width + padding-right + border-right + margin-right`
- 实际占的高度同理，上下四层相加。

举个例子：`width: 200px; padding: 20px; border: 2px solid;`，在默认 `content-box` 下，盒子实际占宽是 200 + 20×2 + 2×2 = 244px，不是 200px——这就是“写了 200px，实际占了 240px 多”的来源。

### `box-sizing`：改 `width` 到底指哪一层

`box-sizing` 就是改上面那个公式里 `width` 的含义：

- `content-box`（浏览器默认值）：`width` 只指内容层，内边距和边框要另外加，算实际宽度要自己加一遍；
- `border-box`：`width` 指“内容 + 内边距 + 边框”三层之和，实际占宽（不含外边距）就是 `width` 本身，内边距和边框再大也不会把盒子撑宽。

正式项目统一用 `border-box`，就是为了“写 200px 就是 200px”，不用每次都算内边距和边框。统一写法是：

```css
html {
  box-sizing: border-box;
}
*, *::before, *::after {
  box-sizing: inherit;
}
```

这样全站都用 `border-box`，以后想在某个局部改回 `content-box`，只要改那个局部的 `box-sizing` 就行，因为子元素是继承来的。

### `display`：元素在页面上以什么方式参与布局

`display` 决定元素是“独占一行”还是“跟别人挤在一行”，以及宽高、内外边距能不能生效：

| 值 | 表现 | 宽高、内外边距 |
|---|---|---|
| `block` | 独占一行，默认占满父级宽度，上下排列 | 宽高、内外边距全部生效 |
| `inline` | 跟别人挤在一行，宽度由内容决定，换行时断开 | 宽高不生效，左右内外边距生效，上下内外边距视觉上不撑开布局（这是 `span` 设宽高没反应的原因） |
| `inline-block` | 跟别人挤在一行，但内部按块级算 | 宽高、内外边距全部生效 |
| `none` | 不显示，也不占位置 | 后面的元素会顶上来，等于这个元素不存在 |
| `flex` / `grid` | 弹性 / 网格容器 | 本篇只提一句，完整讲解在 CSS-04、CSS-05 |

`display: none` 和 `visibility: hidden` 的区别要记牢：`none` 是不显示也不占位置，`hidden` 是不显示但还占着位置，页面上会留一个空白。读屏软件对两者的处理也不一样，`none` 的元素读屏软件通常也跳过，`hidden` 的元素有的读屏软件还会读出来，做无障碍时不要混用。

### 外边距合并：上下挨着的盒子，间距取大值不是相加

外边距合并（margin collapsing）是盒模型里最反直觉的一条，规则是：

- 两个上下相邻的块级盒子，上一个的 `margin-bottom` 和下一个的 `margin-top`，实际间距不是两者相加，而是取两者中较大的那个。比如上一个 `margin-bottom: 30px`，下一个 `margin-top: 20px`，实际间距是 30px，不是 50px。
- 父子盒子之间也会合并：父元素没有边框、没有内边距、没有内容隔开时，子元素的 `margin-top` 会“穿”到父元素外面去，看起来像父元素自己有了外边距。
- 空的块级元素（里面什么都没有）上下外边距也会合并成一个。

解决方法按场景选，不用背，记住“隔开就不合并”就行：给父元素加 1px 边框、加内边距、加 `overflow: hidden`（见下文溢出）、把父元素改成 Flex/Grid 容器，都能隔断合并。具体用哪个，看那个场景下哪个副作用最小——比如不想多出边框，就用内边距或 `overflow: hidden`。

### 浮动：老布局方式，理解为主，新项目不用它布局

`float: left` / `float: right` 是把元素推到父级左边或右边，后面的文字和行内元素会绕着它排，这就是早期“图文混排、多列布局”的做法。浮动的问题是：浮动元素脱离了正常文档流，父元素会“塌陷”（高度变成 0，因为浮动子元素不撑开父级），所以老代码里总有一段“清除浮动”的写法，比如给父元素加 `overflow: hidden`，或者用 clearfix（给父元素的 `::after` 写 `clear: both`）。

现在的结论很明确：**新项目布局用 Flex（CSS-04）和 Grid（CSS-05），不要用浮动布局**；浮动只在“文字绕着图片”这种图文混排场景还有点用，以及看老代码时要能看懂它。

### 溢出：内容放不下时怎么办

`overflow` 决定内容超出盒子时怎么处理：

- `visible`（默认值）：超出部分直接显示出来，盖到别的元素上面；
- `hidden`：超出部分裁掉，看不见；
- `scroll`：不管超没超出，永远显示滚动条；
- `auto`：超出时才显示滚动条，没超出就不显示，最常用。

`overflow-x` 和 `overflow-y` 可以分开写，横向和纵向用不同的处理。单行文字溢出显示省略号是三个属性合用：`white-space: nowrap`（不换行）+ `overflow: hidden`（裁掉超出）+ `text-overflow: ellipsis`（裁掉的部分显示成 `...`），缺一个都不行。

### 定位：`position` 五种值，关键是“相对于谁”

| 值 | 表现 | 相对于谁 |
|---|---|---|
| `static`（默认值） | 正常文档流，不定位 | —，`top`、`left` 等写了也不生效 |
| `relative` | 先按正常位置排，再相对自己原来的位置偏移 | 自己原来的位置；偏移后原来占的位置还留着，别的元素不会顶上来 |
| `absolute` | 脱离正常文档流，不占位置 | 最近的一个“已定位祖先”（即 `position` 不是 `static` 的祖先，比如 `relative`、`absolute`、`fixed`、`sticky` 的祖先）；如果没有已定位祖先，就相对于初始包含块（一般就是视口/页面根） |
| `fixed` | 脱离正常文档流，不占位置，滚动时不动 | 视口（浏览器窗口），滚动页面时它还在原地，适合做“回到顶部”按钮、固定导航 |
| `sticky` | 平时按正常位置排，滚动到阈值后“粘”在指定位置 | 最近的滚动祖先，阈值由 `top`、`left` 等决定；比如 `position: sticky; top: 0;` 的导航，滚动到顶部时就粘在顶部不动了 |

绝对定位最常见的错误就是“忘了给父级写 `relative`”：父级没定位，绝对定位的子元素就会一路往上找到页面根，跑到意想不到的地方。正确做法是：想让子元素相对父级定位，就给父级写 `position: relative`（父级本身位置不动，只是给子元素当参照）。

### `z-index` 与层叠上下文：为什么有时候写再大也不生效

`z-index` 是控制重叠顺序的数字，越大越靠上，但它有两个前提：

1. 元素必须是已定位的（`position` 不是 `static`），`static` 元素的 `z-index` 写了也不生效；
2. 元素不能被困在层叠上下文里：某些属性会创建一个新的层叠上下文（比如 `opacity` 小于 1、`transform` 不为 `none`、`filter`、`position: fixed` 加 `z-index` 等），一旦父元素创建了层叠上下文，子元素的 `z-index` 就只在父元素内部比大小，再大也盖不过父元素外面的元素。

排查“`z-index` 不生效”时，先查元素是不是已定位，再查父级是不是创建了层叠上下文——多数情况都是这两个原因之一，不要一味把数字往大了加（`z-index: 99999` 不是解法）。

## 7. 架构说明

本篇完整示例的页面结构，仍然是 CSS-01、CSS-02 的骨架，只在 `main` 里加了四节，每节演示一组概念：

```text
header（标题）
main
├── section#box-model（盒模型：content-box 和 border-box 同宽不同实际占宽，对照演示）
├── section#display-margin（display 与外边距：block/inline/inline-block 对照，外边距合并演示）
├── section#position（定位：relative 父级 + absolute 角标，fixed 回到顶部，sticky 粘性导航）
└── section#overflow-float（溢出与浮动：overflow 裁剪与滚动，float 图文绕排）
footer（页脚）
```

四节之间没有依赖关系，可以单独拿出来用：只要盒模型，就复制盒模型那一节；只要定位，就复制定位那一节。每一节内部也是独立的，删掉一节不影响另外三节。

## 8. 操作前检查

1. 练习文件夹里有 CSS-01、CSS-02 的练习文件，或者你新建了一个空文件夹，准备放本篇的 `box-position.html`；
2. 编辑器保存编码是 UTF-8；
3. 如果你想做第 14 节的开发者工具检查，先确认按 F12 能打开开发者工具，找不到“盒模型图”面板也没关系，前三项验证不用它。

## 9. 逐步操作

1. 在练习文件夹里新建文件 `box-position.html`；
2. 把第 10 节的完整代码从头到尾复制进去；
3. 保存，UTF-8，双击用浏览器打开，看第 13 节描述的效果是否出现；
4. 先看盒模型那一节：两个都写了 `width: 200px` 的盒子，`content-box` 那个是不是比 `border-box` 那个宽一圈——宽了就是对的，宽出来的正是内边距加边框；
5. 再看定位那一节：角标是不是贴在卡片的右上角，而不是页面的右上角——贴在卡片上就说明父级的 `relative` 起作用了，贴在页面上就说明父级没定位；
6. 把卡片父级的 `position: relative` 删掉，保存刷新，看角标是不是跑到页面右上角去了；再把 `relative` 加回去，角标是不是又回卡片上了——这一步是让你亲眼看到“绝对定位的参照是谁”；
7. 把页面往下滚，看粘性导航是不是滚到顶部就粘住了、固定按钮是不是一直停在右下角——两个都对，才算定位这节通了。

## 10. 完整代码

下面是本篇的完整示例，没有省略号，复制下来就是一个能打开的页面。存放位置：练习文件夹里的 `box-position.html`，样式写在 `head` 里的 `<style>` 标签里，是内部引入方式。示例里用了颜色和边框做区分，颜色本身不是本篇重点，只要能看清盒子边界就行。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS 盒模型与定位示例</title>
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
    .box-content {
      width: 200px;
      padding: 20px;
      border: 2px solid #1a5276;
      box-sizing: content-box;
      background-color: #d6eaf8;
    }
    .box-border {
      width: 200px;
      padding: 20px;
      border: 2px solid #1a5276;
      box-sizing: border-box;
      background-color: #f9e79f;
    }
    .block-demo {
      display: block;
      background-color: #d5f5e3;
    }
    .inline-demo {
      display: inline;
      background-color: #fadbd8;
    }
    .inline-block-demo {
      display: inline-block;
      width: 120px;
      background-color: #d2b4de;
    }
    .margin-a {
      margin-bottom: 30px;
      background-color: #aed6f1;
    }
    .margin-b {
      margin-top: 20px;
      background-color: #f5cba7;
    }
    .card {
      position: relative;
      border: 2px solid #1a5276;
      padding: 20px;
    }
    .badge {
      position: absolute;
      top: 8px;
      right: 8px;
      background-color: #c0392b;
      color: #ffffff;
    }
    .sticky-nav {
      position: sticky;
      top: 0;
      background-color: #1a5276;
      color: #ffffff;
    }
    .fixed-btn {
      position: fixed;
      right: 16px;
      bottom: 16px;
      background-color: #2e7d32;
      color: #ffffff;
      z-index: 10;
    }
    .overflow-box {
      width: 240px;
      height: 80px;
      overflow: auto;
      border: 1px solid #999999;
    }
    .float-img {
      float: left;
      width: 80px;
      height: 80px;
      background-color: #f9e79f;
    }
    .clearfix::after {
      content: "";
      display: block;
      clear: both;
    }
  </style>
</head>
<body>
  <header>
    <h1>盒模型与定位示例</h1>
  </header>
  <nav class="sticky-nav">
    <p>粘性导航：滚到顶部时会粘住</p>
  </nav>
  <main>
    <section id="box-model">
      <h2>盒模型对照</h2>
      <div class="box-content">content-box：宽 200px 是内容层，实际占宽 244px。</div>
      <div class="box-border">border-box：宽 200px 就是实际占宽，内边距和边框包含在内。</div>
    </section>
    <section id="display-margin">
      <h2>display 与外边距合并</h2>
      <p class="block-demo">块级：独占一行。</p>
      <p><span class="inline-demo">行内：跟别人挤在一行。</span><span class="inline-block-demo">行内块：挤在一行但有宽高。</span></p>
      <p class="margin-a">上一个盒子，下外边距 30px。</p>
      <p class="margin-b">下一个盒子，上外边距 20px。两盒间距是 30px，不是 50px，这就是外边距合并。</p>
    </section>
    <section id="position">
      <h2>定位示例</h2>
      <div class="card">
        <p>这是一张卡片，父级写了相对定位。</p>
        <span class="badge">角标</span>
      </div>
    </section>
    <section id="overflow-float">
      <h2>溢出与浮动</h2>
      <div class="overflow-box">
        <p>这段文字很长很长，盒子只有 240px 宽、80px 高，放不下的部分会出滚动条，而不是把盒子撑大。</p>
        <p>第二段文字，用来把盒子撑满，验证滚动条是不是真的出现了。</p>
      </div>
      <div class="clearfix">
        <div class="float-img">浮动块</div>
        <p>这段文字会绕着左边的浮动块排，父级用了 clearfix，高度不会塌陷。</p>
      </div>
    </section>
  </main>
  <footer>
    <p>© 2026 盒模型与定位示例</p>
  </footer>
  <a class="fixed-btn" href="#top">回到顶部</a>
</body>
</html>
```

## 11. 完整配置文件

本篇不需要服务器配置文件，也不需要构建工具。唯一的文件就是第 10 节的 `box-position.html`，放在练习文件夹根目录。以后部署时，这个文件要和它引用的资源（如果以后加了背景图片）一起放到网站目录里，并且保持相对路径不变；本篇示例没有引用外部图片文件，所以不存在裂图问题。

## 12. 每个关键属性的解释

### 盒模型

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `width` / `height` | 内容层的宽 / 高（在 `content-box` 下） | 忘了 `box-sizing`，以为 `width` 就是实际占宽，结果内边距和边框把盒子撑大了 |
| `padding` | 内边距，内容与边框之间的距离，背景色会延伸到内边距区 | 内边距的 `%` 是按父级宽度算的，上下内边距也是按宽度，不是按高度 |
| `border` | 边框，CSS-02 已讲，盒模型里是第三层 | 缺 `style` 就没边框，见 CSS-02 |
| `margin` | 外边距，盒子与别的盒子之间的距离，背景色不会延伸到外边距区 | 上下外边距会合并，见第 6 节；`margin: auto` 只在块级元素有宽度时才能水平居中 |
| `box-sizing: content-box` | 浏览器默认值，`width` 只指内容层 | 默认值就是这个，不写 `box-sizing` 时，所有宽度计算都要自己加内边距和边框 |
| `box-sizing: border-box` | `width` 指内容 + 内边距 + 边框之和 | 正式项目统一用它，见第 6 节的统一写法 |
| `min-width` / `max-width`、`min-height` / `max-height` | 宽高的下限 / 上限 | `width` 和 `max-width` 同时写，`max-width` 会盖住 `width`，做响应式时常用 `max-width: 100%` 防图片溢出 |

### `display`

| 值 | 作用 | 容易错的地方 |
|---|---|---|
| `block` | 独占一行，占满父级宽度 | 块级元素不写宽度时默认占满父级，写了宽度后剩下的空间不会自动被别的块级元素占 |
| `inline` | 跟别人挤在一行，宽高不生效 | 给 `span`、`a` 写宽高没反应，就是因为它们默认是 `inline`，要改成 `inline-block` 或 `block` 才行 |
| `inline-block` | 挤在一行但有宽高 | 两个 `inline-block` 之间会有 HTML 里的换行符带来的间隙，想去掉间隙要处理换行符或用 Flex，CSS-04 再讲 |
| `none` | 不显示也不占位置 | 和 `visibility: hidden` 混淆，后者还占位置 |
| `visibility: hidden` | 不显示但还占位置 | 不是 `display` 的值，是单独的属性，不要和 `display: none` 混用 |

### 外边距简写

`margin` 和 `padding` 的简写规则是一样的，按顺时针“上、右、下、左”记：

- 1 个值：四边都一样，`margin: 10px`；
- 2 个值：上下、左右，`margin: 10px 20px` 是上下 10px、左右 20px；
- 3 个值：上、左右、下，`margin: 10px 20px 30px`；
- 4 个值：上、右、下、左，`margin: 10px 20px 30px 40px`。

### 定位

| 值 | 作用 | 容易错的地方 |
|---|---|---|
| `static` | 默认值，正常文档流，`top`、`left` 等不生效 | 给 `static` 元素写 `top`、`z-index`，写了也白写 |
| `relative` | 相对自己原来位置偏移，原来占的位置还留着 | 偏移后原来位置留白，别的元素不会顶上来，不要用 `relative` 做大范围布局移动 |
| `absolute` | 脱离文档流，相对最近已定位祖先定位 | 忘了给父级写 `relative`，角标跑到页面根；父级没定位时，参照是页面根，不是离它最近的那个 `div` |
| `fixed` | 脱离文档流，相对视口定位，滚动不动 | `fixed` 元素在手机浏览器上，地址栏收起展开时位置会抖动，移动端慎用大面积固定元素 |
| `sticky` | 平时正常排，滚动到阈值后粘住 | 父级高度不够、父级有 `overflow: hidden` 时，`sticky` 可能粘不住，排查时先看父级 |
| `top` / `right` / `bottom` / `left` | 定位的偏移量 | 只对已定位元素生效，`static` 元素写了没用；`top` 和 `bottom` 同时写时，按文档流方向取一个，另一个被忽略的情况要查规范，不要同时写两个方向硬碰 |
| `z-index` | 重叠顺序，越大越靠上 | 只对已定位元素生效；被困在层叠上下文里时，再大也盖不过外面的元素，见第 6 节 |

### 浮动与溢出

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `float: left` / `right` | 推到父级左右，后面文字绕排 | 浮动元素不撑开父级高度，父级塌陷，要用 `overflow: hidden` 或 clearfix 清除 |
| `clear: both` | 不允许左右两边有浮动元素，换到浮动元素下面 | `clear` 是写在“跟在浮动元素后面的那个元素”上的，不是写在浮动元素自己身上的 |
| `overflow: visible` / `hidden` / `scroll` / `auto` | 内容超出时的处理 | `hidden` 会把超出部分直接裁掉，裁掉的内容用户再也看不到，做下拉菜单、提示框时不要误用 `hidden` |
| `overflow-x` / `overflow-y` | 横向 / 纵向分开处理 | 一个方向写 `hidden`、另一个方向写 `visible` 时，浏览器会把 `visible` 也算成 `auto`，这是规范行为，不是 bug |
| `text-overflow: ellipsis` | 单行溢出显示 `...` | 必须和 `white-space: nowrap`、`overflow: hidden` 三个一起写，缺一个都不出省略号 |

## 13. 执行结果示例

双击打开后，你应该看到：

- 盒模型那一节：两个都写了 `width: 200px` 的盒子，`content-box` 那个明显比 `border-box` 那个宽一圈，宽出来的正是内边距 20px×2 加边框 2px×2；
- `display` 那一节：块级段落独占一行，行内和行内块挤在一行，行内块那个有 120px 宽；
- 外边距那一节：上下两个盒子的间距是 30px，不是 50px，肉眼看就是“比 50px 窄一点”，这就是合并的效果；
- 定位那一节：角标贴在卡片的右上角，不是页面的右上角；页面往下滚，顶部的粘性导航滚到顶部就粘住了，右下角的“回到顶部”按钮一直停在原地；
- 溢出那一节：240px×80px 的盒子里文字放不下，出现了滚动条；浮动那一节，文字绕着左边的浮动块排，父级高度没有塌陷。

如果你看到角标在页面右上角，先查卡片父级是不是写了 `position: relative`；如果你看到盒模型两个盒子一样宽，先查是不是全局 `box-sizing: border-box` 把 `content-box` 那个也改了——示例里 `content-box` 那个是单独写了 `box-sizing: content-box` 覆盖全局的，删了那行它就会变窄。

## 14. 成功验证

按顺序做，全部通过才算本篇完成：

1. **文件验证**：`box-position.html` 在练习文件夹里，双击能打开，不是 `.txt`；
2. **盒模型验证**：`content-box` 盒子比 `border-box` 盒子宽，宽出来的部分肉眼可见；
3. **外边距验证**：上下两个盒子的间距是 30px（取大值），不是 50px（相加）；
4. **定位验证**：角标在卡片右上角，不在页面右上角；把父级 `relative` 删掉，角标跑到页面右上角；加回去，角标回来；
5. **粘性与固定验证**：页面往下滚，粘性导航粘在顶部，固定按钮一直停在右下角；
6. **溢出与浮动验证**：溢出盒子出现滚动条，浮动父级高度没有塌陷；
7. **开发者工具验证（可选）**：按 F12，选中 `border-box` 那个盒子，看盒模型图里的四层数字：内容 200px、内边距 20px、边框 2px，实际占宽 200px（不含外边距），和第 6 节的公式对得上。

## 15. 常见错误

| 错误 | 现象 | 改法 |
|---|---|---|
| 忘了 `box-sizing`，宽度算不对 | 写 200px，实际占 244px | 全站统一 `border-box`，见第 6 节的统一写法 |
| 给 `inline` 元素写宽高 | 宽高没反应 | 改成 `inline-block` 或 `block` |
| `display: none` 和 `visibility: hidden` 混用 | 该留白的地方没留白，或该消失的地方留了空白 | 不占位置用 `none`，占位置用 `hidden` |
| 外边距合并当成 bug | 两个盒子间距不是相加，越调越大 | 记住合并规则，取大值；想隔断合并就给父级加边框、内边距或 `overflow: hidden` |
| 绝对定位忘了给父级写 `relative` | 角标、弹窗跑到页面根 | 想相对谁定位，就给谁写 `position: relative` |
| 给 `static` 元素写 `top`、`z-index` | 写了没反应 | 先把 `position` 改成 `relative`、`absolute` 等已定位值 |
| `z-index` 写再大也不生效 | 元素还是被盖住 | 查是不是 `static`，再查父级是不是创建了层叠上下文，不要一味加到 99999 |
| 浮动后父级塌陷 | 父级高度变成 0，下面的内容顶上来 | 给父级加 `overflow: hidden` 或 clearfix |
| 溢出盒子用 `hidden` 裁掉了下拉菜单 | 下拉菜单、提示框出不来 | 下拉菜单的父级不要写 `overflow: hidden`，换别的隔断合并方法 |
| 单行省略号缺一个属性 | 文字直接被裁掉，没有 `...` | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis` 三个一起写 |
| `sticky` 粘不住 | 滚动时导航没有粘在顶部 | 查父级高度够不够、父级有没有 `overflow: hidden`，这两个是常见原因 |

## 16. 故障排查

- **宽度算不对**：先看 `box-sizing` 是哪个，再按第 6 节的公式一层一层加，内边距和边框有没有算进去，一算就清楚。
- **间距不是预期**：先看是不是外边距合并（上下相邻、父子、空元素三种情况），再看是不是 `inline-block` 之间的换行符间隙，再看是不是 `margin` 简写的顺序写错了（上右下左，不是上下左右）。
- **定位跑偏**：先找“最近已定位祖先”是谁，从子元素往上数，第一个 `position` 不是 `static` 的祖先就是参照；没有就参照页面根。
- **重叠顺序不对**：先查 `z-index` 的元素是不是已定位，再查父级层叠上下文，再查是不是 `opacity`、`transform` 把父级变成了新的层叠上下文。
- **浮动后布局乱了**：先看父级塌陷了没有，再看 `clear` 是不是写在了跟在浮动元素后面的元素上，而不是浮动元素自己身上。
- **改了 CSS 刷新没变**：确认保存了，再按 Ctrl+F5 强制刷新，排除浏览器缓存。

## 17. 安全注意事项

- CSS 定位和溢出本身没有直接的安全风险，但 `position: fixed`、`z-index` 很大的元素可以盖住页面上的重要按钮（比如“取消”“关闭”），做弹窗、广告位时不要用超大 `z-index` 盖住用户必须能点的按钮，这是无障碍和防误操作的问题。
- `overflow: hidden` 裁掉的内容用户看不到，不要把重要提示、错误信息、操作按钮放在会被裁掉的区域里。
- 不要把真实用户的隐私信息写进示例代码里，占位文字就够了。

## 18. 回滚和恢复

本篇和 CSS-01、CSS-02、WEB 系列一样，没有服务器、没有数据库、没有配置改动，回滚就是：

- 改错了：编辑器里 Ctrl+Z 撤销，或把第 10 节的完整代码重新复制覆盖一次；
- 定位改乱了：把 `position` 改回 `static`，元素就回到正常文档流，再一步一步加定位；
- 文件删错了：重新新建 `box-position.html`，把第 10 节代码再贴一遍；
- 没有任何线上内容会被影响，因为本篇文件只在你的练习文件夹里，还没有部署到 crozz.me。

## 19. 延伸阅读

- MDN 盒模型：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_box_model
- MDN `box-sizing`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/box-sizing
- MDN `display`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/display
- MDN `position`：https://developer.mozilla.org/zh-CN/docs/Web/CSS/position
- MDN `z-index` 与层叠上下文：https://developer.mozilla.org/zh-CN/docs/Web/CSS/z-index

## 20. 相关章节链接

- 上一篇：[CSS-02 CSS 单位与颜色、字体、背景、边框](./02-units-colors.md)
- 再往前：[CSS-01 CSS 基础语法与选择器](./01-basics.md)、[WEB-03 HTML SEO 与无障碍](../html/03-seo-a11y.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[CSS-04 Flexbox 完整教程](./04-flexbox.md)
- 再往后：CSS-05 Grid 完整教程、CSS-06 响应式设计（都在任务索引里，顺序见路线图）
