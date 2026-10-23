---
description: "数据落盘前先过一道加密：本章用 cryptsetup 给数据盘做 LUKS2 加密，从选盘双核对、luksFormat、口令槽与头备份，到 crypttab 开机解锁、重启验证、头损坏恢复与完整回滚，只覆盖数据盘、不动系统根盘。"
---

# 数据盘 LUKS 加密

## 一、概述与使用场景

LUKS（Linux Unified Key Setup）是在块设备层做全盘加密的标准方案：数据写进磁盘之前先加密，读出时再解密，对文件系统与应用完全透明。它防的是「盘离开机器之后」的风险：硬盘被单独拆走、报废盘未擦除就流出、云主机磁盘快照与镜像被他人拿到。防不了的是机器运行中被攻破的场景：盘在开机解锁后就是明文可读状态，攻击者拿到系统权限照样能读数据，这一层要靠前面几章的登录与权限控制，不要对 LUKS 有超出其边界的预期。

先把工作原理说清，后面所有纪律都从这里来：

| 概念 | 含义 | 与操作纪律的关系 |
| --- | --- | --- |
| 卷密钥（master key） | 真正加密数据的密钥，随机生成，存在 LUKS 头里 | 它从不由人直接保管，谁拿到卷密钥谁就能解全盘 |
| LUKS 头 | 位于设备开头的一段元数据，存卷密钥（被口令加密后的形态）、算法参数与槽位信息 | 头损坏等于卷密钥丢失，**头坏了数据就没了**；所以头备份是本章的硬性动作 |
| 口令槽（key slot） | LUKS2 最多 32 个槽，每槽存一份被某口令解开的卷密钥副本 | 多个口令可以打开同一块盘；加备份口令就是多占一个槽，不改变数据本身 |
| 映射设备 | 解锁后出现在 `/dev/mapper/<名字>` 的解密视图 | 文件系统建在映射设备上，不是建在原始盘上；挂载、fstab 都认这个名字 |

本章的范围红线先划清：**只给数据盘或数据分区做 LUKS2 加密**，示例是一整块独立数据盘 `/dev/sdb`。不对正在运行的系统根盘做就地加密：根盘加密是安装系统时的选项（安装器提供整盘加密方案），装完之后再对根盘动加密属于高风险手术，本章不覆盖；已经用安装器做了根盘加密的机器，其解锁与维护也不在本章范围内。

!!! danger "口令与头备份都丢了，数据就是无解的"
    LUKS 没有后门、没有找回、没有客服重置。全部口令槽的口令都遗忘、或者 LUKS 头损坏且没有头备份，这块盘的数据在数学上不可恢复，任何人帮不了。读完本章你应该形成两个肌肉记忆：口令一律进密码管理器并至少保留两个可用口令（见 [本部分第 09 章](09-secrets-management.md) 的落位纪律）；头备份在加密完成后立刻做、离线另存。这两件事没做完，不要往盘里放真实数据。

适用场景：给服务器加一块数据盘存放数据库文件、备份、用户上传等敏感数据；旧盘退役前已经加密、可降低未擦除流出的风险；合规要求数据静态加密。与相邻章节的分工：加密层之下或之上的逻辑卷管理见 [第 03 部分《逻辑卷管理 LVM》](../03-storage/01-lvm.md)（加密与 LVM 可以组合，本章只走最简的整盘直加密）；数据本身的备份策略见 [第 03 部分《数据备份》](../03-storage/04-backup.md)，注意数据备份与本章的头备份是两回事，前者保数据内容、后者保打开盘的资格，缺一不可。

需要无人值守自动解锁时还有一条 clevis 绑定 TPM2 的路线（由芯片按启动状态释放解锁材料），本章未核验其完整步骤，只提这一句存在，不展开命令；先按第三节的人工或 keyfile 路线落地。

## 二、环境准备与前置条件

本章适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS（LUKS2 是 22.04 起 `cryptsetup luksFormat` 的默认类型），命令按 cryptsetup 官方文档核对，属于「文档核对」级别，未在实机上完整走通开机解锁流程；Ubuntu 26.04 标记为「待核验」。操作需要带 `sudo` 的管理账号。

