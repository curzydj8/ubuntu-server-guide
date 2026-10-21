---
description: "systemd 是 Ubuntu 22.04 和 24.04 的默认初始化系统。除了开机启动管理，它还能托管常驻服务、统一收集日志、管理定时任务。"
---

# Systemd 服务编写与定时任务

## 一、概述与使用场景

systemd 是 Ubuntu 22.04 和 24.04 的默认初始化系统。除了开机启动管理，它还能托管常驻服务、统一收集日志、管理定时任务。把自研脚本和应用交给 systemd 管理后，启动、停止、重启、开机自启、异常拉起、日志查看全部收敛到 systemctl 和 journalctl 两套命令上，不再需要每种程序学一套管理方式。

典型场景包括：把上一章写好的巡检、备份、证书检查脚本设为定时任务，用 Timer 替代零散的 Cron 条目；把自研的小工具、接口服务注册为系统服务，实现开机自启和崩溃自动重启；给服务加资源限制和权限收紧，降低单个服务异常时对整机的影响。

继续只用 Cron 和手工 nohup 的瓶颈很现实。Cron 的问题是任务散落在多个用户的 crontab 里难以盘点、没有统一日志、错过执行时间不会补跑、并发和随机延迟全靠自己在脚本里硬写。nohup 手工拉起的进程则没有自启、没有状态、机器重启就消失，出了问题只能靠翻进程列表猜。systemd 的 Service 加 Timer 正好把这些缺口逐个补上，这也是本章把两者放在一起讲的原因：Timer 负责按时触发，Service 负责把任务可靠地执行并记录全过程。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 和 Ubuntu 24.04 LTS，默认初始化系统即为 systemd，无需额外安装。操作需要 sudo 权限，示例使用 ubuntu 用户。被托管的脚本沿用上一章约定，放在 /opt/ops/scripts 目录，日志统一进 journald，无需自己再管日志文件。

开始前先熟悉当前系统的基本状态：

```bash
systemctl --version
systemctl list-units --type=service --state=running
systemctl list-timers --all
sudo apt update
sudo apt install -y systemd
```

最后一行在绝大多数机器上会提示已经是最新版本，写在这里是为了保证个别精简镜像缺组件时能补齐。还要确认系统时间与时区正确，定时任务完全依赖系统时钟，时区错了所有 OnCalendar 都会按错误时间触发：

```bash
timedatectl status
date
```

!!! note "用户级与系统级单元的区别"

    本章写的是系统级单元，文件放在 /etc/systemd/system 目录，需要 sudo 才能管理，对全部用户生效，适合服务器上的运维任务。还有一种用户级单元放在 ~/.config/systemd/user 目录，只归某个用户管理，第 05 部分 Podman 的 Quadlet 用的就是用户级。两者文件格式相同，不要放混目录，放错位置的单元不会被加载，且报错信息不直观。

## 三、手把手操作步骤

### 3.1 Service 单元逐行讲解

先以巡检脚本为例写一个最基础的 Service 单元。系统级单元目录里如已有同名文件，先备份再覆盖：

```bash
sudo cp /etc/systemd/system/health-check.service /etc/systemd/system/health-check.service.bak 2>/dev/null || echo "无旧单元，跳过备份"
sudo nano /etc/systemd/system/health-check.service
```

文件完整内容如下：

```ini
[Unit]
Description=Daily host health check
Documentation=file:///opt/ops/scripts/health_check.sh
After=network.target
Wants=network.target

[Service]
Type=oneshot
ExecStart=/opt/ops/scripts/health_check.sh
User=root
Group=root
WorkingDirectory=/opt/ops/scripts
StandardOutput=journal
StandardError=journal
SyslogIdentifier=health-check

[Install]
WantedBy=multi-user.target
```

逐行讲解每一项的含义：

