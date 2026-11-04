# PROJ-04：Node.js 网站从零部署完整教程

> 任务编号：PROJ-04（网站建设与部署实战指南 · 完整实战第 4 篇）
> 上一篇：[PROJ-03 Python 网站（Flask/Django）从零部署](03-python.md)；下一篇：[PROJ-05 PHP 网站、Go API 服务从零部署](05-php-go.md)。
> 本篇只讲一个 Node.js 小站从零到上线的完整实战：域名解析、服务器准备、Node.js 安装、依赖安装、PM2 与 systemd 二选一、Nginx 反向代理、HTTPS、上线检查。框架基础引用 BE-03，不重讲 Express 的语法；进程管理原理引用 SRV-02，不重讲 PM2 与 systemd 的原理；代码从本地送上服务器的方法引用 DEPLOY-01，不重讲 GitHub Actions 的完整写法。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 从一台只有 Ubuntu 系统和 SSH 登录的服务器出发，把一个 Node.js 小站完整部署上线，做到域名能打开、HTTPS 能访问、重启后服务自己恢复；
2. 说清一次请求的完整链路：浏览器、域名解析、Nginx、Node.js 应用、静态文件与 API 各自在哪一步；
3. 在 PM2 与 systemd 之间选一个管你的应用，并说清为什么同一台机器上不要两个都管同一个应用；
4. 用 Nginx 反向代理把 Node.js 应用藏在回环地址后面，不把应用端口直接暴露到公网；
5. 用 certbot 给域名配好 HTTPS 并设好自动续期，知道续期失败时去哪查；
6. 按第 14 节的清单自己验证上线结果，出问题时按第 16 节的表格定位到某一步。

## 2. 适用人群

本篇适合下面这些人：

- 读过 BE-03，已经会写 Node.js 应用，想把它真正放到服务器上给别人访问的人；
- 已经有一个能在本地跑起来的 Node.js 小站（Express 或其他框架），卡在“本地能跑、服务器不会配”这一步的人；
- 想完整走一遍“域名、服务器、反向代理、HTTPS、上线检查”全流程的新手站长。

不适合还没写过任何 Node.js 代码的人：先读 JS-01、JS-02 和 BE-03，再回来。不适合只想做纯静态展示站的人：没有登录、没有 API 需求的站，先看 PROJ-01 的静态站实战，用不着 Node.js 后端。不适合想一次部署多个站点、多个服务的人：那是 PROJ-06 的 Docker 多容器平台，本篇只讲单站点单应用。

## 3. 适用系统和版本

- 服务器系统：Ubuntu 24.04 LTS（本篇所有路径与命令都按 Ubuntu/Debian 系写，其他发行版的包管理器与服务路径不同，不能照抄）。
- Node.js：推荐 22 LTS 或 24 LTS，最低 20.19 以上或 22.12 以上（与 BE-03、JS-04 的要求一致）。本机核查到的 Node.js 为 v24.22.1，写文章时用这个版本做的语法检查；读者安装时以 Node.js 官网当场公布的 LTS 版本为准，不要钉死某一个补丁号。
- 包管理器：npm（随 Node.js 一起装），本篇用 `npm install` 装依赖，不用 pnpm 或 yarn，避免三种工具的命令混写。
- Web 服务器：Nginx（Ubuntu 仓库版即可，安装时以仓库当场公布的版本为准，本机未装 Nginx，未做版本核查）。
- 进程管理：PM2 与 systemd 二选一（见第 9.5 节），不要两个都用。
- 域名：一个你已经买好、能自己改解析的域名，本篇示例域名一律用保留域名 `example.com`，读者须换成自己的真实域名。

## 4. 使用前提

动手前确认下面五件事，缺一件就先补齐，不要硬着头皮往下走：

1. 一台能 SSH 登录的 Ubuntu 24.04 服务器，你有 sudo 权限，能执行 `sudo apt update`。
2. 一个域名，你能在注册商或 DNS 服务商后台改它的解析记录。
3. 本地机器上已经有一个能跑的 Node.js 项目，或者愿意照着第 10 节从零建一个。
4. 本地机器装有 git（传代码用），或者能用 scp 传文件（第 9.4 节给两种办法）。
5. 服务器的 22、80、443 端口没有被云厂商的安全组或机房防火墙挡住（第 8 节会逐项检查）。

