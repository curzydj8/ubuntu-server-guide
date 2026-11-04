# CSS-10：Tailwind CSS 完整教程

> 任务编号：CSS-10（网站建设与部署实战指南 · CSS 框架第 2 篇）
> 上一篇：[CSS-09 Bootstrap](./01-bootstrap.md)；下一篇：[CSS-11 Bulma](./03-bulma.md)。
> 本篇只讲 Tailwind CSS：Vite 集成、工具类写法、响应式变体、暗黑模式、一个后台管理类实战页。不讲其他框架，不重讲 Flex/Grid 的基础属性（那是 CSS-04、CSS-05，工具类只是把那些属性换成了类名）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 Tailwind CSS 是什么：它不是一套现成组件，而是一套“工具类”——每个类只做一件小事，组合起来拼出页面；
2. 用 Vite 官方插件把 Tailwind CSS 4 装进一个新项目，跑起开发服务器，构建出生产 CSS；
3. 用工具类写出布局、间距、颜色、文字、圆角、阴影，不再为每个小样式单独写选择器；
4. 用响应式变体写出手机、平板、桌面三档布局，用类名暗黑模式做一键换肤；
5. 用 Tailwind CSS 写出一个后台管理类页面：顶栏、侧边栏、数据卡片、表格齐全；
6. 说清楚什么时候该用 Tailwind，什么时候该用 Bootstrap 那种组件框架，以及生产环境为什么不能只靠 CDN。

## 2. 适用人群

- 已完成 CSS-01 至 CSS-03，能写选择器、单位、颜色、盒模型、定位的人；
- 已完成 CSS-04、CSS-05，知道 Flex 和 Grid 是干什么的人——本篇不重讲它们，只讲对应的工具类名；
- 已完成 CSS-06，知道响应式断点思路的人——本篇讲断点在 Tailwind 里怎么写；
- 已完成 CSS-08，知道样式文件变大、撞名会带来麻烦的人——Tailwind 是另一种解法：不写选择器，也就不存在撞名；
- 还没有接触过构建工具的人——本篇第 9 节会一步一步带你装 Vite 和插件，不需要你事先会 npm 以外的东西。

## 3. 适用系统和版本

- 系统：Windows、macOS、Linux 均可；需要 Node.js，建议用 LTS 版本（本篇命令只用到 `npm`，不依赖某个操作系统特有的路径）。
- 浏览器：Tailwind CSS 4 要求较新的浏览器，目标是 Safari 16.4+、Chrome 111+、Firefox 128+。如果你的项目必须支持更老的浏览器，Tailwind 3.4 仍有长期支持线，选型时要先确认这一点，不要等到上线才发现样式在旧浏览器上不生效。
- Tailwind CSS 版本（已核实）：**核查日期 2026-11-03，核查到的最新稳定版为 4.3.3（4.3 线，2026-07-16 发布）**。核查途径是公开的版本追踪页和迁移指南，多处来源一致指向 4.3.3；本篇按 4.x 的 CSS 优先写法写，4.3.3 与 4.0 的 Vite 集成步骤相同。**安装时请以 Tailwind CSS 官网为准**：直接运行 `npm install tailwindcss` 不带版本号，装到的就是当前最新版；如果你在读本篇时官网已经出了更新的 4.x 小版本，步骤不变，照做即可。
- Vite 版本：本篇不锁定 Vite 的具体小版本，`npm create vite@latest` 建出来的就是当前版；关键是第 11 节的 `vite.config.ts` 里必须有 `tailwindcss()` 插件，缺了它，工具类不会生成任何 CSS。
- 本篇第 10 节的完整示例用 Tailwind Play CDN（浏览器版），目的是让你不装任何东西就能打开看效果；**CDN 只用于学习和验证，正式项目必须走第 9 节的 Vite 构建**，原因见第 17 节。

## 4. 使用前提

