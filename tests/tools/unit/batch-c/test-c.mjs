// 批次 C 测试：把 sections.md 的 HTML 与 tools.js 组装成最小页面，用 jsdom 驱动 DOM。
// 复制助手 bindCopy/showCopyToast 从站点 index.md 原样摘录，模拟真实集成环境。
// 运行：node test-c.mjs（在 guide-tools-dev/batch-c 下，jsdom 已装在../node_modules）
import { JSDOM} from "jsdom";
import { readFileSync, writeFileSync, unlinkSync} from "node:fs";
import { execFileSync} from "node:child_process";
import { fileURLToPath} from "node:url";
import { dirname, join} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sections = readFileSync(join(here, "sections.md"), "utf8");
const toolsJs = readFileSync(join(here, "tools.js"), "utf8");
const indexMd = readFileSync(join(here, "../../../../docs/tools/index.md"), "utf8");

const helperStart = indexMd.indexOf("function showCopyToast()");
const helperEnd = indexMd.indexOf("function initGuideTools()");
if (helperStart < 0 || helperEnd < 0) throw new Error("无法从 index.md 摘录 bindCopy 助手");
const helpers = indexMd.slice(helperStart, helperEnd);

const html = "<!DOCTYPE html><html><body>" + sections +
"<script>" + helpers + "</" + "script>" +
"<script>" + toolsJs + "</" + "script>" +
"<script>initGhaGen();initPlanGen();initLogGen();initAptGen();initMigGen();initCurlGen();initSshlogGen();initGitGen();initExplainGen();</" + "script>" +
"</body></html>";

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/"});
const { window} = dom;
const doc = window.document;
let copiedText = null;
Object.defineProperty(window.navigator, "clipboard", {
value: { writeText: (t) => { copiedText = t; return Promise.resolve();}},
configurable: true,
});

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
if (cond) { pass++; console.log("PASS " + name);}
else { fail++; failures.push(name + (extra? " | " + extra: "")); console.log("FAIL " + name + (extra? " | " + extra: ""));}
}
function setVal(id, v) { doc.getElementById(id).value = v;}
function setChk(id, v) { doc.getElementById(id).checked = v;}
function fire(id, type) { doc.getElementById(id).dispatchEvent(new window.Event(type, { bubbles: true}));}
function input(id) { fire(id, "input");}
function change(id) { fire(id, "change");}
function click(id) { doc.getElementById(id).click();}
function out(id) { return doc.getElementById(id).textContent;}
function errVisible(id) { return doc.getElementById(id).style.display === "block";}
function errText(id) { return doc.getElementById(id).textContent;}
function tick() { return new Promise((r) => setTimeout(r, 0));}
function yamlCheck(name, text, pyExpr) {
const f = join(here, ".tmp-gha.yaml");
writeFileSync(f, text, "utf8");
try {
const py = "import yaml,sys; d=yaml.safe_load(open(sys.argv[1],encoding='utf-8')); sys.exit(0 if (" + pyExpr + ") else 1)";
execFileSync("python3", ["-c", py, f], { stdio: "pipe"});
check(name, true);
} catch (e) { check(name, false, String(e).slice(0, 200));}
finally { try { unlinkSync(f);} catch (e2) {}}
}

