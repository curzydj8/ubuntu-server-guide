# CSS-11：Bulma 完整教程

> 任务编号：CSS-11（网站建设与部署实战指南 · CSS 框架第 3 篇）
> 上一篇：[CSS-10 Tailwind CSS](./02-tailwind.md)；下一篇：[CSS-12 Foundation、UIkit](./04-foundation-uikit.md)。
> 本篇只讲 Bulma：Columns 布局、Navbar、Hero、Card、主题变量定制。不讲其他 CSS 框架，不重讲 Flex 基础（那是 CSS-04）。

## 1. 本章目标

读完本篇，你能做到下面四件事：

1. 用一行 CDN 链接把 Bulma 接入一个静态页面，不装构建工具也能用。
2. 用 Columns 写出“桌面多列、手机单列”的响应式布局，不用自己写媒体查询。
3. 用 Navbar、Hero、Card 拼出一个带顶栏、大横幅和卡片列表的完整页面。
4. 用 CSS 变量改 Bulma 的主色、链接色和字体，不用重新编译 Sass 也能换主题。

学完之后，你手里会有一个可以直接打开的完整示例页（第 10 节），把它当成以后做展示页、作品集页、后台登录页的起点。

## 2. 适用人群

- 已经学完 CSS-01 到 CSS-08，知道选择器、盒模型、Flexbox、响应式这些概念，不想再从零写一遍布局和组件样式的人。
- 想快速给一个静态站、文档站、演示页套上“看起来像正经网站”的样式，但不想学一整套构建工具的人。
- 已经在用 Bootstrap 或 Tailwind，想多了解一种“纯 CSS、零 JavaScript”的框架写法的人。

如果你连 HTML 标签和 CSS 选择器都还没接触，建议先回 HTML 篇和 CSS-01，再读本篇。

## 3. 适用系统和版本

- 系统：不挑。Windows、macOS、Linux 都可以；只要有一个浏览器和一个文本编辑器就能跟着做。示例在 Ubuntu 26.04 的命令行环境下验证过文件本身能返回，但页面效果不依赖操作系统。
- 浏览器：支持现代 CSS 变量和 Flexbox 的浏览器即可，也就是近几年发布的 Chrome、Edge、Firefox、Safari。IE 不支持 Bulma 1.x 的 CSS 变量写法，不在本篇的考虑范围内。
- Bulma 版本：**1.0.4**。核查日期 **2026-11-03**，核查来源是 Bulma 官方 GitHub 仓库 jgthms/bulma 的 Releases 页，该页置顶的最新版本就是 1.0.4（之下依次是 1.0.3、1.0.2），多家 2026 年的资料也一致写 1.0.4 是当前稳定版，发布于 2025 年 4 月。
- 配套说明：Bulma 1.0 是一次大改版，底层从 Ruby Sass 换成了 Dart Sass，并且把主题做成了 CSS 变量。好处是：只用 CDN、不装 Sass 也能改主题；坏处是：如果你以前用过 0.9.x 的 Sass 变量写法，升级到 1.x 要按第 16 节的办法检查一遍。
- 版本提醒：本篇所有 CDN 链接都锁定写死 `bulma@1.0.4`，不写“最新版”这种会悄悄变化的写法。以后 Bulma 出了新版本，先去官方 Releases 页核对，再改版本号，不要凭印象升级。

## 4. 使用前提

开始之前，你需要已经具备下面这些，不具备的先补，缺一项后面都会卡住：

