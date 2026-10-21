---
description: "MySQL 是中小 Web 项目最常见的关系型数据库，MariaDB 是其原作者发起的开源分支，协议高度兼容，多数应用无需改代码即可互换，但在授权与部分优化器行为上已有分叉。"
---

# MySQL 与 MariaDB 安装与安全初始化

## 一、概述与使用场景

MySQL 是中小 Web 项目最常见的关系型数据库，MariaDB 是其原作者发起的开源分支，协议高度兼容，多数应用无需改代码即可互换，但在授权与部分优化器行为上已有分叉。本章解决装机三件事：在 Ubuntu 官方仓库现状下选型；用 `apt` 把服务装好并开机自启；装完立刻完成安全初始化——口令策略、`root` 账号、删除匿名用户与测试库，并讲清 Ubuntu 特有的 `auth_socket` 免密登录。很多事故出在第一天：默认配置裸奔、空密码、3306 直接开公网。本章就是把第一天做对。

适用场景：新服务器首次部署单机数据库；从开发环境迁移到云主机；接手来历不明的服务器先摸清认证方式。使用云 RDS 的读者可跳过安装命令，但安全初始化与 `auth_socket` 说明仍需对照自查。

!!! note "选型结论"
    依赖 Oracle MySQL 特性选 MySQL 8.0；追求完全开源或已有 MariaDB 经验选 MariaDB。后续章节以 MySQL 8.0 为主演示，差异单独标注。

## 二、环境准备与前置条件（Ubuntu 22.04/24.04 LTS、权限、依赖包）

本章命令适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS，要求如下：

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Ubuntu Server 22.04 / 24.04 LTS | 以发行版官方仓库为准，不额外添加第三方源 |
| 登录账号 | `ubuntu` 或 `opsadmin`，具备 `sudo` 权限 | 全程用普通账号加 `sudo`，不直接用系统 `root` 登录操作 |
| 内存与磁盘 | 内存不低于 2 GB，磁盘可用空间不低于 10 GB | 仅为可运行下限，生产取值见第 11.3 章的计算方法 |
| 网络 | 可访问 Ubuntu 软件源 | 离线环境需提前准备本地镜像源 |
| 时间同步 | 已开启 NTP | 数据库日志、备份与主从复制都依赖准确时间 |

先确认系统版本与软件源状态：

```bash
lsb_release -a
sudo apt update
sudo apt upgrade -y
free -h
df -h /
```

发行版仓库现状（以官方仓库为准，不编造小版本号）：

| 对比项 | MySQL | MariaDB |
| --- | --- | --- |
| 22.04 仓库包名 | `mysql-server`、`mysql-client` | `mariadb-server`、`mariadb-client` |
| 24.04 仓库包名 | `mysql-server`、`mysql-client` | `mariadb-server`、`mariadb-client` |
| 22.04 / 24.04 主线版本 | MySQL 8.0 系列，随发行版安全更新跟进 | MariaDB 10.x 系列（22.04 与 24.04 的具体小版本以 `apt-cache policy` 实际输出为准） |
| 默认存储引擎 | InnoDB | InnoDB（源自 XtraDB 的实现） |
| 默认字符集趋势 | `utf8mb4` | `utf8mb4` |
| 配置主目录 | `/etc/mysql/` | `/etc/mysql/`（MariaDB 使用其子目录与兼容布局，安装后以实际文件为准） |
| 服务名 | `mysql` | `mariadb`（部分版本同时提供 `mysql` 别名，以 `systemctl` 实际输出为准） |
| 适用倾向 | 生态与商业工具兼容性优先、需要 MySQL 官方特性 | 完全开源许可优先、已有 MariaDB 经验 |

安装前先查仓库到底提供哪个版本，不要凭记忆写版本号：

```bash
apt-cache policy mysql-server
apt-cache policy mariadb-server
apt-cache show mysql-server | grep -E '^(Package|Version|Depends)'
```

!!! warning "不要在同一台机器上混装两者"
    MySQL 与 MariaDB 共用 3306 端口、相近的数据目录与包依赖，在同一系统上先后安装极易互相替换、导致数据文件版本冲突。二选一，一次定版。如需对比测试，请用两台虚拟机分别安装。已经装了其中一个再改主意时，先完整备份并导出数据，再卸载重装，不要原地覆盖。

