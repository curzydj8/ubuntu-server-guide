# PROJ-02：WordPress 企业网站 / 博客从零部署完整教程

> 任务编号：PROJ-02（网站建设与部署实战指南 · 完整实战第 2 篇）
> 上一篇：[PROJ-01 静态网站从零部署](01-static.md)；下一篇：[PROJ-03 Python 网站（Flask/Django）从零部署](03-python.md)。
> 本篇只讲 WordPress 从零到上线的完整实战：域名解析、服务器准备、PHP + MySQL 环境、WordPress 安装、主题与插件选型方法、Nginx 配置、HTTPS、备份、更新与安全加固。PHP 与数据库基础引用 BE-01 与 DB-01，不重讲；Nginx 模板与运行环境引用 SRV-01 与 SRV-02，不重讲。

## 1. 本章目标

读完并动手做完本篇，你能做到下面五件事：

1. 在一台 Ubuntu 服务器上，从零装好一个能对外访问的 WordPress 站点（企业官网或博客都适用）。
2. 说清楚一次访问的完整链路：浏览器、Nginx、PHP-FPM、MySQL 各自负责哪一段。
3. 独立完成主题与插件的选型判断，不靠“别人说好”就装。
4. 给站点配好 HTTPS、备份与更新流程，上线后有人维护，而不是装完就不管。
5. 遇到白屏、数据库连接失败、固定链接 404 这类常见故障时，知道先查哪个日志、再动哪一步。

## 2. 适用人群

- 已经按 NET-01、NET-02 买好域名、做好解析，并有一台能 SSH 登录的 Ubuntu 服务器的人。
- 会用命令行做最基本的操作（`cd`、`ls`、`sudo`、`nano` 或 `vim` 二选一），不需要会写 PHP。
- 想给公司或自己做一个官网、博客、作品展示站的人；想开网店、会员社区、多语言商城的人，先读完本篇再看第 18 节的边界说明，不要直接拿本篇的配置去跑交易。

## 3. 适用系统和版本

| 项目 | 本篇所用版本 | 说明 |
| --- | --- | --- |
| 服务器系统 | Ubuntu 24.04 LTS 或 26.04 LTS | 命令以 Ubuntu 为准，Debian 系大体通用，路径以本机为准 |
| Web 服务器 | Nginx（SRV-01 核查：开源稳定版 1.30.6，2026-10-14） | Apache 也能跑 WordPress，但本篇只给 Nginx 的完整配置 |
| PHP | 8.3 或更高，示例用 8.4 | WordPress 要求 PHP 8.3 或更高；Ubuntu 24.04 默认仓库是 8.3，装 8.4 需第三方源或用 26.04，若你的仓库只有 8.3，把包名与 socket 路径里的 8.4 换成 8.3 即可 |
| 数据库 | MySQL 8.4 LTS（示例） | MariaDB 也能跑，建库语句通用；默认仓库版本以 `apt` 当场为准 |
| WordPress | 7.1.4（核查日期 2026-11-03） | 7.1.4 是 2026-10-28 发布的安全更新，是当时的当前稳定版；7.2 在核查时仍是 Beta，生产站不要装 Beta，安装时以 wordpress.org 当场公布的最新稳定版为准 |

版本核查方法：WordPress 到 wordpress.org 的下载页与发布日志看最新稳定版；PHP 与 MySQL 到各自官网的发行说明看支持状态。不要凭记忆写版本号，安装当天再查一次。

## 4. 使用前提

- 一个已经注册并实名通过的域名，且域名的解析已经指向你的服务器（解析方法见 NET-02，生效等待见 DEPLOY-03）。
- 一台 Ubuntu 服务器的 root 或 sudo 账号，能 SSH 登录。
- 服务器已放行 80 与 443 端口（云服务器还要在厂商控制台的安全组里放行，只在系统防火墙放行是不够的）。
- 你知道三组口令的分工：服务器 SSH 登录口令或密钥、数据库用户口令、WordPress 管理员口令，三组口令绝不共用同一串。

## 5. 所需资源

