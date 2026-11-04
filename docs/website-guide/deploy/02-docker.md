# DEPLOY-02：Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚完整教程

> 任务编号：DEPLOY-02（网站建设与部署实战指南 · 部署第 2 篇）
> 上一篇：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](./01-cicd.md)；下一篇：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](./03-launch.md)。
> 本篇只讲用 Docker 与 Docker Compose 把网站跑起来、换版本、回滚版本：镜像、容器、卷、网络只讲部署用得上的部分，重点是多容器编排、蓝绿部署、滚动部署与回滚。不讲 CI 流水线本身（那是 DEPLOY-01），不讲 HTTPS 证书与 CDN 上线（那是 DEPLOY-03）。

## 1. 本章目标

读完并动手做完本篇，你能：

- 说清镜像、容器、卷、网络这四个概念在部署里各自管什么，并能用一句话区分镜像与容器。
- 用一份 `docker-compose.yml` 把 Web、应用、数据库、缓存四个服务编排起来，做到一台服务器上 `docker compose up -d` 就能拉起整个网站。
- 给应用服务配好健康检查与重启策略，让容器崩了能自己起来、没准备好不接流量。
- 按蓝绿部署的步骤完成一次零停机换版本，并在验证失败时把流量切回旧版本。
- 按手动逐个替换的办法完成一次滚动部署，并说清单机 Compose 为什么没有 Swarm、Kubernetes 那种内置滚动。
- 定一套镜像标签策略，做到回滚时有明确的旧镜像可回，而不是只能回滚到含义不明的 `latest`。
- 说清数据库迁移回滚的红线：删字段、改类型这类破坏性迁移不能只靠回滚镜像解决。

## 2. 适用人群

- 已经有一个能跑的应用（Node.js、Python、PHP 任一种），想把它从“手动启动、关了终端就停”变成“容器化、可换版本、可回滚”的读者。
- 读过 SRV-02，知道 systemd 与进程管理怎么回事，想换一种部署方式的读者；也适合读过 ARCH-02，知道单体与多站点长什么样，想把其中一种落地的读者。
- 不适合只想学写代码、不想碰服务器的读者；也不适合已经在用 Kubernetes 集群化部署的读者，本篇讲的是单台 Ubuntu 服务器上的 Docker 部署，不讲集群编排。

## 3. 适用系统和版本

- 操作系统：Ubuntu 24.04 LTS（本篇命令以此为准），Ubuntu 22.04 LTS 大体相同，Docker 的安装源配置略有不同，见 Docker 官方文档。
- Docker Engine：用 Docker 官方仓库安装，安装时以 Docker 官方文档当场公布的版本为准，本篇不写死 Docker 的补丁号。
- Docker Compose：用 v2 插件，命令是 `docker compose`（中间是空格）。旧版 v1 的命令是 `docker-compose`（中间是横杠），v1 已停止维护，本篇一律用 v2 写法，不要混用。
- 示例镜像标签：应用基础镜像 `node:22-alpine`、Web `nginx:1.28-alpine`、数据库 `postgres:16-alpine`、缓存 `redis:7-alpine`。这些是本篇示例所用的标签，读者部署时以各镜像官方仓库当场公布的标签为准，不要照抄一个几年前的标签。
- 示例应用：一个最小的 Node.js 应用（BE-03 的 Fastify 思路的简化版，只用 Node.js 自带 `http` 模块，不依赖任何框架），入口是 `server.js`，监听 3000 端口，提供 `/` 与 `/health` 两个接口。
- 示例数据库：PostgreSQL 16，示例缓存：Redis 7。换 MySQL 或其他数据库时，连接串与健康检查命令要跟着换，思路不变。

## 4. 使用前提

- 一台能用 sudo 的 Ubuntu 服务器，已经按 Docker 官方文档装好 Docker Engine 与 Compose v2 插件，当前用户已加入 `docker` 组（否则每条命令都要加 `sudo`，本篇命令默认当前用户可直接用 `docker`）。
- 一个已经能跑的应用代码，本篇示例用 Node.js 最小应用；换成 Python 或 PHP 应用时，Dockerfile 的基础镜像与启动命令要跟着换，Compose 的编排思路不变。
- 服务器上 8080 端口未被占用（本篇示例把 Web 服务映射到主机的 8080 端口，见第 8 节；想用 80 端口时把 8080 换成 80，但非 root 用户绑 80 端口会失败，要用 sudo 或改回 8080）。
- 会用 `sudo`、会看报错的第一行，不要求会写 shell 脚本；蓝绿脚本会逐行讲清。

## 5. 所需资源

- 一台 Ubuntu 服务器：2 核 CPU、4 GB 内存起步（四个服务加系统开销，内存低于这个数容易在构建时被 OOM 杀掉，见第 16 节）。
- 磁盘：20 GB 可用空间起步，镜像、卷、日志都会占磁盘，见第 16 节的磁盘清理办法（清理前先确认不要删正在用的卷）。
- 一个域名或服务器 IP（本篇示例用 `127.0.0.1:8080` 在本机验证，域名解析与 HTTPS 上线是 DEPLOY-03 的范围）。
- 应用代码所在的目录，本篇示例放在 `/opt/mysite`，下面有 `docker-compose.yml`、`Dockerfile`、`server.js`、`package.json`、`nginx/` 目录与 `.env` 文件。

