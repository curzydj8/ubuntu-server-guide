---
description: "DNS 负责把人能记住的名字翻译成机器能路由的地址。浏览器输入一个域名之后，第一步不是连接网站，而是先问 DNS：这个名字对应哪个 IP。"
---

# DNS 服务器搭建

## 一、概述与使用场景

DNS 负责把人能记住的名字翻译成机器能路由的地址。浏览器输入一个域名之后，第一步不是连接网站，而是先问 DNS：这个名字对应哪个 IP。只要这一步出错，后面的 Web、邮件、VPN 都会跟着失败，而且报错往往看起来像网络不通，排查方向很容易跑偏。

在 Ubuntu Server 上自建 DNS，常见有四类需求。第一类是内网名字管理：实验室、机房或家庭网络里有十几台机器，靠改每台机器的 hosts 文件既容易漏又容易冲突，建一台内网 DNS 统一维护正向和反向解析，新增机器只改一处。第二类是加速与可控的递归解析：统一指定上游转发器，集中做缓存，减少每台机器各自向外查询带来的延迟与不一致。第三类是分流解析：内网域名走内网服务器，公网域名走公网解析，内外互不干扰。第四类是容器与集群场景：服务发现频繁变化，需要能用配置文件或接口快速更新记录。

不配或配错 DNS 的代价很具体。时间一长，内网会出现同名不同址、改了 IP 却没人同步 hosts 的问题；递归服务如果对公网开放，又会被利用做反射放大攻击；TTL 设置不合理时，迁移已经完成，客户端却还抱着旧地址不放，故障时间被人为拉长。所以本章不只讲把服务跑起来，还讲清三件事：谁来查、查什么、答案能缓存多久。

本章给出三种工具的完整配置。BIND9 功能最全，适合做权威解析与正规的内网主 DNS。dnsmasq 轻量易懂，适合小网络、网关兼 DNS 的场景。CoreDNS 以插件和文件配置见长，适合容器与云原生环境。三者定位不同，先看对比再选型。

| 对比项 | BIND9 | dnsmasq | CoreDNS |
| --- | --- | --- | --- |
| 核心定位 | 权威 DNS 与递归 DNS | 轻量 DNS 与 DHCP 组合工具 | 模块化 DNS 服务器 |
| 配置方式 | named.conf 加区域文件 | 单个配置文件加 hosts 补充 | Corefile 插件链 |
| 正反向区域 | 完整支持，标准区域文件 | 支持简单记录，反向能力有限 | 通过插件支持，适合程序化管理 |
| 转发与缓存 | 完整支持，可做主从同步 | 支持转发与本地缓存 | 通过 forward 插件转发 |
| 典型场景 | 企业内网主 DNS、权威域名 | 小型网络、开发测试网关 | Kubernetes、微服务、云原生 |
| 学习成本 | 较高，概念完整 | 最低，上手最快 | 中等，需要理解插件模型 |

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS。操作账号需要 sudo 权限，示例统一使用 ubuntu 用户。服务器应当有一块已配置静态地址的网卡，本章示例服务器地址为 192.0.2.53，内网示例网段为 192.0.2.0/24，示例域名为 example.com，反向区域对应 192.0.2.0/24 网段。

开始之前先确认三件事。第一，主机名与时间正确，DNS 日志和区域文件的序列号都依赖时间。第二，53 端口未被占用，Ubuntu 常见的本地解析服务可能占用 127.0.0.53，服务器版一般只监听回环地址，不影响对外提供服务，但排障时要分清。第三，想清楚这台 DNS 的角色：只做内网权威、只做递归缓存，还是两者兼做。角色不同，防火墙放行范围完全不同。

需要安装的软件包随选型而定。BIND9 路线安装 bind9、bind9utils 与 dnsutils。dnsmasq 路线安装 dnsmasq 与 dnsutils。CoreDNS 路线使用官方二进制加 systemd 单元运行，不在 Ubuntu 默认仓库提供 deb 包时，不要改用来源不明的第三方包。所有路线都要准备好编辑器、备份目录和测试客户端，测试客户端可以就是服务器本机，另备一台内网机器做交叉验证更可靠。

