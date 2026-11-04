# PROJ-03：Python 网站（Flask/Django）从零部署完整教程

> 任务编号：PROJ-03（网站建设与部署实战指南 · 完整实战第 3 篇）
> 上一篇：[PROJ-02 WordPress 企业网站 / 博客从零部署](02-wordpress.md)；下一篇：[PROJ-04 Node.js 网站从零部署](04-nodejs.md)。
> 本篇只讲一个 Python 小站从零到上线的完整实战：域名解析、服务器准备、虚拟环境、依赖安装、gunicorn + systemd + Nginx、数据库、静态文件、HTTPS、上线检查。框架基础引用 BE-02，不重讲框架语法；部署概念引用 DEPLOY-01，不重讲 CI；进程管理引用 SRV-02，不重讲 systemd 的全部细节。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 在一台 Ubuntu 服务器上，从零把一个 Flask 小站部署上线，访客用域名就能打开；
2. 说清一次请求从浏览器到 Nginx、再到 gunicorn、再到 Flask 应用、再回来的完整链路；
3. 写出 gunicorn 配置、systemd 服务单元、Nginx 配置这三份上线必备文件，并知道每一项是干什么的；
4. 完成数据库初始化、静态文件、HTTPS、上线检查这四件上线前的事，不留“先跑起来再说”的尾巴；
5. 在新版本出问题时，按第 18 节把站点指回上一版，而不是在服务器上现改代码救火；
6. 说清 Flask 路线与 Django 路线的区别点（第 10.5 节），知道换成 Django 时要改哪几处。

## 2. 适用人群

- 已经读过 BE-02，知道 Flask 或 Django 是什么、能在本地跑起一个最小应用的人；
- 有一台能 SSH 登录的 Ubuntu 服务器、一个自己能改解析的域名，想把本地小站真正上线的人；
- 不适合完全没写过 Python 的人：先按 BE-02 在本地跑通第一个项目，再回来看本篇；
- 不适合只想在本地学习、不想碰服务器的人：本篇的每一步都默认目标是一台远程 Ubuntu 服务器。

## 3. 适用系统和版本

- 操作系统：Ubuntu 24.04 LTS（本篇的全部命令以它为准），Ubuntu 22.04 LTS 也能用，apt 包名以 24.04 为准；
- Python：Ubuntu 24.04 自带 Python 3.12，本篇用它，不另装 Python；
- 框架版本（核查日期 2026-11-03，来源为 BE-02 已核实的结果，安装时以官网当场公布的版本为准）：Flask 3.1.3，Django 6.1.2（长期支持线另有 5.2.18，求稳、不想半年一升的项目可以选 5.2 LTS）；
- 运行层：gunicorn（WSGI 服务器）、systemd（进程管理）、Nginx（反向代理与静态文件）；
- 数据库：本篇起步用 SQLite（Python 自带 sqlite3 模块，不用另装数据库），第 7.4 节讲清什么时候必须换成 PostgreSQL；
- 域名与证书：域名解析在注册商或 DNS 服务商处改，证书用 certbot 申请，证书签发细节引用 09-web-hosting 的 HTTPS 章节，本篇只讲部署侧的衔接。

## 4. 使用前提

- 一台 Ubuntu 24.04 服务器，能用 SSH 登录，有 sudo 权限；
- 一个域名，你能在 DNS 处给它加 A 记录；
- 本地机器上有 SSH 客户端，能用密钥登录服务器（口令登录能用，但本篇要求按 DEPLOY-01 的做法改成密钥登录）；
- 会用 Python 虚拟环境、pip、systemctl、nginx -t 这几个基本命令，不会在第一条报错时就卡住；
- 已经读过 BE-02（Flask 或 Django 任选其一的基础）、SRV-02（systemd 与进程管理）、DEPLOY-01（部署密钥与发布流程）。

## 5. 所需资源

