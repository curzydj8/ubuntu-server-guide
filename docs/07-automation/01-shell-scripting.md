---
description: "Shell 脚本是 Linux 运维自动化的基本功。凡是需要重复执行的检查、备份、清理、部署动作，都应该沉淀为脚本，而不是每次靠手工敲命令。"
---

# Shell 自动化运维脚本编写规范与范例

## 一、概述与使用场景

Shell 脚本是 Linux 运维自动化的基本功。凡是需要重复执行的检查、备份、清理、部署动作，都应该沉淀为脚本，而不是每次靠手工敲命令。脚本的价值不只是省时间，更在于把操作过程固定下来，减少人为漏项和误操作，并且留下可追溯的执行日志。

典型场景包括：每日主机巡检，汇总 CPU、内存、磁盘、关键服务状态后生成报告；数据和配置的定时备份，打包、校验、轮换保留；证书、域名、磁盘阈值等到期和超限检查，提前发现而不是等故障发生；发布前后的批量文件处理和服务启停。

不写脚本、全靠手工的瓶颈非常明显。第一是不可重复，换个人执行结果就不一样。第二是无记录，出问题后查不到当时到底执行了什么。第三是错误会被放大，手工命令敲错一行就可能删错目录，而脚本至少可以在上线前完整评审和试运行。反过来，脚本写得不规范同样危险：没有错误处理时，前一步失败了后一步照样执行，可能把错误状态一路带到生产。本章先立规范，再给三个完整范例，就是为了让你写的脚本既敢用、又可靠。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 和 Ubuntu 24.04 LTS，脚本统一使用 Bash，不使用需要额外安装的解释器。执行账号需要 sudo 权限，示例使用 ubuntu 用户。巡检和证书检查脚本以普通用户加 sudo 提权的方式运行，备份脚本按备份目标的权限决定是否用 root 运行。

先确认环境并准备统一的脚本和日志目录：

```bash
bash --version
lsb_release -a
sudo mkdir -p /opt/ops/scripts /var/log/ops /srv/backup
sudo chown ubuntu:ubuntu /opt/ops/scripts
sudo chown ubuntu:ubuntu /var/log/ops
sudo apt update
sudo apt install -y shellcheck openssl curl jq
```

各工具作用：shellcheck 用于静态检查脚本常见错误，写完脚本先过一遍；openssl 用于证书检查范例；curl 用于网络探测；jq 用于解析 JSON 格式的接口返回。目录约定为脚本放在 /opt/ops/scripts，日志放在 /var/log/ops，备份放在 /srv/backup，后文范例全部沿用这套路径，改路径时三个地方要同步改。

!!! tip "先装 shellcheck 再写脚本"

    很多低级错误，例如变量没加引号、判断条件写错，shellcheck 在运行前就能指出来。养成习惯：脚本写完先执行 shellcheck 脚本路径，能消除的问题全部消除后再上机运行，这一步花一分钟，能省掉大量线上排查时间。

## 三、手把手操作步骤

### 3.1 脚本骨架与严格模式

每个运维脚本都应从统一骨架开始。先创建骨架文件 /opt/ops/scripts/template.sh，完整内容如下：

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_NAME="$(basename "$0")"
LOG_FILE="/var/log/ops/${SCRIPT_NAME%.sh}.log"
LOCK_FILE="/var/lock/${SCRIPT_NAME%.sh}.lock"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "脚本已在运行中，本次退出" >&2
    exit 1
fi

main() {
    log "INFO" "脚本开始执行"
    log "INFO" "脚本执行完成"
}

