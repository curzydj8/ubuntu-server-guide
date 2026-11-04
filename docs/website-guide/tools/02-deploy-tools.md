# TOOL-02：建站工具 2：Docker Compose、systemd、备份脚本、部署检查清单生成器

> 任务编号：TOOL-02（网站建设与部署实战指南 · 建站工具第 2 篇）
> 上一篇：[TOOL-01 建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器](01-config-generators.md)；下一篇：[TOOL-03 建站工具 3：SSL 到期计算器、DNS 检查、HTTPS/安全/上线前检查工具](03-checkers.md)。
> 本篇是工具篇，不是概念复述：四件工具每件都给出读者能直接跑的完整生成器，输入几个参数就能输出完整文件。编排与单元模板引用 DEPLOY-02 与 SRV-02，备份做法引用 DB-02，上线清单引用 DEPLOY-03，本篇不重讲这些原理，只讲每件工具怎么用、生成的每项是什么意思、错了怎么查。

## 1. 本章目标

读完并动手做完本篇，你能：

- 用一个脚本生成一份能直接用的 docker-compose.yml，不用每次手写服务、网络与卷；
- 用一个脚本生成一份能直接用的 systemd 单元文件，应用换名字、换用户、换启动命令都能生成；
- 用一个脚本生成一份能直接跑的备份脚本，备份对象、保留天数、数据库类型都由参数定；
- 用一个脚本生成一份可打印的上线前核对清单，站点类型不同，清单内容也不同；
- 看懂生成结果里的每一项，知道哪项改错了会出什么问题。

## 2. 适用人群

- 已经按 DEPLOY-02 搭过一次 Docker 平台、按 SRV-02 写过一次 systemd 单元的读者：本篇把重复劳动变成工具；
- 手头不止一个站、每次上线都要重写一遍配置的读者：生成器保证每个站的格式一致，少抄错；
- 刚学完前面章节、想把“会配”变成“配得快、配得对”的读者。

如果你还没有搭过任何一个站，先读 DEPLOY-02、SRV-02、DB-02、DEPLOY-03，再回来看本篇，工具才用得顺。

## 3. 适用系统和版本

- 生成器本身：Python 3.8 及以上，标准库，不联网，不依赖任何第三方包；Ubuntu 22.04、24.04 及以上自带的 Python 3 都能跑；
- 生成的 Compose 文件：Docker Compose v2（`docker compose` 命令，Ubuntu 24.04 及以上仓库自带）；
- 生成的 systemd 单元：systemd 249 及以上（Ubuntu 22.04、24.04 均满足）；
- 生成的备份脚本：bash 5.x，mysqldump（MySQL 8.0、8.4）或 pg_dump（PostgreSQL 14、16）二选一；
- 生成的核对清单：Markdown 文本，任何编辑器与打印工具都能打开。

版本说明：生成器里写死的镜像标签（nginx:alpine、mysql:8.4、postgres:16、redis:7-alpine）是写本篇时核对过的可用标签；读者生成后如果想换更新的标签，改 `--db` 与 `--cache` 对应的镜像行即可，做法见第 12 节。

## 4. 使用前提

- 一台能跑命令的机器：自己的服务器，或者本地 Ubuntu；
- 已经有一个站点的目录结构概念：知道自己的应用放在哪个目录、数据库是哪种、要不要缓存；
- 知道自己站点的域名：示例用保留域名 example.com，读者换成自己的域名；
- 生成器输出的是文件内容，不是自动部署：生成后仍需读者自己把文件放到正确位置、跑验证命令（第 14 节）。

## 5. 所需资源

- 生成器脚本一个文件：`gen_tools.py`，放在哪里都行，建议放在站点工程的 `tools/` 目录；
- 生成结果的四个去向：Compose 文件放站点根目录、systemd 单元放 `/etc/systemd/system/`、备份脚本放 `/opt/mysite/` 一类固定位置并加可执行权限、核对清单打印或存为 Markdown；
- 凭据文件两个（生成器不生成凭据，只引用）：应用环境文件（如 `/etc/mysite/app.env`）、备份凭据文件（如 `/etc/mysite/backup.env`），权限 600，绝不进仓库。

## 6. 技术原理

四件工具共用一个思路：把“每次都要填、每次都容易填错”的部分变成参数，把“每次都应该一样”的部分写死在模板里。

