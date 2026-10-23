#!/usr/bin/env bash
# check-backup-readiness.sh — 备份就绪自检（试点脚本）
#
# 用途：在真出事之前，先确认「备份这件事至少表面就绪」：备份目录在不在、
#       最近一份够不够新、有没有校验和旁车可验、备份工具与定时任务在不在位、
#       还原目标目录可不可写。
# 适用范围：Ubuntu 22.04 / 24.04；其他版本/发行版行为未核验。
# 对应站点章节：第 03 部分 04 章《备份》、第 11 部分 11.4 备份与还原演练口径。
# 用法：check-backup-readiness.sh [--dir <备份目录>]... [--max-age-days <天数>]
#                                 [--restore-target <目录>] [--help]
#       --dir 可重复指定多个目录，默认 /var/backups。
# 退出码：0 = 无 FAIL；1 = 至少一条 FAIL；2 = 脚本自身无法运行
#         （参数错误、缺必需命令等环境/用法错误）。
# 声明：全程只读，不修改系统——唯一例外：给了 --restore-target 时，
#       会在该目录创建一个临时探活文件并立即删除（输出中明示）。
# 诚实边界：本脚本只证明备份「存在、新鲜、校验和完整」，不证明可还原。

set -u

DEFAULT_MAX_AGE_DAYS=7

PASS_N=0
FAIL_N=0
WARN_N=0
SKIP_N=0
FAIL_NAMES=""

pass() { PASS_N=$((PASS_N + 1)); printf '[PASS] %s\n' "$1"; }
warn() { WARN_N=$((WARN_N + 1)); printf '[WARN] %s\n' "$1"; }
skip() { SKIP_N=$((SKIP_N + 1)); printf '[SKIP] %s\n' "$1"; }
fail() {
    FAIL_N=$((FAIL_N + 1))
    if [ -z "$FAIL_NAMES" ]; then
        FAIL_NAMES="$1"
    else
        FAIL_NAMES="$FAIL_NAMES；$1"
    fi
    printf '[FAIL] %s\n' "$1"
}

usage() {
    cat <<'EOF'
用法：check-backup-readiness.sh [--dir <备份目录>]... [--max-age-days <天数>]
                                [--restore-target <目录>] [--help]

备份就绪自检（只读；--restore-target 探活会创建一个临时文件并立即删除）。
  --dir <目录>            备份目录，可重复；默认 /var/backups
  --max-age-days <天数>   最近一份备份允许的最大年龄，默认 7
  --restore-target <目录> 可选：额外检查该还原目标目录存在且可写
逐条输出 [PASS]/[FAIL]/[WARN]/[SKIP]，结尾打印汇总行。
退出码：0 无 FAIL；1 有 FAIL；2 环境/用法错误。
EOF
}

# ---------- 参数 ----------
BACKUP_DIRS=()
MAX_AGE_DAYS=$DEFAULT_MAX_AGE_DAYS
RESTORE_TARGET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --help | -h)
            usage
            exit 0
            ;;
        --dir)
            if [ $# -lt 2 ]; then
                printf '--dir 缺少参数值。\n' >&2
                exit 2
            fi
            BACKUP_DIRS+=("$2")
            shift 2
            ;;
        --max-age-days)
            if [ $# -lt 2 ]; then
                printf '--max-age-days 缺少参数值。\n' >&2
                exit 2
            fi
            MAX_AGE_DAYS="$2"
            shift 2
            ;;
        --restore-target)
            if [ $# -lt 2 ]; then
                printf '--restore-target 缺少参数值。\n' >&2
                exit 2
            fi
            RESTORE_TARGET="$2"
            shift 2
            ;;
        *)
            printf '未知参数：%s\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
done
case "$MAX_AGE_DAYS" in
    '' | *[!0-9]*)
        printf '--max-age-days 必须是正整数（当前：%s）。\n' "$MAX_AGE_DAYS" >&2
        exit 2
        ;;
esac
if [ "${#BACKUP_DIRS[@]}" -eq 0 ]; then
    BACKUP_DIRS=(/var/backups)
fi

for cmd in find stat sha256sum awk grep sort date; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        printf '缺少必需命令：%s，脚本无法运行。\n' "$cmd" >&2
        exit 2
    fi
