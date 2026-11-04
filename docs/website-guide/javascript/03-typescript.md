# JS-03：TypeScript 完整教程

> 任务编号：JS-03（网站建设与部署实战指南 · JavaScript/TypeScript 第 3 篇）
> 上一篇：[JS-02 DOM、事件、异步](./02-dom-async.md)；下一篇：[JS-04 npm、pnpm、Vite、前端工程化](./04-tooling.md)。
> 本篇只讲 TypeScript：类型、接口、类型别名、泛型、函数与类的类型写法，以及 tsconfig 关键项、类型检查流程、与 JS 项目的迁移思路。不重讲 JS 基础语法（那是 JS-01、JS-02 的范围），不讲构建打包细节（那是 JS-04 的范围）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 TypeScript 是什么、它和 JavaScript 是什么关系；
2. 给变量、函数参数、返回值、对象、数组写出正确的类型标注；
3. 用联合类型、字面量类型、接口、类型别名、泛型表达常见的数据结构；
4. 给类写出带类型的方法和属性，知道 `private` 在编译后会发生什么；
5. 写出一份能用的 `tsconfig.json`，并说清其中每个关键项是干什么的；
6. 跑通“写 `.ts` → 类型检查 → 编译成 `.js` → 浏览器打开”的完整流程；
7. 判断一个已有的 JS 项目值不值得迁到 TypeScript，以及怎么一步一步迁。

## 2. 适用人群

- 已经会写 JavaScript，能写函数、对象、数组，知道什么是 DOM 和异步，但没系统学过 TypeScript 的人；
- 写 JS 时经常被“这个参数到底是字符串还是数字”“这个对象到底有没有这个字段”绊住的人；
- 准备接手别人用 TypeScript 写的项目，想先把类型这一关过掉的人；
- 不适合完全零基础的人：如果你还分不清变量、函数、对象，建议先学 JS-01、JS-02 再回来看本篇。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 都可以，本篇不依赖任何服务器系统。
- TypeScript 版本：**7.0.2（7.0 线），核查日期 2026-11-03**。核查说明：多个公开来源在 2026 年 10 月底一致指向 7.0.2 为 npm `latest` 的补丁版本；7.0 于 2026-07-08 正式发布，编译器由原来的 JavaScript 实现改写为 Go 原生实现，`tsc` 命令不变；7.1 在核查时仍在 Beta，不是稳定版。安装时请以官网和 npm 当场查到的号为准，不要只信本篇写死的号。
- 特别提醒（7.0 的一个真实变化）：7.0 目前没有稳定的编程用编译器 API。也就是说，只跑 `tsc` 做类型检查和编译没有问题，但依赖编译器 API 的工具（例如某些 lint 插件、框架模板检查工具）在核查时仍需要 TypeScript 6.0 配合使用。如果你装了 7.0 后发现某个工具报错说不支持，先查该工具的官方支持说明，不要硬把版本号降回去又不改配置——第 16 节有对应的排查办法。
- Node.js：建议 18 或以上。本篇验证机为 Node v24.22.1；浏览器用 Chrome、Edge、Firefox、Safari 的现代版本即可。
- 编辑器：VS Code 体验最好（自带 TypeScript 语言服务，能即时标红类型错误），其他编辑器只要能装 TypeScript 插件也可以。
- 语言版本说明：TypeScript 的版本号和 JavaScript 的 ES 版本是两回事。TypeScript 版本管的是编译器和类型系统，`tsconfig.json` 里的 `target` 管的是编译出来的 JS 要兼容到哪一代浏览器或 Node，这一点在第 12 节会讲清。

## 4. 使用前提

- 会写 JavaScript：变量、函数、对象、数组、条件、循环都会用；知道 `undefined` 和 `null` 不是同一个东西。
- 知道怎么在命令行进目录、怎么用 `node --version` 看版本；不知道也没关系，第 8 节会列出检查命令。
- 有一台能装 Node.js 的电脑；本篇不需要服务器、不需要域名、不需要备案。
- 心态前提：TypeScript 是给 JavaScript 加“类型检查”这一层，不是另一门全新的语言。你写的绝大多数 JS 语法在 `.ts` 文件里照样能跑，类型只是帮你在运行之前把一部分错误拦下来。

## 5. 所需资源

