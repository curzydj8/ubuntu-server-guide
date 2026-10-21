---
description: "硬件健康检查：用 SMART 与 NVMe 日志预判磁盘寿命，用 rasdaemon 盯 ECC 纠错，用 lm-sensors 看温度，把 RAID 降级与换盘串成巡检线。"
---

# 硬件健康检查：磁盘、内存与温度

## 一、概述与使用场景

本章是「文档核对」级别的手册，内容按各工具上游文档与手册页核对整理，适配 Ubuntu 22.04 LTS 与 24.04 LTS；Ubuntu 26.04 标注为「待核验」。

硬件很少毫无征兆地损坏：机械盘坏之前重映射扇区往往已增长数周，NVMe 寿命耗尽前 `percentage_used` 一路爬升，ECC 内存老化前可纠正错误计数先抬头，风扇停转先表现为温度上行。问题是这些信号默认没人看。本章把磁盘、内存、温度、阵列四类信号收成一条巡检线，最后落到预警阈值与换盘衔接。分工上，[04-backup](04-backup.md) 已讲 SMART 入门查询与备份工具链，本章深入属性判读与定时监控；ZFS 的 scrub 见 [02-zfs-btrfs](02-zfs-btrfs.md)。不巡检的代价很直接：坏盘从「有预警」拖成「丢数据」。

## 二、环境准备与前置条件

操作账号需要 `sudo` 权限。先盘点硬件并安装工具，记录每块盘的设备名与序列号，后续设备名都以这份清单为准：

```bash
cat /etc/os-release
lsblk -d -o NAME,SIZE,MODEL,SERIAL,TRAN
sudo apt update
sudo apt install -y smartmontools nvme-cli lm-sensors rasdaemon mdadm
```

各包用途：`smartmontools` 提供 `smartctl` 与 `smartd`；`nvme-cli` 提供 `nvme` 读 NVMe 健康日志；`lm-sensors` 提供 `sensors` 读温度与转速；`rasdaemon` 提供 `ras-mc-ctl` 查 ECC 计数；`mdadm` 管理软 RAID。

备份说明：本章绝大多数命令只读；但改 `smartd` 配置前必须先备份原文件，换盘类操作更要先备份并验证可恢复，见 3.7 节。另注意：虚拟机的虚拟磁盘通常不透传 SMART、ECC 与温度传感器，查询报错不代表宿主机硬件有问题，本章面向物理服务器。

```bash
sudo cp /etc/smartd.conf /etc/smartd.conf.bak-2026-01-01
sudo cp /etc/default/smartmontools /etc/default/smartmontools.bak-2026-01-01
```

## 三、手把手操作步骤

### 3.1 SMART 判读：先看总评，再盯关键属性

```bash
sudo smartctl -H /dev/sdX
sudo smartctl -a /dev/sdX
```

`smartctl -H` 给一行总评：`PASSED` 表示固件尚未判定濒临损坏，`FAILED` 表示盘已不可靠，立即备份换盘。总评通过不等于健康，很多盘总评仍为 `PASSED` 时坏扇区已开始增长，必须再看属性表以下四项的 `RAW_VALUE` 列：

| 属性 | 含义 | 处置 |
| --- | --- | --- |
| `Reallocated_Sector_Ct` | 已重映射扇区数，坏扇区被备用扇区顶替 | 大于 0 即记录对比，持续增长则备份后换盘 |
| `Current_Pending_Sector` | 待处理扇区数，读写不稳、等待判定 | 大于 0 先备份，再跑长自检，仍不归零按坏盘处理 |
| `Offline_Uncorrectable` | 脱机扫描发现的不可纠正错误数 | 大于 0 为高危，优先抢备数据 |
| `UDMA_CRC_Error_Count` | 数据线或接口传输的 CRC 校验错误 | 增长多半是线缆问题，先换线换口复测 |

判读要点：看原始值不看归一化分数，`VALUE` 列的 100 分最容易误导人；看趋势不看单点，巡检时把四项记进台账；SSD 应改看 3.2 节的 NVMe 指标。主动自检分短测（约数分钟）与长测（大容量盘可能数小时，安排在低峰），日志显示 `Completed without error` 才算通过：

```bash
sudo smartctl -t short /dev/sdX
sudo smartctl -t long /dev/sdX
sudo smartctl -l selftest /dev/sdX
```

