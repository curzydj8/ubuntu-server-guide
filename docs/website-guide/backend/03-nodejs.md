# BE-03：Node.js 框架完整教程

> 任务编号：BE-03（网站建设与部署实战指南 · 后端第 3 篇）
> 上一篇：[BE-02 Python 框架：Django、Flask、FastAPI](./02-python.md)；下一篇：[BE-04 Go 框架：Gin、Echo、Fiber、标准库](./04-go.md)。
> 本篇只讲 Node.js 框架：Express、NestJS、Fastify，各框架独立小节，最后有一节三框架选型对照。不讲 PHP、Python、Go、Java 框架，那是 BE-01、BE-02、BE-04、BE-05 的范围。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说出 Express、NestJS、Fastify 各自的定位、原理和适用场景，并能按需求在三者之间选一个；
2. 分别用三个框架各建一个最小可跑的项目，跑起来并用 curl 验证；
3. 用 Fastify 写一个完整的小应用：路由、中间件、JSON Schema 验证、错误处理、数据层分离齐全；
4. 给应用接上数据库访问层，知道内存数据层换成 PostgreSQL 时只换哪一个模块；
5. 把应用部署到 Ubuntu 服务器上：Nginx 反向代理加 systemd 常驻运行，并知道怎么回滚；
6. 说出每个框架最常见的坑，并能按第 16 节的表格自己排查。

框架模板的 20 项在本篇的落点：介绍与原理见第 6 节，同类对比见第 9.4 节，环境准备见第 4、8 节，安装与第一个项目见第 9 节，目录结构见第 7、10 节，配置逐项见第 12 节，核心语法与 API、常用组件、页面编写（本篇是 API 服务，页面编写对应的是 JSON 响应编写）见第 9、10 节，路由见第 9、10 节，数据与状态见第 10 节，API 连接见第 10、13 节，错误处理见第 10、15 节，性能与安全见第 17 节，构建发布见第 11、14 节，Ubuntu 部署见第 11、14 节，完整实战见第 10 节，常见问题见第 15、16 节。

## 2. 适用人群

本篇适合下面这些人：

- 读过 JS-01、JS-02，已经会写 JavaScript，想给网站加一个后端 API 的人；
- 想做管理后台、内容站、小程序或 App 的后端接口的人；
- 已经有一个前端页面（Vue、React 或纯 HTML），需要它能登录、存数据、调接口的人；
- 团队里负责选 Node.js 技术栈，需要一套能讲清楚的对比依据的人。

不适合只想做纯静态展示站的人：没有登录、没有写数据库需求的站，先看前端篇和架构篇的静态站落点，用不着后端框架。不适合还没学过 JavaScript 基础的人：先读 JS-01，再回来。

## 3. 适用系统和版本

- 操作系统：写作与部署示例以 Ubuntu 24.04 LTS 为准；第 11 节的 systemd 与 Nginx 路径按 Ubuntu/Debian 系写，其他发行版改路径即可，配置项本身不变。
- Node.js：推荐 22 LTS 或 24 LTS；最低要求 20.19 以上或 22.12 以上，这与 JS-04 对 Vite 8 的要求一致，不冲突。本机核查到的 Node.js 为 v24.22.1，npm 为 10.9.4。
- 三个框架的版本均为 2026-11-03 核查，来源为各项目 GitHub Releases 与公开版本对照，安装时以当场查到的版本为准，不要把某一个补丁号背下来：

| 框架 | 写作时核查到的最新稳定线 | 安装写法 | 最低 Node.js 要求 |
| --- | --- | --- | --- |
| Express | 5.3.0（2026-10-09 发布；4.x 线最新为 4.22.3，新项目用 5.x） | `^5.0.0` | 18 以上 |
| NestJS | 12.3.0（2026-10-27 发布；12 线） | `^12.0.0` | 20.19 以上或 22.12 以上 |
| Fastify | 5.12.8（2026-11-03 前后公开资料；5 线，6.x 只有 alpha 预览版，不要用于新项目） | `^5.0.0` | 20 以上 |

- 安装时当场核查版本的命令（在工程目录外也能跑，输出的就是当场最新版）：
- `npm view express version`、`npm view @nestjs/core version`、`npm view fastify version`，三条命令的输出与上表不一致时，以命令输出为准。
- TypeScript：NestJS 小节用 TypeScript，写作时主线为 7.x（JS-03 已讲过 7.0 的 Go 重写与 `tsc` 命令不变），NestJS 脚手架会自己装配套版本，不要手动混装大版本。

## 4. 使用前提

- 会写 JavaScript 基础：变量、函数、对象、数组、async 与 await、模块的 import 与 export（JS-01、JS-02 的内容）。
- 会用终端基本命令：cd、ls、mkdir、curl，知道当前在哪个目录下执行命令。
- 机器上已装 Node.js（版本符合第 3 节），`node -v` 与 `npm -v` 都能输出版本号。
- 知道 JSON 是什么：本篇的 API 全部用 JSON 收发请求与响应，不讲表单页面渲染。
- 数据库不是必需前提：第 10 节实战用内存数据层，机器上没有数据库也能跑完整流程；想接真实数据库时再按第 10.6 节换模块。