| 前提 | 为什么需要 | 不具备怎么办 |
|---|---|---|
| 会写 HTML 文档结构（`head`、`body`、语义标签） | Bulma 是“给 HTML 加类名”的框架，标签本身要你写 | 回 HTML 篇（WEB-01） |
| 会用 CSS 选择器和类名 | 改主题就是写 CSS 变量覆盖，类名拼错等于没生效 | 回 CSS-01 |
| 知道 Flexbox 的主轴、交叉轴、对齐概念 | Bulma 的 Columns 底层就是 Flexbox，排版出问题时要靠这个排查 | 回 CSS-04 |
| 知道响应式是“同一套页面在不同宽度下都能用” | Columns 的响应式类名就是按这个思路设计的 | 回 CSS-06 |
| 有一个能联网的浏览器（只在第一次打开示例页时需要） | 示例页用 CDN 引入 Bulma，离线打不开样式 | 见第 16 节的离线办法：把 CSS 文件下载到本地引用 |

不需要的前提：不需要 Node.js，不需要 npm，不需要 Sass，不需要会 JavaScript（Navbar 汉堡按钮那一小段脚本，第 10 节已经写好，复制过去就能用，不用你现写）。

## 5. 所需资源

- 一个文本编辑器：VS Code、记事本、gedit 都可以。
- 一个浏览器：Chrome、Edge、Firefox 均可。
- 一个网络连接：只在第一次加载 CDN 时需要；加载过一次后浏览器会缓存。
- 本篇用到的唯一外部资源：Bulma 1.0.4 的 CSS 文件，地址是 `https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css`。除此之外不需要任何图片、字体或 JavaScript 库，示例里的占位图用纯色块代替，不会因为图片 404 而影响验证。

## 6. 技术原理

Bulma 的设计可以用三句话概括：

1. **纯 CSS，零 JavaScript。** Bulma 只提供样式，不提供交互逻辑。按钮、卡片、导航栏长什么样由 Bulma 定；点一下发生什么，由你自己的 JavaScript（或者干脆不写）定。唯一的例外是 Navbar 的汉堡按钮：Bulma 只负责“展开时菜单长什么样”，“点一下就展开”这个动作要你写一小段脚本（第 10 节有现成的）。
2. **类名即样式。** 你不用写 `.my-nav { display: flex; ... }` 这种自定义样式，而是直接在 HTML 里写 `class="navbar"`、`class="columns"`、`class="card"`。类名本身就是 Bulma 的组件名和修饰符，读 HTML 就能知道这块长什么样。
3. **1.0 之后主题靠 CSS 变量。** 以前改主题要改 Sass 变量再重新编译；1.0 之后 Bulma 把颜色、字体、圆角、间距都暴露成 CSS 变量（名字都以 `--bulma-` 开头）。你在自己的样式表里重新给这些变量赋值，就能覆盖默认值，不用装 Sass，也不用重新编译 Bulma 本身。

和另外两种常见路线的区别，一句话说清：Bootstrap 也给现成组件，但自带 JavaScript；Tailwind 给的是原子工具类，页面要自己拼；Bulma 给的是现成组件加语义类名，适合“想要现成组件、又不想引入 JavaScript”的场景。

## 7. 架构说明

一个 Bulma 页面的结构是分层的，从外到内依次是：

```text
index.html（你的页面）
├── <head> 里引入 Bulma 的 CSS（CDN 或本地文件，二选一）
├── <head> 里再引入你自己的 theme.css（覆盖 CSS 变量，改主题）
└── <body> 里的内容，全部由 Bulma 的类名组成
    ├── <nav class="navbar">：顶栏
    ├── <section class="hero">：大横幅
    ├── <section class="section"><div class="container">
    │   └── <div class="columns">：多列布局
    │       └── <div class="column">：每一列里放 Card
    └── <footer class="footer">：页脚
```

关键约定（记住这三条，后面排查问题全靠它们）：

- **Columns 只能包 Column。** `columns` 的直接子元素必须是 `column`，中间不能插别的 `div`，否则列宽计算会乱。
- **Card 的结构是固定的。** `card` 里面按顺序是 `card-image`（可选）、`card-content`、`card-footer`（可选），`card-content` 里常用 `media` + `content` 的组合，不要自己发明一层包裹。
- **你自己的样式永远写在 Bulma 之后引入。** CSS 后面的规则覆盖前面的规则，`theme.css` 必须放在 Bulma 的 `<link>` 之后，否则变量覆盖不生效。这是最常见的“改了主题没变化”的原因，见第 15 节。

