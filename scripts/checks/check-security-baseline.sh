#!/usr/bin/env bash
# check-security-baseline.sh — Ubuntu Server 安全基线自检（试点脚本）
#
# 用途：按本站第 02 部分的安全基线，核对一台服务器的关键硬化项是否到位：
#       SSH 有效配置、额外 UID 0 账号、UFW、Fail2ban、自动安全更新、
#       /etc/shadow 空口令账号与 sudo 组成员规模。
# 适用范围：Ubuntu 22.04 / 24.04；其他版本/发行版行为未核验。
# 对应站点章节：第 02 部分 —— 01《SSH 安全加固》、03《防火墙管理》、
#       04《系统防御与入侵检测》、07《自动安全更新》。
# 用法：check-security-baseline.sh [--help]
#       完整结果需 root（sudo 运行）；非 root 时需 root 的检查组整组 SKIP。
# 退出码：0 = 无 FAIL；1 = 至少一条 FAIL；2 = 脚本自身无法运行
#         （缺必需命令、未知参数等环境/用法错误）。
# 声明：全程只读，不修改系统任何文件与配置，不联网。
#       SSH 一组以 `sshd -T` 的有效配置为准（已合并 sshd_config.d）。

set -u

# 可调阈值：sudo 组成员超过此数记 WARN（纯提示性，本站小团队口径）。
SUDO_MEMBER_WARN_AT=3

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
用法：check-security-baseline.sh [--help]

Ubuntu Server 安全基线自检（只读）。完整结果请用 sudo 运行；
非 root 时需 root 的检查组会整组 SKIP 并注明。
逐条输出 [PASS]/[FAIL]/[WARN]/[SKIP]，结尾打印汇总行。
退出码：0 无 FAIL；1 有 FAIL；2 环境/用法错误。
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

for cmd in awk sed grep getent; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        printf '缺少必需命令：%s，脚本无法运行。\n' "$cmd" >&2
        exit 2
    fi
done

IS_ROOT=0
[ "$(id -u)" -eq 0 ] && IS_ROOT=1
HAS_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && [ "$(ps -p 1 -o comm= 2>/dev/null)" = "systemd" ]; then
    HAS_SYSTEMD=1
fi

# ---------- 1–4. sshd 有效配置组（需 root） ----------
if [ "$IS_ROOT" -eq 0 ]; then
    skip "sshd 有效配置组（PermitRootLogin/PasswordAuthentication/PubkeyAuthentication/PermitEmptyPasswords）：需 root 运行 sshd -T，本组跳过"
elif ! command -v sshd >/dev/null 2>&1; then
    skip "sshd 有效配置组：未找到 sshd 命令（未安装 openssh-server），本组跳过"
else
    SSHD_T=$(sshd -T 2>/dev/null) || SSHD_T=""
    if [ -z "$SSHD_T" ] && ! ls /etc/ssh/ssh_host_*_key >/dev/null 2>&1; then
        # 22.04/24.04 试跑实证（未初始化的云镜像根文件系统）：无主机密钥时 sshd -T 报
        # "no hostkeys available" 直接退出，与配置语法无关，此时应 SKIP 而非 FAIL。
        skip "sshd 有效配置组：/etc/ssh 下无主机密钥，sshd 尚未初始化（云镜像首启前常见），本组跳过"
    elif [ -z "$SSHD_T" ]; then
        fail "sshd 有效配置：sshd -T 无法读出有效配置（配置语法错误或权限问题），先修复再谈基线"
    else
        cfg() { printf '%s\n' "$SSHD_T" | awk -v k="$1" '$1==k {print $2; exit}'; }

        ROOT_LOGIN=$(cfg permitrootlogin)
        case "$ROOT_LOGIN" in
            no | prohibit-password | without-password | forced-commands-only)
                pass "PermitRootLogin：${ROOT_LOGIN}，root 不可口令直登"
                ;;
            *)
                fail "PermitRootLogin：${ROOT_LOGIN:-未读到}，本站基线要求 no 或 prohibit-password"
                ;;
        esac

        PW_AUTH=$(cfg passwordauthentication)
        if [ "$PW_AUTH" = "no" ]; then
            pass "PasswordAuthentication：no，仅密钥登录（第 02 部分 01 章口径）"
        else
            fail "PasswordAuthentication：${PW_AUTH:-未读到}，本站基线为仅密钥登录，应设为 no"
        fi

        PK_AUTH=$(cfg pubkeyauthentication)
        if [ "$PK_AUTH" = "yes" ]; then
            pass "PubkeyAuthentication：yes"
        else
            fail "PubkeyAuthentication：${PK_AUTH:-未读到}，密钥登录未开启"
        fi

        EMPTY_PW=$(cfg permitemptypasswords)
        if [ "$EMPTY_PW" = "no" ]; then
            pass "PermitEmptyPasswords：no"
        else
            fail "PermitEmptyPasswords：${EMPTY_PW:-未读到}，空口令可登录是高危项"
        fi
    fi
