# PROJ-08：旗舰：一台服务器托管多网站完整教程

> 任务编号：PROJ-08（网站建设与部署实战指南 · 完整实战第 8 篇）
> 上一篇：[PROJ-07 论坛、电商、CMS、后台管理、SaaS](07-systems.md)；下一篇：[TOOL-01 建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器](../tools/01-config-generators.md)。
> 本篇是整个建站指南的旗舰实战：把前面各章讲过的东西组装到一台服务器上，不从头再讲基础概念。Nginx 分流看 SRV-01，Docker 编排看 DEPLOY-02，数据库备份看 DB-02，整站恢复计划看 OPS-04，架构分层看 ARCH-01。本篇只讲“多网站共处一台服务器”这个场景特有的问题：子域名规划、共用与隔离的取舍、一个站点出问题不要拖垮其他站点、上线与回滚的顺序。

## 1. 本章目标

读完并动手做完本篇，你能：

- 在一台 Ubuntu 服务器上，用 Docker Compose 同时跑起 WordPress、Django、Node.js、PHP、Go API 五个应用，外加 MySQL、PostgreSQL、Redis。
- 给每个应用分配一个子域名，用一个 Nginx 入口统一分流、统一 HTTPS、统一日志。
- 说清哪些东西可以共用（Nginx 入口、Redis 实例、备份计划），哪些东西必须隔离（数据库用户、数据卷、资源上限、应用代码）。
- 按顺序完成一次多站点上线，并在某个站点出问题时只回滚它一个，不动其他站点。

## 2. 适用人群

- 已经按顺序读完架构篇、服务器篇、部署篇、数据库篇、运营篇的读者，至少亲手部署过其中一种应用。
- 有一台自己的 Ubuntu 服务器（云服务器或家用旧电脑均可），并且这台服务器上还没有跑着不能停的生产站点——本篇的第一次编排建议先在测试机上跑通。
- 不适合只想“快速上线一个博客”的读者：单个 WordPress 站直接看 PROJ-02，不要用本篇的多站点编排给自己加复杂度。

## 3. 适用系统和版本

- 服务器：Ubuntu 24.04 LTS，64 位，普通用户账号加 sudo，不要用 root 直接跑容器编排。
- 容器：Docker Engine 与 Docker Compose v2（`docker compose` 命令，带空格的 v2 写法），安装方法看 DEPLOY-02，安装时以 Docker 官网当场公布的版本为准。
- 应用版本线（核查日期 2026-11-03，补丁号一律以官网当场公布的版本为准，不要照抄下面括号里的旧补丁号）：
  - WordPress 7.1 线，PHP 8.3 线，MySQL 8.4 线。
  - Django 6.x 线，Python 3.12，PostgreSQL 16 线。
  - Node.js 22 LTS 线，Go 1.27 线，Redis 7 线。
  - Nginx 1.30 稳定线（SRV-01 核查）。
- 硬件底线：本篇的编排一共 9 个服务，内存至少 4GB 才够五个应用加两个数据库同时跑；2GB 机器请先减掉两个应用再上，内存不足的表现是容器被系统杀掉，不是应用报错。

## 4. 使用前提

- 域名已经在自己名下，并且能自己改 DNS 解析（方法看 NET-02）。
- 服务器已经装好 Docker 与 Docker Compose，能跑通 `docker compose version` 和 `docker run hello-world`。
- 已经读过 SRV-01 的多站点模板、DEPLOY-02 的 Compose 编排、DB-02 的备份、OPS-04 的整站恢复计划；本篇不再重复讲这些内容，只在用到时指回原文。
- 五个应用的代码已经准备好：WordPress 用官方镜像不用自己写代码；Django、Node.js、Go API 需要你自己的最小可用代码（本篇 §10.4 给出三个最小 Dockerfile 的写法，应用代码本身是你自己的项目，不是本篇的附带品）。

## 5. 所需资源

- 一台 Ubuntu 24.04 LTS 服务器，4GB 以上内存，40GB 以上磁盘。
- 一个域名，例如 `example.com`，以及它的 DNS 解析权限（要加 5 条子域名记录）。
- 一个证书方案：生产环境用 Let's Encrypt 自动签发（方法看 DEPLOY-03 与 09-web-hosting/05），本篇的 Nginx 配置里证书路径留空位，第一次跑通先用 HTTP 验证分流，再上 HTTPS。
- 一份 `.env` 文件（只放本机，不进仓库），里面是各数据库的口令与密钥，权限 600。

## 6. 技术原理

一台服务器托管多网站，核心只有三句话：

- **入口唯一**：只让 Nginx 一个服务对外占 80 与 443 端口，访客永远先到 Nginx，再由 Nginx 按域名分流到不同的应用容器。应用容器自己不对外占端口，访客直连不到它们。
- **网络分层**：两个 Docker 网络。`frontend` 网络连 Nginx 与五个应用，Nginx 靠服务名找到应用；`backend` 网络连应用与数据库、缓存，数据库与缓存只在这个网络里，Nginx 进不来，访客更进不来。
- **故障隔离**：隔离靠四样东西，不是靠“希望它不出问题”：每个应用独立的数据卷、每个应用独立的数据库用户、每个服务的内存与 CPU 上限、每个服务独立的镜像标签（回滚时只换它一个的标签）。

