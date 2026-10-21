---
description: "磁盘有了文件系统只是第一步，系统每次开机都要知道「哪块盘挂到哪个目录、用什么参数挂」，多台机器之间还要能互相访问同一份数据，这就是本章主题：挂载与存储共享。"
---

# 挂载与存储共享

## 一、概述与使用场景

磁盘有了文件系统只是第一步，系统每次开机都要知道「哪块盘挂到哪个目录、用什么参数挂」，多台机器之间还要能互相访问同一份数据，这就是本章主题：挂载与存储共享。前半部分讲本地挂载的核心配置文件 `/etc/fstab`，后半部分讲三种网络共享：NFS 面向 Linux 客户端，Samba 面向 Windows 客户端，iSCSI 把远程磁盘以块设备形式提供给客户端。

为什么要讲透？fstab 写错一个 UUID、漏加一个选项，就可能导致开机卡在紧急模式（emergency mode）、数据盘未挂载被误认为数据丢失、应用把数据写进系统盘目录最终撑爆根分区。网络共享配错后果同样严重：NFS 权限过宽等于把目录对整个网段敞开，Samba 匿名可写是勒索软件横向传播的经典入口。

典型场景：数据盘开机自动挂载到 `/data`；NFS 给 Linux 计算节点提供共享目录；Samba 让 Windows 访问部门共享盘；iSCSI 把集中存储的 LUN 提供给宿主机。共享存储把数据收拢到一处，备份与权限也只剩一处要管。

## 二、环境准备与前置条件

本章适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS。示例约定：存储服务器地址为 `192.0.2.10`，客户端地址为 `192.0.2.20`，均为文档保留段地址，实际部署时替换为你的真实地址；共享目录服务端为 `/srv/share`；操作账号为 `ubuntu`，配合 `sudo` 提权。

按需安装软件包，不必一次全装：

```bash
sudo apt update
sudo apt install -y nfs-kernel-server nfs-common samba smbclient open-iscsi tgt util-linux
cat /etc/os-release
lsblk -f
sudo blkid
```

| 软件包 | 角色 | 用途 |
|--------|------|------|
| `nfs-kernel-server` | NFS 服务端 | 提供内核 NFS 服务与 `exportfs` 管理命令 |
| `nfs-common` | NFS 客户端 | 提供 `mount.nfs` 与 RPC 基础服务，服务端也会依赖它 |
| `samba` | Samba 服务端 | 提供 `smbd`、`nmbd`，实现 SMB / CIFS 共享 |
| `smbclient` | Samba 客户端工具 | 命令行列出与访问 SMB 共享，用于自测 |
| `tgt` | iSCSI 服务端 | 提供 `tgtadm` 管理 target 与 LUN |
| `open-iscsi` | iSCSI 客户端 | 提供 `iscsiadm` 发现与登录 target |

防火墙方面，如启用 `ufw`，按需放行：NFS 放行 2049，Samba 放行 445，iSCSI 放行 3260，且只针对客户端地址段，不要全协议放行。

!!! note "NFS 版本说明"
    Ubuntu 22.04 / 24.04 默认同时支持 NFSv3 与 NFSv4。NFSv4 只需 2049 一个端口，新部署应优先使用，并在客户端显式写 `vers=4.2`，避免自动协商回落到老版本。

## 三、手把手操作步骤

### 3.1 fstab 逐字段详解

`/etc/fstab` 每行定义一个开机挂载项，共六个字段，以空白分隔，`#` 开头为注释。改动此文件前必须先备份，这是本章的第一条铁律：

```bash
sudo cp /etc/fstab /etc/fstab.bak-2026-01-01
sudo blkid /dev/sdX1
cat /etc/fstab
```

一条典型的数据盘挂载行如下：

```ini
UUID=3f2a1b4c-1111-4222-8333-444455556666 /data ext4 defaults,nofail 0 2
```

逐字段讲解：

| 字段 | 示例值 | 含义与注意事项 |
|------|--------|----------------|
| 第 1 列 设备 | `UUID=3f2a1b4c-1111-4222-8333-444455556666` | 用谁挂载。强烈推荐用 `UUID=` 而非 `/dev/sdX1`，因为盘符会随插拔变化，UUID 绑定文件系统本身。用 `sudo blkid` 查询真实值后整段复制，不要手抄 |
| 第 2 列 挂载点 | `/data` | 挂到哪个目录，目录必须事先存在。挂载后原目录内容会被遮盖，这就是数据盘未挂上时目录看起来是空的原因 |
| 第 3 列 文件系统类型 | `ext4` | 如 `ext4`、`xfs`、`btrfs`、`nfs4`、`cifs`。写错类型开机挂载必失败 |
| 第 4 列 挂载选项 | `defaults,nofail` | 逗号分隔，见下文详解。`defaults` 等价于 `rw,suid,dev,exec,auto,nouser,async` 的组合 |
| 第 5 列 dump 标志 | `0` | 是否被老式 `dump` 备份工具纳入，现代环境一律填 `0` |
| 第 6 列 fsck 顺序 | `2` | 开机自检顺序：根分区填 `1`，其他本地盘填 `2`，网络文件系统与不需自检的填 `0`。填错不会丢数据，但会拖慢或扰乱开机检查 |

