---
description: "14 Windows 深度技术：DNS/DHCP 与网络排错——Windows 客户端 DNS 解析流程、DHCP 获取地址流程、常用排错命令与分层排错思路。"
---

# DNS/DHCP 与网络排错

## 1. 本章目标

读完本篇，能说清 Windows 客户端上 DNS 域名解析与 DHCP 地址获取各走了哪些步骤，能用 ipconfig、ping、tracert、netstat、Test-NetConnection 等命令定位网络问题所在的层次，并能按“分层、由近及远”的思路排障，而不是逐个命令乱试。

> **实测说明**：本文撰写于 Linux 虚拟机，Windows 专属命令无法在当前环境实测。文中所有 Windows 命令示例一律标“示例未实测”，请在真实 Windows 环境中核对后再执行；命令的具体参数以微软官方文档为准。

## 2. 背景与问题

“上不了网”是最常见的报障，但它背后可能是十几种不同的故障：网线没插、地址没拿到、网关不通、域名解析失败、目标服务器宕机、防火墙拦截……只凭“打不开网页”这一个现象，无法定位到任何一层。Windows 自带了一套分层排错工具：ipconfig 看本机配置，ping 测连通性，nslookup 查解析，tracert 看路径，netstat 看连接与端口，Test-NetConnection 一次测通“解析 + 连通 + 端口”。本篇先讲 DNS 与 DHCP 这两个最常出问题的环节，再把工具串成一套分层排障流程。

与域相关的网络问题（例如加域时找不到域控制器）见[AD 域加入与组策略下发](10-domain-join-gpo.md)；命令行与脚本的通用方法见[PowerShell 自动化](03-powershell-automation.md)，本文只讲网络排错本身。

## 3. DNS 解析流程：从名字到地址要过几道关

### 3.1 客户端解析的顺序

在 Windows 客户端输入一个域名（例如 `www.example.com`）后，解析按以下顺序进行，前一步命中即停止：

1. **本机 DNS 客户端缓存**：之前解析过的结果会暂存在缓存里，直接命中最快。缓存也可能“帮倒忙”——域名换了 IP 后，旧的缓存记录会让客户端继续访问旧地址，直到缓存过期或被清空。
2. **Hosts 文件**：`C:\Windows\System32\drivers\etc\hosts` 中的手工映射。它的优先级高于 DNS 服务器查询，常被用于测试环境或本地域名映射；排障时别忘了它——一个过期的 hosts 条目能让所有 DNS 工具都“看起来正常”，唯独浏览器打不开。
3. **DNS 服务器查询**：缓存与 hosts 都没命中时，客户端向配置的 DNS 服务器发起查询；DNS 服务器再通过递归或转发找到权威答案返回。客户端配置的 DNS 服务器地址不对（例如指向了公网 DNS 却要解析内网域名），这一步就会失败。
4. **失败结果也会被缓存**：解析失败的结果（否定缓存）同样会被缓存一段时间，短时间内反复查询同一域名会一直失败；排障时先清空缓存再重试，才能看到“当前”的真实结果。

### 3.2 常用命令：看缓存、查解析、清缓存（示例未实测）

```cmd
:: 查看本机 DNS 客户端缓存（示例未实测）
ipconfig /displaydns

:: 清空 DNS 客户端缓存（示例未实测）
ipconfig /flushdns

:: 查询指定域名的解析结果（示例未实测）
nslookup www.example.com

:: 指定用某台 DNS 服务器查询（示例未实测）
nslookup www.example.com 192.168.1.1
```

读法要点：

- `ipconfig /displaydns` 输出的每条记录带 TTL（生存时间）：TTL 未过期前，客户端不会重新查询；排障时看到“旧 IP + 很大的剩余 TTL”，就知道是缓存问题，`ipconfig /flushdns` 后重试。
- `nslookup` 默认用本机配置的 DNS 服务器查询；加第二个参数可以指定另一台 DNS 服务器——同一域名在本机 DNS 上查不到、换一台 DNS 却查得到，问题就出在本机配置的 DNS 服务器上，而不是域名本身。
- PowerShell 也有对应的解析命令 `Resolve-DnsName`（示例未实测），输出是结构化对象，便于在脚本里取 IP 地址；交互排障用 `nslookup` 更直观。

