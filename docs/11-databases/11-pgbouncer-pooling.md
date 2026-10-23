---
description: "PgBouncer 连接池：三种池模式的取舍与 transaction 模式失效特性清单、auth_file 与 auth_query 双认证路线、保守参数起点、管理控制台验证与摘除回滚。"
---

# PgBouncer 连接池

## 一、概述与使用场景

第 05 章把 PostgreSQL 单机基线立起来之后，连接数通常是第一个撞上的瓶颈：PostgreSQL 每条连接对应一个后端进程，连接建立要走完整的认证与进程派生流程，几百上千条并发连接时，光空闲连接的内存与调度开销就很可观，`max_connections` 也不是调大就能了事。PgBouncer 是 PostgreSQL 的轻量连接池中间件：应用改连它（默认端口 6432），它只维持少量与 PostgreSQL 的真实连接，把大量客户端连接复用到这批后端连接上。

先划清定位，避免选型误判：

| 问题 | PgBouncer 的答案 |
| --- | --- |
| 连接太多、建立太贵 | 是，这正是它要解决的 |
| 读写分离、SQL 路由分流 | 不是，它不解析 SQL 做分流，那是 ProxySQL 一类代理的定位（见第 12 章） |
| 高可用、主库切换 | 不是，切换与故障转移要靠复制与演练体系（见第 10 章） |
| 改完应用要不要改代码 | 不用，只改连接串的地址与端口；但池模式选错会让会话级特性失效，见 3.2 节 |

部署摆法两种：与 PostgreSQL 同机（最常见，PgBouncer 只绑本机或内网地址，应用与库同机时甚至只走回环）；独立机一台池层、后面挂一台或多台 PostgreSQL（应用多、想集中管控连接时）。无论哪种摆法，PgBouncer 前面不要再叠一层对公网的暴露：6432 与 5432 一样只许应用网段访问。

!!! note "验证级别说明"
    本章配置示例已做沙箱实测：从 Ubuntu 24.04 官方仓库取得 PgBouncer 1.22.0，在沙箱中以 3.3 节的 ini 原文（仅把文件路径换到沙箱目录）启动成功、监听 6432，并用 psql 连管理库执行 `SHOW POOLS` 成功（SCRAM 认证、transaction 模式均按本章口径生效）。与真实 PostgreSQL 后端的完整业务联调未在本环境进行，涉及后端行为的描述为文档核对级；Ubuntu 26.04 为待核验。上线前请按第四节在自己的环境完整走一遍验证。

## 二、环境准备与前置条件

适用系统：Ubuntu 22.04 LTS 或 24.04 LTS。PostgreSQL 已按第 05 章安装并完成认证基线（`password_encryption = 'scram-sha-256'`、应用账号最小权限），本机或可达的 PostgreSQL 监听 5432。本章示例沿用第 05 章的库与账号：数据库 `appdb`、应用账号 `appuser`，另需一个池层管理账号 `pgbadmin`（仅用于连接 PgBouncer 管理库，不在 PostgreSQL 里建同名角色亦可，它只是 userlist 条目；若走 auth_query 路线则另需 `pgbouncer` 角色，见 3.5 节）。

动手前确认：

```bash
lsb_release -a
sudo -u postgres psql -c "SHOW max_connections;"
sudo -u postgres psql -c "SELECT usename, application_name, state FROM pg_stat_activity;"
apt-cache policy pgbouncer
sudo ss -tlnp | grep -E "5432|6432"
```

要点：先看清 PG 当前的 `max_connections` 与实际连接占用，池的容量规划要以它为上限（见 3.3 节容量口径）；6432 端口当前应无监听。安装前对要改的连接串现状留一份记录，方便第六节回滚时改回去。

## 三、手把手操作步骤

### 3.1 安装与关键路径

```bash
sudo apt update
sudo apt install -y pgbouncer
sudo systemctl enable pgbouncer
apt-cache policy pgbouncer
```

Ubuntu 24.04 仓库的 PgBouncer 为 1.22 世代（以 `apt-cache policy` 实际输出为准，22.04 的版本更旧，参数支持面以所装版本文档为准）。关键路径：

| 用途 | 完整路径 |
| --- | --- |
| 主配置文件 | `/etc/pgbouncer/pgbouncer.ini` |
| 认证文件（auth_file 路线） | `/etc/pgbouncer/userlist.txt` |
| systemd 服务 | `pgbouncer` |
| 日志文件 | `/var/log/postgresql/pgbouncer.log` |
| 运行用户 | `postgres`（Ubuntu 打包口径） |

