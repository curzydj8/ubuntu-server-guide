# TOOL-01：建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器

> 任务编号：TOOL-01（网站建设与部署实战指南 · 建站工具第 1 篇）
> 上一篇：[PROJ-08 旗舰：一台服务器托管多网站](../projects/08-multi-site.md)；下一篇：[TOOL-02 建站工具 2：Docker Compose、systemd、备份脚本、部署检查清单生成器](02-deploy-tools.md)。
> 本篇是工具篇，不是概念复述：四件工具每件都给出读者能直接用的完整成品——一个浏览器端页面，填域名、上游地址、是否 HTTPS 就能出配置，不用装任何东西。三种服务器的配置语法本身见 SRV-01，本篇不重讲，只讲生成器怎么用、生成的配置每一项是什么意思、出问题怎么回退。

## 1. 本章目标

读完并动手做完本篇，你能：

- 用一个本地 HTML 页面生成 Nginx、Apache、Caddy 三种服务器的站点配置，不用背三种语法；
- 给静态站和反向代理两种模式各生成一份能直接落盘的配置，含 HTTPS 块；
- 用同一组输入（域名、上游地址、是否 HTTPS）一次得到三种服务器的同一条反向代理规则，并说清它们哪里对应、哪里不同；
- 把生成的配置保存到正确的路径、启用、验证，出问题能用备份回退。

## 2. 适用人群

- 已经按 SRV-01 搭过一次网站、但每次换域名或换上游都要翻旧配置复制粘贴的读者；
- 同一台服务器上要同时维护 Nginx 站点和 Caddy 站点（或帮别人看 Apache 站点），不想记三套写法的读者；
- 想给自己的部署流程留一份“填表即出配置”的小工具，而不是每次手写配置的读者。

不适用：还没有装过任何一种 Web 服务器的读者——先读 SRV-01，把一种服务器跑通，再回来用生成器。

## 3. 适用系统和版本

- 生成器页面：任何带现代浏览器的系统都行（Windows、macOS、Linux、手机浏览器均可），不依赖网络，不依赖 Node.js、不依赖任何构建工具；
- 生成的配置适用的服务器版本，以 SRV-01 核查的版本为准：Nginx 开源稳定线 1.30、Apache httpd 2.4 线、Caddy 2.11 线；证书路径按 Let's Encrypt 默认布局写，换用其他证书时把路径换成你自己的；
- 操作系统：Ubuntu 24.04 LTS（配置存放路径与启用命令按 Ubuntu 的布局写，其他发行版把路径换成你自己的布局）。

## 4. 使用前提

- 你手里有一个域名，并且已经知道它要指向哪个站点：静态站要知道网站文件放在哪个目录，反向代理要知道上游应用监听在哪个地址（例如 `127.0.0.1:8080`）；
- 如果选 HTTPS：证书已经签好（签发方法见 09-web-hosting/05），并且你知道证书与私钥的路径；Caddy 的自动 HTTPS 模式不需要你事先签证书，但域名必须已经解析到这台服务器；
- 你有服务器的 sudo 权限，能把生成的配置写进服务器的配置目录并重载服务。

## 5. 所需资源

| 资源 | 说明 |
| --- | --- |
| 一个浏览器 | 打开第 10 节的页面文件即可，不联网也能用 |
| 第 10 节的页面文件 | 保存到本地，文件名任意，例如 `config-generator.html` |
| 一台 Ubuntu 服务器 | 装有 Nginx、Apache、Caddy 其中至少一种，装法见 SRV-01 |
| 一个域名 | 示例用 `example.com`，实际使用时换成你自己的域名 |
| 上游应用（反向代理模式才需要） | 监听在回环地址的应用，例如 `127.0.0.1:8080`，不要直接暴露到公网 |

## 6. 技术原理

生成器没有魔法，它只做一件事：**模板替换**。三种服务器的站点配置，本质上是同一组信息换了三种写法：

| 信息 | Nginx 里叫什么 | Apache 里叫什么 | Caddy 里叫什么 |
| --- | --- | --- | --- |
| 域名 | `server_name` | `ServerName` | 站点块第一行的地址 |
| 静态站根目录 | `root` | `DocumentRoot` | `root` 指令 |
| 反向代理上游 | `proxy_pass` | `ProxyPass` / `ProxyPassReverse` | `reverse_proxy` |
| HTTPS 证书 | `ssl_certificate` / `ssl_certificate_key` | `SSLCertificateFile` / `SSLCertificateKeyFile` | 自动签发，或 `tls` 指令指定证书 |
| 访问日志 | `access_log` | `CustomLog` | `log` 指令 |
| 80 跳转 HTTPS | `return 301 https://$host$request_uri` | `Redirect permanent` | 自动（Caddy 默认把 HTTP 跳到 HTTPS） |

