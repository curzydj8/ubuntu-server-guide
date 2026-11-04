# JS-04：npm、pnpm、Vite、前端工程化完整教程

> 任务编号：JS-04（网站建设与部署实战指南 · 前端工程化）
> 上一篇：[JS-03 TypeScript](./03-typescript.md)；下一篇：[FE-01 Vue 3](../frontend/01-vue.md)。
> 本篇只讲前端工程化：包管理器怎么选、Vite 项目怎么建、开发和构建流程怎么走、ESLint 与 Prettier 怎么分工配合、一个最小可跑的工程目录长什么样。不讲 JavaScript 语法本身，不讲 DOM 操作的系统写法，不讲 TypeScript 的类型写法，那些是前面 JS-01、JS-02、JS-03 的内容。

## 1. 本章目标

读完本篇，你能做到下面五件事：

1. 说清 npm 与 pnpm 的区别，并能按项目情况选一个，而不是跟风换工具。
2. 从空文件夹开始，用 Vite 建一个最小前端工程，并能说出每个文件是干什么的。
3. 能跑开发服务器、能构建出可部署的产物，并能区分开发模式和生产构建。
4. 给工程配好 ESLint 与 Prettier，让“代码有没有错”和“代码好不好看”由两个工具各管一摊、互不打架。
5. 遇到装包失败、端口占用、构建报错、lint 报错时，能按第 16 节的顺序定位，而不是把 `node_modules` 删了重装了事。

## 2. 适用人群

适合已经能写 HTML 页面、知道什么是终端命令的读者。如果你还没有写过一个完整 HTML 页面，先看 HTML 基础篇；如果你对 CSS 文件怎么组织还没有概念，先看 CSS 工程化篇。本篇不要求你会任何前端框架，Vue、React、Angular 都不在本篇的讨论范围里，那些是下一阶段 FE 篇的内容。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 都可以，命令写法以跨平台通用的形式给出，Windows 用户用 PowerShell 或系统自带终端即可。
- Node.js：需要一个较新的长期支持版。Vite 8 要求 Node.js 20.19 以上或 22.12 以上，装好后先跑 `node -v` 确认，版本太旧是本篇最常见的起手失败原因。
- 包管理器：npm 随 Node.js 一起装，不用单独装；pnpm 需要单独装一次，见第 9 节。
- Vite：写作时主线为 8.x（2026-11-03 核查），本篇示例用 `^8.0.0` 这样的主版本范围写法，不把某一个补丁号写死，安装时以 `npx vite --version` 当场查到的版本为准。
- ESLint：主版本 9，采用扁平配置 `eslint.config.js`，老式的 `.eslintrc` 写法在新版里已经不适用，见第 15 节。
- Prettier：主版本 3，配置放在 `.prettierrc.json`。
- 浏览器：只要是近几年的现代浏览器即可，开发服务器用的是浏览器原生支持的 ES 模块，不是靠浏览器去读源码目录。

版本号核查方法（每次动手前都值得跑一遍）：

```bash
node -v
npm -v
pnpm -v
npx vite --version
```

## 4. 使用前提

动手前请确认下面四点都满足：

1. Node.js 已安装，且 `node -v` 能输出版本号。
2. 会用终端进入一个文件夹、会用编辑器新建和保存文件。
3. 有一个空文件夹准备放这个工程，不要直接在桌面根目录或已有项目里混着建。
4. 机器能访问 npm 仓库（也就是能联网装包）。如果你在内网或网络受限环境，先解决 registry 地址问题再往下走，否则第 9 节的安装步骤会在第一步就卡住。

## 5. 所需资源

| 资源 | 用途 | 是否收费 |
| --- | --- | --- |
| Node.js | 运行 npm、Vite、ESLint、Prettier 的运行时 | 免费 |
| npm 或 pnpm | 装包、管依赖、跑脚本 | 免费 |
| Vite | 开发服务器与生产构建 | 免费 |
| ESLint | 检查代码错误与不规范写法 | 免费 |
| Prettier | 统一代码格式 | 免费 |
| 编辑器 | 写代码，任意编辑器均可 | 免费 |
| 浏览器 | 打开开发服务器地址看效果 | 免费 |

