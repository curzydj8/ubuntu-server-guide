# 系统无法启动故障修复

## 一、概述与使用场景

系统无法启动是服务器故障中影响最直接的一类：机器通电后停在黑屏、进入 GRUB rescue 提示符、内核启动到一半报错、反复重启，或者启动后直接掉入 Emergency 模式命令行。只要操作系统没有完成挂载根文件系统并拉起 systemd，后续所有应用层排查都无从谈起，必须先沿启动链条逐环修复。

Ubuntu 服务器的启动链条依次为：固件阶段（UEFI 或传统 BIOS）读取启动项，GRUB 引导加载器加载内核与 initramfs，initramfs 挂载根文件系统并切换根目录，systemd 读取 `/etc/fstab` 挂载其余文件系统并启动服务。任何一环出错都会中断启动，但报错位置不同：固件阶段找不到启动盘会提示无可启动设备；GRUB 配置损坏会出现 `grub rescue>` 提示符；initramfs 找不到根设备会掉入 `(initramfs)` 提示符；fstab 写错则多进入 Emergency 模式并提示依赖挂载失败。

常见诱因包括：内核升级后 initramfs 未正确生成、`/etc/fstab` 中写错 UUID 或设备名、磁盘更换后 GRUB 未重新安装、双系统或克隆盘导致 EFI 启动项指向错误、文件系统损坏需要离线检查、`/boot` 分区空间不足导致新内核写入不完整。本章按「先判断卡在哪一环，再用对应工具修复」的顺序展开，所有修复都以保住原有数据为前提。

!!! warning "动手前先确认备份与快照"

    启动修复涉及重装引导、检查文件系统与重建 initramfs，操作对象选错会覆盖其他磁盘的引导或数据。云服务器先在控制台创建快照，物理机先确认重要数据已有备份，并逐字核对每条命令中的设备名。无法确认设备对应关系时，先停下来用 `lsblk -f` 反复核对，不要凭猜测执行写操作。

## 二、环境准备与前置条件

修复前准备以下工具与条件，缺一项都可能让修复中途卡住：

- 与故障系统相同大版本的 Ubuntu Server 安装镜像制作的 Live USB 启动盘，22.04 的系统优先用 22.04 镜像，24.04 的系统优先用 24.04 镜像，避免工具版本差异。
- 进入固件设置或启动菜单的权限，能将 Live USB 设为第一启动项；云服务器需要云厂商控制台的 VNC 或串口控制台权限。
- 故障机的 root 密码或 sudo 账号；若要进 Rescue 模式修改文件，还需要确认 root 账号是否已解锁。
- 一台可上网查阅资料的备用设备，以及记录故障现象的手段，例如拍摄报错屏幕。
- 操作前记录原始状态：拍摄 GRUB 报错画面，记下内核版本号、磁盘分区布局照片，后续每改一步都做记录。

在 Live 环境与目标系统中反复用到的基础命令如下，先确认含义再使用：

```bash
lsblk -f
sudo blkid
cat /etc/os-release
efibootmgr -v
```

`lsblk -f` 同时显示设备名、文件系统类型、UUID 与挂载点，是辨认根分区与 EFI 分区的第一依据。`blkid` 给出的 UUID 是修改 fstab 与 GRUB 配置时唯一应引用的标识，不要手抄设备名代替 UUID，因为设备名在多盘环境下可能随启动顺序变化。

!!! note "UEFI 与传统 BIOS 的区别"

    UEFI 机器有独立的 EFI 系统分区，文件系统为 vfat，通常挂载到 `/boot/efi`，GRUB 安装目标是该分区与固件启动项。传统 BIOS 机器没有 EFI 分区，GRUB 安装到磁盘的引导扇区，安装命令中的目标是整块磁盘。先用 `lsblk -f` 看是否存在 vfat 分区，再决定采用哪一套修复命令，两套命令不可混用。

## 三、手把手操作步骤

### 3.1 判断启动卡点

重启机器并全程观察屏幕，按现象归类：

