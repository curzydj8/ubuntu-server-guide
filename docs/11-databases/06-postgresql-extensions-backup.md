---
description: "单机安装完成只是起点。生产 PostgreSQL 迟早遇到三类需求：第一类是能力扩展，如地理位置查询需要 PostGIS、时序数据需要 TimescaleDB；第二类是日常逻辑备份，出错时能快速导回单库或单表；"
---

# PostgreSQL 插件、备份与 PITR

## 一、概述与使用场景

单机安装完成只是起点。生产 PostgreSQL 迟早遇到三类需求：第一类是能力扩展，如地理位置查询需要 PostGIS、时序数据需要 TimescaleDB；第二类是日常逻辑备份，出错时能快速导回单库或单表；第三类是故障恢复，要求恢复到故障前任意时间点，即 PITR（Point-In-Time Recovery，时间点恢复）。

本章以 PostGIS 为详写对象给出完整安装与启用流程，TimescaleDB 给出简述路线；备份部分讲清 `pg_dump`、`pg_restore`、`pg_dumpall` 的分工；最后完整演练一次基于 WAL 归档加 `pg_basebackup` 的 PITR，并给出恢复验证步骤，做到备份闭环：能备份、能还原、能验证。

!!! warning "备份未经恢复验证等于没有备份"
    每一种备份上线后都必须在隔离环境做一次真实恢复并核对行数。只看备份命令退出码为 0，不代表文件可用。

## 二、环境准备与前置条件

系统为 Ubuntu 22.04/24.04 LTS，已按上一章通过 PGDG 源安装 PostgreSQL 16（示例版本，以 PGDG 当前提供为准），集群 `16/main` 处于 `online` 状态，示例数据库为 `appdb`、应用账号为 `appuser`。操作账号需 `sudo` 权限。PITR 演练需要额外磁盘空间：归档目录至少预留数据目录两倍容量，例如数据目录 20 GB，归档盘至少准备 40 GB。

```bash
pg_lsclusters
sudo -u postgres psql -c "SELECT version();"
df -h /var/lib/postgresql /var/log/postgresql
sudo apt update
```

## 三、手把手操作步骤

### 3.1 PostGIS 完整安装与启用（详写路线）

PostGIS 为 PostgreSQL 增加地理对象、空间索引和空间函数，适合门店选址、轨迹、电子围栏等场景。PGDG 源中 PostGIS 包名带主版本号，PostgreSQL 16 对应 `postgresql-16-postgis-3`：

改配置前备份习惯同样适用于装包前记录版本：

```bash
sudo apt install -y postgresql-16-postgis-3 postgresql-16-postgis-3-scripts
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS postgis_topology;"
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;"
```

!!! note "扩展是按库启用的"
    `CREATE EXTENSION` 只对当前连接的数据库生效。新建数据库不会自动继承，需要逐库执行，或先在模板库 `template1` 中启用，但生产环境不建议污染模板库。

验证查询：

```sql
SELECT postgis_full_version();
CREATE TABLE shops (id serial PRIMARY KEY, name text, geom geometry(Point, 4326));
CREATE INDEX shops_geom_idx ON shops USING GIST (geom);
INSERT INTO shops (name, geom) VALUES ('example-shop', ST_SetSRID(ST_MakePoint(116.40, 39.90), 4326));
SELECT id, name, ST_AsText(geom) FROM shops;
SELECT ST_Distance(ST_SetSRID(ST_MakePoint(116.40, 39.90), 4326)::geography, ST_SetSRID(ST_MakePoint(116.41, 39.91), 4326)::geography) AS distance_m;
```

`postgis_full_version()` 返回版本字符串、最后一条距离查询返回正数米数，即表示扩展、空间索引与函数全部可用。

### 3.2 TimescaleDB 简述路线

TimescaleDB 把普通表扩展为 hypertable，自动按时间分区，适合指标、物联网和行情数据。它与 PostGIS 二选一详写的原因是两者安装思路一致：装包、改 `shared_preload_libraries`、重启、建扩展。简述步骤如下：按 Timescale 官方文档为 Ubuntu 添加其软件源并安装与 PostgreSQL 大版本匹配的包（如 `timescaledb-2-postgresql-16`），备份配置后编辑主配置：