所以生成器的逻辑就是：读表单里的域名、模式、上游地址、是否 HTTPS，往三份模板里填值，再把结果原样输出。填值前后不改语义，不拼 SQL、不调接口、不碰你的服务器——页面完全在浏览器本地运行，填的内容不会发到任何地方。

## 7. 架构说明

本篇共四件工具，它们共用同一个页面、同一组输入，输出各不相同：

### 7.1 四件工具对照表

| 工具 | 输入 | 输出 | 适用场景 |
| --- | --- | --- | --- |
| ① Nginx 配置生成器 | 域名、模式（静态站/反向代理）、静态站根目录或上游地址、是否 HTTPS | 一份 Nginx `server` 配置，含 80 跳转块（HTTPS 时） | 服务器用 Nginx 时直接落盘 |
| ② Apache 配置生成器 | 同上 | 一份 Apache `VirtualHost` 配置，含 80 跳转块（HTTPS 时） | 服务器用 Apache 时直接落盘 |
| ③ Caddy 配置生成器 | 同上 | 一份 Caddy 站点块；HTTPS 时默认自动签发，也给手动证书写法 | 服务器用 Caddy 时直接落盘 |
| ④ 反向代理生成器 | 域名、上游地址、是否 HTTPS | 上面三份输出并排对照，同一条规则三种写法一一对应 | 换服务器、帮别人排障、学三种语法对照时用 |

### 7.2 页面结构

页面只有三部分，没有后端：

- **表单区**：域名、模式（静态站/反向代理二选一）、上游地址（反向代理模式时填）、静态站根目录（静态站模式时填）、是否 HTTPS（勾选框）；
- **生成逻辑**：三个纯函数 `genNginx`、`genApache`、`genCaddy`，输入同一组值，输出三种配置；函数里不碰页面元素，所以同一份逻辑既能在浏览器里跑，也能在 Node 里跑（第 13 节就是这么验的）；
- **输出区**：三个文本框，分别放三种配置，每个框旁边一个复制按钮；复制失败时（个别浏览器不允许剪贴板）手动全选复制即可。

### 7.3 生成器绝不做的事

- 不替你签证书、不替你改 DNS、不替你重启服务器——这些步骤在第 9 节里是手动步骤，生成器只出配置文本；
- 不把你填的域名和上游地址发到任何地方——页面没有网络请求，断网也能打开；
- 不同时启用三份配置——三份输出是“三选一”的关系，见第 9.5 节，选错会起冲突。

## 8. 操作前检查

动手前逐项打勾，缺一项先补齐再往下做：

1. 域名已经解析到服务器（静态站和反向代理都要）：`nslookup` 或 `dig` 查到的地址是你服务器的地址；
2. 静态站模式：网站文件已经放在根目录里（例如 `/var/www/example.com`），且目录权限让服务器用户能读；
3. 反向代理模式：上游应用已经在跑，并且只监听回环地址（例如 `127.0.0.1:8080`），从服务器本机能访问到它；
4. HTTPS 模式：证书文件已经存在（Nginx/Apache 用 Let's Encrypt 默认路径时，检查 `/etc/letsencrypt/live/你的域名/` 下有 `fullchain.pem` 和 `privkey.pem`）；Caddy 自动 HTTPS 模式跳过这一条，但域名必须已解析到本机；
5. 服务器上已经装好你要用的那种服务器，并且你知道它的配置目录（Nginx 是 `/etc/nginx/sites-available/`，Apache 是 `/etc/apache2/sites-available/`，Caddy 是 `/etc/caddy/Caddyfile`）。

## 9. 逐步操作

### 9.1 保存生成器页面

把第 10 节的完整代码复制下来，保存为本地文件，例如 `config-generator.html`，用浏览器打开它。页面不需要联网、不需要起本地服务器，直接双击打开就能用。

### 9.2 填表（以反向代理 + HTTPS 为例）

| 表单项 | 填什么（示例） | 说明 |
| --- | --- | --- |
| 域名 | `example.com` | 换成你自己的域名；不要带 `http://` 前缀 |
| 模式 | 反向代理 | 静态站选“静态站”，并填根目录 |
| 上游地址 | `127.0.0.1:8080` | 只写地址和端口，不要带 `http://`；生成器会自动补协议 |
| 静态站根目录 | `/var/www/example.com` | 只在静态站模式时用 |
| 是否 HTTPS | 勾选 | 勾选后输出含 443 块与 80 跳转块；Caddy 输出用自动 HTTPS |