## 5. 所需资源

| 资源 | 说明 |
| --- | --- |
| 服务器 | 1 核 1GB 内存起步即可跑本篇的小站，2GB 更宽裕；硬盘 20GB 以上 |
| 域名 | 1 个，解析到服务器公网 IP |
| 时间 | 第一次走全流程约 1 到 2 小时，其中 DNS 生效等待占一部分 |
| 账号 | 服务器 SSH 账号、域名后台账号，不需要任何第三方平台账号 |
| 工具 | 本地终端、SSH 客户端、浏览器 |

费用说明：本篇不涉及任何付费服务推荐，服务器与域名的价格因厂商而异，文中不写死具体价格，只给选型方法。

## 6. 技术原理

一个 Node.js 网站上线后，一次请求的完整链路是下面七步，任何一步断了，浏览器里看到的现象都不同，第 16 节的排查表就是按这七步排的：

1. 浏览器问 DNS：`example.com` 对应哪个 IP。
2. 浏览器连服务器的 443 端口（HTTPS），先做 TLS 握手，确认证书是你的域名、没过期。
3. Nginx 接到请求，看 `server_name` 匹配到本站点的配置。
4. Nginx 按配置把请求反向代理到本机回环地址 `127.0.0.1:3000`，也就是 Node.js 应用监听的地址。
5. Node.js 应用判断是静态文件还是 API：静态文件从 `public/` 目录返回，API 走路由处理并返回 JSON。
6. 应用把响应交还给 Nginx，Nginx 再交还给浏览器。
7. 浏览器渲染页面，页面里的 JavaScript 再调一次 `/api/articles`，拿到文章列表渲染出来。

三个关键设计要先讲清：

- **为什么 Node.js 不直接对公网监听**：Node.js 应用只绑 `127.0.0.1`，公网只能先到 Nginx。Nginx 负责 TLS、静态缓存、安全头、限流，应用只负责业务，职责分开，出问题也好定位。
- **为什么需要 PM2 或 systemd**：直接在终端跑 `node server.js`，关了终端进程就死，服务器重启后也不会自己起来。PM2 或 systemd 负责“崩溃自动重启、开机自动启动、日志能查到”这三件事。
- **为什么 PM2 与 systemd 二选一**：两个都管同一个应用时，重启策略会打架（一个拉起来、另一个又拉起来，或者一个杀掉另一个的进程），日志也会分成两处，排查时分不清谁在管。选一个，另一个就不要装不要启用。

## 7. 架构说明

本篇小站的部署拓扑（单服务器、单应用、单站点）：

| 层 | 组件 | 监听地址 | 职责 |
| --- | --- | --- | --- |
| 域名解析 | DNS 记录 | 对外 | `example.com` 指到服务器公网 IP |
| 入口 | Nginx | 公网 80、443 | TLS、反向代理、安全头、静态缓存 |
| 应用 | Node.js（Express） | 回环 127.0.0.1:3000 | 路由、静态文件、API |
| 进程管理 | PM2 或 systemd（二选一） | 本机 | 崩溃重启、开机自启、日志 |
| 数据 | 内存数组（本篇示例） | 应用内 | 三篇文章的示例数据，不接数据库 |
| 证书 | certbot + Let's Encrypt | 本机 | 申请与自动续期 |

目录规划（全篇统一用这套路径，不要各节各写一套）：

| 路径 | 用途 |
| --- | --- |
| `/srv/node-site/` | 应用代码目录，属主为部署用户 |
| `/srv/node-site/server.js` | 应用入口 |
| `/srv/node-site/public/` | 静态文件目录 |
| `/srv/node-site/.env` | 环境变量文件，权限 600，绝不进仓库 |
| `/etc/nginx/sites-available/node-site` | Nginx 站点配置 |
| `/etc/nginx/sites-enabled/node-site` | 上面文件的符号链接，Nginx 实际读取它 |
| `/etc/systemd/system/node-site.service` | systemd 服务单元（选 systemd 时才有） |
| `/srv/node-site/ecosystem.config.js` | PM2 生态文件（选 PM2 时才有） |
| `/etc/letsencrypt/live/example.com/` | 证书目录（certbot 生成，不要手动改里面的文件） |