### 3.2 NVMe 健康日志：没有 SMART 属性表

NVMe 盘不提供 SATA 那套编号属性表，它的健康信息是一份结构固定的健康日志，字段名完全不同，不要在 NVMe 输出里找 `Reallocated_Sector_Ct`。用 `nvme-cli` 读取：

```bash
sudo nvme smart-log /dev/nvme0
```

| 字段 | 含义 | 处置 |
| --- | --- | --- |
| `critical_warning` | 严重警告位汇总，非 0 表示备用空间不足等严重状态 | 非 0 立即处理，先备份再定位 |
| `percentage_used` | 厂商估算的寿命已用百分比，可超过 100 | 超过 80 列入换盘计划，超过 90 尽快换 |
| `media_errors` | 介质与数据完整性错误计数 | 应为 0，非 0 且增长则备份换盘 |
| `temperature` | 复合温度 | 长期高于 70 摄氏度先改善风道，高温触发降速 |
| `unsafe_shutdowns` | 非正常断电次数 | 偶发可忽略，持续增长提示供电有问题 |

再记两个字段：`available_spare` 跌向 `available_spare_threshold`（常见 10%）说明备用块将耗尽；`power_on_hours` 配合断电次数能判断异常断电是集中爆发还是长期累积。

### 3.3 定时监控：smartd 配置与邮件告警

手动查询只覆盖一瞬间，生产环境靠 `smartd` 持续巡检告警。编辑 `/etc/smartd.conf`，注释原有生效行，写入一行完整配置：

```ini
DEVICESCAN -a -o on -S on -s (S/../.././02|L/../01/./03) -m opsadmin@example.com -M test
```

逐项讲解：`DEVICESCAN` 自动扫描全部磁盘，后面的参数对所有盘生效；`-a` 开启全部监测项；`-o on` 与 `-S on` 开启脱机自动测试与属性自动保存；`-s (S/../.././02|L/../01/./03)` 是自检计划，每天 2 点短测、每月 1 日 3 点长测；`-m opsadmin@example.com` 是告警收件人；`-M test` 是测试模式，每次启动都强制发一封测试信，验证后必须删掉。

!!! warning "测试发信的前提是本机能发邮件"

    `smartd` 依赖本机邮件通道（如 postfix）投递，没有可用发送服务时配置无误也收不到信。先用 `echo test-body | mail -s test-subject opsadmin@example.com` 自测通道（`mail` 由 `mailutils` 或 `bsd-mailx` 提供），能收到再配 smartd；暂无邮件通道的机器，至少保证告警进日志并被监控。

删掉 `-M test` 后启用并验证，日志出现 `Monitoring N ATA/SATA, N SCSI/SAS and N NVMe devices` 且 N 与实际盘数对得上才算真纳管。配置改坏时用第二节备份覆盖再重启即回滚：

```bash
sudo systemctl enable --now smartmontools.service
sudo journalctl -u smartmontools.service -n 50 --no-pager
```

### 3.4 内存与 ECC：纠错计数怎么读

ECC 计数分两类：CE（可纠正错误）偶发不致命但趋势重要，UE（不可纠正错误）会导致进程被杀或宕机。先确认 ECC 是否生效，再看计数：

```bash
sudo dmidecode -t memory | grep -E "Error Correction Type|Locator:"
sudo systemctl enable --now rasdaemon.service
sudo ras-mc-ctl --error-count
sudo ras-mc-ctl --summary
```

判读：`Error Correction Type` 显示 `Multi-bit ECC` 或 `Single-bit ECC` 才说明 ECC 在工作，显示 `None` 则本机没有 ECC；`--error-count` 按内存条列出 CE 与 UE，健康应全为 0；`--summary` 汇总 rasdaemon 记录的历史事件。不装 rasdaemon 也可直接读 EDAC 的 sysfs 计数（`/sys/devices/system/edac/mc/mc*/ce_count` 与 `ue_count`）并检索内核日志：

```bash
sudo dmesg -T | grep -E "EDAC|Hardware Error|Machine Check"
```

