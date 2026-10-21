---
description: "自建邮件服务器不只是装好 Postfix 和 Dovecot：能否送进对方收件箱，取决于 25 端口是否放行、PTR/SPF/DKIM/DMARC 是否齐全，以及 IP 信誉。"
---

# 邮件服务器：Postfix + Dovecot 与送达四件套

## 一、概述与使用场景

网站跑起来之后，很多站长会想顺手把邮件也自建了：用自己的域名收发信，还能给网站程序提供发信通道（注册验证、密码找回、订单通知）。但要先校准预期：**装好邮件软件只是第一步，能稳定送进 Gmail、Outlook 等大邮箱的收件箱（而不是垃圾箱或直接被拒），是另一场硬仗。** 本章先把系统搭对，再把决定送达率的四件套逐个配齐，最后给出送不出去时的判别方法。

先分清三个角色：

| 角色 | 全称与职责 | 本章对应软件 |
| --- | --- | --- |
| MTA | Mail Transfer Agent，传输代理：负责服务器之间投递、转发 | Postfix |
| MDA | Mail Delivery Agent，投递代理：负责把信存进邮箱并提供收取服务 | Dovecot |
| MUA | Mail User Agent，用户代理：用户操作的客户端 | 手机邮件 App、Thunderbird（本章不部署） |

一封信的旅程：MUA 经提交端口把信交给 Postfix（MTA）→ Postfix 查收件域名的 MX，经 25 端口交给对方 MTA → 对方 MDA 存入邮箱 → 收件人用 MUA 经 IMAP 从 Dovecot 拉取。收信方向同理。

端口全表：

| 端口 | 协议与用途 | 是否对公网开放 |
| --- | --- | --- |
| 25 | SMTP，服务器之间投递邮件 | 收信必须开放；发信需云厂商放行出站 |
| 587 | Submission，用户提交邮件，强制认证 + TLS | 开放，仅供自家用户提交 |
| 465 | SMTPS，隐式 TLS 的提交端口 | 开放（可选，与 587 二选一或并存） |
| 143 | IMAP 明文（可 STARTTLS） | 不建议开放明文 |
| 993 | IMAPS，TLS 加密的 IMAP | 开放，供用户收信 |
| 110 | POP3 明文 | 不建议开放 |
| 995 | POP3S，TLS 加密的 POP3 | 按需开放，新部署优先 IMAP |

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS（26.04 待核验，未实测）。
- 权限：sudo 账号，外加**域名 DNS 控制权**（能增删 A/MX/TXT）与**云厂商控制台权限**（改安全组、设 PTR、申请解封 25），缺一不可。
- 主机名先定好不要随意改：示例主机名 `mail.example.com`，公网 IP 示例 198.51.100.25，A 记录 `mail.example.com → 198.51.100.25` 需提前生效。
- 版本口径：Postfix、Dovecot、OpenDKIM 均用 Ubuntu 仓库随附版本，不写死小版本号；参数差异以本机 `postconf` / `doveconf` 输出为准。

!!! danger "多数云厂商默认封禁出站 25 端口"
    为打击垃圾邮件，主流云厂商默认封禁云服务器的**出站 25 端口**，有的可自助解封，有的需提工单，有的干脆不解封。装软件前先验证：`nc -vz gmail-smtp-in.l.google.com 25`，连不上多半就是被封。25 出站不通时 Postfix 只能收信、不能直投外域——不要反复重装，先走 3.8 中继路线或申请解封。

!!! warning "装好 ≠ 能进收件箱"
    对方收不收，综合看五件事：PTR 是否对齐、SPF/DKIM/DMARC 是否齐全且通过、IP 是否在黑名单上、IP 与域名信誉、内容是否触发过滤。新 IP 冷启动进垃圾箱很常见，需数周正常发送养信誉，没有配置能保证「一装好就进收件箱」。

前置检查命令（四条都通过再往下走）：

```bash
hostname -f
dig +short A mail.example.com
dig +short MX example.com
nc -vz gmail-smtp-in.l.google.com 25
```

期望结果：主机名输出 `mail.example.com`；A 记录返回服务器 IP；MX 在配置完成前可为空，但 DNS 面板必须能新增 MX；25 探测显示 succeeded / open。A 记录没生效就先去配解析，不要带着错误的主机身份装服务，后面证书、PTR、HELO 全会跟着错。

## 三、手把手操作步骤

### 3.1 改配置前先备份（统一动作）

邮件涉及多个服务配置，改错一处就可能收发全断。安装前后先备份（目录带日期）：

