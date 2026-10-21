---
description: "把服务交给 systemd 托管只是第一步。unit 写得含糊，服务会在依赖未就绪时抢跑、崩溃后无限重启、资源失控时拖垮整机，出事时还没有人知道。"
---

# systemd 服务工程化与配置漂移检测

## 一、概述与使用场景

把服务交给 systemd 托管只是第一步。unit 写得含糊，服务会在依赖未就绪时抢跑、崩溃后无限重启、资源失控时拖垮整机，出事时还没有人知道。服务工程化就是把这些写进 unit 并逐项验证：依赖分清排序与拉起两个维度，重启带频率上限，资源限制给出明确数值，失败有通知出口。本章前半讲 unit 工程化，后半讲配置漂移：用 Ansible 加 Git 管配置后，如何持续检测线上与仓库期望的偏差，并形成发现、确认、处置、回滚的闭环。

典型场景有四类：自研服务上生产，交付一份经得起逐行评审的 unit；故障自愈与止损，假死靠看门狗识别，崩溃循环靠频率限制刹车，内存泄漏靠 MemoryMax 锁住影响面；多机一致性，同一份 unit 落在几十台机器上不走样；变更追责，线上与仓库对不上时能回答是合法变更没落码还是误改。

分工：第 2 章讲 systemd 的基本用法，本章讲生产标准的工程细节；第 3 章[Ansible 自动化配置管理](03-ansible.md)讲 Ansible 本身，本章后半只讲它在漂移检测中的用法。本章为文档核对级别：指令语义已按 systemd 官方手册核对。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS。Ubuntu 26.04 的 systemd 版本与个别默认值待核验。
- 权限：可使用 sudo 的账号，unit 的写入、重载与验证都需要 sudo。
- 对象：示例服务名为 example-api，运行用户为 apirunner，程序目录为 /opt/example-api，监听 127.0.0.1 的 8080 端口，健康检查路径为 /healthz。
- 前置：控制节点已按第 3 章装好 Ansible 并能免密登录被管理节点。

改任何 unit 或配置之前先备份，本章涉及文件的备份命令如下：

```bash
sudo cp /etc/systemd/system/example-api.service "/etc/systemd/system/example-api.service.bak-$(date +%F)" 2>/dev/null || echo "首次创建，无旧文件"
sudo cp /etc/example-api/env "/etc/example-api/env.bak-$(date +%F)" 2>/dev/null || echo "环境文件首次创建"
systemctl cat example-api 2>/dev/null || echo "服务尚未注册"
```

`systemctl cat` 打印 unit 内容与全部 drop-in，是改动前确认生效版本的标准动作。后半章漂移检测以仓库提交状态为基准，开始前先确认工作区干净。

## 三、手把手操作步骤

### 3.1 依赖语义：排序与依赖是两个维度

初学 unit 最常见的错误是把 After 当成依赖声明。依赖关系分两个正交维度：排序决定谁先谁后，依赖决定谁被拉起、谁失败时连带谁。两个维度必须分别声明，写了排序不等于声明了依赖。

| 指令 | 维度 | 含义 |
| --- | --- | --- | --- |
| After | 排序 | 本服务在所列 unit 之后启动，只管顺序，不管对方是否启动 |
| Before | 排序 | 本服务在所列 unit 之前启动，After 的反向写法 |
| Wants | 依赖 | 启动本服务时拉起所列 unit，对方失败不阻止本服务，弱依赖首选 |
| Requires | 依赖 | 同 Wants 拉起，对方停止或失败时本服务跟着停，强依赖 |
| Requisite | 依赖 | 要求所列 unit 已在运行，否则启动失败，不负责拉起只做校验 |
| Conflicts | 依赖 | 与所列 unit 互斥，启动一方停掉另一方 |

最典型的误用是只写 After 不写 Wants：写了 After=postgresql.service 就以为数据库会被拉起，实际上开机时没人负责启动它，本服务只是被排在一个不会启动的 unit 后面，启动后立刻因连不上数据库报错。正确写法是排序与依赖成对出现：

```ini
[Unit]
Description=示例业务服务
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service
```

逐行看：After 保证顺序上数据库与网络先行；Wants 拉起目标型 unit；postgresql 是硬依赖用 Requires 声明。判断 Wants 还是 Requires 的标准只有一条：对方没起来时本服务继续启动有没有意义，可降级的用 Wants，缺了必然报错的用 Requires。

### 3.2 启动顺序、失败传播与告警钩子

