/* 批次 D 新增工具 JS：N-01 DNS 解析与记录查询（dns）、N-03 HTTP 响应头与安全分析（hdr）、
   N-09 端口与防火墙规划矩阵（fwm）。集成时把本文件内容粘贴进页尾 <script> 块即可（init 函数名见文件末尾注释）。 */

/* ================= N-01 DNS 解析与记录查询（dns） =================
   本站唯一联网工具：只有用户点「查询」按钮才发 fetch，init 与任何输入变化都不发请求。
   解析/渲染逻辑（dnsInterpret 等纯函数）与 fetch 分离，便于离线测试。 */
var DNS_TYPE_NAMES = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 257: "CAA" };
function dnsIsIpv4(v) {
  var parts = v.split(".");
  if (parts.length !== 4) { return false; }
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) { return false; }
    if (parseInt(parts[i], 10) > 255) { return false; }
  }
  return true;
}
function dnsReverseName(ip) {
  if (dnsIsIpv4(ip)) {
    return ip.split(".").reverse().join(".") + ".in-addr.arpa";
  }
  /* IPv6：展开成 32 个十六进制 nibble 后逐个反转，拼 ip6.arpa */
  var v = ip.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(v) || v.indexOf(":") === -1) { return null; }
  var halves = v.split("::");
  if (halves.length > 2) { return null; }
  var l = halves[0] === "" ? [] : halves[0].split(":");
  var r = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : null;
  var groups;
  if (r === null) {
    if (l.length !== 8) { return null; }
    groups = l;
  } else {
    var miss = 8 - l.length - r.length;
    if (miss < 1) { return null; }
    groups = l.slice();
    for (var i = 0; i < miss; i++) { groups.push("0"); }
    groups = groups.concat(r);
  }
  var nibbles = "";
  for (var j = 0; j < 8; j++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[j])) { return null; }
    var g = groups[j];
    while (g.length < 4) { g = "0" + g; }
    nibbles += g;
  }
  return nibbles.split("").reverse().join(".") + ".ip6.arpa";
}
function dnsValidName(name) {
  if (!name || name.length > 253) { return false; }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) { return false; }
  var labels = name.split(".");
  for (var i = 0; i < labels.length; i++) {
    var lb = labels[i];
    if (!lb || lb.length > 63) { return false; }
    if (lb.charAt(0) === "-" || lb.charAt(lb.length - 1) === "-") { return false; }
  }
  return true;
}
function dnsBuildUrl(provider, qname, qtype) {
  var enc = encodeURIComponent(qname);
  if (provider === "google") {
    return { url: "https://dns.google/resolve?name=" + enc + "&type=" + qtype, headers: {} };
  }
  return { url: "https://cloudflare-dns.com/dns-query?name=" + enc + "&type=" + qtype, headers: { "Accept": "application/dns-json" } };
}
function dnsTxtText(data) {
  /* TXT 的 data 是若干带引号的字符串段，拼起来才是完整文本 */
  if (data.indexOf("\"") === -1) { return data; }
  var segs = data.match(/"([^"]*)"/g);
  if (!segs) { return data; }
  var s = "";
  for (var i = 0; i < segs.length; i++) { s += segs[i].slice(1, -1); }
  return s;
}
function dnsInterpret(resp, qname, qtype, providerLabel) {
  var lines = [];
  lines.push("查询：" + qname + "  类型：" + qtype + "  解析商：" + providerLabel);
  var status = resp.Status;
  var statusNames = { 0: "NoError（正常）", 1: "FormErr（查询格式错误）", 2: "SERVFAIL（解析失败）", 3: "NXDOMAIN（域名不存在）", 5: "REFUSED（解析商拒绝）" };
  lines.push("状态：" + (statusNames[status] || ("未知状态码 " + status)));
  var answers = resp.Answer || [];
  var authority = resp.Authority || [];
  var i, rec;
  if (status === 3) {
    lines.push("");
    lines.push("解读：NXDOMAIN 表示这个名字在 DNS 里根本不存在——不是解析慢，是查无此名。");
    lines.push("排查方向：");
    lines.push("  1. 先查拼写：域名、子域名有没有打错（最常见的原因）；");
    lines.push("  2. 域名是否已注册、是否过期未续费（到注册商后台确认）；");
    lines.push("  3. 子域名记录还没添加，或加在了错误的域名/解析商下面；");
    lines.push("  4. 刚换过 NS 时各地缓存未刷新，等旧 TTL 过期再查。");
    for (i = 0; i < authority.length; i++) {
      if (authority[i].type === 6) { lines.push("权威区 SOA：" + authority[i].data + "（说明父区存在，错多半出在名字本身）"); }
    }
    return lines.join("\n");
  }
  if (status === 2) {
    lines.push("");
    lines.push("解读：SERVFAIL 是解析商这次没能从权威服务器拿到可信答案，不代表域名一定有问题。");
    lines.push("排查方向：");
    lines.push("  1. 换另一个解析商再查一次，两边都 SERVFAIL 才更像权威侧故障；");
    lines.push("  2. 权威 NS 是否可达、是否把域名委派给了已下线的服务器；");
    lines.push("  3. 开了 DNSSEC 时签名过期/DS 记录对不上会让解析商判 bogus 并返回 SERVFAIL，去注册商处核对 DS。");
    return lines.join("\n");
  }
  if (status !== 0) {
    lines.push("");
    lines.push("解读：解析商没有正常应答。可以换另一个解析商对照，仍然异常时优先怀疑权威侧配置或该解析商对这条查询的策略拒绝。");
    return lines.join("\n");
  }
  if (!answers.length) {
    lines.push("");
    lines.push("解读：NoError 但没有 " + qtype + " 记录（NODATA）——名字存在，只是没配这一类记录，这跟 NXDOMAIN 是两回事。");
    for (i = 0; i < authority.length; i++) {
      if (authority[i].type === 6) { lines.push("权威区 SOA：" + authority[i].data); }
    }
    lines.push("排查方向：");
    lines.push("  1. 换个类型对照：查 A 有、查 AAAA 空，通常只是没配 IPv6，不是故障；");
    lines.push("  2. 记录是不是加在了别的子域名上（比如加在 www 上、查的却是根域名）；");
    lines.push("  3. 刚添加的记录等 TTL 过期再查；根域名的 CAA/NS 这类记录要在域名本身上查，不要查 www。");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("记录（名称 / 类型 / TTL / 值）：");
  for (i = 0; i < answers.length; i++) {
    rec = answers[i];
    lines.push("  " + rec.name + "  " + (DNS_TYPE_NAMES[rec.type] || ("TYPE" + rec.type)) + "  " + rec.TTL + "  " + rec.data);
  }
  lines.push("");
  lines.push("解读：");
  /* CNAME 链 */
  var chain = [];
  var lastTarget = null;
  for (i = 0; i < answers.length; i++) {
    if (answers[i].type === 5) {
      chain.push(answers[i].name);
      lastTarget = answers[i].data;
    }
  }
  if (chain.length) {
    chain.push(lastTarget);
    lines.push("  别名链（CNAME 逐级指向）：" + chain.join(" → "));
    var finalHits = [];
    for (i = 0; i < answers.length; i++) {
      if ((answers[i].type === 1 || answers[i].type === 28) && answers[i].name === lastTarget) { finalHits.push(answers[i].data); }
    }
    if (finalHits.length) { lines.push("  链的终点实际解析到：" + finalHits.join("、")); }
    else { lines.push("  注意：本次结果里链的终点没有跟出 A/AAAA 记录（可能只在查 CNAME 时到此为止），排查时顺着终点名字再查一次 A 记录。"); }
  }
  if (qtype === "MX" || answers.some(function (r) { return r.type === 15; })) {
    var mxs = [];
    for (i = 0; i < answers.length; i++) {
      if (answers[i].type === 15) {
        var mm = answers[i].data.match(/^(\d+)\s+(.+)$/);
        if (mm) { mxs.push({ pri: parseInt(mm[1], 10), host: mm[2] }); }
      }
    }
    mxs.sort(function (a, b) { return a.pri - b.pri; });
    if (mxs.length) {
      lines.push("  邮件服务器按优先级（数字越小越先投递）：");
      for (i = 0; i < mxs.length; i++) { lines.push("    优先级 " + mxs[i].pri + "：" + mxs[i].host); }
      lines.push("  收信只看 MX，与 A 记录无关；发信防伪造还要配 SPF/DKIM/DMARC（查 TXT）。");
    }
  }
  var txtNotes = 0;
  for (i = 0; i < answers.length; i++) {
    if (answers[i].type === 16) {
      var t = dnsTxtText(answers[i].data);
      if (/^v=spf1\b/.test(t)) { lines.push("  TXT「" + t.slice(0, 60) + (t.length > 60 ? "…" : "") + "」是 SPF 记录：声明哪些服务器有权以本域名发信，收信方据此判伪造。"); txtNotes++; }
      else if (/^v=DMARC1\b/.test(t)) { lines.push("  这条 TXT 是 DMARC 记录：规定 SPF/DKIM 对不齐时收信方怎么处理（拒收/隔离/仅报告）。"); txtNotes++; }
      else if (/^v=DKIM1\b/.test(t)) { lines.push("  这条 TXT 是 DKIM 公钥：收信方用它验发信签名。"); txtNotes++; }
      else if (/verification|verify/i.test(t)) { lines.push("  这条 TXT 是站点/服务所有权验证串（搜索控制台、邮件服务等要求添加），删了可能触发重新验证。"); txtNotes++; }
    }
  }
  if (qtype === "TXT" && !txtNotes) { lines.push("  TXT 是任意文本记录，最常见用途：域名所有权验证、SPF/DKIM/DMARC 邮件策略；内容看不懂时先别删，多半是某个服务的验证串。"); }
  if (qtype === "CAA") { lines.push("  CAA 规定只有名单里的 CA 才能给本域名签证书；签证书被拒时先来查这里是不是没放行那家 CA。"); }
  if (qtype === "SOA") { lines.push("  SOA 是区域的出生证：主 NS、管理员邮箱（第一个点相当于 @）、序列号（改记录后要递增）、刷新/重试/过期与否定缓存 TTL 都在这一条里。"); }
  if (qtype === "PTR") { lines.push("  PTR 是反查：证明这个 IP 对外声明的主机名。只有再把该主机名正查回同一 IP（FCrDNS 一致）才可信，邮件服务器尤其看重这一点；PTR 一般要在 IP 所属的云厂商/运营商处设置，不在域名解析商那里。"); }
  if (qtype === "NS") { lines.push("  NS 列出的是本域名的权威解析服务器；注册商处填的 NS 与这里查到的不一致时，解析以注册商委派为准，先对齐两边。"); }
  if ((qtype === "A" || qtype === "AAAA") && !chain.length) { lines.push("  值就是该名字当前的服务器地址；刚迁移完服务器时，确认这里已经是新地址再关旧机。"); }
  if (resp.AD) { lines.push("  AD 标记为真：解析商已替你完成 DNSSEC 验证且通过。"); }
  if (resp.TC) { lines.push("  ⚠ 响应被截断（TC），完整结果请用 dig 在本机查询，网页版 DoH 拿到的可能不全。"); }
  return lines.join("\n");
}
function dnsShowErr(msg) {
  var errBox = document.getElementById("dns-err");
  if (!errBox) { return; }
  if (msg) {
    errBox.style.display = "block";
    errBox.textContent = msg;
  } else {
    errBox.style.display = "none";
    errBox.textContent = "";
  }
}
function dnsRun() {
  var out = document.getElementById("dns-out");
  if (!out) { return; }
  var raw = document.getElementById("dns-name").value.trim().replace(/\.$/, "");
  var qtype = document.getElementById("dns-type").value;
  var provider = document.getElementById("dns-provider").value;
  var providerLabel = provider === "google" ? "Google" : "Cloudflare";
  var msgEl = document.getElementById("dns-msg");
  dnsShowErr(null);
  if (!raw) { dnsShowErr("输入有误：先填要查询的域名或 IP。"); return; }
  var qname = raw;
  var note = null;
  var looksIp = dnsIsIpv4(raw) || (/^[0-9A-Fa-f:.]+$/.test(raw) && raw.indexOf(":") !== -1);
  if (looksIp) {
    if (qtype === "PTR") {
      var rev = dnsReverseName(raw);
      if (!rev) { dnsShowErr("输入有误：这个 IP 无法构造反向查询名，请检查 IP 格式。"); return; }
      qname = rev;
      note = "（已按 IP 自动构造反向名：" + rev + "）";
    } else {
      dnsShowErr("输入有误：你填的是 IP 地址。查 IP 反查域名请把记录类型选 PTR；查其它记录请填域名。");
      return;
    }
  } else if (!dnsValidName(raw)) {
    dnsShowErr("输入有误：域名格式不正确（如 example.com，不要带 http:// 与路径）。");
    return;
  }
  if (typeof fetch !== "function") {
    dnsShowErr("查询失败：当前浏览器环境不支持 fetch，无法发出 DoH 请求；请用 dig 命令在本机查：dig +short " + qtype + " " + qname);
    return;
  }
  var req = dnsBuildUrl(provider, qname, qtype);
  if (msgEl) { msgEl.textContent = "查询中…"; }
  out.textContent = "# 正在向 " + providerLabel + " 查询 " + qname + " 的 " + qtype + " 记录…";
  fetch(req.url, { headers: req.headers }).then(function (r) {
    if (!r.ok) { throw new Error("HTTP " + r.status); }
    return r.json();
  }).then(function (resp) {
    if (msgEl) { msgEl.textContent = ""; }
    var text = dnsInterpret(resp, qname, qtype, providerLabel);
    out.textContent = (note ? note + "\n" : "") + text;
  }).catch(function (e) {
    if (msgEl) { msgEl.textContent = ""; }
    out.textContent = "# 查询失败";
    dnsShowErr("查询失败：网络请求未完成（" + (e && e.message ? e.message : "未知错误") + "）。常见原因：断网、当前网络到不了所选解析商、或被网络环境拦截。本站没有拿到任何数据，这与「查无记录」是两回事——可换另一个解析商重试，或在本机用 dig 查：dig +short " + qtype + " " + qname);
  });
}
function initDnsTool() {
  var out = document.getElementById("dns-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  out.textContent = "# 填好域名与记录类型后点「查询」才会发出请求；不点不联网。\n# 查询会把域名发给所选公共解析商，本站服务器不经手、不记录。";
  var run = document.getElementById("dns-run");
  if (run) { run.addEventListener("click", dnsRun); }
  var clear = document.getElementById("dns-clear");
  if (clear) {
    clear.addEventListener("click", function () {
      document.getElementById("dns-name").value = "";
      document.getElementById("dns-msg").textContent = "";
      dnsShowErr(null);
      out.textContent = "# 已清空。填好域名与记录类型后点「查询」。";
    });
  }
  bindCopy("dns-copy", "dns-out", "dns-msg");
}

/* ================= N-03 HTTP 响应头与安全分析（hdr） =================
   纯本地分析，不发任何请求；网址字段只用来拼 curl 命令。 */
var HDR_MAX = 50000;
function hdrParse(text) {
  var result = { statusLine: "", headers: [], cookies: [], junk: 0, blocks: 1 };
  var cut = text;
  var sep = text.indexOf("\r\n\r\n");
  var sep2 = text.indexOf("\n\n");
  var cutAt = -1;
  if (sep !== -1) { cutAt = sep; }
  if (sep2 !== -1 && (cutAt === -1 || sep2 < cutAt)) { cutAt = sep2; }
  if (cutAt !== -1) {
    cut = text.slice(0, cutAt);
    var rest = text.slice(cutAt);
    var m = rest.match(/HTTP\/\d/g);
    if (m) { result.blocks = 1 + m.length; }
  }
  var lines = cut.split(/\r?\n/);
  var last = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) { continue; }
    if (/^HTTP\/\d/.test(line)) { if (!result.statusLine) { result.statusLine = line; } last = null; continue; }
    if (/^[ \t]/.test(line) && last) { last.value += " " + line.trim(); continue; }
    var idx = line.indexOf(":");
    if (idx > 0 && /^[A-Za-z0-9-]+$/.test(line.slice(0, idx))) {
      var item = { name: line.slice(0, idx).toLowerCase(), display: line.slice(0, idx), value: line.slice(idx + 1).trim() };
      result.headers.push(item);
      if (item.name === "set-cookie") { result.cookies.push(item.value); }
      last = item;
    } else {
      result.junk++;
    }
  }
  return result;
}
function hdrGet(parsed, name) {
  for (var i = 0; i < parsed.headers.length; i++) {
    if (parsed.headers[i].name === name) { return parsed.headers[i].value; }
  }
  return null;
}
function hdrCmdUpdate() {
  var cmd = document.getElementById("hdr-cmd");
  if (!cmd) { return; }
  var url = document.getElementById("hdr-url").value.trim();
  if (!url) { cmd.textContent = "curl -sI https://你的域名/"; return; }
  if (/[\s"'`$;|<>\\]/.test(url)) {
    cmd.textContent = "# 网址里含有不适合直接拼进命令的字符（空格/引号/分号等），请手动执行：curl -sI https://你的域名/";
    return;
  }
  cmd.textContent = "curl -sI " + url;
}
function hdrAnalyze() {
  var out = document.getElementById("hdr-out");
  if (!out) { return; }
  var errBox = document.getElementById("hdr-err");
  var raw = document.getElementById("hdr-input").value;
  var urlRaw = document.getElementById("hdr-url").value.trim();
  var scheme = /^https:\/\//i.test(urlRaw) ? "https" : (/^http:\/\//i.test(urlRaw) ? "http" : "unknown");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  if (!raw.trim()) { fail("先把响应头粘贴到文本框，再点「开始分析」。"); return; }
  var truncated = false;
  var text = raw;
  if (text.length > HDR_MAX) { text = text.slice(0, HDR_MAX); truncated = true; }
  var parsed = hdrParse(text);
  if (!parsed.headers.length) { fail("没识别出任何响应头。请粘贴 curl -sI 的完整输出：第一行是 HTTP/… 状态行，其余每行是「头名: 值」。"); return; }
  errBox.style.display = "none";
  var F = [];
  function add(level, title, detail) { F.push({ level: level, title: title, detail: detail }); }
  var hsts = hdrGet(parsed, "strict-transport-security");
  if (scheme === "http") {
    add("提示", "目标网址是明文 HTTP", "HSTS 等安全头只对 HTTPS 生效；本站点当务之急是先上 HTTPS 并把 HTTP 全量跳转过去，再谈响应头加固。");
  } else if (hsts === null) {
    add("警告", "Strict-Transport-Security 未设置", "没有 HSTS 时，用户第一次（或清缓存后）访问仍会先走明文 HTTP，存在被降级/中间人篡改的风险。改法（确认全站 HTTPS 都正常后再加，max-age 先小后大）：\n  Strict-Transport-Security: max-age=63072000; includeSubDomains");
  } else {
    var ma = hsts.match(/max-age\s*=\s*(\d+)/i);
    if (!ma) { add("警告", "Strict-Transport-Security 写法不完整", "HSTS 必须带 max-age 才生效，当前值「" + hsts + "」没有可用的 max-age。改法：Strict-Transport-Security: max-age=63072000; includeSubDomains"); }
    else if (parseInt(ma[1], 10) === 0) { add("警告", "Strict-Transport-Security 被关闭（max-age=0）", "max-age=0 等于明确告诉浏览器停用 HSTS。如果不是在主动下线 HSTS，请改为至少 15552000（180 天）。"); }
    else if (parseInt(ma[1], 10) < 15552000) { add("提示", "Strict-Transport-Security 的 max-age 偏短（" + ma[1] + " 秒）", "建议至少 15552000（180 天），长期稳定后可到 63072000（两年）并考虑 includeSubDomains。当前值适合刚上线 HSTS 的观察期。"); }
    else { add("良好", "Strict-Transport-Security 已设置且时长达标", "max-age=" + ma[1] + (hsts.toLowerCase().indexOf("includesubdomains") !== -1 ? "，含 includeSubDomains" : "") + "。"); }
  }
  var csp = hdrGet(parsed, "content-security-policy");
  var cspRo = hdrGet(parsed, "content-security-policy-report-only");
  if (csp === null && cspRo !== null) {
    add("提示", "CSP 只处于报告模式（Report-Only）", "Content-Security-Policy-Report-Only 只上报不拦截，适合上线前观察；确认报告干净后请切换为正式的 Content-Security-Policy 才会真正生效。");
    csp = cspRo;
  }
  if (csp === null) {
    add("警告", "Content-Security-Policy 未设置", "没有 CSP 时，一旦页面出现 XSS，注入脚本可以畅通无阻地加载与外联。改法（从严起步，按站点实际放行）：\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  } else {
    var cspLow = csp.toLowerCase();
    var scriptPart = cspLow;
    var probs = [];
    if (scriptPart.indexOf("'unsafe-inline'") !== -1) { probs.push("含 'unsafe-inline'，内联脚本被放行，CSP 对 XSS 的防护大打折扣"); }
    if (scriptPart.indexOf("'unsafe-eval'") !== -1) { probs.push("含 'unsafe-eval'，eval 类调用被放行"); }
    if (/(^|[;\s])\*/.test(scriptPart) || /default-src[^;]*\*/.test(scriptPart)) { probs.push("含通配符 *，等于几乎不限制来源"); }
    if (probs.length) { add("警告", "Content-Security-Policy 已设置但放行过宽", probs.join("；") + "。建议改为按域名白名单 + nonce/hash 的写法，并先用 Report-Only 模式验证不误伤。"); }
    else { add("良好", "Content-Security-Policy 已设置且未见明显放行", "未发现 'unsafe-inline' / 'unsafe-eval' / 通配符放行（按整段策略粗查，逐指令细审仍建议人工过一遍）。"); }
  }
  var xcto = hdrGet(parsed, "x-content-type-options");
  if (xcto === null) {
    add("警告", "X-Content-Type-Options 未设置", "缺 nosniff 时浏览器可能把非脚本内容嗅探成脚本执行（老式内容嗅探攻击）。改法：\n  X-Content-Type-Options: nosniff");
  } else if (xcto.toLowerCase() === "nosniff") {
    add("良好", "X-Content-Type-Options: nosniff 已设置", "浏览器会按响应声明的 Content-Type 执行，禁止类型嗅探。");
  } else {
    add("警告", "X-Content-Type-Options 的值不正确", "当前值「" + xcto + "」无效，这个头只有 nosniff 一个合法值。");
  }
  var xfo = hdrGet(parsed, "x-frame-options");
  var hasFa = csp !== null && csp.toLowerCase().indexOf("frame-ancestors") !== -1;
  if (hasFa) {
    add("良好", "防点击劫持已由 CSP frame-ancestors 覆盖", "frame-ancestors 是现代写法，优先级高于 X-Frame-Options，两者有一个生效即可。");
  } else if (xfo !== null) {
    var xv = xfo.toUpperCase();
    if (xv === "DENY" || xv === "SAMEORIGIN") { add("良好", "X-Frame-Options: " + xv + " 已设置", "页面不能（或只能被同源页面）嵌入 iframe，点击劫持面已收住。"); }
    else if (xv.indexOf("ALLOW-FROM") === 0) { add("提示", "X-Frame-Options 使用了已过时的 ALLOW-FROM", "ALLOW-FROM 早已被主流浏览器弃用，实际可能不生效；请改用 CSP 的 frame-ancestors 指定可信来源。"); }
    else { add("提示", "X-Frame-Options 的值不常见", "当前值「" + xfo + "」，标准值只有 DENY / SAMEORIGIN，建议同时补 CSP frame-ancestors。"); }
  } else {
    add("警告", "防点击劫持未设置（X-Frame-Options 与 CSP frame-ancestors 都没有）", "页面可被任意站点用 iframe 嵌套做点击劫持。改法二选一：\n  X-Frame-Options: SAMEORIGIN\n  或在 CSP 中加 frame-ancestors 'self'");
  }
  var rp = hdrGet(parsed, "referrer-policy");
  if (rp === null) {
    add("提示", "Referrer-Policy 未设置", "未设置时按浏览器默认策略，跳转时可能把完整 URL（含路径与参数）带给第三方。改法：\n  Referrer-Policy: strict-origin-when-cross-origin");
  } else if (/unsafe-url/i.test(rp)) {
    add("警告", "Referrer-Policy 为 unsafe-url", "任何跳转都会把完整 URL 发给目标站点，URL 里若带令牌/重置参数就等于泄露。建议改 strict-origin-when-cross-origin。");
  } else if (/^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin|origin|origin-when-cross-origin|no-referrer-when-downgrade)$/i.test(rp.trim())) {
    add("良好", "Referrer-Policy: " + rp + " 已设置", "引荐来源的泄露范围在合理水平。");
  } else {
    add("提示", "Referrer-Policy 的值不常见", "当前值「" + rp + "」，请对照标准取值确认拼写（常见：strict-origin-when-cross-origin）。");
  }
  var pp = hdrGet(parsed, "permissions-policy");
  if (pp === null) {
    add("提示", "Permissions-Policy 未设置", "未声明时页面（含被嵌入的第三方脚本）可调用摄像头/麦克风/地理位置等浏览器能力。改法（按需最小化）：\n  Permissions-Policy: camera=(), microphone=(), geolocation=()");
  } else {
    add("良好", "Permissions-Policy 已设置", "已显式声明浏览器能力边界；请按业务实际需要保持最小放行。");
  }
  var server = hdrGet(parsed, "server");
  if (server !== null) {
    if (/\d+\.\d+/.test(server)) { add("提示", "Server 头暴露了软件与版本号：「" + server + "」", "版本号会帮攻击者对着已知漏洞清单挑目标。改法：Nginx 在 http 段加 server_tokens off;；Apache 用 ServerTokens Prod。"); }
    else { add("提示", "Server 头暴露了软件名：「" + server + "」", "仅软件名危害有限，但能省则省：Nginx server_tokens off 后只剩 nginx 字样，进一步隐藏需改源码/模块，一般做到关版本号即可。"); }
  } else {
    add("良好", "响应头未暴露 Server 信息", "没有从响应头直接泄露服务器软件与版本。");
  }
  var xpb = hdrGet(parsed, "x-powered-by");
  if (xpb !== null) {
    add("提示", "X-Powered-By 暴露了后端技术：「" + xpb + "」", "这类头对浏览器毫无用处，只给攻击者提供指纹。请在框架/语言层关闭（如 PHP 的 expose_php = Off）或在反向代理处删掉该头。");
  }
  if (!parsed.cookies.length) {
    add("提示", "未发现 Set-Cookie", "本次响应没有设置 Cookie，因此没有 Cookie 属性可检查——这不是问题（纯静态站点、无登录态的接口很常见），可忽略本条。");
  }
  for (var ci = 0; ci < parsed.cookies.length; ci++) {
    var ck = parsed.cookies[ci];
    var cname = ck.split("=")[0].trim() || "(未命名)";
    var low = ck.toLowerCase();
    var hasSecure = /(^|;)\s*secure(\s*;|\s*$)/.test(low);
    var hasHttpOnly = /(^|;)\s*httponly(\s*;|\s*$)/.test(low);
    var ssM = low.match(/samesite\s*=\s*(strict|lax|none)/);
    if (ssM && ssM[1] === "none" && !hasSecure) {
      add("严重", "Cookie「" + cname + "」设置了 SameSite=None 却没有 Secure", "SameSite=None 允许跨站携带 Cookie，而没有 Secure 时它会在明文 HTTP 上传输，现代浏览器也会直接拒绝这类 Cookie。改法：给它加上 Secure，或把 SameSite 改为 Lax/Strict。");
    }
    if (!hasSecure) {
      if (scheme === "http") { add("提示", "Cookie「" + cname + "」没有 Secure 属性", "当前站点本身是 HTTP，Cookie 走明文属预期内风险；上 HTTPS 后务必补 Secure。"); }
      else { add("警告", "Cookie「" + cname + "」没有 Secure 属性", "没有 Secure 时 Cookie 可能在明文 HTTP 请求中被发出。改法：Set-Cookie: " + cname + "=…; Secure; HttpOnly; SameSite=Lax"); }
    }
    if (!hasHttpOnly) {
      add("警告", "Cookie「" + cname + "」没有 HttpOnly 属性", "页面脚本可读到这个 Cookie，一旦页面有 XSS，会话令牌会被直接偷走。若它是登录/会话类 Cookie 必须加 HttpOnly；纯前端偏好类 Cookie 可忽略本条。");
    }
    if (!ssM) {
      add("提示", "Cookie「" + cname + "」没有显式 SameSite", "现代浏览器默认按 Lax 处理，但显式写明更可控，也避免老客户端行为不一致。建议 SameSite=Lax（确需跨站携带才用 None 且必须配 Secure）。");
    }
    if (hasSecure && hasHttpOnly && ssM) {
      add("良好", "Cookie「" + cname + "」属性齐全", "Secure / HttpOnly / SameSite 三件套都在。");
    }
  }
  var cc = hdrGet(parsed, "cache-control");
  var ccLow = cc === null ? "" : cc.toLowerCase();
  if (parsed.cookies.length && cc !== null && ccLow.indexOf("no-store") === -1 && ccLow.indexOf("private") === -1 && /public|max-age\s*=\s*[1-9]/.test(ccLow)) {
    add("警告", "带 Set-Cookie 的响应却允许被缓存", "Cache-Control 为「" + cc + "」且响应在下发 Cookie，这类带身份的响应被共享缓存存下可能串号。敏感页面应使用：Cache-Control: no-store（或至少 private）。");
  } else if (cc === null) {
    add("提示", "Cache-Control 未设置", "没声明缓存策略时各代理/CDN 按各自默认行事，行为不可控。静态资源建议 public, max-age=…，动态与敏感页面建议 no-store。");
  } else if (ccLow.indexOf("no-store") !== -1) {
    add("良好", "Cache-Control 含 no-store", "响应不会被缓存落盘，敏感页面正是这样处理。");
  } else {
    add("提示", "Cache-Control 当前为「" + cc + "」", "若这是动态页或带登录态的响应，这个策略偏宽，建议改为 private 或 no-store；若是静态资源则没有问题。");
  }
  var xxsp = hdrGet(parsed, "x-xss-protection");
  if (xxsp !== null) {
    add("提示", "X-XSS-Protection 是已过时的头（当前值「" + xxsp + "」）", "主流浏览器已移除内置 XSS 过滤器，这个头留着无害但别指望它；真正的防线是 CSP 与输出转义。");
  }
  if (parsed.junk > 0) {
    add("提示", "有 " + parsed.junk + " 行没能识别为响应头，已忽略", "可能是粘贴时混入了响应正文或命令回显；结论只基于成功解析的 " + parsed.headers.length + " 个头。混入内容较多时请只贴响应头部分重查。");
  }
  if (parsed.blocks > 1) {
    add("提示", "粘贴内容里有多份响应（像是用 -L 跟了重定向）", "本工具只分析了第一份；每一跳的响应头都应单独过一遍，尤其最终落地页。");
  }
  var order = { "严重": 0, "警告": 1, "提示": 2, "良好": 3 };
  F.sort(function (a, b) { return order[a.level] - order[b.level]; });
  var counts = { "严重": 0, "警告": 0, "提示": 0, "良好": 0 };
  var lines = [];
  if (parsed.statusLine) { lines.push("响应状态行：" + parsed.statusLine); }
  lines.push("共解析 " + parsed.headers.length + " 个响应头，其中 Set-Cookie " + parsed.cookies.length + " 条。");
  if (truncated) { lines.push("⚠ 输入超过 " + HDR_MAX + " 字符，只分析了前 " + HDR_MAX + " 字符，结论可能不完整。"); }
  for (var fi = 0; fi < F.length; fi++) { counts[F[fi].level]++; }
  lines.push("分级汇总：严重 " + counts["严重"] + " 项 / 警告 " + counts["警告"] + " 项 / 提示 " + counts["提示"] + " 项 / 良好 " + counts["良好"] + " 项");
  lines.push("");
  for (var fj = 0; fj < F.length; fj++) {
    lines.push("[" + F[fj].level + "] " + F[fj].title);
    lines.push("  " + F[fj].detail.replace(/\n/g, "\n  "));
    lines.push("");
  }
  lines.push("说明：以上是响应头层面的检查，不等于全站安全结论；同一站点不同路径/登录态的响应头可能不同，请分别抽查。");
  out.textContent = lines.join("\n");
}
function initHdrTool() {
  var out = document.getElementById("hdr-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  out.textContent = "# 先在终端用上面的命令取到响应头，粘贴进来后点「开始分析」。\n# 本工具不发任何网络请求，网址框只用来拼 curl 命令。";
  var url = document.getElementById("hdr-url");
  if (url) {
    url.addEventListener("input", hdrCmdUpdate);
    url.addEventListener("change", hdrCmdUpdate);
  }
  hdrCmdUpdate();
  var run = document.getElementById("hdr-run");
  if (run) { run.addEventListener("click", hdrAnalyze); }
  var clear = document.getElementById("hdr-clear");
  if (clear) {
    clear.addEventListener("click", function () {
      document.getElementById("hdr-input").value = "";
      document.getElementById("hdr-msg").textContent = "";
      var errBox = document.getElementById("hdr-err");
      errBox.style.display = "none";
      errBox.textContent = "";
      out.textContent = "# 已清空。粘贴响应头后点「开始分析」。";
    });
  }
  bindCopy("hdr-copy", "hdr-out", "hdr-msg");
}

/* ================= N-09 端口与防火墙规划矩阵（fwm） ================= */
function fwmParseCidr4(v) {
  var halves = v.split("/");
  if (halves.length !== 2) { return null; }
  var parts = halves[0].split(".");
  if (parts.length !== 4) { return null; }
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i]) || parseInt(parts[i], 10) > 255) { return null; }
  }
  if (!/^\d+$/.test(halves[1])) { return null; }
  var p = parseInt(halves[1], 10);
  if (p > 32) { return null; }
  return { ip: halves[0], prefix: p };
}
function fwmIsIpv4(v) {
  var parts = v.split(".");
  if (parts.length !== 4) { return false; }
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i]) || parseInt(parts[i], 10) > 255) { return false; }
  }
  return true;
}
function fwmPad(s, width) {
  var w = 0;
  for (var i = 0; i < s.length; i++) { w += s.charCodeAt(i) > 127 ? 2 : 1; }
  while (w < width) { s += " "; w++; }
  return s;
}
function fwmGenerate() {
  var out = document.getElementById("fwm-out");
  if (!out) { return; }
  var errBox = document.getElementById("fwm-err");
  var lan = document.getElementById("fwm-lan").value.trim();
  var srcIp = document.getElementById("fwm-ip").value.trim();
  var policy = document.getElementById("fwm-policy").value;
  var cname = document.getElementById("fwm-cname").value.trim();
  var cportRaw = document.getElementById("fwm-cport").value.trim();
  var rows = [
    { id: "ssh", name: "SSH", ports: [22], scope: document.getElementById("fwm-ssh").value, kind: "ssh" },
    { id: "web", name: "HTTP/HTTPS", ports: [80, 443], scope: document.getElementById("fwm-web").value, kind: "web" },
    { id: "mysql", name: "MySQL", ports: [3306], scope: document.getElementById("fwm-mysql").value, kind: "db" },
    { id: "pg", name: "PostgreSQL", ports: [5432], scope: document.getElementById("fwm-pg").value, kind: "db" },
    { id: "redis", name: "Redis", ports: [6379], scope: document.getElementById("fwm-redis").value, kind: "db" },
    { id: "custom", name: cname || "自定义", ports: [], scope: document.getElementById("fwm-custom").value, kind: "custom" }
  ];
  var errs = [];
  var anyLan = rows.some(function (r) { return r.scope === "lan"; });
  var anyIp = rows.some(function (r) { return r.scope === "ip"; });
  var cidr = fwmParseCidr4(lan);
  if (anyLan && !cidr) { errs.push("有服务选了「内网网段」，但内网网段格式不正确（应为 CIDR，如 192.168.1.0/24）"); }
  if (anyIp && !fwmIsIpv4(srcIp)) { errs.push("有服务选了「指定 IP」，但指定来源 IP 格式不正确（应为单个 IPv4，如 203.0.113.10）"); }
  var custom = rows[5];
  var cport = 0;
  if (custom.scope !== "none") {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(cname)) { errs.push("自定义服务名只能含字母、数字、下划线、连字符（1–24 个字符）"); }
    if (!/^\d+$/.test(cportRaw)) { errs.push("自定义端口必须是数字"); }
    else {
      cport = parseInt(cportRaw, 10);
      if (cport < 1 || cport > 65535) { errs.push("自定义端口必须在 1–65535 之间"); }
    }
  }
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  if (cport) { custom.ports = [cport]; }
  function scopeText(r) {
    if (r.scope === "public") { return "公网开放（任意来源）"; }
    if (r.scope === "local") { return "仅本机 127.0.0.1"; }
    if (r.scope === "lan") { return "内网网段 " + lan; }
    if (r.scope === "ip") { return "仅来源 " + srcIp; }
    return "不开放";
  }
  var L = [];
  L.push("一、规划矩阵摘要");
  L.push("  " + fwmPad("服务", 14) + fwmPad("端口", 12) + "访问范围");
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    L.push("  " + fwmPad(r.name, 14) + fwmPad(r.ports.length ? r.ports.join(", ") + "/tcp" : "-", 12) + scopeText(r));
  }
  L.push("  默认入站策略：" + (policy === "deny" ? "deny（推荐）" : "allow（不推荐，见风险清单）"));
  L.push("");
  L.push("二、ufw 命令清单（按顺序执行，顺序本身就是安全要求）");
  L.push("# ===== 第 0 步：先设默认策略 =====");
  L.push("sudo ufw default " + policy + " incoming");
  L.push("sudo ufw default allow outgoing");
  function portCmds(r, isFirst) {
    var cmds = [];
    var p, port;
    if (r.scope === "public") {
      for (p = 0; p < r.ports.length; p++) { cmds.push("sudo ufw allow " + r.ports[p] + "/tcp  # " + r.name + " 公网开放"); }
    } else if (r.scope === "lan") {
      for (p = 0; p < r.ports.length; p++) { cmds.push("sudo ufw allow from " + lan + " to any port " + r.ports[p] + " proto tcp  # " + r.name + " 仅内网网段"); }
    } else if (r.scope === "ip") {
      for (p = 0; p < r.ports.length; p++) { cmds.push("sudo ufw allow from " + srcIp + " to any port " + r.ports[p] + " proto tcp  # " + r.name + " 仅指定来源 IP"); }
    } else if (r.scope === "local") {
      cmds.push("# " + r.name + " 仅本机：不生成放行规则——默认策略 deny 已挡住外部访问；同时务必让服务本身只监听 127.0.0.1，否则改了默认策略就会暴露");
      if (policy === "allow") {
        for (p = 0; p < r.ports.length; p++) { cmds.push("sudo ufw deny in to any port " + r.ports[p] + " proto tcp  # 默认策略是 allow，必须显式拒绝 " + r.name); }
      }
    } else {
      cmds.push("# " + r.name + " 不开放：不生成放行规则" + (policy === "allow" ? "（但默认策略是 allow，下方显式拒绝）" : ""));
      if (policy === "allow") {
        for (p = 0; p < r.ports.length; p++) { port = r.ports[p]; cmds.push("sudo ufw deny in to any port " + port + " proto tcp  # 显式拒绝 " + r.name); }
      }
    }
    return cmds;
  }
  L.push("# ===== 第 1 步：★ 第一条永远先放行 SSH ★ =====");
  L.push("# 先放行 SSH 再 enable，是不把自己锁在门外的铁律；这条没生效前不要执行第 3 步");
  if (rows[0].scope === "none") {
    L.push("# ⚠ 当前规划里 SSH 选了「不开放」：enable 之后将没有任何 SSH 入口，除非有云控制台 / 带外通道，否则不要执行本清单");
  }
  L = L.concat(portCmds(rows[0], true));
  L.push("# ===== 第 2 步：其余服务 =====");
  for (i = 1; i < rows.length; i++) {
    if (rows[i].scope === "none" && rows[i].kind === "custom" && !cport) {
      L.push("# 自定义服务未启用（范围=不开放），跳过");
      continue;
    }
    L = L.concat(portCmds(rows[i], false));
  }
  L.push("# ===== 第 3 步：启用并验证 =====");
  L.push("sudo ufw enable");
  L.push("sudo ufw status verbose");
  L.push("# 保持当前 SSH 会话别关：另开一个终端重新登录一次，确认能进再关旧会话；进不去就用云控制台执行 sudo ufw disable 回滚");
  L.push("");
  L.push("三、风险清单");
  var risks = [];
  for (i = 0; i < rows.length; i++) {
    var rr = rows[i];
    if (rr.kind === "db" && rr.scope === "public") {
      risks.push("✗ [严重] " + rr.name + "（" + rr.ports[0] + "/tcp）对公网开放：数据库/缓存端口是扫描与爆破的头号目标，未授权访问与弱口令事件多出于此。改为仅本机 + SSH 隧道，或至少限定来源 IP，并确保已设强口令（Redis 还要开 requirepass 与 protected-mode）。");
    }
    if (rr.kind === "ssh" && rr.scope === "public") {
      risks.push("⚠ [提示] SSH 公网开放：改用密钥登录并关闭密码登录、装 fail2ban 限速、确认 root 直登策略；把端口从 22 改掉只能减少扫描噪音，本身不是安全措施。");
    }
    if (rr.kind === "ssh" && rr.scope === "none") {
      risks.push("✗ [严重] SSH 规划为不开放：清单执行完就没有远程登录入口了。没有云控制台/VNC 等带外通道时，这等于把自己锁死在服务器外面。");
    }
    if (rr.kind === "ssh" && (rr.scope === "lan" || rr.scope === "ip")) {
      risks.push("✓ SSH 已限定来源范围（" + scopeText(rr) + "），爆破面大幅缩小；仍建议密钥登录。注意来源 IP 变化（家宽换 IP）时先改规则再 enable。");
    }
    if (rr.kind === "web" && rr.scope === "public") {
      risks.push("⚠ [提示] 网站公网开放：确认 80 只做跳转、443 上的是有效证书，并保持 Web 服务与应用及时更新；应用自身的漏洞防火墙挡不住。");
    }
    if (rr.kind === "custom" && rr.scope === "public") {
      risks.push("⚠ [提示] 自定义服务 " + rr.name + "（" + rr.ports[0] + "/tcp）公网开放：确认该服务自带认证、没有默认口令，且有人负责更新。");
    }
    if (rr.scope === "local" && rr.kind !== "custom") {
      risks.push("✓ " + rr.name + " 仅本机：记得落实服务监听地址（mysqld/postgres/redis 的 bind 改 127.0.0.1），防火墙与监听地址两道锁都要在。");
    }
  }
  if (policy === "allow") {
    risks.push("⚠ [警告] 默认入站策略是 allow：规划之外的所有端口默认放行，本矩阵的「不开放 / 仅本机」全靠显式 deny 兜底，漏一条就暴露。强烈建议改回 deny。");
  }
  if (cidr && cidr.prefix <= 8) {
    risks.push("⚠ [警告] 内网网段 " + lan + " 范围过大（/" + cidr.prefix + "），实际接近半个互联网，限定来源的意义所剩无几，请收紧到真实使用的网段。");
  }
  if (!risks.length) { risks.push("✓ 本规划未发现风险项。"); }
  for (i = 0; i < risks.length; i++) { L.push(risks[i]); }
  out.textContent = L.join("\n");
}
function initFwmTool() {
  var out = document.getElementById("fwm-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["fwm-lan", "fwm-ip", "fwm-policy", "fwm-ssh", "fwm-web", "fwm-mysql", "fwm-pg", "fwm-redis", "fwm-cname", "fwm-cport", "fwm-custom"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", fwmGenerate);
      el.addEventListener("change", fwmGenerate);
    }
  });
  var clear = document.getElementById("fwm-clear");
  if (clear) {
    clear.addEventListener("click", function () {
      document.getElementById("fwm-lan").value = "192.168.1.0/24";
      document.getElementById("fwm-ip").value = "203.0.113.10";
      document.getElementById("fwm-policy").value = "deny";
      document.getElementById("fwm-ssh").value = "public";
      document.getElementById("fwm-web").value = "public";
      document.getElementById("fwm-mysql").value = "local";
      document.getElementById("fwm-pg").value = "local";
      document.getElementById("fwm-redis").value = "local";
      document.getElementById("fwm-cname").value = "myapp";
      document.getElementById("fwm-cport").value = "8080";
      document.getElementById("fwm-custom").value = "none";
      document.getElementById("fwm-msg").textContent = "";
      fwmGenerate();
    });
  }
  bindCopy("fwm-copy", "fwm-out", "fwm-msg");
  fwmGenerate();
}

/*
集成清单（集成方在页尾 init 区统一调用以下 init 函数，并各加一行
document$.subscribe(initXxx) 与 document.addEventListener("DOMContentLoaded", initXxx)，
与既有工具的注册方式保持一致）：
  initDnsTool();
  initHdrTool();
  initFwmTool();
依赖页面已有的全局助手 bindCopy / showCopyToast（既有脚本中已定义，本批直接复用，未重复定义）。
联网边界：仅 dns 在用户点击「查询」按钮后 fetch 所选公共解析商的 DoH 接口；hdr / fwm 无任何网络请求。
*/