数据说明：本篇示例用内存数组存三篇文章，重启后新增的文章会丢，这是故意的——本篇的重点是部署全流程，不是数据库。需要持久化时，接数据库的方法见 BE-03 与 DB-01，不要在本篇的内存数组上硬扩。

## 8. 操作前检查

动手前在本地与服务器上各跑一遍下面这张表，有一项不通过就先修好，不要跳过：

| 检查项 | 命令或操作 | 通过标准 |
| --- | --- | --- |
| SSH 能登录 | `ssh deploy@example.com`（换成你的用户与域名或 IP） | 能进服务器终端 |
| 服务器系统版本 | `lsb_release -a` | 显示 Ubuntu 24.04 |
| 服务器有 sudo | `sudo -n true` | 不报错、不要求输密码（或按你的 sudo 配置能提权） |
| 80、443 端口未被占 | `sudo ss -tlnp` | 没有其他程序占 80、443 |
| 域名解析已指到服务器 | `dig example.com A`（换成你的域名） | 返回服务器公网 IP |
| 本地 Node.js 能跑 | `node -v` | 显示版本号 |
| 本地 git 可用 | `git --version` | 显示版本号 |

端口说明：`ss` 命令看的是服务器本机监听情况，云厂商安全组是另一层，两层都要放行 22、80、443，只放一层还是打不开。

## 9. 逐步操作

下面九步按顺序做，不要跳步。第 10 节是完整代码，第 11 节是完整配置文件，本节只讲每一步“做什么、在哪台机器上做、做到什么算完成”。

### 9.1 域名解析：把域名指到服务器

在域名后台加一条 A 记录：主机记录填 `@`（代表裸域名），记录值填服务器公网 IP，TTL 先填 600（上线初期用短 TTL，解析改错了能快速纠正，稳定后再改回 3600）。如果你还要 `www` 也能访问，再加一条 CNAME 记录：主机记录填 `www`，记录值填 `example.com`。加完后在本地跑 `dig example.com A`，返回服务器公网 IP 才算完成；如果返回的还是旧 IP，等 TTL 过期再查，不要急着往下做 HTTPS（证书申请时要验证域名解析，解析没生效会失败）。

### 9.2 服务器准备：更新系统、装 Nginx 与 git

在服务器上执行下面命令（以 sudo 用户执行，当前目录不限）：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx git curl
```

装完后确认 Nginx 已启动：`sudo systemctl status nginx` 应显示 active。先不要改 Nginx 配置，第 9.7 节会一次性写好本站点的配置。

### 9.3 安装 Node.js：用官方仓库装 LTS 版

在服务器上执行下面命令（以 Node.js 22 LTS 线为例，安装时以官网当场公布的 LTS 版本为准，`setup_22.x` 里的数字按官网改）：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

`node -v` 显示 `v22` 开头的版本号才算完成。如果显示的是旧版（例如 Ubuntu 仓库自带的旧 Node.js），说明 NodeSource 仓库没生效，先排查仓库源，不要直接用旧版硬上（旧版可能不支持应用用到的语法）。

### 9.4 把代码传上服务器：git 拉取或 scp 二选一

推荐用 git 拉取（改完代码再部署时只要 `git pull`，见 DEPLOY-01）：先在本地把项目推到自己的仓库，再在服务器上执行：

```bash
sudo mkdir -p /srv/node-site
sudo chown deploy:deploy /srv/node-site
cd /srv/node-site
git clone https://github.com/你的用户名/node-site.git .
```

上面三行里的 `deploy` 是服务器上的部署用户名，`你的用户名` 换成你自己的 GitHub 用户名，仓库地址换成你自己的仓库地址，不要照抄示例里的占位写法去跑（占位地址一定会失败，这是故意的）。

如果暂时不想用 git，用 scp 传文件也可以：

```bash
scp -r ./node-site deploy@example.com:/srv/node-site/
```

两种办法二选一，不要两个混用（混用后 `git pull` 会与 scp 传上去的文件冲突）。

### 9.5 装依赖、写环境变量、选一个进程管理工具

在服务器应用目录里执行：

```bash
cd /srv/node-site
npm install --omit=dev
```

`--omit=dev` 表示不装开发依赖，生产服务器不需要测试框架与开发工具，装了只会变慢变大。

写环境变量文件 `/srv/node-site/.env`（内容见第 11 节），写完后立即改权限：

```bash
chmod 600 /srv/node-site/.env
```

权限 600 表示只有属主能读写，组与其他用户都不能读，口令与密钥就靠这一层挡住。`.env` 绝不提交到 git 仓库，仓库里只放 `.env.example`（见第 10 节），里面只有键名与占位符。

进程管理二选一，本篇推荐 systemd（服务器自带，不用另装，日志走 journal），PM2 作为替代方案放在第 11 节：

```bash
sudo systemctl enable node-site
sudo systemctl start node-site
sudo systemctl status node-site
```

`systemctl status` 显示 active 才算完成。选 PM2 时用 `pm2 start ecosystem.config.js` 与 `pm2 save`、`pm2 startup`，不要同时再启用 systemd 的 `node-site` 服务。

### 9.6 先在回环地址上验证应用能跑

在服务器上执行：

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/articles
```