本篇不需要注册任何账号，不需要服务器，不需要域名。所有工具都在本地跑，构建产物 `dist` 在需要部署时才交给服务器，那是后面部署篇的事。

## 6. 技术原理

### 6.1 包管理器在干什么

写前端代码时，我们很少从零写所有东西，而是复用别人发布的包。一个包就是一段可复用的代码加一份说明。包管理器做四件事：

1. 读 `package.json`，知道这个工程要哪些包、哪个版本范围。
2. 去仓库（默认是 npm 官方仓库）下载这些包，并算出它们各自又依赖哪些包，整张依赖图都要对得上。
3. 把下载结果写进 `package-lock.json`（npm）或 `pnpm-lock.yaml`（pnpm），把版本彻底锁死，保证别人拿到同一份锁文件能装出同样的依赖。
4. 把包放进 `node_modules`，让代码里的 `import` 能找到它们。

版本范围的写法要先看懂：`^8.0.0` 表示“8 开头、兼容的最新版”，`~8.0.0` 表示“只动补丁号”，不带符号的 `8.0.0` 表示“钉死这一个版本”。范围写得越宽，升级越省事，出兼容问题的风险也越大；锁文件就是用来兜底的：范围可以宽，实际装的版本由锁文件钉死。

### 6.2 npm 与 pnpm 的区别

| 对比项 | npm | pnpm |
| --- | --- | --- |
| 依赖存放方式 | 每个项目各有一份 `node_modules`，同一个包在多个项目里会重复占磁盘 | 所有包先存进全局内容寻址仓库，项目里的 `node_modules` 只放硬链接，省磁盘 |
| 磁盘占用 | 项目一多就明显变大 | 多个项目共享同一份包体，明显更省 |
| 依赖提升 | 默认会把子依赖提升到顶层，代码可能误引用到没有直接声明的包 | 默认不提升，只能引用自己声明过的包，误引用会直接报错，更严格 |
| 锁文件 | `package-lock.json` | `pnpm-lock.yaml`，两者不通用 |
| 上手成本 | 随 Node.js 自带，零安装 | 需要单独装一次 |
| 适用场景 | 一个项目、快速上手、团队已有 npm 习惯 | 多个项目共用一台机器、对依赖边界要求严、想省磁盘 |

选用建议就一句话：只有一个项目、想最快跑起来，选 npm；机器上有多个前端项目、或者你希望“没声明就不能用”这种严格边界，选 pnpm。两者不要在同一个项目里混用，混用会产生两份锁文件，迟早对不上。

### 6.3 Vite 在干什么

传统打包工具是“先把所有代码打成一个大包，浏览器再打开”。Vite 的开发模式反过来：浏览器需要哪个模块，开发服务器就现给哪个模块，用的就是浏览器原生支持的 ES 模块。这样改动一个文件只影响这一个模块，启动快、热更新快。

生产构建是另一条路：开发时图快可以一个个给，部署时图稳要把代码合并、压缩、加哈希、处理图片和 CSS，一次交给浏览器。Vite 8 的生产构建用的是统一的 Rust 打包器 Rolldown，不再是以前开发一套、生产一套的组合，但对使用者来说命令不变：开发用 `vite`，构建用 `vite build`。

### 6.4 ESLint 与 Prettier 的分工

ESLint 是检查员：读代码的语法结构，判断有没有错误写法、不规范写法，比如用了没声明的变量、用了 `==` 这种容易出错的比较。Prettier 是排版员：不管代码写得对不对，只管格式统一，比如缩进几个空格、引号用单引号还是双引号、句尾加不加分号。

分工的底线是：格式问题只交给 Prettier，ESLint 不要再配一套格式规则。两个工具同时管格式、且规则不一致时，会出现“Prettier 刚排好、ESLint 又说不对、修完 ESLint、Prettier 又改回去”的死循环。本篇的 ESLint 配置里只放正确性规则，格式规则一律不放，这就是第 10 节那样写的原因。

## 7. 架构说明

最小工程的目录结构如下，括号里是每一项的角色：