下面这张表是本篇的全部设计依据，后面每一节都是在落实它：

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 域名与 DNS | 把 5 个子域名指到同一台服务器 | 不决定流量进哪个容器，那是 Nginx 的事 |
| Nginx 入口 | 按域名分流、HTTPS、静态缓存、安全头 | 不跑业务逻辑，不直连数据库 |
| 应用层 | 各自跑自己的业务 | 不共享代码目录，不共享进程 |
| 数据层 | MySQL 给 WordPress，PostgreSQL 给 Django 与 Go API（分库分用户），Redis 给缓存 | 不对外暴露端口，不共用同一个数据库用户 |
| 运维层 | 统一日志、统一健康检查、统一备份、统一防火墙 | 不代替各应用自己的更新与测试 |

## 7. 架构说明

### 7.1 子域名规划

规划原则只有两条：一个应用一个子域名，子域名本身就是文档——看到子域名就知道它是什么应用。不要用路径分流（例如 `example.com/wordpress`、`example.com/django`）做多应用托管：路径分流会让 Cookie、静态路径、相对链接三处同时出问题，排错成本远高于多一条 DNS 记录。

| 子域名 | 应用 | 技术栈 | 对内地址（Nginx 上游） | 数据 |
| --- | --- | --- | --- | --- |
| `www.example.com` | 企业官网与博客 | WordPress + PHP 8.3 | `wordpress:80` | MySQL（`wp-mysql`） |
| `app.example.com` | 业务系统与管理后台 | Django + Python 3.12 | `django:8000` | PostgreSQL（`pg`，库 `django_db`） |
| `node.example.com` | 互动站与实时接口 | Node.js 22 LTS | `node:3000` | Redis（库索引 1） |
| `php.example.com` | 传统 PHP 站 | PHP 8.3 + Apache | `php:80` | PostgreSQL（`pg`，库 `php_db`） |
| `api.example.com` | 对外 API | Go API | `goapi:8080` | PostgreSQL（`pg`，库 `goapi_db`）与 Redis（库索引 2） |
| `example.com`（裸域名） | 不跑应用，只做 301 跳转到 `www.example.com` | Nginx | 无上游 | 无 |

### 7.2 共用与隔离的取舍

这是本篇最容易做错的地方，取舍表先定下来，写配置时照表执行：

| 东西 | 共用还是隔离 | 理由 |
| --- | --- | --- |
| Nginx 入口 | 共用一个 | 入口唯一，分流、HTTPS、日志都在一处改 |
| MySQL 实例 | 只给 WordPress 用 | WordPress 必须用 MySQL，不与别的库混在一个实例里抢资源 |
| PostgreSQL 实例 | 共用实例，分库分用户 | Django、PHP、Go API 各自独立的库与用户，一个库出问题不影响另外两个库的数据，但实例挂了三个应用一起受影响——这是省资源的代价，第 18 节有对应的恢复顺序 |
| Redis 实例 | 共用实例，分库索引 | Node.js 用库索引 1，Go API 用库索引 2，键名前缀再加应用名，双重隔离；缓存丢了可以重建，不当成主数据 |
| 数据卷 | 严格隔离 | 一个应用一个命名卷，删一个应用的卷不会碰到别的 |
| 资源上限 | 每个服务单独设 | 防止某个应用内存泄漏拖垮整台机器 |
| 镜像标签 | 每个服务单独钉版本 | 回滚时只换出问题的那一个 |
| 备份计划 | 共用一份计划，分开验证 | 一份脚本备份全部，但恢复演练要按应用逐个验，不能只验其中一个就当全部通过 |

### 7.3 请求是怎么走的

以访客打开 `app.example.com` 为例，完整链路是：

1. 浏览器查 DNS，`app.example.com` 解析到服务器公网 IP。
2. Nginx（80 端口）收到请求，先看是不是 `/.well-known/acme-challenge/`（证书续期放行），不是就 301 跳到 HTTPS。
3. Nginx（443 端口）按 `server_name` 匹配到 `app.example.com` 的 server 块，把请求反向代理到 `django:8000`。
4. Django 处理请求，需要数据时连 `pg:5432` 上的 `django_db`，需要缓存时连 `redis:6379` 的库索引 1。
5. 响应原路返回，Nginx 写一条访问日志，Django 的日志留在自己的容器日志里。

WordPress 的链路多一步：Nginx 把请求代理到 `wordpress:80`，WordPress 容器里的 Apache + PHP 处理，再连 `wp-mysql:3306`。Go API 的链路最短：Nginx 代理到 `goapi:8080`，Go 程序直接返回 JSON，慢查询与连接池的问题比 PHP/Python 少一层。

## 8. 操作前检查

动手前逐项打勾，缺一项就先补，不要边做边补：

- [ ] `docker compose version` 能输出版本号，`docker run --rm hello-world` 能跑通。
- [ ] 域名 DNS 已经加好 5 条 A 记录（或 1 条 A 记录加 4 条 CNAME 指到主域名），并且 `dig` 或在线 DNS 工具能查到。
- [ ] 服务器剩余内存 4GB 以上，磁盘 40GB 以上，`df -h` 与 `free -h` 已看过。
- [ ] 80 与 443 端口没有被别的程序占着，`ss -tlnp` 已看过。
- [ ] `.env` 文件已建好、权限 600、没有进 Git 仓库（检查方法：`git status` 里看不到它）。
- [ ] 已经想好每个应用的回滚标签：第一次上线先用 `latest` 以外的固定标签，例如 WordPress 用镜像的固定版本号标签，自己的应用用 Git 提交号做标签。

