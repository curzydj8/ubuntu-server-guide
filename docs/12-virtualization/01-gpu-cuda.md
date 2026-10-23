---
description: "本地大模型推理、绘图、视频转码与科学计算都需要把计算卸载到 GPU。NVIDIA 的 CUDA 是 PyTorch、TensorFlow、vLLM 等框架的共同底座。"
---

# GPU 与 CUDA：NVIDIA 驱动与容器调用

## 一、概述与使用场景

本地大模型推理、绘图、视频转码与科学计算都需要把计算卸载到 GPU。NVIDIA 的 CUDA 是 PyTorch、TensorFlow、vLLM 等框架的共同底座。没有正确安装驱动时，系统能看到 PCIe 设备，却无法分配显存、无法运行任何 CUDA 程序。

配错的典型瓶颈有三类：驱动缺失或过旧导致框架找不到库；驱动与工具链版本错位，容器内运行时要求更高驱动；容器运行时未打通，宿主机正常而容器内看不到设备，导致团队误判为镜像问题反复重构。

本章目标是建立一条可复现的链路：驱动稳定、工具链按需、Docker 通过 Container Toolkit 或 CDI 注入 GPU。完成后同一条 `nvidia-smi` 应在宿主机与容器内输出一致信息。

## 二、环境准备与前置条件

系统要求 Ubuntu 22.04 LTS 或 24.04 LTS，x86_64 架构，使用发行版默认或 HWE 内核，以便 DKMS 自动重建驱动模块。

硬件要求如下：

| 项目 | 最低要求 | 说明 |
| --- | --- | --- |
| 显卡 | NVIDIA 独立显卡，计算能力满足所用框架要求 | 以框架文档的最低计算能力为准，老卡需先确认 |
| 显存 | 推理至少 8 GiB，训练按模型规模规划 | 显存不足无法靠虚拟内存弥补 |
| 主板插槽 | PCIe x16 物理插槽，通道数满足显卡要求 | 注意多卡时通道拆分对带宽的影响 |
| 电源 | 额定功率覆盖整机满载并留两成余量 | 检查显卡辅助供电接口数量 |
| 系统盘空间 | 至少预留 30 GiB | 驱动、工具链与容器镜像体积较大 |

权限要求：账号 `ubuntu` 需有 sudo 权限，软件源可用。若启用 Secure Boot，先确认可完成 MOK 登记或改用已签名驱动包，见第五节。

!!! warning "先确认显卡被硬件识别"
    安装驱动前先执行 `lspci | grep -i nvidia`，期望能看到显卡型号行。若完全没有输出，问题在插槽、供电或 BIOS 设置层面，装驱动无法解决，必须先处理硬件识别再继续。

!!! note "22.04 与 24.04 的差异"
    两个版本推荐的驱动分支名称可能不同，包名后缀与元包组织方式也有调整。本章不写死具体驱动版本号，统一以 `ubuntu-drivers devices` 在当前系统上的推荐输出为准，这是避免版本过期最可靠的方法。

### 兼容性矩阵：四种使用方式的能力边界

同一块显卡，在不同使用方式下能拿到的能力并不相同。下表按「能不能真正跑 CUDA 计算」这一条线分级，结论以诚实为准：标为受限的，就不要按完整支持去规划业务。

| 使用方式 | 支持结论 | 必须满足的条件 | 验证方式 |
| --- | --- | --- | --- |
| Ubuntu 裸机 + NVIDIA 驱动 + CUDA | 完整支持 | 显卡型号在所选驱动分支的支持列表内；驱动版本满足框架的最低要求；内核与 DKMS 模块匹配 | 宿主机执行 `nvidia-smi` 能显示型号与显存，再跑一次实际 CUDA 计算（见第四节验收标准） |
| Docker 使用 NVIDIA GPU | 支持 | 宿主机驱动先正常工作；已安装 NVIDIA Container Toolkit，且其版本与驱动、Docker 版本对应；启动容器时显式传入 `--gpus` 或已配置 CDI | 容器内执行 `nvidia-smi`，显卡列表与宿主机一致（见 4.2 节） |
| VMware Workstation 的 GPU 能力 | 仅图形加速，不能等同于完整 CUDA 直通 | 只能依赖其提供的虚拟显卡与 3D 加速能力；虚拟显卡不是物理显卡直通，CUDA 计算能力不做保证 | 在客户机内尝试识别物理显卡型号与运行 CUDA 程序：识别不到物理型号、或框架报告无 CUDA 设备，即说明不具备完整 CUDA 能力，不要继续按直通方案排错 |
| KVM/QEMU PCIe 直通 | 支持，但条件苛刻 | 见下方逐项清单，缺一项即可能失败 | 客户机内 `lspci` 能看到物理显卡，装好驱动后 `nvidia-smi` 正常，且能跑实际 CUDA 计算 |

