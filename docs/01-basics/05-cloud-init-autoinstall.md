---
description: "手动装一台机器靠的是手速，批量装一百台靠的是声明：一份在首次启动时自动执行的初始化描述，加一份让安装器全程无人值守的应答文件。本章讲清 cloud-init 与 Autoinstall 的分工、写法与验证方法。"
---

# 云初始化与无人值守安装：cloud-init 与 Autoinstall

## 一、概述与使用场景

手动装一台机器靠的是手速，批量装一百台靠的是声明：一份在首次启动时自动执行的初始化描述，加一份让安装器全程无人值守的应答文件。本章讲清 cloud-init 与 Autoinstall 的分工、写法与验证方法。

先分清三件事的边界。安装器（Subiquity）负责把系统装到磁盘上（分区、拷贝文件、建第一个账号），解决从无到有。cloud-init 负责第一次启动时的初始化（建账号、注公钥、装基础包、写配置、挂数据盘），解决从刚装好到能交付。配置管理（以 Ansible 为代表）负责交付后的持续变更，反复执行、保持期望状态，解决长期一致。接力关系是：Autoinstall（Subiquity 的无人值守模式）装机时把第一份 cloud-init 配置埋进去，cloud-init 首启执行它，日常变更再交给 Ansible。Ansible 入门见 [Ansible 自动化配置管理](../07-automation/03-ansible.md)，口诀是：装机初始化用 cloud-init，持续配置管理用 Ansible，不要拿一次性脚本顶长期活。

cloud-init 解决同质化交付：从同一镜像或同一安装流程出发，每台机器首启自动变成规划好的样子，不必逐台手工初始化，否则必然出现某台漏注公钥、某台忘了关密码登录这类参差。Autoinstall 解决装机本身的人工：每屏提问预先写进应答文件，机器启动后全程无人守，适合批量上架。风险同样具体：user-data 语法错时 cloud-init 往往整段跳过继续开机，机器看着装好、账号密钥却没落地；公钥注错用户同样装完登不进；Autoinstall 存储段写错会直接抹盘，选错目标盘就是数据事故。纪律与全站一致：先校验、再小样、最后批量，示例先在虚拟机跑通。

## 二、环境准备与前置条件

版本基线为 Ubuntu Server 22.04 LTS 与 24.04 LTS，两者的 cloud-init 与 Subiquity 行为一致，本章命令在这两个版本上通用；Ubuntu 26.04 的相关行为一律按待核验对待，不要把本章结论直接套到 26.04 上，等实机验证后再更新本章。

形态准备分两种。验证 cloud-init 需要一台能反复销毁重建的虚拟机（任意虚拟化平台均可），或一台已装好 cloud-init 的测试机用来跑语法校验；验证 Autoinstall 需要一台空白虚拟机与 Ubuntu Server 安装镜像。示例约定：管理员用户名为 opsadmin，主机名示例为 server01，地址示例使用文档段 192.0.2.0/24，域名示例使用 example.com。SSH 公钥在你自己的工作机上生成并保管私钥，公钥文本将写进 user-data 示例的对应位置，私钥永远不要写进任何配置文件与应答文件。

先确认目标镜像或已装系统里 cloud-init 的存在与状态：

```bash
cloud-init --version
cloud-init status
systemctl status cloud-init
ls /etc/cloud/cloud.cfg.d/
```

`cloud-init status` 会输出当前状态与已启用的数据源等信息，状态为 done 且无错误才表示上一轮初始化干净完成；带 error 字样时先看日志再谈其他（日志位置在第三节讲）。Ubuntu 的云镜像与 Server 安装结果默认都带 cloud-init，自己制作的精简镜像若没装这个包，后文所有 user-data 都不会有人执行，这是先要排除的前提。

!!! warning "应答文件与 user-data 里只有公钥、没有私钥与明文密码"
    这两类文件会被复制、归档、放进镜像或经网络下发，任何写进去的秘密都会跟着到处流转。账号一律用 SSH 公钥登录，确需初始密码时只写密码的哈希值并在首次登录后强制改密与关密码登录，不要在文件里写明文密码。

## 三、手把手操作步骤

### 3.1 cloud-init 的阶段、模块与数据源

cloud-init 在开机时按四个阶段依次运行，理解阶段就理解了它的报错该去哪一层找：

