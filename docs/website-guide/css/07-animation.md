# CSS-07：CSS 动画和高级效果

> 任务编号：CSS-07（网站建设与部署实战指南 · CSS 完整教程第 7 篇）
> 上一篇：[CSS-06 响应式设计](./06-responsive.md)；下一篇：[CSS-08 CSS 工程化](./08-engineering.md)。
> 本篇只讲动画和高级效果：过渡、变换、关键帧动画、伪类与伪元素进阶、CSS 变量、滤镜、阴影、渐变、暗黑模式、交互效果实战。不讲 Flex/Grid 基础（那是 CSS-04、CSS-05）、不讲响应式断点（那是 CSS-06）、不讲 Sass/Less（那是 CSS-08）。渐变的基础写法在 CSS-02 提过，本篇只讲多层渐变和实际用法，不重复讲基础写法。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 用 `transition` 让状态变化平滑过渡，而不是瞬间跳变，并说清楚哪些属性能过渡、哪些不能；
2. 用 `transform` 做平移、缩放、旋转、倾斜，并用 `transform-origin` 控制变换的原点；
3. 用 `animation` 和 `@keyframes` 写多关键帧动画，并说清楚八个动画子属性各是干什么的；
4. 用 `:hover`、`:focus`、`:nth-child` 和 `::before`、`::after` 做装饰和交互，不为了一个小装饰多加 HTML 标签；
5. 用 CSS 变量（自定义属性）做主题，改一个变量就让全站颜色跟着变；
6. 用滤镜、阴影、多层渐变做出有质感的卡片和按钮；
7. 用 `@media (prefers-color-scheme: dark)` 做暗黑模式，用 `prefers-reduced-motion` 尊重“减少动态效果”的用户设置；
8. 做出三个能直接用的交互效果：按钮悬停放大、卡片悬停抬起加阴影、加载旋转动画。

## 2. 适用人群

- 已完成 CSS-01、CSS-02、CSS-03，知道选择器、优先级、单位、颜色、背景、边框、盒模型、定位，能写出静态页面的人；
- 页面已经能看，但一动起来就生硬（悬停瞬间变色、弹窗瞬间出现），想让交互变平滑的人；
- 想做暗黑模式、主题换色，但不想把颜色值满页复制粘贴、改一处漏三处的人。

## 3. 适用系统和版本

- 与 CSS-01、CSS-02、CSS-03 相同：Windows、macOS、Linux 均可，任意现代浏览器，任意纯文本编辑器。
- CSS 版本：CSS3 及之后的标准；`transition`、`transform`、`animation`、`@keyframes`、CSS 变量、滤镜、渐变在现代浏览器里都不需要加浏览器前缀，极老浏览器上的兼容问题本篇只在备注里提一句，不展开前缀表。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级），知道类选择器、伪类、伪元素的基本写法；
- 已完成 CSS-02（颜色、背景、边框），知道 `background`、`border`、`border-radius` 的写法；
- 已完成 CSS-03（盒模型、定位），知道 `position` 和 `z-index` 的基本概念，本篇的装饰层和角标会用到定位；
- 知道怎么保存 UTF-8 编码的 `.html` 文件。

## 5. 所需资源

- 一台能打开浏览器的电脑，一个练习文件夹（沿用 CSS-01、CSS-02、CSS-03 的练习文件夹即可）；
- 本篇第 10 节的完整代码；
- 可选：浏览器的开发者工具（按 F12），用来做第 14 节的“看过渡和动画是不是生效了”检查，没有也不影响前三项验证。

## 6. 技术原理

### 过渡：状态变了，让它慢慢变过去

过渡（transition）不是动画本身，而是“两个状态之间的平滑过程”。比如按钮平时是蓝色，悬停是深蓝色，没有过渡时，鼠标一移上去颜色瞬间就变了；写了 `transition: background-color 0.3s ease;`，颜色就会在 0.3 秒里慢慢从蓝变到深蓝。

过渡要成立，必须同时满足三个条件，缺一个都不动：

1. 元素在起始状态和结束状态都要有这个属性的确定值（比如起始 `background-color: blue`，结束 `background-color: darkblue`）；
2. 写了 `transition`，并且 `transition-property` 里包含这个属性（写 `all` 就是全部可过渡属性都过渡，新手先用 `all` 练，正式项目建议写具体属性名，性能更好、意图更清楚）；
3. 状态确实发生了变化（悬停、获得焦点、加了一个类，等等），页面一打开就写好的静态样式不会自己过渡。

什么属性能过渡、什么不能，是新手最容易踩的坑，记住一条判断标准：**数值能连续变化的属性能过渡，离散值不能过渡**。`opacity`（0 到 1）、`transform`（平移、缩放的数值）、`color`、`background-color`、`width`（数值）都能过渡；`display`（`none` 和 `block` 之间没有中间值）不能过渡，想做“淡入淡出再消失”，要先用 `opacity` 过渡，再在过渡结束时用脚本或 `visibility` 配合处理，纯 CSS 的常见做法是 `opacity` + `visibility` 一起过渡（`visibility` 本身是离散的，但配合延迟可以做到“淡出后再隐藏”，第 12 节有说明）。