| 资源 | 用途 | 备注 |
| --- | --- | --- |
| 1 台服务器 | 跑 Nginx、PHP-FPM、MySQL | 个人博客、企业官网起步用 2 核 4G 足够；流量上来再升级，不要一开始就买大配置 |
| 1 个域名 | 对外访问地址 | 示例全篇用保留域名 `example.com`，读者换成自己的域名 |
| 1 个邮箱 | WordPress 管理员账号的联系邮箱 | 只用于找回密码与通知，不要用不再用的邮箱 |
| 约 1 小时 | 从零到上线 | 含 DNS 生效等待；DNS 刚改完可能要等几分钟到几小时，不要反复改解析 |

## 6. 技术原理

一次打开 WordPress 首页，请求是这样走的：

1. 浏览器按域名查 DNS，拿到服务器 IP，向 443 端口发起 HTTPS 请求。
2. Nginx 收到请求，先看是不是静态文件（图片、CSS、JS），是就直接返回；不是就按 `location ~ \.php$` 的规则交给 PHP-FPM。
3. PHP-FPM 跑 WordPress 的 PHP 代码：读 `wp-config.php` 拿到数据库连接信息，到 MySQL 里查文章、页面、设置。
4. WordPress 把查到的数据套进当前主题的模板，拼成 HTML，沿原路返回给浏览器。
5. 浏览器渲染 HTML，再按需加载图片、CSS、JS，页面才算完整。

三个关键概念，先讲清再动手：

- **主题**：只管“长什么样”（布局、颜色、字体、模板），不管数据存在哪。换主题不丢文章，文章存在数据库里。
- **插件**：只管“多一个功能”（表单、SEO、缓存、安全），每个插件都是一段额外代码。插件越多，出问题时越难定位，装之前先问“这个功能能不能不用插件实现”。
- **wp-config.php**：WordPress 唯一的数据库与密钥配置文件，放在网站根目录。数据库名、用户、口令、8 个密钥、表前缀全在这里，权限必须收紧（见第 11 节）。

## 7. 架构说明

本篇的部署拓扑是单服务器三层，结构如下：

| 层 | 组件 | 位置 | 对外暴露 |
| --- | --- | --- | --- |
| Web 层 | Nginx | 服务器本机 | 80、443 对外 |
| 应用层 | PHP-FPM + WordPress 程序 | `/var/www/example.com` | 不对外，只接受 Nginx 转发的请求 |
| 数据层 | MySQL | 服务器本机 | 不对外，只接受本机连接（`localhost`） |

目录规划（全文统一用这套路径，换域名时只换 `example.com` 这一段）：

| 路径 | 放什么 |
| --- | --- |
| `/var/www/example.com` | WordPress 程序根目录，Nginx 的 `root` 就指这里 |
| `/var/www/example.com/wp-content/uploads` | 上传的图片与附件，WordPress 运行时要能写 |
| `/var/www/example.com/wp-content/themes` | 主题目录 |
| `/var/www/example.com/wp-content/plugins` | 插件目录 |
| `/etc/nginx/sites-available/example.com` | 本站的 Nginx 配置文件 |
| `/etc/letsencrypt/live/example.com/` | HTTPS 证书目录（用 Certbot 申请后自动生成） |
| `/var/backups/wordpress` | 备份输出目录（见第 11 节） |

运行用户统一用 `www-data`（Ubuntu 自带的 Web 运行用户），不要用 root 跑网站，也不要把网站目录属主设成 root 后再用 777 权限“解决”写不进的问题。

## 8. 操作前检查

动手前先在服务器上逐项核对，缺一项就先补齐，不要跳过检查直接装：

| 检查项 | 命令 | 应看到的样子 |
| --- | --- | --- |
| 系统版本 | `lsb_release -a` | Ubuntu 24.04 或 26.04 字样 |
| PHP 版本 | `php -v` | 8.3 或更高字样（装完第 9.2 步后再查） |
| Nginx 配置语法 | `nginx -t` | `syntax is ok` 与 `test is successful` |
| 域名解析 | `dig +short example.com` | 返回你的服务器公网 IP（把 `example.com` 换成自己的域名） |
| 端口放行 | `ss -tlnp \| grep -E ':80|:443'` | 80 与 443 处于监听状态（装完 Nginx 后再查） |
| 磁盘空间 | `df -h /` | 剩余空间至少 5G，图片多的站留更多 |

## 9. 逐步操作

全程在服务器上操作，目录是家目录起步，凡是写配置文件的步骤都先备份原文件再改。

### 9.1 域名解析