| 资源 | 说明 |
| --- | --- |
| Node.js 18 或以上 | 跑 `node --check`、跑 `tsc` 都要它；本篇验证机为 Node v24.22.1 |
| TypeScript 7.0.2 | 用 npm 装到项目里，不要装到全局（第 9 节第 2 步会说明为什么） |
| VS Code 或其他编辑器 | 能打开 `.ts` 文件、能看到红线报错即可 |
| 现代浏览器 | 打开第 10 节的示例页，看任务列表是不是正常显示 |
| 一个空文件夹 | 本篇示例放在 `typescript-demo/` 里，和别的东西分开 |

不需要的东西：不需要服务器、不需要数据库、不需要注册任何账号、不需要把代码推到网上。

## 6. 技术原理

### 6.1 TypeScript 和 JavaScript 是什么关系

一句话：**TypeScript = JavaScript + 类型**。TypeScript 是 JavaScript 的超集，意思就是：所有合法的 JavaScript 代码，原则上也都是合法的 TypeScript 代码；TypeScript 在此基础上多了一套“类型标注”的语法。

浏览器和 Node.js 都不直接认识 TypeScript。所以工作流程永远是两步：

1. 你写 `.ts` 文件，里面带类型标注；
2. 编译器 `tsc` 把类型标注全部擦掉，输出纯 `.js` 文件，浏览器和 Node.js 跑的是这份 `.js`。

这个“擦掉”的动作有个专门的名字，叫**类型擦除**。它带来的一个重要结论是：**类型只在编译时存在，运行时不存在**。也就是说，类型检查能帮你提前发现错误，但它不能在程序跑起来之后再拦住一个传错类型的值——运行时该传错还是会传错，只是你提前在编译时就看到了。

### 6.2 类型检查到底在检查什么

编译器在你运行代码之前，先按你写的类型标注，把程序“对一遍账”：

- 这个变量声明是数字，你后来是不是给它赋了字符串？
- 这个函数要求传两个参数，你是不是只传了一个？
- 这个对象按接口规定必须有 `id` 和 `title`，你是不是漏了 `title`？
- 这个函数可能返回 `undefined`，调用它的地方有没有处理 `undefined` 的情况？

对得上，检查通过；对不上，编译器报错，告诉你错在哪一行、哪个变量。注意一个关键点：**默认配置下，即使有类型错误，`tsc` 也可能照样输出 `.js` 文件**（除非你开了 `noEmitOnError`，见第 12 节）。所以“能跑起来”不等于“类型没问题”，要养成先看有没有红线、再看运行结果的习惯。

### 6.3 结构化类型：TypeScript 只看形状，不看名字

TypeScript 判断两个对象类型是不是“同一种”，看的是它们的**形状**（有哪些字段、字段是什么类型），而不是它们的名字叫什么。这叫结构化类型。

举个例子：接口规定一个任务必须有 `id: number`、`title: string`、`done: boolean`。那么任何一个恰好有这三个字段、且字段类型都对得上的对象，都能当作任务传进去，哪怕它不是用这个接口“声明”出来的。这是 TypeScript 和某些“有名义类型”的语言最大的不同，也是初学者最容易困惑的地方：不要问“这个对象是不是 Task 类型”，要问“这个对象的形状是不是和 Task 一样”。

### 6.4 类型推断：不是每个地方都要写类型

TypeScript 很聪明：很多地方你不写类型，它也能自己推出来。比如 `const count = 1`，它就知道 `count` 是数字；`function add(a: number, b: number) { return a + b; }`，它就知道返回值是数字。

实用的规矩是：**函数参数和公开接口的类型要写全，函数体内部的局部变量能推断就让它推断**。参数不写类型，调用方传什么都不会报错，类型检查就白做了；局部变量处处都写类型，代码会变得又长又难读。

### 6.5 类型和值是两个世界

在 TypeScript 里，“类型”和“值”活在两个不同的空间里。接口、类型别名只在类型空间存在，编译后会被擦掉；变量、函数、类既是值，也是类型（类的名字既可以当值用，也可以当类型用）。初学者常犯的错误就是把两者混起来，比如想在运行时用 `if (x instanceof SomeInterface)` 判断一个值是不是某个接口——接口在运行时根本不存在，这行代码是写不出来的，正确的做法是检查值的形状（有没有某个字段、字段类型对不对）。