```bash
sudo mkdir -p /root/mail-backup-20261021
sudo apt update
sudo apt install -y postfix dovecot-imapd dovecot-lmtpd opendkim opendkim-tools mailutils dnsutils swaks
sudo cp -a /etc/postfix /root/mail-backup-20261021/postfix-orig
sudo cp -a /etc/dovecot /root/mail-backup-20261021/dovecot-orig
sudo cp /etc/mailname /root/mail-backup-20261021/mailname-orig 2>/dev/null || true
```

安装 Postfix 时会弹出交互界面：类型选 `Internet Site`，System mail name 填 `example.com`（根域名，不是 mail.example.com）。选错不用重装，main.cf 会逐项覆盖。

!!! warning "风险提示：不要开放中继"
    本机只替「已认证的自家用户」转发邮件：`mynetworks` 绝不能写 `0.0.0.0/0`，submission 必须强制认证。一旦成为开放中继，几小时内就会被垃圾邮件团伙利用，IP 进黑名单，送达率归零。

### 3.2 Postfix 主配置 main.cf 逐行讲解

编辑 `/etc/postfix/main.cf`，写入或核对以下关键参数（发行版默认文件里已有的同名参数要改成这里的值，不要保留两份）：

```ini
myhostname = mail.example.com
myorigin = /etc/mailname
mydestination = $myhostname, example.com, localhost.example.com, localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
inet_interfaces = all
inet_protocols = ipv4
home_mailbox = Maildir/
smtpd_banner = $myhostname ESMTP
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.example.com/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.example.com/privkey.pem
smtpd_tls_security_level = may
smtp_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination
virtual_transport = lmtp:unix:private/dovecot-lmtp
milter_default_action = accept
smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:8891
milter_protocol = 6
```

同时确认 `/etc/mailname` 内容只有一行 `example.com`。逐行讲解：

| 参数 | 含义与取值说明 |
| --- | --- |
| myhostname | 对外自报的主机名，必须能正向解析到本机 IP，且与 PTR 对齐 |
| myorigin / mailname | 本机发信默认补的域名，决定 `user@` 后面跟什么 |
| mydestination | 哪些域名算「本机负责收的信」，写错会把自己的信往外投或拒收 |
| mynetworks | 免认证可信来源，只留回环；公网用户一律走认证提交 |
| home_mailbox | Maildir 格式存信，与 Dovecot 的 mail_location 必须一致 |
| smtpd_tls_cert_file / key_file | 对外出示的证书，指向 3.5 签发的证书 |
| smtpd_tls_security_level = may | 对方支持 TLS 就加密、不支持也允许投递（机会型加密） |
| smtpd_tls_auth_only = yes | 只在 TLS 连接上才允许报密码，防明文嗅探 |
| smtpd_sasl_type / path | 认证交给 Dovecot 的 SASL socket，Postfix 不存密码 |
| smtpd_recipient_restrictions | 顺序即规则：可信放行 → 已认证放行 → 其余非本域一律拒绝，防开放中继的关键行 |
| virtual_transport | 收到的信经 LMTP 交给 Dovecot 投递 |
| smtpd_milters | 把信交给 OpenDKIM（8891）做签名与验签 |

### 3.3 在 master.cf 启用 submission（587）并强制 TLS + 认证

编辑 `/etc/postfix/master.cf`，找到被注释的 submission 段，去掉注释并改成：

```ini
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
```

逐行要点：`encrypt` 表示 587 **强制** TLS，没加密不许提交（与 25 的 may 对比）；`smtpd_recipient_restrictions` 在此被覆盖为「只有已认证用户能提交」；最后一行告诉 milter 这是本机外发信，OpenDKIM 据此签名而非验签。改完先不启动，等 Dovecot 与证书就位后一起重载。

### 3.4 Dovecot：IMAP、存储与 SASL 对接

Dovecot 配置在 `/etc/dovecot/conf.d/` 下按文件逐个改（已在 3.1 备份）。

第一，协议与存储位置。编辑 `/etc/dovecot/conf.d/10-mail.conf`，确认 `mail_location = maildir:~/Maildir`。这一行必须与 Postfix 的 `home_mailbox = Maildir/` 对应：信由 LMTP 投进 Maildir、IMAP 从同一位置读，写岔了就会出现「对方说投递成功、邮箱里却没有信」的经典故障。

第二，SSL。编辑 `/etc/dovecot/conf.d/10-ssl.conf`：

```ini
ssl = required
ssl_cert = </etc/letsencrypt/live/mail.example.com/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.example.com/privkey.pem
disable_plaintext_auth = yes
```

`ssl = required` 表示收信必须加密；路径前的 `<` 是 Dovecot 语法（读文件内容），不要漏写。993（IMAPS）默认已启用，后续用 `ss -tlnp` 确认监听即可。

