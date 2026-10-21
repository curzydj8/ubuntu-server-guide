---
description: "MongoDB 是文档型数据库，以 JSON 风格文档存储数据，模式灵活，适合内容管理、商品目录、用户画像、日志与快速迭代的业务。"
---

# MongoDB 安装、认证与调优

## 一、概述与使用场景

MongoDB 是文档型数据库，以 JSON 风格文档存储数据，模式灵活，适合内容管理、商品目录、用户画像、日志与快速迭代的业务。它的代价是运维约束比关系型数据库更隐蔽：默认安装若不启用认证、不限制监听地址，27017 端口一旦暴露公网就会被批量扫描入侵。本章的安全基线同样是硬性要求：启用 `authorization`、创建分权账号、`bindIp` 只绑本地或内网、27017 绝不直接对公网全开。

本章覆盖官方源安装、`mongosh` 管理工作流、管理员与应用用户创建，以及三项生产调优要点：WiredTiger 缓存计算、文件句柄上限、监听地址收敛。

!!! note "版本口径"
    MongoDB 大版本迭代较快，本章源路径中的版本号为示例，安装时请以 mongodb.com 官方文档当前稳定大版本为准，替换示例中的版本数字即可，其余步骤通用。不要使用已停止维护的大版本新建生产实例。

## 二、环境准备与前置条件

系统为 Ubuntu 22.04 LTS（Jammy）或 Ubuntu 24.04 LTS（Noble）。操作账号需 `sudo` 权限，示例账号为 `ubuntu`。硬件建议：至少 2 核 4 GB 内存，数据目录使用 SSD 并预留数据集两倍空间；WiredTiger 缓存计算需要先确认物理内存总量。

```bash
lsb_release -a
free -h
df -h /
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo ufw status
ulimit -n
```

## 三、手把手操作步骤

### 3.1 添加官方源（keyring 加源文件）

