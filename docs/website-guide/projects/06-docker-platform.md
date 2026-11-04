# PROJ-06：Docker 多容器网站平台完整教程

> 任务编号：PROJ-06（网站建设与部署实战指南 · 完整建站项目实战第 6 篇）
> 上一篇：[PROJ-05 PHP 网站、Go API 服务从零部署](05-php-go.md)；下一篇：[PROJ-07 论坛、电商、CMS、后台管理、SaaS](07-systems.md)。
> 本篇只讲一个完整实战：从零到上线，用 Docker Compose 搭一个多容器网站平台（Web + 应用 + 数据库 + 缓存），从域名解析、服务器准备、Compose 编排、Nginx 入口、HTTPS、备份、更新回滚，一步步走到上线。Docker 与 Compose 的概念、蓝绿部署与滚动部署的原理引用 DEPLOY-02，不在本篇重讲；本篇的重点是从零走通一个平台，不是重复讲概念。数据库备份脚本的通用做法引用 DB-02，本篇只给本平台能直接用的那一份。

## 1. 本章目标

读完并动手做完本篇，你能：

- 在一台 Ubuntu 服务器上，用一份 `docker-compose.yml` 拉起 Web、应用、数据库、缓存四个容器，组成一个能对外服务的网站平台。
- 说清这个平台里四个容器各自负责什么、谁能跟谁通信、谁不能从外网直接访问。
- 给平台配好域名解析、Nginx 入口、HTTPS 证书与自动续期，让浏览器用 `https://example.com` 打开网站。
- 给平台定好备份与更新回滚的办法：每天自动备份数据库与配置，换版本出问题能指回旧版本。
- 对照第 14 节的清单，在自己的服务器上逐项验证平台是真的上线了，而不是只在本地跑起来了。

## 2. 适用人群

- 已经读过 DEPLOY-02，知道镜像、容器、卷、网络这四个概念是干什么的，想把它们拼成一个真正上线的平台的人。
- 已经有一台 Ubuntu 服务器和一个域名，想用 Docker 方式部署网站，不想在服务器上直接装一堆语言环境的人。
- 不需要你会写后端框架：本篇的应用容器只是一个最小的 Node.js 应用，作用是让平台跑起来、让健康检查与反向代理有东西可查；换成你自己的应用时，改动点在第 9.6 节集中说明。

## 3. 适用系统和版本

- 服务器系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS，64 位，本文命令按 Ubuntu 的 apt 与 systemd 环境写。
- Docker Engine 与 Docker Compose v2（`docker compose` 子命令形式，不是旧的 `docker-compose` 独立程序）。安装时以 Docker 官网当场公布的安装方法为准，本文不写死某个补丁号。
- 应用运行环境：Node.js 22 LTS（Dockerfile 里用 `node:22-alpine` 镜像，安装时可用具体版本号钉住，见第 18 节标签策略）。
- 数据库与缓存：PostgreSQL 16 大版本线、Redis 7 大版本线（`docker-compose.yml` 里写 `postgres:16-alpine`、`redis:7-alpine`，安装时以 Docker Hub 当场公布的标签为准）。
- 域名：本文示例域名一律用保留域名 `example.com`，读者要换成自己的真实域名；示例邮箱一律用 `admin@example.com` 占位，申请证书时要换成自己的真实邮箱。

## 4. 使用前提

- 一台能用 SSH 登录的 Ubuntu 服务器，上面已经装好 Docker Engine 与 Docker Compose v2，或者你愿意按第 9.1 节先装好。
- 一个你能改 DNS 解析的域名，本文以 `example.com` 为例。
- 服务器的 80 与 443 端口没有被别的程序占用，防火墙放行这两个端口（只放行这两个，不放行数据库与缓存的端口）。
- 你手头有服务器的 SSH 登录方式（密钥登录优先，见 DEPLOY-01），并且知道怎么用 `sudo` 执行管理命令。

## 5. 所需资源

