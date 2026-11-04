# SRV-01：Nginx、Apache、Caddy 完整配置与多站点完整教程

> 任务编号：SRV-01（网站建设与部署实战指南 · 服务器第 1 篇）
> 上一篇：[API-01 REST、GraphQL、WebSocket、OAuth、JWT](../api/01-integration.md)；下一篇：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](./02-runtime.md)。
> 本篇只补模板与缺口：同一站点需求的 Nginx、Apache、Caddy 三种完整配置对照、多站点配置模板、反向代理与静态分流的完整模板。不从头再讲一遍 09-web-hosting 已讲过的 Nginx 基础，不讲 PHP-FPM 与 systemd（那是 SRV-02），不讲部署流水线（DEPLOY 篇）。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

- 说清本篇与 09-web-hosting 的分工，知道某个问题该去哪一篇查，而不是两边都翻一遍。
- 照着第 10 节，用 Nginx、Apache、Caddy 中任意一种，把“静态站 + API 反向代理 + 多站点”这套需求完整配出来。
- 说出同一条规则在三种服务器里的对应写法，换服务器时能把配置翻译过去，而不是从零重写。
- 给多站点做通配符与分站点两种配置，并说清各自的适用场景与风险。
- 按第 14 节的步骤验证站点确实通了，出问题时按第 16 节定位到配置层、后端层还是解析层。

### 1.1 本篇与 09-web-hosting 的分工（先读这一节，再决定去哪查）

09-web-hosting 是“从零把网站跑起来”的主线，本篇是它的模板补充篇，不重复主线内容：

| 内容 | 09-web-hosting 已讲 | 本篇补什么 |
| --- | --- | --- |
| 域名解析 | `01-dns-resolution.md`：解析链路、记录类型、三大平台配置、Cloudflare 代理后真实 IP 还原 | 不讲，只在第 8 节列为前置检查 |
| 面板路线 | `02-baota-panel.md`：宝塔安装与安全加固 | 不讲，面板生成的配置以面板界面为准，不要手工改了又被面板覆盖 |
| LNMP/LAMP 安装与单站点 | `03-lnmp-lamp.md`：Nginx 或 Apache + MySQL + PHP 手工安装、单站点 Nginx 配置（`server_name`、`root`、`try_files`、PHP 位置块、`.ht` 拒绝块）、Apache 站点配置、启用与重载、回滚 | 不重复单站点基础写法，只做三点补充：三种服务器的**完整对照模板**、**多站点**模板、**反向代理与静态分流**模板 |
| Docker 应用 | `04-docker-apps.md`：容器跑现成应用 | 不讲，容器应用的反向代理入口仍可用本篇模板 |
| HTTPS 证书 | `05-https-certificates.md`：Certbot 与 acme.sh 两条签发与自动续期路线 | 不重复签发步骤，只在第 11 节给出“证书已签好之后”的 HTTPS 配置写法，签发本身回 09-web-hosting/05 查 |
| 邮件服务器 | `06-mail-server.md`：Postfix + Dovecot 自建邮件 | 不讲，与 Web 服务器配置无关 |
| 反向代理原理 | `04-network/02-web-proxy.md`：为什么需要反向代理、三款软件定位、证书统一入口、域名路由、安全收口 | 不重复原理，只给可直接用的配置 |
| 负载均衡 | `04-network/06-haproxy.md`：多台后端分发、健康检查、连接排空 | 不讲，后端扩到多台、需要主动健康检查时用 HAProxy，不要在本篇模板里硬拼多后端轮询当负载均衡用 |

一句话：09-web-hosting 告诉你“怎么装、怎么跑通第一个站”，本篇告诉你“同一个需求，三种服务器怎么写、多站点怎么写、反代与静态怎么分流”。两边都读过的人，查配置时直接翻本篇第 10 节到第 12 节；只想跑通第一个站的人，先去 09-web-hosting/03，不用先读本篇。

## 2. 适用人群

- 已经按 09-web-hosting/03 跑通过一个单站点，想再加第二个、第三个站点，或者想把 API 后端挂到域名后面的人。
- 正在 Nginx、Apache、Caddy 之间选型，或者接手了一个别人用另一种服务器写的站，需要把配置翻译过去的人。
- 不要求你已经会写后端代码。本篇的后端只用一个“监听本机端口、能返回健康检查”的假设，具体后端写法在 BE 篇；后端还没写好时，先用第 9.4 节的办法证明代理层本身是对的。

## 3. 适用系统和版本

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。两个版本的 Nginx 与 Apache 配置目录结构一致，命令通用；24.04 的 Nginx 默认更严格，只支持 TLS 1.2 与 TLS 1.3，不要把网上旧教程里的弱加密套件照搬进来。
- 版本核查（核查日期 2026-11-03，安装时以当场查到的版本为准）：
  - Nginx：开源稳定版 **1.30.6**（2026-10-14 发布）、主线版 1.31.7（同日发布）。Ubuntu 系统源里的 Nginx 版本通常比官网低，`nginx -v` 看到的就是本机实际版本，配置写法不受小版本影响，安全修复要看发行版的补丁说明，不要只看主版本号下结论。
  - Apache httpd：**2.4.69**（2026-10-01 发布），2.4 分支是当前唯一受支持的分支，2.2 已于 2017 年停止维护。
  - Caddy：**2.11.x 线**，核查时看到的最新公开版本为 2.11.4（2026-06-03）。Caddy 只有一个主线，安装时直接取官网当场公布的版本。
