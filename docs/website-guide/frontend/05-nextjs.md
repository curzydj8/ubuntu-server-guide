# FE-05：Next.js 完整教程

> 任务编号：FE-05（网站建设与部署实战指南 · 前端框架第 5 篇）
> 上一篇：[FE-04 Svelte](./04-svelte.md)；下一篇：[FE-06 Nuxt](./06-nuxt.md)。
> 本篇只讲 Next.js：SSR 与 SSG、App Router 路由、Server Components 与 Client Components 的分工、数据获取与缓存、博客列表 + 文章页实战。不讲 Vue/Nuxt，不讲部署到具体云平台（部署只讲通用步骤，服务器部署细节是 DEPLOY 阶段的事）。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 说清 SSR、SSG、动态渲染的区别，知道什么页面该用哪一种。
2. 用 App Router 写出多页应用：首页、列表页、动态文章页、404 页。
3. 正确分工 Server Components 与 Client Components，知道 `'use client'` 该写在哪里、不该写在哪里。
4. 在服务端取数据并理解缓存：静态数据、定时再验证、每次请求都重新取，三种写法各用在何处。
5. 跑起开发服务器，完成构建，并能从构建输出里分辨出哪个页面是静态的、哪个是动态的。

## 2. 适用人群

适合已经会写 JavaScript、会写 React 函数组件和 JSX、会用 npm 的读者。如果你还没有学过 React 函数组件，先去补 JSX 与组件的基础概念，否则本篇的 Server Components 与 Client Components 会读得很吃力。本篇不要求你会后端语言，示例数据全部放在本地文件里，不依赖外部接口和数据库。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 都可以，本篇命令以终端通用写法给出。
- Node.js：**20.9 或更新版本**（Next.js 16 不再支持 Node.js 18，装之前先用 `node -v` 核对）。
- Next.js：**16.4.4**，核查日期 **2026-11-03**，核查来源为公开的版本追踪页（16 系为当前 Active LTS，16.4.4 发布于 2026-11-02）。安装时以官网和 npm 当场查到的号为准，示例里的依赖写 `^16.4.4`，意思是装 16 系的兼容更新，不锁死补丁号。
- React：19 系，`create-next-app` 当场生成的版本为准，示例写 `^19.0.0`，装包时会解析到与 Next.js 16 兼容的 19 系版本。
- 包管理器：npm（本篇用 npm，pnpm 的用法见 JS-04，命令一一对应）。
- 浏览器：任意现代浏览器，用于打开开发服务器的页面。

版本提醒：2026 年 10 月 Next.js 曾发布过一次安全更新，16 系要用到 16.4.1 之后的版本才算补上那批漏洞。本篇示例直接用 16.4.4，已经在安全线之上。以后新建项目时，不要图省事装一个旧大版本，装之前先到官网核对一次当前 LTS。

## 4. 使用前提

1. 会 JavaScript 基础：变量、函数、对象、数组、模块导入导出（JS-01 的范围）。
2. 会 DOM 与异步的基本概念：`async/await`、`fetch`、事件监听（JS-02 的范围），本篇的服务端数据获取就是 `async` 函数里用 `fetch` 或读本地数据。
3. 会 npm 与 Vite 工程的基本操作：装包、跑开发服务器、构建（JS-04 的范围），Next.js 的流程与之类似，只是命令换成了 `next dev`、`next build`、`next start`。
4. 会写 React 函数组件和 JSX：组件、props、条件渲染、列表渲染。本篇不从零教 React，只讲 Next.js 在 React 之上加的东西。
5. 本机已装 Node.js 20.9+，终端能跑通 `node -v` 和 `npm -v`。

## 5. 所需资源

- 一台能装 Node.js 的电脑，内存 4GB 以上即可跑示例。
- Node.js 20.9+ 和 npm（随 Node.js 一起装）。
- 一个代码编辑器，例如 VS Code。
- 一个现代浏览器。
- 不需要域名、不需要服务器、不需要数据库，示例数据在本地文件里，离线也能跑通开发服务器和构建。

## 6. 技术原理

### 6.1 三种渲染方式，先分清