## 6. 技术原理

### 6.1 镜像与容器

镜像是一份只读的模板，里面装着运行应用需要的一切：基础系统、运行时、依赖、代码。容器是镜像跑起来的实例，容器里可以写文件、跑进程，容器删了，容器里没放进卷的数据就跟着没了。一句话：镜像是安装包，容器是装好后跑起来的程序。

镜像由一层一层叠加而成，每条 Dockerfile 指令产生一层。层的好处是复用：两个镜像共用 `node:22-alpine` 这一层时，磁盘上只存一份。层的坏处是每一层都会留痕：`COPY` 进去又删掉的文件在镜像历史里还在，所以密钥绝不能 `COPY` 进镜像，见第 17 节。

### 6.2 卷与网络

卷是容器外的一块磁盘，挂给容器用，容器删了卷还在，数据库与缓存的数据必须放卷里，不能只放容器里。绑定挂载是把主机的某个目录直接挂进容器，适合挂配置文件（本篇的 Nginx 配置就是绑定挂载），不适合放数据库数据（权限与迁移都麻烦）。

网络是容器之间互相找对方的办法。同一网络里的容器可以用服务名当主机名互相访问：应用连数据库时写主机名 `db`，而不是 `127.0.0.1`，因为 `127.0.0.1` 在容器里指的是容器自己，不是数据库容器。本篇用两个网络做隔离：`frontend` 网络只给 Web 与应用，`backend` 网络只给应用、数据库与缓存，数据库与缓存不进 `frontend` 网络，外面就碰不到它们。

### 6.3 健康检查与重启策略

健康检查是 Compose 或 Docker 定期在容器里跑一条命令，命令成功就是健康，连续失败几次就是不健康。本篇应用的健康检查是请求容器自己的 `/health` 接口，数据库是 `pg_isready`，缓存是 `redis-cli ping`。健康检查的意义在两处：一是 Web 服务用 `depends_on` 的 `service_healthy` 条件等应用健康了再启动，二是蓝绿脚本靠健康状态判断新版本能不能接流量。

重启策略是容器退出后怎么办。本篇四个服务都用 `unless-stopped`：容器崩了自动重启，服务器重启后自动拉起；只有手动 `stop` 的容器不会自动起来。不要用 `always` 当默认值，`always` 会连手动停掉的容器也在服务器重启后拉起来，排障时容易困惑。

### 6.4 蓝绿部署与滚动部署的区别

蓝绿部署是同时准备两套应用：线上跑的是蓝，新版本部署成绿，绿健康检查通过后，把 Nginx 的上游从蓝切到绿，再停掉蓝。好处是切换是一瞬间的事，回滚也是把上游切回去；代价是切换那一刻要多跑一套应用，内存要够。

滚动部署是逐个换掉旧容器：先换第一个，健康了再换第二个，直到全部换完。好处是不用同时跑两套，内存占用小；代价是换的过程中新旧版本同时在线，接口必须向前兼容（新代码要能读旧数据结构，见第 18 节）。

单机 Compose 没有 Swarm、Kubernetes 那种内置滚动：`docker compose up -d` 遇到配置变化会把所有变了的容器一起重建，而不是逐个换。所以本篇的滚动是手动逐个替换，不是某个开关一开就自动滚动，这一点要先说清，避免读者以为 Compose 自带滚动。

## 7. 架构说明

本篇的完整平台由四个服务组成，全部跑在同一台服务器上：

| 服务 | 镜像 | 作用 | 对外端口 | 所在网络 |
| --- | --- | --- | --- | --- |
| web | nginx:1.28-alpine | 反向代理与静态分流，唯一对外入口 | 主机 8080 映射到容器 80 | frontend |
| app | 本篇 Dockerfile 构建 | 应用服务，跑 Node.js 最小应用 | 不映射到主机，只在网络内提供 3000 | frontend、backend |
| db | postgres:16-alpine | 数据库，数据放命名卷 | 不映射到主机，只在网络内提供 5432 | backend |
| cache | redis:7-alpine | 缓存，数据放命名卷 | 不映射到主机，只在网络内提供 6379 | backend |

请求链路是：浏览器 → 主机 8080 → web 容器 → `app` 服务名解析到应用容器 3000 → 应用连 `db` 服务名 5432 与 `cache` 服务名 6379。数据库与缓存不映射端口到主机，是有意的：外面连不上数据库，只能通过应用访问，这是第 17 节的安全要求。

蓝绿部署时的架构变化是：数据服务（db、cache）与 Web 服务（web）保持不动，只换应用服务。蓝绿各一套应用容器，都挂在 `frontend` 与 `backend` 网络上，Nginx 的上游文件在 `app-blue:3000` 与 `app-green:3000` 之间切换。应用容器用服务名加颜色后缀做网络别名，这样 Nginx 才能分清蓝绿两个应用，见第 10.4 节的脚本。

