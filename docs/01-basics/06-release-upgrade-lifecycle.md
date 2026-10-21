---
description: "跨版本升级是服务器生命周期里风险最高的一次操作：它没有官方回滚按钮，成败取决于升级前的备份、前置检查和对第三方源的处理。本章给出 do-release-upgrade 全流程、ESM 与 Ubuntu Pro、Livepatch 的完整操作与判读方法。"
---

# 系统升级与版本生命周期

## 一、概述与使用场景

日常的 `apt update` 加 `apt upgrade` 只是在当前版本内打补丁，永远不会把 Ubuntu 22.04 变成 24.04。真正改变大版本的操作叫发行版升级，工具是 `do-release-upgrade`，它会更换整套软件源、替换基础库和系统组件、处理配置合并，完成后要求重启。这是一次单向的系统级变更，生产服务器一生只经历几次，但每一次都可能决定这台机器接下来几年的稳定性。

为什么必须提前规划：LTS 标准支持期只有 5 年，结束后无安全更新；LTS 间升级通常要等目标版本第一个小版本发布后才开放，错过节奏会被迫仓促升级；且升级涉及第三方源、内核和业务软件兼容性，必须先在测试机验证。

本章覆盖三类场景：一是计划内的 LTS 跨版本升级，例如从 22.04 升级到 24.04，给出完整流程；二是老版本已结束标准支持，需要理解 EOL、ESM 与 Ubuntu Pro 的关系；三是启用 Livepatch 减少内核更新重启次数。贯穿全章的认知是：升级追求的不是版本号变新，而是让系统回到受支持、可打补丁、依赖干净的状态。

## 二、环境准备与前置条件

本章命令已按官方文档核对，适用于 22.04 LTS 与 24.04 LTS。Ubuntu 26.04 一律标注为待核验。本章为文档核对级别，不声称已实测，首次执行请先在测试机完整走一遍。

执行升级前必须逐项确认以下条件，任何一项不满足都不要开始。

- 当前系统已更新到最新，需要重启的更新已重启。
- 有可验证的完整备份或虚拟机快照，且确认过恢复方法可用；只有备份文件而从未演练恢复，等于没有回退路径。
- 系统盘和 /boot 分区有充足剩余空间，空间不足是升级失败最常见的原因之一。
- 包数据库健康，没有半配置包和 hold 住的关键包。
- 有本地控制台或云厂商带外管理通道，远程升级一旦 SSH 中断，没有带外通道就无法接管机器。
- 业务侧已知道维护窗口，升级和重启期间服务会中断，必须提前通知。

动手前先做带日期的备份，至少覆盖系统配置、业务数据清单和软件包清单。

```bash
sudo mkdir -p /root/backup-20261021
sudo cp -a /etc /root/backup-20261021/etc-backup
sudo dpkg --get-selections > /root/backup-20261021/package-selections.txt
sudo crontab -l > /root/backup-20261021/root-crontab.txt
ls -lh /root/backup-20261021/
```

逐条说明：创建带日期的备份目录、复制 /etc、导出软件包清单（灾难恢复时按清单重装）、导出 root 定时任务、确认产物存在。若是虚拟机，还应打整机快照并把编号记入台账，快照是唯一可靠的回退手段。

再把升级前状态固定下来，便于升级后逐项对照。

```bash
lsb_release -a
df -h
df -h /boot
sudo dpkg --audit
apt-mark showhold
```

其中 `df -h /boot` 单独看引导分区余量，`sudo dpkg --audit` 检查包数据库，正常时无输出，`apt-mark showhold` 列出被锁定的软件包，正常生产机应为空或只有明确认可的条目。

!!! danger "没有快照或可恢复备份，禁止开始升级"

    发行版升级没有撤销键。跳过备份直接升级，意味着一旦中途失败，你只能在故障现场一边排查一边承受业务中断，没有任何退路。备份未完成、快照未确认、恢复未演练，三者缺一，后续步骤一律不得执行。

## 三、手把手操作步骤

### 3.1 前置检查：先更新到当前版本最新状态

升级器有硬性要求：当前版本必须先更新到最新，否则会直接拒绝并提示先安装全部可用更新。

```bash
sudo apt update
sudo apt upgrade -y
sudo apt full-upgrade -y
sudo apt autoremove -y
ls /var/run/reboot-required
```

