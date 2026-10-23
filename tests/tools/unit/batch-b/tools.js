/* 批次 B 新增工具 JS（N-10 / N-12 / N-07 / N-13 / N-24 / N-28）
   风格与 docs/tools/index.md 现有脚本一致：ES5、var/function、字符串拼接、
   输出一律 textContent、复制走页面已有的 bindCopy 助手。
   集成时把本文件内容粘贴进页尾 <script> 块即可（init 函数名见文件末尾注释）。 */

/* ================= N-10 Linux 故障诊断决策树（diag） =================
   数据驱动：一棵决策树数据 + 统一渲染。节点两种：
   - 问题节点 { label?, q, options: [{ t: 选项文案, n: 下一节点 id }] }
   - 结论节点 { leaf: true, title, causes: [], checks: [], fixes: [], danger }
   本工具只展示检查命令，绝不执行任何命令。 */
var DIAG_TREE = {
  net: {
    label: "网络不通",
    q: "在故障机器上 ping 网关 IP（如 ip route 里 default via 的地址），通不通？",
    options: [
      { t: "网关能 ping 通", n: "netQ2a" },
      { t: "网关 ping 不通", n: "netQ2b" }
    ]
  },
  netQ2a: {
    q: "再 ping 一个公网 IP（如 223.5.5.5），通不通？",
    options: [
      { t: "公网 IP 能通，但域名打不开", n: "netDns" },
      { t: "公网 IP 也不通", n: "netRoute" }
    ]
  },
  netQ2b: {
    q: "ip link 看故障网卡的状态是 UP 吗？",
    options: [
      { t: "是 UP", n: "netQ3b" },
      { t: "DOWN 或显示 NO-CARRIER", n: "netLink" }
    ]
  },
  netQ3b: {
    q: "ip addr 看本机 IP 地址还在吗？",
    options: [
      { t: "地址还在，和规划一致", n: "netConflict" },
      { t: "地址没了或是 169.254.x.x", n: "netDhcp" }
    ]
  },
  netDns: {
    leaf: true,
    title: "DNS 解析故障（网络本身是通的）",
    causes: [
      "DNS 服务器不可达或配置错误 —— 可能性最高：IP 直连通、域名不通是 DNS 问题的典型特征",
      "/etc/resolv.conf 被 DHCP / netplan 覆盖成了错误地址",
      "本机 nsswitch / systemd-resolved 缓存了坏记录"
    ],
    checks: [
      "ping -c3 223.5.5.5",
      "getent hosts example.com",
      "dig example.com @223.5.5.5",
      "cat /etc/resolv.conf",
      "resolvectl status"
    ],
    fixes: [
      "dig 直连公共 DNS 能解析、系统解析不行 → 问题在本机解析链，按 resolvectl status 显示的当前 DNS 改 netplan / 网卡配置，不要只手改 /etc/resolv.conf（会被覆盖）",
      "所有 DNS 都解析不了 → 换一台可用的 DNS 服务器地址并持久化到 netplan，netplan apply 后复测"
    ],
    danger: "不要为了「试一试」把 resolv.conf 指向来路不明的 DNS：解析被劫持会把流量导向假站点。"
  },
  netRoute: {
    leaf: true,
    title: "默认路由或出口故障",
    causes: [
      "默认路由缺失或指错网关 —— 可能性最高：网关可达但出不去，先看路由表",
      "云厂商安全组 / 机房防火墙拦了出方向流量",
      "NAT / 出口设备故障（家宽路由器、云 NAT 网关）"
    ],
    checks: [
      "ip route",
      "traceroute -n 223.5.5.5",
      "ping -c3 $(ip route | awk '/default/ {print $3; exit}')",
      "curl -v --connect-timeout 5 http://223.5.5.5"
    ],
    fixes: [
      "没有 default 路由 → 在 netplan 里补 gateway / routes，不要只用 ip route add 临时加（重启即丢）",
      "traceroute 第一跳就断 → 本机路由/网关问题；能过网关、断在后面 → 出口或运营商侧问题，带上 traceroute 输出找云厂商/机房"
    ],
    danger: "改路由前先确认你不是靠这条路由远程连进来的：删错默认路由会把自己锁在机器外，只能走控制台/带外管理救。"
  },
  netLink: {
    leaf: true,
    title: "物理链路 / 网卡未启用",
    causes: [
      "网线没插好、交换机端口关闭或网卡硬件故障（NO-CARRIER 即物理层无信号）—— 可能性最高",
      "网卡被人为 down 或驱动未加载（虚拟机里常见于网卡未连接）",
      "虚拟机 / 云主机网卡未挂载或被禁用"
    ],
    checks: [
      "ip link",
      "ethtool eth0 | grep -i 'link detected'",
      "dmesg | grep -i -E 'eth|link' | tail -20",
      "lspci | grep -i ethernet"
    ],
    fixes: [
      "NO-CARRIER → 先查物理侧：换网线、换交换机口、确认虚拟机网卡勾选了「已连接」",
      "网卡根本不在 ip link 列表里 → 查驱动与硬件识别（lspci 有设备而 ip link 没有 = 驱动问题）"
    ],
    danger: "云主机上不要随意 ip link set down 正在用的网卡：SSH 会立刻断开，只能进云控制台处理。"
  },
  netConflict: {
    leaf: true,
    title: "IP 地址冲突或网关侧拦截",
    causes: [
      "局域网内有另一台机器用了相同 IP（地址冲突）—— 可能性最高：地址在、网关却 ping 不稳/不通",
      "网关侧 ARP 绑定 / MAC 白名单把本机拦了",
      "本机防火墙 OUTPUT/INPUT 链把流量丢了"
    ],
    checks: [
      "ip addr",
      "arping -D -I eth0 本机IP",
      "ip neigh",
      "sudo iptables -L -n --line-numbers | head -40",
      "ping -c3 网关IP 后立刻看 ip neigh 里网关的 MAC 是否稳定"
    ],
    fixes: [
      "arping 检出冲突 → 给本机换一个未被占用的地址，或找到冲突机器改它的地址，并把服务器地址改成 DHCP 保留/静态规划",
      "MAC 一直在变 → 冲突或 ARP 欺骗，抓包定位源 MAC 再处理"
    ],
    danger: "定位冲突时不要直接把「另一台」断网：它可能是正在跑业务的机器，先确认再动。"
  },
  netDhcp: {
    leaf: true,
    title: "IP 地址丢失（DHCP 未续约或静态配置没生效）",
    causes: [
      "DHCP 租约到期未续上、DHCP 服务器不可达，地址回落到 169.254 链路本地地址 —— 可能性最高",
      "netplan 配置写错，apply 没成功，重启后没地址",
      "网卡名变更（eth0 变 ens33 等）导致旧配置对不上"
    ],
    checks: [
      "ip addr",
      "ip link",
      "sudo netplan --debug apply 2>&1 | tail -30",
      "journalctl -u systemd-networkd -n 50 --no-pager",
      "ls /etc/netplan/"
    ],
    fixes: [
      "服务器一律改静态地址或 DHCP 地址保留，不要长期靠自动获取",
      "netplan apply 报错 → 按报错改 YAML（缩进、网卡名），再 apply 并立刻复测 ip addr"
    ],
    danger: "远程改 netplan 前先留好云控制台/带外入口：apply 错地址同样会把自己锁在外面。"
  },
  diskf: {
    label: "磁盘空间满",
    q: "df -h 里占用最高（接近 100%）的挂载点是哪类？",
    options: [
      { t: "根分区 /", n: "dkQ2a" },
      { t: "独立的数据分区", n: "dkQ2b" },
      { t: "都没满（都在 90% 以下），但应用仍报空间不足", n: "dkQ2c" }
    ]
  },
  dkQ2a: {
    q: "用 du 从 / 往下逐层排查，占大头的是什么？",
    options: [
      { t: "日志文件（/var/log）", n: "dkLog" },
      { t: "Docker 数据（/var/lib/docker）", n: "dkDocker" },
      { t: "/tmp 或缓存目录", n: "dkTmp" },
      { t: "du 找不到大文件，但 df 还是满的", n: "dkDeleted" }
    ]
  },
  dkQ2b: {
    q: "数据分区里占大头的是什么？",
    options: [
      { t: "备份文件一层层堆积", n: "dkBackup" },
      { t: "就是业务数据（数据库、上传文件）在自然增长", n: "dkGrow" }
    ]
  },
  dkQ2c: {
    q: "df -i 看 inode 使用率（IUse%）如何？",
    options: [
      { t: "inode 100%（小文件太多）", n: "dkInode" },
      { t: "inode 也正常", n: "dkQuota" }
    ]
  },
  dkLog: {
    leaf: true,
    title: "日志失控增长",
    causes: [
      "某个应用日志没做轮转，或报错刷屏把日志撑爆 —— 可能性最高",
      "journald 没设上限，系统日志无限保留",
      "logrotate 配置失效（轮转了但没压缩/没删除旧文件）"
    ],
    checks: [
      "df -h /",
      "sudo du -xhd1 /var/log | sort -h",
      "journalctl --disk-usage",
      "sudo ls -lhS /var/log | head -20"
    ],
    fixes: [
      "先定位刷屏的源头（哪个服务在狂写错误日志），治源头再清日志",
      "给 journald 设 SystemMaxUse、给应用日志配 logrotate（daily + rotate + compress），改完用 logrotate -d 干跑验证"
    ],
    danger: "不要直接 rm 正在被进程打开的日志文件：空间不会释放（句柄还占着），还丢排障证据。用 truncate 或重启/重开日志的服务，或先 cp 留样再清空。"
  },
  dkDocker: {
    leaf: true,
    title: "Docker 数据堆积",
    causes: [
      "悬空镜像、停止的容器、构建缓存长期不清 —— 可能性最高",
      "容器日志（json-file）没设上限，单个容器日志几个 G",
      "匿名 volume 越攒越多"
    ],
    checks: [
      "docker system df",
      "docker ps -a --size",
      "sudo du -xhd1 /var/lib/docker | sort -h",
      "docker images | head -30"
    ],
    fixes: [
      "先 docker system df 看分类，再针对性清：悬空镜像和构建缓存可清，容器与 volume 逐个确认",
      "给容器加 log 轮转（/etc/docker/daemon.json 里 log-opts max-size/max-file），从源头防日志撑爆"
    ],
    danger: "docker system prune -a --volumes 会删掉未运行容器的镜像与数据卷，可能直接删掉要用的镜像和数据。生产机上禁用一把梭，先逐项列清单再删。"
  },
  dkTmp: {
    leaf: true,
    title: "/tmp 或缓存失控",
    causes: [
      "任务/脚本把临时文件写进 /tmp 后从不清理 —— 可能性最高",
      "包管理缓存（apt archive cache）长期堆积",
      "应用把 /tmp 当数据目录用（还可能被 PrivateTmp 隔离误导排查）"
    ],
    checks: [
      "sudo du -xhd1 /tmp | sort -h",
      "sudo find /tmp -type f -size +100M -ls",
      "sudo du -sh /var/cache/apt/archives"
    ],
    fixes: [
      "按文件归属找到写入方，改它的清理策略；一次性存量按修改时间分批清，别按名字乱删",
      "确认 systemd-tmpfiles 的清理规则在跑（systemd-tmpfiles --clean），必要时给大目录单独定龄规则"
    ],
    danger: "/tmp 里可能有正在运行任务的临时文件与 socket：按「超过 N 天未修改」清，不要无差别清空。"
  },
  dkDeleted: {
    leaf: true,
    title: "文件已删但空间未释放（进程还握着句柄）",
    causes: [
      "大文件被 rm，但仍有进程打开着它，空间要等进程释放句柄才回收 —— 这正是 du 与 df 对不上的原因，可能性最高",
      "（少数）文件系统错误导致计数异常"
    ],
    checks: [
      "df -h /",
      "sudo du -xsh /",
      "sudo lsof +L1 | head -20",
      "sudo ls -l /proc/*/fd 2>/dev/null | grep deleted | head"
    ],
    fixes: [
      "lsof +L1 找到握着已删文件的进程，择机重启该服务释放句柄，空间立即回收",
      "以后删大文件改用先截断（: > 文件）再删，或直接截断不删，避免句柄占用"
    ],
    danger: "不要为了释放空间直接 kill -9 业务进程：先确认进程职责与影响面，按服务重启流程来。"
  },
  dkBackup: {
    leaf: true,
    title: "备份堆积没有保留策略",
    causes: [
      "备份脚本只进不出：每天全量往同一目录堆，没有过期删除 —— 可能性最高",
      "备份失败重试产生大量半成品文件",
      "备份和业务数据同分区，备份把业务的空间先占了"
    ],
    checks: [
      "df -h",
      "sudo du -xhd1 备份目录 | sort -h",
      "sudo ls -lt 备份目录 | head -30",
      "sudo find 备份目录 -type f | wc -l"
    ],
    fixes: [
      "给备份定保留策略（如保留 7 日 + 4 周），脚本里落地自动过期删除，并先干跑列出将删清单再启用",
      "备份尽量与业务数据分分区/分盘，至少给业务盘留警戒线"
    ],
    danger: "删旧备份前先验证最近一份备份真的可恢复（做过恢复演练再删）；把唯一一份好备份删了等于没备份。"
  },
  dkGrow: {
    leaf: true,
    title: "业务数据自然增长，需要扩容规划",
    causes: [
      "数据真实增长，容量见底 —— 先确认不是异常写入再按扩容处理，可能性最高",
      "某个表/目录异常膨胀（重试队列、回收站、软删数据没清）",
      "快照、备份点占用了没算进业务数据的空间"
    ],
    checks: [
      "df -h",
      "sudo du -xhd1 数据目录 | sort -h",
      "sudo du -xhd1 数据目录 | sort -h（隔几天对比增速）",
      "用本站「磁盘空间与容量规划器」按日增量算耗尽日期"
    ],
    fixes: [
      "先分清正常增长与异常膨胀：异常的治源头，正常的按增速规划扩容（LVM 在线扩容或加盘迁移）",
      "给磁盘使用率配告警线（如 80% 预警），别再等到 100% 才发现"
    ],
    danger: "扩容/迁移涉及分区与 LVM 操作：动手前做整盘或至少数据级备份，并准备回滚步骤，命令逐条核对设备名再回车。"
  },
  dkInode: {
    leaf: true,
    title: "inode 耗尽（小文件太多）",
    causes: [
      "海量小文件：缓存碎片、会话文件、邮件队列、未清理的临时小文件 —— 可能性最高",
      "某个程序按请求生成小文件且永不回收",
      "建盘时 inode 密度默认偏低而业务偏小文件"
    ],
    checks: [
      "df -i",
      "sudo find / -xdev -type d -exec sh -c 'echo $(ls -U \"$1\" | wc -l) $1' _ {} \\; 2>/dev/null | sort -rn | head",
      "sudo du --inodes -xhd1 /var | sort -h"
    ],
    fixes: [
      "定位小文件最集中的目录与生成方，改它的清理/落盘策略（如会话改存 Redis、缓存设上限）",
      "存量小文件分批清理；根治要重建文件系统调 inode 数或换独立分区，属规划事项不要在线上仓促做"
    ],
    danger: "按目录批量删小文件时别误伤正在用的会话/队列文件：先按时间过滤（如 30 天前）并小批量验证。"
  },
  dkQuota: {
    leaf: true,
    title: "不是磁盘满：配额、只读挂载或应用自身上限",
    causes: [
      "用户/目录配额（quota）或云盘配额到顶，df 看的是整盘当然不满 —— 可能性最高",
      "文件系统因错误被内核重挂为只读（应用会报空间/写入类错误）",
      "应用自身配置了存储上限（如对象存储桶配额、数据库表空间）"
    ],
    checks: [
      "df -h; df -i",
      "mount | grep -E 'ro,|error'",
      "dmesg | grep -i -E 'remount|read-only|I/O error' | tail",
      "quota -s 2>/dev/null; repquota -a 2>/dev/null | head"
    ],
    fixes: [
      "只读重挂 → 先查 dmesg 的 I/O 错误根源（盘坏、链路问题），处理硬件/云盘问题后再重挂读写，不要反复 remount 硬撑",
      "配额到顶 → 扩配额或按配额口径清数据，并把 df 与配额两套口径分开监控"
    ],
    danger: "文件系统只读重挂往往是底层故障信号：此时强行 remount,rw 继续写可能把文件系统写坏，先备份关键数据再修。"
  },
  memcpu: {
    label: "内存或 CPU 异常",
    q: "主要异常是哪一个？",
    options: [
      { t: "内存耗尽 / 出现 OOM", n: "mcQ2a" },
      { t: "CPU 长期打满", n: "mcQ2b" },
      { t: "负载（load）很高但 CPU 并不忙", n: "mcQ2c" }
    ]
  },
  mcQ2a: {
    q: "top 里占内存最大的是什么？",
    options: [
      { t: "某个业务进程，而且越占越多", n: "mcLeak" },
      { t: "buff/cache 占大头，available 其实还很多", n: "mcCache" },
      { t: "top 里看不到大进程，但内存就是满的", n: "mcShm" }
    ]
  },
  mcQ2b: {
    q: "top 里 CPU 大户是什么状态？",
    options: [
      { t: "业务进程，用户态（us）占比高", n: "mcCpuBiz" },
      { t: "%wa（IO 等待）占比高", n: "mcIowait" },
      { t: "不认识的进程名，或藏在奇怪路径下", n: "mcMiner" }
    ]
  },
  mcQ2c: {
    q: "ps 里 D 状态（不可中断睡眠）的进程多吗？",
    options: [
      { t: "很多 D 状态进程", n: "mcDstate" },
      { t: "D 状态不多，但进程总数异常多", n: "mcFlood" }
    ]
  },
  mcLeak: {
    leaf: true,
    title: "进程内存持续增长（疑似内存泄漏或无上限缓存）",
    causes: [
      "应用内存泄漏或缓存无上限，涨到触发 OOM 被杀 —— 可能性最高",
      "堆外内存 / 内存映射文件不算在 RSS 常规口径里，被低估",
      "容器/服务没设内存上限，一个进程吃光整机连累别人"
    ],
    checks: [
      "free -h",
      "ps aux --sort=-%mem | head -10",
      "dmesg | grep -i 'out of memory' | tail -5",
      "cat /proc/进程PID/status | grep -i vmrss（隔一段时间看两次比增速）"
    ],
    fixes: [
      "短期止血：给服务设 MemoryMax / 容器内存上限并配自动重启，把影响圈在它自己身上",
      "根治：按 RSS 增速与业务量定位泄漏点（结合堆转储与运行时剖析），修应用而不是无限加内存"
    ],
    danger: "不要用 echo 3 > /proc/sys/vm/drop_caches 当常规手段：它只丢缓存、治标都算不上，还会让随后一段时间 IO 变慢。"
  },
  mcCache: {
    leaf: true,
    title: "大概率是误报：缓存占用不等于内存不足",
    causes: [
      "Linux 把空闲内存用作页缓存（buff/cache），这是正常机制：应用真需要时会自动回收 —— 可能性最高",
      "监控只看了 used 没看 available，把缓存算成了已用"
    ],
    checks: [
      "free -h（重点看 available 一列）",
      "cat /proc/meminfo | grep -E 'MemAvailable|Cached|Buffers'",
      "dmesg | grep -i 'out of memory' | tail（没有 OOM 记录更佐证没真缺内存）"
    ],
    fixes: [
      "监控口径改成 MemAvailable 与 OOM 事件，不要按 used 百分比告警",
      "available 也真的低时，回到「内存耗尽」分支按泄漏方向排查"
    ],
    danger: "为了「好看」去清缓存或关缓存监控，会把真实问题藏起来；先改口径，别动系统。"
  },
  mcShm: {
    leaf: true,
    title: "内存被共享内存 / tmpfs / 内核占用",
    causes: [
      "/dev/shm 或 tmpfs 挂载被写满计入内存占用 —— 可能性最高",
      "内核 slab（目录项/ inode 缓存等）异常膨胀",
      "大页内存、驱动预留等不进进程 RSS 的占用"
    ],
    checks: [
      "free -h（看 shared 一列）",
      "df -h /dev/shm; sudo du -sh /dev/shm",
      "grep -E 'Slab|SUnreclaim' /proc/meminfo",
      "sudo slabtop -o | head -15"
    ],
    fixes: [
      "tmpfs 被当存储用 → 找到写入方改落盘路径，并给 tmpfs 挂载设 size 上限",
      "slab 异常 → 看 slabtop 里哪类缓存爆涨，多与小文件/目录项风暴有关，治生成源头"
    ],
    danger: "/dev/shm 里的内容可能被正在运行的进程当共享内存用：清之前先确认归属，别按普通文件直接删。"
  },
  mcCpuBiz: {
    leaf: true,
    title: "业务进程 CPU 打满（热点、死循环或流量突增）",
    causes: [
      "代码热点/死循环/正则回溯等把单核吃满 —— 可能性最高",
      "流量或任务量突增，正常业务被压满",
      "GC 频繁（堆太小或对象暴涨）表现为 CPU 高"
    ],
    checks: [
      "top -H -p 进程PID（看线程级）",
      "ps -eo pid,ppid,%cpu,etime,comm --sort=-%cpu | head",
      "uptime; nproc",
      "vmstat 1 5"
    ],
    fixes: [
      "先分清突增还是持续：突增看入口流量与队列，持续看线程栈/性能剖析定位热点函数",
      "止血手段按序考虑：限流、摘流量、扩容，最后才是重启（重启前先留现场：线程栈、剖析快照）"
    ],
    danger: "直接重启会丢掉定位死循环的全部现场：先抓栈（jstack / gdb / py-spy 等按语言选），再止血。"
  },
  mcIowait: {
    leaf: true,
    title: "CPU 在等 IO（磁盘慢或 IO 打满）",
    causes: [
      "磁盘吞吐/IOPS 到顶或磁盘变慢（云盘限流、盘故障）—— 可能性最高",
      "大量随机小 IO、同步刷盘（fsync）把队列堵住",
      "内存不足引发频繁 swap 换页，伪装成 IO 问题"
    ],
    checks: [
      "top（看 %wa 与 D 状态进程）",
      "iostat -x 1 3",
      "iotop -o（需要 root）",
      "free -h; vmstat 1 5（看 si/so 是否在换页）"
    ],
    fixes: [
      "iostat 里 %util 近 100% 且 await 高 → IO 就是瓶颈：定位写入大户（iotop），再谈扩容云盘规格或拆 IO",
      "si/so 持续非零 → 先解决内存不足，swap 中的机器谈 IO 优化没意义"
    ],
    danger: "不要在 IO 打满时再跑全盘 find/du 之类扫描命令，会把队列堵得更死；用 iostat/iotop 定向看。"
  },
  mcMiner: {
    leaf: true,
    title: "疑似被入侵：异常进程占满 CPU（挖矿木马特征）",
    causes: [
      "机器被入侵并植入挖矿程序 —— 不认识的进程名 + 路径在 /tmp、隐藏目录等位置时可能性最高",
      "（较小概率）运维/监控代理改名或新上的自研程序没登记"
    ],
    checks: [
      "ps -eo pid,ppid,user,%cpu,etime,args --sort=-%cpu | head",
      "ls -l /proc/进程PID/exe /proc/进程PID/cwd",
      "ss -tnp | grep 进程PID",
      "crontab -l; ls -la /etc/cron.d/ /var/spool/cron/crontabs/ 2>/dev/null",
      "last -a | head; grep -E 'Accepted' /var/log/auth.log | tail"
    ],
    fixes: [
      "先取证再处置：记录进程路径、对外连接、计划任务与登录日志，确认入侵入口（弱口令、未修漏洞、泄露密钥）",
      "处置顺序：隔离机器（安全组收口）→ 清持久化（cron、systemd、SSH 密钥）→ 改全部口令与密钥 → 优先重装/回滚到干净快照，而不是只杀进程"
    ],
    danger: "只 kill 进程等于没处理：持久化后门会把它再拉起来。在没取证、没改口令前也不要急着重启，证据会丢。"
  },
  mcDstate: {
    leaf: true,
    title: "大量进程卡在 D 状态（底层 IO 堵死）",
    causes: [
      "磁盘/云盘故障或极慢，进程等 IO 回不来 —— 可能性最高",
      "NFS 等网络文件系统服务端无响应，客户端进程集体卡 D",
      "存储链路（多路径、iSCSI）异常"
    ],
    checks: [
      "ps -eo state,pid,comm | awk '$1 ~ /^D/' ",
      "dmesg | tail -30",
      "cat /proc/进程PID/stack（需要 root，看卡在哪个内核调用）",
      "mount | grep -i nfs; timeout 5 ls NFS挂载点"
    ],
    fixes: [
      "本地盘问题 → 查云盘状态/dmesg 的 I/O error，先处理存储层，进程会自行恢复或需重启",
      "NFS 问题 → 先恢复服务端或链路；客户端进程多数在服务端恢复后自行醒来"
    ],
    danger: "D 状态进程 kill 不掉（不可中断），别反复强杀浪费时间；更不要在存储未恢复时重启业务，会一起卡死。"
  },
  mcFlood: {
    leaf: true,
    title: "进程数暴增或僵尸进程堆积",
    causes: [
      "父进程不回收子进程，僵尸（Z 状态）越攒越多 —— 可能性最高",
      "计划任务/脚本 fork 失控，反复拉起新进程",
      "连接或请求洪峰让 worker 进程数顶格"
    ],
    checks: [
      "ps -eo state,comm | sort | uniq -c | sort -rn | head",
      "ps -eo state,pid,ppid,comm | awk '$1 ~ /^Z/' | head",
      "ps aux | wc -l; cat /proc/loadavg",
      "top -bn1 | head -15"
    ],
    fixes: [
      "僵尸的回收责任在父进程：修父进程的信号处理/等待逻辑，临时处置是重启父进程让 init 接管回收",
      "fork 失控 → 先停掉拉起它的 cron/服务，再清存量"
    ],
    danger: "杀僵尸进程本身没有用（它已经死了）：要处理的是它的父进程，别把 ps 列表里的 Z 挨个 kill 一遍。"
  },
  svc: {
    label: "服务启动失败",
    q: "systemctl status 里服务退出的方式是哪种？",
    options: [
      { t: "启动后立刻退出（exit-code / failed）", n: "svQ2a" },
      { t: "启动超时被杀（timeout）", n: "svTimeout" },
      { t: "根本没被拉起来（依赖或条件问题）", n: "svQ2c" }
    ]
  },
  svQ2a: {
    q: "journalctl 日志里最关键的一条报错是什么？",
    options: [
      { t: "端口/地址已被占用（Address already in use）", n: "svPort" },
      { t: "权限不足 / 文件打不开（Permission denied）", n: "svPerm" },
      { t: "配置文件语法错误", n: "svConf" },
      { t: "可执行文件不存在 / 动态库找不到", n: "svExec" }
    ]
  },
  svQ2c: {
    q: "失败发生在哪一环？",
    options: [
      { t: "依赖的服务没起来，它被连带放弃", n: "svDep" },
      { t: "日志显示 condition 校验不满足、被跳过", n: "svCond" }
    ]
  },
  svTimeout: {
    leaf: true,
    title: "启动超时（Type 与程序行为不匹配最常见）",
    causes: [
      "Type=forking 但程序实际没 fork，或 Type=simple 的程序启动太慢超过 TimeoutStartSec —— 可能性最高",
      "程序在启动阶段卡住（连不上数据库、等某个端口）迟迟不就绪",
      "notify 型服务没有正确发 sd_notify"
    ],
    checks: [
      "systemctl status 服务名",
      "journalctl -u 服务名 -n 80 --no-pager",
      "systemctl show 服务名 -p Type -p TimeoutStartUSec",
      "手动用同样的 ExecStart 命令在前台跑一次看多久就绪"
    ],
    fixes: [
      "先手动前台跑通并计时：程序本身慢就调大 TimeoutStartSec 或拆初始化；程序卡住就修它等的依赖",
      "Type 与程序实际行为对齐：自带 daemon 化的用 forking，前台常驻的用 simple，不要靠加超时掩盖类型写错"
    ],
    danger: "把超时一味调大可能让开机流程被一个坏服务拖住几分钟：先确认程序真的在推进，而不是死等。"
  },
  svPort: {
    leaf: true,
    title: "端口已被占用",
    causes: [
      "同一程序被手动跑了一份，或旧进程没退干净还占着端口 —— 可能性最高",
      "另一个服务/容器恰好用了同一端口",
      "unit 里启了两份相同服务（改名残留）"
    ],
    checks: [
      "sudo ss -lntp | grep 端口",
      "systemctl status 服务名",
      "journalctl -u 服务名 -n 50 --no-pager",
      "sudo lsof -i :端口"
    ],
    fixes: [
      "ss 输出直接给出占用进程：是手动跑的残留就正常停掉它，是别的服务就给一方换端口并同步改配置与防火墙",
      "处理完确认端口空闲再 systemctl restart，不要连环重启碰运气"
    ],
    danger: "别不看归属就 kill 占用端口的进程：它可能正是线上在跑的那份，杀掉等于人为停机。"
  },
  svPerm: {
    leaf: true,
    title: "权限不足（用户、目录权限或加固选项）",
    causes: [
      "User= 指定的运行用户对工作目录/数据目录/日志路径没权限 —— 可能性最高",
      "勾了 ProtectSystem=strict、PrivateTmp 等加固项后，程序要写的地方变只读或不可见",
      "文件属主是 root 而服务以普通用户运行（部署时用 root 拷文件常见）"
    ],
    checks: [
      "journalctl -u 服务名 -n 50 --no-pager",
      "systemctl show 服务名 -p User -p WorkingDirectory -p ProtectSystem",
      "namei -l 出问题的文件完整路径",
      "sudo -u 运行用户 test -r 文件路径 && echo ok"
    ],
    fixes: [
      "按 namei -l 的逐级输出修属主/权限（chown 给运行用户、目录补 x 位）",
      "加固项导致的 → 给数据目录补 ReadWritePaths，或逐项回退加固开关二分定位是哪一项"
    ],
    danger: "不要用 chmod 777 图省事：把数据目录开成全员可写等于放弃权限隔离。用 chown 到运行用户 + 最小权限位解决。"
  },
  svConf: {
    leaf: true,
    title: "配置文件语法错误",
    causes: [
      "最近一次改配置引入语法错误（多/少符号、缩进、编码）—— 可能性最高",
      "配置模板变量没渲染，留下了占位符原文",
      "改的是 A 文件、服务读的却是 B 文件（路径写错）"
    ],
    checks: [
      "journalctl -u 服务名 -n 50 --no-pager（报错通常带行号）",
      "用程序自带的校验命令验配置（如 nginx -t、sshd -t、named-checkconf，按程序选）",
      "systemctl cat 服务名（确认 ExecStart 与配置文件路径）",
      "diff 一下备份配置与现配置"
    ],
    fixes: [
      "按校验命令给出的行号修配置，修完先跑校验通过再 restart",
      "养成改配置三步：先备份、过校验、再重启；校验不过绝不 restart（会把正在跑的好进程也停掉）"
    ],
    danger: "配置错的时候 restart 是最危险的操作：旧进程停了、新进程起不来，故障从「改坏待生效」升级成「服务全停」。先校验再重启。"
  },
  svExec: {
    leaf: true,
    title: "可执行文件或动态库缺失",
    causes: [
      "ExecStart 路径写错或程序根本没装到这台机器 —— 可能性最高",
      "程序是脚本但解释器路径不对（#!/usr/bin/env 与实际路径）",
      "二进制依赖的 .so 动态库缺失（换机器部署常见）"
    ],
    checks: [
      "systemctl cat 服务名",
      "ls -l ExecStart里的路径",
      "file 程序路径; head -1 脚本路径",
      "ldd 程序路径 | grep 'not found'"
    ],
    fixes: [
      "路径问题改 unit 后 daemon-reload 再启动；缺库按 ldd 的 not found 清单补对应的包",
      "脚本类确认解释器存在且脚本有可执行位（chmod +x）"
    ],
    danger: "不要从不明来源下载 .so 文件往系统库目录里塞：只用发行版包管理器装缺失的库，避免把系统库搞坏。"
  },
  svDep: {
    leaf: true,
    title: "依赖服务未就绪导致连带失败",
    causes: [
      "Requires 的强依赖服务自己挂了，本服务被连带停/不启动 —— 可能性最高",
      "只写了 After 没写 Requires/Wants：After 只管顺序不管拉起，依赖根本没被启动",
      "依赖只是「进程起来了」但还没真正就绪（数据库在恢复中），本服务抢先连失败"
    ],
    checks: [
      "systemctl status 服务名 依赖服务名",
      "journalctl -u 依赖服务名 -n 50 --no-pager",
      "systemctl list-dependencies 服务名",
      "systemctl cat 服务名 | grep -E 'After|Requires|Wants'"
    ],
    fixes: [
      "先把依赖服务本身修好启动，再启本服务；顺序反了怎么重启都没用",
      "需要一同拉起就补 Wants（弱）或 Requires（强）；就绪竞速则在应用侧加连接重试，而不是死等固定秒数"
    ],
    danger: "为了绕过依赖失败去删 Requires，等下次依赖真出事时本服务会在坏状态下硬跑，故障更难查。修依赖，不要拆保险。"
  },
  svCond: {
    leaf: true,
    title: "启动条件（Condition）不满足被跳过",
    causes: [
      "unit 里的 ConditionPathExists 等条件当前不成立，systemd 直接跳过（状态常显示 inactive 且带 condition 字样）—— 可能性最高",
      "Condition 不是报错而是设计如此：条件文件/主机名/虚拟化类型对不上都被跳过，容易被误报成「启动失败」"
    ],
    checks: [
      "systemctl status 服务名",
      "systemctl cat 服务名 | grep -i condition",
      "journalctl -u 服务名 -n 30 --no-pager",
      "systemd-analyze condition '条件表达式'（在目标机器上验证）"
    ],
    fixes: [
      "逐条核对条件与机器现状：该有的文件为什么不在，是部署漏了还是条件本就写错",
      "确认属误设就改/删条件行，daemon-reload 后再启动"
    ],
    danger: "别为了让服务「能起来」把全部 Condition 注释掉：有些条件是防误启的保险（如只在某主机运行），删前先搞清当初为什么加。"
  },
  perm: {
    label: "权限与访问问题",
    q: "具体表现是哪一种？",
    options: [
      { t: "SSH 登录被拒", n: "pmQ2a" },
      { t: "命令或程序报 Permission denied", n: "pmQ2b" },
      { t: "网站返回 403", n: "pmQ2c" }
    ]
  },
  pmQ2a: {
    q: "用的是哪种登录方式？",
    options: [
      { t: "密钥登录，被拒（publickey）", n: "pmKey" },
      { t: "密码登录，密码正确也进不去或连上就断", n: "pmSshd" }
    ]
  },
  pmQ2b: {
    q: "出问题的是哪类操作？",
    options: [
      { t: "执行脚本/程序时被拒", n: "pmExecbit" },
      { t: "往目录里写文件被拒", n: "pmQ3b" }
    ]
  },
  pmQ3b: {
    q: "ls -ld 看目标目录的属主和权限位是什么情况？",
    options: [
      { t: "属主不是当前用户、权限位也不给 others 写", n: "pmOwner" },
      { t: "权限位看着够，却还是被拒", n: "pmAcl" }
    ]
  },
  pmQ2c: {
    q: "403 出现在哪一层？",
    options: [
      { t: "直接访问静态文件就 403", n: "pmWebperm" },
      { t: "经过反向代理后才 403，直连后端正常", n: "pmProxy403" }
    ]
  },
  pmKey: {
    leaf: true,
    title: "SSH 密钥登录被拒",
    causes: [
      "服务器上 ~/.ssh 或 authorized_keys 权限过宽，sshd 的 StrictModes 直接拒绝用它 —— 可能性最高",
      "公钥没放对用户/对文件（放到了 root 的目录却用普通用户登）",
      "客户端用的私钥与 authorized_keys 里的公钥不是一对"
    ],
    checks: [
      "ssh -v 用户@主机 2>&1 | tail -30（看客户端提出哪把钥匙、服务器怎么拒）",
      "ls -ld ~/.ssh; ls -l ~/.ssh/authorized_keys（服务器侧，属主必须是登录用户、权限 700/600）",
      "tail -50 /var/log/auth.log（服务器侧看拒绝原因）",
      "ssh-keygen -lf ~/.ssh/authorized_keys（比对指纹）"
    ],
    fixes: [
      "权限修到位：~/.ssh 700、authorized_keys 600、家目录不要 group 可写，属主必须是登录用户本人",
      "指纹对不上就重新下发正确公钥，追加而不是覆盖 authorized_keys 里已有的钥匙"
    ],
    danger: "排障时不要把 StrictModes 关掉或把家目录改 777 图省事：等于把密钥校验的安全底线拆掉。用正确权限解决。"
  },
  pmSshd: {
    leaf: true,
    title: "SSHD 配置或账户状态问题",
    causes: [
      "sshd_config 禁了密码登录（PasswordAuthentication no）或限制了 AllowUsers —— 可能性最高",
      "账户被锁定/过期，或登录 shell 不存在导致连上就断",
      "fail2ban 把你的来源 IP 拉黑了（密码错太多次常见）"
    ],
    checks: [
      "sudo sshd -t; sudo sshd -T | grep -i -E 'passwordauthentication|allowusers|permitrootlogin'",
      "sudo grep -E 'Failed|refused|ban' /var/log/auth.log | tail -20",
      "sudo fail2ban-client status sshd 2>/dev/null",
      "getent passwd 用户名; sudo chage -l 用户名"
    ],
    fixes: [
      "按 sshd -T 的实际生效值改配置（注意 .d 目录里的片段会覆盖主文件），改完先 sshd -t 校验再 reload",
      "被 fail2ban 拉黑 → 解封自己的 IP 并改用密钥登录，别关掉 fail2ban"
    ],
    danger: "改 sshd 时务必留一个已登录的会话别关：新开窗口验证能登入再关旧的，否则配置写错就把自己锁在门外。"
  },
  pmExecbit: {
    leaf: true,
    title: "文件缺可执行位或挂载 noexec",
    causes: [
      "脚本/程序没有 x 执行位（拷贝、解压、git 拉取后常见）—— 可能性最高",
      "所在分区以 noexec 挂载（/tmp 常见），有执行位也跑不了",
      "解释器脚本的首行 shebang 指向不存在的解释器（报错形式相近，先分辨）"
    ],
    checks: [
      "ls -l 目标文件",
      "mount | grep -E 'noexec'",
      "head -1 脚本文件",
      "bash 脚本路径（能跑通说明就是执行位/挂载问题）"
    ],
    fixes: [
      "缺执行位 → chmod +x；noexec 分区 → 把程序移到允许执行的目录，不要为了跑个脚本把整分区改 exec",
      "shebang 错 → 改成机器上真实存在的解释器路径"
    ],
    danger: "来路不明的脚本先 cat 看内容再 +x 执行：Permission denied 有时正是最后一道提醒，别闭眼绕过。"
  },
  pmOwner: {
    leaf: true,
    title: "目录属主/权限位不对",
    causes: [
      "目录属主是 root（部署、解压、sudo 操作时留下的），业务用户写不进去 —— 可能性最高",
      "路径中间某一级目录缺 x（穿越）权限：只看最后一级会误判",
      "程序换了运行用户，老数据目录还归旧用户"
    ],
    checks: [
      "namei -l 目标目录完整路径（逐级看属主与权限）",
      "id 当前用户",
      "ls -ld 目录 目录的每一级父目录",
      "sudo -u 运行用户 touch 目录/测试文件 && echo ok"
    ],
    fixes: [
      "按 namei 的逐级结果修：该 chown 的 chown 给运行用户、该补 x 的补 x，改完用运行用户身份复测写入",
      "部署流程里加一步统一属主，避免下次发布又覆盖回 root"
    ],
    danger: "不要对业务目录递归 chmod 777/chown -R 到个人账号：先确认范围，递归改错目录（比如整个 /var）会把一堆服务的权限一起搞坏。"
  },
  pmAcl: {
    leaf: true,
    title: "权限位之外还有 ACL / 安全模块 / 只读挂载在拦",
    causes: [
      "目录上有 ACL（ls 显示权限位末尾带 +），默认条目与权限位口径不一致 —— 可能性最高",
      "SELinux / AppArmor 拒绝（权限位全对也拒，日志里有 AVC/denied）",
      "文件带 immutable 属性或分区只读挂载"
    ],
    checks: [
      "ls -l 目录; getfacl 目录",
      "lsattr -d 目录",
      "mount | grep 目录所在分区",
      "sudo ausearch -m AVC -ts recent 2>/dev/null | tail; sudo dmesg | grep -i denied | tail"
    ],
    fixes: [
      "ACL 问题用 setfacl 补对应用户/默认条目，不要只盯 chmod（chmod 改的是 mask 会连带影响 ACL 生效值）",
      "SELinux/AppArmor → 按审计日志确认是策略拦截后，用发行版正规方式加放行规则，不要图省事全局关闭安全模块"
    ],
    danger: "setenforce 0 / 关 AppArmor 只能用于临时定位，定位完必须恢复并补规则；长期关着等于裸奔。"
  },
  pmWebperm: {
    leaf: true,
    title: "Web 服务器读不到文件（属主/穿越权限）",
    causes: [
      "站点目录或文件属主不对，www-data 等运行用户读不到 —— 可能性最高",
      "路径中间某一级目录对运行用户缺 x 位（文件本身权限再对也没用）",
      "Nginx/Apache 配置里 root 指错目录，读的根本不是你以为的那份文件"
    ],
    checks: [
      "namei -l 站点文件完整路径",
      "sudo -u www-data test -r 文件 && echo ok",
      "tail -30 /var/log/nginx/error.log（403 时会写 Permission denied 与真实路径）",
      "nginx -T | grep -E 'root|server_name'"
    ],
    fixes: [
      "按 error.log 给出的真实路径逐级修权限：目录给运行用户 x、文件给 r，静态站点可统一属主为 www-data 或部署用户 + 组读",
      "root 指错就改配置并 nginx -t 校验后 reload"
    ],
    danger: "不要把整个站点目录 chmod -R 777：上传目录一旦可写又可被 Web 读执行，容易被利用。按最小权限逐级修。"
  },
  pmProxy403: {
    leaf: true,
    title: "代理层 403（后端权限没问题）",
    causes: [
      "代理或 CDN/WAF 的规则拦截（IP 白名单、地区、UA、速率）—— 可能性最高",
      "代理回源用的 Host 头与后端虚拟主机对不上，后端按默认站点拒绝",
      "后端只允许代理的回源 IP，来源变了（换 CDN、加节点）没同步白名单"
    ],
    checks: [
      "curl -I https://域名（经代理）与 curl --resolve 直连后端各测一次对比",
      "tail -30 后端 access.log（看 403 请求的来源 IP 与 Host）",
      "tail -30 /var/log/nginx/error.log",
      "检查 CDN/WAF 控制台的拦截日志与白名单"
    ],
    fixes: [
      "先按「请求到底到没到后端」定界：后端日志里根本没有这条 → 在代理/CDN 层处理；到了后端才 403 → 查 Host 与回源白名单",
      "回源白名单按 CDN 公布的回源段维护，不要放行 0.0.0.0/0 图省事"
    ],
    danger: "为了快速恢复去关 WAF/放行全部来源，等于把防护整体拆掉：只放行确有需要的回源段与路径，处理完复核规则。"
  }
};
var diagPath = [];
function diagNodeLabel(id) {
  var node = DIAG_TREE[id];
  if (!node) { return id; }
  return node.label || node.title || id;
}
function diagRender() {
  var steps = document.getElementById("diag-steps");
  if (!steps) { return; }
  while (steps.firstChild) { steps.removeChild(steps.firstChild); }
  var depth;
  for (depth = 0; depth < diagPath.length; depth++) {
    var node = DIAG_TREE[diagPath[depth]];
    if (!node || node.leaf) { break; }
    var p = document.createElement("p");
    var lab = document.createElement("label");
    lab.appendChild(document.createTextNode("第 " + (depth + 2) + " 步：" + node.q + " "));
    var sel = document.createElement("select");
    sel.setAttribute("data-depth", String(depth));
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.appendChild(document.createTextNode("—— 请选择 ——"));
    sel.appendChild(opt0);
    node.options.forEach(function (op) {
      var o = document.createElement("option");
      o.value = op.n;
      o.appendChild(document.createTextNode(op.t));
      sel.appendChild(o);
    });
    sel.value = diagPath[depth + 1] || "";
    sel.addEventListener("change", function () {
      var d = parseInt(this.getAttribute("data-depth"), 10);
      diagPath = diagPath.slice(0, d + 1);
      if (this.value) { diagPath.push(this.value); }
      diagRender();
      diagGenerate();
    });
    lab.appendChild(sel);
    p.appendChild(lab);
    steps.appendChild(p);
  }
}
function diagGenerate() {
  var out = document.getElementById("diag-out");
  if (!out) { return; }
  var errBox = document.getElementById("diag-err");
  errBox.style.display = "none";
  if (!diagPath.length) {
    out.textContent = "# 在上方选择症状大类开始诊断。本工具只展示检查命令与处理思路，不会执行任何命令。\n# 流程：逐级回答问题 → 得到最可能原因排序、可复制的检查命令、修复方向与危险操作警告。";
    return;
  }
  var lines = [];
  var summary = [];
  var i, node, chosen;
  for (i = 0; i < diagPath.length; i++) {
    node = DIAG_TREE[diagPath[i]];
    if (i === 0) { summary.push(node.label || node.title || diagPath[i]); continue; }
    var prev = DIAG_TREE[diagPath[i - 1]];
    var txt = diagPath[i];
    if (prev && prev.options) {
      for (var j = 0; j < prev.options.length; j++) {
        if (prev.options[j].n === diagPath[i]) { txt = prev.options[j].t; break; }
      }
    }
    summary.push(txt);
  }
  lines.push("已走路径：" + summary.join(" › "));
  lines.push("");
  chosen = DIAG_TREE[diagPath[diagPath.length - 1]];
  if (chosen && chosen.leaf) {
    lines.push("结论：" + chosen.title);
    lines.push("");
    lines.push("最可能原因（按可能性排序）：");
    chosen.causes.forEach(function (c, idx) { lines.push("  " + (idx + 1) + ". " + c); });
    lines.push("");
    lines.push("检查命令（逐条复制到目标机器执行，先只读检查、后动手修复）：");
    chosen.checks.forEach(function (c) { lines.push("  $ " + c); });
    lines.push("");
    lines.push("修复方向：");
    chosen.fixes.forEach(function (f) { lines.push("  - " + f); });
    lines.push("");
    lines.push("⚠ 危险操作警告：" + chosen.danger);
    lines.push("⚠ 通用红线：生产机上涉及 rm、kill -9、重启关键服务、改网络/权限配置的动作，先确认备份、回滚通道与带外入口再动手。");
  } else {
    lines.push("当前问题：" + (chosen ? chosen.q : ""));
    lines.push("请在上方「第 " + (diagPath.length + 1) + " 步」的下拉框里选择最接近你实际情况的一项，结论会随选择逐级收窄。");
    lines.push("提示：每个问题下面给的命令（如 df -h、ip link）就是判断这一项该怎么选的方法，先在机器上看一眼再选。");
  }
  out.textContent = lines.join("\n");
}
function initDiag() {
  var out = document.getElementById("diag-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var cat = document.getElementById("diag-cat");
  if (cat) {
    cat.addEventListener("change", function () {
      diagPath = this.value ? [this.value] : [];
      diagRender();
      diagGenerate();
    });
  }
  bindCopy("diag-copy", "diag-out", "diag-msg");
  var clearBtn = document.getElementById("diag-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (cat) { cat.value = ""; }
      diagPath = [];
      diagRender();
      diagGenerate();
      document.getElementById("diag-msg").textContent = "已清空";
    });
  }
  diagRender();
  diagGenerate();
}

