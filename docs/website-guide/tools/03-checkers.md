# TOOL-03：SSL 到期计算器、DNS 检查、HTTPS/安全/上线前检查工具

> 任务编号：TOOL-03（网站建设与部署实战指南 · 建站工具第 3 篇）
> 上一篇：[TOOL-02 建站工具 2：Docker Compose、systemd、备份脚本、部署检查清单生成器](02-deploy-tools.md)；下一篇：[FINAL-01 全站整合验收](../FINAL_REPORT.md)。
> 本篇是工具篇，不是概念复述：四件工具每件都有读者能直接用的完整成品，复制到自己服务器上就能跑。证书与 DNS 的原理不重讲，引用 DEPLOY-03 与 NET-02；安全响应头的含义不重讲，引用 OPS-02。

## 1. 本章目标

读完并动手做完本篇，你能：

- 用到期计算器算出任意证书的剩余天数，并按 30 天 / 15 天两档阈值决定要不要立即续期；
- 用 DNS 检查脚本对一个域名查 A、CNAME、MX、TXT 四类记录，并逐项判读每一类记录的有无意味着什么；
- 用 HTTPS 检查脚本对一个地址逐项核对 HTTP 跳转、HTTPS 状态码与六项安全响应头；
- 用上线前检查脚本把 DEPLOY-03 的上线清单跑成逐项打勾的结果，知道哪几项是脚本查不了、必须手工打勾的。

## 2. 适用人群

- 已经按 DEPLOY-03 走到上线这一步、准备把网站推出去的读者；
- 已经有一个站在跑、想定期自查证书、解析与安全头的运维读者；
- 不适合只想了解概念、不想动手跑脚本的读者：本篇的每一件工具都要在终端里跑一遍才算学完。

## 3. 适用系统和版本

- 系统：Ubuntu 24.04 LTS（本篇实测环境），其他 Linux 发行版只要装齐下面四件工具即可，命令相同；
- 工具版本（本篇实测时本机版本，读者机器上以各自输出为准，不必强求一致）：dig DiG 9.18.39、curl 8.5.0、OpenSSL 3.0.13、Python 3.12.3、bash 5.2.21；
- 不依赖任何第三方 Python 包：到期计算器只用标准库；
- 四件工具都不需要 root 权限，不改服务器配置，只读检查。

## 4. 使用前提

- 你手里有一个域名（哪怕还没上线），以及一台能联网的 Linux 机器或本地终端；
- 知道证书文件在服务器上的路径（如果用 `--cert` 方式），或者知道证书到期日（如果用日期方式）；
- 读过 DEPLOY-03 的上线清单、OPS-02 的安全响应头、NET-02 的域名与备案结论，知道每项检查为什么存在；
- 本篇所有示例域名一律用保留域名 `example.com` 及其子域名，不写任何真实域名与真实服务器地址。

## 5. 所需资源

| 资源 | 用途 | 备注 |
|---|---|---|
| 一台 Linux 机器或本地终端 | 跑四件工具 | 本篇实测在本机完成 |
| dig、curl、openssl | DNS 查询、HTTP 检查、证书读取 | Ubuntu 上 `bind9-dnsutils`、`curl`、`openssl` 三个包 |
| Python 3 | 跑到期计算器 | 只用标准库，不用 pip 装任何包 |
| 一个存放目录 | 放四件工具与手工清单 | 本篇统一用 `~/check-tools/`，即当前用户家目录下的 `check-tools` 文件夹 |

## 6. 技术原理

### 6.1 证书到期：只是一次日期减法

证书到期日是一个确定的日期，剩余天数就是到期日减今天，单位是天。自动续期失败最常见的发现方式不是监控告警，而是用户在浏览器里看到过期警告——所以到期计算器的意义在于把“还有几天”变成一个数字，再配两档阈值：30 天提醒、15 天紧急。阈值不是标准，是本篇建议的运维习惯：30 天给你留出排期与验证的时间，15 天意味着再拖就可能赶不上。

从证书文件读到期日不靠猜：`openssl x509 -in 证书文件 -noout -enddate` 输出 `notAfter=` 开头的一行，里面是英文月份加日、年，脚本把它转成 `YYYY-MM-DD` 再算天数。

### 6.2 DNS 检查：四类记录各管一件事