## 9. 逐步操作

操作顺序不能乱，乱了排错时分不清是哪一步的问题：

1. **建目录与 `.env`**：在服务器上建 `/opt/multi-site`，里面放 `docker-compose.yml`、`nginx/conf.d/multi-site.conf`、`.env`、三个应用的 `Dockerfile` 与代码目录。
2. **先起数据层**：只起 `wp-mysql`、`pg`、`redis` 三个服务，等健康检查通过再往下做。数据层没起来就起应用，应用日志里全是连接失败，浪费排错时间。
3. **再起应用层**：逐个起 WordPress、Django、Node.js、PHP、Go API，每起一个就用 `docker compose logs` 看它自己的日志，确认它在监听对内端口。
4. **再起 Nginx 入口**：先用 HTTP 跑通分流（5 个子域名各 curl 一次，都返回自己的应用），再上 HTTPS。
5. **接日志与监控**：确认 Nginx 访问日志、五个应用的容器日志、健康检查脚本的位置（§10.5），再做第一次备份。
6. **做第一次备份与恢复演练**：备份脚本跑一遍，恢复演练按 OPS-04 的记录表记一遍，没演练过的备份等于没有备份。
7. **开防火墙**：最后再开 UFW，只放 22、80、443，并且处理 Docker 与 UFW 的关系（§12.6），不要一开始就把自己锁在外面。

## 10. 完整代码

本节的四份内容各自完整，复制下来改掉占位值就能用。路径约定：编排根目录是 `/opt/multi-site`，Nginx 配置在容器内的路径是 `/etc/nginx/conf.d/multi-site.conf`，宿主机上的对应路径是 `/opt/multi-site/nginx/conf.d/multi-site.conf`。

### 10.1 子域名规划表（完整版，含 DNS 与验证方法）

| 子域名 | DNS 记录 | 指向 | 验证命令（在自己电脑上跑） | 期望结果 |
| --- | --- | --- | --- | --- |
| `www.example.com` | A | 服务器公网 IP | `curl -I https://www.example.com/` | 200，`server` 头不暴露版本号 |
| `app.example.com` | A | 服务器公网 IP | `curl -I https://app.example.com/` | 200 或登录页 302 |
| `node.example.com` | A | 服务器公网 IP | `curl -I https://node.example.com/` | 200 |
| `php.example.com` | A | 服务器公网 IP | `curl -I https://php.example.com/` | 200 |
| `api.example.com` | A | 服务器公网 IP | `curl https://api.example.com/health` | 200，返回健康状态的 JSON |
| `example.com` | A | 服务器公网 IP | `curl -I https://example.com/` | 301 到 `https://www.example.com/` |

DNS 生效要等 TTL 时间，不要刚改完记录就断定配置错了；先用 `dig` 查解析，再用 `curl` 查应用，分开定位问题。

### 10.2 Nginx 分流完整配置

文件存放路径：宿主机 `/opt/multi-site/nginx/conf.d/multi-site.conf`，容器内 `/etc/nginx/conf.d/multi-site.conf`。证书路径用的是 Let's Encrypt 的默认位置，第一次跑通先把 443 的 server 块注释掉、只留 80 的分流验证，证书下来后再取消注释——不要在没有证书的情况下直接上 443 配置，Nginx 会起不来。

