# SRV-02：PHP-FPM、systemd、运行环境与进程管理完整教程

> 任务编号：SRV-02（网站建设与部署实战指南 · 服务器第 2 篇）
> 上一篇：[SRV-01 Nginx、Apache、Caddy 完整配置与多站点](./01-web-servers.md)；下一篇：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](../deploy/01-cicd.md)。
> 本篇只讲网站跑起来之后的那一层：PHP-FPM 进程池、systemd 服务管理、Node.js 与 Python 应用的进程管理（PM2 与 systemd 二选一）、环境变量与资源限制。不讲 Nginx、Apache、Caddy 的配置模板本身（那是 SRV-01），不讲部署流水线（DEPLOY 篇）。

## 1. 本章目标

读完并动手做完本篇，你能：

- 说清一次 PHP 请求从 Nginx 到 PHP-FPM 再回来的完整链路，知道 502 大多卡在哪一步。
- 给自己的 PHP 站点写一个完整的 PHP-FPM 进程池配置，并根据内存算出 `pm.max_children`。
- 给 Node.js 或 Python 应用写一个完整的 systemd 服务单元，做到开机自启、崩溃自动重启、日志能查到。
- 在 PM2 与 systemd 之间做出选择，并说清为什么同一台机器上不要两个都管同一个应用。
- 用环境变量文件管理口令与密钥，做到配置进仓库、口令不进仓库。

## 2. 适用人群

- 已经有一个能跑的网站（PHP、Node.js 或 Python 任一种），想把它从“手动启动、关了终端就停”变成“开机自启、崩溃自愈”的读者。
- 读过 BE-01 或 BE-03，知道自己的应用长什么样，但还没亲手配过 PHP-FPM 池或 systemd 服务的读者。
- 不适合只想学写代码、不想碰服务器的读者；也不适合已经在用 Kubernetes、Supervisor 集群化部署的读者，本篇讲的是单台 Ubuntu 服务器上的进程管理。

## 3. 适用系统和版本

- 操作系统：Ubuntu 24.04 LTS（本篇命令以此为准），Ubuntu 22.04 LTS 大体相同，服务名里的 PHP 版本号不同，见下文。
- PHP：PHP 8.4（BE-01 的部署章节用的就是 PHP 8.4，服务名是 `php8.4-fpm`，套接字在 `/run/php/` 下）；Ubuntu 22.04 上对应的是 PHP 8.1，服务名与套接字里的 `8.4` 要换成 `8.1`。
- Node.js：20.19 以上或 22.12 以上（与 JS-04 的要求一致），本篇示例用 `/usr/bin/node`，实际路径以 `which node` 的结果为准。
- Python：Ubuntu 24.04 自带的 Python 3.12，gunicorn 用 pip 安装，安装时以 PyPI 当场公布的版本为准。
- systemd：Ubuntu 自带的 systemd，`systemctl` 与 `journalctl` 命令随系统自带，不需要单独装。
- PM2：用 npm 全局安装，安装时以 npm 当场公布的版本为准，本篇不写死 PM2 的版本号。
- 本篇所有路径都以 Ubuntu 的默认布局为准，换发行版要先核对路径。

## 4. 使用前提

- 一台能用 sudo 的 Ubuntu 服务器，已经装好 Nginx（Nginx 本身的配置见 SRV-01，本篇只用到连接 PHP-FPM 的那一行）。
- 一个已经能跑的应用：PHP 应用（例如 BE-01 的 Laravel 项目，入口在 `public/index.php`）、Node.js 应用（例如 BE-03 的 Fastify 项目，入口是 `app.js`）、Python 应用（例如 BE-02 的 FastAPI 项目，入口模块是 `app:app`），三者有其一即可，本篇三条路线都讲，读者按自己用的那条做。
- 应用已经有一个独立的运行用户（本篇示例用 `myapp`），不要用 root 跑应用，也不要用部署用的个人账号跑应用，原因见第 17 节。
- 会用 `sudo`、会看报错的第一行，不要求会写 shell 脚本。

## 5. 所需资源

- 一台 Ubuntu 服务器，内存至少 1GB（PHP-FPM 动态模式 + 一个 Node.js 应用同时跑，1GB 会比较紧，2GB 起步更稳）。
- 一个域名不是必需的，本篇全部验证都可以在服务器本机用 `curl http://127.0.0.1` 做，域名解析是 NET-02 的范围。
- 一个能登录服务器的终端，会用 `systemctl status`、`journalctl`、`curl` 三个命令。
- 不需要额外花钱的服务，PHP-FPM、systemd、gunicorn 都是系统或开源软件，PM2 也是开源的。

