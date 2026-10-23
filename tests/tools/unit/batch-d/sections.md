## DNS 解析与记录查询

**本站唯一的联网工具。**点「查询」按钮后，浏览器会直接向你选的公共解析商（Cloudflare 或 Google 的 DoH 服务）发送查询请求，**查询的域名会发送给该解析商**——这是 DNS 查询的工作方式，解析商会看到域名与你的出口 IP；本站没有服务器经手、不记录、不保存任何查询内容。不点按钮就不会发出任何请求；其余工具仍然全部本地运行。查内网域名请用本机 `dig` / `nslookup`，公共解析商查不到内网记录。

<div>
  <p>
    <label>域名或 IP <input type="text" id="dns-name" value="example.com" size="28"></label>
    <label>记录类型
      <select id="dns-type">
        <option value="A" selected>A（IPv4 地址）</option>
        <option value="AAAA">AAAA（IPv6 地址）</option>
        <option value="CNAME">CNAME（别名）</option>
        <option value="MX">MX（邮件服务器）</option>
        <option value="TXT">TXT（验证 / SPF 等文本）</option>
        <option value="NS">NS（权威解析服务器）</option>
        <option value="CAA">CAA（证书签发授权）</option>
        <option value="SOA">SOA（区域起始授权）</option>
        <option value="PTR">PTR（IP 反查域名，填 IP 自动构造反向名）</option>
      </select>
    </label>
    <label>解析商
      <select id="dns-provider">
        <option value="cloudflare" selected>Cloudflare（cloudflare-dns.com）</option>
        <option value="google">Google（dns.google）</option>
      </select>
    </label>
  </p>
  <div id="dns-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="dns-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="dns-run">查询</button> <button type="button" id="dns-copy">复制结果</button> <button type="button" id="dns-clear">清空</button> <span id="dns-msg"></span></p>
</div>

!!! warning "结果判读边界"

    - 公共解析商返回的是**它此刻缓存/查询到的结果**，刚改完解析记录时各地生效时间不一致（看 TTL），查不到新记录先等 TTL 过期，不要立刻断言没改对。
    - NXDOMAIN 是「这个名字不存在」，NoError 但无记录是「名字存在、但没有这一类记录」，两者排查方向完全不同，结果里会分开说明。
    - 断网、解析商被网络环境拦截或接口异常时，本工具会明确报错，不会拿空结果冒充「没有记录」。

## HTTP 响应头与安全分析

把目标站点的响应头粘贴进来，逐项按 严重 / 警告 / 提示 / 良好 分级分析（HSTS、CSP、X-Content-Type-Options、防点击劫持、Referrer-Policy、Permissions-Policy、Server 信息泄露、Set-Cookie 属性、Cache-Control），每条给依据与改法。**本站不直接抓取任意网址**——浏览器同源策略（CORS）不允许网页随意读取别家站点的响应头，所以请先在你自己的终端用下方命令取头，再把输出整段粘贴回来；分析全程在浏览器本地完成，不上传。

<div>
  <p>
    <label>目标网址（只用于生成取头命令，本站不会访问它） <input type="text" id="hdr-url" value="https://example.com" size="30"></label>
  </p>
  <p>在你的终端执行这条命令，把输出整段复制到下方文本框：</p>
  <pre id="hdr-cmd" style="white-space: pre; overflow-x: auto;"></pre>
  <p>
    <textarea id="hdr-input" rows="12" style="width: 100%;" placeholder="把 curl -sI 的输出（或浏览器开发者工具 Network 里 Response Headers 的内容）粘贴到这里"></textarea>
  </p>
  <div id="hdr-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="hdr-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="hdr-run">开始分析</button> <button type="button" id="hdr-copy">复制结果</button> <button type="button" id="hdr-clear">清空</button> <span id="hdr-msg"></span></p>
</div>