MongoDB 官方源使用独立 GPG keyring。以官方现行大版本 8.0 为示例（以 mongodb.com 文档为准），导入服务器密钥：

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
ls -l /usr/share/keyrings/mongodb-server-8.0.gpg
```

生成源文件，命令按 Ubuntu 代号区分。22.04（Jammy）执行：

```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
```

24.04（Noble）把上行中的 `jammy` 换为 `noble` 后执行。随后安装：

```bash
cat /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org
mongod --version
mongosh --version
sudo systemctl enable mongod
```

关键路径：

| 用途 | 完整路径 |
| --- | --- |
| 主配置文件 | `/etc/mongod.conf` |
| 数据目录 | `/var/lib/mongo` |
| 日志文件 | `/var/log/mongodb/mongod.log` |
| systemd 单元 | `/lib/systemd/system/mongod.service` |

### 3.2 首次启动与启用 authorization

改配置前先备份：

```bash
sudo cp /etc/mongod.conf /etc/mongod.conf.bak.$(date +%F)
sudo cat /etc/mongod.conf
```

初始配置先保持 `bindIp: 127.0.0.1` 启动一次，在无认证状态下仅通过本机 localhost 例外创建管理员，随后立即开启认证。编辑 `/etc/mongod.conf` 确认存储与网络段：

```yaml
storage:
  dbPath: /var/lib/mongo
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
```

```bash
sudo systemctl start mongod
sudo systemctl status mongod --no-pager
mongosh --eval 'db.runCommand({ ping: 1 })'
```

返回 `{ ok: 1 }` 说明实例已就绪。

### 3.3 创建管理员与应用用户

用 `mongosh` 在 `admin` 库创建管理员。管理员只用于管理，不给业务程序使用：

```javascript
use admin
db.createUser({
  user: "opsadmin",
  pwd: "<password>",
  roles: [{ role: "userAdminAnyDatabase", db: "admin" }, { role: "readWriteAnyDatabase", db: "admin" }]
})
db.getUsers()
```

应用用户遵循最小权限：只给目标业务库的 `readWrite`，示例业务库为 `appdb`、应用账号为 `appuser`：

```javascript
use appdb
db.createUser({
  user: "appuser",
  pwd: "<password>",
  roles: [{ role: "readWrite", db: "appdb" }]
})
db.getUsers()
```

只读报表账号示例，只给 `read` 且限定单库：

```javascript
use appdb
db.createUser({
  user: "readonly",
  pwd: "<password>",
  roles: [{ role: "read", db: "appdb" }]
})
```

创建完成后退出，在配置中启用认证并重启。再次备份后编辑 `/etc/mongod.conf` 追加安全段：

```bash
sudo cp /etc/mongod.conf /etc/mongod.conf.bak.auth.$(date +%F)
sudo nano /etc/mongod.conf
```

```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin --eval 'db.runCommand({ ping: 1 })'
mongosh --eval 'db.runCommand({ ping: 1 })'
```

期望：带管理员认证的命令返回 `{ ok: 1 }`；不带认证的连接可以连上 shell，但执行读写会被拒绝并提示 `not authorized`，这正说明认证已生效。不要在启用认证前把 `bindIp` 改到内网地址，顺序必须是先建管理员、再开认证、最后才扩监听范围。

### 3.4 mongosh 基本管理工作流

管理员日常巡检命令集：

```javascript
db.adminCommand({ serverStatus: 1 }).version
show dbs
use appdb
show collections
db.stats()
db.users.find()
db.getCollectionInfos()
db.runCommand({ dbStats: 1, scale: 1024 * 1024 })
```

应用账号连接与读写验证：

```bash
mongosh -u appuser -p '<password>' --authenticationDatabase appdb appdb
```

```javascript
db.orders.insertOne({ orderId: "example-001", amount: 99, status: "paid" })
db.orders.find()
db.orders.createIndex({ orderId: 1 }, { unique: true })
db.orders.getIndexes()
db.orders.countDocuments()
```

权限隔离验证：用 `appuser` 尝试访问其他库应被拒绝：

```javascript
use otherdb
db.secret.find()
```

返回 `not authorized on otherdb` 即为期望结果。

常用运维操作：改密码、追加角色、删用户：

```javascript
use appdb
db.changeUserPassword("appuser", "<password>")
db.grantRolesToUser("appuser", [{ role: "read", db: "reportdb" }])
db.dropUser("readonly")
```

### 3.5 生产调优要点一：WiredTiger cacheSizeGB 计算依据

WiredTiger 是默认存储引擎，其缓存直接决定命中率。官方默认值为物理内存减 1 GB 后的 50% 与 256 MB 取大者，即公式：`cacheSizeGB = max(0.5 × (RAM − 1 GB), 0.256 GB)`。计算依据是给操作系统页缓存、连接与聚合临时内存留出另一半，避免 MongoDB 与系统争内存触发 OOM。

示例计算：机器 16 GB 内存，默认值约为 `0.5 × (16 − 1) = 7.5 GB`；若同一台机器还跑应用与其他服务，应手动下调，例如只给 MongoDB 8 GB 预算时设为 4 GB。不要把缓存设到接近总内存，WiredTiger 缓存之外还需要内存放操作系统缓存，设满反而让磁盘读取变多、性能下降。

改配置前备份，在 `/etc/mongod.conf` 的 `storage` 段设置：

```bash
sudo cp /etc/mongod.conf /etc/mongod.conf.bak.cache.$(date +%F)
sudo nano /etc/mongod.conf
```

```yaml
storage:
  dbPath: /var/lib/mongo
  wiredTiger:
    engineConfig:
      cacheSizeGB: 4
```

```bash
sudo systemctl restart mongod
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin --eval 'db.serverStatus().wiredTiger.cache'
```

输出中的 `maximum bytes configured` 应与设置值对应（以字节显示）。

### 3.6 生产调优要点二：文件句柄 ulimit 与 systemd LimitNOFILE

MongoDB 每个连接、每个数据文件都占用文件描述符，默认软上限 1024 在并发稍高时就会耗尽并报 `Too many open files`。官方建议进程级上限至少 64000。systemd 托管时改 `ulimit` 命令或 `/etc/security/limits.conf` 对服务进程不生效，必须改单元的 `LimitNOFILE`，使用 override 文件不直接改原单元：

```bash
sudo systemctl edit mongod
```

在打开的编辑区写入：

```ini
[Service]
LimitNOFILE=64000
LimitNPROC=64000
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart mongod
cat /proc/$(pgrep -x mongod)/limits | grep "open files"
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin --eval 'db.serverStatus().connections'
```

`Max open files` 一行应显示 `64000`。同时确认数据目录属主正确：`sudo chown -R mongodb:mongodb /var/lib/mongo /var/log/mongodb`。

### 3.7 生产调优要点三：bindIp 只绑内网或本地

单机同应用部署保持 `bindIp: 127.0.0.1`。应用在内网其他机器时，改配置前备份，只追加服务器内网地址（示例 192.0.2.20），绝不写 `0.0.0.0`：

```bash
sudo cp /etc/mongod.conf /etc/mongod.conf.bak.bind.$(date +%F)
sudo nano /etc/mongod.conf
```

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1,192.0.2.20
```