第三，认证与对 Postfix 的 SASL 出口。编辑 `/etc/dovecot/conf.d/10-auth.conf`，确认 `auth_mechanisms = plain login`，并确认文件底部包含系统用户认证文件：

```ini
!include auth-system.conf.ext
```

再编辑 `/etc/dovecot/conf.d/10-master.conf`，在 `service auth { }` 块内加入给 Postfix 用的 socket：

```ini
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
```

这正是 main.cf 里 `smtpd_sasl_path = private/auth` 指向的位置（相对 Postfix 队列目录）。路径或权限写错，SMTP AUTH 会直接报认证服务不可用，是新手最常踩的对接坑。再确认 `service lmtp` 的 socket 为 `/var/spool/postfix/private/dovecot-lmtp`，与 virtual_transport 对应。

### 3.5 TLS 证书：复用 Certbot 章节签发

证书签发与续期复用本部分第 05 章 [HTTPS 自动化证书](05-https-certificates.md) 的 Certbot 路线，为邮件主机名单独签一张：

```bash
sudo certbot certonly --standalone -d mail.example.com
sudo ls /etc/letsencrypt/live/mail.example.com/
```

期望看到 `fullchain.pem` 与 `privkey.pem`，正是 3.2 与 3.4 引用的路径。standalone 方式签发瞬间需要 80 端口空闲，本机已跑 Nginx 时改用第 05 章的插件或 DNS-01 方式。续期后要让两个服务重载新证书（部署钩子或手工执行）：

```bash
sudo postfix reload
sudo systemctl reload dovecot
```

### 3.6 用户与认证：系统用户路线

用户体系有两条路线。**系统用户路线**：邮箱账号即 Linux 系统账号，配置最少，适合十人以内的小团队，缺点是每个邮箱用户都是一个系统账号。**虚拟用户路线**：账号只存于数据库或独立密码文件，与系统账号无关，适合人数多或对外提供邮箱服务的场景，但要多维护一层用户库。本章给系统用户路线的完整步骤，虚拟用户只做选型说明。

```bash
sudo adduser zhang
sudo passwd zhang
sudo mkdir -p /home/zhang/Maildir
sudo chown -R zhang:zhang /home/zhang/Maildir
```

该用户邮箱即 `zhang@example.com`，密码即系统密码。建好后启动服务并检查语法：

```bash
sudo postfix check
sudo doveconf -n
sudo systemctl enable --now postfix dovecot opendkim
sudo systemctl restart postfix dovecot
ss -tlnp | grep -E ':(25|587|993|8891)'
```

期望结果：`postfix check` 无输出即无错误；`doveconf -n` 不报错；25、587、993 均在监听。再放行防火墙：

```bash
sudo ufw allow 25/tcp
sudo ufw allow 587/tcp
sudo ufw allow 993/tcp
```

验证 SMTP AUTH 是否真的可用，用 swaks 一条命令完成「连接 587 → STARTTLS → 认证 → 投一封测试信」：

```bash
swaks --to zhang@example.com --from zhang@example.com \
  --server mail.example.com --port 587 --tls \
  --auth-user zhang --auth-password '示例密码请替换' \
  --header "Subject: auth test" --body "smtp auth ok"
```

期望输出包含 `Authentication successful` 与 `250 OK`。也可用 `openssl s_client -connect mail.example.com:993` 验证 IMAPS，看到 `Verification: OK` 即通过。测试密码只临时使用，不要写进脚本长期保存。

### 3.7 送达四件套：SPF / DKIM / DMARC / PTR

四件套是 DNS 与发信配置的配合，缺得越多越容易进垃圾箱。逐个配、逐个用 dig 验证。

**① SPF：声明「谁有权用我的域名发信」。** 在域名 DNS 里加一条 TXT 记录：

```text
example.com.  TXT  "v=spf1 mx ip4:198.51.100.25 -all"
```

含义：允许本域 MX 主机与指定 IP 发信。结尾 `-all` 是名单外硬拒（HardFail），`~all` 是软失败（SoftFail，多半仍接收但标记可疑）。初期先用 `~all` 观察一两周，确认没漏合法发信源后再切 `-all`；直接上 `-all` 又漏写发信源，等于亲手拒掉自己的信。

**② DKIM：给每封外发信加数字签名。** 用 OpenDKIM 生成密钥并发布公钥：

```bash
sudo mkdir -p /etc/opendkim/keys/example.com
sudo opendkim-genkey -b 2048 -d example.com -D /etc/opendkim/keys/example.com -s mail -v
sudo chown -R opendkim:opendkim /etc/opendkim/keys
cat /etc/opendkim/keys/example.com/mail.txt
```

