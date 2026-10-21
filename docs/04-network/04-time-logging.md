---
description: "时间与日志是排障的两根支柱。时间负责让所有机器对同一时刻的定义一致，日志负责把每个时刻发生过什么留下来。两者任何一个缺位，故障排查都会从查证据退化成猜故事。"
---

# 时间同步与系统日志

## 一、概述与使用场景

时间与日志是排障的两根支柱。时间负责让所有机器对同一时刻的定义一致，日志负责把每个时刻发生过什么留下来。两者任何一个缺位，故障排查都会从查证据退化成猜故事。

先说时间。分布式与多机环境里，时间偏差会引发一串看似无关的故障：证书校验按有效期判断，时钟快了或慢了都会误报证书未生效或已过期。登录令牌与签名请求带时间戳，偏差超限直接被服务端拒绝。更麻烦的是日志对齐：两台机器时间差了五分钟，你按时间线拼故障过程，顺序全是错的，因果关系会被彻底误判。数据库复制、备份时间点、定时任务，同样都建立在时间一致的前提上。

再说日志。没有集中与留存规划的日志有三个通病。第一，散：应用、系统、代理各写各的，出事时要登五台机器翻八个文件。第二，丢：默认只保几天或只存在内存里，重启一次，故障现场就没了。第三，胀：没人管轮转的服务能把磁盘写满，最后日志服务自己成了故障源。本章用 Chrony 把时间对齐，用 rsyslog 管规则与转发，用 journald 管本机结构化日志与查询，三者分工配合，把时间准、日志全、查得动这三件事一次做完。

适用场景包括单机运维的基本盘，也包括多机集中收集的进阶用法。本章先把单机做扎实，再讲 journal 持久化与远程转发的概念和本机侧配置，为后面扩到集中日志平台留好接口。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，操作账号需要 sudo 权限，示例使用 ubuntu 用户。示例内网时间服务器与日志服务器地址为 192.0.2.53，客户端网段为 192.0.2.0/24，上游示例时间源使用文档地址说明概念，实操替换为运营商或云厂商提供的时间源地址。

前置条件有四条。第一，先确认当前时间状态：时区、是否已同步、偏差多少，心里有数再动手。第二，确认防火墙出方向放行 NTP 的 UDP 123，内网时间服务器还要对内网放行入方向。第三，磁盘给日志留够空间，持久化 journal 与 rsyslog 同时开启时，先估算每天日志量再定保留上限，不要无上限留存。第四，虚拟机环境要留意宿主机时间同步与客户机时间同步不要同时生效，两套机制互相打架会导致时间来回跳变，云平台一般在控制台或文档中说明推荐方式，按厂商建议二选一。

软件方面，Chrony 在 Ubuntu 上包名为 chrony，它与旧的 ntp 服务不能同时运行，安装时包管理器会处理冲突，迁移时注意确认旧服务已经停用。rsyslog 在服务器版默认已安装，journald 是 systemd 自带组件，无须单独安装。logrotate 同样是默认组件，负责日志轮转。

!!! note "Chrony 为什么是默认推荐"
    Chrony 对网络不稳定与间歇开机的机器更友好：开机后能快速把大偏差拉回，同步精度与收敛速度都优于传统 ntp 服务端。笔记本式的间歇在线与虚拟机漂移场景，差别尤其明显。新部署一律用 Chrony，没有理由再新装旧服务。

!!! warning "改时间前先看业务影响"
    正在跑数据库与定时任务的机器不要直接大步跳变时间。先用检查命令看偏差大小，小偏差让 Chrony 渐进修正，大偏差安排在维护窗口处理，并提前通知依赖方。时间回跳对按时间戳排序的业务最危险。

## 三、手把手操作步骤

### 3.1 Chrony 客户端配置

第一步，安装并查看当前同步状态：

```bash
sudo apt update
sudo apt install -y chrony
timedatectl
chronyc tracking
chronyc sources -v
```