## 5. 所需资源

| 资源 | 用途 | 费用 |
| --- | --- | --- |
| Node.js 22 LTS 或 24 LTS | 运行三个框架的运行时 | 免费 |
| npm（随 Node.js 一起装） | 安装框架与依赖 | 免费 |
| 一个代码编辑器 | 写代码 | 免费 |
| curl | 在终端里调接口、验证结果 | 免费 |
| 一台 Ubuntu 服务器（部署时才需要） | 跑第 11、14 节的部署步骤 | 按服务器费用 |
| PostgreSQL（可选，部署后想持久化时才需要） | 把内存数据层换成真实数据库 | 免费 |

## 6. 技术原理

### 6.1 Node.js 本身在干什么

Node.js 是用 Chrome 的 V8 引擎在服务器上跑 JavaScript 的运行时。它是单线程跑你的 JS 代码，但 I/O（读文件、查数据库、等网络响应）是异步的：一个请求在等数据库时，线程不会卡住，可以先去处理下一个请求。所以 Node.js 适合 I/O 密集的 API 服务，不适合在请求处理里做重型 CPU 计算（例如大图压缩、视频转码），那种任务要交给单独的进程或服务。

一个 HTTP 请求在本篇三个框架里走的链路都一样：

| 步骤 | 发生什么 |
| --- | --- |
| 1. 收到请求 | Node.js 的 HTTP 服务收到请求，交给框架 |
| 2. 中间件 | 按注册顺序跑中间件：日志、跨域、解析请求体、鉴权 |
| 3. 路由匹配 | 按方法与路径找到对应的处理函数 |
| 4. 参数验证 | 校验路径参数、查询参数、请求体，不合格直接返回 400，不进业务逻辑 |
| 5. 业务逻辑 | 处理函数调用数据层，算出结果 |
| 6. 响应 | 按约定的 JSON 结构返回，错误走统一的错误处理 |

### 6.2 Express：最小核心加中间件

Express 只给三样东西：路由、中间件、响应工具。其他能力（跨域、限流、验证、鉴权）都靠你自己装中间件拼起来。它的心智模型就是一条中间件链：请求从第一个中间件走到最后一个，任何一个中间件都可以结束响应（例如鉴权失败返回 401），也可以调用 `next()` 放行到下一个。Express 5 相对 4 的主要变化是：路由处理函数支持返回 Promise，异步函数里抛出的错误会自动走到错误处理中间件，不用再手动 `next(err)`；通配符写法变了（见第 15 节）。

### 6.3 NestJS：带结构的 TypeScript 框架

NestJS 不是一个新的 HTTP 引擎，它是跑在 Express（默认）或 Fastify 之上的应用框架。它用 TypeScript 的装饰器与依赖注入把代码组织成三层：

| 概念 | 作用 | 对应文件 |
| --- | --- | --- |
| 模块（Module） | 把一组功能收在一起，声明它包含哪些控制器与提供者 | `app.module.ts` |
| 控制器（Controller） | 只负责接请求、调服务、返回响应，不写业务逻辑 | `tasks.controller.ts` |
| 提供者（Provider） | 真正干活的服务，例如数据访问、业务规则，可被注入 | `tasks.service.ts` |
| 装饰器 | 给类、方法、参数贴元数据，声明“这是一个控制器”“这个参数来自请求体” | `@Controller`、`@Get`、`@Body` |

依赖注入的意思是：控制器不自己 `new` 服务，而是声明“我需要一个 TasksService”，框架在启动时把实例造好传进来。好处是换实现、写测试时不用改控制器代码。NestJS 12 的包是 ESM 形态，CLI 也重做了 `nest upgrade` 命令，升级整套 `@nestjs/*` 包时优先用它。

### 6.4 Fastify：插件加 JSON Schema

Fastify 的两个核心设计是插件封装与 JSON Schema 驱动。插件封装的意思是：用 `register` 注册的插件只在自己的作用域里生效，不会污染整个应用，适合把路由、数据库连接按模块隔开。JSON Schema 驱动的意思是：你在路由上声明请求体与响应体的形状，Fastify 在启动时把它编译成快速的验证与序列化函数，请求体不合格直接返回 400，响应体里多余的字段会被序列化时过滤掉（这是特性，不是 bug，见第 15 节）。Fastify 内置 Pino 日志，默认日志就是结构化的 JSON，适合直接交给日志采集。

## 7. 架构说明

### 7.1 三个框架在分层里的位置

按 ARCH-01 的十层划分，本篇三个框架都处在 Web 层与后端层之间：

| 层 | 本篇框架负责的部分 |
| --- | --- |
| Web 层 | 接收 HTTP 请求、路由、返回响应（三个框架都做） |
| 后端层 | 业务逻辑、鉴权、数据访问的组织方式（三个框架各有自己的组织方式） |
| API 层 | 对外暴露的接口契约：路径、方法、请求体、响应体、状态码（三个框架都靠路由与验证来落实） |
| 数据层 | 不由框架自带，需要你自己接数据库或数据访问模块（第 10 节的做法） |

