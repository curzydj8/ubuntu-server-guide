# UI-01：UI 组件库完整教程

> 任务编号：UI-01（网站建设与部署实战指南 · UI 组件库第 1 篇）
> 上一篇：[FE-06 Nuxt 完整教程](./06-nuxt.md)；下一篇：[UX-01 网站设计与用户体验](../design/01-ux.md)。
> 本篇一次讲四个 UI 组件库：Element Plus、Ant Design、Vuetify、MUI。每个库独立成节，讲安装、基本用法、主题定制，最后有一节选型对照。不讲从零写组件库（那是 CSS-14、CSS-15 的范围），不讲网站设计原则本身（那是 UX-01 的范围）。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 说清 UI 组件库是什么、它和 CSS 框架有什么区别：CSS 框架给的是样式和布局，UI 组件库给的是现成的、带交互逻辑的组件（按钮、表单、表格、弹窗）。
2. 给四个库各装上一个最小可跑的例子：Element Plus 配 Vue、Ant Design 配 React、Vuetify 配 Vue、MUI 配 React。
3. 用 Element Plus 做出一个完整页面：按钮、表单、表格齐全，新增、删除、分页都能操作。
4. 给每个库改一次主题：主色、圆角、暗色模式，知道改哪里、改完怎么验证。
5. 按框架、技术栈、设计风格、中文文档情况，给自己的项目选一个库，并说出不选另外三个的理由。

## 2. 适用人群

- 已经学完 FE-01 到 FE-06，至少能用 Vue 或 React 写一个简单页面的人；只学过 Vue 的读者，先看 Element Plus 和 Vuetify 两节，Ant Design 和 MUI 两节只看选型对照即可，反过来也一样。
- 正在做后台管理页、数据录入页、订单列表页的人：这类页面组件重复度最高，用组件库收益最大。
- 不适合只想做一个静态展示页的人：静态页用 HTML + CSS 就够了，引入组件库反而变重，这一点在第 9 节选型对照里会再提醒一次。

## 3. 适用系统和版本

本篇的操作系统不限，Windows、macOS、Linux 都一样，关键在 Node.js 版本：四个库都要求 Node.js 20 以上，Vite 8 要求 Node.js 20.19 以上或 22.12 以上，装之前先跑 `node -v` 确认，低于 20 先升级 Node，不要硬装。

四个库的版本是动手前公开搜索核查的，核查日期 2026-11-03，来源是各库官网更新日志、npm 版本记录和 2026 年 10 月的公开版本对照，安装时仍以当场查到的号为准：

| 库 | 配对框架 | 核查到的版本 | 说明 |
| --- | --- | --- | --- |
| Element Plus | Vue 3 | 2.14.7 | 2026 年 10 月公开版本对照里的当前线；安装用 `element-plus` 即可，锁文件会记下实际装到的补丁号 |
| Ant Design（React 版） | React | antd 6.6.8 | 官方更新日志里 2026-10-26 的版本；要求 React 18 以上 |
| Ant Design Vue（Vue 版） | Vue 3 | 4.2.6 | 注意和上面区分：这个 Vue 版的最新稳定版停在 2024-11-11，截至 2026-10-28 的公开对照里没有更新的稳定版，新项目用 Vue 时优先看 Element Plus 或 Vuetify，不要默认选它 |
| Vuetify | Vue 3 | 4.3.1 | 2026-10-26 的版本；3.x 线继续维护，最新是 3.13.7，老项目可以留在 3.x，新项目直接用 4.x |
| MUI（Material UI） | React | 9.x 主线 | 9.0.0 于 2026-04-07 发布；注意 MUI 没有 v8，是从 v7 直接跳到 v9 的；2026 年 10 月的公开资料里 9.x 的补丁号说法不完全一致，安装用 `^9.0.0` 的范围、锁文件为准，不要把某一个补丁号写死 |