### 9.3 生成并核对

点“生成配置”，三个输出框同时出现。核对三处再往下做：输出里的域名是不是你填的域名；上游地址是不是你填的上游；HTTPS 输出里有没有 443 块和 80 跳转块。任何一处不对，先改表单重生成，不要手动改输出——手动改了，下次重生成又会被覆盖。

### 9.4 落盘与启用（三选一，只启用一种）

- **Nginx**：输出保存到 `/etc/nginx/sites-available/example.com`，做符号链接到 `/etc/nginx/sites-enabled/`，跑 `sudo nginx -t`，通过后再 `sudo systemctl reload nginx`；
- **Apache**：输出保存到 `/etc/apache2/sites-available/example.com.conf`，跑 `sudo a2ensite example.com`（反向代理模式还要先 `sudo a2enmod proxy proxy_http ssl`），跑 `sudo apachectl configtest`，通过后再 `sudo systemctl reload apache2`；
- **Caddy**：输出追加或替换到 `/etc/caddy/Caddyfile` 里对应的站点块，跑 `sudo caddy validate --config /etc/caddy/Caddyfile`，通过后再 `sudo systemctl reload caddy`。

### 9.5 不要同时启用三份

一台服务器上，同一个域名只能由一种服务器对外服务。三份输出是给三种不同服务器准备的，选你实际装的那一种落盘；另外两份留着对照学习，不要也写进配置目录，否则会出现端口抢占（三种服务器都想占 80 和 443）。

### 9.6 换成自己的应用时要改的地方

生成器只负责“出配置”，下面这些事每次换应用都要你自己确认：域名换成你自己的；上游地址换成你应用实际监听的地址；静态站根目录换成你网站文件实际的目录；证书路径换成你域名对应的证书路径；日志文件名里的域名部分跟着换，否则几个站点的日志会混写到同一个文件里。

## 10. 完整代码

### 10.1 四件工具的输入输出对照

| 工具 | 模式 | 域名 | 上游地址 | 根目录 | HTTPS | 输出 |
| --- | --- | --- | --- | --- | --- | --- |
| ① Nginx 配置生成器 | 静态站/反向代理 | 填 | 反向代理时填 | 静态站时填 | 勾选/不勾选 | Nginx `server` 配置 |
| ② Apache 配置生成器 | 静态站/反向代理 | 填 | 反向代理时填 | 静态站时填 | 勾选/不勾选 | Apache `VirtualHost` 配置 |
| ③ Caddy 配置生成器 | 静态站/反向代理 | 填 | 反向代理时填 | 静态站时填 | 勾选=自动 HTTPS，不勾选=纯 HTTP | Caddy 站点块 |
| ④ 反向代理生成器 | 反向代理 | 填 | 填 | 不用 | 勾选/不勾选 | 上面三份输出并排，同一条规则三种写法 |

### 10.2 生成器页面完整代码