- **SSG（静态生成）**：构建时就把页面 HTML 生成好，部署后直接发静态文件。适合内容不常变、所有人看到都一样的页面，例如博客文章页、文档页。优点是快、能缓存、服务器压力小；缺点是构建后内容就固定了，改数据要重新构建（或用再验证）。
- **SSR（服务端渲染）**：每次请求到来时，服务器现算 HTML 再返回。适合内容因人而异、或每次都要最新的页面，例如登录后的个人页、带搜索条件的列表页。优点是每次都是最新的；缺点是每次请求都要算一次，服务器压力大、响应慢一点。
- **动态渲染（Dynamic Rendering）**：Next.js 里的叫法，指页面在请求时才渲染，而不是构建时生成。本篇的搜索页就是动态渲染：它要读请求带的查询参数，构建时算不出来，只能请求时算。

一句话区分：构建时能算出来的叫静态，构建时算不出来、非要等请求来了才知道的叫动态。

### 6.2 再验证：静态页也能定时变新

纯 SSG 有个毛病：数据改了，页面还是旧的，除非重新构建。再验证（revalidation）就是给静态页加一个有效期，例如 3600 秒。有效期内直接发缓存，过期后下一次请求会重新算并更新缓存。列表页用再验证很合适：文章列表不需要秒级最新，一小时更新一次完全够用。

### 6.3 App Router 与 Pages Router

Next.js 有两套路由：老的是 Pages Router（`pages/` 目录），新的是 App Router（`app/` 目录）。本篇只讲 App Router，因为新项目都该用它。App Router 的规矩是：目录就是路由，目录里的 `page.jsx` 就是这个路由的页面，`layout.jsx` 就是这个路由段的布局，`[id]` 这样的方括号目录就是动态路由段。

### 6.4 Server Components 与 Client Components

这是 App Router 最核心、也最容易写错的概念：

- **Server Components（服务端组件）**：默认就是服务端组件，在服务器上渲染，不会把代码发给浏览器。适合取数据、读文件、渲染静态内容。优点是首屏快、不增加浏览器下载体积、密钥不会泄露到浏览器。
- **Client Components（客户端组件）**：文件顶部写 `'use client'` 的组件，会在浏览器里运行。适合一切要交互的东西：点击、输入、状态变化、浏览器 API。

分工口诀：能放服务端就放服务端，只有必须交互的那一小块才写成客户端组件。不要一上来就给整个页面加 `'use client'`，那样等于放弃了服务端渲染的好处。

### 6.5 数据获取与缓存

服务端组件是 `async` 函数，可以直接在里面取数据。三种常见写法：

- 静态数据：`fetch` 时加 `next: { revalidate: 3600 }`，表示缓存 3600 秒，适合列表页。
- 每次都最新：`fetch` 时加 `cache: 'no-store'`，表示不缓存、每次请求都重新取，适合实时性要求高的页面。
- 本地数据：直接 `import` 本地数据模块，不走网络，构建时就能算出来，适合本篇这种示例博客。

注意：缓存只对服务端 `fetch` 生效，浏览器里的 `fetch` 不走这一套。不要把两者混为一谈。

### 6.6 流式渲染与 Turbopack

App Router 支持流式渲染：页面先返回骨架，慢的那部分算好了再流式补上，配合 `loading.jsx` 可以做加载状态。本篇示例规模小，用不上流式，只需要知道有这个机制，大页面变慢时再用。

Next.js 16 的默认打包工具是 Turbopack，开发和生产构建都用它，不用再单独配置 Webpack。开发服务器启动比以前快，这是 16 系的一个实际好处。

## 7. 架构说明

### 7.1 工程目录

```text
next-blog/
  app/
    layout.jsx
    page.jsx
    globals.css
    not-found.jsx
    posts/
      page.jsx
      [id]/
        page.jsx
  components/
    LikeButton.jsx
    SearchBox.jsx
  lib/
    posts.js
  package.json
  next.config.js
  jsconfig.json
  .gitignore
```

### 7.2 路由对照表

| 文件 | 访问地址 | 渲染方式 |
| --- | --- | --- |
| `app/page.jsx` | `/` | 静态 |
| `app/posts/page.jsx` | `/posts` | 静态 + 3600 秒再验证 |
| `app/posts/[id]/page.jsx` | `/posts/第一篇` 这样的地址 | 构建时按 `generateStaticParams` 生成静态页 |
| 搜索页（放在 `app/posts/page.jsx` 里用查询参数实现） | `/posts?q=关键词` | 动态渲染，请求时才算 |

### 7.3 请求流程

