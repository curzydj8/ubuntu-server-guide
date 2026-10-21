---
description: "家用宽带开服最大的拦路虎不是性能，而是根本没有可入站的公网地址：多数家庭宽带被运营商放在 CGNAT 后面，你在路由器上做一万次端口转发也没用，因为流量在运营商那一层就进不来；"
---

# 内网穿透与公网映射：frp 主线方案

## 一、概述与使用场景

家用宽带开服最大的拦路虎不是性能，而是根本没有可入站的公网地址：多数家庭宽带被运营商放在 CGNAT 后面，你在路由器上做一万次端口转发也没用，因为流量在运营商那一层就进不来；少数有动态公网 IP 的家庭，还要面对 IP 变化与路由器转发规则维护。内网穿透的思路是反过来：内网机器主动向一台有公网 IP 的 VPS 建立并保持一条长连接隧道，玩家连 VPS 的公网地址，流量经隧道回到内网机器上的游戏服。

不做穿透硬扛的结果是：服务器只能在局域网里自娱自乐，外地朋友永远连不上；或者被迫把游戏服搬到云上，放弃家里闲置高性能主机的算力与大内存。本章以 frp 为主线（开源、免费、支持 TCP 与 UDP、配置可控），给出一套 VPS 装 frps、内网机器装 frpc 的完整路线；再简述 NPS 与 Tailscale Funnel 的适用边界，最后用对比表帮你在「有公网 IP」「有 VPS 无固定 IP」「纯组网联机」等场景间选型。

## 二、环境准备与前置条件

- 一台有公网 IP 的 VPS（最低配即可，下文地址示例为 `198.51.100.10`），系统 Ubuntu 22.04 或 24.04 LTS。
- 一台内网游戏主机（下文内网地址示例为 `192.0.2.50`），游戏服已按第 02 章装好并在本机可连。
- 两台机器都有 `sudo` 权限；VPS 侧安全组与 UFW 已按第 01 章方法管理。
- 提前规划端口：frp 服务端监听 7000/TCP 用于与客户端建隧道；对外游戏端口沿用 25565/TCP（Minecraft）与 8211/UDP（Palworld），由 VPS 侧对外开放。
- 准备一个高强度随机 token 作为隧道鉴权密钥，下文统一写作 `<frp-token>` 占位，实际部署时换成你自己的并妥善保管。

!!! warning "现行 frp 使用 TOML 配置"
    frp 当前版本（0.52 及以后）的服务端与客户端配置文件分别是 `frps.toml` 与 `frpc.toml`，采用 TOML 语法。网上大量老教程写的 `frps.ini`、`frpc.ini` 是已停止推进的旧格式，不要照抄；认准 TOML 的写法：键值用等号、字符串加引号、代理段用 `[[proxies]]` 数组表。

## 三、手把手操作步骤

### 第一步：在 VPS 上安装 frps

在 VPS 上操作。创建专用目录并放好二进制（从 frp 官方 GitHub Release 获取与系统架构匹配的包，x86_64 云服务器选 `linux_amd64`），版本目录示例写作 `<frp-version>`，实际替换为你下载的版本号：

```bash
sudo mkdir -p /opt/frp /etc/frp
cd /tmp
curl -LO https://example.com/frp/frp_<frp-version>_linux_amd64.tar.gz
tar -xzf frp_<frp-version>_linux_amd64.tar.gz
sudo cp frp_<frp-version>_linux_amd64/frps /opt/frp/
sudo cp frp_<frp-version>_linux_amd64/frps.toml /etc/frp/
```

实际部署时上面下载地址换成 frp 官方 Release 页面当期版本的真实地址，并核对官方公布的校验值。接着改任何配置前先备份，再写服务端配置：

```bash
sudo cp -a /etc/frp/frps.toml /etc/frp/frps.toml.bak
sudo nano /etc/frp/frps.toml
```

写入完整配置（清空原内容后粘贴，逐行注释说明每个键的作用）：

```toml
# frps 监听地址，0.0.0.0 表示接受所有网卡上的隧道连接
bindAddr = "0.0.0.0"
# frps 监听端口，frpc 靠这个端口与服务端建隧道，需在安全组与 UFW 放行 TCP
bindPort = 7000
# 鉴权方式使用 token，与 frpc 侧必须完全一致
auth.method = "token"
# 隧道鉴权密钥，占位符，部署时换成高强度随机字符串，切勿公开
auth.token = "<frp-token>"
# 管理面板监听地址，只绑本机，外人无法直连面板
webServer.addr = "127.0.0.1"
# 管理面板端口，通过 SSH 隧道访问，不对公网开放
webServer.port = 7500
# 管理面板账号，占位符，部署时换成你自己的
webServer.user = "opsadmin"
# 管理面板密码，占位符，部署时换成强口令
webServer.password = "<frp-dashboard-password>"
# 允许 frpc 映射的对外端口范围，不在此范围内的代理会被拒绝，锁死暴露面
allowPorts = [
  { start = 25565, end = 25565 },
  { start = 8211, end = 8211 },
]
```

