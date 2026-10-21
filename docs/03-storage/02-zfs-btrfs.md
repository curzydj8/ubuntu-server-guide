---
description: "普通文件系统如 ext4、XFS 假定底层磁盘是诚实的：写入什么，读回就是什么。但真实硬件会发生静默损坏（bit rot）——数据在盘上悄悄翻转一位，文件系统毫无察觉，直到备份也被坏数据覆盖。"
---

# ZFS 与 Btrfs 高级文件系统

## 一、概述与使用场景

普通文件系统如 ext4、XFS 假定底层磁盘是诚实的：写入什么，读回就是什么。但真实硬件会发生静默损坏（bit rot）——数据在盘上悄悄翻转一位，文件系统毫无察觉，直到备份也被坏数据覆盖。ZFS 与 Btrfs 这类写时复制（Copy-on-Write）文件系统从设计上解决这个问题：每个数据块都带校验和，读取时自动验算，发现损坏且有冗余副本时自动修复，同时原生集成卷管理、RAID、快照、压缩与发送接收，省去了 LVM 加 mdadm 加文件系统的多层拼装。

ZFS 由 OpenZFS 社区维护，特点是极致的数据完整性、成熟的 RAID-Z、灵活的数据集（dataset）管理与 `zfs send / receive` 增量复制，广泛用于 NAS、备份服务器与虚拟化存储。Btrfs 是 Linux 内核原生文件系统，特点是子卷（subvolume）轻量、与发行版集成好、支持单盘到多盘的灵活转换。

为什么需要它们：文件服务器与备份机上，数据正确比速度更重要，scrub 巡检能在坏盘扩散前报警；快照几乎零成本，可从只读快照找回被加密或误删的文件；send / receive 让异地备份只传增量。不用这类文件系统的风险是静默损坏无感知、快照要靠 LVM 额外分层、跨机备份缺少端到端校验。瓶颈也要说清：ZFS 需要较多内存做缓存（ARC），内核升级时要注意模块兼容；Btrfs 的 RAID5 / RAID6 存在写洞（write hole）问题，生产环境应避免，多盘冗余优先 RAID1 或 RAID10。

## 二、环境准备与前置条件

本章适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS。Ubuntu 官方提供 ZFS 支持：安装 `zfsutils-linux` 即得用户态工具，内核模块由发行版随内核包维护（OpenZFS 版本随发行版而定），不需要手动编译或添加第三方源。服务器建议把 ZFS 用在数据盘，根分区保持 ext4 加 LVM，便于救援。

```bash
sudo apt update
sudo apt install -y zfsutils-linux btrfs-progs
sudo modprobe zfs
zfs --version
btrfs --version
lsblk -f
free -h
```

| 软件包 | 用途 |
|--------|------|
| `zfsutils-linux` | 提供 `zpool`、`zfs` 命令、开机导入服务与 scrub 定时任务脚本 |
| `btrfs-progs` | 提供 `mkfs.btrfs`、`btrfs subvolume`、`btrfs scrub` 等用户态工具，文件系统驱动本身在内核中 |
| 无额外包 | Btrfs 驱动为内核原生，无需加载第三方模块 |

硬件建议：ZFS 每 1 TiB 数据准备约 1 GiB 内存作下限估算，开启去重（dedup）则需求陡增，普通场景不要开去重。准备至少两块同容量空闲盘做 mirror 实验，例如 `/dev/sdX` 与 `/dev/sdY`。ECC 内存是加分项而非硬性要求，普通内存加定期 scrub 同样能获得大部分收益。

!!! note "许可证提示"
    OpenZFS 使用 CDDL 许可证，与内核 GPLv2 存在兼容性讨论，因此 ZFS 以独立模块形式随 Ubuntu 分发。这不影响正常使用，但解释了为何需要单独安装 `zfsutils-linux`，且内核大版本升级时要留意模块重建。

## 三、手把手操作步骤

### 3.1 用 by-id 路径建池，避免盘符漂移

!!! danger "设备名警告"
    本章 `/dev/sdX`、`/dev/sdY`、`/dev/nvmeXnY` 均为占位符，必须替换为 `lsblk -f` 确认过的空闲盘。`zpool create` 与 `mkfs.btrfs` 都会无条件覆盖目标盘数据。更重要的是：ZFS 建池不要直接用 `/dev/sdb` 这类内核盘符，盘符会随插拔顺序变化；应使用 `/dev/disk/by-id/` 下的稳定路径，它绑定硬盘序列号，重启后不会错位。

先查看稳定路径并记录对应关系：

```bash
ls -l /dev/disk/by-id/
lsblk -f
sudo wipefs -n /dev/sdX
```

