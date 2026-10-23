// 批次 D 测试（片段自组装页）：sections.md + tools.js + 从 index.md 原样摘录的 bindCopy/showCopyToast。
// DNS 的 fetch 用可计数桩替换，验证「未点查询不发请求」与四种 canned 响应。
// 运行：node test-d.mjs（在 guide-tools-dev/batch-d 下，jsdom 已装在 ../node_modules）
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sections = readFileSync(join(here, "sections.md"), "utf8");
const toolsJs = readFileSync(join(here, "tools.js"), "utf8");
const indexMd = readFileSync(join(here, "../../../../docs/tools/index.md"), "utf8");

const helperStart = indexMd.indexOf("function showCopyToast()");
const helperEnd = indexMd.indexOf("function initGuideTools()");
if (helperStart < 0 || helperEnd < 0) throw new Error("无法从 index.md 摘录 bindCopy 助手");
const helpers = indexMd.slice(helperStart, helperEnd);

const fetchStub = `<script>
window.__fetchCalls = [];
window.__fetchImpl = function () { return Promise.reject(new Error("stub not set")); };
window.fetch = function (url, opts) { window.__fetchCalls.push({ url: String(url), opts: opts || {} }); return window.__fetchImpl(url, opts); };
</` + `script>`;

const html = "<!DOCTYPE html><html><body>" + sections +
  "<script>" + helpers + "</" + "script>" +
  fetchStub +
  "<script>" + toolsJs + "</" + "script>" +
  "<script>initDnsTool();initHdrTool();initFwmTool();</" + "script>" +
  "</body></html>";

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
const { window } = dom;
const doc = window.document;
let copiedText = null;
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: (t) => { copiedText = t; return Promise.resolve(); } },
  configurable: true,
});

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " | " + extra : "")); }
}
function setVal(id, v) { doc.getElementById(id).value = v; }
function fire(id, type) { doc.getElementById(id).dispatchEvent(new window.Event(type, { bubbles: true })); }
function input(id) { fire(id, "input"); }
function change(id) { fire(id, "change"); }
function click(id) { doc.getElementById(id).click(); }
function out(id) { return doc.getElementById(id).textContent; }
function errVisible(id) { return doc.getElementById(id).style.display === "block"; }
function errText(id) { return doc.getElementById(id).textContent; }
async function settle() { for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 5)); } }
function okJson(obj) { return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) }); }