```bash
sudo systemctl restart mongod
ss -tlnp | grep 27017
sudo ufw allow from 198.51.100.0/24 to any port 27017 proto tcp
sudo ufw status numbered
```

防火墙只放行应用服务器所在网段（示例 198.51.100.0/24），与 `bindIp` 形成分层防御。需要跨公网访问时走 VPN 或 SSH 隧道，不要直接开放 27017。

!!! tip "慢查询定位"
    开启 profiling 后在 `system.profile` 中查慢操作：`db.setProfilingLevel(1, { slowms: 200 })`，再用 `db.system.profile.find().sort({ ts: -1 }).limit(5)` 查看。profiling 有额外开销，定位完成后调回级别 0 或调高阈值。

## 四、效果验证与测试

```bash
sudo systemctl is-active mongod
mongod --version
mongosh -u appuser -p '<password>' --authenticationDatabase appdb appdb --eval 'db.orders.countDocuments()'
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin --eval 'JSON.stringify(db.serverStatus().connections)'
ss -tlnp | grep 27017
cat /proc/$(pgrep -x mongod)/limits | grep "open files"
```

期望：服务为 `active`，应用账号可读写自己的库、访问其他库被拒，`ss` 仅显示 127.0.0.1 与内网地址监听，文件句柄上限为 64000。

## 五、常见错误与排坑指南

场景一：启用认证后管理员登不上。报错原文片段：`Error: Authentication failed.`。原因：登录时未指定 `--authenticationDatabase admin`，`mongosh` 默认去目标库找用户，而管理员建在 `admin` 库。修复：

```bash
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin admin
```

场景二：服务启动失败且日志报权限问题。日志原文片段：`Failed to set up listener: SocketException: Address already in use` 或 `Permission denied` 于数据目录。原因：27017 被占用，或 `/var/lib/mongo` 属主被误改。修复：

```bash
sudo ss -tlnp | grep 27017
sudo chown -R mongodb:mongodb /var/lib/mongo /var/log/mongodb
sudo systemctl restart mongod
sudo tail -n 50 /var/log/mongodb/mongod.log
```

场景三：高并发下连接被拒。报错原文片段：`Too many open files` 或客户端大量 `connection pool closed`。原因：`LimitNOFILE` 仍为默认值，未按 3.6 调整或改后未 `daemon-reload`。修复后重启并复查 `/proc` 限额，确认 64000 已生效再压测。

## 六、生产环境最佳实践与安全建议

账号分权落实到库：管理员、应用、只读、备份四类账号分离，备份账号示例只给 `backup` 与目标库 `read` 相关角色，禁止用管理员账号跑应用或备份脚本。密码不少于 16 位，通过配置管理下发到应用，不要提交到 Git。

数据安全：开启认证的同时规划副本集与备份，单节点无高可用，重要业务至少 3 节点副本集起步；备份用 `mongodump` 并定期做 `mongorestore` 隔离演练验证：

```bash
mongodump -u opsadmin -p '<password>' --authenticationDatabase admin --db appdb --out /var/backups/mongo_$(date +%F)
mongorestore -u opsadmin -p '<password>' --authenticationDatabase admin --db appdb_restore /var/backups/mongo_2026-01-01/appdb
mongosh -u opsadmin -p '<password>' --authenticationDatabase admin --eval 'db.getSiblingDB("appdb_restore").orders.countDocuments()'
```

监控关注连接数使用率、WiredTiger 缓存命中与驱逐、复制延迟、磁盘使用率超过 80% 告警。升级只跨一个大版本逐级进行，先在备份恢复出的实例上验证驱动兼容性，再动生产。