timedatectl 看时区与整体状态，时区不对先修正为业务时区，例如 `sudo timedatectl set-timezone Asia/Shanghai`。第二步，备份默认配置并编辑 `/etc/chrony/chrony.conf`：

```bash
sudo cp /etc/chrony/chrony.conf /etc/chrony/chrony.conf.bak
sudo nano /etc/chrony/chrony.conf
```

写入以下完整配置，文件中原有的 pool 与 server 行注释掉后替换为本段：

```ini
server 192.0.2.53 iburst prefer
server 198.51.100.123 iburst
driftfile /var/lib/chrony/chrony.drift
makestep 1.0 3
rtcsync
logdir /var/log/chrony
maxpoll 10
```

逐行讲解：server 指定时间源，iburst 表示启动时快速发一组请求加速首次同步，prefer 表示同组中优先采用。第一个地址是内网自建时间服务器，优先用它，第二个是外部备用源。driftfile 记录本机时钟频率偏差，重启后能更快收敛。makestep 1.0 3 表示仅在启动后前三次更新中，偏差超过一秒时允许直接步进，之后只做渐进修正，避免运行中时间跳变。rtcsync 定期把系统时间写入硬件时钟。第三步，重启并验证：

```bash
sudo systemctl enable --now chrony
sudo systemctl restart chrony
chronyc tracking
chronyc waitsync
```

### 3.2 Chrony 内网时间服务器

把一台内网机器做成时间服务器，给整个网段提供同步，好处是出口只放一台机器访问外部时间源，内网其余机器就近同步，精度与可控性都更好。在该机器的 chrony.conf 中，备份后追加以下完整段落：

```bash
sudo cp /etc/chrony/chrony.conf /etc/chrony/chrony.conf.server.bak
sudo nano /etc/chrony/chrony.conf
```

```ini
allow 192.0.2.0/24
local stratum 10
```

allow 限定允许哪些网段来同步，这是安全底线，不要写成对所有地址开放。local stratum 10 表示当外部时间源全部不可达时，本机仍以层级 10 对内提供时间，保证内网相对一致，宁可一起慢走，也不要各走各的。改完放行端口并重启：

```bash
sudo ufw allow from 192.0.2.0/24 to any port 123 proto udp
sudo systemctl restart chrony
chronyc clients
```

chronyc clients 能看到已经来同步的客户端列表，是服务端验证的关键命令。

### 时间同步深化：选型、漂移与连锁影响

**第一，选型：chrony 与 systemd-timesyncd 不是一回事。** 两者都能把本机时间对准，但定位完全不同，不要因为系统里已经跑着一个就以为时间服务已经到位：

| 对比项 | chrony | systemd-timesyncd |
|--------|--------|-------------------|
| 角色 | 完整 NTP 实现，客户端与服务端兼任 | 轻量 SNTP 客户端，只管把自己对准 |
| 能否对外提供服务 | 能，可作内网时间服务器（即 3.2 的做法） | 不能，不监听供别人同步 |
| 同步精度与收敛 | 高，测频率偏差并渐进修正，大偏差快速拉回 | 一般，只做周期性简单校正 |
| 复杂网络适应性 | 强，多源择优、容忍间歇在线与抖动 | 弱，单源为主，网络多变时表现一般 |
| 适合场景 | 服务器、内网源头机、虚拟机、精度敏感业务 | 桌面与对精度无要求的普通客户端 |

判断口诀：只要这台机器要给别人提供时间、跑数据库或证书相关服务、或在虚拟机里长期运行，就用 chrony 并停用 timesyncd，两者不要同时启用。`timedatectl` 是统一判读入口，三组输出要会看：

```bash
timedatectl status
timedatectl timesync-status
timedatectl show
```

