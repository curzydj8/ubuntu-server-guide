# 域名解析与网络连接

## 一、概述与使用场景

用户在浏览器输入 `www.example.com` 后能打开你的网站，中间第一个环节就是 DNS 解析：把人能记住的域名翻译成服务器的 IP 地址。解析配错，服务器本身再健康，访客也进不来，表现通常是浏览器报域名无法解析、连接超时，或者打开了别人的网站。

本章要解决四类实际问题。第一，理解一次完整解析的链路，知道出错时该查哪一层。第二，分清 A、AAAA、CNAME、MX、TXT 等记录的用途，避免把邮箱解析和网站解析互相覆盖。第三，在阿里云、腾讯云、Cloudflare 三个常见平台上把解析配对。第四，处理网站套上 Cloudflare 代理之后，Nginx 日志里只剩 CDN 节点 IP、拿不到真实访客 IP 的问题，并掌握一套验证排错命令。

不配或配错的典型风险包括：只配了根域名没有配 www 子域名导致一半入口打不开；CNAME 和其他记录同名冲突导致整条解析失效；改了解析后旧缓存未过期，新旧访客看到不同服务器，误判为程序故障；开了代理却没有还原真实 IP，封禁和限流全部误伤 CDN 节点。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS，Web 服务以 Nginx 为例。
- 权限：服务器上有可使用 sudo 的账号，例如 ubuntu；域名管理平台上有该域名的管理权限。
- 前提：已拥有一个注册完成的域名，已有一台有公网 IP 的服务器，示例公网 IPv4 使用文档段地址 192.0.2.10，IPv6 使用 2001:db8::10。
- 工具：服务器上安装解析调试工具。

```bash
sudo apt update
sudo apt install -y dnsutils curl
dig -v
curl --version | head -n 1
```

!!! note "关于示例地址"
    本章所有 IP 均为文档专用地址段，只用于讲解写法，实际操作时替换为你自己服务器的真实公网地址。域名统一使用 example.com 举例。

## 三、手把手操作步骤

### 3.1 理解解析流程：递归查询与迭代查询

一次完整解析按顺序经过以下环节：

1. 浏览器先查自身缓存和操作系统缓存，有未过期的结果就直接使用，不发出网络请求。
2. 没有缓存时，操作系统把查询交给本地 DNS 服务器，通常是运营商 DNS 或你设置的公共 DNS，这台服务器替你完成全部查询，这个过程叫递归查询，客户端只问一次，等一个最终答案。
3. 本地 DNS 若也没有缓存，就从根域名服务器开始逐级询问：先问根服务器 com 顶级域由谁负责，再问 com 的顶级域服务器 example.com 的权威服务器是谁，最后问权威服务器 www.example.com 的地址是多少。本地 DNS 逐级问下去，这个过程叫迭代查询。
4. 本地 DNS 拿到结果后按记录的 TTL 值缓存一份，再返回给客户端，浏览器才开始和目标 IP 建立连接。

记住两个角色的区别：权威服务器只对自己管理的域名给出最终答案，本地 DNS 负责缓存和跑腿。改解析要去权威服务器所在的平台改，也就是你域名当前 NS 记录指向的平台；在注册商处改解析但 NS 指向别处，改动不会生效。

### 3.2 记录类型区别与应用

| 记录类型 | 作用 | 典型值示例 | 注意事项 |
| --- | --- | --- | --- |
| A | 域名指向 IPv4 地址 | 192.0.2.10 | 网站解析最常用，一个主机名可配多条做简单轮询 |
| AAAA | 域名指向 IPv6 地址 | 2001:db8::10 | 配了 AAAA 但服务器 IPv6 不通会让访客先走 IPv6 再回退，网站明显变慢 |
| CNAME | 域名别名，指向另一个域名 | target.example.org | 同一主机名不能再配其他任何记录，根域名一般不能配 CNAME |
| MX | 邮件交换，指定收信服务器 | mail.example.com，优先级 10 | 优先级数字越小越优先，MX 目标必须是域名不能直接填 IP |
| TXT | 文本记录，做域名所有权验证和邮件规则 | 验证字符串或 SPF 内容 | 证书签发、搜索引擎验证、企业邮箱 SPF 都用它 |
| NS | 指定该域名由哪组权威服务器负责 | 平台分配的 NS 地址 | 在注册商处设置，决定你应该去哪个平台改解析 |
| SRV | 指定某项服务的地址和端口 | 较少用于普通网站 | 主要用于即时通信和目录服务等场景 |