| 现象 | 含义 | 处置 |
| --- | --- | --- |
| 偶发 CE，个位数且不增长 | 一次性软错误 | 记录在案，周巡检对比 |
| 同一条 DIMM 的 CE 持续增长 | 该内存条或插槽正在劣化 | 停机窗口内换槽定位，再更换 |
| 出现 UE 或 `Hardware Error` | 不可纠正错误，数据完整性已受威胁 | 保存日志，停机更换 |
| EDAC 未加载、sysfs 为空 | 平台不受 EDAC 支持，属监测盲区 | 改看 BMC 带外日志，台账注明无数据 |

非 ECC 内存没有计数可看，怀疑不稳定时只能停机离线检测：用 Memtest86+ 从启动介质引导后全量跑数轮，无错误才算排除嫌疑（概念级说明）。在线测内存脚本测不到系统已占用的区域，结论不可信。

### 3.5 温度：传感器读取与高温处置

```bash
sudo sensors-detect
sensors
```

`sensors-detect` 逐项询问是否探测各类总线，一般一路接受默认的 `YES`，但注意：它会加载探测用内核模块，极少数老主板探测时可能挂起，生产机应在维护窗口执行；探测后确认把模块写入 `/etc/modules` 并重启，`sensors` 才有完整输出。输出重点看两行：`Package id 0: +62.0°C (high = +80.0°C, crit = +100.0°C)` 是 CPU 封装温度与高温、临界阈值，轻载应在 30 至 55 摄氏度，满载短时 80 摄氏度以下可接受，贴近 `crit` 说明散热失效；NVMe 的 `Composite` 长期超过 70 摄氏度会触发降速。风扇转速 0 RPM 是风扇停转的直接证据。

持续高温的处置顺序要固定，不要一上来就拆机：

1. 看负载。确认高温是否真实满载造成，空载仍高温才继续。
2. 查风扇与风道。核对转速，清灰、整理挡风线缆；多台同时升温必然是机柜或空调问题。
3. 动硬件。前两步无异常再考虑硅脂老化或散热器松动，停机处理并记录。

### 3.6 RAID 状态：md 与 ZFS 分开看

```bash
cat /proc/mdstat
sudo mdadm --detail /dev/md0
```

`/proc/mdstat` 健康标志是每组盘齐全，如 `[UU]`；出现 `[U_]` 或 `[_U]` 表示有盘掉线、阵列降级（degraded），此时无冗余，再坏一块就丢数据，按故障立即处理；重建中显示进度与剩余分钟数（finish）。`mdadm --detail` 看 `State`：`clean` 正常，`clean, degraded` 降级可运行，带 `(F)` 的是已判坏的盘。降级告警不要靠人工发现：在 `/etc/mdadm/mdadm.conf` 配置 `MAILADDR opsadmin@example.com` 后阵列事件会发信告警。ZFS 不看 `/proc/mdstat`，池健康看 `zpool status` 的 `state` 与错误计数列，细节回链 [02-zfs-btrfs](02-zfs-btrfs.md)。

### 3.7 寿命预警阈值与换盘衔接

把判读收成阈值表写进巡检制度，数值为通用起点，可按厂商规格收紧，不要放宽：

| 对象 | 关注线 | 行动线 | 动作 |
| --- | --- | --- | --- |
| SATA 盘扇区指标 | 重映射或待处理大于 0 | 连续两次巡检增长，或不可纠正错误大于 0 | 备份后换盘 |
| NVMe 寿命 | `percentage_used` 超过 80 | 超过 90 或月增幅异常 | 列入计划或立即换 |
| NVMe 介质错误 | `media_errors` 大于 0 | 持续增长 | 备份后换盘 |
| ECC 内存 | 同条 DIMM 的 CE 周增超过 10 | UE 大于 0 | 定位并更换 |
| 温度 | 持续高于 75 摄氏度 | 贴近临界阈值或风扇 0 转 | 按 3.5 处置 |
| 阵列 | 出现降级 | 降级且无热备接管 | 立即补盘重建 |

!!! danger "先确认备份可恢复，再动盘"

    换盘、重建阵列、换内存之前必须先确认：最近一份备份存在且做过恢复验证，只看到「备份任务成功」不算数，方法见 [04-backup](04-backup.md)；整机级故障或阵列多盘异常时，先按 [灾难恢复与系统迁移](../08-troubleshooting/05-disaster-recovery-migration.md) 评估是否整体迁移。确认不了备份可用就停手，先补备份再排窗口。回滚要求：旧盘至少保留到新盘重建完成且数据抽查无误再处置；重建失败时立刻停写、保留旧盘原样求助，不要初始化旧盘。