第 4 列常用选项详解：

| 选项 | 含义 |
|------|------|
| `nofail` | 该设备不存在或挂载失败时不阻塞开机。所有非系统必需的数据盘、移动盘、网络盘都应加上，是防止服务器因一块坏盘无法启动的关键选项 |
| `noauto` | 开机不自动挂载，需要时手动 `mount`，适合移动备份盘 |
| `ro` / `rw` | 只读 / 读写挂载 |
| `nosuid,nodev,noexec` | 禁止 setuid、设备文件与直接执行程序，数据盘与共享盘的安全基线组合 |
| `x-systemd.automount` | systemd 按需挂载：开机不真正挂，首次访问时才挂，适合网络存储，避免开机等网络超时 |
| `x-systemd.device-timeout=10s` | 配合 automount，等待设备就绪的超时时间 |
| `x-systemd.mount-timeout=10s` | 单次挂载动作的超时时间，避免网络盘故障时长时间卡住 |
| `_netdev` | 声明该挂载依赖网络，systemd 会在网络就绪后再挂，NFS、CIFS、iSCSI 的 fstab 条目应加上 |
| `soft` / `hard` | NFS 专用：`hard` 无响应时无限重试，一致性优先；`soft` 超时报错，可能静默丢写，数据库禁止用 `soft` |

用 UUID 追加一条数据盘记录的完整操作：

```bash
sudo mkdir -p /data
sudo blkid /dev/sdX1
echo 'UUID=3f2a1b4c-1111-4222-8333-444455556666 /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a
findmnt /data
df -h /data
```

!!! danger "设备名与 UUID 双重核对"
    `/dev/sdX1`、`/dev/nvmeXnYp1` 均为占位符，必须替换为你用 `lsblk -f` 确认的数据分区。把系统分区 UUID 写进新挂载行、或把挂载点误写为 `/`、`/home` 等已有关键目录，都会造成开机异常或目录遮盖。每次改完 fstab，先执行 `sudo mount -a` 验证无报错再重启，绝不允许改完直接重启赌一把。

在 22.04 / 24.04 上，fstab 由 systemd 转成 mount 单元，改完后执行 `sudo findmnt --verify --verbose` 与 `sudo systemctl daemon-reload` 检查，有警告先修警告，不要忽略。

### 3.2 NFS 服务端与客户端

服务端：准备共享目录并写导出配置。改配置前先备份：

```bash
sudo mkdir -p /srv/share
sudo chown ubuntu:ubuntu /srv/share
sudo cp /etc/exports /etc/exports.bak-2026-01-01
cat /etc/exports
```

编辑 `/etc/exports`，完整内容示例（每行一个共享）：

```ini
/srv/share 192.0.2.20(rw,sync,no_subtree_check,root_squash)
```

逐项讲解：路径后是允许的客户端，可写单地址或网段如 `192.0.2.0/24`，不要写 `*` 对全网开放；`rw` 可读写，只读用 `ro`；`sync` 表示写入落盘后才回复，断电不丢已确认数据，有 UPS 保障才考虑 `async`；`no_subtree_check` 关闭子树检查，是通用推荐；`root_squash` 把客户端 root 映射为 `nobody`，是安全底线，不要轻易用 `no_root_squash`。

使配置生效并检查：

```bash
sudo exportfs -ra
sudo exportfs -v
sudo systemctl enable --now nfs-kernel-server
sudo systemctl status nfs-kernel-server
sudo ufw allow from 192.0.2.20 to any port 2049 proto tcp
```

客户端：安装 `nfs-common` 后先手动挂载验证，再写入 fstab 实现开机自动挂载：

```bash
sudo apt install -y nfs-common
sudo mkdir -p /mnt/share
sudo mount -t nfs4 -o vers=4.2 192.0.2.10:/srv/share /mnt/share
df -h /mnt/share
sudo touch /mnt/share/client-write-test.txt
ls -l /mnt/share
```

验证通过后，备份客户端 fstab 并追加自动挂载行，网络盘务必带齐 `nofail`、`_netdev` 与 automount，避免服务端未开机时客户端卡死：

