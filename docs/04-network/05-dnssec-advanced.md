---
description: "DNS 进阶讲三件事：权威、递归、缓存三种角色如何分工，区域文件每条记录到底在说什么，以及如何用 DNSSEC 给解析结果加上可验证的签名，并安全地完成记录迁移。"
---

# DNS 进阶：权威/递归与 DNSSEC

## 一、概述与使用场景

[第 01 章](01-dns.md) 已带你把 BIND9、dnsmasq、CoreDNS 装好跑起来；本章不重复安装，往深走三层：讲清三种角色（权威、递归、缓存）如何分工，把区域文件逐行拆透，最后给域名加上 DNSSEC 签名并完成一次安全的记录迁移。读完你应当能回答：一条解析结果是从谁嘴里说出来的、凭什么可信、改错了怎么退回去。

三种角色模型（同一台 BIND9 可以兼任，但职责边界必须分清）：

| 角色 | 职责 | 回答特点 | 典型部署 |
| --- | --- | --- | --- |
| 权威服务器 | 只回答自己负责的域名（区域）数据，是记录的最终来源 | 回答带 AA（权威应答）标志，不替别人查 | 域名注册商解析、自建 BIND9 主/从 |
| 递归服务器 | 替客户端从根一路迭代查到底，并把结果交给客户端 | 面向客户端，需要明确服务范围 | 内网统一解析、企业 DNS |
| 缓存 | 把查过的结果按 TTL 存一段时间（通常与递归同体） | 缓存期内直接答，不再外出查询 | 递归服务器、本地 stub 解析器 |

三种部署形态的取舍：**自建权威**掌控力最强，记录改完即生效，还能做 DNSSEC 签名与主从同步，代价是可用性要自己扛（至少两台、异地更佳）；**本地递归**（内网一台 BIND9 兼缓存）能统一出口、加速重复查询、挡掉一部分恶意域名，但它只服务内网，绝不能对公网开放；**公共递归**（运营商或大型公共解析服务）省维护、节点多，但解析路径不可控，内网域名不能往那儿送，且日志与隐私在别人手里。常见组合：对外域名用自建或托管权威，办公与机房内网用本地递归加缓存，公共递归只作上游转发或故障兜底。

!!! danger "开放递归会被用来打人，也会打到你自己"
    递归服务如果对整个互联网开放（`allow-recursion { any; }` 且防火墙放行公网 53），很快会被扫描发现并利用做 DNS 放大攻击：攻击者伪造受害者 IP 发小查询，你的服务器把大响应砸向受害者。后果是你的带宽被吃满、IP 被投诉甚至被云厂商停机。递归只允许内网网段，权威服务器则关掉递归（`recursion no;`），这是本章反复强调的分工底线。

与相邻章节的分工：记录的新增删除与三家软件的安装配置在 [第 01 章](01-dns.md)；MX、SPF、DKIM、DMARC 等邮件相关记录的**业务含义与送达影响**在 [邮件服务器](../09-web-hosting/06-mail-server.md) 一章，本章只讲它们作为 DNS 记录的语法与写法；CAA 记录在本章 3.2 讲，它决定谁能为你的域名签发网站证书。

## 二、环境准备与前置条件

- 操作系统：Ubuntu Server 22.04 LTS 或 24.04 LTS（26.04 待核验，本章命令未在 26.04 上实测）。
- 前置状态：已按第 01 章装好 BIND9 并有一个能正常解析的区域（本章沿用示例域名 example.com、服务器 192.0.2.53、区域文件 `/etc/bind/zones/db.example.com`）；另需 `dnsutils`（提供 dig）与 BIND9 自带的 `delv` 验证工具。
- 域名侧权限：做 DNSSEC 时，你必须能登录**域名注册商或上级 DNS 控制台**提交 DS 记录——签名只在自己服务器上做、上级不发布 DS，信任链就是断的，这是最常见的「配了 DNSSEC 却没生效」原因，先确认有这个权限再动手。
- 时间必须准：DNSSEC 签名有生效与过期时间戳，服务器时间漂移会让签名「尚未生效」或「提前过期」。先按第 04 章把 Chrony 对齐，再开始签名。

