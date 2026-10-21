---
description: "备份做对了，误删、勒索、磁盘损坏都只是工单；做错了，平时定时任务全绿，出事时才发现文件恢复不了、缺存储过程、或只备到三天前。"
---

# MySQL 备份、定时与还原演练

## 一、概述与使用场景

备份做对了，误删、勒索、磁盘损坏都只是工单；做错了，平时定时任务全绿，出事时才发现文件恢复不了、缺存储过程、或只备到三天前。本章给出可直接落地的方案：`mysqldump` 全量备份讲清参数；备份脚本带压缩、日期命名与 7 天清理；systemd service 加 timer 定时；binlog 增量补齐全量空窗并完整演练「全量恢复 + 按时间点重放」；最后是校验与保留策略。验收标准只有一句：最近一次把备份恢复到临时实例并查到正确数据，是什么时候。没有这个答案，备份体系就不算建成。

适用场景：单机日常备份、容灾基线、误删后的时间点恢复。数百 GB 级大实例应评估物理备份，本章逻辑备份适合中小数据量与跨版本恢复。

## 二、环境准备与前置条件（Ubuntu 22.04/24.04 LTS、权限、依赖包）

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Ubuntu Server 22.04 / 24.04 LTS | MySQL 8.0 或 MariaDB 运行正常，已完成第 11.1～11.3 章 |
| 备份账号 | `backupuser`，权限见第 11.2 章 3.3 节 | 禁止用 `root` 跑定时备份，账号泄露时只暴露只读能力 |
| 备份目录 | `/backup/mysql`，独立磁盘或至少独立分区优先 | 与数据目录同盘时，磁盘损坏会备份与数据一起丢 |
| binlog | 已开启并确认文件名与位置 | 时间点恢复的前提，未开启则只能恢复到最近一次全量 |
| 工具 | `mysqldump`、`mysqlbinlog`、`gzip`、systemd | 均为系统或 MySQL 客户端自带，无需额外安装 |

先确认 binlog 状态与备份目录，并给目录收紧权限（备份文件含全量数据，权限等同于数据库本身）：

```bash
sudo mysql -u root -e "SHOW VARIABLES LIKE 'log_bin';"
sudo mysql -u root -e "SHOW BINARY LOGS;"
sudo mysql -u root -e "SHOW MASTER STATUS;"
sudo mkdir -p /backup/mysql
sudo chown ubuntu:ubuntu /backup/mysql
sudo chmod 700 /backup/mysql
df -h /backup/mysql
```

