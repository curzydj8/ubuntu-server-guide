# CSS-14：自己编写 CSS 框架

> 任务编号：CSS-14（网站建设与部署实战指南 · CSS 框架第 6 篇）
> 上一篇：[CSS-13 Pico CSS / Materialize](./05-pico-materialize.md)；下一篇：[CSS-15 完整 Design System](./07-design-system.md)。
> 本篇只讲从零设计一个小型 CSS 框架：变量与主题、栅格、按钮 / 卡片 / 表单组件、工具类、命名规范、文件组织、本地文件引用发布。不讲某个现成框架的组件用法（那是 CSS-09 至 CSS-13 的内容），不讲 Sass 编译配置（概念见 CSS-08，构建配置在 JS-04 讲），不讲 JavaScript 交互（按钮点击后的行为不在本篇范围内）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚一个 CSS 框架到底是什么：不是一堆现成页面，而是一套可复用的类名约定 + 一套基础样式；
2. 从零设计一个小型框架，包含变量与主题、栅格、按钮、卡片、表单、工具类六部分；
3. 用统一前缀和 BEM 命名写组件，让框架的类名不和业务样式撞名；
4. 把框架拆成一个独立文件，用 `<link>` 引用到任意页面，做到改一处框架、所有页面一起变；
5. 给框架定版本号和回滚办法，知道什么时候该自己写框架、什么时候该直接用现成框架。

## 2. 适用人群

- 已完成 CSS-01 至 CSS-06，能写选择器、单位、颜色、盒模型、定位、Flex、Grid、响应式的人；
- 已完成 CSS-08，知道 BEM 命名和文件组织为什么重要的人；
- 正在做两三个页面以上的小网站，每次复制粘贴同一套按钮、卡片样式已经觉得烦的人；
- 想理解现成框架内部是怎么组织的人——自己写一遍，比只看文档理解得深。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 均可；编辑器：任意纯文本编辑器；浏览器：任意现代浏览器。
- CSS 版本：CSS3 及之后的标准，本篇只用原生 CSS，不依赖任何预处理器，复制下来就能在浏览器里打开。
- 框架版本：本篇设计的框架叫 MyKit，版本定为 1.0.0，写在文件头的注释里；以后改框架，先改版本号再发新文件，办法见第 18 节。
- 不需要安装任何东西，不需要联网，不需要构建工具。

## 4. 使用前提

- 已完成 CSS-01（选择器、优先级、继承），知道类选择器为什么比 ID 选择器更适合写框架；
- 已完成 CSS-02（单位、颜色、字体、背景、边框），能看懂示例里的颜色变量、圆角、边框写法；
- 已完成 CSS-03（盒模型、定位），知道 `box-sizing: border-box` 为什么要写在框架开头；
- 已完成 CSS-04（Flexbox）和 CSS-05（Grid），本篇的栅格用 Flex 实现，你要能看懂 `flex` 的伸缩含义；
- 已完成 CSS-06（响应式），知道媒体查询和移动优先是什么意思；
- 已完成 CSS-08（工程化），知道 BEM 的 `Block__Element--Modifier` 写法和“按谁用分文件”的原则。

## 5. 所需资源

- 一个练习文件夹，例如 `mykit-demo/`，里面放第 10 节的完整示例页和第 11 节的框架文件；
- 本篇第 10 节的完整示例页（一个 HTML 文件，内部 `<style>` 就是框架核心，复制下来能打开）；
- 本篇第 11 节的完整框架文件 `mykit.css`（和第 10 节的核心样式是同一套规则，只是从 HTML 里拆出来单独存放）；
- 可选：浏览器的开发者工具（按 F12），用来做第 14 节的检查，没有也不影响前两项验证。

## 6. 技术原理

### 框架是什么：约定 + 基础样式，不是魔法