依赖由 `apt` 自动拉取。提前确认主机名可解析、时间正确，且安全组此时不要放行 3306——初始化完成前数据库不应被外网触达。

## 三、手把手操作步骤（完整命令可复制；配置文件给完整路径；改任何配置前先给 cp 备份命令；关键参数逐行/表格讲解；禁止出现「...」省略与「自行配置」「略」字样）

### 3.1 路线 A：安装 MySQL 8.0

```bash
sudo apt update
sudo apt install -y mysql-server mysql-client
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql --no-pager
ss -tlnp | grep 3306
```

`mysql-server` 会带入实际组件包；`mysql-client` 提供命令行工具。`enable` 保证重启自启，云主机上漏掉它会在宿主机维护重启后导致业务全停。

### 3.2 路线 B：安装 MariaDB

```bash
sudo apt update
sudo apt install -y mariadb-server mariadb-client
sudo systemctl enable mariadb
sudo systemctl start mariadb
sudo systemctl status mariadb --no-pager
ss -tlnp | grep 3306
```

MariaDB 的安全初始化脚本名称与 MySQL 略有差异：新版本推荐 `mariadb-secure-installation`，同时保留 `mysql_secure_installation` 兼容命令，下文以你机器上实际存在的命令为准，可先用下面命令确认：

```bash
which mariadb-secure-installation
which mysql_secure_installation
ls /usr/bin/*secure*install*
```

### 3.3 运行安全初始化：每一项选什么、为什么

安装完成后，不要急着建库，先运行安全初始化脚本：

```bash
# MySQL
sudo mysql_secure_installation

# MariaDB（按上一步确认到的命令二选一）
sudo mariadb-secure-installation
```

脚本会依次提问，下表给出每一项的生产推荐选择与原因，请逐项对照，不要一路回车：

| 提问项 | 推荐选择 | 原因讲解 |
| --- | --- | --- |
| Enter password for user root | 首次运行直接回车（当前无密码，走 `auth_socket`） | Ubuntu 版初始 `root` 走 `auth_socket` 而非空密码，见 3.4 节 |
| VALIDATE PASSWORD COMPONENT / Press y\|Y for Yes, any other key for No | 输入 `Y` 启用（MySQL）；MariaDB 对应口令强度提示同样启用 | 启用后弱口令会被拒绝，从源头挡住 `123456` 这类密码 |
| There are three levels of password validation policy: 0 = LOW, 1 = MEDIUM, 2 = STRONG | 选 `1`（MEDIUM）；高安全场景选 `2`（STRONG） | `0` 只查长度形同虚设；`1` 要求长度加数字、大小写与特殊字符，兼顾强度与可用性；`2` 额外查字典词，应用账号改密时可能被误拦，需提前告知开发 |
| New password / Re-enter new password（为 `root` 设置密码） | 输入强口令，占位记为 `<password>`，长度不少于 12 位 | 这是数据库最高权限口令，必须进密码管理器保存，禁止与系统登录密码相同，禁止空密码 |
| Remove anonymous users? | 输入 `Y` 删除 | 匿名用户可无账号连接，是历史入侵的常见入口，生产环境没有任何保留理由 |
| Disallow root login remotely? | 输入 `Y` 禁止 | `root` 只允许本机登录；远程管理改用单独的运维账号加来源限制（见第 11.2 章），即使 `root` 口令泄露，攻击者也无法从外网直接使用 |
| Remove test database and access to it? | 输入 `Y` 删除 | `test` 库默认对多类用户开放，常被当作跳板与数据暂存点，业务不会用到它 |
| Reload privilege tables now? | 输入 `Y` 立即重载 | 让上面所有权限变更立即生效，不重载则旧权限仍在内存中继续有效 |

!!! warning "VALIDATE PASSWORD 误区"
    启用组件只约束之后修改的口令，已有弱口令不会自动改掉，接手旧机器仍需人工盘查；策略等级要写入运维文档并同步告知应用方，避免上线改密被拦后临时关组件救火。

