# BE-02：Python 框架完整教程

> 任务编号：BE-02（网站建设与部署实战指南 · 后端第 2 篇）
> 上一篇：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](./01-php.md)；下一篇：[BE-03 Node.js 框架：Express、NestJS、Fastify](./03-nodejs.md)。
> 本篇只讲三个 Python 框架：Django、Flask、FastAPI，各框架独立小节。不讲 PHP、Node.js、Go、Java 框架（那是 BE-01、BE-03 至 BE-05 的范围），不讲前端框架的具体用法。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清 Django、Flask、FastAPI 各自是什么、适合做什么、不适合做什么；
2. 在一台 Ubuntu 服务器上，用虚拟环境装好其中任意一个框架，并跑起第一个项目；
3. 用每个框架写出路由、数据库模型、API、页面这四类基本代码；
4. 给自己的网站在三个框架之间做一次有依据的选择，而不是凭印象选；
5. 把一个框架做的小应用按第 11 节的配置部署到 Ubuntu 上，并知道怎么回滚。

框架模板的 20 项在本篇的落点：介绍与原理在第 6 节，同类对比在第 7 节末尾的选型对照表，环境准备在第 4、8 节，安装与创建第一个项目在第 9 节，目录结构在第 9、10 节，配置逐项在第 12 节，核心语法与 API、常用组件、页面编写、路由、数据与状态、API 连接在第 10 节，错误处理在第 15、16 节，性能与安全在第 17 节，构建发布与 Ubuntu 部署在第 11、14 节，完整实战在第 10 节，常见问题在第 15、16 节。

## 2. 适用人群

- 会写一点 Python，能跑通 `python3` 命令和 `pip` 命令，想用 Python 做网站后端的人；
- 已经按 ARCH-03 的决策树走到“管理后台”或“高并发 API”落点，想对照着选一个 Python 框架的人；
- 不适合完全没接触过 Python 命令行的人：先补 Python 基础，再回来看本篇。

## 3. 适用系统和版本

- 操作系统：Ubuntu 24.04 LTS（自带 Python 3.12），Ubuntu 22.04 LTS 也能用，文中的 `apt` 命令以 Ubuntu 24.04 为准；Windows 与 macOS 只适合本地学习，部署步骤以 Ubuntu 为准。
- Python：建议 Python 3.12 或 3.13。Django 6.1 要求 Python 3.12 至 3.14，Flask 3.1 要求 Python 3.9 及以上，FastAPI 0.162.0 要求 Python 3.10 及以上，安装时以各框架发布说明为准。
- 框架版本（核查日期 2026-11-03，来源为各框架官网与发布记录，安装时以官网当场公布的版本为准）：
  - Django：最新稳定版 **6.1.2**（2026 年 10 月 6 日发布的安全修复版，6.1 大版本发布于 2026 年 8 月 5 日）；长期支持线另有 **5.2.18**（延长支持至 2028 年 4 月），求稳、不想半年一升的项目可以选 5.2 LTS。
  - Flask：最新稳定版 **3.1.3**（2026 年 2 月 18 日发布，3.2 大版本在核查时尚未发布）；配套 Werkzeug 3.1 线。
  - FastAPI：最新稳定版 **0.162.0**（2026 年 10 月 23 日发布）；配套 Pydantic 2.14 线、Starlette 1.10 线。FastAPI 仍是 0.x 版本号，按它的版本策略，小版本号升级也可能带破坏性改动，所以必须钉住小版本，不要浮动安装。
- 数据库：学习阶段用 SQLite 就够了；生产阶段三个框架都建议用 PostgreSQL，本篇不展开数据库安装（见指南的数据库章节）。

## 4. 使用前提

- 一台能联网的 Ubuntu 机器（本地虚拟机或服务器都行），以及一个普通用户账号，不要用 root 账号直接跑开发服务；
- 已经装好 Python 3 与 pip（第 8 节会检查）；
- 知道“什么是路由、什么是数据库表”这两个概念即可，不要求会写 SQL；
- 本篇的命令默认在项目目录下执行、默认用户为普通用户；凡是写了 `sudo` 的地方，才需要管理员权限。

