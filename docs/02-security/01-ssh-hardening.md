---
description: "SSH 是 Ubuntu Server 最重要的远程管理入口，绝大多数服务器没有接显示器，日常运维、部署、排障全部从 SSH 进入。正因为入口只有一个，攻击者的目光也全部集中在这里。"
---

# SSH 安全加固

## 一、概述与使用场景

SSH 是 Ubuntu Server 最重要的远程管理入口，绝大多数服务器没有接显示器，日常运维、部署、排障全部从 SSH 进入。正因为入口只有一个，攻击者的目光也全部集中在这里。公网服务器上线几小时内，认证日志里就会出现来自世界各地的自动扫描与密码字典攻击，弱口令或默认配置的机器被攻破只是时间问题。一旦 SSH 被攻破，攻击者拿到的往往是可提权的账号，接下来就是植入挖矿程序、勒索软件或把服务器当作跳板，后果远超单个服务被入侵。

本章要完成四件事：第一，改用 Ed25519 密钥认证，让登录不再依赖可被猜解的密码；第二，修改默认 22 端口，减少自动扫描的命中与日志噪声；第三，禁用 Root 直接登录与密码登录，堵住最高价值目标和最弱的认证方式；第四，为登录再叠加一层基于时间型一次性口令的双因素认证，即使私钥文件意外泄露，攻击者缺少手机上的动态口令仍然进不来。不做这些配置的风险非常直接：密码登录开启等于把大门安全寄托在所有账号的口令强度上，任何一个账号用了弱口令，整台服务器就等于没有锁。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，命令在两个版本上通用，差异处会单独用提示块说明。读者需要一个能使用 `sudo` 的普通账号，本书统一使用示例账号 `ubuntu` 作为初始管理账号，并新建 `opsadmin` 作为加固后的日常管理账号。客户端可以是 Linux、macOS 或 Windows，文中命令以 Linux 与 macOS 终端为准，Windows 用户可在 PowerShell 中使用系统自带的 `ssh` 与 `ssh-keygen`，命令参数一致。

操作前确认服务器端 OpenSSH 服务已经安装并运行：

```bash
sudo apt update
sudo apt install -y openssh-server libpam-google-authenticator qrencode
systemctl status ssh --no-pager
```

参数说明：`openssh-server` 是服务端程序，重复安装无害；`libpam-google-authenticator` 是本章双因素认证要用的 PAM 模块；`qrencode` 用来在终端里把双因素密钥渲染成二维码，方便手机应用扫码。`systemctl status ssh` 的输出中应看到 `active (running)`，若显示未找到单元，说明服务端尚未安装完成，先把安装命令执行成功再继续。

!!! note "关于 sshd 配置文件的位置"
    Ubuntu 22.04 起，OpenSSH 主配置文件 `/etc/ssh/sshd_config` 通常包含一行 `Include /etc/ssh/sshd_config.d/*.conf`，放在 `/etc/ssh/sshd_config.d/` 目录下、以 `.conf` 结尾的文件会被优先读取，而 sshd 对多数参数遵循先读到的值生效的规则。本章统一把自定义配置写入 `/etc/ssh/sshd_config.d/60-hardening.conf`，不直接改主文件，这样系统升级覆盖主文件时不会丢失加固配置，排障时删掉这一个文件即可回滚。

## 三、手把手操作步骤

### 3.1 在客户端生成密钥对

在你自己的电脑上执行，不是在服务器上执行。密钥对必须生成在发起连接的机器上，私钥永远只留在这台机器里：

```bash
ssh-keygen -t ed25519 -C "opsadmin-laptop" -f ~/.ssh/id_ed25519_ubuntu
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519_ubuntu
chmod 644 ~/.ssh/id_ed25519_ubuntu.pub
ls -l ~/.ssh/
```

参数逐项讲解：`-t ed25519` 指定算法为 Ed25519，密钥短、验签快、安全性不低于 3072 位 RSA，是当前首选；`-C "opsadmin-laptop"` 是写进公钥末尾的备注，写清机器与用途，日后在服务器的 `authorized_keys` 里能一眼认出每把钥匙属于谁；`-f` 指定保存路径，多台服务器时建议一台服务器一把独立密钥，单台泄露不牵连其他机器。执行时系统会询问私钥口令，强烈建议设置强口令，私钥文件就算被拷走，没有口令也无法直接使用。权限必须严格：`~/.ssh` 为 700、私钥为 600，太松时 OpenSSH 会拒绝加载私钥。