1. 屏幕提示无可启动设备或直接进入固件设置：固件未找到有效启动项，转 3.5 节用 Live 介质重装 GRUB 并修复 EFI 启动项。
2. 出现 `grub rescue>` 提示符：GRUB 找不到自身的配置或内核文件，转 3.2 节手动引导。
3. 出现 `(initramfs)` 提示符：根文件系统未挂载成功，常见于 UUID 变更或文件系统损坏，转 3.3 节处理。
4. 出现 Emergency 模式提示并要求输入 root 密码：系统已启动但关键挂载或服务失败，多为 fstab 错误，转 3.6 节处理。
5. 停在 GRUB 菜单且选择任一内核都黑屏：尝试菜单中的旧内核条目，能进入旧内核说明新内核或其 initramfs 损坏，转 3.4 节在正常系统中重建。

### 3.2 在 grub rescue 提示符下手动引导

进入 rescue 提示符后，GRUB 只保留最基础的命令。目标是找到存放 `/boot` 的分区，加载正常模块后回到标准菜单：

```text
grub rescue> ls
(hd0) (hd0,gpt1) (hd0,gpt2) (hd0,gpt3)
grub rescue> ls (hd0,gpt2)/
boot/ etc/ home/ usr/ var/
grub rescue> set root=(hd0,gpt2)
grub rescue> set prefix=(hd0,gpt2)/boot/grub
grub rescue> insmod normal
grub rescue> normal
```

逐项判读：`ls` 不带参数列出所有磁盘与分区；对每个分区执行 `ls (hd0,gptN)/` 查看内容，能看到 `boot/` 与 `etc/` 的分区就是根分区；若 `/boot` 是独立分区，则根分区下看不到内核文件，应在该独立分区中找到 `vmlinuz` 与 `initrd.img` 文件，并把 `prefix` 指向它的 `grub` 目录。`insmod normal` 加载正常模式模块，`normal` 命令切换回标准 GRUB 菜单。菜单恢复后选择正常条目启动，进系统后必须按 3.5 节重装 GRUB，否则下次重启还会回到 rescue 提示符。若 `insmod normal` 报错提示找不到文件，说明 `prefix` 指向错误，回到 `ls` 步骤重新确认分区，不要反复试错写盘。

### 3.3 进入 Rescue 与 Emergency 模式

Emergency 模式是 systemd 在启动失败时提供的最小抢修环境，根文件系统以只读方式挂载。输入 root 密码进入后，先重新以可写方式挂载，再看日志定位失败项：

```bash
mount -o remount,rw /
journalctl -xb
systemctl --failed
cat /etc/fstab
blkid
```

`journalctl -xb` 显示本次启动的完整日志并附带部分报错的说明文字，重点搜索包含 `Failed`、`Dependency`、`mount` 字样的行。`systemctl --failed` 列出失败单元，挂载失败会直接显示对应的 `.mount` 单元名。

Rescue 模式需要在 GRUB 菜单中手动进入：开机时按住 Shift 键（UEFI 机器按 Esc 键）调出菜单，选择带有 recovery mode 字样的条目，在恢复菜单中选择 root 条目进入 root 命令行。该模式适合重置密码、卸载损坏的内核、修复软件包状态，进入后同样先执行 `mount -o remount,rw /` 让根文件系统可写。

### 3.4 使用 Live 介质与 chroot 修复完整流程

当系统自身无法提供任何可用环境时，用 Live USB 启动并选择试用 Ubuntu，进入桌面或终端后执行以下完整流程。本节以根分区为 `/dev/sda2`、EFI 分区为 `/dev/sda1`、独立 `/boot` 分区为 `/dev/sda3` 为例，实际操作必须按本机 `lsblk -f` 的输出替换。

第一步，确认分区与挂载根文件系统：

```bash
lsblk -f
sudo mount /dev/sda2 /mnt
sudo mount /dev/sda3 /mnt/boot
sudo mount /dev/sda1 /mnt/boot/efi
```

