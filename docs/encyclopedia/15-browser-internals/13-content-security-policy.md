---
description: "15 浏览器与互联网底层：内容安全策略 CSP 入门——指令、源表达式、报告机制、正确配置方法与常见误配；只讲防御配置，不写绕过方法。"
---

# 内容安全策略 CSP 入门

## 1. 本章目标

读完本篇，能读懂一条 CSP 响应头、知道 `default-src`、`script-src`、`object-src`、`base-uri`、`frame-ancestors` 各管什么，并能按“先报告、后收紧、再强制”的顺序给自己的站点配一条不出大错的策略。

## 2. 背景与问题

浏览器默认很“好说话”：页面里写了从哪加载脚本、样式、图片，浏览器一般就照办。于是页面上一处内容注入——比如一段没过滤干净的用户输入被当成脚本执行——就可能直接变成数据外泄或页面劫持。CSP 的思路是反过来的：由站点自己给浏览器一份**资源 allowlist**（允许清单），声明“这个页面只允许从这些来源加载这些类型的资源”，不在清单里的，浏览器直接不加载、不执行。注入的内容纵然进了页面，也因为“来源不在清单里”而跑不起来。

定位要先说清：CSP 是**纵深防御的一层**，不是输入过滤的替代品。正确做法永远是“服务端先做好输入校验与输出编码，CSP 再兜底”；只上 CSP、不修注入点，等于只锁了后门、前门还敞着。注入漏洞的分类与修复流程属 10 域，见文末相关主题，不在此重复。

## 3. 总体架构

CSP 由三部分组成，缺一不可：

```
服务器响应头（推荐）或 <meta> 标签（受限，见 4.5）
        │
        ▼
策略 = 一条条“指令” ，指令之间用 ; 分隔
        │
        ▼
每条指令 = 指令名 + 源表达式列表
        │
        ▼
浏览器按资源类型查表：脚本查 script-src、图片查 img-src……
查不到专用指令时，查 default-src 兜底（个别指令不参与兜底，见 4.2）
```

- **下发方式**：首选 `Content-Security-Policy` 响应头；其次是 `Content-Security-Policy-Report-Only`（只报告、不拦截，用于上线前观察）。`<meta http-equiv>` 也能下发策略，但有限制（见 4.5），能发响应头就不要用 `<meta>`。
- **执行方**：浏览器。策略写错了，浏览器不会“猜你的意思”，只会按字面执行——这就是误配多发的根源。
- **报告方**：浏览器把拦截事件以报告形式发回你指定的端点（见第 5 节），这是调优策略的唯一可靠依据，不要凭感觉收紧。

## 4. 工作机制

### 4.1 指令：按资源类型分工

常用指令（完整指令表以 W3C CSP Level 3 与 MDN 文档为准）：

| 指令 | 管什么 | 不写它时会怎样 |
|---|---|---|
| `default-src` | 所有未单独列出的资源类型的兜底 | 无兜底，等于对该类型不设限 |
| `script-src` | 脚本（含 WebAssembly） | 回落到 `default-src` |
| `script-src-elem` / `script-src-attr` | 元素脚本 / 内联事件处理器等属性脚本；未列出时回落到 `script-src` | 回落到 `script-src`，再回落到 `default-src` |
| `style-src` | 样式表与内联样式 | 回落到 `default-src` |
| `img-src` | 图片 | 回落到 `default-src` |
| `font-src` | 字体 | 回落到 `default-src` |
| `connect-src` | fetch / XHR / WebSocket / EventSource 等连接 | 回落到 `default-src` |
| `media-src` | 音视频 | 回落到 `default-src` |
| `frame-src` | 嵌套浏览上下文（iframe 等）的来源 | 回落到 `default-src`（CSP Level 3 中该指令恢复为正式指令，见 4.6） |
| `worker-src` | Worker（含 Service Worker）的来源 | 回落到 `script-src`，再回落到 `default-src` |
| `manifest-src` | 应用清单 | 回落到 `default-src` |
| `object-src` | 插件类对象（`<object>`、`<embed>` 等） | 回落到 `default-src`——**必须显式写 `'none'`**，见 4.4 |
| `base-uri` | `<base>` 标签可指向的 URL | **不参与 `default-src` 兜底**，不写等于不设限，见 4.4 |
| `form-action` | 表单可提交的目标 | 不参与 `default-src` 兜底 |
| `frame-ancestors` | 谁可以把本页面嵌进 frame / iframe / object / embed | **不参与 `default-src` 兜底**，不写等于任何人可嵌，见 4.4 |
| `navigate-to` | 文档可导航到的目标 | 已从 CSP Level 3 中移除（见 4.6），不要再写 |

### 4.2 源表达式：allowlist 怎么写