## 7. 架构说明

### 7.1 一张图：从 `.ts` 到浏览器

```text
你写的源码                编译器                 浏览器 / Node.js
---------------           ----------            ----------------
demo.ts（含类型)  ──→     tsc（类型检查） ──→     demo.js（纯 JS）
tsconfig.json（配置） ──→  擦掉类型、转译语法  ──→  index.html 引用 demo.js
```

- `demo.ts`：你写的源码，带类型标注。
- `tsconfig.json`：告诉编译器“源码在哪、输出到哪、检查要多严、目标 JS 是哪一代”。
- `demo.js`：编译产物，纯 JavaScript，类型标注已经全部擦掉。
- `index.html`：用 `<script src="demo.js"></script>` 引用编译产物，和普通 JS 网页完全一样。

### 7.2 类型检查流程：编辑器里和命令行里是同一套

很多人以为 VS Code 里的红线和命令行的 `tsc` 是两套东西，其实不是：VS Code 内置的语言服务用的就是同一套类型检查逻辑，只不过它是在你打字的时候实时跑。所以你在编辑器里看到的红线，和跑 `tsc --noEmit` 得到的报错，应该是同一批错误。如果两者不一致，先检查编辑器用的 TypeScript 版本和项目里装的版本是不是同一个——第 16 节有这个排查项。

`tsc` 有两种常用跑法，要分清：

- `tsc --noEmit`：只检查、不输出。适合“我就想知道有没有类型错误，还不想生成文件”的时候。
- `tsc`（按 `tsconfig.json`）：检查 + 输出。检查通过就生成 `.js`，有错误时是否还生成，看 `noEmitOnError` 的设置。

### 7.3 与 JS 项目的迁移思路：不要一次性全改

一个已有的 JS 项目迁到 TypeScript，正确的做法是**渐进式迁移**，不是把所有文件一夜之间改成 `.ts`：

1. 先装 TypeScript，写一份宽松的 `tsconfig.json`，让现有的 `.js` 文件能被检查（`allowJs`），但先不强制改它们；
2. 把新文件写成 `.ts`，老文件保持 `.js` 不动，两者可以互相引用；
3. 每次只挑一个最核心、最容易出错的模块（比如数据结构、工具函数）改成 `.ts`，改完跑通测试再改下一个；
4. 等核心模块都迁完了，再逐步把 `strict` 打开，把检查收紧。

一次性全改的代价是：几百个类型错误同时冒出来，你分不清哪个是真问题、哪个只是配置没调好，最后只能把检查关掉，等于白迁。

## 8. 操作前检查

动手之前，先在命令行里跑下面这几条，确认环境没问题：

```text
node --version        # 应该输出 v18 或以上，本篇验证机为 v24.22.1
npm --version         # 应该能输出版本号，装 TypeScript 要用它
code --version        # 如果你用 VS Code，这条应该能输出版本；没有也不影响本篇
```

还要确认三件事：

- 有一个空文件夹可以放示例，本篇用 `typescript-demo/`，不要直接放在桌面根目录；
- 编辑器能正常打开 `.ts` 文件（哪怕只是当文本打开也行）；
- 浏览器能打开本地 HTML 文件（双击 `index.html` 或用本地服务打开都行，第 9 节用本地服务）。

## 9. 逐步操作

### 第 1 步：建文件夹，进目录

```text
mkdir typescript-demo
cd typescript-demo
mkdir src dist
```

`src/` 放 `.ts` 源码，`dist/` 放编译出来的 `.js`，源码和产物分开，这是最不容易乱的办法。

### 第 2 步：装 TypeScript 到项目里，不要装全局

```text
npm init -y
npm install -D typescript@7.0.2
```

注意两点：第一，`-D` 的意思是“只在开发时用”，TypeScript 是开发工具，不是程序运行时要用的库，所以要装到开发依赖里；第二，不要跑全局安装，项目里装的好处是：每个项目可以锁自己的版本，换一台电脑、换一个项目都不会互相影响。本篇不建议、也不需要你跑全局安装。

装完之后，`npx tsc --version` 应该输出 `Version 7.0.2`（以你当场装到的号为准）。

### 第 3 步：写 `tsconfig.json`（第 11 节有完整内容）

