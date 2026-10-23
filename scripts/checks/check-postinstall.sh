#!/usr/bin/env bash
# check-postinstall.sh — Ubuntu Server 安装后自检（试点脚本）
#
# 用途：新装或大版本升级后，快速核对一台 Ubuntu Server 是否达到本站的
#       「装完能用」基线：版本、systemd 健康、时间同步、磁盘、交换、
#       SSH 服务、待重启标记、DNS 与主机名解析。
# 适用范围：Ubuntu 22.04 / 24.04（其他版本会 WARN 并继续；非 Ubuntu 退出 2）。
#           其他发行版行为未核验。
# 对应站点章节：第 01 部分「基础入门」各章，及全站各章第四节「效果验证」。
# 用法：check-postinstall.sh [--help]
# 退出码：0 = 无 FAIL；1 = 至少一条 FAIL；2 = 脚本自身无法运行
#         （非 Ubuntu、缺必需命令、未知参数等环境/用法错误）。
# 声明：全程只读，不修改系统任何文件与配置；唯一的联网动作是第 9 条
#       DNS 解析探活（getent），失败只记 WARN。

set -u

# 可调阈值：根分区使用率（%）达到 WARN_AT 记 WARN，超过 FAIL_AT 记 FAIL。
ROOT_USAGE_WARN_AT=85
ROOT_USAGE_FAIL_AT=95

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
用法：check-postinstall.sh [--help]

Ubuntu Server 安装后自检（只读）。逐条输出 [PASS]/[FAIL]/[WARN]/[SKIP]，
结尾打印汇总行。退出码：0 无 FAIL；1 有 FAIL；2 环境/用法错误。
EOF
}

# ---------- 参数与前置 ----------
for arg in "$@"; do
    case "$arg" in
        --help | -h)
            usage
            exit 0
            ;;
        *)
            printf '未知参数：%s\n' "$arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

for cmd in awk sed grep df hostname; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        printf '缺少必需命令：%s，脚本无法运行。\n' "$cmd" >&2
        exit 2
    fi
done

HAS_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && [ "$(ps -p 1 -o comm= 2>/dev/null)" = "systemd" ]; then
    HAS_SYSTEMD=1
fi

# ---------- 1. 系统版本 ----------
OS_ID=""
OS_VER=""
if [ -r /etc/os-release ]; then
    OS_ID=$(sed -n 's/^ID=//p' /etc/os-release | head -n 1 | tr -d '"')
    OS_VER=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | head -n 1 | tr -d '"')
fi
if [ "$OS_ID" != "ubuntu" ]; then
    printf '本脚本仅适用于 Ubuntu（当前 ID=%s），退出。\n' "${OS_ID:-未知}" >&2
    exit 2
fi
case "$OS_VER" in
    22.04 | 24.04)
        pass "系统版本：Ubuntu $OS_VER，在本站支持范围内"
        ;;
    *)
        warn "系统版本：Ubuntu ${OS_VER:-未知}，非 22.04/24.04，本站口径未覆盖，继续检查"
        ;;
esac

# ---------- 2/3. systemd 状态与失败单元 ----------
if [ "$HAS_SYSTEMD" -eq 0 ]; then
    skip "systemd 状态：PID 1 非 systemd（容器/proot 等环境），跳过 systemctl 类检查"
    skip "失败单元：非 systemd 环境，跳过"
else
    SYS_STATE=$(systemctl is-system-running 2>/dev/null || true)
    FAILED_LIST=$(systemctl --failed --no-legend --no-pager 2>/dev/null | sed 's/^●[[:space:]]*//' | awk 'NF {print $1}')
    FAILED_N=0
    if [ -n "$FAILED_LIST" ]; then
        FAILED_N=$(printf '%s\n' "$FAILED_LIST" | wc -l)
    fi
    case "$SYS_STATE" in
        running)
            pass "systemd 状态：running"
            ;;
        degraded)
            warn "systemd 状态：degraded，失败单元 ${FAILED_N} 个（见下一条）"
            ;;
        *)
            warn "systemd 状态：${SYS_STATE:-未知}，未达 running，继续检查"
            ;;
    esac
    if [ -z "$FAILED_LIST" ]; then
        pass "失败单元：无"
    else
        FAILED_JOINED=$(printf '%s' "$FAILED_LIST" | paste -sd' ' -)
        fail "失败单元：共 ${FAILED_N} 个：${FAILED_JOINED}"
    fi
fi

