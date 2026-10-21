---
description: "CIS Benchmark 给 Ubuntu Server 一份逐项可核对的安全基线。本章讲清 Level 1 与 Level 2 的取舍、Ubuntu Security Guide 的用法与订阅边界，并给出无订阅同样完整的手工审计主线与可勾选检查清单。"
---

# CIS 安全基线审计与合规检查

## 一、概述与使用场景

前面几章把 SSH、账号、防火墙、入侵防御分别配好了，但「配过」不等于「现在仍然合规」：某次排障临时开的服务忘了关、某位同事改松的文件权限没人复查、自动更新被暂停后一直没恢复。CIS Benchmark 解决的就是系统性复查的问题：它是由 Center for Internet Security 组织维护的配置基线文档，把一台服务器该有的安全配置拆成上百条可逐项核对的条目，每条都写明检查方法、期望状态与修复方法，审计时逐项打勾，不靠印象。

先讲清三个概念。Level 1 是基础档：条目普适、低风险，目标是任何服务器都应做到，落实它们一般不会影响业务功能。Level 2 是强化档：在 Level 1 之上再收紧，适合高安全需求环境，但部分条目可能影响易用性或特定业务，例如更严的内核限制、更细的审计规则，上线前必须逐项评估业务兼容性，不要整档无脑套用。Scored 与 Not Scored 是计分属性：Scored 条目计入基线评分工具的得分，Not Scored 不计分但仍是推荐做法，不计分不等于不重要。

与国内等级保护及企业内部审计的关系要摆正位置：CIS 是国际通行的技术配置基线，条目具体、可操作，适合作为内部自查与加固的工程依据；它不是任何国家合规认证的替代品，通过 CIS 自查不等于通过等保测评，反过来，等保对管理、流程、物理环境的要求也不是 CIS 覆盖范围。本章把它当作一份优秀的工程检查表使用，不夸大它的合规效力。

本章的路线是：先用工具快速摸清差距，再用手工命令逐域核查与修复，最后用检查清单固化成可重复执行的自评流程。与站内分工上，SSH 参数细节见 [第 01 章](01-ssh-hardening.md)、防火墙规则见 [第 03 章](03-firewall.md)、入侵防御见 [第 04 章](04-defense.md)，本章只做「查什么、期望是什么、去哪改」的索引与判读，不复制那几章的操作细节。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，Ubuntu 26.04 上 USG 的 profile 覆盖与工具行为标记为「待核验」，不要把 22.04 / 24.04 的结论直接套到 26.04。操作需要带 `sudo` 的管理账号，并预留维护窗口：审计本身只读、无风险，但修复阶段会改服务与配置，必须按第六节的节奏逐项推进。

先给当前系统留一份完整快照，后续所有修复都有对照与回退依据：

```bash
sudo mkdir -p /root/baseline-$(date +%F)
sudo cp -a /etc/ssh /root/baseline-$(date +%F)/ssh
sudo cp -a /etc/pam.d /root/baseline-$(date +%F)/pam.d
sudo cp /etc/login.defs /root/baseline-$(date +%F)/login.defs
sudo cp /etc/sysctl.conf /root/baseline-$(date +%F)/sysctl.conf
sudo cp -a /etc/sysctl.d /root/baseline-$(date +%F)/sysctl.d
systemctl list-unit-files --state=enabled > /root/baseline-$(date +%F)/enabled-services.txt
ss -tulnp > /root/baseline-$(date +%F)/listening-ports.txt
ls -l /root/baseline-$(date +%F)/
```

!!! warning "先审计、只出报告，是本章的第一纪律"
    第一次接触基线时最常见的事故，是看到修复命令就直接整批执行，结果某个业务依赖的服务被禁用、SSH 参数被改动后会话断开。正确顺序是：先跑审计生成报告，再逐项评估影响，然后改一项验一项。完整的风险与回滚流程见第 3.5 节，开始动手前先把那一节读完。