!!! warning "风险提示：DNSSEC 配错的代价是全域解析失败"
    普通记录写错，最多某个名字查不到；DNSSEC 的 DS 与 DNSKEY 对不上、或签名过期，所有开启校验的递归服务器都会判你的域名为伪造（bogus），返回 SERVFAIL，效果等于整个域名从互联网消失。第一次启用务必先在测试域名或低流量时段演练，并预先准备好第六章与 3.7 的回滚动作。

开始前先做一轮基线检查，后面每步都拿它对照：

```bash
named -v
dig @192.0.2.53 example.com SOA +short
dig @192.0.2.53 example.com NS +short
resolvectl status | head -20
```

期望结果：SOA 返回主服务器名与序列号，NS 返回权威列表——先保证「没签名时能查」，再谈「签名后可信」。

## 三、手把手操作步骤

### 3.1 改配置前先备份

本章要动的还是第 01 章那批文件，沿用全站统一动作，备份目录带日期：

```bash
sudo mkdir -p /root/dns-backup-20261021
sudo cp -a /etc/bind /root/dns-backup-20261021/bind-orig
sudo cp /etc/bind/zones/db.example.com /root/dns-backup-20261021/db.example.com.orig
ls /root/dns-backup-20261021/
```

后面出问题都从这里还原，不要凭记忆手改回去。

### 3.2 区域文件逐行深挖：SOA 与记录全解

正向区域文件的骨架（第 01 章已写过，这里逐字段拆解语义）：

```ini
$TTL 3600
@   IN  SOA ns1.example.com. opsadmin.example.com. (
        2026102101  ; serial
        7200        ; refresh
        3600        ; retry
        1209600     ; expire
        3600 )      ; minimum / 负缓存 TTL
    IN  NS  ns1.example.com.
    IN  NS  ns2.example.com.
    IN  MX  10 mail.example.com.
    IN  TXT "v=spf1 mx -all"
    IN  CAA 0 issue "letsencrypt.org"
ns1 IN  A   192.0.2.53
www IN  A   192.0.2.80
www IN  AAAA 2001:db8::80
app IN  CNAME www.example.com.
```

SOA 五个计时字段逐个讲（单位均为秒）：

| 字段 | 含义 | 取值要点 |
| --- | --- | --- |
| serial | 区域版本号，从服务器与缓存靠它判断新旧 | 用「日期+两位流水」如 2026102101；**只增不减**，改小或忘改，从服务器不会同步、缓存也不刷新 |
| refresh | 从服务器多久向主服务器对一次版本 | 7200（2 小时）是常见内网取值，变更频繁可调小 |
| retry | 对版本失败后多久重试 | 必须小于 refresh，如 3600 |
| expire | 主服务器失联多久后，从服务器宣布本地数据作废停答 | 1209600（两周）量级，太短会让一次主故障演变成全域停摆 |
| minimum | 否定回答（查无此名）的缓存时长 | 太大时，新加的记录会被「查无此名」的缓存挡住很久，3600 以内为宜 |

各记录类型一行一条地讲：

