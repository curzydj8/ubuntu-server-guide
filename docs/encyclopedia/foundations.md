---
description: "基础与底层领域组说明：01 计算机基础与硬件、15 浏览器与互联网底层、23 计算机历史与技术文化。"
---

# 基础与底层

本组包含三个知识领域：

- **01 计算机基础与硬件**：计算机组成、硬件原理、数字基础。
- **15 浏览器与互联网底层**：渲染引擎、JavaScript 引擎、网络栈、浏览器安全模型。
- **23 计算机历史与技术文化**：计算机与互联网发展史、开源文化。

!!! note "本页说明"
    本页是基础与底层组的说明页，不是正式文章。本组 28 篇文章已全部发布（01 域 6 篇、15 域 19 篇、23 域 3 篇，见下节）。

## 01 计算机基础与硬件（6 篇）

推荐阅读顺序：数字逻辑 → CPU → 内存层次 → SSD 存储 → 指令集对比 → 硬件选型。

- [数字逻辑与组成基础](01-computer-basics/01-digital-logic.md)（L1）
- [CPU 组成与指令集](01-computer-basics/02-cpu-instruction-set.md)（L2）
- [内存层次与缓存](01-computer-basics/03-memory-hierarchy-cache.md)（L2）
- [SSD 存储原理](01-computer-basics/04-ssd-storage.md)（L2）
- [指令集对比：x86 与 ARM 与 RISC-V](01-computer-basics/05-isa-comparison.md)（L2）
- [硬件选型与评测方法](01-computer-basics/06-hardware-selection.md)（L2）

## 15 浏览器与互联网底层（19 篇）

推荐阅读顺序：渲染流程 → 网络栈 → 存储模型。

- [渲染引擎与渲染流程](15-browser-internals/01-rendering-pipeline.md)（L3）
- [网络栈与缓存](15-browser-internals/02-network-cache.md)（L3）
- [存储与 Cookie 模型](15-browser-internals/03-storage-cookie.md)（L2）
- [布局、绘制与合成](15-browser-internals/04-layout-paint-composite.md)（L4）
- [关键渲染路径与渲染性能优化](15-browser-internals/05-rendering-performance.md)（L3）
- [HTTP 缓存策略详解](15-browser-internals/06-http-caching-strategies.md)（L3）
- [浏览器网络栈与连接管理](15-browser-internals/07-browser-network-stack.md)（L3）
- [Cookie 属性与安全](15-browser-internals/08-cookie-attributes-security.md)（L3）
- [Web 存储详解](15-browser-internals/09-web-storage-apis.md)（L3）
- [JavaScript 引擎原理](15-browser-internals/10-js-engine-principles.md)（L4）
- [内存管理与垃圾回收](15-browser-internals/11-memory-gc.md)（L3）
- [浏览器沙箱与进程架构](15-browser-internals/12-browser-sandbox-architecture.md)（L3）
- [内容安全策略 CSP 入门](15-browser-internals/13-content-security-policy.md)（L2）
- [同源策略详解](15-browser-internals/14-same-origin-policy.md)（L2）
- [跨域通信方案](15-browser-internals/15-cross-origin-communication.md)（L3）
- [浏览器扩展开发入门](15-browser-internals/16-extension-development.md)（L2）
- [开发者工具使用详解](15-browser-internals/17-devtools-guide.md)（L3）
- [PWA 与 Service Worker 入门](15-browser-internals/18-pwa-service-worker.md)（L3）
- [WebAssembly 入门](15-browser-internals/19-webassembly-intro.md)（L3）

## 23 计算机历史与技术文化（3 篇）

推荐阅读顺序：计算机发展史 → 互联网历史 → 开源文化与社区。本域只讲历史与文化，不展开技术教程；技术内容请看 01、07、15 等域的对应文章。

- [计算机发展史：从机械计算到个人计算机](23-history-culture/01-computer-history.md)（L1）
- [互联网历史：从 ARPANET 到万维网](23-history-culture/02-internet-history.md)（L1）
- [开源文化与社区](23-history-culture/03-open-source-culture.md)（L2）

## 相关现有内容

以下现有文章与本组主题邻近，但按内容映射归属其他领域，仅作关联阅读，不表示它们已归入本组：

- [基础入门与安装](../01-basics/index.md)（服务器入门，属 06 操作系统与服务器域）
- [互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口完整教程](../website-guide/basics/01-internet.md)（网络基础，属 07 计算机网络与通信域）
- [GPU 与 CUDA](../12-virtualization/01-gpu-cuda.md)（硬件相关，属 06 操作系统与服务器域）
