# PROJ-01：静态网站从零部署完整教程

> 任务编号：PROJ-01（网站建设与部署实战指南 · 完整实战第 1 篇）
> 上一篇：[OPS-04 备份、迁移、灾难恢复、RTO/RPO、恢复演练](../ops/04-backup-recovery.md)；下一篇：[PROJ-02 WordPress 企业网站 / 博客从零部署](02-wordpress.md)。
> 本篇只讲静态网站：没有后端程序、没有数据库，页面就是服务器硬盘上的文件。本篇不重讲基础概念：HTML 基础见 WEB 篇，Nginx 配置模板见 SRV-01，HTTPS 与上线流程见 DEPLOY-03，SEO 与性能优化见 OPS-01，本篇只把它们按顺序串成一条从零到上线的完整路线。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 按顺序把一个静态网站从零做到上线：买域名、做解析、准备服务器、写页面、配 Nginx、上 HTTPS、做缓存与 SEO 基础、走完上线检查；
2. 说清楚静态网站的请求是怎么走的：浏览器、DNS、Nginx、硬盘文件各负责哪一段；
3. 写出一套文件齐全、链接正确、能在浏览器里直接打开的静态站；
4. 给静态站配好一套生产可用的 Nginx 配置：HTTP 跳 HTTPS、缓存、安全头、隐藏文件拒绝；
5. 按第 14 节的步骤验证站点确实上线了，出问题时按第 16 节定位到解析层、服务器层还是浏览器缓存层。

## 2. 适用人群

- 第一次从零建站的人：前面章节都读过一部分，想亲手把一个站完整做出来一遍；
- 已经会写 HTML，但没亲手配过服务器、没上过 HTTPS 的人；
- 想先用一个最简单的站把“域名、解析、服务器、HTTPS、上线检查”这条线走通，再去做带后端、带数据库的站的人；
- 不适合只想用现成建站平台点几下就上线的人：本篇是手工路线，每一步都要自己动手。

## 3. 适用系统和版本

- 服务器系统：Ubuntu 22.04 LTS 或 24.04 LTS，本文命令以普通用户加 `sudo` 执行，工作目录为家目录，除非另有说明。
- Web 服务器：Nginx，写法按 SRV-01 在 2026-11-03 核查的 Nginx 开源稳定版 1.30.6，1.18 以上版本均可照用，安装时以官网当场公布的版本为准。
- 页面标准：HTML5，写法按 WEB 篇的语义化要求，浏览器用 Chrome、Edge、Firefox、Safari 任选其一。
- 证书：ACME 自动签发路线，具体申请与续期命令见 09-web-hosting/05，本篇只讲证书在上线流程里的位置和检查方法，不重复贴申请命令。
- 域名与 IP：本文示例一律用保留域名 `example.com` 及其子域名，示例 IP 一律用文档示例保留地址 `203.0.113.10`，读者须全部换成自己的真实值。

## 4. 使用前提

动手前必须全部满足，缺一项就先补齐，不要带着缺口上线：

- 域名已经买好且实名认证已通过（见 NET-02）；实名未通过时解析会被暂停，上线一定会卡在这里。
- 你有一台能公网访问的 Ubuntu 服务器的 SSH 登录权限，以及域名解析控制台的修改权限。
- 服务器的 80 与 443 端口已放行（云厂商安全组与服务器防火墙都要放行，只放行一处是不够的）。
- 你已经会写最基本的 HTML（见 WEB 篇），或者愿意照着第 10 节的完整示例先抄一遍再改。

## 5. 所需资源

- 一个已实名通过的域名，本文示例为 `example.com`。
- 一台 Ubuntu 服务器，本文示例 IP 为 `203.0.113.10`。
- 域名解析控制台账号、服务器 SSH 账号。
- 一台能上网的电脑，装好文本编辑器（VS Code、记事本、gedit 均可）与浏览器。
- 不需要数据库、不需要后端语言环境、不需要买证书：静态站没有后端程序，ACME 证书免费自动签发。

## 6. 技术原理

静态网站的请求链路只有四段，没有应用层：