## 5. 所需资源

| 资源 | 说明 |
|---|---|
| Python 3.12 或 3.13 | Ubuntu 24.04 自带 3.12，`python3 --version` 可查 |
| pip 与 venv | Python 自带，`python3 -m venv` 用来建虚拟环境 |
| 三个框架之一 | Django 6.1.2、Flask 3.1.3、FastAPI 0.162.0，三选一即可入门 |
| 文本编辑器 | 任意能存纯文本文件的编辑器即可 |
| 一台 Ubuntu 服务器 | 只在第 11、14 节部署时需要，学习阶段本地机器就够了 |

> 学习成本提醒：三个框架都学一遍不是必须的。先按第 7 节的对照表选一个，跑通第 10 节，再回头看另外两个的最小片段，知道它们长什么样就够了。

## 6. 技术原理

### 6.1 三个框架一句话

- Django 是“大而全”的框架：路由、ORM、模板、管理后台、用户系统都自带，约定多、动手快，适合内容站和管理后台。
- Flask 是“小而灵活”的框架：核心只给路由和请求处理，数据库、表单、登录都要自己挑扩展装，适合小服务和想自己搭积木的项目。
- FastAPI 是“面向 API”的现代框架：基于 Starlette 与 Pydantic，原生异步，写函数签名就能自动做参数校验并生成交互式 API 文档，适合前后端分离的 API 服务。

### 6.2 WSGI 与 ASGI：先分清这两条路

- WSGI 是 Python 传统的同步 Web 接口标准：一次请求占一个工作进程或线程，逻辑简单，Django 与 Flask 默认走这条路。
- ASGI 是异步接口标准：一个进程能同时挂起很多请求等 I/O，适合高并发 API 与 WebSocket，FastAPI 走这条路，Django 也可以走 ASGI 但默认仍是 WSGI。
- 选哪条路不是信仰问题：请求量不大、逻辑偏同步的后台管理，用 WSGI 的 Django 或 Flask 更省事；API 并发高、大量等数据库与网络 I/O，用 ASGI 的 FastAPI 更划算。

### 6.3 MTV、MVC 与“模型”

- Django 用的叫 MTV：模型（Model，数据库表结构）、模板（Template，页面）、视图（View，处理请求的函数或类）。它和常说的 MVC 是同一回事换了名字，不要被两个名字吓住。
- Flask 与 FastAPI 不强制分层：路由函数里直接返回 JSON 或页面也行；项目变大后，再按“路由层、服务层、数据层”分文件，这是第 7 节架构说明里讲的办法。

### 6.4 为什么 FastAPI 能自动生成文档

FastAPI 的路由函数参数都写了类型注解（例如 `item_id: int`），Pydantic 在运行时按注解校验请求数据，类型不对就返回 422；同一份注解又被 FastAPI 拿去生成 OpenAPI 描述，交互式文档页 `/docs` 就是照着这份描述渲染出来的。所以“写对类型注解”在 FastAPI 里既是校验、也是文档，一份代码两份用处。

## 7. 架构说明

### 7.1 一个请求在三个框架里怎么走

| 步骤 | Django | Flask | FastAPI |
|---|---|---|---|
| 1. 接到请求 | WSGI/ASGI 服务器接请求 | WSGI 服务器接请求 | ASGI 服务器（uvicorn）接请求 |
| 2. 找路由 | `urls.py` 按路径表匹配 | 装饰器注册的路由表匹配 | 装饰器注册的路由表匹配 |
| 3. 进视图函数 | 视图函数（或类视图）处理 | 视图函数处理 | 路径操作函数处理，先过 Pydantic 校验 |
| 4. 碰数据库 | ORM 查模型 | 自己选的 ORM 或 SQL 查 | 自己选的 ORM 或 SQL 查 |
| 5. 回结果 | 渲染模板成 HTML，或返回 JSON | 渲染模板成 HTML，或返回 JSON | 返回 JSON（或模板渲染的 HTML） |