`wipefs -n` 只查看旧签名不清除，确认是空盘后再建池。若盘上有旧分区表需要清空，用 `sudo sgdisk --zap-all /dev/sdX`，该命令不可逆，再次核对设备名后才可执行。

### 3.2 创建 ZFS 池：mirror 与 raidz

两块盘做镜像（mirror），容量等于一块盘，坏任意一块不丢数据，最适合入门与重要数据：

```bash
sudo zpool create -o ashift=12 -O compression=lz4 -O atime=off tank mirror /dev/disk/by-id/ata-DISK-SERIAL-A /dev/disk/by-id/ata-DISK-SERIAL-B
sudo zpool status tank
sudo zpool list
sudo zfs list
```

参数逐项讲解见下表：

| 参数 | 含义 |
|------|------|
| `tank` | 池名，可自定义，创建后池会自动挂载到 `/tank` |
| `mirror` | 镜像虚拟设备（vdev），其后跟随的盘互为镜像 |
| `-o ashift=12` | 按 4 KiB 物理扇区对齐，现代硬盘与固态硬盘都应设 12，建池后不可更改 |
| `-O compression=lz4` | 数据集默认压缩算法，lz4 速度快、几乎无负面影响，建议默认开启 |
| `-O atime=off` | 关闭访问时间更新，减少无意义写入 |

三块及以上盘可做 RAID-Z1（容忍坏 1 块，类似 RAID5）或 RAID-Z2（容忍坏 2 块，类似 RAID6）。例如四块盘组 RAID-Z2：

```bash
sudo zpool create -o ashift=12 -O compression=lz4 tank raidz2 /dev/disk/by-id/ata-DISK-SERIAL-A /dev/disk/by-id/ata-DISK-SERIAL-B /dev/disk/by-id/ata-DISK-SERIAL-C /dev/disk/by-id/ata-DISK-SERIAL-D
sudo zpool status tank
```

!!! warning "vdev 拓扑建池后不可收缩"
    ZFS 的冗余级别由 vdev 决定：mirror 池可以后期逐对加盘扩容，raidz 池传统上只能新增整组 vdev 扩容，不能把三盘 raidz 直接改成四盘 raidz。建池前务必想清盘数与冗余级别。固态硬盘池还可加 `-O autotrim=on` 开启自动 TRIM。

在池上建数据集，数据集是独立的文件系统单元，可单独设配额、压缩与快照策略：

```bash
sudo zfs create tank/data
sudo zfs create tank/backup
sudo zfs set quota=200G tank/backup
sudo zfs set recordsize=1M tank/backup
sudo zfs list -o name,used,avail,quota,mountpoint
df -h /tank/data
```

`recordsize=1M` 适合大文件顺序读写；虚拟机与数据库场景常用 64K 或 16K，按负载选。建议把建池命令与 `zpool history tank` 输出存入运维文档，灾难重建时就是图纸。

### 3.3 快照、回滚与克隆

ZFS 快照是数据集在某时刻的只读视图，创建瞬间完成，初始几乎不占空间：

```bash
sudo zfs snapshot tank/data@2026-01-01-before-upgrade
sudo zfs list -t snapshot
sudo ls /tank/data/.zfs/snapshot/2026-01-01-before-upgrade/
sudo zfs rollback tank/data@2026-01-01-before-upgrade
sudo zfs destroy tank/data@2026-01-01-before-upgrade
```

使用要点：快照命名建议带日期与用途；`.zfs/snapshot/` 目录可直接只读访问历史文件，单文件恢复拷贝出来即可。`zfs rollback` 会丢弃快照点之后的改动，若存在更新快照需加 `-r` 连带删除。`zfs clone` 可把快照变成可写数据集，常用于克隆测试环境：

```bash
sudo zfs clone tank/data@2026-01-01-before-upgrade tank/data-test
sudo zfs list
sudo zfs destroy tank/data-test
```

### 3.4 scrub 数据校验与坏盘更换

scrub 是全池巡检：逐块验算校验和并自动修复可修复的损坏。安装 `zfsutils-linux` 后自带定期 scrub 支持，也可手动触发：

```bash
sudo zpool scrub tank
sudo zpool status tank
sudo zpool scrub -s tank
```

第二条查看进度，关注 `errors: No known data errors`；第三条 `-s` 是停止 scrub，非必要不中断。建议每月至少 scrub 一次，在业务低峰期执行。

坏盘更换：`zpool status` 显示 `DEGRADED` 或 `FAULTED` 后，换上新盘再执行 replace：

```bash
sudo zpool status tank
sudo zpool replace tank /dev/disk/by-id/ata-DISK-SERIAL-OLD /dev/disk/by-id/ata-DISK-SERIAL-NEW
sudo zpool status tank
```

更换后池进入 resilver 状态，期间不要再拔其他盘，完成后应回到 `ONLINE`。

### 3.5 send / receive 增量复制与备份

