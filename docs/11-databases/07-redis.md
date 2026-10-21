# Redis 持久化、主从与 Sentinel

## 一、概述与使用场景

Redis 是内存键值数据库，常用于缓存、会话、排行榜、限流计数与轻量消息队列。它的风险同样典型：默认监听与弱认证配置曾导致大量未授权访问事件，因此本章的安全基线是硬性要求——必须设置密码、`protected-mode` 保持开启、6379 绝不直接对公网全开。

内容分三层：单机安装与 `redis.conf` 关键项、RDB 与 AOF 持久化取舍、主从复制与 Sentinel 哨兵高可用。Sentinel 采用 3 节点部署，给出 quorum 计算依据与故障切换演练的完整验证命令，实现从配置到切换的闭环。

## 二、环境准备与前置条件

系统为 Ubuntu 22.04/24.04 LTS。单机与主从演练至少 1 台服务器，Sentinel 生产部署需要 3 台服务器（或 3 个独立故障域），示例地址分别使用文档段 192.0.2.11、192.0.2.12、192.0.2.13。操作账号需 `sudo` 权限，示例账号为 `ubuntu`。内存规划：Redis 数据集应小于物理内存的 70%，例如 8 GB 内存机器 `maxmemory` 建议不超过 5 GB，给系统、复制缓冲区与 AOF 重写留余量。

```bash
lsb_release -a
free -h
sudo apt update
sudo ufw status
```

## 三、手把手操作步骤

### 3.1 apt 安装 Redis

Ubuntu 仓库的 Redis 由 systemd 托管，安装简单稳定，适合大多数场景：

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
sudo systemctl status redis-server --no-pager
redis-cli ping
ss -tlnp | grep 6379
```

`redis-cli ping` 返回 `PONG` 表示服务可用。关键路径：

| 用途 | 完整路径 |
| --- | --- |
| 主配置文件 | `/etc/redis/redis.conf` |
| Sentinel 配置 | `/etc/redis/sentinel.conf`（Sentinel 示例部署时创建） |
| 数据目录 | `/var/lib/redis` |
| 日志文件 | `/var/log/redis/redis-server.log` |

### 3.2 redis.conf 关键项逐项讲解

改任何配置前先备份：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak.$(date +%F)
sudo nano /etc/redis/redis.conf
```

单机安全基线配置：

```ini
bind 127.0.0.1 -::1
protected-mode yes
port 6379
requirepass <password>
daemonize yes
supervised auto
dir /var/lib/redis
logfile /var/log/redis/redis-server.log
```

逐项讲解：

| 配置项 | 说明与取值依据 |
| --- | --- |
| `bind 127.0.0.1 -::1` | 只监听回环地址，最安全。同机应用直连即可。需要内网其他机器访问时改为 `bind 127.0.0.1 192.0.2.11`，把后一地址换成服务器内网地址，同时用防火墙只放行应用网段 |
| `protected-mode yes` | 保护模式。开启时若既绑了全网地址又没设密码，Redis 只允许本机访问。生产保持 `yes`，不要为图省事改 `no` |
| `requirepass <password>` | 设置连接密码，客户端用 `AUTH <password>` 或 `redis-cli -a <password>` 认证。密码不少于 20 位随机字符，禁止空密码与弱口令 |
| `port 6379` | 默认端口。改非标端口不能替代密码与防火墙，仅作辅助 |
| `supervised auto` | 与 systemd 配合汇报启动状态，Ubuntu 包默认已适配 |
| `dir /var/lib/redis` | RDB 与 AOF 文件存放目录，需保证 `redis` 用户可写 |

改完重启并验证密码生效：

```bash
sudo systemctl restart redis-server
redis-cli ping
redis-cli -a '<password>' ping
redis-cli -a '<password>' CONFIG GET requirepass
```

未带密码的 `ping` 应返回 `(error) NOAUTH Authentication required.`，带密码返回 `PONG`，这才是期望结果。

!!! warning "不要把 6379 映射到公网"
    云服务器安全组、`ufw`、Docker 端口发布三处只要有一处把 6379 开到 `0.0.0.0`，未授权扫描会在数小时内命中。内网访问一律 `bind` 内网地址加防火墙白名单双保险。

### 3.3 持久化：RDB 与 AOF 对比与配置

| 对比项 | RDB | AOF |
| --- | --- | --- |
| 原理 | 定时把内存快照写为 `dump.rdb` | 把每条写命令追加到日志文件 |
| 数据丢失窗口 | 两次快照之间的数据，分钟级 | 按 `appendfsync` 策略，最多约 1 秒 |
| 文件体积 | 小，压缩好 | 大，需定期重写 |
| 恢复速度 | 快 | 较慢，大文件更明显 |
| 适用场景 | 缓存可丢数据、备份快照 | 会话、队列等不能多丢的场景 |

