# MySQL 用户、权限与安全远程访问

## 一、概述与使用场景

建账号是最容易埋雷的一步。给应用一个 `root`，或一句 `GRANT ALL PRIVILEGES ON *.* TO 'appuser'@'%'`，在生产上等于把整库钥匙复制无数份：应用一旦被注入，攻击者拿到的是删库、建后门、读全部数据的能力。本章给出标准动作：用 `utf8mb4` 建库、一个应用一个账号、按库按操作授予最小权限、用 `SHOW GRANTS` 复核、用 `REVOKE` 回收；远程访问走分层防线——`bind-address` 定监听、UFW 只放行内网来源、账号再限来源，3306 绝不对公网全开。

适用场景：新业务建库建号、多应用共用一台 MySQL 做隔离、内网远程管理、旧库权限盘查。示例库名 `appdb`、应用账号 `appuser`、运维账号 `opsadmin`，来源只用文档段 `192.0.2.0/24` 与示例主机 `198.51.100.10`，密码一律 `<password>` 占位，请替换为自生成的强口令。

## 二、环境准备与前置条件（Ubuntu 22.04/24.04 LTS、权限、依赖包）

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Ubuntu Server 22.04 / 24.04 LTS | 已按第 11.1 章完成 MySQL 8.0 或 MariaDB 安装与安全初始化 |
| 数据库权限 | 可用 `root` 或等效管理账号本机登录 | 本章的建号、授权、回收都在此账号下执行 |
| 系统权限 | 登录用户 `ubuntu` / `opsadmin` 具备 `sudo` | 改配置与防火墙需要 |
| 防火墙 | UFW 已安装（Ubuntu 默认自带） | 未启用时本章给出启用顺序，注意不要把自己锁在 SSH 外面 |
| 网络规划 | 已明确哪些来源需要远程连库 | 只写内网段或跳板机地址，禁止写「全网」 |

操作前先确认服务与登录通道正常，并看一眼现有账号清单，做到心里有数再动手：

```bash
sudo systemctl status mysql --no-pager
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;"
sudo ufw status verbose
ip -4 addr show
```

!!! warning "先保住管理通道再改权限"
    任何 `DROP USER`、`REVOKE`、改 `bind-address` 或改防火墙的操作，都遵循同一纪律：保持当前已登录的数据库会话与 SSH 会话不关闭，改完先新开一个终端验证成功，再关旧会话。在远程机器上改 UFW 时，务必先放行 SSH 的 22 端口，再启用或收紧规则。

## 三、手把手操作步骤（完整命令可复制；配置文件给完整路径；改任何配置前先给 cp 备份命令；关键参数逐行/表格讲解；禁止出现「...」省略与「自行配置」「略」字样）

### 3.1 建库：字符集一次定对 utf8mb4

```sql
CREATE DATABASE appdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW CREATE DATABASE appdb;
SHOW CHARACTER SET LIKE 'utf8mb4';
```

讲解：`utf8mb4` 每字符最多 4 字节，能容纳 emoji 与生僻汉字；旧 `utf8` 实为最多 3 字节的 `utf8mb3`，存 emoji 会报错，不要选。`utf8mb4_unicode_ci` 是比较与排序规则，`_ci` 表示不区分大小写，适合绝大多数业务；全库必须统一规则。MariaDB 建库语句通用。字符集要在建库时定好，事后改库默认值不会自动改已建表，补救成本远高于一次定对（三层配置见第 11.3 章）。

批量盘查现有库的字符集用：

```sql
SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA;
```

### 3.2 建应用账号：一个应用一个账号，带来源限制

MySQL 的账号由「用户名 + 来源主机」共同标识，`'appuser'@'localhost'` 与 `'appuser'@'192.0.2.%'` 是两个完全不同的账号，密码与权限互不相通。建号语句：

```sql
-- 应用与数据库同机部署时：只允许本机连接
CREATE USER 'appuser'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<password>';

-- 应用部署在内网另一台机器时：只允许示例内网段连接，二选一，不要两个都建
CREATE USER 'appuser'@'192.0.2.%' IDENTIFIED WITH caching_sha2_password BY '<password>';

SELECT user, host, plugin FROM mysql.user WHERE user = 'appuser';
```

