---
description: "15 浏览器与互联网底层：Web 存储详解——localStorage、sessionStorage、IndexedDB、Cache Storage 的容量、生命周期、同步/异步模型、适用场景与选型。"
---

# Web 存储详解

> 本篇是总览篇的深挖篇。总览与分工见[存储与 Cookie 模型](03-storage-cookie.md)：那篇讲“几种存储各用来装什么、活多久”，本篇只讲 Web 存储四项各自的容量、生命周期、同步/异步模型与选型——不重复总览的存储对照表，也不重复 Cookie 属性（见[Cookie 属性与安全](08-cookie-attributes-security.md)）。

## 1. 本章目标

读完本篇，能为“偏好、表单临时状态、离线结构化数据、离线资源响应”四类需求各选对一种存储，并说清选错时会付出什么代价（卡主线程、标签页一关就丢、版本升级出故障、缓存永不过期）。

## 2. 背景与问题

总览篇已经划出第一条分界线：Cookie 跟请求走，其余存储不跟请求走。但“不跟请求走”内部还有第二、第三条分界线：

- **数据模型不同**：字符串键值够不够？还是要对象、索引、范围查询？
- **执行模型不同**：读写是在主线程上同步完成，还是异步、不阻塞渲染？
- **生命周期不同**：关标签页就丢、浏览器关了还在、还是由脚本自己决定何时失效？

四种存储就是这三条分界线的四种组合。选型错误不一定立刻报错：把大对象塞进同步存储，页面只是“有点卡”；把离线数据当成“永久”存着，磁盘一紧就可能丢。选型篇要讲的正是这些“不报错但会出事”的边界。

## 3. 总体架构

```
同源隔离（协议 + 域名 + 端口相同才能互访；跨源默认互不可见）
│
├── Web Storage（同步，主线程专用）
│   ├── localStorage ── 同源共享，持久
│   └── sessionStorage ─ 同源 + 标签页隔离，会话级
│
├── IndexedDB（异步，事务型）
│   └── 数据库 → 对象仓库 → 记录（对象）→ 索引 → 游标遍历
│       窗口与 Worker 均可用
│
└── Cache Storage（异步，Promise 式）
    └── 具名缓存 → Request / Response 对
        窗口与 Service Worker 均可用（典型用法在 Service Worker 里）
```

还有一条共用的配额线：IndexedDB 与 Cache Storage 共用“源配额”（按磁盘动态给），而 Web Storage 各自另有约数级的上限（见 4.1、4.2）。配额不是写进规范的固定数字，任何“超过 X 就一定失败/一定成功”的硬编码判断都会在换浏览器、换设备时出错——运行时用 `navigator.storage.estimate()` 查当前源的已用与配额（示例未实测，见 4.5）。

## 4. 工作机制

### 4.1 localStorage：同源持久的字符串抽屉

- **数据模型**：字符串键值对。键与值都只能是字符串；存对象要先序列化（例如 `JSON.stringify`），取出来再解析——序列化格式、字段演进、解析失败的兜底，都是应用自己的责任。
- **作用域与生命周期**：同源共享——同源的不同标签页、不同窗口读写同一份数据；持久——浏览器关闭、重启后还在，直到应用代码删、用户清站点数据、或浏览器按策略清理。**“持久”不等于“永久”**：把它当永久档案库，丢数据时没有人会提前通知你。
- **同步模型**：API 是同步的，且只在主线程（窗口）可用，不在 Service Worker 里。`setItem` / `getItem` / `removeItem` / `clear` 一调用就执行完才返回——写起来简单，但读写期间主线程被占用：值越大、调用越频繁，页面卡顿越明显。这是它“只能装小东西”的根本原因，不是容量数字本身。
- **容量**：约 5MB 每源（localStorage 与 sessionStorage 各约 5MB，合计约 10MB 的说法见于多家实现文档）。**这是量级，不是硬上限**：各实现有差异，以实现为准；超限时抛 `QuotaExceededError`，必须有兜底（降级、清理旧项、转 IndexedDB），不能假设“写一定成功”。
- **典型写法（示例未实测）**：