// ============ N-05 gha ============
check("G1 默认生成 CI 且无错误",!errVisible("gha-err") && out("gha-out").includes("name: CI") && out("gha-out").includes("push:") && out("gha-out").includes("branches: [main]") && out("gha-out").includes("actions/setup-node@v4") && out("gha-out").includes('node-version: "20"') && out("gha-out").includes("npm test") && out("gha-out").includes(".github/workflows/ci.yml"), out("gha-out").slice(0, 300));
yamlCheck("G2 默认产物可被 pyyaml 解析且结构正确", out("gha-out"), "d['name']=='CI' and d['jobs']['build']['runs-on']=='ubuntu-24.04' and 'push' in (d.get('on') or {}) and (d.get('on') or {}).get('push',{}).get('branches')==['main']");
setChk("gha-t-schedule", true); change("gha-t-schedule");
check("G3 定时触发进入 YAML", out("gha-out").includes("schedule:") && out("gha-out").includes('cron: "0 2 * * 1"'), out("gha-out").slice(0, 300));
yamlCheck("G3b 定时版产物可解析且 cron 值正确", out("gha-out"), "(d.get('on') or d.get(True))['schedule'][0]['cron']=='0 2 * * 1'");
setVal("gha-cron", "0 2 * *"); input("gha-cron");
check("G4 cron 四段报错", errVisible("gha-err") && errText("gha-err").includes("五段"), errText("gha-err"));
setVal("gha-cron", "61 * * * *"); input("gha-cron");
check("G4b cron 数值越界报错", errVisible("gha-err") && errText("gha-err").includes("超出范围"), errText("gha-err"));
setVal("gha-cron", "0 2 * * 1"); input("gha-cron");
setChk("gha-t-push", false); setChk("gha-t-pr", false); setChk("gha-t-schedule", false); change("gha-t-push");
check("G5 无触发方式报错", errVisible("gha-err") && errText("gha-err").includes("至少选择一种触发方式"), errText("gha-err"));
setChk("gha-t-push", true); change("gha-t-push");
setVal("gha-file", "my file!"); input("gha-file");
check("G6 文件名非法报错", errVisible("gha-err") && errText("gha-err").includes("文件名只能含"), errText("gha-err"));
setVal("gha-file", "ci"); input("gha-file");
setVal("gha-lang", "python"); change("gha-lang"); setVal("gha-langver", "3.12"); input("gha-langver");
setVal("gha-deploy", "ssh"); change("gha-deploy");
check("G7 Python 预设 + SSH 部署占位",!errVisible("gha-err") && out("gha-out").includes("actions/setup-python@v5") && out("gha-out").includes("pytest") && out("gha-out").includes("DEPLOY_KEY") && out("gha-out").includes("绝不能把私钥明文"), out("gha-out").slice(0, 300));
click("gha-copy"); await tick();
check("G8 复制按钮写入剪贴板", copiedText === out("gha-out") && doc.getElementById("gha-msg").textContent.includes("已复制"));
setVal("gha-name", "改过的名字"); input("gha-name"); click("gha-clear");
check("G9 恢复默认", doc.getElementById("gha-name").value === "CI" && out("gha-out").includes("name: CI"));

// ============ N-14 plan ============
check("P1 默认估算（动态/峰值50/每请求30MB）",!errVisible("plan-err") && out("plan-out").includes("建议区间：3–4 核") && out("plan-out").includes("建议规格：4 GB") && out("plan-out").includes("粗略估算，上线前需压测") && out("plan-out").includes(""), out("plan-out").slice(0, 400));
setVal("plan-peak", "0"); input("plan-peak");
check("P2 峰值并发为 0 报错", errVisible("plan-err") && errText("plan-err").includes("不能为 0"), errText("plan-err"));
setVal("plan-peak", "50"); input("plan-peak");
setVal("plan-dau", "20000"); input("plan-dau");
check("P3 日活大于总用户报错", errVisible("plan-err") && errText("plan-err").includes("日活用户数不能大于总用户数"), errText("plan-err"));
setVal("plan-dau", "1000"); input("plan-dau");
setVal("plan-type", "static"); change("plan-type"); setVal("plan-disk", "0"); input("plan-disk");
check("P4 静态站 + 数据 0 可算",!errVisible("plan-err") && out("plan-out").includes("建议区间：20–40 GB"), out("plan-out").slice(0, 400));
setVal("plan-peak", "1000000"); input("plan-peak");
check("P5 极大并发不崩溃",!errVisible("plan-err") && out("plan-out").includes(""), errText("plan-err"));
click("plan-clear");
check("P6 恢复默认", doc.getElementById("plan-peak").value === "50" && out("plan-out").includes("建议区间：3–4 核"));