文件组织（一个页面就这么放，够用了）：

```text
bulma-demo/
├── index.html      # 第 10 节的完整示例页
└── css/
    └── theme.css   # 第 11 节的主题覆盖文件
```

如果以后页面变多，再把多个页面的公共顶栏、页脚抽成模板，那是后端或构建工具的活，不在本篇范围内。

## 8. 操作前检查

动手之前，先逐项打勾，缺一项就先补，不要带着缺口往下做：

- [ ] 能新建一个 `.html` 文件并用浏览器打开，看到自己写的文字。
- [ ] 知道浏览器的开发者工具怎么打开（按 F12），以及“检查元素”能看到某个元素的类名和生效样式。
- [ ] 网络能访问 jsDelivr（也就是能打开上面第 5 节那个 CSS 地址）。打不开的，先按第 16 节把文件下载到本地再引用。
- [ ] 明确本篇示例的存放位置：建议在用户主目录下建一个 `bulma-demo` 文件夹，后面所有路径都按这个文件夹写。

## 9. 逐步操作

按顺序做，不要跳步。每一步做完都能在浏览器里看到对应的变化。

**第 1 步：新建页面骨架。** 新建 `bulma-demo/index.html`，写一个最基本的 HTML 文档，先不加任何 Bulma 类名，用浏览器打开，确认页面能显示一行字。

**第 2 步：引入 Bulma。** 在 `<head>` 里加一行 `<link>`，指向第 5 节的 CDN 地址。刷新页面，什么都没变是正常的——因为你还没给任何元素加 Bulma 类名。

**第 3 步：加 Navbar。** 按第 10 节示例里的 `<nav class="navbar">` 结构复制顶栏，刷新后应该看到一条顶栏，左边是品牌名，右边是链接。把窗口缩窄到手机宽度，顶栏右边会收起，只剩汉堡按钮。

**第 4 步：加 Hero。** 在顶栏下面加 `<section class="hero is-primary is-medium">`，里面放 `hero-body` 和一个大标题。刷新后应该看到一块带主色背景的大横幅。

**第 5 步：加 Columns 和 Card。** 在横幅下面加 `<section class="section"><div class="container"><div class="columns">`，里面放三列，每列一个 Card。桌面宽度下三列并排，手机宽度下自动变成一列上下排。

**第 6 步：加主题覆盖。** 新建 `bulma-demo/css/theme.css`，在里面写 `:root` 变量覆盖（写法见第 11 节），再在 `<head>` 里、Bulma 的 `<link>` 之后引入它。刷新后主色、链接色、字体应该跟着变。

**第 7 步：验证。** 按第 14 节逐项检查：顶栏、横幅、三列卡片、主题色、手机宽度下的单列，全部对上才算完成。

## 10. 完整代码