```nginx
upstream wordpress_upstream {
    server wordpress:80;
}

upstream django_upstream {
    server django:8000;
}

upstream node_upstream {
    server node:3000;
}

upstream php_upstream {
    server php:80;
}

upstream goapi_upstream {
    server goapi:8080;
}

server {
    listen 80;
    server_name example.com www.example.com app.example.com node.example.com php.example.com api.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://www.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name www.example.com;

    ssl_certificate /etc/letsencrypt/live/www.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 32m;

    location / {
        proxy_pass http://wordpress_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 32m;

    location / {
        proxy_pass http://django_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /var/www/django-static/;
        expires 7d;
    }
}

server {
    listen 443 ssl;
    server_name node.example.com;

    ssl_certificate /etc/letsencrypt/live/node.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/node.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://node_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 443 ssl;
    server_name php.example.com;

    ssl_certificate /etc/letsencrypt/live/php.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/php.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 32m;

    location / {
        proxy_pass http://php_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass http://goapi_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

注意上面配置里的三处细节：第一，80 端口的第一个 server 块同时负责所有子域名的 HTTPS 跳转与证书续期放行，裸域名再单独一个 server 块做 301，不要把裸域名跳转写进 443 的 server 块里；第二，Node.js 的 location 里有 `proxy_http_version 1.1` 与 Upgrade 两行，这是 WebSocket 用的，没有实时功能也可以留着，不影响普通请求；第三，`client_max_body_size` 是按应用分的，API 只给 10m，WordPress 与 Django 给 32m，不要全站统一设一个很大的值。

### 10.3 Docker Compose 完整编排

文件存放路径：`/opt/multi-site/docker-compose.yml`。同目录下必须有 `.env` 文件（§11.1），否则 `docker compose up` 会因为变量没值而起不来。镜像标签的写法：WordPress、MySQL、PostgreSQL、Redis、Nginx 一律用固定版本号标签，不要用 `latest`；自己的三个应用（Django、Node.js、Go API）用 `build` 从本地代码构建，标签就是构建出来的本地镜像名。

```yaml
services:
  nginx:
    image: nginx:1.30
    container_name: multisite-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/certs:/etc/letsencrypt:ro
      - ./nginx/www:/var/www/certbot:ro
      - nginx-logs:/var/log/nginx
    networks:
      - frontend
    depends_on:
      - wordpress
      - django
      - node
      - php
      - goapi
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

  wordpress:
    image: wordpress:7.1-php8.3-apache
    container_name: multisite-wordpress
    environment:
      WORDPRESS_DB_HOST: wp-mysql:3306
      WORDPRESS_DB_NAME: ${WP_DB_NAME}
      WORDPRESS_DB_USER: ${WP_DB_USER}
      WORDPRESS_DB_PASSWORD: ${WP_DB_PASSWORD}
    volumes:
      - wp-data:/var/www/html
    networks:
      - frontend
      - backend
    depends_on:
      wp-mysql:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1024M

  wp-mysql:
    image: mysql:8.4
    container_name: multisite-wp-mysql
    environment:
      MYSQL_DATABASE: ${WP_DB_NAME}
      MYSQL_USER: ${WP_DB_USER}
      MYSQL_PASSWORD: ${WP_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${WP_ROOT_PASSWORD}
    volumes:
      - wp-mysql-data:/var/lib/mysql
    networks:
      - backend
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1024M

  django:
    build: ./apps/django
    container_name: multisite-django
    command: gunicorn mysite.wsgi:application --bind 0.0.0.0:8000 --workers 2
    environment:
      DATABASE_URL: postgres://${PG_DJANGO_USER}:${PG_DJANGO_PASSWORD}@pg:5432/django_db
      REDIS_URL: redis://redis:6379/1
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
    volumes:
      - django-media:/app/media
    networks:
      - frontend
      - backend
    depends_on:
      pg:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1024M

  pg:
    image: postgres:16
    container_name: multisite-pg
    environment:
      POSTGRES_USER: ${PG_ADMIN_USER}
      POSTGRES_PASSWORD: ${PG_ADMIN_PASSWORD}
      POSTGRES_DB: postgres
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d:ro
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_ADMIN_USER}"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1024M

  node:
    build: ./apps/node
    container_name: multisite-node
    environment:
      REDIS_URL: redis://redis:6379/1
      NODE_SESSION_SECRET: ${NODE_SESSION_SECRET}
    networks:
      - frontend
      - backend
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 768M

  php:
    image: php:8.3-apache
    container_name: multisite-php
    environment:
      DATABASE_URL: postgres://${PG_PHP_USER}:${PG_PHP_PASSWORD}@pg:5432/php_db
    volumes:
      - ./apps/php:/var/www/html:ro
    networks:
      - frontend
      - backend
    depends_on:
      pg:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 768M

  goapi:
    build: ./apps/goapi
    container_name: multisite-goapi
    environment:
      DATABASE_URL: postgres://${PG_GOAPI_USER}:${PG_GOAPI_PASSWORD}@pg:5432/goapi_db
      REDIS_URL: redis://redis:6379/2
    networks:
      - frontend
      - backend
    depends_on:
      pg:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

  redis:
    image: redis:7
    container_name: multisite-redis
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - backend
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  wp-data:
  wp-mysql-data:
  django-media:
  pg-data:
  redis-data:
  nginx-logs:

networks:
  frontend:
  backend:
    internal: true
```

上面编排里有三处必须注意：第一，`backend` 网络写了 `internal: true`，这个网络里的容器出不去外网，数据库与缓存就不会被意外暴露，也不会被某个应用的漏洞利用去访问外网；第二，`wp-mysql`、`pg`、`redis` 三个服务都没有 `ports` 项，这是故意的——数据库与缓存不映射到主机端口，宿主机上 `ss -tlnp` 看不到 3306、5432、6379，备份与管理一律用 `docker compose exec` 进容器做；第三，`./init-db` 目录里放的是给 PostgreSQL 建库建用户的 SQL 文件，第一次起 `pg` 时自动执行，之后再起不会重复执行，改用户密码不要改这个目录，要用 `docker compose exec pg psql` 直接改。

### 10.4 三个自建应用的最小 Dockerfile（写法模式）

Django、Node.js、Go API 各自的 `Dockerfile` 放在 `apps/django/Dockerfile`、`apps/node/Dockerfile`、`apps/goapi/Dockerfile`，写法模式相同：先装依赖，再拷代码，最后只暴露应用自己的端口。下面的 Django 版本是完整的，另外两个只写出与 Django 不同的关键行，完整文件按同样的模式补齐，不要把三个应用的代码拷进同一个镜像。

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app/
EXPOSE 8000
CMD ["gunicorn", "mysite.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
```

Node.js 的关键行是 `FROM node:22-slim`、`COPY package.json package-lock.json`、`RUN npm ci --omit=dev`、`EXPOSE 3000`、`CMD ["node", "server.js"]`，注意用 `npm ci` 而不是 `npm install`，保证装出来的依赖与锁文件一致。Go API 的关键行是两段构建：第一段 `FROM golang:1.27 AS build` 编译出二进制，第二段 `FROM debian:bookworm-slim` 只拷二进制与证书，`EXPOSE 8080`，最终镜像里没有源码与编译工具，体积小、攻击面也小。

### 10.5 日志、监控与备份接入清单

这一节不是代码，是上线前必须接好的清单，缺一项就不要算上线完成：