`status` 看四项：`Local time` 与 `Universal time` 是否与预期时区换算一致、`Time zone` 是否为业务时区、`System clock synchronized` 是否为 yes、`NTP service` 是否为 active。`timesync-status`（走 timesyncd 时）或 chrony 场景下的等价信息要看已选服务器、偏差（Offset）与抖动，偏差持续在百毫秒以上就不算健康。`show` 给机器可读字段，脚本巡检时取 `NTPSynchronized=yes` 与 `Timezone` 两项做断言，比解析人读文本可靠。注意 `timedatectl` 只报状态，真正的同步细节仍回到 chrony 的命令看。

**第二，漂移成因与观测。** 机器时钟靠晶振计时，频率天生有误差，温度、老化与虚拟化都会放大它，所以时间永远是慢慢偏、靠同步持续拉正，而不是对准一次就一劳永逸。观测三件套：

```bash
chronyc tracking
chronyc sources -v
chronyc sourcestats
sudo hwclock --show
timedatectl status
```

`tracking` 看当前偏差与频率修正量：`System time` 是此刻偏了多少，`Frequency` 是 chrony 测得的本机晶振快慢（ppm），这个数长期稳定说明晶振特性已被学准，频繁大变则要查温度或虚拟化层。`sources -v` 看每个时间源的符号：`^*` 是当前选用源，`^+` 是可接受的备选，`^?` 是不可达，`^x` 是被判为错误时间，源全是问号就是网络或防火墙问题而不是配置玄学。`sourcestats` 看每个源的历史偏移与抖动趋势，判断是偶尔跳一下还是持续单向漂移。硬件时钟（RTC）是主板上靠电池供电的独立时钟，关机时靠它走时、开机时系统先从它读初始时间；`rtcsync` 或 `hwclock --systohc` 把已校准的系统时间定期写回 RTC，RTC 本身不准只会影响刚开机那一小段，不要指望改 RTC 代替 NTP。虚拟机要特别注意两点：一是宿主机同步与客户机内 chrony 不要同时生效，两套机制互相拉扯会让时间来回跳，按平台建议二选一（本章前置条件已提过）；二是部分虚拟化用 `kvm-clock` 等半虚拟时钟源，宿主机休眠、迁移或快照恢复后客户机时间可能瞬间大偏，恢复后先看 `chronyc tracking` 是否已重新收敛，不要立刻重启业务。容器的时间则完全是另一回事：容器共享宿主机内核时钟，容器里看到的时间就是宿主机时间，容器内通常也没有权限改时间，容器里时间不对不要进容器调，直接查宿主机的同步状态。

**第三，连锁影响：时间失步会在别处先爆。** 排障时看到下面四类报错，先查时间再查业务本身，能少走很多弯路：

| 受影响对象 | 失步时的典型表现 | 判别方法 |
|------------|------------------|----------|
| TLS 证书校验 | 浏览器或客户端报证书尚未生效或已过期，但证书本身在有效期内；本机时间慢了会把正常证书看成未生效，快了会看成已过期 | 把本机时间与证书的起止时间并排比：`date -u` 对 `openssl s_client -connect example.com:443` 或证书文件里的 Not Before 与 Not After，时间落在区间外就是本机时钟问题，不是证书问题 |
| 日志排序与排障时间线 | 多机日志按时间拼接后顺序颠倒、因果错乱，集中收集端收到大量未来或过去时间的日志 | 在同一时刻向各机打一条带标记的测试日志，收集端按到达与时间戳双看，偏差立现；先对时再复盘，不要拿失步时段的日志顺序下结论 |
| 数据库复制 | 主从延迟忽大忽小甚至显示为负、按时间戳合并时出现冲突或数据被误判为旧数据而覆盖 | 先在主从两端同查 `date` 与同步状态排除时钟差，再看复制线程本身；两端时间差多少，监控上的延迟读数就会系统性偏多少 |
| Kerberos 认证 | 域内登录与票据获取报时钟偏差过大类错误，密码与配置明明都对 | Kerberos 默认只容忍约 5 分钟偏差，超限直接拒绝，这也是它防重放的设计；两端对时后重试即恢复，不要去改密码或重建账号。身份体系本身见 [企业身份：LDAP、Kerberos 与域](../02-security/05-enterprise-identity.md) |

