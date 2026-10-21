# 性能调优与守护：systemd、SWAP 与资源限制

## 一、概述与使用场景

手动在终端里启动的游戏服，生命周期等于终端的生命周期：SSH 一断、窗口一关、机器一重启，服务器就没了；半夜进程崩溃，没人重启，玩家第二天只能对着离线服务器投诉。更危险的是资源失控——Palworld 长时间运行内存会持续上涨，Minecraft 某个区块加载异常也能把内存吃满；没有兜底时，Linux 内核的 OOM Killer 会随机挑进程杀掉，可能先死的是游戏服，也可能是 SSH 让你连机器都进不去。

本章解决三件事：用 systemd 把游戏服变成开机自启、崩溃自愈、日志可查的正规服务；用 SWAP 给内存峰值留缓冲，降低被 OOM 误杀的概率；再用内核参数与 systemd 资源上限，把单个游戏服的影响范围锁死在一台机器的一个角落里。适用于所有准备长期运营（哪怕只是朋友间的小服）的场景，临时测试服可以只做 systemd 一节。

## 二、环境准备与前置条件

- 系统：Ubuntu 22.04 LTS 或 24.04 LTS，服务端已按第 02 章装好并能手动启动成功。
- 权限：`sudo` 权限，用于编写 `/etc/systemd/system/` 下的服务单元与系统参数。
- 用户与路径沿用前文：运行用户 `steam`，Minecraft 位于 `/home/steam/minecraft`，Palworld 位于 `/home/steam/palworld`。
- 动手前先确认手动启动无误，守护层只负责拉起与保活，不负责修配置错误。

!!! note "先手动跑通，再交给 systemd"
    顺序不能反。手动都起不来的服务端，交给 systemd 只会得到一个无限重启的循环，日志还更难读。先在前台跑通一次、玩家能进，再做本章。

## 三、手把手操作步骤

### 第一步：处理游戏服的控制台输入问题

游戏服都有交互控制台（stdin）：管理员要往里敲 `list`、`save-all`、`stop` 等命令。systemd 默认不给服务分配可交互的标准输入，直接把启动命令写进 unit，进程能跑，但你再也无法向控制台发命令，甚至某些服务端读不到 stdin 会直接退出。三种取舍如下：

| 方案 | 做法 | 优缺点 |
| --- | --- | --- |
| screen / tmux 会话 | systemd 不托管，登录后在会话里手动启动 | 控制台最方便，但自启与自愈都要额外脚本，不推荐正式运营 |
| systemd 加命名管道 | 用 FIFO 文件充当 stdin，往管道写即发命令 | 保留 systemd 全部能力，发命令稍绕，推荐 |
| 只靠游戏内与 RCON 管理 | 不接 stdin，管理走游戏内管理员命令或 RCON | 最简单，适合无控制台依赖的游戏 |

本章主线用命名管道方案。先建管道与目录：

```bash
sudo mkdir -p /run/minecraft
sudo mkfifo /run/minecraft/stdin
sudo chown steam:steam /run/minecraft/stdin
sudo chmod 600 /run/minecraft/stdin
```

注意 `/run` 是内存文件系统，重启后管道会消失，因此由 systemd 的 `ExecStartPre` 在每次启动前重建（见下一步 unit）。给管道发命令时写法是 `echo "list" > /run/minecraft/stdin`，但要注意：没有进程在读时直接写会阻塞，所以发命令统一经服务运行期间操作，且停服请用 `systemctl stop` 走 unit 里定义的优雅停服命令，而不是粗暴杀进程。

### 第二步：编写 systemd 服务单元

改系统服务前不需要备份单个游戏配置，但新建 unit 文件本身就是新文件，直接创建 `/etc/systemd/system/minecraft.service`：

```ini
[Unit]
Description=Minecraft Java Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=steam
Group=steam
WorkingDirectory=/home/steam/minecraft
ExecStartPre=/bin/bash -c 'mkdir -p /run/minecraft; test -p /run/minecraft/stdin || mkfifo /run/minecraft/stdin; chown steam:steam /run/minecraft/stdin'
ExecStart=/bin/bash -c 'exec /usr/bin/java -Xms2G -Xmx2G -jar /home/steam/minecraft/server.jar nogui < /run/minecraft/stdin'
ExecStop=/bin/bash -c 'echo stop > /run/minecraft/stdin'
TimeoutStopSec=60
StandardOutput=journal
StandardError=journal
SyslogIdentifier=minecraft
Restart=on-failure
RestartSec=10
MemoryMax=3G
CPUQuota=300%

[Install]
WantedBy=multi-user.target
```

