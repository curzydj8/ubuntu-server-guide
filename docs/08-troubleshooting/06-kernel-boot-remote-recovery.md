---
description: "内核与启动恢复深化：GRUB 回退旧内核、/boot 空间治理、initramfs 重建、升级失败与 DKMS 处置、kdump 要点，与远程失联恢复。"
---

# 内核与启动恢复深化：含远程失联恢复

## 一、概述与使用场景

本章与本部分第 01 章 [系统无法启动故障修复](01-boot-repair.md) 分工明确。那边讲启动链条的通用修复（GRUB rescue、Rescue 模式、chroot、重装 GRUB 与 fstab 自救）。本章专讲内核维度与远程失联：回退旧内核并固定默认启动项，`/boot` 空间治理，initramfs 判读与重建，内核升级失败后 dpkg 与 DKMS 收尾，启动日志判读与慢启动定位，以及远程失联时按分级路线救回机器。

适用场景主要有五类：内核升级后无法启动或启动异常；`/boot` 写满导致新内核装不完整；更换存储控制器、迁移虚拟机或精简过 initramfs 后启动找不到根盘；内核升级中断，软件包半配置或 DKMS 编译失败；远程失联，只能靠控制台、串口与带外管理逐级恢复。本章命令以 Ubuntu 22.04 LTS 与 24.04 LTS 为准，属于「文档核对」级别；Ubuntu 26.04 LTS 标注为「待核验」。与第 05 章 [灾难恢复与系统迁移](05-disaster-recovery-migration.md) 的分工是：那边讲整机恢复与迁移，本章讲单机内核与启动恢复。

## 二、环境准备与前置条件

开始任何一节操作前，先落实以下条件：

- 确认有第二通道：本地机器要有能进固件与 GRUB 菜单的键盘显示器；远程机器先确认云厂商控制台、串口控制台或带外管理的登录方式可用，再改启动项。
- 记录当前状态：运行中的内核版本、已安装内核清单、`/boot` 占用与 GRUB 配置现状先存档备查。
- 确认至少保留一个已知能正常启动的旧内核，它是所有内核操作的退路，新内核验证通过前不许动它。
- 准备同大版本的 Ubuntu Server 安装镜像或 Live 介质，进入方法与 chroot 流程见第 01 章。

!!! danger "改配置、改启动参数与重建 initramfs 前必须先备份"

    本章涉及的 `/etc/default/grub`、GRUB 环境块与 initrd 镜像都是启动链条上的关键对象，改错一处就可能无法启动。动手前先备份并记下备份位置，确认备份存在后再改。远程机器还要先验证控制台能登录，没有回滚通道时不要远程改启动参数。

改 GRUB 配置前的备份与状态记录命令如下：

```bash
sudo cp /etc/default/grub /etc/default/grub.bak-$(date +%Y%m%d-%H%M%S)
sudo grub-editenv list
uname -r
dpkg -l | grep -E "linux-image|linux-headers"
df -h /boot
```

`grub-editenv list` 显示 GRUB 环境块里的变量，输出为空或没有 `saved_entry` 都属正常，重点是确认能正常读出；grubenv 怀疑损坏时先备份再处理。回滚方法先写明再动手：GRUB 配置改坏时用备份覆盖 `/etc/default/grub` 后重新执行 `sudo update-grub`；initrd 重建后无法启动时从 GRUB 菜单进旧内核，把备份的 initrd 复制回去；默认项设错时在菜单选对条目进系统后重新设置。

## 三、手把手操作步骤

### 3.1 从 GRUB 菜单进旧内核：一次性启动与固定默认

新内核启动异常时，第一动作不是卸载它，而是先用旧内核把系统救活。开机按 BIOS 的 Shift 键或 UEFI 的 Esc 键调出 GRUB 菜单。选择 Advanced options for Ubuntu 子菜单，里面按版本从新到旧列出全部已安装内核与各自的 recovery mode 条目，选上一个已知正常的版本启动。三种用法的取舍是：菜单里手动选只影响当次启动，适合临时救急与验证；`grub-reboot` 只影响紧接着的一次启动，适合远程测试新内核，失败时下次自动回到默认；改 `GRUB_DEFAULT` 或用 `grub-set-default` 是固定默认，适合新内核确认有问题、需要长期回退等修复版本时。