### 3.2 把公钥安装到服务器并验证

先用现有的密码登录把公钥送上去，推荐用 `ssh-copy-id`，它会自动追加公钥并修正服务器端权限：

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_ubuntu.pub -p 22 ubuntu@192.0.2.10
ssh -i ~/.ssh/id_ed25519_ubuntu -p 22 ubuntu@192.0.2.10
```

其中 `192.0.2.10` 是文档示例地址，请替换成你自己的服务器地址。第一条命令输入一次 `ubuntu` 账号密码后，公钥会被追加到服务器的 `/home/ubuntu/.ssh/authorized_keys`。第二条命令必须在新开的终端里执行，旧终端保持登录不要关闭；能不输服务器密码、只输私钥口令或直接进入，就说明密钥通道已经打通。这一步验证成功是后面禁用密码登录的前提，验证没过之前绝不要继续改配置。

如需给 `opsadmin` 账号也装公钥，先在服务器上创建该账号并设置它的密钥目录，再把同一把公钥追加进去：

```bash
sudo adduser opsadmin
sudo usermod -aG sudo opsadmin
sudo mkdir -p /home/opsadmin/.ssh
sudo cp /home/ubuntu/.ssh/authorized_keys /home/opsadmin/.ssh/authorized_keys
sudo chown -R opsadmin:opsadmin /home/opsadmin/.ssh
sudo chmod 700 /home/opsadmin/.ssh
sudo chmod 600 /home/opsadmin/.ssh/authorized_keys
```

注意复制公钥时用追加或整文件复制都要核对属主，`authorized_keys` 属主不对时 sshd 会拒绝读取，这也是新手最常见的密钥登录失败原因之一。

### 3.3 写入加固配置

登录服务器，先备份现有配置，任何修改出问题都能用备份还原：

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo cp -a /etc/ssh/sshd_config.d /etc/ssh/sshd_config.d.bak
ls -l /etc/ssh/sshd_config.bak
sudo nano /etc/ssh/sshd_config.d/60-hardening.conf
```

文件完整内容如下：

```ini
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
MaxSessions 5
LoginGraceTime 30
X11Forwarding no
AllowUsers opsadmin ubuntu
ClientAliveInterval 300
ClientAliveCountMax 2
```

关键参数逐行讲解：

| 参数 | 含义 | 取值理由 |
| --- | --- | --- |
| `Port 2222` | SSH 监听端口改为 2222 | 避开针对 22 端口的无差别扫描，改端口不是安全本身，只是降噪，必须与防火墙放行同步修改 |
| `PermitRootLogin no` | 彻底禁止 Root 经 SSH 登录 | Root 是攻击者第一个猜的账号名，日常用普通账号登录再 `sudo` 提权，全程有日志可审计 |
| `PasswordAuthentication no` | 关闭密码认证，只认密钥 | 密码可被字典穷举，密钥不可，这是本章最重要的一行 |
| `PubkeyAuthentication yes` | 明确开启公钥认证 | 与上一行成对出现，避免其他配置文件把公钥认证关掉 |
| `MaxAuthTries 3` | 单次连接最多尝试 3 次认证 | 压缩在线试探的空间，配合 Fail2ban 效果更好 |
| `LoginGraceTime 30` | 未完成认证的连接 30 秒后断开 | 防止大量半开连接长期占用资源 |
| `X11Forwarding no` | 关闭 X11 图形转发 | 服务器运维用不到，减少攻击面 |
| `AllowUsers opsadmin ubuntu` | 白名单，只允许列出的账号经 SSH 登录 | 系统里其他服务账号即使口令泄露也无法从 SSH 进入，新增管理账号时记得同步加进这一行 |
| `ClientAliveInterval 300` 与 `ClientAliveCountMax 2` | 每 300 秒探测一次，两次无响应断开 | 清理无人看管的僵尸会话，避免终端离开后会话长期挂着 |