| 阶段 | 时机 | 主要工作 |
|------|------|----------|
| init-local | 最早，网络尚未起来 | 只从本地找数据源，备好运行环境，不执行需要网络的动作 |
| init | 网络可用后 | 确定数据源、取回 user-data 等配置，做实例身份识别 |
| config | init 之后 | 执行配置类模块：建用户与组、写文件、设主机名、配软件源等 |
| final | 接近开机完成、登录开放前 | 执行收尾类模块：装软件包、运行 runcmd 与用户脚本、发完成信号 |

模块是阶段里干活的单元，各有运行频率，这是理解幂等性的关键：per-instance 每台新实例只跑一次（以实例 ID 判新旧），per-boot 每次开机都跑，per-once 同一台机器一生只跑一次。建用户、注公钥与 runcmd 都属 per-instance，不要把需每次开机执行的动作误写进 runcmd，详见 3.2。

数据源（datasource）回答配置从哪来。云上从厂商 metadata 服务取 user-data，控制台创建实例时填的配置就从这里进来。本地没有 metadata 时用 NoCloud：把 user-data、meta-data 放在种子镜像、带指定标签的磁盘或目录里，cloud-init 认出后当作配置来源，3.3 的本地验证走这条路。原理都是先认来源、再取配置、最后按阶段执行。

判读入口只有两个：

```bash
cloud-init status --long
sudo tail -n 100 /var/log/cloud-init.log
sudo tail -n 100 /var/log/cloud-init-output.log
```

`status --long` 给每阶段与数据源摘要；主日志 `/var/log/cloud-init.log` 记模块为何跳过与哪步报错；`cloud-init-output.log` 单独收 runcmd 与脚本的输出，脚本没效果先看它跑没跑。两日志分工不同，不要只看一个就下结论。

### 3.2 user-data 逐段讲解

user-data 最常用的格式是 cloud-config：第一行必须是 `#cloud-config`，其余是 YAML。下面给一份完整示例，覆盖批量交付最常用的六件事：建运维账号并注公钥、关密码登录、装基础包、写一份配置文件、首次启动执行初始化命令、挂载数据盘。示例公钥是占位文本，执行时换成你自己的真实公钥整行：

```yaml
#cloud-config
users:
  - name: opsadmin
    groups: sudo
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyMaterialReplaceWithYourOwnPublicKey opsadmin@example.com
ssh_pwauth: false
packages:
  - curl
  - vim
  - htop
write_files:
  - path: /etc/motd.d/99-provisioned
    permissions: "0644"
    content: |
      Provisioned by cloud-init. Managed host: report changes via the ops process.
runcmd:
  - systemctl enable --now chrony
  - touch /var/lib/provisioned-by-cloud-init
mounts:
  - [ "LABEL=data", "/data", "ext4", "defaults,nofail", "0", "2" ]
```

逐段讲解。第一行 `#cloud-config` 是格式声明头、不是普通注释，缺了它整份文件不会被当配置解析，是最常见的整段失效原因。`users` 建账号：groups 加入 sudo 组，shell 指定登录壳，sudo 行授予免密 sudo（图批量方便，高安全环境应去掉 NOPASSWD，按基线二选一并记台账），ssh_authorized_keys 把公钥注入授权文件，公钥必须一整行、不能被折行。`ssh_pwauth: false` 关密码登录，与公钥成对出现，cloud-init 先建用户与公钥再应用它，前提是公钥写对，写错后果见第五节。`packages` 在 final 阶段装齐，需先刷新索引时加一行 `package_update: true`。`write_files` 按路径、权限与内容写小文件，大文件与复杂脚本不要硬塞，交 runcmd 拉取或 Ansible 下发。`runcmd` 在 final 阶段按序执行一次，做启用服务、打标记等一次性收尾。`mounts` 按 fstab 字段顺序描述挂载，上例把标签 data 的盘挂到 /data，字段含义见 [挂载与存储共享](../03-storage/03-mount-sharing.md)，盘标签需预先打好，对不上时靠 nofail 不阻塞开机。

