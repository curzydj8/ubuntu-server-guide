# 磁盘健康与备份

## 一、概述与使用场景

本章解决存储的最后一道防线：磁盘坏之前能不能提前知道，数据丢之后能不能完整回来。前半部分讲 SMART 监测——硬盘会在内部记录温度、坏扇区、通电时长等指标，SMART 就是读取这些指标并在彻底损坏前预警的机制。后半部分讲备份工具链：`rsync` 做文件级增量同步，`restic` 与 BorgBackup 做带去重、加密与快照管理的仓库式备份，配合 systemd timer 实现定时备份，最后以恢复演练收尾。

为什么需要这一章？多数数据丢失并非毫无征兆：机械盘损坏前数周，重映射扇区数往往已开始增长，只是没人去看。同样，大量团队在真正需要时才发现备份不可用——仓库损坏、密码丢失、从未做过恢复测试。备份的验收标准不是「任务显示成功」，而是「随机挑一个历史时间点，能把数据完整恢复出来」。

不做监测的风险是坏盘无预警；只做全量备份的瓶颈是窗口越拉越长、最终被放弃；只有备份没有演练，等于把可靠性押在运气上。本章目标是建立「监测有告警、备份有保留策略、恢复有实测记录」的闭环。

## 二、环境准备与前置条件

本章适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS。操作账号为 `ubuntu`，配合 `sudo` 提权；备份目标示例使用本机挂载的 `/mnt/backup` 与远程文档段地址 `192.0.2.60`，实际部署时替换为你的备份机地址。示例备份源为 `/srv/share` 与 `/etc`，请按你的实际数据目录调整。

```bash
sudo apt update
sudo apt install -y smartmontools rsync restic borgbackup nvme-cli
cat /etc/os-release
lsblk -f
sudo systemctl status smartmontools.service
```

| 软件包 | 用途 |
|--------|------|
| `smartmontools` | 提供 `smartctl` 查询命令与 `smartd` 后台监测守护进程，SATA 与 SAS 盘通用 |
| `nvme-cli` | 提供 `nvme` 命令，查询 NVMe 盘的健康日志，比 `smartctl` 对 NVMe 的支持更原生 |
| `rsync` | 文件增量同步工具，几乎所有 Linux 发行版自带 |
| `restic` | Go 编写的备份工具，去重、加密、支持本地与 SFTP 与 S3 等多种后端，上手快 |
| `borgbackup` | Borg 备份工具，去重与压缩成熟，仓库与档案（archive）模型稳定，适合长期留存 |

!!! note "固态硬盘的健康指标看法不同"
    机械盘重点看重映射与待处理扇区，固态硬盘没有扇区重映射的同等概念，应重点看介质磨损指标：NVMe 看 `Percentage Used` 与 `Available Spare`，SATA 固态看 `Wear_Leveling_Count` 或厂商的寿命剩余属性。不要拿机械盘的经验去判固态盘的生死。

## 三、手把手操作步骤

### 3.1 用 smartctl 查看磁盘健康

!!! warning "设备名占位警告"
    本章 `/dev/sdX`、`/dev/nvmeXnY` 均为占位符，必须替换为 `lsblk` 确认的真实设备。SMART 查询是只读操作不会伤数据，但后续涉及的格式化、清零等命令不在本章范围内，任何时候都不要把查询命令误敲成写命令。

先看总评与完整信息：

```bash
sudo smartctl -H /dev/sdX
sudo smartctl -a /dev/sdX
sudo smartctl -a /dev/nvmeXnY
sudo nvme smart-log /dev/nvmeXnY
```

`smartctl -H` 给出一行总评，期望结果为 `PASSED`；出现 `FAILED` 说明硬盘固件已判定自身濒临损坏，应立即备份并换盘，不要再观察。在 `smartctl -a` 的属性表中，重点盯以下四项的 `RAW_VALUE` 列：

| 属性 ID 与名称 | 含义 | 告警标准 |
|------|------|----------|
| 5 `Reallocated_Sector_Cnt` | 已重映射的坏扇区数 | 大于 0 就要关注，持续增长必须换盘 |
| 197 `Current_Pending_Sector` | 待处理扇区，读写时可能失败 | 大于 0 说明已有不稳定扇区，先备份再做长测 |
| 198 `Offline_Uncorrectable` | 脱机扫描发现的不可纠正错误 | 大于 0 高度危险 |
| 194 `Temperature_Celsius` | 盘体温度 | 机械盘长期超过 45 摄氏度要改善散热 |