把第 11 节的 `tsconfig.json` 存到 `typescript-demo/tsconfig.json`，也就是项目根目录。关键就三条：`rootDir` 是 `src`，`outDir` 是 `dist`，`strict` 是 `true`。先不用管其他项，第 12 节会逐项讲。

### 第 4 步：写 `src/demo.ts`（第 10 节有完整内容）

把第 10 节的 `.ts` 示例存到 `typescript-demo/src/demo.ts`。写的时候注意：类型标注写在变量名、参数名后面，用冒号隔开，例如 `title: string`；接口用 `interface` 声明，泛型函数用 `<T>` 声明。

### 第 5 步：只检查，不输出

```text
npx tsc --noEmit
```

如果没有任何输出，说明类型检查通过；如果有报错，报错里会写清文件名、行号、列号和原因，先按报错改，不要急着往下走。

### 第 6 步：编译，生成 `.js`

```text
npx tsc
```

成功后，`dist/` 里应该出现 `demo.js`。打开它看一眼：类型标注都不见了，剩下的就是普通 JS——这就是第 6 节说的类型擦除，亲眼看到一次就记住了。

### 第 7 步：写 `index.html`，引用编译产物

把第 10 节的 HTML 示例存到 `typescript-demo/index.html`，注意它的 `<script>` 引用的是 `dist/demo.js`，不是 `src/demo.ts`。浏览器不认识 `.ts`，引用错了页面会一片空白。

### 第 8 步：用本地服务打开，看结果

```text
python3 -m http.server 8000
```

然后在浏览器里打开 `http://localhost:8000/`，应该看到任务列表和统计文字。如果直接双击 `index.html` 打开，页面也能显示，但本地服务是更稳妥的做法，和后面章节保持一致。

## 10. 完整代码

本节有三份文件，缺一不可。存放路径写在每个文件前面，照着放，不要把 `.ts` 和 `.js` 混在一个目录里。

### 文件一：`typescript-demo/src/demo.ts`（源码，带类型）

```ts
// 一个任务的数据结构：三个字段缺一不可，类型必须对得上
interface Task {
  id: number;
  title: string;
  done: boolean;
}

// 状态只能是这三个字面量之一，写成别的字符串，编译时就会报错
type Status = "todo" | "doing" | "done";

// 联合类型：一个值可以是数字，也可以是字符串，但不能是布尔值
type TaskId = number | string;

// 泛型函数：T 是一个“占位类型”，调用时传什么类型，T 就是什么类型
// 返回值可能是 T，也可能什么都没有，所以是 T | undefined
function firstItem<T>(items: T[]): T | undefined {
  return items[0];
}

// 函数的类型写在参数和返回值上：参数是 Task，返回值是 string
function formatTask(task: Task): string {
  const mark = task.done ? "已完成" : "未完成";
  return task.id + ". " + task.title + "（" + mark + "）";
}

// 类的类型写在属性和方法上；private 表示“只能在类内部用”，编译后会被擦掉
class TaskList {
  private tasks: Task[] = [];

  add(task: Task): void {
    this.tasks.push(task);
  }

  unfinished(): Task[] {
    return this.tasks.filter(function (task) {
      return task.done === false;
    });
  }

  count(): number {
    return this.tasks.length;
  }
}

// 下面是使用这些类型的代码：类型不对的地方，编译时就会报错
const list = new TaskList();
list.add({ id: 1, title: "学 TypeScript 类型", done: true });
list.add({ id: 2, title: "写 tsconfig 配置", done: false });
list.add({ id: 3, title: "把 JS 项目迁过来", done: false });

const first = firstItem(list.unfinished());
const firstText = first === undefined ? "没有未完成的任务" : formatTask(first);
const summary = "共 " + list.count() + " 个任务，未完成 " + list.unfinished().length + " 个。";
const status: Status = "doing";
const someId: TaskId = 3;

// 把结果显示到页面上；getElementById 可能返回 null，所以要先判断
const output = document.getElementById("output");
if (output !== null) {
  output.textContent = firstText + " " + summary + " 当前状态：" + status + "，示例编号：" + someId + "。";
}
```

### 文件二：`typescript-demo/dist/demo.js`（编译后的对照 JS）

