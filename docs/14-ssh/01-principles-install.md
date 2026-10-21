---
description: "SSH 协议原理与 OpenSSH 服务端安装：讲清从 TCP 连接、密钥交换、主机指纹到加密会话的握手流程，并在 Ubuntu 22.04 / 24.04 上安装、启动与验证 sshd。"
---

# SSH 原理与 OpenSSH 服务端安装

## 一、概述与使用场景

SSH（Secure Shell）解决的核心问题是：在不可信的网络上，安全地登录并操作一台远程计算机。在 SSH 出现之前，管理员用 Telnet 和 rlogin 远程登录，所有内容——包括密码——都以明文在网络上传输，任何能截获流量的人都能直接读走口令。SSH 用加密、身份校验与完整性保护替代了这套明文协议：传输内容全程加密，登录前先确认「对面确实是我的服务器」，认证通过后还能在同一条通道里跑终端、文件传输与端口转发。

本章覆盖两个层面。原理层面：一次 SSH 连接从建立 TCP 连接到进入加密会话，中间经历的版本协商、密钥交换、主机身份确认、用户认证分别在防什么攻击。实操层面：在 Ubuntu 22.04 / 24.04 LTS 上安装 OpenSSH 服务端，确认服务在运行、端口在监听、生效配置符合预期，并从另一台机器完成第一次试连。26.04 待核验，本章命令不宣称已在该版本验证。

典型场景有四个：日常远程运维、自动化部署（脚本与 CI 远程执行命令）、文件传输（scp、sftp、rsync 都复用 SSH 通道，见第 04 章）、网络隧道（见第 05 章）。后面每一类故障（指纹警告、认证失败、连接超时）都能对应到握手流程的某一步，懂流程才知道该查哪一层。

## 二、环境准备与前置条件

开始之前，请确认以下条件全部满足：

- 一台已安装 Ubuntu 22.04 或 24.04 LTS 的服务器，能通过云厂商控制台、本地显示器或已有会话登录操作。本章示例服务器地址为 192.0.2.10，初始账号为 `ubuntu`，日常管理账号为 `opsadmin`，请替换为你自己的真实值。
- 服务器有可用的软件源，能执行 `sudo apt update`。离线环境需提前准备 openssh-server 的 deb 包及依赖，本章按在线安装讲解。
- 一台客户端机器（你的电脑），用于最后的试连验证。客户端的系统安装见第 02 章，本章只需要它上面有 `ssh` 与 `nc`（netcat）命令。
- 如果服务器在云上，先确认你能登录云厂商控制台——后面放行安全组规则、万一连不上时走控制台救援，都要用到它。

!!! warning "先确认带外通道再动网络配置"
    本章涉及安装并启动远程登录服务。如果这台机器当前唯一的入口就是 SSH 本身（例如朋友转交的机器），改配置前先确认云控制台或机房带外管理可用。把自己锁在门外后的恢复流程见第 08 部分的灾难恢复章节，不要等到连不上才去找控制台密码。

## 三、手把手操作步骤

### 3.1 理解协议：一次连接的五个阶段

SSH 基于 TCP 工作，服务端默认监听 22 端口。一次完整连接依次经历五个阶段：

```text
客户端                                                服务端 (sshd)
  | ---- 1. TCP 三次握手，连上 22 端口 ----------------> |
  | <--- 2. 版本协商：互报 SSH-2.0-OpenSSH_x.x --------> |
  | <--- 3. 密钥交换：协商算法，生成会话密钥 -----------> |
  | <--- 4. 主机身份确认：服务端出示主机公钥，            |
  |        客户端与 known_hosts 中的指纹比对 ----------> |
  | ---- 5. 用户认证：密码或公钥签名 -------------------> |
  | <=== 加密会话：终端 / 文件传输 / 端口转发 ==========> |
```

逐阶段解读它们各自防什么：

1. **TCP 连接**：只是普通的三次握手，还没有任何安全保证。这一层失败表现为 Connection timed out 或 Connection refused，是第 06 章排查的第一层。
2. **版本协商**：双方互报协议版本与软件版本字符串，例如 `SSH-2.0-OpenSSH_9.6p1`。现代 OpenSSH 只接受 SSH-2，老旧的 SSH-1 已被彻底移除。
3. **密钥交换**：双方用曲线 25519 等密钥交换算法协商出一把只属于本次会话的对称密钥，交换过程即使被旁观也无法反推出会话密钥。之后所有数据用这把密钥加密传输，并附带消息认证码防篡改。
4. **主机身份确认**：服务端出示自己的主机公钥（host key）。客户端把它的指纹与 `~/.ssh/known_hosts` 中记录的比对：一致才继续，首次连接则提示你人工核对后保存。这一步防的是中间人攻击——没有它，加密做得再好，也可能是在和冒充者加密通话。指纹的正确核对方法在第 02 章详细讲。
5. **用户认证**：服务端确认「来访者是谁」。常见方式是公钥认证（客户端用私钥签名，服务端用预存的公钥验签，私钥本身不经过网络）和密码认证。认证通过后会话建立，后续终端输入、文件传输、端口转发全部复用这条加密通道。

