---
description: "15 浏览器与互联网底层：Cookie 属性与安全——SameSite、Secure、HttpOnly、分区 Cookie（CHIPS）、过期与作用域的匹配规则、常见误配与正确配置。"
---

# Cookie 属性与安全

> 本篇是总览篇的深挖篇。总览与分工见[存储与 Cookie 模型](03-storage-cookie.md)：那篇讲“几种存储各用来装什么”，本篇只讲 Cookie 这一项的属性、安全语义与配置——不重复总览的存储对照表。

## 1. 本章目标

读完本篇，能读懂一条 `Set-Cookie` 的全部属性、说清浏览器在什么请求里会带它、什么请求里不会带，并能给登录态、偏好、内嵌组件三类 Cookie 各写出一组不出常见错误的配置。

## 2. 背景与问题

Cookie 的麻烦不在于“存一个名值对”，而在于“它会自动跟请求走”。一个 Cookie 一旦种下，之后每个匹配的请求都会无声地带上它——包括来自别的站点的请求、包括不安全的 HTTP 请求、包括页面脚本本不该看到的请求。属性就是给这种“自动”加的约束：作用域约束它去哪、过期约束它活多久、传输与脚本约束约束它经谁的手、跨站约束约束它跟不跟别的站点走。缺一个约束，就多一类风险；约束写错，功能先断、风险未必少。

## 3. 总体架构

一条 Cookie 在浏览器里的身份与约束可以画成这样：

```
服务器响应 Set-Cookie: name=value; Domain=…; Path=…; Expires/Max-Age=…;
                       Secure; HttpOnly; SameSite=…; Partitioned
        │
        ▼
Cookie Jar（按“名 + Domain + Path”区分，Partitioned 的再加“顶级站点”作第二把钥匙）
        │
        ▼ 每次发请求时逐项匹配
Domain 匹配？ → Path 匹配？ → 未过期？ → Secure 要求满足？ → SameSite/分区要求满足？
        │ 全部通过
        ▼
请求头 Cookie: name=value（只带名值，不带属性）
```

两个要点先定下来：

- **属性只在“种”和“匹配”时起作用**：发出去的 `Cookie` 头里只有 `name=value`，服务器从请求里看不到这条 Cookie 当初带了什么属性；属性是浏览器侧的约束，不是服务器每次都能复核的证据。
- **Cookie 的身份是三元组**：同名但 `Domain` 或 `Path` 不同的，是不同的 Cookie；覆盖与删除都必须对上同一组身份（见 4.1），只写个同名值是删不掉的。

## 4. 工作机制

### 4.1 名值与身份：覆盖、删除都要对上身份

- 一条 `Set-Cookie` 就是一个名值对加一组属性。值通常要做编码（例如对特殊字符做 URL 编码），这是实现细节，不展开。
- 新 Cookie 与已存 Cookie 的名、`Domain`、`Path`（分区 Cookie 再加分区键）都相同，才算“覆盖”旧的；否则是新增一条并存的 Cookie。
- 删除没有专门的“删除指令”：服务器发同一名、同一 `Domain`、同一 `Path`，并把 `Max-Age=0`（或把 `Expires` 写成过去时间），浏览器收到后清除它。第 9 节的实测里，`demo_pref` 就是这样从 curl 的 Cookie 文件里消失的。

### 4.2 作用域：Domain 与 Path

- **`Domain`**：不写时，Cookie 默认只属于“种下它的那个主机”（host-only），子域拿不到。写了 `Domain` 后，同一父域下的子域可以共享它——方向只能是放宽到自身的父域，不能写成无关域名。子域共享是便利，代价是共享域内任何一个子域出问题都可能影响这条 Cookie 的使用面，所以作用域能小就不要放大。
- **`Path`**：按路径前缀匹配。`Path=/` 表示该主机下所有路径都匹配；`Path=/account/` 只匹配 `/account/` 及其子路径。实测（见第 9 节）验证了这一点：`Path=/echo` 的 Cookie 在请求 `/other` 时没有被带上，而 `Path=/` 的 Cookie 被带上了。
- **Path 不是访问控制**：它只决定“请求带不带”，不决定“谁有权读”。不要以为把敏感 Cookie 缩到某个路径就等于做了权限隔离——同源脚本、匹配路径的请求、服务器侧的校验才是各自的防线。路径缩得过细还会导致“登录页能读、业务页读不到”之类的功能故障，排查时先看 Path。

