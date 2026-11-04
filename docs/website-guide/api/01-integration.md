# API-01：REST、GraphQL、WebSocket、JSON、OAuth、JWT、第三方接口完整教程

> 任务编号：API-01（网站建设与部署实战指南 · API 与系统集成第 1 篇）
> 上一篇：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](../database/02-ops.md)；下一篇：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)。
> 本篇只讲 API 与系统集成：REST、GraphQL、WebSocket、JSON、OAuth 2.0、JWT、第三方接口的调用与治理。不讲具体某个后端框架的路由写法（那是 BE-01 至 BE-05 各篇的范围），不讲服务器部署（那是 SRV-01 起的范围）。

## 1. 本章目标

读完并动手做完本篇，你能：

- 说清 REST、GraphQL、WebSocket 各自适合什么场景，并能为一个新需求选对接口形态，而不是逢需求就用 REST。
- 用统一的格式设计 REST 接口：资源命名、HTTP 方法、状态码、分页、版本、错误体，写出前后端都不会误解的接口文档。
- 写出一个能跑的最小 REST 服务，读懂 GraphQL 查询与变更，写出 WebSocket 的连接、推送、断线重连逻辑。
- 读懂 JSON 数据与错误体，知道怎么处理解析失败、字段缺失、类型不对。
- 讲清 OAuth 2.0 授权码流程的每一步是防什么的，读懂 JWT 的三段结构，知道 JWT 该存在哪、不该存在哪。
- 调用第三方接口时处理好密钥、重试、限流、超时，不把密钥写进代码仓库，不在对方限流时硬刷。

## 2. 适用人群

- 已经会写一个后端接口（任一语言均可），但接口设计全凭感觉、错误体各写各样的人。
- 前后端联调时总在“字段到底叫什么、失败到底返回什么”上扯皮的人。
- 需要接第三方服务（短信、支付、地图、登录）但不知道密钥、重试、限流该怎么管的人。
- 不适合只想学某一个框架具体写法的人：框架的路由、模型写法请看 BE 篇，本篇讲的是跨框架通用的接口规矩。

## 3. 适用系统和版本

- 操作系统：Ubuntu 22.04 / 24.04，或任何装有 Python 3.10 以上、Node.js 20 以上、curl 的机器。第 10 节的 REST 示例只用 Python 标准库，不依赖任何框架，Python 3.12.3 上实测通过。
- 协议与规范（均为长期稳定的公开标准，写本篇时无需追新版本）：HTTP/1.1（RFC 9110）、WebSocket（RFC 6455）、OAuth 2.0 授权框架（RFC 6749）、Bearer Token 使用（RFC 6750）、JWT（RFC 7519）、GraphQL 规范（2021 年 10 月版）。
- Node.js 要求：WebSocket 服务端示例用 `ws` 包，需要 Node.js 20 以上；浏览器端示例在任何现代浏览器里都能跑，不依赖框架。
- 本篇不绑定任何云厂商、不绑定任何第三方服务的具体版本：第三方接口的地址、字段、限流数字一律以该服务当场公布的文档为准，文中只讲通用做法。

## 4. 使用前提

- 会用命令行，会用 curl 发请求，会读 JSON。
- 理解 NET-01 讲过的 HTTP 请求与响应、状态码、DNS 与端口；理解 JS-02 讲过的 Fetch 与异步。
- 有一台能跑 Python 的机器（本机、虚拟机、服务器均可），第 10 节的实跑只绑 127.0.0.1，不对外暴露。
- 不需要真实域名、不需要真实第三方账号：本篇所有密钥、令牌、客户端编号一律是占位符，学完再去第三方平台申请真实值。

## 5. 所需资源

- Python 3.10 以上（自带 `http.server`、`json` 模块，第 10 节实跑不需要装任何包）。
- Node.js 20 以上（仅 WebSocket 服务端示例需要 `ws` 包，见第 10.3 节的安装命令）。
- curl（验证接口用）。
- 一个文本编辑器。
- 不需要数据库：本篇示例数据存在内存里，重启即恢复初始状态，这是教学简化，生产做法是接数据库（见 DB-01）。

## 6. 技术原理

### 6.1 REST：用 HTTP 本身的语义表达操作

REST 不是一个协议，而是一组设计约束，核心就三条，记住就够了：

- **资源用名词命名**：`/articles` 是一类资源，`/articles/1` 是其中一个资源。不要在路径里写动词，动词交给 HTTP 方法。
- **方法表达操作**：GET 查、POST 建、PUT/PATCH 改、DELETE 删。GET 必须是安全的（只读，不改数据）、幂等的（调一次和调十次结果一样）；PUT 是幂等的（整条替换），PATCH 是部分修改。
- **状态码表达结果**：成功不只有 200：新建成功用 201，删除成功用 204（无返回体）；客户端错用 4xx，服务端错用 5xx。不要所有失败都返回 200 再在体里写 `success: false`，那样调用方没法用 HTTP 层面的工具（缓存、网关、监控）判断成败。

