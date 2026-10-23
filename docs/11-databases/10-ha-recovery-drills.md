---
description: "高可用不是装上集群软件，而是单点消除、仲裁与隔离到位，切换与回切有编排，备份恢复被组织成可重复演练：Pacemaker/Corosync 与 DRBD 概念落地、故障切换检查表、PostgreSQL PITR 到新主机与 MySQL binlog 时间点恢复演练、复制延迟判读与演练报告。"
---

# 数据库高可用实战与恢复演练

## 一、概述与使用场景

本章是本部分的收官章，讲两件事：第一，把高可用（HA）体系的概念落到可执行的配置与判读上；第二，把前面各章的备份恢复操作组织成有清单、有验收点、有报告的「演练」。与本部分存量章节的分工如下，操作细节不重复，只回链：

- [MySQL 备份与还原演练](04-mysql-backup-restore.md)：全量备份与 `mysqlbinlog` 时间点重放的命令细节在该章，本章只给演练编排与验收要点。
- [PostgreSQL 插件、备份与 PITR](06-postgresql-extensions-backup.md)：WAL 归档、`pg_basebackup` 与同机 PITR 在该章，本章在其基础上做「恢复到新主机」的演练版。
- [容器化数据库与主从复制](09-ha-containerized.md)：主从搭建与状态字段在该章，本章往上走一层，讲自动切换、回切与延迟判读。

三个口径先说清：可用性目标（如 99.95%，全年允许停机约 4.38 小时）决定冗余层数；RTO 是故障后多久恢复可用；RPO 是最多允许丢多少时间的数据。主从复制只解决「有一份副本」，没有仲裁、隔离与切换编排，副本只是一份可能一起写坏的副本。本章为「文档核对」级别：命令已按官方文档核对，未在本机实测；集群与切换为概念加最小示例，生产落地前必须在隔离环境演练。命令适配 Ubuntu 22.04 / 24.04 LTS，26.04 包版本与参数待核验。

单点消除要逐层查，而不是只盯着数据库进程：主机层靠双机与双路供电，存储层靠 RAID 或 DRBD，网络层靠双网卡与 VIP 入口，数据库层靠切换编排与连接串指向 VIP，流程层靠检查表与演练记录成文——任一层留单点，HA 都只是名义上的。其中 VIP 的创建与主备漂移机制（VRRP）见第 04 部分 [Keepalived 与 VRRP 高可用](../04-network/07-keepalived-vrrp.md)，本章的演练纪律（先隔离、再提升）与该章的脑裂防护互为表里。

## 二、环境准备与前置条件

演练环境使用虚构主机名与文档段 IP：主库 `db1`（192.0.2.31）、备库 `db2`（192.0.2.32）、见证节点 `db3`（192.0.2.33，可为小规格主机）、对外虚拟 IP（VIP）192.0.2.30、恢复演练目标机 `db-restore`（192.0.2.34）。数据库版本与前面章节一致：MySQL 8.4 LTS 系列、PostgreSQL 16，操作系统 Ubuntu 22.04 / 24.04 LTS（26.04 待核验）。

备份前提，缺一不开始演练：集群、数据库与复制配置各留一份带日期副本，失败可退回；最近一次全量备份已过校验和比对，并有恢复到临时实例查到正确数据的记录（见 3.8 节）；恢复目标机与生产网络隔离，避免演练实例被应用误连；各机时钟偏差在 1 秒内，PITR 与 binlog 时间点以统一时钟为准。

!!! danger "生产切换需变更审批"
    演练默认在隔离测试环境进行。任何生产环境的切换、回切、主从强制提升、脑裂处置，都属于高风险变更：必须走变更审批，写明切换窗口、回退条件、数据差异处置与负责人，并在执行前再次确认备份可用。没有审批与可回退备份，不执行生产切换。

开始前逐台检查并留档：

```bash
hostname
ip -brief address
timedatectl status
systemctl status mysql postgresql --no-pager
df -h /var/lib/mysql /var/lib/postgresql
free -h
```

期望：主机名与规划一致、时钟已同步、服务为 `active (running)`、数据盘剩余大于数据目录的 1.5 倍（恢复要再落一份完整数据）。

## 三、手把手操作步骤

### 3.1 HA 概念落地：仲裁、隔离与脑裂防护