本篇第 10 节的主示例用 Element Plus + Vue 3 + Vite 8，其他三个库的示例只给能跑通的小片段，不要求四个库装进同一个项目。一个项目里只用一个 UI 组件库，不要混用，混用的后果在第 15 节讲。

## 4. 使用前提

开始前请确认下面四项都已具备，缺一项先补齐再往下走：

1. 本机装好 Node.js 20 以上，`node -v` 和 `npm -v` 都能输出版本号。
2. 会用 Vite 建项目（JS-04 讲过），或者直接用本篇第 9 节的命令新建一个空项目。
3. 至少掌握一个框架的基础：Vue 读者要会 `ref`、`v-model`、`v-for`，React 读者要会 `useState` 和 JSX，这两点分别是 FE-01 和 FE-02 的内容。
4. 有一个能联网装包的环境：组件库都要从 npm 下载，离线装不上；公司内网有私有源的，先确认源里有这四个包。

## 5. 所需资源

| 资源 | 用途 | 备注 |
| --- | --- | --- |
| 一个空的 Vite + Vue 3 项目 | 跑第 10 节的主示例 | 本篇用 `npm create vite@latest ui-demo -- --template vue` 新建 |
| npm 账号 | 不需要 | 装公开包不用登录，不要为了装包去注册账号或填令牌 |
| 四个库的官方文档 | 查组件属性和事件 | 每个库的文档地址以官网为准，本篇不贴地址，搜索库名 + 官网即可找到 |
| 浏览器开发者工具 | 看页面报错和网络请求 | 组件没渲染出来时先看控制台，比猜要快 |

## 6. 技术原理

UI 组件库由三层组成，理解这三层，四个库的用法就通了：

1. **组件层**：把“按钮、输入框、表格、弹窗”这些反复出现的界面块封装成组件，调用者只传属性和事件，不用自己写样式和交互细节。比如表格的排序、分页、勾选，库内部已经写好了。
2. **主题层**：颜色、字号、圆角、间距不是写死在每个组件里的，而是从一套设计令牌（Design Tokens）里取的。改主题就是改这套令牌的值，全部组件一起变，这正是 CSS-15 设计系统里讲的做法，组件库等于把这套做法做成了现成产品。
3. **按需引入层**：现代组件库都支持按需引入，只打包用到的组件，不用的不进最终产物。Vite 项目里通常靠插件自动做这件事（Element Plus 用 `unplugin-vue-components`，Ant Design 和 MUI 靠 ES 模块的摇树优化），不用手工一个一个写引入路径，但要知道它存在，否则会误以为“装了库就等于全量打包”。

四个库的区别不在原理，而在三点：第一，配对框架不同（Vue 还是 React）；第二，设计风格不同（Element Plus 偏中后台、Ant Design 偏企业级、Vuetify 和 MUI 都走 Material Design，但细节不同）；第三，定制方式不同（CSS 变量、主题配置对象、Sass 变量，各库不一样，第 9 节逐个讲）。

## 7. 架构说明

本篇主示例的工程结构如下，文件路径和第 11 节的配置文件一一对应：

```text
ui-demo/
  package.json
  vite.config.js
  index.html
  src/
    main.js
    App.vue
    assets/
      main.css
```

数据流向很简单，一句话讲清：页面上的表单和表格都由 `App.vue` 里的响应式数据驱动，点“新增”把表单数据推进数组，点“删除”把对应行从数组里去掉，表格自动跟着变，不需要手工操作 DOM。四个库的小片段也都遵循这个模式：状态在组件里，界面只是状态的显示。

四个库不要混进同一个项目，原因有三点：第一，样式会互相覆盖，两个库的按钮、表格样式可能打架；第二，打包体积翻倍，用户要下载两套组件代码；第三，出问题时很难定位是哪个库的样式在起作用。选型对照在第 9 节最后，选定一个就用到底。

## 8. 操作前检查

动手前逐项核对，全部通过再开始：