```bash
sudo cp /etc/fstab /etc/fstab.bak-2026-01-01
echo '192.0.2.10:/srv/share /mnt/share nfs4 vers=4.2,nofail,_netdev,x-systemd.automount,x-systemd.mount-timeout=10s 0 0' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload
sudo umount /mnt/share
df -h /mnt/share
```

NFSv4 路径按服务端导出表填写，上例导出 `/srv/share`，客户端就按 `:/srv/share` 挂载，挂不上时先用 `exportfs -v` 核对。

### 3.3 Samba 共享

Samba 让 Windows 与 Linux 客户端通过 SMB 协议访问共享，适合混合操作系统环境。准备目录并备份主配置：

```bash
sudo mkdir -p /srv/samba-share
sudo chown ubuntu:ubuntu /srv/samba-share
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak-2026-01-01
sudo nano /etc/samba/smb.conf
```

在 `/etc/samba/smb.conf` 的 `[global]` 段确认或加入以下行，并在文件末尾追加共享段，完整共享段示例如下：

```ini
[global]
   workgroup = WORKGROUP
   server min protocol = SMB2
   disable netbios = yes
   smb ports = 445

[teamshare]
   comment = Team Share on example.com file server
   path = /srv/samba-share
   browseable = yes
   read only = no
   valid users = ubuntu
   create mask = 0664
   directory mask = 0775
```

逐项讲解：`server min protocol = SMB2` 禁用不安全的 SMB1；`disable netbios = yes` 加 `smb ports = 445` 表示只走 445 端口；`valid users = ubuntu` 限定可访问账号，不要改成匿名访问；`create mask` 与 `directory mask` 控制新建文件与目录的默认权限。

Samba 账号与系统账号是两套密码体系：系统用户还需单独设置 Samba 密码：

```bash
sudo smbpasswd -a ubuntu
sudo testparm -s
sudo systemctl restart smbd
sudo systemctl status smbd
sudo ufw allow from 192.0.2.0/24 to any port 445 proto tcp
```

Linux 客户端自测与挂载：

```bash
smbclient -L 192.0.2.10 -U ubuntu
sudo mkdir -p /mnt/teamshare
sudo mount -t cifs //192.0.2.10/teamshare /mnt/teamshare -o username=ubuntu,vers=3.0,uid=ubuntu,gid=ubuntu
ls /mnt/teamshare
```

!!! warning "Samba 安全红线"
    禁止开启匿名可写共享，`guest ok = yes` 加 `read only = no` 的组合等于对整个网段开放任意写入，是勒索软件传播与数据被删的高发配置。确需访客只读，也应单独建只读共享段并限制来源地址，不要在业务共享上放开。

### 3.4 iSCSI 入门：target 与 initiator

iSCSI 把存储以块设备形式通过 IP 网络提供，客户端（initiator）登录后会多出一块盘，可在其上建文件系统。服务端用 `tgt`，先准备后端文件作为 LUN：

```bash
sudo dd if=/dev/zero of=/srv/iscsi-lun1.img bs=1M count=0 seek=20480 status=progress
sudo ls -lh /srv/iscsi-lun1.img
tgtadm --mode target --op show
```

上面用稀疏文件生成 20 GiB 镜像。随后创建 target 并绑定 LUN：

```bash
sudo tgtadm --lld iscsi --mode target --op new --tid 1 --targetname iqn.2026-01.com.example:storage.lun1
sudo tgtadm --lld iscsi --mode target --op new --tid 1 --lun 1 --backing-store /srv/iscsi-lun1.img
sudo tgtadm --lld iscsi --mode target --op bind --tid 1 --initiator-address 192.0.2.20
sudo tgtadm --mode target --op show
```

IQN 格式为 `iqn.年-月.域名反写:自定义名`，示例用 `example.com` 反写。`--initiator-address` 是访问控制，不要省略后对全网开放。`tgt` 运行时配置重启会丢失，应写入 `/etc/tgt/conf.d/lun1.conf` 持久化：

```ini
<target iqn.2026-01.com.example:storage.lun1>
    backing-store /srv/iscsi-lun1.img
    initiator-address 192.0.2.20
</target>
```

写完执行 `sudo systemctl restart tgt` 并用 `tgtadm --mode target --op show` 确认已加载。客户端发现并登录：

```bash
sudo apt install -y open-iscsi
sudo iscsiadm -m discovery -t sendtargets -p 192.0.2.10:3260
sudo iscsiadm -m node -T iqn.2026-01.com.example:storage.lun1 -p 192.0.2.10:3260 --login
lsblk -f
sudo iscsiadm -m session
```

登录成功后 `lsblk` 会出现新盘，后续用法与本地盘一致，但 fstab 必须加 `_netdev,nofail`。不再使用时先卸载，再登出：