仲裁（quorum）解决的是：节点互相联系不上时谁有资格继续提供写服务。规则是多数派：超过半数投票的一方才有仲裁权，由此推出节点取奇数的结论：

| 节点数 | 容忍故障数 | 说明 |
| --- | --- | --- |
| 1 | 0 | 无冗余，不构成 HA |
| 2 | 0 | 一断网两边各占一半，谁都没有多数，天然需要见证 |
| 3 | 1 | 任一单节点故障，剩余两节点仍是多数派 |
| 4 | 1 | 与 3 节点容错相同却多一台成本，不推荐 |
| 5 | 2 | 大型集群常用，运维复杂度随之上升 |

两节点主备是最常见形态，仲裁靠外加见证补足：第三台小规格主机跑 Corosync 的 QDevice 见证进程，或用仲裁服务。见证不跑数据库、只投票：没有它，两节点断网时要么都不敢切（可用性归零），要么都敢切（脑裂）。

第二道是隔离（fencing），实现机制叫 STONITH：判定节点故障后、把资源切走之前，必须先确认它已被真正隔离——断电、重启或切断其存储与网络，确认它再也写不了数据。顺序不能反：

!!! danger "未隔离故障节点就切换等于双主写坏数据"
    故障节点可能只是网络抖动或进程假死，本地数据库可能还在接受写入（应用还连着它的旧地址）。此时直接提升备库开放写入，就会出现双主写同一份数据，分叉后无法自动合并，只能人工对账甚至丢弃一侧。正确顺序永远是：判定故障 → 隔离并确认生效 → 才提升备库与迁移 VIP。无法确认隔离结果时，宁可停服务等人工介入。

第三是脑裂（split-brain）：成因链是心跳网络中断 → 两侧都认为对方已死 → 两侧都接管资源 → 双主写入 → 数据分叉。防护叠三道：仲裁让无多数派的一侧自动停资源；隔离让接管前先 STONITH 摘除对方写入能力；存储层防护（DRBD fencing 回调、从库 `super_read_only`、PostgreSQL 时间线检查）让前两道失效时未被提升的节点也写不进去。

### 3.2 Pacemaker 与 Corosync：选型说明与最小示例

组件分工要分清，排错时才知道看谁：

| 组件 | 职责 | 不负责什么 |
| --- | --- | --- |
| Corosync | 成员关系、心跳、仲裁投票、配置同步 | 不管资源启停与数据库复制 |
| Pacemaker | 资源调度：监控、启停、迁移、隔离决策 | 不做数据复制，靠复制或 DRBD |
| 资源代理 | 把服务包装成可监控可启停的资源，如 `IPaddr2`、`pgsql` | 只执行启停与探活 |
| pcs | 下发与查看集群配置的命令行工具 | 停 pcs 服务不等于停集群 |

资源与约束是核心概念：资源（resource）是被托管对象，如 VIP、数据库服务；资源组（group）把同进同退的资源打包按序启停；同置约束（colocation）规定资源同节点或分开；顺序约束（order）规定启停先后（停止时反序）；位置约束（location）表达节点偏好分数。克隆与可提升克隆（promotable clone）用于 DRBD 这类每节点一份的资源，最小示例不展开。

发行版差异：Ubuntu 与 RHEL 系用 `pcs`；SUSE 系传统用 `crm`（crmsh），语法不同，不要把 `crm configure` 抄到 Ubuntu。本章统一用 `pcs`。Ubuntu 安装：

```bash
sudo apt update
sudo apt install -y pacemaker corosync pcs fence-agents resource-agents
sudo systemctl status corosync pacemaker --no-pager
pcs --version
```

最小示例：在三节点集群已组建（组建命令随 pcs 版本差异较大，以所装版本的 `pcs cluster setup --help` 为准）的前提下，定义 VIP 与数据库服务两个资源并组成一组，再加同置与顺序约束。示例以 PostgreSQL 服务为例，MySQL 把服务资源换成对应的资源代理即可，结构不变。

