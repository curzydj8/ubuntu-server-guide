---
description: "默认参数的目标是「小机器也能装起来」，不是「在你的生产机上跑得好」。用默认值上线，常见结果是内存有 8 GB、缓冲池却只用一小块，热点数据反复读盘；或连接数顶不住连接池，高峰直接报耗尽。"
---

# MySQL 核心参数调优

## 一、概述与使用场景

默认参数的目标是「小机器也能装起来」，不是「在你的生产机上跑得好」。用默认值上线，常见结果是内存有 8 GB、缓冲池却只用一小块，热点数据反复读盘；或连接数顶不住连接池，高峰直接报耗尽。本章只讲影响最大的六组参数：`innodb_buffer_pool_size`、`innodb_buffer_pool_instances`、`max_connections`、`innodb_log_file_size`、`innodb_flush_log_at_trx_commit` 与 `sync_binlog`，外加 `utf8mb4` 三层统一。每个数值都给计算依据，纪律是：一次只改一组、改前备份、改后用 `SHOW VARIABLES` 验证，不要把抄来的整页参数一次灌进生产。

适用场景：新实例基线调优、排除明显配置瓶颈、升配后重算参数。慢 SQL 与缺索引先用慢查询日志定位，调参数救不了烂查询。

## 二、环境准备与前置条件（Ubuntu 22.04/24.04 LTS、权限、依赖包）

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Ubuntu Server 22.04 / 24.04 LTS | MySQL 8.0 或 MariaDB 已按第 11.1、11.2 章部署 |
| 数据库权限 | 管理账号可执行 `SHOW VARIABLES` 与重启服务 | 改 `my.cnf` 需要文件写权限加 `sudo` |
| 已知输入 | 物理内存总量、同机是否还有其他大内存服务、应用连接池配置 | 这三项决定缓冲池与连接数的取值，没有它们不要动手改 |
| 变更窗口 | 需要一次服务重启 | 多数 InnoDB 参数改文件后必须重启才生效，安排在低峰期 |

先收集现状，后面每个计算都要用到：

```bash
free -h
nproc
sudo mysql -u root -e "SHOW VARIABLES LIKE 'innodb_buffer_pool_size';"
sudo mysql -u root -e "SHOW VARIABLES LIKE 'max_connections';"
sudo mysql -u root -e "SHOW VARIABLES LIKE 'character_set%';"
sudo mysql -u root -e "SHOW GLOBAL STATUS LIKE 'Threads_connected';"
sudo mysql -u root -e "SHOW GLOBAL STATUS LIKE 'Max_used_connections';"
```

`Max_used_connections` 是历史峰值连接数，是估算 `max_connections` 的重要参考；刚上线的实例没有历史数据时，按应用连接池配置计算（见 3.3 节）。

!!! warning "调优前先确认瓶颈不在别处"
    若 CPU 长期被单条慢查询打满、或磁盘延迟本身异常，先处理查询与硬件。缓冲池调大对「数据根本放不进内存且查询已优化」的场景最有效，对全表扫描型烂查询几乎无效。

## 三、手把手操作步骤（完整命令可复制；配置文件给完整路径；改任何配置前先给 cp 备份命令；关键参数逐行/表格讲解；禁止出现「...」省略与「自行配置」「略」字样）

