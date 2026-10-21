---
description: "容量规划与日志治理解决的是一个慢性问题：磁盘不会在某一天突然变满，而是被业务增长和日志堆积一天天吃掉，等告警响起时往往已经影响业务。"
---

# 容量规划与日志治理

## 一、概述与使用场景

容量规划与日志治理解决的是一个慢性问题：磁盘不会在某一天突然变满，而是被业务增长和日志堆积一天天吃掉。容量规划负责回答：现在用了多少、按什么速度在涨、还剩多少天可用。日志治理负责给日志量设上限：系统日志由 journald 管总量，应用日志由 logrotate 管轮转，两者缺一，根分区被日志打满只是时间问题。

典型场景有四类：例行巡检时按月看使用率与增长率、提前安排扩容；上线前评估新服务每天产生多少日志、要留多少天；预算与采购时以容量基线谈云盘、快照与流量成本；故障预防上，大量服务器故障的根因不是代码，而是日志写满根分区后数据库无法落盘，全站跟着停摆。

本章定位是单机层面的容量与日志治理：即时判读回链本部分第 1 章[命令行即时监控工具](01-cli-tools.md)，长期曲线与告警仍由第 2 章 Prometheus 体系负责；多机集中收集见本部分第 3 章[集中式日志收集](03-logging-stack.md)，本章只管本地的量与保留。本章为文档核对级别：命令与配置项已按官方手册核对，期望输出为典型形态。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。Ubuntu 26.04 的默认策略待核验。
- 权限：可使用 sudo 的账号，多数 du 与 journalctl 命令需要 sudo。
- 对象：示例主机名为 app-01，示例业务服务名为 example-svc，日志目录为 /var/log/example-svc。

改任何配置之前先备份，本章涉及的配置文件与配置目录，备份命令如下：

```bash
sudo cp /etc/systemd/journald.conf "/etc/systemd/journald.conf.bak-$(date +%F)"
sudo cp /etc/logrotate.conf "/etc/logrotate.conf.bak-$(date +%F)"
sudo cp -a /etc/logrotate.d "/etc/logrotate.d.bak-$(date +%F)"
ls -l "/etc/systemd/journald.conf.bak-$(date +%F)" "/etc/logrotate.conf.bak-$(date +%F)"
```

再确认 journald 当前的生效配置全貌，包括可能存在的 drop-in 覆盖文件：

```bash
systemd-analyze cat-config systemd/journald.conf
ls -l /etc/systemd/journald.conf.d/ 2>/dev/null || echo "无 drop-in 目录"
df -h
free -h
```

`systemd-analyze cat-config` 会按优先级打印主文件与所有 drop-in 的合并视图，第五节 journald 不生效的排坑第一步就用它确认改动有没有被 drop-in 盖掉。

## 三、手把手操作步骤

### 3.1 采集容量现状：先有一张基线表

容量规划的第一步不是预测，而是把现状量准：

```bash
df -h
df -i
sudo du -xh --max-depth=1 / 2>/dev/null | sort -h
sudo du -sh /var/log /var/lib /home /opt 2>/dev/null
free -h
```

逐条讲解：`df -h` 看每个文件系统的总量与使用率，先锁定最紧张的分区；`df -i` 看 inode 使用率，海量小文件时空间没满 inode 先满，症状一样，不要漏查；`du -xh --max-depth=1 /` 只在根分区内统计一层目录并排序，`-x` 保证不跨挂载点。即时 IO 与内存压力判读不在本章重复，`iostat -x 1 3` 与 `vmstat 1 5` 的方法见本部分第 1 章。基线结果整理成表，每次巡检续行：

| 记录项 | 示例值 | 采集命令 | 说明 |
| --- | --- | --- | --- |
| 根分区使用率 | 62% | df -h / | 本章阈值分级以此为准 |
| /var/log 总量 | 8.4 GB | sudo du -sh /var/log | 日志治理的主要对象 |
| journal 占用 | 1.2 GB | journalctl --disk-usage | 与 journald 上限对照 |

### 3.2 用历史记录看增长率：定期留痕加简单外推

单次快照只能告诉你现在满不满，判断还剩多少天必须有历史序列。最轻量的做法是写一个小脚本，每天把 df 的关键行追加到一个 CSV 文件。脚本路径为 /usr/local/bin/capacity-snapshot.sh，完整内容如下：