| 接入项 | 位置 | 检查方法 |
| --- | --- | --- |
| Nginx 访问与错误日志 | 命名卷 `nginx-logs`，对应宿主机由 Docker 管理的卷目录 | `docker compose exec nginx ls /var/log/nginx` 能看到两个日志文件 |
| 五个应用的容器日志 | `docker compose logs <服务名>`，日志驱动默认 `json-file`，并在宿主机 Docker 配置里限制单个文件 10MB、最多 3 个文件 | `docker compose logs --tail 20 django` 能看到最近日志 |
| 健康检查 | 每个应用都要有 `/health` 端点（WordPress 用首页状态代替，返回 200 即算健康） | 健康检查脚本按 OPS-03 的写法，每 5 分钟 curl 一次 5 个子域名与 `/health` |
| 监控告警 | 健康检查脚本失败重试 3 次后写告警文件并通知（邮件或 webhook 二选一，见 OPS-03） | 停掉一个测试容器，确认告警文件出现 |
| 整站备份 | 备份脚本见 §11.3，每天凌晨跑一次，保留 7 天 | 备份目录里有当天的数据库导出与数据卷打包文件 |
| 防火墙 | UFW 只放 22、80、443，见 §12.6 | 从外网扫端口，只看到 80 与 443 |

## 11. 完整配置文件

除 §10 的 Nginx 配置与 Compose 编排外，本节还有四份文件，缺一不可，路径与权限一起写清：

### 11.1 `.env` 文件

文件存放路径：`/opt/multi-site/.env`，权限 600，属主是跑编排的普通用户，绝不进 Git 仓库。文件里只放变量名与占位值，部署时把占位值换成自己生成的随机串，生成方法用 `openssl rand -hex 32`，不要用人能猜到的口令。

```ini
WP_DB_NAME=wordpress_db
WP_DB_USER=wp_user
WP_DB_PASSWORD=请填 WordPress 数据库口令
WP_ROOT_PASSWORD=请填 MySQL root 口令
PG_ADMIN_USER=pg_admin
PG_ADMIN_PASSWORD=请填 PostgreSQL 管理员口令
PG_DJANGO_USER=django_user
PG_DJANGO_PASSWORD=请填 Django 数据库口令
PG_PHP_USER=php_user
PG_PHP_PASSWORD=请填 PHP 数据库口令
PG_GOAPI_USER=goapi_user
PG_GOAPI_PASSWORD=请填 Go API 数据库口令
DJANGO_SECRET_KEY=请填 Django 密钥
NODE_SESSION_SECRET=请填 Node.js 会话密钥
```

### 11.2 PostgreSQL 建库建用户 SQL

文件存放路径：`/opt/multi-site/init-db/01-databases.sql`，第一次起 `pg` 时由官方镜像自动执行。注意：这里的口令写法是占位符，真实部署时由 `docker compose` 的环境变量展开机制处理——更稳妥的做法是把这份文件里的口令先换成与 `.env` 一致的真实值再起库，起库之后立刻把这份文件里的口令改回占位符并记在自己的密码本里，不要长期留着带真实口令的 SQL 文件。

```sql
CREATE DATABASE django_db;
CREATE USER django_user WITH PASSWORD '请填 Django 数据库口令';
GRANT ALL PRIVILEGES ON DATABASE django_db TO django_user;
CREATE DATABASE php_db;
CREATE USER php_user WITH PASSWORD '请填 PHP 数据库口令';
GRANT ALL PRIVILEGES ON DATABASE php_db TO php_user;
CREATE DATABASE goapi_db;
CREATE USER goapi_user WITH PASSWORD '请填 Go API 数据库口令';
GRANT ALL PRIVILEGES ON DATABASE goapi_db TO goapi_user;
```

### 11.3 整站备份脚本

文件存放路径：`/opt/multi-site/scripts/backup.sh`，权限 700，每天凌晨由 cron 跑一次。脚本只做三件事：导出两个数据库、打包五个应用的数据卷、写一份备份清单；恢复方法看 §18，不要只备份不演练。

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/multi-site/backups/$(date +%F)"
mkdir -p "$BACKUP_DIR"
cd /opt/multi-site
docker compose exec -T wp-mysql mysqldump -u root -p"$WP_ROOT_PASSWORD" --single-transaction wordpress_db > "$BACKUP_DIR/wp-mysql.sql"
docker compose exec -T pg pg_dump -U "$PG_ADMIN_USER" django_db > "$BACKUP_DIR/pg-django.sql"
docker compose exec -T pg pg_dump -U "$PG_ADMIN_USER" php_db > "$BACKUP_DIR/pg-php.sql"
docker compose exec -T pg pg_dump -U "$PG_ADMIN_USER" goapi_db > "$BACKUP_DIR/pg-goapi.sql"
docker run --rm -v multisite_wp-data:/data:ro -v "$BACKUP_DIR:/backup" alpine tar czf /backup/wp-data.tar.gz -C /data .
docker run --rm -v multisite_django-media:/data:ro -v "$BACKUP_DIR:/backup" alpine tar czf /backup/django-media.tar.gz -C /data .
docker run --rm -v multisite_redis-data:/data:ro -v "$BACKUP_DIR:/backup" alpine tar czf /backup/redis-data.tar.gz -C /data .
ls -lh "$BACKUP_DIR" > "$BACKUP_DIR/MANIFEST.txt"
find /opt/multi-site/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

