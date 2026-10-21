# 内核与性能调优

## 一、概述与使用场景

内核调优是用 sysctl 等机制调整默认行为的手段，不是必修课：绝大多数服务器用默认参数就能稳定运行。需要调优的信号来自前三章的观测数据，例如连接被丢弃、句柄耗尽、延迟毛刺。没有数据指认瓶颈时，不要动内核参数。

本章覆盖四块内容：sysctl 参数体系中的网络、内存、文件句柄三组高频参数；CPU Governor 模式切换；SWAP 方案含 swappiness 与 zram；OOM Killer 机制与 oom_score_adj。这四块的共同纪律是：每个参数都写清默认值、修改影响、适用场景与回滚方法，一次只改一组、改完观察、无效就回滚。

乱配的风险有三类：一是无脑堆参数，清单里几十个参数彼此冲突，出问题时无人说得清元凶；二是改错方向，例如把 swappiness 调高反而加剧换页抖动；三是不可回滚，改了默认文件又不留备份。本章所有操作都先备份、先小步、留回滚，正是为了避开这三类风险。

!!! warning "调优总纪律"
    一次只改一组参数，改前记录原值，改后用第 1、2 章的工具观察至少一个业务高峰，无改善或变差立即按每节给出的回滚命令恢复。禁止整表照抄任何来源的参数清单。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS，内核为发行版默认内核。
- 权限：可使用 sudo 的账号 ubuntu；sysctl 写入与 Governor 切换均需 root 权限。
- 前置观测：已部署第 1 章工具或第 2 章监控，能看到改前基线，包括负载、内存、连接数与延迟。
- 变更窗口：在业务低峰执行。
- 工具：sysctl 默认已装；cpupower 与 zram 生成器按下文安装。

先记录当前关键参数原值，作为全章回滚基线：

```bash
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog vm.swappiness vm.dirty_ratio fs.file-max
cat /proc/sys/fs/file-nr
cpupower frequency-info
```

把输出保存到运维记录中。file-nr 第一个数是已分配句柄数，第三个数是系统上限。

## 三、手把手操作步骤

### 3.1 sysctl 的生效方式与文件规范

sysctl 分两类生效方式：临时生效用 sysctl -w，重启即失，适合试验；持久生效写入 /etc/sysctl.d/ 独立文件，适合定稿。先试验、验证有效再落文件，一个主题一个文件，不要改主文件，便于整体回滚。改配置前先备份，新建文件时改为导出当前值留档：

```bash
sysctl -a > /tmp/sysctl-before-20260101.txt
sudo cp /etc/sysctl.conf /etc/sysctl.conf.bak-20260101
ls /etc/sysctl.d/
```

查看某参数含义与当前值的通用方法：

```bash
sysctl net.core.somaxconn
sysctl -w net.core.somaxconn=4096
sudo sysctl --system
```

其中 sysctl -w 为临时修改，--system 为按 /etc/sysctl.d/ 全部文件重新加载。

### 3.2 网络参数逐项讲解

适用场景：高并发短连接服务、反向代理、API 网关出现连接排队或丢弃时。下表中的默认值以 Ubuntu 22.04 与 24.04 默认内核的常见值为准，动手前务必用 sysctl 命令读出本机实际原值并以实测为准，不同内核小版本可能不同。

| 参数 | 含义 | 常见默认值 | 本章建议值 | 修改影响与适用场景 | 回滚方法 |
| --- | --- | --- | --- | --- | --- |
| net.core.somaxconn | 监听队列已完成连接上限 | 4096 | 8192 | 调大可减少高并发下新连接被丢弃；应用自身的 backlog 参数也要同步调大才有效；内存占用小幅上升 | 改回 4096 或删除配置文件后重载 |
| net.ipv4.tcp_max_syn_backlog | 半连接队列上限 | 1024 或 2048 | 8192 | 调大可抗突发建连与轻度洪泛；过大在真实攻击下占用更多内存；需同时确认 tcp_syncookies 已开启 | 改回原值后重载 |
| net.ipv4.tcp_syncookies | 半连接溢出时启用 cookie 建连 | 1 | 保持 1 | 保持开启即可，不要关闭；关闭后抗洪泛能力明显下降 | 保持 1，无需回滚 |
| net.core.netdev_max_backlog | 网卡接收队列上限 | 1000 | 5000 | 高 PPS 场景下调大可减少内核层丢包；低流量机器无收益 | 改回 1000 后重载 |
| net.ipv4.ip_local_port_range | 本地临时端口范围 | 32768 到 60999 | 1024 到 65535 | 仅适用于大量主动外连的代理或爬虫类负载；普通服务端不要改，调宽后低端口占用风险上升 | 改回 32768 到 60999 后重载 |
| net.ipv4.tcp_fin_timeout | FIN 等待超时秒数 | 60 | 30 | TIME_WAIT 堆积时适度调小可加快回收；调得过小可能影响弱网客户端的正常关闭 | 改回 60 后重载 |

