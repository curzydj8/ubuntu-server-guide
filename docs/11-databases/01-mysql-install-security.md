---
description: "MySQL 是中小 Web 项目最常见的关系型数据库，MariaDB 是其原作者发起的开源分支，协议高度兼容，多数应用无需改代码即可互换，但在授权与部分优化器行为上已有分叉。本章以 MySQL 8.4 LTS 为主线：Oracle 官方源安装、发行版仓库版 8.0 存量维护，以及从 8.0 升级到 8.4 的完整路径。"
---

# MySQL 与 MariaDB 安装与安全初始化

## 一、概述与使用场景

MySQL 是中小 Web 项目最常见的关系型数据库，MariaDB 是其原作者发起的开源分支，协议高度兼容，多数应用无需改代码即可互换，但在授权与部分优化器行为上已有分叉。本章解决装机三件事：在当前版本与生命周期现状下选型（MySQL 主线为 8.4 LTS）；用 `apt` 把服务装好并开机自启；装完立刻完成安全初始化——口令策略、`root` 账号、删除匿名用户与测试库，并讲清 Ubuntu 特有的 `auth_socket` 免密登录。很多事故出在第一天：默认配置裸奔、空密码、3306 直接开公网。本章就是把第一天做对。

适用场景：新服务器首次部署单机数据库；从开发环境迁移到云主机；接手来历不明的服务器先摸清认证方式；已在用发行版仓库版 MySQL 8.0、需要升级到 8.4 LTS 的环境（按第五节操作）。使用云 RDS 的读者可跳过安装命令，但安全初始化与 `auth_socket` 说明仍需对照自查。

!!! note "选型结论"
    新部署选 MySQL 8.4 LTS，走 Oracle 官方 APT 源（路线 A）；追求完全开源或已有 MariaDB 经验选 MariaDB（路线 B）。Ubuntu 22.04 / 24.04 发行版仓库里的 MySQL 仍是 8.0 系列，其 Premier 支持已经结束，本章只作存量维护说明（路线 C），不再作为推荐主线；已在用 8.0 的环境按第五节升级到 8.4。后续章节以 MySQL 8.4 为主演示，差异单独标注。

### 版本与生命周期：为什么主线是 8.4

MySQL 的发布分两条线：LTS（长期支持版，约每两年一代，只修缺陷与安全问题）与 Innovation（创新版，季度发布新功能，只支持到下一版本）。8.1、8.2、8.3 都是 Innovation 版，不是 LTS；生产环境定版应选 LTS。各版本当前所处阶段如下：

| 版本 | 定位 | 支持阶段 | 本书口径 |
| --- | --- | --- | --- |
| MySQL 8.4 | LTS，2024-04 发布 | Premier 支持至 2029-04，Extended 支持至 2032-04 | **主线**：新部署与升级目标 |
| MySQL 8.0 | 上一代 LTS | Premier 支持已于 2026-04 结束，现为 Sustaining 支持 | 存量维护：只保留安装对照与升级路径（路线 C、第五节） |
| MySQL 9.7 | 下一代 LTS（已发布） | 见 Oracle 终身支持政策 | 本书暂不展开，待其生态成熟后再评估 |

支持阶段的含义：Premier 是完整维护阶段，缺陷修复与安全补丁正常发布；Extended 是 Premier 之后的延长支持阶段；Sustaining 只保留已有版本与文档，**不再发布任何新的修复与安全补丁**——8.0 现在就处在这个阶段，继续留在 8.0 等于长期暴露在已公开漏洞之下，这就是主线必须切换到 8.4 的原因。

还要注意供给侧的现实：Ubuntu 22.04 / 24.04 官方仓库的 `mysql-server` 仍是 8.0 系列，所以在这两个版本上装 8.4 要走 Oracle 官方 APT 源（路线 A）；Ubuntu 26.04 官方仓库直接提供 8.4。MariaDB 不走 Oracle 的版本线，仍由发行版仓库供给（路线 B）。