上面脚本里有两处容易踩坑：第一，`docker compose exec -T` 的 `-T` 是关掉伪终端，导出 SQL 时必须加，不加会在输出里混进终端控制字符；第二，卷的名字前面要加 Compose 的项目名前缀，本篇的项目名默认就是目录名 `multi-site`，所以卷名是 `multisite_wp-data` 这种形式，如果你的目录名不是 `multi-site`，卷名要跟着改，先用 `docker volume ls` 查到真实卷名再写脚本。

### 11.4 防火墙规则表

UFW 规则不是配置文件，是一组命令，执行顺序是先放行 SSH 再开防火墙，不要反过来：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

## 12. 每个关键配置项的解释

### 12.1 Nginx 配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `server_name` | 这个 server 块负责哪个域名 | 写错会导致请求落到默认 server 块，返回别人的站点或 404 |
| `proxy_pass http://django_upstream` | 把请求转给上游的应用容器 | 上游名写错会导致 502，Nginx 日志里是 `host not found in upstream` |
| `proxy_set_header Host $host` | 把访客用的域名原样传给应用 | 不传会导致应用按容器名生成链接，WordPress 后台尤其容易因此跳错地址 |
| `X-Forwarded-Proto $scheme` | 告诉应用访客用的是 http 还是 https | 不传会导致应用以为访客是 http，登录与跳转出现循环重定向 |
| `client_max_body_size` | 允许上传的最大体积 | WordPress 传媒体文件、Django 传附件时，设小了会报 413 |
| `ssl_protocols TLSv1.2 TLSv1.3` | 只开两个安全的 TLS 版本 | 开了 TLSv1.0/1.1 会被安全扫描判为不合规 |
| `location /.well-known/acme-challenge/` | 证书续期放行路径 | 续期时被跳转到 HTTPS 会导致验证失败，证书过期 |

### 12.2 Compose 配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `networks.frontend / backend` | 容器连哪个网络 | 应用没连 `frontend` 会导致 Nginx 找不到它；数据库连了 `frontend` 会导致它能被 Nginx 所在的网络直接访问 |
| `backend.internal: true` | 后端网络不出外网 | 不写会导致数据库容器能直接访问外网，万一应用有漏洞，数据库就成了跳板 |
| `depends_on.condition: service_healthy` | 等健康检查通过再起应用 | 只写服务名不写健康条件，应用会在数据库还没准备好时就启动，日志里全是连接失败 |
| `deploy.resources.limits.memory` | 单个服务的内存上限 | 不设会导致某个应用内存泄漏时拖垮整台机器，其他四个站点一起挂 |
| `restart: unless-stopped` | 容器退出后自动重启，手动停掉的不重启 | 写成 `always` 会导致你手动停掉的测试容器在服务器重启后又自己跑起来 |
| `volumes` 命名卷 | 数据存在宿主机 Docker 管理的卷里 | 用匿名卷会导致 `docker compose down -v` 一不小心就把数据删了，命名卷至少删之前要多确认一次 |

### 12.3 数据库与缓存配置项

| 配置项 | 含义 |
| --- | --- |
| WordPress 的 `WORDPRESS_DB_HOST: wp-mysql:3306` | WordPress 连 MySQL 用的服务名与端口，服务名就是 Compose 里的服务名，不是 IP |
| Django 的 `DATABASE_URL` | Django 连 PostgreSQL 的连接串，库名与用户名按应用分开，不要共用一个用户 |
| Redis 的 `--maxmemory 256mb --maxmemory-policy allkeys-lru` | 缓存最多占 256MB，满了按最近最少使用淘汰旧键；不设上限会导致缓存把内存吃光 |
| Redis 库索引 1 与 2 | Node.js 与 Go API 分开用的库，键名前缀再加应用名，双重隔离 |

### 12.4 日志与监控配置项

健康检查脚本的判断标准要写死，不要凭感觉：首页与 `/health` 返回 200 算健康，响应超过 2 秒只记 WARN 不算失败，连续 3 次失败才告警。日志轮转用 Docker 的 `json-file` 驱动限制单个文件 10MB、最多 3 个文件，日志文件不设上限会把磁盘写满，磁盘满了所有站点一起挂。

### 12.5 备份配置项

备份脚本里的 `--single-transaction`（mysqldump）与 `pg_dump` 的按库导出，都是“导出时不锁全库”的做法；恢复演练的判定标准是：恢复出来的库能被应用正常连上、首页能打开、登录能成功，缺一个都不算演练通过。备份保留 7 天是示例，站长可根据自己的磁盘与合规要求定，不要照搬。

### 12.6 防火墙与 Docker 的关系

这是多站点编排里最容易被忽视的一点：Docker 默认会直接改主机的 iptables 规则，UFW 的拒绝规则可能拦不住容器发布出来的端口。本篇的解法不是去改 Docker 的 iptables，而是不给它机会：除了 Nginx 的 80 与 443，别的服务一律不写 `ports` 项，数据库与缓存根本没有发布到主机端口，UFW 拦不拦得住它们就不重要了。如果你以后确实要给某个服务加主机端口，先查 DEPLOY-02 与 OPS-02 的对应章节，不要直接加。

## 13. 执行结果示例

下面全部是“读者在自己服务器上应看到的样子（示例输出），不是本机实测输出”。本机没有对真实服务器做上线，本机 Docker 容器也无法实际运行（VM 没有命名空间挂载权限），所以这里没有一条是本机跑出来的记录。

