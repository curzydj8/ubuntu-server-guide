---
description: "HTTPS 做两件事：加密浏览器和服务器之间的流量，让中间网络偷看不到、改不动内容；用证书证明访客连到的确实是你的服务器。现代浏览器对纯 HTTP 站点会直接标注不安全，搜索引擎也会降权，"
---

# HTTPS 自动化证书

## 一、概述与使用场景

HTTPS 做两件事：加密浏览器和服务器之间的流量，让中间网络偷看不到、改不动内容；用证书证明访客连到的确实是你的服务器。现代浏览器对纯 HTTP 站点会直接标注不安全，搜索引擎也会降权，没有 HTTPS 的站点在今天基本等于半成品。

以前证书要花钱买、手工续，过期忘换就全站红警告。现在用 Let's Encrypt 这类免费证书机构配合自动化工具，签发和续期都能全自动。本章给两条完整路线：Certbot，官方工具，和主流 Web 服务器集成最好，适合证书装在 Nginx 或 Apache 上直接对外服务的场景；acme.sh，纯脚本实现，功能更灵活，适合要通配符证书、证书要分发到多台机器或非标准服务上的场景。两条路线最后都落到同一件事：每隔一段时间自动把新证书换上并重载服务，你只需要定期确认自动续期还活着。

不做自动化的风险很实在：免费证书有效期只有 90 天，手工管理三五个域名时，总有一次会忘，过期当天用户进站看到满屏警告，损失比证书本身贵得多。本章的完成标准不是把证书签出来，而是把自动续期验证通过。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。
- 权限：可使用 sudo 的账号，例如 ubuntu；DNS 方式签发还需要域名解析平台的账号或 API 凭证，凭证只用于本机签发，按最小权限创建。
- 前提一：域名解析已经生效指向本服务器，检查方法见第 01 章。HTTP 方式验证要求公网能访问本服务器的 80 端口；走 Cloudflare 代理黄云时，HTTP 验证可能被代理规则干扰，优先改用 DNS 方式。
- 前提二：站点已经在 Nginx 或 Apache 里建好并能用 HTTP 打开，Certbot 的服务器插件需要在已有站点上改配置。
- 改配置前的统一动作：Certbot 改写 Nginx 或 Apache 配置前，先手工备份一份：

```bash
sudo cp -a /etc/nginx/sites-available /etc/nginx/sites-available.bak.20260101
sudo cp -a /etc/apache2/sites-available /etc/apache2/sites-available.bak.20260101
ls /etc/letsencrypt/live/
```

最后一条在还没签过证书时报错目录不存在是正常的，表示这是第一次签发。

!!! note "验证方式先想清楚"
    HTTP-01 验证靠证书机构回访你网站的一个临时文件，简单，但不能签通配符，且要求 80 端口对外可达。DNS-01 验证靠在域名下加一条 TXT 记录证明控制权，能签通配符，不要求服务器开任何入站端口，是本章推荐的生产方式。TLS-ALPN-01 用得少，本章不展开。

## 三、手把手操作步骤

### 3.1 双路线对比

| 维度 | Certbot | acme.sh |
| --- | --- | --- |
| 实现形式 | Python 程序，apt 或 snap 安装 | 纯 Shell 脚本，装在用户目录 |
| 与服务器集成 | nginx 和 apache 插件可自动改配置 | 默认只签发，靠部署钩子把证书送到目标并重载 |
| 默认证书机构 | Let's Encrypt | 默认 ZeroSSL，可切换 Let's Encrypt |
| 自动续期 | 自带 systemd timer | 安装时写入当前用户 crontab |
| 通配符支持 | 支持，走 DNS-01 | 支持，走 DNS-01，DNS 插件数量多 |
| 证书存放 | /etc/letsencrypt/live/域名目录 | 安装目录下的域名子目录 |
| 上手难度 | 更低，命令少 | 参数多一些，灵活性更高 |
| 适合场景 | 单机 Nginx 或 Apache 标准站点 | 多机分发、通配符、非标准服务 |

选择口诀：单台机器标准建站选 Certbot；要一张证书盖住全部子域名，或者证书还要给面板、邮件、其他机器用，选 acme.sh。同一台机器上不要混用两条路线管同一个域名，续期时互相覆盖会查不清账。

### 3.2 Certbot 路线：安装与自动签发