| 资源 | 说明 |
|---|---|
| 服务器 | 示例配置：2 核 CPU、4GB 内存、40GB 磁盘。这是示例，不是硬性要求；访问量小的个人站可以更低，访问量大的站要相应放大，见第 7.4 节的资源说明。 |
| 域名 | 1 个，已完成实名（实名与备案的适用范围见 NET-02；只有解析到中国内地服务器并开通 Web 服务时才需要大陆 ICP 备案）。 |
| 时间 | 约 1 到 2 小时，其中 DNS 生效等待与证书申请占一部分等待时间，不是全程都在敲命令。 |
| 费用 | 除服务器与域名本身的费用外，本文用到的软件（Docker、Nginx、PostgreSQL、Redis、Certbot）都不另收费。 |

## 6. 技术原理

本平台由四个容器组成，请求从外到内的路径只有一条：

1. 浏览器访问 `https://example.com`，DNS 把域名解析到服务器 IP。
2. 服务器上只有 Web 容器（Nginx）监听 80 与 443 端口，接住请求。
3. 80 端口的请求做两件事：ACME 验证路径放行给证书验证用，其余一律 301 跳转到 HTTPS。
4. 443 端口的请求由 Nginx 校验证书后，反向代理到应用容器。
5. 应用容器处理请求，需要数据时通过内部网络访问数据库容器与缓存容器。
6. 数据库容器与缓存容器不对外发布端口，外网连不上它们，只能被应用容器访问。

这个路径里有两个网络，作用不同：

- `frontend` 网络：Web 容器与应用容器都在上面，作用是让 Nginx 能把请求代理给应用。
- `backend` 网络：应用容器、数据库容器、缓存容器都在上面，并且设为内部网络（`internal: true`），作用是让数据库与缓存只能被应用访问，出了这个网络就连不上。

数据持久化靠三个命名卷：`mysite_pgdata` 存数据库数据，`mysite_redisdata` 存缓存的持久化文件，`mysite_certs` 存证书，`mysite_acme` 存证书验证用的临时文件。容器删了重建，只要卷还在，数据与证书就还在。

## 7. 架构说明

### 7.1 容器分工表

| 容器 | 镜像 | 负责什么 | 不负责什么 |
|---|---|---|---|
| web | Nginx | 对外入口：80 跳转、443 证书、反向代理、静态缓存头 | 不跑业务逻辑，不连数据库 |
| app | 自建（Dockerfile） | 业务应用：处理请求、返回页面与接口、健康检查端点 | 不直接对外暴露端口，不存数据 |
| db | PostgreSQL | 存业务数据 | 不对外暴露端口，不处理 HTTP 请求 |
| cache | Redis | 缓存与会话类数据的存放 | 不对外暴露端口，不做持久化以外的事 |

### 7.2 网络与端口表

| 项目 | web | app | db | cache |
|---|---|---|---|---|
| 发布到主机的端口 | 80、443 | 无 | 无 | 无 |
| 在 frontend 网络 | 是 | 是 | 否 | 否 |
| 在 backend 网络（内部） | 否 | 是 | 是 | 是 |
| 数据卷 | 证书、验证文件 | 无 | 数据库数据 | 缓存持久化文件 |

数据库与缓存不映射到主机端口，这一点是本平台的安全底线，见第 17 节。应用容器也不发布端口，外网想访问应用只能走 Nginx。

### 7.3 目录结构

平台放在服务器的 `/opt/mysite/` 目录下，结构如下：

```text
/opt/mysite/
├── docker-compose.yml
├── .env
├── app/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── nginx/
│   └── default.conf
└── scripts/
    └── backup.sh
```

### 7.4 资源说明

四个容器在一台 2 核 4GB 的服务器上跑个人站或小企业站是够用的，瓶颈通常先出现在数据库内存与应用并发上，不在 Nginx。不要在同一台小服务器上再塞一套监控、大数据量分析这类重服务；访问量上来后先按 DEPLOY-02 的办法把应用扩副本，再考虑把数据库迁到独立服务器，而不是一开始就把架构搞复杂。

## 8. 操作前检查

动手前逐项核对，缺一项就先补齐，不要带着缺项往下走：

