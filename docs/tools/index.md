# 互动工具

两个纯前端小工具：在浏览器里填表，实时生成可复制的配置与命令，**不上传任何数据**。生成结果请先核对再落到服务器上执行。

!!! warning "使用前必读"

    - 生成器给的是通用模板，接口名、IP、端口必须换成你机器的真实值。
    - 改网络配置前先确保有控制台/带外管理通道，远程改 Netplan 有断联风险，先用 `netplan try` 验证。

## Netplan 配置生成器

填写后实时生成 `/etc/netplan/50-cloud-init.yaml` 内容。

<div>
  <p>
    <label>接口名 <input type="text" id="np-iface" value="eth0"></label>
    <label><input type="checkbox" id="np-dhcp"> 使用 DHCP 自动获取</label>
  </p>
  <p>
    <label>IP 地址 / CIDR <input type="text" id="np-ip" value="192.0.2.10/24"></label>
    <label>网关 <input type="text" id="np-gw" value="192.0.2.1"></label>
    <label>DNS（逗号分隔） <input type="text" id="np-dns" value="192.0.2.53"></label>
  </p>
  <pre id="np-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="np-copy">复制 YAML</button> <span id="np-msg"></span></p>
</div>

!!! note "YAML 缩进注意事项"

    - 只能用**空格**缩进，禁止 Tab；同一层级保持 2 空格对齐。
    - 冒号后面必须有空格（`version: 2`，不能写 `version:2`）。
    - 落盘后先 `sudo netplan --debug generate` 检查语法，再 `sudo netplan try` 可回滚试应用，最后 `sudo netplan apply`。
    - 新版 Netplan 要求配置文件权限收紧：`sudo chmod 600 /etc/netplan/50-cloud-init.yaml`，否则 apply 时会有权限警告。
    - 完整讲解见 [首次登录与网络配置](../01-basics/03-first-login-network.md)。

## UFW 规则生成器

勾选常用服务、按需加自定义端口，实时生成 `ufw` 命令组。

<div>
  <p>
    <label><input type="checkbox" class="ufw-preset" data-port="22" data-proto="tcp" data-name="SSH" checked> SSH（22/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="80" data-proto="tcp" data-name="HTTP"> HTTP（80/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="443" data-proto="tcp" data-name="HTTPS"> HTTPS（443/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="25565" data-proto="tcp" data-name="Minecraft"> Minecraft（25565/tcp）</label>
    <label><input type="checkbox" class="ufw-preset" data-port="8211" data-proto="udp" data-name="Palworld"> Palworld（8211/udp）</label>
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
  <pre id="ufw-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ufw-copy">复制命令</button> <span id="ufw-msg"></span></p>
</div>

!!! warning "放行前确认"

    - 启用 UFW 前务必先放行 SSH（或你改过的 SSH 端口），顺序反了会把自己锁在外面。
    - 云服务器还要同步放行**云厂商安全组**，两层缺一不可，见[防火墙](../02-security/03-firewall.md)与[端口三重门](../10-game-servers/01-port-opening.md)。

<script>
function npGenerate() {
  var iface = document.getElementById("np-iface").value.trim() || "eth0";
  var dhcp = document.getElementById("np-dhcp").checked;
  var lines = [];
  lines.push("# /etc/netplan/50-cloud-init.yaml");
  lines.push("network:");
  lines.push("  version: 2");
  lines.push("  ethernets:");
  lines.push("    " + iface + ":");
  if (dhcp) {
    lines.push("      dhcp4: true");
  } else {
    var ip = document.getElementById("np-ip").value.trim();
    var gw = document.getElementById("np-gw").value.trim();
    var dns = document.getElementById("np-dns").value.trim();
    lines.push("      dhcp4: false");
    lines.push("      addresses:");
    lines.push("        - " + ip);
    if (gw) {
      lines.push("      routes:");
      lines.push("        - to: default");
      lines.push("          via: " + gw);
    }
    if (dns) {
      var parts = dns.split(",");
      lines.push("      nameservers:");
      lines.push("        addresses:");
      for (var i = 0; i < parts.length; i++) {
        lines.push("          - " + parts[i].trim());
      }
    }
  }
  document.getElementById("np-out").textContent = lines.join("\n");
}
function ufwGenerate() {
  var lines = [];
  var boxes = document.querySelectorAll(".ufw-preset");
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) {
      lines.push("sudo ufw allow " + boxes[i].getAttribute("data-port") + "/" + boxes[i].getAttribute("data-proto") + " comment '" + boxes[i].getAttribute("data-name") + "'");
    }
  }
  var port = document.getElementById("ufw-port").value.trim();
  var proto = document.getElementById("ufw-proto").value;
  var src = document.getElementById("ufw-src").value.trim();
  if (port) {
    if (src) {
      lines.push("sudo ufw allow from " + src + " to any port " + port + " proto " + proto + " comment 'custom'");
    } else {
      lines.push("sudo ufw allow " + port + "/" + proto + " comment 'custom'");
    }
  }
  lines.push("sudo ufw --force enable");
  lines.push("sudo ufw status verbose");
  document.getElementById("ufw-out").textContent = lines.join("\n");
}
function bindCopy(btnId, outId, msgId) {
  document.getElementById(btnId).addEventListener("click", function () {
    var text = document.getElementById(outId).textContent;
    navigator.clipboard.writeText(text).then(function () {
      document.getElementById(msgId).textContent = "已复制";
    });
  });
}
function initGuideTools() {
  var out = document.getElementById("np-out");
  if (!out || out.getAttribute("data-ready") === "1") {
    return;
  }
  out.setAttribute("data-ready", "1");
  ["np-iface", "np-dhcp", "np-ip", "np-gw", "np-dns"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", npGenerate);
    document.getElementById(id).addEventListener("change", npGenerate);
  });
  document.querySelectorAll(".ufw-preset").forEach(function (el) {
    el.addEventListener("change", ufwGenerate);
  });
  ["ufw-port", "ufw-proto", "ufw-src"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", ufwGenerate);
    document.getElementById(id).addEventListener("change", ufwGenerate);
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