### 7.2 三个框架的目录结构对照

| 框架 | 最小项目目录 | 说明 |
| --- | --- | --- |
| Express | `package.json`、`app.js`、`routes/tasks.js` | 扁平，路由文件按资源拆分即可 |
| NestJS | `src/main.ts`、`src/app.module.ts`、`src/tasks/`（控制器、服务、模块、DTO 各一个文件） | 脚手架生成，目录即结构 |
| Fastify | `package.json`、`server.js`、`src/app.js`、`src/routes/tasks.js`、`src/store/tasks-store.js` | 路由用插件注册，数据层单独一个模块 |

### 7.3 请求流对照

以 `POST /api/tasks` 新增一条任务为例：

| 步骤 | Express | NestJS | Fastify |
| --- | --- | --- | --- |
| 解析请求体 | `express.json()` 中间件 | 内置解析，控制器用 `@Body()` 取 | 内置解析，路由用 `body` Schema 校验 |
| 校验 | 自己写校验代码或装验证中间件 | DTO 加验证装饰器，`ValidationPipe` 全局启用 | 路由上的 JSON Schema 自动校验 |
| 业务逻辑 | 路由处理函数里直接写，或抽成服务模块 | 控制器调注入的服务 | 路由处理函数调数据层模块 |
| 错误处理 | 四参数错误处理中间件 | 全局异常过滤器或内置的 HTTP 异常 | `setErrorHandler` 统一处理 |
| 响应 | `res.status(201).json(...)` | 返回对象，框架按状态码序列化 | `reply.code(201).send(...)` |

## 8. 操作前检查

在开始第 9 节之前，先跑下面这张表里的检查，全部通过再往下走：

| 检查项 | 命令（在家目录执行，普通用户，不用 sudo） | 通过标准 |
| --- | --- | --- |
| Node.js 版本够新 | `node -v` | 输出 v20.19 以上、v22.12 以上、v22 LTS 或 v24 LTS 之一 |
| npm 可用 | `npm -v` | 能输出版本号 |
| 3000 端口未被占用 | `ss -ltnp \| grep 3000` 或 `curl http://127.0.0.1:3000/health` | 前者无输出，或后者连接失败（说明没人占着） |
| 能访问 npm 仓库 | `npm view express version` | 能输出版本号 |
| 工作目录已建好 | `mkdir -p ~/node-demo && cd ~/node-demo` | `pwd` 显示该目录 |

端口被占用的处理见第 16 节；npm 访问失败先检查网络与代理，不要跳过这一步直接装包。

## 9. 逐步操作

### 9.1 Express：安装、第一个项目、跑起来

第 1 步，在家目录下建工程目录并初始化（普通用户，不用 sudo）：

```bash
mkdir -p ~/node-demo/express-demo
cd ~/node-demo/express-demo
npm init -y
npm install express@^5.0.0
```

第 2 步，写入口文件 `app.js`，存放在工程根目录：

```js
import express from 'express';

const app = express();
app.use(express.json());

const tasks = [];

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const title = req.body.title;
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title 必须是非空字符串' });
  }
  const task = { id: tasks.length + 1, title: title.trim(), done: false };
  tasks.push(task);
  return res.status(201).json(task);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(3000, () => {
  console.log('Express listening on http://127.0.0.1:3000');
});
```

第 3 步，跑起来并验证（另开一个终端，在工程目录外执行 curl）：

```bash
node app.js
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":"读 BE-03"}'
```

### 9.2 NestJS：安装、第一个项目、跑起来

第 1 步，装脚手架并生成项目（普通用户，不用 sudo；脚手架会自己装配套的 `@nestjs/*` 包，不要手动混装大版本）：

```bash
npm install -g @nestjs/cli@^12.0.0
nest new nest-demo
cd nest-demo
```

第 2 步，启动开发模式并验证：

```bash
npm run start:dev
curl http://127.0.0.1:3000
```

默认生成的项目在根路径返回 `Hello World!`，看到它就说明脚手架、编译、启动三步都通了。任务接口的写法见第 10.5 节的最小片段，模块、控制器、服务的分工见第 6.3 节。

### 9.3 Fastify：安装、第一个项目、跑起来

第 1 步，在家目录下建工程目录并初始化（普通用户，不用 sudo）：

```bash
mkdir -p ~/node-demo/fastify-demo
cd ~/node-demo/fastify-demo
npm init -y
npm install fastify@^5.0.0
```

第 2 步，写入口文件 `server.js`，存放在工程根目录：

```js
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => {
  return { ok: true };
});

await fastify.listen({ port: 3000, host: '127.0.0.1' });
```

第 3 步，跑起来并验证：

```bash
node server.js
curl http://127.0.0.1:3000/health
```