| 记录 | 示例行要点 | 讲解 |
| --- | --- | --- |
| NS | `@ IN NS ns1...`（至少两条） | 声明谁是本域权威；NS 指向的主机名必须另有 A/AAAA 记录（胶水），只有一台权威是单点 |
| A / AAAA | `www IN A 192.0.2.80` | 名字到 IPv4 / IPv6 的正向映射，最常用；改 IP 就是改这里，然后等 TTL 过期 |
| CNAME | `app IN CNAME www.example.com.` | 别名，指到另一个名字再继续解析；注意：CNAME 不能与同名的其他记录共存，域名根（@）不能写 CNAME |
| MX | `@ IN MX 10 mail.example.com.` | 邮件投到哪台主机，前面的数字是优先级（小者优先）；目标必须是有 A 记录的主机名，不能填 IP、不能指 CNAME。业务细节见邮件章 |
| TXT | `@ IN TXT "v=spf1 ..."` | 自由文本，实际承载 SPF、域名验证、DMARC（写在 `_dmarc` 子名下）与 DKIM（写在 `选择器._domainkey` 子名下），写法与送达影响见 [邮件章 3.7](../09-web-hosting/06-mail-server.md) |
| PTR | 写在反向区域，见 3.3 | IP 到名字的反向映射，邮件与日志排障都看它 |
| CAA | `@ IN CAA 0 issue "letsencrypt.org"` | 声明只允许哪家 CA 为本域签证书，没写的 CA 必须拒签；与第 09 部分证书章配合，防误签与钓鱼证书 |

一个易错点单独强调：区域文件里写完整域名必须以点号结尾（`www.example.com.`），漏了点会被拼上区域名变成 `www.example.com.example.com`，`named-checkzone` 不一定报错，dig 一查才发现——改完区域文件必须用 dig 实查每条新记录。

### 3.3 正反向解析与 PTR 的维护责任

反向区域把 IP 倒序写进 `in-addr.arpa`（第 01 章已建 `2.0.192.in-addr.arpa`），文件内只写最后一段：

```ini
53  IN  PTR ns1.example.com.
80  IN  PTR www.example.com.
25  IN  PTR mail.example.com.
```

维护责任要分清：**你自有网段（如内网 192.0.2.0/24 由你管）**，反向区域自己维护；**云厂商分配的公网 IP**，反向解析的权威在厂商手里，PTR 只能去厂商控制台设置或提工单，你在自己 BIND9 里写了也不算数——这正是邮件章里 PTR 必须去控制台配的原因。正反要一致：A 记录说 www 在 192.0.2.80，PTR 就应把 192.0.2.80 指回 www，不一致时邮件送达与日志溯源都会受影响。IPv6 的反向区域是 `ip6.arpa`，按半字节倒序书写，原理相同，本章不展开示例。

### 3.4 DNSSEC：给区域加上可验证的签名

原理是一条链。权威用私钥给每组记录生成签名（RRSIG），公钥以 DNSKEY 发布在区域里，再把公钥摘要（DS 记录）交父域发布。校验方从根信任锚出发：根签顶级域的 DS → 顶级域签你的 DS → DS 对上你的 DNSKEY → DNSKEY 验过每组 RRSIG，任何一环对不上即判 bogus。两把钥匙分工：ZSK（区域签名密钥）签普通记录、轮换频繁；KSK（密钥签名密钥）只签 DNSKEY 本身，轮换要同步更新父域 DS，动作重。

BIND9 用 `dnssec-policy` 自动签名，不再手工敲签名命令。在 `/etc/bind/named.conf.options` 或单独策略文件里定义策略，并在区域声明里引用（改前已在 3.1 备份）：

```ini
dnssec-policy "default-policy" {
    keys {
        ksk lifetime unlimited algorithm 13;
        zsk lifetime 60d algorithm 13;
    };
};

zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    dnssec-policy "default-policy";
    inline-signing yes;
};
```

逐行讲解：`algorithm 13` 是 ECDSA P-256，签名短、校验快，是当前主流选择，老的 RSA 算法不要再新用；KSK 设 `lifetime unlimited` 表示不自动轮换（KSK 轮换要动父域 DS，留给人工计划执行）；ZSK 设 60 天自动轮换，全程不用人工介入；`inline-signing yes` 表示 BIND 一边对外提供未签的编辑文件、一边自动维护签名后的发布版本，你继续改原来的区域文件即可。改完检查并重载：

```bash
sudo named-checkconf
sudo rndc reload example.com
sudo rndc signing -list example.com
dig @192.0.2.53 example.com DNSKEY +short
```