| 资源 | 说明 | 备注 |
| --- | --- | --- |
| Ubuntu 服务器 1 台 | 1 核 2GB 内存起步，本篇的小站够用 | 内存低于 1GB 时 gunicorn 工人数要按第 12 节的算式往下调 |
| 域名 1 个 | 本篇示例用 example.com，读者换成自己的域名 | 示例域名一律用保留域名，不要照抄成真实域名 |
| SSH 密钥 1 对 | 只把公钥放服务器，私钥只留在自己机器上 | 私钥绝不进仓库、绝不贴进聊天记录或工单 |
| 开放端口 | 22（SSH）、80（HTTP）、443（HTTPS） | 80 在申请证书前必须放行，证书申请要走 80 验证 |
| 磁盘空间 | 代码加虚拟环境加数据库，预留 2GB 以上 | 日志与备份另算，不要把磁盘用满 |

## 6. 技术原理

### 6.1 一次请求的完整链路

访客在浏览器输入域名后，链路是下面这 7 步，顺序不能乱：

1. 浏览器查 DNS，拿到服务器 IP；
2. 浏览器连服务器的 443 端口（HTTPS），Nginx 终止 TLS；
3. Nginx 看请求路径：以 `/static/` 开头的，直接读磁盘上的静态文件返回，不进应用；
4. 其他路径，Nginx 把请求转发给 Unix 套接字，gunicorn 在套接字另一头等着；
5. gunicorn 把请求交给 Flask 应用，应用查 SQLite、渲染模板；
6. 应用把响应交回 gunicorn，gunicorn 交回 Nginx；
7. Nginx 把响应发给浏览器。

### 6.2 为什么是 Nginx + gunicorn + Flask 三层

| 层 | 负责的事 | 不负责的事 |
| --- | --- | --- |
| Nginx | 终止 TLS、 serve 静态文件、反向代理、限流与安全头 | 不跑 Python 代码 |
| gunicorn | 跑 Python 应用、管理多个工作进程、接 Unix 套接字 | 不直接面对公网、不处理 TLS |
| Flask 应用 | 路由、模板、数据库查询、业务逻辑 | 不监听公网端口、不处理静态文件缓存策略 |

单层也能跑起来，但三层分工后，每一层出问题都有明确的查法：第 16 节的排查表就是按这三层分的。

### 6.3 静态文件为什么不走 Flask

Flask 自带的开发服务器能 serve 静态文件，但它是一次只处理一个请求、没有缓存策略的生产外用法。上线后，静态文件（CSS、图片、JS）全部由 Nginx 直接读磁盘返回，应用只处理动态请求。这样做的好处是：静态请求不占 gunicorn 的工作进程，应用进程只用来算动态页面。

### 6.4 数据库为什么起步用 SQLite

SQLite 的好处是零安装、零配置、一个文件就是整个库，适合本篇这种“先上线、再长大”的小站。它的边界也要讲清：同一时刻只能有一个写事务，写并发一上来就会报 database is locked；多台服务器、读写分离、几十万行以上的写入压力，都超出 SQLite 的适用范围，到了那一步按第 7.4 节换成 PostgreSQL。

## 7. 架构说明

### 7.1 单服务器拓扑

本篇只用一台服务器，拓扑如下表：

| 组件 | 位置 | 对外端口 |
| --- | --- | --- |
| Nginx | 服务器前门 | 80、443 |
| gunicorn | 服务器内部，只绑 Unix 套接字 | 不对外 |
| Flask 应用 | gunicorn 拉起的工作进程里 | 不对外 |
| SQLite | `/var/www/mysite/data/site.db` 一个文件 | 不对外 |
| 静态文件 | `/var/www/mysite/static/` | 经 Nginx 对外 |

### 7.2 目录结构

服务器上的完整目录结构如下，路径在第 11 节的配置里全部对应得上：

```text
/var/www/mysite/
├── app.py
├── wsgi.py
├── requirements.txt
├── gunicorn.conf.py
├── templates/
│   ├── index.html
│   └── article.html
├── static/
│   └── style.css
└── data/
    └── site.db
```