```bash
#!/bin/bash
set -euo pipefail
LOG_DIR="/var/log/capacity"
LOG_FILE="${LOG_DIR}/df-history.csv"
sudo mkdir -p "${LOG_DIR}"
DATE_STR="$(date '+%F')"
df -P / | tail -n 1 | awk -v d="${DATE_STR}" '{printf "%s,%s,%.1f,%.1f,%.1f,%s\n", d, $1, $2/1024/1024, $3/1024/1024, $4/1024/1024, $5}' | sudo tee -a "${LOG_FILE}" > /dev/null
```

逐行讲解：`set -euo pipefail` 让脚本遇错即停；`df -P` 强制每条记录一行输出，防止长设备名换行把 CSV 写乱；awk 把 1K 块数换算成 GB 并拼上日期。挂到每天执行一次，crontab 行如下：

```text
15 3 * * * root /usr/local/bin/capacity-snapshot.sh
```

积累三十天后做线性外推。假设根分区总量 100 GB，三十天前已用 50 GB，今天已用 62 GB：日均增长为 12 GB 除以 30 天，约每天 0.4 GB；按 3.3 节的 85% 处置线算，剩余增量为 23 GB，预计约 57 天后到达。用 awk 一行算清：

```bash
awk 'BEGIN { total=100; ago=50; now=62; days=30; rate=(now-ago)/days; remain=(total*0.85-now)/rate; printf "日均增长 %.2f GB，到达 85 线约 %.0f 天\n", rate, remain }'
```

必须同时讲清线性外推的局限：它假设增速恒定，而真实增长常有台阶，一次上线、活动导流或新日志源接入都会让曲线跳一档；日志量与业务量挂钩，用淡季数据外推旺季必然低估；它只看总量不看结构，总量还剩一半时失控的单文件一夜也能打满。因此外推只用于安排采购与扩容的提前量，不能代替阈值告警，两件事都要做。

### 3.3 阈值分级与扩容提前量

把使用率分成三档，每档绑定明确动作，不要只设一个 90% 才响的告警：

| 使用率 | 级别 | 动作 | 时限 |
| --- | --- | --- | --- |
| 达到 70% | 预警 | 纳入容量周报，按 3.2 节算到达 85% 的天数 | 例行处理 |
| 达到 85% | 处置 | 执行扩容或清理，复核日志保留策略 | 一周内完成 |
| 达到 95% | 紧急 | 立即止血：清过期日志、暂停非必要写入 | 当天处理 |

提前量要单独强调：扩容涉及采购审批、变更窗口、数据迁移时周期常以周计。反着算：预计到达 85% 的天数减去流程所需天数，剩下的才是真正的缓冲。外推显示 57 天到达处置线、流程需要 20 天，就必须在 37 天内启动。inode 使用率同样套用这三档。

### 3.4 云成本意识：看不见的账单项

容量也是成本问题，云环境有三个常见盲区。第一是出网流量：日志、备份跨地域或出公网时，按流量计费的部分往往比云盘还贵，集中收集前先算每天多少 GB、走内网还是公网。第二是快照与镜像留存：快照按占用持续计费，写了保留不删就逐月扣费，给快照定份数与到期删除和给日志定保留是同一件事。第三是资源限额缺失：单个服务不设上限，一次异常就能拖垮同机其他服务；设 CPU、内存与句柄上限见第 07 部分[systemd 服务工程化与配置漂移检测](../07-automation/04-systemd-engineering-drift.md)的资源限制一节。结论：每一类持续增长的东西，都要同时定容量上限、保留周期和账单归属。

### 3.5 日志量治理：先量后治

动保留策略之前，先量出日志由谁产生、占多少：

```bash
journalctl --disk-usage
sudo du -xh --max-depth=1 /var/log 2>/dev/null | sort -h
ls -lhS /var/log/example-svc/ | head -n 20
```

判读方法：`journalctl --disk-usage` 给出 journal 总占用，超限先治 journald；du 排序后最大的目录是第一目标；`ls -lhS` 揪出没有轮转、一直在长的单文件。治理顺序固定：先给 journald 设上限，再给文件日志配 logrotate，最后才考虑缩短保留。不要一上来就删日志：上限与轮转没配好，下个月还会再满。