一条指令后面跟一个或多个源表达式，任一表达式命中即放行（“或”关系，不是“且”）：

- `'none'`：什么都不放行。最严，用于 `object-src` 这类“根本不该有”的类型。
- `'self'`：与文档同源（协议 + 域名 + 端口都相同）才放行。
- 主机源：如 `https://cdn.example.com`，只放行该主机的该协议；写 `example.com` 这类裸域名时协议含义以规范为准，生产策略建议写全 scheme。
- scheme 源：如 `https:`，放行该协议下的任意主机——范围很宽，只适合做向后兼容的兜底（见 4.4），不适合做主力限制。
- `'unsafe-inline'`：放行内联脚本与内联样式。名字里的 unsafe 是认真的：它会让“注入的内联脚本”与“你自己写的内联脚本”无法区分，**能不用就不用**，替代办法见 4.3。
- `'unsafe-eval'`：放行动态代码求值。同样能不用就不用；需要它的老代码应先改造，而不是先放行。
- `'nonce-…'` 与 `'sha256-…'` 等哈希：只放行携带匹配 nonce 属性、或内容哈希匹配的内联脚本 / 样式。见 4.3。
- `'strict-dynamic'`：配合 nonce / 哈希使用，让受信脚本动态加载的后续脚本继承信任。见 4.3。

### 4.3 内联脚本的正确放行方式：nonce、哈希、strict-dynamic

内联脚本没有“来源”可供 allowlist 匹配，所以默认是不放行的。正确放行只有两条路：

- **nonce（一次性随机数）**：服务器为**每一次响应**生成一个密码学安全的随机值，同时写进策略（`'nonce-随机值'`）和受信脚本标签的 `nonce` 属性里，浏览器比对一致才执行。关键点：每次响应都必须换新值——写进静态缓存页面、按会话复用、按版本写死的 nonce 都等于没设防。策略里同时出现 nonce（或哈希）时，浏览器会忽略同指令里的 `'unsafe-inline'`。
- **哈希**：对内容完全固定的内联脚本，预先算出其内容哈希写进策略（`'sha256-…'`）。脚本内容一改（哪怕改一个字符），哈希就失效，必须同步更新策略——适合极少变动的内联片段，不适合频繁改动的代码。
- **`'strict-dynamic'`**：解决“受信脚本还要动态加载更多脚本”的现实问题。开启后，由 nonce / 哈希背书的脚本所加载的后续脚本自动继承信任；同时，策略里的主机源、`'self'`、`'unsafe-inline'` 会被忽略。向后兼容的写法是同时保留主机源与 `'unsafe-inline'` 做兜底：支持 `strict-dynamic` 的浏览器忽略它们，不支持的老浏览器至少还有主机 allowlist 可用——但这只是兼容手段，不是推荐主力写法，各浏览器对 `strict-dynamic` 的支持版本以 MDN 为准（待核实）。

### 4.4 正确配置方法与常见误配

**推荐的上线顺序（先报告、后收紧、再强制）**：

1. **先上 Report-Only**：用 `Content-Security-Policy-Report-Only` 发候选策略 + 报告端点，跑一段时间（至少覆盖一次完整业务周期），只看报告、不拦截。
2. **按报告补 allowlist**：报告里出现的合法来源逐一确认后加进策略；来源不明的先查清业务归属再决定，不要“报告里有就加”。
3. **切强制并收紧**：确认无合法资源被误拦后，改发 `Content-Security-Policy`；随后逐步去掉 `'unsafe-inline'` / `'unsafe-eval'`，换成 nonce 或哈希。
4. **长期留报告**：强制策略也要配报告端点——新功能上线、第三方换域名时，报告是第一时间发现误拦的渠道。

