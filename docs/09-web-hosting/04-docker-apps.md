---
description: "很多优秀应用官方直接提供 Docker 镜像，部署工作就简化为写一份 docker-compose.yml、准备好数据目录、起一个反向代理。"
---

# Docker 部署常用应用

## 一、概述与使用场景

很多优秀应用官方直接提供 Docker 镜像，部署工作就简化为写一份 docker-compose.yml、准备好数据目录、起一个反向代理。本章用 Halo 博客和 Nextcloud 私有云两个例子走完这条路线：Halo 代表带数据库的典型 Web 应用，Nextcloud 代表对存储和大文件有要求的应用。两个例子共用同一套宿主机入口模式，即应用端口只绑本机回环地址，对外统一由宿主机 Nginx 反向代理并绑域名上 HTTPS。

相比在宿主机上直接装应用，Docker 路线的优势是环境隔离和可复制：换服务器时带走 compose 文件和数据目录就能原样复活，升级时改镜像标签重新拉取，失败还能退回旧标签。瓶颈和风险也集中在两点：数据必须落在明确的数据卷或宿主机目录里，写错位置重建容器就丢数据；端口如果直接映射到公网，等于绕过了反向代理这一层，域名、证书、访问控制全部失效。所以本章的每份 compose 都把端口绑定写成本机地址，这是硬性要求不是可选优化。

不适合 Docker 的场景也要说清：应用官方没有维护镜像、需要直接调用宿主机硬件或内核模块、或者团队完全没有容器运维经验且业务不能停，这类情况优先考虑第 03 章的手工路线或第 02 章的面板路线。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。
- 权限：可使用 sudo 的账号，例如 ubuntu，并已把当前账号加入 docker 组或全程使用 sudo 执行 docker 命令。
- 前置：Docker Engine 与 Docker Compose 插件已按本书容器章节的方法安装完成，未安装时先补装再回到本章。

```bash
docker --version
docker compose version
sudo systemctl status docker --no-pager
```

- 宿主机上已装好 Nginx 作为统一入口，安装方法见第 03 章；域名解析已指向本服务器，方法见第 01 章；证书签发方法见第 05 章，本章先把代理跑通，再套证书。
- 目录规划：每个应用一个独立目录放在 /opt/apps/ 下，compose 文件、环境变量文件和数据备份都收在各自目录里。

```bash
sudo mkdir -p /opt/apps/halo /opt/apps/nextcloud
sudo chown -R ubuntu:ubuntu /opt/apps
```

!!! warning "环境变量文件不要进公开仓库"
    数据库密码写在与 compose 同目录的 .env 文件里，compose 只引用变量名。这个文件权限要收紧，并且永远不要提交到公开代码仓库。示例里密码统一写占位符，实际使用时换成密码管理器生成的高强度随机值。

## 三、手把手操作步骤

### 3.1 部署 Halo 博客

进入 Halo 目录，先写环境变量文件，再写 compose 文件：

```bash
cd /opt/apps/halo
nano .env
chmod 600 .env
```

```ini
HALO_DB_PASSWORD=<db-password>
HALO_EXTERNAL_URL=https://blog.example.com
```

```bash
cp docker-compose.yml docker-compose.yml.bak.20260101 2>/dev/null || true
nano docker-compose.yml
```

```yaml
services:
  halo:
    image: halohub/halo:2
    container_name: halo
    restart: unless-stopped
    depends_on:
      halo-db:
        condition: service_healthy
    environment:
      SPRING_R2DBC_URL: r2dbc:pool:mysql://halo-db:3306/halo
      SPRING_R2DBC_USERNAME: halo
      SPRING_R2DBC_PASSWORD: ${HALO_DB_PASSWORD}
      SPRING_SQL_INIT_PLATFORM: mysql
      HALO_EXTERNAL_URL: ${HALO_EXTERNAL_URL}
    volumes:
      - halo-data:/root/.halo2
    ports:
      - "127.0.0.1:8090:8090"
    networks:
      - halo-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8090/actuator/health/readiness"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 60s
  halo-db:
    image: mysql:8
    container_name: halo-db
    restart: unless-stopped
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_ROOT_PASSWORD: ${HALO_DB_PASSWORD}
      MYSQL_DATABASE: halo
      MYSQL_USER: halo
      MYSQL_PASSWORD: ${HALO_DB_PASSWORD}
    volumes:
      - halo-db-data:/var/lib/mysql
    networks:
      - halo-net
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
volumes:
  halo-data:
  halo-db-data:
networks:
  halo-net:
    driver: bridge
```