### 4.3 生命周期：Expires、Max-Age 与会话 Cookie

- **会话 Cookie**：既不写 `Expires` 也不写 `Max-Age`。浏览器会话结束即失——注意“会话结束”在各实现里与“关闭浏览器”“关闭标签页”的对应关系有差异，不能把它当精确的登出机制用；需要可靠登出的，服务器侧要另有失效手段（例如会话标识本身可吊销，本篇不展开服务器会话设计）。
- **持久 Cookie**：写了 `Expires`（绝对日期）或 `Max-Age`（从种下起算的秒数）之一。两者都写时，`Max-Age` 优先；新实现优先用 `Max-Age`，因为它不依赖客户端时钟是否准确。
- **上限不是你写多少就是多少**：Chrome 自 104 版（2022 年 8 月）起把 Cookie 有效期上限钳制在 400 天，写更久的会被缩到 400 天而不是被拒绝。其他浏览器的上限策略各异，**以官方发布为准（待核实）**，见文末未完成项。写“两年有效”之前，先确认目标浏览器会不会把它缩短。
- **过期只是上限，不是保证**：用户清站点数据、浏览器配额与清理策略、设备更换都会让 Cookie 提前消失。重要状态不要只押在一条长效 Cookie 上。

### 4.4 传输与脚本可见性：Secure 与 HttpOnly

- **`Secure`**：只在 HTTPS 请求里发送，HTTP 请求不带。localhost 在开发时被豁免 HTTPS 要求（以实现为准）。实测里 curl 在明文 HTTP 下就没有带上标 `Secure` 的两条 Cookie（见第 9 节）——这是 curl 的 Cookie 引擎行为，与浏览器语义一致的方向，但**不是浏览器实测**，不要把它当成浏览器的证明。
- **`HttpOnly`**：脚本读不到。`document.cookie` 与 Cookie Store API 都看不到它；但浏览器在匹配的请求里仍然会带它。只能由服务器经 `Set-Cookie` 种下，页面脚本写不出带 `HttpOnly` 的 Cookie。
- **两者都不等于加密**：`Secure` 只约束“走 HTTPS 才发”，`HttpOnly` 只约束“脚本读不到”。Cookie 值本身在落盘、代理日志、服务器日志里仍可能是明文；需要保密的值，传输靠 HTTPS，存储与日志靠服务器侧的最小化与脱敏，不要把敏感原文直接放进 Cookie 值里。

### 4.5 跨站发送：SameSite

`SameSite` 决定 Cookie 跟不跟跨站请求走，是 Cookie 侧最重要的一道跨站约束：

| 取值 | 跨站时发送吗 | 适用情形 |
|---|---|---|
| `Strict` | 一律不带 | 登录态、敏感操作：最严，但从外站链接点进来时首次请求也不带，可能出现“点链接进来却未登录”的体验问题，需配合登录态恢复流程 |
| `Lax` | 只带顶级导航的安全方法请求（例如从外站点击链接的 GET）；跨站 POST、图片、iframe、脚本子资源不带 | 多数第一方登录态的默认选择：兼顾“点链接进来仍登录”与“跨站子资源不带” |
| `None` | 跨站也带 | 必须跨站工作的内嵌场景；**必须同时配 `Secure`**，否则现代浏览器会拒绝 |

三条使用铁律：

1. **不要依赖缺省**：现代浏览器多以 `Lax` 作为未写 `SameSite` 时的缺省，但缺省行为因浏览器与版本而异；关键 Cookie 一律显式写出取值。
2. **`SameSite=None` 缺 `Secure` 等于没写**：浏览器会拒绝这类组合，不要在 HTTP 环境下调试跨站 Cookie——先上 HTTPS（或 localhost 豁免环境）。
3. **`SameSite` 是纵深防御的一层，不是唯一的跨站请求伪造防线**：它减少跨站请求带凭证的面，但敏感操作仍需服务器侧的校验（例如请求来源校验与一次性令牌等机制，属服务器安全设计，本篇不展开具体实现）。

### 4.6 分区 Cookie：Partitioned（CHIPS）

第三方 Cookie 的困境是：内嵌组件（聊天挂件、支付组件、嵌入式编辑器）确实需要在第三方上下文里保持自己的状态，但不分区的第三方 Cookie 又能被用来跨站追踪。CHIPS（Cookies Having Independent Partitioned State）的折中是**双键存储**：