1. `node -v` 输出 v20 以上，`npm -v` 能输出版本号。
2. `npm create vite@latest ui-demo -- --template vue` 能新建项目（先不要装组件库，空项目能跑起来再装）。
3. 进项目目录跑 `npm install` 和 `npm run dev`，浏览器能打开 Vite 的默认欢迎页，说明脚手架本身没问题。
4. 确认自己用的是 Vue 还是 React：主示例是 Vue，如果你的项目是 React，直接看 Ant Design 或 MUI 两节，主示例的 Vue 代码不要往 React 项目里复制。

## 9. 逐步操作

### 9.1 Element Plus（配 Vue）

安装命令：

```bash
npm install element-plus
```

基本用法分三步。第一步，在 `main.js` 里全局注册（第 11 节有完整文件），也可以按需引入，但初学先用全局注册，全部组件都能直接用，跑通了再研究按需引入。第二步，在模板里直接写组件名，比如 `el-button`、`el-form`、`el-table`，属性用 `:` 绑定，事件用 `@` 监听，和普通 Vue 组件完全一样。第三步，表单校验用 `rules` 属性配规则对象，表格分页用 `el-pagination` 配 `current-page`、`page-size`、`total`，第 10 节的主示例就是这么写的。

主题定制有两种办法，推荐第一种：

1. **CSS 变量覆盖**：Element Plus 把主色、圆角等都暴露成 `--el-color-primary` 这样的 CSS 变量，在自己的样式文件里重新赋值即可，只影响本项目，不用改库的源码。
2. **Sass 变量定制**：在构建时改 Sass 变量，适合要深度定制整套色板的情况，需要配 Sass，步骤比第一种多，初学不用。

暗色模式：Element Plus 提供暗色变量文件，引入后配合一个切换用的类名或变量就能切换，第 10 节的示例没有做暗色切换，做法是给根元素加暗色类并引入暗色变量，具体变量名以官网文档为准，不要凭记忆拼。

### 9.2 Ant Design（配 React）

安装命令（React 版）：

```bash
npm install antd
```

注意包名：React 版的包名就是 `antd`，Vue 版的包名是 `ant-design-vue`，两个不要装混。React 版要求 React 18 以上，装之前先看自己项目的 React 版本。

基本用法：从 `antd` 里按名引入组件，比如 `Button`、`Form`、`Table`，用法和普通 React 组件一样，属性用驼峰命名。主题定制用 `ConfigProvider` 包裹应用，在 `theme` 属性里传设计令牌，比如改主色就是改 `token.colorPrimary`，不用写全局 CSS 覆盖。Ant Design 的组件数量最多，表格、表单、日期选择、上传这些企业级场景基本都有现成的，代价是包体积相对大，小项目要评估一下。

Ant Design 也有 Vue 版，但要提醒一句：它的最新稳定版停在 4.2.6（2024-11-11），截至 2026-10-28 的公开对照里没有更新的稳定版。新项目用 Vue 时，优先在 Element Plus 和 Vuetify 里选，不要因为“Ant Design 名气大”就默认装 Vue 版。

### 9.3 Vuetify（配 Vue）

安装命令：

```bash
npm install vuetify
```

Vuetify 是 Material Design 风格的 Vue 框架，特点是自带布局系统：`v-app` 包裹整个应用，`v-app-bar` 做顶栏，`v-navigation-drawer` 做侧栏，`v-main` 放主内容，布局的偏移、响应式都由框架处理，不用自己写 CSS 算宽度。

基本用法：组件名都以 `v-` 开头，比如 `v-btn`、`v-text-field`、`v-data-table`。主题定制在创建 Vuetify 实例时传 `theme` 配置，改主色、改暗色模式都在这里配，暗色模式是官方支持的配置项，不是靠自己写两套样式。Vuetify 4 是当前主线，老项目留在 3.x 可以，但新项目直接用 4.x，不要在 3.x 和 4.x 的写法之间混用。

### 9.4 MUI（配 React）

安装命令：

```bash
npm install @mui/material @emotion/react @emotion/styled
```