REST 的无状态约束也很重要：服务端不靠“上一次请求留下的会话”来理解这一次请求，每次请求都自带认证信息。这样接口才能水平扩展：任意一台机器都能处理任意一次请求。

### 6.2 GraphQL：调用方说清自己要什么字段

REST 的痛点是“要么给太多、要么给太少”：列表接口为了详情页多给了十个字段，详情接口为了列表页又少给了两个字段，前端只好多发一次请求。GraphQL 把“要哪些字段”这个决定权交给调用方：

- **查询（Query）**：读数据，调用方在查询里逐个点名要的字段，服务端只返回这些字段。
- **变更（Mutation）**：写数据，同样点名要返回的字段（例如新建后要回显 id 和标题）。
- **模式（Schema）**：服务端先声明有哪些类型、哪些字段、哪些查询入口，调用方按模式写查询，写错字段在开发阶段就能发现。

GraphQL 不是 REST 的替代品：它只有一个入口（通常是 `/graphql`），缓存、限流、权限都要自己多做一层设计（见第 15 节）。字段需求经常变、且由多个前端（网页、App、小程序）共用一个后端时，GraphQL 划算；接口简单固定时，REST 更省事。

### 6.3 WebSocket：一次握手，之后双向推

HTTP 是“一问一答”：客户端问一次，服务端答一次，服务端没法主动找客户端。聊天消息、实时通知、协作编辑这类“服务端有事要立刻告诉客户端”的场景，用 HTTP 轮询（每隔几秒问一次“有新消息吗”）既慢又浪费。WebSocket 的做法是：

1. 客户端先发一个普通 HTTP 请求，带 `Upgrade: websocket` 头，意思是“咱们升级成 WebSocket 连接”。
2. 服务端同意（101 Switching Protocols），这条 TCP 连接就不再是一问一答，而是一条长期双向通道。
3. 之后双方都能随时发消息，不需要谁先问。

代价也要说清：长连接要占服务端内存与文件描述符，断线、重连、心跳、鉴权都要自己处理（见第 10.3 节与第 15 节）。只是“偶尔刷新一下数据”的场景，用定时 Fetch 就够了，不要为了用 WebSocket 而用 WebSocket。

### 6.4 JSON：接口的通用数据格式

JSON 只有六种值：对象、数组、字符串、数字、布尔值、null。接口设计时定三条规矩，联调会少一半扯皮：

- **成功体统一包一层**：例如 `{"data": ..., "total": ...}`，调用方永远先看 `data`，不用猜这次返回的是对象还是数组。
- **失败体统一格式**：例如 `{"error": {"code": "NOT_FOUND", "message": "文章不存在"}}`，`code` 是给程序判断的固定字符串，`message` 是给人看的说明，不要把 `message` 当程序判断依据（它可能被改写、被翻译）。
- **数字与时间**：金额、ID 不要用浮点数传（精度会丢），时间用 ISO 8601 字符串（例如 `2026-11-03T23:00:00+08:00`），不要用各家自己的时间戳格式。

### 6.5 OAuth 2.0：让用户授权，而不是交出密码

OAuth 2.0 解决的是“用户想让 A 应用用 B 服务的数据，但不想把 B 的密码给 A”。四个角色要先分清：

- **资源所有者**：用户本人。
- **客户端**：想拿数据的应用（例如你的网站）。
- **授权服务器**：发令牌的地方（例如 GitHub、Google 的登录服务）。
- **资源服务器**：真正存数据的地方（例如 GitHub 的 API）。

授权码流程（最常用、最安全的一种）分六步，每一步防的东西都不一样：

1. 你的网站把用户带到授权服务器的授权页，带上 `client_id`、`redirect_uri`、`state`（防跨站请求伪造的随机值）。
2. 用户在授权服务器上登录并点“允许”。
3. 授权服务器把用户带回你的 `redirect_uri`，并附上一个一次性的授权码 `code`。
4. 你的**服务端**拿着 `code` 加上 `client_secret`，去授权服务器换访问令牌 `access_token`。这一步必须在服务端做，因为 `client_secret` 绝不能出现在浏览器里。
5. 授权服务器校验通过后发回 `access_token`（可能还有刷新令牌 `refresh_token`）。
6. 你的服务端拿着 `access_token` 去资源服务器取数据。

为什么不能直接把密码给应用、为什么授权码只能用一次、为什么换令牌必须在服务端做，第 17 节会再讲一遍红线。

### 6.6 JWT：自带信息的令牌，但不是万能钥匙

JWT 由三段组成，用点号隔开：`header.payload.signature`。

- **header**：声明签名算法（例如 HS256）与令牌类型。
- **payload**：放声明（claims），例如用户 id、过期时间 `exp`。注意：payload 只是 Base64 编码，**不是加密**，任何人拿到令牌都能解开看到里面的内容，所以不要把密码、手机号、密钥放进 payload。
- **signature**：服务端用密钥对前两段签名，收到令牌时重新算一遍签名，对不上就拒绝。签名防篡改，不防偷看。