!!! note "关于 systemd-resolved"
    Ubuntu 默认开启 systemd-resolved 做本机存根解析。它监听 127.0.0.53，与 BIND9 监听全部地址并不冲突。自建 DNS 对外服务时，不要为了省事直接停掉它，先确认本机解析走哪条链路，再决定是否调整，避免改完 DNS 服务能跑、本机反而无法解析外网。

!!! warning "53 端口与防火墙"
    DNS 同时使用 UDP 53 与 TCP 53。只放行 UDP 会导致大响应与区域传送失败。面向内网的服务只对内网网段放行，不要把递归解析对整个互联网开放。

## 三、手把手操作步骤

下面先完整走 BIND9 路线，再分别给出 dnsmasq 与 CoreDNS 的完整配置。三条路线只选一条在同一台机器上启用，不要同时监听 53 端口。

### 3.1 BIND9 安装与全局配置

第一步，安装软件包并确认版本：

```bash
sudo apt update
sudo apt install -y bind9 bind9utils dnsutils
named -v
systemctl status bind9
```

第二步，备份主配置与选项文件。任何修改之前先备份，这是本章所有配置文件的统一要求：

```bash
sudo cp /etc/bind/named.conf /etc/bind/named.conf.bak
sudo cp /etc/bind/named.conf.options /etc/bind/named.conf.options.bak
sudo cp /etc/bind/named.conf.local /etc/bind/named.conf.local.bak
```

第三步，编辑全局选项文件 `/etc/bind/named.conf.options`，写入以下完整内容：

```ini
options {
    directory "/var/cache/bind";
    listen-on port 53 { 127.0.0.1; 192.0.2.53; };
    listen-on-v6 { none; };
    allow-query { localhost; 192.0.2.0/24; };
    allow-recursion { localhost; 192.0.2.0/24; };
    recursion yes;
    forwarders {
        198.51.100.53;
        2001:db8::53;
    };
    forward only;
    dnssec-validation auto;
    auth-nxdomain no;
};
```

逐行讲解关键参数：

| 参数 | 含义 | 本例取值说明 |
| --- | --- | --- |
| directory | 区域文件与缓存的工作目录 | 使用发行版默认目录，不必改动 |
| listen-on | 监听的 IPv4 地址与端口 | 只监听回环与内网地址，不监听公网地址 |
| allow-query | 允许哪些来源发起查询 | 只允许本机与内网网段 |
| allow-recursion | 允许哪些来源做递归查询 | 与 allow-query 保持一致，防止开放递归 |
| forwarders | 递归查询转发的上游地址 | 填运营商或可信公共解析的地址，示例为文档地址 |
| forward only | 只转发不自行迭代 | 内网环境常用，保证解析路径可控 |
| dnssec-validation | 是否校验 DNSSEC 签名 | 保持 auto，由软件自动处理信任锚 |

第四步，在 `/etc/bind/named.conf.local` 中声明正向与反向区域。修改前已经完成备份，直接写入以下完整内容：

```ini
zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    allow-transfer { none; };
};

zone "2.0.192.in-addr.arpa" {
    type primary;
    file "/etc/bind/zones/db.192.0.2";
    allow-transfer { none; };
};
```

其中 type primary 表示本机是该区域的主服务器，file 指定区域文件路径，allow-transfer 为 none 表示不允许其他机器拉取整份区域数据。反向区域名把网段地址倒序书写，192.0.2.0/24 对应 2.0.192.in-addr.arpa，初学者最容易在这里写反，写完务必对照网段逐段检查。

第五步，创建区域文件目录并编写正向区域文件 `/etc/bind/zones/db.example.com`：

```bash
sudo mkdir -p /etc/bind/zones
sudo nano /etc/bind/zones/db.example.com
```

```ini
$TTL 3600
@   IN  SOA ns1.example.com. opsadmin.example.com. (
        2026102101
        7200
        3600
        1209600
        3600 )
    IN  NS  ns1.example.com.
ns1 IN  A   192.0.2.53
www IN  A   192.0.2.80
app IN  A   192.0.2.81
db  IN  A   192.0.2.82
mail IN A   192.0.2.25
@   IN  MX  10 mail.example.com.
```