```js
// 示例未实测：浏览器内行为未在本机验证
try {
  localStorage.setItem('theme', 'dark');
  const theme = localStorage.getItem('theme'); // 'dark'
} catch (e) {
  // 超限（QuotaExceededError）或存储不可用时的兜底：不要静默丢数据
}
```

### 4.2 sessionStorage：同源、但按标签页隔离的会话抽屉

- 与 localStorage 共享同一套同步字符串 API、同一量级的容量（约 5MB 每源，以实现为准），区别只在**作用域与生命周期**两点：
  - **标签页隔离**：同源新标签页不共享——在 A 标签页存的 sessionStorage，B 标签页看不到；同一标签页内刷新、同源导航后还在（会话未结束）。
  - **标签页关闭即失**：会话结束的标志是标签页（或窗口）关闭，不是浏览器关闭；浏览器“恢复标签页”的行为因实现而异，不能依赖它来恢复 sessionStorage。
- **适用边界**：多步表单的临时状态、单页流程的中间结果——“这个标签页关了就该忘掉”的东西。需要跨标签页同步、需要浏览器重启后还在的，一律不要用它；用它存“登录态”还会导致“新标签页要重新登录”的困惑。
- **典型写法（示例未实测）**：

```js
// 示例未实测：浏览器内行为未在本机验证
sessionStorage.setItem('draft-step', '2');
const step = sessionStorage.getItem('draft-step');
```

### 4.3 IndexedDB：浏览器里的事务型对象数据库

- **数据模型**：数据库 → 对象仓库（object store，类似“表”，但存的是对象不是行）→ 记录（键 + 对象值）→ 索引（按非主键字段排序与查询）→ 游标（范围遍历）。值可以是结构化对象与二进制对象（例如文件类对象），查询靠主键、索引与键范围（`IDBKeyRange`），不是靠 SQL。
- **异步与事务**：一切操作都在事务里。事务分 `readonly` 与 `readwrite` 两种；事务内任一请求失败、事务被中止时，整批写回滚，不会出现“写一半”的状态。API 本身是事件式异步（`onsuccess` / `onerror` / `oncomplete`），不阻塞主线程；窗口与 Worker 里都可用。事件式写法繁琐是它最常见的抱怨来源——生产代码多用封装库，但封装不能掩盖事务与版本语义，出了问题仍要回到事务本身排查。
- **版本与结构升级**：这是 IndexedDB 最容易出故障的地方，也是它“像数据库”的证明：
  - 打开数据库要带版本号；已存版本低于请求版本时触发 `upgradeneeded`，结构变更（建/删对象仓库与索引）**只能**在这个回调里做。
  - 升级要按 `oldVersion` 步进写（`if (oldVersion < 1) …; if (oldVersion < 2) …`），不能假设用户一定是从上一版升上来——有人可能隔了好几个版本才回来。
  - 升级事务失败会回滚；请求版本低于已存版本会直接报错。版本规划（每次结构变更 +1、升级脚本可重入、旧数据迁移先验证再删旧结构）要当成发布流程的一部分，而不是上线前才补的脚本。
  - 典型骨架（示例未实测）：

```js
// 示例未实测：浏览器内行为未在本机验证
const req = indexedDB.open('app-db', 2);
req.onupgradeneeded = (event) => {
  const db = event.target.result;
  if (event.oldVersion < 1) {
    const store = db.createObjectStore('articles', { keyPath: 'id' });
    store.createIndex('by_updated', 'updatedAt');
  }
  if (event.oldVersion < 2) {
    req.transaction.objectStore('articles').createIndex('by_tag', 'tag');
  }
};
req.onsuccess = (event) => {
  const db = event.target.result;
  const tx = db.transaction('articles', 'readwrite');
  tx.objectStore('articles').put({ id: 1, title: '示例', updatedAt: Date.now() });
};
req.onerror = () => { /* 打开失败的兜底：不要假设数据库一定可用 */ };
```

