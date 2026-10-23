---
description: "单台负载均衡入口仍是单点：本章用 Keepalived 实现 VRRP 虚拟 IP 主备漂移，让两台 HAProxy 共用一个虚拟 IP，主节点故障时 VIP 在数秒内自动漂到备节点，并讲清脑裂成因与防护、抢占取舍和完整的切换演练与回滚路径。"
---

# Keepalived 与 VRRP 高可用：虚拟 IP 主备漂移

## 一、概述与使用场景

第 06 章 [负载均衡：HAProxy](06-haproxy.md) 解决了流量分发与后端故障摘除，但它自己也留了一句话：单台 HAProxy 本身就是单点。那台机器宕机、网卡故障或系统升级重启时，后端再健康也没有入口。本章解决的正是这一层：用 Keepalived 在两台负载均衡节点之间实现虚拟 IP（VIP）主备漂移，入口地址不变，承载入口的机器可以换。

Keepalived 实现的是 VRRP（虚拟路由冗余协议）。原理一句话：一组节点组成一个「虚拟路由器」，共用一个虚拟 IP；任一时刻只有一台是 MASTER 并持有 VIP 对外服务，其余是 BACKUP，只监听不服务。每个虚拟路由器用 VRID（虚拟路由器 ID，取值 1–255）标识，同一二层网段内 VRID 不能与别的 VRRP 组撞号。

MASTER 与 BACKUP 之间靠 VRRP 通告维持关系，机制细节如下：

| 机制 | 说明 |
| --- | --- |
| 通告通道 | 通告是裸 IP 报文，协议号 **112**，发往组播地址 224.0.0.18（VRRPv2），不是 TCP/UDP 端口——防火墙放行时按协议号处理，见第二节 |
| 通告节奏 | MASTER 默认每 1 秒发一次通告（`advert_int`）；BACKUP 持续监听 |
| 故障判定 | BACKUP 在约 3 倍通告间隔（再加一个与自身优先级相关的偏移）收不到通告，即判定 MASTER 失效，发起选举接管 |
| 选举规则 | 优先级 `priority`（1–254）数值大者当选；255 保留给 VIP 的实际所有者，本章双机都是「借用」VIP 的常规部署，用 100/90 这类取值 |
| 漂移动作 | 新 MASTER 把 VIP 配置到本机接口，并向网段广播免费 ARP（gratuitous ARP），更新交换机与邻居的 MAC 映射；漂移耗时通常在数秒级，取决于通告间隔与选举超时 |
| 抢占 | 默认开启抢占（preempt）：原 MASTER 恢复后凭更高优先级会把 VIP 抢回去；关闭抢占的参数是 `nopreempt`，取舍见四、六节 |

本章与第 06 章的分工：HAProxy 管「流量进来之后分给谁、后端坏了怎么摘」，Keepalived 管「流量入口这台机器坏了怎么换」。两者装在同一对机器上：lb1 与 lb2 各跑一份 HAProxy（配置保持一致），Keepalived 决定 VIP 此刻落在哪台，客户端永远只连 VIP。

适用边界必须先说清：VIP 漂移的前提是两节点处于**同一二层网段**。公有云多数不支持组播/VRRP 与免费 ARP 漂移，照搬本章到云上虚拟机通常不通；云上应优先用云厂商的负载均衡产品。本章方案适用于自建机房、自管虚拟化平台等同网段环境。

!!! note "本章验证级别"
    本章为「文档核对」级别：文中两份 `keepalived.conf` 示例（含健康检查脚本块与脚本安全设置）已用 Ubuntu 24.04 的 Keepalived 2.2.8 官方二进制做过配置语法校验（`keepalived -t` 通过），但双机故障切换行为未在实机双机环境验证，上线前必须按第四节在测试环境完整演练；Ubuntu 26.04 标记为「待核验」，在测试机核验前不要直接套用到 26.04 生产机。

## 二、环境准备与前置条件

