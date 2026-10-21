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

## 六、生产环境最佳实践与安全建议

驱动变更走变更流程：升级前记录旧版本与 `nvidia-smi` 输出，升级后跑固定冒烟集，包括宿主机检查、容器检查与一次真实短推理，全部通过才算完成。验证通过的驱动与 CUDA 组合写入配置基线，新机器按基线装配。

权限上不要对无关用户放开 GPU 设备节点；容器场景优先用 `--gpus` 按需分配指定卡，不要默认把全部卡给全部容器。多任务共用一台机器时按卡划分，避免单任务占满显存拖垮其他服务；需要细粒度切分时再评估 MIG，前提是显卡型号支持。

监控上把显存、利用率、温度与功耗纳入常规监控，温度持续接近上限先查风道与积灰。安全上 CUDA 与驱动只从发行版仓库或 NVIDIA 官方源获取，第三方源密钥指纹接入时核对并记录。每次升级前导出包清单并保留上一个可用内核，新版本出问题时从 GRUB 选择旧内核启动，把故障控制在一次重启之内。
