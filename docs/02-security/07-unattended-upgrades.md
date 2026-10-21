---
description: "安全补丁拖着不装，等于把已知漏洞的利用窗口一直开着。本章把 Ubuntu 的 unattended-upgrades 配到可控状态：只自动装安全更新、黑名单与重启窗口可控、出问题能定位也能暂停。"
---

# 自动安全更新：unattended-upgrades

## 一、概述与使用场景

服务器的安全补丁有个残酷的特点：一旦厂商发布修复，漏洞细节也随之公开，攻击者会立刻拿着补丁反推漏洞去扫还没打补丁的机器。手动 `apt upgrade` 的问题不是难，而是靠人记着：几十台机器、忙起来连着几周没人登录，安全更新就一直拖着。unattended-upgrades 的价值就是把这件「必须按时做、内容又相对标准」的事自动化：系统按定时器自己检查更新源，只安装符合策略的包，装完留日志，需要重启时按你定的窗口处理。

风险同样要先讲清，无人值守不等于无人负责。自动更新的代价有三类：一是更新本身引入回归，某个库升级后业务行为变化；二是自动重启的时机不对，正赶上业务高峰或有人在机器上工作；三是配置失控，该装的被黑名单或锁定挡住，不该自动装的却装了。本章的目标就是把这三类风险都变成可配置、可验证、可暂停的状态：来源白名单只放行安全更新，敏感包进黑名单人工处理，重启只在低峰窗口且策略明确，日志与模拟运行让你随时能回答「它到底装了什么、准备装什么」。

与手动 `apt` 的分工建议如下：安全更新交给自动通道，越快越好；功能版本升级、大版本跳跃、内核与驱动等高影响项继续走人工评估与维护窗口；被 `hold` 锁定的包自动通道不会动，解锁与否由人决定。Livepatch 解决的是内核热补丁这一小块，不能替代本章，两者的关系在 3.4 节说清。本章结论与 [第 06 章](06-cis-baseline.md) 的自动更新核查项互相对应：那一章查是否启用，本章负责配好。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，Ubuntu 26.04 的包行为与定时器命名标记为「待核验」，未实测前不要把本章结论写进 26.04 的运维规范。操作需要带 `sudo` 的管理账号，开始前先确认本机没有正在进行的包管理操作，也没有处于半配置状态的包，否则自动更新会在错误的地基上运行：

```bash
sudo dpkg --audit
sudo apt update
apt list --upgradable
```

期望结果：`dpkg --audit` 无输出，表示没有半装的包；`apt list --upgradable` 能正常列出待更新清单。有半配置包先用 `sudo dpkg --configure -a` 与 `sudo apt install -f` 修好再继续。

改任何配置前先备份，这是本章所有回滚的前提：

```bash
sudo mkdir -p /root/apt-backup-$(date +%F)
sudo cp -a /etc/apt/apt.conf.d/50unattended-upgrades /root/apt-backup-$(date +%F)/
sudo cp -a /etc/apt/apt.conf.d/20auto-upgrades /root/apt-backup-$(date +%F)/
ls -l /root/apt-backup-$(date +%F)/
```

两个文件尚不存在也没关系，安装完成后会生成，届时再补备份。日期目录的好处是多次变更各留一份，不要覆盖旧备份。

## 三、手把手操作步骤

### 3.1 安装与启用

安装主包与电源管理依赖，后者让工具能正确判断电源状态，服务器上装着无害且可避免个别警告：

```bash
sudo apt install -y unattended-upgrades powermgmt-base
sudo dpkg-reconfigure -plow unattended-upgrades
```

`dpkg-reconfigure` 会弹出交互询问是否自动下载并安装稳定版更新，选择「Yes」后它会写入启用配置。随后确认定时器在跑：

```bash
systemctl status apt-daily.timer apt-daily-upgrade.timer --no-pager
systemctl list-timers | grep apt
```

期望两个 timer 都为 `active`，`list-timers` 能看到下一次触发时间。若 `apt-daily-upgrade.timer` 不存在或未启用，执行 `sudo systemctl enable --now apt-daily-upgrade.timer` 再复查；仍异常时先看 `sudo journalctl -u apt-daily-upgrade.timer -n 50 --no-pager`，不要反复重装包。