### 3.3 DNS 问题的典型现象

| 现象 | 指向 | 先查什么 |
|---|---|---|
| 域名打不开，但直接输 IP 能打开 | DNS 解析环节 | `nslookup` 与 `ipconfig /displaydns` |
| 所有域名都解析失败 | 本机 DNS 配置或 DNS 服务器本身 | `ipconfig /all` 看 DNS 服务器地址；`ping` DNS 服务器地址 |
| 只有内网域名解析失败，公网正常 | DNS 指向了公网 DNS，未指向内网 DNS | `ipconfig /all` 核对 DNS 服务器是否为内网 DNS 或域控制器 |
| 刚换过 IP 的域名仍指向旧地址 | 缓存未过期或 hosts 有旧条目 | `ipconfig /flushdns`；检查 hosts 文件 |

## 4. DHCP 获取地址流程：地址不是凭空来的

### 4.1 DORA 四步

Windows 客户端通过 DHCP 自动获取地址时，与 DHCP 服务器之间走四个报文（业内常称 DORA）：

1. **Discover（发现）**：客户端广播“我需要一个地址，有 DHCP 服务器吗？”
2. **Offer（提供）**：DHCP 服务器回应“我可以给你这个地址，租期这么长，网关与 DNS 是这些。”
3. **Request（请求）**：客户端确认“我就要这个地址。”
4. **Acknowledge（确认）**：服务器确认“成交，租期从现在开始。”

租期过半时客户端会主动续租，续租失败才会在租期结束时重新走 DORA。理解这四步的意义在于：排障时能判断卡在哪一步——客户端根本没收到 Offer，是服务器或网络问题；收到了 Offer 却拿不到确认，是地址池或服务器配置问题。

### 4.2 释放与续租（示例未实测）

```cmd
:: 释放当前 DHCP 获取的地址（示例未实测）
ipconfig /release

:: 重新向 DHCP 服务器请求地址（示例未实测）
ipconfig /renew

:: 只针对指定网卡操作（示例未实测）
ipconfig /renew "以太网"
```

注意事项：

- `ipconfig /release` 会立即丢掉当前地址，正在进行的远程会话会断开。**不要在远程桌面或远程 Shell 里对正在用的网卡执行 `/release`**，否则断开后无法再连回来；必须远程操作时，先确认有带外管理通道或有人在现场。
- `/renew` 只对“自动获取地址”的网卡有效；手工配置静态 IP 的网卡执行 `/renew` 不会有任何效果，这是静态地址与 DHCP 地址的根本区别之一。
- PowerShell 的对应命令是 `Get-NetIPConfiguration`（查看）与 `Get-NetAdapter`（查看网卡状态），示例未实测。

### 4.3 拿不到地址的标志：169.254.x.x

客户端在一段时间内收不到 DHCP 服务器的回应时，Windows 会自动给自己配一个 `169.254.x.x` 段的地址（自动专用 IP 寻址，APIPA）。看到 `ipconfig` 输出的地址以 `169.254.` 开头，就等于机器在说“我没拿到 DHCP 地址”：

- 先查物理层：网线、Wi-Fi 连接、交换机端口是否正常。
- 再查 DHCP 服务器：地址池是否耗尽、DHCP 服务是否在运行、客户端与服务器之间是否有 DHCP 中继（跨网段时需要）或 VLAN 隔离。
- 排除法：同一网段其他设备能否拿到地址——只有一台拿不到，问题在该设备；全部拿不到，问题在服务器或网络。

## 5. 常用排错命令：每个命令回答一个问题

排障不是“把命令都跑一遍”，而是每个命令回答一个明确的问题。按“由近及远”的顺序：

### 5.1 本机配置：ipconfig（示例未实测）

```cmd
:: 查看全部网卡的完整 TCP/IP 配置（示例未实测）
ipconfig /all
```