- **容量与配额**：远大于 Web Storage，按磁盘配额动态给，与 Cache Storage 共用源配额。具体比例各实现不同：例如 Edge 文档称 IndexedDB、Cache API 与源私有文件系统合计可用约 60% 磁盘空间——**这只是该实现的示例数字，不作通用上限**；通用做法是运行时查 `navigator.storage.estimate()`，并对“配额不足、清理”有降级路径。重要数据要当“可能丢失”来设计：本地是缓存与离线副本，权威数据在服务器侧。
- **适用边界**：离线文章、结构化缓存、大量键值与二进制对象、需要索引与范围查询的数据。只存几个字符串偏好就上 IndexedDB，是“为一把钥匙配一个数据库”的过度设计。

### 4.4 Cache Storage：存“请求换回来的响应”，不是存“应用算出来的数据”

- **数据模型**：具名缓存（`caches.open('assets-v1')`）里的一组 `Request` / `Response` 对。键是请求，值是响应；匹配时看请求 URL、方法与相关 `Vary` 响应头。窗口与 Worker 都能访问，全局对象是 `caches`（`CacheStorage`）。
- **异步 Promise 式**：`caches.open()`、`cache.match()`、`cache.put()`、`cache.add()` / `cache.addAll()`、`cache.delete()`、`caches.keys()`、`caches.delete()` 全部返回 Promise，不阻塞主线程。典型用法在 Service Worker 的 `fetch` 事件里：先查缓存、命中则返回、未命中则联网并把响应的克隆存入缓存——**必须 `clone()`**，因为响应体只能消费一次，`put()` 会消费掉它，不克隆就既没法返回给页面、也没法存。
- **它不是 HTTP 缓存**：Cache API 不自动按 HTTP 缓存头过期与失效——存什么、何时失效、旧版本缓存何时删，全由脚本自己决定。实践里用“版本号写进缓存名”（`assets-v1` → `assets-v2`）加“激活时删旧名缓存”来做失效；不做这一步，缓存就是“永不过期的旧版本”。
- **仅安全上下文可用**：Cache Storage 只在安全上下文（HTTPS，localhost 开发环境按实现豁免）里可用；HTTP 环境下直接不可用，不是“降级为 HTTP 缓存”。
- **面向 GET 响应设计**：Cache API 存的是可缓存的响应，实践上用于 GET 请求的资源与数据响应；非 GET 请求的缓存行为以规范与实现为准（待核实），见文末未完成项，不要把 POST 结果往缓存里塞。
- **典型写法（示例未实测，Service Worker 内）**：

```js
// 示例未实测：浏览器内行为未在本机验证
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open('runtime-v1');
        await cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
```

### 4.5 配额查询：StorageManager

- `navigator.storage.estimate()` 返回当前源的已用量与配额估计，是“运行时查、不要硬编码”的标准做法（示例未实测）：

```js
// 示例未实测：浏览器内行为未在本机验证
const { usage, quota } = await navigator.storage.estimate();
// usage / quota 的单位与精度以实现为准；不要拿它做精确到字节的判断
```

- 估计值是估计值：磁盘空间、其他源用量、浏览器策略都会让它变化；把它当“仪表盘读数”，不要当“合同保证”。

## 5. 关键设计取舍

- **同步简单换主线程**：Web Storage 的同步 API 写起来最简单，但代价是读写占主线程；IndexedDB 与 Cache Storage 的异步 API 写起来繁琐，但换来不卡页面与大容量。数据量一过“几个小字符串”，天平就倒向异步。
- **持久换清理责任**：localStorage 与 IndexedDB 不清理就一直在；浏览器“清除站点数据”之外，应用自己要负责过期与清理策略（缓存名版本化、旧数据定期清、配额不足时先清可重建的缓存再动用户数据）。
- **同源隔离换便利**：同源是硬边界，子域想共享要靠别的机制（例如经服务器中转或 Cookie 作用域，见[Cookie 属性与安全](08-cookie-attributes-security.md)）；存储本身不提供“放宽同源”的开关。
- **响应缓存换失效责任**：Cache Storage 把“何时过期”完全交给脚本，换来的是离线可控；代价是失效逻辑一旦漏写，旧资源会一直被 serve，排查时先看缓存名与激活清理逻辑。

