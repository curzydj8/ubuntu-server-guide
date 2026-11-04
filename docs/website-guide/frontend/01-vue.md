# FE-01：Vue 3 完整教程

> 任务编号：FE-01（网站建设与部署实战指南 · 前端框架第 1 篇）
> 上一篇：[JS-04 npm、pnpm、Vite、前端工程化](../javascript/04-tooling.md)；下一篇：[FE-02 React](./02-react.md)。
> 本篇只讲 Vue 3：Composition API、组件、路由、状态管理，以及一个含路由与 Pinia 的完整实战。不讲 React、Angular、Svelte，不讲 Nuxt（那是 FE-06 的范围）。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 用 Composition API 写一个能跑的 Vue 3 页面，知道 `ref`、`reactive`、`computed`、`watch` 各自用在什么地方。
2. 把页面拆成组件，父子之间用 `props` 传数据、用 `emits` 回传事件、用插槽放可变内容。
3. 给应用加两条路由，用 `vue-router` 在页面之间切换，并用编程式导航跳转。
4. 用 Pinia 建一个全局待办清单状态，让两个路由页面共享同一份数据。
5. 从零建一个 Vite + Vue 3 工程，跑开发服务器、构建出生产产物，并知道构建失败时先查什么。

## 2. 适用人群

本篇适合已经读完 JS-01、JS-02、JS-04 的读者：会写变量、函数、对象、数组，会操作 DOM、会写 `async/await`，知道 `npm run dev` 是干什么的。如果你还没接触过任何前端框架，本篇就是第一篇框架教程，不需要先学 React；如果你用过 Vue 2 的 Options API，本篇会帮你把写法换成 Vue 3 的 Composition API，重点看第 6 节的对照表。

## 3. 适用系统和版本

| 项目 | 版本 | 说明 |
| --- | --- | --- |
| 操作系统 | Windows 10/11、macOS、Ubuntu 22.04/24.04 均可 | 命令只差在终端，其余步骤相同 |
| Node.js | 20.19 以上或 22.12 以上 | Vite 8 的要求，低于这个版本先升级 Node |
| Vue | 3.5.43 | 核查日期 2026-11-03，核查到的最新稳定版；Vue 3.6 当时仍在 RC（3.6.0-rc.10），不用于本篇 |
| vue-router | 5.x | 主版本线于 2026-01-29 发布，安装时用 `vue-router@5`，以当场查到的补丁号为准 |
| Pinia | 4.0.3 | 核查日期 2026-11-03；Pinia 4 只支持 ESM，且需同时装 `@vue/devtools-api`，见第 9 节 |
| Vite | 8.x | 配套插件 `@vitejs/plugin-vue` 用 6.x 线 |
| 浏览器 | Chrome、Edge、Firefox、Safari 的近两年版本 | 需要支持 ES 模块和 Proxy |

版本口径说明：示例 `package.json` 里写的是主版本范围（如 `^3.5.43`、`^5.0.0`、`^4.0.0`），装包时 npm 会取该主版本线内最新的补丁版，补丁号与核查时不一致是正常的，不影响本篇 API。不要用 Vue 2 和 Vuex 写新项目：Vue 2 已于 2023-12-31 停止维护，Vuex 也已进入维护模式，Vue 官方推荐的状态管理就是 Pinia；也不要用 Vue CLI 脚手架，它同样处于维护模式，新项目一律用 Vite。

## 4. 使用前提

动手前你应当已经具备：

1. HTML 基础：会写标签、表单、列表，知道 `id` 和 `class` 的作用。
2. CSS 基础：会写选择器、盒模型、Flex 布局，组件样式用的是普通 CSS，不展开讲。
3. JavaScript 基础：变量、函数、箭头函数、对象、数组方法、模块的 `import` 和 `export`。
4. 一台装好 Node.js 的电脑，并且能在终端里跑 `node -v` 和 `npm -v`。

## 5. 所需资源

| 资源 | 用途 | 是否必需 |
| --- | --- | --- |
| Node.js + npm（或 pnpm） | 创建工程、装依赖、跑开发服务器和构建 | 必需 |
| 代码编辑器，如 VS Code | 写代码；装官方 Vue 扩展可获得模板高亮和类型提示 | 必需编辑器，扩展可选 |
| 现代浏览器 | 打开开发服务器地址、看页面效果、看控制台报错 | 必需 |
| Vue Devtools 浏览器扩展 | 在浏览器里查看组件树和 Pinia 状态，排错时很有用 | 可选，但强烈建议装 |