/* ================= N-12 Docker Compose 安全审查器（csrev） =================
   基于缩进与行模式的务实扫描，不引入 YAML 解析库。
   边界：锚点(&)、合并键(<<:)、多文档(---)、长语法端口条目分组等复杂
   YAML 可能误判，输出里会明说。本工具不回显 environment 的值。 */
var CSREV_DB_PORTS = { "3306": 1, "5432": 1, "6379": 1, "27017": 1, "9200": 1, "9300": 1, "11211": 1, "1433": 1, "1521": 1, "5984": 1, "8086": 1 };
function csrevFind(findings, lv, line, svc, msg, basis, fix) {
  findings.push({ lv: lv, line: line, svc: svc || "", msg: msg, basis: basis, fix: fix });
}
function csrevStripVal(v) {
  var s = String(v == null ? "" : v).trim();
  var hash = s.indexOf(" #");
  if (hash >= 0 && s.charAt(0) !== '"' && s.charAt(0) !== "'") { s = s.slice(0, hash).trim(); }
  if (s.length >= 2 && ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))) {
    s = s.slice(1, -1);
  }
  return s;
}
function csrevCheckImage(findings, lineNo, svc, rawVal) {
  var v = csrevStripVal(rawVal);
  if (!v) { return; }
  if (v.indexOf("@sha256:") >= 0) { return; }
  var lastSeg = v.split("/").pop();
  var colon = lastSeg.lastIndexOf(":");
  if (colon < 0) {
    csrevFind(findings, 1, lineNo, svc, "镜像 " + v + " 未写 tag", "无 tag 时 Compose 默认拉取 latest，版本不可控、不可复现，出问题难回滚到确切版本。", "把镜像固定到确切版本 tag（如 nginx:1.27.3），更稳妥的是固定到 digest（image: 名称:tag@sha256:…）。");
  } else if (lastSeg.slice(colon + 1) === "latest") {
    csrevFind(findings, 1, lineNo, svc, "镜像 " + v + " 使用 :latest", "latest 指向会随时间漂移：同一份 compose 在不同时间拉到的镜像可能不同，升级不可控。", "改成确切版本 tag 并纳入变更流程；要升级时显式改 tag 再 pull。");
  }
}
function csrevCheckVolume(findings, lineNo, svc, item) {
  var v = csrevStripVal(item);
  if (!v) { return; }
  var src = v;
  var colon = v.indexOf(":");
  if (colon >= 0) { src = v.slice(0, colon); }
  if (src.charAt(0) !== "/" && src.charAt(0) !== "~") { return; }
  if (src === "/") {
    csrevFind(findings, 0, lineNo, svc, "把宿主机根目录 / 挂进容器", "容器内进程可读写整个宿主机文件系统，容器逃逸与否都已无区别，等同交出整台机器。", "只挂载确有需要的具体子目录，并优先加 :ro 只读；宿主机根目录绝不整盘挂载。");
  } else if (src === "/var/run/docker.sock" || /docker\.sock$/.test(src)) {
    csrevFind(findings, 0, lineNo, svc, "挂载 Docker 套接字 " + src, "能访问 docker.sock 就能向 Docker 守护进程下命令、再起一个特权容器，属于事实上的宿主机 root。", "除非该容器就是专门的 Docker 管理组件且你清楚后果，否则去掉这行挂载；需要编排能力时改走受控的 API 代理并限制来源。");
  } else if (src === "/etc" || src.indexOf("/etc/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载敏感目录 " + src, "/etc 含账户、服务配置与密钥材料，容器内可读会扩大泄露面，可写更可直接改宿主机配置。", "缩小到单个必要文件并加 :ro；密钥改用 secrets 或只读单文件挂载，不要整目录挂入。");
  } else if (src === "/root" || src.indexOf("/root/") === 0 || src === "/proc" || src.indexOf("/proc/") === 0 || src === "/sys" || src.indexOf("/sys/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载敏感目录 " + src, "该目录含高权限凭据或内核接口，挂入容器会显著扩大攻击面。", "取消挂载或缩小到具体文件并只读；确需内核信息时优先用受限的替代接口。");
  } else if (src === "/var/run" || src.indexOf("/var/run/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载运行时目录 " + src, "/var/run（/run）下有各服务的套接字与 pid 文件，整目录挂入会让容器碰到宿主机其他服务。", "只挂载确需的那一个套接字文件，并评估对方服务的权限模型。");
  }
}
function csrevCheckPort(findings, lineNo, svc, item) {
  var v = csrevStripVal(item);
  if (!v) { return; }
  v = v.replace(/\/(tcp|udp|sctp)$/i, "");
  var parts = v.split(":");
  if (parts.length < 2) { return; }
  var hostPort, bindIp = null;
  if (parts.length === 2) { hostPort = parts[0]; }
  else { bindIp = parts[0]; hostPort = parts[1]; }
  hostPort = hostPort.split("-")[0];
  if (!/^\d+$/.test(hostPort)) { return; }
  if (bindIp === "127.0.0.1" || bindIp === "::1") { return; }
  if (CSREV_DB_PORTS[hostPort]) {
    csrevFind(findings, 0, lineNo, svc, "数据库端口 " + hostPort + " 对所有网卡发布" + (bindIp ? "（" + bindIp + "）" : "（未写绑定 IP，默认 0.0.0.0）"), "数据库端口直接暴露在所有接口上，一旦弱口令或漏洞被利用就是数据泄露/被删库勒索的经典路径；且 Docker 发布端口默认绕过 UFW 等主机防火墙规则。", "改绑本机回环：如 \"127.0.0.1:" + hostPort + ":" + hostPort + "\"，应用与数据库在同一 compose 网络里用服务名互访即可；确需远程管理走 SSH 隧道或 VPN。");
  } else if (bindIp === "0.0.0.0" || bindIp === "[::]") {
    csrevFind(findings, 1, lineNo, svc, "端口 " + hostPort + " 显式绑定 0.0.0.0 对外发布", "显式全接口发布意味着任何能到达这台主机网络的人都能连这个端口；且 Docker 发布端口默认绕过 UFW 类主机防火墙。", "确认该端口确实要对外提供服务；只是本机/内网用就改绑 127.0.0.1 或内网 IP。");
  }
}
function csrevCheckEnv(findings, lineNo, svc, key, rawVal) {
  var v = csrevStripVal(rawVal);
  if (!v) { return; }
  if (v.charAt(0) === "$") { return; }
  if (/_FILE$/i.test(key)) { return; }
  if (/PASSWORD|PASSWD|SECRET|TOKEN/i.test(key)) {
    csrevFind(findings, 0, lineNo, svc, "environment 里明文写了 " + key + "（值不回显）", "密钥明文写进 compose 文件，会随文件进 Git、进备份、进截图，泄露面不可控；文件一旦提交过仓库，改掉也等于已泄露。", "改用 ${变量} 引用放进未入库的 .env（并加入 .gitignore），或用 Docker secrets；已经提交过仓库的密钥要按已泄露处理、立即更换。");
  } else if (/KEY/i.test(key)) {
    csrevFind(findings, 1, lineNo, svc, "environment 里明文写了 " + key + "（值不回显）", "键名带 KEY 的值多为 API 密钥类凭据，明文进 compose 文件同样会随文件扩散。", "改用 ${变量} 引用或 secrets 注入；确认这不是密钥时可忽略本条。");
  }
}
function csrevCheckCap(findings, lineNo, svc, item) {
  var v = csrevStripVal(item).toUpperCase();
  if (v === "ALL" || v === "SYS_ADMIN" || v === "SYS_MODULE") {
    csrevFind(findings, 0, lineNo, svc, "cap_add 包含高危项 " + v, v === "ALL" ? "ALL 等于放弃 capability 收口，容器接近特权状态。" : v + " 赋予接近宿主机管理级的内核能力，是容器逃逸的常见跳板。", "去掉该 capability；确实需要时逐项论证最小集合，并配合只读根文件系统与 user 限制。");
  } else if (v === "NET_ADMIN" || v === "SYS_PTRACE" || v === "DAC_OVERRIDE" || v === "SYS_TIME") {
    csrevFind(findings, 1, lineNo, svc, "cap_add 包含敏感项 " + v, "这类 capability 能改网络配置、窥探其他进程或绕过文件权限检查，不是普通应用需要的。", "确认业务真的需要它（如抓包、改路由的网络工具）再保留，并尽量缩小到单个容器；普通应用直接删除。");
  }
}
function csrevGenerate() {
  var out = document.getElementById("csrev-out");
  if (!out) { return; }
  var errBox = document.getElementById("csrev-err");
  errBox.style.display = "none";
  var raw = document.getElementById("csrev-input").value;
  if (!raw.replace(/\s+/g, "")) {
    out.textContent = "# 把 docker-compose.yml 的内容粘贴到上方，点「开始审查」。\n# 本工具在浏览器本地按行扫描，不上传、不保存；查不出的问题不等于不存在，上线前仍建议人工通读一遍。";
    return;
  }
  var truncated = false;
  var text = raw;
  if (text.length > 100000) { text = text.slice(0, 100000); truncated = true; }
  var lines = text.split("\n");
  var findings = [];
  var services = {};
  var svcOrder = [];
  var inServices = false, sawServices = false, svcIndent = -1, curSvc = null;
  var stack = [];
  var sawAnchor = /<<:/.test(text) || /(^|\s)&[A-Za-z_][\w-]*/.test(text) || /^\s*---/m.test(text);
  var sawTab = false;
  function stackHas(key) {
    for (var si = 0; si < stack.length; si++) { if (stack[si].key === key) { return true; } }
    return false;
  }
  function topKey() { return stack.length ? stack[stack.length - 1].key : ""; }
  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1;
    var rawLine = lines[i];
    if (rawLine.indexOf("\t") >= 0) { sawTab = true; }
    var trimmedAll = rawLine.replace(/^\s+/, "");
    if (!trimmedAll || trimmedAll.charAt(0) === "#") { continue; }
    var indent = rawLine.length - trimmedAll.length;
    var isItem = trimmedAll === "-" || trimmedAll.indexOf("- ") === 0;
    if (isItem) {
      while (stack.length && stack[stack.length - 1].indent > indent) { stack.pop(); }
      var itemText = trimmedAll === "-" ? "" : trimmedAll.slice(2);
      var parent = topKey();
      if (curSvc) {
        if (parent === "volumes") { csrevCheckVolume(findings, lineNo, curSvc, itemText); }
        else if (parent === "ports") { csrevCheckPort(findings, lineNo, curSvc, itemText); }
        else if (parent === "cap_add") { csrevCheckCap(findings, lineNo, curSvc, itemText); }
        else if (parent === "environment") {
          var em = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(csrevStripVal(itemText));
          if (em) { csrevCheckEnv(findings, lineNo, curSvc, em[1], em[2]); }
        }
      }
      continue;
    }
    var km = /^([^:\s][^:]*):\s*(.*)$/.exec(trimmedAll);
    if (!km) { continue; }
    var key = csrevStripVal(km[1]);
    var val = km[2];
    while (stack.length && stack[stack.length - 1].indent >= indent) { stack.pop(); }
    if (indent === 0) {
      inServices = key === "services";
      if (inServices) { sawServices = true; }
      curSvc = null; svcIndent = -1;
      stack.push({ indent: indent, key: key });
      continue;
    }
    if (inServices) {
      if (svcIndent < 0 || indent === svcIndent) {
        svcIndent = indent;
        curSvc = key;
        if (!services[curSvc]) {
          services[curSvc] = { line: lineNo, hasUser: false, hasMem: false, hasCpu: false, hasImage: false, hasBuild: false };
          svcOrder.push(curSvc);
        }
        stack.push({ indent: indent, key: key });
        continue;
      }
      if (indent < svcIndent) { curSvc = null; stack.push({ indent: indent, key: key }); continue; }
    }
    stack.push({ indent: indent, key: key });
    if (!curSvc) { continue; }
    var rec = services[curSvc];
    var valClean = csrevStripVal(val);
    if (key === "privileged" && /^true$/i.test(valClean)) {
      csrevFind(findings, 0, lineNo, curSvc, "privileged: true（特权模式）", "特权模式让容器拿到几乎全部宿主机能力与设备访问权，隔离基本失效，是 compose 里风险最高的一项。", "去掉 privileged: true；确实需要某项能力时改用 cap_add 逐项添加、devices 只给具体设备。");
    } else if (key === "network_mode" && (valClean === "host" || valClean === "\"host\"")) {
      csrevFind(findings, 0, lineNo, curSvc, "network_mode: host（与宿主机共用网络）", "容器直接使用宿主机网络栈：端口发布设置全部失效、无法用主机防火墙按容器隔离，容器里监听即等于在宿主机上监听。", "改回默认 bridge 网络并用 ports 显式发布需要的端口；确需 host 网络的组件（如某些监控探针）单独部署并收紧权限。");
    } else if (key === "image") {
      rec.hasImage = true;
      csrevCheckImage(findings, lineNo, curSvc, val);
    } else if (key === "build") {
      rec.hasBuild = true;
    } else if (key === "user") {
      rec.hasUser = true;
      if (valClean === "root" || valClean === "0" || valClean === "0:0" || valClean === "root:root") {
        csrevFind(findings, 1, lineNo, curSvc, "user 显式设为 root", "显式以 root 运行等于放弃容器内的第一道权限隔离；进程被攻破即拿到容器内最高权限。", "在镜像里建普通用户并把 user 改成它（或至少确认应用本身会降权），同时保证它对数据卷有必要权限。");
      }
    } else if (key === "mem_limit") {
      rec.hasMem = true;
    } else if (key === "cpus" || key === "nano_cpus") {
      rec.hasCpu = true;
    } else if (key === "memory" && stackHas("limits")) {
      rec.hasMem = true;
    } else if (key === "source" && stackHas("volumes")) {
      csrevCheckVolume(findings, lineNo, curSvc, val);
    } else if (key === "host_ip" && (valClean === "0.0.0.0" || valClean === "::" || valClean === "[::]")) {
      csrevFind(findings, 1, lineNo, curSvc, "长语法端口条目 host_ip 为 " + valClean, "该端口条目会绑定到所有网卡对外发布。", "把 host_ip 改成 127.0.0.1 或内网 IP；数据库类端口尤其不要全接口发布。");
    } else if (stackHas("environment")) {
      csrevCheckEnv(findings, lineNo, curSvc, key, val);
    }
  }
  svcOrder.forEach(function (name) {
    var r = services[name];
    if (!r.hasUser) {
      csrevFind(findings, 2, r.line, name, "未指定 user，默认以 root 运行", "没有 user: 时容器进程就是 root；配合任何挂载或 capability 问题，影响都会被放大。", "在镜像里建普通用户并在此写 user: 用户名/UID，确认数据卷权限匹配。");
    }
    if (!r.hasMem && !r.hasCpu) {
      csrevFind(findings, 1, r.line, name, "未设置任何资源限制（mem_limit / cpus 或 deploy.resources.limits）", "无限制的容器可以吃光宿主机内存与 CPU：一个服务内存泄漏就能拖死整机其他服务。", "按服务实际用量给 mem_limit 与 cpus（或 deploy 资源限制），先给宽松值再按监控收紧。");
    } else if (!r.hasMem || !r.hasCpu) {
      csrevFind(findings, 2, r.line, name, "只设置了一项资源限制（" + (r.hasMem ? "有内存无 CPU" : "有 CPU 无内存") + "）", "内存与 CPU 是两类不同的耗尽方式，只限一项仍可能被另一项拖垮整机。", "把另一项也补上。");
    }
    if (!r.hasImage && !r.hasBuild) {
      csrevFind(findings, 2, r.line, name, "既无 image 也无 build，无法判断镜像来源", "本工具按 image 字段核对标签固定情况；两项都没有时无法审查这一项。", "人工确认该服务的镜像来源与版本固定方式。");
    }
  });
  if (!sawServices) {
    csrevFind(findings, 1, 1, "", "未找到顶层 services:", "可能不是 docker-compose 文件、顶层键名写错，或缩进层级异常；上面的结果仅来自全局模式扫描，完整性有限。", "确认文件是 compose 格式且 services: 位于顶层（无缩进）。");
  }
  if (sawAnchor) {
    csrevFind(findings, 2, 1, "", "检测到 YAML 锚点 / 合并键 / 多文档等复杂语法", "本工具按行与缩进扫描、不解析锚点展开后的结构，这类写法的实际生效值可能与扫描结果不一致。", "复杂文件请以 docker compose config 展开后的结果为准再人工复核。");
  }
  if (sawTab) {
    csrevFind(findings, 2, 1, "", "检测到 Tab 缩进", "YAML 规范不允许用 Tab 缩进，Compose 解析会直接报错，本工具按空格缩进的推断也可能不准。", "把缩进统一改成空格（通常 2 个）。");
  }
  if (truncated) {
    csrevFind(findings, 2, 1, "", "输入超过 100000 字符，仅审查了前 100000 字符", "超长输入被截断，后半部分的风险项不在本次结果内。", "把文件拆成单个 compose 分别审查。");
  }
  findings.sort(function (a, b) {
    if (a.lv !== b.lv) { return a.lv - b.lv; }
    return a.line - b.line;
  });
  var counts = [0, 0, 0];
  findings.forEach(function (f) { counts[f.lv]++; });
  var LV = ["✗ 严重", "⚠ 警告", "提示"];
  var L = [];
  L.push("Compose 安全审查结果");
  L.push("识别到的服务：" + (svcOrder.length ? svcOrder.join("、") : "（无）"));
  L.push("合计：严重 " + counts[0] + " 项 / 警告 " + counts[1] + " 项 / 提示 " + counts[2] + " 项");
  L.push("");
  if (!findings.length) {
    L.push("✓ 在本工具覆盖范围内未发现风险项。");
  }
  findings.forEach(function (f) {
    L.push("[" + LV[f.lv] + "] 第 " + f.line + " 行" + (f.svc ? " · 服务 " + f.svc : "") + "：" + f.msg);
    L.push("  依据：" + f.basis);
    L.push("  建议：" + f.fix);
    L.push("");
  });
  L.push("说明：本工具按行与缩进做务实扫描，不引入 YAML 解析库；锚点(&)、合并键(<<:)、");
  L.push("多文档(---)与长语法端口分组等复杂写法可能误判，请以 docker compose config");
  L.push("展开结果人工复核为准。environment 的值全程不回显（包括非密钥项）。");
  out.textContent = L.join("\n");
}
function initCsrev() {
  var out = document.getElementById("csrev-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("csrev-run");
  if (run) { run.addEventListener("click", csrevGenerate); }
  bindCopy("csrev-copy", "csrev-out", "csrev-msg");
  var clearBtn = document.getElementById("csrev-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("csrev-input").value = "";
      csrevGenerate();
      document.getElementById("csrev-msg").textContent = "已清空";
    });
  }
  csrevGenerate();
}

