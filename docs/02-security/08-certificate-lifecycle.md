---
description: "证书签出来只是开始。本章讲证书与私钥的全生命周期治理：证书链判读、私钥存放与权限、全机盘点、续期失败保命、吊销与轮换，以及到期监控脚本与定时告警。"
---

# 证书与密钥生命周期管理

## 一、概述与使用场景

一张证书要经历生成密钥、签发、部署、监控、续期、轮换、吊销与归档。任一阶段失管都会直接伤业务：链不完整时部分浏览器报错、私钥泄露时攻击者可冒充站点、续期通道坏了没人发现时证书在凌晨过期。本章讲这套治理，而不是再讲一遍怎么签证书。

与第 09 部分的分工先说清：签发与自动续期在 [第 09 部分《HTTPS 自动化证书》](../09-web-hosting/05-https-certificates.md)，那边讲 Certbot 与 acme.sh 的申请、验证与续期重载。本章不重复那些命令，只讲签发之外的问题：链怎么判读、私钥放哪里、权限收多紧、全机有多少张证书、续期失败怎么保命、何时必须吊销、轮换怎么不断服务、到期监控怎么落地。

适用场景包括：多站点证书说不清清单、通配符证书分发后需要统一盘点、续期失败后补监控与应急、私钥疑似泄露时判断是否吊销、团队交接时核对台账。单站单证书同样适用，台账可更简单。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，命令按 OpenSSL 与 systemd 官方文档核对，属于「文档核对」级别；Ubuntu 26.04 标记为「待核验」，升级后先在测试机重跑第 4 节验证再纳入台账。需要带 `sudo` 的账号，盘点与监控脚本建议以 root 运行，才能读到收紧后的私钥目录。

开始前确认工具齐备：

```bash
openssl version
which openssl find systemctl
ls -ld /etc/ssl/certs /etc/ssl/private
```

期望：`openssl version` 正常输出；`/etc/ssl/private` 存在且权限不宽于 710。业务证书放在其他目录的，把路径记进台账，盘点要覆盖。

改配置前先备份，这是所有回滚的前提。证书与密钥整目录备份到带日期目录，保持原权限与属主：

```bash
sudo mkdir -p /root/cert-backup-$(date +%F)
sudo cp -a /etc/letsencrypt /root/cert-backup-$(date +%F)/letsencrypt
sudo cp -a /etc/ssl/private /root/cert-backup-$(date +%F)/ssl-private
sudo chmod 700 /root/cert-backup-$(date +%F)
ls -l /root/cert-backup-$(date +%F)/
```

说明：`cp -a` 保留权限、属主与时间戳，不要用普通复制，否则私钥权限可能被放宽。备份含私钥明文，敏感程度与源文件相同，不要放进网盘明文同步目录。每次轮换、切换、吊销前都再备一份，日期目录不覆盖旧备份。

## 三、手把手操作步骤

### 3.1 证书链结构与完整性判读

一张对外证书很少是孤立的，它处在一条信任链里：

```text
根 CA 证书（自签名，预装在系统与浏览器信任库中）
  └─ 中间 CA 证书（由根 CA 签发，负责日常签发）
       └─ 叶子证书（你的站点证书，由中间 CA 签发）
```

根 CA 极少直接签发叶子证书，日常签发由中间 CA 完成，根私钥可离线保存。服务器必须部署「叶子 + 中间」完整链，通常是 `fullchain.pem`；只部署叶子证书时，桌面浏览器可能靠缓存补链看似正常，手机浏览器与命令行客户端则会直接报链不完整。

先看单张证书里写了什么：

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -subject -issuer -dates
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -text | head -n 60
```

判读：`subject` 是主体；`issuer` 是签发者，叶子的 `issuer` 应等于中间证书的 `subject`，对不上是配错文件；`dates` 的当前时间须落在 `notBefore` 与 `notAfter` 之间。再看域名覆盖：

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -ext subjectAltName
```

期望列出全部覆盖域名。访问域名不在此列会报名称不匹配，补签时带齐即可。

再做链验证，`openssl verify` 需要可信根、待验叶子与中间证书：

```bash
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -untrusted /etc/letsencrypt/live/example.com/chain.pem /etc/letsencrypt/live/example.com/cert.pem
```

期望输出以 `OK` 结尾。常见失败判读如下：