**一份可作起点的严格策略骨架（示例未实测，nonce 须由服务端每次响应生成）**：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'nonce-{每次响应生成的随机值}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  report-to csp-endpoint
```

> 注意：这只是骨架，不是“复制即用”的成品。真实站点一般还要按报告补 `img-src`、`style-src`、`connect-src`、`font-src` 等；`frame-ancestors 'none'` 表示不允许任何站点嵌套本页面，如需允许特定合作方嵌套，应改为该合作方的源而不是直接删掉本行。

**常见误配（只讲误配形态与修正方向，不给绕过方法）**：

- **只写 `default-src 'self'` 就以为完事**：`object-src`、`base-uri`、`frame-ancestors` 等不参与或不完全依赖 `default-src` 兜底。修正：`object-src 'none'`、`base-uri 'none'`、`frame-ancestors` 三项显式写出。
- **长期保留 `'unsafe-inline'` / `'unsafe-eval'`**：等于把 CSP 最想拦的内联执行又放了回来。修正：按 4.3 换 nonce / 哈希，`'unsafe-inline'` 只作不支持 `strict-dynamic` 的老浏览器的兼容兜底，且须确认现代浏览器会因 nonce 存在而忽略它。
- **把 nonce 写进静态文件或缓存**：nonce 一旦可复用、可预测，就不再是“一次性”凭证。修正：nonce 必须服务端每次响应动态生成，且含 nonce 的响应不得被 CDN / 代理按静态内容缓存。
- **通配符与宽 scheme 源做主力**：如 `*.example.com` 配上可被任意子域利用的场景、或 `https:` 做 `script-src` 主力，都会让 allowlist 名存实亡。修正：主机源写全、写窄；宽源只出现在兼容兜底位。
- **只发 `<meta>` 就以为全覆盖**：`frame-ancestors`、`report-uri`、`sandbox` 等指令在 `<meta>` 里会被忽略（见 4.5）。修正：能发响应头就发响应头。
- **上线就直接强制、无报告期**：第一个被误拦的往往是支付、统计、客服等第三方资源，业务先断才发现。修正：严格执行 4.4 的四步顺序。

### 4.5 下发方式的限制：响应头 vs `<meta>`

- 响应头是完整形态：所有指令都可用。
- `<meta http-equiv="Content-Security-Policy">` 是受限形态：按 CSP Level 3 规范，`frame-ancestors`、`report-uri`、`sandbox` 等指令在 `<meta>` 里不生效；`Content-Security-Policy-Report-Only` 也不能用 `<meta>` 下发。
- 多个策略并存时，浏览器取**交集**执行（所有策略都要通过才放行），而不是“后来者覆盖”。调试时先确认响应里到底发了几条策略，避免“明明放行了却被另一条策略拦住”的困惑。

### 4.6 规范状态：Level 2 与 Level 3

经 2026-11-04 联网核查：CSP Level 2 已是 W3C 推荐标准；CSP Level 3 目前仍在草案演进中（核查时 w3c.github.io 上为编辑草案），它相对 Level 2 的主要变化包括：按 Fetch 规范重写、废弃 `report-uri` 改用 `report-to`（见第 5 节）、恢复 `frame-src` 为正式指令、新增 `worker-src` 与 `manifest-src`、移除 `navigate-to`。各浏览器对 Level 3 各指令的支持程度并不完全一致，生产配置前应以 MDN 各指令页的兼容性表为准（待核实项，见文末）。本文不把任何草案内容写成已定标准。

## 5. 报告机制

报告是 CSP 唯一内置的“我拦了什么”反馈通道，调优全靠它：

- **旧机制 `report-uri`**：策略里直接写上报地址，浏览器以 `application/csp-report` 格式 POST 一份报告。CSP Level 3 已将其废弃，改为 `report-to`，但为兼容老浏览器，过渡期可两者同写——支持 `report-to` 的浏览器会忽略 `report-uri`，不会重复上报。
- **新机制 `report-to`**：策略里只写端点**名字**（如 `report-to csp-endpoint`），真正的名字 → 地址映射由另一条响应头 `Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"` 定义（Reporting API）。报告以 `application/reports+json` 格式批量上报。注意区分两个名字相近的东西：`report-to`（CSP 指令，现行）与已废弃的 `Report-To`（旧版 Reporting API 响应头）不是一回事，新配置只用 `Reporting-Endpoints`。
- **报告里有什么**：被拦资源的 URL、违反的指令、文档地址等（只讲字段类别，不展开可用于探测的用法）。报告端点本身必须用 HTTPS，且应做好限流与去重——公开的报告端点收到海量噪声报告是常态，入库前先过滤、聚合再告警。
- **Report-Only 与报告的关系**：`Content-Security-Policy-Report-Only` 只报告、不拦截，是上线前观察期的标准做法；它与强制头可同时存在，互不冲突。

## 6. 合法研究范围

本篇只讲防御配置：如何写策略、如何读报告、如何修正误配。未授权测试他人系统是违法行为，本文不提供相关指导。本篇不写 CSP 绕过、策略探测或利用被拦资源的任何操作步骤；全文出现的策略示例均为防御侧配置，示例中的域名与 nonce 均为占位写法。

## 7. 实验环境（示例未实测）

> 本地没有可跑浏览器实验的环境：以下均为读者在自己站点 / 本地服务上的验证方法示例，未在本机实测，不许理解为“实测通过”。

- 环境：自己名下的测试站点或本地开发服务，能改响应头即可；不要拿他人站点做实验。
- 观察方法（只读防御侧）：
  1. 先发 Report-Only 策略，在浏览器开发者工具的控制台与网络面板里看 CSP 拦截提示与报告请求，确认报告端点确实收到报告。
  2. 逐步把策略切为强制，每收紧一步刷新一次页面，确认业务功能（登录、支付、图片、样式）无回归。
  3. 用浏览器开发者工具查看最终生效的响应头，确认只有一条强制策略、没有被代理或 CDN 叠加第二条策略。