## 6. 技术原理

### 6.1 PHP-FPM 是什么

PHP 本身不直接接网络请求。Nginx 收到一个 `.php` 请求后，自己不执行 PHP，而是通过 FastCGI 协议把请求转发给 PHP-FPM，PHP-FPM 池里的工作进程（worker）执行 PHP 脚本，把结果还给 Nginx，Nginx 再还给浏览器。

- CGI 是最老的做法：每个请求都新起一个 PHP 进程，请求完就退出，慢。
- FastCGI 是 CGI 的改进：进程常驻，多个请求复用同一个进程，省掉了反复启动的开销。
- PHP-FPM（FastCGI Process Manager）就是 PHP 官方的 FastCGI 进程管理器：它管着一池 worker，负责派活、回收、记慢日志。

### 6.2 systemd 是什么

systemd 是 Ubuntu 的 1 号进程（PID 1），开机第一个起来，负责启动和管理所有服务。一个服务对应一个单元文件（unit），里面写清：启动命令是什么、以哪个用户跑、崩溃了要不要重启、开机要不要自启、日志往哪里记。

- `systemctl start/stop/restart/reload/status` 是管服务的开关。
- `systemctl enable/disable` 是管开机自启的开关，只做一次就一直生效。
- `journalctl -u 服务名` 是查服务日志的命令，服务的标准输出和标准错误默认都进 journal。

### 6.3 PM2 与 systemd 的关系

PM2 是 Node.js 生态的进程管理器，`pm2 start` 之后它自己守着应用，崩溃自动重启，还能做集群模式。PM2 和 systemd 不是对立的：PM2 自己也需要一个 systemd 单元来保证“机器重启后 PM2 还在”，`pm2 startup` 生成的就是这个单元。

- 选 systemd 直接管应用：系统原生，不依赖 Node.js 生态，日志走 journal，适合“服务器上只有一个或少数几个应用”。
- 选 PM2 管应用：看板（`pm2 list`、`pm2 monit`）直观，集群模式开箱即用，适合“同一个 Node.js 应用要跑多个进程”。
- 红线：同一个应用只能由其中一个管，不要 systemd 和 PM2 同时管同一个端口，否则两个管家互相重启，日志里会看到反复的启动与端口占用报错。

### 6.4 环境变量

环境变量是“运行时才给应用的配置”，例如数据库地址、密钥、运行模式。把它写进应用代码里，换环境就要改代码；把它写进 `.env` 文件或 systemd 的 `EnvironmentFile` 里，代码不动，只换文件。

- 原则：代码进仓库，口令不进仓库。`.env` 文件只放服务器上，权限 600，属主是运行用户。
- PHP-FPM 池里可以用 `env[变量名]` 传变量，也可以用 `clear_env = no` 让 worker 继承启动时的环境变量，两者的区别见第 12 节。

## 7. 架构说明

一次 PHP 请求的完整链路：

| 步骤 | 谁在干活 | 干了什么 |
| --- | --- | --- |
| 1 | 浏览器 | 发出 HTTPS 请求 |
| 2 | Nginx | 按域名与路径匹配到站点，把 `.php` 请求转给 PHP-FPM |
| 3 | PHP-FPM 主进程 | 按池配置派一个空闲 worker |
| 4 | PHP-FPM worker | 执行 `public/index.php`，连数据库、算结果 |
| 5 | Nginx | 把 worker 的结果还给浏览器 |

Node.js 与 Python 应用的链路则短一截：Nginx 做反向代理，把请求转给 `127.0.0.1:3000`（Node.js）或 `127.0.0.1:8000`（gunicorn），应用进程自己处理请求。应用进程由 systemd 或 PM2 守着，崩溃了由它们重启。

本篇三条路线对照：

| 应用类型 | 谁执行代码 | 谁守着进程 | 对外怎么接 |
| --- | --- | --- | --- |
| PHP | PHP-FPM worker | systemd（管 `php8.4-fpm` 服务） | Nginx 经套接字连 PHP-FPM |
| Node.js | node 进程 | systemd 或 PM2（二选一） | Nginx 反向代理到 127.0.0.1:3000 |
| Python | gunicorn worker | systemd | Nginx 反向代理到 127.0.0.1:8000 |

## 8. 操作前检查