依赖之外还有两个传播类指令。PartOf 声明从属关系：写了 PartOf=example-api.service 的 unit 会在主服务停止或重启时跟着停止或重启，适合绑定日志转发等辅助进程。注意 PartOf 只传播停止与重启，不传播启动，拉起仍需 Wants 或 WantedBy。

OnFailure 是失败告警的标准钩子：unit 进入 failed 时自动启动指定的 unit。在主 unit 的 [Unit] 段写一行 OnFailure=notify-failure@%n.service，再把告警做成模板服务放在 /etc/systemd/system/notify-failure@.service：

```ini
[Unit]
Description=服务失败通知 %i

[Service]
Type=oneshot
ExecStart=/usr/local/bin/notify-failure.sh %i
```

模板名中的 @ 表示接受实例参数，%n 是触发失败的 unit 全名。脚本 /usr/local/bin/notify-failure.sh 完整内容如下，通道地址用 example.com 占位：

```bash
#!/bin/bash
set -euo pipefail
UNIT_NAME="${1:-unknown}"
MESSAGE="service ${UNIT_NAME} failed on $(hostname) at $(date '+%F %T')"
echo "${MESSAGE}" | systemd-cat -t failure-notify -p err
curl -fsS -X POST "https://alert.example.com/hook" -d "text=${MESSAGE}" || true
```

curl 失败用 `|| true` 兜住，避免通知通道抖动让通知服务也进入 failed。OnFailure 只在 unit 进入 failed 时触发，被干净 stop 的服务不触发，比脚本轮询更可靠。

### 3.3 重启策略与启动频率限制

Restart 决定进程退出后 systemd 的动作，常用取值对比如下，另有 on-abnormal 与 on-watchdog 两个变体，分别只在信号、超时等异常时与只在看门狗超时时重启：

| 取值 | 正常退出码 0 | 异常退出或被杀 | 适用场景 |
| --- | --- | --- | --- |
| no | 不重启 | 不重启 | 一次性任务，默认值 |
| on-success | 不重启 | 不重启 | 只认退出码的批处理外壳 |
| on-failure | 不重启 | 重启 | 常驻服务首选 |
| always | 重启 | 重启 | 守护进程，慎用 |

RestartSec 指定重启间隔，默认只有 100 毫秒，崩溃循环时会瞬间刷满日志，必须调大到秒级，例如 RestartSec=5s。频率刹车靠 StartLimitIntervalSec 定义统计窗口、StartLimitBurst 定义窗口内允许的启动次数，超限后 unit 进入 failed 并停止重试，正好接上 3.2 节的 OnFailure 通知。

!!! danger "StartLimit 指令放错段会被静默忽略"
    StartLimitIntervalSec 与 StartLimitBurst 属于 [Unit] 段。写进 [Service] 段是无法识别的键，会被忽略只在日志留一行提示，实际频率限制不存在，崩溃循环时才暴露。交付前用 `systemd-analyze verify` 检查并翻 journal 的 unknown key 提示。

### 3.4 看门狗：WatchdogSec 与 sd_notify

进程活着不等于服务健康：主线程死锁时进程还在，接口已经全挂。看门狗解决这类假死：服务进程必须周期性地通过 sd_notify 向 systemd 发送 WATCHDOG=1 心跳，间隔超过 WatchdogSec 的秒数，systemd 以 SIGABRT 终止进程，配合 Restart=on-failure 或 on-watchdog 完成重启。启用写法如下：

```ini
[Service]
Type=notify
ExecStart=/opt/example-api/server
WatchdogSec=30s
Restart=on-failure
```

Type=notify 表示启动完成以收到 READY=1 通知为准，systemd 就绪后才开始看门狗计时。应用侧心跳的最小实现如下：

```python
import os
import socket

def sd_notify(state):
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):
        addr = "\0" + addr[1:]
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    sock.connect(addr)
    sock.sendall(state.encode())
```

主循环里每 10 秒调用一次 sd_notify("WATCHDOG=1")，间隔取 WatchdogSec 的三分之一。心跳必须由真正干活的线程发出，单独起一个只发心跳的线程等于自欺欺人，死锁测不出来。

!!! warning "没有看门狗支持的应用不要硬开"
    WatchdogSec 一旦写上，不发心跳的应用会在每个周期被准时杀掉重启，等于主动制造周期性故障。先确认应用已实现 sd_notify 心跳再启用；老二进制不改代码时，用 3.7 节的外部健康检查替代。

### 3.5 资源限制：把影响面锁在单个服务内

资源限制基于 cgroup，写在 [Service] 段，逐项说明如下：