/* ================= N-07 磁盘空间与容量规划器（disk） =================
   公式：已用 = 总容量 × 已用%（或直接填已用容量）；剩余 = 总容量 − 已用；
   耗尽天数 = 剩余 ÷ 日增长；到警戒线天数 = (警戒线容量 − 已用) ÷ 日增长；
   撑到目标天数需扩容 = 已用 + 日增长 × 目标天数 − 总容量（为正才需要）。 */
function diskNum(id, label, errs) {
  var raw = document.getElementById(id).value.trim();
  if (!raw) { return null; }
  var v = Number(raw);
  if (!isFinite(v)) { errs.push(label + " 不是有效数字"); return null; }
  return v;
}
function diskFmtDate(daysFromNow) {
  var d = new Date(Date.now() + daysFromNow * 86400000);
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}
function diskGenerate() {
  var out = document.getElementById("disk-out");
  if (!out) { return; }
  var errBox = document.getElementById("disk-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var errs = [];
  var total = diskNum("disk-total", "总容量", errs);
  var usedPct = diskNum("disk-usedpct", "已用百分比", errs);
  var usedGB = diskNum("disk-usedgb", "已用容量", errs);
  var growth = diskNum("disk-growth", "日增长量", errs);
  var warnPct = diskNum("disk-warnpct", "警戒线百分比", errs);
  var target = diskNum("disk-target", "目标天数", errs);
  if (errs.length) { fail(errs.join("；")); return; }
  if (total === null) { fail("请填写总容量"); return; }
  if (total <= 0) { fail("总容量必须大于 0"); return; }
  if (usedPct === null && usedGB === null) { fail("已用百分比与已用容量至少填一个"); return; }
  if (usedPct !== null && (usedPct < 0 || usedPct > 100)) { fail("已用百分比应在 0 到 100 之间"); return; }
  if (usedGB !== null && usedGB < 0) { fail("已用容量不能为负数"); return; }
  if (usedGB !== null && usedGB > total) { fail("已用容量不能大于总容量"); return; }
  if (growth === null) { fail("请填写日增长量（不增长就填 0）"); return; }
  if (growth < 0) { fail("日增长量不能为负数（数据在减少时填 0，并留意这通常不长久）"); return; }
  if (warnPct === null) { warnPct = 90; }
  if (warnPct <= 0 || warnPct > 100) { fail("警戒线百分比应在 1 到 100 之间"); return; }
  if (target === null) { target = 180; }
  if (target <= 0) { fail("目标天数必须大于 0"); return; }
  var used, usedFromNote = "";
  if (usedGB !== null) {
    used = usedGB;
    if (usedPct !== null && Math.abs(usedGB - total * usedPct / 100) > total * 0.01) {
      usedFromNote = "注：已用百分比与已用容量对不上，本次按已用容量 " + usedGB + " GB 计算。";
    }
  } else {
    used = total * usedPct / 100;
  }
  var usedPctEff = Math.round(used / total * 10000) / 100;
  var free = total - used;
  var warnGB = total * warnPct / 100;
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  var L = [];
  L.push("容量现状");
  L.push("  总容量：" + r1(total) + " GB");
  L.push("  已用：" + r1(used) + " GB（" + r2(usedPctEff) + "%）");
  L.push("  剩余：" + r1(free) + " GB");
  if (usedFromNote) { L.push("  " + usedFromNote); }
  L.push("");
  L.push("公式：剩余 = 总容量 − 已用；耗尽天数 = 剩余 ÷ 日增长量；预计日期 = 今天 + 耗尽天数。");
  L.push("");
  if (free <= 0) {
    L.push("⚠ 磁盘已经满了（剩余 0）：先按故障处理清空间，不要再谈规划。");
  } else if (growth === 0) {
    L.push("按日增长 0 GB/天：不会因自然增长耗尽（公式里除以 0 无意义，单独说明）。");
    L.push("注意：突发写入（日志刷屏、一次性大导入）不服从日均增速，警戒线监控仍要留。");
  } else {
    var daysLeft = free / growth;
    L.push("按当前增速耗尽：约 " + r1(daysLeft) + " 天后（预计 " + diskFmtDate(Math.floor(daysLeft)) + " 前后写满）");
    if (used >= warnGB) {
      L.push("⚠ 已超过警戒线：" + "当前已用 " + r2(usedPctEff) + "% ≥ 警戒线 " + warnPct + "%（" + r1(warnGB) + " GB），应立即着手清理或扩容。");
    } else {
      var daysWarn = (warnGB - used) / growth;
      L.push("到达警戒线 " + warnPct + "%（" + r1(warnGB) + " GB）：约 " + r1(daysWarn) + " 天后（预计 " + diskFmtDate(Math.floor(daysWarn)) + "）");
    }
  }
  L.push("");
  L.push("扩容测算（目标：撑 " + target + " 天）");
  L.push("公式：目标天数内总需求 = 已用 + 日增长 × 目标天数；需扩容 = 总需求 − 总容量（为正才需要）。");
  var need = used + growth * target;
  if (growth === 0) {
    L.push("  日增长为 0：现有容量即可撑过目标天数，无需扩容。");
  } else if (need > total) {
    L.push("  ⚠ 需要扩容约 " + r1(need - total) + " GB（总需求 " + r1(need) + " GB > 现有 " + r1(total) + " GB）。");
    L.push("  提示：实际采购/扩容请在此基础上再留 10%–20% 余量，并考虑盘的标称容量与可用容量差异。");
  } else {
    L.push("  现有容量可撑到目标天数：到期时预计已用 " + r1(need) + " GB（" + r2(need / total * 100) + "%），无需扩容。");
  }
  L.push("");
  L.push("说明：增速按恒定日均估算；业务有波峰波谷时请用高峰期增速复核，本工具不含文件系统保留块（ext4 默认 5%）等因素。");
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initDisk() {
  var out = document.getElementById("disk-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["disk-total", "disk-usedpct", "disk-usedgb", "disk-growth", "disk-warnpct", "disk-target"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", diskGenerate);
      el.addEventListener("change", diskGenerate);
    }
  });
  bindCopy("disk-copy", "disk-out", "disk-msg");
  var clearBtn = document.getElementById("disk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      ["disk-total", "disk-usedpct", "disk-usedgb", "disk-growth", "disk-warnpct", "disk-target"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.value = ""; }
      });
      diskGenerate();
      document.getElementById("disk-msg").textContent = "已清空";
    });
  }
  diskGenerate();
}

