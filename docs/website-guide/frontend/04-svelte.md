# FE-04：Svelte 完整教程

> 任务编号：FE-04（网站建设与部署实战指南 · 前端框架第 4 篇）
> 上一篇：[FE-03 Angular](./03-angular.md)；下一篇：[FE-05 Next.js](./05-nextjs.md)。
> 本篇只讲 Svelte，而且只讲 Svelte 5 的 runes 写法。不讲 Vue、React、Angular，不展开讲 SvelteKit（只在第 6 节用一句话说明它与 Svelte 的关系）。本篇的“插槽”按 Svelte 5 的叫法讲：snippet（片段）加 `{@render}`，不再用 Svelte 4 的 `<slot>` 写法。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清 Svelte 是“编译时框架”是什么意思，以及它和 Vue、React 的关键区别；
2. 用 Svelte 5 的 runes 写响应式状态：`$state`、`$derived`、`$effect`、`$props`；
3. 写一个 Svelte 组件：接收 props、处理事件、向父组件回传操作；
4. 用 snippet（Svelte 5 的“插槽”）把一段内容传给子组件渲染；
5. 用 Vite 从零搭一个 Svelte 工程，并完成一个待办清单实战页：新增、勾选、删除、筛选、刷新后数据还在。

## 2. 适用人群

适合已经学完本指南 JavaScript 篇的读者：会写变量、函数、对象、数组，会用 DOM 和事件，知道 npm 和 Vite 是干什么的。如果你还没有这些基础，先读 JS-01、JS-02、JS-04，再回来看本篇。本篇不要求你会 Vue 或 React；正相反，本篇会帮你把 Svelte 和它们区分开，避免把别家的写法搬过来。

## 3. 适用系统和版本

- 系统：Windows、macOS、Linux 都可以，本篇命令以 Linux 终端写法为准，Windows 用 PowerShell 时把路径分隔符换成你系统里的写法即可。
- Node.js：建议用 20 LTS 或更高版本，动手前先跑 `node -v` 确认，版本太旧时 Vite 装不上或跑不起来。
- Svelte：**本篇以 Svelte 5 为准，核查到的最新稳定版是 5.57.3，核查日期 2026-11-03**（核查来源：endoflife.date 的 Svelte 页与 Svelte 发布追踪页，两处都指向 5.57.3，发布于 2026-10-26）。Svelte 5 正式发布于 2024-10-19；Svelte 4 的最新版是 4.2.20，支持已经结束。安装时以当场查到的 5.x 版本为准，不要装 4.x，也不要把 5.x 和 4.x 的写法混在一个工程里。
- 配套工具：Vite（见 JS-04），本篇用 Vite 官方的 Svelte 模板起工程。

版本口径说明：Svelte 4 的响应式靠“顶层 `let` 默认就是响应式”加响应式声明，Svelte 5 改成 runes（以 `$` 开头的显式标记）。本篇所有示例代码一律用 runes 写法。凡是提到 Svelte 4 写法的地方，本篇只在对照表里用行内代码提一句“旧写法是什么”，绝不在可运行的示例里出现，读的时候不要把对照表里的旧写法抄进你的工程。

## 4. 使用前提

1. 会写 JavaScript：变量、函数、对象、数组、箭头函数（JS-01）。
2. 知道 DOM 和事件是怎么回事：选取元素、监听点击、阻止默认行为（JS-02）。
3. 会用 npm 装包、知道 Vite 是开发服务器加构建工具（JS-04）。
4. 电脑上已经装好 Node.js 和 npm，编辑器能正常打开文件夹。

## 5. 所需资源

| 资源 | 用途 | 备注 |
| --- | --- | --- |
| Node.js 20 LTS 或更高 | 跑 Vite 开发服务器和构建 | 跑 `node -v` 确认 |
| npm | 装 Svelte、Vite 插件 | 装 Node 时自带 |
| 一个空文件夹 | 放本篇的待办清单工程 | 不要在已有工程里混着建 |
| 浏览器 | 打开开发服务器给的地址看效果 | Chrome、Edge、Firefox 都可以 |
| 编辑器 | 写 `.svelte`、`.js`、`.html` 文件 | VS Code 这类能高亮 Svelte 语法的更好，没有也能写 |