fi

# ---------- 5. 额外 UID 0 账号 ----------
EXTRA_ROOT=$(awk -F: '$3==0 && $1!="root" {print $1}' /etc/passwd | paste -sd' ' -)
if [ -n "$EXTRA_ROOT" ]; then
    fail "额外 UID 0 账号：存在非 root 的 UID 0 账号：${EXTRA_ROOT}"
else
    pass "额外 UID 0 账号：无（仅 root）"
fi

# ---------- 6. UFW ----------
if ! command -v ufw >/dev/null 2>&1; then
    warn "UFW：未安装；本站基线以 UFW 为默认防火墙（第 02 部分 03 章）"
elif [ "$IS_ROOT" -eq 0 ]; then
    skip "UFW 状态：ufw status 需 root，非 root 跳过"
else
    UFW_STATE=$(ufw status 2>/dev/null | sed -n 's/^Status:[[:space:]]*//p' | head -n 1)
    if [ "$UFW_STATE" = "active" ]; then
        pass "UFW 状态：active"
    else
        fail "UFW 状态：${UFW_STATE:-未知}，防火墙未启用"
    fi
fi

# ---------- 7. Fail2ban ----------
F2B_INSTALLED=0
if command -v fail2ban-client >/dev/null 2>&1 || [ -d /etc/fail2ban ]; then
    F2B_INSTALLED=1
fi
if [ "$F2B_INSTALLED" -eq 0 ]; then
    warn "Fail2ban：未安装；第 02 部分 04 章推荐安装，但非强制基线"
elif [ "$HAS_SYSTEMD" -eq 0 ]; then
    skip "Fail2ban 状态：已安装，但非 systemd 环境无法查服务状态，跳过"
else
    F2B_STATE=$(systemctl is-active fail2ban.service 2>/dev/null || true)
    if [ "$F2B_STATE" = "active" ]; then
        pass "Fail2ban 状态：fail2ban.service active"
    else
        fail "Fail2ban 状态：已安装但服务状态为 ${F2B_STATE:-未知}"
    fi
fi

# ---------- 8. 自动安全更新 ----------
AU_FILE=/etc/apt/apt.conf.d/20auto-upgrades
if [ -r "$AU_FILE" ] \
    && grep -Eq 'APT::Periodic::Update-Package-Lists[[:space:]]+"1"' "$AU_FILE" \
    && grep -Eq 'APT::Periodic::Unattended-Upgrade[[:space:]]+"1"' "$AU_FILE"; then
    pass "自动安全更新：20auto-upgrades 已开启 Update-Package-Lists 与 Unattended-Upgrade"
else
    warn "自动安全更新：/etc/apt/apt.conf.d/20auto-upgrades 缺失或未双开（第 02 部分 07 章口径应开启）"
fi

# ---------- 9. /etc/shadow 空口令账号（需 root） ----------
if [ "$IS_ROOT" -eq 0 ]; then
    skip "/etc/shadow 空口令账号：读 shadow 需 root，跳过"
else
    EMPTY_SHADOW=$(awk -F: '$2=="" {print $1}' /etc/shadow | paste -sd' ' -)
    if [ -n "$EMPTY_SHADOW" ]; then
        fail "/etc/shadow 空口令账号：存在口令字段为空的账号：${EMPTY_SHADOW}"
    else
        pass "/etc/shadow 空口令账号：无"
    fi
fi

# ---------- 10. sudo 组成员 ----------
SUDO_LINE=$(getent group sudo | awk -F: '{print $4}')
if [ -z "$SUDO_LINE" ]; then
    pass "sudo 组成员：0 个"
else
    SUDO_COUNT=$(printf '%s' "$SUDO_LINE" | awk -F, '{print NF}')
    SUDO_NAMES=$(printf '%s' "$SUDO_LINE" | tr ',' ' ')
    if [ "$SUDO_COUNT" -gt "$SUDO_MEMBER_WARN_AT" ]; then
        warn "sudo 组成员：${SUDO_COUNT} 个（${SUDO_NAMES}），超过提示阈值 ${SUDO_MEMBER_WARN_AT}，确认均为在用管理员"
    else
        pass "sudo 组成员：${SUDO_COUNT} 个（${SUDO_NAMES}）"
    fi
fi

# ---------- 汇总 ----------
printf '== 汇总：PASS %d / FAIL %d / WARN %d / SKIP %d ==\n' "$PASS_N" "$FAIL_N" "$WARN_N" "$SKIP_N"
if [ "$FAIL_N" -gt 0 ]; then
    printf '关键 FAIL：%s\n' "$FAIL_NAMES"
    exit 1
fi
exit 0