本篇不需要服务器、不需要数据库、不需要注册任何账号，所有数据都存在浏览器内存里，刷新页面后待办清单会回到初始两条，这是特意设计的，第 14 节和第 16 节会讲清原因。

## 6. 技术原理

### 6.1 响应式：数据变了，页面跟着变

Vue 的核心是响应式系统。Vue 3 用 JavaScript 的 `Proxy` 把一个普通对象包起来，读取属性时记下“谁在用这个数据”，修改属性时通知这些使用者重新渲染。你不需要手动操作 DOM，数据就是页面唯一的事实来源，流程永远是：改数据，页面自动更新；页面事件，改数据。

### 6.2 虚拟 DOM 与编译

浏览器直接操作 DOM 很慢，Vue 的做法是：先根据模板生成一棵轻量的虚拟 DOM 树，数据变化时生成新树、对比两棵树的差异，只把差异写回真实 DOM。单文件组件（SFC）里的模板在构建时由 Vue 编译器转成渲染函数，开发服务器和生产构建都会做这一步，你写的 `.vue` 文件浏览器是直接看不懂的，必须经过 Vite 处理。

### 6.3 Composition API 与 Options API 的对照

| 写法 | 组织方式 | 适用场景 |
| --- | --- | --- |
| Options API（Vue 2 的主流写法） | 按 `data`、`methods`、`computed`、`watch` 分组写 | 一个组件逻辑很少时直观 |
| Composition API（本篇写法） | 用 `<script setup>`，相关逻辑写在一起，用 `ref`、`computed`、`watch` 组合 | 逻辑一多就明显更易复用和拆分，是 Vue 3 的推荐写法 |

本篇全部用 Composition API 的 `<script setup>` 写法。注意一个新手最容易踩的点：`ref` 包住的值在脚本里必须用 `.value` 读写，在模板里 Vue 会自动解包，不用写 `.value`，写了反而读不到。

### 6.4 组件、路由、状态三者的分工

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 组件 | 一块界面的结构、样式和局部交互 | 跨页面的共享数据 |
| vue-router | 地址与页面的对应关系、页面切换、导航守卫 | 业务数据本身 |
| Pinia | 跨组件、跨页面共享的状态和改状态的方法 | 界面长什么样 |

数据流向只有一条：组件触发事件或调用 store 的方法，方法改 store 里的状态，所有用到这份状态的组件自动重新渲染。不要让两个组件各自存一份同样的待办清单，那样改了一处另一处不动，问题一定出在“状态放错了地方”。

## 7. 架构说明

实战项目叫 `vue-todo`，结构如下：

```text
vue-todo/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.js
    ├── App.vue
    ├── assets/
    │   └── main.css
    ├── components/
    │   ├── TodoForm.vue
    │   └── TodoItem.vue
    ├── router/
    │   └── index.js
    ├── stores/
    │   └── todo.js
    └── views/
        ├── TodoView.vue
        └── AboutView.vue
```

各部分的分工：`main.js` 是入口，只做三件事——创建应用、装 Pinia、装路由、挂载；`App.vue` 是根组件，只放导航和路由出口；`views/` 是一整页，`components/` 是页里可复用的小块；`stores/todo.js` 是唯一一份待办数据；`router/index.js` 是地址表。页面打开时的数据流是：地址 `/` 命中待办页，待办页从 Pinia 取清单并渲染；点导航到 `/about`，路由换出关于页，Pinia 里的清单原样保留，再切回 `/` 还在。

## 8. 操作前检查

在终端里逐项核对，全部通过再往下做：

| 检查项 | 命令 | 通过标准 |
| --- | --- | --- |
| Node.js 版本 | `node -v` | v20.19 以上或 v22.12 以上 |
| npm 版本 | `npm -v` | 能输出版本号即可，npm 10 以上为佳 |
| 当前目录 | `pwd`（Windows 用 `cd`） | 确认你在自己要放项目的父目录，不是在系统目录里 |
| 端口占用 | 打开浏览器访问 `http://localhost:5173` | 第一次应打不开（说明端口空闲，开发服务器还没起） |