注意要同时装三个包：`@mui/material` 是组件本身，`@emotion/react` 和 `@emotion/styled` 是它的样式引擎，缺了后两个，组件渲染会报错，这是新手最常踩的坑之一。

基本用法：从 `@mui/material` 里按名引入组件，比如 `Button`、`TextField`、`Table`，样式调整主要用 `sx` 属性，相当于在组件上直接写样式对象。主题定制用 `ThemeProvider` 包裹应用，在 `createTheme` 里改调色板、字号、圆角，暗色模式用 `palette.mode` 切换。MUI 走的是 Material Design，但和 Vuetify 的 Material 实现不是同一套，不要把两个库的组件混进一个项目。

### 9.5 选型对照

| 维度 | Element Plus | Ant Design（React） | Vuetify | MUI |
| --- | --- | --- | --- | --- |
| 配对框架 | Vue 3 | React | Vue 3 | React |
| 设计风格 | 中后台、简洁 | 企业级、组件最全 | Material Design、布局系统强 | Material Design、定制灵活 |
| 主题定制 | CSS 变量覆盖最常用 | ConfigProvider 的 token | 创建实例时的 theme 配置 | ThemeProvider 的 createTheme |
| 中文文档情况 | 中文文档齐全，例子多 | 中文文档齐全，例子多 | 英文文档为主，中文资料相对少 | 英文文档为主，中文资料相对少 |
| 适合场景 | Vue 后台、数据录入页 | React 企业级后台、复杂表格表单 | Vue 项目、想要 Material 风格和完整布局 | React 项目、想要 Material 风格和细粒度定制 |

选型顺序建议：先看框架（Vue 还是 React），这一步就排掉一半；再看项目类型（后台管理页优先 Element Plus 或 Ant Design，面向用户的产品页再看设计风格）；最后看团队语言（中文文档和例子多的库，上手和排错都更快）。如果项目只是静态展示页，四个库都不用选，直接用 HTML + CSS，这是最省事的答案。

## 10. 完整代码

### 10.1 主示例：Element Plus 完整页面（按钮、表单、表格齐全）

文件存放路径：`src/App.vue`。页面包含三部分：顶部两个按钮（新增、清空筛选），中间一个新增商品表单（名称、价格、分类），下面一个商品表格（名称、价格、分类、操作列的删除按钮）加分页。数据存在组件的响应式变量里，新增推进数组，删除去掉对应行，分页只切显示范围，不改原数据。

```vue
<template>
  <div class="page">
    <h1>商品管理</h1>
    <div class="actions">
      <el-button type="primary" @click="showForm = true">新增商品</el-button>
      <el-button @click="resetFilter">清空筛选</el-button>
      <el-input v-model="keyword" placeholder="按名称筛选" class="search" clearable />
    </div>
    <el-form v-if="showForm" :model="form" :rules="rules" ref="formRef" label-width="80px" class="form">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入商品名称" />
      </el-form-item>
      <el-form-item label="价格" prop="price">
        <el-input-number v-model="form.price" :min="1" />
      </el-form-item>
      <el-form-item label="分类" prop="category">
        <el-select v-model="form.category" placeholder="请选择分类">
          <el-option label="文具" value="文具" />
          <el-option label="数码" value="数码" />
          <el-option label="家居" value="家居" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submitForm">保存</el-button>
        <el-button @click="showForm = false">取消</el-button>
      </el-form-item>
    </el-form>
    <el-table :data="pageItems" border class="table">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="price" label="价格" />
      <el-table-column prop="category" label="分类" />
      <el-table-column label="操作">
        <template #default="scope">
          <el-button type="danger" size="small" @click="removeItem(scope.row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="filteredItems.length"
      layout="prev, pager, next, total"
      class="pager"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'

const products = ref([
  { id: 1, name: '笔记本', price: 12, category: '文具' },
  { id: 2, name: '鼠标', price: 59, category: '数码' },
  { id: 3, name: '水杯', price: 25, category: '家居' },
  { id: 4, name: '钢笔', price: 38, category: '文具' },
  { id: 5, name: '键盘', price: 129, category: '数码' },
])
const keyword = ref('')
const showForm = ref(false)
const currentPage = ref(1)
const pageSize = ref(2)
const formRef = ref(null)
const form = reactive({ name: '', price: 1, category: '' })
const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}
const filteredItems = computed(function () {
  const key = keyword.value.trim()
  const matched = []
  products.value.forEach(function (item) {
    const hit = key === '' || item.name.indexOf(key) !== -1
    if (hit) {
      matched.push(item)
    }
  })
  return matched
})
const pageItems = computed(function () {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})
function resetFilter() {
  keyword.value = ''
  currentPage.value = 1
}
function submitForm() {
  formRef.value.validate(function (valid) {
    if (valid) {
      const nextId = products.value.length + 1
      products.value.push({ id: nextId, name: form.name, price: form.price, category: form.category })
      form.name = ''
      form.price = 1
      form.category = ''
      showForm.value = false
    }
  })
}
function removeItem(id) {
  const kept = []
  products.value.forEach(function (item) {
    if (item.id !== id) {
      kept.push(item)
    }
  })
  products.value = kept
}
</script>

<style>
.page {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}
.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.search {
  width: 220px;
}
.form {
  margin-bottom: 16px;
}
.table {
  width: 100%;
}
.pager {
  margin-top: 16px;
}
</style>
```

