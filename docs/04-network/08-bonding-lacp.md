---
description: "单块网卡是服务器最常见的链路单点：本章用 Netplan 把两块物理网卡聚合成 bond0，主示例 802.3ad/LACP（需交换机侧建 LAG），对照 active-backup（不需交换机配合），并讲清交换机侧要求、/proc/net/bonding 验证、成员口故障演练与恢复单网卡的完整回滚。改网即失联，带外通道与 netplan try 可回滚试应用是本章的硬前置。"
---

# 网卡聚合 Bonding 与 LACP：双网卡冗余与带宽叠加

## 一、概述与使用场景

第 07 章 [Keepalived 与 VRRP 高可用](07-keepalived-vrrp.md) 解决的是入口整机的冗余，但单台机器内部还有一个更基础的单点：网卡与网线。网卡坏、网线被碰掉、交换机单个端口故障，都会让一台健康的服务器从网络上消失。本章解决这一层：用 Linux bonding 把两块物理网卡聚合成一个逻辑接口 `bond0`，IP 配在 bond0 上，单条链路坏掉时流量自动改走另一条，上层应用无感知。

bonding 的成员网卡（下文称成员口）不再单独配 IP、不单独出现在路由里，对外只暴露 bond0。内核 bonding 驱动持续监测每个成员口的链路状态（MII 监测），发现故障就把流量从故障口撤走；链路恢复后成员口自动重新加入。目标分两类：**冗余**（一条坏了另一条顶上）和**带宽叠加**（两条链路同时分担流量）。bonding 的模式决定了目标与代价：

| 模式 | 名称 | 交换机要求 | 目标与说明 |
| --- | --- | --- | --- |
| 0 | balance-rr | 需静态聚合配合 | 轮询分发，可叠加带宽，但易乱序，生产少用 |
| 1 | active-backup | 无特殊要求 | 主备冗余：同一时刻只有一个成员口在跑，故障切换简单直接 |
| 2 | balance-xor | 需静态聚合配合 | 按哈希选路分流 |
| 3 | broadcast | 无特殊要求 | 所有口同时发同一份流量，只适合特殊镜像场景 |
| 4 | 802.3ad（LACP） | **必须在交换机侧建 LAG 并启用 LACP 协商** | 动态协商聚合：冗余 + 多流分流叠加带宽，生产主流 |
| 5 | balance-tlb | 无特殊要求 | 发送方向自适应负载，接收不叠加 |
| 6 | balance-alb | 无特殊要求 | 收发都自适应，但靠 ARP 协商改映射，行为复杂，生产少用 |

生产环境实际只在两种模式里选，本章也只展开这两种：

| 对比项 | 802.3ad（主示例） | active-backup（对照） |
| --- | --- | --- |
| 交换机侧 | 必须把两口划入同一 LAG/端口聚合组并启用 LACP，两口 VLAN 等设置一致 | 两口只是普通口，同 VLAN 即可，不建组 |
| 带宽 | 两条链路同时承载：多条流按哈希分到不同成员口，总带宽叠加 | 只有活动口承载，总带宽等于单口 |
| 单条流带宽 | **仍只有单口速率**：哈希按一条流固定选口，不会把一条流拆到两口上，不要期待单流翻倍 | 单口速率 |
| 故障切换 | 故障口退出聚合，其承载的流改走剩余口，剩余口继续叠加 | 活动口故障后备口接管，切换后带宽仍是单口 |
| 协商风险 | 交换机没配好就协商不起来（见五节场景二），依赖与网管的配合 | 几乎无协商风险，自己可控 |
| 选型建议 | 交换机可控、要冗余也要带宽时选它 | 交换机不可控、跨设备接入或只求稳妥冗余时选它 |

802.3ad 的分流靠 `transmit_hash_policy`（发送哈希策略）：它决定一条流落到哪个成员口。`layer2` 只看 MAC 地址，同一对设备之间的所有流都会挤在一条链路上；`layer2+3`、`layer3+4` 把 IP 与端口纳入哈希，多流才能真正分开，本章主示例用 `layer3+4`。另一个关键参数是 `lacp-rate`（LACP 报文速率）：`slow` 每 30 秒一帧、`fast` 每 1 秒一帧，fast 让协商建立与故障检出更快，本章用 fast。

