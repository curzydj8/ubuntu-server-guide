---
description: "定时、容器与系统命令速查：crontab/systemd 定时、docker/compose/podman、ufw/nft/iptables 只读查看、restic 备份，以及 uname/lscpu/free/hostnamectl/dmesg/last 系统信息命令，面向 Ubuntu 22.04/24.04。"
---

# 定时、容器与系统命令速查

本章分四组：定时刻（`crontab`、`systemd-run`/`systemctl list-timers`，完整对比与迁移见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md)）；容器速查（`docker`、`docker compose`、`podman`，原理与安装见 [Docker 基础与进阶](../05-containers/01-docker.md) 与 [Podman 无根容器](../05-containers/02-podman.md)）；防火墙与备份（`ufw`、`nft`、`iptables` 只读查看，规则管理见 [防火墙管理](../02-security/03-firewall.md)；`restic` 见 [磁盘健康与备份](../03-storage/04-backup.md)）；系统信息（`uname`、`lscpu`、`free`、`hostnamectl`、`dmesg`、`last`）。全文示例面向 Ubuntu 22.04 / 24.04，示例用户为 `ubuntu`、示例地址为文档段 `192.0.2.x`。

## 定时任务

### `crontab`

- **用途**：编辑当前用户的周期性定时任务表，按分钟粒度调度脚本。
- **语法**：`crontab [选项]`

| 参数 | 说明 |
| --- | --- |
| `-e` | 编辑当前用户的任务表（保存即生效） |
| `-l` | 列出当前用户的全部任务 |
| `-r` | 删除当前用户的整张任务表（慎用，见风险） |
| `-u 用户` | 管理指定用户的任务表（需 sudo） |

五段时间格式（每行一条任务，顺序固定）：

| 字段 | 取值范围 | 说明 |
| --- | --- | --- |
| 分钟 | 0–59 | 每小时的第几分钟 |
| 小时 | 0–23 | 每天的几点 |
| 日 | 1–31 | 每月的几号 |
| 月 | 1–12 | 几月 |
| 星期 | 0–7 | 0 与 7 都是星期日 |

另外支持 `@daily`（每天 0 点）、`@weekly`、`@monthly`、`@reboot`（开机时执行一次）等简写。

- **示例**：

```bash
crontab -l
crontab -e
```

```text
# 每天 03:30 备份站点目录（注意写绝对路径）
30 3 * * * /usr/bin/tar -czf /backup/site-$(date +\%F).tar.gz -C /var/www html >> /var/log/site-backup.log 2>&1
```

两个最常踩的坑：一是环境——cron 里没有交互 Shell 的 `PATH` 与环境变量，命令与路径一律写全路径，并把输出重定向到日志文件，任务没跑时先看日志而不是猜；二是格式——命令里的 `%` 必须写成 `\%`，否则会被当作换行截断。cron 与 systemd timer 的取舍和迁移方法见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md)。

- **常见错误**：把五段顺序记反（如把小时写到分钟位），任务在奇怪的时间触发；以及 `-e` 与 `-r` 按键相邻手滑删表——改前先 `crontab -l > ~/crontab.bak` 存一份。
- **风险提示**：`crontab -r` 无确认直接删整表，系统级任务不要写进个人 crontab，应放 `/etc/cron.d/` 或改用 systemd timer 便于审计。

### `systemd-run` / `systemctl list-timers`

- **用途**：`systemd-run` 临时或按日历触发地运行一条命令；`list-timers` 总览全部 systemd 定时器与下次触发时间。
- **语法**：`systemd-run [选项] 命令` / `systemctl list-timers [选项]`

| 参数 | 说明 |
| --- | --- |
| `--on-calendar='每天时间'` | 按日历表达式定时，如 `--on-calendar='*-*-* 04:00'` |
| `--on-active=秒数` | 延时一次性执行，如 30 分钟后跑一次 |
| `--unit=名称` | 给临时单元命名，便于查看日志与状态 |
| `list-timers --all` | 连未激活的 timer 一并列出 |
| `list-timers` 的 NEXT 列 | 下次触发时间，核对定时是否装对先看它 |

- **示例**：

```bash
systemctl list-timers --all
sudo systemd-run --on-calendar='*-*-* 04:00' --unit=nightly-clean /usr/local/bin/clean-tmp.sh
journalctl -u nightly-clean -n 20
```

与 cron 相比，timer 的优势是执行记录进 journal 可查、错过触发可补跑（`Persistent=`）、依赖关系可控；选型与 `.timer`/`.service` 文件写法见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md)。

