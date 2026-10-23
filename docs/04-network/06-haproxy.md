---
description: "单台反向代理扛不住流量、后端故障要人工摘除时，就需要专门的负载均衡层。本章用 HAProxy 把请求分发到多台后端，配齐主动健康检查、连接排空与统计面，让故障摘除和维护下线都变成可验证的常规动作。"
---

# 负载均衡：HAProxy

## 一、概述与使用场景

单台反向代理扛不住流量、后端故障要人工摘除时，就需要专门的负载均衡层。HAProxy 是一款成熟的高性能负载均衡器，既能工作在四层（TCP 连接级转发），也能工作在七层（理解 HTTP 语义后按域名、路径、请求头分流），核心价值有三点：把请求按算法分发到多台后端、持续主动探测后端健康并自动摘除故障节点、维护时先把连接排空再下线而不是直接掐断。

它与本部分第 2 章 [Web 服务器与反向代理](02-web-proxy.md) 中的 Nginx 反代不是替代关系，而是分工关系，先分清再选型：

| 维度 | HAProxy | Nginx 反向代理 |
| --- | --- | --- |
| 定位 | 专职负载均衡器 | Web 服务器兼反向代理 |
| 工作层级 | 四层与七层都强，四层可转发任意 TCP 协议 | 以七层 HTTP 为主，四层需 stream 模块 |
| 典型协议 | HTTP、HTTPS、MySQL、Redis 等任意 TCP 服务 | HTTP、HTTPS、静态文件与缓存 |
| 健康检查 | 原生主动检查，间隔、阈值、检查路径都可精细配置 | 开源版以被动检查为主，主动检查能力有限 |
| 长连接与排空 | 原生支持连接排空（drain），存量连接处理完再下线 | 摘除后存量连接处理较粗放 |
| 运行时调整 | Runtime API 可不重载进程就改权重、摘节点 | 多数调整需要改配置并 reload |
| 静态内容与缓存 | 不提供 | 提供，且是它的主场 |

分工结论：入口需要给多种协议、多个后端集群做统一分发与精细健康管理时用 HAProxy；单机发布网站、发静态文件、做缓存时用第 2 章的 Nginx 或 Caddy 就够，不要为了用而用。第 09 部分的网站部署场景如果后端扩到多台，流量入口同样可以前置 HAProxy，思路与本章一致。

本章为「文档核对」级别：配置语法与命令均按官方文档核对，适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS；Ubuntu 26.04 上的包版本与默认配置标记为「待核验」，在测试机核验前不要直接套用到 26.04 生产机。

## 二、环境准备与前置条件

- 负载均衡节点一台：Ubuntu Server 22.04 LTS 或 24.04 LTS，建议 2 核 CPU、2 GB 内存起步，地址示例为 192.0.2.10。
- Web 后端两台：地址示例为 192.0.2.21 与 192.0.2.22，应用监听 8080 端口，并提供专用的健康检查路径 `/health`，正常时返回 HTTP 200。
- 权限：负载均衡节点上有可使用 sudo 的管理账号。
- 端口规划：对外 80 与 443 由 HAProxy 监听；统计页示例端口 8404 只绑内网地址，绝不直接暴露公网（见 3.6 节）；后端 8080 只允许负载均衡节点访问。
- 前置：后端先在本机直连验证可用，再接入负载均衡，排障时才能分清是哪一层的问题。

改任何配置前先备份，这是本章所有回滚动作的前提：

```bash
sudo mkdir -p /root/haproxy-backup
sudo cp -a /etc/haproxy/haproxy.cfg /root/haproxy-backup/haproxy.cfg.bak-20260101
ls -l /root/haproxy-backup/
```

首次安装时配置文件由软件包生成，安装完成后再执行一次上面的备份，之后每次改配置都先新增一份带日期的备份，不要覆盖旧备份。

!!! danger "改错配置会让全站入口失效"
    HAProxy 是全站流量的唯一入口，配置写错或误重启会让所有后端一起不可达。纪律只有三条：改前备份、改后先校验再 reload、保留当前终端会话不要退出，确认新配置工作正常后再收尾。回滚命令见 3.4 节，出问题先回滚再排查，不要在故障现场边改边试。

## 三、手把手操作步骤

### 3.1 安装 HAProxy

用发行版软件源安装，并确认版本：

```bash
sudo apt update
sudo apt install -y haproxy socat
haproxy -v
sudo systemctl enable --now haproxy
sudo systemctl status haproxy --no-pager
```