在域名注册商或 DNS 服务商处加一条 A 记录：主机记录 `@`（或按服务商的写法填空），记录值填服务器公网 IP，TTL 先用 600（上线稳定后再改大）。如果要同时用 `www.example.com`，再加一条 `www` 的 A 记录或 CNAME 记录，二选一，不要同时存在（见 DEPLOY-03 第 9.4 节的说明）。加完后用 `dig +short example.com` 核对，返回的 IP 对不上就先不要往下装，等解析生效。

### 9.2 装 Nginx、PHP、MySQL

```bash
sudo apt update
sudo apt install -y nginx mysql-server
sudo apt install -y php8.4-fpm php8.4-mysql php8.4-xml php8.4-curl php8.4-mbstring php8.4-zip php8.4-gd php8.4-intl
php -v
sudo systemctl enable --now nginx php8.4-fpm mysql
```

注意：如果你的仓库只有 PHP 8.3，把上面包名与后面 socket 路径里的 `8.4` 全部换成 `8.3`。装完后 `php -v` 的输出里要有 8.3 或 8.4 字样才算装对。

### 9.3 建数据库与数据库用户

用 root 身份进 MySQL（Ubuntu 上 `sudo mysql` 默认走 socket 认证，不需要 root 口令）：

```bash
sudo mysql
```

在 MySQL 提示符里逐行执行（口令处填你自己的真实口令，不要照抄占位符）：

```sql
CREATE DATABASE wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wpuser'@'localhost' IDENTIFIED BY '请填真实口令';
GRANT ALL PRIVILEGES ON wordpress.* TO 'wpuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

说明：数据库名 `wordpress`、用户名 `wpuser` 只是示例，换成你自己的也可以，但第 10 节的 `wp-config.php` 里必须写成同一套；`utf8mb4` 是 WordPress 的标准字符集，不要用 `utf8`（存不了 emoji）。

### 9.4 下载 WordPress 并摆好目录与权限

```bash
cd /tmp
curl -O https://wordpress.org/latest.tar.gz
tar -xzf latest.tar.gz
sudo mkdir -p /var/www/example.com
sudo cp -a wordpress/. /var/www/example.com/
sudo chown -R www-data:www-data /var/www/example.com
sudo find /var/www/example.com -type d -exec chmod 755 {} \;
sudo find /var/www/example.com -type f -exec chmod 644 {} \;
```

`latest.tar.gz` 永远指向当场最新的稳定版，不要去下载某个旧版本号的包，除非你有明确理由并且知道旧版的风险。

### 9.5 写 wp-config.php

把根目录下的 `wp-config-sample.php` 复制成 `wp-config.php` 再改，不要直接改样本文件：

```bash
sudo cp /var/www/example.com/wp-config-sample.php /var/www/example.com/wp-config.php
sudo nano /var/www/example.com/wp-config.php
```

要改的项见第 10 节的完整示例。8 个密钥不要自己编，到 `https://api.wordpress.org/secret-key/1.1/salt/` 打开一次，复制整段结果替换掉样本里的 8 行。改完后把文件权限收紧：

```bash
sudo chmod 640 /var/www/example.com/wp-config.php
sudo chown www-data:www-data /var/www/example.com/wp-config.php
```

### 9.6 写 Nginx 配置并申请 HTTPS

Nginx 配置全文见第 11 节，写到 `/etc/nginx/sites-available/example.com`，做软链接到 `sites-enabled`，检查语法后重载：

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 用 Certbot 申请（先装 `certbot` 与 `python3-certbot-nginx`，再跑 `sudo certbot --nginx -d example.com -d www.example.com`，按提示选“重定向 HTTP 到 HTTPS”）。证书申请的细节引用 09-web-hosting/05 的已有内容，这里不重讲。申请成功后证书文件就在 `/etc/letsencrypt/live/example.com/`，第 11 节的配置里写的是这个路径。

### 9.7 跑安装向导

浏览器打开 `https://example.com`，看到 WordPress 的安装向导就按提示填：站点标题、管理员用户名、管理员口令、管理员邮箱。管理员用户名不要用 `admin`（最容易被猜到），口令用向导自带的强口令生成器生成并存到你自己的密码管理工具里，不要记在纸上、不要发给别人。装完后先不要急着装主题和插件，先按第 14 节把验证做完。

### 9.8 第一批设置

装完后进后台（`https://example.com/wp-admin`）做下面这几项，再开始写文章：