期望结果：signing 列表显示区域已签名，DNSKEY 查询能返回公钥记录。接着取 DS 摘要去父域发布：

```bash
sudo dnssec-dsfromkey -2 /var/cache/bind/Kexample.com.+013+*.key
```

把输出的 DS 记录（域名、算法、摘要类型 2 与摘要值）原样填到注册商控制台的「DNSSEC / DS 记录」处，提交后等父域生效，再做第四章的完整验证。父域没发布 DS 之前，本机签名只是自说自话，外部校验方不会认。

密钥轮换注意事项：ZSK 自动轮换靠预发布机制（新钥匙先发布、等缓存过期再启用签名），策略模式下 BIND 自动完成，你要做的是别在轮换窗口内改策略或删 key 文件；KSK 轮换是人工事件：生成新 KSK → 等新 DNSKEY 全网可见 → 把新 DS 追加到父域 → 等旧 DS 缓存过期 → 再撤旧 DS 与旧 KSK，任何一步抢跑都会断链。key 文件默认在 `/var/cache/bind`（directory 参数指定处），纳入备份，但**私钥文件不要外传、不要进公开仓库**。

!!! warning "签名过期是 DNSSEC 的经典事故"
    RRSIG 有明确的生效与过期时间（默认量级为数周）。自动签名正常运行时 BIND 会提前续签；一旦进程停过、目录权限坏了或时间漂移，签名会在无人察觉时过期，过期瞬间全网校验方同时判 bogus。防御靠监控：把「签名剩余有效期」纳入巡检（见第四章的判读方法），不要等用户报障。

### 3.5 TTL 与记录迁移：五步流程

迁服务器、换 IP、换解析商，本质都是让全网缓存从旧答案平滑切到新答案，靠的是 TTL。完整流程五步：

1. **提前降 TTL**：迁移前至少一个旧 TTL 周期，把要改的记录（及区域 $TTL）从 3600 降到 300，改 serial 后重载。期望：`dig` 查到的 TTL 已显示 300 上下，说明新 TTL 开始向外扩散。
2. **等待旧缓存自然过期**：等满一个旧 TTL（原为 3600 就等至少 1 小时，稳妥等 2 倍）。这一步没有捷径，dig 多查几个公共解析器确认 TTL 都已变小再往下走。
3. **切换记录**：把 A/AAAA（或 NS）改到新值，serial 加一，重载。新旧服务器在此期间**双双保持在线**：拿到新答案的客户端连新机，还抱旧缓存的连旧机，两边都能服务才不中断。
4. **验证**：按第四章的方法从多个解析器、多个网络查新记录，确认返回新值且 DNSSEC 校验仍通过（改记录后 BIND 会自动重签，验证别漏了签名这一层）。
5. **恢复 TTL**：稳定运行一到两天后把 TTL 调回 3600，serial 加一，重载。TTL 长期挂在 300 会让权威服务器查询量与故障敏感度都变高，不要图省事一直低着。

迁移回滚：切换后发现新机有问题，把记录改回旧值、serial 再加一、重载即可——因为第 2 步已把 TTL 降到 300，回滚最多 5 分钟量级就全网生效；这正是先降 TTL 的全部意义。回滚窗口内旧服务器绝不能提前下线或改数据，确认新机稳定（第 5 步完成）后才进入下线流程。若迁移的是 NS（换解析商），还要在注册商处改委派，并保留旧解析商的区域数据并行至少 48 小时再删。

### 3.6 诊断：解析不一致、污染与「改了没生效」

先分清你查的是哪一层。用三组命令对照，能把大多数「解析不对」定位到具体环节：

```bash
dig @192.0.2.53 www.example.com A
dig @198.51.100.53 www.example.com A
dig www.example.com A
dig +trace www.example.com
resolvectl query www.example.com
```