- A 记录：域名到 IPv4 地址的映射，网站能不能按 IP 找到服务器就看它；
- CNAME 记录：一个名字指向另一个域名，常用于 `www` 指向主域名或 CDN 域名；
- MX 记录：这个域名的邮件由哪台服务器收，没有它域名就收不到邮件；
- TXT 记录：一段自由文本，常用于域名所有权验证与发信策略。

同一名字不能同时有 A 和 CNAME，这是 DNS 的规范要求，不是哪家服务商的特殊规定，检查脚本遇到两者共存会专门警告。

### 6.3 HTTPS 检查：三层，层层递进

第一层是跳转：`http://` 是否永久跳转（301 或 308）到 `https://`，没跳转等于明文入口还开着。第二层是状态：`https://` 首页是不是 200。第三层是响应头：HSTS 与另外五项安全头在不在，缺失不等于立刻有危险，但属于上线前应该补齐的项，具体每项的含义见 OPS-02，本篇只查有无。

### 6.4 上线前检查：脚本查机器能查的，清单留人必须看的

DEPLOY-03 的上线清单里有一部分是机器能判定的（解析、跳转、状态码、响应头、robots 与 sitemap 可访问性），这部分做成脚本；另一部分机器判定不了（证书自动续期是否真生效、备份有没有演练过、监控告警有没有人收），这部分做成手工清单文件，两者拼起来才是一次完整的上线前检查。只跑脚本不等于上线检查做完了，这一点要在第 14 节的验证步骤里写清。

## 7. 架构说明

四件工具的关系如下表所示，彼此独立，可以单独用，也可以按顺序跑完：

| 工具 | 文件 | 输入 | 输出 | 依赖 |
|---|---|---|---|---|
| SSL 到期计算器 | `~/check-tools/ssl_expiry.py` | 到期日或证书文件路径 | 今天、到期日、剩余天数、一句建议 | Python 3、openssl（仅 `--cert` 方式） |
| DNS 检查工具 | `~/check-tools/dns_check.sh` | 域名 | 四类记录原文 + 逐项判读 | dig |
| HTTPS 与安全检查工具 | `~/check-tools/https_check.sh` | https 地址 | 跳转判读、状态码、六项响应头有无 | curl |
| 上线前检查工具 | `~/check-tools/prelaunch_check.sh` | 域名 | 六项逐项打勾 + 汇总 + 手工项提醒 | dig、curl |
| 手工检查清单 | `~/check-tools/prelaunch-checklist.md` | 人工逐项确认 | 打勾记录 | 无，纯文本 |

四件工具都不写数据库、不起服务、不改配置，跑完即走。检查脚本的退出码也有含义：上线前检查脚本在有一项未通过时返回非 0，方便接在部署流程后面做门禁；其他三件工具只打印结果，不以退出码做门禁。

## 8. 操作前检查

动手之前，先确认下面五项，缺一项先补齐再往下做：

1. 终端里能跑 `dig +short example.com A` 并看到输出（哪怕输出是沙箱改写过的值，见第 13 节说明）；
2. 终端里能跑 `curl -s -o /dev/null -w "%{http_code}" https://example.com/` 并看到 `200`；
3. 终端里能跑 `python3 --version` 并看到 `Python 3` 开头的版本；
4. 终端里能跑 `openssl version` 并看到版本号；
5. 家目录下有 `~/check-tools/` 目录，没有就先建一个：`mkdir -p ~/check-tools`。

## 9. 逐步操作

### 9.1 工具一：SSL 到期计算器

1. 把第 10.1 节的完整代码存为 `~/check-tools/ssl_expiry.py`；
2. 已知道期日时跑：`python3 ~/check-tools/ssl_expiry.py 2027-02-01`；
3. 有证书文件时跑：`python3 ~/check-tools/ssl_expiry.py --cert /etc/letsencrypt/live/example.com/fullchain.pem`，把路径换成自己证书的真实路径；
4. 看输出里的剩余天数与建议：30 天以上是正常，15 到 30 天是提醒，15 天以内是紧急，已过期是立即续期。

### 9.2 工具二：DNS 检查

