---
description: "Ubuntu Server 终极指南与实战教程：从安装、安全加固、存储网络、容器监控到数据库、虚拟化、AI 运维与 SSH 专题，15 个部分、开箱即用的完整命令，适配 Ubuntu 22.04 / 24.04 LTS。"
---

# Ubuntu Server 终极指南与实战教程

欢迎来到 **《Ubuntu Server 终极指南与实战教程》**。这是一套面向真实生产环境的 Ubuntu Server 全栈教程：从装机、加固、存储、网络、容器、监控、自动化，一直到故障应急，全部给出**开箱即用的完整命令与配置文件**，不省略、不含糊。

- **目标版本**：Ubuntu 22.04 LTS / 24.04 LTS（涉及 20.04 等版本差异处会用提示块单独标注）
- **写作标准**：每章统一六段式结构——概述与场景 → 前置条件 → 手把手步骤（改配置前先备份、关键参数逐行讲解）→ 效果验证 → 排坑指南 → 生产最佳实践
- **使用方式**：左侧目录按部分导航，顶部可全文搜索，所有代码块右上角都有一键复制按钮

## 验证声明

本站的验证口径如实说明，不夸大：核心流程（安装、SSH、防火墙、Netplan、Docker、MySQL / PostgreSQL 等日常运维内容）已在 Ubuntu 22.04 / 24.04 LTS 实机上实际使用过；其余章节（如 Kubernetes 轻量集群、GPU / CUDA、KVM、游戏服务器等）为与官方文档逐项核对后的「文档核对」级别，未在实机完整验证，使用前请先在测试环境演练。Ubuntu 26.04 LTS 的兼容性目前一律为「待核验」，本站不会提前宣称支持。各主题在各版本上的详细状态见 [版本兼容与验证状态](compatibility.md)，全站以该页标注为准。

## 阅读路径

=== "从零装机"

    第一次接触 Ubuntu Server，按顺序读完第 01 部分即可独立完成装机与上线：

    1. [版本选择与 Lifecycle](01-basics/01-version-lifecycle.md)
    2. [系统安装](01-basics/02-installation.md)
    3. [首次登录与网络初始化](01-basics/03-first-login-network.md)
    4. [软件源与包管理](01-basics/04-package-management.md)
    5. 然后直接跳 [SSH 安全加固](02-security/01-ssh-hardening.md)——新机上线第一件事

=== "系统运维"

    日常维护与架构搭建：

    - 安全基线：[用户与 Sudo](02-security/02-users-sudo-pam.md) → [防火墙](02-security/03-firewall.md) → [入侵防御](02-security/04-defense.md)
    - SSH 实战：[SSH 专题](14-ssh/index.md)——连接、密钥、隧道与排错（服务端加固见第 02 部分）；命令忘了查 [Linux 命令速查手册](15-command-reference/index.md)
    - 存储：[LVM](03-storage/01-lvm.md) → [ZFS/Btrfs](03-storage/02-zfs-btrfs.md) → [备份](03-storage/04-backup.md)
    - 服务：[DNS](04-network/01-dns.md) → [Web 与反向代理](04-network/02-web-proxy.md) → [VPN 组网](04-network/03-vpn-tunnel.md)

=== "容器与自动化"

    - [Docker](05-containers/01-docker.md) → [Podman](05-containers/02-podman.md) → [k3s / microk8s](05-containers/03-kubernetes-light.md)
    - [Shell 脚本规范](07-automation/01-shell-scripting.md) → [Systemd 定时任务](07-automation/02-systemd-timers.md) → [Ansible](07-automation/03-ansible.md)
    - 监控体系：[命令行工具](06-monitoring/01-cli-tools.md) → [Prometheus + Grafana](06-monitoring/02-prometheus-grafana.md) → [日志栈](06-monitoring/03-logging-stack.md) → [内核调优](06-monitoring/04-kernel-tuning.md)

=== "建站与联机"

    把服务跑起来并对外发布：

    - 域名先行：[域名解析与网络连接](09-web-hosting/01-dns-resolution.md) → [HTTPS 自动化证书](09-web-hosting/05-https-certificates.md)
    - 自建路线：[LNMP / LAMP](09-web-hosting/03-lnmp-lamp.md)；面板路线：[宝塔面板](09-web-hosting/02-baota-panel.md)；容器路线：[Docker 部署应用](09-web-hosting/04-docker-apps.md)
    - 游戏服：[端口开放「三重门」](10-game-servers/01-port-opening.md) → [游戏服务端实战](10-game-servers/02-game-server-setup.md) → [性能调优与守护](10-game-servers/03-performance-daemon.md) → 没公网 IP 看 [内网穿透](10-game-servers/04-nat-traversal.md)

