// ===== 批次 C 新增工具（N-05 GitHub Actions / N-14 资源规划 / N-15 日志分析 /
// ===== N-18 APT 源与 Pin / N-20 迁移计划 / N-22 curl 构建 / N-23 SSH 日志 /
// ===== N-29 Git 命令 / N-32 命令解释）=====
// 风格与本页既有脚本一致：ES5、var/function、字符串拼接、输出一律 textContent。
// 依赖页面已有的全局助手 bindCopy / showCopyToast（既有脚本中已定义，本批直接复用）。

function bcEl(id) { return document.getElementById(id);}
function bcVal(id) { var el = bcEl(id); return el? el.value: "";}
function bcTrimVal(id) { return bcVal(id).replace(/^\s+|\s+$/g, "");}
function bcChk(id) { var el = bcEl(id); return el? el.checked: false;}
function bcShellQuote(s) {
return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function bcFail(errId, outId, msg) {
var errBox = bcEl(errId);
if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：" + msg;}
var out = bcEl(outId);
if (out) { out.textContent = "# 请先修正上面的输入";}
}
function bcOk(errId, outId, text) {
var errBox = bcEl(errId);
if (errBox) { errBox.style.display = "none";}
var out = bcEl(outId);
if (out) { out.textContent = text;}
}
function bcFmtNum(n) {
var s = String(Math.round(n * 10) / 10);
return s;
}
function bcTopList(map, limit) {
var arr = [];
for (var k in map) {
if (Object.prototype.hasOwnProperty.call(map, k)) { arr.push({ k: k, n: map[k]});}
}
arr.sort(function (a, b) {
if (b.n!== a.n) { return b.n - a.n;}
return a.k < b.k? -1: 1;
});
return arr.slice(0, limit);
}

// ---------- N-05 GitHub Actions 工作流生成器 ----------

function ghaCronError(expr) {
var parts = expr.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").split(" ");
if (parts.length!== 5) { return "cron 必须正好五段（分 时 日 月 周），当前是 " + parts.length + " 段";}
var ranges = [[0, 59, "分"], [0, 23, "时"], [1, 31, "日"], [1, 12, "月"], [0, 7, "周"]];
for (var i = 0; i < 5; i++) {
var p = parts[i];
if (!/^[0-9*\/,-]+$/.test(p)) {
return "第 " + (i + 1) + " 段「" + p + "」含非法字符：只接受数字与 * /, -，月份与星期请写数字（如 1 月、周一写 1），不要写 JAN / MON";
}
var nums = p.match(/\d+/g) || [];
for (var j = 0; j < nums.length; j++) {
var v = parseInt(nums[j], 10);
if (v < ranges[i][0] || v > ranges[i][1]) {
return "第 " + (i + 1) + " 段（" + ranges[i][2] + "）的数值 " + v + " 超出范围 " + ranges[i][0] + "–" + ranges[i][1];
}
}
if (p.indexOf("/")!== -1) {
var seg = p.split("/");
if (seg.length!== 2 ||!/^\d+$/.test(seg[1]) || parseInt(seg[1], 10) < 1) {
return "第 " + (i + 1) + " 段的步长写法不对：应为 */5 或 1-30/2 这种形式，步长是正整数";
}
}
}
return null;
}

var GHA_LANG_CMDS = {
node: {
setup: ["actions/setup-node@v4", "node-version"],
install: "npm ci",
build: "npm run build --if-present",
test: "npm test",
lint: "npx eslint."
},
python: {
setup: ["actions/setup-python@v5", "python-version"],
install: "pip install -r requirements.txt",
build: "python -m build",
test: "pytest",
lint: "flake8."
},
go: {
setup: ["actions/setup-go@v5", "go-version"],
install: "go mod download",
build: "go build./...",
test: "go test./...",
lint: "go vet./..."
}
};

function ghaGenerate() {
var out = bcEl("gha-out");
if (!out) { return;}
var errs = [];
var name = bcTrimVal("gha-name");
var file = bcTrimVal("gha-file");
var os = bcVal("gha-os");
var lang = bcVal("gha-lang");
var langver = bcTrimVal("gha-langver");
var branchesRaw = bcTrimVal("gha-branches");
var cron = bcTrimVal("gha-cron");
var tPush = bcChk("gha-t-push"), tPr = bcChk("gha-t-pr"), tDisp = bcChk("gha-t-dispatch"), tSched = bcChk("gha-t-schedule");
var sBuild = bcChk("gha-s-build"), sTest = bcChk("gha-s-test"), sLint = bcChk("gha-s-lint"), sArt = bcChk("gha-s-artifact");
var artName = bcTrimVal("gha-art-name"), artPath = bcTrimVal("gha-art-path");
var deploy = bcVal("gha-deploy");

if (!name) { errs.push("工作流名称不能为空");}
if (/[\r\n]/.test(name)) { errs.push("工作流名称不能包含换行");}
if (!file) { errs.push("文件名不能为空");}
else if (!/^[A-Za-z0-9._-]+$/.test(file)) { errs.push("文件名只能含字母、数字、点、下划线、连字符（如 ci、deploy）");}
if (!tPush &&!tPr &&!tDisp &&!tSched) { errs.push("至少选择一种触发方式，否则这个工作流永远不会运行");}
var branches = [];
if (branchesRaw) {
var bparts = branchesRaw.split(",");
for (var bi = 0; bi < bparts.length; bi++) {
var b = bparts[bi].replace(/^\s+|\s+$/g, "");
if (!b) { continue;}
if (!/^[A-Za-z0-9._/*-]+$/.test(b)) { errs.push("分支名「" + b + "」含非法字符");}
else { branches.push(b);}
}
}
if (tSched) {
var cerr = ghaCronError(cron);
if (cerr) { errs.push("定时 cron：" + cerr);}
}
if (lang!== "none") {
if (!langver) { errs.push("已选语言预设时请填语言版本（如 Node 20、Python 3.12、Go 1.22）");}
else if (!/^[A-Za-z0-9._*x-]+$/.test(langver)) { errs.push("语言版本含非法字符");}
}
if (sArt) {
if (!artName ||!/^[A-Za-z0-9._-]+$/.test(artName)) { errs.push("产物名称只能含字母、数字、点、下划线、连字符");}
if (!artPath || /[\r\n'"]/.test(artPath)) { errs.push("产物路径不能为空且不能含引号或换行");}
}
if (errs.length) { bcFail("gha-err", "gha-out", errs.join("；")); return;}

var nameYaml = name;
if (/[:#\[\]{}&*!|>'"%@`,]/.test(name)) {
nameYaml = '"' + name.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
var L = [];
L.push("# 由本站工具生成：GitHub Actions 工作流");
L.push("name: " + nameYaml);
L.push("");
L.push("# 触发条件（on 在 YAML 1.1 里可能被误读成布尔值，所以这里加了引号）");
L.push("\"on\":");
if (tPush) {
L.push("  push:");
if (branches.length) { L.push("    branches: [" + branches.join(", ") + "]");}
}
if (tPr) {
L.push("  pull_request:");
if (branches.length) { L.push("    branches: [" + branches.join(", ") + "]");}
}
if (tDisp) { L.push("  workflow_dispatch:");}
if (tSched) {
L.push("  schedule:");
L.push("    # cron 按 UTC 解读：北京时间 = UTC+8，填之前先换算");
L.push("    - cron: \"" + cron + "\"");
}
L.push("");
L.push("# 默认最小权限：本工作流只需要读仓库内容");
L.push("permissions:");
L.push("  contents: read");
L.push("");
L.push("jobs:");
L.push("  build:");
L.push("    runs-on: " + os);
L.push("    steps:");
L.push("      - uses: actions/checkout@v4");
if (lang!== "none") {
var lc = GHA_LANG_CMDS[lang];
L.push("      - uses: " + lc.setup[0]);
L.push("        with:");
L.push("          " + lc.setup[1] + ": \"" + langver + "\"");
if (lang === "node") { L.push("          # 需要缓存时加一行 cache: npm（要求仓库里有 package-lock.json）");}
L.push("      - name: 安装依赖");
L.push("        run: " + lc.install);
if (lang === "python") { L.push("        # python -m build 若未安装 build 包，先把 build 加进 requirements 或安装步");}
}
function ghaStep(label, cmd) {
L.push("      - name: " + label);
L.push("        run: " + cmd);
}
if (sBuild) {
if (lang === "none") { ghaStep("构建", "'echo \"TODO: 在这里填写构建命令\"'");}
else { ghaStep("构建", GHA_LANG_CMDS[lang].build);}
}
if (sTest) {
if (lang === "none") { ghaStep("测试", "'echo \"TODO: 在这里填写测试命令\"'");}
else { ghaStep("测试", GHA_LANG_CMDS[lang].test);}
}
if (sLint) {
if (lang === "none") { ghaStep("lint 检查", "'echo \"TODO: 在这里填写 lint 命令\"'");}
else { ghaStep("lint 检查", GHA_LANG_CMDS[lang].lint);}
}
if (sArt) {
L.push("      - name: 上传构建产物");
L.push("        uses: actions/upload-artifact@v4");
L.push("        with:");
L.push("          name: " + artName);
L.push("          path: " + artPath);
L.push("        # 产物默认有保留期（仓库设置决定），不要把这里当长期备份");
}
if (deploy === "pages") {
L.push("");
L.push("# ===== 部署占位：GitHub Pages（以下全是注释，确认后再取消注释启用） =====");
L.push("# 前置条件：仓库 Settings → Pages → Source 选择「GitHub Actions」；");
L.push("# 并把顶层 permissions 改为 contents: read + pages: write + id-token: write。");
L.push("# 还需在构建产物步骤之前加 actions/upload-pages-artifact 步骤打包站点目录。");
L.push("# deploy:");
L.push("#   needs: build");
L.push("#   runs-on: " + os);
L.push("#   environment: github-pages");
L.push("#   steps:");
L.push("#     - uses: actions/deploy-pages@v4");
} else if (deploy === "ssh") {
L.push("");
L.push("# ===== 部署占位：SSH 部署（以下全是注释，确认后再取消注释启用） =====");
L.push("# 前置条件：把私钥与服务器信息放进仓库 Settings → Secrets：");
L.push("# DEPLOY_KEY（私钥）、DEPLOY_HOST（服务器）、DEPLOY_USER（登录用户）。");
L.push("# ⚠ 绝不能把私钥明文写进本文件提交——仓库历史删不干净，等于公开。");
L.push("# deploy:");
L.push("#   needs: build");
L.push("#   runs-on: " + os);
L.push("#   steps:");
L.push("#     - uses: appleboy/ssh-action@v1");
L.push("#       with:");
L.push("#         host: ${{ secrets.DEPLOY_HOST }}");
L.push("#         username: ${{ secrets.DEPLOY_USER }}");
L.push("#         key: ${{ secrets.DEPLOY_KEY }}");
L.push("#         script: systemctl restart myapp");
}
L.push("");
L.push("# ===== 使用说明 =====");
L.push("# 1. 把这份内容保存为 .github/workflows/" + file + ".yml，提交到仓库默认分支。");
L.push("# 2. push / PR 触发后，到仓库 Actions 页查看每次运行的日志。");
if (tDisp) { L.push("# 3. 手动触发入口在 Actions 页选中本工作流后点 Run workflow（文件必须已在默认分支上）。");}
bcOk("gha-err", "gha-out", L.join("\n"));
}

// ---------- N-14 服务器资源规划器 ----------

var PLAN_TYPES = {
static: { label: "静态站", baseMemMb: 512, baseCpu: 1, perCoreRps: 300, cacheRate: 0},
dynamic: { label: "动态 Web", baseMemMb: 1024, baseCpu: 2, perCoreRps: 60, cacheRate: 0},
db: { label: "数据库", baseMemMb: 2048, baseCpu: 2, perCoreRps: 100, cacheRate: 0.25},
mixed: { label: "混合（Web + 数据库同机）", baseMemMb: 1536, baseCpu: 2, perCoreRps: 50, cacheRate: 0.15}
};
var PLAN_RAM_TIERS = [1, 2, 4, 8, 16, 32, 64, 128, 256];

function planNum(id, label, min, max, errs) {
var raw = bcTrimVal(id);
if (raw === "") { errs.push(label + "不能为空"); return NaN;}
var v = Number(raw);
if (isNaN(v) ||!isFinite(v)) { errs.push(label + "必须是数字"); return NaN;}
if (v < min || v > max) { errs.push(label + "应在 " + min + "–" + max + " 之间"); return NaN;}
return v;
}

function planGenerate() {
var out = bcEl("plan-out");
if (!out) { return;}
var errs = [];
var type = PLAN_TYPES[bcVal("plan-type")] || PLAN_TYPES.dynamic;
var users = planNum("plan-users", "预计总用户数", 0, 1000000000, errs);
var dau = planNum("plan-dau", "日活用户数", 0, 1000000000, errs);
var peak = planNum("plan-peak", "峰值并发请求数", 0, 1000000, errs);
var reqmem = planNum("plan-reqmem", "每请求内存占用", 0, 4096, errs);
var reqs = planNum("plan-reqs", "每位日活用户日均请求数", 0, 100000, errs);
var resp = planNum("plan-resp", "平均响应大小", 0, 1048576, errs);
var disk = planNum("plan-disk", "当前数据量", 0, 1048576, errs);
var growth = planNum("plan-growth", "数据月增长率", 0, 100, errs);
if (!isNaN(dau) &&!isNaN(users) && dau > users) { errs.push("日活用户数不能大于总用户数");}
if (!isNaN(peak) && peak === 0) { errs.push("峰值并发请求数不能为 0：哪怕只有一个访问者，也按 1 算");}
if (!isNaN(reqmem) && reqmem === 0) { errs.push("每请求内存占用不能为 0");}
if (!isNaN(reqs) && reqs === 0) { errs.push("每位日活用户日均请求数不能为 0");}
if (!isNaN(dau) && dau === 0) { errs.push("日活用户数不能为 0");}
if (errs.length) { bcFail("plan-err", "plan-out", errs.join("；")); return;}

// CPU：峰值请求率 RPS ≈ 峰值并发 ÷ 平均响应时间（假设 0.25 秒）
var rps = peak / 0.25;
var coresNeed = rps / type.perCoreRps;
var coresHigh = Math.max(type.baseCpu, Math.ceil(coresNeed));
var coresLow = Math.max(type.baseCpu, Math.ceil(coresHigh * 0.6));
if (coresLow > coresHigh) { coresLow = coresHigh;}
// 内存：基础开销 + 并发占用 + 数据库缓存，乘 1.5 余量后向上对齐常见规格
var concMemMb = peak * reqmem;
var cacheMb = Math.min(disk * 1024 * type.cacheRate, 16384);
var memRawMb = type.baseMemMb + concMemMb + cacheMb;
var memWithHeadMb = memRawMb * 1.5;
var memGbRaw = memRawMb / 1024;
var memTier = PLAN_RAM_TIERS[PLAN_RAM_TIERS.length - 1];
for (var ti = 0; ti < PLAN_RAM_TIERS.length; ti++) {
if (PLAN_RAM_TIERS[ti] * 1024 >= memWithHeadMb) { memTier = PLAN_RAM_TIERS[ti]; break;}
}
// 磁盘：一年后数据量 + 系统日志预留 20GB；建议上限再留一倍作本地备份冗余
var diskYearGb = disk * Math.pow(1 + growth / 100, 12);
var diskNeedGb = diskYearGb + 20;
var diskLow = Math.ceil(diskNeedGb);
var diskHigh = Math.ceil(diskNeedGb * 2);
// 带宽：日流量 = 日活 × 人均请求 × 平均响应大小；峰值系数 5
var dailyReq = dau * reqs;
var dailyGb = dailyReq * resp / 1024 / 1024;
var avgMbps = dailyGb * 8000 / 86400;
var peakMbps = avgMbps * 5;
var bwLow = Math.max(1, Math.ceil(avgMbps));
var bwHigh = Math.max(bwLow, Math.ceil(peakMbps));

var L = [];
L.push("# 服务器资源规划（粗略估算）");
L.push("⚠ 这是粗略估算，上线前需压测：以下每个数字都附公式与假设，假设与你的业务不符时结论会成倍偏差。");
L.push("");
L.push("输入摘要：服务类型 " + type.label + "；总用户 " + users + "；日活 " + dau + "；峰值并发 " + peak + " 请求；");
L.push(" 每请求内存 " + reqmem + " MB；人均日请求 " + reqs + " 次；平均响应 " + resp + " KB；当前数据 " + disk + " GB；月增长 " + growth + "%。");
L.push("");
L.push("\u3010CPU\u3011建议区间：" + coresLow + "–" + coresHigh + " 核");
L.push("  依据：峰值请求率 ≈ " + peak + " ÷ 0.25 秒（假设平均响应时间）= " + bcFmtNum(rps) + " RPS；");
L.push("  " + type.label + " 按每核约 " + type.perCoreRps + " RPS 估算，需 " + bcFmtNum(coresNeed) + " 核，向上取整且不低于该类型基线 " + type.baseCpu + " 核；");
L.push("  预算紧时先按区间下限起步，监控 CPU 利用率长期超过 70% 再升配。");
L.push("");
L.push("\u3010内存\u3011原始需求约 " + bcFmtNum(memGbRaw) + " GB，建议规格：" + memTier + " GB（区间 " + bcFmtNum(memGbRaw) + "–" + memTier + " GB）");
L.push("  依据：基础开销 " + type.baseMemMb + " MB（系统 + 服务常驻）+ 并发占用 " + peak + " × " + reqmem + " MB = " + concMemMb + " MB");
if (type.cacheRate > 0) {
L.push("  + 数据库缓存按数据量的 " + Math.round(type.cacheRate * 100) + "% 估算 " + Math.round(cacheMb) + " MB（上限 16 GB）；");
} else {
L.push("  + 本类型不单列数据库缓存；");
}
L.push("  合计 " + Math.round(memRawMb) + " MB，乘 1.5 余量系数后向上对齐到常见规格 " + memTier + " GB。");
L.push("");
L.push("\u3010磁盘\u3011建议区间：" + diskLow + "–" + diskHigh + " GB");
L.push("  依据：一年后数据量 ≈ " + disk + " × (1 + " + growth + "%)^12 = " + bcFmtNum(diskYearGb) + " GB，再加系统与日志预留 20 GB；");
L.push("  区间上限是下限的 2 倍，留给本地备份与临时文件；备份只放本机不算备份，重要数据请另存异地。");
L.push("");
L.push("\u3010带宽\u3011建议区间：" + bwLow + "–" + bwHigh + " Mbps");
L.push("  依据：日请求量 = " + dau + " × " + reqs + " = " + dailyReq + " 次；日流量 ≈ " + bcFmtNum(dailyGb) + " GB；");
L.push(" 平均带宽 = 日流量 × 8000 ÷ 86400 ≈ " + bcFmtNum(avgMbps) + " Mbps，峰值按平均值的 5 倍估算。");
L.push("  若主要是国内用户，带宽选型还要看云厂商线路质量，数字相同体感可能差很多。");
L.push("");
L.push("\u3010假设清单（复核时逐条对照）\u3011");
L.push("  - 平均响应时间 0.25 秒、每核处理能力按服务类型的经验值、内存余量系数 1.5、峰值带宽系数 5；");
L.push("  - 未计入：缓存层（Redis/CDN）削峰、长连接、定时任务高峰、攻击流量。实际有 CDN 时源站带宽可大幅下调。");
bcOk("plan-err", "plan-out", L.join("\n"));
}

// ---------- N-15 Linux 日志分析器 ----------

var LOG_MAX_LINES = 2000;
var LOG_LEVELS = [
["emerg", /\bemerg\b/i],
["alert", /\balert\b/i],
["crit", /\bcrit(ical)?\b/i],
["error", /\b(error|err|fatal|failed|failure)\b/i],
["warn", /\b(warn|warning)\b/i],
["info", /\binfo\b/i],
["debug", /\b(debug|trace)\b/i]
];
var LOG_ERR_RE = /\b(emerg|alert|crit|critical|error|err|fatal|failed|failure)\b/i;

function logNormalizePattern(line) {
var s = line;
s = s.replace(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+/, "");
s = s.replace(/^\d{4}-\d{2}-\d{2}[T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?\s+/, "");
s = s.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "<UUID>");
s = s.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>");
s = s.replace(/0x[0-9a-fA-F]+/g, "<HEX>");
s = s.replace(/\b[0-9a-fA-F]{8,}\b/g, "<HEX>");
s = s.replace(/\d+/g, "<N>");
s = s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
if (s.length > 110) { s = s.slice(0, 110) + "…";}
return s;
}

function logFindTime(line) {
var m = line.match(/\d{4}-\d{2}-\d{2}[T]\d{2}:\d{2}:\d{2}/);
if (m) { return m[0];}
m = line.match(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/);
if (m) { return m[0];}
return null;
}

function logGenerate() {
var out = bcEl("log-out");
if (!out) { return;}
var text = bcVal("log-text");
if (!text.replace(/\s+/g, "")) { bcFail("log-err", "log-out", "请先粘贴日志内容"); return;}
var allLines = text.split("\n");
var truncated = false;
var lines = allLines;
if (allLines.length > LOG_MAX_LINES) { truncated = true; lines = allLines.slice(0, LOG_MAX_LINES);}
var nonEmpty = 0;
var levelCounts = {};
var li, lj;
for (li = 0; li < LOG_LEVELS.length; li++) { levelCounts[LOG_LEVELS[li][0]] = 0;}
var errLines = [];
var firstTime = null, lastTime = null;
var svcCounts = {};
for (li = 0; li < lines.length; li++) {
var line = lines[li];
if (!line.replace(/\s+/g, "")) { continue;}
nonEmpty++;
for (lj = 0; lj < LOG_LEVELS.length; lj++) {
if (LOG_LEVELS[lj][1].test(line)) { levelCounts[LOG_LEVELS[lj][0]]++;}
}
if (LOG_ERR_RE.test(line)) { errLines.push(line);}
var t = logFindTime(line);
if (t) { if (firstTime === null) { firstTime = t;} lastTime = t;}
var sm = line.match(/([A-Za-z0-9_.-]+)\.service\b/);
if (sm) { var sn = sm[1] + ".service"; svcCounts[sn] = (svcCounts[sn] || 0) + 1;}
else {
var hm = line.match(/^\S+\s+\S+\s+\S+\s+\S+\s+([A-Za-z0-9_.-]+)(\[\d+\])?:/);
if (hm && hm[1]!== "Started" && hm[1]!== "Failed") { svcCounts[hm[1]] = (svcCounts[hm[1]] || 0) + 1;}
}
}
var patCounts = {};
for (li = 0; li < errLines.length; li++) {
var p = logNormalizePattern(errLines[li]);
if (p) { patCounts[p] = (patCounts[p] || 0) + 1;}
}
var topPats = bcTopList(patCounts, 5);
var topSvc = bcTopList(svcCounts, 5);
var errCount = levelCounts.error;
var critCount = levelCounts.emerg + levelCounts.alert + levelCounts.crit;
var warnRatio = nonEmpty? levelCounts.warn / nonEmpty: 0;

var L = [];
L.push("日志分析结果（本地解析，未上传）");
if (truncated) {
L.push("⚠ 输入共 " + allLines.length + " 行，已按上限截断为前 " + LOG_MAX_LINES + " 行，下面的统计只覆盖这部分。");
}
L.push("");
L.push("\u3010总览\u3011非空行 " + nonEmpty + " 行；含错误类关键词 " + errLines.length + " 行。");
L.push("\u3010时间范围\u3011" + (firstTime!== null? "首行时间 " + firstTime + "；末行时间 " + lastTime + "（按原文出现顺序取首末；syslog 时间戳不含年份）": "未识别到 ISO / syslog 样式的时间戳"));
L.push("");
L.push("\u3010按级别计数\u3011（按行内关键词匹配，一行命中多个级别时各计一次）");
for (li = 0; li < LOG_LEVELS.length; li++) {
L.push("  " + LOG_LEVELS[li][0] + "：" + levelCounts[LOG_LEVELS[li][0]] + " 行");
}
L.push("");
L.push("\u3010错误模式 Top5\u3011（IP / 数字 / 十六进制已归一化后聚合）");
if (topPats.length) {
for (li = 0; li < topPats.length; li++) { L.push("  " + (li + 1) + ". ×" + topPats[li].n + " " + topPats[li].k);}
} else { L.push("  （没有命中错误类关键词的行）");}
L.push("");
L.push("\u3010涉及的服务 / 单元 Top5\u3011");
if (topSvc.length) {
for (li = 0; li < topSvc.length; li++) { L.push("  " + (li + 1) + ". " + topSvc[li].k + "：" + topSvc[li].n + " 行");}
} else { L.push("  （未识别出服务名：既没有 xxx.service，也没有 syslog 的 程序名[pid]: 样式表头）");}
L.push("");
L.push("\u3010结论\u3011");
if (critCount > 0 || errCount >= 50) {
L.push("✗ 严重：出现 emerg/alert/crit 级别 " + critCount + " 行，错误类行 " + errCount + " 行——先按错误模式 Top1 定位根因，再看对应服务的 journalctl 全量日志。");
} else if (errCount >= 10 || warnRatio > 0.3) {
L.push("⚠ 警告：错误类行 " + errCount + " 行、warn 占非空行 " + Math.round(warnRatio * 100) + "%——错误在反复出现，不是偶发；按错误模式 Top 顺序逐个排查。");
} else if (errCount > 0) {
L.push("⚠ 提示：有 " + errCount + " 行错误类记录，量不大；确认是否与已知事件（如备份失败、单次超时）对应，对不上请继续下钻。");
} else {
L.push("✓ 提示：本段日志未发现错误类关键词；级别分布以 info/warn 为主，属常见运行噪声（仍建议抽查 warn 内容）。");
}
L.push("说明：本分析是关键词统计，不是语义理解；「数据库连接超时」这类写在 info 行里的真故障不会被计成 error，请结合错误模式列表人工过一遍。");
bcOk("log-err", "log-out", L.join("\n"));
}

function logClearInputs() {
bcEl("log-text").value = "";
bcEl("log-out").textContent = "";
bcEl("log-err").style.display = "none";
bcEl("log-msg").textContent = "已清空";
}

// ---------- N-18 APT 源与优先级辅助器 ----------

var APT_CODENAMES = {
noble: "Ubuntu 24.04", jammy: "Ubuntu 22.04", focal: "Ubuntu 20.04",
mantic: "Ubuntu 23.10", lunar: "Ubuntu 23.04",
bookworm: "Debian 12", bullseye: "Debian 11", buster: "Debian 10", trixie: "Debian 13"
};

function aptSuiteBase(suite) {
return suite.replace(/-(updates|security|backports|proposed)$/, "");
}
function aptIsOfficial(uri) {
var m = uri.match(/^[a-z]+:\/\/([^\/]+)/i);
var host = m? m[1]: uri;
return /(^|\.)ubuntu\.com$/i.test(host) || /(^|\.)debian\.org$/i.test(host);
}

function aptGenerate() {
var out = bcEl("apt-out");
if (!out) { return;}
var text = bcVal("apt-text");
var target = bcVal("apt-target");
if (!text.replace(/\s+/g, "")) { bcFail("apt-err", "apt-out", "请先粘贴 sources.list 或.sources 内容"); return;}
var lines = text.split("\n");
var items = [];
var entries = 0;
var seenKeys = {};
var badLines = 0;
var stanza = null;
var stanzaLine = 0;

function aptCheckEntry(kind, opts, uri, suite, comps, lineNo) {
entries++;
var issues = [];
var base = aptSuiteBase(suite);
if (APT_CODENAMES[base]) {
if (base!== target) {
issues.push({ lv: "✗", msg: "发行版代号不一致：这是 " + base + "（" + APT_CODENAMES[base] + "）的源，目标是 " + target + "（" + APT_CODENAMES[target] + "）——混源装包会拉进错误版本的依赖，请删除或改对"});
}
} else if (["stable", "testing", "unstable", "oldstable"].indexOf(base) === -1) {
issues.push({ lv: "⚠", msg: "套件名「" + suite + "」不在常见代号表里，无法判断与目标版本是否一致，请人工核对"});
}
if (/^http:\/\//i.test(uri)) {
issues.push({ lv: "⚠", msg: "使用 http 明文源：包本身有签名校验兜底，但元数据可被中间人篡改/窥探，能换 https 就换"});
}
var key = kind + "|" + uri + "|" + suite + "|" + comps;
if (seenKeys[key]) {
issues.push({ lv: "⚠", msg: "与第 " + seenKeys[key] + " 行重复（类型/地址/套件/组件全同），重复条目只会拖慢 apt update"});
} else { seenKeys[key] = lineNo;}
if (kind === "deb-src") {
issues.push({ lv: "提示", msg: "deb-src 源码源：不需要编译源码（apt-get source / build-dep）时可以删掉，能明显加快 apt update"});
}
if (!aptIsOfficial(uri)) {
var hasSign = /signed-by/i.test(opts || "");
if (!hasSign) {
issues.push({ lv: "⚠", msg: "第三方源且未见 Signed-By / signed-by 签名配置：请按该源官方文档补上指纹校验，不要用 apt-key 全局信任"});
} else {
issues.push({ lv: "✓", msg: "第三方源已声明签名校验（Signed-By），符合最小信任要求"});
}
}
for (var ii = 0; ii < issues.length; ii++) {
items.push({ lv: issues[ii].lv, line: lineNo, msg: issues[ii].msg});
}
return issues.length;
}

function aptFlushStanza() {
if (!stanza) { return;}
var types = (stanza["types"] || "").split(/\s+/);
var uris = (stanza["uris"] || "").split(/\s+/);
var suites = (stanza["suites"] || "").split(/\s+/);
var opts = stanza["signed-by"]? "signed-by=" + stanza["signed-by"]: "";
for (var a = 0; a < types.length; a++) {
if (!types[a]) { continue;}
for (var b = 0; b < uris.length; b++) {
if (!uris[b]) { continue;}
for (var c = 0; c < suites.length; c++) {
if (!suites[c]) { continue;}
aptCheckEntry(types[a], opts, uris[b], suites[c], stanza["components"] || "", stanzaLine);
}
}
}
stanza = null;
}

for (var i = 0; i < lines.length; i++) {
var raw = lines[i];
var line = raw.replace(/^\s+|\s+$/g, "");
var lineNo = i + 1;
if (!line) { aptFlushStanza(); continue;}
if (line.charAt(0) === "#") { continue;}
var dm = line.match(/^(deb|deb-src)\s+(\[[^\]]*\]\s*)?(\S+)\s+(\S+)(.*)$/);
if (dm) {
aptCheckEntry(dm[1], dm[2] || "", dm[3], dm[4], (dm[5] || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""), lineNo);
continue;
}
var fm = line.match(/^([A-Za-z-]+):\s*(.*)$/);
if (fm && /^(Types|URIs|Suites|Components|Signed-By|Enabled|Architectures)$/i.test(fm[1])) {
if (!stanza) { stanza = {}; stanzaLine = lineNo;}
stanza[fm[1].toLowerCase()] = fm[2];
continue;
}
badLines++;
}
aptFlushStanza();

if (!entries) {
bcFail("apt-err", "apt-out", "没有解析到任何源条目：请确认粘贴的是 sources.list /.sources 的内容（注释行与空行不算条目）");
return;
}
var nErr = 0, nWarn = 0;
for (var j = 0; j < items.length; j++) {
if (items[j].lv === "✗") { nErr++;}
if (items[j].lv === "⚠") { nWarn++;}
}
var L = [];
L.push("软件源检查结果（目标版本：" + APT_CODENAMES[target] + " / " + target + "）");
L.push("共解析到 " + entries + " 条源条目" + (badLines? "；另有 " + badLines + " 行无法解析，已跳过": "") + "。");
L.push("");
if (items.length) {
for (var k = 0; k < items.length; k++) {
L.push(items[k].lv + " 第 " + items[k].line + " 行：" + items[k].msg);
}
} else {
L.push("✓ 没有发现问题：代号与目标一致、无明文源、无重复条目。");
}
L.push("");
if (nErr > 0) { L.push("结论：✗ 有 " + nErr + " 处严重问题（代号不一致），修好之前不要 apt update / 装包。");}
else if (nWarn > 0) { L.push("结论：⚠ 无代号混源，但有 " + nWarn + " 处警告，建议逐条处理后再长期使用。");}
else { L.push("结论：✓ 源配置基本健康；仍建议改完后跑一次 apt update 并留意有无签名报错。");}
bcOk("apt-err", "apt-out", L.join("\n"));
}

function aptClearInputs() {
bcEl("apt-text").value = "";
bcEl("apt-out").textContent = "";
bcEl("apt-err").style.display = "none";
bcEl("apt-msg").textContent = "已清空";
}

function aptPinGenerate() {
var pout = bcEl("apt-pout");
if (!pout) { return;}
var errs = [];
var pkg = bcTrimVal("apt-pkg");
var ver = bcTrimVal("apt-ver");
var prioRaw = bcTrimVal("apt-prio");
var target = bcVal("apt-target");
if (!pkg) { errs.push("包名不能为空");}
else if (!/^[a-z0-9][a-z0-9+.-]*$/.test(pkg)) { errs.push("包名不合法：Debian 包名只用小写字母、数字与 + -.，且以字母或数字开头");}
if (ver && /[\s'"]/.test(ver)) { errs.push("版本号不能含空格或引号");}
var prio = NaN;
if (!/^-?\d+$/.test(prioRaw)) { errs.push("目标优先级必须是整数");}
else {
prio = parseInt(prioRaw, 10);
if (prio < -1000 || prio > 2000) { errs.push("目标优先级超出常见范围（-1000 到 2000）");}
}
if (errs.length) { bcFail("apt-perr", "apt-pout", errs.join("；")); return;}

var band, bandMsg;
if (prio > 1000) { band = "> 1000"; bandMsg = "会安装，哪怕需要把已装版本降级——只用于锁版本或回滚，并写清原因";}
else if (prio >= 100) { band = "100 – 1000"; bandMsg = "优先于普通源的版本（发行版目标源默认 990、普通源默认 500 都在这个区间）";}
else if (prio >= 1) { band = "1 – 99"; bandMsg = "仅当这个包还没有安装任何版本时才会被选上，已装的不会被动";}
else if (prio === 0) { band = "0"; bandMsg = "实际效果接近禁止：优先级 0 的版本不会被自动选中，不要用 0 表达「普通对待」";}
else { band = "< 0"; bandMsg = "禁止安装：无论如何都不会选中这个版本，常用于拉黑有问题的版本";}

var L = [];
L.push("# 保存为：/etc/apt/preferences.d/pin-" + pkg.replace(/\+/g, "plus") + ".pref");
L.push("Package: " + pkg);
if (ver) { L.push("Pin: version " + ver);}
else { L.push("Pin: release a=" + target + " # 未填版本号：按上方所选目标版本的源整体 pin");}
L.push("Pin-Priority: " + prio);
L.push("");
L.push("你填的优先级 " + prio + " 落在区间 " + band + "：" + bandMsg + "。");
if (prio > 1000) { L.push("⚠ 已超过 1000：apt 会为了满足它而降级，请确认这正是你的意图，并在文件里留注释写明原因。");}
L.push("");
L.push("\u3010优先级含义速查（通行语义）\u3011");
L.push("  > 1000 ：会安装，即使需要降级");
L.push("  100–1000：正常竞争区间，数值大者胜（目标发行版 990 / 普通源 500）");
L.push("  1–99   ：仅在尚未安装任何版本时才安装");
L.push("  0      ：不会被自动选中（别用它表示「默认」）");
L.push("  < 0    ：禁止安装该版本");
L.push("");
L.push("验证：保存后运行 apt-cache policy " + pkg + "，看该版本行的优先级数字是否已变成 " + prio + "。");
bcOk("apt-perr", "apt-pout", L.join("\n"));
}

function aptPinResetDefaults() {
bcEl("apt-pkg").value = "nginx";
bcEl("apt-ver").value = "";
bcEl("apt-prio").value = "1001";
aptPinGenerate();
}

// ---------- N-20 服务器迁移计划生成器 ----------

var MIG_SVC_LABEL = {
web: "Web（Nginx / Apache）", db: "数据库", files: "文件 / 上传目录",
mail: "邮件服务", docker: "Docker 容器", cron: "定时任务", app: "自定义应用"
};
var MIG_SVC_ITEMS = {
web: [
"导出 Nginx / Apache 配置（/etc/nginx、/etc/apache2）与站点目录清单",
"TLS 证书与私钥一并迁移（certbot 的 /etc/letsencrypt 别漏），并核对私钥文件权限"
],
db: [
"数据库先做逻辑备份（mysqldump / pg_dump）并在目标机试恢复一次",
"预同步阶段开启增量同步（主从复制 / 逻辑复制），正式切换时停写后对账关键表行数与校验和"
],
files: [
"文件目录用 rsync -a 预同步至少两轮，正式切换前跑最后一轮增量",
"核对属主与权限（rsync -a 保留，但目标机同名用户 UID 不一致时要对账）"
],
mail: [
"邮件迁移单独约窗口：先把新机加为低优先级 MX 或双投递过渡，避免切换瞬间丢信",
"切换后检查双方邮件队列无滞留，并实测收发各一封"
],
docker: [
"导出镜像清单（docker images）、compose 文件与.env；数据卷按文件/数据库方式单独迁",
"不要只 docker save 镜像就以为齐了——命名卷里的数据不在镜像里"
],
cron: [
"导出 crontab -l、/etc/cron.d 与 systemd timer 清单",
"新机先保持停用状态，正式切换后才启用，防止新旧两台同时跑（双发通知/重复扣款）"
],
app: [
"应用代码、配置、环境变量与 systemd unit 一并迁移，逐个核对路径与运行用户差异",
"在目标机先以测试端口跑通全流程，再进入正式切换"
]
};

function migGenerate() {
var out = bcEl("mig-out");
if (!out) { return;}
var errs = [];
var from = bcVal("mig-from"), to = bcVal("mig-to");
var host = bcTrimVal("mig-host");
var dataRaw = bcTrimVal("mig-data");
var win = bcVal("mig-window");
var dns = bcChk("mig-dns");
if (host &&!/^[A-Za-z0-9._-]+$/.test(host)) { errs.push("目标主机只能填 IP 或主机名（字母、数字、点、下划线、连字符）");}
var dataGb = NaN;
if (dataRaw === "") { errs.push("数据量不能为空（没有业务数据填 0）");}
else {
dataGb = Number(dataRaw);
if (isNaN(dataGb) || dataGb < 0 || dataGb > 1048576) { errs.push("数据量应是 0 到 1048576 之间的数字（GB）");}
}
var svcEls = document.querySelectorAll(".mig-svc");
var svcs = [];
for (var si = 0; si < svcEls.length; si++) { if (svcEls[si].checked) { svcs.push(svcEls[si].value);}}
if (!svcs.length) { errs.push("至少勾选一个要迁移的服务");}
if (errs.length) { bcFail("mig-err", "mig-out", errs.join("；")); return;}

var winLabel = { "0": "不停机（分钟级切换）", "30": "30 分钟", "120": "2 小时", "480": "8 小时（整夜）"}[win] || win;
var svcNames = [];
for (var sj = 0; sj < svcs.length; sj++) { svcNames.push(MIG_SVC_LABEL[svcs[sj]]);}
var syncHours = dataGb * 8000 / 100 / 3600;

var L = [];
L.push("# 服务器迁移计划");
L.push("路线：" + from + " → " + to + (host? "（目标主机 " + host + "）": ""));
L.push("服务：" + svcNames.join("、") + "；数据量约 " + dataGb + " GB；允许停机窗口：" + winLabel + "；" + (dns? "涉及 DNS 切换": "不涉及 DNS 切换"));
L.push("");
L.push("## 阶段一：盘点与准备");
L.push("[\x20] 盘点源机：系统版本、监听端口（ss -tlnp）、systemd 服务清单、磁盘占用（df -h / du）");
L.push("[\x20] 导出现有配置与清单并存档（本计划勾选的服务见阶段三的专项条目）");
L.push("[\x20] 目标机装好同版本（或目标版本）的基础软件，先不开对外服务");
if (dns) { L.push("[\x20] 把域名 TTL 从默认降到 300 秒——切换当天再改来不及，缓存旧记录还没过期");}
L.push("[\x20] 约定正式切换时间窗与负责人，通知业务方停机安排");
L.push("");
L.push("## 阶段二：备份与校验");
L.push("[\x20] 源机全量备份：配置目录、数据目录、数据库逻辑备份各一份，备份文件落到第三处（不是源机也不是目标机）");
L.push("[\x20] 在目标机试恢复一次备份并启动服务验证——没验证过的备份等于没有备份");
L.push("[\x20] 记录备份校验和（sha256sum）与恢复耗时，作为回滚时间的依据");
L.push("");
L.push("## 阶段三：预同步");
if (dataGb > 0) {
L.push("[\x20] 全量预同步数据约 " + dataGb + " GB：按 100 Mbps 有效带宽估算约 " + bcFmtNum(syncHours) + " 小时（公式：GB×8000÷带宽Mbps÷3600，实际以 rsync 实测为准）");
} else {
L.push("[\x20] 本次无业务数据迁移，本阶段只同步配置文件");
}
for (var sk = 0; sk < svcs.length; sk++) {
var items = MIG_SVC_ITEMS[svcs[sk]];
for (var sm = 0; sm < items.length; sm++) { L.push("[\x20] " + items[sm]);}
}
L.push("");
L.push("## 阶段四：演练");
L.push("[\x20] 在目标机走一遍完整切换流程（停写 → 末轮增量同步 → 改配置 → 起服务 → 冒烟测试），全程计时");
if (win!== "0") { L.push("[\x20] 演练总耗时必须 < 停机窗口（" + winLabel + "）的 70%，超时就先优化同步策略，不要带着侥幸正式切");} else { L.push("[\x20] 不停机切换的演练重点：双写/只读过渡是否真的无写丢失，切换动作要在分钟级完成");}
L.push("[\x20] 演练中发现的问题逐条记录并修正到本计划里");
L.push("");
L.push("## 阶段五：正式切换");
L.push("[\x20] 再次确认源机备份可用、目标机处于演练后的干净状态");
if (svcs.indexOf("db")!== -1) { L.push("[\x20] 数据库停写（或置只读），跑最后一轮增量同步并对账");}
if (svcs.indexOf("files")!== -1 || svcs.indexOf("web")!== -1) { L.push("[\x20] 文件目录跑最后一轮 rsync 增量同步");}
if (win === "0") { L.push("[\x20] 按演练验证过的双写/只读过渡切换流量，逐服务观察错误率");} else { L.push("[\x20] 在停机窗口内完成切换，超时未完成就执行回滚，不要现场硬撑");}
if (dns) { L.push("[\x20] DNS 记录切到目标机（TTL 已是 300，约 5 分钟全网生效），用 dig 多地验证解析结果");}
L.push("[\x20] 切换完成时间与操作人记入变更记录");
L.push("");
L.push("## 阶段六：验证清单");
L.push("[\x20] 关键路径逐个实测：首页打开、登录、下单/提交、文件上传（按业务勾选）");
L.push("[\x20] 看目标机日志错误率与监控告警 30 分钟，无异常才算切换完成");
if (svcs.indexOf("mail")!== -1) { L.push("[\x20] 邮件实测收发各一封，查双方队列无滞留");}
L.push("[\x20] 证书有效期、定时任务、备份任务在新机上确认已启用");
L.push("[\x20] 源机保持原样至少一周再下线——这段时间它就是回滚的落点");
L.push("");
L.push("## 回滚方案");
L.push("触发条件（满足任一即回滚，不临场争论）：");
L.push("[\x20] 切换后 30 分钟内核心接口错误率 > 1%，或业务方确认核心功能不可用");
L.push("[\x20] 数据对账发现关键表/关键文件不一致且原因不明");
L.push("[\x20] 预计修复时间超过停机窗口的剩余时间");
L.push("回滚步骤：");
if (dns) { L.push("[\x20] 1. DNS 记录切回源机 IP（TTL 300，约 5 分钟生效）");}
else { L.push("[\x20] 1. 流量入口（负载均衡/反向代理上游）切回源机");}
L.push("[\x20] 2. 目标机立即停写，防止新旧两边数据分叉");
L.push("[\x20] 3. 源机恢复对外服务并核对数据完整性");
L.push("[\x20] 4. 记录故障时间线与已变更项；问题未定位前不安排二次切换");
bcOk("mig-err", "mig-out", L.join("\n"));
}

function migResetDefaults() {
bcEl("mig-from").value = "Ubuntu 22.04";
bcEl("mig-to").value = "Ubuntu 24.04";
bcEl("mig-host").value = "";
bcEl("mig-data").value = "100";
bcEl("mig-window").value = "30";
bcEl("mig-dns").checked = true;
var els = document.querySelectorAll(".mig-svc");
for (var i = 0; i < els.length; i++) { els[i].checked = (els[i].value === "web" || els[i].value === "db");}
migGenerate();
}

// ---------- N-22 curl 命令构建器 ----------

function curlGenerate() {
var out = bcEl("curl-out");
if (!out) { return;}
var errs = [];
var url = bcTrimVal("curl-url");
var method = bcVal("curl-method");
var ctype = bcVal("curl-ctype");
var auth = bcVal("curl-auth");
var token = bcTrimVal("curl-token");
var buser = bcTrimVal("curl-buser");
var bpass = bcVal("curl-bpass");
var headersRaw = bcVal("curl-headers");
var body = bcVal("curl-body");
var timeoutRaw = bcTrimVal("curl-timeout");
var retryRaw = bcTrimVal("curl-retry");
var proxy = bcTrimVal("curl-proxy");
var useK = bcChk("curl-k");

if (!url) { errs.push("URL 不能为空");}
else if (/\s/.test(url)) { errs.push("URL 不能含空格或换行");}
else if (!/^https?:\/\//i.test(url)) { errs.push("URL 需以 http:// 或 https:// 开头");}
var headers = [];
var headerNames = {};
if (headersRaw.replace(/\s+/g, "")) {
var hlines = headersRaw.split("\n");
for (var hi = 0; hi < hlines.length; hi++) {
var hl = hlines[hi].replace(/^\s+|\s+$/g, "");
if (!hl) { continue;}
var ci = hl.indexOf(":");
if (ci <= 0) { errs.push("自定义请求头第 " + (hi + 1) + " 行格式不对（应为「头名: 值」）"); continue;}
var hn = hl.slice(0, ci).replace(/\s+$/g, "");
var hv = hl.slice(ci + 1).replace(/^\s+/g, "");
if (!/^[A-Za-z0-9-]+$/.test(hn)) { errs.push("自定义请求头第 " + (hi + 1) + " 行的头名含非法字符"); continue;}
headers.push(hn + ": " + hv);
headerNames[hn.toLowerCase()] = true;
}
}
if (auth === "bearer" &&!token) { errs.push("已选 Bearer 认证但 Token 为空");}
if (/[\r\n]/.test(token)) { errs.push("Token 不能含换行");}
if (auth === "basic" &&!buser) { errs.push("已选 Basic 认证但用户名为空");}
var formPairs = [];
if (ctype === "form" && body.replace(/\s+/g, "")) {
var blines = body.split("\n");
for (var bi = 0; bi < blines.length; bi++) {
var bl = blines[bi].replace(/^\s+|\s+$/g, "");
if (!bl) { continue;}
if (bl.indexOf("=") <= 0) { errs.push("表单请求体第 " + (bi + 1) + " 行应为「键=值」");}
else { formPairs.push(bl);}
}
}
var timeout = null, retry = null;
if (timeoutRaw!== "") {
if (!/^\d+$/.test(timeoutRaw) || parseInt(timeoutRaw, 10) < 1 || parseInt(timeoutRaw, 10) > 3600) { errs.push("超时秒数应为 1 到 3600 的整数");}
else { timeout = parseInt(timeoutRaw, 10);}
}
if (retryRaw!== "") {
if (!/^\d+$/.test(retryRaw) || parseInt(retryRaw, 10) > 10) { errs.push("重试次数应为 0 到 10 的整数");}
else { retry = parseInt(retryRaw, 10);}
}
if (proxy &&!/^[A-Za-z0-9.:\/@_-]+$/.test(proxy)) { errs.push("代理地址含非法字符（示例：http://127.0.0.1:7890）");}
if (errs.length) { bcFail("curl-err", "curl-out", errs.join("；")); return;}

var notes = [];
var args = ["curl"];
if (method === "HEAD") { args.push("-I");}
else if (method!== "GET") { args.push("-X", method);}
if (useK) {
args.push("-k");
notes.push("# ⚠ -k 跳过 TLS 证书校验：仅调试用，生产脚本与定时任务里不要带 -k。");
}
if (ctype === "json" &&!headerNames["content-type"]) { args.push("-H", bcShellQuote("Content-Type: application/json"));}
if (ctype === "form" &&!headerNames["content-type"]) { args.push("-H", bcShellQuote("Content-Type: application/x-www-form-urlencoded"));}
if (ctype === "text" &&!headerNames["content-type"]) { args.push("-H", bcShellQuote("Content-Type: text/plain"));}
for (var hj = 0; hj < headers.length; hj++) { args.push("-H", bcShellQuote(headers[hj]));}
if (auth === "bearer") {
args.push("-H", bcShellQuote("Authorization: Bearer " + token));
notes.push("# ⚠ 本命令包含 Bearer Token：不要存进 shell 历史、工单或截图；排查完建议轮换该 Token。");
} else if (auth === "basic") {
args.push("-u", bcShellQuote(bpass? buser + ":" + bpass: buser));
notes.push("# ⚠ 本命令包含 Basic 凭据：不要存进 shell 历史、工单或截图；同机其他用户也能从进程列表看到它。");
if (!bpass) { notes.push("# 未填密码：执行时 curl 会交互式提示输入密码（不会回显）。");}
}
var hasBody = body.replace(/\s+/g, "")!== "";
if (hasBody) {
if (method === "HEAD") {
notes.push("# ⚠ HEAD 请求按规范不带请求体，已忽略你填的请求体。");
} else if (ctype === "form") {
for (var fi = 0; fi < formPairs.length; fi++) { args.push("--data-urlencode", bcShellQuote(formPairs[fi]));}
if (method === "GET") { notes.push("# ⚠ GET 带请求体多数服务器会忽略；表单字段已按 --data-urlencode 生成，请确认这正是你要的语义。");}
} else {
args.push("--data", bcShellQuote(body.replace(/\r\n/g, "\n")));
if (method === "GET") { notes.push("# ⚠ GET 带请求体多数服务器会忽略；--data 还会让 curl 隐含用 POST，你选了 GET 所以这里显式保留 GET 语义检查。");}
}
}
if (timeout!== null) { args.push("--max-time", String(timeout));}
if (retry!== null && retry > 0) { args.push("--retry", String(retry));}
if (proxy) { args.push("--proxy", bcShellQuote(proxy));}
args.push(bcShellQuote(url));

var oneLine = args.join(" ");
var multi = "curl";
for (var ai = 1; ai < args.length; ai++) {
var a = args[ai];
var prev = args[ai - 1];
if (prev === "-H" || prev === "-u" || prev === "--data" || prev === "--data-urlencode" || prev === "--proxy" || prev === "-X" || prev === "--max-time" || prev === "--retry") {
multi += " " + a;
} else {
multi += " \\\n " + a;
}
}
var L = [];
for (var ni = 0; ni < notes.length; ni++) { L.push(notes[ni]);}
if (notes.length) { L.push("");}
L.push("===== 单行 =====");
L.push(oneLine);
L.push("");
L.push("===== 多行（反斜杠续行，粘到终端效果相同）=====");
L.push(multi);
bcOk("curl-err", "curl-out", L.join("\n"));
}

function curlResetDefaults() {
bcEl("curl-url").value = "https://example.com/api/items";
bcEl("curl-method").value = "GET";
bcEl("curl-ctype").value = "none";
bcEl("curl-auth").value = "none";
bcEl("curl-token").value = "";
bcEl("curl-buser").value = "";
bcEl("curl-bpass").value = "";
bcEl("curl-headers").value = "";
bcEl("curl-body").value = "";
bcEl("curl-timeout").value = "";
bcEl("curl-retry").value = "";
bcEl("curl-proxy").value = "";
bcEl("curl-k").checked = false;
curlGenerate();
}

// ---------- N-23 SSH 日志分析器 ----------

var SSHLOG_MAX_LINES = 5000;

function sshlogBump(map, key) { map[key] = (map[key] || 0) + 1;}

function sshlogGenerate() {
var out = bcEl("sshlog-out");
if (!out) { return;}
var text = bcVal("sshlog-text");
if (!text.replace(/\s+/g, "")) { bcFail("sshlog-err", "sshlog-out", "请先粘贴 auth.log 片段"); return;}
var allLines = text.split("\n");
var truncated = allLines.length > SSHLOG_MAX_LINES;
var lines = truncated? allLines.slice(0, SSHLOG_MAX_LINES): allLines;

var accepted = 0, failed = 0, invalidFailed = 0, invalidHintLines = 0;
var okByUser = {}, okByIp = {}, failByIp = {}, invalidByIp = {};
var discPreauth = 0, discNormal = 0, discRemote = 0;
for (var i = 0; i < lines.length; i++) {
var line = lines[i];
var m;
m = line.match(/Accepted (\S+) for (\S+) from (\S+)/);
if (m) { accepted++; sshlogBump(okByUser, m[2]); sshlogBump(okByIp, m[3]); continue;}
m = line.match(/Failed \S+ for invalid user (\S+) from (\S+)/);
if (m) { failed++; invalidFailed++; sshlogBump(failByIp, m[2]); sshlogBump(invalidByIp, m[2]); continue;}
m = line.match(/Failed \S+ for (\S+) from (\S+)/);
if (m) { failed++; sshlogBump(failByIp, m[2]); continue;}
m = line.match(/authentication failure;.*rhost=(\S+)/);
if (m) { failed++; sshlogBump(failByIp, m[1]); continue;}
if (/Invalid user \S+ from \S+/.test(line)) { invalidHintLines++; continue;}
if (/\[preauth\]/.test(line)) { discPreauth++; continue;}
if (/Received disconnect from/.test(line)) { discRemote++; continue;}
if (/Disconnected from/.test(line) || /Connection closed by/.test(line)) { discNormal++; continue;}
}
var invalidAttempts = invalidFailed;
var topFailIps = bcTopList(failByIp, 5);
var topOkUsers = bcTopList(okByUser, 5);
var maxIp = topFailIps.length? topFailIps[0].k: null;
var maxIpFail = topFailIps.length? topFailIps[0].n: 0;
var maxIpInvalid = maxIp? (invalidByIp[maxIp] || 0): 0;

var level, levelWhy;
if ((maxIpFail >= 50 && maxIpInvalid > 0) || failed >= 500) {
level = "高风险";
levelWhy = "触发高风险规则：" + (failed >= 500? "总失败 " + failed + " 次（≥500）": "单 IP " + maxIp + " 失败 " + maxIpFail + " 次（≥50）且伴随无效用户名尝试 " + maxIpInvalid + " 次") + "——高频失败 + 用户名字典试探是典型的爆破组合";
} else if (maxIpFail >= 10 || invalidAttempts >= 5 || failed >= 30) {
level = "可疑";
var reasons = [];
if (maxIpFail >= 10) { reasons.push("单 IP " + maxIp + " 失败 " + maxIpFail + " 次（≥10）");}
if (invalidAttempts >= 5) { reasons.push("无效用户名失败尝试 " + invalidAttempts + " 次（≥5）");}
if (failed >= 30) { reasons.push("总失败 " + failed + " 次（≥30）");}
levelWhy = "触发可疑规则：" + reasons.join("；") + "——已超出日常输错密码的量级，像在试探";
} else {
level = "观察";
levelWhy = "未触发可疑/高风险规则（单 IP 最高失败 " + maxIpFail + " 次、无效用户名尝试 " + invalidAttempts + " 次、总失败 " + failed + " 次）——单条或零星失败不判定为攻击，多为输错密码或公网背景扫描噪音";
}

var L = [];
L.push("SSH 日志分析结果（本地解析，未上传）");
if (truncated) { L.push("⚠ 输入共 " + allLines.length + " 行，已按上限截断为前 " + SSHLOG_MAX_LINES + " 行。");}
L.push("");
if (accepted === 0 && failed === 0) {
L.push("结论：无法判断——这段文本里没有识别到任何 Accepted / Failed 记录。可能粘贴的不是 auth.log 格式，或日志级别/片段不对；请确认来源是 /var/log/auth.log 或 journalctl -u ssh 的输出。");
bcOk("sshlog-err", "sshlog-out", L.join("\n"));
return;
}
L.push("\u3010总览\u3011成功登录 " + accepted + " 次；失败尝试 " + failed + " 次；其中无效用户名失败 " + invalidFailed + " 次。");
if (invalidHintLines) {
L.push("（另有 " + invalidHintLines + " 行「Invalid user」提示行，与上面的失败尝试多属同一次尝试，未重复计数。）");
}
L.push("");
L.push("\u3010成功登录\u3011按用户：");
if (topOkUsers.length) {
for (var a = 0; a < topOkUsers.length; a++) { L.push("  " + topOkUsers[a].k + "：" + topOkUsers[a].n + " 次");}
} else { L.push("  （无成功记录）");}
var okIpList = bcTopList(okByIp, 5);
L.push("\u3010成功登录\u3011按来源 IP：");
if (okIpList.length) {
for (var b = 0; b < okIpList.length; b++) { L.push("  " + okIpList[b].k + "：" + okIpList[b].n + " 次");}
} else { L.push("  （无成功记录）");}
L.push("");
L.push("\u3010失败尝试\u3011Top 来源 IP：");
if (topFailIps.length) {
for (var c = 0; c < topFailIps.length; c++) {
L.push("  " + topFailIps[c].k + "：" + topFailIps[c].n + " 次" + (invalidByIp[topFailIps[c].k]? "（其中无效用户名 " + invalidByIp[topFailIps[c].k] + " 次）": ""));
}
} else { L.push("  （无失败记录）");}
var both = [];
for (var ip in failByIp) { if (okByIp[ip]) { both.push(ip);}}
if (both.length) {
L.push("⚠ 以下 IP 既有失败又有成功登录，请人工确认是不是本人输错过密码：" + both.join("、"));
}
L.push("");
L.push("\u3010断开原因分布\u3011认证前断开（preauth）" + discPreauth + " 次；已登录会话正常结束 " + discNormal + " 次；对端主动断开 " + discRemote + " 次。");
L.push("  preauth 断开多是扫描器或爆破尝试被中止；已登录会话结束属正常现象，不计入风险。");
L.push("");
L.push("\u3010结论\u3011" + level);
L.push("依据：" + levelWhy + "。");
L.push("");
L.push("\u3010后续建议\u3011");
L.push("  1. 装 fail2ban 并启用 sshd jail（示例参数：maxretry=5、findtime=10m、bantime=1h 起步）：");
L.push("     sudo apt install fail2ban，新建 /etc/fail2ban/jail.local 写 [sshd] enabled=true，再 systemctl restart fail2ban。");
L.push("  2. 改密钥登录：ssh-copy-id 上传公钥 → 新开会话验证能登录 → 再把 sshd 的 PasswordAuthentication 设为 no（可配合本站「SSH 服务端配置生成器」），改之前保留一个已登录会话防锁死。");
L.push("  3. 换非 22 端口只能减少扫描噪音，不能代替上面两条；真正有效的是密钥登录 + fail2ban + 定期看这份统计。");
bcOk("sshlog-err", "sshlog-out", L.join("\n"));
}

function sshlogClearInputs() {
bcEl("sshlog-text").value = "";
bcEl("sshlog-out").textContent = "";
bcEl("sshlog-err").style.display = "none";
bcEl("sshlog-msg").textContent = "已清空";
}

// ---------- N-29 Git 命令生成器 ----------

var GIT_SCENES = {
  branch: [["new", "新建并切换到新分支"], ["list", "查看本地与远程分支"], ["delete", "删除本地分支"], ["rename", "重命名当前分支"]],
  commit: [["file", "暂存指定文件并提交"], ["all", "一键提交全部改动"], ["amend", "修补上次提交（改信息 / 补文件）"]],
  merge: [["merge", "把指定分支合并进当前分支"], ["rebase", "把当前分支变基到指定分支"], ["abort", "中止正在进行的合并 / 变基"]],
  sync: [["pull", "拉取远程更新"], ["push", "推送当前 / 指定分支"], ["pushnew", "首次推送并设置上游"], ["fetch", "只抓取不合并（先看再合）"]],
  undo: [["restore", "丢弃某个文件的未提交改动"], ["unstage", "取消暂存（改动保留）"], ["soft", "回退一次提交（改动保留）"], ["hard", "回退并丢弃改动（危险）"], ["revert", "用反向提交撤销已推送的提交"]],
  tag: [["create", "打轻量标签并推送"], ["annotated", "打附注标签并推送"], ["delete", "删除本地与远程标签"]],
  stash: [["save", "把当前改动暂存起来"], ["pop", "恢复最近一次暂存"], ["list", "查看暂存列表与内容"]]
};
var GIT_CAT_LABEL = { branch: "分支", commit: "提交", merge: "合并 / 变基", sync: "同步远程", undo: "撤销 / 恢复", tag: "标签", stash: "暂存（stash）" };

function gitRefreshScenes() {
  var cat = bcVal("git-cat");
  var sel = bcEl("git-scene");
  if (!sel) { return; }
  var old = sel.value;
  var scenes = GIT_SCENES[cat] || GIT_SCENES.branch;
  while (sel.firstChild) { sel.removeChild(sel.firstChild); }
  var found = false;
  for (var i = 0; i < scenes.length; i++) {
    var op = document.createElement("option");
    op.value = scenes[i][0];
    op.textContent = scenes[i][1];
    sel.appendChild(op);
    if (scenes[i][0] === old) { found = true; }
  }
  if (found) { sel.value = old; }
}

function gitArg(v) {
  if (/^[A-Za-z0-9._\/:@%+=,-]+$/.test(v)) { return v; }
  return bcShellQuote(v);
}

function gitGenerate() {
  var out = bcEl("git-out");
  if (!out) { return; }
  var errs = [];
  var cat = bcVal("git-cat");
  var scene = bcVal("git-scene");
  var branch = bcTrimVal("git-branch");
  var remote = bcTrimVal("git-remote") || "origin";
  var cmsg = bcVal("git-cmsg").replace(/^\s+|\s+$/g, "");
  var file = bcTrimVal("git-file");
  var tag = bcTrimVal("git-tag");
  var force = bcChk("git-force");

  var needBranch = ["new", "delete", "rename", "merge", "rebase", "pushnew"].indexOf(scene) !== -1;
  var needFile = ["file", "restore", "unstage"].indexOf(scene) !== -1;
  var needTag = ["create", "annotated", "delete"].indexOf(scene) !== -1 && cat === "tag";
  if (needBranch && !branch) { errs.push("当前场景需要填分支名"); }
  if (branch && !/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(branch)) { errs.push("分支名不合法：以字母或数字开头，只含字母、数字与 . _ / -"); }
  if (branch && (branch.indexOf("..") !== -1 || /\/$/.test(branch) || /\.lock$/.test(branch))) { errs.push("分支名不能含 .. 、不能以 / 结尾或以 .lock 结尾"); }
  if (!/^[A-Za-z0-9._-]+$/.test(remote)) { errs.push("远程名不合法（常见就是 origin）"); }
  if (needFile && !file) { errs.push("当前场景需要填文件路径"); }
  if (file && /[\r\n]/.test(file)) { errs.push("文件路径不能含换行"); }
  if (needTag && !tag) { errs.push("当前场景需要填标签名"); }
  if (tag && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) { errs.push("标签名不合法：只含字母、数字与 . _ -"); }
  if (/[\r\n]/.test(cmsg)) { errs.push("提交信息只写一行（多行说明请提交后用 git commit --amend 补到正文）"); }
  if ((scene === "file" || scene === "all") && cat === "commit" && !cmsg) { errs.push("提交场景需要填提交信息"); }
  if (errs.length) { bcFail("git-err", "git-out", errs.join("；")); return; }

  var sceneLabel = "";
  var sceneList = GIT_SCENES[cat] || [];
  for (var si = 0; si < sceneList.length; si++) { if (sceneList[si][0] === scene) { sceneLabel = sceneList[si][1]; } }
  var S = [];
  function step(note, cmd) { S.push(""); S.push("# " + note); if (cmd) { S.push(cmd); } }
  function warn(msg) { S.push("⚠ " + msg); }

  if (cat === "branch" && scene === "new") {
    step("新建分支 " + branch + " 并立即切换过去（基于当前分支的当前提交）", "git switch -c " + branch);
    step("旧版本 Git 没有 switch 时用这条（效果相同）", "git checkout -b " + branch);
  } else if (cat === "branch" && scene === "list") {
    step("查看本地分支（带 * 的是当前分支）", "git branch");
    step("连同远程跟踪分支一起看", "git branch -a");
    step("顺便确认每个分支最后一次提交", "git branch -v");
  } else if (cat === "branch" && scene === "delete") {
    step("删除本地分支 " + branch + "（-d 带保护：分支还没合并时会拒绝删除，先合并再删）", "git branch -d " + branch);
    warn("如确需丢弃未合并分支才用 git branch -D " + branch + " 强删——被删分支上未合并的提交很难找回，删前先 git log " + branch + " 看一眼。");
  } else if (cat === "branch" && scene === "rename") {
    step("把当前分支重命名为 " + branch, "git branch -m " + branch);
    step("若旧名已推送过远程：推送新名并删除远程旧名（两条一起做，不然远程会留两个分支）", "git push " + remote + " " + branch);
    S.push("git push " + remote + " --delete <旧分支名>");
  } else if (cat === "commit" && scene === "file") {
    step("先看一眼这个文件改了什么，避免提交夹带", "git diff -- " + gitArg(file));
    step("暂存该文件", "git add -- " + gitArg(file));
    step("提交（提交信息已做 shell 转义）", "git commit -m " + bcShellQuote(cmsg));
  } else if (cat === "commit" && scene === "all") {
    step("先总览改动范围：一键提交最怕把 .env、密钥、大文件一起带上", "git status --short");
    step("暂存全部改动（新增/修改/删除都包含）", "git add -A");
    step("提交", "git commit -m " + bcShellQuote(cmsg));
    warn("提交前扫一眼 git status 输出：出现 .env、*.pem、credentials 之类文件名，先把它们加进 .gitignore 再提交。");
  } else if (cat === "commit" && scene === "amend") {
    if (cmsg) {
      step("把上次提交的信息改成新信息（有漏文件时先 git add 漏掉的文件再执行）", "git commit --amend -m " + bcShellQuote(cmsg));
    } else {
      step("不改信息，只把已暂存的补充文件并进上次提交（先 git add 漏掉的文件）", "git commit --amend --no-edit");
    }
    warn("amend 会改写提交哈希：这次提交若已推送到共享分支，别 amend，改了就得强推且影响协作者；只对还没推送的提交用。");
  } else if (cat === "merge" && scene === "merge") {
    step("先确认你当前站在要接收合并的目标分支上（不是的话先 git switch 过去）", "git branch --show-current");
    step("把 " + branch + " 合并进当前分支", "git merge " + branch);
    step("有冲突时：改完冲突文件后逐个 git add，再执行这条收尾", "git merge --continue");
  } else if (cat === "merge" && scene === "rebase") {
    step("动手前先留一条备份分支（变基出问题时靠它回来）", "git branch backup-before-rebase");
    step("把当前分支的提交逐个重放到 " + branch + " 之上", "git rebase " + branch);
    warn("rebase 会改写提交历史：当前分支若已推送且有人基于它工作，不要 rebase，改用 merge；已推送的个人分支变基后推送要用 --force-with-lease。");
    step("冲突处理完执行这条继续（可重复多次）", "git rebase --continue");
  } else if (cat === "merge" && scene === "abort") {
    step("中止合并并回到合并前状态（二选一，与你正在进行的操作对应）", "git merge --abort");
    S.push("git rebase --abort");
    step("若提示没有进行中的合并/变基，说明状态已经清干净了，用这条确认", "git status");
  } else if (cat === "sync" && scene === "fetch") {
    step("只把远程的新提交抓到本地，不动你的工作区与当前分支", "git fetch " + remote);
    step("看远程比本地多了什么（确认无误再 merge / rebase）", "git log HEAD..@{u} --oneline");
  } else if (cat === "sync" && scene === "pull") {
    if (branch) { step("拉取 " + remote + " 的 " + branch + " 并合并进当前分支", "git pull " + remote + " " + branch); }
    else { step("拉取当前分支跟踪的远程更新并合并", "git pull"); }
    step("本地与远程都有新提交时会产生合并提交；团队约定用 rebase 时改用 git pull --rebase", null);
  } else if (cat === "sync" && (scene === "push" || scene === "pushnew")) {
    var target = branch || "HEAD";
    var pushCmd = "git push " + (scene === "pushnew" ? "-u " : "") + remote + " " + target + (force ? " --force-with-lease" : "");
    step(scene === "pushnew" ? "首次推送并把本地分支与远程分支绑定（之后直接 git push / git pull 即可）" : "推送到 " + remote + " 的 " + target, pushCmd);
    if (force) {
      warn("已按你的勾选使用 --force-with-lease 强推：它会先核对远程仍是你上次看到的样子，被别人推过就拒绝，不会盲目覆盖；裸 --force 没有这层保护，不要用。");
      warn("强推会改写远程历史：这条分支若有协作者，推完立刻通知他们重新同步。");
    }
  } else if (cat === "undo" && scene === "restore") {
    step("动手前留后路：先把当前改动暂存一份（后悔时能从 stash 找回来）", "git stash push -m backup -- " + gitArg(file));
    step("丢弃该文件未提交的改动，恢复到上次提交的样子", "git restore -- " + gitArg(file));
    warn("restore 丢弃的是未提交改动，没有回收站：执行后这些修改只能靠上一步的 stash 或编辑器撤销找回。更稳妥的替代是只 stash 不丢弃：git stash push -- <文件>，确认不要了再 git stash drop。");
  } else if (cat === "undo" && scene === "unstage") {
    step("把文件移出暂存区（改动本身保留在工作区，不丢东西）", "git restore --staged -- " + gitArg(file));
    step("确认暂存区现状", "git status");
  } else if (cat === "undo" && scene === "soft") {
    step("回退一次提交：提交消失，但改动全部保留在暂存区，可改完重新提交", "git reset --soft HEAD~1");
    step("看一眼保留下来的改动", "git status");
    warn("若这次提交已推送，别用 reset 改历史，改用下面「撤销/恢复 → 用反向提交撤销」的 revert 方案。");
  } else if (cat === "undo" && scene === "hard") {
    step("先留备份分支——这是本场景最重要的一步", "git branch backup-before-reset");
    step("回退一次提交并丢弃对应改动（工作区与暂存区都清干净）", "git reset --hard HEAD~1");
    warn("reset --hard 丢弃的未提交改动基本找不回；已提交的内容还能靠备份分支或 git reflog 找回（reflog 默认只留 90 天）。");
    warn("更安全的替代：想撤销已共享的提交用 git revert；只想临时收起改动用 git stash。");
  } else if (cat === "undo" && scene === "revert") {
    step("生成一个反向提交来抵消上一次提交（历史只增不改，已推送也能安全用）", "git revert HEAD");
    step("推送反向提交", "git push " + remote + " HEAD");
    warn("revert 冲突时改完文件 git add 后执行 git revert --continue；想放弃则 git revert --abort。");
  } else if (cat === "tag" && scene === "create") {
    step("在当前提交打轻量标签 " + tag, "git tag " + tag);
    step("把标签推到远程（普通 git push 不会自动带上标签）", "git push " + remote + " " + tag);
  } else if (cat === "tag" && scene === "annotated") {
    var note = cmsg || tag;
    step("打附注标签（带说明、作者与日期，发布版本建议用这种）", "git tag -a " + tag + " -m " + bcShellQuote(note));
    step("推送标签到远程", "git push " + remote + " " + tag);
  } else if (cat === "tag" && scene === "delete") {
    step("删除本地标签 " + tag, "git tag -d " + tag);
    step("删除远程标签", "git push " + remote + " --delete " + tag);
    warn("删远程标签会影响所有已拉取该标签的人与基于标签的发布流程；版本号发错了更常见的做法是打一个新标签，而不是删旧的。");
  } else if (cat === "stash" && scene === "save") {
    var smsg = cmsg || "wip";
    step("把已跟踪文件的改动暂存起来，工作区回到干净状态", "git stash push -m " + bcShellQuote(smsg));
    step("连未跟踪的新文件一起暂存时用这条（多一个 -u）", "git stash push -u -m " + bcShellQuote(smsg));
    step("确认暂存已存好", "git stash list");
  } else if (cat === "stash" && scene === "pop") {
    step("先看暂存列表，确认要恢复的是哪一条（默认恢复最近一条 stash@{0}）", "git stash list");
    step("恢复最近一条暂存并从列表删除它", "git stash pop");
    warn("pop 若冲突，暂存不会被删除，改完冲突后可用 git stash drop 手动清；不确定时先用 git stash apply 恢复（保留暂存副本）更稳妥。");
  } else if (cat === "stash" && scene === "list") {
    step("查看全部暂存", "git stash list");
    step("看最近一条暂存的具体改动", "git stash show -p stash@{0}");
  } else {
    step("所选场景暂未生成命令，请换个场景试试", null);
  }

  var L = [];
  L.push("# 场景：" + GIT_CAT_LABEL[cat] + " — " + sceneLabel);
  var paramBits = [];
  if (branch) { paramBits.push("分支 " + branch); }
  if (cat === "sync" || cat === "tag") { paramBits.push("远程 " + remote); }
  if (tag && cat === "tag") { paramBits.push("标签 " + tag); }
  if (paramBits.length) { L.push("# 参数：" + paramBits.join("；")); }
  if (force && !(cat === "sync" && (scene === "push" || scene === "pushnew"))) {
    L.push("# （已勾选强制推送，但当前场景不涉及推送，已忽略该选项）");
  }
  for (var li = 0; li < S.length; li++) { L.push(S[li]); }
  bcOk("git-err", "git-out", L.join("\n"));
}

function gitResetDefaults() {
  bcEl("git-cat").value = "branch";
  gitRefreshScenes();
  bcEl("git-scene").value = "new";
  bcEl("git-branch").value = "feature/login";
  bcEl("git-remote").value = "origin";
  bcEl("git-force").checked = false;
  bcEl("git-cmsg").value = "";
  bcEl("git-file").value = "";
  bcEl("git-tag").value = "";
  gitGenerate();
}

// ---------- N-32 Linux 命令解释器 ----------
// 风险等级：0 低（只读）/ 1 注意 / 2 危险 / 3 高风险。o 为参数释义表，p 为位置参数提示，sub 为子命令表。

var EXPLAIN_DB = {
"ls": { d: "列出目录内容", r: 0, p: "要查看的目录路径（省略则为当前目录）", o: { "-l": "长格式：权限、属主、大小、修改时间一列列显示", "-a": "连以. 开头的隐藏文件一起显示", "-h": "文件大小用 KB/MB 等人类可读单位（需配合 -l）", "-t": "按修改时间从新到旧排序", "-R": "递归列出所有子目录", "--color": "按类型着色显示（多数发行版默认开）"}},
"cd": { d: "切换当前目录（shell 内建命令）", r: 0, p: "目标目录；~ 是家目录，- 是上一个目录，.. 是上级目录", o: { "-": "回到上一个工作目录（作为参数使用）"}},
"cp": { d: "复制文件或目录", r: 1, p: "源路径与目标路径（最后一个是目标）", o: { "-r": "递归复制整个目录", "-R": "同 -r，递归复制目录", "-i": "覆盖前先询问确认", "-f": "强制覆盖，不询问（会压过 -i）", "-a": "归档模式：尽量原样保留权限、时间与链接", "-v": "显示正在复制的文件名", "-n": "不覆盖已存在的文件"}},
"mv": { d: "移动或重命名文件/目录", r: 1, p: "源路径与目标路径", o: { "-i": "覆盖前先询问", "-f": "强制覆盖不询问", "-n": "不覆盖已存在文件", "-v": "显示过程"}},
"rm": { d: "删除文件或目录（直接删除，不进回收站）", r: 2, p: "要删除的文件或目录路径", o: { "-r": "递归删除目录及其全部内容", "-R": "同 -r", "-f": "强制删除：忽略不存在的文件、不询问（危险组合是 -rf）", "-i": "逐个询问确认后再删", "-v": "显示删了哪些", "--no-preserve-root": "解除对根目录 / 的特殊保护——出现这个参数基本等于明确要删整个系统"}},
"mkdir": { d: "新建目录", r: 0, p: "要新建的目录路径", o: { "-p": "连同缺失的父目录一起建，已存在也不报错", "-m": "同时指定权限（如 -m 750）", "-v": "显示新建了哪些目录"}},
"chmod": { d: "修改文件/目录权限", r: 1, p: "权限（如 755 或 u+x）与文件路径", o: { "-R": "递归修改整个目录树", "-v": "显示每个文件的权限变化", "--reference": "按另一个文件的权限来设置"}},
"chown": { d: "修改文件属主与属组（通常需要 root）", r: 1, p: "属主[:属组] 与文件路径", o: { "-R": "递归修改整个目录树", "-v": "显示变更明细", "--reference": "按另一个文件的属主来设置"}},
"ln": { d: "给文件建链接（硬链接或符号链接）", r: 0, p: "源文件与链接名", o: { "-s": "建符号链接（快捷方式式，源删了链接就失效）；不加则建硬链接", "-f": "目标已存在时先删再建", "-v": "显示过程"}},
"tar": { d: "打包/解包归档文件（常配合 gzip）", r: 1, p: "归档文件名与要打包/解出的路径", o: { "-c": "创建新归档（create）", "-x": "解开归档（extract）", "-t": "只列出归档内容不解开", "-f": "指定归档文件名（后面紧跟文件名，必备）", "-z": "用 gzip 压缩/解压（.tar.gz）", "-J": "用 xz 压缩/解压（.tar.xz）", "-v": "显示处理的文件名", "-C": "先切换到指定目录再解包/打包"}},
"gzip": { d: "压缩或解压.gz 文件（默认删源文件）", r: 1, p: "要压缩/解压的文件", o: { "-d": "解压", "-k": "保留源文件不删除", "-r": "递归处理目录内文件", "-9": "最高压缩比（慢），-1 最快"}},
"df": { d: "查看各文件系统总容量与剩余空间", r: 0, p: "可指定某个挂载点或设备，只看它所在文件系统", o: { "-h": "人类可读单位", "-T": "同时显示文件系统类型", "-i": "看 inode 用量（文件数爆满时查这个）"}},
"du": { d: "统计文件/目录占用空间", r: 0, p: "要统计的路径", o: { "-h": "人类可读单位", "-s": "只给一个总计", "--max-depth": "只统计到第 N 层", "-a": "连文件一起列出"}},
"ps": { d: "查看当前进程快照", r: 0, p: "一般无位置参数", o: { "aux": "BSD 风格常用组合：a 全部用户、u 显示用户/资源、x 含无终端进程", "-ef": "System V 风格：-e 全部进程、-f 全格式", "-o": "自定义输出列（如 -o pid,cmd,%cpu）", "--sort": "按指定列排序（如 --sort=-%mem）"}},
"top": { d: "实时刷新地看进程与负载（交互界面，q 退出）", r: 0, p: "一般无位置参数", o: { "-u": "只看指定用户的进程", "-p": "只看指定 PID", "-b": "批处理模式输出（写脚本/重定向时用）", "-n": "刷新 N 次后退出（配合 -b）"}},
"kill": { d: "向进程发送信号（默认 TERM 请进程自己退出）", r: 1, p: "目标进程的 PID", o: { "-9": "发送 KILL：进程被内核直接杀死，来不及保存数据/清理——先用默认 TERM，杀不掉再 -9", "-15": "发送 TERM（默认信号）：请进程正常退出", "-l": "列出所有信号名与编号", "-HUP": "发送 SIGHUP：很多守护进程用它重读配置"}},
"systemctl": { d: "管理 systemd 服务与系统状态（多数写操作需要 root）", r: 1, p: "子命令 + 服务名", o: { "--now": "enable 时连带立即启动（enable --now）", "--user": "操作当前用户级服务", "--no-pager": "输出不进分页器（脚本里用）"}},
"service": { d: "老式的服务管理命令（内部多已转调 systemctl）", r: 1, p: "服务名 + 动作（start/stop/status 等）", o: {}},
"journalctl": { d: "查看 systemd 日志（journald）", r: 0, p: "一般无位置参数", o: { "-u": "只看指定服务单元的日志", "-f": "持续跟踪新日志（类似 tail -f）", "-n": "只显示最后 N 行", "--since": "从某个时间起（如 --since \"1 hour ago\"）", "-p": "按最低优先级过滤（如 -p err 只看 err 及以上）", "-b": "只看本次开机的日志（-b -1 是上一次）", "--disk-usage": "看日志占了多大磁盘"}},
"apt": { d: "Debian/Ubuntu 的包管理前端（装包、更新源）", r: 1, p: "子命令 + 包名", o: { "-y": "所有确认一律自动回答 yes（脚本里常用，但也意味着不复核）", "--dry-run": "只演算不真装（install/remove 排障时先跑）", "--reinstall": "重装已安装的包"}},
"dpkg": { d: "直接操作.deb 包与已装包数据库（比 apt 更底层）", r: 1, p: "deb 文件路径或包名", o: { "-i": "安装一个.deb 文件（--install）", "-r": "卸载包但保留配置（--remove）", "-P": "卸载包并清掉配置（--purge）", "-l": "列出已装包（可带通配模式）", "-L": "列出某个包装了哪些文件", "-S": "查某个文件属于哪个包"}},
"ssh": { d: "通过 SSH 加密远程登录服务器", r: 1, p: "[用户@]主机", o: { "-p": "指定端口（默认 22）", "-i": "指定私钥文件", "-L": "本地端口转发：把本地端口转发到远端可达的地址", "-R": "远程端口转发：把远端端口转发回本地", "-D": "动态转发（本地起 SOCKS 代理）", "-N": "只建隧道不执行远程命令（配合转发用）", "-v": "输出调试信息（排障连不上时加，最多 -vvv）"}},
"scp": { d: "通过 SSH 在本机与远程之间复制文件", r: 1, p: "源与目标，远程写作 用户@主机:路径", o: { "-r": "递归复制整个目录", "-P": "指定 SSH 端口（注意是大写 P）", "-i": "指定私钥文件", "-p": "保留原文件的修改时间与权限"}},
"rsync": { d: "增量同步文件/目录（只传差异，常用于备份与部署）", r: 1, p: "源路径与目标路径（远程写作 用户@主机:路径）", o: { "-a": "归档模式：递归并保留权限/时间/链接等", "-v": "显示同步的文件", "-z": "传输时压缩（慢网有用，局域网反而拖慢）", "-n": "空跑演练：只显示会动哪些文件，不真同步（动手前先跑）", "--delete": "删除目标里源没有的文件，让两边完全一致——目标路径写错时等于清空目标，先 -n 演练", "--progress": "显示每个文件的传输进度", "-e": "指定远程 shell（如 -e 'ssh -p 2222'）"}},
"curl": { d: "发送 HTTP 请求（下载、调接口、排障常用）", r: 1, p: "要请求的 URL", o: { "-o": "把响应存到指定文件", "-O": "按远程文件名保存到当前目录", "-L": "跟随重定向", "-I": "只取响应头（发 HEAD 请求）", "-X": "指定请求方法（POST/PUT/DELETE 等）", "-H": "加一个请求头", "-d": "发送请求体数据（会隐含用 POST）", "-k": "跳过 TLS 证书校验——只调试用，正式场景等于自拆加密校验", "-f": "HTTP 出错（4xx/5xx）时以非零码退出（脚本里判断成败靠它）", "-s": "静默模式，不显示进度条", "--max-time": "整体超时秒数"}},
"wget": { d: "下载文件（支持断点续传与镜像抓取）", r: 1, p: "要下载的 URL", o: { "-O": "指定保存文件名（- 为输出到标准输出）", "-c": "断点续传", "-q": "静默，不输出日志", "-r": "递归下载整站/整目录（对对方服务器压力大，先确认允许）", "--no-check-certificate": "跳过证书校验，等同 curl -k，只调试用"}},
"ping": { d: "用 ICMP 测目标是否可达与延迟", r: 0, p: "目标主机名或 IP", o: { "-c": "发 N 个包后停（不加会一直发，Ctrl+C 停）", "-i": "每个包间隔秒数", "-W": "单个包的等待超时秒数"}},
"ip": { d: "查看/配置网卡地址、路由（现代发行版用它替代 ifconfig）", r: 1, p: "子命令：addr / link / route", o: { "-br": "简洁模式：一行一个网卡看地址", "-c": "着色输出"}},
"ss": { d: "查看套接字与监听端口（替代 netstat）", r: 0, p: "一般无位置参数", o: { "-t": "只看 TCP", "-u": "只看 UDP", "-l": "只看监听中的", "-n": "不解析服务名/域名，直接显示数字端口", "-p": "同时显示占用进程（看别人的进程需 root）"}},
"netstat": { d: "查看网络连接与监听端口（老工具，新系统多用 ss）", r: 0, p: "一般无位置参数", o: { "-tlnp": "常用组合：TCP + 监听 + 数字端口 + 进程", "-an": "全部连接，数字形式显示"}},
"ufw": { d: "简易防火墙管理（底层是 iptables/nftables，需要 root）", r: 2, p: "子命令：allow / deny / delete / status 等", o: { "allow": "放行（如 ufw allow 22/tcp）", "deny": "拒绝并回包", "reject": "拒绝（与 deny 的回包方式不同）", "status": "查看当前规则（ufw status verbose）", "delete": "删除一条规则（ufw delete allow 22）", "--force": "跳过确认（如 --force enable/reset）"}},
"docker": { d: "管理容器、镜像与 Compose 项目", r: 1, p: "子命令：ps / run / exec / logs / stop / rm 等", o: { "-d": "run 时后台运行（detached）", "-it": "run/exec 时给交互终端", "--rm": "容器退出后自动删除（run）", "-v": "挂载卷（run）：主机路径:容器路径", "-p": "端口映射（run）：主机端口:容器端口", "-f": "logs 时持续跟踪输出"}},
"cat": { d: "把文件内容输出到标准输出（查看小文件常用）", r: 0, p: "文件路径（可多个，依次输出）", o: { "-n": "带行号输出", "-A": "显示不可见字符（查行尾 ^M$ 这类 CRLF 问题）"}},
"grep": { d: "按模式搜索文本行（只输出命中的行）", r: 0, p: "模式 + 文件（省略文件则读标准输入）", o: { "-i": "忽略大小写", "-r": "递归搜索整个目录", "-n": "带行号", "-v": "反选：输出不命中的行", "-E": "用扩展正则", "-c": "只输出命中行数", "--color": "命中部分着色"}},
"find": { d: "按条件查找文件（可对结果批量执行命令）", r: 1, p: "起始目录 + 条件（如 -name、-type、-size、-mtime）", o: { "-name": "按文件名匹配（支持通配）", "-type": "按类型：f 文件、d 目录、l 链接", "-size": "按大小（如 +100M 大于 100MB）", "-mtime": "按修改天数（如 -mtime +30 是 30 天前）", "-delete": "直接删除命中的文件——等于批量 rm，先不加 -delete 用 -print 看清单", "-exec": "对每个命中文件执行后面的命令（以 \\; 结尾）；接 rm 时尤其危险", "-maxdepth": "最多下钻 N 层"}},
"awk": { d: "按列处理文本的编程语言（打印某列、统计、格式化）", r: 0, p: "处理脚本（单引号包裹）+ 输入文件", o: { "-F": "指定列分隔符（如 -F: 按冒号分列）"}},
"sed": { d: "流式文本编辑（查找替换、删行、打印指定行）", r: 1, p: "编辑脚本 + 文件", o: { "-i": "原地改文件：替换直接落盘——先不加 -i 预览输出，确认无误再落盘，重要文件先备份", "-n": "只输出被脚本明确打印的行（常配合 p）", "-E": "用扩展正则"}},
"head": { d: "只看文件开头若干行", r: 0, p: "文件路径", o: { "-n": "看前 N 行（默认 10 行）；写 -5 等于 -n 5", "-c": "按字节数取"}},
"tail": { d: "只看文件末尾若干行（看日志常用）", r: 0, p: "文件路径", o: { "-n": "看最后 N 行（默认 10 行）", "-f": "持续跟踪新追加的内容（看实时日志）", "-F": "同 -f 但文件被轮转/重建后继续跟（日志场景用这个）"}},
"sort": { d: "对文本行排序", r: 0, p: "文件（或读标准输入）", o: { "-n": "按数值大小排（不加是按字符串，10 会排在 2 前）", "-r": "倒序", "-u": "排序后去重", "-k": "按第 N 列排序", "-h": "按人类可读大小排序（配合 du -h）"}},
"uniq": { d: "去除相邻的重复行（通常先 sort 再 uniq）", r: 0, p: "文件（或读标准输入）", o: { "-c": "每行前给出重复次数（统计高频行常用）", "-d": "只输出重复过的行", "-u": "只输出不重复的行"}},
"wc": { d: "统计行数、词数、字节数", r: 0, p: "文件路径", o: { "-l": "只统计行数", "-w": "只统计词数", "-c": "只统计字节数"}},
"history": { d: "查看/管理 shell 命令历史（内建命令）", r: 0, p: "可跟数字：只看最近 N 条", o: { "-c": "清空当前会话的历史", "-a": "把当前会话历史立刻写入历史文件"}},
"useradd": { d: "新建系统用户（需要 root）", r: 1, p: "新用户名", o: { "-m": "同时创建家目录（不加常没有家目录）", "-s": "指定登录 shell（如 /usr/sbin/nologin 表示禁止登录）", "-G": "把用户加入附加组（如 sudo、docker）"}},
"passwd": { d: "修改用户密码（需要相应权限）", r: 1, p: "用户名（省略则改自己的）", o: { "-l": "锁定该账号的密码登录", "-u": "解锁", "-d": "删除密码（等于允许无密码登录，服务账号慎用）", "-e": "强制下次登录时改密码"}},
"sudo": { d: "以 root（或其他用户）身份执行后面的命令", r: 1, p: "要提权执行的命令", o: { "-u": "以指定用户身份执行（默认 root）", "-i": "开一个目标用户的登录 shell", "-s": "开一个目标用户的 shell", "-l": "列出当前用户被授权的 sudo 权限"}},
"mount": { d: "把文件系统挂载到目录（需要 root）", r: 2, p: "设备 + 挂载点", o: { "-o": "挂载选项（如 ro 只读、noexec）", "-t": "指定文件系统类型", "-a": "按 /etc/fstab 挂载全部", "--bind": "把一个目录绑挂到另一个目录"}},
"umount": { d: "卸载已挂载的文件系统（需要 root）", r: 2, p: "挂载点或设备", o: { "-l": "懒卸载：先从目录树摘除，等没人用了再真正释放", "-f": "强制卸载（NFS 卡死时用）", "-R": "连同子挂载一起卸"}},
"free": { d: "查看内存与 swap 总量/用量", r: 0, p: "一般无位置参数", o: { "-h": "人类可读单位", "-s": "每 N 秒刷新一次持续看"}},
"uptime": { d: "看开机时长与系统平均负载（1/5/15 分钟）", r: 0, p: "一般无位置参数", o: { "-p": "用「up 2 days」这种可读说法输出"}},
"env": { d: "查看环境变量，或在指定环境下运行命令", r: 0, p: "无参数列出全部变量；也可跟 VAR=值 与命令", o: { "-i": "用空环境运行后面的命令"}},
"export": { d: "把 shell 变量设为环境变量（内建命令），只影响当前 shell 及其子进程", r: 0, p: "变量名或 变量名=值", o: { "-p": "列出当前所有已导出的变量", "-n": "取消某个变量的导出"}},
"crontab": { d: "管理当前用户的定时任务表", r: 1, p: "一般无位置参数（操作的是任务表）", o: { "-e": "编辑任务表（最常用）", "-l": "列出当前任务", "-r": "删除整个任务表——和 -e 只差一个键位，误按等于清空全部定时任务", "-u": "操作指定用户的任务表（需 root）"}},
"git": { d: "分布式版本控制（管代码历史与协作）", r: 1, p: "子命令：status / add / commit / push / pull 等", o: {}},
"dd": { d: "按块复制数据（写镜像、测速、清盘），写错目标就是毁盘", r: 3, p: "用 if=源 of=目标 的键值参数", o: { "if=": "输入源（input file）", "of=": "输出目标（output file）——写到 /dev/sdX 会直接覆盖整块磁盘", "bs=": "块大小（如 bs=4M）", "status=": "status=progress 显示进度", "conv=": "转换选项（如 conv=fsync 写完刷盘）"}},
"sh": { d: "POSIX shell：执行脚本或命令串", r: 1, p: "脚本文件路径", o: { "-c": "执行后面字符串给的命令"}},
"bash": { d: "Bourne-Again Shell：执行脚本或交互登录", r: 1, p: "脚本文件路径", o: { "-c": "执行后面字符串给的命令", "-x": "执行时打印每条命令（调试脚本）"}}
};

var EXPLAIN_SUB = {
"systemctl": { "start": "立即启动服务", "stop": "立即停止服务", "restart": "重启服务（先停再启，中间有短暂中断）", "reload": "让服务重读配置不断线（服务需支持）", "status": "查看服务状态与最近日志", "enable": "设为开机自启（不立即启动，除非加 --now）", "disable": "取消开机自启", "daemon-reload": "让 systemd 重新加载 unit 文件（改完 unit 必做）", "is-active": "只回答服务是否在运行"},
"docker": { "ps": "列出容器（加 -a 含已停止的）", "run": "新建并启动一个容器", "exec": "进到正在运行的容器里执行命令", "logs": "看容器输出日志", "stop": "停止容器（先发 TERM，超时再 KILL）", "start": "启动已停止的容器", "rm": "删除已停止的容器", "rmi": "删除镜像", "images": "列出本地镜像", "build": "按 Dockerfile 构建镜像", "pull": "拉取镜像", "compose": "Compose 子命令组（up/down/ps 等在它后面）"},
"apt": { "update": "刷新软件源索引（不装任何东西）", "upgrade": "升级已装的包（不删包）", "full-upgrade": "升级且允许为解决依赖删包", "install": "安装或升级指定包", "remove": "卸载包但保留配置", "purge": "卸载包并清掉配置", "autoremove": "清掉不再被需要的自动依赖", "search": "按关键词搜包", "show": "看某个包的详细信息"},
"git": { "clone": "克隆一个仓库到本地", "status": "看工作区与暂存区状态", "add": "把改动放进暂存区", "commit": "把暂存区内容记成一次提交", "push": "把本地提交推到远程", "pull": "拉取远程更新并合并/变基", "log": "看提交历史", "diff": "看改动差异", "checkout": "切换分支或恢复文件（旧命令）", "switch": "切换/新建分支", "restore": "恢复文件改动", "stash": "把改动暂存起来", "revert": "用反向提交撤销某次提交", "reset": "移动当前分支指针（可保留或丢弃改动，看模式）"},
"ip": { "addr": "看/改网卡 IP 地址（ip a 是常用简写）", "a": "addr 的简写：看地址", "link": "看/改网卡链路状态（up/down、MAC）", "route": "看/改路由表（ip r 是简写）", "r": "route 的简写：看路由", "show": "查看（跟在对象后面）"}
};

var EXPLAIN_ROOT_CMDS = ["systemctl", "service", "apt", "dpkg", "useradd", "passwd", "mount", "umount", "ufw"];
var EXPLAIN_RISK_LABEL = ["低（只读或无副作用）", "注意（会改状态或产生资源消耗）", "危险（可能丢数据或让服务中断）", "高风险（可能造成不可逆破坏）"];

function explainTokens(s) {
var toks = [], cur = "", q = null, i, c;
function push() { if (cur!== "") { toks.push(cur); cur = "";}}
for (i = 0; i < s.length; i++) {
c = s.charAt(i);
if (q) {
if (c === q) { q = null;}
else if (c === "\\" && q === '"' && i + 1 < s.length) { i++; cur += s.charAt(i);}
else { cur += c;}
continue;
}
if (c === "'" || c === '"') { q = c; continue;}
if (c === " " || c === "\t") { push(); continue;}
if (c === "\\" && i + 1 < s.length) { i++; cur += s.charAt(i); continue;}
if (c === "|" || c === ";" || c === "<") { push(); toks.push(c); continue;}
if (c === ">") { push(); if (s.charAt(i + 1) === ">") { toks.push(">>"); i++;} else { toks.push(">");} continue;}
if (c === "&") {
push();
if (s.charAt(i + 1) === "&") { toks.push("&&"); i++;}
else if (s.charAt(i + 1) === ">") { toks.push("&>"); i++;}
else { toks.push("&");}
continue;
}
cur += c;
}
push();
// 合并 2> 与 2>&1
var merged = [];
for (i = 0; i < toks.length; i++) {
if (toks[i] === "2" && (toks[i + 1] === ">" || toks[i + 1] === ">>")) {
if (toks[i + 1] === ">" && toks[i + 2] === "&" && toks[i + 3] === "1") { merged.push("2>&1"); i += 3;}
else { merged.push(toks[i + 1] === ">"? "2>": "2>>"); i += 1;}
continue;
}
merged.push(toks[i]);
}
return merged;
}

function explainGenerate() {
var out = bcEl("explain-out");
if (!out) { return;}
var raw = bcVal("explain-text").replace(/^\s+|\s+$/g, "");
if (!raw) { bcFail("explain-err", "explain-out", "请先输入一条命令"); return;}
if (raw.length > 2000) { bcFail("explain-err", "explain-out", "命令过长（上限 2000 字符），请拆成单条再解释"); return;}
var toks = explainTokens(raw);
if (!toks.length) { bcFail("explain-err", "explain-out", "没有解析出任何内容，请检查输入"); return;}

var redirects = [];
var segments = [];
var curSeg = { toks: [], opBefore: null};
var pendingOp = null;
var REDIR_OPS = { ">": 1, ">>": 1, "<": 1, "2>": 1, "2>>": 1, "&>": 1};
for (var ti = 0; ti < toks.length; ti++) {
var tk = toks[ti];
if (tk === "2>&1") { redirects.push({ op: "2>&1", target: "标准输出（fd 1）所在的地方"}); continue;}
if (pendingOp) {
redirects.push({ op: pendingOp, target: tk});
pendingOp = null;
continue;
}
if (REDIR_OPS[tk]) { pendingOp = tk; continue;}
if (tk === "|" || tk === "&&" || tk === ";") {
segments.push(curSeg);
curSeg = { toks: [], opBefore: tk};
continue;
}
if (tk === "&") {
segments.push(curSeg);
curSeg = { toks: [], opBefore: "&"};
continue;
}
curSeg.toks.push(tk);
}
if (pendingOp) { redirects.push({ op: pendingOp, target: "（缺少目标，可能命令还没写完）"});}
segments.push(curSeg);

var unknown = [];
var maxRisk = 0;
var needRoot = false;
var effectBits = [];
var L = [];
L.push("命令拆解：" + raw);
L.push("");

for (var si = 0; si < segments.length; si++) {
var seg = segments[si];
if (!seg.toks.length) { continue;}
var st = seg.toks.slice(0);
if (seg.opBefore === "|") { L.push("（管道：上一段的输出作为这一段的输入）");}
if (seg.opBefore === "&&") { L.push("（&&：上一段执行成功才执行这一段）");}
if (seg.opBefore === ";") { L.push("（;：无论上一段成败都接着执行这一段）");}
if (seg.opBefore === "&") { L.push("（&：上一段在后台运行）");}
L.push("\u3010第 " + (si + 1) + " 段\u3011" + st.join(" "));
var segRisk = 0;
// 环境变量赋值前缀
while (st.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(st[0]) && st[0].indexOf("=") > 0) {
L.push("  环境变量赋值 " + st[0] + "：只对这条命令生效，不写进系统配置");
st.shift();
}
if (!st.length) { L.push("  （这一段只有变量赋值，没有实际命令）"); effectBits.push("设置临时环境变量"); continue;}
var sudoUsed = false;
if (st[0] === "sudo") {
sudoUsed = true;
needRoot = true;
L.push("  sudo：以 root 身份执行后面的命令——权限是借来的，命令本身的风险按 root 的破坏力算");
st.shift();
while (st.length && (st[0] === "-u" || st[0] === "-g")) { L.push("  sudo 参数 " + st[0] + " " + (st[1] || "") + "：指定以哪个用户/组身份执行"); st.shift(); st.shift();}
if (!st.length) { L.push("  （sudo 后面没有命令，无法继续拆解）"); continue;}
}
var cmdRaw = st[0];
var cmd = cmdRaw.replace(/^.*\//, "");
var entry = EXPLAIN_DB[cmd];
var rest = st.slice(1);
if (!entry ||!entry.d) {
L.push("  命令「" + cmd + "」：未收录——本知识库没有这个命令，不臆测它的作用与风险；请先查 man " + cmd + " 或 " + cmd + " --help 再决定是否执行。");
unknown.push("命令 " + cmd);
effectBits.push(cmd + "（未收录）");
continue;
}
segRisk = entry.r;
L.push("  命令 " + cmd + "：" + entry.d);
if (EXPLAIN_ROOT_CMDS.indexOf(cmd)!== -1) { needRoot = true;}
// 子命令
var subTable = EXPLAIN_SUB[cmd];
var consumedSub = false;
if (subTable && rest.length && rest[0].charAt(0)!== "-") {
if (subTable[rest[0]]) {
L.push("  子命令 " + rest[0] + "：" + subTable[rest[0]]);
if (cmd === "systemctl" && (rest[0] === "stop" || rest[0] === "disable")) { segRisk = Math.max(segRisk, 2);}
if (cmd === "apt" && (rest[0] === "remove" || rest[0] === "purge" || rest[0] === "full-upgrade")) { segRisk = Math.max(segRisk, 2);}
rest = rest.slice(1);
consumedSub = true;
} else {
L.push("  子命令「" + rest[0] + "」：未收录——" + cmd + " 有这个子命令与否请查 man " + cmd + "，本工具不猜。");
unknown.push(cmd + " 子命令 " + rest[0]);
rest = rest.slice(1);
consumedSub = true;
}
}
if (cmd === "service" && rest.length >= 2) {
L.push("  服务名：" + rest[0] + "；动作：" + rest[1] + "（start 启动 / stop 停止 / restart 重启 / status 看状态）");
rest = rest.slice(2);
}
// find 的 -exec 内容
var findExecRm = false;
// 逐个解释参数
var positionals = [];
var hasR = false, hasF = false;
for (var ai = 0; ai < rest.length; ai++) {
var a = rest[ai];
if (cmd === "find" && a === "-exec") {
var execParts = [];
var aj = ai + 1;
while (aj < rest.length && rest[aj]!== ";" && rest[aj]!== "\\;") { execParts.push(rest[aj]); aj++;}
L.push("  -exec：" + " 对每个查到的文件执行一次「" + execParts.join(" ") + "」（{} 代表当前文件）");
if (execParts[0] === "rm") { findExecRm = true;}
ai = aj;
continue;
}
if (a === "--") {
L.push("  参数 --：表示选项到此为止，后面的内容一律按位置参数处理（用来操作以 - 开头的文件名）");
continue;
}
if (a.slice(0, 2) === "--") {
var eq = a.indexOf("=");
var base = eq > 0? a.slice(0, eq): a;
if (entry.o[base]) { L.push("  参数 " + a + "：" + entry.o[base]);}
else if (entry.o[a]) { L.push("  参数 " + a + "：" + entry.o[a]);}
else { L.push("  参数 " + a + "：未收录——不确定就查 man " + cmd + "，别凭相近命令猜。"); unknown.push(cmd + " 参数 " + a);}
if (cmd === "rsync" && base === "--delete") { segRisk = Math.max(segRisk, 2);}
continue;
}
if (a.charAt(0) === "-" && a.length > 1 &&!/^-\d+$/.test(a)) {
if (entry.o[a]) { L.push("  参数 " + a + "：" + entry.o[a]);}
else if (a.length > 2) {
var chars = a.slice(1).split("");
for (var ch = 0; ch < chars.length; ch++) {
var one = "-" + chars[ch];
if (entry.o[one]) { L.push("  参数 " + one + "：" + entry.o[one]);}
else { L.push("  参数 " + one + "：未收录（来自组合写法 " + a + "）"); unknown.push(cmd + " 参数 " + one);}
if (chars[ch] === "r" || chars[ch] === "R") { hasR = true;}
if (chars[ch] === "f") { hasF = true;}
}
} else {
L.push("  参数 " + a + "：未收录——查 man " + cmd + " 确认后再执行。");
unknown.push(cmd + " 参数 " + a);
}
if (a === "-r" || a === "-R") { hasR = true;}
if (a === "-f") { hasF = true;}
continue;
}
if (/^-\d+$/.test(a)) {
if (cmd === "kill") { L.push("  参数 " + a + "：发送编号为 " + a.slice(1) + " 的信号（9 是 KILL 强杀，见 kill 的 -9 说明）");}
else if (cmd === "head" || cmd === "tail") { L.push("  参数 " + a + "：等价于 -n " + a.slice(1) + "，取 " + a.slice(1) + " 行");}
else if (cmd === "gzip") { L.push("  参数 " + a + "：压缩等级 " + a.slice(1) + "（1 最快、9 最小）");}
else { positionals.push(a);}
continue;
}
if (cmd === "dd" && /^[a-z]+=/.test(a)) {
var dk = a.slice(0, a.indexOf("=") + 1);
if (entry.o[dk]) { L.push("  参数 " + a + "：" + entry.o[dk]);}
else { L.push("  参数 " + a + "：dd 的键值参数，未收录该键——dd 写错参数后果严重，查 man dd 确认。"); unknown.push("dd 参数 " + dk);}
continue;
}
if (entry.o[a]) { L.push("  参数 " + a + "：" + entry.o[a]); continue; }
      positionals.push(a);
}
for (var pi = 0; pi < positionals.length; pi++) {
L.push("  位置参数「" + positionals[pi] + "」：" + (entry.p || "命令的操作对象"));
}
// 风险修正规则
if (cmd === "rm") {
if ((hasR || rest.join(" ").indexOf("-r")!== -1) && (hasF || rest.join(" ").indexOf("-f")!== -1)) {
segRisk = 3;
L.push("  ⚠ -r 与 -f 同时出现：递归强删，路径写错（如变量为空变成 rm -rf /）会删掉整个目录树且不进回收站。");
}
for (var rp = 0; rp < positionals.length; rp++) {
if (positionals[rp] === "/" || positionals[rp] === "/*") { segRisk = 3; L.push("  ⚠ 目标是根目录 /：这会摧毁整个系统，现代 rm 默认有 --preserve-root 保护，但加了 sudo/特殊参数时不要指望它。");}
}
}
if (cmd === "find" && findExecRm) { segRisk = 3; L.push("  ⚠ find -exec rm 是批量删除：命中范围就是删除范围，先把 -exec 换成 -print 看清单再执行。");}
if (cmd === "find") {
for (var fi2 = 0; fi2 < rest.length; fi2++) { if (rest[fi2] === "-delete") { segRisk = 3; L.push("  ⚠ 带 -delete：查到即删除，等同批量 rm。");}}
}
if (cmd === "chmod") {
var joined = rest.join(" ");
if (/777|a\+rwx/.test(joined)) {
segRisk = Math.max(segRisk, 2);
L.push("  ⚠ 777 / a+rwx 等于任何人可读可写可执行：配置文件、私钥、脚本被任意用户改写就是提权通道。");
if (hasR) { segRisk = 3; L.push("  ⚠ 还带了 -R 递归：整棵目录树一起放开权限，定级上调为高风险。");}
}
}
if (cmd === "crontab") {
for (var ci2 = 0; ci2 < rest.length; ci2++) { if (rest[ci2] === "-r") { segRisk = 3; L.push("  ⚠ crontab -r 会删掉当前用户的全部定时任务（与 -e 只差一个字母，经典误删）。");}}
}
if (cmd === "kill") {
for (var ki = 0; ki < rest.length; ki++) { if (rest[ki] === "-9" || rest[ki] === "-KILL") { segRisk = Math.max(segRisk, 2); L.push("  ⚠ -9 是强杀：进程来不及写完数据/释放锁，数据库类进程被 -9 可能要走恢复流程。");}}
}
if (cmd === "sed") {
for (var di = 0; di < rest.length; di++) { if (rest[di] === "-i" || rest[di].slice(0, 2) === "-i") { L.push("  提示：-i 表示改动直接写入原文件，执行前请先不带 -i 跑一遍看输出，或提前 cp 一份备份。");}}
}
maxRisk = Math.max(maxRisk, segRisk);
effectBits.push(cmd + (consumedSub? "": "") + "：" + entry.d);
L.push("");
}

// 管道把远程内容交给 shell 的组合
var pipeToShell = false;
for (var psi = 0; psi + 1 < segments.length; psi++) {
var a1 = segments[psi].toks, b1 = segments[psi + 1].toks;
if (!a1.length ||!b1.length) { continue;}
var ca = a1[0] === "sudo"? a1[1]: a1[0];
var cb = b1[0] === "sudo"? b1[1]: b1[0];
ca = (ca || "").replace(/^.*\//, ""); cb = (cb || "").replace(/^.*\//, "");
if ((ca === "curl" || ca === "wget") && (cb === "sh" || cb === "bash") && segments[psi + 1].opBefore === "|") { pipeToShell = true;}
}
if (pipeToShell) {
maxRisk = 3;
L.push("⚠ 组合风险：前段在下载远程内容，后段直接交给 shell 执行——等于无条件信任对方服务器上的脚本。先下载到文件、读一遍再执行。");
L.push("");
}

// 重定向
for (var ri = 0; ri < redirects.length; ri++) {
var rd = redirects[ri];
if (rd.op === ">") {
L.push("重定向 > ：把标准输出写入「" + rd.target + "」，目标已存在会被直接覆盖清空。");
maxRisk = Math.max(maxRisk, 1);
if (/^\/dev\/(sd|nvme|hd)/.test(rd.target)) { maxRisk = 3; L.push("  ⚠ 目标是磁盘设备：直接写设备等于毁掉上面的文件系统。");}
else if (/^\/etc\//.test(rd.target)) { maxRisk = Math.max(maxRisk, 2); L.push("  ⚠ 目标在 /etc 下：覆盖系统配置前先备份原文件。");}
} else if (rd.op === ">>") {
L.push("重定向 >> ：把标准输出追加到「" + rd.target + "」末尾（不覆盖原内容）。");
} else if (rd.op === "<") {
L.push("重定向 < ：把「" + rd.target + "」作为命令的标准输入。");
} else if (rd.op === "2>") {
L.push("重定向 2> ：把标准错误（报错信息）写入「" + rd.target + "」（覆盖）。");
maxRisk = Math.max(maxRisk, 1);
} else if (rd.op === "2>>") {
L.push("重定向 2>> ：把标准错误追加到「" + rd.target + "」末尾。");
} else if (rd.op === "&>") {
L.push("重定向 &> ：标准输出与标准错误一起写入「" + rd.target + "」（覆盖）。");
maxRisk = Math.max(maxRisk, 1);
} else if (rd.op === "2>&1") {
L.push("重定向 2>&1 ：把标准错误合并到标准输出当前指向的地方（顺序敏感：要写在 > 目标之后才一起进文件）。");
}
}
if (redirects.length) { L.push("");}

L.push("整体效果：" + effectBits.join("；") + "。");
L.push("所需权限：" + (needRoot? "root——命令里用了 sudo 或命令本身通常要 root 执行，借来的权限不降低风险。": "普通用户即可（但对无权限的文件/目录会报错，不要为了省事顺手加 sudo）。"));
L.push("风险等级：" + (maxRisk >= 2? "⚠ ": "✓ ") + EXPLAIN_RISK_LABEL[maxRisk] + "（" + maxRisk + " / 3）");
if (unknown.length) {
L.push("未收录项：" + unknown.join("、") + "——以上部分本工具没有解释，请查 man 手册，不要凭相似命令推断。");
}
bcOk("explain-err", "explain-out", L.join("\n"));
}

function explainClearInputs() {
bcEl("explain-text").value = "";
bcEl("explain-out").textContent = "";
bcEl("explain-err").style.display = "none";
bcEl("explain-msg").textContent = "已清空";
}

// ---------- 批次 C：init 绑定（沿用本页模式：data-ready 防重复绑定、bindCopy 复制） ----------

function initGhaGen() {
  var out = bcEl("gha-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["gha-name", "gha-file", "gha-os", "gha-lang", "gha-langver", "gha-branches", "gha-cron", "gha-t-push", "gha-t-pr", "gha-t-dispatch", "gha-t-schedule", "gha-s-build", "gha-s-test", "gha-s-lint", "gha-s-artifact", "gha-art-name", "gha-art-path", "gha-deploy"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", ghaGenerate);
      el.addEventListener("change", ghaGenerate);
    }
  });
  var clear = bcEl("gha-clear");
  if (clear) { clear.addEventListener("click", ghaResetDefaults); }
  bindCopy("gha-copy", "gha-out", "gha-msg");
  ghaGenerate();
}

function ghaResetDefaults() {
  bcEl("gha-name").value = "CI";
  bcEl("gha-file").value = "ci";
  bcEl("gha-os").value = "ubuntu-24.04";
  bcEl("gha-lang").value = "node";
  bcEl("gha-langver").value = "20";
  bcEl("gha-branches").value = "main";
  bcEl("gha-cron").value = "0 2 * * 1";
  bcEl("gha-t-push").checked = true;
  bcEl("gha-t-pr").checked = true;
  bcEl("gha-t-dispatch").checked = false;
  bcEl("gha-t-schedule").checked = false;
  bcEl("gha-s-build").checked = true;
  bcEl("gha-s-test").checked = true;
  bcEl("gha-s-lint").checked = false;
  bcEl("gha-s-artifact").checked = false;
  bcEl("gha-art-name").value = "build-output";
  bcEl("gha-art-path").value = "dist/";
  bcEl("gha-deploy").value = "none";
  ghaGenerate();
}

function initPlanGen() {
  var out = bcEl("plan-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["plan-type", "plan-users", "plan-dau", "plan-peak", "plan-reqmem", "plan-reqs", "plan-resp", "plan-disk", "plan-growth"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", planGenerate);
      el.addEventListener("change", planGenerate);
    }
  });
  var clear = bcEl("plan-clear");
  if (clear) { clear.addEventListener("click", planResetDefaults); }
  bindCopy("plan-copy", "plan-out", "plan-msg");
  planGenerate();
}

function planResetDefaults() {
  bcEl("plan-type").value = "dynamic";
  bcEl("plan-users").value = "10000";
  bcEl("plan-dau").value = "1000";
  bcEl("plan-peak").value = "50";
  bcEl("plan-reqmem").value = "30";
  bcEl("plan-reqs").value = "30";
  bcEl("plan-resp").value = "60";
  bcEl("plan-disk").value = "20";
  bcEl("plan-growth").value = "5";
  planGenerate();
}

function initLogGen() {
  var out = bcEl("log-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = bcEl("log-run");
  if (run) { run.addEventListener("click", logGenerate); }
  var clear = bcEl("log-clear");
  if (clear) { clear.addEventListener("click", logClearInputs); }
  bindCopy("log-copy", "log-out", "log-msg");
  logGenerate();
}

function initAptGen() {
  var out = bcEl("apt-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = bcEl("apt-run");
  if (run) { run.addEventListener("click", aptGenerate); }
  var clear = bcEl("apt-clear");
  if (clear) { clear.addEventListener("click", aptClearInputs); }
  bindCopy("apt-copy", "apt-out", "apt-msg");
  ["apt-pkg", "apt-ver", "apt-prio", "apt-target"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", aptPinGenerate);
      el.addEventListener("change", aptPinGenerate);
    }
  });
  var pclear = bcEl("apt-pclear");
  if (pclear) { pclear.addEventListener("click", aptPinResetDefaults); }
  bindCopy("apt-pcopy", "apt-pout", "apt-pmsg");
  aptGenerate();
  aptPinGenerate();
}

function initMigGen() {
  var out = bcEl("mig-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["mig-from", "mig-to", "mig-host", "mig-data", "mig-window", "mig-dns"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", migGenerate);
      el.addEventListener("change", migGenerate);
    }
  });
  document.querySelectorAll(".mig-svc").forEach(function (el) {
    el.addEventListener("change", migGenerate);
  });
  var clear = bcEl("mig-clear");
  if (clear) { clear.addEventListener("click", migResetDefaults); }
  bindCopy("mig-copy", "mig-out", "mig-msg");
  migGenerate();
}

function initCurlGen() {
  var out = bcEl("curl-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["curl-url", "curl-method", "curl-ctype", "curl-auth", "curl-token", "curl-buser", "curl-bpass", "curl-headers", "curl-body", "curl-timeout", "curl-retry", "curl-proxy", "curl-k"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", curlGenerate);
      el.addEventListener("change", curlGenerate);
    }
  });
  var clear = bcEl("curl-clear");
  if (clear) { clear.addEventListener("click", curlResetDefaults); }
  bindCopy("curl-copy", "curl-out", "curl-msg");
  curlGenerate();
}

function initSshlogGen() {
  var out = bcEl("sshlog-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = bcEl("sshlog-run");
  if (run) { run.addEventListener("click", sshlogGenerate); }
  var clear = bcEl("sshlog-clear");
  if (clear) { clear.addEventListener("click", sshlogClearInputs); }
  bindCopy("sshlog-copy", "sshlog-out", "sshlog-msg");
  sshlogGenerate();
}

function initGitGen() {
  var out = bcEl("git-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  gitRefreshScenes();
  var cat = bcEl("git-cat");
  if (cat) {
    cat.addEventListener("change", function () { gitRefreshScenes(); gitGenerate(); });
  }
  ["git-scene", "git-branch", "git-remote", "git-force", "git-cmsg", "git-file", "git-tag"].forEach(function (id) {
    var el = bcEl(id);
    if (el) {
      el.addEventListener("input", gitGenerate);
      el.addEventListener("change", gitGenerate);
    }
  });
  var clear = bcEl("git-clear");
  if (clear) { clear.addEventListener("click", gitResetDefaults); }
  bindCopy("git-copy", "git-out", "git-msg");
  gitGenerate();
}

function initExplainGen() {
  var out = bcEl("explain-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = bcEl("explain-run");
  if (run) { run.addEventListener("click", explainGenerate); }
  var txt = bcEl("explain-text");
  if (txt) {
    txt.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); explainGenerate(); }
    });
  }
  var clear = bcEl("explain-clear");
  if (clear) { clear.addEventListener("click", explainClearInputs); }
  bindCopy("explain-copy", "explain-out", "explain-msg");
  explainGenerate();
}

/*
集成清单（集成方在页尾 init 区统一调用以下 init 函数，并各加一行
document$.subscribe(initXxx) 与 document.addEventListener("DOMContentLoaded", initXxx)，
与既有工具的注册方式保持一致）：
  initGhaGen();
  initPlanGen();
  initLogGen();
  initAptGen();
  initMigGen();
  initCurlGen();
  initSshlogGen();
  initGitGen();
  initExplainGen();
依赖页面已有的全局助手 bindCopy / showCopyToast（既有脚本中已定义，本批直接复用，未重复定义）。
本批 generate 函数均为纯前端本地计算，无 fetch/XHR、无 localStorage/cookie。
*/