第二步，绑定 Live 环境的关键虚拟文件系统，这是 chroot 后许多命令能否运行的前提，顺序不可调换：

```bash
sudo mount --bind /dev /mnt/dev
sudo mount --bind /dev/pts /mnt/dev/pts
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo mount --bind /run /mnt/run
```

第三步，进入目标系统并确认身份：

```bash
sudo chroot /mnt
cat /etc/os-release
ls /boot
mount | grep -E "efi|boot"
```

`cat /etc/os-release` 应显示目标系统的版本而不是 Live 版本，确认无误后再执行修复命令。需要联网修复软件包时，先在退出 chroot 前把 Live 环境的域名解析配置复制进来：

```bash
exit
sudo cp /etc/resolv.conf /mnt/etc/resolv.conf
sudo chroot /mnt
apt update
```

### 3.5 重装 GRUB

在 chroot 环境内执行，UEFI 机器使用：

```bash
grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=ubuntu
update-grub
efibootmgr -v
```

`efibootmgr -v` 的输出中应出现名为 ubuntu 的启动项且指向 EFI 分区，无此条目说明安装未生效，需要检查 `/boot/efi` 是否正确挂载后重跑安装命令。传统 BIOS 机器使用磁盘作为安装目标：

```bash
grub-install /dev/sda
update-grub
```

!!! warning "grub-install 与 update-grub 的高危点"

    `grub-install` 的目标写错会把引导写到数据盘，`update-grub` 会整体重写 `/boot/grub/grub.cfg`。执行前用 `lsblk` 再次确认目标磁盘，手写修改过的 `grub.cfg` 应先复制一份备份。不要手工直接编辑 `grub.cfg` 作为长期方案，参数调整应写入 `/etc/default/grub` 后再运行 `update-grub` 生成。

在 Live 环境中也可以使用 boot-repair 工具做图形化修复，适合不熟悉命令行的场景，但其自动修复会改动启动项顺序，生产服务器优先用上面的手动流程，过程可控且每一步可记录。

### 3.6 重建 initramfs

内核升级中断、`/boot` 写满或存储驱动变更都会让 initramfs 缺失或损坏，现象是启动时提示找不到根设备或掉入 initramfs 提示符。在 chroot 环境或能启动的旧内核中执行：

```bash
ls -lh /boot
df -h /boot
update-initramfs -u -k all
ls -lh /boot
```

先看 `df -h /boot` 确认空间充足，再重建。`-u` 表示更新已有的 initramfs，`-k all` 表示处理全部内核版本。重建后核对每个 `vmlinuz` 文件都有同版本的 `initrd.img` 文件与之对应，缺一不可。空间不足时先卸载已不用的旧内核软件包释放空间：

```bash
dpkg -l | grep linux-image
sudo apt purge linux-image-6.5.0-41-generic
sudo apt autoremove --purge
```

软件包名必须从本机 `dpkg -l` 输出中逐字复制，不要照抄本节示例中的版本号。若在 initramfs 提示符现场处置，先执行 `cat /proc/cmdline` 与 `blkid` 核对根设备 UUID，再输入 `exit` 让系统继续尝试挂载，仍失败则回到 Live 加 chroot 流程重建。

### 3.7 fstab 写错导致启动失败的自救

fstab 中某个非关键文件系统挂载失败，systemd 会因依赖关系失败进入 Emergency 模式。自救分三步。第一步，在 Emergency 模式或 chroot 环境中备份并逐行核对 fstab：

```bash
cp /etc/fstab /etc/fstab.bak-$(date +%Y%m%d-%H%M%S)
cat /etc/fstab
blkid
findmnt --verify --verbose
```

`findmnt --verify` 会明确指出哪一行 UUID 不存在、挂载点不存在或选项写错，按提示逐行修正。第二步，修正原则：UUID 一律从 `blkid` 输出复制；数据盘等非关键挂载在选项中加上 `nofail`，让该盘故障时系统仍能正常启动；临时无法确认的条目先在行首加井号注释，待系统启动后再处理，不要直接删除整行以便对照。第三步，保存后先验证再重启：