Ubuntu Security Guide（USG）是 Canonical 提供的基线工具，能按 CIS 或 DISA STIG 等 profile 做审计与自动修复。安装方式如下，包的可用性以当前发行版仓库为准：

```bash
sudo apt update
sudo apt install -y ubuntu-advantage-tools usg
usg --help
```

如实说明订阅边界：USG 的部分 profile 与修复能力需要 Ubuntu Pro 订阅，免费个人额度等政策以 Ubuntu 官方页面为准，本书不写死数字与额度。没有 Pro 时不要觉得这章就做不了：下一节的手工审计主线覆盖同样的基线域，检查命令与修复方向完整可用，只是需要人工逐项执行。先确认本机订阅状态再决定走哪条线：

```bash
pro status
```

## 三、手把手操作步骤

### 3.1 用 USG 生成审计报告

有可用订阅时，先只审计不修复。USG 的基本流程是三条命令：`usg generate-fix` 按选定 profile 生成修复脚本（只生成、不执行），`usg fix` 执行修复，`usg audit` 做审计并出报告。本章只演示到生成报告与脚本供人审阅为止，执行修复前必须逐项看懂脚本将改什么：

```bash
sudo usg audit cis_level1_server
sudo usg generate-fix cis_level1_server /root/baseline-fix.sh
less /root/baseline-fix.sh
```

Profile 名以 `usg` 工具当前列出的为准，版本不同名称可能有别，不要凭记忆硬写。审计报告重点看三处：不合规条目总数、各条目的当前值与期望值、条目对应的系统区域。把报告存进第 2 节的快照目录，作为修复前的基线证据。`generate-fix` 出来的脚本要逐段读：凡是涉及禁用服务、改 SSH、改网络参数的段落，单独标记出来走人工评估，不许整脚本直接运行。

### 3.2 手工审计主线之一：服务最小化与账户密码策略

没有订阅或想自己掌控每一项时，走手工主线。第一域是服务最小化：只应保留业务真正需要的服务与监听端口。

```bash
ss -tulnp
systemctl list-unit-files --state=enabled
systemctl list-units --type=service --state=running
```

期望状态：`ss` 的每一行监听都能说清归属服务与业务用途，说不清的先查再关；已启用服务清单里没有明确不需要的项。修复方向是 `sudo systemctl disable --now 服务名`，逐个执行、逐个验证业务，服务清单与 [第 04 章](04-defense.md) 的防御基线对照着看。

第二域是密码与账户策略，分三处核查。PAM 口令强度由 pwquality 管，参数逐行讲解见下表，先看当前值：

```bash
grep -E "pam_pwquality" /etc/pam.d/common-password
cat /etc/security/pwquality.conf
grep -E "PASS_MAX_DAYS|PASS_MIN_DAYS|PASS_WARN_AGE" /etc/login.defs
chage -l opsadmin
sudo grep -E "^\s*root" /etc/shadow
```

| 参数 | 位置 | 期望方向 | 说明 |
| --- | --- | --- | --- |
| `minlen` | `pwquality.conf` | 不低于 12 | 口令最小长度，太短时字典攻击成本骤降 |
| `dcredit` / `ucredit` / `ocredit` | `pwquality.conf` | 至少要求多类字符参与 | 分别约束数字、大写、特殊字符的计分，细则见第 02 章 |
| `PASS_MAX_DAYS` | `login.defs` | 按组织策略设定，如 90 | 口令最长有效期，本地应急账号同样受此约束 |
| `PASS_MIN_DAYS` | `login.defs` | 大于 0 | 防止刚改口令又改回旧口令绕过历史检查 |

`chage -l` 用来核对单个账号的实际 aging 值，与 `login.defs` 的默认值不一致时以账号实际值为准并记录原因。细化的账号与 PAM 操作回 [第 02 章](02-users-sudo-pam.md)，本章只判读是否达标。

### 3.3 手工审计主线之二：文件权限与内核安全参数