- 会用命令行进入目录、运行 `npm` 命令；如果 `node -v` 和 `npm -v` 能输出版本号，就算过关。
- 理解 CSS-01 的选择器、CSS-02 的单位与颜色、CSS-03 的盒模型；理解 CSS-04 的 Flex 主轴交叉轴、CSS-05 的 Grid 行列概念。
- 理解一个基本事实：Tailwind 的类名不是魔法，它最终都会变成普通的 CSS 声明。`p-4` 就是 `padding: 1rem`，`flex` 就是 `display: flex`，`text-center` 就是 `text-align: center`。不知道对应关系时，先按 CSS 意思猜，再到官网文档核对。
- 有一个能新建文件夹、编辑文本文件的编辑器即可，不需要特定 IDE。

## 5. 所需资源

- Node.js（LTS 版）与 npm，官网下载安装即可。
- 一个空文件夹，用来放本篇的 Vite 项目，例如 `tailwind-admin`。
- 一个现代浏览器，用来打开开发服务器地址和第 10 节的示例页。
- 网络：安装依赖和加载 Play CDN 都需要联网；离线环境下请先在联网机器上装好依赖再拷贝项目。
- 不需要注册账号，不需要准备服务器，不需要数据库——本篇的后台页是纯静态页面，数据是写死的示例行。

## 6. 技术原理

Tailwind CSS 的核心思想叫“工具类优先”（utility-first），分三步理解：

1. **类名即样式。** 传统写法是先给元素起个类名，再到 CSS 文件里写这个类名的规则；Tailwind 反过来，框架已经准备好了几千个现成类名，你直接在 HTML 里拼：`flex` 开 Flex，`gap-4` 定间距，`bg-white` 定背景，`rounded-lg` 定圆角，`shadow` 定阴影。一个元素身上挂十几个类名是正常的，不是写错了。
2. **扫描生成，不是全量下发。** 构建时，Tailwind 会扫描你的 HTML、JS、模板文件，找出你实际用到的类名，只把这些类名对应的 CSS 写进最终文件。没用过的类名不会出现在产物里，所以最终 CSS 通常只有几十 KB，而不是把全部工具类都发给浏览器。这是它和“引入一个几百 KB 的现成样式表”的根本区别。
3. **变体是前缀。** 响应式、暗黑模式、悬停这些“在某种条件下才生效”的样式，在 Tailwind 里写成前缀：`md:grid-cols-2` 表示“中等屏幕及以上才两列”，`dark:bg-slate-900` 表示“暗黑模式下背景换深色”，`hover:bg-orange-600` 表示“鼠标悬停时背景加深”。前缀可以叠加，`md:hover:` 这种写法也是合法的，但不要叠太多层，读起来会很吃力。
4. **v4 的变化：配置进 CSS，不再靠 JS 配置文件。** Tailwind 3 时代要在 `tailwind.config.js` 里写主题、断点、内容路径；Tailwind 4 改成 CSS 优先：在 CSS 文件里写 `@import "tailwindcss"`，再用 `@theme` 定义自己的颜色、字体等变量。老教程里的 `tailwind.config.js`、`@tailwind base` 这些写法，在 v4 项目里不要再照抄，见第 15 节。

## 7. 架构说明

一个 Tailwind + Vite 项目的文件分工很简单：

```text
tailwind-admin/
├── index.html            # 入口 HTML，挂载点和脚本入口
├── vite.config.ts        # Vite 配置，关键是 tailwindcss() 插件
├── package.json          # 依赖和脚本，由 npm 自动生成和维护
├── src/
│   ├── main.js           # 入口脚本，负责引入 CSS
│   ├── index.css         # 唯一的 Tailwind 入口 CSS：@import + @theme + 自定义变体
│   └── App.html          # 你的页面结构（或按框架拆成组件，本篇用纯 HTML 示意）
└── dist/                 # 构建产物，npm run build 后生成，不要手工改
```