`haproxy -v` 能输出版本号、`systemctl status` 显示 active (running)，说明安装成功。`socat` 是后面操作 Runtime API 时与 stats socket 通信的工具，一并装好。

### 3.2 完整配置逐段讲解

配置文件为 `/etc/haproxy/haproxy.cfg`，先按第二节备份，再写入下面的完整内容。这份示例包含一组 Web 后端（两台业务机加一台备份机）与主动健康检查：

```text
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon
    maxconn 4096

defaults
    log global
    mode http
    option httplog
    option dontlognull
    option forwardfor
    timeout connect 5s
    timeout client 50s
    timeout server 50s
    errorfile 503 /etc/haproxy/errors/503.http

frontend web_in
    bind *:80
    default_backend web_backend

backend web_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server web1 192.0.2.21:8080 check inter 3s fall 3 rise 2 weight 100
    server web2 192.0.2.22:8080 check inter 3s fall 3 rise 2 weight 100
    server web3 192.0.2.23:8080 check inter 3s fall 3 rise 2 backup

listen stats
    bind 192.0.2.10:8404
    mode http
    stats enable
    stats uri /stats
    stats realm HAProxy\ Statistics
    stats auth stats_admin:请替换为强口令
    stats refresh 10s
```

`global` 段逐行讲解（进程级参数，只在启动时读取）：

| 配置行 | 含义 | 说明 |
| --- | --- | --- |
| `log /dev/log local0` | 日志发往本机 syslog 套接字 | 与 rsyslog 配合落盘，不要让日志只进内存 |
| `chroot /var/lib/haproxy` | 进程根目录切换到该目录 | 降低进程被利用后的影响面，路径需提前存在 |
| `stats socket /run/haproxy/admin.sock mode 660 level admin` | 开启 Runtime API 的 Unix 套接字 | `level admin` 才允许执行改状态类命令，权限 660 限制访问者 |
| `stats timeout 30s` | Runtime API 会话超时 | 防止空闲会话长期占用 |
| `user haproxy` 与 `group haproxy` | 以专用低权限账号运行 | 不要用 root 长期运行流量进程 |
| `maxconn 4096` | 进程级最大连接数 | 按内存与后端承压能力调整，不是越大越好 |

`defaults` 段逐行讲解（会被 frontend 与 backend 继承）：

| 配置行 | 含义 | 说明 |
| --- | --- | --- |
| `mode http` | 默认工作在七层 HTTP 模式 | 转发纯 TCP 服务时在对应段改 `mode tcp` |
| `option httplog` | 使用 HTTP 详细日志格式 | 记录方法、路径、状态码与耗时，排障靠它 |
| `option forwardfor` | 注入 X-Forwarded-For 请求头 | 后端才能拿到真实客户端地址 |
| `timeout connect 5s` | 与后端建立连接的最长等待 | 后端不可达时快速失败，不要让请求长时间挂起 |
| `timeout client 50s` | 等待客户端发送数据的最长空闲 | 太短会掐断慢客户端，太长会积压连接 |
| `timeout server 50s` | 等待后端响应的最长空闲 | 必须大于后端最慢接口的正常耗时，见 5.3 节 |

`frontend` 与 `backend` 段说明：`bind *:80` 表示监听所有网卡的 80 端口；`default_backend web_backend` 表示未命中其他规则的请求全部交给该后端组。`option httpchk GET /health` 加 `http-check expect status 200` 构成应用级健康检查：不只看端口通不通，还要求健康接口真正返回 200，后端处于「进程活着但应用假死」状态时也能被摘除，这一点比单纯的 TCP 检查可靠得多。

### 3.3 负载算法与 server 行逐字段讲解

`balance` 算法对比，按业务形态选，不要凭习惯选：

| 算法 | 分发逻辑 | 适合场景 | 注意点 |
| --- | --- | --- | --- |
| `roundrobin` | 按权重轮流分发 | 后端规格一致、请求耗时相近的无状态 Web 服务 | 长短请求混杂时容易让某台堆积慢请求 |
| `leastconn` | 优先发给当前连接数最少的后端 | 请求耗时差异大、长连接较多的场景 | 本章长连接业务的推荐选择 |
| `source` | 按客户端源地址哈希 | 需要同一客户端固定落到同一后端的会话保持场景 | 客户端集中在少数 NAT 出口时会分布不均 |

`server` 行逐字段讲解（以 web1 一行为例）：