1. 把第 10.2 节的完整代码存为 `~/check-tools/dns_check.sh`；
2. 跑：`bash ~/check-tools/dns_check.sh example.com`，把域名换成自己的；
3. 先看四类记录的原文，再看判读部分：A 有没有、CNAME 有没有、两者有没有共存、MX 与 TXT 有没有；
4. 判读里“无”不一定是错：只做网站可以没有 MX，没有 TXT 也不影响网站打开，关键是 A 或 CNAME 至少有一种、且两者不共存。

### 9.3 工具三：HTTPS 与安全检查

1. 把第 10.3 节的完整代码存为 `~/check-tools/https_check.sh`；
2. 跑：`bash ~/check-tools/https_check.sh https://example.com/`，把地址换成自己的；
3. 先看 HTTP 跳转判读，再看 HTTPS 状态码，最后看六项响应头逐项的有无；
4. 响应头缺失的项按 OPS-02 补，补完重跑，直到六项齐全或你明确接受缺失的理由。

### 9.4 工具四：上线前检查

1. 把第 10.4 节的完整代码存为 `~/check-tools/prelaunch_check.sh`，把第 11 节的手工清单存为 `~/check-tools/prelaunch-checklist.md`；
2. 跑：`bash ~/check-tools/prelaunch_check.sh example.com`，把域名换成自己的；
3. 看汇总：通过几项、未通过几项，未通过的项逐项修，修完重跑；
4. 脚本全通过后，对照手工清单逐项打勾，手工项没打勾不算检查完成。

## 10. 完整代码

下面四份代码都是完整成品，不是示意伪代码，存放路径写在每份代码的标题行里。反面例子不在这里出现，需要对照的错误写法见第 15 节的表格。

### 10.1 工具一：SSL 到期计算器（存放路径：`~/check-tools/ssl_expiry.py`）

```python
#!/usr/bin/env python3
"""SSL 到期计算器：输入证书到期日，算出剩余天数并给出续期提醒。
用法：
  python3 ssl_expiry.py 2027-02-01
  python3 ssl_expiry.py --cert /etc/letsencrypt/live/example.com/fullchain.pem
  python3 ssl_expiry.py --today 2026-11-03 2027-02-01
只用标准库，不联网，不读任何口令。"""
import argparse
import re
import subprocess
import sys
from datetime import date

DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def parse_date(text):
    m = DATE_RE.match(text.strip())
    if not m:
        raise ValueError("日期格式必须是 YYYY-MM-DD，例如 2027-02-01")
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def cert_expiry(cert_path):
    out = subprocess.run(
        ["openssl", "x509", "-in", cert_path, "-noout", "-enddate"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    # 输出形如：notAfter=Feb  1 00:00:00 2027 GMT
    value = out.split("=", 1)[1].strip()
    months = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
              "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
    parts = value.split()
    return date(int(parts[3]), months[parts[0]], int(parts[1]))


def advice(days):
    if days < 0:
        return "已过期：立即续期，过期证书浏览器会直接拦截访问。"
    if days < 15:
        return "紧急：15 天内到期，立即续期并验证自动续期是否生效。"
    if days <= 30:
        return "提醒：30 天内到期，本周内完成续期并检查自动续期任务。"
    return "正常：30 天以上，记下到期日并确认自动续期任务在跑。"


def main(argv=None):
    parser = argparse.ArgumentParser(description="SSL 到期计算器")
    parser.add_argument("expiry", nargs="?", help="证书到期日，格式 YYYY-MM-DD")
    parser.add_argument("--cert", help="证书文件路径，优先于日期参数")
    parser.add_argument("--today", help="今天的日期，默认用系统日期（仅用于复核算术）")
    args = parser.parse_args(argv)
    if args.cert:
        expiry = cert_expiry(args.cert)
    elif args.expiry:
        expiry = parse_date(args.expiry)
    else:
        parser.error("必须给到期日或 --cert 证书路径")
    today = parse_date(args.today) if args.today else date.today()
    days = (expiry - today).days
    print("今天：%s" % today.isoformat())
    print("到期日：%s" % expiry.isoformat())
    print("剩余天数：%d 天" % days)
    print("建议：%s" % advice(days))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

### 10.2 工具二：DNS 检查脚本（存放路径：`~/check-tools/dns_check.sh`）

```bash
#!/bin/bash
# DNS 检查工具：按域名查 A / CNAME / MX / TXT，并逐项判读。
# 用法：bash dns_check.sh example.com
# 只读查询，不改任何配置；不发邮件、不连真实业务服务器。
set -u
domain="${1:-}"
if [ -z "$domain" ]; then
  echo "用法：bash dns_check.sh <域名>，例如 bash dns_check.sh example.com"
  exit 2
