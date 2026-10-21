---
description: "一台物理服务器常年只跑一两个服务是常见浪费：CPU 大量空闲，内存与磁盘无法被其他业务借用。KVM 把 Linux 内核变成虚拟机监控器，配合 QEMU 的设备模拟与 libvirt 的统一管理，"
---

# KVM/QEMU 宿主机与 Proxmox VE 客体机实践

## 一、概述与使用场景

一台物理服务器常年只跑一两个服务是常见浪费：CPU 大量空闲，内存与磁盘无法被其他业务借用。KVM 把 Linux 内核变成虚拟机监控器，配合 QEMU 的设备模拟与 libvirt 的统一管理，可把一台宿主机切分为多台相互隔离的虚拟机，每台有独立系统与故障域，一台崩溃不影响其他台。

不做虚拟化的风险同样明显：多业务混装时依赖与端口冲突、权限边界模糊随时间累积，一次升级可能同时影响全部业务；没有快照与克隆时新环境要重走安装流程；没有资源配额时单个业务的异常负载会拖垮同机全部服务。

本章先在 Ubuntu 上搭建裸 KVM 宿主机，覆盖检测、安装、图形管理、桥接网络与存储池，再讲解 Ubuntu 作为 Proxmox VE 客体机的最佳实践，最后简述 Proxmox VE 的安装思路与取舍。典型场景包括开发测试克隆、老旧业务隔离迁移、私有云独立主机与 Proxmox VE 集群上的 Ubuntu 模板机。

## 二、环境准备与前置条件

系统要求 Ubuntu Server 22.04 LTS 或 24.04 LTS，已完成系统更新，使用默认内核。宿主机建议配置如下：

| 项目 | 建议 | 说明 |
| --- | --- | --- |
| CPU | 4 核以上，支持 VT-x 或 AMD-V 并带二级地址转换 | 核数决定可并发运行的虚拟机规模 |
| 内存 | 16 GiB 以上 | 宿主机至少预留 4 GiB，其余分配给虚拟机 |
| 磁盘 | 系统盘与虚拟机存储分开，优先 SSD | 机械盘会显著放大多虚拟机并发时的延迟 |
| 网络 | 至少一块有线网卡 | 桥接配置期间网络会短暂中断，必须有带外或本地通道 |
| BIOS | 已开启虚拟化选项 | 未开启时检测命令会明确提示 |

权限要求：账号 `ubuntu` 具备 sudo 权限并能加入 `libvirt` 与 `kvm` 组。准备本地控制台或带外管理、Ubuntu Server 安装镜像与地址规划。本章示例：宿主机 `192.0.2.10`，网关 `192.0.2.1`，域名只用 `example.com`。

!!! warning "改桥接前先想好怎么重新连上"
    把物理网卡接入桥接会重构宿主机网络，SSH 会话必然中断。若新配置有误，宿主机将无法远程登录。操作前确认你有本地显示器、带外管理或云厂商控制台中的至少一种兜底通道，并把原始 Netplan 文件备份好。

!!! note "bridge-utils 的现状"
    老教程常要求安装 `bridge-utils` 并用 `brctl` 管理网桥。在 Netplan 加 systemd-networkd 或 NetworkManager 的现代 Ubuntu 上，网桥直接在 Netplan 配置中声明即可，`bridge-utils` 只提供传统命令行工具，不是必需依赖，本章不安装它，统一用 Netplan 与 `bridge` 命令查看状态。

## 三、手把手操作步骤

### 3.1 检测虚拟化支持

先确认硬件与内核都支持 KVM，不要跳过这一步直接装包：

```bash
sudo apt update
sudo apt install -y cpu-checker
sudo kvm-ok
grep -E -c "vmx|svm" /proc/cpuinfo
egrep -wo "vmx|svm" /proc/cpuinfo | sort | uniq
lsmod | grep kvm
```

逐项判读：`kvm-ok` 应输出 KVM acceleration can be used 一类肯定结论，并提示 CPU 支持状态；`grep -E -c` 的结果大于 0 说明每个逻辑核心的标志统计中存在虚拟化标志；标志列表中 Intel 平台应出现 `vmx`，AMD 平台应出现 `svm`；`lsmod` 中应能看到 `kvm_intel` 或 `kvm_amd` 模块。若 `kvm-ok` 提示 CPU 不支持或 BIOS 未开启，先进 BIOS 打开虚拟化选项再重试，软件层无法弥补。