## 8. 操作前检查

动手前先逐项核对，缺一项就先补齐，不要跳过：

1. Docker 与 Compose v2 已装好：`docker --version` 与 `docker compose version` 都有输出，且 `docker compose` 中间是空格。
2. 当前用户在 `docker` 组里：`docker ps` 不用 sudo 就能跑；如果报权限错误，先执行 `sudo usermod -aG docker $USER` 再重新登录。
3. 主机 8080 端口未被占用：`ss -tlnp | grep 8080` 没有输出；有输出时先停掉占用的服务，或把本篇的 8080 换成别的端口。
4. `/opt/mysite` 目录已建好，且当前用户对它有写权限；`.env` 文件已建好，里面只有键名与占位符口令，见第 11.1 节。
5. 磁盘可用空间大于 5 GB：`df -h /` 看一眼，构建镜像与拉取基础镜像都要占空间。
6. 应用代码的 `package.json` 里没有生产不需要的依赖被打进镜像的风险：本篇 Dockerfile 用 `npm ci --omit=dev`，只装生产依赖。

## 9. 逐步操作

### 9.1 准备目录与文件

在服务器上建目录并放入第 10 节与第 11 节的全部文件：

```bash
sudo mkdir -p /opt/mysite/nginx
cd /opt/mysite
```

把 `docker-compose.yml`、`Dockerfile`、`server.js`、`package.json` 放在 `/opt/mysite` 下，把 `nginx/default.conf` 与 `nginx/upstream.conf` 放在 `/opt/mysite/nginx` 下，把 `.env` 放在 `/opt/mysite` 下并把权限设为 600（只有属主能读写）。

### 9.2 首次启动整个平台

```bash
cd /opt/mysite
docker compose up -d --build
docker compose ps
```

`--build` 是第一次必须加的：应用镜像是本地 Dockerfile 构建的，不加 `--build` 时 Compose 会去找已有的同名镜像，第一次根本没有。`docker compose ps` 的输出里四个服务都应是 `running`，且 `app`、`db`、`cache` 的健康状态应是 `healthy`，见第 13 节。

### 9.3 验证网站能打开

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/
```

第一条应返回应用的健康结果，第二条应返回带版本号的欢迎内容，见第 13 节。打不开时先看第 16 节的排障表，不要直接重建整个平台。

### 9.4 蓝绿部署一次新版本

蓝绿部署的完整步骤是（脚本在第 10.4 节，手动步骤与脚本一一对应）：

1. 确认当前线上颜色：看 `/opt/mysite/.live` 文件里的值，第一次部署前没有这个文件，默认线上是 `main`（即首次启动的那套应用）。
2. 把新版本部署到闲置颜色：闲置颜色是与线上不同的那一个，例如线上是 `blue`，闲置就是 `green`。
3. 等闲置颜色的应用健康检查通过，超时没通过就停掉闲置颜色、直接退出，不要切流量。
4. 备份当前的 Nginx 上游文件，写入指向闲置颜色的上游文件，执行 `nginx -t` 与 `nginx -s reload`。
5. 从主机 curl 验证新版本确实能打开，验证失败就恢复备份的上游文件、重新加载、停掉闲置颜色、退出。
6. 验证通过后才停掉并删除旧颜色的应用容器，把闲置颜色写进 `.live` 文件。

关键顺序是：旧颜色在新版本验证通过之前绝不停掉。先停旧颜色再验证新版本的做法是错的，验证失败时就没有旧版本可回了。

### 9.5 滚动部署一次新版本

滚动部署的手动步骤是（应用先以 2 副本跑着，见第 10.3 节的 `--scale` 用法）：

1. 先把应用扩到 2 副本：`docker compose up -d --scale app=2`，两个旧容器都在跑。
2. 改 `docker-compose.yml` 里应用的版本号环境变量（`APP_VERSION`），不要改镜像标签以外的东西。
3. 停掉第一个旧容器，再执行 `docker compose up -d --scale app=2`：Compose 只会重建配置变了的那个容器，另一个旧容器不动，补齐后新旧各一。
4. 看新容器的健康状态与日志，确认没问题再停掉第二个旧容器，重复一次补齐步骤，两个容器就都是新版本了。
5. 最后执行一次 `docker compose ps` 与主机 curl 验证，两个容器都健康、版本号都是新版本才算完。

滚动过程中新旧版本同时在线，所以接口与数据结构必须向前兼容：新代码要能读旧数据结构，旧代码在短时间内还能跑，这是第 18 节的红线之一。

## 10. 完整代码

本节的四个文件是成套的，缺一个就跑不起来。存放路径都在 `/opt/mysite` 下，见各小节标题后的路径。

### 10.1 Dockerfile（存放路径：/opt/mysite/Dockerfile）

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
USER node
CMD ["node", "server.js"]
```

指令顺序是有意的：先只复制 `package.json` 与 `package-lock.json` 再装依赖，这样以后只改业务代码时，依赖层可以直接复用缓存，不用每次都重新装。`USER node` 是让应用不用 root 跑，基础镜像自带 `node` 用户。`COPY . .` 会把目录下所有文件都复制进去，所以 `.dockerignore` 必须排除 `.env` 与 `node_modules`，见第 11.4 节。