逐行讲解关键项：`After=network-online.target` 保证网络就绪后才启动，否则开机时绑定端口可能失败。`Restart=on-failure` 表示进程异常退出后自动重启，正常用 `stop` 命令退出则不拉起；`RestartSec=10` 给崩溃留 10 秒间隔，避免疯狂重启刷日志、吃满 CPU。`StandardOutput=journal` 把服务端输出接入 journald，之后统一用 `journalctl -u minecraft` 查日志，不再满世界找日志文件。`ExecStop` 往控制台发游戏自己的 `stop` 命令，让服务端先存盘再退出，`TimeoutStopSec=60` 给存盘留足时间，超时 systemd 才强杀。`MemoryMax` 与 `CPUQuota` 是资源上限，下一节细讲。

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minecraft.service
sudo systemctl status minecraft.service
```

Palworld 同理复制一份 unit，改三处：服务名与目录换成 Palworld，`ExecStart` 换成 `/home/steam/palworld/PalServer.sh -port=8211 -players=16`，停服没有控制台命令时删除 `ExecStop` 行、把 `TimeoutStopSec` 设为 30 靠信号退出即可，不要把 Minecraft 的 unit 原样套用。

### 第三步：配置 SWAP 防 OOM

云服务器默认常常没有 SWAP。用文件方式补一个 4 GB 的交换文件（大小按内存调整：内存 4 GB 的机器建议 4 GB，16 GB 机器 4 到 8 GB 足够）：

```bash
free -h
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

改开机挂载前先备份 `fstab`，再追加一行让重启后 SWAP 自动生效：