适用边界先说清：两块网卡必须接在**同一台交换机**上（802.3ad 还必须同属一个 LAG 组）；公有云的虚拟网卡与网络由云厂商托管，多数不支持自建 bonding，本章面向自建机房、裸机与自管虚拟化环境，云上以云厂商网络方案为准。虚拟机场景要先确认两块虚拟网卡在宿主侧映射到不同物理链路，否则聚合的只是两条共用同一物理口的逻辑链路，冗余是假的。

!!! note "本章验证级别"
    本章为「文档核对」级别：文中 Netplan YAML 示例已用 PyYAML 做结构解析校验（bonds 结构、成员列表、模式参数与地址断言通过），但 bonding 的实机 LACP 协商、成员口故障切换与回滚行为未在真实服务器与交换机环境验证，上线前必须按第四节在测试环境完整演练；Ubuntu 26.04 标记为「待核验」，在测试机核验前不要直接套用到 26.04 生产机。

## 二、环境准备与前置条件

示例拓扑（文档段地址，上线时换成真实地址，并与现网保持一致）：

| 项目 | 取值 |
| --- | --- |
| 成员网卡 | `ens3`、`ens4`，接同一台交换机 |
| 聚合接口 | `bond0` |
| bond0 地址 | 192.0.2.50/24（沿用该机原单网卡地址，聚合后客户端与配置无需改指向） |
| 网关 | 192.0.2.1 |
| 主示例模式 | 802.3ad，`lacp-rate: fast`，`transmit-hash-policy: layer3+4` |
| 对照模式 | active-backup，`primary: ens3` |

系统为 Ubuntu Server 22.04 LTS 或 24.04 LTS，网络由 Netplan 管理，操作账号具备 sudo 权限。本机现有的单网卡 Netplan 基础概念见第 01 部分 [首次登录与网络配置](../01-basics/03-first-login-network.md)，单网卡配置也可用站内 [在线工具](../tools/index.md) 的 Netplan 生成器辅助生成，bonding 部分按本章参数手写补入。

!!! danger "改网络配置是所有变更里失联风险最高的一类"
    bonding 改错的后果不是某个服务起不来，而是**整机从网络上消失**：SSH 会话当场断开，且错误配置重启后依然生效，远程无从补救。本章的硬前置是：动手前必须确认**带外管理通道可用**——物理控制台、IPMI/iDRAC 等带外管理口，或虚拟化/云平台的串口控制台，并实际登录验证过一次。没有可用带外通道时，不要远程单人改 bonding：要么到现场操作，要么先把带外通道建好。第二节之后的所有步骤都默认你正通过带外通道或本地控制台操作；坚持走 SSH 远程操作的人，至少也要用 3.5 节的 `netplan try`（超时自动回滚）而不是直接 `netplan apply`，并接受会话断开后只能等回滚或找带外兜底的结果。

前置条件逐项核对：

- 两块网卡都已插好网线、链路灯亮，且接在同一台交换机上；两口速率与双工一致（例如都是千兆全双工），混速成员口无法加入 802.3ad 聚合（见五节场景三）。
- 走 802.3ad 时，交换机侧由网管**先行**把对应两口划入同一 LAG 组、启用 LACP、并确认两口 VLAN/Trunk 设置一致（细节见 3.2 节）；交换机没配好之前不要在服务器侧先动手。
- 确认第二块网卡当前没有承担任何业务：它在现有 Netplan 里不应有自己的 IP 配置；云镜像或安装器可能给它留过 DHCP 定义，3.1 节会逐文件清查并清除。
- 现网参数已记录：当前 IP、网关、DNS 与路由以现有配置为准抄录下来，bond0 沿用原单网卡地址；回滚时也靠这份记录核对。

改任何配置前先整体备份，这是本章一切回滚动作的前提。备份整个 Netplan 目录并留存当前网络状态：

```bash
sudo mkdir -p /root/netplan-backup
sudo cp -a /etc/netplan /root/netplan-backup/netplan-20260101
ip a | sudo tee /root/netplan-backup/ip-a-before.txt > /dev/null
ip route | sudo tee /root/netplan-backup/ip-route-before.txt > /dev/null
ls -la /root/netplan-backup/netplan-20260101/
```

之后每次改 Netplan 都新增一份带日期的目录备份，不要覆盖旧备份。

## 三、手把手操作步骤

### 3.1 确认现状：两块网卡与现有配置清查

先确认两块成员网卡都存在、链路状态正常、速率双工一致：