SOA 记录各字段含义如下：起始授权记录的第一个字段是主 DNS 名字 ns1，第二个字段是管理员邮箱，写法把 @ 换成点号。括号内五个数依次是序列号、刷新时间、重试时间、过期时间与最小 TTL，单位均为秒。每次修改区域文件都必须增大序列号，推荐用日期加两位流水号的写法，例如 2026102101 表示 2026 年 10 月 21 日第一次修改。当天第二次修改就改成 2026102102，从服务器与缓存才知道需要更新。

第六步，编写反向区域文件 `/etc/bind/zones/db.192.0.2`：

```ini
$TTL 3600
@   IN  SOA ns1.example.com. opsadmin.example.com. (
        2026102101
        7200
        3600
        1209600
        3600 )
    IN  NS  ns1.example.com.
53  IN  PTR ns1.example.com.
80  IN  PTR www.example.com.
81  IN  PTR app.example.com.
82  IN  PTR db.example.com.
```

反向文件里只写主机号最后一段，53 就代表 192.0.2.53，PTR 记录把地址指回名字，正反向记录要保持一致。

第七步，检查语法并启动服务：

```bash
sudo named-checkconf
sudo named-checkzone example.com /etc/bind/zones/db.example.com
sudo named-checkzone 2.0.192.in-addr.arpa /etc/bind/zones/db.192.0.2
sudo systemctl enable --now bind9
sudo systemctl restart bind9
ss -tulnp | grep 53
```

named-checkzone 输出末尾出现 OK 才表示区域文件合格。最后放行内网访问：

```bash
sudo ufw allow from 192.0.2.0/24 to any port 53 proto udp
sudo ufw allow from 192.0.2.0/24 to any port 53 proto tcp
```

### 3.2 dnsmasq 完整配置

dnsmasq 适合机器数量不多、希望配置一眼看完的小网络。安装与备份命令如下：

```bash
sudo apt install -y dnsmasq dnsutils
sudo cp /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
sudo nano /etc/dnsmasq.conf
```

在文件末尾写入以下完整配置，文件中原有的同名选项要先注释掉，避免重复定义：

```ini
port=53
listen-address=127.0.0.1,192.0.2.53
bind-interfaces
domain-needed
bogus-priv
no-resolv
server=198.51.100.53
domain=example.com
local=/example.com/
address=/www.example.com/192.0.2.80
address=/app.example.com/192.0.2.81
cache-size=1000
log-queries
log-facility=/var/log/dnsmasq.log
```

参数说明：listen-address 限定监听地址，bind-interfaces 保证只绑定指定网卡。no-resolv 表示不读系统解析文件，改用 server 行明确指定上游，避免解析环路。local 表示该域名只在本地回答，不转发到上游。address 行是最常用的静态记录写法，一行一条。改完检查并重启：

```bash
sudo dnsmasq --test
sudo systemctl enable --now dnsmasq
sudo systemctl restart dnsmasq
```

### 3.3 CoreDNS 完整配置

CoreDNS 的配置单位叫 Corefile，一段地址加一串插件就是一个服务块。先创建目录，再把官方二进制放到 `/usr/local/bin/coredns` 并赋予执行权限，然后备份与编写配置文件：

```bash
sudo mkdir -p /etc/coredns
sudo cp /etc/coredns/Corefile /etc/coredns/Corefile.bak
sudo nano /etc/coredns/Corefile
```

```yaml
example.com:53 {
    file /etc/coredns/db.example.com
    log
    errors
    cache 300
}

.:53 {
    forward . 198.51.100.53
    cache 300
    log
    errors
    health
    ready
}
```

第一块只负责 example.com 的权威回答，file 插件加载区域文件，格式与 BIND9 区域文件兼容。第二块负责其余域名的转发，forward 把查询送到上游，cache 做本地缓存，health 与 ready 提供健康检查端点，便于容器编排探活。再创建 systemd 单元 `/etc/systemd/system/coredns.service`：

```ini
[Unit]
Description=CoreDNS DNS Server
After=network.target

[Service]
User=ubuntu
ExecStart=/usr/local/bin/coredns -conf /etc/coredns/Corefile
Restart=on-failure
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now coredns
systemctl status coredns
```