在系统内做一次性设置：先用 `grep -E "menuentry |submenu " /boot/grub/grub.cfg` 查看可选条目，再执行 `sudo grub-reboot "Advanced options for Ubuntu>Ubuntu, with Linux 6.8.0-40-generic"`，条目名称逐字复制自本机输出，最后用 `sudo grub-editenv list` 确认。`grub-reboot` 的参数是子菜单名与条目名用大于号连接的完整标题，版本号按本机实际输出替换；执行后 `grub-editenv list` 中应出现 `next_entry`。固定默认任选一法：把 `/etc/default/grub` 中的 `GRUB_DEFAULT` 直接改为同样的完整标题后执行 `sudo update-grub`；或先把 `GRUB_DEFAULT` 改为 `saved` 并执行 `sudo update-grub`，再执行 `sudo grub-set-default "完整标题"` 写入。

!!! danger "固定默认内核的风险提示"

    `grub-set-default` 只有在 `GRUB_DEFAULT=saved` 时才生效，配置里仍是数字或标题时命令执行成功也不起作用，这是最常见的「设了没效果」。用数字编号更危险：安装或删除任何内核都会让编号移位，默认项会悄悄指向另一个内核，生产环境一律用完整标题。另外，固定到旧内核等于停留在缺少安全修复的版本上，只应作为临时措施，修复版本发布后要及时升级验证并改回最新内核。

### 3.2 /boot 空间治理：旧内核为什么越堆越多

每个内核版本在 `/boot` 中占一组文件：内核镜像、initrd、配置文件与符号映射表，单个版本通常几十到上百兆字节。独立 `/boot` 分区在老版本安装中常见只有几百兆字节，几次升级就会写满；后果是新内核的 initrd 生成不完整、软件包配置失败，严重时当前内核文件被截断导致无法启动。先看清现状再决定清理对象：依次执行 `df -h /boot`、`ls -lh /boot`、`dpkg -l` 的内核包过滤与 `cat /etc/apt/apt.conf.d/01autoremove-kernels`，对照第二节记录的现状。

Ubuntu 自带的保留策略由两处配合：一是 `/etc/apt/apt.conf.d/01autoremove-kernels` 的保留清单，通常保留正在运行的内核与最新安装的内核；二是 unattended-upgrades 的 `Unattended-Upgrade::Remove-Unused-Kernel-Packages` 选项，默认开启，自动升级时顺带移除多余旧内核包。旧内核堆积，多半是这两个机制没机会运行：长期只手动升级从不清理、内核包被标记为手动安装不在自动移除范围、或自动更新被关闭。清理只走包管理通道：先用 `apt-mark showmanual | grep linux` 看手动标记，再执行 `sudo apt autoremove --dry-run` 干跑核对，确认后执行 `sudo apt autoremove --purge` 并用 `df -h /boot` 复查。干跑时逐个核对：运行中与最新内核不在移除列表内、列表里只有更旧的版本包，才正式清理。个别旧内核因手动标记不在列表中时，确认它不是当前与最新内核后单独用 `sudo apt purge` 卸载对应版本包（包名逐字复制自 `dpkg -l` 输出）。

!!! danger "绝不手工删除内核文件"

    不要用 `rm` 直接删除 `/boot` 中的 `vmlinuz`、`initrd.img` 文件，也不要手删 `/lib/modules` 下的版本目录。这样删掉的只是文件，软件包数据库仍记录这些包已安装，后续升级、重建 initramfs 与生成 GRUB 菜单都会引用不存在的文件，产生比空间不足更难收拾的半残状态。只用 `apt purge` 与 `apt autoremove` 卸载，包管理会同步处理模块目录、GRUB 条目与保留清单。

### 3.3 initramfs 重建：缺驱动导致找不到根盘

initramfs 是内核启动早期加载到内存的临时根文件系统，装着挂载真正根分区所需的存储与文件系统驱动。启动掉进 `(initramfs)` 提示符并提示根设备不存在，根因多半在这里：精简过驱动、更换磁盘控制器或虚拟化平台、克隆到不同硬件，都会让 initrd 缺新环境的驱动；升级中断则可能让 initrd 没有生成完。在提示符现场先依次执行 `cat /proc/cmdline`、`blkid`、`ls /dev` 判读：`root=` 给出期望的根设备，与 `blkid` 输出对照，UUID 对不上是配置问题，回到第 01 章处理；UUID 正确但 `/dev` 下没有对应磁盘设备，说明 initrd 缺存储驱动，需要重建；输入 `exit` 后能继续启动，多为设备就绪太慢的偶发问题，记录即可。重建要在能启动的旧内核或 chroot 环境中进行，命令形式为 `sudo update-initramfs -u -k 版本号`，先备份原 initrd 再重建：先执行 `ls -lh /boot` 确认现状，把 `/boot/initrd.img-6.8.0-45-generic` 复制为同目录下的 `.bak` 备份，再执行 `sudo update-initramfs -u -k 6.8.0-45-generic`，完成后再次 `ls -lh /boot` 核对新镜像的时间与大小。