### 3.2 核心配置逐行讲解：更新来源与黑名单

主配置文件是 `/etc/apt/apt.conf.d/50unattended-upgrades`，先备份（第 2 节已备）再编辑：

```bash
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

最重要的是来源白名单段 `Unattended-Upgrade::Allowed-Origins`，它决定哪些来源的包允许自动安装。逐行讲解：

```text
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}";
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};
```

| 配置行 | 含义 | 取舍 |
| --- | --- | --- |
| `"${distro_id}:${distro_codename}"` | 发行版主仓库本体 | 变量在运行时展开为如 `Ubuntu:jammy` 一类取值；这一行放行的是常规更新，要求只自动装安全更新时建议注释掉，只留下面带 `-security` 的行 |
| `"${distro_id}:${distro_codename}-security"` | 安全更新仓库 | 本章的核心行，必须保留，这一行才是「自动打安全补丁」的本体 |
| `ESMApps` / `ESM` 两行 | Ubuntu Pro 的扩展安全维护来源 | 未订阅 Pro 的机器上这两行不会有实际包进来，保留无害；订阅状态以官方当前说明为准 |

原则一句话：自动通道只放行名字带 `security` 的来源，其余来源留给人工。改完这一段，其余参数在同一文件里继续配。黑名单段写法如下：

```text
Unattended-Upgrade::Package-Blacklist {
        "linux-image-generic";
        "postgresql.*";
};
```

黑名单按包名正则匹配，列进来的包永远不会被自动更新，适合数据库、内核这类要人工挑窗口升级的组件。示例中的写法只是格式演示，请按本机实际包名填写；黑名单不是偷懒清单，列进去的每个包都必须有人负责跟踪它的人工升级节奏，否则安全更新会被永久挡在门外。

### 3.3 核心配置逐行讲解：重启、通知与清理

继续在同一文件里核对以下参数，逐行讲解：

| 配置行 | 含义 | 建议 |
| --- | --- | --- |
| `Unattended-Upgrade::Automatic-Reboot "false";` | 更新后需要重启时是否自动重启 | 默认关闭是对的；生产机如开启，必须配合下一行的时间窗 |
| `Unattended-Upgrade::Automatic-Reboot-Time "03:30";` | 自动重启的时间点 | 设为业务最低峰的时刻，与备份、批处理任务错开 |
| `Unattended-Upgrade::Automatic-Reboot-WithUsers "false";` | 有用户登录时是否仍重启 | 设为 `false` 更稳妥，有人在线就推迟；无人值守的专用机可评估设为 `true` |
| `Unattended-Upgrade::Mail "root";` | 通知邮件收件人 | 填实际运维邮箱或保持 `root` 别名转发，前提是本机邮件通道可用，见 5.3 节 |
| `Unattended-Upgrade::MailReport "on-change";` | 通知触发条件 | `on-change` 只在真有更新动作时发信，噪声最低；排障期可临时改 `always` |
| `Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";` | 自动清理旧内核 | 建议开启，防止 `/boot` 被旧内核撑满；系统仍会保留当前与前一个内核 |
| `Unattended-Upgrade::Remove-Unused-Dependencies "true";` | 自动清理不再需要的依赖 | 建议开启，保持系统整洁；清理对象以包管理器的依赖判定为准 |

!!! danger "自动重启开启前先想清这台机器的角色"
    数据库主机、集群成员、正在跑长任务的计算节点，不要直接开启自动重启：一次计划外的重启可能触发主从切换、任务重跑甚至数据一致性问题。这类机器的正确做法是 `Automatic-Reboot "false"` 保持关闭，靠通知与人工窗口完成重启，并把这条纪律写进该机的运维说明，不要等事故后补。

再看启用文件 `/etc/apt/apt.conf.d/20auto-upgrades`，它管周期节奏，逐行讲解：

```bash
sudo nano /etc/apt/apt.conf.d/20auto-upgrades
```

```text
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
```