- **常见错误**：用 `systemd-run` 建了定时却不命名 unit，出问题时在 journal 里无从找起。
- **风险提示**：速查仅列常用法；长期任务请落成正式的 service/timer 单元文件纳入管理，不要堆积匿名临时单元。

## 容器命令

### `docker`

- **用途**：管理容器与镜像的日常操作总入口：运行、查看、进容器、看日志、停止与清理。
- **语法**：`docker 子命令 [选项] [参数]`

| 子命令 | 说明 |
| --- | --- |
| `run -d --name 名称 镜像` | 后台启动容器；加 `-p 主机端口:容器端口`、`-v 主机目录:容器目录`、`--restart unless-stopped` |
| `ps` / `ps -a` | 列运行中容器 / 含已停止的全部容器 |
| `images` | 列本地镜像 |
| `logs [-f] 容器` | 看容器日志，`-f` 实时跟踪，加 `--tail 100` 只看末尾 |
| `exec -it 容器 sh` | 进运行中容器开 Shell（无 bash 时用 sh） |
| `stop / rm 容器` | 停止容器 / 删除已停止容器（删镜像用 `rmi`） |

- **示例**：

```bash
docker run -d --name web --restart unless-stopped -p 8080:80 -v /srv/www:/usr/share/nginx/html:ro nginx:stable
docker ps
docker logs --tail 50 web
```

示例把站点目录以 `:ro` 只读挂进 nginx 容器并映射 8080 端口；生产部署的参数规范、网络与数据卷细则见 [Docker 基础与进阶](../05-containers/01-docker.md)。

- **常见错误**：不写镜像标签默认拉 `latest`，版本漂移后行为悄悄变化；生产一律固定明确标签。
- **风险提示**：`docker rm` 删的是容器本体，数据只在命名卷/挂载目录里才保留；大清理命令（如批量删容器与镜像）执行前先 `docker ps -a` 与 `docker images` 核对清单。

### `docker compose`

- **用途**：按 `compose.yaml` 一次拉起一组关联容器（服务、网络、数据卷成套管理）。
- **语法**：`docker compose [选项] 子命令`

| 子命令 | 说明 |
| --- | --- |
| `up -d` | 按当前目录 compose 文件后台启动全部服务 |
| `down` | 停止并删除本套容器与网络（数据卷默认保留，加 `-v` 才删卷） |
| `ps` | 查看本套服务的容器状态 |
| `logs -f [服务名]` | 跟踪日志，可只跟指定服务 |
| `exec 服务名 sh` | 进入某个服务的容器 |
| `pull` / `up -d --build` | 拉新镜像 / 重新构建后启动（升级常用） |

- **示例**：

```bash
cd /srv/app
docker compose ps
docker compose logs -f app
docker compose pull && docker compose up -d
```

升级流程就是最后一条：先拉新镜像再滚动重建，`ps` 确认全部 `Up` 后再看日志核对启动无误；compose 文件写法见 [Docker 基础与进阶](../05-containers/01-docker.md)。

- **常见错误**：在没有 compose 文件的目录执行，操作到了另一套项目——`docker compose` 按当前目录识别项目，执行前先 `pwd` 与 `ls` 确认。
- **风险提示**：`docker compose down -v` 会连数据卷一起删除，数据库等有状态服务的数据随之消失，非明确要销毁环境时不要加 `-v`。

### `podman`

- **用途**：与 Docker 命令行高度兼容的无守护进程容器工具，支持普通用户（rootless）运行容器。
- **语法**：`podman 子命令 [选项] [参数]`

| 子命令 | 与 docker 的对应说明 |
| --- | --- |
| `run / ps / images` | 子命令与常用参数与 docker 基本一致，可直接迁移习惯 |
| `logs / exec / stop / rm` | 同 docker，用法一致 |
| `generate systemd 容器` | podman 特色：为容器生成 systemd 单元，用服务方式托管 |
| `pod` | podman 的编组概念（类似同网络命名空间的一组容器），docker 无直接对应 |

- **示例**：

```bash
podman run -d --name web -p 8080:80 nginx:stable
podman ps
podman logs --tail 20 web
```

绝大多数 docker 日常命令把 `docker` 换成 `podman` 即可运行，差异主要在无守护进程、rootless 默认与 systemd 集成，详见 [Podman 无根容器](../05-containers/02-podman.md)。