1. `docker --version` 能输出版本号，`docker compose version` 能输出 Compose v2 的版本号。
2. `ss -tlnp` 里 80 与 443 端口没有被别的程序占用。
3. 域名的 A 记录已经指向服务器 IP，或者你已经准备好在第 9.2 节去改（证书申请前必须生效）。
4. 服务器剩余磁盘空间大于 10GB（镜像、数据库、备份都要占地方）。
5. `/opt/mysite/.env` 建好后权限是 600，且没有提交到任何代码仓库（见第 17 节）。
6. 你知道怎么在验证失败时停掉平台：`docker compose -f /opt/mysite/docker-compose.yml down`，停掉不删卷，数据还在。

## 9. 逐步操作

### 9.1 服务器准备

以 Ubuntu 24.04 为例，先更新系统并安装 Docker（安装命令以 Docker 官网当场公布的方法为准，下面是常规 apt 路线，跑不通就以官网为准）：

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

### 9.2 域名解析

在域名注册商或 DNS 服务商处加一条 A 记录：主机记录填 `@`（代表 example.com 本身），记录值填服务器 IP，TTL 先填 600（上线稳定后再改大）。等解析生效后再往下走，验证办法：

```bash
dig +short example.com A
```

输出服务器 IP 才算生效；输出为空或还是旧 IP，就再等一会儿，不要跳过这一步去申请证书（证书验证会失败）。

### 9.3 建目录与环境变量文件

```bash
sudo mkdir -p /opt/mysite/app /opt/mysite/nginx /opt/mysite/scripts
sudo chown -R "$USER:$USER" /opt/mysite
```

在 `/opt/mysite/.env` 里写下面这些键，值全部换成自己的真实值（占位符不要直接上线）：

```ini
POSTGRES_USER=mysite
POSTGRES_DB=mysite
POSTGRES_PASSWORD=请填真实口令
REDIS_PASSWORD=请填真实口令
APP_PORT=3000
```

然后把权限收紧：

```bash
chmod 600 /opt/mysite/.env
```

### 9.4 写应用代码

应用只是一个最小的 Node.js 应用，作用是让平台有东西可跑、有健康检查可查。把第 10 节的 `package.json` 与 `server.js` 存到 `/opt/mysite/app/`。真实项目到这一步时，把你自己的应用代码放进 `app/`，并按第 9.6 节改动 Dockerfile 与健康检查。

### 9.5 写 Compose、Dockerfile、Nginx 配置

把第 10 节的 `docker-compose.yml` 存到 `/opt/mysite/docker-compose.yml`，`Dockerfile` 存到 `/opt/mysite/app/Dockerfile`，Nginx 配置存到 `/opt/mysite/nginx/default.conf`。注意三处不要写错：

- 数据库与缓存服务不要写 `ports` 项，写了就等于把数据库与缓存暴露到外网，必须删掉。
- `backend` 网络要写 `internal: true`，否则内部网络的隔离就不成立。
- 卷名用了显式 `name`（`mysite_pgdata` 等），这样第 9.8 节的证书续期命令与第 10 节的备份脚本引用的卷名才不会随项目目录名变化。

### 9.6 换成自己的应用时要改的地方

- `app/Dockerfile`：基础镜像、安装命令、启动命令按你的语言与框架改；`USER node` 换成你镜像里的非 root 用户，没有非 root 用户就先加一个，不要用 root 跑应用。
- `app/server.js` 或你的应用入口：健康检查路径要与 Compose 里 `healthcheck` 的 `test` 一致，本文是 `/health`。
- `docker-compose.yml` 里 `app` 服务的 `build` 目录与 `command`（如果你的应用不是 `node server.js`）。
- Nginx 的 `proxy_pass` 目标端口要与应用实际监听端口一致，本文是 `app:3000`。

### 9.7 拉起平台并申请证书

先拉起平台（不含证书时 Nginx 的 443 配置会因找不到证书文件而起不来，所以第一次先用下面的办法分两步走）：

```bash
cd /opt/mysite
docker compose up -d --build
docker compose ps
```

