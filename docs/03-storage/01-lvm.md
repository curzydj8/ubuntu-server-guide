# LVM 动态卷管理

## 一、概述与使用场景

LVM（Logical Volume Manager，逻辑卷管理器）是 Linux 在物理磁盘与文件系统之间插入的一层抽象。它把一块或多块物理磁盘先做成物理卷（Physical Volume，PV），再汇聚成卷组（Volume Group，VG），最后从卷组中切分出逻辑卷（Logical Volume，LV）给文件系统使用。应用程序看到的 `/dev/mapper/vgdata-lvdata` 与普通分区没有区别，但底层空间可以在不关机、不重装系统的前提下自由伸缩、跨盘迁移。

为什么需要 LVM？传统分区表在系统安装时就把空间写死了：根分区 40 GiB、数据分区 200 GiB，一旦根分区被日志撑满，即使数据分区还有大量空闲，也只能停机重分区。LVM 解决的正是这种僵化：卷组是一个空间池，哪个逻辑卷不够就从池里划给它；池子本身不够，再加一块新盘进池即可。Ubuntu Server 安装程序默认提供的「Use LVM」选项，本质就是把系统盘做成了 VG 再切分 LV。

典型场景包括：数据库服务器需要随数据增长在线扩容 `/var/lib/mysql`；虚拟化宿主机用 LV 作为虚拟机磁盘，便于快照与克隆；多块大小不一的旧盘拼成一个大空间池；用快照在打补丁、升级前留一个可回滚的系统状态。

不配 LVM 的风险与瓶颈同样明确：直接用固定分区时，扩容往往意味着停机、备份、重分区、恢复，窗口以小时计；单盘无冗余时坏盘即丢数据——注意 LVM 本身不提供 RAID 冗余，它解决的是弹性，不是可靠性，可靠性要靠 mdadm、ZFS 或硬件 RAID 补齐。另一个瓶颈是规划失误：VG 空间一次性全部分完，后续扩容就无池可用，因此生产环境通常预留 10% 到 20% 的 VG 空闲空间。

## 二、环境准备与前置条件

本章适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS，两者 LVM 工具链均为 `lvm2` 包，命令语法无差异。操作需要 root 权限，下文命令均以 `ubuntu` 用户登录后用 `sudo` 执行，亦可切换为 `opsadmin` 运维账号，原理相同。

依赖包与环境要求如下：至少准备一块空闲数据盘用于练习，例如第二块 SATA 盘 `/dev/sdX` 或 NVMe 盘 `/dev/nvmeXnY`。云主机上则表现为新挂载的数据盘设备。在动手前，完整备份目标盘已有数据，因为 `pvcreate` 会改写磁盘头部元数据。

```bash
sudo apt update
sudo apt install -y lvm2 xfsprogs e2fsprogs
lsblk -f
cat /etc/os-release
sudo systemctl status lvm2-monitor.service
```

| 软件包 | 用途 |
|--------|------|
| `lvm2` | 提供 `pvcreate`、`vgcreate`、`lvcreate`、`lvextend` 等核心命令与 udev 规则 |
| `e2fsprogs` | 提供 ext4 的 `mkfs.ext4`、`resize2fs`、`e2fsck`，缩减操作必需 |
| `xfsprogs` | 提供 XFS 的 `mkfs.xfs`、`xfs_growfs`，注意 XFS 只能扩容不能缩减 |

!!! note "关于 thin provisioning"
    LVM 还支持精简配置（thin pool），可超额分配空间，适合虚拟机与容器场景。本章以最常用的线性卷（linear LV）为主线讲清原理，thin 卷的命令差异仅在于先建 thinpool 再建 thin LV，日常文件服务器不建议一开始就上 thin，以免空间耗尽时行为难以预期。

## 三、手把手操作步骤

### 3.1 核心概念：PV、VG、LV 与 PE

理解三个层次就理解了 LVM：PV 是被 LVM 接管的物理设备，可以是整盘或一个分区；VG 是由一个或多个 PV 组成的存储池，有名字，例如 `vgdata`；LV 是从 VG 中切出的逻辑分区，有名字，例如 `lvdata`，格式化后挂载使用。VG 内部把空间切成固定大小的物理范围（Physical Extent，PE），默认 4 MiB，LV 的大小必须是 PE 的整数倍，所以你申请 10 GiB 实际得到的会是向上取整后的值。