!!! note "本章 8.4 内容的验证级别"
    本章关于 MySQL 8.4 的安装与升级内容为**文档核对级**：依据 Oracle 官方文档核对编写，尚未在实机完整验证；完成实机复测后会在兼容性页面同步更新状态。仓库版 8.0 与 MariaDB 的核心安装流程为此前已实测内容，不要把本章的 8.4 部分当作已验证结论使用。

## 二、环境准备与前置条件（Ubuntu 22.04/24.04 LTS、权限、依赖包）

本章命令适用于 Ubuntu Server 22.04 LTS 与 24.04 LTS，要求如下：

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Ubuntu Server 22.04 / 24.04 LTS | MySQL 主线走 Oracle 官方 APT 源（Oracle 官方源而非第三方源，见 3.1 节）；MariaDB 走发行版官方仓库 |
| 登录账号 | `ubuntu` 或 `opsadmin`，具备 `sudo` 权限 | 全程用普通账号加 `sudo`，不直接用系统 `root` 登录操作 |
| 内存与磁盘 | 内存不低于 2 GB，磁盘可用空间不低于 10 GB | 仅为可运行下限，生产取值见第 11.3 章的计算方法 |
| 网络 | 可访问 Ubuntu 软件源；走路线 A 时还需能访问 dev.mysql.com 与 MySQL 官方软件源 | 离线环境需提前准备本地镜像源 |
| 时间同步 | 已开启 NTP | 数据库日志、备份与主从复制都依赖准确时间 |

先确认系统版本与软件源状态：

```bash
lsb_release -a
sudo apt update
sudo apt upgrade -y
free -h
df -h /
```

各来源的版本现状（不编造小版本号，以 `apt-cache policy` 实际输出与官方下载页为准）：

| 对比项 | MySQL | MariaDB |
| --- | --- | --- |
| 22.04 仓库包名 | `mysql-server`、`mysql-client` | `mariadb-server`、`mariadb-client` |
| 24.04 仓库包名 | `mysql-server`、`mysql-client` | `mariadb-server`、`mariadb-client` |
| 22.04 / 24.04 发行版仓库版本 | MySQL 8.0 系列（Premier 支持已结束，仅作存量维护，见 3.3 节） | MariaDB 10.x 系列（22.04 与 24.04 的具体小版本以 `apt-cache policy` 实际输出为准） |
| MySQL 官方 APT 源版本 | **MySQL 8.4 LTS（本章主线，见 3.1 节）** | 不适用（MariaDB 不经 Oracle 官方源分发） |
| 26.04 发行版仓库版本 | MySQL 8.4 系列（官方仓库直接提供） | 具体小版本以 `apt-cache policy` 实际输出为准 |
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

### 3.1 路线 A：安装 MySQL 8.4 LTS（Oracle 官方 APT 源）

Ubuntu 22.04 / 24.04 官方仓库的 `mysql-server` 仍是 8.0 系列，在这两个版本上装 8.4，要先接入 Oracle 官方的 MySQL APT 源。接入方式是安装 Oracle 发布的 `mysql-apt-config` 配置包：它只负责写入源配置并让你选用组件版本，不装数据库本体。

第一步，下载并安装配置包。文件名中的版本号以 dev.mysql.com 下载页当前提供的版本为准，先填进变量再下载；只从这个官方下载页获取，不要用第三方镜像站的同名文件：

```bash
MYSQL_APT_CONFIG_VER='<版本号>'
wget "https://dev.mysql.com/get/mysql-apt-config_${MYSQL_APT_CONFIG_VER}_all.deb"
sudo dpkg -i "mysql-apt-config_${MYSQL_APT_CONFIG_VER}_all.deb"
```

`dpkg -i` 会弹出配置界面：在 `MySQL Server & Cluster` 一项中选择 `mysql-8.4-lts`，其余组件保持默认，最后选 `Ok` 确认。选错了组件版本时，重新运行 `sudo dpkg-reconfigure mysql-apt-config` 改选即可。

第二步，刷新软件源、先确认候选版本已经是 8.4，再安装：

```bash
sudo apt update
apt-cache policy mysql-server
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql --no-pager
ss -tlnp | grep 3306
```