main "$@"
```

逐项讲解这个骨架的关键设计：

| 写法 | 作用 | 不写的后果 |
| --- | --- | --- |
| set -e | 任一命令返回非零状态立即退出 | 前一步失败后一步继续，可能扩大故障 |
| set -u | 使用未定义变量立即报错 | 变量名拼错时静默用空值，路径类变量出错后果严重 |
| set -o pipefail | 管道中任一环节失败，整条管道视为失败 | 只看最后一个命令结果，中间失败被掩盖 |
| IFS 设置 | 把字段分隔符收紧为换行和制表符 | 文件名带空格时被错误拆分 |
| flock 锁文件 | 同一脚本同一时间只允许一个实例 | 定时任务重叠执行，备份互相覆盖 |
| trap cleanup EXIT | 脚本退出时统一清理锁文件 | 异常退出后锁残留，下次永远跑不起来 |
| log 函数 | 日志同时输出到屏幕和文件并带时间与级别 | 出问题后无据可查 |

需要特别说明 set -e 的边界：它不是万能的，在条件判断、管道和命令替换等少数写法里不会按直觉触发退出。因此关键步骤仍要显式判断返回值或用 or 语法兜底，例如 cp 命令后接失败提示。骨架里的 flock 用法打开文件描述符 200 持有锁，脚本结束锁自动释放，配合 trap 清理锁文件，双保险防残留。

### 3.2 参数解析规范

脚本对外接口要固定：支持 -h 显示帮助，长任务支持用环境变量或参数传入目标，不要把路径和域名写死在脚本正文里到处散落。标准写法使用 while 加 case 解析，完整示例片段如下，这段代码要放在 main 函数之前、骨架变量定义之后：

```bash
TARGET_DIR="/srv/backup"
RETAIN_DAYS="7"

usage() {
    echo "用法: $0 [-d 备份目录] [-r 保留天数] [-h]"
    echo "  -d  备份存放目录，默认 /srv/backup"
    echo "  -r  保留天数，默认 7"
    echo "  -h  显示本帮助"
}

while getopts ":d:r:h" opt; do
    case "$opt" in
        d) TARGET_DIR="$OPTARG" ;;
        r) RETAIN_DAYS="$OPTARG" ;;
        h) usage; exit 0 ;;
        :) echo "选项 -$OPTARG 需要参数" >&2; exit 2 ;;
        ?) echo "未知选项 -$OPTARG" >&2; usage; exit 2 ;;
    esac
done
```

getopts 第一个参数里每个字母是一个选项，字母后带冒号表示该选项需要参数，开头再加一个冒号表示由脚本自己处理错误提示。解析完成后，脚本正文只使用 TARGET_DIR 这类变量，不再出现写死的路径。数值类参数还要做合法性检查，例如保留天数必须是大于 0 的整数，检查不通过直接报错退出，不要带着非法参数继续跑。

### 3.3 范例一：主机巡检脚本

巡检脚本的目标是一次输出系统关键健康指标，并把磁盘和内存超限标为警告。保存为 /opt/ops/scripts/health_check.sh，完整内容如下，可直接运行：

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

LOG_FILE="/var/log/ops/health_check.log"
DISK_WARN="80"
MEM_WARN="85"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

log "INFO" "开始巡检 主机名 $(hostname)"
log "INFO" "系统版本 $(lsb_release -ds)"
log "INFO" "内核版本 $(uname -r)"
log "INFO" "运行时间 $(uptime -p)"
log "INFO" "负载 $(cat /proc/loadavg)"

DISK_USED="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
log "INFO" "根分区使用率 ${DISK_USED} percent"
if [ "$DISK_USED" -ge "$DISK_WARN" ]; then
    log "WARN" "根分区使用率超过阈值 ${DISK_WARN} percent"
fi

MEM_USED="$(free | awk '/^Mem:/ {printf "%d", $3/$2*100}')"
log "INFO" "内存使用率 ${MEM_USED} percent"
if [ "$MEM_USED" -ge "$MEM_WARN" ]; then
    log "WARN" "内存使用率超过阈值 ${MEM_WARN} percent"
fi

for svc in ssh cron systemd-journald; do
    if systemctl is-active --quiet "$svc"; then
        log "INFO" "服务 $svc 状态 running"
    else
        log "WARN" "服务 $svc 状态 not-running"
    fi
done

log "INFO" "监听端口清单"
ss -tlnp 2>/dev/null | tee -a "$LOG_FILE" || ss -tln | tee -a "$LOG_FILE"

FAILED_COUNT="$(systemctl --failed --no-legend | wc -l)"
log "INFO" "失败的 systemd 单元数量 $FAILED_COUNT"
log "INFO" "巡检完成"
```

赋予执行权限并运行：

```bash
chmod 750 /opt/ops/scripts/health_check.sh
shellcheck /opt/ops/scripts/health_check.sh
/opt/ops/scripts/health_check.sh
cat /var/log/ops/health_check.log
```