示例拓扑（沿用全站文档段地址风格，上线时换成真实地址）：

| 角色 | 主机名 | 真实 IP | Keepalived 角色 | priority |
| --- | --- | --- | --- | --- |
| 负载均衡节点 A | lb1 | 192.0.2.41 | MASTER | 100 |
| 负载均衡节点 B | lb2 | 192.0.2.42 | BACKUP | 90 |
| 对外服务地址 | — | VIP 192.0.2.40 | 任一时刻只落在一台上 | — |

其他固定参数：接口 `eth0`，VRID `51`，通告间隔 1 秒。两台均为 Ubuntu Server 22.04 LTS 或 24.04 LTS，已按第 06 章装好 HAProxy 且配置一致、各自直连本机验证可用；操作账号具备 sudo 权限。

前置条件逐项核对：

- 两台在同一二层网段，VIP 是该网段内未被占用的地址，先用 `ping 192.0.2.40` 确认无应答、无地址冲突再用。
- 两台时间同步正常（日志对照排障依赖时间一致）。
- 防火墙与网络环境要求按下表落实，这是本章最容易漏、漏了必然漂移失败的一项：

| 要求 | 说明 | 落实方式 |
| --- | --- | --- |
| 两节点间放行 IP 协议 112 | VRRP 通告走协议号 112，不是某个 TCP/UDP 端口；被拦则备机永远收不到通告，会直接双主（见五节场景一） | iptables 口径见下方命令；UFW 口径见下方命令；云安全组按协议号 112 或「全部协议」放行节点间流量 |
| 云安全组需单独核对 | 多数云安全组只支持 tcp/udp/icmp 选项，没有协议 112 的放行入口时不要想当然以为「全放行」包含它 | 在控制台逐项确认；确认不了就按「云上不支持」处理，改用云负载均衡 |
| 组播可达 | 默认通告走组播 224.0.0.18，交换机/虚拟化平台不能拦截组播 | 同网段交换机默认放行；虚拟化平台核对虚拟交换机的组播设置 |
| 公有云限制 | 多数公有云不支持组播/VRRP 与免费 ARP 漂移 | 云上优先用云厂商负载均衡，本章方案不硬套 |

UFW 放行命令（两台互放对端，UFW 的 `proto vrrp` 即协议 112；UFW 的系统讲解见第 02 部分 [防火墙](../02-security/03-firewall.md) 一章）：

```bash
# lb1 上执行：放行来自 lb2 的 VRRP 通告
sudo ufw allow from 192.0.2.42 to any proto vrrp

# lb2 上执行：放行来自 lb1 的 VRRP 通告
sudo ufw allow from 192.0.2.41 to any proto vrrp

# 两台都执行：确认规则已生效
sudo ufw status
```

iptables 口径（未用 UFW 的环境，两台都执行；规则持久化方式按 [防火墙](../02-security/03-firewall.md) 一章的口径处理）：

```bash
sudo iptables -A INPUT -p 112 -j ACCEPT
sudo iptables -L INPUT -n --line-numbers | grep 112
```

组播实在不可用时，VRRP 通告可以改单播：在 `vrrp_instance` 内加 `unicast_src_ip`（本机真实 IP）与 `unicast_peer`（对端真实 IP），两台互指。注意单播只是把通告改成点对点发送，VIP 漂移仍然要求同一二层网段，救不了跨网段与公有云的免费 ARP 限制，只作进阶了解，本章主示例仍用默认组播：

```text
    unicast_src_ip 192.0.2.41
    unicast_peer {
        192.0.2.42
    }
```

改任何配置前先备份，这是本章所有回滚动作的前提。首次安装后、第一次改配置前，两台都执行：

```bash
sudo mkdir -p /root/keepalived-backup
sudo cp -a /etc/keepalived/keepalived.conf /root/keepalived-backup/keepalived.conf.bak-20260101
ls -l /root/keepalived-backup/
```