完整的任务应用（路由、验证、错误处理、数据层分离）见第 10 节，那是本篇的实战主体。

### 9.4 三框架选型对照

| 维度 | Express | NestJS | Fastify |
| --- | --- | --- | --- |
| 一句话定位 | 最小核心，自己拼中间件 | 带结构的企业级 TypeScript 框架 | 插件加 Schema 驱动的高性能框架 |
| 语言 | JavaScript 为主，也能写 TypeScript | TypeScript 为主 | JavaScript 与 TypeScript 都顺手 |
| 上手成本 | 最低，几十行就能跑 | 最高，要先理解模块、控制器、依赖注入 | 中等，要理解插件封装与 Schema |
| 类型安全 | 靠自己加验证与类型 | 装饰器加 DTO，类型安全最完整 | JSON Schema 在运行时校验，类型靠配套工具生成 |
| 生态 | 最大，中间件最多 | 官方包加社区包，覆盖鉴权、数据库、队列 | 官方插件体系，覆盖常用能力 |
| 性能取向 | 够用，不是最快 | 取决于底层适配器（Express 或 Fastify） | 内置 Schema 编译与 Pino 日志，取向最快 |
| 适合场景 | 小型 API、原型、中间件拼装灵活的项目 | 多人长期维护、模块多的中大型后台 | 对性能与结构化日志有要求、接口契约要严格的 API |
| 不适合场景 | 团队大了以后全靠约定，容易各写各的 | 只是两三个接口的小项目，会觉得重 | 团队只想最快跑起来、不想写 Schema 的项目 |
| 选它之前先确认 | 团队能不能守住自己定的目录与错误处理约定 | 团队愿不愿意用 TypeScript 与装饰器 | 团队愿不愿意给每个接口写 Schema |

选型结论：没有永远最好的一个。接口少、想最快跑起来，选 Express；多人长期维护、模块多，选 NestJS；接口契约要严格、日志要结构化，选 Fastify。ARCH-03 的决策树落到“管理后台”时，三者都可以，区别只在团队习惯与维护成本。

## 10. 完整代码

### 10.1 实战说明：以 Fastify 做完整小应用

实战做一个任务管理 API，功能清单：健康检查、任务列表、新增任务、查看单个任务、修改任务、删除任务、请求日志、统一错误处理、JSON Schema 验证。数据存在内存里，服务重启后数据清空，这是故意的：先把接口、验证、错误处理、数据层分离跑通，再按第 10.6 节换真实数据库。

目录结构（全部放在 `~/node-demo/fastify-demo` 工程目录下）：

```text
fastify-demo/
├── package.json
├── server.js
└── src/
    ├── app.js
    ├── routes/
    │   └── tasks.js
    └── store/
        └── tasks-store.js
```

### 10.2 package.json，存放在工程根目录

```json
{
  "name": "fastify-demo",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  }
}
```

### 10.3 server.js，存放在工程根目录

```js
import buildApp from './src/app.js';

const app = await buildApp();
const port = Number(process.env.PORT || 3000);
await app.listen({ port: port, host: '127.0.0.1' });
```

### 10.4 src/app.js，存放在工程的 src 目录

```js
import Fastify from 'fastify';
import tasksRoutes from './routes/tasks.js';

export default async function buildApp() {
  const fastify = Fastify({ logger: true });

  fastify.get('/health', async () => {
    return { ok: true };
  });

  await fastify.register(tasksRoutes, { prefix: '/api/tasks' });

  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: '请求数据不符合要求', details: error.validation });
    }
    fastify.log.error(error);
    return reply.code(error.statusCode || 500).send({ error: '服务器内部错误' });
  });

  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: '接口不存在' });
  });

  return fastify;
}
```

### 10.5 src/routes/tasks.js，存放在工程的 src/routes 目录

```js
import { listTasks, getTask, createTask, updateTask, deleteTask } from '../store/tasks-store.js';

const taskBodySchema = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1 },
    done: { type: 'boolean' }
  }
};

const taskResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    done: { type: 'boolean' }
  }
};

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer' }
  }
};

export default async function tasksRoutes(fastify, opts) {
  fastify.get('/', async () => {
    return listTasks();
  });

  fastify.get('/:id', {
    schema: {
      params: idParamsSchema,
      response: { 200: taskResponseSchema }
    }
  }, async (request, reply) => {
    const task = getTask(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: '任务不存在' });
    }
    return task;
  });

  fastify.post('/', {
    schema: {
      body: taskBodySchema,
      response: { 201: taskResponseSchema }
    }
  }, async (request, reply) => {
    const task = createTask(request.body.title, request.body.done);
    return reply.code(201).send(task);
  });

  fastify.put('/:id', {
    schema: {
      params: idParamsSchema,
      body: taskBodySchema,
      response: { 200: taskResponseSchema }
    }
  }, async (request, reply) => {
    const task = updateTask(request.params.id, request.body.title, request.body.done);
    if (!task) {
      return reply.code(404).send({ error: '任务不存在' });
    }
    return task;
  });

  fastify.delete('/:id', {
    schema: {
      params: idParamsSchema
    }
  }, async (request, reply) => {
    const removed = deleteTask(request.params.id);
    if (!removed) {
      return reply.code(404).send({ error: '任务不存在' });
    }
    return reply.code(204).send();
  });
}
```