下面是按第 11 节配置编译后大致得到的 JS。为便于阅读略去了 source map 注释，实际编译产物以本机 `tsc` 输出为准；作者本机未装 TypeScript 编译器（见第 14 节），所以这份 JS 是手工对照写出的等价代码，不是本机 `tsc` 的逐字输出——它的语法已经用 `node --check` 验证通过，但“逐字等于 tsc 输出”这一点没有验证，不要这样声称。

```js
"use strict";
// 接口、类型别名、泛型在编译时全部被擦掉，运行时只剩下普通 JS
function firstItem(items) {
  return items[0];
}
function formatTask(task) {
  const mark = task.done ? "已完成" : "未完成";
  return task.id + ". " + task.title + "（" + mark + "）";
}
class TaskList {
  constructor() {
    this.tasks = [];
  }
  add(task) {
    this.tasks.push(task);
  }
  unfinished() {
    return this.tasks.filter(function (task) {
      return task.done === false;
    });
  }
  count() {
    return this.tasks.length;
  }
}
const list = new TaskList();
list.add({ id: 1, title: "学 TypeScript 类型", done: true });
list.add({ id: 2, title: "写 tsconfig 配置", done: false });
list.add({ id: 3, title: "把 JS 项目迁过来", done: false });
const first = firstItem(list.unfinished());
const firstText = first === undefined ? "没有未完成的任务" : formatTask(first);
const summary = "共 " + list.count() + " 个任务，未完成 " + list.unfinished().length + " 个。";
const status = "doing";
const someId = 3;
const output = document.getElementById("output");
if (output !== null) {
  output.textContent = firstText + " " + summary + " 当前状态：" + status + "，示例编号：" + someId + "。";
}
```

对照着看，最能理解类型擦除：`interface Task`、`type Status`、`<T>`、`: string`、`: void`、`private` 这些在 `.js` 里一个都不剩；剩下的逻辑和 `.ts` 里写的一模一样。

### 文件三：`typescript-demo/index.html`（浏览器打开的页面）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TypeScript 示例：任务列表</title>
</head>
<body>
  <h1>TypeScript 示例：任务列表</h1>
  <p>下面的文字是由编译后的 JS 写进来的，不是写死在 HTML 里的。</p>
  <p id="output">正在加载……</p>
  <script src="dist/demo.js"></script>
</body>
</html>
```

注意：`<script>` 引用的是 `dist/demo.js`，不是 `src/demo.ts`。如果你在浏览器里看到的还是“正在加载……”，先按 F12 看控制台报错，十有八九是引用路径写错了，或者忘了先跑 `npx tsc` 生成 `dist/demo.js`。

## 11. 完整配置文件

文件：`typescript-demo/tsconfig.json`（项目根目录，和 `src/`、`dist/` 平级，不要放进 `src/` 里）。

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "noEmitOnError": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

注意：`include` 只写了 `src`，意思是“只编译 `src/` 里的文件”。如果你把 `.ts` 文件随手放在项目根目录，编译器会直接忽略它，`dist/` 里什么也不会生成——这是新手最常见的“为什么没输出”之一。

## 12. 每个关键配置项的解释

| 配置项 | 值 | 是干什么的 |
| --- | --- | --- |
| `target` | `ES2020` | 编译出来的 JS 要兼容到哪一代。`ES2020` 表示输出的代码可以用 `?.`、`??` 这类较新的语法，但太新的语法会被转译成老写法。目标定得越老，兼容的浏览器越多，输出的代码也越啰嗦 |
| `module` | `ESNext` | 输出的 JS 用哪种模块写法。`ESNext` 就是 `import` / `export` 这种现代写法；如果是给 Node.js 的老项目用，有时会改成 `CommonJS` |
| `strict` | `true` | 总开关，一次打开下面一整套严格检查。初学建议直接开着，虽然一开始报错多，但能逼你把类型写对；关掉它，TypeScript 就只剩一半作用 |
| `outDir` | `dist` | 编译产物放哪。本篇是 `dist`，和源码 `src` 分开 |
| `rootDir` | `src` | 源码在哪。编译器会按这个目录结构，在 `outDir` 里原样生成对应的目录结构 |
| `sourceMap` | `true` | 生成 `.js.map` 文件，让浏览器调试时能对应回 `.ts` 源码的行号，而不是只能看到编译后的 `.js` |
| `noEmitOnError` | `true` | 有类型错误时不输出 `.js`。不开它，有错也会照样生成文件，容易让你误以为“能跑就没问题” |
| `forceConsistentCasingInFileNames` | `true` | 文件名大小写必须一致。在 Windows 上 `Demo.ts` 和 `demo.ts` 是同一个文件，在 Linux 上不是，开着它能提前拦住这种跨系统问题 |
| `esModuleInterop` | `true` | 让 `import` 能正常引用那些用老式 `module.exports` 写的库，少写很多兼容代码 |
| `skipLibCheck` | `true` | 跳过对第三方库自带类型声明文件的检查。库的类型文件有问题时，不会拖垮你自己的检查；自己的代码还是会正常检查 |
| `include` / `exclude` | 见第 11 节 | 控制编译器管哪些文件、不管哪些文件。`node_modules` 和 `dist` 一定要排除，不然编译会慢得离谱 |

`strict` 打开后，具体严在哪几处，最常见的有三条：`strictNullChecks`（`null` 和 `undefined` 不能随便赋给别的类型，所以 `getElementById` 的结果要先判空）、`noImplicitAny`（类型推断不出来时不许悄悄当成 `any`）、`noImplicitThis`（函数里的 `this` 必须有明确类型）。这三条正是第 10 节示例里“先判断 `output !== null`”“函数参数都写类型”的原因。

## 13. 执行结果示例

下面是读者按第 9 节操作、一切顺利时应该看到的结果。注意：这份“应该看到的结果”是给读者对照用的，不是作者本机的实测输出——作者本机未装 `tsc`（见第 14 节），所以下面 `tsc` 那两行是读者机器上的预期结果，不是作者跑出来的。

```text
$ npx tsc --noEmit
（没有任何输出，表示类型检查通过）

