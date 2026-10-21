---
description: "LNMP 指 Linux、Nginx、MySQL、PHP 四件套，LAMP 把其中的 Nginx 换成 Apache。这一章带你在 Ubuntu 上用系统官方软件源把整套环境手工装起来，"
---

# 经典 LNMP/LAMP 自建

## 一、概述与使用场景

LNMP 指 Linux、Nginx、MySQL、PHP 四件套，LAMP 把其中的 Nginx 换成 Apache。这一章带你在 Ubuntu 上用系统官方软件源把整套环境手工装起来，装到能跑通一个 PHP 测试页、数据库完成安全初始化为止。走这条路的收获是每一份配置在哪里、每一行参数是什么意思全部清楚，后续调性能、查故障、做迁移都有底。

适用场景包括：长期运营的正式站点，需要精确控制 PHP 版本和扩展、数据库参数、缓存调优；同一台机器跑多个站点，要按站点隔离日志和进程池；团队有明确规范，不希望依赖面板的封装行为。不适用的场景是临时演示和一次性活动页，那种需求用面板或 Docker 更快。

不打好这套基础的瓶颈很具体：用开发机的默认配置上生产，MySQL 监听公网且 root 可远程登录，PHP 错误信息直接回显给访客，Nginx 没有拆分站点日志，出事时连谁在报错都分不清。本章每一步都按生产可用的标准写，宁可多敲两条命令，也不留默认裸奔的配置。

Nginx 与 Apache 的取舍：Nginx 资源占用低、处理静态文件和反向代理能力强，新项目优先选 LNMP。Apache 的优势是 htaccess 目录级配置和老牌 PHP 程序的兼容习惯，已有程序明确要求 Apache 或依赖 htaccess 规则时选 LAMP。两者装法本章都给全，实际部署二选一，不要在同一台机器上同时抢 80 端口。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。两个版本的 apt 包名在本章范围内一致：nginx、apache2、mysql-server、mariadb-server、php-fpm 以及按版本区分的 php8.1-fpm 和 php8.3-fpm 等。
- 版本差异提示：Ubuntu 22.04 自带的 PHP 是 8.1 系列，24.04 自带的是 8.3 系列。下文出现的 php8.1-fpm 字样在 24.04 上替换为 php8.3-fpm，php-fpm 的配置目录 /etc/php/8.1/fpm 同理替换为 /etc/php/8.3/fpm。

!!! note "版本对应关系"
    不需要死记版本号。装完 php-fpm 后执行 ls /etc/php/ 就能看到当前系统实际的 PHP 版本目录，后续所有路径以你机器上看到的目录为准。本章命令默认以 22.04 和 PHP 8.1 举例，24.04 用户按上一段说明替换。

- 权限：可使用 sudo 的账号，例如 ubuntu。
- 网络与端口：UFW 和云安全组放行 80、443；MySQL 的 3306 只允许本机访问，不对公网放行。
- 准备命令：

```bash
sudo apt update
sudo apt upgrade -y
sudo timedatectl set-timezone Asia/Shanghai
timedatectl
```

## 三、手把手操作步骤

### 3.1 安装 Nginx 路线所需组件

一次性安装 Nginx、PHP-FPM 和常用 PHP 扩展：

```bash
sudo apt install -y nginx php-fpm php-mysql php-cli php-curl php-gd php-mbstring php-xml php-zip php-bcmath
sudo systemctl status nginx php8.1-fpm --no-pager
```

装 MySQL 官方版执行：

```bash
sudo apt install -y mysql-server
sudo systemctl status mysql --no-pager
```

想用 MariaDB 替代 MySQL 时，不要再装 mysql-server，改装下面这一组，二者只能选一个，混装会冲突：

```bash
sudo apt install -y mariadb-server mariadb-client
sudo systemctl status mariadb --no-pager
```

### 3.2 Apache 路线所需组件

选 LAMP 时跳过 Nginx，改装 Apache 和它的 PHP 模块：

```bash
sudo apt install -y apache2 libapache2-mod-php php php-mysql php-cli php-curl php-gd php-mbstring php-xml php-zip
sudo a2enmod rewrite
sudo systemctl restart apache2
sudo systemctl status apache2 --no-pager
```