### 10.6 src/store/tasks-store.js，存放在工程的 src/store 目录

```js
let nextId = 1;
const tasks = [];

export function listTasks() {
  return tasks.map((task) => ({ ...task }));
}

export function getTask(id) {
  return tasks.find((task) => task.id === id);
}

export function createTask(title, done) {
  const task = { id: nextId, title: title.trim(), done: done === true };
  nextId += 1;
  tasks.push(task);
  return { ...task };
}

export function updateTask(id, title, done) {
  const task = getTask(id);
  if (!task) {
    return null;
  }
  task.title = title.trim();
  if (typeof done === 'boolean') {
    task.done = done;
  }
  return { ...task };
}

export function deleteTask(id) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    return false;
  }
  tasks.splice(index, 1);
  return true;
}
```

换成 PostgreSQL 时只换这一个模块：把上面五个函数改成用 `pg` 包查数据库，路由文件一行都不用改。`pg` 的连接示例（只改数据层模块，路由不动）：

```js
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function listTasks() {
  const result = await pool.query('SELECT id, title, done FROM tasks ORDER BY id');
  return result.rows;
}
```

### 10.7 Express 最小项目片段（能跑通的最小结构）

`routes/tasks.js`，存放在 Express 工程的 routes 目录，入口 `app.js` 用 `app.use('/api/tasks', tasksRouter)` 挂载它：

```js
import express from 'express';

const router = express.Router();
const tasks = [];

router.get('/', (req, res) => {
  res.json(tasks);
});

router.post('/', (req, res) => {
  const title = req.body.title;
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title 必须是非空字符串' });
  }
  const task = { id: tasks.length + 1, title: title.trim(), done: false };
  tasks.push(task);
  return res.status(201).json(task);
});

export default router;
```

### 10.8 NestJS 最小项目片段（能跑通的最小结构）

下面五个文件放在 NestJS 脚手架生成的 `src` 目录下，模块、控制器、服务的分工见第 6.3 节。注意：TypeScript 的装饰器与类型语法不能直接用 `node --check` 检查，本节代码只做括号平衡与结构核对，不声称语法检查通过。

`src/tasks/create-task.dto.ts`：

```ts
export class CreateTaskDto {
  title: string;
  done?: boolean;
}
```

`src/tasks/tasks.service.ts`：

```ts
import { Injectable } from '@nestjs/common';

interface Task {
  id: number;
  title: string;
  done: boolean;
}

@Injectable()
export class TasksService {
  private tasks: Task[] = [];
  private nextId = 1;

  findAll(): Task[] {
    return this.tasks.map((task) => ({ ...task }));
  }

  create(title: string, done?: boolean): Task {
    const task: Task = { id: this.nextId, title: title.trim(), done: done === true };
    this.nextId += 1;
    this.tasks.push(task);
    return { ...task };
  }
}
```

`src/tasks/tasks.controller.ts`：

```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './create-task.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll() {
    return this.tasksService.findAll();
  }

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto.title, dto.done);
  }
}
```

`src/tasks/tasks.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService]
})
export class TasksModule {}
```

`src/app.module.ts`（在脚手架生成的同名文件里加上 TasksModule 的导入与注册）：

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
```

## 11. 完整配置文件

### 11.1 .env.example，存放在工程根目录

```text
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
DATABASE_URL=postgres://YOUR_DB_USER:YOUR_DB_PASSWORD@127.0.0.1:5432/YOUR_DB_NAME
JWT_SECRET=YOUR_JWT_SECRET_HERE
```

真实的 `.env` 按这个文件复制一份改名，填真实值，权限设为只有应用用户可读，不要提交到代码仓库。占位符里的 `YOUR_DB_PASSWORD` 与 `YOUR_JWT_SECRET_HERE` 不是真实口令，部署时必须换成自己生成的随机值。

### 11.2 Nginx 反向代理配置，存放在服务器的 /etc/nginx/sites-available/node-api

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用步骤（在服务器上用 sudo 执行）：把文件链接到 `sites-enabled`，跑 `nginx -t` 检查语法，通过后再 `systemctl reload nginx`。`api.example.com` 是示例域名，部署时换成自己的域名；HTTPS 的证书配置见指南里 HTTPS 相关章节，不要在本文件里手写证书路径之外的其他内容。

### 11.3 systemd 服务配置，存放在服务器的 /etc/systemd/system/node-api.service

```ini
[Unit]
Description=Node.js API service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/node-api
EnvironmentFile=/opt/node-api/.env
ExecStart=/usr/bin/node /opt/node-api/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用步骤（在服务器上用 sudo 执行）：把工程目录复制到 `/opt/node-api` 并装好依赖，`.env` 的属主与权限按第 11.1 节处理，然后跑 `systemctl daemon-reload`、`systemctl enable node-api`、`systemctl start node-api`，再用 `systemctl status node-api` 确认。

