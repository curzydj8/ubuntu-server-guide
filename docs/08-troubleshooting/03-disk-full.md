---
description: "磁盘问题在监控上常统一表现为一句「空间不足」，但背后至少有四种完全不同的成因，处置方法也完全不同。第一种是真实数据增长，日志、备份、上传文件持续变大，最终写满分区。"
---

# 磁盘空间爆满与文件句柄耗尽

## 一、概述与使用场景

磁盘问题在监控上常统一表现为一句「空间不足」，但背后至少有四种完全不同的成因，处置方法也完全不同。第一种是真实数据增长，日志、备份、上传文件持续变大，最终写满分区。第二种是 df 与 du 对不上，文件已经删除，空间却没有释放，因为仍有进程打开着这个文件。第三种是 inode 耗尽，分区还有大量空闲字节，但小文件数量太多把 inode 用完，新建文件同样报错。第四种是文件句柄耗尽，进程能打开的文件与网络连接数量触及上限，应用报出打开文件过多一类的错误，磁盘本身反而没有问题。

四种成因的报错也高度相似：应用写入失败、数据库只读或崩溃、服务启动失败、远程登录后创建临时文件失败。仅凭报错无法区分，必须用本章的命令组合先定性再动手。最危险的错误处置是未定性就批量删除文件：删错业务数据不可挽回，删了仍被进程占用的日志也释放不了多少空间，还会把定位证据一并销毁。

空间爆满的危害会快速扩散：根分区写满后，日志无法写入、包管理无法运行、部分服务因无法创建锁文件或临时文件而退出，严重时系统无法正常登录与重启。因此本章流程的第一步永远是确认哪个分区满、属于哪种成因，第二步才是清理或扩容，并且清理顺序遵循先无损、后有损的原则。

## 二、环境准备与前置条件

排查前确认以下条件：

- 具有 sudo 权限，能查看全部目录、已删除文件占用与各进程的句柄占用。普通账号执行 `du` 会因权限不足漏掉大量目录，得出的结论不可信。
- 确认系统盘与数据盘的分区结构，记录每个挂载点的总容量与用途，命令见 3.1 节。
- 预留应急空间意识：ext4 文件系统默认保留一部分空间给 root 用户，普通用户看到百分之百时 root 仍可能写入，这正是管理员还能登录处置的原因，不要把保留空间当作可长期使用的余量。
- 本章工具均为系统自带或基础软件包，包括 `df`、`du`、`lsof`、`findmnt`、`tune2fs`、`journalctl`、`ncdu` 为可选工具，需要时安装：

```bash
sudo apt update
sudo apt install -y lsof psmisc ncdu sysstat
```

- 清理前明确哪些目录属于业务数据、哪些属于日志与缓存，并确认备份状态。无法确认归属的文件一律先记录路径与大小，不直接删除。

!!! warning "删除操作前必须确认的三件事"

    执行任何删除命令前逐项确认：路径是否为预期目录的完整绝对路径，变量是否为空，文件是否仍被业务进程使用。带变量拼接路径的删除命令在变量为空时会变成删除根目录下的内容，属于最严重的运维事故类型。生产环境优先用移动到临时目录、观察一段时间后再删除的方式替代直接删除，给误判留出回退余地。

## 三、手把手操作步骤

### 3.1 先定性：哪个分区满，属于哪种成因

```bash
df -hT
df -i
free -h
mount | grep -E " / | /var | /data "
```

判读逐项说明：`df -hT` 看字节容量，`Use%` 达到百分之百的分区就是故障分区，同时记下它的文件系统类型与挂载点。`df -i` 看 inode 使用率，`IUse%` 达到百分之百而字节还有空闲，即可判定为 inode 耗尽，转 3.4 节。若两者都未满但应用仍报写入失败，检查应用所在目录是否有单独挂载或配额限制，并转 3.5 节查句柄上限。先把两个命令的完整输出保存到故障记录，再进入定位环节。

### 3.2 定位大目录与大文件

确认是字节容量问题后，从故障分区根部逐层向下定位，每层只看最大的几项：

```bash
sudo du -x -h --max-depth=1 / 2>/dev/null | sort -hr | head -n 20
sudo du -x -h --max-depth=1 /var 2>/dev/null | sort -hr | head -n 20
sudo du -x -h --max-depth=1 /var/log 2>/dev/null | sort -hr | head -n 20
sudo find /var -xdev -type f -size +500M -exec ls -lh {} \;
```

参数说明：`-x` 表示不跨越文件系统边界，避免把其他分区算进来导致结论错误；`--max-depth=1` 只统计一层，先锁定大目录再逐层深入，不要一上来对整盘做深度统计，既慢又难读。`find` 命令按大于五百兆字节筛出单个大文件，重点关注日志文件、备份压缩包、数据库转储文件与应用生成的临时文件。找到目标后先看文件名、修改时间与归属进程，判断是正常增长还是异常暴涨，再决定清理方式。