1. 浏览器请求 `/posts`。
2. Next.js 找到 `app/posts/page.jsx` 这个服务端组件。
3. 服务端组件取数据（本地数据或带缓存的 `fetch`）。
4. 服务器算出 HTML 返回，浏览器直接显示，不用等 JS 下载完。
5. 浏览器再下载一小份 JS，让点赞按钮、搜索框这样的客户端组件可以交互。
6. 用户点进文章页 `/posts/nextjs-ssr-ssg`，Next.js 按动态路由段 `[id]` 找到对应的静态页直接返回。

### 7.4 服务端与客户端的边界

服务端组件可以 `import` 客户端组件，客户端组件不能 `import` 服务端组件。数据流只能从服务端往客户端走：服务端组件把数据当 props 传给客户端组件，客户端组件不能反过来要求服务端组件给它传函数以外的东西（事件处理函数可以传，但服务端组件本身不能被客户端 `import`）。

## 8. 操作前检查

在终端里依次跑下面四条，全部通过再往下做：

```bash
node -v
npm -v
```

第一条输出 `v20.9.0` 或更新版本才算通过，低于 20.9 先升级 Node.js。第二条只要能输出版本号就算通过。

```bash
npx create-next-app@latest --help
```

这条能输出帮助信息，说明网络能拉到脚手架（第一次跑会下载，需要联网）。如果这条卡住或报错，先检查网络，不要直接跳到手动建文件。

```bash
lsof -i :3000
```

这条没有输出，说明 3000 端口空闲，开发服务器能用；如果有输出，说明 3000 已被占用，开发时要换端口（见第 16 节）。

## 9. 逐步操作

### 第 1 步：创建项目

```bash
npx create-next-app@latest next-blog
```

脚手架会问几个问题，按下面的答案选：

- TypeScript：选 No，本篇用 JavaScript（JSX），不引入 TypeScript。
- ESLint：选 Yes。
- Tailwind CSS：选 No，本篇用普通 CSS，避免一次引入两个新东西。
- `src/` 目录：选 No，`app/` 直接放在项目根目录，和第 7 节的目录树一致。
- App Router：选 Yes。
- Turbopack：选 Yes（16 系默认就是 Turbopack）。
- Import alias：默认即可。

### 第 2 步：进入项目目录

```bash
cd next-blog
```

### 第 3 步：按第 10 节、第 11 节把文件写齐

先写 `lib/posts.js`，再写 `app/` 下的文件，最后写 `components/` 下的两个客户端组件。文件路径必须和第 10 节写的一模一样，差一个字母路由就对不上。

### 第 4 步：启动开发服务器

```bash
npm run dev
```

终端输出 `Ready` 之后，浏览器打开 `http://localhost:3000`，应该看到首页。

### 第 5 步：逐个打开页面验证

依次打开 `/`、`/posts`、`/posts/nextjs-ssr-ssg`、`/posts?q=路由`，对照第 14 节的预期结果检查。

### 第 6 步：构建并用生产模式跑一次

```bash
npm run build
npm run start
```

构建输出里会标出每个页面的渲染方式，对照第 13 节检查。`npm run start` 启动的是生产服务器，同样打开 `http://localhost:3000` 验证。

## 10. 完整代码

下面是本篇实战的全部应用代码，每个文件都注明了存放路径，没有省略任何文件。配置文件在第 11 节，两部分合起来就是完整工程。

### 存放路径：`lib/posts.js`（本地文章数据，服务端组件直接 import）

```js
export const posts = [
  {
    id: 'nextjs-ssr-ssg',
    title: 'SSR 与 SSG 到底有什么区别',
    date: '2026-11-03',
    summary: '一篇文章讲清服务端渲染、静态生成和动态渲染的适用场景。',
    content: 'SSR 是每次请求都现算，SSG 是构建时算好，动态渲染是请求时才算。列表页适合静态加再验证，搜索页适合动态渲染。',
  },
  {
    id: 'app-router-basics',
    title: 'App Router 路由是怎么对应的',
    date: '2026-11-03',
    summary: '目录就是路由，page.jsx 就是页面，方括号目录就是动态路由段。',
    content: 'app/posts/page.jsx 对应 /posts，app/posts/[id]/page.jsx 对应 /posts/任意文章标识。layout.jsx 是布局，not-found.jsx 是 404 页。',
  },
  {
    id: 'server-client-components',
    title: 'Server Components 与 Client Components 的分工',
    date: '2026-11-03',
    summary: '能放服务端就放服务端，只有必须交互的那一小块才写成客户端组件。',
    content: '取数据和渲染静态内容放服务端组件，点击、输入、状态变化放客户端组件。服务端组件可以 import 客户端组件，反过来不行。',
  },
];

export function getPostById(id) {
  return posts.find(function (post) {
    return post.id === id;
  });
}

export function searchPosts(keyword) {
  const word = keyword.trim().toLowerCase();
  if (word === '') {
    return posts;
  }
  return posts.filter(function (post) {
    return post.title.toLowerCase().includes(word) || post.summary.toLowerCase().includes(word);
  });
}
```

