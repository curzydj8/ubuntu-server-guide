# FE-02：React 完整教程

> 任务编号：FE-02（网站建设与部署实战指南 · 前端框架第 2 篇）
> 上一篇：[FE-01 Vue 3](./01-vue.md)；下一篇：[FE-03 Angular](./03-angular.md)。
> 本篇只讲 React：JSX、Hooks、组件、状态管理，以及一个商品列表完整实战。不讲 Vue、Angular、Svelte，不讲 Next.js（那是 FE-05 的范围）。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 说清 React 是什么、不是什么：它是一个 UI 库，不是自带路由、构建、数据请求的完整框架。
2. 用 JSX 写组件，正确使用 `props`、`children` 和组合，而不是把页面写成一个大文件。
3. 正确使用 `useState`、`useEffect`、`useRef`、`useMemo`，并遵守 Hooks 规则。
4. 用 Context + `useState` 管一个小应用的共享状态，并说清什么时候该换更重的状态方案。
5. 从零建一个 Vite + React 工程，跑通商品列表实战：分类筛选、搜索、加入购物车、购物车合计、刷新后购物车不丢。

## 2. 适用人群

适合已经读过 JS-01（变量、函数、对象、数组）和 JS-02（DOM、事件、异步），并且读过 JS-04（npm、Vite、ESLint、Prettier）的人。如果你还没有写过任何 JavaScript，先回 JS-01；如果你对 `import/export`、箭头函数、数组的 `filter/map` 不熟，先回 JS-01 和 JS-02，再来读本篇，否则 JSX 里的花括号和回调函数会处处绊住你。

## 3. 适用系统和版本

- 系统：Windows、macOS、Linux 都可以，命令以 Linux/macOS 的终端写法为准，Windows 用 PowerShell 时把 `npm run dev` 一样的命令直接敲进去即可，不用改。
- Node.js：需要 20.19 以上或 22.12 以上（这是 Vite 8 的要求，见 JS-04），本篇示例按 Node.js 20/22 这一代写。
- React：核查日期 **2026-11-03**，核查结果是：官方文档（react.dev/versions）给出的最新线为 **React 19.3**，其中 **19.3.0 于 2026-09-09 发布**；第三方版本追踪另显示 **19.3.1 于 2026-10-14 发布**。本篇安装用 `^19.3.0` 这个主版本范围，不把补丁号写死，安装时以 npm 当场查到的号为准。19.3 是一个小版本升级，没有破坏性变更，19.3 新稳定的 View Transitions 和 Fragment Refs 本篇示例用不到，只在这里提一句，不展开。
- Vite：主线 8.x，示例依赖用 `^8.0.0` 主版本范围，安装时以当场查到的版本为准。
- 浏览器：支持现代浏览器的任意最新版即可，示例不依赖任何实验性浏览器功能。

## 4. 使用前提

动手前先确认四件事，缺一项就先补，不要硬往下走：

1. Node.js 已装好，终端里 `node -v` 和 `npm -v` 都能打出版本号。
2. 会用终端进出目录，会用 `npm install` 装依赖（装包过程见 JS-04，本篇不重讲）。
3. 读过 JS-01 的对象、数组、箭头函数，读过 JS-02 的事件和模块概念。
4. 有一个能编辑代码的编辑器，能新建文件夹和文件，分清“项目根目录”和“src 目录”。

## 5. 所需资源

- 一台能联网的电脑：第一次 `npm install` 需要从 npm 仓库下载依赖，离线装不上。
- 不需要服务器、不需要数据库、不需要域名：本篇是纯前端实战，商品数据写在本地文件里。
- 不需要花钱：React、Vite、ESLint、Prettier 都是开源免费的。
- 时间：跟着第 9 节一步一步做，大约需要 1 到 2 小时，其中装包时间看网速。

## 6. 技术原理

### 6.1 React 到底是什么

