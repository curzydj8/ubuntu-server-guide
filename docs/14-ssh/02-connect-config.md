---
description: "SSH 连接与客户端配置：基础连接参数、主机指纹核对与 known_hosts 机制、多服务器 ssh config 全字段配置与连接复用、会话管理，以及 Linux、macOS、Windows、Android 客户端差异。"
---

# SSH 连接与客户端配置

## 一、概述与使用场景

第 01 章把服务端装好之后，每天真正与你打交道的是客户端：一条 `ssh` 命令敲下去，连哪台机器、用哪个用户、走哪个端口、拿哪把私钥，全由客户端决定。机器一多，把 IP、端口、用户名拼成长命令立刻失控：参数记混、私钥选错、指纹提示随手按 yes、网络一抖连接就假死。本章把客户端这一侧系统化：讲透基础连接与常用参数，把最易被忽视的安全环节——主机指纹核对——讲到可操作，再用一整节拆解 `~/.ssh/config` 把多台服务器收敛成别名，最后补上会话管理、四大平台差异与连接保活。读完应达到：连常用服务器只需 `ssh 别名`；指纹变更先核实再处理；卡死会话能立刻脱身。密钥如何生成、托管与轮换见下一章 [03 密钥、Agent 与轮换](03-keys-agent.md)，本章只讲连接时如何选用。

## 二、环境准备与前置条件

- 客户端已安装 OpenSSH 客户端：Linux 与 macOS 一般自带，执行 `ssh -V` 能看到版本号即可（形如 `OpenSSH_9.6p1`）；Windows 与 Android 的获取方式见 3.6 节。
- 目标服务器已按第 01 章装好 openssh-server 并在监听，你手里有它的地址、端口、用户名与认证方式（密码或私钥路径）。
- 本章示例沿用全站约定：服务器地址 192.0.2.10 与 198.51.100.23，初始账号 `ubuntu`，日常管理账号 `opsadmin`，IPv6 示例地址 2001:db8::10。请替换为真实值。
- 客户端的 `~/.ssh` 目录存在且权限正确：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

权限不对是后面一连串「莫名其妙连不上」的源头之一：目录权限过松时，部分客户端会拒绝使用其中的私钥与配置。

## 三、手把手操作步骤

### 3.1 基础连接与参数逐个讲解

最基础的连接只需要用户名与地址：

```bash
ssh ubuntu@192.0.2.10
```

`ubuntu` 是服务器上的账号，`@` 后是服务器地址（IP、域名或后文的别名）。首次连接会先出现指纹确认（见 3.2 节），通过后才进入密码或密钥认证。常用参数逐个说明：

```bash
ssh -p 2222 -i ~/.ssh/id_ed25519_ubuntu -l opsadmin 192.0.2.10
```

- `-p 2222`：指定端口。服务端改过端口时必须带，默认 22 可省略。注意 `scp` 的端口参数是大写 `-P`，不要混用。
- `-i ~/.ssh/id_ed25519_ubuntu`：指定私钥文件（identity file）。客户端默认只会尝试 `~/.ssh/` 下几个固定名字（`id_ed25519`、`id_ecdsa`、`id_rsa` 等），自命名私钥必须用 `-i` 显式指定，或写进配置文件（见 3.4 节）。
- `-l opsadmin`：指定登录用户名，等价于 `opsadmin@192.0.2.10` 里的前缀写法，二选一即可，不要同时写出两个不同名字。
- `-v`：调试输出。连不上时加它，客户端会逐行打印连接、协商、认证的全过程；`-vv`、`-vvv` 更详细。排障时先加 `-v` 看卡在哪一步，详细判读方法见第 06 章。
- `-o 选项=值`：临时覆盖任意配置项，例如 `-o StrictHostKeyChecking=accept-new`。`-o` 适合一次性场景，长期生效的选项应写进配置文件。

!!! tip "先记四个参数就够日常用了"
    日常连接大多只用到 `-p`（端口）、`-i`（私钥）、`-v`（排障）和用户名@地址，其余参数在 3.4 节用别名封装掉。

### 3.2 首次连接：指纹提示的判读与正确核对

第一次连接一台服务器时会出现类似提示：