生产推荐两者同时开启：RDB 做快速恢复与备份，AOF 降低丢失窗口。配置示例（写入 `/etc/redis/redis.conf`）：

```ini
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

`save` 三行含义：900 秒内至少 1 次写入、300 秒内至少 10 次写入、60 秒内至少 10000 次写入，任一满足即触发快照。`appendfsync` 三种策略取舍：`always` 每条命令都刷盘，最安全但性能损失明显；`everysec` 每秒刷盘，最多丢约 1 秒数据，生产首选；`no` 交给操作系统决定，速度最快但宕机可能丢数十秒数据。`auto-aof-rewrite-percentage 100` 表示 AOF 文件比上次重写后增大 100% 且超过 64 MB 时自动重写控体积。

```bash
sudo systemctl restart redis-server
redis-cli -a '<password>' INFO persistence
redis-cli -a '<password>' SET persist_test ok
redis-cli -a '<password>' BGSAVE
ls -lh /var/lib/redis/
```

### 3.4 主从复制配置

设主库为 192.0.2.11、从库为 192.0.2.12，两台都已按 3.2 设置相同 `requirepass`。主库还需允许从库用密码拉取，在主库 `/etc/redis/redis.conf` 中确认：

```ini
bind 127.0.0.1 192.0.2.11
requirepass <password>
masterauth <password>
```

`masterauth` 是本节点作为从库时连接主库用的密码，主库预先写好可保证主从切换后新从库仍能认证，建议所有节点统一配置 `requirepass` 与 `masterauth` 为同一强密码。

改从库前备份，并在从库配置中追加复制指向：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak.$(date +%F)
sudo nano /etc/redis/redis.conf
```

```ini
bind 127.0.0.1 192.0.2.12
requirepass <password>
masterauth <password>
replicaof 192.0.2.11 6379
replica-read-only yes
```

```bash
sudo systemctl restart redis-server
redis-cli -a '<password>' INFO replication
redis-cli -h 192.0.2.11 -a '<password>' INFO replication
```

也可以不改文件、运行时指定（重启失效，仅用于临时演练）：`redis-cli -a '<password>' REPLICAOF 192.0.2.11 6379`。

### 3.5 Sentinel 哨兵高可用（3 节点）

架构：3 台服务器各跑一个 Redis 与一个 Sentinel，Sentinel 互相监视并在主库故障时选举新主。为什么必须 3 个且为奇数：Sentinel 靠多数派判定主库下线与完成选举，2 个节点时坏 1 个就失去多数派，容错为零；3 个节点允许坏 1 个，5 个允许坏 2 个。

quorum 取值依据：`quorum` 是判定主库客观下线的最少 Sentinel 票数，应设为节点数的多数，即 `floor(N/2)+1`。3 节点时 quorum 为 2；5 节点时为 3。设为 1 会导致单个 Sentinel 误判即切换，设为 3 则坏 1 个 Sentinel 就永远无法切换，都不符合容错目标。