把 `mail.txt` 内容发布为 DNS 记录 `mail._domainkey.example.com` 的 TXT。在 `/etc/opendkim.conf` 中确认：`Mode sv`（既签名又验签）、`Canonicalization relaxed/simple`、`Socket inet:8891@127.0.0.1`，并用 KeyTable / SigningTable 把域名映射到生成的密钥（按发行版示例文件替换域名与选择器即可）。该 socket 正是 main.cf 里 milter 指向的 8891 端口。改完 `sudo systemctl restart opendkim postfix`。

**③ DMARC：告诉收信方「验不过时怎么处理我域名的信」。** 在 DNS 加 TXT 记录（主机名 `_dmarc.example.com`）：

```text
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s"
```

策略渐进：先 `p=none`（只收报告、不处置）观察一两周，看 rua 聚合报告里有没有漏配的合法发信源；再升 `p=quarantine`（进垃圾箱）；确认无误后升 `p=reject`（直接拒收）。一上来就 reject，漏配的发信会被直接拒掉且很难察觉。

**④ PTR：发信 IP 的反向解析。** PTR 不在域名 DNS 面板里配，而在**云厂商控制台的 IP 管理 / 反向解析**处设置（有的需提工单）：把 198.51.100.25 的 PTR 设为 `mail.example.com`，与 A 记录、myhostname 三者对齐。大邮箱对 PTR 缺失或不匹配的 IP 常直接降权甚至拒收，无替代方案。

四件套统一验证（每条都要有返回且与发布值一致；刚发布查不到先等 TTL 过期再判读）：

```bash
dig +short TXT example.com
dig +short TXT mail._domainkey.example.com
dig +short TXT _dmarc.example.com
dig +short -x 198.51.100.25
dig +short MX example.com
```

期望结果依次为：含 `v=spf1` 的记录、含 `v=DKIM1` 与公钥的记录、含 `v=DMARC1` 的记录、返回 `mail.example.com.`、返回 `10 mail.example.com.`。

### 3.8 备选路线：relayhost 经第三方中继发送

25 出站被封且无法解封时，不要硬扛：在 main.cf 里把外发信交给一家合规的第三方 SMTP 中继服务（各大云厂商与邮件服务商都有此类产品，按其文档给的服务器名、端口与账号配置）：

```ini
relayhost = [smtp-relay.example.net]:587
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt
```

凭据文件写法为一行 `服务器名 账号:密码`，生成哈希并锁权限：

```bash
sudo nano /etc/postfix/sasl_passwd
sudo postmap /etc/postfix/sasl_passwd && sudo chmod 600 /etc/postfix/sasl_passwd*
sudo postfix reload
```

注意：走中继后 SPF 要把中继商声明的发信网段或 include 加进去；DKIM 本机签或中继商签二选一，不要双签；PTR 由中继商负责。收信不受影响，仍由本机 25 端口直收。

### 3.9 队列与日常排查工具

信发不出去先看队列：

```bash
sudo postqueue -p
sudo postqueue -f
sudo postsuper -d ALL deferred
sudo tail -f /var/log/mail.log
```

`postqueue -p` 列积压与失败原因；`postqueue -f` 立即重试全部队列；`postsuper -d ALL deferred` 删延迟队列（不可恢复，只在确认是废信时用）。日志 `/var/log/mail.log` 抓三个字段：`status=sent` 已送达、`status=deferred` 暂时失败会重试、`status=bounced` 被硬拒（看同行 DSN 码与原因）。投递失败分类：

| 类型 | 特征 | 判别与处理 |
| --- | --- | --- |
| 5xx 硬拒 | status=bounced，码如 550 | 看原因文本：PTR/SPF/DKIM 按 3.7 补齐；黑名单问题去名单官网查 IP 并申诉 |
| 4xx 软退 | status=deferred，码如 450/421 | 多为灰名单或限流，等自动重试；持续数小时再查 |
| 25 不通 | connect 超时、无回应码 | `nc -vz 对方MX主机 25` 复测，不通即出站被封，走解封或 3.8 中继 |
| 配置错 | 进不了队列或 AUTH 失败 | 先过 `postfix check`、`doveconf -n`，再核对 3.2/3.4 的 socket 路径 |

### 3.10 回滚与恢复步骤

改完服务起不来时按此退回（备份见 3.1）：

```bash
sudo cp -a /root/mail-backup-20261021/postfix-orig/. /etc/postfix/
sudo cp -a /root/mail-backup-20261021/dovecot-orig/. /etc/dovecot/
sudo postfix check
sudo doveconf -n
sudo systemctl restart postfix dovecot opendkim
sudo postqueue -p
```