KVM/QEMU 直通的必备条件逐项清单（规划阶段逐条核对，不要等装完再补）：

- **CPU 与主板支持 IOMMU**：Intel 平台需 VT-d，AMD 平台需 AMD-Vi，CPU 与芯片组两者都要支持，只看 CPU 参数不够。
- **BIOS/UEFI 已开启虚拟化与 IOMMU**：VT-x/AMD-V 与 VT-d/AMD-Vi 开关都打开，改完保存并重启后在宿主机复核。
- **设备 IOMMU 分组合理**：待直通的显卡须与其它不直通设备分在不同分组；同组设备只能整组直通。分组不理想时先调整插槽位置，再考虑其它手段，并记录取舍。
- **显卡本身支持直通与重置**：部分显卡在客户机关机或重启后无法正确复位（重置问题），宿主机可能需要重启才能再次分配，选型与采购前先查该型号的直通口碑与已知问题。
- **宿主机预留隔离手段**：显卡在宿主机侧需绑定到 vfio 驱动、不能被宿主机驱动抢占；多卡时明确哪张留给宿主机显示、哪张直通，避免直通后宿主机无显示输出。

!!! warning "能力边界不要模糊"
    选型沟通时把上表结论原样传递：裸机与 Docker 是本章验证过的路线；VMware Workstation 只有图形加速，不要向业务方承诺在其中跑 CUDA 训练或推理；KVM 直通能跑 CUDA，但它是逐项条件都满足后的结果，不是默认能力。

## 三、手把手操作步骤

### 3.1 查看推荐驱动

第一步永远是让系统告诉你它推荐什么，而不是凭经验猜版本号。

```bash
sudo apt update
sudo apt install -y ubuntu-drivers-common pciutils
ubuntu-drivers devices
```

命令逐项讲解：

| 命令 | 作用 |
| --- | --- |
| `sudo apt update` | 刷新软件包索引，确保拿到当前仓库的驱动列表 |
| `ubuntu-drivers-common` | 提供 `ubuntu-drivers` 命令的软件包 |
| `pciutils` | 提供 `lspci`，用于确认显卡硬件识别 |
| `ubuntu-drivers devices` | 列出本机每块显卡可用的驱动及推荐标记 |

期望在输出中看到带有 `recommended` 标记的一行，那是当前发行版为这块显卡验证过的首选。输出还会列出开源的 Nouveau 驱动，服务器场景不要选它，它的 CUDA 支持不完整。

### 3.2 理解驱动分支如何选

NVIDIA 驱动在 Ubuntu 仓库中按分支组织，常见分支含义如下：

| 分支类型 | 含义 | 适用判断 |
| --- | --- | --- |
| production 分支 | 经过长期验证的稳定分支 | 生产服务器优先，追求少变更 |
| server 分支 | 面向数据中心与服务器显卡的分支 | 使用服务器级显卡时优先评估 |
| 普通桌面分支 | 跟进速度较快 | 开发机需要新特性时考虑 |
| 带 `-open` 后缀的包 | 使用开源内核模块的驱动包 | 新一代显卡可评估，老卡与 Secure Boot 环境需谨慎验证 |

判断方法只有三条：一看 `ubuntu-drivers devices` 的 `recommended` 标记，二看显卡是服务器卡还是桌面卡，三看业务框架对最低驱动版本的要求。当三者冲突时，以框架最低要求为下限，在满足下限的分支中选带推荐标记的那个。不要为了追新跨多个分支升级，驱动升级属于变更操作，应安排在维护窗口。