React 是 Meta 维护的一个 JavaScript UI 库，只解决一件事：根据状态算出界面应该长什么样，然后高效地把变化更新到真实 DOM 上。它不自带路由、不自带构建工具、不自带数据请求约定，这些要另外选：路由用 React Router 之类的库，构建用 Vite，请求用 `fetch`。把 React 当成“什么都有”的框架，是最常见的误解。

### 6.2 组件与声明式界面

React 的基本单位是组件：一个函数，接收 `props`，返回一段描述界面的 JSX。你不写“找到这个元素、改它的文字、再改它的样式”这种一步步操作 DOM 的命令，而是写“状态是这样时，界面就该是这样”。状态一变，React 重新算一遍界面描述，再和上一次的结果比对，只把真正变了的部分更新到 DOM 上。这就是“声明式”：你声明结果，React 负责过程。

### 6.3 JSX 是什么

JSX 是写在 JavaScript 里的、长得像 HTML 的语法扩展，浏览器和 Node.js 都不直接认识它，必须经过 Vite 里的编译器转成普通的 JavaScript 才能运行。所以 JSX 里要遵守两条铁律：第一，花括号 `{}` 里是 JavaScript 表达式，可以放变量、函数调用、三元表达式，不能放 `if` 语句和 `for` 语句；第二，一个组件只能返回一个根节点，多个并列元素要用一个外层元素或空标签 `<>...</>` 包起来。

### 6.4 Hooks 是什么

Hooks 是 React 19 之前就有的、让函数组件拥有状态和副作用能力的函数，名字都以 `use` 开头。本篇用四个：`useState` 管状态，`useEffect` 管副作用（比如读写 localStorage、改页面标题），`useRef` 管一个“变了不触发重新渲染”的引用（比如让搜索框自动获得焦点），`useMemo` 管“只有依赖变了才重算”的计算结果（比如筛选后的商品列表、购物车合计）。Hooks 有两条规则，违反就会出难以定位的 bug：只在组件顶层调用，不写在条件、循环、嵌套函数里；只在 React 函数组件或自定义 Hook 里调用，不在普通函数里调用。

### 6.5 状态放在哪里

状态放得越近越好用：只在一个组件里用的状态，就放在这个组件里；多个组件都要用的状态，才往上提。本篇的购物车状态要被商品卡片（加购）和购物车面板（展示、删除、清空）同时用，所以提到它们的共同祖先，再用 Context 分发下去，不用一层层把 `props` 往下传。这就是“状态提升 + Context”：提升解决“放哪里”，Context 解决“怎么传下去”。

## 7. 架构说明

本篇实战的工程结构如下，路径都是相对项目根目录的：

| 文件 | 作用 |
| --- | --- |
| `package.json` | 项目名、脚本、依赖，见第 11 节 |
| `vite.config.js` | Vite 配置，启用 React 插件，见第 11 节 |
| `index.html` | 浏览器入口，里面有一个 `id="root"` 的空 `div`，见第 11 节 |
| `src/main.jsx` | React 入口：把 `App` 挂到 `root` 上 |
| `src/App.jsx` | 页面骨架：筛选状态、搜索框引用、商品列表、购物车面板的组合 |
| `src/data/products.js` | 商品数据和分类列表，不含 JSX，可直接做语法检查 |
| `src/utils/format.js` | 价格格式化工具函数，不含 JSX，可直接做语法检查 |
| `src/context/CartContext.jsx` | 购物车 Context：状态、加购、删除、清空、合计 |
| `src/components/FilterBar.jsx` | 搜索框和分类下拉框 |
| `src/components/ProductCard.jsx` | 一张商品卡片 |
| `src/components/ProductList.jsx` | 商品卡片列表 |
| `src/components/CartPanel.jsx` | 购物车面板 |

数据流向只有一条线，不绕弯：`App` 持有筛选状态（搜索词、分类），算出可见商品传给 `ProductList`；购物车状态放在 `CartContext` 里，`ProductCard` 的“加入购物车”按钮调用 Context 的 `add`，`CartPanel` 从同一个 Context 读购物车内容和合计。没有全局变量，没有跨文件直接改 DOM。

## 8. 操作前检查

开始前在终端里逐项打勾：