第三域是关键文件权限，逐项核对下表，权限比期望更松的必须收紧并记录变更前状态：

| 文件 | 期望权限 | 核查命令 |
| --- | --- | --- |
| `/etc/passwd` | 644 | `stat -c "%a %n" /etc/passwd` |
| `/etc/shadow` | 640 或更严，属主 root、属组 shadow | `stat -c "%a %U %G %n" /etc/shadow` |
| `/etc/group` | 644 | `stat -c "%a %n" /etc/group` |
| `/etc/gshadow` | 640 或更严 | `stat -c "%a %n" /etc/gshadow` |
| `/etc/ssh/sshd_config` | 600 | `stat -c "%a %n" /etc/ssh/sshd_config` |
| 家目录 | 不对组与其他人开放写入 | `ls -ld /home/*` |

一次性核查并顺带找全盘可疑的可写配置：

```bash
stat -c "%a %n" /etc/passwd /etc/shadow /etc/group /etc/gshadow /etc/ssh/sshd_config
sudo find /etc -type f -perm -o+w -ls
```

第二条期望无输出；有输出逐个判断，确属配置错误才用 `chmod` 收紧，不要对业务数据目录批量改权限。

第四域是内核安全参数。注意与 [内核调优](../06-monitoring/04-kernel-tuning.md) 分工：那边为性能调优，本节只看安全项。先备份再逐项判读：

```bash
sudo cp -a /etc/sysctl.d /root/sysctl.d.bak.$(date +%F)
sysctl net.ipv4.ip_forward
sysctl net.ipv4.conf.all.accept_redirects
sysctl net.ipv4.conf.all.log_martians
sysctl kernel.randomize_va_space
sysctl fs.protected_hardlinks
```

| 参数 | 期望值 | 含义 |
| --- | --- | --- |
| `net.ipv4.ip_forward` | 非路由主机为 0 | 关转发防止本机被当跳板，容器与网关主机例外，须单独评估 |
| `net.ipv4.conf.all.accept_redirects` | 0 | 拒收 ICMP 重定向，防止路由被恶意改写 |
| `net.ipv4.conf.all.log_martians` | 1 | 记录源地址异常的数据包，给排障留痕 |
| `kernel.randomize_va_space` | 2 | 完整地址空间随机化，提高内存攻击成本 |
| `fs.protected_hardlinks` / `fs.protected_symlinks` | 1 | 限制硬链接与符号链接的滥用提权 |

需要修改时写入 `/etc/sysctl.d/60-cis-security.conf` 后执行 `sudo sysctl --system` 生效，并逐项复查；容器主机、网关主机的 `ip_forward` 等项与业务强相关，评估结论要写进变更记录，不要为了凑分关掉业务必需项。

### 3.4 手工审计主线之三：审计日志与自动更新

第五域是审计日志。auditd 负责记录安全相关事件，与普通系统日志互补。安装并启用后，先加少量关键规则，不要一上来导入整套大规则集：

```bash
sudo apt install -y auditd audispd-plugins
sudo systemctl enable --now auditd
sudo cp /etc/audit/rules.d/audit.rules /root/audit.rules.bak.$(date +%F)
sudo nano /etc/audit/rules.d/99-baseline.rules
```

规则示例（逐行）：

```text
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k scope
-w /etc/sudoers.d/ -p wa -k scope
-a always,exit -F arch=b64 -S sethostname -S setdomainname -k system-locale
```

`-w` 是监视文件，`wa` 表示监视写与属性变更，`-k` 是便于检索的标签；`-a` 行监视修改主机名的系统调用。写入后加载并验证：

```bash
sudo augenrules --load
sudo auditctl -l
sudo ausearch -k identity -i
```

期望 `auditctl -l` 能列出刚加的规则，`ausearch` 在有人改动被监视文件后能查到事件。规则的量要克制：规则过密会让日志暴涨且拖慢高频系统调用，先覆盖身份与权限文件，再按业务逐步加。

