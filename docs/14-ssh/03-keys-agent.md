---
description: "SSH 密钥的完整生命周期管理：生成、部署、权限、验证、ssh-agent、撤销与轮换，以及关闭密码登录的安全顺序。"
---

# SSH 密钥、Agent 与轮换

## 一、概述与使用场景

密码登录有三个结构性问题：可被暴力破解、可被钓鱼骗走、常被复用到多台服务器。公钥登录把"证明身份"的材料换成一对密钥：**私钥只留在客户端、绝不外传**，公钥放在服务器上，登录时服务器用公钥出题、私钥在本地答题，秘密不经过网络。

本章讲密钥的**生命周期管理**：生成 → 部署 → 验证 → agent 托管 → 撤销 → 轮换 → 安全关闭密码登录。服务端参数全表（`PermitRootLogin`、`MaxAuthTries`、双因素认证等）已在 [SSH 服务端加固](../02-security/01-ssh-hardening.md) 中系统讲解，本章只互链、不重复整表。

适用场景：

- 新购服务器交付，把运维人员的公钥部署上去；
- 成员离职或笔记本丢失，需要**撤销**某把密钥而不是改全员密码；
- 私钥口令每次都要输，想用 `ssh-agent` 缓存；
- 准备关闭密码登录，需要一份不会把自己锁在门外的操作顺序。

!!! note
    本章默认客户端是 Linux / macOS / WSL，服务端是 Ubuntu 22.04 / 24.04 LTS。示例服务器地址用文档保留段 `192.0.2.10`，示例用户为 `ubuntu` 与 `opsadmin`，请替换成你自己的真实值。

## 二、环境准备与前置条件

开始前确认以下条件都满足：

1. 客户端已安装 OpenSSH 客户端（Ubuntu 默认自带），`ssh -V` 能输出版本号；
2. 你目前还能用密码（或云厂商控制台）登录目标服务器——部署公钥的过程依赖这条现存通道；
3. 你知道目标服务器的 SSH 端口（默认 22，改过端口的机器在部署时要显式带上）；
4. 操作全程**至少保留一个已登录会话不要断开**，这是后续所有变更的保险绳。

```bash
ssh -V
```

```text
OpenSSH_9.6p1 Ubuntu-3ubuntu13, OpenSSL 3.0.13 30 Jan 2024
```

解读：能输出版本号即可。版本口径为 Ubuntu 22.04 / 24.04 LTS，本章不宣称在 26.04 上验证过。

## 三、手把手操作步骤

### 3.1 生成密钥：一机一钥、一服务一钥

```bash
ssh-keygen -t ed25519 -C "opsadmin-laptop-2026" -f ~/.ssh/id_ed25519_ops
```

参数逐条讲解：

- `-t ed25519`：算法选 Ed25519，密钥短、速度快、安全性不低于 RSA 3072，是当前新密钥的默认推荐；
- `-C "备注"`：备注会写进公钥行尾，**这是日后撤销、轮换时定位密钥的唯一线索**，建议写成"人名-设备-年份"的格式，不要留空；
- `-f 路径`：指定密钥文件名。默认名是 `~/.ssh/id_ed25519`，一人多钥时用不同文件名区分。

执行时会提示设置**私钥口令（passphrase）**：

```text
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in /home/ubuntu/.ssh/id_ed25519_ops
Your public key has been saved in /home/ubuntu/.ssh/id_ed25519_ops.pub
The key fingerprint is:
SHA256:uNiVztksCsDhccyEXAMPLEONLYxxxxxxxxxxxxxx opsadmin-laptop-2026
```

私钥口令的意义：私钥文件一旦被拷走（笔记本被盗、备份泄露），没有口令就无法用它登录。**强烈建议给私钥设口令**，输口令的麻烦由 3.5 节的 `ssh-agent` 解决，两者并不冲突。

!!! tip
    坚持"一机一钥、一服务一钥"：笔记本、台式机各生成各的密钥，不要把同一份私钥到处拷贝。这样丢一台设备只需撤销一把钥，互不影响；给跳板机、生产机用不同密钥，也能缩小泄露半径。