1. `node -v` 能打出 v20 或 v22 开头的版本号；如果低于 20.19，先升级 Node.js。
2. `npm -v` 能打出版本号。
3. 新建一个空文件夹当项目根目录，确认你知道它的完整路径，后面所有“存放路径”都是相对这个目录说的。
4. 确认网络能访问 npm 仓库；如果公司网络或家用网络装包很慢，先解决网络问题再开始，不要在装包中途反复中断。

## 9. 逐步操作

按顺序做，不要跳步：

1. 在项目根目录建工程骨架：先 `npm create vite@latest react-shop -- --template react`，再 `cd react-shop`。这一步只是脚手架命令，真正的文件内容以第 10 节和第 11 节为准，不要直接用脚手架自带的示例页交差。
2. 装依赖：`npm install`。装完检查 `node_modules` 和 `package-lock.json` 是否生成。
3. 按第 11 节写好 `package.json`、`vite.config.js`、`index.html`，注意 `index.html` 里必须有 `id="root"` 的 `div` 和指向 `/src/main.jsx` 的脚本。
4. 按第 10 节写 `src/data/products.js` 和 `src/utils/format.js`，先把数据和工具函数立住。
5. 按第 10 节写 `src/context/CartContext.jsx`，再写四个组件文件，最后写 `src/App.jsx` 和 `src/main.jsx`。
6. 检查第 12 节的配置项：`vite.config.js` 的插件、`package.json` 的脚本、`index.html` 的入口，三处对不上就先修，不要急着启动。
7. 启动开发服务器：`npm run dev`，按终端提示的地址（一般是 `http://localhost:5173/`）在浏览器打开。
8. 按第 14 节逐项验证：列表、筛选、搜索、加购、合计、刷新后购物车还在。
9. 构建生产版本：`npm run build`，再用 `npm run preview` 预览构建产物，确认构建产物也能正常打开。
10. 收尾：把不需要的脚手架示例文件删掉或改掉，不要让示例代码和实战代码混在一个项目里。

## 10. 完整代码

下面是实战的全部源文件，每个文件都注明存放路径，代码完整、无省略号。先写数据和工具，再写 Context 和组件，最后写 `App` 和入口。

存放路径：`src/data/products.js`

```js
export const products = [
  { id: 1, name: "无线鼠标", category: "外设", price: 12900 },
  { id: 2, name: "机械键盘", category: "外设", price: 29900 },
  { id: 3, name: "显示器支架", category: "外设", price: 19900 },
  { id: 4, name: "帆布背包", category: "出行", price: 15900 },
  { id: 5, name: "保温水杯", category: "出行", price: 8900 },
  { id: 6, name: "笔记本内胆包", category: "出行", price: 6900 },
];

export const categories = ["全部", "外设", "出行"];
```

存放路径：`src/utils/format.js`

```js
export function formatPrice(cents) {
  return "¥" + (cents / 100).toFixed(2);
}
```

存放路径：`src/context/CartContext.jsx`

```jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { products } from "../data/products.js";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem("react-shop-cart");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("react-shop-cart", JSON.stringify(items));
  }, [items]);

  const add = (id) => {
    setItems((prev) => {
      return { ...prev, [id]: (prev[id] || 0) + 1 };
    });
  };

  const remove = (id) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clear = () => {
    setItems({});
  };

  const value = useMemo(() => {
    const entries = Object.entries(items);
    const count = entries.reduce((sum, entry) => {
      return sum + entry[1];
    }, 0);
    const total = entries.reduce((sum, entry) => {
      const product = products.find((p) => {
        return p.id === Number(entry[0]);
      });
      return sum + (product ? product.price * entry[1] : 0);
    }, 0);
    return { items, add, remove, clear, count, total };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart 必须在 CartProvider 内使用");
  }
  return ctx;
}
```

存放路径：`src/components/FilterBar.jsx`