先备份发行版自带配置再改：

```bash
sudo cp /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini.bak.$(date +%F)
sudo ls -l /etc/pgbouncer/
```

### 3.2 三种池模式与 transaction 模式的失效清单（核心选型）

池模式决定「后端连接在什么时候还给池里」，是 PgBouncer 最重要的一个决定：

| 模式 | 后端连接归还时机 | 兼容性 | 复用率 | 适用场景 |
| --- | --- | --- | --- | --- |
| `session`（默认） | 客户端断开时 | 全部会话级特性可用 | 最低，一个客户端全程占一条 | 依赖会话特性的老应用、交互式会话 |
| `transaction` | 每个事务结束时 | 会话级特性失效，见下表 | 高，生产最常用 | Web 应用、短事务服务，首选 |
| `statement` | 每条语句结束时 | 连多语句事务都不允许 | 最高 | 极特殊的无事务短语句场景，一般不用 |

transaction 模式下，下列会话级特性会失效或受限，接入前必须逐项对照自己的应用过一遍：

| 特性 | 在 transaction 模式下的行为 |
| --- | --- |
| 会话级 `SET`（如 `SET work_mem`、`SET TIME ZONE` 后跨事务依赖它） | 不可靠：事务结束连接即归还，下个事务可能落到另一条后端连接上，设置丢失；事务内用 `SET LOCAL` 仍然有效 |
| 命名预备语句（PREPARE / 驱动的 server-side prepare） | 跨事务不可用，会报预备语句不存在；PgBouncer 1.19 起可用 `max_prepared_statements` 做有限的预备语句跟踪缓解，以部署版本实测为准 |
| `LISTEN` / `NOTIFY` | `LISTEN` 需要长驻会话连接，transaction 模式下不可用 |
| 临时表 | 事务内创建的临时表随事务结束失去意义，跨事务使用临时表的写法失效 |
| 会话级 advisory lock | 跨事务持有不可靠（连接已归还），事务级 advisory lock（`pg_advisory_xact_lock`）可用 |
| `WITH HOLD` 游标 | 要求事务结束后仍持有游标，与归还时机冲突，不可用 |

取舍结论：新接入的 Web 与短事务应用直接选 transaction；老应用若重度依赖上表任一特性，先用 session 模式保命，把连接数压力靠调大 `default_pool_size` 分摊，再逐项改造。不要反过来先上 transaction 再等线上报错来倒查——失效方式是「偶发地落到另一条连接上」，属于最难排查的那类问题。

### 3.3 主配置示例与容量口径

按本站口径重写 `/etc/pgbouncer/pgbouncer.ini`（示例为与 PostgreSQL 同机、仅本机应用接入的保守起点）：

```ini
;; PgBouncer 主配置 —— 与 PostgreSQL 同机，仅供本机应用接入
[databases]
appdb = host=127.0.0.1 port=5432 dbname=appdb

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
;; auth_query 路线启用时取消下一行注释，并按 3.5 节建好查找函数
;auth_query = SELECT uname, phash FROM pgbouncer.user_lookup($1)
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 0
reserve_pool_size = 5
reserve_pool_timeout = 3
max_db_connections = 40
server_idle_timeout = 60
server_lifetime = 1800
query_wait_timeout = 15
log_pooler_errors = 1
stats_period = 60
admin_users = pgbadmin
stats_users = pgbadmin
```

关键参数逐项说明（数值为保守起点，不是定论，上线后按第四节的 `SHOW` 输出与压测结果再调）：