### 7.2 项目变大后怎么分文件

- Django 天生就是按应用（app）分的：一个功能一个 app，每个 app 里有自己的模型、视图、路由、模板，项目大了也不乱。
- Flask 与 FastAPI 建议按这个结构分：`app/` 下分 `routers/`（路由）、`services/`（业务逻辑）、`models/`（数据模型）、`templates/`（页面模板），路由只做“接参数、调服务、回结果”三件事，不要把业务逻辑全塞进路由函数里。
- 数据与状态的去处要分清：请求内的数据放函数参数与返回值；跨请求共享的状态放数据库，不要放全局变量里——第 10 节的内存字典只是学习用的写法，生产必须换成数据库，见第 17 节。

### 7.3 三框架选型对照

| 维度 | Django | Flask | FastAPI |
|---|---|---|---|
| 定位 | 大而全，自带管理后台 | 小而灵活，自己挑扩展 | 面向 API，原生异步 |
| 上手难度 | 中等，要学它的约定 | 低，核心概念最少 | 中等，要懂类型注解 |
| 数据库 | 自带 ORM 与迁移工具 | 自己选（常用 SQLAlchemy） | 自己选（常用 SQLAlchemy） |
| 管理后台 | 自带，建好模型就能用 | 自己搭 | 自己搭 |
| API 文档 | 要装扩展 | 要装扩展 | 自带 `/docs` 与 `/openapi.json` |
| 异步支持 | 支持，但默认同步 | 3.x 支持异步视图 | 原生异步 |
| 适合场景 | 内容站、管理后台、快速成型 | 小服务、原型、教学 | 前后端分离 API、高并发 API |
| 不适合场景 | 只想写两三个接口的小服务（太重） | 大型后台（什么都得自己挑） | 只要传统服务端渲染页面的站（优势用不上） |

选型口诀：要后台、要快成型，选 Django；要轻、要自由，选 Flask；要 API、要并发，选 FastAPI。三个都没错，错的是“拿着锤子看什么都像钉子”。

## 8. 操作前检查

在项目目录下，先跑下面四条命令，确认环境没问题再往下走。命令都在普通用户下执行，不需要 `sudo`。

```bash
python3 --version
pip3 --version
python3 -m venv --help | head -5
ls
```

- `python3 --version` 应该输出 3.12 或 3.13 这样的版本号；如果输出 3.10 或更低，Django 6.1 装不上，先升级 Python 或改用 Django 5.2 LTS。
- `pip3 --version` 应该能输出版本号；如果提示找不到 pip，先跑 `sudo apt update && sudo apt install -y python3-pip python3-venv`。
- `ls` 应该能看到你打算放项目的空目录；不要在系统目录（例如 `/usr/`）里建项目。

## 9. 逐步操作

下面是三个框架各自的“从零到第一个项目”步骤，每个框架独立成节，互不干扰。虚拟环境的操作三个框架通用，先讲一次。

### 9.1 通用第一步：建虚拟环境并激活

```bash
mkdir -p ~/projects/memo && cd ~/projects/memo
python3 -m venv .venv
source .venv/bin/activate
```

- 虚拟环境的作用是把这个项目的包和系统 Python 隔开，换项目、删项目都不影响系统。
- 每次新开终端回来继续做，都要先 `cd` 进项目目录再 `source .venv/bin/activate`；命令提示符前面出现 `(.venv)` 才算激活成功。
- 退出虚拟环境用 `deactivate`，删掉整个项目用 `rm -rf ~/projects/memo`（删之前确认目录名没写错）。

### 9.2 Django：创建第一个项目

```bash
pip install "Django==6.1.2"
django-admin startproject memo .
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000
```

- `startproject memo .` 的最后那个点不能省：它表示“就在当前目录建，不要再套一层文件夹”。
- `migrate` 是把 Django 自带的用户、会话这些表的结构建到数据库里，学习阶段默认用 SQLite 文件 `db.sqlite3`。
- `createsuperuser` 会交互式问用户名、邮箱、密码，密码只作学习用，也不要和别的账号用同一个。
- `runserver` 只是开发服务器，只能本机访问、只能开发时用，生产部署见第 11 节，绝不要把 `runserver` 放到生产上。