```text
物理盘 /dev/sdX ──pvcreate──> PV ──vgcreate──> VG（空间池）
                                                     │
                                          lvcreate 切分
                                                     ▼
                            LV ──mkfs──> 文件系统 ──mount──> /data
```

!!! danger "设备名占位警告"
    本章所有命令中的 `/dev/sdX`、`/dev/nvmeXnY` 均为占位符，X、Y 必须替换为你机器上经 `lsblk -f` 确认的真实空闲盘。千万不要把系统盘（通常挂载着 `/` 的那块）填进去，`pvcreate`、`mkfs` 都会破坏原有数据且不可恢复。NVMe 整盘形如 `/dev/nvme0n1`，其分区为 `/dev/nvme0n1p1`；SATA 整盘形如 `/dev/sdb`，分区为 `/dev/sdb1`，不要混淆。

### 3.2 创建 PV、VG、LV 全流程

第一步，把新盘做成 PV。执行前先备份该盘上需要保留的数据，然后初始化：

```bash
lsblk -f
sudo pvcreate /dev/sdX
sudo pvs
sudo pvdisplay /dev/sdX
```

第二步，创建卷组 `vgdata` 并把 PV 加入。若有多块盘，可一次写多个设备名，中间用空格分隔：

```bash
sudo vgcreate vgdata /dev/sdX
sudo vgs
sudo vgdisplay vgdata
```

`vgdisplay` 输出中重点看三行：`VG Size` 是池子总容量，`PE Size` 是 4.00 MiB，`Free PE / Size` 是剩余可分配空间，后者大于零才能继续建 LV 或扩容。

第三步，从 VG 中切一个 50 GiB 的 LV 并格式化为 ext4：

```bash
sudo lvcreate -L 50G -n lvdata vgdata
sudo lvs
sudo mkfs.ext4 /dev/vgdata/lvdata
sudo mkdir -p /data
sudo mount /dev/vgdata/lvdata /data
df -h /data
```

参数讲解：`-L 50G` 按绝对大小分配，也可用 `-l 100%FREE` 把 VG 剩余空间全部分完（不推荐，见最佳实践）；`-n lvdata` 指定 LV 名；设备路径有两种写法，`/dev/vgdata/lvdata` 与 `/dev/mapper/vgdata-lvdata` 指向同一个设备，后者是 device-mapper 的规范路径，脚本中更推荐后者。开机自动挂载需把 UUID 写入 `/etc/fstab`，方法见第 3.3 章，本章先手动验证挂载无误。

### 3.3 在线扩容：LV 与文件系统两步走

扩容是 LVM 最常用的操作，分为两步且顺序不可颠倒：先扩大 LV，再扩大文件系统。假设给 `vgdata` 新增一块盘 `/dev/sdY`，并把 `lvdata` 再扩 30 GiB：

```bash
sudo pvcreate /dev/sdY
sudo vgextend vgdata /dev/sdY
sudo vgs
sudo lvextend -L +30G /dev/vgdata/lvdata
sudo resize2fs /dev/vgdata/lvdata
df -h /data
```

关键点：`lvextend -L +30G` 中的加号表示「在现有基础上增加 30 GiB」，不写加号则表示「扩到总共 30 GiB」，写错会报错或达不到预期。更省事的写法是 `sudo lvextend -r -L +30G /dev/vgdata/lvdata`，`-r` 即 `--resizefs`，会在扩 LV 后自动调用对应工具扩文件系统，ext4 调 `resize2fs`、XFS 调 `xfs_growfs`，生产环境推荐使用。整个过程服务不用停、文件不用关，这就是在线扩容。XFS 扩容命令为 `sudo xfs_growfs /data`，参数是挂载点而非设备名，这是与 ext4 的常见混淆点。

### 3.4 缩减：高危操作，文件系统必须先行

缩减与扩容完全不对称：必须先缩文件系统，再缩 LV，且文件系统内已用空间必须小于目标大小。ext4 支持离线缩减，XFS 根本不支持缩减——如果你的数据卷是 XFS，请跳过本节，缩减需求只能靠新建小卷加数据迁移实现。

!!! danger "缩减前强制要求"
    缩减是 LVM 中最容易丢数据的操作：LV 缩得比文件系统还小，会直接截断文件数据且无法修复。执行前必须完成三件事：第一，用第 3.4 章的方法做一次完整备份并验证可读；第二，卸载文件系统后做强制检查；第三，文件系统目标大小要比 LV 目标大小至少小 1 GiB，留出安全余量。任何一步做不到，就不要缩。

