# PROJ-05：PHP 网站、Go API 服务从零部署完整教程

> 任务编号：PROJ-05（网站建设与部署实战指南 · 完整实战第 5 篇）
> 上一篇：[PROJ-04 Node.js 网站从零部署](04-nodejs.md)；下一篇：[PROJ-06 Docker 多容器网站平台](06-docker-platform.md)。
> 本篇只讲一台服务器上同时跑 PHP 网站与 Go API 服务的完整上线过程：PHP 网站走 PHP-FPM + Nginx，Go API 服务走 systemd + Nginx 反向代理，Nginx 按子域名分流两部分，HTTPS 统一配置，最后做上线检查。框架语法本身不重讲（PHP 见 BE-01，Go 见 BE-04），systemd 原理不重讲（见 SRV-02），Nginx 配置模板的对照不重讲（见 SRV-01）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 在一台 Ubuntu 服务器上同时部署 PHP 网站与 Go API 服务，并让两者互不干扰；
2. 写出 PHP-FPM 池配置、Go 服务的 systemd 单元、Nginx 分流配置，并说清每一份配置是干什么的；
3. 让 Go API 只监听回环地址，对外只由 Nginx 代理，PHP 网站与 API 用两个子域名分开访问；
4. 给两部分统一配好 HTTPS，并按上线检查清单逐项验证；
5. 出问题时按日志顺序定位（先看 Nginx 日志，再看 PHP-FPM 日志或 Go 服务日志），并能回滚到上一版。

## 2. 适用人群

- 已经读过 BE-01（PHP 框架）与 BE-04（Go 框架），知道 PHP 与 Go 各自怎么写一个最小应用，但还没亲手把两者同时部署到一台服务器上的读者；
- 读过 SRV-01 与 SRV-02，知道 Nginx 与 systemd 各自是干什么的，想看一次“两者合起来用”的完整例子的读者；
- 想给自己的站点加一个 API 后端（例如给 PHP 网站配一个 Go 写的接口服务），又不想为此再开一台服务器的读者。

不适合：完全没写过 PHP 或 Go 的读者（先读 BE-01 与 BE-04）；只想部署纯静态站的读者（见 PROJ-01）；想用 Docker 一次编排多容器的读者（见 PROJ-06）。

## 3. 适用系统和版本

- 系统：Ubuntu 24.04 LTS（本文命令与部署示例以它为准，目录、用户、服务名都按 Ubuntu 的习惯写）。
- 语言与软件版本（核查日期 2026-11-03，核查来源为 BE-01、BE-04、SRV-01 各篇在同一天核查的官网公开资料，安装时仍以官网当场公布的版本为准）：

| 项目 | 本篇采用的版本 | 说明 |
| --- | --- | --- |
| PHP | 8.4 线 | BE-01 核查：Laravel 13 线要求 PHP 8.3 至 8.5，Symfony 8.1 要求 PHP 8.4 以上；本篇 PHP 网站不用框架，只用原生 PHP，因此只要 PHP 8.4 能装即可 |
| Go | 1.27.3 | BE-04 核查：2026-10-19 稳定版；本篇 Go API 只用标准库，不依赖任何第三方包 |
| Nginx | 1.30.6 开源稳定版 | SRV-01 核查：2026-10-14 发布；主线版 1.31.7 也可用，配置写法相同 |
| PHP-FPM | 随 PHP 8.4 一起安装 | 池配置文件路径按 Ubuntu 的 `/etc/php/8.4/fpm/pool.d/` 写 |

- 域名：全文示例域名一律用保留域名 `example.com` 及其子域名，读者要换成自己的真实域名；示例 IP 一律用 `127.0.0.1`（回环）与文档示例保留地址，读者要换成自己的真实值。

## 4. 使用前提

开始之前，你需要已经具备下面这些条件，缺一项就先补齐，不要硬着头皮往下走：

1. 一台能用 SSH 登录的 Ubuntu 24.04 服务器，并且你有 sudo 权限；登录与密钥管理见 DEPLOY-01。
2. 一个属于你自己的域名，并且你能在域名服务商后台改解析记录（本篇需要两条记录，见第 9.2 节）。
3. 会用最基本的 Linux 命令（`cd`、`ls`、`cat`、`systemctl`、`curl`），会用文本编辑器改配置文件。
4. 读过 BE-01 的 PHP 部分与 BE-04 的标准库部分，知道 PHP 文件是怎么被执行的、Go 程序是怎么编译运行的；读过 SRV-02 的 systemd 部分，知道服务单元大概长什么样。

不需要的前提：不需要数据库（本篇两个示例都不连数据库，文章与接口数据都写在代码里，刻意保持最小）；不需要 Docker；不需要已经申请好的证书（证书在第 9.7 节现申请，申请方法引用 09-web-hosting/05，不重讲）。

## 5. 所需资源