| 配置行 | 含义 |
| --- | --- |
| Description | 服务描述，显示在 status 输出里，写清用途方便盘点 |
| Documentation | 文档或脚本位置提示，可选但建议保留 |
| After=network.target | 声明在本服务在网络就绪之后启动，只管顺序不管依赖 |
| Wants=network.target | 弱依赖，目标不存在或失败也不阻止本服务启动 |
| Type=oneshot | 一次性任务型，命令执行完即结束，定时脚本必须用这个类型 |
| ExecStart | 真正执行的命令，必须写绝对路径，不能写相对路径 |
| User 和 Group | 运行身份，能不用 root 的服务不要用 root |
| WorkingDirectory | 工作目录，脚本里用相对路径读写文件时以此为准 |
| StandardOutput=journal | 标准输出接入 journald，统一用 journalctl 查看 |
| SyslogIdentifier | 日志标签，按此标签过滤本服务日志 |
| WantedBy=multi-user.target | enable 后在多用户模式下被拉起，服务类单元的标准写法 |

Type 是新手最容易选错的一项。常驻进程型服务用默认的 simple，命令跑完就退出的任务型用 oneshot。巡检、备份这类脚本如果误写成 simple 配合 Timer 触发，会出现状态判断混乱。写完单元后加载并手工运行一次：

```bash
sudo systemctl daemon-reload
sudo systemctl start health-check.service
sudo systemctl status health-check.service --no-pager
journalctl -u health-check.service -n 50 --no-pager
```

oneshot 服务 start 后状态显示 inactive 且括号里带 dead 是正常现象，表示任务已经执行完毕，不是故障。判断成功与否看 status 里的执行结果和日志内容，以及下面这条命令的退出状态记录：

```bash
systemctl show health-check.service -p ExecMainStatus
```

输出为 ExecMainStatus=0 表示上一次执行成功。

### 3.2 服务加固选项

systemd 自带一组沙箱和限权选项，不用改代码就能提升服务安全性。在 Service 段内追加以下完整配置段，追加前先按 3.1 的方法备份单元文件，追加后必须 daemon-reload 并重启服务验证还能正常运行：

```ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/ops /srv/backup
CapabilityBoundingSet=
MemoryMax=512M
CPUQuota=50%
```

逐项说明：NoNewPrivileges 禁止进程通过提权程序获得新权限；PrivateTmp 给服务独立的临时目录，互不干扰；ProtectSystem=strict 把整个文件系统设为只读，仅 ReadWritePaths 列出的目录可写，这是最强的一项，也最容易让老脚本因为写不进目录而报错，加固时务必把脚本要写的日志和产物目录完整列进 ReadWritePaths；ProtectHome 让服务看不到用户主目录；CapabilityBoundingSet 留空表示清空全部能力集，普通脚本不需要任何特殊能力；MemoryMax 和 CPUQuota 做资源上限，防止脚本失控吃光整机资源。查看当前服务实际生效的加固评分可用：

```bash
systemd-analyze security health-check.service
```

!!! warning "加固要一次加一项验证一项"

    沙箱选项一次全加上然后服务起不来，你很难判断是哪一项的锅。正确顺序是每次只加一到两项，daemon-reload 后启动服务并查看日志，确认正常再继续。报错里出现 Read-only file system 字样，基本就是 ProtectSystem 与 ReadWritePaths 没配对好，对照脚本实际写入路径补全即可。

### 3.3 Timer 单元与 OnCalendar 语法

Timer 单元与同名 Service 单元配套，文件名主体必须一致，例如 health-check.timer 对应 health-check.service。创建 Timer 文件：

```bash
sudo cp /etc/systemd/system/health-check.timer /etc/systemd/system/health-check.timer.bak 2>/dev/null || echo "无旧单元，跳过备份"
sudo nano /etc/systemd/system/health-check.timer
```

完整内容如下，表示每天凌晨两点半执行巡检，带随机延迟和错过补跑：

```ini
[Unit]
Description=Run health check daily

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=600
Persistent=true
Unit=health-check.service

[Install]
WantedBy=timers.target
```