```bash
sudo cp -a /etc/fstab /etc/fstab.bak
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

再调低 `swappiness`：该值表示系统使用 SWAP 的积极程度，默认 60 对游戏服偏高，会把不活跃的游戏数据过早换出导致卡顿；改成 10 表示优先用物理内存，只在内存真的吃紧时才动 SWAP：

```bash
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-game-server.conf
sudo sysctl -p /etc/sysctl.d/99-game-server.conf
```

!!! warning "SWAP 是缓冲垫，不是内存替代品"
    SWAP 只能兜住短时峰值，避免进程被 OOM 直接杀掉。游戏服长期跑进 SWAP 会卡到不可玩；若监控里 SWAP 占用长期不退，正确动作是给游戏降配置、限人数或升级内存，而不是把 SWAP 再加大。

### 第四步：针对性内核参数与文件句柄

游戏服的高频痛点是突发连接与大量小文件读写。新建专用参数文件（与上一步同一文件追加），不要直接改 `/etc/sysctl.conf` 主文件，便于日后整体回退：

```bash
sudo cp -a /etc/sysctl.d/99-game-server.conf /etc/sysctl.d/99-game-server.conf.bak
sudo nano /etc/sysctl.d/99-game-server.conf
```

写入以下内容（与前面已写的 `vm.swappiness=10` 并列保存）：

```ini
# 降低 SWAP 积极程度，优先使用物理内存
vm.swappiness=10
# UDP 接收与发送缓冲区上限（字节），缓解 Palworld 等 UDP 游戏高峰丢包
net.core.rmem_max=16777216
net.core.wmem_max=16777216
# 连接队列长度，缓解多人同时进服时的连接拒绝
net.core.somaxconn=4096
# 单进程可打开文件数上限，世界文件与插件多时防耗尽
fs.file-max=2097152
```

应用并验证：

```bash
sudo sysctl -p /etc/sysctl.d/99-game-server.conf
sysctl net.core.rmem_max vm.swappiness
```

文件句柄还要在服务层面放开：在 unit 的 `[Service]` 段加一行 `LimitNOFILE=1048576`，然后 `sudo systemctl daemon-reload` 并重启服务。系统级的 `fs.file-max` 是全局天花板，`LimitNOFILE` 是单服务上限，两处都放开才有效。

### 第五步：用好 MemoryMax 与 CPUQuota

第二步 unit 里已经写了两项资源限制：`MemoryMax=3G` 表示该服务最多用 3 GB 内存，超过先在 cgroup 内回收、再不行只杀这个服务自己，不再连累整机——给 Minecraft 的数值应略大于 `-Xmx`，因为 JVM 还有堆外开销，`-Xmx 2G` 时给 3G 是合理搭配。`CPUQuota=300%` 表示最多用满 3 个核（100% 为一核），4 核机器这样写能给系统和其它服务留一个核。修改时流程固定：

```bash
sudo cp -a /etc/systemd/system/minecraft.service /etc/systemd/system/minecraft.service.bak
sudo systemctl edit minecraft.service
```

用覆盖片段改值比重写整个文件更安全，保存后执行 `sudo systemctl daemon-reload` 并重启服务才生效。

## 四、效果验证与测试

逐项验证，不要只看服务是绿的：

```bash
systemctl is-enabled minecraft.service
systemctl is-active minecraft.service
journalctl -u minecraft.service -n 30 --no-pager
free -h
swapon --show
systemctl show minecraft.service -p MemoryMax -p CPUQuota -p Restart
```

期望结果：`is-enabled` 输出 `enabled`（开机自启已开），`is-active` 输出 `active`；日志里能看到服务端完整的启动完成行；`free -h` 的 Swap 行总量为 4.0 Gi 且 `swapon --show` 列出 `/swapfile`；`systemctl show` 回显的 MemoryMax 字节数与你写的值一致（3G 显示为 3221225472）。自愈验证要真做一次：记下当前主进程 PID，手动杀掉它，等 15 秒再查，应看到新 PID 且服务恢复 active：

```bash
sudo systemctl kill -s SIGKILL minecraft.service
sleep 15
sudo systemctl status minecraft.service
```

最后重启整机一次，确认开机后不手动干预、游戏服也能自己起来且玩家可连，这是守护配置的最终验收。

## 五、常见错误与排坑指南

**场景 1：服务反复重启，状态在 activating 与 failed 间跳。** `journalctl -u minecraft.service` 里反复出现：

```text
minecraft.service: Main process exited, code=exited, status=203/EXEC
Failed with result 'exit-code'.
```

`203/EXEC` 表示 ExecStart 的程序路径不存在或无执行权限，常见于 Java 路径写错或 PalServer.sh 未加执行位。修复：用 `which java` 核对真实路径，脚本补执行权限后重启：

```bash
which java
chmod +x /home/steam/palworld/PalServer.sh
sudo systemctl restart minecraft.service
```

**场景 2：游戏服仍被 OOM 杀掉，日志出现 Killed process。** `sudo dmesg | grep -i 'out of memory'` 可见：

```text
Out of memory: Killed process 2143 (java) total-vm:9123456kB, anon-rss:3891200kB
```

原因是没有 SWAP 或 `MemoryMax` 未设、单服吃穿整机。先按第三步补 SWAP，再确认 unit 中 `MemoryMax` 大于 `-Xmx` 但小于物理内存，并给物理内存小的机器下调 `-Xmx`，两处一起改，不要只加 SWAP 硬扛。

**场景 3：改了 unit 却不生效。** 改完文件直接 `restart` 后，`systemctl show` 仍显示旧值。原因是没执行 `daemon-reload`，systemd 还在用内存里的旧配置。修复：

```bash
sudo systemctl daemon-reload
sudo systemctl restart minecraft.service
```

## 六、生产环境最佳实践与安全建议

守护配置的验收标准只有一条：拔掉你的管理动作，机器自己能活。开机自启、崩溃自愈、优雅停服存盘，三项都要实测过再算上线。日志统一进 journald 后，给磁盘留好轮转上限，避免日志撑爆系统盘：定期用 `journalctl --disk-usage` 检查，必要时用 `sudo journalctl --vacuum-size=500M` 清理。资源上限宁可先紧后松：先按本章数值上线，观察一周 `systemd-cgtop` 与内存曲线再放宽，不要一开始就给满整机。内核参数只改本章列明的项并集中放在一个文件里，任何时候能一键删文件回退。最后，SWAP 文件权限必须保持 600，它里面是内存数据的副本，按敏感文件对待。