### 10.2 最小应用 server.js（存放路径：/opt/mysite/server.js）

```js
const http = require("node:http");

const port = 3000;
const version = process.env.APP_VERSION || "1.2.0";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: version }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "hello from mysite", version: version }));
});

server.listen(port, "0.0.0.0", () => {
  console.log("listening on " + port + " version " + version);
});
```

监听地址必须是 `0.0.0.0`，不能写 `127.0.0.1`：写 `127.0.0.1` 时应用只在容器自己内部监听，Nginx 与健康检查从容器外连不进来，会报 502 或健康检查失败，这是新手最常见的坑之一。`APP_VERSION` 环境变量用来在验证时区分新旧版本，蓝绿与滚动的验证都靠它。

配套的 `package.json`（存放路径：/opt/mysite/package.json）只有名字与版本，没有任何依赖：

```json
{
  "name": "mysite",
  "version": "1.2.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  }
}
```

### 10.3 docker-compose.yml（存放路径：/opt/mysite/docker-compose.yml）

```yaml
services:
  web:
    image: nginx:1.28-alpine
    container_name: mysite-web
    ports:
      - "8080:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/upstream.conf:/etc/nginx/conf.d/upstream.conf:ro
    depends_on:
      app:
        condition: service_healthy
    networks:
      - frontend
    restart: unless-stopped

  app:
    build: .
    image: mysite-app
    environment:
      APP_VERSION: ${APP_VERSION:-1.2.0}
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL: redis://:${REDIS_PASSWORD}@cache:6379/0
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    networks:
      frontend:
        aliases:
          - app-${COLOR:-main}
      backend:
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - fetch('http://127.0.0.1:3000/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: mysite-db
    env_file:
      - .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - backend
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    container_name: mysite-cache
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redisdata:/data
    networks:
      - backend
    healthcheck:
      test:
        - CMD
        - redis-cli
        - -a
        - ${REDIS_PASSWORD}
        - ping
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:

networks:
  frontend:
    name: mysite-frontend
  backend:
    name: mysite-backend
```

注意三点：第一，`db` 与 `cache` 没有 `ports` 项，是有意不映射到主机，见第 7 节；第二，`app` 服务没有 `container_name`，是有意的：蓝绿脚本与滚动的 `--scale app=2` 都要求应用容器名由 Compose 自动生成，写死 `container_name` 后扩副本会直接报错；第三，两个网络都写了固定 `name`，这样蓝绿两个项目（`-p mysite-blue` 与 `-p mysite-green`）共用同一批网络，Nginx 才能同时连上蓝绿两个应用，见第 10.4 节。

### 10.4 蓝绿切换脚本（存放路径：/opt/mysite/blue-green.sh）

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

LIVE_FILE=.live
LIVE=$(cat "$LIVE_FILE" 2>/dev/null || echo main)
if [ "$LIVE" = "blue" ]; then
  IDLE=green
else
  IDLE=blue
fi
NEW_VERSION="${NEW_VERSION:-1.3.0}"
echo "当前线上颜色：$LIVE，部署到闲置颜色：$IDLE，新版本：$NEW_VERSION"

COLOR="$IDLE" APP_VERSION="$NEW_VERSION" docker compose -p "mysite-$IDLE" -f docker-compose.yml up -d --no-deps --build app

CID=$(docker compose -p "mysite-$IDLE" ps -q app)
echo "闲置颜色容器：$CID，等待健康检查通过"
OK=0
for i in $(seq 1 30); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$CID")
  if [ "$STATUS" = "healthy" ]; then
    OK=1
    break
  fi
  sleep 2
done
if [ "$OK" != "1" ]; then
  echo "健康检查超时，停掉闲置颜色并退出，不切流量"
  docker compose -p "mysite-$IDLE" stop app
  docker compose -p "mysite-$IDLE" rm -f app
  exit 1
fi

cp nginx/upstream.conf nginx/upstream.conf.bak
printf 'upstream app_backend {\n    server app-%s:3000;\n}\n' "$IDLE" > nginx/upstream.conf
docker exec mysite-web nginx -t
docker exec mysite-web nginx -s reload

if ! curl -fsS http://127.0.0.1:8080/health; then
  echo "切流量后验证失败，恢复旧上游并停掉闲置颜色"
  cp nginx/upstream.conf.bak nginx/upstream.conf
  docker exec mysite-web nginx -t
  docker exec mysite-web nginx -s reload
  docker compose -p "mysite-$IDLE" stop app
  docker compose -p "mysite-$IDLE" rm -f app
  exit 1
fi

if [ "$LIVE" = "main" ]; then
  docker compose -p mysite stop app
  docker compose -p mysite rm -f app
else
  docker compose -p "mysite-$LIVE" stop app
  docker compose -p "mysite-$LIVE" rm -f app