MariaDB 提问顺序略有不同，可能多出是否切换 `unix_socket` 认证一项。推荐保留 `root` 的 socket 认证供本机救急，同时按 3.4 节准备密码认证的备用管理路径，不要把唯一入口锁死在单一方式上。

### 3.4 理解 auth_socket：为什么 sudo mysql 能免密登录

Ubuntu 仓库版 MySQL / MariaDB 安装后，`root` 账号默认使用的认证插件是 `auth_socket`（MariaDB 侧对应 `unix_socket`）。它的逻辑与密码无关：数据库通过操作系统 socket 拿到当前系统用户名，若系统用户是 `root`、或经 `sudo` 提权为 `root`，且数据库账号名与之对应，就直接放行。这就是下面这条命令在刚装好的机器上不需要密码的原因：

```bash
sudo mysql -u root
```

注意免密的前提是「经过 `sudo` 提权」：以普通用户 `ubuntu` 身份直接执行 `mysql -u root` 会被拒绝，这不是故障，而是 `auth_socket` 在正常工作。用下面命令查看各账号的认证插件：

```sql
SELECT user, host, plugin FROM mysql.user;
```

期望看到 `root` / `localhost` 对应的 `plugin` 为 `auth_socket`（MySQL）或 `unix_socket`（MariaDB），应用账号则应为 `caching_sha2_password`（MySQL 8.0）或 `mysql_native_password`。

`auth_socket` 的优点是本机免密且无口令爆破风险；局限是只适用于本机且依赖系统账号安全——系统 `root` 失守则数据库 `root` 一并失守。生产推荐双轨：保留它供本机救急，同时新建独立运维账号用密码认证并限制来源（第 11.2 章），日常不用 `root`。若规范要求 `root` 必须密码认证，按下面步骤改；改前先确认还有另一条登录路径，改完先开新终端验证、不要立刻关掉当前会话：

```bash
sudo mysql -u root
```

```sql
-- MySQL 8.0：将 root 改为密码认证，密码用占位符替换为你生成的强口令
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<password>';
FLUSH PRIVILEGES;
SELECT user, host, plugin FROM mysql.user WHERE user = 'root';
EXIT;
```

```bash
# 改完后用密码方式验证（会提示输入密码）
mysql -u root -p
```

!!! danger "改 root 认证方式前的硬性检查"
    执行 `ALTER USER` 之前，必须先按第 11.2 章建好第二个具备管理权限的账号并验证可登录。只剩 `root` 一条路时改认证，密码记错或插件不兼容就会把自己锁在门外，只能停库进单用户模式救援。改完也要保留当前已登录的会话直到新开终端验证成功，这是所有认证变更的通用纪律。

### 3.5 安装后基线加固

上线前再做三项：确认监听范围（放行方法见第 11.2 章）、确认数据目录权限、把版本、口令策略等级、`root` 认证方式与账号清单记入运维文档：

```bash
sudo grep -R "bind-address" /etc/mysql/
ss -tlnp | grep 3306
sudo ls -ld /var/lib/mysql
```

## 四、效果验证与测试（检查命令 + 期望输出示例）

依次执行下面命令，逐项核对期望输出：

```bash
# 1. 服务状态应为 active (running)，且已 enabled
sudo systemctl is-active mysql
sudo systemctl is-enabled mysql
mysql --version

# 2. 用 root 登录并查看版本与运行时间
sudo mysql -u root -e "SELECT VERSION(); SHOW VARIABLES LIKE 'port';"
```

期望输出示例（版本号以本机实际安装为准）：

```text
active
enabled
mysql  Ver 8.0.x for Linux on x86_64 (MySQL Community Server - GPL)
VERSION()
8.0.x
Variable_name  Value
port           3306
```

```sql
-- 3. 匿名用户与 test 库应已不存在
SELECT user, host FROM mysql.user;
SHOW DATABASES;
```

期望结果：用户列表中没有 `user` 为空的匿名行；数据库列表中只有 `information_schema`、`mysql`、`performance_schema`、`sys` 与你自建的库，没有 `test`。

```bash
# 4. 普通用户直接登录 root 应被拒绝（证明 auth_socket 在生效拦截）
mysql -u root -e "SELECT 1;"
```