1. 浏览器向 DNS 查 `example.com` 对应哪个 IP，拿到 `203.0.113.10`。
2. 浏览器向这个 IP 的 443 端口发起 TLS 握手，确认证书是发给 `example.com` 的，再发起 HTTPS 请求。
3. Nginx 收到请求，看 `server_name` 匹配到本站的配置，再看 `root` 找到网站文件所在的目录。
4. Nginx 按请求路径在目录里找文件：请求 `/` 就找 `index.html`，请求 `/about.html` 就找 `about.html`，找到就把文件内容原样返回，找不到就返回 404。

关键结论有三条：

- 静态站没有“算出来的页面”，页面在上传那一刻就已经定型，服务器只负责找文件、返回文件，所以故障面很小，出问题先查文件在不在、路径对不对。
- 缓存对静态站特别有效：文件内容不变，浏览器和 CDN 就可以反复用旧副本，不用每次都回源站拿。
- 静态站没有登录、没有表单提交到自己服务器，所以没有数据库可丢、没有后端漏洞可打，安全工作的重点是配置不要暴露多余文件、证书不要过期。

## 7. 架构说明

本篇的站点只有一台服务器、一个 Nginx、一组文件，拓扑如下：

| 层 | 本站是什么 | 负责什么 | 不负责什么 |
| --- | --- | --- | --- |
| 用户层 | 访客的浏览器 | 发起请求、渲染页面、存浏览器缓存 | 不负责生成页面 |
| 网络层 | DNS 解析、TLS | 把域名变成 IP、加密传输 | 不负责找文件 |
| Web 层 | Nginx | 按域名路由、按路径找文件、返回缓存头与安全头 | 不负责运行后端程序 |
| 存储层 | 服务器硬盘上的网站目录 | 存全部页面、样式、图片、robots 与 sitemap | 不负责数据库（本站没有数据库） |
| 运维层 | 证书续期、备份、检查清单 | 保证证书不过期、改坏了能恢复 | 不负责内容更新（内容更新就是换文件） |

部署拓扑只有一种：单服务器。静态站不需要多台服务器、不需要负载均衡，流量大到一台服务器扛不住时再考虑 CDN（见 DEPLOY-03），不要一开始就把架构搞复杂。

## 8. 操作前检查

动手前逐项打勾，有一项不过就先处理，不要跳过：

| 检查项 | 怎么确认 | 不过会怎样 |
| --- | --- | --- |
| 域名实名已通过 | 解析控制台里实名状态为已通过 | 解析被暂停，域名打不开 |
| 域名解析控制台能登录 | 能打开记录列表页 | 解析改不了，上线卡住 |
| 服务器 SSH 能登录 | 能用 SSH 连上服务器并执行一条命令 | 文件传不上去、配置改不了 |
| 80 与 443 端口已放行 | 安全组与服务器防火墙两处都放行 | 浏览器连不上，HTTPS 也起不来 |
| Nginx 已安装或能安装 | 服务器上能执行安装命令 | 没有 Web 服务器，文件没人返回 |
| 旧配置已备份 | 已有的 Nginx 配置已复制一份到备份目录 | 改坏了没法一键恢复 |
| 解析 TTL 已提前调小 | 上线前把相关记录的 TTL 改成 300 秒 | 解析改动后访客要等很久才生效 |

## 9. 逐步操作

按顺序做，不要跳步。每条命令都注明目录与用户：家目录、普通用户加 `sudo`，除非另有说明。

### 9.1 买域名并完成实名

在注册商处买一个域名，完成实名认证，等实名状态变为已通过再往下走。域名怎么选、注册商怎么比、实名与备案的区别，见 NET-02。备案只在服务器放在中国内地时才需要，本篇的示例服务器不预设位置，读者按 NET-02 的结论判断自己要不要备案。

### 9.2 做域名解析

在解析控制台加两条记录（二选一，不要同时加两条 www 记录）：

| 主机记录 | 记录类型 | 记录值 | TTL | 说明 |
| --- | --- | --- | --- | --- |
| @ | A | 203.0.113.10 | 300 | 主域名指向服务器 IP |
| www | CNAME | example.com | 300 | www 指向主域名，随主域名走 |

也可以把 www 写成 A 记录指向同一个 IP，两种写法选一种即可。同时写 A 和 CNAME 会冲突，解析控制台一般会直接报错。

### 9.3 准备服务器并安装 Nginx