第一次申请证书时，Nginx 的 443 配置引用的证书文件还不存在。处理办法是：先把 `nginx/default.conf` 里 443 那一段临时注释掉，只留 80 那一段，执行 `docker compose exec web nginx -s reload`，再用 Certbot 容器申请证书：

```bash
docker run --rm \
  -v mysite_certs:/etc/letsencrypt \
  -v mysite_acme:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d example.com \
  --email admin@example.com --agree-tos --no-eff-email
```

证书申请成功后，把 443 那一段恢复，再执行一次 `docker compose exec web nginx -s reload`。以后证书续期不用重复这个流程，见第 11 节的定时任务。

### 9.8 证书自动续期

续期命令与 Nginx 重载写进定时任务（见第 11 节），每月跑两次即可。续期成功后必须重载 Nginx，否则 Nginx 内存里还是旧证书，浏览器看到的还是旧证书。

### 9.9 备份与更新

备份按第 10 节的 `scripts/backup.sh` 每天凌晨跑一次；更新应用时按第 18 节的办法换镜像标签、拉起、验证、失败回滚，不要直接改运行中的容器（容器是随时可丢弃的，改了也不持久）。

## 10. 完整代码

### 10.1 docker-compose.yml（存放路径：/opt/mysite/docker-compose.yml）

```yaml
services:
  web:
    image: nginx:alpine
    container_name: mysite-web
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx:/etc/nginx/conf.d:ro
      - mysite_certs:/etc/letsencrypt:ro
      - mysite_acme:/var/www/certbot
    depends_on:
      app:
        condition: service_healthy
    networks:
      - frontend

  app:
    build: ./app
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD}@cache:6379/0
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - frontend
      - backend

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - mysite_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - backend

  cache:
    image: redis:7-alpine
    restart: unless-stopped
    env_file:
      - .env
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - mysite_redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - backend

volumes:
  mysite_pgdata:
    name: mysite_pgdata
  mysite_redisdata:
    name: mysite_redisdata
  mysite_certs:
    name: mysite_certs
  mysite_acme:
    name: mysite_acme

networks:
  frontend:
  backend:
    internal: true
```

### 10.2 Dockerfile（存放路径：/opt/mysite/app/Dockerfile）

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

### 10.3 package.json（存放路径：/opt/mysite/app/package.json）

```json
{
  "name": "mysite-app",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### 10.4 server.js（存放路径：/opt/mysite/app/server.js）

```js
const http = require("http");

