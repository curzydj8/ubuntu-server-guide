---
description: "软件包与服务命令速查：apt、dpkg、systemctl、journalctl、service、hostnamectl、timedatectl 的参数表、示例与排坑，面向 Ubuntu 22.04/24.04。"
---

# 软件包与服务命令速查

本章覆盖装软件与管服务的两组命令：包管理（`apt`、`apt search/show`、`dpkg`）与服务管理（`systemctl`、`journalctl`、`service`、`hostnamectl`、`timedatectl`）。完整原理、换源流程与选型对比见教程章 [软件源与包管理](../01-basics/04-package-management.md)，定时任务与 timer 单元见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md)，时间与日志体系见 [时间同步与系统日志](../04-network/04-time-logging.md)。本章只给参数、示例与坑点。示例用户为 `ubuntu`。

## `apt`

- **用途**：从软件源在线安装、升级、卸载软件包并自动处理依赖，是服务器装包的默认工具。
- **语法**：`sudo apt [子命令] [包名...]`

常用子命令分表：

| 子命令 | 说明 |
|--------|------|
| `update` | 刷新软件源索引（只更新清单，不装任何东西） |
| `upgrade` | 升级所有可升级的已装包，不删包 |
| `install 包名` | 安装并自动补齐依赖，加 `-y` 免确认 |
| `remove 包名` | 卸载程序，保留配置文件 |
| `purge 包名` | 卸载程序并删除其配置文件 |
| `autoremove` | 清理不再被依赖的孤儿包，执行前先看清单 |

| 常用选项 | 说明 |
|----------|------|
| `-y` | 自动回答 yes（脚本中用，人工操作先看清清单再加） |
| `--reinstall` | 重新安装已装的包，修复文件丢失时用 |
| `--fix-broken` | 修复依赖损坏的半配置状态（等价于 `apt install -f` 的意图） |
| `--no-install-recommends` | 不装推荐包，精简安装时用 |
| `-s` | 模拟执行，只打印将发生的动作 |

- **示例**：

```bash
sudo apt update
apt list --upgradable
sudo apt install -y nginx curl
sudo apt remove -y nginx
sudo apt purge -y nginx
sudo apt autoremove
```

解读：标准顺序是先 `update` 刷新索引，再看可升级清单，最后才 `install`/`upgrade`；索引过期是「找不到包」的最常见原因。

- **常见错误**：跳过 `update` 直接装包，报 `Unable to locate package` 便以为源里没有该软件；`remove` 后以为配置也删了，残留配置导致重装后旧设置复活，该清配置时用 `purge`。
- **风险提示**：`upgrade` 涉及内核与关键库时可能要求重启，生产环境安排维护窗口；`autoremove` 执行前逐行核对删除清单，误删仍被手动依赖的库会带崩服务。

## `apt search / show`

- **用途**：`search` 按关键词在源中找包名，`show` 查看某个包的版本、依赖与描述，装包前先确认装的是不是想要的那个。
- **语法**：`apt search 关键词`；`apt show 包名`

| 参数 | 说明 |
|------|------|
| `apt search 关键词` | 在包名与描述中全文检索，结果较多时配合管道过滤 |
| `apt show 包名` | 显示版本、大小、依赖、维护者与说明 |
| `apt list --installed` | 列出全部已装包 |
| `apt-cache policy 包名` | 看已装版本、候选版本与各版本来源 |

- **示例**：

```bash
apt search "web server" | head
apt show nginx | grep -E "Version|Depends"
apt-cache policy nginx
```

```text
nginx:
  Installed: (none)
  Candidate: 1.24.0-2ubuntu7
```

解读：`Candidate` 是现在安装会装到的版本，确认它来自预期的源再执行 `install`。

- **常见错误**：只看 `search` 结果第一行就装，同名或近名包（本体、文档、开发包）很容易装错。
- **风险提示**：纯查询命令无风险；注意 `show` 显示的是源中的信息，未 `update` 时可能已过期。

## `dpkg`

- **用途**：底层包工具：安装本地 `.deb` 文件、查询已装包与文件归属、修复半配置状态；不负责从源解决依赖。
- **语法**：`dpkg [选项] [包名/文件]`