!!! tip "选型建议"
    机器超过二十台、需要主从同步或正规区域管理，直接上 BIND9。只有一台网关兼管全家设备，dnsmasq 足够。服务已经跑在容器平台里，需要用 Git 管理配置并快速滚动更新，选 CoreDNS。

## 四、效果验证与测试

验证分四步：服务在监听、本区域能答对、转发能答对、反向能对上。在服务器本机依次执行：

```bash
dig @192.0.2.53 www.example.com A
dig @192.0.2.53 app.example.com A
dig @192.0.2.53 example.com MX
dig @192.0.2.53 -x 192.0.2.80
dig @192.0.2.53 www.example.org A
```

正向查询的期望输出核心部分如下：

```text
;; ANSWER SECTION:
www.example.com.    3600    IN    A    192.0.2.80

;; Query time: 2 msec
;; SERVER: 192.0.2.53#53(192.0.2.53)
```

判断标准有三条。状态行显示 NOERROR，ANSWER SECTION 出现预期地址，TTL 与区域文件设定一致。反向查询应返回 PTR 记录 www.example.com。最后一条查外部域名，用来验证转发器工作正常，能返回结果说明递归链路通。还要在一台内网客户端上把 DNS 指向 192.0.2.53 后重复正向查询，确认防火墙与监听地址没有问题。连续查两次同一名字，第二次的 Query time 明显变小，说明缓存生效。

```bash
sudo rndc status
sudo journalctl -u bind9 -n 50 --no-pager
```

## 五、常见错误与排坑指南

场景一：启动失败，日志报权限或加载错误。报错原文片段为 `loading configuration: permission denied` 以及 `zone example.com/IN: loading from master file failed: file not found`。原因通常是区域文件路径写错，或文件属主不对导致 named 进程读不到。修复方法是核对 named.conf.local 里的 file 路径与真实路径完全一致，并把区域文件属组改为 bind 后重启：

```bash
sudo chown -R root:bind /etc/bind/zones
sudo chmod 640 /etc/bind/zones/db.example.com
sudo chmod 640 /etc/bind/zones/db.192.0.2
sudo named-checkconf
sudo systemctl restart bind9
```

场景二：查询返回 SERVFAIL。报错表现是 dig 状态行显示 `status: SERVFAIL` 且没有 ANSWER SECTION。常见原因是区域文件 SOA 语法错误，例如括号没有闭合、邮箱写法漏了结尾点号，服务能启动但区域加载失败。先用 named-checkzone 单独检查该区域，按报错行号修正，再重启服务并复查日志：

```bash
sudo named-checkzone example.com /etc/bind/zones/db.example.com
sudo journalctl -u bind9 -n 100 --no-pager
```

场景三：内网能查、外网名字查不到。表现是本区域记录全部正常，外部域名返回超时或 REFUSED。原因多为转发器地址不可达，或服务器出方向的 53 端口被防火墙拦截。先在服务器上直接向上游地址查询验证连通性，再检查出站规则：

```bash
dig @198.51.100.53 www.example.org A
sudo ufw status verbose
```

上游直查也失败，就更换为可达的上游地址并重启服务。注意不要把 allow-recursion 改成对所有来源开放来绕过问题，那会把故障修成安全事故。

## 六、生产环境最佳实践与安全建议

第一，权威与递归尽量分开。机器规模上来之后，对外权威解析与对内递归解析拆成两台，前者不做递归，后者不对外，攻击面与故障面都更小。第二，严格限制查询来源。allow-query 与 allow-recursion 只写可信网段，防火墙再做一层来源限制，双层控制缺一不可。第三，关闭不必要的区域传送。没有从服务器时 allow-transfer 设为 none，有从服务器时只允许从服务器地址传送，并配合密钥认证。

第四，变更走流程。每次改区域文件先备份、改序列号、跑 named-checkzone、再平滑重载，最后用 dig 从客户端验证，四步做完才算变更完成。重载优先用 `sudo rndc reload`，不必每次都重启进程。第五，监控与告警要跟上。监控进程存活、53 端口响应时间与 SERVFAIL 比例，日志纳入第 4 章的集中收集范围。

第六，TTL 要为迁移留余地。平时设为 3600 秒，迁移前先降到 300 秒，稳定后再调回。第七，把 `/etc/bind` 纳入备份并定期演练恢复。