| 资源 | 数量与要求 | 说明 |
| --- | --- | --- |
| 服务器 | 1 台，2 核 2 GB 内存起步 | PHP-FPM 池与 Go 服务都很轻，2 GB 够跑本篇的示例；生产站点按访问量再放大 |
| 域名 | 1 个主域名 + 2 个子域名 | `www.example.com` 跑 PHP 网站，`api.example.com` 跑 Go API；也可以只用一个主域名加路径分流，见第 7.3 节 |
| 软件 | Nginx、PHP 8.4（含 PHP-FPM）、Go 1.27.3 | 全部用 Ubuntu 官方源或各项目官方源安装，不要从不明来源下载二进制包 |
| 时间 | 约 1 小时 | 含安装、部署、HTTPS、上线检查；第一次做建议留出排错时间 |

## 6. 技术原理

一次访问在本篇的架构里是这样走的，先说清全貌，后面每一步配置都能对上号：

1. 访客在浏览器打开 `https://www.example.com/`，DNS 把域名解析到服务器 IP，请求到达 Nginx 的 443 端口。
2. Nginx 按 `server_name` 分流：`www.example.com` 的请求走 PHP 站点配置，`api.example.com` 的请求走 API 配置；分流只看域名，不看路径，这是子域名分流的意思。
3. PHP 请求的链路是：Nginx → PHP-FPM 池（Unix 套接字）→ PHP 解释执行 → 结果原路返回。Nginx 自己不执行 PHP，它只负责把请求转交给 PHP-FPM，再把结果发回浏览器。
4. API 请求的链路是：Nginx → Go 服务（`127.0.0.1:8080`）→ Go 程序处理 → 结果原路返回。Go 服务只监听回环地址，互联网上的访客根本连不上它，只能通过 Nginx 才能访问，这是本篇最重要的安全设计。
5. HTTPS 在 Nginx 这一层统一终止：证书只配在 Nginx 上，PHP-FPM 与 Go 服务之间走的都是本机内部通信，不需要各自再配证书。

为什么 Go API 只绑回环地址？因为 API 服务本身没有做复杂的访问控制，本篇的示例也没有登录鉴权；一旦它直接监听公网地址，任何人都能绕过 Nginx 的限流与安全头直接打它。只绑回环，等于给它加了一道“只能从本机进”的门，门外再由 Nginx 统一把关。这条规则不要改，除非你已经给 API 加上了完整的鉴权与限流，并且清楚自己在做什么。

## 7. 架构说明

### 7.1 部署拓扑

| 部分 | 域名 | 对外端口 | 内部形态 | 进程管理 |
| --- | --- | --- | --- | --- |
| PHP 网站 | `www.example.com` | 443（HTTPS）、80（跳转） | Nginx + PHP-FPM 池，套接字通信 | PHP-FPM 主进程 + 子进程池 |
| Go API 服务 | `api.example.com` | 443（HTTPS）、80（跳转） | Go 二进制程序，只监听 `127.0.0.1:8080` | systemd 服务单元 |
| 反向代理与 HTTPS | 两部分共用 | Nginx 统一终止 HTTPS | 证书只配在 Nginx 上 | Nginx 主进程 |

### 7.2 目录与端口总表

| 内容 | 路径或端口 | 说明 |
| --- | --- | --- |
| PHP 网站根目录 | `/var/www/php-site/public` | 只放对外可访问的 PHP 文件，不要把配置文件放进这里 |
| PHP 网站源码目录 | `/var/www/php-site` | `public` 的上一级，放不对外开放的文件（本篇示例简单，只用 `public` 下的两个文件） |
| Go API 程序目录 | `/opt/go-api` | 放编译好的二进制程序与 `.env` 文件 |
| Go API 二进制程序 | `/opt/go-api/go-api` | 由 `go build` 生成，systemd 直接运行它 |
| Go API 环境变量文件 | `/opt/go-api/.env` | 只放非敏感配置（端口、日志级别），口令与密钥一律用占位符，见第 11.4 节 |
| Go API 监听地址 | `127.0.0.1:8080` | 只绑回环，绝不改成 `0.0.0.0:8080` |
| PHP-FPM 套接字 | `/run/php/php8.4-fpm-php-site.sock` | Nginx 通过这个套接字把 PHP 请求交给 PHP-FPM |
| PHP-FPM 池配置 | `/etc/php/8.4/fpm/pool.d/php-site.conf` | 只给本篇的 PHP 网站用，不改默认的 `www.conf` |
| Nginx 站点配置 | `/etc/nginx/sites-available/php-go.conf` | 两部分的分流配置写在一个文件里，启用后链接到 `sites-enabled` |
| systemd 服务单元 | `/etc/systemd/system/go-api.service` | 只管 Go API 服务，不管 PHP 网站 |
| Nginx 日志 | `/var/log/nginx/php-site-access.log`、`/var/log/nginx/php-site-error.log`、`/var/log/nginx/api-access.log`、`/var/log/nginx/api-error.log` | 两部分各一对日志，出问题先看这里 |
| PHP-FPM 日志 | `/var/log/php8.4-fpm-php-site.log` | 池配置里指定，见第 11.2 节 |
| Go 服务日志 | `journalctl -u go-api` | systemd 接管输出，不单独写日志文件 |

### 7.3 分流方式的取舍：子域名与路径

