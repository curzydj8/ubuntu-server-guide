# FE-06：Nuxt 完整教程

> 任务编号：FE-06（网站建设与部署实战指南 · 前端框架第 6 篇）
> 上一篇：[FE-05 Next.js](./05-nextjs.md)；下一篇：[UI-01 UI 组件库](./07-ui-libraries.md)。
> 本篇只讲 Nuxt：Vue 生态的 SSR 与全栈框架、文件路由、服务端数据获取、构建与部署通用步骤。不讲 React 与 Next.js 的具体用法，只在第 6 节讲清 Nuxt 与它们的关系，不把两者的 API 混写。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 说清 Nuxt 是什么、它和纯 Vue、和 Next.js 是什么关系，以及什么时候该用 Nuxt、什么时候用纯 Vue 就够了。
2. 用 Nuxt 4 的方式建一个最小项目：首页文章列表、文章详情页（动态路由）、关于页。
3. 正确使用 `useFetch` 和 `useAsyncData` 取数据，知道两者分工，不写出“服务端取一次、浏览器又取一次”的重复请求。
4. 区分开发模式、构建产物和生产启动命令，能把项目构建出来并在本地用生产模式跑起来。
5. 遇到常见报错时能按第 16 节定位：是路由写错、数据获取写错、还是 Node 版本或端口问题。

## 2. 适用人群

适合已经学完本指南 JS-01（JavaScript 基础）、JS-02（DOM、事件、异步）、JS-04（npm、Vite、前端工程化），并且写过纯 Vue 页面的人。如果你还没写过 Vue 组件，建议先读 FE-01（Vue 3）再回来看本篇；本篇会用到 Vue 的 `ref`、`computed`、`<script setup>`、`v-for`、`v-if`，但不从零讲 Vue 语法。

不适合只想做一个纯静态展示页的人：那种页面用静态站或纯 Vue 打包就够了，上 Nuxt 反而多一层服务端要维护。第 6 节有选型对照，动手前先对照一次。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 都可以，本篇命令以终端命令为准，不依赖某个系统的图形界面。
- Node.js：以 Nuxt 4.6 为例，核查到的要求为 Node.js 22.22.3 以上、24.15.0 以上或 26.0.0 以上（不同小版本略有出入，安装前以官网为准）。不要用过旧的 Node 跑新版 Nuxt，报错信息往往不直说版本问题，而是先报一堆看不懂的构建错误。
- 包管理器：npm 即可，pnpm 也可以，本篇用 npm 写命令，换 pnpm 时把 `npm install` 换成 `pnpm install`、`npm run dev` 换成 `pnpm dev`，其余不变。
- 框架版本（核查日期 2026-11-03，来源为公开版本追踪页 endoflife.date）：**本篇以 Nuxt 4 为准，核查到的最新稳定版为 4.6.4（2026-11-02 发布）**。Nuxt 4 于 2025-07-16 发布，应用源码默认放在 `app/` 目录下；Nuxt 3 于 2022-11-16 发布，源码放在项目根目录，**已于 2026-07-31 停止维护**，不再有官方修复和安全补丁，新项目不要再以 Nuxt 3 起手。Nuxt 5 在核查时尚未发布，不要按 Nuxt 5 的写法写代码。
- Nuxt 3 与 Nuxt 4 的写法区别，本篇只讲 Nuxt 4 的写法，凡是 Nuxt 3 才有的旧写法都会在文中点明“这是旧版写法，本篇不用”，不要把两版混在一个项目里。

## 4. 使用前提

动手前请确认下面四项都已具备，缺一项先补齐再往下走：

1. 会写 Vue 3 的单文件组件：`<template>`、`<script setup>`、`<style>` 三段式，`ref` 和 `v-for` 会用。
2. 会用终端跑 npm 命令，会看终端报错的前几行（报错原因一般在前几行，不在最后一行）。
3. 本机已装 Node.js，`node -v` 能输出版本号，且版本号符合第 3 节的要求。
4. 有一个空文件夹用来放本篇项目，不要直接在已有项目里混着写，避免旧配置干扰。

## 5. 所需资源

- 一台能装 Node.js 的电脑，内存 4GB 以上即可跑开发模式。
- 网络：第一次创建项目和安装依赖需要联网下载包，之后写代码可以离线。
- 不需要数据库、不需要单独的后端服务器：本篇示例的数据由 Nuxt 自带的服务端接口（`server/api/`）返回，数据写在代码里，足够讲清 SSR 与数据获取。
- 不需要域名、不需要云服务器：部署一节只讲通用步骤（构建产物与启动命令），不展开具体云平台，平台选择留给 DEPLOY 阶段。