`Update-Package-Lists "1"` 表示每天刷新一次软件包列表，`0` 为关闭；`Unattended-Upgrade "1"` 表示每天执行一次自动升级，这是总开关；`Download-Upgradeable-Packages "1"` 提前下载好待装的包，缩短真正安装时的等待；`AutocleanInterval "7"` 每 7 天清理一次本地包缓存。数值单位是天，写 `0` 即禁用对应项，第 4 节暂停自动更新用的就是这一招。

两处配置都改完后不要急着等定时器，先用第 4 节的模拟运行验证配置可被正确解析。

### 3.4 与 Livepatch 的关系

Livepatch 是 Canonical 的内核热补丁服务：在不重启的前提下给运行中的内核打安全补丁，解决的是「内核漏洞已修复但机器迟迟不能重启」这个老大难。它能替代的是内核补丁对重启的依赖，不能替代本章：用户态的库、服务与应用包（例如 OpenSSL、sudo、业务运行时）不在 Livepatch 范围内，仍然要靠 unattended-upgrades 及时更新；反过来，只开自动更新不开 Livepatch，内核补丁装好了也要等重启才生效。两者是互补关系，生产机的理想状态是两个都开，重启频率因此可以大幅降低。

开启方式指向官方：Livepatch 需要 Ubuntu Pro 或 Canonical 账号关联，以 Ubuntu 官方页面当前的说明与本机 `pro status` 的输出为准，本书不写死订阅与额度政策。核查命令：

```bash
pro status
canonical-livepatch status
```

未启用时按官方指引完成关联后再开启，不要从第三方脚本一键开启这类系统级服务。

## 四、效果验证与测试

验证分三步。第一步，模拟运行：以 dry-run 加 debug 方式跑一次，它只演算不真装，是看清「下一次真跑会装什么」的标准方法：

```bash
sudo unattended-upgrade --dry-run --debug 2>&1 | head -n 100
```

期望输出里能看到它识别出的可自动升级包列表与被黑名单、被锁定挡住的包及原因；出现配置解析报错时按报错行号回 50 号文件修正，不要带着解析错误等定时器真跑。

第二步，看日志判读真实执行记录：

```bash
ls -l /var/log/unattended-upgrades/
sudo tail -n 50 /var/log/unattended-upgrades/unattended-upgrades.log
grep unattended /var/log/dpkg.log | tail -n 20
```

期望日志中有最近一次运行的起止时间、实际安装的包与结果；`dpkg.log` 里对应时间段的记录应与之吻合。对照着看的好处是：日志说装了但 dpkg 没有记录，或反过来，都说明中间出了岔子，要当异常处理。

第三步，确认重启需求的可见性：更新后若需要重启，系统会留下标记文件，值班检查时应包含这一项：

```bash
ls -l /var/run/reboot-required
cat /var/run/reboot-required.pkgs
```

文件存在即表示有待重启生效的更新，后一个文件列出触发原因的包。自动重启关闭的机器靠这一项决定何时排人工重启窗口。

暂停自动更新的方法（预期管理的一部分，先学会关再放心开）：把总开关置 0 并复查，不要卸载软件包，卸载会把配置与日志一起带走，恢复时反而麻烦：

```bash
sudo cp /etc/apt/apt.conf.d/20auto-upgrades /root/20auto-upgrades.bak.$(date +%F)
sudo sed -i 's/APT::Periodic::Unattended-Upgrade "1";/APT::Periodic::Unattended-Upgrade "0";/' /etc/apt/apt.conf.d/20auto-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
```

恢复时把 `0` 改回 `1` 即可。暂停期间安全更新改为人工执行并留记录，暂停必须有明确的恢复时间，不要无限期挂着。

回滚与如实说明：自动更新装出的有问题版本，处置顺序是先定位再处理。用日志锁定问题包与版本：

```bash
grep -A2 -B2 "问题包名" /var/log/dpkg.log
apt history
zcat /var/log/apt/history.log*.gz | grep -A3 "问题包名"
```