用 SSH 登录服务器，家目录、普通用户加 `sudo`，先更新软件源再安装 Nginx：

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

装完先确认 Nginx 在跑，再往下走，不要等到最后才发现服务没起来。

### 9.4 写静态站并传到服务器

按第 10 节把三个页面与一个样式文件写好，放在本地一个目录里，再传到服务器的网站目录 `/var/www/example.com`。传文件的方法任选其一：`scp`、`rsync`、SFTP 客户端，传完确认文件都在、名字没错、大小不是 0。

### 9.5 写 Nginx 配置并检查语法

按第 11 节把 Nginx 配置写到 `/etc/nginx/sites-available/example.com`，做软链接到 `/etc/nginx/sites-enabled/`，然后检查语法，语法通过再重载。语法检查命令与重载命令见第 11 节末尾。

### 9.6 申请证书并切到 HTTPS

按 09-web-hosting/05 的 ACME 路线给 `example.com` 与 `www.example.com` 申请证书，证书签好后把第 11 节的 HTTPS 配置启用，让 80 端口全部跳到 HTTPS。证书必须同时覆盖主域名与 www，否则 www 的 HTTPS 会报证书域名不匹配。

### 9.7 配缓存与 SEO 基础文件

按第 11 节给静态资源加缓存头，把 `robots.txt` 与 `sitemap.xml` 放到网站根目录。页面本身的标题、描述、语义化标签按 WEB-03 的要求写，不要等上线后再补。

### 9.8 走上线检查清单

按第 10 节末尾的上线检查清单逐项验证：解析、HTTP 跳转、HTTPS、证书、缓存头、robots、sitemap、移动端，全部通过才算上线完成。

## 10. 完整代码

本节是一个完整的小静态站：首页、关于页、文章列表页、一个共用样式文件。四个文件全部写全，没有省略，复制下来就能用。文件存放路径全部写在每个代码块上方，上传时按路径放，不要改名。

### 10.1 目录结构

网站在服务器上的完整目录结构如下，六个文件一个不少：

```text
/var/www/example.com/
├── index.html
├── about.html
├── articles.html
├── styles.css
├── robots.txt
└── sitemap.xml
```

### 10.2 首页

文件路径：`/var/www/example.com/index.html`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>示例小站：从零部署的静态网站</title>
<meta name="description" content="一个从零部署的静态网站示例：首页、关于页与文章列表，全部是静态文件。">
<link rel="canonical" href="https://example.com/">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<header>
<nav aria-label="主导航">
<a href="index.html">首页</a>
<a href="about.html">关于</a>
<a href="articles.html">文章</a>
</nav>
</header>
<main id="main">
<section class="hero">
<h1>示例小站</h1>
<p>这是一个从零部署的静态网站：没有后端程序，没有数据库，页面就是服务器上的文件。</p>
<p><a href="articles.html">去看文章列表</a></p>
</section>
<section>
<h2>最新文章</h2>
<article>
<h3><a href="articles.html#post-1">第一篇：静态网站是怎么跑起来的</a></h3>
<p>浏览器、DNS、Nginx、硬盘文件，四段链路讲清楚。</p>
</article>
<article>
<h3><a href="articles.html#post-2">第二篇：上线前必须走完的检查清单</a></h3>
<p>解析、跳转、证书、缓存、robots、sitemap，一项一项对。</p>
</article>
<article>
<h3><a href="articles.html#post-3">第三篇：缓存配错了会发生什么</a></h3>
<p>改了文件访客却看不到旧页面，问题多半出在缓存头上。</p>
</article>
</section>
</main>
<footer>
<p>示例小站：静态文件部署示例，示例域名须换成你自己的真实域名。</p>
</footer>
</body>
</html>
```

### 10.3 关于页

文件路径：`/var/www/example.com/about.html`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>关于：示例小站</title>
<meta name="description" content="示例小站的关于页：这个站是干什么的、用什么做的。">
<link rel="canonical" href="https://example.com/about.html">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<header>
<nav aria-label="主导航">
<a href="index.html">首页</a>
<a href="about.html">关于</a>
<a href="articles.html">文章</a>
</nav>
</header>
<main id="main">
<section>
<h1>关于本站</h1>
<p>本站是一个静态网站示例，目的是把“从零到上线”完整走一遍。</p>
<h2>本站用什么做的</h2>
<ul>
<li>页面：手写 HTML，不用任何框架。</li>
<li>样式：一个共用样式文件，三个页面共用。</li>
<li>服务器：Nginx，只负责返回文件。</li>
<li>证书：ACME 自动签发，自动续期。</li>
</ul>
<h2>本站没有什么</h2>
<ul>
<li>没有登录，没有评论，没有表单提交到服务器。</li>
<li>没有数据库，没有后端程序。</li>
<li>没有统计代码，没有广告代码。</li>
</ul>
<p><a href="index.html">回到首页</a></p>
</section>
</main>
<footer>
<p>示例小站：静态文件部署示例，示例域名须换成你自己的真实域名。</p>
</footer>
</body>
</html>
```

