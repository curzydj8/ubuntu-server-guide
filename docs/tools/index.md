---
description: "互动工具：Netplan 配置生成器与 UFW 防火墙规则生成器，填表实时生成可直接复制的 YAML 配置与命令，纯前端运行、不上传任何数据。"
---

# 互动工具

两个纯前端小工具：在浏览器里填表，实时生成可复制的配置与命令，**不上传任何数据**。生成结果请先核对再落到服务器上执行。

!!! warning "使用前必读"

    - 生成器给的是通用模板，接口名、IP、端口必须换成你机器的真实值。
    - 改网络配置前先确保有控制台/带外管理通道，远程改 Netplan 有断联风险，先用 `netplan try` 验证。

## 执行顺序与风险提示

两个生成器产出的配置与命令，请按同一套顺序使用，不要生成后整段粘贴就执行：

1. **先检查现状**：先看现有配置文件、服务状态与防火墙规则，确认机器当前是什么状态。
2. **先备份**：改任何配置之前留一份带日期的副本，确认回滚路径真实存在。
3. **小步应用**：一次只改一处，先走校验或试运行（如 `netplan generate`、`netplan try`），再正式应用。
4. **复核规则**：应用后重新读取生效的配置与规则列表，与预期逐条对照。
5. **从预期来源验证**：在另一台机器或本地终端，从实际使用路径验证连通性，不要只在服务器本机自测。

!!! danger "三条红线"

    - 改网络或防火墙配置前，先保留控制台或带外管理通道，远程会话断了也要有路可退。
    - 启用 UFW 前先放行当前 SSH 端口，顺序反了会把自己锁在门外。
    - 数据库端口（3306 / 5432 / 6379 / 27017 等）不要向公网开放，只允许内网或应用服务器来源。

## Netplan 配置生成器

填写后实时生成 `/etc/netplan/99-custom.yaml` 内容。默认写到 `99-custom.yaml`，不要直接改 `50-cloud-init.yaml`：`50-cloud-init.yaml` 是 cloud-init 托管生成的那个文件，手动改它可能在重启或 cloud-init 重新运行时被覆盖。

!!! warning "动手前检查清单"

    1. 先看现有文件：`ls -la /etc/netplan/`，确认当前有哪些配置文件。
    2. 判断是否 cloud-init 托管网络：如果存在 `50-cloud-init.yaml`，或 `/etc/cloud/cloud.cfg.d/` 里有网络配置，按云服务器模式处理（见下方「模式」选「云服务器」）。
    3. 改前备份：`sudo cp -a /etc/netplan /etc/netplan.bak-$(date +%F)`
    4. 先校验语法：`sudo netplan generate`
    5. 试运行：`sudo netplan try`（超时自动回滚，确认无误再按回车确认）。
    6. 应用后验证：`ip a` 看地址、`ip route` 看路由、`resolvectl status` 看 DNS。

<div>
  <p>
    <label>模式
      <select id="np-mode">
        <option value="normal" selected>普通服务器</option>
        <option value="cloud">云服务器</option>
        <option value="dhcp">DHCP</option>
        <option value="static">静态 IPv4</option>
        <option value="dual">IPv4+IPv6 双栈</option>
      </select>
    </label>
    <label>接口名 <input type="text" id="np-iface" value="eth0"></label>
    <label><input type="checkbox" id="np-dhcp"> 使用 DHCP 自动获取（仅普通服务器/云服务器模式下生效，DHCP/静态/双栈模式以模式为准）</label>
  </p>
  <p>
    <label>IP 地址 / CIDR <input type="text" id="np-ip" value="192.0.2.10/24"></label>
    <label>网关 <input type="text" id="np-gw" value="192.0.2.1"></label>
    <label>DNS（逗号分隔） <input type="text" id="np-dns" value="192.0.2.53"></label>
  </p>
  <p>
    <label>IPv6 地址 / CIDR（双栈用） <input type="text" id="np-ip6" value="2001:db8::10/64"></label>
    <label>IPv6 网关（双栈用） <input type="text" id="np-gw6" value="2001:db8::1"></label>
  </p>
  <div id="np-cloud-tip" style="display: none; border: 1px solid #e65100; background: rgba(255, 145, 0, 0.12); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>云服务器提示：</strong>cloud-init 托管时优先改 cloud-init 配置（如 <code>/etc/cloud/cloud.cfg.d/</code> 中的网络配置），或确认 <code>99-custom.yaml</code> 的合并顺序：Netplan 按文件名顺序合并，数字越大越后合并、可覆盖同名键，所以 <code>99-custom.yaml</code> 会覆盖 <code>50-cloud-init.yaml</code> 的同名键；若云厂商在重启时重写 cloud-init 配置，仍可能再次覆盖，请改完后重启验证一次。
  </div>
  <pre id="np-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="np-copy">复制 YAML</button> <span id="np-msg"></span></p>