定位后可选的动作按风险从低到高：先看新版本是否有后续修复版，直接升级到修复版是最优解；其次是把问题包临时加入黑名单或 `sudo apt-mark hold 包名` 锁定，阻止它被再次自动处理，同时排人工处理窗口。包降级（`sudo apt install 包名=旧版本号`）只在旧版本仍在仓库里且依赖允许时才可行，还可能触发连串依赖降级，风险高，不是万能回滚手段，生产执行前必须在测试机验证并留完整记录。本机没有快照或备份系统时，能退回的程度取决于仓库是否还保留旧包，这一点要在启用自动更新前就对业务方讲明，不要事后承诺退不回去的东西。

## 五、常见错误与排坑指南

场景一：开了自动重启却没按预期重启。先分清是「没触发」还是「被推迟」，按顺序查三处：

```bash
ls -l /var/run/reboot-required
grep -E "Automatic-Reboot" /etc/apt/apt.conf.d/50unattended-upgrades
who
sudo tail -n 100 /var/log/unattended-upgrades/unattended-upgrades.log
```

判读：没有 `reboot-required` 标记，说明本轮更新根本不需要重启，不是故障；标记存在但配置里 `Automatic-Reboot` 为 `false`，是按配置行事；标记存在、配置已开启，但 `Automatic-Reboot-WithUsers` 为 `false` 且 `who` 显示有人登录未退出，重启会被推迟，这也是预期行为。日志里通常会写明推迟原因，先读日志再改配置。

场景二：更新被 held 包或黑名单卡住。表现是日志里反复出现某些包被跳过，或 `apt list --upgradable` 里安全更新长期不动。先查锁定与黑名单，再查依赖：

```bash
apt-mark showhold
grep -A5 "Package-Blacklist" /etc/apt/apt.conf.d/50unattended-upgrades
sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i -E "hold|blacklist|skipp"
```

被 `hold` 的包自动通道不会碰，这是设计而非故障：确需更新时由人工 `sudo apt-mark unhold 包名` 解锁、手动升级验证后再决定是否重新锁定。黑名单命中的按 3.2 节的纪律处理：有人负责就保留，没有人负责的黑名单条目等于永久不打补丁，必须在复查时清掉或落实责任人。另外注意，某个包因依赖关系被连带跳过时，不要为了让它装上就放宽整段白名单，先把依赖链看懂再单项处理。

场景三：邮件通知一直收不到。先验证本机发信通道，再看配置，不要上来就改收件人：

```bash
grep -E "Mail" /etc/apt/apt.conf.d/50unattended-upgrades
echo "uu test" | mail -s "unattended test" root
sudo tail -n 30 /var/log/mail.log
systemctl status postfix --no-pager
```

常见根因依次是：本机根本没装或没运行本地邮件服务、`MailReport` 设为 `on-change` 而这段时间确实没有更新动作（属正常无信）、收件人写的是外部邮箱但本机没有可用的外发通道。`on-change` 模式下长期无信先用第 4 节模拟运行确认到底有没有待装更新，再判断通知是否失灵；需要持续确认通道活着时，可临时改 `always` 观察一两个周期，确认后改回。

## 六、生产环境最佳实践与安全建议

第一，分级启用：先在测试机与非核心机器上开一到两周，观察日志、重启行为与业务影响，稳定后再推核心机器；核心机器的自动重启默认保持关闭，靠通知加人工窗口。第二，黑名单与 hold 清单纳入月度复查：每一项都要有责任人与下次评估时间，过期未评估的按风险项上报，不要让临时措施变成永久豁免。第三，更新窗口与备份窗口错开：自动重启时间、备份时间、大批处理时间三者不要重叠，避免重启正好打断备份这类低级连环事故。第四，值班巡检固定三项：`reboot-required` 标记、最近一周的 unattended-upgrades 日志有无报错、held 包清单有无新增，把它们写进巡检表而不是靠记忆。第五，与第 06 章的基线审计衔接：每轮基线复查都核对本章配置是否仍与批准版本一致，发现被临时改动又没恢复的，先恢复再追原因。第六，Ubuntu 26.04 的自动更新行为目前为「待核验」，升级机器按本章在测试环境重走一遍模拟运行与日志判读后再启用，不要默认行为与 24.04 完全一致。
