// 批次 A 测试：把 sections.md 的 HTML 与 tools.js 组装成最小页面，用 jsdom 驱动 DOM。
// 复制助手 bindCopy/showCopyToast 从站点 index.md 原样摘录，模拟真实集成环境。
// 运行：node test-a.mjs（在 guide-tools-dev 下，jsdom 已装在 ../node_modules）
import { JSDOM } from "jsdom";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sections = readFileSync(join(here, "sections.md"), "utf8");
const toolsJs = readFileSync(join(here, "tools.js"), "utf8");
const indexMd = readFileSync(join(here, "../../../../docs/tools/index.md"), "utf8");

// 从 index.md 摘录既有全局助手（与线上页面完全一致的代码）
const helperStart = indexMd.indexOf("function showCopyToast()");
const helperEnd = indexMd.indexOf("function initGuideTools()");
if (helperStart < 0 || helperEnd < 0) throw new Error("无法从 index.md 摘录 bindCopy 助手");
const helpers = indexMd.slice(helperStart, helperEnd);

const html = "<!DOCTYPE html><html><body>" + sections +
  "<script>" + helpers + "</" + "script>" +
  "<script>" + toolsJs + "</" + "script>" +
  "<script>initFmtGen();initDiffGen();initCiGen();initSshdGen();initTmrGen();</" + "script>" +
  "</body></html>";

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
const { window } = dom;
const doc = window.document;
// jsdom 无剪贴板：桩一个，顺带验证复制按钮确实走 bindCopy 路径
let copiedText = null;
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: (t) => { copiedText = t; return Promise.resolve(); } },
  configurable: true,
});

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; failures.push(name + (extra ? " | " + extra : "")); console.log("FAIL  " + name + (extra ? " | " + extra : "")); }
}
function setVal(id, v) { doc.getElementById(id).value = v; }
function setChk(id, v) { doc.getElementById(id).checked = v; }
function fire(id, type) {
  doc.getElementById(id).dispatchEvent(new window.Event(type, { bubbles: true }));
}
function input(id) { fire(id, "input"); }
function click(id) { doc.getElementById(id).click(); }
function out(id) { return doc.getElementById(id).textContent; }
function errVisible(id) { return doc.getElementById(id).style.display === "block"; }
function errText(id) { return doc.getElementById(id).textContent; }

// ============ fmt 格式校验与转换 ============
function fmtRun() { click("fmt-run"); }

// F1 正常：默认 JSON 样例 -> YAML
fmtRun();
check("F1 JSON->YAML 正常", !errVisible("fmt-err") && out("fmt-out").includes("host: 0.0.0.0") && out("fmt-out").includes("port: 8080") && out("fmt-out").includes("- web") && doc.getElementById("fmt-msg").textContent.includes("校验通过"), out("fmt-out").slice(0, 200));

// F2 正常：YAML 配置 -> JSON（再用 JSON.parse 验证产物）
setVal("fmt-text", "server:\n  host: 127.0.0.1\n  port: 9000\nfeatures:\n  - auth\n  - logs\ndebug: true\nratio: 1.5\nnote: 'it''s ok'\nempty_val:\n");
setVal("fmt-src", "yaml"); setVal("fmt-dst", "json");
fmtRun();
let f2ok = false, f2info = "";
try {
  const v = JSON.parse(out("fmt-out"));
  f2ok = v.server.port === 9000 && v.features.length === 2 && v.debug === true && v.ratio === 1.5 && v.note === "it's ok" && v.empty_val === null;
} catch (e) { f2info = String(e); }
check("F2 YAML->JSON 正常（产物可 JSON.parse 且值正确）", f2ok && !errVisible("fmt-err"), f2info || out("fmt-out").slice(0, 200));

// F3 正常：TOML -> YAML，含节、数组、日期时间解包
setVal("fmt-text", "title = \"demo\"\n[server]\nhost = \"10.0.0.1\"\nports = [80, 443]\nstart = 2024-01-02\nowner = { name = \"tom\", active = true }\n");
setVal("fmt-src", "toml"); setVal("fmt-dst", "yaml");
fmtRun();
check("F3 TOML->YAML 正常", !errVisible("fmt-err") && out("fmt-out").includes("title: demo") && out("fmt-out").includes("host: 10.0.0.1") && out("fmt-out").includes("- 443") && out("fmt-out").includes("start: '2024-01-02'") && out("fmt-out").includes("active: true"), out("fmt-out").slice(0, 300));