### 第二步：给 frps 建 systemd 守护并放行端口

新建 `/etc/systemd/system/frps.service`：

```ini
[Unit]
Description=frp server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/frp/frps -c /etc/frp/frps.toml
Restart=on-failure
RestartSec=10
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

启动并放行 VPS 侧端口（7000 是隧道口，25565 与 8211 是对玩家的游戏口，玩家连的就是这台 VPS）：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frps.service
sudo ufw allow 7000/tcp comment 'frps'
sudo ufw allow 25565/tcp comment 'minecraft-via-frp'
sudo ufw allow 8211/udp comment 'palworld-via-frp'
```

云安全组里同步添加同样三条入站规则（方法见第 01 章），三处缺一不可。

### 第三步：在内网机器安装 frpc 并写配置

在内网游戏主机上重复第一步的下载动作，只取客户端二进制：

```bash
sudo mkdir -p /opt/frp /etc/frp
cd /tmp
tar -xzf frp_<frp-version>_linux_amd64.tar.gz
sudo cp frp_<frp-version>_linux_amd64/frpc /opt/frp/
sudo touch /etc/frp/frpc.toml
sudo cp -a /etc/frp/frpc.toml /etc/frp/frpc.toml.bak
sudo nano /etc/frp/frpc.toml
```

写入客户端完整配置，逐行注释如下：

```toml
# frps 所在 VPS 的公网地址，示例为文档段地址，部署时换成你的 VPS 公网 IP 或域名
serverAddr = "198.51.100.10"
# frps 的隧道监听端口，与服务端 bindPort 一致
serverPort = 7000
# 鉴权方式与密钥，必须与 frps 侧逐字一致
auth.method = "token"
auth.token = "<frp-token>"
# 客户端在本机管理接口的监听，仅本机使用可不开放
# 第一条代理：Minecraft 的 TCP 转发
[[proxies]]
# 代理名，本机内唯一即可，用于日志与面板识别
name = "minecraft-tcp"
# 代理类型，Minecraft 走 TCP
type = "tcp"
# 游戏服在本机的监听地址，本机运行填 127.0.0.1
localIP = "127.0.0.1"
# 游戏服在本机的监听端口
localPort = 25565
# 玩家连接 VPS 时使用的对外端口，与 localPort 相同最不易记错
remotePort = 25565
# 第二条代理：Palworld 的 UDP 转发，UDP 游戏必须单独建 udp 类型代理
[[proxies]]
name = "palworld-udp"
type = "udp"
localIP = "127.0.0.1"
localPort = 8211
remotePort = 8211
```