1. 设置、固定链接：选“文章名”结构（`/%postname%/`），不要用默认的 `?p=123`，对 SEO 和可读性都好。
2. 设置、常规：确认站点地址与 WordPress 地址都是 `https://example.com`，不要一处 http 一处 https。
3. 设置、媒体：确认上传路径与文件大小上限够用（不够用时改 PHP-FPM 的 `upload_max_filesize`，见 SRV-02）。
4. 用户、个人资料：确认管理员邮箱能收到邮件（找回密码就靠它）。
5. 外观、主题：先用默认主题跑通，再按第 10.5 节的方法选主题，不要一次装五六个主题比着看。

## 10. 完整代码

本节把第 9 节的步骤收成一份从头到尾能照着敲的完整实战，目录是服务器家目录起步，凡是换域名、换口令的地方都已标出。反面例子不在本节，本节只给正确写法；错误写法见第 15 节的表格（行内代码，不写成代码块）。

### 10.1 完整安装命令序列

```bash
sudo apt update
sudo apt install -y nginx mysql-server
sudo apt install -y php8.4-fpm php8.4-mysql php8.4-xml php8.4-curl php8.4-mbstring php8.4-zip php8.4-gd php8.4-intl
sudo systemctl enable --now nginx php8.4-fpm mysql
sudo mysql -e "CREATE DATABASE wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'wpuser'@'localhost' IDENTIFIED BY '请填真实口令';"
sudo mysql -e "GRANT ALL PRIVILEGES ON wordpress.* TO 'wpuser'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"
cd /tmp
curl -O https://wordpress.org/latest.tar.gz
tar -xzf latest.tar.gz
sudo mkdir -p /var/www/example.com
sudo cp -a wordpress/. /var/www/example.com/
sudo chown -R www-data:www-data /var/www/example.com
sudo find /var/www/example.com -type d -exec chmod 755 {} \;
sudo find /var/www/example.com -type f -exec chmod 644 {} \;
sudo cp /var/www/example.com/wp-config-sample.php /var/www/example.com/wp-config.php
sudo chmod 640 /var/www/example.com/wp-config.php
sudo chown www-data:www-data /var/www/example.com/wp-config.php
```

注意：上面 `IDENTIFIED BY` 后面的占位符必须换成你自己的真实口令再执行；`mysql -e` 里的口令会留在 shell 历史里，执行完后按第 17 节的方法清掉历史或改用交互式 `sudo mysql` 再粘贴 SQL。

### 10.2 wp-config.php 关键项（完整，无省略）

下面是 `wp-config.php` 里必须改对的全部关键项，文件位置是 `/var/www/example.com/wp-config.php`。8 个密钥的真实值到 `https://api.wordpress.org/secret-key/1.1/salt/` 生成后替换，示例里写占位符，不要照抄占位符上线：

```php
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'wpuser' );
define( 'DB_PASSWORD', '请填真实口令' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
define( 'AUTH_KEY',         '请替换为随机字符串' );
define( 'SECURE_AUTH_KEY',  '请替换为随机字符串' );
define( 'LOGGED_IN_KEY',    '请替换为随机字符串' );
define( 'NONCE_KEY',        '请替换为随机字符串' );
define( 'AUTH_SALT',        '请替换为随机字符串' );
define( 'SECURE_AUTH_SALT', '请替换为随机字符串' );
define( 'LOGGED_IN_SALT',   '请替换为随机字符串' );
define( 'NONCE_SALT',       '请替换为随机字符串' );
$table_prefix = 'wp_';
define( 'WP_DEBUG', false );
```

### 10.3 固定链接与上传限制的配套改动

固定链接选“文章名”后，Nginx 的 `try_files` 规则（第 11 节）是让它生效的关键，Apache 的 `.htaccess` 规则在 Nginx 站点上不起作用，不要把 `.htaccess` 文件复制过来指望它生效。上传文件大小不够用时，改 PHP-FPM 的配置（文件位置见 SRV-02），改下面两项后重载 PHP-FPM：

```ini
upload_max_filesize = 64M
post_max_size = 64M
```

64M 只是示例值，图片多的站可以再放大，视频多的站不要靠 WordPress 直接传大视频，改走对象存储或视频平台嵌入。

### 10.4 主题与插件选型方法（只给维度，不点名推荐）

主题与插件都按下面这张表逐项打分，不要只看下载量与星级：