`zfs send` 把快照序列化成数据流，`zfs receive` 在目标端还原，是 ZFS 异地备份的核心。先做一次全量，再做增量：

```bash
sudo zfs snapshot tank/data@base-2026-01-01
sudo zfs send tank/data@base-2026-01-01 | sudo zfs receive backup-pool/data
sudo zfs snapshot tank/data@inc-2026-01-08
sudo zfs send -i tank/data@base-2026-01-01 tank/data@inc-2026-01-08 | sudo zfs receive backup-pool/data
```

跨机传输时通过 SSH 管道，目标主机示例地址使用文档段地址，实际替换为你的备份机：

```bash
sudo zfs send -i tank/data@base-2026-01-01 tank/data@inc-2026-01-08 | ssh ubuntu@192.0.2.50 sudo zfs receive backup-pool/data
```

参数讲解：`-i` 指定增量基准快照，只发送两次快照之间的差异；不加 `-i` 的首次发送为全量。接收端数据集在接收期间不可挂载写入。生产环境应把此流程写成脚本加 systemd timer 定时执行，并校验两端快照列表一致。

!!! tip "发送流也可以落成文件"
    没有第二台 ZFS 主机时，可把发送流存为文件放到移动硬盘：`sudo zfs send tank/data@base-2026-01-01 > /mnt/usb/data-base.zfs`，恢复用 `sudo zfs receive tank/data < /mnt/usb/data-base.zfs`。该文件泄露即泄露全部数据，离线介质要加密保管。

### 3.6 Btrfs：子卷、快照与 scrub

Btrfs 的对应概念是子卷（subvolume），子卷是可独立挂载、独立快照的目录树。在一块已格式化为 Btrfs 的盘上操作：

```bash
sudo mkfs.btrfs -L data-btrfs /dev/sdX
sudo mkdir -p /mnt/btrfs-root
sudo mount /dev/sdX /mnt/btrfs-root
sudo btrfs subvolume create /mnt/btrfs-root/@data
sudo btrfs subvolume create /mnt/btrfs-root/@work
sudo btrfs subvolume list /mnt/btrfs-root
sudo btrfs subvolume snapshot /mnt/btrfs-root/@data /mnt/btrfs-root/@data-snap-2026-01-01
sudo btrfs scrub start /mnt/btrfs-root
sudo btrfs scrub status /mnt/btrfs-root
sudo btrfs filesystem usage /mnt/btrfs-root
```

两块盘组 Btrfs RAID1 时，建文件系统时同时指定元数据与数据均为 raid1：

```bash
sudo mkfs.btrfs -m raid1 -d raid1 -L data-raid1 /dev/sdX /dev/sdY
```

Btrfs 可在线追加盘并转换级别：`sudo btrfs device add /dev/sdY /mnt/btrfs-root` 后执行 `sudo btrfs balance start -dconvert=raid1 -mconvert=raid1 /mnt/btrfs-root`。增量发送用 `btrfs send / receive`，需先做只读快照：

```bash
sudo btrfs subvolume snapshot -r /mnt/btrfs-root/@data /mnt/btrfs-root/@data-ro-2026-01-01
sudo btrfs send /mnt/btrfs-root/@data-ro-2026-01-01 | sudo btrfs receive /mnt/backup-target/
```

!!! warning "Btrfs 配额与 RAID5/6 的坑"
    Btrfs 的 qgroup 配额在大量子卷下有明显性能开销，非必要不要开启。再次强调：不要在生产环境使用 Btrfs 的 raid5 / raid6 配置文件，其写洞问题可能在断电加坏盘叠加时造成数据损坏；多盘冗余请用 raid1 或 raid10。

### 3.7 选型对比

| 维度 | ZFS | Btrfs |
|------|-----|-------|
| 与 Ubuntu 集成 | 需装 `zfsutils-linux`，模块随发行版维护 | 内核原生，装 `btrfs-progs` 即可 |
| 数据校验与自修复 | 校验和加冗余自动修复，成熟稳定 | 同样支持，RAID1 下可自修复 |
| RAID 推荐 | mirror、raidz2 | raid1、raid10，避开 raid5/6 |
| 快照 | 数据集快照，`.zfs` 目录直达 | 子卷快照，需显式管理挂载 |
| 增量复制 | `zfs send / receive`，生态工具丰富 | `btrfs send / receive`，功能对等但工具较少 |
| 内存需求 | 较高，ARC 缓存吃内存 | 较低，行为更像普通文件系统 |
| 扩容灵活性 | vdev 级别扩容，拓扑变更受限 | 可在线加盘、改级别，最灵活 |
| 典型选择 | NAS、备份机、虚拟化存储、数据仓库 | 系统盘、单机工作站、轻量服务器 |