UDP 是最容易漏的一项：frp 对 TCP 与 UDP 分开建代理，只配了 tcp 代理时 Minecraft 能连、Palworld 永远连不上，与第 01 章协议开错的症状一模一样。给 frpc 同样建 systemd 服务（文件名为 `/etc/systemd/system/frpc.service`，`ExecStart` 换成 `/opt/frp/frpc -c /etc/frp/frpc.toml`，其余与 frps 的 unit 相同），然后启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frpc.service
sudo systemctl status frpc.service
```

!!! tip "玩家最终连的地址"
    穿透完成后，玩家连接地址是 VPS 的公网地址加对外端口，例如 Minecraft 填 `198.51.100.10:25565`，Palworld 填 `198.51.100.10:8211`。内网主机的地址不要发给玩家，他们连不到，也不应暴露。

### 第四步：NPS 与 Tailscale Funnel 简述

NPS 是另一款国产内网穿透工具，最大卖点是带 Web 管理面板：在服务端网页上点选就能新建转发规则，不用改配置文件，对不熟悉命令行的用户更友好，同样支持 TCP 与 UDP。它与 frp 的取舍在于：NPS 上手更快，但社区规模、文档沉淀与长期维护活跃度不及 frp；且面板本身就是新的攻击面，必须改默认口令并限制访问来源。已有面板运维习惯、转发条目很多时可以考虑，单游戏开服用 frp 足够。

Tailscale Funnel 是在组网工具 Tailscale 之上把内网服务暴露到公网的功能，概念是让服务经 Tailscale 的中继以官方域名加 HTTPS 形式对外。它的适用边界很明确：设计目标是 Web 类 TCP 服务，对游戏常用的 UDP 转发与自定义裸 TCP 端口并不适配，因此不适合 Palworld，也不要拿它转发游戏端口。Tailscale 本体更适合另一种玩法——所有玩家都装客户端加入同一虚拟局域网后直连内网地址联机，零公网暴露，但要求每位玩家配合安装与登录，只适合固定小圈子。

## 四、效果验证与测试

先看隧道是否建立。在内网机器上查 frpc 日志：

```bash
journalctl -u frpc.service -n 30 --no-pager
```

期望出现类似输出：

```text
login to server success, get run id [a1b2c3d4e5f6]
proxy added: [minecraft-tcp palworld-udp]
[minecraft-tcp] start proxy success
[palworld-udp] start proxy success
```

再在 VPS 上确认对外端口已经监听：

```bash
ss -tulnp | grep -E '7000|25565|8211'
```

应能看到 7000/TCP、25565/TCP 与 8211/UDP 三行，监听地址为 `0.0.0.0` 或 `::`。最终验收必须走真实玩家路径：让外网玩家分别直连 `198.51.100.10:25565` 与 `198.51.100.10:8211`，两款游戏都能进服并稳定游玩 10 分钟以上，再在 VPS 上用 `sudo tcpdump -ni any port 8211 -c 5` 抓包确认 UDP 流量真实经过。管理面板验证走 SSH 隧道，在本地电脑执行 `ssh -L 7500:127.0.0.1:7500 ubuntu@198.51.100.10` 后浏览器打开本机 7500 端口，能看到代理在线状态即通。

选型对比表收尾，帮助按场景决策：

| 场景 | 推荐方案 | 理由 |
| --- | --- | --- |
| 有固定公网 IP 的云服务器 | 不用穿透，直连 | 按第 01 章放行端口即可，链路最短延迟最低 |
| 家用主机加一台便宜 VPS | frp | TCP 与 UDP 都支持，配置可控，玩家零安装 |
| 转发条目多、偏好图形面板 | NPS | Web 面板建规则快，代价是维护面板安全 |
| 只有固定几位玩家、都能装客户端 | Tailscale 组网直连 | 零公网暴露，延迟取决于中继，扩展性差 |
| 只想临时分享一个网页服务 | Tailscale Funnel | HTTPS 开箱即用，但不适用于游戏端口 |

## 五、常见错误与排坑指南

**场景 1：frpc 日志报 token 不匹配，连不上服务端。** 报错原文片段：

```text
login to server failed: token in login doesn't match token from configuration
```

原因是两端 `auth.token` 不逐字一致，常见于复制时多了空格或改了一端忘了另一端。修复：两台机器分别执行 `grep 'auth.token' /etc/frp/frps.toml /etc/frp/frpc.toml` 核对，统一后重启两端服务。

**场景 2：frpc 显示代理启动失败，端口被占用或不在允许范围。** 报错原文片段：

```text
[minecraft-tcp] start error: port not allowed
```

原因是 `remotePort` 不在 frps 的 `allowPorts` 范围内，或该端口已被 VPS 上其它程序占用。先用 `ss -tulnp | grep 25565` 查占用，再核对服务端 `allowPorts` 是否包含该端口，改配置前先备份 `frps.toml`，改完 `sudo systemctl restart frps.service` 并让 frpc 重新连接。

**场景 3：TCP 游戏能连、UDP 游戏连不上。** 现象与日志都指向隧道正常，唯独 Palworld 无响应。原因是只建了 tcp 代理、漏了 udp 代理，或 VPS 安全组与 UFW 只放行了 8211/TCP。按第三步补齐 `type = "udp"` 的代理段与 UDP 放行规则后重启 frpc 即可。

## 六、生产环境最佳实践与安全建议

token 按密码同等级别管理：高强度随机生成、只存放在两台机器的配置文件里、文件权限收紧到 600，不进聊天记录与公开仓库，怀疑泄露就两端同步更换。`allowPorts` 永远保持最小范围，只列在用的游戏端口，不写大区间图省事。管理面板只绑 127.0.0.1 并走 SSH 隧道访问，绝不直接对公网开放。VPS 除了 frp 不要跑无关服务，它现在是玩家入口，被攻破等于内网游戏主机一起暴露。延迟方面要提前管理预期：玩家延迟约等于玩家到 VPS 加 VPS 到内网主机两段之和，VPS 选离玩家与家里都近的机房。最后定期更新 frp 版本并关注其官方安全公告，更新流程与安装相同：备份配置、替换二进制、重启服务、按第四节做一遍真实验收。