JWT 的好处是服务端不用查库就能验令牌（算签名即可），代价是令牌一旦发出、在过期前没法单独吊销某一个令牌（除非再加黑名单或把有效期设得很短，见第 15 节与第 17 节）。不要把 JWT 当成“不用管过期”的永久通行证。

### 6.7 第三方接口：别人的服务，要按别人的规矩用

调用第三方接口和调用自己的接口，心态要换过来：对方随时可能限流、超时、改字段、停服。通用做法就四条：密钥放环境变量、不进代码仓库；所有调用设超时；失败按退避策略重试（见第 10.4 节）；对方返回 429（限流）时按 `Retry-After` 等，不要硬刷。

## 7. 架构说明

一个带 API 的典型站点分五层，从外到内是：

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| 客户端（网页、App） | 发请求、渲染结果、存令牌（按第 17 节的存法） | 不直接拼 SQL、不直接调数据库 |
| 网关 / Nginx | 统一入口、TLS、限流、按路径分流（静态走前端、`/api/` 走后端） | 不写业务逻辑 |
| API 服务 | 路由、参数校验、业务逻辑、返回统一格式 | 不直接把密钥写进代码 |
| 认证层 | OAuth 流程、JWT 签发与校验、权限检查 | 不替业务层决定“这篇文章能不能看”（那是业务权限） |
| 数据与第三方 | 数据库、缓存、第三方服务（短信、支付、地图） | 不直接暴露给客户端 |

请求流转示例（读文章列表）：浏览器 Fetch → Nginx（`/api/articles` 分流到 API 服务）→ API 服务校验令牌 → 查数据库 → 按统一格式返回 `{"data": [...], "total": ...}`。写文章列表：同样的路反过来，校验不通过直接返回 401/403，不走到数据库那一步。

GraphQL 只换掉“API 服务”这一层的入口形态：多个 REST 路径收敛成一个 `/graphql` 入口，后面仍是同样的业务逻辑与数据库。WebSocket 则多一条长连接通道：握手走 HTTP，握手成功后消息走长连接，断线后客户端按退避策略重连。

## 8. 操作前检查

动手前先确认下面五项，缺一项先补一项：

1. `python3 --version` 能输出 3.10 以上的版本号；`curl --version` 能输出版本。
2. 本机 18071 端口没被占用（第 10 节示例用这个端口，只绑本地）。
3. 编辑器能正常保存 `.py`、`.json` 文件。
4. WebSocket 服务端示例需要 Node.js 20 以上与 `ws` 包，没有 Node.js 也可以先只做 REST 部分，WebSocket 部分按第 14 节在有 Node.js 的机器上验证。
5. 明确一点：本篇所有密钥、令牌、客户端编号都是占位符，不要拿文中的占位符去真实服务上试，也不要把自己真实的密钥贴进练习文件。

## 9. 逐步操作

1. 按第 8 节做操作前检查。
2. 把第 10.1 节的 REST 代码存成 `api_server.py`，启动它，用 curl 走一遍健康检查、列表、详情、新增、错误四种情况，对照第 13 节的真实输出。
3. 读第 10.2 节的 GraphQL 查询与模式，理解“调用方点名要字段”与 REST 的区别；不需要在本机搭 GraphQL 服务端，读懂查询写法即可。
4. 读第 10.3 节的 WebSocket 服务端与浏览器端代码，理解握手、心跳、断线重连三件事；在有 Node.js 的机器上按第 14 节验证。
5. 把第 11 节的配置文件存下来，逐项对照第 12 节的解释，改成你自己的端口与过期时间。
6. 按第 14 节的核对清单逐项验证：状态码、错误体、分页、版本、令牌过期、第三方重试，全部通过才算做完。

## 10. 完整代码

### 10.1 REST API：文章列表、详情、新增（Python 标准库，可直接运行）

下面这份代码就是本机实跑过的那份（实跑输出见第 13 节），只用 Python 标准库，不依赖任何框架。存放路径：本教程示例用 `/tmp/api01-test/api_server.py`，读者自己的项目里放项目根目录，例如 `~/myapi/api_server.py`。启动命令：`python3 api_server.py`，监听 `127.0.0.1:18071`（只绑本地，不对外暴露）。数据存在内存列表里，服务重启后恢复成初始两篇，这是有意为之的教学简化，不是生产做法（生产做法是接数据库，见 DB-01）。