```bash
ip -br link
sudo ethtool ens3 | grep -E "Speed|Duplex|Link detected"
sudo ethtool ens4 | grep -E "Speed|Duplex|Link detected"
```

期望：两块网卡都在列表里，`Link detected: yes`，Speed 与 Duplex 两口一致（示例口径为 `Speed: 1000Mb/s`、`Duplex: Full`）。有一口 `Link detected: no`，先解决物理链路（网线、交换机端口）再继续，不要带着坏链路组聚合。

再清查全部 Netplan 文件，确认成员口在现有配置里的定义分布：

```bash
ls -la /etc/netplan/
sudo grep -Rn "ens3" /etc/netplan/
sudo grep -Rn "ens4" /etc/netplan/
```

要达到的状态：ens3 可以有现网的地址定义（3.3 节会被 bond 配置取代），ens4 **不应有任何地址或 DHCP 定义**。若某个文件（常见是云镜像的 `50-cloud-init.yaml`）里给 ens4 留了 `dhcp4: true` 之类的定义，先把那几行删掉；若 ens3 的地址定义分散在多个文件里，也在本步骤内归拢认知——3.3 节写新文件后，旧文件里 ens3/ens4 的定义必须全部清除，最终口径是：成员口只在新文件的 `ethernets` 里以无地址形态声明，IP 只属于 bond0。多个 Netplan 文件会按文件名顺序合并，成员口在别处残留地址定义是最常见的翻车点（见五节场景四）。

### 3.2 交换机侧配置要求（先于服务器动手）

802.3ad 是双边协商协议：服务器侧写了 `mode: 802.3ad` 只是发出协商请求，交换机侧没有对应的 LAG 组，聚合永远建不起来。动手改服务器之前，先让网管在交换机侧完成并回执确认：

| 要求 | 说明 |
| --- | --- |
| 两口划入同一 LAG 组 | ens3、ens4 对应的两个交换机端口加入同一个端口聚合组（不同厂商叫法：LAG、Port-Channel、Eth-Trunk、Bond），不能一口在组内一口在组外 |
| LACP 模式启用 | 聚合组启用 LACP 动态协商（不要配成纯静态聚合后让服务器去协商，两边模式要对齐） |
| 两口参数一致 | 两口同 VLAN、同为 access 或同为 trunk 且放行 VLAN 列表一致、速率双工一致 |
| 不要对单口附加独立策略 | 端口级的安全策略、限速若只挂在其中一口上，聚合后行为会不对称；策略应挂在聚合组上 |

active-backup 不需要上述任何配置：两口保持普通口、同 VLAN 即可，交换机甚至感知不到 bonding 的存在。这是它最大的运维优势，也是 3.4 节保留它作对照的原因。若网管明确表示交换机侧无法建 LAG，直接改走 active-backup，不要在 802.3ad 上硬耗。

### 3.3 编写 Netplan 配置：802.3ad 主示例

把 `/etc/netplan/60-bond.yaml` 写为以下全文（文件名取 60 前缀，让它在合并顺序里晚于既有的单网卡文件；写完后按 3.1 节的清查结果，把其他文件里 ens3/ens4 的地址与 DHCP 定义删净）：

```yaml
network:
  version: 2
  ethernets:
    ens3:
      dhcp4: false
      optional: true
    ens4:
      dhcp4: false
      optional: true
  bonds:
    bond0:
      interfaces:
        - ens3
        - ens4
      addresses:
        - 192.0.2.50/24
      routes:
        - to: default
          via: 192.0.2.1
      nameservers:
        addresses:
          - 192.0.2.53
      parameters:
        mode: 802.3ad
        lacp-rate: fast
        transmit-hash-policy: layer3+4
        mii-monitor-interval: 100
```

逐项讲解：

