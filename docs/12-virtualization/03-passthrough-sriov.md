# PCIe 直通与 SR-IOV

## 一、概述与使用场景

模拟设备解决能不能用，直通解决够不够快。普通虚拟网卡与虚拟磁盘要经过宿主机软件栈中转，延迟与 CPU 开销随负载放大；PCIe 直通借助 IOMMU 把整块物理设备交给虚拟机，虚拟机用原生驱动直接操作硬件，性能接近裸机。SR-IOV 更进一步：一块物理网卡可在硬件层切出多个虚拟功能 VF，每个 VF 都是一块可独立直通的轻量网卡。

瓶颈在三类场景最明显：GPU 虚拟机走模拟显卡无法使用 CUDA；高包率网络在虚拟交换路径上丢包抖动；NVMe 虚拟机在模拟控制器下浪费队列与中断优势。直通不是免费的：设备从宿主机消失、无法共享、热迁移受限，配错还可能让宿主机启动异常。因此本章把风险与回滚放在与操作同等重要的位置，每步改动前先备份，每台设备直通前先确认分组与保留策略。适用场景包括 GPU 虚拟机、网关独占网卡、数据库直通 NVMe 与 SR-IOV 多机近裸机网络；普通业务不需要直通。

## 二、环境准备与前置条件

系统要求 Ubuntu 22.04 LTS 或 24.04 LTS，已按上一章装好 KVM 与 libvirt，且有一台能正常开关机的测试虚拟机。硬件要求：

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| CPU 与芯片组 | 支持 VT-d 或 AMD-Vi | 只有 VT-x 或 AMD-V 而无 IOMMU 扩展时不能直通 |
| BIOS | 有 IOMMU、Above 4G Decoding 等选项 | 多卡或大显存显卡场景常需开启 Above 4G |
| 待直通设备 | 显卡、网卡或 NVMe 中至少一类 | 先查 IOMMU 分组再决定，见第三节 |
| 宿主机显示 | 直通独显时宿主机另有核显或带外显示 | 否则宿主机本地将无画面 |
| 网卡（SR-IOV） | 型号明确支持 SR-IOV 且驱动支持创建 VF | 以厂商规格与内核驱动文档为准 |

权限与准备：账号 `ubuntu` 具备 sudo 权限；已准备本地控制台或带外管理；已记录待直通设备的 ID 与 PCI 地址；已做可恢复备份。示例中 PCI 地址与设备 ID 仅为占位格式，执行时必须替换为 `lspci` 的真实输出。

!!! danger "先分组，后直通"
    IOMMU 分组决定隔离边界。同一分组内的设备只能一起直通，不能拆开分给不同虚拟机，也不能一半留给宿主机一半直通。没看清分组就写绑定配置，是本章最高发的事故来源。

!!! warning "宿主机保留设备警告"
    正在承担宿主机控制台显示、宿主机网络或系统盘的设备，默认列为保留设备，禁止直通。直通系统盘所在的 NVMe 控制器或唯一网卡，会让宿主机直接失去磁盘或网络。每一台机器都应先列一张保留清单，再列直通清单。

## 三、手把手操作步骤

### 3.1 在 BIOS 中开启 IOMMU

进入 BIOS/UEFI：Intel 平台开启 Virtualization Technology 与 VT-d，AMD 平台开启 SVM 与 IOMMU；使用大显存显卡时一并开启 Above 4G Decoding。BIOS 打开不等于内核已启用，还需下一节的内核参数，并用日志验证。

### 3.2 备份并修改 GRUB 内核参数

修改启动参数前必须先备份，这是本章回滚链的第一环：

```bash
sudo cp /etc/default/grub /etc/default/grub.bak-$(date +%F)-before-iommu
sudo cp -a /boot/grub /root/grub-backup-$(date +%F) 2>/dev/null || echo "grub 目录备份跳过，以 /etc/default/grub 备份为准"
cat /etc/default/grub
```

编辑 `/etc/default/grub`，在 `GRUB_CMDLINE_LINUX_DEFAULT` 的引号内追加参数。Intel 平台完整示例行：

```ini
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash intel_iommu=on iommu=pt"
```

AMD 平台完整示例行：

```ini
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash amd_iommu=on iommu=pt"
```

参数讲解：

| 参数 | 含义 |
| --- | --- |
| `intel_iommu=on` | 强制开启 Intel 平台 IOMMU，不要写成其他拼写 |
| `amd_iommu=on` | 强制开启 AMD 平台 IOMMU，与上一项二选一，按平台选用 |
| `iommu=pt` | 透传模式：未被直通分配的设备走直通域，降低宿主机自身 DMA 开销；需要严格隔离宿主机设备时再评估去掉它 |

