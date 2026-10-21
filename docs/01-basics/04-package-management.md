---
description: "服务器装好后，每一次安装软件、打补丁和升级组件都要经过包管理。本章讲清 Ubuntu 的四套工具如何分工：apt 负责从软件源在线安装和升级，dpkg 负责本地软件包文件的安装与查询，"
---

# 软件源与包管理

## 一、概述与使用场景

服务器装好后，每一次安装软件、打补丁和升级组件都要经过包管理。本章讲清 Ubuntu 的四套工具如何分工：apt 负责从软件源在线安装和升级，dpkg 负责本地软件包文件的安装与查询，snap 和 flatpak 负责自带依赖的应用分发。分工不清是新手最常见的问题来源，例如拿 dpkg 硬装一个缺依赖的本地包把依赖关系弄坏，或者在服务器上无节制地混用多种渠道装同一软件，导致版本来源不明、更新互相打架。

软件源决定更新速度和可用性。默认源服务器在境外时，国内网络环境下下载缓慢甚至超时，一次系统更新要等很久，运维人员就会倾向于推迟更新，安全补丁随之积压。把 APT 源替换为地理和网络上更近的镜像站，能把更新耗时从几十分钟压到几分钟，这是初始化阶段性价比最高的一个动作。同时要明白，加速的前提是镜像可信且同步及时，来路不明的镜像可能同步滞后，让你以为已经打上补丁其实版本还旧，甚至有供应链风险。

不规范包管理的风险很具体：随意添加个人打包源会引入未经审核的软件包和签名密钥；用 dpkg 强制安装跳过依赖检查会留下半配置状态的软件包，后续所有 apt 操作都可能被卡住；snap 自动更新不受传统维护窗口控制，服务可能在业务高峰被自动重启；flatpak 默认面向桌面应用，在无桌面服务器上盲目引入会多出一整套运行时占用磁盘。本章给出每种工具的适用边界和标准命令，让装软件这件事快、稳、可追溯。

适用场景包括：新机初始化时更换 APT 镜像并完成首次全量更新；拿到本地 deb 文件时判断用 dpkg 还是 apt 安装；评估某个软件该走官方源、snap 还是 flatpak 渠道。

## 二、环境准备与前置条件

版本基线为 Ubuntu Server 22.04 LTS 与 24.04 LTS。开始前确认网络已按上一章完成静态地址和 DNS 配置，并能正常解析域名。操作权限需要 sudo，示例账号为 opsadmin。先用下面命令确认版本、架构和当前生效的软件源概况，这是改源前的基本功。

```bash
lsb_release -a
dpkg --print-architecture
apt-cache policy
```

`apt-cache policy` 会列出当前每个软件源的地址、优先级和已缓存的包版本概况，改源前后各执行一次便于对照。本章涉及的配置文件有三个，动手前必须全部了解位置：主源文件、第三方源目录和 apt 主配置目录，具体路径在操作步骤中逐个给出。

!!! warning "22.04 与 24.04 源文件格式不同"

    22.04 的主源写在 /etc/apt/sources.list 中，采用一行一条源的传统格式。24.04 改用 deb822 格式，主源写在 /etc/apt/sources.list.d/ubuntu.sources 中，按段落组织字段。两个版本换镜像的思路相同，但改的文件和写法不同，照错版本的教程操作是改源失败的最常见原因，动手前先用 lsb_release 确认版本。

!!! note "关于组件与口袋的含义"

    Ubuntu 源按组件分 main、restricted、universe、multiverse，分别对应官方支持的自由软件、受限驱动、社区维护软件和非自由软件；按更新类型分发布版、安全更新 security、常规更新 updates 和向后移植 backports。换镜像时只换地址，不要增删原有的组件和更新类型，保持与默认配置一致的集合，才能既加速又不丢安全更新。