NVMe 盘看 `nvme smart-log` 输出中的 `critical_warning`（应为 0）、`percentage_used`（寿命已用百分比，超过 90 要规划换盘）与 `media_errors`（应为 0）。

主动发起硬盘自检，短测约两分钟，长测对大容量机械盘可能数小时，应安排在低峰期：

```bash
sudo smartctl -t short /dev/sdX
sudo smartctl -t long /dev/sdX
sudo smartctl -l selftest /dev/sdX
```

### 3.2 配置 smartd 自动监测与告警

手动查询只能救一时，生产环境要靠 `smartd` 守护进程持续监测。改配置前先备份：

```bash
sudo cp /etc/smartd.conf /etc/smartd.conf.bak-2026-01-01
sudo cp /etc/default/smartmontools /etc/default/smartmontools.bak-2026-01-01
cat /etc/smartd.conf
```

在 `/etc/smartd.conf` 末尾加入一行，对所有可探测磁盘启用监测、每月 1 号凌晨做长测，并把告警写入日志。完整配置行如下：

```ini
DEVICESCAN -a -o on -S on -s (S/../.././02|L/../01/./01) -n standby,q
```

逐项讲解：`DEVICESCAN` 表示自动扫描全部磁盘，不必逐块列出；`-a` 开启全部监测项；`-o on` 与 `-S on` 开启脱机自动测试与属性自动保存；`-s` 后是自检计划，`S/../.././02` 表示每天凌晨 2 点短测，`L/../01/./01` 表示每月 1 号凌晨 1 点长测；`-n standby,q` 表示硬盘休眠时不唤醒它做检查，避免为监测破坏省电。需要邮件告警时在行尾追加 `-m opsadmin@example.com`，前提是本机已配好可用的邮件发送通道；没有邮件通道时，至少保证 `smartd` 日志进入 `journalctl` 并被日志监控覆盖。

启用并验证服务：

```bash
sudo systemctl enable --now smartmontools.service
sudo systemctl status smartmontools.service
sudo journalctl -u smartmontools.service -n 50 --no-pager
```

再在 `/etc/default/smartmontools` 中确认没有禁用 `smartd` 的选项。至此，属性越界与自检失败都会出现在系统日志中，配合日志告警即完成监测闭环。

### 3.3 rsync 增量备份

`rsync` 按文件大小与修改时间判断差异，只传变化部分，适合把目录镜像到另一块盘或另一台机器。先做预演，确认无误再实跑，这是使用 rsync 的铁律：

```bash
sudo rsync -avhn --delete /srv/share/ /mnt/backup/share/
sudo rsync -avh --delete --info=progress2 /srv/share/ /mnt/backup/share/
```

参数逐项讲解：

| 参数 | 含义 |
|------|------|
| `-a` | 归档模式，递归并保留权限、属主、时间戳、软链接 |
| `-v` / `-h` | 输出详细列表 / 容量人性化显示 |
| `-n` | dry-run 预演，只显示不执行，核对后再去掉 |
| `--delete` | 删除目标端源端已不存在的文件，使目标成为镜像。源写错时会清空目标，务必先预演 |
| `--info=progress2` | 显示总体进度 |
| `-H` / `-x` | 保留硬链接 / 不跨文件系统边界，避免误备 `/proc` 等虚拟文件系统 |

注意源路径结尾斜杠：`/srv/share/` 表示备份目录里的内容，`/srv/share` 表示把目录本身拷到目标下。写脚本时固定一种写法。

跨机备份通过 SSH 传输：

```bash
sudo rsync -avh -e ssh /srv/share/ ubuntu@192.0.2.60:/mnt/backup/share/
```

!!! danger "rsync --delete 的清空风险"
    当源目录因数据盘未挂载而变为空目录时，带 `--delete` 的 rsync 会忠实地把目标端也删空，备份与源数据同归于尽。防护办法：备份前在脚本中检查源目录的标记文件是否存在，例如 `test -f /srv/share/.backup-source-ok`，不存在就立即退出并告警，绝不继续同步。

### 3.4 restic 仓库式备份