fi
echo "域名：$domain"
for type in A CNAME MX TXT; do
  values="$(dig +short "$domain" "$type" 2>/dev/null)"
  echo "--- $type ---"
  if [ -z "$values" ]; then
    echo "无记录"
  else
    echo "$values"
  fi
done
echo "--- 判读 ---"
a="$(dig +short "$domain" A 2>/dev/null)"
cname="$(dig +short "$domain" CNAME 2>/dev/null)"
mx="$(dig +short "$domain" MX 2>/dev/null)"
txt="$(dig +short "$domain" TXT 2>/dev/null)"
[ -n "$a" ] && echo "A 记录：有，网站能按 IP 找到服务器。" || echo "A 记录：无，裸域名无法直接按 IP 访问。"
[ -n "$cname" ] && echo "CNAME 记录：有，该名字指向另一个域名。" || echo "CNAME 记录：无。"
if [ -n "$a" ] && [ -n "$cname" ]; then
  echo "注意：同一名字同时有 A 和 CNAME，DNS 规范不允许两者共存，请只留一种。"
fi
[ -n "$mx" ] && echo "MX 记录：有，该域名能收邮件。" || echo "MX 记录：无，该域名收不到邮件（只做网站可以没有）。"
[ -n "$txt" ] && echo "TXT 记录：有，常用于域名所有权验证与发信策略。" || echo "TXT 记录：无，没有验证类或发信策略记录。"
```

### 10.3 工具三：HTTPS 与安全检查脚本（存放路径：`~/check-tools/https_check.sh`）

```bash
#!/bin/bash
# HTTPS 与安全检查工具：按 URL 逐项核对跳转、状态码、安全响应头。
# 用法：bash https_check.sh https://example.com/
# 只发 HEAD / GET 请求，不登录、不提交表单；证书链细节见 ssl_expiry.py 的 --cert 用法。
set -u
url="${1:-}"
if [ -z "$url" ]; then
  echo "用法：bash https_check.sh <https 地址>，例如 bash https_check.sh https://example.com/"
  exit 2
fi
host="$(echo "$url" | sed -e 's#^https\?://##' -e 's#/.*##')"
echo "检查地址：$url"
echo "--- HTTP 跳转 ---"
http_code="$(curl -s -o /dev/null -w "%{http_code}" "http://$host/" --max-time 20)"
http_loc="$(curl -s -I "http://$host/" --max-time 20 | grep -i '^location:' | tr -d '\r')"
echo "http 状态码：$http_code"
echo "http Location：${http_loc:-无}"
case "$http_code" in
  301|308) echo "判读：HTTP 已永久跳转，符合上线要求。" ;;
  *) echo "判读：HTTP 没有永久跳转，请在服务器层把 80 端口永久跳转到 HTTPS。" ;;
esac
echo "--- HTTPS 响应 ---"
headers="$(curl -s -I "$url" --max-time 20)"
echo "$headers" | grep -i "^HTTP/" | tail -1
for header in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy content-security-policy; do
  line="$(echo "$headers" | grep -i "^$header:" | tr -d '\r')"
  if [ -n "$line" ]; then
    echo "有：$line"
  else
    echo "无：$header（缺失不等于立刻有危险，但建议按 OPS-02 补齐）"
  fi
done
echo "--- 说明 ---"
echo "证书到期日不在本脚本内算：把证书文件路径交给 ssl_expiry.py --cert，或看浏览器地址栏的证书详情。"
```

### 10.4 工具四：上线前检查脚本（存放路径：`~/check-tools/prelaunch_check.sh`）

```bash
#!/bin/bash
# 上线前检查工具：把 DEPLOY-03 的上线清单做成可逐项打勾的脚本。
# 用法：bash prelaunch_check.sh example.com
# 只读检查，不改服务器配置；每一项打印 [通过] / [未通过] / [跳过]，最后汇总。
set -u
domain="${1:-}"
if [ -z "$domain" ]; then
  echo "用法：bash prelaunch_check.sh <域名>，例如 bash prelaunch_check.sh example.com"
  exit 2