### 13.1 服务状态示例

```text
NAME                  STATUS              PORTS
multisite-nginx       Up (healthy)        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
multisite-wordpress   Up                  80/tcp
multisite-wp-mysql    Up (healthy)        3306/tcp
multisite-django      Up                  8000/tcp
multisite-pg          Up (healthy)        5432/tcp
multisite-node        Up                  3000/tcp
multisite-php         Up                  80/tcp
multisite-goapi       Up                  8080/tcp
multisite-redis       Up (healthy)        6379/tcp
```

看这张表的要点：只有 `multisite-nginx` 一行有 `0.0.0.0` 开头的主机端口映射，其他服务只有容器内端口；如果哪一行出现了 `0.0.0.0:3306` 或 `0.0.0.0:5432`，说明数据库被错误地发布到了主机，立刻改掉 Compose 再重起。

### 13.2 分流验证示例

```text
$ curl -I https://www.example.com/
HTTP/2 200
$ curl -I https://app.example.com/
HTTP/2 302
$ curl https://api.example.com/health
{"status": "ok"}
$ curl -I https://example.com/
HTTP/2 301
location: https://www.example.com/
```

`app.example.com` 返回 302 是正常的：业务系统未登录时跳登录页，登录后才是 200；不要看到 302 就以为分流错了，先登录再看一次。

### 13.3 备份结果示例

```text
wp-mysql.sql        12M
pg-django.sql       3.1M
pg-php.sql          820K
pg-goapi.sql        410K
wp-data.tar.gz      96M
django-media.tar.gz 41M
redis-data.tar.gz   8.2M
MANIFEST.txt        1.2K
```

文件大小只是示例，真实大小取决于你的数据量；关键是清单里 8 个文件一个都不能少，少一个就说明备份脚本中途断了，不要等到要恢复时才发现。

## 14. 成功验证

按顺序做完下面 9 步，才算多站点上线成功，缺一步都不要对外宣称上线了：

1. `docker compose ps` 里 9 个服务全部是 `Up`，健康检查的三个服务是 `Up (healthy)`。
2. 5 个子域名各 curl 一次，分别返回自己的应用，不是同一个页面。
3. 裸域名 `example.com` curl 一次，返回 301 到 `www.example.com`。
4. 从外网扫端口，只看到 80 与 443，看不到 3306、5432、6379、8000、3000、8080。
5. 每个应用登录一次（WordPress 后台、Django 管理后台、Node.js 账号、PHP 站账号、Go API 的带 Token 请求），确认数据库连接正常。
6. 故意停掉 Go API 容器，确认其他四个站点还能打开，再起回来——这是隔离的直接证据。
7. 备份脚本手动跑一次，备份目录里 8 个文件齐全，再按 §18 的步骤恢复一个测试库，确认能连上。
8. 健康检查脚本手动跑一次，确认 5 个子域名的检查都通过，告警文件没有新增记录。
9. 证书到期前 30 天、7 天各收到一次续期提醒（或确认自动续期任务已在 cron 里），不要等到证书过期才发现续期没配。

## 15. 常见错误

| 错误现象 | 原因 | 解决办法 |
| --- | --- | --- |
| 所有子域名都打开同一个站点 | Nginx 的 `server_name` 写错，或请求落到了默认 server 块 | 先 `nginx -t` 检查配置，再按子域名逐个查 `server_name`，不要只改一个就全量重载 |
| 某个子域名返回 502 | 上游应用没起来，或上游服务名写错 | 先 `docker compose ps` 看该服务是不是 `Up`，再 `docker compose logs` 看它的启动日志 |
| WordPress 后台跳转到容器名地址 | `proxy_set_header Host $host` 没传 | 补上 Host 透传，再检查 WordPress 的站点地址设置是不是填的子域名 |
| Django 静态文件 404 | `/static/` 的 `alias` 路径与容器内实际路径不一致 | 先 `docker compose exec django ls` 确认静态文件收集到了哪里，再改 `alias` |
| 应用一启动就报数据库连接失败 | 数据层还没健康就起了应用，或数据库用户与库名不匹配 | 先等 `pg` 与 `wp-mysql` 到 `healthy` 再起应用，再核对 `.env` 与建库 SQL 的用户名与库名 |
| Redis 里两个应用的缓存互相串了 | 键名没加应用前缀，或两个应用用了同一个库索引 | 键名前缀加应用名，库索引按 §7.2 的表分开，不要图省事共用库索引 0 |
| 内存不足导致容器被杀 | 5 个应用加 2 个数据库超出了机器内存 | 先减应用再上线，或给每个服务设更低的内存上限并看 `docker stats` 的实际占用 |
| 备份目录里少文件 | 备份脚本中途断了，或卷名前缀写错 | 先 `docker volume ls` 查真实卷名，再单步跑脚本里的每一条命令定位断点 |
| 证书续期失败 | 80 端口的续期路径被跳转到 HTTPS 拦住了 | 检查 80 的 server 块里 `/.well-known/acme-challenge/` 是不是放行在跳转之前 |

## 16. 故障排查

排查按“先分层、再定位”的顺序，不要一上来就重起全部服务：