/* ================= N-13 备份策略与 RPO/RTO 计算器（bk） =================
   口径：一次全量 = 数据总量；每日增量 = 数据总量 × 每日变化率；
   保留期总存储 ≈ 全量 + 每日增量 × 保留天数（假设只保留最近一份全量、
   每天一份增量）；耗时按 容量(GB) × 8000 ÷ 带宽(Mbps) ÷ 3600 = 小时
   （1 GB 按 1000 MB 的网络口径粗算）。
   RPO = 备份间隔（最坏情况下丢最近一个间隔内的数据）；
   RTO 估算 = 恢复最近一次全量所需时间（不含回放增量与人工处理）。 */
function bkFmtDur(hours) {
  if (!isFinite(hours)) { return "—"; }
  if (hours < 1) { return Math.round(hours * 60) + " 分钟"; }
  if (hours < 48) { return (Math.round(hours * 10) / 10) + " 小时"; }
  return (Math.round(hours / 24 * 10) / 10) + " 天（" + (Math.round(hours * 10) / 10) + " 小时）";
}
function bkNum(id, label, errs) {
  var raw = document.getElementById(id).value.trim();
  if (!raw) { return null; }
  var v = Number(raw);
  if (!isFinite(v)) { errs.push(label + " 不是有效数字"); return null; }
  return v;
}
function bkGenerate() {
  var out = document.getElementById("bk-out");
  if (!out) { return; }
  var errBox = document.getElementById("bk-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var errs = [];
  var total = bkNum("bk-total", "数据总量", errs);
  var change = bkNum("bk-change", "每日变化率", errs);
  var interval = bkNum("bk-interval", "备份间隔", errs);
  var keep = bkNum("bk-keep", "保留天数", errs);
  var up = bkNum("bk-up", "备份带宽", errs);
  var down = bkNum("bk-down", "恢复带宽", errs);
  if (errs.length) { fail(errs.join("；")); return; }
  if (total === null || total <= 0) { fail("数据总量必须大于 0"); return; }
  if (change === null || change < 0 || change > 100) { fail("每日变化率应在 0 到 100 之间"); return; }
  if (interval === null || interval <= 0) { fail("备份间隔必须大于 0（小时）"); return; }
  if (keep === null || keep < 1) { fail("保留天数至少为 1"); return; }
  keep = Math.floor(keep);
  if (up === null || up <= 0) { fail("备份带宽必须大于 0（Mbps）"); return; }
  if (down === null || down <= 0) { fail("恢复带宽必须大于 0（Mbps）"); return; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  var full = total;
  var incr = total * change / 100;
  var storage = full + incr * keep;
  var fullHours = total * 8000 / up / 3600;
  var incrHours = incr * 8000 / up / 3600;
  var restoreHours = total * 8000 / down / 3600;
  var L = [];
  L.push("备份体量（公式：每日增量 = 数据总量 × 每日变化率）");
  L.push("  一次全量大小：" + r1(full) + " GB");
  L.push("  每日增量估算：" + r1(incr) + " GB/天（变化率 " + change + "%）");
  L.push("  保留期总存储估算：" + r1(storage) + " GB");
  L.push("    公式：总存储 ≈ 一次全量 + 每日增量 × 保留天数（" + r1(full) + " + " + r1(incr) + " × " + keep + "）");
  L.push("    假设：只保留最近一份全量、每天一份增量；若保留多份全量或做异地多副本，按份数倍增。");
  L.push("");
  L.push("RPO（数据能丢多少）");
  L.push("  RPO = 备份间隔 = " + interval + " 小时：最坏情况下，故障发生在下一次备份前一刻，");
  L.push("  会丢失最近 " + interval + " 小时内产生/修改的数据。想缩小 RPO 只能缩短备份间隔（或改持续同步）。");
  L.push("");
  L.push("耗时与 RTO（公式：耗时(小时) = 容量(GB) × 8000 ÷ 带宽(Mbps) ÷ 3600，1 GB 按 1000 MB 网络口径）");
  L.push("  单次全量备份耗时：约 " + bkFmtDur(fullHours) + "（带宽 " + up + " Mbps）");
  L.push("  单次增量备份耗时：约 " + bkFmtDur(incrHours));
  L.push("  整库恢复耗时（RTO 估算）：约 " + bkFmtDur(restoreHours) + "（恢复带宽 " + down + " Mbps）");
  L.push("    注：此 RTO 只算「把最近一次全量传回并写完」的时间；回放增量链、校验、");
  L.push("    起服务与人工决策都不在内，真实恢复时间只会更长。按有效带宽 70% 粗算约 " + bkFmtDur(restoreHours / 0.7) + "。");
  if (fullHours > interval) {
    L.push("  ⚠ 全量备份耗时（约 " + r1(fullHours) + " 小时）已超过备份间隔（" + interval + " 小时）：");
    L.push("    全量根本跑不完一轮，实际策略只能是「全量低频 + 增量高频」，或先扩带宽/拆分备份对象。");
  }
  L.push("");
  L.push("RPO 与 RTO 的区别");
  L.push("  RPO 管「丢多少数据」：由备份间隔决定，是时间点概念（恢复到哪一刻）。");
  L.push("  RTO 管「停多久业务」：由恢复耗时决定，是时长概念（多久能重新提供服务）。");
  L.push("  两者要分别定目标：RPO 达标不等于 RTO 达标——备份很勤，但整库恢复要两天，业务照样停摆。");
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initBk() {
  var out = document.getElementById("bk-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["bk-total", "bk-change", "bk-interval", "bk-keep", "bk-up", "bk-down"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", bkGenerate);
      el.addEventListener("change", bkGenerate);
    }
  });
  bindCopy("bk-copy", "bk-out", "bk-msg");
  var clearBtn = document.getElementById("bk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      ["bk-total", "bk-change", "bk-interval", "bk-keep", "bk-up", "bk-down"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.value = ""; }
      });
      bkGenerate();
      document.getElementById("bk-msg").textContent = "已清空";
    });
  }
  bkGenerate();
}