应用并重启：

```bash
sudo update-grub
sudo reboot
```

### 3.3 验证 IOMMU 与查看分组

```bash
dmesg | grep -i -E "iommu|DMAR"
cat /proc/cmdline
```

Intel 平台期望看到 DMAR 与 IOMMU 启用行，AMD 平台期望看到 AMD-Vi 行；`/proc/cmdline` 应包含 iommu 参数。未开启时回 BIOS 与 GRUB 逐项核对。

查看分组用下面的脚本，它按分组列出每组内的全部设备：

```bash
cat > /tmp/list-iommu.sh <<'EOF'
#!/bin/bash
shopt -s nullglob
for g in /sys/kernel/iommu_groups/*; do
  echo "IOMMU Group ${g##*/}:"
  for d in ${g}/devices/*; do
    echo -e "  $(lspci -nns ${d##*/})"
  done
done
EOF
chmod +x /tmp/list-iommu.sh
/tmp/list-iommu.sh | tee /tmp/iommu-groups.txt
lspci -nn
```

判读：目标设备独占一组最理想；显卡的显示与音频功能同组是正常情况，应一起直通。若目标设备与系统盘控制器或宿主机网卡同组，则在当前布局下不适合直通，应换插槽重试分组，不要强行整组直通。

关于 ACS：ACS 是 PCIe 访问控制服务，完整支持能让每个设备独立成组。部分消费级主板分组较粗，是布线与桥接方式决定的。社区有通过 ACS 覆盖参数强拆分组的做法，它削弱设备间隔离，虚拟机之间可能通过 DMA 互相影响。本书不推荐在生产环境使用，正确处理是调整插槽、更换主板或接受整组直通。

### 3.4 把设备绑定到 VFIO

确认分组后，记录目标设备的厂商与设备 ID：

```bash
lspci -nn -s 03:00
```

方括号内的十六进制组合就是 ID，厂商号在前、设备号在后。直通整组时每个功能的 ID 都要列全，包括音频功能。备份并写 VFIO 配置：

```bash
sudo cp -a /etc/modprobe.d /root/modprobe.d.bak-$(date +%F)
sudo cp /etc/initramfs-tools/modules /etc/initramfs-tools/modules.bak-$(date +%F) 2>/dev/null || echo "modules 文件不存在，跳过该项备份"
cat > /tmp/vfio-conf.sh <<'EOF'
#!/bin/bash
echo "options vfio-pci ids=厂商号:设备号,厂商号:音频设备号" | sudo tee /etc/modprobe.d/vfio.conf
echo "softdep nvidia pre: vfio-pci" | sudo tee -a /etc/modprobe.d/vfio.conf
cat /etc/modprobe.d/vfio.conf
EOF
bash /tmp/vfio-conf.sh
```

上面脚本中的中文占位必须替换为真实 ID 后再执行，软依赖一行仅在宿主机同时装有对应原生驱动时按需保留，目的是让 vfio-pci 在原生驱动之前抢先绑定设备。随后把 VFIO 模块写入 initramfs 并重建：

```bash
cat > /tmp/vfio-modules.sh <<'EOF'
#!/bin/bash
for m in vfio vfio_iommu_type1 vfio_pci vfio_virqfd; do
  grep -qx "$m" /etc/initramfs-tools/modules || echo "$m" | sudo tee -a /etc/initramfs-tools/modules
done
cat /etc/initramfs-tools/modules
EOF
bash /tmp/vfio-modules.sh
sudo update-initramfs -u
sudo reboot
```

重启后验证绑定结果：

```bash
lspci -nnk -s 03:00
```

期望目标设备的 Kernel driver in use 一行显示 `vfio-pci`。若仍显示原生驱动，检查 ids 是否写全、initramfs 是否重建、软依赖是否生效，三项逐一核对。

!!! danger "直通后宿主机失去该设备"
    绑定生效的那一刻起，宿主机就不再拥有这块设备：直通显卡后宿主机本地画面消失，直通网卡后该口的宿主机网络消失，直通 NVMe 后宿主机看不到这块盘。操作前确认宿主机不依赖它，且你有不经过该设备的登录与显示通道。

### 3.5 用 libvirt XML 把设备直通给虚拟机

先备份虚拟机定义，再编辑：

```bash
virsh dumpxml ubuntu-guest-01 | sudo tee /root/ubuntu-guest-01-before-passthrough.xml
virsh edit ubuntu-guest-01
```