Django 建好后的目录结构（`memo/` 是项目配置目录，`manage.py` 是命令行入口）：

```text
memo/
├── manage.py
├── memo/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
└── db.sqlite3
```

### 9.3 Flask：创建第一个项目

```bash
pip install "Flask==3.1.3"
```

Flask 没有脚手架命令，第一个项目就是一个 `app.py` 文件（完整写法见第 10.3 节），启动命令是：

```bash
flask --app app run --host 127.0.0.1 --port 8000
```

- Flask 3.x 的启动命令是 `flask --app app run`，老教程里的 `FLASK_APP=app.py flask run` 写法不要再抄。
- `flask run` 同样只是开发服务器，生产部署见第 11 节。

Flask 最小项目的目录结构：

```text
memo/
├── .venv/
├── app.py
└── requirements.txt
```

### 9.4 FastAPI：创建第一个项目

```bash
pip install "fastapi[standard]==0.162.0"
```

`fastapi[standard]` 会连带装上 uvicorn 服务器等常用件；第一个项目就是一个 `main.py` 文件（完整写法见第 10.1 节），启动命令是：

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

- `--reload` 只在开发时加，代码一改就自动重启，生产部署时必须去掉。
- 启动成功后，浏览器打开 `http://127.0.0.1:8000/docs` 就能看到交互式 API 文档，这是 FastAPI 自带的，不用另外装东西。

FastAPI 最小项目的目录结构：

```text
memo/
├── .venv/
├── main.py
└── requirements.txt
```

## 10. 完整代码

本节是完整实战：以 FastAPI 做一个完整的小应用（备忘 API），Django 与 Flask 各给一个能跑通的最小项目片段。三个片段里的口令与密钥一律没有出现，数据库连接等敏感配置在第 11 节里只用占位符。反面写法只出现在表格和行内代码里，本节没有用围栏代码块写任何错误代码。

### 10.1 FastAPI 完整小应用：备忘 API

存放路径：项目目录下的 `main.py`，启动命令见第 9.4 节。功能：健康检查、列出备忘、新增备忘、查一条、改一条、删一条；数据先放内存字典里，只供学习，生产必须换成数据库（见第 17 节）。

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="备忘 API")


class ItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    done: bool = False


class Item(ItemIn):
    id: int


items = {}
next_id = 1


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items", response_model=list[Item])
def list_items():
    return list(items.values())


@app.post("/items", response_model=Item, status_code=201)
def create_item(data: ItemIn):
    global next_id
    item = Item(id=next_id, title=data.title, done=data.done)
    items[next_id] = item
    next_id += 1
    return item


@app.get("/items/{item_id}", response_model=Item)
def get_item(item_id: int):
    item = items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="item not found")
    return item


@app.put("/items/{item_id}", response_model=Item)
def update_item(item_id: int, data: ItemIn):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="item not found")
    item = Item(id=item_id, title=data.title, done=data.done)
    items[item_id] = item
    return item


@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="item not found")
    del items[item_id]
    return None
```

这段代码里值得注意的几点：

- `title: str = Field(min_length=1, max_length=100)` 是 Pydantic 的校验：空标题、超长标题会在进函数之前就被挡下，返回 422，不是等到写数据库才报错。
- `response_model=Item` 是出参的形状保证：返回的数据会按模型过滤一遍，多余字段不会漏出去。
- `HTTPException(status_code=404)` 是 FastAPI 里标准的“找不到”处理，不要在找不到时返回 200 加一段文字，那样调用方分不清成功还是失败。
- `GET /items` 返回列表，`POST /items` 返回 201，`DELETE` 成功返回 204 且没有响应体，这是 REST 风格里最常见的约定。

### 10.2 Django 最小项目片段：备忘模型与接口

Django 的完整项目由第 9.2 节的脚手架生成，下面是“备忘”这个功能要补的三份文件。先建应用，再写文件：

```bash
python manage.py startapp notes
```

存放路径：`notes/models.py`，模型就是数据库表结构：

```python
from django.db import models