### 3.2 安装 libvirt 与 QEMU

```bash
sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients virtinst virt-manager
sudo systemctl enable --now libvirtd
sudo systemctl status libvirtd
sudo usermod -aG libvirt ubuntu
sudo usermod -aG kvm ubuntu
```

包名讲解：

| 软件包 | 作用 |
| --- | --- |
| `qemu-kvm` | QEMU 的 KVM 入口与相关配置，提供硬件加速的虚拟机运行能力 |
| `libvirt-daemon-system` | libvirt 守护进程与系统级驱动，管理虚拟机生命周期 |
| `libvirt-clients` | 提供 `virsh` 命令行管理工具 |
| `virtinst` | 提供 `virt-install`，用于脚本化创建虚拟机 |
| `virt-manager` | 图形化管理程序，适合在带桌面的管理机上远程连接宿主机使用 |

把当前用户加入组后必须重新登录，组权限才生效。验证用 `virsh list --all`，刚安装时应输出空列表而不是权限错误。`virt-manager` 在无桌面的服务器上不必本机运行界面，推荐装在管理员工作站上，通过 SSH 连接到宿主机的 libvirt 进行管理。

### 3.3 备份并配置桥接网络 br0

桥接让虚拟机直接接入与宿主机相同的二层网络，像一台独立服务器一样从现有 DHCP 或静态规划中获得地址，比默认的 NAT 模式更适合对外提供服务。先备份再改配置：

```bash
ls /etc/netplan/
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.bak-$(date +%F)
ip -br link
ip -br addr
```

先用上面两条命令确认物理网卡的真实名字与当前地址，下例假定网卡名为 `enp3s0`，执行时必须替换为你机器上的真实名字。编辑 Netplan 文件，完整内容如下：

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp3s0:
      dhcp4: false
      dhcp6: false
  bridges:
    br0:
      interfaces:
        - enp3s0
      addresses:
        - 192.0.2.10/24
      routes:
        - to: default
          via: 192.0.2.1
      nameservers:
        addresses:
          - 192.0.2.53
          - 198.51.100.53
      parameters:
        stp: false
        forward-delay: 0
      dhcp4: false
      dhcp6: false
```

参数逐行讲解：

| 配置项 | 含义 |
| --- | --- |
| `ethernets/enp3s0` 关闭 DHCP | 物理网卡本身不再持有地址，只作为桥的端口 |
| `bridges/br0/interfaces` | 把物理网卡加入 br0，虚拟机网卡后续也接入 br0 |
| `addresses` | 地址改由 br0 持有，宿主机今后用这个地址被访问 |
| `routes` 默认路由 | 经网关访问其他网段，写法适用于 22.04 与 24.04 的 Netplan |
| `nameservers` | 给宿主机指定 DNS，示例均为文档地址，实际替换为你的 DNS |
| `stp: false` | 单上行口场景关闭生成树，避免接入时长时间阻塞，冗余双上行时不要关 |
| `forward-delay: 0` | 桥端口转发延迟设为零，缩短重启后的网络恢复时间 |

应用配置：

```bash
sudo netplan generate
sudo netplan apply
ip -br addr show br0
bridge link show
ping -c 3 192.0.2.1
```

`netplan generate` 先做语法校验，通过后再 `apply`。应用后当前 SSH 会断开，用 br0 的地址重新连接。若使用 cloud-init 管理网络，还需确认它不会在重启时覆盖此文件，常见做法是在 cloud-init 配置中禁用网络配置接管，并把该结论记录在运维文档中。

!!! danger "地址写错等于宿主机失联"
    br0 的地址、掩码与网关任何一项写错，宿主机都会从网络上消失。应用前逐字核对，并确保你手边有本地控制台。云服务器厂商若有 VNC 控制台，先打开控制台窗口再执行 apply。

### 3.4 创建与管理存储池

存储池是 libvirt 对虚拟机磁盘存放位置的抽象。默认池位于 `/var/lib/libvirt/images`，生产环境建议把池指向独立数据盘挂载点，例如 `/srv/vm-images`：

```bash
sudo mkdir -p /srv/vm-images
sudo cp /etc/fstab /etc/fstab.bak-$(date +%F)
df -h /srv/vm-images
cat > /tmp/dirpool.xml <<'EOF'
<pool type='dir'>
  <name>vmimages</name>
  <target>
    <path>/srv/vm-images</path>
  </target>
