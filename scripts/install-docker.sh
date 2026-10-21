#!/usr/bin/env bash
# install-docker.sh — 在 Ubuntu 22.04 / 24.04 LTS 上安装 Docker Engine（官方 apt 源）
#
# 与本站章节对应：05 容器与编排 / 01 Docker 引擎与 Compose
# 用法（先下载审阅，再执行）：
#   curl -sSL -o install-docker.sh https://curzydj8.github.io/ubuntu-server-guide/scripts/install-docker.sh
#   less install-docker.sh
#   sudo bash install-docker.sh
#
# 安全提示：
#   1. 不要对任何远程脚本盲目使用 curl | bash，先落盘审阅。
#   2. docker 用户组等同 root 权限，脚本不会把任何用户自动加入 docker 组。
#   3. 本脚本可重复执行（幂等）：已配置的源与已装的包会被跳过或保持不变。
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 或 sudo 执行：sudo bash install-docker.sh" >&2
  exit 1
fi

# 只支持 Ubuntu 22.04 / 24.04，其他版本给出警告后退出，避免装错源
. /etc/os-release
if [[ "${ID}" != "ubuntu" || ! "${VERSION_ID}" =~ ^(22\.04|24\.04)$ ]]; then
  echo "警告：本脚本仅针对 Ubuntu 22.04 / 24.04，当前系统为 ${PRETTY_NAME}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> 安装依赖并配置 Docker 官方 GPG 密钥"
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

echo "==> 写入 Docker 官方 apt 源"
ARCH="$(dpkg --print-architecture)"
CODENAME="${VERSION_CODENAME}"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

echo "==> 安装 Docker Engine 与 Compose 插件"
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> 启用并启动服务"
systemctl enable --now docker

echo "==> 验证安装"
docker --version
docker compose version
docker run --rm hello-world

echo "完成。提醒：'docker' 组成员等同 root，不要随意添加普通账号；确需免 sudo 使用时执行："
echo "  sudo usermod -aG docker <user>   # 然后该用户重新登录生效"
