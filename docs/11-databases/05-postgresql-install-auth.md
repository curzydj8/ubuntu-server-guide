# PostgreSQL 安装与认证

## 一、概述与使用场景

PostgreSQL 是功能最完整的开源关系型数据库，支持 SQL 标准、JSONB、窗口函数、全文检索和强大事务能力，适合电商、内容管理、日志分析和金融类业务系统。Ubuntu 自带仓库提供 PostgreSQL，但版本更新较慢；PostgreSQL 官方 PGDG 源提供多个并行版本，适合生产环境统一版本。

本章解决三个问题：如何通过 PGDG 源在 Ubuntu 22.04/24.04 LTS 上安装 PostgreSQL 15/16（示例版本，以 PGDG 当前提供为准）；如何使用 `sudo -u postgres` 安全完成日常管理；如何读懂并正确修改 `pg_hba.conf` 完成认证配置。坚持原则：禁止空密码、5432 端口不对公网全开、应用账号最小权限、绝不用 `postgres` 超级用户跑应用。

!!! note "版本说明"
    本章以 PostgreSQL 16 为主示例，15 的步骤完全相同，仅包名版本号不同。PGDG 源会随官方生命周期增删版本，执行前请以 PGDG 官网当前支持列表为准，不要在已停止维护的版本上新建生产库。

## 二、环境准备与前置条件

适用系统：Ubuntu 22.04 LTS（Jammy）或 Ubuntu 24.04 LTS（Noble）。操作账号需具备 `sudo` 权限，示例账号为 `ubuntu`。服务器建议至少 2 核 CPU、2 GB 内存、20 GB 可用磁盘；生产环境建议 4 核 8 GB 起步，数据目录放在独立数据盘上。

安装前检查：

```bash
lsb_release -a
whoami
sudo -v
df -h /
free -h
sudo ufw status
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
```

若已安装发行版自带 PostgreSQL，先确认版本与集群状态，避免误覆盖：

```bash
psql --version
pg_lsclusters
sudo systemctl status postgresql --no-pager
```

## 三、手把手操作步骤

### 3.1 发行版版本与 PGDG 版本如何取舍

| 对比项 | Ubuntu 发行版仓库 | PGDG 官方源 |
| --- | --- | --- |
| 版本新鲜度 | 随 Ubuntu 发布冻结，仅修安全补丁 | 持续提供最新小版本和多个大版本 |
| 升级方式 | 跟随系统大版本升级 | 可并行安装多版本再迁移 |
| 维护方 | Ubuntu/Canonical | PostgreSQL 全球开发组 |
| 适用场景 | 小型内部服务、版本无特殊要求 | 生产主库、需要新特性或统一多机版本 |

结论：内部测试可直接使用发行版版本；生产环境优先 PGDG，便于跨 Ubuntu 版本保持数据库版本一致。

### 3.2 添加 PGDG 官方源（keyring 完整步骤）