本篇主推子域名分流（`www.example.com` 与 `api.example.com`），因为两部分的缓存规则、安全头、限流可以各自独立写，互不干扰。路径分流（`example.com/` 跑 PHP，`example.com/api/` 跑 Go）也是可行的写法，Nginx 里用一个 `server` 块加一个 `location /api/` 代理到 Go 服务即可；它的缺点是两部分共用一套缓存与安全头配置，改一边容易影响另一边，而且 PHP 网站的路由要刻意避开 `/api/` 前缀。如果你已经有了一个跑在主域名上的 PHP 网站、只想顺手加一个 API，路径分流改动最小；如果你是从零开始，本篇建议直接用子域名分流。

## 8. 操作前检查

动手之前，先在服务器上逐项核对，全部通过再往下走：

1. 系统是 Ubuntu 24.04：`lsb_release -a` 能看到 `Ubuntu 24.04` 字样。
2. 你能用 sudo 执行命令：`sudo -n true` 不报错（如果提示输入口令，说明你的 sudo 需要口令，先按你自己的方式处理好）。
3. 80 与 443 端口没有被别的程序占着：`sudo ss -tlnp | grep -E ':(80|443) '` 没有输出，或者只有你打算替换掉的旧 Nginx 在监听。
4. 域名解析已经指向这台服务器：`dig www.example.com +short` 与 `dig api.example.com +short` 返回的都是这台服务器的公网 IP；如果还没生效，先等解析生效再申请证书，否则证书申请会失败。
5. 服务器时间是对的：`date` 显示的时间与当前时间相差不超过几分钟，时间错太多会导致 HTTPS 证书校验出问题。
6. 磁盘与内存够用：`df -h /` 剩余空间大于 2 GB，`free -h` 可用内存大于 500 MB。

## 9. 逐步操作

下面每一步都注明在哪个目录、以哪个用户执行；命令里的 `example.com` 全部换成你自己的域名再执行。

### 9.1 安装 Nginx、PHP、Go

以 sudo 用户执行，先更新软件源，再安装三样东西：

```bash
sudo apt update
sudo apt install -y nginx php8.4-fpm
sudo apt install -y golang-go
nginx -v
php -v
go version
```

装完先确认三个版本号都能打出来，再往下走；如果 `php -v` 显示的不是 8.4 线，先检查是不是装了别的版本，不要用错版本的 PHP-FPM 套接字路径。

### 9.2 配域名解析

在域名服务商后台加两条 A 记录（服务器只有 IPv4 时只加 A 记录，有 IPv6 再加 AAAA 记录）：

| 主机记录 | 记录类型 | 记录值 | TTL |
| --- | --- | --- | --- |
| www | A | 这台服务器的公网 IP | 600 |
| api | A | 这台服务器的公网 IP | 600 |

加完用 `dig www.example.com +short` 与 `dig api.example.com +short` 验证，两条都返回服务器 IP 才算生效；TTL 写 600 是为了改错了能较快纠正，上线稳定后再改大。

### 9.3 部署 PHP 网站

以 sudo 用户执行，先建目录、放文件、改属主，再写 PHP-FPM 池配置：

```bash
sudo mkdir -p /var/www/php-site/public
sudo chown -R www-data:www-data /var/www/php-site
sudo chmod 755 /var/www/php-site /var/www/php-site/public
```

把第 10.1 节的两个 PHP 文件分别存为 `/var/www/php-site/public/index.php` 与 `/var/www/php-site/public/article.php`，再把第 11.2 节的池配置存为 `/etc/php/8.4/fpm/pool.d/php-site.conf`，然后检查并重载 PHP-FPM：

```bash
sudo php-fpm8.4 -t
sudo systemctl restart php8.4-fpm
sudo systemctl status php8.4-fpm --no-pager | head -5
```

`php-fpm8.4 -t` 必须先通过再重载；如果报错，先看报错指出的那一行，不要带着报错重载。

### 9.4 部署 Go API 服务

以 sudo 用户执行，先建目录与专用用户，再编译、放程序、写配置：

```bash
sudo mkdir -p /opt/go-api
sudo useradd --system --home-dir /opt/go-api --shell /usr/sbin/nologin goapi
sudo chown goapi:goapi /opt/go-api
sudo chmod 750 /opt/go-api
```

把第 10.2 节的 Go 代码存到你自己的开发机或服务器上的一个临时目录（例如 `/tmp/go-api-build/main.go`），在该目录执行编译（Go 只用标准库，不需要下载任何依赖）：

```bash
cd /tmp/go-api-build
go mod init example.com/go-api
go build -o go-api main.go
sudo cp go-api /opt/go-api/go-api
sudo chown goapi:goapi /opt/go-api/go-api
sudo chmod 750 /opt/go-api/go-api
```

再把第 11.4 节的 `.env` 文件存为 `/opt/go-api/.env`（属主 `goapi`，权限 600），把第 11.3 节的 systemd 单元存为 `/etc/systemd/system/go-api.service`，然后重载并启动：

```bash
sudo chmod 600 /opt/go-api/.env
sudo chown goapi:goapi /opt/go-api/.env
sudo systemctl daemon-reload
sudo systemctl enable go-api
sudo systemctl start go-api
sudo systemctl status go-api --no-pager | head -5
curl http://127.0.0.1:8080/health
```

最后一条 `curl` 必须在服务器本机执行，且必须返回健康检查的 JSON，才算 Go 服务真的跑起来了；如果返回连接被拒绝，先看 `journalctl -u go-api` 的日志，不要先去改 Nginx。

