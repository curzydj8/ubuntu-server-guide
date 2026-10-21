---
description: "企业服务器多了之后，逐台维护本地账号必然失控。本章讲集中身份：LDAP 目录存账号、Kerberos 发票据、SSSD 在每台服务器上做缓存与离线登录，并用 realmd 把 Ubuntu 加入 Active Directory。"
---

# 企业身份认证：LDAP、Kerberos 与 SSSD

## 一、概述与使用场景

前两章管的是单台服务器的本地账号：谁能登录、谁能 `sudo`。服务器只有三五台时，逐台建账号、逐台删离职人员还能应付；到了二三十台，问题立刻出现：新人入职要在每台机器上重复建号，离职人员漏删一台就是一扇后门，改密码要挨个登录，审计时也无法回答「这个人到底能进哪些机器」。集中身份解决的就是这件事：账号只在中心目录里建一次，每台服务器登录时去中心核对，人员增减、改密、禁用都只改一处。

本章包含四个组件，先用一句话类比讲清分工。LDAP 是通讯录：目录服务，存账号、组、属性，谁是谁、属于哪个组都查它。Kerberos 是售票处：它不直接放行任何人，而是先验证身份再发票据，之后拿票据进各个服务，不用反复输密码。SSSD 是每台服务器上的前台加保险柜：它把 LDAP、Kerberos 的查询结果接进本机的登录流程，并把已验证过的身份缓存下来，中心暂时不可用时靠缓存维持登录。PAM 与 NSS 是本机的两道接口：PAM 决定「登录时怎么验」，NSS 决定「系统按名字查用户和组时去哪查」，SSSD 就挂在这两道接口后面。

组件关系用文字结构表示：

```text
用户登录（SSH / 控制台）
        │
   PAM（认证）── NSS（查用户/组）
        │           │
        └── SSSD ───┘
              │
      ┌───────┴────────┐
   LDAP 目录          Kerberos KDC
   （账号与组）        （TGT / 服务票据）
```

在微软体系里，Active Directory（AD）把 LDAP 与 Kerberos 打包在一起提供，域控（Domain Controller）同时是目录服务器和 KDC。本章主路线就是让 Ubuntu 通过 SSSD 接入 AD：企业已有 AD 的，直接复用，不必再自建一套身份系统。

不做集中身份的风险也要说清：账号分散在各台机器上，组织无法统一执行密码策略与离职禁用，任何一台漏网机器都可能成为攻击者长期潜伏的入口。集中化不是把本地账号全部消灭，本章最后会专门强调：应急用的本地管理员账号必须保留，它是域控故障时最后的退路。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，Ubuntu 26.04 的相关包名与 SSSD 行为标记为「待核验」，未在 26.04 上实测前不要照抄到生产。操作需要一台已加入域规划的服务器、一个带 `sudo` 的本地管理账号（本章示例为 `opsadmin`，必须全程保留），以及域管理员提供的加域权限账号（加域时一次性使用，不写入任何配置文件）。

开始前有两项前置必须先达标，缺一不可。第一，DNS 必须指向域控或能完整解析域名的内部 DNS：Kerberos 与 AD 发现都依赖 DNS 里的 SRV 记录，DNS 不对，后面所有步骤都会以莫名其妙的方式失败，本机 DNS 的配置方法见第 04 部分 [DNS 配置](../04-network/01-dns.md)。第二，时间必须同步：Kerberos 默认只容忍 5 分钟的时钟偏差，本机与域控差超过 5 分钟，票据直接被拒，时间同步的配置见 [时间同步与日志](../04-network/04-time-logging.md)，先按那一章把 `systemd-timesyncd` 或 Chrony 配好再回来。

先做三项自查，全部通过再进入第三节：

```bash
timedatectl status
resolvectl status
getent hosts dc01.corp.example.com
```

期望结果：`timedatectl` 显示 `System clock synchronized: yes`；`resolvectl` 中当前网卡的 DNS 服务器是域内 DNS（示例 `10.10.0.5`），不是公网 DNS；`getent hosts dc01.corp.example.com` 能返回域控的内网地址（示例 `10.10.0.10`）。其中 `dc01.corp.example.com` 是示例域控名，`corp.example.com` 是示例域名，请替换成你所在组织的真实值，后文同理。