fi
echo "$IDLE" > "$LIVE_FILE"
echo "蓝绿切换完成，当前线上颜色：$IDLE"
```

脚本的关键设计是：旧颜色在新版本验证通过之前绝不停掉；验证失败时恢复备份的上游文件、重新加载、停掉闲置颜色，线上流量全程没有断过旧版本。清理闲置颜色用的是 `stop` 加 `rm -f`，不要用 `down`：`down` 会尝试删除 compose 文件里定义的网络，而 `frontend` 与 `backend` 是蓝绿与主项目共用的固定名字网络，删网络会报错甚至影响还在跑的服务。

脚本第一次跑之前要先加执行权限：`chmod +x /opt/mysite/blue-green.sh`。跑脚本时用环境变量传新版本号，例如 `NEW_VERSION=1.3.0 ./blue-green.sh`，不传时默认 1.3.0。

## 11. 完整配置文件

### 11.1 .env（存放路径：/opt/mysite/.env，权限 600）

```ini
POSTGRES_USER=mysite
POSTGRES_PASSWORD=请填数据库口令
POSTGRES_DB=mysite
REDIS_PASSWORD=请填缓存口令
APP_VERSION=1.2.0
COLOR=main
```

`.env` 只放键名与占位符口令，真实口令由读者在自己服务器上填，填完后权限必须是 600，且 `.env` 绝不能提交到 Git 仓库（DEPLOY-01 的仓库规则同样适用）。Compose 会自动读取同目录下的 `.env` 来做变量替换，`app`、`db`、`cache` 三个服务又通过 `env_file` 把它读进容器，两处用途不要混淆：前者是 Compose 文件里的 `${POSTGRES_USER}` 替换，后者是容器里的环境变量。

### 11.2 nginx/default.conf（存放路径：/opt/mysite/nginx/default.conf）

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_next_upstream error timeout;
    }
}
```

`proxy_pass` 写的是上游名 `app_backend`，而不是某个容器的 IP：容器重启后 IP 会变，写死 IP 下次就 502。`proxy_next_upstream error timeout` 是滚动部署时的帮手：某个副本刚停掉、Nginx 还没感知到时，失败的请求会试下一个上游，而不是直接返回 502。

### 11.3 nginx/upstream.conf（存放路径：/opt/mysite/nginx/upstream.conf）

```nginx
upstream app_backend {
    server app-main:3000;
}
```

首次启动时上游指向 `app-main`，即主项目应用容器的网络别名（`COLOR` 默认值是 `main`，见第 10.3 节）。蓝绿脚本每次切换时都会重写这个文件并重新加载 Nginx，切换后这里就变成 `app-blue:3000` 或 `app-green:3000`。切换后必须 `reload`：Nginx 启动时会把上游名解析成 IP 并缓存，不 reload 就一直连旧 IP，这是第 16 节里“换了容器还是 502”的常见原因。

### 11.4 .dockerignore（存放路径：/opt/mysite/.dockerignore）

```text
node_modules
.env
.git
*.log
```

`.dockerignore` 的作用是让 `COPY . .` 不把这些东西打进镜像。最关键的是 `.env`：没有这一行，真实口令就会跟着镜像走，镜像一旦推送到仓库或发给别人，口令就泄露了，且镜像历史里删不掉，见第 17 节。

## 12. 每个关键配置项的解释

| 配置项 | 在哪 | 含义 | 写错的后果 |
| --- | --- | --- | --- |
| `build: .` | app 服务 | 用当前目录的 Dockerfile 构建应用镜像，而不是拉取现成镜像 | 漏写时 Compose 会去找名叫 `mysite-app` 的现成镜像，第一次根本找不到 |
| `image: mysite-app` | app 服务 | 给构建出的镜像起名字，蓝绿脚本靠项目名区分蓝绿镜像 | 漏写时每次构建的镜像名都不固定，回滚时找不到旧镜像 |
| `container_name: mysite-web` | web 服务 | 给 Web 容器起固定名字，蓝绿脚本靠它执行 `nginx -t` 与 `reload` | 漏写时脚本里的 `docker exec mysite-web` 找不到容器 |
| `container_name` 缺席 | app 服务 | 有意不写，让 Compose 自动命名，扩副本与蓝绿多项目才不冲突 | 写死后 `--scale app=2` 直接报错，蓝绿两个项目也会抢同一个容器名 |
| `ports: "8080:80"` | web 服务 | 主机 8080 映射到容器 80，唯一对外入口 | 写到 db 或 cache 服务上等于把数据库暴露到公网 |
| `depends_on` 加 `service_healthy` | web、app 服务 | 等依赖的服务健康了再启动，而不是只等容器起来 | 只写 `depends_on` 不加条件时，应用可能在数据库还没准备好时就连库失败 |
| `healthcheck` | app、db、cache 服务 | 定期在容器里跑命令判断健康，蓝绿脚本靠它放行 | 漏写时蓝绿脚本拿不到健康状态，只能凭感觉切流量 |
| `restart: unless-stopped` | 全部服务 | 崩了自动重启，服务器重启后自动拉起，手动停的不拉 | 写成 `always` 时手动停掉的容器在服务器重启后也会被拉起来 |
| `volumes: pgdata`、`redisdata` | db、cache 服务 | 命名卷，数据存在容器外，容器删了数据还在 | 用绑定挂载放数据库数据时权限与迁移都麻烦，且容易误删 |
| `networks` 固定 `name` | 两个网络 | 蓝绿两个项目共用同一批网络，Nginx 才能同时连蓝绿 | 不写固定名时网络名带项目前缀，蓝绿应用互相隔离，Nginx 连不上闲置颜色 |
| `aliases: app-${COLOR:-main}` | app 服务 | 给应用容器一个带颜色的网络别名，Nginx 上游靠它区分蓝绿 | 不写别名时蓝绿两个应用都叫 `app`，DNS 会同时解析到两个，切换不可控 |
| `env_file: .env` | app、db、cache 服务 | 把 `.env` 读进容器当环境变量 | 只靠 Compose 变量替换时，容器里读不到口令，应用连不上数据库 |
| `USER node` | Dockerfile | 应用不用 root 跑，容器被攻破时破坏范围小 | 漏写时应用以 root 跑，容器逃逸的后果更严重 |
| `npm ci --omit=dev` | Dockerfile | 只装生产依赖，镜像更小、攻击面更小 | 用 `npm install` 时开发依赖也会打进镜像，体积大且可能带漏洞包 |