// ============ N-15 log ============
click("log-run");
check("L1 默认样例统计",!errVisible("log-err") && out("log-out").includes("非空行 14 行") && out("log-out").includes("error：7 行") && out("log-out").includes("warn：2 行") && out("log-out").includes("Oct 23 09:12:01") && out("log-out").includes("Oct 23 09:21:15"), out("log-out").slice(0, 500));
check("L1b 错误模式聚合与服务 Top", out("log-out").includes("×2") && out("log-out").includes("database connection timeout") && out("log-out").includes("backup.service：2 行") && out("log-out").includes("sshd：4 行"), out("log-out").slice(0, 800));
setVal("log-text", ""); click("log-run");
check("L2 空输入报错", errVisible("log-err") && errText("log-err").includes("请先粘贴日志内容"), errText("log-err"));
const bigLog = Array.from({ length: 2100}, (_, i) => "INFO worker heartbeat " + i).join("\n");
setVal("log-text", bigLog); click("log-run");
check("L3 超 2000 行截断提示", out("log-out").includes("已按上限截断为前 2000 行") && out("log-out").includes("非空行 2000 行"), out("log-out").slice(0, 200));
setVal("log-text", "hello world\nsomething error happened\nplain line"); click("log-run");
check("L4 无时间戳/无服务时明说", out("log-out").includes("未识别到 ISO / syslog 样式的时间戳") && out("log-out").includes("未识别出服务名") && out("log-out").includes("error：1 行"), out("log-out").slice(0, 400));
setVal("log-text", "2026-01-01T10:00:00 app INFO boot\n2026-01-01T10:05:00 app ERROR disk full"); click("log-run");
check("L5 ISO 时间范围", out("log-out").includes("2026-01-01T10:00:00") && out("log-out").includes("2026-01-01T10:05:00") && out("log-out").includes("✗ 严重") === false, out("log-out").slice(0, 300));
click("log-clear");
check("L6 清空按钮", doc.getElementById("log-text").value === "" && doc.getElementById("log-msg").textContent.includes("已清空"));

// ============ N-18 apt ============
click("apt-run");
check("A1 默认样例检出混源与明文",!errVisible("apt-err") && out("apt-out").includes("代号不一致") && out("apt-out").includes("jammy") && out("apt-out").includes("http 明文源") && out("apt-out").includes("第三方源且未见") && out("apt-out").includes("deb-src 源码源") && out("apt-out").includes("有 1 处严重问题"), out("apt-out").slice(0, 600));
setVal("apt-text", ""); click("apt-run");
check("A2 空输入报错", errVisible("apt-err") && errText("apt-err").includes("请先粘贴"), errText("apt-err"));
setVal("apt-text", "deb [signed-by=/usr/share/keyrings/x.gpg] https://archive.ubuntu.com/ubuntu noble main\ndeb https://security.ubuntu.com/ubuntu noble-security main"); click("apt-run");
check("A3 干净源无问题",!errVisible("apt-err") && out("apt-out").includes("没有发现问题"), out("apt-out").slice(0, 300));
setVal("apt-target", "jammy"); change("apt-target");
setVal("apt-text", "Types: deb\nURIs: https://deb.debian.org/debian\nSuites: noble\nComponents: main\nSigned-By: /usr/share/keyrings/x.gpg"); click("apt-run");
check("A4.sources 格式代号不一致检出", out("apt-out").includes("代号不一致"), out("apt-out").slice(0, 300));
setVal("apt-target", "noble"); change("apt-target");
setVal("apt-text", "hello world foo bar"); click("apt-run");
check("A5 乱码输入报错", errVisible("apt-err") && errText("apt-err").includes("没有解析到任何源条目"), errText("apt-err"));
setVal("apt-text", "deb https://archive.ubuntu.com/ubuntu noble main\ndeb https://archive.ubuntu.com/ubuntu noble main"); click("apt-run");
check("A6 重复条目检出", out("apt-out").includes("重复"), out("apt-out").slice(0, 300));
// pin 部分（切换目标版本会触发 aptPinGenerate 联动，先恢复默认再断言）
click("apt-pclear");
check("AP1 默认 pin 条目",!errVisible("apt-perr") && out("apt-pout").includes("/etc/apt/preferences.d/pin-nginx.pref") && out("apt-pout").includes("Pin: release a=noble") && out("apt-pout").includes("Pin-Priority: 1001") && out("apt-pout").includes("> 1000") && out("apt-pout").includes("apt-cache policy nginx"), out("apt-pout").slice(0, 400));
setVal("apt-ver", "1.24.0-2ubuntu7"); input("apt-ver");
check("AP2 填版本按 version pin", out("apt-pout").includes("Pin: version 1.24.0-2ubuntu7"), out("apt-pout").slice(0, 200));
setVal("apt-pkg", "Nginx!"); input("apt-pkg");
check("AP3 包名非法报错", errVisible("apt-perr") && errText("apt-perr").includes("包名不合法"), errText("apt-perr"));
setVal("apt-pkg", "nginx"); input("apt-pkg"); setVal("apt-prio", "0"); input("apt-prio");
check("AP4 优先级 0 的语义说明",!errVisible("apt-perr") && out("apt-pout").includes("不会被自动选中"), out("apt-pout").slice(0, 300));
setVal("apt-prio", "-1"); input("apt-prio");
check("AP5 负优先级=禁止安装", out("apt-pout").includes("禁止安装"), out("apt-pout").slice(0, 300));
setVal("apt-prio", "500"); input("apt-prio");
check("AP6 优先级 500 落在 100–1000 区间", out("apt-pout").includes("100 – 1000"), out("apt-pout").slice(0, 300));

