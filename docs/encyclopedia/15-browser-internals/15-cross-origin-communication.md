---
description: "15 浏览器与互联网底层：跨域通信方案——CORS、postMessage、JSONP 的机制与正确用法：预检、凭证模式、origin 校验与 JSONP 的风险替代。"
---

# 跨域通信方案

## 1. 本章目标

读完本篇，能为三种跨域需求各选对机制：跨源读接口用 CORS，跨源窗口/iframe 传消息用 `postMessage`，而 JSONP 只作为“实在改不了服务端”的遗留认识——并且能按正确用法写出每一项，不踩通配符与凭证、`*` 目标源这两处经典坑。

> 安全边界：本篇只讲机制与正确用法，不讲同源绕过、CORS 配置绕过、`postMessage` 劫持利用的操作步骤与可复现利用方法。

## 2. 背景与问题

上一篇的结论是：同源策略默认拦跨源读取。但真实 Web 离不开跨源协作：前端在 `app.example.com`，接口在 `api.example.com`；页面里嵌着支付、登录、地图等第三方 iframe，又要与它们交换状态。一刀切地禁止跨源，Web 就没法用；全部放开，登录态就没法保。于是需要三类“有条件放行”的机制：

- **CORS**：资源方用 HTTP 响应头告诉浏览器“这个源可以读我的响应”。
- **`postMessage`**：两个窗口/iframe 之间直接传消息，收发双方各自校验对方源。
- **JSONP**：CORS 出现之前的权宜之计，利用“脚本引入不受同源读取限制”这一例外来传数据，如今只剩遗留价值。

三者的分工先说清：CORS 管“脚本读跨源接口响应”，`postMessage` 管“窗口之间传消息”，JSONP 是“把数据伪装成脚本来执行”的旧办法。

## 3. 总体架构

```
跨域需求 ── 读跨源接口响应 ──▶ CORS（服务器响应头放行，浏览器执行）
         ── 窗口/iframe 传消息 ─▶ postMessage（双方校验 origin）
         ── 老系统无法改服务端 ─▶ JSONP（遗留：数据当脚本执行，仅读公开数据）
```

| | CORS | postMessage | JSONP |
|---|---|---|---|
| 通道 | HTTP 请求/响应头 | 窗口间的消息事件 | `<script>` 标签加载 |
| 传的是 | 数据（响应体） | 数据（消息对象） | 代码（包着数据的函数调用） |
| 谁决定放行 | 资源服务器（响应头） | 收发双方（各自校验源） | 引入页（引入即信任对方脚本） |
| 方法 | GET/POST/PUT/DELETE 等均可 | 与 HTTP 方法无关 | 仅 GET |
| 凭证（Cookie 等） | 须双方显式同意（见 4.1） | 不自动带 Cookie，消息内容自理 | 脚本请求会按 Cookie 规则发送（见 4.3） |
| 新项目推荐 | 是 | 是（窗口通信时） | 否，遗留 |

## 4. 工作机制

### 4.1 CORS：服务器说“这个源可以读”，浏览器负责执行

CORS 不是“关闭同源策略”，而是资源方对特定源的显式放行，且放行与否由**浏览器**根据响应头判定。非浏览器客户端（如 `curl`）不受 CORS 约束：它能拿到响应体，不代表浏览器脚本也能读——第 8 节的实测正好演示了这一点。

**简单请求与预检请求。** 浏览器把跨源请求分两类（Fetch 标准现已不再用“简单请求”这个旧术语，但 MDN 仍沿用它来讲解，含义不变）：

- **简单请求**：同时满足——方法为 GET、HEAD 或 POST；只用 CORS 安全列表内的请求头（如 `Accept`、`Accept-Language`、`Content-Language`、`Content-Type`）；`Content-Type` 只能是 `application/x-www-form-urlencoded`、`multipart/form-data`、`text/plain` 三者之一；且无上传进度监听、无 `ReadableStream` 请求体。这类请求直接发出，浏览器事后凭响应头决定脚本能不能读。
- **预检请求**：不满足上述任一条件的请求（例如方法为 PUT/DELETE、带 `Authorization` 自定义头、`Content-Type` 为 `application/json`），浏览器会先自动发一个 `OPTIONS` 预检请求，带上 `Origin`、`Access-Control-Request-Method`（实际想用的方法）、`Access-Control-Request-Headers`（实际想用的自定义头），问服务器“这一套允不允许”。只有预检响应放行，浏览器才发实际请求；预检不通过，实际请求根本不发。

预检响应用到的响应头：