下面是唯一一份完整示例页，**没有省略号**，从 `<!DOCTYPE html>` 到 `</html>` 全文照抄就能打开。注意三点：第一，Bulma 用 CDN 引入，版本号锁定 1.0.4；第二，`theme.css` 的引用写在 Bulma 之后，改主题靠它；第三，Navbar 汉堡按钮的脚本只有十来行，作用是点一下就给按钮和菜单同时加 `is-active`，这是 Bulma 官方文档推荐的写法，复制过去不用改。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bulma 示例：顶栏 + 横幅 + 卡片列表</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css">
  <link rel="stylesheet" href="css/theme.css">
  <style>
    .demo-block {
      background-color: #e8e8e8;
      color: #333333;
      padding: 2rem 1rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <nav class="navbar is-light" role="navigation" aria-label="主导航">
    <div class="navbar-brand">
      <a class="navbar-item" href="#">我的小站</a>
      <a role="button" class="navbar-burger" aria-label="菜单" aria-expanded="false" data-target="mainMenu">
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </a>
    </div>
    <div id="mainMenu" class="navbar-menu">
      <div class="navbar-start">
        <a class="navbar-item" href="#">首页</a>
        <a class="navbar-item" href="#">文章</a>
        <a class="navbar-item" href="#">关于</a>
      </div>
      <div class="navbar-end">
        <div class="navbar-item">
          <a class="button is-primary" href="#">开始使用</a>
        </div>
      </div>
    </div>
  </nav>

  <section class="hero is-primary is-medium">
    <div class="hero-body">
      <p class="title">用 Bulma 快速搭一个页面</p>
      <p class="subtitle">一行 CDN，不用构建工具，就有顶栏、横幅和卡片</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="columns is-multiline">
        <div class="column is-one-third-desktop is-half-tablet">
          <div class="card">
            <div class="card-image">
              <div class="demo-block">封面占位</div>
            </div>
            <div class="card-content">
              <div class="media">
                <div class="media-content">
                  <p class="title is-4">第一张卡片</p>
                  <p class="subtitle is-6">Columns + Card</p>
                </div>
              </div>
              <div class="content">
                桌面宽度下三张卡片并排，平板两列，手机一列，列数由类名控制，不用自己写媒体查询。
              </div>
            </div>
            <footer class="card-footer">
              <a href="#" class="card-footer-item">查看详情</a>
              <a href="#" class="card-footer-item">收藏</a>
            </footer>
          </div>
        </div>
        <div class="column is-one-third-desktop is-half-tablet">
          <div class="card">
            <div class="card-image">
              <div class="demo-block">封面占位</div>
            </div>
            <div class="card-content">
              <div class="media">
                <div class="media-content">
                  <p class="title is-4">第二张卡片</p>
                  <p class="subtitle is-6">Navbar + Hero</p>
                </div>
              </div>
              <div class="content">
                顶栏在窄屏幕下自动收起成汉堡按钮，点一下展开；横幅用 hero 加主色背景，一行类名就定好高度和颜色。
              </div>
            </div>
            <footer class="card-footer">
              <a href="#" class="card-footer-item">查看详情</a>
              <a href="#" class="card-footer-item">收藏</a>
            </footer>
          </div>
        </div>
        <div class="column is-one-third-desktop is-half-tablet">
          <div class="card">
            <div class="card-image">
              <div class="demo-block">封面占位</div>
            </div>
            <div class="card-content">
              <div class="media">
                <div class="media-content">
                  <p class="title is-4">第三张卡片</p>
                  <p class="subtitle is-6">主题变量</p>
                </div>
              </div>
              <div class="content">
                主色、链接色、字体都在 theme.css 里用 CSS 变量覆盖，改一个变量，全站用到这个颜色的地方一起变。
              </div>
            </div>
            <footer class="card-footer">
              <a href="#" class="card-footer-item">查看详情</a>
              <a href="#" class="card-footer-item">收藏</a>
            </footer>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="content has-text-centered">
      <p>用 Bulma 1.0.4 做的示例页，样式来自 CDN，内容是占位文字。</p>
    </div>
  </footer>

  <script>
    document.addEventListener('DOMContentLoaded', function () {
      var burgers = document.querySelectorAll('.navbar-burger');
      burgers.forEach(function (burger) {
        burger.addEventListener('click', function () {
          var target = document.getElementById(burger.dataset.target);
          burger.classList.toggle('is-active');
          target.classList.toggle('is-active');
        });
      });
    });
  </script>
</body>
</html>
```

## 11. 完整配置文件

本篇的“配置”不是一个构建配置文件，而是两份文件：一份是上面的 `index.html`，另一份是主题覆盖文件 `css/theme.css`。**存放路径：`bulma-demo/css/theme.css`，必须放在 Bulma 的 `<link>` 之后引入**（第 10 节示例里已经是这个顺序）。

下面是 `theme.css` 的全文，没有省略号，直接保存就能用：

```css
:root {
  --bulma-primary-h: 171deg;
  --bulma-primary-s: 100%;
  --bulma-primary-l: 41%;
  --bulma-link-h: 217deg;
  --bulma-link-s: 71%;
  --bulma-link-l: 53%;
  --bulma-family-primary: "PingFang SC", "Microsoft YaHei", sans-serif;
  --bulma-column-gap: 1.5rem;
}
```

如果你不想用 CDN，想把 Bulma 下载到本地，目录就变成这样，`index.html` 里的 CDN 链接换成 `css/bulma.min.css` 这一行即可，其他内容一字不用改：

```text
bulma-demo/
├── index.html
└── css/
    ├── bulma.min.css   # 从 CDN 下载下来的 Bulma 1.0.4 文件
    └── theme.css       # 上面的主题覆盖文件
```

## 12. 每个关键配置项的解释

### Columns 相关

| 类名 | 作用 | 不写会怎样 |
|---|---|---|
| `columns` | 一行多列的容器，底层是 Flexbox | 列不会并排 |
| `column` | 容器里的每一列，默认等分剩余宽度 | 没有列宽概念 |
| `is-one-third`、`is-half`、`is-two-thirds`、`is-one-quarter` | 列占整行的几分之几 | 所有列等分 |
| `is-one-third-desktop`、`is-half-tablet` | 只在某个断点及以上生效的列宽 | 所有宽度下都是同一个列宽 |
| `is-multiline` | 列放不下时换行 | 超出宽度的列会被挤出容器 |
| `is-centered`、`is-vcentered` | 列整体水平居中、垂直居中 | 列靠左、靠上对齐 |
| `is-gapless` | 去掉列与列之间的间距 | 列之间有默认间距 |

Bulma 的断点（记住这四个分界线，响应式类名就是按它们切的）：手机 `≤768px`，平板 `≥769px`，桌面 `≥1024px`，宽屏 `≥1216px`，超宽屏 `≥1408px`。所以 `is-one-third-desktop` 的意思是“桌面及以上三列，桌面以下按默认等分或堆叠”。

### Navbar 相关

| 类名 | 作用 |
|---|---|
| `navbar` | 顶栏容器 |
| `navbar-brand` | 左边品牌区，窄屏幕下也一直显示 |
| `navbar-burger` | 窄屏幕下的汉堡按钮，三个 `span` 画出三条横线 |
| `navbar-menu` | 可收起的菜单区，窄屏幕下默认隐藏 |
| `navbar-start` / `navbar-end` | 菜单里靠左 / 靠右的两组链接 |
| `navbar-item` | 菜单里的每一项 |
| `is-active` | 同时加在 `navbar-burger` 和 `navbar-menu` 上时，菜单展开 |

注意：`data-target` 的值必须等于菜单的 `id`（示例里都是 `mainMenu`），对不上号点汉堡按钮就没反应，这是第 15 节的第一条。

### Hero 相关

| 类名 | 作用 |
|---|---|
| `hero` | 大横幅容器 |
| `is-primary`、`is-link`、`is-info`、`is-success`、`is-warning`、`is-danger` | 横幅的配色，用的是主题色 |
| `is-small`、`is-medium`、`is-large`、`is-halfheight`、`is-fullheight` | 横幅的高度，`is-fullheight` 是占满一屏 |
| `hero-body` | 横幅里的内容区，标题和副标题放这里 |
| `hero-head` / `hero-foot` | 横幅顶部 / 底部固定条（例如把 Navbar 放进 Hero 顶部时用） |

### Card 相关

| 类名 | 作用 |
|---|---|
| `card` | 卡片容器 |
| `card-image` | 卡片顶部的图片区，里面常用 `image is-4by3` 包一张图 |
| `card-content` | 卡片的正文区 |
| `media` + `media-left` + `media-content` | 正文区里的“头像 + 标题”组合，头像放 `media-left`，标题放 `media-content` |
| `content` | 正文段落区，里面的 `p` 会有默认段落间距 |
| `card-footer` + `card-footer-item` | 卡片底部的操作区，每一项等分宽度 |

### 主题变量（`theme.css` 里的每一行）

| 变量 | 作用 |
|---|---|
| `--bulma-primary-h` / `--bulma-primary-s` / `--bulma-primary-l` | 主色的色相、饱和度、亮度。Bulma 1.0 用 HSL 三个分量生成主色及其深浅变体，改这三个，全站主色一起变 |
| `--bulma-link-h` / `--bulma-link-s` / `--bulma-link-l` | 链接色的色相、饱和度、亮度，同理 |
| `--bulma-family-primary` | 全站默认字体，写多个字体名时按顺序回退，最后一个必须是通用字体族 |
| `--bulma-column-gap` | Columns 的列间距，改它等于统一改所有列的间距 |

还有两个常用但本篇示例没用上的变量，知道名字就行：`--bulma-radius`（全局圆角）、`--bulma-body-background-color`（页面背景色）。暗黑模式不用自己写变量：给 `<html>` 加 `data-theme="dark"`，Bulma 1.0 会自动切换到暗色变量；再想细调，才去覆盖暗色下的变量。

## 13. 执行结果示例

按第 9 节做完，在桌面宽度的浏览器里打开 `index.html`，你应该看到：

- 顶部一条浅色顶栏：左边“我的小站”，右边“首页、文章、关于”和一个主色“开始使用”按钮。
- 顶栏下面一块主色大横幅：大标题“用 Bulma 快速搭一个页面”，下面一行副标题。
- 横幅下面三张卡片并排：每张上面是灰色“封面占位”块，中间是标题和一段说明，底部是“查看详情”和“收藏”两个等分链接。
- 页面最下面一条页脚，居中一行小字。

把浏览器窗口拖窄到手机宽度（小于 768px），应该看到：

- 顶栏右边的链接收起，只剩右上角一个汉堡按钮；点一下汉堡按钮，菜单展开，再点一下收起。
- 三张卡片从并排变成上下排列，每张占满整行宽度。
- 大横幅的标题自动换行，不会横向溢出。

如果主题覆盖生效，主色按钮和横幅颜色会是你 `theme.css` 里写的那套 HSL 颜色（示例里是偏青绿的主色），而不是 Bulma 默认的蓝绿色；如果颜色没变，先按第 15 节第一条检查 `theme.css` 的引入顺序。

## 14. 成功验证

逐项打勾，全部通过才算完成：

1. **页面能打开。** 双击 `index.html` 或用本地服务打开，页面正常显示，没有浏览器报错弹窗。
2. **Bulma 生效了。** 顶栏、横幅、卡片都有明显的样式（不是浏览器默认的黑字白底裸 HTML）；按 F12 检查任意一个 `navbar-item`，能看到来自 `bulma.min.css` 的规则。
3. **Navbar 能展开收起。** 窄屏幕下点汉堡按钮，菜单展开；再点一次，菜单收起。点一次没反应，就是 `data-target` 和 `id` 对不上。
4. **三列变单列。** 桌面宽度三列并排，手机宽度一列上下排，中间没有横向滚动条。
5. **主题覆盖生效。** `theme.css` 里改一个主色色相值，刷新后横幅和按钮颜色跟着变；改回去，颜色也跟着回去。
6. **没有横向溢出。** 在手机宽度下左右拖动页面，页面不会左右晃动，说明 Columns 没有超宽。

## 15. 常见错误

| 现象 | 原因 | 办法 |
|---|---|---|
| 页面是裸 HTML，没有任何样式 | CDN 链接写错、网络打不开 CDN、或者 `<link>` 写在了 `</head>` 之后 | 先直接在浏览器里打开 CDN 地址，能看到 CSS 文本才说明链接没错；打不开就按第 16 节下载到本地引用 |
| 改了 `theme.css`，颜色一点没变 | `theme.css` 写在了 Bulma 的 `<link>` 之前，或者变量名拼错（例如少了 `--bulma-` 前缀） | 把 `theme.css` 的 `<link>` 移到 Bulma 之后；对照第 12 节的变量名逐字核对 |
| 点汉堡按钮，菜单没反应 | `data-target` 的值和菜单的 `id` 不一致，或者脚本写在了 `</body>` 之后、页面还没加载完就执行了 | 核对 `data-target="mainMenu"` 和 `id="mainMenu"` 是否完全一致；脚本保持放在 `</body>` 之前 |
| 列没有并排，或者最后一列被挤到下一行 | `column` 外面多包了一层 `div`，或者列宽加起来超过了 12 份 | `columns` 的直接子元素只能是 `column`，多余的包裹删掉；三列都用 `is-one-third`，不要一列写 `is-half`、一列写 `is-two-thirds` 再加一列 |
| 手机宽度下页面能左右拖动 | 某个 `column` 里放了固定宽度的内容（例如一张没加响应式类的大图） | 给图片加 `image` 容器或 `max-width: 100%`，不要写死像素宽度 |
| 从 0.9.x 升级后主题全乱了 | 1.0 的 Sass 变量和 CSS 变量体系变了，旧的 Sass 覆盖写法不再生效 | 按第 12 节改用 `--bulma-` 开头的 CSS 变量覆盖，不要再沿用 0.9.x 的 Sass 变量名 |

## 16. 故障排查

**第一步：先分清是“Bulma 没加载”还是“类名写错”。** 按 F12 打开开发者工具，看 `<head>` 里 Bulma 的 CSS 文件状态：如果是 404 或网络失败，就是加载问题；如果文件 200 但元素没样式，就是类名问题。两类问题不要混在一起查。

**加载问题的排查顺序：**

1. 把 CDN 地址单独粘贴到浏览器地址栏，能看到一长串 CSS 文本，说明网络没问题，问题在 `<link>` 的写法（最常见的是少了 `https:` 或把 `bulma.min.css` 写成了 `bulma.css` 的旧路径）。
2. 地址栏也打不开，说明当前网络访问不了 jsDelivr。办法：把这个 CSS 文件下载下来，放到 `bulma-demo/css/bulma.min.css`，再把 `<link>` 改成本地路径，其他内容不用动。
3. 本地文件也 404，说明路径写错了：`index.html` 和 `css` 文件夹在同一级时，路径是 `css/bulma.min.css`，不是 `/css/bulma.min.css`（开头的斜杠代表网站根目录，本地双击打开时根目录不是你的文件夹）。

**类名问题的排查顺序：**

1. 在开发者工具里点中那个没样式的元素，看它的 `class` 属性和第 12 节的表格逐字对照，重点查拼写（`navbar-burger` 不是 `navbar-button`，`card-footer-item` 不是 `card-footer-link`）。
2. 查结构：`column` 是不是 `columns` 的直接子元素，`card-content` 是不是在 `card` 里面，`navbar-menu` 的 `id` 是不是等于按钮的 `data-target`。
3. 查覆盖顺序：自己写的样式是不是写在了 Bulma 之前，或者被 Bulma 更具体的选择器盖住了。临时办法是把自己的规则移到 `theme.css` 最下面再刷新。

**主题不生效的专项排查：** 只改一个变量做实验，例如把 `--bulma-primary-h` 改成一个很显眼的值，刷新看横幅颜色变没变。变了，说明覆盖机制没问题，是你原来那个变量名写错了；没变，说明 `theme.css` 根本没被加载，按加载问题查。

## 17. 安全注意事项

- **CDN 引入意味着信任第三方。** 页面每次打开都会去 jsDelivr 拉 Bulma 的 CSS，如果你不希望页面依赖外部服务，或者页面会放在内网、离线环境，就把 CSS 下载到本地引用，不要长期依赖 CDN。这是本篇唯一一个“外部依赖”，要 conscious 地做决定。
- **版本号写死，不要写浮动版本。** 链接里写 `bulma@1.0.4`，不要写 `bulma@latest` 之类会随时间变化的写法。浮动版本会在你不知情的情况下换掉全站样式，出问题都不知道是哪天变的。
- **不要在页面里混用多个来源的 Bulma。** CDN 一份、本地一份、再加一个旧版 0.9.x，三份样式叠在一起，覆盖顺序完全不可预测。只留一份。
- **汉堡按钮脚本只操作自己的菜单。** 第 10 节的脚本只按 `data-target` 找对应的菜单，不读写其他数据，不发网络请求，不要把它改成读取用户输入或拼接 HTML 的写法。
- **占位内容不要带真实信息。** 示例里的“我的小站”、卡片文字都是占位，正式发布前换成你自己的内容，不要把测试文字留在正式页面上。

## 18. 回滚和恢复

Bulma 的回滚非常简单，因为它只是一层样式，不动你的 HTML 结构和数据：

1. **主题改坏了：** 把 `css/theme.css` 删掉，或者把里面的 `:root` 块整个注释掉，刷新页面就回到 Bulma 默认主题。你的 HTML 一行都不用动。
2. **升级后样式乱了：** 把 CDN 链接里的版本号改回 `1.0.4`，刷新即回到本篇验证过的样子。不要同时改版本号和类名，一次只动一个地方，否则不知道是哪一步出的问题。
3. **CDN 突然打不开了：** 按第 16 节把 CSS 下载到本地，改一行 `<link>` 就能恢复，页面结构和内容完全不受影响。
4. **整页想换回不用框架：** 把两行 `<link>` 删掉，页面回到浏览器默认样式，文字和链接都还在，只是没了排版和配色。再逐步把 Bulma 的类名换成你自己的 CSS 即可，没有数据丢失的风险。

备份方法：改 `theme.css` 之前，先把它复制一份成 `theme.css.bak`，改坏了直接把备份拷回来。

## 19. 延伸阅读

- Bulma 官方文档（英文，最新版以官网为准）：从 Columns、Navbar、Hero、Card 四个组件的文档页开始看，每个组件页下面都有“变量”一节，列出了该组件能覆盖的 CSS 变量。
- Bulma 官方 GitHub 仓库 jgthms/bulma 的 Releases 页：查版本号、看每个版本的改动说明，本篇第 3 节的 1.0.4 就是从这里核对的。
- CSS-04 Flexbox 完整教程：Bulma Columns 底层就是 Flexbox，排版出问题时回这里找主轴、交叉轴的排查思路。
- CSS-06 响应式设计：Bulma 断点类名的分界线和这里讲的断点思路是一致的，两个结合起来看，响应式布局的排查会更快。
- CSS-08 CSS 工程化：多个页面共用一套主题时，`theme.css` 的组织方式、变量命名规范可以按那篇的思路来。

## 20. 相关章节链接

- 规划文件：[MASTER_PLAN.md](../MASTER_PLAN.md)、[TASK_INDEX.md](../TASK_INDEX.md)、[ROADMAP.md](../ROADMAP.md)
- CSS 基础：[CSS-01 基础语法与选择器](../css/01-basics.md)、[CSS-02 单位与颜色、字体、背景、边框](../css/02-units-colors.md)、[CSS-03 盒模型与定位](../css/03-box-position.md)
- 布局基础：[CSS-04 Flexbox 完整教程](../css/04-flexbox.md)、[CSS-05 Grid 完整教程](../css/05-grid.md)
- 工程化：[CSS-08 CSS 工程化](../css/08-engineering.md)
- 下一篇：[CSS-12 Foundation、UIkit](./04-foundation-uikit.md)