// F4 正常：JSON -> TOML（含数组的表用 [[..]]，普通对象用 [..]）
setVal("fmt-text", "{\"name\":\"app\",\"tags\":[\"a\",\"b\"],\"db\":{\"host\":\"h1\",\"port\":5432},\"workers\":[{\"id\":1},{\"id\":2}]}");
setVal("fmt-src", "json"); setVal("fmt-dst", "toml");
fmtRun();
check("F4 JSON->TOML 正常", !errVisible("fmt-err") && out("fmt-out").includes("name = \"app\"") && out("fmt-out").includes("[db]") && out("fmt-out").includes("[[workers]]") && out("fmt-out").includes("tags = [\"a\", \"b\"]"), out("fmt-out").slice(0, 300));

// F5 空输入
setVal("fmt-text", "   \n  "); setVal("fmt-src", "auto"); setVal("fmt-dst", "yaml");
fmtRun();
check("F5 空输入报错", errVisible("fmt-err") && errText("fmt-err").includes("输入为空") && out("fmt-out") === "", errText("fmt-err"));

// F6 非法 JSON（指定 json）
setVal("fmt-text", "{\n  \"a\": 1,\n  bad\n}"); setVal("fmt-src", "json"); setVal("fmt-dst", "yaml");
fmtRun();
check("F6 非法 JSON 报错并给出行号", errVisible("fmt-err") && errText("fmt-err").includes("JSON 语法错误") && errText("fmt-err").includes("第"), errText("fmt-err"));

// F7 非法 YAML：使用锚点
setVal("fmt-text", "base: &b\n  x: 1\ncopy:\n  <<: *b\n"); setVal("fmt-src", "yaml"); setVal("fmt-dst", "json");
fmtRun();
check("F7 YAML 锚点报错（子集边界）", errVisible("fmt-err") && errText("fmt-err").includes("锚点"), errText("fmt-err"));

// F8 非法 YAML：Tab 缩进
setVal("fmt-text", "a:\n\tb: 1\n"); setVal("fmt-src", "yaml");
fmtRun();
check("F8 YAML Tab 缩进报错", errVisible("fmt-err") && errText("fmt-err").includes("Tab"), errText("fmt-err"));

// F9 非法 TOML：重复键
setVal("fmt-text", "a = 1\na = 2\n"); setVal("fmt-src", "toml"); setVal("fmt-dst", "json");
fmtRun();
check("F9 TOML 重复键报错", errVisible("fmt-err") && errText("fmt-err").includes("重复"), errText("fmt-err"));

// F10 边界：JSON 含 null 转 TOML 应明确报错
setVal("fmt-text", "{\"a\": null}"); setVal("fmt-src", "json"); setVal("fmt-dst", "toml");
fmtRun();
check("F10 null 转 TOML 报错（点名键）", errVisible("fmt-err") && errText("fmt-err").includes("null") && errText("fmt-err").includes("a"), errText("fmt-err"));

// F11 边界：像数字的字符串转 YAML 必须加引号防类型漂移
setVal("fmt-text", "{\"code\": \"0123\", \"ver\": \"1.20\"}"); setVal("fmt-src", "json"); setVal("fmt-dst", "yaml");
fmtRun();
check("F11 数字样字符串 YAML 加引号", !errVisible("fmt-err") && out("fmt-out").includes("code: '0123'") && out("fmt-out").includes("ver: '1.20'"), out("fmt-out"));

// F12 边界：自动识别 TOML（[节] + 键=值）
setVal("fmt-text", "[app]\nname = \"x\"\n"); setVal("fmt-src", "auto"); setVal("fmt-dst", "json");
fmtRun();
let f12ok = false;
try { f12ok = JSON.parse(out("fmt-out")).app.name === "x"; } catch (e) { /* ignore */ }
check("F12 自动识别 TOML", f12ok && doc.getElementById("fmt-msg").textContent.includes("自动识别"), out("fmt-out"));

// F13 复制按钮
copiedText = null;
click("fmt-copy");
await new Promise((r) => setTimeout(r, 30));
check("F13 复制按钮写入剪贴板且提示已复制", copiedText === out("fmt-out") && doc.getElementById("fmt-msg").textContent === "已复制", String(copiedText).slice(0, 80));