本篇不依赖任何后端接口，待办数据存在浏览器本地，不需要你另外起服务器。

## 6. 技术原理

### 6.1 Svelte 是编译时框架

Vue 和 React 的常见做法是：浏览器里跑一个框架运行时，运行时拿着“虚拟 DOM”算出哪里变了，再去改真实 DOM。Svelte 不走这条路。Svelte 在构建那一步就把你的组件编译成直接操作 DOM 的 JavaScript：状态变了，编译出来的代码就精确地去改那一个文本节点、那一个属性，没有虚拟 DOM，也没有运行时的 diff 过程。

一句话记住：**Svelte 的框架代码大部分在构建时就“消失”了，浏览器里跑的是编译后的普通 JavaScript。** 所以 Svelte 打包结果通常比较小，首屏也不用先等一个庞大的运行时启动。

### 6.2 runes 是编译指令，不是普通函数

Svelte 5 的 runes 长得像函数调用，例如 `let count = $state(0)`，但它们不是你可以 `import` 的普通函数。runes 是写给编译器的标记：编译器看到 `$state`，就知道“这个变量是响应式的，改了它就要更新用到它的地方”；看到 `$derived`，就知道“这个值是算出来的，依赖变了才重算”；看到 `$effect`，就知道“这段副作用要在依赖变了之后跑”。

由此得出三条铁律，违反任何一条都会在编译时报错：

1. runes 不能 `import`，直接写 `$state`、`$derived`、`$effect`、`$props` 就行。
2. runes 只能出现在 `.svelte` 文件和 `.svelte.js`、`.svelte.ts` 文件里，普通 `.js` 文件里写 `$state` 会报错。
3. runes 只能出现在组件顶层或类字段这类编译器能认出来的位置，不能藏在普通函数体、条件分支里“看心情调用”。

### 6.3 Svelte 与 Vue、React 的关键区别

| 维度 | Svelte 5（本篇） | Vue 3 | React |
| --- | --- | --- | --- |
| 更新机制 | 编译成直接 DOM 操作，无虚拟 DOM | 运行时 + 虚拟 DOM | 运行时 + 虚拟 DOM（React 19 有编译器优化，但仍是运行时模型） |
| 响应式写法 | runes：`$state`、`$derived`、`$effect` | `ref` / `reactive`，模板里自动解包 | `useState`、`useEffect` 等 Hooks |
| 状态读写 | 直接读写变量本身，例如 `count++` | `ref` 要写 `.value`（模板里不用） | `setCount`  setter，不能直接改 |
| 组件间传值 | 父传子用 `$props`，子回传用回调函数 prop | props 加 `emit` | props 加回调函数 |
| “插槽” | snippet 加 `{@render}`，snippet 可以当 prop 传 | `<slot>` | `children` prop |
| 样式 | 组件 `<style>` 默认只作用于本组件 | `<style scoped>` 才隔离 | 靠 CSS Modules、CSS-in-JS 等方案 |

Svelte 4 的旧写法在本篇只作对照，不进示例：旧写法里顶层 `let` 默认响应式、响应式声明、`<slot>`、子组件事件派发，在 Svelte 5 的 runes 工程里都不要用。

### 6.4 Svelte 与 SvelteKit 的关系（一句话）

Svelte 是“做界面的框架”，SvelteKit 是“用 Svelte 做完整网站的元框架”，多了路由、服务端渲染、服务端接口这些能力。本篇只讲 Svelte 本身，不搭 SvelteKit；等你会写 Svelte 组件了，再去学 SvelteKit 也不迟。

## 7. 架构说明

本篇实战工程的目录长这样（完整文件见第 10 节和第 11 节）：

```text
svelte-todo/
  index.html
  package.json
  vite.config.js
  src/
    main.js
    App.svelte
    lib/
      Card.svelte
      TodoItem.svelte
```

数据流向只有一条主线，读代码时按这条线走就不会乱：