- 示例域名一律用保留域名 `example.com` 及其子域名，示例后端地址一律用 `127.0.0.1:8080`，示例静态目录为 `/var/www/example.com` 与 `/var/www/blog.example.com`。这些都是写法示例，实际操作时换成你自己的域名、端口与目录。

## 4. 使用前提

- 已经有一台 Ubuntu 服务器，能用 sudo 执行命令，防火墙与云安全组已放行 80 与 443。
- 域名解析已经生效：`example.com`、`blog.example.com`、`api.example.com` 的 A 记录指向本机服务器，检查方法见 09-web-hosting/01。解析没生效时配反代没有意义，先查解析。
- 后端应用已经能在本机用 curl 访问（见第 9.4 节），先证明后端活着，再配代理，排障时才能分清是哪一层的问题。
- 同一台机器上，Nginx、Apache、Caddy **三者只选其一监听 80 与 443**，不要同时启用抢端口。选好之后，另外两个不要启动，否则第 15 节的端口冲突会立刻出现。

## 5. 所需资源

- 一台服务器，一组域名（一个主域名加两个子域名，或一个通配符域名，见第 7.3 节）。
- 一个静态站点目录和一个后端应用（后端语言不限，只要监听本机端口并能响应 HTTP 请求）。
- 文本编辑器（`nano` 即可）、`curl`、`systemctl`，以及第 9 节里对应服务器的语法检查命令。

## 6. 技术原理

### 6.1 一次请求经过了什么

浏览器访问 `https://example.com/` 时，链路是：DNS 解析出服务器 IP → 与服务器 443 端口建立 TLS 连接（Caddy 是自动完成这一步，Nginx 与 Apache 需要你配好证书路径）→ 服务器按域名（`server_name` / `ServerName` / Caddyfile 里的地址）选中虚拟主机 → 按路径分流：静态路径直接读磁盘文件返回，`/api/` 路径转发给本机后端 → 后端返回响应，代理原样带回给浏览器。

### 6.2 虚拟主机：一个 IP 上跑多个站点的关键

虚拟主机不是虚拟机，是“按域名分流”的配置机制：服务器监听同一个 80/443 端口，收到请求后先看请求头里的域名（HTTP 的 `Host` 头，HTTPS 还要看 TLS 握手里的 SNI），再决定交给哪个站点的配置。没有匹配的域名时，Nginx 交给 `default_server`，Apache 交给第一个虚拟主机，Caddy 返回 404 或按通配符匹配——所以多站点配置里一定要想清楚“没匹配上时交给谁”，不要让陌生域名意外落到你的主站上。

### 6.3 静态与反代的分流原则

静态文件（HTML、CSS、JS、图片）由 Web 服务器直接读磁盘发出去最快，不经过后端；动态接口（`/api/`）才转发给后端。分流写在路径规则里：`/` 走静态，`/api/` 走反代。反代时必须把原始信息带给后端：`Host`（后端靠它认域名）、`X-Real-IP` 与 `X-Forwarded-For`（后端靠它认真实访客 IP，见 09-web-hosting/01 的 Cloudflare 真实 IP 一节，原理相同）、`X-Forwarded-Proto`（后端靠它知道访客用的是 http 还是 https，避免生成错误的跳转链接）。

### 6.4 三种服务器的定位（引用 04-network/02-web-proxy.md 的结论，不重讲）

| 服务器 | 定位 | 配置风格 | 证书 |
| --- | --- | --- | --- |
| Nginx | 事件驱动、资源占用低，反向代理的首选，也是本指南的主线 | 声明式块结构，`server` + `location` | 靠 Certbot 或 acme.sh 签发，见 09-web-hosting/05 |
| Apache | 模块丰富、`.htaccess` 灵活，老牌站点和需要特定模块时仍有价值 | `<VirtualHost>` + 指令，模块按需加载 | 靠 Certbot（`mod_md` 也可自动管理，见第 11.4 节） |
| Caddy | 配置最短，适合小团队快速上线 | Caddyfile，一行地址加若干指令 | **自动 HTTPS**：默认自动签发与续期，不需要 Certbot |

## 7. 架构说明

### 7.1 本篇的示例需求（第 10 节三个配置共用的同一份需求）

- `example.com`：静态主站，目录 `/var/www/example.com`，首页 `index.html`。
- `blog.example.com`：静态博客站，目录 `/var/www/blog.example.com`。
- `api.example.com`：反向代理到本机后端 `127.0.0.1:8080`，后端提供 `/health` 健康检查路径，正常时返回 HTTP 200。
- 日志按站点拆分，错误日志与访问日志分开，见第 12 节。

### 7.2 请求分流图（文字表，不是 mermaid）

| 访客请求 | 命中规则 | 交给谁 |
| --- | --- | --- |
| `example.com/` | 静态站点根 | 读 `/var/www/example.com/index.html` |
| `example.com/assets/style.css` | 静态文件 | 直接返回磁盘文件，带缓存头（见第 12 节） |
| `blog.example.com/` | 第二个虚拟主机 | 读 `/var/www/blog.example.com/index.html` |
| `api.example.com/health` | 反代站点 | 转发到 `127.0.0.1:8080/health` |
| `api.example.com/users` | 反代站点 | 转发到 `127.0.0.1:8080/users`，原样带回响应 |
| 未知域名，如 `other.example.com` | 无匹配虚拟主机 | Nginx 交给 `default_server`（第 10.1 节配了一个只返回 444 的默认站），Apache 交给第一个虚拟主机（所以第一个虚拟主机要写成拒绝站，见第 10.2 节），Caddy 无匹配时返回 404 |