### 3.2 部署公钥：三种方法

**方法一：ssh-copy-id（首选）**

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_ops.pub -p 22 ubuntu@192.0.2.10
```

- `-i` 指定要部署的**公钥**文件（注意是 `.pub`）；
- `-p` 是 SSH 端口，服务器改过端口时必须带。

```text
/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed
/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys
ubuntu@192.0.2.10's password:

Number of key(s) added: 1
```

解读：先输一次旧密码完成部署，看到 `Number of key(s) added: 1` 即成功。`ssh-copy-id` 会自动处理服务端目录与文件权限，这也是它优于手动法的原因。

**方法二：手动追加**

没有 `ssh-copy-id` 时（例如在精简系统上），先登录服务器建好目录，再把公钥内容追加进去：

```bash
# 在服务器上执行
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# 在客户端执行，把公钥追加到服务器（按提示输一次密码）
cat ~/.ssh/id_ed25519_ops.pub | ssh ubuntu@192.0.2.10 'cat >> ~/.ssh/authorized_keys'
# 回到服务器上修正权限
chmod 600 ~/.ssh/authorized_keys
```

**方法三：经已有跳板部署**

目标机只能从跳板机到达时，用 `-J` 让 `ssh-copy-id` 经跳板中转（底层 `ssh` 支持 ProxyJump）：

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_ops.pub -o ProxyJump=opsadmin@198.51.100.5 ubuntu@192.0.2.10
```

部署完成后不要急着断开当前会话，先按 3.4 节验证。

### 3.3 权限三件套：两端都要对

SSH 对权限的检查非常严格（`StrictModes`），权限过宽会直接拒绝密钥登录。标准如下：

| 位置 | 对象 | 权限 | 属主 |
| --- | --- | --- | --- |
| 客户端 | `~/.ssh` 目录 | 700 | 当前用户 |
| 客户端 | 私钥（如 `id_ed25519_ops`） | 600 | 当前用户 |
| 客户端 | 公钥（`.pub`） | 644 | 当前用户 |
| 服务端 | `~/.ssh` 目录 | 700 | 登录用户 |
| 服务端 | `authorized_keys` | 600 | 登录用户 |
| 服务端 | 家目录 `~` | 不可组写/其他写（如 755 或更严） | 登录用户 |

检查与修复命令（客户端、服务端各执行一遍对应部分）：

```bash
# 客户端检查
ls -ld ~/.ssh
ls -l ~/.ssh/id_ed25519_ops ~/.ssh/id_ed25519_ops.pub
# 客户端修复
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519_ops
chmod 644 ~/.ssh/id_ed25519_ops.pub

# 服务端检查
ls -ld ~ ~/.ssh ~/.ssh/authorized_keys
# 服务端修复（属主不对时用 chown 一并修正）
sudo chown -R ubuntu:ubuntu /home/ubuntu/.ssh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod go-w ~
```

解读：家目录若是 `drwxrwxr-x` 这类组可写权限，sshd 会拒绝读取 `authorized_keys`——这是"公钥明明部署了却还问密码"的常见原因。

### 3.4 验证密钥登录：看懂 ssh -v 的三行关键输出

**新开一个终端**（不要动原会话），用调试模式登录：

```bash
ssh -v -i ~/.ssh/id_ed25519_ops ubuntu@192.0.2.10
```

在刷屏输出里找这三行：

```text
debug1: Offering public key: /home/ubuntu/.ssh/id_ed25519_ops ED25519 SHA256:uNiVztksCsDhccyEXAMPLEONLYxxxxxxxxxxxxxx
debug1: Server accepts key: /home/ubuntu/.ssh/id_ed25519_ops ED25519 SHA256:uNiVztksCsDhccyEXAMPLEONLYxxxxxxxxxxxxxx
debug1: Authentication succeeded (publickey).
```

逐行解读：

