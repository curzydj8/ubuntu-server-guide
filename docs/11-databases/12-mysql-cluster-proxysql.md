---
description: "单机与异步主从之上再走一步：MySQL 生产集群的选型分层（复制层二选一、代理层可叠加）、InnoDB Cluster 主线搭建（AdminAPI 与 Router）、Galera 的 wsrep 配置与 bootstrap 红线、ProxySQL 的三层配置与读写分离，以及分层回滚的红线。"
---

# MySQL 集群（InnoDB Cluster / Galera）与 ProxySQL

## 一、概述与使用场景

[容器化数据库与主从复制](09-ha-containerized.md)搭的是异步主从：有一份副本，但主库故障后靠人工判断与提升，应用连接也要跟着改地址。[数据库高可用实战与恢复演练](10-ha-recovery-drills.md)的结论是：只有副本不等于高可用，缺的是仲裁、隔离与切换编排。本章把这三样落到 MySQL 的两套官方/主流集群方案与一层代理上，解决三个问题：节点故障时集群自己选出新主并继续提供写服务；应用连接串不随主库漂移而改；读流量能分流到副本节点。

先纠正一个常见误解：InnoDB Cluster、Galera、ProxySQL 不是互斥的三选一。它们分属两层——**复制/集群层**负责数据的多副本与一致性（同一套数据只能选一种机制），**代理层**负责连接接入、健康检查与读写分流（可以叠加在任一集群之上，也可以只配普通主从，甚至单机前面先放一层为将来扩容留接口）：

| 方案 | 所在层 | 生态归属 | 仲裁与一致性 | 适用场景 | 本站口径 |
| --- | --- | --- | --- | --- | --- |
| InnoDB Cluster | 复制层 | Oracle MySQL 官方（Group Replication + MySQL Shell + Router） | Paxos 类多数派表决，单主默认，失多数派自动只读/退出 | MySQL 8.4 主线部署、新建集群 | **首选主线**，见 3.1 节 |
| Galera Cluster | 复制层 | MariaDB / Percona XtraDB Cluster 生态（Codership wsrep） | 写入集认证，多主同步复制，有 Primary Component 多数派概念 | 已有 MariaDB / Percona 栈、偏好多主写入形态 | 存量生态方案，见 3.2 节 |
| 异步主从（第 09 章） | 复制层 | MySQL / MariaDB 通用 | 无仲裁，切换靠人工或外部编排 | 读扩展、异地备份副本 | 已有章节，本章不重复 |
| MySQL Router | 代理层 | Oracle MySQL 官方，InnoDB Cluster 配套 | 依据集群元数据路由，只做转发 | InnoDB Cluster 的标准接入点（读写口 6446 / 只读口 6447） | 随 3.1 节 |
| ProxySQL | 代理层 | 独立开源代理（可配集群、主从或单机） | 自带后端健康检查与 hostgroup 管理 | 需要读写分离、查询改写、连接复用的接入层 | 见 3.3 节 |

一句话结论：新部署按本站主线走 InnoDB Cluster + Router；应用需要按语句做读写分离或查询级治理时，在前面再叠 ProxySQL；已有 MariaDB / Percona 栈的用 Galera，不要把 Galera 写成 Oracle MySQL 的原生功能去装——MySQL 官方发行版里没有 wsrep 提供者。

!!! note "本章验证级别"
    本章为**文档核对级**：命令与参数按 Oracle、MariaDB 与 ProxySQL 官方文档核对编写。三机集群的故障切换、选主与脑裂行为需要真实多机环境，当前**待核验**，不要把本章的多机行为描述当作已实测结论。单机可验证的部分（配置语法、ProxySQL 管理口操作）也建议先在隔离环境走通全流程，再上生产。Ubuntu 26.04 上的包与参数一律待核验。

## 二、环境准备与前置条件

三台数据库节点，命名与寻址与第 10 章演练环境保持一致，便于对照演练：