| 配置项 | 取值 | 含义与注意点 |
| --- | --- | --- |
| `ethernets.ens3/ens4` | `dhcp4: false` | 成员口只声明存在：不拿 DHCP、不配地址。地址只许出现在 bond0 上 |
| `optional: true` | — | 成员口缺失或迟到时不阻塞开机流程；少一口时 bond 以降级形态先起来，而不是整机等网卡 |
| `bonds.bond0.interfaces` | `ens3`、`ens4` | 成员列表，两口都必须在上面的 `ethernets` 里有声明 |
| `addresses` | `192.0.2.50/24` | bond0 的业务地址，沿用原单网卡地址，聚合后所有指向该地址的客户端与配置不变 |
| `routes` | `to: default` + `via: 192.0.2.1` | 默认路由走网关。现行 Netplan 推荐 `routes` 写法，旧的 `gateway4` 已弃用，不要在同一文件里混写 |
| `nameservers` | `192.0.2.53` | 文档段示例 DNS，上线时照抄你现网原单网卡配置里的 DNS，不要照抄这个示例值 |
| `parameters.mode` | `802.3ad` | 聚合模式，与 3.2 节交换机侧 LAG 必须对应 |
| `parameters.lacp-rate` | `fast` | LACP 报文每 1 秒一帧，协商建立与故障检出更快；`slow` 为每 30 秒一帧，检出慢但报文开销低 |
| `parameters.transmit-hash-policy` | `layer3+4` | 按源/目的 IP 与端口哈希选口，多流才能分到两条链路；写成 `layer2` 时同一对 MAC 的流量永远只走一口（见五节场景六） |
| `parameters.mii-monitor-interval` | `100` | 每 100 毫秒监测一次成员口链路状态，故障口的发现时延主要由它决定 |

写完收紧文件权限（新版 Netplan 对权限过宽的配置文件会告警）：

```bash
sudo chmod 600 /etc/netplan/60-bond.yaml
ls -la /etc/netplan/
```

### 3.4 对照配置：active-backup（不需交换机配合）

交换机侧建不了 LAG、或只需要冗余不要带宽叠加时，用 active-backup。文件其余部分与 3.3 节完全相同，只有 `parameters` 换成下面这样（没有 LACP 相关参数，因为根本不做协商）：

```yaml
      parameters:
        mode: active-backup
        primary: ens3
        mii-monitor-interval: 100
```

差异说明：`primary: ens3` 指定优先活动口——两口都正常时流量走 ens3；ens3 故障后切到 ens4；ens3 恢复后活动口自动回到 ens3（这是默认的回切行为，不想要回切抖动就要在选型时想清楚，而不是上线后再改）。失效判定同样靠 `mii-monitor-interval` 的链路监测。注意若上层跑了第 07 章的 VRRP，`vrrp_instance` 的 `interface` 要写 `bond0`，链路层冗余（本章）与入口层冗余（第 07 章）是两层独立机制，可以叠加、互不替代。

### 3.5 校验与试应用：generate 与 try 是硬顺序

先做纯语法与结构校验，这一步不碰运行中的网络：

```bash
sudo netplan generate
echo $?
```

`netplan generate` 无报错输出才往下走；有报错按提示的行号改 YAML（缩进、键名、成员名拼写是三大常见错误源），改完重跑，不要跳过校验直接 apply。

确认无误后用 `netplan try` 试应用——它应用新配置并开始倒计时，限时内没有在控制台确认就**自动回滚到旧配置**，这是远程改网最重要的保险：

```bash
sudo netplan try
```

在倒计时内立刻用另一条通道（或同一会话新开的连接）验证新地址可达：

```bash
ping -c 3 192.0.2.50
ip a show bond0
```

确认可达后回到 try 的控制台按回车确认，配置才正式保留。倒计时结束前没确认、或验证发现不通，就什么都不做，等它自动回滚，再从带外通道看 `netplan generate` 的报错与系统日志定位。若你的环境无法使用 `netplan try` 的交互确认，只能退而用 `sudo netplan apply` 直接生效——这一步没有自动回滚，配置有误即失联，只能靠带外通道按六节的回滚步骤救，所以 apply 前务必把 generate 的输出再看一遍。

### 3.6 应用后确认与归档

配置生效后做一次最小确认（详细验证在第四节）：

```bash
ip a
ip route
cat /proc/net/bonding/bond0
sudo netplan status
```

期望：只有 bond0 持有 192.0.2.50/24，ens3/ens4 无 IP；默认路由经 bond0 出；`/proc/net/bonding/bond0` 里两口都在。最后把生效中的配置再备一份，与改前备份成对留存，方便日后对照与回滚核对：

```bash
sudo cp -a /etc/netplan /root/netplan-backup/netplan-bond-ok-20260101
cat /proc/net/bonding/bond0 | sudo tee /root/netplan-backup/bonding-ok.txt > /dev/null
```

再安排一次重启验证：bonding 应随开机自动建好，重启后重复本节命令复查一遍，确认不是「只在当前会话里手动凑出来的状态」。

## 四、效果验证与切换演练