以把 `lvdata` 从 80 GiB 缩到 40 GiB 为例，完整顺序如下：

```bash
cp -a /data /data-backup-check
sudo umount /data
sudo e2fsck -f /dev/vgdata/lvdata
sudo resize2fs /dev/vgdata/lvdata 39G
sudo lvreduce -L 40G /dev/vgdata/lvdata
sudo resize2fs /dev/vgdata/lvdata
sudo mount /dev/vgdata/lvdata /data
df -h /data
```

逐行说明：先 `umount`，缩减不支持在线进行；在挂载状态下强行操作会被拒绝，这也是保护机制。`e2fsck -f` 强制检查并修复元数据，不检查直接缩容易把潜在错误放大。`resize2fs` 先把文件系统缩到 39 GiB，比 LV 目标 40 GiB 小 1 GiB。`lvreduce` 交互时会提示 `WARNING: Reducing active logical volume to 40.00 GiB.` 并要求输入 `y` 确认，脚本中可用 `-y` 自动确认，但手动操作时建议看清提示再确认。最后再跑一次不带大小的 `resize2fs`，让文件系统重新填满 LV。

### 3.5 快照与恢复

快照（snapshot）是同一 VG 内的一份写时复制（Copy-on-Write）视图：创建瞬间几乎不占空间，之后原卷每写入一个新块，旧数据才被复制一份到快照区。因此快照区大小决定它能承受的变更量，变更超过快照区容量，快照自动失效。典型用途是升级、打补丁前留后悔药，有效期以小时或天计，不是备份。

```bash
sudo lvcreate -L 10G -s -n lvdata-snap /dev/vgdata/lvdata
sudo lvs
sudo mkdir -p /mnt/snap
sudo mount /dev/vgdata/lvdata-snap /mnt/snap
ls /mnt/snap
```

参数讲解：`-s` 表示创建快照卷；`-L 10G` 是快照区大小，经验值取原卷容量的 10% 到 20%，变更剧烈的数据库卷要给更大；快照可只读挂载查看旧文件，也可直接从中拷贝单个文件恢复，不必整卷回滚。

整卷恢复（回滚到快照时刻）使用合并命令，该操作会让原卷内容回到快照点：

!!! warning "快照合并会丢弃快照点之后的数据"
    `lvconvert --merge` 执行后，快照点之后写入原卷的所有数据都会被丢弃。合并前务必确认不再需要新数据，并先卸载原卷与快照卷。合并通常在下一次激活 LV 时完成，期间不要断电。

```bash
sudo umount /data
sudo umount /mnt/snap
sudo lvconvert --merge /dev/vgdata/lvdata-snap
sudo mount /dev/vgdata/lvdata /data
sudo lvs
```

合并完成后快照卷自动消失。用完不恢复时，直接删除快照即可：先卸载，再执行 `sudo lvremove /dev/vgdata/lvdata-snap`。

### 3.6 删除 LV、VG 与 PV

删除顺序与创建完全相反：先卸载、删 LV，再删 VG，最后删 PV。改任何配置前先备份，本章涉及的配置文件主要是 `/etc/fstab`，挂载点条目要同步清理，否则下次开机会因找不到设备而卡住。

```bash
sudo cp /etc/fstab /etc/fstab.bak-2026-01-01
sudo umount /data
sudo lvremove /dev/vgdata/lvdata
sudo vgremove vgdata
sudo pvremove /dev/sdX
sudo pvs
sudo vgs
sudo lvs
```

`lvremove` 与 `vgremove` 都会要求确认，输入 `y` 后执行。删完用 `pvs`、`vgs`、`lvs` 三件套确认无残留，再编辑 `/etc/fstab` 删除对应行。若只是要把一块盘从 VG 中移走腾作他用，应先用 `sudo pvmove /dev/sdX` 把数据在线迁移到 VG 内其他 PV，再执行 `sudo vgreduce vgdata /dev/sdX` 与 `pvremove`，顺序不能反。

## 四、效果验证与测试

创建与扩容后，用以下命令逐项核对，任何一项输出对不上都不要进入下一步：

```bash
sudo pvs
sudo vgs
sudo lvs -a -o +devices
df -h /data
sudo lvdisplay /dev/vgdata/lvdata
findmnt /data
```

期望输出示例（容量数值以实际为准，结构应一致）：