| 角色 | 主机名 | IP | 说明 |
| --- | --- | --- | --- |
| 数据库节点 1 | `db1` | 192.0.2.31 | 集群成员 |
| 数据库节点 2 | `db2` | 192.0.2.32 | 集群成员 |
| 数据库节点 3 | `db3` | 192.0.2.33 | 集群成员 |
| 代理（ProxySQL 示例） | 与应用同机或独立小机 | 192.0.2.40 | 也可部署在每台应用服务器本机 |

为什么必须三台起步：仲裁要求多数派，三节点容忍任意一台故障后仍剩两台构成多数；两节点一断网各占一半、谁都没有多数，集群只能停写等待人工，与第 10 章仲裁表、[Keepalived 与 VRRP 高可用](../04-network/07-keepalived-vrrp.md)的「VRRP 无仲裁、靠防护清单降概率」形成对照——数据库集群自带仲裁，但前提是节点数给够。两台机器加第三台小规格见证只适用于 Pacemaker 类外部编排，不适用于本章两套集群（成员必须都是数据节点）。

前置条件逐项落实，缺一不开工：

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统与版本 | Ubuntu Server 22.04 / 24.04 LTS；MySQL 8.4 LTS（InnoDB Cluster 路线）或 MariaDB / Percona XtraDB Cluster（Galera 路线） | 安装按 [MySQL 与 MariaDB 安装与安全初始化](01-mysql-install-security.md)，两条路线不要混装 |
| 主机名解析 | 三台互以主机名可达 | 集群组件按主机名互相连接，`/etc/hosts` 写全三台映射（见下方命令），不要只靠 IP |
| 时间同步 | 三台 chrony 已同步，偏差在 1 秒内 | 证书、日志与冲突判读都依赖统一时钟，`chronyc tracking` 确认 |
| 备份 | 变更前一份已验证可用的全量备份 | 按 [MySQL 备份与还原演练](04-mysql-backup-restore.md)；集群化是结构性变更，没有可回退备份不许开始 |
| 网络 | 节点间内网互通，下表端口只在内网/安全组内放行 | 3306 与集群端口一律不进公网 |

端口清单（按采用的方案放行对应行，不要全开）：

| 端口 | 用途 | 采用方案 |
| --- | --- | --- |
| 3306 | MySQL 业务与复制基础连接 | 全部 |
| 33061 | Group Replication 组通信 | InnoDB Cluster |
| 6446 / 6447 | MySQL Router 读写口 / 只读口 | InnoDB Cluster |
| 4567 / 4568 / 4444 | Galera 组通信 / 增量传输 / 全量快照（SST） | Galera |
| 6033 | ProxySQL 业务口 | ProxySQL |
| 6032 | ProxySQL 管理口（只许本机/管理网段） | ProxySQL |

逐台执行的开工检查：

```bash
hostname
cat /etc/hosts
chronyc tracking
timedatectl status
sudo systemctl status mysql --no-pager
df -h /var/lib/mysql
```

`/etc/hosts` 中三台的映射逐台核对（每台内容一致）：

```text
192.0.2.31 db1
192.0.2.32 db2
192.0.2.33 db3
```

期望：主机名与规划一致、三台时钟已同步、MySQL 为 `active (running)`、数据盘剩余空间大于当前数据目录（加入集群时新成员要全量克隆一份数据）。

## 三、手把手操作步骤

### 3.1 InnoDB Cluster（主线）：Group Replication + AdminAPI + Router

组件分工：**Group Replication** 是节点间的数据复制与多数派表决引擎，随 MySQL 本体以插件形式运行；**MySQL Shell 的 AdminAPI**（`dba.*`）是唯一的集群管理入口，负责校验实例、建集群、加成员、看状态，不要手工改组复制参数去拼集群；**MySQL Router** 是应用接入点，从集群元数据得知谁是主、谁是从，对外给两个固定端口。

第一步，三台各装一份 MySQL Shell（已装可跳过），并确认实例满足 AdminAPI 的前置要求：GTID 开启、二进制日志开启、每台 `server_id` 唯一。前置不满足时不要手工逐项硬改——AdminAPI 的校验与配置命令会指出并修正大部分项目：

```bash
sudo apt update
sudo apt install -y mysql-shell
mysqlsh --version
```

