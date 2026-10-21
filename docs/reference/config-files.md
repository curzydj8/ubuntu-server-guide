---
description: "配置文件索引：sshd、Netplan、fstab、Nginx、MySQL、PostgreSQL、Redis、Postfix、BIND、systemd 等常用配置文件的路径、所属软件、用途、修改风险与改前备份和恢复方法。"
---

# 配置文件索引

本表按路径汇总服务器上最常改的一批配置文件。通用纪律先说清：**任何一行，动手前先备份、改完先校验、最后才重载或重启**，不要编辑完直接重启服务赌运气。

通用备份与恢复式（把路径换成本表目标文件）：

```bash
# 改前备份（带日期，多次改动互不覆盖）
sudo cp /etc/xxx/xxx.conf /etc/xxx/xxx.conf.bak-$(date +%F)

# 改坏了恢复：还原备份后跑该软件的校验命令（见表内），通过再重载服务
sudo cp /etc/xxx/xxx.conf.bak-2026-10-21 /etc/xxx/xxx.conf
```

风险口径：**高** = 写错会导致服务锁死、整机断联或无法启动（如 sshd、fstab、GRUB、pg_hba）；**中** = 写错导致对应服务起不来或行为异常，但系统与其他服务不受影响；**低** = 影响面小或改了也不会生效（自动生成文件）。风险高的文件，改之前除备份外还要留好退路：保持一个已登录会话、准备控制台或救援通道。

