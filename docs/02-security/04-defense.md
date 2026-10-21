# 系统防御与入侵检测（Fail2ban / AppArmor / AIDE）

## 一、概述与使用场景

前三章做的是静态防线：门锁换好、权限切细、围墙砌好。本章做的是动态防线，回答三个静态配置回答不了的问题。第一，有人正在持续试探 SSH 与网站登录口时，系统能不能自己把这个来源封掉，而不是等管理员看日志时才发现，这件事交给 Fail2ban，它盯着日志按规则自动封禁。第二，某个对外服务真的被攻破时，能不能把攻击者困在这个进程里，不让他顺手读遍整台机器的文件，这件事交给 AppArmor，它按程序画像限制每个进程能碰的资源。第三，系统文件已经被悄悄改动时，有没有一本账能对出来哪里变了，这件事交给 AIDE，它给关键文件建完整性基线，日后逐项比对。

三者的分工可以这样记：Fail2ban 管正在发生的试探，AppArmor 管失陷之后的扩散范围，AIDE 管事后发现与取证。缺少任何一层，防线都有明显短板：没有 Fail2ban，日志会被暴力试探刷满，真实攻击淹没在噪声里；没有 AppArmor，一个 Web 服务的漏洞就可能等于整机沦陷；没有 AIDE，后门程序替换掉系统命令后，管理员用被篡改的工具自查，只会得到一切正常的假象。本章把三者都配到可运行、可验证的状态，并与前三章的配置衔接成完整基线。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，操作需要 `sudo` 权限。开始前确认前三章的状态：SSH 已改为密钥登录并监听 2222 端口，防火墙已启用且默认拒绝，系统日志服务正常运行。安装本章需要的软件包：

```bash
sudo apt update
sudo apt install -y fail2ban apparmor apparmor-utils aide aide-common
systemctl status rsyslog --no-pager
ls /var/log/auth.log
```

逐项说明：`fail2ban` 是自动封禁服务，它依赖日志文件或 systemd 日志来判断失败次数；`apparmor` 是内核安全模块本体，Ubuntu 默认已启用，这里补齐 `apparmor-utils` 提供的管理命令；`aide` 与 `aide-common` 是文件完整性检查工具及公共配置。`rsyslog` 应处于运行状态，`/var/log/auth.log` 应存在且持续有新内容，Fail2ban 的文件后端靠读它工作；若日志不存在，先修复日志服务再继续，否则 Fail2ban 装好也不会封人。

!!! note "Ubuntu 24.04 的日志与 Fail2ban 后端差异"
    Ubuntu 24.04 上部分服务默认更依赖 systemd 日志。Fail2ban 在两个版本上都可用，但要确认 jail 使用的后端与日志来源一致：读文件的 jail 用 `backend = auto` 或 `pyinotify`，读 systemd 日志的场景在 jail 里显式写 `backend = systemd` 并配套 `journalmatch` 条件。本章 SSH jail 使用文件后端配合 `/var/log/auth.log`，在 22.04 与 24.04 上均可工作，24.04 若发现日志文件无更新，改用 systemd 后端并按本章验证方法重新测试。

## 三、手把手操作步骤

### 3.1 Fail2ban 配置 SSH 自动封禁

Fail2ban 的配置分两层：`/etc/fail2ban/jail.conf` 是软件自带主配置，升级会被覆盖，永远不要直接改它；自定义内容写进 `/etc/fail2ban/jail.local`，它优先级更高且升级保留。改任何配置前先备份：

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.conf.bak
sudo ls -l /etc/fail2ban/
sudo nano /etc/fail2ban/jail.local
```

写入以下完整内容：

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
banaction = nftables-multiport
backend = auto
ignoreip = 127.0.0.1/8 198.51.100.0/24

[sshd]
enabled = true
port = 2222
logpath = /var/log/auth.log
maxretry = 5
bantime = 86400
findtime = 600
```

参数逐行讲解，时间单位均为秒：

| 参数 | 含义 | 本章取值说明 |
| --- | --- | --- |
| `bantime` | 触发后封禁时长 | 全局默认 3600 即 1 小时，sshd 单独加长到 86400 即 1 天，SSH 是主入口，惩罚更重 |
| `findtime` | 统计失败的时间窗口 | 600 秒内累计失败才计数，窗口外的零散输错不误伤正常用户 |
| `maxretry` | 窗口内允许的最大失败次数 | 达到 5 次立即封禁，与第 02 章 PAM 的失败锁定口径保持一致 |
| `banaction` | 封禁动作走哪套防火墙 | 用 nftables 的多端口封禁动作，与第 03 章的 nftables 路线一致，用 UFW 路线的机器可改为 `ufw` |
| `ignoreip` | 永不封禁的来源白名单 | 必须包含回环与自己的管理网段，把自己关在门外是 Fail2ban 最常见的自伤事故 |
| `port` | 该 jail 守护的服务端口 | 必须写第 01 章改后的 2222，写成默认的 ssh 或 22 会导致封禁封错端口，形同没配 |

保存后检查配置、启动服务并查看 jail 状态：