判读流程：第一条直查**你的权威**——连它都答错或无答，是区域文件/serial/重载的问题，回 3.2 与 3.7；第二条换一个**外部递归**查——权威对、外部错且返回的是旧值，多半是缓存未过期（看返回的 TTL 还剩多少，剩大几百秒就是还在等缓存），外部返回的是一个你从没配过的地址，才怀疑**污染或劫持**，继续用 `dig +trace` 从根一级级跟下来，看在哪一层开始偏离权威答案；第三、四条查**系统默认链路**——dig 直查都对、浏览器或程序里仍不对，多半是本机 stub 缓存或应用自带解析在作怪，用 resolvectl 看本机实际走哪个上游，必要时 `sudo resolvectl flush-caches` 后复测。

「改了没生效」九成不是没生效，而是缓存：你改的是权威，客户端问的是某台递归的缓存，TTL 没走完它就是不更新。处理口诀：先 dig 权威确认新值已发布 → 看外部答案的剩余 TTL 估算还要等多久 → 等不起就只能通知用户侧刷缓存或换解析，你这边除了提前降 TTL 没有别的加速手段，**不要靠反复改 serial 或重启服务催缓存**，对别人的缓存毫无作用。

### 3.7 回滚与恢复步骤

改区域或加签名后出现大面积解析失败，按顺序退回（备份在 3.1）：

```bash
sudo cp /root/dns-backup-20261021/db.example.com.orig /etc/bind/zones/db.example.com
sudo cp -a /root/dns-backup-20261021/bind-orig/. /etc/bind/
sudo named-checkconf
sudo named-checkzone example.com /etc/bind/zones/db.example.com
sudo rndc reload
dig @192.0.2.53 example.com SOA
```

期望结果：检查全过、SOA 能返回且 serial 为备份时的值，本机直查恢复正常；外部恢复速度取决于各递归缓存里错误答案的 TTL，只能等待，期间保持服务别再改动。若故障源头是 DNSSEC（校验方全判 bogus 而你一时修不好），紧急止血动作是**先去注册商处删除 DS 记录**：DS 一撤，校验方会把你的域当作「未签名」而非「伪造」，解析先恢复，事后再慢慢修签名链——注意删 DS 的生效同样受父域 TTL 影响，所以第二章才要求第一次启用先演练。

## 四、效果验证与测试

验证分三层：配置语法、记录正确、签名链完整，逐层执行：

```bash
sudo named-checkconf
sudo named-checkzone example.com /etc/bind/zones/db.example.com
sudo named-checkzone 2.0.192.in-addr.arpa /etc/bind/zones/db.192.0.2
dig @192.0.2.53 www.example.com A +noall +answer
dig @192.0.2.53 www.example.com AAAA +noall +answer
dig @192.0.2.53 example.com MX +noall +answer
dig @192.0.2.53 example.com TXT +noall +answer
dig @192.0.2.53 -x 192.0.2.80 +noall +answer
```

期望结果：两个 check 命令结尾均显示 OK；每条 dig 都在 ANSWER 区返回与区域文件一致的值，反向查询返回 `80.2.0.192.in-addr.arpa. ... PTR www.example.com.`。任一条对不上，先回 3.2 查点号结尾与 serial，不要带着错记录去验签名。

DNSSEC 验证链用 delv 做端到端校验（它会像递归服务器一样从信任锚一路验下来）：

```bash
delv @192.0.2.53 www.example.com A
dig @192.0.2.53 www.example.com A +dnssec
dig ds example.com +short
dig dnskey example.com +short
```

期望结果：delv 输出带 `; fully validated` 字样，即整条链验过；带 `+dnssec` 的 dig 在 ANSWER 区能看到 RRSIG 记录，且 flags 里含 `ad`（已认证数据）标志的前提是查询走的是会校验的递归，直查权威时重点看 RRSIG 是否存在与有效期；DS 与 DNSKEY 两条查询要能互相印证（父域发布的 DS 摘要能对上本域 KSK）。再随手验签名有效期：

