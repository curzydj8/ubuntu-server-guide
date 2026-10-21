# 网络隧道与 VPN

## 一、概述与使用场景

VPN 与隧道解决的是通道问题：两台机器不在同一个局域网，又需要像在同一个局域网里那样安全互访。典型场景有三类。第一，异地运维：家里、办公室与云服务器各有一台机器，希望随时能用内网地址 SSH 回去。第二，内网服务访问：数据库、监控面板这类只对内网开放的服务，出差时也要能安全打开。第三，整段流量托付：在不可信网络下，把本机流量经一台可信服务器转发出去。

不做加密通道、直接把服务端口暴露到公网，风险是立竿见影的。数据库、远程桌面、管理后台一旦裸奔，自动化扫描几分钟内就会找上门，弱口令与未打补丁的漏洞都会被直接利用。另一类问题是地址不可达：家庭宽带多数没有公网 IPv4，运营商级 NAT 之后，传统端口映射根本做不了，这时候需要的不是更复杂的映射，而是能主动向外打洞组网的工具。

本章三条路线分工明确。WireGuard 是现代加密隧道协议，配置短、性能好、代码量小，适合自己掌控服务端与客户端的点对点或星型组网，是本章主线。OpenVPN 历史久、生态全、兼容性强，很多企业现网仍在用，本章给概览与选型判断，不展开完整搭建。Tailscale 基于 WireGuard 做产品化组网，自动处理 NAT 穿透与密钥分发，适合没有公网 IP、想十分钟组好网的场景。三者的关系不是替代，而是掌控深度不同：越往下越省事，越往上越自主。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，操作账号需要 sudo 权限，示例使用 ubuntu 与 opsadmin 两个示例用户名。WireGuard 示例中，服务端示例公网地址为 198.51.100.10，监听 UDP 51820 端口，隧道网段为 192.0.2.0/24，服务端隧道地址为 192.0.2.1，客户端隧道地址为 192.0.2.2，服务端背后的内网示例段为 198.51.100.128/25。这里的隧道网段是自选的示例网段，不要与现有内网网段重叠，重叠会导致路由冲突，这是部署前必须核对的第一件事。

前置条件有四条。第一，服务端需要公网可达地址与 UDP 51820 放行，自托管 WireGuard 没有打洞服务，服务端必须能被客户端找到。第二，服务端开启 IP 转发，客户端如需经服务端访问整个内网，还要配好 NAT 或静态路由。第三，时间同步正常，日志与证书类校验都依赖时间。第四，每台机器单独生成自己的密钥对，私钥只留在本机，交换的永远只有公钥，这是 WireGuard 安全模型的核心，任何教程让你把私钥发给对方都是错的。

软件安装：WireGuard 路线在服务端与客户端都安装 wireguard 与 wireguard-tools。Tailscale 路线用官方安装脚本，账号提前在管理后台准备好。OpenVPN 概览只涉及概念与包名对照，不要求跟做安装。

!!! warning "UDP 端口不要只开在系统防火墙"
    云服务器有两层控制：系统内的 UFW 与厂商安全组。WireGuard 的 UDP 51820 必须两层都放行，只开一层时表现是配置全对、握手永远不来，排查极其耗时间。动手前先把两层放行都列进清单。

!!! note "关于 Tailscale 的地址段"
    Tailscale 给每台设备分配 CGNAT 段 100.64.0.0/10 内的虚拟地址，并在管理后台展示。本章不写任何真实设备的虚拟地址，实操时以你自己后台显示的地址为准，不要照抄他人的地址截图。

## 三、手把手操作步骤

### 3.1 WireGuard 服务端：密钥与配置

第一步，服务端与客户端都安装软件包：

```bash
sudo apt update
sudo apt install -y wireguard wireguard-tools
wg --version
```

第二步，在服务端生成密钥对。私钥写入文件后立刻收紧权限，命令如下：

```bash
sudo mkdir -p /etc/wireguard
sudo chmod 700 /etc/wireguard
wg genkey | sudo tee /etc/wireguard/server_private.key
sudo chmod 600 /etc/wireguard/server_private.key
sudo cat /etc/wireguard/server_private.key | wg pubkey | sudo tee /etc/wireguard/server_public.key
```

第一条命令生成服务端私钥并保存，第二条由私钥推导出公钥。公钥可以公开，用于填到客户端配置里。私钥内容绝不贴到聊天、工单或代码仓库，本章只给生成命令与占位写法，配置示例中用 `<server-private-key>` 占位表示把本机生成的值填入该行。

第三步，开启转发并放行端口：

```bash
sudo cp /etc/sysctl.conf /etc/sysctl.conf.bak
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-wireguard.conf
sudo sysctl -p /etc/sysctl.d/99-wireguard.conf
sudo ufw allow 51820/udp
sudo ufw allow 22/tcp
```

第四步，编写服务端配置 `/etc/wireguard/wg0.conf`。新文件无旧版可备份，若文件已存在，先执行备份命令再编辑：