| 参数 | 起点值 | 含义与调法 |
| --- | --- | --- |
| `listen_addr` | `127.0.0.1` | 只绑本机；应用在别机时改为内网网卡地址并配防火墙，禁止写 `*` 对公网裸奔 |
| `listen_port` | `6432` | PgBouncer 默认端口，应用连接串要与之一致 |
| `pool_mode` | `transaction` | 见 3.2 节选型；改它只需 RELOAD，见第四节 |
| `max_client_conn` | `1000` | 允许的客户端连接上限，超过的连接直接被拒；按应用实例数乘单实例连接数估 |
| `default_pool_size` | `20` | 每个（用户，库）组合的后端连接数，是真正的并发执行上限 |
| `min_pool_size` | `0` | 常驻预热连接数；冷启动敏感可给小值，一般保持 0 |
| `reserve_pool_size` / `reserve_pool_timeout` | `5` / `3` | 池打满时额外允许的应急连接数与客户端最长等待秒数，防突发时直接报错 |
| `max_db_connections` | `40` | 每个库的后端连接总上限（跨用户合计），是容量口径的硬闸 |
| `server_idle_timeout` / `server_lifetime` | `60` / `1800` | 空闲后端连接回收秒数、单条后端连接最长存活秒数 |
| `query_wait_timeout` | `15` | 客户端等不到空闲后端连接时的最长排队秒数，超时报错好过无限堆积 |

容量估算口径：后端连接总数 ≈ 各库各用户池的 `pool_size` 之和，并受 `max_db_connections` 封顶；这个总数必须小于 PG 的 `max_connections` 减去预留（超级用户保留连接、备份与 DBA 直连、监控采集都要留位）。示例中 PG 默认 `max_connections = 100`，池侧封顶 40，留足余量；若把池调大，先同步评估 PG 侧上限与内存，不要只改一边。

### 3.4 认证路线一：auth_file（userlist.txt）

默认路线：PgBouncer 用自己的认证文件校验客户端口令，文件里存的不是明文，而是与 PG 一致的口令校验器字符串。本站 PG 口径是 SCRAM（第 05 章），userlist 里直接存 SCRAM 校验器，取法是从 PG 的系统目录读出该角色已存的校验器：

```bash
sudo -u postgres psql -c "SELECT rolname, rolpassword FROM pg_authid WHERE rolname IN ('appuser', 'pgbadmin');"
```

把输出的两行按 `"用户名" "校验器"` 格式写进 `/etc/pgbouncer/userlist.txt`：

```text
"appuser" "SCRAM-SHA-256$4096:此处为上一步查到的盐值部分$此处为校验器部分"
"pgbadmin" "SCRAM-SHA-256$4096:此处为上一步查到的盐值部分$此处为校验器部分"
```

其中 `pgbadmin` 若不在 PG 里建角色，可在 PG 里给任意已有强口令角色生成校验器借用，或单独在 PG 中建一个仅用于池管理的角色再取校验器——关键是 userlist 中的校验器必须是真实可验证的 SCRAM 串，抄写时整串一行不要断行。文件权限是硬要求：

```bash
sudo chown postgres:postgres /etc/pgbouncer/userlist.txt
sudo chmod 600 /etc/pgbouncer/userlist.txt
sudo ls -l /etc/pgbouncer/userlist.txt
```

注意对应关系：客户端连池时由池按 userlist 校验；池连后端时，PgBouncer 用客户端提供的口令向 PG 做 SCRAM 透传——这要求 PG 侧 `pg_hba.conf` 对 PgBouncer 所在地址（本机同机时为 `127.0.0.1/32`）放行 `scram-sha-256`，第 05 章的示例配置已包含回环地址的 SCRAM 行，同机部署无需再改；独立机部署时按来源地址补一行。auth_type 与后端认证方式的组合兼容面以 PgBouncer 官方兼容表为准，老版本对 SCRAM 透传的支持不完整，装旧版本时先查表再定 `auth_type`。

### 3.5 认证路线二：auth_query（口令不落盘在池端）

用户多、口令轮换频繁时，逐台维护 userlist 很痛苦。auth_query 路线让 PgBouncer 在需要时向 PG 现查口令校验器，userlist 里只保留一个专职查询账号 `pgbouncer` 的条目，应用用户的口令只存在于 PG 一处。

第一步，在目标库里按官方文档的标准写法建查找函数（`SECURITY DEFINER`，以函数属主权限读 `pg_shadow`，并把执行权限只授给查询账号）：

```sql
CREATE ROLE pgbouncer LOGIN PASSWORD '此处填强口令';
CREATE SCHEMA pgbouncer;
CREATE OR REPLACE FUNCTION pgbouncer.user_lookup(in i_username text, out uname text, out phash text)
RETURNS record AS $$
BEGIN
    SELECT usename, passwd FROM pg_catalog.pg_shadow WHERE usename = i_username INTO uname, phash;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION pgbouncer.user_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pgbouncer.user_lookup(text) TO pgbouncer;
```