```bash
sudo pcs resource create db-vip ocf:heartbeat:IPaddr2 ip=192.0.2.30 cidr_netmask=24 nic=eth0 op monitor interval=10s timeout=20s
sudo pcs resource create db-pgsql ocf:heartbeat:pgsql pgdata=/var/lib/postgresql/16/main pgport=5432 op monitor interval=15s timeout=10s
sudo pcs resource group add db-group db-vip db-pgsql
sudo pcs constraint colocation add db-vip with db-pgsql score=INFINITY
sudo pcs constraint order start db-vip then start db-pgsql
sudo pcs constraint location db-pgsql prefers db1=100
sudo pcs stonith create fence-db1 fence_ipmilan ipaddr=192.0.2.41 login=ipmi-admin passwd='<password>' pcmk_host_list=db1
sudo pcs property set stonith-enabled=true
sudo pcs status
```

逐行讲解：第 1 行建 VIP 资源，`IPaddr2` 是虚拟 IP 的标准代理，`op monitor interval=10s` 为每 10 秒探活；第 2 行建服务资源，`pgsql` 代理只负责启停与探活，不配流复制；第 3 行两资源同组，按序启动、逆序停止；第 4 行同置约束 `INFINITY` 为强制同置，连 VIP 即连当前主库；第 5 行顺序约束演示启停先后，生产按依赖改（通常先存储与数据库、最后 VIP）；第 6 行位置约束给 `db1` 偏好分；第 7 行建隔离资源，`fence_ipmilan` 经 IPMI 带外口断电或重启 `db1`，每台节点都要有对应资源，口令只放受控配置；第 8 行打开 STONITH 总开关，设 `false` 等于拆掉第二道防护，生产必须为 `true` 并实测 fencing 能真正执行。

!!! warning "最小示例不可直接上生产"
    该片段只演示资源与约束写法：没有 promotable 复制型资源、双网心跳与 QDevice 见证，fencing 参数是占位值。生产需按官方文档补齐仲裁、双链路心跳、探活深度与失败阈值（`migration-threshold` 等），并在隔离环境完成切换演练后才上线。

### 3.3 DRBD 同步概念与选型取舍

DRBD 是块设备级复制：在内核块层把同一份数据块同步写到对端块设备，上层无感知，看到的只是一块「有镜像的磁盘」。它复制字节块而非 SQL，任何数据库都能用；但默认单主，备节点数据目录不能同时打开，否则文件系统与数据库都会损坏。

同步协议三档，选型是拿延迟换安全：

| 协议 | 写入确认时机 | 丢数据风险 | 适用 |
| --- | --- | --- | --- |
| A（异步） | 本地落盘即确认 | 对端可能缺最近写入 | 跨远距离、容忍少量丢失 |
| B（内存同步） | 对端内存收到即确认 | 对端整机断电时可能丢 | 折中场景，较少单独使用 |
| C（同步） | 两端都落盘才确认 | 正常路径不丢已确认事务 | 同机房主备，最常用 |

与 Pacemaker 的搭配是固定套路：DRBD 做成 promotable clone，只有被提升为主的一侧能挂载；colocation 与 order 约束保证「DRBD 提升 → 挂载 → 数据库启动 → VIP 绑定」按序发生。状态判读：

```bash
sudo drbdadm status
sudo drbdadm dstate all
cat /proc/drbd
```

健康关键词：两端 `disk` 与 `peer-disk` 均为 `UpToDate`、连接正常（旧版 `/proc/drbd` 显示 `cs:Connected`）。出现 `Inconsistent`、`Outdated` 或连接断开，说明副本不是最新或在重同步，禁止提升该节点为主。

DRBD 与逻辑复制（数据库主从）的取舍：

| 对比项 | DRBD 块复制 | 逻辑复制（主从） |
| --- | --- | --- |
| 复制粒度 | 块设备字节 | 事务与行变更 |
| 备端可读 | 否，不能挂载打开 | 是，可只读分流 |
| 切换后校验 | 靠文件系统与数据库自检 | 可查位点与延迟 |
| 延迟敏感 | 同步协议下写延迟叠加往返 | 异步为主，基本不叠加 |
| 适用 | 无原生复制的老系统、整目录一致性 | 两大数据库主流 HA |
| 误操作防护 | 无，误删同步落到对端 | 延迟从库或 PITR 可救回 |

结论：有成熟原生复制的 MySQL 与 PostgreSQL 优先逻辑复制；DRBD 适合给无复制能力的软件兜底或整目录强一致镜像。两者都不替代备份：复制防机器坏，备份防数据错。

### 3.4 故障切换演练清单

切换分两类，清单分开准备。两张表都按「切换前确认 → 执行 → 业务验证 → 监控观察」四段组织，逐项打勾并记录时间，任一段不通过就停在当前段处置，不跳步。