### 变换：不改布局，只改显示

变换（transform）是“把元素平移、缩放、旋转、倾斜”，但**不改变它在布局里占的位置**。比如 `transform: translateY(-6px)` 是把卡片往上移 6px 显示，卡片原来占的位置还留着，别的元素不会顶上来——这和 CSS-03 里 `position: relative` 偏移后留白的道理是一样的，只不过 `transform` 是专门干这个的，而且性能更好。

正因为 `transform` 不触发布局重算，浏览器可以用显卡直接合成这一层，所以动画做 `transform` 和 `opacity` 最流畅；反过来，对 `width`、`height`、`margin`、`padding` 做大范围动画，每一帧都要重新算布局，页面很容易卡顿。第 14 节的性能提醒就是这条：能用 `transform` 和 `opacity` 解决的，就不要用宽高和边距。

### 关键帧动画：不靠悬停，自己跑

过渡需要“状态变化”来触发，关键帧动画（animation）不需要：它按你写的关键帧时间轴自己跑，可以循环、可以反向、可以停在最后一帧。

```text
@keyframes 动画名 {
  from { /* 起始状态 */ }
  to { /* 结束状态 */ }
}
```

`from` 等于 `0%`，`to` 等于 `100%`，中间可以加 `25%`、`50%`、`75%` 等任意多个关键帧，浏览器会在关键帧之间自动补间。`animation` 是八个子属性的简写，顺序和含义见第 12 节，常用的简写是 `animation: 动画名 时长 时间函数 延迟 循环次数 方向 填充模式;`，比如 `animation: spin 1s linear infinite;` 就是“叫 spin 的动画，1 秒一圈，匀速，无限循环”。

### 伪类与伪元素进阶：状态和装饰，不加标签

伪类（一个冒号）是“元素处于某种状态”，伪元素（两个冒号）是“元素的某个部分或虚拟出来的一个子元素”：

- `:hover` 是鼠标悬停，`:focus` 是获得键盘焦点（按 Tab 走到输入框、按钮时），`:focus-visible` 是“键盘操作时才显示焦点样式”，比 `:focus` 更精准，做无障碍时优先用它；
- `:nth-child(n)` 是“父元素里的第 n 个子元素”，`:nth-child(2n)` 是偶数个，`:nth-child(odd)` 是奇数个，做斑马纹表格、列表隔行变色时不用给每个 `li` 加类；
- `::before` 和 `::after` 是在元素内容的前面和后面虚拟出一个子元素，必须写 `content`（哪怕是空字符串 `content: "";`），不写 `content` 就不显示。虚拟出来的元素可以像正常元素一样写宽高、背景、定位，所以“小圆点、角标、装饰线、引号”这类装饰，完全不用多加 HTML 标签。

### CSS 变量：改一个值，全站跟着变

CSS 变量（自定义属性）就是“给一个值起个名字，以后都用这个名字”。定义时名字以两个减号开头，比如 `--main-color: #1a5276;`，使用时用 `var()` 包起来，比如 `color: var(--main-color);`。

变量有作用域：定义在 `:root`（即 `html` 元素）上，全站都能用；定义在某个类里，只有那个类及其子元素能用，子元素没定义时继承父级的值。暗黑模式的思路就是利用作用域：浅色主题在 `:root` 里定义一套变量，暗黑模式在 `@media (prefers-color-scheme: dark)` 里把同一批变量重定义一遍，页面里所有用 `var()` 的地方自动跟着变，不用把每个选择器的颜色都重写一遍。

变量还可以带 fallback：`var(--main-color, #333333)` 的意思是“如果 `--main-color` 没定义，就用 `#333333`”，写组件库、写可复用样式时要养成带 fallback 的习惯。

### 滤镜、阴影、渐变：质感来自这三样

- 滤镜（`filter`）：对元素整体做图像处理，`blur(4px)` 是模糊，`brightness(1.2)` 是调亮 20%，`grayscale(100%)` 是变灰，`drop-shadow()` 是按元素形状投阴影（和 `box-shadow` 按矩形盒子投阴影不一样，镂空图片、文字用 `drop-shadow` 更贴合形状）；
- 阴影：`box-shadow` 是盒子阴影，`text-shadow` 是文字阴影，写法都是“横向偏移 纵向偏移 模糊半径 扩散半径 颜色”，比如 `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);`，卡片“抬起来”的感觉就是阴影变大、变模糊；
- 渐变：CSS-02 讲过单层线性渐变的基础写法，本篇讲多层渐变和实际用法：`background-image` 里用逗号写多个渐变，第一层在最上面，比如“半透明黑色渐变 + 彩色渐变”叠在一起做图片遮罩，或者“径向渐变做光斑 + 线性渐变做底色”叠在一起做卡片背景。多层渐变每一层都可以单独写位置和尺寸，合起来就是一张不用图片文件的背景图。