Ubuntu 上 Certbot 官方推荐用 snap 安装以获得持续更新的版本，系统源里的版本偏旧时也可用 snap 路线。两种装法选一条执行，不要都装：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx python3-certbot-apache
```

上面是系统源装法，装完 nginx 插件和 apache 插件都在。用 snap 时命令为：

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

给 Nginx 站点签发并自动改配置，一条命令同时完成申请、验证、写证书路径和加跳转：

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Apache 站点把插件参数换成 apache：

```bash
sudo certbot --apache -d example.com -d www.example.com
```

执行过程中首次运行会要求填写接收续期提醒的邮箱并同意服务条款，按提示完成。插件会自动在站点配置里加入 listen 443 ssl、证书路径两行，以及把 80 端口的请求跳转到 HTTPS 的规则。改动前它也会自己留一份配置副本，但不要因此省掉第 二 部分里的人工备份。

只想要证书文件、不让工具动服务器配置时，用 certonly 加 webroot 方式：

```bash
sudo certbot certonly --webroot -w /var/www/example.com/html -d example.com -d www.example.com
```

这种方式签完后要自己把 ssl_certificate 和 ssl_certificate_key 两行写进 Nginx 配置并 reload，适合配置被版本管理托管、不允许工具改写的环境。

### 3.3 Certbot 自动续期与测试

apt 装法和 snap 装法都会装好自动续期机制。apt 装法对应 systemd 定时器，确认它处于启用状态：

```bash
sudo systemctl status certbot.timer --no-pager
sudo systemctl list-timers | grep certbot
```

snap 装法由 snapd 内部的定时任务负责续期，可用下面命令查看其续期服务状态：

```bash
sudo snap services certbot
```

自动续期生效不等于续期一定成功，必须做一次模拟演练。dry-run 会完整走一遍验证和签发流程但不保存证书，是检验解析、端口和权限的最好办法：

```bash
sudo certbot renew --dry-run
```

看到各域名都以 success 结尾才算续期链路健康。真实到期前 30 天内执行普通 renew 才会真正换证，平时手动执行 renew 只会跳过未到期的证书，这是正常行为不是故障：

```bash
sudo certbot renew
sudo certbot certificates
```

certificates 子命令列出本机全部证书的域名、到期日和存放路径，纳入日常巡检。

### 3.4 acme.sh 路线：安装

acme.sh 是脚本工具，官方安装方式同样遵循先下载审阅再执行的原则。先取安装脚本看一遍：

```bash
cd /tmp
curl -O https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh
less acme.sh
```

确认来源和内容无异常后，用官方推荐的在线安装方式完成安装，安装程序会把 acme.sh 装到当前用户的家目录并写好续期用的 cron：

```bash
curl https://get.acme.sh | sh -s email=ops@example.com
source ~/.bashrc
acme.sh --version
```

安装时传入的邮箱用于证书机构的到期通知。默认证书机构现在是 ZeroSSL，想统一用 Let's Encrypt 时切换一次默认机构并注册账号：

```bash
acme.sh --set-default-ca --server letsencrypt
acme.sh --register-account -m ops@example.com --server letsencrypt
```

### 3.5 acme.sh 的 HTTP 与 DNS 两种签发

HTTP 方式适合单域名且 80 端口可直达源站的情况，用 webroot 模式把验证文件放到站点目录：

```bash
acme.sh --issue -d example.com -d www.example.com -w /var/www/example.com/html --server letsencrypt
```

Nginx 一体模式可以让脚本临时接管验证流程，站点目录不好写文件时使用：

```bash
acme.sh --issue -d example.com --nginx --server letsencrypt
```

DNS 方式不需要服务器开入站端口，还能签通配符，是生产首选。以 Cloudflare 为例，先在 Cloudflare 控制台创建一个只带目标域名 DNS 编辑权限的 API 令牌，把令牌写入环境变量后再签发，令牌只出现在本机环境里，不要写进任何脚本文件长期保存：

```bash
export CF_Token="<api-token>"
export CF_Account_ID="<account-id>"
acme.sh --issue --dns dns_cf -d example.com -d "*.example.com" --server letsencrypt
```

其他解析平台把 dns_cf 换成对应插件名，例如阿里云是 dns_ali，腾讯云 DNSPod 是 dns_dp，凭证变量名以 acme.sh 官方文档里对应插件的说明为准，签发前先核对一遍再执行。

### 3.6 acme.sh 安装证书与部署钩子

acme.sh 签出的证书放在它自己的目录里，严禁让 Nginx 直接引用那个目录，版本升级和权限都不可控。正确做法是用 install-cert 把证书复制到固定目录，并带上重载命令作为部署钩子，以后每次续期成功都会自动执行同样的复制和重载：

```bash
sudo mkdir -p /etc/nginx/ssl/example.com
acme.sh --install-cert -d example.com \
  --key-file /etc/nginx/ssl/example.com/key.pem \
  --fullchain-file /etc/nginx/ssl/example.com/fullchain.pem \
  --reloadcmd "systemctl reload nginx"
