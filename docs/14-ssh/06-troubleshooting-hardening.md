---
description: "SSH 连不上时按网络、监听、认证、权限四层逐层定位：服务端与客户端工具箱、八类高频故障的完整排坑流程，以及改配置不翻车的标准流程与日志审计方法。"
---

# SSH 故障排查与安全加固要点

## 一、概述与使用场景

SSH 是服务器的正门，进不去时最忌讳乱试：反复改配置、重装服务、删密钥，往往把小问题滚成「彻底锁死在门外」。本章给一套可复用的方法：先分层定位故障在哪一层，再只在那一层动手，每步都有命令、输出判读和修复后验证。

排查按四层推进，自下而上、不要跳层：

1. **网络可达**：客户端到服务器的 IP 与端口在网络上是否通。这一层不通，后面全是白查。
2. **sshd 在监听**：服务器上 SSH 服务是否在跑、是否监听在你连的那个端口上。
3. **认证通过**：网络与服务都通之后，看账号、密码或密钥是否被服务端接受。
4. **权限与配置正确**：认证环节的细节，如密钥文件权限、目录属主、`AllowUsers` 等配置限制。

绝大多数「连不上」都落在这四层里。定位最快的办法是同时看两端：客户端用 `ssh -vvv` 看断在哪一步，服务端看日志说为什么拒绝，两端对上，根因基本就锁定了。

本章后半部分是安全加固要点清单：只列「应该有哪些项、为什么、去哪看参数全表」，具体的参数全表与双因素认证配置在 [SSH 安全加固](../02-security/01-ssh-hardening.md)，本章不复制，避免两处口径不一致。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 24.04 LTS，不宣称在 26.04 上验证。示例服务器 `192.0.2.10` 为文档示例段地址，示例用户为 `ubuntu`、`opsadmin`，请替换为真实信息。开始前确认：

- 你至少还有一条能进服务器的通道：当前未断开的 SSH 会话、云厂商网页控制台（VNC/串口）或物理接触。**排查与改配置期间，现有会话不要关**——它是改坏配置后唯一的回滚通道。
- 客户端与服务端命令分清在哪台机器执行：本章每条命令都标注了位置，`ssh -vvv` 在客户端跑，`sshd -t`、`journalctl` 在服务端跑。
- 防火墙分清两道关：本机 UFW 与云厂商安全组，任何一道拦住都表现为不通，本机放行见 [防火墙](../02-security/03-firewall.md)；通用分层网络诊断见 [网络诊断](../08-troubleshooting/02-network-diagnosis.md)。

!!! warning "先留后路，再动手"
    凡是要改 `sshd_config`、重启 SSH 服务、改防火墙的操作，先确保旧会话还活着，并把原配置备份好。没有后路就动手，是 SSH 排障里代价最高的坏习惯。

## 三、手把手操作步骤

### 3.1 服务端工具箱：先把状态看全

以下命令在**服务器**上执行（经现有会话或控制台进入）：

```bash
sudo sshd -t
sudo systemctl status ssh --no-pager
sudo ss -lntp | grep ssh
sudo journalctl -u ssh -n 50 --no-pager
```

逐条判读：

- `sudo sshd -t`：校验 sshd 配置语法与关键文件。**无任何输出就是通过**；有输出会指明哪个文件哪一行出错，这是改完配置后第一个要跑的命令，也是服务起不来时定位最快的命令。
- `systemctl status ssh`：看 `Active:` 一行。`active (running)` 为正常；`failed` 时结合下面日志看失败原因。Ubuntu 上服务名是 `ssh`，不是某些教程写的 `sshd`。
- `sudo ss -lntp`：看 sshd 实际监听的地址与端口，例如 `0.0.0.0:22`。你以为改成了 2222、这里却还显示 22，说明配置没生效或改错了文件，后面连不上就是必然。
- `journalctl -u ssh` 与 `/var/log/auth.log`：两种都能看认证日志，`journalctl -u ssh -f` 可实时跟踪，下一次连接时同步观察，日志会直接写出拒绝原因（如 `Failed password`、`bad ownership or modes`）。