建站最常见的组合：根域名 example.com 配 A 记录指向服务器，www.example.com 配 A 记录指向同一台服务器，或者配 CNAME 指向 example.com。两种写法都能用，后者的好处是以后换服务器 IP 只改一处。

### 3.3 在三个平台配置解析

三个平台的字段叫法稍有差异，核心都是四要素：主机记录、记录类型、记录值、TTL。

**阿里云云解析 DNS：** 登录控制台，进入云解析 DNS 的域名列表，点目标域名后的解析设置，点添加记录。主机记录填 www 表示 www.example.com，填符号 @ 表示根域名本身。记录类型选 A，记录值填 192.0.2.10，TTL 选 600 秒，保存。

**腾讯云 DNSPod：** 登录控制台，进入 DNSPod 域名解析列表，点目标域名，点添加记录。主机记录、记录类型、记录值的填法与阿里云相同，线路类型保持默认，TTL 填 600，保存。

**Cloudflare：** 登录控制台，点目标站点，进入 DNS 菜单的记录页，点添加记录。类型选 A，名称填 www 或填 @ 表示根域名，IPv4 地址填 192.0.2.10，代理状态按需选择，TTL 在开启代理时固定为自动，关闭代理时可手填 300，保存。

改动生效时间取决于旧缓存的 TTL。首次配置没有旧缓存，一般数分钟内生效；修改已有记录时，最长要等旧 TTL 完全过期，全球节点才一致。

### 3.4 Nginx 用 server_name 绑定域名

解析只负责把访客送到服务器 IP，到了服务器之后由 Nginx 根据请求头里的域名决定交给哪个站点，这就是 server_name 的作用。先备份再改配置是本指南的统一要求。

```bash
sudo cp /etc/nginx/sites-available/example.com /etc/nginx/sites-available/example.com.bak.20260101
sudo nano /etc/nginx/sites-available/example.com
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/example.com/html;
    index index.html index.htm;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

逐行说明：listen 80 表示监听 IPv4 的 80 端口，第二行监听 IPv6；server_name 后面列出这个站点响应的全部域名，空格分隔；root 是站点文件目录；access_log 和 error_log 单独拆分，方便按站点排错。改完检查语法并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

!!! warning "默认站点抢答问题"
    如果某个域名没有匹配到任何 server_name，Nginx 会交给第一个加载的 server 块处理，容易出现输入 A 域名打开 B 网站的现象。生产环境建议保留一个默认站点块，在 server_name 处写下划线并直接返回 444 或 404，避免未绑定域名落到真实站点上。

### 3.5 Cloudflare 代理：黄云与灰云

Cloudflare 添加记录时有一个代理状态开关，界面上是一朵云的图标。

| 状态 | 含义 | 流量路径 | 适用场景 |
| --- | --- | --- | --- |
| 黄云，已代理 | 访客先到 Cloudflare 节点再回源 | 经过 CDN 缓存和防护 | 正式网站，需要隐藏源站 IP 和抵御攻击时开启 |
| 灰云，仅 DNS | 只做解析，直接暴露源站 IP | 访客直连服务器 | 调试阶段、非 HTTP 服务、需要直连源站时使用 |

黄云的好处是隐藏源站、提供缓存和基础防护，代价是多了一层链路，排错时必须分清是 CDN 层还是源站层的问题。灰云等于普通解析，没有任何代理能力。邮件相关的 MX、TXT 记录不要开黄云，Cloudflare 也只允许对 A、AAAA、CNAME 这类 Web 流量记录开启代理。

### 3.6 拿回真实客户端 IP

开启黄云后，请求是 Cloudflare 节点转发到源站的，Nginx 看到的来源 IP 全是 Cloudflare 节点的地址。真实访客 IP 被放在请求头 X-Forwarded-For 里。Nginx 自带 ngx_http_realip_module 模块可以把日志和程序里的来源 IP 还原为真实地址，Ubuntu 的 nginx 包默认已编译该模块。

先备份主配置，再新建一个专门的配置文件存放可信代理段：

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.20260101
sudo nano /etc/nginx/conf.d/cloudflare-realip.conf
```