### 3.3 自动安装推荐驱动

最稳妥的安装方式是让工具安装推荐版本：

```bash
sudo ubuntu-drivers autoinstall
sudo reboot
```

`autoinstall` 会安装上一节中带推荐标记的驱动及其 DKMS 模块、32 位兼容库等依赖。安装完成后必须重启，让新内核模块在启动阶段加载，热加载不可靠。

### 3.4 手动指定版本安装

当推荐版本不满足框架要求，或团队需要统一所有机器的驱动分支时，使用手动方式。以下命令中的分支包名是占位写法，实际执行时把尖括号内容替换为 `ubuntu-drivers devices` 输出中真实存在的包名，不要照抄占位符直接执行。

改动软件包状态前先记录当前状态，便于回退对照：

```bash
dpkg -l | grep -i nvidia | sudo tee /root/nvidia-packages-before.txt
apt-mark showmanual | sudo tee /root/apt-manual-before.txt
```

然后安装指定分支，命令模板如下：

```bash
sudo apt install -y nvidia-driver-<分支号>
sudo apt install -y nvidia-utils-<分支号>
sudo reboot
```

参数讲解：`nvidia-driver-<分支号>` 是驱动元包，会拉入内核模块、用户态库与设置工具；`nvidia-utils-<分支号>` 提供 `nvidia-smi` 等命令行工具，通常会被元包自动带入，显式写出是为了在最小化安装时不遗漏。安装过程中留意 DKMS 构建日志，出现 `Build complete` 才算模块构建成功，报错处理见第五节。

!!! tip "锁定版本防止意外升级"
    生产机驱动验证通过后，可以执行 `sudo apt-mark hold nvidia-driver-<分支号>` 锁定分支，避免无人值守升级跨分支变更驱动。解锁使用 `sudo apt-mark unhold` 并写明包名。

### 3.5 路线一：用发行版仓库安装 CUDA 工具链

CUDA 有两种安装路线。路线一使用 Ubuntu 发行版仓库，优点是与系统驱动版本协同验证、升级跟随系统、安全更新路径清晰；缺点是工具链版本通常落后于 NVIDIA 最新发布，需要最新 CUDA 特性的框架可能不满足。

```bash
sudo apt install -y nvidia-cuda-toolkit
nvcc --version
```

`nvidia-cuda-toolkit` 提供编译器 `nvcc`、头文件与基础库，适合编译本地 CUDA 程序与满足多数框架对工具链的存在性要求。许多只做推理的场景其实不需要完整工具链，框架镜像已自带运行时，此时可以跳过本节，只装驱动与容器工具包。

### 3.6 路线二：用 NVIDIA 官方源安装 CUDA 工具链

路线二使用 NVIDIA 官方源，优点是能拿到指定大版本的工具链，与官方镜像对齐直接；缺点是多一个第三方源需要维护。

两条路线对比如下：

| 对比项 | 发行版仓库路线 | NVIDIA 官方源路线 |
| --- | --- | --- |
| 工具链新旧 | 相对保守 | 可选指定大版本，较新 |
| 与驱动协同 | 发行版统一验证 | 需自己核对驱动最低要求 |
| 升级方式 | 跟随系统 apt 升级 | 单独维护官方源 |
| 适用场景 | 编译需求一般、求稳 | 框架明确要求特定 CUDA 大版本 |

官方源的接入步骤以 NVIDIA 官方文档当前提供的发行版专用安装包为准，通用流程是下载并安装仓库配置包、刷新索引、再安装形如 `cuda-toolkit-<主版本-次版本>` 的包。此处版本号用占位表述，执行时以框架要求与官方当前列表为准。接入第三方源前先备份源配置：

```bash
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak-$(date +%F)
sudo cp -a /etc/apt/sources.list.d /root/sources.list.d.bak-$(date +%F)
ls /etc/apt/sources.list.d/
```