```text
  PV         VG     Fmt  Attr PSize   PFree
  /dev/sdX   vgdata lvm2 a--  100.00g 50.00g
  VG     #PV #LV #SN Attr   VSize   VFree
  vgdata   1   1   0 wz--n- 100.00g 50.00g
  LV     VG     Attr       LSize  Pool Origin
  lvdata vgdata -wi-ao---- 50.00g
Filesystem                    Size  Used Avail Use% Mounted on
/dev/mapper/vgdata-lvdata      49G  1.2G   45G   3% /data
```

写入测试验证文件系统真实可用，而不是只看容量数字：

```bash
sudo dd if=/dev/zero of=/data/testfile bs=1M count=512 status=progress
sync
ls -lh /data/testfile
sudo rm /data/testfile
```

快照验证：向 `/data` 写入新文件后，检查快照挂载点 `/mnt/snap` 中不存在该新文件，而旧文件内容未变，即证明写时复制生效。再用 `sudo lvs` 观察快照的 `Data%` 字段，该值随原卷变更增长，接近 100% 前必须合并或删除快照。

## 五、常见错误与排坑指南

场景一：扩容后 `df -h` 容量没变。报错表现是 `lvextend` 明明成功，`lvs` 显示 LV 已变大，但 `df` 仍是旧值。原因是只扩了 LV、没扩文件系统，块设备与文件系统是两层。修复命令：

```bash
sudo resize2fs /dev/vgdata/lvdata
sudo xfs_growfs /data
df -h /data
```

ext4 用第一条，XFS 用第二条，二选一。以后统一使用 `lvextend -r` 可避免此问题。

场景二：创建 LV 时报空间不足。报错原文片段：

```text
Volume group "vgdata" has insufficient free space (128 extents): 2560 required.
```

原因是申请大小超过 VG 的 `VFree`，或误以为多块盘容量可简单相加却有一块未加入 VG。先用 `sudo vgs` 与 `sudo vgdisplay vgdata` 核对 `Free PE`，再用 `sudo vgextend vgdata /dev/sdY` 补盘，或改小 `-L` 数值。注意 GiB 与 GB 的换算差异也会造成临界失败，改用 `-l 100%FREE` 分配全部剩余空间可绕开。

场景三：缩减后挂载报文件系统损坏。报错原文片段：

```text
mount: /data: wrong fs type, bad option, bad superblock on /dev/mapper/vgdata-lvdata
EXT4-fs (dm-2): bad geometry: block count exceeds size of device
```

原因是顺序做反了——先缩了 LV 或 LV 缩得比文件系统更小，文件系统尾部数据被截断。此错误基本不可逆，只能从备份恢复。这正是本章反复强调「文件系统先行、LV 留 1 GiB 余量」的原因。事后补救只有一条路：用备份重建 LV 并恢复数据，不要尝试反复 `e2fsck` 赌运气。

## 六、生产环境最佳实践与安全建议

第一，空间规划留余量。VG 永远保留 10% 到 20% 空闲，一是给临时扩容救急，二是给快照预留变更空间；监控告警建议设两档：LV 使用率 80% 预警、90% 告警，并对 VG 的 `VFree` 单独告警。

第二，分清弹性与冗余。LVM 不防坏盘，重要数据卷应在 LVM 之下先做 mdadm RAID1 / RAID10 或直接使用硬件 RAID，再在其上建 PV。LVM 自带的 `--type raid1` 镜像卷基于 md 内核模块，也可使用，但运维熟悉度不如独立 mdadm 分层清晰的团队建议用后者。

第三，快照不是备份。快照与原卷在同一块物理盘上，盘坏则一起丢失；快照只用于短时回滚，所有长期留存必须走第 3.4 章的异机或异介质备份。快照保留时间建议不超过 72 小时，长期挂着的快照会持续拖慢原卷写性能。

第四，操作留痕与命名规范。VG、LV 命名建议带用途与环境，如 `vgdata`、`lv-mysql-prod`，避免 `vg1`、`test` 这类无信息名字进入生产。每次 `lvextend`、`lvreduce` 前把 `sudo vgs` 与 `sudo lvs` 输出存入运维日志；批量脚本中禁止使用 `lvreduce -y` 这类自动确认参数，人工确认是最后一道防线。

第五，权限与审计。LVM 命令全部需要 root，应通过 `sudo` 授权给运维组并开启命令审计，不要把运维账号直接设为免密全量 sudo。定期执行 `sudo vgscan` 与一致性检查，并在每次扩容后更新资产台账中的磁盘与卷信息，确保文档、监控与实机三者一致。