```bash
sudo umount /mnt/iscsi-data
sudo iscsiadm -m node -T iqn.2026-01.com.example:storage.lun1 -p 192.0.2.10:3260 --logout
```

!!! danger "iSCSI 盘禁止随意断网"
    iSCSI 底层是网络，网络中断会让块设备瞬间消失并可能损坏文件系统。关键业务应配多路径与 CHAP 认证，维护时先卸载再登出，顺序不可颠倒。

## 四、效果验证与测试

验证：

```bash
sudo mount -a
findmnt --verify
df -h
findmnt /data
```

期望输出示例：

```text
/data  /dev/sdb1  ext4  rw,relatime
Filesystem      Size  Used Avail Use% Mounted on
/dev/sdb1        98G   24G   69G  26% /data
```

`mount -a` 无报错、`findmnt --verify` 无警告，才算合格。再重启一次，`df -h` 中数据盘与网络盘都在，才证明开机链路完整。

NFS 验证：两端看到同一文件即成功：

```bash
echo "nfs-ok" | sudo tee /mnt/share/client-write-test.txt
cat /mnt/share/client-write-test.txt
sudo exportfs -v
showmount -e 192.0.2.10
```

Samba 验证：`smbclient //192.0.2.10/teamshare -U ubuntu -c 'ls'` 能列目录即通过。iSCSI 验证：`sudo iscsiadm -m session` 显示会话，`lsblk` 中新盘容量与 LUN 一致即通过。

## 五、常见错误与排坑指南

场景一：改完 fstab 重启，系统进入 emergency mode。控制台原文片段：

```text
You are in emergency mode. After logging in, type "journalctl -xb" to view system logs.
Dependency failed for /data
```

原因几乎都是第 1 列 UUID 写错、第 3 列类型写错，或数据盘故障而条目里没加 `nofail`。修复：在紧急模式下登录，依次执行：

```bash
sudo cp /etc/fstab /etc/fstab.broken
sudo blkid
sudo nano /etc/fstab
sudo mount -a
sudo findmnt --verify
exit
```

修正或先注释错误条目，`mount -a` 无报错后再重启。教训：改 fstab 必备份、必验证、数据盘必加 `nofail`。

场景二：NFS 客户端挂载长时间卡住后报错。原文片段：

```text
mount.nfs4: Connection timed out
mount.nfs: mount system call failed
```

常见原因：服务端未启动、防火墙未放行 2049、`/etc/exports` 没有该客户端地址。逐项排查：

```bash
sudo systemctl status nfs-kernel-server
sudo exportfs -v
sudo ufw status
ping -c 3 192.0.2.10
sudo showmount -e 192.0.2.10
```

确认导出表与端口后重新挂载。写入报 `Permission denied` 多为 `root_squash` 把 root 映射为 `nobody`，改用 `ubuntu` 写入即可，不要改成 `no_root_squash`。

场景三：Samba 在 Windows 上提示无权限或反复弹密码框。服务端日志原文片段：

```text
smbd[1234]:  check_ntlm_password:  Authentication for user [ubuntu] -> FAILED with error NT_STATUS_WRONG_PASSWORD
```

原因是没建 Samba 密码。修复：

```bash
sudo smbpasswd ubuntu
sudo pdbedit -L
sudo testparm -s
sudo systemctl restart smbd
smbclient //192.0.2.10/teamshare -U ubuntu -c 'ls'
```

先用 `smbclient` 验证通过，再让 Windows 重试并删除其缓存的旧凭据。

## 六、生产环境最佳实践与安全建议

第一，fstab 治理。非根挂载统一加 `nofail`，网络挂载统一加 `_netdev` 与 automount；变更纳入流程，附带备份与 `mount -a` 验证记录；定期用 `findmnt` 与文档比对。

第二，共享最小授权。NFS 按地址逐个授权、默认 `root_squash`、能只读就只读；Samba 禁用 SMB1 与匿名写入；iSCSI 必须配白名单，跨不可信网络再加 CHAP。共享授权段与防火墙规则保持一致。

第三，一致性优先。NFS 数据库负载坚持 `sync` 加 `hard`，宁可慢不可丢；不要为跑分把生产共享改成 `async` 加 `soft`，一次断电就可能损坏数据库。

第四，监控挂载存活。目录存在不等于盘已挂载，用 `findmnt` 巡检或挂载点标记文件校验，防止应用把数据写进未挂载的空目录；容量盯 80%、90% 两档阈值。

第五，文档与演练。维护共享清单（路径、协议、授权对象、负责人、备份归属），成员变动同步回收授权；每季度做一次共享盘误删恢复演练。
