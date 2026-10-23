/* 批次 B 测试：把 sections.md 的 HTML 与 tools.js 组装成最小页面，
   用 jsdom 驱动 DOM（设值 → dispatch input/change/click → 断言 out/err）。
   运行：node test-b.mjs（jsdom 装在 ~/workspace/guide-tools-dev）。 */
import { JSDOM } from "jsdom";
import fs from "node:fs";

var sections = fs.readFileSync(new URL("./sections.md", import.meta.url), "utf8");
var toolsJs = fs.readFileSync(new URL("./tools.js", import.meta.url), "utf8");
var indexMd = fs.readFileSync(new URL("../../../../docs/tools/index.md", import.meta.url), "utf8");

var results = [];
function t(name, cond, detail) {
  results.push({ name: name, pass: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (cond ? "" : " | " + (detail || "")));
}

/* ---------- ID 冲突检查 ---------- */
var newIds = (sections.match(/id="[^"]+"/g) || []).map(function (s) { return s.slice(4, -1); });
var pageIdCount = {};
(indexMd.match(/id="[^"]+"/g) || []).forEach(function (s) { var id = s.slice(4, -1); pageIdCount[id] = (pageIdCount[id] || 0) + 1; });
var dupInNew = newIds.filter(function (v, i) { return newIds.indexOf(v) !== i; });
// 入仓版断言（开发期原为「与现有 234 个 ID 无冲突」——那是集成前检查；集成后改为单次集成校验）：
// 本批每个 ID 在当前完整页面中恰好出现一次，证明已单次集成且页面无重复 ID 引入。
var notExactlyOnce = newIds.filter(function (v) { return pageIdCount[v] !== 1; });
t("ID:新章节内部无重名", dupInNew.length === 0, dupInNew.join(","));
t("ID:本批 ID 在当前页面均恰好出现一次（单次集成）", notExactlyOnce.length === 0, notExactlyOnce.join(","));

/* ---------- 组装页面 ---------- */
var dom = new JSDOM("<!DOCTYPE html><html><body>" + sections + "</body></html>", {
  runScripts: "dangerously",
  url: "https://localhost/"
});
var window = dom.window;
var document = window.document;
window.navigator.clipboard = { writeText: function () { return Promise.resolve(); } };
var script = document.createElement("script");
script.textContent =
  "function showCopyToast() {}\n" +
  "function bindCopy(b, o, m) { var btn = document.getElementById(b); if (!btn) { return; } btn.addEventListener('click', function () { var txt = document.getElementById(o).textContent; navigator.clipboard.writeText(txt).then(function () { document.getElementById(m).textContent = '已复制'; }); }); }\n" +
  toolsJs +
  "\ninitDiag(); initCsrev(); initDisk(); initBk(); initRe(); initEnv();\n";
document.body.appendChild(script);

function $(id) { return document.getElementById(id); }
function out(id) { return $(id).textContent; }
function errShown(id) { return $(id).style.display === "block"; }
function setVal(id, v) {
  var el = $(id);
  el.value = v;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
}
function click(id) { $(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
function stepSelects() { return document.querySelectorAll("#diag-steps select"); }
function setStep(idx, v) {
  var sel = stepSelects()[idx];
  sel.value = v;
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
}
function fmtDate(daysFromNow) {
  var d = new Date(Date.now() + daysFromNow * 86400000);
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

/* ---------- N-10 决策树数据完整性（遍历 DIAG_TREE） ---------- */
var TREE = window.DIAG_TREE;
["net", "diskf", "memcpu", "svc", "perm"].forEach(function (root) {
  var leaves = 0, maxSel = 0, missing = [];
  (function walk(id, sel) {
    var node = TREE[id];
    if (!node) { missing.push(id); return; }
    if (node.leaf) {
      leaves++;
      if (sel > maxSel) { maxSel = sel; }
      if (!node.causes || node.causes.length < 2) { missing.push(id + ":causes"); }
      if (!node.checks || node.checks.length < 3) { missing.push(id + ":checks"); }
      if (!node.fixes || !node.fixes.length) { missing.push(id + ":fixes"); }
      if (!node.danger) { missing.push(id + ":danger"); }
      return;
    }
    node.options.forEach(function (op) { walk(op.n, sel + 1); });
  })(root, 1);
  t("diag 数据 " + root + ":终点≥4 且字段齐全", leaves >= 4 && missing.length === 0, "leaves=" + leaves + " missing=" + missing.join(","));
  t("diag 数据 " + root + ":至少 3 级选择", maxSel >= 3, "maxSel=" + maxSel);
});

/* ---------- N-10 决策树交互 ---------- */
t("diag 初始:显示提示且声明不执行命令", out("diag-out").indexOf("不会执行任何命令") >= 0, out("diag-out").slice(0, 60));
setVal("diag-cat", "net");
t("diag 选大类:出现第 2 步下拉", stepSelects().length === 1, "selects=" + stepSelects().length);
setStep(0, "netQ2b");
setStep(1, "netQ3b");
setStep(2, "netConflict");
var dOut = out("diag-out");
t("diag 正常路径:走到地址冲突结论", dOut.indexOf("IP 地址冲突或网关侧拦截") >= 0, dOut.slice(0, 120));
t("diag 正常路径:含路径摘要", dOut.indexOf("已走路径：网络不通") >= 0, "");
t("diag 正常路径:含可复制检查命令", dOut.indexOf("$ arping") >= 0 || dOut.indexOf("$ ip") >= 0, "");
t("diag 正常路径:含危险警告", dOut.indexOf("⚠ 危险操作警告") >= 0, "");
setVal("diag-cat", "diskf");
setStep(0, "dkQ2c");
setStep(1, "dkInode");
t("diag 第二路径:inode 结论", out("diag-out").indexOf("inode 耗尽") >= 0, out("diag-out").slice(0, 80));
click("diag-clear");
t("diag 清空:回到初始提示", out("diag-out").indexOf("选择症状大类开始") >= 0 && stepSelects().length === 0, "");

/* ---------- N-12 Compose 审查 ---------- */
t("csrev 空:显示粘贴提示", out("csrev-out").indexOf("点「开始审查」") >= 0, out("csrev-out").slice(0, 40));
var risky = [
  'version: "3.8"',
  "services:",
  "  web:",
  "    image: nginx:latest",
  "    privileged: true",
  "    network_mode: host",
  "    ports:",
  '      - "0.0.0.0:8080:80"',
  "    volumes:",
  "      - /:/hostroot",
  "      - /etc/nginx:/etc/nginx",
  "    environment:",
  "      - APP_SECRET=topsecretvalue123",
  "    cap_add:",
  "      - SYS_ADMIN",
  "  db:",
  "    image: mysql",
  "    ports:",
  '      - "3306:3306"',
  "    volumes:",
  "      - /var/run/docker.sock:/var/run/docker.sock"
].join("\n");
setVal("csrev-input", risky);
click("csrev-run");
var cOut = out("csrev-out");
t("csrev 风险样例:报特权模式", cOut.indexOf("privileged") >= 0, "");
t("csrev 风险样例:报 host 网络", cOut.indexOf("network_mode: host") >= 0, "");
t("csrev 风险样例:报挂载根目录", cOut.indexOf("根目录 / 挂进容器") >= 0, "");
t("csrev 风险样例:报 docker.sock", cOut.indexOf("docker.sock") >= 0, "");
t("csrev 风险样例:报 /etc 挂载", cOut.indexOf("/etc") >= 0, "");
t("csrev 风险样例:报数据库端口 3306 全接口", cOut.indexOf("数据库端口 3306") >= 0, "");
t("csrev 风险样例:报 latest 与无 tag", cOut.indexOf(":latest") >= 0 && cOut.indexOf("未写 tag") >= 0, "");
t("csrev 风险样例:报明文密钥键名", cOut.indexOf("APP_SECRET") >= 0, "");
t("csrev 风险样例:报 cap_add SYS_ADMIN", cOut.indexOf("SYS_ADMIN") >= 0, "");
t("csrev 风险样例:报 user 缺失与无资源限制", cOut.indexOf("未指定 user") >= 0 && cOut.indexOf("未设置任何资源限制") >= 0, "");
t("csrev 风险样例:严重项≥5", /严重 [5-9]\d* 项/.test(cOut) || /严重 \d{2,} 项/.test(cOut), cOut.split("\n")[2]);
t("csrev 风险样例:不回显密钥值", cOut.indexOf("topsecretvalue123") < 0, "");
t("csrev 风险样例:每条带行号", cOut.indexOf("第 5 行") >= 0 && cOut.indexOf("第 21 行") >= 0, "");
var safe = [
  "services:",
  "  app:",
  "    image: myapp:1.4.2",
  '    user: "1000:1000"',
  "    mem_limit: 512m",
  '    cpus: "1.5"',
  "    ports:",
  '      - "127.0.0.1:3306:3306"',
  "    environment:",
  "      - DB_PASSWORD=${DB_PASSWORD}",
  "    volumes:",
  "      - appdata:/data",
  "volumes:",
  "  appdata:"
].join("\n");
setVal("csrev-input", safe);
click("csrev-run");
var sOut = out("csrev-out");
t("csrev 安全样例:零严重项", sOut.indexOf("严重 0 项") >= 0, sOut.split("\n").slice(0, 4).join(" | "));
t("csrev 安全样例:显示未发现风险项", sOut.indexOf("未发现风险项") >= 0, sOut.slice(0, 120));
setVal("csrev-input", "hello: world\nfoo: bar");
click("csrev-run");
t("csrev 非法:不是 compose 时明确提示", out("csrev-out").indexOf("未找到顶层 services") >= 0, out("csrev-out").slice(0, 120));
var anchored = [
  "x-common: &common",
  "  image: redis:7.2",
  "services:",
  "  cache:",
  "    <<: *common",
  '    user: "1000"',
  "    mem_limit: 256m",
  "    cpus: \"0.5\""
].join("\n");
setVal("csrev-input", anchored);
click("csrev-run");
t("csrev 边界:锚点/合并键给出复杂语法提示", out("csrev-out").indexOf("复杂语法") >= 0, out("csrev-out").slice(0, 150));
click("csrev-clear");
t("csrev 清空:回到粘贴提示", out("csrev-out").indexOf("点「开始审查」") >= 0, "");

/* ---------- N-07 磁盘规划 ---------- */
var kOut = out("disk-out");
t("disk 默认:耗尽天数 70 天", kOut.indexOf("约 70 天后") >= 0, kOut.slice(0, 200));
t("disk 默认:耗尽日期正确", kOut.indexOf(fmtDate(70)) >= 0, "expect " + fmtDate(70));
t("disk 默认:到警戒线 45 天", kOut.indexOf("约 45 天后") >= 0, "");
t("disk 默认:需扩容 220 GB", kOut.indexOf("需要扩容约 220 GB") >= 0, "");
t("disk 默认:输出带公式", kOut.indexOf("耗尽天数 = 剩余 ÷ 日增长量") >= 0, "");
setVal("disk-growth", "0");
t("disk 边界:日增 0 单独说明不算日期", out("disk-out").indexOf("不会因自然增长耗尽") >= 0, out("disk-out").slice(0, 120));
setVal("disk-growth", "2");
setVal("disk-usedpct", "95");
t("disk 边界:已超警戒线 ⚠", out("disk-out").indexOf("已超过警戒线") >= 0, out("disk-out").slice(0, 150));
setVal("disk-usedpct", "72");
setVal("disk-total", "abc");
t("disk 非法:非数字走 err(number 输入框会把 abc 清为空,按缺失报错)", errShown("disk-err") && out("disk-err").indexOf("输入有误") >= 0, out("disk-err"));
setVal("disk-total", "500");
setVal("disk-usedpct", "");
t("disk 空:已用两项都空报错", errShown("disk-err") && out("disk-err").indexOf("至少填一个") >= 0, out("disk-err"));
setVal("disk-usedgb", "600");
t("disk 非法:已用大于总容量报错", errShown("disk-err") && out("disk-err").indexOf("不能大于总容量") >= 0, out("disk-err"));
setVal("disk-usedgb", "");
setVal("disk-usedpct", "100");
t("disk 边界:已用 100% 报已满", out("disk-out").indexOf("已经满了") >= 0, out("disk-out").slice(0, 100));

/* ---------- N-13 备份 RPO/RTO ---------- */
var bOut = out("bk-out");
t("bk 默认:全量 200 / 增量 10 / 总存储 500", bOut.indexOf("一次全量大小：200 GB") >= 0 && bOut.indexOf("每日增量估算：10 GB") >= 0 && bOut.indexOf("保留期总存储估算：500 GB") >= 0, bOut.slice(0, 300));
t("bk 默认:RPO=间隔 24 小时且说明最坏丢失", bOut.indexOf("RPO = 备份间隔 = 24 小时") >= 0 && bOut.indexOf("会丢失最近 24 小时") >= 0, "");
t("bk 默认:全量耗时 4.4 小时", bOut.indexOf("单次全量备份耗时：约 4.4 小时") >= 0, "");
t("bk 默认:恢复耗时 2.2 小时(RTO)", bOut.indexOf("整库恢复耗时（RTO 估算）：约 2.2 小时") >= 0, "");
t("bk 默认:解释 RPO/RTO 区别且输出公式", bOut.indexOf("RPO 与 RTO 的区别") >= 0 && bOut.indexOf("× 8000 ÷") >= 0, "");
setVal("bk-change", "0");
t("bk 边界:变化率 0 时增量为 0", out("bk-out").indexOf("每日增量估算：0 GB") >= 0, out("bk-out").slice(0, 150));
setVal("bk-change", "5");
setVal("bk-total", "5000");
setVal("bk-up", "10");
t("bk 边界:全量耗时超过间隔 ⚠", out("bk-out").indexOf("已超过备份间隔") >= 0, "");
setVal("bk-total", "");
t("bk 空:数据总量为空报错", errShown("bk-err"), out("bk-err"));
setVal("bk-total", "-5");
t("bk 非法:负数报错", errShown("bk-err") && out("bk-err").indexOf("数据总量必须大于 0") >= 0, out("bk-err"));
setVal("bk-total", "200");
setVal("bk-up", "100");
setVal("bk-change", "150");
t("bk 非法:变化率超过 100 报错", errShown("bk-err") && out("bk-err").indexOf("每日变化率应在 0 到 100 之间") >= 0, out("bk-err"));

/* ---------- N-24 正则测试器 ---------- */
var rOut = out("re-out");
t("re 默认:匹配两个 IP 并带下标", rOut.indexOf("匹配：是，共 2 处") >= 0 && rOut.indexOf("192.168.1.10") >= 0, rOut.slice(0, 150));
setVal("re-pattern", "(?<yr>\\d{4})-(?<mo>\\d{2})");
setVal("re-text", "发布日期 2026-10-23，其他 2025-01-02");
var r2 = out("re-out");
t("re 正常:捕获组展开", r2.indexOf("捕获组 1：\"2026\"") >= 0, r2.slice(0, 250));
t("re 正常:命名组展开", r2.indexOf("命名组 yr：\"2026\"") >= 0 && r2.indexOf("命名组 mo：\"10\"") >= 0, "");
setVal("re-pattern", "([");
t("re 非法:语法错误明确进 err", errShown("re-err") && out("re-err").indexOf("正则语法错误") >= 0, out("re-err"));
setVal("re-pattern", "");
t("re 空:模式为空显示提示而非错误", !errShown("re-err") && out("re-out").indexOf("输入正则表达式") >= 0, out("re-out").slice(0, 60));
setVal("re-pattern", "zzz");
setVal("re-text", "hello world");
t("re 边界:无匹配明确报否", out("re-out").indexOf("匹配：否") >= 0, out("re-out"));
setVal("re-pattern", "a");
setVal("re-text", new Array(502).join("a"));
t("re 边界:匹配数上限 200 截断注明", out("re-out").indexOf("已达上限 200") >= 0, out("re-out").split("\n")[2]);
setVal("re-pattern", "(a+)+$");
setVal("re-text", "aaaaaaaaaaaaaaaaaaaaX"); /* 20 个 a:回溯量可控,只验风险提示文案 */
t("re 边界:嵌套量词风险提示", out("re-out").indexOf("灾难性回溯") >= 0 || out("re-out").indexOf("嵌套量词") >= 0, out("re-out").slice(-200));
setVal("re-pattern", "x*");
setVal("re-text", "abc");
t("re 边界:零宽匹配不死循环且有结果", out("re-out").indexOf("匹配：是") >= 0, out("re-out").split("\n")[2]);

/* ---------- N-28 .env 检查 ---------- */
t("env 空:显示粘贴提示", out("env-out").indexOf("点「开始检查」") >= 0, out("env-out").slice(0, 40));
var envBad = [
  "# 注释行",
  "APP_NAME=plain-visible-value-123",
  "API_KEY=S3cr3tValue!42xyz",
  "BAD LINE WITHOUT EQUALS",
  "1BAD=oops",
  "DUP=first",
  "DUP=second",
  "EMPTY=",
  "GREETING=hello world",
  "PASS_HASH=abc # trailing",
  'QUOTED="unterminated',
  "export TOKEN_X=tok-value-999",
  "NORMAL=ok"
].join("\n");
setVal("env-input", envBad);
click("env-run");
var eOut = out("env-out");
t("env 问题样例:报无等号行", eOut.indexOf("没有等号") >= 0, "");
t("env 问题样例:报键名非法", eOut.indexOf("1BAD") >= 0 && eOut.indexOf("不合法") >= 0, "");
t("env 问题样例:报重复键及首次行号", eOut.indexOf("重复定义") >= 0 && eOut.indexOf("首次在第 6 行") >= 0, "");
t("env 问题样例:报空值", eOut.indexOf("值为空") >= 0, "");
t("env 问题样例:报未加引号含空格", eOut.indexOf("未加引号却含空格") >= 0, "");
t("env 问题样例:报 # 截断风险", eOut.indexOf("当注释截断") >= 0, "");
t("env 问题样例:报引号未闭合", eOut.indexOf("引号未闭合") >= 0, "");
t("env 问题样例:报 export 不一致", eOut.indexOf("export 前缀不一致") >= 0, "");
t("env 问题样例:敏感键只报键名", eOut.indexOf("API_KEY") >= 0 && eOut.indexOf("疑似敏感") >= 0, "");
t("env 隐私断言:敏感值不出现在输出", eOut.indexOf("S3cr3tValue!42xyz") < 0 && eOut.indexOf("tok-value-999") < 0, "");
t("env 隐私断言:任何值都不回显", eOut.indexOf("plain-visible-value-123") < 0 && eOut.indexOf("hello world") < 0, "");
var envClean = ["APP_ENV=production", "APP_DEBUG=false", "APP_HOME=/srv/app"].join("\n");
setVal("env-input", envClean);
click("env-run");
t("env 干净样例:无问题", out("env-out").indexOf("未发现格式问题") >= 0, out("env-out").slice(0, 150));
click("env-clear");
t("env 清空:回到提示", out("env-out").indexOf("点「开始检查」") >= 0, "");

/* ---------- 复制按钮冒烟 ---------- */
click("disk-copy");
await new Promise(function (r) { setTimeout(r, 10); });
t("复制按钮:点击后 msg 显示已复制", $("disk-msg").textContent === "已复制", $("disk-msg").textContent);

var failed = results.filter(function (r) { return !r.pass; });
console.log("\n===== " + results.length + " 个用例，通过 " + (results.length - failed.length) + "，失败 " + failed.length + " =====");
if (failed.length) { process.exitCode = 1; }