`apt-cache policy mysql-server` 的 `Candidate` 应为 `8.4` 开头的版本；若仍显示 8.0 系列，说明组件选错或源未生效，回上一步改选，不要继续装。官方源下 `mysql-server` 是过渡包，实际装入的组件包是 `mysql-community-server`、`mysql-community-client` 等 `mysql-community-*` 包，之后用 `dpkg -l` 看到它们属正常现象。

安装过程中会要求为 MySQL `root` 设置密码，并选择默认认证插件：`root` 密码按 3.4 节的口令纪律设强口令；默认认证插件选 `caching_sha2_password`（8.4 的默认插件）。注意这条路线装完的 `root` 直接是密码认证，不走 `auth_socket`，本机登录用 `mysql -u root -p`；3.5 节讲的 `auth_socket` 是仓库版与 MariaDB 的初始形态，两条路线不要混淆。`enable` 保证重启自启，云主机上漏掉它会在宿主机维护重启后导致业务全停。

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

### 3.3 路线 C：发行版仓库版 MySQL 8.0（存量维护）

这条路线装的是 Ubuntu 22.04 / 24.04 发行版仓库自带的 MySQL 8.0 系列，只供**已经在用 8.0 的环境**做存量维护与重装对照，命令保持最简：

```bash
sudo apt update
sudo apt install -y mysql-server mysql-client
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql --no-pager
ss -tlnp | grep 3306
```

!!! warning "8.0 已结束 Premier 支持，不要用于新部署"
    MySQL 8.0 的 Premier 支持已于 2026-04 结束，现为 Sustaining 支持，不再有新的修复与安全补丁。新部署请走路线 A（8.4 LTS）；已在用这条路线的环境，装好后按 3.4 节做安全初始化，并按第五节规划升级到 8.4，不要长期停留在没有安全补丁的阶段。

这条路线安装后的初始 `root` 走 `auth_socket`（见 3.5 节），这也是 3.4 节安全初始化第一项可以直接回车的原因。

### 3.4 运行安全初始化：每一项选什么、为什么

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
| Enter password for user root | 按路线分开：**路线 A（Oracle 源 8.4）** 输入安装过程中为 `root` 设置的密码；**路线 C（仓库版 8.0）/ 路线 B（MariaDB）** 首次运行直接回车（当前无密码，走 `auth_socket` / `unix_socket`） | 路线 A 在装包时已给 `root` 设了密码认证，脚本从「输入该密码」开始；仓库版与 MariaDB 的初始 `root` 才是 socket 认证而非空密码，见 3.5 节 |
| VALIDATE PASSWORD COMPONENT / Press y\|Y for Yes, any other key for No | 输入 `Y` 启用（MySQL）；MariaDB 对应口令强度提示同样启用 | 启用后弱口令会被拒绝，从源头挡住 `123456` 这类密码 |
| There are three levels of password validation policy: 0 = LOW, 1 = MEDIUM, 2 = STRONG | 选 `1`（MEDIUM）；高安全场景选 `2`（STRONG） | `0` 只查长度形同虚设；`1` 要求长度加数字、大小写与特殊字符，兼顾强度与可用性；`2` 额外查字典词，应用账号改密时可能被误拦，需提前告知开发 |
| New password / Re-enter new password（为 `root` 设置密码） | 输入强口令，占位记为 `<password>`，长度不少于 12 位 | 这是数据库最高权限口令，必须进密码管理器保存，禁止与系统登录密码相同，禁止空密码 |
| Remove anonymous users? | 输入 `Y` 删除 | 匿名用户可无账号连接，是历史入侵的常见入口，生产环境没有任何保留理由 |
| Disallow root login remotely? | 输入 `Y` 禁止 | `root` 只允许本机登录；远程管理改用单独的运维账号加来源限制（见第 11.2 章），即使 `root` 口令泄露，攻击者也无法从外网直接使用 |
| Remove test database and access to it? | 输入 `Y` 删除 | `test` 库默认对多类用户开放，常被当作跳板与数据暂存点，业务不会用到它 |
| Reload privilege tables now? | 输入 `Y` 立即重载 | 让上面所有权限变更立即生效，不重载则旧权限仍在内存中继续有效 |