| 报错片段 | 含义 | 处置方向 |
| --- | --- | --- |
| `unable to get local issuer certificate` | 找不到签发者，中间证书缺失或配错 | 补齐中间证书，确认部署的是 fullchain |
| `certificate has expired` | 叶子或中间证书已过期 | 用 `-dates` 定位哪一张过期，再走续期或轮换 |
| `Verify return code: 21` | 在线握手时链无法验证，与缺中间证书高度相关 | 对照服务器实际发出的链重新部署 fullchain |

在线看服务器真实发出的链比看磁盘更可靠，配置写错路径时磁盘是对的、服务发的却是旧的：

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null | grep -E "s:|i:|Verify return code"
```

参数 `-servername` 不能省：同一 IP 多站点时，没有 SNI 会拿到默认站点的证书，判读会张冠李戴。

### 3.2 私钥治理：存放、权限与生成取舍

私钥是链里唯一必须保密的东西：证书可公开，私钥泄露后任何人都能冒充站点，只能吊销加换新。治理四条：集中存放于 `/etc/ssl/private` 或工具受控目录，不散落在站点与家目录；权限 600、属主 root 或专用服务账号；只有真正需要读私钥的服务账号能读，不图省事设 644；不经聊天、工单与邮件明文外传，分发走受控通道并留记录。核查用 3.3 节盘点与第 4 节 `stat`。

!!! danger "私钥绝不进代码仓库与容器镜像层"
    私钥写进 Git 仓库，哪怕随后删除，历史里仍然留着，等于已经公开；打进容器镜像层同理，能拉镜像的人都能逐层取出私钥。这两种情况都按「私钥已泄露」处理：立即吊销、生成全新密钥对重新签发，并清理仓库历史或废弃镜像。预防：仓库用 `.gitignore` 挡住私钥路径并在提交前自查；镜像构建时私钥在运行期挂载注入，不写进构建上下文。

生成密钥的加密口令取舍：用口令加密私钥更安全，文件被拷走也无法直接用；代价是服务每次启动与重载都要人工输入口令，无人值守的自动重启与续期会卡住。生产 Web 服务常见取舍是：在线私钥不加密，靠 600 权限、磁盘加密与审计兜底，保证自动恢复可用；离线备份私钥与根级密钥必须加密并把口令分开保管。

生成一把新私钥并当场收紧权限的写法如下，路径按本机目录调整：

```bash
sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /etc/ssl/private/example.com.key
sudo chmod 600 /etc/ssl/private/example.com.key
sudo chown root:root /etc/ssl/private/example.com.key
stat -c "%a %U %G %n" /etc/ssl/private/example.com.key
```

### 3.3 全机证书盘点：先有清单，再谈治理

治理第一步是盘点：有哪些证书、给谁用、何时到期。先找出候选文件：

```bash
sudo find /etc /var/www /opt -type f \( -name "*.crt" -o -name "*.pem" \) 2>/dev/null | sort
```

再逐个读出主体与到期日，汇成清单：

```bash
for f in $(sudo find /etc/letsencrypt /etc/ssl -type f \( -name "*.crt" -o -name "*.pem" \) 2>/dev/null); do echo "== $f"; openssl x509 -in "$f" -noout -subject -enddate 2>/dev/null || echo "not-a-cert"; done
```

逐段讲解：`find` 圈定常见目录；循环对每个文件执行 `openssl x509 -enddate -subject` 只取到期日与主体；解析失败输出 `not-a-cert`，多半是私钥或拼接文件，先确认用途不要删。`fullchain.pem` 含多张证书，`openssl x509` 默认只读第一张叶子证书，这正是盘点想要的。

按到期日排序看谁最危险：

```bash
sudo find /etc/letsencrypt /etc/ssl -type f -name "*.pem" 2>/dev/null | while read -r f; do end=$(openssl x509 -in "$f" -noout -enddate 2>/dev/null | cut -d= -f2); if [ -n "$end" ]; then echo "$end | $f"; fi; done | sort
```

台账至少含：域名、证书与私钥路径、签发机构、到期日、签发方式、责任人。盘点每月一次，新签、轮换、吊销后当场更新。

### 3.4 续期失败处置：先保命，再排因

续期通道失败且证书临近到期时，先保命、后排因，不要反复试错耗尽额度。保命是切回最近一份已验证备份：

```bash
sudo ls -l /root/cert-backup-2026-01-01/letsencrypt/live/example.com/
sudo cp -a /root/cert-backup-2026-01-01/letsencrypt/live/example.com/fullchain.pem /etc/nginx/ssl/example.com/fullchain.pem
sudo cp -a /root/cert-backup-2026-01-01/letsencrypt/live/example.com/privkey.pem /etc/nginx/ssl/example.com/key.pem
sudo nginx -t
sudo systemctl reload nginx
```

日期目录替换为实际备份日期。注意边界：旧证书本身已过期时切回无法恢复浏览器信任，此时要尽快修好签发通道或换一家机构签发，签发命令回第 09 部分执行。

常见失败原因按出现频率排查：

| 失败原因 | 典型表现 | 排查与修复 |
| --- | --- | --- |
| 80 端口被占或不可达 | HTTP-01 验证连接失败 | `sudo ss -tlnp` 看 80 端口归属；被其他程序占用时改走 DNS-01，或先释放端口 |
| DNS 验证失败 | DNS-01 时 TXT 记录未生效或写错域名 | 在解析平台核对记录名与值，用 `dig` 查询确认已传播，再重试 |
| 签发限额 | 报错含限额或重复证书字样 | 停手等待限额窗口恢复，先用测试环境把流程调通，避免反复消耗额度 |
| 权限与路径变化 | 续期成功但部署钩子复制失败，服务仍用旧证书 | 核对部署目录权限与钩子命令，用第 4 节的在线命令确认服务实际发出的证书 |

!!! danger "续期试错不要拿生产额度硬撞"
    主流免费证书机构对同一组域名有签发频率限制，短时间反复失败重试会把额度耗尽，之后即便修好了原因也要等窗口恢复，眼睁睁看着证书过期。排因阶段一律先用 `--dry-run` 或测试环境验证流程，确认无误后再动生产签发。Certbot 的演练命令见第 09 部分，本章不再重复。

### 3.5 吊销：CRL 与 OCSP，什么情况必须吊销

证书未到期就必须作废时靠吊销机制。CRL 是证书吊销列表：机构定期发布已吊销序列号清单，客户端下载比对，缺点是更新有间隔。OCSP 是在线证书状态协议：握手时实时查询状态；OCSP Stapling 由服务器预取状态响应随握手下发，兼顾速度与隐私。运维侧只需知道何时吊销、吊销后去哪里验。

必须吊销的情况只有一条是无条件立即执行的，其余按风险评估：

| 情况 | 是否必须吊销 | 说明 |
| --- | --- | --- |
| 私钥泄露或疑似泄露 | 立即吊销并换新 | 包括私钥进仓库、进镜像、误发他人、存放机器被入侵；先吊销再调查，不要反过来 |
| 证书信息重大错误 | 应吊销 | 域名归属变更、主体信息错误且继续使用会误导访客 |
| 证书机构要求吊销 | 应吊销 | 按机构通知的时限执行，并同步换新证书 |
| 正常到期或计划轮换 | 不需要吊销 | 到期自然失效；轮换时旧证书可在观察期后到期或按机构流程处理，见 3.6 节 |
| 仅换签发工具或改配置 | 不需要吊销 | 证书本身与私钥未受影响，不要滥用吊销 |

吊销动作在签发工具或机构控制台完成，命令随工具而异，以第 09 部分文档为准，优先用签发时的同一工具操作。吊销后必须验证状态已传播，OCSP 查询示意如下：

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -ocsp_uri
openssl ocsp -issuer /etc/letsencrypt/live/example.com/chain.pem -cert /etc/letsencrypt/live/example.com/cert.pem -url http://ocsp.example.com -resp_text
```