持久化写法：先备份同名旧文件（不存在则跳过），再写入 /etc/sysctl.d/99-net-tuning.conf，本例只落 somaxconn 与 tcp_max_syn_backlog 两项做示范，其余参数按需逐项加入、逐项观察：

```ini
net.core.somaxconn = 8192
net.ipv4.tcp_max_syn_backlog = 8192
```

```bash
sudo sysctl -p /etc/sysctl.d/99-net-tuning.conf
ss -s
ss -lnt
```

ss -lnt 重点看 Recv-Q 是否长期顶满，顶满后继续加大队列收益有限，应转去优化应用。

### 3.3 内存参数逐项讲解

适用场景：延迟敏感服务出现周期性卡顿、写盘抖动，或大内存机器上回收行为与业务预期不符时。

| 参数 | 含义 | 常见默认值 | 调整方向 | 修改影响与适用场景 | 回滚方法 |
| --- | --- | --- | --- | --- | --- |
| vm.swappiness | 匿名页换出与回收页缓存的倾向，范围 0 到 100 | 60 | 数据库与延迟敏感服务常用 10 | 调低减少换页抖动，但内存突增时回收更吃紧；调高会更积极用 SWAP，机械盘机器明显变慢；详见 3.5 节 | 改回 60 |
| vm.dirty_ratio | 脏页占总内存比例达到后触发同步回写 | 20 | 大内存机器可按比例下调到 10 | 调低使回写更平滑、单次停顿更小，但写吞吐可能下降；单位是百分比，大内存机上 20 percent 本身就是很大的绝对量 | 改回 20 |
| vm.dirty_background_ratio | 脏页达到该比例后后台异步回写 | 10 | 与 dirty_ratio 配套下调到 5 | 与上一项保持约一半的比例关系，单独改一项收益有限 | 改回 10 |
| vm.vfs_cache_pressure | 回收目录与 inode 缓存的倾向 | 100 | 文件服务可下调到 50 | 调低更愿意保留目录缓存，目录遍历更快，代价是可用内存稍减；普通应用服务器保持默认 | 改回 100 |
| vm.overcommit_memory | 内存超量分配模式，0 启发式，1 总是允许，2 严格按比例 | 0 | 保持 0，不要随意改 1 | 改为 1 会让大内存申请总能成功，把风险推迟到真正写入时触发 OOM；Redis 官方曾建议 1 是特定背景下的取舍，不能无条件照搬 | 改回 0 |

临时验证示例（先试后落文件）：

```bash
sudo sysctl -w vm.swappiness=10
free -h
vmstat 1 10
```

观察 vmstat 的 si 与 so 两列是否归零或明显下降、业务延迟毛刺是否消失，再决定是否写入 /etc/sysctl.d/99-vm-tuning.conf 持久化。写入格式与网络文件相同，一行一个参数。

### 3.4 文件句柄参数

报错先行：应用日志出现 Too many open files 时，先查句柄而不是先调内核。系统级上限由 fs.file-max 控制，常见默认值已是很大的数值，多数情况瓶颈在进程级限制而不是系统级。

```bash
cat /proc/sys/fs/file-max
ulimit -n
systemctl show nginx -p LimitNOFILE
```

把 nginx 换成你的服务名。进程级上限对 systemd 服务由 LimitNOFILE 控制，改法是先备份单元或覆盖文件，再加覆盖配置：

```bash
sudo systemctl edit nginx
```