// F14 清空按钮
click("fmt-clear");
check("F14 清空按钮", doc.getElementById("fmt-text").value === "" && out("fmt-out") === "" && doc.getElementById("fmt-msg").textContent === "已清空", "");

// ============ diff 配置差异比较器 ============
function diffRun() { click("diff-run"); }

// D1 正常：默认样例
diffRun();
const d1 = out("diff-out");
check("D1 默认样例统计与增删行", !errVisible("diff-err") && d1.includes("新增 5 行") && d1.includes("删除 4 行") && d1.includes("未变 0 行") && d1.includes("- Port 22") && d1.includes("+ ClientAliveInterval 300"), d1.split("\n")[0]);

// D2 正常：部分相同行
setVal("diff-a", "a=1\nb=2\nc=3\n"); setVal("diff-b", "a=1\nb=20\nc=3\nd=4\n");
diffRun();
const d2 = out("diff-out");
check("D2 混合增删未变", d2.includes("新增 2 行") && d2.includes("删除 1 行") && d2.includes("未变 2 行") && d2.includes("  a=1") && d2.includes("- b=2") && d2.includes("+ b=20"), d2.split("\n")[0]);

// D3 空：两侧都空
setVal("diff-a", ""); setVal("diff-b", "");
diffRun();
check("D3 两侧皆空报错", errVisible("diff-err") && errText("diff-err").includes("都是空"), errText("diff-err"));

// D4 边界：一侧为空 = 全部新增
setVal("diff-a", ""); setVal("diff-b", "x=1\ny=2\n");
diffRun();
const d4 = out("diff-out");
check("D4 一侧为空全部新增", !errVisible("diff-err") && d4.includes("新增 2 行") && d4.includes("删除 0 行"), d4.split("\n")[0]);

// D5 边界：内容完全一致
setVal("diff-a", "same\nlines\n"); setVal("diff-b", "same\nlines\n");
diffRun();
const d5 = out("diff-out");
check("D5 完全一致结论行", d5.includes("新增 0 行") && d5.includes("未变 2 行") && d5.includes("两侧内容一致"), d5.split("\n")[0]);

// D6 选项：忽略行首尾空白
setVal("diff-a", "a = 1\nb=2\n"); setVal("diff-b", "  a = 1  \nb=2\n");
setChk("diff-trim", false); diffRun();
const d6a = out("diff-out");
setChk("diff-trim", true); fire("diff-trim", "change");
const d6b = out("diff-out");
check("D6 忽略空白开关生效", d6a.includes("新增 1 行") && d6b.includes("新增 0 行") && d6b.includes("未变 2 行"), d6a.split("\n")[0] + " || " + d6b.split("\n")[0]);
setChk("diff-trim", false);

// D7 选项：忽略空行
setVal("diff-a", "x\n\ny\n"); setVal("diff-b", "x\ny\n");
setChk("diff-blank", true); fire("diff-blank", "change");
const d7 = out("diff-out");
check("D7 忽略空行", d7.includes("新增 0 行") && d7.includes("未变 2 行") && d7.includes("忽略空行"), d7.split("\n")[0]);
setChk("diff-blank", false);

// D8 边界：900 行只改 1 行（性能与正确性）
{
  const la = [], lb = [];
  for (let i = 0; i < 900; i++) { la.push("line" + i); lb.push(i === 450 ? "CHANGED" : "line" + i); }
  setVal("diff-a", la.join("\n")); setVal("diff-b", lb.join("\n"));
  const t0 = Date.now();
  diffRun();
  const dt = Date.now() - t0;
  const d8 = out("diff-out");
  check("D8 900 行单点改动（<3s）", d8.includes("新增 1 行") && d8.includes("删除 1 行") && d8.includes("未变 899 行") && dt < 3000, "耗时 " + dt + "ms");
}

// D9 非法/边界：一侧超 5000 行报错
{
  const big = [];
  for (let i = 0; i < 5001; i++) big.push("r" + i);
  setVal("diff-a", big.join("\n")); setVal("diff-b", "x");
  diffRun();
  check("D9 超行数上限报错", errVisible("diff-err") && errText("diff-err").includes("5000"), errText("diff-err"));
}