- `Access-Control-Allow-Origin`：允许读取的源（单个源或 `*`）。
- `Access-Control-Allow-Methods`：预检允许的方法列表。
- `Access-Control-Allow-Headers`：预检允许的请求头列表。
- `Access-Control-Max-Age`：预检结果可缓存的秒数，缓存期内同类请求不再重复预检。
- `Vary: Origin`：响应随请求 `Origin` 而变时必须带上，避免共享缓存把给 A 源的放行结果错发给 B 源。

**凭证模式（最容易配错的一处）。** 分两种情形，界线要划清：

- **公开资源、无凭证**：`Access-Control-Allow-Origin: *` 可以接受——前提是响应确实公开、不依赖 Cookie 或其他凭证、不含个人数据。
- **带凭证的请求**：脚本用 `fetch` 的 `credentials: "include"`（或 `XMLHttpRequest` 的 `withCredentials`）要求带上 Cookie 等凭证时，服务器必须同时满足三点：`Access-Control-Allow-Origin` 写**明确的单个源**（不能是 `*`）；`Access-Control-Allow-Credentials: true`；预检与实际响应都要带上放行头。凭证模式下 `Access-Control-Allow-Headers` 与 `Access-Control-Allow-Methods` 也不能用 `*` 敷衍，要写明确列表。`fetch` 默认是 `credentials: "same-origin"`：同源带凭证，跨源默认不带——跨源想带凭证必须显式声明，服务器也必须显式同意，缺一边都不行。
- **预检本身不带凭证**：预检请求按规范不携带 Cookie 与 `Authorization`；服务器不要把预检当成已鉴权的业务请求来处理，但预检响应仍须声明 `Access-Control-Allow-Credentials: true`，实际请求才可能带凭证发出。
- **只暴露安全列表头**：即使放行了读取，脚本默认也只能读到 CORS 安全列表内的响应头；想让脚本读自定义响应头，服务器要另加 `Access-Control-Expose-Headers` 列出它们。

**正确用法清单（CORS）**：

1. 允许源写成显式白名单，逐项精确比对收到的 `Origin`，命中才回填该源；不命中就不回放行头，而不是“回什么都行”。
2. 带凭证的接口不用 `*`，不用“原样反射请求 `Origin`”代替白名单。
3. 响应随 `Origin` 变化时带 `Vary: Origin`。
4. 预检与实际响应的放行头都要配齐：只配预检、不配实际响应，脚本仍然读不到。
5. 先分清“公开”与“带凭证”：公开数据用 `*` 没问题，带凭证与个人数据一律走显式源白名单。

### 4.2 postMessage：窗口之间的显式传话

`window.postMessage()` 让不同源的窗口（页面与它打开的弹窗、父页面与 iframe）能直接传消息。它不经过服务器，收发双方的校验责任全在页面代码里——两边的校验缺一边，机制就不完整。

**发送方：写死目标源。**

```js
// 示例未实测：浏览器内收发行为未在本机实测，写法按 MDN 规范示意
iframe.contentWindow.postMessage(
  { type: 'ready', version: 1 },
  'https://widget.example.com', // 明确的目标源，不是 '*'
);
```

`targetOrigin` 是“对方窗口此刻的源必须是什么，不符就不投递”。已知对方源时永远写明确值；写 `'*'` 等于“不管对方现在是谁都投递”，对方若已被导航到别的源，消息就落到错误的人手里。敏感内容绝不能配 `'*'`。

**接收方：三道校验，缺一不可。**

```js
// 示例未实测：浏览器内收发行为未在本机实测，写法按 MDN 规范示意
window.addEventListener('message', (event) => {
  // 1. 校验来源：与预期源做精确字符串比对，不做子串、后缀匹配
  if (event.origin !== 'https://widget.example.com') return;
  // 2. 校验来源窗口：对话方固定时，比对 event.source 是否为预期窗口引用
  if (event.source !== expectedWindow) return;
  // 3. 校验消息结构：按约定格式检查字段，内容只当数据处理，不当代码执行
  if (typeof event.data?.type !== 'string') return;
  handleMessage(event.data);
});
```

要点逐条说明：

- `event.origin` 是发送方在调用 `postMessage` 那一刻的源，格式为 `协议://主机[:端口]`；它是“对方自称的来源标签”，浏览器如实提供，但**信任与否由接收方比对白名单决定**，不是“浏览器说可信就可信”。
- 不预期接收跨源消息的页面，就不要注册 `message` 监听；注册了监听却不校验来源，等于向所有源敞开了处理入口。
- 消息内容只当数据：按约定结构校验字段，绝不把收到的字符串当代码执行、也不原样拼进页面结构里。
- 窗口关系固定时（如已知 iframe 引用），再比对 `event.source`，可把“源对了但窗口不对”的情形也挡掉；需要双向多轮对话时，可用 `MessageChannel` 建立专用端口，收敛通信面。