数据流向只有一条线：你写 HTML（带工具类）→ Vite 开发服务器或构建时，Tailwind 插件扫描这些文件 → 生成只含已用工具类的 CSS → 浏览器加载这份 CSS，类名生效。CSS 文件本身不认识你的业务逻辑，它只认类名；所以类名拼错一个字母（例如把 `grid-cols-2` 写成 `grid-col-2`），构建不会报错，页面上只是没效果——排查时先查拼写，见第 16 节。

和 Bootstrap 的分工对比：Bootstrap 给你现成的按钮、卡片、导航栏组件，你改主题要覆盖它的变量；Tailwind 不给现成组件，给你拼组件的零件，你自己拼出来的卡片长什么样完全由你定，代价是初期要多写类名。后台管理页这种“布局固定、细节多变”的页面，用 Tailwind 拼起来反而更顺手。

## 8. 操作前检查

动手前逐项打勾，缺一项先补齐再往下做：

1. `node -v` 能输出版本号（LTS 版即可），`npm -v` 能输出版本号。
2. 确认你要建项目的目录是空的，或者至少没有同名的 `package.json`——在已有项目里混装容易把旧配置搞乱。
3. 确认浏览器是较新版本（见第 3 节的目标版本），旧浏览器上 Tailwind 4 生成的 CSS 可能不生效。
4. 确认网络通畅：`npm install` 要从 npm 仓库下载依赖，Play CDN 示例要从 CDN 加载浏览器版。
5. 确认你分得清两个阶段：先做第 10 节的 CDN 示例（零安装、立刻能看），再做第 9 节的 Vite 项目（正式做法）。两个阶段的示例页长得像，但加载方式完全不同，不要混在一起改。

## 9. 逐步操作

下面是 Vite 集成全过程，目录以 `tailwind-admin` 为例，每条命令都注明在哪个目录执行。

**第 1 步：建 Vite 项目。** 在你要放项目的父目录执行：

```bash
npm create vite@latest tailwind-admin -- --template vanilla
cd tailwind-admin
```

模板选 `vanilla`（纯 HTML + JS），是为了让本篇不依赖任何前端框架；你如果用 React、Vue 模板，Tailwind 的装法完全一样，只差入口文件的位置。

**第 2 步：装 Tailwind 和 Vite 插件。** 在 `tailwind-admin` 目录执行：

```bash
npm install tailwindcss @tailwindcss/vite
```

第一包是 Tailwind 本体，第二包是官方 Vite 插件。不要再装 `postcss`、`autoprefixer`、`tailwind.config.js`——Vite 插件路线不需要它们，装了也不会被用到，只会让人误以为还要配 PostCSS。

**第 3 步：给 Vite 加插件。** 编辑项目根目录的 `vite.config.ts`（完整内容见第 11 节），关键就是 `plugins` 里加一行 `tailwindcss()`，其他配置保持脚手架默认值不动。

**第 4 步：写 Tailwind 入口 CSS。** 编辑 `src/index.css`（完整内容见第 11 节），第一行必须是 `@import "tailwindcss";`，之后再写 `@theme` 自定义颜色和 `@custom-variant dark` 类名暗黑模式。顺序不能反：先导入 Tailwind，再定义主题，否则自定义变量不生效。

**第 5 步：让入口脚本引入这份 CSS。** 在 `src/main.js` 里写一行：

```js
import './index.css'
```

并确认 `index.html` 里引用了 `src/main.js`。Vite 脚手架默认已经接好这两处，新项目一般不用改；如果你是往已有项目里加 Tailwind，这一步最容易漏，漏了页面会完全没有样式。

**第 6 步：跑开发服务器验证。** 在 `tailwind-admin` 目录执行：

```bash
npm run dev
```

终端会打印一个本地地址（一般是 `http://localhost:5173/`），浏览器打开它，往 `index.html` 里写一个带工具类的元素，例如 `class="bg-orange-500 text-white p-4 rounded-lg"` 的方块，能看到橙色圆角方块，说明整条链路通了。

**第 7 步：构建生产产物。** 在 `tailwind-admin` 目录执行：