幂等性单独强调：声明式段落（users、packages、write_files、mounts）天然接近幂等，状态已达标时重复处理无新变化。runcmd 不是声明式，它是 per-instance 一次性脚本，只在首次启动跑，改完 user-data 重启不会重跑（第五节详讲）。需每次开机执行的动作改用 per-boot 脚本目录（/var/lib/cloud/scripts/per-boot/，赋可执行权限）：per-instance 管只做一次的初始化，per-boot 管每次开机的检查与登记，选错要么不生效、要么重复执行出副作用。runcmd 里的命令也要自带幂等（建目录带 -p、写文件用覆盖不用追加），调试重跑时才不会报错或写出双份。

### 3.3 本地验证路线：先校验，再小样试跑

批量使用前必须走完两步验证：语法校验与单机试跑，顺序不能反。

第一步，语法与结构校验。在一台装有 cloud-init 的机器上，把准备好的 user-data 存为文件后执行：

```bash
sudo cloud-init schema --config-file ./user-data.yaml
cloud-init schema --system
```

第一条针对指定文件校验，能提前抓出 YAML 缩进错误、字段拼写错误与类型不对等结构问题，非零退出或输出带错误提示都不能放行；第二条校验本机当前系统已生效的合并配置，用来对照运行环境。注意校验通过只证明写法合法，不证明公钥能登录、软件包名存在、磁盘标签对得上，这些只能靠试跑证明，不要拿校验通过代替试跑。

第二步，NoCloud 小样试跑。在虚拟化平台新建一台空白虚拟机，挂 Ubuntu Server 云镜像或已装 cloud-init 的系统盘，再准备种子配置：把 user-data 与一份最小 meta-data 放在一起，meta-data 至少给出实例 ID 与主机名：

```yaml
instance-id: iid-local-test01
local-hostname: server01
```

把这两个文件做成种子 ISO 后作为光驱挂给虚拟机（镜像卷标需为 cidata，这是 NoCloud 的约定），或按平台支持的方式放进种子目录，再启动虚拟机。开机完成后依次验证：

```bash
cloud-init status
ssh -i ~/.ssh/id_ed25519 opsadmin@192.0.2.21
ls -l /var/lib/provisioned-by-cloud-init
findmnt /data
```

期望四项全过：status 为 done、公钥能登录、标记文件存在、数据盘已挂载。任何一项不过先看日志定位模块，改文件后销毁重建再试，不要在试跑过的机器上改配置重跑，per-instance 不重跑会让你误判新配置无效。通过的版本归档留底，批量只用归档版。

### 3.4 自定义镜像与实例重建

批量交付常把验证通过的状态做成自定义镜像：以一台配好的机器为母本，清理掉实例专属痕迹后封存，之后每台新实例从它启动、再由 cloud-init 按各自的 user-data 做差异化。封存前的清理动作与意义逐项看：

```bash
sudo cloud-init clean --logs
cat /etc/machine-id
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id
sudo rm -f ~/.ssh/authorized_keys /home/opsadmin/.ssh/authorized_keys
history -c
```

`cloud-init clean` 把 cloud-init 的运行状态恢复到未执行过，清掉它记录的实例信息与日志，这样新实例开机时才会把自己当作一台全新实例、完整跑一遍 per-instance 模块，漏了这一步的镜像克隆出来会跳过初始化。machine-id 是系统给自己生成的唯一标识，克隆若不清空，多台机器会共用同一个 ID，日志聚合、授权计数与部分服务都会把它们认成同一台；清空（置为空文件）后每台在首次启动时自动生成新的，不要把母本的 ID 原样带走。同理要清掉母本上测试用的授权公钥与命令历史，母本只保留系统与软件，不保留任何一台具体机器的身份与凭据。

还要理解销毁重建时的行为：实例被销毁后以同一份镜像与同一份 user-data 重建，cloud-init 会以新实例 ID 重新完整执行，效果应与第一次一致，这正是声明式交付的价值；同一实例只是重启时，per-instance 模块不重跑，不要指望重启能补上首次失败的初始化，首次失败的正确处理是查日志修配置后重建实例，而不是反复重启。

!!! danger "做镜像前先确认清理清单，不要封进秘密"
    封存镜像前逐项核对：cloud-init 已 clean、machine-id 已清空、测试公钥与历史已删、没有任何私钥、令牌与明文密码落在盘上。镜像会被复制到很多机器，做错一次等于批量复制一次，再逐台补救的成本远高于封存前多花十分钟检查。

### 3.5 Autoinstall：让 Subiquity 全程无人值守