/* ================= N-24 正则表达式测试器（re） =================
   全局匹配上限 200 条防爆；零宽匹配手动推进 lastIndex 防死循环。
   本工具只做测试展示，不做「自动修复」表达式。 */
function reGenerate() {
  var out = document.getElementById("re-out");
  if (!out) { return; }
  var errBox = document.getElementById("re-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var pattern = document.getElementById("re-pattern").value;
  var text = document.getElementById("re-text").value;
  if (!pattern) {
    errBox.style.display = "none";
    out.textContent = "# 在上方输入正则表达式，这里会列出全部匹配、捕获组与命名组。\n# 语法错误会明确报在上方红框里；本工具只测试、不自动修复表达式。";
    return;
  }
  var flags = "";
  ["g", "i", "m", "s", "u"].forEach(function (f) {
    var el = document.getElementById("re-f-" + f);
    if (el && el.checked) { flags += f; }
  });
  var rx;
  try {
    rx = new RegExp(pattern, flags);
  } catch (e) {
    fail("正则语法错误：" + e.message);
    return;
  }
  var MAX = 200;
  var results = [];
  var capped = false;
  var m;
  if (flags.indexOf("g") >= 0) {
    while ((m = rx.exec(text)) !== null) {
      results.push(m);
      if (results.length >= MAX) { capped = rx.lastIndex <= text.length; break; }
      if (m[0] === "") { rx.lastIndex++; }
      if (rx.lastIndex > text.length) { break; }
    }
  } else {
    m = rx.exec(text);
    if (m) { results.push(m); }
  }
  function showVal(v) {
    if (v === undefined) { return "（未参与匹配）"; }
    var s = v.length > 120 ? v.slice(0, 120) + "…（共 " + v.length + " 字符，已截断）" : v;
    return JSON.stringify(s);
  }
  var warnLines = [];
  if (/(\([^()]*[+*][^()]*\)\s*[+*])|([+*]\s*[+*])/.test(pattern)) {
    warnLines.push("");
    warnLines.push("⚠ 检测到疑似嵌套量词写法（如 (a+)+、(\\w+)*）：这类模式在「长串 + 不匹配结尾」时");
    warnLines.push("  可能指数级回溯，把 CPU 打满。本工具不自动修复；建议改写量词结构或限定字符集后重测。");
  }
  var L = [];
  L.push("模式：/" + pattern + "/" + flags);
  L.push("测试文本长度：" + text.length + " 字符（下标为 JS 字符串下标，0 起）");
  if (!results.length) {
    L.push("匹配：否（没有找到任何匹配）");
    warnLines.forEach(function (w) { L.push(w); });
    errBox.style.display = "none";
    out.textContent = L.join("\n");
    return;
  }
  L.push("匹配：是，共 " + results.length + " 处" + (capped ? "（已达上限 " + MAX + " 条，后续匹配未继续统计）" : ""));
  if (flags.indexOf("g") < 0 && results.length) {
    L.push("注：未勾选 g 时只报告第一处匹配。");
  }
  results.forEach(function (mm, idx) {
    var start = mm.index;
    var end = start + mm[0].length;
    L.push("");
    L.push("#" + (idx + 1) + " 下标 " + start + "–" + end + "（长度 " + mm[0].length + "）：" + showVal(mm[0]));
    for (var g = 1; g < mm.length; g++) {
      L.push("    捕获组 " + g + "：" + showVal(mm[g]));
    }
    if (mm.groups) {
      var names = Object.keys(mm.groups);
      if (names.length) {
        names.forEach(function (nm) {
          L.push("    命名组 " + nm + "：" + showVal(mm.groups[nm]));
        });
      }
    }
  });
  warnLines.forEach(function (w) { L.push(w); });
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initRe() {
  var out = document.getElementById("re-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["re-pattern", "re-text", "re-f-g", "re-f-i", "re-f-m", "re-f-s", "re-f-u"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", reGenerate);
      el.addEventListener("change", reGenerate);
    }
  });
  bindCopy("re-copy", "re-out", "re-msg");
  var clearBtn = document.getElementById("re-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("re-pattern").value = "";
      document.getElementById("re-text").value = "";
      reGenerate();
      document.getElementById("re-msg").textContent = "已清空";
    });
  }
  reGenerate();
}

