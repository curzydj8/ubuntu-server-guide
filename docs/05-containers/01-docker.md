---
description: "Docker 基础与进阶：在 Ubuntu Server 上安装 Docker Engine、配置镜像加速、用 Docker Compose 编排多容器应用并优化镜像体积与构建流程。"
---

# Docker 基础与进阶

!!! tip "一键脚本（先审后跑）"

    本章安装流程已整理为脚本 [install-docker.sh](../scripts/install-docker.sh)，一行安装（需要 sudo）：

    ```bash
    curl -sSL https://curzydj8.github.io/ubuntu-server-guide/scripts/install-docker.sh | sudo bash
    ```

    强烈建议先下载到本地审阅内容再执行，不要对任何远程脚本盲目使用管道执行。

## 一、概述与使用场景

Docker 是当前应用最广的容器运行时管理工具。它把应用程序、运行库和配置文件打包成镜像，镜像在任何安装了 Docker Engine 的主机上都能以一致的方式运行，从根本上解决了开发环境正常、生产环境报错这类环境不一致问题。

典型使用场景包括：单机部署 Web 服务、数据库、缓存和反向代理等成套应用；为开发和测试提供一次构建、处处运行的可复现环境；把老旧应用连同依赖一起封装，降低迁移成本；配合持续集成流水线完成自动构建和发布。

不使用容器而直接在宿主机上堆装软件，会带来几个现实风险。第一是依赖冲突，两个应用要求同一运行库的不同版本时很难共存。第二是污染宿主机，卸载不干净会留下大量残留文件。第三是扩容和迁移困难，新机器要靠人工文档一步步重装，极易漏项。第四是故障影响面大，一个应用把系统资源耗尽会拖垮同机其他服务。用容器加资源限制和隔离，可以把这些风险控制在单个容器范围内。

## 二、环境准备与前置条件

本章命令适用于 Ubuntu 22.04 LTS 和 Ubuntu 24.04 LTS，架构为 x86_64 或 arm64 均可。操作账号需要 sudo 权限，示例统一使用 ubuntu 用户。建议硬件下限为 2 核 CPU、4 GB 内存、20 GB 可用磁盘，镜像和容器数据默认存放在 /var/lib/docker，磁盘不足会直接导致容器启动失败。

开始前先更新系统并确认版本：

```bash
lsb_release -a
uname -m
sudo apt update
sudo apt upgrade -y
```

如果机器上装过 Ubuntu 仓库自带的旧版 docker.io 或 podman 等冲突包，先卸载，避免和官方源的包互相覆盖。卸载旧包不会删除已有的镜像和容器数据，但生产机器操作前请先做好备份。

```bash
sudo apt remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc
```

!!! warning "不要混用安装来源"

    同一台机器上只能选一种安装来源。要么用 Ubuntu 官方仓库的 docker.io，要么用 Docker 官方 apt 源，不要来回切换。本章统一使用 Docker 官方 apt 源，原因是版本更新及时，Docker Engine、Buildx 和 Compose 插件能保持配套。已经用仓库包在跑生产服务的机器，不要直接按本章切换来源，先在测试机验证。

## 三、手把手操作步骤

### 3.1 使用官方 apt 源安装 Docker Engine

第一步安装证书和下载工具，并添加 Docker 官方 GPG 密钥：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