前置条件逐项确认，任何一项不满足先停手：

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 目标盘 | 一块独立数据盘或数据分区，盘上数据可清空 | `luksFormat` 会毁掉目标设备上的全部现有数据；盘上有要留的数据，先按备份章完整拷出并校验 |
| 选盘依据 | 能拿到盘的型号与序列号 | 靠 `/dev/sdb` 这种顺序名认盘迟早出事，必须按第三节的双核对流程确认 |
| 口令落位 | 密码管理器可用，两个口令的位置已定 | 主口令与备份口令都要在动手前想好存哪，不要现场编一个记脑子里 |
| 头备份落位 | 一份能离线保存的介质（加密 U 盘、另一台机器的受控目录） | 头备份不能只留在被加密的这台机器上，盘坏或机器丢时它要跟着能取回 |
| 恢复通道 | 能进 recovery 模式或有安装盘 Live 环境 | 开机解锁配置写错时靠它改回来，先确认通道存在再改 crypttab |

先装工具并确认版本口径：

```bash
apt-cache policy cryptsetup
sudo apt install -y cryptsetup
cryptsetup --version
```

`cryptsetup` 在多数服务器安装中已随系统带入，没装时按上面补装。版本号以本机 `apt-cache policy` 与 `cryptsetup --version` 的实际输出为准，不同小版本在提示文案上略有差异，命令形态一致。

## 三、手把手操作步骤

以下全文统一示例：目标盘 `/dev/sdb`、映射名 `data_crypt`、挂载点 `/data`、文件系统 ext4。在你机器上替换成实际设备名与挂载点时，每一处都要同步替换。

### 3.1 确认目标盘：双核对，防选错盘

选错盘是本章唯一无法挽回的操作错误，所以用两条相互独立的证据认盘：设备清单里的型号与序列号，对照盘身标签或采购/云盘台账；再确认它没有被系统使用。

```bash
lsblk -o NAME,SIZE,TYPE,MODEL,SERIAL,MOUNTPOINTS
sudo blkid
findmnt -no SOURCE /
```

逐项核对：`findmnt` 显示的根分区所在盘（通常是 `/dev/sda` 或 NVMe 命名）绝不能是目标；`lsblk` 里目标盘应无挂载点、其上没有正在使用的分区与文件系统签名（`blkid` 对纯净空盘通常无输出或只有分区表信息）。型号与序列号与台账对上之后，再把目标设备名写进运维记录，本章后续命令都以它为准。任何一项对不上就停，不要抱着「应该是这块」的心态继续。

### 3.2 初始化加密：luksFormat

```bash
sudo cryptsetup luksFormat --type luks2 /dev/sdb
```

执行后先要求大写输入 `YES` 确认，再连续两次输入主口令。口令纪律：长度充足的随机口令或长口令短语，只存进密码管理器，不用与系统登录口令相同的值。输口令时终端不回显是正常现象。

!!! danger "luksFormat 完成即数据销毁完成"
    输入 `YES` 并回车之后，目标设备上原有数据即被新的 LUKS 头覆盖且不可恢复，这一步没有撤销。若 3.1 节的双核对还没有百分之百确认，现在就是最后一次停手机会。

初始化完成后看一眼头信息，确认类型与槽位状态：

```bash
sudo cryptsetup luksDump /dev/sdb
```

期望看到 `Version: 2`，`Keyslots` 区只有 `0` 号槽。注意 `luksDump` 输出里的设备 UUID、算法与槽位信息属于本机元数据，排障时不要整段贴到公开渠道，先脱敏再外传。

### 3.3 打开映射并建文件系统

用主口令打开加密设备，得到映射设备，再在映射上建文件系统并完成首次挂载与写读测试：

```bash
sudo cryptsetup open /dev/sdb data_crypt
lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINTS
sudo mkfs.ext4 /dev/mapper/data_crypt
sudo mkdir -p /data
sudo mount /dev/mapper/data_crypt /data
df -h /data
echo "luks-write-test" | sudo tee /data/luks-test.txt
cat /data/luks-test.txt
```