下面是完整的页面代码，一字不缺，直接保存为 `config-generator.html` 就能用。三个生成函数是纯函数，不依赖页面元素；页面底部的接线代码只在浏览器里执行，所以同一份逻辑也能在 Node 里跑（第 13 节就是这么验的）。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>站点配置生成器</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 2em auto; padding: 0 1em; }
label { display: block; margin: 0.6em 0; }
input, select { width: 100%; padding: 0.4em; box-sizing: border-box; }
button { padding: 0.5em 1.2em; margin: 0.6em 0.4em 0.6em 0; cursor: pointer; }
textarea { width: 100%; height: 300px; font-family: monospace; box-sizing: border-box; }
</style>
</head>
<body>
<h1>站点配置生成器</h1>
<p>本页面完全在浏览器本地运行，不联网，不上传你填的任何内容。三份输出三选一使用，不要同时启用。</p>
<label>域名：<input id="domain" value="example.com"></label>
<label>模式：
<select id="mode">
<option value="proxy">反向代理</option>
<option value="static">静态站</option>
</select>
</label>
<label>上游地址（反向代理模式）：<input id="upstream" value="127.0.0.1:8080"></label>
<label>静态站根目录（静态站模式）：<input id="root" value="/var/www/example.com"></label>
<label><input type="checkbox" id="https" checked> 启用 HTTPS（Caddy 为自动 HTTPS）</label>
<button id="genBtn">生成配置</button>
<h2>Nginx 配置</h2>
<textarea id="outNginx" readonly></textarea>
<button data-copy="outNginx">复制 Nginx 配置</button>
<h2>Apache 配置</h2>
<textarea id="outApache" readonly></textarea>
<button data-copy="outApache">复制 Apache 配置</button>
<h2>Caddy 配置</h2>
<textarea id="outCaddy" readonly></textarea>
<button data-copy="outCaddy">复制 Caddy 配置</button>
<script>
function clean(s) { return String(s).trim(); }
function genNginx(o) {
  var d = clean(o.domain);
  var up = clean(o.upstream);
  var root = clean(o.root);
  var lines = [];
  if (o.https) {
    lines.push('server {');
    lines.push('    listen 80;');
    lines.push('    listen [::]:80;');
    lines.push('    server_name ' + d + ';');
    lines.push('    return 301 https://$host$request_uri;');
    lines.push('}');
    lines.push('');
    lines.push('server {');
    lines.push('    listen 443 ssl;');
    lines.push('    listen [::]:443 ssl;');
    lines.push('    server_name ' + d + ';');
    lines.push('    ssl_certificate /etc/letsencrypt/live/' + d + '/fullchain.pem;');
    lines.push('    ssl_certificate_key /etc/letsencrypt/live/' + d + '/privkey.pem;');
  } else {
    lines.push('server {');
    lines.push('    listen 80;');
    lines.push('    listen [::]:80;');
    lines.push('    server_name ' + d + ';');
  }
  lines.push('    access_log /var/log/nginx/' + d + '-access.log;');
  lines.push('    error_log /var/log/nginx/' + d + '-error.log;');
  if (o.mode === 'static') {
    lines.push('    root ' + root + ';');
    lines.push('    index index.html;');
    lines.push('    location / {');
    lines.push('        try_files $uri $uri/ =404;');
    lines.push('    }');
    lines.push('    location ~ /\\. {');
    lines.push('        deny all;');
    lines.push('    }');
  } else {
    lines.push('    location / {');
    lines.push('        proxy_pass http://' + up + ';');
    lines.push('        proxy_set_header Host $host;');
    lines.push('        proxy_set_header X-Real-IP $remote_addr;');
    lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    lines.push('        proxy_set_header X-Forwarded-Proto $scheme;');
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}
function genApache(o) {
  var d = clean(o.domain);
  var up = clean(o.upstream);
  var root = clean(o.root);
  var lines = [];
  if (o.https) {
    lines.push('<VirtualHost *:80>');
    lines.push('    ServerName ' + d);
    lines.push('    Redirect permanent / https://' + d + '/');
    lines.push('</VirtualHost>');
    lines.push('');
    lines.push('<VirtualHost *:443>');
    lines.push('    ServerName ' + d);
    lines.push('    SSLEngine on');
    lines.push('    SSLCertificateFile /etc/letsencrypt/live/' + d + '/fullchain.pem');
    lines.push('    SSLCertificateKeyFile /etc/letsencrypt/live/' + d + '/privkey.pem');
  } else {
    lines.push('<VirtualHost *:80>');
    lines.push('    ServerName ' + d);
  }
  lines.push('    ErrorLog ${APACHE_LOG_DIR}/' + d + '-error.log');
  lines.push('    CustomLog ${APACHE_LOG_DIR}/' + d + '-access.log combined');
  if (o.mode === 'static') {
    lines.push('    DocumentRoot ' + root);
    lines.push('    <Directory ' + root + '>');
    lines.push('        Options -Indexes +FollowSymLinks');
    lines.push('        AllowOverride None');
    lines.push('        Require all granted');
    lines.push('    </Directory>');
  } else {
    lines.push('    ProxyPreserveHost On');
    lines.push('    ProxyPass / http://' + up + '/');
    lines.push('    ProxyPassReverse / http://' + up + '/');
  }
  lines.push('</VirtualHost>');
  return lines.join('\n');
}
function genCaddy(o) {
  var d = clean(o.domain);
  var up = clean(o.upstream);
  var root = clean(o.root);
  var lines = [];
  if (o.https) {
    lines.push(d + ' {');
  } else {
    lines.push('http://' + d + ' {');
  }
  if (o.mode === 'static') {
    lines.push('    root * ' + root);
    lines.push('    file_server');
  } else {
    lines.push('    reverse_proxy ' + up);
  }
  lines.push('    log {');
  lines.push('        output file /var/log/caddy/' + d + '-access.log');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}
if (typeof document !== 'undefined') {
  document.getElementById('genBtn').addEventListener('click', function () {
    var o = {
      domain: document.getElementById('domain').value,
      mode: document.getElementById('mode').value,
      upstream: document.getElementById('upstream').value,
      root: document.getElementById('root').value,
      https: document.getElementById('https').checked
    };
    if (!clean(o.domain)) { alert('请先填域名'); return; }
    if (o.mode === 'proxy' && !clean(o.upstream)) { alert('反向代理模式请先填上游地址'); return; }
    if (o.mode === 'static' && !clean(o.root)) { alert('静态站模式请先填根目录'); return; }
    document.getElementById('outNginx').value = genNginx(o);
    document.getElementById('outApache').value = genApache(o);
    document.getElementById('outCaddy').value = genCaddy(o);
  });
  var buttons = document.querySelectorAll('[data-copy]');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ta = document.getElementById(btn.getAttribute('data-copy'));
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value);
      } else {
        document.execCommand('copy');
      }
    });
  });
}
</script>
</body>
</html>
```

上面这份代码有三处故意写死、不要改错：Caddy 的 HTTPS 输出里站点块第一行就是裸域名（不写 `https://` 前缀），因为 Caddy 看到裸域名默认自动签发并自动做 HTTP 跳转；Nginx 与 Apache 的 80 跳转块里用的是 `$host` 与域名本身，不是写死的 `www` 前缀；反向代理的上游地址生成器只补 `http://` 前缀，不补路径——上游应用如果不在根路径下服务，路径部分要你自己在落盘后按第 12 节的说明补。

