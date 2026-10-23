// ===== 批次 A 新增工具（N-04 格式校验与转换 / N-26 配置差异比较器 /
// ===== N-16 cloud-init 生成器 / N-06 SSH 服务端配置 / N-08 systemd Timer）=====
// 风格与本页既有脚本一致：ES5、var/function、输出一律 textContent。

// ---------- N-04 格式校验与转换（fmt） ----------
// YAML 子集：块级映射/序列、标量、引号、注释、简单流式集合。
// 不支持锚点/别名、合并键、多行块标量、多文档、标签——遇到明确报错。

function fmtYamlStripComment(s) {
  var inS = false, inD = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inD) {
      if (c === "\\") { i++; }
      else if (c === "\"") { inD = false; }
    } else if (inS) {
      if (c === "'") {
        if (s.charAt(i + 1) === "'") { i++; } else { inS = false; }
      }
    } else if (c === "\"") { inD = true; }
    else if (c === "'") { inS = true; }
    else if (c === "#" && (i === 0 || s.charAt(i - 1) === " " || s.charAt(i - 1) === "\t")) {
      return s.slice(0, i);
    }
  }
  return s;
}

function fmtYamlScalar(s, no) {
  if (s === "") { return null; }
  var c0 = s.charAt(0);
  if (c0 === "&" || c0 === "*") {
    throw new Error("第 " + no + " 行：YAML 子集不支持锚点与别名（& / *），请把锚点展开成普通写法");
  }
  if (c0 === "|" || c0 === ">") {
    throw new Error("第 " + no + " 行：YAML 子集不支持多行块标量（| / >），请改成一行字符串或用引号写 \\n");
  }
  if (c0 === "!") {
    throw new Error("第 " + no + " 行：YAML 子集不支持标签（! 开头），请删掉标签只留值");
  }
  if (c0 === "'") {
    if (s.length < 2 || s.charAt(s.length - 1) !== "'") {
      throw new Error("第 " + no + " 行：单引号字符串没有闭合");
    }
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (c0 === "\"") {
    try { return JSON.parse(s); }
    catch (e) { throw new Error("第 " + no + " 行：双引号字符串格式错误（" + e.message + "）"); }
  }
  if (/:\s/.test(s) || s.charAt(s.length - 1) === ":") {
    throw new Error("第 " + no + " 行：普通标量里出现冒号加空格，YAML 会把它当成映射——请给这个值加引号");
  }
  if (/^(null|Null|NULL|~)$/.test(s)) { return null; }
  if (/^(true|True|TRUE)$/.test(s)) { return true; }
  if (/^(false|False|FALSE)$/.test(s)) { return false; }
  if (/^[-+]?\d+$/.test(s)) { return parseInt(s, 10); }
  if (/^0x[0-9a-fA-F]+$/.test(s)) { return parseInt(s, 16); }
  if (/^0o[0-7]+$/.test(s)) { return parseInt(s.slice(2), 8); }
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)$/.test(s) || /^[-+]?(\d+\.\d*|\.\d+)$/.test(s)) {
    return parseFloat(s);
  }
  if (/^\.(inf|Inf|INF)$/.test(s)) { return Infinity; }
  if (/^-\.(inf|Inf|INF)$/.test(s)) { return -Infinity; }
  if (/^\.(nan|NaN|NAN)$/.test(s)) { return NaN; }
  return s;
}

// 在 depth 0 处找 ": " 或行尾 ":"，返回 {key, rest} 或 null（引号与括号内不算）
function fmtYamlSplitKey(content) {
  var inS = false, inD = false, depth = 0;
  for (var i = 0; i < content.length; i++) {
    var c = content.charAt(i);
    if (inD) {
      if (c === "\\") { i++; }
      else if (c === "\"") { inD = false; }
      continue;
    }
    if (inS) {
      if (c === "'") {
        if (content.charAt(i + 1) === "'") { i++; } else { inS = false; }
      }
      continue;
    }
    if (c === "\"") { inD = true; }
    else if (c === "'") { inS = true; }
    else if (c === "[" || c === "{") { depth++; }
    else if (c === "]" || c === "}") { depth--; }
    else if (c === ":" && depth === 0) {
      if (i === content.length - 1) {
        return { key: content.slice(0, i), rest: "" };
      }
      if (content.charAt(i + 1) === " ") {
        return { key: content.slice(0, i), rest: content.slice(i + 2) };
      }
    }
  }
  return null;
}