之后每次改配置都新增一份带日期的备份，不要覆盖旧备份。

## 三、手把手操作步骤

### 3.1 安装 Keepalived（两台都执行）

```bash
sudo apt update
sudo apt install -y keepalived
keepalived --version
sudo systemctl enable keepalived
sudo systemctl status keepalived --no-pager
```

刚装完时服务会因默认配置为空或不存在而起不来，这是正常现象，先按后面小节写好配置再启动，不要在这一步反复重启排障。

### 3.2 主节点 lb1 配置全文与逐项讲解

把 lb1 的 `/etc/keepalived/keepalived.conf` 写为以下全文（先按第二节备份原文件）：

```text
global_defs {
    router_id lb1
    enable_script_security
}

vrrp_script chk_haproxy {
    script "/etc/keepalived/check_haproxy.sh"
    interval 2
    weight -20
    fall 2
    rise 2
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass <vrp-pw>
    }
    virtual_ipaddress {
        192.0.2.40/24
    }
    track_script {
        chk_haproxy
    }
}
```

逐项讲解：

| 配置项 | 本例取值 | 含义与注意点 |
| --- | --- | --- |
| `router_id` | `lb1` | 本机在 VRRP 组内的标识，**双机必须不同**（lb2 写 `lb2`），主要用于日志区分 |
| `enable_script_security` | —（开关行） | 启用脚本安全模式：Keepalived 2.2.x 起，只要配置里用了 `vrrp_script` 却不开这一项，配置校验与启动会直接报 `SECURITY VIOLATION` 拒绝执行脚本；开启后脚本以专用的 `keepalived_script` 用户运行，细节见 3.4 节。双机都要写 |
| `vrrp_script chk_haproxy` | — | 定义一个名为 chk_haproxy 的健康检查，下面的实例通过 `track_script` 引用它，细节见 3.4 节 |
| `script` | `/etc/keepalived/check_haproxy.sh` | 检查脚本路径，脚本返回 0 视为健康、非 0 视为异常 |
| `interval` | `2` | 每 2 秒检查一次 |
| `weight` | `-20` | 检查失败时把本机有效优先级扣 20：lb1 从 100 降到 80，低于 lb2 的 90，实现「HAProxy 挂了就主动让位」 |
| `fall` / `rise` | `2` / `2` | 连续失败 2 次才判异常、连续成功 2 次才恢复，避免单次抖动引发反复让位 |
| `state` | `MASTER` | lb1 的初始角色；lb2 写 BACKUP。注意这只是启动时的初始状态，实际角色由选举决定 |
| `interface` | `eth0` | 通告收发与 VIP 落地的接口，双机必须写各自承载 VIP 的真实接口名 |
| `virtual_router_id` | `51` | VRID，**双机必须相同**，且同网段内不能与其他 VRRP 组重复 |
| `priority` | `100` | lb1 优先级；lb2 为 90。双机不要写成相同值，相同值会让选举结果不可控（见五节场景一） |
| `advert_int` | `1` | 通告间隔 1 秒（默认值），直接决定故障发现速度，不要为了「省流量」调大 |
| `auth_type PASS` | — | VRRPv2 的简单口令认证，仅用于防止其他 VRRP 组误入本组 |
| `auth_pass` | `<vrp-pw>` | 口令占位值（示例占位符按 8 字符内设计，抄示例跑 3.6 节校验可直接通过），上线时换成实际口令并保证两台一致，**不要超过 8 个字符**——超长会被截断、连配置校验都会报截断错误；且是明文，不要对它有安全预期，详见下方警告 |
| `virtual_ipaddress` | `192.0.2.40/24` | VIP 及其前缀长度，双机必须完全一致 |
| `track_script` | `chk_haproxy` | 把健康检查结果纳入本实例的优先级计算 |
| `notify`（本例未配） | — | 可选的角色变化通知脚本（变 MASTER/BACKUP/FAULT 时触发），常用于发告警；不是漂移的必要条件，本章不展开 |