- Compose 生成器：服务、网络、卷三层分开生成。入口服务（Nginx）是唯一发布主机端口的服务；应用服务只在内部网络可见；数据库与缓存不映射主机端口，且后端网络设为 `internal: true`，容器之间能互访、外网进不来。这正是 DEPLOY-02 里讲过的编排原则，本篇把它固化成默认值，读者改参数也改不坏这一条。
- systemd 生成器：单元文件只有三段：`[Unit]` 说明依赖，`[Service]` 说明怎么跑，`[Install]` 说明开机要不要自启。生成器保证三段齐全、关键键名一个不少，读者只填名字、用户、目录、启动命令。
- 备份生成器：备份分四步走：打包代码、导出数据库、打包上传文件、清理过期文件。数据库凭据不写进脚本，只从凭据文件读，这是 DB-02 里讲过的凭据做法。
- 清单生成器：清单不是通用模板照抄，而是按站点类型拼：静态站没有数据库项，WordPress 有主题插件项，Docker 站有镜像标签与卷项。DEPLOY-03 的上线检查清单是内容来源，本篇把它变成可生成的版本。

## 7. 架构说明

### 7.1 四件工具的分工

| 工具 | 输入 | 输出 | 解决的问题 |
| --- | --- | --- | --- |
| Compose 生成器 | 域名、项目名、应用类型、数据库、缓存 | docker-compose.yml | 每次手写编排容易漏网络、漏卷、错把数据库端口映射到主机 |
| systemd 生成器 | 服务名、用户、目录、启动命令、应用类型 | 单元文件 | 手写单元容易漏段、漏重启策略、漏开机自启 |
| 备份脚本生成器 | 备份目录、保留天数、备份对象、数据库类型 | 备份脚本 | 手写备份容易漏清理过期文件、把口令写进脚本 |
| 清单生成器 | 站点类型 | Markdown 核对清单 | 上线靠记忆，容易漏项，上线后才发现证书、备份没配 |

### 7.2 生成器的结构

一个 Python 脚本、四个子命令，共用一套参数解析：

- `compose`：生成 Compose 文件；
- `systemd`：生成 systemd 单元；
- `backup`：生成备份脚本；
- `checklist`：生成核对清单。

每个子命令只做一件事：读参数、拼模板、把结果打印到标准输出。读者用重定向把结果存成文件，生成器本身不替读者写系统目录，这样生成结果先经过读者的眼睛再落盘，出问题也容易发现。

### 7.3 生成结果与手工配置的关系

生成器不是要取代读者理解配置：生成结果里的每一项，第 12 节都有解释。读者第一次用时应该逐项对照第 12 节读一遍，确认生成结果符合自己站点的实际情况，再上线。生成器保证格式正确，不保证业务正确：比如应用的内部端口、数据库名、上传目录，仍需读者自己核对。

## 8. 操作前检查

动手前逐项确认，缺一项先补齐再往下做：

1. 本机或服务器上有 Python 3：跑 `python3 --version`，能输出 3.8 以上的版本号；
2. 已经读过 DEPLOY-02、SRV-02、DB-02、DEPLOY-03，知道 Compose、systemd、备份、上线清单各自的基本概念；
3. 已经定好自己站点的四件事：域名、应用类型、数据库类型、要不要缓存；
4. 已经准备好两个凭据文件的位置与权限做法：应用环境文件与备份凭据文件，权限 600，不进仓库；
5. 生成结果的四个落盘位置已经想好：Compose 放站点根目录，单元放 `/etc/systemd/system/`，备份脚本放固定目录并加可执行权限，清单存为 Markdown。

## 9. 逐步操作

### 9.1 工具一：生成 Compose 文件

1. 把第 10 节的 `gen_tools.py` 存到站点工程的 `tools/` 目录；
2. 按自己站点选参数，跑生成命令，例如 Node.js 应用加 PostgreSQL 加 Redis：
3. 把输出存为站点根目录的 `docker-compose.yml`；
4. 检查输出里的四件事：只有 web 服务有 `ports`，数据库与缓存没有；后端网络是 `internal: true`；卷名带项目名前缀；应用服务的 `expose` 端口与自己应用的监听端口一致；
5. 再按第 14 节做上线前验证，`docker compose config` 能通过才算格式合格。

### 9.2 工具二：生成 systemd 单元

1. 按自己应用填服务名、用户、目录、启动命令，跑生成命令；
2. 把输出存为 `/etc/systemd/system/` 下以服务名命名的 `.service` 文件；
3. 跑 `systemd-analyze verify` 检查单元格式；
4. 再跑 `systemctl enable` 与 `systemctl start`，这是读者在自己服务器上的步骤，本篇不替读者跑。

### 9.3 工具三：生成备份脚本