```jsx
export default function FilterBar({ query, onQueryChange, category, onCategoryChange, inputRef }) {
  return (
    <div>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
        }}
        placeholder="搜索商品名"
      />
      <select
        value={category}
        onChange={(e) => {
          onCategoryChange(e.target.value);
        }}
      >
        <option value="全部">全部</option>
        <option value="外设">外设</option>
        <option value="出行">出行</option>
      </select>
    </div>
  );
}
```

存放路径：`src/components/ProductCard.jsx`

```jsx
import { formatPrice } from "../utils/format.js";

export default function ProductCard({ product, onAdd }) {
  return (
    <article>
      <h3>{product.name}</h3>
      <p>{product.category}</p>
      <p>{formatPrice(product.price)}</p>
      <button
        onClick={() => {
          onAdd(product.id);
        }}
      >
        加入购物车
      </button>
    </article>
  );
}
```

存放路径：`src/components/ProductList.jsx`

```jsx
import ProductCard from "./ProductCard.jsx";

export default function ProductList({ products, onAdd }) {
  return (
    <section>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onAdd={onAdd} />
      ))}
    </section>
  );
}
```

存放路径：`src/components/CartPanel.jsx`

```jsx
import { products } from "../data/products.js";
import { formatPrice } from "../utils/format.js";
import { useCart } from "../context/CartContext.jsx";

export default function CartPanel() {
  const { items, remove, clear, count, total } = useCart();
  const entries = Object.entries(items);
  return (
    <aside>
      <h2>购物车（{count} 件）</h2>
      {entries.length === 0 ? (
        <p>购物车是空的，先选一件商品吧。</p>
      ) : (
        <ul>
          {entries.map((entry) => {
            const product = products.find((p) => {
              return p.id === Number(entry[0]);
            });
            if (!product) {
              return null;
            }
            return (
              <li key={product.id}>
                {product.name} × {entry[1]}，{formatPrice(product.price * entry[1])}
                <button
                  onClick={() => {
                    remove(product.id);
                  }}
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p>合计：{formatPrice(total)}</p>
      <button
        onClick={() => {
          clear();
        }}
      >
        清空购物车
      </button>
    </aside>
  );
}
```

存放路径：`src/App.jsx`

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { products } from "./data/products.js";
import { CartProvider, useCart } from "./context/CartContext.jsx";
import FilterBar from "./components/FilterBar.jsx";
import ProductList from "./components/ProductList.jsx";
import CartPanel from "./components/CartPanel.jsx";