!!! warning "分析边界"

    - 结论只基于你粘贴的这一份响应头：同一站点不同路径、登录前后、CDN 边缘与源站的响应头都可能不同，抽查登录页与敏感接口的响应最有价值。
    - 安全头是纵深防御的一层，不是漏洞扫描：CSP 配得再全也挡不住接口本身的越权，分析结果里「良好」只代表该响应头这一项没问题。
    - 输入上限 50000 字符，超出只分析前 50000 字符并在结果里注明。

## 端口与防火墙规划矩阵

先规划、再落地：逐行给每个服务选访问范围，本工具一次性生成规划矩阵摘要、合并后的完整 `ufw` 命令清单与风险清单。与上方「UFW 规则生成器」的分工不同：那个是想到一条加一条，这个是先把整台服务器的开放面盘清再成套出命令。**命令清单里 SSH 的放行永远排第一条**——先放行 SSH 再启用防火墙，是不把自己锁在门外的铁律。全程本地生成，不上传。

<div>
  <p>
    <label>内网网段（范围选「内网网段」时使用） <input type="text" id="fwm-lan" value="192.168.1.0/24" size="16"></label>
    <label>指定来源 IP（范围选「指定 IP」时使用） <input type="text" id="fwm-ip" value="203.0.113.10" size="14"></label>
    <label>默认入站策略
      <select id="fwm-policy">
        <option value="deny" selected>deny（拒绝，未放行的一律不通，推荐）</option>
        <option value="allow">allow（允许，未拒绝的一律放行，不推荐）</option>
      </select>
    </label>
  </p>
  <p>
    <label>SSH（22/tcp）
      <select id="fwm-ssh">
        <option value="public" selected>公网开放</option>
        <option value="local">仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none">不开放</option>
      </select>
    </label>
    <label>HTTP/HTTPS（80,443/tcp）
      <select id="fwm-web">
        <option value="public" selected>公网开放</option>
        <option value="local">仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none">不开放</option>
      </select>
    </label>
  </p>
  <p>
    <label>MySQL（3306/tcp）
      <select id="fwm-mysql">
        <option value="public">公网开放</option>
        <option value="local" selected>仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none">不开放</option>
      </select>
    </label>
    <label>PostgreSQL（5432/tcp）
      <select id="fwm-pg">
        <option value="public">公网开放</option>
        <option value="local" selected>仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none">不开放</option>
      </select>
    </label>
    <label>Redis（6379/tcp）
      <select id="fwm-redis">
        <option value="public">公网开放</option>
        <option value="local" selected>仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none">不开放</option>
      </select>
    </label>
  </p>
  <p>
    <label>自定义服务名 <input type="text" id="fwm-cname" value="myapp" size="10"></label>
    <label>自定义端口 <input type="number" id="fwm-cport" min="1" max="65535" value="8080" size="6"></label>
    <label>访问范围
      <select id="fwm-custom">
        <option value="public">公网开放</option>
        <option value="local">仅本机</option>
        <option value="lan">内网网段</option>
        <option value="ip">指定 IP</option>
        <option value="none" selected>不开放</option>
      </select>
    </label>
  </p>
  <div id="fwm-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="fwm-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="fwm-copy">复制结果</button> <button type="button" id="fwm-clear">清空</button> <span id="fwm-msg"></span></p>
</div>

!!! warning "执行前先想好退路"

    - `ufw enable` 之前保持当前 SSH 会话不要断，并预留云厂商控制台 / VNC 这类带外通道；规则写错时靠它救回来。
    - 「仅本机」不会生成放行命令，它依赖默认策略 deny + 服务本身只监听 127.0.0.1，两件事都要落实，只关防火墙不改监听地址，换个默认策略就暴露了。
    - 数据库与 Redis 公网开放会被标成严重风险：这类服务历史上多次出现未授权访问与弱口令爆破，确需远程访问优先走 SSH 隧道或 VPN，而不是直接开公网端口。