```bash
npm run build
```

构建成功后看 `dist/` 目录，里面有压缩后的 HTML、JS、CSS；打开 `dist/assets/` 下的 CSS 文件搜一个你用过的类名，例如搜 `bg-orange-500` 对应的规则，能搜到说明生成正常，再搜一个你没用过的类名，例如 `bg-pink-500`，搜不到说明“只生成已用类名”确实在工作。

**第 8 步：把第 10 节的后台页搬进项目。** 把第 10 节示例里的顶栏、侧边栏、卡片、表格结构复制到 `index.html`，把 CDN 的 `<script>` 标签删掉（Vite 项目不需要它），把 `<style type="text/tailwindcss">` 里的 `@theme` 和 `@custom-variant` 搬到 `src/index.css` 里，暗黑切换的小脚本保留在页面里。改完先跑 `npm run dev` 看效果，再跑 `npm run build` 确认构建通过。

## 10. 完整代码

下面是第 10 节的完整示例页：一个后台管理页，含顶栏、侧边栏、4 张数据卡片、一张订单表格、一个暗黑切换按钮。**这份代码用 Tailwind Play CDN，复制下来直接用浏览器打开就能看效果，不需要装 Vite。** 注意三点：第一，CDN 脚本只用于学习，正式项目走第 9 节；第二，暗黑模式用类名控制，所以 `<style type="text/tailwindcss">` 里定义了 `@custom-variant dark`，不写它，`dark:` 类就只跟随系统，不跟随按钮；第三，`@theme` 里定义的 `--color-brand` 会生成 `bg-brand`、`text-brand` 这类工具类，颜色值改一处，全站跟着变。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>后台管理示例</title>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
@custom-variant dark (&:where(.dark, .dark *));
@theme {
  --color-brand: #ea580c;
}
</style>
</head>
<body class="bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
<header class="flex items-center justify-between bg-white px-4 py-3 shadow dark:bg-slate-900">
  <div class="flex items-center gap-3">
    <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">管</span>
    <span class="text-lg font-bold">我的后台</span>
  </div>
  <div class="flex items-center gap-3">
    <input type="search" placeholder="搜索订单、用户" class="hidden rounded-lg border border-slate-300 px-3 py-2 sm:block dark:border-slate-700 dark:bg-slate-800">
    <button id="theme-toggle" type="button" class="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">切换暗黑</button>
    <span class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">站</span>
  </div>
</header>
<div class="flex">
  <aside class="hidden w-52 shrink-0 bg-white p-4 shadow md:block dark:bg-slate-900">
    <nav class="flex flex-col gap-1">
      <a href="#" class="rounded-lg bg-brand px-3 py-2 text-white">总览</a>
      <a href="#" class="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">订单</a>
      <a href="#" class="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">用户</a>
      <a href="#" class="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">商品</a>
      <a href="#" class="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">设置</a>
    </nav>
  </aside>
  <main class="flex-1 p-4 sm:p-6">
    <h1 class="mb-4 text-2xl font-bold">今日总览</h1>
    <section class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
        <p class="text-sm text-slate-500 dark:text-slate-400">今日订单</p>
        <p class="mt-1 text-2xl font-bold">128</p>
      </div>
      <div class="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
        <p class="text-sm text-slate-500 dark:text-slate-400">今日收入</p>
        <p class="mt-1 text-2xl font-bold">¥ 8,460</p>
      </div>
      <div class="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
        <p class="text-sm text-slate-500 dark:text-slate-400">新增用户</p>
        <p class="mt-1 text-2xl font-bold">36</p>
      </div>
      <div class="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
        <p class="text-sm text-slate-500 dark:text-slate-400">待处理工单</p>
        <p class="mt-1 text-2xl font-bold">5</p>
      </div>
    </section>
    <section class="overflow-x-auto rounded-xl bg-white shadow dark:bg-slate-900">
      <table class="w-full min-w-150 text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-800">
            <th class="px-4 py-3">订单号</th>
            <th class="px-4 py-3">用户</th>
            <th class="px-4 py-3">金额</th>
            <th class="px-4 py-3">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-b border-slate-100 dark:border-slate-800">
            <td class="px-4 py-3">20261103001</td>
            <td class="px-4 py-3">dawei</td>
            <td class="px-4 py-3">¥ 299</td>
            <td class="px-4 py-3"><span class="rounded-full bg-green-100 px-2 py-1 text-green-700">已完成</span></td>
          </tr>
          <tr class="border-b border-slate-100 dark:border-slate-800">
            <td class="px-4 py-3">20261103002</td>
            <td class="px-4 py-3">小明</td>
            <td class="px-4 py-3">¥ 129</td>
            <td class="px-4 py-3"><span class="rounded-full bg-yellow-100 px-2 py-1 text-yellow-700">处理中</span></td>
          </tr>
          <tr>
            <td class="px-4 py-3">20261103003</td>
            <td class="px-4 py-3">小红</td>
            <td class="px-4 py-3">¥ 59</td>
            <td class="px-4 py-3"><span class="rounded-full bg-slate-200 px-2 py-1 text-slate-700">待付款</span></td>
          </tr>
        </tbody>
      </table>
    </section>
    <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">手机上侧边栏会自动隐藏，卡片从 4 列变成 1 列；点右上角“切换暗黑”，整页配色会跟着变。</p>
  </main>