| 字段 | 含义 | 本章取值说明 |
| --- | --- | --- |
| `web1` | 后端在本配置内的名字 | Runtime API 与统计页都用这个名字定位，必须唯一 |
| `192.0.2.21:8080` | 后端地址与端口 | 写实际后端地址，示例为文档段地址 |
| `check` | 启用健康检查 | 不写则该后端永远被认为可用，故障不摘除 |
| `inter 3s` | 健康检查间隔 | 3 秒一次，兼顾发现速度与后端负担 |
| `fall 3` | 连续失败几次判下线 | 连续 3 次失败才摘除，避免抖动误杀 |
| `rise 2` | 连续成功几次判上线 | 连续 2 次成功才重新放流量，避免反复横跳 |
| `weight 100` | 权重 | 规格相同的机器权重相同，大规格机器按比例调高 |
| `backup` | 备份节点标记 | 仅当非 backup 节点全部不可用时才接流量，web3 行即此用法 |

### 3.4 改配置纪律：先校验，再 reload

每次改完配置，严格按下面顺序执行：

```bash
sudo haproxy -f /etc/haproxy/haproxy.cfg -c
sudo systemctl reload haproxy
sudo systemctl status haproxy --no-pager
```

校验命令期望输出包含 `Configuration file is valid` 字样，校验不过绝不 reload，按报错行号修正后再校验。

`reload` 与 `restart` 的区别必须分清：reload 是平滑重载，新进程接管新连接，老进程把存量连接处理完后自行退出，已建立的长连接不中断；restart 是直接停旧启新，存量连接会被掐断。生产变更默认只用 reload，只有升级二进制、改 global 段的 chroot 等少数必须完全重启的参数时才用 restart，并安排在维护窗口。

回滚步骤（新配置导致异常时执行）：

```bash
sudo cp -a /root/haproxy-backup/haproxy.cfg.bak-20260101 /etc/haproxy/haproxy.cfg
sudo haproxy -f /etc/haproxy/haproxy.cfg -c
sudo systemctl reload haproxy
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

最后一条期望返回 200，表示入口已恢复到回滚前状态，再回头慢慢定位新配置的问题。

### 3.5 连接排空：用 Runtime API 优雅下线后端

给后端打补丁、发新版本前，先排空再下线，避免直接摘除掐断正在处理的请求。排空通过 3.2 节配置的 stats socket 下发 Runtime API 命令，不需要改配置文件，也不需要 reload：

```bash
echo "show servers state web_backend" | sudo socat stdio /run/haproxy/admin.sock
echo "set server web_backend/web1 state drain" | sudo socat stdio /run/haproxy/admin.sock
echo "show stat" | sudo socat stdio /run/haproxy/admin.sock
```

`drain` 状态的语义：该后端不再接收新连接（带会话保持的存量连接除外），已有连接继续处理直到自然结束，健康检查照常进行。观察 `show stat` 输出中 web1 的当前连接数逐步降到 0 后，再停机维护：

```bash
curl -s http://192.0.2.21:8080/health
sudo systemctl status app --no-pager
```

上面两条在 web1 后端机上执行：先确认应用状态，再按该应用自身的发布流程停机与升级（此处仅示意查看状态，不要在负载均衡节点上执行）。维护完成后恢复流量：

```bash
echo "set server web_backend/web1 state ready" | sudo socat stdio /run/haproxy/admin.sock
echo "show servers state web_backend" | sudo socat stdio /run/haproxy/admin.sock
```

`ready` 表示重新进入正常分发。注意 Runtime API 的修改只在内存中生效，HAProxy 进程重启后会回到配置文件写的状态，需要长期生效的状态变更必须同步写回 `haproxy.cfg`，并按 3.4 节的纪律校验后 reload。

### 3.6 统计面：stats socket 与 stats 网页

HAProxy 提供两个观察面。stats socket 即 3.5 节用的 Runtime API，既能看状态（`show stat`、`show info`），也能改状态，是运维操作面。stats 网页是 3.2 节配置中 `listen stats` 段提供的只读报表页，浏览器打开 `http://192.0.2.10:8404/stats` 并输入 `stats auth` 配置的账号口令后，可以看到每个后端的状态、连接数、流量与错误数，适合值班快速巡检。

!!! danger "统计页绝不能裸露公网"
    统计页会泄露后端拓扑、地址与实时流量，stats auth 的口令在配置文件中是明文，一旦页面暴露到公网，等于把内网结构图送给扫描者。下面三条至少做到一条，生产环境建议叠加两条以上：第一，`bind` 只绑内网地址（如本章的 192.0.2.10），不写 `*:8404`；第二，必须配置 `stats auth` 且口令为独立强口令，不与任何其他系统复用；第三，用防火墙限制来源网段，只放行运维网段访问 8404 端口。确需跨网访问时走 SSH 隧道转发，不要为图方便直接放行公网。