`-u` 表示更新指定版本的已有 initrd，`-k` 后跟内核版本；版本号从 `ls /boot` 或 `dpkg -l` 输出复制。重建后仍无法启动时，进旧内核把备份的 initrd 复制回去即可回滚。生成时若提示固件缺失，多为不影响启动的警告；若提示模块不存在或以错误结尾，不要重启，先查磁盘空间与 `/etc/initramfs-tools/modules` 是否写了不存在的模块名。

```bash
grep -E "^MODULES=" /etc/initramfs-tools/initramfs.conf
lsinitramfs /boot/initrd.img-6.8.0-45-generic | grep -E "nvme|virtio|ahci" | head
```

包含策略在 `/etc/initramfs-tools/initramfs.conf` 的 `MODULES=` 一行：`most` 把大多数驱动打进镜像，兼容性最好；`dep` 只按当前硬件推断，换硬件后最容易缺驱动。用 `lsinitramfs /boot/initrd.img-版本号 | grep 驱动名` 可直接验证驱动在不在镜像里，这是判读「缺驱动」的硬证据。

### 3.4 内核升级失败处置：dpkg 半配置与 DKMS 编译失败

升级被断电、断网或 `/boot` 写满打断后，最常见的残局是软件包半配置：`apt` 一运行就提示有未配置的软件包，或 DKMS 编译失败拖住内核包。处置顺序固定：先看空间，再完成半配置，最后单独处理 DKMS。

```bash
df -h / /boot
sudo dpkg --audit
sudo dpkg --configure -a
sudo apt install -f
sudo dpkg --audit
```

`dpkg --audit` 列出未完成配置的软件包，无输出说明状态已一致；`dpkg --configure -a` 把已解包未配置的包逐个配置完；其后 `apt install -f` 修复依赖，它若提出移除大量软件包，先停下记录，不要确认。由空间不足导致的失败，必须先按 3.2 节释放 `/boot` 再回到本节，否则会再次写到一半失败。

DKMS 失败的特征是配置内核包时出现模块构建报错并提示查看构建日志，用下面命令定位到具体模块与日志：

```bash
dkms status
sudo ls /var/lib/dkms
sudo tail -n 100 /var/lib/dkms/nvidia/550.120/build/make.log
```

日志路径规律是 `/var/lib/dkms/模块名/模块版本/build/make.log`，模块名与版本从 `dkms status` 与报错输出中复制，上例名称仅为示意。判读 `make.log` 只看末尾第一处真正的编译错误，常见根因三类：内核头文件包缺失或版本对不齐、编译器版本不匹配、第三方驱动太旧不支持新内核接口。对应处置是补装同版本头文件包、按发行方说明升级驱动、在驱动修复前按 3.1 节固定回旧内核。修复后先单独验证构建：执行 `sudo dkms autoinstall -k 目标内核版本`，`dkms status` 显示 installed 后再执行 `sudo dpkg --configure -a` 收尾，不要直接重启赌运气。

### 3.5 启动日志判读：上次启动与慢启动

系统已能启动但行为异常，或重启后想知道上次为什么死，先读日志再下结论。前提是日志做了持久化，`journalctl --list-boots` 能列出多次启动记录才有历史可查；只列出当前一次时，先按第 04 部分 [时间同步与系统日志](../04-network/04-time-logging.md) 的方法开启持久化。

```bash
journalctl --list-boots
journalctl -b -1 --no-pager | tail -n 100
journalctl -b -1 -p err --no-pager
journalctl -b -1 -k --no-pager | tail -n 100
```

`-b -1` 是上一次启动，`-b 0` 是本次；`-p err` 只看错误及以上级别；`-k` 只看内核消息。判读顺序：先看上次日志的最后几十行，正常关机会有完整的停止服务记录，日志戛然而止且没有关机序列，说明是断电、死机或被强制重启；再看错误级别里有没有反复出现的存储、文件系统与内存错误；内核消息出现文件系统错误、输入输出错误或内存不足杀进程时，转本部分对应章节定位。启动变慢用 systemd 分析工具定位：依次执行 `systemd-analyze`、`systemd-analyze blame` 与 `systemd-analyze critical-chain`，不要凭感觉禁用服务。`systemd-analyze` 给出固件、引导器、内核与用户空间各阶段总耗时，先确认慢在哪一段；`blame` 按单元启动耗时排序；`critical-chain` 给出决定总时长的关键依赖链，链上的单元慢才是真拖慢启动，不在关键链上的单元耗时再长也不影响总时长，两者对照着看。对可疑单元再查其日志，常见根因是网络等待与存储超时，处置原则是修依赖与超时配置，而不是直接禁用单元。