在编辑区写入下面三行完整内容：

```ini
[Service]
LimitNOFILE=65535
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
systemctl show nginx -p LimitNOFILE
```

期望输出 LimitNOFILE=65535。确实需要调系统级上限时，才在 /etc/sysctl.d/99-fs-tuning.conf 中写 fs.file-max 一行并重载，回滚即改回原值。普通用户进程还要检查 /etc/security/limits.conf 的 nofile 项，两处不一致时以更小者生效。

### 3.5 CPU Governor 模式切换

Governor 决定 CPU 频率调节方式：performance 恒定高频、延迟最低、功耗最高；powersave 恒定低频；schedutil 按负载动态调节，是新内核的默认推荐；conservative 升降更平缓。

先安装工具并查看当前模式：

```bash
sudo apt install -y linux-tools-common linux-tools-generic
cpupower frequency-info
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
```

临时切换为 performance 做对比测试：

```bash
sudo cpupower frequency-set -g performance
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
```

期望输出 performance。适用判断：延迟敏感且机器长期高负载时 performance 有实测收益；负载波动大或电费敏感的机器保持 schedutil，不要盲目全开 performance，空闲功耗与发热都会上升。持久化用 cpupower 的 systemd 服务：

```bash
sudo cp /etc/default/cpupower /etc/default/cpupower.bak-20260101
```

文件不存在时跳过备份。编辑 /etc/default/cpupower 把 governor 一行设为 performance，再执行：

```bash
sudo systemctl enable --now cpupower
sudo systemctl restart cpupower
```

回滚方法：把 governor 改回 schedutil 并重启 cpupower 服务，或直接执行 sudo cpupower frequency-set -g schedutil 立即恢复。云虚拟机上宿主机不开放频率控制时，cpupower 会报错或切换无效，此时保持默认即可，不要强行处理，详见第五节。

!!! note "虚拟机差异"
    云虚拟机多数只能看到宿主机透传的有限信息，切换可能无效，本节以物理机为准。

### 3.6 SWAP 方案：swappiness 与 zram

先看现状：

```bash
free -h
swapon --show
cat /proc/sys/vm/swappiness
```

swappiness 的正确理解：它控制内核在回收内存时，更倾向于换出匿名页还是丢弃页缓存，60 为默认值。调到 10 表示尽量先回收缓存、少动匿名页，适合数据库等延迟敏感服务；调到 0 不等于禁用 SWAP，只是极端倾向，内存真正耗尽时仍会换页，不要把 0 当成优化目标。修改方法见 3.3 节，先临时验证再落文件，回滚改回 60。

zram 用压缩内存盘做 SWAP，换页不落物理磁盘，适合内存偏小或磁盘慢的机器，代价是消耗 CPU。用 systemd-zram-generator 落地：

```bash
sudo apt install -y systemd-zram-generator
sudo cp /etc/systemd/zram-generator.conf /etc/systemd/zram-generator.conf.bak-20260101
```

配置文件 /etc/systemd/zram-generator.conf 完整内容（文件不存在时新建，跳过上面的备份）：

```ini
[zram0]
zram-size = ram / 2
compression-algorithm = zstd
swap-priority = 100
fs-type = swap
```

逐项讲解：zram-size 为 ram / 2 表示容量取物理内存的一半，按你的内存大小评估，小内存机可取 ram 本身；compression-algorithm 为 zstd，压缩率与速度平衡较好，老 CPU 可改 lz4；swap-priority 为 100 高于磁盘 SWAP 的默认优先级，确保先用 zram。已存在磁盘 SWAP 时不要急于删除，让 zram 以高优先级在前、磁盘 SWAP 兜底，是更稳妥的组合。

```bash
sudo systemctl daemon-reload
sudo systemctl restart systemd-zram-setup@zram0
swapon --show
zramctl
```

期望 swapon 输出中出现 /dev/zram0 且优先级最高。回滚方法：删除或改名 zram-generator.conf 后重启，或执行 sudo swapoff /dev/zram0 立即停用，磁盘 SWAP 不受影响。

### 3.7 OOM Killer 机制与 oom_score_adj