!!! danger "清理日志前先确认没有正在排查的故障"
    日志是故障与安全事件的第一证据。磁盘告急时先把待删日志打包转移到其他分区或对象存储，再删本地文件；正在进行的入侵排查、事故复盘涉及时间段的日志一律不删。

### 3.6 给 journald 设上限

journald 的总量由 /etc/systemd/journald.conf 的 [Journal] 段控制。备份已在第二节完成，写入下面这份完整配置，数值按根分区 100 GB、保留两周给出，套用时按分区大小等比调整：

```ini
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=2G
SystemKeepFree=5G
MaxRetentionSec=14day
```

逐行讲解：

| 配置项 | 含义 | 本例取值说明 |
| --- | --- | --- |
| Storage | 日志落盘方式 | persistent 表示写入 /var/log/journal 持久保存 |
| Compress | 是否压缩归档日志对象 | yes 为默认值，保持开启可明显降低占用 |
| SystemMaxUse | journal 总量硬上限 | 2G，到顶后自动删最旧的归档文件 |
| SystemKeepFree | 文件系统至少保留的空闲空间 | 5G，空闲低于此值时优先删 journal 保命 |
| MaxRetentionSec | 条目最长保留时间 | 14day，超期条目在轮转与清理时删除，0 表示不按时间限制 |

改完必须重启服务才生效，并立即核对：

```bash
sudo systemctl restart systemd-journald
journalctl --disk-usage
systemd-analyze cat-config systemd/journald.conf
```

注意区分两个容易混淆的动作。改配置加重启，是给今后定规矩，journald 按新上限持续回收。`journalctl --vacuum-size` 与 `--vacuum-time` 是一次性手动清理，只对已归档文件生效，正在写入的活动文件不动：

```bash
journalctl --vacuum-size=1G
journalctl --vacuum-time=14day
journalctl --disk-usage
```

第一条把归档日志清到总量 1 GB 以内，第二条删 14 天以前的归档日志。只跑 vacuum 不改配置，日志还会按老速度涨回来；只改配置不跑 vacuum，存量要等后续轮转逐步回收，磁盘告急时等不起，两个动作按场景配合。

### 3.7 logrotate：读懂默认策略并为自有服务新增规则

文件类日志靠 logrotate 轮转。全局默认在 /etc/logrotate.conf，各软件包的规则在 /etc/logrotate.d/ 目录。先摸清现状再加自己的规则：

```bash
grep -E "^(weekly|daily|rotate|compress|dateext)" /etc/logrotate.conf
ls -l /etc/logrotate.d/
```

判读全局文件重点看四项：轮转周期 weekly 还是 daily、保留份数 rotate、是否 compress、日期后缀 dateext 是否开启。Ubuntu 22.04 与 24.04 的默认全局策略为每周轮转、保留 4 份、默认不压缩（以注释行存在）。若 /etc/logrotate.d/ 里还没有自有服务的规则，新增 /etc/logrotate.d/example-svc，完整内容如下：

```text
/var/log/example-svc/*.log {
    daily
    rotate 14
    maxage 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su appuser appuser
}
```

逐行讲解：daily 为每天轮转一次，高流量服务不要用 weekly；rotate 14 保留 14 个轮转文件；maxage 30 表示文件最长留 30 天，份数与天数先到为准；compress 为轮转后压缩，文本日志压缩比高建议开启；delaycompress 延迟一轮再压缩，最近一份不压缩便于直接查看，代价是多占一份空间；missingok 表示日志不存在不报错；notifempty 表示空文件不轮转，避免产生空历史文件；su 指定轮转执行用户，目录属主不是 root 时必须写明，否则 logrotate 拒绝执行。

copytruncate 与 create 的取舍是本节重点。copytruncate 把日志复制一份做历史、再把原文件截断为零，服务握着的老句柄继续有效，代价是复制与截断之间新写入的少量日志可能丢失。create 模式把旧文件改名归档、按指定权限新建空文件，无丢失窗口，但服务必须重开日志句柄，否则会继续往已改名的旧文件写，表现为新文件一直是空的。不支持重开句柄的服务只能用 copytruncate；支持的优先用 create 加 postrotate 通知，变体如下：

```text
/var/log/example-svc/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    create 0640 appuser appuser
    sharedscripts
    postrotate
        systemctl reload example-svc > /dev/null 2>&1 || true
    endscript
}
```