fi
pass=0
fail=0
check() {
  name="$1"
  result="$2"
  if [ "$result" = "ok" ]; then
    echo "[通过] $name"
    pass=$((pass + 1))
  elif [ "$result" = "skip" ]; then
    echo "[跳过] $name"
  else
    echo "[未通过] $name"
    fail=$((fail + 1))
  fi
}
a="$(dig +short "$domain" A 2>/dev/null)"
[ -n "$a" ] && check "DNS A 记录存在" ok || check "DNS A 记录存在" no
http_code="$(curl -s -o /dev/null -w "%{http_code}" "http://$domain/" --max-time 20)"
case "$http_code" in
  301|308) check "HTTP 永久跳转到 HTTPS" ok ;;
  *) check "HTTP 永久跳转到 HTTPS" no ;;
esac
https_code="$(curl -s -o /dev/null -w "%{http_code}" "https://$domain/" --max-time 20)"
[ "$https_code" = "200" ] && check "HTTPS 首页返回 200" ok || check "HTTPS 首页返回 200" no
hsts="$(curl -s -I "https://$domain/" --max-time 20 | grep -i '^strict-transport-security:')"
[ -n "$hsts" ] && check "HSTS 响应头存在" ok || check "HSTS 响应头存在" no
robots_code="$(curl -s -o /dev/null -w "%{http_code}" "https://$domain/robots.txt" --max-time 20)"
[ "$robots_code" = "200" ] && check "robots.txt 可访问" ok || check "robots.txt 可访问" no
sitemap_code="$(curl -s -o /dev/null -w "%{http_code}" "https://$domain/sitemap.xml" --max-time 20)"
[ "$sitemap_code" = "200" ] && check "sitemap.xml 可访问" ok || check "sitemap.xml 可访问" no
echo "--- 汇总：通过 $pass 项，未通过 $fail 项 ---"
echo "证书到期日、备份演练、监控告警不在本脚本内，请按检查清单手工打勾。"
[ "$fail" -eq 0 ]
```

## 11. 完整配置文件

四件工具本身不需要配置文件：到期计算器靠命令行参数，三个 bash 脚本靠命令行参数与系统自带的 dig、curl。本节给出的唯一一份“配置文件”，是脚本查不了的那部分上线检查——手工检查清单全文，存放路径是 `~/check-tools/prelaunch-checklist.md`，上线前逐项打勾：

```text
# 上线前手工检查清单（脚本查不了的项，逐项打勾才算检查完成）