Autoinstall 是 Subiquity 安装器的无人值守模式：把安装时每一屏的答案预先写进 `autoinstall.yaml`，机器从安装介质启动、取到这份文件后自动完成分区、装系统、建账号并重启，全程不需要人按键。它与上一章的交互安装是同一安装器的两种用法，装出的系统没有区别。

一份最小但完整的应答文件如下，逐段在后面讲解（密码只写哈希，生成方法见讲解）：

```yaml
version: 1
locale: en_US.UTF-8
keyboard:
  layout: us
network:
  network:
    version: 2
    ethernets:
      id0:
        match:
          name: "e*"
        dhcp4: true
storage:
  layout:
    name: lvm
identity:
  hostname: server01
  username: opsadmin
  password: "$6$ExampleSaltOnly$ExampleHashReplaceWithYourOwnGeneratedHashValueDoNotUseThis"
ssh:
  install-server: true
  allow-pw: false
  authorized-keys:
    - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyMaterialReplaceWithYourOwnPublicKey opsadmin@example.com
packages:
  - curl
  - chrony
user-data:
  timezone: Asia/Shanghai
```

逐段讲解：`version: 1` 是应答文件格式版本，固定写法。`network` 段在此只给最简的按网卡名匹配加 DHCP，静态地址等复杂网络规划建议装完后用 Netplan 章节的方法统一管理，不要把应答文件写成网络配置大全。`storage` 段是全文件最危险的一段，上例用安装器自带的 lvm 布局自动分盘，自定义布局时能精确到盘与分区，写之前必须确认目标盘，正是下一段危险提示的原因。`identity` 建第一个管理员账号，password 只接受哈希，用 `openssl passwd -6` 在你自己的机器上为初始密码生成后填入，不要填明文，也不要把示例哈希当真实密码用，它只是占位。`ssh` 段决定装机时就装好 OpenSSH 并注入公钥，`allow-pw: false` 关密码登录，与 cloud-init 的 ssh_pwauth 是装机期与首启期两个阶段的同一纪律，不要只关一处。`packages` 是装机阶段顺带装的包，保持最小即可，丰富的基础软件留给首启的 cloud-init 或后续 Ansible。最后的 `user-data` 是本章两条线的衔接点：它嵌在应答文件里，内容就是一份 cloud-config，会在系统首次启动时交给 cloud-init 执行，上例用它设时区；需要首启建额外账号、挂数据盘时，把 3.2 那份 user-data 的相应段落嵌到这里即可，一次装机同时完成安装与初始化，不要在装完后再手工补首启配置。

应答文件怎么送到安装器手里，概念上有两条路。一是经网络下发：安装介质启动时指定一个 HTTP 地址，安装器开机自动去取该文件，适合机房批量上架，文件放在内网一台普通 HTTP 服务上即可，里面只有公钥与密码哈希也不要放到公网。二是内嵌进安装介质：把文件按约定放进重新打包的镜像里，单机与离线环境适用，代价是每改一次应答就要重做一次镜像。两种方式取到的文件格式完全一样，先在单台虚拟机上用其中一种跑通，再谈批量。

批量装机的流程与回滚预期要先想清楚。标准流程是：先单机验证应答文件，再小批量三到五台，核对每台的主机名、账号与挂载，最后才全量。识别装错的方法是装后巡检：逐台核对主机名、系统版本、管理员公钥能否登录、数据盘是否按规划挂载，对不上的机器直接判定为装错。Autoinstall 没有装到一半的回滚，它的结果只有装对或重装两种状态，预期处理就是保留数据盘不动、用修正后的应答文件对该机重新完整安装，前提是重要数据从一开始就不放在系统盘上，这也是分区规划时就把数据与系统分开的又一个理由。

!!! danger "storage 段会按规划直接抹盘"
    Autoinstall 一旦取到应答文件就按 storage 段自动执行，不会停下来逐盘向你确认。对已有数据的机器使用前，必须核对应答文件指向的目标盘与这台机器的实际磁盘，并先做好数据备份；批量下发前先在一台无数据的机器上验证下发地址没有指错文件，地址指错导致全批装错的代价是整批重装。

## 四、效果验证与测试

cloud-init 侧验证，在新交付的机器上执行：

```bash
cloud-init status --long
sudo cloud-init schema --system
ssh -i ~/.ssh/id_ed25519 opsadmin@192.0.2.21 "hostname; id"
df -h /data
ls /var/log/cloud-init.log
```