- **常见错误**：把 docker 的「加 docker 组≈root 权限」经验套到 podman 的 rootless 场景，或反过来在未配置的机器上直接用普通用户跑 docker 报权限错误。
- **风险提示**：rootless 容器里映射小于 1024 的端口、挂载属主映射等有额外限制，迁移前对照 Podman 章逐项验证。

## 防火墙与备份

### `ufw`

- **用途**：Ubuntu 默认的简易防火墙前端，管理入站放行规则（底层为 nftables）。
- **语法**：`sudo ufw [选项] 动作 [规则]`

| 参数 | 说明 |
| --- | --- |
| `status verbose` | 查看启用状态、默认策略与全部规则 |
| `status numbered` | 带编号列出规则，删除前必看 |
| `allow 22/tcp` | 放行端口/协议，也可写服务名 `allow OpenSSH` |
| `deny 23/tcp` | 拒绝指定端口 |
| `delete N` | 按编号删除第 N 条规则 |
| `enable` / `disable` | 启用 / 停用防火墙 |

- **示例**：

```bash
sudo ufw status numbered
sudo ufw allow 8080/tcp comment 'app'
sudo ufw delete 3
```

删规则的标准姿势是先 `status numbered` 看清编号再 `delete N`，因为编号会随增删变化，凭记忆删最易删错；完整的放行顺序与「先放行 SSH 再 enable」铁律见 [防火墙管理](../02-security/03-firewall.md)。

- **常见错误**：远程 SSH 时没先放行 22 端口就 `enable`，把自己锁在门外；云服务器还要同时检查云厂商安全组（双层放行）。
- **风险提示**：改防火墙一律在保留现有 SSH 会话的同时新开一个会话验证能重连，确认无误再关旧会话。

!!! danger "ufw reset 会清空全部规则"
    `sudo ufw reset` 会停用防火墙并删除全部自定义规则，远程机器执行后可能瞬间失去 SSH 放行而断联。确需重置时，先确保有控制台/救援通道，重置后第一时间按 [防火墙管理](../02-security/03-firewall.md) 的顺序：先 `allow OpenSSH`、再 `enable`、最后新开会话验证登录。不要把 reset 当作「排障试试」的随手命令。

### `nft`

- **用途**：查看当前内核防火墙的完整规则集（nftables 是现代 Linux 防火墙的底层）。
- **语法**：`nft [选项] 子命令`

| 参数 | 说明 |
| --- | --- |
| `list ruleset` | 只读输出全部表、链与规则，本速查仅给这一用法 |
| `-a` | 输出时附带规则句柄编号，便于对照定位 |
| `-n` | 地址与端口不做名称解析，只显示数字 |

- **示例**：

```bash
sudo nft -a list ruleset | head -100
```

本页对 nft 只做只读核查：当 ufw 显示放行、服务却连不通时，用它确认底层规则集是否真的存在对应规则、是否存在更靠前的拒绝规则。规则的增删改一律通过 ufw 或 nft 配置文件完成，方法见 [防火墙管理](../02-security/03-firewall.md)，不要在速查页照抄修改命令直接改线上规则集。

- **常见错误**：把 `list ruleset` 的输出当成 ufw 规则一一对应——中间隔着转换层，同一效果在底层可能拆成多条链。
- **风险提示**：本条只读无风险；`nft flush ruleset` 等清空命令会瞬间放开或锁死整机网络，禁止在远程会话随手试验。

### `iptables`

- **用途**：旧式防火墙工具，现已被 nftables 取代；本页只用于只读查看遗留规则。
- **语法**：`iptables [选项]`

| 参数 | 说明 |
| --- | --- |
| `-L -n -v` | 只读列出规则（数字地址、带流量计数） |
| `-S` | 以命令行参数形式打印规则，便于复制核对 |
| `iptables-legacy` | 在个别老系统上查看真正的旧式规则表 |

- **示例**：

```bash
sudo iptables -L -n -v
sudo iptables -S
```

在 Ubuntu 22.04/24.04 上，`iptables` 多为指向 nftables 的兼容层（iptables-nft），看到的规则实际由 nftables 执行；新建防火墙策略不要再基于 iptables 编写，统一走 ufw/nft，说明与迁移见 [防火墙管理](../02-security/03-firewall.md)。

- **常见错误**：在兼容层机器上用网上老教程的 iptables 命令改规则，与 ufw 的 nft 规则互相打架且重启后状态不一致。
- **风险提示**：本条只读无风险；`-F`（清空链）等修改命令不在本页使用范围。

### `restic`