注意上面示例里有意避开的写法：表单校验失败时不推进数组，删除后不重置页码到第一页之外的处理在第 15 节讲；价格用 `el-input-number` 的最小值限制，不用手写判断。

### 10.2 Ant Design 小片段（React，按钮 + 表单 + 表格）

文件存放路径：`src/App.jsx`（片段，只给关键部分，完整工程结构见第 11 节的 React 对照说明）。这个片段和主示例是两个独立项目，不要把两个片段拼进同一个文件。

```jsx
import { Button, Form, Input, Table } from 'antd'

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '价格', dataIndex: 'price', key: 'price' },
  { title: '分类', dataIndex: 'category', key: 'category' },
]

const data = [
  { key: '1', name: '笔记本', price: 12, category: '文具' },
  { key: '2', name: '鼠标', price: 59, category: '数码' },
]

export default function App() {
  return (
    <div>
      <Form layout="inline">
        <Form.Item label="名称" name="name">
          <Input placeholder="请输入商品名称" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">搜索</Button>
        </Form.Item>
      </Form>
      <Table columns={columns} dataSource={data} />
    </div>
  )
}
```

### 10.3 Vuetify 小片段（Vue，布局 + 按钮 + 表格）

文件存放路径：`src/App.vue`（片段，Vuetify 项目的入口配置见第 11 节说明）。注意 Vuetify 的组件名都以 `v-` 开头，表格组件叫 `v-data-table`，表头用 `headers` 数组配，数据用 `items` 数组配。

```vue
<template>
  <v-app>
    <v-app-bar title="商品管理" />
    <v-main>
      <v-container>
        <v-btn color="primary" @click="showForm = true">新增商品</v-btn>
        <v-data-table :headers="headers" :items="items" />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from 'vue'

const showForm = ref(false)
const headers = [
  { title: '名称', key: 'name' },
  { title: '价格', key: 'price' },
  { title: '分类', key: 'category' },
]
const items = [
  { name: '笔记本', price: 12, category: '文具' },
  { name: '鼠标', price: 59, category: '数码' },
]
</script>
```

### 10.4 MUI 小片段（React，按钮 + 表单 + 表格）

文件存放路径：`src/App.jsx`（片段）。MUI 的样式调整主要用 `sx` 属性，表格由 `Table`、`TableHead`、`TableBody`、`TableRow`、`TableCell` 一组组件拼成，不是一整个现成表格组件，这一点和 Ant Design 的 `Table` 不同。