逐行讲解关键项。image 指定镜像与大版本标签，用大版本标签便于小版本自动更新又不会跨大版本突变。restart unless-stopped 表示机器重启后自动拉起，手动停掉的不自动重启。depends_on 配合 condition service_healthy，保证数据库健康检查通过后 Halo 才启动，避免应用抢先连库失败退出。environment 里数据库连接地址的服务名 halo-db 是 compose 内部 DNS 名，只在同一网络内可解析。volumes 把应用数据和数据库数据分别挂到命名卷，这是数据不丢的根本。ports 写成 127.0.0.1:8090:8090，前段是宿主机地址，明确只绑回环，外网连不上这个端口，只能走 Nginx。networks 让两个容器进独立网络，与宿主机上其他应用互不可见。healthcheck 定期探活，状态会显示在 docker ps 的状态列里。

启动并看日志：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f halo
```

### 3.2 部署 Nextcloud

Nextcloud 的 compose 结构与 Halo 类似，差别在多了 Redis 加速、需要更大的数据目录和更长的请求超时，数据库改用 MariaDB 举例：

```bash
cd /opt/apps/nextcloud
nano .env
chmod 600 .env
```

```ini
NEXTCLOUD_DB_PASSWORD=<db-password>
NEXTCLOUD_ADMIN_USER=opsadmin
NEXTCLOUD_ADMIN_PASSWORD=<admin-password>
NEXTCLOUD_TRUSTED_DOMAIN=cloud.example.com
```

```yaml
services:
  nextcloud:
    image: nextcloud:stable-apache
    container_name: nextcloud
    restart: unless-stopped
    depends_on:
      nextcloud-db:
        condition: service_healthy
      nextcloud-redis:
        condition: service_started
    environment:
      MYSQL_HOST: nextcloud-db
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: ${NEXTCLOUD_DB_PASSWORD}
      NEXTCLOUD_ADMIN_USER: ${NEXTCLOUD_ADMIN_USER}
      NEXTCLOUD_ADMIN_PASSWORD: ${NEXTCLOUD_ADMIN_PASSWORD}
      NEXTCLOUD_TRUSTED_DOMAINS: ${NEXTCLOUD_TRUSTED_DOMAIN}
      REDIS_HOST: nextcloud-redis
    volumes:
      - nextcloud-html:/var/www/html
      - nextcloud-data:/var/www/html/data
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - nextcloud-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/status.php"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 90s
  nextcloud-db:
    image: mariadb:11
    container_name: nextcloud-db
    restart: unless-stopped
    command: --transaction-isolation=READ-COMMITTED --log-bin=binlog --binlog-format=ROW
    environment:
      MYSQL_ROOT_PASSWORD: ${NEXTCLOUD_DB_PASSWORD}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: ${NEXTCLOUD_DB_PASSWORD}
    volumes:
      - nextcloud-db-data:/var/lib/mysql
    networks:
      - nextcloud-net
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 10
  nextcloud-redis:
    image: redis:7-alpine
    container_name: nextcloud-redis
    restart: unless-stopped
    command: redis-server --requirepass <redis-password>
    networks:
      - nextcloud-net
volumes:
  nextcloud-html:
  nextcloud-data:
  nextcloud-db-data:
networks:
  nextcloud-net:
    driver: bridge
```

讲解差异点：nextcloud 镜像自带 Apache，容器内监听 80，映射到宿主机 8080 且同样只绑 127.0.0.1。数据拆成程序卷和数据卷两个，备份时数据卷是重点。command 给 MariaDB 加的三个参数是 Nextcloud 官方对事务隔离级别和二进制日志的要求，缺了会在后台管理页报警告。Redis 用来做文件锁定和缓存，不映射任何宿主机端口，只在内部网络里提供服务。trusted domains 环境变量决定允许用哪个域名访问，写错域名打开页面会直接被应用拒绝，这是有意的安全机制不是故障。

```bash
docker compose pull
docker compose up -d
docker compose ps
```

### 3.3 用宿主机 Nginx 反向代理绑域名

两个应用都只监听本机端口，对外入口统一在宿主机 Nginx 上做。先备份默认配置，再给 Halo 写代理站点：

```bash
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak.20260101
sudo nano /etc/nginx/sites-available/blog.example.com
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name blog.example.com;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

讲解：proxy_pass 指向应用的本机端口。四个 proxy_set_header 必须齐全，Host 让后端知道被访问的域名，X-Real-IP 和 X-Forwarded-For 传递真实访客地址，X-Forwarded-Proto 告诉后端原始协议，后端生成链接和判断 Cookie 安全属性都依赖它，缺一个就可能出现登录循环或链接里丢端口等问题。client_max_body_size 按应用上传需求放宽，博客传图给 100m 足够。

Nextcloud 的代理站点同理写一份，域名换成 cloud.example.com，proxy_pass 换成 http://127.0.0.1:8080，并加大上传上限和超时：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name cloud.example.com;

    client_max_body_size 1024m;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点并检查：