看四项：IP 地址（是不是预期的网段、有没有变成 169.254.x.x）、子网掩码、默认网关、DNS 服务器。`ipconfig /all` 还会显示 DHCP 是否启用、租约的获得与到期时间、网卡的物理地址（MAC）。排障的第一步永远是先看本机配置对不对——配置错了，后面的连通性测试全无意义。

### 5.2 连通性：ping（示例未实测）

```cmd
:: 测到网关的连通性（示例未实测）
ping 192.168.1.1

:: 测到 DNS 服务器的连通性（示例未实测）
ping 8.8.8.8

:: 持续测，用于观察间歇性丢包（示例未实测）
ping -t 192.168.1.1
```

读法要点：

- ping 通只说明 ICMP 可达，不等于目标服务可用——防火墙禁 ICMP 时 ping 不通，但服务本身可能正常；反过来 ping 通也不等于网页能打开，服务端口可能没开。
- 目标地址要用 IP 而不是域名：`ping www.example.com` 先解析域名再 ping，解析失败时分不清是 DNS 问题还是连通问题；分层排障时，ping IP 测连通，nslookup 测解析，两件事分开测。
- `-t` 持续 ping 适合抓间歇性断网：看是“一直不通”还是“时通时断”，两种现象指向不同的故障。

### 5.3 路径：tracert（示例未实测）

```cmd
:: 看到目标地址经过了哪些路由节点（示例未实测）
tracert www.example.com

:: 按 IP 追踪，避免解析干扰（示例未实测）
tracert 8.8.8.8
```

输出的每一跳是一个路由器及往返时间。读法：从第一跳开始，哪一跳起延迟骤增或开始超时，问题就出在那一段；第一跳就是默认网关——第一跳都不通，问题在本地网络或网关本身。注意：中间节点禁 ICMP 时会显示 `*` 超时，不一定是故障，要结合后续跳是否恢复来判断。

### 5.4 连接与端口：netstat（示例未实测）

```cmd
:: 看本机所有连接与监听端口（示例未实测）
netstat -ano

:: 只看某个端口的占用情况（示例未实测）
netstat -ano | findstr :80
```

`-a` 显示所有连接与监听端口，`-n` 以数字形式显示地址与端口（不做反向解析，更快），`-o` 显示占用端口的进程 ID（PID），再用任务管理器或 `tasklist` 按 PID 查是哪个进程。典型用途：服务起不来时先看端口是不是被别的进程占了；怀疑异常外联时看本机主动连接了哪些远程地址。

### 5.5 一站式连通测试：Test-NetConnection（示例未实测）

```powershell
# 测到目标的 ICMP 连通性（示例未实测）
Test-NetConnection -ComputerName 192.168.1.1

# 测到目标指定端口的 TCP 连通性（示例未实测）
Test-NetConnection -ComputerName www.example.com -Port 443

# 只看关键结果（示例未实测）
Test-NetConnection -ComputerName www.example.com -Port 443 | Select-Object ComputerName, RemoteAddress, TcpTestSucceeded
```

`Test-NetConnection` 的价值在于一次回答三个问题：域名能不能解析（输出 RemoteAddress）、主机通不通、指定 TCP 端口开不开。网页打不开时，`Test-NetConnection -Port 443` 成功而浏览器打不开，问题在应用层（代理、证书、浏览器配置），不在网络层。

## 6. 分层排错思路：由近及远，一次只排除一层

| 层 | 问什么 | 用的命令 | 这一层通过的标志 |
|---|---|---|---|
| 物理与链路 | 网线插好、Wi-Fi 已连、网卡启用了吗 | 看网卡状态、指示灯 | 网卡显示“已连接”，有链路速率 |
| 本机配置 | 地址、掩码、网关、DNS 对吗 | `ipconfig /all` | 地址在预期网段，不是 169.254.x.x；网关与 DNS 都有值 |
| 网关连通 | 到网关通吗 | `ping 网关 IP` | ping 网关有回应 |
| DNS 解析 | 域名能解析出正确 IP 吗 | `nslookup`、`ipconfig /displaydns` | 解析出的 IP 与预期一致 |
| 跨网段路径 | 到目标的路径通到哪一跳 | `tracert 目标 IP` | 每一跳都有回应，或超时后后续跳恢复 |
| 目标端口 | 目标服务的端口开着吗 | `Test-NetConnection -Port`、`netstat`（目标机上） | TcpTestSucceeded 为 True |
| 应用层 | 服务本身正常吗 | 浏览器、客户端日志、服务状态 | 应用日志无报错，服务进程在运行 |