### 11.4 PM2 配置（systemd 的替代方案，二选一）

如果不想手写 systemd，也可以用 PM2 做进程守护。`ecosystem.config.js`，存放在工程根目录：

```js
module.exports = {
  apps: [
    {
      name: 'node-api',
      script: 'server.js',
      cwd: '/opt/node-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

启动命令：`pm2 start ecosystem.config.js`，开机自启再跑 `pm2 startup` 并按它输出的命令执行一次。systemd 与 PM2 二选一，不要两个同时管同一个进程，否则重启行为会打架。

## 12. 每个关键配置项的解释

| 配置项 | 在哪个文件 | 含义 | 改错了会怎样 |
| --- | --- | --- | --- |
| `PORT` | `.env` | 应用监听的端口，Nginx 的 `proxy_pass` 必须指向它 | Nginx 转发到空端口，返回 502 |
| `HOST` | `.env`、Fastify 的 `listen` | 应用绑定的地址；`127.0.0.1` 表示只接受本机与 Nginx 的连接 | 绑 `0.0.0.0` 会直接暴露到公网，绕过 Nginx |
| `NODE_ENV` | `.env` | 运行环境，`production` 时框架会关掉开发期的详细错误与调试输出 | 保持 `development` 上线，错误详情会泄露给客户端 |
| `DATABASE_URL` | `.env` | 数据库连接串，含用户名、口令、主机、端口、库名 | 口令或库名错，应用启动时连不上数据库 |
| `JWT_SECRET` | `.env` | 签发登录令牌的密钥，只存在服务器上 | 泄露后别人能伪造任意用户的登录令牌，必须立即更换 |
| `proxy_pass` | Nginx 配置 | Nginx 把请求转发到哪个本机地址与端口 | 与 `PORT` 不一致，返回 502 |
| `proxy_set_header Host` | Nginx 配置 | 转发时保留原始域名，后端日志与鉴权靠它识别站点 | 不设它，后端看到的主机名永远是 `127.0.0.1` |
| `X-Forwarded-Proto` | Nginx 配置 | 告诉后端原始请求是 http 还是 https | 不设它，后端可能误判协议，跳转链接出错 |
| `User` | systemd 配置 | 应用以哪个系统用户运行 | 用 root 跑，应用被攻破后影响整台机器 |
| `WorkingDirectory` | systemd 配置 | 应用启动时的工作目录，相对路径的模块与 `.env` 都以它为准 | 写错目录，启动时找不到入口文件 |
| `EnvironmentFile` | systemd 配置 | 启动时加载环境变量的文件路径 | 路径错，应用拿不到 `PORT` 与密钥，启动失败 |
| `Restart` | systemd 配置 | 进程退出后是否自动重启 | 不设它，应用一崩就一直停着，直到有人手动启动 |
| `instances` | PM2 配置 | 进程数；本篇示例用 1，单机小应用够用 | 设多了不配负载均衡，端口会冲突 |

## 13. 执行结果示例

下面是第 10 节实战跑起来后，读者按第 14 节验证时应看到的输出格式。注意：本篇没有在本机跑 `npm install` 与启动服务，所以下面的输出是示例输出，不是本机实测输出，实际输出里的任务 id 与日志时间以读者自己机器上的为准。

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

```text
{"ok":true}
```

新增任务：

```bash
curl -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":"读 BE-03"}'
```

```text
{"id":1,"title":"读 BE-03","done":false}
```

任务列表：

```bash
curl http://127.0.0.1:3000/api/tasks
```

```text
[{"id":1,"title":"读 BE-03","done":false}]
```

查看单个任务、修改任务、删除任务：

```bash
curl http://127.0.0.1:3000/api/tasks/1
curl -X PUT http://127.0.0.1:3000/api/tasks/1 -H 'Content-Type: application/json' -d '{"title":"读完 BE-03","done":true}'
curl -X DELETE http://127.0.0.1:3000/api/tasks/1
```

```text
{"id":1,"title":"读 BE-03","done":false}
{"id":1,"title":"读完 BE-03","done":true}
```

删除成功返回 204，没有响应体，上面第三条命令的输出为空是正常的。

校验失败的例子（标题为空字符串，Fastify 的 Schema 会在进业务逻辑之前拦下来）：

```bash
curl -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":""}'
```

```text
{"error":"请求数据不符合要求","details":[{"instancePath":"/title","schemaPath":"#/properties/title/minLength","keyword":"minLength","params":{"limit":1},"message":"must NOT have fewer than 1 characters"}]}
```

以空标题为例，`details` 里就是上面这一条校验错误；实际输出里的字段名与行数以读者自己机器上的为准；关键是状态码为 400，且任务没有被创建。

## 14. 成功验证

### 14.1 开发验证（读者在自己机器上按顺序做）

| 步骤 | 命令或操作 | 通过标准 |
| --- | --- | --- |
| 1. 版本 | `node -v`、`npm -v` | 版本符合第 3 节 |
| 2. 安装 | 在工程目录执行 `npm install` | 无报错结束，出现 `node_modules` |
| 3. 启动 | `npm start`（Fastify 实战）或 `node app.js`（Express）或 `npm run start:dev`（NestJS） | 终端出现监听日志，没有报错退出 |
| 4. 健康检查 | `curl http://127.0.0.1:3000/health` | 返回 `{"ok":true}` |
| 5. 新增与列表 | 按第 13 节的 curl 新增一条，再查列表 | 列表里出现刚新增的任务 |
| 6. 校验 | 新增一个空标题任务 | 返回 400，列表里没有多出任务 |
| 7. 单条与删除 | 查、改、删同一条任务 | 改后内容变化，删后查该 id 返回 404 |
| 8. 日志 | 看服务终端的日志 | 每次请求都有一行结构化日志 |