!!! warning "auth_pass 不是安全机制"
    `auth_pass` 只取前 8 个字符、且以明文存放在配置文件里，它的作用仅仅是让配错组的节点不要误加入本组，不提供任何真实的认证安全性。配置文件权限应收紧为仅 root 可读；两台口令的前 8 个字符必须完全一致，只在第 9 个字符之后不同的两个口令会被当作相同（见五节场景四）。

### 3.3 备节点 lb2 配置全文与差异

把 lb2 的 `/etc/keepalived/keepalived.conf` 写为以下全文：

```text
global_defs {
    router_id lb2
    enable_script_security
}

vrrp_script chk_haproxy {
    script "/etc/keepalived/check_haproxy.sh"
    interval 2
    weight -20
    fall 2
    rise 2
}

vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 90
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass <vrp-pw>
    }
    virtual_ipaddress {
        192.0.2.40/24
    }
    track_script {
        chk_haproxy
    }
}
```

与 lb1 的差异只有三处，其余逐字一致——这是刻意的：双机配置除身份与优先级外越一致，排障时越容易对照：

| 配置项 | lb1 | lb2 |
| --- | --- | --- |
| `router_id` | `lb1` | `lb2` |
| `state` | `MASTER` | `BACKUP` |
| `priority` | `100` | `90` |

特别强调必须相同、写错必然出事的四项：`virtual_router_id`、`virtual_ipaddress`、`auth_pass`（前 8 字符）、`advert_int`。其中 VRID 或口令不一致时，两台会互相「看不见」对方，各自当 MASTER，直接双主。

### 3.4 健康检查脚本（两台都执行）

VIP 只跟着 Keepalived 进程活没活走是不够的：lb1 的 Keepalived 活着、但它上面的 HAProxy 死了，VIP 还赖在 lb1 上，入口照样是坏的。所以要把 HAProxy 的存活纳入优先级计算，这就是 3.2 节 `vrrp_script` 的用途。检查脚本放 `/etc/keepalived/check_haproxy.sh`，内容保持最简——只判断本机 HAProxy 进程是否存在。

注意 3.2 配置里那行 `enable_script_security` 与本节配套：开启后，检查脚本由专用的 `keepalived_script` 用户执行（该用户由安装 Keepalived 时自动创建），所以脚本文件必须让该用户可读可执行、且不能让普通用户可写——放在 `/etc/keepalived/` 下并保持 root 属主即可，不要把脚本放到普通用户的主目录里；不开这一项时 2.2.x 会以 `SECURITY VIOLATION` 拒绝运行任何检查脚本，健康检查等于不存在。

```bash
sudo tee /etc/keepalived/check_haproxy.sh > /dev/null <<'EOF'
#!/bin/bash
# 检查本机 HAProxy 进程是否存活：存活返回 0，异常返回非 0
pidof haproxy > /dev/null 2>&1
EOF
sudo chmod +x /etc/keepalived/check_haproxy.sh
ls -l /etc/keepalived/check_haproxy.sh
/etc/keepalived/check_haproxy.sh
echo $?
```

最后两条是自检：在 HAProxy 正常运行时执行脚本，`echo $?` 应输出 `0`。工作方式回顾：脚本连续失败 2 次（`fall 2`）后，lb1 的有效优先级被扣 20 变成 80，低于 lb2 的 90，lb1 主动让出 MASTER，VIP 漂到 lb2；lb1 的 HAProxy 恢复、脚本连续成功 2 次后扣分撤销。也就是说进程级故障不需要整机宕机就能触发切换，整机宕机则由通告超时触发（见第四节演练）。

权限注意：脚本与配置文件都要保证 Keepalived 进程能读能执行——脚本需有可执行权限且属主、权限不要收得过死，配置文件按 3.2 节警告收紧为 root 可读即可（Keepalived 以 root 启动读取配置）。若日志里出现脚本执行失败或权限类报错，先查这两处；不同版本的脚本运行账号约束以所装版本的官方文档为准。