讲解：第一条从证书读出机构公布的 OCSP 地址，不要凭记忆写；第二条用签发者证书与待查证书发查询，`-resp_text` 打印完整响应。期望状态显示为已吊销并带时间与原因；若仍显示良好，可能是刚吊销未传播，间隔后复查，并确认签发者文件与证书匹配。示例地址为占位，执行时替换为第一条的实际输出。

### 3.6 密钥与证书轮换流程

轮换是计划内换新：新旧并存、切换、观察、回收。旧证书在观察期内仍有效，出问题可立刻切回。步骤如下，按序执行：

| 步骤 | 动作 | 验证点 |
| --- | --- | --- |
| 1 备份 | 按第 2 节方法备份当前证书与私钥整目录 | 备份目录可读，权限为 700 |
| 2 生成新密钥 | 在独立路径生成新私钥并设 600，不覆盖旧私钥 | 新旧私钥文件并存，属主正确 |
| 3 签发新证书 | 用新密钥向机构签发，签发操作见第 09 部分 | 新证书 `-dates` 与域名清单正确 |
| 4 离线验链 | 对新证书执行 3.1 节的 `openssl verify` | 输出以 `OK` 结尾 |
| 5 切换配置 | 服务配置改指向新证书与新私钥路径，校验后重载 | 配置校验通过，重载无报错 |
| 6 在线验证 | 用 `s_client` 看服务实际发出的证书指纹与到期日 | 发出的正是新证书，见第 4 节 |
| 7 观察期 | 保留旧证书文件与回滚路径，观察一个业务周期 | 无证书相关报错与客诉 |
| 8 回收旧证书 | 删除或归档旧私钥与旧证书，更新台账 | 台账与磁盘实际文件一致 |