## 11. 完整配置文件（存放路径）

### 11.1 文件清单

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `config-generator.html`（本地任意目录） | 生成器页面本身 | 双击用浏览器打开，不用部署到服务器 |
| `/etc/nginx/sites-available/example.com` | Nginx 生成的配置落盘位置 | 文件名换成你自己的域名；再做符号链接到 `/etc/nginx/sites-enabled/` |
| `/etc/nginx/sites-enabled/example.com` | Nginx 启用链接 | 指向上一行的符号链接，Nginx 只读启用目录 |
| `/etc/apache2/sites-available/example.com.conf` | Apache 生成的配置落盘位置 | 文件名换成你自己的域名；`a2ensite` 生成启用链接 |
| `/etc/caddy/Caddyfile` | Caddy 生成的配置落盘位置 | 把输出的站点块追加进去，不要把整份文件覆盖掉（文件里可能已有其他站点） |
| `/etc/letsencrypt/live/example.com/fullchain.pem`、`/etc/letsencrypt/live/example.com/privkey.pem` | 证书与私钥 | 签发方法见 09-web-hosting/05；路径里的域名换成你自己的 |
| `/var/www/example.com/` | 静态站根目录（静态站模式） | 生成器输出里的 `root` / `DocumentRoot` 指的就是它 |
| `/var/log/nginx/example.com-access.log`、`/var/log/caddy/example.com-access.log`、`${APACHE_LOG_DIR}/example.com-access.log` | 各服务器的访问日志 | 文件名里的域名跟着换，否则多站点日志混写 |

### 11.2 落盘前必须改的四处

生成器输出里的下面四处是示例值，落盘前按你自己的实际情况换掉，换完再启用：域名（`example.com` 换成你自己的域名）；上游地址（`127.0.0.1:8080` 换成你应用实际监听的地址）；静态站根目录（`/var/www/example.com` 换成你网站文件实际的目录）；证书路径里的域名部分（`/etc/letsencrypt/live/example.com/` 换成你域名对应的目录）。只换这四处，不要顺手改模板的其他行——模板的其他行是三种服务器的固定写法，改错了验证那一步会报错。

## 12. 每个关键配置项的解释

### 12.1 Nginx 输出逐项解释