!!! warning "VALIDATE PASSWORD 误区"
    启用组件只约束之后修改的口令，已有弱口令不会自动改掉，接手旧机器仍需人工盘查；策略等级要写入运维文档并同步告知应用方，避免上线改密被拦后临时关组件救火。

MariaDB 提问顺序略有不同，可能多出是否切换 `unix_socket` 认证一项。推荐保留 `root` 的 socket 认证供本机救急，同时按 3.5 节准备密码认证的备用管理路径，不要把唯一入口锁死在单一方式上。

### 3.5 理解 auth_socket：为什么 sudo mysql 能免密登录

先说清适用范围：本节讲的是发行版仓库版 MySQL（路线 C）与 MariaDB（路线 B）安装后的初始形态。路线 A（Oracle 官方源）安装 8.4 时，`root` 在安装过程中已按你输入的密码设为 `caching_sha2_password` 密码认证，不经过 `auth_socket`，本机登录用 `mysql -u root -p`，不要拿本节的免密结论去套路线 A。

仓库版 MySQL / MariaDB 安装后，`root` 账号默认使用的认证插件是 `auth_socket`（MariaDB 侧对应 `unix_socket`）。它的逻辑与密码无关：数据库通过操作系统 socket 拿到当前系统用户名，若系统用户是 `root`、或经 `sudo` 提权为 `root`，且数据库账号名与之对应，就直接放行。这就是下面这条命令在刚装好的机器上不需要密码的原因：

```bash
sudo mysql -u root
```

注意免密的前提是「经过 `sudo` 提权」：以普通用户 `ubuntu` 身份直接执行 `mysql -u root` 会被拒绝，这不是故障，而是 `auth_socket` 在正常工作。用下面命令查看各账号的认证插件：

```sql
SELECT user, host, plugin FROM mysql.user;
```

期望看到 `root` / `localhost` 对应的 `plugin` 为 `auth_socket`（仓库版 MySQL）或 `unix_socket`（MariaDB）；路线 A 的 `root` 这里应为 `caching_sha2_password`。应用账号则应为 `caching_sha2_password`（MySQL 默认插件）或 `mysql_native_password`（旧账号常见，8.4 下的处理见第五节）。

`auth_socket` 的优点是本机免密且无口令爆破风险；局限是只适用于本机且依赖系统账号安全——系统 `root` 失守则数据库 `root` 一并失守。生产推荐双轨：保留它供本机救急，同时新建独立运维账号用密码认证并限制来源（第 11.2 章），日常不用 `root`。若规范要求 `root` 必须密码认证，按下面步骤改；改前先确认还有另一条登录路径，改完先开新终端验证、不要立刻关掉当前会话：

```bash
sudo mysql -u root
```

```sql
-- 仓库版 MySQL：将 root 改为密码认证，密码用占位符替换为你生成的强口令（路线 A 的 root 已是密码认证，无需执行本步）
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

### 3.6 安装后基线加固

上线前再做三项：确认监听范围（放行方法见第 11.2 章）、确认数据目录权限、把版本、口令策略等级、`root` 认证方式与账号清单记入运维文档：

```bash
sudo grep -R "bind-address" /etc/mysql/
ss -tlnp | grep 3306
sudo ls -ld /var/lib/mysql
```

## 四、效果验证与测试（检查命令 + 期望输出示例）

依次执行下面命令，逐项核对期望输出。以下命令以路线 C / 路线 B 的 `auth_socket` 免密登录演示；路线 A 的环境把 `sudo mysql -u root` 换成 `mysql -u root -p`，其余不变：

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
mysql  Ver 8.4.x for Linux on x86_64 (MySQL Community Server - GPL)
VERSION()
8.4.x
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
# 4. 普通用户直接登录 root 应被拒绝（证明认证在生效拦截；本项是路线 C / B 的 auth_socket 场景）
mysql -u root -e "SELECT 1;"
```