!!! danger "两条路线不要混装"
    同一台机器只选一条路线。发行版工具链与官方源工具链混装会产生同名库多版本共存，链接与运行时加载顺序混乱，排错成本极高。切换路线时先完整卸载原路线包，再安装新路线包。

### 3.7 安装 NVIDIA Container Toolkit

Docker 本身不认识 GPU，需要 NVIDIA Container Toolkit 在容器创建时注入驱动库与设备节点。先确保 Docker 已可正常运行，再添加 NVIDIA 容器仓库并安装工具包，仓库接入以官方文档当前给出的密钥与源配置为准：

```bash
sudo apt update
sudo apt install -y nvidia-container-toolkit
nvidia-ctk --version
```

### 3.8 配置 Docker 使用 GPU

当前主流有两种配置方式。方式一是 CDI（Container Device Interface），由工具包生成设备规范文件，Docker 直接按规范注入设备，不需要额外的默认运行时，结构更清晰，是新安装的推荐方式：

```bash
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak-$(date +%F) 2>/dev/null || echo "daemon.json 尚不存在，跳过备份"
sudo systemctl restart docker
nvidia-ctk cdi list
```

方式二是传统的 nvidia runtime，由工具包的配置命令改写 daemon 配置：

```bash
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak-$(date +%F) 2>/dev/null || echo "daemon.json 尚不存在，跳过备份"
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
sudo cat /etc/docker/daemon.json
```

两种方式选一种即可，不要叠加。改写后检查 `daemon.json` 内容应出现与 nvidia 运行时或 CDI 相关的配置段；若文件原本已有镜像加速、日志等自定义配置，确认它们被保留而不是被覆盖丢失。

!!! warning "重启 Docker 会中断现有容器"
    `systemctl restart docker` 会影响正在运行的容器。生产机应在维护窗口执行，或提前确认容器的重启策略为 always 或 unless-stopped，重启后逐个核查业务容器状态。

## 四、效果验证与测试

### 4.1 宿主机验证与输出判读

重启后执行：

```bash
nvidia-smi
```

期望输出示例（数值随硬件不同，仅看结构）：

```text
+---------------------------------------------------------------------------------------+
| NVIDIA-SMI 驱动版本              Driver Version: 见表头   CUDA Version: 见表头       |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf  Pwr:Usage/Cap |         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA 示例显卡        Off | 00000000:01:00.0 Off |          0MiB / 总显存   |
+-------------------------------+----------------------+----------------------+
```

判读要点：表头左侧是驱动版本，右侧 `CUDA Version` 表示该驱动最高支持的 CUDA 版本，框架要求的 CUDA 版本不得高于它；表格中每块显卡占一行，显存占用接近零说明没有残留进程；温度与功耗列有读数说明传感器与供电正常。再执行 `lsmod | grep nvidia` 应能看到 nvidia、nvidia_uvm 等模块，`nvcc --version` 在安装工具链后应输出版本行。

### 4.2 容器内验证

使用官方 CUDA 基础镜像做最小验证，镜像标签以官方当前提供的与驱动兼容的标签为准：

```bash
docker run --rm --gpus all nvidia/cuda:<版本标签>-base-ubuntu24.04 nvidia-smi
```

参数讲解：`--rm` 表示容器退出后自动删除，不留垃圾；`--gpus all` 表示把全部 GPU 注入容器，只给一张卡时可写 `--gpus '"device=0"'`；命令末尾的 `nvidia-smi` 是在容器内执行的命令。期望输出的显卡列表与宿主机一致，说明驱动注入链路完整。再进一步可用带运行时的镜像运行框架自检，例如在 Python 框架镜像中执行打印 GPU 可用性的命令，结果应为真且能列出设备名。

压测时可用 `watch -n 2 nvidia-smi` 持续观察，利用率长期为零而任务在跑，说明任务实际跑在 CPU 上，应检查框架的设备设置。

### 4.3 验收标准

!!! danger "验收标准：安装命令成功 ≠ GPU 链路正常"
    `apt install` 返回成功、DKMS 显示 installed、包列表里能看到驱动，都只证明「装过」，不证明 GPU 链路可用。验收必须跑实际计算，且宿主机与容器两处结果都要留存，缺一处不算验收通过。