class Note(models.Model):
    title = models.CharField(max_length=100)
    done = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
```

存放路径：`notes/views.py`，视图只做“查出来、转成 JSON、返回”：

```python
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import Note


@require_http_methods(["GET"])
def note_list(request):
    notes = Note.objects.values("id", "title", "done")
    return JsonResponse(list(notes), safe=False)
```

存放路径：`notes/urls.py`，路由表把路径和视图连起来：

```python
from django.urls import path
from . import views

urlpatterns = [
    path("notes/", views.note_list, name="note-list"),
]
```

补完之后还要做三件事，缺一不可：把 `notes` 加进项目 `settings.py` 的 `INSTALLED_APPS`，把 `notes.urls` 挂进项目总路由 `urls.py`，然后跑 `python manage.py makemigrations notes` 与 `python manage.py migrate` 生成并应用表结构。Django 的页面编写用它自带的模板语言写 HTML 文件放 `templates/` 目录，表单与管理后台由模型自动生成，见第 15 节的注意事项。

### 10.3 Flask 最小项目片段：备忘接口

存放路径：项目目录下的 `app.py`，功能与第 10.1 节对应（健康检查、列出、新增），数据同样先放内存字典，只供学习：

```python
from flask import Flask, jsonify, request

app = Flask(__name__)
notes = {}
next_id = 1


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/notes")
def list_notes():
    return jsonify(list(notes.values()))


@app.post("/notes")
def create_note():
    global next_id
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    note = {"id": next_id, "title": title, "done": False}
    notes[next_id] = note
    next_id += 1
    return jsonify(note), 201
```

Flask 与 FastAPI 这段的差别值得留意：Flask 没有 Pydantic 那样的声明式校验，`title` 为空要自己在函数里判，判完自己返回 400；这就是“小而灵活”的代价——自由，但样板代码要自己写。Flask 的页面编写用 Jinja2 模板，文件放 `templates/` 目录，视图函数里用 `render_template` 渲染；数据库推荐用 Flask-SQLAlchemy 扩展接 SQLAlchemy，不要自己拼 SQL 字符串。

## 11. 完整配置文件

下面四个文件是一套能直接用的部署配置，全部注明存放路径，口令与密钥一律用占位符，读者必须替换成自己的值，绝不要把占位符原样用到生产上。

存放路径：项目目录下的 `requirements.txt`（FastAPI 实战版；Django 版把第一行换成 `Django==6.1.2`，Flask 版换成 `Flask==3.1.3`，其余行按需删减）：

```text
fastapi==0.162.0
uvicorn[standard]
pydantic>=2.7
```

存放路径：项目目录下的 `.env`（只放配置，不放代码；这个文件绝不要提交进 git，见第 17 节）：

```text
SECRET_KEY=请替换为随机字符串
DATABASE_URL=sqlite:///./memo.db
```

存放路径：`/etc/systemd/system/memo.service`（systemd 服务文件，管启动、管重启；`User` 建议用普通用户，不要用 root 跑应用）：

```ini
[Unit]
Description=备忘 API（uvicorn）
After=network.target

[Service]
User=www-data
WorkingDirectory=/srv/memo
EnvironmentFile=/srv/memo/.env
ExecStart=/srv/memo/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

存放路径：`/etc/nginx/sites-available/memo`（Nginx 反向代理配置，启用方法是建软链接到 `sites-enabled/` 再重载，见第 14 节）：