## 6. 技术原理

### 6.1 Nuxt 是什么

Nuxt 是 Vue 生态的“全栈框架”：它在 Vue 之上加了一整套约定——文件路由、服务端渲染（SSR）、数据获取、服务端接口、自动导入、构建与部署。纯 Vue 只负责“页面怎么写”，Nuxt 还负责“页面怎么跑起来、怎么被搜索引擎看到、数据从哪来”。

### 6.2 SSR 是怎么回事

纯 Vue 打包后，浏览器拿到的是一个近乎空的 HTML，再由 JavaScript 在浏览器里把内容渲染出来。搜索引擎和首屏用户要等 JavaScript 跑完才看到内容。

Nuxt 的 SSR 是：浏览器第一次请求页面时，服务器先把页面渲染成完整的 HTML 再返回，浏览器立刻能看到内容；随后 JavaScript 再“接管”页面（这个过程叫注水，hydration），页面恢复交互。之后在站内点链接跳转时，Nuxt 改走客户端路由，不再每次都找服务器要整页。

一句话：首屏由服务器出 HTML，之后交互由浏览器接管。SSR 不是“所有页面都必须服务端渲染”，Nuxt 也支持纯客户端页面和静态生成，选哪种按页面需要，第 7 节会讲。

### 6.3 文件路由

Nuxt 不用你手写路由表：`app/pages/` 目录下的文件就是路由。`app/pages/index.vue` 是首页 `/`，`app/pages/about.vue` 是 `/about`，`app/pages/posts/[id].vue` 是动态路由 `/posts/1`、`/posts/2`，方括号里的 `id` 就是路由参数，在页面里用 `useRoute().params.id` 拿到。

### 6.4 数据获取：useFetch 与 useAsyncData 的分工

- `useFetch(url)`：最常用的一个，内部就是 `useAsyncData` 加 `$fetch` 的组合，适合“直接取一个接口”的场景。本篇示例全部用它。
- `useAsyncData(key, handler)`：更底层的一个，适合“取数据的逻辑不只是一次 HTTP 请求”的场景，例如先读缓存再请求、合并多个接口、自定义错误处理。`key` 是缓存键，同一个 `key` 在服务端和客户端之间共享结果，这正是避免重复请求的关键。
- `$fetch(url)`：只发请求、不做 SSR 缓存共享。在事件处理里（例如点按钮提交表单）用它；在页面初始化取数据时不要只用它，否则服务端取一次、浏览器注水后可能又取一次。

### 6.5 Nuxt 与纯 Vue、与 Next.js 的关系

| 对照项 | 纯 Vue（Vite 项目） | Nuxt（Vue 生态） | Next.js（React 生态） |
| --- | --- | --- | --- |
| 归属 | Vue 官方脚手架出的单页应用 | Vue 生态的 SSR/全栈框架 | React 生态的 SSR/全栈框架 |
| 路由 | 自己配 vue-router | 文件路由，约定大于配置 | 文件路由，约定大于配置 |
| 首屏 HTML | 浏览器渲染后才有内容 | 服务端先渲染出 HTML | 服务端先渲染出 HTML |
| 服务端接口 | 没有，要另搭后端 | `server/api/` 自带 | `app/api/` 自带 |
| 适合 | 后台管理页、纯交互应用 | 要 SEO、要首屏速度的内容站 | 同左，但技术栈是 React |

Nuxt 与 Next.js 是“同一类东西、不同生态”：思路相通，API 不能互换。不要把 Next.js 的 `getServerSideProps` 写进 Nuxt，也不要把 Nuxt 的 `useFetch` 写进 Next.js。

什么时候用 Nuxt，什么时候用纯 Vue 就够了：页面要被搜索引擎收录、首屏要在弱网下也快、或者需要服务端接口，用 Nuxt；页面是登录后的后台、内容不需要 SEO、交互很重，用纯 Vue 更简单。

## 7. 架构说明

本篇示例项目的目录结构（Nuxt 4 写法，源码在 `app/` 下）：