### 9.5 写 Nginx 分流配置并检查

把第 11.1 节的 Nginx 配置存为 `/etc/nginx/sites-available/php-go.conf`，启用它，并先不要急着配 HTTPS，用 HTTP 先把两部分跑通：

```bash
sudo ln -s /etc/nginx/sites-available/php-go.conf /etc/nginx/sites-enabled/php-go.conf
sudo nginx -t
sudo systemctl reload nginx
curl http://www.example.com/
curl http://api.example.com/health
```

`nginx -t` 必须先通过再重载；两条 `curl` 都要在服务器本机先跑通，再用浏览器从外网访问；如果本机通、外网不通，先查防火墙与安全组有没有放行 80 端口，不要先怀疑配置写错了。

### 9.6 给 Nginx 加安全头与限流（可选但建议做）

在第 11.1 节的配置里已经写好了两组安全头与 API 的限流，分别是：PHP 站点的 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`，API 站点的同样三项加 `limit_req`。这一步不需要额外操作，只要确认你用的就是第 11.1 节的完整配置，而不是自己删减过的版本。限流的数值（API 每秒 10 个请求、突发 20 个）是示例值，生产站点按自己的访问量调整，调之前先看 OPS-02 的限流一节。

### 9.7 申请证书并切到 HTTPS

证书申请与续期的方法引用 09-web-hosting/05，不重讲；这里只写顺序，证书工具以你自己装的为准：

1. 确认第 9.5 节的 HTTP 访问已经通了，两个子域名都能打开，再申请证书；HTTP 不通就去申请，验证一定失败。
2. 给 `www.example.com` 与 `api.example.com` 两个域名一起申请一张证书（两个域名写在一次申请里），证书文件放到 `/etc/letsencrypt/live/example.com/` 下（路径里的 `example.com` 换成你自己的主域名）。
3. 把第 11.1 节配置里的证书路径换成你真实的证书路径，把 80 跳转块与 443 块都启用，再跑 `sudo nginx -t`，通过后重载。
4. 用浏览器分别打开 `https://www.example.com/` 与 `https://api.example.com/health`，确认锁图标正常、没有证书警告。
5. 确认自动续期已经设好（证书工具一般会自己加定时任务），用 `sudo systemctl list-timers | grep -i cert` 看一眼有没有续期任务，没有就按 09-web-hosting/05 的方法补一个。

### 9.8 上线检查

按第 14 节的清单逐项验证，全部通过才算上线完成；有一项不通过就先修那一项，不要带着已知问题上线。

## 10. 完整代码

本节代码全部完整、无省略，复制下来就能用；文件路径在每段代码前面写清。注意：Go 代码只用标准库，PHP 代码不用框架，两部分都不连数据库。

### 10.1 PHP 网站：入口与文章详情页

文件 1：`/var/www/php-site/public/index.php`（首页，列出文章标题，点击进详情页）。

```php
<?php
declare(strict_types=1);

$articles = [
    1 => ['title' => '第一篇：从零部署 PHP 网站', 'summary' => '讲清 PHP-FPM 与 Nginx 是怎么配合的。'],
    2 => ['title' => '第二篇：给网站加一个 Go API', 'summary' => '讲清 Go 服务为什么只绑回环地址。'],
    3 => ['title' => '第三篇：上线检查清单', 'summary' => '上线前必须逐项打勾的检查项。'],
];
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>示例 PHP 网站</title>
</head>
<body>
<h1>示例 PHP 网站</h1>
<p>这是一个最小的 PHP 网站示例，文章数据写在代码里，不连数据库。</p>
<ul>
<?php foreach ($articles as $id => $article) : ?>
<li>
<a href="/article.php?id=<?php echo $id; ?>"><?php echo htmlspecialchars($article['title'], ENT_QUOTES, 'UTF-8'); ?></a>
<span><?php echo htmlspecialchars($article['summary'], ENT_QUOTES, 'UTF-8'); ?></span>
</li>
<?php endforeach; ?>
</ul>
<p>接口服务在另一个子域名上：<a href="https://api.example.com/health">API 健康检查</a></p>
</body>
</html>
```

文件 2：`/var/www/php-site/public/article.php`（详情页，按 `id` 取文章，`id` 不存在或不是数字时返回 404）。

```php
<?php
declare(strict_types=1);

$articles = [
    1 => ['title' => '第一篇：从零部署 PHP 网站', 'body' => 'PHP 请求的链路是：Nginx 收到请求，按 server_name 分流到 PHP 站点，再通过套接字交给 PHP-FPM，PHP 执行完把结果原路返回。'],
    2 => ['title' => '第二篇：给网站加一个 Go API', 'body' => 'Go API 服务只监听回环地址 127.0.0.1:8080，互联网上的访客连不上它，只能通过 Nginx 代理访问。'],
    3 => ['title' => '第三篇：上线检查清单', 'body' => '上线检查清单在第 14 节，每一项都有对应的验证方法，没有检查一下这种空话。'],
];

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
if ($id === false || $id === null || !isset($articles[$id])) {
    http_response_code(404);
    echo '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>404</title></head><body><h1>文章不存在</h1><p><a href="/">回首页</a></p></body></html>';
    exit;
}

$article = $articles[$id];
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title><?php echo htmlspecialchars($article['title'], ENT_QUOTES, 'UTF-8'); ?></title>
</head>
<body>
<h1><?php echo htmlspecialchars($article['title'], ENT_QUOTES, 'UTF-8'); ?></h1>
<p><?php echo htmlspecialchars($article['body'], ENT_QUOTES, 'UTF-8'); ?></p>
<p><a href="/">回首页</a></p>
</body>
</html>
```