期望看到 `ERROR 1698 (28000): Access denied for user 'root'@'localhost'`，这条报错在此场景下恰恰是安全生效的证据。最后做一次重启回归，确认服务能随系统自启：

```bash
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
sudo mysql -u root -e "SHOW VARIABLES LIKE 'validate_password.policy';"
```

## 五、常见错误与排坑指南（2~3 个真实报错场景：报错原文片段+原因+修复命令；含本简报点名的经典报错）

### 场景一：Access denied for user 'root'@'localhost'

报错原文：

```text
ERROR 1698 (28000): Access denied for user 'root'@'localhost'
```

原因：当前系统用户不是 `root`，且 `root` 账号走 `auth_socket` 认证，普通用户身份与之不匹配；或者 `root` 已被改成密码认证，但你登录时没带 `-p` 或密码错误。它与「MySQL 坏了」无关，是认证方式不匹配。修复：按账号实际插件选择登录方式：

```bash
# auth_socket 场景：经 sudo 登录
sudo mysql -u root

# 已改为密码认证的场景：带 -p 交互输入密码
mysql -u root -p

# 先查插件再决定（用任一可登录的管理账号执行）
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;"
```

### 场景二：安装时包冲突或服务起不来

报错原文片段：

```text
dpkg: error processing package mysql-server-8.0
Job for mysql.service failed because the control process exited with error code.
```

原因：多见于同一台机器先装 MariaDB 又装 MySQL、残留了旧数据目录或旧配置；也可能是磁盘已满或旧进程仍占用 3306。修复顺序是先看日志定位、再处理冲突，不要反复重装：

```bash
sudo journalctl -u mysql -n 100 --no-pager
sudo tail -n 100 /var/log/mysql/error.log
ss -tlnp | grep 3306
dpkg -l | grep -E 'mysql|mariadb'
df -h /
```

确认要废弃旧数据时，先备份再清理残留目录，然后重新配置软件包：

```bash
sudo cp -a /var/lib/mysql /var/lib/mysql.bak.$(date +%F)
sudo apt purge -y mariadb-server mariadb-client
sudo apt install -y mysql-server mysql-client
sudo dpkg --configure -a
sudo systemctl restart mysql
```

### 场景三：改完 root 认证方式后自己也登不进去

报错原文：

```text
ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)
```

原因：新密码输错或粘贴带入不可见字符；若已关旧会话且无第二个管理账号则形成死锁。先逐字核对重试；彻底锁死时用初始化文件重置（操作前停业务并备份数据目录）：

```bash
sudo cp -a /var/lib/mysql /var/lib/mysql.bak.$(date +%F)
sudo systemctl stop mysql
sudo mysqld --init-file=/tmp/reset-root.sql --user=mysql &
```

其中 `/tmp/reset-root.sql` 内容为重置语句，密码替换为新的强口令占位值：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<password>';
```

待进程启动、验证可登录后，正常关闭该临时进程并用 `systemd` 重新拉起服务，再删除临时文件：

```bash
mysql -u root -p -e "SELECT 1;"
sudo mysqladmin -u root -p shutdown
sudo systemctl start mysql
sudo rm -f /tmp/reset-root.sql
```

## 六、生产环境最佳实践与安全建议

第一，版本定版不定新：只用 LTS 仓库主线并跟随 `apt` 安全更新，不混用官方源与发行版源。第二，口令纪律：`root` 口令不少于 12 位、进密码管理器、与系统密码不同，策略不低于 MEDIUM，禁止空密码，上线前盘查一遍账号清单。第三，攻击面收敛：初始化四项必须全做，3306 默认不放行，远程按第 11.2 章分层开口，绝不对公网全开。第四，双管理通道：`root` 之外另建独立运维账号并验证可用，认证变更遵循「先建新路、验证、再改旧路」。第五，变更留痕，改配置前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;" | sudo tee /root/mysql-users-$(date +%F).txt
```

第六，上线检查单：服务自启与重启回归通过、匿名用户与 `test` 库已删、远程 `root` 已禁、口令策略已开、版本与账号清单已入档，全勾才算交付。下一章建业务库与应用账号，并安全地打开远程访问。