```text
nuxt-demo/
├── package.json            # 依赖与脚本，见第 11 节
├── nuxt.config.ts          # Nuxt 配置，见第 11 节
├── app/
│   ├── app.vue             # 根组件：放 <NuxtPage />，所有页面都从这里渲染
│   ├── pages/
│   │   ├── index.vue       # 首页 /：文章列表
│   │   ├── about.vue       # 关于页 /about
│   │   └── posts/
│   │       └── [id].vue    # 详情页 /posts/1、/posts/2
│   └── components/
│       └── PostCard.vue    # 文章卡片组件，首页复用
├── server/
│   └── api/
│       └── posts.get.ts    # 服务端接口 GET /api/posts，返回文章列表
├── public/
│   └── favicon.ico         # 静态文件，原样 served，不经过构建
├── .nuxt/                  # 开发与构建的中间产物，不要手动改，不要提交
└── .output/                # 生产构建产物，部署时用它，不要手动改
```

数据流向是：浏览器请求 `/` → Nuxt 服务端渲染首页 → 首页的 `useFetch('/api/posts')` 在服务端调用 `server/api/posts.get.ts` → 拿到数据后渲染出完整 HTML 返回 → 浏览器注水后恢复交互。站内点进详情页时，改走客户端路由，`useFetch` 在浏览器里再取一次对应数据。

渲染方式有三种，初学先分清再选：SSR（每次请求都在服务端渲染，适合常变的内容）、SSG（构建时预先渲染成静态页，适合不常变的内容）、CSR（纯浏览器渲染，适合登录后的页面）。本篇示例默认 SSR，不改渲染模式。

## 8. 操作前检查

在终端里逐项确认，全部通过再动手：

```bash
node -v
npm -v
```

第一条输出的 Node 版本号要符合第 3 节的要求；第二条能输出 npm 版本号即可。再确认 3000 端口没有被占用（Nuxt 开发模式默认用 3000 端口），如果已被占用，启动时会报错，处理办法见第 16 节。

备份方法：本篇是新建项目，没有旧文件要备份；如果你是在已有项目里试，先把项目整个复制一份，或者先 `git commit` 再动手，改坏了能回来。

## 9. 逐步操作

下面是完整流程，每一步做完看一眼结果再往下走。本节的命令是给读者的操作说明，本篇验证时没有在本机跑 `npm install`、`npm run dev`、`npm run build`（原因见第 14 节），不要把“命令列在这里”等同于“本篇已跑通过构建”。

1. 创建项目：终端进入空文件夹，跑创建命令，按提示选包管理器为 npm，其余一路默认。

```bash
npx nuxi@latest init nuxt-demo
cd nuxt-demo
```

2. 安装依赖：

```bash
npm install
```

3. 启动开发模式：

```bash
npm run dev
```

终端出现本地地址（默认 `http://localhost:3000`）即为启动成功，用浏览器打开它。

4. 按第 10 节写文件：先写 `server/api/posts.get.ts`，再写 `app/pages/index.vue`、`app/pages/posts/[id].vue`、`app/pages/about.vue`、`app/components/PostCard.vue`、`app/app.vue`，最后确认 `nuxt.config.ts` 和 `package.json` 与第 11 节一致。开发模式下改文件保存后浏览器自动刷新，不用重启。
5. 验证首页、详情页、关于页，方法见第 14 节。
6. 构建生产产物：

```bash
npm run build
```

7. 本地用生产模式跑起来验证：

```bash
npm run preview
```

8. 部署通用步骤：把 `.output/` 产物和 `package.json` 一起放到服务器上，在服务器上跑生产启动命令（一般是 `node .output/server/index.mjs`），并用进程管理工具（例如 systemd，见服务器指南的进程管理一节）让它开机自启、挂了自动重启。具体云平台的上传与域名绑定不在本篇展开，留给 DEPLOY 阶段。

## 10. 完整代码

下面每个文件都注明存放路径，复制时按路径放，不要把所有代码塞进一个文件。反面例子在本篇只出现在行内代码和表格里，没有写成围栏代码块。

### 10.1 服务端接口（存放路径：server/api/posts.get.ts）

```ts
export default defineEventHandler(() => {
  return [
    { id: 1, title: 'Nuxt 是什么', summary: 'Vue 生态的 SSR 与全栈框架，文件路由、数据获取、服务端接口都自带。' },
    { id: 2, title: 'SSR 是怎么回事', summary: '首屏由服务器出 HTML，之后 JavaScript 注水接管交互。' },
    { id: 3, title: 'useFetch 与 useAsyncData', summary: 'useFetch 适合直接取接口，useAsyncData 适合更复杂的数据逻辑。' }
  ]
})
```