期望：状态为 done 且各阶段无 error，系统级校验无报错，用示例账号与公钥能免密登录且主机名正确，数据盘按 user-data 挂载到位。Autoinstall 侧验证看三件事：安装全程无人干预自动重启进了新系统，identity 里的账号能用公钥登录且密码登录被拒，storage 结果与应答文件规划一致（用 lsblk 与 findmnt 核对）。两条线都验证完，再抽查日志里有没有被跳过的模块与警告，别只看能登录就宣布成功，能登录但软件包与挂载缺失同样是交付不合格。

## 五、常见错误与排坑指南

### 错误一：user-data 语法错，整段配置被跳过

现象是机器正常开机，但账号没建、包没装、命令没跑，等于 user-data 完全没执行。最常见原因是第一行缺 `#cloud-config` 头、YAML 缩进错位、或公钥长行被折断。cloud-init 对格式错误的 user-data 倾向于记录错误后跳过而不是拦住开机，所以表面毫无异常。修复纪律是先校验再试跑（见 3.3），并在出问题时先看主日志中对应阶段的报错行定位到具体字段，不要整份重写碰运气：

```bash
sudo grep -i -E "error|fail|warning" /var/log/cloud-init.log | head -n 30
sudo cloud-init schema --config-file ./user-data.yaml
```

### 错误二：公钥注入了，却还是登不进去

先分清注给了谁。云镜像常有默认用户（如 ubuntu），user-data 的 users 段若建的是 opsadmin，公钥就只在 opsadmin 名下，用默认用户登自然失败，反之亦然。其他常见原因是：公钥不是一整行或混入了私钥内容、ssh_pwauth 已关但公钥本身写错导致没有任何可用登录方式、用户被建出但主目录或授权文件权限不对被 SSH 拒绝。逐项核对：

```bash
sudo ls -ld /home/opsadmin /home/opsadmin/.ssh
sudo ls -l /home/opsadmin/.ssh/authorized_keys
sudo tail -n 30 /var/log/auth.log
```

主目录权限不应让同组与其他人可写，.ssh 应为 700、authorized_keys 应为 600，auth.log 会直接写明拒绝原因。确实被锁在门外时走虚拟化控制台登录修复，不要反复在网络侧重试。

### 错误三：改了 user-data 并重启，runcmd 却没再执行

这不是故障，是语义如此：runcmd 是 per-instance 一次性执行，同一实例重启不重跑，改 user-data 后重启更不会。需要让新逻辑在此实例生效时有两条正路：一是把动作提炼为幂等脚本手工执行一次并验证，二是销毁实例、用改好的 user-data 重建，让它在新实例上完整跑一遍。需要每次开机都跑的动作，从一开始就应写成 per-boot 脚本而不是 runcmd，选错语义后靠重启是补不回来的。

### 错误四：Autoinstall 跑完，但首启配置没有生效

现象是系统装好了、第一个账号能进，但嵌在应答文件 user-data 段里的时区、额外账号与挂载都没落地。原因是 user-data 嵌套层级或缩进写错，被安装器当作无效内容忽略，或目标系统里 cloud-init 被精简镜像去掉了。先核对应答文件中 user-data 段的缩进归属，再在新系统里用 `cloud-init status` 与主日志确认它到底有没有收到这份配置，两处对完再改，不要在安装侧与首启侧同时乱改。

## 六、生产环境最佳实践与安全建议

第一，配置即档案。user-data 与 autoinstall.yaml 都进版本管理，每次变更写清原因与验证结果，批量只用已归档且通过单机验证的版本，临场手改的版本不上批量。第二，秘密不进文件。两类文件只放公钥与密码哈希，巡检时把搜私钥与明文密码作为固定动作，发现即轮换并追溯文件去向。第三，分工不串位。首启一次性的事归 cloud-init 与 Autoinstall，长期持续的变更归 Ansible，机器台账里标明每台的初始化版本与纳管状态，出了参差先查它当初用哪一版配置交付。第四，母本与镜像勤清理。做镜像前走完 3.4 的清理清单，旧镜像与旧应答文件及时下线，防止有人拿过期版本批量交付出一批基线不一致的机器。第五，先小样后批量是硬纪律。任何一份新配置都要经历校验、单机试跑、小批量、全量四步，跳步省下的时间通常会以整批重装的方式加倍还回来。