</div>

!!! note "YAML 缩进注意事项"

    - 只能用**空格**缩进，禁止 Tab；同一层级保持 2 空格对齐。
    - 冒号后面必须有空格（`version: 2`，不能写 `version:2`）。
    - 落盘后先 `sudo netplan generate` 检查语法，再 `sudo netplan try` 可回滚试应用，最后 `sudo netplan apply`。
    - 新版 Netplan 要求配置文件权限收紧：`sudo chmod 600 /etc/netplan/99-custom.yaml`，否则 apply 时会有权限警告。
    - `50-cloud-init.yaml` 是 cloud-init 托管生成的那个文件，本生成器默认输出到 `/etc/netplan/99-custom.yaml`，靠文件名顺序在合并时覆盖同名键，不要直接编辑 `50-cloud-init.yaml`。
    - 完整讲解见 [首次登录与网络配置](../01-basics/03-first-login-network.md)。

## UFW 规则生成器

勾选常用服务、按需加自定义端口，实时生成分步的 `ufw` 命令组。SSH 端口单独填写，生成结果的第一条业务规则永远是放行该 SSH 端口。

!!! danger "先放行 SSH 再启用 UFW"

    若你改过 SSH 端口，务必先放行新端口再启用 UFW，否则会把自己锁在门外；改规则前保持当前 SSH 会话不要断开。

<div>
  <p>
    <label>SSH 端口 <input type="number" id="ufw-ssh-port" min="1" max="65535" value="22"></label>
  </p>
  <p>
    <label><input type="checkbox" class="ufw-preset" data-port="80" data-proto="tcp" data-name="HTTP"> HTTP（80/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="443" data-proto="tcp" data-name="HTTPS"> HTTPS（443/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="25565" data-proto="tcp" data-name="Minecraft"> Minecraft（25565/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="8211" data-proto="udp" data-name="Palworld"> Palworld（8211/udp）</label>
  </p>
  <p>
    <label><input type="checkbox" class="ufw-preset" data-port="3306" data-proto="tcp" data-name="MySQL"> MySQL（3306/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="5432" data-proto="tcp" data-name="PostgreSQL"> PostgreSQL（5432/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="6379" data-proto="tcp" data-name="Redis"> Redis（6379/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="27017" data-proto="tcp" data-name="MongoDB"> MongoDB（27017/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="8888" data-proto="tcp" data-name="管理后台示例"> 管理后台示例（8888/tcp）</label>
  </p>
  <p>
    <label>自定义端口 <input type="number" id="ufw-port" min="1" max="65535" placeholder="例如 8080"></label>
    <label>协议
      <select id="ufw-proto">
        <option value="tcp">tcp</option>
        <option value="udp">udp</option>
      </select>
    </label>
    <label>来源 IP（可选，留空=任意） <input type="text" id="ufw-src" placeholder="192.0.2.100"></label>
  </p>
  <div id="ufw-warn-db" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>最小权限警告：</strong>数据库端口不应直接向公网开放，建议在来源 IP 处限定为内网/应用服务器地址。
  </div>
  <div id="ufw-warn-admin" style="display: none; border: 1px solid #e65100; background: rgba(255, 145, 0, 0.12); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>最小权限警告：</strong>管理后台建议限定来源 IP，不要直接向公网任意来源开放（涉及端口 888、8888、8443、9090 等）。
  </div>
  <pre id="ufw-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ufw-copy">复制命令</button> <span id="ufw-msg"></span></p>
</div>

!!! warning "放行前确认"

    - 启用 UFW 前务必先放行 SSH（或你改过的 SSH 端口），顺序反了会把自己锁在外面。
    - 云服务器还要同步放行**云厂商安全组**，两层缺一不可，见[防火墙](../02-security/03-firewall.md)与[端口三重门](../10-game-servers/01-port-opening.md)。