- 普通 Cookie 的键是“种下它的域”；分区 Cookie 的键是“种下它的域 + 当前顶级站点”。
- 同一个第三方域嵌在 A 站与 B 站时，得到的是两个互不可见的分区：在 A 站种下的值，在 B 站的内嵌里读不到、请求里也不会带。
- 写法要求：`Partitioned` 必须配 `Secure`；跨站使用时通常还要 `SameSite=None`（没有 `SameSite=None`，跨站请求根本不会带它，分区也就无从谈起）；并推荐用 `__Host-` 前缀把 Cookie 绑到确切主机。
- 示例（**示例未实测**，浏览器内跨站与分区行为未在本机验证，见第 9 节）：

```http
Set-Cookie: __Host-widget=abc; SameSite=None; Secure; Path=/; Partitioned; Max-Age=1800
```

- 实现对每个分区的 Cookie 数量与总量设有上限，**具体数值以官方发布为准（待核实）**，不要把“分区内能存多少”写进业务逻辑的假设里。
- 分区不等于“第三方 Cookie 问题解决了”：它解决的是“内嵌功能需要状态但不该跨站追踪”这一类；需要真正跨站识别用户的场景，分区 Cookie 天生做不到，那是产品设计要改、不是属性能绕过的。

### 4.7 名称前缀：`__Secure-` 与 `__Host-`

前缀是浏览器强制执行的“名字即承诺”：

- **`__Secure-`**：必须配 `Secure`，否则浏览器拒绝种下。用于“这个 Cookie 只应来自安全上下文”的声明。
- **`__Host-`**：必须配 `Secure`、必须 `Path=/`、且**不得**写 `Domain`。它把 Cookie 绑死在确切主机上，防止子域共享带来的放宽，是登录态 Cookie 值得优先考虑的形态。
- 前缀写错不会“降级生效”，而是直接被拒绝——调试时如果 Cookie 莫名其妙种不上，先检查前缀条件是否齐全。

### 4.8 服务器与脚本的分工

| | 服务器（`Set-Cookie`） | 页面脚本（`document.cookie` / Cookie Store API） |
|---|---|---|
| 能种 `HttpOnly` | 能 | 不能 |
| 能读 `HttpOnly` 的值 | 不能直接读浏览器里的值，只能在请求里收到它 | 不能 |
| 能种 `Secure` / `SameSite` / `Partitioned` | 能 | 受限：脚本种的 Cookie 同样受浏览器规则约束，且种不出 `HttpOnly` |
| 能删 Cookie | 能（同身份 + `Max-Age=0`） | 能（同身份 + 过期写法，但删不掉 `HttpOnly` 的，因为脚本看不到它、也难以精确复现其身份） |

结论很直接：**登录态与会话凭证走服务器 `Set-Cookie`**；脚本只应读写非敏感的偏好类 Cookie。把会话凭证交给脚本种、交给脚本读，就是主动放弃 `HttpOnly` 这一层。

## 5. 关键设计取舍

- **自动发送换便利、付带宽与隐私代价**：Cookie 省了脚本每次手动带凭证，但每个匹配请求都多带字节，且跨站发送能力天然带来追踪面。`SameSite` 与分区就是给这项取舍打的补丁，不是推翻它。
- **缺省宽松换兼容、显式严格换可预测**：缺省 `Lax` 让多数老站点不断，但“依赖缺省”等于把安全语义交给浏览器版本；关键 Cookie 显式写全属性，贵在多写几个词，赢在行为可预测。
- **分区换功能、弃跨站识别**：CHIPS 保住了“内嵌组件在单个顶级站点内有状态”，代价是放弃“同一个第三方在全网认出同一个人”。选分区之前，先确认产品到底需要哪一种。
- **前缀换自由度**：`__Host-` 用“不能写 `Domain`、必须 `Path=/`”换来“主机绑定”的强约束；需要子域共享的场景就不能用它，两者不可兼得。

## 6. 分类与变体

- 按作用域：主机 Cookie（不写 `Domain`）与域 Cookie（写 `Domain`，子域共享）。
- 按生命周期：会话 Cookie（无 `Expires`/`Max-Age`）与持久 Cookie（有其一）。
- 按跨站行为：同站 Cookie（`Strict`/`Lax`）与跨站 Cookie（`None` + `Secure`，可再分区）。
- 按脚本可见性：脚本可见（无 `HttpOnly`）与脚本不可见（`HttpOnly`，仅服务器种）。
- 按存储键：未分区（单键）与分区（双键，`Partitioned`）。