结论：独立存储机选 ZFS，系统盘与盘数灵活变化的场景选 Btrfs；不要在 ZFS 数据集里再跑 Btrfs 这类混用分层。

## 四、效果验证与测试

ZFS 侧依次执行以下命令并核对输出：

```bash
sudo zpool status tank
sudo zpool list tank
sudo zfs list -t all
sudo zpool get health tank
echo "zfs-test-$(date +%F)" | sudo tee /tank/data/verify.txt
cat /tank/data/verify.txt
```

期望输出示例：

```text
  pool: tank
 state: ONLINE
  scan: scrub repaired 0B in 00:12:34 with 0 errors on Sun Jan 12 00:24:34 2026
config:
        NAME        STATE     READ WRITE CKSUM
        tank        ONLINE       0     0     0
          mirror-0  ONLINE       0     0     0
NAME   SIZE  ALLOC   FREE  CKPT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH
tank  1.81T   120G  1.69T        -         -     1%     6%  1.00x    ONLINE
```

判断标准：`state` 必须为 `ONLINE`，每块盘的 `READ / WRITE / CKSUM` 三列错误计数均为 0，scrub 结果为 `0 errors`。

Btrfs 侧验证命令：

```bash
sudo btrfs filesystem show
sudo btrfs scrub status /mnt/btrfs-root
sudo btrfs subvolume list /mnt/btrfs-root
sudo btrfs filesystem df /mnt/btrfs-root
```

期望 scrub 显示 `no errors found`。

## 五、常见错误与排坑指南

场景一：开机后 ZFS 池未导入。表现是 `/tank` 为空目录，`zpool status` 无输出或报池不存在。报错原文片段：

```text
no pools available to import
```

常见原因是新增数据盘的池未被缓存记录，或从其他机器移盘过来。修复命令：先扫描再按名导入，并重建缓存：

```bash
sudo zpool import
sudo zpool import tank
sudo zfs mount -a
sudo systemctl status zfs-import-cache.service
```

场景二：创建池时报设备忙。报错原文片段：

```text
cannot open '/dev/sdX': Device busy
invalid vdev specification: use '-f' to override the following errors
```

原因是目标盘上残留旧文件系统签名、旧 RAID 元数据或正被挂载。先用 `lsblk -f` 与 `sudo wipefs -n /dev/sdX` 看清签名来源，确认无用后清除签名再建池：

```bash
sudo umount /dev/sdX
sudo wipefs -a /dev/sdX
sudo sgdisk --zap-all /dev/sdX
```

不要一上来就加 `-f` 强行建池，强行覆盖会把误判的系统盘一起毁掉。

场景三：Btrfs 读写突然变只读并报校验错误。`dmesg` 原文片段：

```text
BTRFS error (device sdX): bdev /dev/sdX errs: wr 0, rd 0, flush 0, corrupt 42, gen 0
BTRFS: error (device sdX) in btrfs_run_delayed_refs:2144: errno=-5 IO failure
```

原因是底层盘出现坏块或线缆接触不良，Btrfs 检测到校验不一致后保护性只读。处理顺序：先把数据拷贝到其他介质，再跑 `sudo btrfs scrub start /mnt/btrfs-root` 看能否自动修复，检查 `sudo smartctl -a /dev/sdX` 的健康度（方法见第 3.4 章），确认坏盘后更换并用 `sudo btrfs device replace start /dev/sdX /dev/sdY /mnt/btrfs-root` 在线换盘，不要先拔盘再想办法。

## 六、生产环境最佳实践与安全建议

第一，scrub 与监控必须自动化。每月 scrub 应写入 systemd timer 或 cron，并把 `zpool status` 错误计数接入告警；出现 `DEGRADED` 要立即处理，冗余池带病运行等于没有冗余。

第二，快照要有保留周期。推荐日快照保留 7 份、周快照 4 份、月快照 6 份，脚本自动清理；快照过多会让删除大文件后空间无法释放，排查命令为 `sudo zfs list -t snapshot -o name,used`。

第三，容量水位线。ZFS 池使用率超过 80% 后写性能明显下降，建议 75% 预警、85% 必须扩容或清理。扩容优先给 mirror 池加一对盘，给 raidz 池加一整组同构 vdev。

第四，权限与加密。敏感数据集可用 ZFS 原生加密，建数据集时加 `-o encryption=aes-256-gcm -o keylocation=prompt -o keyformat=passphrase`。口令不得写进脚本。挂载点权限遵循最小授权，不要给 777。

第五，升级纪律。Ubuntu 大版本或内核升级前，先确认新内核对应的 ZFS 模块可用并做一次全池 scrub 与快照；升级后检查 `zpool status`。无论哪种文件系统，重要池在变更前都要有一份 send 到异机的可恢复副本，自愈能力不能替代备份。