</div>
<script>
document.getElementById('theme-toggle').addEventListener('click', function () {
  document.documentElement.classList.toggle('dark');
});
</script>
</body>
</html>
```

反面例子只用行内写法说明，不单独成块：`class="bg-orange-500"` 写对了才有橙色，写成 `class="bg-oragne-500"`（字母拼错）构建不报错、页面没效果；`class="md:grid-cols-2"` 里 `md:` 后面必须紧跟类名，写成 `class="md: grid-cols-2"`（冒号后多了空格）会被当成两个类名，响应式不生效；`class="dark:bg-slate-900"` 在没有定义类名暗黑变体时只跟随系统，点按钮不会变——这三类错误占了新手排错时间的大头。

## 11. 完整配置文件

下面两个文件是 Vite 项目的完整配置，存放路径写在每段前面，复制后不要改文件名和位置。

**文件一：项目根目录 `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
})
```

**文件二：`src/index.css`（Tailwind 入口 CSS）**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-brand: #ea580c;
  --font-sans: "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

**文件三：`package.json` 的关键字段（由 npm 自动生成，不要手工编版本号）。** 运行第 9 节的安装命令后，`package.json` 里会自动出现 `tailwindcss` 和 `@tailwindcss/vite` 两个依赖，以及 `dev`、`build`、`preview` 三个脚本；你只需要核对这三处存在，不需要手工写版本号，`npm install` 装到的就是当前版。入口脚本 `src/main.js` 里必须有一行 `import './index.css'`，入口 HTML 里必须引用 `src/main.js`，这两处脚手架默认已接好，往已有项目里加 Tailwind 时要重点核对。

## 12. 每个关键配置项的解释

| 配置项 | 在哪个文件 | 意思是 |
| --- | --- | --- |
| `tailwindcss()` | `vite.config.ts` 的 `plugins` | 告诉 Vite：构建和开发时都用 Tailwind 插件扫描文件、生成 CSS。缺了它，工具类只是普通类名，没有任何样式。 |
| `@import "tailwindcss"` | `src/index.css` 第一行 | Tailwind 4 的入口写法，相当于“把 Tailwind 全部基础样式引进来”。v3 的 `@tailwind base;` 等三行写法在 v4 里已废弃，不要混用。 |
| `@custom-variant dark (&:where(.dark, .dark *))` | `src/index.css` | 把 `dark:` 变体改成“类名模式”：只有 `<html>` 上有 `dark` 类时，`dark:` 类才生效，这样按钮切换才管用。不写它，`dark:` 默认跟随系统深色设置。 |
| `@theme` | `src/index.css` | 定义自己的设计变量。`--color-brand` 会生成 `bg-brand`、`text-brand`、`border-brand` 等一系列工具类；`--font-sans` 会覆盖默认无衬线字体栈。改一处，全站跟着变。 |
| `sm:`、`md:`、`lg:`、`xl:`、`2xl:` | 类名前缀 | 响应式变体，断点分别是 640、768、1024、1280、1536 像素，含义是“达到这个宽度及以上才生效”，是移动优先的写法：先写手机版，再用变体往上加。 |
| `hover:`、`focus:` | 类名前缀 | 交互变体，悬停、聚焦时才生效；不要用它做关键信息提示，触屏上没有悬停，见 CSS-06 的移动端坑。 |
| `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` | 卡片列表 | 组合写法示例：手机 1 列、平板 2 列、桌面 4 列，三个类名写在同一个元素上，浏览器按当前宽度挑一个生效。 |
| `min-w-150` | 表格 | Tailwind 4 的间距倍数写法，`150` 表示 `150 * 0.25rem = 37.5rem`，用来给表格一个最小宽度，窄屏时表格横向滚动而不是把列压变形。 |
| `dark:bg-slate-900`、`dark:text-slate-100` | 全页 | 暗黑模式下的背景和文字色。只改背景不改文字、只改一处不改全页，是暗黑模式最常见的半成品状态，第 14 节的验证步骤就是用来抓它的。 |

## 13. 执行结果示例

开发服务器跑起来后，终端会打印类似下面的内容（端口号可能不同，以你终端实际打印的为准）：

```text
VITE v6 ready in 300 ms