如果 `node -v` 低于要求，先升级 Node，不要带着旧 Node 往下装 Vite 8，否则装包和启动都会报看不懂的错。

## 9. 逐步操作

下面每一步的命令都在项目父目录或项目根目录执行，执行完一步、看到预期结果再做下一步。

1. 创建工程。终端进入你要放项目的父目录，执行创建命令，按提示选 Vue 模板（框架选 Vue，变体选 JavaScript，不要选 TypeScript，本篇是 JS 版）：

```bash
npm create vue@latest vue-todo
```

2. 进入项目目录并安装依赖。`vue-router` 和 `pinia` 要一起装，Pinia 4 需同时装 `@vue/devtools-api`：

```bash
cd vue-todo
npm install
npm install vue-router@5 pinia@4 @vue/devtools-api
```

3. 按第 10 节把全部文件写进对应路径，覆盖脚手架生成的同名文件。路径一个字都不要错，`src/router/index.js` 和 `src/stores/todo.js` 是脚手架默认没有的，要新建目录和文件。
4. 启动开发服务器：

```bash
npm run dev
```

看到类似 `Local: http://localhost:5173/` 的输出，浏览器打开这个地址，应看到待办页：顶部导航有“待办”和“关于”两个链接，下面是输入框、添加按钮和初始两条待办。
5. 在输入框里输入一条待办并添加，点勾选框切换完成状态，点删除删掉一条，再点导航切到“关于”页、切回来，确认清单没有丢。
6. 构建生产产物并本地预览：

```bash
npm run build
npm run preview
```

构建成功会在项目根目录生成 `dist/`，预览地址同样在终端输出，打开应与开发模式看到的页面一致。

## 10. 完整代码

下面是实战项目的全部文件，每个文件都注明存放路径，代码完整、无省略号，复制时按路径放好，不要只复制一部分。

### 10.1 存放路径：项目根目录 `package.json`

```json
{
  "name": "vue-todo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pinia": "^4.0.0",
    "vue": "^3.5.43",
    "vue-router": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "vite": "^8.0.0"
  }
}
```

### 10.2 存放路径：项目根目录 `vite.config.js`

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()]
})
```

### 10.3 存放路径：项目根目录 `index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vue 待办清单</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

### 10.4 存放路径：`src/main.js`

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import './assets/main.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')
```

### 10.5 存放路径：`src/App.vue`

```vue
<template>
  <div class="app">
    <header class="topbar">
      <h1>Vue 待办清单</h1>
      <nav class="nav">
        <RouterLink to="/">待办</RouterLink>
        <RouterLink to="/about">关于</RouterLink>
      </nav>
    </header>
    <main class="main">
      <RouterView></RouterView>
    </main>
  </div>
</template>

<style>
.app {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
  color: #1e2129;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav a {
  margin-left: 16px;
  color: #e8590c;
}
</style>
```

### 10.6 存放路径：`src/router/index.js`

```js
import { createRouter, createWebHistory } from 'vue-router'
import TodoView from '../views/TodoView.vue'
import AboutView from '../views/AboutView.vue'

const routes = [
  { path: '/', name: 'todos', component: TodoView },
  { path: '/about', name: 'about', component: AboutView }
]

const router = createRouter({
  history: createWebHistory(),
  routes: routes
})

export default router
```

### 10.7 存放路径：`src/stores/todo.js`

```js
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

let nextId = 3

export const useTodoStore = defineStore('todo', () => {
  const todos = ref([
    { id: 1, text: '读完本篇第 9 节', done: false },
    { id: 2, text: '跑通 npm run dev', done: false }
  ])

  const doneCount = computed(() => {
    return todos.value.filter((item) => {
      return item.done
    }).length
  })

  function addTodo(text) {
    todos.value.push({ id: nextId, text: text, done: false })
    nextId = nextId + 1
  }

  function toggleTodo(id) {
    const todo = todos.value.find((item) => {
      return item.id === id
    })
    if (todo) {
      todo.done = !todo.done
    }
  }

  function removeTodo(id) {
    todos.value = todos.value.filter((item) => {
      return item.id !== id
    })
  }

  function clearDone() {
    todos.value = todos.value.filter((item) => {
      return !item.done
    })
  }

  return {
    todos: todos,
    doneCount: doneCount,
    addTodo: addTodo,
    toggleTodo: toggleTodo,
    removeTodo: removeTodo,
    clearDone: clearDone
  }
})
```

### 10.8 存放路径：`src/components/TodoForm.vue`

```vue
<template>
  <form class="form" @submit.prevent="submit">
    <input v-model="text" type="text" placeholder="输入一条待办，按回车或点添加">
    <button type="submit">添加</button>
  </form>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['add'])
