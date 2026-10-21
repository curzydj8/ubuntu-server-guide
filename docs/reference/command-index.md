---
description: "Linux 命令索引：第 15 部分命令速查手册全部 79 个条目按字母序汇总，含用途、风险等级（低 / 中 / 高）、适用版本与直达速查条目的链接。"
---

# 命令索引

本表把[第 15 部分《Linux 命令速查手册》](../15-command-reference/index.md)的全部条目按命令名字母序汇成一张总表：速查原稿共 79 个条目，其中 `hostnamectl` 在两章各出现一次，本表合并为一行、同时给出两个链接，实际共 78 行。知道命令名、想确认用途与风险时从这里定位；参数表、示例与完整风险说明仍在速查条目里，本表不复制。

## 风险等级口径

| 等级 | 判定标准 |
| --- | --- |
| **高** | 误用可直接造成数据丢失、权限体系损坏、磁盘结构破坏或整机断联，且通常不可恢复：涉及删除、磁盘与分区、权限与属主、防火墙与网络配置的破坏性操作 |
| **中** | 会改变系统状态（装包、启停服务、改配置、同步或覆盖文件、改时间与调度等），但按速查条目的流程操作一般可控、可回滚 |
| **低** | 只读查询或无副作用的查看、探测类命令，本身不改动系统与数据 |

风险等级依据各速查条目内「风险提示」的强度归纳：条目带单独 `danger` 警示块的原则上定为高；同一命令带不同参数时风险差异很大（如 `find -delete`、`rsync --delete`、`docker compose down -v`），本表按其常规用法标级，危险参数的处置一律以速查条目为准。

!!! warning "高风险命令使用前先看速查条目风险提示"
    本表标为「高」的命令，先打开对应速查条目读完「风险提示」与单独警示块再执行；标为「中」的命令若带删除、覆盖、清空类参数，实际风险等同于高。共同原则与速查手册一致：**命令可以抄，目标必须自己核对**——执行前先确认主机、路径、设备名与备份。

## 索引表

适用版本统一为 Ubuntu 22.04 / 24.04 LTS（速查手册的面向版本）；条目有特殊说明的在版本列注明。Ubuntu 26.04 不在速查验证范围内，验证状态以[版本兼容页](../compatibility.md)为准。