验收清单逐项执行，全部通过才算交付：

1. **宿主机识别与状态**：`nvidia-smi` 正常输出，显卡型号、显存总量与实物一致，显存占用接近零（无残留进程），温度与功耗有读数；输出保存留档，例如 `nvidia-smi | tee ~/nvidia-smi-host-$(date +%F-%H%M).txt`。
2. **容器内实际计算**：用 NVIDIA 官方 CUDA 镜像运行验证命令，镜像 tag 写「以官方当前 tag 为准」，不写死易过期的版本号。先在容器内跑 `nvidia-smi` 与宿主机对照，再跑镜像或官方示例自带的计算型自检（如 `deviceQuery`，以当前官方镜像实际提供的示例为准），期望看到设备被正确枚举、检查项通过的输出，而不是只启动了一个空容器。
3. **双处结果留存**：宿主机与容器内的验证输出分别保存到同一验收记录中，注明日期、显卡型号、驱动版本与执行人；后续驱动升级后用同一清单复验，新旧结果对照归档。

只做到「容器能启动」或「宿主机 `nvidia-smi` 能打开」就宣布完成，是最常见的假验收：前者没证明设备注入，后者没证明容器链路。按上表跑完实际计算，结论才成立。

## 五、常见错误与排坑指南

### 场景一：DKMS 构建失败，驱动与内核不匹配

报错原文片段：

```text
ERROR: Cannot create report: [Errno 17] File exists
DKMS: install completed with errors
Failed to build module for kernel
```

常见日志还包括 `Your kernel headers for kernel cannot be found`。原因是系统升级了内核，但对应内核头文件未安装，或驱动分支过旧不支持新内核，DKMS 无法编译模块。修复命令：

```bash
sudo apt install -y linux-headers-$(uname -r) build-essential dkms
sudo dkms autoinstall
sudo apt install --reinstall -y nvidia-driver-<分支号>
sudo reboot
nvidia-smi
```

修复后先确认 `dkms status` 中该驱动对当前内核状态为 installed，再重启验证。长期对策是内核与驱动在同一维护窗口升级，升级内核后先检查 DKMS 结果再重启。

### 场景二：Secure Boot 导致模块签名失败

报错原文片段：

```text
nvidia: module verification failed: signature and/or required key missing - tainting kernel
modprobe: ERROR: could not insert 'nvidia': Key was rejected by service
```

原因是 Secure Boot 只允许加载已签名内核模块，而 DKMS 本地构建的 NVIDIA 模块签名未被固件信任。处理方法是完成 MOK（Machine Owner Key）登记：安装驱动时若弹出设置 MOK 密码的界面，设置一个临时密码并牢记；重启时在蓝色的 MOK Manager 界面依次选择 Enroll MOK、Continue、Yes，并输入刚才的密码完成登记，之后正常启动再验证：

```bash
mokutil --sb-state
sudo modprobe nvidia
nvidia-smi
```

`mokutil --sb-state` 用于确认 Secure Boot 状态。若组织规范不允许登记自签密钥，替代方案是改用发行版已签名的驱动包，或在合规评估后在 BIOS 中关闭 Secure Boot，三种方式选一种并记录在运维文档中，不要在多台机器上混用不同处理法。

### 场景三：容器内看不到 GPU

报错原文片段：

```text
docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]]
```

或容器内执行 `nvidia-smi` 报 `No devices were found`。原因是 Container Toolkit 未安装、CDI 规范未生成或 Docker 未重启加载配置。修复命令：

```bash
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
sudo systemctl restart docker
docker run --rm --gpus all nvidia/cuda:<版本标签>-base-ubuntu24.04 nvidia-smi
```

若宿主机 `nvidia-smi` 本身就失败，不要在容器层排错，先回到驱动层解决，容器注入依赖宿主机驱动先正常工作这一前提。

### 分层排错：先定位在哪一层，再动手修

前面三个场景是具体报错，本节给一条分层路径：GPU 链路自下而上分为硬件识别、内核模块、驱动可用、容器注入、版本对应五层，排错时从最底层逐层确认，下层未通过不要跳到上层反复重装。