### 存放路径：`app/layout.jsx`（根布局，所有页面共用）

```jsx
import './globals.css';

export const metadata = {
  title: 'Next.js 博客实战',
  description: '用 Next.js App Router 写的博客列表与文章页示例',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <header>
          <nav>
            <a href="/">首页</a>
            <a href="/posts">文章列表</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>Next.js 博客实战示例</p>
        </footer>
      </body>
    </html>
  );
}
```

### 存放路径：`app/globals.css`（全局样式）

```css
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  color: #1e2129;
}

header {
  background-color: #1e2129;
  padding: 16px;
}

header a {
  color: #ffffff;
  margin-right: 16px;
  text-decoration: none;
}

main {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px;
}

footer {
  text-align: center;
  color: #666666;
  padding: 24px 16px;
}

article {
  border-bottom: 1px solid #dddddd;
  padding: 16px 0;
}
```

### 存放路径：`app/page.jsx`（首页，静态）

```jsx
import Link from 'next/link';
import { posts } from '../lib/posts';

export default function HomePage() {
  return (
    <div>
      <h1>Next.js 博客实战</h1>
      <p>这是一个用 App Router 写的博客示例，共收录了 3 篇文章。</p>
      <ul>
        {posts.map(function (post) {
          return (
            <li key={post.id}>
              <Link href={'/posts/' + post.id}>{post.title}</Link>
            </li>
          );
        })}
      </ul>
      <p>
        <Link href="/posts">查看全部文章</Link>
      </p>
    </div>
  );
}
```

### 存放路径：`app/posts/page.jsx`（列表页 + 搜索，动态渲染）

```jsx
import Link from 'next/link';
import { searchPosts } from '../../lib/posts';
import SearchBox from '../../components/SearchBox';

export default async function PostsPage({ searchParams }) {
  const params = await searchParams;
  const keyword = typeof params.q === 'string' ? params.q : '';
  const list = searchPosts(keyword);
  return (
    <div>
      <h1>文章列表</h1>
      <SearchBox defaultValue={keyword} />
      {keyword !== '' && <p>搜索关键词：{keyword}，共找到 {list.length} 篇。</p>}
      {list.map(function (post) {
        return (
          <article key={post.id}>
            <h2>
              <Link href={'/posts/' + post.id}>{post.title}</Link>
            </h2>
            <p>{post.date}</p>
            <p>{post.summary}</p>
          </article>
        );
      })}
      {list.length === 0 && <p>没有找到匹配的文章，换个关键词试试。</p>}
    </div>
  );
}
```

### 存放路径：`app/posts/[id]/page.jsx`（文章页，SSG）

```jsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { posts, getPostById } from '../../../lib/posts';
import LikeButton from '../../../components/LikeButton';

export async function generateStaticParams() {
  return posts.map(function (post) {
    return { id: post.id };
  });
}

export async function generateMetadata({ params }) {
  const resolved = await params;
  const post = getPostById(resolved.id);
  if (!post) {
    return { title: '文章不存在' };
  }
  return { title: post.title, description: post.summary };
}

export default async function PostPage({ params }) {
  const resolved = await params;
  const post = getPostById(resolved.id);
  if (!post) {
    notFound();
  }
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.date}</p>
      <p>{post.content}</p>
      <LikeButton />
      <p>
        <Link href="/posts">返回文章列表</Link>
      </p>
    </article>
  );
}
```

### 存放路径：`app/not-found.jsx`（404 页）

```jsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h1>页面不存在</h1>
      <p>你访问的文章不存在，或者地址写错了。</p>
      <p>
        <Link href="/posts">返回文章列表</Link>
      </p>
    </div>
  );
}
```

### 存放路径：`components/LikeButton.jsx`（客户端组件：点赞按钮）