## 6. 分类与变体

| | localStorage | sessionStorage | IndexedDB | Cache Storage |
|---|---|---|---|---|
| 数据模型 | 字符串键值 | 字符串键值 | 对象仓库 + 索引 | Request / Response 对 |
| 同步 / 异步 | 同步 | 同步 | 异步（事件式事务） | 异步（Promise） |
| 主线程 / Worker | 主线程专用 | 主线程专用 | 两者均可 | 两者均可（典型在 Service Worker） |
| 容量量级 | 约 5MB / 源 | 约 5MB / 源 | 磁盘配额级（与 Cache 共用源配额） | 磁盘配额级（与 IndexedDB 共用源配额） |
| 生命周期 | 持久（可被清除） | 标签页关闭即失 | 持久（可被清除） | 脚本决定失效（缓存名版本化 + 删旧缓存） |
| 随请求发送 | 否 | 否 | 否 | 否（它是“对请求的回答”，不是“请求的一部分”） |
| 典型用途 | 偏好、轻量缓存 | 表单临时状态 | 离线结构化数据 | 离线资源、运行时响应缓存 |

容量数字以实现为准，跨浏览器、跨版本有差异；拿“5MB”当硬上限写判断逻辑会出错。

## 7. 应用与限制

### 7.1 选型流程（按顺序问，第一个“是”就是答案）

1. **服务器每次请求都需要它吗？** → 是：不要用本篇四种，用 Cookie（见[Cookie 属性与安全](08-cookie-attributes-security.md)）。
2. **关掉标签页就该忘掉吗？** → 是：sessionStorage。
3. **是“请求换回来的响应”、要离线复用吗？** → 是：Cache Storage（资源与 GET 响应）。
4. **数据量大、结构化、要索引查询、或要存二进制对象吗？** → 是：IndexedDB。
5. **只剩几个小字符串偏好？** → localStorage。

### 7.2 每种存储的“不要”清单

- **localStorage 不要**：存敏感凭证与令牌（同源脚本可读，脚本注入时即暴露——这是原理层面的风险陈述，不展开任何利用步骤）；存大对象与高频读写（卡主线程）；当永久档案库（可被清除）；在 Service Worker 里用（不可用）。
- **sessionStorage 不要**：存跨标签页要共享的状态；存浏览器重启后还要的东西；存登录态（新标签页体验会断）。
- **IndexedDB 不要**：不写 `onerror` / 事务失败处理就上线；升级脚本只处理“从上一版升上来”；删旧结构前不验证迁移结果；假设容量无限、假设数据永不丢。
- **Cache Storage 不要**：不做缓存名版本化与旧缓存清理（旧资源永不过期）；不 `clone()` 就 `put()`（响应体被消费）；把 POST 结果与用户私有响应无差别地长期缓存（先确认缓存策略与隐私边界）；用它代替 HTTP 缓存头来“自动过期”（它不会）。

### 7.3 安全与隐私边界（只讲原理与防御）

- Web Storage 与 IndexedDB 的内容对同源脚本可见：**不要把会话凭证、令牌、敏感原文放进本篇四种存储**；凭证走 `HttpOnly` + `Secure` 的 Cookie（见[Cookie 属性与安全](08-cookie-attributes-security.md)），敏感数据放服务器侧。
- Cache Storage 里可能躺着用户私有响应：缓存键与缓存名要按隐私边界划分，登出与清理流程要同时清缓存与数据库，不能只清页面状态。
- 清理责任在应用：提供“清除本地数据”的入口、登出时清会话级与用户级本地数据、配额不足时优先清可重建的缓存。

## 8. 常见误解