**① 显卡不被识别**

- 现象：`lspci | grep -i nvidia` 无输出，或驱动模块根本没有加载。
- 检查：`lspci | grep -i nvidia` 看硬件枚举；`lsmod | grep nvidia` 看模块是否加载；`dkms status` 看模块对当前内核的构建状态。
- 修复：`lspci` 无输出时先断电检查插槽、辅助供电与 BIOS 中的 PCIe 设置，这是硬件层问题，装驱动无效；能看到设备但模块未加载时，先装齐内核头文件并重新走 DKMS 构建（见场景一），再 `sudo modprobe nvidia` 手动加载验证。

**② Secure Boot 与模块签名**

- 现象：模块构建成功却加载失败，日志出现签名或密钥被拒相关字样。
- 检查：`mokutil --sb-state` 确认 Secure Boot 是否开启；结合内核日志确认拒绝原因是否为签名问题。
- 修复：三条路线选一条并记录：完成驱动签名对应的 MOK 注册（见场景二）、改用发行版已签名驱动包、或在合规评估后于固件设置中关闭 Secure Boot。关闭 Secure Boot 是降低固件层防护的取舍，生产机要走变更记录，不要图省事默认关闭。

**③ 驱动装好但 nvidia-smi 报错**

- 现象：`nvidia-smi` 报无法与驱动通信、驱动版本不匹配类错误，或重启后失效。
- 检查：`uname -r` 与 `dkms status` 对照，确认正在运行的内核下模块状态为 installed；`lsmod | grep -E 'nvidia|nouveau'` 看开源 Nouveau 驱动是否同时在场冲突。
- 修复：内核与模块不匹配时按场景一补头文件、重建模块再重启；Nouveau 冲突时按发行版驱动包的常规处理将其加入黑名单并重建 initramfs 后重启确认（具体包与配置以当前发行版文档为准）；升级内核后复发同一问题，说明内核与驱动未在同一维护窗口管理，按第六节的基线办法收口。

**④ 容器内 GPU 不可见**

- 现象：宿主机 `nvidia-smi` 正常，容器内报无设备或守护进程拒绝创建带 GPU 能力的容器（见场景三）。
- 检查：`docker info` 查看已注册的运行时列表，确认与 nvidia 运行时或 CDI 相关配置已被 Docker 加载；确认启动参数带了 `--gpus`；核对 Container Toolkit 版本与宿主机驱动的对应关系，Toolkit 过旧同样注入失败。
- 修复：按 3.7、3.8 节只选 CDI 或传统运行时一种方式重新配置，重启 Docker 后用官方镜像复验；宿主机层本身不正常时先回 ① 至 ③ 层，容器层不要单独折腾。

**⑤ CUDA 版本与驱动版本对应关系**

- 现象：框架或程序报 CUDA 版本不受当前驱动支持、驱动版本过低类错误。
- 判读方法：先分清三个数——`nvidia-smi` 表头右侧的 `CUDA Version` 是**当前驱动最高支持**的 CUDA 版本；`nvcc --version` 是**本机工具链**的版本；框架文档写的是它**要求**的 CUDA 与最低驱动。要求高于驱动上限时，升工具链没有用，必须升驱动；工具链高于框架要求时，按框架要求降工具链或换用自带运行时的框架镜像。
- 对应关系以 **NVIDIA 官方 CUDA Toolkit Release Notes 中的兼容表为准**：本节不复制具体版本号对应表，因为对应关系随版本发布持续变化，抄下来的表很快过期且容易抄错。查法是打开所用工具链版本对应的 Release Notes，在兼容性章节核对最低驱动要求，再与本机 `nvidia-smi` 表头的驱动版本对照，两者对上才动手安装或升级。

### 回滚与恢复：驱动或 CUDA 变更后退回上一状态

3.4 节记录的两份清单（`/root/nvidia-packages-before.txt`、`/root/apt-manual-before.txt`）是回退的对照基线：动手回退前先打开它确认变更前的分支号，下面命令中的 `OLD_BRANCH` 就填它。回退分三种情形，按你遇到的挑一种，不要混着来。