```bash
sudo cp /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.bak
sudo nano /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf
```

```ini
[Interface]
Address = 192.0.2.1/24
ListenPort = 51820
PrivateKey = <server-private-key>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 192.0.2.2/32
```

逐段讲解。Interface 段描述本机：Address 是本机在隧道内的地址，ListenPort 是监听的 UDP 端口，PrivateKey 填本机私钥。PostUp 与 PostDown 是接口拉起与关闭时执行的转发与 NAT 命令，其中 eth0 要换成服务端真实的出口网卡名，用 `ip route` 看默认路由所在网卡确认，不要猜。Peer 段描述一个对端：PublicKey 填客户端公钥，AllowedIPs 是重点，下一段专门讲。

### 3.2 AllowedIPs 到底是什么意思

AllowedIPs 同时承担两个职责，理解这一点，WireGuard 的一半故障就通了。第一，它是路由表：去往这些地址的流量走这条隧道。第二，它是入站白名单：从这个对端收到的包，源地址必须落在这组范围内，不在范围直接丢弃。这叫加密路由，公钥身份与允许地址绑定，冒充地址的包过不了校验。

取值写法按需求三选一。只允许单台客户端用它的隧道地址通信，写单个地址加 /32，例如 192.0.2.2/32，这是服务端给每个客户端的标准写法。要让客户端经服务端访问整个内网，客户端侧把服务端 Peer 的 AllowedIPs 写成内网网段，例如 198.51.100.128/25 加隧道网段。要让客户端全部流量都走隧道，写 0.0.0.0/0，这就是常说的全局模式，写它之前必须确认服务端转发与 NAT 已配好，否则客户端一连隧道就断网。

### 3.3 WireGuard 客户端配置

客户端重复密钥生成步骤，生成属于客户端自己的那一对：

```bash
wg genkey | sudo tee /etc/wireguard/client_private.key
sudo chmod 600 /etc/wireguard/client_private.key
sudo cat /etc/wireguard/client_private.key | wg pubkey | sudo tee /etc/wireguard/client_public.key
```

把客户端公钥填回服务端配置的 Peer 段，把服务端公钥填到客户端配置。客户端文件为 `/etc/wireguard/wg0.conf`，已存在时先执行 `sudo cp /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.bak` 备份再编辑：

```ini
[Interface]
Address = 192.0.2.2/24
PrivateKey = <client-private-key>
DNS = 198.51.100.153

[Peer]
PublicKey = <server-public-key>
Endpoint = 198.51.100.10:51820
AllowedIPs = 192.0.2.0/24, 198.51.100.128/25
PersistentKeepalive = 25
```

Endpoint 是服务端公网地址与端口，客户端靠它发起握手。PersistentKeepalive 25 表示每 25 秒发一个保活包，客户端在 NAT 后面时必须加，否则映射过期后服务端找不到客户端，表现是刚连上能通、放一会就断。双方配置完成后启动：

```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg show
ping -c 4 192.0.2.1
```

服务端同样执行 `sudo systemctl enable --now wg-quick@wg0` 开启自启。手机与桌面客户端可用官方 App 扫码导入，把客户端配置文本生成二维码即可，命令为 `qrencode -t ansiutf8 < /etc/wireguard/wg0.conf`，需要先安装 qrencode 包，二维码等同私钥文件，展示后不要截图外传。

### 3.4 OpenVPN 概览与选型判断

OpenVPN 基于 TLS 证书体系，使用 TCP 或 UDP 传输，默认 UDP 1194。它的优势是生态成熟：企业现网、商业服务与各类路由器固件广泛支持，权限与证书吊销体系完整。代价是配置项多、证书签发流程长、性能低于 WireGuard。在 Ubuntu 上的包名是 openvpn，配合 easy-rsa 签发证书。选型建议很直接：全新自建组网优先 WireGuard 或 Tailscale；要接入已有 OpenVPN 企业网络，或对端设备只支持 OpenVPN 时，才按现网规范部署 OpenVPN，不要为了新而迁移正在稳定运行的通道。

### 3.5 Tailscale 组网