1. 按备份目录、保留天数、备份对象、数据库类型跑生成命令；
2. 把输出存为固定位置的 `.sh` 文件，加可执行权限；
3. 先准备好凭据文件 `/etc/mysite/backup.env`，权限 600，里面写数据库用户、口令、库名；
4. 手动跑一次备份脚本，确认备份文件生成、过期清理逻辑无误，再配定时任务。

### 9.4 工具四：生成核对清单

1. 按站点类型跑生成命令，把输出存为 Markdown 文件；
2. 打印出来或在编辑器里打开，上线前逐项打勾；
3. 任何一项未通过都不上线，先修好再继续；
4. 清单最后的回滚预案项也要打勾：出问题先切回上一版，再查原因。

## 10. 完整代码

下面是完整的生成器脚本，存为 `tools/gen_tools.py`，直接能跑。四个子命令的用法见脚本开头的注释。注意：脚本只生成文件内容，不替读者写系统目录、不替读者启动服务。

```python
#!/usr/bin/env python3
"""gen_tools.py：建站部署工具生成器，四件工具各一个子命令。

用法示例（都在读者自己的服务器上跑，输出打印到标准输出）：
  python3 gen_tools.py compose --domain example.com --app node --db postgres --cache redis --project mysite
  python3 gen_tools.py systemd --name mysite --user www-data --workdir /srv/www/mysite --exec "/usr/bin/node /srv/www/mysite/server.js"
  python3 gen_tools.py backup --dest /var/backups/mysite --retention 14 --targets code,db,files --db-type postgres
  python3 gen_tools.py checklist --site-type docker
只依赖 Python 3 标准库，不联网，不写任何真实口令。
"""
import argparse
import sys

APP_PORTS = {"node": 3000, "python": 8000, "go": 8080, "php": 9000}
APP_DESCS = {
    "node": "Node.js 应用",
    "python": "Python 应用",
    "go": "Go API 服务",
    "php": "PHP 应用",
}


def compose(args):
    lines = []
    lines.append("services:")
    lines.append("  web:")
    lines.append("    image: nginx:alpine")
    lines.append("    container_name: " + args.project + "-web")
    lines.append("    restart: unless-stopped")
    lines.append("    ports:")
    lines.append('      - "80:80"')
    lines.append('      - "443:443"')
    lines.append("    volumes:")
    lines.append("      - ./nginx/" + args.domain + ".conf:/etc/nginx/conf.d/default.conf:ro")
    lines.append("      - " + args.project + "_certs:/etc/nginx/certs:ro")
    lines.append("    networks:")
    lines.append("      - frontend")
    if args.app != "none":
        lines.append("  app:")
        lines.append("    build: ./app")
        lines.append("    container_name: " + args.project + "-app")
        lines.append("    restart: unless-stopped")
        lines.append("    expose:")
        lines.append('      - "' + str(APP_PORTS[args.app]) + '"')
        lines.append("    env_file:")
        lines.append("      - .env")
        lines.append("    networks:")
        lines.append("      - frontend")
        lines.append("      - backend")
    if args.db == "mysql":
        lines.append("  db:")
        lines.append("    image: mysql:8.4")
        lines.append("    container_name: " + args.project + "-db")
        lines.append("    restart: unless-stopped")
        lines.append("    env_file:")
        lines.append("      - .env")
        lines.append("    volumes:")
        lines.append("      - " + args.project + "_dbdata:/var/lib/mysql")
        lines.append("    networks:")
        lines.append("      - backend")
    elif args.db == "postgres":
        lines.append("  db:")
        lines.append("    image: postgres:16")
        lines.append("    container_name: " + args.project + "-db")
        lines.append("    restart: unless-stopped")
        lines.append("    env_file:")
        lines.append("      - .env")
        lines.append("    volumes:")
        lines.append("      - " + args.project + "_dbdata:/var/lib/postgresql/data")
        lines.append("    networks:")
        lines.append("      - backend")
    if args.cache == "redis":
        lines.append("  cache:")
        lines.append("    image: redis:7-alpine")
        lines.append("    container_name: " + args.project + "-cache")
        lines.append("    restart: unless-stopped")
        lines.append('    command: redis-server --appendonly yes --requirepass "${REDIS_PASSWORD}"')
        lines.append("    volumes:")
        lines.append("      - " + args.project + "_redisdata:/data")
        lines.append("    networks:")
        lines.append("      - backend")
    lines.append("networks:")
    lines.append("  frontend:")
    lines.append("  backend:")
    lines.append("    internal: true")
    lines.append("volumes:")
    lines.append("  " + args.project + "_certs:")
    if args.db != "none":
        lines.append("  " + args.project + "_dbdata:")
    if args.cache == "redis":
        lines.append("  " + args.project + "_redisdata:")
    return "\n".join(lines) + "\n"


def systemd(args):
    desc = APP_DESCS.get(args.type, "网站应用")
    out = []
    out.append("[Unit]")
    out.append("Description=" + desc + " " + args.name)
    out.append("After=network.target")
    out.append("")
    out.append("[Service]")
    out.append("Type=simple")
    out.append("User=" + args.user)
    out.append("Group=" + args.user)
    out.append("WorkingDirectory=" + args.workdir)
    out.append("EnvironmentFile=" + args.env_file)
    out.append("ExecStart=" + args.exec)
    out.append("Restart=on-failure")
    out.append("RestartSec=5")
    out.append("NoNewPrivileges=true")
    out.append("PrivateTmp=true")
    out.append("")
    out.append("[Install]")
    out.append("WantedBy=multi-user.target")
    return "\n".join(out) + "\n"


def backup(args):
    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    out = []
    out.append("#!/bin/bash")
    out.append("# 备份脚本：由 gen_tools.py backup 生成，读者按自己服务器改路径与凭据文件。")
    out.append("set -euo pipefail")
    out.append("")
    out.append("BACKUP_DIR=" + args.dest)
    out.append("RETENTION=" + str(args.retention))
    out.append('DATE="$(date +%F-%H%M)"')
    out.append('mkdir -p "$BACKUP_DIR"')
    out.append("")
    if "code" in targets:
        out.append("# 1. 网站代码与配置（路径换成读者自己的站目录）")
        out.append('tar -czf "$BACKUP_DIR/code-$DATE.tar.gz" -C /srv/www example')
        out.append("")
    if "db" in targets:
        out.append("# 2. 数据库（凭据只从凭据文件读，不写进脚本）")
        out.append("set -a")
        out.append("source /etc/mysite/backup.env")
        out.append("set +a")
        if args.db_type == "mysql":
            out.append('mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_DIR/db-$DATE.sql"')
        elif args.db_type == "postgres":
            out.append('PGPASSWORD="$DB_PASSWORD" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_DIR/db-$DATE.sql"')
        out.append('gzip "$BACKUP_DIR/db-$DATE.sql"')
        out.append("")
    if "files" in targets:
        out.append("# 3. 用户上传文件（路径换成读者自己的上传目录）")
        out.append('tar -czf "$BACKUP_DIR/files-$DATE.tar.gz" -C /srv/www/example uploads')
        out.append("")
    out.append("# 4. 清理过期备份，只保留最近 RETENTION 天")
    out.append('find "$BACKUP_DIR" -type f -mtime +"$RETENTION" -delete')
    out.append('echo "backup done: $DATE"')
    return "\n".join(out) + "\n"


CHECKLISTS = {
    "static": ["域名解析已生效，A 记录指向服务器", "Nginx 配置通过 nginx -t", "HTTPS 证书已签发且自动续期已配", "首页与内页返回 200，静态资源带缓存头", "robots 与 sitemap 已放站根", "整站备份已跑通一次"],
    "wordpress": ["域名解析已生效，A 记录指向服务器", "Nginx 配置通过 nginx -t", "HTTPS 证书已签发且自动续期已配", "数据库已建库建用户，wp-config 凭据已换成真实值", "主题与插件均为官方来源且已更新到最新", "登录限流与备份定时任务已配", "整站备份已跑通一次"],
    "python": ["域名解析已生效，A 记录指向服务器", "Nginx 配置通过 nginx -t", "HTTPS 证书已签发且自动续期已配", "systemd 单元已 enable，开机自启已验证", "应用只绑回环地址，对外只走 Nginx", "静态文件与数据库连接已验证", "整站备份已跑通一次"],
    "node": ["域名解析已生效，A 记录指向服务器", "Nginx 配置通过 nginx -t", "HTTPS 证书已签发且自动续期已配", "PM2 或 systemd 已设开机自启，重启后仍在跑", "应用只绑回环地址，对外只走 Nginx", "环境变量文件权限 600 且未进仓库", "整站备份已跑通一次"],
    "docker": ["域名解析已生效，A 记录指向服务器", "Compose 文件中数据库与缓存没有映射主机端口", "镜像已打固定标签，latest 未用于生产", "数据卷已确认挂载路径，重启后数据仍在", "HTTPS 证书已签发且自动续期已配", "备份脚本已跑通一次且恢复演练已做", "回滚命令已写好，一条命令能切回上一版"],
}


def checklist(args):
    items = CHECKLISTS[args.site_type]
    out = []
    out.append("# 上线前核对清单（站点类型：" + args.site_type + "）")
    out.append("")
    out.append("核对方法：逐项打勾，任何一项未通过都不上线。")
    out.append("")
    for i, item in enumerate(items, 1):
        out.append("- [ ] " + str(i) + ". " + item)
    out.append("")
    out.append("- [ ] 回滚预案已写好：出问题先切回上一版，再查原因。")
    return "\n".join(out) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description="建站部署工具生成器")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("compose", help="生成 docker-compose.yml")
    p.add_argument("--domain", required=True)
    p.add_argument("--project", default="mysite")
    p.add_argument("--app", default="node", choices=["none", "node", "python", "go", "php"])
    p.add_argument("--db", default="none", choices=["none", "mysql", "postgres"])
    p.add_argument("--cache", default="none", choices=["none", "redis"])
    p = sub.add_parser("systemd", help="生成 systemd 单元文件")
    p.add_argument("--name", required=True)
    p.add_argument("--user", default="www-data")
    p.add_argument("--workdir", required=True)
    p.add_argument("--exec", required=True)
    p.add_argument("--env-file", default="/etc/mysite/app.env")
    p.add_argument("--type", default="node", choices=["node", "python", "go", "php"])
    p = sub.add_parser("backup", help="生成备份脚本")
    p.add_argument("--dest", required=True)
    p.add_argument("--retention", type=int, default=14)
    p.add_argument("--targets", default="code,db,files")
    p.add_argument("--db-type", default="postgres", choices=["mysql", "postgres", "none"])
    p = sub.add_parser("checklist", help="生成上线前核对清单")
    p.add_argument("--site-type", default="docker",
                   choices=["static", "wordpress", "python", "node", "docker"])
    args = parser.parse_args(argv)
    if args.cmd == "compose":
        sys.stdout.write(compose(args))
    elif args.cmd == "systemd":
        sys.stdout.write(systemd(args))
    elif args.cmd == "backup":
        sys.stdout.write(backup(args))
    elif args.cmd == "checklist":
        sys.stdout.write(checklist(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```