```bash
systemctl daemon-reload
mount -a
echo $?
df -h
```

`mount -a` 无报错且退出码为零，所有预期文件系统出现在 `df -h` 输出中，才执行重启。重启后再次运行 `systemctl --failed` 确认无失败单元。

## 四、效果验证与测试

修复完成后按以下清单逐项确认，全部通过才算恢复：

```bash
sudo reboot
systemctl --failed
systemctl is-system-running
lsblk -f
df -h
efibootmgr -v
journalctl -b -0 -p err --no-pager
```

期望输出示例：

```text
$ systemctl --failed
  UNIT LOAD ACTIVE SUB DESCRIPTION
0 loaded units listed.
$ systemctl is-system-running
running
$ journalctl -b -0 -p err --no-pager
-- No entries --
```

判读要点：`systemctl --failed` 显示零个失败单元；`is-system-running` 返回 `running` 而不是 `degraded`；本次启动日志中错误级别无新增条目；EFI 启动项存在且顺序正确。再连续重启两次验证稳定性，因为 GRUB 只修一半时常常第一次能进、第二次又失败。最后从业务侧验证：登录服务器，确认关键服务运行、数据盘挂载齐全、应用可正常读写文件。

## 五、常见错误与排坑指南

**错误一：在 grub rescue 中反复乱试分区并执行写操作。** 现象是越修越乱，最后连原有菜单都无法恢复。原因是 rescue 环境下没有确认根分区就加载模块或改动设置。正确做法是只用 `ls` 逐个分区查看内容，以同时存在 `boot/` 与 `etc/` 为判据确认根分区，确认后再设置 `root` 与 `prefix` 两个变量，全程不执行任何写盘命令。

**错误二：chroot 后命令报错找不到设备或域名解析失败，就判定系统损坏更严重。** 现象是在 chroot 中运行 `update-grub` 提示找不到设备，或 `apt` 无法解析域名。原因通常是绑定挂载不完整，缺少 `/dev`、`/proc`、`/sys` 中的一项，或未复制 `resolv.conf`。正确做法是退出 chroot，按 3.4 节顺序补齐全部绑定挂载与域名解析文件，再重新进入，不要在环境不完整时反复重跑修复命令。

**错误三：fstab 只改设备名不改 UUID，或给系统盘误加 nofail。** 现象是本次能启动，换盘或重启后又进 Emergency 模式；或根文件系统挂载失败被掩盖，系统带着残缺状态运行。原因是设备名在多盘环境下不稳定，而 `nofail` 只适合非关键数据盘。正确做法是系统盘与数据盘的 UUID 都从 `blkid` 复制，`nofail` 只加在数据盘、备份盘等非关键条目上，改后必须用 `findmnt --verify` 与 `mount -a` 双重验证。

## 六、生产环境最佳实践与安全建议

预防胜于抢修，生产环境至少落实以下措施。第一，变更前留退路：修改 fstab、升级内核、调整分区前先备份配置文件并创建系统快照，云主机用云厂商快照，物理机保留可启动的旧内核条目至少一个。第二，监控 `/boot` 与根分区空间，`/boot` 使用率超过百分之七十即告警，避免内核升级写满导致 initramfs 不完整。第三，定期演练启动修复：每半年用测试机走一遍 Live 加 chroot 流程，确认 Live 介质可用、root 密码可查、控制台权限有效，避免真故障时发现工具缺失。第四，建立启动故障预案文档，写明控制台入口、快照恢复步骤、业务切换顺序与联系人，并放在离线可访问的位置。第五，限制引导层变更权限，GRUB 配置与 fstab 只允许运维账号经 sudo 修改，所有修改纳入变更记录。第六，开启并保留多版本启动日志，`journalctl --list-boots` 能列出历史启动记录时，复盘才能对比故障前后的差异，日志保留周期应在日志配置中明确设置并定期检查。
