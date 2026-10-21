# 容器化数据库与 MySQL 主从实战

## 一、概述与使用场景

容器化让数据库部署可复制、版本可锁定，适合测试环境、边缘节点与中小规模生产。但容器不会自动带来数据安全：选错存储方式数据随容器删除而丢失、密码写进镜像或仓库、端口映射到全网，都是真实事故来源。本章先讲 Docker 运行 MySQL/PostgreSQL 的最佳实践，再在裸机或容器均适用的层面完整实战 MySQL 主从复制，包括状态判读、延迟排查与经典排错。

适用边界：核心交易主库、超大规模实例优先裸机或云托管数据库；容器化更适合标准化交付与快速复制环境。无论哪种形态，红线一致：禁空密码、数据库端口不直接对公网全开、应用不用超级用户、备份必须做恢复验证。

## 二、环境准备与前置条件

系统为 Ubuntu 22.04/24.04 LTS，已安装 Docker Engine 与 Compose 插件，当前账号在 `docker` 组内或使用 `sudo`。MySQL 主从演练需要两台服务器，示例主库 192.0.2.21、从库 192.0.2.22，MySQL 版本为 8.0 系列（以当前官方稳定版为准）。操作前检查：

```bash
docker --version
docker compose version
docker ps
free -h
df -h /
ss -tlnp | grep -E '3306|5432'
sudo ufw status
```

## 三、手把手操作步骤

### 3.1 命名卷与绑定挂载对比与选择

| 对比项 | 命名卷（Named Volume） | 绑定挂载（Bind Mount） |
| --- | --- | --- |
| 声明方式 | `docker volume create` 或 Compose `volumes` | 直接映射宿主机目录 |
| 数据位置 | Docker 管理区 `/var/lib/docker/volumes` | 你指定的宿主机路径 |
| 权限处理 | 容器镜像默认适配，出错少 | 需手动对齐容器内 UID/GID，MySQL 常用 999、PostgreSQL 常用 999 或 70（以镜像为准） |
| 备份便利 | 需经容器或卷导出 | 宿主机直接打包目录 |
| 迁移便利 | 换机需导出导入 | 拷目录即可，但容易误带权限问题 |
| 推荐场景 | 绝大多数生产与测试，图省心与隔离 | 需要宿主机工具直接处理数据文件、合规要求数据落指定盘 |

选择结论：默认用命名卷；只有明确需要宿主机侧直接管理数据目录时才用绑定挂载，并把目录权限一次对齐：MySQL 示例 `sudo mkdir -p /data/mysql && sudo chown 999:999 /data/mysql && sudo chmod 750 /data/mysql`，PostgreSQL 同理替换为其镜像要求的属主。不要把数据目录绑到家目录或 `/tmp`。

### 3.2 Docker 运行 MySQL 与 PostgreSQL（含端口安全写法）

端口发布是容器数据库第一风险点。写法对比：`3306:3306` 等同于绑 `0.0.0.0` 对全网开放，禁止用于生产；`127.0.0.1:3306:3306` 只绑回环，本机应用与跳板访问可用；绑内网网卡如 `192.0.2.21:3306:3306` 只对内网暴露，再叠加防火墙白名单。Docker 会直接写 iptables，部分场景下绕过 `ufw` 默认链，因此端口绑定地址本身必须写对，不能只靠防火墙兜底。

MySQL 的 Compose 示例文件 `docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: app-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: "<password>"
      MYSQL_DATABASE: appdb
      MYSQL_USER: appuser
      MYSQL_PASSWORD: "<password>"
      TZ: Asia/Shanghai
    ports:
      - "127.0.0.1:3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
volumes:
  mysql_data:
```

PostgreSQL 的 Compose 示例：

```yaml
services:
  postgres:
    image: postgres:16
    container_name: app-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: "<password>"
      TZ: Asia/Shanghai
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
volumes:
  pg_data:
```

启动与检查：

```bash
docker compose up -d
docker compose ps
docker compose logs -f mysql
docker exec -it app-mysql mysql -u appuser -p'<password>' -e "SELECT VERSION();"
docker exec -it app-postgres psql -U appuser -d appdb -c "SELECT version();"
```