## 11. 完整配置文件（注明存放路径）

下面四份是第 10 节生成器用同一组示例参数真实跑出来的输出，原样贴出，读者换参数就能得到自己的版本。示例参数：域名 example.com、项目名 mysite、应用 Node.js、数据库 PostgreSQL、缓存 Redis；systemd 服务名 mysite、用户 www-data、目录 /srv/www/mysite；备份目录 /var/backups/mysite、保留 14 天、备份对象代码加数据库加上传文件；清单站点类型 docker。

### 11.1 Compose 文件：站点根目录的 docker-compose.yml

```yaml
services:
  web:
    image: nginx:alpine
    container_name: mysite-web
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/example.com.conf:/etc/nginx/conf.d/default.conf:ro
      - mysite_certs:/etc/nginx/certs:ro
    networks:
      - frontend
  app:
    build: ./app
    container_name: mysite-app
    restart: unless-stopped
    expose:
      - "3000"
    env_file:
      - .env
    networks:
      - frontend
      - backend
  db:
    image: postgres:16
    container_name: mysite-db
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - mysite_dbdata:/var/lib/postgresql/data
    networks:
      - backend
  cache:
    image: redis:7-alpine
    container_name: mysite-cache
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass "${REDIS_PASSWORD}"
    volumes:
      - mysite_redisdata:/data
    networks:
      - backend
networks:
  frontend:
  backend:
    internal: true
volumes:
  mysite_certs:
  mysite_dbdata:
  mysite_redisdata:
```