计划内切换（维护、升级、机房腾退）检查表：

| 阶段 | 检查项 |
| --- | --- |
| 切换前确认 | 变更单已审批且在窗口内；备库延迟接近 0 并稳定 5 分钟；最近备份校验通过；应用方已知会并备好断连重试 |
| 执行 | 先排空旧主写入；提升备库并迁移 VIP（自动编排用 `pcs node standby db1` 触发迁移，手动按 3.9 节）；记录每步起止时间 |
| 业务验证 | 用 VIP 读写冒烟：写一条带演练标记的数据并在新主查到；核心接口各调一次；确认无连接打到旧主 |
| 监控观察 | 观察至少 30 分钟：新主日志、反向复制链路、连接数与告警，无异常再关闭变更单 |

非计划切换（故障）检查表：

| 阶段 | 检查项 |
| --- | --- |
| 切换前确认 | 先定性：进程死、主机死、网络分区还是存储故障；先留故障现场截图与日志；确认 fencing 可用或人工隔离就位 |
| 执行 | 先隔离故障节点并确认生效（断电、封端口或云平台关机回执），再提升备库并迁移 VIP；延迟不为 0 时，决策人须知晓预计丢失范围并签字 |
| 业务验证 | 同计划内；额外核对故障时间点前后的关键业务单据量 |
| 监控观察 | 观察至少 1 小时；保留故障节点现场（不重装、不删数据目录）供回切取证；实际 RTO 与估算 RPO 写入报告 |

计划内切换的常用触发命令（在集群任一节点执行，先 standby 旧主让资源按约束迁走，验证后再恢复其待命状态）：

```bash
sudo pcs node standby db1
sudo pcs status
sudo pcs resource
ip address show eth0
sudo pcs node unstandby db1
```

资源全部运行在 `db2`、VIP 只出现在 `db2` 网卡上，才算迁移完成。`unstandby` 只恢复 `db1` 的承接资格，不自动迁回，回切按 3.9 节单独编排。

### 3.5 恢复演练编排：PostgreSQL PITR 到新主机

第 06 章的 PITR 是同机恢复，本节是演练版：目标机是全新的隔离主机 `db-restore`，全程不碰生产库，每阶段有验收点，不过不进下一阶段。归档与基础备份配置回第 06 章 3.5 节。

| 阶段 | 动作 | 验收点 |
| --- | --- | --- |
| 1 准备隔离主机 | 装同大版本 PostgreSQL、备好等量磁盘，确认与生产网络隔离 | 版本与生产一致；实例能空启停一次 |
| 2 恢复基础备份 | 基础备份传到目标机并解压到新数据目录，对齐属主与 700 权限 | 目录含 `PG_VERSION` 与 `backup_label`；校验和与源端一致（见 3.8 节） |
| 3 重放 WAL 到目标时间 | 写 `restore_command` 与 `recovery_target_time`，建 `recovery.signal` 后启动 | 日志出现 `recovery stopping before` 且无归档缺失报错 |
| 4 校验 | 查标记表与关键表行数，与备份时点快照比对 | 目标时间前的数据在、误写数据不在；行数差异可解释 |
| 5 打开访问 | promote 后仅对演练网段开放，只读冒烟，总耗时记为 RTO 实测 | 冒烟通过；实例明确标记，禁止误当生产 |

目标机关键命令（承接第 06 章恢复参数写法）：

```bash
sudo systemctl stop postgresql
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/restore -o "-p 5433 -k /tmp" -l /tmp/pitr_restore.log start
sudo tail -n 50 /tmp/pitr_restore.log
sudo -u postgres psql -p 5433 -h /tmp -d appdb -c "SELECT pg_is_in_recovery();"
sudo -u postgres psql -p 5433 -h /tmp -d appdb -c "SELECT * FROM pitr_marker;"
```

### 3.6 MySQL 基于 binlog 的时间点恢复演练要点

流程与第 04 章 3.4 节相同，只列编排要点：先在隔离机恢复最近全量并验收行数，再用 `mysqlbinlog` 先解析不执行、确认误删位置，最后按 `--stop-datetime` 重放到故障前一刻。验收三条：目标表行数与故障前快照一致；误删语句未被重放；全程耗时计入 RTO 实测。定位误删的判读命令：