| 配置项 | 作用 | 写错的后果 |
| --- | --- | --- |
| `listen 80` / `listen 443 ssl` | 监听端口，443 那块对外服务 | 只写 80 不写 443：HTTPS 打不开；只写 443 不写 80：HTTP 不跳转 |
| `server_name` | 这个配置管哪个域名 | 写错域名：访问时命中默认站点，看到别人的页面或 444 |
| `return 301 https://$host$request_uri` | 80 端口永久跳转到 HTTPS，保留原路径 | 写成不带 `$request_uri`：跳转后路径丢了，用户落到首页 |
| `ssl_certificate` / `ssl_certificate_key` | 证书与私钥路径 | 路径错：`nginx -t` 直接报错，服务重载失败 |
| `proxy_pass http://上游地址` | 反向代理转发到上游 | 上游地址错：502；上游没起：502；协议写成 `https://` 但上游只监听 HTTP：502 |
| `proxy_set_header Host $host` | 把原始域名透传给上游 | 不写：上游看到的 Host 是 `127.0.0.1:8080`，按域名路由的应用会认错站 |
| `proxy_set_header X-Forwarded-Proto $scheme` | 把原始协议透传给上游 | 不写：上游以为请求是 HTTP，可能把 HTTPS 链接生成错，或反复跳转 |
| `try_files $uri $uri/ =404`（静态站） | 先找文件、再找目录、都没有返回 404 | 写成 `try_files $uri =404`：目录首页打不开 |
| `location ~ /\. { deny all; }`（静态站） | 挡住 `.git`、`.env` 这类点号开头的文件 | 不写：点号文件可能被直接下载，配置与密钥外泄 |

### 12.2 Apache 输出逐项解释

| 配置项 | 作用 | 写错的后果 |
| --- | --- | --- |
| `ServerName` | 这个虚拟主机管哪个域名 | 写错：访问时命中默认虚拟主机 |
| `Redirect permanent / https://域名/` | 80 端口永久跳转到 HTTPS | 目标域名写错：跳转到别人的域名 |
| `SSLEngine on` | 这个虚拟主机启用 TLS | 不写：443 端口按明文处理，浏览器报协议错 |
| `SSLCertificateFile` / `SSLCertificateKeyFile` | 证书与私钥路径 | 路径错：`apachectl configtest` 报错 |
| `ProxyPass` / `ProxyPassReverse` | 正向转发与响应头里的地址回写 | 只写 `ProxyPass` 不写 `ProxyPassReverse`：上游返回的重定向地址还是内网地址，浏览器跳不过去 |
| `ProxyPreserveHost On` | 把原始域名透传给上游 | 不写：同 Nginx 的 `Host` 项，应用按域名路由会认错站 |
| `DocumentRoot`（静态站） | 静态站根目录 | 目录错：404；目录权限不对：403 |
| `<Directory>` 块里的 `Require all granted`（静态站） | 允许访问这个目录 | 不写：默认拒绝，静态站全站 403 |

### 12.3 Caddy 输出逐项解释

| 配置项 | 作用 | 写错的后果 |
| --- | --- | --- |
| 站点块第一行写裸域名 | Caddy 看到裸域名默认自动签发证书、自动做 HTTP 跳转 | 写成 `http://域名`：Caddy 不再自动签发，变成纯 HTTP，浏览器地址栏没有锁 |
| `reverse_proxy 上游地址` | 反向代理转发到上游 | 上游地址错：502；上游没起：502 |
| `root * 根目录`（静态站） | 静态站根目录，`*` 表示匹配所有请求 | 不写 `*`：Caddy 2 的 `root` 指令要求带匹配器，配置验证报错 |
| `file_server`（静态站） | 开启静态文件服务 | 不写：请求到了根目录也没有文件服务，返回 404 |
| `log` 块 | 访问日志落盘位置 | 不写：日志只走标准输出，排障时找不到按站点的日志 |
| 手动证书模式（HTTPS 但不用自动签发时） | 在站点块里加 `tls 证书路径 私钥路径` 两行 | 证书路径错：`caddy validate` 报错；自动签发与手动证书混用：以手动为准，自动签发不再触发 |

### 12.4 同一条反向代理规则，三种写法对照

输入相同（域名 `example.com`、上游 `127.0.0.1:8080`、HTTPS），三种输出的核心行对照如下（完整输出见第 13 节）：

| 意思 | Nginx | Apache | Caddy |
| --- | --- | --- | --- |
| 管哪个域名 | `server_name example.com;` | `ServerName example.com` | 站点块第一行 `example.com {` |
| 转发到上游 | `proxy_pass http://127.0.0.1:8080;` | `ProxyPass / http://127.0.0.1:8080/` | `reverse_proxy 127.0.0.1:8080` |
| 透传域名 | `proxy_set_header Host $host;` | `ProxyPreserveHost On` | 默认透传，不用写 |
| HTTPS 证书 | `ssl_certificate` 两行 | `SSLCertificateFile` 两行 | 默认自动签发，不用写 |

## 13. 执行结果示例