逐条说明：`full-upgrade` 处理需要增删依赖的更新，`autoremove` 清理无用旧包释放空间，最后一条检查待重启标记文件，若文件存在，必须先重启一次再继续。重启回来后做第二轮体检。

```bash
sudo dpkg --audit
sudo dpkg --configure -a
apt-mark showhold
df -h
df -h /boot
uname -r
```

判读标准如下表，逐项对上才算通过。

| 检查项 | 通过标准 | 不通过时的处理 |
|--------|----------|----------------|
| `dpkg --audit` 输出 | 无任何输出 | 先执行 `dpkg --configure -a` 修复再复查 |
| hold 软件包 | 为空或均为已知项 | 查清原因，升级前解除或书面确认保留 |
| 系统盘可用空间 | 建议不少于 10 GB | 清理日志、旧包缓存后再查 |
| /boot 可用空间 | 建议不少于 500 MB | 按第五节场景一清理旧内核 |
| 待重启标记 | 文件不存在 | 先重启，再重新执行本节检查 |

特别说明 hold 包：被锁的包不会被升级器升级，若被锁的是基础库，升级器在依赖计算阶段就可能报错。原则是查清锁定原因，确认业务不再依赖旧版后用 `sudo apt-mark unhold 包名` 解除，再重新执行一次完整更新。

### 3.2 理解 Prompt 配置：升级通道决定你能升到哪

升级器是否提示新版本、提示哪一类版本，由 /etc/update-manager/release-upgrades 中的 Prompt 参数决定。

```bash
sudo cp /etc/update-manager/release-upgrades /root/backup-20261021/release-upgrades.bak
cat /etc/update-manager/release-upgrades
grep "^Prompt" /etc/update-manager/release-upgrades
```

Prompt 三种取值的含义如下表。

| 取值 | 含义 | 服务器建议 |
|------|------|------------|
| `Prompt=lts` | 只在有新的 LTS 可用时才提示升级 | 生产服务器保持此值 |
| `Prompt=normal` | 普通版发布时也提示升级 | 服务器不要使用 |
| `Prompt=never` | 永不提示任何发行版升级 | 不推荐，容易错过升级窗口 |

`Prompt=lts` 意味着两件事：你不会被普通版发布打扰，系统只沿 LTS 到 LTS 的路线走；且 LTS 间升级通道通常在目标 LTS 第一个小版本发布后才开放，所以新 LTS 刚发布的那几个月里检查显示没有新版本是正常现象，不是故障。切忌为了早几天升上去就把 Prompt 改成 normal，那会把机器带进普通版的短支持周期。本节只确认该值为 lts，若发现是 never 或 normal，先备份留档，再改回 lts 并记录原因。

### 3.3 检查可用新版本与 -d 参数警告

确认通道后用只检查模式预演，它只报告有没有可用升级，不会真正动手。

```bash
sudo do-release-upgrade --check-dist-upgrade-only
```

若有可用升级，命令会报出目标版本；若没有，会显示没有找到新版本。后者出现时按顺序排查：当前版本是否已更新到最新、Prompt 是否为 lts、目标 LTS 第一个小版本是否已发布。三项都正常仍无提示时，耐心等待官方开放通道，不要用开发版参数强行绕过。

!!! warning "慎用 -d 开发版参数"

    `do-release-upgrade -d` 中的 -d 表示升级到仍在开发中的版本，只供开发者和测试人员提前验证。开发版意味着软件包还在变动、第三方驱动和软件可能尚未适配、社区资料也最少。生产服务器禁止使用 -d 抢跑，把它当成解决没有新版本的办法，是升级事故的经典开端。

### 3.4 正式执行发行版升级

正式升级建议在本地控制台或带外通道执行；只能用 SSH 时，先确认云平台提供串口控制台或救援模式，并把会话放进 tmux，避免本地网络抖动杀死升级进程。

```bash
tmux new -s upgrade
sudo do-release-upgrade
```

升级器启动后会依次：校验签名并做依赖计算，给出安装、升级和移除清单（移除清单里不能出现业务关键软件，必须认真看）；自动禁用第三方源和 PPA（见 3.5 节）；询问是否开始，确认后进入下载替换阶段，此阶段不要中断、不要另开终端执行 apt；遇到配置冲突时逐个询问，业务改过的选保留，没碰过的可选新版本，不确定时先保留并记下文件名待升级后合并；最后提示移除过时包并要求重启，重启后才真正运行在新版本上。升级中保持供电和网络稳定，时长几十分钟到数小时都属正常，不要急于强制中断。