### 10.4 文章列表页

文件路径：`/var/www/example.com/articles.html`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>文章列表：示例小站</title>
<meta name="description" content="示例小站的文章列表：三篇文章的标题与简介。">
<link rel="canonical" href="https://example.com/articles.html">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<header>
<nav aria-label="主导航">
<a href="index.html">首页</a>
<a href="about.html">关于</a>
<a href="articles.html">文章</a>
</nav>
</header>
<main id="main">
<section>
<h1>文章列表</h1>
<article id="post-1">
<h2>第一篇：静态网站是怎么跑起来的</h2>
<p>浏览器先向 DNS 查域名对应的 IP，再向服务器发起 HTTPS 请求，Nginx 按路径在硬盘上找文件，找到就原样返回。</p>
</article>
<article id="post-2">
<h2>第二篇：上线前必须走完的检查清单</h2>
<p>解析、HTTP 跳转、HTTPS、证书、缓存头、robots、sitemap、移动端，八项全部通过才算上线完成。</p>
</article>
<article id="post-3">
<h2>第三篇：缓存配错了会发生什么</h2>
<p>改了文件访客却看不到新页面，先查缓存头，再查 CDN 缓存，最后才怀疑是文件没传上去。</p>
</article>
<p><a href="index.html">回到首页</a></p>
</section>
</main>
<footer>
<p>示例小站：静态文件部署示例，示例域名须换成你自己的真实域名。</p>
</footer>
</body>
</html>
```

### 10.5 共用样式文件

文件路径：`/var/www/example.com/styles.css`。

```css
body {
  font-family: system-ui, sans-serif;
  line-height: 1.7;
  color: #222222;
  background-color: #ffffff;
  margin: 0 auto;
  max-width: 720px;
  padding: 0 16px;
}

header {
  border-bottom: 1px solid #dddddd;
  padding: 16px 0;
}

nav a {
  margin-right: 16px;
}

nav a:focus-visible {
  outline: 2px solid #cc3300;
  outline-offset: 2px;
}

.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  position: static;
}

.hero {
  padding: 32px 0;
  border-bottom: 1px solid #dddddd;
}

article {
  padding: 16px 0;
  border-bottom: 1px solid #eeeeee;
}

footer {
  color: #666666;
  font-size: 14px;
  padding: 16px 0;
}