- [ ] 证书自动续期任务已验证：不是只配了定时任务，而是手动跑过一次续演练，确认能拿到新证书且服务会重载
- [ ] 证书剩余天数已用 ssl_expiry.py 算过，且在 30 天以上
- [ ] 整站备份已演练过一次恢复，不是只确认备份文件存在（见 DB-02 与 OPS-04，没演练过的备份等于没有备份）
- [ ] 监控告警已验证：主动停一次服务，确认告警能发到有人看的地方
- [ ] 备份保留期与存放位置已定，且备份不在同一台服务器的同一个磁盘上
- [ ] 管理后台入口已限制访问来源，管理员口令不是弱口令，口令只放在口令管理器里
- [ ] 上线后第一周有人值班看日志与告警，不是上线完就不管
- [ ] 回滚办法已写好：上一版代码与配置的备份位置、回滚命令、回滚后验证步骤
```

注意：清单里的每一项都是“做过”才打勾，不是“打算做”就打勾。脚本的汇总行最后也会提醒这一句，两者要一起看。

## 12. 每个关键配置项的解释

### 12.1 到期计算器的关键项

| 项 | 含义 | 写错或漏写的后果 |
|---|---|---|
| 到期日 `YYYY-MM-DD` | 证书的到期日期，从证书文件或签发方通知里取 | 格式写错脚本会直接报错，不会默默算出一个错的天数 |
| `--cert 证书路径` | 直接从证书文件读到期日，比手工抄日期可靠 | 路径错了 openssl 会报错，脚本不会用错的日期继续算 |
| `--today` | 仅用于复核算术，平时不要传，默认用系统日期 | 传了一个过去的日期会算出偏大的剩余天数，只在复核时用 |
| 阈值 30 天 / 15 天 | 提醒与紧急两档，不是证书标准，是本篇建议的运维习惯 | 阈值设得太小会留不出续期与验证的时间，设得太大则提醒失去意义 |

### 12.2 三个 bash 脚本的关键项

| 项 | 含义 | 写错或漏写的后果 |
|---|---|---|
| `dig +short 域名 记录类型` | 只输出记录值，不输出查询过程，方便脚本判读 | 不加 `+short`，脚本抓到的就是整段查询输出，判读会错 |
| A / CNAME / MX / TXT 四类 | 见第 6.2 节，缺一类判读就不完整 | 只查 A 会漏掉“邮箱收不到”与“验证记录缺失”两类问题 |
| `curl -w "%{http_code}"` | 只输出状态码，不输出页面内容 | 不加 `-w`，状态码就混在页面内容里，脚本没法判定 |
| `curl --max-time 20` | 单次请求最多等 20 秒，防止脚本卡住 | 不加超时，目标站不响应时脚本会一直挂着 |
| `301\|308` | 只有永久跳转算通过，302 临时跳转不算 | 把 302 也算通过，等于放过了“临时跳转随时可能被改回”的风险 |
| 六项响应头 | HSTS、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、Permissions-Policy、Content-Security-Policy | 缺失时脚本只报“无”，不判定为上线阻断，由读者按 OPS-02 决定补不补 |

## 13. 执行结果示例

下面全部是本机真实跑出来的结果，不是另编的。运行环境是第 3 节列出的版本，运行日期是 2026-11-03。先说明三处沙箱环境带来的现象，读结果时不要误读：

1. 本机沙箱会改写 DNS：`dig example.com A` 返回 `198.18.237.248`，198.18 开头是保留地址段，不是 example.com 的真实公网地址，判读逻辑本身不受影响，只看“有无记录”，不看这个值；
2. 本机代理环境下 `http://example.com/` 返回 200 而非常见的 301，所以 HTTP 跳转一项判读为未通过，这是按脚本规则输出的，读者在自己网络下跑自己域名时以那次结果为准；
3. example.com 本来就没有 robots.txt 与 sitemap.xml，所以上线前检查里这两项未通过是符合预期的——拿一个裸测试域名跑，失败项恰好说明脚本在正常工作。

### 13.1 到期计算器（纯算术，本机实测）

```text
$ python3 ssl_expiry.py --today 2026-11-03 2027-02-01
今天：2026-11-03
到期日：2027-02-01
剩余天数：90 天
建议：正常：30 天以上，记下到期日并确认自动续期任务在跑。
```

90 天是手工复核过的：11 月剩余 27 天（11 月 4 日到 30 日），12 月 31 天，1 月 31 天，2 月 1 日 1 天，27 + 31 + 31 + 1 = 90，算对。

另外两档阈值的实测：

```text
$ python3 ssl_expiry.py --today 2026-11-03 2026-11-20
今天：2026-11-03
到期日：2026-11-20
剩余天数：17 天
建议：提醒：30 天内到期，本周内完成续期并检查自动续期任务。

$ python3 ssl_expiry.py --today 2026-11-03 2026-10-01
今天：2026-11-03
到期日：2026-10-01
剩余天数：-33 天
建议：已过期：立即续期，过期证书浏览器会直接拦截访问。
```

`--cert` 方式也实测过：本机现签一张 90 天自签证书，`openssl x509 -noout -enddate` 显示 `notAfter=Feb  1 15:51:19 2027 GMT`，脚本读出到期日 2027-02-01、剩余 90 天，与日期方式一致。

### 13.2 DNS 检查（本机实测，A 记录值受沙箱改写，见本节开头第 1 条）

```text
$ bash dns_check.sh example.com
域名：example.com
--- A ---
198.18.237.248
--- CNAME ---
无记录
--- MX ---
无记录
--- TXT ---
无记录
--- 判读 ---
A 记录：有，网站能按 IP 找到服务器。
CNAME 记录：无。
MX 记录：无，该域名收不到邮件（只做网站可以没有）。
TXT 记录：无，没有验证类或发信策略记录。
```