防火墙放行示例（按真实运维网段替换后再执行）：

```bash
sudo ufw allow from 192.0.2.0/24 to any port 8404 proto tcp
sudo ufw status
```

### 3.7 TLS 终止简介

HTTPS 场景推荐在 HAProxy 上做 TLS 终止：客户端与 HAProxy 之间加密，HAProxy 解密后以明文 HTTP 转发内网后端，后端不再各自管理证书。frontend 的 bind 行写法如下：

```text
frontend web_in_tls
    bind *:443 ssl crt /etc/haproxy/certs/example.com.pem
    default_backend web_backend
```

`crt` 指向的 pem 文件是合并文件，需要把站点证书、中间证书链与私钥按「证书链在前、私钥在后」的顺序合并成一个文件，文件权限应收紧为仅 haproxy 账号可读。证书从哪里签发、如何续期、私钥如何保管，属于证书生命周期的范畴，本章不展开，按第 02 部分 [证书生命周期管理](../02-security/08-certificate-lifecycle.md) 一章执行；该章与本章同批新增，如链接暂未上线，先按第 2 章 [Web 服务器与反向代理](02-web-proxy.md) 的 certbot 路线签发证书，再手工合并为 pem 后引用。证书更新后要重新合并 pem 并 reload HAProxy，只更新证书文件不重载，进程里用的仍是旧证书。

## 四、效果验证与测试

第一步，确认进程与监听：

```bash
sudo systemctl status haproxy --no-pager
ss -tlnp | grep -E "80|443|8404"
```

期望 HAProxy 为 active (running)，80 端口处于监听状态，8404 只出现在内网地址上。

第二步，验证分发效果。连续请求入口多次，观察响应在两台后端之间轮换（后端页面或响应头需能区分来源，测试环境可让两台后端返回不同的标识文字）：

```bash
curl -s http://127.0.0.1/
curl -s http://127.0.0.1/
curl -s http://127.0.0.1/
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.10/
```

期望前三条的来源标识交替出现，最后一条返回 200。若响应始终来自同一台，先查另一台的健康检查状态，不要先改 balance 算法。

第三步，故障摘除验证。在 web1 后端机上停掉应用（或在本机测试环境停掉对应的后端服务），回到负载均衡节点观察：

```bash
echo "show stat" | sudo socat stdio /run/haproxy/admin.sock
curl -s http://127.0.0.1/
sudo tail -n 50 /var/log/haproxy.log
```

期望现象：`fall 3` 与 `inter 3s` 的组合下，约十秒内 web1 在统计中变为 DOWN 状态（日志中会出现 server 标记为 down 的记录），此后所有请求都由 web2 返回 200，客户端侧不出现 503。恢复 web1 的应用后，连续两次健康检查成功（`rise 2`），web1 自动回到分发队列，前三条 curl 的来源标识重新交替出现。整个过程不需要人工改 HAProxy 配置，这就是主动健康检查的价值。

第四步，排空验证。按 3.5 节把 web2 置为 drain，持续发请求观察：新请求全部落到 web1，web2 的存量连接数只降不升，降到 0 后执行 `state ready` 能恢复分发，三项都符合才算排空流程打通。

## 五、常见错误与排坑指南

场景一：客户端收到 503。503 的含义是「HAProxy 正常工作，但找不到可用的后端」：后端全部 DOWN、后端全部处于 drain 或 maint、或请求命中的 backend 里根本没有可用 server。先看统计定性，再动手：

```bash
echo "show stat" | sudo socat stdio /run/haproxy/admin.sock
echo "show servers state web_backend" | sudo socat stdio /run/haproxy/admin.sock
curl -s http://192.0.2.21:8080/health
curl -s http://192.0.2.22:8080/health
```

判读：两台后端直连 `/health` 都不通，是后端应用或后端网络的问题，不要改 HAProxy；直连通但统计里是 DOWN，看场景二的健康检查误杀；状态显示 drain，是有人排空后忘了恢复，按 3.5 节执行 ready。

场景二：客户端收到 502，且后端应用其实活着。502 的含义是「HAProxy 连上了后端或试图连接，但后端没有给出合法响应」：后端端口写错、后端在该端口上跑的不是 HTTP 服务、或后端处理中途崩溃断开。与 503 的分工一句话：503 是没找到后端，502 是找到了但后端没答好。排查顺序：