```text
The authenticity of host '192.0.2.10 (192.0.2.10)' can't be established.
ED25519 key fingerprint is SHA256:uNiVztksCsDhcc0u9CHoGiyV/ZL+vnLkYe/hQoIo9M.
This key was not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

逐句解读：第一句说客户端无法确认这台主机身份（本地无任何记录）；第二句给出服务端主机公钥指纹（Ed25519，SHA256 摘要）；最后一句问是否继续。输入 `yes` 等于把该公钥写入本地 `~/.ssh/known_hosts` 并信任它，以后每次连接自动比对。**关键问题是：按 yes 之前，你凭什么相信这串指纹属于你的服务器？** 连接若被劫持到冒充机器，你会看到一模一样的提示、只是值不同——盲目按 yes 等于把中间人请进门。

正确的核对方法是通过独立可信通道拿到服务器自己的指纹再逐字比对。最可靠的来源是服务器本机或云厂商控制台，在服务器上执行：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

输出示例：

```text
256 SHA256:uNiVztksCsDhcc0u9CHoGiyV/ZL+vnLkYe/hQoIo9M root@ubuntu-server (ED25519)
```

中间的 SHA256 串与连接提示里的串完全一致，才能输 `yes`。核对要比对整串，不要只看头尾；云服务器可在首次登录前通过控制台 VNC/网页终端执行这条命令拿到基准值，记入资产清单，重装、迁移时有据可查。

另一个常用工具是 `ssh-keyscan`，它能主动抓取服务器的主机公钥：

```bash
ssh-keyscan -t ed25519 192.0.2.10 >> ~/.ssh/known_hosts
```

它适合批量预置 known_hosts（如一批新机器初始化时免逐台确认）。局限必须清楚：keyscan 拿到的同样是「网络上那台机器自称的公钥」，未经独立验证——路径已被劫持时，你预置的就是冒充者的指纹。所以它只适合可信网络（内网、刚交付的云内网环境），公网首次接入仍以控制台核对为准。

### 3.3 known_hosts 机制与指纹变更警告

`~/.ssh/known_hosts` 是纯文本文件，每行记录一台主机的地址与公钥；新版 OpenSSH 可能对主机名做哈希存储（`HashKnownHosts`），看似乱码属正常。每次连接客户端都把服务端出示的公钥与记录比对，一致放行，不一致立即中断并报警。

当服务器重装系统、更换主机密钥或 IP 被别的机器接管时，你会看到醒目的警告：

```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
```

含义是：这台主机现在的指纹与你记录里的对不上，可能是中间人攻击，也可能是服务器合法地换了密钥。安全处理流程固定为三步，顺序不能乱：

1. **先核实**：通过云控制台或带外通道登录服务器，重跑 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`，确认新指纹确实来自这台机器，并问清变更原因（重装？迁移？没人动过却变了，就要按入侵事件处理）。
2. **再删除旧记录**：确认无误后，在客户端删除该主机的旧指纹：

```bash
ssh-keygen -R 192.0.2.10
```

改过端口的主机记录要连端口一起删：`ssh-keygen -R "[192.0.2.10]:2222"`。该命令会同时生成一份 `known_hosts.old` 备份。

3. **重新连接并核对**：再次 `ssh`，出现首次连接提示时按 3.2 节核对新指纹后再输 `yes`。

!!! danger "指纹变更时禁止图省事"
    遇到 REMOTE HOST IDENTIFICATION HAS CHANGED 警告，绝不要不核实就删记录重连，更不要用 `-o StrictHostKeyChecking=no` 把检查整个关掉来绕过——这等于永久放弃中间人防护。警告出现且无人能解释变更原因时，按被入侵处理：停用该连接，走控制台排查。私钥丢失、被锁在门外等更严重的情况，恢复流程见 [第 08 部分 · 灾难恢复与系统迁移](../08-troubleshooting/05-disaster-recovery-migration.md)。

### 3.4 ~/.ssh/config 全字段讲解与多服务器示例

机器超过两三台，就应该把连接参数收进客户端配置文件 `~/.ssh/config`，用别名代替长命令。先保证文件权限正确：

```bash
touch ~/.ssh/config
chmod 600 ~/.ssh/config
```

下面是一份覆盖常见场景的完整示例，后文逐行讲解：

```ini
# 全局默认：对所有主机生效
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    IdentitiesOnly yes

# 生产服务器：经跳板机到达，改过端口
Host prod-web
    HostName 198.51.100.23
    User opsadmin
    Port 2222
    IdentityFile ~/.ssh/id_ed25519_ubuntu
    ProxyJump bastion

# 跳板机本身
Host bastion
    HostName 192.0.2.10
    User opsadmin
    Port 22
    IdentityFile ~/.ssh/id_ed25519_ubuntu

# 内网测试机：开连接复用，长会话不重复认证
Host lab
    HostName 2001:db8::10
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519_lab
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
```

逐字段讲解：