@media (max-width: 600px) {
  body {
    padding: 0 12px;
  }

  .hero {
    padding: 20px 0;
  }
}
```

### 10.6 上线检查清单

上线前按顺序逐项打勾，每一项都有对应的验证方法，没有“检查一下”这种空话：

| 序号 | 检查项 | 验证方法 |
| --- | --- | --- |
| 1 | 域名解析已生效 | 在自己电脑上查解析，返回服务器 IP |
| 2 | HTTP 能打开 | 浏览器打开 HTTP 地址，能看到首页 |
| 3 | HTTP 跳 HTTPS | 打开 HTTP 地址，地址栏变成 HTTPS |
| 4 | HTTPS 证书正确 | 浏览器锁图标正常，证书域名是自己的域名 |
| 5 | www 跳主域名 | 打开 www 地址，最终落在主域名 |
| 6 | 三个页面都能打开 | 首页、关于页、文章列表页逐个点开 |
| 7 | 样式正常加载 | 页面不是无样式的裸文字，检查样式文件返回 200 |
| 8 | 缓存头正确 | 看静态文件的响应头，有缓存时间 |
| 9 | robots 能访问 | 打开 robots 地址，能看到文件内容 |
| 10 | sitemap 能访问 | 打开 sitemap 地址，能看到三个页面地址 |
| 11 | 移动端能看 | 手机或浏览器手机模式下页面不错乱 |
| 12 | 旧配置已备份 | 备份目录里有改动前的 Nginx 配置 |

## 11. 完整配置文件

本节的配置文件全部写全，没有省略，存放路径全部写在每个代码块上方。证书路径须换成你自己的真实路径，示例路径只说明 ACME 证书的常规存放位置。

### 11.1 Nginx 配置

文件路径：`/etc/nginx/sites-available/example.com`，写好后做软链接到 `/etc/nginx/sites-enabled/`。

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name www.example.com;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com;
    root /var/www/example.com;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json text/xml image/svg+xml;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        expires 7d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }

    location = /robots.txt {
        try_files $uri =404;
    }

    location = /sitemap.xml {
        try_files $uri =404;
    }

    location ~ /\. {
        deny all;
    }
}
```

写好配置后检查语法，语法通过再重载，命令在服务器上执行，普通用户加 `sudo`：

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com
sudo nginx -t
sudo systemctl reload nginx
```

### 11.2 robots 文件

文件路径：`/var/www/example.com/robots.txt`。

```text
User-agent: *
Allow: /
Sitemap: https://example.com/sitemap.xml
```

### 11.3 sitemap 文件

文件路径：`/var/www/example.com/sitemap.xml`。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
  <url>
    <loc>https://example.com/about.html</loc>
  </url>
  <url>
    <loc>https://example.com/articles.html</loc>
  </url>
</urlset>
```

## 12. 每个关键配置项的解释

| 配置项 | 写在哪里 | 含义 | 写错会怎样 |
| --- | --- | --- | --- |
| server_name | 每个 server 块 | 这个配置管哪个域名 | 域名对不上，请求落到默认站 |
| root | 主站 443 块 | 网站文件所在的目录 | 目录写错，全站 404 |
| index | 主站 443 块 | 请求目录时默认找哪个文件 | 不写时请求根路径可能 403 |
| try_files | location / | 按顺序试文件、试目录、最后返回 404 | 不写时不存在的路径可能返回奇怪结果 |
| return 301 | 80 块与 www 的 443 块 | 永久重定向到主域名的 HTTPS 地址 | 不写时 HTTP 与 www 各成一个站，权重分散 |
| ssl_certificate 与 ssl_certificate_key | 两个 443 块 | 证书文件与私钥文件的路径 | 路径错或域名不匹配，HTTPS 起不来 |
| ssl_protocols | 两个 443 块 | 只允许 TLS 1.2 与 1.3 | 放开旧版本会降低传输安全性 |
| Strict-Transport-Security | 主站 443 块 | 告诉浏览器以后只用 HTTPS 访问本站 | 上线初期时间设太长，改回 HTTP 会很麻烦 |
| gzip 与 gzip_types | 主站 443 块 | 对文本类型响应做压缩 | 把图片、视频列进去反而浪费 CPU |
| expires 与 Cache-Control | 静态资源 location | 告诉浏览器静态文件可以缓存 7 天 | 缓存时间设太长，改了文件访客看不到新版 |
| location ~ /\. | 主站 443 块 | 拒绝访问以点开头的隐藏文件与目录 | 不写时 .git 这类目录可能被直接下载 |
| User-agent 与 Allow | robots.txt | 允许所有搜索引擎抓取本站 | 写成 Disallow 全站等于主动放弃收录 |
| Sitemap | robots.txt | 告诉搜索引擎 sitemap 文件的地址 | 不写时搜索引擎要自己发现 sitemap |
| loc | sitemap.xml | 列出本站的三个页面地址 | 地址写错或漏页，收录检查会对不上 |

## 13. 执行结果示例

本节的输出全部是“读者在自己域名上应看到的样子（示例输出），不是本机实测输出”。本机没有对真实域名做上线，没有申请真实证书，实际的 IP、时间、证书信息以读者自己环境为准。

### 13.1 检查语法与重载

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