第一步，安装并登录。官方脚本安装后，用 up 命令加入你的 tailnet：

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
tailscale status
```

up 命令会输出授权链接，在浏览器打开并登录同一账号完成授权。status 输出里能看到组网内所有设备与状态，直连还是走中继可以用 ping 子命令确认：

```bash
tailscale ping <peer-hostname>
tailscale netcheck
```

第二步，需要免密 SSH 时开启 Tailscale SSH，之后用设备名直接登录，认证由 tailnet 身份完成：

```bash
sudo tailscale up --ssh
tailscale ssh ubuntu@<peer-hostname>
```

第三步，子网路由。想让一台设备把背后的整个内网带进 tailnet，在该设备上宣告路由并在管理后台批准：

```bash
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
sudo tailscale up --advertise-routes=198.51.100.128/25
```

宣告只是申请，必须去管理后台批准该路由才生效，这是新手最常见的卡点。第四步，exit node。想让其他设备借这台机器出网，把它宣告为出口并在客户端选用：

```bash
sudo tailscale up --advertise-exit-node
sudo tailscale up --exit-node=<exit-node-hostname>
```

同样需要在后台批准出口节点资格。第五步，ACL 概念。ACL 是 tailnet 的访问控制文件，在管理后台以规则文件维护，核心思想是按用户、设备与标签限定谁能访问谁的哪个端口。生产使用至少做到：运维设备能访问服务器的 22 端口，普通设备不能访问数据库所在机器，新增设备默认无额外权限，扩权走修改 ACL 并留痕。ACL 写错会把自己挡在外面，修改前先导出当前版本保存，改完先小范围验证再保存为正式版本。

!!! tip "WireGuard 与 Tailscale 怎么选"
    有公网服务端、追求完全自主与最低依赖，选 WireGuard。设备分散在各地网络后面、没有公网地址、希望今天就能用，选 Tailscale。两者底层同源，先用 Tailscale 跑通业务、再迁到自托管 WireGuard，也是常见路径。

## 四、效果验证与测试

WireGuard 验证看三点：握手是否新鲜、流量计数是否增长、隧道内地址是否互通：

```bash
sudo wg show
ping -c 4 192.0.2.2
curl -s http://198.51.100.180
sudo wg show wg0 latest-handshakes
```

期望输出中 each Peer 显示 `latest handshake: 30 seconds ago` 这类近期时间，且 transfer 行的收发字节都在增长。刚启动还没有流量时握手时间可能为空，ping 一次对端再查就会出现。全局模式还要验证出口地址确实变成服务端地址，用网络查询服务看出口 IP 并与服务端地址对照。

Tailscale 验证命令如下，ping 显示 direct 表示直连成功，显示经中继也能用但延迟更高：

```bash
tailscale status
tailscale ping <peer-hostname>
ssh ubuntu@<peer-hostname>
```

## 五、常见错误与排坑指南

场景一：wg show 没有握手，客户端完全不通。表现是 latest handshake 一直为空、transfer 只有发送没有接收。原因按概率排序：服务端 UDP 51820 没有在安全组放行、Endpoint 地址或端口写错、两端公钥填反或填错。逐项核对命令如下，先确认服务端在监听，再逐字对照两端公钥：

```bash
sudo ss -ulnp | grep 51820
sudo wg show
sudo cat /etc/wireguard/server_public.key
sudo cat /etc/wireguard/client_public.key
```

场景二：能握手、能 ping 隧道地址，但访问不了内网。原因是转发或 NAT 没有生效，或客户端 AllowedIPs 没有包含目标内网段。先查转发开关与 NAT 规则，再核对客户端配置：

```bash
sysctl net.ipv4.ip_forward
sudo iptables -t nat -L POSTROUTING -n -v
sudo wg show wg0 allowed-ips
```

转发为 0 就重新执行 3.1 的 sysctl 步骤，AllowedIPs 缺网段就补上后重启接口 `sudo systemctl restart wg-quick@wg0`。

场景三：Tailscale 子网路由不生效。表现是设备在线，但经它访问背后网段超时。原因通常是路由只宣告未批准，或该设备本身没有开启 IP 转发。处理路径是先去管理后台批准路由，再在设备上确认转发开关，最后复查状态：

```bash
sysctl net.ipv4.ip_forward
tailscale status
sudo tailscale up --advertise-routes=198.51.100.128/25
```

## 六、生产环境最佳实践与安全建议

第一，一机一密钥。每个对端独立密钥对，设备丢失时只删服务端对应的 Peer 段即可吊销，不要多人共用一份客户端配置。第二，私钥当秘密管。配置文件权限 600，不进 Git、不进网盘，备份私钥要加密保存。第三，最小化 AllowedIPs。服务端给每个客户端只写它自己的 /32，客户端按需写网段，能不写全局就不写全局，全局模式只给确实需要的设备。

第四，隧道不是免检通道。经 VPN 进内网之后，SSH 与业务系统照样要做密钥登录与权限控制，VPN 只解决通道加密与地址可达，不代替应用层认证。第五，监控握手与流量。为 wg show 的握手时间做巡检，长时间无握手的对端要核查是离线还是配置被改。Tailscale 环境定期审阅后台设备列表与 ACL，离职与报废设备第一时间移除。

第六，变更留痕与回滚。改 wg0.conf 前先备份，改完用 `sudo wg syncconf wg0 /etc/wireguard/wg0.conf` 平滑同步或重启接口，并立刻从客户端复测连通性。涉及路由与 NAT 的变更安排在可经控制台兜底的时间操作，一旦把自己锁在隧道外，还有云厂商控制台可以救回来，这一点与第 2 章的上线纪律完全一致。