```nginx
server {
    listen 80;
    server_name example.com;

    location /static/ {
        alias /srv/memo/static/;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- Django 的生产启动命令是 Gunicorn 而不是 `runserver`：`gunicorn memo.wsgi --bind 127.0.0.1:8000 --workers 2`，`memo.wsgi` 里的 `memo` 是项目配置目录名，换项目名要跟着换。
- Flask 的生产启动命令同样是 Gunicorn：`gunicorn app:app --bind 127.0.0.1:8000 --workers 2`，不要用 `flask run` 上生产。
- FastAPI 的生产启动命令是 uvicorn 去掉 `--reload`，或用 Gunicorn 带 uvicorn worker：`gunicorn main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000`。
- 静态文件说明：Nginx 的 `/static/` 段只适合 FastAPI/Flask 自己放的少量静态文件；Django 的静态文件要先跑 `python manage.py collectstatic` 收集到统一目录，再由 Nginx 的 `alias` 指向那个目录。

## 12. 每个关键配置项的解释

| 配置项 | 在哪 | 含义 | 配错的后果 |
|---|---|---|---|
| `SECRET_KEY` | Django 的 `settings.py`、`.env` | 签名会话与令牌用的密钥 | 泄露或用默认值，他人可伪造会话 |
| `DEBUG` | Django 的 `settings.py` | 开发模式开关 | 生产开着会把报错详情与配置暴露给访客 |
| `ALLOWED_HOSTS` | Django 的 `settings.py` | 允许访问本站的域名列表 | 不配或配错，生产访问会直接报 400 |
| `DATABASE_URL` | `.env` | 数据库连接地址 | 写错地址，应用起不来或连到错的库 |
| `proxy_pass` | Nginx 配置 | 转发给应用服务器的地址 | 指错端口，访客看到 502 |
| `proxy_set_header Host` | Nginx 配置 | 把访客请求的域名原样传给应用 | 不传，应用拿到的域名是 127.0.0.1，生成链接会错 |
| `X-Forwarded-Proto` | Nginx 配置 | 告诉应用访客用的是 http 还是 https | 不传，https 站会误判成 http，造成重定向循环 |
| `--workers` | Gunicorn 启动参数 | 工作进程数 | 设得太高，小内存机器会被撑满；设 1 则并发能力弱 |
| `--reload` | uvicorn 开发参数 | 代码改动自动重启 | 生产开着，文件一动服务就重启，且多耗资源 |
| `expires 7d` | Nginx 静态段 | 静态文件让浏览器缓存 7 天 | 静态文件更新后访客仍看到旧版，要配合改文件名或清缓存 |
| `Restart=on-failure` | systemd 服务 | 进程崩了自动重启 | 不配，服务崩了就一直停着，直到有人手动发现 |

## 13. 执行结果示例

下面是读者按第 14 节操作时“应该看到”的样子，均为示例输出（未在本机运行，实际版本号、端口、时间以读者本机为准）。先看启动，再看接口。

开发启动成功的样子（FastAPI + uvicorn，`--reload` 只在开发时加）：

```text
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

新增一条备忘的请求与响应示例（请求发给 `POST /items`，请求体是 JSON）：

```json
{
  "title": "给服务器打补丁",
  "done": false
}
```

成功时服务返回 201 与新建的记录：

```json
{
  "id": 1,
  "title": "给服务器打补丁",
  "done": false
}
```

标题为空时 FastAPI 返回 422，响应里会指出是哪个字段、错在哪里，这是 Pydantic 校验在起作用：

```json
{
  "detail": [
    {
      "loc": ["body", "title"],
      "msg": "String should have at least 1 character",
      "type": "string_too_short"
    }
  ]
}
```

查不到的记录返回 404（第 10.1 节里 `HTTPException` 的结果）：

```json
{
  "detail": "item not found"
}
```

## 14. 成功验证

按下面步骤在自己机器上逐项验证，全部通过才算跑通。验证命令都在普通用户下执行，部署验证那几步需要 `sudo`。