第一条应返回健康检查的 JSON，第二条应返回文章列表的 JSON（具体内容见第 13 节）。这一步通了，说明应用本身没问题；如果这一步不通，不要往下配 Nginx，先按第 16 节排查应用（端口、依赖、环境变量三处最常见）。

### 9.7 写 Nginx 配置：反向代理到回环地址

把第 11 节的 Nginx 配置写到 `/etc/nginx/sites-available/node-site`，做符号链接到 `sites-enabled`，检查语法并重载：

```bash
sudo ln -s /etc/nginx/sites-available/node-site /etc/nginx/sites-enabled/node-site
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` 显示成功才重载，显示失败时不要重载（失败时重载不会生效，还会把旧配置的报错藏起来）。重载后在本地跑 `curl http://example.com/api/health`，应返回与第 9.6 节一样的健康检查 JSON，说明 Nginx 反代已通。

### 9.8 配 HTTPS：certbot 申请证书并设自动续期

在服务器上装 certbot 的 Nginx 插件并申请证书（把 `example.com` 换成你的真实域名，`www.example.com` 按需保留或去掉）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

certbot 会问邮箱（用于续期提醒）与是否强制跳转到 HTTPS，邮箱填你自己的，强制跳转选是。申请成功后 certbot 会自动改写 Nginx 配置、加好 443 段，并装好自动续期的定时任务。验证续期任务存在：`sudo systemctl list-timers | grep certbot` 应有一行。不要手动改 `/etc/letsencrypt/` 里面的证书文件，续期时 certbot 自己会换。

### 9.9 上线检查：按清单逐项打勾

按第 14 节的清单逐项验证，全部通过才算上线完成：域名 HTTP 跳 HTTPS、HTTPS 首页能打开、API 能返回数据、重启服务器后服务自己恢复、证书有效期大于 30 天。任何一项不通过都按第 16 节定位，不要先对外宣传、再慢慢修。

## 10. 完整代码

本节是本篇小站的全部代码，复制下来、按注明的路径放好、装好依赖就能跑。代码里没有省略号，没有“其余代码略”这类写法。框架语法本身见 BE-03，本节只给能跑通的最小完整版。

### 10.1 应用入口：`server.js`（存放路径：`/srv/node-site/server.js`）

```js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const articles = [
  { id: 1, title: '我的第一篇建站笔记', status: 'published' },
  { id: 2, title: '给新手的索引入门', status: 'published' },
  { id: 3, title: '草稿：还没写完的缓存笔记', status: 'draft' }
];

app.get('/api/health', function (req, res) {
  res.json({ status: 'ok' });
});

app.get('/api/articles', function (req, res) {
  const published = articles.filter(function (a) {
    return a.status === 'published';
  });
  res.json({ total: published.length, articles: published });
});

app.get('/api/articles/:id', function (req, res) {
  const id = Number(req.params.id);
  const found = articles.find(function (a) {
    return a.id === id;
  });
  if (!found) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(found);
});

app.post('/api/articles', function (req, res) {
  const title = req.body.title;
  const content = req.body.content;
  if (!title || !content) {
    res.status(422).json({ error: 'VALIDATION_FAILED' });
    return;
  }
  const created = {
    id: articles.length + 1,
    title: title,
    status: 'draft'
  };
  articles.push(created);
  res.status(201).json(created);
});

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'NOT_FOUND' });
});

app.listen(PORT, '127.0.0.1', function () {
  console.log('listening on 127.0.0.1:' + PORT);
});
```