// ============ N-20 mig ============
check("M1 默认计划完整",!errVisible("mig-err") && out("mig-out").includes("阶段一：盘点与准备") && out("mig-out").includes("阶段五：正式切换") && out("mig-out").includes("## 回滚方案") && out("mig-out").includes("TTL") && out("mig-out").includes("pg_dump") && out("mig-out").includes("Ubuntu 22.04 → Ubuntu 24.04") && out("mig-out").includes("约 2.2 小时") && (out("mig-out").match(/\[ \]/g) || []).length >= 20, out("mig-out").slice(0, 400));
doc.querySelectorAll(".mig-svc").forEach((el) => { el.checked = false; el.dispatchEvent(new window.Event("change", { bubbles: true}));});
check("M2 未勾任何服务报错", errVisible("mig-err") && errText("mig-err").includes("至少勾选一个"), errText("mig-err"));
doc.querySelectorAll(".mig-svc").forEach((el) => { if (el.value === "mail") { el.checked = true; el.dispatchEvent(new window.Event("change", { bubbles: true}));}});
setChk("mig-dns", false); change("mig-dns");
check("M3 邮件服务 + 无 DNS 切换的回滚路径",!errVisible("mig-err") && out("mig-out").includes("MX") && out("mig-out").includes("流量入口") &&!out("mig-out").includes("把域名 TTL"), out("mig-out").slice(0, 400));
setVal("mig-data", "-5"); input("mig-data");
check("M4 负数据量报错", errVisible("mig-err") && errText("mig-err").includes("数据量应是"), errText("mig-err"));
setVal("mig-data", "100"); input("mig-data"); setVal("mig-window", "0"); change("mig-window");
check("M5 不停机窗口的切换表述", out("mig-out").includes("不停机（分钟级切换）") && out("mig-out").includes("双写/只读过渡"), out("mig-out").slice(0, 300));
click("mig-clear");
check("M6 恢复默认", doc.getElementById("mig-dns").checked === true && out("mig-out").includes("阶段一：盘点与准备") &&!errVisible("mig-err"));