```text
tooling-demo/
├── index.html          # 入口页面，浏览器打开的起点
├── package.json        # 工程清单：名字、脚本、依赖
├── package-lock.json   # npm 锁文件（用 pnpm 时换成 pnpm-lock.yaml）
├── vite.config.js      # Vite 的配置：端口、构建输出目录
├── eslint.config.js    # ESLint 的配置：检查哪些文件、哪些规则
├── .prettierrc.json    # Prettier 的配置：引号、分号、缩进
├── .gitignore          # 告诉 Git 哪些东西不要提交
├── node_modules/       # 装好的包，不要提交、不要手改
├── dist/               # 构建产物，部署时用的就是它，不要手改
└── src/
    ├── main.js         # 入口脚本，index.html 引用它
    └── style.css       # 入口样式，被 main.js 引用
```

数据流向分两条线，千万不要混淆：

1. 开发线：浏览器打开开发服务器地址 → 服务器返回 `index.html` → 页面里的脚本标签指向 `/src/main.js` → 服务器按需返回 `main.js` 及其引用的 `style.css`，改动立即热更新。
2. 构建线：跑 `vite build` → Vite 读 `index.html` 找到入口 → 沿着 `import` 链把代码、样式、图片收拢 → 输出到 `dist/`，`dist/index.html` 就是可以直接部署的页面。

`node_modules` 和 `dist` 都是生成物：前者由装包生成，后者由构建生成，删了都能重建，不要把它们当成源码去改，也不要提交进 Git。

## 8. 操作前检查

动手前按下面这张表逐项打勾，缺哪项补哪项：

| 检查项 | 命令或方法 | 不通过怎么办 |
| --- | --- | --- |
| Node.js 已安装且版本够新 | `node -v`，对照第 3 节的版本要求 | 重装较新的长期支持版 |
| npm 可用 | `npm -v` | 随 Node.js 重装 |
| pnpm 可用（只在选 pnpm 时需要） | `pnpm -v` | 按第 9 节装一次 |
| 文件夹是空的 | 进文件夹看一眼，没有旧的 `package.json` | 换一个空文件夹，不要在旧项目里混建 |
| 文件夹路径没有中文和空格 | 看一眼路径 | 换一个纯英文、无空格的路径，奇怪路径是很多报错的源头 |
| 已想好用 npm 还是 pnpm | 对照第 6.2 节的表 | 没想好就先选 npm，跑起来再说 |

## 9. 逐步操作

下面每一步都在工程根目录（也就是放 `package.json` 的那一级）执行，换文件夹就先 `cd` 回来。

**第 1 步：建文件夹并进去。**

```bash
mkdir tooling-demo
cd tooling-demo
```

**第 2 步：选包管理器。**

只用 npm 的话，这一步什么都不用做；选 pnpm 的话，先装一次 pnpm：

```bash
npm install -g pnpm
pnpm -v
```

**第 3 步：初始化工程清单。**

```bash
npm init -y
```

这一步会生成一份默认的 `package.json`，第 10 节的完整版就是在这份的基础上改出来的。

**第 4 步：装开发依赖。**

用 npm：

```bash
npm install -D vite eslint prettier
```

用 pnpm：

```bash
pnpm add -D vite eslint prettier
```

`-D` 表示开发依赖：这些工具只在开发和构建时用，不会跟着产物发给浏览器。装完后会出现 `node_modules` 和锁文件，锁文件要提交进 Git，`node_modules` 不要提交。

**第 5 步：按第 10 节写齐所有文件。**

先写 `index.html`、`src/main.js`、`src/style.css`，再写 `vite.config.js`、`eslint.config.js`、`.prettierrc.json`、`.gitignore`，最后把 `package.json` 改成第 10 节的完整版。顺序不重要，写齐才重要，缺了入口文件开发服务器会直接报找不到入口。

**第 6 步：启动开发服务器。**

```bash
npm run dev
```

终端出现类似“Local: http://localhost:5173/”的地址后，用浏览器打开它，应该看到入口文字。改一下 `src/main.js` 里的文字保存，浏览器应该自动更新，不用手动刷新，这就是热更新在工作。

**第 7 步：检查代码和格式。**

```bash
npm run lint
npm run format:check
```

`lint` 有警告或错误时先看报错指向哪一行，不要直接跑自动修复；`format:check` 只是检查，不改文件，确认格式没问题后再跑 `format` 统一写回。

**第 8 步：统一格式（只在需要时跑）。**

```bash
npm run format
```

这一步会改写所有源文件，跑之前确保没有未保存的改动，跑完后看一眼 diff，确认改的只是格式。