### 3.6 kdump 概念与启用要点

前面几节处理「坏了怎么救」，kdump 解决「内核崩溃后拿什么分析」。原理是预留一小块内存预加载捕获内核，主内核崩溃时直接切换到它，把内存镜像保存成 vmcore 文件再正常重启。本节是概念与要点级说明（文档核对），Ubuntu 26.04 上的默认行为待核验。

!!! warning "启用前先评估内存与磁盘代价"

    预留内存是常驻代价：这块内存从系统可用内存中永久扣除，小内存机器上占比可观，要先评估业务余量再启用。vmcore 是磁盘代价：文件大小与内存使用量相关，存放分区要按内存量级预留空间，空间不足时捕获会失败或写满分区。

启用要点如下：

- 安装组件：`kdump-tools` 负责加载捕获内核与保存 vmcore，可用 `sudo dpkg-reconfigure kdump-tools` 重新选择是否启用。
- 开关位置：`/etc/default/kdump-tools` 中的 `USE_KDUMP` 控制是否启用，设为 `1` 才生效；存放目录由同文件中的 `KDUMP_COREDIR` 指定，默认为 `/var/crash`。
- 预留参数：启动参数 `crashkernel` 决定预留多少内存，通常由安装过程写入 GRUB 配置；手动调整必须先按第二节备份 `/etc/default/grub`，改完执行 `sudo update-grub` 并在计划内重启生效，远程无控制台时不要改。
- 状态核对：启用后用 `sudo kdump-config show`、`sudo kdump-config status` 与 `cat /proc/cmdline` 核对，三处对齐（配置、加载状态、`crashkernel` 已生效）才算完成。
- 空间预估：按接近内存大小准备存放空间（压缩后通常小于物理内存），设保留份数上限，定期移走已分析完的 vmcore；人为触发崩溃验证只能在隔离测试环境做。

### 3.7 远程失联恢复：分级路线与 SSH 四层排查

远程失联指服务器不在身边、SSH 连接失败的整类情况。最忌讳上来就让机房或云厂商强制重启：重启会销毁内存现场与未落盘日志，还可能把单服务故障变成启动故障。按下面路线分级处置，每一级确认无果再进下一级。

- 第一步，先确认是真失联还是单服务故障：换一条网络交叉验证，查监控里该机其他指标是否还在上报，再试访问其他服务端口。只有 SSH 不通而其他服务正常，是服务层问题；全部端口不通但云控制台显示运行中，偏向网络或系统层；监控也断，才按真失联往下走。
- 第二步，走云厂商控制台：主流云厂商都提供脱离网络的网页终端或 VNC 控制台，直连虚拟显示器，不依赖被管机器的网络与 sshd；物理机对应的是机房远程手或现场协助。登录后先按本节末尾的四层表排查，就地修复，不要先重启。
- 第三步，看串口控制台：串口日志能看到从内核启动开始的全部输出，只有串口能告诉你卡在哪一环；看到 GRUB、内核或 initramfs 报错后，转第 01 章与本章前几节处理。
- 第四步，进救援模式挂盘修复：控制台与串口都确认无法正常启动时，用云厂商救援模式启动，或把系统盘挂到救援实例上，挂载根分区后离线修配置、补密钥、清空间，细节见 [灾难恢复与系统迁移](05-disaster-recovery-migration.md)。
- 第五步，用带外管理：IPMI 是通用标准，iDRAC 与 iLO 分别是戴尔与惠普的实现。带外管理有独立管理芯片与网口，能远程开关机、看硬件状态、挂载虚拟介质并打开脱离操作系统的控制台，适用于系统层通道全部失效、需要重装或换盘、或怀疑硬件故障的场景。其权限极高，只能放在独立管理网络并严格限制访问，安全要求见第六节。

能从控制台进系统后，SSH 失联按四层顺序排查，每层给出在控制台里执行的命令，地址与端口按本机实际值替换：

