# 防火墙管理（UFW / nftables / iptables）

## 一、概述与使用场景

防火墙是服务器的网络围墙，决定哪些流量能到达哪些端口。前两章把账号与入口管住了，但只要某个服务监听在公网端口上又没有被防火墙拦住，攻击者就能直接和这个服务对话，试探它的漏洞与弱口令。最常见的事故形态是：临时调试时开了一个数据库或缓存服务，监听地址是所有网卡，忘了关就上线，结果端口被扫描发现，数据被拖走或被勒索。这类事故里服务本身往往没有漏洞，缺的只是防火墙这一道默认拒绝的墙。

本章分三层讲。第一层是 UFW，它是 Ubuntu 自带的友好前端，适合绝大多数单机场景，几条命令就能做到默认拒绝入站、按需放行。第二层是 nftables，它是当前 Linux 内核防火墙的正统框架，Ubuntu 22.04 与 24.04 的底层都已经转向它，复杂规则集、按来源网段精细控制、需要长期维护的规则都应该写在这里。第三层是 iptables 兼容命令与 NAT 转发示例，存量脚本大量使用 iptables 语法，做网关或容器转发时也绕不开地址转换这个话题。不配防火墙的瓶颈不是偶尔被扫到，而是必然被扫到：公网地址空间被全天候自动扫描，任何一个多余的开放端口都等于在围墙上多开一扇没人看守的门。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS。操作前确认当前 SSH 端口与登录方式，特别是已经按第 01 章把 SSH 改到 2222 端口的读者，启用防火墙前必须先放行正在用的端口，否则启用瞬间就会断连。查看当前监听与现有规则：

```bash
sudo ss -tlnp
sudo ufw status verbose
sudo nft list ruleset
```

`ss -tlnp` 列出所有 TCP 监听端口与对应进程，用它盘点到底有哪些服务在对外提供访问，心里有数再写规则。`ufw status verbose` 查看 UFW 当前状态，未启用时会显示不活动。`nft list ruleset` 打印内核里现有的 nftables 规则集，排障时以它为准，因为 UFW 与 iptables 兼容层最终都会落到这里。需要安装的软件包如下，UFW 通常已预装，缺失时补装：

```bash
sudo apt update
sudo apt install -y ufw nftables iptables-persistent
```

`iptables-persistent` 提供 iptables 规则的开机恢复服务，只有决定使用 iptables 兼容路线时才需要它；走 UFW 或 nftables 路线时，规则持久化由各自的机制承担，不要多套机制同时管理同一批规则。

!!! warning "远程操作启用防火墙的铁律"
    通过 SSH 远程操作时，顺序必须是先放行当前 SSH 端口，再启用防火墙，再开新终端验证能重新登录。云服务器还要同步检查云厂商安全组，两层都要放行才算通。顺序做反的后果就是连接当场断开，只能靠控制台救援。

## 三、手把手操作步骤

### 3.1 UFW 基础配置

改防火墙属于高风险操作，先记录当前规则作为回滚依据，再开始设置。UFW 没有单独的配置文件需要备份，导出当前状态即可：

```bash
sudo ufw status numbered
sudo cp /etc/default/ufw /etc/default/ufw.bak
sudo cp -a /etc/ufw /etc/ufw.bak
```

然后依次设置默认方针、放行必要端口、启用防火墙：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp comment "SSH"
sudo ufw allow 80/tcp comment "HTTP"
sudo ufw allow 443/tcp comment "HTTPS"
sudo ufw enable
sudo ufw status verbose
```

逐条讲解：`default deny incoming` 是整套配置的地基，所有没有被明确放行的入站连接一律拒绝；`default allow outgoing` 允许服务器主动向外发起连接，系统更新、接口调用都需要出站；三条 `allow` 分别放行 SSH 的 2222 端口、网站的 80 与 443 端口，`comment` 备注写清用途，半年后回看规则时不用猜每个端口是干什么的；`enable` 执行时终端会提示启用后可能中断现有连接，确认前请再核对一遍 SSH 端口已经放行。按第 01 章未改端口的读者把 2222 换成 22。若 SSH 只允许某个管理网段来源，用带来源限定的写法替代全网放行：

```bash
sudo ufw allow from 198.51.100.0/24 to any port 2222 proto tcp comment "SSH from office"
sudo ufw limit 2222/tcp comment "SSH rate limit"
```

第一条把 SSH 来源收窄到示例办公网段 `198.51.100.0/24`，这是比改端口有效得多的防护；第二条 `limit` 在 allow 基础上增加连接频率限制，同一来源短时间内反复新建连接会被暂时拒绝，对抗慢速试探有额外帮助。

### 3.2 UFW 高级规则与日常管理

按端口段、按网卡、拒绝特定来源与删除规则是日常高频操作，命令如下，每条都给出完整参数，可直接套用修改端口与地址：

```bash
sudo ufw allow 8000:8010/tcp comment "App range"
sudo ufw allow in on eth0 to any port 443 proto tcp
sudo ufw deny from 192.0.2.0/24
sudo ufw status numbered
sudo ufw delete 3
sudo ufw reset
```

`8000:8010/tcp` 用冒号表示连续端口段，适合一组相邻的应用端口；`allow in on eth0` 把规则限定到指定网卡，多网卡机器上可以做到只在内网网卡放行管理类端口；`deny from` 后接来源网段，用于临时封堵一个明确的恶意来源段，此处 `192.0.2.0/24` 同样是文档示例网段；删除规则时先用 `status numbered` 看编号，再用 `delete` 加编号删除，比按原命令删除更不容易写错；`reset` 会清空全部规则并回到未启用状态，只在整体重做时使用，执行前确保有人能通过控制台进机器。UFW 的规则最终保存在 `/etc/ufw/user.rules` 与 `/etc/ufw/user6.rules`，系统升级或迁移时这两个文件就是要带走的资产，再次强调改动前用 3.1 节的方法备份整个 `/etc/ufw` 目录。

### 3.3 nftables 实战

当规则变多、需要按集合批量管理地址、或要写带计数与日志的规则时，改用 nftables 原生写法。先备份并查看现有的主配置文件：

```bash
sudo cp /etc/nftables.conf /etc/nftables.conf.bak
sudo cat /etc/nftables.conf
sudo systemctl enable nftables
```

把主配置文件改写为下面这套完整的单机规则，文件路径是 `/etc/nftables.conf`：

```nft
flush ruleset