准备一个就近的正规镜像站地址，优先选高校或云厂商运营的公开镜像服务，并确认它提供与你的版本和架构匹配的 ubuntu 目录。示例命令中的镜像地址用镜像站根地址的写法演示，实际执行时换成你选定镜像站公布的 Ubuntu 镜像地址。

## 三、手把手操作步骤

### 步骤一：备份现有源配置

改任何配置前先备份，本章涉及两个位置，逐一复制为带日期的备份。备份做完再动手，改错时一条命令就能还原。

```bash
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak-20261021
sudo cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak-20261021
ls -l /etc/apt/sources.list.d/
```

说明：22.04 的机器上第二个文件可能不存在，cp 会报找不到文件，这属于正常现象，只备份存在的文件即可。最后一条命令列出第三方源目录，顺便看清机器上已有哪些独立源文件，换镜像只动主源，不要误改第三方软件自己的源文件。

### 步骤二：24.04 替换镜像源

24.04 编辑 deb822 格式文件。

```bash
sudo nano /etc/apt/sources.list.d/ubuntu.sources
```

文件由多个段落组成，每段的关键字段逐行讲解如下表，请只修改 URIs 一行把地址换成所选镜像站的 Ubuntu 镜像地址，其余字段原样保留。

| 字段 | 含义 | 是否修改 |
|------|------|----------|
| Types deb | 包类型为二进制包 | 不改，需要源码包时才追加 deb-src |
| URIs | 镜像站地址 | 改为所选镜像地址 |
| Suites | 更新类型，如 noble 与 noble-updates 与 noble-security | 不改，noble 是 24.04 代号 |
| Components | 组件集合 main restricted universe multiverse | 不改，保持默认集合 |
| Signed-By | 签名密钥文件路径 | 不改，改错会导致验签失败 |

修改后保存，并执行步骤四的更新与校验。

### 步骤三：22.04 替换镜像源

22.04 编辑传统格式文件。

```bash
sudo nano /etc/apt/sources.list
```

文件中每一行以 deb 开头，行结构为类型、地址、代号加更新类型、组件列表。换镜像时只替换每行中间的地址部分，代号 jammy 和 jammy-updates、jammy-security 等后缀保持不变，组件列表保持不变。改完保存后执行步骤四。

!!! tip "用 sed 批量替换地址的方法"

    源文件行数较多时可先备份，再用一条命令把旧地址域名整体换成新镜像域名，最后用编辑器打开复查一遍再更新索引。批量替换后必须人工复查，因为第三方软件的行若写在同一文件里也会被误伤，这正是先分清主源和第三方源的意义。

### 步骤四：刷新索引并完成首次更新

换源后依次执行以下命令。第一条刷新包索引，第二条列出可更新项供确认，第三条执行升级。

```bash
sudo apt update
apt list --upgradable
sudo apt upgrade -y
```

观察第一条命令的输出：每命中一个源应显示 Hit 或 Get 且没有 Err 字样，结束时不应出现签名错误和 404 错误。若报错先按第五节处理，不要带着错误的索引继续装软件。升级完成后用下面命令确认软件包的来源，任选一个常见包查看它的版本表，候选版本应来自你新换的镜像地址。

```bash
apt-cache policy curl
apt-cache madison curl
```

第一条显示已装版本、候选版本和每个版本来自哪个源，第二条按版本逐行列出来源，两者配合能确认新源已经真正生效。

### 步骤五：dpkg 的正确用法与本地包安装

dpkg 是底层工具，直接处理本地 deb 文件，不负责从源里解决依赖。查询类用法安全且常用，安装类用法要优先让位于 apt 的本地安装方式。常用命令如下。

```bash
dpkg -l
dpkg -l openssh-server
dpkg -S /usr/bin/ssh
dpkg -L openssh-server
dpkg --print-architecture
```

逐条讲解：`dpkg -l` 列出全部已装包及状态，状态两字母中第二个为 i 表示已正确安装；带包名时只查该包；`dpkg -S` 按文件路径反查属于哪个包，排障溯源时非常有用；`dpkg -L` 列出某包安装的全部文件；最后一条输出系统架构，下载本地包时按它选 amd64 或 arm64 文件。