共同的判别习惯是：凡是报错里带时间语义（过期、未生效、偏差过大、延迟异常），第一条命令永远是 `timedatectl status` 加 `chronyc tracking`，确认本机偏差在毫秒级之后，再去怀疑对方的证书、票据与数据。

### 3.3 rsyslog 规则与远程转发

rsyslog 的主配置是 `/etc/rsyslog.conf`，分片规则放在 `/etc/rsyslog.d/`，生产环境只加分片文件，不直接改主配置。先备份主配置：

```bash
sudo cp /etc/rsyslog.conf /etc/rsyslog.conf.bak
sudo nano /etc/rsyslog.d/50-custom.conf
```

写入以下完整规则文件：

```ini
# 认证日志单独留一份长保留副本
auth,authpriv.*                 /var/log/auth-custom.log
# 内核日志单独成文件
kern.*                          /var/log/kern-custom.log
# 高优先级消息同步写本地文件，保障落盘
*.err                           /var/log/errors.log
# 转发一份到内网日志服务器，UDP 514
*.* @192.0.2.53:514
# 本地程序按名字分文件示例，nginx 访问日志由其自身配置管理，这里只收系统类
:programname, isequal, "sshd"  /var/log/sshd-custom.log
& stop
```

规则从上往下匹配，每行左边是选择器，右边是动作。选择器由设施与级别组成，星号表示全部。动作写文件路径就是本地落盘，写单个 @ 加地址是 UDP 转发，写两个 @ 是 TCP 转发，TCP 更可靠但开销更高，内网集中收集推荐优先 TCP。最后一组两行是按程序名分文件并用 stop 结束后续匹配，避免同一条日志被重复写多份。改完检查语法并重启：

```bash
sudo rsyslogd -N1
sudo systemctl restart rsyslog
logger -t sshd -p auth.info "rsyslog rule test message"
sudo tail -n 20 /var/log/sshd-custom.log
```

logger 命令用来主动打一条测试日志，验证规则是否命中，这是本节最重要的自测手段。接收端服务器如需收日志，在它的分片文件中启用 imudp 或 imtcp 模块并放行 514 端口，只对内网网段放行，不要对公网开放日志接收。

### 3.4 日志轮转 logrotate

自定义的日志文件必须加轮转，否则早晚写满磁盘。新建文件 `/etc/logrotate.d/custom-logs`：

```ini
/var/log/auth-custom.log /var/log/kern-custom.log /var/log/errors.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /usr/lib/rsyslog/rsyslog-rotate
    endscript
}
```

逐项讲解：daily 表示每天轮转一次，rotate 14 表示保留十四份，missingok 表示文件不存在不报错，notifempty 表示空文件不轮转，compress 表示旧日志压缩，sharedscripts 表示多个文件共用一次脚本。系统自带日志已有默认轮转文件，不要重复定义同一路径。手工验证轮转配置：

```bash
sudo logrotate --debug /etc/logrotate.d/custom-logs
sudo logrotate -f /etc/logrotate.d/custom-logs
```

debug 只演算不执行，先看演算结果确认无红字报错，再用 -f 强制执行一次验证真实效果。

### 3.5 journald 持久化与大小上限

journald 默认在部分安装形态下日志只存内存或 `/run` 目录，重启即丢。要持久化，备份后新建目录并改存储方式：

```bash
sudo cp /etc/systemd/journald.conf /etc/systemd/journald.conf.bak
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo nano /etc/systemd/journald.conf
```

在 [Journal] 段写入以下完整配置：

```ini
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=2G
SystemKeepFree=5G
MaxRetentionSec=30day
ForwardToSyslog=yes
```