第六域是自动更新：安全更新应开启自动安装，完整配置与排坑见同部分 [第 07 章](07-unattended-upgrades.md)，本章只核查是否启用：

```bash
grep -E "Update-Package-Lists|Unattended-Upgrade" /etc/apt/apt.conf.d/20auto-upgrades
systemctl status apt-daily-upgrade.timer --no-pager
```

两项期望分别为 `1` 与 `active`，不符时到第 07 章按步骤启用，不要在本章临时拼凑配置。

### 3.5 基线落地的风险与回滚

把审计报告变成实际变更，按四步走。第一步，只出报告：审计结果归档，不改任何配置。第二步，逐项评估业务影响：禁用某服务前确认没有业务依赖它，改 SSH 参数前对照第 01 章确认登录通道不受影响，收紧内核参数前确认容器与转发类业务是否受牵连；评估结论写进变更单，哪怕只有一行。第三步，逐项实施：一次只改一项，改完立刻执行该项的验证命令并做一次业务冒烟，验证不过当场回退这一项，不要攒着一起查。第四步，留变更记录：改了什么文件、原值与新值、验证结果、回退文件位置，一项一行。

改坏了的通用恢复顺序如下，先稳住再定位。第一，用控制台或云厂商救援通道进系统，基线变更最怕的就是把远程入口改没，带外通道是第一退路。第二，用第 2 节的快照恢复出问题那一项的配置文件，只恢复相关文件，不要整目录覆盖回去把其他已验证的改动一起冲掉。第三，重启受影响的服务并复查其状态与日志。第四，用新终端验证登录与业务，全部恢复后再复盘是哪一项的评估漏了影响：

```bash
sudo cp /root/baseline-YYYY-MM-DD/login.defs /etc/login.defs
sudo systemctl restart ssh
sudo sshd -t
sudo systemctl status auditd --no-pager
```

日期占位替换为实际快照日期。涉及 SSH 的恢复必须保留一条已登录会话到验证结束，这与第 01 章的纪律一致。

## 四、效果验证与测试

完成一轮基线落地后，用同一套方法复查，得分与状态要能与修复前对照：

```bash
sudo usg audit cis_level1_server
ss -tulnp
systemctl list-unit-files --state=enabled
sysctl net.ipv4.ip_forward kernel.randomize_va_space
sudo auditctl -l
```

期望结果：USG 报告中不合规条目较修复前明确减少，剩余项每条都有评估结论（暂缓的写清原因与计划）；监听端口与启用服务清单与业务清单逐项对得上；内核安全项返回期望值；`auditctl -l` 列出基线规则。再做一次业务冒烟：SSH 新终端登录、核心业务各访问一次、自动更新定时器为 `active`。三类验证都过，这一轮基线才算落地完成，把报告与变更记录一并归档。

## 五、常见错误与排坑指南

场景一：整批执行修复后业务中断。典型表现是某个服务起不来或应用连不上数据库，翻变更记录又找不到改了哪几项。根因几乎都是跳过了逐项评估：一键修复把业务依赖的服务禁用了，或 sysctl 的转发被关掉时本机正承担容器转发。处置按 3.5 节的恢复顺序：先从快照恢复最近改动涉及的单个文件与服务状态，业务恢复后把这批变更拆开，一项一项重新评估再上。预防只有一条：`usg fix` 与生成的修复脚本都不许整批无人值守执行，脚本的价值是给人审阅，不是替人决策。

场景二：USG 命令不可用或 profile 不可选。报错多为包未安装、命令找不到，或审计时提示所选 profile 需要订阅。先分清是哪一类：

```bash
which usg
pro status
apt policy usg
```

命令不存在先按第 2 节重装；命令存在但 profile 受限，属于订阅边界的正常表现，不要尝试绕过授权，直接切到 3.2 至 3.4 节的手工主线，检查结论完全等价，只是耗时更长。把这次切换记录进审计报告，说明该机采用手工基线的原因。