### 3.5 第三方源与 PPA：为什么被禁用，升级后如何恢复

升级后发现某些软件不能更新，第一反应往往是源被弄坏了，其实这是有意设计，理解三点即可正确处理。

第一，为什么自动禁用。第三方源的包是针对旧代号编译的，例如为 jammy 构建的包依赖旧版基础库，让它们参与新版本依赖计算极易冲突甚至算不出方案，因此升级器把 /etc/apt/sources.list.d/ 下的第三方条目禁用，只用官方源先升系统本体。

第二，在哪里看被禁用的条目。

```bash
ls -l /etc/apt/sources.list.d/
grep -r "disabled on upgrade" /etc/apt/sources.list.d/
cat /etc/apt/sources.list
```

带 disabled on upgrade 注释或被改名的文件就是升级器动过的条目。先把清单抄进运维记录，再逐个处理，不要一条命令全部启用。

第三，逐个恢复的正确方法：先去软件官方页面确认已发布新版本代号对应的源，例如已提供 noble 即 24.04 的仓库；确认后再把源文件代号改成新代号并取消禁用；然后单独刷新并观察报错；最后才更新该软件并做业务验证。

```bash
sudo nano /etc/apt/sources.list.d/example-repo.list
sudo apt update
apt-cache policy
```

上例中 example-repo.list 是占位文件名，实际换成真实文件名。若官方还没有新代号的源，正确做法是保持禁用、记录待办、定期复查，而不是硬改代号碰运气：硬改轻则 404，重则装上依赖不匹配的包把刚升好的系统再次弄坏。PPA 同理，确认已发布新代号包之前不要重新启用。

### 3.6 升级中途断电或中断的处置

处置目标不是立刻回滚，而是先判断系统停在哪个阶段，再决定续修还是靠快照恢复。先恢复供电和网络，通过控制台登录；进不了正常登录时先用恢复模式或云平台救援模式进入。不要再次直接运行升级器，先修复包数据库的半成品状态，修复完成后刷新索引并补齐更新，确认包状态干净后再重新检查升级。若修复反复报错、系统库已损坏到无法登录，则停止挣扎，直接用升级前快照或备份恢复。

```bash
sudo dpkg --configure -a
sudo apt install --fix-broken -y
sudo apt update
sudo apt full-upgrade -y
sudo do-release-upgrade --check-dist-upgrade-only
```

逐条说明：`dpkg --configure -a` 配置所有已解压未配置的包，`apt install --fix-broken` 修复破损依赖，随后刷新索引并完整更新，把系统先拉回自洽状态，最后重新检查升级是否可继续。处置过程每一步的报错原文都要保存，它是判断续修还是恢复快照的关键证据。

### 3.7 认清边界：发行版升级没有官方回滚机制

这一节单独讲，因为它决定了你对升级的全部态度。

!!! danger "Ubuntu 发行版升级没有官方回滚，升错了不能一键退回"

    `do-release-upgrade` 是单向操作。Ubuntu 没有提供把已升级系统降级回旧版本的官方工具或流程，apt 也不能靠换回旧源把成百上千个已替换的包安全退回去。任何声称可以一键降级的第三方脚本都不应进入生产环境。真正的回退只有两条路：一是恢复升级前的虚拟机快照或 LVM、ZFS 快照，二是用升级前的整机备份重装恢复。除此之外没有第三条可靠的路。

由此得出三条纪律：快照保留到业务稳定运行至少两周再删；先在同配置测试机完整升级并验证，再动生产机；涉及 LVM 或 ZFS 时提前确认快照方法并在测试机演练，快照回滚同样是破坏性操作。升级前用下面命令查实快照能力，不要假设有。

```bash
sudo lvs
sudo zpool list
df -h
```

三条命令分别确认 LVM 卷组现状、ZFS 存储池现状和各分区空间。实际的快照创建与回滚语法以所用虚拟化平台或存储方案的官方文档为准，本章不给未经核对的一键回滚命令。

### 3.8 理解 EOL 与 ESM：支持期结束之后发生了什么

先分清三个概念。标准支持期是 LTS 发布后的 5 年，期间 main 组件的软件包由 Canonical 提供安全更新。EOL 是 End of Life 的缩写，指维护终止点，过了就再没有官方补丁。ESM 是 Expanded Security Maintenance 扩展安全维护的缩写，它在标准支持期结束后继续为指定范围的包提供安全修复，让老系统多一段可安全运行的时间。ESM 分为两个范围，区别必须分清。