```jsx
import { Button, TextField, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material'

const rows = [
  { name: '笔记本', price: 12, category: '文具' },
  { name: '鼠标', price: 59, category: '数码' },
]

export default function App() {
  return (
    <div>
      <TextField label="商品名称" variant="outlined" />
      <Button variant="contained" sx={{ marginLeft: 2 }}>搜索</Button>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>名称</TableCell>
            <TableCell>价格</TableCell>
            <TableCell>分类</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(function (row) {
            return (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.price}</TableCell>
                <TableCell>{row.category}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

## 11. 完整配置文件

主示例（Element Plus + Vue）的完整配置文件如下，每个文件都注明存放路径。其他三个库的工程配置和这个结构相同，只换包名和入口注册方式，差异在第 12 节说明。

文件存放路径：`package.json`（项目根目录）。

```json
{
  "name": "ui-demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "element-plus": "^2.14.7",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "vite": "^8.0.0"
  }
}
```

文件存放路径：`vite.config.js`（项目根目录）。

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})
```

文件存放路径：`src/main.js`（入口文件，负责注册 Element Plus 和挂载应用）。

```js
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
```

文件存放路径：`src/assets/main.css`（项目自己的样式，只放主题覆盖和页面间距，不要把组件库的样式抄进来）。

```css
:root {
  --el-color-primary: #2563eb;
}
```

其他三个库的入口差异只列关键行，不重复贴整份文件：Ant Design 的 React 入口不需要全局注册，直接在用到的文件里按名引入；Vuetify 的入口要创建 Vuetify 实例并用 `app.use(vuetify)` 注册，同时引入 Vuetify 的样式文件；MUI 的入口不需要全局注册，主题定制时才在入口包一层 `ThemeProvider`。

## 12. 每个关键配置项的解释

| 配置项 | 所在文件 | 含义 | 改错了会怎样 |
| --- | --- | --- | --- |
| `element-plus` 依赖 | package.json | 引入 Element Plus 组件库 | 漏了它，模板里的 `el-` 组件全部报未知组件 |
| `vue` 依赖 | package.json | Vue 框架本身 | 版本和组件库要求对不上时，装包会报对等依赖冲突 |
| `vite` 依赖 | package.json | 开发服务器和构建工具 | 漏了它，`npm run dev` 找不到命令 |
| `plugins: [vue()]` | vite.config.js | 让 Vite 能处理 Vue 单文件组件 | 漏了它，`.vue` 文件无法解析，启动直接报错 |
| `app.use(ElementPlus)` | src/main.js | 全局注册全部 Element Plus 组件 | 漏了它，模板里的组件名不认识，页面空白 |
| `import 'element-plus/dist/index.css'` | src/main.js | 引入组件库的样式 | 漏了它，组件有结构没样式，按钮表格都挤在一起 |
| `--el-color-primary` | src/assets/main.css | 覆盖 Element Plus 的主色变量 | 写错变量名则不生效，页面还是默认蓝色，但不会报错，要对照文档核对变量名 |
| Ant Design 的 `ConfigProvider` | React 入口 | 传主题 token 的容器 | 不包它也能跑，但主题改不了，只能用默认样式 |
| Vuetify 的 `createVuetify` | Vue 入口 | 创建 Vuetify 实例、配主题和暗色 | 漏了注册，`v-` 组件全部不认识 |
| MUI 的三个包 | package.json | 组件 + 两个样式引擎包 | 漏了 `@emotion/react` 或 `@emotion/styled`，MUI 组件渲染报错 |

## 13. 执行结果示例

在 `ui-demo` 目录依次跑下面命令，预期结果如下（版本号以实际装到的为准，命令本身不变）：

```text
npm run dev
VITE ready in 300 ms
Local: http://localhost:5173/
```

浏览器打开上面地址，预期看到的页面是：标题“商品管理”，顶部有“新增商品”“清空筛选”两个按钮和一个筛选输入框，点“新增商品”出现表单，填好名称、价格、选好分类点“保存”，表格里多出一行；表格默认每页显示 2 行，5 行数据分 3 页，点分页能切页；在筛选框输入“笔”，表格只剩“笔记本”和“钢笔”两行。