若 `log_bin` 为 `OFF`，先备份配置再开启。主配置文件 `/etc/mysql/mysql.conf.d/mysqld.cnf` 的备份与修改：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
```

在 `[mysqld]` 段确认或补上（`server-id` 单机可写 1，主从环境必须全局唯一）：

```ini
server-id = 1
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
sync_binlog = 1
binlog_expire_logs_seconds = 604800
```

`binlog_expire_logs_seconds = 604800` 即保留 7 天，与本章全量保留周期对齐；保留太短会出现「全量还在、中间 binlog 已过期删掉」导致无法时间点恢复。改完重启并复查 `SHOW MASTER STATUS` 有输出才继续。

!!! warning "备份目录不要只放本机"
    本机备份只能防误删与误改，防不了整机损坏与勒索。脚本跑通后必须再加一步异地同步（对象存储或另一台主机），同步目标与保留周期写进第六节的策略表。本章聚焦本机备份与恢复的正确性，异地同步按你选用的存储在脚本后追加即可，但不能省略。

## 三、手把手操作步骤（完整命令可复制；配置文件给完整路径；改任何配置前先给 cp 备份命令；关键参数逐行/表格讲解；禁止出现「...」省略与「自行配置」「略」字样）

### 3.1 mysqldump 全量备份：参数逐个讲

手动先跑通一次，再写脚本。完整命令：

```bash
mysqldump -u backupuser -p --single-transaction --routines --events --triggers --all-databases --set-gtid-purged=OFF > /backup/mysql/manual-$(date +%F-%H%M).sql
ls -lh /backup/mysql/
head -n 30 /backup/mysql/manual-*.sql
```

各参数讲解：

| 参数 | 作用 | 不加的后果 |
| --- | --- | --- |
| `--single-transaction` | 在一个事务快照内导出 InnoDB 表，不锁表、不阻塞业务写入 | 导出期间数据不一致，或改用锁表导致业务卡住 |
| `--routines` | 一并导出存储过程与函数 | 恢复后应用调用存储过程时报不存在 |
| `--events` | 一并导出事件调度器里的定时事件 | 恢复后库内定时任务 silently 消失 |
| `--triggers` | 导出触发器（默认通常包含，显式写明更稳妥） | 恢复后依赖触发器的逻辑失效 |
| `--all-databases` | 导出全部库（含 `mysql` 系统库的账号信息） | 只备业务库时，灾后还要手工重建全部账号 |
| `--set-gtid-purged=OFF` | 不在导出文件里写入 GTID 重置语句 | 恢复到临时实例验证时可能因 GTID 语句冲突失败 |

按单库备份时把 `--all-databases` 换成库名即可，例如 `mysqldump -u backupuser -p --single-transaction --routines --events appdb > /backup/mysql/appdb.sql`。注意口令不要直接写在命令行参数里（会被进程列表看到），用交互输入或权限为 `600` 的选项文件。选项文件示例 `/home/ubuntu/.my.cnf`（改前如已存在先备份）：

```bash
cp /home/ubuntu/.my.cnf /home/ubuntu/.my.cnf.bak.$(date +%F-%H%M)
chmod 600 /home/ubuntu/.my.cnf
```

```ini
[client]
user = backupuser
password = <password>
```

密码占位替换为真实备份账号口令后，该文件只能本人可读，后续脚本即可免交互运行。

### 3.2 备份 Shell 脚本：压缩、日期命名、保留 7 天

脚本路径定为 `/usr/local/bin/mysql-backup.sh`，创建前如有同名旧脚本先备份：

```bash
sudo cp /usr/local/bin/mysql-backup.sh /usr/local/bin/mysql-backup.sh.bak.$(date +%F-%H%M)
```

脚本完整内容：

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backup/mysql"
DATE_TAG="$(date +%F-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/mysql-full-${DATE_TAG}.sql.gz"
LOG_FILE="/var/log/mysql-backup.log"

echo "[$(date '+%F %T')] start backup: ${BACKUP_FILE}" >> "${LOG_FILE}"

mysqldump --single-transaction --routines --events --triggers --all-databases --set-gtid-purged=OFF | gzip > "${BACKUP_FILE}.tmp"
mv "${BACKUP_FILE}.tmp" "${BACKUP_FILE}"

gzip -t "${BACKUP_FILE}"
ls -lh "${BACKUP_FILE}" >> "${LOG_FILE}"

find "${BACKUP_DIR}" -name 'mysql-full-*.sql.gz' -type f -mtime +6 -delete
echo "[$(date '+%F %T')] backup done" >> "${LOG_FILE}"
```

讲解：`set -euo pipefail` 让任一步失败即整体退出，避免空包冒充成功；先写 `.tmp` 再改名，保证正式文件一定写完整；`gzip -t` 校验压缩完整性；`find -mtime +6 -delete` 实现约 7 天滚动清理，只匹配本脚本前缀。赋权并手工验收：

```bash
sudo chmod 700 /usr/local/bin/mysql-backup.sh
sudo touch /var/log/mysql-backup.log
sudo chown ubuntu:ubuntu /var/log/mysql-backup.log
/usr/local/bin/mysql-backup.sh
echo $?
ls -lh /backup/mysql/
cat /var/log/mysql-backup.log
```

退出码为 `0` 且目录出现带当天日期的 `.sql.gz` 文件才算通过。脚本用当前用户家目录下的 `.my.cnf` 读账号，因此手工与定时执行的用户必须一致（见 3.3）。

### 3.3 systemd service + timer 定时自动化

Service 文件 `/etc/systemd/system/mysql-backup.service`：

```ini
[Unit]
Description=MySQL full backup by mysqldump
After=mysql.service network.target

[Service]
Type=oneshot
User=ubuntu
ExecStart=/usr/local/bin/mysql-backup.sh

[Install]
WantedBy=multi-user.target
```

`User=ubuntu` 必须与持有 `.my.cnf` 的用户一致，否则定时运行时读不到口令。Timer 文件 `/etc/systemd/system/mysql-backup.timer`，设为每天凌晨 02:30 执行（避开业务高峰，按你的低峰修改时间即可，格式照抄）：

```ini
[Unit]
Description=Run MySQL backup daily

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
Unit=mysql-backup.service

[Install]
WantedBy=timers.target
```