| 维度 | 主题怎么看 | 插件怎么看 |
| --- | --- | --- |
| 维护状态 | 最近更新时间、是否声明兼容当前 WordPress 大版本 | 同左，超过一年没更新的先放一边 |
| 兼容性 | 是否支持当前 WordPress 版本与 PHP 版本 | 是否声明支持当前 WordPress 与 PHP 版本 |
| 评价质量 | 看差评写的是什么（是功能缺失还是安全与兼容问题） | 同左，重点看差评里的兼容与安全问题 |
| 支持渠道 | 有没有公开的支持论坛与文档 | 同左，付费插件看支持响应是否还在 |
| 代码来源 | 只从 wordpress.org 主题与插件目录或官方渠道装 | 同左，绝不装来路不明的“破解版”“免费版” |
| 功能边界 | 一个主题只负责外观，不要用主题实现商城、会员、表单 | 一个插件只做一件事，功能重叠的插件只留一个 |
| 性能代价 | 装之前记一次首页加载情况，装之后再测一次，变慢明显就换掉 | 同左 |

选型红线：不要装“破解版”“去授权版”主题与插件，那些包里夹带后门的概率很高，省下的授权费不够一次清理入侵的成本；不要一次装十几个插件再慢慢删，先装必需的，缺什么功能再补一个。

## 11. 完整配置文件（注明存放路径）

### 11.1 Nginx 配置全文

文件位置：`/etc/nginx/sites-available/example.com`，并用软链接挂到 `/etc/nginx/sites-enabled/`。下面是全文，无省略：

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com www.example.com;
    root /var/www/example.com;
    index index.php index.html;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }

    location = /xmlrpc.php {
        deny all;
    }
}
```

说明：`http2 on;` 要求 Nginx 1.25.1 或更高（SRV-01 核查的 1.30.6 满足），更老的 Nginx 请把 `http2 on;` 删掉、把监听行写成 `listen 443 ssl http2;`。`www.example.com` 在本例里与主域名同站服务；如果你想让 `www` 统一跳到不带 `www` 的主域名，再加一个单独的 `server` 块做 301，做法见 DEPLOY-03 的多站点写法，不要在本块里把 `server_name` 改来改去。`xmlrpc.php` 直接拒绝是出于安全考虑（见第 17 节），如果你确实要用需要 XML-RPC 的客户端发文章，再把这一段删掉并做好限流。

### 11.2 wp-config.php 存放与权限全文说明

文件位置：`/var/www/example.com/wp-config.php`，全文结构是样本文件加第 10.2 节的改动，样本文件其余部分（`ABSPATH` 定义与 `require_once ABSPATH . 'wp-settings.php';`）保持原样，不要删。权限要求全文如下：

```bash
sudo chown www-data:www-data /var/www/example.com/wp-config.php
sudo chmod 640 /var/www/example.com/wp-config.php
ls -l /var/www/example.com/wp-config.php
```

`ls -l` 的输出里属主应为 `www-data`、权限应为 `-rw-r-----`，不是 644 也不是 777。网站根目录其余文件保持 644、目录保持 755（第 9.4 节已设好），只有 `wp-content/uploads` 需要 Web 用户可写，属主 `www-data` 已覆盖这一点，不需要再把 `uploads` 单独设成 777。

### 11.3 备份定时任务全文

文件位置：`/etc/cron.daily/wordpress-backup`（可执行权限），每天跑一次，输出到 `/var/backups/wordpress`。数据库口令通过凭据文件引用，不写进脚本：

```bash
#!/bin/bash
set -e
BACKUP_DIR="/var/backups/wordpress"
DATE="$(date +%F)"
mkdir -p "$BACKUP_DIR"
mysqldump --defaults-extra-file=/root/.my-wp.cnf wordpress > "$BACKUP_DIR/db-$DATE.sql"
tar -czf "$BACKUP_DIR/files-$DATE.tar.gz" -C /var/www example.com
find "$BACKUP_DIR" -type f -mtime +14 -delete
```

凭据文件 `/root/.my-wp.cnf` 的权限必须是 600，内容只有数据库用户与口令两行（口令填真实值，不要写进脚本正文）。`find ... -mtime +14 -delete` 是只保留 14 天的意思，保留天数按自己的磁盘与需求改，改之前先确认异地还有一份备份（见第 18 节）。

## 12. 每个关键配置项的解释

### 12.1 Nginx 配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `listen 80;` 与 `return 301 https://example.com$request_uri;` | HTTP 请求全部 301 跳到 HTTPS，`$request_uri` 保留原路径与参数 | 不写跳转，http 与 https 两个版本并存，SEO 权重分散，还会 mixed content |
| `root /var/www/example.com;` | 网站根目录，Nginx 按这个路径找文件 | 指错目录，首页 404 或看到别的站的内容 |
| `index index.php index.html;` | 目录请求时先找 `index.php`，没有再找 `index.html` | 顺序反了，WordPress 首页可能被静态页抢掉 |
| `try_files $uri $uri/ /index.php?$args;` | 先找真实文件，再找目录，最后交给 WordPress 处理（固定链接就靠它） | 没有这一行，固定链接一律 404，只能用 `?p=123` |
| `fastcgi_pass unix:/run/php/php8.4-fpm.sock;` | PHP 请求交给 PHP-FPM 的 socket，版本号要与装的 PHP 一致 | 版本号对不上，PHP 文件下载下来或报 502 |
| `ssl_certificate` 与 `ssl_certificate_key` | 证书与私钥路径，Certbot 申请后自动生成 | 路径错了，Nginx 启动失败，`nginx -t` 会直接报错 |
| `location ~ /\.ht` 的 `deny all;` | 拒绝访问以 `.ht` 开头的文件（Apache 的配置文件在 Nginx 下没有用，但也不应被下载） | 不写，敏感配置文件可能被直接下载 |
| `location = /xmlrpc.php` 的 `deny all;` | 关掉 XML-RPC 入口，挡掉一类常见的暴力探测 | 不写也不一定会出事，但没用到的入口关掉更干净 |