```bash
sudo cp /etc/postgresql/16/main/postgresql.conf /etc/postgresql/16/main/postgresql.conf.bak.$(date +%F)
sudo grep -n shared_preload_libraries /etc/postgresql/16/main/postgresql.conf
```

```ini
shared_preload_libraries = 'timescaledb'
```

```bash
sudo systemctl restart postgresql
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
sudo -u postgres psql -d appdb -c "CREATE TABLE metrics (ts timestamptz NOT NULL, device text, value double precision);"
sudo -u postgres psql -d appdb -c "SELECT create_hypertable('metrics', 'ts');"
```

具体源地址与包名以 TimescaleDB 官方文档当前说明为准，不要照抄旧博客的源配置。

### 3.3 pg_dump 与 pg_restore：逻辑备份恢复闭环

`pg_dump` 导出单个数据库的逻辑备份，可跨大版本恢复；`-Fc` 为自定义压缩格式，支持 `pg_restore` 选择性恢复与并行恢复，是生产首选格式。对比：纯 SQL 文本（`-Fp`）可读但恢复慢且不能选表；目录格式（`-Fd`）适合并行导出大库。

```bash
sudo mkdir -p /var/backups/postgresql
sudo chown postgres:postgres /var/backups/postgresql
sudo chmod 750 /var/backups/postgresql
sudo -u postgres pg_dump -Fc -d appdb -f /var/backups/postgresql/appdb_$(date +%F_%H%M).dump
sudo -u postgres pg_restore --list /var/backups/postgresql/appdb_$(date +%F_%H%M).dump | head -n 30
ls -lh /var/backups/postgresql/
```

常用参数逐项说明：

| 参数 | 含义 |
| --- | --- |
| `-Fc` | 自定义格式，压缩且支持选择性恢复 |
| `-d appdb` | 指定要备份的数据库 |
| `-f 文件` | 输出文件路径 |
| `-j 4` | 仅目录格式 `-Fd` 可用，表示 4 个并行导出任务 |
| `--no-owner` | 恢复到不同角色名的环境时忽略属主 |
| `-t public.orders` | 只备份指定表 |

恢复演练（恢复到新库验证，绝不直接覆盖生产库）：

```bash
sudo -u postgres createdb appdb_restore_test
sudo -u postgres pg_restore -d appdb_restore_test --no-owner /var/backups/postgresql/appdb_$(date +%F_%H%M).dump
sudo -u postgres psql -d appdb_restore_test -c "\dt"
sudo -u postgres psql -d appdb -c "SELECT count(*) FROM shops;"
sudo -u postgres psql -d appdb_restore_test -c "SELECT count(*) FROM shops;"
sudo -u postgres dropdb appdb_restore_test
```

两边行数一致才算备份有效。正式覆盖恢复时先重命名旧库保命，再恢复，不要先删库：

```bash
sudo -u postgres psql -c "ALTER DATABASE appdb RENAME TO appdb_old;"
sudo -u postgres createdb appdb
sudo -u postgres pg_restore -d appdb --no-owner /var/backups/postgresql/appdb_2026-01-01_0200.dump
```

### 3.4 pg_dumpall 的定位

`pg_dumpall` 导出整个集群的所有数据库，并包含角色、表空间等全局对象，适合整集群迁移或灾备基线；缺点是单文件大、不能像 `-Fc` 那样选表恢复，日常单库备份不要用它替代 `pg_dump`。

```bash
sudo -u postgres pg_dumpall -f /var/backups/postgresql/cluster_all_$(date +%F).sql
ls -lh /var/backups/postgresql/
sudo -u postgres psql -f /var/backups/postgresql/cluster_all_2026-01-01.sql postgres
```

第二条恢复命令仅在新建的空集群上执行验证，不要在已有数据的生产集群直接灌入。

### 3.5 PITR 完整演练：WAL 归档与基础备份

PITR 原理：先做一次物理基础备份，再持续归档 WAL（预写日志），恢复时回放 WAL 到指定时间点。三要素缺一不可：`archive_mode=on`、可用的 `archive_command`、成功的基础备份。