创建保存 GPG 密钥的目录并导入官方密钥：

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
ls -l /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
```

生成源文件，命令自动读取当前 Ubuntu 代号（如 `jammy` 或 `noble`）：

```bash
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
cat /etc/apt/sources.list.d/pgdg.list
sudo apt update
apt-cache policy postgresql-16
```

`apt-cache policy` 输出中应出现 `apt.postgresql.org` 来源，说明 PGDG 源已生效。

!!! warning "不要混用多个野源"
    不要再额外添加第三方 PPA 或不明镜像源。多个源提供同名 `postgresql-*` 包时，APT 优先级容易导致装到非预期版本，排障成本很高。

### 3.3 安装 PostgreSQL 16

```bash
sudo apt install -y postgresql-16 postgresql-client-16
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql --no-pager
pg_lsclusters
```

`pg_lsclusters` 典型输出：

```text
Ver Cluster Port Status Owner    Data directory              Log file
16  main    5432 online postgres /var/lib/postgresql/16/main /var/log/postgresql/postgresql-16-main.log
```

安装 15 时把命令中的 `16` 全部替换为 `15`，数据目录变为 `/var/lib/postgresql/15/main`，配置目录变为 `/etc/postgresql/15/main/`。

关键路径速查（以 16 为例）：

| 用途 | 完整路径 |
| --- | --- |
| 主配置文件 | `/etc/postgresql/16/main/postgresql.conf` |
| 客户端认证文件 | `/etc/postgresql/16/main/pg_hba.conf` |
| 数据目录 | `/var/lib/postgresql/16/main` |
| 日志文件 | `/var/log/postgresql/postgresql-16-main.log` |

### 3.4 sudo -u postgres 工作流

Debian/Ubuntu 包装的 PostgreSQL 默认由操作系统用户 `postgres` 管理，日常管理统一通过 `sudo -u postgres` 切换身份，不给 `postgres` 系统账号设置登录密码。

```bash
sudo -u postgres psql
sudo -u postgres psql -c "SELECT version();"
sudo -u postgres psql -c "\du"
```

在 `psql` 内常用命令：

```sql
\conninfo
\l
\du
\q
```

使用包装命令创建角色与数据库：

```bash
sudo -u postgres createuser --pwprompt appuser
sudo -u postgres createdb --owner=appuser appdb
sudo -u postgres psql -c "\l appdb"
```

`createuser --pwprompt` 会提示输入两次密码。文档与脚本中统一用 `<password>` 占位，不要把真实密码写进命令历史。更推荐在 `psql` 内用 SQL 创建，便于同时设置属性：

```sql
CREATE ROLE appuser LOGIN PASSWORD '<password>';
CREATE DATABASE appdb OWNER appuser ENCODING 'UTF8';
```

### 3.5 给 postgres 与应用角色设置密码

即使本机 `local` 连接使用 `peer` 认证，也必须给数据库内 `postgres` 角色设置强密码，防止后续改为密码认证时出现空密码超级用户：

```bash
sudo -u postgres psql -c "\password postgres"
sudo -u postgres psql -c "ALTER ROLE appuser WITH PASSWORD '<password>';"
sudo -u postgres psql -c "SELECT rolname, rolpassword IS NOT NULL AS has_password FROM pg_authid WHERE rolname IN ('postgres','appuser');"
```

两行 `has_password` 都应为 `t`。

### 3.6 pg_hba.conf 逐行讲解

修改任何配置前先备份：

```bash
sudo cp /etc/postgresql/16/main/pg_hba.conf /etc/postgresql/16/main/pg_hba.conf.bak.$(date +%F)
sudo cp /etc/postgresql/16/main/postgresql.conf /etc/postgresql/16/main/postgresql.conf.bak.$(date +%F)
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

文件字段顺序为：连接类型、数据库、用户、地址、认证方法。规则自上而下首条命中即生效，后面的规则不会再匹配，这是最常见的误配来源。

典型生产配置示例：