### 7.3 进程与权限

- 代码属主：部署用户（本篇用 `mysite` 这个专用用户举例，读者换成自己的部署用户名）；
- gunicorn 与应用进程：以 `mysite` 用户运行，不以 root 运行；
- Nginx 主进程：root 启动，工作进程以 `www-data` 运行，这是 Nginx 的默认做法；
- Unix 套接字：`/run/mysite.sock`，属主 `mysite`，属组 `www-data`，让 Nginx 工作进程能读到它；
- 数据库文件：属主 `mysite`，所在目录 `data/` 必须可写，否则应用一写就报错。

### 7.4 什么时候换成 PostgreSQL

出现下面任意一条，就不要再守着 SQLite：

1. 写并发经常报 database is locked；
2. 要上第二台应用服务器；
3. 要做读写分离或主从复制；
4. 数据量与写入量已经让单文件备份与恢复变得吃力。

换库的步骤在数据库篇 DB-01 与 DB-02 里讲，本篇不展开：建库建用户、改连接串、导数据、改 systemd 的 EnvironmentFile、重启验证。换库前必须先按第 18 节备份 SQLite 文件。

## 8. 操作前检查

动手前逐项打勾，缺一项就先补齐，不要边做边补：

1. SSH 能用密钥登录服务器，`ssh mysite@203.0.113.10` 能进；
2. 服务器上 `python3 --version` 输出 3.12，`nginx -v` 有输出；
3. 域名 A 记录已指向服务器 IP，`dig example.com A` 能看到 203.0.113.10（文档示例保留地址，读者换成自己的服务器 IP）；
4. 服务器防火墙放行 22、80、443；
5. 服务器剩余磁盘大于 2GB，`df -h /` 能看到；
6. 本地已有一份能跑通的 Flask 最小应用（BE-02 第 9 节的做法），不要拿一个本地都没跑过的应用直接上服务器；
7. 已准备好一个随机长串当 SECRET_KEY，写进服务器的 `.env` 文件，不写进代码仓库。

## 9. 逐步操作

下面 12 步按顺序做，跳步的后果写在每一步后面。命令默认在服务器上执行，目录与用户在每条命令前注明。

### 步骤 1：域名解析

在 DNS 处给域名加一条 A 记录：主机记录填 `@`，记录值填服务器 IP，TTL 先填 600（上线稳定后再改大）。验证命令：

```bash
dig example.com A +short
```

看到服务器 IP 才算解析生效，TTL 没过期的旧结果不算数。

### 步骤 2：服务器准备

以 sudo 用户登录服务器，安装 Nginx 与 Python 虚拟环境工具：

```bash
sudo apt update
sudo apt install -y nginx python3-venv python3-pip
```

### 步骤 3：建部署用户与目录

```bash
sudo useradd -m -s /bin/bash mysite
sudo mkdir -p /var/www/mysite
sudo chown mysite:mysite /var/www/mysite
```

### 步骤 4：传代码上服务器

按 DEPLOY-01 的做法传代码：本地提交到 GitHub，服务器上用部署密钥拉取；或者先用 scp 传一份起步。传完后目录属主仍是 `mysite`，不要用 root 传完就不改属主。

### 步骤 5：建虚拟环境并装依赖

以 `mysite` 用户执行，目录是 `/var/www/mysite`：

```bash
cd /var/www/mysite
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 步骤 6：写 .env 并初始化数据库

以 `mysite` 用户执行，`.env` 文件权限 600，内容见第 11.4 节。初始化数据库：

```bash
cd /var/www/mysite
./venv/bin/python -c "from app import init_db; init_db()"
```

### 步骤 7：先用 gunicorn 手动跑一次

以 `mysite` 用户执行，目录是 `/var/www/mysite`，先不走 systemd，确认应用本身能起来：

```bash
cd /var/www/mysite
./venv/bin/gunicorn -c gunicorn.conf.py wsgi:app
```

另开一个 SSH 会话，用 `curl http://127.0.0.1:8000/health` 能拿到健康检查响应，再按 Ctrl+C 停掉手动进程，走下一步交给 systemd 管。