第二步，在 db1 上用 MySQL Shell 逐台校验并配置实例。校验对象用第 01 章建的安全管理员账号（示例用 `opsadmin`，实际以本站点账号为准，口令在交互提示中输入，不要写进命令历史）：

```text
mysqlsh --js
MySQL JS > dba.checkInstanceConfiguration('opsadmin@db1:3306')
MySQL JS > dba.checkInstanceConfiguration('opsadmin@db2:3306')
MySQL JS > dba.checkInstanceConfiguration('opsadmin@db3:3306')
```

校验通过后，对报告提示需要调整的实例执行 `dba.configureInstance('opsadmin@dbX:3306')` 按提示完成配置（三台都要能被 db1 以主机名连通，这就是第二节要求 `/etc/hosts` 写全的原因）。

第三步，在 db1 上创建集群并逐台加入成员：

```text
MySQL JS > \connect opsadmin@db1:3306
MySQL JS > var cluster = dba.createCluster('prodCluster')
MySQL JS > cluster.addInstance('opsadmin@db2:3306')
MySQL JS > cluster.addInstance('opsadmin@db3:3306')
MySQL JS > cluster.status()
```

`addInstance` 会把新成员的数据从种子节点全量克隆过去（数据量大时耗时明显，安排在低峰执行）；加入过程中成员状态是 `RECOVERING`，完成并追平后变 `ONLINE`。成员状态的含义：

| 状态 | 含义 | 处置 |
| --- | --- | --- |
| `ONLINE` | 正常在线，参与表决与读写分工 | 无 |
| `RECOVERING` | 正在克隆数据或追赶事务 | 等待，不要在此期间停种子节点 |
| `ERROR` | 成员出错（如配置或复制通道异常） | 看该节点错误日志，按提示修复后重新校验 |
| `UNREACHABLE` / `OFFLINE` | 网络不通或实例已退出集群 | 先定性是网络、宕机还是被摘除，再处理 |

第四步，在应用侧（或独立代理机）引导 MySQL Router。`--bootstrap` 让 Router 直接从集群元数据生成配置，之后成员变更由 Router 周期性拉取元数据自动感知，应用不需要改连接串：

```bash
sudo apt install -y mysql-router
sudo mysqlrouter --bootstrap opsadmin@db1:3306 --user=mysqlrouter --name=prodRouter
sudo systemctl enable mysqlrouter
sudo systemctl start mysqlrouter
ss -tlnp | grep -E '6446|6447'
```

应用连接口径固定为两个端口：

| 端口 | 语义 | 应用用法 |
| --- | --- | --- |
| 6446 | 读写口：始终路由到当前主节点 | 写与强一致读 |
| 6447 | 只读口：路由到从节点（轮询分流） | 可容忍复制延迟的读 |

验证连接已由 Router 转发（在应用机执行，返回的应是当前主节点主机名）：

```bash
mysql -h 192.0.2.40 -P 6446 -u appuser -p -e "SELECT @@hostname;"
```

摘除成员用 `cluster.removeInstance('opsadmin@dbX:3306')`，先在 Shell 里取得集群对象再执行；摘除是受控操作，与「节点宕机」是两回事，排障时不要拿摘除当重启手段。

### 3.2 Galera：wsrep 配置与 bootstrap 红线

再次强调定位：Galera 是 MariaDB 与 Percona XtraDB Cluster 的同步多主复制机制，Oracle MySQL 没有这套东西。本节配置以 MariaDB 为例（Percona 的文件位置与个别参数名不同，以其官方文档为准）。三台各写一份 `/etc/mysql/conf.d/galera.cnf`，先备份原文件再改：

```bash
sudo cp /etc/mysql/conf.d/galera.cnf "/etc/mysql/conf.d/galera.cnf.bak-$(date +%F)"
```

配置文件全文（三台只有 `wsrep_node_address` 与 `wsrep_node_name` 按本机改，其余一致）：

```ini
[mysqld]
binlog_format = ROW
default_storage_engine = InnoDB
innodb_autoinc_lock_mode = 2
bind-address = 0.0.0.0

wsrep_on = ON
wsrep_provider = /usr/lib/galera/libgalera_smm.so
wsrep_cluster_name = "prod_galera"
wsrep_cluster_address = "gcomm://db1,db2,db3"
wsrep_node_address = "192.0.2.31"
wsrep_node_name = "db1"
wsrep_sst_method = mariabackup
wsrep_sst_auth = "sst_user:<sst口令>"
```