```nginx
set_real_ip_from 192.0.2.0/24;
set_real_ip_from 2001:db8::/32;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

参数讲解：set_real_ip_from 声明哪些来源地址是可信代理，只有来自这些地址的请求才采信它带来的 X-Forwarded-For，实际使用时这里要填 Cloudflare 官方公布的全部 IPv4 和 IPv6 网段，一行一个网段，全部填完不能只填一段。real_ip_header 指定从哪个请求头取真实 IP。real_ip_recursive on 表示当 X-Forwarded-For 里有多个地址时逐级剔除可信代理，取最后一个不可信地址作为真实 IP。

!!! warning "不要把可信段写成全网段"
    如果把 set_real_ip_from 写成 0.0.0.0/0，等于任何人都能伪造 X-Forwarded-For 冒充任意 IP，限流、封禁和审计全部失效。可信段只能填你实际使用的 CDN 或反向代理的官方网段，并定期核对官方公布的更新。

改完执行 nginx -t 检查，再 reload 生效。若日志格式里用的是变量 $remote_addr，还原后记录的就是真实 IP；需要同时保留代理节点地址做对账时，可以在日志里额外记录变量 $realip_remote_addr。

## 四、效果验证与测试

第一步，查解析结果与链路。用 dig 加 trace 参数看完整迭代过程，确认最终答复来自你的权威服务器且值正确：

```bash
dig www.example.com
dig +trace www.example.com
nslookup www.example.com
```

期望输出节选：

```text
;; ANSWER SECTION:
www.example.com.  600  IN  A  192.0.2.10
```

第二步，用公共 DNS 对比本地结果，排除本地缓存未更新：

```bash
dig @1.1.1.1 www.example.com +short
dig @8.8.8.8 www.example.com +short
```

两处都返回 192.0.2.10 说明解析已在公网生效。第三步，验证 HTTP 层：

```bash
curl -Iv http://www.example.com
```

期望看到响应头里有 HTTP/1.1 200 OK 和 Server 字段。跳过 DNS 直接测源站也很常用，把域名强制解析到指定 IP：

```bash
curl -Iv http://www.example.com --resolve www.example.com:80:192.0.2.10
```

开启 Cloudflare 代理后，再到服务器上看访问日志，确认第一列已经是访客真实 IP 而不是固定几个 CDN 节点地址，真实 IP 还原即告成功。

## 五、常见错误与排坑指南

**场景一：dig 查不到记录，返回 NXDOMAIN 或空应答。** 报错片段为 status: NXDOMAIN 或 ANSWER: 0。常见原因有三：记录加错了平台，NS 指向 Cloudflare 却在注册商处加记录；主机记录重复拼域名，在主机记录里填了完整的 www.example.com，结果变成双重后缀；记录刚保存，权威服务器尚未同步。用 dig 查 NS 先确认平台，再核对主机记录只填 www 或 @。

```bash
dig example.com NS +short
dig www.example.com.example.com
```

**场景二：解析正确但网站打开的是默认页或别的站点。** curl 返回 200 但内容不对。原因是 Nginx 没有匹配到对应 server_name，或者新站点配置没有软链接到 sites-enabled 目录，或者改完没有 reload。修复方法：

```bash
sudo ls -l /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo tail -n 50 /var/log/nginx/error.log
```

**场景三：状态码判读错误，把 301、403、502 混为一谈。** curl -Iv 的状态码含义要分清：301 或 302 是跳转，多半是 HTTP 跳 HTTPS 的规则在生效，属正常；403 是服务器拒绝，优先查目录权限和 Nginx 的 deny 规则；404 是路径不存在，查 root 目录是否写错；502 是 Nginx 连不上后端，查后端进程和端口；525、526 出现在 Cloudflare 场景时是源站证书问题。用下面命令分别测源站和走 CDN 的结果做对比：

```bash
curl -Iv http://www.example.com --resolve www.example.com:80:192.0.2.10
curl -Iv https://www.example.com
```

## 六、生产环境最佳实践与安全建议

第一，TTL 的节奏要配合变更计划：平时可设 3600 秒降低查询压力，计划迁移服务器前一天先改成 300 秒，迁移完成并稳定后再调回去。第二，根域名和 www 都要配齐，并统一跳转方向，避免两个入口各开一份站点造成内容重复。第三，开启 Cloudflare 代理后，源站防火墙只放行 Cloudflare 官方网段访问 80 和 443 端口，防止攻击者绕过 CDN 直接打源站 IP；同时源站 IP 不要出现在任何公开记录里，包括测试用的子域名。第四，MX、SPF、DKIM 等邮件记录变更要格外谨慎，改错一次就可能让全公司邮件进垃圾箱，变更前先保存旧值。第五，定期用 dig 对核心域名做巡检并留档，发现解析值被篡改能第一时间回滚。第六，真实 IP 还原的可信代理段要随 CDN 官方公告更新，换 CDN 厂商时同步更换，不要叠加保留旧厂商网段。