### 3.3 df 与 du 对不上：已删除未释放文件

当 `df` 显示已用空间远大于 `du` 汇总结果，且差值达到数吉字节以上，基本可判定存在已删除但仍被进程打开的文件。定位与处置命令：

```bash
sudo lsof +L1
sudo lsof +L1 /var
df -h /var
du -x -sh /var
```

判读逐项说明：`lsof +L1` 列出链接数小于一的打开文件，也就是已删除未释放文件，输出中的 `SIZE/OFF` 列显示该文件仍占用的字节数，`COMMAND` 与 `PID` 列显示持有它的进程。最常见的持有者是日志类进程：日志文件被外部脚本删除或移动后，原进程仍握着旧文件的句柄继续写入，新文件看不到新日志，旧空间也不释放。处置方法按影响从小到大排序：能平滑重载的服务优先执行重载命令让其重新打开日志文件，例如 `sudo systemctl reload nginx` 或向进程发送重开日志信号；无法重载的服务在业务低峰期重启；任何情况下都不要用结束进程的方式作为第一选择。处置后复查：

```bash
sudo systemctl restart rsyslog
sudo lsof +L1
df -h /var
```

复查时已删除未释放条目应消失或明显减小，`df` 的已用空间随之下降。若个别条目属于数据库等核心进程，不要擅自重启，先记录进程、文件与大小，联系业务负责人确认窗口期。

### 3.4 inode 耗尽的定位与处置

inode 被大量小文件耗尽，常见来源是缓存目录、会话文件目录、邮件队列、未清理的临时文件与容器镜像层。定位命令：

```bash
df -i
sudo find /var -xdev -type d -print0 | xargs -0 -I{} sh -c 'echo "$(find "{}" -maxdepth 1 | wc -l) {}"' | sort -nr | head -n 20
ls /var/cache
ls /var/tmp
ls /tmp
```

上面的统计按目录内条目数量排序，条目数异常大的目录就是小文件聚集点。进入该目录后按类型与时间确认内容性质：

```bash
sudo find /var/cache/example-app -type f | head -n 20
sudo find /var/cache/example-app -type f -mtime +30 | wc -l
sudo find /var/cache/example-app -type f -mtime +30 -delete
sudo find /var/cache/example-app -type d -empty -delete
df -i
```

处置原则：只删除已确认过期或可再生的小文件，先用不带删除动作的命令统计数量与时间分布，确认范围无误后再执行带删除动作的命令，分批执行并随时复查 `df -i`。会话与缓存类目录治本方法是给应用设置过期清理规则或用定时任务按保留天数清理，并把小文件密集的目录独立成单独分区，避免再次拖垮根分区。

!!! warning "批量删除小文件时的注意事项"

    在条目数达到百万级的目录上直接使用带通配符的删除命令，可能因参数列表过长直接报错，也可能长时间占用大量输入输出资源拖慢业务。应使用 `find` 按时间分批删除，每批执行后复查 inode 与系统负载。删除前用相同条件先做计数统计，计数结果与预期相符后再执行删除，禁止在未计数的情况下对生产目录执行大范围删除。

### 3.5 日志爆盘的应急清理与治本

日志是最常见的爆盘来源，应急处置分三类日志分别处理。systemd 日志使用专用命令回收，不能直接删除其数据文件：

```bash
sudo journalctl --disk-usage
sudo journalctl --vacuum-size=500M
sudo journalctl --vacuum-time=7d
sudo journalctl --disk-usage
```

文本日志文件先确认没有进程正在写入，再压缩或截断。需要保留内容时先压缩归档到其他分区，确认归档完整后再截断原文件：

```bash
ls -lh /var/log/
sudo gzip -k /var/log/example-app/app.log.1
sudo truncate -s 0 /var/log/example-app/app.log
df -h
```

对正在被进程持续写入的大日志，截断优于删除：截断立即释放空间且进程句柄继续有效。治本配置是检查日志轮转是否生效，配置文件为 `/etc/logrotate.d/` 下对应服务的文件与主配置 `/etc/logrotate.conf`，手动验证命令为 `sudo logrotate -d /etc/logrotate.conf` 查看调试输出、确认无报错后用 `sudo logrotate -f /etc/logrotate.conf` 强制执行一次。同时在 `/etc/systemd/journald.conf` 中设置日志总量上限，例如 `SystemMaxUse=2G`，修改后执行 `sudo systemctl restart systemd-journald` 生效。

### 3.6 文件句柄耗尽的排查与修复

应用日志出现打开文件过多、无法接受新连接、无法创建新文件，且磁盘空间与 inode 都充足时，按句柄方向排查：

```bash
cat /proc/sys/fs/file-nr
cat /proc/sys/fs/file-max
ulimit -n
ulimit -Hn
sudo lsof -n | awk '{print $1}' | sort | uniq -c | sort -nr | head -n 20
sudo lsof -n -p 12345 | wc -l
cat /proc/12345/limits | grep -i "open files"
```