| 服务名 | 覆盖范围 | 说明 |
|--------|----------|------|
| esm-infra | main 组件的基础设施类软件包 | 为已结束标准支持的老版本延续核心安全维护 |
| esm-apps | universe 组件的应用类软件包 | 覆盖更广的应用软件包安全维护 |

对 ESM 的正确理解是：它是续命手段，不是免升级通行证。它只提供安全修复，不提供新功能，不保证第三方软件适配，也不能替代版本规划。一台靠 ESM 续命的机器，台账状态应是已制定升级计划并在执行中。判断机器是否已过标准支持期，以版本生命周期表和 Canonical 官方页面为准，不要凭记忆下结论。

### 3.9 Ubuntu Pro：附加订阅、启用 ESM 与查看状态

ESM 通过 Ubuntu Pro 订阅提供，管理工具是系统预装的 `pro` 命令。订阅令牌属于凭据，下面只写占位写法，真实令牌不要写进文档、脚本或聊天记录。

```bash
pro status
sudo pro attach YOUR_TOKEN_HERE
pro status
sudo pro enable esm-infra
sudo pro enable esm-apps
sudo apt update
```

逐条讲解：第一条在未附加时列出可用服务并提示尚未附加；`pro attach` 用令牌附加订阅，YOUR_TOKEN_HERE 是占位符，执行时换成官网获取的真实令牌且不要明文留档；附加后状态输出会多出 ENTITLED 和 STATUS 列；随后两条分别启用 esm-infra 和 esm-apps（部分情况下附加后自动启用，手动执行确认即可）；最后刷新索引让 ESM 源生效。

Canonical 面向个人用户提供免费个人订阅，可用于少量个人机器，具体台数、资格和范围以官方当前政策为准，本章不写死价格和台数。企业和批量机器应购买正式订阅。`pro status` 关键列：SERVICE 是服务名，ENTITLED 是订阅是否有权使用，STATUS 是本机 enabled、disabled 还是不适用，排障先看这张表。

### 3.10 Livepatch：内核热补丁的启用与边界

内核安全更新通常要重启才生效，Livepatch 把符合条件的内核安全补丁以热补丁方式打到正在运行的内核上，让你把重启推迟到计划维护窗口。它有两种启用路径，任选其一，不要重复叠加。路径一是推荐路径，前提是本机已按 3.9 节附加订阅。

```bash
sudo pro enable livepatch
pro status
canonical-livepatch status
```

路径二直接通过 snap 管理客户端，适用于需要单独控制客户端的场景。

```bash
sudo snap install canonical-livepatch
canonical-livepatch status
```

两种路径最终验证的都是 `canonical-livepatch status` 输出，期望看到客户端已启用、当前内核受支持、补丁状态正常，具体字段以实际输出为准。`pro status` 中 livepatch 一行 STATUS 为 enabled 是第一层确认，详细状态输出是第二层确认，两层都对上才算成功。必须讲清边界：它只覆盖内核安全补丁，用户态软件包、基础库和需要更换整个内核的重大更新仍要正常更新加重启；遇到重大内核问题或补丁明确要求重启时，重启不可省略，它减少的是重启频率，不是取消重启；启用后仍要在补丁台账中确认积压更新已在计划重启时全部生效。

## 四、效果验证与测试

升级完成不要只看版本号变了就宣布成功，按以下清单逐项验证，任何一项不符先处理再交付业务。

```bash
lsb_release -a
uname -r
ubuntu-security-status
pro status
systemctl --failed
sudo dpkg --audit
df -h
```

期望输出示例与判读标准如下。

```text
Distributor ID: Ubuntu
Description:    Ubuntu 24.04 LTS
Release:        24.04
Codename:       noble
```

逐项说明：Release 和 Codename 必须已是目标版本；`uname -r` 应为新版本匹配的内核系列；`ubuntu-security-status` 不应出现系统已不受支持的警告，个别版本输出格式有变化时以 `pro status` 交叉判断；未使用 Pro 的机器显示未附加属正常；`systemctl --failed` 应无失败单元；`dpkg --audit` 应无输出；磁盘空间不应被残留占满。

再补一组业务层验证，系统层全绿不等于业务可用。