看到上面两行，说明配置语法通过，可以重载。如果只看到第一行、没有第二行，或者直接报错，不要重载，先按第 16 节定位。

### 13.2 首页响应头示例

```text
HTTP/2 200
content-type: text/html
cache-control: public
strict-transport-security: max-age=63072000
x-content-type-options: nosniff
```

要点是三处：状态码是 200 不是 301（301 只应出现在 HTTP 与 www 的跳转上），安全头在场，首页本身没有被缓存成静态资源（首页不设长缓存，改版后访客立刻能看到新版）。

### 13.3 静态资源响应头示例

```text
HTTP/2 200
content-type: text/css
cache-control: public
expires: （7 天后的日期）
```

样式文件带 7 天缓存是预期的。改样式后访客一时看不到新版时，先按第 16 节查缓存，不要反复改配置。

## 14. 成功验证

按顺序做完下面 9 步，全部通过才算上线完成：

1. 在自己电脑上查域名解析，返回服务器 IP，且 www 与主域名的解析都对。
2. 浏览器打开 HTTP 地址，地址栏自动变成 HTTPS，说明 80 跳转在工作。
3. 浏览器打开 HTTPS 主域名，能看到首页，锁图标正常，点开证书确认域名是自己的域名。
4. 浏览器打开 www 地址，最终落在主域名，说明 www 的 HTTPS 跳转在工作。
5. 逐个点开首页、关于页、文章列表页，三个页面都能打开，导航链接互相能走通。
6. 看页面样式是否正常：有排版、有间距、手机模式下不错乱，样式文件返回 200。
7. 用浏览器开发者工具看响应头：首页有安全头，样式文件有 7 天缓存。
8. 打开 robots 地址与 sitemap 地址，两个文件都能看到，sitemap 里的三个地址与实际页面一致。
9. 确认旧配置已备份：备份目录里有改动前的 Nginx 配置，改坏了能按第 18 节恢复。

## 15. 常见错误

错误写法只写在表格与行内代码里，没有写成带围栏的代码块，照抄表格里的错误写法一定会出错。

| 现象 | 常见原因 | 怎么确认 | 怎么改 |
| --- | --- | --- | --- |
| 打开域名是 403 | 网站目录权限不对，或 `index` 没配 | 看 Nginx 错误日志里是不是权限字样 | 目录给读取与执行权限，确认 `index` 写了 `index.html` |
| 打开域名是 404 | `root` 指错了目录，或文件没传上去 | 看服务器上网站目录里有没有这三个文件 | 把 `root` 改对，或把文件传到对的目录 |
| 打开是默认欢迎页 | 自己的配置没启用，或默认配置还在抢域名 | 看 `sites-enabled` 里有没有自己的软链接 | 做软链接，确认没有别的配置抢了同一个域名 |
| HTTP 不跳 HTTPS | 80 的配置没写重定向，或没重载 | 看 HTTP 响应的状态码是不是 301 | 补上重定向，检查语法后重载 |
| www 报证书域名不匹配 | 证书只签了主域名，没签 www | 点开证书看它覆盖了哪几个域名 | 重新申请覆盖主域名与 www 的证书 |
| 页面是无样式的裸文字 | 样式文件路径写错，或样式文件返回 404 | 看样式请求的地址与状态码 | 把页面里的样式路径改对，或把样式文件传到对的位置 |
| 改了文件访客看不到新版 | 浏览器缓存或 CDN 缓存还没过期 | 换个浏览器或无痕模式看是不是新版 | 等缓存过期，或按缓存失效办法刷新，见 OPS-01 |
| 解析改了很久不生效 | TTL 改晚了，旧解析还在各地缓存里 | 查解析返回的 TTL 还剩多少 | 下次上线前提前把 TTL 调小，见 DEPLOY-03 |
| 证书过期后打不开 | 自动续期没配好，或续期后没重载 | 看证书到期日与续期任务 | 按 09-web-hosting/05 把续期与重载补齐 |

## 16. 故障排查

按层定位，不要一上来就改配置。每一层都有一个先查的东西：