在 `devices` 段内加入 hostdev 片段。显卡显示功能示例（地址与 ID 替换为真实值）：

```xml
<hostdev mode='subsystem' type='pci' managed='yes'>
  <source>
    <address domain='0x0000' bus='0x03' slot='0x00' function='0x0'/>
  </source>
</hostdev>
<hostdev mode='subsystem' type='pci' managed='yes'>
  <source>
    <address domain='0x0000' bus='0x03' slot='0x00' function='0x1'/>
  </source>
</hostdev>
```

第二段是同卡音频功能，必须与显示功能一起给出。网卡与 NVMe 直通写法相同，只改 source 地址；NVMe 在客体机中以原生控制器出现，用自带驱动即可。`managed='yes'` 表示 libvirt 在启停时自动交接设备。某些显卡关机后无法正确复位会导致第二次启动失败，先完整关闭宿主机再排查。

保存后启动并验证：

```bash
virsh start ubuntu-guest-01
virsh dominfo ubuntu-guest-01
```

再进入客体机内用 `lspci` 确认设备出现，显卡场景在客体机内按第一章方法装驱动并运行 `nvidia-smi`，网卡场景在客体机内确认接口名与链路状态，NVMe 场景用 `lsblk` 确认新盘出现。

### 3.6 SR-IOV：创建 VF 并直通

SR-IOV 分两层：物理功能 PF 是网卡本体，由宿主机驱动管理；虚拟功能 VF 是从 PF 切出的轻量实例，有独立 PCI 地址，可直通给不同虚拟机，数据走硬件转发，不经过宿主机软件交换。先确认最大 VF 数：

```bash
ip -br link
cat /sys/class/net/enp3s0f0/device/sriov_totalvfs
cat /sys/class/net/enp3s0f0/device/sriov_numvfs
```

网卡名替换为你的真实 PF 接口名。临时创建 4 个 VF：

```bash
echo 4 | sudo tee /sys/class/net/enp3s0f0/device/sriov_numvfs
ip link show enp3s0f0
lspci | grep -i ethernet
```

再为每个 VF 设置属性后直通，例如给 0 号 VF 设 MAC 与 VLAN：

```bash
sudo ip link set dev enp3s0f0 vf 0 mac 02:00:00:00:00:01
sudo ip link set dev enp3s0f0 vf 0 vlan 100
sudo ip link set dev enp3s0f0 vf 0 spoofchk on
sudo ip link set dev enp3s0f0 vf 0 trust off
```

参数讲解：`mac` 固定 VF 的硬件地址，避免每次重启随机变化；`vlan` 把该 VF 划入指定 VLAN；`spoofchk on` 开启防欺骗检查，VF 不能伪造源地址；`trust off` 不信任 VF 自行修改某些网络属性，生产环境保持关闭信任。VF 的直通方式与普通 PCIe 设备相同：找到 VF 的 PCI 地址后，在虚拟机定义中加入同格式的 hostdev 片段，或用托管设备方式引用。

持久化 VF 数量常用 systemd 开机服务写入 sriov_numvfs，另一种是驱动模块参数，写法随驱动不同。示例用 systemd 服务，写入前先备份将改动的配置：

```ini
[Unit]
Description=Create SR-IOV VFs for enp3s0f0
After=network-pre.target
Before=network.target libvirtd.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'echo 4 > /sys/class/net/enp3s0f0/device/sriov_numvfs'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

把该内容保存为 `/etc/systemd/system/sriov-vfs.service` 后执行启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sriov-vfs.service
cat /sys/class/net/enp3s0f0/device/sriov_numvfs
```

VF 必须在虚拟机引用前创建完成，服务排序要早于 libvirtd；虚拟机设自启时先确认 VF 已就绪，否则会因找不到设备启动失败。

## 四、效果验证与测试

宿主机侧验证清单：

```bash
cat /proc/cmdline
dmesg | grep -i -E "iommu|AMD-Vi|DMAR"
lspci -nnk -s 03:00
virsh nodedev-list --tree
cat /sys/class/net/enp3s0f0/device/sriov_numvfs
```

期望：内核参数包含 iommu 开关；目标设备驱动为 vfio-pci 或在虚拟机运行时被客体机占用；numvfs 与规划一致。客体机内 `lspci` 应看到直通设备，显卡跑 `nvidia-smi`、网卡做连通测试、NVMe 用 `lsblk` 加读写冒烟均应正常。两台各持一个 VF 的虚拟机互打流量应明显优于默认虚拟网卡且宿主机 CPU 更低，这是 SR-IOV 的价值证据。

## 五、常见错误与排坑指南

### 场景一：IOMMU 未开启或分组为空