安装本地 deb 文件的推荐命令是用 apt 并给出带路径的文件名，apt 会自动从源里补齐依赖。

```bash
sudo apt install ./example-package_1.0.0_amd64.deb
```

文件名 example-package 和版本号均为占位示例，实际使用时换成你下载的真实文件名。只有在离线环境且确认依赖已全部满足时，才直接使用 `sudo dpkg -i` 安装；若 dpkg 报告依赖缺失，不要使用强制参数硬装，改用上一条 apt 命令联网补齐，或执行 `sudo apt install --fix-broken` 修复半成品状态。

### 步骤六：snap 与 flatpak 的安装和使用

snap 由 Canonical 推动，包内自带依赖，适合需要较新版本或被官方以 snap 形式分发的软件，也常见于 24.04 的部分系统组件。服务器上安装和管理 snap 的命令如下。

```bash
snap list
sudo snap install hello-world
snap info hello-world
sudo snap refresh
sudo snap remove hello-world
```

逐条讲解：list 列出已装 snap 和版本与修订号；install 安装指定包；info 查看渠道和版本信息；refresh 手动刷新全部 snap；remove 卸载。要注意 snap 默认自动刷新，承载服务的 snap 包要提前了解它的刷新行为，并按官方文档设置刷新时间窗，避免业务时段被自动更新重启。

flatpak 主要面向桌面应用分发，服务器默认没有预装。确有需求时先安装本体并添加应用仓库，再安装应用，命令如下。改任何仓库配置前不需要备份系统文件，因为 flatpak 的仓库配置独立存放，但新增仓库同样只应添加官方或可信来源。

```bash
sudo apt install -y flatpak
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.example.App
flatpak list
flatpak update
```

最后一条示例中的应用标识 org.example.App 是占位名称，执行时换成目标应用在仓库中的真实标识。服务器场景下 flatpak 应是例外而不是默认选项，理由在步骤七的对比中说明。

### 步骤七：四种工具的对比与选型

| 工具 | 软件来源 | 依赖处理 | 更新方式 | 服务器适用建议 |
|------|----------|----------|----------|----------------|
| apt | 系统源和第三方源 | 自动解决并统一管理 | 手动或配合自动更新工具 | 默认首选，系统软件和服务都走它 |
| dpkg | 本地 deb 文件 | 不解决依赖 | 无，靠 apt 善后 | 只做查询和离线安装的底层手段 |
| snap | Snap 商店 | 包内自带，互不影响 | 默认自动刷新 | 官方指定 snap 分发的软件可用，注意刷新窗口 |
| flatpak | Flathub 等仓库 | 运行时共享加自带 | 手动或桌面环境自动 | 桌面应用为主，无桌面服务器一般不引入 |

选型口诀：系统组件和服务端软件一律 apt；本地文件用 apt 装本地路径；软件官方只提供 snap 时才用 snap 并管好刷新；flatpak 留给桌面场景。同一个软件只选一个渠道，不要 apt 和 snap 各装一份，否则命令同名冲突时你很难第一时间判断正在运行的到底是哪一个。

## 四、效果验证与测试

换源和工具验证按以下清单逐项执行。先验证索引健康，再验证来源正确，最后验证四种工具各自可用。

```bash
sudo apt update
apt-cache policy
apt-cache policy curl
dpkg -l bash
snap list
flatpak list
```

期望输出关键点：`apt update` 全程无 Err 和签名错误，速度比换源前明显加快；`apt-cache policy` 中主源地址已是你选定的镜像站域名；curl 的候选版本一行标明来自新镜像的对应 Suites；`dpkg -l bash` 的状态显示为 ii；没有安装 flatpak 的机器最后一条提示命令不存在属于正常情况，不算失败。

做一次真实安装闭环测试，安装一个小工具并验证、再查询其文件归属，最后按需保留或卸载。