取新证书指纹供第 6 步比对：

```bash
openssl x509 -in /etc/nginx/ssl/example.com/fullchain.pem -noout -fingerprint -sha256 -enddate
```

轮换节奏：确认续期工具确实在换新密钥而不是复用旧密钥，参数看第 09 部分；长期复用同一私钥的证书至少每年轮换一次密钥，通配符与核心业务证书半年评估一次。观察期内不要急着吊销旧证书。

!!! warning "切换时新旧文件不要同名覆盖"
    轮换最常见的事故是把新证书直接覆盖旧文件，结果重载失败时旧证书已经没了，想回滚都回不去。正确做法是新证书用带日期或版本号的新路径部署，配置指向新路径，回滚时只改回配置指向并重载，全程不删旧文件，直到观察期结束才回收。

### 3.7 到期监控：检查脚本与定时执行

续期之外必须再加独立到期监控：不依赖续期工具自报，而是直接问线上服务现在用的什么证书。脚本保存为 `/usr/local/bin/check-cert-expiry.sh`：

```bash
#!/bin/bash
set -u
HOST="${1:-example.com}"
PORT="${2:-443}"
WARN_DAYS="${3:-30}"
LOG_FILE="/var/log/cert-expiry.log"
NOW_EPOCH=$(date +%s)
END_DATE=$(echo | openssl s_client -connect "${HOST}:${PORT}" -servername "${HOST}" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
if [ -z "${END_DATE}" ]; then
  echo "$(date '+%F %T') ERROR ${HOST} cannot fetch certificate" >> "${LOG_FILE}"
  exit 2
fi
END_EPOCH=$(date -d "${END_DATE}" +%s)
DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))
echo "$(date '+%F %T') INFO ${HOST} days_left=${DAYS_LEFT} end=${END_DATE}" >> "${LOG_FILE}"
if [ "${DAYS_LEFT}" -lt 0 ]; then
  echo "$(date '+%F %T') CRITICAL ${HOST} already expired" >> "${LOG_FILE}"
  exit 2
fi
if [ "${DAYS_LEFT}" -lt "${WARN_DAYS}" ]; then
  echo "$(date '+%F %T') WARN ${HOST} expires in ${DAYS_LEFT} days" >> "${LOG_FILE}"
  exit 1
fi
exit 0
```

逐段讲解：第一段定参数，域名、端口、阈值可由命令行传入，默认提前 30 天告警；第二段用 `openssl s_client -connect` 带 SNI 取回线上证书，再用 `openssl x509 -enddate` 取到期时间，取不到直接记错误并退出 2，取不到本身就是异常；第三段转时间戳算剩余天数并写日志；第四段分级处置，已过期退出 2、低于阈值退出 1、其余退出 0，供上层按码值告警。

赋权并手工跑一次确认：

```bash
sudo chmod 700 /usr/local/bin/check-cert-expiry.sh
sudo /usr/local/bin/check-cert-expiry.sh example.com 443 30
echo $?
sudo cat /var/log/cert-expiry.log
```

期望：退出码与剩余天数匹配，日志新增一行记录。多域名时逐个调用，每个域名一行日志。

定时执行二选一。用 systemd timer 时，新建服务与定时器两个单元：

```ini
# /etc/systemd/system/cert-expiry-check.service
[Unit]
Description=Check TLS certificate expiry
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/check-cert-expiry.sh example.com 443 30
```

```ini
# /etc/systemd/system/cert-expiry-check.timer
[Unit]
Description=Daily TLS certificate expiry check

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cert-expiry-check.timer
systemctl list-timers | grep cert-expiry
```