流程纪律：

1. **由近及远**：先本机、再网关、再 DNS、再目标；跳过前面的层直接测目标，出问题不知道卡在哪一层。
2. **一次只动一处**：同时改 DNS 又重启网卡，出问题说不清是哪一步修好的；改一处、测一次、记一次。
3. **先看现象再动手**：把 `ipconfig /all` 与报错原文记下来再操作；操作完对比前后输出，确认改动确实生效。
4. **区分“本机问题”与“全网问题”**：只有一台机器上不了网，重点查本机；全网都上不了，先查网关、DNS 服务器与出口设备，不要逐台折腾客户端。

## 7. 典型场景速查

| 场景 | 最可能的层次 | 首选动作 |
|---|---|---|
| 地址是 169.254.x.x | DHCP 获取失败 | 查物理连接与 DHCP 服务器；`ipconfig /release` 后 `/renew`（示例未实测） |
| IP 能 ping 通、域名打不开 | DNS 解析 | `nslookup` 换 DNS 服务器对照；`ipconfig /flushdns`；查 hosts 文件 |
| 网关 ping 不通 | 本地网络或网关 | 核对 IP 与网关是否在同一网段；查网线、交换机、网关设备 |
| 网关通、目标不通 | 跨网段路径或目标侧 | `tracert` 看断在哪一跳；确认目标 IP 与路由 |
| ping 通、端口不通 | 目标服务或防火墙 | `Test-NetConnection -Port`；目标机上 `netstat -ano` 查端口监听 |
| 内网正常、公网打不开 | 出口、DNS 或代理 | 先确认内网 DNS 与网关正常，再查出口设备与代理配置 |
| 刚换过 IP 的域名仍指向旧地址 | DNS 缓存或 hosts | `ipconfig /flushdns`；检查 hosts 文件中的旧条目 |

## 8. 常见误解

- **“ping 不通就是断网了”**：不准确。目标禁 ICMP 时 ping 不通但服务正常；应再用 `Test-NetConnection -Port` 测目标端口，双重确认。
- **“ipconfig /renew 能修好一切网络问题”**：错。它只重新走 DHCP 流程，对 DNS 配置错误、网关故障、防火墙拦截都无效；先定位层次再选命令。
- **“能上网就说明 DNS 没问题”**：不准确。浏览器可能用的是缓存或代理的解析结果；内网域名解析失败时，公网照常能上网。
- **“tracert 里出现 * 就是断了”**：不一定。中间路由器禁 ICMP 回应时会显示 `*`，但后续跳恢复就说明路径是通的；要看整条路径，不要只看某一跳。

---

## 文章信息（统一字段）

- 来源：Microsoft Learn《Ipconfig》（https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig）；Microsoft Learn《Group Policy processing》（https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-policy/group-policy-processing）
- 适用版本：Windows 10 / Windows 11；Windows Server 2022 / 2025
- 核实日期：2026-11-06
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[Windows 系统管理](01-system-management.md)、[AD 域加入与组策略下发](10-domain-join-gpo.md)
- 相关主题：[PowerShell 自动化](03-powershell-automation.md)、[注册表与组策略](02-registry-group-policy.md)
- 未完成项：本文所有 Windows 命令示例均未实测（撰写环境为 Linux 虚拟机），需在真实 Windows 环境中逐条核对；DNS 服务器与 DHCP 服务器侧的配置与排障未展开（本文只讲客户端侧）；nslookup、tracert、netstat 等命令在不同 Windows 版本间的参数差异未逐条核对，需以微软官方文档为准