restic 把备份存入仓库（repository），文件被切块、去重并加密，同一文件多次备份只占一份空间。先设置仓库密码环境变量——密码通过交互或受控的环境文件提供，示例中不写明文口令，生产环境应把密码放在仅 root 可读的文件中并用 `--password-file` 引用：

```bash
sudo install -m 600 /dev/null /etc/restic-password.txt
sudo nano /etc/restic-password.txt
export RESTIC_REPOSITORY=/mnt/backup/restic-repo
export RESTIC_PASSWORD_FILE=/etc/restic-password.txt
sudo -E restic init
sudo -E restic backup /srv/share /etc
sudo -E restic snapshots
```

在 `/etc/restic-password.txt` 中只写一行自设仓库密码，权限已设为 600。此密码丢失等于仓库作废，必须抄录到离线密码管理器异地存放。

日常命令围绕备份、查看、校验、清理：

```bash
sudo -E restic backup /srv/share /etc
sudo -E restic snapshots
sudo -E restic check
sudo -E restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
sudo -E restic stats
```

`forget` 删除过期快照，`--prune` 才真正回收空间，只 forget 不 prune 时磁盘不会变小。`check` 校验仓库可读性，每月至少跑一次；报错时先停新备份再排查目标盘健康。

恢复示例：

```bash
sudo -E restic restore latest --target /tmp/restore-test --include /srv/share
ls -R /tmp/restore-test
sudo -E restic diff latest~1 latest
```

### 3.5 BorgBackup 仓库式备份

Borg 与 restic 定位相近，特点是去重与压缩效率高、档案管理成熟。初始化带加密的仓库并创建档案：

```bash
export BORG_REPO=/mnt/backup/borg-repo
export BORG_PASSCOMMAND="cat /etc/borg-password.txt"
sudo install -m 600 /dev/null /etc/borg-password.txt
sudo -E borg init --encryption=repokey-blake2 /mnt/backup/borg-repo
sudo -E borg create --stats --compression lz4 ::srv-share-2026-01-01 /srv/share /etc
sudo -E borg list
sudo -E borg list ::srv-share-2026-01-01
```

逐项讲解：`--encryption=repokey-blake2` 表示密钥存放在仓库中并由口令保护，务必用 `borg key export` 导出离线保管；档案名格式为 `::名字-日期`；`--compression lz4` 在速度与压缩比间取平衡。口令文件管理同 restic。

清理、校验与恢复：

```bash
sudo -E borg prune --keep-daily 7 --keep-weekly 4 --keep-monthly 6
sudo -E borg check --verify-data
sudo mkdir -p /tmp/borg-restore
cd /tmp/borg-restore
sudo -E borg extract ::srv-share-2026-01-01
ls -R /tmp/borg-restore
```

restic 与 Borg 二选一即可：需要 S3 后端优先 restic，追求本地仓库去重性能优先 Borg。

### 3.6 定时自动化：systemd timer

以 restic 每日凌晨 3 点备份为例，写服务单元与定时器单元。先备份同名旧单元（若存在），再新建以下两个文件。

服务单元 `/etc/systemd/system/restic-backup.service` 完整内容：

```ini
[Unit]
Description=Restic backup for share and etc
After=network-online.target mnt-backup.mount
Wants=network-online.target

[Service]
Type=oneshot
User=root
Environment=RESTIC_REPOSITORY=/mnt/backup/restic-repo
Environment=RESTIC_PASSWORD_FILE=/etc/restic-password.txt
ExecStartPre=/usr/bin/test -f /srv/share/.backup-source-ok
ExecStart=/usr/bin/restic backup /srv/share /etc
ExecStart=/usr/bin/restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
ExecStartPost=/usr/bin/restic check --read-data-subset=10%
```

定时器单元 `/etc/systemd/system/restic-backup.timer` 完整内容：

```ini
[Unit]
Description=Run restic backup daily

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
```