逐行讲解：OnCalendar 是日历触发表达式；RandomizedDelaySec=600 表示在预定时间基础上随机推迟 0 到 600 秒，多台机器同一时间执行时用它错峰，避免同时压垮被检查的共享服务；Persistent=true 表示如果预定时间错过了，例如机器当时关机，下次开机后立即补跑一次，备份和巡检这类不能漏的任务必须开启；Unit 指定要激活的服务，同名时可以不写，写出来更清晰；Timer 的 Install 段固定写 WantedBy=timers.target，与 Service 的 multi-user.target 不要混用。

OnCalendar 语法格式为星期、年、月、日、时、分、秒，星号表示任意值。常用表达式对照表如下：

| 需求 | OnCalendar 写法 |
| --- | --- |
| 每小时整点 | *-*-**:00:00 |
| 每天凌晨两点 | *-*-* 02:00:00 |
| 每天凌晨两点半 | *-*-* 02:30:00 |
| 每周一凌晨三点 | Mon *-*-* 03:00:00 |
| 每月一号凌晨一点 | *-*-01 01:00:00 |
| 每五分钟一次 | *-*-**:0/5:00 |
| 工作日上午九点 | Mon..Fri *-*-* 09:00:00 |

写完表达式不要凭感觉，先用工具验证下一次触发时间是否符合预期：

```bash
systemd-analyze calendar "*-*-* 02:30:00"
systemd-analyze calendar "Mon..Fri *-*-* 09:00:00"
```