### 12.2 wp-config.php 关键项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `DB_NAME`、`DB_USER`、`DB_PASSWORD`、`DB_HOST` | 数据库名、用户、口令、主机（本机填 `localhost`） | 任一项错了，安装向导或首页报“建立数据库连接时出错” |
| `DB_CHARSET` 为 `utf8mb4` | 字符集，支持 emoji 与生僻字 | 用 `utf8`，emoji 存进去变问号 |
| 8 个密钥与盐 | 登录 Cookie 与 Nonce 的签名盐，换掉后所有人要重新登录 | 留空或照抄示例，Cookie 可被伪造的风险变大；上线前必须换成生成的值 |
| `$table_prefix` 为 `wp_` | 表前缀，默认 `wp_` 即可 | 同一个库装多个 WordPress 才需要改前缀，改了之后不要再改回去 |
| `WP_DEBUG` 为 `false` | 生产站关闭调试输出 | 设成 `true` 上线，报错信息会把路径与 SQL 细节暴露给访客 |

## 13. 执行结果示例

下面全部是“读者在自己服务器上应看到的样子（示例输出），不是本机实测输出”。本篇没有在本机安装真实 WordPress，所以不要把下面的输出当成实测记录；第 14 节写了读者在自己服务器上验证的步骤。

### 13.1 安装向导与首页

浏览器打开 `https://example.com`，安装向导应显示站点标题、用户名、口令、邮箱四项输入框，填完点安装后应跳转到登录页，提示安装成功。登录后打开首页，应看到默认主题的首页与一篇示例文章（Hello World），地址栏应为 `https://` 开头且无证书警告。

### 13.2 命令行检查示例

```text
$ php -v
PHP 8.4.12 (cli)

$ sudo nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful

$ ls -l /var/www/example.com/wp-config.php
-rw-r----- 1 www-data www-data 4051 Nov  3 23:00 /var/www/example.com/wp-config.php

$ sudo mysql -e "SHOW TABLES FROM wordpress;" | head
Tables_in_wordpress
wp_commentmeta
wp_comments
wp_options
wp_posts
wp_users
```

文件大小与时间以读者本机为准，关键是 `php -v` 有 8.3 或 8.4 字样、`nginx -t` 两行都通过、`wp-config.php` 的权限是 `-rw-r-----`、数据库里有 `wp_` 开头的表。

## 14. 成功验证

按顺序做完下面 8 步，全部通过才算装好，缺一步就先修一步再往下走：