### 11.2 systemd 单元：/etc/systemd/system/mysite.service

```ini
[Unit]
Description=Node.js 应用 mysite
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/srv/www/mysite
EnvironmentFile=/etc/mysite/app.env
ExecStart=/usr/bin/node /srv/www/mysite/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 11.3 备份脚本：/opt/mysite/backup.sh（加可执行权限后用）

```bash
#!/bin/bash
# 备份脚本：由 gen_tools.py backup 生成，读者按自己服务器改路径与凭据文件。
set -euo pipefail

BACKUP_DIR=/var/backups/mysite
RETENTION=14
DATE="$(date +%F-%H%M)"
mkdir -p "$BACKUP_DIR"

# 1. 网站代码与配置（路径换成读者自己的站目录）
tar -czf "$BACKUP_DIR/code-$DATE.tar.gz" -C /srv/www example

# 2. 数据库（凭据只从凭据文件读，不写进脚本）
set -a
source /etc/mysite/backup.env
set +a
PGPASSWORD="$DB_PASSWORD" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_DIR/db-$DATE.sql"
gzip "$BACKUP_DIR/db-$DATE.sql"

# 3. 用户上传文件（路径换成读者自己的上传目录）
tar -czf "$BACKUP_DIR/files-$DATE.tar.gz" -C /srv/www/example uploads