第一步，改配置前备份并创建归档目录：

```bash
sudo cp /etc/postgresql/16/main/postgresql.conf /etc/postgresql/16/main/postgresql.conf.bak.$(date +%F)
sudo mkdir -p /var/backups/postgresql/wal_archive
sudo chown postgres:postgres /var/backups/postgresql/wal_archive
sudo chmod 750 /var/backups/postgresql/wal_archive
```

第二步，编辑 `/etc/postgresql/16/main/postgresql.conf` 设置以下参数：

```ini
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/postgresql/wal_archive/%f && cp %p /var/backups/postgresql/wal_archive/%f'
archive_timeout = 300
max_wal_senders = 3
```

逐项讲解：`wal_level=replica` 保证 WAL 信息足够用于归档与复制；`archive_mode=on` 开启归档；`archive_command` 中 `%p` 是 WAL 文件相对路径、`%f` 是文件名，`test ! -f` 防止覆盖已归档文件，命令返回非 0 时 PostgreSQL 会重试并告警；`archive_timeout=300` 表示最多 300 秒强制切换一个 WAL 段，保证低写入时段的恢复点粒度不粗于 5 分钟；`max_wal_senders=3` 为后续流复制预留连接。

第三步，重启生效并验证（归档参数需重启，不是 reload）：

```bash
sudo systemctl restart postgresql
sudo -u postgres psql -c "SHOW archive_mode;"
sudo -u postgres psql -c "SHOW wal_level;"
sudo -u postgres psql -c "SELECT pg_switch_wal();"
ls -lh /var/backups/postgresql/wal_archive/
sudo -u postgres psql -c "SELECT * FROM pg_stat_archiver;"
```

`pg_stat_archiver` 中 `archived_count` 应增长且 `failed_count` 为 0，归档目录出现 24 位十六进制命名的 WAL 文件。

第四步，做基础备份：

```bash
sudo -u postgres pg_basebackup -D /var/backups/postgresql/base_$(date +%F_%H%M) -Ft -z -P -v
ls -lh /var/backups/postgresql/base_$(date +%F_%H%M)/
sudo -u postgres psql -c "SELECT pg_current_wal_lsn();"
```

`-Ft` 输出 tar 格式、`-z` 启用 gzip 压缩、`-P` 显示进度、`-v` 显示详情。备份目录中应包含 `base.tar.gz` 与 `pg_wal.tar.gz`。

第五步，模拟故障前写入标记数据，记录目标恢复时间：

```bash
sudo -u postgres psql -d appdb -c "CREATE TABLE IF NOT EXISTS pitr_marker (id serial PRIMARY KEY, note text, created_at timestamptz DEFAULT now());"
sudo -u postgres psql -d appdb -c "INSERT INTO pitr_marker (note) VALUES ('before-incident');"
date '+%F %T %z'
sudo -u postgres psql -d appdb -c "INSERT INTO pitr_marker (note) VALUES ('bad-write-to-rollback');"
```

### 3.6 PITR 恢复步骤

在独立目录恢复验证，不要直接动原数据目录。完整步骤：

```bash
sudo systemctl stop postgresql
sudo mkdir -p /tmp/pitr_restore
sudo tar -xzf /var/backups/postgresql/base_2026-01-01_0200/base.tar.gz -C /tmp/pitr_restore
sudo tar -xzf /var/backups/postgresql/base_2026-01-01_0200/pg_wal.tar.gz -C /tmp/pitr_restore/pg_wal
sudo chown -R postgres:postgres /tmp/pitr_restore
sudo chmod 700 /tmp/pitr_restore
```

在恢复目录的 `postgresql.auto.conf` 或主配置中写入恢复参数（示例恢复到标记写入之前的时间，把时间替换为你上一步记录的目标时间）：

```ini
restore_command = 'cp /var/backups/postgresql/wal_archive/%f %p'
recovery_target_time = '2026-01-01 02:10:00+08'
recovery_target_action = 'promote'
```

创建恢复信号文件并启动独立实例验证：