### 步骤 8：写 systemd 单元并启动

配置文件见第 11.2 节，存放路径是 `/etc/systemd/system/mysite.service`。写完后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable mysite
sudo systemctl start mysite
sudo systemctl status mysite
```

`status` 里看到 active (running) 才算启动成功。

### 步骤 9：写 Nginx 配置并验证

配置文件见第 11.3 节，存放路径是 `/etc/nginx/sites-available/mysite`，启用后执行：

```bash
sudo ln -s /etc/nginx/sites-available/mysite /etc/nginx/sites-enabled/mysite
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` 输出 successful 才 reload，测试不通过就不要 reload。

### 步骤 10：静态文件与数据库权限复查

```bash
ls -l /var/www/mysite/static/style.css
ls -l /var/www/mysite/data/site.db
curl -I http://127.0.0.1/static/style.css
```

静态文件要能经 Nginx 返回 200，数据库文件属主是 `mysite` 且所在目录可写。

### 步骤 11：申请 HTTPS 证书

80 端口已通、域名已解析到服务器后，用 certbot 申请证书并让它改 Nginx 配置，或者按第 11.3 节手工写好 443 配置后用 certbot 只申请证书。申请完后用浏览器打开 `https://example.com`，锁图标正常才算完成。

### 步骤 12：上线检查

按第 14 节的清单逐项验证：首页、文章页、健康端点、静态文件、HTTPS、日志、重启后自启，全部通过才算上线完成，缺一项就按第 16 节排查。

## 10. 完整代码

本节是 Flask 路线的完整实战，文件注明存放路径，复制下来就能用。Django 路线见第 10.5 节。

### 10.1 应用主文件 app.py

存放路径：`/var/www/mysite/app.py`。

```python
import os
import sqlite3
from flask import Flask, abort, g, jsonify, render_template

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "请填随机长串")
app.config["DATABASE"] = os.environ.get(
    "DATABASE_PATH", "/var/www/mysite/data/site.db"
)

ARTICLES = [
    {
        "id": 1,
        "title": "我的第一篇建站笔记",
        "body": "这是本站的第一篇文章，讲的是从零部署一个 Python 小站的完整过程。",
    },
    {
        "id": 2,
        "title": "给新手的索引入门",
        "body": "索引能让等值查询变快，但救不了前导通配符查询，建索引前先看执行计划。",
    },
]


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db_path = app.config["DATABASE"]
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = sqlite3.connect(db_path)
    db.execute(
        "CREATE TABLE IF NOT EXISTS articles "
        "(id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL)"
    )
    for article in ARTICLES:
        db.execute(
            "INSERT OR IGNORE INTO articles (id, title, body) VALUES (?, ?, ?)",
            (article["id"], article["title"], article["body"]),
        )
    db.commit()
    db.close()


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/")
def index():
    db = get_db()
    rows = db.execute("SELECT id, title FROM articles ORDER BY id").fetchall()
    articles = [{"id": row["id"], "title": row["title"]} for row in rows]
    return render_template("index.html", articles=articles)


@app.route("/articles/<int:article_id>")
def article_detail(article_id):
    db = get_db()
    row = db.execute(
        "SELECT id, title, body FROM articles WHERE id = ?", (article_id,)
    ).fetchone()
    if row is None:
        abort(404)
    article = {"id": row["id"], "title": row["title"], "body": row["body"]}
    return render_template("article.html", article=article)


@app.route("/api/articles")
def api_articles():
    db = get_db()
    rows = db.execute("SELECT id, title FROM articles ORDER BY id").fetchall()
    articles = [{"id": row["id"], "title": row["title"]} for row in rows]
    return jsonify({"total": len(articles), "articles": articles})


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=8000)
```

### 10.2 入口文件 wsgi.py