// 流式集合的游标解析：[a, b] / {k: v} / 标量
function fmtYamlFlow(s, st, no) {
  function skipWs() { while (st.i < s.length && (s.charAt(st.i) === " " || s.charAt(st.i) === "\t")) { st.i++; } }
  skipWs();
  if (st.i >= s.length) { throw new Error("第 " + no + " 行：流式集合不完整"); }
  var c = s.charAt(st.i);
  if (c === "[") {
    st.i++;
    var arr = [];
    skipWs();
    if (s.charAt(st.i) === "]") { st.i++; return arr; }
    while (true) {
      arr.push(fmtYamlFlow(s, st, no));
      skipWs();
      var d = s.charAt(st.i);
      if (d === ",") { st.i++; continue; }
      if (d === "]") { st.i++; return arr; }
      throw new Error("第 " + no + " 行：流式序列里期望 , 或 ]");
    }
  }
  if (c === "{") {
    st.i++;
    var obj = {};
    skipWs();
    if (s.charAt(st.i) === "}") { st.i++; return obj; }
    while (true) {
      skipWs();
      var kst = { i: st.i };
      var k = fmtYamlFlow(s, kst, no);
      st.i = kst.i;
      skipWs();
      if (s.charAt(st.i) !== ":") { throw new Error("第 " + no + " 行：流式映射里键后面缺冒号"); }
      st.i++;
      var v = fmtYamlFlow(s, st, no);
      obj[String(k)] = v;
      skipWs();
      var d2 = s.charAt(st.i);
      if (d2 === ",") { st.i++; continue; }
      if (d2 === "}") { st.i++; return obj; }
      throw new Error("第 " + no + " 行：流式映射里期望 , 或 }");
    }
  }
  if (c === "'" || c === "\"") {
    // 引号标量：找闭合引号
    var j = st.i + 1;
    if (c === "'") {
      while (j < s.length) {
        if (s.charAt(j) === "'") {
          if (s.charAt(j + 1) === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
    } else {
      while (j < s.length) {
        if (s.charAt(j) === "\\") { j += 2; continue; }
        if (s.charAt(j) === "\"") { break; }
        j++;
      }
    }
    if (j >= s.length) { throw new Error("第 " + no + " 行：流式集合里的引号没有闭合"); }
    var qs = s.slice(st.i, j + 1);
    st.i = j + 1;
    return fmtYamlScalar(qs, no);
  }
  // 普通标量：读到 , ] } 或（映射值语境外）: 为止
  var start = st.i;
  while (st.i < s.length) {
    var ch = s.charAt(st.i);
    if (ch === "," || ch === "]" || ch === "}") { break; }
    if (ch === ":" && (st.i + 1 >= s.length || s.charAt(st.i + 1) === " " || s.charAt(st.i + 1) === "," || s.charAt(st.i + 1) === "}")) { break; }
    st.i++;
  }
  var raw = s.slice(start, st.i).replace(/\s+$/, "");
  if (raw === "") { throw new Error("第 " + no + " 行：流式集合里有空值"); }
  return fmtYamlScalar(raw, no);
}

function fmtYamlInline(s, no) {
  var t = s.replace(/^\s+/, "");
  var c0 = t.charAt(0);
  if (c0 === "[" || c0 === "{") {
    var st = { i: 0 };
    var v = fmtYamlFlow(t, st, no);
    var rest = t.slice(st.i).replace(/\s+$/, "");
    if (rest) { throw new Error("第 " + no + " 行：流式集合后面还有多余内容"); }
    return v;
  }
  return fmtYamlScalar(t, no);
}

function fmtYamlIsSeqLine(content) {
  return content === "-" || content.indexOf("- ") === 0;
}

function fmtYamlBlock(lines, pos, indent) {
  var ln = lines[pos.i];
  if (fmtYamlIsSeqLine(ln.content)) { return fmtYamlSeq(lines, pos, indent); }
  if (fmtYamlSplitKey(ln.content)) { return fmtYamlMap(lines, pos, indent); }
  pos.i++;
  return fmtYamlScalar(ln.content, ln.no);
}

function fmtYamlSeq(lines, pos, indent) {
  var arr = [];
  while (pos.i < lines.length) {
    var ln = lines[pos.i];
    if (ln.indent !== indent || !fmtYamlIsSeqLine(ln.content)) { break; }
    var rest = ln.content === "-" ? "" : ln.content.slice(2);
    if (rest === "") {
      pos.i++;
      if (pos.i < lines.length && lines[pos.i].indent > indent) {
        arr.push(fmtYamlBlock(lines, pos, lines[pos.i].indent));
      } else { arr.push(null); }
    } else {
      // 把 "- 内容" 与其后续更深缩进行组装成虚拟块再解析
      var sub = [{ indent: indent + 2, content: rest, no: ln.no }];
      pos.i++;
      while (pos.i < lines.length && lines[pos.i].indent > indent) {
        sub.push(lines[pos.i]);
        pos.i++;
      }
      var sp = { i: 0 };
      var item = fmtYamlBlock(sub, sp, indent + 2);
      if (sp.i < sub.length) {
        throw new Error("第 " + sub[sp.i].no + " 行：缩进与序列项对不齐，无法解析");
      }
      arr.push(item);
    }
  }
  return arr;
}

function fmtYamlMap(lines, pos, indent) {
  var obj = {};
  var seen = {};
  while (pos.i < lines.length) {
    var ln = lines[pos.i];
    if (ln.indent !== indent || fmtYamlIsSeqLine(ln.content)) { break; }
    var kv = fmtYamlSplitKey(ln.content);
    if (!kv) { break; }
    if (kv.key.replace(/\s+$/, "") === "<<") {
      throw new Error("第 " + ln.no + " 行：YAML 子集不支持合并键 <<，请把被合并的内容展开写全");
    }
    var key = fmtYamlScalar(kv.key.replace(/\s+$/, ""), ln.no);
    if (typeof key !== "string" && typeof key !== "number") {
      throw new Error("第 " + ln.no + " 行：映射的键必须是字符串或数字");
    }
    key = String(key);
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      throw new Error("第 " + ln.no + " 行：键「" + key + "」重复定义");
    }
    seen[key] = true;
    pos.i++;
    if (kv.rest !== "") {
      obj[key] = fmtYamlInline(kv.rest, ln.no);
    } else if (pos.i < lines.length && lines[pos.i].indent > indent) {
      obj[key] = fmtYamlBlock(lines, pos, lines[pos.i].indent);
    } else if (pos.i < lines.length && lines[pos.i].indent === indent && fmtYamlIsSeqLine(lines[pos.i].content)) {
      obj[key] = fmtYamlSeq(lines, pos, indent);
    } else {
      obj[key] = null;
    }
  }
  return obj;
}

function fmtYamlParse(text) {
  var rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  var lines = [];
  var docStartSeen = false;
  for (var i = 0; i < rawLines.length; i++) {
    var raw = rawLines[i];
    if (/^\s*$/.test(raw)) { continue; }
    var stripped = raw.replace(/^\s+/, "");
    if (stripped.charAt(0) === "#") { continue; }
    var lead = raw.slice(0, raw.length - stripped.length);
    if (lead.indexOf("\t") !== -1) {
      throw new Error("第 " + (i + 1) + " 行：缩进里混有 Tab，YAML 要求只用空格缩进");
    }
    var content = fmtYamlStripComment(stripped).replace(/\s+$/, "");
    if (!content) { continue; }
    if (content === "---") {
      if (lines.length === 0 && !docStartSeen) { docStartSeen = true; continue; }
      throw new Error("第 " + (i + 1) + " 行：YAML 子集不支持多文档（--- 分隔的第二份文档），请只粘一份");
    }
    if (content === "...") { continue; }
    if (content.charAt(0) === "%") {
      throw new Error("第 " + (i + 1) + " 行：YAML 子集不支持 % 指令行");
    }
    lines.push({ indent: lead.length, content: content, no: i + 1 });
  }
  if (!lines.length) { return null; }
  var pos = { i: 0 };
  var v = fmtYamlBlock(lines, pos, lines[0].indent);
  if (pos.i < lines.length) {
    throw new Error("第 " + lines[pos.i].no + " 行：缩进与上下文对不齐，无法解析（常见原因：少缩进一级或混用了空格数）");
  }
  return v;
}

function fmtYamlNeedsQuote(s) {
  if (s === "") { return true; }
  if (/^(null|Null|NULL|~|true|True|TRUE|false|False|FALSE)$/.test(s)) { return true; }
  if (/^[-+]?\d+$/.test(s) || /^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) { return true; }
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) { return true; }
  if (/^\.(inf|nan)/i.test(s)) { return true; }
  if (/^\s|\s$/.test(s)) { return true; }
  if (/[:#\{\}\[\],&*!|>'"%@`]/.test(s)) { return true; }
  if (s === "-" || s === "?" || s === ":" || s.indexOf("- ") === 0 || s.indexOf("? ") === 0) { return true; }
  return false;
}

function fmtYamlScalarOut(v) {
  if (v === null || v === undefined) { return "null"; }
  if (v === true) { return "true"; }
  if (v === false) { return "false"; }
  if (typeof v === "number") {
    if (v !== v) { return ".nan"; }
    if (v === Infinity) { return ".inf"; }
    if (v === -Infinity) { return "-.inf"; }
    return String(v);
  }
  var s = String(v);
  if (/[\n\r\t]/.test(s) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) {
    return JSON.stringify(s);
  }
  if (fmtYamlNeedsQuote(s)) {
    if (s.indexOf("\"") !== -1 || s.indexOf("\\") !== -1) { return JSON.stringify(s); }
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return s;
}

function fmtYamlIsScalar(v) {
  return v === null || v === undefined || typeof v !== "object";
}

function fmtYamlEmit(v, ind, out) {
  if (fmtYamlIsScalar(v)) { out.push(ind + fmtYamlScalarOut(v)); return; }
  var i, k;
  if (Object.prototype.toString.call(v) === "[object Array]") {
    if (!v.length) { out.push(ind + "[]"); return; }
    for (i = 0; i < v.length; i++) {
      var item = v[i];
      if (fmtYamlIsScalar(item)) { out.push(ind + "- " + fmtYamlScalarOut(item)); }
      else if ((Object.prototype.toString.call(item) === "[object Array]" && !item.length) ||
               (Object.prototype.toString.call(item) === "[object Object]" && !Object.keys(item).length)) {
        out.push(ind + "- " + (Object.prototype.toString.call(item) === "[object Array]" ? "[]" : "{}"));
      } else {
        var sub = [];
        fmtYamlEmit(item, ind + "  ", sub);
        sub[0] = ind + "- " + sub[0].slice(ind.length + 2);
        for (var j = 0; j < sub.length; j++) { out.push(sub[j]); }
      }
    }
    return;
  }
  var keys = Object.keys(v);
  if (!keys.length) { out.push(ind + "{}"); return; }
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    var val = v[k];
    var head = ind + fmtYamlScalarOut(k) + ":";
    if (fmtYamlIsScalar(val)) { out.push(head + " " + fmtYamlScalarOut(val)); }
    else if (Object.prototype.toString.call(val) === "[object Array]" && !val.length) { out.push(head + " []"); }
    else if (Object.prototype.toString.call(val) === "[object Object]" && !Object.keys(val).length) { out.push(head + " {}"); }
    else { out.push(head); fmtYamlEmit(val, ind + "  ", out); }
  }
}

function fmtYamlStringify(v) {
  var out = [];
  fmtYamlEmit(v, "", out);
  return out.join("\n");
}

// ---------- fmt：TOML 子集 ----------
// 支持键值、点号键、[节]、基本类型、数组（可跨行）、行内单行内联表、注释。
// 不支持数组表 [[...]] 与多行字符串，遇到明确报错。
// 日期时间解析为 { __fmtTomlRaw: 原文 } 包装：转 JSON/YAML 时解包成字符串，转回 TOML 时原样输出。

function fmtTomlStripComment(s) {
  var inB = false, inL = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inB) {
      if (c === "\\") { i++; }
      else if (c === "\"") { inB = false; }
    } else if (inL) {
      if (c === "'") { inL = false; }
    } else if (c === "\"") { inB = true; }
    else if (c === "'") { inL = true; }
    else if (c === "#") { return s.slice(0, i); }
  }
  return s;
}

// 统计未闭合的 [ { 深度（字符串内不算），用于把跨行数组拼回一行
function fmtTomlDepth(s) {
  var inB = false, inL = false, depth = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inB) {
      if (c === "\\") { i++; }
      else if (c === "\"") { inB = false; }
    } else if (inL) {
      if (c === "'") { inL = false; }
    } else if (c === "\"") { inB = true; }
    else if (c === "'") { inL = true; }
    else if (c === "[" || c === "{") { depth++; }
    else if (c === "]" || c === "}") { depth--; }
  }
  return depth;
}