- `Host prod-web`：别名，连接时用 `ssh prod-web`。文件里可写任意多个 `Host` 块；`Host *` 是对所有主机生效的兜底块。匹配规则是「先读到的值优先」，越具体的配置写得越靠前，全局块放文件末尾才不会覆盖具体设置（上例为演示字段把全局写在前面，实际使用请把 `Host *` 移到尾部）。
- `HostName`：真实地址，可写 IP、域名或 IPv6 地址（直接写地址，不加方括号）。`User` 是登录用户名，`Port` 等价于 `-p`，`IdentityFile` 是该主机用的私钥路径。
- `IdentitiesOnly yes`：只用配置里指定的私钥，不让客户端把 Agent 里其他钥匙挨个往服务器试——试太多可能触发服务端认证次数上限（`MaxAuthTries`），表现为钥匙对却被拒绝。
- `ServerAliveInterval 60` / `ServerAliveCountMax 3`：客户端每 60 秒发一个保活探测，连续 3 次无回应才断开，细节见 3.7 节。
- `ProxyJump bastion`：连接时先自动经 `bastion` 跳转，链路细节见第 05 章。
- `ControlMaster auto` + `ControlPath ~/.ssh/cm-%r@%h:%p` + `ControlPersist 10m`：连接复用三件套。首条连接在 `ControlPath` 处留一个控制套接字，后续会话复用已认证通道，不再重复握手；`ControlPersist 10m` 表示最后会话退出后主连接再保留 10 分钟。脚本里频繁对同一台机器跑短命令时提速明显。

!!! warning "ControlPath 目录权限与多路复用的取舍"
    控制套接字放在 `~/.ssh` 下并依赖其 700 权限保护，不要改到 `/tmp` 等公共目录——能访问该套接字的人可以直接借用你的已认证连接免密登录。复用虽快，但调试连接问题时应先关掉它（临时加 `-o ControlMaster=no`），否则旧通道会掩盖新参数的效果。

### 3.5 用别名连接，及退出与会话管理

配置写好后，连接简化为：

```bash
ssh prod-web
ssh lab
```

退出会话：`exit`、`logout`、按 `Ctrl+D` 三者等效。网络中断、终端假死时用转义序列强制断开：在行首（先按一次回车）依次按 `~` 和 `.`，即 `~.`，客户端立即终止连接；`~?` 列出全部转义序列，`~^Z`（`~` 后 Ctrl+Z）把 ssh 本身挂起。查看服务器上当前会话在服务端执行 `who`（账号、终端、来源 IP）或 `w`（另含正在执行的命令与空闲时间）；发现陌生来源 IP 在线，按安全事件处理并回看 [第 02 部分 · SSH 安全加固](../02-security/01-ssh-hardening.md) 的日志审计部分。

### 3.6 各平台客户端差异

同一套 OpenSSH 命令在四个平台上大体通用，差异集中在安装方式、私钥存放与 Agent 集成上：

- **Linux**：原生 OpenSSH，与本章描述完全一致。ssh-agent 一般由桌面环境或 systemd 用户会话自动拉起，`echo $SSH_AUTH_SOCK` 有值即可用。
- **macOS**：系统自带 OpenSSH，命令一致。差异在 Agent 与钥匙串集成：`ssh-add --apple-use-keychain ~/.ssh/id_ed25519_ubuntu` 可把私钥口令存进钥匙串，重启后不用重输；config 里再给对应主机加 `UseKeychain yes` 更完整。
- **Windows**：PowerShell 与 Windows Terminal 自带 OpenSSH 客户端（老系统在「设置 → 应用 → 可选功能」里添加），命令与 config 语法通用。差异有三：`.ssh` 目录在 `C:\Users\<用户名>\.ssh`；没有 chmod，私钥权限靠文件 ACL 控制，过宽会被拒绝使用，需在文件属性的安全选项里收紧为仅本人可读；config 里 `IdentityFile` 建议写完整 Windows 路径。
- **Android**：Termux 里 `pkg install openssh` 后得到与 Linux 基本一致的命令行客户端，密钥放 Termux 私有目录，不要与 `termux-setup-storage` 的共享存储混放。JuiceSSH 类图形应用导入的是私钥文件本身（或其内容），导入后应在应用内给私钥单独设口令，备份私钥不要经聊天软件明文传输；其指纹提示同样要按 3.2 节核实。

### 3.7 连接保活：客户端 ServerAlive 与服务端 ClientAlive

连接被中途掐断，通常是路径上的 NAT 或防火墙清除了「长时间无流量」的会话映射。保活有两套机制，方向相反，不要混淆：

- **客户端侧**：config 的 `ServerAliveInterval` / `ServerAliveCountMax`，客户端主动向服务端发探测，既保活又识破假死，本章示例已给出。
- **服务端侧**：sshd 的 `ClientAliveInterval` / `ClientAliveCountMax`，服务端主动探测客户端，常被用来踢掉长期闲置会话。两者细节与排障在 [06 故障排查与安全加固要点](06-troubleshooting-hardening.md) 系统讲解；先记住：自己的连接总断，先配客户端 ServerAlive；全员都被踢，去查服务端 ClientAlive。

## 四、效果验证与测试