存放路径：`/var/www/mysite/wsgi.py`。gunicorn 启动时用的就是 `wsgi:app` 这个入口，不要直接拿 `app.py` 当入口。

```python
from app import app

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000)
```

### 10.3 依赖文件 requirements.txt

存放路径：`/var/www/mysite/requirements.txt`。安装时以官网当场公布的版本为准，`pip install -r requirements.txt` 会按这里写的范围装。

```text
Flask==3.1.3
gunicorn==23.0.0
```

### 10.4 模板文件

首页模板，存放路径：`/var/www/mysite/templates/index.html`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我的小站</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header>
<h1>我的小站</h1>
</header>
<main>
<ul>
{% for article in articles %}
<li><a href="/articles/{{ article.id }}">{{ article.title }}</a></li>
{% endfor %}
</ul>
</main>
<footer>
<p>本站由 Flask + gunicorn + Nginx 部署。</p>
</footer>
</body>
</html>
```

文章页模板，存放路径：`/var/www/mysite/templates/article.html`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ article.title }} - 我的小站</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header>
<p><a href="/">返回首页</a></p>
<h1>{{ article.title }}</h1>
</header>
<main>
<p>{{ article.body }}</p>
</main>
<footer>
<p>本站由 Flask + gunicorn + Nginx 部署。</p>
</footer>
</body>
</html>
```

静态样式文件，存放路径：`/var/www/mysite/static/style.css`。

```css
body {
  font-family: system-ui, sans-serif;
  line-height: 1.7;
  margin: 0 auto;
  max-width: 720px;
  padding: 24px;
  color: #222222;
}

header {
  border-bottom: 1px solid #dddddd;
  margin-bottom: 24px;
}

footer {
  border-top: 1px solid #dddddd;
  margin-top: 24px;
  color: #666666;
}

a {
  color: #1a5fb4;
}
```

### 10.5 Django 路线的区别点

换成 Django 时，应用代码按 BE-02 的 Django 小节写，本篇的部署部分只有下面几处要改，其他步骤不变：

| 要改的地方 | Flask 路线 | Django 路线 |
| --- | --- | --- |
| 入口模块 | `wsgi:app` | `mysite.wsgi:application`，mysite 是项目名 |
| 依赖 | Flask、gunicorn | Django、gunicorn |
| 数据库初始化 | `init_db()` 建表插数据 | `python manage.py migrate` 跑迁移 |
| 静态文件 | Nginx 直接读 `static/` | 先跑 `python manage.py collectstatic`，再让 Nginx 读收集目录 |
| 配置文件 | `.env` 里放 SECRET_KEY | `settings.py` 里从环境变量读 SECRET_KEY，`DEBUG` 必须关 |
| 管理后台 | 本篇没有 | Django 自带 admin，第一次部署要建超级用户 |

Django 的 `settings.py` 里必须改的四行如下，写全，不留省略：

```python
import os

SECRET_KEY = os.environ.get("SECRET_KEY", "请填随机长串")
DEBUG = False
ALLOWED_HOSTS = ["example.com", "www.example.com"]
STATIC_ROOT = "/var/www/mysite/staticfiles"
```

## 11. 完整配置文件

### 11.1 gunicorn 配置 gunicorn.conf.py

存放路径：`/var/www/mysite/gunicorn.conf.py`。

```python
bind = "unix:/run/mysite.sock"
workers = 3
worker_class = "sync"
timeout = 30
keepalive = 5
accesslog = "/var/log/mysite/access.log"
errorlog = "/var/log/mysite/error.log"
loglevel = "info"
```

### 11.2 systemd 服务单元 mysite.service

存放路径：`/etc/systemd/system/mysite.service`。