### 7.3 多站点的两种写法：分站点与通配符

- **分站点**：每个域名写一个独立的虚拟主机，配置长，但每个站的日志、证书、规则互不干扰，出了问题只影响一个站，新手与生产环境优先用这种。
- **通配符**：一个虚拟主机配 `*.example.com`（Nginx 的 `server_name *.example.com`、Apache 的 `ServerAlias *.example.com`、Caddy 的 `*.example.com`），所有子域名走同一套规则，再靠程序按域名区分内容。配置短，但证书必须是通配符证书（DNS-01 验证，见 09-web-hosting/05），且一个站出问题可能影响全部子域名，只在子域名很多、内容规则完全一致时用。
- 本篇第 10 节用分站点写法（三个独立虚拟主机），第 11.5 节再给通配符的 Nginx 写法，两者不要混在一个文件里：同一个域名既出现在分站点配置里又被通配符覆盖时，匹配优先级会让人查半天。

### 7.4 与 HAProxy 的分工

本篇模板里的反代目标是**一台本机后端**。后端扩到多台、需要主动健康检查、故障自动摘除、维护时连接排空时，那是 04-network/06-haproxy.md 的 HAProxy 层，不要在本篇模板里硬拼多后端轮询当负载均衡用。分工一句话：单机发布网站用本篇，入口要管多台后端集群用 HAProxy。

## 8. 操作前检查

动手前先跑完下面四项，任何一项不过都先修好再配：

```bash
sudo systemctl status nginx apache2 caddy --no-pager 2>/dev/null | head -n 40
ss -tlnp | grep -E ':80|:443' || echo "80/443 当前无人监听"
dig +short example.com A
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/health
```

- 第一行看当前是谁在跑：只能留一个 Web 服务器在运行，另外两个要停掉并禁用自启，否则 80 端口冲突。
- 第二行确认 80/443 是否已被占用；已被占用时先查清是谁（`ss -tlnp` 会显示进程名），不要直接杀掉不认识的进程。
- 第三行确认解析已生效；返回空或错误 IP 时先去 09-web-hosting/01 查解析，不要继续配。
- 第四行确认后端健康检查返回 200；返回 000 或非 200 时先修后端，再配代理。

改任何配置前先备份，这是第 18 节所有回滚动作的前提：

```bash
sudo cp -a /etc/nginx/sites-available /root/nginx-sites.bak-$(date +%F)
sudo cp -a /etc/apache2/sites-available /root/apache-sites.bak-$(date +%F)
sudo cp -a /etc/caddy/Caddyfile /root/Caddyfile.bak-$(date +%F) 2>/dev/null || echo "Caddy 未安装，跳过"
ls /root/*.bak-* /root/Caddyfile.bak-* 2>/dev/null
```

## 9. 逐步操作

### 9.1 三选一安装（只装你选的那一个）

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

```bash
sudo apt update
sudo apt install -y apache2
sudo systemctl enable --now apache2
```