### 暗黑模式与减少动态效果：跟着系统设置走

暗黑模式不是“再写一套页面”，而是“同一套变量换一套值”：

```css
:root {
  --bg: #ffffff;
  --text: #333333;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e2129;
    --text: #e6e6e6;
  }
}
```

用户的系统设了深色，浏览器就自动用暗黑那套变量；系统是浅色，就用浅色那套。页面里所有颜色都要走变量，漏了一个写死颜色的地方，暗黑模式下那个地方就会突兀地亮着。

减少动态效果（`prefers-reduced-motion`）是另一回事：有些用户在系统里设了“减少动态效果”（晕动症、注意力障碍等原因），页面就应该关掉或减弱动画，常见做法是在 `@media (prefers-reduced-motion: reduce)` 里把动画时长改成极短、把循环动画关掉、把过渡关掉，只保留必要的状态变化，不要让页面在用户明确要求减少动态时还转个不停。

## 7. 架构说明

本篇完整示例的页面结构，仍然是 CSS-01、CSS-02、CSS-03 的骨架，只在 `main` 里加了四节，每节演示一组效果：

```text
header（标题：演示 CSS 变量做主题色）
main
├── section#buttons（按钮悬停放大：transition + transform）
├── section#cards（卡片悬停抬起加阴影：transition + transform + box-shadow + ::before 装饰）
├── section#loading（加载旋转动画：@keyframes + animation 无限循环）
└── section#theme（变量与暗黑模式：:root 变量、dark 媒体查询、减少动态效果媒体查询）
footer（页脚）
```

四节之间没有依赖关系，可以单独拿出来用：只要按钮，就复制按钮那一节；只要加载动画，就复制加载那一节。每一节内部也是独立的，删掉一节不影响另外三节。样式全部写在 `head` 里的 `<style>` 标签里，是内部引入方式，和 CSS-01、CSS-02、CSS-03 的示例一致。

## 8. 操作前检查

1. 练习文件夹里有 CSS-01、CSS-02、CSS-03 的练习文件，或者你新建了一个空文件夹，准备放本篇的 `animation.html`；
2. 编辑器保存编码是 UTF-8；
3. 如果你想做第 14 节的开发者工具检查，先确认按 F12 能打开开发者工具，找不到“Animations / 动画”面板也没关系，前三项验证不用它；
4. 如果你想验证暗黑模式，先确认你的系统或浏览器能切换深色 / 浅色（系统设置里找“外观”或“深色模式”），切不了也不影响前三项验证，暗黑模式那一节的代码本身不依赖你当时是不是深色。

## 9. 逐步操作

1. 在练习文件夹里新建文件 `animation.html`；
2. 把第 10 节的完整代码从头到尾复制进去；
3. 保存，UTF-8，双击用浏览器打开，看第 13 节描述的效果是否出现；
4. 先看按钮那一节：鼠标移到按钮上，按钮是不是在 0.3 秒里慢慢放大了一点、颜色慢慢变深了，移开是不是又慢慢缩回去了——慢慢变就是过渡生效了，瞬间变就是过渡没写上；
5. 再看卡片那一节：鼠标移到卡片上，卡片是不是往上抬了一点、阴影是不是变大了、左上角是不是多了一个小装饰条——抬起来加阴影就是 `transform` + `box-shadow` 生效了；
6. 再看加载那一节：页面一打开，圆圈是不是一直在转，不用悬停、不用点击——一直在转就是关键帧动画生效了；
7. 把系统切换到深色模式（或在浏览器开发者工具里模拟 `prefers-color-scheme: dark`），刷新页面，看背景和文字是不是变成了深色那套变量——变了就说明暗黑模式的变量切换通了；
8. 把第 10 节里的 `--main-color` 从 `#1a5276` 改成你喜欢的颜色，保存刷新，看标题、按钮、卡片装饰条是不是都跟着变了——都变了就说明“改一个变量全站变色”通了。

## 10. 完整代码