动手前先在服务器上跑下面这组检查，任何一项对不上都先停下来修好，不要带着疑问往下配：

- `systemctl is-active nginx` 应为 `active`，Nginx 没跑起来，后面配什么都没用。
- `systemctl is-active php8.4-fpm` 应为 `active`（只针对 PHP 路线；Ubuntu 22.04 上服务名是 `php8.1-fpm`）。
- `which node` 应给出 node 的路径（只针对 Node.js 路线），`which gunicorn` 应给出 gunicorn 的路径（只针对 Python 路线）。
- `id myapp` 应给出运行用户的 uid 与 gid，没有这个用户就先建一个，见第 9.1 节。
- `ls -ld /srv/myapp` 应确认应用目录存在且属主是运行用户，不要让应用目录的属主是 root。
- `df -h /` 应确认磁盘还有空间，日志写满磁盘是第 15 节的常见错误之一。

## 9. 逐步操作

### 9.1 建运行用户与目录

应用不要用 root 跑，先建一个没有登录权限的专用用户，再把应用目录交给它：

```bash
sudo useradd --system --home-dir /srv/myapp --shell /usr/sbin/nologin myapp
sudo mkdir -p /srv/myapp
sudo chown myapp:myapp /srv/myapp
```

`--system` 表示这是系统用户，`--shell /usr/sbin/nologin` 表示这个用户不能登录服务器，只能用来跑服务。

### 9.2 写 PHP-FPM 进程池配置

PHP-FPM 的池配置文件放在 `/etc/php/8.4/fpm/pool.d/` 下，一个文件就是一个池。默认自带的 `www.conf` 不要直接改，复制一份改名，例如 `myapp.conf`，这样默认池还在，出问题能对照。完整配置见第 10.1 节，写好后先检查语法再重载：

```bash
sudo php-fpm8.4 -t
sudo systemctl reload php8.4-fpm
```

注意：`reload` 是让主进程重读配置、平滑换 worker；`restart` 是整个服务停掉再起，正在处理的请求会被打断。改池配置用 `reload` 就够了，只有改了主配置文件或升级 PHP 才需要 `restart`。

### 9.3 选进程模式

PHP-FPM 的 `pm` 有三个值，选哪个看流量形态：

| 模式 | 行为 | 适合 |
| --- | --- | --- |
| `static` | 启动时就起满 `pm.max_children` 个 worker，一直都在 | 流量平稳、内存充足，响应最稳 |
| `dynamic` | 按需起停，在 `pm.min_spare_servers` 与 `pm.max_spare_servers` 之间浮动 | 流量有波峰波谷，大多数站点选这个 |
| `ondemand` | 没请求时一个 worker 都不起，有请求才起，闲置 `pm.process_idle_timeout` 秒后退出 | 流量极低、省内存优先的站点 |

`pm.max_children` 怎么算：先看一个 worker 占多少内存（`ps` 看，或者压测时看），再用公式算：`max_children = 可用于 PHP 的内存 / 单个 worker 内存`。例如服务器给 PHP 留 1GB，单个 worker 约 50MB，`max_children` 就是 20。本篇第 10.1 节的示例就是按这个口径写的，读者要按自己机器的实测数字换，不要照抄。

### 9.4 写 systemd 服务单元

服务单元文件放在 `/etc/systemd/system/` 下，例如 `/etc/systemd/system/myapp.service`，完整内容见第 10.2 节。写好后的固定流程是四步，顺序不能乱：

```bash
sudo systemctl daemon-reload
sudo systemctl enable myapp
sudo systemctl start myapp
sudo systemctl status myapp
```

`daemon-reload` 是让 systemd 重读单元文件，改了单元文件不跑这一步，systemd 用的还是旧内容。`enable` 是开机自启，只做一次。`status` 里看到 `active (running)` 才算起来了。

### 9.5 用 systemd 管 Python 应用

Python 应用的 systemd 单元与 Node.js 的大同小异，只换启动命令。gunicorn 的启动命令是：

```bash
gunicorn --workers 3 --bind 127.0.0.1:8000 app:app
```

`app:app` 的意思是“`app.py` 这个模块里的 `app` 这个对象”。worker 数按 CPU 核数估：`2 × CPU 核数 + 1` 是常见起点，2 核机器就是 5 个，但内存不够时要往下减，worker 太多会把内存吃光。把这行写进单元文件的 `ExecStart` 里，其他段落与第 10.2 节的 Node.js 单元相同。

### 9.6 用 PM2 管 Node.js 应用

