---
description: "SSH 加固解决的是谁能进门，本章解决的是进门之后每个人能做多少事。很多服务器事故不是外敌攻破，而是内部权限失控：多人共用一个账号，出了问题查不出是谁操作的；"
---

# 用户与组管理、Sudo 精细化与 PAM

## 一、概述与使用场景

SSH 加固解决的是谁能进门，本章解决的是进门之后每个人能做多少事。很多服务器事故不是外敌攻破，而是内部权限失控：多人共用一个账号，出了问题查不出是谁操作的；为了省事给所有人完整的 `sudo` 权限，等于人人都是 Root；离职人员的账号长期不清理，成为一扇没人记得的后门。Linux 的用户与组、Sudo、PAM 这三套机制就是用来把权限切细的：用户与组定义身份，Sudo 定义谁能以什么身份执行哪些命令，PAM 定义认证环节的统一规则，包括密码强度、失败锁定与登录限制。

不做精细化管理的瓶颈很现实。共用账号让审计日志失去意义，`sudo` 全放行让任何一次误操作或任何一个账号被盗都直接等于整机沦陷，弱密码规则让第 01 章关掉密码登录的努力在其他入口上白费，例如本地控制台与某些服务的密码认证。本章的目标状态是：一人一号、按组授权、Sudo 只放行工作真正需要的命令、密码强度由系统强制而不是靠自觉。完成之后，即使某个普通账号被攻破，攻击者也会被卡在低权限里，无法直接拿到 Root。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，需要一个当前可用的、带完整 `sudo` 权限的管理账号来执行操作，文中用 `ubuntu` 作为现有管理账号，用 `opsadmin` 作为新建的运维账号示例。操作涉及的软件包大多是系统自带，需要补充安装密码强度与登录统计相关的组件：

```bash
sudo apt update
sudo apt install -y libpam-pwquality libpam-modules-bin acl
getent passwd ubuntu
id ubuntu
```

逐项说明：`libpam-pwquality` 提供 `pam_pwquality.so` 模块，用来强制密码长度、复杂度与字典检查；`libpam-modules-bin` 提供 `pamtally2` 等工具的历史替代与管理命令，在 22.04 与 24.04 上失败计数主要由 `pam_faillock` 承担，相关命令是 `faillock`；`acl` 提供 `setfacl` 与 `getfacl`，用于文件级细粒度授权。`getent passwd ubuntu` 用来确认账号存在及其登录 Shell，`id ubuntu` 用来查看当前所属组，这两条是后面所有操作的前置核对，输出里应能看到账号的 UID、家目录与 Shell 为 `/bin/bash`。

!!! note "Ubuntu 的 Root 账号默认状态"
    Ubuntu 安装后 Root 账号默认是锁定密码状态，不能直接用密码登录，日常管理靠第一个普通账号加入 `sudo` 组后提权。本章保持这一设计，不要为了图方便给 Root 设置密码并开放登录，需要 Root Shell 时用 `sudo -i` 即可，退出后不留下常驻的高权限入口。

## 三、手把手操作步骤

### 3.1 创建用户与组并规划归属

先建组再建人，组是批量授权的抓手。假设团队有运维与开发两类角色，建两个组：

```bash
sudo groupadd ops
sudo groupadd devs
sudo adduser opsadmin
sudo usermod -aG ops opsadmin
sudo usermod -aG sudo opsadmin
id opsadmin
getent group ops
```