- `Offering public key`：客户端把这把公钥递给服务器询问；
- `Server accepts key`：服务器在 `authorized_keys` 里找到了它，接下来进入签名验证；
- `Authentication succeeded (publickey)`：验证通过，本次登录用的是公钥而不是密码。

三行齐全才算部署真正成功。还可以加 `-o PasswordAuthentication=no` 再连一次，强制禁用密码回退，验证"只靠密钥也能进"：

```bash
ssh -o PasswordAuthentication=no -i ~/.ssh/id_ed25519_ops ubuntu@192.0.2.10 'echo OK'
```

### 3.5 ssh-agent：口令只输一次

原理：`ssh-agent` 是常驻后台进程，在内存里解密并保管私钥。`ssh-add` 把私钥交给它（此时输一次口令），之后 `ssh` 命令通过环境变量 `SSH_AUTH_SOCK` 找到 agent 代签，不再输口令。

```bash
# 启动 agent，并把输出的环境变量导入当前 shell
eval "$(ssh-agent -s)"
# 把私钥交给 agent（此时输一次私钥口令）
ssh-add ~/.ssh/id_ed25519_ops
# 查看 agent 里已加载的密钥
ssh-add -l
```

```text
Agent pid 2481
Identity added: /home/ubuntu/.ssh/id_ed25519_ops (opsadmin-laptop-2026)
256 SHA256:uNiVztksCsDhccyEXAMPLEONLYxxxxxxxxxxxxxx opsadmin-laptop-2026 (ED25519)
```

常用管理命令：

- `ssh-add -t 28800 ~/.ssh/xxx`：加载时限定有效期（秒），到期自动卸下，适合办公机"上班加载、下班失效"；
- `ssh-add -d ~/.ssh/xxx`：只移除指定一把；
- `ssh-add -D`：移除全部；
- `ssh-add -x` / `-X`：锁定 / 解锁 agent（离开工位时可用）。

!!! note
    桌面环境（GNOME / KDE）与 macOS 通常自带 agent 集成，登录后自动启动，不必手动 `eval`。判断方法：`echo $SSH_AUTH_SOCK` 有输出即已就绪。手动启动的 agent 只在当前终端会话有效，关掉终端要重新来一遍。

**Agent 转发（-A）：便利与风险**

`ssh -A` 把本地 agent "转发"到远程主机，于是你从远程主机再跳下一台机器时也能用本地密钥，不必把私钥拷到跳板上——方便，但有真实风险：

!!! danger
    Agent 转发等于把"签名能力"暴露给远程主机的 socket。远程主机上拥有 root 权限的人（或攻陷了该主机的攻击者）可以在转发会话存续期间，借用你的 agent 去登录**你有权限的所有其他服务器**，无需知道你的私钥口令。只在你完全信任的跳板机上使用 `-A`；对目标机权限不确定的场景，改用 `-J`（ProxyJump）：连接经跳板转发流量，但签名始终在本地完成，agent 不暴露给跳板。要长期使用转发，可在 `~/.ssh/config` 中对单个 Host 显式写 `ForwardAgent yes`，不要全局开启。

### 3.6 密钥撤销：有人离职或设备丢失时

撤销 = 从目标服务器的 `authorized_keys` 里删掉对应那一行。先按 3.1 节写好的备注定位：

```bash
# 在服务器上，按备注关键字定位行号
grep -n "opsadmin-laptop-2026" ~/.ssh/authorized_keys
```

改文件前先备份，再删除对应行：

```bash
cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak.$(date +%F)
sed -i '/opsadmin-laptop-2026/d' ~/.ssh/authorized_keys
# 复查：应无输出
grep -c "opsadmin-laptop-2026" ~/.ssh/authorized_keys || true
```

撤销后必须验证旧钥确实失效——在还持有旧私钥的机器上尝试登录，应被拒绝并回退到密码或直接失败：

```bash
ssh -o PasswordAuthentication=no -i ~/.ssh/id_ed25519_ops ubuntu@192.0.2.10
```