- 权限要求：只需改自己测试站点的响应头；不需要任何浏览器特殊开关。

## 8. 风险

- **误拦导致业务中断**：收紧过快、没走报告期，最常见的后果不是“被攻破”，而是“合法资源被拦、页面功能损坏”。规避做法：严格执行 4.4 的四步顺序。
- **误以为“上了 CSP 就安全”**：CSP 拦的是“不在 allowlist 里的资源加载”，拦不住同源脚本本身的逻辑缺陷、也不替代输入校验与输出编码。规避做法：CSP 与服务端校验并行，缺一不可。
- **报告端点泄露与噪声**：报告里含页面 URL 与资源 URL，端点应鉴权、限流、定期清理；不要把报告原文原样公开。规避做法：报告只进内部系统，聚合后再用于调优。

## 9. 检测方式

- **控制台与报告双通道**：浏览器控制台的 CSP 提示用于即时调试；报告端点的数据用于长期趋势（哪条指令最常被触发、哪个第三方域名最常出现）。
- **策略生效检查**：上线后抽查真实响应头，确认策略与预期一致、未被 CDN / 代理改写或叠加；定期复查 nonce 是否每次响应都变化（同一 nonce 在两次响应里重复出现即为配置缺陷）。
- **回归检查**：每次新增第三方资源（统计、客服、支付、字体）前，先在 Report-Only 下观察，再进强制策略；第三方换域名是 CSP 误拦的高发源。

## 10. 常见误解

- “CSP 能防所有注入”：错。CSP 是资源加载 allowlist，不替代输入校验与输出编码；同源的可信脚本本身出问题，CSP 拦不住。
- “`default-src 'self'` 就是全站锁死”：错。`frame-ancestors`、`base-uri` 等不参与兜底，不显式写就等于没锁。
- “`'unsafe-inline'` 加了 nonce 就没事”：方向反了。是“有了 nonce，浏览器会忽略同指令的 `'unsafe-inline'`”——但这只对支持该规则的现代浏览器成立，老浏览器仍会执行 `'unsafe-inline'`，所以它只能做兼容兜底，不能做安全依赖。
- “CSP 写进 `<meta>` 和响应头一样”：错。`frame-ancestors`、`report-uri`、`sandbox` 在 `<meta>` 里不生效，见 4.5。

## 11. 与浏览器沙箱、沙箱指令的区别

容易混淆的两个“沙箱”要分清：

- **进程沙箱**（上一篇）：操作系统进程级的隔离，关的是“网页代码能碰到什么系统资源”，见 12 篇。
- **CSP `sandbox` 指令**：文档级的权限限制，给被嵌套或特定页面加“禁止脚本、禁止表单提交、禁止弹窗”等限制，是页面策略的一部分，不是进程隔离。两者名字相近、层次完全不同，不要互相替代。

---

## 文章信息（统一字段，必填）

- 来源：W3C《Content Security Policy Level 3》编辑草案（w3c.github.io/webappsec-csp）；MDN Web Docs《Content Security Policy (CSP)》指南与各指令参考页；OWASP Cheat Sheet《Content Security Policy》。以上均为公开文档；各指令的浏览器支持版本以 MDN 兼容性表为准。
- 适用版本：不适用（配置篇；CSP Level 2 为 W3C 推荐标准，Level 3 为草案演进中，各指令支持度以 MDN 为准）。
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[渲染引擎与渲染流程](01-rendering-pipeline.md)（页面资源从哪来）、[网络栈与缓存](02-network-cache.md)（响应头随响应下发）、[浏览器沙箱与进程架构](12-browser-sandbox-architecture.md)（上一篇：进程级隔离，与 CSP 的文档级限制区分）
- 相关主题：[同源策略](14-same-origin-policy.md)、[浏览器沙箱与进程架构](12-browser-sandbox-architecture.md)（进程沙箱 vs CSP `sandbox` 指令）、[漏洞分类与研究方法](../10-security/01-vulnerability-classification-research.md)（10 域，注入类漏洞的防御侧分类）、[检测与应急响应](../10-security/03-detection-incident-response.md)（10 域，报告数据的告警与复盘）
- 未完成项：CSP Level 3 各指令在 Chrome / Firefox / Safari 最新版中的支持细节待按 MDN 兼容性表逐项核实（本文未写死各浏览器版本号）；`'strict-dynamic'` 的各浏览器最低支持版本待核实；Firefox / Safari 移动端对 `report-to` 与 `Reporting-Endpoints` 的支持现状待核实；`require-trusted-types-for` 等进阶指令本文未展开，属后续进阶主题。