`lsblk` 期望看到 `sdb` 下挂着一层 `crypt` 类型的 `data_crypt`。文件系统按需选：本例用 ext4，偏好 xfs 时把建文件系统命令换成 `mkfs.xfs /dev/mapper/data_crypt`，后续 fstab 里的类型名同步改。写读测试通过，说明加密、映射、文件系统三层都通了；此时先不要急着放大批真实数据，先把 3.4 与 3.5 两件保命事做完。

### 3.4 口令槽管理：备份口令、改口令、删口令

先加一个备份口令占第二个槽。两个口令分开保管（例如一个进团队密码管理器、一个进离线封存），任一遗忘时还有另一个能开盘：

```bash
sudo cryptsetup luksAddKey /dev/sdb
sudo cryptsetup open --test-passphrase /dev/sdb
```

`luksAddKey` 先要求输入任一已有口令，再两次输入新口令。第二条是干跑验证：它只校验口令能否解开某个槽、不真正映射设备，返回成功说明当前输入的口令有效。加完后再看一次槽位：

```bash
sudo cryptsetup luksDump /dev/sdb | grep -A3 "Keyslots"
```

期望 `Keyslots` 区出现 `0` 与 `1` 两个槽。日常管理动作还有两个：更换某个槽的口令用 `luksChangeKey`（先验证旧口令，再设新口令，只动你指定的那个槽）：

```bash
sudo cryptsetup luksChangeKey /dev/sdb
```

删除某个口令用 `luksRemoveKey`，执行时输入的是「要被删掉的那个口令」本身，删的正是它所在的槽：

```bash
sudo cryptsetup luksRemoveKey /dev/sdb
```

删槽纪律：删之前先用 `luksDump` 看清还剩几个可用槽，并用 `--test-passphrase` 验证保留下来的口令确实能解开；永远不要删到只剩一个槽，更不要删掉最后一个可用口令——那等于当场把数据锁死（见第一节的 danger 说明）。删槽与改口令之后，3.5 节的头备份要重做，原因在那里说明。

### 3.5 LUKS 头备份：加密定稿后的第一件事

槽位定稿后立刻备份 LUKS 头。头备份文件里装着被各口令加密的卷密钥，**它加上任意一个当时有效的口令，就等于整块盘的钥匙**，敏感程度按私钥对待（落位纪律见 [本部分第 09 章](09-secrets-management.md)）：

```bash
sudo cryptsetup luksHeaderBackup /dev/sdb --header-backup-file /root/luks-header-sdb-$(date +%F).img
sudo chmod 600 /root/luks-header-sdb-$(date +%F).img
ls -lh /root/luks-header-sdb-$(date +%F).img
```

生成后立刻把这份文件复制到离线介质或另一台受控机器上，本机只留工作副本。只备份在本机、甚至备份进这块加密盘本身，都是无效备份：盘的电路板坏了或机器整台丢失时，你需要的是在另一块盘上恢复出数据，那时头备份必须在手边且不依赖故障盘。

两个必须记住的性质：第一，头备份是备份那一时刻的完整头部镜像，包含当时的全部口令槽；日后改口令或删槽，这份旧备份里仍然是旧槽状态，用它恢复会把口令槽一并恢复成旧状态（这正是第六节恢复流程的前提）。第二，由此推出：每次改口令或删槽之后都要重做头备份，并销毁旧的头备份文件，否则你以为已作废的旧口令会随着旧头备份一起继续有效。

### 3.6 开机自动处理：crypttab 与 fstab

让重启后盘能按预期解锁并挂载，要写两个文件。先记下加密设备的 UUID，后面 crypttab 用它认盘（不要用 `/dev/sdb` 顺序名，插拔顺序变化就会认错盘）：

```bash
sudo blkid -s UUID -o value /dev/sdb
sudo ls -l /etc/crypttab /etc/fstab
sudo cp -a /etc/fstab /etc/fstab.bak.$(date +%F)
```

记下输出的 UUID 备用。`/etc/crypttab` 若已存在，同样先 `cp -a` 备份一份带日期的副本；不存在则由下面步骤新建。两个文件各加一行，先讲人工解锁路线。

**路线一：开机人工输口令（推荐默认）。** `/etc/crypttab` 写入一行（四字段依次为映射名、设备、密钥文件、选项；第三字段 `none` 表示开机时提示输入口令）：