1. **先看入口**：`curl -I` 对应子域名，返回 502 说明 Nginx 到了但上游没到；返回 404 说明到了应用但路径不对；连不上说明 DNS、防火墙、Nginx 三层之一有问题。
2. **再看服务**：`docker compose ps` 看 9 个服务的状态，`docker compose logs --tail 50 <服务名>` 看最近日志，日志里先找 `connection refused`、`password authentication failed`、`out of memory` 三类关键词。
3. **再看数据层**：`docker compose exec pg pg_isready`、`docker compose exec wp-mysql mysqladmin ping`、`docker compose exec redis redis-cli ping`，三个都通再查应用配置。
4. **再看资源**：`docker stats --no-stream` 看内存占用最高的服务，`df -h` 看磁盘是不是满了，磁盘满了先清日志与旧备份，不要先删数据卷。
5. **最后才重起**：只重起出问题的那一个服务，`docker compose up -d <服务名>`，重起全部服务是最后的手段，重起全部会把本来正常的站点也中断一次。

## 17. 安全注意事项

- 口令与密钥只放 `.env`，权限 600，不进仓库，不贴进聊天记录与工单；轮换时先改数据库里的用户口令，再改 `.env`，再重起对应的应用，顺序反了应用会先断连。
- 数据库与缓存不映射到主机端口，管理一律用 `docker compose exec`；需要远程管理数据库时走 SSH 隧道，不要直接把 3306 或 5432 放到公网。
- 安全响应头与限流按 OPS-02 的配置来，Nginx 入口统一加，不要每个应用各加一套，加乱了排错时分不清是谁加的。
- WordPress 的插件与主题只装需要的，停用的插件要删掉不是停用——停用的插件照样是攻击面；Django、Node.js、Go API 的依赖要定期更新，漏洞通告的处理流程看 OPS-02。
- 上传目录（WordPress 的 `wp-content/uploads`、Django 的 `media`）不要允许执行 PHP 与其他脚本，Nginx 里对上传路径只做静态文件 served，执行权限一律关掉。
- 备份文件本身也是敏感数据：备份目录权限 700，异地备份要加密传输，不要把带数据库导出的备份目录直接挂到 Web 目录下。

## 18. 回滚和恢复

### 18.1 单个站点回滚（最常用）

1. 把出问题的服务镜像标签指回上一个已知可用的标签，只改它一个服务的镜像或构建来源。
2. `docker compose up -d <服务名>` 只重起它一个，不要重起全部。
3. 按 §14 的第 2 步与第 5 步验证它一个站点，其他站点不用重新验证。
4. 如果回滚涉及数据库结构变更，先看 DB-02 的迁移回滚红线：删字段、改类型这类破坏性迁移不能只靠回滚镜像解决，要按迁移的逆向 SQL 走一遍，逆向 SQL 没有事先写好就不要先上破坏性迁移。

### 18.2 Nginx 配置回滚

改 Nginx 配置前先备份原文件（`cp multi-site.conf multi-site.conf.bak`），改完先 `docker compose exec nginx nginx -t`，测试通过再 `docker compose exec nginx nginx -s reload`；测试不通过不要 reload，正在跑的旧配置不会因此中断。

### 18.3 整站恢复

按 OPS-04 的演练计划走，顺序是：先恢复数据层（MySQL 与 PostgreSQL 的导出文件），再恢复数据卷（WordPress 与 Django 的上传文件），再起应用层，最后起 Nginx 入口并逐个子域名验证。恢复演练的判定标准是 §14 的 9 步全部通过，缺一步都不算恢复成功；演练记录按 OPS-04 的记录表记一遍，日期、场景、实测恢复时间、是否达标、发现的问题、改进措施六项齐全。

### 18.4 最坏情况

服务器整机不可用时，按 OPS-04 的换机流程走：新机器上装好 Docker，把备份目录与 Compose 编排拷过去，按数据层、应用层、入口层的顺序起服务，DNS 指到新 IP，等 TTL 生效后再逐个子域名验证。旧服务器保留 7 天再关（这是示例，站长可根据自己的情况定），不要一恢复成功就立刻关掉旧机器。

## 19. 延伸阅读

- 架构分层与多站点对比：ARCH-01 的十层总览、ARCH-02 的多站点模式、ARCH-03 的选型决策树（多站点落点）。
- 服务器与部署：SRV-01 的多站点模板与 Caddy/Apache 对照、SRV-02 的 PHP-FPM 与 systemd、DEPLOY-02 的 Compose 编排与蓝绿回滚、DEPLOY-03 的 HTTPS 与上线清单。
- 数据与运维：DB-02 的备份恢复与主从复制、OPS-02 的安全响应头与限流、OPS-03 的健康检查与告警、OPS-04 的整站恢复演练。
- 各应用自己的章节：WordPress 与 PHP 站看 PROJ-02 与 PROJ-05，Python 站看 PROJ-03，Node.js 站看 PROJ-04，Docker 平台看 PROJ-06——本篇是把它们组装起来，不是代替它们。

## 20. 相关章节链接

- 架构总览：[ARCH-01 网站完整架构总览](../architecture/01-overview.md)
- Web 服务器与多站点模板：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)
- Docker 编排与回滚：[DEPLOY-02 Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚](../deploy/02-docker.md)
- 数据库运维：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](../database/02-ops.md)
- 整站备份与灾难恢复：[OPS-04 备份、迁移、灾难恢复、RTO/RPO、恢复演练](../ops/04-backup-recovery.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[TOOL-01 建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器](../tools/01-config-generators.md)