用 cron 时在 `sudo crontab -e` 里加一行，每天固定时刻执行：

```text
15 6 * * * /usr/local/bin/check-cert-expiry.sh example.com 443 30
```

告警出口至少留两条：日志出口是脚本写的 `/var/log/cert-expiry.log`，纳入巡检与日志轮转；邮件出口在本机邮件通道可用时把警告级以上结果转发运维邮箱。没有邮件通道时用退出码接入现有监控系统。只写日志没人看的告警等于没有告警。

## 四、效果验证与测试

治理是否落地，用三组命令验收。第一组看链与域名：

```bash
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -untrusted /etc/letsencrypt/live/example.com/chain.pem /etc/letsencrypt/live/example.com/cert.pem
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

期望：本地验链输出以 `OK` 结尾；在线取回的证书主体、签发者、有效期与域名清单都与台账一致，且线上证书就是磁盘上最新那一张。第二组看私钥权限：

```bash
stat -c "%a %U %G %n" /etc/ssl/private/example.com.key
sudo grep -R "PRIVATE KEY" /etc/nginx/sites-enabled/ 2>/dev/null
```

期望：私钥权限为 600；第二条期望无输出，站点配置里只应出现证书路径，不应出现私钥内容。第三组看盘点清单可复现：

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -enddate -subject
sudo /usr/local/bin/check-cert-expiry.sh example.com 443 30
echo $?
```

期望：到期日与台账一致；脚本退出码与剩余天数匹配，日志新增一行；`systemctl list-timers` 里定时器为启用且有下一次触发时间，用 cron 的改查 `sudo crontab -l`。三组都过，治理闭环才算建立。

## 五、常见错误与排坑指南

场景一：桌面浏览器正常，手机与脚本访问报证书链不完整。根因几乎都是服务器只部署了叶子证书，缺中间证书，桌面浏览器靠本地缓存把链补上了，其他客户端补不了。修复是改部署 fullchain 并重载：

```bash
sudo cp -a /etc/nginx/sites-available/example.com /root/example.com.bak.$(date +%F)
sudo grep -n ssl_certificate /etc/nginx/sites-available/example.com
sudo nginx -t
sudo systemctl reload nginx
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null | grep -c "BEGIN CERTIFICATE"
```

确认配置里 `ssl_certificate` 指向 fullchain 文件后重载，再用最后一条数握手发出的证书张数：只有一张就是链仍不完整，含叶子与中间证书才正确。

场景二：续期显示成功，线上却还是旧证书。根因多在部署环节：部署钩子失败，或服务配置指向另一份旧文件，新证书从未被加载。排查顺序：

```bash
sudo openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -noout -enddate -fingerprint -sha256
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -enddate -fingerprint -sha256
sudo grep -R ssl_certificate /etc/nginx/sites-enabled/
```

两处指纹不一致即实锤服务没用上新证书。顺着第三条查到的实际路径，把新证书按 3.4 节的方法部署到该路径或修正配置指向，校验后重载，再比对一次指纹，两边一致才算修复。

场景三：私钥权限被放宽或属主丢失后服务起不来。常见于手工复制用了普通命令，权限变成 644 或属主变成个人账号：前者是安全事故，后者让专用账号读不到文件。修复：

```bash
sudo chown root:root /etc/ssl/private/example.com.key
sudo chmod 600 /etc/ssl/private/example.com.key
stat -c "%a %U %G %n" /etc/ssl/private/example.com.key
sudo systemctl reload nginx
```

服务以专用账号运行时只给那一个账号读权限，不要改回 644。若 644 持续过一段时间且机器有他人登录，按可能已泄露评估，必要时走 3.5 节吊销加换新。

## 六、生产环境最佳实践与安全建议

第一，台账驱动：清单每月更新，每张证书有责任人与到期日，交接先交台账。第二，双保险监控：自动续期与独立到期监控同时存在，阈值不晚于到期前 30 天，脚本日志长期无新增同样是异常。第三，私钥纪律：600、集中存放、永不进仓库与镜像、永不经聊天工具传输，写进规范并在评审与构建环节各设一道检查。第四，轮换与吊销分开：轮换按 3.6 节并存切换走，吊销是应急动作，泄露时先吊销换新再调查。第五，含私钥的备份按同级权限保存，确认无回滚价值后销毁并记一笔。第六，Ubuntu 26.04 工具链行为为「待核验」，升级后先重跑第 4 节验证再恢复正式节奏。