const text = ref('')

function submit() {
  const value = text.value.trim()
  if (!value) {
    return
  }
  emit('add', value)
  text.value = ''
}
</script>

<style>
.form {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}
.form input {
  flex: 1;
  padding: 8px;
}
</style>
```

### 10.9 存放路径：`src/components/TodoItem.vue`

```vue
<template>
  <li class="item">
    <input type="checkbox" :checked="todo.done" @change="onToggle">
    <span :class="{ done: todo.done }">{{ todo.text }}</span>
    <button type="button" @click="onRemove">删除</button>
  </li>
</template>

<script setup>
const props = defineProps({
  todo: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['toggle', 'remove'])

function onToggle() {
  emit('toggle', props.todo.id)
}

function onRemove() {
  emit('remove', props.todo.id)
}
</script>

<style>
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #e5e5e5;
}
.done {
  color: #999999;
  text-decoration: line-through;
}
</style>
```

### 10.10 存放路径：`src/views/TodoView.vue`

```vue
<template>
  <section>
    <h2>待办清单</h2>
    <TodoForm @add="addTodo"></TodoForm>
    <div class="filters">
      <button type="button" @click="filter = 'all'">全部</button>
      <button type="button" @click="filter = 'active'">未完成</button>
      <button type="button" @click="filter = 'done'">已完成</button>
    </div>
    <ul class="list">
      <TodoItem v-for="todo in filteredTodos" :key="todo.id" :todo="todo" @toggle="store.toggleTodo" @remove="store.removeTodo"></TodoItem>
    </ul>
    <p>{{ remaining }} 条未完成，已完成 {{ store.doneCount }} 条。</p>
    <button type="button" @click="store.clearDone">清除已完成</button>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTodoStore } from '../stores/todo.js'
import TodoForm from '../components/TodoForm.vue'
import TodoItem from '../components/TodoItem.vue'

const store = useTodoStore()
const filter = ref('all')

const filteredTodos = computed(() => {
  if (filter.value === 'active') {
    return store.todos.filter((item) => {
      return !item.done
    })
  }
  if (filter.value === 'done') {
    return store.todos.filter((item) => {
      return item.done
    })
  }
  return store.todos
})

const remaining = computed(() => {
  return store.todos.filter((item) => {
    return !item.done
  }).length
})

function addTodo(text) {
  store.addTodo(text)
}
</script>