function fmtTomlKeyPath(s, no) {
  var parts = [];
  var cur = "";
  var inB = false, inL = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inB) {
      cur += c;
      if (c === "\\") { cur += s.charAt(i + 1) || ""; i++; }
      else if (c === "\"") { inB = false; }
      continue;
    }
    if (inL) {
      cur += c;
      if (c === "'") { inL = false; }
      continue;
    }
    if (c === "\"") { inB = true; cur += c; continue; }
    if (c === "'") { inL = true; cur += c; continue; }
    if (c === ".") { parts.push(cur.replace(/^\s+|\s+$/g, "")); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur.replace(/^\s+|\s+$/g, ""));
  var res = [];
  for (var j = 0; j < parts.length; j++) {
    var p = parts[j];
    if (!p) { throw new Error("第 " + no + " 行：键名里有空段"); }
    if (p.charAt(0) === "\"" && p.charAt(p.length - 1) === "\"") {
      try { res.push(JSON.parse(p)); }
      catch (e) { throw new Error("第 " + no + " 行：引号键名格式错误"); }
    } else if (p.charAt(0) === "'" && p.charAt(p.length - 1) === "'") {
      res.push(p.slice(1, -1));
    } else if (/^[A-Za-z0-9_-]+$/.test(p)) {
      res.push(p);
    } else {
      throw new Error("第 " + no + " 行：键名「" + p + "」含非法字符（裸键只允许字母、数字、下划线、连字符，其余请加引号）");
    }
  }
  return res;
}

function fmtTomlValue(s, st, no) {
  while (st.i < s.length && /\s/.test(s.charAt(st.i))) { st.i++; }
  if (st.i >= s.length) { throw new Error("第 " + no + " 行：值缺失"); }
  var c = s.charAt(st.i);
  var k;
  if (c === "\"") {
    var j = st.i + 1;
    var out = "";
    while (j < s.length) {
      var ch = s.charAt(j);
      if (ch === "\\") {
        var nx = s.charAt(j + 1);
        if (nx === "n") { out += "\n"; j += 2; }
        else if (nx === "t") { out += "\t"; j += 2; }
        else if (nx === "r") { out += "\r"; j += 2; }
        else if (nx === "\"") { out += "\""; j += 2; }
        else if (nx === "\\") { out += "\\"; j += 2; }
        else if (nx === "b") { out += "\b"; j += 2; }
        else if (nx === "f") { out += "\f"; j += 2; }
        else if (nx === "u") { out += String.fromCharCode(parseInt(s.substr(j + 2, 4), 16)); j += 6; }
        else if (nx === "U") { out += String.fromCodePoint(parseInt(s.substr(j + 2, 8), 16)); j += 10; }
        else { throw new Error("第 " + no + " 行：不支持的转义 \\" + nx); }
        continue;
      }
      if (ch === "\"") { st.i = j + 1; return out; }
      out += ch;
      j++;
    }
    throw new Error("第 " + no + " 行：字符串没有闭合");
  }
  if (c === "'") {
    var e = s.indexOf("'", st.i + 1);
    if (e === -1) { throw new Error("第 " + no + " 行：字面字符串没有闭合"); }
    var lit = s.slice(st.i + 1, e);
    st.i = e + 1;
    return lit;
  }
  if (c === "[") {
    st.i++;
    var arr = [];
    while (true) {
      while (st.i < s.length && /\s/.test(s.charAt(st.i))) { st.i++; }
      if (st.i >= s.length) { throw new Error("第 " + no + " 行：数组没有闭合"); }
      if (s.charAt(st.i) === "]") { st.i++; return arr; }
      arr.push(fmtTomlValue(s, st, no));
      while (st.i < s.length && /\s/.test(s.charAt(st.i))) { st.i++; }
      if (s.charAt(st.i) === ",") { st.i++; continue; }
      if (s.charAt(st.i) === "]") { st.i++; return arr; }
      throw new Error("第 " + no + " 行：数组里期望 , 或 ]");
    }
  }
  if (c === "{") {
    st.i++;
    var tbl = {};
    while (true) {
      while (st.i < s.length && (s.charAt(st.i) === " " || s.charAt(st.i) === "\t")) { st.i++; }
      if (st.i >= s.length) { throw new Error("第 " + no + " 行：内联表没有闭合"); }
      if (s.charAt(st.i) === "}") { st.i++; return tbl; }
      // 读键（到 = 为止）
      var ks = st.i;
      var inB = false, inL = false;
      while (st.i < s.length) {
        var cc = s.charAt(st.i);
        if (inB) { if (cc === "\\") { st.i++; } else if (cc === "\"") { inB = false; } }
        else if (inL) { if (cc === "'") { inL = false; } }
        else if (cc === "\"") { inB = true; }
        else if (cc === "'") { inL = true; }
        else if (cc === "=") { break; }
        st.i++;
      }
      if (st.i >= s.length) { throw new Error("第 " + no + " 行：内联表里的键后面缺 ="); }
      var kpath = fmtTomlKeyPath(s.slice(ks, st.i), no);
      st.i++; // 跳过 =
      var val = fmtTomlValue(s, st, no);
      var tgt = tbl;
      for (k = 0; k < kpath.length - 1; k++) {
        if (typeof tgt[kpath[k]] !== "object" || tgt[kpath[k]] === null) { tgt[kpath[k]] = {}; }
        tgt = tgt[kpath[k]];
      }
      if (Object.prototype.hasOwnProperty.call(tgt, kpath[kpath.length - 1])) {
        throw new Error("第 " + no + " 行：内联表里键「" + kpath.join(".") + "」重复");
      }
      tgt[kpath[kpath.length - 1]] = val;
      while (st.i < s.length && (s.charAt(st.i) === " " || s.charAt(st.i) === "\t")) { st.i++; }
      if (s.charAt(st.i) === ",") { st.i++; continue; }
      if (s.charAt(st.i) === "}") { st.i++; return tbl; }
      throw new Error("第 " + no + " 行：内联表里期望 , 或 }");
    }
  }
  // 裸标记：读到 , ] } 或空白加分隔符为止
  var start = st.i;
  while (st.i < s.length) {
    var t = s.charAt(st.i);
    if (t === "," || t === "]" || t === "}") { break; }
    st.i++;
  }
  var tok = s.slice(start, st.i).replace(/\s+$/, "");
  if (!tok) { throw new Error("第 " + no + " 行：值缺失"); }
  if (tok === "true") { return true; }
  if (tok === "false") { return false; }
  if (/^\d{4}-\d{2}-\d{2}([Tt ])\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/.test(tok) ||
      /^\d{4}-\d{2}-\d{2}$/.test(tok) ||
      /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(tok)) {
    return { __fmtTomlRaw: tok };
  }
  var num = tok.replace(/_/g, "");
  if (/^0x[0-9a-fA-F]+$/.test(num)) { return parseInt(num, 16); }
  if (/^0o[0-7]+$/.test(num)) { return parseInt(num.slice(2), 8); }
  if (/^0b[01]+$/.test(num)) { return parseInt(num.slice(2), 2); }
  if (/^[+-]?\d+$/.test(num)) { return parseInt(num, 10); }
  if (/^[+-]?(\d+\.\d+|\d+(\.\d+)?)([eE][+-]?\d+)$/.test(num) || /^[+-]?\d+\.\d+$/.test(num)) {
    return parseFloat(num);
  }
  if (tok === "inf" || tok === "+inf") { return Infinity; }
  if (tok === "-inf") { return -Infinity; }
  if (tok === "nan" || tok === "+nan" || tok === "-nan") { return NaN; }
  throw new Error("第 " + no + " 行：无法识别的值「" + tok + "」（字符串请加引号）");
}