# 4. 清理过期备份，只保留最近 RETENTION 天
find "$BACKUP_DIR" -type f -mtime +"$RETENTION" -delete
echo "backup done: $DATE"
```

### 11.4 核对清单：站点根目录的 launch-checklist.md

```markdown
# 上线前核对清单（站点类型：docker）

核对方法：逐项打勾，任何一项未通过都不上线。

- [ ] 1. 域名解析已生效，A 记录指向服务器
- [ ] 2. Compose 文件中数据库与缓存没有映射主机端口
- [ ] 3. 镜像已打固定标签，latest 未用于生产
- [ ] 4. 数据卷已确认挂载路径，重启后数据仍在
- [ ] 5. HTTPS 证书已签发且自动续期已配
- [ ] 6. 备份脚本已跑通一次且恢复演练已做
- [ ] 7. 回滚命令已写好，一条命令能切回上一版

- [ ] 回滚预案已写好：出问题先切回上一版，再查原因。
```

### 11.5 凭据文件：只给格式，不给真实值

应用环境文件 `/etc/mysite/app.env` 与备份凭据文件 `/etc/mysite/backup.env`，权限 600，内容格式如下，值由读者自己填，绝不要把填好真实值的版本放进仓库或贴到任何公开地方：

```ini
DB_USER=请填数据库用户
DB_PASSWORD=请填数据库口令
DB_NAME=请填数据库名
REDIS_PASSWORD=请填缓存口令
```

## 12. 每个关键配置项的解释

### 12.1 Compose 文件的关键项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| web 服务的 ports 80:80、443:443 | 唯一对外发布端口的服务，访客流量只从这里进 | 别的服务也加了 ports，数据库或缓存就直接暴露到外网 |
| app 服务的 expose 3000 | 只在容器网络内声明端口，不发布到主机；3000 是 Node.js 的默认值，Python 换 8000、Go 换 8080、PHP 换 9000 | Nginx 代理的目标端口与应用监听端口不一致，访客看到 502 |
| app 服务的 build: ./app | 应用镜像从站点下的 app 目录现场构建，不是拉一个现成镜像 | 目录不对，构建失败，容器起不来 |
| db 与 cache 没有 ports 项 | 数据库与缓存不映射主机端口，只能走内部网络访问 | 加了 ports，任何人都能直接连数据库试口令 |
| backend 网络的 internal: true | 后端网络不通外网，数据库与缓存出不去 | 漏了这一行，数据库容器仍可能通过别的路径联网 |
| 卷名带项目名前缀 | mysite_dbdata 这类名字不会和别的项目撞名 | 不带前缀，两个项目共用一个卷，数据互相覆盖 |
| env_file: .env | 凭据从环境文件读，不写进 Compose 文件 | 凭据写进 Compose 文件又进了仓库，等于公开 |

### 12.2 systemd 单元的关键项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| After=network.target | 网络就绪后再启动应用 | 应用启动时网络未就绪，监听或建连失败 |
| User 与 Group | 应用以哪个系统用户跑，不要用 root | 用 root 跑，应用漏洞等于整机权限 |
| WorkingDirectory | 应用的工作目录，相对路径都以它为准 | 目录不对，应用找不到配置文件或静态文件 |
| EnvironmentFile | 环境变量从文件读，凭据不写进单元 | 凭据写进单元，任何能读单元的人都能看到 |
| ExecStart | 启动命令，必须写绝对路径 | 写相对路径，systemd 找不到命令，服务起不来 |
| Restart=on-failure 与 RestartSec=5 | 异常退出后 5 秒自动重启 | 漏了这一行，应用一崩就一直停着，直到有人手动发现 |
| WantedBy=multi-user.target | systemctl enable 后开机自启 | 漏了这一段，enable 不生效，重启后服务不在 |

### 12.3 备份脚本的关键项

| 配置项 | 含义 | 写错的后果 |
| --- | --- | --- |
| set -euo pipefail | 任一步失败就停，不继续往下跑 | 漏了它，数据库导出失败了脚本还继续，最后留下一个不完整的备份集 |
| 凭据只从 backup.env 读 | 口令不出现在脚本正文 | 口令写进脚本，脚本一备份、一传阅就等于公开 |
| DATE 带到小时分钟 | 同一天多次备份不会互相覆盖 | 只精确到天，一天跑两次，第二次覆盖第一次 |
| find -mtime +保留天数 -delete | 自动清理过期备份，磁盘不会被备份撑满 | 漏了清理，备份越积越多，最后磁盘满导致站点先停 |
| tar 的 -C 与目录分开写 | 打包时只包目录内容，不把绝对路径打进去 | 直接打包绝对路径，恢复时解压位置不对 |

### 12.4 核对清单的关键项

清单里的每一项都对应一个真实教训：域名未生效就上线，访客看到的是别人的站或解析失败；证书未配自动续期，三个月后证书过期站点变不安全；备份没跑通过一次，等于没有备份；回滚命令没写好，出问题时现想办法最容易再出问题。清单的最后一项回滚预案不是凑数：上线前就要写好切回上一版的命令，上线后出问题先切回，再查原因。

## 13. 执行结果示例

下面是本篇写作用的真实运行结果，不是编出来的：生成器脚本先过 `python3 -m py_compile`，再用同一组示例参数跑四遍，四个输出逐项核对。读者在自己机器上跑同样的命令，应该得到同样的结构（服务名、端口、键名一致，域名与项目名随参数变）。

### 13.1 生成器脚本本身

```text
python3 -m py_compile gen_tools.py
PYCOMPILE_OK
```

### 13.2 Compose 生成结果的核对

```text
services: ['app', 'cache', 'db', 'web']
web ports: ['80:80', '443:443'] expose: None
app ports: None expose: ['3000']
db ports: None expose: None
cache ports: None expose: None
backend internal: True
```

解读：四个服务齐全；只有 web 发布了主机端口；应用只在内部网络声明 3000 端口；数据库与缓存都没有主机端口；后端网络确为内部网络。

### 13.3 systemd 生成结果的核对

```text
[Unit]
[Service]
User=www-data
WorkingDirectory=/srv/www/mysite
ExecStart=/usr/bin/node /srv/www/mysite/server.js
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