PM2 的生态文件（ecosystem file）就是把“怎么启动、起几个、日志放哪里、环境变量是什么”写进一个文件，完整内容见第 10.3 节。固定流程是：

```bash
pm2 start ecosystem.config.js
pm2 save
sudo pm2 startup
```

`pm2 start` 是启动，`pm2 save` 是把当前进程列表存下来，`pm2 startup` 是生成 systemd 单元、让机器重启后 PM2 自己先起来、再把存下来的进程拉起来。三步缺一步，重启后应用都不会自己回来。`pm2 save` 之后如果又改了进程列表，要再跑一次 `pm2 save`。

### 9.7 环境变量文件

环境变量文件放在应用目录下，例如 `/srv/myapp/.env`，完整内容见第 11.1 节。systemd 单元里用 `EnvironmentFile=/srv/myapp/.env` 引用它，PM2 生态文件里用 `env` 字段写它。两个要点：

- `.env` 文件权限必须是 600，属主是运行用户，否则同一台机器上的其他用户能读到口令。
- 改了 `.env` 文件要重启服务才生效，`reload` 不够，因为环境变量只在进程启动时读一次。

### 9.8 资源限制

资源限制分三层，各管各的，不要只设一层就以为万事大吉：

- PHP-FPM 层：`pm.max_children` 与 `pm.max_requests`（worker 处理满 500 个请求后自动退出重起，防止内存泄漏越积越多）。
- systemd 层：`MemoryMax`（例如 512M，超了会被 systemd 杀掉并按重启策略拉起来）、`LimitNOFILE`（单个进程能打开的文件数，Web 应用 65536 起步）。
- PM2 层：`max_memory_restart`（例如 500M，超了 PM2 自动重启该进程）。

### 9.9 日志查看

三个地方的日志不要混着查：

- systemd 服务日志：`journalctl -u myapp -f`（`-f` 是实时跟随，相当于 `tail -f`）。
- PHP-FPM 慢日志：`request_slowlog_timeout` 设了 5 秒，超过 5 秒没跑完的请求会被记进 `slowlog` 文件，里面有完整的 PHP 调用栈，是定位慢接口的第一手材料。
- Nginx 错误日志：`/var/log/nginx/error.log`，502 的第一现场在这里，看 `connect() to unix:... failed` 还是 `upstream timed out`，两者指向的问题完全不同，见第 16 节。

## 10. 完整代码

### 10.1 PHP-FPM 进程池配置

文件路径：`/etc/php/8.4/fpm/pool.d/myapp.conf`。Ubuntu 22.04 上把路径里的 `8.4` 换成 `8.1`。这个池只给一个站点用，不要多个站点共用一个池，否则一个站点的慢请求会拖垮另一个站点。

```ini
[myapp]
user = www-data
group = www-data
listen = /run/php/php8.4-fpm-myapp.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = dynamic
pm.max_children = 20
pm.start_servers = 4
pm.min_spare_servers = 2
pm.max_spare_servers = 6
pm.max_requests = 500
pm.status_path = /status
slowlog = /var/log/php8.4-fpm-myapp-slow.log
request_slowlog_timeout = 5s
php_admin_value[error_log] = /var/log/php8.4-fpm-myapp-error.log
php_admin_flag[log_errors] = on
clear_env = no
```

Nginx 连这个池只需要一行，放在站点配置的 PHP 处理块里（Nginx 模板本身是 SRV-01 的范围，这里只写连接这一行）：

```nginx
fastcgi_pass unix:/run/php/php8.4-fpm-myapp.sock;
```

### 10.2 systemd 服务单元（Node.js 应用）

文件路径：`/etc/systemd/system/myapp.service`。Python 应用把 `ExecStart` 一行换成第 9.5 节的 gunicorn 命令，其他段落不变。

```ini
[Unit]
Description = MyApp Node.js service
After = network.target
Wants = network.target

[Service]
Type = simple
User = myapp
Group = myapp
WorkingDirectory = /srv/myapp
ExecStart = /usr/bin/node /srv/myapp/app.js
EnvironmentFile = /srv/myapp/.env
Restart = on-failure
RestartSec = 5
StandardOutput = journal
StandardError = journal
NoNewPrivileges = true
PrivateTmp = true
LimitNOFILE = 65536
MemoryMax = 512M

[Install]
WantedBy = multi-user.target
```

### 10.3 PM2 生态文件（Node.js 应用）