数据库部分同样在 mysql-server 与 mariadb-server 之间二选一，命令与上一小节相同。a2enmod rewrite 是打开 Apache 的地址重写模块，大量 PHP 程序的伪静态规则依赖它，不打开会出现首页能开、内页全部 404 的现象。

### 3.3 备份并编写 Nginx 虚拟主机

先建站点目录，再备份默认配置，最后写新站点配置：

```bash
sudo mkdir -p /var/www/example.com/html
sudo chown -R www-data:www-data /var/www/example.com
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak.20260101
sudo nano /etc/nginx/sites-available/example.com
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/example.com/html;
    index index.php index.html index.htm;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

逐行讲解：listen 声明监听 80 端口，方括号一行是 IPv6。server_name 绑定域名，与第 01 章的解析记录对应。root 是站点根目录。index 的顺序把 index.php 放第一个，保证 PHP 程序首页优先。两个 log 指令按站点拆日志。location 斜杠块里 try_files 的意思是先找真实文件，再找目录，最后交给 index.php 处理，这是多数 PHP 框架需要的写法。正则 location 块专门处理以 .php 结尾的请求，include 引入系统自带的 FastCGI 参数片段，fastcgi_pass 把请求交给 PHP-FPM 的 Unix 套接字，路径中的版本号要与本机一致。最后一个块禁止访问以 .ht 开头的文件，防止配置类文件被下载。启用站点并重载：

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com
sudo nginx -t
sudo systemctl reload nginx
```

### 3.4 Apache 虚拟主机写法

选 Apache 路线时，配置文件在 /etc/apache2/sites-available/ 下。先备份再新建：

```bash
sudo cp /etc/apache2/sites-available/000-default.conf /etc/apache2/sites-available/000-default.conf.bak.20260101
sudo nano /etc/apache2/sites-available/example.com.conf
```

```apache
<VirtualHost *:80>
    ServerName example.com
    ServerAlias www.example.com
    DocumentRoot /var/www/example.com/html

    <Directory /var/www/example.com/html>
        Options -Indexes
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/example.com-error.log
    CustomLog ${APACHE_LOG_DIR}/example.com-access.log combined
</VirtualHost>
```

逐行讲解：VirtualHost 星号加 80 表示监听全部地址的 80 端口。ServerName 是主域名，ServerAlias 是附带域名。DocumentRoot 对应 Nginx 的 root。Directory 块控制目录权限，减号 Indexes 表示禁止列目录清单，AllowOverride All 允许程序用 htaccess 覆盖规则，伪静态就靠它。最后两行按站点拆分错误日志和访问日志。启用站点：

```bash
sudo a2ensite example.com.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

### 3.5 写 PHP 测试页验证全链路

在站点根目录放一个探针页，验证 Web 服务能把 PHP 交给解释器执行：

```bash
sudo nano /var/www/example.com/html/info.php
```

```php
<?php
phpinfo();
```

本地验证命令在第四部分给出。测试页确认无误后必须删除，这个页面会把系统路径、扩展清单和配置细节全部暴露给访客，是经典的信息泄露入口：

```bash
sudo rm /var/www/example.com/html/info.php
```

正式程序还需要一个能连数据库的最小测试页时，用完同样删除，页面里的数据库密码使用占位符，不要把真实密码写进任何会长期留在站点目录的文件：

```php
<?php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=appdb', 'appuser', '<db-password>');
echo 'db ok';
```

### 3.6 MySQL 安全初始化

MySQL 装完默认状态不适合直接上生产，要做安全初始化。Ubuntu 的 mysql-server 包自带初始化脚本，先给 root 设定或确认认证方式，再运行脚本：

```bash
sudo mysql_secure_installation
```

脚本会依次询问：是否启用密码强度校验组件，正式环境选启用；给 root 设置高强度密码并存入密码管理器；是否删除匿名用户，选是；是否禁止 root 远程登录，选是；是否删除 test 测试库，选是；是否立即重载权限表，选是。

MariaDB 同样提供同名脚本，命令相同：

```bash
sudo mariadb-secure-installation
```

如果你的版本没有提供脚本，用等效 SQL 手工完成同样四件事。先备份会话思路再执行，进入数据库：

```bash
sudo mysql
```

```sql
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\_%';
FLUSH PRIVILEGES;
```

再为业务程序单独建库和最小权限账号，禁止让程序用 root 连库：

```sql
CREATE DATABASE appdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY '<db-password>';
GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