文件名里的 `.get` 表示这个接口只接受 GET 请求；如果以后要接受 POST，文件名就写成 `.post`，不要在代码里再判断一次请求方法。

### 10.2 根组件（存放路径：app/app.vue）

```vue
<template>
  <div>
    <nav>
      <NuxtLink to="/">
        首页
      </NuxtLink>
      <NuxtLink to="/about">
        关于
      </NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>
```

`NuxtLink` 是 Nuxt 的站内链接组件，站内跳转走客户端路由；外链才用普通 `a` 标签。`NuxtPage` 是页面占位符，没有它，`app/pages/` 下的页面都渲染不出来。

### 10.3 首页（存放路径：app/pages/index.vue）

```vue
<template>
  <div>
    <h1>文章列表</h1>
    <p v-if="pending">
      加载中……
    </p>
    <p v-else-if="error">
      加载失败，请刷新页面重试。
    </p>
    <PostCard
      v-for="post in posts"
      v-else
      :key="post.id"
      :post="post"
    />
  </div>
</template>

<script setup lang="ts">
const { data: posts, pending, error } = await useFetch('/api/posts')
</script>
```

注意三点：第一，`useFetch` 写在 `<script setup>` 的顶层并 `await`，这样服务端渲染时数据已经取到，首屏 HTML 里就有列表；第二，`pending` 和 `error` 是 `useFetch` 自带的状态，加载中和失败都要给用户一句话，不要让页面空白；第三，`v-for` 的 `key` 用文章 `id`，不要用数组下标。

### 10.4 文章卡片组件（存放路径：app/components/PostCard.vue）

```vue
<template>
  <article>
    <h2>
      <NuxtLink :to="`/posts/${post.id}`">
        {{ post.title }}
      </NuxtLink>
    </h2>
    <p>{{ post.summary }}</p>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  post: {
    id: number
    title: string
    summary: string
  }
}>()
</script>
```

`app/components/` 下的组件会被 Nuxt 自动导入，首页可以直接写 `<PostCard>`，不用再 `import`。如果组件名和文件名对不上，页面会报组件找不到，先核对文件名。

### 10.5 详情页（存放路径：app/pages/posts/[id].vue）

```vue
<template>
  <div>
    <p>
      <NuxtLink to="/">
        返回首页
      </NuxtLink>
    </p>
    <h1 v-if="post">
      {{ post.title }}
    </h1>
    <p v-if="post">
      {{ post.summary }}
    </p>
    <p v-else>
      没有找到这篇文章。
    </p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const postId = Number(route.params.id)
const { data: posts } = await useFetch('/api/posts')
const post = computed(() => {
  return (posts.value || []).find((item) => item.id === postId)
})
</script>
```

详情页的取数方式是刻意简化的教学写法：先取列表再在本地按 `id` 找，目的是讲清动态路由参数怎么拿。真实项目里详情页一般直接请求 `/api/posts/${postId}` 这样的单条接口，不要把“列表里找”当成生产做法。另外，`route.params.id` 是字符串，`Number()` 转成数字再比较，否则 `1` 和 `'1'` 比对不上。

### 10.6 关于页（存放路径：app/pages/about.vue）

```vue
<template>
  <div>
    <h1>关于本站</h1>
    <p>这是一个 Nuxt 4 教学示例：首页、详情页、关于页，数据来自自带的服务端接口。</p>
  </div>
</template>
```

## 11. 完整配置文件

### 11.1 Nuxt 配置（存放路径：nuxt.config.ts，项目根目录）

```ts
export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  devtools: { enabled: true }
})
```

### 11.2 包配置（存放路径：package.json，项目根目录）

```json
{
  "name": "nuxt-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare"
  },
  "dependencies": {
    "nuxt": "^4.6.4",
    "vue": "^3.5.0",
    "vue-router": "^4.0.0"
  }
}
```

版本号说明：`nuxt` 锁定 `^4.6.4`，即 4.6.4 以上、5.0.0 以下的版本，安装时以当场查到的 4.x 为准，不要写成 `latest`，否则哪天出了大版本会悄悄升上去。`vue` 和 `vue-router` 由 Nuxt 依赖带入，这里写出来是为了让读者看清版本范围，实际以 `nuxt` 要求的版本为准。

## 12. 每个关键配置项的解释