=== "出故障了"

    先稳住，再按现象直达第 08 部分：

    - 开不了机 → [系统无法启动修复](08-troubleshooting/01-boot-repair.md)
    - 网络不通 / 丢包 → [网络故障排查流程](08-troubleshooting/02-network-diagnosis.md)
    - 磁盘满了 → [磁盘爆满与句柄耗尽](08-troubleshooting/03-disk-full.md)
    - CPU / 内存飙高 → [CPU / 内存异常定位](08-troubleshooting/04-cpu-memory.md)

## 内容地图

| 部分 | 主题 | 章节 |
| --- | --- | --- |
| 01 | 基础入门与安装 | 版本与 Lifecycle、系统安装、网络初始化、包管理、云初始化与 Autoinstall、系统升级与生命周期、多架构 |
| 02 | 系统安全与权限管理 | SSH 加固、用户/Sudo/PAM、防火墙、入侵防御、企业身份认证、CIS 基线审计、自动安全更新、证书生命周期、秘密管理 |
| 03 | 磁盘、文件系统与存储 | LVM、ZFS/Btrfs、挂载共享（含 Samba 深化）、备份、硬件健康检查 |
| 04 | 网络服务与核心架构 | DNS、DNSSEC 进阶、Web/反代、VPN 隧道、时间与日志（含时间同步深化）、HAProxy 负载均衡 |
| 05 | 容器化与云原生 | Docker、Podman、k3s/microk8s、供应链安全 |
| 06 | 监控、日志与调优 | CLI 工具、Prometheus/Grafana、日志栈、内核调优、可观测性与告警治理、容量与日志治理 |
| 07 | 自动化运维与脚本 | Shell 规范、Systemd Timers、Ansible、服务工程化与漂移检测 |
| 08 | 故障排查与应急响应 | 启动修复、网络排查、磁盘爆满、性能定位、灾难恢复、内核启动恢复、事故响应 |
| 09 | 网站搭建、域名与应用部署 | 域名解析、宝塔面板、LNMP/LAMP、Docker 应用、HTTPS 证书、邮件服务器 |
| 10 | 游戏服务器部署与端口映射 | 端口三重门、游戏服务端、性能守护、内网穿透 |
| 11 | 数据库安装、管理与高可用 | MySQL/MariaDB、PostgreSQL、Redis、MongoDB、主从与备份恢复、HA 实战与恢复演练 |
| 12 | 硬件、虚拟化与私有云 | GPU/CUDA、KVM/QEMU/PVE、直通与 SR-IOV |
| 13 | AI 工具与智能化运维 | 本地大模型、AI CLI 安全边界、IaC 与 GitOps |
| 14 | SSH 专题：连接、密钥与隧道 | 原理与安装、连接与配置、密钥与 Agent、传输与远程执行、隧道与跳板机、排错与加固 |
| 15 | Linux 命令速查手册 | 文件权限、软件包服务、网络诊断、磁盘进程、文本归档、定时容器系统 |

另有：[参考索引](reference/index.md)（术语表、命令索引、端口与协议目录、配置文件索引、内容贡献规范）、[互动工具](tools/index.md)（九个在线工具：Netplan、UFW、SSH、子网计算、Cron、systemd、Nginx 反代、Compose、LVM 扩容）与[更新日志](changelog.md)。

## 与旧教程的关系

站长此前维护了一套偏桌面与远程控制场景的 [Ubuntu Server 教程（旧版）](https://github.com/curzydj8/ubuntu-server-tutorial)（安装、桌面环境、Python、远程桌面、模拟键鼠等）。本指南是面向**服务器运维**的新体系：结构更完整、模板更严格、深度对标生产环境。两者互补——需要图形桌面与远程自动化场景时查旧版，需要服务器全栈能力时查本指南。

!!! note "示例约定"
    全站示例 IP 只使用文档保留段（192.0.2.x、198.51.100.x）与占位符，用户名、主机名、域名均为示例值，请按你的实际环境替换后再执行。涉及磁盘、分区、防火墙等高风险操作时，文中会用警告块明确标出。