内存真正耗尽时，内核的 OOM Killer 会按 oom_score 选一个进程结束以释放内存，分数越高越先被选中。分数由内核按内存占用等因子动态计算，管理员可通过 oom_score_adj 在负 1000 到 1000 之间做偏移：正值更容易被选中，负值更受保护，负 1000 表示完全豁免。

排障入口：

```bash
journalctl -k -g "Out of memory" --no-pager
```

日志中 Killed process 一行会给出进程名与分数，据此判断是真不足还是进程泄漏。给关键服务加保护用 systemd 覆盖配置：

```bash
sudo systemctl edit nginx
```

写入完整内容：

```ini
[Service]
OOMScoreAdjust=-500
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
cat /proc/$(pgrep -o nginx)/oom_score_adj
```

期望输出 -500。给可牺牲任务设正值同理。纪律有三条：负 1000 只给极少数核心进程，滥用会让内核无进程可选而整机卡死；保护名单要短，保护 A 等于把风险转给 B；频繁触发的根治办法是修泄漏或加内存。回滚：删覆盖文件中的 OOMScoreAdjust 行后 daemon-reload 并重启服务。

## 四、效果验证与测试

逐组验证，不要改完全部再统一看结果：

```bash
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog vm.swappiness vm.dirty_ratio
ss -s
free -h
swapon --show
vmstat 1 5
cpupower frequency-info
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
```

期望 si 与 so 长时间为 0 或明显低于基线，Governor 显示目标模式名。句柄组以 LimitNOFILE 等于设定值为准，OOM 组以 oom_score_adj 等于设定值为准。每组结果连同改前基线一起记录，观察满一个高峰后再定稿。

## 五、常见错误与排坑指南

### 5.1 sysctl 配置重启后不生效

现象：sysctl -w 临时改的值重启后恢复旧值，或写入文件后执行加载报错。报错原文片段：

```text
sysctl: cannot stat /proc/sys/net/ipv4/tcp_xxx: No such file or directory
```

原因分两种：只用了临时方式未落文件；或参数名写错、该内核版本已更名或删除此参数。修复方法：先确认参数真实存在再落文件：

```bash
ls /proc/sys/net/ipv4/
sysctl -a | grep somaxconn
sudo sysctl --system
```

### 5.2 cpupower 报错频率不可控

报错原文片段：

```text
Setting cpu: 0
Error setting new values. Common errors: Do you have proper administration rights?
```

在已用 sudo 的情况下仍报此错，原因多为云虚拟机或 BIOS 未开放频率控制，访客系统无权调节。修复方法：确认环境类型，虚拟机上放弃 Governor 调优、保持默认 schedutil，把精力转回应用层；物理机则进 BIOS 确认频率控制已启用后再重试。强行反复执行不会有不同结果。

### 5.3 调低 swappiness 后反而触发 OOM

现象：swappiness 改为 0 或极低值后，大内存突发时进程被 OOM Killer 结束，日志片段为：

```text
Out of memory: Killed process 1234 (java) total-vm:8192000kB
```

原因：极低 swappiness 让内核迟迟不肯换页，缓存回收又赶不上分配速度，最终直接触发 OOM。修复命令：把 swappiness 回调到 10 或 20 并保留足量 SWAP 空间：

```bash
sudo sysctl -w vm.swappiness=10
free -h
swapon --show
```

同时按 3.7 节给核心服务设适度保护，并定位内存突发来源，调分数不能代替修泄漏。

## 六、生产环境最佳实践与安全建议

第一，变更流程固定化：记录基线、写明理由与预期、备份原值、单组修改、观察一个高峰、记录结论，命令与输出存入变更记录。

第二，参数文件按主题拆分并加注释，写清原默认值，例如：

```ini
# 网络队列调优 2026-01-01 opsadmin 原默认 somaxconn 4096
net.core.somaxconn = 8192
```

第三，安全相关参数不要顺手改动。地址随机化、内核指针可见性、转发开关属于安全基线，与性能冲突时先保安全。虚拟机上 Governor 与部分队列参数可能由宿主机接管，动手前先确认真实可控范围。最后每季度复审一次参数清单，无收益的回滚到发行版默认，保持系统尽量接近默认状态。

!!! tip "默认即最优的多数情况"
    没有明确瓶颈时，最佳调优就是不调。