判读逐项说明：`/proc/sys/fs/file-nr` 三个数字依次为已分配句柄数、已分配未使用数、系统最大句柄数，第一项接近第三项是系统级耗尽。`fs.file-max` 是系统级上限，持久修改写入 `/etc/sysctl.d/99-file-max.conf`，内容为一行 `fs.file-max = 1048576`，执行 `sudo sysctl --system` 后复查。进程级上限以 `/proc/进程号/limits` 中的 `Max open files` 软硬限制为准，它可能与登录会话中的 `ulimit -n` 不同，因为 systemd 服务有独立的限制来源。为 systemd 服务提高上限的方法是在服务单元中设置 `LimitNOFILE`，推荐用覆盖配置：

```bash
sudo systemctl edit nginx
```

在打开的编辑区中写入：

```ini
[Service]
LimitNOFILE=65535
```

保存后执行以下命令并复查进程实际上限，已运行进程必须重启才会应用新上限，单纯重载配置不会改变已启动进程的句柄限制：

```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
cat /proc/$(pgrep -o nginx)/limits | grep -i "open files"
ls -l /proc/$(pgrep -o nginx)/fd | wc -l
```

定位句柄被谁占满时，先用按进程汇总的 `lsof` 找到占用最多的进程，再看其句柄类型分布，区分是文件、网络连接还是管道泄漏：

```bash
sudo lsof -n -p 12345 | awk '{print $5}' | sort | uniq -c | sort -nr
sudo lsof -n -p 12345 | grep -c "TCP"
sudo lsof -n -p 12345 | grep -c "deleted"
```

若句柄随时间单调增长且重启后恢复，可判定为句柄泄漏，需要在应用层修复未关闭文件或连接的代码，本节的上限调整只能延缓再次耗尽的时间。

## 四、效果验证与测试

清理或调整完成后逐项验证，不接受只看单条命令的结果：

```bash
df -hT
df -i
sudo lsof +L1
sudo journalctl --disk-usage
sudo systemctl --failed
curl -o /dev/null -s -w "%{http_code}\n" http://example.com/
touch /var/tmp/disk-write-test && ls -l /var/tmp/disk-write-test && rm /var/tmp/disk-write-test
```

期望输出示例：

```text
$ df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2       100G   62G   38G  62% /
$ df -i /
Filesystem      Inodes IUsed IFree IUse% Mounted on
/dev/sda2       6553600 812340 5741260 13% /
```

判读标准：故障分区的字节使用率与 inode 使用率都回到安全水位，已删除未释放条目清零或只剩可解释的小项，因空间问题失败的服务恢复且应用写入测试成功。验证后观察至少一个业务高峰周期，确认空间增长速率回到正常水平，避免清理后数小时再次写满。

## 五、常见错误与排坑指南

**错误一：空间满了就直接删最大的日志文件，随后空间没有释放。** 现象是文件已从目录中消失，`df` 数字不变。原因是该文件仍被进程打开，属于已删除未释放情形。正确做法是先用 `lsof +L1` 确认持有进程，对在写日志采取截断或让服务重开日志文件，只有确认无进程占用的文件才直接删除。

**错误二：只看 df -h 就判定空间充足，漏掉 inode 耗尽。** 现象是分区还剩几十吉字节，新建文件却报无空间。原因是小文件把 inode 用完，字节视角完全看不出来。正确做法是把 `df -h` 与 `df -i` 作为固定搭配同时查看，任何空间类故障第一步就同时执行这两条命令。

**错误三：只改登录会话的 ulimit 就认为服务句柄上限已提升。** 现象是终端里 `ulimit -n` 显示新值，服务进程仍在原上限处报错。原因是 systemd 服务不继承交互会话的限制。正确做法以 `/proc/进程号/limits` 为准，通过服务单元的 `LimitNOFILE` 修改并重启服务，再回到该文件复查实际生效值。

## 六、生产环境最佳实践与安全建议

第一，监控要同时覆盖字节与 inode 两条线，分区使用率设置百分之七十五预警、百分之九十严重两级阈值，句柄使用量对核心进程单独采集。第二，日志必须有上限：journald 设置总量上限，应用日志全部纳入 logrotate 并验证轮转真实执行，关键业务日志集中收集到独立日志平台，本地只保留短期副本。第三，分区隔离：根分区、日志、数据、临时目录按重要性拆分或使用逻辑卷，单一目录暴涨不拖垮整个系统，逻辑卷还可在不停机情况下在线扩容。第四，清理自动化但要设护栏：定时清理任务按保留天数与总量双条件执行，删除范围写死为明确目录，任务日志独立保存并纳入巡检。第五，应急预案写清顺序：先定性、再截断在写大日志、再处理已删除未释放、再清过期文件、最后才考虑删业务数据与扩容，每一步的批准人写明。第六，容量做趋势管理：按周记录各分区增长量，提前在写满之前完成扩容或归档，把爆盘从故障变成计划内变更。