```python
"""最小 REST API：文章列表、详情、新增（只用 Python 标准库，不依赖任何框架）。

存放路径：本教程示例用 /tmp/api01-test/api_server.py（读者自己的项目里放项目根目录，例如 ~/myapi/api_server.py）。
启动：python3 api_server.py
监听：127.0.0.1:18071（只绑本地，不对外暴露）
数据：存在内存列表里，服务重启后恢复成初始两篇，这是有意为之的教学简化，不是生产做法。
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ARTICLES = [
    {"id": 1, "title": "第一篇", "content": "这是第一篇文章的内容。", "status": "published"},
    {"id": 2, "title": "第二篇", "content": "这是第二篇文章的内容。", "status": "draft"},
]
NEXT_ID = 3


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status, code, message):
        self._send_json(status, {"error": {"code": code, "message": message}})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        if path == "/articles":
            self._send_json(200, {"data": ARTICLES, "total": len(ARTICLES)})
            return
        if path.startswith("/articles/"):
            try:
                article_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._send_error(400, "INVALID_ID", "文章 id 必须是数字")
                return
            for article in ARTICLES:
                if article["id"] == article_id:
                    self._send_json(200, {"data": article})
                    return
            self._send_error(404, "NOT_FOUND", "文章不存在")
            return
        self._send_error(404, "NOT_FOUND", "接口不存在")

    def do_POST(self):
        global NEXT_ID
        path = urlparse(self.path).path
        if path != "/articles":
            self._send_error(404, "NOT_FOUND", "接口不存在")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send_error(400, "INVALID_JSON", "请求体不是合法 JSON")
            return
        title = payload.get("title")
        content = payload.get("content")
        if not title or not content:
            self._send_error(422, "VALIDATION_FAILED", "title 和 content 都是必填项")
            return
        article = {"id": NEXT_ID, "title": title, "content": content, "status": "draft"}
        NEXT_ID += 1
        ARTICLES.append(article)
        self._send_json(201, {"data": article})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 18071), Handler)
    print("listening on 127.0.0.1:18071")
    server.serve_forever()
```

验证这个服务用的 curl 命令（在服务启动后、另一个终端里执行）：

```bash
curl -s http://127.0.0.1:18071/health
curl -s http://127.0.0.1:18071/articles
curl -s http://127.0.0.1:18071/articles/1
curl -s -w " HTTP_CODE:%{http_code}" http://127.0.0.1:18071/articles/999
curl -s -X POST http://127.0.0.1:18071/articles -H "Content-Type: application/json" -d '{"title":"第三篇","content":"这是第三篇文章的内容。"}'
```

### 10.2 GraphQL：查询示例与模式示例

先看模式（Schema）：服务端先声明有哪些类型，调用方只能按模式里声明的字段写查询。存放路径：读者自己的项目里，模式文件例如 `~/myapi/schema.graphql`（本篇只讲写法，不要求在本机搭 GraphQL 服务端）。

```graphql
type Article {
  id: ID!
  title: String!
  content: String!
  status: String!
  author: Author!
}

type Author {
  id: ID!
  name: String!
}

type Query {
  articles(status: String): [Article!]!
  article(id: ID!): Article
}

type Mutation {
  createArticle(title: String!, content: String!): Article!
}
```

再看查询：调用方点名要 `id`、`title`、`author` 的 `name`，不要 `content`，服务端就只返回这三个字段。对比 REST：REST 的列表接口会把 `content` 也一起返回，前端用不上也得收下。

```graphql
query {
  articles(status: "published") {
    id
    title
    author {
      name
    }
  }
}
```

查询发出去的 HTTP 请求体（POST 到 `/graphql`，`Content-Type: application/json`）：

```json
{
  "query": "query { articles(status: \"published\") { id title author { name } } }",
  "variables": {}
}
```

服务端返回的成功体（字段与查询里点名的一致，多一个字段都没有）：

```json
{
  "data": {
    "articles": [
      {
        "id": "1",
        "title": "第一篇",
        "author": {
          "name": "dawei"
        }
      }
    ]
  }
}
```

变更示例（新建文章，并只要回显 `id` 与 `title`，不要 `content`）：

```graphql
mutation {
  createArticle(title: "第三篇", content: "这是第三篇文章的内容。") {
    id
    title
  }
}
```

### 10.3 WebSocket：服务端推送示例（Node.js）与浏览器端示例

服务端：用 `ws` 包，收到客户端发来的 `ping` 就回 `pong`（心跳），每 10 秒向所有已连接客户端推送一次时间。存放路径：读者自己的项目里，例如 `~/myapi/ws_server.js`。安装命令：`npm install ws`（需要 Node.js 20 以上）。注意：本篇没有在本机跑通这个服务端（原因见第 13 节末尾的如实说明），下面的代码只做了语法与括号检查，读者按第 14 节在自己有 Node.js 的机器上验证。

```js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 18072 });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "welcome", message: "连接成功" }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "消息不是合法 JSON" }));
      return;
    }
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  });

  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "time", now: new Date().toISOString() }));
    }
  }, 10000);

  ws.on("close", () => {
    clearInterval(timer);
  });
});

console.log("listening on 127.0.0.1:18072");
```