postrotate 在轮转后执行 reload 让服务重开日志文件；sharedscripts 表示一组文件只执行一次 postrotate。reload 失败被 `|| true` 兜住避免轮转整体报错，但要定期确认它真的成功。新规则先用调试模式验一遍，再等定时任务自然执行：

```bash
sudo logrotate -d /etc/logrotate.d/example-svc 2>&1 | head -n 60
systemctl list-timers logrotate.timer --no-pager
```

`-d` 是调试模式，只打印将要执行的动作，不真的轮转；输出里看 considering log 与 rotating pattern，确认周期、份数与归档路径符合预期。Ubuntu 上 logrotate 由 systemd timer 每日触发。

!!! danger "logrotate -f 强制执行要慎用"
    `sudo logrotate -f /etc/logrotate.d/example-svc` 会无视周期立刻轮转并改写状态文件，可能把正在排查的当前日志切进归档、打乱轮转节奏，还会掩盖周期配错的问题。只在新规则已通过 `-d` 确认需立刻验证，或磁盘告急需立即归档时用，执行前先备份状态文件 /var/lib/logrotate/status。

### 3.8 远程集中收集与日志脱敏

本地治理解决量的问题，多机查询与留存靠集中收集：本机 journald 与 logrotate 负责让本地磁盘不失控，本部分第 3 章[集中式日志收集](03-logging-stack.md)负责汇聚到中心端统一检索与归档，本章不重复中心端部署。本地保留可因此更短，本机只留最近数天供断网应急。

脱敏必须在日志产生与收集的入口做。规范有三条。第一，绝不落日志：账号密码、会话令牌与 API 密钥、身份证号与银行卡号、短信验证码，应用打日志前应过滤或掩码，例如只记令牌前四位。第二，传输与存储按敏感数据对待：集中端限制查询权限，日志备份的保留不要长于日志本身。第三，定期自查存量：

```bash
sudo grep -R -E -i "password=|passwd=|api_key|secret=|authorization:" /var/log/example-svc/ | head -n 20
sudo grep -R -E "[0-9]{17}[0-9Xx]" /var/log/example-svc/ | head -n 20
```

第一条搜密钥与口令字段，第二条用身份证号位数特征粗筛。自查只能发现格式规整的泄露，所以顺序不能反：源头不落盘是主线，自查只是兜底。

## 四、效果验证与测试

第一步验证 journald 新上限已生效：

```bash
systemd-analyze cat-config systemd/journald.conf
journalctl --disk-usage
```

期望 cat-config 输出里能看到 SystemMaxUse 等行且未被 drop-in 覆盖，disk-usage 应不高于上限附近；存量刚超限时允许短时偏高，以复查时持续下降为准。

第二步验证 logrotate 规则可解析并按计划执行：

```bash
sudo logrotate -d /etc/logrotate.d/example-svc 2>&1 | grep -E "considering log|rotating pattern|log needs rotating"
systemctl list-timers logrotate.timer --no-pager
ls -lh /var/log/example-svc/
```

期望每个日志文件都出现 considering log 一行；等一次自然轮转后，目录里出现带后缀的历史文件且份数不超 rotate。

第三步验证容量记录在持续积累：`cat /var/log/capacity/df-history.csv` 应每天新增一行、日期连续无缺漏，`crontab -l` 里能查到定时行。

## 五、常见错误与排坑指南

### 5.1 日志把根分区打满，服务大面积异常

场景：根分区 100%，数据库报无法写入，多个服务同时异常。根因通常是日志源失控增长且无轮转无上限，或集中收集中断后本地日志无限堆积。止血顺序如下，先留证据再删数据：

```bash
df -h
sudo du -xh --max-depth=1 /var/log 2>/dev/null | sort -h
journalctl --vacuum-size=200M
sudo logrotate -f /etc/logrotate.d/example-svc
df -h
```

先用 du 定位大头，再用 vacuum 与强制轮转回收空间；涉事日志先打包到其他有空间的分区留存再清理。删完 df 仍显示满时，多半是已删除文件仍被进程占用，用 `sudo lsof +L1 /` 找出并重启对应服务释放。完整处置见第 08 部分[磁盘空间耗尽排查](../08-troubleshooting/03-disk-full.md)；止血后必须回到 3.6 与 3.7 节补上上限与轮转，否则必然复发。

### 5.2 logrotate 配了规则但日志从不轮转