期望看到 `ERROR 1698 (28000): Access denied for user 'root'@'localhost'`，这条报错在此场景下恰恰是安全生效的证据。路线 A 的 `root` 是密码认证，同样的无密码登录会被拒绝，报错为 `ERROR 1045 (28000)`，同理是认证在生效。最后做一次重启回归，确认服务能随系统自启：

```bash
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
sudo mysql -u root -e "SHOW VARIABLES LIKE 'validate_password.policy';"
```

## 五、从 MySQL 8.0 升级到 8.4 LTS

已在用发行版仓库版 MySQL 8.0 的环境，按本节升级到 8.4 LTS。先讲清边界：官方只支持相邻大版本之间升级，8.0 → 8.4 是受支持的原地升级路径；还在 5.7 的环境必须先升到 8.0，不能跳级到 8.4。升级有两条路线：原地升级（同一台机器换包，停机时间短）与逻辑迁移（新机装 8.4 后导数据，可回退性最好）。两条路线共用同一套升级前检查与备份，检查不过关不要往下走。本节内容依据 Oracle 官方文档核对（文档核对级），尚未在实机完整验证，生产执行前请先在测试环境演练一遍。

### 5.1 升级前检查清单

逐项执行，任何一项不通过先修复，不要带着问题升级：

```bash
# 1. 记录当前版本与账号清单，升级后要逐项对照（root 已改密码认证的环境给命令加 -p，下同）
sudo mysql -u root -e "SELECT VERSION(); SELECT user, host, plugin FROM mysql.user;"
```

```bash
# 2. 跑官方升级检查器（MySQL Shell 的 util checkForServerUpgrade）
#    先确认 mysqlsh 已安装；未装时从 Oracle 官方 APT 源安装（包名 mysql-shell，
#    前提是已按 3.1 节添加官方源，仓库版 8.0 机器需先加源或在另一台已加源的机器上远程检查）
#    目标版本 8.4.x 中的 x 换成你要升到的 8.4 小版本号
which mysqlsh
sudo apt install -y mysql-shell
mysqlsh -- util check-for-server-upgrade --target-version=8.4.x
```

检查器输出中标为错误（error）的问题必须全部修复后才能升级；标为警告（warning）的问题逐项评估并把结论记入运维文档。下面四项是检查之外也要人工自查的 8.4 变更点：

```sql
-- 3. 盘点仍在用 mysql_native_password 的账号：该插件 8.4 默认禁用，
--    这些账号要在升级前迁到 caching_sha2_password（处理见本项下方）
SELECT user, host, plugin FROM mysql.user WHERE plugin = 'mysql_native_password';
```

```bash
# 4. 查 my.cnf 里有没有已被 8.4 移除的变量：留着它们，8.4 会拒绝启动，
#    这是升级后服务起不来的最常见原因
sudo grep -RnE "default_authentication_plugin|default_password_lifetime|query_cache" /etc/mysql/
```

第 4 项命中的处理：`default_authentication_plugin` 已被移除，认证策略改用 `authentication_policy` 表达；`default_password_lifetime` 与 `query_cache` 相关变量同为已移除变量，直接删行。改任何配置文件前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
```

```sql
-- 5. FLOAT / DOUBLE 列带 AUTO_INCREMENT 会直接导致升级失败，升级前必须改型
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE EXTRA LIKE '%auto_increment%' AND DATA_TYPE IN ('float', 'double');
```

```sql
-- 6. 8.4 新增保留字自查：MANUAL、PARALLEL、QUALIFY、TABLESAMPLE
--    被未加反引号地用作列名的，升级后会报错，需改名或加反引号
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE UPPER(COLUMN_NAME) IN ('MANUAL', 'PARALLEL', 'QUALIFY', 'TABLESAMPLE');
```

第 3 项盘点出的账号，逐个改插件（密码可沿用原口令，但要先确认应用驱动支持 `caching_sha2_password`）：

```sql
ALTER USER '<应用账号>'@'<来源>' IDENTIFIED WITH caching_sha2_password BY '<口令>';
```

实在来不及迁的账号，可以在 8.4 的 `[mysqld]` 配置中加 `mysql_native_password=ON` 临时启用旧插件过渡——但这只是过渡手段：该插件已在 9.x 被彻底移除，启用后要排期完成迁移，不要长期挂着。

### 5.2 升级前全量备份（硬性前置）

回滚的前提就是这一步（原因见 5.6 节），没有完成并核对过的备份，不要开始升级：

```bash
# 逻辑全量：含存储过程、触发器与事件（root 已改密码认证的环境给 mysqldump 与 mysql 命令加 -p）
sudo mysqldump -u root --all-databases --single-transaction --routines --triggers --events | sudo tee /root/mysql-full-$(date +%F).sql > /dev/null