第二步写入官方 apt 源文件。下面命令会自动读取系统代号，22.04 对应 jammy，24.04 对应 noble，无需手工填写：

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
```

第三步安装 Engine 本体和常用插件：

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

各包作用说明如下：

| 包名 | 作用 |
| --- | --- |
| docker-ce | Docker Engine 守护进程，负责管理镜像、容器和网络 |
| docker-ce-cli | docker 命令行客户端 |
| containerd.io | 底层容器运行时，负责真正拉起容器进程 |
| docker-buildx-plugin | 新一代镜像构建工具，支持多阶段和多架构构建 |
| docker-compose-plugin | Compose V2 插件，提供 docker compose 子命令 |

!!! note "Compose V1 与 V2 的区别"

    老版本的命令是独立的 docker-compose，中间是连字符；新版本是 docker compose，中间是空格，作为插件集成在 CLI 里。本章统一使用 docker compose 写法。如果你在网上看到连字符写法，那是 V1 的旧教程，功能大体相同，但 V1 已经停止维护，新部署不要再装 V1。

### 3.2 用户组与权限配置

Docker 守护进程默认只允许 root 和 docker 组用户访问。把当前用户加入 docker 组后，可以免 sudo 使用 docker 命令：

```bash
sudo usermod -aG docker ubuntu
newgrp docker
id
docker run hello-world
```

!!! warning "docker 组等同于 root 权限"

    能访问 Docker 守护进程的用户，可以通过挂载宿主机根目录的方式拿到 root 权限，所以 docker 组的权限级别非常高。生产服务器上只把可信的运维账号加入该组，普通业务账号不要加入。安全要求高的场景请使用 sudo 逐条授权，或改用第 2 章的 Podman 无根容器。

如需调整守护进程参数，例如修改日志大小上限，先备份原配置文件再编辑。配置文件路径为 /etc/docker/daemon.json，默认可能不存在，不存在时直接新建即可：

```bash
sudo mkdir -p /etc/docker
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak 2>/dev/null || echo "原文件不存在，跳过备份"
sudo nano /etc/docker/daemon.json
```

写入以下完整内容，限制单个容器日志文件大小和保留份数，防止日志把磁盘写满：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

保存后重启服务使配置生效：

```bash
sudo systemctl restart docker
```

### 3.3 常用命令速查

镜像相关命令：

```bash
docker pull nginx:alpine
docker images
docker tag nginx:alpine registry.example.com/library/nginx:alpine
docker rmi nginx:alpine
```

容器相关命令：

```bash
docker run -d --name webdemo -p 8080:80 --restart unless-stopped nginx:alpine
docker ps
docker ps -a
docker logs webdemo
docker logs -f --tail 100 webdemo
docker exec -it webdemo sh
docker stop webdemo
docker start webdemo
docker restart webdemo
docker rm webdemo
docker stats --no-stream
```

关键参数讲解：

| 参数 | 含义 |
| --- | --- |
| -d | 后台运行容器 |
| --name | 给容器指定固定名称，后续命令用名称代替 ID |
| -p 8080:80 | 把宿主机 8080 端口映射到容器 80 端口 |
| -e KEY=value | 注入环境变量 |
| -v /srv/data:/data | 把宿主机目录挂载为容器内目录，数据持久化 |
| --restart unless-stopped | 宿主机重启或容器异常退出时自动拉起，人工停止后不再拉起 |
| --memory 512m | 限制容器最多使用 512 MB 内存 |
| --cpus 1.5 | 限制容器最多使用 1.5 核 CPU |

网络与数据卷命令：

```bash
docker network ls
docker network create appnet
docker volume ls
docker volume create appdata
```

### 3.4 Docker Compose 编排实战

单个容器用 docker run 就够了，但真实应用往往由 Web、数据库、缓存多个容器组成，靠手工逐个 run 既容易写错参数，也无法一键启停。Compose 用一个 YAML 文件声明全部服务、网络和数据卷，一条命令完成整套部署。

下面给出一个完整可用的示例：Nginx 反向代理加 Node 应用加 PostgreSQL 加 Redis。先创建项目目录和所需文件：

```bash
mkdir -p /srv/demoapp/html
cd /srv/demoapp
cat > html/index.html <<'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>demoapp</title></head>
<body><h1>demoapp is running</h1></body>
</html>
EOF
nano compose.yaml
```

compose.yaml 完整内容如下，不要删减任何一行：

```yaml
services:
  proxy:
    image: nginx:alpine
    container_name: demo-proxy
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - frontend
  app:
    image: node:alpine
    container_name: demo-app
    working_dir: /code
    command: node -e "const http=require('http');http.createServer((req,res)=>{res.end('hello from app\n')}).listen(3000)"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - REDIS_HOST=cache
    expose:
      - "3000"
    depends_on:
      - db
      - cache
    restart: unless-stopped
    networks:
      - frontend
      - backend
  db:
    image: postgres:alpine
    container_name: demo-db
    environment:
      - POSTGRES_USER=appuser
      - POSTGRES_PASSWORD=ChangeMe-Example-Password-123
      - POSTGRES_DB=appdb
    volumes:
      - dbdata:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - backend
  cache:
    image: redis:alpine
    container_name: demo-cache
    command: redis-server --appendonly yes
    volumes:
      - cachedata:/data
    restart: unless-stopped
    networks:
      - backend
volumes:
  dbdata:
  cachedata:
networks:
  frontend:
  backend:
```

这份配置的设计要点：proxy 是唯一对外暴露端口的服务，app 只通过 expose 在容器网络内提供 3000 端口，db 和 cache 完全不映射宿主机端口，外部无法直连数据库；frontend 和 backend 两张网络做了隔离，proxy 无法直接访问数据库；数据库密码在这里仅为示例占位值，真实部署必须换成强口令并改用权限为 600 的环境变量文件管理，不要把真实口令写进会提交到代码仓库的文件。

常用 Compose 命令：

```bash
cd /srv/demoapp
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f proxy
docker compose exec db psql -U appuser -d appdb -c "SELECT 1;"
docker compose down
docker compose down -v
```

### 3.5 镜像优化

镜像过大、构建过慢是新手最常见的问题，优化抓住三点：多阶段构建、.dockerignore、层缓存。

多阶段构建的思路是：第一阶段用带完整工具链的镜像编译，第二阶段只拷贝编译产物到精简运行镜像，最终镜像不包含源码和编译工具。下面是一个 Go 程序的完整 Dockerfile 示例，其他语言同理，把构建命令换成对应语言的命令即可：

```dockerfile
FROM golang:alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/server /app/server
USER nobody
EXPOSE 8080
ENTRYPOINT ["/app/server"]
```

.dockerignore 与 .gitignore 作用类似，写明不进入构建上下文的文件，能显著加快构建并避免把无关文件打进镜像。在项目根目录创建完整内容如下：

```text
.git
.gitignore
node_modules
dist
*.log
.env
.idea
.vscode
Dockerfile
compose.yaml
README.md
```

层缓存的规则是：Dockerfile 从上到下逐层构建，某一层内容变了，它和它之后的层全部重建。因此要把变动少的步骤放前面，变动多的放后面，例如先装系统依赖、再装语言依赖、最后拷贝业务代码。修改频率最高的源码拷贝语句永远放在文件后部。

构建和查看体积：

```bash
cd /srv/demoapp
docker build -t demoapp:1.0 .
docker images demoapp
```

### 3.6 日志与清理

查看日志常用命令：

```bash
docker logs --tail 200 demo-app
docker logs --since 1h demo-app
docker compose -f /srv/demoapp/compose.yaml logs --tail 200
```

磁盘占用检查和清理命令：

```bash
docker system df
docker container prune -f
docker image prune -f
docker image prune -a -f
docker volume prune -f
docker system prune -f
```

!!! warning "清理命令会删数据"

## 四、效果验证与测试

逐项执行下面命令并对照期望结果：

```bash
docker version
docker info
docker run hello-world
curl -s http://127.0.0.1:8080/
docker compose -f /srv/demoapp/compose.yaml ps
```

期望输出关键片段：docker version 同时显示 Client 和 Server 两段版本号，说明客户端和守护进程都正常；docker run hello-world 输出包含 Hello from Docker 一行，说明拉取镜像、创建容器、网络出站全链路通畅；curl 访问 8080 端口返回 demoapp is running 页面内容，说明 Compose 的 proxy 服务端口映射生效；docker compose ps 中四个服务状态均为 Up 或 running，其中 db 显示 healthy 或 Up 均可接受。再执行 docker restart demo-db 后用 docker ps 查看，容器回到运行状态即验证全部通过。

## 五、常见错误与排坑指南

场景一：启动容器报端口占用。报错原文片段如下：

```text
Error response from daemon: driver failed programming external connectivity on endpoint webdemo: Bind for 0.0.0.0:8080 failed: port is already allocated
```

原因是宿主机 8080 端口已被其他进程或旧容器占用。修复方法是先查占用者，再决定停掉旧进程还是换一个映射端口：

```bash
sudo ss -tlnp | grep 8080
docker ps -a
sudo systemctl status nginx --no-pager
```

场景二：普通用户执行 docker 命令报权限拒绝。报错原文片段如下：

```text
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
```

原因是当前用户不在 docker 组，或加入组后还没有重新登录。修复命令：

```bash
sudo usermod -aG docker ubuntu
exit
docker ps
```

重新用 ubuntu 用户登录后再执行 docker ps，能正常输出即修复。临时验证也可以先用 sudo docker ps 确认守护进程本身是好的，以此区分是权限问题还是服务问题。

场景三：拉取镜像超时或失败。报错原文片段如下：

```text
Error response from daemon: Get "https://registry-1.docker.io/v2/": dial tcp: i/o timeout
```

原因是服务器访问 Docker Hub 的网络不通或 DNS 解析异常。先做连通性排查，不要盲目反复重试：

```bash
ping -c 3 registry-1.docker.io
curl -I https://registry-1.docker.io/v2/
cat /etc/resolv.conf
```

确认是外网出口问题后，改走单位统一的代理出口或合规的镜像加速服务，并在 /etc/docker/daemon.json 变更前先备份。改完配置执行 sudo systemctl restart docker 再重新拉取。注意不要使用来历不明的第三方镜像站托管生产镜像，存在供应链风险。

## 六、生产环境最佳实践与安全建议

第一，镜像必须固定版本标签，不要在生产环境使用 latest。固定到具体版本例如 nginx:1.27-alpine 这种写法，才能保证每次部署拉到的内容一致、可回滚。本章前面为了演示构建流程出现的 alpine:latest 只适合本地实验，生产 Dockerfile 请同样改成明确版本号。

第二，容器尽量以非 root 用户运行，能在 Dockerfile 里加 USER 指令的就加上；确实需要 root 的容器，要在风险评估里写明原因。同时给每个容器设置 CPU 和内存上限，防止单个容器耗尽宿主机资源。

第三，口令和密钥不要写死在镜像和 compose.yaml 里。用独立的环境变量文件并把权限设为 600，或接入专门的密钥管理工具；代码仓库里只提交不含真实值的示例文件。

第四，定期更新基础镜像并扫描漏洞，及时清理无用镜像和停止的容器，但清理动作要先看清单再执行。宿主机层面保持 Docker 只监听本机套接字，不要把 2375 明文端口暴露到网络上，确需远程管理时使用 SSH 跳转或带证书的 2376 端口。

第五，做好日志上限和磁盘监控。按本章 daemon.json 的做法给日志设上限，并对 /var/lib/docker 所在分区设置磁盘告警，阈值建议设在 80 percent，避免磁盘写满导致全部容器异常。

第六，重要数据必须落在数据卷或宿主机绑定目录上，并纳入宿主机统一备份。容器本身是随时可删可重建的，任何只存在于容器可写层里的数据都视为不可靠数据。