**第 9 步：构建生产产物。**

```bash
npm run build
```

构建成功后会出现 `dist/`，里面有 `index.html` 和带哈希的资源文件。构建产物不要手改，改源码、重新构建才是正路。

**第 10 步：本地预览构建产物。**

```bash
npm run preview
```

预览用的是 `dist/` 里的东西，不是源码。预览能打开，说明构建产物本身没问题；预览打不开但开发模式能打开，问题一般出在构建配置或资源路径上，按第 16 节排查。

## 10. 完整代码

下面是第 9 节第 5 步要写齐的全部文件，每一份都是完整的，没有省略号，照抄就能用。反面例子在本篇只出现在第 15 节的表格里、用行内代码写，不会单独成块，所以下面每一个代码块都是正确示例。

工程目录（与第 7 节一致）：

```text
tooling-demo/
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── .prettierrc.json
├── .gitignore
└── src/
    ├── main.js
    └── style.css
```

`package.json`，存放在工程根目录：

```json
{
  "name": "tooling-demo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "vite": "^8.0.0"
  }
}
```

`vite.config.js`，存放在工程根目录。注意这里用的是 ES 模块写法，与 `package.json` 里的 `"type": "module"` 对应：

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
```

`eslint.config.js`，存放在工程根目录。注意这里只放正确性规则，格式规则（分号、引号、缩进）一律不放，全部交给 Prettier：

```js
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': 'warn',
      eqeqeq: ['error', 'always']
    }
  }
];
```

`.prettierrc.json`，存放在工程根目录：

```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

`index.html`，存放在工程根目录。关键是脚本标签：`type="module"` 加上 `/src/main.js` 这个路径，Vite 靠它找到入口：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>前端工程最小示例</title>
</head>
<body>
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
</body>
</html>
```

`src/main.js`，存放在 `src/` 目录。第一行引用样式是 Vite 工程的常见写法：样式不是靠 `index.html` 里的样式表链接引入，而是由入口脚本引用，构建时 Vite 会一并处理：

```js
import './style.css';

const app = document.querySelector('#app');
if (app) {
  app.textContent = '前端工程已跑起来';
}
console.log('main.js 已加载');
```

`src/style.css`，存放在 `src/` 目录：

```css
body {
  font-family: system-ui, sans-serif;
  margin: 0;
}