# 配置文件与账号清单一并留档
sudo cp -a /etc/mysql /root/mysql-etc-$(date +%F)
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;" | sudo tee /root/mysql-users-$(date +%F).txt

# 核对备份确实写出来了
ls -lh /root/mysql-full-*.sql
```

核对备份文件大小不为 0、能正常打开读到建库语句；备份与还原的完整方法与演练见 [MySQL 备份、定时与还原演练（第 11.4 章）](04-mysql-backup-restore.md)。时间允许时，先把这份备份在另一台机器或测试实例上实际恢复一次，确认它真的能用，再动生产。

### 5.3 路线一：原地升级

```bash
# 1. 若本机尚未接入 Oracle 官方源，先按 3.1 节装好 mysql-apt-config 并选中 mysql-8.4-lts 组件
#    然后确认候选版本已切到 8.4（仍显示 8.0 就不要继续）
sudo apt update
apt-cache policy mysql-server

# 2. 停服务（升级窗口内业务不可用，提前公告）
sudo systemctl stop mysql

# 3. 安装 8.4：apt 以官方源的 mysql-community-* 组件包替换仓库版包
sudo apt install -y mysql-server

# 4. 启动；8.4 首次启动时会自动完成数据字典升级
sudo systemctl start mysql
sudo systemctl status mysql --no-pager

# 5. 看错误日志确认升级完成、无新增报错
sudo tail -n 100 /var/log/mysql/error.log
sudo mysql -u root -e "SELECT VERSION();"
```

启动失败先看错误日志定位，不要反复重启碰运气：最高频原因是 5.1 第 4 项的已移除变量没清干净，回配置文件处理后重新启动。

### 5.4 路线二：逻辑迁移

适合顺带换机器、换云的场景：旧 8.0 实例全程保持不动，在新机按 3.1 节装好 8.4 后导数据：

```bash
# 1. 旧机：按 5.2 节做全量备份，并把备份文件拷到新机

# 2. 新机：导入（新机 root 是安装时设的密码认证）
sudo mysql -u root -p < /root/mysql-full-2026-01-01.sql
```

导入后在新旧两边各跑一遍对照（粗对用表数量与行数，关键表逐表校验和）：

```sql
-- 业务库的表数量（两边应一致）
SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys');

-- 关键表行数抽查（information_schema 的 TABLE_ROWS 对 InnoDB 是估算值，只作粗对）
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '<业务库>';

-- 关键表校验和（新旧两边各跑一次，值一致才算对得上）
CHECKSUM TABLE <业务库>.<关键表>;
```

行数与校验和都对上后，再把应用连接切到新机。旧机至少保留到观察期结束，不要切完就下线——逻辑迁移的回滚靠的就是它（见 5.6 节）。

### 5.5 升级后检查

```bash
sudo mysql -u root -e "SELECT VERSION();"
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;"
sudo tail -n 100 /var/log/mysql/error.log
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
```

期望：`VERSION()` 为 8.4 开头的版本；账号插件清单与 5.1 第 1 项记录的一致，不应再有 `mysql_native_password`（按 5.1 说明显式临时启用的除外）；错误日志无新的错误；重启后服务仍正常。最后用应用账号从应用服务器实际连一次，跑一条只读查询做冒烟——只看服务是 `active` 不算升级验收，应用连得上、查得到数据才算完成。

### 5.6 回滚：不能降级，只能用升级前备份恢复

!!! danger "8.4 启动后不能降级"
    8.4 首次启动时数据字典已经升级，**不能再用 8.0 的二进制直接打开同一个数据目录**，强行降级只会得到服务起不来或数据损坏。回滚的唯一路径是 5.2 节的升级前全量备份：把数据恢复到一个 8.0 实例里。这就是本节把备份定为硬性前置的原因——没有那份备份，就没有回滚。

原地升级的回滚步骤：

```bash
# 1. 停掉 8.4，保留现场：数据目录改名留存，定性前不要删
sudo systemctl stop mysql
sudo mv /var/lib/mysql /var/lib/mysql.after84.$(date +%F)