1. 状态只放在 `App.svelte` 里：待办数组 `todos`、新输入 `newText`、筛选条件 `filter`。
2. 父传子：`App` 把一条 `todo` 和两个回调函数 `onToggle`、`onDelete` 当作 props 传给 `TodoItem`；把标题和一段内容传给 `Card`（内容以 snippet 形式传，见第 9 节）。
3. 子回传：`TodoItem` 里点复选框或删除按钮时，不直接改父组件的状态，而是调用父组件传下来的回调函数，真正改状态的动作只发生在 `App` 里。
4. 派生值：剩余未完成数量、筛选后的列表都用 `$derived` 算出来，不另外存一份状态，避免两份数据打架。
5. 持久化：`$effect` 监听 `todos` 变化，把它写进浏览器本地存储，刷新页面后从本地存储读回来。

状态管理选哪一种，本篇的答案是：**先用组件内状态，跨组件共享时再用 `.svelte.js` 模块状态**。待办清单这种规模，一个 `App` 组件里的 `$state` 就够了；如果以后多个不相干的组件都要读同一份数据，就把一个 `$state` 对象放进 `.svelte.js` 文件里导出，各个组件 `import` 同一个对象来读写（对象属性的改动会被追踪，直接导出一个字符串或数字的 `$state` 再整体赋值是行不通的，见第 15 节）。Svelte 4 的 store 写法本篇不用，也不要和 runes 混用。

## 8. 操作前检查

动手前先跑下面两条命令，确认环境没问题再往下走：

```bash
node -v
npm -v
```

两条都应该正常输出版本号。如果 `node` 命令不存在，先装 Node.js 20 LTS 或更高版本；如果输出的 Node 大版本低于 20，先升级。另外准备一个空文件夹，例如 `svelte-todo`，本篇所有命令都在这个文件夹里跑，不要在桌面根目录或已有工程里直接建。

## 9. 逐步操作

### 第 1 步：用 Vite 模板建工程

```bash
npm create vite@latest svelte-todo -- --template svelte
cd svelte-todo
npm install
```

第一条命令是让 Vite 按 Svelte 模板生成工程骨架；第二条进目录；第三条装依赖。装完后打开 `package.json`，确认 `svelte` 那一行的主版本是 5（例如 `^5.57.3`），如果装出来是 4.x，说明模板或缓存有问题，先停下来查原因，不要带着 4.x 继续往下写 runes 代码。

### 第 2 步：按第 10 节和第 11 节写代码

把模板自带的示例内容换成本篇的待办清单代码。文件和路径一个都不能错：

1. `index.html`：根元素 `id` 必须是 `app`，因为 `src/main.js` 要按这个 `id` 挂载。
2. `src/main.js`：用 Svelte 5 的 `mount` 挂载 `App`，不要写 Svelte 4 的 `new App` 写法。
3. `src/App.svelte`：待办清单的主组件，状态、派生值、事件处理、持久化都在这里。
4. `src/lib/Card.svelte`：一个带 snippet 的通用卡片，负责包一层标题和边框，不碰待办业务。
5. `src/lib/TodoItem.svelte`：一条待办的展示和操作，只负责显示和回传点击，不直接改父组件状态。
6. `package.json`、`vite.config.js`：见第 11 节，照抄后不要改脚本名。

### 第 3 步：启动开发服务器

```bash
npm run dev
```

终端会输出一个本地地址，通常是 `http://localhost:5173/`，端口被占用时会自动换一个，以终端实际输出的为准。用浏览器打开这个地址，应该看到待办清单页。

### 第 4 步：按第 14 节逐项验证

先加一条待办，再勾选、删除、切换筛选、刷新页面，每一步都对照第 14 节的预期结果。任何一步对不上，先看第 16 节的排查表，不要急着改代码。

### 第 5 步：构建一次生产包

```bash
npm run build
```

构建成功后工程里会多出一个 `dist` 目录，里面是编译后的静态文件。这一步是给读者验证用的：构建产物就是第 6 节说的“编译成直接操作 DOM 的 JavaScript”，不再包含 Svelte 的源码形态。

### 关键写法逐个讲

#### 响应式：`$state`、`$derived`、`$effect`

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => {
    document.title = `数量：${count}`;
  });