// ============ N-22 curl ============
check("C1 默认 GET 单行+多行",!errVisible("curl-err") && out("curl-out").includes("===== 单行 =====") && out("curl-out").includes("curl 'https://example.com/api/items'") && out("curl-out").includes("反斜杠续行") &&!out("curl-out").includes("-X GET"), out("curl-out").slice(0, 300));
setVal("curl-method", "POST"); change("curl-method"); setVal("curl-ctype", "json"); change("curl-ctype"); setVal("curl-body", "{\"a\":1}"); input("curl-body");
check("C2 POST + JSON 体", out("curl-out").includes("-X POST") && out("curl-out").includes("'Content-Type: application/json'") && out("curl-out").includes("--data '{\"a\":1}'"), out("curl-out").slice(0, 400));
setVal("curl-headers", "X-Name: O'Brien"); input("curl-headers");
check("C3 单引号转义", out("curl-out").includes("O'\\''Brien"), out("curl-out").slice(0, 400));
setVal("curl-headers", "NoColonLine"); input("curl-headers");
check("C4 请求头格式非法报错", errVisible("curl-err") && errText("curl-err").includes("头名: 值"), errText("curl-err"));
setVal("curl-headers", ""); input("curl-headers");
setVal("curl-url", "ftp://example.com/x"); input("curl-url");
check("C5 非 http URL 报错", errVisible("curl-err") && errText("curl-err").includes("https://"), errText("curl-err"));
setVal("curl-url", "https://example.com/api/items"); input("curl-url");
setVal("curl-ctype", "form"); change("curl-ctype"); setVal("curl-body", "a=1\nb=hello world"); input("curl-body");
check("C6 表单体逐项 urlencode", out("curl-out").includes("--data-urlencode 'a=1'") && out("curl-out").includes("--data-urlencode 'b=hello world'") && out("curl-out").includes("application/x-www-form-urlencoded"), out("curl-out").slice(0, 400));
setVal("curl-body", "novalue"); input("curl-body");
check("C6b 表单行缺 = 报错", errVisible("curl-err") && errText("curl-err").includes("键=值"), errText("curl-err"));
setVal("curl-body", ""); input("curl-body"); setVal("curl-ctype", "none"); change("curl-ctype"); setVal("curl-method", "GET"); change("curl-method");
setVal("curl-auth", "bearer"); change("curl-auth");
check("C7 Bearer 未填 Token 报错", errVisible("curl-err") && errText("curl-err").includes("Token 为空"), errText("curl-err"));
setVal("curl-token", "tok123"); input("curl-token");
check("C7b Bearer 命令与凭据警告",!errVisible("curl-err") && out("curl-out").includes("'Authorization: Bearer tok123'") && out("curl-out").includes("本命令包含 Bearer Token"), out("curl-out").slice(0, 300));
setVal("curl-auth", "none"); change("curl-auth"); setVal("curl-method", "HEAD"); change("curl-method"); setVal("curl-body", "x=1"); input("curl-body");
check("C8 HEAD 忽略请求体提示", out("curl-out").includes("-I") && out("curl-out").includes("已忽略你填的请求体"), out("curl-out").slice(0, 300));
setVal("curl-method", "GET"); change("curl-method"); setVal("curl-body", ""); input("curl-body");
setChk("curl-k", true); change("curl-k"); setVal("curl-proxy", "http://127.0.0.1:7890"); input("curl-proxy"); setVal("curl-retry", "3"); input("curl-retry"); setVal("curl-timeout", "30"); input("curl-timeout");
check("C9 -k/代理/重试/超时齐全", out("curl-out").includes("-k") && out("curl-out").includes("--proxy 'http://127.0.0.1:7890'") && out("curl-out").includes("--retry 3") && out("curl-out").includes("--max-time 30") && out("curl-out").includes("跳过 TLS 证书校验"), out("curl-out").slice(0, 500));
setVal("curl-timeout", "9999"); input("curl-timeout");
check("C10 超时越界报错", errVisible("curl-err") && errText("curl-err").includes("超时秒数应为"), errText("curl-err"));
click("curl-clear");
check("C11 恢复默认", doc.getElementById("curl-url").value === "https://example.com/api/items" &&!errVisible("curl-err"));

// ============ N-23 sshlog ============
click("sshlog-run");
check("S1 默认样例统计",!errVisible("sshlog-err") && out("sshlog-out").includes("成功登录 4 次") && out("sshlog-out").includes("失败尝试 10 次") && out("sshlog-out").includes("无效用户名失败 7 次") && out("sshlog-out").includes("203.0.113.66：9 次") && out("sshlog-out").includes("认证前断开（preauth）1 次"), out("sshlog-out").slice(0, 600));
check("S1b 默认样例判为可疑且双栖 IP 提示", out("sshlog-out").includes("\u3010结论\u3011可疑") && out("sshlog-out").includes("无效用户名失败尝试 7 次（≥5）") && out("sshlog-out").includes("192.0.2.11") && out("sshlog-out").includes("既有失败又有成功登录") && out("sshlog-out").includes("fail2ban"), out("sshlog-out").slice(0, 900));
setVal("sshlog-text", "Oct 23 09:00:01 web-01 sshd[101]: Accepted publickey for ubuntu from 192.0.2.5 port 50001 ssh2\nOct 23 09:01:01 web-01 sshd[102]: Failed password for ubuntu from 192.0.2.5 port 50002 ssh2\nOct 23 09:02:01 web-01 sshd[103]: Failed password for ubuntu from 192.0.2.5 port 50003 ssh2");
click("sshlog-run");
check("S2 关键断言：只有一两条失败必须判观察而非攻击", out("sshlog-out").includes("\u3010结论\u3011观察") && out("sshlog-out").includes("不判定为攻击") &&!out("sshlog-out").includes("\u3010结论\u3011高风险"), out("sshlog-out").slice(0, 500));
const atk = [];
for (let i = 0; i < 55; i++) { atk.push("Oct 23 10:00:" + String(i % 60).padStart(2, "0") + " web-01 sshd[3" + i + "]: Failed password for invalid user admin from 198.51.100.7 port 400" + i + " ssh2");}
setVal("sshlog-text", atk.join("\n")); click("sshlog-run");
check("S3 高频失败+无效用户名判高风险", out("sshlog-out").includes("\u3010结论\u3011高风险") && out("sshlog-out").includes("爆破组合"), out("sshlog-out").slice(0, 500));
setVal("sshlog-text", ""); click("sshlog-run");
check("S4 空输入报错", errVisible("sshlog-err") && errText("sshlog-err").includes("请先粘贴"), errText("sshlog-err"));
setVal("sshlog-text", "random text\nmore text here"); click("sshlog-run");
check("S5 无可识别记录时明说无法判断",!errVisible("sshlog-err") && out("sshlog-out").includes("无法判断"), out("sshlog-out").slice(0, 200));
click("sshlog-clear");
check("S6 清空按钮", doc.getElementById("sshlog-text").value === "" && doc.getElementById("sshlog-msg").textContent.includes("已清空"));