```

先备份 Nginx 站点配置，再把证书路径写进站点的 443 监听块：

```bash
sudo cp /etc/nginx/sites-available/example.com /etc/nginx/sites-available/example.com.bak.20260101
sudo nano /etc/nginx/sites-available/example.com
```

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.com www.example.com;
    ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com/key.pem;
    root /var/www/example.com/html;
    index index.php index.html index.htm;
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

给面板、其他服务送证书同理，用 install-cert 时把目标路径和对应的重载命令换成那个服务的即可，这就是部署钩子的用法：签发只做一次配置，续期全自动分发。

### 3.7 通配符证书走 DNS-01 的说明

通配符证书形如盖住全部一级子域名的证书，一个证书同时保护 www、blog、cloud 等所有子域名。证书机构规定通配符只能用 DNS-01 验证，因为只有控制域名解析的人才有权替全部子域名申请证书，HTTP 文件验证证明不了这种全局控制权。写法就是在签发命令里把通配符域名带上星号一起申请，如第 3.5 节的命令所示，证书同时包含根域名和通配符域名时要两个都写，缺根域名则根域名本身不受这张证书保护。通配符的代价是私钥一旦泄露，全部子域名同时失守，因此通配符证书的私钥权限要收得更紧，分发范围能小则小；子域名不多且互相独立时，老老实实一域名一证书反而更安全。

## 四、效果验证与测试

从浏览器外用命令完整验证证书链、域名匹配和到期时间：

```bash
curl -Iv https://www.example.com
echo | openssl s_client -connect www.example.com:443 -servername www.example.com 2>/dev/null | grep -E 'subject|issuer|Verify return code'
echo | openssl s_client -connect www.example.com:443 -servername www.example.com 2>/dev/null | openssl x509 -noout -dates -ext subjectAltName
```

期望结果：curl 返回 HTTP/1.1 200 且没有证书错误提示；握手输出里 Verify return code 为 0 表示证书链验证通过；证书的 subjectAltName 包含你申请的全部域名，notAfter 显示的到期日在约 90 天后。再验证两条自动链路：Certbot 路线执行 renew 的 dry-run 全部成功；acme.sh 路线查看续期计划和证书清单：

```bash
crontab -l | grep acme
acme.sh --list
acme.sh --info -d example.com
```

最后确认 HTTP 已自动跳转到 HTTPS：

```bash
curl -I http://www.example.com
```

返回 301 且 Location 以 https 开头即正确。

## 五、常见错误与排坑指南

**场景一：Certbot 验证失败，报 unauthorized 或连接超时类错误。** 典型片段是 Challenge failed for domain 和 Invalid response from 开头的长串信息。HTTP 验证失败先查三件事：解析是否真的指向本机，用第 01 章的 dig 命令确认；80 端口是否被云安全组或 UFW 拦住；站点是否套了 Cloudflare 黄云导致验证请求被拦截。第三种情况改走 DNS 验证最干脆：

```bash
sudo certbot --nginx -d example.com --preferred-challenges dns
```

按提示去解析平台加 TXT 记录后回车继续。

**场景二：证书签好了但浏览器仍报不安全或证书名称不匹配。** 常见原因是访问用的域名不在证书的域名清单里，例如证书只签了根域名却用 www 访问，或 Nginx 的 443 块引用了旧证书路径。对照检查：

```bash
sudo certbot certificates
sudo grep -R ssl_certificate /etc/nginx/sites-enabled/
```

缺域名就把全部域名带齐重新签发一次，不要给每个子域名零散签一堆再手工拼配置。

**场景三：续期失败，日志报 rate limit 或验证记录残留。** Let's Encrypt 对同一组域名有签发频率限制，短时间反复失败重试会把额度耗尽，报错片段含 too many certificates already issued。此时只能停手等额度窗口恢复，先用 dry-run 和 staging 环境把问题查清再动生产签发：

```bash
sudo certbot renew --dry-run
acme.sh --issue -d example.com -w /var/www/example.com/html --server letsencrypt_test
```

DNS 验证残留的旧 TXT 记录也要清理，同主机名堆多条验证记录会让验证结果不稳定，去解析平台删掉过期的验证记录只留当前一条。

## 六、生产环境最佳实践与安全建议

第一，上线当天就验证自动续期，Certbot 跑 dry-run，acme.sh 确认 cron 存在并手动触发一次续期检查，不要等到第 89 天才发现续期早坏了。第二，给证书到期留独立告警，自动化之外再加一层人工巡检，每月看一次各证书的到期日，90 天有效期里 30 天内到期还没换新就是异常信号。第三，私钥文件权限保持最小，证书目录只允许 root 和 Web 服务账号读取，私钥永不进代码仓库、永不通过聊天工具传输。第四，改服务器配置引用证书路径时用 fullchain 文件而不是单独的证书文件，缺中间证书链会在部分手机浏览器上报链不完整，桌面浏览器却正常，是最难查的一类证书故障。第五，站点开启 HTTPS 后再进一步打开 HSTS 等安全响应头，但 HSTS 一旦下发浏览器会强制 HTTPS，回滚成本高，应在证书和续期都稳定运行一段时间后再开。第六，换服务器或换证书路线时，新环境先并行签好并验证，再切解析或切配置，禁止先撤旧证书后补新证书，中间窗口期全站裸奔。