如果看到的是 Vite 默认欢迎页，说明 `src/App.vue` 没有被入口引用，检查 `main.js` 是不是引入了自己的 `App.vue`；如果页面空白且控制台报未知组件，检查 `main.js` 是不是漏了 `app.use(ElementPlus)` 或样式引入。

## 14. 成功验证

按下面五步验证，全部通过才算跑通，任何一步失败都先看第 16 节再改代码：

1. 开发服务器能启动：`npm run dev` 输出 Local 地址，浏览器能打开，没有红字报错。
2. 按钮和表单能操作：点“新增商品”出现表单，不填名称点“保存”会提示请填写名称，填好后点“保存”表格多出一行。
3. 表格和分页能操作：5 行数据默认分 3 页，点第 2 页看到第 3、4 行，点第 3 页看到第 5 行。
4. 筛选能操作：筛选框输入“笔”，表格只剩含“笔”的行，点“清空筛选”恢复全部。
5. 删除能操作：点某一行的“删除”，该行消失，总行数减一，分页总数跟着变。

构建验证单独做一步：跑 `npm run build`，能生成产物且没有报错，才算生产构建通过；只跑通开发服务器不算构建通过。主题验证单独做一步：改 `src/assets/main.css` 里的主色变量值，刷新页面看按钮和分页的激活态颜色跟着变，变了才算主题覆盖生效。

## 15. 常见错误

| 错误现象 | 原因 | 解决办法 |
| --- | --- | --- |
| 页面空白，控制台报未知组件 | 漏了全局注册或按需引入配置 | Vue 项目检查 `main.js` 有没有 `app.use(ElementPlus)`，Vuetify 检查有没有创建并注册实例 |
| 组件有结构没样式 | 漏了引入组件库的样式文件 | 检查入口有没有引入对应库的 CSS，Element Plus 是 `element-plus/dist/index.css` |
| MUI 组件渲染报错 | 只装了 `@mui/material`，漏了两个样式引擎包 | 补装 `@emotion/react` 和 `@emotion/styled`，三个包一起装 |
| Ant Design 的 Vue 版和 React 版混用 | 包名记混，`antd` 和 `ant-design-vue` 装错 | React 项目只装 `antd`，Vue 项目优先选 Element Plus 或 Vuetify，确认包名再装 |
| 改主题变量没效果 | 变量名写错，或样式文件引入顺序不对 | 对照官网文档核对变量名，自己的样式文件要在组件库样式之后引入 |
| 一个项目里混用两个 UI 库 | 两个库的样式互相覆盖 | 只留一个库，把另一个库的组件全部换掉，不要留着“先混着用” |
| 表单校验不生效 | 规则对象没配 `trigger`，或没给表单项配 `prop` | Element Plus 的表单项必须配 `prop` 字段名，规则里配 `trigger`，两者对不上就不校验 |
| 删除后分页显示空白页 | 删掉的是当前页最后一行，页码没回退 | 删除后如果当前页没数据了，把页码减一或回到第一页，这个逻辑要自己写，库不会自动处理 |
| 表格数据改了页面没变 | 直接改了数组下标或对象属性，响应式没触发 | 用数组的 `push`、过滤后整体赋值这类响应式写法，不要直接改下标 |
| 构建产物特别大 | 全量引入且没开按需引入或摇树优化 | 先确认是不是真的全量引入，再配按需引入插件，不要一上来就怀疑是库本身大 |

## 16. 故障排查

按“先看控制台、再看网络、最后看配置”的顺序排查，不要一上来就重装：