#app {
  padding: 24px;
  font-size: 18px;
}
```

`.gitignore`，存放在工程根目录：

```text
node_modules/
dist/
.DS_Store
```

## 11. 完整配置文件（存放路径）

| 文件 | 存放路径 | 作用 | 是否提交进 Git |
| --- | --- | --- | --- |
| `package.json` | 工程根目录 | 工程清单、脚本、依赖范围 | 提交 |
| `package-lock.json` 或 `pnpm-lock.yaml` | 工程根目录 | 锁死实际安装版本 | 提交，二选一，不要两个都留 |
| `vite.config.js` | 工程根目录 | 开发端口、构建输出目录 | 提交 |
| `eslint.config.js` | 工程根目录 | 检查范围与规则 | 提交 |
| `.prettierrc.json` | 工程根目录 | 格式规则 | 提交 |
| `.gitignore` | 工程根目录 | 排除 `node_modules` 与 `dist` | 提交 |
| `index.html` | 工程根目录 | 入口页面 | 提交 |
| `src/main.js` | `src/` 目录 | 入口脚本 | 提交 |
| `src/style.css` | `src/` 目录 | 入口样式 | 提交 |

备份方法：改任何一个配置文件之前，先复制一份，例如 `cp vite.config.js vite.config.js.bak`，改坏了直接把备份拷回来。备份文件不要提交，改完确认无误后删掉它，或者把它写进 `.gitignore`。

## 12. 每个关键配置项的解释

### 12.1 `package.json`

| 字段 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `name` | 工程名，只能用小写字母、数字、连字符 | 大写或空格会导致装包时报错 |
| `private` | `true` 表示这个包不会被发布到仓库，防误发 | 漏写且误跑发布命令时可能把私有代码推出去 |
| `version` | 工程自身的版本号，改动发布时才重要，本地练手可不动 | 格式不对会报版本非法 |
| `type` | `"module"` 表示本工程的 `.js` 文件按 ES 模块处理，与第 10 节的 `import` 写法对应 | 漏写时 `import` 写法在某些场景下会被当成旧式模块 |
| `scripts` | 快捷命令，`npm run dev` 实际跑的就是这里 `dev` 后面的命令 | 命令拼错时终端会报找不到命令，要先看这一行 |
| `devDependencies` | 开发依赖，只在开发和构建时用 | 把运行时的包误放进来不会立刻报错，但会让依赖表失真 |

### 12.2 `vite.config.js`

| 字段 | 含义 |
| --- | --- |
| `server.port` | 开发服务器端口，本篇用 5173，也就是 Vite 的默认端口，写出来是为了让改端口时有地方改 |
| `server.open` | `false` 表示启动时不自动打开浏览器，`true` 则自动打开，按个人习惯改 |
| `build.outDir` | 构建产物目录，本篇用 `dist`，部署时就部署这个目录 |
| `build.sourcemap` | `false` 表示构建时不生成源码映射文件，产物更小；调试构建产物时才临时改成 `true` |

### 12.3 `eslint.config.js`

| 写法 | 含义 |
| --- | --- |
| `files` | 这条规则只对哪些文件生效，本篇只检查 `src/` 下的 `.js` 文件，不检查配置文件本身 |
| `languageOptions.ecmaVersion` | 按最新语法解析，`'latest'` 表示不限制语法版本 |
| `languageOptions.sourceType` | `"module"` 表示按 ES 模块解析，与 `import` 写法对应 |
| `no-unused-vars` | 声明了却没用到的变量报警告，`warn` 是警告不是错误，不会拦住构建 |
| `eqeqeq` | 强制用 `===` 而不用 `==`，`always` 表示所有比较都要严格相等 |

### 12.4 `.prettierrc.json`

| 字段 | 含义 |
| --- | --- |
| `singleQuote` | `true` 表示字符串优先用单引号 |
| `semi` | `true` 表示句尾保留分号 |
| `tabWidth` | 缩进宽度，本篇用 2 个空格 |
| `trailingComma` | `"es5"` 表示只在 ES5 合法的位置加尾随逗号，对象和数组的最后一项后面加逗号，函数参数后面不加 |

### 12.5 入口对应关系

| 一环 | 文件 | 下一环怎么找到它 |
| --- | --- | --- |
| 浏览器打开 | `index.html` | 开发服务器或 `dist/index.html` 直接返回它 |
| 页面引用脚本 | `index.html` 里的 `<script type="module" src="/src/main.js">` | 路径以 `/` 开头表示从工程根目录算起，不要写成相对路径 `src/main.js`，构建后路径会变 |
| 脚本引用样式 | `src/main.js` 第一行的 `import './style.css'` | 路径以 `./` 开头表示从 `main.js` 所在目录算起，也就是 `src/` 目录 |
| 样式作用到页面 | `src/style.css` 里的 `#app` | 对应 `index.html` 里的 `<div id="app">`，名字对不上样式就不生效 |

## 13. 执行结果示例

下面是读者按第 9 节操作后应该看到的输出样子，不是本篇验证时实际跑出来的输出（本篇验证没有跑装包和构建，原因见第 14 节末尾的如实说明）。输出里的端口和文件名以你自己机器上的为准，关键是状态词要对得上。

开发服务器启动成功，终端应出现类似下面的内容：

```text
VITE ready in 300 ms

➜  Local:   http://localhost:5173/
➜  press h + enter to show help
```

构建成功，终端应出现类似下面的内容，最后一行是产物目录：

```text
vite build
✓ built in 400 ms
dist/index.html  0.50 kB
dist/assets/index-xxxx.js  150.00 kB
```

检查通过时，`npm run lint` 和 `npm run format:check` 都应该安静地结束、不报错误；有警告时终端会逐条列出文件、行号和规则名，警告不等于失败，但上线前最好清掉。

## 14. 成功验证

按下面五步逐项验证，全部通过才算工程跑通：