### 3.5 让 HAProxy 在备机上也能绑 VIP：ip_nonlocal_bind（两台都执行）

有个容易栽的坑：第 06 章的 HAProxy 示例用 `bind *:80` 监听所有地址，这种写法不挑 VIP 在不在本机；但如果把 bind 写成 VIP 地址本身（例如 `bind 192.0.2.40:443`），备机在 VIP 还没漂过来时根本没有这个地址，HAProxy 会因「绑不上地址」启动失败，漂移真发生时反而接不住。解决办法是允许进程绑定本机尚不存在的地址：

```bash
echo "net.ipv4.ip_nonlocal_bind = 1" | sudo tee /etc/sysctl.d/99-keepalived-nonlocal-bind.conf
sudo sysctl --system
sysctl net.ipv4.ip_nonlocal_bind
```

期望最后一条输出 `net.ipv4.ip_nonlocal_bind = 1`。配置写在 `/etc/sysctl.d/` 下是为了重启后仍生效；改完后重启一次两台的 HAProxy，确认备机在无 VIP 状态下也能正常启动：

```bash
sudo systemctl restart haproxy
sudo systemctl status haproxy --no-pager
```

### 3.6 配置校验与启动（两台都执行，先 lb2 后 lb1 也可，顺序不敏感）

写好配置与脚本后，先校验、再启动，这是硬顺序：

```bash
sudo keepalived -t -f /etc/keepalived/keepalived.conf
sudo systemctl start keepalived
sudo systemctl status keepalived --no-pager
sudo journalctl -u keepalived -n 30 --no-pager
```

`keepalived -t` 无报错输出（或只输出配置就绪类信息）才算校验通过；有报错按行号改配置，改完重新校验，不要跳过校验直接启动。启动后日志里 lb1 应出现进入 MASTER 状态的记录、lb2 出现进入 BACKUP 状态的记录，具体状态确认在第四节做。

## 四、效果验证与切换演练

以下演练先在测试环境完整走一遍再上生产；生产演练安排在业务低峰并提前公告。本节全部是观察与验证动作，每项演练都给了回滚（恢复）步骤，中途发现异常先恢复、再排查。

### 4.1 稳态验证：VIP 归属与通告

两台分别执行，确认 VIP 只在 lb1 上：

```bash
# 两台都执行：看本机 eth0 上有没有 VIP 192.0.2.40
ip a show eth0 | grep "inet "

# 两台都执行：看当前角色与优先级
sudo journalctl -u keepalived --no-pager | grep -E "MASTER|BACKUP" | tail -n 5

# 任意一台或客户端执行：VIP 可达且经 HAProxy 返回 200
ping -c 3 192.0.2.40
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.40/
```

期望：lb1 的地址列表里有 `192.0.2.40/24`、lb2 没有；lb1 日志显示 MASTER、lb2 显示 BACKUP；ping 通、curl 返回 200。再在 lb2 上抓包确认通告在流动：

```bash
# lb2 上执行：应能持续看到来自 192.0.2.41 的 VRRP 通告（协议 112），看几秒后 Ctrl+C 结束
sudo tcpdump -i eth0 proto 112
```

抓不到通告，先回第二节查协议 112 放行与组播，不要先改 Keepalived 配置。

### 4.2 演练一：停主节点 Keepalived，模拟整机故障

在 lb1 上停掉 Keepalived（等效于 lb1 整机失效时通告消失的情形；真整机宕机连停服务的机会都没有，效果相同）：

```bash
# lb1 上执行
sudo systemctl stop keepalived
```

随后在 lb2 与客户端观察：

```bash
# lb2 上执行：约 3～4 秒（3 倍通告间隔加选举偏移）后应接管
ip a show eth0 | grep "inet "
sudo journalctl -u keepalived -n 20 --no-pager

# 客户端执行：短暂中断后恢复，持续请求观察中断时长
ping -c 10 192.0.2.40
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.40/
```