| 指令 | 含义 | 示例取值 |
| --- | --- | --- | --- |
| CPUQuota | CPU 上限，按单核百分比，150% 即最多用满 1.5 个核 | 150% |
| MemoryHigh | 内存软上限，超过后内核加压回收，变慢但不被杀 | 1G |
| MemoryMax | 内存硬上限，超过触发该 cgroup 内 OOM 终止，先软后硬留缓冲 | 1536M |
| TasksMax | 进程与线程总数上限，防 fork 炸弹与线程泄漏 | 256 |
| LimitNOFILE | 单进程可打开文件数，高并发服务的常见瓶颈项 | 65535 |

取值方法：先用 `systemd-cgtop` 观察一周峰值，再留三到五成余量。写进 unit 后验证：

```bash
sudo systemctl show example-api -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p TasksMax -p LimitNOFILE -p MemoryCurrent -p TasksCurrent
sudo systemd-cgtop -b -n 1 | grep example-api
```

`systemctl show` 读回实际加载的限制，MemoryCurrent 与 TasksCurrent 是当前用量，对照能发现写错单位或被 drop-in 覆盖。临时调整用 `sudo systemctl set-property example-api MemoryMax=2G`，它会生成 drop-in，验证完要么删掉，要么写回 unit，不要让临时值长期漂在外面，这正是后半章的漂移来源之一。

### 3.6 环境变量与凭据：写在 unit 里的边界

环境变量有两种写法。Environment 直接在 unit 里声明，适合环境名、端口等非敏感配置，`systemctl cat` 就能审计；EnvironmentFile 指向独立文件，适合多项配置集中管理。写法见 3.8 节完整 unit 的对应两行。边界必须划清。第一，unit 与环境文件都是明文，密码、令牌等秘密的管理规范见第 02 部分[秘密信息管理](../02-security/09-secrets-management.md)，不要把真秘密写进这两处；需要把凭据安全递给服务进程时用 LoadCredential 由 systemd 在启动时注入受保护目录，具体做法以该章为准。第二，环境文件权限收紧到仅 root 与服务用户可读：

```bash
sudo chown root:apirunner /etc/example-api/env
sudo chmod 640 /etc/example-api/env
```

第三，改 EnvironmentFile 不需要 daemon-reload，但要重启服务才重新读取；改 unit 本身必须先 daemon-reload，见第五节。

### 3.7 服务健康检查模式：自检脚本加失败通知

不支持看门狗的应用，用外部健康检查补位：自检脚本加 ExecStartPost 挂载加 OnFailure 通知。自检脚本 /usr/local/bin/example-api-healthcheck.sh 完整内容如下：

```bash
#!/bin/bash
set -euo pipefail
URL="http://127.0.0.1:8080/healthz"
for i in 1 2 3 4 5; do
  if curl -fsS "${URL}" > /dev/null; then
    exit 0
  fi
  sleep 2
done
echo "health check failed" >&2
exit 1
```

在 [Service] 段加上 ExecStartPost=/usr/local/bin/example-api-healthcheck.sh，主进程拉起后执行自检，五次全失败则非零退出，启动被判定失败，触发 Restart 与 OnFailure，形成闭环。它检查接口可用性，看门狗检查进程内部活性：能实现 sd_notify 时优先看门狗，自检作补充。ExecStartPost 阻塞启动判定，探测次数要克制，避免慢启动被误杀。

### 3.8 完整 unit 示例：逐行讲解

综合前面各节，给出 example-api 的完整 unit，路径为 /etc/systemd/system/example-api.service：