</script>
```

`count` 是响应式状态，直接 `count++` 就能触发更新，不用 setter；`doubled` 是派生值，`count` 变了它下次被读到时才重算，不要把它再存成一份独立状态；`$effect` 里只做副作用（例如改标题、写本地存储），不要在 `$effect` 里又去改它自己依赖的状态，那样容易死循环。

#### 组件 props：`$props`

```svelte
<script>
  let { todo, onToggle, onDelete } = $props();
</script>
```

`$props()` 一次性把父组件传来的所有 props 解构出来。`todo` 是数据，`onToggle` 和 `onDelete` 是父组件传下来的回调函数。子组件要“告诉父组件出事了”时就调用这两个函数，而不是自己改父组件的状态，也不要用 Svelte 4 的事件派发写法。

#### 事件处理：DOM 事件用 `on` 属性，组件通信用回调函数

```svelte
<button onclick={() => onDelete(todo.id)}>删除</button>
<input type="checkbox" checked={todo.done} onchange={() => onToggle(todo.id)} />
```

DOM 元素的事件在 Svelte 5 里写成 `onclick`、`onchange` 这样的属性，值是一个函数；组件之间的通信则靠上面说的回调函数 prop。两类事件不要混：不要在子组件里指望父组件“监听”一个自定义事件名。

#### snippet：Svelte 5 的“插槽”

```svelte
<script>
  let { title, children } = $props();
</script>

<section>
  <h2>{title}</h2>
  {@render children()}