核心参数逐项讲解：

| 参数 | 含义 | 纪律 |
| --- | --- | --- |
| `wsrep_cluster_address` | 集群成员发现地址 | 三台写同一份全名单；它只是发现入口，不是选主配置 |
| `wsrep_cluster_name` | 集群名 | 三台必须一致，写错等于自成一簇 |
| `wsrep_sst_method` | 新成员全量同步方式 | MariaDB 用 `mariabackup`，Percona 用 `xtrabackup-v2`；都要配专用 `wsrep_sst_auth` 账号，不要用 root |
| `wsrep_node_address` | 本机在组通信中的地址 | 写内网 IP，与 `/etc/hosts` 口径一致 |
| `innodb_autoinc_lock_mode = 2` | 多主并发写入要求的交错锁模式 | Galera 官方要求，不要改回 0/1 |

!!! danger "bootstrap 只能用一次：全新集群的第一台"
    `--wsrep-new-cluster`（MariaDB 用包装命令 `galera_new_cluster`）的语义是「以我为源头新建一个集群」，**只允许在全新集群的第一台、且仅此一次**。日常启停一律 `systemctl start mariadb`，节点自己会凭 `wsrep_cluster_address` 找到同伴。把 bootstrap 当成「启动不了就加这个参数试试」，会让节点带着旧数据自立门户，形成两个同名集群，数据分叉后无法自动合并，只能人工对账。

集群整体停机后的恢复顺序同样有红线：全部节点都停过时，先看每台 `/var/lib/mysql/grastate.dat` 里的 `safe_to_bootstrap` 字段，**只有标记为 `1` 的那台**（最后正常离开集群、数据最新）有权用 bootstrap 方式拉起，其余节点随后正常启动加入。在三台上执行：

```bash
sudo grep safe_to_bootstrap /var/lib/mysql/grastate.dat
```

状态检查（任一节点执行 SQL）：

```sql
SHOW STATUS LIKE 'wsrep_cluster_size';
SHOW STATUS LIKE 'wsrep_local_state_comment';
SHOW STATUS LIKE 'wsrep_ready';
SHOW STATUS LIKE 'wsrep_connected';
```

健康口径：`wsrep_cluster_size` 等于 3、`wsrep_local_state_comment` 为 `Synced`、`wsrep_ready` 与 `wsrep_connected` 为 `ON`。仲裁行为与 InnoDB Cluster 同理是多数派：Galera 里叫 Primary Component——网络分区后只有占多数的一侧保持 Primary 继续接受写入，少数派一侧自动拒绝写入。这与 VRRP 的关键差异在于：[Keepalived 与 VRRP 高可用](../04-network/07-keepalived-vrrp.md)明确 VRRP 本身没有仲裁机制、脑裂靠防护清单降低概率，而数据库集群把仲裁做进了协议里，代价是节点数与多数派纪律没有商量。另一个必须知道的代价是流控（flow control）：同步复制下写事务要等全簇确认，最慢节点会拖住所有人的写入，`wsrep_flow_control_paused` 持续大于 0 就是集群在被慢节点限速，先查那台的磁盘与负载，不要先怀疑网络。

### 3.3 ProxySQL：三层配置、四张核心表与读写分离

ProxySQL 是一个独立代理进程，可以放在集群前面做统一接入：后端健康检查、连接复用（multiplexing：多个客户端连接复用到少量后端连接）、按规则分流读写。它不参与数据复制，后端是 InnoDB Cluster、Galera、普通主从还是单机，它都只认「一组 MySQL 服务器」。安装从 ProxySQL 官方源进行，包名 `proxysql`，装完启动服务：

```bash
sudo systemctl enable proxysql
sudo systemctl start proxysql
sudo systemctl status proxysql --no-pager
ss -tlnp | grep -E '6032|6033'
```

两个端口先分清：**业务口 6033** 是应用连的；**管理口 6032** 是运维连的，进去看到的是 ProxySQL 自己的配置库（SQLite 语义的内存库），不是后端 MySQL。