table inet filter {
    set ssh_allow {
        type ipv4_addr
        flags interval
        elements = { 198.51.100.0/24 }
    }

    chain input {
        type filter hook input priority 0; policy drop;
        iif "lo" accept
        ct state established,related accept
        ct state invalid drop
        ip saddr @ssh_allow tcp dport 2222 ct state new accept
        tcp dport { 80, 443 } ct state new accept
        log prefix "nft-drop: " counter drop
    }

    chain forward {
        type filter hook forward priority 0; policy drop;
    }

    chain output {
        type filter hook output priority 0; policy accept;
    }
}
```

逐段讲解：文件第一行 `flush ruleset` 在加载时清空旧规则，保证文件内容就是最终状态；`table inet filter` 表示这张表同时管 IPv4 与 IPv6，避免只防了 IPv4 漏了 IPv6；`set ssh_allow` 定义来源集合，以后增删管理网段只改集合元素一行；`chain input` 的 `policy drop` 是默认拒绝，与 UFW 的默认拒绝是同一思想；`iif "lo" accept` 放行本机回环，很多本地服务依赖回环通信，这一行漏写会出现各种莫名其妙的本机调用失败；`ct state established,related accept` 放行已建立连接的回包，这是状态防火墙的关键，没有它服务器主动访问外网的返回流量会被默认拒绝拦掉；SSH 只对集合内来源开放，网站端口对所有来源开放；最后一行先记日志再丢弃，日志前缀统一为 `nft-drop:`，方便在系统日志里检索被拦的连接。写入后检查语法、加载并启用开机自启：

```bash
sudo nft -c -f /etc/nftables.conf
sudo nft -f /etc/nftables.conf
sudo systemctl restart nftables
sudo nft list ruleset
```

`nft -c` 只检查不加载，必须养成先检查再加载的习惯，一处语法错误整份文件都不会生效。

!!! warning "UFW 与 nftables 不要同时当家"
    UFW 启用时会在 nftables 里建自己的链，手写规则再插进去，两边互相看不懂对方的结构，排障时极易冲突。选一条路线坚持到底：简单单机用 UFW，需要复杂规则就停用 UFW 后全量切到 `/etc/nftables.conf` 管理，切换命令是 `sudo ufw disable`，切换过程同样要先保住 SSH 放行规则。

### 3.4 iptables 兼容命令与 NAT 转发

存量环境里仍会遇到 iptables。用它做同样的默认拒绝与放行，命令如下，注意 Ubuntu 22.04 起 `iptables` 默认走 nftables 后端，规则最终仍进内核的 nft 框架：

```bash
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 2222 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -L -n -v --line-numbers
```

每条规则的含义与 3.3 节一一对应：先设默认方针，再放回环与已建立连接，最后逐个放行业务端口。持久化用安装过的持久化服务保存与恢复：

```bash
sudo netfilter-persistent save
sudo netfilter-persistent reload
sudo cat /etc/iptables/rules.v4
```

NAT 转发解决的是另一类问题：服务器有一块公网网卡与一块内网网卡，要把访问公网地址某端口的流量转给内网机器，或让内网机器经服务器出网。先打开内核转发开关，改前备份：

```bash
sudo cp /etc/sysctl.conf /etc/sysctl.conf.bak
sudo nano /etc/sysctl.conf
```

确认文件中有一行 `net.ipv4.ip_forward=1`，然后加载生效并写转发与伪装规则。假设公网网卡为 `eth0`、内网网卡为 `eth1`，内网目标机示例地址为 `192.0.2.20`，要把公网 8443 端口转到它的 443 端口，并在 FORWARD 链上只放行这一条转发：

```bash
sudo sysctl -p
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8443 -j DNAT --to-destination 192.0.2.20:443
sudo iptables -A FORWARD -i eth0 -o eth1 -p tcp -d 192.0.2.20 --dport 443 -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo netfilter-persistent save
```

`DNAT` 改写目标地址完成端口转发；FORWARD 链默认是 DROP，必须单独放行这条转发流量，只写 NAT 不写放行是端口转发不通的最常见原因；`MASQUERADE` 让经 eth0 出网的内网流量伪装成服务器的公网地址，适用于公网地址动态变化的场景，固定公网地址也可用它，简单可靠。nftables 写法下，同样的转发是在一张 `table ip nat` 里用 `prerouting` 与 `postrouting` 两条链完成，思路完全一致，迁移时逐条对照翻译即可。

## 四、效果验证与测试

第一，看规则状态，三条路线分别用各自的查看命令，重点核对默认方针与 SSH 放行同时存在：

```bash
sudo ufw status verbose
sudo nft list ruleset
sudo iptables -L -n -v --line-numbers
```

UFW 期望输出示例：

```text
Status: active
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
2222/tcp                   ALLOW IN    Anywhere                   # SSH
443/tcp                    ALLOW IN    Anywhere                   # HTTPS
```

第二，做真实连通测试。从另一台机器分别测试应通与应断的端口：

```bash
ssh -p 2222 opsadmin@192.0.2.10
curl -I https://example.com
nc -vz 192.0.2.10 3306
```

期望结果：SSH 用新端口正常登录；网站端口返回 HTTP 响应头；未放行的 3306 端口连接超时或被拒绝，证明默认拒绝在起作用。第三，重启验证持久化，重启后再次查看规则并重做一次 SSH 登录测试，规则还在、登录还通，才算真正完成：

```bash
sudo reboot
sudo ufw status verbose
```

## 五、常见错误与排坑指南

场景一：启用 UFW 后 SSH 当场断开且重连超时。原因几乎都是启用前没有放行当前正在用的 SSH 端口，改过端口的人放行的还是 22。自救只能走云控制台或虚拟机控制台进来，进来后补放行规则再验证：

```bash
sudo ufw allow 2222/tcp comment "SSH"
sudo ufw status verbose
sudo ss -tlnp | grep 2222
```

最后一行确认 sshd 确实在监听 2222，三处对齐：服务监听端口、防火墙放行端口、客户端连接端口必须完全一致，差一处就连不上。

场景二：规则写了却不生效，服务还是连不上。日志里没有报错，`ufw status` 也显示已放行。常见原因是云厂商安全组没有同步放行，或服务只监听在回环地址上根本不对外。排查顺序是先看监听地址再看双层放行：

```bash
sudo ss -tlnp
sudo ufw status numbered
sudo nft list ruleset
```

监听地址显示为 `127.0.0.1` 开头说明服务只听本机，需要改服务自身的监听配置，防火墙再怎么放行也没用；监听是 `0.0.0.0` 而仍不通，就去云控制台核对安全组入方向规则。

场景三：iptables 规则重启后全部丢失。原因是只在命令行里加了规则，没有执行持久化保存，内存里的规则随重启清空。修复是规则确认无误后立刻保存，并检查保存文件确实生成：

```bash
sudo netfilter-persistent save
sudo ls -l /etc/iptables/rules.v4
sudo systemctl enable netfilter-persistent
```

走 nftables 路线的对应检查是确认 `nftables` 服务已启用且 `/etc/nftables.conf` 能通过 `nft -c` 检查，两条路线都遵循同一原则：配完必须重启验证一次，不验证的持久化等于没配。

## 六、生产环境最佳实践与安全建议

第一，默认拒绝是不可谈判的底线，任何新服务上线先想它要不要对公网开放，不需要就只监听回环或内网网卡，再在防火墙上确认没有放行。第二，管理类端口只对管理来源开放，SSH、数据库、缓存、监控面板一律按来源网段收窄，全网放行只留给真正的公众服务端口，例如网站的 80 与 443。第三，规则必须有备注与编号管理，每条放行写清用途与添加日期，季度复查时逐条问这条规则对应的服务还在不在，服务下线当天同步删规则，围墙上的门只减不增地管。第四，变更走窗口期并留回滚，先导出当前规则集存档，再改，再验，最后重启复核，云安全组与主机防火墙两处变更要记在同一条变更记录里。第五，防火墙日志要定期看，被拒绝记录突然暴增往往是扫描升级或配置外泄的信号，结合第 04 章的 Fail2ban 与日志审计一起看，才能把网络边界从静态配置变成持续有人值守的防线。