MySQL 主配置文件为 `/etc/mysql/mysql.conf.d/mysqld.cnf`，本章所有参数都写在 `[mysqld]` 段下。动手前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
sudo grep -n "innodb_buffer_pool_size\|max_connections\|character-set" /etc/mysql/mysql.conf.d/mysqld.cnf
```

MariaDB 对应文件常见为 `/etc/mysql/mariadb.conf.d/50-server.cnf`，参数名与含义基本一致，改前同样先备份该文件。

### 3.1 innodb_buffer_pool_size：按内存 50%～70% 计算

这是 InnoDB 最重要的参数：表数据与索引先缓存在这里，命中内存就不用读盘。取值公式：

```text
专用数据库服务器：innodb_buffer_pool_size = 物理内存 × 60%～70%
数据库与应用同机：innodb_buffer_pool_size = 物理内存 × 50%，且必须先扣除应用预留内存再验算
无论哪种：至少给操作系统、文件缓存、每连接缓冲与运维工具预留 20%～30%
```

计算示例（8 GB 内存、专机部署 MySQL）：物理内存 8 GB × 65% ≈ 5.2 GB，向下取整为 `5G`。预留核对：系统与文件缓存约 1.5 GB、连接开销按 3.3 节约 0.5 GB、备份与监控约 0.8 GB，合计预留约 2.8 GB，5 GB 加 2.8 GB 不超过 8 GB，取值成立。若同机还跑着占 2 GB 的 Java 应用，则先扣应用：可用约 6 GB 再取 60% 约 3.6 GB，取 `3G` 更稳妥，不要仍按整机 8 GB 硬套 5 GB，否则高峰期会触发 swap，性能断崖式下跌。参考速查（专机、取整后）：

| 物理内存 | 推荐取值 | 计算过程 |
| --- | --- | --- |
| 2 GB | `1G` | 2 × 50%，小内存多留给系统 |
| 4 GB | `2G` | 4 × 50%～60% 取下限保稳定 |
| 8 GB | `5G` | 8 × 65% ≈ 5.2，取整 5 |
| 16 GB | `11G` | 16 × 70% ≈ 11.2，取整 11 |
| 32 GB | `22G` | 32 × 70% ≈ 22.4，取整 22 |

配置写法：

```ini
[mysqld]
innodb_buffer_pool_size = 5G
```

数据总量远小于内存时，缓冲池不必硬撑比例：数据只有 800 MB 的小库，给 `1G` 已能全量缓存，再大只是浪费。判断依据是数据加索引的总量，可查：

```sql
SELECT table_schema, ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) AS size_mb
FROM information_schema.TABLES GROUP BY table_schema;
```

### 3.2 innodb_buffer_pool_instances：与缓冲池大小配套

该参数把缓冲池切成多个实例分摊锁竞争。规则：小于 1 GB 保持 `1`；大于等于 1 GB 时约每 1 GB 一个、上限 8～16。`5G` 取 `5`，`11G` 取 `8` 即可。过多实例会增加开销且每实例太小反而降低命中。

```ini
innodb_buffer_pool_instances = 5
```

MariaDB 修改后必须按第四节验证实际生效值。

### 3.3 max_connections：按应用连接池估算

该参数是服务端允许的最大并发连接数。默认值在很多部署里偏小，但盲目调到几千同样有害：每个连接都有内存开销，连接数失控往往说明应用没用好连接池，而不是数据库给得不够。计算公式：

```text
max_connections = 全部应用实例的连接池上限之和 + 运维与监控预留（20～30）
```

计算示例：Web 应用部署 3 个实例、每个实例连接池最大 30，则业务合计 90；加监控采集 5、备份与运维预留 20，合计 115，向上取整并留约三成余量，定为 `200`。单实例应用连接池 20 时，同理定 `100` 就足够，不要抄别人的 `1000`。还要同步核对应用侧：连接池上限之和绝不能超过数据库的 `max_connections`，否则高峰期必然有一部分实例拿不到连接。内存验算：粗略按每连接空闲约 1～3 MB、执行复杂查询时占用更多估算，200 个连接预留约 0.5 GB 已计入 3.1 的预留，这也是连接数不能无限放大的原因。

```ini
max_connections = 200
```

临时救急可在不重启时在线调整（重启后仍以配置文件为准，两处要一致）：

```sql
SET GLOBAL max_connections = 200;
SHOW VARIABLES LIKE 'max_connections';
```

### 3.4 innodb_log_file_size：重做日志大小

该参数控制 InnoDB 重做日志单个文件大小（对应日志组总容量还与文件个数相关）。值太小会频繁刷盘、写入被日志切换拖慢；太大则崩溃恢复时重放更久。经验取值：中小实例（缓冲池 2～11 GB）取 `512M`；写入量大的实例可取 `1G`。依据是让日志能容纳约一小时高峰写入而不频繁切换，同时把崩溃恢复时间控制在可接受范围。8 GB 内存示例机取 `512M`：

```ini
innodb_log_file_size = 512M
```

!!! note "版本差异提示"
    MySQL 8.0 较新版本可用 `innodb_redo_log_capacity` 统一管理重做日志总容量，与旧的 `innodb_log_file_size` 不要在同一配置里互相矛盾地重复设置。以你机器的实际版本文档为准，改后用 `SHOW VARIABLES` 验证哪个参数在生效。MariaDB 沿用 `innodb_log_file_size` 方式。

### 3.5 innodb_flush_log_at_trx_commit 与 sync_binlog：性能与安全的权衡

这两个参数决定事务提交时日志刷盘的严格程度，直接在「性能」与「断电不丢数据」之间取舍，必须按业务容忍度选，不要抄「最快组合」上生产：

| 参数与取值 | 行为 | 断电后果 | 适用 |
| --- | --- | --- | --- |
| `innodb_flush_log_at_trx_commit = 1` | 每次提交都刷盘 | 已提交事务不丢 | 生产默认，金融与订单类必须 |
| `innodb_flush_log_at_trx_commit = 2` | 每次提交写系统缓存、每秒刷盘 | 可能丢约 1 秒已提交事务 | 可容忍秒级丢失的日志类业务 |
| `innodb_flush_log_at_trx_commit = 0` | 每秒统一写并刷盘 | 可能丢约 1 秒且风险更高 | 仅测试环境 |
| `sync_binlog = 1` | 每次提交同步刷 binlog | 与上一项同为 1 时保证主从数据一致口径最严 | 开启主从或依赖 binlog 恢复时必选（见第 11.4 章） |
| `sync_binlog = 0` | 交给系统决定刷盘时机 | 断电可能丢 binlog 事件 | 不做时间点恢复的次要实例 |

生产基线组合就是双 `1`：

```ini
innodb_flush_log_at_trx_commit = 1
sync_binlog = 1
```

把它们改成非 1 换性能前，必须书面确认业务能承受秒级数据丢失，并记录在运维文档中。多数「数据库慢」的问题根源不在这里，用丢数据风险去换，往往得不偿失。

### 3.6 字符集 utf8mb4 三层统一：server、库、连接

乱码与 `Incorrect string value` 的总根源是三层字符集不一致，必须一次统一。第一层，服务端默认，在 `mysqld.cnf` 的 `[mysqld]` 段写：

```ini
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