一个 CSS 框架由两部分组成。第一部分是**约定**：类名怎么写、栅格怎么分、颜色怎么取名字，所有用这个框架的人都按同一套约定写，页面长得才一致。第二部分是**基础样式**：把约定落到实处的 CSS 规则，例如 `.mk-btn` 长什么样、`.mk-card` 的边框和内边距是多少。没有约定的样式只是散落的规则，换人维护就乱；没有基础样式的约定只是空口号，写页面时还是各写各的。

### 为什么要先定变量，再写组件

颜色、字号、间距、圆角这些值会在几十处出现。如果每处都写死一个具体数字，换一次主题色就要改几十处，还容易漏。先把这些值定义成 CSS 变量，例如 `--mk-color-primary`、 `--mk-space-2`、 `--mk-radius`，组件里只引用变量，不写具体数字，换主题就只改变量那几行。主题切换也是这个原理：浅色主题是一组变量值，深色主题是另一组变量值，切换主题就是换一组变量，不用重写每个组件。

### 为什么栅格用 Flex 而不是 Grid

本篇的栅格用 Flex 实现，理由只有一个：对初学者框架来说，Flex 的“一行里几个格子、每个格子占几份”最直观，`.mk-row` 是弹性容器，`.mk-col-4` 是占 4 份的格子，份数加起来不超过 12 就能排一行。Grid 当然也能做栅格，而且二维能力更强，但框架的栅格通常只需要“一行分几列”这一种能力，用 Flex 已经够了，代码也更短。等框架需要复杂的二维排版时，再在 Grid 那一层扩展，不影响已经写好的 Flex 栅格。

### 为什么类名要加统一前缀

框架的类名会被很多页面引用，一旦和业务样式撞名，改框架就会误伤业务页面，改业务页面也可能误伤框架。统一前缀就是一道隔离墙：本篇所有框架类名都以 `mk-` 开头（MyKit 的缩写），业务样式不许用 `mk-` 开头，两边永远不会撞名。现成框架也是这个做法，只是前缀不同。命名规范的完整规则在第 7 节。

## 7. 架构说明

MyKit 1.0.0 由六层组成，从底到顶的顺序就是样式文件里的书写顺序，越底层的越先写，越不能被上层随意覆盖：

| 层 | 放什么 | 对应类名示例 |
| --- | --- | --- |
| 变量层 | 颜色、字号、间距、圆角、断点相关的变量 | `--mk-color-primary`、`--mk-space-2` |
| 基础层 | 全局盒模型、 body 默认字体和行高、链接默认色 | `*`、`body`、`a` |
| 栅格层 | 容器、行、列，移动优先，窄屏自动单列 | `.mk-container`、`.mk-row`、`.mk-col-4` |
| 组件层 | 按钮、卡片、表单控件，每个组件一个 Block | `.mk-btn`、`.mk-card`、`.mk-input` |
| 工具层 | 只做一件事的小类，用来微调，不许写组件样式 | `.mk-text-center`、`.mk-mt-2` |
| 主题层 | 深色主题的变量覆盖，放在最后 | `[data-theme="dark"]` |

文件组织分两个阶段。学习阶段用一个文件 `mykit.css`，六层按顺序写在一起，方便对照着看；项目变大以后再拆成多个文件（办法见第 11 节），拆分后用一个入口文件按同样顺序汇总。无论拆不拆，六层的顺序不能乱：工具层写在组件层之后，主题层写在最后，否则优先级和覆盖关系会出错。

命名规范只有四条，写框架时必须遵守：

1. 所有框架类名以 `mk-` 开头，业务样式不许用这个前缀；
2. 组件用 BEM 写法：块是 `.mk-card`，块里的元素是 `.mk-card__title`，变体是 `.mk-card--featured`，元素和变体之间用双下划线、双短横线区分；
3. 工具类只做一件事，名字就是它做的事，例如 `.mk-text-center` 只管居中，不管颜色和字号；
4. 不用 ID 选择器写框架样式，不用 `!important`，框架的优先级要靠顺序和类选择器本身控制，不能靠强制提升。

## 8. 操作前检查