浏览器端：连接、收消息、断线后按退避策略重连（第 1 次等 1 秒，第 2 次等 2 秒，第 3 次等 4 秒，上限 30 秒）。这段代码是给浏览器用的，放在网页的 `<script>` 里，不要用 `node --check` 去验它（浏览器 API 在 Node 里不存在），本篇只做了括号平衡与结构核对，未在浏览器里实测（见第 13 节末尾的如实说明）。

```js
let socket = null;
let retryDelay = 1000;

function connect() {
  socket = new WebSocket("ws://127.0.0.1:18072");

  socket.onopen = () => {
    retryDelay = 1000;
    socket.send(JSON.stringify({ type: "ping" }));
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "welcome") {
      console.log(msg.message);
    }
    if (msg.type === "time") {
      console.log("服务端时间：", msg.now);
    }
  };

  socket.onclose = () => {
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  };
}

connect();
```

### 10.4 第三方接口调用：重试与限流处理（Python）

调用第三方接口时，不要失败一次就放弃，也不要失败立刻原地狂刷。下面的做法是通用模板：最多重试 3 次，每次等待时间翻倍（1 秒、2 秒、4 秒）；对方返回 429 时读 `Retry-After` 头，按对方说的秒数等；超过重试次数就把错误原样抛给上层，由上层决定是记日志还是告诉用户。存放路径：读者自己的项目里，例如 `~/myapi/third_party.py`。注意：这里的地址与密钥全是占位符，`YOUR_API_KEY` 不是真实密钥，拿它去请求一定失败，这是故意的。

```python
import time
import urllib.request
import urllib.error

API_URL = "https://api.example.com/v1/notify"
API_KEY = "YOUR_API_KEY"
MAX_RETRIES = 3


def call_third_party(payload):
    body = str(payload).encode("utf-8")
    delay = 1
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "Authorization": "Bearer " + API_KEY,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_RETRIES:
                wait = e.headers.get("Retry-After")
                time.sleep(int(wait) if wait else delay)
                delay = delay * 2
                continue
            raise
        except urllib.error.URLError:
            if attempt < MAX_RETRIES:
                time.sleep(delay)
                delay = delay * 2
                continue
            raise
    raise RuntimeError("重试次数已用完")
```

## 11. 完整配置文件

### 11.1 API 服务配置：`api_config.json`

存放路径：读者自己的项目里，例如 `~/myapi/api_config.json`（与第 10.1 节的服务放同一目录）。注意：这个文件里**不要放任何密钥**，密钥只放第 11.2 节的 `.env`，且 `.env` 绝不进代码仓库。

```json
{
  "host": "127.0.0.1",
  "port": 18071,
  "jwt_expire_seconds": 3600,
  "rate_limit_per_minute": 60,
  "third_party_timeout_seconds": 10,
  "third_party_max_retries": 3
}
```

### 11.2 环境变量示例：`.env`

存放路径：读者自己的项目里，例如 `~/myapi/.env`，权限设为 600（只有自己能读），且必须写进 `.gitignore`。下面每一项都是占位符：`YOUR_JWT_SECRET`、`YOUR_CLIENT_SECRET`、`YOUR_API_KEY` 都不是真实值，部署时换成自己在各平台申请的真实值，且真实值绝不要贴进教程、聊天记录或代码仓库。

```ini
JWT_SECRET=YOUR_JWT_SECRET
OAUTH_CLIENT_ID=YOUR_CLIENT_ID
OAUTH_CLIENT_SECRET=YOUR_CLIENT_SECRET
THIRD_PARTY_API_KEY=YOUR_API_KEY
```

## 12. 每个关键配置项的解释

| 配置项 | 含义 | 填错会怎样 |
|---|---|---|
| `host` | 服务绑定的地址。`127.0.0.1` 只接受本机请求，适合开发与本地验证；生产要走反向代理，不要直接绑 `0.0.0.0` 裸奔 | 绑错地址会导致本机能通、外网不通，或反过来把开发服务暴露到外网 |
| `port` | 服务监听的端口。第 10 节示例用 18071，WebSocket 示例用 18072，两个服务不要用同一个端口 | 端口冲突时后启动的服务直接起不来 |
| `jwt_expire_seconds` | JWT 有效期，单位秒。3600 就是 1 小时。设得太长，被盗用的窗口就长；设得太短，用户要频繁重新登录 | 过期时间写错单位（例如把秒写成毫秒）会导致令牌立刻过期或几乎不过期 |
| `rate_limit_per_minute` | 每分钟允许的请求数。60 就是每分钟 60 次，超过返回 429 | 不设限流时，一个失控的客户端能把服务刷垮；设得太低会误伤正常用户 |
| `third_party_timeout_seconds` | 调第三方接口的超时时间，单位秒。10 秒就是等 10 秒没回就放弃 | 不设超时时，对方一慢，你的服务会被拖住的连接占满 |
| `third_party_max_retries` | 第三方调用失败时的最多重试次数。3 次就是首次加 2 次重试 | 重试次数太多会在对方故障时雪上加霜；对“已扣款”类操作重试前必须先确认幂等（见第 15 节） |
| `JWT_SECRET` | 签发与校验 JWT 的密钥，只存在服务端，绝不能出现在前端代码、仓库、聊天记录里 | 泄露后任何人都能自己签发任意用户的令牌，等于认证失效 |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | 在授权服务器注册应用时拿到的编号与密钥。编号可以出现在跳转链接里，密钥只能存在服务端 | 密钥进浏览器就等于公开，别人能冒充你的应用去换令牌 |
| `THIRD_PARTY_API_KEY` | 第三方服务的调用密钥，同样只存在服务端或环境变量里 | 进仓库后即使删掉提交记录，密钥也可能已被别人拉走，必须去平台吊销重发 |