</pool>
EOF
sudo virsh pool-define /tmp/dirpool.xml
sudo virsh pool-start vmimages
sudo virsh pool-autostart vmimages
sudo virsh pool-list --all
sudo virsh pool-info vmimages
```

注意上面的 fstab 备份只是改盘前的固定动作，本例未直接改 fstab 内容；若你要新增挂载行，必须在备份后编辑并先用 `sudo mount -a` 验证再重启。`pool-define` 注册池，`pool-start` 启用，`pool-autostart` 保证宿主机重启后池自动可用。下载或拷贝的安装镜像也建议放在池目录或单独的镜像目录中统一管理。

### 3.5 创建第一台虚拟机

```bash
sudo virt-install \
  --name ubuntu-guest-01 \
  --memory 4096 \
  --vcpus 2 \
  --disk pool=vmimages,size=40,format=qcow2,bus=virtio \
  --os-variant ubuntu22.04 \
  --network bridge=br0,model=virtio \
  --graphics vnc,listen=127.0.0.1 \
  --cdrom /srv/vm-images/ubuntu-server.iso \
  --boot uefi
```

关键参数讲解：`--memory` 与 `--vcpus` 按规划分配，不要把宿主机内存全分完；`bus=virtio` 与网卡 `model=virtio` 让客体机走半虚拟化高性能驱动，前提是客体系统支持，Ubuntu 原生支持；`--os-variant` 帮助 libvirt 选择合适的默认设备组合，可用 `osinfo-query os` 查看可选值；VNC 只监听本机回环地址，安装时通过 SSH 隧道或 virt-manager 连接，不把 VNC 端口暴露到网络。安装完成后用 `virsh list --all`、`virsh start`、`virsh shutdown`、`virsh dominfo` 管理生命周期，强制断电用 `virsh destroy`，它等同于拔电源，只在系统无响应时使用。

### 3.6 Ubuntu 作为 Proxmox VE 客体机的最佳实践

当虚拟机跑在 Proxmox VE 上时，Ubuntu 客体机应做四项标准动作。第一，安装并启用访客代理，它让宿主机能获取客体机的地址、干净地关机与做一致性快照：

```bash
sudo apt update
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
systemctl status qemu-guest-agent
```

同时在 Proxmox VE 的虚拟机选项中把 QEMU Guest Agent 开关打开，两端都启用才生效。第二，磁盘与网卡选 VirtIO：磁盘控制器用 VirtIO SCSI 或 VirtIO Block，网卡型号选 VirtIO 半虚拟化，Ubuntu 安装程序原生识别这些设备，不需要额外注入驱动。第三，理解内存气球 ballooning：气球驱动允许宿主机在内存紧张时回收客体机闲置内存，界面上表现为虚拟机内存占用浮动；给数据库等对内存敏感的业务设置合理的最小内存下限，避免回收过度引发客体机内频繁换页。第四，机器类型与 CPU 类型按集群要求统一：需要在节点间热迁移时，CPU 类型不要直接透传宿主机型号，选集群内所有节点都兼容的类型；不需要迁移的单机场景才考虑透传以获得完整指令集。

### 3.7 Proxmox VE 本身安装思路简述

Proxmox VE 不是 Ubuntu 上的一个软件包，它是一套基于 Debian 的完整虚拟化平台，自带 Web 管理界面、集群、备份与软件定义存储整合。两条安装路线：一是 ISO 路线，下载官方 ISO 直接装机，系统盘、网络与存储在安装器中一次成型，适合专用新机器；二是 apt 路线，先装标准 Debian，再添加 Proxmox 软件源安装其内核与平台包，适合已有 Debian 机器改造，步骤更长、对版本对应关系要求更严。

与裸 KVM 的取舍：裸 KVM 加 libvirt 胜在轻量、组件可控、与 Ubuntu 生态贴合，适合单机或已有自动化体系的团队；Proxmox VE 胜在开箱即用的集群管理、备份调度与界面，适合多节点私有云与需要把管理权限下放给运维人员的场景。两者底层同为 KVM，虚拟机磁盘格式互通，选型重点不在性能，而在管理规模与团队习惯。注意不要尝试在 Ubuntu 上强行安装 Proxmox VE 的 apt 包，其依赖按 Debian 构建，混装会破坏系统。

## 四、效果验证与测试

宿主机层验证：

```bash
sudo kvm-ok
virsh list --all
virsh net-list --all
virsh pool-list --all
ip -br addr show br0
sudo systemctl is-active libvirtd
```

期望结果：`virsh list --all` 列出已创建的虚拟机及其状态；`pool-list` 中自定义池状态为 active 且自启动为 yes；br0 持有规划地址且能 ping 通网关。

客体机层验证，在虚拟机内执行：

```bash
ip -br addr
ping -c 3 192.0.2.1
ping -c 3 example.com
systemctl is-active qemu-guest-agent
lsblk
```

期望客体机拿到规划网段地址，能通网关且能解析域名；在 Proxmox VE 界面或 `virsh domifaddr` 一类查询中能读到客体机地址，说明访客代理链路正常。性能基线可用 `fio` 做一次顺序读写冒烟，并与同机裸盘结果对比，VirtIO 路径下不应出现数量级差距，出现则优先检查磁盘总线类型与缓存模式设置。

## 五、常见错误与排坑指南

### 场景一：kvm-ok 提示无法使用加速

报错原文片段：

```text
INFO: Your CPU does not support KVM extensions
KVM acceleration can NOT be used
```

原因依次排查：BIOS 中虚拟化未开启；宿主机本身也是一台虚拟机且上层未开启嵌套虚拟化；云厂商实例规格不支持。修复：物理机进 BIOS 开启 VT-x 或 AMD-V；嵌套场景在上层宿主机为这台机器开启嵌套虚拟化后完全关机再开机；云上则更换支持嵌套的规格。在问题解决前不要强行用纯软件模拟创建虚拟机，性能会差到不可用。

### 场景二：应用 Netplan 后宿主机失联

现象：执行 `netplan apply` 后 SSH 断开，新旧地址都无法登录。原因多为网卡名写错、地址仍写在物理网卡段下而不是 br0 段下，或 cloud-init 在重启时覆盖配置。通过本地控制台登录后修复：

```bash
ip -br addr
sudo cp /etc/netplan/50-cloud-init.yaml.bak-2026-01-01 /etc/netplan/50-cloud-init.yaml
sudo netplan generate
sudo netplan apply
```

上面备份文件名中的日期要替换为你实际备份的日期。恢复后逐项对照第 3.3 节示例修正，再在控制台开着的情况下二次应用。长期对策是改桥接一律走控制台或带外通道，并保留一份已验证可用的配置副本。

### 场景三：普通用户执行 virsh 报权限错误

报错原文片段：

```text
error: failed to connect to the hypervisor
error: Permission denied
```

原因是用户未加入 `libvirt` 组，或加组后未重新登录，连接了只读或错误的作用域。修复命令：

```bash
sudo usermod -aG libvirt ubuntu
sudo usermod -aG kvm ubuntu
groups ubuntu
virsh -c qemu:///system list --all
```

执行加组后退出当前会话重新登录，再用带 `qemu:///system` 的完整连接串验证。注意不要用修改 libvirt 套接字权限的方式绕过组管理，那会给后续审计留隐患。