| 参数 | 说明 |
|------|------|
| `-i 文件.deb` | 安装本地 deb 文件（依赖缺失会进入半配置状态） |
| `-l [包名]` | 列出已装包及状态，`ii` 为正常，`iU`/`iF` 为未配置完成 |
| `-L 包名` | 列出该包安装的全部文件路径 |
| `-S 路径` | 按文件路径反查属于哪个包 |
| `--configure -a` | 配置所有已解开但未配置的包，修复中断的安装 |
| `-r 包名` / `-P 包名` | 卸载 / 连配置一并卸载（优先用 apt 的 remove/purge） |

- **示例**：

```bash
dpkg -l | grep nginx
dpkg -L nginx
dpkg -S /usr/sbin/nginx
sudo dpkg -i ./example-package_1.0.0_amd64.deb
sudo apt install --fix-broken -y
sudo dpkg --configure -a
```

解读：本地包优先用 `sudo apt install ./文件.deb` 让 apt 自动补依赖；已经用 `dpkg -i` 装坏时，后两行是标准修复组合。包名与文件名均为占位示例，执行时换成真实值。

- **常见错误**：用 `dpkg -i` 硬装缺依赖的包后放着不管，之后所有 `apt` 操作都会先被这个半成品卡住。
- **风险提示**：不要使用 `--force-*` 类参数跳过依赖与冲突检查强装，包数据库一旦损坏，修复成本远高于重装单个软件。

## `systemctl`

- **用途**：管理 systemd 服务与系统状态：启停、开机自启、查看状态、重载单元定义。
- **语法**：`sudo systemctl [动作] [服务名]`

| 参数 | 说明 |
|------|------|
| `start` / `stop` | 立即启动 / 停止服务（不改变开机自启设置） |
| `restart` | 重启服务（先停后启，有短暂中断） |
| `reload` | 不重启进程、重读配置（服务支持时优先用，比 restart 平滑） |
| `status` | 看运行状态、主进程与最近日志片段，排障第一条命令 |
| `enable` / `disable` | 设置 / 取消开机自启（`enable --now` 为同时立即启动） |
| `is-active` / `is-enabled` | 输出 active/inactive、enabled/disabled，脚本判断用 |
| `list-units --failed` | 只列失败单元，巡检先看这一条 |
| `daemon-reload` | 改完服务单元文件后重载定义，不执行服务不会用新定义 |

- **示例**：

```bash
sudo systemctl status nginx --no-pager
sudo systemctl reload nginx
sudo systemctl enable --now nginx
systemctl is-active nginx
systemctl list-units --failed --no-pager
```

解读：改配置后的标准动作是先测配置（如 `nginx -t`），再 `reload`，最后 `status` 确认仍是 `active (running)`；改了 `.service` 文件本身则先 `daemon-reload` 再重启服务。

- **常见错误**：`start` 了服务却忘了 `enable`，重启后服务没起来；改完单元文件直接 `restart` 而不 `daemon-reload`，跑的还是旧定义，还以为改动没生效是程序问题。
- **风险提示**：对远程接入类服务（`ssh`、网络服务）执行 `stop`/`restart` 前先留第二通道，停错会把自己关在门外；`systemctl` 操作生产关键服务先确认服务名，不要靠模糊记忆敲。

## `journalctl`

- **用途**：查看 systemd 日志：按服务、时间、级别筛选与追踪，是服务排障的主日志入口。
- **语法**：`journalctl [选项]`

| 参数 | 说明 |
|------|------|
| `-u 服务名` | 只看指定服务的日志 |
| `-f` | 实时追踪新日志（类 `tail -f`，`Ctrl+C` 退出） |
| `-n 行数` | 只显示最后 N 行，如 `-n 100` |
| `--since "时间"` | 起始时间，如 `--since "2026-10-21 09:00"`、`--since "-1h"`；配合 `--until` 圈时段 |
| `-p err` | 只看该级别及以上：`emerg/alert/crit/err/warning/info/debug` |
| `--disk-usage` | 看日志占用的磁盘空间 |
| `--vacuum-time=7d` | 只保留最近 7 天日志并清理旧日志（还有 `--vacuum-size=500M` 按容量清理） |

- **示例**：

```bash
sudo journalctl -u nginx -n 100 --no-pager
sudo journalctl -u ssh -f
journalctl --since "-30min" -p err --no-pager
journalctl --disk-usage
sudo journalctl --vacuum-time=7d
```

解读：排障套路是先 `-u` 锁定服务、再用 `--since` 圈住故障时段、最后用 `-p err` 只看错误级，日志量立刻从海量变可读。