### 14.2 部署验证（读者在服务器上按顺序做）

| 步骤 | 命令或操作 | 通过标准 |
| --- | --- | --- |
| 1. 配置语法 | `nginx -t` | 输出语法正确 |
| 2. 服务状态 | `systemctl status node-api`（或 `pm2 status`） | 状态为运行中，没有反复重启 |
| 3. 本机直连 | 在服务器上 `curl http://127.0.0.1:3000/health` | 返回 `{"ok":true}` |
| 4. 域名访问 | 在自己电脑上 `curl https://你的域名/health` | 返回 `{"ok":true}`，且是经 Nginx 转发的 |
| 5. 日志 | `journalctl -u node-api -n 50`（或 `pm2 logs`） | 没有持续报错 |

第 3 步与第 4 步都要做：只做第 4 步时，分不清是应用问题还是 Nginx 问题；第 3 步通了、第 4 步不通，问题在 Nginx 或域名解析。

## 15. 常见错误

| 错误现象 | 原因 | 正确做法 |
| --- | --- | --- |
| 端口被占用，启动时报错地址已在使用 | 3000 端口已有别的进程 | 按第 16 节查占用进程，停掉它或改 `PORT` |
| `require` 在 ESM 工程里报错 | `package.json` 写了 `type: module`，却用了 `require` | 统一用 `import`，或把文件改成 `.cjs` 后缀 |
| `import` 在 CommonJS 工程里报错 | 没写 `type: module`，却用了 `import` | 在 `package.json` 里加上 `type: module`，或统一用 `require` |
| Express 5 里通配符路由不生效 | Express 5 的通配符写法变了，旧的星号写法不再按 4.x 的方式匹配 | 用新版文档里的通配符写法，不要把 4.x 的旧写法直接抄过来 |
| Express 异步函数里抛错导致进程退出 | 4.x 里异步错误不会自动走到错误处理中间件 | 用 5.x（异步错误自动进错误处理），或在 4.x 里手动把错误传给 `next` |
| NestJS 启动报依赖解析失败 | 控制器用的服务没有在模块的提供者里声明，或模块没有导入 | 检查模块的控制器与提供者列表，缺哪个补哪个 |
| NestJS 装饰器没生效 | 忘了在类上加装饰器，或 TypeScript 配置关了装饰器支持 | 用脚手架生成的配置，不要手动关掉装饰器相关选项 |
| Fastify 插件里注册的路由在别处找不到 | 插件封装作用域：插件内注册的东西只在该插件内可见 | 需要共享的用装饰器挂到实例上，或在同一个插件内注册 |
| Fastify 响应里少了字段 | 响应 Schema 只声明了部分字段，序列化时过滤了其余字段 | 把要返回的字段都写进响应 Schema，这是特性，不是 bug |
| 请求体明明发了，服务端拿到的是空对象 | 没装或没启用请求体解析 | Express 要 `express.json()`，Fastify 与 NestJS 内置解析但要确认内容类型是 `application/json` |
| 前端调接口报跨域错误 | 浏览器拦截了跨域请求，后端没配跨域 | 按需配置跨域允许的来源，不要图省事允许所有来源上线 |
| 环境变量读不到 | `.env` 文件没加载，或 systemd 的 `EnvironmentFile` 路径写错 | 开发时确认加载方式，部署时按第 14.2 节核对路径与权限 |
| 错误详情直接返回给客户端 | 错误处理里把堆栈原样发回去了 | 只返回通用错误信息，堆栈只写日志 |

上面表格里的错误写法只出现在行内代码与表格里，没有写成带围栏的代码块，验证脚本不会把它们当成正确示例。

## 16. 故障排查

