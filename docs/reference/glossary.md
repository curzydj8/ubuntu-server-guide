---
description: "Ubuntu Server 术语表：LTS、ESM、cloud-init、CIS、SSSD、DNSSEC、SPF / DKIM / DMARC、IOMMU、RPO / RTO、脑裂、LVM、PITR、幂等性等 38 个正文高频术语的一句话解释与详见章节链接。"
---

# 术语表

本表收录正文里反复出现的高频术语，每条只给一句话解释，细节看「详见」列的章节。按主题分组，组内按出现频率排列；查词时可直接用页面搜索（`Ctrl+F`）定位缩写。

## 版本与订阅

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| LTS（长期支持版，Long Term Support） | 偶数年 4 月发布的 Ubuntu 版本，标准支持期 5 年，生产服务器应优先选用 | [版本选择与 Lifecycle](../01-basics/01-version-lifecycle.md) |
| ESM（扩展安全维护，Expanded Security Maintenance） | 在 LTS 标准支持期之外继续提供安全更新的维护服务，是 Ubuntu Pro 的组成部分 | [版本选择与 Lifecycle](../01-basics/01-version-lifecycle.md) |
| Ubuntu Pro | Canonical 的订阅服务，涵盖 ESM 扩展安全维护、Livepatch 与合规工具等权益 | [版本选择与 Lifecycle](../01-basics/01-version-lifecycle.md) |
| Livepatch | 无需重启即可给运行中的内核打安全补丁的服务，降低「打补丁要停机」的维护压力 | [版本选择与 Lifecycle](../01-basics/01-version-lifecycle.md) |
| cloud-init | 云镜像与新装系统在首次启动时自动执行初始化（用户、密钥、网络、脚本等）的标准工具 | [cloud-init 与 Autoinstall](../01-basics/05-cloud-init-autoinstall.md) |
| Autoinstall | Ubuntu Server 的无人值守自动安装机制，用一份 YAML 回答全部安装问题实现批量装机 | [cloud-init 与 Autoinstall](../01-basics/05-cloud-init-autoinstall.md) |

## 身份、安全基线与目录服务

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| CIS Benchmark（CIS 基准） | CIS（互联网安全中心）发布的系统安全配置基线清单，逐条规定服务器应如何加固 | [CIS 基线与 USG](../02-security/06-cis-baseline.md) |
| USG（Ubuntu 安全指南，Ubuntu Security Guide） | Canonical 提供的合规审计与自动修复工具，可按 CIS 等基线检查并整改 Ubuntu | [CIS 基线与 USG](../02-security/06-cis-baseline.md) |
| SSSD（系统安全服务守护进程，System Security Services Daemon） | 让 Linux 主机接入 LDAP、Kerberos 等集中身份源做统一登录与缓存认证的服务 | [企业身份接入](../02-security/05-enterprise-identity.md) |
| Kerberos | 基于票据（Ticket）的网络身份认证协议，是企业目录域环境里单点登录的底层机制 | [企业身份接入](../02-security/05-enterprise-identity.md) |
| LDAP（轻量目录访问协议，Lightweight Directory Access Protocol） | 读取与维护目录服务（用户、组、组织结构）的标准协议，OpenLDAP 与 AD 都支持它 | [企业身份接入](../02-security/05-enterprise-identity.md) |

## 域名与邮件安全

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| DNSSEC（域名系统安全扩展，DNS Security Extensions） | 给 DNS 记录加数字签名的一套扩展，让解析结果可验证、防篡改与防伪造 | [DNSSEC 与高级 DNS](../04-network/05-dnssec-advanced.md) |
| SPF（发件人策略框架，Sender Policy Framework） | 用一条 DNS TXT 记录声明「哪些服务器有权以本域名发信」，供收信方核验来源 | [邮件服务器](../09-web-hosting/06-mail-server.md) |
| DKIM（域名密钥识别邮件，DomainKeys Identified Mail） | 发信服务器用私钥给邮件签名、收信方用 DNS 里公布的公钥验签的防伪造机制 | [邮件服务器](../09-web-hosting/06-mail-server.md) |
| DMARC（基于域的邮件认证，Domain-based Message Authentication） | 在 SPF / DKIM 之上声明校验失败时如何处置（拒收、隔离或仅报告）的策略记录 | [邮件服务器](../09-web-hosting/06-mail-server.md) |
| PTR（指针记录，Pointer Record） | 反向 DNS 记录，把 IP 地址映射回主机名，发信服务器缺它常被收信方降权或拒收 | [DNS 服务器搭建](../04-network/01-dns.md) |