```bash
dig @192.0.2.53 example.com SOA +dnssec | grep RRSIG
```

RRSIG 行括号语义里含签名过期时间（格式为 YYYYMMDDHHmmss），离过期不足一周就该查自动续签为什么没动，这是 3.4 经典事故的事前发现方式。

## 五、常见错误与排坑指南

场景一：启用 DNSSEC 后外部全网 SERVFAIL，本机直查却正常。报错表现：`dig @外部递归 www.example.com` 返回 `status: SERVFAIL`，权威日志无异常。原因几乎总是信任链断裂：父域还没发布 DS、DS 抄错一位，或本域在发布 DS 后又轮换了 KSK。判别与修复按顺序做：

```bash
dig ds example.com +short
delv www.example.com A 2>&1 | head -20
```

delv 会明确指出断在哪一环（如 `DS mismatch` 或 `no valid RRSIG`）。DS 没发布就去注册商补发布；摘要对不上就用 `dnssec-dsfromkey` 重新生成并替换父域记录；刚轮换过 KSK 的，按 3.4 的顺序把父域 DS 同步过来。修不好先按 3.7 删 DS 止血。

场景二：RRSIG 过期导致周期性全域故障。报错原文片段（校验方视角）：`delv` 输出 `RRSIG has expired`，或递归日志出现 `validating ... : RRSIG validity period has not begun / has expired` 类字样。根因是自动续签停摆：BIND 曾长时间停机、key 目录权限被改坏，或系统时间漂移。修复：先 `timedatectl` 校时，再检查 `/var/cache/bind` 属主应为 bind 可写，重启 bind9 后用 `rndc signing -list example.com` 确认重新签名，并复查第四章的 RRSIG 过期时间已顺延。修复后立刻给签名有效期加监控告警，同类事故只许发生一次。

场景三：改了记录，同事说还是旧地址。表现是权威 dig 已返回新值，个别客户端仍连旧 IP。原因就是 3.6 讲的缓存：对方递归还存着旧答案，剩余 TTL 没走完。判别：让对方执行 `dig www.example.com` 看返回 TTL 还剩多少，剩余秒数就是最长等待时间；若等待远超 TTL 仍不变，再用 `dig +trace` 排查是不是对方网络在劫持解析。结论要留痕：把权威查询结果与对方结果截图对照，避免在「到底生效没有」上反复拉扯。

## 六、生产环境最佳实践与安全建议

第一，角色分离。对外权威只做权威（关递归、只答自己的域），对内递归只服务内网网段，两台分开部署；实在合一，也要用 allow-recursion 与防火墙把递归面锁死在内网（见第一章 danger）。第二，权威至少双机主从。从服务器用区域传送自动同步，`allow-transfer` 只允许从服务器地址，并配合 TSIG 密钥认证，不要对任意来源开放整区传送——整份区域数据泄露等于把全公司主机清单送给攻击者。

第三，DNSSEC 要运维化，不是一次性配置。签名有效期、DS 与 DNSKEY 一致性纳入监控；KSK 轮换走 3.4 的人工流程并留记录；算法选 13（ECDSA），还在用老 RSA 算法的域按迁移流程逐步切换。第四，变更纪律沿用全站规范：改区域文件前先备份（3.1）、改完必 bump serial、必过 named-checkzone、必 dig 实查、迁移类变更必走 3.5 的降 TTL 流程，五步缺一不算完成。

第五，TTL 按用途分级：稳定记录 3600 起步，要动的记录提前降；不要把全域 TTL 长期设成几十秒图「生效快」，那会放大权威负载与故障影响面。第六，日志与限速：开启查询日志或采样，关注异常大响应查询；公网权威可考虑响应速率限制（RRL）缓解反射攻击，但先在测试域验证，别误伤正常用户。总原则：DNS 是所有服务的前置，对它的变更永远比对业务本身更保守一级。