done

HAS_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && [ "$(ps -p 1 -o comm= 2>/dev/null)" = "systemd" ]; then
    HAS_SYSTEMD=1
fi
NOW_EPOCH=$(date +%s)
MAX_AGE_SEC=$((MAX_AGE_DAYS * 86400))

# 备份类文件/仓库的 find 表达式（文件按扩展名，目录型 restic 仓库按签名子目录）
# 用函数输出「mtime<TAB>路径」每行一条，调用方 sort -n 取最新一份。
list_backup_candidates() {
    local dir="$1"
    find "$dir" -maxdepth 3 \( -type f \( -name '*.tar' -o -name '*.tar.gz' -o -name '*.tgz' \
        -o -name '*.gz' -o -name '*.bz2' -o -name '*.xz' -o -name '*.zst' \
        -o -name '*.sql' -o -name '*.dump' -o -name '*.img' -o -name '*.restic' \) \
        -printf '%T@\t%p\n' \) 2>/dev/null
    find "$dir" -maxdepth 3 -type d -name snapshots 2>/dev/null | while IFS= read -r snapdir; do
        local repo_dir mtime
        repo_dir=$(dirname "$snapdir")
        mtime=$(find "$repo_dir" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -n 1)
        if [ -n "$mtime" ]; then
            printf '%s\t%s\n' "$mtime" "$repo_dir"
        fi
    done
}