Storage persistent 表示落盘到 `/var/log/journal`。SystemMaxUse 限定 journal 总量上限为 2G，超限自动删最旧的。SystemKeepFree 保证磁盘至少留 5G 空闲。MaxRetentionSec 限定最长保留三十天，上限与天数哪个先到按哪个清理。ForwardToSyslog yes 保持向 rsyslog 转发，两套体系并行，查询用 journalctl，长期归档与转发用 rsyslog。改完重启 journald 并验证：

```bash
sudo systemctl restart systemd-journald
journalctl --disk-usage
sudo journalctl --verify
```

journal-remote 是进阶概念：systemd-journal-remote 与 systemd-journal-upload 这组工具能把各机器的 journal 以结构化方式集中上传到一台收集机，保留全部元数据，后续仍用 journalctl 统一查询。它适合全 systemd 环境的集中收集，部署时作为独立服务运行，需要单独的证书与端口规划。本章只要求理解概念与本机持久化，集中收集优先用 3.3 的 rsyslog 转发跑通，再评估是否迁移到 journal 原生链路。

## 四、效果验证与测试

时间验证看偏差与同步源，期望偏差在毫秒级且状态正常：

```bash
chronyc tracking
chronyc sources
timedatectl status
```

tracking 输出中重点看四行：Stratum 显示层级且不为 0，System time 显示与真实时间的偏差，数值应接近零，Leap status 显示 Normal，Reference ID 指向所选时间源。下面是健康状态的期望输出示例：

```text
Reference ID    : C0000235 (192.0.2.53)
Stratum         : 3
System time     : 0.000012345 seconds fast of NTP time
Leap status     : Normal
```

日志验证分三路一起查。用 logger 打标后，分别在文件、journal 与转发目标上确认同一条消息存在：

```bash
logger "verify-test-20261021 hello from ubuntu host"
sudo grep "verify-test-20261021" /var/log/syslog
journalctl -n 50 --no-pager | grep "verify-test-20261021"
journalctl -u ssh --since "1 hour ago" --no-pager
journalctl -p err -b --no-pager
journalctl --disk-usage
df -h /var/log
```

常用 journalctl 查询组合要记牢：-u 按单元过滤，--since 与 --until 圈时间范围，-p 按优先级，-b 只看本次启动，-f 实时跟踪，-o json 导出结构化结果给脚本处理。查不到先确认时间范围与单元名，再看持久化是否生效，不要一上来就怀疑日志没产生。

时间深化验证，补三条判读，期望是偏差小、源健康、两套服务不打架：

```bash
timedatectl show -p NTPSynchronized -p Timezone
chronyc sourcestats
systemctl is-active systemd-timesyncd chrony
```

`NTPSynchronized` 应为 yes；`sourcestats` 中当前源的偏移应稳定收敛而不是单向越走越大；最后一行两服务应只有一个为 active，同时 active 就是双同步冲突，要按选型结论停掉 timesyncd。再同查虚拟机宿主机与客户机的 `date -u`，两者相差应在秒级以内，相差明显且客户机 chrony 已同步，多半是宿主机一侧又在强推时间。

## 五、常见错误与排坑指南

场景一：Chrony 一直不同步。表现是 tracking 中 Leap status 显示 `Not synchronised`，Stratum 为 0，sources 中时间源前面是问号或不可达标记。原因多为出方向 UDP 123 被拦，或时间源地址写错。先直连测试时间源可达性，再查配置与防火墙：

```bash
chronyc sources -v
sudo chronyc addserver 192.0.2.53 iburst
chronyc waitsync
sudo journalctl -u chrony -n 50 --no-pager
```

临时加源能同步，说明原配置文件写错，修正文件后重启服务再复查。虚拟机还要检查是否与宿主机同步冲突，按第 2 节的二选一原则处理。