1. 首页：浏览器打开 `https://example.com`，页面正常显示，地址栏无证书警告，`http://example.com` 会自动跳到 `https://`。
2. 后台：打开 `https://example.com/wp-admin`，用安装向导里设的管理员账号能登录，仪表盘无报错。
3. 发文章：新建一篇测试文章并发布，前台能打开，固定链接是文章名结构（不是 `?p=123`）。
4. 传图片：媒体库上传一张图片，文章里能正常显示，说明 `uploads` 目录可写。
5. 换主题：先在后台换一个默认主题，前台样式跟着变，说明主题目录正常；换完后再换回你要用的主题。
6. 装插件：装一个必需插件并启用，前台与后台都无报错，说明插件目录正常。
7. 备份：手动跑一次第 11.3 节的备份脚本，确认 `/var/backups/wordpress` 里有当天的数据库与文件备份，再按第 18 节的办法在一台测试目录里恢复一次，确认备份不是空文件。
8. 更新：后台“仪表盘、更新”里确认核心、主题、插件都没有待处理的安全更新，有就先更新再对外宣传。

## 15. 常见错误

错误写法只写在表格与行内代码里，不写成代码块，免得复制时把错误写法当成正确写法。

| 现象 | 最可能的原因 | 先查什么 |
| --- | --- | --- |
| 首页或后台一片空白（白屏） | 某个插件或主题与当前 PHP、WordPress 版本不兼容，或 `WP_DEBUG` 被关掉所以看不到报错 | 先把 `wp-content/plugins` 临时改名，看后台能不能进；能进就是插件问题，再逐个恢复定位 |
| 建立数据库连接时出错 | `wp-config.php` 里的数据库名、用户、口令、主机四项有一项错了，或 MySQL 没启动 | 先看 `wp-config.php` 四项，再看 `systemctl status mysql`，最后用同一套账号手动连一次 MySQL |
| 文章页 404，但首页正常 | 固定链接用了文章名结构，但 Nginx 没有 `try_files` 规则 | 看第 11.1 节的 `location /` 块有没有 `try_files $uri $uri/ /index.php?$args;` |
| 上传图片失败或提示无法写入 | `uploads` 目录属主或权限不对 | 看 `ls -ld /var/www/example.com/wp-content/uploads`，属主应为 `www-data`，不要用 777 解决 |
| 图片、样式走 http，浏览器报 mixed content | 站点地址或 WordPress 地址有一处写成了 `http://`，或文章里贴了 `http://` 的图片地址 | 看设置、常规里的两个地址，再看文章里的图片地址是不是 `http://` 开头 |
| 后台提示“需要更新数据库”后进不去 | 核心、主题、插件版本跨度太大，或更新中途被打断 | 先备份数据库与文件，再按第 18 节的恢复办法回退到更新前，逐个更新不要一次全更 |
| 证书过期或浏览器报证书不可信 | Certbot 自动续期没跑起来，或域名解析改了但证书没重签 | 看证书到期日与 `certbot renew --dry-run` 的输出，细节见 09-web-hosting/05 |

## 16. 故障排查

按下面这个顺序查，不要一上来就重装：

1. **看 Nginx 错误日志**：`/var/log/nginx/error.log`，502、404、权限问题都会先写在这里。
2. **看 PHP-FPM 日志**：`/var/log/php8.4-fpm.log`（版本号按实际安装的换），PHP 执行出错、子进程异常都在这里。
3. **开一次调试**：把 `wp-config.php` 里的 `WP_DEBUG` 临时改成 `true`，再加 `WP_DEBUG_LOG` 与 `WP_DEBUG_DISPLAY` 两项（调试日志写到 `wp-content/debug.log`，页面上不直接显示），复现一次问题后看日志，查完立刻改回 `false`，不要让调试模式留在生产站上。
4. **二分法定位插件与主题**：插件全停用后问题消失，就是插件问题；再逐个启用定位到某一个。主题换回默认主题后问题消失，就是主题问题。
5. **查数据库**：`sudo mysql -e "SHOW TABLES FROM wordpress;"` 确认表还在；`wp_options` 表里的 `siteurl` 与 `home` 两项必须与当前域名一致，域名换了但这两项没换，登录会一直跳回旧域名。
6. **查磁盘与内存**：`df -h` 看磁盘满没满，`free -h` 看内存够不够用，磁盘满了先清日志与旧备份，不要直接删数据库文件。

## 17. 安全注意事项