开始写之前，先确认下面五项，缺一项就先补齐再动手：

1. 能新建文件夹和 `.html`、`.css` 文件，保存时编码是 UTF-8；
2. 知道浏览器里按 F5 刷新、按 F12 打开开发者工具、怎么看“元素”面板里某个元素命中的样式；
3. 已经读过 CSS-08 的 BEM 一节，能说出 `.mk-card__title` 里哪部分是块、哪部分是元素；
4. 练习文件夹是空的或者只有你自己的练习文件，不要在已有项目的样式目录里直接动手，避免覆盖别人的文件；
5. 想清楚这个框架给谁用：本篇的 MyKit 是给“自己做两三个页面小网站”用的，不是给“所有项目通用”的，范围越小，框架越容易写完、越容易维护。

## 9. 逐步操作

按下面七步做，每步做完保存一次，不要跳步：

1. 新建练习文件夹 `mykit-demo/`，在里面新建 `index.html`，先把第 10 节的完整示例页原样复制进去，在浏览器里打开，确认页面能正常显示；
2. 对照第 10 节的 `<style>`，在纸上或注释里标出六层：变量层是哪几行、栅格层是哪几行、组件层是哪几行、工具层和主题层又各是哪几行；
3. 把 `<style>` 里的规则原样复制到一个新文件 `css/mykit.css` 里（内容就是第 11 节），在 `index.html` 里删掉 `<style>`，改成用 `<link>` 引用这个文件，再刷新页面，确认显示和原来一模一样；
4. 改一个变量的值，例如把 `--mk-color-primary` 从蓝色改成绿色，刷新页面，确认所有主色按钮、链接、卡片标题一起变色，体会“改一处、全站变”的含义；
5. 给页面加一个深色切换：在 `<html>` 标签上加 `data-theme="dark"`，刷新页面，确认背景、文字、卡片颜色都变成深色那一组，再把属性去掉，恢复浅色；
6. 自己加一个新组件：按 BEM 规范写一个 `.mk-alert`（提示条），包含默认和成功两种变体，用在页面里，确认它不影响已有的按钮和卡片；
7. 给框架写版本号：把文件头的注释改成 `MyKit 1.0.1`，并在注释里写一行改了什么，养成“每次改框架都留记录”的习惯。

## 10. 完整代码