文件路径：`/srv/myapp/ecosystem.config.js`，属主是运行用户 `myapp`。用 PM2 的应用不要再用 systemd 直接管同一个应用，见第 6.3 节的红线。

```js
module.exports = {
  apps: [
    {
      name: "myapp",
      script: "app.js",
      cwd: "/srv/myapp",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      max_memory_restart: "500M",
      error_file: "/srv/myapp/logs/error.log",
      out_file: "/srv/myapp/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
};
```

## 11. 完整配置文件

### 11.1 环境变量文件

文件路径：`/srv/myapp/.env`，权限 600，属主 `myapp`。里面的值全部是占位符，上线前换成读者自己的真实值，不要把真实口令写进任何会被提交到仓库的文件里。

```ini
APP_ENV=production
PORT=3000
DATABASE_URL=请填数据库连接串
JWT_SECRET=请填随机长串
```

### 11.2 systemd 覆盖配置（资源限制单拎出来）

文件路径：`/etc/systemd/system/myapp.service.d/limits.conf`。覆盖配置（drop-in）的好处是不用改主单元文件，主单元升级或重写时，覆盖配置还在。写好后同样要跑 `systemctl daemon-reload` 再重启服务。

```ini
[Service]
LimitNOFILE = 65536
MemoryMax = 512M
```

### 11.3 配置文件与权限总表

| 文件 | 存放路径 | 属主 | 权限 | 改完要跑的命令 |
| --- | --- | --- | --- | --- |
| PHP-FPM 池配置 | `/etc/php/8.4/fpm/pool.d/myapp.conf` | root | 644 | `php-fpm8.4 -t`，再 `systemctl reload php8.4-fpm` |
| systemd 服务单元 | `/etc/systemd/system/myapp.service` | root | 644 | `systemctl daemon-reload`，再 `systemctl restart myapp` |
| PM2 生态文件 | `/srv/myapp/ecosystem.config.js` | myapp | 644 | `pm2 restart ecosystem.config.js`，再 `pm2 save` |
| 环境变量文件 | `/srv/myapp/.env` | myapp | 600 | `systemctl restart myapp`（改环境变量必须重启，reload 不生效） |
| systemd 覆盖配置 | `/etc/systemd/system/myapp.service.d/limits.conf` | root | 644 | `systemctl daemon-reload`，再 `systemctl restart myapp` |

## 12. 每个关键配置项的解释

### 12.1 PHP-FPM 池配置项

| 配置项 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `user` / `group` | worker 以哪个用户跑 | 用 root 跑，PHP 脚本被攻破就是 root 权限 |
| `listen` | Nginx 连过来的地址，本篇用套接字文件 | 路径与 Nginx 的 `fastcgi_pass` 对不上，Nginx 报 502 |
| `listen.owner` / `listen.group` / `listen.mode` | 套接字文件的属主与权限 | Nginx 用户（www-data）读不到套接字，Nginx 报 502 |
| `pm` | 进程模式，见第 9.3 节 | 流量极低的站用 static，白白占内存 |
| `pm.max_children` | 最多同时跑几个 worker | 太小，高峰时请求排队；太大，内存被吃光、机器开始 swap |
| `pm.start_servers` / `pm.min_spare_servers` / `pm.max_spare_servers` | dynamic 模式的空闲 worker 数量区间 | 空闲太少，突发流量要现起进程，首批请求变慢 |
| `pm.max_requests` | worker 处理满多少个请求后自动退出重起 | 不设，内存泄漏的 worker 会一直占着内存 |
| `pm.status_path` | 状态页路径，配合 Nginx 的 location 才能访问 | 对外公开了状态页，等于把池的实时状态告诉所有人，必须限制访问来源，见第 17 节 |
| `slowlog` / `request_slowlog_timeout` | 慢请求的调用栈记到哪个文件、超过几秒算慢 | 不开，慢接口只能靠猜 |
| `clear_env` | 是否清空 worker 的环境变量 | 设为 `yes`（默认值）时，systemd 传给 PHP-FPM 的环境变量不会进 worker，应用读不到 `.env` 之外的值；本篇设为 `no`，并配合 `env[变量名]` 逐个传变量的做法二选一，不要两个都写 |

### 12.2 systemd 单元配置项