期望结果：检查无报错、服务 active、队列不再新增失败。只改坏单个文件时优先只还原该文件（如还原 main.cf 后 `sudo postfix reload`），不要整目录覆盖把修好的配置一并退掉。DNS 侧同理：改 SPF/DMARC 前抄下旧值，出现大面积退信先改回旧值再查原因。

## 四、效果验证与测试

验证分四层，从本机到跨域逐层推进：

第一层，本机投递（不经网络，验 MDA 与邮箱目录）：

```bash
echo "local delivery test" | mail -s "local-test" zhang@example.com
sudo ls /home/zhang/Maildir/new/
```

期望结果：new 目录出现新文件，即信已投进邮箱；再用客户端读出来确认内容完整。

第二层，587 认证外发（验提交与签名）：用 3.6 的 swaks 命令把收件人换成外部邮箱，期望输出 250 且外部邮箱收到信；打开信件的「原始邮件」视图，确认头部含 `DKIM-Signature`，且 SPF、DKIM、DMARC 三项均为 Pass。

第三层，跨域投递与在线送达测试：给两三个不同服务商的邮箱各发一封，确认进的是收件箱还是垃圾箱；再用 mail-tester 类在线测试服务做综合打分——用法是：打开测试页拿到临时收件地址，用自建邮箱往该地址发一封内容正常的测试信，回到页面看总分与逐项扣分说明（SPF/DKIM/DMARC/PTR/黑名单/内容格式），按扣分项回对应小节逐个修。分数只是参考，真实邮箱的收件箱结果优先。

第四层，四件套全查：上线前再过一遍 3.7 的五条 dig 命令逐条打勾，并用 `ss -tlnp | grep -E ':(25|587|993)'` 与 `sudo ufw status` 复查监听面——只有计划内的端口在监听，110/143 等明文端口没有对公网开放。

## 五、常见错误与排坑指南

场景一：外发信全卡队列，日志报连接超时。原文片段：`connect to gmail-smtp-in.l.google.com[142.250.x.x]:25: Connection timed out`。原因是云厂商封了出站 25（见第二章 danger）：`nc -vz gmail-smtp-in.l.google.com 25` 同样超时而其他端口正常即可定性。处理：申请解封，或按 3.8 切中继，不要反复改 main.cf 瞎试。

场景二：客户端报认证失败，日志报 SASL 不可用。原文片段：`warning: SASL: Connect to private/auth failed: No such file or directory`。原因是 auth socket 没建在期望路径，或 Dovecot 没启动。修复：核对 3.4 的 `unix_listener` 段落完整存在，重启两服务后确认 socket 存在：

```bash
sudo ls -l /var/spool/postfix/private/auth
sudo doveadm auth test zhang@example.com
```

后一条输出 `auth succeeded` 才算认证链通。

场景三：信能发出但全进垃圾箱，或被 550 拒收且原因含 PTR 字样。退信原文片段：`550-5.7.25 The IP address sending this message does not have a PTR record setup`。原因是反向解析缺失或与 HELO 主机名不一致。修复顺序：`dig +short -x 你的IP` 看现状 → 云厂商控制台把 PTR 设为 `mail.example.com` → 等缓存过期后复查 → 再发测试信。若 PTR 正常仍进垃圾箱，按第二章五因素逐项排查，不要只盯一条记录反复改。

## 六、生产环境最佳实践与安全建议

第一，只开必要端口。对公网只放行 25、587（或 465）、993；143/110 明文端口不对公网开放。第二，防开放中继是红线：`mynetworks` 只留回环、submission 强制 TLS + 认证、`reject_unauth_destination` 不删；上线前用外部网络自测一次「不认证能否经本机给外域发信」，能发即立刻停服修复。第三，凭据文件权限锁 600，证书私钥沿用 Certbot 默认权限，不要放宽。

第四，防爆破与监控：给 Dovecot 与 Postfix 接入 fail2ban 类防护，对反复认证失败的 IP 自动封禁；把 `postqueue -p` 的积压量纳入日常巡检，队列突然暴涨往往是被滥用或被大面积拒收的第一信号。第五，变更纪律沿用全站规范：改配置前先 cp 备份（见 3.1），改后必跑 `postfix check` / `doveconf -n`，再 reload 而非直接 restart，最后用 swaks 做一次认证外发冒烟。第六，送达率靠长期维护：定期查 IP 黑名单、看 DMARC 报告有没有新的未授权发信源、证书与 DKIM 密钥按计划轮换。