第二步，ini 里补两处（3.3 节示例已预留注释行）：

```ini
auth_user = pgbouncer
auth_query = SELECT uname, phash FROM pgbouncer.user_lookup($1)
```

并在 userlist.txt 里只留查询账号一行（它的校验器仍从 PG 取，方法同 3.4 节）：

```text
"pgbadmin" "SCRAM-SHA-256$4096:此处为实际盐值部分$此处为实际校验器部分"
"pgbouncer" "SCRAM-SHA-256$4096:此处为实际盐值部分$此处为实际校验器部分"
```

注意：`[databases]` 里每个库都要能执行这条查询——函数建在哪个库，池就只对那个库能用 auth_query；多库场景要逐库建。`pgbouncer` 角色只给 `LOGIN` 与函数执行权限，不要给它任何业务表权限。函数属主即建函数的超级用户，`SECURITY DEFINER` 意味着它能以属主权限读口令哈希，所以函数体必须保持上面这份官方标准写法，不要在里面拼字符串或放宽 `REVOKE`。

### 3.6 启动与应用接入

```bash
sudo systemctl start pgbouncer
sudo systemctl status pgbouncer --no-pager
sudo ss -tlnp | grep 6432
sudo tail -n 30 /var/log/postgresql/pgbouncer.log
```

`ss` 应只显示监听 127.0.0.1:6432（或你配置的内网地址）。应用侧只改连接串：主机端口由 `5432` 改为 `6432`，用户名、口令、库名不变。例如 JDBC 串 `jdbc:postgresql://127.0.0.1:5432/appdb` 改为 `jdbc:postgresql://127.0.0.1:6432/appdb`。若应用在独立机器、PgBouncer 与 PG 同机部署在数据库机上，则把 `listen_addr` 改为该机内网地址，并按第 05 章的分层防御给 6432 加同口径的防火墙放行（只放行应用服务器地址）。

## 四、效果验证与测试

第一层，管理控制台：管理库名为 `pgbouncer`，只能由 `admin_users` / `stats_users` 里的账号连接（示例为 `pgbadmin`），且按本章口径只从本机连：

```bash
PGPASSWORD='此处填 pgbadmin 的实际口令' psql -h 127.0.0.1 -p 6432 -U pgbadmin -d pgbouncer
```

进入后依次执行：

```sql
SHOW POOLS;
SHOW CLIENTS;
SHOW SERVERS;
SHOW STATS;
```

`SHOW POOLS` 每行是一个（库，用户）池：重点看 `cl_active`（活跃客户端连接）、`cl_waiting`（在排队等后端连接的客户端，非 0 说明池不够用）、`sv_used`（正在被用的后端连接）、`pool_mode` 是否与配置一致。`SHOW SERVERS` 里应能看到指向 127.0.0.1:5432 的后端连接（有应用流量后出现）。

第二层，配置热加载：改完 ini 不必重启，管理库里执行 `RELOAD;` 即可让新配置生效（监听地址、端口这类参数除外，它们要重启服务）：

```sql
RELOAD;
```

第三层，应用侧冒烟：把一套应用（或其测试实例）的连接串切到 6432，跑核心读写路径，同时在另一个终端观察 `SHOW POOLS` 里 `appdb` 行的 `cl_active` 与 `sv_used` 随请求起伏——客户端连接数涨上去时，后端 `sv_used` 应封顶在池大小附近而不是跟着涨，这个现象出现才算池真的在工作。冒烟命令示例：

```bash
PGPASSWORD='此处填 appuser 的实际口令' psql -h 127.0.0.1 -p 6432 -U appuser -d appdb -c "SELECT current_user, current_database();"
sudo grep -i error /var/log/postgresql/pgbouncer.log | tail
```

日志侧确认无持续的认证失败或 `pooler error` 刷屏；`log_pooler_errors` 已在示例配置中开启，零星错误看原文定位，成片出现先查 3.4/3.5 的认证配置。

## 五、常见错误与排坑指南

场景一：应用切到 transaction 模式后偶发报错，日志或应用侧出现预备语句不存在、设置不生效。现象与根源对照 3.2 节清单：多半是驱动默认开启了 server-side prepare（命名预备语句跨事务失效），或代码里把会话级 `SET` 当全局开关用。修复顺序：先确认是否命中清单——命中就改应用（驱动侧关掉预备语句或改用事务内写法），实在改不动则把该应用对应的池切回 session 模式排障，不要为了迁就一个应用把全池模式改掉。