- **常见错误**：不加任何筛选直接翻全量日志找问题，等于大海捞针；`--vacuum-*` 清完才发现要追溯的日志也在其中——先导出或先确认保留期再清理。
- **风险提示**：清理日志是不可逆操作，生产机先看 `--disk-usage` 与现有保留策略，故障未定位完之前不要清涉事时段的日志。

## `service`

- **用途**：老式服务管理命令的兼容封装，内部最终仍调用 `systemctl`；老脚本与老文档中常见，自己新写操作统一用 `systemctl`。
- **语法**：`sudo service 服务名 [start|stop|restart|status]`

| 参数 | 说明 |
|------|------|
| `start` / `stop` / `restart` | 启停重启，等价于 systemctl 对应动作 |
| `status` | 查看状态，输出比 systemctl 简略 |
| `--status-all` | 列出全部服务的运行状态概览 |

- **示例**：

```bash
sudo service nginx status
sudo service nginx restart
```

解读：能用但信息少，`status` 不给日志片段与自启状态，排障仍应回到 `systemctl status` 与 `journalctl`。

- **常见错误**：以为 `service` 与 `systemctl` 是两套独立机制而重复排查——底层是同一套 systemd。
- **风险提示**：风险与 `systemctl` 相同，停远程关键服务前留退路。

## `hostnamectl`

- **用途**：查看与设置主机名，并显示系统版本、内核与机型等概要信息。
- **语法**：`hostnamectl [选项]`

| 参数 | 说明 |
|------|------|
| 无参数 | 显示主机名、系统、内核、架构等概要 |
| `set-hostname 名称` | 设置主机名（需 sudo，同时写 `/etc/hostname`） |
| `status` | 同无参数的完整输出 |

- **示例**：

```bash
hostnamectl
sudo hostnamectl set-hostname web-01
hostname
```

解读：改名后新开的 shell 提示符才会刷新；部分服务在启动时读取主机名，改名后按需重启相关服务。

- **常见错误**：只改了 `/etc/hosts` 或只改了 `/etc/hostname` 一处，两处不一致时 `sudo` 会报无法解析主机名的警告。
- **风险提示**：主机名被监控、证书与集群成员身份引用时，改名属于变更操作，先确认引用方再改。

## `timedatectl`

- **用途**：查看与设置系统时间、时区与 NTP 同步状态，日志时间对不上、证书校验失败时先查它。
- **语法**：`timedatectl [选项]`

| 参数 | 说明 |
|------|------|
| 无参数 / `status` | 显示本地时间、UTC、时区与同步状态 |
| `set-timezone 时区` | 设置时区，如 `Asia/Shanghai`（需 sudo） |
| `list-timezones` | 列出全部可选时区 |
| `set-ntp true` | 开启 NTP 自动同步 |

- **示例**：

```bash
timedatectl
sudo timedatectl set-timezone Asia/Shanghai
timedatectl set-ntp true
```

解读：重点看 `System clock synchronized: yes` 与 `Time zone` 两行；时间体系与日志的完整讲解见 [时间同步与系统日志](../04-network/04-time-logging.md)。

- **常见错误**：只改时区不查同步状态，时钟本身已漂移时改完时区时间依然是错的；手动 `set-time` 强改时间会让日志与证书时间线错乱，应优先靠 NTP 修正。
- **风险提示**：生产机时间被数据库、证书与审计日志共同依赖，大幅跳变时间前先评估影响，不要随手手动拨钟。

## 本章排坑与安全总则

1. **先刷新索引再装包**：`install` 找不到包十有八九是没 `update` 或源配置有问题，先修索引，不要急着添加来路不明的第三方源。
2. **本地包走 apt 装路径**：`sudo apt install ./x.deb` 自动补依赖；`dpkg -i` 装坏后用 `apt install --fix-broken` + `dpkg --configure -a` 修复，禁用强制参数硬装。
3. **启停与自启是两件事**：`start` 管现在、`enable` 管开机；交付前用 `is-active` + `is-enabled` 双确认，重启演练最可靠。
4. **改单元先重载定义**：动过 `.service` 文件必须 `daemon-reload`；改应用配置优先 `reload` 而非 `restart`，且改前先做配置语法检查。
5. **日志先筛选后清理**：排障按「服务 → 时段 → 级别」三层收窄；`--vacuum-*` 清理前确认故障已定位、保留期符合要求，涉事日志先留存。
6. **升级留退路**：生产升级先看清单、安排窗口，涉及内核与远程接入服务时保留第二通道并准备重启后验证清单。