保存后先做语法检查，检查通过再重载服务。注意用 `reload` 而不是断开式的重启，并且当前会话保持不关：

```bash
sudo sshd -t
sudo systemctl reload ssh
sudo ss -tlnp | grep 2222
```

`sudo sshd -t` 没有任何输出就是语法正确；有输出会指出哪一行写错，必须修好再重载，带着语法错误重载会让新连接全部失败。改端口后防火墙必须同步放行新端口，否则下一次连接就会被挡在外面，放行方法见第 03 章，云服务器还要在云厂商安全组里放行 2222 端口。

!!! warning "改端口与关密码登录的顺序不能错"
    正确顺序是：先验证密钥能登录新账号，再写加固配置，再放行新端口，最后用新端口和密钥重新登录验证一遍，全部通过后才关闭旧会话。任何一步失败就停在当步排障，不要带着未验证的配置断开最后一个会话。

### 3.4 启用双因素认证

双因素认证在密钥之外再要求一个 30 秒变化一次的六位动态口令。先以 `opsadmin` 身份运行初始化工具，为每个账号分别生成独立的密钥，不要多人共用一个：

```bash
google-authenticator
```

交互问答依次回答：第一问是否基于时间生成令牌，输入 `y`；终端会显示二维码，用手机上的身份验证器应用扫码添加，账号名会显示为 `opsadmin` 加主机名；第二问是否把密钥写入家目录，输入 `y`；第三问是否禁止同一令牌重复使用，输入 `y`；第四问是否放宽时间窗口，学习阶段输入 `n` 保持严格；第五问是否开启频率限制，输入 `y`。屏幕上还会给出五组应急刮刮码，必须抄存到密码管理器里，手机丢失时靠它进门，这是需要保密保管的恢复凭据，不要截图存放在同一台手机里。

接着备份并修改 PAM 配置，让 SSH 登录时调用这个模块：

```bash
sudo cp /etc/pam.d/sshd /etc/pam.d/sshd.bak
sudo nano /etc/pam.d/sshd
```

在文件末尾追加一行：

```text
auth required pam_google_authenticator.so
```

再备份并编辑 sshd 加固配置，追加键盘交互认证开关，否则 PAM 模块不会被触发：

```bash
sudo cp /etc/ssh/sshd_config.d/60-hardening.conf /etc/ssh/sshd_config.d/60-hardening.conf.bak
sudo nano /etc/ssh/sshd_config.d/60-hardening.conf
```

在文件末尾追加以下三行，然后检查语法并重载：

```ini
KbdInteractiveAuthentication yes
AuthenticationMethods publickey,keyboard-interactive
UsePAM yes
```

`AuthenticationMethods publickey,keyboard-interactive` 的逗号表示两个阶段都要通过，先验密钥，再验动态口令，缺一不可。到这一步，密码认证依然保持关闭，键盘交互只承载动态口令这一个用途，不会把密码登录重新打开。

```bash
sudo sshd -t
sudo systemctl reload ssh
```

!!! warning "双因素上线前必须先给自己留验证机会"
    重载后不要关闭现有会话。新开终端登录一次，完整走一遍密钥加动态口令流程，确认手机上的口令能被接受，再处理其他账号。某个账号还没有运行过 `google-authenticator` 初始化就开启全局双因素，该账号会直接无法登录。

## 四、效果验证与测试

第一，查看生效配置，不要只看文件内容，要用 `sshd -T` 打印运行时最终值，它会把主配置与 `sshd_config.d` 合并后的结果显示出来：

```bash
sudo sshd -T | grep -E "port|permitrootlogin|passwordauthentication|pubkeyauthentication|kbdinteractiveauthentication|authenticationmethods"
```

期望输出示例：

```text
port 2222
permitrootlogin no
passwordauthentication no
pubkeyauthentication yes
kbdinteractiveauthentication yes
authenticationmethods publickey,keyboard-interactive
```

第二，用新端口做完整登录测试，并故意验证密码登录已经被拒绝。在客户端执行：

```bash
ssh -i ~/.ssh/id_ed25519_ubuntu -p 2222 opsadmin@192.0.2.10
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password -p 2222 opsadmin@192.0.2.10
```