```text
ubuntu@192.0.2.10: Permission denied (publickey).
```

看到 `Permission denied (publickey)` 才算撤销闭环。注意：撤销要在**每一台**部署过该公钥的服务器上逐台执行，漏一台就等于没撤。

### 3.7 密钥轮换：先立新、再废旧

轮换是撤销的"计划版"，安全顺序的核心是**任何时刻都至少有一把已验证可用的密钥**：

1. 生成新密钥（换新文件名与备注，如 `id_ed25519_ops_2027`，备注带新年份）；
2. 用 3.2 节方法把新公钥部署到所有服务器；
3. **新开会话**，用新密钥逐台验证登录（3.4 节三行输出判读）；
4. 确认全部通过后，再到各服务器删除旧公钥行（3.6 节流程）；
5. 最后清理本地旧私钥：确认无脚本、配置引用旧路径后再删除，可先改名观察一两天。

!!! warning
    不要"先删旧钥再部署新钥"，也不要在同一个会话里边换边测——一旦中间步骤出错（权限、路径、网络），你会同时失去新旧两条通路。轮换全程保留已登录会话不断开，与 3.8 节同一条纪律。

### 3.8 关闭密码登录：安全顺序清单

前提与参数细节（`PasswordAuthentication no`、`KbdInteractiveAuthentication no`、`PermitRootLogin` 等）见 [SSH 服务端加固](../02-security/01-ssh-hardening.md)，本节只给**不会把自己锁死的操作顺序**：

1. ✅ 前提一：3.4 节已验证——新开会话、仅用密钥、登录成功；
2. ✅ 前提二：当前已登录的这个会话**保持不断开**，一直留到最后一步完成；
3. 备份现有配置：`sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)`（若用 `sshd_config.d/` 分片文件，一并备份改动的那片）；
4. 修改配置，关闭密码登录；
5. 语法校验：`sudo sshd -t` 无输出才算通过，有报错先修配置、不要继续；
6. 重载服务（用 reload，不要 restart）：`sudo systemctl reload ssh`——reload 不断开已有连接，restart 若新配置有问题可能直接起不来；
7. **再新开一个会话**用密钥登录验证，并顺手确认密码登录已被拒；
8. 全部通过后，才可以关掉第 2 步保留的保险会话。

!!! danger
    顺序错一步就可能锁死：没验证密钥就关密码、用 restart 代替 reload、校验没过就重载——都是经典锁死姿势。若真的被锁在门外，按第六节回滚方案走云厂商控制台 / VNC 登录后恢复备份配置，不要在 sshd 配置上反复试错。

## 四、效果验证与测试

完成一轮部署后，用下面四项做验收：

```bash
# 1. 仅密钥可登录（禁用密码回退仍能进）
ssh -o PasswordAuthentication=no ubuntu@192.0.2.10 'hostname && whoami'
# 2. agent 中密钥与服务器指纹可对应（比对 3.4 节 -v 输出的指纹）
ssh-add -l
# 3. 服务端 authorized_keys 中行数与预期人数一致
ssh ubuntu@192.0.2.10 'wc -l ~/.ssh/authorized_keys'
# 4. sshd 配置语法有效
ssh ubuntu@192.0.2.10 'sudo sshd -t && echo config-ok'
```

四项全过，说明"部署—验证—托管—配置"链条完整；任何一项失败，回到第三节对应小节复查，不要跳步。

## 五、常见错误与排坑指南

### 5.1 Bad owner or permissions on XXX

- **现象**：`ssh` 直接报错 `Bad owner or permissions on /home/ubuntu/.ssh/id_ed25519_ops` 并拒绝使用该私钥。
- **原因**：客户端私钥文件权限过宽（组/其他可读）或属主不对，OpenSSH 出于安全直接拒绝加载。
- **修复**：按 3.3 节执行 `chmod 600 私钥`，并确认 `ls -l` 显示属主是当前用户。
- **验证**：重新 `ssh -v`，不再出现该报错且出现 `Offering public key` 行。