注意三点：第一，`app.listen` 第二个参数是 `'127.0.0.1'`，应用只绑回环地址，不直接对公网监听，公网流量必须先过 Nginx（见第 6 节）；第二，`GET /api/articles` 只返回已发布文章，草稿不返回，这是故意的业务规则，不是漏写；第三，新增文章只写进内存数组，重启后会丢，持久化方法见 DB-01 与 BE-03，不要在本篇的内存数组上硬扩。

### 10.2 依赖清单：`package.json`（存放路径：`/srv/node-site/package.json`）

```json
{
  "name": "node-site",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.22.0"
  }
}
```

`private: true` 表示这个包不会被误发布到 npm 公共仓库；`start` 脚本让 PM2 与 systemd 都可以用 `npm start` 或直接用 `node server.js` 启动，两种启动方式不要混用（第 11 节的两个进程管理配置里各写一种，选哪个就用哪个）。

### 10.3 首页：`public/index.html`（存放路径：`/srv/node-site/public/index.html`）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Node.js 小站</title>
</head>
<body>
<header>
<h1>Node.js 小站</h1>
<nav><a href="/">首页</a></nav>
</header>
<main>
<h2>文章列表</h2>
<ul id="list"></ul>
</main>
<footer>
<p>示例小站，仅用于部署实战。</p>
</footer>
<script>
fetch('/api/articles')
  .then(function (res) { return res.json(); })
  .then(function (data) {
    var list = document.getElementById('list');
    data.articles.forEach(function (a) {
      var li = document.createElement('li');
      li.textContent = a.title;
      list.appendChild(li);
    });
  });
</script>
</body>
</html>
```

### 10.4 环境变量示例：`.env.example`（存放路径：`/srv/node-site/.env.example`，进仓库）

```ini
PORT=3000
NODE_ENV=production
SESSION_SECRET=请填随机长串
```

`.env.example` 只放键名与占位符，进仓库没问题；真正的 `.env` 按同样格式写真实值，权限 600，绝不进仓库（见第 9.5 节）。

## 11. 完整配置文件

本节是部署用的全部配置文件，各注明存放路径，复制时把 `example.com` 换成你的真实域名，把用户名与路径换成你自己的，其他内容不要改。

### 11.1 Nginx 站点配置（存放路径：`/etc/nginx/sites-available/node-site`，HTTP 版，配完 HTTPS 后 certbot 会自动改写成 HTTPS 版）

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配完 HTTPS 后，certbot 会在这个文件里加好 443 段并把 80 段改成跳转到 HTTPS，最终形态以 certbot 改写后的文件为准，不要手动把 certbot 的改写再改回去。

### 11.2 systemd 服务单元（存放路径：`/etc/systemd/system/node-site.service`，选 systemd 时用）

```ini
[Unit]
Description=Node.js small site
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/node-site
EnvironmentFile=/srv/node-site/.env
ExecStart=/usr/bin/node /srv/node-site/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`User=deploy` 换成你自己的部署用户名，不要用 root 跑应用（root 跑应用一旦被利用就是整机权限）；`ExecStart` 里的 Node.js 路径以 `which node` 的实际输出为准，NodeSource 装的一般是 `/usr/bin/node`，nvm 装的路径不同，不能照抄。

### 11.3 PM2 生态文件（存放路径：`/srv/node-site/ecosystem.config.js`，选 PM2 时用，与 systemd 二选一）