// ============ N-29 git ============
check("T1 默认新建分支场景",!errVisible("git-err") && out("git-out").includes("git switch -c feature/login") && out("git-out").includes("git checkout -b feature/login"), out("git-out").slice(0, 300));
setVal("git-cat", "commit"); change("git-cat"); setVal("git-scene", "all"); change("git-scene");
check("T2 一键提交缺信息报错", errVisible("git-err") && errText("git-err").includes("需要填提交信息"), errText("git-err"));
setVal("git-cmsg", "fix: 修复登录超时"); input("git-cmsg");
check("T2b 一键提交含密钥提醒",!errVisible("git-err") && out("git-out").includes("git add -A") && out("git-out").includes("git commit -m 'fix: 修复登录超时'") && out("git-out").includes(".env"), out("git-out").slice(0, 500));
setVal("git-cat", "undo"); change("git-cat"); setVal("git-scene", "hard"); change("git-scene");
check("T3 reset --hard 带 ⚠ 与备份/替代", out("git-out").includes("git reset --hard HEAD~1") && out("git-out").includes("backup-before-reset") && out("git-out").includes("git revert") && out("git-out").includes("⚠"), out("git-out").slice(0, 600));
setVal("git-cat", "sync"); change("git-cat"); setVal("git-scene", "push"); change("git-scene"); setVal("git-branch", "main"); input("git-branch"); setChk("git-force", true); change("git-force");
check("T4 强推只用 force-with-lease", out("git-out").includes("--force-with-lease") &&!/--force(?!-with-lease)/.test(out("git-out").replace("裸 --force", "").replace("裸 `--force`", "")) && out("git-out").includes("⚠"), out("git-out").slice(0, 600));
setChk("git-force", false); change("git-force");
setVal("git-cat", "merge"); change("git-cat"); setVal("git-scene", "rebase"); change("git-scene"); setVal("git-branch", "main"); input("git-branch");
check("T5 rebase 场景含备份与已推送警告", out("git-out").includes("git rebase main") && out("git-out").includes("backup-before-rebase") && out("git-out").includes("不要 rebase"), out("git-out").slice(0, 500));
setVal("git-cat", "tag"); change("git-cat"); setVal("git-scene", "annotated"); change("git-scene"); setVal("git-tag", "v1.2.0"); input("git-tag"); setVal("git-cmsg", "release"); input("git-cmsg");
check("T6 附注标签", out("git-out").includes("git tag -a v1.2.0 -m 'release'") && out("git-out").includes("git push origin v1.2.0"), out("git-out").slice(0, 400));
setVal("git-cat", "branch"); change("git-cat"); setVal("git-scene", "new"); change("git-scene"); setVal("git-branch", "bad..name"); input("git-branch");
check("T7 非法分支名报错", errVisible("git-err") && errText("git-err").includes("不能含"), errText("git-err"));
setVal("git-branch", "feature/login"); input("git-branch");
setVal("git-cat", "stash"); change("git-cat"); setVal("git-scene", "save"); change("git-scene"); setVal("git-cmsg", ""); input("git-cmsg");
check("T8 stash 默认说明 wip", out("git-out").includes("git stash push -m 'wip'") && out("git-out").includes("git stash list"), out("git-out").slice(0, 400));
setVal("git-remote", "bad remote!"); input("git-remote"); setVal("git-cat", "sync"); change("git-cat"); setVal("git-scene", "push"); change("git-scene");
check("T9 非法远程名报错", errVisible("git-err") && errText("git-err").includes("远程名不合法"), errText("git-err"));
click("git-clear");
check("T10 恢复默认", doc.getElementById("git-remote").value === "origin" && out("git-out").includes("git switch -c feature/login"));