`Persistent=true` 表示关机错过后开机补跑，不会因为一次维护就丢一整天的备份。启用并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mysql-backup.timer
sudo systemctl list-timers mysql-backup.timer --no-pager
sudo systemctl start mysql-backup.service
sudo systemctl status mysql-backup.service --no-pager
sudo journalctl -u mysql-backup.service -n 50 --no-pager
```

### 3.4 binlog 增量与按时间点恢复：完整演练

全量解决「回到昨晚」，binlog 解决「回到事故前一分钟」：全量恢复后重放备份之后到事故之前的事件即可。演练请在测试实例上完整做一遍，不要等出事时第一次操作。

第一步，记录全量备份对应的 binlog 位点。规范做法是全量导出时同时记录位点，重新用带位点的命令做一份演练备份：

```bash
mysqldump --single-transaction --routines --events --triggers --all-databases --master-data=2 --set-gtid-purged=OFF | gzip > /backup/mysql/pitr-full.sql.gz
zcat /backup/mysql/pitr-full.sql.gz | grep -m 1 "CHANGE MASTER TO"
```

输出中会给出类似 `MASTER_LOG_FILE='mysql-bin.000123'` 与 `MASTER_LOG_POS=4567` 的位点，记入演练记录。`--master-data=2` 是把位点以注释形式写进文件，恢复时不会自动乱改主从配置，适合本章的手工重放流程。

第二步，模拟事故：全量之后写入一条要保留的数据，再误删一张表，并记下误删的准确时间：

```sql
INSERT INTO appdb.t_demo (id, note) VALUES (99, 'keep-me');
SELECT NOW();
DROP TABLE appdb.t_demo;
```

第三步，恢复全量（先停应用写入；生产目标应是新实例，切勿对在服务的库直接灌全量）：

```bash
gunzip -c /backup/mysql/pitr-full.sql.gz | mysql -u root -p
sudo mysql -u root -e "SHOW TABLES FROM appdb;"
```

第四步，用 `mysqlbinlog` 把位点之后、误删之前的事件重放。先只解析不执行，确认截止时间写法，并定位误删语句的位置：

```bash
sudo mysqlbinlog --start-log-pos=4567 /var/log/mysql/mysql-bin.000123 > /tmp/replay.sql
grep -n "DROP TABLE" /tmp/replay.sql
```

位点数字按第一步记录替换。按时间点截断重放（把时间替换为误删前一分钟，格式照此写全）：

```bash
sudo mysqlbinlog --start-log-pos=4567 --stop-datetime="2026-10-21 10:15:00" /var/log/mysql/mysql-bin.000123 | mysql -u root -p
```

同一分钟内分不开时改用 `--stop-position` 按 `end_log_pos` 精确截断。第五步验证：表已回来、`id=99` 在、误删后数据不在，才算成功：

```sql
SELECT * FROM appdb.t_demo WHERE id = 99;
SHOW TABLES FROM appdb;
```

!!! danger "恢复操作的硬性纪律"
    任何真实恢复前，先对现状再做一份全量备份（哪怕现状已损坏），保留回退与事后取证的可能；恢复目标优先选新实例，验证数据无误后再切换应用连接。直接往生产库灌备份属于不可逆操作，没有「现状已另存」这一前提就禁止执行。

### 3.5 备份校验：恢复到临时实例验证

每周至少把最近一份全量导入一台常备验证机并抽查行数与当天数据：

```bash
gunzip -c /backup/mysql/mysql-full-2026-10-21-023000.sql.gz | mysql -h 198.51.100.20 -u root -p
mysql -h 198.51.100.20 -u root -p -e "SELECT COUNT(*) FROM appdb.t_demo;"
```

示例主机 `198.51.100.20` 替换为你的实际验证机。校验至少包括：解压完整、导入无报错、核心表行数对得上、随机抽一条当天数据能查到。结果记入运维日志，连续失败必须告警，不要等季度演练才发现备份已坏一个月。

## 四、效果验证与测试（检查命令 + 期望输出示例）

```bash
# 1. 定时器已启用且有下次运行时间
sudo systemctl is-enabled mysql-backup.timer
sudo systemctl list-timers mysql-backup.timer --no-pager

# 2. 手动触发后备份文件存在、大小合理、可通过完整性校验
sudo systemctl start mysql-backup.service
ls -lh /backup/mysql/
gzip -t /backup/mysql/mysql-full-*.sql.gz && echo GZIP_OK