## 四、效果验证与测试

```bash
sudo smartctl -H /dev/sdX
sudo nvme smart-log /dev/nvme0
sudo systemctl is-active smartmontools.service
sudo ras-mc-ctl --error-count
sensors
cat /proc/mdstat
```

| 检查项 | 期望结果 | 不符合时说明 |
| --- | --- | --- |
| `smartctl -H` | `PASSED` | `FAILED` 即按坏盘处理 |
| NVMe 健康日志 | `critical_warning` 与 `media_errors` 为 0，`percentage_used` 低于 80 | 任一越线按 3.7 动作 |
| smartmontools 服务 | `active` 且测试邮件已收到 | 收不到信先查邮件通道 |
| ECC 计数 | 各 DIMM 的 CE 与 UE 全为 0 | 按 3.4 判读表处理 |
| 温度 | 空载 CPU 低于 55 摄氏度，NVMe 低于 70 摄氏度 | 按 3.5 排查 |
| 阵列 | `[UU]` 全齐或 ZFS 池 `ONLINE` | 降级即故障 |

再补一次自检闭环：短测后用 `sudo smartctl -l selftest /dev/sdX` 确认日志新增一条 `Completed without error`。

## 五、常见错误与排坑指南

场景一：`smartctl` 报 `Unknown USB bridge` 读不到盘。根因是盘接在 USB 转接盒、扩展卡或 RAID 卡后，桥接芯片没有透传 SMART。修复是显式指定设备类型重试，常见 SAT 桥接用 `sudo smartctl -d sat -a /dev/sdX`，阵列卡后单盘查厂商手册的透传参数，不要猜；仍读不到就换主板原生接口直连再测。

场景二：`smartd` 在跑却从没收到告警或测试信。排查顺序：确认配置留着 `-M test` 并重启服务强制发信；用 `mail` 命令自测邮件通道，不通先修 postfix 或中继；再看服务日志有无投递失败记录。最常见根因是机器没配邮件发送服务。

场景三：NVMe 盘找不到熟悉的 SMART 属性，脚本按 SATA 属性名解析报错。根因是 NVMe 没有编号属性表。修复是脚本按盘类型分流（用 `lsblk -d -o NAME,TRAN` 区分），NVMe 改解析健康日志固定字段，并优先用 JSON 输出（`--output-format=json`）。

场景四：ECC 计数全是空，误以为内存百分百健康。根因有二：一是装的本就是非 ECC 内存，纠错类型为 `None`；二是平台 EDAC 驱动不受当前内核支持。修复是先用 `dmidecode` 定性再查驱动状态，属监测盲区的改用 BMC 带外日志补位，报告只能写「无监测数据」。

场景五：`sensors` 输出缺失大半，或某温度高得离谱（如 127 摄氏度）。根因多为传感器驱动未加载完，或未接传感器的通道被误读。修复是重跑 `sensors-detect` 并确认模块写入 `/etc/modules` 后重启，再与带外读数交叉验证。

场景六：`/proc/mdstat` 显示阵列在 resync、业务变慢，误以为又坏盘。根因是换盘或异常断电后阵列在同步数据以恢复冗余，属正常过程。修复是不干预，等 `finish` 走完再复查；要警惕重建反复中断，提示其他盘也有问题，应停机逐盘做 SMART 长测。

## 六、生产环境最佳实践与安全建议

第一，巡检节奏固定化。SMART 与 NVMe 数值每周采集入台账，ECC 计数与温度每月复盘趋势，阵列状态纳入每日自动检查。

第二，告警闭环到人。邮件告警与日志监控至少留一条可用通道，每季度用 `-M test` 做一次告警演练，确认信能到、有人看。

第三，备件与窗口提前准备。高频机型常备同容量或更大的替换盘与内存条，预警触发时不等采购；换盘重建安排在低峰。

第四，阈值只收紧不放宽。盘出现过一次不可纠正错误或 UE 后，同批次其他盘同步提高巡检频率。

第五，处置全程留痕。记录发现时间、指标数值、处置动作与更换件序列号；旧盘消磁或物理销毁后再寄修。