```ini
[Unit]
Description=My Python website
After=network.target

[Service]
User=mysite
Group=mysite
WorkingDirectory=/var/www/mysite
EnvironmentFile=/var/www/mysite/.env
ExecStart=/var/www/mysite/venv/bin/gunicorn -c /var/www/mysite/gunicorn.conf.py wsgi:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 11.3 Nginx 配置 mysite

存放路径：`/etc/nginx/sites-available/mysite`。80 端口块只做跳转，443 端口块是正式服务块，证书路径在申请完证书后填真实路径。

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com www.example.com;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /static/ {
        alias /var/www/mysite/static/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://unix:/run/mysite.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 11.4 环境变量文件 .env

存放路径：`/var/www/mysite/.env`，权限 600，属主 `mysite`，绝不提交到仓库。

```ini
SECRET_KEY=请填随机长串
DATABASE_PATH=/var/www/mysite/data/site.db
```

## 12. 每个关键配置项的解释

### 12.1 gunicorn 配置项

| 配置项 | 取值 | 含义与写错后果 |
| --- | --- | --- |
| bind | unix:/run/mysite.sock | 只绑 Unix 套接字，不绑公网端口；写成 0.0.0.0:8000 会让应用直接暴露在公网 |
| workers | 3 | 工作进程数，起步按“2 × CPU 核数 + 1”算，1 核机器写 3；写太大，内存先被吃光 |
| worker_class | sync | 同步工作进程，适合本篇这种短请求小站；长连接多时再换别的类型 |
| timeout | 30 | 单个请求超过 30 秒，工作进程会被杀掉重启；写太小，慢查询一律超时 |
| accesslog / errorlog | /var/log/mysite/ 下的两个文件 | 访问日志与错误日志的落盘位置，目录要先建好并让 mysite 用户可写 |
| loglevel | info | 日志级别，info 能看到请求与错误，调成 debug 会把日志打爆 |

### 12.2 systemd 配置项

| 配置项 | 含义与写错后果 |
| --- | --- |
| After=network.target | 网络起来后再启动服务；不写它，开机自启时可能因网络未就绪而失败 |
| User / Group | 以 mysite 用户运行，不以 root 运行；写成 root，应用漏洞的危害会放大 |
| WorkingDirectory | 应用所在目录，相对路径与模板查找都以它为准 |
| EnvironmentFile | .env 的路径，SECRET_KEY 与数据库路径从这里读，不写进单元文件 |
| ExecStart | 必须写绝对路径，venv 里的 gunicorn 全路径加配置文件全路径 |
| Restart=always | 进程崩了自动重启；不写它，崩一次就停在那里等人工发现 |
| WantedBy=multi-user.target | 配上 systemctl enable，开机自启才生效 |

### 12.3 Nginx 配置项

| 配置项 | 含义与写错后果 |
| --- | --- |
| return 301 https://$host$request_uri | 80 端口只做跳转，不 serve 内容；不写它，HTTP 与 HTTPS 会各跑一套 |
| ssl_protocols TLSv1.2 TLSv1.3 | 只开 1.2 与 1.3，关掉老旧协议；不写它，默认可能放行更老的协议 |
| location /static/ + alias | 静态文件直接读磁盘，alias 后面的斜杠必须与 location 的斜杠对应，少一个斜杠路径就错 |
| expires 7d + Cache-Control public | 静态文件缓存 7 天，改了静态文件要换文件名或等缓存过期 |
| proxy_pass http://unix:/run/mysite.sock | 转发给 gunicorn 的套接字，路径必须与 gunicorn.conf.py 里的 bind 一致 |
| X-Forwarded-Proto $scheme | 告诉应用原始协议是 https，应用拼绝对地址时才不会拼成 http |

## 13. 执行结果示例

本节的全部输出都是“读者在自己服务器上应看到的样子（示例输出）”，不是本机实测输出。没有在本机对真实服务器做上线，实际时间、进程号、路径以读者本机为准。

### 13.1 健康检查与页面

```text
$ curl http://127.0.0.1:8000/health
{"status": "ok"}