1. 版本验证：激活虚拟环境后跑 `pip show django`、`pip show flask` 或 `pip show fastapi`，确认版本号与第 3 节一致（小版本浮动时以 `requirements.txt` 里钉住的为准）。
2. 健康检查：开发服务起来后跑 `curl http://127.0.0.1:8000/health`，应返回 `{"status": "ok"}`。
3. 增查验证：跑 `curl -X POST http://127.0.0.1:8000/items -H "Content-Type: application/json" -d '{"title": "验证", "done": false}'`，应返回 201 与新记录；再跑 `curl http://127.0.0.1:8000/items`，应看到这条记录在列表里。
4. 文档验证（FastAPI）：浏览器打开 `http://127.0.0.1:8000/docs`，应能看到接口列表并能点开试调。
5. 后台验证（Django）：浏览器打开 `http://127.0.0.1:8000/admin/`，用 `createsuperuser` 建的账号能登录，并能看到 `notes` 里的数据。
6. 部署验证：按第 11 节配好 systemd 与 Nginx 后，依次跑 `sudo nginx -t`、`sudo systemctl daemon-reload`、`sudo systemctl enable --now memo`、`sudo systemctl status memo`，再从浏览器用域名访问，确认能打开且 `journalctl -u memo -n 50` 里没有持续报错。
7. 失败判定：健康检查不通先查服务是不是真的在跑（`ss -tlnp | grep 8000`），再查日志；接口返回 422 先看请求体是不是缺字段或类型不对，不要先怀疑框架坏了。

## 15. 常见错误

| 错误表现 | 常见原因 | 解决办法 |
|---|---|---|
| `pip install` 装不上或装了别的版本 | 没激活虚拟环境，或没钉版本 | 先确认提示符有 `(.venv)`，再按 `requirements.txt` 重装 |
| Django 启动报 `ALLOWED_HOSTS` 错误 | 生产配置里没加自己的域名 | 把域名加进 `ALLOWED_HOSTS`，开发本机访问不受影响 |
| Django 页面报 404 | 路由没挂进总路由，或 `INSTALLED_APPS` 漏了应用 | 回第 10.2 节末尾的三件事逐项核对 |
| Flask 启动报找不到应用 | 启动命令没指对模块名 | 文件叫 `app.py` 就用 `flask --app app run`，文件改名要跟着改 |
| FastAPI 文档页打不开 | 服务没起来，或访问了错误的端口 | 先跑健康检查，再确认 `--port` 与访问地址一致 |
| 接口返回 422 | 请求体缺字段、类型不对、字符串超长 | 照着 422 响应里的 `loc` 字段改请求体 |
| 改了代码没生效 | 开发用了 `--reload` 之外的启动方式，或改的是别的目录下的文件 | 确认当前目录与启动目录一致，生产改代码要重启服务 |
| 生产环境看到 Django 报错详情页 | `DEBUG` 在生产还开着 | 立刻关掉 `DEBUG`，重启服务，并检查有没有泄露配置 |
| 静态文件 404 | Nginx 的 `alias` 路径不对，或 Django 没跑 `collectstatic` | 核对路径与收集步骤，见第 11 节末尾 |

反面写法提醒（只写在这里的行内代码里，不要照抄进项目）：生产配置里写 `DEBUG = True` 是错的；把 `SECRET_KEY` 直接写进代码文件并提交进 git 是错的；用 `runserver` 或 `flask run` 跑生产是错的；把用户输入直接拼进 SQL 字符串是错的，三个框架都要走 ORM 或参数化查询。

## 16. 故障排查

- 服务起不来：先看日志，systemd 部署的看 `journalctl -u memo -n 100`，开发启动的看终端输出；日志第一条报错往往就是根因，不要跳过它去猜后面的。
- 端口被占：`ss -tlnp | grep 8000` 能看到谁占了 8000 端口；开发时换个端口最快，生产则要先停掉占端口的旧服务。
- 502 Bad Gateway：Nginx 在跑但应用没在跑，或者 `proxy_pass` 指的端口不对；先确认应用进程在，再核对端口。
- 数据库报错：先确认 `DATABASE_URL` 指向的库存在、账号能连上；Django 还要确认迁移跑没跑完（`python manage.py showmigrations` 能看迁移状态）。
- 依赖冲突：两个扩展要求同一个包的不同版本时，报错会写明是哪两个包；先按 `requirements.txt` 钉住的版本重装，解决不了再升级其中一个并重测。
- 内存字典数据“丢了”：第 10 节的内存字典只存在于进程内存里，服务一重启数据就没了，这是预期行为，不是 bug；要持久化就接数据库。
- 实在定位不了：把问题拆小——先跑健康检查，再跑最简单的增查接口，健康检查通而业务接口不通，问题就在业务代码里；健康检查都不通，问题在启动与配置里。