要点：`%` 单独作来源表示任意地址，生产默认禁止；口令不少于 12 位，写入应用侧密钥配置，不要硬编码进代码仓库。MariaDB 建号语法相同。

再建一个仅供人工运维、来源限定到跳板机的管理账号，日常替代 `root` 使用：

```sql
CREATE USER 'opsadmin'@'198.51.100.10' IDENTIFIED WITH caching_sha2_password BY '<password>';
GRANT ALL PRIVILEGES ON *.* TO 'opsadmin'@'198.51.100.10' WITH GRANT OPTION;
```

注意这句 `ALL ON *.*` 只允许给这种来源锁死、专人保管的管理账号，应用账号永远不许这样授权，两者的区别正是下一节的主题。

### 3.3 按库最小权限授权：GRANT 的正确粒度

应用账号只给业务库的日常增删改查：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON appdb.* TO 'appuser'@'localhost';
-- 若 3.2 建的是内网来源账号，则把上一句的主机部分换成对应来源再执行
GRANT SELECT, INSERT, UPDATE, DELETE ON appdb.* TO 'appuser'@'192.0.2.%';
FLUSH PRIVILEGES;
```

`appdb.*` 表示该库的全部表；需要更细时可收到表级，例如只允许报表程序读一张表：`GRANT SELECT ON appdb.report_view TO 'appuser'@'localhost';`。`CREATE USER` 与 `GRANT` 在当前版本中会自动刷新权限，`FLUSH PRIVILEGES` 在直接改权限表时才必需，此处保留执行无副作用，养成习惯。

`GRANT SELECT, INSERT, UPDATE, DELETE` 与 `GRANT ALL PRIVILEGES` 的区别必须分清：

| 对比项 | SELECT, INSERT, UPDATE, DELETE | ALL PRIVILEGES |
| --- | --- | --- |
| 读、写、改、删数据 | 全部具备，满足日常业务 | 具备 |
| 建表、改表、删表（CREATE / ALTER / DROP） | 不具备，结构变更会被拒绝 | 具备，可直接删表删库 |
| 建索引、建视图、建存储过程 | 不具备 | 具备 |
| 给别人授权（GRANT OPTION） | 不具备（除非单独加） | 仅在额外带 `WITH GRANT OPTION` 时具备 |
| 泄露后的破坏半径 | 限于该库的数据读写 | 整个授权范围内的结构与数据 |

结论：应用运行账号用前者；表结构变更走发布流程，用管理账号单独执行，不要为了让迁移脚本跑通就给应用账号长期开 `ALL`。确实需要应用自动建临时表等特殊能力时，单独评估后追加单项权限，例如 `GRANT CREATE TEMPORARY TABLES ON appdb.* TO 'appuser'@'localhost';`，加一项记一项，进账号台账。

只读与备份类账号同理按需拆分，备份账号示例（备份原理见第 11.4 章）：

```sql
CREATE USER 'backupuser'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<password>';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, RELOAD, LOCK TABLES, REPLICATION CLIENT ON appdb.* TO 'backupuser'@'localhost';
GRANT SELECT ON mysql.* TO 'backupuser'@'localhost';
```

不同备份方式需要的权限略有增减，原则不变：只读为主，不给任何写与删权限。

### 3.4 查看权限与回收权限

授权后必须复核，不要凭感觉认为已经生效：

```sql
SHOW GRANTS FOR 'appuser'@'localhost';
SHOW GRANTS FOR 'appuser'@'192.0.2.%';
SELECT user, host FROM mysql.user;
```

回收权限用 `REVOKE`，人员离职、应用下线、来源地址变更时第一时间执行：

```sql
-- 收回某一类权限
REVOKE DELETE ON appdb.* FROM 'appuser'@'localhost';

-- 收回该账号在某库的全部权限（保留账号本身）
REVOKE ALL PRIVILEGES ON appdb.* FROM 'appuser'@'localhost';