```ini
# /etc/crypttab 新增一行，UUID 替换为 blkid 查到的实际值
data_crypt UUID=<数据盘UUID> none luks
```

开机时系统会在控制台给出输入该盘口令的提示，输任一有效槽口令即解锁。它的安全含义最干净：口令只在人脑与密码管理器里，机器被整台拖走也只是一块解不开的盘。代价是每次重启都要有人在场（物理或带外控制台）输口令，无人值守机房要先确认带外通道可用。

**路线二：keyfile 自动解锁（无人值守时才选）。** 先生成密钥文件并把它加进一个口令槽：

```bash
sudo dd if=/dev/urandom of=/root/data-crypt.key bs=4096 count=1 status=none
sudo chmod 600 /root/data-crypt.key
sudo cryptsetup luksAddKey /dev/sdb /root/data-crypt.key
sudo cryptsetup open --test-passphrase --key-file /root/data-crypt.key /dev/sdb
```

`luksAddKey` 会先要求输入一个已有口令确认身份，之后密钥文件本身成为一个新的开盘凭据；最后一条干跑验证它确实能解开。crypttab 改为指向密钥文件：

```ini
# /etc/crypttab 新增一行，UUID 替换为 blkid 查到的实际值
data_crypt UUID=<数据盘UUID> /root/data-crypt.key luks
```

安全含义必须讲透：密钥文件躺在根分区上，等于把钥匙放在门边。它防的是「盘被单独拆走、单独流出」；防不住「整机被拖走」——机器一开机就自己解锁了；也防不住「root 被攻破」——root 能直接读这个文件。所以路线二只在你明确接受这个威胁模型时使用，且密钥文件必须 600 且只属 root。加完密钥文件这个新槽之后，按 3.5 节纪律重做头备份。

两条路线共用同一行 fstab。注意设备写映射名，不要写 `/dev/sdb`（那是未解密的容器，挂载它必然失败）：

```ini
# /etc/fstab 新增一行
/dev/mapper/data_crypt /data ext4 defaults 0 2
```

写完先做语法与现状验证，再重启：

```bash
sudo findmnt --verify
sudo mount -a
findmnt /data
```

`findmnt --verify` 期望无报错；`mount -a` 时 `/data` 已挂载会给出已挂载的提示，这属于正常。至此日常的打开与关闭动作再明确一遍（排障与维护时会用到）：

```bash
sudo umount /data
sudo cryptsetup close data_crypt
sudo cryptsetup open /dev/sdb data_crypt
sudo mount /dev/mapper/data_crypt /data
```

`close` 之前必须先卸载文件系统；`close` 之后 `/dev/mapper/data_crypt` 消失，盘回到完全加密状态。

### 3.7 重启验证

配置落盘后做一次真实重启验证，不要等到下次被动重启才发现配置写错：

```bash
sudo reboot
```

重启过程中：路线一会在控制台出现口令提示，输入后继续启动；路线二应无停顿直接启动。本机无人值守且没有带外控制台时，不要贸然做这一步，先把恢复通道确认好（见第二节）。系统起来后执行：

```bash
lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINTS
sudo cryptsetup status data_crypt
findmnt /data
cat /data/luks-test.txt
```

期望：`data_crypt` 的 crypt 层在、`/data` 已挂载、测试文件能读出。全部对上，整套流程才算闭环；任何一项不对，按第五节对应场景处置，不要先往盘里导数据。

## 四、效果验证与测试

日常巡检与交付验收看四处。第一，映射状态：

```bash
sudo cryptsetup status data_crypt
```

期望输出里 `type:` 为 `LUKS2`、`device:` 为 `/dev/sdb` 且状态为 active。第二，设备层关系：

```bash
lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINTS
sudo blkid /dev/sdb
sudo blkid /dev/mapper/data_crypt
```

期望：`/dev/sdb` 一行 `TYPE` 为 `crypto_LUKS`，映射设备一行才是 ext4 等文件系统类型；层级顺序是盘、crypt 层、文件系统，不能反。第三，口令与槽位抽查：

