// N-19 Nginx 负载均衡回归测试（入仓版）：直接在当前 docs/tools/index.md 上组装 Nginx 工具最小页。
// NG1 用定稿时捕获的黄金输出做逐字回归（替代开发期的「补丁前/后双份页面对拍」，黄金值于
// 2026-10-23 入仓时从当前实现捕获并人工核对）；其余断言与开发期一致。
// 运行：node test-nginx.mjs（在本目录下；jsdom 由 tests/tools 的 package.json 提供）
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../../docs/tools/index.md"), "utf8");

function sliceBetween(s, a, b) {
  const x = s.indexOf(a);
  if (x < 0) throw new Error("anchor not found: " + a);
  const y = b ? s.indexOf(b, x) : s.length;
  if (b && y < 0) throw new Error("end anchor not found: " + b);
  return s.slice(x, y);
}
function buildPage(source) {
  const section = sliceBetween(source, "## Nginx 反向代理生成器", "## Docker Compose 模板生成器");
  const helpers = sliceBetween(source, "function showCopyToast()", "function initGuideTools()");
  const js = [
    sliceBetween(source, "function parseCidr4(", "function npGenerate("),
    sliceBetween(source, "function subParseIp(", "function subGenerate("),
    sliceBetween(source, "function ngxValidDomain(", "function dcGenerate("),
    sliceBetween(source, "function initNginxGen(", "function initComposeGen("),
  ].join("\n");
  const html = "<!DOCTYPE html><html><body>" + section +
    "<script>" + helpers + "</" + "script>" +
    "<script>" + js + "</" + "script>" +
    "<script>initNginxGen();</" + "script>" +
    "</body></html>";
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true });
  return dom;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " | " + extra : "")); }
}
function drive(dom) {
  const doc = dom.window.document;
  return {
    doc,
    set: (id, v) => { doc.getElementById(id).value = v; doc.getElementById(id).dispatchEvent(new dom.window.Event("input", { bubbles: true })); },
    chk: (id, v) => { doc.getElementById(id).checked = v; doc.getElementById(id).dispatchEvent(new dom.window.Event("change", { bubbles: true })); },
    out: () => doc.getElementById("ngx-out").textContent,
    err: () => doc.getElementById("ngx-err").textContent,
    errVis: () => doc.getElementById("ngx-err").style.display === "block",
  };
}

// 黄金输出：2026-10-23 入仓时从当前实现捕获（单后端默认表单的完整输出）
const GOLDEN_SINGLE = "# 文件：/etc/nginx/sites-available/example.com.conf\n# 启用：sudo ln -s /etc/nginx/sites-available/example.com.conf /etc/nginx/sites-enabled/\nserver {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 60s;\n    }\n}\n\n# 落地与验证（逐条执行）：\n# sudo nginx -t\n# sudo systemctl reload nginx\n# curl -I http://example.com/";
const GOLDEN_RR_SERVERS = "    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;|    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;";

const P = drive(buildPage(src));

// NG1 单后端：输出与黄金值逐字一致（回归红线）
check("NG1 单后端输出与黄金值逐字一致", P.out() === GOLDEN_SINGLE, "len=" + P.out().length + " golden len=" + GOLDEN_SINGLE.length);
check("NG1b 单后端输出无 upstream/策略指令", !P.out().includes("upstream") && !P.out().includes("least_conn") && !P.out().includes("ip_hash"));

// 开启多后端
P.chk("ngx-multi", true);
// NG2 轮询默认：无策略指令行，server 行与黄金一致
check("NG2a 轮询多后端无 least_conn;/ip_hash; 指令行", !/^\s+least_conn;/m.test(P.out()) && !/^\s+ip_hash;/m.test(P.out()));
check("NG2b 轮询多后端 server 行与黄金一致",
  P.out().split("\n").filter((l) => l.includes("server 127.0.0.1")).join("|") === GOLDEN_RR_SERVERS,
  P.out().split("\n").filter((l) => l.includes("server 127")).join("|"));

// NG3 least_conn
P.set("ngx-lb", "least_conn");
check("NG3 least_conn 进 upstream 块首", P.out().includes("upstream backend_pool {\n    least_conn;"), P.out().slice(0, 400));
check("NG3b 标题注释写明策略", P.out().includes("策略为 least_conn 最少连接"));

// NG4 ip_hash + 权重忽略警告
P.set("ngx-lb", "ip_hash");
check("NG4a ip_hash 进 upstream 块首", P.out().includes("upstream backend_pool {\n    ip_hash;"));
check("NG4b ip_hash 输出权重忽略警告", P.out().includes("权重 weight 不参与计算"));

// NG5 权重解析（原有功能回归）：行尾裸数字权重
P.set("ngx-lb", "rr");
P.set("ngx-upstreams", "127.0.0.1:3000 3\n127.0.0.1:3001");
check("NG5 权重解析出 weight=3 且无权重行不带 weight", P.out().includes("server 127.0.0.1:3000 weight=3 ") && P.out().includes("server 127.0.0.1:3001 max_fails=3"), P.out().slice(0, 500));

// NG6 非法权重报错（原有行为回归）
P.set("ngx-upstreams", "127.0.0.1:3000 abc\n127.0.0.1:3001");
check("NG6a 非整数权重报错", P.errVis() && P.err().includes("权重必须是整数"), P.err());
P.set("ngx-upstreams", "127.0.0.1:3000 0\n127.0.0.1:3001");
check("NG6b 权重 0 报错（范围 1–1000）", P.errVis() && P.err().includes("权重必须在 1–1000 之间"), P.err());
P.set("ngx-upstreams", "127.0.0.1:3000\n127.0.0.1:3001");
check("NG6c 改回合法后 err 消失", !P.errVis());

console.log("==== nginx tests: " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