➜  Local:   http://localhost:5173/
➜  press h + enter to show help
```

浏览器打开这个地址，页面效果应该是：顶栏一行，左边是标志和“我的后台”，右边是搜索框、切换暗黑按钮和头像；桌面宽度下左侧有侧边栏，中间 4 张数据卡片排成一行，下面是一张订单表；把窗口缩到手机宽度，侧边栏消失，搜索框隐藏，卡片变成一列；点“切换暗黑”，整页背景变深、文字变浅、卡片和表格也跟着变深，而不是只有背景变了。

构建产物检查：运行 `npm run build` 后，`dist/assets/` 下的 CSS 文件里能搜到你用过的类名对应的规则，搜不到你没用过的类名——这就是第 6 节说的“只生成已用类名”。如果搜不到任何工具类规则，说明第 11 节的插件或 CSS 引入漏了一处，先回第 16 节排查。

## 14. 成功验证

按顺序做完下面 5 步，全部通过才算本篇完成：

1. **开发服务器能打开。** `npm run dev` 后浏览器能打开本地地址，页面不是空白，顶栏、卡片、表格都看得到。
2. **工具类生效。** 任意改一个类名，例如把一张卡片的 `bg-white` 改成 `bg-orange-100`，保存后浏览器自动刷新，卡片背景立刻变浅橙；改回去也立刻恢复。改了没反应，先查类名拼写，再查 CSS 引入。
3. **响应式生效。** 把浏览器窗口从宽拖到窄：桌面 4 列卡片 → 平板 2 列 → 手机 1 列，侧边栏在窄屏消失；如果列数不变，检查 `sm:`、`lg:` 前缀是不是写错位置，或者断点类是不是写在了错误的父元素上。
4. **暗黑模式生效。** 点“切换暗黑”，整页背景、文字、卡片、表格、侧边栏要一起变，再点一次要变回来；如果点了没反应，先确认 `@custom-variant dark` 写进了 `src/index.css`（CDN 示例是写进 `<style type="text/tailwindcss">`），再确认按钮脚本确实给 `<html>` 加了 `dark` 类。
5. **构建通过。** `npm run build` 退出码为 0，`dist/` 里有 CSS 文件，且里面含已用类名、不含未用类名。构建报错时先看报错第一行指的文件名，不要从最后一行开始猜。

## 15. 常见错误

| 错误现象 | 原因 | 改法 |
| --- | --- | --- |
| 页面完全没有样式 | `vite.config.ts` 没加 `tailwindcss()` 插件，或 `src/main.js` 没引入 `index.css` | 按第 11 节核对这两处，缺哪补哪 |
| 只有一部分类名生效 | 类名拼错，例如 `grid-col-2`、`bg-oragne-500` | 对照官网文档逐个字母核对，构建对拼错的类名不报错 |
| 响应式没反应 | 变体写错位置，例如 `grid-cols-2 md:`，或把断点类写在子元素上 | 变体永远是前缀，写在类名前面：`md:grid-cols-2` |
| 暗黑切换点了没反应 | 没定义类名暗黑变体，`dark:` 还在跟随系统 | 加 `@custom-variant dark (&:where(.dark, .dark *))`，并确认脚本给 `<html>` 加类 |
| 照抄老教程的 `tailwind.config.js` 不生效 | v4 已改为 CSS 优先配置，JS 配置文件不再是入口 | 删掉 `tailwind.config.js`，把主题写进 `@theme` |
| 照抄老教程的 `@tailwind base;` 报错 | v4 入口已改为 `@import "tailwindcss"` | 把三行 `@tailwind` 指令换成一行 `@import` |
| CDN 示例在正式项目里越用越慢 | 浏览器版每次打开都要在浏览器里实时编译，文件越大越慢，且依赖外网 | 正式项目改走第 9 节的 Vite 构建，构建产物是静态 CSS |
| 类名越写越多，HTML 读不下去 | 同一组类名在十几个地方重复出现 | 把重复组合抽成组件（框架里是组件，纯 HTML 里是模板片段），或用 `@utility` 定义自己的工具类，见第 19 节的官网文档 |

## 16. 故障排查

按“先看控制台，再看文件，最后看拼写”的顺序排查，不要一上来就重装依赖：

1. **浏览器控制台有 404。** 看 404 的是哪个文件：如果是 `index.css`，说明入口脚本或 HTML 引用路径错了；如果是 CDN 脚本，说明网络或 CDN 地址有问题，先换网络再怀疑代码。
2. **终端构建报错指向某个文件。** 报错第一行给出的文件名就是第一嫌疑人：`vite.config.ts` 报错多半是插件引入写错，`index.css` 报错多半是 `@import` 或 `@theme` 语法错，先打开那个文件逐行看。
3. **样式时有时无。** 开发服务器开着时改了 `vite.config.ts`，Vite 一般会自动重启；如果没重启，手动停掉再跑一次 `npm run dev`，不要在旧进程上反复刷新浏览器。
4. **只在某一台机器上没样式。** 先确认那台机器的 Node.js 版本和依赖装没装全（`node_modules` 是否存在、`npm install` 是否跑完），再确认浏览器版本是否达到第 3 节的目标版本。
5. **暗黑模式一半深一半浅。** 逐个检查没变深的元素：凡是写了 `bg-white` 的地方都要配一个 `dark:bg-slate-900`，凡是写了 `text-slate-900` 的地方都要配一个 `dark:text-slate-100`，漏配就是半成品。
6. **表格在手机上被压变形。** 给表格包一层 `overflow-x-auto`，表格本身给 `min-w-150` 这类最小宽度，让它横向滚动，不要试图把 4 列硬压进手机宽度。
7. **实在找不到原因。** 新建一个最小项目，只留一个带 `bg-orange-500 text-white p-4` 的方块，能显示说明旧项目配置有问题，逐项对比两个项目的 `vite.config.ts` 和 `index.css`；最小项目也不显示，说明是 Node.js、网络或浏览器环境问题，先修环境。

## 17. 安全注意事项

- **生产环境不要用 Play CDN。** CDN 脚本会在浏览器里实时编译样式，页面每次打开都要重新算一遍，又慢又依赖外网；更重要的是，你的页面样式来源变成了一个远程脚本，一旦 CDN 出问题或被替换，页面样式就跟着出问题。正式项目一律用第 9 节的本地构建，产物是自己服务器上的静态文件。
- **不要把密钥、Token、密码写进类名或 CSS。** 工具类最终会出现在构建产物和浏览器里，任何人打开开发者工具都看得到；需要保密的东西只放服务器端，永远不要出现在前端代码里。
- **暗黑模式不要只改颜色。** 对比度不够的暗黑配色会让文字看不清，尤其 `text-slate-500` 这类浅灰在深色背景上更难读；换肤后按第 14 节第 4 步全页检查一遍，不要只看顶栏。
- **第三方模板的类名先读再用。** 网上复制来的 Tailwind 页面片段可能带你不认识的任意值类名，例如 `w-[37px]`、`bg-[#ff0000]`，先确认它干什么再粘贴，不要把来历不明的样式原样上线。
- **构建产物不要手工改。** `dist/` 里的 CSS 是生成的，下次构建会覆盖；要改样式永远改源码（HTML 里的类名和 `src/index.css`），不要改产物。

## 18. 回滚和恢复

回滚分两档，按改动范围选一档，不要一上来就删整个项目：

1. **只想撤掉 Tailwind，保留页面结构。** 删掉 `vite.config.ts` 里的 `tailwindcss()` 插件行，删掉 `src/main.js` 里的 `import './index.css'`，删掉 `src/index.css` 里的 Tailwind 相关内容（或整个文件改回你原来的 CSS），再跑一次 `npm run dev` 确认页面回到没有 Tailwind 的样子；工具类名还留在 HTML 里，但没有样式对应，不会报错，只是不生效，之后可以慢慢替换成普通 CSS。
2. **整个项目不要了。** 直接删掉 `tailwind-admin` 目录重建，依赖和配置全部重来；重建前如果页面结构已经写了很多，先把 `index.html` 单独拷出来，工具类名都在 HTML 里，重建后不用重写页面。
3. **恢复方法。** 如果你用了 Git，`git checkout -- vite.config.ts src/index.css src/main.js` 就能把这三个文件恢复到上次提交的状态；如果没用 Git，动手前先把这三个文件各复制一份加 `.bak` 后缀，这是 CSS-08 也讲过的文件组织习惯：配置文件先备份再改。

## 19. 延伸阅读

- Tailwind CSS 官网文档：安装、工具类总表、响应式、暗黑模式、`@theme` 自定义主题、`@utility` 自定义工具类，是本篇所有类名和写法的最终依据，遇到不确定的类名先查官网，不要靠猜。
- Vite 官网文档：开发服务器、构建、插件机制，帮你理解 `vite.config.ts` 里那一行插件到底在干什么。
- CSS-04、CSS-05：工具类背后的 Flex、Grid 原理，类名记不住时回到这两篇看属性本身。
- CSS-06：响应式断点的思路，Tailwind 的变体只是把那套思路换成了前缀写法。
- CSS-08：样式文件组织、BEM、构建工具概念，帮你判断一个项目到底适不适合上 Tailwind，还是继续用普通 CSS 更合适。

## 20. 相关章节链接

- 上一篇：[CSS-09 Bootstrap](./01-bootstrap.md)
- 下一篇：[CSS-11 Bulma](./03-bulma.md)
- 前置基础：[CSS-01 基础语法与选择器](../css/01-basics.md)、[CSS-02 单位与颜色](../css/02-units-colors.md)、[CSS-03 盒模型与定位](../css/03-box-position.md)、[CSS-06 响应式设计](../css/06-responsive.md)、[CSS-07 动画和高级效果](../css/07-animation.md)、[CSS-08 CSS 工程化](../css/08-engineering.md)
- 规划文件：[MASTER_PLAN](../MASTER_PLAN.md)、[TASK_INDEX](../TASK_INDEX.md)、[ROADMAP](../ROADMAP.md)