除了日历触发，还有相对时间触发的写法，例如 OnBootSec=15min 表示开机十五分钟后执行，OnUnitActiveSec=1h 表示上次执行后隔一小时再执行，两者可写在同一个 Timer 里组合使用。启用 Timer 的标准命令如下，注意 enable 的对象是 timer 不是 service：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now health-check.timer
systemctl list-timers --all
systemctl status health-check.timer --no-pager
```

### 3.4 Timer 替代 Cron 对比

把存量 Cron 迁移过来之前，先看清两者差异，决定哪些任务值得迁：

| 对比项 | Cron | systemd Timer |
| --- | --- | --- |
| 配置位置 | 各用户 crontab，分散 | 统一单元文件，可盘点可版本管理 |
| 日志 | 默认无，需自己重定向 | 自动进 journald，按单元过滤 |
| 错过补跑 | 不支持 | Persistent 支持 |
| 随机延迟 | 不支持，靠脚本内 sleep | RandomizedDelaySec 原生支持 |
| 依赖管理 | 不支持 | 可声明网络等前置条件 |
| 并发控制 | 无 | 同一单元不会重叠触发 |
| 查看下次执行 | 无直接命令 | list-timers 一目了然 |
| 学习成本 | 低，语法简单 | 稍高，需要理解单元文件 |

迁移方法是一项一项对应：原来 crontab 里的每一行，拆成一个 Service 加一个 Timer。原 crontab 修改前先整表备份：

```bash
crontab -l > /tmp/crontab-backup.txt
cat /tmp/crontab-backup.txt
```

新 Timer 验证正常后，再把 crontab 里对应行注释掉观察一个周期，确认无误后才删除，不要新旧两套同时跑同一个任务。

### 3.5 用 journalctl 查日志

服务和定时任务的日志统一用 journalctl 按单元查看，常用命令如下：

```bash
journalctl -u health-check.service --no-pager
journalctl -u health-check.service --since today --no-pager
journalctl -u health-check.service --since "2026-10-20 00:00:00" --until "2026-10-21 00:00:00" --no-pager
journalctl -u health-check.service -f
journalctl -u health-check.timer --no-pager
journalctl --disk-usage
sudo journalctl --vacuum-time=30d
```

参数说明：-u 指定单元；--since 和 --until 圈定时间范围，排查定时任务必备；-f 是实时跟踪，调试时用；最后两条是查看和清理日志占用空间，vacuum-time 表示只保留最近天数内的日志，生产环境执行清理前先确认日志保留要求，审计类日志不要随意清。如果发现 journal 里根本没有历史日志，多半是日志没有持久化，检查并创建持久化目录后重启日志服务：

```bash
ls -ld /var/log/journal
sudo mkdir -p /var/log/journal
sudo systemctl restart systemd-journald
```

## 四、效果验证与测试

完整验证一遍定时链路：

```bash
systemctl list-timers --all | grep health
sudo systemctl start health-check.service
systemctl show health-check.service -p ExecMainStatus
journalctl -u health-check.service -n 20 --no-pager
systemd-analyze calendar "*-*-* 02:30:00"
```

期望结果：list-timers 输出里 health-check.timer 有明确的 NEXT 下次触发时间和 LAST 上次触发时间；手工 start 后 ExecMainStatus 为 0；日志里能看到巡检脚本的完整输出行；calendar 工具解析出的下一次时间与你预期的凌晨两点半在日期上吻合。再把 Timer 的 OnCalendar 临时改成一分钟后的时间做一次真实触发测试，确认到点自动执行后改回正式时间，不要拿生产时间表赌运气。

## 五、常见错误与排坑指南

场景一：单元文件改了但不生效。现象是修改了 ExecStart 后启动的仍是旧命令。原因是改完文件没有重载。修复命令：

```bash
sudo systemctl daemon-reload
sudo systemctl restart health-check.service
sudo systemctl cat health-check.service
```

cat 命令显示的应是磁盘上的最新内容。养成习惯：只要动过单元文件，第一条命令永远是 daemon-reload。

场景二：服务启动失败且日志提示找不到文件。报错原文片段如下：

```text
health-check.service: Failed at step EXEC spawning /opt/ops/scripts/health_check.sh: No such file or directory
```

原因通常是 ExecStart 路径写错，或脚本没有执行权限。排查与修复：

```bash
ls -l /opt/ops/scripts/health_check.sh
chmod 750 /opt/ops/scripts/health_check.sh
head -n 1 /opt/ops/scripts/health_check.sh
```

同时确认脚本第一行解释器写法正确，写错解释器路径也会报类似错误。

场景三：Timer 已启用但从不触发。list-timers 里 NEXT 一列为空。常见原因有两个：enable 的是 service 而不是 timer，或者 OnCalendar 表达式写错被解析成了过去时间。修复步骤：

```bash
systemctl is-enabled health-check.timer
systemctl list-timers --all
systemd-analyze calendar "*-*-* 02:30:00"
sudo systemctl enable --now health-check.timer
```

is-enabled 输出应为 enabled，calendar 验证能给出未来的 Next elapse 时间，两项都对了再等待一个触发周期观察日志。

## 六、生产环境最佳实践与安全建议

第一，单元文件纳入版本管理。/etc/systemd/system 下自建的单元文件定期同步到代码仓库，配合文件头注释写清用途和负责人。机器重建时按仓库版本恢复，不要靠记忆手写。

第二，运行身份最小化。能以普通服务账号运行的不要用 root，配合本章的加固选项一起用。确实需要 root 的任务，在单元注释里写明原因，纳入重点审计清单。

第三，关键定时任务全部开启 Persistent 和合适的随机延迟。备份、证书检查这类漏跑一次就可能出事故的任务必须补跑；多机同时间执行的任务必须错峰，延迟上限按业务容忍度设置并写进单元注释。

第四，失败要能被发现。oneshot 任务失败后状态不会常驻显示，生产环境要给关键服务加 OnFailure 告警单元或接入监控对 ExecMainStatus 做采集，不要默认没人报错就是正常。OnFailure 的写法是在 Service 的 Unit 段加一行 OnFailure=alert.service，其中 alert.service 是你预先写好的发信或推送单元，需要提前建好并测试通过。

第五，定期盘点。每月执行一次 systemctl list-timers --all 和 systemctl --failed，把无人认领的、长期失败的、已经下线业务残留的单元清理掉，清理前先 disable 再删文件并 daemon-reload，顺序不要反。

第六，改单元先备份的习惯保持不变。本章每个新建步骤都给了备份命令，线上变更时同样执行，并把变更时间、原因、回滚方法记到运维日志里，出问题时能按备份文件一键还原。