期望现象：lb2 日志出现进入 MASTER 状态的记录，VIP 出现在 lb2 的 eth0 上；ping 最多丢几个包后恢复，curl 恢复 200。若 VIP 迟迟不过来，按五节场景二排查。本演练的回滚就是 4.4 节的恢复动作：把 lb1 的 Keepalived 重新启动。

### 4.3 演练二（可选，有双主风险）：阻断通告，观察脑裂

!!! danger "本演练会真实制造双主，只在测试环境或维护窗口做"
    阻断通告期间两台会同时持有 VIP（脑裂），期间的连接落点不可控。若后端连着数据库等有状态服务，不要做本演练；做完必须按回滚步骤解除阻断并复查 VIP 只剩一处。

在 lb2 上临时丢弃入向的 VRRP 通告，模拟「通告路径被防火墙误拦/链路故障」：

```bash
# lb2 上执行：丢弃入向协议 112，lb2 将收不到 lb1 的通告
sudo iptables -I INPUT -p 112 -j DROP
```

观察（两台都看）：约 3～4 秒后 lb2 自认 MASTER 接管 VIP，而 lb1 仍是 MASTER——两台 `ip a` 都能看到 192.0.2.40，这就是脑裂的现场形态。用它验证两件事：监控是否对「双台同时有 VIP」告警、值班人员是否认得出这不是正常漂移。

回滚（演练结束立即执行，不要过夜）：

```bash
# lb2 上执行：删除阻断规则，通告恢复
sudo iptables -D INPUT -p 112 -j DROP

# 两台都执行：复查 VIP 只在 lb1 上，lb2 回到 BACKUP
ip a show eth0 | grep "inet "
sudo journalctl -u keepalived -n 10 --no-pager
```

### 4.4 演练三：主节点恢复与回切观察

抢占默认开启，所以恢复 lb1 后 VIP 会自动漂回 lb1：

```bash
# lb1 上执行
sudo systemctl start keepalived

# 两台都执行：观察角色变化
sudo journalctl -u keepalived -n 20 --no-pager
ip a show eth0 | grep "inet "
```

期望：lb1 收到通告后凭优先级 100 大于 90 重新当选 MASTER，VIP 漂回 lb1，lb2 回到 BACKUP；客户端再经历一次数秒级的漂移抖动。结论要写进运维文档：**每次主节点恢复都伴随一次回切抖动**。若业务对这种抖动敏感、希望「漂过去就先待着，等人工安排再回切」，在两台的 `vrrp_instance` 中都加 `nopreempt`——注意它的生效语义与 state 写法有关（常见稳态做法是双机 state 都写 BACKUP 并同配 nopreempt），改之前先在测试环境验证行为符合预期，改完按 3.6 节校验再重启，不要在生产上直接试。

进程级故障的演练同理可做：在 lb1 上停掉 HAProxy（`sudo systemctl stop haproxy`），观察检查脚本扣分后 VIP 漂到 lb2，再启动 HAProxy 看扣分撤销、VIP 按抢占规则漂回。回滚即恢复 HAProxy 并复查角色。

## 五、常见错误与排坑指南

场景一：两台同时持有 VIP（双主脑裂）。现象：两台 `ip a` 都能看到 192.0.2.40，客户端连接随机落到任一台、时通时断；若后端是有状态服务，还可能出现两边各写一份数据的分叉。成因只有一个核心：**通告到不了对端**——协议 112 被防火墙或安全组拦掉、网线/交换机故障让心跳链路断开、或一台内核卡死到发不出通告，双方都判定「对方已死」，各自当 MASTER。必须直说的是：**VRRP 本身没有仲裁/见证机制**，没有第三方裁判来裁定谁是真的主，通告一断双主在协议层面无解，只能靠部署与监控手段防（见六节清单）。处置顺序：