!!! danger "管理口默认口令 admin/admin，首次登录后必须立刻改"
    ProxySQL 出厂管理账号是 `admin` / `admin`，全网皆知。不改口令等于把后端拓扑、账号与分流规则的改写权交给任何能连上 6032 的人：改完口令之前，6032 只许本机访问，安全组与防火墙都不要对外放行。

首次登录管理口并改口令（管理口是 MySQL 协议，用 `mysql` 客户端连）：

```bash
mysql -h 127.0.0.1 -P 6032 -u admin -padmin
```

```sql
UPDATE global_variables SET variable_value = 'admin:<新管理口令>' WHERE variable_name = 'admin-admin_credentials';
LOAD ADMIN VARIABLES TO RUNTIME;
SAVE ADMIN VARIABLES TO DISK;
```

改完退出，用新口令重新登录验证生效，再继续下面的配置。ProxySQL 的配置是三层体系，所有对象都遵循同一套口径，先理解再动手：

| 层 | 载体 | 语义 |
| --- | --- | --- |
| MEMORY（main 库） | 你 INSERT/UPDATE 的普通表 | 只是编辑区，改完不生效 |
| RUNTIME | 进程内存中的生效配置 | `LOAD ... TO RUNTIME` 后才对流量生效 |
| DISK | 本地 SQLite 文件 | `SAVE ... TO DISK` 后重启不丢失 |

漏掉任何一步的后果：只改表不 LOAD，配置不生效（最常见的新手坑）；只 LOAD 不 SAVE，ProxySQL 一重启配置回退。标准动作永远是成对出现。

配置前先在后端建监控账号。ProxySQL 靠它探活后端并读取每台的 `read_only` 状态（主从/集群角色判读都靠它），在当前主节点上执行（语句会随复制同步到全簇）：

```sql
CREATE USER 'monitor'@'192.0.2.%' IDENTIFIED BY '<监控账号口令>';
GRANT USAGE ON *.* TO 'monitor'@'192.0.2.%';
```

然后在管理口把监控账号写入全局变量并生效：

```sql
UPDATE global_variables SET variable_value = 'monitor' WHERE variable_name = 'mysql-monitor_username';
UPDATE global_variables SET variable_value = '<监控账号口令>' WHERE variable_name = 'mysql-monitor_password';
LOAD MYSQL VARIABLES TO RUNTIME;
SAVE MYSQL VARIABLES TO DISK;
```

四张核心表逐张配。约定 hostgroup 编号：**10 = 写组（主节点）**、**20 = 读组（从节点）**。

第一张 `mysql_servers`：登记后端节点。配合复制 hostgroup 使用时，三台都先登记进写组 10，由监控按 `read_only` 状态自动把从节点挪到读组 20，人不要手工维护谁在哪个组：

```sql
INSERT INTO mysql_servers (hostgroup_id, hostname, port) VALUES (10, '192.0.2.31', 3306);
INSERT INTO mysql_servers (hostgroup_id, hostname, port) VALUES (10, '192.0.2.32', 3306);
INSERT INTO mysql_servers (hostgroup_id, hostname, port) VALUES (10, '192.0.2.33', 3306);
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
```

第二张 `mysql_replication_hostgroups`：声明「10 是写组、20 是读组」这一对关系，ProxySQL 据此做角色分工：

```sql
INSERT INTO mysql_replication_hostgroups (writer_hostgroup, reader_hostgroup, comment) VALUES (10, 20, 'prod-cluster');
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
```

若后端是 Galera，改用 `mysql_galera_hostgroups`（它按 wsrep 状态而非 `read_only` 判读成员健康与主写归属），不要两张表同时配。

第三张 `mysql_users`：应用账号在代理层的映射。注意这是 ProxySQL 校验的前端账号，后端 MySQL 上要有同名账号与对应权限（按 [MySQL 用户、权限与远程访问](02-mysql-users-remote.md)建），`default_hostgroup` 指没有规则命中时走哪个组：