</section>
```

上面是 `Card.svelte` 的核心写法。父组件在 `<Card>` 标签中间写的内容，会自动变成一个叫 `children` 的 snippet 传进来，子组件用 `{@render children()}` 把它渲染出来。snippet 还可以起别的名字当作普通 prop 传，例如 `let { header } = $props()` 再写 `{@render header()}`，用法和 `children` 一样，只是名字不同。Svelte 4 的 `<slot>` 在本篇不出现，写新工程时不要再用它。

#### 列表渲染：`{#each}` 一定要给 key

```svelte
{#each visibleTodos as todo (todo.id)}
  <TodoItem {todo} onToggle={toggleTodo} onDelete={deleteTodo} />
{/each}
```

括号里的 `todo.id` 是 key，作用是让 Svelte 在增删改时认得出哪一条是哪一条。没有 key 时，删掉中间一条后，剩下的条目可能出现状态错位（例如勾选状态串到另一条上），这是新手最容易踩的坑之一。

## 10. 完整代码

下面是待办清单工程的全部业务代码，每段代码上面都注明了存放路径，照抄时不要漏文件、不要改路径。第 11 节的 `package.json` 和 `vite.config.js` 同样是工程的一部分，合起来才是一个完整工程。

存放路径：`index.html`

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Svelte 待办清单</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

存放路径：`src/main.js`

```js
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, {
  target: document.getElementById('app')
});
```

存放路径：`src/App.svelte`

```svelte
<script>
  import Card from './lib/Card.svelte';
  import TodoItem from './lib/TodoItem.svelte';

  const STORAGE_KEY = 'svelte-todos-v1';

  function loadInitialTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return [
      { id: 1, text: '读完 Svelte runes 一节', done: false },
      { id: 2, text: '把待办清单跑起来', done: true },
      { id: 3, text: '试试筛选和刷新', done: false }
    ];
  }

  let todos = $state(loadInitialTodos());
  let newText = $state('');
  let filter = $state('all');

  let visibleTodos = $derived(
    filter === 'all'
      ? todos
      : todos.filter((todo) => (filter === 'done' ? todo.done : !todo.done))
  );
  let remaining = $derived(todos.filter((todo) => !todo.done).length);

  $effect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  });

  function addTodo() {
    const text = newText.trim();
    if (text === '') {
      return;
    }
    todos.push({ id: Date.now(), text, done: false });
    newText = '';
  }

  function toggleTodo(id) {
    const todo = todos.find((item) => item.id === id);
    if (todo) {
      todo.done = !todo.done;
    }
  }

  function deleteTodo(id) {
    todos = todos.filter((item) => item.id !== id);
  }

  function handleInputKeydown(event) {
    if (event.key === 'Enter') {
      addTodo();
    }
  }

  function setFilter(value) {
    filter = value;
  }
</script>

<main>
  <h1>Svelte 待办清单</h1>
  <p>剩余未完成：{remaining} 条</p>

  <Card title="新增待办">
    <input
      type="text"
      placeholder="输入一件要做的事，按回车或点新增"
      bind:value={newText}
      onkeydown={handleInputKeydown}
    />
    <button onclick={addTodo}>新增</button>
  </Card>

  <Card title="待办列表">
    <div>
      <button onclick={() => setFilter('all')}>全部</button>
      <button onclick={() => setFilter('todo')}>未完成</button>
      <button onclick={() => setFilter('done')}>已完成</button>
    </div>

    {#if visibleTodos.length === 0}
      {#snippet emptyTip()}
        <p>这里是空的，先加一条待办吧。</p>
      {/snippet}
      {@render emptyTip()}
    {:else}
      <ul>
        {#each visibleTodos as todo (todo.id)}
          <TodoItem {todo} onToggle={toggleTodo} onDelete={deleteTodo} />
        {/each}
      </ul>
    {/if}
  </Card>
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 24px;
    font-family: system-ui, sans-serif;
  }

  button {
    margin-right: 8px;
  }

  input[type="text"] {
    width: 320px;
    padding: 8px;
    margin-right: 8px;
  }
</style>
```

存放路径：`src/lib/Card.svelte`

```svelte
<script>
  let { title, children } = $props();
</script>

<section>
  <h2>{title}</h2>
  {@render children()}
</section>

<style>
  section {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
</style>
```

存放路径：`src/lib/TodoItem.svelte`

```svelte
<script>
  let { todo, onToggle, onDelete } = $props();
</script>

<li>
  <input
    type="checkbox"
    checked={todo.done}
    onchange={() => onToggle(todo.id)}
  />
  <span>{todo.text}</span>
  <button onclick={() => onDelete(todo.id)}>删除</button>
</li>

<style>
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
  }
</style>
```

上面这套代码有几个点值得单独提醒，都是照抄时最容易抄错的地方：

1. `App.svelte` 里 `todos.push` 能直接触发更新，是因为 `$state` 对数组做了代理追踪，深层次的改动（例如 `todo.done = !todo.done`）同样会被追踪，Svelte 4 里“改了数组内容还要整体重新赋值”那套 workaround 在这里不需要。
2. `filter` 的三个取值只有 `all`、`todo`、`done`，`visibleTodos` 用 `$derived` 从 `todos` 和 `filter` 现算，不要再单独存一份筛选后的数组。
3. `Card` 的 `children` 不是你手动传的 prop，是父组件写在 `<Card>` 标签中间的内容自动变成的 snippet，子组件只负责 `{@render children()}`。
4. `TodoItem` 的 `todo` 是父组件传下来的对象，子组件只读它、绝不直接改它；要改就调 `onToggle` 或 `onDelete`，让 `App` 去改。
5. `id` 用 `Date.now()` 生成，够本篇演示用，真实产品里如果一毫秒内连点两次可能撞号，正式项目要换更稳妥的生成方式。

## 11. 完整配置文件

存放路径：`package.json`（项目根目录）

```json
{
  "name": "svelte-todo",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "svelte": "^5.57.3"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^6.0.0",
    "vite": "^7.0.0"
  }
}
```

存放路径：`vite.config.js`（项目根目录）

```js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()]
});
```

文件存放路径总表（缺一不可）：

| 文件 | 存放路径 | 在哪一节 |
| --- | --- | --- |
| 入口 HTML | `index.html` | 第 10 节 |
| 入口 JS | `src/main.js` | 第 10 节 |
| 主组件 | `src/App.svelte` | 第 10 节 |
| 通用卡片 | `src/lib/Card.svelte` | 第 10 节 |
| 待办条目 | `src/lib/TodoItem.svelte` | 第 10 节 |
| 包配置 | `package.json` | 本节 |
| 构建配置 | `vite.config.js` | 本节 |

## 12. 每个关键配置项的解释

### `package.json`

| 配置项 | 含义 |
| --- | --- |
| `private: true` | 声明这是一个不发布的本地工程，防止误发到 npm |
| `type: module` | 让 `.js` 文件按 ES 模块解析，`import` 才能直接用 |
| `scripts.dev` | `vite`，启动开发服务器 |
| `scripts.build` | `vite build`，产出 `dist` 生产包 |
| `scripts.preview` | `vite preview`，本地预览生产包 |
| `dependencies.svelte` | 框架本身，`^5.57.3` 表示装 5.x、且不低于 5.57.3，绝不装成 4.x |
| `devDependencies.@sveltejs/vite-plugin-svelte` | 让 Vite 认识 `.svelte` 文件、调用 Svelte 编译器 |
| `devDependencies.vite` | 开发服务器和构建工具本身 |

### `vite.config.js`

| 配置项 | 含义 |
| --- | --- |
| `defineConfig` | Vite 提供的配置包装，写错字段时编辑器更容易提示 |
| `plugins: [svelte()]` | 注册 Svelte 插件；没有它，Vite 不认识 `.svelte` 文件，启动就会报错 |

### 组件里的关键写法

| 写法 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `let todos = $state(...)` | 声明响应式状态 | 不用 `$state`，改了数据页面不更新 |
| `let visibleTodos = $derived(...)` | 派生值，依赖变了才重算 | 存成独立状态后，两份数据容易不一致 |
| `$effect(() => {...})` | 依赖变化时跑副作用，例如写本地存储 | 在 `$effect` 里改它自己依赖的状态，容易死循环 |
| `let { todo, onToggle } = $props()` | 解构父组件传来的 props | 直接读未声明的变量，编译报错 |
| `bind:value={newText}` | 输入框和状态双向绑定 | 只写 `value` 不写 `bind:`，输入后状态不变 |
| `{#each list as item (item.id)}` | 带 key 的列表渲染 | 不写 key，增删后状态可能串位 |
| `{#snippet emptyTip()}` 加 `{@render emptyTip()}` | 定义并渲染一段可复用标记 | 只定义不渲染，页面上什么都不会出现 |
| `let { children } = $props()` 加 `{@render children()}` | 接收父组件写在标签中间的内容 | 不写 `{@render children()}`，标签中间的内容会被丢掉 |
| `mount(App, { target })` | Svelte 5 的挂载方式 | 用 Svelte 4 的 `new App` 写法，Svelte 5 里跑不起来 |

## 13. 执行结果示例

下面是读者按第 9 节操作后应该看到的结果，不是本篇作者在本机跑构建的实录（构建是否通过，见第 14 节的说明）：

终端里 `npm run dev` 的输出示例（端口以实际输出为准）：

```text
VITE v7.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  press h + enter to show help
```

浏览器里打开这个地址，应该看到：

1. 标题“Svelte 待办清单”，下面一行“剩余未完成：2 条”。
2. “新增待办”卡片里有一个输入框和一个“新增”按钮。
3. “待办列表”卡片里有“全部 / 未完成 / 已完成”三个筛选按钮，下面是三条初始待办：“读完 Svelte runes 一节”未完成、“把待办清单跑起来”已完成（复选框打勾）、“试试筛选和刷新”未完成。
4. 点“未完成”后只剩两条，点“已完成”后只剩一条，点“全部”后恢复三条。
5. `npm run build` 成功后，工程里出现 `dist` 目录，里面有编译后的 `index.html` 和 `assets` 下的 JS、CSS 文件。

如果第 3 步的初始数据不是上面这样，先确认 `App.svelte` 里 `loadInitialTodos` 的初始数组有没有被改过，以及浏览器本地存储里是不是已经存了一份旧数据（先清掉该站点的本地存储再刷新，见第 16 节）。

## 14. 成功验证

下面五步要在读者自己的机器上逐项做完，才算本篇通过。本篇作者没有在本机跑 `npm install` / `npm run dev` / `npm run build`，所以构建流程是给读者的操作说明，不声称构建通过；下面每一步的“预期结果”就是读者验证时要对照的标准：

1. **版本验证**：在工程目录跑 `npm list svelte`，输出里 svelte 的主版本必须是 5，例如 `svelte@5.57.3` 或更新的 5.x；如果是 4.x，先停下来处理版本问题，不要继续。
2. **启动验证**：跑 `npm run dev`，终端正常输出本地地址，浏览器打开后能看到待办清单页，没有白屏、没有编译报错。
3. **交互验证**：输入框里写“测试新增”并按回车，列表多出一条；点它的复选框，剩余未完成数量减 1；点它的“删除”，这条消失；三个筛选按钮切过去，结果和第 13 节一致。
4. **持久化验证**：加一条、勾选一条后刷新页面，刚才的改动还在；再开一个无痕窗口打开同一地址，应该看到初始三条（因为无痕窗口没有旧的本地存储）。
5. **构建验证**：跑 `npm run build`，命令退出码为 0，工程里出现 `dist` 目录；再跑 `npm run preview`，用浏览器打开预览地址，页面和开发时一致。

视觉效果（例如卡片边框、按钮间距）以浏览器里实际看到的为准，本篇的 curl、解析、语法检查都代替不了这一步。

## 15. 常见错误

| 错误现象 | 原因 | 正确做法 |
| --- | --- | --- |
| 页面改了数据不更新 | 状态没用 `$state` 声明 | 凡是要触发页面更新的状态，一律用 `$state` 包起来 |
| 编译报错，提示 rune 只能在特定文件里用 | 在普通 `.js` 文件里写了 `$state` | rune 只写在 `.svelte`、`.svelte.js`、`.svelte.ts` 里，普通逻辑文件只写纯函数 |
| 编译报错，提示不能在普通函数里调用 rune | 把 `$state` 写进了事件处理函数或条件分支里 | rune 只出现在组件顶层、类字段这类位置，事件处理里只读写已经声明好的状态 |
| 子组件改了 props 没反应或报错 | 子组件直接改了父组件传下来的 `todo` 对象里的字段之外，又指望父组件同步 | 子组件只读 props，要改就调父组件传下来的回调函数 |
| 删掉中间一条后，勾选状态串到另一条 | `{#each}` 没写 key | 列表渲染一律写 `(todo.id)` 这样的 key |
| 输入框打字后状态没变 | 只写了 `value`，没写 `bind:value` | 输入框用 `bind:value` 做双向绑定 |
| `<Card>` 标签中间的内容没显示 | 子组件没写 `{@render children()}` | 有 `children` 就必须有对应的一句 `{@render children()}` |
| 用 prop 初始化本地状态后，prop 变了本地状态不变 | 用 prop 的值初始化 `$state`，只在组件创建时跑一次 | 如果本地状态必须跟随 prop 变，用 `$derived` 现算，或者用 `$effect` 显式同步，不要指望初始化语句会重跑 |
| 共享状态导出一个字符串后，别的组件改不动 | 直接导出一个字符串或数字的 `$state` 再整体赋值是行不通的 | 共享状态导出一个对象（例如 `{ filter: 'all' }`），各个组件改它的属性；或者导出一个带 `$state` 字段的类实例 |
| 页面空白，控制台报错找不到挂载目标 | `index.html` 里没有 `id="app"` 的元素，或 `main.js` 里的 `id` 写错 | 两边的 `id` 必须一字不差地对上 |
| 照着旧教程写 `export let`、事件派发、`<slot>`、`new App` 还能跑吗 | 那些是 Svelte 4 的写法，Svelte 5 的 runes 工程里不要用 | 一律换成本篇的写法：`$props`、回调函数 prop、snippet、`mount` |

## 16. 故障排查

1. **开发服务器起不来，提示端口被占用**：先看终端输出的实际地址，Vite 会自动换端口；如果换了端口还打不开，确认是不是有别的开发服务器占着，先停掉旧的再启动。
2. **启动就报“找不到模块”**：先确认 `npm install` 跑完且没有报错，再确认 `import` 的路径和文件名大小写对不对（`TodoItem.svelte` 的 `T` 和 `I` 都是大写，写错一个字母就找不到）。
3. **编译报 rune 相关错误**：先确认报错的文件后缀是不是 `.svelte` 或 `.svelte.js`，再确认 rune 是不是写在组件顶层；如果是在普通 `.js` 文件里，把那段逻辑改成纯函数，状态留在组件里。
4. **页面空白**：先开浏览器开发者工具看控制台报错，再按顺序查：`index.html` 有没有 `id="app"`、`main.js` 是不是用 `mount`、三个组件文件的路径对不对。
5. **数据对不上（例如初始三条变成别的）**：先清掉该站点在浏览器里的本地存储再刷新，因为 `$effect` 会把旧数据写回去；确认是本地存储的问题还是代码的问题，再动手改代码。
6. **样式没生效**：先确认 `<style>` 是不是写在组件文件里，Svelte 组件样式默认只作用于本组件，不会跑到别的组件上；全局样式要放在单独的 CSS 文件里并在 `main.js` 里引入，本篇示例不需要这一步。
7. **构建失败但开发时能跑**：先看构建报错的第一行，多数是版本问题或某个文件路径写错；再跑 `npm list svelte` 确认主版本是 5，不要在 4.x 和 5.x 之间来回混装。

## 17. 安全注意事项

1. **不要把密钥、Token、密码写进前端代码**：前端代码构建后会原样发给浏览器，任何人都能看到，密钥只能放在后端。
2. **不要用 `{@html}` 渲染用户输入**：Svelte 默认会对插值做转义，`{@html}` 会绕过这层保护，用户输入里夹带脚本就可能造成跨站脚本攻击；本篇示例全程用普通插值，不用 `{@html}`。
3. **本地存储只放不敏感的数据**：本篇只存待办文本和完成状态；登录态、Token 这类敏感信息不要放本地存储，登录方案见本指南的后端与安全章节。
4. **定期检查依赖**：跑 `npm audit` 看看有没有已知漏洞报告，有的话按提示升级对应依赖，不要长期停在有漏洞的版本上。
5. **用户输入先校验再用**：本篇 `addTodo` 里先 `trim` 再判空，空字符串直接返回；真实项目里还要限制长度、过滤非法字符，不要把输入原样拼进任何命令或查询里。

## 18. 回滚和恢复

1. **改坏了先回退代码**：动手前先给工程做一次提交（例如 `git init` 后提交一次），改坏了用版本控制回退，不要凭记忆一行行改回去。
2. **只改坏了配置文件**：把 `package.json` 或 `vite.config.js` 恢复成本篇第 11 节的样子，再跑一次 `npm install`，不要同时改组件代码和配置文件，那样分不清是谁的问题。
3. **依赖装坏了**：删掉 `node_modules` 和 `package-lock.json` 后重新跑 `npm install`，再确认 `npm list svelte` 的主版本是 5。
4. **版本升错了**：例如误装成 4.x，先跑 `npm install svelte@^5.57.3` 回到 5.x，再检查示例代码里有没有混进 4.x 写法，有的话按第 15 节的对照表逐项改回 runes 写法。
5. **本地存储里的数据乱了**：在浏览器里清掉该站点的本地存储再刷新，页面会回到初始三条待办，不会影响代码本身。
6. **构建产物乱了**：删掉 `dist` 目录后重新跑 `npm run build`，构建产物是生成的，随时可以重建，不用手动改里面的文件。

## 19. 延伸阅读

1. Svelte 官方文档（svelte.dev）：runes、组件、snippet、模板语法的权威说明，遇到本篇没讲到的写法先查这里。
2. Svelte 5 迁移指南（svelte.dev）：从 Svelte 4 升级到 5 时的改动清单，适合手头已有旧工程的读者对照。
3. Vite 官方文档：开发服务器、构建、预览的完整选项，本篇只用了最常用的三个脚本。
4. 本指南的 JavaScript 篇：JS-01（基础）、JS-02（DOM 与异步）、JS-04（npm 与 Vite 工程化），是本篇的前置知识。
5. 本指南的前端框架篇其他文章：FE-01 Vue 3、FE-02 React、FE-03 Angular、FE-05 Next.js（写完后可对照着看不同框架处理同一类问题的方式）。

## 20. 相关章节链接

- 前置基础：[JS-01 JavaScript 基础完整教程](../javascript/01-basics.md)、[JS-02 DOM、事件、异步完整教程](../javascript/02-dom-async.md)、[JS-04 npm、pnpm、Vite、前端工程化完整教程](../javascript/04-tooling.md)
- 上一篇：[FE-03 Angular](./03-angular.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[FE-05 Next.js](./05-nextjs.md)