### 4.3 JSONP：把数据当脚本执行的遗留办法

JSONP 的机制只有一句话：利用“脚本引入不受同源读取限制”这一例外，把数据包进一次函数调用里当脚本加载。页面先定义好回调函数，再动态插入一个指向跨源地址的 `<script>` 标签，地址里带上回调名参数；服务器返回的不是纯 JSON，而是一段“回调名（数据）”形式的脚本，浏览器加载后执行它，数据就经回调函数交到了页面手里。

```js
// 机制示意（示例未实测）：页面定义回调，脚本标签触发加载与执行
function handleData(data) { /* 收到数据后的处理 */ }
const script = document.createElement('script');
script.src = 'https://api.example.com/data?callback=handleData';
document.head.appendChild(script);
// 服务器返回形如 handleData({...}) 的脚本，浏览器执行它即完成“传数据”
```

它的风险与局限都源于同一个机制事实：**返回内容是代码，且在引入页的源里执行**。由此得出三条硬边界：

- **只能读公开数据**：引入即信任对方脚本，对方返回什么代码都会在引入页的源里跑；敏感数据、登录态相关数据不走 JSONP。
- **仅支持 GET**：脚本标签只能发 GET，没有方法、请求头、状态码这一套精细控制；错误处理也弱——加载失败与业务失败难以区分，超时要靠自己计时。
- **不要再为新项目选它**：能改服务端就配 CORS；改不了服务端又必须跨源读公开数据时，优先考虑服务端代理转发（浏览器只与同源代理打交道，代理再去请求第三方）。JSONP 只留在“既不能改服务端、又没有代理、且数据公开”的遗留场景里认识它、读懂旧代码，而不是新写它。

## 5. 关键设计取舍

- **CORS：服务器放行换浏览器执行**：放行逻辑写在服务器响应头里，浏览器统一执行；代价是配置分散在每个接口上，漏配一个头就表现为“浏览器报错、服务器日志正常”，排障要两边对照着看。
- **预检：多一次往返换事前确认**：对可能产生副作用的请求先问一句，避免“实际请求已发出、事后才发现不许读”的尴尬；代价是多一次 OPTIONS 往返，`Access-Control-Max-Age` 缓存就是给这项成本打的折扣。
- **postMessage：双方校验换无服务器中转**：窗口间直连、延迟低；代价是校验责任全在页面代码，发送方漏写目标源、接收方漏校验来源，任何一边都会让机制失效。
- **JSONP：零服务端改动换全部信任**：老系统不用改一行服务端代码就能跨源取数；代价是把“数据”升级成“代码执行权”，这笔账在今天算不过来，所以它退场了。

## 6. 分类与变体

- 按放行主体：服务器放行（CORS）、双方互认（postMessage）、引入即信任（JSONP）。
- 按凭证：无凭证公开放行（CORS `*`）、带凭证显式源放行（CORS 白名单 + `Allow-Credentials`）、不经过 HTTP 凭证体系（postMessage 只传消息内容本身）。
- 按请求阶段：事前问（CORS 预检）、事后判（CORS 简单请求的响应头检查）、无 HTTP 阶段（postMessage、JSONP 加载即执行）。
- 按新旧：现行标准（CORS、postMessage）、遗留（JSONP）。

## 7. 应用与限制

- 应用：前后端分离的跨源接口读取（CORS，白名单 + 凭证模式按需选）；第三方 iframe 与宿主页面交换状态（postMessage，双方校验）；读懂并逐步替换老系统里的 JSONP 调用（先认出它，再按 4.3 的替代路径迁移）。
- 限制：CORS 拦不住非浏览器客户端，也拦不住“请求被发出”本身——服务器鉴权不能省；`postMessage` 只解决窗口间通信，不解决跨源接口读取；JSONP 解决不了写操作、带凭证的精细控制与可靠错误处理。
- 常见误解：
  - “`curl` 能拿到，CORS 就是坏的”：错。CORS 是浏览器执行的读取管制，`curl` 不受它约束；第 8 节实测里 `curl` 拿到响应体、浏览器脚本却读不到，正是同一回事的两面。
  - “配了 `*` 就万事大吉”：错。带凭证时 `*` 无效，浏览器会直接拒绝暴露响应；公开数据与带凭证数据要分开配。
  - “预检通过等于接口鉴权通过”：错。预检只是“允不允许这样发”，实际请求仍要走正常的鉴权与业务校验。
  - “`postMessage` 写了 `'*'` 也没事，反正接收方会校验”：错。发送方 `'*'` 是在投递环节就放弃了目标约束，接收方校验管的是“收不收”，补不回“发错了人”。
  - “JSONP 就是一种 AJAX”：错。它不走 `XMLHttpRequest` / `fetch`，没有状态码与响应头语义，本质是动态脚本加载。