```js
module.exports = {
  apps: [
    {
      name: 'node-site',
      script: 'server.js',
      cwd: '/srv/node-site',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

PM2 的环境变量也可以从 `.env` 文件读，但本篇的生态文件里直接写了生产环境必需的两项，敏感值仍放 `.env`，不要写进生态文件（生态文件可能进仓库，`.env` 不进）。

## 12. 每个关键配置项的解释

### 12.1 Nginx 配置项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `listen 80` | 监听 HTTP 端口 | 写错端口则浏览器连不上 |
| `server_name example.com www.example.com` | 本站点匹配的域名 | 域名写错则 Nginx 匹配到默认站，返回默认页或 404 |
| `proxy_pass http://127.0.0.1:3000` | 转发到本机 Node.js 应用 | 地址或端口写错则报 502 |
| `proxy_http_version 1.1` | 用 HTTP/1.1 转发，保持长连接 | 不写则默认 1.0，部分场景下 keep-alive 失效 |
| `proxy_set_header Host $host` | 把原始域名透传给应用 | 不写则应用拿到的是 127.0.0.1，分不清是哪个站点 |
| `proxy_set_header X-Real-IP $remote_addr` | 把访客真实 IP 透传给应用 | 不写则应用日志里全是 127.0.0.1，查问题分不清访客 |
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` | 追加转发链 IP | 不写则多层代理后原始 IP 丢失 |
| `proxy_set_header X-Forwarded-Proto $scheme` | 告诉应用原始协议是 http 还是 https | 不写则应用可能误判协议，生成 http 链接导致混合内容告警 |

### 12.2 systemd 服务单元项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| `After=network.target` | 网络就绪后再启动 | 不写则可能在网络没好时启动，监听失败 |
| `User=deploy` | 用部署用户跑应用，不用 root | 用 root 则应用被利用时就是整机权限 |
| `WorkingDirectory=/srv/node-site` | 应用的工作目录 | 写错则相对路径（例如 `public/`）找不到 |
| `EnvironmentFile=/srv/node-site/.env` | 从文件读环境变量 | 路径写错则服务启动失败，日志里报找不到文件 |
| `ExecStart=/usr/bin/node /srv/node-site/server.js` | 启动命令 | Node.js 路径写错则服务起不来 |
| `Restart=on-failure` | 崩溃后自动重启 | 不写则崩溃后服务一直停着，直到有人手动起 |
| `RestartSec=5` | 崩溃后等 5 秒再重启 | 不写则可能瞬间反复重启，把日志刷满 |
| `WantedBy=multi-user.target` | 开机自启的目标 | 不写则 `systemctl enable` 不生效，重启后服务不起来 |

### 12.3 PM2 生态文件项

| 配置项 | 含义 |
| --- | --- |
| `name` | PM2 里显示的应用名，`pm2 list`、`pm2 logs`、`pm2 restart` 都靠它 |
| `script` | 入口文件，相对路径以 `cwd` 为基准 |
| `cwd` | 应用工作目录 |
| `env.NODE_ENV` | 生产模式标记，Express 在生产模式下会关掉详细报错页 |
| `env.PORT` | 应用监听端口，须与 Nginx 的 `proxy_pass` 端口一致 |

端口一致是全篇最容易错的一处：`.env` 里的 PORT、PM2 生态文件里的 PORT、Nginx 的 `proxy_pass` 端口，三处必须同一个数字，改一处就要改三处，最好只改 `.env`，其余两处引用它或固定写死后不再动。

## 13. 执行结果示例

本节全部输出均为“读者在自己服务器上应看到的样子（示例输出）”，不是本机实测输出，实际时间戳、进程号、内存数字以读者本机为准。不要把示例输出里的数字背下来当标准答案。

### 13.1 应用本身跑通的样子（服务器上，`curl http://127.0.0.1:3000/api/health`）

```text
{"status":"ok"}
```

`curl http://127.0.0.1:3000/api/articles` 应返回：

```text
{"total":2,"articles":[{"id":1,"title":"我的第一篇建站笔记","status":"published"},{"id":2,"title":"给新手的索引入门","status":"published"}]}
```

注意 `total` 是 2 不是 3：第三篇是草稿，接口故意不返回草稿（见第 10.1 节），如果你的输出里 `total` 是 3，说明你改动了过滤逻辑，要按第 10.1 节改回去。

### 13.2 Nginx 检查与服务状态的样子