## 7. 应用与限制

### 7.1 三组正确配置（示例未实测：浏览器内行为未在本机验证）

第一方登录态（最常用，应为默认模板）：

```http
Set-Cookie: __Host-session=随机不透明标识; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600
```

说明：`__Host-` 绑主机、`Secure` + `HttpOnly`、`Lax` 兼顾点链接进来仍登录、短有效期（示例为 1 小时，实际按业务会话策略定，过期后由服务器侧刷新或重新登录）。

非敏感偏好（例如主题，脚本需要读）：

```http
Set-Cookie: theme=dark; Path=/; Secure; SameSite=Lax; Max-Age=2592000
```

说明：不写 `HttpOnly`（脚本要读），但值只能是非敏感偏好；敏感标识绝不能为了“脚本方便”而去掉 `HttpOnly`。

内嵌组件的分区状态：

```http
Set-Cookie: __Host-widget=abc; SameSite=None; Secure; Path=/; Partitioned; Max-Age=1800
```

说明：跨站 + 分区 + 短有效期；如果内嵌不需要跨站状态，优先改走第一方方案，而不是一律上 `SameSite=None`。

### 7.2 常见误配与正确做法

| 误配 | 会发生什么 | 正确做法 |
|---|---|---|
| `SameSite=None` 忘配 `Secure` | 浏览器拒绝，跨站功能直接断 | 一律成对写；HTTP 环境下先解决 HTTPS 再调跨站 |
| 登录态 Cookie 缺 `HttpOnly` 或 `Secure` | 脚本可读、HTTP 可带，防护层少两层 | 登录态默认 `Secure` + `HttpOnly` + 显式 `SameSite` |
| `Domain` 写得过宽 | 子域共享面扩大，任一子域的问题都波及它 | 能用 `__Host-` 就用它；必须共享时只放宽到必需的父域 |
| 把 `Path` 当权限边界 | 路径缩得再细也不是访问控制，同源与服务器校验才是 | Path 只做“带不带”的分流，权限放服务器侧 |
| 会话 Cookie 写超长有效期 | 浏览器钳制（Chrome 400 天）或用户清理都会打断假设 | 按业务定短有效期 + 服务器侧可吊销的会话 |
| Cookie 里放敏感原文 | 落盘与日志里都是明文，`Secure`/`HttpOnly` 都不加密 | 只放不透明标识，敏感数据放服务器侧 |
| 删 Cookie 只写同名空值 | 身份（`Domain`/`Path`）对不上，旧 Cookie 还在 | 删除必须同名、同 `Domain`、同 `Path`，再加 `Max-Age=0` |
| 依赖 `SameSite` 做唯一防伪造手段 | 顶级导航等放行情形仍可能带凭证 | `SameSite` + 服务器侧校验，双层 |

### 7.3 检测清单（只讲检测与防御）

1. 看响应头：登录接口的 `Set-Cookie` 是否同时有 `Secure`、`HttpOnly`、显式 `SameSite`，是否按需有 `Partitioned`；前缀条件是否齐全。
2. 看浏览器开发者工具 Application（或“应用”）面板的 Cookies 一栏：逐条核对 Domain、Path、Expires/Max-Age、Secure、HttpOnly、SameSite、Partitioned 是否与预期一致。
3. 看请求：跨站子资源、跨站 POST 是否带了不该带的 Cookie；从外站点链接进来时 `Lax` 与 `Strict` 的表现是否符合预期。
4. 看清理：登出与删除流程是否按“同身份 + `Max-Age=0`”真正清掉了 Cookie，而不是只清了页面状态。

## 8. 常见误解

- **“`Secure` 就是加密存储”**：错。`Secure` 只约束传输（HTTPS 才发），不加密落盘的值；`HttpOnly` 也只约束脚本可见性。两者合起来仍不等于“值本身是密文”。
- **“`HttpOnly` 就绝对安全”**：错。它只挡住“脚本直接读值”这一条路；请求仍会带它，网络层与服务器侧的问题它管不着。安全是分层的结果，不是某一个属性的结果。
- **“`SameSite=Strict` 后就不需要别的防伪造手段”**：错。`Strict` 很严，但顶级导航、同站请求等情形仍在规则内；敏感操作仍需服务器侧校验。
- **“把 Cookie 值设为空就是删除”**：错。必须对上身份并把有效期清零，否则旧 Cookie 还在（第 9 节实测验证了正确的删除写法）。