最后确认数据库只监听本机。改配置前先备份：

```bash
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.bak.20260101
sudo grep -E 'bind-address|port' /etc/mysql/mysql.conf.d/mysqld.cnf
```

确认 bind-address 的值是 127.0.0.1。若被改成了 0.0.0.0，改回本机地址并重启服务：

```bash
sudo systemctl restart mysql
sudo ss -tlnp | grep 3306
```

## 四、效果验证与测试

按从外到内的顺序验证：

```bash
systemctl is-active nginx php8.1-fpm mysql
curl -I http://127.0.0.1
curl http://www.example.com/info.php | head -n 20
sudo nginx -t
sudo tail -n 20 /var/log/nginx/example.com.error.log
```

期望结果：is-active 三行都返回 active；curl 本机地址返回状态行 HTTP/1.1 200；访问 info.php 能在浏览器看到 PHP 信息页，页面顶部版本号与 ls /etc/php/ 看到的版本一致，说明请求确实经过了 PHP-FPM 而不是把源码当文本下载；数据库用新建的业务账号能登录并能看到 appdb，用 root 从另一台机器远程连接应被拒绝：

```bash
mysql -u appuser -p -e "SHOW DATABASES;"
sudo mysql -e "SELECT user, host FROM mysql.user;"
```

第二条的输出里不应再有空用户名和允许任意主机的 root 记录。

## 五、常见错误与排坑指南

**场景一：访问 PHP 文件变成下载，或返回 502 Bad Gateway。** 浏览器把 info.php 当文件下载，说明请求没有交给 PHP-FPM，常见于 fastcgi_pass 的套接字路径写错版本，或 php-fpm 服务没起来。502 则多是套接字存在但进程异常。修复顺序：

```bash
ls /run/php/
sudo systemctl status php8.1-fpm --no-pager
sudo tail -n 50 /var/log/php8.1-fpm.log
```

核对 /run/php/ 下真实的套接字文件名与配置里 fastcgi_pass 写的是否一致，不一致就改配置后 nginx -t 再 reload。

**场景二：Nginx 启动失败，报错 bind() to 0.0.0.0:80 failed (98: Address already in use)。** 原因是 80 端口已被 Apache 或另一套 Nginx 占用，典型情况是装 LNMP 之前机器上已有 Apache。查占用者再决定去留：

```bash
sudo ss -tlnp | grep ':80 '
sudo systemctl stop apache2
sudo systemctl disable apache2
sudo systemctl restart nginx
```

**场景三：程序报 SQLSTATE[HY000] [2002] Connection refused 或 Access denied for user。** 前者是数据库没启动或程序连错地址，后者是账号主机不匹配，例如账号建的是 localhost 而程序用 127.0.0.1 走 TCP 连接，在 MySQL 里这是两个不同的来源。按下面顺序查：

```bash
sudo systemctl status mysql --no-pager
sudo mysql -e "SELECT user, host FROM mysql.user;"
mysql -h 127.0.0.1 -u appuser -p -e "SELECT 1;"
```

账号主机对不上时，按程序实际的连接方式补建对应账号，不要图省事把主机写成百分号放行全网。

## 六、生产环境最佳实践与安全建议

第一，PHP-FPM 按站点拆进程池并用不同系统用户运行，一个站点被攻破不直接带走全部站点，配置目录在 /etc/php/ 对应版本的 fpm/pool.d/ 下，改前先备份原文件。第二，生产环境关闭错误回显，在 php.ini 里把 display_errors 设为 Off，错误只写日志。第三，数据库坚持最小权限和本机监听两个原则，远程管理需求用 SSH 隧道解决，不要开放 3306 到公网。第四，Nginx 和 Apache 只保留一个对外，另一个即使不用也要 disable 掉自启，避免重启机器后抢端口。第五，配置变更走固定动作：备份、改文件、语法检查、reload、看错误日志，五步缺一不可，reload 失败时服务仍用旧配置运行，不要误判为已生效。第六，系统和组件更新纳入固定节奏，PHP 跨版本升级前先在测试机验证程序兼容性，尤其是从 8.1 升到 8.3 这类跨版本动作。