function fmtTomlParse(text) {
  var rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  var root = {};
  var current = root;
  var currentPath = [];
  var definedTables = { "": true };
  function resolveTable(path, no, create) {
    var node = root;
    for (var i = 0; i < path.length; i++) {
      var ex = node[path[i]];
      if (ex === undefined) {
        if (!create) { return null; }
        ex = {};
        node[path[i]] = ex;
      }
      if (typeof ex !== "object" || ex === null || Object.prototype.toString.call(ex) === "[object Array]" || ex.__fmtTomlRaw !== undefined) {
        throw new Error("第 " + no + " 行：节路径与已有键冲突（「" + path.join(".") + "」）");
      }
      node = ex;
    }
    return node;
  }
  for (var li = 0; li < rawLines.length; li++) {
    var no = li + 1;
    var line = fmtTomlStripComment(rawLines[li]).replace(/^\s+|\s+$/g, "");
    if (!line) { continue; }
    if (line.indexOf("\"\"\"") !== -1 || line.indexOf("'''") !== -1) {
      throw new Error("第 " + no + " 行：TOML 子集不支持多行字符串（\"\"\" / '''），请改成一行并用 \\n 转义");
    }
    if (line.charAt(0) === "[") {
      if (line.indexOf("[[") === 0) {
        throw new Error("第 " + no + " 行：TOML 子集不支持数组表 [[...]]，请改用数组或普通节");
      }
      if (line.charAt(line.length - 1) !== "]") {
        throw new Error("第 " + no + " 行：节头缺右方括号 ]");
      }
      var path = fmtTomlKeyPath(line.slice(1, -1), no);
      var pkey = path.join("\u0001");
      if (definedTables[pkey]) {
        throw new Error("第 " + no + " 行：节 [" + path.join(".") + "] 重复定义");
      }
      definedTables[pkey] = true;
      current = resolveTable(path, no, true);
      currentPath = path;
      continue;
    }
    // 键 = 值：找引号外的第一个 =
    var eq = -1, inB = false, inL = false;
    for (var q = 0; q < line.length; q++) {
      var qc = line.charAt(q);
      if (inB) { if (qc === "\\") { q++; } else if (qc === "\"") { inB = false; } }
      else if (inL) { if (qc === "'") { inL = false; } }
      else if (qc === "\"") { inB = true; }
      else if (qc === "'") { inL = true; }
      else if (qc === "=") { eq = q; break; }
    }
    if (eq === -1) { throw new Error("第 " + no + " 行：不是 节头 也不是 键 = 值，无法解析"); }
    var kpath = fmtTomlKeyPath(line.slice(0, eq), no);
    var vstr = line.slice(eq + 1).replace(/^\s+/, "");
    if (!vstr) { throw new Error("第 " + no + " 行：等号后面缺值"); }
    var startsInlineTable = vstr.charAt(0) === "{";
    // 跨行数组拼接（内联表不许跨行）
    while (fmtTomlDepth(vstr) > 0 && li + 1 < rawLines.length) {
      li++;
      vstr += "\n" + fmtTomlStripComment(rawLines[li]).replace(/^\s+|\s+$/g, "");
    }
    if (fmtTomlDepth(vstr) > 0) { throw new Error("第 " + no + " 行：数组 / 内联表没有闭合"); }
    if (startsInlineTable && vstr.indexOf("\n") !== -1) {
      throw new Error("第 " + no + " 行：内联表必须写在一行内（TOML 子集限制）");
    }
    var st = { i: 0 };
    var val = fmtTomlValue(vstr, st, no);
    while (st.i < vstr.length && /\s/.test(vstr.charAt(st.i))) { st.i++; }
    if (st.i < vstr.length) { throw new Error("第 " + no + " 行：值后面有多余内容「" + vstr.slice(st.i) + "」"); }
    var tgt = current;
    for (var k = 0; k < kpath.length - 1; k++) {
      if (tgt[kpath[k]] === undefined) { tgt[kpath[k]] = {}; }
      if (typeof tgt[kpath[k]] !== "object" || tgt[kpath[k]] === null || tgt[kpath[k]].__fmtTomlRaw !== undefined) {
        throw new Error("第 " + no + " 行：点号键与已有值冲突（「" + kpath.join(".") + "」）");
      }
      tgt = tgt[kpath[k]];
    }
    var lastKey = kpath[kpath.length - 1];
    if (Object.prototype.hasOwnProperty.call(tgt, lastKey)) {
      throw new Error("第 " + no + " 行：键「" + (currentPath.concat(kpath).join(".")) + "」重复定义");
    }
    tgt[lastKey] = val;
  }
  return root;
}

function fmtTomlKeyOut(k) {
  if (/^[A-Za-z0-9_-]+$/.test(k)) { return k; }
  return JSON.stringify(k);
}

function fmtTomlValueOut(v, label) {
  if (v === null || v === undefined) {
    throw new Error("键「" + label + "」的值是 null，TOML 没有 null，无法转换：请先把该键删掉或改成空字符串");
  }
  if (typeof v === "object" && v.__fmtTomlRaw !== undefined) { return v.__fmtTomlRaw; }
  if (typeof v === "string") { return JSON.stringify(v); }
  if (typeof v === "boolean") { return v ? "true" : "false"; }
  if (typeof v === "number") {
    if (v !== v) { return "nan"; }
    if (v === Infinity) { return "inf"; }
    if (v === -Infinity) { return "-inf"; }
    if (Math.floor(v) === v && Math.abs(v) < 1e15) { return String(v); }
    var fs = String(v);
    if (!/[.eE]/.test(fs)) { fs += ".0"; }
    return fs;
  }
  if (Object.prototype.toString.call(v) === "[object Array]") {
    var parts = [];
    for (var i = 0; i < v.length; i++) { parts.push(fmtTomlValueOut(v[i], label)); }
    return "[" + parts.join(", ") + "]";
  }
  // 内联表
  var ks = Object.keys(v);
  var ps = [];
  for (var j = 0; j < ks.length; j++) {
    ps.push(fmtTomlKeyOut(ks[j]) + " = " + fmtTomlValueOut(v[ks[j]], label + "." + ks[j]));
  }
  return "{ " + ps.join(", ") + " }";
}

function fmtTomlIsTable(v) {
  return typeof v === "object" && v !== null && v.__fmtTomlRaw === undefined &&
    Object.prototype.toString.call(v) === "[object Object]";
}

function fmtTomlIsTableArray(v) {
  if (Object.prototype.toString.call(v) !== "[object Array]" || !v.length) { return false; }
  for (var i = 0; i < v.length; i++) { if (!fmtTomlIsTable(v[i])) { return false; } }
  return true;
}

function fmtTomlEmitTable(tbl, path, out) {
  var keys = Object.keys(tbl);
  var i, k;
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (!fmtTomlIsTable(tbl[k]) && !fmtTomlIsTableArray(tbl[k])) {
      out.push(fmtTomlKeyOut(k) + " = " + fmtTomlValueOut(tbl[k], path.concat([k]).join(".")));
    }
  }
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (fmtTomlIsTable(tbl[k])) {
      var np = path.concat([k]);
      if (out.length) { out.push(""); }
      out.push("[" + np.map(fmtTomlKeyOut).join(".") + "]");
      fmtTomlEmitTable(tbl[k], np, out);
    }
  }
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (fmtTomlIsTableArray(tbl[k])) {
      var ap = path.concat([k]);
      for (var j = 0; j < tbl[k].length; j++) {
        if (out.length) { out.push(""); }
        out.push("[[" + ap.map(fmtTomlKeyOut).join(".") + "]]");
        fmtTomlEmitTable(tbl[k][j], ap, out);
      }
    }
  }
}

function fmtTomlStringify(v) {
  if (!fmtTomlIsTable(v)) {
    throw new Error("TOML 顶层必须是键值表：源数据顶层是数组或标量，无法转成 TOML，请先包一层对象");
  }
  var out = [];
  fmtTomlEmitTable(v, [], out);
  return out.join("\n");
}