# ---------- 4. 时间同步 ----------
if ! command -v timedatectl >/dev/null 2>&1; then
    skip "时间同步：timedatectl 不可用，跳过"
else
    NTP_SYNC=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)
    case "$NTP_SYNC" in
        yes)
            pass "时间同步：NTPSynchronized=yes"
            ;;
        no)
            warn "时间同步：NTPSynchronized=no，时钟未同步（检查 systemd-timesyncd 或 chrony）"
            ;;
        *)
            skip "时间同步：无法读取 NTPSynchronized（timedatectl 无有效输出，非 systemd 运行时或 D-Bus 异常时会出现），跳过"
            ;;
    esac
fi

# ---------- 5. 根分区使用率 ----------
ROOT_PCT=$(df -P / 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [ -z "$ROOT_PCT" ]; then
    skip "根分区使用率：df 读取失败，跳过"
elif [ "$ROOT_PCT" -gt "$ROOT_USAGE_FAIL_AT" ]; then
    fail "根分区使用率：${ROOT_PCT}%，超过 ${ROOT_USAGE_FAIL_AT}% 上限"
elif [ "$ROOT_PCT" -ge "$ROOT_USAGE_WARN_AT" ]; then
    warn "根分区使用率：${ROOT_PCT}%，已达 ${ROOT_USAGE_WARN_AT}% 提醒线"
else
    pass "根分区使用率：${ROOT_PCT}%"
fi

# ---------- 6. 内存与交换 ----------
SWAP_KB=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
if [ -n "$SWAP_KB" ] && [ "$SWAP_KB" -gt 0 ] 2>/dev/null; then
    SWAP_MB=$((SWAP_KB / 1024))
    pass "交换空间：已配置 swap ${SWAP_MB} MiB"
else
    warn "交换空间：无 swap；本站口径建议小内存云主机至少配少量 swap 防 OOM 误杀"
fi

# ---------- 7. SSH 服务 ----------
SSH_INSTALLED=0
if command -v dpkg-query >/dev/null 2>&1; then
    if dpkg-query -W -f='${Status}' openssh-server 2>/dev/null | grep -q 'install ok installed'; then
        SSH_INSTALLED=1
    fi
elif command -v sshd >/dev/null 2>&1; then
    SSH_INSTALLED=1
fi
if [ "$SSH_INSTALLED" -eq 0 ]; then
    skip "SSH 服务：未安装 openssh-server，跳过"
elif [ "$HAS_SYSTEMD" -eq 0 ]; then
    skip "SSH 服务：已装 openssh-server，但非 systemd 环境无法查服务状态，跳过"
else
    SSH_STATE=$(systemctl is-active ssh.service 2>/dev/null || true)
    if [ "$SSH_STATE" = "active" ]; then
        pass "SSH 服务：ssh.service active"
    else
        fail "SSH 服务：ssh.service 状态为 ${SSH_STATE:-未知}（已装 openssh-server 却未运行）"
    fi
fi

# ---------- 8. 待重启标记 ----------
if [ -e /var/run/reboot-required ]; then
    warn "待重启标记：/var/run/reboot-required 存在，有更新在等重启生效"
else
    pass "待重启标记：无"
fi

# ---------- 9. DNS 解析（本脚本唯一联网探活） ----------
if ! command -v getent >/dev/null 2>&1; then
    skip "DNS 解析：getent 不可用，跳过"
elif getent hosts archive.ubuntu.com >/dev/null 2>&1; then
    pass "DNS 解析：archive.ubuntu.com 可解析"
else
    warn "DNS 解析：archive.ubuntu.com 解析失败（离线/内网环境可能属正常）"
fi

# ---------- 10. 主机名自解析 ----------
HN=$(hostname)
if ! command -v getent >/dev/null 2>&1; then
    skip "主机名自解析：getent 不可用，跳过"
elif getent hosts "$HN" >/dev/null 2>&1; then
    pass "主机名自解析：${HN} 在 /etc/hosts 等解析源中有条目"
else
    warn "主机名自解析：${HN} 无法解析，建议在 /etc/hosts 补本机条目（sudo 等场景会报警）"
fi

# ---------- 汇总 ----------
printf '== 汇总：PASS %d / FAIL %d / WARN %d / SKIP %d ==\n' "$PASS_N" "$FAIL_N" "$WARN_N" "$SKIP_N"
if [ "$FAIL_N" -gt 0 ]; then
    printf '关键 FAIL：%s\n' "$FAIL_NAMES"
    exit 1
fi
exit 0