Caddy 不在 Ubuntu 默认源里，按官网仓库安装（安装命令以 Caddy 官网当场公布的为准，下面是 Debian/Ubuntu 系的常规写法，仓库地址变了就以官网为准）：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo systemctl enable --now caddy
```

### 9.2 准备静态目录与测试页

```bash
sudo mkdir -p /var/www/example.com /var/www/blog.example.com
sudo tee /var/www/example.com/index.html > /dev/null <<'EOF'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>主站</title></head>
<body><h1>主站已通</h1></body>
</html>
EOF
sudo tee /var/www/blog.example.com/index.html > /dev/null <<'EOF'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>博客站</title></head>
<body><h1>博客站已通</h1></body>
</html>
EOF
sudo chown -R www-data:www-data /var/www/example.com /var/www/blog.example.com
```

### 9.3 写配置、检查语法、启用、重载（各服务器的命令对照）

| 步骤 | Nginx | Apache | Caddy |
| --- | --- | --- | --- |
| 配置放哪里 | `/etc/nginx/sites-available/` 下每个站点一个文件 | `/etc/apache2/sites-available/` 下每个站点一个 `.conf` 文件 | `/etc/caddy/Caddyfile` 一个文件写全部站点 |
| 启用站点 | `ln -s` 到 `sites-enabled/` | `a2ensite 站点名` | 不需要启用步骤，改 Caddyfile 即生效 |
| 语法检查 | `sudo nginx -t` | `sudo apachectl configtest` | `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` |
| 生效 | `sudo systemctl reload nginx` | `sudo systemctl reload apache2` | `sudo systemctl reload caddy` |
| 看完整生效配置 | `sudo nginx -T` | `sudo apachectl -S`（看虚拟主机匹配顺序） | `sudo caddy adapt --config /etc/caddy/Caddyfile`（看转成的 JSON） |

### 9.4 后端还没写好时的代理层自测办法

后端没写好不代表代理层测不了：先在本机起一个最简单的占位后端，证明代理通了，再换成真实后端：

```bash
python3 -m http.server 8080 --bind 127.0.0.1 &
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
curl -s http://127.0.0.1:8080/ | head -n 3
```

占位后端返回 200 后，再按第 14 节从域名走一遍反代；域名反代也通了，代理层就证明完了，之后后端换成真实应用时只要本机端口不变，代理配置不用动。测完记得把占位进程停掉，不要让它长期占着 8080 端口。

## 10. 完整代码（同一需求，三种完整写法）

下面三份配置实现的是第 7.1 节的同一份需求，任选其一使用，不要三份同时启用。域名、端口、目录都是示例值，实际使用时换成你自己的值。反面写法只出现在第 15 节的表格与行内代码里，下面三份都是正确配置。

### 10.1 Nginx 完整配置

存放路径：`/etc/nginx/sites-available/example.com`（主站与博客站可拆成两个文件，这里为对照方便写在一个文件里，拆开时每个文件保留自己的 `server` 块即可）。启用后执行 `sudo nginx -t` 再 `sudo systemctl reload nginx`。

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    access_log /var/log/nginx/default-access.log;
    error_log /var/log/nginx/default-error.log;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/example.com;
    index index.html;
    access_log /var/log/nginx/example-access.log;
    error_log /var/log/nginx/example-error.log;
    location / {
        try_files $uri $uri/ =404;
    }
    location /assets/ {
        expires 7d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }
    location ~ /\. {
        deny all;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name blog.example.com;
    root /var/www/blog.example.com;
    index index.html;
    access_log /var/log/nginx/blog-access.log;
    error_log /var/log/nginx/blog-error.log;
    location / {
        try_files $uri $uri/ =404;
    }
    location ~ /\. {
        deny all;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;
    access_log /var/log/nginx/api-access.log;
    error_log /var/log/nginx/api-error.log;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

### 10.2 Apache 完整配置

存放路径：`/etc/apache2/sites-available/example.com.conf`（三个虚拟主机写在一个文件里，拆开时每个文件保留自己的 `<VirtualHost>` 块）。启用前先加载模块并启用站点，再检查语法后重载：

```bash
sudo a2enmod proxy proxy_http headers
sudo a2ensite example.com.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

```apache
<VirtualHost *:80>
    ServerName unknown.example.com
    DocumentRoot /var/www/html
    <Directory /var/www/html>
        Require all denied
    </Directory>
    ErrorLog ${APACHE_LOG_DIR}/default-error.log
    CustomLog ${APACHE_LOG_DIR}/default-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName example.com
    ServerAlias www.example.com
    DocumentRoot /var/www/example.com
    DirectoryIndex index.html
    <Directory /var/www/example.com>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    <Location /assets/>
        Header set Cache-Control "public, max-age=604800"
    </Location>
    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>
    ErrorLog ${APACHE_LOG_DIR}/example-error.log
    CustomLog ${APACHE_LOG_DIR}/example-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName blog.example.com
    DocumentRoot /var/www/blog.example.com
    DirectoryIndex index.html
    <Directory /var/www/blog.example.com>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>
    ErrorLog ${APACHE_LOG_DIR}/blog-error.log
    CustomLog ${APACHE_LOG_DIR}/blog-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName api.example.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
    ProxyTimeout 60
    ErrorLog ${APACHE_LOG_DIR}/api-error.log
    CustomLog ${APACHE_LOG_DIR}/api-access.log combined
</VirtualHost>
```

注意 Apache 的匹配规则：第一个虚拟主机就是默认主机，所以第一个写的是拒绝站（`unknown.example.com` 加 `Require all denied`），陌生域名落到它上面会被拒绝，而不是落到主站上。不要把主站写在第一个，否则陌生域名会意外打开主站。

### 10.3 Caddy 完整配置

存放路径：`/etc/caddy/Caddyfile`。Caddy 不需要启用站点步骤，改完 Caddyfile 后执行 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 再 `sudo systemctl reload caddy`。HTTP 版本的 Caddyfile 如下（HTTPS 版本见第 11.3 节，Caddy 默认就是自动 HTTPS，这里先写 HTTP 版是为了与上面两份对照，生产直接用第 11.3 节的写法）：

```caddy
http://example.com, http://www.example.com {
    root * /var/www/example.com
    file_server
    log {
        output file /var/log/caddy/example-access.log
        format json
    }
    @hidden path_regexp ^/\.
    handle @hidden {
        respond "Forbidden" 403
    }
}

http://blog.example.com {
    root * /var/www/blog.example.com
    file_server
    log {
        output file /var/log/caddy/blog-access.log
        format json
    }
}

http://api.example.com {
    reverse_proxy 127.0.0.1:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    log {
        output file /var/log/caddy/api-access.log
        format json
    }
}
```

Caddy 的写法特点：地址本身就是域名，`http://` 前缀表示这一个站点只走 HTTP；`file_server` 相当于 Nginx 的静态 `location /` 加 `try_files`；`reverse_proxy` 默认就会带 `X-Forwarded-For` 与 `X-Forwarded-Proto`，上面显式写出的 `header_up` 是为了与 Nginx、Apache 的对照表对齐，告诉你这几个头是从哪里来的，删掉它们 Caddy 也会自己带。

## 11. 完整配置文件（存放路径与 HTTPS 版本）