// 递归把 TOML 日期时间包装解成普通字符串（给 JSON / YAML 输出用）
function fmtUnwrap(v) {
  if (typeof v === "object" && v !== null) {
    if (v.__fmtTomlRaw !== undefined) { return v.__fmtTomlRaw; }
    if (Object.prototype.toString.call(v) === "[object Array]") {
      var arr = [];
      for (var i = 0; i < v.length; i++) { arr.push(fmtUnwrap(v[i])); }
      return arr;
    }
    var o = {};
    var ks = Object.keys(v);
    for (var j = 0; j < ks.length; j++) { o[ks[j]] = fmtUnwrap(v[ks[j]]); }
    return o;
  }
  return v;
}

function fmtDetect(text) {
  var t = text.replace(/^\s+/, "");
  if (t.charAt(0) === "{") { return "json"; }
  // 先看第一个有效行：TOML 的 [节] 与 键 = 值 特征要赶在 "[ 开头按 JSON" 之前判断
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var s = lines[i].replace(/^\s+|\s+$/g, "");
    if (!s || s.charAt(0) === "#") { continue; }
    if (/^\[[A-Za-z0-9_.\-"'\s]+\]$/.test(s)) { return "toml"; }
    if (/^[A-Za-z0-9_"'][A-Za-z0-9_.\- "']*\s*=\s*\S/.test(s) && s.indexOf(": ") === -1) { return "toml"; }
    break;
  }
  if (t.charAt(0) === "[") { return "json"; }
  return "yaml";
}

function fmtJsonLineOfPos(text, pos) {
  if (typeof pos !== "number" || pos < 0) { return null; }
  var upto = text.slice(0, pos);
  return upto.split("\n").length;
}

function fmtGenerate() {
  var out = document.getElementById("fmt-out");
  if (!out) { return; }
  var errBox = document.getElementById("fmt-err");
  var msg = document.getElementById("fmt-msg");
  function fail(m) {
    errBox.style.display = "block";
    errBox.textContent = "解析或转换失败：" + m;
    out.textContent = "";
    if (msg) { msg.textContent = ""; }
  }
  var text = document.getElementById("fmt-text").value;
  if (!text.replace(/\s+/g, "")) { fail("输入为空：请先粘贴一段 JSON / YAML / TOML"); return; }
  if (text.length > 200000) { fail("输入超过 200000 字符上限，请拆成小段再处理（浏览器本地解析大文本容易卡死）"); return; }
  var srcSel = document.getElementById("fmt-src").value;
  var dst = document.getElementById("fmt-dst").value;
  var guessed = false;
  var src = srcSel;
  if (srcSel === "auto") { src = fmtDetect(text); guessed = true; }
  var names = { json: "JSON", yaml: "YAML", toml: "TOML" };
  var value;
  try {
    if (src === "json") {
      try { value = JSON.parse(text); }
      catch (e) {
        var m = /position\s+(\d+)/.exec(e.message || "");
        var line = m ? fmtJsonLineOfPos(text, parseInt(m[1], 10)) : null;
        throw new Error((line ? "大约在第 " + line + " 行附近：" : "") + "JSON 语法错误（" + e.message + "）" + (guessed ? "；源格式是自动识别猜的 JSON，猜错时请手动指定源格式" : ""));
      }
    } else if (src === "yaml") {
      value = fmtYamlParse(text);
    } else {
      value = fmtTomlParse(text);
    }
  } catch (e2) {
    fail(e2.message + (guessed && src !== "json" ? "（源格式是自动识别猜的 " + names[src] + "，猜错时请手动指定）" : ""));
    return;
  }
  var result;
  try {
    if (dst === "json") { result = JSON.stringify(fmtUnwrap(value), null, 2); }
    else if (dst === "yaml") { result = fmtYamlStringify(fmtUnwrap(value)); }
    else { result = fmtTomlStringify(value); }
  } catch (e3) {
    fail(e3.message);
    return;
  }
  errBox.style.display = "none";
  out.textContent = result;
  if (msg) {
    msg.textContent = "✓ 校验通过：" + names[src] + (guessed ? "（自动识别）" : "") + " → " + names[dst] + (src === dst ? "（同格式，仅格式化）" : "");
  }
}

// ---------- N-26 配置差异比较器（diff） ----------

function diffSplitLines(text) {
  var t = text.replace(/\r\n?/g, "\n");
  if (t === "") { return []; }
  var arr = t.split("\n");
  if (arr.length && arr[arr.length - 1] === "") { arr.pop(); }
  return arr;
}

function diffGenerate() {
  var out = document.getElementById("diff-out");
  if (!out) { return; }
  var errBox = document.getElementById("diff-err");
  function fail(m) {
    errBox.style.display = "block";
    errBox.textContent = "无法比较：" + m;
    out.textContent = "";
  }
  var ignoreWs = document.getElementById("diff-trim").checked;
  var ignoreBlank = document.getElementById("diff-blank").checked;
  var aRaw = diffSplitLines(document.getElementById("diff-a").value);
  var bRaw = diffSplitLines(document.getElementById("diff-b").value);
  if (!aRaw.length && !bRaw.length) { fail("两侧都是空的，没有可比较的内容"); return; }
  if (aRaw.length > 5000 || bRaw.length > 5000) {
    fail("单侧超过 5000 行上限（左 " + aRaw.length + " 行 / 右 " + bRaw.length + " 行），请拆开比较；大文件建议在服务器上用 diff -u");
    return;
  }
  if (aRaw.length * bRaw.length > 16000000) {
    fail("两侧行数乘积过大（" + aRaw.length + " × " + bRaw.length + "），LCS 是平方级算法会卡死浏览器，请拆成小段再比");
    return;
  }
  function prep(raw) {
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var text = raw[i];
      var key = ignoreWs ? text.replace(/^\s+|\s+$/g, "") : text;
      if (ignoreBlank && key === "") { continue; }
      lines.push({ text: text, key: key });
    }
    return lines;
  }
  var A = prep(aRaw);
  var B = prep(bRaw);
  if (!A.length && !B.length) { fail("去掉空行后两侧都没有内容了"); return; }
  var n = A.length, m = B.length;
  // LCS 动态规划（扁平数组存表，整表先清零：含底行与右列，否则边界格是 undefined 会污染结果）
  var cols = m + 1;
  var dp = new Array((n + 1) * cols);
  var i, j;
  for (i = 0; i < dp.length; i++) { dp[i] = 0; }
  for (i = n - 1; i >= 0; i--) {
    for (j = m - 1; j >= 0; j--) {
      if (A[i].key === B[j].key) { dp[i * cols + j] = dp[(i + 1) * cols + j + 1] + 1; }
      else { dp[i * cols + j] = Math.max(dp[(i + 1) * cols + j], dp[i * cols + j + 1]); }
    }
  }
  var L = [];
  var added = 0, deleted = 0, same = 0;
  i = 0; j = 0;
  var body = [];
  while (i < n && j < m) {
    if (A[i].key === B[j].key) { body.push("  " + A[i].text); same++; i++; j++; }
    else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) { body.push("- " + A[i].text); deleted++; i++; }
    else { body.push("+ " + B[j].text); added++; j++; }
  }
  while (i < n) { body.push("- " + A[i].text); deleted++; i++; }
  while (j < m) { body.push("+ " + B[j].text); added++; j++; }
  L.push("# 统计：新增 " + added + " 行，删除 " + deleted + " 行，未变 " + same + " 行（左侧参与比较 " + n + " 行，右侧 " + m + " 行）");
  if (ignoreWs || ignoreBlank) {
    L.push("# 选项：" + (ignoreWs ? "忽略行首尾空白 " : "") + (ignoreBlank ? "忽略空行" : ""));
  }
  if (added === 0 && deleted === 0) { L.push("# 结论：两侧内容一致（按当前选项）"); }
  L.push("# --- 左侧（修改前）");
  L.push("# +++ 右侧（修改后）");
  for (var k = 0; k < body.length; k++) { L.push(body[k]); }
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}

// ---------- N-16 cloud-init 配置生成器（ci） ----------

function ciYamlQuote(s) {
  if (s === "") { return "''"; }
  var need = false;
  if (/^(null|Null|NULL|~|true|True|TRUE|false|False|FALSE)$/.test(s)) { need = true; }
  if (/^[-+]?[\d.]/.test(s) && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) { need = true; }
  if (/^\s|\s$/.test(s)) { need = true; }
  if (/[:#\{\}\[\],&*!|>'"%@`]/.test(s)) { need = true; }
  if (s === "-" || s === "?" || s === ":" || s.indexOf("- ") === 0) { need = true; }
  if (/[\n\r\t]/.test(s)) { return JSON.stringify(s); }
  if (need) {
    if (s.indexOf("\"") !== -1 || s.indexOf("\\") !== -1) { return JSON.stringify(s); }
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return s;
}

function ciGenerate() {
  var out = document.getElementById("ci-out");
  if (!out) { return; }
  var errBox = document.getElementById("ci-err");
  var errs = [];
  var hostname = document.getElementById("ci-hostname").value.replace(/^\s+|\s+$/g, "");
  var timezone = document.getElementById("ci-timezone").value.replace(/^\s+|\s+$/g, "");
  var user = document.getElementById("ci-user").value.replace(/^\s+|\s+$/g, "");
  var sudoNp = document.getElementById("ci-sudo-nopasswd").checked;
  var pwmode = document.getElementById("ci-pwmode").value;
  var pwhash = document.getElementById("ci-pwhash").value.replace(/^\s+|\s+$/g, "");
  if (!hostname) { errs.push("主机名不能为空"); }
  else if (hostname.length > 63 || !/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(hostname)) {
    errs.push("主机名不合法：只能含字母、数字、连字符与点，每段不以连字符开头/结尾，总长不超过 63");
  }
  if (!timezone) { errs.push("时区不能为空（如 Asia/Shanghai、UTC）"); }
  else if (!/^[A-Za-z0-9_+\-.]+(\/[A-Za-z0-9_+\-.]+)*$/.test(timezone) || timezone.indexOf("..") !== -1) {
    errs.push("时区不合法：应是 Asia/Shanghai 这类 IANA 时区名");
  }
  if (!user) { errs.push("初始用户名不能为空"); }
  else if (user.length > 32 || !/^[a-z_][a-z0-9_-]*$/.test(user)) {
    errs.push("用户名不合法：小写字母或下划线开头，其后小写字母、数字、下划线、连字符，最长 32");
  }
  if (pwmode === "hash") {
    if (!pwhash) { errs.push("选了「已哈希密码」模式就必须填密码哈希（openssl passwd -6 生成）"); }
    else if (!/^\$[0-9A-Za-z]+\$/.test(pwhash) || /\s/.test(pwhash)) {
      errs.push("密码哈希格式不对：应是 $6$ 开头的哈希串；不要填明文密码——明文写进 user-data 等于公开，本工具拒绝生成");
    }
  }
  var keyLines = document.getElementById("ci-keys").value.replace(/\r\n?/g, "\n").split("\n");
  var keys = [];
  for (var i = 0; i < keyLines.length; i++) {
    var kl = keyLines[i].replace(/^\s+|\s+$/g, "");
    if (!kl) { continue; }
    if (!/^(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/=]+(\s+.*)?$/.test(kl)) {
      errs.push("SSH 公钥第 " + (i + 1) + " 行格式不对：应是 .pub 文件整行（类型 + Base64 + 可选备注）；私钥绝不能粘进来");
    } else { keys.push(kl); }
  }
  var pkgRaw = document.getElementById("ci-packages").value;
  var pkgToks = pkgRaw.split(/[\n,]+/);
  var pkgs = [];
  for (var p = 0; p < pkgToks.length; p++) {
    var pt = pkgToks[p].replace(/^\s+|\s+$/g, "");
    if (!pt) { continue; }
    if (!/^[a-z0-9][a-z0-9+.\-]*$/.test(pt)) { errs.push("软件包名「" + pt + "」不合法：Debian 包名只用小写字母、数字、+、-、."); }
    else { pkgs.push(pt); }
  }
  var rcLines = document.getElementById("ci-runcmd").value.replace(/\r\n?/g, "\n").split("\n");
  var runcmds = [];
  for (var r = 0; r < rcLines.length; r++) {
    var rl = rcLines[r].replace(/\s+$/g, "");
    if (!rl.replace(/\s+/g, "")) { continue; }
    runcmds.push(rl);
  }
  var filePath = document.getElementById("ci-file-path").value.replace(/^\s+|\s+$/g, "");
  var fileContent = document.getElementById("ci-file-content").value;
  if (filePath) {
    if (filePath.charAt(0) !== "/" || !/^\/[A-Za-z0-9_\/.\-+]+$/.test(filePath) || filePath.indexOf("..") !== -1) {
      errs.push("写入文件路径必须是绝对路径，只含字母、数字与 _ / . - +，且不能含 ..");
    }
  } else if (fileContent) {
    errs.push("填了文件内容却没填文件路径");
  }
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var L = [];
  L.push("#cloud-config");
  L.push("# 由本站 cloud-init 生成器生成，用作首次启动的 user-data；改完老实例重启不会重跑");
  L.push("# ⚠ 密码：本配置只用「锁定密码」或「已哈希密码」，禁止把明文密码写进 user-data（等于公开）");
  L.push("hostname: " + ciYamlQuote(hostname));
  L.push("preserve_hostname: false");
  L.push("timezone: " + ciYamlQuote(timezone));
  L.push("users:");
  L.push("  - name: " + ciYamlQuote(user));
  L.push("    shell: /bin/bash");
  L.push("    groups: [sudo]");
  if (sudoNp) {
    L.push("    # ⚠ sudo 免密已开启：拿到该用户密钥即等于拿到 root，只在受控环境使用");
    L.push("    sudo: \"ALL=(ALL) NOPASSWD:ALL\"");
  } else {
    L.push("    sudo: \"ALL=(ALL) ALL\"");
  }
  if (pwmode === "hash") {
    L.push("    # 已哈希密码登录（哈希不是明文，但仍别把 user-data 公开传播）");
    L.push("    passwd: " + ciYamlQuote(pwhash));
    L.push("    lock_passwd: false");
  } else {
    L.push("    # 密码锁定：只能用下面的 SSH 公钥登录");
    L.push("    lock_passwd: true");
  }
  if (keys.length) {
    L.push("    ssh_authorized_keys:");
    for (var kk = 0; kk < keys.length; kk++) { L.push("      - " + ciYamlQuote(keys[kk])); }
  }
  if (pkgs.length) {
    L.push("package_update: true");
    L.push("packages:");
    for (var pp = 0; pp < pkgs.length; pp++) { L.push("  - " + pkgs[pp]); }
  }
  if (filePath) {
    L.push("write_files:");
    L.push("  - path: " + filePath);
    L.push("    permissions: '0644'");
    L.push("    content: |");
    var cl = fileContent.replace(/\r\n?/g, "\n").split("\n");
    for (var cc = 0; cc < cl.length; cc++) {
      L.push(cl[cc] === "" ? "" : "      " + cl[cc]);
    }
  }
  if (runcmds.length) {
    L.push("runcmd:");
    for (var rr = 0; rr < runcmds.length; rr++) { L.push("  - " + ciYamlQuote(runcmds[rr])); }
  }
  out.textContent = L.join("\n");
}

// ---------- N-06 补满：SSH 服务端配置生成器（sshd） ----------

function sshdNum(id, label, min, max, errs) {
  var raw = document.getElementById(id).value.replace(/^\s+|\s+$/g, "");
  if (!/^\d+$/.test(raw)) { errs.push(label + "必须是整数"); return null; }
  var n = parseInt(raw, 10);
  if (n < min || n > max) { errs.push(label + "必须在 " + min + "–" + max + " 之间"); return null; }
  return n;
}

function sshdGenerate() {
  var out = document.getElementById("sshd-out");
  if (!out) { return; }
  var errBox = document.getElementById("sshd-err");
  var errs = [];
  var port = sshdNum("sshd-port", "监听端口", 1, 65535, errs);
  var rootLogin = document.getElementById("sshd-root").value;
  if (["no", "prohibit-password", "yes"].indexOf(rootLogin) === -1) { errs.push("PermitRootLogin 取值不合法"); }
  var pubkey = document.getElementById("sshd-pubkey").checked;
  var pwauth = document.getElementById("sshd-pwauth").checked;
  var maxTries = sshdNum("sshd-maxtries", "MaxAuthTries", 1, 100, errs);
  var grace = sshdNum("sshd-grace", "LoginGraceTime", 0, 3600, errs);
  var aliveInterval = sshdNum("sshd-alive-interval", "ClientAliveInterval", 0, 86400, errs);
  var aliveCount = sshdNum("sshd-alive-count", "ClientAliveCountMax", 0, 100, errs);
  if (!pubkey && !pwauth) {
    errs.push("密钥登录与密码登录不能同时关闭：那样将无人能登录 SSH（先确认密钥能登录再关密码）");
  }
  var allowRaw = document.getElementById("sshd-allowusers").value.replace(/^\s+|\s+$/g, "");
  var allowUsers = [];
  if (allowRaw) {
    var toks = allowRaw.split(/[\s,]+/);
    for (var i = 0; i < toks.length; i++) {
      if (!toks[i]) { continue; }
      if (!/^[A-Za-z0-9_.\-]+(@[A-Za-z0-9_.\-]+)?$/.test(toks[i])) {
        errs.push("AllowUsers 中的「" + toks[i] + "」含非法字符（只允许用户名或 用户@主机 形式）");
      } else { allowUsers.push(toks[i]); }
    }
  }
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var L = [];
  L.push("# ⚠ 风险提示：改 SSH 配置是把自己锁在门外的高发操作——先在防火墙/云安全组放行端口，");
  L.push("#    改完用 sshd -t 校验、reload 后保留当前会话，新开终端验证能登录了再断开旧会话。");
  if (port !== 22) {
    L.push("# ⚠ 端口已改为 " + port + "：应用配置之前先放行新端口（sudo ufw allow " + port + "/tcp，云服务器还要改安全组），否则 reload 后将无法连接");
  }
  L.push("# 落地位置二选一：新建 /etc/ssh/sshd_config.d/10-hardening.conf（推荐），或追加到 /etc/ssh/sshd_config");
  L.push("# 监听端口");
  L.push("Port " + port);
  L.push("# root 登录策略（prohibit-password = root 只能用密钥）");
  L.push("PermitRootLogin " + rootLogin);
  if (rootLogin === "yes") {
    L.push("# ⚠ PermitRootLogin yes 允许 root 用密码直接登录，是爆破首要目标，强烈建议改成 prohibit-password");
  }
  L.push("# 密钥登录");
  L.push("PubkeyAuthentication " + (pubkey ? "yes" : "no"));
  L.push("# 密码登录（关掉前务必确认公钥已能登录）");
  L.push("PasswordAuthentication " + (pwauth ? "yes" : "no"));
  if (pwauth) {
    L.push("# ⚠ 密码登录开着：请配合强密码与 fail2ban，或评估后改为 no");
  } else {
    L.push("KbdInteractiveAuthentication no");
  }
  L.push("# 单次连接最多认证尝试次数");
  L.push("MaxAuthTries " + maxTries);
  L.push("# 未完成登录的连接最长保留秒数（0 表示不限时，不建议）");
  L.push("LoginGraceTime " + grace);
  if (grace === 0) {
    L.push("# ⚠ LoginGraceTime 0 = 未登录连接永不超时，容易被慢速连接耗尽，建议 30–120");
  }
  if (allowUsers.length) {
    L.push("# 只允许这些用户登录（名单外用户一律拒绝，写错自己的用户名会把自己锁在外面）");
    L.push("AllowUsers " + allowUsers.join(" "));
  }
  if (aliveInterval > 0) {
    L.push("# 空闲断开：服务端每 " + aliveInterval + " 秒发一次保活探测，连续 " + aliveCount + " 次无响应就断开");
    L.push("ClientAliveInterval " + aliveInterval);
    L.push("ClientAliveCountMax " + aliveCount);
  } else {
    L.push("# 不主动断开空闲连接（如需空闲断开，把 ClientAliveInterval 设为大于 0）");
    L.push("ClientAliveInterval 0");
  }
  L.push("");
  L.push("# 应用步骤（逐条执行，顺序不要反）：");
  L.push("# 1) 先放行端口：sudo ufw allow " + port + "/tcp（云服务器再去安全组放行同一端口）");
  L.push("# 2) 备份：sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak");
  L.push("# 3) 把上面的片段写入 /etc/ssh/sshd_config.d/10-hardening.conf");
  L.push("# 4) 校验语法：sudo sshd -t（无输出才是通过，有报错先回滚备份再改）");
  L.push("# 5) 重载：sudo systemctl reload ssh");
  L.push("# 6) 不要关当前会话；新开终端用 ssh -p " + port + " 用户@服务器 验证能登录");
  L.push("# 7) 查看最终生效值：sudo sshd -T | grep -iE 'port|permitroot|passwordauth|pubkey'");
  out.textContent = L.join("\n");
}

// ---------- N-08 补满：systemd Timer 生成器（tmr） ----------

function tmrValidSpan(s) {
  if (!s) { return false; }
  var parts = s.split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    if (!/^\d+(us|ms|s|sec|min|h|hr|d|w|M|y)?$/.test(parts[i])) { return false; }
  }
  return true;
}

function tmrGenerate() {
  var out = document.getElementById("tmr-out");
  if (!out) { return; }
  var errBox = document.getElementById("tmr-err");
  var errs = [];
  var name = document.getElementById("tmr-name").value.replace(/^\s+|\s+$/g, "");
  if (name.slice(-6) === ".timer") { name = name.slice(0, -6); }
  if (name.slice(-8) === ".service") { name = name.slice(0, -8); }
  if (!name) { errs.push("服务名不能为空"); }
  else if (/[\r\n]/.test(name)) { errs.push("服务名不能包含换行"); }
  else if (!/^[A-Za-z0-9_.@-]+$/.test(name)) { errs.push("服务名只能含字母、数字、点、下划线、连字符"); }
  var exec = document.getElementById("tmr-exec").value.replace(/^\s+|\s+$/g, "");
  if (!exec) { errs.push("ExecStart 不能为空"); }
  else if (/[\r\n]/.test(exec)) { errs.push("ExecStart 不能包含换行"); }
  else if (exec.charAt(0) !== "/") { errs.push("ExecStart 必须是绝对路径（以 / 开头）"); }
  var preset = document.getElementById("tmr-preset").value;
  var span = document.getElementById("tmr-span").value.replace(/^\s+|\s+$/g, "");
  var calendar = document.getElementById("tmr-calendar").value.replace(/^\s+|\s+$/g, "");
  var persistent = document.getElementById("tmr-persistent").checked;
  var random = document.getElementById("tmr-random").value.replace(/^\s+|\s+$/g, "");
  var calExpr = "";
  var bootSec = "";
  var activeSec = "";
  if (preset === "hourly") { calExpr = "hourly"; }
  else if (preset === "daily") { calExpr = "daily"; }
  else if (preset === "weekly") { calExpr = "weekly"; }
  else if (preset === "monthly") { calExpr = "monthly"; }
  else if (preset === "boot") {
    if (!tmrValidSpan(span)) { errs.push("开机延迟格式不对：应如 5min、30s、1h（数字 + 单位）"); }
    else { bootSec = span; }
  } else if (preset === "interval") {
    if (!tmrValidSpan(span)) { errs.push("间隔格式不对：应如 30min、2h、1d（数字 + 单位）"); }
    else { activeSec = span; bootSec = "1min"; }
  } else if (preset === "custom") {
    if (!calendar) { errs.push("选了自定义就要填 OnCalendar 表达式（如 *-*-* 03:30:00）"); }
    else if (!/^[A-Za-z0-9*:,.\/\- ]+$/.test(calendar)) { errs.push("OnCalendar 含白名单外字符（只允许字母、数字与 * : , . / - 和空格）"); }
    else { calExpr = calendar; }
  } else { errs.push("触发方式取值不合法"); }
  if (random && !tmrValidSpan(random)) { errs.push("随机延迟格式不对：应如 5min、30s，或留空表示不加随机延迟"); }
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var presetNames = { hourly: "每小时整点", daily: "每天零点", weekly: "每周一零点", monthly: "每月一日零点", boot: "开机后延迟触发一次", interval: "按固定间隔重复触发", custom: "自定义日历表达式" };
  var L = [];
  L.push("# 文件：/etc/systemd/system/" + name + ".timer");
  L.push("[Unit]");
  L.push("# 定时器描述（list-timers 里显示）");
  L.push("Description=定时触发 " + name + ".service（" + (presetNames[preset] || preset) + "）");
  L.push("");
  L.push("[Timer]");
  if (calExpr) {
    L.push("# 日历触发（简写与完整写法的对照可用 systemd-analyze calendar 验算）");
    L.push("OnCalendar=" + calExpr);
  }
  if (bootSec) {
    L.push("# 开机后多久首次触发");
    L.push("OnBootSec=" + bootSec);
  }
  if (activeSec) {
    L.push("# 距上次触发的间隔（间隔型触发靠这一行循环）");
    L.push("OnUnitActiveSec=" + activeSec);
  }
  L.push("# 触发哪个服务（与本 timer 同名时其实可省略，写明更直观）");
  L.push("Unit=" + name + ".service");
  if (calExpr) {
    L.push("# 关机期间错过的日历触发，开机后是否补跑一次（只对 OnCalendar 有意义）");
    L.push("Persistent=" + (persistent ? "true" : "false"));
  }
  if (random) {
    L.push("# 在触发时刻基础上再随机推迟一段，避免多台机器同一时刻一起跑");
    L.push("RandomizedDelaySec=" + random);
  }
  L.push("");
  L.push("[Install]");
  L.push("# enable .timer 时挂到 timers.target");
  L.push("WantedBy=timers.target");
  L.push("");
  L.push("# ===== 对应的服务文件：/etc/systemd/system/" + name + ".service =====");
  L.push("[Unit]");
  L.push("Description=" + name + "（由 " + name + ".timer 定时触发）");
  L.push("After=network.target");
  L.push("");
  L.push("[Service]");
  L.push("# oneshot：跑完即结束型任务，不写 [Install] 段（不靠 enable 自启，靠 timer 拉起）");
  L.push("Type=oneshot");
  L.push("# 任务命令（绝对路径；脚本记得加可执行权限）");
  L.push("ExecStart=" + exec);
  L.push("");
  L.push("# 启用与验证（逐条执行）：");
  L.push("# sudo systemctl daemon-reload");
  L.push("# sudo systemctl enable --now " + name + ".timer");
  L.push("# systemctl list-timers --all | grep " + name + "（确认 NEXT 列有下一次触发时间）");
  L.push("# systemctl status " + name + ".timer " + name + ".service");
  if (calExpr) {
    L.push("# systemd-analyze calendar '" + calExpr + "'（验算表达式的下一次触发时间）");
  }
  L.push("# 手动试跑一次任务本体：sudo systemctl start " + name + ".service，再用 journalctl -u " + name + ".service 看日志");
  out.textContent = L.join("\n");
}

// ---------- 批次 A：init 绑定（沿用本页模式：data-ready 防重复绑定、bindCopy 复制） ----------

function fmtClearInputs() {
  document.getElementById("fmt-text").value = "";
  document.getElementById("fmt-out").textContent = "";
  document.getElementById("fmt-err").style.display = "none";
  document.getElementById("fmt-msg").textContent = "已清空";
}

function initFmtGen() {
  var out = document.getElementById("fmt-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("fmt-run");
  if (run) { run.addEventListener("click", fmtGenerate); }
  var clear = document.getElementById("fmt-clear");
  if (clear) { clear.addEventListener("click", fmtClearInputs); }
  bindCopy("fmt-copy", "fmt-out", "fmt-msg");
  fmtGenerate();
}

function diffClearInputs() {
  document.getElementById("diff-a").value = "";
  document.getElementById("diff-b").value = "";
  document.getElementById("diff-out").textContent = "";
  document.getElementById("diff-err").style.display = "none";
  document.getElementById("diff-msg").textContent = "已清空";
}

function initDiffGen() {
  var out = document.getElementById("diff-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("diff-run");
  if (run) { run.addEventListener("click", diffGenerate); }
  ["diff-trim", "diff-blank"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener("change", diffGenerate); }
  });
  var clear = document.getElementById("diff-clear");
  if (clear) { clear.addEventListener("click", diffClearInputs); }
  bindCopy("diff-copy", "diff-out", "diff-msg");
  diffGenerate();
}

function ciResetDefaults() {
  document.getElementById("ci-hostname").value = "web-01";
  document.getElementById("ci-timezone").value = "Asia/Shanghai";
  document.getElementById("ci-user").value = "ubuntu";
  document.getElementById("ci-sudo-nopasswd").checked = false;
  document.getElementById("ci-pwmode").value = "lock";
  document.getElementById("ci-pwhash").value = "";
  document.getElementById("ci-keys").value = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl admin@laptop";
  document.getElementById("ci-packages").value = "curl, vim, htop";
  document.getElementById("ci-runcmd").value = "";
  document.getElementById("ci-file-path").value = "";
  document.getElementById("ci-file-content").value = "";
  ciGenerate();
}

function initCiGen() {
  var out = document.getElementById("ci-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["ci-hostname", "ci-timezone", "ci-user", "ci-sudo-nopasswd", "ci-pwmode", "ci-pwhash", "ci-keys", "ci-packages", "ci-runcmd", "ci-file-path", "ci-file-content"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", ciGenerate);
      el.addEventListener("change", ciGenerate);
    }
  });
  var clear = document.getElementById("ci-clear");
  if (clear) { clear.addEventListener("click", ciResetDefaults); }
  bindCopy("ci-copy", "ci-out", "ci-msg");
  ciGenerate();
}

function sshdResetDefaults() {
  document.getElementById("sshd-port").value = "22";
  document.getElementById("sshd-root").value = "prohibit-password";
  document.getElementById("sshd-pubkey").checked = true;
  document.getElementById("sshd-pwauth").checked = false;
  document.getElementById("sshd-maxtries").value = "3";
  document.getElementById("sshd-grace").value = "60";
  document.getElementById("sshd-allowusers").value = "";
  document.getElementById("sshd-alive-interval").value = "300";
  document.getElementById("sshd-alive-count").value = "2";
  sshdGenerate();
}

function initSshdGen() {
  var out = document.getElementById("sshd-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["sshd-port", "sshd-root", "sshd-pubkey", "sshd-pwauth", "sshd-maxtries", "sshd-grace", "sshd-allowusers", "sshd-alive-interval", "sshd-alive-count"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", sshdGenerate);
      el.addEventListener("change", sshdGenerate);
    }
  });
  var clear = document.getElementById("sshd-clear");
  if (clear) { clear.addEventListener("click", sshdResetDefaults); }
  bindCopy("sshd-copy", "sshd-out", "sshd-msg");
  sshdGenerate();
}

