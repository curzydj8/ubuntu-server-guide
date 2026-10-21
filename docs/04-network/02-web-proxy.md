# Web 服务器与反向代理

## 一、概述与使用场景

Web 服务器负责把网页和接口送到访问者面前。静态文件可以直接由服务器发出去，动态应用则通常跑在某个本地端口上，再由前面的 Web 服务器做统一入口，这个统一入口就是反向代理。理解这两层分工，是本章的起点：后端应用只管业务，前端代理管域名、证书、超时、限流与日志。

为什么需要反向代理，而不是让应用直接对外。第一，统一证书：十个应用共用一个入口申请和续期证书，比每个应用各管一份证书可靠得多。第二，统一域名路由：一个 IP 上按域名分流到不同后端，对外只开放 80 与 443。第三，安全收口：后端端口只监听本机回环地址，公网扫描扫不到应用本身的调试接口和管理页面。第四，性能缓冲：静态资源缓存、gzip 压缩、连接复用都可以在代理层一次配好，后端无须重复实现。

不做这一层的风险同样具体。应用直接暴露时，证书过期无人察觉、后端端口被直接攻击、多个服务抢同一个 80 端口互相冲突，都是常见事故。更隐蔽的问题是日志分散：出了故障，连请求到底有没有到达服务器都说不清。把代理层建好，访问日志、错误日志和状态码就有了统一的观察点。

本章三款软件定位不同。Nginx 事件驱动、资源占用低，是反向代理的首选，也是本章的主线。Apache 模块丰富、htaccess 灵活，老牌站点和需要特定模块时仍有价值。Caddy 最大卖点是自动 HTTPS，配置最短，适合小团队快速上线。三者只选其一监听 80 与 443，不要同时启用抢端口。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，操作账号需要 sudo 权限，示例使用 ubuntu 用户。服务器示例公网地址为 198.51.100.80，示例域名为 www.example.com 与 app.example.com，后端示例应用监听 127.0.0.1 的 8080 端口，静态站点目录为 `/var/www/example.com`。

前置条件有四条。第一，域名解析已经生效，用第 1 章的方法确认 A 记录指向本机，证书签发要靠它验证域名归属。第二，防火墙与云安全组放行 80 与 443，80 不只是给 HTTP 访问，也是证书 HTTP 验证的通道。第三，系统时间准确，证书有效期校验对时间敏感，时间偏差过大会误报证书无效，先按第 4 章把 Chrony 配好。第四，后端应用已经能在本机用 curl 访问，先证明后端活着，再配代理，排障时才能分清是哪一层的问题。

需要安装的软件按路线选择。Nginx 路线安装 nginx 与 certbot 及 python3-certbot-nginx。Apache 路线安装 apache2 与 certbot 及 python3-certbot-apache。Caddy 路线按官方仓库或二进制安装，证书由 Caddy 自己管理，不需要 certbot。

!!! warning "版本差异：Ubuntu 22.04 与 24.04"
    两个版本的 Nginx 与 Apache 配置目录结构一致，命令通用。差别在默认 TLS 设置与软件版本：24.04 的 Nginx 默认更严格，只支持 TLS 1.2 与 TLS 1.3。不要把网上旧教程里的弱加密套件照搬进来，优先使用发行版默认的安全基线再做微调。

!!! note "先分清正向代理与反向代理"
    正向代理替客户端去访问外网，客户端知道代理的存在。反向代理替服务器迎接访问，客户端只看到域名，看不到后端。本章讲的全部是反向代理，不要把两者配置混用。

## 三、手把手操作步骤

### 3.1 Nginx 安装与静态虚拟主机

第一步，安装并确认服务状态：

```bash
sudo apt update
sudo apt install -y nginx
nginx -v
sudo systemctl enable --now nginx
curl -I http://127.0.0.1
```

curl 返回 200 或默认页响应头，说明安装成功。第二步，备份默认站点配置，再新建站点目录与测试页：

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak
sudo mkdir -p /var/www/example.com
sudo nano /var/www/example.com/index.html
```

测试页写入一行可识别文字，例如站点名称加测试字样，便于验证时确认命中的是新站点而不是默认页。第三步，新建虚拟主机文件 `/etc/nginx/sites-available/example.com`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.example.com example.com;
    root /var/www/example.com;
    index index.html;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

逐项讲解：listen 指定端口，server_name 是本虚拟主机响应的域名列表，root 是静态文件根目录，try_files 表示先找文件再找目录，都找不到返回 404。静态资源 location 用正则匹配扩展名，设置七天缓存，减少重复请求。每个站点单独写访问日志与错误日志，多个站点混在一个日志文件里，排障时很难分辨。

第四步，启用站点并检查语法后重载：

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow "Nginx Full"
```