$ curl http://127.0.0.1:8000/api/articles
{"total": 2, "articles": [{"id": 1, "title": "我的第一篇建站笔记"}, {"id": 2, "title": "给新手的索引入门"}]}
```

### 13.2 服务状态

```text
$ sudo systemctl status mysite
mysite.service - My Python website
Active: active (running)
Main PID: 12345 (gunicorn)
```

### 13.3 Nginx 测试与静态文件

```text
$ sudo nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful

$ curl -I https://example.com/static/style.css
HTTP/2 200
content-type: text/css
cache-control: public
```

### 13.4 日志样子

```text
$ sudo journalctl -u mysite -n 5
mysite.service: Started My Python website.
Listening at: unix:/run/mysite.sock
Booting worker with pid: 12346
Booting worker with pid: 12347
Booting worker with pid: 12348
```

## 14. 成功验证

按顺序做完下面 10 步，全部通过才算上线完成：

1. `sudo systemctl status mysite` 显示 active (running)；
2. `curl http://127.0.0.1:8000/health` 返回 `{"status": "ok"}`；
3. 浏览器打开 `https://example.com`，首页列出两篇文章；
4. 点进任意一篇文章，文章页标题与正文都对；
5. `curl https://example.com/api/articles` 返回两篇文章的 JSON；
6. `curl -I https://example.com/static/style.css` 返回 200 且带缓存头；
7. 浏览器地址栏锁图标正常，点开证书，域名与有效期都对；
8. `sudo journalctl -u mysite -n 20` 里没有报错，只有启动与请求记录；
9. 重启服务器后，`systemctl status mysite` 仍是 active，且首页仍能打开；
10. 用手机浏览器再打开一次首页，排版没有乱。

## 15. 常见错误

| 现象 | 最可能的原因 | 先查什么 |
| --- | --- | --- |
| 浏览器显示 502 Bad Gateway | gunicorn 没起来，或套接字路径与 Nginx 配置不一致 | `systemctl status mysite` 与 `journalctl -u mysite`，再核对两处套接字路径 |
| 静态文件 404 | alias 路径斜杠不对，或文件属主不对 | `ls -l` 看文件路径与权限，再核对 alias 行 |
| 静态文件 403 | Nginx 工作进程读不到文件 | 文件与目录的读权限，目录要一路可执行 |
| 应用一写数据库就报错 | data 目录不可写，或数据库文件属主是 root | `ls -ld` 看 data 目录属主与权限 |
| database is locked | SQLite 写并发冲突 | 先看是不是两个进程同时写，再按第 7.4 节评估换 PostgreSQL |
| SECRET_KEY 报错或会话失效 | .env 没加载，或 EnvironmentFile 路径写错 | `systemctl cat mysite` 看 EnvironmentFile 行，再看 .env 权限是不是 600 |
| 重启后服务没起来 | 没做 systemctl enable | `systemctl is-enabled mysite`，不是 enabled 就补 enable |
| 证书申请失败 | 域名没解析到服务器，或 80 端口没放行 | `dig example.com A` 与防火墙规则，证书申请要走 80 验证 |
| 改了代码没生效 | 只改了代码，没重启服务 | gunicorn 不热加载代码，改完必须 `systemctl restart mysite` |
| DEBUG 开着上了线 | Django 的 DEBUG 没关，或 Flask 的 debug 模式没关 | 生产配置里 DEBUG 必须是关，见第 17 节 |

## 16. 故障排查

按“先分层、再看日志”的顺序查，不要上来就改配置：