# 3. 备份文件内容抽查：应能看到建库与建表语句
zcat /backup/mysql/mysql-full-*.sql.gz | grep -m 3 "CREATE TABLE"
```

期望：`list-timers` 显示次日 02:30 触发；`oneshot` 跑完显示 inactive 是正常；日志出现 `backup done`。恢复验证以 3.4 第五步为准。再查留存，确认 7 天清理没误伤：

```bash
ls -1 /backup/mysql/ | sort
sudo journalctl -u mysql-backup.service --since "7 days ago" --no-pager | grep -c "backup done"
```

近 7 天完成次数应与天数一致，缺哪天就查哪天日志。

## 五、常见错误与排坑指南（2~3 个真实报错场景：报错原文片段+原因+修复命令；含本简报点名的经典报错）

### 场景一：备份账号权限不足，导出中途失败

报错原文：

```text
mysqldump: Got error: 1044: Access denied for user 'backupuser'@'localhost' to database 'appdb' when using LOCK TABLES
mysqldump: Got error: 1142: SELECT, LOCK TABLES command denied to user 'backupuser'@'localhost'
```

原因：用了默认导出方式触发锁表，但备份账号没有 `LOCK TABLES` 权限；或账号连 `SELECT` 都不全。修复：导出统一带 `--single-transaction`（InnoDB 不需要锁表），并按第 11.2 章给备份账号补齐只读类权限后重跑：

```bash
mysqldump --single-transaction --routines --events --triggers --all-databases > /backup/mysql/retry-$(date +%F-%H%M).sql
sudo mysql -u root -e "SHOW GRANTS FOR 'backupuser'@'localhost';"
```

### 场景二：定时任务不执行或执行了却没文件

报错原文片段：

```text
mysql-backup.service: Main process exited, code=exited, status=203/EXEC
Failed to start MySQL full backup by mysqldump.
```

原因：脚本无执行权限、Timer 没启用、或 `User` 与 `.my.cnf` 所有者不一致读不到口令。排查：

```bash
ls -l /usr/local/bin/mysql-backup.sh
sudo systemctl status mysql-backup.timer --no-pager
sudo journalctl -u mysql-backup.service -n 100 --no-pager
sudo -u ubuntu /usr/local/bin/mysql-backup.sh; echo $?
```

手工能跑通、定时跑不通，问题就在单元文件的用户与环境上。

### 场景三：恢复时报错或恢复后缺存储过程

报错原文：

```text
ERROR 1146 (42S02) at line 1234: Table 'appdb.t_demo' doesn't exist
ERROR 1305 (42000): PROCEDURE appdb.p_demo does not exist
```

原因分两类：导入报错多为文件损坏、权限不足或版本差异；缺过程则是导出漏了 `--routines` 与 `--events`。先校验文件再重导：

```bash
gzip -t /backup/mysql/mysql-full-2026-10-21-023000.sql.gz && echo FILE_OK
zcat /backup/mysql/mysql-full-2026-10-21-023000.sql.gz | grep -c "CREATE.*PROCEDURE"
mysql -u root -p < /backup/mysql/retry.sql
```

脚本缺参数时修正后重做全量，旧的不完整备份标记作废。

## 六、生产环境最佳实践与安全建议

保留策略按下表执行，并根据数据增长每季度复核一次容量：

| 层级 | 内容 | 保留 | 存储位置 | 说明 |
| --- | --- | --- | --- | --- |
| 每日全量 | `mysqldump` 全库 | 7 天 | 本机 `/backup/mysql` 加异地同步一份 | 本章脚本默认实现 |
| 每周全量 | 周日的那份日备单独归档 | 4 周 | 异地或对象存储 | 防「问题一周后才发现」 |
| 每月全量 | 月初的那份周备单独归档 | 6 个月 | 异地或对象存储 | 合规与审计需要时再拉长 |
| binlog | 增量日志 | 7 天 | 与全量同周期 | 短于全量周期会断时间点恢复链 |

其余纪律：第一，备份账号只读、口令独立，备份目录权限收紧，异地副本必须存在并同样抽检，同机同盘不算容灾。第二，演练制度化：每月导入校验、每季度完整时间点恢复演练并记录耗时，该耗时就是承诺恢复时间的真实依据。第三，监控新鲜度：最近成功备份超过 26 小时直接告警，任务绿色不能替代产物检查。第四，改参数、换账号、迁目录后立即手工跑一次加导入验证。下一部分用同样标准讲 PostgreSQL、Redis、MongoDB 与高可用。