<div id="copy-toast" style="display: none; position: fixed; left: 50%; bottom: 1.4em; transform: translateX(-50%); z-index: 9999; max-width: 92vw; background: #b71c1c; color: #fff; padding: 0.7em 1.1em; border-radius: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); opacity: 0; transition: opacity 0.3s;">粘贴到服务器前请先逐行审阅，并确认已保留回滚通道。</div>

<script>
function npGenerate() {
  var ifaceEl = document.getElementById("np-iface");
  if (!ifaceEl) { return; }
  var iface = ifaceEl.value.trim() || "eth0";
  var modeEl = document.getElementById("np-mode");
  var mode = modeEl ? modeEl.value : "normal";
  var dhcpEl = document.getElementById("np-dhcp");
  var dhcpChecked = dhcpEl ? dhcpEl.checked : false;
  var useDhcp;
  if (mode === "dhcp") {
    useDhcp = true;
  } else if (mode === "static" || mode === "dual") {
    useDhcp = false;
  } else {
    useDhcp = dhcpChecked;
  }
  var tip = document.getElementById("np-cloud-tip");
  if (tip) {
    tip.style.display = (mode === "cloud") ? "block" : "none";
  }
  var lines = [];
  lines.push("# /etc/netplan/99-custom.yaml");
  lines.push("network:");
  lines.push("  version: 2");
  lines.push("  ethernets:");
  lines.push("    " + iface + ":");
  if (useDhcp) {
    lines.push("      dhcp4: true");
  } else {
    var ip = document.getElementById("np-ip").value.trim();
    var gw = document.getElementById("np-gw").value.trim();
    var dns = document.getElementById("np-dns").value.trim();
    lines.push("      dhcp4: false");
    lines.push("      addresses:");
    if (ip) {
      lines.push("        - " + ip);
    }
    var gw6 = "";
    if (mode === "dual") {
      var ip6El = document.getElementById("np-ip6");
      var gw6El = document.getElementById("np-gw6");
      var ip6 = ip6El ? ip6El.value.trim() : "";
      gw6 = gw6El ? gw6El.value.trim() : "";
      if (ip6) {
        lines.push("        - " + ip6);
      }
    }
    if (gw || gw6) {
      lines.push("      routes:");
      if (gw) {
        lines.push("        - to: default");
        lines.push("          via: " + gw);
      }
      if (gw6) {
        lines.push("        - to: default");
        lines.push("          via: " + gw6);
      }
    }
    if (dns) {
      var parts = dns.split(",");
      lines.push("      nameservers:");
      lines.push("        addresses:");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p) {
          lines.push("          - " + p);
        }
      }
    }
  }
  document.getElementById("np-out").textContent = lines.join("\n");
}
function ufwRule(port, proto, name, src) {
  if (src) {
    return "sudo ufw allow from " + src + " to any port " + port + " proto " + proto + " comment '" + name + "'";
  }
  return "sudo ufw allow " + port + "/" + proto + " comment '" + name + "' # (任意来源，谨慎)";
}
function ufwGenerate() {
  var sshEl = document.getElementById("ufw-ssh-port");
  if (!sshEl) { return; }
  var sshPort = sshEl.value.trim() || "22";
  var srcEl = document.getElementById("ufw-src");
  var src = srcEl ? srcEl.value.trim() : "";
  var customPortEl = document.getElementById("ufw-port");
  var customPort = customPortEl ? customPortEl.value.trim() : "";
  var customProtoEl = document.getElementById("ufw-proto");
  var customProto = customProtoEl ? customProtoEl.value : "tcp";
  var dbPorts = ["3306", "5432", "6379", "27017"];
  var adminPorts = ["888", "8888", "8443", "9090"];
  var seenPorts = [];
  var boxes = document.querySelectorAll(".ufw-preset");
  var i;
  for (i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) {
      seenPorts.push(boxes[i].getAttribute("data-port"));
    }
  }
  if (customPort) {
    seenPorts.push(customPort);
  }
  var warnDb = document.getElementById("ufw-warn-db");
  var warnAdmin = document.getElementById("ufw-warn-admin");
  if (warnDb) {
    var hasDb = false;
    for (i = 0; i < seenPorts.length; i++) {
      if (dbPorts.indexOf(seenPorts[i]) !== -1) { hasDb = true; }
    }
    warnDb.style.display = hasDb ? "block" : "none";
  }
  if (warnAdmin) {
    var hasAdmin = false;
    for (i = 0; i < seenPorts.length; i++) {
      if (adminPorts.indexOf(seenPorts[i]) !== -1) { hasAdmin = true; }
    }
    warnAdmin.style.display = hasAdmin ? "block" : "none";
  }
  var lines = [];
  lines.push("# 步骤1：查看现有状态（未启用时会显示 Status: inactive）");
  lines.push("sudo ufw status verbose");
  lines.push("");
  lines.push("# 步骤2：放行 SSH 端口（务必最先执行，不要断开当前 SSH 会话）");
  lines.push(ufwRule(sshPort, "tcp", "SSH", src));
  lines.push("");
  lines.push("# 步骤3：放行业务端口");
  var bizCount = 0;
  for (i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) {
      var bp = boxes[i].getAttribute("data-port");
      if (bp === sshPort && boxes[i].getAttribute("data-proto") === "tcp") {
        continue;
      }
      lines.push(ufwRule(bp, boxes[i].getAttribute("data-proto"), boxes[i].getAttribute("data-name"), src));
      bizCount++;
    }
  }
  if (customPort) {
    if (!(customPort === sshPort && customProto === "tcp")) {
      lines.push(ufwRule(customPort, customProto, "custom", src));
      bizCount++;
    }
  }
  if (bizCount === 0) {
    lines.push("# （未勾选或填写其他业务端口，如需放行请在上方勾选/填写）");
  }
  lines.push("");
  lines.push("# 步骤4：复核规则");
  lines.push("sudo ufw status numbered");
  lines.push("");
  lines.push("# 步骤5：启用或重载（未启用时执行 enable；已启用时改用 reload，不要两条都跑）");
  lines.push("sudo ufw --force enable");
  lines.push("# 已启用时改用： sudo ufw reload");
  lines.push("");
  lines.push("# 步骤6：从预期来源机器上验证（把 <服务器IP> 和端口换成真实值，在另一台机器/本地终端执行，不要在服务器本机测）");
  var verifyPort = customPort ? customPort : sshPort;
  lines.push("# nc -vz <服务器IP> " + verifyPort);
  lines.push("# curl -v http://<服务器IP>:" + verifyPort + "/");
  document.getElementById("ufw-out").textContent = lines.join("\n");
}
function showCopyToast() {
  var toast = document.getElementById("copy-toast");
  if (!toast) { return; }
  toast.style.display = "block";
  toast.style.opacity = "1";
  if (toast._hideTimer) {
    clearTimeout(toast._hideTimer);
  }
  toast._hideTimer = setTimeout(function () {
    toast.style.opacity = "0";
    setTimeout(function () {
      toast.style.display = "none";
    }, 300);
  }, 4500);
}
function bindCopy(btnId, outId, msgId) {
  var btn = document.getElementById(btnId);
  if (!btn) { return; }
  btn.addEventListener("click", function () {
    var text = document.getElementById(outId).textContent;
    navigator.clipboard.writeText(text).then(function () {
      document.getElementById(msgId).textContent = "已复制";
      showCopyToast();
    });
  });
}
function initGuideTools() {
  var out = document.getElementById("np-out");
  if (!out || out.getAttribute("data-ready") === "1") {
    return;
  }
  out.setAttribute("data-ready", "1");
  ["np-mode", "np-iface", "np-dhcp", "np-ip", "np-gw", "np-dns", "np-ip6", "np-gw6"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", npGenerate);
      el.addEventListener("change", npGenerate);
    }
  });
  document.querySelectorAll(".ufw-preset").forEach(function (el) {
    el.addEventListener("change", ufwGenerate);
  });
  ["ufw-ssh-port", "ufw-port", "ufw-proto", "ufw-src"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", ufwGenerate);
      el.addEventListener("change", ufwGenerate);
    }
  });
  bindCopy("np-copy", "np-out", "np-msg");
  bindCopy("ufw-copy", "ufw-out", "ufw-msg");
  npGenerate();
  ufwGenerate();
}
if (window.document$ && typeof document$.subscribe === "function") {
  document$.subscribe(initGuideTools);
}
document.addEventListener("DOMContentLoaded", initGuideTools);
initGuideTools();
</script>