1. 先分层：浏览器报错先看是 Nginx 层（502、404、403）还是应用层（500、模板报错、数据库报错）；
2. Nginx 层：`sudo nginx -t` 测配置，`sudo tail -n 50 /var/log/nginx/error.log` 看错误日志；
3. 应用层：`sudo journalctl -u mysite -n 100` 看服务日志，`sudo tail -n 50 /var/log/mysite/error.log` 看 gunicorn 错误日志；
4. 套接字层：`ls -l /run/mysite.sock` 看套接字在不在、属主属组对不对；
5. 权限层：`ls -ld /var/www/mysite /var/www/mysite/data` 看目录属主与可写权限；
6. 进程层：`ps aux | grep gunicorn` 看工作进程在不在，进程数与 workers 配置对不对得上；
7. 网络层：`ss -tlnp | grep 443` 看 Nginx 是不是在监听 443，`curl -v https://example.com` 看 TLS 握手卡在哪一步；
8. 改完配置后的固定顺序：先 `nginx -t`，再 `systemctl reload nginx`；改了应用代码，先 `systemctl restart mysite`，再看日志。

## 17. 安全注意事项

1. SECRET_KEY 只放服务器的 `.env` 文件，权限 600，绝不进仓库、绝不贴进聊天记录或工单；
2. Flask 的 debug 模式与 Django 的 DEBUG 在生产必须关，报错页面绝不能把堆栈与环境变量露给访客；
3. 应用进程以 `mysite` 用户运行，不以 root 运行；
4. 数据库文件与 `.env` 文件不放在 Nginx 的静态目录里，访客用 URL 猜路径也下载不到；
5. 只放行 22、80、443 三个端口，数据库端口绝不对外；
6. 依赖要定期升级，Flask、Django、gunicorn 出安全修复时按 DEPLOY-01 的流程发一版，不要拖着旧版本跑；
7. 上传功能如果以后要加，文件名必须重命名、类型必须白名单、存放目录必须禁止执行脚本，本篇的小站没有上传功能，不要顺手加一个没做校验的上传接口；
8. 日志里不要打密码、Token、密钥，`journalctl` 与日志文件都要按这个标准检查一遍。

## 18. 回滚和恢复

### 18.1 发布前必须做的备份

每次发布前做下面三件备份，缺一件就不要发布：

1. 代码备份：把当前 `/var/www/mysite` 整个目录打一份带时间戳的包，存在服务器之外或另一个目录；
2. 数据库备份：把 `/var/www/mysite/data/site.db` 复制一份带时间戳的文件；
3. 配置备份：把 `mysite.service` 与 Nginx 站点配置各复制一份。

### 18.2 回滚步骤

新版本出问题时，按顺序做，不要在服务器上现改代码救火：

1. 停掉当前服务：`sudo systemctl stop mysite`；
2. 把代码目录指回上一版的备份（覆盖或换软链，二选一，全站统一一种做法）；
3. 数据库如果做了破坏性改动（删字段、改类型），先恢复第 18.1 节备份的数据库文件，再启动服务；
4. 启动服务：`sudo systemctl start mysite`；
5. 按第 14 节的前 6 步验证，首页、文章页、健康端点、静态文件都通过才算回滚完成；
6. 回滚完成后，把出问题的版本记下来，修好后再按正常流程发布，不要把回滚当成发布。

### 18.3 恢复演练

每季度至少做一次恢复演练：在一台测试服务器上，用备份的代码与数据库文件按第 9 节重走一遍，验证首页能打开。没演练过的备份等于没有备份，这条红线在 OPS-04 里也讲过。

## 19. 延伸阅读

- Python 框架本身的写法（路由、模型、API、页面）：[BE-02 Python 框架：Django、Flask、FastAPI](../backend/02-python.md)，本篇不重讲框架语法；
- systemd 与进程管理的全部细节（重启策略、资源限制、日志）：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)；
- 代码怎么从本地可靠地送上服务器（部署密钥、自动部署、失败回滚）：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](../deploy/01-cicd.md)；
- 本指南的总计划、任务索引、路线图：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。

## 20. 相关章节链接

- Python 框架：[BE-02 Python 框架：Django、Flask、FastAPI](../backend/02-python.md)
- 服务器运行环境：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- 部署流程：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](../deploy/01-cicd.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：PROJ-02 WordPress 企业网站 / 博客从零部署（本批并行，链接由父级统一补）
- 下一篇：[PROJ-04 Node.js 网站从零部署](04-nodejs.md)