逐项验证配置是否真的生效，而不是「文件写了就算数」：

```bash
ssh -G prod-web | grep -E '^(hostname|user|port|identityfile|proxyjump)'
ssh prod-web 'echo connected; hostname'
ssh -O check lab
```

`ssh -G 别名` 打印客户端解析出的完整生效配置（默认值与 config 叠加结果），不真正连接；hostname、user、port 与 config 不符，多半是 `Host *` 位置或拼写问题，按「先读到者优先」检查顺序。第二条应在一条命令里完成经跳板机连接、执行并返回主机名；第三条检查复用主连接，正常输出 `Master running` 及 PID。保活可把连接闲置十分钟再操作验证不掉线；指纹流程在测试机上删一次记录重连，应重新出现 3.2 节提示。

## 五、常见错误与排坑指南

**1. 明明有私钥，却提示 Permission denied**

- 现象：`ssh` 后直接进入密码提示，或报 `Permission denied (publickey,password)`。
- 原因：私钥没被客户端选中——自命名私钥未用 `-i` 指定、未写进 config，或 `IdentitiesOnly` 下路径写错；也可能是服务端没装对应公钥。
- 修复：加 `-v` 重连，看 `Offering public key` 行确认实际递了哪把钥匙；把正确路径写进 config 的 `IdentityFile`。密钥侧排查见 [03 密钥、Agent 与轮换](03-keys-agent.md)。
- 验证：`ssh -o BatchMode=yes 别名 'echo ok'` 不问密码直接返回 `ok`。

**2. `Bad permissions` 私钥权限过松被拒**

- 现象：报 `UNPROTECTED PRIVATE KEY FILE` 并忽略该私钥。
- 原因：私钥权限不是 600（Windows 上是 ACL 过宽）。
- 修复：Linux/macOS 执行 `chmod 600 私钥路径` 并确认 `~/.ssh` 为 700；Windows 在文件属性里移除其他用户的读取权限。
- 验证：重连不再报警，`-v` 显示该钥匙被 Offering 并 Accepted。

**3. 不核实就删 known_hosts 记录**

- 现象：每次警告都随手 `ssh-keygen -R`，或长期用 `StrictHostKeyChecking=no`。
- 原因：把安全机制当故障，失去中间人防护；反复警告也可能是云 IP 被回收复用给了新机器。
- 修复：按 3.3 节三步流程处理并留档；IP 复用场景只对该主机单独设 `StrictHostKeyChecking accept-new`，不全局关闭。
- 验证：新指纹与控制台输出逐字一致，连接恢复且不再报警。

**4. 配了 config 却不生效**

- 现象：`ssh 别名` 的行为与文件内容不符。
- 原因：文件放错位置或多了扩展名；字段拼写错误被静默忽略；`Host *` 写在具体块之前抢先命中。
- 修复：用 `ssh -G 别名` 打印生效值逐项对照；`Host *` 移到末尾；逐行检查字段名。
- 验证：`ssh -G` 输出与预期一致且实际行为相符。

**5. 会话假死，任何按键无响应**

- 现象：终端停在远程提示符，输入无回显，Ctrl+C 无效。
- 原因：网络已断但客户端尚未察觉（TCP 还在等重传）。
- 修复：行首回车后按 `~.` 强制断开；长期对策是配好 3.7 节 ServerAlive 让客户端自己识破假死。
- 验证：`~.` 后立即回到本地终端。

## 六、生产环境最佳实践与安全建议

- **一律用别名管理生产机器。** 生产服务器全部进 config 并取业务别名（如 `prod-web`），脚本里也只写别名。改端口、换 IP、加跳板时只改一处，所有脚本自动跟随。
- **指纹基准值纳入资产清单。** 交付时就把主机指纹与 IP、负责人、用途同表记录，变更核实变成查表比对；重装、迁移后第一时间更新并通知使用者，这是 3.3 节流程跑通的前提。
- **私钥按机器与用途拆分。** 一台服务器（组）一把、命名带用途，配合 `IdentitiesOnly yes` 精确选用；生成规范、Agent 托管与轮换吊销见 [03 密钥、Agent 与轮换](03-keys-agent.md)。
- **回滚方案。** 改 config 前先备份（`cp ~/.ssh/config ~/.ssh/config.bak.$(date +%F)`）；新配置连不上时，先绕过 config 直连验证服务端无恙（`ssh -F /dev/null -i 私钥 -p 端口 opsadmin@198.51.100.23`，`-F /dev/null` 表示不读任何配置文件），确认是客户端问题后把备份覆盖回来再逐行定位。连接复用的僵尸主连接用 `ssh -O exit 别名` 清掉，避免掩盖回滚效果。涉及服务端认证方式变更的，同步回看第 02 部分加固章节与第 08 部分恢复流程确认服务端状态。