第一条应先通过密钥、再提示输入动态口令，口令正确后进入系统，登录后运行 `whoami` 应输出 `opsadmin`。第二条应直接得到 `Permission denied (publickey,keyboard-interactive)` 一类的拒绝提示，说明服务器已经不再接受密码这条路径。第三，验证 Root 被拒：

```bash
ssh -p 2222 root@192.0.2.10
sudo tail -n 50 /var/log/auth.log
```

Root 登录应被拒绝，日志中能看到对应的失败记录。Ubuntu 24.04 使用 systemd 日志时也可以用 `sudo journalctl -u ssh -n 50 --no-pager` 查看，效果相同，二选一即可。

## 五、常见错误与排坑指南

场景一：改完配置把自己锁在外面。这是最经典也是代价最高的事故：关了密码登录或改了端口之后，所有新连接都进不去。典型报错是连接新端口超时，或旧端口提示 `Connection refused`，或能连上但提示 `Permission denied (publickey)`。原因通常是三件事中的一件：防火墙或云安全组没有放行新端口、`AllowUsers` 里漏写了正在用的账号、密钥没有正确装到目标账号的 `authorized_keys`。自救步骤按顺序执行：先通过云厂商网页控制台或虚拟机控制台登录服务器，这是带外通道，不走 SSH 网络规则；进来后先回滚加固文件，再重载服务恢复到能登录的状态：

```bash
sudo mv /etc/ssh/sshd_config.d/60-hardening.conf /root/60-hardening.conf.disabled
sudo sshd -t
sudo systemctl reload ssh
sudo ufw status verbose
sudo grep -E "AllowUsers|Port" /etc/ssh/sshd_config
```

恢复登录后逐项重查，不要一次性把所有加固项再全加回去，每加一项验证一次，定位到底是哪一项把你挡住的。预防永远比自救重要：保持旧会话不关、新终端验证通过再收尾，这条纪律能消灭绝大部分锁死事故。

场景二：密钥文件权限太松，客户端拒绝使用私钥。报错原文片段为 `Permissions 0644 for '/home/<user>/.ssh/id_ed25519_ubuntu' are too open` 与 `This private key will be ignored`。原因是私钥被设置成组可读或全局可读，OpenSSH 判定私钥可能已经泄露，直接忽略这把钥匙，于是表面上看像服务器拒绝登录。修复在客户端执行：

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519_ubuntu
ssh -v -i ~/.ssh/id_ed25519_ubuntu -p 2222 opsadmin@192.0.2.10
```

场景三：服务器端家目录或密钥文件属主不对。报错表现为密码已关、密钥也装了，但仍提示 `Permission denied (publickey)`，服务器日志里出现 `Authentication refused: bad ownership or modes for directory` 一类记录。原因是 `opsadmin` 的家目录被组写入，或 `.ssh` 目录权限大于 700。修复命令：

```bash
sudo chown -R opsadmin:opsadmin /home/opsadmin/.ssh
sudo chmod 755 /home/opsadmin
sudo chmod 700 /home/opsadmin/.ssh
sudo chmod 600 /home/opsadmin/.ssh/authorized_keys
```

## 六、生产环境最佳实践与安全建议

第一，坚持一机一密钥、一人一账号。私钥不复制到多台电脑之间流传，人员离职时只需删掉服务器上对应账号的 `authorized_keys` 那一行并禁用账号，不必全员换钥匙。第二，私钥必须设口令并配合客户端的 agent 托管，兼顾安全与便利；发现私钥有泄露嫌疑时，处置顺序是先在服务器上删除对应公钥，再在本机重新生成新密钥对，不要抱着观察看看的心态拖延。第三，改端口只做降噪，不能替代密钥与防火墙，内网可达的服务器更推荐只允许管理网段来源访问 SSH，具体放行写法见第 03 章。第四，定期复查三处：`sshd -T` 的生效值、`authorized_keys` 里有没有认不出的备注、认证日志里有没有持续的失败来源，复查发现异常来源时结合第 04 章的 Fail2ban 做自动封禁。第五，所有 sshd 配置变更都走同一套流程：先备份、再改文件、`sshd -t` 检查、新终端验证、保留回滚文件一周以上再清理。把这套流程变成肌肉记忆，SSH 加固就从高危操作变成日常操作。