// ============ ci cloud-init 生成器 ============
function ciOut() { return out("ci-out"); }
function pyYamlCheck(name, yamlText, expectPy) {
  const tmp = join(here, ".ci-check.yaml");
  try {
    writeFileSync(tmp, yamlText, "utf8");
    const stdout = execFileSync("python3", ["-c",
      "import sys,yaml,json;d=yaml.safe_load(open(sys.argv[1]));print(json.dumps(d,ensure_ascii=False))", tmp],
      { encoding: "utf8" });
    const d = JSON.parse(stdout);
    check(name, expectPy(d), stdout.slice(0, 160));
  } catch (e) {
    check(name, false, "python/pyyaml 不可用或解析失败：" + String(e).slice(0, 200));
  } finally {
    try { unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

// C1 正常：默认值（含公钥、软件包），pyyaml 交叉验证
input("ci-hostname");
check("C1 默认生成含关键字段", !errVisible("ci-err") && ciOut().startsWith("#cloud-config") && ciOut().includes("hostname: web-01") && ciOut().includes("lock_passwd: true") && ciOut().includes("ssh_authorized_keys:") && ciOut().includes("package_update: true"), ciOut().slice(0, 120));
pyYamlCheck("C1b 默认产物 pyyaml 可解析且值正确", ciOut(), (d) =>
  d.hostname === "web-01" && d.timezone === "Asia/Shanghai" &&
  d.users[0].name === "ubuntu" && d.users[0].lock_passwd === true &&
  d.users[0].ssh_authorized_keys.length === 1 && d.packages.join(",") === "curl,vim,htop");

// C2 正常：sudo 免密 + 哈希密码 + runcmd + write_files
setChk("ci-sudo-nopasswd", true);
setVal("ci-pwmode", "hash"); setVal("ci-pwhash", "$6$rounds=4096$saltstring$xeR8Z1fakehashvalue");
setVal("ci-runcmd", "systemctl enable --now fail2ban");
setVal("ci-file-path", "/etc/motd.d/99-hello"); setVal("ci-file-content", "hello cloud\nsecond line");
input("ci-runcmd");
const c2 = ciOut();
check("C2 免密/哈希/runcmd/文件 字段齐全且带 ⚠", !errVisible("ci-err") && c2.includes("NOPASSWD:ALL") && c2.includes("⚠ sudo 免密") && c2.includes("passwd: $6$rounds=4096$saltstring$xeR8Z1fakehashvalue") && c2.includes("lock_passwd: false") && c2.includes("- 'systemctl enable --now fail2ban'") === false && c2.includes("- systemctl enable --now fail2ban") && c2.includes("content: |"), c2.slice(0, 200));
pyYamlCheck("C2b C2 产物 pyyaml 可解析且值正确", c2, (d) =>
  d.users[0].sudo === "ALL=(ALL) NOPASSWD:ALL" && d.users[0].passwd.startsWith("$6$") &&
  d.runcmd[0] === "systemctl enable --now fail2ban" &&
  d.write_files[0].path === "/etc/motd.d/99-hello" && d.write_files[0].content === "hello cloud\nsecond line\n");

// C3 恢复默认（清空按钮=恢复默认）
click("ci-clear");
check("C3 清空按钮恢复默认", doc.getElementById("ci-hostname").value === "web-01" && doc.getElementById("ci-pwmode").value === "lock" && ciOut().includes("lock_passwd: true"), "");

// C4 非法：主机名以连字符开头/含非法字符
setVal("ci-hostname", "-bad_host!"); input("ci-hostname");
check("C4 非法主机名报错", errVisible("ci-err") && errText("ci-err").includes("主机名不合法"), errText("ci-err"));
setVal("ci-hostname", "web-01"); input("ci-hostname");

// C5 非法：用户名大写开头
setVal("ci-user", "Admin"); input("ci-user");
check("C5 非法用户名报错", errVisible("ci-err") && errText("ci-err").includes("用户名不合法"), errText("ci-err"));
setVal("ci-user", "ubuntu"); input("ci-user");

// C6 非法：哈希模式留空 / 填明文
setVal("ci-pwmode", "hash"); setVal("ci-pwhash", ""); fire("ci-pwmode", "change");
const c6a = errText("ci-err");
setVal("ci-pwhash", "mypassword123"); input("ci-pwhash");
const c6b = errText("ci-err");
check("C6 哈希缺失/明文都被拦", c6a.includes("必须填密码哈希") && c6b.includes("不要填明文"), c6a + " || " + c6b);
setVal("ci-pwmode", "lock"); setVal("ci-pwhash", ""); fire("ci-pwmode", "change");

// C7 非法：公钥行格式错误（指出行号）
setVal("ci-keys", "ssh-ed25519 AAAAC3valid key line\nthis-is-not-a-key"); input("ci-keys");
check("C7 坏公钥行报错并指行号", errVisible("ci-err") && errText("ci-err").includes("第 2 行"), errText("ci-err"));
setVal("ci-keys", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl admin@laptop"); input("ci-keys");

// C8 空/边界：可选全空仍生成最小可用配置
setVal("ci-keys", ""); setVal("ci-packages", ""); setVal("ci-runcmd", ""); input("ci-keys");
const c8 = ciOut();
check("C8 可选项全空的最小配置", !errVisible("ci-err") && c8.includes("hostname: web-01") && !c8.includes("packages:") && !c8.includes("runcmd:") && !c8.includes("ssh_authorized_keys:"), c8.slice(0, 120));
pyYamlCheck("C8b 最小配置 pyyaml 可解析", c8, (d) => d.hostname === "web-01" && d.users[0].name === "ubuntu" && !("packages" in d));

// C9 非法：只填文件内容不填路径
setVal("ci-file-content", "data"); input("ci-file-content");
check("C9 有内容无路径报错", errVisible("ci-err") && errText("ci-err").includes("没填文件路径"), errText("ci-err"));
setVal("ci-file-content", ""); input("ci-file-content");

// ============ sshd SSH 服务端配置生成器 ============
function sshdOut() { return out("sshd-out"); }

// S1 正常：默认值
input("sshd-port");
const s1 = sshdOut();
check("S1 默认生成", !errVisible("sshd-err") && s1.includes("Port 22") && s1.includes("PermitRootLogin prohibit-password") && s1.includes("PasswordAuthentication no") && s1.includes("PubkeyAuthentication yes") && s1.includes("sshd -t") && s1.includes("systemctl reload ssh") && s1.includes("风险提示"), s1.slice(0, 120));

// S2 正常：改端口 2222 带防火墙放行警告与步骤
setVal("sshd-port", "2222"); input("sshd-port");
const s2 = sshdOut();
check("S2 改端口的风险行", s2.includes("Port 2222") && s2.includes("ufw allow 2222/tcp") && s2.includes("ssh -p 2222"), "");
setVal("sshd-port", "22"); input("sshd-port");

// S3 非法：密码与密钥同时关
setChk("sshd-pubkey", false); setChk("sshd-pwauth", false); fire("sshd-pubkey", "change");
check("S3 双登录全关被拦", errVisible("sshd-err") && errText("sshd-err").includes("不能同时关闭"), errText("sshd-err"));
setChk("sshd-pubkey", true); fire("sshd-pubkey", "change");

// S4 非法：端口越界与非整数
setVal("sshd-port", "65536"); input("sshd-port");
const s4a = errText("sshd-err");
setVal("sshd-port", "abc"); input("sshd-port");
const s4b = errText("sshd-err");
check("S4 端口 65536/非数字报错", s4a.includes("1–65535") && s4b.includes("必须是整数"), s4a + " || " + s4b);
setVal("sshd-port", "22"); input("sshd-port");

// S5 边界：端口 65535 合法；AllowUsers 正常与非法各一
setVal("sshd-port", "65535"); setVal("sshd-allowusers", "ubuntu, deploy ops@10.0.0.5"); input("sshd-allowusers");
const s5 = sshdOut();
const s5ok = !errVisible("sshd-err") && s5.includes("Port 65535") && s5.includes("AllowUsers ubuntu deploy ops@10.0.0.5");
setVal("sshd-allowusers", "bad;rm -rf"); input("sshd-allowusers");
const s5b = errVisible("sshd-err") && errText("sshd-err").includes("非法字符");
check("S5 端口上限与 AllowUsers（含注入拦截）", s5ok && s5b, errText("sshd-err"));
setVal("sshd-allowusers", ""); setVal("sshd-port", "22"); input("sshd-port");

// S6 边界：LoginGraceTime 0 出 ⚠、空闲断开 0 不生成探测行
setVal("sshd-grace", "0"); setVal("sshd-alive-interval", "0"); input("sshd-grace");
const s6 = sshdOut();
check("S6 宽限 0 警告与空闲关闭", s6.includes("LoginGraceTime 0") && s6.includes("⚠ LoginGraceTime 0") && s6.includes("ClientAliveInterval 0") && !s6.includes("ClientAliveCountMax 2"), s6.slice(0, 150));
click("sshd-clear");
check("S6b 清空恢复默认", doc.getElementById("sshd-port").value === "22" && sshdOut().includes("ClientAliveInterval 300"), "");

// ============ tmr systemd Timer 生成器 ============
function tmrOut() { return out("tmr-out"); }

// T1 正常：默认每天 + Persistent
input("tmr-name");
const t1 = tmrOut();
check("T1 默认 daily 生成", !errVisible("tmr-err") && t1.includes("OnCalendar=daily") && t1.includes("Persistent=true") && t1.includes("/etc/systemd/system/backup.timer") && t1.includes("Type=oneshot") && t1.includes("systemctl enable --now backup.timer") && t1.includes("systemctl list-timers"), t1.slice(0, 200));

// T2 正常：每周 + 随机延迟
setVal("tmr-preset", "weekly"); setVal("tmr-random", "5min"); fire("tmr-preset", "change");
const t2 = tmrOut();
check("T2 weekly + RandomizedDelaySec", t2.includes("OnCalendar=weekly") && t2.includes("RandomizedDelaySec=5min"), "");
setVal("tmr-random", ""); input("tmr-random");

// T3 正常：开机后（OnBootSec，无 OnCalendar、不写 Persistent）
setVal("tmr-preset", "boot"); setVal("tmr-span", "5min"); fire("tmr-preset", "change");
const t3 = tmrOut();
check("T3 boot 预设", t3.includes("OnBootSec=5min") && !t3.includes("OnCalendar=") && !t3.includes("Persistent="), t3.slice(0, 200));

// T4 正常：间隔（OnBootSec 起跑 + OnUnitActiveSec 循环）
setVal("tmr-preset", "interval"); setVal("tmr-span", "2h"); fire("tmr-preset", "change");
const t4 = tmrOut();
check("T4 interval 预设", t4.includes("OnUnitActiveSec=2h") && t4.includes("OnBootSec=1min"), "");

// T5 正常：自定义 OnCalendar + systemd-analyze 验算命令
setVal("tmr-preset", "custom"); setVal("tmr-calendar", "Mon *-*-* 03:30:00"); fire("tmr-preset", "change");
const t5 = tmrOut();
check("T5 自定义表达式", t5.includes("OnCalendar=Mon *-*-* 03:30:00") && t5.includes("systemd-analyze calendar 'Mon *-*-* 03:30:00'"), "");

// T6 非法：自定义表达式带注入字符
setVal("tmr-calendar", "*-*-* 03:00:00; rm -rf /"); input("tmr-calendar");
check("T6 OnCalendar 注入被拦", errVisible("tmr-err") && errText("tmr-err").includes("白名单"), errText("tmr-err"));

// T7 非法：服务名非法字符 / ExecStart 相对路径
setVal("tmr-calendar", "*-*-* 03:30:00"); setVal("tmr-name", "bad name!"); input("tmr-name");
const t7a = errText("tmr-err");
setVal("tmr-name", "backup"); setVal("tmr-exec", "backup.sh"); input("tmr-exec");
const t7b = errText("tmr-err");
check("T7 服务名/相对路径报错", t7a.includes("服务名只能含") && t7b.includes("必须是绝对路径"), t7a + " || " + t7b);
setVal("tmr-exec", "/usr/local/bin/backup.sh"); input("tmr-exec");

// T8 空/边界：服务名清空报错；名字带 .timer 后缀自动剥除
setVal("tmr-name", ""); input("tmr-name");
const t8a = errVisible("tmr-err");
setVal("tmr-name", "job.timer"); input("tmr-name");
const t8b = tmrOut();
check("T8 空名报错与后缀剥除", t8a && t8b.includes("/etc/systemd/system/job.timer") && t8b.includes("Unit=job.service"), "");
click("tmr-clear");
check("T8b 清空恢复默认", doc.getElementById("tmr-name").value === "backup" && tmrOut().includes("OnCalendar=daily"), "");

console.log("\n==== 汇总：通过 " + pass + " / 失败 " + fail + " / 总计 " + (pass + fail) + " ====");
if (failures.length) { console.log("失败明细：\n" + failures.join("\n")); process.exit(1); }