## 13. 执行结果示例

### 13.1 REST 服务实跑输出（本机真实输出，不是编的）

下面是本机真实跑出来的结果：先用 `python3 -m py_compile` 检查通过，再启动服务，用 curl 依次请求。启动命令是 `python3 /tmp/api01-test/api_server.py`，服务日志只有一行 `listening on 127.0.0.1:18071`。注意：健康检查响应头里的 `Date` 是服务当时的系统时间，读者自己跑的时候日期一定不一样，这是正常的；中文 JSON 没有被转义成 `\u` 形式，是因为代码里写了 `ensure_ascii=False`。

健康检查（`curl -s -i http://127.0.0.1:18071/health`，响应头节选）：

```text
HTTP/1.0 200 OK
Server: BaseHTTP/0.6 Python/3.12.3
Content-Type: application/json; charset=utf-8
Content-Length: 16

{"status": "ok"}
```

文章列表（`curl -s http://127.0.0.1:18071/articles`，初始状态，共 2 篇）：

```json
{"data": [{"id": 1, "title": "第一篇", "content": "这是第一篇文章的内容。", "status": "published"}, {"id": 2, "title": "第二篇", "content": "这是第二篇文章的内容。", "status": "draft"}], "total": 2}
```

文章详情（`curl -s http://127.0.0.1:18071/articles/1`）：

```json
{"data": {"id": 1, "title": "第一篇", "content": "这是第一篇文章的内容。", "status": "published"}}
```

不存在的文章（`curl -s http://127.0.0.1:18071/articles/999`，注意状态码是 404，不是 200）：

```json
{"error": {"code": "NOT_FOUND", "message": "文章不存在"}}
```

新增文章（POST，状态码 201，新文章 id 是 3，状态默认是 `draft`）：

```json
{"data": {"id": 3, "title": "第三篇", "content": "这是第三篇文章的内容。", "status": "draft"}}
```

新增后再查列表（共 3 篇，`total` 从 2 变成了 3，证明新增确实写进了内存列表）：

```json
{"data": [{"id": 1, "title": "第一篇", "content": "这是第一篇文章的内容。", "status": "published"}, {"id": 2, "title": "第二篇", "content": "这是第二篇文章的内容。", "status": "draft"}, {"id": 3, "title": "第三篇", "content": "这是第三篇文章的内容。", "status": "draft"}], "total": 3}
```

新增时缺字段（只传 `title` 不传 `content`，状态码 422，文章没有被创建）：

```json
{"error": {"code": "VALIDATION_FAILED", "message": "title 和 content 都是必填项"}}
```

### 13.2 JWT 示例（解码后的样子，不是真实签发结果）

一个 JWT 解码后是下面两段 JSON（header 与 payload），第三段签名在本篇里是占位符，**不要拿下面这个拼出来的字符串去任何地方验签，一定失败**，它只是用来讲结构的。真实签发必须用服务端的 `JWT_SECRET` 对前两段算签名，见第 6.6 节。

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

```json
{
  "sub": "10001",
  "name": "dawei",
  "exp": 1790000000
}
```

### 13.3 如实说明：本篇哪些没在本机跑通

- GraphQL 查询与模式示例没有在本机搭服务端跑：本篇只讲查询写法与模式写法，读者按第 14 节在自己选的框架里验证。
- WebSocket 服务端与浏览器端示例没有在本机跑通：服务端需要 `npm install ws`，本机验证时没有去装这个包、没有启动 Node 服务，浏览器端也没有在真实浏览器里点过连接。因此第 10.3 节的代码只做了语法与括号检查，读者按第 14 节在自己有 Node.js 与浏览器的机器上验证，不要把“代码贴出来了”当成“跑通过了”。
- 第三方接口调用示例没有对真实第三方发过请求：地址与密钥全是占位符，`YOUR_API_KEY` 拿去请求一定失败，这是故意的。重试与限流逻辑按第 14 节在读者自己的第三方账号上验证。

## 14. 成功验证

读者按下面清单逐项验证，全部通过才算做完：