!!! danger "先确认应急通道，再动身份配置"
    本章会改 PAM 与 NSS，改错的后果是所有人都登不进来，包括你自己。动手前确认两件事：本地应急管理员账号能正常用密码登录（见本章 3.6 节），云控制台或物理控制台可用。全程保持一个已登录会话不关闭，每改完一段配置先开新终端验证，再继续下一步。

## 三、手把手操作步骤

### 3.1 概念补课：Kerberos 票据与 SSSD 缓存

Kerberos 的流程分三步。第一步，用户向 KDC 出示凭据，KDC 发一张 TGT（Ticket Granting Ticket，票据授予票据），相当于入园手环，默认有效期以域策略为准。第二步，访问某个服务时，拿 TGT 向 KDC 换该服务的服务票据，相当于凭手环领单项项目的票。第三步，把服务票据出示给目标服务，服务只验票、不问密码。整个过程密码只在第一步出现一次，这也是 Kerberos 比「每台机器各存一份口令哈希」更安全的原因。时钟容差 5 分钟是协议层面的防重放设计：票据带时间戳，双方时钟差太多，票据会被判定为不可信，这不是配置粗心能绕过去的选项。

SSSD 的架构记住三个词。Provider 是数据来源，例如 `id_provider = ad` 表示身份数据来自 AD，`auth_provider`、`access_provider` 同理可分别指定。缓存是 SSSD 在本机维护的副本，存已查过的用户、组与一次成功认证的结果，查询先走缓存再回源，所以 `id` 命令第二次执行明显更快。离线登录指域控不可达时，SSSD 用缓存里保存的上次成功认证结果放行已登录过的人，前提是配置里开启了 `cache_credentials`，且该用户此前在本机成功登录过至少一次。从没在这台机器登录过的人，在离线状态下无法首次登录，这一点要在排障时先想清楚。

### 3.2 进阶前置：单机与小团队的轻量路线

没有 AD、只有几台机器的小团队，不必为了集中身份先搭一整套域。本节只给思路与要点，不展开成完整的 LDAP 建站教程，需要完整建站时请结合所用发行版的官方文档与 OpenLDAP 官方文档操作。

路线是 SSSD 加自建 OpenLDAP：单独一台目录服务器运行 OpenLDAP 提供 LDAP 目录，Kerberos 可以先不上，认证直接走 LDAP 的绑定校验，安全性靠 LDAPS（TLS 加密）保证。各客户端安装 SSSD，把 `id_provider` 与 `auth_provider` 都指向 `ldap`。要点只有四条：一，目录服务器必须启用 TLS，明文 LDAP 会把认证流量裸奔在内网里；二，账号与组的编号规划先定好，`uidNumber`、`gidNumber` 全网唯一，后期改号等于重建账号；三，目录服务器本身要纳入备份与监控，它故障时所有客户端只能靠 SSSD 缓存撑着；四，客户端的应急本地账号纪律与本章 3.6 节完全相同，一条都不能省。团队已经有 AD 或预期会接入 AD 的，直接走下一节的主路线，不要在自建目录上投入太多。

### 3.3 主路线：安装软件包并发现域

在待加域的服务器上安装所需软件包。包名以 Ubuntu 22.04 / 24.04 发行版仓库为准，个别包名在不同版本间如有出入，以 `apt search` 的实际搜索结果为准，不要凭记忆硬写：

```bash
sudo apt update
sudo apt install -y realmd sssd sssd-tools libnss-sss libpam-sss adcli samba-common-bin oddjob oddjob-mkhomedir packagekit
apt search realmd
```

各包分工：`realmd` 提供 `realm` 命令，负责发现域与加域的编排；`sssd` 是核心守护进程；`sssd-tools` 提供 `sssctl` 等排障工具；`libnss-sss` 与 `libpam-sss` 把 SSSD 接进 NSS 与 PAM；`adcli` 在底层执行与 AD 的具体交互；`samba-common-bin` 提供加域过程中用到的 Samba 工具；`oddjob` 与 `oddjob-mkhomedir` 负责用户首次登录时自动创建家目录。安装完成后，先发现域，确认 DNS 里的信息完整：