## 13. 执行结果示例

本节全部输出都是“读者在自己服务器上应看到的样子（示例输出）”，不是本机实测输出，原因见第 14 节末尾的如实说明。实际时间、容器 ID、内存数字以读者自己服务器为准。

首次启动后 `docker compose ps` 应看到四个服务都是 `running`，且三个带健康检查的服务是 `healthy`：

```text
NAME           IMAGE              STATUS                   PORTS
mysite-web-1   nginx:1.28-alpine  Up                         0.0.0.0:8080->80/tcp
mysite-app-1   mysite-app         Up (healthy)               3000/tcp
mysite-db-1    postgres:16-alpine Up (healthy)               5432/tcp
mysite-cache-1 redis:7-alpine     Up (healthy)               6379/tcp
```

主机 curl 健康接口与首页应返回：

```bash
$ curl -fsS http://127.0.0.1:8080/health
{"status":"ok","version":"1.2.0"}
$ curl -fsS http://127.0.0.1:8080/
{"message":"hello from mysite","version":"1.2.0"}
```

蓝绿脚本跑成功时，输出的关键行应是：

```text
当前线上颜色：main，部署到闲置颜色：blue，新版本：1.3.0
闲置颜色容器：a1b2c3d4e5f6，等待健康检查通过
{"status":"ok","version":"1.3.0"}
蓝绿切换完成，当前线上颜色：blue
```

切换后再 curl 首页，版本号应已变成 `1.3.0`；再跑一次脚本（不传版本号时默认还是 1.3.0，实际使用时应传新版本号），线上颜色会切到 `green`。滚动部署完成后 `docker compose ps` 应看到两个应用容器都是新版本，curl 首页的版本号也是新版本。

## 14. 成功验证

读者在自己服务器上按下面清单逐项验证，全部通过才算部署成功：

1. `docker compose ps`：四个服务都是 `running`，`app`、`db`、`cache` 都是 `healthy`，不是 `starting` 也不是 `unhealthy`。
2. `curl -fsS http://127.0.0.1:8080/health` 返回 `{"status":"ok"}`，且版本号与当前部署的版本一致。
3. `curl -fsS http://127.0.0.1:8080/` 返回欢迎内容，版本号正确。
4. 从别的机器（或手机）访问 `http://服务器IP:8080/` 能打开，确认端口映射与防火墙都没拦住。
5. 停掉应用容器再看一次：`docker stop mysite-app-1`（容器名以 `docker compose ps` 为准），等几秒后 `docker compose ps` 里应用应自动回到 `running`，这是重启策略在起作用；验证完后确认应用确实恢复了，不要留一个停掉的容器不管。
6. 蓝绿演练：在测试环境先跑一次 `./blue-green.sh`，确认切换后版本号变了、旧颜色容器已被删除、`.live` 文件里的颜色也变了。
7. 回滚演练：在测试环境故意传一个不存在的版本号或停掉闲置颜色的健康接口，确认脚本会停掉闲置颜色、不切流量、线上版本不变。
8. 数据验证：进数据库容器看一眼数据还在：`docker exec mysite-db psql -U mysite -d mysite -c '\dt'` 应列出表（本篇示例应用本身不建表，实际项目里这里应列出应用的表）；删掉应用容器再重建，数据不能丢，这是卷在起作用。

如实说明：本篇的第 13 节输出没有在本机跑过 `docker build` 与 `docker compose up` 验证，原因是本机 Docker 容器无法实际运行（VM 没有命名空间挂载权限，容器起不来），所以第 13 节的输出明确标注为示例输出。上面的第 14 节清单就是读者在自己服务器上验证的步骤，验证时以自己服务器的真实输出为准。

## 15. 常见错误