```bash
sudo -u postgres touch /tmp/pitr_restore/recovery.signal
ls -l /tmp/pitr_restore/recovery.signal
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pitr_restore -o "-p 5433 -k /tmp" -l /tmp/pitr_restore.log start
sudo tail -n 50 /tmp/pitr_restore.log
sudo -u postgres psql -p 5433 -h /tmp -d appdb -c "SELECT * FROM pitr_marker;"
```

!!! tip "recovery.signal 的作用"
    只要数据目录存在 `recovery.signal`，实例启动即进入恢复模式，按 `restore_command` 拉取归档 WAL 回放到目标时间；恢复完成并 promote 后该文件被自动移除，实例转为可读写。忘记创建该文件，实例会按普通方式启动并可能写坏时间线。

日志中出现 `recovery stopping before` 与 `database system is ready to accept connections`，且查询只看到 `before-incident` 而没有 `bad-write-to-rollback`，即证明时间点恢复成功。验证后关闭演练实例并恢复生产服务：

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pitr_restore stop
sudo systemctl start postgresql
pg_lsclusters
```

正式灾难恢复时把上述流程中的恢复目录换成正式数据目录即可，前提是先完整保存故障现场目录留作取证。

## 四、效果验证与测试

```bash
sudo -u postgres psql -d appdb -c "SELECT extname, extversion FROM pg_extension;"
sudo -u postgres psql -c "SELECT archived_count, failed_count, last_archived_wal FROM pg_stat_archiver;"
ls -lh /var/backups/postgresql/
sudo -u postgres pg_restore --list /var/backups/postgresql/appdb_2026-01-01_0200.dump | wc -l
```

期望：扩展列表含 `postgis`，`failed_count` 为 0，备份文件大小大于 0 且 `pg_restore --list` 能列出表与索引清单，PITR 演练查询结果与目标时间一致。

## 五、常见错误与排坑指南

场景一：建扩展失败。报错原文片段：`ERROR: could not open extension control file "/usr/share/postgresql/16/extension/postgis.control": No such file or directory`。原因：只执行了 `CREATE EXTENSION`，没有安装对应的系统包。修复：

```bash
sudo apt install -y postgresql-16-postgis-3 postgresql-16-postgis-3-scripts
sudo -u postgres psql -d appdb -c "CREATE EXTENSION postgis;"
```

场景二：WAL 不归档。现象：`pg_stat_archiver` 的 `failed_count` 持续增长，日志报错原文片段：`archive command failed with exit code 1`。原因多为归档目录属主不对或磁盘满。修复：

```bash
df -h /var/backups/postgresql
sudo chown -R postgres:postgres /var/backups/postgresql/wal_archive
sudo chmod 750 /var/backups/postgresql/wal_archive
sudo tail -n 100 /var/log/postgresql/postgresql-16-main.log
```

场景三：恢复后实例起不来。报错原文片段：`FATAL: recovery ended before configured recovery target was reached`。原因：目标时间晚于现有归档 WAL 覆盖范围，或 `restore_command` 路径写错。修复：核对归档目录中最大 WAL 时间、把目标时间改到已有 WAL 范围内，并手工测试归档文件可读：

```bash
ls -lt /var/backups/postgresql/wal_archive/ | head
sudo -u postgres ls -l /var/backups/postgresql/wal_archive/
```

## 六、生产环境最佳实践与安全建议

备份策略建议组合使用：每日 `pg_dump -Fc` 逻辑备份保留 7 天、每周 `pg_basebackup` 基础备份保留 4 周、WAL 连续归档到独立磁盘或对象存储；三者不要放在同一块盘，盘坏即全丢。备份目录权限保持 `750` 且属主为 `postgres`，备份文件内含全库数据，等同于明文数据资产，需加密存储并限制访问。

恢复演练纳入季度例行工作：记录每次演练的备份时间、恢复耗时、目标时间与实际恢复时间、核对行数。监控必须覆盖 `pg_stat_archiver.failed_count` 大于 0 告警、归档目录磁盘使用率超过 80% 告警、超过 26 小时无新逻辑备份告警。扩展升级跟随 PostgreSQL 小版本同步更新系统包，升级后执行 `ALTER EXTENSION postgis UPDATE;` 前先查官方兼容矩阵并在测试库验证。