场景二：客户端连接被拒，PgBouncer 日志出现认证失败。先分清是哪一段：池校验客户端失败，看 userlist 里该用户的校验器是否整串抄全、是否与 PG 里当前的 `rolpassword` 一致（PG 侧改过口令而 userlist 没同步是 auth_file 路线最常见的坑，走 auth_query 路线则无此问题）；池连后端失败，看 PG 的 `pg_hba.conf` 是否放行了池所在地址的 SCRAM 行、日志里 PG 侧的报错原文。

场景三：`cl_waiting` 持续大于 0、应用侧报等待超时。池太小或慢查询把后端连接占满了：先看 `SHOW SERVERS` 与 PG 的 `pg_stat_activity` 分清是连接不够还是查询太慢——慢查询占着连接时盲目调大 `default_pool_size` 只会把压力转嫁给 PG；确属并发不足再按 3.3 节容量口径同步评估 PG 侧上限后调大，并复核 `query_wait_timeout` 是否过短。

场景四：改了 ini 重启后服务起不来。PgBouncer 对 ini 语法错误会直接拒绝启动并在日志里指出行号，`systemctl status` 只给一句失败，细节看日志：

```bash
sudo journalctl -u pgbouncer -n 50 --no-pager
sudo tail -n 50 /var/log/postgresql/pgbouncer.log
```

最常见的是参数值拼写错误与 auth_file 路径/权限不对（文件属主不是 `postgres` 或权限不是 600 时从严拒绝）。改不动时先用 3.1 节的备份 ini 覆盖回去启动，再离线逐项比对。

## 六、生产环境最佳实践与安全建议

第一，网络面收口：6432 只绑本机或内网地址，防火墙按应用服务器地址放行，管理账号（`admin_users` / `stats_users`）只允许本机连接，管理口令独立保管，不要与应用口令复用。第二，认证路线二选一后坚持到底：auth_file 路线把「PG 改口令后同步 userlist」写进口令轮换清单；auth_query 路线盯住 `user_lookup` 函数的权限面，任何人提议放宽 `REVOKE` 都要驳回。第三，容量与告警：对 `cl_waiting` 大于 0、`sv_used` 长期贴近池上限设告警，调池参数时连同 PG 的 `max_connections` 一起评审，变更记录里写清改前改后数值。第四，连接串变更要灰度：一套应用先切池、观察一个业务高峰再全量切，不要全站同时改连接串。

### 回滚与恢复：摘除连接池，应用改回直连

PgBouncer 是无状态的池层：它不存业务数据，后端连接也只是转发通道，所以摘除它不涉及任何数据迁移，回滚动作只有「应用改回直连 + 停掉池层」两步，顺序不能反——先摘流量、再停服务，避免应用还指着 6432 时池先没了。

第一步，把各应用连接串的端口由 `6432` 改回 `5432`（第二节里留的那份接入前清单此刻派上用场），逐套重启或重载应用，并逐套验证核心读写恢复直连：

```bash
PGPASSWORD='此处填 appuser 的实际口令' psql -h 127.0.0.1 -p 5432 -U appuser -d appdb -c "SELECT current_user, current_database();"
sudo -u postgres psql -c "SELECT usename, client_addr, state FROM pg_stat_activity WHERE usename = 'appuser';"
```

`pg_stat_activity` 里应能看到应用以直连方式（来源端口不再是池进程）建立的会话。第二步，确认管理控制台里已无客户端连接后停用并禁止 PgBouncer 自启：

```sql
SHOW CLIENTS;
```

```bash
sudo systemctl stop pgbouncer
sudo systemctl disable pgbouncer
sudo ss -tlnp | grep 6432
```

`ss` 无 6432 监听即摘除完成。第三步，善后保留：`/etc/pgbouncer/` 整个目录（含 ini 备份与 userlist）先打包留存再考虑删除，日后重新启用或复盘都靠它；若当初为独立机部署在 PG 的 `pg_hba.conf` 里加过放行行、为 6432 加过防火墙规则，一并按原记录逐项撤销，不要留下无人认领的放行规则。

```bash
sudo tar -czf /root/pgbouncer-config-$(date +%F).tar.gz -C /etc pgbouncer
sudo ls -l /root/pgbouncer-config-*.tar.gz
```