下面是完整示例页，HTML + 内部 `<style>`，无省略号，复制下来保存为 `index.html` 就能打开。注意：这里的 `<style>` 就是 MyKit 框架的核心样式，第 11 节的 `mykit.css` 是同一套规则拆出来的独立文件，两边类名和变量名完全一致。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MyKit 框架示例页</title>
<style>
:root {
  --mk-color-primary: #2563eb;
  --mk-color-text: #1f2937;
  --mk-color-muted: #6b7280;
  --mk-color-border: #d1d5db;
  --mk-color-bg: #ffffff;
  --mk-color-page: #f3f4f6;
  --mk-space-1: 8px;
  --mk-space-2: 16px;
  --mk-space-3: 24px;
  --mk-radius: 8px;
  --mk-font-size: 16px;
}
[data-theme="dark"] {
  --mk-color-text: #f3f4f6;
  --mk-color-muted: #9ca3af;
  --mk-color-border: #374151;
  --mk-color-bg: #1f2937;
  --mk-color-page: #111827;
}
* { box-sizing: border-box; }
body { margin: 0; font-size: var(--mk-font-size); line-height: 1.6; color: var(--mk-color-text); background: var(--mk-color-page); font-family: system-ui, sans-serif; }
a { color: var(--mk-color-primary); }
.mk-container { max-width: 960px; margin: 0 auto; padding: 0 var(--mk-space-2); }
.mk-row { display: flex; flex-wrap: wrap; margin-left: -8px; margin-right: -8px; }
.mk-col { flex: 1; padding-left: 8px; padding-right: 8px; }
.mk-col-4 { flex: 0 0 33.333%; max-width: 33.333%; padding-left: 8px; padding-right: 8px; }
.mk-col-6 { flex: 0 0 50%; max-width: 50%; padding-left: 8px; padding-right: 8px; }
.mk-col-12 { flex: 0 0 100%; max-width: 100%; padding-left: 8px; padding-right: 8px; }
.mk-btn { display: inline-block; padding: 8px 16px; border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); background: var(--mk-color-bg); color: var(--mk-color-text); cursor: pointer; font-size: 16px; }
.mk-btn--primary { background: var(--mk-color-primary); border-color: var(--mk-color-primary); color: #ffffff; }
.mk-btn--danger { background: #dc2626; border-color: #dc2626; color: #ffffff; }
.mk-btn--large { padding: 12px 24px; font-size: 18px; }
.mk-card { background: var(--mk-color-bg); border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); padding: var(--mk-space-2); margin-bottom: var(--mk-space-2); }
.mk-card__title { margin-top: 0; color: var(--mk-color-primary); }
.mk-card__text { color: var(--mk-color-muted); }
.mk-field { margin-bottom: var(--mk-space-2); }
.mk-label { display: block; margin-bottom: 4px; }
.mk-input { width: 100%; padding: 8px; border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); font-size: 16px; background: var(--mk-color-bg); color: var(--mk-color-text); }
.mk-input--error { border-color: #dc2626; }
.mk-help { color: var(--mk-color-muted); font-size: 14px; }
.mk-text-center { text-align: center; }
.mk-mt-2 { margin-top: 16px; }
@media (max-width: 600px) {
  .mk-col-4, .mk-col-6 { flex: 0 0 100%; max-width: 100%; }
}
</style>
</head>
<body>
<div class="mk-container">
  <h1 class="mk-text-center">MyKit 框架示例页</h1>
  <p class="mk-text-center">这是一个用自写框架搭出来的页面，按钮、卡片、表单都来自同一套类名。</p>
  <div class="mk-row">
    <div class="mk-col-4">
      <div class="mk-card">
        <h2 class="mk-card__title">卡片一</h2>
        <p class="mk-card__text">卡片的标题用主色，说明文字用灰色，颜色都来自变量。</p>
        <button class="mk-btn mk-btn--primary" type="button">主按钮</button>
      </div>
    </div>
    <div class="mk-col-4">
      <div class="mk-card">
        <h2 class="mk-card__title">卡片二</h2>
        <p class="mk-card__text">三列栅格在窄屏下会自动变成单列，不用给每个卡片单独写媒体查询。</p>
        <button class="mk-btn" type="button">默认按钮</button>
      </div>
    </div>
    <div class="mk-col-4">
      <div class="mk-card">
        <h2 class="mk-card__title">卡片三</h2>
        <p class="mk-card__text">大号按钮只是多加了一个变体类，基础按钮样式不用重写。</p>
        <button class="mk-btn mk-btn--large" type="button">大号按钮</button>
      </div>
    </div>
  </div>
  <div class="mk-row">
    <div class="mk-col-6">
      <div class="mk-card">
        <h2 class="mk-card__title">留言表单</h2>
        <div class="mk-field">
          <label class="mk-label" for="demo-name">姓名</label>
          <input class="mk-input" id="demo-name" type="text" placeholder="请输入姓名">
        </div>
        <div class="mk-field">
          <label class="mk-label" for="demo-text">留言</label>
          <input class="mk-input mk-input--error" id="demo-text" type="text" placeholder="这一项用了错误状态">
          <p class="mk-help">红色边框表示这一项有错误，提示文字用灰色小字。</p>
        </div>
        <button class="mk-btn mk-btn--primary" type="button">提交</button>
        <button class="mk-btn mk-btn--danger" type="button">删除</button>
      </div>
    </div>
    <div class="mk-col-6">
      <div class="mk-card">
        <h2 class="mk-card__title">工具类示例</h2>
        <p class="mk-card__text">下面这个按钮只用工具类加了上边距，没有为它单独写样式。</p>
        <button class="mk-btn mk-mt-2" type="button">带上边距的按钮</button>
        <p class="mk-mt-2"><a href="#">这是一个链接</a>，颜色同样来自主色变量。</p>
      </div>
    </div>
  </div>
</div>
</body>
</html>
```

## 11. 完整配置文件

框架文件本身就是本篇的“配置文件”，存放路径是练习文件夹里的 `css/mykit.css`，页面用下面这一行引用它（放在 `<head>` 里，替换第 10 节示例里的整个 `<style>` 块）：

```text
<link rel="stylesheet" href="css/mykit.css">
```

`css/mykit.css` 的完整内容如下，和第 10 节 `<style>` 里的规则是同一套，只是从 HTML 里拆出来单独存放，无省略号：

```css
/* MyKit 1.0.0：自写小型 CSS 框架，作者自用，改动请先改版本号 */
:root {
  --mk-color-primary: #2563eb;
  --mk-color-text: #1f2937;
  --mk-color-muted: #6b7280;
  --mk-color-border: #d1d5db;
  --mk-color-bg: #ffffff;
  --mk-color-page: #f3f4f6;
  --mk-space-1: 8px;
  --mk-space-2: 16px;
  --mk-space-3: 24px;
  --mk-radius: 8px;
  --mk-font-size: 16px;
}
[data-theme="dark"] {
  --mk-color-text: #f3f4f6;
  --mk-color-muted: #9ca3af;
  --mk-color-border: #374151;
  --mk-color-bg: #1f2937;
  --mk-color-page: #111827;
}
* { box-sizing: border-box; }
body { margin: 0; font-size: var(--mk-font-size); line-height: 1.6; color: var(--mk-color-text); background: var(--mk-color-page); font-family: system-ui, sans-serif; }
a { color: var(--mk-color-primary); }
.mk-container { max-width: 960px; margin: 0 auto; padding: 0 var(--mk-space-2); }
.mk-row { display: flex; flex-wrap: wrap; margin-left: -8px; margin-right: -8px; }
.mk-col { flex: 1; padding-left: 8px; padding-right: 8px; }
.mk-col-4 { flex: 0 0 33.333%; max-width: 33.333%; padding-left: 8px; padding-right: 8px; }
.mk-col-6 { flex: 0 0 50%; max-width: 50%; padding-left: 8px; padding-right: 8px; }
.mk-col-12 { flex: 0 0 100%; max-width: 100%; padding-left: 8px; padding-right: 8px; }
.mk-btn { display: inline-block; padding: 8px 16px; border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); background: var(--mk-color-bg); color: var(--mk-color-text); cursor: pointer; font-size: 16px; }
.mk-btn--primary { background: var(--mk-color-primary); border-color: var(--mk-color-primary); color: #ffffff; }
.mk-btn--danger { background: #dc2626; border-color: #dc2626; color: #ffffff; }
.mk-btn--large { padding: 12px 24px; font-size: 18px; }
.mk-card { background: var(--mk-color-bg); border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); padding: var(--mk-space-2); margin-bottom: var(--mk-space-2); }
.mk-card__title { margin-top: 0; color: var(--mk-color-primary); }
.mk-card__text { color: var(--mk-color-muted); }
.mk-field { margin-bottom: var(--mk-space-2); }
.mk-label { display: block; margin-bottom: 4px; }
.mk-input { width: 100%; padding: 8px; border: 1px solid var(--mk-color-border); border-radius: var(--mk-radius); font-size: 16px; background: var(--mk-color-bg); color: var(--mk-color-text); }
.mk-input--error { border-color: #dc2626; }
.mk-help { color: var(--mk-color-muted); font-size: 14px; }
.mk-text-center { text-align: center; }
.mk-mt-2 { margin-top: 16px; }
@media (max-width: 600px) {
  .mk-col-4, .mk-col-6 { flex: 0 0 100%; max-width: 100%; }
}
```

项目变大以后，可以把这一个文件按六层拆成多个文件，再用一个入口文件按同样顺序汇总，存放路径示例：

```text
css/mykit/
  variables.css   变量层
  base.css        基础层
  grid.css        栅格层
  components.css  组件层
  utilities.css   工具层
  theme.css       主题层
css/mykit.css     入口文件，按上面顺序汇总六个文件
```

拆分是可选的，不是必须的。拆分后不要改变六层的顺序，也不要在入口文件里再写任何组件样式，入口只负责汇总。

## 12. 每个关键配置项的解释

| 配置项 | 含义 | 改了会怎样 |
| --- | --- | --- |
| `--mk-color-primary` | 主色，链接、卡片标题、主按钮共用 | 全站主色一起变，不用逐个改按钮和标题 |
| `--mk-color-text` / `--mk-color-muted` | 正文色 / 次要文字色 | 正文和说明文字一起变，深色主题靠改这两个值实现 |
| `--mk-color-border` / `--mk-color-bg` / `--mk-color-page` | 边框色 / 卡片背景 / 页面背景 | 卡片和页面背景分开控制，深色主题下卡片仍比页面亮一档 |
| `--mk-space-1` / `--mk-space-2` / `--mk-space-3` | 间距三档：8px / 16px / 24px | 间距体系统一，不会出现 13px、17px 这种随意值 |
| `--mk-radius` | 圆角，按钮、卡片、输入框共用 | 全站圆角风格统一，改一处就全变 |
| `--mk-font-size` | 基准字号，body 引用它 | 基准字号一改，全站正文跟着变 |
| `[data-theme="dark"]` | 深色主题的变量覆盖，写在变量层之后 | 给 `<html>` 加这个属性就切深色，不用重写组件 |
| `* { box-sizing: border-box; }` | 全局盒模型，宽度含内边距和边框 | 栅格列宽算起来才准，否则列宽加内边距会溢出 |
| `.mk-container` | 内容最大宽度 960px，水平居中 | 页面不会在宽屏上无限拉宽，两边留白一致 |
| `.mk-row` 的负边距 | 左右各 -8px，抵消列的左右内边距 | 第一列和最后一列才能和容器边缘对齐，否则两侧会多出 8px |
| `.mk-col-4` / `.mk-col-6` / `.mk-col-12` | 占 4 / 6 / 12 份的列，12 份为一行 | 三个 `.mk-col-4` 正好一行，两个 `.mk-col-6` 正好一行，超了就换行 |
| `@media (max-width: 600px)` | 窄屏下所有分列都变单列 | 手机上不用横向滚动，栅格在窄屏自动恢复成上下排列 |
| `.mk-btn--primary` 等变体 | 只改颜色或尺寸，不重复写基础按钮样式 | 加一个类就能换风格，基础样式只写一次 |

## 13. 执行结果示例

按第 9 节做完后，浏览器里应该看到：

1. 页面居中，最大宽度 960px，背景是浅灰色，标题和说明文字居中；
2. 第一行是三个并排的卡片，卡片标题是蓝色，说明文字是灰色，每个卡片里有一个按钮；
3. 第二行左边是留言表单，姓名输入框是正常边框，留言输入框是红色边框，下面有一行灰色小字提示；
4. 第二行右边是工具类示例，按钮上方有一段间距，链接是蓝色；
5. 把浏览器窗口拉窄到 600px 以下时，三列卡片和两列布局都变成上下单列排列，不出现横向滚动条；
6. 给 `<html>` 标签加上 `data-theme="dark"` 并刷新后，页面背景变深，卡片背景变深灰，文字变浅色，按钮和链接的主色不变；
7. 把 `--mk-color-primary` 改成绿色并刷新后，所有蓝色元素（链接、卡片标题、主按钮）一起变成绿色。

如果第 5 条没做到，先检查媒体查询是不是写在文件最后、列的 `max-width` 有没有写；如果第 6 条没做到，先检查 `data-theme` 是不是加在 `<html>` 标签上，而不是加在 `<body>` 上。

## 14. 成功验证

按下面四步验证，前两步是本机实测通过的标准，后两步是读者在浏览器里的验证：

1. **结构验证**：用 Python `html.parser` 解析第 10 节完整示例，标签栈必须清空、交叉嵌套错误 0 个；`<style>` 大括号左右数量相等（实测数字见第 5 节汇报）。
2. **服务验证**：把完整示例另存为 `/tmp/css14-test/own-framework.html`，用 `python3 -m http.server` 起服务，curl 拿到 HTTP 200 且字节数与本地文件完全一致（实测数字见第 5 节汇报）。
3. **视觉验证**：在浏览器里打开示例页，对照第 13 节逐条看：三列卡片是否并排、表单红色边框是否出现、窄屏是否变单列、深色主题是否生效。
4. **变量验证**：改一个变量值（例如主色），刷新页面，确认所有引用它的地方一起变；再把值改回去，确认页面恢复原样。

如实说明：curl 只能证明文件能返回、字节数对得上，不能证明样式在浏览器里视觉上一定符合预期。第 13 节描述的三列并排、窄屏单列、深色切换这些视觉效果，必须按上面第 3 步在浏览器里亲眼验证，不要把 curl 通过说成视觉通过。

## 15. 常见错误

| 错误写法（只看，不要照抄进页面） | 后果 | 正确做法 |
| --- | --- | --- |
| 框架类名不用前缀，例如直接写 `btn`、`card` | 和业务样式撞名，改一处误伤另一处 | 一律用 `mk-` 前缀，例如 `mk-btn`、`mk-card` |
| 组件变体重复写基础样式，例如 `mk-btn--primary` 里再写一遍内边距和圆角 | 基础样式改了，变体没跟着改，两边不一致 | 变体只写“和基础不一样的那几行”，其余靠基础类 |
| 栅格列宽加起来超过 12，例如一行放三个 `mk-col-6` | 第三个格子被挤到下一行，排版错位 | 一行内的列份数加起来不超过 12，超了就主动分行 |
| 媒体查询写在文件开头，列样式写在后面 | 后面的列样式把窄屏单列覆盖掉，手机上还是多列 | 媒体查询写在文件最后，或者至少写在列样式之后 |
| 深色主题只改背景不改文字色 | 深色背景上还是深色文字，看不清 | 深色主题要成组改变量：背景、文字、次要文字、边框一起换 |
| 工具类里顺手写组件样式，例如 `mk-text-center` 里再加颜色 | 工具类不再是“只做一件事”，复用时处处受限 | 工具类只做它名字说的那一件事，颜色交给组件或变量 |
| 框架文件不写版本号，改完直接覆盖旧文件 | 出问题不知道回滚到哪一版，也不知道改了什么 | 每次改框架先改文件头版本号，并写一行改动说明 |

## 16. 故障排查

- **页面完全没有样式**：先看 `<link>` 的 `href` 路径对不对，`index.html` 和 `css/mykit.css` 的相对位置是不是按第 11 节放的；再看浏览器开发者工具的网络面板，`mykit.css` 是不是 404；最后看文件编码是不是 UTF-8。
- **栅格列排不齐、右侧溢出**：先确认全局 `box-sizing: border-box` 在不在；再确认 `.mk-row` 的负边距和列的左右内边距是不是一对（都是 8px）；最后数一行内的列份数有没有超过 12。
- **窄屏下还是多列**：先确认媒体查询写在文件最后；再确认浏览器窗口真的拉到了 600px 以下；最后确认 `<meta name="viewport">` 在不在，缺了它手机浏览器会按桌面宽度渲染。
- **改变量没效果**：先确认改的是 `:root` 里那个变量，不是某个组件里写死的值；再确认组件引用的是变量名而不是具体色值；最后硬刷新一次，排除浏览器缓存。
- **深色主题不生效**：先确认 `data-theme="dark"` 加在 `<html>` 标签上；再确认主题覆盖规则写在变量层之后；最后确认没有在组件里把颜色写死成具体值，写死的值不会被变量覆盖。
- **新加的组件影响了旧组件**：先确认新组件用了 `mk-` 前缀和 BEM 写法；再确认没有用全局元素选择器（例如直接写 `button { ... }`）改所有按钮；最后确认没有滥用 `!important`。

## 17. 安全注意事项

- 本篇的框架是纯样式，没有 JavaScript，不收集、不发送任何数据，引用它不会引入外部请求；不要在框架里加来路不明的外部字体或外部样式链接，外部链接一旦失效或被篡改，所有引用页面都会受影响。
- 框架样式不要写 `!important`，它会让业务页面无法正常覆盖框架样式，出了问题也难以定位，最终只能用更多的 `!important` 去盖，形成恶性循环。
- 表单样式只管外观，不管校验和提交安全：输入校验、提交防重复、敏感数据处理是后端和 JavaScript 层的事，不能只靠输入框的红色边框来“保证”数据正确。
- 颜色对比度要留心：主色按钮上的白色文字、灰色说明文字在浅色和深色主题下都要能看清，换主题色后要重新检查一遍，不要只在浅色下看一次就发布。
- 框架文件发布时只发 CSS 文件，不要把练习用的测试页面、个人笔记、内部地址一起发出去；版本号和改动说明写在文件头注释里就够了。

## 18. 回滚和恢复

- **改变量改坏了**：把变量值改回上一版，刷新页面即可恢复，变量是集中管理的，不用逐个组件去改。
- **新加组件有问题**：把新组件的规则删掉，只影响用了它的页面，旧组件不受影响；前提是新组件按 BEM 规范写，没有用全局选择器。
- **整版框架升级出问题**：保留上一版文件，例如把 `mykit.css` 改名备份为 `mykit-1.0.0.css`，再把新版存为 `mykit.css`；出问题就把引用指回旧版文件，页面立刻恢复，修好后再升级。
- **误删框架文件**：从第 11 节把完整内容重新复制一份保存为 `css/mykit.css` 即可，框架是单个独立文件，不依赖其他文件，恢复成本很低；平时养成改动前先备份旧版的习惯。
- **回滚的底线**：不要在没有备份的情况下直接覆盖线上正在用的框架文件，先备份、再替换、再验证，顺序不能反。

## 19. 延伸阅读

- CSS-08 的 BEM 和文件组织一节：本篇的命名规范和六层顺序就是从那里来的，写框架前建议重读一遍。
- CSS-04 和 CSS-05：栅格用 Flex 实现的细节、Grid 的二维能力，框架以后要扩展二维栅格时从这两篇找依据。
- CSS-06：移动优先和媒体查询的写法，框架的窄屏单列就是按这篇的原则做的。
- CSS-02 的颜色和变量部分：变量命名的思路、颜色值写法的选择，换主题时要用到。
- 现成框架的官方文档（Bootstrap、Tailwind CSS 等）：对照着看它们是怎么分层的、类名是怎么命名的，但不要直接复制它们的代码，MyKit 的目标是“够自己用”，不是“和它们一样全”。

## 20. 相关章节链接

- 规划文件：[MASTER_PLAN.md](../MASTER_PLAN.md)、[TASK_INDEX.md](../TASK_INDEX.md)、[ROADMAP.md](../ROADMAP.md)
- CSS 基础：[CSS-01 基础语法与选择器](../css/01-basics.md)、[CSS-02 单位与颜色](../css/02-units-colors.md)、[CSS-03 盒模型与定位](../css/03-box-position.md)
- CSS 布局与响应式：[CSS-04 Flexbox](../css/04-flexbox.md)、[CSS-05 Grid](../css/05-grid.md)、[CSS-06 响应式设计](../css/06-responsive.md)
- CSS 工程化：[CSS-08 CSS 工程化](../css/08-engineering.md)
- 下一篇：[CSS-15 完整 Design System](./07-design-system.md)