### 11.1 文件清单（本篇涉及的全部文件，一处不漏）

| 文件 | 用途 | 哪个服务器 |
| --- | --- | --- |
| `/etc/nginx/sites-available/example.com` | 第 10.1 节的四个 `server` 块 | Nginx |
| `/etc/nginx/sites-enabled/example.com` | 指向上一行的符号链接，Nginx 只读启用目录 | Nginx |
| `/etc/apache2/sites-available/example.com.conf` | 第 10.2 节的四个虚拟主机 | Apache |
| `/etc/apache2/sites-enabled/example.com.conf` | `a2ensite` 生成的符号链接 | Apache |
| `/etc/caddy/Caddyfile` | 第 10.3 节的三个站点块 | Caddy |
| `/var/www/example.com/index.html`、`/var/www/blog.example.com/index.html` | 静态测试页，第 9.2 节已建好 | 三者共用 |
| `/etc/letsencrypt/live/example.com/fullchain.pem`、`/etc/letsencrypt/live/example.com/privkey.pem` | 证书与私钥，签发方法见 09-web-hosting/05，路径换成你自己的域名 | Nginx、Apache |
| `/var/log/nginx/`、`${APACHE_LOG_DIR}/`、`/var/log/caddy/` | 按站点拆分的访问与错误日志 | 各自 |

### 11.2 Nginx HTTPS 版本（证书已签好之后）