下面三份输出不是手写的示例，是把第 10 节页面里的生成逻辑抽出来，在 Node 里用同一组输入真实跑出来的结果：域名 `example.com`，模式反向代理，上游 `127.0.0.1:8080`，HTTPS 已勾选。第 14 节的验证步骤里，读者在浏览器里填同样的值，得到的应当是同样的三份输出。

### 13.1 Nginx 输出（真实运行结果）

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.com;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    access_log /var/log/nginx/example.com-access.log;
    error_log /var/log/nginx/example.com-error.log;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 13.2 Apache 输出（真实运行结果）

```apache
<VirtualHost *:80>
    ServerName example.com
    Redirect permanent / https://example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName example.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem
    ErrorLog ${APACHE_LOG_DIR}/example.com-error.log
    CustomLog ${APACHE_LOG_DIR}/example.com-access.log combined
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
```

### 13.3 Caddy 输出（真实运行结果）

```caddy
example.com {
    reverse_proxy 127.0.0.1:8080
    log {
        output file /var/log/caddy/example.com-access.log
    }
}
```

## 14. 成功验证

### 14.1 生成器本身的验证（浏览器里，立即能做）

1. 打开页面，填域名 `example.com`、模式反向代理、上游 `127.0.0.1:8080`、勾选 HTTPS，点生成配置；
2. 核对三份输出：Nginx 输出里有 80 跳转块和 443 块，域名是 `example.com`，上游是 `127.0.0.1:8080`；Apache 输出里有 80 跳转虚拟主机和 443 虚拟主机；Caddy 输出里站点块第一行是裸域名 `example.com`，里面有 `reverse_proxy 127.0.0.1:8080`；
3. 改模式为静态站、根目录填 `/var/www/example.com`，重生成：三份输出里都不再出现上游地址，取而代之的是根目录（Nginx 的 `root`、Apache 的 `DocumentRoot`、Caddy 的 `root *`）；
4. 取消 HTTPS 再生成：Nginx 与 Apache 输出里不再出现 443 块与证书行，Caddy 输出里站点块第一行变成 `http://example.com`。

### 14.2 生成的配置落盘后的验证（服务器上，读者步骤）

1. 按第 9.4 节把选中的那一种配置落盘启用，先跑对应服务器的验证命令再重载：Nginx 是 `sudo nginx -t`，Apache 是 `sudo apachectl configtest`，Caddy 是 `sudo caddy validate --config /etc/caddy/Caddyfile`；
2. 验证命令通过后再重载服务，然后从浏览器访问域名：HTTP 应跳转到 HTTPS（HTTPS 模式时），页面应正常打开；
3. 反向代理模式：访问域名看到的应是上游应用的内容，且上游应用的日志里 Host 应是你填的域名；
4. 静态站模式：访问域名应看到根目录里的首页，访问一个不存在的路径应返回 404，访问 `.env` 这类点号文件应被拒绝。

## 15. 常见错误

| 现象 | 常见原因 | 修正办法 |
| --- | --- | --- |
| `nginx -t` 报证书文件找不到 | 证书路径里的域名没换成你自己的，或证书还没签 | 检查 `/etc/letsencrypt/live/你的域名/` 下两个文件是否存在，路径换对 |
| `nginx -t` 通过，重载后还是旧页面 | 配置写进了 `sites-available` 但忘了做符号链接到 `sites-enabled` | 补符号链接再重载 |
| Apache 报 `ProxyPass` 相关模块未加载 | 反向代理模式没开 `proxy` 与 `proxy_http` 模块 | `sudo a2enmod proxy proxy_http` 后再重载 |
| Apache 报证书相关错误 | 443 虚拟主机没开 `ssl` 模块，或证书路径错 | `sudo a2enmod ssl`，检查证书路径 |
| Caddy 输出的站点块第一行是 `http://域名`，但你想要 HTTPS | 生成时没勾选 HTTPS | 勾选 HTTPS 重生成，Caddy 输出第一行应为裸域名 |
| 三种服务器同时装，80 端口被占 | 三份配置同时启用，抢端口 | 只启用你实际用的那一种，见第 9.5 节 |
| 生成的配置里上游地址带了 `http://` 前缀 | 表单里上游地址填了 `http://127.0.0.1:8080` | 上游地址只填 `127.0.0.1:8080`，协议由生成器补 |
| 浏览器里点生成没反应 | 域名没填，或反向代理模式没填上游地址 | 按页面提示补填后再点生成 |

上面表格里的错误写法只出现在表格与行内文字里，没有写成带围栏的代码块——照着表格里的“修正办法”做，不要把错误写法复制进配置。

## 16. 故障排查