function Shop() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const searchRef = useRef(null);
  const { add } = useCart();

  useEffect(() => {
    document.title = "商品列表 · React 实战";
    if (searchRef.current) {
      searchRef.current.focus();
    }
  }, []);

  const visible = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = category === "全部" || p.category === category;
      const matchQuery = p.name.includes(query);
      return matchCategory && matchQuery;
    });
  }, [query, category]);

  return (
    <div>
      <h1>商品列表</h1>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        inputRef={searchRef}
      />
      <ProductList products={visible} onAdd={add} />
      <CartPanel />
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <Shop />
    </CartProvider>
  );
}
```

存放路径：`src/main.jsx`

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

## 11. 完整配置文件

下面四个文件同样完整、无省略号，存放路径已注明。

存放路径：`package.json`（项目根目录）

```json
{
  "name": "react-shop",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^8.0.0"
  }
}
```

存放路径：`vite.config.js`（项目根目录）

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

存放路径：`index.html`（项目根目录）

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>商品列表 · React 实战</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

存放路径：`.gitignore`（项目根目录）

```text
node_modules
dist
```

## 12. 每个关键配置项的解释

| 配置项 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `package.json` 里的 `type: module` | 告诉 Node.js 这个项目用 ES 模块，`import` 才能正常用 | 漏了它，`vite.config.js` 的 `import` 可能报错 |
| `package.json` 里的 `scripts.dev` | `npm run dev` 实际跑的命令就是 `vite` | 写错命令，开发服务器起不来 |
| `package.json` 里的 `react` 与 `react-dom` | React 本体和浏览器渲染器，必须成对出现，版本号保持一致 | 只装一个，页面渲染会直接报错 |
| `vite.config.js` 里的 `plugins: [react()]` | 让 Vite 认识 JSX 并正确编译 | 漏了它，JSX 会被当成非法语法 |
| `vite.config.js` 里的 `server.port` | 开发服务器端口，本篇用 5173 | 端口被占用时 Vite 会自动换端口，以终端提示为准 |
| `index.html` 里的 `id="root"` | `main.jsx` 里 `getElementById("root")` 要找的挂载点 | 名字对不上，React 找不到挂载点，页面空白 |
| `index.html` 里的 `src="/src/main.jsx"` | 浏览器入口脚本，必须是模块脚本 | 路径写错，入口文件加载不到，页面空白 |

## 13. 执行结果示例

按第 9 节做完、开发服务器跑起来后，浏览器里应该看到下面这个结果：

- 页面标题是“商品列表”，下面依次是搜索框、分类下拉框、商品列表、购物车面板。
- 商品列表一共 6 件：外设 3 件（无线鼠标、机械键盘、显示器支架），出行 3 件（帆布背包、保温水杯、笔记本内胆包）。
- 购物车面板一开始显示“购物车（0 件）”和“购物车是空的，先选一件商品吧。”，合计 ¥0.00。
- 点“无线鼠标”的“加入购物车”两次，再点“保温水杯”一次，购物车应显示“购物车（3 件）”，合计 ¥129.00 × 2 + ¥89.00 = ¥347.00。
- 在搜索框输入“鼠标”，列表只剩无线鼠标；把分类切到“出行”，再清空搜索框，列表应只剩出行 3 件。
- 刷新页面后，购物车内容还在（因为写进了 localStorage），不是重新归零。

## 14. 成功验证

按下面五步验证，每一步都要亲手看到结果，不要只看终端没有报错就当通过：

1. `npm run dev` 后终端给出地址（一般是 `http://localhost:5173/`），浏览器打开能看到 6 件商品，标题和价格都对得上第 13 节。
2. 分类下拉框切到“外设”，列表只剩 3 件；切回“全部”，恢复 6 件。
3. 搜索框输入“键盘”，列表只剩机械键盘；清空搜索框，恢复 6 件；打开页面时搜索框应已自动获得焦点（光标在里面）。
4. 加购、删除、清空三个操作都试一遍：加购后件数和合计跟着变，删除后对应商品消失，清空后回到 0 件；刷新页面，购物车内容不丢。
5. `npm run build` 能成功产出 `dist` 目录，再用 `npm run preview` 打开预览地址，列表和购物车同样能用。

## 15. 常见错误

| 现象 | 原因 | 办法 |
| --- | --- | --- |
| 页面空白，控制台报找不到 `root` | `index.html` 里没有 `id="root"` 的 `div`，或名字拼错 | 对照第 11 节，把挂载点名字改回 `root` |
| JSX 报错，提示相邻元素必须包起来 | 一个组件返回了多个并列根节点 | 用一个外层 `div` 或空标签 `<>...</>` 包起来 |
| `useCart` 报错“必须在 CartProvider 内使用” | 用了 `useCart` 的组件没有被 `CartProvider` 包住 | 检查 `App` 的结构：`CartProvider` 必须包在 `Shop` 外层，不能反过来 |
| Hooks 报错，提示 Hooks 只能在顶层调用 | 把 `useState` 或 `useEffect` 写进了条件或循环里 | 把 Hooks 挪到组件函数的最顶层，条件判断放在 Hooks 之后 |
| 列表渲染警告“每个子元素需要唯一的 key” | `map` 出来的元素没有 `key`，或用了数组下标当 `key` | 用商品的 `id` 当 `key`，不要用下标 |
| 刷新后购物车丢了 | localStorage 的键名写错，或保存时抛错没处理 | 检查键名是不是 `react-shop-cart`，保存和读取都要包在 `try` 逻辑里（本篇读取已处理，写入在正常浏览器里不会抛错） |
| 改了代码页面没变 | 开发服务器没重启或浏览器缓存了旧页面 | 先硬刷新浏览器，再看终端有没有编译报错 |