1. 开发验证：跑 `npm run dev`，浏览器打开终端给出的地址，能看到 `src/main.js` 里写的那句入口文字；改一下这句文字保存，浏览器自动更新，说明热更新在工作。
2. 构建验证：跑 `npm run build`，`dist/` 里出现 `index.html` 和带哈希的资源文件；再跑 `npm run preview`，预览地址能打开，说明构建产物本身没问题。
3. 检查验证：跑 `npm run lint`，没有错误级别的报错；有警告时能说出警告指向哪一行、哪条规则。
4. 格式验证：跑 `npm run format:check`，全部文件通过；跑 `npm run format` 后再看一次 diff，确认改的只是格式。
5. 入口验证：确认 `index.html` 里的脚本路径、`main.js` 里的样式引用路径、`style.css` 里的 `#app` 三处名字都对得上，见第 12.5 节的表。

如实说明（本篇验证的边界）：本篇作者验证时没有跑 `npm install`、`npm run dev`、`npm run build`，因为装包依赖网络、耗时不确定，不适合放在这次验证里做。所以第 13 节的输出是“读者按步骤操作后应看到的样子”，不是作者实际跑出来的终端记录；Vite 构建流程在本篇是给读者的操作说明，不声称构建通过。作者实际验证过的是第 10 节代码本身的正确性：`package.json` 能被 JSON 解析、`vite.config.js` 与 `main.js` 能通过 `node --check`、`index.html` 能通过 HTML 解析、入口示例文件能通过本地服务返回，见汇报第 5 节。读者按第 14 节的五步在自己机器上验证，才是工程真正跑通的证据。

## 15. 常见错误

| 现象 | 原因 | 修复方法 |
| --- | --- | --- |
| `node -v` 报找不到命令 | Node.js 没装，或装完没重开终端 | 重装 Node.js，重开终端再试 |
| 装包时报 Node.js 版本不满足 | Node.js 太旧，达不到 Vite 8 的版本要求 | 升级到第 3 节要求的版本再装 |
| `npm run dev` 报找不到 `vite` | 依赖没装好，或在错误的目录里跑命令 | 回到工程根目录，重新跑安装命令 |
| 开发页面一片空白，控制台报找不到模块 | 入口脚本路径写错，例如把 `/src/main.js` 写成了 `src/main.js` | 按第 12.5 节核对路径，`/` 开头与 `./` 开头的含义不同 |
| 端口被占用 | 5173 已被别的服务占了 | 改 `vite.config.js` 里的 `server.port`，或先停掉占用端口的服务 |
| ESLint 报找不到配置文件 | 还在用老式的 `.eslintrc` 文件名，新版 ESLint 9 不认 | 改用 `eslint.config.js` 扁平配置，见第 10 节 |
| ESLint 与 Prettier 互相打架 | ESLint 里配了分号、引号这类格式规则，与 Prettier 规则不一致 | 从 ESLint 配置里删掉格式规则，只留正确性规则，格式只交给 Prettier |
| `pnpm-lock.yaml` 和 `package-lock.json` 同时存在 | npm 与 pnpm 在同一个项目里混用了 | 选定一个包管理器，删掉另一个的锁文件和 `node_modules`，重新装一次 |
| 样式没生效 | `main.js` 里没引用样式，或 `style.css` 里的选择器名字与页面元素对不上 | 核对第 12.5 节的三处名字 |
| 构建成功但预览打不开 | 改了构建产物里的文件，或资源路径写错 | 不要手改 `dist/`，改源码、重新构建 |

反面写法提醒（只用行内代码表示，不要照抄成文件）：把 `type` 写成 `"commonjs"` 却在 `main.js` 里用 `import`、把脚本路径写成 `src/main.js`、在 ESLint 里同时配 `semi` 又让 Prettier 用另一套分号规则、把 `node_modules` 提交进 Git，这四种都是本篇明确不建议的写法。

## 16. 故障排查

按下面这个顺序排查，不要一上来就删 `node_modules`：