| 命令 | 用途 | 风险 | 适用版本 | 速查链接 |
| --- | --- | --- | --- | --- |
| `apt` | 从软件源在线安装、升级、卸载软件包并自动处理依赖 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#apt) |
| `apt search / show` | `search` 按关键词找包、`show` 看包的版本与依赖，装包前先确认对象 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#apt-search-show) |
| `awk` | 按列处理文本：取字段、条件过滤与简单汇总统计 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#awk) |
| `chmod` | 修改文件或目录的读、写、执行权限（属主、属组、其他人三组 rwx） | 高 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#chmod) |
| `chown` | 修改文件的属主与属组，解决「文件在但用户不对」的访问问题 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#chown) |
| `cp` | 复制文件或目录，改配置前备份与部署副本都用它 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#cp) |
| `crontab` | 编辑当前用户的周期性定时任务表，按分钟粒度调度脚本 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#crontab) |
| `curl` | 测 HTTP / HTTPS 应用层：状态码、响应头、证书阶段与耗时分段 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#curl) |
| `cut` | 按分隔符或固定列切取字段，做轻量文本提取 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#cut) |
| `df` | 按文件系统查看总容量、已用、可用、挂载点与 inode 使用率 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#df) |
| `dig` | 查 DNS 解析的完整细节：状态、答案与实际询问的服务器 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#dig) |
| `dmesg` | 查看内核环形缓冲区日志：硬件报错、驱动加载与 OOM 记录都在这里 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#dmesg) |
| `docker` | 容器与镜像的日常操作总入口：运行、查看、进容器、看日志与清理 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#docker) |
| `docker compose` | 按 compose.yaml 一次拉起一组关联容器，服务、网络与数据卷成套管理 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#docker-compose) |
| `dpkg` | 底层包工具：装本地 .deb、查已装包与文件归属、修复半配置状态 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#dpkg) |
| `du` | 统计目录或文件实际占用空间，定位哪个目录把磁盘吃满 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#du) |
| `fdisk` | 查看或修改 MBR / GPT 分区表，速查只给只读查看用法 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#fdisk) |
| `file` | 按内容判断文件真实类型，排查「文件打不开、格式不对」时先用它 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#file) |
| `find` | 按名称、类型、大小、时间等条件递归查找文件，可批量执行后续动作 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#find) |
| `findmnt` | 按树形或条件列出已挂载文件系统及其选项 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#findmnt) |
| `free` | 查看内存与 Swap 的总量、使用与可用情况 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#free) |
| `grep` | 按模式在文件或管道中搜索匹配行，是日志排查的第一工具 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#grep) |
| `gzip / gunzip` | 单文件压缩与解压（不打包，多文件先用 tar），日志压缩最常见 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#gzip-gunzip) |
| `head / tail` | 查看文件头尾若干行，`tail -f` 实时跟踪日志新增内容 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#head-tail) |
| `hostnamectl` | 查看与设置主机名，并显示系统版本、内核与机型概要（两章各有一条） | 中 | 22.04 / 24.04 | [速查一](../15-command-reference/02-packages-services.md#hostnamectl) · [速查二](../15-command-reference/06-scheduling-containers-more.md#hostnamectl) |
| `htop` | `top` 的增强版：彩色界面、进程树与筛选更顺手 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#htop) |
| `ip` | 查看与临时修改网卡地址、链路状态与路由表，网络排查的第一个命令 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#ip) |
| `iptables` | 旧式防火墙工具，速查只用于只读查看遗留规则 | 中 | 22.04 / 24.04（多为 iptables-nft 兼容层） | [速查](../15-command-reference/06-scheduling-containers-more.md#iptables) |
| `jobs / bg / fg` | 管理当前 Shell 会话里的前后台作业：查看、后台继续、调回前台 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#jobs-bg-fg) |
| `journalctl` | 查看 systemd 日志：按服务、时间、级别筛选与追踪，服务排障的主日志入口 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#journalctl) |
| `jq` | 解析与提取 JSON：取字段、遍历数组、格式化输出 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#jq) |
| `kill` | 向指定 PID 发送信号，默认 TERM 请求进程正常退出 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#kill) |
| `last` | 读 /var/log/wtmp 列出最近的登录、注销与重启记录，做登录审计 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#last) |
| `ln` | 创建链接：符号链接像快捷方式，硬链接是同一文件的另一个名字 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#ln) |
| `ls` | 列出目录内容与文件属性，改、删之前先确认目标的第一步 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#ls) |
| `lsblk` | 以树形列出全部块设备、分区与挂载点，看清哪块盘挂在哪 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#lsblk) |
| `lscpu` | 汇总 CPU 架构、核心数、线程与虚拟化支持，容量评估先看它 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#lscpu) |
| `mkdir` | 创建目录 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#mkdir) |
| `mount` | 列出当前全部挂载，或把设备临时挂载到目录（持久化需写 /etc/fstab） | 高 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#mount) |
| `mv` | 移动文件或重命名，两者是同一操作 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#mv) |
| `nc` | 测 TCP / UDP 端口连通性，区分「端口不通」与「服务内容不对」 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#nc) |
| `nft` | 查看当前内核防火墙的完整规则集（速查范围为只读查看） | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#nft) |
| `nice / renice` | 调整进程的调度优先级（nice 值），让批处理任务给在线服务让路 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#nice-renice) |
| `nslookup` | 简易域名解析查询，输出比 dig 直白，深度排查仍以 dig 为准 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#nslookup) |
| `pgrep` | 按名称或条件查找进程 PID，是脚本中取 PID 的标准做法 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#pgrep) |
| `ping` | 测目标的 ICMP 连通、时延与丢包，按网关、外网 IP、域名顺序分层定位 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#ping) |
| `pkill` | 按名称或条件批量发送信号结束进程，适合清理一组同名进程 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#pkill) |
| `podman` | 与 Docker 命令行高度兼容的无守护进程容器工具，支持普通用户运行容器 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#podman) |
| `ps` | 静态快照查看进程列表，是脚本里取 PID、命令行与资源占用的主力 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#ps) |
| `pvs / vgs / lvs` | LVM 三层只读巡检：物理卷、卷组、逻辑卷的容量与剩余空间 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#pvs-vgs-lvs) |
| `pwd / cd` | `pwd` 显示当前所在目录，`cd` 切换目录，批量操作前先确认位置 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#pwd-cd) |
| `restic` | 带加密、增量与快照的备份工具，每次备份生成可回滚的快照 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#restic) |
| `rm` | 删除文件或目录，删除即不可恢复，默认没有回收站 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#rm) |
| `rsync` | 高效增量同步文件与目录，支持本地与远程、断点续传，是备份与部署的主力 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#rsync) |
| `scp` | 经 SSH 通道在本机与远程之间复制文件，小文件传输的速查选择 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#scp) |
| `sed` | 流式文本编辑：替换、删除、打印指定行，常用于批量改配置与日志切片 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#sed) |
| `service` | 老式服务管理命令的兼容封装，内部最终仍调用 systemctl | 中 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#service) |
| `sort` | 对行排序，是聚合统计（sort 加 uniq）与找极值的前置步骤 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#sort) |
| `ss` | 查看监听端口与网络连接，比老命令 netstat 更快 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#ss) |
| `ssh` | 加密远程登录与远程执行命令，是服务器管理的主通道 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#ssh) |
| `stat` | 显示文件或文件系统的完整元数据：大小、权限、属主、时间戳与 inode | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#stat) |
| `sudo` | 以 root 或指定用户身份执行单条命令，权限来自 /etc/sudoers 授权 | 高 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#sudo) |
| `systemctl` | 管理 systemd 服务与系统状态：启停、开机自启、状态查看与单元重载 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#systemctl) |
| `systemd-run / systemctl list-timers` | `systemd-run` 临时或按日历运行一条命令，`list-timers` 总览全部定时器 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#systemd-run-systemctl-list-timers) |
| `tar` | 打包与解包归档文件，可叠加 gzip、xz 等压缩，是 Linux 备份与分发标准格式 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#tar) |
| `tcpdump` | 抓包取证，回答请求到底到没到这台机器、出去了没有回来 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#tcpdump) |
| `timedatectl` | 查看与设置系统时间、时区与 NTP 同步状态，日志时间对不上时先查它 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/02-packages-services.md#timedatectl) |
| `top` | 动态刷新查看负载、CPU 与内存汇总与进程排行 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#top) |
| `touch` | 更新文件时间戳，文件不存在时创建一个空文件 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#touch) |
| `traceroute` | 显示到目标逐跳经过的路径与每跳时延，定位丢包出现在哪一段 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/03-network-diagnostics.md#traceroute) |
| `ufw` | Ubuntu 默认的简易防火墙前端，管理入站放行规则（底层为 nftables） | 高 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#ufw) |
| `umask` | 查看或设置新建文件与目录的默认权限掩码，决定新文件的起始权限宽严 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/01-files-permissions.md#umask) |
| `uname` | 打印系统与内核信息，报障与确认版本时的标准出处 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/06-scheduling-containers-more.md#uname) |
| `uniq` | 去除或统计相邻重复行，与 sort 搭配做频次排行 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#uniq) |
| `uptime` | 一行看清运行时长与过去 1、5、15 分钟的系统平均负载 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/04-disk-process.md#uptime) |
| `wc` | 统计行数、单词数与字节数，快速摸清文件规模 | 低 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#wc) |
| `xz` | 高压缩比的单文件压缩，适合长期归档与镜像分发 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#xz) |
| `zip / unzip` | 与 Windows 互通的 ZIP 格式打包与解包，跨平台交接文件时使用 | 中 | 22.04 / 24.04 | [速查](../15-command-reference/05-text-archive.md#zip-unzip) |

## 与速查手册的配合用法

- 只记命令名时在本表按字母定位，点「速查」直达条目看参数表与示例；已经明确问题类别时，直接从[速查手册导览](../15-command-reference/index.md)按六章分类翻更快。
- 速查给「怎么写」，教程给「为什么与何时用」：本表与速查都不替代正文流程，涉及生产配置变更时顺着速查条目里的链接回到对应教程章操作。
- 发现本表与速查条目不一致（如条目增删后本表未跟上），按[内容贡献规范](contributing.md)的反馈路径提 Issue，本表随速查手册同步维护。