以下验证先在测试环境完整走一遍再上生产；生产演练安排在业务低峰并提前公告，演练全程通过带外通道或本地控制台操作。每一项演练都给了恢复步骤，中途发现异常先恢复、再排查。

### 4.1 稳态验证：/proc/net/bonding 解读

bonding 的全部关键状态都写在一个文件里，这是本章排障的第一现场：

```bash
cat /proc/net/bonding/bond0
```

802.3ad 稳态期望输出（节选关键行）：

```text
Bonding Mode: load balancing (802.3ad)
MII Status: up
MII Polling Interval (ms): 100

Slave Interface: ens3
MII Status: up
Speed: 1000 Mbps
Duplex: full
Link Failure Count: 0
802.3ad info
LACP rate: fast
Aggregator ID: 1
Partner Mac Address: 00:11:22:33:44:55

Slave Interface: ens4
MII Status: up
Speed: 1000 Mbps
Duplex: full
Link Failure Count: 0
802.3ad info
LACP rate: fast
Aggregator ID: 1
Partner Mac Address: 00:11:22:33:44:55
```

逐项对照：`Bonding Mode` 与配置一致；**每个**成员口 `MII Status: up`；两个成员口的 `Aggregator ID` **相同**（同属一个聚合组，ID 不同就是没聚到一起）；`Partner Mac Address` 非全零——它是对端交换机的标识，缺失或全零说明交换机侧根本没在参与协商（见五节场景二）。active-backup 模式下这个文件长得不同：`Bonding Mode: fault-tolerance (active-backup)`，另有 `Primary Slave: ens3` 与每个口下方的 `Currently Active Slave` 只出现在当前活动口上，核对时以这两项为准。

连通性复查：

```bash
ping -c 3 192.0.2.1
ping -c 3 192.0.2.53
ip route
```

网关与 DNS 都通、默认路由经 bond0，才算稳态立住。把这份 `/proc` 输出与 3.6 节归档的基线对照无异后再进演练。

### 4.2 演练：成员口故障与恢复

先在管理机（或另一台同网段机器）上对本机开持续连通观察，再在服务器上模拟成员口故障。软件关口与物理拔线在 bonding 看来是同一类事件（都靠 MII 监测发现链路 down），用关口演练即可等价验证切换逻辑，真拔线只在现场条件具备时做。

```bash
# 管理机上执行：持续 ping 本机 bond0 地址，观察演练期间的丢包情况（Ctrl+C 结束）
ping 192.0.2.50
```

```bash
# 服务器上执行（带外/控制台）：关掉 ens3，模拟该成员口链路故障
sudo ip link set ens3 down
sleep 2
cat /proc/net/bonding/bond0
ping -c 3 192.0.2.1
```

期望现象：`/proc` 里 ens3 变为 `MII Status: down`，`Link Failure Count` 加一；802.3ad 下 ens4 的聚合继续承载全部流量，active-backup 下活动口切到 ens4；管理机的持续 ping 最多丢几个包（MII 监测 100 毫秒加重新选路，量级在亚秒到数秒）后恢复，网关 ping 持续可通。若某口 down 之后业务全断，本章配置或交换机侧必有问题，先按恢复步骤把口打开，再进五节排查。

恢复与复查：

```bash
# 服务器上执行：恢复成员口
sudo ip link set ens3 up
sleep 3
cat /proc/net/bonding/bond0
```

期望：ens3 回到 `MII Status: up` 并重新加入聚合（802.3ad 需要几秒重新协商）；active-backup 下活动口按默认行为回到 primary 的 ens3，管理机 ping 再经历一次很短的切换抖动——这个回切抖动是设计行为，要在运维文档里写明，别在故障工单里当二次故障处理。

## 五、常见错误与排坑指南

场景一：应用新配置后整机失联。现象：`netplan apply` 或重启后机器从网络消失，SSH 与业务地址都不通。这正是第二节 danger 警告的场景，不要慌着判定硬件坏。成因通常只有几类：YAML 写错（缩进、模式名拼错）、成员口在其他文件里有残留定义互相打架、或交换机侧 LAG 没配而服务器先上了 802.3ad。处置只能从带外通道/本地控制台进系统，按顺序恢复：

```bash
# 控制台上执行：先看新配置错在哪（generate 会直接指出）
sudo netplan generate

# 定性前先恢复连通：清掉新建的 bond 文件，还原改前备份
sudo rm -f /etc/netplan/60-bond.yaml
sudo cp -a /root/netplan-backup/netplan-20260101/. /etc/netplan/
sudo netplan generate
sudo netplan apply
ip a
ping -c 3 192.0.2.1
```