1. 启动 REST 服务，`curl http://127.0.0.1:18071/health` 返回 `{"status": "ok"}` 且状态码 200。
2. `GET /articles` 返回 `total` 与 `data` 长度一致；`GET /articles/1` 返回 id 为 1 的文章；`GET /articles/999` 返回 404 与 `NOT_FOUND` 错误体，不是 200。
3. POST 一篇新文章返回 201，再查列表时 `total` 加 1；POST 缺字段时返回 422，且列表数量不变。
4. 用错误的 JSON 当请求体 POST，返回 400 与 `INVALID_JSON`，服务不崩溃，还能继续处理下一个请求。
5. 把第 11.1 节的配置改成别的端口，重启服务后 curl 新端口能通、旧端口不通，证明服务确实读的是配置文件里的端口（第 10.1 节示例把端口写死在代码里，读者改配置时要同步改代码里的端口，或把读配置的逻辑接进来，不要只改一处就以为生效了）。
6. GraphQL：在自己选的框架里按第 10.2 节的模式与查询跑一遍，确认返回字段与查询里点名的一致，多一个字段都没有；把查询里的字段名故意写错一个，确认服务端返回字段错误而不是悄悄返回空数据。
7. WebSocket：在有 Node.js 的机器上 `npm install ws` 后启动第 10.3 节的服务端，浏览器打开客户端页面，确认收到 `welcome`；断开网络再恢复，确认客户端按退避策略重连，而不是只连一次就放弃。
8. JWT：用服务端签发的真实令牌调一次需要认证的接口能通；把令牌的 payload 改一个字符再调，确认服务端返回 401（签名对不上）；等令牌过期后再调，确认返回 401（过期），不要只测“能通”不测“该拦的拦住了”。
9. 第三方：用自己的第三方测试账号调一次成功、一次故意传错密钥（返回 401/403 时不要重试，因为重试解决不了密钥错的问题），再模拟一次 429（或把重试次数调小），确认程序按 `Retry-After` 等待而不是立刻硬刷。

## 15. 常见错误

| 错误 | 现象 | 根因 |
|---|---|---|
| 所有失败都返回 200 | 前端分不清成功与失败，监控也看不到错误率 | 错误体与状态码没有分工，见第 6.1 节 |
| 路径里写动词 | `/getArticles`、`/deleteArticle` 满天飞，新人要靠文档猜 | 资源命名用了动词，动词应该交给 HTTP 方法 |
| GET 请求改数据 | 搜索引擎爬虫爬一次就把数据改了 | GET 不是安全的，写操作必须用 POST/PUT/PATCH/DELETE |
| 前端直接拿 JWT 当长期凭证 | 令牌被盗后长期有效，改密码也吊销不了 | JWT 有效期设得太长且没有吊销手段，见第 17 节 |
| 把密钥写进前端代码 | 密钥出现在浏览器源码里，等于公开 | 客户端密钥、JWT 密钥、第三方密钥只能存在服务端 |
| GraphQL 一个查询拖垮服务 | 一个查询嵌套十层关联，数据库被打爆 | 没有做查询深度限制、复杂度限制、分页上限 |
| WebSocket 不做心跳 | 代理或 NAT 静默断开连接，双方都以为还连着 | 没有心跳与超时检测，断线后也不重连 |
| 第三方失败立刻重试十次 | 对方故障时自己的重试把对方彻底打垮 | 没有退避策略、没有区分“可重试”与“不可重试”的错误 |
| 对“已扣款”类操作无脑重试 | 用户被重复扣款 | 重试前没有确认接口是否幂等，没有用幂等键 |
| 分页不设上限 | 调用方传 `limit=1000000`，一次查出全表 | 分页参数没有默认值与上限校验 |

## 16. 故障排查

按“先看状态码、再看错误体、再看日志”的顺序查，不要一上来就改代码：

1. **401**：令牌缺失、签名不对、已过期。先确认请求头是不是 `Authorization: Bearer <令牌>`（注意 `Bearer` 后面有一个空格），再确认令牌是不是过期了，最后确认签发与校验用的密钥是不是同一份。
2. **403**：令牌是对的，但这个用户没有这个权限。不要把 403 当成“令牌错了”去换令牌，换了也没用，查权限规则。
3. **404**：先确认路径拼对没有（少一个 `/api` 前缀是最常见的），再确认资源 id 是否存在。注意区分“接口不存在”与“资源不存在”，本篇示例用同一个 `NOT_FOUND` 但 message 不同，生产上建议用不同的 `code` 区分。
4. **422**：参数校验失败。看错误体的 `message` 写的是哪个字段，再对照接口文档看必填项与格式，不要猜。
5. **429**：被限流了。看响应头有没有 `Retry-After`，有就按它等；没有就按指数退避等。不要立刻重试，立刻重试只会让限流时间更长。
6. **5xx**：服务端的问题。先看服务端日志里的异常堆栈，再确认是不是数据库、第三方服务挂了。客户端能做的只有按退避策略重试读操作，写操作先确认幂等再重试。
7. **WebSocket 连不上**：先确认握手是不是 101，握手失败（例如 403、404）说明路径、鉴权、反向代理配置有问题；握手成功后立刻断开，多半是心跳、超时、Nginx 的代理超时配置问题（见 SRV-01）。
8. **GraphQL 返回字段为空**：先确认查询里的字段名与模式里声明的一致，再确认解析器（resolver）是不是返回了这个字段。字段名写错时服务端会返回字段错误，不要当成“数据本来就是空的”。