| 错误现象 | 原因 | 正确做法 |
| --- | --- | --- |
| `docker compose up` 报应用镜像找不到 | 第一次没加 `--build`，本地根本没有构建好的镜像 | 第一次用 `docker compose up -d --build` |
| 应用容器一启动就退出，日志报连不上数据库 | 应用写的主机名是 `127.0.0.1`，在容器里指的是自己 | 主机名写服务名 `db`，见第 6.2 节 |
| 应用健康检查一直 `unhealthy` | 应用监听的是 `127.0.0.1`，健康检查从容器外连不进来 | `server.js` 监听 `0.0.0.0`，见第 10.2 节 |
| `--scale app=2` 报错说容器名冲突 | 给 app 服务写了 `container_name`，扩副本时两个容器抢同一个名字 | app 服务不要写 `container_name`，见第 12 节 |
| 蓝绿脚本切完流量还是旧版本 | Nginx 上游换了但没 `reload`，Nginx 缓存着旧 IP | 每次换上游文件后都要 `nginx -t` 与 `nginx -s reload` |
| 蓝绿清理时用了 `down` 导致网络报错 | `down` 会尝试删除共用的固定名字网络 | 颜色项目清理用 `stop` 加 `rm -f`，不要用 `down` |
| 换版本后数据库连不上 | 新版本改了连接串格式或口令，但 `.env` 没跟着换 | 先对齐 `.env` 与新版本的连接串，再部署新版本 |
| 镜像越推越大，磁盘很快满了 | 每次构建都留着旧镜像与悬空层，从不清理 | 定期看 `docker system df`，只删确认无用的镜像与缓存，不要删正在用的卷 |
| 把数据库端口映射到了主机 | 照抄了别人的 compose，把 `5432:5432` 写进了 db 服务 | 数据库与缓存不要写 `ports`，只在网络内提供服务 |
| 回滚时发现旧镜像已经被删了 | 一直用 `latest` 标签，新镜像一推就把旧镜像的标签顶掉了 | 用不可变版本号标签（`1.2.0`、`1.3.0`），见第 18 节 |
| 密钥进了镜像 | `COPY . .` 时没写 `.dockerignore`，`.env` 被打进了镜像 | 写好 `.dockerignore`，并把 `.env` 排除在外，见第 11.4 节 |
| 用 `docker-compose`（横杠）报命令找不到 | 装的是 Compose v2 插件，命令是 `docker compose`（空格） | 一律用 `docker compose`，不要混用 v1 写法 |

## 16. 故障排查

按“先看状态、再看日志、最后看配置”的顺序排障，不要一上来就重建整个平台：

1. 看状态：`docker compose ps`，哪个服务不是 `running` 或不是 `healthy`，就先查哪一个。
2. 看日志：`docker compose logs --tail 100 app`（把 `app` 换成出问题的服务名），日志的第一行报错往往就是根因；`--tail` 是只看最后 100 行，避免被几千行日志淹没。
3. 连不上数据库：先进应用容器看环境变量对不对：`docker exec mysite-app-1 env | grep DATABASE_URL`（容器名以 `ps` 为准），再看数据库容器是不是 `healthy`，最后确认应用写的主机名是 `db` 而不是 `127.0.0.1`。
4. 502 Bad Gateway：先看应用容器是不是 `healthy`，再看 Nginx 上游文件指向的颜色对不对，最后执行一次 `docker exec mysite-web nginx -t` 与 `nginx -s reload`（容器换 IP 后 Nginx 缓存的旧 IP 是常见原因）。
5. 健康检查一直失败：先进容器手动跑一次健康命令，例如进应用容器跑 `node -e` 里那条 `fetch`，看是应用没监听、还是监听地址写错、还是端口不对。
6. 构建时内存不足被杀：看 `dmesg | grep -i oom` 有没有记录，有就是内存不够，先加内存或关掉别的服务再构建，不要反复重试同一个构建。
7. 磁盘满了：`docker system df` 看镜像、容器、卷各占多少；清理时只删悬空镜像与构建缓存，不要删命名卷 `pgdata` 与 `redisdata`，删卷等于删数据库。
8. 端口冲突：`ss -tlnp | grep 8080` 看谁占了 8080，停掉它或把 compose 里的 8080 换成别的端口。
9. 蓝绿脚本健康检查超时：先看闲置颜色容器的日志是不是启动报错，再看是不是新镜像构建失败（`--build` 的输出里找第一条报错），不要直接切流量。
10. 滚动后版本号没变：先看 `APP_VERSION` 环境变量是不是真的改了，再看是不是忘了 `--build`（只改代码不重新构建时，旧镜像还在跑）。

## 17. 安全注意事项