// ============ N-32 explain ============
click("explain-run");
check("E1 关键断言：sudo rm -rf 判高风险并拆解 -r/-f",!errVisible("explain-err") && out("explain-out").includes("高风险") && out("explain-out").includes("（3 / 3）") && out("explain-out").includes("-r 与 -f 同时出现") && out("explain-out").includes("递归删除目录及其全部内容") && out("explain-out").includes("sudo"), out("explain-out").slice(0, 600));
setVal("explain-text", "foobar --x"); click("explain-run");
check("E2 关键断言：未知命令明说未收录", out("explain-out").includes("命令「foobar」：未收录") && out("explain-out").includes("man foobar") && out("explain-out").includes("未收录项"), out("explain-out").slice(0, 300));
setVal("explain-text", "cat /var/log/syslog | grep error > /tmp/err.txt"); click("explain-run");
check("E3 管道 + 覆盖重定向", out("explain-out").includes("管道：上一段的输出作为这一段的输入") && out("explain-out").includes("按模式搜索文本行") && out("explain-out").includes("覆盖清空") && out("explain-out").includes("（1 / 3）"), out("explain-out").slice(0, 600));
setVal("explain-text", "curl -fsSL https://example.com/i.sh | sudo bash"); click("explain-run");
check("E4 下载管道执行判高风险", out("explain-out").includes("组合风险") && out("explain-out").includes("高风险"), out("explain-out").slice(0, 600));
setVal("explain-text", "ls --frobnicate /tmp"); click("explain-run");
check("E5 已知命令的未知参数明说未收录", out("explain-out").includes("参数 --frobnicate：未收录"), out("explain-out").slice(0, 300));
setVal("explain-text", "systemctl stop nginx"); click("explain-run");
check("E6 systemctl 子命令与权限", out("explain-out").includes("子命令 stop：立即停止服务") && out("explain-out").includes("所需权限：root") && out("explain-out").includes("（2 / 3）"), out("explain-out").slice(0, 500));
setVal("explain-text", "crontab -r"); click("explain-run");
check("E7 crontab -r 高风险", out("explain-out").includes("全部定时任务") && out("explain-out").includes("（3 / 3）"), out("explain-out").slice(0, 400));
setVal("explain-text", ""); click("explain-run");
check("E8 空输入报错", errVisible("explain-err") && errText("explain-err").includes("请先输入一条命令"), errText("explain-err"));
setVal("explain-text", "chmod -R 777 /var/www"); click("explain-run");
check("E9 chmod -R 777 高风险", out("explain-out").includes("任何人可读可写可执行") && out("explain-out").includes("（3 / 3）"), out("explain-out").slice(0, 500));
setVal("explain-text", "dd if=/dev/zero of=/dev/sda bs=4M"); click("explain-run");
check("E10 dd 键值参数与高风险", out("explain-out").includes("输出目标（output file）") && out("explain-out").includes("（3 / 3）"), out("explain-out").slice(0, 500));
setVal("explain-text", "grep -r error /var/log 2>/dev/null"); click("explain-run");
check("E11 2> 重定向解释", out("explain-out").includes("把标准错误（报错信息）写入「/dev/null」") && out("explain-out").includes("递归搜索整个目录"), out("explain-out").slice(0, 500));
setVal("explain-text", "tar -czf backup.tar.gz /srv/data && ls -lh"); click("explain-run");
check("E12 组合短参数逐个拆解 + && 说明", out("explain-out").includes("参数 -c：") && out("explain-out").includes("参数 -z：") && out("explain-out").includes("参数 -f：") && out("explain-out").includes("&&：上一段执行成功才执行这一段"), out("explain-out").slice(0, 700));
click("explain-clear");
check("E13 清空按钮", doc.getElementById("explain-text").value === "" && doc.getElementById("explain-msg").textContent.includes("已清空"));

console.log("\n总计：" + (pass + fail) + "，通过 " + pass + "，失败 " + fail);
if (failures.length) { console.log("失败项：\n - " + failures.join("\n - ")); process.exit(1);}