```ini
[Unit]
Description=示例业务服务 example-api
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service
StartLimitIntervalSec=300s
StartLimitBurst=5
OnFailure=notify-failure@%n.service

[Service]
Type=simple
User=apirunner
WorkingDirectory=/opt/example-api
Environment=APP_ENV=production
EnvironmentFile=/etc/example-api/env
ExecStart=/opt/example-api/server --config /etc/example-api/config.yaml
ExecStartPost=/usr/local/bin/example-api-healthcheck.sh
Restart=on-failure
RestartSec=5s
CPUQuota=150%
MemoryHigh=1G
MemoryMax=1536M
TasksMax=256
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

逐段讲解。[Unit] 段：After 与 Requires 成对声明数据库依赖，Wants 拉起网络目标；StartLimit 在 300 秒内最多启动 5 次，超限进入 failed；OnFailure 接到通知模板。[Service] 段：Type 用 simple，本例程序未实现 sd_notify 就绪通知，所以没用 notify 与看门狗，健康保障由 ExecStartPost 自检承担，是有意的取舍；五项资源限制全部封顶。[Install] 段的 WantedBy 决定开机自启。写入后加载并启动：

```bash
sudo systemd-analyze verify /etc/systemd/system/example-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now example-api
```

verify 先行是固定顺序：它能在不加载的情况下报出语法与段位错误，比启动失败再翻日志便宜得多。

### 3.9 配置漂移：为什么发生，用什么管

配置漂移指线上实际状态与期望状态的偏差。来源主要有三个：故障时手工改配置救火，改完没人写回仓库；热修复直接在机器上落地，忘了补提交；临时命令留下的持久痕迹，如 set-property 生成的 drop-in。单台漂移是隐患，几十台各自漂移就是事故前兆。

治理方法是把唯一事实源放在 Git 仓库，用 Ansible 下发。目录组织如下，仓库名为 ansible-infra：

```text
ansible-infra/
├── inventory.ini
├── site.yaml
├── group_vars/all.yaml
├── roles/base/
│   ├── tasks/main.yaml
│   ├── templates/
│   └── handlers/main.yaml
└── drift-reports/
```

templates 放 unit 与配置模板，tasks 负责下发并 notify 触发重载与重启，drift-reports 存检查输出。更完整的 GitOps 流水线见第 13 部分[IaC 与 GitOps 实践](../13-ai-ops/03-iac-gitops.md)，本章只管到用检查模式发现漂移这一层。幂等是前提：Playbook 描述期望状态，重复执行第二次应无变更；优先用 copy、template 等自带状态判断的模块，手工直改会在下一次检查中以 diff 现形。

### 3.10 漂移检测：定时 check 加差异报告

Ansible 检查模式只报告不落地，配合 --diff 输出文件级差异，就是现成的漂移探针：

```bash
cd ~/ansible-infra
ansible-playbook site.yaml --check --diff | tee "drift-reports/drift-$(date '+%F-%H%M').log"
```

输出判读：ok 表示与期望一致；标 changed 并附 diff 的任务就是漂移点，diff 里减号行是线上现状、加号行是仓库期望，先看清差异再谈处置；末尾 PLAY RECAP 里 changed 大于 0 即存在漂移。failed 优先处理，它表示连检查都执行不下去，此时结论不可信。

把检测定时化，形成报告留存。脚本 /usr/local/bin/drift-check.sh 完整内容如下，挂到 systemd timer 或 cron 每天凌晨执行一次：

```bash
#!/bin/bash
set -euo pipefail
cd /home/ubuntu/ansible-infra
REPORT="drift-reports/drift-$(date '+%F-%H%M').log"
ansible-playbook site.yaml --check --diff > "${REPORT}" 2>&1 || true
grep -E "changed=[1-9]" "${REPORT}" && echo "发现漂移，报告见 ${REPORT}" || echo "无漂移"
```

报告保留九十天，巡检先看最近一份的汇总行。发现漂移后分两步处置。第一步定性：对照变更记录与故障单，确认是不是合法变更。合法变更就落码：把线上现状整理进模板与变量、提交 Git，让仓库追上现实。第二步，确认为误改或来源不明的，才走重新下发：去掉 --check 正式执行把状态拉回期望，再跑一次 --check --diff 确认 changed 归零。

!!! danger "没定性就覆盖是最危险的处置"
    漂移里藏着大量救火时的正确改动：某个参数是凌晨为了止血调上去的，用仓库旧值直接覆盖等于把故障再放出来一次。重新下发前必须先定性，定性不了就找改动时段的值班人核实，核实不到按合法变更先落码保现状，再走评审决定去留。回滚走版本：处置错了用 `git revert` 撤销落码提交再重新执行，不要在机器上手改回来，那只会制造新漂移。

## 四、效果验证与测试

第一步验证 unit 合法且按预期加载：

```bash
sudo systemd-analyze verify /etc/systemd/system/example-api.service
systemctl is-enabled example-api
systemctl is-active example-api
```

期望 verify 无输出，is-enabled 返回 enabled，is-active 返回 active。

第二步验证依赖、重启与资源限制生效：

```bash
sudo systemctl show example-api -p Restart -p MemoryMax -p CPUQuotaPerSecUSec -p NRestarts
curl -fsS http://127.0.0.1:8080/healthz
```

期望 show 的限制值与 unit 一致，健康检查返回成功；在测试环境可控地结束一次主进程，应看到 systemd 按 RestartSec 拉起、NRestarts 加一。受控演练只在测试环境做。

第三步验证漂移检测闭环：`cd ~/ansible-infra` 后跑 `ansible-playbook site.yaml --check --diff`，期望 RECAP 里各机 changed 为 0。在测试节点故意改一行被管配置再跑一次，应看到该任务标 changed 并给出 diff，确认探针灵敏后恢复。

## 五、常见错误与排坑指南

### 5.1 改完 unit 不生效，status 提示文件已变更

场景：改了 ExecStart 或限制值，重启后行为没变，status 顶部出现 unit file changed on disk 警告。根因是 systemd 内存里还是旧版 unit，改文件后没有重载。修复方法：

```bash
sudo systemctl daemon-reload
sudo systemctl restart example-api
```

固定顺序：改 unit 必先 daemon-reload 再 restart。只改 EnvironmentFile 不需要 daemon-reload，但同样要 restart。

### 5.2 服务反复被杀，日志出现内存超限终止

场景：服务运行一段时间后被终止，重启后又重复，status 里出现被 OOM 终止的字样。根因多为 MemoryMax 低于实际需求，或内存泄漏涨过了硬上限。判读命令：

```bash
sudo systemctl show example-api -p MemoryCurrent -p MemoryPeak -p MemoryMax
journalctl -u example-api -n 50 --no-pager | grep -i -E "oom|memory"
```

判读方法：MemoryPeak 贴着 MemoryMax 且终止前用量单调爬升，是泄漏或上限过低的典型形态。用量随业务量增长是上限给小了，按 3.5 节重核峰值再上调；无业务也持续爬升是泄漏，上调只是续命，必须同时提单修应用。改后观察一个业务周期确认不再触顶。

### 5.3 check 模式结果与实际执行不一致

场景：检查显示无变更，正式执行却改了文件，或检查报告 changed 执行后仍不一致。根因有三类。一是 command 与 shell 模块天然非幂等：每次都真实执行并报告 changed，检查模式下又常被跳过，两边必然对不齐。二是 handler 在检查模式下不真正触发，依赖重启生效的变更看不到最终态。三是模板用了执行时刻才确定的变量，如时间戳或随机值，每次渲染都不同。修复：逐项把 command 与 shell 换成专用模块，必须保留的加 creates 或 changed_when 写明变更判定；检查模式是预演而非保证，关键变更仍要先灰度一台。

### 5.4 频率限制没起作用，崩溃循环刷满日志

场景：服务启动即崩溃，日志被重启记录刷满，StartLimit 写了却不限次。根因多半是 StartLimit 两项被写进了 [Service] 段而被忽略，按 3.3 节警示排查。修复方法：

```bash
systemctl cat example-api
sudo journalctl -b -u example-api --no-pager | grep -i "unknown" | head -n 5
```

把两行移到 [Unit] 段后 daemon-reload；已进入 failed 的服务先 `sudo systemctl reset-failed example-api` 清掉失败计数再启动。

### 5.5 给老应用硬开看门狗，服务被周期性杀掉

场景：给存量应用加上 WatchdogSec 后，服务每隔固定秒数被终止重启。根因是应用根本不发 sd_notify 心跳，被 systemd 按规则判死。修复：立刻摘掉 WatchdogSec 并 daemon-reload 与 restart 止抖，然后二选一，推动应用按 3.4 节实现心跳后再启用，或改用 3.7 节外部健康检查。不要靠调大 WatchdogSec 糊弄，那只是拉长抖动周期。

## 六、生产环境最佳实践与安全建议

第一，unit 走代码评审。unit 与业务代码同等对待：进 Git、过评审、由 Ansible 下发，评审清单至少包括依赖是否成对、Restart 是否带频率限制、资源限制是否有实测依据。

第二，限制值用数据说话。CPUQuota 与 MemoryMax 的测算记录写进提交说明，半年随业务量复核一次，避免限制值在服务长大后变成新故障源。

第三，失败必须有人知道。每个生产服务都要有 OnFailure 出口，通知通道定期受控演练确认能收到。

第四，漂移报告纳入值班动作。每日报告汇总行进巡检清单，changed 非零当天定性；每月统计漂移来源，手工救火类占比高说明落码流程太重，要简化流程。

第五，回滚永远走版本。下发错了用 git revert 加重新执行恢复，全程留记录。禁止登录机器手改回滚，手改的结果无法复现。

!!! tip "工程化的标志是可复核"
    一份 unit 是否达到生产标准，看任意一行能不能被追问出依据：依赖为什么是 Requires、内存为什么是这个数、上次漂移是怎么处置的。三问都能答上，才算到位。