### 3.2 客户端工具箱：ssh -vvv 看断在哪一步

在**客户端**执行三级调试：

```bash
ssh -vvv -p 22 ubuntu@192.0.2.10
```

输出很长，只需抓关键行判读：

| 关键行 | 含义 | 下一步 |
|---|---|---|
| `Connection timed out`，卡在 `Connecting to ...` | 网络层不通，未到达服务器 | 查第 5.1 节：可达性、防火墙、安全组 |
| `Connection refused` | 到达主机但端口无人监听或被明确拒绝 | 查第 5.2 节：服务与端口 |
| `Connection established` 后出现 `kex_exchange_identification` 失败 | 连上了但对端不是正常 sshd，或被中间设备拦截 | 核对端口连的是否为 SSH 服务 |
| `Authentications that can continue: publickey` | 服务端只允许列出的方法，密码不在其中 | 你还在输密码时，服务端已关密码登录 |
| `Offering public key: ...` 后紧跟 `Server accepts key` | 密钥被接受 | 认证没问题，往后看会话或权限问题 |
| `Offering public key` 后被跳过、无 `accepts` | 密钥未被接受 | 查第 5.3、5.4 节：服务端日志与权限 |
| 最后出现 `Permission denied (publickey,password)` | 所有认证方法均被拒 | 回服务端日志看同一时刻的拒绝原因 |

!!! tip "两端对照法"
    客户端发起一次 `-vvv` 连接的同时，在服务端开着 `sudo journalctl -u ssh -f`。客户端说「被拒」的那一秒，服务端日志通常就写着具体原因一行，比在客户端猜十遍都快。

## 四、效果验证与测试

任何修复完成后，不要以「命令没报错」当作修好，按下面三步验收：

```bash
# 服务端：配置合法且服务在监听
sudo sshd -t && sudo ss -lntp | grep ssh
# 客户端：新开一个终端做干净验证（不要复用旧会话判断）
ssh -o ConnectTimeout=5 ubuntu@192.0.2.10 "hostname && whoami"
```

```text
server-01
ubuntu
```

判读：`sshd -t` 无输出、监听端口正确；新终端能执行远程命令并返回预期的主机名与用户名，才算真正修复。必须用**新会话**验证：旧会话本来就连着，它正常不能证明新连接没问题。修复涉及改端口或改认证方式时，把新端口、新方式完整走一遍再收工。

日志侧再补一刀：服务端 `grep "Accepted" /var/log/auth.log | tail -3` 应能看到刚才新登录的成功记录，时间与来源 IP 都是你的。两端都对上，排障才算闭环。

## 五、常见错误与排坑指南

### 5.1 连接超时：ssh: connect to host ... port 22: Connection timed out

- **现象**：命令长时间无响应，最后超时；`ssh -vvv` 卡在 `Connecting to`。
- **检查命令**：客户端执行 `ping 192.0.2.10`（注意：部分服务器禁 ping，无回复不等于不通，仅作参考）；`nc -vz 192.0.2.10 22` 测端口可达；服务端（经控制台）执行 `sudo ufw status` 与 `systemctl is-active ssh`。
- **输出判读**：`nc` 显示 `timed out` 或一直挂起，多为包被丢弃——防火墙或安全组未放行；`ping` 通但端口超时，更指向端口维度的拦截。
- **根因**：UFW 未放行 SSH 端口、云安全组未放行、服务器 IP 或端口写错、或 sshd 根本没启动。
- **修复**：本机缺放行时 `sudo ufw allow 22/tcp`（改过端口则放行新端口）；云服务器同步去控制台安全组放行同一端口；服务未启时 `sudo systemctl start ssh`。
- **验证**：客户端 `nc -vz` 显示 `succeeded`，再按第四节做新会话验证。

### 5.2 连接被拒绝：Connection refused