单网卡地址与网关 ping 恢复后，再对照 `netplan generate` 的报错慢慢修 bond 配置，走 3.5 节的 try 流程重新上线。没有带外通道又失联的，只剩到现场接控制台这一条路——这就是本章把带外定为硬前置的原因。

场景二：802.3ad 协商不起来，聚合形同虚设。现象：bond0 起来、地址也能通，但 `/proc/net/bonding/bond0` 里两个成员口的 `Aggregator ID` 不同、或 `Partner Mac Address` 缺失/全零，或只有一个口在真正承载。根因几乎都在交换机侧：两口没划进同一 LAG 组、一口在组内一口在组外、聚合组没启用 LACP 动态协商、或两口 VLAN 设置不一致被交换机拒聚。处置：把 `/proc` 的这三行证据发给网管逐项对照交换机配置，先修交换机、不要反复改服务器。交换机侧一时改不了时的临时绕行：先把两口移出 LAG 组（避免静态聚合与主机行为打架），服务器侧改走 3.4 节的 active-backup 恢复冗余，等 LAG 修好再按 3.3 节切回并重新演练。

场景三：成员口速率或双工不一致，聚合只进一口。现象：某个成员口在 `/proc` 里 `Speed` 与另一口不同（例如一口 1000 Mbps、一口 100 Mbps），或干脆不加入聚合。成因：网线质量差或插到了交换机的低速口、两端协商结果不一致。802.3ad 要求成员同速率，混速口不会被聚合接纳。修复：换线、换交换机端口，让两口 `ethtool` 结果完全一致后重新看 `/proc`：

```bash
sudo ethtool ens3 | grep -E "Speed|Duplex"
sudo ethtool ens4 | grep -E "Speed|Duplex"
grep -A 3 "Slave Interface" /proc/net/bonding/bond0 | grep -E "Slave|Speed|Duplex"
```

场景四：成员口残留 IP 配置，双地址与双路由作怪。现象：bond 已建好，但 `ip a` 里 ens3 身上还挂着 IP、或路由表里冒出两条默认路由、ARP 应答时通时断。根因是 3.1 节的清查没做干净：成员口的地址/DHCP 定义还留在其他 Netplan 文件里（云镜像的默认文件是重灾区），Netplan 合并后成员口被当成独立接口又配了一次。修复：逐个文件查净，只保留 60-bond.yaml 里的成员声明：

```bash
sudo grep -Rn "ens3\|ens4" /etc/netplan/
ip a show ens3
ip route
```

把非 60-bond.yaml 文件里 ens3/ens4 的 `addresses`、`dhcp4: true` 等定义行删掉，重新走 `netplan generate` 与 `netplan try`，再复查 `ip a`：成员口应当没有任何 `inet` 行。

场景五：切换或聚合后上层应用连不上、监控集体报警。现象：bond0 地址本身能 ping 通，但某些服务连不上、监控显示接口流量全零或疯狂报警。根因多是上层还认旧世界：应用配置里 bind 的是 ens3 的旧地址或直接写了接口名、防火墙规则按 `-i ens3` 匹配、监控采集与告警阈值还挂在 ens3 上——链路层已经换成 bond0，这些引用不会自动跟随。修复：把应用监听、防火墙接口条件、监控采集对象统一改到 bond0 与 bond0 地址：

```bash
ss -tlnp
ip a show bond0
sudo grep -Rn "ens3" /etc/netplan/
```

`ss` 看服务到底监听在哪个地址上，与应用配置里写的逐一对照；上线检查单里加一条「按接口名引用 ens3/ens4 的配置已清查」，避免下次改网再翻车。

场景六：带宽没叠加，单连接测速只有单口速率。现象：iperf3 单流测速跑满一口就到顶，被误判为「聚合没生效」。先分清这是设计而不是故障：哈希按流选口，**单条流永远只走一个成员口**，聚合叠加的是多条流的总吞吐。验证与处置：

```bash
iperf3 -c 192.0.2.50
iperf3 -c 192.0.2.50 -P 4
grep "Transmit Hash Policy" /proc/net/bonding/bond0
```