| 配置项 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `After = network.target` | 等网络起来再启动 | 网络没好就启动，应用连数据库失败、直接退出 |
| `Type = simple` | 主进程就是 `ExecStart` 起的那个进程 | 用 `forking` 但程序本身不 fork，systemd 以为服务死了 |
| `User` / `Group` | 以哪个用户跑 | 用 root 跑，应用被攻破就是 root 权限 |
| `WorkingDirectory` | 进程的工作目录，相对路径都以它为准 | 不写，相对路径的日志、上传目录会写到奇怪的地方 |
| `ExecStart` | 启动命令，必须写绝对路径 | 写 `node app.js` 而不是 `/usr/bin/node /srv/myapp/app.js`，systemd 找不到命令 |
| `EnvironmentFile` | 环境变量文件路径 | 路径错了，服务起不来，日志里是 `Failed to load environment files` |
| `Restart = on-failure` | 非正常退出时自动重启 | 写 `always`，连正常退出（例如主动停服务）都会被拉起来，停不掉 |
| `RestartSec` | 崩溃后等几秒再重启 | 不设，崩溃重启循环会把 CPU 打满 |
| `StandardOutput` / `StandardError` | 日志往哪里记，本篇记进 journal | 记到文件又不轮转，磁盘会被日志写满 |
| `NoNewPrivileges` | 禁止进程提权 | 不设，应用里的提权操作有可乘之机 |
| `PrivateTmp` | 给服务一个独立的 `/tmp` | 不设，服务与别的进程共用 `/tmp`，临时文件可能被互相看到 |
| `LimitNOFILE` | 单个进程能打开的文件数 | 太小，高并发时报 `Too many open files` |
| `MemoryMax` | 内存上限，超了会被杀掉并按重启策略拉起来 | 不设，内存泄漏的应用会把整台机器拖垮 |
| `WantedBy = multi-user.target` | 开机自启挂到哪个目标 | 不写，`systemctl enable` 不知道开机时要不要起这个服务 |

### 12.3 PM2 生态文件配置项

| 配置项 | 含义 | 写错会怎样 |
| --- | --- | --- |
| `name` | 进程名，`pm2 list` 里看到的名字 | 名字撞了，`pm2 restart 名字` 会重启到别人的进程 |
| `script` / `cwd` | 启动文件与工作目录 | `cwd` 不写，相对路径的日志与静态文件会找错地方 |
| `instances` / `exec_mode` | 起几个进程、集群还是单进程 | `instances` 大于 CPU 核数，进程互相抢 CPU，收益为负 |
| `autorestart` | 崩溃自动重启 | 关掉，崩溃后应用就停在那里 |
| `watch` | 文件一变就重启 | 生产环境开着，日志文件一滚动就触发重启 |
| `max_restarts` | 短时间内重启超过这个次数就停下来 | 不设，起不来的应用会无限重启刷屏 |
| `max_memory_restart` | 内存超了自动重启 | 不设，内存泄漏的进程会一直涨 |
| `error_file` / `out_file` | 错误日志与标准输出日志的路径 | 路径的目录不存在，PM2 起不来 |
| `env` | 环境变量，生产值放这里 | 把真实口令写进生态文件又提交到仓库，等于公开口令 |

## 13. 执行结果示例

下面是读者在自己机器上按第 9 节操作后应看到的样子，均为示例输出，实际时间、进程号、内存数字以读者本机为准，不要照抄数字：

```text
$ systemctl is-active php8.4-fpm
active

$ systemctl status myapp
Active: active (running) since Mon 2026-11-03 23:00:00 CST; 5min ago
Main PID: 1234 (node)
Memory: 48.0M (max: 512.0M)

$ curl -s http://127.0.0.1:3000/health
{"status":"ok"}

$ pm2 list
┌────┬──────────┬─────────┬──────┬───────────┐
│ id │ name     │ mode    │ ↺    │ status    │
├────┼──────────┼─────────┼──────┼───────────┤
│ 0  │ myapp    │ cluster │ 0    │ online    │
└────┴──────────┴─────────┴──────┴───────────┘
```

PHP-FPM 慢日志的示例片段（超过 5 秒的请求会被记成这样，里面有完整的调用栈，定位慢接口就从这里的第一行开始看）：

```text
[03-Nov-2026 23:05:00] [pool myapp] pid 2345
script_filename = /srv/myapp/public/index.php
[0x00007f1234567890] sleep() /srv/myapp/app/Slow.php:12
```

## 14. 成功验证

全部做完后，按下面这张清单逐项打勾，有一项不过就不要往下走：