# 2. 停用 Oracle 官方源（重新运行 mysql-apt-config 取消 MySQL Server 组件，或移除其源配置），
#    刷新后确认候选版本回到 8.0 系列，再装回仓库版；装回时 apt 会要求先移除官方源的
#    mysql-community-* 组件包，这是预期内的包冲突，按 apt 给出的移除方案确认，不要用 --force 强装
sudo dpkg-reconfigure mysql-apt-config
sudo apt update
apt-cache policy mysql-server
sudo apt install -y mysql-server mysql-client
sudo systemctl start mysql

# 3. 导入升级前全量备份
sudo mysql -u root < /root/mysql-full-2026-01-01.sql

# 4. 回滚验证：版本、账号清单、应用冒烟逐项过
sudo mysql -u root -e "SELECT VERSION(); SELECT user, host, plugin FROM mysql.user;"
```

期望 `VERSION()` 回到 8.0 系列、账号清单与 5.1 第 1 项记录一致、应用冒烟通过，才算回滚完成。逻辑迁移路线不需要上面这套回滚：旧 8.0 实例全程未动，把应用连接指回旧机即可，这也是它可回退性最好的原因。

## 六、常见错误与排坑指南（2~3 个真实报错场景：报错原文片段+原因+修复命令；含本简报点名的经典报错）

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
dpkg: error processing package mysql-server
Job for mysql.service failed because the control process exited with error code.
```

报错中的包名随路线不同：发行版仓库版是 `mysql-server-8.0`，8.4 官方源是 `mysql-community-server`，以你机器日志里的实际包名为准。原因：多见于同一台机器先装 MariaDB 又装 MySQL、残留了旧数据目录或旧配置；也可能是磁盘已满或旧进程仍占用 3306。修复顺序是先看日志定位、再处理冲突，不要反复重装：

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
# 再按你选定的路线重新安装：路线 A 先接官方源再装 mysql-server（见 3.1 节），路线 C 直接装仓库版
sudo apt install -y mysql-server
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

## 七、生产环境最佳实践与安全建议

第一，版本只走主线：新部署只用 MySQL 8.4 LTS 并跟随 Oracle 官方源的安全更新；同一台机器上官方源与发行版源不要混用，`mysql-server` 只允许一个来源供给，避免两个源的版本互相顶替；存量 8.0 按第五节升级，不要长期停留在没有安全补丁的 Sustaining 阶段。MariaDB 继续跟随发行版仓库的安全更新。第二，口令纪律：`root` 口令不少于 12 位、进密码管理器、与系统密码不同，策略不低于 MEDIUM，禁止空密码，上线前盘查一遍账号清单。第三，攻击面收敛：初始化四项必须全做，3306 默认不放行，远程按第 11.2 章分层开口，绝不对公网全开。第四，双管理通道：`root` 之外另建独立运维账号并验证可用，认证变更遵循「先建新路、验证、再改旧路」。第五，变更留痕，改配置前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.$(date +%F-%H%M)
sudo mysql -u root -e "SELECT user, host, plugin FROM mysql.user;" | sudo tee /root/mysql-users-$(date +%F).txt
```

第六，上线检查单：服务自启与重启回归通过、匿名用户与 `test` 库已删、远程 `root` 已禁、口令策略已开、版本与账号清单已入档，全勾才算交付。下一章建业务库与应用账号，并安全地打开远程访问。