- **更新是第一道防线**：WordPress 核心、主题、插件的安全更新不要拖，拖一周就多一周的已知漏洞暴露期；更新前先备份（第 11.3 节），更新后按第 14 节复查一遍。
- **口令分开、权限收紧**：服务器、数据库、WordPress 管理员三组口令绝不共用；`wp-config.php` 640、`uploads` 以外目录 755、文件 644，不要用 777。
- **管理员账号**：不要用 `admin` 做用户名；管理员邮箱用能收到邮件的；不用的管理员账号及时删掉或降级。
- **文件编辑关掉**：生产站建议在 `wp-config.php` 里加 `define( 'DISALLOW_FILE_EDIT', true );`，关掉后台的外观与插件文件编辑器，改代码走服务器文件，出了问题有迹可查。
- **登录加固**：装一个正规的登录限流或双因素插件（按第 10.4 节的维度选），不要只靠改后台地址“隐藏”来防暴力破解，隐藏地址挡不住扫描。
- **主题与插件来源**：只从 wordpress.org 官方目录或官方渠道装，绝不装“破解版”“去授权版”，那些包里夹带后门是常见入侵来源。
- **备份与密钥**：备份文件不要放在网站根目录下让人能直接下载；数据库口令与密钥只放在 `wp-config.php` 与凭据文件里，不要写进文章、工单、聊天记录。
- **XML-RPC 与 REST 接口**：第 11.1 节已把 `xmlrpc.php` 关掉；REST 接口是 WordPress 正常功能，不要整个关掉，确实用不到的接口再按需限制，不要照抄网上的“一刀切”配置把编辑器与小程序接口一起断掉。

## 18. 回滚和恢复

### 18.1 回滚原则

回滚先分清是哪一层出的问题，再动哪一层：主题或插件更新出问题，回退主题或插件；WordPress 核心更新出问题，回退核心并恢复数据库；服务器配置改错了，回退配置文件并 `nginx -t` 通过后再重载。不要一出问题就整个站删掉重装，重装会丢掉没备份的上传文件与设置。

### 18.2 从备份恢复的完整步骤

1. 停掉对外写入：先在 Nginx 里临时返回维护页，或直接停掉 PHP-FPM，避免恢复过程中又有新数据写进来。
2. 恢复文件：把第 11.3 节的 `files-日期.tar.gz` 解压到临时目录，核对一遍后再覆盖到 `/var/www/example.com`，覆盖后重新设好属主与权限（第 9.4 节的四条命令）。
3. 恢复数据库：先把当前数据库导出一份（万一恢复错了还能回来），再导入备份的 `db-日期.sql`。
4. 核对域名：恢复后看 `wp_options` 表里的 `siteurl` 与 `home` 是不是当前域名，不是就改过来。
5. 重启与验证：重载 Nginx 与 PHP-FPM，按第 14 节的 8 步重新验证一遍，全部通过再对外开放。
6. 恢复后 24 小时内留意错误日志，有异常先按第 16 节的顺序查，不要等用户反馈才处理。

### 18.3 边界：本篇配置不适合直接跑的场景

- 网店、会员付费、订单交易：还要补支付、订单、税务、合规与更高级别的备份与监控，本篇的单服务器配置只是起点，不要直接拿去收钱。
- 高并发活动页、大流量秒杀：单服务器 + 单 MySQL 扛不住突发流量，要先看 OPS-01 与 OPS-03，再决定要不要上缓存、读写分离或多机。
- 多站点网络（Multisite）：WordPress 的多站点模式要在安装前就定好子域名还是子目录，装完单站点再改多站点要动数据库与配置，不在本篇范围内，动手前先读官方的多站点文档。

## 19. 延伸阅读

- WordPress 官方文档：安装、主题开发、插件开发、REST API 参考（以官网当场内容为准，版本号以安装当天查到的为准）。
- 本指南：PHP 框架见 BE-01，数据库基础见 DB-01，运行环境与进程管理见 SRV-02，上线全流程见 DEPLOY-03，安全运营见 OPS-02，备份与灾难恢复见 OPS-04。
- 本指南：域名与备案见 NET-02，HTTPS 证书签发与续期见 09-web-hosting/05，Nginx 模板对照见 SRV-01。

## 20. 相关章节链接

- PHP 基础与运行环境：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](../backend/01-php.md)、[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)。
- 数据库基础：[DB-01 数据库选型、表设计、SQL、索引、事务、连接池](../database/01-design.md)。
- 上线与运营：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 下一篇：[PROJ-03 Python 网站（Flask/Django）从零部署](03-python.md)