## 17. 安全注意事项

- 密钥与口令只放 `.env` 与服务器上的环境变量，绝不要写进代码、绝不要提交进 git；`.env` 要放进 `.gitignore`，仓库里只留一份去掉真实值的 `.env.example`。
- Django 生产必须关 `DEBUG`、配好 `ALLOWED_HOSTS`、用随机 `SECRET_KEY`；三框架都要开 HTTPS 再对外（见指南的 HTTPS 章节），登录与会话绝不要走明文 http。
- 不要自己拼 SQL：Django 用 ORM，Flask 与 FastAPI 用 SQLAlchemy 的参数化查询；用户输入进数据库之前，先过框架的校验（FastAPI 的 Pydantic、Django 的表单与模型字段、Flask 的表单校验扩展）。
- 接口限流与认证要提前想：对外 API 至少要有限流（防刷），写操作要有身份校验；FastAPI 的依赖注入（`Depends`）适合放认证逻辑，不要在每个路由里重复写。
- 依赖要定期升级：钉版本不等于永不升级，安全修复版出来后先在测试环境升，再上生产；升级前先备份数据库与旧的 `requirements.txt`。
- 日志不要记敏感信息：请求日志里不要出现口令、令牌、完整 Cookie；报错发给访客的只应该是状态码与简短提示，详细堆栈只留在服务器日志里。

## 18. 回滚和恢复

- 代码回滚：用 git 的话，`git log --oneline` 找到上一个能跑的提交，`git revert` 回滚有问题的提交，再重启服务；没用 git 的话，部署前先把旧的项目目录整个复制一份（例如 `cp -r /srv/memo /srv/memo.bak`），出问题把备份拷回来。
- 配置回滚：Nginx 与 systemd 文件改之前先备份（例如 `cp /etc/nginx/sites-available/memo /etc/nginx/sites-available/memo.bak`），改坏了用备份覆盖，再跑 `nginx -t` 与重载。
- 服务回滚：`systemctl stop memo` 停掉新服务，换回旧代码或旧配置，`systemctl start memo` 再起；数据库结构变了的回滚要先看迁移记录，Django 的迁移回滚用 `python manage.py migrate <应用名> <上一个迁移号>`，不要直接删表。
- 数据恢复：SQLite 是把 `db.sqlite3` 文件拷走就是备份；PostgreSQL 用 `pg_dump` 备份，恢复前先确认备份文件能读、恢复目标库是空的或已备份的。
- 回滚后验证：按第 14 节的健康检查与增查验证重跑一遍，确认恢复的是“能跑的上一个版本”，而不是“刚回滚完但还没验证”的版本。

## 19. 延伸阅读

- 选型总纲：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)。
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)、[NET-02 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名](../basics/02-domain.md)。
- 建站指南总计划与任务索引：[MASTER_PLAN.md](../MASTER_PLAN.md)、[TASK_INDEX.md](../TASK_INDEX.md)、[ROADMAP.md](../ROADMAP.md)。
- 官方文档（按需查阅，以官网当场公布的内容为准）：Django 官方文档的教程与部署章节、Flask 官方文档的快速上手与部署章节、FastAPI 官方文档的教程与部署章节、SQLAlchemy 官方文档。

## 20. 相关章节链接

- 选型总纲：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)。
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)、[NET-02 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名](../basics/02-domain.md)。
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)、[TASK_INDEX.md](../TASK_INDEX.md)、[ROADMAP.md](../ROADMAP.md)。
- 上一篇：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](./01-php.md)
- 下一篇：[BE-03 Node.js 框架：Express、NestJS、Fastify](./03-nodejs.md)