```bash
realm discover corp.example.com
```

期望输出包含域的名称、类型为 `kerberos-member` 或与 AD 相关的标识，并列出所需的软件包。能发现，说明 DNS 的 SRV 记录可达；发现不了，先停在这里查 DNS，不要跳过这步直接加域，失败原因十有八九在 5.2 节。

### 3.4 执行加域并核对 SSSD 配置

加域需要域管理员授权账号，命令会交互式询问该账号的密码，密码不要出现在命令行参数里：

```bash
sudo realm join --user=joinadmin corp.example.com
realm list
sudo systemctl status sssd --no-pager
```

参数说明：`--user=joinadmin` 指定用于加域的域账号，`joinadmin` 是示例名；该账号只需有把计算机加入域的权限，不需要域管理员全权。`realm join` 成功时没有报错输出，失败会直接给出原因。`realm list` 应能列出已加入的域及登录策略等信息，`sssd` 服务应为 `active (running)`。

加域会自动生成 `/etc/sssd/sssd.conf`。先备份，再逐行核对关键参数：

```bash
sudo cp /etc/sssd/sssd.conf /root/sssd.conf.bak.$(date +%F)
sudo ls -l /etc/sssd/sssd.conf
sudo nano /etc/sssd/sssd.conf
```

!!! warning "sssd.conf 的权限必须是 600"
    `/etc/sssd/sssd.conf` 里可能包含绑定凭据等敏感信息，SSSD 要求该文件权限为 `0600` 且属主为 `root`，权限过松时 SSSD 会拒绝启动。核查命令是 `sudo ls -l /etc/sssd/sssd.conf`，不对就执行 `sudo chmod 600 /etc/sssd/sssd.conf` 再启动服务。

关键参数逐行讲解（以 `realm join` 生成的常见内容为例，实际以你机器上的文件为准）：

| 配置行 | 含义 | 说明 |
| --- | --- | --- |
| `domains = corp.example.com` | 本机启用的 SSSD 域 | 必须与后面方括号段名一致，写错等于该域不生效 |
| `[domain/corp.example.com]` | 域配置段开始 | 段内参数只作用于这个域 |
| `id_provider = ad` | 身份数据来自 AD | `id`、`getent` 查到的域用户与组都源于此 |
| `ad_domain = corp.example.com` | AD 域名 | 与 `realm discover` 的结果保持一致 |
| `krb5_realm = CORP.EXAMPLE.COM` | Kerberos 领域名 | 惯例全大写，与小写的 DNS 域名是两套写法，不要混 |
| `cache_credentials = True` | 缓存已验证凭据 | 离线登录的前提，建议开启；安全要求极高的机器可关，关了断网即无法用域账号登录 |
| `use_fully_qualified_names = True` | 用户名带域名后缀 | 开启时登录名是 `user@corp.example.com`，关闭时是 `user`；全站必须统一，见 5.4 节 |
| `fallback_homedir = /home/%u@%d` | 家目录模板 | `%u` 是用户名、`%d` 是域名；与下一行的覆盖项共同决定家目录实际路径 |
| `access_provider = ad` | 访问控制交给 AD | 谁能登录可结合 `realm permit` 再收一层，见 3.5 节 |

改完配置后重启 SSSD 使新参数生效，并确认没有报错：

```bash
sudo systemctl restart sssd
sudo sssctl domain-status corp.example.com
```

### 3.5 家目录、组权限与登录范围

域用户在本机没有家目录，首次登录要自动创建。确认 PAM 里启用了 mkhomedir：

```bash
grep mkhomedir /etc/pam.d/common-session
sudo pam-auth-update --enable mkhomedir
```

`grep` 无输出时用第二条命令启用，启用后在列表中确认 `oddjob-mkhomedir` 或 `pam_mkhomedir` 已勾选。之后域用户首次登录会自动在 `fallback_homedir` 指定的路径下建家目录。

授权不要逐人做，要按 AD 组做。给运维组授予 `sudo`，用独立文件管理，改前先看清现有规则：

```bash
sudo visudo -f /etc/sudoers.d/ad-ops
```