### 3.4 范例二：目录备份脚本

备份脚本完成打包、校验、按天轮换三件事。改任何被备份的配置前先手工备份一份的习惯同样适用于脚本：上线前先备份旧版脚本。

```bash
cp /opt/ops/scripts/backup.sh /opt/ops/scripts/backup.sh.bak 2>/dev/null || echo "无旧版脚本，跳过备份"
nano /opt/ops/scripts/backup.sh
```

backup.sh 完整内容如下，备份对象为 /etc 和 /srv/demoapp 两个目录，按实际需求替换 SOURCE_LIST 一行的内容即可，替换时保持空格分隔的格式不变：

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

BACKUP_DIR="/srv/backup"
RETAIN_DAYS="7"
STAMP="$(date '+%Y%m%d-%H%M%S')"
ARCHIVE="${BACKUP_DIR}/backup-${STAMP}.tar.gz"
LOG_FILE="/var/log/ops/backup.log"
SOURCE_LIST="/etc /srv/demoapp"
LOCK_FILE="/var/lock/backup.lock"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    log "ERROR" "已有备份任务在运行，本次退出"
    exit 1
fi

mkdir -p "$BACKUP_DIR"
log "INFO" "开始备份到 $ARCHIVE"
tar -czf "$ARCHIVE" $SOURCE_LIST 2>>"$LOG_FILE"
gzip -t "$ARCHIVE"
SHA_FILE="${ARCHIVE}.sha256"
sha256sum "$ARCHIVE" > "$SHA_FILE"
log "INFO" "备份完成 大小 $(du -h "$ARCHIVE" | cut -f1)"