按“先看验证命令、再看日志、最后看输入”的顺序查，不要一上来就改模板：

1. **验证命令先跑**：`nginx -t`、`apachectl configtest`、`caddy validate` 任一报错，报错信息里会直接指出哪一行、哪个指令有问题，先按报错改那一行；
2. **看日志定位**：验证通过但访问不正常时，看对应服务器的错误日志（Nginx 是 `/var/log/nginx/域名-error.log`，Apache 是 `${APACHE_LOG_DIR}/域名-error.log`，Caddy 是 `journalctl -u caddy` 或 `log` 块指定的文件），502 找上游，403 找目录权限，404 找根目录与路径；
3. **确认上游在跑**：502 时先在服务器本机访问上游地址（例如 `curl http://127.0.0.1:8080/`），本机都不通就是上游应用本身没起，与配置无关；
4. **确认只启用了一份**：多服务器抢端口时，报错往往是“地址已被占用”，检查是不是三份配置同时启用了，见第 9.5 节；
5. **回到上一份配置**：按第 18 节的回退办法先恢复访问，再慢慢比对新旧配置的差异，不要在断站状态下反复试。

## 17. 安全注意事项

- **生成器页面不要部署到公网**：页面本身不含密钥，但它会原样输出你填的域名与上游地址；只在本地浏览器打开，不要把它放到网站目录里任人访问；
- **证书私钥权限**：`/etc/letsencrypt/live/域名/privkey.pem` 只给 root 与服务器用户读，不要改成所有人可读；生成器输出里只有证书路径，没有私钥内容，不要把私钥内容粘进任何配置或页面；
- **上游只绑回环地址**：反向代理的上游应用只监听 `127.0.0.1`，不要监听 `0.0.0.0`——监听 `0.0.0.0` 等于把应用直接暴露到公网，绕过了 Nginx/Apache/Caddy 这一层；
- **挡住点号文件**：静态站输出里有挡点号文件的规则，落盘后不要删它；`.env`、`.git` 这类文件一旦能被直接下载，配置与密钥就外泄了；
- **不要把真实口令写进生成器**：生成器不需要口令，表单里也没有口令项；数据库口令、应用密钥一律只出现在服务器的 `.env` 或凭据文件里，权限 600，绝不进配置、绝不进页面。

## 18. 回滚和恢复

落盘前先给旧配置留备份，回退时不需要重生成：

1. **落盘前备份**：`sudo cp /etc/nginx/sites-available/example.com /etc/nginx/sites-available/example.com.bak`（Apache 与 Caddy 同理，文件名换成你自己的）；
2. **回退**：`sudo cp /etc/nginx/sites-available/example.com.bak /etc/nginx/sites-available/example.com`，再跑 `sudo nginx -t`，通过后 `sudo systemctl reload nginx`；
3. **整站回退**：如果新配置导致服务起不来，先用备份恢复，再看错误日志定位，不要在服务停着的状态下反复改配置；
4. **生成器页面本身没有回退问题**：页面是本地文件，改坏了重新从第 10 节复制一份即可，服务器上的旧配置不受影响。

## 19. 延伸阅读

- SRV-01 Nginx、Apache、Caddy 完整配置与多站点：三种服务器的完整语法与多站点写法，本篇的模板来源；
- SRV-02 PHP-FPM、systemd、运行环境与进程管理：上游应用怎么以服务方式跑起来、开机自启怎么做；
- DEPLOY-03 HTTPS、CDN、域名解析上线全流程：证书签发、自动续期、强制跳转、HSTS 取舍的上线全流程；
- 09-web-hosting/05 证书签发与续期：Let's Encrypt 证书怎么签、怎么自动续期；
- OPS-02 安全：WAF、限流、漏洞修复、安全响应头、密钥管理：配置落盘后的安全加固；
- Caddy 官方文档的自动 HTTPS 说明：Caddy 看到裸域名默认自动签发的规则与例外（域名必须已解析到本机、80 与 443 端口可用）。

## 20. 相关章节链接

- 上一篇：[PROJ-08 旗舰：一台服务器托管多网站](../projects/08-multi-site.md)
- [SRV-01 Nginx、Apache、Caddy 完整配置与多站点](../server/01-web-servers.md)
- [SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- [MASTER_PLAN](../MASTER_PLAN.md)
- [TASK_INDEX](../TASK_INDEX.md)
- [ROADMAP](../ROADMAP.md)
- 下一篇：[TOOL-02 建站工具 2：Docker Compose、systemd、备份脚本、部署检查清单生成器](02-deploy-tools.md)