下面是本篇的完整示例，没有省略号，复制下来就是一个能打开的页面。存放位置：练习文件夹里的 `animation.html`，样式写在 `head` 里的 `<style>` 标签里，是内部引入方式。示例里含 `transition`、`transform`、`@keyframes`、CSS 变量各至少一处，三个交互效果（按钮悬停放大、卡片悬停抬起加阴影、加载旋转动画）都在这一页里，不要只复制其中一段。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS 动画和高级效果示例</title>
  <style>
    :root {
      --main-color: #1a5276;
      --main-color-dark: #154360;
      --bg: #ffffff;
      --text: #333333;
      --card-bg: #f2f2f2;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1e2129;
        --text: #e6e6e6;
        --card-bg: #272a35;
      }
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-size: 16px;
    }
    h1 {
      color: var(--main-color, #333333);
    }
    .btn {
      background-color: var(--main-color);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      transition: background-color 0.3s ease, transform 0.3s ease;
    }
    .btn:hover {
      background-color: var(--main-color-dark);
      transform: scale(1.05);
    }
    .btn:focus-visible {
      outline: 2px solid var(--main-color);
    }
    .card {
      position: relative;
      background-color: var(--card-bg);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 48px;
      height: 4px;
      background-color: var(--main-color);
      border-radius: 2px;
    }
    .card:hover {
      transform: translateY(-6px);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    }
    .card-list li:nth-child(2n) {
      background-color: var(--card-bg);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #dddddd;
      border-top-color: var(--main-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
    .fade-box {
      opacity: 1;
      transition: opacity 0.4s ease, visibility 0.4s ease;
    }
    .fade-box.hidden {
      opacity: 0;
      visibility: hidden;
    }
    .filtered {
      filter: brightness(1.1);
    }
    .gradient-box {
      background-image: linear-gradient(to right, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0)), radial-gradient(circle at top right, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0));
      background-color: var(--main-color);
      color: #ffffff;
      border-radius: 12px;
      padding: 20px;
    }
    .shadow-text {
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
    }
    @media (prefers-reduced-motion: reduce) {
      .btn,
      .card,
      .fade-box {
        transition: none;
      }
      .spinner {
        animation: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>动画和高级效果示例</h1>
    <p>本页演示过渡、变换、关键帧动画、CSS 变量、暗黑模式和减少动态效果。</p>
  </header>
  <main>
    <section id="buttons">
      <h2>按钮悬停放大</h2>
      <button class="btn" type="button">悬停试试</button>
      <p>鼠标移到按钮上，按钮会在 0.3 秒里慢慢放大并变深，移开又慢慢缩回去。</p>
    </section>
    <section id="cards">
      <h2>卡片悬停抬起加阴影</h2>
      <div class="card">
        <p>这是一张卡片，左上角有一条装饰条，那条装饰条是 ::before 做的，没有多加 HTML 标签。</p>
        <p>鼠标移到卡片上，卡片会往上抬 6px，阴影会变大变模糊。</p>
      </div>
      <ul class="card-list">
        <li>列表第 1 项</li>
        <li>列表第 2 项（偶数项，背景色不同）</li>
        <li>列表第 3 项</li>
        <li>列表第 4 项（偶数项，背景色不同）</li>
      </ul>
    </section>
    <section id="loading">
      <h2>加载旋转动画</h2>
      <div class="spinner" role="status" aria-label="正在加载"></div>
      <p>圆圈一直在转，不用悬停、不用点击，这就是关键帧动画自己跑的效果。</p>
    </section>
    <section id="theme">
      <h2>变量、渐变与滤镜</h2>
      <div class="gradient-box">
        <p class="shadow-text">多层渐变卡片：上面是半透明黑色渐变和径向光斑渐变，底色是主题变量。</p>
      </div>
      <p class="filtered">这一段用了滤镜调亮，整体比正常文字亮一点。</p>
      <div class="fade-box">
        <p>淡入淡出示例：这个盒子用了 opacity + visibility 过渡，适合做“先淡出再隐藏”的效果。</p>
      </div>
    </section>
  </main>
  <footer>
    <p>© 2026 动画和高级效果示例</p>
  </footer>
</body>
</html>
```

## 11. 完整配置文件

本篇不需要服务器配置文件，也不需要构建工具。唯一的文件就是第 10 节的 `animation.html`，放在练习文件夹根目录。以后部署时，这个文件要和它引用的资源（如果以后加了背景图片）一起放到网站目录里，并且保持相对路径不变；本篇示例没有引用外部图片文件，渐变和阴影都是纯 CSS，所以不存在裂图问题。

## 12. 每个关键属性的解释

### 过渡

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `transition-property` | 哪些属性要过渡，写 `all` 就是全部可过渡属性，写具体名字就是只过渡那几个 | 写 `all` 图方便，但页面上一动就全过渡，性能和意图都不清楚，正式项目写具体属性名 |
| `transition-duration` | 过渡时长，比如 `0.3s`、`300ms` | 时长太长（1 秒以上）会让人觉得页面“拖”，按钮、卡片悬停一般 0.2s～0.3s 就够了 |
| `transition-delay` | 延迟多久才开始过渡，比如 `0.1s` | 延迟是“等一等再动”，不是“动得慢一点”，和时长不要混淆 |
| `transition-timing-function` | 时间函数，速度曲线：`ease` 先快后慢（默认值）、`linear` 匀速、`ease-in` 先慢后快、`ease-out` 先快后慢、`ease-in-out` 两头慢中间快 | 加载旋转动画要用 `linear`，用 `ease` 转起来会一顿一顿的；悬停放大用 `ease` 更自然 |
| `transition` 简写 | `transition: 属性 时长 时间函数 延迟;`，比如 `transition: background-color 0.3s ease;` | 多个属性过渡时用逗号分隔，比如 `transition: transform 0.3s ease, box-shadow 0.3s ease;`，不要把两个属性写进同一条不加逗号 |
| 能过渡 vs 不能过渡 | `opacity`、`transform`、`color`、`background-color`、数值类宽高能过渡；`display` 不能过渡 | 想做淡入淡出再消失，不要只写 `display`，要用 `opacity` + `visibility` 配合，见第 10 节的 `.fade-box` |

### 变换

| 属性 / 函数 | 作用 | 容易错的地方 |
|---|---|---|
| `translateX()` / `translateY()` / `translate()` | 平移，比如 `translateY(-6px)` 是往上移 6px | 平移不改变布局占位，移上去后原来位置还留着，别的元素不会顶上来 |
| `scale()` | 缩放，比如 `scale(1.05)` 是放大 5%，`scale(0.9)` 是缩小 10% | 缩放也是显示效果，不改变布局占位，放大后可能盖住旁边的元素，要留好间距 |
| `rotate()` | 旋转，比如 `rotate(360deg)` 是转一圈，`rotate(45deg)` 是顺时针转 45 度 | 角度单位是 `deg`，不要漏写单位；旋转方向顺时针是正数 |
| `skew()` | 倾斜，比如 `skewX(10deg)` 是横向倾斜 10 度 | 倾斜会让文字也跟着斜，大面积文字不要用倾斜，只做装饰性倾斜 |
| `transform-origin` | 变换的原点，默认是元素中心（`50% 50%`），改成 `top left` 就是左上角为原点 | 旋转、缩放的效果全看原点在哪，原点改了，同一个 `rotate` 看起来完全不一样，调旋转缩放时先定原点 |
| 多个变换合写 | `transform: translateY(-6px) scale(1.05);`，多个函数写在同一条里，用空格分隔 | 顺序有影响，先平移后旋转和先旋转后平移，结果不一样，不要以为顺序可以随便换 |

### 关键帧动画

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `@keyframes 动画名` | 定义关键帧，`from` 等于 `0%`，`to` 等于 `100%`，中间可以加 `25%`、`50%` 等 | 动画名和 `animation-name` 必须一模一样，差一个字母动画就不跑 |
| `animation-name` | 用哪个关键帧动画 | 只写 `animation-name` 不写时长，动画不会跑，因为默认时长是 0s |
| `animation-duration` | 一次动画多长时间，比如 `1s` | 时长写 0 或漏写，动画等于没写 |
| `animation-timing-function` | 时间函数，和过渡的时间函数同一套，`linear`、`ease` 等 | 循环旋转动画用 `linear`，用 `ease` 会一顿一顿 |
| `animation-delay` | 延迟多久才开始 | 延迟期间元素显示的是起始状态还是结束状态，要看 `fill-mode`，不要默认以为延迟期间什么都不显示 |
| `animation-iteration-count` | 循环几次，数字或 `infinite`（无限循环） | 加载动画用 `infinite`，提示性动画用 1～3 次，无限循环的装饰动画不要用在正文大面积区域，容易让人分心 |
| `animation-direction` | 方向，`normal` 正向、`reverse` 反向、`alternate` 正反交替、`alternate-reverse` 反正交替 | 交替方向适合“来回摆动”的效果，加载旋转用 `normal` 就够了 |
| `animation-fill-mode` | 动画前后元素保持什么状态，`forwards` 是停在最后一帧，`backwards` 是延迟期间就显示第一帧，`both` 是两者都用 | 不写 `fill-mode`，动画一结束元素就跳回起始状态，想停在最后一帧必须写 `forwards` |
| `animation` 简写 | `animation: 名字 时长 时间函数 延迟 循环次数 方向 填充模式;`，比如 `animation: spin 1s linear infinite;` | 简写里时长和延迟都是时间值，第一个时间值是时长，第二个才是延迟，顺序不要写反 |

### 伪类与伪元素进阶

| 选择器 | 作用 | 容易错的地方 |
|---|---|---|
| `:hover` | 鼠标悬停时 | 触屏设备没有悬停，重要操作不要只靠悬停触发，悬停只做视觉反馈 |
| `:focus` | 获得焦点时（键盘 Tab、鼠标点击输入框等） | `:focus` 包括鼠标点击，点一下按钮也会出焦点样式，想只在键盘操作时显示焦点样式用 `:focus-visible` |
| `:focus-visible` | 键盘操作时才显示焦点样式 | 比 `:focus` 更精准，做无障碍时优先用它，WEB-03 讲过焦点可见的原则 |
| `:nth-child(n)` | 父元素里的第 n 个子元素，`2n` 是偶数个，`odd` 是奇数个 | `nth-child` 数的是所有子元素，不是同类元素，第 2 个 `li` 不一定是 `li:nth-child(2)`，中间插了一个别的标签就数错了；只数同类元素用 `:nth-of-type` |
| `::before` / `::after` | 在元素内容前面 / 后面虚拟出一个子元素 | 必须写 `content`，不写就不显示；虚拟元素默认是行内元素，要写宽高先改成 `block` 或 `inline-block`；装饰内容不要放重要文字，读屏软件有的会读出 `content` 里的文字，重要信息要放进 HTML 里 |
| 伪类 vs 伪元素 | 伪类一个冒号（状态），伪元素两个冒号（部分或虚拟子元素） | CSS-01 讲过，`:hover` 一个冒号，`::before` 两个冒号，不要混用 |

### CSS 变量

| 写法 | 作用 | 容易错的地方 |
|---|---|---|
| `--main-color: #1a5276;` | 定义变量，名字以两个减号开头 | 变量名大小写敏感，`--main-color` 和 `--Main-Color` 是两个变量 |
| `var(--main-color)` | 使用变量 | 变量没定义时，整条声明失效，不是 fallback 到默认值，要带 fallback 才安全 |
| `var(--main-color, #333333)` | 带 fallback 的使用，没定义时用 `#333333` | 写组件库、写可复用样式时要带 fallback，自己项目里全站都定义了可以不带，但第一次用时先确认定义了 |
| `:root` 定义 | 定义在根元素上，全站都能用 | `:root` 就是 `html`，不要再定义一个 `html` 和一个 `:root` 两套，重复定义容易改漏 |
| 局部定义 | 定义在某个类里，只有那个类及其子元素能用 | 局部变量会覆盖根变量，子元素没定义时继承父级的值，调主题时先查变量是在哪一层定义的 |

### 滤镜、阴影、渐变

| 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `filter: blur(4px)` | 模糊 | 模糊整个元素，包括里面的文字，大面积文字不要模糊，只做背景、图片的模糊 |
| `filter: brightness(1.2)` | 调亮 20%，`brightness(0.8)` 是调暗 20% | 亮度调过头文字对比度不够，无障碍上吃亏，WEB-03 讲过对比度至少 4.5:1 |
| `filter: grayscale(100%)` | 变灰 | 悬停从灰变彩是常见效果，写法是平时 `grayscale(100%)`，悬停 `grayscale(0%)`，两个状态都要写 `transition` 才平滑 |
| `filter: drop-shadow()` | 按元素形状投阴影，镂空图片、文字用它更贴合 | 和 `box-shadow` 混淆，`box-shadow` 是按矩形盒子投阴影，镂空图片用 `box-shadow` 会投出一个方块阴影 |
| `box-shadow` | 盒子阴影，`横向偏移 纵向偏移 模糊半径 扩散半径 颜色` | 阴影太大、太黑会让卡片显得脏，卡片抬起一般用 `0 12px 28px rgba(0, 0, 0, 0.18)` 这种小透明阴影，不要用纯黑大阴影 |
| `text-shadow` | 文字阴影，写法和 `box-shadow` 类似 | 文字阴影只做装饰，不要靠阴影来保证文字可读，可读靠颜色对比度 |
| 多层渐变 | `background-image` 里用逗号写多个渐变，第一层在最上面 | 层与层之间用逗号分隔，漏了逗号整条失效；每一层都可以单独写位置和尺寸，合起来就是一张不用图片文件的背景图 |

### 暗黑模式与减少动态效果

| 写法 | 作用 | 容易错的地方 |
|---|---|---|
| `@media (prefers-color-scheme: dark)` | 系统是深色时生效，里面重定义同一批变量 | 页面里所有颜色都要走变量，漏了一个写死颜色的地方，暗黑模式下那个地方会突兀地亮着 |
| `@media (prefers-color-scheme: light)` | 系统是浅色时生效，一般不用单独写，浅色就是默认那套 | 不用给浅色再写一套，默认变量就是浅色，暗黑里只写要变的那几个变量 |
| `@media (prefers-reduced-motion: reduce)` | 用户设了减少动态效果时生效，里面关掉或减弱动画 | 只关 `animation` 不关 `transition`，悬停放大还在动，等于没关全；两个都要关，见第 10 节的写法 |

## 13. 执行结果示例

双击打开后，你应该看到（没有布局样式，所以还是朴素的上下排列，动效变了就是成功）：

- 按钮那一节：鼠标移到按钮上，按钮在 0.3 秒里慢慢放大 5%、颜色慢慢变深，移开又慢慢缩回去、颜色慢慢变回来；瞬间变就是过渡没生效，慢慢变就是过渡生效了；
- 卡片那一节：卡片左上角有一条 48px 宽、4px 高的主题色装饰条，那条装饰条没有对应的 HTML 标签，是 `::before` 虚拟出来的；鼠标移到卡片上，卡片往上抬 6px，阴影从 `0 2px 8px` 变成 `0 12px 28px`，看起来像浮起来了；列表里第 2、4 项的背景色和第 1、3 项不一样，这是 `:nth-child(2n)` 的效果；
- 加载那一节：页面一打开，圆圈就一直在转，1 秒一圈，匀速，不用悬停、不用点击；圆圈是边框做的，只有顶部边框是主题色，转起来就是一个旋转的缺口圆环；
- 主题那一节：多层渐变卡片上面是半透明黑色渐变和径向光斑渐变，底色是主题变量；滤镜那段比正常文字亮一点；淡入淡出盒子平时正常显示，加了 `hidden` 类后会先淡出再隐藏（本页没有按钮去加这个类，代码在那里，逻辑在第 12 节讲过）；
- 暗黑模式：把系统切换到深色，刷新页面，背景变成深 slate 色（`#1e2129`），文字变成浅灰色，卡片背景变成深灰色（`#272a35`），标题、按钮、装饰条的颜色还是主题色，没有突兀的亮块；
- 减少动态效果：把系统设为减少动态效果，刷新页面，按钮悬停不再放大、卡片不再抬起、加载圆圈不再转，页面变成静态的，这就是 `prefers-reduced-motion` 生效了。

如果你看到的效果是“按钮瞬间变色、卡片瞬间抬起”，先查 `transition` 是不是写在了悬停状态上而不是平时状态上——过渡要写在平时状态（`.btn`、`.card`）上，写在 `:hover` 上只在移上去时生效，移开时就瞬间回去了。

## 14. 成功验证

按顺序做，全部通过才算本篇完成：

1. **文件验证**：`animation.html` 在练习文件夹里，双击能打开，不是 `.txt`；
2. **按钮验证**：鼠标移到按钮上，按钮慢慢放大并变深，移开慢慢缩回（不是瞬间变）；
3. **卡片验证**：鼠标移到卡片上，卡片往上抬、阴影变大，左上角装饰条存在且没有对应的 HTML 标签（查看源代码，装饰条不在 HTML 里，只在 CSS 的 `::before` 里）；
4. **加载验证**：页面一打开，圆圈一直在转，1 秒一圈，匀速；
5. **变量验证**：把 `:root` 里的 `--main-color` 改成别的颜色，保存刷新，标题、按钮、卡片装饰条、加载圆圈顶部边框都跟着变了；
6. **暗黑模式验证**：把系统切换到深色，刷新页面，背景和文字变成深色那套变量，没有突兀的亮块；
7. **减少动态验证**：把系统设为减少动态效果，刷新页面，按钮、卡片、加载动画都不动了；
8. **可选的开发者工具验证**：按 F12，打开“Animations / 动画”面板，选中加载圆圈，看是不是有一条 1 秒循环的动画在跑；再看按钮的样式面板，`transition` 是不是写在平时状态上。

注意：本篇的动画效果（悬停放大、卡片抬起、加载旋转、暗黑切换）必须在浏览器里看才能验证，curl 只能验证文件能返回、字节数对得上，不能验证动画本身。第 5 节汇报里会如实说明这一点，不把 curl 通过说成动画测试通过。

## 15. 常见错误

| 错误 | 现象 | 改法 |
|---|---|---|
| 过渡写在 `:hover` 上 | 移上去慢慢变，移开瞬间变回去 | 过渡写在平时状态（`.btn`、`.card`）上，不要写在 `:hover` 上 |
| `display` 做过渡 | 淡入淡出没效果，元素直接出现 / 消失 | `display` 不能过渡，用 `opacity` + `visibility` 配合，见第 10 节的 `.fade-box` |
| 动画名和关键帧名对不上 | 动画完全不跑 | `@keyframes` 的名字和 `animation-name`（或简写里的名字）必须一模一样 |
| 只写 `animation-name` 不写时长 | 动画不跑 | 默认时长是 0s，必须写时长，比如 `1s` |
| 动画结束跳回起始状态 | 动画播完一下子回到开头 | 想停在最后一帧，写 `animation-fill-mode: forwards` |
| 加载动画用 `ease` | 转起来一顿一顿 | 循环旋转用 `linear`，匀速才像加载 |
| `::before` / `::after` 没写 `content` | 装饰条、装饰点完全不显示 | 必须写 `content`，哪怕是空字符串 `content: "";` |
| 伪元素没改 `display` 就写宽高 | 宽高没反应 | 虚拟元素默认是行内元素，写宽高前先改成 `block` 或 `inline-block`，或用定位 |
| `:nth-child` 数错 | 隔行变色隔错了行 | `nth-child` 数的是所有子元素，不是同类元素，中间插了别的标签就数错了，只数同类用 `:nth-of-type` |
| 变量没定义就直接用 | 整条声明失效，颜色没变 | 先确认变量定义了，或者带 fallback 写 `var(--main-color, #333333)` |
| 暗黑模式漏了写死颜色 | 深色下某个地方突兀地亮着 | 页面里所有颜色走变量，写死颜色的地方一个一个改成变量 |
| 只关动画不关过渡 | 减少动态效果下悬停还在动 | `prefers-reduced-motion` 里 `transition` 和 `animation` 都要关 |
| 对宽高、边距做大范围动画 | 动画卡顿，页面掉帧 | 能用 `transform` 和 `opacity` 解决的，就不要用宽高和边距 |
| 重要操作只靠悬停触发 | 触屏用户点不到，键盘用户走不到 | 悬停只做视觉反馈，重要操作要有点击、键盘都能触发的路径 |
| 重要文字放进 `::before` 的 `content` 里 | 读屏软件有的读不出来，复制粘贴也复制不到 | 重要信息放进 HTML 里，`::before` 只做装饰 |

## 16. 故障排查

- **过渡完全没动**：先看过渡是不是写在平时状态上，再看起始和结束状态是不是都有这个属性的确定值，再看是不是 `display` 这种不能过渡的属性。
- **过渡只动一半**：先看 `transition-property` 是不是只写了一个属性，另一个属性没写进去；多属性过渡要用逗号分隔。
- **动画完全不跑**：先看动画名和关键帧名是不是一致，再看时长是不是 0 或漏写，再看是不是被 `prefers-reduced-motion` 关掉了（系统设了减少动态效果时，本篇示例会主动关掉动画）。
- **动画跑完跳回去**：看 `fill-mode`，想停在最后一帧写 `forwards`。
- **装饰条、装饰点不显示**：先看 `content` 写了没有，再看是不是行内元素没改 `display` 就写了宽高，再看是不是被别的元素盖住了（查 `z-index` 和定位，CSS-03 讲过）。
- **暗黑模式没变**：先看系统是不是真的切到深色了，再看媒体查询是不是写成了 `prefers-color-scheme: dark`，再看页面里的颜色是不是都走了变量，有没有写死颜色的地方。
- **减少动态效果没生效**：先看系统设置，再看媒体查询里是不是 `transition` 和 `animation` 都关了，只关一个等于没关全。
- **动画卡顿**：先看是不是对宽高、边距做了动画，改成 `transform` 和 `opacity`；再看是不是同时跑了太多动画，关掉不必要的循环动画。
- **改了 CSS 刷新没变**：确认保存了，再按 Ctrl+F5 强制刷新，排除浏览器缓存。

## 17. 安全注意事项

- CSS 动画和滤镜本身不能直接偷数据、不能运行脚本，但从不可信来源引入的外部样式表仍然有风险，CSS-01 第 17 节讲过，正式网站只引用自己站内或可信 CDN 的样式表。
- 不要用动画去遮挡重要按钮：`position: fixed`、大 `z-index`、全屏动画盖住“取消”“关闭”按钮时，用户点不到重要操作，CSS-03 第 17 节讲过这个原则，动画也一样。
- 动画不要做得让人不适：高频闪烁、快速旋转、大面积循环动画，可能诱发不适甚至光敏反应，循环动画要克制，重要提示不要用闪烁做唯一提醒，还要用文字说明。
- 尊重 `prefers-reduced-motion` 不是可选项，是无障碍的一部分：用户明确要求减少动态时，页面就应该关掉或减弱动画，不要为了效果好看硬要转。
- 不要把真实用户的隐私信息写进示例代码里，占位文字就够了。

## 18. 回滚和恢复

本篇和 CSS-01、CSS-02、CSS-03、WEB 系列一样，没有服务器、没有数据库、没有配置改动，回滚就是：

- 改错了：编辑器里 Ctrl+Z 撤销，或把第 10 节的完整代码重新复制覆盖一次；
- 动画改乱了：把 `animation`、`transition` 删掉，元素就回到静态样式，再一步一步加动画；
- 变量改错了：把 `:root` 里的变量改回原来的值，全站用这个变量的地方就回来了；
- 文件删错了：重新新建 `animation.html`，把第 10 节代码再贴一遍；
- 没有任何线上内容会被影响，因为本篇文件只在你的练习文件夹里，还没有部署到 crozz.me。

## 19. 延伸阅读

- MDN 过渡：https://developer.mozilla.org/zh-CN/docs/Web/CSS/transition
- MDN 变换：https://developer.mozilla.org/zh-CN/docs/Web/CSS/transform
- MDN 动画：https://developer.mozilla.org/zh-CN/docs/Web/CSS/animation
- MDN 关键帧：https://developer.mozilla.org/zh-CN/docs/Web/CSS/@keyframes
- MDN CSS 变量：https://developer.mozilla.org/zh-CN/docs/Web/CSS/--*
- MDN 暗黑模式与减少动态效果：https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media/prefers-color-scheme

## 20. 相关章节链接

- 上一篇：[CSS-03 CSS 盒模型与定位](./03-box-position.md)
- 再往前：[CSS-01 CSS 基础语法与选择器](./01-basics.md)、[CSS-02 CSS 单位与颜色、字体、背景、边框](./02-units-colors.md)、[WEB-03 HTML SEO 与无障碍](../html/03-seo-a11y.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[CSS-08 CSS 工程化](./08-engineering.md)