```bash
systemctl list-unit-files --state=enabled
ss -tlnp
sudo apt update
```

第一条核对关键服务是否仍为开机自启，第二条核对业务端口是否在监听，第三条确认软件源整体健康无报错。三组验证全部通过并完成一次真实业务请求测试后，才可把这次升级记为完成，并开始计算快照保留期。

## 五、常见错误与排坑指南

### 场景一：/boot 空间不足，新内核装不下

现象：更新或升级时报错提示 /boot 空间不足、无法安装新内核镜像，或升级后重启仍进入旧内核。根因是 /boot 通常只有几百 MB 到 1 GB，历次内核更新留下的旧镜像和 initramfs 长期累积把分区塞满，新内核没有落脚之地。先确认现状，再让系统按自身保留策略清理旧内核；清理前先确认当前运行的内核版本，绝不能删正在运行的内核。

```bash
uname -r
df -h /boot
dpkg -l "linux-image-*" | grep "^ii"
sudo apt autoremove -y
df -h /boot
```

修复要点：优先用 `apt autoremove` 清理，不要手动到 /boot 删文件，手删容易删错配套的 initramfs 和配置。若 autoremove 后仍不足，检查异常大的残留文件并核对所属包再处理。根治办法是装机时给 /boot 留足空间，日常巡检监控 /boot 使用率，超过百分之七十就提前清理，不要等升级当天才发现。

### 场景二：第三方源依赖卡住升级检查

现象：升级检查报错或卡住，提示某些包无法升级、依赖无法满足，或升级器直接拒绝开始。根因通常是某个第三方源或 PPA 的包依赖旧版系统库，或者某个 hold 包挡住了依赖计算，升级器算不出自洽的新版本方案，于是拒绝冒险执行。排查顺序是：先更新当前版本到最新并处理 hold 包，再临时禁用可疑第三方源后重试检查，定位到具体源后保持它禁用、先完成系统本体升级，升级后再按 3.5 节逐个恢复。

```bash
sudo apt update
sudo apt full-upgrade -y
apt-mark showhold
ls -l /etc/apt/sources.list.d/
sudo do-release-upgrade --check-dist-upgrade-only
```

若某个第三方软件确实与新版本不兼容，正确决策是先在测试机确认替代方案或卸载该软件再升生产机，而不是用强制参数硬闯。依赖计算失败是升级器在保护系统，绕过保护等于把问题留到升级中途爆发，后果严重得多。

### 场景三：升级后服务未自启，系统正常但业务没起来

现象：升级重启都顺利但业务不通，关键服务没有运行。根因有三类：依赖包被替换导致启动失败；配置冲突时选了新版默认配置覆盖原设置；或服务本身没设自启，平时靠人工拉起。先看失败单元和日志，再恢复自启并验证。

```bash
systemctl --failed
systemctl status example-service
sudo journalctl -u example-service -n 100
sudo systemctl enable example-service
sudo systemctl start example-service
systemctl is-enabled example-service
```

上例中 example-service 是占位服务名，执行时换成真实服务名。是配置问题就按日志修配置，是依赖问题就补依赖，不要不看日志就反复重启服务。修复后 `systemctl is-enabled` 应输出 enabled。根治办法是维护服务清单台账，写明每个关键服务的自启状态、配置文件位置和验证方法，每次升级后按清单逐项核对，而不是靠用户投诉发现服务没起来。

## 六、生产环境最佳实践与安全建议

第一，升级节奏制度化：台账登记每台机器的版本、支持结束时间和计划窗口，先升测试机，稳定一个月再升生产机，全部升级在支持结束前至少六个月完成。

第二，备份与快照是升级的一部分：没有经过恢复演练的备份不算回退路径，快照保留期从业务验证通过算起至少两周；每次升级形成书面记录，写明前后版本、备份位置、快照编号、配置冲突和验证结果。

第三，第三方源实行清单管理：登记来源、维护方和对应软件，升级时先禁用后逐个恢复，没有官方新代号源的软件宁可停用并记录待办，也不要硬改代号。

第四，ESM 和 Livepatch 要用得明白：接近或超过支持期的机器，要么排进升级计划，要么启用 ESM 并记录期限；Livepatch 启用后仍保留定期重启窗口。

第五，安全状态定期复查：每月用 `pro status` 和 `ubuntu-security-status` 复查 fleet 维护状态，逐项销项。版本靠制度管，不要靠记忆管。