| 路径 | 所属软件 | 用途 | 修改风险 | 改前备份与恢复方法 | 详见 |
| --- | --- | --- | --- | --- | --- |
| `/etc/ssh/sshd_config` | OpenSSH 服务端 | SSH 服务端总配置：端口、登录方式、密钥与口令开关 | 高 | 通用式备份；改后先 `sudo sshd -t` 校验，通过后 `systemctl reload ssh`，且保留旧会话验证新登录再退出 | [SSH 安全加固](../02-security/01-ssh-hardening.md) |
| `~/.ssh/config` | OpenSSH 客户端 | 按主机别名保存连接参数、跳板与密钥路径 | 低 | `cp ~/.ssh/config ~/.ssh/config.bak`；改后用 `ssh -G 别名` 展开生效配置核对 | [SSH 连接与客户端配置](../14-ssh/02-connect-config.md) |
| `/etc/netplan/*.yaml` | Netplan | 网卡地址、网关与 DNS 的声明式网络配置 | 高 | 整目录打包备份；先 `sudo netplan generate` 校验，再 `sudo netplan try` 试应用（超时自动回滚），确认连通后才正式 apply | [首次登录与网络初始化](../01-basics/03-first-login-network.md) |
| `/etc/fstab` | 系统挂载 | 开机自动挂载表：文件系统、挂载点与挂载选项 | 高 | 通用式备份；改后先 `sudo mount -a` 全量试挂并用 `findmnt --verify` 校验，无报错再重启 | [挂载与存储共享](../03-storage/03-mount-sharing.md) |
| `/etc/hosts` | 系统解析 | 本机静态域名映射，先于 DNS 生效 | 低 | 通用式备份；改后 `ping 主机名` 验证，无需重载任何服务 | [域名解析与网络连接](../09-web-hosting/01-dns-resolution.md) |
| `/etc/resolv.conf` | systemd-resolved 等 | 本机 DNS 解析器配置，**多为自动生成的软链结果** | 低 | 不要直接编辑：改 Netplan 或上游 DNS 配置后它会自动重生成，手改内容会被覆盖或还原 | [DNS 服务器搭建](../04-network/01-dns.md) |
| `/etc/nginx/nginx.conf` 与 `/etc/nginx/sites-available/` | Nginx | 主配置与各站点定义，sites-enabled 用软链启用 | 中 | 通用式备份（站点文件逐个备）；`sudo nginx -t` 校验通过后 `sudo systemctl reload nginx` | [Web 服务器与反向代理](../04-network/02-web-proxy.md) |
| `/etc/mysql/mysql.conf.d/mysqld.cnf` | MySQL / MariaDB | 服务端参数：内存、连接数、日志与数据目录 | 中 | 通用式备份；MySQL 8 可先 `mysqld --validate-config` 校验再重启，参数写错数据库会直接起不来 | [MySQL 核心参数调优](../11-databases/03-mysql-tuning.md) |
| `/etc/postgresql/<版本>/main/postgresql.conf` | PostgreSQL | 服务端主参数：监听、内存、日志与 WAL 归档 | 中 | 通用式备份；多数参数改后只需 reload（`pg_reload_conf()`），需重启的参数攒到维护窗口一次改齐 | [PostgreSQL 安装与认证](../11-databases/05-postgresql-install-auth.md) |
| `/etc/postgresql/<版本>/main/pg_hba.conf` | PostgreSQL | 客户端认证规则：谁能从哪以什么方式连接 | 高 | 通用式备份；保持一个已连接会话，改后 reload 并**新开连接**验证放行与拒绝都符合预期，写错会把自己也锁在门外 | [PostgreSQL 安装与认证](../11-databases/05-postgresql-install-auth.md) |
| `/etc/redis/redis.conf` | Redis | 绑定地址、端口、密码、持久化与内存上限 | 中 | 通用式备份；先用新配置在临时端口起一个验证实例，能启动且能读写后再重启正式实例 | [Redis 与 Sentinel 高可用](../11-databases/07-redis.md) |
| `/etc/mongod.conf` | MongoDB | YAML 格式配置：数据目录、绑定 IP 与认证开关 | 中 | 通用式备份；先做 YAML 语法校验，`bindIp` 与开启认证必须成套改，避免改完自己连不上 | [MongoDB 安装与调优](../11-databases/08-mongodb.md) |
| `/etc/chrony/chrony.conf` | Chrony | NTP 时间源池与同步、校时策略 | 中 | 通用式备份；`chronyd -p` 可打印解析校验配置，重启 chrony 后用 `chronyc tracking` 确认已同步 | [时间同步与系统日志](../04-network/04-time-logging.md) |
| `/etc/samba/smb.conf` | Samba | SMB 共享定义与全局参数 | 中 | 通用式备份；`testparm` 校验并输出生效配置，确认后 reload smbd | [挂载与存储共享](../03-storage/03-mount-sharing.md) |
| `/etc/exports` | NFS 服务端 | 导出目录清单与允许来源、权限选项 | 中 | 通用式备份；`sudo exportfs -ra` 重新导出后用 `exportfs -v` 核对生效规则 | [挂载与存储共享](../03-storage/03-mount-sharing.md) |
| `/etc/postfix/main.cf` | Postfix | 发信域名、监听接口与中继策略 | 中 | 通用式备份；`sudo postfix check` 校验、`postconf -n` 核对改动项，通过后 reload postfix | [邮件服务器](../09-web-hosting/06-mail-server.md) |
| `/etc/dovecot/dovecot.conf` | Dovecot | IMAP / POP3 收信与认证配置，常拆分在 conf.d 多文件 | 中 | 整个 /etc/dovecot 目录打包备份；`sudo doveconf -n` 输出生效配置并完成校验后 reload | [邮件服务器](../09-web-hosting/06-mail-server.md) |
| `/etc/bind/named.conf`（含 `named.conf.options`） | BIND 9 | DNS 服务全局选项与区域（zone）声明 | 中 | 通用式备份；`named-checkconf` 校验主配置、`named-checkzone 域名 区域文件` 校验区域，通过后 `rndc reload` | [DNS 服务器搭建](../04-network/01-dns.md) |
| `/etc/systemd/system/*.service` | systemd | 自定义服务与定时器的单元定义 | 中 | 单元文件逐个备份；`systemd-analyze verify 单元名` 校验后 `systemctl daemon-reload` 再启停 | [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md) |
| `/etc/sudoers` 与 `/etc/sudoers.d/` | sudo | 谁能以什么身份执行什么命令的授权表 | 高 | 只用 `sudo visudo` 编辑（保存时自带语法校验），改完再 `sudo visudo -c` 复核；全程保留一个可用 sudo 会话验证新规则 | [用户、Sudo 与 PAM](../02-security/02-users-sudo-pam.md) |
| `/etc/apt/apt.conf.d/50unattended-upgrades` | unattended-upgrades | 自动安全更新的来源白名单与包黑名单策略 | 中 | 通用式备份；`sudo unattended-upgrades --dry-run` 试运行确认升级范围符合预期 | [软件源与包管理](../01-basics/04-package-management.md) |
| `/etc/default/grub` | GRUB | 内核启动参数与引导菜单行为 | 高 | 通用式备份；改后必须 `sudo update-grub` 重新生成引导配置，参数写错可能无法启动，先备好救援盘或云控制台 | [系统无法启动修复](../08-troubleshooting/01-boot-repair.md) |
| `/etc/sysctl.conf` 与 `/etc/sysctl.d/` | 内核参数 | 内核运行时参数（网络、内存、句柄等）的持久化定义 | 中 | 先 `sysctl -a` 导出当前值存档对照；改后 `sudo sysctl --system` 重载并逐项读回验证，注意同名参数按文件顺序后者覆盖前者 | [内核与性能调优](../06-monitoring/04-kernel-tuning.md) |
| `/var/lib/docker` | Docker | 镜像、容器与数据卷的实际数据目录，**不是配置文件** | 高 | 不要手工增删内部文件；迁移走停机后整目录复制，清理走 `docker` 命令，误删等于全部容器数据丢失 | [Docker 基础与进阶](../05-containers/01-docker.md) |

两条补充说明：

- 表中标注「自动生成」的文件（`/etc/resolv.conf` 是典型）不要养成直接编辑的习惯，要找它的**上游来源**（Netplan、systemd-resolved、DHCP 客户端或云厂商的 cloud-init）去改，否则重启或续租后就会被打回原样，上游机制见[术语表](glossary.md)的 cloud-init 条目。
- 配置文件的恢复顺序永远是「还原备份 → 跑该软件的校验命令 → 重载」，校验不过就不要重载：多数服务重载失败会保持旧配置继续跑，强行重启则可能直接起不来，把小问题升级成停机。