单流与 4 并发流（`-P 4`）对照：后者总吞吐应接近两口之和（前提是对端也用同样地址发起多条流）。若多流仍不叠加，看 `Transmit Hash Policy` 是否还是 `layer2`——同一对 MAC 之间所有流哈希相同、永远同口，把 Netplan 里的 `transmit-hash-policy` 改成 `layer3+4` 后重新 generate/try 并复测。

## 六、生产环境最佳实践与安全建议

第一，变更纪律高于技术细节。改 bonding 永远走「备份 → generate 校验 → try 试应用 → 确认」的顺序，安排在业务低峰并提前公告；操作全程使用带外通道或本地控制台，配置由第二个人对着检查单复核过再应用。所有「顺手直接 apply」的动作在本章场景里都是事故源。

第二，模式选型一次定清。交换机可控且已建 LAG、要冗余加带宽：802.3ad；交换机不可控、两口分属不同设备、或只需要稳妥冗余：active-backup。最忌「服务器写了 802.3ad、交换机没建组」这种半吊子状态——它平时看着能通，一到流量或故障就露馅（场景二）。选型结论与 LAG 组号、交换机端口对应关系要写进运维文档。

第三，监控必须盯成员口，不只盯 bond0。bonding 的设计就是掩盖单口故障：一条链路坏掉后业务无感，但冗余已经耗掉一半，再坏一口就是全断。把 `/proc/net/bonding/bond0` 的每个成员口 `MII Status` 与 `Link Failure Count` 纳入采集告警，任一成员 down 或失败计数增长立即告警处理；802.3ad 另加一条「两口 Aggregator ID 不一致」告警对应交换机侧变更。

第四，配置与状态留痕。改前备份与生效后归档成对保存（第二节与 3.6 节），交换机侧 LAG 的变更单号与服务器侧 Netplan 备份日期互相引用；每季度按 4.2 节做一次成员口故障演练，把切换丢包数与上次对比归档，顺便验证带外通道还真的能登录。

### 6.1 回滚：解散 bonding，恢复单网卡

整套聚合方案需要撤销（例如事后发现虚拟化平台不支持、或要把机器迁回单口部署）时，按下面顺序完整回滚。回滚窗口内业务地址会短暂中断，安排在低峰并提前公告；全程通过带外通道或本地控制台操作。

第一步，交换机侧先行沟通：若为 bonding 建了 LAG 组，通知网管在服务器回滚完成后把两个端口移出聚合组、恢复为普通口。顺序上有讲究：服务器还在按聚合发包时就先拆交换机组，会立刻断网——两边约好时间窗，服务器侧动作完成后再拆交换机侧，或在同一窗口内连贯执行。

第二步，在服务器上还原改前配置：

```bash
# 删掉 bond 配置文件，把改前备份的整套 Netplan 配置还原回去
sudo rm -f /etc/netplan/60-bond.yaml
sudo cp -a /root/netplan-backup/netplan-20260101/. /etc/netplan/
sudo netplan generate
```

`netplan generate` 无报错后应用。仍能交互确认时优先 `netplan try`，确认单网卡地址回来再按回车保留；只能直 apply 的环境，先确认带外通道在手再执行：

```bash
sudo netplan try
ip a
ip route
ping -c 3 192.0.2.1
```

期望：bond0 消失，原单网卡（示例中为 ens3）重新持有 192.0.2.50/24，默认路由经它出，网关可达。ens4 回到无地址状态，属正常。

第三步，通知网管拆完交换机侧 LAG 后再复测一次连通与双向流量，并确认两口已是普通口、没有残留的聚合转发行为。

第四步，处理 MAC/ARP 的短暂影响。bond 存续期间，对外通信用的是 bond0 的 MAC 地址（取自成员口），解散后单网卡恢复使用自身 MAC，网关与同网段邻居的 ARP 表里还是旧映射，收敛靠免费 ARP 与 ARP 老化自然完成，期间可能出现数十秒级的连通抖动，属预期现象；若网关或关键对端做了静态 ARP 或 MAC 绑定，需同步把绑定更新为单网卡的真实 MAC，别等抖动过去了才发现绑定一直对不上。

第五步，收尾复查：上层应用、防火墙与监控里凡是引用了 `bond0` 的配置改回单网卡口径（与场景五互为镜像）；重启一次机器复查单网卡配置能自动起来；最后在运维文档里把本次回滚的原因、时间与验证结果记清，bond 的 Netplan 备份不要删，留待将来重新聚合时对照。