解读：三段齐全，用户、目录、启动命令、重启策略、开机自启目标全部在位。

### 13.4 备份脚本与清单的核对

```text
bash -n out-backup.sh
BASH_N_OK
checklist items: 8
```

解读：生成的备份脚本通过 bash 语法检查；生成的清单共 8 个打勾项（7 条站点检查加 1 条回滚预案），与第 11.4 节贴出的清单一致。

## 14. 成功验证

读者在自己服务器上按顺序验证，全部通过才算工具可用：

1. 生成器脚本能过 `python3 -m py_compile gen_tools.py`；
2. 四个子命令各跑一遍，输出与第 11 节的结构一致（服务名、端口、键名、清单项数）；
3. 生成的 Compose 文件跑 `docker compose config`，格式检查通过；
4. 生成的 systemd 单元跑 `systemd-analyze verify`，格式检查通过；
5. 生成的备份脚本跑 `bash -n`，语法检查通过；
6. 手动跑一次备份脚本，确认备份目录里出现代码包、数据库导出、上传文件包三类文件；
7. 清单逐项打勾，全部通过再上线；
8. 上线后重启一次服务器（或重启一次服务），确认应用、数据库、缓存都自己恢复，不用手动补救。

注意：第 3、4、6、8 步需要在读者自己的服务器上做，本篇没有在本机起真实容器或真实服务，`docker compose up` 与 `systemctl start` 列为读者步骤，不编造运行记录。

## 15. 常见错误

| 现象 | 原因 | 办法 |
| --- | --- | --- |
| 生成的 Compose 跑 `docker compose config` 报错 | 参数里域名或项目名带了空格、特殊字符 | 项目名只用小写字母、数字、短横线；域名换成真实域名再生成 |
| 应用容器起来了，访客看到 502 | Nginx 代理端口与应用监听端口不一致 | 对照第 12.1 节的端口表：Node.js 3000、Python 8000、Go 8080、PHP 9000，改对再生成 |
| 数据库能从外网直接连上 | 生成后有人手动给数据库加了 ports，或后端网络漏了 internal | 重新生成一份对照，删掉数据库与缓存的 ports，确认后端网络 internal 为 true |
| systemd 服务一启动就退出 | ExecStart 写了相对路径，或 WorkingDirectory 不对 | 启动命令与目录都写绝对路径，跑 `systemctl status` 看报错行 |
| 服务重启后不在了 | 单元漏了 Install 段，或没跑 enable | 确认单元有 WantedBy 行，跑 `systemctl enable` 再重启验证 |
| 备份脚本跑完，备份目录是空的 | 凭据文件路径不对，或数据库导出命令失败被忽略 | 先确认 backup.env 存在且权限 600，再手动跑一次看报错；脚本有 set -e，失败会停，不会静默跳过 |
| 备份越积越多，磁盘满了 | 清理过期文件的 find 命令被删了，或保留天数填得过大 | 恢复 find 清理行，保留天数按磁盘大小定，小站 14 天够用 |
| 清单打勾全过了，上线还是出问题 | 清单只核对了“配了没有”，没核对“跑起来没有” | 清单每项都要动手验证：解析要真解析、证书要真访问、备份要真恢复一次 |