```text
$ sudo nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

```text
$ sudo systemctl status node-site
Active: active (running)
```

```text
$ curl https://example.com/api/health
{"status":"ok"}
```

### 13.3 HTTPS 证书的样子

```text
$ sudo certbot certificates
Certificate Name: example.com
Expiry Date: 2027-02-01
```

证书有效期大于 30 天才算正常，小于 30 天说明自动续期没跑起来，先看第 16 节的续期排查行。

## 14. 成功验证

按下面清单逐项验证，全部通过才算上线完成，任何一项不通过都按第 16 节定位，不要先对外宣传、再慢慢修：

1. 服务器上 `curl http://127.0.0.1:3000/api/health` 返回 `{"status":"ok"}`。
2. 服务器上 `curl http://127.0.0.1:3000/api/articles` 返回 `total` 为 2 的文章列表。
3. 本地浏览器打开 `http://example.com/` 能看到首页与两篇文章标题（把域名换成你自己的）。
4. 本地浏览器打开 `https://example.com/` 能看到同样的首页，地址栏有锁形标志，点开证书能看到你的域名。
5. 本地 `curl -I http://example.com/` 返回 301 跳转到 `https://`（certbot 选了强制跳转时才有这一项，没选则跳过）。
6. 本地 `curl https://example.com/api/articles/1` 返回第一篇文章的 JSON，`curl https://example.com/api/articles/999` 返回 404 的 `NOT_FOUND`。
7. 服务器上 `sudo systemctl status node-site`（或 `pm2 list`，按你选的工具）显示运行中。
8. 服务器上 `sudo nginx -t` 显示成功。
9. 服务器上 `sudo certbot certificates` 显示证书有效期大于 30 天。
10. 重启服务器后（`sudo reboot`，重启前确认你能重新 SSH 登录），等一分钟再打开 `https://example.com/`，首页仍能打开，说明开机自启生效。

第 10 项是新手最容易跳过的一项：不重启验证，开机自启配错了也发现不了，等哪天机房断电重启才发现站起不来，那就晚了。

## 15. 常见错误

| 现象 | 最可能的原因 | 先查哪一步 |
| --- | --- | --- |
| `curl` 回环地址报连接被拒绝 | 应用没起来，或监听端口不是 3000 | `systemctl status node-site`（或 `pm2 list`），再看应用日志 |
| 浏览器报 502 Bad Gateway | Nginx 转发地址或端口写错，或应用崩了 | 先跑第 9.6 节的回环 curl，分清是 Nginx 问题还是应用问题 |
| 浏览器打开是 Nginx 默认页 | `server_name` 写错，或符号链接没建 | `ls -l /etc/nginx/sites-enabled/`，确认链接存在且指向正确文件 |
| 首页能打开，文章列表为空 | 静态文件没问题，API 路由没配或过滤逻辑改错了 | `curl` 直接调 `/api/articles`，看返回的是什么 |
| 新增文章返回 422 | 请求体缺 `title` 或 `content` | 检查 POST 的 JSON 体，两个字段缺一不可 |
| `npm install` 报网络超时 | 服务器出站网络受限或镜像源慢 | 换 npm 镜像源，或检查服务器能否访问 npm 仓库 |
| certbot 申请失败 | 域名解析还没生效，或 80 端口被挡 | 先跑 `dig` 确认解析，再确认 80 端口能从外网访问 |
| 证书快过期还没续 | 自动续期定时任务没装好，或 80 端口被挡 | `systemctl list-timers` 查 certbot 定时任务，手动跑一次 `certbot renew --dry-run` |

## 16. 故障排查

按请求链路从外到内查，不要一上来就改配置：

1. **域名层**：本地跑 `dig example.com A`，返回的不是服务器公网 IP，说明解析没生效或 TTL 还没过期，等 TTL 过期再查，不要改 Nginx。
2. **端口层**：本地跑 `curl -v http://example.com/`，连不上先确认服务器 80、443 端口在安全组与本机防火墙都放行了。
3. **Nginx 层**：服务器上跑 `sudo nginx -t`，语法失败就按报错行号改配置，改完再 `nginx -t`，通过了才 `reload`。
4. **应用层**：服务器上跑回环 curl（第 9.6 节），通了说明应用没问题，问题在 Nginx；不通说明应用没起来，看 `journalctl -u node-site`（systemd）或 `pm2 logs node-site`（PM2）的日志。
5. **进程管理层**：应用能手动跑、服务方式跑不起来，八成是 `User`、`WorkingDirectory`、`EnvironmentFile`、`ExecStart` 四项里有一项写错，按第 12.2 节逐项核对。
6. **证书层**：HTTPS 打不开但 HTTP 能打开，先看 `certbot certificates` 的有效期与域名，再看 Nginx 的 443 段是不是 certbot 改写后的版本，有没有被手动改坏。
7. **重启后起不来**：`systemctl is-enabled node-site` 显示 disabled 说明开机自启没启用，重新跑 `systemctl enable node-site`；PM2 则检查 `pm2 startup` 与 `pm2 save` 是否都做过。