`adduser` 是 Ubuntu 提供的交互式建号命令，会依次提示设置密码与用户信息，并自动创建家目录与默认 Shell，比底层的 `useradd` 更适合手动管理场景。`usermod -aG` 中的 `-a` 必须保留，表示追加组；漏写 `-a` 只写 `-G` 会把账号从原有的其他组里全部移除，这是新手最容易踩的改组事故。只做服务运行、不需要人工登录的账号应单独创建并禁止登录 Shell：

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin appsvc
sudo passwd -l appsvc
id appsvc
```

`--system` 表示系统账号，UID 分配在系统段；`--shell /usr/sbin/nologin` 让该账号无法交互登录；`passwd -l` 锁定其密码。查看、修改与删除账号的日常命令汇总如下，删除前必须先确认该账号名下没有正在运行的业务进程与计划任务：

```bash
sudo chage -l opsadmin
sudo usermod -L opsadmin
sudo usermod -U opsadmin
sudo deluser opsadmin
sudo deluser --remove-home opsadmin
```

`chage -l` 查看密码过期信息，`usermod -L` 锁定账号用于临时停用，`-U` 解锁，`deluser` 只删账号保留家目录，带 `--remove-home` 连家目录一并删除。人员离职的标准动作是先锁定观察一周，确认无业务依赖后再彻底删除，而不是直接删除导致无法追溯文件归属。

### 3.2 Sudo 配置精细化

Sudo 的主规则来自 `/etc/sudoers` 与 `/etc/sudoers.d/` 目录。直接编辑主文件风险高，本章所有自定义规则都放进独立文件。改任何配置前先备份：

```bash
sudo cp /etc/sudoers /etc/sudoers.bak
sudo cp -a /etc/sudoers.d /etc/sudoers.d.bak
sudo ls -l /etc/sudoers.bak
```

新建运维组规则文件。编辑 sudoers 类文件必须用 `visudo`，它会在保存时做语法检查，写错时拒绝生效，避免一句语法错误让全机所有人失去提权能力：

```bash
sudo visudo -f /etc/sudoers.d/10-ops
```

写入以下完整内容：

```text
# 运维组可以管理服务状态与查看日志
%ops ALL=(root) /usr/bin/systemctl status *, /usr/bin/systemctl restart nginx, /usr/bin/journalctl
# 运维组可以编辑网络配置但不能获得通用 Shell
%ops ALL=(root) /usr/bin/nano /etc/netplan/*.yaml
# 单个账号的部署命令授权
opsadmin ALL=(root) NOPASSWD: /usr/bin/systemctl restart example-app
```

规则语法拆解，每条规则由四段组成：

| 片段 | 含义 | 示例对应 |
| --- | --- | --- |
| `%ops` | 授权对象，前缀 `%` 表示组，去掉 `%` 表示单个用户 | 运维组全体成员 |
| `ALL=` | 允许在哪台主机生效，单机环境固定写 ALL | 本机 |
| `(root)` | 允许以哪个身份运行 | 以 root 身份 |
| 命令列表 | 允许执行的命令，必须写绝对路径 | `/usr/bin/systemctl restart nginx` |

只放行具体子命令而不是整个程序，这一点非常关键。例如只写 `/usr/bin/systemctl` 等于放行全部服务管理动作；放行文本编辑器去改任意文件，等于变相给出 Root Shell，因为编辑器里可以另开 Shell 或改写 `/etc/shadow`，所以示例中把可编辑路径限定到 netplan 目录。保存后立即验证语法与某账号的实际授权清单：

```bash
sudo visudo -c
sudo -l -U opsadmin
sudo chmod 440 /etc/sudoers.d/10-ops
sudo ls -l /etc/sudoers.d/
```

`visudo -c` 应输出各文件 `parsed OK`；`sudo -l -U opsadmin` 会列出该账号真正能执行的命令，验收以这条输出为准，不要只看规则文件写了什么。规则文件权限必须是 440，属主 root，权限不对时 `sudo` 会忽略该文件并在日志里报警。

!!! warning "NOPASSWD 的真实风险"
    `NOPASSWD` 表示执行该命令时不再要求输入密码。它适合无人值守的自动化脚本调用单个固定命令，一旦范围写宽，风险立刻放大：攻击者只要拿到该账号的任意一个会话，哪怕只是某个 Web 服务以该账号被攻破，就会无门槛执行这条提权命令。生产环境只给全自动流程用 NOPASSWD，且只绑定一条带固定参数的命令，人工运维账号一律保留输密码这一步，密码本身就是第二道确认。

### 3.3 PAM 密码强度与登录限制

PAM 是所有认证入口共用的框架，改一次，SSH、本地登录、`passwd` 改密都会受益。先启用密码强度模块。改配置前先备份：

```bash
sudo cp /etc/pam.d/common-password /etc/pam.d/common-password.bak
sudo cp /etc/security/pwquality.conf /etc/security/pwquality.conf.bak
sudo nano /etc/security/pwquality.conf
```

在 `pwquality.conf` 中写入或确认以下有效行，井号开头的是注释行，不生效：

```ini
minlen = 14
dcredit = -1
ucredit = -1
lcredit = -1
ocredit = -1
maxrepeat = 3
gecoscheck = 1
dictcheck = 1
enforcing = 1
```

逐项讲解：`minlen = 14` 要求密码至少 14 位；`dcredit`、`ucredit`、`lcredit`、`ocredit` 为负数分别表示必须至少包含 1 位数字、1 位大写字母、1 位小写字母、1 位特殊字符；`maxrepeat = 3` 表示同一字符最多连续出现 3 次；`gecoscheck = 1` 禁止密码包含用户名等账号信息；`dictcheck = 1` 用字典检查常见弱词；`enforcing = 1` 表示不达标直接拒绝设置，而不是只警告。然后确认 `/etc/pam.d/common-password` 中存在调用该模块的一行：

```text
password requisite pam_pwquality.so retry=3
```

`retry=3` 表示改密时允许用户重试输入 3 次。再配置登录失败锁定，备份并编辑 faillock 配置：

```bash
sudo cp /etc/security/faillock.conf /etc/security/faillock.conf.bak
sudo nano /etc/security/faillock.conf
```

写入以下有效行：

```ini
deny = 5
fail_interval = 900
unlock_time = 600
audit
```

`deny = 5` 表示连续失败 5 次锁定；`fail_interval = 900` 表示只统计 900 秒窗口内的失败；`unlock_time = 600` 表示锁定 600 秒后自动解锁，紧急时管理员可用 `sudo faillock --user opsadmin --reset` 手动清零。最后给密码有效期设默认值，备份并编辑登录定义文件：

```bash
sudo cp /etc/login.defs /etc/login.defs.bak
sudo nano /etc/login.defs
```

确认以下三行取值，并用 `chage` 对已有账号单独落实，因为改默认值只影响之后新建的账号：

```ini
PASS_MAX_DAYS 180
PASS_MIN_DAYS 7
PASS_WARN_AGE 14
```

```bash
sudo chage --maxdays 180 --mindays 7 --warndays 14 opsadmin
sudo chage -l opsadmin
```

!!! tip "改 PAM 前先开好第二个会话"
    PAM 配置写错的后果是所有人都登不进来，包括管理员自己。编辑 `/etc/pam.d` 下任何文件之前，先保持一个已提权到 Root Shell 的会话不要关闭，改完立刻在新终端完整试一次登录与一次 `sudo`，确认无误才关闭保险会话。

## 四、效果验证与测试

第一，验证密码强度真的生效。用测试方式给 `opsadmin` 尝试设置一个弱密码，应被拒绝并给出不达标原因；再设置一个满足 14 位与四类字符的强密码，应成功：

```bash
sudo passwd opsadmin
```

期望现象：输入类似 `abc12345` 的短弱密码时，终端提示密码太短或未满足复杂度并要求重输；输入合规强密码后提示密码更新成功。密码内容不要写入任何文档或聊天记录，验证完请改回正式密码。

第二，验证 Sudo 白名单边界。以 `opsadmin` 登录后分别执行被授权与未被授权的命令：

```bash
sudo -l
sudo systemctl restart nginx
sudo apt update
```

期望结果：`sudo -l` 列出的命令与规则文件一致；重启 nginx 成功执行；`apt update` 若不在授权清单内，会提示该用户无权以 Root 身份运行该命令并被记录日志，这正是白名单生效的证据。第三，验证失败锁定。故意输错 5 次密码后查看锁定状态：

```bash
sudo faillock --user opsadmin
sudo faillock --user opsadmin --reset
faillock
```

第一条应显示失败计数与最近失败时间，第二条执行后计数清零，账号恢复可登录。

## 五、常见错误与排坑指南

场景一：编辑 sudoers 写错语法，全员无法提权。报错原文片段为 `>>> /etc/sudoers.d/10-ops: syntax error near line 5 <<<`，伴随执行任何 `sudo` 都直接报错退出。原因多为命令路径写成相对路径、漏写括号或把中文标点混进文件。修复方法：用尚在的 Root Shell 或单用户模式进入，先把坏文件移走恢复默认提权，再用 `visudo` 重新逐行写入：

```bash
sudo mv /etc/sudoers.d/10-ops /root/10-ops.bad
sudo visudo -c
sudo visudo -f /etc/sudoers.d/10-ops
```

预防方法只有一条：永远用 `visudo -f` 编辑，不要用普通编辑器直接改 sudoers 类文件。

场景二：`usermod` 漏写 `-a` 把自己踢出 sudo 组。现象是账号突然提示不在 sudoers 文件中，日志与终端出现 `opsadmin is not in the sudoers file` 一类提示。原因是执行了 `usermod -G ops opsadmin` 这类不带 `-a` 的命令，覆盖了全部附加组。修复需要用另一个仍有权限的管理账号重新追加：

```bash
sudo usermod -aG sudo opsadmin
groups opsadmin
id opsadmin
```

若所有管理账号都被踢出，只能通过控制台以恢复模式挂载系统盘后修改 `/etc/group` 中 `sudo` 组的成员列表，这也是必须至少保留两个管理账号的理由。

场景三：PAM 改完后所有登录被拒。报错表现为密码正确仍提示认证失败，日志中出现 `PAM unable to dlopen` 或模块名拼写错误的记录。原因通常是手写模块行时把 `pam_pwquality.so` 拼错，或引用了未安装的模块。修复是切到事先保留的 Root 会话，用备份还原对应文件再逐项重加：

```bash
sudo cp /etc/pam.d/common-password.bak /etc/pam.d/common-password
sudo grep -R "pam_pwquality" /etc/pam.d/
sudo ls /usr/lib/x86_64-linux-gnu/security/pam_pwquality.so
```

最后一条确认模块文件真实存在，路径不存在说明软件包没装好，先重新安装 `libpam-pwquality` 再改配置。

## 六、生产环境最佳实践与安全建议

第一，账号生命周期要有人管。入职建号、转岗改组、离职先锁后删，每个季度导一次账号清单人工复核，重点盯长期未登录但仍有 `sudo` 的账号，核对命令为 `lastlog` 配合 `getent passwd`。第二，组授权优先于个人授权，把人放进组、规则写给组，人员变动只动组成员关系，规则文件保持稳定，也减少手改 sudoers 的次数。第三，Sudo 规则遵循三条底线：命令写绝对路径、参数能限定就限定、编辑器与解释器类程序默认不放行，确需放行时按文件路径收窄。第四，所有提权行为都要可追溯，定期查看 `sudo` 日志，Ubuntu 上可用 `sudo journalctl _COMM=sudo --since today --no-pager` 抽查异常时段的提权记录。第五，服务账号与人的账号彻底分开，服务账号不进 `sudo` 组、不设可登录密码、不用作日常登录。权限体系的价值不在一次配好，而在每次人员与业务变化时都按同一套规则增删，坚持半年，服务器上就不会再出现说不清归属的账号与说不清来源的权限。