### 13.3 HTTPS 检查（本机实测，example.com 本来就没有这六项响应头）

```text
$ bash https_check.sh https://example.com/
检查地址：https://example.com/
--- HTTP 跳转 ---
http 状态码：200
http Location：无
判读：HTTP 没有永久跳转，请在服务器层把 80 端口永久跳转到 HTTPS。
--- HTTPS 响应 ---
HTTP/1.1 200 OK
无：strict-transport-security（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
无：x-content-type-options（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
无：x-frame-options（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
无：referrer-policy（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
无：permissions-policy（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
无：content-security-policy（缺失不等于立刻有危险，但建议按 OPS-02 补齐）
--- 说明 ---
证书到期日不在本脚本内算：把证书文件路径交给 ssl_expiry.py --cert，或看浏览器地址栏的证书详情。
```

### 13.4 上线前检查（本机实测，退出码为 1，因为有 4 项未通过）

```text
$ bash prelaunch_check.sh example.com
[通过] DNS A 记录存在
[未通过] HTTP 永久跳转到 HTTPS
[通过] HTTPS 首页返回 200
[未通过] HSTS 响应头存在
[未通过] robots.txt 可访问
[未通过] sitemap.xml 可访问
--- 汇总：通过 2 项，未通过 4 项 ---
证书到期日、备份演练、监控告警不在本脚本内，请按检查清单手工打勾。
```

未通过的 4 项里，HTTP 跳转是沙箱代理环境造成的（见本节开头第 2 条），robots 与 sitemap 是测试域名本身就没有（见第 3 条），HSTS 是 example.com 本来就没配——四项的原因各不相同，修的时候要分开看，不要当成同一个问题。

## 14. 成功验证

四件工具在读者自己环境下的验证步骤：

1. 到期计算器：用 `--today 2026-11-03 2027-02-01` 跑一遍，输出必须是 90 天；再用自己的证书文件跑 `--cert`，到期日与签发方通知一致；
2. DNS 检查：对自己的域名跑一遍，A 或 CNAME 至少有一种，两者不共存，判读与自己在解析商后台看到的记录一致；
3. HTTPS 检查：对自己的地址跑一遍，HTTP 跳转是 301 或 308，HTTPS 首页是 200，六项响应头按 OPS-02 补齐后重跑，缺失项减少；
4. 上线前检查：对自己的域名跑一遍，六项全通过且退出码为 0，再对照第 11 节手工清单逐项打勾；
5. 四项都满足，才算本篇学完；脚本全通过但手工清单没打勾，不算完成。

## 15. 常见错误

| 错误现象 | 原因 | 解决办法 |
|---|---|---|
| 到期计算器报日期格式错误 | 日期不是 `YYYY-MM-DD` 格式，例如写成了 `2027/02/01` | 按 `2027-02-01` 的格式重写 |
| 到期计算器算出的天数比预期多一天 | 把到期日当天也算进去了，或者 `--today` 传错了 | 以脚本的“到期日减今天”为准，不要手工加一天；复核时用 `--today` 固定今天再算一次 |
| DNS 检查显示 A 记录值很奇怪 | 本机沙箱改写 DNS，或解析还没生效 | 只看有无记录，不看这个值；换一台正常网络的机器或等 TTL 过了再查 |
| DNS 检查里 A 和 CNAME 同时出现 | 解析商后台误配，两者共存 | 只留一种：裸域名留 A，需要指向另一个域名时留 CNAME |
| HTTPS 检查报 HTTP 没有永久跳转 | 80 端口没配跳转，或只配了 302 临时跳转 | 在服务器层配 301 或 308 永久跳转，见 DEPLOY-03 |
| 响应头缺失被当成上线阻断 | 脚本对响应头只报“无”，不判定阻断 | 按 OPS-02 逐项决定补不补，不要因为脚本报“无”就停掉上线，也不要因为脚本没阻断就不补 |
| 上线前检查 robots 或 sitemap 未通过 | 网站确实没有这两个文件 | 按 WEB-03 与 DEPLOY-03 的要求补齐两个文件，再重跑 |
| 上线前检查全通过就以为万事大吉 | 证书续期、备份演练、监控告警不在脚本内 | 对照第 11 节手工清单逐项打勾，缺一项都不算完成 |