报错原文片段：

```text
vfio-pci: probe failed
No IOMMU groups found
DMAR: IOMMU disabled
```

`virsh start` 时还常见提示设备未分配到任何 IOMMU 组的错误。原因按顺序排查：BIOS 中 IOMMU 未开；GRUB 参数写错或 `update-grub` 未执行；CPU 本身不支持 VT-d 或 AMD-Vi。修复命令：

```bash
cat /proc/cmdline
sudo grep GRUB_CMDLINE_LINUX_DEFAULT /etc/default/grub
sudo update-grub
sudo reboot
dmesg | grep -i iommu
```

参数已在 cmdline 中但日志仍显示 disabled 时，问题在 BIOS 与硬件层面，先真正打开 IOMMU 再继续。

### 场景二：虚拟机启动报设备正忙或绑定失败

报错原文片段：

```text
error: internal error: Process exited prior to exec: vfio: Unable to power on device, stuck in D3
error: Failed to bind PCI device: Device or resource busy
```

原因是设备仍被原生驱动占用、组内功能漏写 ids，或复位异常卡在低功耗状态。修复：确认组内每个功能都绑定 vfio-pci，完全关闭虚拟机，必要时重启宿主机：

```bash
virsh shutdown ubuntu-guest-01
lspci -nnk -s 03:00
cat /etc/modprobe.d/vfio.conf
sudo update-initramfs -u
```

核对完再重启宿主机与虚拟机。消费级显卡复位问题较常见，选型时先查证该型号的直通口碑。

### 场景三：创建 VF 失败

报错原文片段：

```text
RTNETLINK answers: Operation not supported
bash: echo: write error: Invalid argument
```

原因是网卡或驱动不支持 SR-IOV、固件中 SR-IOV 开关未打开，或请求的 VF 数超过 `sriov_totalvfs` 上限。修复：先读 totalvfs 确认上限，把请求数降到上限以内；进网卡固件或 BIOS 确认 SR-IOV 选项打开；仍失败则该型号在此驱动版本下不可用，改用普通直通整卡或虚拟网卡方案，不要循环重试写入。

```bash
cat /sys/class/net/enp3s0f0/device/sriov_totalvfs
echo 0 | sudo tee /sys/class/net/enp3s0f0/device/sriov_numvfs
echo 2 | sudo tee /sys/class/net/enp3s0f0/device/sriov_numvfs
```

改 VF 数量前必须先写 0 清零，且引用这些 VF 的虚拟机必须关机。

## 六、生产环境最佳实践与安全建议

### 风险清单与回滚步骤（必须执行）

回滚靠事先留好的三份备份：GRUB、modprobe、虚拟机 XML，缺一不可。宿主机无法启动、设备丢失或虚拟机反复失败时按此执行：

第一步，若宿主机还能登录，恢复 GRUB 并重建启动配置：

```bash
sudo cp /etc/default/grub.bak-日期-before-iommu /etc/default/grub
sudo update-grub
```

文件名中的日期替换为你的实际备份日期。第二步，解除 VFIO 绑定：删除或改名 `/etc/modprobe.d/vfio.conf`，把 `/etc/initramfs-tools/modules` 恢复为备份版本，然后重建 initramfs：

```bash
sudo mv /etc/modprobe.d/vfio.conf /root/vfio.conf.disabled
sudo cp /etc/initramfs-tools/modules.bak-日期 /etc/initramfs-tools/modules
sudo update-initramfs -u
sudo reboot
```

第三步，恢复虚拟机定义并确认设备回到宿主机：

```bash
virsh define /root/ubuntu-guest-01-before-passthrough.xml
lspci -nnk -s 03:00
```

期望设备驱动重新显示为原生驱动。若宿主机无法启动，从 GRUB 编辑启动项临时删除 iommu 参数进入系统再执行上面三步。SR-IOV 回滚先关机引用 VF 的虚拟机，再把 numvfs 写回 0 并停用 VF 服务。

### 最佳实践

直通清单与保留清单成对维护，新设备上线先更新清单再动手；分组记录随机器归档，换插槽或加新卡后重新生成。直通虚拟机在文档中写明绑定的宿主机，避免调度误判；显卡直通的客体机驱动与第一章验证基线保持一致。

安全上 IOMMU 本身就是安全边界，不要用削弱隔离的参数换表面可用；VF 防欺骗保持开启、信任保持关闭；直通 NVMe 等于把整盘交给虚拟机，归属变更时按整盘标准擦除。监控关注内核日志中的 IOMMU 故障与 DMA 报错，出现后先存日志再安排维护窗口处理。