## 虚拟化与直通

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| IOMMU（输入输出内存管理单元，Input-Output Memory Management Unit） | 负责设备 DMA 地址隔离与重映射的硬件单元，是设备直通安全隔离的前提（Intel 称 VT-d、AMD 称 AMD-Vi） | [PCIe 直通与 SR-IOV](../12-virtualization/03-passthrough-sriov.md) |
| VFIO（虚拟功能 I/O，Virtual Function I/O） | Linux 内核把 PCIe 设备安全交给虚拟机直通使用的驱动框架，GPU 与网卡直通都基于它 | [PCIe 直通与 SR-IOV](../12-virtualization/03-passthrough-sriov.md) |
| SR-IOV（单根 I/O 虚拟化，Single Root I/O Virtualization） | 一块物理网卡等设备在硬件上虚拟出多个独立功能、分别直通给多台虚拟机的技术 | [PCIe 直通与 SR-IOV](../12-virtualization/03-passthrough-sriov.md) |

## 可用性、容灾与数据

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| OOM（内存耗尽，Out of Memory） | 系统可用内存耗尽、内核 OOM Killer 被迫杀进程保命的状态，进程「无故消失」时先查它 | [CPU 与内存异常定位](../08-troubleshooting/04-cpu-memory.md) |
| RPO（恢复点目标，Recovery Point Objective） | 灾难时可容忍丢失的数据量上限，按时间衡量，决定备份与复制的频率 | [灾难恢复与系统迁移](../08-troubleshooting/05-disaster-recovery-migration.md) |
| RTO（恢复时间目标，Recovery Time Objective） | 灾难后可容忍的业务中断时长上限，决定恢复方案的速度与成本投入 | [灾难恢复与系统迁移](../08-troubleshooting/05-disaster-recovery-migration.md) |
| HA（高可用，High Availability） | 通过冗余与自动故障转移让服务在单点故障时仍可用的架构目标 | [容器化数据库与主从实战](../11-databases/09-ha-containerized.md) |
| fencing（隔离 / 栅栏） | 集群确认某节点故障后强制将其断电或断网隔离、防止它继续写数据的保护动作（又称 STONITH） | [容器化数据库与主从实战](../11-databases/09-ha-containerized.md) |
| split-brain（脑裂） | 集群因网络分区互相失联、各分区都自认主节点并同时写入，导致数据分叉的状态 | [容器化数据库与主从实战](../11-databases/09-ha-containerized.md) |
| 哨兵（Sentinel） | Redis 的高可用组件，负责监控主节点、判定故障并自动把从节点提升为新主节点 | [Redis 与 Sentinel 高可用](../11-databases/07-redis.md) |
| 主从复制（Replication） | 主节点把数据变更持续同步到从节点的技术，是读写分离与故障切换的基础 | [容器化数据库与主从实战](../11-databases/09-ha-containerized.md) |
| PITR（时间点恢复，Point-In-Time Recovery） | 用基础备份加归档日志把数据库恢复到任意指定时刻的能力 | [PostgreSQL 插件、备份与 PITR](../11-databases/06-postgresql-extensions-backup.md) |
| 快照（Snapshot） | 某个时刻数据状态的可回滚副本，LVM、ZFS / Btrfs 与备份工具都提供各自的实现 | [ZFS 与 Btrfs](../03-storage/02-zfs-btrfs.md) |

## 网络与存储基础

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| MTU（最大传输单元，Maximum Transmission Unit） | 一条链路单帧能承载的最大数据量，隧道与 VPN 场景两端不一致时会出现「小包通、大包卡」 | [网络故障排查流程](../08-troubleshooting/02-network-diagnosis.md) |
| LVM（逻辑卷管理，Logical Volume Manager） | 在物理盘之上抽象出卷组与逻辑卷、让分区可动态扩容与做快照的存储层 | [LVM 动态卷管理](../03-storage/01-lvm.md) |
| 反向代理（Reverse Proxy） | 位于客户端与后端服务之间、代后端接收请求并转发的服务器，Nginx 是最常见的实现 | [Web 服务器与反向代理](../04-network/02-web-proxy.md) |
| 跳板机（ProxyJump） | 先 SSH 登录一台中转主机、再经它跳入内网目标主机的接入方式，客户端用 `ProxyJump` 参数实现 | [SSH 隧道与跳板机](../14-ssh/05-tunnels-jump.md) |

## 服务管理与自动化

| 术语 | 解释 | 详见 |
| --- | --- | --- |
| 幂等性（Idempotency） | 同一操作执行一次与重复执行多次结果一致的属性，是自动化配置工具可安全重跑的前提 | [Ansible 自动化配置管理](../07-automation/03-ansible.md) |
| systemd unit（单元） | systemd 管理的资源对象统称，服务、定时器、挂载点等各是一种单元类型 | [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md) |
| timer（定时器） | systemd 的定时触发单元，到点激活对应的 service，是 cron 之外的主流定时方案 | [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md) |
| 数据卷（Volume） | 容器之外独立保存数据的存储单元，容器删除或重建后数据仍在，数据库等有状态服务必须用它落盘 | [Docker 基础与进阶](../05-containers/01-docker.md) |
| 镜像（Image） | 打包了程序、运行库与默认配置的只读模板，容器由镜像实例化，镜像由 Dockerfile 构建或从仓库拉取 | [Docker 基础与进阶](../05-containers/01-docker.md) |