## 16. 故障排查

按“先看控制台、再看终端、最后看文件”这个顺序排查，不要一上来就删 `node_modules`：

1. 先看浏览器控制台的第一条红色报错：报错里一般会直接写出文件名和行号，先定位到那一行。
2. 再看 `npm run dev` 的终端输出：Vite 的编译错误会写明是哪个文件的哪一行语法有问题，JSX 的括号、标签没闭合大多在这里现形。
3. 再核对三处最容易错的地方：`index.html` 的挂载点名字、`main.jsx` 的导入路径、`CartProvider` 有没有包住用 `useCart` 的组件。
4. 如果怀疑依赖装坏了，再做重装：删掉 `node_modules` 和 `package-lock.json`，重新 `npm install`，这是最后手段，不是第一步。
5. 如果是端口被占用，Vite 会在终端提示换了端口，以终端给出的新地址为准，不要死守 5173。

## 17. 安全注意事项

1. JSX 默认会转义插入的文本，所以商品名、搜索词这类用户输入直接放进 `{}` 里是安全的；不要为了“显示富文本”而用 `dangerouslySetInnerHTML`，一旦用了它，恶意输入就能直接执行脚本。
2. 价格、合计一律按商品数据里的 `price` 和数量算，不要相信页面上传来的价格字符串；本篇的合计就是按 `products` 里的价格乘数量算的，这一点不要改成“前端传什么价就按什么价算”。
3. localStorage 里只存购物车的商品 id 和数量，不要存密码、令牌、身份证号这类敏感信息；读 localStorage 一定要包 `try`，因为用户可能手动改坏里面的内容，`JSON.parse` 一抛错整个应用就白屏。
4. 不要把密钥、接口地址的私密参数写进前端代码：前端代码最终会原样发给浏览器，写进去就等于公开。
5. 依赖要及时升级：React、Vite 这类基础依赖出安全修复时，按第 18 节的回滚办法先在本地验证再升级，不要长期停在有已知漏洞的旧版本上。

## 18. 回滚和恢复

1. 代码回滚：如果项目用了 Git，`git diff` 先看改了什么，确认无误再 `git checkout -- <文件>` 恢复单个文件；没有 Git 时，改动前先把整个项目文件夹复制一份当备份。
2. 依赖回滚：如果升级 React 后页面出问题，把 `package.json` 里的 `react` 和 `react-dom` 版本号改回升级前的号，删掉 `node_modules` 和 `package-lock.json`，重新 `npm install`。
3. 数据恢复：购物车存在 localStorage 里，清空浏览器数据会丢购物车，但商品数据在 `src/data/products.js` 里，不会丢；丢了购物车让用户重新加购即可，不用动代码。
4. 构建回滚：如果 `npm run build` 的新产物有问题，先不要覆盖线上旧产物，用 `npm run preview` 在本地确认新产物没问题再发布。
5. 兜底：如果整个工程改乱了，按第 9 节和第 10 节、第 11 节重新建一个干净工程，把文件逐个复制过去，不要在乱掉的工程上继续打补丁。

## 19. 延伸阅读

- React 官方文档：react.dev，重点看“快速入门”“描述 UI”“添加交互”“管理 State”四章，版本以官网为准。
- Vite 官方文档：重点看“从零搭建”和“插件”两部分，理解 `vite.config.js` 的插件机制。
- JS-01、JS-02、JS-04：本篇的前提知识都在这三篇里，卡住了先回这三篇，不要在 React 篇里硬补 JavaScript 基础。
- FE-05 Next.js：如果你要做服务端渲染、路由、数据请求成套的方案，下一步看 FE-05，不要在本篇的纯 React 工程里硬拼路由和服务端逻辑。

## 20. 相关章节链接

- JavaScript 基础：[JS-01 JavaScript 基础完整教程](../javascript/01-basics.md)
- DOM 与异步：[JS-02 DOM、事件、异步完整教程](../javascript/02-dom-async.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化完整教程](../javascript/04-tooling.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[FE-03 Angular](./03-angular.md)