- **用途**：带加密、增量与快照的备份工具：一次初始化仓库，之后每次备份生成可回滚的快照。
- **语法**：`restic [选项] 子命令`

| 子命令 | 说明 |
| --- | --- |
| `init --repo 路径` | 初始化备份仓库（会要求设置仓库密码） |
| `backup 路径` | 把指定目录备份为一个新快照 |
| `snapshots` | 列出全部快照及时间、路径 |
| `restore 快照ID --target 目录` | 把快照恢复到指定目录 |
| `check` | 校验仓库完整性，定期执行 |

- **示例**：

```bash
export RESTIC_REPOSITORY=/backup/restic-repo
export RESTIC_PASSWORD_FILE=/etc/restic/password
restic backup /srv/app /etc/app
restic snapshots
restic restore latest --target /tmp/restore-check
```

流程要点：密码走文件或环境变量注入，不要写进脚本正文；恢复先解到临时目录核查再覆盖正式数据。仓库规划、保留策略与异地副本见 [磁盘健康与备份](../03-storage/04-backup.md)。

- **常见错误**：init 后把仓库密码弄丢——仓库加密后无密码任何人都读不出，数据等于报废；密码必须与仓库分开、另行妥善保管。
- **风险提示**：`forget --prune` 清理旧快照不可逆，执行前先 `snapshots` 核对保留范围；从未做过 restore 演练的备份不能视为可用备份。

## 系统信息

### `uname`

- **用途**：打印系统与内核信息，报障与确认版本时的标准出处。
- **语法**：`uname [选项]`

| 参数 | 说明 |
| --- | --- |
| `-a` | 全部信息：内核名、主机名、版本、架构一行齐 |
| `-r` | 只显示内核版本号 |
| `-m` | 只显示硬件架构，如 `x86_64`、`aarch64` |
| `-s` | 内核名称（默认项，通常为 Linux） |

- **示例**：

```bash
uname -a
uname -r
lsb_release -a
```

`uname -r` 的内核版本决定能用的内核特性与驱动，装驱动、报问题先附上它；发行版版本用第二组 `lsb_release -a` 区分——两者不是一回事。

- **常见错误**：把内核版本当发行版版本（如把 6.8 内核说成系统版本），沟通时两者都要给。
- **风险提示**：只读无风险。

### `lscpu`

- **用途**：汇总 CPU 架构、核心数、线程与虚拟化支持，容量评估先看它。
- **语法**：`lscpu [选项]`

| 参数 | 说明 |
| --- | --- |
| （无参数） | 输出架构、型号、核数、主频、缓存与虚拟化标志 |
| `-e` | 按每个逻辑 CPU 一行列出 |
| `-J` | JSON 格式输出，给脚本解析用 |

- **示例**：

```bash
lscpu | grep -E 'Architecture|CPU\(s\)|Model name|Virtualization'
nproc
```

重点看总逻辑核数（Socket × 每核 × 线程）与 `Virtualization` 行是否支持 VT-x/AMD-V，判负载与选规格时以它和 `nproc` 的结果为准。

- **常见错误**：只看「CPU(s)」一行就下结论，忽略它是逻辑线程数而非物理核心数。
- **风险提示**：只读无风险。

### `free`

- **用途**：查看内存与 Swap 的总量、使用与可用情况。
- **语法**：`free [选项]`

| 参数 | 说明 |
| --- | --- |
| `-h` | 人类可读单位，必备 |
| `-s N` | 每 N 秒刷新一次连续采样 |
| `available 列` | 真正可供新程序使用的内存估算，判读以它为准 |
| `buff/cache 列` | 页缓存与缓冲，内存紧张时可被回收，不算「被吃掉」 |

- **示例**：

```bash
free -h
```

```text
               total        used        free      shared  buff/cache   available
Mem:            15Gi       6.2Gi       1.1Gi       120Mi       8.3Gi       8.9Gi
Swap:          2.0Gi       0.5Gi       1.5Gi
```

判读一句话：不要看 `used` 高就喊内存不足——Linux 会把闲置内存用作 `buff/cache` 加速 IO，真正指标是 `available`（示例中还有 8.9Gi 可用，健康）；`free` 列小而 `available` 大属正常，只有 `available` 长期逼近 0 且 Swap 持续增长才是真吃紧。

- **常见错误**：把 `free` 列当可用内存，得出「只剩 1.1Gi 要爆了」的错误结论并盲目加内存。
- **风险提示**：只读无风险。

### `hostnamectl`