```sql
INSERT INTO mysql_users (username, password, default_hostgroup, active) VALUES ('appuser', '<应用账号口令>', 10, 1);
LOAD MYSQL USERS TO RUNTIME;
SAVE MYSQL USERS TO DISK;
```

第四张 `mysql_query_rules`：读写分离规则。规则按 `rule_id` 从小到大顺序匹配，命中即按 `destination_hostgroup` 转发。这里给的是 `match_pattern` 级别的简化写法，够用且不易写错；官方文档另有基于语句 digest 与 `flagIN`/`flagOUT` 链式规则的精细写法，需要按事务边界做复杂分流时再按官方文档进阶，不要凭博客片段拼：

```sql
INSERT INTO mysql_query_rules (rule_id, active, match_pattern, destination_hostgroup, apply)
VALUES (1, 1, '^SELECT.*FOR UPDATE', 10, 1);
INSERT INTO mysql_query_rules (rule_id, active, match_pattern, destination_hostgroup, apply)
VALUES (2, 1, '^SELECT', 20, 1);
LOAD MYSQL QUERY RULES TO RUNTIME;
SAVE MYSQL QUERY RULES TO DISK;
```

两条规则的语义：带 `FOR UPDATE` 的读是写事务的一部分，必须回主节点（规则 1 先匹配）；其余普通 `SELECT` 去读组（规则 2）；`INSERT`/`UPDATE`/`DELETE` 不匹配任何规则，落到账号的 `default_hostgroup` 即写组 10。生效后从业务口验证分流（同一条命令连查几次，读应落到不同从节点）：

```bash
mysql -h 127.0.0.1 -P 6033 -u appuser -p -e "SELECT @@hostname;"
```

## 四、效果验证与测试

逐层验证，不要只看「能连上」：

集群层（InnoDB Cluster）在 MySQL Shell 执行 `cluster.status()`，期望关键字段：集群 `status` 为 `OK`、三名成员 `status` 均为 `ONLINE`。经 Router 验证：连 6446 执行 `SELECT @@hostname;` 返回当前主节点；连 6447 多次执行应能看到从节点轮换。再停掉一台从节点（隔离环境内操作）观察 `cluster.status()` 中成员变 `UNREACHABLE`、Router 只读口自动摘除该节点、集群整体仍 `OK`——这一步是演练不是生产动作，生产环境的故障演练编排与报告按 [数据库高可用实战与恢复演练](10-ha-recovery-drills.md)执行，纪律不变：先隔离、先定性、再提升。

集群层（Galera）在任一节点执行第三节的状态查询，期望 `wsrep_cluster_size` 为 3、`wsrep_local_state_comment` 为 `Synced`、`wsrep_ready` 为 `ON`；在一台写入测试数据，其余两台立刻可查，是同步多主的基本验收。

代理层在 ProxySQL 管理口看运行时视图（注意带 `runtime_` 前缀的表才是已生效配置，与编辑区的普通表对照检查）：

```sql
SELECT hostgroup_id, hostname, status FROM runtime_mysql_servers;
SELECT username, default_hostgroup FROM mysql_users;
```

再从管理口看连接池统计，确认业务口的查询确实落到了不同 hostgroup：

```sql
SELECT hostgroup, srv_host, Queries FROM stats_mysql_connection_pool;
```

期望：读组（20）的 `Queries` 随普通查询增长，写组（10）承载写与 `FOR UPDATE` 读；某台后端停机后，其在 `runtime_mysql_servers` 中状态变 `SHUNNED` 且流量自动避开。

## 五、常见错误与排坑指南