场景：规则已写好，几天后日志仍只有一个且持续变大。根因按频率排查：一是状态文件机制，logrotate 靠 /var/lib/logrotate/status 记录上次时间，新规则首次执行只登记不轮转，要等满一个周期；二是路径通配符写错，规则没匹配到文件；三是缺 su 指令，目录属主非 root 时直接跳过并报错。修复方法：

```bash
sudo logrotate -d /etc/logrotate.d/example-svc 2>&1 | head -n 80
cat /var/lib/logrotate/status | grep example-svc
ls -ld /var/log/example-svc
```

调试输出会直说每个文件为什么不轮转：log does not need rotating 表示周期未到，属于正常；报 parent directory has insecure permissions 时补上 su 行。改完再跑一次 `-d` 确认，不要直接 `-f` 验证以免打乱状态记录。

### 5.3 日志被重复轮转或同一天切出多份

场景：历史日志一天出现两三份，序号混乱。根因多为规则重复定义：同一路径被全局段、软件包规则和自加规则中的两处匹配，logrotate 会报 duplicate log entry，或在两份规则周期不同时表现为切得过频。修复方法：

```bash
sudo grep -R "example-svc" /etc/logrotate.conf /etc/logrotate.d/
sudo logrotate -d /etc/logrotate.conf 2>&1 | grep -i "duplicate"
```

确认重复后只保留 /etc/logrotate.d/ 下自有服务这一处规则，再用 `-d` 全量调试确认 duplicate 提示消失。

### 5.4 journald 改了配置但上限不生效

场景：SystemMaxUse 已改小，journal 仍涨超上限。根因有三种。一是只存文件没重启服务，journald 在启动时读配置。二是 drop-in 覆盖：/etc/systemd/journald.conf.d/ 下的同名项优先级高于主文件，云镜像与加固脚本常预置。三是改错位置，写进注释行或 [Journal] 段之外。修复顺序：

```bash
systemd-analyze cat-config systemd/journald.conf
ls -l /etc/systemd/journald.conf.d/
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

cat-config 按加载顺序打印全部来源，对照看生效值出自哪个文件；发现 drop-in 覆盖时改 drop-in 或删掉它，不要在主文件里对冲。

### 5.5 回滚：配置改错后的恢复步骤

场景：改完 journald 或 logrotate 后日志行为异常，要退回改动前状态：

```bash
ls -l /etc/systemd/journald.conf.bak-* /etc/logrotate.conf.bak-*
sudo cp "/etc/systemd/journald.conf.bak-2026-01-01" /etc/systemd/journald.conf
sudo cp "/etc/logrotate.conf.bak-2026-01-01" /etc/logrotate.conf
sudo systemctl restart systemd-journald
sudo logrotate -d /etc/logrotate.conf 2>&1 | head -n 20
```

先列出第二节备份的实际文件名，示例日期后缀按你的备份替换。journald 恢复后必须重启服务才算回滚完成；logrotate 无常驻服务，恢复后跑 `-d` 确认即可。自加规则回滚时用 `sudo mv /etc/logrotate.d/example-svc /root/example-svc.disabled` 把文件移出规则目录，即停止生效。

## 六、生产环境最佳实践与安全建议

第一，容量基线纳入例行制度。每月做一次基线采集与外推复算，把到达 85% 的预计日期写进运维记录；预计日期小于六十天时立刻启动扩容，让提前量始终大于采购与变更周期。

第二，日志分级保留。排障日志本机留数天、中心端留两周左右，审计类日志按合规要求单独归档并设更长周期。两类日志共用一套策略是最常见的浪费与风险来源，先分类再定天数。

第三，上限先行于上线。新服务接入前先回答：日志写到哪、每天多少量、谁负责轮转与上限。答不齐不上线，把日志治理做成发布检查项。

第四，手工清理留痕。手工执行的 `journalctl --vacuum` 与 `logrotate -f` 都记录时间、原因与执行人，这类命令会真实删数据，复盘时必须能回答日志为什么少了一段。

第五，脱敏与权限双管。日志目录默认只给服务账号与运维组读，集中端查询账号按最小权限分配；应用新增日志输出时评审一遍，确认没有带进敏感字段。

!!! tip "治理的目标是可预测"
    容量规划做得好不好，看一句话能不能回答：这台机器的磁盘还够用多少天、哪天之前必须完成扩容。基线表、外推记录与三档阈值齐备时，这个问题随时能答。