```bash
sudo ln -s /etc/nginx/sites-available/blog.example.com /etc/nginx/sites-enabled/blog.example.com
sudo ln -s /etc/nginx/sites-available/cloud.example.com /etc/nginx/sites-enabled/cloud.example.com
sudo nginx -t
sudo systemctl reload nginx
```

### 3.4 套上 HTTPS

代理解析都通了之后，按第 05 章的方法给两个域名各签一张证书。用 Certbot 的 nginx 插件时一条命令完成签发和改写配置：

```bash
sudo certbot --nginx -d blog.example.com -d cloud.example.com
```

签发成功后 Certbot 会给每个站点补上 443 监听和 HTTP 跳转规则。改完再次确认 Nginx 配置和容器都健康，再把应用的环境变量里对外地址保持为 https 开头的最终地址，Halo 的 HALO_EXTERNAL_URL 已经按此填写，Nextcloud 若后台提示覆盖协议警告，需要在应用配置里把 overwriteprotocol 设为 https，具体命令见官方管理手册的 config 命令部分，本章验证环节会检查这一提示。

!!! tip "也可以用 Nginx Proxy Manager 代替手写代理"
    如果宿主机应用很多、手写站点文件容易乱，可以把入口换成 Nginx Proxy Manager，它本身也是一个容器，提供图形界面管理代理主机和证书。取舍是多一个要维护和加固的管理面板，且它的 81 端口管理入口必须同样只绑本机或加访问限制，不能裸露公网。站点少于五个时手写 Nginx 更简单可控，本章默认手写路线。

## 四、效果验证与测试

分四层验证，逐层通过再看下一层：

```bash
docker compose -f /opt/apps/halo/docker-compose.yml ps
curl -I http://127.0.0.1:8090
curl -I http://127.0.0.1:8080/status.php
curl -I https://blog.example.com
curl -I https://cloud.example.com
sudo ss -tlnp | grep -E ':(8090|8080) '
```

期望结果：docker compose ps 里各容器状态为 running 且带 healthy 标记；直连本机 8090 和 8080 都返回 200 或应用正常的跳转状态；用域名访问返回 HTTPS 正常响应，浏览器无证书警告；ss 输出里 8090 和 8080 的监听地址都是 127.0.0.1，从另一台机器直接访问服务器公网 IP 的这两个端口应连接失败。最后浏览器打开 Nextcloud 后台管理页，确认没有域名不受信任和协议覆盖类的警告残留。

## 五、常见错误与排坑指南

**场景一：容器反复重启，日志报数据库连接拒绝。** Halo 日志片段常见 Communications link failure 或 Connection refused。原因是应用先于数据库就绪就去连库，或 .env 里密码没有被 compose 读到。先看健康状态和变量展开结果：

```bash
docker compose ps
docker compose config | grep -i password
docker compose logs halo-db | tail -n 50
```

config 命令能把最终生效的变量打印出来，密码处显示为空说明 .env 没放对目录或变量名写错。修复后重新 up -d 即可，不要删卷重来。

**场景二：域名打开是 502 Bad Gateway，但本机端口直连正常。** 说明 Nginx 活着、后端在 Nginx 眼里不可达，常见于 compose 刚重建、应用还在启动窗口，或代理端口写错。排查：

```bash
curl -v http://127.0.0.1:8090
sudo tail -n 50 /var/log/nginx/error.log
docker compose ps
```

错误日志里出现 connect() failed (111: Connection refused) 就等应用健康后重试；端口写错就改站点配置后 nginx -t 再 reload。

**场景三：Nextcloud 登录后反复跳回登录页或提示通过不受信任的域名访问。** 前者多是代理少传了 X-Forwarded-Proto，后端生成的跳转地址协议不对；后者是 trusted domains 没有包含当前域名。修复：补齐第 3.3 节的四个请求头并 reload，再核对 .env 里的可信域名变量，改后重建应用容器使变量生效：

```bash
docker compose up -d --force-recreate nextcloud
```

## 六、生产环境最佳实践与安全建议

第一，坚持应用端口只绑 127.0.0.1 这一条铁律，新增应用时先检查 ss 的监听地址再开放域名，任何直接映射公网的端口都要有书面理由。第二，镜像标签不要长期用 latest，用大版本或固定版本标签，升级动作固定为先备份数据卷、改标签、pull、up -d、看日志和健康状态，出问题改回旧标签回滚。第三，备份要同时备三样东西：compose 文件、.env 文件、数据卷内容，只备一样恢复不出来。数据库卷备份优先用容器内导出命令生成逻辑备份文件，不要在数据库运行时直接打包数据目录。第四，一应用一网络一目录，禁止多个不相关应用共用一张网络和一个数据库容器，隔离粒度决定爆炸半径。第五，定期执行 docker system df 查看磁盘占用并清理无用旧镜像，但清理前确认没有要回滚的旧版本。第六，.env 文件权限保持 600，服务器上所有 compose 目录纳入配置备份清单，换人交接时这份清单就是全部家底。