### 3.2 Nginx 反向代理实战

假设后端应用已经监听 127.0.0.1 的 8080 端口，先在本机验证后端，再写代理站点。新建文件 `/etc/nginx/sites-available/app.example.com`，修改前如已有同名文件先执行备份命令：

```bash
curl -s http://127.0.0.1:8080/
sudo cp /etc/nginx/sites-available/app.example.com /etc/nginx/sites-available/app.example.com.bak
sudo nano /etc/nginx/sites-available/app.example.com
```

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    server_name app.example.com;

    access_log /var/log/nginx/app.access.log;
    error_log /var/log/nginx/app.error.log;

    client_max_body_size 20m;

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /static/ {
        alias /var/www/app-static/;
        expires 30d;
    }
}
```

关键参数逐行讲解：

| 参数 | 作用 | 不写的后果 |
| --- | --- | --- |
| proxy_pass | 把请求转给哪个后端 | 代理不成立，请求无处可去 |
| Host 请求头 | 把原始域名传给后端 | 后端按域名路由时全部落到默认站 |
| X-Real-IP 与 X-Forwarded-For | 把真实客户端地址传给后端 | 后端日志只看到代理本机地址，审计失效 |
| X-Forwarded-Proto | 把原始协议传给后端 | 后端生成链接时把 https 错写成 http |
| proxy_read_timeout | 等待后端响应的最长时长 | 慢接口被过早切断，客户端收到 502 |
| client_max_body_size | 允许的请求体上限 | 上传稍大文件就返回 413 |
| keepalive | 复用到后端的长连接数 | 高并发时频繁建连，延迟与开销上升 |

启用与验证命令与静态站点相同：建软链接、执行 `sudo nginx -t`、再 `sudo systemctl reload nginx`。注意 location /static 单独由 Nginx 直接发文件，不经过后端，这是最常见的性能优化：静态资源不要占用应用进程。

### 3.3 Apache 虚拟主机与代理

Apache 路线先安装并启用必要模块，再备份并新建站点文件 `/etc/apache2/sites-available/app.example.com.conf`：

```bash
sudo apt install -y apache2
sudo a2enmod proxy proxy_http headers ssl rewrite
sudo cp /etc/apache2/sites-available/000-default.conf /etc/apache2/sites-available/000-default.conf.bak
sudo nano /etc/apache2/sites-available/app.example.com.conf
```

```apache
<VirtualHost *:80>
    ServerName app.example.com
    ServerAdmin opsadmin@example.com
    ProxyPreserveHost On
    ProxyRequests Off
    RequestHeader set X-Forwarded-Proto "http"
    ProxyPass "/" "http://127.0.0.1:8080/"
    ProxyPassReverse "/" "http://127.0.0.1:8080/"
    ErrorLog ${APACHE_LOG_DIR}/app-error.log
    CustomLog ${APACHE_LOG_DIR}/app-access.log combined
</VirtualHost>
```

ProxyPreserveHost On 保证后端拿到原始域名，ProxyRequests Off 关掉正向代理能力，这是安全底线，绝不能设为 On 对外开放。ProxyPass 与 ProxyPassReverse 必须成对出现，后者负责改写后端返回的重定向地址。启用站点并检查：

```bash
sudo a2ensite app.example.com.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

### 3.4 Caddy 极简配置与自动 HTTPS

Caddy 的站点文件默认是 `/etc/caddy/Caddyfile`。备份后写入以下完整内容：

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo nano /etc/caddy/Caddyfile
```

```yaml
www.example.com {
    root * /var/www/example.com
    file_server
    encode gzip
    log {
        output file /var/log/caddy/www.log
    }
}

app.example.com {
    reverse_proxy 127.0.0.1:8080
    encode gzip
}
```

只要域名解析指向本机且 80 与 443 可达，Caddy 启动后会自动申请并续期证书，不需要额外命令。校验配置并重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 3.5 Let's Encrypt 证书：certbot 路线

Nginx 与 Apache 路线用 certbot 申请证书。安装与签发命令如下，签发前确认域名解析已生效且 80 端口可从公网访问：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d www.example.com -d example.com
sudo certbot --nginx -d app.example.com
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

certbot 会自动改写站点配置加入 443 监听与证书路径，并提供 HTTP 跳转 HTTPS 的选项，交互时选择强制跳转。Apache 路线把参数换成 `--apache` 即可，其余相同。证书文件位于 `/etc/letsencrypt/live/` 下对应域名目录，私钥文件权限严格，不要复制到网站目录，也不要提交到代码仓库。renew dry-run 是模拟续期，必须看到模拟成功再离开，自动续期靠 certbot.timer 定时任务，不要手工写重复的定时脚本。

### 3.6 性能调优要点

调优只抓四件收益最大的事。第一，开 gzip：在 Nginx 主配置的 http 块确认 `gzip on;` 并设置合理的最小长度与类型，文本类资源收益明显，图片不要重复压缩。第二，静态资源长缓存加版本号：缓存头设长，前端发版时改文件名，避免用户拿到旧文件。第三，连接复用：代理到后端开 keepalive，浏览器侧保持默认长连接。第四，进程参数交给发行版默认：worker 进程数保持 auto，不要照抄网上的大数值，瓶颈多数在后端应用与数据库，不在代理本身。修改主配置前同样先备份：

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak2
sudo nginx -t
sudo systemctl reload nginx
ab -n 500 -c 20 https://www.example.com/
```