写入一行（组名前加 `%`，组名含空格或用全限定名时按 `realm list` 显示的写法照抄）：

```text
%ops-admins ALL=(ALL:ALL) ALL
```

保存后必须验证语法，语法错的 sudoers 文件会让所有人无法提权：

```bash
sudo visudo -c
getent group ops-admins
```

`visudo -c` 期望输出包含 `parsed OK`；`getent group` 应能列出组成员，列不出来先按第 5.3 节清缓存，不要反复改 sudoers 文件。

登录范围默认是域内所有用户都能登录这台机器，生产服务器通常要收紧。两种做法取舍如下：`realm permit --groups 'ops-admins'` 按组放行，粒度细、适合业务服务器；`realm permit --all` 与默认策略适合通用办公终端。示例：

```bash
sudo realm permit --groups 'ops-admins'
sudo realm permit --deny --all
realm list
```

先放行目标组、再拒绝其余，并用 `realm list` 核对 `login-policy` 一行已变更。注意收紧前确认应急本地账号不受影响：`realm permit` 只管域账号，本地账号走本地 PAM，二者不要混为一谈。

### 3.6 应急访问：域控不可用时怎么办

这是本章最重要的一节。域控不可用分三种情况，处置各不相同。

第一种，域控短时不可达（网络抖动、域控重启）。满足三个条件时域账号仍能登录：`cache_credentials = True`、该用户此前在本机成功登录过、缓存未过期。缓存凭据的保留期限以 SSSD 配置与域策略为准，离线期间改过的域密码在本机不生效，恢复连接后以域端为准。

第二种，需要主动处置：怀疑缓存损坏或信息陈旧时，按固定顺序操作，先清缓存再重启服务，不要反过来：

```bash
sudo sssctl cache-expire -E
sudo systemctl restart sssd
sudo sssctl domain-status corp.example.com
```

第三种，域控长期下线（机房故障、域重建）。此时不要在本机反复尝试加域或删域，先切换到本地应急管理员维持运维，保住业务与日志，等域端恢复或明确重建方案后再处理成员关系；贸然 `realm leave` 会把本机与域的信任关系断开，恢复成本更高。

本地应急管理员的纪律是硬性的：保留至少一个本地账号（例如 `opsadmin`）带强口令与完整 `sudo`，口令存入密码管理器并定期演练登录；该账号只用于应急，不做日常登录。

!!! danger "不要把本地救援账号一并域化或删除"
    加域顺手把本地账号删掉、或把最后一个本地管理员改成域认证，是最危险的动作：域控一旦不可用且缓存失效，这台机器将没有任何可登录的管理员，只能靠控制台救援模式重建。任何「清理无用本地账号」的提议，先核对是否动到了最后一个本地应急账号，是就立即停下。

## 四、效果验证与测试

按顺序执行，每一步都给出期望结果，某一步不符先排障再继续：

```bash
id zhangsan@corp.example.com
getent passwd zhangsan@corp.example.com
realm list
sudo sssctl domain-status corp.example.com
```

期望结果：`id` 输出该域用户的 `uid`、`gid` 与所属组，组信息与 AD 端一致；`getent passwd` 返回一行完整的 passwd 格式记录，家目录与 `fallback_homedir` 模板吻合；`realm list` 显示已加入的域与登录策略；`domain-status` 显示该域为 `Online` 且列出已连接的服务器。接着做一次真实登录验证，用新终端以域账号登录，并验证组授权：

```bash
ssh zhangsan@corp.example.com@192.0.2.20
ls -ld ~
sudo -l
```

期望新终端能完成登录、家目录自动创建且属主正确、`sudo -l` 的输出与 3.5 节授予的组权限一致（非授权组成员应显示无对应条目）。最后验证离线能力：在测试机或维护窗口内临时阻断到域控的网络，再用已登录过的域账号登录，应能凭缓存成功；从未登录过的域账号此时应失败，这是预期行为。验证完立即恢复网络并记录结论。

回滚方法：本章的变更集中在 SSSD 与 PAM。需要整体回退时，先退出域再卸包，最后恢复本地登录验证：

```bash
sudo cp /root/sssd.conf.bak.YYYY-MM-DD /etc/sssd/sssd.conf
sudo realm leave corp.example.com
sudo apt remove -y realmd sssd sssd-tools
sudo systemctl restart ssh
```