证书签发与自动续期按 09-web-hosting/05 做完之后，把第 10.1 节的 80 端口站点改成下面这样：80 端口只做跳转，443 端口对外服务。每个域名一份 443 配置，下面只写主站与 API 站，博客站照主站的样子换域名、目录与日志路径即可。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.com www.example.com;
    root /var/www/example.com;
    index index.html;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log /var/log/nginx/example-access.log;
    error_log /var/log/nginx/example-error.log;
    location / {
        try_files $uri $uri/ =404;
    }
    location ~ /\. {
        deny all;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.example.com;
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log /var/log/nginx/api-access.log;
    error_log /var/log/nginx/api-error.log;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

### 11.3 Caddy HTTPS 版本（自动 HTTPS，什么都不用配）

Caddy 的生产写法就是把第 10.3 节的 `http://` 前缀去掉，域名本身就会触发自动 HTTPS：Caddy 自动向 Let's Encrypt 申请证书、自动续期、自动把 HTTP 跳转到 HTTPS。下面是生产用的完整 Caddyfile，博客站照主站的样子换域名与目录即可：

```caddy
example.com, www.example.com {
    root * /var/www/example.com
    file_server
    log {
        output file /var/log/caddy/example-access.log
        format json
    }
}

api.example.com {
    reverse_proxy 127.0.0.1:8080
    log {
        output file /var/log/caddy/api-access.log
        format json
    }
}
```

自动 HTTPS 的前提在第 8 节已经列过：域名解析指向本机、80 与 443 对外可达。内网测试域名（解析不到公网、拿不到证书）不要用这个写法，测试时用第 10.3 节的 `http://` 版，生产切到本节写法。

### 11.4 Apache HTTPS 版本要点（不重复贴全量配置）

Apache 的 HTTPS 虚拟主机是在第 10.2 节的 80 端口虚拟主机之外，再写一份 443 端口的虚拟主机，关键行只有五类，其余行照 80 端口版复制：`SSLEngine on`、`SSLCertificateFile` 与 `SSLCertificateKeyFile`（路径换成你自己的证书路径，签发见 09-web-hosting/05）、`SSLProtocol -all +TLSv1.2 +TLSv1.3`、80 端口版加 `Redirect permanent / https://域名/` 做跳转。也可以用 `mod_md` 让 Apache 自己管理证书（`MDomain` 指令），那是 Apache 自带的 ACME 客户端，2.4.30 起内置、默认关闭，用它就不需要 Certbot，但不要 Certbot 与 `mod_md` 同时管同一个域名，续期会互相覆盖。

### 11.5 Nginx 通配符多站点写法（子域名很多时用）

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name *.example.com;
    root /var/www/sites/$host;
    index index.html;
    access_log /var/log/nginx/wildcard-access.log;
    error_log /var/log/nginx/wildcard-error.log;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

这份配置用 `$host` 把每个子域名映射到同名目录：`a.example.com` 读 `/var/www/sites/a.example.com`，`b.example.com` 读 `/var/www/sites/b.example.com`，新加子域名时只要建目录、配解析，不用改配置。风险也在同一处：目录名就是域名拼出来的，目录不存在时访客会看到 404，陌生子域名也会落到这个目录规则里，所以通配符站点的证书必须是通配符证书（DNS-01 验证，见 09-web-hosting/05），且不要把通配符配置和分站点配置混用——第 7.3 节已说明，两者共存时匹配优先级会让人查半天。

## 12. 每个关键配置项的解释

### 12.1 同一条规则，三种写法对照

| 意思 | Nginx | Apache | Caddy |
| --- | --- | --- | --- |
| 监听端口 | `listen 80` / `listen 443 ssl` | `<VirtualHost *:80>` / `<VirtualHost *:443>` | 地址前的 `http://` / `https://`，或直接写域名（默认 HTTPS） |
| 绑定域名 | `server_name example.com www.example.com` | `ServerName example.com` + `ServerAlias www.example.com` | 块首地址 `example.com, www.example.com` |
| 通配符域名 | `server_name *.example.com` | `ServerAlias *.example.com` | `*.example.com` |
| 静态根目录 | `root /var/www/example.com` | `DocumentRoot /var/www/example.com` | `root * /var/www/example.com` |
| 默认首页 | `index index.html` | `DirectoryIndex index.html` | `file_server` 默认找 `index.html` |
| 静态文件找不到时 | `try_files $uri $uri/ =404` | 目录规则 + `FallbackResource`（本篇未用，保持默认 404） | `file_server` 找不到即 404 |
| 反代目标 | `proxy_pass http://127.0.0.1:8080` | `ProxyPass / http://127.0.0.1:8080/` + `ProxyPassReverse` | `reverse_proxy 127.0.0.1:8080` |
| 保留原始 Host | `proxy_set_header Host $host` | `ProxyPreserveHost On` | 默认保留，显式写 `header_up Host {host}` 也可 |
| 真实访客 IP | `proxy_set_header X-Real-IP $remote_addr` + `X-Forwarded-For $proxy_add_x_forwarded_for` | `mod_remoteip` 或后端读 `X-Forwarded-For`（本篇模板未展开，见第 17 节） | 默认带 `X-Forwarded-For` |
| 告诉后端访客协议 | `proxy_set_header X-Forwarded-Proto $scheme` | 后端读 `X-Forwarded-Proto`（Apache 需 `mod_headers` 配合时才写） | 默认带 `X-Forwarded-Proto` |
| 拒绝隐藏文件 | `location ~ /\. { deny all; }` | `<FilesMatch "^\."> Require all denied </FilesMatch>` | `@hidden` + `respond "Forbidden" 403`（第 10.3 节写法） |
| 静态缓存头 | `expires 7d` + `add_header Cache-Control "public"` | `Header set Cache-Control "public, max-age=604800"`（需 `mod_headers`） | `header Cache-Control "public, max-age=604800"`（本篇模板未展开，见第 17 节） |
| 连接超时 | `proxy_connect_timeout 5s`（连不上后端多久放弃）、`proxy_read_timeout 60s`（后端多久不回就断） | `ProxyTimeout 60`（两者合一） | `reverse_proxy` 的 `dial_timeout` 与 `read_timeout`（本篇模板用默认值，调优时再加） |
| 日志 | `access_log` / `error_log`，按站点拆 | `CustomLog` / `ErrorLog`，按站点拆 | `log { output file ...; format json; }`，Caddy 默认 JSON 格式 |

### 12.2 容易写错的三个细节

- Nginx 的 `proxy_pass` 末尾斜杠有含义：`proxy_pass http://127.0.0.1:8080;`（无斜杠）会把完整原始路径原样转发，`proxy_pass http://127.0.0.1:8080/;`（有斜杠）会把 `location` 匹配掉的部分替换掉。本篇 API 站用的是 `location /`，两种写法结果相同；一旦 `location` 改成 `/api/`，两种写法的转发结果就不同，改路径规则时必须重测。
- Apache 的 `ProxyPass` 与 `ProxyPassReverse` 必须成对出现：前者管请求转发，后者管后端返回的重定向地址改写，缺了后者，后端返回的跳转链接会带着内网地址漏给访客。
- Nginx 的 `try_files $uri $uri/ =404` 里，`$uri/` 会尝试目录首页，静态站没有目录首页时最后落到 `=404`，不要把 `=404` 写成 `=400` 或漏掉，否则不存在的路径会返回奇怪的状态码。

## 13. 执行结果示例

下面输出是“读者在自己机器上按第 14 节验证时应看到的样子（示例输出）”，不是本机实测输出——本机没有装 Nginx、Apache、Caddy（见第 5 节末尾的验证说明），所以这里不谎称跑通过。实际状态码、时间、日志路径以你自己机器为准，关键是看状态码与内容对不对，而不是逐字对上。

主站与博客站应返回 200 与对应测试页内容：

```text
$ curl -I http://example.com/
HTTP/1.1 200 OK
Content-Type: text/html

$ curl -s http://example.com/
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>主站</title></head>
<body><h1>主站已通</h1></body>
</html>

$ curl -s http://blog.example.com/ | grep "<h1>"
<body><h1>博客站已通</h1></body>
```

API 站应把请求转发到后端，后端健康检查返回 200：

```text
$ curl -s -o /dev/null -w "%{http_code}\n" http://api.example.com/health
200

$ curl -s http://api.example.com/health
{"status":"ok"}
```

HTTPS 跳转应返回 301 且指向同域名的 https 地址：

```text
$ curl -I http://example.com/
HTTP/1.1 301 Moved Permanently
Location: https://example.com/
```

语法检查与服务状态应全部通过（命令按你选的服务器取一行）：

```text
$ sudo nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful

$ sudo apachectl configtest
Syntax OK

$ sudo systemctl is-active nginx
active
```

## 14. 成功验证

按顺序走完下面七步，全部通过才算配好了，跳过任何一步都可能把故障留到访客先发现：

1. 语法检查通过：Nginx 跑 `sudo nginx -t`，Apache 跑 `sudo apachectl configtest`，Caddy 跑 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`，三者都要看到通过字样再重载，不要跳过检查直接重载。
2. 服务在运行：`sudo systemctl is-active nginx`（或对应服务名）返回 `active`。
3. 本机端口监听正确：`ss -tlnp | grep -E ':80|:443'` 能看到你选的服务器在监听，且没有第二个 Web 服务器也在监听。
4. 三个域名各 curl 一遍：主站返回“主站已通”，博客站返回“博客站已通”，API 站 `/health` 返回 200，三个结果互不串位（主站 curl 不能返回博客站内容）。
5. 浏览器打开三个域名各看一遍，确认没有证书警告（HTTPS 版）与混合内容警告。
6. 日志按站点拆分：访问一次主站后，`/var/log/nginx/example-access.log`（或对应服务器的日志）里出现这一次访问，且没有出现在博客站的日志里。
7. 陌生域名测试：用一个没配置的子域名 curl 一次，确认它没有打开主站（Nginx 应直接断连或拒绝，Apache 应被拒绝站挡住，Caddy 应返回 404），见第 7.2 节的最后一行。

## 15. 常见错误

| 现象 | 常见原因 | 修正方向 |
| --- | --- | --- |
| 启动失败，提示 80 端口已被占用 | 两个 Web 服务器同时在跑，或旧进程没停 | 只留一个服务器，停掉并禁用另外两个，见第 8 节的第一项检查 |
| `nginx -t` 报错找不到符号链接目标 | `sites-enabled` 里的链接指向了已删除的配置文件 | 删掉失效链接，重建到正确的 `sites-available` 文件 |
| 改了配置没生效 | 只改了文件没重载，或改的是 `sites-available` 但启用的是另一个文件 | 确认启用目录指向的文件就是你改的文件，再执行重载命令 |
| 主站能打开，博客站打开的却是主站内容 | 博客站的虚拟主机没被启用，或 `server_name` 写错 | 检查启用目录与 `server_name`，用 `sudo nginx -T`（或 `sudo apachectl -S`）看实际生效的虚拟主机列表 |
| 静态文件 404，但文件确实存在 | `root` 路径写错，或目录权限不对 | 核对 `root` 与实际目录，确认 Web 服务器用户能读目录（见第 9.2 节的 `chown`） |
| API 站返回 502 | 后端没在跑，或后端监听的不是 `127.0.0.1:8080` | 先按第 9.4 节确认后端本机能 curl 通，再查代理配置里的地址与端口 |
| API 跳转链接带着内网地址 | Apache 缺了 `ProxyPassReverse` | 补上成对的 `ProxyPassReverse`，见第 12.2 节 |
| Caddy 启动后域名还是 HTTP，没有自动上 HTTPS | 域名解析没指向本机，或 80/443 对外不可达，ACME 验证失败 | 先按第 8 节确认解析与端口，再看 Caddy 日志里的 ACME 报错 |
| 通配符站点把陌生子域名也放进来了 | 通配符规则本身就是“全部子域名都匹配” | 陌生子域名要单独写拒绝站，或改回分站点写法，见第 7.3 节 |
| 反面写法示例（只出现在本表与行内代码里，不要照抄进配置）：`server_name example.com` 写成了 `server_name example.com, www.example.com`（Nginx 里域名之间是空格分隔，不是逗号）、`ProxyPass` 只写了转发没写 `ProxyPassReverse`、Caddy 里把 `reverse_proxy` 写成了 `proxy_pass`（那是 Nginx 的指令，Caddy 里没有） | 以上三种都是“把 A 服务器的写法搬到 B 服务器”的典型错误 | 对照第 12.1 节的表格，把每个指令换成当前服务器的写法 |

## 16. 故障排查

按症状查，不要一上来就重启服务器——重启会掩盖“配置改错”与“后端挂了”的区别：

- **全部站点都打不开**：先查解析（`dig +short 域名 A`），再查端口监听（`ss -tlnp`），再查服务状态（`systemctl status`）。解析不对是 DNS 层，端口没人监听是服务层，两者修法完全不同。
- **只有 API 站 502**：先在本机 curl 后端（`curl http://127.0.0.1:8080/health`），本机通而域名不通是代理层问题，本机也不通是后端问题。代理层再看错误日志里是连接被拒（后端没监听）还是超时（后端 hang 住），前者修后端启动，后者查后端慢原因或调大 `proxy_read_timeout`。
- **只有某个静态站 404**：先看访问日志里请求的实际路径，再核对该站点的 `root` 与文件是否存在，最后查目录权限。日志里路径与预期不一致时，通常是 `try_files` 或 `location` 规则写错。
- **HTTPS 报证书错误**：先确认证书路径指向的域名与当前域名一致（`example.com` 的证书不能给 `api.example.com` 用，除非是通配符证书），再确认证书没过期（`openssl x509 -in 证书路径 -noout -dates`），最后确认续期任务还在跑（见 09-web-hosting/05 的续期验证一节）。
- **改了配置，重载后行为没变**：先确认改的是生效文件（Nginx 看 `sites-enabled` 链接目标，Apache 看 `sites-enabled` 与 `a2ensite` 列表，Caddy 看 `/etc/caddy/Caddyfile`），再确认重载命令真的执行了且没报错，最后用 `sudo nginx -T`（或对应命令）看生效配置里是不是你改的那一行。
- **日志里全是 CDN 节点 IP，看不到真实访客 IP**：这是 09-web-hosting/01 已讲过的 Cloudflare 代理问题，按那一节配真实 IP 还原，不要在本篇模板里再加一层 `X-Forwarded-For` 覆盖，覆盖会把链路搞乱。

## 17. 安全注意事项

- 版本信息能藏就藏：Nginx 加 `server_tokens off;`（放在 `http` 块或 `server` 块），Apache 加 `ServerTokens Prod` 与 `ServerSignature Off`，Caddy 默认不回显版本号。版本号暴露不会直接导致入侵，但会让扫描器直接对号入座找已知漏洞。
- 隐藏文件与敏感文件一律拒绝：第 10 节三份配置里都写了隐藏文件拒绝规则（`.git`、`.env`、`.ht` 类文件），不要为了调试方便删掉它；备份文件（`.bak`、`.old`）也不要放在站点目录里，站点目录只放对外要发的文件。
- 后端端口只监听本机回环地址：后端绑 `127.0.0.1:8080`，不要绑 `0.0.0.0:8080` 对外暴露；防火墙只放行 80 与 443，后端端口不对公网放行。
- 日志不要记敏感信息：访问日志默认会记完整 URL，带 token 的查询串不要出现在 URL 里，改走请求头或请求体；日志文件权限收紧，不要放进站点目录让人下载。
- TLS 只开 1.2 与 1.3：Nginx 的 `ssl_protocols TLSv1.2 TLSv1.3`、Apache 的 `SSLProtocol -all +TLSv1.2 +TLSv1.3`，不要把旧教程里的 TLS 1.0、1.1 与弱加密套件抄进来。
- 限流与超时是生产必备：本篇模板给了代理超时，生产还应在代理层加限流（Nginx 的 `limit_req_zone`、Apache 的 `mod_ratelimit`、Caddy 的 `rate_limit`），具体数值按业务定，本篇不写死一个数字让你照抄——限流值写错会把正常访客挡在外面，比不写更糟。
- 证书私钥权限：`/etc/letsencrypt/` 下的私钥只给 root 与服务器用户读，不要复制到站点目录，不要放进代码仓库。

## 18. 回滚和恢复

改配置前已经按第 8 节做了备份，回滚就是三步，不要现想办法：

```bash
sudo cp -a /root/nginx-sites.bak-20260101/. /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
curl -I http://example.com/
```

Apache 路线把第一组命令换成 `/etc/apache2/sites-available/` 下的对应备份文件，语法检查换 `sudo apachectl configtest`、生效换 `sudo systemctl reload apache2`；Caddy 路线把备份的 Caddyfile 拷回 `/etc/caddy/Caddyfile`，校验换 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`、生效换 `sudo systemctl reload caddy`。

如果新站点配置本身就是故障源，先把它移出启用目录、恢复到只有默认站点的状态再慢慢查：Nginx 删掉 `sites-enabled` 里指向它的符号链接后 reload；Apache 用 `sudo a2dissite example.com.conf` 后 reload；Caddy 把 Caddyfile 里对应的站点块注释掉后 reload。恢复后先按第 14 节的前三步确认服务与端口正常，再逐个加回站点，每加一个验证一个，不要一次全加回去。

## 19. 延伸阅读

- 本指南已有章节（先读这些，再去看官方文档）：[09 网站搭建、域名与应用部署](../../09-web-hosting/index.md)、[LNMP/LAMP 自建](../../09-web-hosting/03-lnmp-lamp.md)、[HTTPS 自动化证书](../../09-web-hosting/05-https-certificates.md)、[Web 服务器与反向代理](../../04-network/02-web-proxy.md)、[负载均衡：HAProxy](../../04-network/06-haproxy.md)。
- 本指南网站篇相关文章：[ARCH-01 网站完整架构总览](../architecture/01-overview.md)、[ARCH-02 架构模式对比与升级路径](../architecture/02-patterns.md)、[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)、[NET-02 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名](../basics/02-domain.md)。
- 官方文档（安装时以官网当场公布的内容为准）：Nginx 官方文档的 `ngx_http_core_module` 与 `ngx_http_proxy_module`、Apache 官方文档的虚拟主机与 `mod_proxy` 章节、Caddy 官方文档的 Caddyfile 语法与 `reverse_proxy` 指令。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。

## 20. 相关章节链接

- 分工总纲：本篇第 1.1 节的表格是查配置的第一入口，单站点安装与第一个站先去 [09-web-hosting/03 LNMP/LAMP 自建](../../09-web-hosting/03-lnmp-lamp.md)。
- 域名与解析：[09-web-hosting/01 域名解析与网络连接](../../09-web-hosting/01-dns-resolution.md)、[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)、[NET-02 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名](../basics/02-domain.md)。
- 证书签发与续期：[09-web-hosting/05 HTTPS 自动化证书](../../09-web-hosting/05-https-certificates.md)。
- 反代原理与负载均衡分工：[04-network/02 Web 服务器与反向代理](../../04-network/02-web-proxy.md)、[04-network/06 负载均衡：HAProxy](../../04-network/06-haproxy.md)。
- 架构总览：[ARCH-01 网站完整架构总览](../architecture/01-overview.md)、[ARCH-02 单体、前后端分离、SSR、SSG、微服务、多站点架构对比与升级路径](../architecture/02-patterns.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 上一篇：[API-01 REST、GraphQL、WebSocket、OAuth、JWT](../api/01-integration.md)。
- 下一篇：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](./02-runtime.md)