### 3.3 密码注入的安全注意事项与 secrets 替代

`environment` 写明文密码的隐患：`docker inspect` 可见、Compose 文件容易误提交 Git、镜像历史可能带残留。只适合本地演练。生产用 Docker secrets（Compose 支持文件式 secrets，Swarm 与单机 Compose 均可用），把密码放独立文件并设权限 `600`，且加入 `.gitignore`：

```bash
mkdir -p ~/db-secrets
printf '<password>' > ~/db-secrets/mysql_root_password.txt
printf '<password>' > ~/db-secrets/mysql_app_password.txt
chmod 600 ~/db-secrets/mysql_root_password.txt ~/db-secrets/mysql_app_password.txt
printf 'db-secrets/\n*.txt\n' >> .gitignore
```

Compose 改用 `_FILE` 后缀变量（MySQL 与 PostgreSQL 官方镜像均支持）：

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
      MYSQL_PASSWORD_FILE: /run/secrets/mysql_app_password
      MYSQL_DATABASE: appdb
      MYSQL_USER: appuser
    secrets:
      - mysql_root_password
      - mysql_app_password
secrets:
  mysql_root_password:
    file: ./db-secrets/mysql_root_password.txt
  mysql_app_password:
    file: ./db-secrets/mysql_app_password.txt
```

PostgreSQL 对应变量为 `POSTGRES_PASSWORD_FILE`，用法相同。更高阶环境把 secrets 文件换成 Vault 等密钥系统动态下发，Compose 结构不用改。

### 3.4 备份钩子思路

思路是把备份做成与容器同生命周期的固定动作，而不是靠人记得执行：其一，宿主机 cron 定时调用逻辑备份命令并落到容器外目录；其二，应用发布流水线在升级镜像前自动触发一次备份并校验文件非空；其三，备份完成后立刻做一次列表校验或试恢复到临时容器。示例 cron 脚本 `/usr/local/bin/backup-mysql.sh`：

```bash
#!/bin/bash
set -e
BACKUP_DIR=/var/backups/mysql
mkdir -p "$BACKUP_DIR"
docker exec app-mysql mysqldump -u root -p"$(cat /home/ubuntu/db-secrets/mysql_root_password.txt)" --single-transaction --routines appdb | gzip > "$BACKUP_DIR/appdb_$(date +%F_%H%M).sql.gz"
gzip -t "$BACKUP_DIR/appdb_$(date +%F_%H%M).sql.gz"
find "$BACKUP_DIR" -name 'appdb_*.sql.gz' -mtime +7 -delete
```

```bash
sudo chmod 750 /usr/local/bin/backup-mysql.sh
sudo crontab -e
```

在 crontab 追加一行：`0 2 * * * /usr/local/bin/backup-mysql.sh`。PostgreSQL 对应把命令换为 `docker exec app-postgres pg_dump -U appuser -Fc appdb`。恢复验证用临时容器导入最近备份并查行数，步骤与本部分 PostgreSQL 备份章节的隔离恢复一致，不在此省略，生产上线前必须实跑一次。

### 3.5 MySQL 主从复制实战：主库配置

目标拓扑：主库 192.0.2.21 写、从库 192.0.2.22 只读复制。改主库配置前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F)
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

在 `[mysqld]` 段设置：

```ini
server-id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
binlog_do_db = appdb
bind-address = 192.0.2.21
max_binlog_size = 512M
expire_logs_days = 7
```

逐项讲解：`server-id` 全拓扑唯一，主库 1、从库 2，以此类推；`log_bin` 开启二进制日志，是复制的数据来源，没开就无从复制；`binlog_format=ROW` 按行记录变更，主键冲突定位清晰、一致性最好，`STATEMENT` 省空间但含函数与临时表时易不一致，`MIXED` 为折中，新部署统一用 `ROW`；`binlog_do_db` 只复制 `appdb`，多库场景逐行追加或改用从库侧过滤；`expire_logs_days=7` 自动清理 7 天前 binlog，防止撑满磁盘，取值依据是从库最长允许离线时间，留 7 天表示从库停机一周内可追平。

重启主库并创建复制专用账号。该账号只给复制权限，禁止复用 root 或应用账号：

```bash
sudo systemctl restart mysql
mysql -u root -p'<password>'
```

```sql
CREATE USER 'repl'@'192.0.2.22' IDENTIFIED WITH mysql_native_password BY '<password>';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.0.2.22';
FLUSH PRIVILEGES;
SHOW MASTER STATUS;
SHOW BINARY LOGS;
```

`SHOW MASTER STATUS` 输出中的 `File` 与 `Position`（如 `mysql-bin.000003` 与 `157`）是从库配置的起点，必须准确记录。若数据量大需先一致性导入：用 `mysqldump --single-transaction --master-data=2` 在主库导出，注释行内含起点坐标，导入从库后再启动复制。

放行防火墙只给从库地址：

```bash
sudo ufw allow from 192.0.2.22 to any port 3306 proto tcp
```

### 3.6 从库配置与 CHANGE REPLICATION SOURCE TO

从库同样先备份再改配置：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F)
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

```ini
server-id = 2
relay_log = /var/log/mysql/mysql-relay-bin.log
read_only = ON
super_read_only = ON
bind-address = 192.0.2.22
```

```bash
sudo systemctl restart mysql
mysql -u root -p'<password>'
```

执行复制指向语句（MySQL 8.0.23 起推荐新语法，旧版兼容写法在排错节说明）。把坐标替换为主库 `SHOW MASTER STATUS` 的实际值：

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='192.0.2.21',
  SOURCE_PORT=3306,
  SOURCE_USER='repl',
  SOURCE_PASSWORD='<password>',
  SOURCE_LOG_FILE='mysql-bin.000003',
  SOURCE_LOG_POS=157,
  GET_SOURCE_PUBLIC_KEY=1;
START REPLICA;
SHOW REPLICA STATUS\G
```