-- 账号不再使用：先改口令封停观察，再删除
ALTER USER 'appuser'@'localhost' ACCOUNT LOCK;
DROP USER 'appuser'@'localhost';
```

回收后再次 `SHOW GRANTS` 验证，并让应用做一次连接回归。特别注意：`REVOKE` 写错主机部分会收错账号，MySQL 按「用户名 + 来源」精确匹配，执行前先把 `SHOW GRANTS` 的输出完整抄下来对照再动手。

### 3.5 安全远程访问第一层：修改 bind-address

默认 `bind-address = 127.0.0.1` 表示只监听本机回环，同机应用可连、任何远程机器都连不进来。要开放内网远程，先备份再改配置。MySQL 的主配置文件路径为 `/etc/mysql/mysql.conf.d/mysqld.cnf`：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
sudo grep -n "bind-address" /etc/mysql/mysql.conf.d/mysqld.cnf
```

用编辑器打开该文件，找到 `[mysqld]` 段的 `bind-address` 一行，按你的部署二选一修改：

```ini
# 方案一：只监听服务器的内网地址（推荐，示例地址替换为本机内网 IP）
bind-address = 192.0.2.20

# 方案二：监听全部地址，仅当机器有多网卡且外层防火墙已严格收紧时使用
bind-address = 0.0.0.0
```

逐行讲解：方案一最稳妥——服务只在内网网卡上出现，即使防火墙规则写错，公网网卡上也没有数据库在监听。方案二把把关完全交给防火墙与安全组，任何一层失误都会直接暴露，选它必须同时满足下一节的 UFW 来源限制与云安全组来源限制双双到位。MariaDB 的对应配置常见于 `/etc/mysql/mariadb.conf.d/50-server.cnf`，改法相同，动手前同样先备份：

```bash
sudo cp /etc/mysql/mariadb.conf.d/50-server.cnf /etc/mysql/mariadb.conf.d/50-server.cnf.bak.$(date +%F-%H%M)
```

改完重启并验证监听：

```bash
sudo systemctl restart mysql
ss -tlnp | grep 3306
sudo mysql -u root -e "SHOW VARIABLES LIKE 'bind_address';"
```

### 3.6 安全远程访问第二层：UFW 只放行内网来源

服务开始监听内网后，用 UFW 把来源再收一层。先确保 SSH 已放行，再放行数据库，最后检查规则顺序与结果：

```bash
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow from 192.0.2.0/24 to any port 3306 proto tcp comment 'MySQL intranet only'
sudo ufw enable
sudo ufw status numbered
```

这条数据库规则的含义是：仅允许示例内网段 `192.0.2.0/24` 访问本机 3306，其余来源一律由 UFW 默认策略拒绝。把网段替换为你的真实内网段后执行，绝对不要写成 `sudo ufw allow 3306`——那等于对所有来源放行，与公网全开没有区别。如果数据库只供同机应用使用，根本不要加这条规则，保持 `bind-address = 127.0.0.1` 即可，连得越少越安全。云主机还必须同步检查云厂商安全组：入方向 3306 只允许同一内网段，UFW 与安全组两层口径一致才算数。规则变更后，从一台允许段内的机器和一台段外的机器各测一次连通性（命令见第四节），双向验证才算完成。

远程连接的完整验证命令（在来源机器上执行，需要装有 MySQL 客户端）：

```bash
mysql -h 192.0.2.20 -P 3306 -u appuser -p -e "SELECT CURRENT_USER(), @@hostname;"
```

## 四、效果验证与测试（检查命令 + 期望输出示例）

```sql
-- 1. 权限复核：输出应恰好是授权的那一行，没有多余的 ALL 与 *.*
SHOW GRANTS FOR 'appuser'@'localhost';
```

期望输出示例：

```text
Grants for appuser@localhost
GRANT USAGE ON *.* TO `appuser`@`localhost`
GRANT SELECT, INSERT, UPDATE, DELETE ON `appdb`.* TO `appuser`@`localhost`
```

其中 `GRANT USAGE ON *.*` 仅表示可登录、无任何库表权限，是正常现象，不是越权。

```bash
# 2. 应用账号功能验证：可写业务库，不可越界
mysql -u appuser -p -e "USE appdb; CREATE TABLE t_perm (id INT PRIMARY KEY, note VARCHAR(50));"
```

期望结果：因为没有 `CREATE` 权限，这条建表应被拒绝并返回权限错误，这正是最小权限生效的证据；日常增删改查则应正常：