/* ================= DNS ================= */
const A_RESP = { Status: 0, TC: false, RD: true, RA: true, AD: true, Question: [{ name: "example.com.", type: 1 }], Answer: [{ name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" }] };

// D1 未点查询前不发任何请求：init 后 + 改各种输入，都不许 fetch
check("D1a init 后 fetch 调用次数 = 0", window.__fetchCalls.length === 0, "calls=" + window.__fetchCalls.length);
check("D1b 初始输出明示不点不联网", out("dns-out").includes("不点不联网"));
setVal("dns-name", "example.org"); input("dns-name");
setVal("dns-type", "MX"); change("dns-type");
setVal("dns-provider", "google"); change("dns-provider");
check("D1c 改输入/下拉后 fetch 调用次数仍 = 0", window.__fetchCalls.length === 0, "calls=" + window.__fetchCalls.length);
setVal("dns-type", "A"); setVal("dns-provider", "cloudflare"); setVal("dns-name", "example.com");

// D2 正常 A 记录（Cloudflare）
window.__fetchImpl = () => okJson(A_RESP);
click("dns-run");
await settle();
check("D2a 点击后恰好发出 1 次请求", window.__fetchCalls.length === 1, "calls=" + window.__fetchCalls.length);
check("D2b 请求打到 cloudflare-dns.com 且带 name/type", window.__fetchCalls[0].url.includes("cloudflare-dns.com/dns-query") && window.__fetchCalls[0].url.includes("name=example.com") && window.__fetchCalls[0].url.includes("type=A"), window.__fetchCalls[0].url);
check("D2c 输出含记录值与 NoError", out("dns-out").includes("93.184.216.34") && out("dns-out").includes("NoError"), out("dns-out").slice(0, 120));

// D3 NXDOMAIN
window.__fetchCalls.length = 0;
window.__fetchImpl = () => okJson({ Status: 3, Question: [{ name: "nope.example.com.", type: 1 }], Authority: [{ name: "example.com.", type: 6, TTL: 3600, data: "a.iana-servers.net. hostmaster.example.com. 1 7200 3600 1209600 3600" }] });
setVal("dns-name", "nope.example.com"); input("dns-name");
click("dns-run");
await settle();
check("D3 NXDOMAIN 有专门解读与排查方向", out("dns-out").includes("NXDOMAIN") && out("dns-out").includes("查无此名") && out("dns-out").includes("排查方向"), out("dns-out").slice(0, 150));

// D4 CNAME 链
window.__fetchCalls.length = 0;
window.__fetchImpl = () => okJson({ Status: 0, Question: [{ name: "www.example.com.", type: 1 }], Answer: [
  { name: "www.example.com.", type: 5, TTL: 300, data: "example.com." },
  { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" }] });
setVal("dns-name", "www.example.com"); input("dns-name");
click("dns-run");
await settle();
check("D4 CNAME 链被跟出且给出终点地址", out("dns-out").includes("别名链") && out("dns-out").includes("www.example.com. → example.com.") && out("dns-out").includes("链的终点实际解析到") && out("dns-out").includes("93.184.216.34"), out("dns-out").slice(0, 200));

// D5 网络失败：明确报错，不冒充无记录
window.__fetchCalls.length = 0;
window.__fetchImpl = () => Promise.reject(new Error("Failed to fetch"));
click("dns-run");
await settle();
check("D5a 网络失败走 err 区明确报错", errVisible("dns-err") && errText("dns-err").includes("查询失败") && errText("dns-err").includes("dig +short"), errText("dns-err").slice(0, 100));
check("D5b 失败输出不含 NoError 误导", !out("dns-out").includes("NoError"));

// D6 PTR 自动构造反向名
window.__fetchCalls.length = 0;
let lastUrl = "";
window.__fetchImpl = (u) => { lastUrl = String(u); return okJson({ Status: 0, Question: [{ name: "7.113.0.203.in-addr.arpa.", type: 12 }], Answer: [{ name: "7.113.0.203.in-addr.arpa.", type: 12, TTL: 3600, data: "host.example.com." }] }); };
setVal("dns-name", "203.0.113.7"); setVal("dns-type", "PTR"); change("dns-type");
click("dns-run");
await settle();
check("D6a PTR 请求名被自动反转", lastUrl.includes("name=7.113.0.203.in-addr.arpa"), lastUrl);
check("D6b 输出注明自动构造并含 PTR 解读", out("dns-out").includes("已按 IP 自动构造反向名") && out("dns-out").includes("FCrDNS"), out("dns-out").slice(0, 150));

// D7 空输入报错且不发请求
window.__fetchCalls.length = 0;
setVal("dns-name", ""); input("dns-name");
click("dns-run");
await settle();
check("D7 空输入 err 且 fetch 次数 = 0", errVisible("dns-err") && errText("dns-err").includes("先填要查询的域名或 IP") && window.__fetchCalls.length === 0);

// D8 非法域名（带协议头/空格）报错且不发请求
setVal("dns-name", "http://bad name"); input("dns-name");
click("dns-run");
await settle();
check("D8 非法域名 err 且 fetch 次数 = 0", errVisible("dns-err") && errText("dns-err").includes("域名格式不正确") && window.__fetchCalls.length === 0);

// D9 MX 优先级排序解读
window.__fetchCalls.length = 0;
window.__fetchImpl = () => okJson({ Status: 0, Question: [{ name: "example.com.", type: 15 }], Answer: [
  { name: "example.com.", type: 15, TTL: 3600, data: "20 mx2.example.com." },
  { name: "example.com.", type: 15, TTL: 3600, data: "10 mx1.example.com." }] });
setVal("dns-name", "example.com"); setVal("dns-type", "MX"); change("dns-type");
click("dns-run");
await settle();
check("D9 MX 按优先级从小到大列出", out("dns-out").indexOf("优先级 10") !== -1 && out("dns-out").indexOf("优先级 10") < out("dns-out").indexOf("优先级 20"), out("dns-out").slice(0, 200));

// D9b TXT SPF 解读
window.__fetchImpl = () => okJson({ Status: 0, Question: [{ name: "example.com.", type: 16 }], Answer: [{ name: "example.com.", type: 16, TTL: 3600, data: "\"v=spf1 -all\"" }] });
setVal("dns-type", "TXT"); change("dns-type");
click("dns-run");
await settle();
check("D9b TXT 中的 SPF 被识别解读", out("dns-out").includes("SPF 记录"), out("dns-out").slice(0, 200));

// D10 IP + 非 PTR 类型：提示而不是乱查
window.__fetchCalls.length = 0;
setVal("dns-name", "203.0.113.7"); setVal("dns-type", "A"); change("dns-type");
click("dns-run");
await settle();
check("D10 IP 配 A 类型给出改选 PTR 的提示且不发请求", errVisible("dns-err") && errText("dns-err").includes("PTR") && window.__fetchCalls.length === 0);

// D11 Google 解析商 URL
window.__fetchCalls.length = 0;
window.__fetchImpl = () => okJson(A_RESP);
setVal("dns-name", "example.com"); setVal("dns-provider", "google"); change("dns-provider");
click("dns-run");
await settle();
check("D11 Google 解析商打到 dns.google/resolve", window.__fetchCalls.length === 1 && window.__fetchCalls[0].url.indexOf("https://dns.google/resolve?") === 0, window.__fetchCalls[0] && window.__fetchCalls[0].url);

/* ================= HDR ================= */
check("H1a 默认命令为 curl -sI https://example.com", out("hdr-cmd").includes("curl -sI https://example.com"), out("hdr-cmd"));
setVal("hdr-url", "https://a.example.com/path"); input("hdr-url");
check("H1b 改网址后命令同步更新", out("hdr-cmd").includes("curl -sI https://a.example.com/path"), out("hdr-cmd"));
setVal("hdr-url", "https://example.com"); input("hdr-url");

const GOOD = [
  "HTTP/2 200",
  "strict-transport-security: max-age=63072000; includeSubDomains",
  "content-security-policy: default-src 'self'; script-src 'self'; object-src 'none'",
  "x-content-type-options: nosniff",
  "x-frame-options: DENY",
  "referrer-policy: strict-origin-when-cross-origin",
  "permissions-policy: camera=(), microphone=()",
  "cache-control: no-store",
  "set-cookie: sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
  "content-type: text/html; charset=utf-8"
].join("\n");
setVal("hdr-input", GOOD);
click("hdr-run");
check("H2a 全良好头：HSTS 判良好", out("hdr-out").includes("[良好] Strict-Transport-Security 已设置且时长达标"), out("hdr-out").slice(0, 300));
check("H2b 全良好头：严重 0 项", out("hdr-out").includes("严重 0 项"), out("hdr-out").slice(0, 200));
check("H2c Cookie 三件套判良好", out("hdr-out").includes("属性齐全"));
check("H2d 无 err", !errVisible("hdr-err"));

const BARE = "HTTP/1.1 200 OK\r\nServer: nginx/1.24.0\r\nContent-Type: text/html\r\n\r\n";
setVal("hdr-input", BARE);
click("hdr-run");
check("H3a 缺 HSTS 报警告", out("hdr-out").includes("[警告] Strict-Transport-Security 未设置"));
check("H3b 缺 CSP 报警告", out("hdr-out").includes("[警告] Content-Security-Policy 未设置"));
check("H3c Server 版本号被点出", out("hdr-out").includes("暴露了软件与版本号"));
check("H4a 无 Set-Cookie 不误报 Cookie 属性问题", !out("hdr-out").includes("没有 Secure 属性") && !out("hdr-out").includes("没有 HttpOnly 属性"));
check("H4b 无 Set-Cookie 给中性说明", out("hdr-out").includes("未发现 Set-Cookie") && out("hdr-out").includes("不是问题"));

const BADCOOKIE = [
  "HTTP/1.1 200 OK",
  "set-cookie: sid=xyz; Path=/",
  "set-cookie: track=t1; Path=/; SameSite=None",
  "content-type: text/html"
].join("\n");
setVal("hdr-input", BADCOOKIE);
click("hdr-run");
check("H5a 裸 Cookie 缺 Secure 报警告", out("hdr-out").includes("[警告] Cookie「sid」没有 Secure 属性"));
check("H5b 裸 Cookie 缺 HttpOnly 报警告", out("hdr-out").includes("[警告] Cookie「sid」没有 HttpOnly 属性"));
check("H5c SameSite=None 无 Secure 报严重", out("hdr-out").includes("[严重] Cookie「track」设置了 SameSite=None 却没有 Secure"));

const CACHE = ["HTTP/1.1 200 OK", "cache-control: public, max-age=3600", "set-cookie: sid=q; Path=/; Secure; HttpOnly; SameSite=Lax", "content-type: text/html"].join("\n");
setVal("hdr-input", CACHE);
click("hdr-run");
check("H6 带 Cookie 又允许缓存报警告", out("hdr-out").includes("却允许被缓存"));

setVal("hdr-input", "");
click("hdr-run");
check("H7 空输入 err", errVisible("hdr-err") && errText("hdr-err").includes("先把响应头粘贴"));

setVal("hdr-input", "随便一段不是响应头的文字\n第二行也没有冒号结构");
click("hdr-run");
check("H8 垃圾输入 err", errVisible("hdr-err") && errText("hdr-err").includes("没识别出任何响应头"), errText("hdr-err"));

// H9 复制路径
setVal("hdr-input", GOOD);
click("hdr-run");
copiedText = null;
click("hdr-copy");
await settle();
check("H9 复制按钮把 out 写入剪贴板桩", copiedText === out("hdr-out") && copiedText.length > 50);

/* ================= FWM ================= */
function resetFwm() {
  setVal("fwm-lan", "192.168.1.0/24"); setVal("fwm-ip", "203.0.113.10"); setVal("fwm-policy", "deny");
  setVal("fwm-ssh", "public"); setVal("fwm-web", "public"); setVal("fwm-mysql", "local");
  setVal("fwm-pg", "local"); setVal("fwm-redis", "local"); setVal("fwm-cname", "myapp");
  setVal("fwm-cport", "8080"); setVal("fwm-custom", "none");
  change("fwm-ssh");
}
resetFwm();
check("F1a 默认含规划矩阵摘要", out("fwm-out").includes("规划矩阵摘要") && out("fwm-out").includes("MySQL"));
check("F1b SSH 放行在 80 之前且在 enable 之前", out("fwm-out").indexOf("sudo ufw allow 22/tcp") !== -1 && out("fwm-out").indexOf("sudo ufw allow 22/tcp") < out("fwm-out").indexOf("sudo ufw allow 80/tcp") && out("fwm-out").indexOf("sudo ufw allow 22/tcp") < out("fwm-out").indexOf("sudo ufw enable"));
check("F1c 输出强调 SSH 第一条与顺序", out("fwm-out").includes("第一条永远先放行 SSH"));
check("F1d 默认 SSH 公网给密钥+fail2ban 提示", out("fwm-out").includes("fail2ban"));
check("F1e 默认 MySQL 仅本机不生成 3306 放行", !out("fwm-out").includes("ufw allow 3306"));

setVal("fwm-mysql", "public"); change("fwm-mysql");
check("F2 MySQL 公网报严重风险且生成放行命令", out("fwm-out").includes("[严重] MySQL") && out("fwm-out").includes("sudo ufw allow 3306/tcp"));
resetFwm();

setVal("fwm-ssh", "ip"); change("fwm-ssh");
check("F3a SSH 指定 IP 生成 from 规则", out("fwm-out").includes("sudo ufw allow from 203.0.113.10 to any port 22 proto tcp"), out("fwm-out").slice(0, 400));
check("F3b SSH 限源给出 ✓ 风险条目", out("fwm-out").includes("✓ SSH 已限定来源范围"));
resetFwm();

setVal("fwm-ssh", "none"); change("fwm-ssh");
check("F4 SSH 不开放报严重（锁死风险）", out("fwm-out").includes("[严重] SSH 规划为不开放"));
resetFwm();

setVal("fwm-redis", "lan"); setVal("fwm-lan", "10.0.0.0/8"); change("fwm-redis"); input("fwm-lan");
check("F5a Redis 内网生成 from 网段规则", out("fwm-out").includes("sudo ufw allow from 10.0.0.0/8 to any port 6379 proto tcp"));
check("F5b /8 大网段给出范围过大警告", out("fwm-out").includes("范围过大"));
resetFwm();

setVal("fwm-policy", "allow"); change("fwm-policy");
check("F6a 默认策略 allow 给警告", out("fwm-out").includes("[警告] 默认入站策略是 allow"));
check("F6b allow 下仅本机服务补显式 deny", out("fwm-out").includes("sudo ufw deny in to any port 3306 proto tcp"));
resetFwm();

setVal("fwm-custom", "public"); setVal("fwm-cname", "api"); setVal("fwm-cport", "9000"); change("fwm-custom"); input("fwm-cport");
check("F7a 自定义服务进矩阵与命令", out("fwm-out").includes("api") && out("fwm-out").includes("sudo ufw allow 9000/tcp"));
check("F7b 自定义公网给提示风险", out("fwm-out").includes("自定义服务 api（9000/tcp）公网开放"));
resetFwm();

setVal("fwm-custom", "public"); setVal("fwm-cport", "99999"); change("fwm-custom"); input("fwm-cport");
check("F8a 自定义端口超界 err", errVisible("fwm-err") && errText("fwm-err").includes("自定义端口必须在 1–65535"), errText("fwm-err"));
resetFwm();
setVal("fwm-mysql", "lan"); setVal("fwm-lan", "999.1.1.0/24"); change("fwm-mysql"); input("fwm-lan");
check("F8b 非法内网网段 err", errVisible("fwm-err") && errText("fwm-err").includes("内网网段格式不正确"), errText("fwm-err"));
resetFwm();
check("F8c 复位后 err 消失且输出恢复", !errVisible("fwm-err") && out("fwm-out").includes("规划矩阵摘要"));

console.log("==== batch-d fragment tests: " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