- **两节点就想防脑裂**：两节点任何一套集群都没有多数派，断网即停写或靠人工裁决。答案是加第三台数据节点，不是调参数。
- **Galera 全停后随手挑一台 bootstrap**：挑的不是 `safe_to_bootstrap: 1` 的那台，就等于用旧数据覆盖新数据，全簇以错的那份为准同步。先查 `grastate.dat` 再动手，被这条坑到的数据回退不在「回滚」范畴内，只能靠备份恢复。
- **ProxySQL 改了表却不生效**：只 INSERT 不 `LOAD ... TO RUNTIME`，或生效了却忘 `SAVE ... TO DISK`、重启后回退。对照第四节用 `runtime_` 表验收，不要凭感觉。
- **管理口裸奔**：6032 带着默认口令对内网全开放，等于开放改写后端拓扑的后门。改口令加访问范围双管齐下，检查顺序见 3.3 节。
- **加入集群失败先怀疑集群软件**：Group Replication 加成员失败的高频原因是主机名解析缺失、节点时间偏差、33061 不通——第二节的前置检查逐项回看，比重装有效。
- **把多主当无冲突的写入放大器**：Galera 多主下两台同时改同一行，后提交者的事务会被认证环节回滚（应用侧看到死锁类错误），这是机制在保护一致性，不是故障；热点行写入应从应用侧收敛到单点或做分片，不要试图关掉校验。

## 六、生产环境最佳实践与安全建议

- **监控先行**：InnoDB Cluster 盯成员状态变化与 `cluster.status()` 的整体状态；Galera 盯 `wsrep_cluster_size`、`wsrep_local_state_comment` 与 `wsrep_flow_control_paused`；ProxySQL 盯 `runtime_mysql_servers` 的 `SHUNNED` 与各 hostgroup 的连接池队列。集群无人值守又无告警，等于把故障发现交给用户投诉。
- **变更纪律**：集群与代理的任何结构性变更（加减节点、改分流规则、切主）都按变更单执行，变更前全量备份按 [MySQL 备份与还原演练](04-mysql-backup-restore.md)，故障演练按 [数据库高可用实战与恢复演练](10-ha-recovery-drills.md)定期做（停一台从、停主、网络分区三场起步），不要等真故障当第一次演练。
- **账号最小权限**：集群管理账号、SST 账号、ProxySQL 监控账号、应用账号四类分开，各自只给必要权限与来源网段；口令不写进脚本与命令历史，交互输入或放权限 600 的配置文件。
- **读一致性预期管理**：6447 与读组 20 读到的是副本，存在复制延迟窗口；下了单立刻回读自己订单这类场景必须走写组/主节点，在应用侧按接口划分，不要指望代理猜出哪条读不能延迟。

### 回滚与恢复

回滚按层分开看，难度完全不同，先易后难：

**代理层回滚（无数据面影响，可随时做）**。ProxySQL 与 Router 都只是转发层，本地不存业务数据：把应用连接串从代理地址改回直连当前主节点（192.0.2.31:3306 或现任主），确认业务恢复直连后停掉代理即可：

```bash
sudo systemctl stop proxysql
mysql -h 192.0.2.31 -P 3306 -u appuser -p -e "SELECT @@hostname;"
```

ProxySQL 的本地配置库文件随安装目录保留一份带日期的拷贝再停服，日后想重新启用时可对照恢复；摘除顺序反过来（先改连接串、后停代理）不会中断业务，因为连接串切换只影响新建连接。

**集群层回滚（结构性变更，按红线流程走）**。集群不是一个可以关掉的开关：从集群形态退回单机，本质是「选定一台数据最全的节点为权威，其余节点有序退出，应用改直连权威节点」。流程要点：

1. 进变更窗口，应用停写，确认最近一次全量备份可用（没有备份不许开始退）。
2. InnoDB Cluster：在 MySQL Shell 中逐台 `cluster.removeInstance()` 摘除从节点，最后保留主节点；摘除后在保留节点上确认数据完整、抽查核心表行数与业务冒烟。Galera：逐台正常停服，最后停的那台数据即为权威基准，其余节点的本地数据在重新以单机形态启用前一律视为过期副本，不要再让它们以集群方式自行启动。
3. 应用连接串改直连保留节点，逐项恢复验证（写入、回读、定时任务、备份任务）。
4. 被摘除节点的数据目录先改名封存保留一个观察周期，确认权威节点无误后再清理——「退回单机」执行完的那一刻不是删数据的时刻。

**不可回滚的情形先说清**：多主写入一旦发生脑裂式分叉或 Galera 冲突数据已被两边各自覆盖，世界上没有「一键合并」——只能按第 10 章纪律停写、定性、以权威一侧为准、另一侧差异数据人工对账处置。把这类事故写进预案与演练，而不是指望回滚小节兜底。