`GET_SOURCE_PUBLIC_KEY=1` 用于主库使用 `caching_sha2_password` 时从库获取公钥，避免认证卡住；若复制账号用 `mysql_native_password` 则可省略。旧语法对应为 `CHANGE MASTER TO MASTER_HOST=...` 与 `START SLAVE;`，参数名一一对应，排查老系统时注意混用会报错。

## 四、效果验证与测试

验证主从状态，重点看字段：

```sql
SHOW REPLICA STATUS\G
```

关键字段判读表：

| 字段 | 健康值 | 异常含义 |
| --- | --- | --- |
| `Replica_IO_Running` | `Yes` | `No` 或 `Connecting` 表示 IO 线程连不上主库 |
| `Replica_SQL_Running` | `Yes` | `No` 表示回放出错，看 `Last_SQL_Error` |
| `Seconds_Behind_Source` | 接近 0 的小数值 | 持续增大表示从库追不上，见延迟排查 |
| `Last_IO_Error` | 空 | 非空即网络、认证或坐标错误原文 |
| `Last_SQL_Error` | 空 | 非空即数据冲突错误原文 |
| `Retrieved_Gtid_Set` 与 `Executed_Gtid_Set` | 持续增长且趋于一致 | 开 GTID 时用两者差判断进度 |

老版本 MySQL 与 MariaDB 对应命令为 `SHOW SLAVE STATUS\G`，字段名为 `Slave_IO_Running` 等，判读方法相同。

写入验证闭环：

```bash
mysql -h 192.0.2.21 -u appuser -p'<password>' -e "USE appdb; INSERT INTO orders (order_id, amount) VALUES ('example-100', 88);"
sleep 2
mysql -h 192.0.2.22 -u appuser -p'<password>' -e "USE appdb; SELECT * FROM orders WHERE order_id='example-100';"
mysql -h 192.0.2.22 -u root -p'<password>' -e "SHOW REPLICA STATUS\G" | grep -E "Running|Seconds_Behind"
```

从库能查到该行且延迟为 0，才算复制真正跑通。容器验证补充：`docker volume ls` 确认命名卷存在、删除并重建容器后数据仍在。