三台机器分别创建 Sentinel 配置。先在每台备份并新建文件：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak.$(date +%F)
sudo nano /etc/redis/sentinel.conf
sudo chown redis:redis /etc/redis/sentinel.conf
sudo chmod 644 /etc/redis/sentinel.conf
```

三台内容相同，仅 `bind` 换成本机内网地址：

```ini
# Sentinel 监听端口，不要与 redis 的 6379 混淆
port 26379
# 只绑本机内网与回环，禁止对公网开放 26379
bind 127.0.0.1 192.0.2.11
# 后台运行，并与 systemd 配合
daemonize yes
supervised auto
# Sentinel 运行目录与日志
dir /var/lib/redis
logfile /var/log/redis/redis-sentinel.log
# 监视名为 mymaster 的主库，初始地址为主库，后面的 2 即 quorum
sentinel monitor mymaster 192.0.2.11 6379 2
# 主库密码，与 redis 的 requirepass 一致
sentinel auth-pass mymaster <password>
# 主库 5000 毫秒无响应判定主观下线
sentinel down-after-milliseconds mymaster 5000
# 故障切换超时 60000 毫秒内未完成视为失败
sentinel failover-timeout mymaster 60000
# 切换时最多 1 个从库同时向新主同步，避免多从同时全量同步压垮新主
sentinel parallel-syncs mymaster 1
```

启动 Sentinel（Ubuntu 包可用独立服务或直接以 sentinel 模式启动，二选一不要重复启动）：

```bash
sudo systemctl enable redis-sentinel
sudo systemctl start redis-sentinel
sudo systemctl status redis-sentinel --no-pager
redis-cli -p 26379 INFO sentinel
redis-cli -p 26379 SENTINEL master mymaster
```

若发行版没有 `redis-sentinel` 单元，使用：`sudo -u redis redis-server /etc/redis/sentinel.conf --sentinel`，并自行用 systemd 托管。注意 Sentinel 启动后会改写 `sentinel.conf` 保存已知从库与 Sentinel 列表，这是正常行为，不要把该文件设为只读。

!!! note "Sentinel 不是强一致保证"
    Sentinel 提供自动故障切换，但异步复制下主库宕机仍可能丢失未同步的少量写入。涉及资金等强一致场景应选用 Redis Cluster 加业务幂等，或改用关系型数据库，不要把 Sentinel 当零丢失方案。

## 四、效果验证与测试

单机与持久化验证：

```bash
redis-cli -a '<password>' INFO server
redis-cli -a '<password>' INFO persistence
redis-cli -a '<password>' SET verify_key hello
sudo systemctl restart redis-server
redis-cli -a '<password>' GET verify_key
```

重启后 `GET verify_key` 仍返回 `hello`，证明持久化有效。

主从验证：主库 `INFO replication` 期望包含 `role:master` 与 `connected_slaves:1`；从库期望包含 `role:slave`、`master_link_status:up`、`master_last_io_seconds_ago` 为个位数：

```bash
redis-cli -h 192.0.2.11 -a '<password>' INFO replication
redis-cli -h 192.0.2.12 -a '<password>' INFO replication
redis-cli -h 192.0.2.11 -a '<password>' SET repl_test ok
redis-cli -h 192.0.2.12 -a '<password>' GET repl_test
```

Sentinel 故障切换演练：记录当前主库，在主库上人为停服，观察切换：

```bash
redis-cli -p 26379 SENTINEL master mymaster
redis-cli -h 192.0.2.11 -a '<password>' DEBUG sleep 0
sudo systemctl stop redis-server
redis-cli -p 26379 SENTINEL master mymaster
redis-cli -p 26379 SENTINEL replicas mymaster
sudo tail -n 50 /var/log/redis/redis-sentinel.log
```

演练不要用 `DEBUG sleep` 做长时间阻塞测试，此处仅示意记录命令；正式演练直接停服即可。期望在 `down-after-milliseconds` 加选举时间内，`SENTINEL master` 显示的新主变为原从库地址，日志出现 `+switch-master`。恢复旧主后它会自动以从库身份加入：

```bash
sudo systemctl start redis-server
redis-cli -h 192.0.2.11 -a '<password>' INFO replication
```

旧主的 `role` 应为 `slave`。

## 五、常见错误与排坑指南

场景一：从库连不上主库。`INFO replication` 显示 `master_link_status:down`，日志报错原文片段：`Unable to connect to MASTER: Connection refused` 或 `Master has disconnected`。原因：主库 `bind` 未包含内网地址、防火墙未放行、或 `masterauth` 与主库 `requirepass` 不一致。修复：

```bash
sudo grep -E "^bind|^requirepass|^masterauth" /etc/redis/redis.conf
sudo ufw allow from 192.0.2.12 to any port 6379 proto tcp
redis-cli -h 192.0.2.11 -a '<password>' ping
```

场景二：改完密码客户端全断。报错原文片段：`(error) NOAUTH Authentication required.` 与 `(error) WRONGPASS invalid username-password pair`。原因：只改了服务端 `requirepass`，应用与 Sentinel 的 `auth-pass` 未同步。修复：统一更新应用连接串、从库 `masterauth` 与三台 Sentinel 的 `sentinel auth-pass` 后逐台重启。

场景三：AOF 文件损坏启动失败。日志报错原文片段：`Bad file format reading the append only file`。原因：宕机时 AOF 尾部写入不完整。修复：先备份原文件，再用官方修复工具截断到最后一条完整命令（会丢失尾部少量数据，需评估）：

```bash
sudo cp /var/lib/redis/appendonly.aof /var/lib/redis/appendonly.aof.bak
sudo redis-check-aof --fix /var/lib/redis/appendonly.aof
sudo systemctl start redis-server
```

新版 Redis 使用多部分 AOF 目录 `appendonlydir` 时，对目录内的 manifest 与 incr 文件执行同样的检查流程，以当前版本官方文档为准。

## 六、生产环境最佳实践与安全建议

安全：密码用密码管理系统下发并定期轮换；禁用或重命名高危命令时用 ACL 替代粗暴改名，为应用创建专用 ACL 用户只给所需命令与键前缀权限：

```bash
redis-cli -a '<password>' ACL SETUSER appuser on '><password>' ~app:* +get +set +del
redis-cli -a '<password>' ACL LIST
```

容量：设置 `maxmemory` 并选明确淘汰策略，如缓存场景用 `allkeys-lru`；开启慢日志 `slowlog-log-slower-than 10000` 便于定位大键问题。可用性：Sentinel 三节点跨故障域部署，客户端必须使用 Sentinel 模式连接而非写死主库 IP，否则切换后应用仍连旧主。备份：RDB 文件每日同步到独立存储并做一次隔离恢复演练，验证 `redis-check-rdb` 无错误：

```bash
sudo redis-check-rdb /var/lib/redis/dump.rdb
redis-cli -a '<password>' INFO stats
```