- **用途**：查看或设置主机名，并显示系统、内核与机型概要。
- **语法**：`hostnamectl [选项] [子命令]`

| 参数 | 说明 |
| --- | --- |
| （无参数） | 显示主机名、操作系统、内核、架构等概要 |
| `set-hostname 名称` | 修改主机名（需 sudo） |
| `status` | 同默认输出，显式写法 |

- **示例**：

```bash
hostnamectl
```

本章的 `uname`/`lsb_release` 已覆盖版本信息需求，`hostnamectl` 只在此留一条简条备用：它胜在一屏同时给出主机名与系统概要，远程交付核对机器身份时最方便；改主机名后记得同步 `/etc/hosts` 中的对应条目，避免 sudo 等处出现解析警告。

- **常见错误**：改了主机名却没改 `/etc/hosts`，之后命令常伴随「unable to resolve host」警告。
- **风险提示**：查看无风险；改名会影响监控、日志与证书里登记的名字，生产机改名先登记变更。

### `dmesg`

- **用途**：查看内核环形缓冲区日志：硬件报错、驱动加载、OOM 击杀都记录在这里。
- **语法**：`dmesg [选项]`

| 参数 | 说明 |
| --- | --- |
| `-T` | 显示人类可读时间戳（默认是开机后秒数） |
| `-w` | 实时跟踪新内核消息 |
| `-l err,crit` | 只看指定级别，如错误与严重 |
| `--level=warn` | 只看警告及以上 |

- **示例**：

```bash
sudo dmesg -T | grep -iE 'error|fail|oom' | tail -30
sudo dmesg -T | tail -20
```

服务被莫名终止时，先来这里搜 `oom`（Out of memory）确认是否被内核击杀，再决定查内存还是查代码；Ubuntu 22.04/24.04 上普通用户读 dmesg 可能受 `kernel.dmesg_restrict` 限制，无输出时加 `sudo` 再试。

- **常见错误**：不用 `-T` 时对着秒数时间戳猜事件发生时刻，与应用日志对不上时间线。
- **风险提示**：只读无风险；注意 `-T` 时间在休眠/唤醒过的机器上可能有偏差，精确对时以 journal 为准。

### `last`

- **用途**：读取 `/var/log/wtmp`，列出最近的登录、注销与重启记录，做登录审计的第一手材料。
- **语法**：`last [选项] [用户]`

| 参数 | 说明 |
| --- | --- |
| `-F` | 显示完整日期时间 |
| `-i` | 来源地址以 IP 数字形式显示 |
| `-n N` | 只显示最近 N 条 |
| `lastb` | 对应命令：列失败登录（读 btmp，需 sudo） |

- **示例**：

```bash
last -F -i -n 20
sudo lastb -n 20
```

核对「这个时间点谁从哪里登过」用第一条；发现陌生来源地址或大量失败记录时，应结合 `auth.log` 做完整审计，方法见 [SSH 故障排查与加固](../14-ssh/06-troubleshooting-hardening.md) 中的日志审计部分，并回头检查 [SSH 安全加固](../02-security/01-ssh-hardening.md) 的各项设置。

- **常见错误**：只看 `last` 的成功记录就下安全结论——攻击尝试全在 `lastb` 的失败记录里，两个必须一起看。
- **风险提示**：只读无风险；wtmp 会被日志轮转清理，审计窗口有限，重要机器应把登录日志集中收集留存。

## 本章排坑与安全总则

- 定时任务三件套检查：命令写全路径、输出重定向留日志、`%` 转义为 `\%`；cron 改前先 `crontab -l` 备份，定时是否装对用 `systemctl list-timers` 的 NEXT 列与 journal 双核对。
- 容器清理先盘点后动手：删容器、删卷、`down -v` 前先列清单核对，数据只认挂载目录与命名卷，容器本体随时可弃、数据卷不可再生。
- 防火墙改动防自锁：先放行 SSH 再 enable，云上同时查安全组；删除规则先 `status numbered` 看编号；`ufw reset` 与 `nft flush` 不当排障手段使用。
- nft/iptables 在本机只做只读核查：规则的增删改统一走 ufw 与防火墙章流程，避免兼容层与 ufw 规则互相打架。
- 备份以能恢复为准：restic 仓库密码与仓库分开保管，定期 `check` 并真实做一次 `restore` 演练，未演练过的备份不算备份。
- 系统信息先判读再结论：`free` 看 `available` 不看 `used`，负载对照 `nproc`/`lscpu` 的核数看，内核问题先翻 `dmesg -T` 再查应用日志。