## 17. 安全注意事项

- **密钥只存在服务端**：JWT 密钥、OAuth 客户端密钥、第三方 API 密钥一律放环境变量或密钥管理服务，权限 600，绝不进代码仓库、绝不出现在前端代码、绝不贴进聊天记录。怀疑泄露时第一件事是去平台吊销重发，不是删提交记录（删记录也收不回已被拉走的密钥）。
- **JWT payload 不放敏感信息**：payload 只是编码不是加密，任何人拿到令牌都能解开。密码、手机号、身份证、密钥一律不放 payload。
- **JWT 有效期要短，刷新要另外做**：访问令牌有效期建议 15 分钟到 1 小时，刷新令牌另外存、另外管。不要为了“用户不用重新登录”把访问令牌有效期设成 30 天。
- **OAuth 换令牌必须在服务端**：`client_secret` 出现在浏览器里就等于公开。`state` 参数每次随机生成并校验，防跨站请求伪造；`redirect_uri` 必须与注册时登记的完全一致，防授权码被带到攻击者的地址。
- **所有接口走 HTTPS**：令牌、密码、授权码走 HTTP 明文等于公开。本地开发可以只绑 127.0.0.1，但一上生产就必须上 HTTPS（见 SRV 篇的证书章节）。
- **跨域（CORS）不要图省事开 `*`**：允许所有来源跨域带凭证请求，等于把接口送给任何网站调用。只放行自己确切的前端来源，且带凭证时不要用通配符。
- **输入校验在服务端做**：前端校验只是为了体验好，真正的安全检查必须在服务端重做一遍。SQL 注入、XSS 的防法在 BE 篇与安全章节，本篇只强调一条：不要把调用方传来的字符串直接拼进 SQL 或页面。
- **日志不要记令牌与密钥**：请求日志里把 `Authorization` 头、请求体里的密码字段脱敏后再记，出了问题查日志时才不会把密钥也查出来。

## 18. 回滚和恢复

- **接口改版先加版本、后删旧版**：新接口走 `/api/v2/`，旧接口 `/api/v1/` 继续跑一段时间，等调用方都迁过去再下线旧版。不要直接改 v1 的字段含义（例如把 `title` 从字符串改成对象），那样所有旧客户端会同时坏掉。
- **回滚就是 redeploy 上一个版本**：API 服务本身是无状态的（见第 6.1 节），回滚时把上一个版本的代码重新部署即可，不需要“反向执行”一遍新功能。但数据库迁移是另一回事：加字段可以回滚（删字段），删字段、改类型就很难无损回滚，所以迁移脚本要单独评审（见 DB-02）。
- **第三方接口出问题时的降级**：第三方挂了不等于你的站要全挂。读操作可以先返回缓存里的旧数据并标注“数据可能不是最新”；写操作先排队、等对方恢复再补发，不要直接告诉用户“成功了”然后丢单。
- **令牌密钥轮换**：换 JWT 密钥时先让新旧两份密钥同时接受校验一段时间（新令牌用新密钥签，旧令牌用旧密钥验），等旧令牌自然过期再只留新密钥。直接换密钥会导致所有在线用户同时掉线。
- **WebSocket 服务回滚**：长连接服务回滚时，旧连接不会自动迁移到新版本，客户端要按退避策略重连到新版本。回滚前先确认客户端有重连逻辑，不要指望服务端“无缝切换”长连接。

## 19. 延伸阅读

- RFC 9110《HTTP 语义》：方法、状态码、缓存的权威定义，第 6.1 节的状态码用法以它为准。
- RFC 6749《OAuth 2.0 授权框架》与 RFC 6750《Bearer Token 使用》：授权码流程、令牌类型的权威定义。
- RFC 7519《JSON Web Token》：JWT 三段结构与注册声明的权威定义。
- RFC 6455《WebSocket 协议》：握手、帧、心跳的权威定义。
- GraphQL 规范（2021 年 10 月版）：查询、变更、模式的权威定义，各语言实现以它为准。
- MDN 文档：Fetch API、WebSocket、HTTP 状态码的中文可读版，适合先读 MDN 再读 RFC。
- 本指南前置文章：NET-01（HTTP 与 DNS）、JS-02（Fetch 与异步）、BE-02 与 BE-03（框架里的路由与中间件写法）。

## 20. 相关章节链接

- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)
- 前端异步：[JS-02 DOM、事件、异步](../javascript/02-dom-async.md)
- 后端框架：[BE-02 Python 框架：Django、Flask、FastAPI](../backend/02-python.md)、[BE-03 Node.js 框架：Express、NestJS、Fastify](../backend/03-nodejs.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](../database/02-ops.md)
- 下一篇：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)