### 5.2 公钥一行被折断

- **现象**：公钥已粘贴进 `authorized_keys`，但登录始终回退到密码，`-v` 里没有 `Server accepts key`。
- **原因**：复制粘贴或编辑器自动换行把公钥拆成了两行。公钥格式是严格的一行：`ssh-ed25519 AAAA... 备注`，折断后该行无法解析，被 sshd 静默忽略。
- **修复**：删除折断的行，用 `ssh-copy-id` 重新部署，或用 `cat 公钥 | ssh 服务器 'cat >> ~/.ssh/authorized_keys'` 整段传输，避免手工粘贴。
- **验证**：`awk '{print NR": "length($0)}' ~/.ssh/authorized_keys` 检查每行长度，Ed25519 公钥行通常在 90 字符以上；再按 3.4 节验证三行输出。

### 5.3 authorized_keys 属主错误

- **现象**：权限数字都对，但密钥登录仍失败，服务端日志 `/var/log/auth.log` 出现 `Authentication refused: bad ownership or modes for file`。
- **原因**：文件属主不是登录用户本人——常见于用 root 或 sudo 代其他用户写入 `authorized_keys` 后没改属主。
- **修复**：

    ```bash
    sudo chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys
    chmod 600 /home/ubuntu/.ssh/authorized_keys
    ```

- **验证**：`ls -l ~/.ssh/authorized_keys` 属主为登录用户，新开会话密钥登录成功。

### 5.4 Could not open a connection to your authentication agent

- **现象**：执行 `ssh-add` 报错 `Error connecting to agent: No such file or directory` 或 `Could not open a connection to your authentication agent`。
- **原因**：当前 shell 里没有 agent，或 `SSH_AUTH_SOCK` 未设置/已失效——典型情况是 agent 在另一个终端启动、或终端重开后没重新 `eval`。
- **修复**：在**当前终端**执行 `eval "$(ssh-agent -s)"` 后再 `ssh-add`；桌面环境下先检查 `echo $SSH_AUTH_SOCK` 是否为空。
- **验证**：`ssh-add -l` 能列出密钥指纹，不再报错。

## 六、生产环境最佳实践与安全建议

1. **密钥台账**：维护一份清单，记录每把公钥的指纹、备注（人名-设备-年份）、部署了哪些服务器、计划轮换日期。没有台账，撤销时必然漏机器。
2. **私钥口令 + agent 过期**：私钥一律设口令；办公机上 `ssh-add -t` 限定 8 小时有效期，把"方便"关进时间盒子。
3. **转发最小化**：默认不用 `-A`，跳板场景优先 `-J`（ProxyJump）；确需转发时只对白名单 Host 在 `~/.ssh/config` 里单独开启。
4. **定期审计**：每季度逐台核查 `authorized_keys`，对比台账删除无人认领的行；离职、设备丢失走 3.6 节撤销流程并留记录。
5. **轮换节奏**：建议每年轮换一次个人密钥；怀疑泄露时立即轮换，不等周期。流程严格按 3.7 节"先立新、再废旧"。

**回滚方案**：

- 改 sshd 配置前：备份已在 3.8 节第 3 步完成（`sshd_config.bak.日期`）。出问题时，在保留的已登录会话里恢复：

    ```bash
    sudo cp /etc/ssh/sshd_config.bak.2026-10-21 /etc/ssh/sshd_config
    sudo sshd -t && sudo systemctl reload ssh
    ```

- 已登录会话也断了：用云厂商控制台 / IPMI / VNC 登录服务器，执行同样的恢复命令；再不行才考虑救援模式挂载系统盘改配置。
- 误撤销了还在用的公钥：用保留会话或控制台登录，把 3.6 节备份的 `authorized_keys.bak.日期` 中对应行加回，并复查权限与属主。
- 原则：所有回滚动作完成后，重新走一遍第四节的四项验收，确认恢复到变更前状态，再安排重新变更。