### 10.2 Go API 服务：路由与健康检查

文件：`/tmp/go-api-build/main.go`（编译后放到 `/opt/go-api/go-api`，只用标准库，监听地址固定为回环地址，端口从环境变量 `PORT` 读，读不到时默认 8080）。

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
)

type article struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

var articles = []article{
	{ID: 1, Title: "第一篇：从零部署 PHP 网站", Summary: "讲清 PHP-FPM 与 Nginx 是怎么配合的。"},
	{ID: 2, Title: "第二篇：给网站加一个 Go API", Summary: "讲清 Go 服务为什么只绑回环地址。"},
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	err := json.NewEncoder(w).Encode(value)
	if err != nil {
		log.Printf("encode response failed: %v", err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func listHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"total": len(articles), "articles": articles})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		log.Fatalf("invalid PORT value: %q", port)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/articles", listHandler)
	addr := "127.0.0.1:" + strconv.Itoa(portNumber)
	log.Printf("go-api listening on %s", addr)
	server := &http.Server{Addr: addr, Handler: loggingMiddleware(mux)}
	err = server.ListenAndServe()
	if err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
```

注意这段代码里写死的地址是 `127.0.0.1:` 加端口，绝不要改成 `0.0.0.0:`；端口只从环境变量读，不写死在代码里以外的任何地方，生产环境的端口就写在第 11.4 节的 `.env` 文件里。

## 11. 完整配置文件

本节配置文件全部完整、无省略，每份都注明存放路径；路径里的 `example.com` 全部换成你自己的域名再使用。

### 11.1 Nginx 分流配置：两个子域名 + HTTPS

文件：`/etc/nginx/sites-available/php-go.conf`。这份配置假设证书已经申请好，证书路径按 Let's Encrypt 的默认路径写；如果你的证书在别的路径，只改这两行证书路径，不要改其他结构。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.example.com api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.example.com;
    root /var/www/php-site/public;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    access_log /var/log/nginx/php-site-access.log;
    error_log /var/log/nginx/php-site-error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php8.4-fpm-php-site.sock;
    }

    location ~ /\. {
        deny all;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    access_log /var/log/nginx/api-access.log;
    error_log /var/log/nginx/api-error.log;

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

注意：`limit_req_zone` 这一行按 Nginx 的规则必须写在 `http` 上下文里，不能写在 `server` 块里；如果你把它原样放进站点文件会报错。正确做法是把它放到主配置 `/etc/nginx/nginx.conf` 的 `http` 块里，或者放到 `/etc/nginx/conf.d/limit.conf` 里（Nginx 默认会加载 `conf.d` 下的 `.conf` 文件），站点文件里只留 `location` 里引用它的那一行。上面为了让一份配置看起来完整，把它写在了同一个代码块里，实际部署时要按这段话拆开：`limit_req_zone` 归主配置，`limit_req` 引用归站点配置。

### 11.2 PHP-FPM 池配置

文件：`/etc/php/8.4/fpm/pool.d/php-site.conf`。只给本篇的 PHP 网站用，不要去改默认的 `www.conf`，两个池可以并存。

```ini
[php-site]
user = www-data
group = www-data
listen = /run/php/php8.4-fpm-php-site.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = dynamic
pm.max_children = 10
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
pm.max_requests = 500
slowlog = /var/log/php8.4-fpm-php-site-slow.log
request_slowlog_timeout = 5s
php_admin_value[error_log] = /var/log/php8.4-fpm-php-site.log
php_admin_flag[log_errors] = on
```

### 11.3 systemd 服务单元：Go API 服务

文件：`/etc/systemd/system/go-api.service`。只管 Go API 服务，不管 PHP 网站；PHP 网站由 PHP-FPM 主进程管，不需要 systemd 单元。

```ini
[Unit]
Description=Go API service for example.com
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=goapi
Group=goapi
WorkingDirectory=/opt/go-api
EnvironmentFile=/opt/go-api/.env
ExecStart=/opt/go-api/go-api
Restart=on-failure
RestartSec=5
MemoryMax=512M
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 11.4 Go API 环境变量文件

文件：`/opt/go-api/.env`，属主 `goapi`，权限 600，绝不提交到仓库。本篇示例不连数据库、不做登录，因此这里只有非敏感配置；如果你以后给 API 加数据库或密钥，按下面占位符的写法加，不要把真实值写进正文或仓库。

```ini
PORT=8080
LOG_LEVEL=info
DATABASE_URL=请填数据库连接串
API_SECRET=请填随机长串
```

## 12. 每个关键配置项的解释

### 12.1 Nginx 配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `server_name www.example.com` | 这个 server 块只接这个域名的请求 | 写错域名会导致请求落到默认站点，表现为打开的是别人的页面或 Nginx 默认页 |
| `root /var/www/php-site/public` | PHP 网站的根目录，只放对外可访问的文件 | 指到上一级会把源码目录暴露出去，访客可能直接下载到不该公开的文件 |
| `try_files $uri $uri/ /index.php?$query_string` | 先找静态文件，找不到再交给 `index.php` | 漏了这一行会导致文章详情页以外的路径全部 404 |
| `fastcgi_pass unix:/run/php/php8.4-fpm-php-site.sock` | 把 PHP 请求交给哪个 PHP-FPM 池 | 套接字路径与池配置里的 `listen` 对不上时，PHP 页面全部 502 |
| `fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name` | 告诉 PHP-FPM 要执行的是哪个文件 | 漏了这一行会导致 PHP-FPM 不知道执行哪个文件，表现为 404 或空白页 |
| `proxy_pass http://127.0.0.1:8080` | 把 API 请求代理到本机 Go 服务 | 写成公网地址或别的端口会导致 API 全部 502 |
| `proxy_set_header Host $host` | 把原始域名透传给 Go 服务 | 漏了会导致 Go 服务看到的 Host 是 `127.0.0.1:8080`，日志与鉴权都对不上 |
| `limit_req zone=api_limit burst=20 nodelay` | API 限流：每秒 10 个请求，突发 20 个不延迟 | 漏了限流会导致 API 被刷请求时毫无防护；数值太小会导致正常用户被限 |
| `ssl_protocols TLSv1.2 TLSv1.3` | 只允许 TLS 1.2 与 1.3 | 放开 TLS 1.0 与 1.1 会让老旧的不安全协议重新可用 |
| `location ~ /\. { deny all; }` | 拒绝访问以点开头的隐藏文件 | 漏了会导致 `.env`、`.git` 这类文件可能被直接下载 |

### 12.2 PHP-FPM 池配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `listen` | 池监听的套接字路径，必须与 Nginx 的 `fastcgi_pass` 一致 | 对不上时 PHP 页面全部 502 |
| `listen.mode = 0660` | 套接字的权限，属主与属组可读写 | 权限太松会让别的用户也能连这个池，权限太严会让 Nginx 连不上 |
| `pm = dynamic` | 子进程动态伸缩，闲时少、忙时多 | 小站点用 `static` 会一直占着全部子进程的内存 |
| `pm.max_children = 10` | 最多同时跑 10 个 PHP 子进程 | 设太大容易把内存吃光，设太小会在访问高峰排队；按 SRV-02 的内存算式定 |
| `pm.max_requests = 500` | 每个子进程处理 500 个请求后重启 | 不设会导致内存泄漏的子进程越跑越胖 |
| `request_slowlog_timeout = 5s` | 超过 5 秒的请求记入慢日志 | 不设就抓不到慢 PHP 脚本，只能凭感觉猜 |

### 12.3 systemd 单元配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `After=network-online.target` | 等网络就绪再启动 | 漏了可能导致服务在网络还没好时启动失败 |
| `User=goapi` | 用专用低权限用户运行，不用 root | 用 root 运行会让程序漏洞直接拿到整台机器的权限 |
| `EnvironmentFile=/opt/go-api/.env` | 从文件读环境变量，口令不进单元文件 | 把口令直接写进 `ExecStart` 或单元文件会让口令随单元文件到处扩散 |
| `Restart=on-failure` | 崩溃后自动重启 | 不设会导致服务一崩就停在那里，直到有人手动发现 |
| `MemoryMax=512M` | 内存上限，超了会被系统杀掉 | 不设会导致内存泄漏的程序把整台机器拖垮 |
| `NoNewPrivileges=true` | 禁止程序提权 | 不设会让程序有机会通过别的手段拿到更高权限 |

## 13. 执行结果示例

本节输出全部是“读者在自己服务器上应看到的样子（示例输出），不是本机实测输出”——没有在本机对真实服务器做上线，实际时间、进程号、内存数字以读者本机为准。

PHP 网站首页应看到的样子（浏览器打开 `https://www.example.com/`）：页面标题是“示例 PHP 网站”，下面列出三篇文章的标题与简介，点击标题能进详情页；详情页地址是 `https://www.example.com/article.php?id=1`，标题与正文都正常显示，不存在的 `id`（例如 `id=999`）应看到“文章不存在”与 404 状态。

Go API 健康检查应看到的样子（服务器本机执行 `curl http://127.0.0.1:8080/health`）：

```text
{"status":"ok"}
```

Go API 文章列表应看到的样子（浏览器打开 `https://api.example.com/api/articles`）：

```text
{"total":2,"articles":[{"id":1,"title":"第一篇：从零部署 PHP 网站","summary":"讲清 PHP-FPM 与 Nginx 是怎么配合的。"},{"id":2,"title":"第二篇：给网站加一个 Go API","summary":"讲清 Go 服务为什么只绑回环地址。"}]}
```

服务状态应看到的样子（`sudo systemctl status go-api --no-pager` 的关键行）：服务状态是 `active (running)`，主进程号存在；`sudo systemctl status php8.4-fpm --no-pager` 同样是 `active (running)`；`sudo nginx -t` 的关键行是 `syntax is ok` 与 `test is successful`。

## 14. 成功验证

按顺序逐项验证，全部通过才算上线完成；有一项不通过就先修那一项：

1. PHP-FPM 配置通过：`sudo php-fpm8.4 -t` 输出测试成功，没有报错行。
2. PHP-FPM 在运行：`sudo systemctl is-active php8.4-fpm` 输出 `active`。
3. Go 服务在运行：`sudo systemctl is-active go-api` 输出 `active`。
4. Go 健康检查通：服务器本机 `curl http://127.0.0.1:8080/health` 返回 `{"status":"ok"}`。
5. Nginx 配置通过：`sudo nginx -t` 输出 `syntax is ok` 与 `test is successful`。
6. PHP 网站外网通：浏览器打开 `https://www.example.com/` 能看到三篇文章，点击能进详情页。
7. API 外网通：浏览器打开 `https://api.example.com/api/articles` 能看到两篇文章的 JSON。
8. HTTPS 正常：两个子域名的锁图标都正常，没有证书警告；`http://` 地址会自动跳到 `https://`。
9. 分流正确：`www` 域名打开的是 PHP 页面不是 JSON，`api` 域名打开的是 JSON 不是 PHP 页面；如果反了，说明 `server_name` 写反了。
10. 回环隔离有效：从外网直接访问 `http://服务器公网IP:8080/health` 应该连不上（连接被拒绝或超时），这说明 Go 服务确实只绑了回环；如果从外网能直接打通 8080，说明监听地址被改成了公网，立即改回 `127.0.0.1`。

## 15. 常见错误

| 现象 | 最可能的原因 | 先查什么 |
| --- | --- | --- |
| PHP 页面全部 502 | Nginx 的 `fastcgi_pass` 套接字路径与池配置的 `listen` 对不上，或 PHP-FPM 没启动 | 先看 `/var/log/nginx/php-site-error.log`，再看 `systemctl status php8.4-fpm` |
| PHP 页面 404，静态文件能打开 | `try_files` 漏了交给 `index.php` 的那一段，或 `root` 指错了目录 | 先看 Nginx 配置的 `root` 与 `try_files` 这两行 |
| PHP 页面空白，状态码 200 | PHP 代码报错但错误显示被关了 | 先看 `/var/log/php8.4-fpm-php-site.log`，不要先猜是 Nginx 的问题 |
| API 全部 502 | Go 服务没启动，或监听地址不是 `127.0.0.1:8080` | 先看 `journalctl -u go-api`，再看本机 `curl http://127.0.0.1:8080/health` 通不通 |
| API 本机通、外网 502 | Nginx 的 `proxy_pass` 端口写错，或 Go 服务只在启动后又退出了 | 先看 `/var/log/nginx/api-error.log`，再看 `systemctl status go-api` |
| 证书警告或证书域名不匹配 | 证书只申请了一个域名，另一个子域名没写进证书 | 检查证书覆盖的域名有没有 `www` 与 `api` 两个，缺哪个补哪个 |
| HTTP 不跳转 HTTPS | 80 跳转块没启用，或启用后没重载 Nginx | 先看 `sites-enabled` 里有没有这个文件的链接，再看有没有执行重载 |
| 服务重启后 Go API 没起来 | 忘了 `systemctl enable go-api`，只做了 `start` | 用 `systemctl is-enabled go-api` 检查，没启用就补上 |
| 改了配置没生效 | 改完忘了重载或重启对应服务 | Nginx 改配置要 `reload`，PHP-FPM 池改配置要 `restart`，systemd 单元改配置要 `daemon-reload` 再 `restart` |

反面例子只写在表格与行内代码里：例如把 Go 监听地址写成 `0.0.0.0:8080` 是错的，正确写法是 `127.0.0.1:8080`；把 `limit_req_zone` 写进 `server` 块是错的，正确做法是放进 `http` 上下文；把 `.env` 文件权限设成 `644` 是错的，正确做法是 `600` 且属主为运行用户。

## 16. 故障排查

出问题时按下面这个顺序查，不要跳着查，也不要同时改好几处配置：

1. 先看现象归属：PHP 页面出问题先看 PHP 站点的 Nginx 错误日志，API 出问题先看 API 的 Nginx 错误日志，两部分日志是分开的，不要看错文件。
2. 再看后端在不在：PHP 出问题查 `systemctl status php8.4-fpm`，API 出问题查 `systemctl status go-api` 与本机 `curl http://127.0.0.1:8080/health`；后端没起来就先修后端，不要改 Nginx。
3. 再看配置有没有通过：Nginx 改完跑 `nginx -t`，PHP-FPM 池改完跑 `php-fpm8.4 -t`，systemd 单元改完跑 `systemctl daemon-reload` 再看状态；配置测试不通过就不要重载。
4. 再看权限：PHP 文件属主是不是 `www-data`，Go 程序与 `.env` 属主是不是 `goapi`，`.env` 权限是不是 600，套接字权限是不是 0660；权限问题表现为 403 或 502，而且日志里往往写着 `Permission denied`。
5. 再看 DNS 与证书：外网打不开先查 `dig` 返回的 IP 对不对，再查证书覆盖的域名全不全，最后才怀疑是 Nginx 配置写错了。
6. 每改一处就验证一次：改完重载、再跑第 14 节对应的那一条验证，通过了再改下一处；一次改好几处再验证，出问题就不知道是哪一处改坏的。

## 17. 安全注意事项

1. Go API 只绑回环地址：这是本篇的安全底线，绝不要为了图方便改成 `0.0.0.0`；如果以后确实需要让别的机器直接访问 API，先给 API 加鉴权与限流，再改监听地址，并且只放行指定的来源。
2. 口令与密钥只放 `.env` 文件：`.env` 文件权限 600、属主运行用户、绝不提交到仓库；正文与示例里的 `请填数据库连接串` 与 `请填随机长串` 都是占位符，读者要换成自己的真实值，但不要把真实值贴进任何公开文档、聊天记录或工单。
3. PHP 网站根目录只放 `public` 下的文件：配置文件、源码、备份文件不要放进对外可访问的目录；隐藏文件一律拒绝访问，Nginx 配置里已经写了 `location ~ /\. { deny all; }`，不要删掉它。
4. 只开 TLS 1.2 与 1.3：配置里已经写明，老旧协议不要放开；证书私钥文件权限要保持默认的严格权限，不要为了排错把它改成所有人可读。
5. 及时更新：Nginx、PHP、Go 出现安全更新时先在测试环境验证再上线，不要长期停留在有已知漏洞的版本；依赖更新流程见 OPS-02。
6. 不要在错误页面里暴露细节：生产环境要关掉 PHP 的错误回显（靠日志查错，不要靠页面报错查错），Go 服务的错误日志里也不要打印密钥与口令。

## 18. 回滚和恢复

上线前先做好回滚准备，不要等到出问题才想起来：

1. 备份旧版：换 PHP 文件之前，先把旧的 `/var/www/php-site` 整个目录复制一份到 `/var/www/php-site.bak-日期`；换 Go 程序之前，先把旧的 `/opt/go-api/go-api` 复制一份到 `/opt/go-api/go-api.bak-日期`；备份目录不要放在对外可访问的路径下。
2. 换 Go 程序的回滚步骤：停掉服务，把备份的二进制程序拷回 `/opt/go-api/go-api`，改回属主与权限，再启动服务，最后用本机 `curl` 验证健康检查；不要只换文件不重启，systemd 不会自动重读已经启动的程序。
3. 换 PHP 文件的回滚步骤：把备份目录拷回原位置，改回属主 `www-data`，不需要重启 PHP-FPM（PHP 文件是每次请求现读的），验证首页与详情页都正常即可。
4. 改 Nginx 配置的回滚步骤：改配置之前先把旧的 `/etc/nginx/sites-available/php-go.conf` 复制一份到同目录的 `.bak` 文件；出问题先把备份拷回，跑 `nginx -t` 通过后再重载，不要带着报错的配置重载。
5. 证书续期失败的恢复：先看续期任务的日志，确认是解析问题还是验证问题；解析问题按第 9.2 节重查 DNS，验证问题确认 80 端口的 HTTP 访问还能通；续期失败不要先删旧证书，旧证书在过期前还能用，删了反而立刻断站。
6. 整站恢复：本篇两个示例都不连数据库，整站恢复就是上面三项（PHP 文件、Go 程序、Nginx 配置）分别拷回；如果以后加了数据库，整站恢复要按 OPS-04 的演练计划走，先恢复数据库再恢复程序，并且恢复前先演练一次，不要等到真出事才第一次恢复。

## 19. 延伸阅读

- PHP 框架的完整用法：BE-01（Laravel、Symfony、ThinkPHP 各框架独立小节），本篇 PHP 网站如果以后要上框架，从 BE-01 选一个再接进来。
- Go 框架的完整用法：BE-04（Gin、Echo、Fiber、标准库），本篇 Go API 用的是标准库，如果接口变复杂，从 BE-04 选一个框架再接进来。
- Nginx 配置模板的对照：SRV-01（Nginx、Apache、Caddy 完整配置与多站点），本篇只用了 Nginx 的写法，换 Apache 或 Caddy 时看 SRV-01。
- PHP-FPM 与 systemd 的完整用法：SRV-02（PHP-FPM、systemd、运行环境与进程管理），本篇池配置与单元文件里的每一项在 SRV-02 都有更详细的解释。
- 上线全流程：DEPLOY-03（HTTPS、CDN、域名解析上线全流程），本篇第 9.7 节的证书步骤在 DEPLOY-03 里有完整的上线检查清单。
- 证书签发与续期：09-web-hosting/05（指南原有章节），本篇没有重讲证书申请细节，需要时回看原文。

## 20. 相关章节链接

- PHP 框架：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](../backend/01-php.md)
- Go 框架：[BE-04 Go 框架：Gin、Echo、Fiber、标准库](../backend/04-go.md)
- Web 服务器配置：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)
- 运行环境与进程管理：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)
- 上线全流程：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：PROJ-04 Node.js 网站从零部署（本批并行，链接由父级统一补）
- 下一篇：[PROJ-06 Docker 多容器网站平台](06-docker-platform.md)