<style>
.filters {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.list {
  list-style: none;
  padding: 0;
}
</style>
```

### 10.11 存放路径：`src/views/AboutView.vue`

```vue
<template>
  <section>
    <h2>关于这个项目</h2>
    <p>这是一个 Vue 3 实战项目：待办清单数据放在 Pinia 里，页面切换走 vue-router，添加、勾选、删除、筛选都在待办页完成。</p>
    <p>从待办页切到本页再切回去，清单不会丢失，因为数据不在页面组件里，而在全局的 Pinia store 里。</p>
  </section>
</template>
```

### 10.12 存放路径：`src/assets/main.css`

```css
body {
  margin: 0;
  background: #f5f5f5;
}

button {
  cursor: pointer;
  padding: 6px 12px;
}
```

## 11. 完整配置文件

第 10 节已经给出了全部文件，本节逐一说明每个配置类文件的存放路径和作用，改配置时只改这里列出的地方，不要到处找：

| 文件 | 存放路径 | 作用 |
| --- | --- | --- |
| `package.json` | 项目根目录 | 依赖清单和脚本入口，`dev`、`build`、`preview` 三个命令都在这里 |
| `vite.config.js` | 项目根目录 | Vite 配置，本篇只有一条：装 Vue 单文件组件插件 |
| `index.html` | 项目根目录 | 浏览器打开的入口页，`id="app"` 的容器和 `/src/main.js` 的引用都在这里 |
| `src/main.js` | `src/` | 应用入口：创建应用、装 Pinia、装路由、挂载到 `#app` |
| `src/router/index.js` | `src/router/` | 路由表，地址与页面的对应关系只在这里改 |
| `src/stores/todo.js` | `src/stores/` | Pinia store，待办数据和改数据的方法只在这里改 |
| `src/assets/main.css` | `src/assets/` | 全局样式，`main.js` 里引用一次即可全站生效 |

本篇是 JavaScript 版工程，没有 `tsconfig.json`，也不需要 TypeScript 配置。将来要上 TypeScript 时再看 JS-03，那时 `vite.config.js`、组件的 `<script setup>` 和 store 的写法都要跟着改，不是只改一个后缀名。

## 12. 每个关键配置项的解释

### 12.1 `package.json` 关键项

| 配置项 | 含义 | 改错了会怎样 |
| --- | --- | --- |
| `private: true` | 声明这不是要发布的包，防止误执行发布命令 | 删掉也不影响运行，但新项目建议留着 |
| `type: module` | 声明本项目用 ES 模块，`import` 写法才合法 | 删掉后 `import` 会报错，Vite 项目必须保留 |
| `scripts.dev` | `vite`，启动开发服务器 | 改错后 `npm run dev` 起不来 |
| `scripts.build` | `vite build`，产出生产文件到 `dist/` | 改错后构建命令失效 |
| `dependencies.vue` | Vue 框架本身，`^3.5.43` 表示 3.5.43 以上、4.0 以下的最新补丁版 | 版本写成 2.x 会导致本篇 API 全对不上 |
| `dependencies.vue-router` | 路由，`^5.0.0` 表示 5.x 线 | 写成 4.x 也能跑，但部分新 API 不可用，本篇按 5.x 写 |
| `dependencies.pinia` | 状态管理，`^4.0.0` 表示 4.x 线 | 写成 2.x 时 store 写法仍兼容，但要去掉 `@vue/devtools-api` 的要求说明 |
| `devDependencies.vite` | 构建工具，只在开发和构建时用，不打进最终产物依赖表 | 放进 `dependencies` 也能跑，但语义不对 |
| `devDependencies.@vitejs/plugin-vue` | 让 Vite 读懂 `.vue` 单文件组件的插件，6.x 线配 Vite 8 | 缺了它，`.vue` 文件会直接报解析错误 |

### 12.2 `vite.config.js` 关键项

`plugins: [vue()]` 是本篇唯一一条配置，意思是把 Vue 单文件组件插件交给 Vite，模板、脚本、样式三段由它在构建时分别处理。没有这一条，Vite 会把 `.vue` 当普通文本，页面必然空白。

### 12.3 路由与 Store 的关键项

| 配置项 | 含义 |
| --- | --- |
| `createWebHistory()` | 用浏览器历史记录模式，地址栏显示干净的 `/about`，而不是带 `#` 的哈希地址 |
| 路由表里的 `path` | 地址，如 `/` 和 `/about`，必须以斜杠开头 |
| 路由表里的 `name` | 路由的名字，编程式导航可用名字跳转，本篇示例用的是地址跳转，名字留着备用 |
| 路由表里的 `component` | 该地址对应的页面组件，`/` 对应待办页，`/about` 对应关于页 |
| `defineStore('todo', ...)` | Pinia store 的唯一标识 `todo`，两个 store 绝不能重名，否则后一个会覆盖前一个 |
| store 里返回的对象 | 只有返回出来的状态和方法，组件里才能用，没返回的东西在组件里是拿不到的 |

## 13. 执行结果示例

### 13.1 开发服务器启动输出

终端执行 `npm run dev` 后，应看到类似下面的输出（端口和耗时因机器而异，关键是出现 `Local` 这一行且没有红色报错）：

```text
VITE ready in 300 ms

➜  Local:   http://localhost:5173/
➜  press h + enter to show help
```

### 13.2 页面应有的样子

浏览器打开 `http://localhost:5173/`，应看到：顶部标题“Vue 待办清单”，右边“待办”和“关于”两个链接；下面一个输入框和“添加”按钮；再下面“全部 / 未完成 / 已完成”三个筛选按钮；初始两条待办“读完本篇第 9 节”和“跑通 npm run dev”，前面各有一个勾选框、后面各有一个“删除”按钮；最下面一行是“2 条未完成，已完成 0 条。”和“清除已完成”按钮。

### 13.3 操作后的变化

输入“买一本 Vue 书”并添加，列表变成 3 条，最下面变成“3 条未完成”；勾选第一条，该条文字变灰并带删除线，最下面变成“2 条未完成，已完成 1 条。”；点“已完成”筛选，列表只剩勾选的那一条；点“关于”再点“待办”切回来，清单还是 3 条，没有丢；点“清除已完成”，勾选的那一条消失。

### 13.4 构建输出

终端执行 `npm run build` 成功后，应看到 `dist/` 目录生成，里面有 `index.html` 和 `assets/` 下的 JS、CSS 文件，输出末尾有类似 `built in 1s` 的成功提示，且没有红色报错。`npm run preview` 打开的页面应与开发模式一致。

## 14. 成功验证

按下面五步在自己的机器上验证，全部通过才算做完本篇。第 1 至第 3 步验证“能跑”，第 4 步验证“状态是全局的”，第 5 步验证“能构建”：

1. 终端在项目根目录执行 `npm run dev`，输出里出现 `Local: http://localhost:5173/`，且没有红色报错。
2. 浏览器打开 `http://localhost:5173/`，能看到第 13.2 节描述的全部元素，初始待办正好是两条。
3. 添加一条待办、勾选一条、删除一条、切换一次筛选，四种操作后页面显示都与第 13.3 节一致，且控制台没有红色报错。
4. 点“关于”再点“待办”切回来，清单条数和勾选状态与切换前完全一致，证明数据在 Pinia 里、没有跟着页面组件一起销毁。
5. 终端执行 `npm run build` 成功生成 `dist/`，再执行 `npm run preview`，预览页与开发页一致。

特别说明：刷新浏览器页面后，清单会回到初始两条，这是正常的。本篇没有接本地存储或后端，Pinia 的状态只存在内存里，刷新即重置。如果刷新后清单还在，那反而说明你多接了持久化插件，不在本篇范围内。

## 15. 常见错误

下面是新手最常犯的错误，全部只用行内代码和表格描述，照着改就行：

| 错误现象 | 原因 | 改法 |
| --- | --- | --- |
| 页面空白，控制台报找不到 `#app` | `index.html` 里没有 `id="app"` 的容器，或 `main.js` 挂载的目标写错 | 核对 `index.html` 的容器 id 和 `app.mount('#app')` 是否一致 |
| 输入框打字没反应，或添加后列表不变 | 脚本里忘了给 `ref` 加 `.value`，或模板里多写了 `.value` | 记住规矩：脚本里用 `text.value`，模板里直接写 `text` |
| 子组件点了删除，父组件列表没变 | 只在子组件里改了自己的数据，没用 `emit` 通知父组件 | 子组件用 `emit('remove', id)`，父组件监听 `@remove` 再调 store 的方法 |
| 切路由后页面空白 | 路由表里的组件路径写错，或忘了在 `App.vue` 里放路由出口 | 核对 `import` 路径和 `RouterView` 是否存在 |
| 两个页面看到的清单不一样 | 两个组件各自存了一份清单，没走同一个 store | 删掉组件里的本地清单，一律从 `useTodoStore()` 取 |
| `npm run dev` 报 Node 版本过低 | Node 低于 Vite 8 的要求 | 升级 Node 到 20.19 以上或 22.12 以上，不要改 Vite 版本去迁就旧 Node |
| 装 Pinia 后启动报缺少 `@vue/devtools-api` | Pinia 4 要求同时装这个包 | 执行 `npm install @vue/devtools-api`，不要降级 Pinia 去绕开 |

## 16. 故障排查

按“先看控制台、再看终端、最后看文件路径”的顺序排查：

| 现象 | 先查什么 | 常见根因 |
| --- | --- | --- |
| 开发服务器起不来，终端红色报错 | 终端报错的第一行，不是最后一行 | 依赖没装全、Node 版本过低、端口被占用 |
| 页面能打开但是空白 | 浏览器控制台 | `main.js` 的 `import` 路径错、组件文件名大小写错、路由出口缺失 |
| 添加待办没反应 | 浏览器控制台 + `TodoForm.vue` 的提交函数 | 表单没写 `@submit.prevent` 导致页面刷新、空字符串没拦截住 |
| 勾选、删除点了没反应 | `TodoItem.vue` 的 `emit` 名和父组件监听名 | 两边名字不一致，如一边写 `toggle` 一边写 `change`，事件就接不上 |
| 刷新后清单回到初始两条 | 不用排查 | 这是本篇设计的正常行为，状态只在内存里，见第 14 节末尾 |
| 构建成功但预览页空白 | 预览终端输出的地址和 `dist/index.html` | 用 `npm run preview` 给的地址打开，不要直接双击 `dist/index.html`，后者走文件协议、模块路径会失效 |
| 路由切换后样式乱了 | `App.vue` 和各组件的 `<style>` | 样式默认只作用于本组件，跨组件复用的样式要放 `src/assets/main.css` |

## 17. 安全注意事项

1. 不要把密钥、Token、密码写进前端代码：浏览器里的一切代码用户都能看到，`src/` 下的任何字符串都不算秘密，需要密钥的请求必须走后端。
2. 不要用 `v-html` 输出用户输入的内容：双花括号输出会自动转义，能防住大部分跨站脚本问题；`v-html` 会原样输出 HTML，用户输入里带脚本就会直接执行，本篇示例全程用双花括号，没有用 `v-html`。
3. 依赖要定期检查：装包后留意终端的安全提示，长期不更新的依赖要评估替换，不要把 `npm audit` 的警告一直留着不管。
4. 路由不是权限控制：前端路由守卫只能改善体验，不能当安全边界，真正的权限校验必须在后端做，藏起来的路由地址用户依然可以直接输入访问。
5. 生产构建产物不要手工改：`dist/` 是构建生成的，改了下次构建就被覆盖，有问题改源码重新构建。

## 18. 回滚和恢复

| 场景 | 恢复方法 |
| --- | --- |
| 某一步改乱了，想回到上一步 | 如果项目已用 Git 管理，用 Git 恢复该文件；如果没有，删掉改乱的单个文件，按第 10 节重新复制一份 |
| 依赖装乱了，启动一直报错 | 删掉项目根目录的 `node_modules` 和锁文件，重新执行 `npm install`，再跑 `npm run dev` |
| 升级某个依赖后页面出问题 | 把 `package.json` 里该依赖的版本号改回之前能跑的主版本范围，删锁文件重装，不要只改 `node_modules` 里的文件 |
| 整个项目不想保留了 | 直接删除 `vue-todo` 目录即可，本篇项目不写系统其他位置、不改全局配置，删除即干净 |
| 想保留代码但换一台机器继续 | 把整个项目目录（含 `package.json`，不含 `node_modules`）拷到新机器，执行 `npm install` 后再跑 `npm run dev` |

## 19. 延伸阅读

1. Vue 官方文档：vuejs.org，重点看“基础”和“深入组件”两部分，本篇的 Composition API、组件、插槽在那里都有完整示例。
2. Vue Router 官方文档：router.vuejs.org，重点看“动态路由匹配”和“导航守卫”，本篇只讲了最基础的两条静态路由。
3. Pinia 官方文档：pinia.vuejs.org，重点看“定义 Store”和“插件”，本篇用的是组合式 Store 写法，选项式写法在那里也有对照。
4. Vite 官方文档：vitejs.dev，重点看“开发服务器”和“构建”，本篇只用了默认配置。
5. 本指南内相关文章：第 20 节列出的 JS、CSS、工程化文章，尤其是 JS-04 的 Vite 工程化部分。

## 20. 相关章节链接

- JavaScript 基础：[JS-01 JavaScript 基础完整教程](../javascript/01-basics.md)、[JS-02 DOM、事件、异步完整教程](../javascript/02-dom-async.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化完整教程](../javascript/04-tooling.md)
- CSS 工程化思路：[CSS-08 CSS 工程化](../css/08-engineering.md)
- HTML 基础：[HTML 01 基础与语义化](../html/01-basics.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[FE-02 React](./02-react.md)