| 配置项 | 位置 | 含义 |
| --- | --- | --- |
| `compatibilityDate` | `nuxt.config.ts` | 告诉 Nuxt 按哪个日期的行为为准，避免旧项目升级后行为悄悄变化；新项目写创建时的日期即可 |
| `devtools.enabled` | `nuxt.config.ts` | 开发模式下启用 Nuxt DevTools，方便看路由、数据和组件状态；生产构建不受它影响 |
| `private: true` | `package.json` | 声明这不是要发布的包，防止误执行发布命令把示例项目发到 npm 上 |
| `type: module` | `package.json` | 声明用 ES 模块，`import` 写法才合法；Nuxt 项目默认就是这个值 |
| `scripts.dev` | `package.json` | 开发模式，改文件自动刷新，适合写代码时用 |
| `scripts.build` | `package.json` | 生产构建，产物在 `.output/`，适合部署前跑 |
| `scripts.preview` | `package.json` | 本地用生产产物跑起来，部署前先在本地验一遍 |
| `scripts.postinstall` | `package.json` | 装完依赖后自动生成 Nuxt 的类型与配置，不要删掉它 |

还有两个常用配置项，本篇示例没用到，但要认识：`runtimeConfig.public` 放可以暴露给浏览器的数据（例如公开接口地址），`runtimeConfig`（不带 `public`）放只能在服务端用的数据（例如密钥），千万不要把密钥放进 `public`。

## 13. 执行结果示例

开发模式启动成功时，终端大致是这个样子（端口与地址以实际输出为准）：

```text
Nuxt 4.6.4 with Nitro
  ➜ Local:    http://localhost:3000/
```

浏览器打开首页，应该看到三篇文章的标题和摘要，点标题进详情页，地址变成 `/posts/1`，页面显示对应文章；点“关于”，地址变成 `/about`。

生产构建成功时，终端最后会提示构建完成，项目里出现 `.output/` 目录；跑 `npm run preview` 后再打开地址，页面和开发模式下看到的一样，这一步是部署前必须做的本地验证。

验证 SSR 是否生效的办法：浏览器打开首页，右键“查看网页源代码”，源代码里应该直接有三篇文章的标题；如果源代码里只有空壳、标题是 JavaScript 跑完后才出现的，说明 SSR 没生效，按第 16 节排查。

## 14. 成功验证

按下面五步逐项验证，全部通过才算完成，不要只看“页面能打开”就结束：

1. 开发模式：`npm run dev` 后打开 `http://localhost:3000/`，首页列出三篇文章，标题和摘要都对。
2. 路由：点文章标题进 `/posts/1`，显示第一篇文章；手动把地址改成 `/posts/2`、`/posts/3`，显示对应文章；改成 `/posts/999`，显示“没有找到这篇文章”，而不是白屏或报错页。
3. 关于页：点导航里的“关于”，地址变成 `/about`，页面正常显示；点“首页”能回来。
4. SSR：按第 13 节的办法看网页源代码，源代码里直接有文章标题。
5. 生产模式：`npm run build` 成功，`npm run preview` 后页面和开发模式下一致。

如实说明本篇验证的边界：本篇没有在本机跑 `npm install`、`npm run dev`、`npm run build`，所以上面的五步是读者在自己机器上验证的步骤，不是本篇作者已跑通过的构建记录；第 10 节代码的验证只做到第 5 节末尾写的解析与平衡检查，框架构建与部署流程留待读者按本节验证。

## 15. 常见错误

| 错误现象 | 原因 | 改法 |
| --- | --- | --- |
| 页面空白，`NuxtPage` 没渲染 | `app/app.vue` 里漏了 `NuxtPage` | 补上 `NuxtPage`，见第 10.2 节 |
| 点链接后整页刷新而不是站内跳转 | 站内链接用了普通 `a` 标签 | 站内链接改用 `NuxtLink` |
| 详情页总显示“没有找到” | `route.params.id` 是字符串，和数字 `id` 直接比对不上 | 先 `Number()` 转成数字再比较，见第 10.5 节 |
| 同一接口请求发了两次 | 页面初始化取数据只用了 `$fetch`，没用 `useFetch` 或 `useAsyncData` | 页面初始化取数据改用 `useFetch`，事件里提交才用 `$fetch` |
| `useFetch` 写在函数里、没 `await` | 数据还没回来页面就渲染了，首屏 HTML 里没有数据 | 把 `useFetch` 写在 `<script setup>` 顶层并 `await` |
| 启动报端口被占用 | 3000 端口已被别的程序占用 | 关掉占用程序，或改用 `PORT=3001 npm run dev` 指定端口 |
| 启动报 Node 版本不符 | Node 太旧 | 按第 3 节升级 Node，不要改 Nuxt 版本去迁就旧 Node |
| 把 Nuxt 3 的根目录写法搬到 Nuxt 4 | Nuxt 4 源码在 `app/` 下，根目录的 `pages/` 不会被识别 | 按第 7 节的目录结构，把页面放进 `app/pages/` |