场景二：journalctl 查不到重启前的日志。表现是加 `-b -1` 报错，提示 `Data from the specified boot is not available`。原因是 journal 没有持久化，旧日志只在内存中，重启已经丢失。按 3.5 节完成持久化配置并重启 journald，再重启一次机器，用下面命令确认能列出多次启动记录，本次丢失的历史无法找回，只能从现在开始留存：

```bash
journalctl --list-boots
ls -ld /var/log/journal
sudo grep Storage /etc/systemd/journald.conf
```

场景三：磁盘被日志写满。表现是 `df -h` 显示根分区 100%，新日志写入失败，服务开始报错。先定位大文件，再紧急轮转与清理，最后补轮转规则防止复发：

```bash
sudo du -sh /var/log/*
sudo journalctl --vacuum-size=500M
sudo logrotate -f /etc/logrotate.conf
sudo systemctl restart rsyslog
```

清理前先判断是否有正在排查的故障现场日志，有就先打包转移到其他分区再清。vacuum 只处理 journal，普通文件靠 logrotate 与手工归档，两者不要混为一谈。

场景四：虚拟机时间越跑越偏，刚校准没几天又差出几分钟。先看漂移趋势与双同步，不要反复手工改时间硬顶：

```bash
chronyc tracking
chronyc sourcestats
timedatectl status
systemctl is-active systemd-timesyncd chrony
```

若 `Frequency` 数值很大或持续变化，且宿主机开了时间同步、客户机里 chrony 与 timesyncd 又同时在跑，就是多套机制打架。按平台建议只留一套（服务器留 chrony），停掉其余后再观察一天的 `sourcestats`，偏移回归稳定收敛才算治好；快照恢复或宿主机休眠唤醒后出现的一次性大偏，确认 chrony 已重新同步即可，不要当成持续故障处理。

场景五：业务突然报证书已过期，但证书明明刚续期。同类 Kerberos 登录报偏差过大也按此处理。先查本机时间，不要先去动证书与账号：

```bash
date -u
timedatectl status
chronyc tracking
```

若本机时间明显快于真实时间，证书会被误判过期、慢了则被误判未生效，Kerberos 超过约 5 分钟容差同样直接拒绝。根因多为同步服务停了、上游源不可达或虚拟机时钟被宿主机拉偏。恢复 chrony 同步、确认偏差回到毫秒级后原样重试，证书与登录通常自行恢复；处理完把失步时段标进运维记录，该时段日志的时间线不可直接采信。

## 六、生产环境最佳实践与安全建议

第一，时间源分层。全网只留少数机器访问外部时间源，其余机器向内网时间服务器同步，层级清晰，出问题只查两三台源头机。第二，时间变更留痕。手工改时区、步进时间这类操作要记运维记录，事后对日志时间线有疑问时能对得上账。第三，日志分级留存。本机留三十天左右便于快速查询，集中服务器按合规与审计要求留更长周期，冷数据压缩归档，不要无限堆在本机系统盘。

第四，日志接收必须限源。无论是 rsyslog 的 514 还是 journal 原生上传，接收端口只对内网网段开放，并考虑用 TCP 加 TLS 或在 VPN 通道内传输，日志里常含地址与账号信息，本身就是敏感数据。第五，监控磁盘与同步状态。给 `/var/log` 所在分区设水位告警，给 Chrony 偏差设阈值告警，偏差超过一百毫秒或日志盘超过百分之八十就通知处理，不要等写满与失同步之后才发现。

第六，查询习惯固定化。排障时先定时间窗，再定机器与服务，最后才看关键字。顺序反过来会在海量日志里捞针。把常用 journalctl 组合写进团队运维手册，新人按同一套命令查，得出的证据才能互相拼接。第七，定期演练。用 logger 打标、跨机器对时间线、按保留规则抽查旧日志，这三项每季度做一次，确认时间与日志体系在真正出事那天确实可用，而不是只在文档里可用。