- PHP 路线：`systemctl is-active php8.4-fpm` 是 `active`；浏览器或 `curl` 打开站点首页能出内容，不是 502。
- Node.js 或 Python 路线：`systemctl is-active myapp` 是 `active`；`curl http://127.0.0.1:3000/health`（Node.js）或 `curl http://127.0.0.1:8000/health`（gunicorn）能拿到正常响应。
- 开机自启：`systemctl is-enabled myapp` 是 `enabled`；PM2 路线还要确认 `pm2 startup` 生成的单元已启用，重启机器后 `pm2 list` 里还有 myapp。
- 崩溃自愈：故意杀掉应用进程（`kill 主进程号`），等 5 秒以上，再查服务状态，应已自动拉起来，`journalctl -u myapp` 里能看到重启记录。
- 慢日志：`ls -l /var/log/php8.4-fpm-myapp-slow.log` 文件存在（PHP 路线），并且能说清“超过几秒算慢”这个数字是在哪里设的。
- 权限：`ls -l /srv/myapp/.env` 是 `-rw-------`（600）且属主是 `myapp`，不是 644，也不是 root 属主。
- 配置语法：PHP 路线跑过 `php-fpm8.4 -t` 且输出是成功；systemd 单元跑过 `systemd-analyze verify /etc/systemd/system/myapp.service` 且没有报错（本机没有的路径警告要能说清原因，见第 16 节）。

## 15. 常见错误

| 现象 | 原因 | 办法 |
| --- | --- | --- |
| 打开页面报 502 | Nginx 的 `fastcgi_pass` 路径与 PHP-FPM 池的 `listen` 对不上，或套接字权限不对 | 核对两边的路径与 `listen.owner`、`listen.group`、`listen.mode`，再看 Nginx 错误日志的第一行 |
| 打开页面报 502，但 PHP-FPM 在跑 | 池的 `listen` 写成了 TCP 端口，Nginx 却连套接字（或反过来） | 两边统一成同一种：要么都是套接字，要么都是 `127.0.0.1:9000` |
| `systemctl start myapp` 报 `Failed to load environment files` | `EnvironmentFile` 指向的 `.env` 文件不存在 | 先建文件，再 `daemon-reload`，再 `start` |
| `systemctl start myapp` 报 `Executable path is not absolute` | `ExecStart` 里写了相对路径，例如 `node app.js` | 改成绝对路径，例如 `/usr/bin/node /srv/myapp/app.js` |
| 服务一起就停，`status` 里是 `inactive (dead)` | `Restart = always` 没写、且程序正常退出了一次 | 先看 `journalctl -u myapp` 的最后几行，确认是程序自己退出的还是被杀的，再决定重启策略 |
| 服务反复重启，日志刷屏 | `RestartSec` 没设、且程序一起就崩 | 先把 `Restart` 改成 `on-failure` 并设 `RestartSec = 5`，再去修程序本身的崩溃原因，不要靠重启掩盖 |
| 重启机器后应用没起来 | 只做了 `pm2 start`，没做 `pm2 save` 和 `pm2 startup` | 按第 9.6 节把三步补齐，再重启验证一次 |
| PM2 与 systemd 同时管同一个应用 | 两个管家抢同一个端口，互相重启 | 只留一个管，另一个停掉并 `disable`，见第 6.3 节 |
| 磁盘被日志写满 | 服务日志记到文件又不轮转，或慢日志没上限 | 日志走 journal（systemd 有自动轮转），或给文件日志配 logrotate，见第 16 节 |
| 改了 `.env` 但应用还是旧配置 | 环境变量只在进程启动时读一次，`reload` 不生效 | 改 `.env` 后必须 `restart` 服务 |

## 16. 故障排查

按下面这个顺序查，不要跳着查：