```sql
-- 用已有表验证读写（表由管理账号预先建好）
INSERT INTO appdb.t_demo (id, note) VALUES (1, 'ok');
SELECT * FROM appdb.t_demo;
-- 越界访问系统库应被拒绝
SELECT user, host FROM mysql.user;
```

最后一条期望返回 `ERROR 1142 (42000): SELECT command denied` 一类拒绝信息。在远程验证环节，段内机器执行 3.6 的远程命令应成功返回当前账号，段外机器执行应超时或被拒绝；本机执行 `ss -tlnp | grep 3306` 的监听地址应与你选的 `bind-address` 方案一致。三项全对，本章才算完成。

## 五、常见错误与排坑指南（2~3 个真实报错场景：报错原文片段+原因+修复命令；含本简报点名的经典报错）

### 场景一：Access denied for user 'root'@'localhost'

报错原文：

```text
ERROR 1698 (28000): Access denied for user 'root'@'localhost'
ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)
```

原因分两类：1698 多因 `root` 走 `auth_socket`、当前系统身份不匹配（未加 `sudo`）；1045 带 `using password: YES` 则是密码不对或账号来源不匹配，例如拿 `'root'@'localhost'` 的密码去走 TCP 远程连接。修复：本机管理走 `sudo` 或管理账号，不要尝试远程用 `root`：

```bash
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user WHERE user='root';"
mysql -u opsadmin -h 127.0.0.1 -p -e "SELECT CURRENT_USER();"
```

### 场景二：Can't connect to MySQL server（bind-address 原因）

报错原文：

```text
ERROR 2003 (HY000): Can't connect to MySQL server on '192.0.2.20:3306' (111)
```

原因定位第一类——服务根本没在目标地址监听：`bind-address` 仍为 `127.0.0.1`、改完没重启、或改错了配置文件（MySQL 与 MariaDB 路径不同）。按顺序定位：

```bash
ss -tlnp | grep 3306
sudo grep -R "bind-address" /etc/mysql/
sudo systemctl restart mysql
sudo tail -n 50 /var/log/mysql/error.log
```

`ss` 输出若只有 `127.0.0.1:3306`，就是监听范围问题，与防火墙无关，先把监听改对再往下查。

### 场景三：Can't connect to MySQL server（防火墙原因）

报错原文：

```text
ERROR 2003 (HY000): Can't connect to MySQL server on '192.0.2.20:3306' (110)
```

与场景二的区别在括号里的状态：长时间无响应直至超时（110）更像包被防火墙丢弃，而 111 是目标明确拒绝。定位第二类原因——监听已正确（`ss` 能看到内网地址在听），但 UFW 或云安全组没有放行你的来源段，或来源 IP 写错（例如写了办公出口 IP 而应用在另一网段）：

```bash
sudo ufw status numbered
sudo ufw allow from 192.0.2.0/24 to any port 3306 proto tcp
# 在来源机器上分层测：先测端口通不通，再测数据库登录
nc -vz 192.0.2.20 3306
mysql -h 192.0.2.20 -u appuser -p -e "SELECT 1;"
```

端口不通先查防火墙与安全组，端口通但登录失败再回到账号与密码问题（注意账号的来源主机是否包含你的地址）。两类原因分开定位，不要一上来就把防火墙全关或把 `bind-address` 改成全网监听来「试试」，那会把排障变成新的事故。

## 六、生产环境最佳实践与安全建议

第一，账号台账化：记录用途、负责人、来源、权限与创建时间，离职与下线当天回收，每季度用 `SHOW GRANTS` 盘查一次，重点清理 `'%'` 与 `ALL` 账号。第二，应用绝不用 `root` 跑业务，口令放密钥管理，不进代码仓库、不写进镜像。第三，远程三层缺一不可：`bind-address` 限监听、安全组加 UFW 限来源、账号限来源与权限；想省任何一层就不开远程，优先走 SSH 隧道：

```bash
ssh -L 13306:127.0.0.1:3306 ubuntu@192.0.2.20
mysql -h 127.0.0.1 -P 13306 -u appuser -p
```

第四，权限变更留痕：来源变了就建新账号、验证、切流量、删旧账号。第五，巡查连接失败日志，对 `Access denied` 激增告警。下一章讲参数调优。