回退后必须用本地应急账号实际登录一次确认通道完好，再清理残留配置。日期占位请替换为你备份时的实际日期。

## 五、常见错误与排坑指南

场景一：时钟偏差导致 Kerberos 认证失败。典型报错为 `kinit: Clock skew too great while getting initial credentials`，SSH 登录则表现为域账号密码明明正确却反复被拒。原因是本机与域控时间差超过 5 分钟，票据被判不可信。先查时间再查密码：

```bash
timedatectl status
date -u
sudo systemctl restart systemd-timesyncd
kinit zhangsan@CORP.EXAMPLE.COM
```

`kinit` 能正常换到票据（可用 `klist` 查看）说明时钟问题已解除；仍报错则按 [时间同步与日志](../04-network/04-time-logging.md) 改用 Chrony 并核对上游时间源，不要去改 Kerberos 的容差来掩盖时钟问题。

场景二：DNS 解析不到域控与 SRV 记录。典型表现是 `realm discover` 找不到域、`realm join` 报找不到 KDC。Kerberos 与 AD 发现依赖 `_kerberos._udp` 与 `_ldap._tcp` 等 SRV 记录，客户端 DNS 指向公网时这些记录根本不存在。判读与修复：

```bash
resolvectl status
dig SRV _ldap._tcp.corp.example.com
dig SRV _kerberos._udp.corp.example.com
```

期望两条 `dig` 都能返回域控主机名与端口；返回空或超时，就是 DNS 指向或区域配置的问题，把客户端 DNS 改回域内 DNS（改法见 04 部分 DNS 章）后重试，不要在本机手写 hosts 绕过 SRV 发现，那样加域或许能过，后续票据与定位故障会层出不穷。

场景三：`id` 查不到用户。域账号在 AD 里明明存在，本机 `id` 却提示无此用户。多半是 SSSD 缓存未更新或枚举未开启，先按顺序清缓存再重启服务：

```bash
sudo sssctl cache-expire -E
sudo systemctl restart sssd
sudo sssctl domain-status corp.example.com
id zhangsan@corp.example.com
```

顺序不要颠倒：只重启不清缓存，陈旧的否定结果还在；只清缓存不重启，运行中的进程可能仍持有旧状态。清完仍查不到，再检查 `sssd.conf` 的 `domains` 与段名是否一致，并用 `sudo journalctl -u sssd -n 100 --no-pager` 看连接域控是否报错。

场景四：登录名不一致。开了 `use_fully_qualified_names = True` 时必须用 `user@corp.example.com` 登录，只写 `user` 会查无此人；关掉这个开关后老脚本里的全限定名又可能对不上。处理原则是全站统一一种写法，修改该参数后清缓存、重启 SSSD，并同步修订 `AllowUsers`、sudoers 与运维文档中的账号写法，改完用两种目标写法各实测一次，只保留生效的那一种对外公布。

## 六、生产环境最佳实践与安全建议

第一，授权一律按组不按人。人员变动只改 AD 组员关系，本机不留逐人放的 sudoers 碎片，季度复查一次 `realm list` 的登录策略与 `/etc/sudoers.d/` 的内容。第二，本地应急账号制度化：至少一个、强口令、进密码管理器、每季度实际登录演练一次，并写进值班手册；它的存在不是对集中化的否定，而是集中化可用的前提。第三，加域操作留痕：每次 `realm join`、`realm permit` 变更都记录操作人、时间与授权单号，SSSD 配置备份与变更前快照保留至少一个发布周期。第四，时间与 DNS 当作身份基础设施来维护：域成员机的 NTP 与 DNS 纳入监控告警，时钟偏差超过 1 分钟就预警，不要等 Kerberos 报错才发现。第五，缓存策略与安全要求匹配：跳板机、敏感服务器可评估关闭 `cache_credentials` 换取更严格的在线校验，代价是断网即断登录，这个取舍必须写进该机器的运维说明。第六，Ubuntu 26.04 成员机的加域流程目前为「待核验」，升级前先在测试机完整走一遍本章验证清单，通过后再排生产窗口。