## 8. 本地实测（代理 VM 上实际运行，2026-11-04）

> 实测范围说清在前：下面跑通的是**服务器响应头行为**——双端口本地服务 + `curl` 模拟跨源请求。浏览器自动发预检、浏览器拦截脚本读取、`postMessage` 的浏览器内收发，均未在本机浏览器实测，正文相关代码示例均已标“示例未实测”。

环境：代理 VM，Python 3.12.3，curl 8.5.0。8000 端口起静态页（扮演源 `http://127.0.0.1:8000`），8001 端口起演示 API：`/private` 只对白名单源回放行头并带凭证许可，`/public` 对任意源回 `*`。

实际运行过的命令与结果（响应头节选）：

```bash
# 1. 简单请求：白名单源访问 /private
curl -s -i -H "Origin: http://127.0.0.1:8000" http://127.0.0.1:8001/private
# → HTTP/1.0 200 OK
#   Access-Control-Allow-Origin: http://127.0.0.1:8000
#   Vary: Origin
#   Access-Control-Allow-Credentials: true
#   {"ok":true}

# 2. 预检请求：模拟浏览器为 POST + 自定义头先发的 OPTIONS
curl -s -i -X OPTIONS \
  -H "Origin: http://127.0.0.1:8000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  http://127.0.0.1:8001/private
# → HTTP/1.0 204 No Content
#   Access-Control-Allow-Origin: http://127.0.0.1:8000
#   Access-Control-Allow-Methods: GET, POST
#   Access-Control-Allow-Headers: Content-Type, Authorization
#   Access-Control-Max-Age: 600

# 3. 非白名单源访问 /private：服务器仍返回 200 与响应体，只是不回放行头
curl -s -i -H "Origin: http://127.0.0.1:9999" http://127.0.0.1:8001/private
# → HTTP/1.0 200 OK（无 Access-Control-Allow-* 头）{"ok":true}
#   结论：CORS 不拦服务器响应，只决定浏览器脚本能不能读——curl 看得到，浏览器脚本看不到。

# 4. 公开端点 /public：任意源均回 Access-Control-Allow-Origin: *
curl -s -i -H "Origin: http://127.0.0.1:9999" http://127.0.0.1:8001/public
# → Access-Control-Allow-Origin: *

# 5. 不带 Origin 的请求（curl 默认）：无放行头，与“浏览器不发 Origin 时无 CORS 语义”一致
curl -s -i http://127.0.0.1:8001/private
# → HTTP/1.0 200 OK（无 Access-Control-Allow-* 头）
```

**实测通过**：以上 5 组命令均在代理 VM 上实际运行，结果如上；演示脚本未落盘进仓库（一次性验证用脚本，跑完即停）。未实测项：浏览器内 `fetch` 的自动预检与读取拦截、`postMessage` 收发、JSONP 脚本加载，均标示例未实测，留待读者在自己浏览器里按第 7 节思路验证。

---

## 文章信息（统一字段）

- 来源：MDN Web Docs《Cross-Origin Resource Sharing (CORS)》；WHATWG《Fetch Standard》CORS 相关章节；MDN Web Docs《Window.postMessage()》；OWASP《JavaScript and TypeScript Security Cheat Sheet》（postMessage 校验要点）。
- 适用版本：不适用（原理篇；各浏览器对预检后重定向等边缘行为的支持以官方发布为准）。
- 核实日期：2026-11-04
- 成熟度：成熟应用（JSONP 为遗留技术，不推荐新用）
- 难度：L3
- 前置知识：[同源策略详解](14-same-origin-policy.md)（本组上一篇：源的定义与读隔离）、[网络栈与缓存](02-network-cache.md)（本组第二篇：请求/响应头机制）、[存储与 Cookie 模型](03-storage-cookie.md)（本组第三篇：凭证随请求发送的规则）
- 相关主题：[Cookie 属性与安全](08-cookie-attributes-security.md)（Cookie 跨站与凭证发送规则见该篇）；[内容安全策略 CSP 入门](13-content-security-policy.md)（脚本来源管控等防御配置见该篇）
- 未完成项：浏览器内 `fetch` 自动预检与读取拦截、`postMessage` 收发、JSONP 加载均未在本机浏览器实测，正文已标示例未实测；各浏览器对预检后重定向的支持差异未逐家核实；`Access-Control-Allow-Origin` 对 `null` 源等边缘取值的处理未展开。