客户端默认连接字符集在同一文件或客户端配置段写明（MySQL 客户端配置常见于 `/etc/mysql/mysql.conf.d/mysql.cnf` 的 `[mysql]` 段，改前先备份该文件）：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysql.cnf /etc/mysql/mysql.conf.d/mysql.cnf.bak.$(date +%F-%H%M)
```

```ini
[mysql]
default-character-set = utf8mb4
```

第二层是库与表：第 11.2 章建库时已指定 `utf8mb4`，已建错的库按下面语句逐库修正（只改库默认值，新建表才继承，老表需逐表转换，操作前先备份）：

```sql
ALTER DATABASE appdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE appdb.t_demo CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

第三层是连接：应用连接串里显式声明，例如 JDBC 连接串带 `characterEncoding=utf8mb4` 的等效参数（以对应驱动文档为准），或每次连接后执行：

```sql
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'collation%';
```

三层都为 `utf8mb4` 才算完成，只改服务端不改连接，应用写入时仍会按旧字符集转换，照样出错。

### 3.7 汇总配置并重启

把本章选定值汇总进 `[mysqld]` 段（以 8 GB 示例机为例），保存后重启并逐项验证：

```ini
[mysqld]
innodb_buffer_pool_size = 5G
innodb_buffer_pool_instances = 5
max_connections = 200
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 1
sync_binlog = 1
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

```bash
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
sudo tail -n 50 /var/log/mysql/error.log
```

## 四、效果验证与测试（检查命令 + 期望输出示例）

重启后逐项用 `SHOW VARIABLES` 核对，配置文件写对不等于已生效，报错被忽略、参数名写错都会导致仍跑旧值：

```sql
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'innodb_buffer_pool_instances';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'innodb_log_file_size';
SHOW VARIABLES LIKE 'innodb_flush_log_at_trx_commit';
SHOW VARIABLES LIKE 'sync_binlog';
SHOW VARIABLES LIKE 'character_set_server';
```

期望输出示例（缓冲池以字节显示，`5G` 对应 `5368709120`）：

```text
Variable_name              Value
innodb_buffer_pool_size    5368709120
innodb_buffer_pool_instances 5
max_connections            200
innodb_log_file_size       536870912
innodb_flush_log_at_trx_commit 1
sync_binlog                1
character_set_server       utf8mb4
```

再做功能验证：写入带 emoji 与生僻字的内容并读回，确认无乱码、无报错：

```sql
INSERT INTO appdb.t_demo (id, note) VALUES (2, '测试：中文、emoji 与生僻字');
SELECT id, note, HEX(note) FROM appdb.t_demo WHERE id = 2;
SHOW GLOBAL STATUS LIKE 'Threads_connected';
```

最后观察一段时间缓冲池命中情况，粗略判断取值是否合理：

```sql
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';
```

其中物理读 `Innodb_buffer_pool_reads` 相对逻辑读 `Innodb_buffer_pool_read_requests` 占比很低，说明热点数据基本命中内存；占比持续偏高时，先查慢查询与索引，再考虑继续加大缓冲池。

## 五、常见错误与排坑指南（2~3 个真实报错场景：报错原文片段+原因+修复命令；含本简报点名的经典报错）

### 场景一：中文与 emoji 入库报 Incorrect string value

报错原文：

```text
ERROR 1366 (HY000): Incorrect string value: '\xF0\x9F...' for column 'note' at row 1
```

原因：目标列或连接字符集仍是旧 `utf8`（`utf8mb3`），装不下 4 字节字符，写入到该字符处被拒绝。修复按三层顺序处理：先查清哪层错：

```sql
SELECT table_name, column_name, character_set_name
FROM information_schema.COLUMNS WHERE table_schema = 'appdb';
SHOW VARIABLES LIKE 'character_set%';
```

再把库表转成 `utf8mb4`（见 3.6 节的 `ALTER` 语句，执行前先备份），并让应用连接显式用 `utf8mb4` 后重连验证。只改服务端一层、连接层仍旧时，该报错会继续出现，不要误判为语句没生效。

### 场景二：改完参数重启失败或参数没生效

报错原文片段：

```text
[ERROR] [MY-000067] [Server] unknown variable 'max_connection=200'
Job for mysql.service failed
```

原因：参数名写错（正确是 `max_connections`）、把参数写到了错误的配置段、或新旧两套参数互相冲突（如重做日志两代参数同写）。修复：先看错误日志定位具体哪行，再改回并用备份对照：

```bash
sudo tail -n 100 /var/log/mysql/error.log
sudo grep -n "max_connections" /etc/mysql/mysql.conf.d/mysqld.cnf
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf.bak.2026-10-21-1000 /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