### 3.2 理解角色：sshd 与客户端工具

OpenSSH 分成两个独立的软件包，角色不要混淆：

- **服务端 `openssh-server`**：核心是常驻守护进程 `sshd`，在服务器上监听端口、验证来访者身份。配置文件是 `/etc/ssh/sshd_config`。一台机器只有需要「被连接」时才装它。
- **客户端 `openssh-client`**：提供 `ssh`（登录与远程执行）、`scp`（拷贝文件）、`sftp`（交互式文件传输）、`ssh-keygen`（生成与管理密钥）、`ssh-agent`/`ssh-add`（私钥口令托管）等命令。Ubuntu 桌面与服务器默认都预装客户端，所以你的电脑上多半已经有 `ssh` 命令可用。

注意一个常见误解：在服务器上执行 `ssh localhost` 能连通，只说明服务端在工作；它不能替代「从另一台机器连进来」的验证，因为后者还经过了真实网络与防火墙。

### 3.3 安装服务端与客户端

在服务器上执行：

```bash
sudo apt update
sudo apt install -y openssh-server openssh-client
```

参数解读：`apt update` 先刷新软件包索引，避免装到旧版本或报找不到包；`openssh-server` 是服务端，`openssh-client` 在服务器上同样建议装齐——排障时经常需要在服务器本机用 `ssh` 自连测试。安装过程中安装脚本通常会自动生成主机密钥（放在 `/etc/ssh/ssh_host_*`），并把 `ssh` 服务设为开机自启并立即启动，所以多数情况下装完就能连。

!!! note "云镜像与最小化安装的差异"
    部分云厂商镜像与 Ubuntu Server 最小化安装默认不带 openssh-server，这正是「新机器 ping 得通但 SSH 连不上」的常见原因之一。判断方法就是下一小节的 `systemctl status ssh`：找不到单元，说明还没安装，按本节装上即可。

### 3.4 判读服务状态

```bash
systemctl status ssh --no-pager
```

正常输出示例：

```text
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled; preset: enabled)
     Active: active (running) since Wed 2026-10-21 09:12:03 CST; 2h 15min ago
   Main PID: 1052 (sshd)
```

逐行解读：`Loaded` 行的 `enabled` 表示开机自启已开启，重启机器后服务会自己起来；`Active: active (running)` 是核心结论，服务正在运行；`Main PID` 是主进程号。两个关键状态词要分清：`enabled/disabled` 说的是「开机是否自启」，`active/inactive` 说的是「此刻是否在运行」，两者是独立维度——显示 `inactive (dead)` 但 `enabled`，意味着现在没起、下次开机才会起，需要手动 `start`（见 3.6 节）；显示 `failed`，则要用 `journalctl -u ssh -e` 看失败原因，常见是配置文件写错。

!!! warning "服务名是 ssh，不是 sshd"
    Ubuntu 上这个 systemd 单元名叫 `ssh`。执行 `systemctl status sshd` 会得到 Unit not found——那是 RHEL 系发行版的命名。详见第五节排坑第 1 条。

### 3.5 验证端口监听与生效配置

服务显示 running 还不够，要确认它确实在预期的地址与端口上监听：

```bash
sudo ss -lntp | grep ssh
```

正常输出示例：

```text
LISTEN 0 4096 0.0.0.0:22    0.0.0.0:* users:(("sshd",pid=1052,fd=3))
LISTEN 0 4096 [::]:22       [::]:*    users:(("sshd",pid=1052,fd=4))
```

解读：`ss -lntp` 中 `-l` 只看监听中的套接字，`-n` 不做域名解析，`-t` 只看 TCP，`-p` 显示占用进程（需要 sudo 才能看全）。两行分别表示在所有 IPv4 地址与所有 IPv6 地址的 22 端口监听，进程正是 sshd。如果只有一行或端口不是 22，先别急着改客户端——很可能配置被改过，以下一条命令的输出为准。

查看 sshd 实际生效的完整配置：

```bash
sudo sshd -T | grep -E '^(port|listenaddress|passwordauthentication|pubkeyauthentication|permitrootlogin)'
```

输出示例：

```text
port 22
listenaddress 0.0.0.0:22
listenaddress [::]:22
permitrootlogin without-password
passwordauthentication yes
pubkeyauthentication yes
```