最后一行用 ab 做简单压测对比调优前后的每秒请求数，只在测试机执行，不要对生产站点随意压测。

## 四、效果验证与测试

按从本机到公网的顺序验证。先看监听与本机响应，再看域名与证书：

```bash
ss -tlnp | grep -E "80|443"
curl -I http://127.0.0.1
curl -I http://www.example.com
curl -Ik https://www.example.com
curl -s https://app.example.com
```

期望结果：HTTP 访问返回 301 跳转到 HTTPS 地址，HTTPS 返回 `HTTP/2 200`，响应头中 server 与日期正常。证书单独检查有效期与域名覆盖：

```bash
echo | openssl s_client -connect www.example.com:443 -servername www.example.com 2>/dev/null | openssl x509 -noout -dates -subject -issuer
sudo certbot certificates
```

代理链路验证看后端日志：经代理访问一次后，后端记录的来源应当是真实客户端地址而不是 127.0.0.1，若全是本机地址，说明转发请求头没有生效，回第 3.2 节逐项核对。Caddy 路线验证命令相同，另用 `sudo journalctl -u caddy -n 50 --no-pager` 确认证书签发日志无报错。

## 五、常见错误与排坑指南

场景一：Nginx 启动或重载失败。报错原文片段为 `nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)`。原因是 80 端口已被 Apache 或另一进程占用，三款软件装了多款又同时启用最常见。用下面命令找出占用者，停掉不用的那个再启动：

```bash
sudo ss -tlnp | grep ":80"
sudo systemctl stop apache2
sudo systemctl disable apache2
sudo nginx -t
sudo systemctl restart nginx
```

场景二：代理访问返回 502。浏览器显示 `502 Bad Gateway`，错误日志片段为 `connect() failed (111: Connection refused) while connecting to upstream`。原因是后端应用没有在配置的地址端口监听，或后端已经崩溃。先绕过代理直连后端验证，再查后端服务状态：

```bash
curl -v http://127.0.0.1:8080/
sudo journalctl -u nginx -n 20 --no-pager
sudo tail -n 50 /var/log/nginx/app.error.log
```

后端直连也不通就是后端问题，不要反复改代理配置。后端直连通、代理不通，再核对 proxy_pass 的地址与端口是否写错。

场景三：证书签发失败。certbot 报错片段为 `Challenge failed for domain www.example.com` 以及 `Timeout during connect (likely firewall problem)`。原因是域名没有指向本机，或 80 端口被防火墙与安全组拦截，验证请求进不来。先自查解析与连通性，修正后重跑签发：

```bash
dig +short www.example.com A
curl -I http://www.example.com
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo certbot --nginx -d www.example.com
```

## 六、生产环境最佳实践与安全建议

第一，只开放必要端口。对外只开 80 与 443，后端应用端口只监听 127.0.0.1 并在防火墙拒绝外网直连，数据库端口永不经过代理对外。第二，强制 HTTPS 并开 HSTS。确认全站跳转无误、没有混合内容之后，再在代理层加 Strict-Transport-Security 响应头，加之前要想清楚：开错会影响子域名，回退成本高，先小流量验证。

第三，证书续期要有告警。自动续期不是免检理由，监控证书剩余天数，少于十五天就告警，定期手动跑一次 renew dry-run。第四，日志与限流。访问日志按天轮转并保留足够天数，登录与接口类路径在代理层做基础限流，挡住最粗放的撞库与扫描，给后端留出余量。

第五，配置纳入版本管理。把 sites-available 的自有站点文件纳入 Git 管理，变更先在测试机跑通 nginx -t 与 curl 验证，再同步到生产并平滑重载，不要在生产机上直接试改。第六，及时更新与隐藏版本细节。保持软件包更新，在配置中关掉版本号响应头，减少信息暴露。第七，上线前做一次完整回滚演练：备份配置、证书与站点文件，确认一条命令能恢复到上一版本，反向代理是全站入口，它的回滚能力就是全站的回滚能力。