- **现象**：立即报错 `Connection refused`，不等待超时。
- **检查命令**：服务端 `systemctl status ssh` 与 `sudo ss -lntp | grep ssh`。
- **输出判读**：无 sshd 监听行，说明服务没跑或没监听在你连的端口；监听的是其他端口（如 2222），说明你连错了端口。
- **根因**：sshd 未启动/已崩溃、改了 `Port` 后客户端仍连旧端口、或连错了主机。
- **修复**：服务没跑先 `sudo sshd -t` 看配置是否合法，合法再 `sudo systemctl restart ssh`；端口不一致就统一：要么客户端加 `-p 2222`，要么按标准流程把端口改回来。
- **验证**：`ss` 监听与客户端 `-p` 端口一致，新会话登录成功。

### 5.3 认证被拒：Permission denied (publickey,password)

- **现象**：能连上、能输密码或送密钥，但最终被拒。
- **检查命令**：服务端实时看日志再让客户端重试一次：`sudo journalctl -u ssh -f`；或事后查 `grep -i "failed\|refused\|invalid" /var/log/auth.log | tail -20`。
- **输出判读**：日志出现 `Failed password for ubuntu` 是密码不对或该用户不允许密码登录；`Invalid user xxx` 是用户名不存在；完全没有你的尝试记录，说明连的可能不是这台机器。客户端 `-vvv` 里 `Authentications that can continue: publickey` 表示密码登录已被服务端关闭，你输对密码也会被拒。
- **根因**：密码错误、服务端已禁用密码登录而你还没配好密钥、用户名写错、或用户被 `AllowUsers`/`DenyUsers` 排除。
- **修复**：按日志对症处理：补装公钥后改用密钥登录（顺序见 6 节清单与 [密钥与 Agent](03-keys-agent.md)）；用户名与白名单逐字核对后修正；密码问题通过控制台登录后 `sudo passwd ubuntu` 重置。
- **验证**：新会话用预期方式（密钥优先）登录成功，日志出现对应 `Accepted publickey` 或 `Accepted password`。

### 5.4 密钥权限错误：UNPROTECTED PRIVATE KEY FILE 与服务端拒绝读密钥

- **现象**：客户端报 `WARNING: UNPROTECTED PRIVATE KEY FILE!` 并忽略该私钥；或密钥送了却不被接受，服务端日志出现 `Authentication refused: bad ownership or modes for directory`。
- **检查命令**：客户端 `ls -l ~/.ssh/`；服务端 `ls -ld ~/.ssh && ls -l ~/.ssh/authorized_keys && sudo sshd -T | grep -i strictmodes`。
- **输出判读**：私钥权限不是 `600`、`.ssh` 目录不是 `700`、`authorized_keys` 不是 `600` 或属主不是登录用户本人，任意一条不满足都会被拒绝。`StrictModes yes`（默认）时服务端严格执行这些检查。
- **根因**：复制密钥后没改权限、家目录权限过松、用 root 帮普通用户建了 `.ssh` 导致属主错误。
- **修复**：客户端 `chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519`；服务端 `sudo chown -R ubuntu:ubuntu /home/ubuntu/.ssh && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`（把 `ubuntu` 与路径换成出问题的用户）。不要用关掉 `StrictModes` 来绕过，那是把检查机制拆掉。
- **验证**：重新连接，`-vvv` 出现 `Server accepts key` 并登录成功。

### 5.5 主机密钥冲突：Host key verification failed