| 现象 | 先查什么 | 命令或方法 |
| --- | --- | --- |
| 服务启动后立刻退出 | 启动日志的最后一行报错 | 看终端输出，或 `journalctl -u node-api -n 100` |
| 3000 端口被占用 | 占用进程 | `ss -ltnp \| grep 3000`，确认进程名与 pid 再决定停掉还是改端口 |
| 健康检查连不上 | 服务是否在跑、地址与端口对不对 | `systemctl status node-api`，再 `curl http://127.0.0.1:3000/health` |
| 经 Nginx 访问返回 502 | 应用是否在跑、`proxy_pass` 端口对不对 | 先做第 14.2 节第 3 步，再对 `proxy_pass` 与 `PORT` |
| 经 Nginx 访问返回 404 | 请求路径与后端路由是否对得上 | 对照路由表，检查 Nginx 有没有多改路径 |
| 新增任务返回 400 | 请求体格式与 Schema 是否一致 | 用第 13 节的校验失败例子对照，检查必填字段与类型 |
| 查某条任务返回 404 | id 是否存在、类型对不对 | 先查列表确认 id，再用数字 id 访问 |
| 日志里没有请求记录 | 日志级别与输出位置 | Fastify 默认打结构化日志到终端，部署时确认日志没被重定向丢掉 |
| 改了代码没生效 | 旧进程还在跑 | 开发模式确认热重载或手动重启，部署模式重启服务后再验证 |
| 依赖装不上 | npm 仓库访问与 Node.js 版本 | 先跑第 8 节的版本与仓库检查，再看报错的第一行 |

## 17. 安全注意事项

- 口令与密钥只放 `.env`，绝不写进代码、绝不提交到代码仓库；第 11.1 节的 `.env.example` 里只能放占位符。
- 上线前给应用加跨域白名单、请求体大小限制、限流，不要允许所有来源、不限大小、不限频率。
- 所有写接口都要做输入验证：Express 靠自己写的校验或验证中间件，NestJS 靠 DTO 与验证管道，Fastify 靠 JSON Schema；不要把没校验的请求体直接拼进数据库查询。
- 错误响应只返回通用信息，堆栈只写日志；`NODE_ENV` 上线时设为 `production`。
- 依赖要定期更新：跑 `npm outdated` 看过期依赖，关注框架的安全公告，Express、NestJS、Fastify 的安全修复都在最新补丁线，不要长期钉在旧补丁号上。
- 应用不要以 root 运行：systemd 的 `User` 用普通用户，文件权限按最小够用给；Nginx 以反向代理挡在前面，应用只绑 `127.0.0.1`。
- 反向代理后面要正确传递原始协议与 IP：Nginx 的 `X-Forwarded-Proto` 与 `X-Real-IP` 按第 11.2 节配，否则后端日志里的 IP 全是 `127.0.0.1`，出问题查不到来源。
- 登录令牌的密钥泄露后要立即更换并让旧令牌失效，不要只改配置不处理已签发的令牌。

## 18. 回滚和恢复

- 回滚代码：部署前把旧版工程目录整个复制一份，例如 `/opt/node-api-backup-日期`；出问题先停新服务，把备份目录拷回 `/opt/node-api`，重启服务，再按第 14.2 节验证。
- 回滚 Nginx：改配置前先备份，例如 `cp /etc/nginx/sites-available/node-api /etc/nginx/sites-available/node-api.bak`；出问题拷回备份，跑 `nginx -t` 通过后再 `systemctl reload nginx`。
- 回滚 systemd：改服务文件前先备份同名 `.bak`；出问题拷回，跑 `systemctl daemon-reload` 再重启服务。
- 回滚依赖：`package.json` 改动前先备份；出问题拷回并重新 `npm install`，不要只删 `node_modules` 不恢复 `package.json`。
- 数据回滚：本篇实战用内存数据，重启即清空，没有持久化数据可回滚；换成 PostgreSQL 后，改表结构前先备份数据库，迁移脚本要同时准备回退脚本，见数据库相关章节。
- 回滚后验证：回滚不是拷回文件就结束，必须重做第 14.2 节的健康检查与域名访问，两步都通过才算回滚完成。

## 19. 延伸阅读

- Express 官网：expressjs.com，含 5.x 文档与从 4.x 迁移的说明。
- NestJS 官网：nestjs.com，含模块、控制器、提供者、依赖注入与 CLI 的完整文档。
- Fastify 官网：fastify.dev，含插件封装、JSON Schema、日志与部署的完整文档。
- Node.js 官网：nodejs.org，含各版本的长期支持状态与下载。
- 本指南前置文章：JS-01 JavaScript 基础、JS-03 TypeScript、JS-04 前端工程化（Node.js 版本要求与包管理器）、ARCH-03 选型决策树（本篇三个框架对应的落点）。
- 进阶方向：数据库相关章节（把内存数据层换成 PostgreSQL）、HTTPS 相关章节（给 Nginx 配置证书）、部署与发布章节（CI、滚动更新、多机部署）。

## 20. 相关章节链接

- 架构与选型：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)
- JavaScript 基础：[JS-01 JavaScript 基础](../javascript/01-basics.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化](../javascript/04-tooling.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：[BE-02 Python 框架：Django、Flask、FastAPI](./02-python.md)
- 下一篇：[BE-04 Go 框架：Gin、Echo、Fiber、标准库](./04-go.md)