逐项讲解：`ExecStartPre` 检查源标记文件，防止空目录误备份；最后一步 `check --read-data-subset=10%` 每次抽查一成数据，滚动覆盖全量校验；`OnCalendar` 为每天 3 点，`RandomizedDelaySec=600` 随机延迟最多 600 秒避免多台机器同时压垮备份目标；`Persistent=true` 表示关机错过的任务会在下次开机补跑。启用并验证：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now restic-backup.timer
sudo systemctl list-timers restic-backup.timer
sudo systemctl start restic-backup.service
sudo journalctl -u restic-backup.service -n 100 --no-pager
```

用 rsync 或 Borg 定时备份时结构相同，只替换服务单元中的 `ExecStart` 命令行即可，不要另起一套 cron 与 systemd 混用的双轨配置。

## 四、效果验证与测试

监测验证：

```bash
sudo smartctl -H /dev/sdX
sudo systemctl is-active smartmontools.service
sudo smartctl -l selftest /dev/sdX
```

期望输出示例：

```text
SMART overall-health self-assessment test result: PASSED
active
Num  Test_Description    Status                  Remaining  LifeTime(hours)
# 1  Short offline       Completed without error       00%      12345
```

备份验证的核心是恢复演练，每月至少做一次并记录结果。完整演练流程：

```bash
sudo -E restic snapshots
sudo -E restic restore latest --target /tmp/restore-drill
sudo diff -r /srv/share /tmp/restore-drill/srv/share
sudo -E restic check
df -h /mnt/backup
```

期望结果：`diff -r` 无输出表示恢复内容与源一致；`restic check` 显示 `no errors were found`。Borg 用 `borg extract` 后同样比对。rsync 验证：

```bash
sudo rsync -avhn --delete /srv/share/ /mnt/backup/share/
```

预演模式下若输出为空，说明两端完全一致；有差异列表则说明上次同步后源端又有变动，属正常现象，据此判断同步是否跟得上变化节奏。

## 五、常见错误与排坑指南

场景一：`smartctl` 对 USB 移动硬盘或 RAID 卡后的盘报错。原文片段：

```text
/dev/sdX: Unknown USB bridge [0x1234:0x5678 (0x100)]
Please specify device type with the -d option.
```

原因是 USB 桥接芯片或阵列卡屏蔽了 SMART 直通。修复是按设备类型显式指定参数，常见 SAT 桥接用 `-d sat`，阵列卡后单盘需查厂商文档对应参数：

```bash
sudo smartctl -d sat -a /dev/sdX
sudo smartctl -d auto -a /dev/sdX
```

仍读不到时，换到主板原生 SATA 口直连再测，不要据此断定盘已损坏。

场景二：restic 备份报仓库被锁。原文片段：

```text
unable to create lock in backend: repository is already locked by PID 1234 on server by root
```

原因是上次进程被强杀遗留过期锁。确认无 restic 进程运行后解锁：

```bash
ps aux | grep restic
sudo -E restic unlock
sudo -E restic snapshots
```

场景三：Borg 恢复时报口令或密钥错误。原文片段：

```text
borgbackup: error: Passphrase supplied in BORG_PASSPHRASE/BORG_PASSCOMMAND is incorrect.
```

原因是密码文件被改动、环境变量在 `sudo` 后丢失，或换了仓库却沿用旧口令。修复顺序：确认 `sudo -E` 保留了环境变量，直接用 `cat` 检查密码文件权限与内容是否与记录一致（只在本地终端查看，不外传），再用 `sudo -E borg list` 做最小验证。根治办法是把密钥导出与口令记录纳入离线保管清单，命令为：

```bash
sudo -E borg key export /mnt/backup/borg-repo /root/borg-key-export.txt
sudo chmod 600 /root/borg-key-export.txt
```

该文件等同于仓库钥匙，只能离线保存。

## 六、生产环境最佳实践与安全建议

第一，遵循 3-2-1 原则：至少 3 份副本、2 种介质、1 份异地或离线。勒索软件能加密在线挂载的备份，仓库应有至少一份平时不挂载的拷贝。

第二，监测闭环到人。SMART 告警、备份失败、校验失败必须有接收人与处理时限。每周人工看一眼最新快照时间戳，确认定时任务没有静默失效。

第三，密码与密钥管理。仓库口令用独立强口令，存入离线密码管理器；密码文件权限一律 600、属主 root；成员变动时轮换口令。

第四，保留与容量。保留周期按业务定，不要无限保留撑爆备份盘，也不要只留 1 天。备份目标设 80% 预警，`prune` 与备份任务串联执行。

第五，恢复演练制度化。每季度指定一个历史快照计时恢复并校验，把耗时与问题写进记录。备份可信度只来自成功的恢复次数，不来自任务列表里的绿色对勾。