1. **控制台有红字**：红字会直接指出是哪个组件、哪个属性、哪个文件，先按红字改，改完刷新再看，不要同时改多处。
2. **组件不显示但没报错**：先看是不是条件渲染挡住了（比如表单的 `v-if` 一直是假），再看数据是不是空数组，空数组的表格本来就是空的。
3. **样式错乱**：先看是不是混用了两个库，再看自己的样式文件是不是把组件库的类名覆盖了，自己的类名不要和库的类名重名。
4. **装包报错**：先看 Node 版本是不是低于 20，再看是不是把 React 版和 Vue 版的包名装混了，最后再看网络和源的问题，不要反复删 `node_modules` 碰运气。
5. **版本对不上**：先看 `package.json` 里写的范围，再看锁文件里实际装到的号，两者不一致时以锁文件为准，升级要改范围并重新装包，不要只改一个地方。
6. **升级后某个组件行为变了**：先看该库的更新日志里有没有破坏性变更说明，再看是不是自己用了已废弃的属性，废弃属性要按文档换成新写法，不要靠猜。

## 17. 安全注意事项

1. **不要把密钥、令牌、内网地址写进前端代码**：组件库的代码最终会发到浏览器，任何人都能看到，不要把接口密钥、管理员账号写在组件属性或注释里。
2. **不要用 `v-html` 输出用户输入**：用户输入的内容如果当 HTML 插进页面，可能带脚本，表单和表格都用文本插值显示，不要用 `v-html`。
3. **表单校验只做前端校验是不够的**：前端校验是为了体验，后端必须再校验一次，前端校验通过不代表数据合法。
4. **依赖来源要可信**：只从 npm 官方源或公司可信源装包，不要从不明链接下载组件库的压缩包，装包后看一眼 `package.json` 里有没有多出不认识的包。
5. **锁文件要提交**：`package-lock.json` 要进版本控制，保证所有人装到同一批版本，避免“在我机器上能跑”这类问题。
6. **升级前先看更新日志**：大版本升级可能有破坏性变更，先在分支上升级验证，再合到主分支，不要直接在主分支上升级。

## 18. 回滚和恢复

回滚分两种情况，做法不同：

1. **刚装上库、页面还没写多少**：直接删掉依赖（`npm uninstall element-plus` 这类命令，换成实际装的包名），删掉入口的注册代码和样式引入，恢复到装库之前的状态，重新跑开发服务器验证页面回到空项目。
2. **已经写了很多页面、升级后出问题**：不要删库重写，先把 `package.json` 里的版本号改回升级前的号，重新装包，恢复到上一个能跑的版本；同时用版本控制回到升级前的提交，确认页面恢复正常后再重新评估升级。

恢复验证：回滚后跑 `npm run dev` 能打开页面，跑 `npm run build` 能生成产物，两步都通过才算恢复完成。回滚前如果已经提交过代码，先建一个新分支做回滚，不要直接在主分支上改。

## 19. 延伸阅读

按顺序读，不要跳着读，每一篇都是下一篇的前置知识：

1. FE-01 Vue 3：组件、路由、Pinia 的完整写法，主示例就是按这篇的模式写的。
2. FE-02 React：JSX、Hooks、状态管理的完整写法，Ant Design 和 MUI 两节都按这篇的模式写。
3. CSS-08 CSS 工程化：样式组织、全局样式和组件样式的分工，理解组件库的主题层要先看这篇。
4. CSS-15 完整 Design System：设计令牌、组件规范、文档与版本管理，组件库就是这套做法的产品化。
5. JS-04 npm、pnpm、Vite、前端工程化：装包、构建、ESLint、Prettier 的完整流程，四个库都要走这套流程。
6. UX-01 网站设计与用户体验：组件库解决“用什么组件”，这篇解决“页面怎么布局、怎么排版、怎么交互”，两者配合才是一个完整的页面。

## 20. 相关章节链接

- Vue 框架：[FE-01 Vue 3 完整教程](./01-vue.md)
- React 框架：[FE-02 React 完整教程](./02-react.md)
- 样式工程化：[CSS-08 CSS 工程化](../css/08-engineering.md)
- 设计系统：[CSS-15 完整 Design System](../css-frameworks/07-design-system.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[UX-01 网站设计与用户体验](../design/01-ux.md)