```bash
sudo cryptsetup open --test-passphrase /dev/sdb
sudo cryptsetup luksDump /dev/sdb | grep -A3 "Keyslots"
```

用备份口令各做一次干跑验证（执行后输入备份口令），确认两个槽都真实可用，而不是「以为可用」。第四，头备份在位确认：到离线介质的存放位置实际查看文件存在、大小非零，并把存放位置与文件日期记进运维台账。这四项在每次改口令、删槽、重做头备份之后都要重走一遍。

## 五、常见错误与排坑指南

场景一：配了 crypttab 后开机卡在口令提示或长时间超时，最后掉进 emergency shell。报错特征是启动阶段反复提示找不到设备、或解锁超时。根因几乎都在 crypttab 这一行：UUID 抄错字符、用成了文件系统 UUID（映射设备 blkid 的那一个）而不是加密设备 UUID（`/dev/sdb` 的那一个）、字段顺序写反、映射名与 fstab 对不上。恢复路径：开机菜单进 `Advanced options` 选 recovery 模式，进 root shell 后先让根分区可写，再改文件：

```bash
mount -o remount,rw /
sudo nano /etc/crypttab
sudo nano /etc/fstab
sudo blkid -s UUID -o value /dev/sdb
reboot
```

把 crypttab 里的 UUID 与最后一条命令的输出逐字对照后重启。若连 recovery 也进不去，用 Ubuntu 安装盘的 Live 环境启动、挂载根分区后改同样的两个文件。临时只想先进系统时，可以先把 crypttab 出错行与 fstab 对应行注释掉，系统起来后再按 3.6 节逐项补正，不要长期注释了事。

场景二：重启后 `/data` 是个空目录，误以为数据丢了。根因是没有解锁或没有挂载：要么 crypttab 根本没配、要么配错后被跳过，此时 `/data` 只是根分区上的一个空目录，加密盘里的数据原封未动。先按下面命令手动恢复，再回头补配置：

```bash
lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINTS
sudo cryptsetup open /dev/sdb data_crypt
sudo mount /dev/mapper/data_crypt /data
ls -la /data
```

`lsblk` 里没有 crypt 层就是没解锁；有 crypt 层但 `/data` 没挂载就是挂载环节的问题。确认数据在之后，再按 3.6 节检查 crypttab 与 fstab，不要在「空目录」状态下往 `/data` 里写新数据，那只会写进根分区、把目录状态搅得更乱。

场景三：改了口令之后发现旧口令还能开盘，或误删了想保留的口令。根因是把 LUKS 理解成「一个口令」：实际是多槽并存，`luksChangeKey` 只改你操作时命中的那个槽，其他槽的旧口令当然继续有效；`luksRemoveKey` 输入哪个口令就删哪个槽，输错就删错。处置顺序：先盘点，再动作：

```bash
sudo cryptsetup luksDump /dev/sdb | grep -A3 "Keyslots"
sudo cryptsetup open --test-passphrase /dev/sdb
```

逐个口令用干跑验证确认各槽归属后，再按 3.4 节删改。已经把最后一个可用口令删掉的情况不存在补救，按第一节的 danger 处理：数据无解。所以 3.4 节的纪律是硬性的：先验证要保留的口令可用，再删要删的槽。

场景四：`cryptsetup open` 直接报 `Device /dev/sdb is not a valid LUKS device`，`luksDump` 也读不出头。根因方向是 LUKS 头损坏：误对设备写了数据（例如把 mkfs、dd、分区工具用在了原始盘上）、或存储介质在头部区域出现坏块。能不能救只看两个前提：有一份可用的头备份、并且记得备份时任意一个有效口令。两个前提都在时，按第六节「回滚与恢复」里的头恢复步骤操作；任一前提不在时，结论就是数据不可恢复，不要在盘上反复试写操作，那只会把残存希望磨掉。

## 六、生产环境最佳实践与安全建议