1. 先看服务在不在：`systemctl status myapp` 与 `systemctl status php8.4-fpm`，`active (running)` 才算在跑，`failed` 就看下一行给出的日志提示。
2. 再看日志的最后 50 行：`journalctl -u myapp -n 50 --no-pager`，先看最后一行，再往上找第一个报错，不要从头读几百行。
3. 502 分两种：Nginx 错误日志里是 `connect() to unix:/run/php/php8.4-fpm-myapp.sock failed`，说明 PHP-FPM 没跑或套接字路径、权限不对；是 `upstream timed out`，说明 PHP-FPM 在跑但请求太慢，查慢日志与数据库。
4. `systemd-analyze verify /etc/systemd/system/myapp.service` 报“路径不存在”类警告时，先确认警告里说的是哪个路径：如果是不存在的应用路径（例如本机没有 `/srv/myapp/app.js`），那是环境问题，不是单元语法问题；如果警告说的是段落名或键名拼错，那就是单元文件本身要改。
5. 慢接口定位：先看慢日志文件里有没有新记录，有就按调用栈的第一行找代码；没有就确认 `request_slowlog_timeout` 是不是设得太大，或者请求根本没走到 PHP（例如被 Nginx 缓存挡住了）。
6. 内存问题定位：`systemctl status myapp` 里的 `Memory` 一行看当前占用，`journalctl -u myapp` 里搜 `killed` 或 `MemoryMax`，确认是不是被资源限制杀掉的；是的话先放宽限制、再修内存泄漏，不要只放宽限制。
7. 日志轮转：journal 的占用用 `journalctl --disk-usage` 看，超了用 `journalctl --vacuum-size=500M` 清理；文件日志用 logrotate 配，配完跑 `logrotate -d /etc/logrotate.d/自己的配置` 看调试输出，不要直接等它半夜跑。

## 17. 安全注意事项

- 应用绝不要用 root 跑，运行用户只给应用目录与日志目录的写权限，其他目录只读或不可见。
- PHP-FPM 池的 `listen.mode` 不要写成 `0666`，任何用户都能连套接字，等于把 PHP 执行权交给全机器；`0660` 加 `www-data` 组就够了。
- `pm.status_path` 的状态页不要对外公开，Nginx 里只允许本机或内网 IP 访问，公开的状态页会暴露池的实时负载与慢请求情况。
- `.env` 文件权限 600、属主运行用户，且不要提交到 Git 仓库，仓库里只放一份 `.env.example`（只有键名、没有真实值），部署时在服务器上手工建 `.env`。
- systemd 的 `NoNewPrivileges = true` 与 `PrivateTmp = true` 不要图省事删掉，它们是防止应用被攻破后进一步提权或偷看别进程临时文件的底线。
- PM2 的 `watch` 在生产环境必须关掉，否则日志文件一滚动、上传目录一有新文件就触发重启，等于给攻击者一个“写文件就能重启你应用”的口子。
- 备份配置文件之前先确认备份文件本身的权限，池配置与单元文件的备份不要留在 Web 目录下，否则可能被浏览器直接下载到。

## 18. 回滚和恢复

改任何配置文件之前，先备份原文件，备份文件与原文件放同一个目录、后缀 `.bak` 加日期，例如：

```bash
sudo cp /etc/php/8.4/fpm/pool.d/myapp.conf /etc/php/8.4/fpm/pool.d/myapp.conf.bak-20261103
sudo cp /etc/systemd/system/myapp.service /etc/systemd/system/myapp.service.bak-20261103
```

回滚的固定流程是：

1. 把备份文件拷回原路径。
2. PHP-FPM 改动：跑 `php-fpm8.4 -t`，通过后再 `systemctl reload php8.4-fpm`。
3. systemd 改动：跑 `systemctl daemon-reload`，再 `systemctl restart myapp`。
4. 跑一遍第 14 节的验证清单，首页与接口都正常才算回滚完成。
5. 恢复演练的红线：没有演练过的备份等于没有备份。备份脚本跑通一次不算，要在测试目录里把备份恢复出来、服务能起来才算，恢复演练的完整流程是 DB-02 的范围，本篇只要求“改配置前有备份、回滚后有验证”这两步。

## 19. 延伸阅读

- PHP 官方文档：PHP-FPM 配置（php.net 上的安装与配置章节，池指令以官网为准）。
- systemd 官方文档：`systemd.service` 与 `systemd.exec` 手册页（`man systemd.service`、`man systemd.exec`），单元指令以手册页为准。
- PM2 官方文档：生态文件与 `startup`、`save` 命令（pm2.keymetrics.io 上的文档）。
- gunicorn 官方文档：配置与 worker 模型（docs.gunicorn.org）。
- Nginx 官方文档：`fastcgi_pass` 与 `proxy_pass` 的区别（nginx.org 上的文档）。
- 本指南的相关章节见第 20 节，部署流水线见 DEPLOY 篇（待开始）。

## 20. 相关章节链接

- PHP 框架：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](../backend/01-php.md)。
- Node.js 框架：[BE-03 Node.js 框架：Express、NestJS、Fastify](../backend/03-nodejs.md)。
- 架构总览：[ARCH-01 网站完整架构总览](../architecture/01-overview.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 下一篇：[DEPLOY-01 Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署](../deploy/01-cicd.md)。