```bash
curl -v http://192.0.2.21:8080/
sudo tail -n 100 /var/log/haproxy.log
```

直连能返回正常页面而经 HAProxy 是 502，重点核对 backend 中 server 行的端口与 `mode` 是否一致（例如后端是裸 TCP 服务却配了 `mode http`）；日志中大量 connection reset 记录，多为后端进程在高负载下崩溃或被系统杀掉，去后端机查应用日志与内存，不要在 HAProxy 侧反复调参。

场景三：健康检查误杀健康后端。后端明明能正常服务，统计里却反复 UP 与 DOWN 横跳。最常见的根因有三个：一是健康检查路径写错，应用根本没有 `/health`，返回 404 被判失败；二是应用的 `/health` 顺带检查了数据库等下游，下游抖动连带把健康接口拖成非 200；三是 `inter` 太短、`fall` 太小，后端偶发慢响应就被判死。修复原则：健康接口应只反映应用自身存活、保持轻量；阈值回到本章的 `inter 3s fall 3 rise 2` 起步，稳定后再收紧。验证方法：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.21:8080/health
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.22:8080/health
```

期望稳定返回 200，若时而 200 时而 500，先修健康接口本身，不要靠调大 fall 掩盖。

场景四：配置校验通过、reload 也执行了，行为却像旧配置。常见根因是 reload 时新进程因端口占用或权限问题没有真正接管，旧进程还在处理流量；或机器上存在多份配置文件，改的不是 systemd 实际加载的那一份。按顺序确认：

```bash
sudo systemctl status haproxy --no-pager
ps aux | grep haproxy
sudo journalctl -u haproxy -n 50 --no-pager
```

日志里应能看到新进程启动与旧进程退出的记录；进程启动时间还是几天前，说明 reload 没有生效，查日志中的报错（多为新配置引用的证书或套接字路径不存在），修正后重新校验再 reload。仍无法平滑重载时，安排维护窗口执行一次 restart，并把原因记录下来。

场景五：长连接或大文件上传被莫名掐断。表现是 WebSocket 连接几分钟必断、慢接口跑到固定秒数返回 504 类错误。根因多在 defaults 的超时三件套：`timeout client` 与 `timeout server` 是空闲超时，长连接空闲超过该值就会被断开；涉及 WebSocket 时还需要评估官方文档中的 tunnel 超时参数。修复方法：先从日志确认断开时间是否与某个超时值精确吻合，吻合才调对应的那一个参数，一次只改一个、改后按 3.4 节校验 reload 并复测，不要把所有超时一股脑改成小时级，那会让僵死连接长期占满连接数。

## 六、生产环境最佳实践与安全建议

第一，入口冗余。单台 HAProxy 本身就是单点，生产环境至少两台 HAProxy 加虚拟 IP 漂移（如 Keepalived）组成主备，后端健康检查与配置保持一致；本章的单机配置是理解与起步形态，不要直接等同于生产高可用。

第二，变更纪律常态化。配置纳入版本管理，每次变更执行「备份、校验、reload、验证」四步并留记录；Runtime API 的临时状态调整要在工单中登记，长期生效的同步写回配置文件，避免重启后状态回退引发二次故障。

第三，统计面与日志接入现有监控。stats socket 的指标应被采集到第 06 部分的 Prometheus 体系中，对后端 DOWN、连接数逼近 maxconn、5xx 比例突增设置告警；HAProxy 日志按天轮转并集中收集，排障时先看日志再动配置。

第四，连接与上限保护。`maxconn` 要与后端总承压能力匹配，负载均衡把流量放进来但后端接不住，故障只会从入口转移到后端；同时在 frontend 侧对异常高频来源做基础限速，挡住最粗放的扫描与撞库。

第五，证书与口令管理。TLS 合并 pem 与 stats auth 口令都属于敏感材料：pem 私钥部分权限收紧、不进代码仓库；统计页口令独立且定期轮换，轮换后校验并 reload 生效。第六，定期演练。每季度做一次故障摘除与排空下线的完整演练（按第四节的脚本），确认自动转移时间符合预期、值班人员熟悉 Runtime API 命令，演练记录与复盘一起归档。

入口本身的高可用不在本章范围：双机 HAProxy 前面的虚拟 IP 主备漂移（Keepalived/VRRP）见下一章 [Keepalived 与 VRRP 高可用：虚拟 IP 主备漂移](07-keepalived-vrrp.md)，两章配合即是完整的双机入口方案。