## 16. 故障排查

按“先看哪一层出错”的顺序排查，不要一上来就改服务器配置：

1. 脚本本身报错（例如 `command not found`）：先确认 dig、curl、openssl、python3 装没装齐，见第 8 节操作前检查；
2. DNS 项全是“无记录”：先确认域名拼写没错，再确认解析商后台确实配了记录，最后确认是不是 TTL 还没过、本地缓存还是旧值；
3. HTTPS 项状态码是 000：curl 根本没连上，000 表示请求没发出去或没收到响应，先查域名解析与服务器 443 端口，再查是不是本机网络问题；
4. 响应头明明配了脚本却报“无”：先用浏览器开发者工具看一次真实响应头，确认是不是大小写或多值合并的问题，再看是不是 CDN 层把响应头 strip 掉了；
5. 上线前检查退出码非 0：看汇总里是哪几项未通过，逐项修、逐项重跑，不要改脚本把未通过改成通过；
6. 本机沙箱现象：如果 A 记录值是 198.18 开头、或 http 返回 200 而不是 301，先对照第 13 节开头的三条说明，确认是不是沙箱环境造成的，再决定要不要在自己网络下重跑。

## 17. 安全注意事项

- 四件工具都是只读检查，不登录、不提交表单、不改配置，跑它们本身不会给网站带来风险；但检查结果里会暴露你的域名解析与响应头情况，不要把完整输出贴到公开场合；
- 口令与密钥一律用占位符：本篇所有示例里出现的口令、密钥位置都写“请填”字样，读者自己的真实口令只放在口令管理器与服务器的 600 权限文件里，绝不写进脚本、清单或聊天记录；
- 证书文件路径只读不写：`--cert` 方式只读证书的到期日，不读私钥，私钥文件不要交给任何检查工具；
- 不要拿检查脚本去扫别人的网站：只对自己的域名跑，压测与扫描他人站点不在本篇范围内，见 OPS-03 的红线；
- 检查脚本不是安全审计：它只查六项响应头的有无，不查配置值对不对、不查漏洞，完整的安全运营见 OPS-02。

## 18. 回滚和恢复

四件工具不改服务器，本身没有回滚问题；回滚指的是“检查结果不可信时怎么退回”：

- 删掉工具：删掉 `~/check-tools/` 目录即可，服务器上没有任何残留，检查脚本不装服务、不写系统配置；
- 怀疑某次检查结果错了：换一台正常网络的机器重跑一次，两次结果不一致时以正常网络下的结果为准，沙箱改写 DNS 与代理造成的差异见第 13 节开头；
- 怀疑响应头检查被 CDN 缓存干扰：先清掉 CDN 缓存或绕过 CDN 直接查源站，再重跑；
- 上线前检查误判导致上线被拦：不要改脚本放行，修好未通过的项再重跑，脚本的退出码非 0 本来就是门禁的意义；
- 手工清单打错勾：把勾划掉重打，清单是文本文件，没有任何自动后果，改清单不需要任何审批。

## 19. 延伸阅读

- DEPLOY-03 上线全流程：本篇上线前检查脚本的清单来源，证书、CDN、解析的上线步骤都在那里；
- OPS-02 安全运营：六项安全响应头的含义、WAF 与限流、密钥管理，补响应头之前先读；
- NET-02 域名与备案：域名选购、实名、备案适用范围的结论，本篇 DNS 检查的判读依据之一；
- NET-01 网络基础：DNS 解析原理、端口与状态码的背景，读不懂判读时回头看；
- DB-02 与 OPS-04：备份与恢复演练，手工清单里“备份已演练”一项的出处。

## 20. 相关章节链接

- [DEPLOY-03 HTTPS、CDN、域名解析上线全流程](../deploy/03-launch.md)
- [OPS-02 安全：WAF、限流、漏洞修复、安全响应头、密钥管理](../ops/02-security.md)
- [NET-02 域名购买、注册商选择、实名、备案适用范围、泛域名、多域名](../basics/02-domain.md)
- [建站指南总规划](../MASTER_PLAN.md)
- [建站指南任务索引](../TASK_INDEX.md)
- [建站指南路线图](../ROADMAP.md)
- 下一篇：[FINAL-01 全站整合验收](../FINAL_REPORT.md)