```bash
sudo fail2ban-client -t
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

`fail2ban-client -t` 输出配置正确才启动服务；`status sshd` 会显示当前被封的来源列表与累计封禁数，是后面验证环节的主要观察点。手动封禁与解封的命令也要提前学会，误封自己人时靠它解围：

```bash
sudo fail2ban-client set sshd banip 192.0.2.25
sudo fail2ban-client set sshd unbanip 192.0.2.25
```

其中 `192.0.2.25` 是文档示例地址，实际操作时换成日志里真实出现的来源地址或被误封的管理地址。

!!! warning "ignoreip 漏写管理网段等于给自己埋雷"
    运维人员输错几次动态口令或密钥口令就会触发封禁，若管理网段不在 `ignoreip` 里，整段办公出口会被封一整天。上线 Fail2ban 前先把当前管理来源确认清楚写进白名单，再在同一网段内做触发测试，确认白名单内来源失败多次也不会被封。

### 3.2 AppArmor 隔离关键服务

先看 AppArmor 的总体状态与各进程的受控情况：

```bash
sudo aa-status
sudo systemctl status apparmor --no-pager
ls /etc/apparmor.d/
```

`aa-status` 的输出会分三类列出画像：强制模式、投诉模式与未受控进程。两种工作模式的区别必须先分清：

| 模式 | 行为 | 适用阶段 |
| --- | --- | --- |
| enforce 强制模式 | 超出画像的访问直接拒绝并记日志 | 生产环境正式防护 |
| complain 投诉模式 | 超出画像的访问放行但记日志 | 新上线画像的观察期，用真实流量磨合规则 |

把常用服务的画像切到强制模式，并验证状态变化：

```bash
sudo apt install -y apparmor-profiles
sudo aa-enforce /usr/sbin/sshd
sudo aa-enforce /usr/sbin/nginx
sudo aa-status
```

若某个服务还没有现成画像，先用投诉模式跑一周收集日志，再根据日志补规则后转强制，命令是把 `aa-enforce` 换成 `aa-complain` 并跟上画像名。生成与更新画像的辅助工具是 `aa-genprof` 与 `aa-logprof`，前者陪着你启动一次服务并逐项问答生成画像，后者读投诉模式日志把新出现的需求整理成待确认的规则项。日常排障看日志用这一条，它能直接筛出被 AppArmor 拦截的记录：

```bash
sudo grep DENIED /var/log/audit/audit.log
sudo journalctl -k --since today --no-pager | grep apparmor
```

改任何画像文件前照例先备份，画像都在 `/etc/apparmor.d/` 下以程序路径命名：

```bash
sudo cp /etc/apparmor.d/usr.sbin.sshd /etc/apparmor.d/usr.sbin.sshd.bak
sudo aa-disable /usr/sbin/sshd
sudo aa-enforce /usr/sbin/sshd
```

`aa-disable` 用于某个画像把业务卡死时的紧急停用，停用后该进程回到无隔离状态，属于临时处置，问题修好要第一时间重新切回强制模式并记录原因。

### 3.3 AIDE 文件完整性基线

AIDE 的工作分两步：先给当前干净状态拍一张全量快照作为基线数据库，之后定期拿现状与基线比对，报告新增、删除与被修改的文件。安装后先备份默认配置，再确认它监控的范围：

```bash
sudo cp /etc/aide/aide.conf /etc/aide/aide.conf.bak
sudo grep -E "^/" /etc/aide/aide.conf
ls /etc/aide/aide.conf.d/
```

默认配置已经覆盖 `/bin`、`/sbin`、`/etc`、`/usr` 等关键目录并按文件类型组合了哈希、权限、属主等检查项，入门阶段保持默认即可，重点是把基线建起来并保护好。初始化基线，数据量大时这一步会跑几分钟，属于正常现象：

```bash
sudo aideinit
sudo ls -lh /var/lib/aide/
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
```

`aideinit` 生成的新库文件名带 `.new` 后缀，确认生成成功后复制为正式基线名 `aide.db`，后续检查默认读这份基线。基线文件本身就是攻击者最想删的东西，必须再拷一份到只读介质或另一台机器留存：

```bash
sudo sha256sum /var/lib/aide/aide.db
sudo cp /var/lib/aide/aide.db /root/aide.db.baseline.copy
sudo aide --check
```

`aide --check` 执行一次完整比对，刚建完基线时应报告没有差异；日常检查与系统更新后的基线刷新命令如下，更新系统包之后文件变化是合法的，核对报告确认都是包管理带来的变化后，用更新命令把新状态写成新基线：

```bash
sudo aide --check
sudo aide --update
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
```

配合计划任务可以每天自动检查并把报告发到日志，编辑 root 的计划任务加入一行，每天凌晨三点半执行检查并记录结果：

```bash
sudo crontab -e
```

加入这一行完整内容：

```text
30 3 * * * /usr/bin/aide --check | /usr/bin/logger -t aide-check
```

!!! tip "AIDE 报警先核对变更记录再下结论"
    AIDE 报告有差异不等于被入侵，系统更新、配置变更、日志轮转都会产生合法差异。正确处置是拿着报告逐项对照最近的更新与变更记录，对得上的逐项销账，对不上的单个文件，尤其是被替换的系统命令与新增的计划任务、可执行文件，才按入侵事件处理。

## 四、效果验证与测试

第一，验证 Fail2ban 真的会封人。在白名单之外的网络环境下，对 SSH 连续制造 5 次失败登录，然后回服务器查看封禁列表：

```bash
sudo fail2ban-client status sshd
sudo grep "Ban" /var/log/fail2ban.log
sudo nft list ruleset
```

期望在状态输出的被封列表里看到测试来源地址，日志里有对应的封禁记录，第 03 章的防火墙规则集里能看到 Fail2ban 写入的封禁集合，三处对上才算端到端生效。测试结束后用 3.1 节的解封命令把测试地址放出来。

第二，验证 AppArmor 状态与拦截日志：

```bash
sudo aa-status
ps auxZ
```

期望输出中 `sshd` 与 `nginx` 出现在强制模式名单里，`ps auxZ` 最后一列能看到进程对应的画像标签，说明进程确实跑在画像约束之下，而不是只装了工具没生效。

第三，验证 AIDE 能抓到篡改。新建一个测试文件并修改一个受监控目录下的测试文件，再执行检查：

```bash
sudo touch /etc/aide-test-file
sudo aide --check
sudo rm /etc/aide-test-file
```

期望检查报告中列出新增的 `/etc/aide-test-file`，证明监控范围与比对流程都在工作。验证完删除测试文件即可，下一次检查的差异报告会包含这次删除动作，这属于已知的验证痕迹，记录在案即可。

## 五、常见错误与排坑指南

场景一：Fail2ban 服务在跑，但从不封禁。状态里失败计数一直是零。最常见原因是 jail 里的 `port` 还写着默认的 ssh 或 22，而服务实际监听 2222，封禁动作封错对象；其次是 `logpath` 指向的日志文件里根本没有 SSH 失败记录，或后端选错。逐项排查：

```bash
sudo fail2ban-client get sshd logpath
sudo tail -n 100 /var/log/auth.log | grep sshd
sudo fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf
```

最后一条会把日志逐行套用过滤规则并统计命中数，命中为零说明过滤规则与日志格式对不上，按它的输出定位是日志路径错还是规则错。

场景二：AppArmor 切强制模式后服务起不来。报错表现是服务启动失败，内核日志里出现成片的 `apparmor="DENIED"` 记录，指出某文件访问被拒。原因是画像没有覆盖该服务实际要读写的路径，常见于改过数据目录或日志目录的部署。修复方法是先切回投诉模式让业务恢复，补规则后再转强制：

```bash
sudo aa-complain /usr/sbin/nginx
sudo aa-logprof
sudo aa-enforce /usr/sbin/nginx
sudo aa-status
```

`aa-logprof` 会把投诉期日志里的被拦访问逐条列出让你确认放行，确认的原则是只放行与业务路径直接相关的项，来路不明的访问宁可保持拒绝。

场景三：AIDE 每天报告大量差异，看不出真问题。原因多为把频繁变化的目录也纳入了全量哈希检查，或系统自动更新后没有刷新基线，报告被合法变化淹没。处理分两步：先按 3.3 节流程核对并刷新一次基线，再把明显多变的非关键路径从检查范围里降级为只查权限与属主。调整仍在 `/etc/aide/aide.conf` 与 `/etc/aide/aide.conf.d/` 中完成，改前备份，改后重新初始化基线并做一次零差异验证，确认报告回到干净状态，之后再出现差异才值得逐项追。

## 六、生产环境最佳实践与安全建议

第一，封禁参数要与自己的运维习惯匹配。`bantime` 不是越长越好，出口地址多人共用的环境里误封的影响面很大，推荐失败封禁加白名单双管齐下，并把封禁事件纳入日常日志巡检，封禁量突然放大往往意味着正在被集中扫描。第二，AppArmor 坚持先投诉后强制的上线节奏，每个新服务都留观察期，用日志把画像磨合到零误拦再转强制，直接强制新画像卡死业务，反而会逼得运维把整个模块关掉，因小失大。第三，AIDE 基线要跟变更走，系统更新日就是基线刷新日，两件事绑定执行，并保留上一版基线至少一个月，出事时新旧两版对照能看出变化发生在哪次更新之间。第四，三套工具的告警要汇到一处看，Fail2ban 的封禁日志、AppArmor 的拒绝日志、AIDE 的差异报告都进系统日志，巡检时按时间线一起看，单个工具的异常可能无害，同一时间窗内三处同时异常，就是按入侵事件处置的信号。第五，动态防线不能替代静态基线，本章所有工具都建立在前三章已经收紧的入口、权限与网络边界之上，顺序颠倒时，自动封禁封不完开放的弱口令入口，完整性检查也会被高权限攻击者连基线一起删掉。把四章当作一个整体维护，这台服务器的安全状态才经得起长期运行与人员更替。