```bash
sudo mysqlbinlog --start-datetime="2026-01-01 02:00:00" --stop-datetime="2026-01-01 02:15:00" /var/log/mysql/mysql-bin.000123 > /tmp/replay_check.sql
grep -n "DROP TABLE\|DELETE FROM" /tmp/replay_check.sql
wc -l /tmp/replay_check.sql
```

### 3.7 复制延迟判读

先说 MySQL 的 `Seconds_Behind_Master`（8.0 新名为 `Seconds_Behind_Source`，字段判读见第 09 章 4 节）：它按正在回放事件的时间戳估算，有两个失真场景。一是主库大事务：跑了 10 分钟的大事务提交后才进 binlog，从库回放时该值会跳到约 600 秒又快速回落，看着像延迟爆炸，其实只是单个事务的执行时长。二是并行复制：该值基于最旧的正在回放位置，多个 worker 并行时新事务可能已提交、旧事务还在跑，会高估真实可见延迟；它为 0 也只表示当前无正在回放的事务，不等于 relay log 已收齐。判读组合：先看两个 Running 线程与 Error 字段，再看每个 worker 的状态；长期监控建议用心跳表法（主库定时更新时间戳、从库比对）。

```bash
mysql -u root -p'<password>' -e "SHOW REPLICA STATUS\G" | grep -E "Running|Seconds_Behind|Last_.*Error"
mysql -u root -p'<password>' -e "SELECT WORKER_ID, SERVICE_STATE, LAST_ERROR_MESSAGE FROM performance_schema.replication_applier_status_by_worker;"
```

PostgreSQL 在主库查 `pg_stat_replication`，同时看时间与字节两个口径：

```bash
sudo -u postgres psql -c "SELECT client_addr, state, sync_state, replay_lag, pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS replay_bytes FROM pg_stat_replication;"
```

判读：`state` 应为 `streaming`；`replay_lag` 是主库视角估算的 WAL 重放耗时，最接近业务可见延迟，但从库空闲无新 WAL 时可能为空或不更新，不能单独据此报警；`replay_bytes` 持续增长说明在掉队、稳定在小数值只是抖动。切换决策看双指标：都不为 0 时提升备库等于接受丢弃这部分已提交事务，须按 3.4 节签字确认。

### 3.8 备份一致性校验与验收纪律

纪律先行：退出码为 0 只证明文件写出来了，备份成功不等于可恢复。可恢复要过三关：校验和比对（生成时算 `sha256sum` 并异地保存，恢复前重算，不一致直接判不可用、换上一份）；文件可读性（gzip 包用 `gzip -t`，PostgreSQL 自定义格式用 `pg_restore --list` 列清单，基础备份查 `backup_label`）；恢复后抽查（关键表行数与快照比对、抽 3 到 5 张关键表做主键抽样、应用只读冒烟），结果写入演练记录才算验收完成。

```bash
sha256sum /var/backups/mysql/appdb_2026-01-01_0200.sql.gz
sha256sum -c /var/backups/mysql/appdb_2026-01-01_0200.sql.gz.sha256
gzip -t /var/backups/mysql/appdb_2026-01-01_0200.sql.gz
sudo -u postgres pg_restore --list /var/backups/postgresql/appdb_2026-01-01_0200.dump | head -n 20
```

### 3.9 切换与回切流程

故障切换完成只是中场，旧主如何回来要单独编排：

| 步骤 | 动作 | 要点 |
| --- | --- | --- |
| 1 旧主取证 | 旧主只读或离线拉起，导出独有的差异事务清单 | 只取证不写回；差异由业务方逐条裁定补录或放弃 |
| 2 旧主重建为从 | PostgreSQL 用 `pg_rewind` 或重做 `pg_basebackup` 拉齐，MySQL 用全量加位点重新指向新主 | 以新主为准全量对齐，不做双向合并 |
| 3 追平观察 | 旧主以从库运行至少一个业务高峰，延迟稳定接近 0 | 不承接写流量，VIP 仍指向新主 |
| 4 选择回切窗口 | 低峰窗口按 3.4 节计划内清单回切，或长期以新主运行 | 回切也是一次切换，同样审批与冒烟 |
| 5 收尾 | 更新监控、备份与文档中的主备标注 | 防下次故障按旧拓扑误操作 |