## 16. 故障排查

按“先看生成结果、再看落盘位置、最后看运行日志”的顺序查：

1. 生成结果不对：先看参数，项目名、域名、应用类型、数据库类型有没有填错；参数对了结果一定对，生成器不做任何猜测；
2. 文件放错位置：Compose 不在站点根目录、单元不在 `/etc/systemd/system/`、备份脚本没加可执行权限，都是常见原因；对照第 11 节的存放路径逐一核对；
3. 服务起不来：看 `systemctl status` 与 `docker compose logs`，先看报错的第一行，不要从最后一行往前猜；
4. 备份失败：先看凭据文件在不在、权限对不对，再看数据库导出命令的手动运行结果；
5. 清单项验证不过：回到对应章节（Compose 回 DEPLOY-02，systemd 回 SRV-02，备份回 DB-02，上线回 DEPLOY-03），不要在清单上改字蒙混过关；
6. 生成器本身报错：看报错行的参数名，`--app`、`--db`、`--cache`、`--site-type` 都有固定可选值，填了范围外的值会直接报错，这是正常的参数校验。

## 17. 安全注意事项

- 凭据只进凭据文件：应用环境文件与备份凭据文件权限 600，绝不进仓库、绝不贴到聊天记录与公开地方；生成器本身不生成凭据、不输出凭据；
- 数据库与缓存默认不对外：生成逻辑里数据库与缓存就没有主机端口映射，读者手动加了才是例外，例外要写进自己的运维笔记并说明原因；
- 应用不用 root 跑：systemd 生成器的默认用户是 www-data，读者换成自己的应用专用用户，不要换成 root；
- 备份文件本身要保护：备份目录权限只给管理员与备份用户，备份里有数据库导出，泄露等于数据泄露；异地备份的目的地与保留期见 DB-02 与 OPS-04；
- 清单不是摆设：上线前逐项动手验证，任何一项“应该没问题”都不算通过；
- 生成器不联网、不收集信息：脚本只读命令行参数，不读环境变量里的真实凭据，不向外发任何数据。

## 18. 回滚和恢复

- 生成器改坏了：生成器只打印输出，不直接写系统文件，重新跑一次正确的参数就能得到正确的结果；旧的生成结果删掉重存即可；
- Compose 上线后出问题：切回上一版 Compose 文件，跑 `docker compose up -d`，再查新版的问题；数据卷不要跟着删，删卷等于删数据；
- systemd 单元改坏了：把旧单元文件拷回来，跑 `systemctl daemon-reload` 再启动，确认服务在跑；
- 备份脚本改坏了：备份脚本改坏不影响已有备份，先恢复旧脚本，再修新脚本；恢复数据时先在测试目录解开验证，不要直接覆盖线上目录；
- 清单本身改错了：清单是 Markdown 文本，改错了重新生成一份，旧的删掉，不要两份清单混着用。

## 19. 延伸阅读

- DEPLOY-02 Docker 与 Compose 编排、蓝绿与滚动部署：本篇 Compose 生成器的模板来源；
- SRV-02 PHP-FPM、systemd 与进程管理：本篇 systemd 生成器的模板来源；
- DB-02 数据库备份、恢复、迁移、慢查询：本篇备份脚本生成器的做法来源；
- DEPLOY-03 HTTPS、CDN、域名解析上线全流程：本篇核对清单的内容来源；
- OPS-04 整站备份、迁移、灾难恢复：备份做完之后，恢复演练怎么做；
- TOOL-01 配置生成器（待开始）：Nginx、Apache、Caddy 配置与反向代理的生成器，与本篇四件工具配套使用。

## 20. 相关章节链接

- 上一篇：[TOOL-01 建站工具 1：Nginx / Apache / Caddy 配置生成器、反向代理生成器](01-config-generators.md)
- 下一篇：[TOOL-03 建站工具 3：SSL 到期计算器、DNS 检查、HTTPS/安全/上线前检查工具](03-checkers.md)
- [DEPLOY-02 Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚](../deploy/02-docker.md)
- [SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- [DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](../database/02-ops.md)
- [DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)
- [MASTER_PLAN.md](../MASTER_PLAN.md)
- [TASK_INDEX.md](../TASK_INDEX.md)
- [ROADMAP.md](../ROADMAP.md)