## 16. 故障排查

按下面顺序排查，不要一上来就删依赖重装：

1. 先看终端报错的前几行，定位到是哪个文件、哪一行。
2. 核对目录结构：页面是不是在 `app/pages/` 下，动态路由文件是不是叫 `[id].vue`，接口是不是在 `server/api/` 下。
3. 核对 `useFetch` 的写法：是不是在 `<script setup>` 顶层、有没有 `await`、地址是不是以 `/api/` 开头。
4. 删掉 `.nuxt/` 和 `.output/` 再重启开发模式：这两个是中间产物，删掉后 Nuxt 会重新生成，很多“改了代码没效果”的问题到这一步就好了。不要手动改里面的文件。
5. 端口问题：确认 3000 端口占用情况，换端口或关掉占用程序。
6. 版本问题：确认 `node -v` 和 `package.json` 里的 `nuxt` 版本符合第 3 节，再看是不是把 Nuxt 3 的写法混进了 Nuxt 4 项目。
7. 还不行：把报错信息的前几行原样记下来，到 Nuxt 官方文档或仓库 issue 里搜同一句话，不要凭感觉改配置。

## 17. 安全注意事项

1. 密钥只能放服务端：数据库密码、第三方接口密钥只能放 `runtimeConfig`（不带 `public`）或服务器环境变量，绝不能放进 `runtimeConfig.public`，也不能写进页面代码，前者会随 HTML 发给浏览器。
2. 不要用 `v-html` 直接渲染用户输入的内容，否则跨站脚本攻击（XSS）可以直接执行恶意代码；必须渲染富文本时，先做净化处理再渲染。
3. 服务端接口不要无条件返回全量数据：本篇示例数据写在代码里、只有三条，真实项目里接口要做分页和权限校验，不要把全表数据一次返回。
4. 依赖要定期更新：Nuxt 3 已停止维护就是教训，长期不更新的项目等于长期带着已知漏洞跑，升级前先看官方升级说明，不要直接跨大版本升级。
5. 生产模式不要开调试信息：开发模式的 DevTools 和详细报错只留在本地，部署时用 `npm run build` 的产物，不要把开发模式直接对外服务。

## 18. 回滚和恢复

1. 改坏了配置：把 `nuxt.config.ts` 恢复成本篇第 11 节的样子，删掉 `.nuxt/` 和 `.output/`，重启开发模式。
2. 升错了版本：把 `package.json` 里的 `nuxt` 版本改回升级前的号，删掉依赖目录和锁文件后重新安装，再跑一次构建验证。
3. 改坏了页面：用版本管理工具（git）回退到上一个能跑的提交；如果没用 git，就靠第 8 节动手前复制的那份备份恢复。
4. 部署后出问题：先把生产启动切回上一个构建产物（保留上一个 `.output/` 再换新产物，不要直接覆盖唯一的产物），确认恢复后再排查新产物的问题。
5. 数据接口出问题：先确认 `server/api/posts.get.ts` 还在、文件名里的 `.get` 没丢，再确认首页的 `useFetch` 地址还是 `/api/posts`。

## 19. 延伸阅读

- Nuxt 官方文档（nuxt.com）：路由、数据获取、服务端接口、部署的完整说明，遇到本篇没讲的配置项先查这里。
- Vue 官方文档：组件、组合式 API、`<script setup>` 的完整说明，Nuxt 的页面归根结底还是 Vue 组件。
- 本指南 FE-01（Vue 3）：Vue 基础没过关时先回炉，再看本篇。
- 本指南 JS-02（DOM、事件、异步）：`fetch`、Promise、`async/await` 的基础，本篇的数据获取建立在这些之上。
- 本指南 JS-04（npm、Vite、前端工程化）：包管理与构建流程的基础，部署阶段还会用到。

## 20. 相关章节链接

- JS 基础：[JS-01 JavaScript 基础](../javascript/01-basics.md)
- DOM 与异步：[JS-02 DOM、事件、异步](../javascript/02-dom-async.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化](../javascript/04-tooling.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[UI-01 UI 组件库](./07-ui-libraries.md)