1. 先看报错的第一行：是找不到命令、找不到模块、还是配置文件语法错？第一行往往就是根因，后面的堆栈只是连锁反应。
2. 找不到命令：先确认是不是在工程根目录，再确认 `package.json` 的 `scripts` 里有没有这条命令，最后确认依赖装没装。
3. 找不到模块：先看 `import` 路径，再看文件是不是真的在那个位置，最后看是不是把包名拼错了。
4. 配置文件语法错：对 `vite.config.js` 和 `main.js` 跑 `node --check`，对 `package.json` 和 `.prettierrc.json` 跑 JSON 解析，语法先过关再谈逻辑。
5. 装包失败：先看是不是网络或仓库地址问题，再看 Node.js 版本，最后才考虑清缓存重装。清缓存的命令是 `npm cache clean --force`（npm）或 `pnpm store prune`（pnpm），清完要重新装。
6. 开发能打开、构建打不开：重点查构建配置和资源路径，不要怀疑开发服务器；反过来，构建能过、开发打不开，重点查端口和入口路径。
7. lint 报错与格式报错分开看：lint 报错修代码逻辑，格式报错跑 `npm run format`，两者混着修容易越修越乱。
8. 还是定位不到：把报错信息原样记下来，连同当时跑的命令、所在的目录、Node.js 版本一起留着，换一台机器或请人帮忙时，这些信息比“我这边报错了”有用得多。

## 17. 安全注意事项

1. 前端代码最终都会发给浏览器，写进前端代码的任何东西都等于公开：密钥、令牌、内部接口地址都不要写进 `src/`，需要保密的东西只能放服务端。
2. `node_modules` 和 `dist` 不要提交进 Git，前者是装包生成的，后者是构建生成的，提交它们既臃肿又容易把本地路径带进去。
3. 锁文件要提交：没有锁文件，别人装出来的依赖版本可能和你不一样，“在我机器上能跑”就成了常态。
4. 装包前看一眼包名和来源：名字拼错一个字母就可能装到冒名包，团队项目里新加依赖最好有人复核。
5. 定期跑 `npm audit`（npm）或 `pnpm audit`（pnpm）看已知漏洞报告，有高危项时按报告升级对应包，不要忽视警告直接上线。
6. 不要轻易用 `--force` 或 `--legacy-peer-deps` 绕过依赖冲突：绕过去的那一刻问题只是被藏起来，构建或运行时还会以更难查的形式出现。
7. 自动修复命令（`eslint . --fix`、`prettier --write .`）会改写文件，跑之前确认改动可回滚，见第 18 节。

## 18. 回滚和恢复

| 场景 | 恢复方法 |
| --- | --- |
| 改坏了一个配置文件 | 把改动前的备份拷回来，例如 `cp vite.config.js.bak vite.config.js`，没有备份就按第 10 节重写一份 |
| 装包后工程跑不起来 | 删掉 `node_modules` 和锁文件，重新装一次；注意锁文件删掉后版本会重新解析，装完要重新跑第 14 节验证 |
| 构建产物坏了 | 删掉 `dist/`，重新跑 `npm run build`，`dist` 本来就是生成物，删了不心疼 |
| 格式工具把文件改乱了 | 用 Git 恢复改动过的文件，例如 `git checkout -- src/`，前提是改动前已提交；没提交时只能靠备份 |
| 想换包管理器 | 删掉旧的锁文件和 `node_modules`，用新的包管理器重新装，确认 `package.json` 的脚本命令在新工具下也能跑 |
| 想回到没有工程化的状态 | 删掉配置文件和 `package.json`，只留 `index.html` 和手写样式，但这等于放弃第 6 节讲的全部收益，只建议在练手小页面里这么做 |

通用备份习惯：改配置前先复制一份、改代码前先提交一次，这两件事做到了，大部分回滚都是一条命令的事。

## 19. 延伸阅读

- Vite 官方文档：开发服务器、构建配置、插件写法以官方文档为准，版本升级时先看迁移说明。
- npm 官方文档：`package.json` 字段、版本范围、锁文件的完整说明。
- pnpm 官方文档：工作区、硬链接存储、严格依赖边界的完整说明。
- ESLint 官方文档：扁平配置的写法、核心规则列表、自定义规则的入口。
- Prettier 官方文档：全部格式选项的含义，以及与 ESLint 配合的推荐做法。
- 本指南前面讲过的两篇：HTML 基础、CSS 工程化，见第 20 节。

## 20. 相关章节链接

- HTML 入口与页面结构：[HTML 基础与语义化标签](../html/01-basics.md)
- CSS 文件组织与工程化思路：[CSS 工程化](../css/08-engineering.md)
- 本指南的总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 本指南的任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 本指南的路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[FE-01 Vue 3](../frontend/01-vue.md)