| 层级 | 排查命令 | 判读与修复方向 |
| --- | --- | --- |
| 网络层 | `ip -br addr`、`ip route`、`ping -c 3 192.0.2.1` | 无地址或无默认路由是 Netplan 或云网络问题，修正后先 `sudo netplan generate` 校验再应用；网关不通则查云厂商网络侧 |
| 防火墙层 | `sudo ufw status verbose`、`sudo nft list ruleset` | 本机未放行 SSH 端口就补放行；本机正常还要核对云厂商安全组 |
| 服务层 | `sudo systemctl status ssh`、`sudo sshd -t`、`ss -tlnp`、`sudo journalctl -u ssh -b -0` | sshd 未运行先看日志再启动；`sshd -t` 报错按行号改配置；未监听预期端口则核对端口设置 |
| 系统层 | `free -h`、`df -h`、`uptime`、`sudo dmesg -T` | 内存耗尽让新连接无响应，磁盘写满让 sshd 无法建会话，先清资源再治根因；`dmesg` 看硬件与文件系统错误 |

SSH 的预防性加固见第 02 部分 [SSH 安全加固](../02-security/01-ssh-hardening.md)，本节只讲失联后的定位顺序。顺序纪律是四层自下而上确认：网络层不通时不要反复重装 sshd，服务层正常时不要急着改防火墙。

## 四、效果验证与测试

修复完成后逐项验证，全部通过才算恢复：

```bash
uname -r
systemctl --failed
systemctl is-system-running
df -h /boot
sudo dpkg --audit
journalctl -b -0 -p err --no-pager
```

判读要点：`uname -r` 应输出目标内核版本（如 6.8.0-45-generic）；`systemctl --failed` 应显示 0 loaded units listed；`systemctl is-system-running` 应返回 `running`；`/boot` 使用率回落到安全范围；`dpkg --audit` 无输出；本次启动错误日志无新增的存储与文件系统错误。最后连续重启两次重复关键项检查。远程失联恢复再加一项：从外部重新 SSH 登录执行一条命令，并从控制台确认会话日志已记录。

## 五、常见错误与排坑指南

**场景一：用 grub-set-default 设了默认内核，重启后还是进新内核。** 根因是 `GRUB_DEFAULT` 不是 `saved`，grubenv 没被采用。修复：先把 `GRUB_DEFAULT` 改为 `saved` 并执行 `sudo update-grub`，再重跑 `grub-set-default`，最后用 `grub-editenv list` 确认 `saved_entry` 已写入。

**场景二：/boot 写满后直接删内核文件腾空间，之后 apt 每次都报错。** 根因是文件与软件包数据库脱节。修复是回到包管理通道：先用 `sudo dpkg --configure -a` 让状态收敛，再用 `apt purge` 卸载损坏的版本包并重装；收敛不了时按第 01 章 chroot 流程离线处理。

**场景三：反复重建 initramfs 仍找不到根盘。** 根因通常是镜像里本就没有目标驱动：按当前硬件推断驱动的策略在换盘、换控制器或迁平台后必然缺驱动。修复：用 `lsinitramfs` 确认驱动是否在镜像中，不在时把策略改为 `most`，或把驱动名写入 `/etc/initramfs-tools/modules` 后再重建，验证驱动已进入镜像才重启。

**场景四：DKMS 报错后不看日志，反复重装整个驱动包。** 根因是没定位失败在哪一层：头文件缺失、编译器不匹配与驱动不支持新内核的处置完全不同。修复：先打开对应模块的 `make.log` 看末尾第一处编译错误，按 3.4 节对号入座，修完先单独执行 `dkms autoinstall` 验证构建，再完成 dpkg 配置。

**场景五：远程失联后第一时间强制重启，故障原因再也查不到。** 根因是把恢复速度置于证据之前，内存现场与未落盘日志在重启中丢失。修复：按 3.7 节路线先交叉确认、再进控制台按四层排查，只有确认系统层无响应或卡死在启动阶段时才重启，重启前先保存串口与屏幕输出。

## 六、生产环境最佳实践与安全建议

第一，内核升级走灰度：先在非关键机器升级观察一个业务周期，再推广生产；生产升级前建快照或确认回滚通道可用，升级后先验证服务再清理旧内核，保留当前内核加一个已知正常的旧内核。第二，监控 `/boot` 与根分区空间并设阈值告警，使用率超过百分之七十即处理，并确认自动移除旧内核的机制在运行。第三，启动参数变更纳入变更管理：每次修改都记录备份位置、内容与回滚方法，远程修改必须安排控制台值守，改完立即重启验证。第四，远程通道平时就要验：云控制台、串口、救援模式与带外管理的登录方式每半年实测一次。第五，带外管理按最高敏感级别防护：只接入独立管理网络、不暴露公网，账号用独立强口令并开启双因素，操作留审计。第六，kdump 按需启用并定期检查 `/var/crash` 的空间与保留份数，崩溃转储含内存镜像，按敏感文件同等标准保管与清理。