场景三：改完 sysctl 后容器或转发类业务异常。现象是宿主机本身正常，但容器访问外网失败或端口转发失效，检查发现 `net.ipv4.ip_forward` 已被改成 0。这类主机本就不适用该条的通用期望值，正确做法是恢复该项并在基线记录中标注「业务必需，例外保留」及批准人，而不是反复在改与不改之间摇摆。恢复方法：

```bash
sudo nano /etc/sysctl.d/60-cis-security.conf
sudo sysctl --system
sysctl net.ipv4.ip_forward
```

删掉或修正冲突行后重新加载，并复测容器网络。基线允许有理由的例外，不允许无记录的偏离。

## 六、生产环境最佳实践与安全建议

第一，基线是节奏不是一次性工程：每月跑一次审计出报告，每季度做一次逐项复核，新上线服务器在交付前必须过一遍 Level 1。Level 2 只挑与本机角色相关的条目实施，每条都要有业务兼容结论。第二，所有偏离都要留痕：例外项写清原因、风险接受人、复查日期，到期自动回到待办里重新评估，无记录的偏离按不合规处理。第三，审计证据归档：每轮报告、变更记录、快照位置成套保存，这既是内部审计的材料，也是事故复盘时回答「当时是什么配置」的唯一可靠来源。第四，基线与日常运维衔接：改 SSH 看第 01 章、改防火墙看第 03 章、改防御看第 04 章、自动更新看第 07 章，本章只维护检查与判读，避免同一参数在多处出现互相矛盾的写法。第五，Ubuntu 26.04 的基线覆盖目前为「待核验」：升级到 26.04 的机器先在测试环境重跑本章全部检查命令，确认工具与期望值后再纳入正式审计周期。

## 附：安全检查清单（可勾选自评）

逐项自评，全部通过才算达到本机基线；不适用的项在后面注明原因，不要直接跳过。

账户与认证：

- [ ] 无多人共用的管理账号，一人一号可追溯
- [ ] 离职与转岗人员的账号已禁用并记录处理日期
- [ ] 本地应急管理员账号保留且最近一个季度演练过登录
- [ ] SSH 已禁用密码登录与 Root 远程登录（见第 01 章）
- [ ] 域成员机的登录范围已按组收紧（见第 05 章）
- [ ] 口令强度策略已由 PAM 强制，`PASS_MAX_DAYS` 已按策略设定
- [ ] `chage -l` 抽查关键账号的 aging 值与策略一致

网络与服务：

- [ ] `ss -tulnp` 的每个监听端口都能说明业务归属
- [ ] 已启用服务清单中无说不清用途的服务
- [ ] 防火墙默认拒绝入站且规则与开放端口一致（见第 03 章）
- [ ] Fail2ban 已启用并覆盖 SSH（见第 04 章）
- [ ] 内核转发与重定向参数与本机角色匹配且例外有记录
- [ ] 时间同步正常，时钟偏差在 1 分钟以内

服务与系统：

- [ ] AppArmor 处于启用状态，关键服务有生效的 profile
- [ ] auditd 已启用且身份文件监视规则已加载
- [ ] 自动安全更新已启用且定时器为 active（见第 07 章）
- [ ] 关键配置文件在变更前均有备份且备份可读
- [ ] 本轮审计报告与变更记录已归档

日志与监控：

- [ ] 认证日志有定期复查安排，异常来源有处置记录
- [ ] audit 日志检索验证过，能按标签查到测试事件
- [ ] 磁盘空间对日志增长留有余量，无日志撑满根分区的风险

权限与文件：

- [ ] `/etc/shadow` 与 `/etc/gshadow` 权限不松于 640
- [ ] `/etc` 下无全局可写文件（`find` 核查无异常输出）
- [ ] sudoers 授权按组或按命令收敛，无多余的全权放行
- [ ] 家目录不对其他用户开放写入
- [ ] 近一个周期内新增的例外项都有复查日期