- **现象**：报 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!` 并拒绝连接。
- **检查命令**：先核对，不要直接删。向服务器管理员或云控制台确认该机是否重装系统、重建实例或更换过 IP；有带外通道时在服务器执行 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 取得官方指纹，与客户端报错里给出的指纹逐字比对。
- **输出判读**：指纹与官方一致，且确有重装/重建记录，属于正当变更；指纹对不上又无人能解释变更，按疑似中间人处理，停止连接并上报。
- **根因**：服务器重装、实例重建、IP 被另一台机器复用，都会让本机保存的旧主机密钥与新机不一致；极少数情况才是真正的中间人攻击。
- **修复**：确认正当变更后才在客户端执行 `ssh-keygen -R 192.0.2.10` 删除旧记录，重新连接并在首次提示时再次核对新指纹再接受。
- **验证**：重新连接不再告警，`~/.ssh/known_hosts` 已更新为新指纹，登录正常。

!!! danger "不要把删 known_hosts 当成万能修复"
    这条警告是 SSH 唯一的主机身份防线。没完成「确认变更来源 + 核对指纹」两步就执行 `ssh-keygen -R`，等于主动拆掉防线；在不可信网络里这样做，可能把账号与数据直接送给冒充者。

### 5.6 连接慢、输完密码卡很久

- **现象**：连接要等十几秒甚至更久才出现密码提示或登录成功。
- **检查命令**：客户端计时复现 `time ssh ubuntu@192.0.2.10 true`；分别试 `ssh -o GSSAPIAuthentication=no ubuntu@192.0.2.10` 是否变快；服务端查 `sudo sshd -T | grep -i usedns`。
- **输出判读**：关掉 GSSAPI 后明显变快，问题在客户端侧的 GSSAPI 协商超时；服务端 `UseDNS yes` 时，sshd 会对来源 IP 做反向解析，解析慢或 DNS 不可达会直接拖慢每次登录。
- **根因**：服务端 `UseDNS` 反查耗时、客户端 GSSAPI 尝试超时，两者是最常见的两个慢点，与网速无关。
- **修复**：服务端按标准流程（见第六节）在加固配置中设 `UseDNS no` 后 reload；客户端在 `~/.ssh/config` 对应主机加 `GSSAPIAuthentication no`。改一项测一项，不要同时乱改。
- **验证**：重复计时命令，登录耗时回到秒级且连续多次稳定。

### 5.7 sshd 启动失败、改完配置服务起不来

- **现象**：`systemctl status ssh` 显示 `failed`，或 reload/restart 后会话全断。
- **检查命令**：`sudo sshd -t` 看具体报错行；`sudo journalctl -u ssh -n 50` 看启动日志；确认端口占用 `sudo ss -lntp | grep :22`。
- **输出判读**：`sshd -t` 会直接指出文件与行号，如 `Bad configuration option` 或缺失主机密钥；另一个高频坑是配置包含顺序：主配置顶部 `Include /etc/ssh/sshd_config.d/*.conf` 会让该目录文件**先**被读取，而 sshd 多数参数以先读到的值为准，你在主文件末尾改的值可能被 `.d` 里的旧值覆盖，表现就是「改了没生效」甚至冲突。
- **根因**：语法写错、参数拼写错误、`.d` 目录残留旧配置覆盖主文件、或目标端口已被其他进程占用。
- **修复**：按 `sshd -t` 指出的行逐一修正；理清生效值用 `sudo sshd -T | grep -i <参数名>` 看最终生效结果，而不是只看某个文件写了什么；端口被占时先处理占用进程，不要盲目换端口掩盖问题。
- **验证**：`sshd -t` 无输出、`sshd -T` 的生效值符合预期、`systemctl restart ssh` 后新会话可登录。

### 5.8 改完配置把自己锁在门外

- **现象**：改了端口、关了密码登录或加了白名单后，新连接全部失败。
- **检查命令**：不要关旧会话。在旧会话里执行 `sudo sshd -T | grep -iE "port|passwordauthentication|allowusers"` 核对实际生效值，与你的预期逐项对。
- **输出判读**：生效值与预期不一致，多为改错文件、被 `.d` 覆盖（见 5.7）或防火墙/安全组没同步新端口。
- **根因**：改配置时没备份、没校验、没留旧会话，三件套缺一都可能走到这一步。
- **修复（保留会话回滚）**：在旧会话里还原备份 `sudo cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config`（若改的是 `.d` 文件，还原对应文件或其备份目录），随后 `sudo sshd -t` 校验通过再 `sudo systemctl reload ssh`。全程旧会话保持不断开。
- **验证**：保持旧会话的同时，另开新终端按旧方式登录成功，确认已回到改动前状态，再重新按第六节标准流程谨慎重做修改。

## 六、生产环境最佳实践与安全建议

### 6.1 加固清单（增量项，参数全表不在此复制）

以下每一项都应在 [SSH 安全加固](../02-security/01-ssh-hardening.md) 的参数全表与操作细节下完成，本章只给清单与顺序：

- **先密钥、后关密码（顺序不可颠倒）**：先按 [密钥与 Agent](03-keys-agent.md) 把密钥登录完整验证通过，再禁用密码登录与 root 直接登录。顺序反了等于亲手锁死自己，救援只能靠控制台。
- **AllowUsers 白名单**：只允许确需登录的用户（如 `ubuntu opsadmin`），其余账号一律挡在认证之前。
- **MaxAuthTries 收紧**：降低单次连接的尝试次数（如设为 3），抬高爆破成本。
- **LoginGraceTime 收紧**：缩短未完成认证连接的存活时间（如 30 秒），减少半开连接堆积。
- **Fail2ban 联动**：对反复失败的来源自动封禁，配置与调优见 [纵深防御](../02-security/04-defense.md)。
- **防火墙与安全组同步**：改端口时本机 UFW 与云安全组同步放行新端口、回收旧端口，见 [防火墙](../02-security/03-firewall.md)。
- **双因素认证（MFA）**：高价值服务器在密钥之外再加一层，做法在加固章内，本章不重复。

### 6.2 改 sshd_config 的标准流程（每次都照此执行）

```bash
# 1. 备份（主文件与 .d 目录一起备）
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo cp -a /etc/ssh/sshd_config.d /etc/ssh/sshd_config.d.bak
# 2. 修改（示例：在加固文件中写入一项）
sudo nano /etc/ssh/sshd_config.d/60-hardening.conf
# 3. 校验：无输出才继续，有报错先修，不要带着错误 reload
sudo sshd -t
# 4. 平滑重载（不断开已有连接）
sudo systemctl reload ssh
```

第 5 步是新开终端做新会话验证（按第四节方法），**验证通过之前，旧会话绝不关闭**。验证失败就用旧会话按 5.8 还原 `.bak`、`sshd -t`、reload 回滚，再重来。这套「备份 → 校验 → reload → 新会话验证 → 旧会话兜底」流程是本章最重要的结论。

### 6.3 日志审计与异常连接定位

日常巡检与发现爆破时，在服务端这样查：

```bash
grep "Failed password" /var/log/auth.log | tail -20
grep "Accepted" /var/log/auth.log | tail -20
sudo lastb | head
last | head
sudo journalctl -u ssh --since "2026-10-21 00:00" --until "2026-10-21 06:00" --no-pager
```

判读顺序：先看 `Failed` 的来源 IP 与目标用户名是否集中（同一来源短时间大量失败即典型爆破）；再在 `Accepted` 里查同一来源、同一时间段有没有成功记录——**「大量失败但零成功」与「失败后出现一次成功」是完全不同的事件等级**，后者要按已入侵处理：立即改口令与密钥、排查新增账号与异常进程。`last` 看成功登录历史，`lastb` 看失败尝试，两者结合能还原攻击时间线；`journalctl` 的 `--since/--until` 适合按事发时间窗切片。发现爆破先确认是否得手、来源是谁，封禁交给 Fail2ban 自动执行即可。

回滚/收尾提醒：本章所有修复若涉及临时放行端口、临时开密码登录救急，问题解决后必须回收这些临时放宽项（删除临时 UFW 规则、把配置改回加固值、`sshd -t` 后 reload 并用新会话复验），并把本次故障的现象、根因与最终生效配置记入运维记录，避免下次在同一处重复踩坑。