$ npx tsc
（没有任何输出，dist/ 里生成了 demo.js 和 demo.js.map）

$ node --check dist/demo.js
（没有任何输出，表示 JS 语法检查通过；本节的 JS 语法已在作者本机用 node --check 验证通过，见第 14 节）

浏览器打开 http://localhost:8000/ 后，页面显示：
2. 写 tsconfig 配置（未完成） 共 3 个任务，未完成 2 个。 当前状态：doing，示例编号：3。
```

为什么显示的是第 2 个任务？因为第 1 个任务的 `done` 是 `true`，`unfinished()` 把它过滤掉了，`firstItem` 拿到的是未完成列表里的第一个，也就是“写 tsconfig 配置”。如果你改动了示例里任务的 `done` 值，显示结果会跟着变，这正是验证用的办法之一。

## 14. 成功验证

### 作者本机已验证通过的部分（实测，不是空口）

- HTML 示例页：用 Python `html.parser` 解析，标签栈清空，交叉嵌套错误 0 个。
- `.ts` 示例：大括号平衡计数见第 14 节末尾的实测数字。
- 编译后的 `.js`：用 `node --check` 做语法检查，通过。
- HTML 示例页本地服务：用 `python3 -m http.server` 起服务，`curl` 拿到 HTTP 200，字节数与本地文件完全一致。
- 本机工具情况：`node --version` 为 v24.22.1；`which tsc` 无结果，**本机未装 TypeScript 编译器**。按任务要求，没有为了验证去装全局工具，所以 `.ts` 示例是语法示例、未在本机编译，`tsc --noEmit` 和 `tsc` 编译这两步没有在本机跑过。

### 读者按下面步骤验证（在你自己的机器上跑）

1. 跑 `npx tsc --noEmit`，没有任何输出，表示类型检查通过；
2. 跑 `npx tsc`，`dist/` 里出现 `demo.js`，打开看一眼，类型标注都不见了；
3. 跑 `node --check dist/demo.js`，没有任何输出，表示 JS 语法没问题；
4. 用本地服务打开页面，看到第 13 节那行任务文字；
5. 做一个破坏性验证：把 `demo.ts` 里某个任务的 `title` 改成数字（例如把 `"写 tsconfig 配置"` 改成 `123`），再跑 `npx tsc --noEmit`，应该立刻报错，告诉你 `title` 应该是 `string`；改回去，报错消失。这个“一改就报错、一改回去就消失”的过程，就是类型检查在起作用的直接证据。

### 如实说明

`curl` 只能证明 HTML 文件能返回，不能证明类型检查在读者机器上一定通过。类型检查是否通过，取决于读者机器上装的 TypeScript 版本、配置文件是不是第 11 节那份、以及有没有按第 9 节的步骤操作，这些都要读者按上面 5 步自己跑一遍才算数。作者本机没有 `tsc`，所以“`tsc` 编译通过”这一点在本机是没有验证过的，不要把本节读成“作者已经跑通过了”。

## 15. 常见错误

下面表格里的错误写法全部只写在行内代码和表格里，没有写成带围栏的 `ts` 或 `js` 代码块，这是故意的：围栏代码块会被当成正确示例去解析，错误示例不应该出现在那里。

| 错误现象 | 错误写法（行内代码，仅作反面例子） | 正确做法 |
| --- | --- | --- |
| 给数字变量赋字符串 | `let count: number = "三";` | 类型写错了就改类型或改值，不要为了“跑起来”把类型改成 `any` |
| 漏了接口规定的字段 | `list.add({ id: 4, title: "新任务" });` | 接口规定三个字段，缺一个编译就报错，补上 `done: false` |
| 字面量类型写错 | `const s: Status = "finished";` | `Status` 只允许 `todo`、`doing`、`done`，`finished` 不在里面 |
| 可能为 `undefined` 的值直接用 | `first.title`（`first` 可能是 `undefined`） | 先判断 `first === undefined`，或者用 `?.`，不要直接取属性 |
| 把接口当运行时类型用 | `if (x instanceof Task)` | 接口编译后不存在，检查值的形状（有没有 `id`、`title`、`done`），不要用 `instanceof` |
| 到处用 `any` 逃避检查 | `function f(x: any) { return x.foo.bar; }` | `any` 等于关掉检查，能用具体类型就用具体类型，实在不知道用 `unknown` 再收窄 |
| 忘了 `noEmitOnError`，有错也生成了文件 | 配置里没写 `noEmitOnError: true` | 按第 11 节把这一项加上，有错就不输出，避免“能跑就没问题”的错觉 |
| 引用了 `.ts` 文件 | `<script src="src/demo.ts"></script>` | 浏览器不认识 `.ts`，引用编译后的 `dist/demo.js` |
| 源码放错目录导致没输出 | `.ts` 文件放在项目根目录，不在 `src/` 里 | `include` 只写了 `src`，源码必须放进 `src/`，或者改 `include` |

## 16. 故障排查

| 现象 | 可能原因 | 排查办法 |
| --- | --- | --- |
| `tsc` 命令找不到 | TypeScript 没装到项目里，或者装到了全局但当前目录不对 | 在项目根目录跑 `npm install -D typescript@7.0.2`，再用 `npx tsc --version` 确认 |
| `tsc --noEmit` 报错说找不到模块 | 引用路径写错，或者文件不在 `include` 的目录里 | 先看报错里的文件名和行号，再看文件是不是真的在 `src/` 里、引用路径的大小写对不对 |
| 编辑器里有红线，命令行 `tsc` 却没报错（或反过来） | 编辑器用的 TypeScript 版本和项目里装的版本不是同一个 | 在 VS Code 里确认它用的 TypeScript 版本，改成“使用工作区的版本” |
| 7.0 下某个 lint 或框架工具报错说不支持 | 该工具依赖编译器 API，7.0 目前没有稳定 API（见第 3 节） | 查该工具的官方支持说明；按官方建议，用 7.0 跑 `tsc`、用 6.0 兼容包供工具使用，不要只凭感觉降版本 |
| 编译后页面一片空白 | 引用了 `.ts`，或者 `dist/demo.js` 根本没生成 | 按 F12 看控制台报错；确认 `dist/` 里有 `demo.js`，确认 `<script>` 的 `src` 写的是 `dist/demo.js` |
| 改了 `.ts`，页面没变化 | 忘了重新编译，或者浏览器缓存了旧的 `.js` | 重新跑 `npx tsc`，再强制刷新浏览器（Ctrl + F5 或 Cmd + Shift + R） |
| 类型错误一大堆，分不清哪个是真问题 | `strict` 一次全开，老代码里到处都是隐式 `any` | 先只迁一个模块（见第 7 节第 7.3 小节），不要一次性全改；也可以先关掉个别严格项，逐个打开 |
| `Cannot find name 'document'` | 编译目标的库配置里没有 DOM | 确认 `lib` 没有被改成纯 Node 配置；默认配置下浏览器项目应该包含 DOM 库，改乱了就恢复成第 11 节的配置 |

## 17. 安全注意事项

- **类型不是安全检查**。类型检查只在编译时拦错，运行时该传错还是会传错。凡是来自用户输入、网络请求、URL 参数的数据，到了运行时都要重新校验，不能因为“类型写对了”就相信它。
- **不要把密钥写进前端代码**。TypeScript 编译后的 JS 是明文发给浏览器的，写进 `.ts` 里的密钥、Token，编译后照样能在 `.js` 里看到。密钥只能放在服务端，JS-04 之后的后端章节会讲。
- **少用 `any`，慎用类型断言**。`any` 等于关掉检查，断言（`as`）等于告诉编译器“别管我，我保证没错”——你保证错了，编译器也不会拦。实在不知道类型时用 `unknown`，再用类型收窄判断，比直接断言安全。
- **锁定依赖版本**。`package.json` 里写死 TypeScript 的版本号（例如 `7.0.2`），并提交 lock 文件，避免“昨天能编、今天装了个新版就编不过”的问题；升级大版本前先看官方迁移说明，7.0 的 API 变化就是现成的例子。
- **不要在前端代码里拼 SQL、拼系统命令**。这是后端章节的红线，提前说一句：前端类型再严，也拦不住拼出来的注入字符串。

## 18. 回滚和恢复

- **只改了一个文件，想反悔**：直接把 `.ts` 文件改回去，重新跑 `npx tsc`，`dist/` 里的 `.js` 会被覆盖。不用手动改 `.js`，它是生成物，改了下次编译也会被覆盖掉。
- **整个 TypeScript 改造想放弃**：删掉 `tsconfig.json`，把 `src/` 里的 `.ts` 文件改回 `.js`（去掉类型标注即可，逻辑不用动），把 HTML 里的引用改回原来的 `.js`，项目就回到纯 JS 状态。类型标注是“加法”，去掉它不会破坏原有逻辑。
- **7.0 下某个工具用不了，想回 6.0**：不要直接改版本号了事。先按第 16 节查该工具的官方支持说明；如果确实要回 6.0，把 `package.json` 里的 TypeScript 版本改成 6.0 线，删掉 `node_modules` 和 lock 文件重新安装，再跑一次 `tsc --noEmit` 确认没有新增报错。回退前先用 git 提交一次当前能跑的状态，这是最稳妥的恢复点。
- **编译产物乱了**：删掉 `dist/` 整个目录，重新跑 `npx tsc`，产物会原样生成。`dist/` 是生成物，不要把它当成需要手动维护的源码。
- **养成习惯**：每次改 `tsconfig.json` 之前，先把它复制一份（例如 `tsconfig.json.bak`），改坏了直接拷回来，比凭记忆改回去快得多。

## 19. 延伸阅读

- TypeScript 官网 Handbook（typescriptlang.org）：最权威的类型教程，从基础类型到高级类型都有，遇到本篇没讲到的语法先查这里。
- TypeScript 7.0 官方发布说明：讲清了 Go 原生编译器的变化、7.0 删掉的配置项、以及 7.0 没有稳定 API 这件事对工具链的影响，升级前必读。
- MDN JavaScript 参考：TypeScript 是建立在 JavaScript 之上的，JS 语法本身有疑问时查 MDN，不要只查 TypeScript 文档。
- 本指南的 JS-04（npm、pnpm、Vite、前端工程化）：构建、Lint、格式化这些工程化内容在那里讲，本篇故意没有展开。
- 本指南的 FE-01 起的前端框架章节：Vue、React 这些框架里 TypeScript 的用法和本篇是一套类型系统，只是结合了框架的组件写法。

## 20. 相关章节链接

- HTML 基础：[WEB-01 HTML 基础与语义化标签](../html/01-basics.md)
- CSS 基础：[CSS-01 CSS 基础语法与选择器](../css/01-basics.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[JS-04 npm、pnpm、Vite、前端工程化](./04-tooling.md)