日志命令要记牢：systemd 看 `sudo journalctl -u node-site -n 100`，PM2 看 `pm2 logs node-site`，Nginx 看 `/var/log/nginx/error.log`，三处日志不要混着看，报错在哪一层就看哪一层的日志。

## 17. 安全注意事项

1. 口令与密钥只放 `.env`，权限 600，绝不进仓库、绝不贴进聊天记录或工单；`.env.example` 里只放键名与占位符。
2. 应用不要用 root 跑，systemd 的 `User` 写部署用户，PM2 也用部署用户启动，不要用 root 跑 `pm2 start`。
3. 应用只绑回环地址 `127.0.0.1`，不要改成 `0.0.0.0` 对公网监听，公网流量必须先过 Nginx。
4. 服务器防火墙只放行 22、80、443，其他端口不要对外开；数据库端口、应用端口（3000）一律不对公网开。
5. 依赖要定期更新：`npm audit` 看到高危漏洞先评估影响再升级，升级后按第 14 节重测一遍，不要直接在生产上升级不测试。
6. Nginx 的安全响应头与限流按 OPS-02 配，不要只配反向代理就上线；上传、登录类接口的限流尤其不要漏。
7. 证书私钥在 `/etc/letsencrypt/` 里，不要复制出来、不要提交到仓库，续期交给 certbot，不要手动改证书文件。
8. 服务器系统与 Node.js 要定期打补丁，补丁后按第 14 节重测一遍，确认服务仍能起来再离开。

## 18. 回滚和恢复

回滚分两层，不要混着做：

**应用回滚（改错代码、部署后发现异常时）**：

```bash
cd /srv/node-site
git log --oneline -5
git checkout 上一版的提交号
npm install --omit=dev
sudo systemctl restart node-site
curl http://127.0.0.1:3000/api/health
```

上面命令里的“上一版的提交号”换成 `git log` 里看到的真实提交号，不要照抄文字去跑。回滚后先跑回环 curl，通了再对外确认，不要回滚完不验证就走。

**Nginx 配置回滚（改坏配置、重载失败时）**：改配置前先备份：

```bash
sudo cp /etc/nginx/sites-available/node-site /etc/nginx/sites-available/node-site.bak
```

改坏了就拷回去再重载：

```bash
sudo cp /etc/nginx/sites-available/node-site.bak /etc/nginx/sites-available/node-site
sudo nginx -t
sudo systemctl reload nginx
```

**恢复（服务器整机不可用时）**：按 OPS-04 的整站恢复计划走——新服务器上重装 Nginx 与 Node.js、拉取代码、恢复 `.env`（`.env` 不在仓库里，恢复时从你自己的备份里拿，不要指望仓库里有）、恢复证书（新服务器上重新申请即可，旧证书不用拷），最后按第 14 节逐项验证。`.env` 的备份是整站备份清单里最容易漏的一项，备份时先核对清单，再谈恢复。

## 19. 延伸阅读

- Node.js 框架的完整讲法（Express、NestJS、Fastify 的选型与写法）：BE-03。
- PM2 与 systemd 的原理、进程模式、资源限制：SRV-02。
- 代码从本地送上服务器的方法（GitHub Actions 自动部署、部署密钥、符号链接切换）：DEPLOY-01。
- HTTPS、CDN、域名解析上线全流程：DEPLOY-03。
- 上线后的监控、日志、告警：OPS-03。
- 整站备份与灾难恢复：OPS-04。
- 数据库接法与表设计：DB-01。

## 20. 相关章节链接

- Node.js 框架：[BE-03 Node.js 框架：Express、NestJS、Fastify](../backend/03-nodejs.md)。
- 运行环境与进程管理：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)。
- 自动部署：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](../deploy/01-cicd.md)。
- 上线全流程：[DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 上一篇：PROJ-03（本批并行，链接由父级统一补）。
- 下一篇：[PROJ-05 PHP 网站、Go API 服务从零部署](05-php-go.md)