```bash
sudo apt install -y tree
tree --version
dpkg -S /usr/bin/tree
sudo apt remove -y tree
```

能装、能查、能卸且全程无依赖错误报告，说明源、索引和包数据库三者状态健康。本章验证通过的标准是命令结果与上述期望逐项对得上，而不是只看安装命令没有报错。

## 五、常见错误与排坑指南

### 错误一：换源后 apt update 报签名错误

报错原文片段如下。

```text
W: GPG error: https://example.com/ubuntu noble InRelease: The following signatures couldn't be verified because the public key is not available
```

原因：deb822 文件中的 Signed-By 指向的密钥文件被误改或被删除，或者把源地址换成镜像站时连签名段一起抄错。修复方法：从备份还原源文件，只重新修改 URIs 一行，不要动 Signed-By 和其他字段。

```bash
sudo cp /etc/apt/sources.list.d/ubuntu.sources.bak-20261021 /etc/apt/sources.list.d/ubuntu.sources
sudo nano /etc/apt/sources.list.d/ubuntu.sources
sudo apt update
```

期望修复后更新过程不再出现 GPG error。若是 22.04 传统格式报同样错误，检查是否误删了 deb 行或把不可信的第三方源混入主文件，逐个源文件排查。

### 错误二：dpkg 安装后依赖损坏，apt 全面被卡

报错原文片段如下。

```text
dpkg: dependency problems prevent configuration of example-package:
 example-package depends on libexample1; however:
  Package libexample1 is not installed.
```

原因：用 dpkg 直接安装本地包时依赖不在本机，包停留在已解开未配置的状态，后续 apt 操作会先要求修复它。修复命令如下，让 apt 自动补齐依赖完成配置；若该包确实不需要了，先卸载它再修复。

```bash
sudo apt install --fix-broken -y
dpkg -l example-package
sudo apt update
```

期望修复后该包状态为 ii 且 apt update 恢复正常。此后本地包一律改用步骤五的 apt 本地路径方式安装，从源头避免复发。

### 错误三：apt update 出现 404 找不到某个 Suites

报错原文片段如下。

```text
E: The repository 'https://example.com/ubuntu noble-backports Release' does not have a Release file.
```

原因：所选镜像站没有同步某个更新类型或某个架构的目录，常见于把桌面版镜像地址误用于服务器架构，或镜像同步不完整。修复方法：先确认版本代号与源文件写法无误，再换一个同步完整的正规镜像站，换之前备份当前文件，换之后重新刷新索引并复查。

```bash
sudo cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bad-mirror
sudo nano /etc/apt/sources.list.d/ubuntu.sources
sudo apt update
apt-cache policy
```

不要用删掉 security 段的方式绕过 404，安全更新源缺失意味着系统收不到补丁，这是拿安全性换表面成功。

## 六、生产环境最佳实践与安全建议

第一，软件源只用可信来源并保持最小集合。主源用官方或正规镜像站，第三方源只添加业务真正需要且由软件官方维护的仓库，每个第三方源都记录添加原因、维护方和签名密钥来源。来历不明的个人打包源一律不进生产，因为一次供应链污染就足以抵消多年运维积累。

第二，换源和改源必须留痕。每次修改都先备份、改后验证、并在运维记录中写明日期、操作者、新旧地址和验证结果。

第三，更新节奏制度化。安全更新开启自动安装或至少每周人工执行一次，常规更新安排在固定维护窗口，更新前看清将被升级和将被删除的包清单，涉及内核和关键运行库时提前准备重启和回退安排。

第四，多渠道装软件要登记在案。凡是用 snap 或本地包方式安装的软件，在台账中注明渠道和版本来源，升级和卸载时按原渠道操作。定期盘点 snap 列表，确认自动刷新没有在业务时段重启关键服务。

第五，定期体检包数据库。每月执行一次依赖检查和孤儿包清理，命令为 `sudo apt check` 和 `sudo apt autoremove`，清理前先看清删除清单。