## 六、生产环境最佳实践与安全建议

资源规划留有余量：CPU 可适度超分，内存不要超分，尤其是数据库虚拟机；宿主机预留固定资源。存储上 qcow2 适合模板与快照，吞吐敏感场景评估原始格式或 LVM 卷，镜像与备份放在不同介质上。快照不是备份，重要虚拟机必须有独立备份与恢复演练。

模板化交付是私有云效率的关键：做一台装好访客代理、系统更新与基础加固的黄金镜像，清理机器标识后做成模板，新虚拟机从模板克隆并在首次启动时重新生成标识与主机密钥，避免多台机器标识冲突。

安全上，libvirt 管理通道只走 SSH 或 TLS，不裸奔在网络上；VNC 与 SPICE 控制台只监听回环或管理网段，并设置控制台密码策略；宿主机只开放管理所需端口，管理界面与虚拟机业务网段隔离。权限上按人授予 libvirt 组，而不是多人共用同一个高权限账号。

运维上把 Netplan 与虚拟机定义纳入版本记录，`virsh dumpxml` 定期导出归档；升级内核与 QEMU 前先在非关键虚拟机上验证。监控覆盖宿主机内存与存储池剩余空间，存储池写满会让多台虚拟机同时异常，必须设容量告警并提前扩容。