1. 解析层：先查域名解析返回的是不是服务器 IP。不是，先去解析控制台改记录；是，再往下查。
2. 连通层：确认 80 与 443 端口是不是都通。端口不通，先查安全组与服务器防火墙，不要改 Nginx。
3. 配置层：跑语法检查，看配置有没有报错；再看 Nginx 错误日志，日志里会写清是哪个文件、哪一行、什么问题。
4. 文件层：确认网站目录里文件都在、名字没错、权限能让 Nginx 读到。文件层的问题最常见，也最好查。
5. 证书层：确认证书域名覆盖了主域名与 www，确认证书没过期，确认续期后重载过 Nginx。
6. 缓存层：确认问题是不是缓存造成的，换个浏览器或无痕模式对照一次，再决定要不要刷新缓存。
7. 浏览器层：确认不是浏览器插件或代理在捣乱，关掉插件、直连再试一次。

日志位置按发行版与安装方式可能不同，常见位置是 `/var/log/nginx/error.log` 与 `/var/log/nginx/access.log`，以自己服务器上的实际路径为准。

## 17. 安全注意事项

- 隐藏文件必须拒绝：配置里的隐藏文件拒绝块不要删，`.git`、`.env` 这类目录一旦能被直接下载，源码与密钥就全漏了。
- 静态文件里不要放密钥：本站没有后端、不需要密钥，如果哪天加了统计或第三方服务，密钥也不要写进页面文件里，见 OPS-02。
- 证书私钥权限要收紧：私钥文件只让 root 与 Nginx 运行用户读到，不要给成所有人可读。
- TLS 只开 1.2 与 1.3：不要为了兼容老浏览器把旧版本放开，旧版本有已知弱点。
- HSTS 上线初期不要设太长：本篇示例设的是 63072000 秒，约两年，适合已经稳定运行的站；刚上线的站先设短时间，确认没问题再改长，见 DEPLOY-03。
- Nginx 与系统要及时更新：安全更新不要拖，更新前先备份配置，见第 18 节。
- 目录浏览不要开：不要给网站目录配自动列目录，访客不应该看到文件清单。

## 18. 回滚和恢复

改配置前先备份，改坏了按下面步骤恢复，不要凭记忆重写：

1. 备份：改配置前把当前配置复制一份到备份目录，文件名带日期，例如备份目录下的 `example.com.2026-11-03`。
2. 改配置：只改一个地方，改完检查语法，语法通过再重载，不要一次改多处。
3. 验证：重载后立刻按第 14 节的前 5 步验证，验证不过马上回滚，不要等访客来报。
4. 回滚配置：把备份的配置文件复制回来，检查语法，重载，重新验证。
5. 回滚文件：把上一版的网站文件复制回来，确认三个页面与样式文件都在，再验证一次。
6. 恢复演练：备份从来不是“存了就行”，每季度至少做一次恢复演练，确认备份文件确实能恢复，见 OPS-04。

## 19. 延伸阅读

- 指南内章节：WEB 篇 HTML 基础与语义化标签、WEB-03 页面 SEO 与无障碍、SRV-01 Nginx 与多站点配置模板、SRV-02 PHP-FPM 与 systemd、DEPLOY-03 HTTPS 与上线全流程、OPS-01 SEO 与性能优化、OPS-02 安全运营、OPS-04 备份与灾难恢复、NET-02 域名购买与备案适用范围、09-web-hosting/05 HTTPS 证书签发与续期。
- 官方文档：Nginx 官方文档的 Beginner's Guide 与 ngx_http_core_module，Let's Encrypt 官方文档的证书申请与续期说明，Google Search Central 的 SEO 入门指南，MDN 的 HTML 与 CSS 参考。
- 下一步：静态站走通后，下一站是带后端与数据库的站，见 PROJ-02 起的实战篇；想把多个站放在一台服务器上，见 PROJ-08。

## 20. 相关章节链接

- 上一篇：[OPS-04 备份、迁移、灾难恢复、RTO/RPO、恢复演练](../ops/04-backup-recovery.md)。
- HTML 基础：[WEB-01 HTML 基础与语义化标签](../html/01-basics.md)。
- 服务器配置：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)。
- 上线流程：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)。
- 运营优化：[OPS-01 SEO、性能、缓存、图片优化、访问统计](../ops/01-seo-performance.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 下一篇：[PROJ-02 WordPress 企业网站 / 博客从零部署](02-wordpress.md)。