find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +"$RETAIN_DAYS" -print -delete | tee -a "$LOG_FILE"
find "$BACKUP_DIR" -name "backup-*.tar.gz.sha256" -mtime +"$RETAIN_DAYS" -delete
log "INFO" "已清理超过 $RETAIN_DAYS 天的旧备份"
rm -f "$LOCK_FILE"
log "INFO" "备份任务结束"
```

运行与检查：

```bash
chmod 750 /opt/ops/scripts/backup.sh
shellcheck /opt/ops/scripts/backup.sh
sudo /opt/ops/scripts/backup.sh
ls -lh /srv/backup/
sha256sum -c /srv/backup/*.sha256
```

!!! warning "备份必须做恢复验证"

    备份文件生成成功不等于能恢复。gzip 校验和 sha256 校验只能证明文件本身没有损坏，至少每季度要做一次真实恢复演练：把备份解到临时目录，核对关键配置文件完整可读。没有演练过的备份，在故障时经常因为路径、权限或缺文件而无法使用。

### 3.5 范例三：证书过期检查脚本

证书过期是线上故障的高频原因，检查脚本的思路是：对每个域名取出证书到期时间，算出剩余天数，低于阈值就输出警告并以非零状态退出，方便被监控和定时任务识别。保存为 /opt/ops/scripts/cert_check.sh，完整内容如下：

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

WARN_DAYS="30"
LOG_FILE="/var/log/ops/cert_check.log"
DOMAIN_LIST="example.com example.org"
EXIT_CODE="0"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

for domain in $DOMAIN_LIST; do
    END_DATE="$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)"
    END_TS="$(date -d "$END_DATE" +%s)"
    NOW_TS="$(date +%s)"
    LEFT_DAYS="$(( (END_TS - NOW_TS) / 86400 ))"
    log "INFO" "域名 $domain 证书到期时间 $END_DATE 剩余 $LEFT_DAYS 天"
    if [ "$LEFT_DAYS" -lt 0 ]; then
        log "ERROR" "域名 $domain 证书已经过期"
        EXIT_CODE="1"
    elif [ "$LEFT_DAYS" -lt "$WARN_DAYS" ]; then
        log "WARN" "域名 $domain 证书将在 $WARN_DAYS 天内到期"
        EXIT_CODE="1"
    fi
done

exit "$EXIT_CODE"
```

运行方式：

```bash
chmod 750 /opt/ops/scripts/cert_check.sh
shellcheck /opt/ops/scripts/cert_check.sh
/opt/ops/scripts/cert_check.sh
echo "退出码 $?"
```

## 四、效果验证与测试

三个范例逐一验证。巡检脚本执行后日志里应包含主机名、磁盘使用率、内存使用率和每个服务的状态行，出现 WARN 行说明对应指标超过了脚本头部设置的阈值，属于正常报告而不是脚本故障：

```bash
/opt/ops/scripts/health_check.sh
echo "退出码 $?"
tail -n 30 /var/log/ops/health_check.log
```

备份脚本验证重点看三点：/srv/backup 下生成了带时间戳的 tar.gz 和同名 sha256 文件；sha256sum -c 输出 OK；连续快速执行两次，第二次应提示已有任务在运行并退出，证明锁生效：

```bash
ls -lh /srv/backup/
cd /srv/backup && sha256sum -c *.sha256
tar -tzf /srv/backup/backup-替换为实际时间戳.tar.gz | head -n 20
```

证书脚本验证时，先对示例域名执行确认能拿到到期时间和剩余天数，再把 WARN_DAYS 临时改大到 3650 重跑一次，应输出 WARN 并以退出码 1 结束，证明告警分支可用。测完记得把阈值改回 30。

## 五、常见错误与排坑指南

场景一：脚本报变量未绑定。报错原文片段如下：

```text
backup.sh: line 12: RETAIN_DAY: unbound variable
```

原因是 set -u 生效后，使用了拼错或未定义的变量名。修复方法是回到报错行号核对变量名拼写，并确认该变量在脚本头部有定义。不要为了消除报错就去掉 set -u，那等于把检查关掉，真正的拼写错误会以更隐蔽的方式在生产上发作。

场景二：Windows 换行导致解释器找不到。报错原文片段如下：

```text
/usr/bin/env: ‘bash\r’: No such file or directory
```

原因是脚本在 Windows 编辑器里保存过，行尾带了回车符。修复命令：

```bash
sudo apt install -y dos2unix
dos2unix /opt/ops/scripts/backup.sh
head -n 1 /opt/ops/scripts/backup.sh | cat -A
```

处理后第一行末尾不应再出现回车标记。后续统一在 Linux 上或用正确设置行尾的编辑器改脚本。

场景三：定时执行时找不到命令。现象是手工运行正常，放进定时任务后报 command not found，日志里出现 curl 或 jq 找不到。原因是定时环境里的 PATH 比登录终端短。用下面命令定位并在脚本头部写全路径，或在脚本开头显式设置 PATH：

```bash
which curl
which jq
echo 'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' 
```

把最后一行的内容写到脚本头部 set 语句之后即可。根治办法是脚本里对外部命令一律使用绝对路径，which 查到的结果是什么就写什么。

## 六、生产环境最佳实践与安全建议

第一，脚本文件权限要收紧。包含口令、令牌等敏感信息的脚本权限设为 700 且属主为 root 或专用运维账号；一般脚本设为 750。敏感信息不要直接写在脚本正文里，改从权限为 600 的独立配置文件或环境变量读取，脚本本身可以进代码仓库，密钥文件绝对不能进。

第二，所有删除和覆盖类操作前必须有判断和备份。删除路径由变量拼出来时，先判空再执行，并优先用 find 加明确目录和天数条件，不要写无边界的递归删除。改线上脚本前按本章做法先复制一份带日期的备份。

第三，脚本要做到重复执行结果一致。中途失败后重新执行，不应产生重复数据或二次破坏。备份、巡检这类只读或覆盖同名产物的脚本天然满足；涉及追加写入的脚本要加去重判断。

第四，日志要进统一目录并纳入系统日志轮换。在 /etc/logrotate.d 下为 /var/log/ops 单独写轮换规则，按天保留 30 份并压缩，避免日志无限增长占满磁盘。改 logrotate 配置前同样先备份原文件。

第五，上线流程固定为四步：shellcheck 检查通过、在测试机完整跑通、生产机先手工执行一次确认输出、最后才接入定时任务。任何一步不通过都不要进入下一步，自动化的错误执行速度比手工快得多，门槛必须卡在上线之前。

第六，脚本头部写清用途、作者、修改记录和用法。半年后接手的人第一眼就能看懂脚本是干什么的、改过哪里，这比任何口头交接都可靠。