备份文件名按你实际备份时生成的名字替换。若服务已起但 `SHOW VARIABLES` 显示旧值，多半是改了没被加载的配置文件（例如改了 MariaDB 路径下的文件、实际跑的是 MySQL），用 `mysqld --verbose --help | grep -A 1 "Default options"` 确认实际读取顺序。

### 场景三：连接数耗尽 Too many connections

报错原文：

```text
ERROR 1040 (HY000): Too many connections
```

原因：应用连接未释放、连接池上限之和超过服务端上限，或慢查询堆积把连接全部占住。先用管理通道查现场（管理账号通常还能挤进保留连接）：

```sql
SHOW FULL PROCESSLIST;
SHOW GLOBAL STATUS LIKE 'Max_used_connections';
SELECT COUNT(*) FROM information_schema.PROCESSLIST;
```

应急先处理长事务与异常连接，再按 3.3 的公式重算两边上限：应用池总和降下来或服务端上限按公式提上去，二者必须对齐。不要只把服务端一路调大掩盖连接泄漏，泄漏不修，调多大都会再次耗尽。

## 六、生产环境最佳实践与安全建议

第一，变更走清单：记录旧值与依据、备份、一次改一组、低峰重启、验证、观察一个高峰再归档。第二，比例不是教条：50%～70% 适用于专机，混部先扣其他服务，数据量小于内存时按数据量给。第三，双 `1` 是安全基线，改动必须有业务方书面容忍结论。第四，连接治理在应用侧，池上限与数据库上限一起评审。第五，定期记录命中率与连接峰值，业务量翻倍时按公式重算。下一章讲备份与还原演练。