function tmrResetDefaults() {
  document.getElementById("tmr-name").value = "backup";
  document.getElementById("tmr-exec").value = "/usr/local/bin/backup.sh";
  document.getElementById("tmr-preset").value = "daily";
  document.getElementById("tmr-span").value = "30min";
  document.getElementById("tmr-calendar").value = "";
  document.getElementById("tmr-persistent").checked = true;
  document.getElementById("tmr-random").value = "";
  tmrGenerate();
}

function initTmrGen() {
  var out = document.getElementById("tmr-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["tmr-name", "tmr-exec", "tmr-preset", "tmr-span", "tmr-calendar", "tmr-persistent", "tmr-random"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", tmrGenerate);
      el.addEventListener("change", tmrGenerate);
    }
  });
  var clear = document.getElementById("tmr-clear");
  if (clear) { clear.addEventListener("click", tmrResetDefaults); }
  bindCopy("tmr-copy", "tmr-out", "tmr-msg");
  tmrGenerate();
}

/*
集成清单（集成方在页尾 init 区统一调用以下 init 函数，并各加一行
document$.subscribe(initXxx) 与 document.addEventListener("DOMContentLoaded", initXxx)，
与既有工具的注册方式保持一致）：
  initFmtGen();
  initDiffGen();
  initCiGen();
  initSshdGen();
  initTmrGen();
依赖页面已有的全局助手 bindCopy / showCopyToast（既有脚本中已定义，本批直接复用，未重复定义）。
*/