!!! danger "回切时禁止把旧主数据直接覆盖新主"
    切换后新主已承接新写入，旧主是分叉的旧时间线。回切时把旧主目录或旧备份整份盖回新主，等于抹掉切换后产生的新数据，且往往事后才发现。正确做法只有一条：旧主以从库身份重新加入、向新主对齐，独有数据逐条裁定，禁止整库覆盖。

### 3.10 演练节奏与演练报告

节奏建议：每季度至少一次恢复演练（PITR 到新主机与 binlog 恢复轮换），每半年至少一次切换与回切演练，架构、版本或拓扑变更后加演一次。报告至少包含：目标与范围、所用备份与目标时间点、每阶段起止时间、RTO 实测与目标对比、RPO 实测（实际恢复时间点与目标的差）与目标对比、校验清单、问题与整改项及负责人。实测连续两次超目标，先改架构或目标，不改报告口径。

## 四、效果验证与测试

演练环境完成一轮切换与一次 PITR 后逐项核对：

```bash
sudo pcs status
sudo pcs constraint
sudo drbdadm status
ip address show eth0 | grep 192.0.2.30
sudo -u postgres psql -h 192.0.2.30 -d appdb -c "SELECT pg_is_in_recovery();"
mysql -h 192.0.2.30 -u appuser -p'<password>' -e "SELECT @@read_only, @@super_read_only;"
```

期望：节点状态正常、资源只在当前主节点运行且无失败动作；VIP 只在一个节点网卡上；经 VIP 查 PostgreSQL 的 `pg_is_in_recovery()` 为 `f`（已是主库）；经 VIP 查 MySQL 的 `read_only` 与 `super_read_only` 均为 `OFF`（可写主库），从库侧应为 `ON`。

## 五、常见错误与排坑指南

场景一：切换后应用连到旧主库。现象：集群显示已切换，但应用报错或数据写进旧库。根因：连接串写死旧主 IP，或 VIP 已漂移但长连接未断、连接池还是旧连接。修复：连接串一律指向 VIP 或代理；切换后强制回收连接池，并在旧主查连接数确认为 0 再收尾：

```bash
mysql -u root -p'<password>' -e "SHOW PROCESSLIST;"
sudo -u postgres psql -c "SELECT client_addr, count(*) FROM pg_stat_activity GROUP BY client_addr;"
```

场景二：延迟很大时强行切换丢数据。现象：主库宕机后立即提升从库，恢复后发现最近几分钟订单不见。根因：异步复制下从库本就落后，`Seconds_Behind_Master` 或 `replay_bytes` 不为 0 时切换，落后段的已提交事务只存在于已宕主库。修复：能等先等追平再切；等不了由决策人按 3.4 节确认丢失范围并签字，事后按 3.9 节取证对账补录，禁止把旧主数据直接合并回来。

场景三：回切把新数据覆盖掉。见 3.9 节 danger。修复只有纪律：旧主只许以从库身份重建加入；演练中专门练一次「旧主带独有数据回来」的取证与裁定流程，让执行人先在演练里犯错纠正。

场景四：两节点一断网就脑裂或全停。根因：无见证与 fencing。修复：补 QDevice 见证或第三节点，`stonith-enabled` 设 `true` 并逐台实测 fencing，再断网演练验证只有一侧提供服务。

## 六、生产环境最佳实践与安全建议

仲裁与隔离是生产红线：节点取奇数或加见证，`stonith-enabled` 必须为 `true` 且每个 fencing 资源都做过真实断电验证；不要把 `no-quorum-policy` 设为忽略仲裁继续跑资源。同步复制（PostgreSQL 同步备库、MySQL 半同步）能把 RPO 压到接近 0，代价是写延迟与备库故障时主库可用性下降，按 RTO 与 RPO 目标取舍并写进设计文档，不要全异步又宣称零丢失。

监控至少覆盖：资源失败与节点离线、复制延迟双指标超阈值持续 5 分钟、DRBD 非 `UpToDate`、备份校验失败与超周期无新备份。切换、回切、强制提升全纳入变更管理，执行、决策、验收三人分开；演练报告按季度归档，实测趋势比单次达标更重要。fencing 口令与业务口令分离、只走受控凭据管理；Ubuntu 26.04 的 Pacemaker、pcs 与 DRBD 版本参数待核验，升级前先在隔离环境重跑本章清单。