- **“localStorage 是永久的”**：错。它只是“没有写过期时间”，用户清站点数据、磁盘配额、浏览器策略都可能清掉它；重要数据要当“可能丢失”来设计。
- **“IndexedDB 就是浏览器里的 SQL”**：错。它没有 SQL 语言，是对象仓库 + 索引 + 游标的模型；按 SQL 的表连接思路写，会处处碰壁。
- **“Cache Storage 就是 HTTP 缓存的脚本版”**：错。HTTP 缓存按缓存头自动过期与再验证，Cache Storage 的存取与失效全由脚本决定；两者机制不同，不能互相替代理解。
- **“配额是固定数字，写代码时判一下就行”**：错。IndexedDB / Cache 的配额按磁盘动态给，Web Storage 的约 5MB 也是量级而非硬上限；运行时查 `estimate()`、超限有兜底，才是正确姿势。
- **“sessionStorage 关浏览器才丢”**：不精确。标签页关闭即丢；浏览器恢复标签页的行为因实现而异，不能依赖。
- **“localStorage 能在 Service Worker 里用”**：错。Web Storage 是主线程专用；Service Worker 里存取要走 IndexedDB 或 Cache Storage。

## 9. 读者验证步骤（未在本机实测）

> 本机无浏览器实测环境，以下是读者在自己浏览器里的验证方法，不是本文已跑过的测试。本文全部 JavaScript 示例均标为“示例未实测”。

1. 打开任意网站，按 F12 → Application（或“应用”）面板 → 左侧 Storage 一栏，对照查看 Local Storage、Session Storage、IndexedDB、Cache Storage 四项：同一站点下它们各自存了什么。
2. 在 Console 里执行 `localStorage.setItem('demo', '1')` 与 `sessionStorage.setItem('demo', '1')`，刷新页面后看两者是否还在；新开同源标签页，看 sessionStorage 是否不共享；关闭标签页重开，看 sessionStorage 是否消失。
3. 在 Application 面板里手动删一条 IndexedDB 记录与一个具名缓存，再刷新页面，观察应用是“自动重建”还是“报错”——这能直接看出应用有没有把本地存储当成“永不丢”来写。
4. 在 Console 里执行 `await navigator.storage.estimate()`，对照 Application 面板里显示的用量，看估计值与实际用量的量级是否一致。

---

## 文章信息（统一字段）

- 来源：MDN Web Docs《Web Storage API》《IndexedDB API》《Cache API》《IDBObjectStore》（https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore）；W3C《IndexedDB API》标准；W3C Service Workers 相关规范中关于 Cache Storage 的部分；Microsoft Edge 文档《Store data on the device》（https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/offline，含约 5MB Web Storage 与约 60% 磁盘源配额的实现示例数字）。容量数字以各实现为准，正文已注明。
- 适用版本：不适用（原理篇；各浏览器配额与清理策略以各自文档为准）。
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[存储与 Cookie 模型](03-storage-cookie.md)（本组总览篇）、[Cookie 属性与安全](08-cookie-attributes-security.md)（本组深挖篇：需要服务器带凭证时为何不用本篇存储）、[网络栈与缓存](02-network-cache.md)（本组第二篇：HTTP 缓存与 Cache Storage 的分工）、[JavaScript 基础完整教程](../../website-guide/javascript/01-basics.md)（03 域，脚本读写存储的写法）
- 相关主题：[存储与 Cookie 模型](03-storage-cookie.md)（本篇的上一层总览，必读）、[网络栈与缓存](02-network-cache.md)（缓存与存储的分工）
- 未完成项：各浏览器 localStorage / sessionStorage 的精确上限未逐家核实，约 5MB 仅为量级；IndexedDB 与 Cache Storage 的配额比例与磁盘压力下的清理规则未逐实现核实；Cache Storage 对非 GET 请求的缓存行为未以规范逐项核实；Web Storage 跨标签页 `storage` 事件的完整语义未展开；源私有文件系统（OPFS）未展开；本文全部 JavaScript 示例均未在本机浏览器实测。