const port = Number(process.env.APP_PORT || 3000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", message: "mysite is running" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log("mysite app listening on port " + port);
});
```

### 10.5 Nginx 入口配置（存放路径：/opt/mysite/nginx/default.conf）

```nginx
server {
    listen 80;
    server_name example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 10.6 备份脚本（存放路径：/opt/mysite/scripts/backup.sh）

```bash
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .env
set +a
DATE="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/opt/mysite-backups"
mkdir -p "$BACKUP_DIR"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"
tar --exclude=.env --exclude=app/node_modules -czf "$BACKUP_DIR/files-$DATE.tar.gz" docker-compose.yml nginx app
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +14 -delete
find "$BACKUP_DIR" -name "files-*.tar.gz" -mtime +14 -delete
echo "backup done: $DATE"
```

备份脚本的说明：数据库用 `pg_dump` 导出并压缩；配置文件与应用代码打成一个包，但 `.env` 与 `node_modules` 被排除在外，`.env` 要另外用安全的方式单独保存（见第 17 节），不要把它放进这个普通的备份包里。保留期 14 天，超过的旧备份自动删除。

## 11. 完整配置文件

| 文件 | 存放路径 | 说明 |
|---|---|---|
| docker-compose.yml | /opt/mysite/docker-compose.yml | 四个服务的完整编排，见第 10.1 节 |
| .env | /opt/mysite/.env | 环境变量与口令，权限 600，绝不进仓库 |
| Dockerfile | /opt/mysite/app/Dockerfile | 应用镜像构建文件，见第 10.2 节 |
| package.json | /opt/mysite/app/package.json | 应用依赖与启动脚本，见第 10.3 节 |
| server.js | /opt/mysite/app/server.js | 最小应用，见第 10.4 节 |
| default.conf | /opt/mysite/nginx/default.conf | Nginx 入口配置，见第 10.5 节 |
| backup.sh | /opt/mysite/scripts/backup.sh | 备份脚本，见第 10.6 节，权限 755 |
| 定时任务 | /etc/cron.d/mysite | 备份与证书续期，内容如下 |

定时任务文件 `/etc/cron.d/mysite` 的完整内容：

```text
0 2 * * * root /opt/mysite/scripts/backup.sh
0 3 1,15 * * root docker run --rm -v mysite_certs:/etc/letsencrypt -v mysite_acme:/var/www/certbot certbot/certbot renew --quiet && docker compose -f /opt/mysite/docker-compose.yml exec web nginx -s reload
```

## 12. 每个关键配置项的解释

### 12.1 docker-compose.yml 关键项

| 配置项 | 含义 | 写错的后果 |
|---|---|---|
| web.ports 的 80:80 与 443:443 | 只有 Web 容器发布端口到主机 | 多写一个数据库端口就等于把数据库暴露到外网 |
| db/cache 没有 ports 项 | 数据库与缓存不对外发布端口 | 写了 ports 项，外网可以直接连数据库 |
| backend.internal: true | 后端网络是内部网络，不通外网 | 不写这一项，隔离就只剩“没发布端口”一层 |
| depends_on 的 service_healthy | 等依赖服务健康检查通过再启动 | 只写服务名不写健康条件，应用可能在数据库还没准备好时就启动失败 |
| healthcheck 的 start_period | 给服务留出启动时间，期间失败不算 | 不留启动时间，刚启动的服务会被误判为不健康而反复重启 |
| restart: unless-stopped | 容器崩了自动重启，手动停掉的不自动起来 | 不写这一项，服务器重启或容器崩了之后网站不会自己恢复 |
| 卷的 name 显式命名 | 卷名固定，不随项目目录名变化 | 不写 name，备份脚本与续期命令引用的卷名会随目录名变化而对不上 |

### 12.2 Nginx 关键项

| 配置项 | 含义 | 写错的后果 |
|---|---|---|
| location /.well-known/acme-challenge/ | 证书验证路径放行，不跳转 HTTPS | 写错路径或也跳转了，证书申请与续期都会失败 |
| return 301 https://$host$request_uri | 80 一律跳转 HTTPS，保留原路径 | 不跳转，网站就同时存在 HTTP 与 HTTPS 两个入口 |
| ssl_protocols TLSv1.2 TLSv1.3 | 只开 TLS 1.2 与 1.3 | 开了 TLS 1.0/1.1，老旧不安全协议也能连上来 |
| proxy_set_header X-Forwarded-Proto $scheme | 把原始协议告诉应用 | 不写这一项，应用以为所有请求都是 HTTP，登录跳转可能跳回 HTTP |
| proxy_pass http://app:3000 | 代理到 Compose 内部服务名 app 的 3000 端口 | 写成 127.0.0.1:3000，Nginx 容器里没有这个应用，连不上 |

### 12.3 Dockerfile 关键项

| 指令 | 含义 | 写错的后果 |
|---|---|---|
| FROM node:22-alpine | 基础镜像 | 用了带完整工具链的大镜像，镜像体积大、攻击面也大 |
| COPY package*.json 与 npm ci --omit=dev | 先装依赖再拷代码，利用镜像层缓存 | 顺序反过来，每次改一行代码都要重新装一遍依赖 |
| USER node | 用非 root 用户跑应用 | 用 root 跑，应用一旦出问题，影响范围就是容器里的 root 权限 |
| EXPOSE 3000 | 声明应用监听 3000 端口（声明而已，不发布到主机） | 以为 EXPOSE 就等于发布端口，实际上还要靠 Compose 的 ports 项，应用容器不写 ports 项就是对的 |

## 13. 执行结果示例

下面全部是“读者在自己服务器上应看到的样子（示例输出），不是本机实测输出”，原因见第 5 节验证部分的如实说明。实际容器名、时间、内存数字以读者本机为准。

### 13.1 拉起平台

```bash
docker compose ps
```

应看到的样子（示例输出）：

```text
NAME         IMAGE              STATUS
mysite-web   nginx:alpine       Up (healthy)
mysite-app   mysite-app         Up (healthy)
mysite-db    postgres:16-alpine Up (healthy)
mysite-cache redis:7-alpine     Up (healthy)
```

### 13.2 访问验证

```bash
curl -I https://example.com
curl https://example.com/health
```

应看到的样子（示例输出）：HTTP 请求返回 301 跳转到 HTTPS，HTTPS 请求返回 200；`/health` 返回 `{"status":"ok"}`。

### 13.3 备份验证

```bash
ls -lh /opt/mysite-backups/
```

应看到的样子（示例输出）：当天日期的 `db-YYYYMMDD-HHMMSS.sql.gz` 与 `files-YYYYMMDD-HHMMSS.tar.gz` 各一个，文件大小大于 0。

## 14. 成功验证

按顺序逐项核对，全部通过才算上线成功，缺一项就回到对应章节处理：

1. `docker compose ps` 四个容器都是 `Up`，且健康检查状态是 `healthy`，不是 `starting` 或 `unhealthy`。
2. `curl -I http://example.com` 返回 301 跳转到 HTTPS，`curl -I https://example.com` 返回 200。
3. 浏览器打开 `https://example.com`，地址栏有锁形标志，点开证书能看到域名是自己的域名、颁发者是 Let's Encrypt、有效期在有效期内。
4. `curl https://example.com/health` 返回 `{"status":"ok"}`。
5. 从外网（比如手机流量）访问一次，确认不是只有服务器本机能打开。
6. `docker compose exec db pg_isready -U mysite` 返回接受连接，且从外网直接连服务器的 5432 与 6379 端口连不上（数据库与缓存没有暴露）。
7. 手动跑一次 `/opt/mysite/scripts/backup.sh`，备份目录里出现当天的两个备份文件，且 `gzip -t` 校验数据库备份文件通过。
8. 证书续期命令手动跑一次 `docker run --rm` 的续期命令（不加 `--quiet` 看输出），确认没有报错，再执行 `docker compose exec web nginx -s reload`。

## 15. 常见错误

| 现象 | 原因 | 处理办法 |
|---|---|---|
| web 容器起不来，日志说找不到证书文件 | 第一次拉起时证书还没申请，443 配置引用的文件不存在 | 按第 9.7 节先注释 443 段、申请证书、再恢复 |
| app 容器反复重启，健康检查失败 | 应用监听端口与健康检查地址不一致，或应用启动报错 | 先看 `docker compose logs app`，确认监听端口是 3000 且 `/health` 能返回 200 |
| db 容器起不来，日志说口令不对 | `.env` 改了口令，但旧卷里已有用旧口令建好的数据库 | 不要只改 `.env` 就重启；要么把口令改回去，要么删卷重建（删卷会丢数据，先备份） |
| 证书申请失败，提示验证不通过 | 域名解析还没生效，或 80 端口的验证路径被跳转挡住 | 先跑 `dig +short example.com A` 确认解析，再确认 80 配置里验证路径没有被跳转 |
| 从外网能直接连上数据库端口 | Compose 里给 db 或 cache 写了 ports 项 | 删掉 ports 项，重新 `docker compose up -d`，再从外网验证连不上 |
| 备份脚本跑完没有文件 | 脚本没有执行权限，或备份目录没有写权限 | `chmod 755 /opt/mysite/scripts/backup.sh`，确认 `/opt/mysite-backups` 存在且可写 |
| 更新后网站打不开 | 新镜像有问题，或健康检查没通过 | 按第 18 节指回旧镜像标签，不要在原地反复改运行中的容器 |

## 16. 故障排查

按从外到内的顺序查，不要一上来就重建所有容器：

1. 先看入口：`docker compose ps` 确认四个容器状态，`docker compose logs web` 看 Nginx 有没有报错。
2. 再看应用：`docker compose logs app` 看应用日志，`docker compose exec app node -e "fetch('http://127.0.0.1:3000/health').then(r => console.log(r.status))"` 在容器内直接查健康端点。
3. 再看数据库：`docker compose exec db pg_isready -U mysite`，不通就看 `docker compose logs db`，重点看口令与数据卷权限。
4. 再看缓存：`docker compose exec cache redis-cli -a "$REDIS_PASSWORD" ping`，注意这条命令要在服务器 shell 里先 `source /opt/mysite/.env` 才能读到口令变量，或者直接把口令换成真实值在本地敲（不要把真实口令写进文章或工单）。
5. 网络问题：`docker compose exec web getent hosts app`，确认 Nginx 容器能解析到应用容器的内部地址；解析不到通常是网络配错了，对照第 12.1 节的网络表检查。
6. 磁盘问题：`df -h` 与 `docker system df`，磁盘满了会导致数据库写不进、备份失败，先清旧备份与无用镜像，不要直接删数据卷。

## 17. 安全注意事项

- `.env` 权限 600，属主是运行平台的用户，绝不提交到代码仓库，绝不贴进聊天记录或工单；口令与密钥一律用占位符或环境变量引用，本文示例里的“请填真实口令”上线前必须换成真实的强口令。
- 数据库与缓存不映射到主机端口，这是底线；只放行服务器防火墙的 80、443 与 SSH 端口，不要放行 5432、6379、3000。
- 应用容器用非 root 用户运行（Dockerfile 里的 `USER node`），不要改回 root。
- TLS 只开 1.2 与 1.3，证书到期前要续期，续期定时任务要定期确认还在跑（定时任务文件被误删是最常见的证书过期原因）。
- 镜像标签不要长期只用 `latest`，见第 18 节；依赖要定期更新，漏洞通告处理流程见 OPS-02。
- 备份包里不含 `.env`，`.env` 要另外用安全的方式单独保存（比如密码管理器），丢了 `.env` 就等于丢了数据库口令，恢复时会卡住。

## 18. 回滚和恢复

### 18.1 更新流程

1. 给新版本打一个带版本号的镜像标签（比如 `mysite-app:1.1.0`），不要只用 `latest`，否则回滚时不知道旧版本到底是哪个。
2. 改 `docker-compose.yml` 里 `app` 服务的镜像标签（用 `image` 指定标签时）或重新 `build`，执行 `docker compose up -d --build`。
3. 等健康检查变 `healthy`，再跑第 14 节的 1 到 4 项验证。
4. 验证失败就指回旧标签，重新 `up -d`，再验证一次，不要在新版本上继续改。

### 18.2 恢复流程

- 应用出问题：指回旧镜像标签，见 18.1 节。
- 数据库出问题：用备份包里的 `db-*.sql.gz` 恢复，步骤是先停应用容器、再导入、再起应用容器，导入前先确认备份文件的 `gzip -t` 校验通过。
- 整机出问题：按 OPS-04 的整站恢复计划走，本平台的恢复清单就是第 11 节的全部文件加上 `/opt/mysite-backups/` 里最新的备份包，再加上另外单独保存的 `.env`。
- 破坏性数据库迁移（删字段、改类型）不能只靠回滚镜像解决，迁移前必须先备份，红线见 DEPLOY-02 与 DB-02。

## 19. 延伸阅读

- Docker 与 Compose 的概念、蓝绿与滚动部署的原理：DEPLOY-02 的完整讲解，本篇不再重复。
- Nginx、Apache、Caddy 的配置模板对照与多站点写法：SRV-01。
- 数据库备份、恢复、迁移、慢查询、主从复制的完整做法：DB-02。
- 官方文档（安装时以官网当场公布的内容为准）：Docker 官方文档的安装与 Compose 章节、Nginx 官方文档的反向代理与 TLS 章节、PostgreSQL 官方文档的备份章节、Certbot 官方文档的 Webroot 模式章节。

## 20. 相关章节链接

- Docker 多容器编排与回滚：[DEPLOY-02 Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚](../deploy/02-docker.md)。
- Web 服务器配置与多站点：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)。
- 数据库运维：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](../database/02-ops.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 下一篇：[PROJ-07 论坛、电商、CMS、后台管理、SaaS](07-systems.md)