第一，口令与槽位纪律长期化：主口令与备份口令分开落位、分别保管；任何人离职或口令疑似扩散时，用 `luksChangeKey` 换掉对应槽并重做头备份、销毁旧头备份，不要只改系统登录口令了事。第二，头备份当私钥管：权限 600、离线另存、在台账登记存放位置与日期；每季度按第四节的方法抽查它还在、且口令干跑验证仍通过。第三，自动解锁按威胁模型选，不要图省事：能有人输口令就用路线一；用 keyfile 的机器要接受「整机丢失等于数据丢失」这一前提，并在资产台账里写明。第四，加密不是备份的替代品：LUKS 只管静态保密，不管误删、勒索软件与文件系统损坏，数据备份照常按 [第 03 部分《数据备份》](../03-storage/04-backup.md) 执行，且重要数据的备份应落在另一块盘或异地，不要与源数据同盘。第五，性能口径：现代服务器 CPU 普遍带 AES-NI 硬件加速，LUKS 的日常开销通常小到可忽略量级，以你机器的实测为准，本章不给百分比承诺；老旧无加速指令集的机器先在测试盘上压一轮再决定。第六，Ubuntu 26.04 为「待核验」：升级到 26.04 前先在一块测试盘上重走第三节的完整流程与本节的恢复流程，确认 cryptsetup 行为与 crypttab 处理无变化再推广。

### 回滚与恢复

加密是单向动作，没有「一条命令解密整盘」这种回滚。下面分两种情形：想退回普通分区走回滚流程；头损坏走恢复流程。

**回滚：把数据拷出后重做普通分区。** 前提是盘当前能正常解锁（回滚不是救援手段）。完整步骤如下，先把数据拷到另一块盘或备份位置并校验，再动加密层：

```bash
sudo mount /dev/mapper/data_crypt /data
sudo rsync -aHAX /data/ /mnt/backup-target/data-restore-check/
sudo rsync -aHAX --dry-run --checksum /data/ /mnt/backup-target/data-restore-check/
```

第二条是校验性干跑，输出没有差异才算拷全（目标路径按你的实际备份位置替换，目标盘空间要事先确认够用）。确认数据已在盘外安全落地后，依次拆掉加密层并重建普通文件系统：

```bash
sudo umount /data
sudo cryptsetup close data_crypt
sudo wipefs -a /dev/sdb
sudo mkfs.ext4 /dev/sdb
sudo mount /dev/sdb /data
df -h /data
```

`wipefs -a` 会清掉 `/dev/sdb` 上的 LUKS 签名，这一步之后原加密数据不可恢复，所以顺序不能颠倒：先拷出并校验，后拆层。重建后把 `/etc/crypttab` 中 `data_crypt` 一行删掉、`/etc/fstab` 中对应行改成新文件系统的挂载行（设备与 UUID 都已变化，按 `blkid /dev/sdb` 的新输出写），再跑一次 `sudo findmnt --verify` 与重启验证。若用过 keyfile 路线，`/root/data-crypt.key` 与旧的头备份文件在回滚确认完成后一并删除销毁，它们对退役的加密容器仍是有效钥匙，不要留在机器上。

**恢复：LUKS 头损坏时用头备份还原。** 对应第五节场景四。前提再说一遍：头备份文件可取回、且你记得备份当时任意一个有效口令。先把头备份文件拷回本机（例如放回 `/root/`），然后执行恢复，命令会要求确认，恢复的是备份时刻的完整头部（包括当时的口令槽状态）：

```bash
sudo cryptsetup luksHeaderRestore /dev/sdb --header-backup-file /root/luks-header-sdb-2026-10-01.img
sudo cryptsetup luksDump /dev/sdb
sudo cryptsetup open --test-passphrase /dev/sdb
```

文件名按你实际备份的那一份替换。`luksDump` 能读出、`--test-passphrase` 用备份当时的口令验证通过，才算恢复成功；之后正常 `open` 并挂载抽查数据。恢复成功后立刻做两件事：按 3.5 节重做一份当前状态的头备份；并意识到口令槽已回到备份时刻状态，此后做过的改口令与删槽全部失效，该换的口令重新换一遍、该删的槽重新删一遍，最后再重做一次头备份收尾。两个前提（头备份、有效口令）缺任何一个时，不要尝试所谓恢复：没有头备份时任何写操作都只会降低残存数据的可读性，正确动作是停手并按数据已丢失走备份恢复流程。