```ini
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     scram-sha-256
host    appdb           appuser         192.0.2.0/24            scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

逐行解释：

| 行 | 含义 |
| --- | --- |
| `local all postgres peer` | Unix 套接字连接，系统用户 `postgres` 才能以数据库 `postgres` 身份登录，用于本机管理 |
| `local all all scram-sha-256` | 其他本机套接字连接一律要求 SCRAM 密码认证 |
| `host appdb appuser 192.0.2.0/24 scram-sha-256` | 仅允许示例网段用 `appuser` 访问 `appdb`，必须输对密码 |
| `host all all 127.0.0.1/32 scram-sha-256` | 本机 TCP 回环连接要求密码 |
| `host all all ::1/128 scram-sha-256` | IPv6 回环同上 |

严禁出现的写法：`host all all 0.0.0.0/0 trust`，等于无密码对全网开放。

认证方法区别与选型：

| 方法 | 原理 | 优点 | 缺点 | 选型建议 |
| --- | --- | --- | --- | --- |
| `peer` | 比对操作系统用户名与数据库用户名 | 本机管理免密且安全 | 仅限 `local` 套接字 | 仅给 `postgres` 本机管理用 |
| `scram-sha-256` | SCRAM-SHA-256 挑战响应，密码不明文传输 | 当前最安全，防重放 | 老旧客户端可能不支持 | 新部署一律首选 |
| `md5` | MD5 口令哈希挑战 | 兼容性好 | 强度弱于 SCRAM | 仅兼容旧客户端时过渡使用 |
| `trust` | 不验密码直接放行 | 调试方便 | 等同裸奔 | 生产环境禁用 |
| `reject` | 直接拒绝匹配连接 | 可做黑名单 | 需注意顺序 | 用于明确封禁的网段 |

确认主配置中的关键参数：

```bash
sudo grep -E "^password_encryption|^listen_addresses|^port" /etc/postgresql/16/main/postgresql.conf
sudo -u postgres psql -c "SHOW password_encryption;"
```

推荐值：

```ini
listen_addresses = 'localhost'
port = 5432
password_encryption = 'scram-sha-256'
```

只监听本机时应用同机部署可直连 127.0.0.1；应用在内网另一台机器时，改为监听内网网卡地址（示例写法 `'localhost,192.0.2.10'`），同时用防火墙只放行应用服务器网段，绝不写 `'*'` 后对公网裸奔。

`pg_hba.conf` 改动只需重载，不需重启：

```bash
sudo systemctl reload postgresql
sudo -u postgres psql -c "SELECT pg_reload_conf();"
```

`listen_addresses`、`port` 修改则必须重启：`sudo systemctl restart postgresql`。

### 3.7 应用角色最小权限示例

原则：应用账号只能连自己的库，不给 `SUPERUSER`、`CREATEDB`、`CREATEROLE`。

```sql
CREATE ROLE appuser LOGIN PASSWORD '<password>' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 50;
CREATE DATABASE appdb OWNER appuser ENCODING 'UTF8';
\connect appdb
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO appuser;
```

只读报表账号示例：

```sql
CREATE ROLE readonly LOGIN PASSWORD '<password>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE appdb TO readonly;
\connect appdb
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
\du appuser
```

## 四、效果验证与测试

```bash
sudo systemctl is-active postgresql
pg_lsclusters
sudo -u postgres psql -c "SELECT version();"
sudo ss -tlnp | grep 5432
PGPASSWORD='<password>' psql -h 127.0.0.1 -U appuser -d appdb -c "SELECT current_user, current_database();"
PGPASSWORD='<password>' psql -h 127.0.0.1 -U appuser -d postgres -c "SELECT 1;"
```

期望：`is-active` 输出 `active`，集群状态 `online`，`ss` 仅显示监听 127.0.0.1:5432（或你配置的内网地址）。第一条密码登录应显示 `appuser | appdb`；第二条未授权库应被拦截，这正是期望的隔离效果。故意输错密码应得到 `password authentication failed for user "appuser"`，说明 SCRAM 认证真正在工作。

## 五、常见错误与排坑指南

场景一：改完 `pg_hba.conf` 仍无法远程连接。报错原文片段：`FATAL: no pg_hba.conf entry for host "198.51.100.20", user "appuser", database "appdb"`。原因：规则写错网段、写在拒绝规则之后，或改后未 reload。修复：

```bash
sudo grep -v "^#" /etc/postgresql/16/main/pg_hba.conf | grep -v "^$"
sudo systemctl reload postgresql
sudo tail -n 50 /var/log/postgresql/postgresql-16-main.log
```

场景二：`peer` 认证失败。报错原文片段：`FATAL: Peer authentication failed for user "postgres"`。原因：当前系统用户是 `ubuntu` 却直接执行 `psql -U postgres`，操作系统身份与数据库用户不一致。修复：统一用 `sudo -u postgres psql`，不要给系统 `postgres` 账号开 shell 登录。

场景三：密码已改仍认证失败。服务端日志提示密码为 MD5 格式。原因：角色密码在 `password_encryption=md5` 时期创建，`pg_hba.conf` 已改为 `scram-sha-256`，旧哈希无法用于 SCRAM。修复：确认配置为 `scram-sha-256` 后重新设置密码：

```bash
sudo -u postgres psql -c "SHOW password_encryption;"
sudo -u postgres psql -c "ALTER ROLE appuser WITH PASSWORD '<password>';"
```

## 六、生产环境最佳实践与安全建议

网络分层防御：`listen_addresses` 只绑本地或内网地址，`pg_hba.conf` 按网段最小授权，云安全组与 `ufw` 只放行应用服务器地址访问 5432，三层缺一不可：

```bash
sudo ufw allow from 192.0.2.0/24 to any port 5432 proto tcp
sudo ufw status numbered
sudo -u postgres psql -c "\du"
sudo -u postgres psql -c "SELECT usename, client_addr, application_name, state FROM pg_stat_activity;"
```

账号治理：超级用户仅 DBA 使用并单独保管，应用一律用最小权限账号；密码不少于 16 位随机字符，通过密码管理器下发，不要写进 Git 仓库或镜像。运维习惯：任何配置变更先备份再 reload，大版本升级走逻辑备份加新集群迁移并做恢复演练，不要直接原地跨版本升级。本章只完成单机认证基线，备份与高可用在后续章节展开。
