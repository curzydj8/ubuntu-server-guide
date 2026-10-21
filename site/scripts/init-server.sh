#!/usr/bin/env bash
# init-server.sh — Ubuntu Server 22.04 / 24.04 新机初始化基线
#
# 做什么：系统更新、常用工具、时区、UFW 防火墙、Fail2ban、无人值守安全更新。
# 与本站章节对应：01 基础入门（安装后配置）/ 02 安全加固。
# 用法（先下载审阅，再执行）：
#   curl -sSL -o init-server.sh https://curzydj8.github.io/ubuntu-server-guide/scripts/init-server.sh
#   less init-server.sh
#   sudo bash init-server.sh
#
# 安全提示：
#   1. 不要对任何远程脚本盲目使用 curl | bash，先落盘审阅。
#   2. 脚本会启用 UFW 并只放行 SSH：默认按 22 端口放行；若你已改 SSH 端口，
#      先改下面 SSH_PORT 变量再执行，否则可能把自己锁在外面。
#   3. 脚本不修改 SSH 配置、不禁用密码登录——那些属于高风险变更，
#      请按 02 安全加固 / 01 SSH 加固章手动完成并保留回滚通道。
set -euo pipefail

SSH_PORT="${SSH_PORT:-22}"
TIMEZONE="${TIMEZONE:-UTC}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 或 sudo 执行：sudo bash init-server.sh" >&2
  exit 1
fi

. /etc/os-release
if [[ "${ID}" != "ubuntu" || ! "${VERSION_ID}" =~ ^(22\.04|24\.04)$ ]]; then
  echo "警告：本脚本仅针对 Ubuntu 22.04 / 24.04，当前系统为 ${PRETTY_NAME}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> 系统更新"
apt-get update
apt-get -y upgrade

echo "==> 安装常用工具与防护组件"
apt-get install -y curl wget vim htop git tmux ufw fail2ban unattended-upgrades apt-listchanges

echo "==> 设置时区为 ${TIMEZONE}（按需用 TIMEZONE=Asia/Shanghai 环境变量覆盖）"
timedatectl set-timezone "${TIMEZONE}"

echo "==> 配置 UFW：默认拒绝入站，先放行 SSH ${SSH_PORT}/tcp 再启用"
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment 'SSH'
ufw --force enable
ufw status verbose

echo "==> 启用 Fail2ban（默认 sshd jail）"
systemctl enable --now fail2ban
fail2ban-client status || true

echo "==> 启用无人值守安全更新"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now unattended-upgrades

echo "完成。后续按本站 02 安全加固部分继续：SSH 密钥登录、禁用 Root、改端口与 MFA。"