```bash
# 两台都执行：先定性——谁在发通告、谁收得到
sudo tcpdump -i eth0 proto 112
sudo iptables -L INPUT -n --line-numbers | grep 112
sudo ufw status

# 确认通告恢复后，仍双主时在 lb2 上重启 Keepalived 让它回 BACKUP
sudo systemctl restart keepalived
ip a show eth0 | grep "inet "
```

先恢复通告路径（放行协议 112、修链路），多数情况下低优先级一侧会自动退回 BACKUP；涉及数据库等有状态后端时，先按第 11 部分 [高可用与故障恢复演练](../11-databases/10-ha-recovery-drills.md) 的纪律隔离双写、定性数据，再恢复服务，不要两边一起放流量。

场景二：主节点宕机后 VIP 不漂移。现象：lb1 停机或停 Keepalived 后，lb2 迟迟不接管，VIP 无人持有、入口全断。按顺序查：lb2 的 Keepalived 是否在运行、配置校验是否通过；两台 VRID 与 `auth_pass` 前 8 字符是否一致（不一致时 lb2 根本不认 lb1 的通告组，平时就已经是双主或备机不跟随，见场景一与场景四）；lb2 上抓包是否曾收到过通告（从没收到过，回第二节查协议 112 与组播）；检查脚本是否把 lb2 自己的有效优先级也扣到了异常状态：

```bash
# lb2 上执行
sudo systemctl status keepalived --no-pager
sudo keepalived -t -f /etc/keepalived/keepalived.conf
sudo journalctl -u keepalived -n 50 --no-pager
sudo tcpdump -i eth0 proto 112
```

场景三：VIP 反复横跳、抢占抖动。现象：VIP 几分钟内在两台之间来回漂，客户端频繁短暂中断。常见成因：主节点 HAProxy 进程不稳定，检查脚本反复扣分/撤销，优先级来回穿越备机的 90；或主节点网卡/链路抖动导致通告时断时续。处置：先看两台日志中角色变化的时间线与检查脚本结果，对齐抖动源头；治标可拉大检查的 `fall`/`rise` 抑制单次抖动，治本是修稳主节点的 HAProxy 或链路；若抖动源于「每次主节点恢复必回切」的设计本身，按 4.4 节评估改 nopreempt 稳态方案。

场景四：auth_pass 超长或两边不一致导致组队失败。现象：配置逐字看着一样，服务也能启动，但两台互不跟随、双主或备机不接管，日志里可能有通告被忽略类记录。根因常在口令：`auth_pass` **只取前 8 个字符**——两台口令若在前 8 字符内不同，认证直接对不上；若仅在第 9 字符之后不同，反而会被当作相同（更隐蔽，换口令时会以为已经换了其实没换）。修复：把两台的口令统一改成不超过 8 个字符的明确值，改完校验并重启，再按 4.1 节复查角色：

```bash
# 两台都执行：核对口令字段（输出含明文口令，只在管理终端看，不要贴进工单或聊天记录）
sudo grep -A 1 "auth_type" /etc/keepalived/keepalived.conf
```

场景五：备机上的 HAProxy 绑不了 VIP 起不来。现象：备机 HAProxy 启动失败，日志报绑定 VIP 地址失败（cannot bind / address not available 类字样），而主机上完全正常。原因：bind 行写的是 VIP 地址，备机当前没有这个地址，内核默认不许绑不存在的地址。修复就是 3.5 节的 `ip_nonlocal_bind`，确认它真的生效后再重启 HAProxy：

```bash
# 出问题的一台上执行
sysctl net.ipv4.ip_nonlocal_bind
cat /etc/sysctl.d/99-keepalived-nonlocal-bind.conf
sudo systemctl restart haproxy
sudo systemctl status haproxy --no-pager
```

若 `sysctl` 输出为 0，是持久化文件没写对或没执行 `sysctl --system`；输出为 1 还绑不上，再查 bind 行写的地址与 VIP 是否逐字一致。

