// F-1 复核：在当前完整 docs/tools/index.md 上截取子网计算器区域组装 jsdom 页面，
// 复现审计疑似问题「切换地址族后残留旧错误文案」。
// 判定标准：任一步骤结束后，若 err 区可见（display:block），其文案必须与当前地址族相符
// （v4 时不得出现 IPv6 专属文案，v6 时不得出现 v4 专属文案）；若输入在新地址族下合法，err 必须隐藏。
// 运行：node test-f1.mjs（在 guide-tools-dev/batch-d 下）
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../../docs/tools/index.md"), "utf8");

function sliceBetween(s, a, b) {
  const st = s.indexOf(a);
  if (st < 0) throw new Error("anchor not found: " + a);
  const e = b ? s.indexOf(b, st) : s.length;
  if (b && e < 0) throw new Error("end anchor not found: " + b);
  return s.slice(st, e);
}
const section = sliceBetween(src, "## 子网 / CIDR 计算器", "## Cron 表达式生成器");
const helpers = sliceBetween(src, "function showCopyToast()", "function initGuideTools()");
const js = [
  sliceBetween(src, "function parseCidr4(", "function npGenerate("),
  sliceBetween(src, "function subParseIp(", "var CRON_DEFS"),
  sliceBetween(src, "function initSubnetGen(", "function initCronGen("),
].join("\n");
const html = "<!DOCTYPE html><html><body>" + section +
  "<script>" + helpers + "</" + "script>" +
  "<script>" + js + "</" + "script>" +
  "<script>initSubnetGen();</" + "script>" +
  "</body></html>";
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
const { window } = dom;
const doc = window.document;
Object.defineProperty(window.navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true });

let pass = 0, fail = 0;
const trace = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " | " + extra : "")); }
}
function set(id, v, ev) {
  const el = doc.getElementById(id);
  el.value = v;
  el.dispatchEvent(new window.Event(ev || "input", { bubbles: true }));
}
function errVis() { return doc.getElementById("sub-err").style.display === "block"; }
function errTxt() { return doc.getElementById("sub-err").textContent; }
function fam() { return doc.getElementById("sub-family").value; }
function snapshot(label) {
  trace.push(label + " -> family=" + fam() + " errVisible=" + errVis() + " errText=[" + errTxt() + "]");
}
function invariant(label) {
  // 核心不变量：可见的错误文案必须属于当前地址族
  if (!errVis()) { check(label + "：err 已隐藏（无残留可见文案）", true); return; }
  if (fam() === "v4") {
    check(label + "：v4 下可见 err 不含 IPv6 专属文案", !/IPv6/.test(errTxt()), errTxt());
  } else {
    check(label + "：v6 下可见 err 不含 v4 专属文案", !/四段|CIDR 前缀必须/.test(errTxt()), errTxt());
  }
}

/* 场景 S1：v4 非法 IP 触发 err → 切到 v6（该输入在 v6 下同样非法） */
set("sub-ip", "999.1.1.1");
snapshot("S1-1 v4 非法 IP");
check("S1-1 v4 err 可见且为 v4 文案", errVis() && errTxt().includes("IP 地址格式不正确"), errTxt());
set("sub-family", "v6", "change");
snapshot("S1-2 切到 v6");
invariant("S1-2");
check("S1-2 err 已换成 IPv6 文案", errTxt().includes("IPv6 地址格式不正确"), errTxt());

/* 场景 S2：v4 err 状态下把 IP 改成合法 IPv6 → 切 v6 应清 err 出结果 */
set("sub-family", "v4", "change");
set("sub-ip", "2001:db8::10");
snapshot("S2-1 v4 下填 IPv6 地址");
check("S2-1 v4 err 可见（IPv6 地址在 v4 下非法）", errVis(), errTxt());
set("sub-family", "v6", "change");
snapshot("S2-2 切到 v6");
check("S2-2 err 隐藏且输出 IPv6 结果", !errVis() && doc.getElementById("sub-out").textContent.includes("网络地址"), doc.getElementById("sub-out").textContent.slice(0, 80));

/* 场景 S3：v6 前缀非法触发 err → 把 IP 改成合法 IPv4 → 切回 v4 应清 err */
set("sub-prefix6", "999");
snapshot("S3-1 v6 前缀 999");
check("S3-1 v6 err 可见且为前缀文案", errVis() && errTxt().includes("IPv6 前缀"), errTxt());
set("sub-ip", "192.0.2.10");
snapshot("S3-2 v6 下改 IP 为 IPv4（仍 v6，前缀错还在）");
invariant("S3-2");
set("sub-family", "v4", "change");
snapshot("S3-3 切回 v4");
check("S3-3 err 隐藏且输出 IPv4 结果", !errVis() && doc.getElementById("sub-out").textContent.includes("广播地址"), doc.getElementById("sub-out").textContent.slice(0, 80));

/* 场景 S4：v6 err → 切 v4 且输入在 v4 下也非法 → 文案应换成 v4 的 */
set("sub-family", "v6", "change");
set("sub-prefix6", "64");
set("sub-ip", "2001:db8:::xyz");
snapshot("S4-1 v6 非法地址");
check("S4-1 v6 err 可见", errVis() && errTxt().includes("IPv6 地址格式不正确"), errTxt());
set("sub-family", "v4", "change");
snapshot("S4-2 切到 v4");
invariant("S4-2");
check("S4-2 err 已换成 v4 文案", errTxt().includes("IP 地址格式不正确"), errTxt());

/* 场景 S5：v4 掩码模式非法掩码 err → 切 v6（IP 合法 v6）→ 再切回 v4/cidr */
set("sub-mode", "mask", "change");
set("sub-ip", "192.0.2.10");
set("sub-mask", "255.255.0.255");
snapshot("S5-1 v4 掩码不连续");
check("S5-1 掩码 err 可见", errVis() && errTxt().includes("子网掩码不连续"), errTxt());
set("sub-ip", "2001:db8::5");
set("sub-family", "v6", "change");
snapshot("S5-2 切 v6");
check("S5-2 err 隐藏（掩码错不带入 v6）", !errVis());
set("sub-family", "v4", "change");
set("sub-mode", "cidr", "change");
snapshot("S5-3 切回 v4/cidr（IP 仍是 IPv6 文本）");
invariant("S5-3");

console.log("\n---- 复现轨迹 ----");
for (const t of trace) console.log(t);
console.log("==== F-1 tests: " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