/* ================= N-28 .env 文件检查器（env） =================
   隐私口径：全程本地运行、不存储；输出只出现键名与行号，
   任何一行的值都不回显（包括非敏感行），格式判断只在内存里做。 */
function envIsSensitiveKey(key) {
  return /KEY|SECRET|TOKEN|PASSWORD|PASSWD/i.test(key);
}
function envGenerate() {
  var out = document.getElementById("env-out");
  if (!out) { return; }
  var errBox = document.getElementById("env-err");
  errBox.style.display = "none";
  var raw = document.getElementById("env-input").value;
  if (!raw.replace(/\s+/g, "")) {
    out.textContent = "# 把 .env 文件内容粘贴到上方，点「开始检查」。\n# 本工具全程在浏览器本地运行、不存储；输出只有键名与行号，任何值都不会被回显。";
    return;
  }
  var truncated = false;
  var text = raw;
  if (text.length > 200000) { text = text.slice(0, 200000); truncated = true; }
  var lines = text.split("\n");
  var findings = [];
  function add(lv, lineNo, msg) { findings.push({ lv: lv, line: lineNo, msg: msg }); }
  var seen = {};
  var assignCount = 0;
  var exportLines = [];
  var plainCount = 0;
  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1;
    var t = lines[i].replace(/^\s+/, "").replace(/\s+$/, "");
    if (!t || t.charAt(0) === "#") { continue; }
    var hasExport = /^export\s+/.test(t);
    var body = hasExport ? t.replace(/^export\s+/, "") : t;
    var eq = body.indexOf("=");
    if (eq < 0) {
      add(1, lineNo, "第 " + lineNo + " 行：没有等号，无法解析为 KEY=VALUE（内容未回显）。若这是注释请以 # 开头。");
      continue;
    }
    var key = body.slice(0, eq).replace(/\s+$/, "");
    var valRaw = body.slice(eq + 1);
    var val = valRaw.replace(/^\s+/, "").replace(/\s+$/, "");
    assignCount++;
    if (hasExport) { exportLines.push(lineNo); } else { plainCount++; }
    if (!key) {
      add(1, lineNo, "第 " + lineNo + " 行：键名为空。");
      continue;
    }
    var keyShow = key.length > 40 ? key.slice(0, 40) + "…" : key;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      add(1, lineNo, "第 " + lineNo + " 行：键名「" + keyShow + "」不合法（应以字母或下划线开头，只含字母、数字、下划线；含空格、小写以外的字符或以数字开头都会让部分解析器报错或忽略）。");
    }
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」重复定义（首次在第 " + seen[key] + " 行）。多数解析器取最后一份，前面的值会被静默覆盖。");
    } else {
      seen[key] = lineNo;
    }
    var sensitive = envIsSensitiveKey(key);
    if (val === "") {
      add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值为空。确认是有意留空：有些框架把空字符串当作已设置，有些则当未设置，行为不一致。");
    } else {
      var first = val.charAt(0);
      if (first === '"' || first === "'") {
        if (val.length < 2 || val.charAt(val.length - 1) !== first) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值引号未闭合（值未回显）。");
        }
      } else {
        if (/\s#/.test(val)) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值未加引号却含空格与 #（值未回显）：多数解析器会把 # 后内容当注释截断，实际生效值与你写的不一致。给整体加引号。");
        } else if (/\s/.test(val)) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值未加引号却含空格（值未回显）：被 shell source 或部分解析器读取时会拆断或报错。给整体加引号。");
        } else if (val.indexOf("#") >= 0) {
          add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的未加引号值含 #（值未回显）：不同解析器对值中 # 的处理不一致（有的当注释、有的保留），建议加引号消除歧义。");
        }
      }
    }
    if (sensitive) {
      add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」疑似敏感项（键名含 KEY/SECRET/TOKEN/PASSWORD 类字样）。本工具不回显其值；请确认 .env 已加入 .gitignore、文件权限为 600，且没有被粘贴到聊天/工单/截图里扩散。");
    }
  }
  if (exportLines.length && plainCount) {
    var exList = exportLines.slice(0, 10).join("、") + (exportLines.length > 10 ? " 等" : "");
    add(2, exportLines[0], "export 前缀不一致：第 " + exList + " 行用了 export，其余 " + plainCount + " 条赋值没用。两种写法混用不影响 dotenv 解析，但被 shell source 时只有带 export 的会进环境变量，容易踩坑；统一一种写法。");
  }
  if (truncated) {
    add(2, 1, "输入超过 200000 字符，仅检查了前 200000 字符。");
  }
  findings.sort(function (a, b) {
    if (a.lv !== b.lv) { return a.lv - b.lv; }
    return a.line - b.line;
  });
  var counts = [0, 0, 0];
  findings.forEach(function (f) { counts[f.lv]++; });
  var LV = ["✗ 严重", "⚠ 警告", "提示"];
  var L = [];
  L.push(".env 检查结果");
  L.push("共扫描 " + lines.length + " 行，其中赋值行 " + assignCount + " 条；问题：严重 " + counts[0] + " 项 / 警告 " + counts[1] + " 项 / 提示 " + counts[2] + " 项");
  L.push("");
  if (!findings.length) {
    L.push("✓ 未发现格式问题（在本工具覆盖范围内）。");
  }
  findings.forEach(function (f) {
    L.push("[" + LV[f.lv] + "] " + f.msg);
  });
  L.push("");
  L.push("隐私说明：本工具全程在浏览器本地运行、不存储、不上传；输出只出现键名与行号，");
  L.push("任何一行的值（包括非敏感行）都不会被回显，格式判断只在内存中完成。");
  out.textContent = L.join("\n");
}
function initEnv() {
  var out = document.getElementById("env-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("env-run");
  if (run) { run.addEventListener("click", envGenerate); }
  bindCopy("env-copy", "env-out", "env-msg");
  var clearBtn = document.getElementById("env-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("env-input").value = "";
      envGenerate();
      document.getElementById("env-msg").textContent = "已清空";
    });
  }
  envGenerate();
}

/* 批次 B init 函数清单（集成方在页尾统一调用，与现有工具同样的三路触发）：
   - initDiag   （N-10 Linux 故障诊断决策树）
   - initCsrev  （N-12 Docker Compose 安全审查器）
   - initDisk   （N-07 磁盘空间与容量规划器）
   - initBk     （N-13 备份策略与 RPO/RTO 计算器）
   - initRe     （N-24 正则表达式测试器）
   - initEnv    （N-28 .env 文件检查器）
   依赖：页面已有的 bindCopy(btnId, outId, msgId) 助手（与现有 15 个工具共用）。 */