**情形一：新驱动装上了、能进系统，但工作不正常——回退到原分支。** 先解除锁定（如变更前执行过 hold），再把原分支装回来，重启后对照基线验证：

```bash
OLD_BRANCH='570'
sudo apt-mark unhold "nvidia-driver-${OLD_BRANCH}"
sudo apt install -y "nvidia-driver-${OLD_BRANCH}" "nvidia-utils-${OLD_BRANCH}"
sudo apt autoremove -y
sudo reboot
nvidia-smi
```

`OLD_BRANCH` 替换为基线清单里记录的实际分支号。期望 `nvidia-smi` 表头的驱动版本与清单记录一致，再按 4.3 节验收清单复验一遍容器链路，才算退稳。

**情形二：新驱动导致进不了图形界面或开机反复重启。** 不要在这个状态里反复重装。开机在 GRUB 菜单的 Advanced options 里选上一个可用内核启动（保留旧内核就是为这一步）；旧内核同样起不来时，用恢复模式（recovery mode）的 root shell，或在登录界面按 `Ctrl+Alt+F3` 切到 TTY 登录；没有本地屏幕的云服务器走厂商控制台的 VNC 或串口终端。进入可用命令行后，整体卸载专有驱动、先恢复到开源 Nouveau 能进系统的状态：

```bash
sudo apt purge -y 'nvidia-*' 'libnvidia-*'
sudo apt autoremove -y
sudo update-initramfs -u
sudo reboot
lsmod | grep nouveau
```

期望重启后能正常进入桌面或登录界面、`lsmod` 里能看到 `nouveau`。此时 GPU 计算不可用是预期内的中间状态——先保证系统可用，再回第三节用 `ubuntu-drivers devices` 重新选分支安装，不要在救援环境里顺手把新驱动又装回去。

**情形三：只回退 CUDA 工具链或容器配置，驱动不动。** 工具链按当初的路线退：发行版路线执行 `sudo apt purge -y nvidia-cuda-toolkit`；官方源路线先把 3.6 节备份的源配置还原、再卸掉对应工具链包：

```bash
CUDA_PKG='cuda-toolkit-12-6'
sudo apt purge -y "${CUDA_PKG}"
sudo cp -a /root/sources.list.d.bak-2026-01-01/. /etc/apt/sources.list.d/
sudo apt update
```

`CUDA_PKG` 换成你实际装的工具链包名，源备份目录名按 3.6 节备份当天的日期替换。Docker 侧的 GPU 配置回退用 3.8 节的 daemon.json 备份还原；当时走 CDI 方式的，再删掉生成的规范文件：

```bash
sudo cp /etc/docker/daemon.json.bak-2026-01-01 /etc/docker/daemon.json
sudo rm -f /etc/cdi/nvidia.yaml
sudo systemctl restart docker
```

备份文件名按 3.8 节实际生成的那份替换（先 `ls /etc/docker/daemon.json.bak-*` 确认）。三种情形回退完成后都回 4.1、4.2 节复验，并把失败原因与回退后的版本组合记进基线文档，下次变更窗口先看这份记录。

## 六、生产环境最佳实践与安全建议

驱动变更走变更流程：升级前记录旧版本与 `nvidia-smi` 输出，升级后跑固定冒烟集，包括宿主机检查、容器检查与一次真实短推理，全部通过才算完成。验证通过的驱动与 CUDA 组合写入配置基线，新机器按基线装配。

权限上不要对无关用户放开 GPU 设备节点；容器场景优先用 `--gpus` 按需分配指定卡，不要默认把全部卡给全部容器。多任务共用一台机器时按卡划分，避免单任务占满显存拖垮其他服务；需要细粒度切分时再评估 MIG，前提是显卡型号支持。

监控上把显存、利用率、温度与功耗纳入常规监控，温度持续接近上限先查风道与积灰。安全上 CUDA 与驱动只从发行版仓库或 NVIDIA 官方源获取，第三方源密钥指纹接入时核对并记录。每次升级前导出包清单并保留上一个可用内核，新版本出问题时从 GRUB 选择旧内核启动，把故障控制在一次重启之内。