- 应用容器不要用 root 跑：Dockerfile 里写 `USER node`，容器被攻破时破坏范围小；数据库与缓存容器同样不要额外给特权。
- 口令与密钥绝不进镜像：`.dockerignore` 排除 `.env`，Dockerfile 里不写任何真实口令，构建参数里也不传口令；口令只通过 `env_file` 或运行时的环境变量进容器。
- `.env` 文件权限 600，属主是部署用户，且绝不提交到 Git 仓库；备份 `.env` 时也要按密钥对待，不要明文发到聊天记录或工单里。
- 数据库与缓存不要映射端口到主机：本篇的 `db` 与 `cache` 服务没有 `ports` 项，公网扫描不到它们；调试时需要连库就用 `docker exec` 进容器，不要临时把端口映射出来又忘了收回去。
- 不要把 Docker 守护进程的套接字挂进应用容器：`docker.sock` 挂进容器等于把宿主机的 Docker 控制权交给了容器，应用被攻破就等于宿主机被攻破。
- 镜像标签不要用 `latest` 做生产部署：`latest` 的含义随时会变，回滚时找不到旧版本；生产用 `1.2.0` 这样的不可变版本号，见第 18 节。
- 基础镜像要定期更新：`node:22-alpine`、`nginx:1.28-alpine` 这类标签会跟着补丁走，定期重新构建一次才能拿到安全修复；更新前先在测试环境跑一次蓝绿演练，不要直接在生产上换基础镜像。
- 容器日志里不要打出口令与密钥：应用打日志时把连接串里的口令部分脱敏，排障时贴日志先检查一遍有没有密钥。

## 18. 回滚和恢复

### 18.1 镜像标签策略

生产部署只用不可变版本号标签，例如 `mysite-app:1.2.0`、`mysite-app:1.3.0`，不要用 `latest`。每次发布新版本都保留上一个版本的镜像，至少保留最近两个版本，磁盘不够时先扩磁盘再删旧镜像，不要在没有新版本验证通过的情况下删旧镜像。回滚时要回滚到一个明确的版本号，而不是“回滚到上一个 `latest`”，因为 `latest` 指向谁在那一刻是不确定的。

### 18.2 蓝绿回滚

蓝绿回滚是最快的回滚：把 `nginx/upstream.conf` 改回旧颜色，执行 `nginx -t` 与 `nginx -s reload`，流量立刻回到旧版本，整个过程不需要重新构建、不需要重启数据库。回滚后不要马上删掉新颜色的容器，先留着看日志确认新版本到底错在哪，确认完再清理。蓝绿脚本本身在验证失败时就会自动走这条路，见第 10.4 节。

### 18.3 滚动回滚

滚动回滚是把版本号环境变量改回旧版本，再按第 9.5 节的逐个替换办法把容器一个一个换回去。换的过程中同样要保持至少一个旧版本容器在跑，全部换完后再验证一次版本号。滚动回滚比蓝绿慢，因为每个容器都要重新拉起并通过健康检查，所以对停机时间敏感的发布优先用蓝绿。

### 18.4 数据库迁移回滚的红线

这是本篇最重要的一条红线：**删字段、改类型、删表这类破坏性迁移，不能只靠回滚镜像解决。** 镜像回滚只能把代码换回旧版本，数据库结构已经变了，旧代码连上新结构照样会报错。正确的做法是分两步走：

1. 扩张步：先只加新字段（可空）或新表，不删旧字段，旧代码还能跑，新代码开始用新字段。
2. 收缩步：等新版本稳定运行一段时间、确认没有旧版本容器了，再删旧字段。

迁移之前必须先备份数据库（`pg_dump` 或 `mysqldump`，按实际数据库选），备份文件要单独存一份，不要只存在数据库服务器本机。迁移脚本要先在测试环境跑一遍正向与回滚（`down` 迁移），没跑过回滚的迁移不要上生产。回滚数据库时先停应用、恢复备份、再起旧版本应用，顺序不能反：先起旧应用再恢复库，旧应用会在恢复过程中写坏数据。

### 18.5 整个平台挂了怎么恢复

按这个顺序恢复，不要跳步：先 `docker compose ps` 看哪个服务挂了，再看日志定位；应用挂了就重启应用，数据库挂了先看卷还在不在（`docker volume ls` 里应有 `mysite_pgdata`），卷在就重建数据库容器、数据还在；卷被误删时只能从备份恢复，这是最后的手段，平时就要按 DB-02 的备份演练做定期恢复演练。恢复后按第 14 节清单重新验证一遍，版本号与数据都要对上才算恢复完成。

## 19. 延伸阅读

- Docker 官方文档：安装、Dockerfile、Compose 规范（以官网当场公布的内容为准，本篇的版本号与标签示例都要以官网为准）。
- 本指南的服务器章节：SRV-01 的 Nginx、Apache、Caddy 配置模板，SRV-02 的 PHP-FPM 与 systemd 进程管理，部署时与本篇对照着看。
- 本指南的架构章节：ARCH-02 的单体、前后端分离、SSR、SSG、微服务、多站点对照，决定用蓝绿还是滚动之前先看那篇的升级路径。
- 本指南的数据库章节：DB-02 的备份、恢复、迁移、慢查询、主从复制、高可用，迁移回滚的完整演练在那篇。
- 本指南的部署章节：DEPLOY-01 的 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署，DEPLOY-03 的 HTTPS、CDN、域名解析上线全流程。

## 20. 相关章节链接

- 服务器运行环境：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)。
- 架构模式对照：[ARCH-02 单体、前后端分离、SSR、SSG、微服务、多站点架构对比与升级路径](../architecture/02-patterns.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 上一篇：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](./01-cicd.md)。
- 下一篇：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](./03-launch.md)