# ---------- 1–3. 逐目录：存在/新鲜度/校验和旁车 ----------
for dir in "${BACKUP_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        fail "备份目录 ${dir}：不存在"
        continue
    fi
    if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then
        fail "备份目录 ${dir}：存在但当前用户不可读（权限不足）"
        continue
    fi
    ENTRY_COUNT=$(find "$dir" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
    if [ "$ENTRY_COUNT" -eq 0 ]; then
        warn "备份目录 ${dir}：目录为空"
    else
        pass "备份目录 ${dir}：存在且可读（顶层条目 ${ENTRY_COUNT} 个）"
    fi

    CANDIDATES=$(list_backup_candidates "$dir")
    if [ -z "$CANDIDATES" ]; then
        warn "备份新鲜度 ${dir}：未发现备份类文件（归档/转储/仓库），无从判断新鲜度"
    else
        NEWEST_LINE=$(printf '%s\n' "$CANDIDATES" | sort -n | tail -n 1)
        NEWEST_MTIME=$(printf '%s' "$NEWEST_LINE" | cut -f1 | cut -d. -f1)
        NEWEST_PATH=$(printf '%s' "$NEWEST_LINE" | cut -f2)
        AGE_SEC=$((NOW_EPOCH - NEWEST_MTIME))
        AGE_DAYS=$((AGE_SEC / 86400))
        if [ "$AGE_SEC" -le "$MAX_AGE_SEC" ]; then
            pass "备份新鲜度 ${dir}：最新一份 ${NEWEST_PATH}（${AGE_DAYS} 天前，在 ${MAX_AGE_DAYS} 天内）"
        else
            fail "备份新鲜度 ${dir}：最新一份 ${NEWEST_PATH} 已是 ${AGE_DAYS} 天前，超过 ${MAX_AGE_DAYS} 天"
        fi
    fi

    NEWEST_SUM=$(find "$dir" -maxdepth 3 -type f -name '*.sha256' -printf '%T@\t%p\n' 2>/dev/null | sort -n | tail -n 1 | cut -f2)
    if [ -z "$NEWEST_SUM" ]; then
        skip "校验和旁车 ${dir}：无 *.sha256 文件，跳过；建议给备份生成 sha256 旁车以便验完整性"
    else
        SUM_BASE=$(basename "$NEWEST_SUM")
        SUM_DIR=$(dirname "$NEWEST_SUM")
        if (cd "$SUM_DIR" && sha256sum -c "$SUM_BASE" >/dev/null 2>&1); then
            pass "校验和旁车 ${dir}：最新旁车 ${SUM_BASE} 验证通过"
        else
            fail "校验和旁车 ${dir}：最新旁车 ${SUM_BASE} 验证失败（文件损坏、缺失或路径对不上）"
        fi
    fi
done

# ---------- 4. 备份工具在位 ----------
TOOLS_FOUND=""
for tool in restic borg rsync tar; do
    if command -v "$tool" >/dev/null 2>&1; then
        if [ -z "$TOOLS_FOUND" ]; then
            TOOLS_FOUND="$tool"
        else
            TOOLS_FOUND="$TOOLS_FOUND $tool"
        fi
    fi
done
if printf '%s' "$TOOLS_FOUND" | grep -qw rsync; then
    pass "备份工具在位：已装 ${TOOLS_FOUND}"
else
    warn "备份工具在位：已装 ${TOOLS_FOUND:-无}；rsync 缺失（本站备份口径常用 rsync，建议补装）"
fi

# ---------- 5. 备份定时器 / cron ----------
TIMER_HITS=""
if [ "$HAS_SYSTEMD" -eq 1 ]; then
    # 排除 dpkg-db-backup：那是包管理器自身的数据库备份定时器，不是用户备份
    # 计划，算命中会把「没配备份」误报成 PASS（试跑实测逮到）。列名取定时器
    # 单元名（倒数第二列），不是它拉起的服务名。
    TIMER_HITS=$(systemctl list-timers --all --no-legend --no-pager 2>/dev/null \
        | grep -iE 'backup|restic|borg|timeshift' | grep -v 'dpkg-db-backup' \
        | awk '{print $(NF-1)}' | sort -u | paste -sd' ' -)
fi
CRON_HITS=""
if [ -f /etc/crontab ]; then
    CRON_HITS=$(grep -hiE 'backup|rsync|restic|borg' /etc/crontab 2>/dev/null | grep -vE '^[[:space:]]*#' | head -n 1)
fi
if [ -z "$CRON_HITS" ] && [ -d /etc/cron.d ]; then
    CRON_HITS=$(grep -rhiE 'backup|rsync|restic|borg' /etc/cron.d 2>/dev/null | grep -vE '^[[:space:]]*#' | head -n 1)
fi
if [ "$HAS_SYSTEMD" -eq 0 ] && [ -z "$CRON_HITS" ]; then
    skip "备份定时任务：非 systemd 环境无法查 list-timers，且 /etc/crontab 与 /etc/cron.d 未见备份条目，跳过定时器部分"
elif [ -n "$TIMER_HITS" ]; then
    pass "备份定时任务：systemd 定时器命中 ${TIMER_HITS}"
elif [ -n "$CRON_HITS" ]; then
    pass "备份定时任务：cron 条目命中（/etc/crontab 或 /etc/cron.d 含备份命令）"
else
    warn "备份定时任务：未发现备份相关 systemd 定时器，/etc/crontab 与 /etc/cron.d 亦无备份条目——备份靠手动？请确认"
fi

# ---------- 6. 还原目标探活（可选） ----------
if [ -z "$RESTORE_TARGET" ]; then
    skip "还原目标：未提供 --restore-target，跳过（探活会在目标目录建临时文件并立即删除）"
elif [ ! -d "$RESTORE_TARGET" ]; then
    fail "还原目标 ${RESTORE_TARGET}：目录不存在"
else
    PROBE_FILE="${RESTORE_TARGET}/.check-backup-readiness.$$.tmp"
    if touch "$PROBE_FILE" 2>/dev/null; then
        rm -f "$PROBE_FILE"
        pass "还原目标 ${RESTORE_TARGET}：存在且可写（探活临时文件已创建并立即删除）"
    else
        fail "还原目标 ${RESTORE_TARGET}：存在但不可写"
    fi
fi

# ---------- 汇总与诚实边界 ----------
printf '== 汇总：PASS %d / FAIL %d / WARN %d / SKIP %d ==\n' "$PASS_N" "$FAIL_N" "$WARN_N" "$SKIP_N"
if [ "$FAIL_N" -gt 0 ]; then
    printf '关键 FAIL：%s\n' "$FAIL_NAMES"
fi
printf '注记：本脚本只验证备份的「存在、新鲜、校验和完整」，不证明可还原；还原演练见站点第 11 部分高可用与恢复演练章。\n'
if [ "$FAIL_N" -gt 0 ]; then
    exit 1
fi
exit 0