## 9. 本地实测：本地 HTTP 服务 + curl（实测通过）

> 实测环境：代理 VM，Python 3.12.3 内置 HTTP 服务（`http.server`），curl 8.5.0，监听 `127.0.0.1`，2026-11-04 实测。**curl 不是浏览器**：以下结果证明的是“服务器确实发出了这些头、curl 的 Cookie 引擎按 Domain/Path/Secure/过期规则做了存储与发送”，不证明浏览器（尤其是 SameSite 跨站与 Partitioned 分区）在真实跨站场景下的行为——那部分标为示例未实测。

实测 1：服务器一次发出 5 条 `Set-Cookie`，curl 全部存入 Cookie 文件：

```http
Set-Cookie: demo_session=abc123; Path=/; HttpOnly
Set-Cookie: demo_pref=dark; Max-Age=3600; Path=/; SameSite=Lax
Set-Cookie: demo_secure=s3cr3t; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax
Set-Cookie: demo_cross=xyz; Max-Age=3600; Path=/; Secure; SameSite=None; Partitioned
Set-Cookie: demo_expires=old; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/
```

实测 2：明文 HTTP 下请求回显，curl 只带了非 `Secure` 的三条，标 `Secure` 的两条未带——与 `Secure` 的“HTTPS 才发”语义一致：

```text
Cookie: demo_pref=dark; demo_expires=old; demo_session=abc123
```

实测 3：`Path` 匹配。`Path=/echo` 的 Cookie 在请求 `/echo` 时被带上，在请求 `/other` 时未被带上；`Path=/` 的 Cookie 两次都被带上。**实测通过**。

实测 4：删除。服务器对 `demo_pref` 发同名、同 `Path=/`、`Max-Age=0` 后，curl 的新 Cookie 文件里已无 `demo_pref`，后续回显也不再含它。**实测通过**。

实测的边界（必须说清）：

- `HttpOnly` 在 curl 的 Cookie 文件里仍以明文出现（文件里标 `#HttpOnly_` 前缀）——这再次说明 `HttpOnly` 约束的是浏览器内脚本读取，不是“值不可见”。
- `Partitioned` 在 curl 里只被当作普通属性存下，没有分区键的概念——curl 无法验证分区隔离。
- 浏览器内的 SameSite 跨站发送、CHIPS 分区隔离、第三方 Cookie 限制表现**均未在本机实测**，读者验证方法：用两个本地（或测试）站点做“顶级导航 vs iframe/子资源 vs 跨站 POST”三组对照，在开发者工具里看每组请求实际带了哪些 Cookie。

---

## 文章信息（统一字段）

- 来源：RFC 6265《HTTP State Management Mechanism》；IETF draft-ietf-httpbis-rfc6265bis（Cookie 规范修订草案，含 `SameSite` 缺省与 `Partitioned`）；MDN Web Docs《Set-Cookie》（https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie）；MDN Web Docs《Cookies》；web.dev 关于 CHIPS 的文档。容量与上限数字以各实现为准，正文已注明。
- 适用版本：不适用（原理篇；各浏览器上限与第三方 Cookie 限制节奏以各自文档为准）。
- 核实日期：2026-11-04
- 成熟度：成熟应用（分区 Cookie / CHIPS 为工程发展中）
- 难度：L3
- 前置知识：[存储与 Cookie 模型](03-storage-cookie.md)（本组总览篇）、[网络栈与缓存](02-network-cache.md)（本组第二篇：请求与响应头语义）、[JavaScript 基础完整教程](../../website-guide/javascript/01-basics.md)（03 域，脚本读写 Cookie 的写法）
- 相关主题：[存储与 Cookie 模型](03-storage-cookie.md)（本篇的上一层总览，必读）、[网络栈与缓存](02-network-cache.md)（缓存与存储的分工）
- 未完成项：各浏览器 Cookie 有效期上限（除 Chrome 400 天外）未逐家核实，以官方发布为准；CHIPS 每分区数量与总量上限的具体数值未以官方文档逐项核实；`Partitioned` 在 Firefox / Safari 的具体支持版本与缺省状态未逐家核实；第三方 Cookie 限制的具体时间表未逐家核实；浏览器内 SameSite 跨站发送与 CHIPS 分区隔离未在本机实测。