解读：`sshd -T` 打印的是合并主配置与 `sshd_config.d/` 片段之后的最终生效值，比逐个翻配置文件可靠——Ubuntu 22.04 起主配置会 Include 片段目录，且多数参数是「先读到的值生效」，肉眼看主文件很容易被片段覆盖而不自知。本章只要求你看懂输出：端口是多少、密码登录当前是否开着。如何收紧这些值属于加固范畴，按装完下一步的链接去第 02 部分操作，本章不改。

改任何配置之前，先备份：

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
sudo sshd -t
```

`sshd -t` 只做语法检查，无输出即通过；有报错会指出文件与行号。养成「备份 → 改 → `sshd -t` 检查 → 再重载」的顺序，能避免把错误配置直接推上线。

### 3.6 服务管理：start、enable、reload 与 restart 的区别

```bash
sudo systemctl start ssh      # 启动已停止的服务（本次生效）
sudo systemctl enable ssh     # 设为开机自启（不影响当前运行状态）
sudo systemctl enable --now ssh   # 两件事一起做
sudo systemctl reload ssh     # 重读配置，不断开已有连接
sudo systemctl restart ssh    # 完全重启服务进程
```

区别要记牢：`start` 只管现在，`enable` 只管开机，互不替代。`reload` 与 `restart` 都用于让新配置生效，但行为不同：`reload` 向主进程发送 SIGHUP 重新读取配置，已经建立的 SSH 会话不受影响；`restart` 是先停后启，主进程被替换，监听会短暂中断。改 sshd 配置后优先用 `reload`——你正通过 SSH 操作这台机器时，这个选择直接决定自己会不会被踢下线。

!!! tip "改配置的标准节奏"
    备份配置 → 编辑 → `sudo sshd -t` 校验 → `sudo systemctl reload ssh` → 保持当前会话不关，另开终端试连验证 → 确认新会话能进，再关旧会话。这个节奏在第 02 部分的加固章节里同样适用。

### 3.7 放行防火墙与安全组

sshd 在监听，不等于外部能连进来，中间还隔着两道门：

- **云服务器安全组**：在云厂商控制台确认入方向放行了 TCP 22（或你改过的端口），来源地址建议收窄到你自己的出口 IP，而不是对全网开放。
- **主机防火墙 UFW**：如果服务器启用了 UFW，需要显式放行：

```bash
sudo ufw allow 22/tcp
sudo ufw status
```

UFW 的完整用法、默认策略与规则管理见 [第 02 部分 · 防火墙管理](../02-security/03-firewall.md)，本章不展开。

!!! danger "启用 UFW 前先放行当前 SSH 端口"
    如果 UFW 当前是未启用状态，不要在没放行 SSH 端口的情况下直接 `sudo ufw enable`：默认入站拒绝策略会立刻切断包括你自己在内的所有 SSH 连接。正确顺序永远是先 `allow` 当前 SSH 端口、保持现有会话不关闭、新开终端验证能连，再做其他规则调整。改过 SSH 端口的，必须放行新端口而不是 22。

## 四、效果验证与测试

按从内到外的顺序做三级验证，每级通过再进下一级：

**第一级：本机自连。** 在服务器本机执行：

```bash
ssh ubuntu@127.0.0.1
```

能登录并看到欢迎信息，说明 sshd 本机工作正常。首次连接会出现主机指纹确认提示，它的含义与正确处理在第 02 章讲，本机自连时输入 `yes` 即可。

**第二级：从客户端探测端口。** 在你的电脑上执行：

```bash
nc -vz 192.0.2.10 22
```

输出示例：

```text
Connection to 192.0.2.10 22 port [tcp/ssh] succeeded!
```

解读：`nc -vz` 中 `-v` 显示详情、`-z` 只探测不发送数据。出现 `succeeded` 说明网络路径与防火墙都通；若长时间无输出最终超时，问题在网络、安全组或防火墙，而不是 sshd 本身；若立即返回 `Connection refused`，说明网络可达但目标端口没有服务监听或被主机防火墙拒绝，回到 3.4、3.5 节检查。

**第三级：从客户端正式登录。**

```bash
ssh ubuntu@192.0.2.10
```

输入密码后成功进入服务器 shell，且执行 `whoami` 返回 `ubuntu`，即为完整验证通过。到这里，服务端安装阶段结束。

## 五、常见错误与排坑指南

**1. `Unit sshd.service could not be found`**

- 现象：执行 `systemctl status sshd` 报 Unit not found。
- 原因：Ubuntu 上 OpenSSH 服务端的 systemd 单元名是 `ssh`，`sshd` 是其他发行版的叫法。
- 修复：改用 `systemctl status ssh`；若 `ssh` 单元也不存在，说明 openssh-server 尚未安装，执行 3.3 节的安装命令。
- 验证：`systemctl is-active ssh` 输出 `active`。

**2. 端口被占用，sshd 启动失败**

- 现象：`systemctl status ssh` 显示 `failed`，日志中有 `Bind to port 22 on 0.0.0.0 failed: Address already in use`。
- 原因：22 端口已被其他进程占用（例如另一套 SSH 服务或手工启动的 sshd 实例）。
- 修复：用 `sudo ss -lntp | grep :22` 找出占用进程的 PID 与名称，确认其归属后再决定停止它还是给 sshd 换端口，不要不看归属直接杀进程。
- 验证：占用解除后 `sudo systemctl restart ssh`，再执行 `sudo ss -lntp | grep ssh` 应看到 sshd 正常监听。

**3. 服务在运行，但从外部连不上**

- 现象：本机自连正常，客户端 `nc -vz` 超时。
- 原因：八成是云安全组未放行 22 端口，或主机 UFW 已启用但未放行 SSH——流量根本没有到达 sshd。
- 修复：先查云控制台安全组入方向规则，再在服务器上 `sudo ufw status` 核对放行规则，两边都以「放行当前实际 SSH 端口」为准。
- 验证：在客户端重跑 `nc -vz 192.0.2.10 22` 得到 `succeeded`，再 `ssh` 正式登录成功。

**4. `Connection refused` 立即断开**

- 现象：客户端连接立刻被拒，没有指纹提示也没有密码提示。
- 原因：网络可达，但目标端口没有监听——sshd 没启动、监听了别的端口，或只监听了某个内网地址。
- 修复：在服务器上依次执行 `systemctl status ssh` 与 `sudo ss -lntp | grep ssh`，并用 `sudo sshd -T | grep -E '^(port|listenaddress)'` 核对生效端口与地址。
- 验证：客户端用核对出的端口重连（如 `ssh -p <端口> ubuntu@192.0.2.10`）能进入指纹确认或密码提示。

**5. 改完配置后服务起不来**

- 现象：reload/restart 后服务变 `failed`，新连接全部被拒。
- 原因：sshd_config 语法错误或参数值不合法，sshd 拒绝启动。
- 修复：执行 `sudo sshd -t` 按提示定位文件与行号；修不好就先用 3.5 节的备份覆盖回去（`sudo cp /etc/ssh/sshd_config.bak.<日期> /etc/ssh/sshd_config`），校验通过后 restart。
- 验证：`sudo sshd -t` 无输出且 `systemctl is-active ssh` 为 `active`，客户端能重新登录。

## 六、生产环境最佳实践与安全建议

- **装完立刻加固。** 本章结束时服务端仍是发行版默认配置：密码登录开着、默认端口、Root 策略宽松。生产机器的下一步固定是 [第 02 部分 · SSH 安全加固](../02-security/01-ssh-hardening.md)：换密钥登录、禁用密码与 Root、按需改端口与叠加双因素。加固前不要把机器长期暴露在公网。
- **主机密钥要当资产管。** `/etc/ssh/ssh_host_*` 私钥是这台服务器的身份凭证，重装系统或克隆镜像后主机密钥会变化或重复：克隆出的机器必须重新生成（`sudo ssh-keygen -A` 配合删除旧密钥），否则多台机器共用同一身份，指纹确认就失去了意义。迁移场景的处理见第 08 部分灾难恢复章节。
- **配置变更走「备份—校验—重载—双会话验证」。** 永远保留一个已登录会话作为退路，`sshd -t` 不通过绝不 reload。所有自定义配置集中写入 `/etc/ssh/sshd_config.d/` 下的独立片段文件，不直接改主配置，升级与排障都更干净。
- **回滚方案。** 任何一次 sshd 配置变更出问题，按以下顺序回滚：①若旧会话还在，直接在旧会话里把备份配置拷回并 `sudo sshd -t && sudo systemctl reload ssh`；②若已被锁在门外，通过云厂商控制台或带外管理登录，执行同样的恢复命令；③恢复后另开终端验证新连接能登录，再复盘出错的那行配置。备份文件就是 3.5 节生成的 `/etc/ssh/sshd_config.bak.<日期>`，改配置前没做备份，等于主动放弃了最快的回滚路径。
- **下一步阅读。** 服务端已就绪，接下来去 [02 连接与客户端配置](02-connect-config.md) 学客户端一侧的连接、指纹与配置文件；服务端的收紧动作回到上面链接的加固章节完成。两条线都走通，你才算真正「会用 SSH」。