## 六、生产环境最佳实践与安全建议

第一，脑裂防护清单（逐项落实，不要只做一两项）：

- 通告路径与业务路径尽量分离：有条件时用独立心跳网卡或直连线承载 VRRP 通告，业务网卡故障不连带把通告打断，反之亦然。
- 协议 112 双向放行并**演练验证**：不只是写了规则，还要按 4.1 节抓包亲眼看到通告、按 4.3 节验证过阻断与恢复的行为。
- 监控双主：对「两台同时出现 VIP」这一状态单独告警（例如定时在两台执行 `ip a` 采集 VIP 归属），这是 VRRP 部署最值得上的一条告警，比单看服务存活重要。
- 两台 priority 不要写相同值；改任一一台的配置后同步复查另一台的 VRID、口令与 VIP 是否仍一致。
- 应用层配合：VIP 后面若是有状态服务（尤其是数据库），切换纪律按第 11 部分 [高可用与故障恢复演练](../11-databases/10-ha-recovery-drills.md) 执行——先隔离、先定性、再提升，不要让漂移自动把双写放大。
- 记住边界：VRRP 没有仲裁机制，本清单是降低概率与缩短发现时间，不是根除脑裂；跨网段与公有云场景不要硬套，改用云负载均衡或有仲裁的方案。

### 回滚与恢复

第二，配置备份与恢复。每次改配置前按第二节的备份命令新增带日期备份，`keepalived.conf` 与 `check_haproxy.sh` 一起备（脚本也是配置的一部分）。单机配置恢复的步骤：

```bash
# 出问题的一台上执行：还原备份、校验、重启、复查角色
sudo cp -a /root/keepalived-backup/keepalived.conf.bak-20260101 /etc/keepalived/keepalived.conf
sudo keepalived -t -f /etc/keepalived/keepalived.conf
sudo systemctl restart keepalived
sudo journalctl -u keepalived -n 20 --no-pager
```

第三，整体回滚（整套 Keepalived 方案下线）。当漂移方案在现网不可行（例如事后才发现云环境不支持）需要整体撤销时，按下面顺序执行，把入口还原为单机形态：

```bash
# 两台都执行：先停用 Keepalived，停止一切漂移行为
sudo systemctl stop keepalived
sudo systemctl disable keepalived

# 在当前持有 VIP 的一台上执行：摘除残留 VIP（先 ip a 确认归属，只在持有者上执行本行）
sudo ip addr del 192.0.2.40/24 dev eth0

# 两台都执行：确认接口上已无 VIP
ip a show eth0 | grep "inet "
```

随后把业务入口改回直连 lb1 的真实地址 192.0.2.41（或切换到云负载均衡），并验证客户端经新入口可达：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.0.2.41/
```

注意回滚后入口重新变回单点，这是回滚的已知代价，要在变更单里写明并尽快落实替代冗余方案，不要让「临时单机」长期裸奔。

第四，与上下游章节的衔接。入口层：本章的 VIP 是第 06 章 [HAProxy](06-haproxy.md) 的前置冗余，两章的 HAProxy 配置必须保持一致，改后端先在两台同步再按第 06 章纪律 reload；防火墙细节按第 02 部分 [防火墙](../02-security/03-firewall.md) 一章管理规则与持久化；数据层：数据库主备切换与本章的 VIP 漂移是两套独立机制，不要互相替代，演练节奏与数据定性纪律见第 11 部分 [高可用与故障恢复演练](../11-databases/10-ha-recovery-drills.md)。

第五，日常巡检与演练节奏。每季度按第四节完整演练一次（整机故障、进程故障、恢复回切），把漂移耗时与中断包数记录下来与上次对比；每月人工复查一次两台配置的差异面（应只有 router_id、state、priority 三处）与 VIP 归属；`auth_pass` 按「只是防误入」的定位管理，不与其他系统口令复用，轮换时牢记只取前 8 字符的规则。