## 五、常见错误与排坑指南

主从延迟排查先分三步定位：第一看从库负载与大事务，`SHOW PROCESSLIST` 找长事务；第二看主库突发写入与 binlog 增长，延迟常因单线程回放大事务，老版本可开并行复制参数 `replica_parallel_workers`；第三看网络与磁盘，从库磁盘满或 IO 差会直接拖慢回放：

```bash
df -h /var/lib/mysql /var/log/mysql
mysql -u root -p'<password>' -e "SHOW PROCESSLIST;"
mysql -u root -p'<password>' -e "SELECT * FROM performance_schema.replication_applier_status_by_worker;"
```

场景一：IO 线程连不上。`Replica_IO_Running` 为 `Connecting`，`Last_IO_Error` 原文片段：`error connecting to master 'repl@192.0.2.21:3306' - retry-time: 60 retries: 1`。原因依次排查：主库未绑内网地址、防火墙未放行、复制账号主机段写错（如把授权写成其他 IP）、密码含特殊字符未引号。修复示例：

```sql
SELECT user, host FROM mysql.user WHERE user='repl';
SHOW GRANTS FOR 'repl'@'192.0.2.22';
```

```bash
mysql -h 192.0.2.21 -u repl -p'<password>' -e "SELECT 1;"
sudo tail -n 50 /var/log/mysql/error.log
```

从库侧能用 `repl` 账号直连成功后执行 `STOP REPLICA; START REPLICA;` 再看状态。

场景二：SQL 线程冲突。`Replica_SQL_Running` 为 `No`，`Last_SQL_Error` 原文片段：`Could not execute Write_rows event: Duplicate entry 'example-100' for key 'PRIMARY', Error_code: 1062`。原因：有人直接在从库写过同主键数据，或历史导入与复制起点重叠。修复原则是先对账再处理，不要无脑跳过：确认该行主从一致后才可跳过一个事务；不一致则删从库冲突行或重新导入。确认后操作：

```sql
STOP REPLICA;
SET GLOBAL sql_replica_skip_counter = 1;
START REPLICA;
SHOW REPLICA STATUS\G
```

GTID 模式下不能用该变量，需用注入空事务方式处理，以当前版本官方文档为准。`super_read_only=ON` 就是为防手滑直写从库，必须保持开启。

场景三：`Last_Error` 判读总原则。IO 类错误看 `Last_IO_Error` 与 `Last_IO_Errno`：`1045` 为认证失败，`2003` 为网络不可达，`1236` 为主库 binlog 坐标已不存在（从库离线超过 binlog 保留期，只能重做从库全量导入）。SQL 类错误看 `Last_SQL_Error`：`1062` 主键冲突、`1032` 记录不存在、`1146` 表不存在，多为从库被改动或过滤规则不一致。修复后统一用 `SHOW REPLICA STATUS\G` 复查两线程均为 `Yes` 且两个 Error 字段为空才算闭环。

## 六、生产环境最佳实践与安全建议

容器数据库：镜像锁定具体版本标签，不用 `latest`；容器以官方非 root 约定运行并设资源上限；数据卷定期快照，升级镜像前先备份并在临时容器验证新版本可读旧数据。端口只绑回环或内网地址并复查 `docker ps` 的 `PORTS` 列，发现 `0.0.0.0` 立即整改。

主从高可用：主从只是复制不是备份，误删会同步到从库，必须与逻辑备份加 binlog 归档并行；切换演练每季度做一次，记录切换命令、耗时与应用改连方式，客户端优先用代理或服务发现指向当前主，不要把主库 IP 写死在各应用配置里。监控告警至少覆盖：两线程任一为 `No`、`Seconds_Behind_Source` 超过 60 秒持续 5 分钟、主库 binlog 磁盘使用率超过 80%。复制账号密码定期轮换，轮换流程为先在主库改密码、再在从库 `STOP REPLICA` 后用 `CHANGE REPLICATION SOURCE TO` 更新密码并启动，全程记录坐标避免断点丢失。