```jsx
'use client';

import { useState } from 'react';

export default function LikeButton() {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  function handleClick() {
    if (liked) {
      setCount(count - 1);
      setLiked(false);
    } else {
      setCount(count + 1);
      setLiked(true);
    }
  }
  return (
    <button type="button" onClick={handleClick}>
      {liked ? '已点赞' : '点赞'}（{count}）
    </button>
  );
}
```

### 存放路径：`components/SearchBox.jsx`（客户端组件：搜索框）

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBox({ defaultValue }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  function handleSubmit(event) {
    event.preventDefault();
    const keyword = value.trim();
    if (keyword === '') {
      router.push('/posts');
    } else {
      router.push('/posts?q=' + encodeURIComponent(keyword));
    }
  }
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="search"
        value={value}
        onChange={function (event) {
          setValue(event.target.value);
        }}
        placeholder="搜索文章标题或简介"
      />
      <button type="submit">搜索</button>
    </form>
  );
}
```

### 服务端 fetch 的写法（对照用，不属于上面文件，单独说明）

如果数据不在本地文件，而在远程接口，列表页的服务端取数据应该写成下面两种样子，二选一，不要混用：

```js
const response = await fetch('https://api.example.com/posts', {
  next: { revalidate: 3600 },
});
const list = await response.json();
```

上面这段表示缓存 3600 秒，适合文章列表。实时性要求高的页面则写成下面这样：

```js
const response = await fetch('https://api.example.com/posts', {
  cache: 'no-store',
});
const list = await response.json();
```

上面这段表示不缓存、每次请求都重新取。两段代码里的接口地址是示意地址，跑通本篇示例不需要真的请求它，示例用的是本地 `lib/posts.js`。

## 11. 完整配置文件

### 存放路径：`package.json`（项目根目录）

```json
{
  "name": "next-blog",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "^16.4.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.4.4"
  }
}
```

### 存放路径：`next.config.js`（项目根目录）

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

### 存放路径：`jsconfig.json`（项目根目录，让 `@/` 这样的路径别名可用，本篇示例用的是相对路径，这个文件只是备用）

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### 存放路径：`.gitignore`（项目根目录）

```text
node_modules
.next
out
.env*.local
```

## 12. 每个关键配置项的解释

| 文件 | 配置项 | 含义 |
| --- | --- | --- |
| `package.json` | `scripts.dev` | 开发命令，跑 `next dev`，启动开发服务器，改代码自动刷新。 |
| `package.json` | `scripts.build` | 构建命令，跑 `next build`，生成生产用的 `.next` 目录。 |
| `package.json` | `scripts.start` | 生产命令，跑 `next start`，用构建产物起生产服务器。 |
| `package.json` | `dependencies.next` | Next.js 框架本身，`^16.4.4` 表示装 16 系的兼容更新。 |
| `package.json` | `dependencies.react` / `react-dom` | React 本体与浏览器渲染包，两者版本必须保持一致。 |
| `next.config.js` | `nextConfig` | 本篇示例不需要任何特殊配置，所以是空对象；以后要配图片域名、重定向、环境变量时再往里面加。 |
| `jsconfig.json` | `paths.@/*` | 路径别名，`@/` 代表项目根目录，写 `import` 时可以少写 `../`。本篇示例用相对路径，这个配置只是备用，不用它也能跑。 |
| `app/layout.jsx` | `metadata` | 页面的标题与描述，Next.js 会自动生成对应的 `title` 与 `meta` 标签。 |
| `app/posts/[id]/page.jsx` | `generateStaticParams` | 告诉 Next.js 构建时要生成哪些文章页，返回的每个 `id` 都会生成一个静态页。 |
| `app/posts/[id]/page.jsx` | `generateMetadata` | 按文章内容动态生成每篇文章的标题与描述，搜索引擎看到的是每篇自己的标题。 |
| `app/posts/page.jsx` | `searchParams` | 查询参数对象，Next.js 15 之后它是 Promise，必须 `await` 之后再读，见第 15 节。 |
| `lib/posts.js` | `searchPosts` | 本地搜索函数：关键词为空返回全部，否则按标题或简介过滤，过滤时统一转小写，避免大小写导致搜不到。 |

## 13. 执行结果示例

### 开发服务器启动

```text
▲ Next.js 16.4.4
- Local:        http://localhost:3000
✓ Ready in 1200ms
```

上面数字里的启动耗时每次都不一样，只要出现 `Ready` 就算启动成功。

### 构建输出示例

```text
Route (app)
┌ ○ /
├ ○ /posts
└ ● /posts/[id]
```

符号含义：`○` 表示静态页，构建时已生成；`●` 表示 SSG 动态路由，构建时按 `generateStaticParams` 生成。搜索页因为读了查询参数，会在构建输出里显示为动态页，这正是我们要的 SSR/SSG 对照：如果搜索页被标成静态，反而说明查询参数没有生效，要回头检查 `searchParams` 的写法。

### 页面内容示例

- 首页：标题“Next.js 博客实战”，下面是 3 篇文章的链接和“查看全部文章”。
- 列表页：标题“文章列表”，搜索框，下面是 3 篇文章的标题、日期、简介。
- 文章页：标题、日期、正文、点赞按钮、“返回文章列表”。
- 搜索 `/posts?q=路由`：只显示标题或简介里含“路由”的文章，并提示共找到几篇。
- 访问不存在的文章地址，例如 `/posts/no-such-post`：显示 404 页“页面不存在”。

## 14. 成功验证

按顺序做下面五步，全部通过才算本篇完成。注意：本篇的构建与运行验证需要读者在自己的机器上做，下面的步骤就是验证步骤。

1. 开发首页：跑 `npm run dev`，打开 `http://localhost:3000`，看到首页标题和 3 篇文章链接。
2. 列表与搜索：打开 `/posts`，看到 3 篇文章；再打开 `/posts?q=路由`，只看到匹配的文章，且页面提示了找到的篇数；在搜索框里输入关键词点搜索，地址栏变成带 `q=` 的地址，列表跟着变。
3. 文章页与点赞：打开 `/posts/nextjs-ssr-ssg`，看到正文；点点赞按钮，数字从 0 变 1、按钮文字变成“已点赞”，再点一次变回 0。
4. 404 页：打开 `/posts/no-such-post`，看到“页面不存在”和返回列表的链接，而不是白屏或报错页。
5. 构建与 SSR/SSG 区分验证：跑 `npm run build`，对照第 13 节检查构建输出里的 `○` 和 `●`；再跑 `npm run start`，用生产服务器把上面四步重走一遍。然后做区分验证：在 `lib/posts.js` 里改一篇文章的标题，不重新构建，直接刷新生产服务器的列表页——标题不变，说明列表页是构建时生成的静态内容；重新跑 `npm run build` 再刷新，标题变了，说明重新构建才会更新静态页；而搜索页每次请求都现算，不需要重新构建就能反映代码里的搜索逻辑变化。

## 15. 常见错误

| 错误现象 | 原因 | 解决办法 |
| --- | --- | --- |
| `useState` 报错，提示只能在客户端组件里用 | 把带交互的组件写成了服务端组件，忘了写 `'use client'` | 只给真正需要交互的组件文件顶部加 `'use client'`，不要给整个页面加。 |
| `'use client'` 写在了文件中间或函数下面 | `'use client'` 必须是文件的第一行（注释除外），写在别处不生效 | 把它移到文件最顶部，`import` 之前。 |
| `searchParams` 读出来是空的或报错 | Next.js 15 之后 `searchParams` 是 Promise，直接读属性拿不到值 | 在服务端组件里写 `const params = await searchParams;` 再读 `params.q`。 |
| `params` 读出来是空的或报错 | 动态路由的 `params` 在新版本里也是 Promise | 同样先 `await params` 再读 `params.id`，`generateMetadata` 里也要这样写。 |
| `generateStaticParams` 返回的不是对象数组 | 返回了字符串数组或单个对象，Next.js 无法对应到路由段 | 返回 `[{ id: '第一篇标识' }, { id: '第二篇标识' }]` 这样的对象数组，键名必须和方括号目录名一致。 |
| 文章页明明存在却显示 404 | `lib/posts.js` 里的 `id` 和访问地址不一致，或 `generateStaticParams` 漏了这一篇 | 核对 `id` 拼写，确认 `generateStaticParams` 是从同一份 `posts` 数组生成的。 |
| 改了数据，页面还是旧的 | 页面是静态生成的，构建后就固定了 | 这是正常现象，不是 bug；列表页可以加再验证，见第 6 节，或者重新构建。 |
| 客户端组件里读文件或用服务端密钥 | 客户端代码会发给浏览器，文件系统和密钥在那里不存在且会泄露 | 读文件、调带密钥的接口一律放在服务端组件里，客户端组件只接收服务端传来的 props。 |
| 开发服务器报端口被占用 | 3000 端口已有其他程序在用 | 先停掉占用 3000 的程序，或者用 `npm run dev -- --port 3001` 换端口。 |
| `node -v` 低于 20.9 就报错 | Next.js 16 不支持 Node.js 18 及更低版本 | 升级 Node.js 到 20.9 或更新版本再装包。 |

## 16. 故障排查

按下面顺序查，不要一上来就删整个项目重建：

1. 看终端报错的第一行：报错里通常会直接写出是哪个文件、哪一行，先改那一行。
2. 核对文件路径：`app/posts/[id]/page.jsx` 的方括号不能打错，`components` 与 `lib` 的导入路径要数清楚 `../` 的层数（`app/posts/[id]/page.jsx` 到 `lib` 是三层 `../`）。
3. 删构建缓存重建：停掉开发服务器，删掉 `.next` 目录，再跑 `npm run dev` 或 `npm run build`。
4. 核对 Node.js 版本：跑 `node -v`，低于 20.9 先升级。
5. 核对 `'use client'` 位置：只在 `components/LikeButton.jsx` 和 `components/SearchBox.jsx` 顶部出现，页面文件里不应该出现。
6. 检查查询参数：搜索页的问题先看地址栏的 `q=` 值，再看 `searchParams` 有没有 `await`。
7. 还不行：把报错信息完整复制下来，逐行对照第 15 节的表格，先排除常见错误，再去查官方文档。

## 17. 安全注意事项

1. 密钥绝不进客户端组件：数据库密码、第三方接口密钥只能放在服务端组件或环境变量里，写进客户端组件等于公开。
2. 环境变量分前后端：只有以 `NEXT_PUBLIC_` 开头的变量才会被发给浏览器，其他变量只在服务端可见；不要图方便把密钥改成 `NEXT_PUBLIC_` 开头。
3. 不要信任查询参数：搜索关键词、路由 `id` 都是用户可以随便改的，示例里只用它们做精确匹配和过滤，不拿它们拼 SQL、不拿它们拼文件路径。
4. 依赖要及时升级：Next.js 会定期发布安全更新，2026 年 10 月那次就要求 16 系用到 16.4.1 之后；新项目直接用 16.4.4，老项目要定期跑 `npm outdated` 检查。
5. 构建产物不要手工改：`.next` 目录是构建生成的，手工改了下次构建会被覆盖，出问题也无从排查。
6. 部署只讲通用步骤：本篇不涉及具体云平台，生产部署时再按 DEPLOY 阶段的通用流程走，不要把本篇的开发服务器配置直接当生产配置用。

## 18. 回滚和恢复

- 改坏了单个文件：用编辑器的撤销或版本管理工具恢复该文件，不要整个项目删掉重建。
- 构建缓存坏了：停掉开发服务器，删掉 `.next` 目录，重新构建。
- 升级 Next.js 后出问题：把 `package.json` 里的 `next` 版本改回之前能跑的号，删掉 `node_modules` 和 `package-lock.json`，重新装包，再跑构建验证。
- 配置改坏了：`next.config.js` 本篇是空对象，出问题先把它恢复成空对象，再逐项加回配置，每加一项构建一次，定位是哪一项出的问题。
- 数据改坏了：`lib/posts.js` 是本地文件，改之前先备份一份，改坏了用备份覆盖回来。

## 19. 延伸阅读

- Next.js 官方文档：App Router、路由、数据获取、缓存、Server Components 与 Client Components 的完整说明，写本篇时以它为准。
- React 官方文档：函数组件、Hooks、JSX 的基础说明，Next.js 之上的 React 部分以它为准。
- 本指南的 JS-01：JavaScript 基础，变量、函数、对象、数组。
- 本指南的 JS-02：DOM、事件、异步，`async/await` 与 `fetch`。
- 本指南的 JS-04：npm、Vite、前端工程化，包管理与构建流程的通用知识。

## 20. 相关章节链接

- JavaScript 基础：[JS-01 JavaScript 基础](../javascript/01-basics.md)
- DOM 与异步：[JS-02 DOM、事件、异步](../javascript/02-dom-async.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化](../javascript/04-tooling.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[FE-06 Nuxt](./06-nuxt.md)
