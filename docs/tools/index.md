---
description: "互动工具：三十八个浏览器本地小工具——配置生成（Netplan、UFW、SSH、cloud-init、systemd、Nginx、GitHub Actions、Git 命令、curl）、计算规划（子网、Cron、权限、磁盘、备份、资源规划、版本比较、Docker 资源换算）、检查分析（TLS 证书、Compose 安全审查、日志分析、SSH 日志、.env 检查、HTTP 响应头、DNS 查询）与文本工具（格式转换、配置差异、正则测试、命令解释、HTTP 状态码查询），填表实时生成可直接复制的配置与命令；除 DNS 查询需经公共解析商外，其余全部本地运行、不上传任何数据。"
---

# 互动工具

三十八个纯前端小工具：在浏览器里填表或粘贴，实时生成可复制的配置与命令、或在本地完成解析计算，**不上传任何数据**。唯一例外是 DNS 查询：它需要向你选定的公共解析商（Cloudflare / Google 的 DoH 服务）发送查询，章节内有单独标注。本站工具**不执行任何命令**；生成结果请先在目标机上核对、审阅、验证后再使用，不要把「生成成功」当成「已在真实服务器验证」。

!!! warning "使用前必读"

    - 生成器给的是通用模板，接口名、IP、端口必须换成你机器的真实值。
    - 改网络配置前先确保有控制台/带外管理通道，远程改 Netplan 有断联风险，先用 `netplan try` 验证。

## 执行顺序与风险提示

各生成器产出的配置与命令，请按同一套顺序使用，不要生成后整段粘贴就执行：

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
  <div id="np-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
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

勾选常用服务、按需加自定义端口，实时生成分步的 `ufw` 命令组。SSH 端口单独填写，生成结果的第一条业务规则永远是放行该 SSH 端口。页面下半的「按服务规划」可成组勾选服务并附端口清单，适合先规划再逐项放行。

!!! danger "先放行 SSH 再启用 UFW"

    若你改过 SSH 端口，务必先放行新端口再启用 UFW，否则会把自己锁在门外；改规则前保持当前 SSH 会话不要断开。

<div>
  <p>
    <label>SSH 端口 <input type="text" id="ufw-ssh-port" inputmode="numeric" value="22"></label>
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
    <label>自定义端口 <input type="text" id="ufw-port" inputmode="numeric" placeholder="例如 8080，或范围 8000:8010"></label>
    <label>协议
      <select id="ufw-proto">
        <option value="tcp">tcp</option>
        <option value="udp">udp</option>
      </select>
    </label>
    <label>来源 IP（可选，留空=任意，支持 IPv4 / IPv6 及 CIDR） <input type="text" id="ufw-src" placeholder="192.0.2.100 或 2001:db8::1"></label>
  </p>
  <p><strong>按服务规划</strong>（成组勾选需要的服务：同步生成对应规则，结果末尾附「服务端口清单」逐项标注用途与风险；端口数据与[端口与协议目录](../reference/ports.md)同源维护）</p>
  <p>远程与网络：
    <label><input type="checkbox" class="ufw-plan" data-name="SSH" data-port="22" data-proto="tcp" data-use="远程登录与管理、SFTP / SCP 文件传输" data-risk="可暴露——前提是密钥登录、禁用口令与 root 直登，最好再限源 IP 或走跳板机"> SSH（22/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="DNS" data-port="53" data-proto="both" data-use="域名解析（大响应与区域传送走 TCP）" data-risk="分情况——权威解析可暴露；递归解析仅内网，对公网开放递归会被滥用为攻击反射源"> DNS（53/udp+tcp）</label>
  </p>
  <p>Web 与邮件：
    <label><input type="checkbox" class="ufw-plan" data-name="HTTP" data-port="80" data-proto="tcp" data-use="网站明文入口，一般只做跳转 HTTPS 与证书签发校验" data-risk="可暴露——业务内容必须 301 跳转到 443，不要在 80 上承载登录与业务"> HTTP（80/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="HTTPS" data-port="443" data-proto="tcp" data-use="网站加密入口，反向代理与站点对外服务的主端口" data-risk="可暴露——Web 服务的标准对外端口，确保 TLS 配置与证书续期正常"> HTTPS（443/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="SMTP" data-port="25" data-proto="tcp" data-use="服务器之间投递邮件（收信入口）" data-risk="可暴露——不开放就收不到外部邮件，但须做好防开放中继与发信信誉维护"> SMTP（25/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="Submission" data-port="587" data-proto="tcp" data-use="客户端提交发信（带认证与 STARTTLS）" data-risk="可暴露——必须启用认证与加密"> 邮件提交 Submission（587/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="IMAPS" data-port="993" data-proto="tcp" data-use="加密版 IMAP 邮件收取" data-risk="可暴露——对外提供邮箱同步的标准做法"> IMAPS（993/tcp）</label>
  </p>
  <p>数据库与缓存（默认只对内网，勾选后务必在上方限定来源 IP）：
    <label><input type="checkbox" class="ufw-plan" data-name="MySQL" data-port="3306" data-proto="tcp" data-use="关系型数据库连接" data-risk="仅内网——只放行应用服务器来源，裸奔公网是数据泄露高发入口"> MySQL（3306/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="PostgreSQL" data-port="5432" data-proto="tcp" data-use="关系型数据库连接" data-risk="仅内网——同上，并配合 pg_hba.conf 的来源限制"> PostgreSQL（5432/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="Redis" data-port="6379" data-proto="tcp" data-use="缓存与会话存储连接" data-risk="仅内网——未授权访问事件频发，至少绑定内网地址、设密码并改默认配置"> Redis（6379/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="MongoDB" data-port="27017" data-proto="tcp" data-use="文档数据库连接" data-risk="仅内网——必须开启认证并限定来源"> MongoDB（27017/tcp）</label>
  </p>
  <p>文件共享：
    <label><input type="checkbox" class="ufw-plan" data-name="Samba" data-port="445" data-proto="tcp" data-use="Windows 兼容的文件与打印共享" data-risk="仅内网——SMB 裸奔公网是勒索病毒的主要入口之一，跨网访问走 VPN"> Samba（445/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="NFS" data-port="2049" data-proto="both" data-use="Linux 之间网络文件系统共享" data-risk="仅内网——权限模型基本只认 IP 与 UID，只在可信内网使用并配 /etc/exports 白名单"> NFS（2049/udp+tcp）</label>
  </p>
  <p>监控：
    <label><input type="checkbox" class="ufw-plan" data-name="Prometheus" data-port="9090" data-proto="tcp" data-use="指标采集与 PromQL 查询界面" data-risk="经隧道或反代后暴露——自带界面无登录认证，外网查看请套反向代理加认证或只走内网"> Prometheus（9090/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="Grafana" data-port="3000" data-proto="tcp" data-use="监控仪表盘 Web 界面" data-risk="经隧道或反代后暴露——启用账号登录后可经反向代理对外，不要用默认口令直接开放"> Grafana（3000/tcp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="Node Exporter" data-port="9100" data-proto="tcp" data-use="向 Prometheus 暴露主机指标的采集端点" data-risk="仅内网——它没有任何认证，只应允许 Prometheus 服务器来抓取"> Node Exporter（9100/tcp）</label>
  </p>
  <p>组网与游戏：
    <label><input type="checkbox" class="ufw-plan" data-name="WireGuard" data-port="51820" data-proto="udp" data-use="现代 VPN 组网监听端口" data-risk="可暴露——协议对未认证数据包不作回应，暴露面小"> WireGuard（51820/udp）</label>
    <label><input type="checkbox" class="ufw-plan" data-name="Minecraft" data-port="25565" data-proto="tcp" data-use="游戏客户端连接入口" data-risk="可暴露——联机游戏必须对外，但请开白名单与正版验证"> Minecraft（25565/tcp）</label>
  </p>
  <div id="ufw-warn-db" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>最小权限警告：</strong>数据库端口不应直接向公网开放，建议在来源 IP 处限定为内网/应用服务器地址。
  </div>
  <div id="ufw-warn-admin" style="display: none; border: 1px solid #e65100; background: rgba(255, 145, 0, 0.12); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>最小权限警告：</strong>管理后台建议限定来源 IP，不要直接向公网任意来源开放（涉及端口 888、8888、8443、9090 等）。
  </div>
  <div id="ufw-warn-lock" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;">
    <strong>SSH 自锁检查：</strong>本次按服务规划没有勾选 SSH。若这台服务器还没有放行过 SSH 就启用 UFW，远程管理通道会被锁死。上方步骤 2 会先放行你填写的 SSH 端口——务必确认该端口与真实 SSH 端口一致、并保持当前会话不断开，再执行启用。
  </div>
  <div id="ufw-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="ufw-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ufw-copy">复制命令</button> <span id="ufw-msg"></span></p>
</div>

!!! warning "放行前确认"

    - 启用 UFW 前务必先放行 SSH（或你改过的 SSH 端口），顺序反了会把自己锁在外面。
    - 云服务器还要同步放行**云厂商安全组**，两层缺一不可，见[防火墙](../02-security/03-firewall.md)与[端口三重门](../10-game-servers/01-port-opening.md)。

## SSH 命令生成器

按命令类型填表，实时生成可复制的 `ssh` / `scp` 命令。本工具只在浏览器里拼字符串，**不会真的连接任何服务器，也不会收集或上传你填的内容**。系统讲解见 [SSH 专题](../14-ssh/index.md)。

!!! danger "私钥只填路径，绝不粘贴内容"

    - 「私钥路径」只填本地文件路径（如 `~/.ssh/id_ed25519`），**不要把私钥文件的内容粘贴到任何网页、聊天或仓库里**——私钥内容等于钥匙本身，泄露就立即换钥。
    - 执行前确认目标主机与端口无误；首次连接出现指纹提示时，先与服务器控制台显示的指纹核对再接受（方法见 [连接与客户端配置](../14-ssh/02-connect-config.md)）。

<div>
  <p>
    <label>命令类型
      <select id="ssh-type">
        <option value="login" selected>登录远程服务器</option>
        <option value="upload">上传文件（scp）</option>
        <option value="download">下载文件（scp）</option>
        <option value="local">本地端口转发（-L）</option>
        <option value="remote">远程端口转发（-R）</option>
        <option value="dynamic">动态转发（SOCKS）</option>
        <option value="debug">调试模式（-vvv）</option>
        <option value="jump">经跳板机（ProxyJump）</option>
      </select>
    </label>
  </p>
  <p>
    <label>服务器 IP 或域名 <input type="text" id="ssh-host" value="192.0.2.10"></label>
    <label>用户名 <input type="text" id="ssh-user" value="ubuntu"></label>
    <label>SSH 端口 <input type="number" id="ssh-port" min="1" max="65535" value="22"></label>
    <label>私钥路径（可选） <input type="text" id="ssh-key" placeholder="~/.ssh/id_ed25519"></label>
  </p>
  <div id="ssh-grp-file" style="display: none;">
    <p>
      <label>本地文件路径 <input type="text" id="ssh-local" value="./backup.tar.gz"></label>
      <label>远程路径 <input type="text" id="ssh-remote" value="/tmp/"></label>
    </p>
  </div>
  <div id="ssh-grp-fwd" style="display: none;">
    <p>
      <label>本地监听端口 <input type="number" id="ssh-listen" min="1" max="65535" value="8080"></label>
      <span id="ssh-fwd-targets">
        <label>目标主机（以服务器视角） <input type="text" id="ssh-thost" value="127.0.0.1"></label>
        <label>目标端口 <input type="number" id="ssh-tport" min="1" max="65535" value="80"></label>
      </span>
    </p>
  </div>
  <div id="ssh-grp-jump" style="display: none;">
    <p>
      <label>跳板机 <input type="text" id="ssh-jump" placeholder="ubuntu@192.0.2.1 或 config 别名"></label>
    </p>
  </div>
  <div id="ssh-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="ssh-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ssh-copy">复制命令</button> <span id="ssh-msg"></span></p>
</div>

### 多服务器别名配置：生成 ~/.ssh/config

服务器多了之后，每次拼地址、端口和跳板参数既累又易错：把每台服务器在 `~/.ssh/config` 里存成一个 Host 别名块，之后 `ssh 别名` 就能直连。下面按行填服务器（最多 3 台，用几台填几台），每条配置的简注会直接写进生成结果。本生成器只拼配置文本，**不收集密码，也没有粘贴私钥内容的地方**——私钥永远只填路径。

<div>
  <p><strong>服务器 1</strong></p>
  <p>
    <label>别名 Host <input type="text" id="cfg1-alias" value="web1"></label>
    <label>主机地址 HostName <input type="text" id="cfg1-host" value="192.0.2.10"></label>
    <label>用户名 User <input type="text" id="cfg1-user" value="ubuntu"></label>
  </p>
  <p>
    <label>端口 Port（可空，空或 22 不写） <input type="text" id="cfg1-port" inputmode="numeric" placeholder="2222"></label>
    <label>私钥路径 IdentityFile（可空） <input type="text" id="cfg1-key" placeholder="~/.ssh/id_ed25519"></label>
    <label>跳板机 ProxyJump（可空） <input type="text" id="cfg1-jump" placeholder="别名或 ubuntu@192.0.2.1"></label>
  </p>
  <p><strong>服务器 2</strong></p>
  <p>
    <label>别名 Host <input type="text" id="cfg2-alias" placeholder="db1"></label>
    <label>主机地址 HostName <input type="text" id="cfg2-host" placeholder="10.0.0.5"></label>
    <label>用户名 User <input type="text" id="cfg2-user" placeholder="ubuntu"></label>
  </p>
  <p>
    <label>端口 Port（可空） <input type="text" id="cfg2-port" inputmode="numeric" placeholder="2222"></label>
    <label>私钥路径 IdentityFile（可空） <input type="text" id="cfg2-key" placeholder="~/.ssh/id_db"></label>
    <label>跳板机 ProxyJump（可空） <input type="text" id="cfg2-jump" placeholder="填服务器 1 的别名即经它中转"></label>
  </p>
  <p><strong>服务器 3</strong></p>
  <p>
    <label>别名 Host <input type="text" id="cfg3-alias" placeholder="backup1"></label>
    <label>主机地址 HostName <input type="text" id="cfg3-host" placeholder="192.0.2.30"></label>
    <label>用户名 User <input type="text" id="cfg3-user" placeholder="ubuntu"></label>
  </p>
  <p>
    <label>端口 Port（可空） <input type="text" id="cfg3-port" inputmode="numeric" placeholder="2222"></label>
    <label>私钥路径 IdentityFile（可空） <input type="text" id="cfg3-key" placeholder="~/.ssh/id_ed25519"></label>
    <label>跳板机 ProxyJump（可空） <input type="text" id="cfg3-jump" placeholder="别名或 ubuntu@192.0.2.1"></label>
  </p>
  <p><strong>连接保活与超时（写入每个 Host 块，可空=不写该行）</strong></p>
  <p>
    <label>保活间隔 ServerAliveInterval（秒） <input type="text" id="cfg-alive" inputmode="numeric" value="60"></label>
    <label>保活次数 ServerAliveCountMax <input type="text" id="cfg-alivemax" inputmode="numeric" value="3"></label>
    <label>连接超时 ConnectTimeout（秒） <input type="text" id="cfg-timeout" inputmode="numeric" value="10"></label>
  </p>
  <div id="cfg-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="cfg-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="cfg-copy">复制 config</button> <span id="cfg-msg"></span></p>
</div>

!!! warning "密钥与文件权限"

    - 配置落盘后先收紧权限：`chmod 600 ~/.ssh/config`；私钥文件同样必须是 600，权限过宽时 ssh 会拒绝使用该私钥。
    - 别名不要重复：config 里同名 Host 只会命中第一个块，后面的同名块会被静默忽略（本生成器会直接拦下重名）。
    - 生成后先用 `ssh -G 别名` 离线核对最终生效配置，确认无误再实际连接（生成结果末尾已附这两条验证命令）。

!!! note "生成器覆盖不到的用法"

    - 连接复用（ControlMaster）、匹配规则（Match 块）等更进阶的 config 写法仍建议手写，见 [连接与客户端配置](../14-ssh/02-connect-config.md)。
    - 大文件、增量同步与断点续传用 `rsync`，见 [文件传输与远程执行](../14-ssh/04-transfer-remote-exec.md)；三种转发与跳板机的原理和排坑见 [隧道与跳板机](../14-ssh/05-tunnels-jump.md)。

## 子网 / CIDR 计算器

输入 IPv4 地址与前缀长度（或子网掩码），立即算出网络地址、广播地址、可用主机范围与主机数。切换到 IPv6 后，输入 IPv6 地址与前缀（0–128），算出展开/压缩写法、网络地址、地址范围与地址总数；IPv6 没有广播地址，地址范围内的地址都可分配。只做本地计算与格式校验，非法输入会直接报错、不给结果。

<div>
  <p>
    <label>地址族
      <select id="sub-family">
        <option value="v4" selected>IPv4</option>
        <option value="v6">IPv6</option>
      </select>
    </label>
  </p>
  <p>
    <label>计算方式
      <select id="sub-mode">
        <option value="cidr" selected>按 CIDR 前缀</option>
        <option value="mask">按子网掩码</option>
      </select>
    </label>
  </p>
  <p>
    <label>IP 地址 <input type="text" id="sub-ip" value="192.0.2.10"></label>
    <label id="sub-grp-prefix">CIDR 前缀（0–32） <input type="number" id="sub-prefix" min="0" max="32" value="24"></label>
    <label id="sub-grp-mask" style="display: none;">子网掩码 <input type="text" id="sub-mask" value="255.255.255.0"></label>
    <label id="sub-grp-prefix6" style="display: none;">IPv6 前缀（0–128） <input type="number" id="sub-prefix6" min="0" max="128" value="64"></label>
  </p>
  <div id="sub-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="sub-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="sub-copy">复制结果</button> <span id="sub-msg"></span></p>
</div>

!!! note "结果判读"

    - `/31` 是点对点链路特例（RFC 3021）：两个地址都可用，不再预留网络地址与广播地址。
    - `/32` 是单个主机地址（主机路由），可用主机数就是 1。
    - IPv6 没有广播地址：不存在预留的网络/广播地址，子网内全部地址都可分配；`/64` 是最常见的子网大小（无状态地址自动配置 SLAAC 就要求 /64）。
    - IPv6 特殊地址：`::1/128` 是回环地址（相当于 IPv4 的 127.0.0.1），`::` 是未指定地址，`fe80::/10` 是链路本地地址（只在本地链路有效，一般还要带接口后缀如 `fe80::1%eth0`）；输入命中时工具会在结果里给出提示。
    - 掩码必须是 1 连续、0 连续（如 `255.255.255.128` 合法，`255.255.0.255` 不合法），不连续的掩码会被本工具拒绝。
    - 掩码与 CIDR 的基础概念见 [网络诊断速查](../15-command-reference/03-network-diagnostics.md)，地址落地到 Netplan 见 [首次登录与网络配置](../01-basics/03-first-login-network.md)。

## Cron 表达式生成器

按字段拼出 cron 表达式，并同步给出人话解读与等价的 systemd timer 写法。cron 与 systemd timer 二选一即可，同一个任务不要两边都排，会重复执行。

<div>
  <p>
    <label>常用预设
      <select id="cron-preset">
        <option value="custom" selected>自定义（手动拼字段）</option>
        <option value="m5">每 5 分钟</option>
        <option value="hourly">每小时（第 0 分）</option>
        <option value="daily">每天凌晨 0 点</option>
        <option value="weekly">每周一凌晨 0 点</option>
        <option value="monthly">每月 1 号凌晨 0 点</option>
      </select>
    </label>
  </p>
  <p>
    <label>分钟（0–59）
      <select id="cron-min-mode">
        <option value="any" selected>每分钟</option>
        <option value="step">每隔</option>
        <option value="at">指定</option>
      </select>
    </label>
    <label id="cron-min-grp-step" style="display: none;">每隔 <input type="number" id="cron-min-step" min="1" max="60" value="5"> 分钟</label>
    <label id="cron-min-grp-at" style="display: none;">指定值（逗号分隔） <input type="text" id="cron-min-at" value="0"></label>
  </p>
  <p>
    <label>小时（0–23）
      <select id="cron-hour-mode">
        <option value="any" selected>每小时</option>
        <option value="step">每隔</option>
        <option value="at">指定</option>
      </select>
    </label>
    <label id="cron-hour-grp-step" style="display: none;">每隔 <input type="number" id="cron-hour-step" min="1" max="24" value="2"> 小时</label>
    <label id="cron-hour-grp-at" style="display: none;">指定值（逗号分隔） <input type="text" id="cron-hour-at" value="0"></label>
  </p>
  <p>
    <label>日（1–31）
      <select id="cron-dom-mode">
        <option value="any" selected>每天</option>
        <option value="step">每隔</option>
        <option value="at">指定</option>
      </select>
    </label>
    <label id="cron-dom-grp-step" style="display: none;">每隔 <input type="number" id="cron-dom-step" min="1" max="31" value="2"> 天</label>
    <label id="cron-dom-grp-at" style="display: none;">指定值（逗号分隔） <input type="text" id="cron-dom-at" value="1"></label>
  </p>
  <p>
    <label>月（1–12）
      <select id="cron-mon-mode">
        <option value="any" selected>每月</option>
        <option value="step">每隔</option>
        <option value="at">指定</option>
      </select>
    </label>
    <label id="cron-mon-grp-step" style="display: none;">每隔 <input type="number" id="cron-mon-step" min="1" max="12" value="3"> 个月</label>
    <label id="cron-mon-grp-at" style="display: none;">指定值（逗号分隔） <input type="text" id="cron-mon-at" value="1"></label>
  </p>
  <p>
    <label>周（0–7，0 与 7 都是周日）
      <select id="cron-dow-mode">
        <option value="any" selected>每天</option>
        <option value="step">每隔</option>
        <option value="at">指定</option>
      </select>
    </label>
    <label id="cron-dow-grp-step" style="display: none;">每隔 <input type="number" id="cron-dow-step" min="1" max="8" value="2"> 天</label>
    <label id="cron-dow-grp-at" style="display: none;">指定值（逗号分隔） <input type="text" id="cron-dow-at" value="1"></label>
  </p>
  <div id="cron-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="cron-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="cron-copy">复制结果</button> <span id="cron-msg"></span></p>
</div>

!!! note "读法与落地"

    - 表达式五段依次是：分、时、日、月、周。写进 crontab 后用 `crontab -l` 复核；timer 侧用 `systemctl list-timers` 查看下一次触发时间。
    - cron 里「日」与「周」同时受限时是**或**关系（任一满足就触发），systemd 的 OnCalendar 是**且**关系，两边同时受限时不要直接照搬。
    - OnCalendar 与 cron 不完全等价（步进与多值最容易对不上），工具给出的等价写法只是起点，写入 `.timer` 前先在目标机用 `systemd-analyze calendar '值'` 校验。
    - 完整讲解见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md) 与 [定时、容器与系统速查](../15-command-reference/06-scheduling-containers-more.md)。

### Cron 与 systemd timer：八维度对比

同一个定时任务只能选一边排，两边都排会重复执行。先按下表对号入座，再决定用哪个。

| 维度 | cron | systemd timer |
|---|---|---|
| 触发方式 | 五字段表达式（分 时 日 月 周），外加 `@daily` 等别名；由 cron 守护进程按分钟轮询触发 | `.timer` unit 配 `OnCalendar=`（日历事件）或 `OnBootSec=` / `OnUnitActiveSec=`（相对时间），由 systemd（PID 1）直接触发对应的 `.service` |
| 时间精度 | 分钟级，最小间隔 1 分钟，秒级任务只能在脚本里自己循环 | 秒级（`OnCalendar` 可写到秒），还能用相对时间表达「开机后 10 分钟」「上次运行后 2 小时」这类 cron 写不出的触发 |
| 错过执行补偿 | 没有：关机、休眠、维护期间到点的任务直接错过，不补跑 | `Persistent=true` 时，错过的触发在下次开机后补跑一次（备份、报表类任务的关键差异） |
| 环境与工作目录 | 环境极简：只有 HOME、LOGNAME、PATH 等少数变量，不读登录 shell 配置；工作目录固定是家目录，PATH 不全是最常见的「手动能跑、定时不跑」原因 | 作为服务运行：`WorkingDirectory=` 定工作目录，`Environment=` / `EnvironmentFile=` 显式注入变量，`User=` 定身份，行为可复现 |
| 日志 | 默认不留痕：输出靠本机邮件（多数机器没配）或脚本里自己重定向到文件，排查要先找日志在哪 | 输出自动进 journal：`journalctl -u 服务名` 按时间查，带轮转与保留策略，`systemctl status` 还能看上次运行结果 |
| 失败处理 | 没有内建机制：失败无人知晓，重试、超时、告警都要脚本自己写 | 服务侧可配 `Restart=` / `RestartSec=` 重试、`TimeoutStartSec=` 超时终止，失败状态在 `systemctl` 里可见，可再用 `OnFailure=` 联动告警 unit |
| 依赖关系 | 无依赖概念：任务之间、任务与网络/服务就绪之间无法声明先后，只能在脚本里 sleep 或轮询探测 | 可用 `After=` / `Requires=` / `Wants=` 与网络、挂载、目标服务编排，还能被其他 unit 一起启停 |
| 典型适用场景 | 独立小脚本、分钟级固定周期、对错过不敏感的清理类任务；从老系统迁移过来的现成 crontab | 不能错过的周期任务（备份、证书续期检查）、要跟服务联动的任务、需要日志与失败可见的正经运维任务；秒级或相对时间触发 |

选型建议：

- **先问能不能错过。** 夜间关机时段的备份、报表这类「错过一次就得补」的任务，直接选 systemd timer 并开 `Persistent=true`，这一项 cron 无解。
- **再问要不要联动。** 要等某个服务就绪、跟服务一起启停、失败要有人（或系统）知道 → systemd timer；完全独立、跑完就算的脚本 → 往下看。
- **剩下的看省事程度。** 固定周期跑一个独立小脚本，cron 五字段最直观（用上方生成器拼）；需要秒级精度、开机后延迟、距上次运行间隔这类触发，或想把日志和状态管起来，选 systemd timer（用下方 Timer 生成器）。
- 拿不准时默认选 systemd timer：它多出的日志、状态与补跑能力，在第一次半夜出问题时就值回票价。

## systemd Unit 生成器

填服务信息，生成完整的 `.service` 文件（注释一律独占一行）与落地命令。unit 文件的注释**不能跟在配置行行尾**——行尾的 `#` 会被当成参数的一部分，ExecStart 尤其容易中招，所以本工具把每条简注都放在对应配置行的上一行。

<div>
  <p>
    <label>服务名 <input type="text" id="unit-name" value="myapp"></label>
    <label>描述 <input type="text" id="unit-desc" value="我的应用服务"></label>
  </p>
  <p>
    <label>启动命令 ExecStart（绝对路径） <input type="text" id="unit-exec" value="/usr/local/bin/myapp --serve" size="42"></label>
  </p>
  <p>
    <label>工作目录（可空） <input type="text" id="unit-workdir" value="/srv/myapp"></label>
    <label>运行用户（可空，空= root） <input type="text" id="unit-user" placeholder="www-data"></label>
  </p>
  <p>
    <label>重启策略
      <select id="unit-restart">
        <option value="no">no（不重启）</option>
        <option value="on-failure" selected>on-failure（异常退出才重启）</option>
        <option value="always">always（总是重启）</option>
        <option value="on-success">on-success（正常退出才重启）</option>
        <option value="on-abnormal">on-abnormal（被信号杀死/超时才重启）</option>
        <option value="on-watchdog">on-watchdog（看门狗超时才重启）</option>
        <option value="on-abort">on-abort（收到未捕获信号才重启）</option>
      </select>
    </label>
    <label>重启间隔 RestartSec（秒，可空） <input type="number" id="unit-restartsec" min="0" max="3600" placeholder="5"></label>
  </p>
  <p>
    <label>内存上限 MemoryMax（可空，如 512M） <input type="text" id="unit-mem" placeholder="512M"></label>
    <label>CPU 配额 CPUQuota（可空，如 50%） <input type="text" id="unit-cpu" placeholder="50%"></label>
  </p>
  <p>
    <label>环境文件 EnvironmentFile（可空） <input type="text" id="unit-envfile" placeholder="/etc/myapp/env"></label>
    <label><input type="checkbox" id="unit-envfile-opt"> 文件不存在时忽略（生成时给路径加 - 前缀）</label>
  </p>
  <p>
    <label>环境变量 Environment（可空，每行一个 KEY=VALUE，值里的引号与 % 会自动转义）<br>
    <textarea id="unit-env" rows="2" cols="48" placeholder="APP_ENV=production"></textarea></label>
  </p>
  <p>
    <label>额外 After（可空，空格分隔） <input type="text" id="unit-after" placeholder="postgresql.service"></label>
    <label>Wants 弱依赖（可空） <input type="text" id="unit-wants" placeholder="redis-server.service"></label>
    <label>Requires 强依赖（可空） <input type="text" id="unit-requires" placeholder="mysql.service"></label>
  </p>
  <p>
    <label>标准输出 StandardOutput
      <select id="unit-stdout">
        <option value="" selected>不设置（systemd 默认）</option>
        <option value="journal">journal（进 journald）</option>
        <option value="syslog">syslog</option>
        <option value="null">null（丢弃）</option>
      </select>
    </label>
    <label>标准错误 StandardError
      <select id="unit-stderr">
        <option value="" selected>不设置（默认）</option>
        <option value="journal">journal（进 journald）</option>
        <option value="syslog">syslog</option>
        <option value="null">null（丢弃）</option>
        <option value="inherit">inherit（与标准输出一致）</option>
      </select>
    </label>
  </p>
  <p>安全加固选项（按需勾选，生成结果里逐项附影响说明；加固过头会让应用读写失败，先在测试机验证再上生产）：
    <label><input type="checkbox" id="unit-h-nnp"> NoNewPrivileges</label>
    <label><input type="checkbox" id="unit-h-ptmp"> PrivateTmp</label>
    <label><input type="checkbox" id="unit-h-psys"> ProtectSystem=strict</label>
    <label><input type="checkbox" id="unit-h-phome"> ProtectHome</label>
    <label><input type="checkbox" id="unit-h-pdev"> PrivateDevices</label>
    <label><input type="checkbox" id="unit-h-pkt"> ProtectKernelTunables</label>
  </p>
  <div id="unit-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="unit-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="unit-copy">复制 Unit 与命令</button> <span id="unit-msg"></span></p>
</div>

!!! warning "落地注意"

    - 以 root 运行的服务等于把应用漏洞放大成系统级风险：能用普通用户就填普通用户，并确认该用户对工作目录与日志路径有权限。
    - 改完 unit 必须 `systemctl daemon-reload` 才生效；`enable --now` 是「设为开机自启 + 立即启动」两件事一起做。
    - 勾选 ProtectSystem=strict 后，应用对文件系统的写入会全面只读（包括 /var、/home）：应用需要写数据目录时，必须再手动加一行 `ReadWritePaths=/你的数据目录` 并先在测试机验证，否则服务会以「看起来启动了、实际写不进去」的方式失败。
    - unit 的依赖、资源限制与看门狗等工程化要点见 [Systemd 服务与定时任务](../07-automation/02-systemd-timers.md) 与 [服务工程化与配置漂移](../07-automation/04-systemd-engineering-drift.md)。

## Nginx 反向代理生成器

生成把域名流量转发到后端服务的 `server` 块，`proxy_set_header` 真实 IP 头全套（Host、X-Real-IP、X-Forwarded-For、X-Forwarded-Proto）默认带齐；勾选 WebSocket 时自动带上协议升级头，勾选强制 HTTPS 时额外生成 80 跳转块与 Let's Encrypt 证书路径（证书要先用 certbot 签出来，见下方链接）。进阶选项在下方：多后端 upstream 负载均衡、三项 proxy 超时、limit_req 限流、以及前面挂了 CDN 时用的 set_real_ip_from 真实 IP 还原——都不勾时生成结果与原来完全一致。

<div>
  <p>
    <label>域名（server_name） <input type="text" id="ngx-domain" value="example.com"></label>
  </p>
  <p>
    <label>后端协议
      <select id="ngx-proto">
        <option value="http" selected>http</option>
        <option value="https">https</option>
      </select>
    </label>
    <label>后端地址 <input type="text" id="ngx-host" value="127.0.0.1"></label>
    <label>后端端口 <input type="number" id="ngx-port" min="1" max="65535" value="3000"></label>
  </p>
  <p>
    <label><input type="checkbox" id="ngx-ws"> 后端是 WebSocket 服务（带 Upgrade 头）</label>
    <label><input type="checkbox" id="ngx-https"> 强制 HTTPS（生成 443 块 + 80 跳转，证书路径按 Let's Encrypt 默认位置）</label>
  </p>
  <p>
    <label><input type="checkbox" id="ngx-multi"> 多后端负载均衡（生成 upstream 块，下方逐行填后端，启用后上方「后端地址/端口」不再使用）</label>
  </p>
  <div id="ngx-grp-multi" style="display: none;">
    <p>
      <label>upstream 名称 <input type="text" id="ngx-upname" value="backend_pool"></label>
    </p>
    <p>
      <label>负载均衡策略
        <select id="ngx-lb">
          <option value="rr" selected>轮询（按权重分配，Nginx 默认）</option>
          <option value="least_conn">least_conn 最少连接（连接数最少的后端优先，长连接/耗时不均时更均衡）</option>
          <option value="ip_hash">ip_hash 来源 IP 哈希（同一访客固定落到同一后端，做会话粘性）</option>
        </select>
      </label>
    </p>
    <p>
      <label>后端列表（每行一个：地址:端口，可跟空格 + 权重，权重越大分到的请求越多，不写即 1）<br>
      <textarea id="ngx-upstreams" rows="3" cols="48">127.0.0.1:3000
127.0.0.1:3001</textarea></label>
    </p>
  </div>
  <p>
    <label>连接超时 proxy_connect_timeout（秒，可空） <input type="text" id="ngx-t-conn" inputmode="numeric" placeholder="60" size="4"></label>
    <label>发送超时 proxy_send_timeout（秒，可空） <input type="text" id="ngx-t-send" inputmode="numeric" placeholder="60" size="4"></label>
    <label>读取超时 proxy_read_timeout（秒，可空） <input type="text" id="ngx-t-read" inputmode="numeric" placeholder="60" size="4"></label>
  </p>
  <p>
    <label><input type="checkbox" id="ngx-limit"> 启用限流 limit_req（按来源 IP 限速，生成结果会说明 zone 定义该写在哪）</label>
    <label>速率（次/秒） <input type="text" id="ngx-limit-rate" inputmode="numeric" value="10" size="4"></label>
    <label>突发 burst <input type="text" id="ngx-limit-burst" inputmode="numeric" value="20" size="4"></label>
  </p>
  <p>
    <label><input type="checkbox" id="ngx-realip"> 前面有 CDN / 可信代理（启用 set_real_ip_from 还原真实 IP）</label>
    <label>可信代理地址段 <input type="text" id="ngx-realip-from" placeholder="如 10.0.0.0/8 或 CDN 公布的地址段"></label>
  </p>
  <div id="ngx-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="ngx-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ngx-copy">复制配置</button> <span id="ngx-msg"></span></p>
</div>

!!! warning "改 Nginx 配置的固定顺序"

    1. 先备份现有配置：`sudo cp -a /etc/nginx /etc/nginx.bak-$(date +%F)`。
    2. 落盘后先测语法：`sudo nginx -t`，通过才 `sudo systemctl reload nginx`；语法不过不要 reload，更不要 restart 硬顶。
    3. reload 后从外部网络验证域名与证书，再看 `sudo tail -n 50 /var/log/nginx/error.log` 有没有新错误。
    4. 多后端模式生成的是开源版**被动**健康检查（max_fails / fail_timeout)：定时主动探活是 NGINX Plus 商业版功能，开源版没有，不要照抄 Plus 文档里的 health_check 指令。
    5. 完整讲解见 [Web 服务器与反向代理](../04-network/02-web-proxy.md)，证书签发与自动续期见 [HTTPS 自动化证书](../09-web-hosting/05-https-certificates.md)。

## Docker Compose 模板生成器

勾选要跑的服务，生成 `docker-compose.yml`：命名卷持久化、统一桥接网络、数据库带健康检查。所有密码都是 `CHANGE_ME_*` 占位符，**落盘前必须全部替换为强密码**，且真实密码不要提交进 Git。

<div>
  <p>
    <label><input type="checkbox" class="dc-svc" data-key="nginx"> Nginx（反向代理 / 静态站）</label>
    <label><input type="checkbox" class="dc-svc" data-key="mysql" checked> MySQL</label>
    <label><input type="checkbox" class="dc-svc" data-key="postgres"> PostgreSQL</label>
    <label><input type="checkbox" class="dc-svc" data-key="redis"> Redis</label>
    <label><input type="checkbox" class="dc-svc" data-key="wordpress"> WordPress（自动带 MySQL）</label>
  </p>
  <p>
    <label><input type="checkbox" id="dc-local"> 端口只绑定 127.0.0.1（只给本机或反向代理访问，数据库强烈建议勾上）</label>
  </p>
  <div id="dc-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="dc-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="dc-copy">复制 Compose 文件</button> <span id="dc-msg"></span></p>
</div>

!!! warning "Compose 落地注意"

    - 数据库端口直接映射到宿主机等于绕过一部分防火墙直觉：只给本机/反代用就勾「仅本地绑定」，必须远程连库时再配合 UFW 限定来源（见上方 UFW 生成器）。
    - `depends_on` 只保证启动顺序，不保证数据库已经能接受连接；模板里给数据库配了 healthcheck 并让 WordPress 等它 healthy 再起，就是为了避开这个坑。
    - 镜像版本标签请按 Docker Hub 当前发布核对后锁定，不要长期跟 `latest`。完整的应用编排讲解见 [Docker 部署常用应用](../09-web-hosting/04-docker-apps.md)。

## LVM 扩容步骤生成器

按你的 PV / VG / LV 信息生成**有序的扩容步骤**（含每步的检查命令）。本工具只生成步骤文本，不会自动执行任何命令；请人工逐条执行、逐条核对输出后再走下一步。

<div>
  <p>
    <label>PV 设备 <input type="text" id="lvm-dev" value="/dev/sdb"></label>
    <label><input type="checkbox" id="lvm-newpv" checked> 这是新设备，需要先 pvcreate 初始化</label>
  </p>
  <p>
    <label>VG 名 <input type="text" id="lvm-vg" value="vg0"></label>
    <label>LV 名 <input type="text" id="lvm-lv" value="data"></label>
    <label>挂载点 <input type="text" id="lvm-mount" value="/data"></label>
  </p>
  <p>
    <label>扩容方式
      <select id="lvm-mode">
        <option value="add" selected>增加指定大小</option>
        <option value="full">扩到 100%FREE（吃掉 VG 全部空闲）</option>
      </select>
    </label>
    <label id="lvm-grp-size">增加 <input type="number" id="lvm-size" min="1" value="10">
      <select id="lvm-unit">
        <option value="G" selected>G</option>
        <option value="M">M</option>
        <option value="T">T</option>
      </select>
    </label>
    <label>文件系统
      <select id="lvm-fs">
        <option value="ext4" selected>ext4（resize2fs）</option>
        <option value="xfs">XFS（xfs_growfs）</option>
      </select>
    </label>
  </p>
  <div id="lvm-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="lvm-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="lvm-copy">复制步骤</button> <span id="lvm-msg"></span></p>
</div>

!!! danger "扩容是单向门：只扩不缩"

    - **缩容不在本工具范围内**：LV 缩容要先缩文件系统再缩 LV，ext4 操作繁琐、XFS 根本不支持缩容，误操作直接丢数据，必须人工评估、单独规划，本工具不生成任何缩容命令。
    - `pvcreate` 会抹掉目标设备上的原有签名与数据：执行前用 `lsblk` 与 `sudo pvs` 逐字核对设备名，选错盘的后果不可逆。
    - 扩容前先确认备份可恢复（见 [磁盘健康与备份](../03-storage/04-backup.md)）；每扩一步先看检查命令的输出，容量对不上立刻停下，不要连着往下跑。
    - LVM 概念与完整操作见 [LVM 动态卷管理](../03-storage/01-lvm.md)。

## TLS 证书检查与续期计算

把一张证书的 PEM 文本粘贴进来，即可在本地解析出有效期、签发者、SAN、指纹与剩余天数，并按场景生成续期检查命令。解析全程在本机浏览器完成，不上传。

!!! danger "只粘贴证书，绝不要粘贴私钥"

    - 本工具只有证书输入框，**没有也不需要私钥输入**：证书是公开信息，私钥一旦粘贴进任何网页就应视为已泄露。
    - 若粘贴内容里检出 `PRIVATE KEY` 块，工具会立即拒绝并警告。
    - 本工具只做**证书解析**（读字段与有效期），**不做证书链验证与吊销检查**；「解析成功」不等于「证书可信」，可信与否以浏览器/系统的链验证为准。

<div>
  <p>
    <textarea id="cert-pem" rows="8" style="width: 100%;" placeholder="-----BEGIN CERTIFICATE----- 粘贴证书 PEM（只有 CERTIFICATE 块，不要带私钥）"></textarea>
  </p>
  <p>
    <label>域名（生成命令用，可留空，留空时取证书 SAN 的第一个 DNS 名）
      <input type="text" id="cert-domain" value="">
    </label>
    <label>续期场景
      <select id="cert-scene">
        <option value="online" selected>在线检查（openssl / curl 查公网证书）</option>
        <option value="certbot">Certbot 续期演练</option>
        <option value="acme">acme.sh 续期</option>
      </select>
    </label>
  </p>
  <div id="cert-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="cert-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="cert-copy">复制结果</button> <span id="cert-msg"></span></p>
</div>

剩余天数分级与下方速查卡一致：**大于 30 天**正常；**15–30 天**确认自动续期在跑；**小于 15 天**立即手动续期并排查自动续期为何没生效；**已过期**先恢复站点可用再复盘。

### 命令行速查卡（不粘贴证书时）

不用登录服务器，在任意装有 openssl 或 curl 的机器上就能查公网证书的到期时间：

```bash
# 方法一：openssl（信息最全）
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates

# 方法二：curl（只看关键行）
curl -sv https://example.com --output /dev/null 2>&1 | grep -iE 'expire|start date'
```

输出判读：

- `notBefore` 是生效时间，`notAfter` 是到期时间；curl 输出里对应 `start date` 与 `expire date`。
- `-servername` 不能省：同一 IP 上托管多个站点（SNI）时，不带它查到的可能是默认站点的证书。
- 剩余时间阈值建议：**大于 30 天**正常；**15–30 天**确认自动续期在跑；**小于 15 天**立即手动续期并排查自动续期为何没生效；**已过期**先恢复站点可用再复盘。
- 续期机制与到期监控见 [证书与密钥生命周期](../02-security/08-certificate-lifecycle.md)，certbot / acme.sh 签发与自动续期见 [HTTPS 自动化证书](../09-web-hosting/05-https-certificates.md)。

## Linux 权限计算器

勾选权限位或直接填八进制，两边实时同步；下方同时算出指定 umask 下新建文件与目录的默认权限。

<div>
  <p>
    属主：
    <label><input type="checkbox" id="perm-o-r" checked> 读 r</label>
    <label><input type="checkbox" id="perm-o-w" checked> 写 w</label>
    <label><input type="checkbox" id="perm-o-x"> 执行 x</label>
    属组：
    <label><input type="checkbox" id="perm-g-r" checked> 读 r</label>
    <label><input type="checkbox" id="perm-g-w"> 写 w</label>
    <label><input type="checkbox" id="perm-g-x"> 执行 x</label>
    其他：
    <label><input type="checkbox" id="perm-t-r" checked> 读 r</label>
    <label><input type="checkbox" id="perm-t-w"> 写 w</label>
    <label><input type="checkbox" id="perm-t-x"> 执行 x</label>
  </p>
  <p>
    特殊位：
    <label><input type="checkbox" id="perm-suid"> setuid</label>
    <label><input type="checkbox" id="perm-sgid"> setgid</label>
    <label><input type="checkbox" id="perm-sticky"> sticky</label>
  </p>
  <p>
    <label>八进制 <input type="text" id="perm-oct" value="644"></label>
    <label>umask <input type="text" id="perm-umask" value="022"></label>
  </p>
  <div id="perm-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="perm-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="perm-copy">复制结果</button> <span id="perm-msg"></span></p>
</div>

!!! note "最常见的两个误解"

    - 目录的 `r` 只够列出文件名；没有 `x` 就不能进入目录、也访问不了其中文件的元数据——给目录只授 `r` 是最常见的权限误配。
    - 给普通文件 `777` 等于任何人可改可执行，是「图省事」式高危授权；先按属主/属组/其他三段最小授权，再考虑 ACL 做细粒度补充。本工具只算基础权限位，ACL 与能力（capabilities）不在此列。

## Hash 计算器

对文本或本地文件计算 SHA-256 / SHA-512，可与预期哈希比对。文件只在本机浏览器内分块读取，**不上传**。

<div>
  <p>
    <textarea id="hash-text" rows="3" style="width: 100%;" placeholder="输入要计算摘要的文本（选了文件时以文件为准）"></textarea>
  </p>
  <p>
    <label>本地文件 <input type="file" id="hash-file"></label>
    <label>算法
      <select id="hash-algo">
        <option value="SHA-256" selected>SHA-256</option>
        <option value="SHA-512">SHA-512</option>
      </select>
    </label>
  </p>
  <p>
    <label>预期哈希（可选，用于比对） <input type="text" id="hash-expect" value="" style="width: 32em;"></label>
  </p>
  <div id="hash-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="hash-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="hash-copy">复制结果</button> <span id="hash-msg"></span></p>
</div>

!!! warning "摘要对得上，不等于来源可信"

    哈希相同只证明两份内容逐字节一致；攻击者完全可以连同伪造的哈希一起发布。判断来源可信要配合官方签名（如 GPG 签名）或官网公布的指纹二次核对，不要把「对上了」当成「是官方正版」。

## 版本号比较器

输入两个版本号，判定大小并给出逐段比较过程。SemVer 与 Debian/Ubuntu 包版本是两套不同规则，用模式切换，不要混用结论。

<div>
  <p>
    <label>版本号 A <input type="text" id="ver-a" value="1.2.3"></label>
    <label>版本号 B <input type="text" id="ver-b" value="1.3.0"></label>
    <label>规则
      <select id="ver-mode">
        <option value="semver" selected>SemVer（语义化版本）</option>
        <option value="debian">Debian / Ubuntu 包版本</option>
      </select>
    </label>
  </p>
  <div id="ver-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="ver-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ver-copy">复制结果</button> <span id="ver-msg"></span></p>
</div>

!!! note "两套规则的关键差异"

    - SemVer：`主.次.修订` 全数字逐段比较；带 `-alpha` 等预发布后缀的版本**小于**同号正式版；`+构建元数据` 不参与比较。
    - Debian：先比 epoch（冒号前数字），再按 dpkg 规则比上游版本与修订号；波浪号 `~` 排在一切字符（包括结尾）之前，所以 `1.0~beta1 < 1.0`。
    - 无法解析的格式会明确报错，不会用字符串排序糊弄——字符串排序会把 `10.0` 排在 `2.0` 前面，是版本比较最常见的坑。

## Docker 资源换算器

把 `--cpus`、CPU 权重与内存/存储上限换算成字节与各单位，并生成 `docker run` 与 Compose 的可复制片段。

<div>
  <p>
    <label>CPU 上限（核数，可小数） <input type="text" id="dres-cpus" value="1.5"></label>
    <label>CPU 权重 shares <input type="text" id="dres-shares" value="1024"></label>
  </p>
  <p>
    <label>内存上限（如 1.5G / 512M / 2048K） <input type="text" id="dres-mem" value="1.5G"></label>
    <label>存储配额（GB，可留空） <input type="text" id="dres-storage" value=""></label>
  </p>
  <div id="dres-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="dres-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="dres-copy">复制结果</button> <span id="dres-msg"></span></p>
</div>

!!! warning "限制不是保证"

    资源限制（limits）只封顶、不预留：容器不会因为写了 `--memory 2g` 就被保证分到 2G；要预留请另看 reservations 与 `--memory-reservation`。Docker Desktop（Mac/Windows）还有一层虚拟机总配额，语义与 Linux 原生不同；存储配额依赖 overlay2 + XFS pquota，不是所有环境都生效。

## HTTP 状态码查询

输入状态码看含义、常见原因与排查命令；或留空按类别浏览常用状态码。数据与本站排障章节口径一致（502/504 见反向代理章、301/403/404 见网站接入章）。

<div>
  <p>
    <label>状态码 <input type="text" id="http-code" value="502"></label>
    <label>浏览类别
      <select id="http-class">
        <option value="all" selected>全部</option>
        <option value="1">1xx 信息</option>
        <option value="2">2xx 成功</option>
        <option value="3">3xx 重定向</option>
        <option value="4">4xx 客户端错误</option>
        <option value="5">5xx 服务器错误</option>
      </select>
    </label>
  </p>
  <div id="http-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <div id="http-out" style="white-space: pre-wrap; border: 1px solid rgba(128, 128, 128, 0.35); padding: 0.6em 0.9em; overflow-x: auto;"></div>
  <p><button type="button" id="http-copy">复制结果</button> <span id="http-msg"></span></p>
</div>

!!! note "状态码只是症状，不是结论"

    同一个 502 可能是后端没启动、端口写错或后端崩溃；先按排查命令定界（代理能不能连上后端、后端本机是否可达），再动配置。

<div id="copy-toast" style="display: none; position: fixed; left: 50%; bottom: 1.4em; transform: translateX(-50%); z-index: 9999; max-width: 92vw; background: #b71c1c; color: #fff; padding: 0.7em 1.1em; border-radius: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); opacity: 0; transition: opacity 0.3s;">粘贴到服务器前请先逐行审阅，并确认已保留回滚通道。</div>

## 格式校验与转换

把一段 JSON / YAML / TOML 粘进来，先做语法校验（出错时指出第几行），再格式化或互转。全部在浏览器本地解析，**不上传**。无外部库：JSON 用浏览器原生解析；YAML 与 TOML 只实现了下面写明的**子集**，超出子集的写法会明确报错，不会静默解析错。

<div>
  <p>
    <textarea id="fmt-text" rows="10" style="width: 100%;" placeholder="把 JSON / YAML / TOML 配置粘贴到这里">{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "tags": ["web", "prod"]
  },
  "debug": false
}</textarea>
  </p>
  <p>
    <label>源格式
      <select id="fmt-src">
        <option value="auto" selected>自动识别</option>
        <option value="json">JSON</option>
        <option value="yaml">YAML</option>
        <option value="toml">TOML</option>
      </select>
    </label>
    <label>目标格式
      <select id="fmt-dst">
        <option value="json">JSON</option>
        <option value="yaml" selected>YAML</option>
        <option value="toml">TOML</option>
      </select>
    </label>
    <button type="button" id="fmt-run">校验并转换</button>
  </p>
  <div id="fmt-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="fmt-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="fmt-copy">复制结果</button> <button type="button" id="fmt-clear">清空</button> <span id="fmt-msg"></span></p>
</div>

!!! warning "先说清子集边界，超出就报错"

    - **YAML 子集**：支持块级映射 / 序列、嵌套、标量（字符串 / 整数 / 小数 / 布尔 / null）、单双引号、行尾注释、简单的流式集合 `[a, b]` 与 `{k: v}`。**不支持**锚点与别名（`&` / `*`）、合并键 `<<`、多行块标量（`|` / `>`）、多文档（`---` 分隔多份文档）、标签（`!!str` 等），遇到会报出第几行并说明原因。`yes/no/on/off` 按 YAML 1.2 规则当作普通字符串，不当布尔。
    - **TOML 子集**：支持键值对、点号键、`[节]`、字符串 / 整数 / 浮点 / 布尔 / 日期时间、数组（含跨行）、行尾注释。**不支持**数组表 `[[...]]` 与多行字符串（`"""`），遇到会明确报错；内联表 `{ k = v }` 支持，但必须写在一行内。
    - **TOML 没有 null**：源数据里有 null 时转 TOML 会报错并指出是哪个键，请先删掉该键或改成空字符串，不要指望它自动消失。
    - 自动识别靠首行特征猜（`{` 开头按 JSON、出现 `[节]` 或 `键 =` 按 TOML、其余按 YAML），猜错时报错信息会写明猜的是哪种格式，改成手动指定源格式再试。

## 配置差异比较器

把修改前 / 后的两段配置（或任意文本）贴进来，按行做 LCS 差异比较，找出到底改了哪几行。纯本地运行，**不上传**；输出用 `+` / `-` / 空格前缀表示新增 / 删除 / 未变，不着色，可直接复制存档。

<div>
  <p>
    <label>左侧（修改前）<br>
    <textarea id="diff-a" rows="7" style="width: 100%;">Port 22
PasswordAuthentication yes
PermitRootLogin yes
MaxAuthTries 6</textarea></label>
  </p>
  <p>
    <label>右侧（修改后）<br>
    <textarea id="diff-b" rows="7" style="width: 100%;">Port 2222
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
ClientAliveInterval 300</textarea></label>
  </p>
  <p>
    <label><input type="checkbox" id="diff-trim"> 忽略行首尾空白</label>
    <label><input type="checkbox" id="diff-blank"> 忽略空行</label>
    <button type="button" id="diff-run">比较</button>
  </p>
  <div id="diff-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="diff-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="diff-copy">复制结果</button> <button type="button" id="diff-clear">清空</button> <span id="diff-msg"></span></p>
</div>

!!! note "这是逐行比较，不是语义比较"

    - 比较粒度是整行：一行里改一个字符，输出就是「删一行 + 加一行」，不会标出改在哪个词。挪动位置的整段内容也会表现为先删后加。
    - 勾「忽略空行」后，两侧的空行都不参与比较也不计数，统计行数会比原文少，属正常现象。
    - 两侧各上限 5000 行，且行数乘积过大时会直接报错让您拆开比——LCS 是平方级算法，拿它比几万行的日志只会把浏览器卡死；大文件请在服务器上用 `diff -u`。

## cloud-init 配置生成器

生成云服务器首次启动用的 `#cloud-config`（user-data）：主机名、时区、初始用户、SSH 公钥、软件包与首次命令。纯本地生成，**不上传**。密码只支持「锁定」或「已哈希密码」两种模式，**禁止明文**——user-data 经常被随手存进网盘和工单，明文密码等于公开。

<div>
  <p>
    <label>主机名 <input type="text" id="ci-hostname" value="web-01"></label>
    <label>时区 <input type="text" id="ci-timezone" value="Asia/Shanghai"></label>
    <label>初始用户名 <input type="text" id="ci-user" value="ubuntu"></label>
  </p>
  <p>
    <label><input type="checkbox" id="ci-sudo-nopasswd"> sudo 免密（NOPASSWD，有风险，输出里会标 ⚠）</label>
  </p>
  <p>
    <label>密码模式
      <select id="ci-pwmode">
        <option value="lock" selected>锁定密码（只能用密钥登录，最安全）</option>
        <option value="hash">已哈希密码（在下方填哈希值）</option>
      </select>
    </label>
  </p>
  <p>
    <label>密码哈希（仅「已哈希密码」模式用，如 $6$ 开头的 sha512crypt；生成方法：openssl passwd -6）<br>
    <input type="text" id="ci-pwhash" value="" style="width: 36em;" placeholder="$6$rounds=4096$……"></label>
  </p>
  <p>
    <label>SSH 公钥（每行一把，粘贴 .pub 文件整行内容）<br>
    <textarea id="ci-keys" rows="3" style="width: 100%;" placeholder="ssh-ed25519 AAAA…… 备注">ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl admin@laptop</textarea></label>
  </p>
  <p>
    <label>要安装的软件包（逗号或换行分隔）<br>
    <textarea id="ci-packages" rows="2" style="width: 100%;">curl, vim, htop</textarea></label>
  </p>
  <p>
    <label>初始命令 runcmd（每行一条，在首次启动末尾以 root 执行）<br>
    <textarea id="ci-runcmd" rows="2" style="width: 100%;" placeholder="systemctl enable --now fail2ban"></textarea></label>
  </p>
  <p>
    <label>写入文件路径（可空，一组） <input type="text" id="ci-file-path" value="" style="width: 24em;" placeholder="/etc/motd.d/99-hello"></label>
  </p>
  <p>
    <label>文件内容（可空）<br>
    <textarea id="ci-file-content" rows="3" style="width: 100%;" placeholder="文件内容，原样写入"></textarea></label>
  </p>
  <div id="ci-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="ci-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="ci-copy">复制结果</button> <button type="button" id="ci-clear">清空</button> <span id="ci-msg"></span></p>
</div>

!!! warning "user-data 只在首次启动执行一次"

    - cloud-init 只在实例**第一次启动**时跑 user-data：改了配置重启老机器不会重跑，验证要开新实例，或在测试机上手动 `cloud-init` 调试。
    - 本工具拒绝生成明文密码：选「已哈希密码」就必须填 `$` 开头的哈希串（`openssl passwd -6` 生成），填明文会在校验时被拦下。
    - 公钥填的是 `.pub` 公钥整行，**不要把私钥粘进来**；粘错行会报出第几行格式不对。
    - 落地前先校验语法：在服务器上可用 `cloud-init schema --config-file user-data.yaml` 检查，或把生成结果粘到本站「格式校验与转换」里先过一遍 YAML。

## SSH 服务端配置生成器

生成 `sshd_config` 加固片段（端口、root 登录、密码 / 密钥登录、重试与空闲策略）。改 SSH 配置是把自己锁在门外的高发操作：输出顶部带风险提示、末尾带应用步骤，**先放行新端口的防火墙、保留现有会话验证成功后再断开**。纯本地生成，不上传。

<div>
  <p>
    <label>监听端口 Port <input type="number" id="sshd-port" value="22" min="1" max="65535"></label>
    <label>root 登录 PermitRootLogin
      <select id="sshd-root">
        <option value="no">禁止（no）</option>
        <option value="prohibit-password" selected>仅密钥（prohibit-password）</option>
        <option value="yes">允许（yes，含密码，高风险）</option>
      </select>
    </label>
  </p>
  <p>
    <label><input type="checkbox" id="sshd-pubkey" checked> 允许密钥登录 PubkeyAuthentication</label>
    <label><input type="checkbox" id="sshd-pwauth"> 允许密码登录 PasswordAuthentication</label>
  </p>
  <p>
    <label>最大认证尝试 MaxAuthTries <input type="number" id="sshd-maxtries" value="3" min="1" max="100"></label>
    <label>登录宽限秒数 LoginGraceTime <input type="number" id="sshd-grace" value="60" min="0" max="3600"></label>
  </p>
  <p>
    <label>允许登录的用户 AllowUsers（可空，空格或逗号分隔） <input type="text" id="sshd-allowusers" value="" style="width: 24em;" placeholder="ubuntu deploy"></label>
  </p>
  <p>
    <label>空闲断开：无活动秒数 ClientAliveInterval <input type="number" id="sshd-alive-interval" value="300" min="0" max="86400"></label>
    <label>探测次数 ClientAliveCountMax <input type="number" id="sshd-alive-count" value="2" min="0" max="100"></label>
  </p>
  <div id="sshd-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="sshd-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="sshd-copy">复制结果</button> <button type="button" id="sshd-clear">清空</button> <span id="sshd-msg"></span></p>
</div>

!!! warning "改 SSH 配置的标准防锁死流程"

    - **顺序不能反**：先在防火墙 / 云安全组放行新端口 → 再改配置 → `sshd -t` 校验通过才 reload → **保留当前会话别断**，新开一个终端用新配置登录验证 → 成功后才关旧会话。
    - 密码登录与密钥登录**不能同时关**：都关等于无人能登录，本工具会直接拦截；真要只留密钥，先确认公钥已在服务器上能登录再关密码。
    - Ubuntu 上服务名是 `ssh` 不是 `sshd`：`systemctl reload ssh`；且 `/etc/ssh/sshd_config.d/` 里的片段按文件名前缀顺序先生效，可能覆盖主文件，同名项以**先读到的**为准，改完用 `sshd -T` 看最终生效值。

## systemd Timer 生成器

给已有的服务配一个 `.timer` 定时触发单元，并同时给出对应的 `.service` 骨架（Type=oneshot 型任务）。纯本地生成，不上传。触发表达式拿不准时，先用输出里附的 `systemd-analyze calendar` 命令在服务器上验算下一次触发时间。

<div>
  <p>
    <label>服务名（不带后缀） <input type="text" id="tmr-name" value="backup"></label>
    <label>任务命令 ExecStart（绝对路径） <input type="text" id="tmr-exec" value="/usr/local/bin/backup.sh" size="36"></label>
  </p>
  <p>
    <label>触发方式
      <select id="tmr-preset">
        <option value="hourly">每小时</option>
        <option value="daily" selected>每天</option>
        <option value="weekly">每周</option>
        <option value="monthly">每月</option>
        <option value="boot">开机后</option>
        <option value="interval">固定间隔</option>
        <option value="custom">自定义 OnCalendar</option>
      </select>
    </label>
    <label>间隔 / 开机延迟（间隔与开机后两种方式用，如 30min、2h） <input type="text" id="tmr-span" value="30min"></label>
  </p>
  <p>
    <label>自定义 OnCalendar（选「自定义」时用，如 Mon *-*-* 03:30:00）<br>
    <input type="text" id="tmr-calendar" value="" style="width: 32em;" placeholder="*-*-* 03:30:00"></label>
  </p>
  <p>
    <label><input type="checkbox" id="tmr-persistent" checked> Persistent（关机期间错过的触发，开机后补跑一次）</label>
    <label>随机延迟 RandomizedDelaySec（可空，如 5min） <input type="text" id="tmr-random" value="" placeholder="5min"></label>
  </p>
  <div id="tmr-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="tmr-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="tmr-copy">复制结果</button> <button type="button" id="tmr-clear">清空</button> <span id="tmr-msg"></span></p>
</div>

!!! warning "timer 生效靠 enable 的是 .timer，不是 .service"

    - 启用命令是 `systemctl enable --now 名字.timer`：enable 错对象（.service）不会报错得很明显，但定时根本不会触发；验证用 `systemctl list-timers --all` 看 NEXT 列有没有时间。
    - 被 timer 拉起的 .service 一般写 `Type=oneshot` 且**不需要** `[Install]` 段（它不靠 enable 自启），本工具的骨架已按此生成；手动给 service 加 WantedBy 只会让它开机多跑一次。
    - Persistent 只对日历型触发（OnCalendar）有意义：间隔型（OnUnitActiveSec）错过就错过，不补跑。
    - 自定义 OnCalendar 本工具只查字符白名单（拦注入），**不验算语义**：写错成不存在的时间组合 systemd 也会接受文件、只是永不触发，务必用 `systemd-analyze calendar '表达式'` 验算后再落地。

## Linux 故障诊断决策树

按症状逐级回答问题，收窄到最可能的原因、可直接复制的检查命令与修复方向。全程只在浏览器里做选择题，**不会执行任何命令**，命令要你自己复制到目标机器上运行。

<div>
  <p>
    <label>第 1 步：症状大类
      <select id="diag-cat">
        <option value="" selected>—— 请选择 ——</option>
        <option value="net">网络不通</option>
        <option value="diskf">磁盘空间满</option>
        <option value="memcpu">内存或 CPU 异常</option>
        <option value="svc">服务启动失败</option>
        <option value="perm">权限与访问问题</option>
      </select>
    </label>
  </p>
  <div id="diag-steps"></div>
  <div id="diag-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="diag-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="diag-copy">复制结果</button> <button type="button" id="diag-clear">清空</button> <span id="diag-msg"></span></p>
</div>

!!! warning "决策树是缩小范围的工具，不是结论本身"

    - 每个终点给的原因按常见程度排序，但你的环境可能正好是少数情况：先按检查命令验证第一名，再动手修，别跳过验证直接照「修复方向」操作。
    - 检查命令刻意以只读命令为主（看状态、看日志、看占用）；修复阶段涉及删文件、杀进程、改网络与权限配置时，生产机上先确认备份、回滚通道与带外入口（云控制台）可用。
    - 同一故障可能有多条路径同时成立（如磁盘满又引发服务启动失败）：先治最底层的那条（本例先清磁盘），再回头看其他症状是否自愈。

## Docker Compose 安全审查器

把 `docker-compose.yml` 内容粘贴进来，逐项审查常见高危写法，按严重 / 警告 / 提示分级输出，每条带行号、依据与修复建议。全程在浏览器本地按行扫描，**不上传、不保存**，`environment` 的值不会出现在结果里。

<div>
  <p>
    <textarea id="csrev-input" rows="12" style="width: 100%;" placeholder="把 docker-compose.yml 的完整内容粘贴到这里（缩进请保留原样，本工具靠缩进识别层级）"></textarea>
  </p>
  <div id="csrev-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="csrev-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="csrev-run">开始审查</button> <button type="button" id="csrev-copy">复制结果</button> <button type="button" id="csrev-clear">清空</button> <span id="csrev-msg"></span></p>
</div>

!!! warning "这是按行扫描的务实检查，不是完整的 YAML 解析"

    - 本工具不引入 YAML 解析库，靠缩进与行模式识别服务与配置项：锚点（&）、合并键（<<:）、多文档（---）、长语法端口条目分组等复杂写法可能误判或漏判，结果里检测到这类语法时会专门提示。
    - 结论以 `docker compose config` 展开后的实际生效配置为准再人工复核；「未发现风险项」只代表本工具覆盖的清单内没问题，不等于这份 compose 全面安全。
    - 输入上限 100000 字符，超出只审查前半部分并在结果里注明；超大的多文件项目请拆开逐个审查。

## 磁盘空间与容量规划器

按当前日增长量估算磁盘还能撑多少天、哪天写满、撑到目标天数要扩容多少。纯本地计算；增速取自 `df -h` 隔几天对比两次，或监控里的日增均值。

<div>
  <p>
    <label>总容量（GB） <input type="number" id="disk-total" value="500" min="0"></label>
    <label>目标天数 <input type="number" id="disk-target" value="180" min="1"></label>
  </p>
  <p>
    <label>已用百分比（%） <input type="number" id="disk-usedpct" value="72" min="0" max="100"></label>
    <label>或已用容量（GB，与左边二选一，填了以这个为准） <input type="number" id="disk-usedgb" min="0" placeholder="如 360"></label>
  </p>
  <p>
    <label>日增长量（GB/天） <input type="number" id="disk-growth" value="2" min="0"></label>
    <label>保留警戒线（%） <input type="number" id="disk-warnpct" value="90" min="1" max="100"></label>
  </p>
  <div id="disk-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="disk-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="disk-copy">复制结果</button> <button type="button" id="disk-clear">清空</button> <span id="disk-msg"></span></p>
</div>

!!! note "估算的前提与边界"

    - 公式：剩余 = 总容量 − 已用；耗尽天数 = 剩余 ÷ 日增长量；需扩容 = 已用 + 日增长 × 目标天数 − 总容量。
    - 日增长填 0 时不存在「耗尽日期」：结果会明确说明，并提醒突发写入（日志刷屏、一次性导入）不服从日均增速。
    - 已经超过警戒线会在结果里用 ⚠ 单独标出；估算按恒定增速，未计 ext4 默认 5% 保留块与盘的标称/可用容量差异，采购时再留 10%–20% 余量。

## 备份策略与 RPO/RTO 计算器

由数据总量、变化率与带宽，估算全量/增量体量、保留期总存储、单次备份耗时与整库恢复耗时，并对齐 RPO/RTO 口径。纯本地计算。

<div>
  <p>
    <label>数据总量（GB） <input type="number" id="bk-total" value="200" min="0"></label>
    <label>每日变化率（%） <input type="number" id="bk-change" value="5" min="0" max="100"></label>
  </p>
  <p>
    <label>备份间隔（小时） <input type="number" id="bk-interval" value="24" min="0"></label>
    <label>保留天数（天） <input type="number" id="bk-keep" value="30" min="1"></label>
  </p>
  <p>
    <label>备份带宽（Mbps） <input type="number" id="bk-up" value="100" min="0"></label>
    <label>恢复带宽（Mbps） <input type="number" id="bk-down" value="200" min="0"></label>
  </p>
  <div id="bk-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="bk-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="bk-copy">复制结果</button> <button type="button" id="bk-clear">清空</button> <span id="bk-msg"></span></p>
</div>

!!! warning "RPO 与 RTO 是两个目标，别混成一个"

    - RPO 管「最多丢多少数据」，就等于备份间隔：每 24 小时备一次，最坏就丢最近 24 小时的数据。想缩小 RPO 只能缩短间隔或改持续同步，加大带宽没用。
    - RTO 管「业务停多久」，由恢复耗时决定：本工具的 RTO 只算把最近一次全量按恢复带宽传回写完的时间，不含回放增量链、校验、起服务与人工决策，真实值只会更长（结果里另给了按 70% 有效带宽的粗算）。
    - 若算出全量耗时超过备份间隔，说明「每间隔一次全量」根本跑不完，必须改成低频全量 + 高频增量，结果里会用 ⚠ 标出。

## 正则表达式测试器

在浏览器本地用 JavaScript 正则引擎测试表达式：列出全部匹配（含下标）、逐个展开捕获组与命名组。语法错误会明确报错；本工具**只测试、不自动修复**表达式。

<div>
  <p>
    <label>正则表达式 <input type="text" id="re-pattern" value="\b(\d{1,3}\.){3}\d{1,3}\b" size="42"></label>
  </p>
  <p>flags：
    <label><input type="checkbox" id="re-f-g" checked> g（全局，列出全部匹配）</label>
    <label><input type="checkbox" id="re-f-i"> i（忽略大小写）</label>
    <label><input type="checkbox" id="re-f-m"> m（多行 ^$）</label>
    <label><input type="checkbox" id="re-f-s"> s（. 匹配换行）</label>
    <label><input type="checkbox" id="re-f-u"> u（Unicode）</label>
  </p>
  <p>
    <textarea id="re-text" rows="4" style="width: 100%;">服务器 192.168.1.10 与 10.0.0.254 都在线，版本号 1.2.3 不是 IP。</textarea>
  </p>
  <div id="re-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="re-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="re-copy">复制结果</button> <button type="button" id="re-clear">清空</button> <span id="re-msg"></span></p>
</div>

!!! warning "能匹配不等于好用：小心灾难性回溯"

    - 嵌套量词（如 `(a+)+`、`(\w+)*$`）遇到「长串且最终不匹配」的输入会指数级回溯，把单个 CPU 核心长期打满（ReDoS）；检测到疑似写法时结果里会用 ⚠ 提示，但本工具不替你改写。
    - 匹配列表上限 200 条防页面卡死，达到上限会注明；超长单条匹配会截断显示（计数仍按下标记）。
    - 这里是 JavaScript（ECMAScript）正则语义：与 grep -E、PCRE、Python re 在转义、字符类与命名组语法上有细微差异，拿去别处用前按目标引擎复测。

## .env 文件检查器

把 `.env` 内容粘贴进来，逐行检查格式问题：无等号行、键名非法、重复键、值未加引号却含空格/`#`、空值、引号未闭合、`export` 前缀不一致。全程在浏览器本地运行、**不存储、不上传**；输出只出现键名与行号，**任何一行的值都不会被回显**（疑似敏感行同样只报键名）。

<div>
  <p>
    <textarea id="env-input" rows="10" style="width: 100%;" placeholder="把 .env 文件内容粘贴到这里（放心：本工具不回显任何值，检查结果里只有键名与行号）"></textarea>
  </p>
  <div id="env-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="env-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="env-run">开始检查</button> <button type="button" id="env-copy">复制结果</button> <button type="button" id="env-clear">清空</button> <span id="env-msg"></span></p>
</div>

!!! warning "最大的坑不是格式，是 .env 进了仓库"

    - 键名含 KEY / SECRET / TOKEN / PASSWORD / PASSWD 字样的行会被标为「疑似敏感」——只报键名与行号，值从不回显；但标记只是提醒，真正的防线是：`.env` 必须写进 `.gitignore`、文件权限 600、绝不粘贴到聊天、工单与截图里扩散。
    - 一旦 .env 曾被提交进 Git 或发到外部，按「密钥已泄露」处理：删文件没用，必须逐个更换里面的密钥。
    - 各 dotenv 解析器对「未加引号值里的空格与 #」处理不一致（有的截断、有的报错、有的原样保留），所以这类写法一律建议加引号，消除歧义。

## GitHub Actions 工作流生成器

按勾选拼出一份完整的 GitHub Actions workflow YAML：触发方式、运行环境、语言预设、常用步骤与部署占位。纯本地生成，**不上传**、不连 GitHub；生成的缩进由本工具固定输出，不会出现手写 YAML 常见的对齐错误。

<div>
  <p>
    <label>工作流名称 name <input type="text" id="gha-name" value="CI"></label>
    <label>文件名（不含扩展名） <input type="text" id="gha-file" value="ci"></label>
    <label>运行环境 runs-on
      <select id="gha-os">
        <option value="ubuntu-24.04" selected>ubuntu-24.04</option>
        <option value="ubuntu-22.04">ubuntu-22.04</option>
        <option value="ubuntu-latest">ubuntu-latest（跟随官方最新）</option>
      </select>
    </label>
  </p>
  <p>触发方式（可多选）：
    <label><input type="checkbox" id="gha-t-push" checked> push 推送</label>
    <label><input type="checkbox" id="gha-t-pr" checked> pull_request</label>
    <label><input type="checkbox" id="gha-t-dispatch"> workflow_dispatch 手动触发</label>
    <label><input type="checkbox" id="gha-t-schedule"> schedule 定时</label>
  </p>
  <p>
    <label>触发分支（逗号分隔，push / PR 共用） <input type="text" id="gha-branches" value="main"></label>
    <label>定时 cron（五段，UTC 时间，仅勾选定时后生效） <input type="text" id="gha-cron" value="0 2 * * 1"></label>
  </p>
  <p>
    <label>语言预设
      <select id="gha-lang">
        <option value="none">无（通用 shell 步骤）</option>
        <option value="node" selected>Node.js</option>
        <option value="python">Python</option>
        <option value="go">Go</option>
      </select>
    </label>
    <label>语言版本（预设为「无」时忽略） <input type="text" id="gha-langver" value="20"></label>
  </p>
  <p>步骤（可多选）：
    <label><input type="checkbox" id="gha-s-build" checked> 构建</label>
    <label><input type="checkbox" id="gha-s-test" checked> 测试</label>
    <label><input type="checkbox" id="gha-s-lint"> lint 检查</label>
    <label><input type="checkbox" id="gha-s-artifact"> 上传构建产物</label>
  </p>
  <p>
    <label>产物名称 <input type="text" id="gha-art-name" value="build-output"></label>
    <label>产物路径 <input type="text" id="gha-art-path" value="dist/"></label>
    <label>部署步骤占位
      <select id="gha-deploy">
        <option value="none" selected>不生成</option>
        <option value="pages">GitHub Pages（注释占位）</option>
        <option value="ssh">SSH 部署（注释占位）</option>
      </select>
    </label>
  </p>
  <div id="gha-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="gha-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="gha-copy">复制结果</button> <button type="button" id="gha-clear">恢复默认</button> <span id="gha-msg"></span></p>
</div>

!!! warning "定时任务用的是 UTC，部署占位默认是注释掉的"

    - `schedule` 的 cron 按 **UTC** 解读：想在北京时间凌晨 2 点跑，要写成前一天 18:00 UTC，别照本地时间填。
    - 部署步骤只生成**注释占位**：Pages 需要先在仓库 Settings → Pages 里把来源设为 GitHub Actions 并放开 permissions；SSH 部署要先把私钥与主机信息放进仓库 Secrets，绝不能把私钥明文写进 YAML 提交。
    - 产物上传默认保留期有限（仓库设置决定，常见 90 天），要长期留存请另行归档，别把 workflow 产物当备份。

## 服务器资源规划器

按服务类型与访问量粗算一台服务器需要的 CPU、内存、磁盘与带宽区间，并把**公式与假设全部写进输出**，方便人工复核。纯本地计算，**不上传**。结论只是起步参考，不是采购承诺。

<div>
  <p>
    <label>服务类型
      <select id="plan-type">
        <option value="static">静态站（HTML / 文件下载）</option>
        <option value="dynamic" selected>动态 Web（应用 + 接口）</option>
        <option value="db">数据库（MySQL / PostgreSQL）</option>
        <option value="mixed">混合（Web + 数据库同机）</option>
      </select>
    </label>
  </p>
  <p>
    <label>预计总用户数 <input type="number" id="plan-users" value="10000" min="0"></label>
    <label>日活用户数 DAU <input type="number" id="plan-dau" value="1000" min="0"></label>
    <label>峰值并发请求数 <input type="number" id="plan-peak" value="50" min="0"></label>
  </p>
  <p>
    <label>每请求内存占用（MB） <input type="number" id="plan-reqmem" value="30" min="0"></label>
    <label>每位日活用户日均请求数 <input type="number" id="plan-reqs" value="30" min="0"></label>
    <label>平均响应大小（KB） <input type="number" id="plan-resp" value="60" min="0"></label>
  </p>
  <p>
    <label>当前数据量（GB） <input type="number" id="plan-disk" value="20" min="0"></label>
    <label>数据月增长率（%） <input type="number" id="plan-growth" value="5" min="0"></label>
  </p>
  <div id="plan-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="plan-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="plan-copy">复制结果</button> <button type="button" id="plan-clear">恢复默认</button> <span id="plan-msg"></span></p>
</div>

!!! warning "这是粗略估算，上线前必须压测"

    - 输出里的每核处理能力、平均响应时间等都是**经验假设**，已逐条写进结果；你的业务（长连接、大文件、复杂查询）可能差出数倍。
    - 按区间**上限**采购、下限起步都不对：先按建议规格上线，用 `wrk` / `ab` / 业务回放压测后再决定升降配。
    - 本工具只算单机：读写分离、缓存层、对象存储都不在估算内，数据量到 TB 级请按分库与冷热分离另行规划。

## Linux 日志分析器

把一段系统日志（journal / syslog / 应用日志均可）粘进来，统计级别分布、时间范围、最常见的错误模式与涉及的服务名。全部在浏览器本地解析，**不上传**；日志里可能含内网 IP 与账号名，别把分析前的原文随手贴到外部网站。

<div>
  <p>
    <textarea id="log-text" rows="10" style="width: 100%;" placeholder="把日志粘贴到这里（最多分析前 2000 行）">Oct 23 09:12:01 web-01 systemd[1]: Started nginx.service - A high performance web server.
Oct 23 09:12:03 web-01 nginx[811]: nginx: configuration file /etc/nginx/nginx.conf test is successful
Oct 23 09:15:44 web-01 sshd[1024]: Accepted publickey for ubuntu from 192.0.2.10 port 51234 ssh2
Oct 23 09:16:02 web-01 sshd[1031]: Failed password for invalid user admin from 203.0.113.66 port 41022 ssh2
Oct 23 09:16:05 web-01 sshd[1033]: Failed password for invalid user admin from 203.0.113.66 port 41025 ssh2
Oct 23 09:17:31 web-01 kernel: [12345.678901] EXT4-fs warning (device vda1): ext4_end_bio: 331: I/O error, dev vda1, sector 88123456
Oct 23 09:18:10 web-01 myapp[2048]: ERROR database connection timeout after 3000 ms (request id 8f42ac19)
Oct 23 09:18:12 web-01 myapp[2048]: ERROR database connection timeout after 3000 ms (request id 91bd77e0)
Oct 23 09:18:15 web-01 myapp[2048]: WARN retrying request, attempt 2 of 3
Oct 23 09:19:01 web-01 myapp[2048]: INFO worker pool ready, 4 workers
Oct 23 09:19:40 web-01 cron[777]: (root) CMD (/usr/local/bin/backup.sh)
Oct 23 09:20:02 web-01 systemd[1]: backup.service: Failed with result 'exit-code'.
Oct 23 09:20:02 web-01 systemd[1]: Failed to start backup.service - Nightly backup.
Oct 23 09:21:15 web-01 sshd[1102]: Accepted password for deploy from 192.0.2.11 port 51300 ssh2</textarea>
  </p>
  <p>
    <button type="button" id="log-run">分析日志</button>
  </p>
  <div id="log-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="log-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="log-copy">复制结果</button> <button type="button" id="log-clear">清空</button> <span id="log-msg"></span></p>
</div>

!!! note "统计是关键词口径，不是日志语义理解"

    - 级别计数按行内关键词匹配（error / warn / info / debug 及 emerg / alert / crit）：一行同时命中多个级别时**每个级别各计一次**，所以各级别之和可能大于总行数。
    - 错误模式聚合会先把 IP、数字、十六进制串归一化再计数：`timeout after 3000 ms` 与 `timeout after 5000 ms` 会算作同一种模式，这是刻意的。
    - 时间范围只取首末两行识别到的 ISO / syslog 样式时间戳原文；syslog 时间戳不含年份，跨年日志请先按年拆开再分析。

## APT 源与优先级辅助器

两部分合一：（一）把 `sources.list` 或 `.sources` 内容粘进来，检查发行版代号与目标版本是否一致、明文 http 源、重复条目与第三方源签名；（二）Pin-Priority 小计算器，生成 `apt`  pin 条目并解释优先级语义。纯本地运行，**不上传**。

<div>
  <p><strong>（一）软件源检查</strong></p>
  <p>
    <label>目标版本
      <select id="apt-target">
        <option value="noble" selected>Ubuntu 24.04（noble）</option>
        <option value="jammy">Ubuntu 22.04（jammy）</option>
        <option value="focal">Ubuntu 20.04（focal）</option>
        <option value="bookworm">Debian 12（bookworm）</option>
        <option value="bullseye">Debian 11（bullseye）</option>
      </select>
    </label>
    <button type="button" id="apt-run">检查软件源</button>
  </p>
  <p>
    <textarea id="apt-text" rows="7" style="width: 100%;" placeholder="把 /etc/apt/sources.list 或 *.sources 内容粘贴到这里">deb http://archive.ubuntu.com/ubuntu noble main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu noble-updates main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu noble-security main restricted universe multiverse
deb-src http://archive.ubuntu.com/ubuntu noble main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb https://packages.example.com/ubuntu noble main</textarea>
  </p>
  <div id="apt-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="apt-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="apt-copy">复制检查结果</button> <button type="button" id="apt-clear">清空</button> <span id="apt-msg"></span></p>
  <p><strong>（二）Pin-Priority 计算</strong></p>
  <p>
    <label>包名 <input type="text" id="apt-pkg" value="nginx"></label>
    <label>版本号（可空，空 = 按源 pin） <input type="text" id="apt-ver" placeholder="1.24.0-2ubuntu7"></label>
    <label>目标优先级 <input type="number" id="apt-prio" value="1001"></label>
  </p>
  <div id="apt-perr" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="apt-pout" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="apt-pcopy">复制 pin 条目</button> <button type="button" id="apt-pclear">恢复默认</button> <span id="apt-pmsg"></span></p>
</div>

!!! warning "混源比缺源更危险，pin 高优先级等于允许降级"

    - 代号不一致（如 24.04 机器上挂着 jammy 源）时 `apt update` 可能不报错，但装包时会拉进旧版依赖，故障往往几天后才爆——检查出的不一致行请先删或改对再更新。
    - Pin-Priority **大于 1000 表示允许降级安装**：只对确实要锁版本的包用，并写清原因；给 `*` 全局 pin 高优先级是最常见的把系统依赖锁死的方式。
    - 第三方源没有 `Signed-By` / `signed-by` 时，apt 依赖全局 keyring 验签，来历不明的 key 等于把装包信任交给对方——先核对官方文档给的指纹再加源。

## 服务器迁移计划生成器

填源/目标系统、要迁的服务、数据量与停机窗口，生成一份分阶段迁移计划文本（盘点 → 备份 → 预同步 → 演练 → 正式切换 → 验证，含回滚触发条件与步骤），每阶段是可勾选的清单样式文本。纯本地生成，**不上传**。

<div>
  <p>
    <label>源系统
      <select id="mig-from">
        <option value="Ubuntu 20.04">Ubuntu 20.04</option>
        <option value="Ubuntu 22.04" selected>Ubuntu 22.04</option>
        <option value="Ubuntu 24.04">Ubuntu 24.04</option>
        <option value="Debian 11">Debian 11</option>
        <option value="Debian 12">Debian 12</option>
        <option value="CentOS 7">CentOS 7</option>
        <option value="其他 Linux">其他 Linux</option>
      </select>
    </label>
    <label>目标系统
      <select id="mig-to">
        <option value="Ubuntu 24.04" selected>Ubuntu 24.04</option>
        <option value="Ubuntu 22.04">Ubuntu 22.04</option>
        <option value="Debian 12">Debian 12</option>
        <option value="其他 Linux">其他 Linux</option>
      </select>
    </label>
    <label>目标主机（可空，IP 或主机名） <input type="text" id="mig-host" placeholder="203.0.113.20"></label>
  </p>
  <p>要迁移的服务（至少勾一个）：
    <label><input type="checkbox" class="mig-svc" value="web" checked> Web（Nginx / Apache）</label>
    <label><input type="checkbox" class="mig-svc" value="db" checked> 数据库</label>
    <label><input type="checkbox" class="mig-svc" value="files"> 文件 / 上传目录</label>
    <label><input type="checkbox" class="mig-svc" value="mail"> 邮件</label>
    <label><input type="checkbox" class="mig-svc" value="docker"> Docker 容器</label>
    <label><input type="checkbox" class="mig-svc" value="cron"> 定时任务</label>
    <label><input type="checkbox" class="mig-svc" value="app"> 自定义应用</label>
  </p>
  <p>
    <label>数据量（GB） <input type="number" id="mig-data" value="100" min="0"></label>
    <label>允许停机窗口
      <select id="mig-window">
        <option value="0">不停机（分钟级切换）</option>
        <option value="30" selected>30 分钟</option>
        <option value="120">2 小时</option>
        <option value="480">8 小时（整夜）</option>
      </select>
    </label>
    <label><input type="checkbox" id="mig-dns" checked> 涉及域名 / DNS 切换</label>
  </p>
  <div id="mig-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="mig-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="mig-copy">复制结果</button> <button type="button" id="mig-clear">恢复默认</button> <span id="mig-msg"></span></p>
</div>

!!! warning "迁移翻车几乎都翻在回滚没准备"

    - 正式切换前**源机不要关机、不要释放**：回滚的前提是旧环境原样还在，至少保留到验证期结束（建议一周）。
    - 涉及 DNS 时 TTL 要**提前 24 小时**降到 300 秒：切换当天才改 TTL，缓存里的旧记录还没过期，切了也白切。
    - 数据库迁移别只验行数：抽样比对关键表校验和与最近写入记录，字符集 / 时区 / 自增起点不一致都是静默坑。

## curl 命令构建器

按表单拼出一条可直接粘贴到终端的 curl 命令，同时给出单行与多行（反斜杠续行）两种写法；URL 与参数值都做 shell 单引号转义。纯本地生成，**不上传**、不发请求——生成的命令要你自己在终端执行。

<div>
  <p>
    <label>URL <input type="text" id="curl-url" value="https://example.com/api/items" size="52"></label>
    <label>方法
      <select id="curl-method">
        <option value="GET" selected>GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="PATCH">PATCH</option>
        <option value="DELETE">DELETE</option>
        <option value="HEAD">HEAD</option>
      </select>
    </label>
  </p>
  <p>
    <label>Content-Type 预设
      <select id="curl-ctype">
        <option value="none" selected>不设置</option>
        <option value="json">application/json</option>
        <option value="form">application/x-www-form-urlencoded</option>
        <option value="text">text/plain</option>
      </select>
    </label>
    <label>认证
      <select id="curl-auth">
        <option value="none" selected>无</option>
        <option value="bearer">Bearer Token</option>
        <option value="basic">Basic（用户名/密码）</option>
      </select>
    </label>
  </p>
  <p>
    <label>Bearer Token <input type="text" id="curl-token" placeholder="eyJhbGciOi..."></label>
    <label>Basic 用户名 <input type="text" id="curl-buser" placeholder="alice"></label>
    <label>Basic 密码 <input type="text" id="curl-bpass" placeholder="仅本地生成，不上传"></label>
  </p>
  <p>
    <label>自定义请求头（每行一个，格式 `头名: 值`）<br>
    <textarea id="curl-headers" rows="2" cols="52" placeholder="X-Request-Id: demo-001"></textarea></label>
  </p>
  <p>
    <label>请求体（表单类型时按每行 `键=值` 逐个 --data-urlencode）<br>
    <textarea id="curl-body" rows="3" cols="52" placeholder="POST / PUT / PATCH 时填写"></textarea></label>
  </p>
  <p>
    <label>超时秒数 --max-time（可空） <input type="number" id="curl-timeout" placeholder="30"></label>
    <label>重试次数 --retry（可空） <input type="number" id="curl-retry" placeholder="3"></label>
    <label>代理（可空，如 http://127.0.0.1:7890） <input type="text" id="curl-proxy" placeholder=""></label>
    <label><input type="checkbox" id="curl-k"> -k 跳过证书校验（仅调试）</label>
  </p>
  <div id="curl-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="curl-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="curl-copy">复制结果</button> <button type="button" id="curl-clear">恢复默认</button> <span id="curl-msg"></span></p>
</div>

!!! warning "带凭据的命令不要存进历史和工单"

    - 输出里带 Token / 密码的命令照常生成（方便你本地执行），但**不要**把整条命令粘贴进工单、聊天或截图：`~/.bash_history` 与进程列表都能看到它，排查完请轮换凭据或改用环境变量 / `--netrc` 等方式传入。
    - `-k` 只是跳过证书校验，不解决证书问题：生产环境排障时确认问题在证书后请修证书，别把 `-k` 留在脚本里。
    - 单引号转义针对 POSIX shell（bash/sh）：把命令拿到 PowerShell / cmd 里跑，引号规则不同，需要改写。

## SSH 日志分析器

把 `auth.log`（或 `journalctl -u ssh`）片段粘进来，统计成功登录、失败尝试、无效用户名与断开原因，并按固定规则给出「观察 / 可疑 / 高风险」分级——**单条失败不会被判成攻击**。全部在浏览器本地解析，**不上传**。

<div>
  <p>
    <textarea id="sshlog-text" rows="10" style="width: 100%;" placeholder="把 auth.log 片段粘贴到这里（最多分析前 5000 行）">Oct 23 08:01:11 web-01 sshd[2011]: Accepted publickey for ubuntu from 192.0.2.10 port 51001 ssh2
Oct 23 08:02:45 web-01 sshd[2020]: Accepted publickey for ubuntu from 192.0.2.10 port 51009 ssh2
Oct 23 08:15:02 web-01 sshd[2101]: Failed password for invalid user admin from 203.0.113.66 port 41100 ssh2
Oct 23 08:15:04 web-01 sshd[2102]: Invalid user oracle from 203.0.113.66 port 41101
Oct 23 08:15:06 web-01 sshd[2103]: Failed password for invalid user oracle from 203.0.113.66 port 41102 ssh2
Oct 23 08:15:09 web-01 sshd[2104]: Failed password for root from 203.0.113.66 port 41103 ssh2
Oct 23 08:15:12 web-01 sshd[2105]: Failed password for invalid user test from 203.0.113.66 port 41104 ssh2
Oct 23 08:15:15 web-01 sshd[2106]: Failed password for invalid user admin from 203.0.113.66 port 41105 ssh2
Oct 23 08:15:18 web-01 sshd[2107]: Failed password for root from 203.0.113.66 port 41106 ssh2
Oct 23 08:15:21 web-01 sshd[2108]: Failed password for invalid user ubuntu from 203.0.113.66 port 41107 ssh2
Oct 23 08:15:24 web-01 sshd[2109]: Failed password for invalid user deploy from 203.0.113.66 port 41108 ssh2
Oct 23 08:15:27 web-01 sshd[2110]: Failed password for invalid user admin from 203.0.113.66 port 41109 ssh2
Oct 23 08:15:30 web-01 sshd[2111]: Connection closed by authenticating user admin 203.0.113.66 port 41110 [preauth]
Oct 23 09:02:31 web-01 sshd[2201]: Accepted password for deploy from 192.0.2.11 port 51100 ssh2
Oct 23 09:03:10 web-01 sshd[2210]: Failed password for deploy from 192.0.2.11 port 51102 ssh2
Oct 23 09:03:44 web-01 sshd[2211]: Accepted publickey for deploy from 192.0.2.11 port 51103 ssh2
Oct 23 09:40:00 web-01 sshd[2301]: Disconnected from user ubuntu 192.0.2.10 port 51001</textarea>
  </p>
  <p>
    <button type="button" id="sshlog-run">分析 SSH 日志</button>
  </p>
  <div id="sshlog-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="sshlog-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="sshlog-copy">复制结果</button> <button type="button" id="sshlog-clear">清空</button> <span id="sshlog-msg"></span></p>
</div>

!!! note "分级规则是写死的，结论里会逐条给依据"

    - **观察**：失败次数少、无无效用户名批量尝试——公网机器日常的背景扫描噪音，记下来即可。
    - **可疑**：单 IP 失败 ≥ 10 次，或无效用户名尝试 ≥ 5 次，或总失败 ≥ 30 次——像在试探，建议装 fail2ban 并复核成功登录记录。
    - **高风险**：单 IP 失败 ≥ 50 次**且**伴随无效用户名尝试，或总失败 ≥ 500 次——典型的字典爆破组合，请立即封禁来源并检查有没有成功记录混在失败里。
    - 本工具只看你粘贴的片段：片段之外有没有成功登录、有没有其他来源 IP，它都不知道，分级只对本片段负责。

## Git 命令生成器

先选需求分类与具体场景，再填分支名、提交信息等参数，生成带逐步说明的命令序列。危险操作会在输出里以 ⚠ 标出并给更安全的替代写法。纯本地生成，**不上传**；命令需要你自己在仓库目录里执行。

<div>
  <p>
    <label>需求分类
      <select id="git-cat">
        <option value="branch" selected>分支</option>
        <option value="commit">提交</option>
        <option value="merge">合并 / 变基</option>
        <option value="sync">同步远程</option>
        <option value="undo">撤销 / 恢复</option>
        <option value="tag">标签</option>
        <option value="stash">暂存（stash）</option>
      </select>
    </label>
    <label>具体场景
      <select id="git-scene"></select>
    </label>
  </p>
  <p>
    <label>分支名（按场景使用） <input type="text" id="git-branch" value="feature/login"></label>
    <label>远程名 <input type="text" id="git-remote" value="origin"></label>
    <label><input type="checkbox" id="git-force"> 推送时强制覆盖远程（force）</label>
  </p>
  <p>
    <label>提交信息 / 标签说明 <input type="text" id="git-cmsg" size="40" placeholder="fix: 修复登录超时"></label>
    <label>文件路径（按场景使用） <input type="text" id="git-file" placeholder="src/app.js"></label>
    <label>标签名（按场景使用） <input type="text" id="git-tag" placeholder="v1.2.0"></label>
  </p>
  <div id="git-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="git-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="git-copy">复制结果</button> <button type="button" id="git-clear">恢复默认</button> <span id="git-msg"></span></p>
</div>

!!! warning "改写历史的操作只对「还没共享出去」的提交安全"

    - `reset --hard`、`push --force`、对已推送分支 rebase，都会让协作者的仓库对不上账：输出里凡 ⚠ 标出的步骤，先想想这条分支有没有别人拉过。
    - 强制推送一律优先 `--force-with-lease`：它会先确认远程就是你上次看到的样子，被别人推过新提交时拒绝覆盖；裸 `--force` 不做这个检查。
    - 拿不准时先 `git branch backup-日期` 留一条备份分支——撤销类操作的事后后悔药只有 reflog 和备份分支两种，别裸奔。

## Linux 命令解释器

输入一条命令（含管道与重定向也可以），按内置知识库拆解：命令名释义、每个参数逐个解释、整体效果、所需权限与风险等级。纯本地运行，**不上传**。知识库未收录的命令或参数会**明说未收录**，不会编造解释。

<div>
  <p>
    <label>命令 <input type="text" id="explain-text" value="sudo rm -rf /var/tmp/old-backup" size="52"></label>
    <button type="button" id="explain-run">解释这条命令</button>
  </p>
  <div id="explain-err" style="display: none; border: 1px solid #c62828; background: rgba(198, 40, 40, 0.10); padding: 0.6em 0.9em; margin: 0.6em 0;"></div>
  <pre id="explain-out" style="white-space: pre; overflow-x: auto;"></pre>
  <p><button type="button" id="explain-copy">复制结果</button> <button type="button" id="explain-clear">清空</button> <span id="explain-msg"></span></p>
</div>

!!! warning "看不懂的命令先别执行，尤其是从网上复制的"

    - 本工具按命令名与参数的**静态知识**拆解，不执行命令、也不知道你机器上的实际文件：风险等级是按最坏情形给的，`rm -rf` 指着空目录和指着 `/` 是两回事，执行前自己再核对路径。
    - `curl ... | sh` 这类「下载远程脚本直接执行」的组合会被标为高风险：先把脚本下载下来读一遍再跑，是省不掉的一步。
    - 知识库覆盖 40 余个常用命令及常见参数；没收录的会明说未收录——遇到未收录项请查 `man <命令>`，不要凭相似命令的解释推断。

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

<script>
function parseCidr4(v) {
  var halves = v.split("/");
  if (halves.length !== 2) { return null; }
  var ip = subParseIp(halves[0]);
  if (!ip) { return null; }
  if (!/^\d+$/.test(halves[1])) { return null; }
  var p = parseInt(halves[1], 10);
  if (p > 32) { return null; }
  return { ip: ip, prefix: p };
}
function isValidIpv6(v) {
  if (!v || /[^0-9A-Fa-f:.]/.test(v)) { return false; }
  var extra = 0;
  if (v.indexOf(".") !== -1) {
    var lc = v.lastIndexOf(":");
    if (lc === -1) { return false; }
    if (!subParseIp(v.slice(lc + 1))) { return false; }
    var head = v.slice(0, lc);
    if (v.charAt(lc - 1) === ":") { head += ":"; }
    v = head;
    if (!v) { return false; }
    extra = 2;
  }
  function groups(s) {
    if (s === "") { return []; }
    var ps = s.split(":");
    for (var i = 0; i < ps.length; i++) {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(ps[i])) { return null; }
    }
    return ps;
  }
  var halves = v.split("::");
  if (halves.length > 2) { return false; }
  if (halves.length === 2) {
    var l = groups(halves[0]);
    var r = groups(halves[1]);
    if (l === null || r === null) { return false; }
    return (l.length + r.length + extra) <= 7;
  }
  var g = groups(halves[0]);
  if (g === null) { return false; }
  return (g.length + extra) === 8;
}
function parseCidr6(v) {
  var halves = v.split("/");
  if (halves.length !== 2) { return null; }
  if (!isValidIpv6(halves[0])) { return null; }
  if (!/^\d+$/.test(halves[1])) { return null; }
  var p = parseInt(halves[1], 10);
  if (p > 128) { return null; }
  return { prefix: p };
}
function parsePortStrict(raw) {
  if (!/^\d+$/.test(raw)) { return null; }
  var n = parseInt(raw, 10);
  if (n < 1 || n > 65535) { return null; }
  return n;
}
function npGenerate() {
  var ifaceEl = document.getElementById("np-iface");
  if (!ifaceEl) { return; }
  var out = document.getElementById("np-out");
  var errBox = document.getElementById("np-err");
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
  var iface = ifaceEl.value.trim();
  var errs = [];
  if (!iface) { errs.push("接口名不能为空"); }
  else if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(iface)) { errs.push("接口名格式不正确（须以字母开头，只能含字母、数字与 _ . -，如 eth0、ens3）"); }
  var ip = "", gw = "", dns = "", ip6 = "", gw6 = "";
  var dnsEntries = [];
  var warns = [];
  if (!useDhcp) {
    ip = document.getElementById("np-ip").value.trim();
    gw = document.getElementById("np-gw").value.trim();
    dns = document.getElementById("np-dns").value.trim();
    if (mode === "dual") {
      var ip6El = document.getElementById("np-ip6");
      var gw6El = document.getElementById("np-gw6");
      ip6 = ip6El ? ip6El.value.trim() : "";
      gw6 = gw6El ? gw6El.value.trim() : "";
    }
    var cidr4 = null;
    if (!ip) {
      errs.push("静态模式必须填写 IP 地址 / CIDR（如 192.0.2.10/24）");
    } else if (ip.indexOf(":") !== -1) {
      errs.push("IP 地址 / CIDR 填的是 IPv6 地址：本字段请填 IPv4 CIDR（如 192.0.2.10/24），IPv6 请填到双栈模式的 IPv6 地址字段");
    } else {
      cidr4 = parseCidr4(ip);
      if (!cidr4) { errs.push("IP 地址 / CIDR 格式不正确（应为四段 0–255 的 IPv4 地址加 / 前缀，前缀 0–32，如 192.0.2.10/24）"); }
    }
    if (gw) {
      if (gw.indexOf(":") !== -1) {
        errs.push("网关填的是 IPv6 地址，与 IPv4 地址不同族：双栈模式请把 IPv6 网关填到 IPv6 网关字段");
      } else if (!subParseIp(gw)) {
        errs.push("网关不是合法的 IPv4 地址（如 192.0.2.1，不要带 / 前缀）");
      } else if (cidr4) {
        var gwParts = subParseIp(gw);
        var gwInt = ((gwParts[0] * 256 + gwParts[1]) * 256 + gwParts[2]) * 256 + gwParts[3];
        var ipInt = ((cidr4.ip[0] * 256 + cidr4.ip[1]) * 256 + cidr4.ip[2]) * 256 + cidr4.ip[3];
        var block = Math.pow(2, 32 - cidr4.prefix);
        if (Math.floor(ipInt / block) !== Math.floor(gwInt / block)) {
          warns.push("网关 " + gw + " 不在 " + ip + " 所在子网内：点对点链路、云厂商 /32 路由等场景可能合法，确认无误后再 apply");
        }
      }
    }
    if (dns) {
      var rawParts = dns.split(",");
      for (var di = 0; di < rawParts.length; di++) {
        var entry = rawParts[di].trim();
        if (entry) { dnsEntries.push(entry); }
      }
      if (!dnsEntries.length) {
        errs.push("DNS 至少要填一个合法 IP 地址（逗号分隔）");
      }
      for (var dj = 0; dj < dnsEntries.length; dj++) {
        var de = dnsEntries[dj];
        if (de.indexOf(":") !== -1) {
          if (!isValidIpv6(de)) { errs.push("DNS 条目「" + de + "」不是合法的 IPv6 地址"); }
        } else if (!subParseIp(de)) {
          errs.push("DNS 条目「" + de + "」不是合法的 IP 地址");
        }
      }
    }
    if (mode === "dual") {
      if (!ip6) {
        errs.push("双栈模式必须填写 IPv6 地址 / CIDR（如 2001:db8::10/64）");
      } else if (ip6.indexOf(":") === -1) {
        errs.push("IPv6 地址 / CIDR 填的是 IPv4 地址，请填 IPv6 CIDR（如 2001:db8::10/64，前缀 0–128）");
      } else if (!parseCidr6(ip6)) {
        errs.push("IPv6 地址 / CIDR 格式不正确（IPv6 地址加 / 前缀，前缀 0–128，如 2001:db8::10/64）");
      }
      if (gw6) {
        if (gw6.indexOf(":") === -1) {
          errs.push("IPv6 网关填的是 IPv4 地址，与 IPv6 地址不同族");
        } else if (!isValidIpv6(gw6)) {
          errs.push("IPv6 网关不是合法的 IPv6 地址（如 2001:db8::1，不要带 / 前缀）");
        }
      }
    }
  }
  if (errs.length) {
    if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：" + errs.join("；"); }
    out.textContent = "# 请先修正上面的输入，不要把当前内容写入配置文件";
    return;
  }
  if (errBox) { errBox.style.display = "none"; }
  var lines = [];
  lines.push("# /etc/netplan/99-custom.yaml");
  lines.push("network:");
  lines.push("  version: 2");
  lines.push("  ethernets:");
  lines.push("    " + iface + ":");
  if (useDhcp) {
    lines.push("      dhcp4: true");
  } else {
    lines.push("      dhcp4: false");
    lines.push("      addresses:");
    lines.push("        - " + ip);
    if (mode === "dual") {
      lines.push("        - " + ip6);
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
      lines.push("      nameservers:");
      lines.push("        addresses:");
      for (var i = 0; i < dnsEntries.length; i++) {
        lines.push("          - " + dnsEntries[i]);
      }
    }
  }
  var text = lines.join("\n");
  var badStruct = /null|undefined|NaN/.test(text);
  for (var li = 0; li < lines.length; li++) {
    if (/^\s*addresses:$/.test(lines[li])) {
      var next = lines[li + 1];
      if (!next || !/^\s*- /.test(next)) { badStruct = true; }
    }
  }
  if (badStruct) {
    if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：生成的配置未通过结构自检，请检查各字段后重试"; }
    out.textContent = "# 请先修正上面的输入，不要把当前内容写入配置文件";
    return;
  }
  if (warns.length) {
    text += "\n" + warns.map(function (w) { return "# 提示：" + w; }).join("\n");
  }
  out.textContent = text;
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
  var out = document.getElementById("ufw-out");
  var errBox = document.getElementById("ufw-err");
  var errs = [];
  var sshRaw = sshEl.value.trim();
  var sshPort = "22";
  if (sshRaw) {
    var sshNum = parsePortStrict(sshRaw);
    if (sshNum === null) {
      errs.push(/^\d+$/.test(sshRaw) ? "SSH 端口必须在 1–65535 之间" : "SSH 端口必须是数字（1–65535）");
    } else {
      sshPort = String(sshNum);
    }
  }
  var srcEl = document.getElementById("ufw-src");
  var src = srcEl ? srcEl.value.trim() : "";
  if (src) {
    if (src.indexOf(":") !== -1) {
      if (!/^[0-9A-Fa-f:./]+$/.test(src)) {
        errs.push("来源 IP 含非法字符（IPv6 只接受十六进制数字、冒号与前缀斜线，如 2001:db8::1 或 2001:db8::/32；分号、空格、引号等一律不接受）");
      } else if (src.indexOf("/") !== -1) {
        if (!parseCidr6(src)) { errs.push("来源 CIDR 格式不正确（IPv6 地址加 / 前缀，前缀 0–128，如 2001:db8::/32）"); }
      } else if (!isValidIpv6(src)) {
        errs.push("来源 IP 不是合法的 IPv6 地址（如 2001:db8::1）");
      }
    } else if (!/^[0-9./]+$/.test(src)) {
      errs.push("来源 IP 含非法字符（只接受 IPv4 地址或 CIDR，如 192.0.2.100 或 10.0.0.0/8；分号、空格、引号等一律不接受）");
    } else if (src.indexOf("/") !== -1) {
      if (!parseCidr4(src)) { errs.push("来源 CIDR 格式不正确（IPv4 四段 0–255，前缀 0–32，如 10.0.0.0/8）"); }
    } else if (!subParseIp(src)) {
      errs.push("来源 IP 不是合法的 IPv4 地址（四段 0–255，如 192.0.2.100）");
    }
  }
  var customPortEl = document.getElementById("ufw-port");
  var customRaw = customPortEl ? customPortEl.value.trim() : "";
  var customProtoEl = document.getElementById("ufw-proto");
  var customProto = customProtoEl ? customProtoEl.value : "tcp";
  if (customProto !== "tcp" && customProto !== "udp") { errs.push("协议只能是 tcp 或 udp"); }
  var customPort = "";
  var customRange = null;
  if (customRaw) {
    if (customRaw.indexOf(":") !== -1) {
      var seg = customRaw.split(":");
      var lo = (seg.length === 2) ? parsePortStrict(seg[0]) : null;
      var hi = (seg.length === 2) ? parsePortStrict(seg[1]) : null;
      if (lo === null || hi === null) {
        errs.push("自定义端口范围格式不正确（应为 起始:结束，两端都是 1–65535 的数字，如 8000:8010）");
      } else if (lo > hi) {
        errs.push("自定义端口范围起始必须小于或等于结束（如 8000:8010）");
      } else {
        customRange = { lo: lo, hi: hi };
        customPort = lo + ":" + hi;
      }
    } else {
      var cp = parsePortStrict(customRaw);
      if (cp === null) {
        errs.push(/^\d+$/.test(customRaw) ? "自定义端口必须在 1–65535 之间" : "自定义端口必须是数字（1–65535），或 起始:结束 的范围（如 8000:8010）");
      } else {
        customPort = String(cp);
      }
    }
  }
  var dbPorts = ["3306", "5432", "6379", "27017"];
  var adminPorts = ["888", "8888", "8443", "9090"];
  var planBoxes = document.querySelectorAll(".ufw-plan");
  var planSel = [];
  var pi;
  for (pi = 0; pi < planBoxes.length; pi++) {
    if (planBoxes[pi].checked) {
      planSel.push({
        port: planBoxes[pi].getAttribute("data-port"),
        proto: planBoxes[pi].getAttribute("data-proto"),
        name: planBoxes[pi].getAttribute("data-name"),
        use: planBoxes[pi].getAttribute("data-use"),
        risk: planBoxes[pi].getAttribute("data-risk")
      });
    }
  }
  var planHasSsh = false;
  for (pi = 0; pi < planSel.length; pi++) {
    if (planSel[pi].port === "22") { planHasSsh = true; }
  }
  var seenPorts = [];
  var boxes = document.querySelectorAll(".ufw-preset");
  var i;
  for (i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) {
      seenPorts.push(boxes[i].getAttribute("data-port"));
    }
  }
  for (pi = 0; pi < planSel.length; pi++) {
    seenPorts.push(planSel[pi].port);
  }
  if (customPort) {
    seenPorts.push(customPort);
  }
  function hitsList(list) {
    for (var k = 0; k < seenPorts.length; k++) {
      var sp = seenPorts[k];
      if (sp.indexOf(":") !== -1) {
        var b = sp.split(":");
        var lo2 = parseInt(b[0], 10), hi2 = parseInt(b[1], 10);
        for (var m = 0; m < list.length; m++) {
          var pv = parseInt(list[m], 10);
          if (pv >= lo2 && pv <= hi2) { return true; }
        }
      } else if (list.indexOf(sp) !== -1) { return true; }
    }
    return false;
  }
  var warnDb = document.getElementById("ufw-warn-db");
  var warnAdmin = document.getElementById("ufw-warn-admin");
  if (warnDb) {
    warnDb.style.display = hitsList(dbPorts) ? "block" : "none";
  }
  if (warnAdmin) {
    warnAdmin.style.display = hitsList(adminPorts) ? "block" : "none";
  }
  var warnLock = document.getElementById("ufw-warn-lock");
  if (warnLock) {
    warnLock.style.display = (planSel.length && !planHasSsh) ? "block" : "none";
  }
  if (errs.length) {
    if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：" + errs.join("；"); }
    out.textContent = "# 请先修正上面的输入，不要执行当前命令";
    return;
  }
  if (errBox) { errBox.style.display = "none"; }
  var lines = [];
  lines.push("# 步骤1：查看现有状态（未启用时会显示 Status: inactive）");
  lines.push("sudo ufw status verbose");
  lines.push("");
  lines.push("# 步骤2：放行 SSH 端口（务必最先执行，不要断开当前 SSH 会话）");
  lines.push(ufwRule(sshPort, "tcp", "SSH", src));
  var emitted = {};
  emitted[sshPort + "/tcp"] = true;
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
      emitted[bp + "/" + boxes[i].getAttribute("data-proto")] = true;
      bizCount++;
    }
  }
  if (customPort) {
    if (!(customPort === sshPort && customProto === "tcp")) {
      lines.push(ufwRule(customPort, customProto, "custom", src));
      emitted[customPort + "/" + customProto] = true;
      bizCount++;
    }
  }
  if (bizCount === 0) {
    lines.push("# （未勾选或填写其他业务端口，如需放行请在上方勾选/填写）");
  }
  if (planSel.length) {
    lines.push("");
    lines.push("# 步骤3b：按服务规划放行（与结果末尾的服务端口清单一一对应；与上方已放行的重复项已自动跳过）");
    for (pi = 0; pi < planSel.length; pi++) {
      var psvc = planSel[pi];
      var pprotos = (psvc.proto === "both") ? ["udp", "tcp"] : [psvc.proto];
      for (var pj = 0; pj < pprotos.length; pj++) {
        var pkey = psvc.port + "/" + pprotos[pj];
        if (emitted[pkey]) { continue; }
        emitted[pkey] = true;
        lines.push(ufwRule(psvc.port, pprotos[pj], psvc.name, src));
      }
    }
    if (!planHasSsh) {
      lines.push("# 警告：本次规划未勾选 SSH 服务——启用 UFW 前必须确认 SSH 已放行（上方步骤2 放行的是你填写的 SSH 端口），端口填错或从未放行就 enable 会把自己锁在门外");
    }
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
  var verifyPort = customPort ? (customRange ? String(customRange.lo) : customPort) : sshPort;
  lines.push("# nc -vz <服务器IP> " + verifyPort);
  lines.push("# curl -v http://<服务器IP>:" + verifyPort + "/");
  if (planSel.length) {
    lines.push("");
    lines.push("# ===== 服务端口清单（核对用，与站内「端口与协议目录」同源维护；先看风险列，再决定上方规则是否照抄执行） =====");
    for (pi = 0; pi < planSel.length; pi++) {
      var csvc = planSel[pi];
      var cprotos = (csvc.proto === "both") ? "udp+tcp" : csvc.proto;
      lines.push("# " + csvc.port + "/" + cprotos + " " + csvc.name + "：用途：" + csvc.use + "；风险：" + csvc.risk);
    }
  }
  out.textContent = lines.join("\n");
}
function sshQuote(v) {
  if (/^[A-Za-z0-9_@%+=:,.\/~-]+$/.test(v)) { return v; }
  return "'" + v.replace(/'/g, "'\\''") + "'";
}
function sshShowGroup(id, show) {
  var el = document.getElementById(id);
  if (el) { el.style.display = show ? "block" : "none"; }
}
function sshGenerate() {
  var out = document.getElementById("ssh-out");
  if (!out) { return; }
  var type = document.getElementById("ssh-type").value;
  var host = document.getElementById("ssh-host").value.trim();
  var user = document.getElementById("ssh-user").value.trim();
  var portRaw = document.getElementById("ssh-port").value.trim();
  var key = document.getElementById("ssh-key").value.trim();
  var isFile = (type === "upload" || type === "download");
  var isFwd = (type === "local" || type === "remote" || type === "dynamic");
  sshShowGroup("ssh-grp-file", isFile);
  sshShowGroup("ssh-grp-fwd", isFwd);
  sshShowGroup("ssh-grp-jump", type === "jump");
  var tgt = document.getElementById("ssh-fwd-targets");
  if (tgt) { tgt.style.display = (type === "dynamic") ? "none" : "inline"; }
  var errs = [];
  if (!host) { errs.push("服务器 IP / 域名不能为空"); }
  else if (!/^[A-Za-z0-9._:\[\]-]+$/.test(host)) { errs.push("服务器地址含非法字符"); }
  if (!user) { errs.push("用户名不能为空"); }
  else if (!/^[A-Za-z0-9._-]+$/.test(user)) { errs.push("用户名含非法字符"); }
  var port = 22;
  if (portRaw) {
    if (!/^\d+$/.test(portRaw)) { errs.push("SSH 端口必须是数字"); }
    else {
      port = parseInt(portRaw, 10);
      if (port < 1 || port > 65535) { errs.push("SSH 端口必须在 1–65535 之间"); }
    }
  }
  var listen = 8080;
  if (isFwd) {
    var lRaw = document.getElementById("ssh-listen").value.trim();
    if (lRaw) {
      if (!/^\d+$/.test(lRaw)) { errs.push("本地监听端口必须是数字"); }
      else {
        listen = parseInt(lRaw, 10);
        if (listen < 1 || listen > 65535) { errs.push("本地监听端口必须在 1–65535 之间"); }
      }
    }
  }
  var tport = 80;
  if (isFwd && type !== "dynamic") {
    var tRaw = document.getElementById("ssh-tport").value.trim();
    if (tRaw) {
      if (!/^\d+$/.test(tRaw)) { errs.push("目标端口必须是数字"); }
      else {
        tport = parseInt(tRaw, 10);
        if (tport < 1 || tport > 65535) { errs.push("目标端口必须在 1–65535 之间"); }
      }
    }
  }
  var jump = "";
  if (type === "jump") {
    jump = document.getElementById("ssh-jump").value.trim();
    if (!jump) { errs.push("跳板机不能为空（格式：用户@跳板机IP 或 ~/.ssh/config 别名）"); }
  }
  var errBox = document.getElementById("ssh-err");
  if (errs.length) {
    if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：" + errs.join("；"); }
    out.textContent = "# 请先修正上面的输入，再复制命令执行";
    return;
  }
  if (errBox) { errBox.style.display = "none"; }
  var target = user + "@" + host;
  var portOpt = (port !== 22) ? " -p " + port : "";
  var portOptScp = (port !== 22) ? " -P " + port : "";
  var keyOpt = key ? " -i " + sshQuote(key) : "";
  var cmd = "";
  var notes = [];
  if (type === "login") {
    cmd = "ssh" + portOpt + keyOpt + " " + target;
  } else if (type === "debug") {
    cmd = "ssh -vvv" + portOpt + keyOpt + " " + target;
    notes.push("# -vvv 输出三级调试日志，重点看认证方式与 Permission denied 之前的几行");
  } else if (isFile) {
    var local = document.getElementById("ssh-local").value.trim() || "./file";
    var remote = document.getElementById("ssh-remote").value.trim() || "/tmp/";
    if (type === "upload") {
      cmd = "scp" + portOptScp + keyOpt + " " + sshQuote(local) + " " + target + ":" + sshQuote(remote);
    } else {
      cmd = "scp" + portOptScp + keyOpt + " " + target + ":" + sshQuote(remote) + " " + sshQuote(local);
    }
    notes.push("# scp 的端口参数是大写 -P（与 ssh 的小写 -p 不同）；整个目录传输加 -r；大文件与增量同步建议改用 rsync（见 SSH 专题第 04 章）");
  } else if (isFwd) {
    var thost = document.getElementById("ssh-thost").value.trim() || "127.0.0.1";
    if (type === "local") {
      cmd = "ssh -L " + listen + ":" + thost + ":" + tport + portOpt + keyOpt + " " + target;
      notes.push("# 在本机打开 http://127.0.0.1:" + listen + " 即经服务器访问目标服务；只转发不开远程会话可追加 -N，后台运行追加 -fN");
    } else if (type === "remote") {
      cmd = "ssh -R " + listen + ":" + thost + ":" + tport + portOpt + keyOpt + " " + target;
      notes.push("# 默认只在服务器的 127.0.0.1:" + listen + " 上监听；要让服务器对外提供该端口需服务端开启 GatewayPorts，请先评估安全风险");
    } else {
      cmd = "ssh -D " + listen + portOpt + keyOpt + " " + target;
      notes.push("# 本地 SOCKS5 代理：127.0.0.1:" + listen + "，在浏览器或系统代理里填这个地址；只转发可追加 -N");
    }
  } else if (type === "jump") {
    cmd = "ssh -J " + sshQuote(jump) + portOpt + keyOpt + " " + target;
    notes.push("# -J 后面是跳板机（用户@跳板机[:端口] 或 ~/.ssh/config 别名）；目标机地址从跳板机视角解析");
  }
  out.textContent = [cmd].concat(notes).join("\n");
}
function sshConfigGenerate() {
  var out = document.getElementById("cfg-out");
  if (!out) { return; }
  var errs = [];
  function numOpt(id, label, lo, hi) {
    var el = document.getElementById(id);
    var raw = el ? el.value.trim() : "";
    if (!raw) { return null; }
    if (!/^\d+$/.test(raw)) { errs.push(label + "必须是整数"); return null; }
    var n = parseInt(raw, 10);
    if (n < lo || n > hi) { errs.push(label + "必须在 " + lo + "–" + hi + " 之间"); return null; }
    return n;
  }
  var alive = numOpt("cfg-alive", "保活间隔 ServerAliveInterval", 0, 3600);
  var aliveMax = numOpt("cfg-alivemax", "保活次数 ServerAliveCountMax", 0, 100);
  var timeout = numOpt("cfg-timeout", "连接超时 ConnectTimeout", 1, 300);
  var entries = [];
  var seenAlias = {};
  for (var i = 1; i <= 3; i++) {
    var tag = "服务器 " + i;
    var alias = document.getElementById("cfg" + i + "-alias").value.trim();
    var host = document.getElementById("cfg" + i + "-host").value.trim();
    var user = document.getElementById("cfg" + i + "-user").value.trim();
    var portRaw = document.getElementById("cfg" + i + "-port").value.trim();
    var key = document.getElementById("cfg" + i + "-key").value.trim();
    var jump = document.getElementById("cfg" + i + "-jump").value.trim();
    if (!alias && !host && !user && !portRaw && !key && !jump) { continue; }
    if (!alias) { errs.push(tag + "：已经填了内容，别名 Host 不能为空（每台服务器靠别名区分）"); }
    else if (!/^[A-Za-z0-9._-]+$/.test(alias)) { errs.push(tag + "：别名只能含字母、数字、点、下划线、连字符（如 web1、db-01），不能带空格或通配符"); }
    else if (seenAlias[alias]) { errs.push("别名重复：「" + alias + "」出现了两次，config 里同名 Host 只会生效第一个"); }
    else { seenAlias[alias] = true; }
    if (!host) { errs.push(tag + "：主机地址 HostName 不能为空"); }
    else if (!/^[A-Za-z0-9._:\[\]-]+$/.test(host)) { errs.push(tag + "：主机地址含非法字符（只接受 IP 或域名）"); }
    if (user && !/^[A-Za-z0-9._-]+$/.test(user)) { errs.push(tag + "：用户名含非法字符"); }
    var port = null;
    if (portRaw) {
      port = parsePortStrict(portRaw);
      if (port === null) { errs.push(tag + "：端口必须是 1–65535 的整数"); }
    }
    if (key && /[\s;'"`$|&\\]/.test(key)) { errs.push(tag + "：私钥路径不能含空格、引号或 shell 元字符（只填路径本身）"); }
    if (jump && !/^[A-Za-z0-9._@:\[\]-]+$/.test(jump)) { errs.push(tag + "：跳板机格式不正确（填已定义的别名，或 用户@跳板机地址[:端口]）"); }
    entries.push({ alias: alias, host: host, user: user, port: port, key: key, jump: jump });
  }
  if (!entries.length && !errs.length) { errs.push("至少填写一台服务器（别名与主机地址必填）"); }
  var errBox = document.getElementById("cfg-err");
  if (errs.length) {
    if (errBox) { errBox.style.display = "block"; errBox.textContent = "输入有误：" + errs.join("；"); }
    out.textContent = "# 请先修正上面的输入，再复制配置";
    return;
  }
  if (errBox) { errBox.style.display = "none"; }
  var L = [];
  L.push("# 文件：~/.ssh/config（每台服务器一个 Host 块，之后 ssh <别名> 即可直连，不必再拼地址与参数）");
  L.push("# 落盘后先收紧权限：chmod 600 ~/.ssh/config；私钥文件同样必须是 600，权限过宽 ssh 会拒绝使用");
  entries.forEach(function (en) {
    L.push("");
    L.push("Host " + en.alias);
    L.push("    # 主机地址（IP 或域名）");
    L.push("    HostName " + en.host);
    if (en.user) {
      L.push("    # 登录用户名");
      L.push("    User " + en.user);
    }
    if (en.port && en.port !== 22) {
      L.push("    # 非标准 SSH 端口（22 不必写，用默认即可）");
      L.push("    Port " + en.port);
    }
    if (en.key) {
      L.push("    # 私钥文件路径（只写路径，任何情况下都不要把私钥内容贴到网页、聊天或仓库）");
      L.push("    IdentityFile " + en.key);
    }
    if (en.jump) {
      L.push("    # 先经跳板机中转再连接本机（填跳板机的别名或 用户@跳板机地址）");
      L.push("    ProxyJump " + en.jump);
    }
    if (alive !== null) {
      L.push("    # 每 " + alive + " 秒向服务器发一次保活包，弱网与 NAT 环境下防止空闲连接被掐断（0 表示关闭保活）");
      L.push("    ServerAliveInterval " + alive);
    }
    if (aliveMax !== null) {
      L.push("    # 保活包连续 " + aliveMax + " 次无回应才判定断线并退出");
      L.push("    ServerAliveCountMax " + aliveMax);
    }
    if (timeout !== null) {
      L.push("    # 建连超时 " + timeout + " 秒，超时直接报错而不是长时间挂起");
      L.push("    ConnectTimeout " + timeout);
    }
  });
  L.push("");
  L.push("# 验证（逐条执行）：");
  L.push("# ssh -G " + entries[0].alias + "        # 离线展开该别名的最终生效配置，逐项核对（不会真正连接）");
  L.push("# ssh -T " + entries[0].alias + "        # 实际连接测试（-T 不分配伪终端，连通并完成认证即返回，适合快速验证）");
  L.push("# ssh " + entries[0].alias + "           # 日常使用：直接用别名登录");
  out.textContent = L.join("\n");
}
function subParseIp(v) {
  var parts = v.split(".");
  if (parts.length !== 4) { return null; }
  var nums = [];
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) { return null; }
    var n = parseInt(parts[i], 10);
    if (n > 255) { return null; }
    nums.push(n);
  }
  return nums;
}
function subIntToIp(n) {
  return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, Math.floor(n % 256)].join(".");
}
function ipv6ExpandGroups(v) {
  if (!isValidIpv6(v)) { return null; }
  if (v.indexOf(".") !== -1) {
    var lc = v.lastIndexOf(":");
    var ip4 = subParseIp(v.slice(lc + 1));
    var hi = (ip4[0] * 256 + ip4[1]).toString(16);
    var lo = (ip4[2] * 256 + ip4[3]).toString(16);
    v = v.slice(0, lc + 1) + hi + ":" + lo;
  }
  var halves = v.split("::");
  var gs = [];
  if (halves.length === 2) {
    var l = halves[0] === "" ? [] : halves[0].split(":");
    var r = halves[1] === "" ? [] : halves[1].split(":");
    var miss = 8 - l.length - r.length;
    gs = l.slice();
    for (var i = 0; i < miss; i++) { gs.push("0"); }
    gs = gs.concat(r);
  } else {
    gs = v.split(":");
  }
  return gs.map(function (g) { return parseInt(g, 16); });
}
function ipv6GroupsToBig(gs) {
  var n = BigInt(0);
  for (var i = 0; i < 8; i++) { n = n * BigInt(65536) + BigInt(gs[i]); }
  return n;
}
function ipv6BigToGroups(n) {
  var gs = [];
  for (var i = 0; i < 8; i++) {
    gs.unshift(Number(n % BigInt(65536)));
    n = n / BigInt(65536);
  }
  return gs;
}
function ipv6Full(gs) {
  return gs.map(function (g) {
    var s = g.toString(16);
    while (s.length < 4) { s = "0" + s; }
    return s;
  }).join(":");
}
function ipv6Compress(gs) {
  var bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (var i = 0; i < 8; i++) {
    if (gs[i] === 0) {
      if (curStart === -1) { curStart = i; curLen = 1; } else { curLen++; }
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else { curStart = -1; curLen = 0; }
  }
  var parts = gs.map(function (g) { return g.toString(16); });
  if (bestLen < 2) { return parts.join(":"); }
  return parts.slice(0, bestStart).join(":") + "::" + parts.slice(bestStart + bestLen).join(":");
}
function subGenerate6(out) {
  var errs = [];
  var rawIp = document.getElementById("sub-ip").value.trim();
  var groups = ipv6ExpandGroups(rawIp);
  if (!groups) { errs.push("IPv6 地址格式不正确（如 2001:db8::10）"); }
  var prefix = -1;
  var rawP = document.getElementById("sub-prefix6").value.trim();
  if (!/^\d+$/.test(rawP)) { errs.push("IPv6 前缀必须是 0–128 的整数"); }
  else {
    prefix = parseInt(rawP, 10);
    if (prefix > 128) { errs.push("IPv6 前缀必须在 0–128 之间"); }
  }
  var errBox = document.getElementById("sub-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var ipBig = ipv6GroupsToBig(groups);
  var size = BigInt(1) << BigInt(128 - prefix);
  var network = ipBig - (ipBig % size);
  var last = network + size - BigInt(1);
  var netGroups = ipv6BigToGroups(network);
  var lastGroups = ipv6BigToGroups(last);
  var lines = [];
  lines.push("输入地址（展开）：" + ipv6Full(groups) + "/" + prefix);
  lines.push("输入地址（压缩）：" + ipv6Compress(groups) + "/" + prefix);
  lines.push("网络地址：" + ipv6Compress(netGroups));
  lines.push("地址范围：" + ipv6Compress(netGroups) + " - " + ipv6Compress(lastGroups));
  lines.push("地址总数：" + size.toString());
  lines.push("IPv6 没有广播地址：不存在预留的网络地址/广播地址，地址范围内的地址都可分配使用（多播地址段 ff00::/8 除外）。");
  if (prefix === 128) { lines.push("提示：/128 是单个主机地址（主机路由），整个子网就这一个地址。"); }
  if (ipBig === BigInt(1)) { lines.push("提示：::1 是回环地址（loopback），相当于 IPv4 的 127.0.0.1，只在本机内部使用。"); }
  if (ipBig === BigInt(0)) { lines.push("提示：:: 是未指定地址，不能作为通信的目标地址使用。"); }
  if (groups[0] >= 0xfe80 && groups[0] <= 0xfebf) { lines.push("提示：该地址属于链路本地 fe80::/10，只在同一链路内有效、不会被路由器转发，实际使用时通常还要带网卡接口后缀（如 fe80::1%eth0）。"); }
  out.textContent = lines.join("\n");
}
function subGenerate() {
  var out = document.getElementById("sub-out");
  if (!out) { return; }
  var family = document.getElementById("sub-family").value;
  var mode = document.getElementById("sub-mode").value;
  document.getElementById("sub-grp-prefix").style.display = (family === "v4" && mode === "cidr") ? "inline" : "none";
  document.getElementById("sub-grp-mask").style.display = (family === "v4" && mode === "mask") ? "inline" : "none";
  document.getElementById("sub-grp-prefix6").style.display = (family === "v6") ? "inline" : "none";
  if (family === "v6") { subGenerate6(out); return; }
  var errs = [];
  var ipParts = subParseIp(document.getElementById("sub-ip").value.trim());
  if (!ipParts) { errs.push("IP 地址格式不正确（应为四段 0–255 的数字）"); }
  var prefix = -1;
  if (mode === "cidr") {
    var raw = document.getElementById("sub-prefix").value.trim();
    if (!/^\d+$/.test(raw)) { errs.push("CIDR 前缀必须是 0–32 的整数"); }
    else {
      prefix = parseInt(raw, 10);
      if (prefix > 32) { errs.push("CIDR 前缀必须在 0–32 之间"); }
    }
  } else {
    var mParts = subParseIp(document.getElementById("sub-mask").value.trim());
    if (!mParts) { errs.push("子网掩码格式不正确（应为四段 0–255 的数字）"); }
    else {
      var bits = "";
      for (var i = 0; i < 4; i++) {
        var b = mParts[i].toString(2);
        while (b.length < 8) { b = "0" + b; }
        bits += b;
      }
      if (!/^1*0*$/.test(bits)) { errs.push("子网掩码不连续（必须是 1 连续、0 连续），不是合法掩码"); }
      else { prefix = bits.replace(/0/g, "").length; }
    }
  }
  var errBox = document.getElementById("sub-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var ipInt = ((ipParts[0] * 256 + ipParts[1]) * 256 + ipParts[2]) * 256 + ipParts[3];
  var size = Math.pow(2, 32 - prefix);
  var network = ipInt - (ipInt % size);
  var broadcast = network + size - 1;
  var maskInt = 4294967296 - size;
  var lines = [];
  lines.push("输入地址：" + subIntToIp(ipInt) + "/" + prefix);
  lines.push("子网掩码：" + subIntToIp(maskInt) + "（/" + prefix + "）");
  lines.push("网络地址：" + subIntToIp(network));
  lines.push("广播地址：" + subIntToIp(broadcast));
  if (prefix === 32) {
    lines.push("可用主机范围：" + subIntToIp(network) + "（单个主机地址）");
    lines.push("地址总数：1，可用主机数：1");
  } else if (prefix === 31) {
    lines.push("可用主机范围：" + subIntToIp(network) + " - " + subIntToIp(broadcast) + "（点对点链路，两个地址都可用）");
    lines.push("地址总数：2，可用主机数：2");
  } else {
    lines.push("可用主机范围：" + subIntToIp(network + 1) + " - " + subIntToIp(broadcast - 1));
    lines.push("地址总数：" + size + "，可用主机数：" + (size - 2));
  }
  out.textContent = lines.join("\n");
}
var CRON_DEFS = [
  { key: "min", label: "分钟", lo: 0, hi: 59 },
  { key: "hour", label: "小时", lo: 0, hi: 23 },
  { key: "dom", label: "日", lo: 1, hi: 31 },
  { key: "mon", label: "月", lo: 1, hi: 12 },
  { key: "dow", label: "周", lo: 0, hi: 7 }
];
var CRON_DOW_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var CRON_DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function cronFieldVal(def) {
  var mode = document.getElementById("cron-" + def.key + "-mode").value;
  document.getElementById("cron-" + def.key + "-grp-step").style.display = (mode === "step") ? "inline" : "none";
  document.getElementById("cron-" + def.key + "-grp-at").style.display = (mode === "at") ? "inline" : "none";
  if (mode === "any") { return { expr: "*", mode: "any" }; }
  if (mode === "step") {
    var raw = document.getElementById("cron-" + def.key + "-step").value.trim();
    if (!/^\d+$/.test(raw)) { return { error: def.label + "的间隔必须是正整数" }; }
    var n = parseInt(raw, 10);
    if (n < 1) { return { error: def.label + "的间隔至少为 1" }; }
    var span = def.hi - def.lo + 1;
    if (n > span) { return { error: def.label + "的间隔不能超过 " + span + "（该字段一共只有 " + span + " 个取值，*/" + n + " 实际只会命中第一个值，表达式没有意义）" }; }
    return { expr: "*/" + n, mode: "step", n: n };
  }
  var txt = document.getElementById("cron-" + def.key + "-at").value.trim();
  if (!txt) { return { error: def.label + "的指定值不能为空" }; }
  var parts = txt.split(",");
  var vals = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!/^\d+$/.test(p)) { return { error: def.label + "的指定值必须是数字（逗号分隔）" }; }
    var v = parseInt(p, 10);
    if (v < def.lo || v > def.hi) { return { error: def.label + "的指定值必须在 " + def.lo + "–" + def.hi + " 之间" }; }
    vals.push(v);
  }
  return { expr: vals.join(","), mode: "at", vals: vals };
}
function cronDesc(key, f) {
  if (f.mode === "any") {
    return { min: "每分钟", hour: "每小时", dom: "每天", mon: "每月", dow: "每天（周一至周日）" }[key];
  }
  if (f.mode === "step") {
    return { min: "每隔 " + f.n + " 分钟", hour: "每隔 " + f.n + " 小时", dom: "每隔 " + f.n + " 天", mon: "每隔 " + f.n + " 个月", dow: "每隔 " + f.n + " 天（按周字段计）" }[key];
  }
  if (key === "dow") {
    return "在" + f.vals.map(function (v) { return CRON_DOW_CN[v % 7]; }).join("、");
  }
  if (key === "min") { return "在第 " + f.vals.join("、") + " 分钟"; }
  if (key === "hour") { return "在 " + f.vals.join("、") + " 点"; }
  if (key === "dom") { return "在 " + f.vals.join("、") + " 号"; }
  return "在 " + f.vals.join("、") + " 月";
}
function cronPad(n) { return (n < 10 ? "0" : "") + n; }
function cronOnCalendar(f) {
  if (f.dom.mode === "step" || f.mon.mode === "step" || f.dow.mode === "step") { return null; }
  function comp(field) {
    if (field.mode === "any") { return "*"; }
    if (field.mode === "step") { return "0/" + field.n; }
    return field.vals.map(cronPad).join(",");
  }
  var dowPart = "";
  if (f.dow.mode === "at") {
    dowPart = f.dow.vals.map(function (v) { return CRON_DOW_EN[v % 7]; }).join(",") + " ";
  }
  var mon = (f.mon.mode === "any") ? "*" : f.mon.vals.map(cronPad).join(",");
  var day = (f.dom.mode === "any") ? "*" : f.dom.vals.map(cronPad).join(",");
  return dowPart + "*-" + mon + "-" + day + " " + comp(f.hour) + ":" + comp(f.min) + ":00";
}
function cronGenerate() {
  var out = document.getElementById("cron-out");
  if (!out) { return; }
  var f = {};
  var errs = [];
  for (var i = 0; i < CRON_DEFS.length; i++) {
    var r = cronFieldVal(CRON_DEFS[i]);
    if (r.error) { errs.push(r.error); }
    else { f[CRON_DEFS[i].key] = r; }
  }
  var errBox = document.getElementById("cron-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var expr = [f.min.expr, f.hour.expr, f.dom.expr, f.mon.expr, f.dow.expr].join(" ");
  var lines = [];
  lines.push(expr);
  lines.push("# 人话解读：" + CRON_DEFS.map(function (d) { return cronDesc(d.key, f[d.key]); }).join("，") + " 触发");
  if (f.dom.mode !== "any" && f.dow.mode !== "any") {
    lines.push("# 注意：cron 中「日」与「周」同时受限是或关系（任一满足即触发）；下面的 OnCalendar 是且关系，语义不同，不要直接照搬");
  }
  lines.push("# crontab -e 写法：" + expr + " /path/to/your-script.sh   （换成你的脚本绝对路径）");
  var cal = cronOnCalendar(f);
  lines.push("# systemd timer 等价写法（.timer 的 [Timer] 段，与 cron 二选一）：");
  if (cal) {
    lines.push("# OnCalendar=" + cal);
    lines.push("# Persistent=true");
    lines.push("# 落地前先在目标机校验：systemd-analyze calendar '" + cal + "'");
  } else {
    lines.push("# 该步进组合（日/月/周字段的步进）没有直接等价的 OnCalendar，请在目标机用 systemd-analyze calendar 试写校验；纯固定间隔的任务也可改用 OnUnitActiveSec 相对计时");
  }
  out.textContent = lines.join("\n");
}
function cronSetField(key, mode, step, at) {
  document.getElementById("cron-" + key + "-mode").value = mode;
  if (step !== null) { document.getElementById("cron-" + key + "-step").value = step; }
  if (at !== null) { document.getElementById("cron-" + key + "-at").value = at; }
}
function cronApplyPreset() {
  var p = document.getElementById("cron-preset").value;
  if (p === "custom") { cronGenerate(); return; }
  var keys = ["min", "hour", "dom", "mon", "dow"];
  for (var i = 0; i < keys.length; i++) { cronSetField(keys[i], "any", null, null); }
  if (p === "m5") { cronSetField("min", "step", "5", null); }
  if (p === "hourly") { cronSetField("min", "at", null, "0"); }
  if (p === "daily") { cronSetField("min", "at", null, "0"); cronSetField("hour", "at", null, "0"); }
  if (p === "weekly") { cronSetField("min", "at", null, "0"); cronSetField("hour", "at", null, "0"); cronSetField("dow", "at", null, "1"); }
  if (p === "monthly") { cronSetField("min", "at", null, "0"); cronSetField("hour", "at", null, "0"); cronSetField("dom", "at", null, "1"); }
  cronGenerate();
}
function unitGenerate() {
  var out = document.getElementById("unit-out");
  if (!out) { return; }
  var name = document.getElementById("unit-name").value.trim();
  var desc = document.getElementById("unit-desc").value.trim();
  var exec = document.getElementById("unit-exec").value.trim();
  var workdir = document.getElementById("unit-workdir").value.trim();
  var user = document.getElementById("unit-user").value.trim();
  var restart = document.getElementById("unit-restart").value;
  var rsec = document.getElementById("unit-restartsec").value.trim();
  var mem = document.getElementById("unit-mem").value.trim();
  var cpu = document.getElementById("unit-cpu").value.trim();
  var errs = [];
  var rawName = name;
  if (name.slice(-8) === ".service") { name = name.slice(0, -8); }
  if (!name) { errs.push(rawName ? "服务名只填了 .service：去掉后缀后为空，请补上真正的服务名" : "服务名不能为空"); }
  else if (/[\r\n]/.test(name)) { errs.push("服务名不能包含换行"); }
  else if (!/^[A-Za-z0-9_.@-]+$/.test(name)) { errs.push("服务名只能含字母、数字、点、下划线、连字符"); }
  if (/[\r\n]/.test(desc)) { errs.push("服务描述不能包含换行：生成的 Unit 文件里每个字段只占一行，描述中的换行会被当成新的配置行"); }
  if (/[\r\n]/.test(exec)) { errs.push("ExecStart 不能包含换行：一行只能写一条命令，多条命令请拆成多个服务或写入脚本文件再调用"); }
  if (/[\r\n]/.test(workdir)) { errs.push("工作目录不能包含换行"); }
  if (!exec) { errs.push("ExecStart 不能为空"); }
  else if (exec.charAt(0) !== "/") { errs.push("ExecStart 必须是绝对路径（以 / 开头），systemd 不认相对路径"); }
  if (workdir && workdir.charAt(0) !== "/") { errs.push("工作目录必须是绝对路径"); }
  if (user && !/^[A-Za-z0-9_.-]+$/.test(user)) { errs.push("运行用户名含非法字符"); }
  if (rsec && !/^\d+$/.test(rsec)) { errs.push("RestartSec 必须是整数秒"); }
  if (mem && !/^\d+(\.\d+)?[KMGT]$/i.test(mem)) { errs.push("MemoryMax 格式应如 512M、1G、2048K"); }
  if (cpu && !/^\d+(\.\d+)?%$/.test(cpu)) { errs.push("CPUQuota 格式应如 50%、150%"); }
  var envfileEl = document.getElementById("unit-envfile");
  var envfile = envfileEl ? envfileEl.value.trim() : "";
  var envfileOptEl = document.getElementById("unit-envfile-opt");
  var envfileOpt = envfileOptEl ? envfileOptEl.checked : false;
  var envfilePath = envfile;
  if (envfilePath.charAt(0) === "-") { envfileOpt = true; envfilePath = envfilePath.slice(1); }
  if (envfile) {
    if (!/^\/[A-Za-z0-9_\/.\-+]+$/.test(envfilePath)) { errs.push("EnvironmentFile 必须是绝对路径且不能含空格或特殊字符（如 /etc/myapp/env）"); }
  }
  var envEl = document.getElementById("unit-env");
  var envRaw = envEl ? envEl.value : "";
  var envPairs = [];
  if (envRaw.trim()) {
    var envLines = envRaw.split("\n");
    for (var ei = 0; ei < envLines.length; ei++) {
      var eline = envLines[ei].trim();
      if (!eline) { continue; }
      var em = eline.match(/^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
      if (!em) { errs.push("环境变量第 " + (ei + 1) + " 行格式不正确（应为 KEY=VALUE，KEY 只能以字母或下划线开头、含字母数字下划线）"); }
      else { envPairs.push({ k: em[1], v: em[2] }); }
    }
  }
  function unitDepList(id, label) {
    var el = document.getElementById(id);
    var raw = el ? el.value.trim() : "";
    if (!raw) { return []; }
    var toks = raw.split(/[\s,]+/).filter(function (t) { return t; });
    for (var ti = 0; ti < toks.length; ti++) {
      if (!/^[A-Za-z0-9_.@:-]+$/.test(toks[ti])) { errs.push(label + " 中的「" + toks[ti] + "」含非法字符（单元名只接受字母、数字与 _ . - @ :）"); return null; }
    }
    return toks;
  }
  var afterList = unitDepList("unit-after", "额外 After") || [];
  var wantsList = unitDepList("unit-wants", "Wants") || [];
  var requiresList = unitDepList("unit-requires", "Requires") || [];
  var stdoutEl = document.getElementById("unit-stdout");
  var stdout = stdoutEl ? stdoutEl.value : "";
  if (["", "journal", "syslog", "null"].indexOf(stdout) === -1) { errs.push("StandardOutput 取值不合法"); }
  var stderrEl = document.getElementById("unit-stderr");
  var stderr = stderrEl ? stderrEl.value : "";
  if (["", "journal", "syslog", "null", "inherit"].indexOf(stderr) === -1) { errs.push("StandardError 取值不合法"); }
  function unitHard(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }
  var errBox = document.getElementById("unit-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var L = [];
  L.push("# 文件：/etc/systemd/system/" + name + ".service");
  L.push("[Unit]");
  L.push("# 服务描述（systemctl status 中显示）");
  L.push("Description=" + (desc || name));
  L.push("# 在网络目标就绪后再启动（不需要网络可删此行）");
  L.push("After=network.target" + (afterList.length ? " " + afterList.join(" ") : ""));
  if (wantsList.length) {
    L.push("# 弱依赖：希望这些单元一同启动，但对方启动失败不影响本服务");
    L.push("Wants=" + wantsList.join(" "));
  }
  if (requiresList.length) {
    L.push("# 强依赖：这些单元启动失败时本服务不会启动，它们停止时本服务也会被停");
    L.push("Requires=" + requiresList.join(" "));
  }
  L.push("");
  L.push("[Service]");
  L.push("# 前台进程型服务：程序不要自带 daemon 化或后台化");
  L.push("Type=simple");
  L.push("# 启动命令（绝对路径，参数直接跟在后面）");
  L.push("ExecStart=" + exec);
  if (workdir) {
    L.push("# 进程的工作目录");
    L.push("WorkingDirectory=" + workdir);
  }
  if (user) {
    L.push("# 运行用户（避免用 root 跑业务进程）");
    L.push("User=" + user);
  }
  if (envfile) {
    L.push("# 从文件读取环境变量（KEY=VALUE 每行一个，文件权限建议 600，里面可能有密钥）");
    if (envfileOpt) { L.push("# 路径前的 - 表示文件不存在时不报错、直接跳过"); }
    L.push("EnvironmentFile=" + (envfileOpt ? "-" : "") + envfilePath);
  }
  if (envPairs.length) {
    L.push("# 环境变量（值已按 systemd 规则加引号并转义；含密钥的变量请改用上面的 EnvironmentFile，不要写死在这里）");
    envPairs.forEach(function (p) {
      var esc = p.v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%");
      L.push("Environment=\"" + p.k + "=" + esc + "\"");
    });
  }
  L.push("# 退出后的重启策略");
  L.push("Restart=" + restart);
  if (rsec) {
    L.push("# 重启前等待秒数");
    L.push("RestartSec=" + rsec);
  }
  if (mem) {
    L.push("# 内存上限（超限时该服务会被 OOM 处理）");
    L.push("MemoryMax=" + mem);
  }
  if (cpu) {
    L.push("# CPU 配额（100% 约等于占满一个核心）");
    L.push("CPUQuota=" + cpu);
  }
  if (stdout) {
    L.push("# 标准输出去向（journal 进 journald，用 journalctl -u 查看）");
    L.push("StandardOutput=" + stdout);
  }
  if (stderr) {
    L.push("# 标准错误去向（inherit 表示与标准输出一致）");
    L.push("StandardError=" + stderr);
  }
  if (unitHard("unit-h-nnp")) {
    L.push("# 禁止本进程及其子进程通过 setuid 等方式获得新权限（应用若要调用 sudo / setuid 程序会被挡，不要勾）");
    L.push("NoNewPrivileges=true");
  }
  if (unitHard("unit-h-ptmp")) {
    L.push("# 使用独立的 /tmp 与 /var/tmp：进程看不到别人的临时文件，别人也看不到它的");
    L.push("PrivateTmp=true");
  }
  if (unitHard("unit-h-psys")) {
    L.push("# 整个文件系统只读（含 /var、/home）：应用要写数据目录必须再加一行 ReadWritePaths=/数据目录 并先验证");
    L.push("ProtectSystem=strict");
  }
  if (unitHard("unit-h-phome")) {
    L.push("# /home、/root、/run/user 对进程不可见：应用需要读用户目录文件时不要勾");
    L.push("ProtectHome=true");
  }
  if (unitHard("unit-h-pdev")) {
    L.push("# 设备隔离：只保留伪设备节点，无法访问真实硬件设备");
    L.push("PrivateDevices=true");
  }
  if (unitHard("unit-h-pkt")) {
    L.push("# /proc 与 /sys 下的内核可调参数只读：进程无法改内核参数");
    L.push("ProtectKernelTunables=true");
  }
  L.push("");
  L.push("[Install]");
  L.push("# enable 时挂到多用户目标，即开机自启");
  L.push("WantedBy=multi-user.target");
  L.push("");
  L.push("# 落地与验证（逐条执行）：");
  L.push("# sudo systemctl daemon-reload");
  L.push("# sudo systemctl enable --now " + name + ".service");
  L.push("# systemctl status " + name + ".service");
  L.push("# journalctl -u " + name + ".service -n 50 --no-pager");
  out.textContent = L.join("\n");
}
function ngxValidDomain(d) {
  if (!d || d.length > 253) { return false; }
  if (!/^[A-Za-z0-9.-]+$/.test(d)) { return false; }
  var labels = d.split(".");
  for (var i = 0; i < labels.length; i++) {
    var lb = labels[i];
    if (!lb || lb.length > 63) { return false; }
    if (!/^[A-Za-z0-9-]+$/.test(lb)) { return false; }
    if (lb.charAt(0) === "-" || lb.charAt(lb.length - 1) === "-") { return false; }
  }
  return true;
}
function ngxGenerate() {
  var out = document.getElementById("ngx-out");
  if (!out) { return; }
  var domain = document.getElementById("ngx-domain").value.trim();
  var proto = document.getElementById("ngx-proto").value;
  var host = document.getElementById("ngx-host").value.trim();
  var portRaw = document.getElementById("ngx-port").value.trim();
  var ws = document.getElementById("ngx-ws").checked;
  var https = document.getElementById("ngx-https").checked;
  var multiEl = document.getElementById("ngx-multi");
  var multi = multiEl ? multiEl.checked : false;
  var grpMulti = document.getElementById("ngx-grp-multi");
  if (grpMulti) { grpMulti.style.display = multi ? "block" : "none"; }
  var errs = [];
  if (!ngxValidDomain(domain)) { errs.push("域名格式不正确（如 example.com）"); }
  if (!multi) {
    if (!host || !/^[A-Za-z0-9._-]+$/.test(host)) { errs.push("后端地址格式不正确（IP 或主机名）"); }
  }
  var port = 0;
  if (!multi) {
    if (!/^\d+$/.test(portRaw)) { errs.push("后端端口必须是数字"); }
    else {
      port = parseInt(portRaw, 10);
      if (port < 1 || port > 65535) { errs.push("后端端口必须在 1–65535 之间"); }
    }
  }
  var upnameEl = document.getElementById("ngx-upname");
  var upname = upnameEl ? upnameEl.value.trim() : "";
  var upsEl = document.getElementById("ngx-upstreams");
  var upsRaw = upsEl ? upsEl.value : "";
  var lbEl = document.getElementById("ngx-lb");
  var lb = lbEl ? lbEl.value : "rr";
  var servers = [];
  if (multi) {
    if (!/^[A-Za-z0-9_]+$/.test(upname)) { errs.push("upstream 名称只能含字母、数字、下划线（如 backend_pool）"); }
    var ulines = upsRaw.split("\n");
    var sawLine = false;
    for (var ui = 0; ui < ulines.length; ui++) {
      var uline = ulines[ui].trim();
      if (!uline) { continue; }
      sawLine = true;
      var uparts = uline.split(/\s+/);
      var um = uparts[0].match(/^([A-Za-z0-9._-]+):(\d+)$/);
      if (!um) { errs.push("后端列表第 " + (ui + 1) + " 行格式不正确（应为 地址:端口，可跟空格加权重，如 127.0.0.1:3000 2）"); continue; }
      var uport = parsePortStrict(um[2]);
      if (uport === null) { errs.push("后端列表第 " + (ui + 1) + " 行端口必须在 1–65535 之间"); continue; }
      var uweight = null;
      if (uparts.length === 2) {
        if (!/^\d+$/.test(uparts[1])) { errs.push("后端列表第 " + (ui + 1) + " 行权重必须是整数"); continue; }
        uweight = parseInt(uparts[1], 10);
        if (uweight < 1 || uweight > 1000) { errs.push("后端列表第 " + (ui + 1) + " 行权重必须在 1–1000 之间"); continue; }
      } else if (uparts.length > 2) {
        errs.push("后端列表第 " + (ui + 1) + " 行内容过多（应为 地址:端口 加可选权重）"); continue;
      }
      servers.push({ host: um[1], port: uport, weight: uweight });
    }
    if (!sawLine) { errs.push("多后端模式下后端列表不能为空（每行一个 地址:端口）"); }
    else if (servers.length === 1 && errs.length === 0) { errs.push("多后端模式至少要填 2 个后端；只有一个后端时请关掉多后端模式用单后端生成"); }
  }
  function ngxTimeout(id, label) {
    var el = document.getElementById(id);
    var raw = el ? el.value.trim() : "";
    if (!raw) { return null; }
    if (!/^\d+$/.test(raw)) { errs.push(label + "必须是整数秒"); return null; }
    var n = parseInt(raw, 10);
    if (n < 1 || n > 3600) { errs.push(label + "必须在 1–3600 秒之间"); return null; }
    return n;
  }
  var tConn = ngxTimeout("ngx-t-conn", "proxy_connect_timeout");
  var tSend = ngxTimeout("ngx-t-send", "proxy_send_timeout");
  var tRead = ngxTimeout("ngx-t-read", "proxy_read_timeout");
  var anyTimeout = (tConn !== null || tSend !== null || tRead !== null);
  var limitEl = document.getElementById("ngx-limit");
  var limit = limitEl ? limitEl.checked : false;
  var limitRate = null, limitBurst = null;
  if (limit) {
    var lrRaw = document.getElementById("ngx-limit-rate").value.trim();
    if (!/^\d+$/.test(lrRaw) || parseInt(lrRaw, 10) < 1 || parseInt(lrRaw, 10) > 10000) { errs.push("限流速率必须是 1–10000 的整数（次/秒）"); }
    else { limitRate = parseInt(lrRaw, 10); }
    var lbRaw = document.getElementById("ngx-limit-burst").value.trim();
    if (!/^\d+$/.test(lbRaw) || parseInt(lbRaw, 10) > 10000) { errs.push("限流突发 burst 必须是 0–10000 的整数"); }
    else { limitBurst = parseInt(lbRaw, 10); }
  }
  var zone = "limit_" + domain.replace(/[^A-Za-z0-9]+/g, "_");
  var realipEl = document.getElementById("ngx-realip");
  var realip = realipEl ? realipEl.checked : false;
  var rifEl = document.getElementById("ngx-realip-from");
  var rif = rifEl ? rifEl.value.trim() : "";
  if (realip) {
    if (!rif) { errs.push("启用真实 IP 还原后必须填写可信代理地址段（CDN / 代理的 IP 或 CIDR）"); }
    else if (!(subParseIp(rif) || parseCidr4(rif) || isValidIpv6(rif) || parseCidr6(rif))) { errs.push("可信代理地址段格式不正确（填单个 IP 或 CIDR，如 10.0.0.0/8）"); }
  }
  var errBox = document.getElementById("ngx-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  function realipLines() {
    if (!realip) { return []; }
    return [
      "    # 只信任来自该地址段的 X-Forwarded-For 来还原真实 IP（前面确实有 CDN / 代理才启用；地址段填错等于允许任何人伪造来源 IP）",
      "    set_real_ip_from " + rif + ";",
      "    real_ip_header X-Forwarded-For;",
      ""
    ];
  }
  function locationBlock() {
    var b = [];
    b.push("    location / {");
    if (limit) {
      b.push("        limit_req zone=" + zone + " burst=" + limitBurst + " nodelay;");
    }
    b.push("        proxy_pass " + proto + "://" + (multi ? upname : host + ":" + port) + ";");
    b.push("        proxy_http_version 1.1;");
    b.push("        proxy_set_header Host $host;");
    b.push("        proxy_set_header X-Real-IP $remote_addr;");
    b.push("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
    b.push("        proxy_set_header X-Forwarded-Proto $scheme;");
    if (ws) {
      b.push("        proxy_set_header Upgrade $http_upgrade;");
      b.push("        proxy_set_header Connection \"upgrade\";");
    }
    if (anyTimeout) {
      b.push("        proxy_connect_timeout " + (tConn || 60) + "s;");
      b.push("        proxy_send_timeout " + (tSend || 60) + "s;");
      b.push("        proxy_read_timeout " + (tRead || 60) + "s;");
    } else {
      b.push("        proxy_read_timeout 60s;");
    }
    b.push("    }");
    return b;
  }
  var L = [];
  L.push("# 文件：/etc/nginx/sites-available/" + domain + ".conf");
  L.push("# 启用：sudo ln -s /etc/nginx/sites-available/" + domain + ".conf /etc/nginx/sites-enabled/");
  if (limit) {
    L.push("# 限流区定义只能放在 http {} 顶层：把下一行写进 /etc/nginx/nginx.conf 的 http 段（或被 http 段 include 的文件），放进 server 块会让 nginx -t 直接报错");
    L.push("limit_req_zone $binary_remote_addr zone=" + zone + ":10m rate=" + limitRate + "r/s;");
    L.push("");
  }
  if (multi) {
    L.push("# 多后端负载均衡：策略为 " + (lb === "least_conn" ? "least_conn 最少连接" : (lb === "ip_hash" ? "ip_hash 来源 IP 哈希" : "轮询")) + "（weight 越大分得越多，不写即 1）");
    L.push("upstream " + upname + " {");
    if (lb === "least_conn") { L.push("    least_conn;"); }
    if (lb === "ip_hash") {
      L.push("    ip_hash;");
      L.push("    # 注意：ip_hash 按来源 IP 前三段哈希分配，权重 weight 不参与计算（下方填了也会被忽略）；前面若有 CDN / 代理，所有访客的来源 IP 都会变成代理 IP，粘性失效且流量倾斜，这种架构不要选 ip_hash");
    }
    servers.forEach(function (s) {
      L.push("    server " + s.host + ":" + s.port + (s.weight ? " weight=" + s.weight : "") + " max_fails=3 fail_timeout=30s;");
    });
    L.push("    # 健康检查（被动）：某后端连续失败累计 3 次（max_fails）后，30 秒（fail_timeout）内暂时摘除，期满再放回试探");
    L.push("    # 注意：定时主动探活是 NGINX Plus 商业版功能（或需第三方模块），开源版默认没有，不要照抄 Plus 文档的 health_check 指令");
    L.push("}");
    L.push("");
  }
  if (https) {
    L.push("server {");
    L.push("    listen 80;");
    L.push("    server_name " + domain + ";");
    L.push("    return 301 https://$host$request_uri;");
    L.push("}");
    L.push("");
    L.push("server {");
    L.push("    listen 443 ssl;");
    L.push("    server_name " + domain + ";");
    L.push("    ssl_certificate /etc/letsencrypt/live/" + domain + "/fullchain.pem;");
    L.push("    ssl_certificate_key /etc/letsencrypt/live/" + domain + "/privkey.pem;");
    L.push("");
    L = L.concat(realipLines());
    L = L.concat(locationBlock());
    L.push("}");
    L.push("");
    L.push("# 证书还没签出来之前先不要 reload：先按 09 部分 HTTPS 证书章用 certbot 签发，或临时去掉本 443 块");
  } else {
    L.push("server {");
    L.push("    listen 80;");
    L.push("    server_name " + domain + ";");
    L.push("");
    L = L.concat(realipLines());
    L = L.concat(locationBlock());
    L.push("}");
  }
  L.push("");
  L.push("# 落地与验证（逐条执行）：");
  L.push("# sudo nginx -t");
  L.push("# sudo systemctl reload nginx");
  L.push("# curl -I http" + (https ? "s" : "") + "://" + domain + "/");
  out.textContent = L.join("\n");
}
function dcGenerate() {
  var out = document.getElementById("dc-out");
  if (!out) { return; }
  var local = document.getElementById("dc-local").checked;
  var sel = {};
  var any = false;
  document.querySelectorAll(".dc-svc").forEach(function (b) {
    sel[b.getAttribute("data-key")] = b.checked;
    if (b.checked) { any = true; }
  });
  var errBox = document.getElementById("dc-err");
  if (!any) {
    errBox.style.display = "block";
    errBox.textContent = "请至少勾选一个服务";
    out.textContent = "# 先勾选要运行的服务";
    return;
  }
  errBox.style.display = "none";
  var autoMysql = sel.wordpress && !sel.mysql;
  if (autoMysql) { sel.mysql = true; }
  function portMap(p) { return local ? ("127.0.0.1:" + p) : p; }
  var L = [];
  L.push("# docker-compose.yml —— 落盘前逐行审阅；启动：docker compose up -d；状态：docker compose ps");
  L.push("# 所有 CHANGE_ME_* 占位符必须替换为强密码，且真实密码不要提交进 Git");
  if (autoMysql) { L.push("# 已自动带上 WordPress 依赖的 MySQL 服务"); }
  L.push("services:");
  var vols = [];
  if (sel.nginx) {
    L.push("  nginx:");
    L.push("    image: nginx:stable");
    L.push("    restart: unless-stopped");
    L.push("    ports:");
    L.push("      - \"" + portMap("80:80") + "\"");
    L.push("    networks:");
    L.push("      - appnet");
    L.push("");
  }
  if (sel.mysql) {
    vols.push("mysql_data");
    L.push("  mysql:");
    L.push("    image: mysql:8.4");
    L.push("    restart: unless-stopped");
    L.push("    environment:");
    L.push("      MYSQL_ROOT_PASSWORD: \"CHANGE_ME_mysql_root_pw\"");
    L.push("      MYSQL_DATABASE: appdb");
    L.push("    ports:");
    L.push("      - \"" + portMap("3306:3306") + "\"");
    L.push("    volumes:");
    L.push("      - mysql_data:/var/lib/mysql");
    L.push("    healthcheck:");
    L.push("      test: [\"CMD\", \"mysqladmin\", \"ping\", \"-h\", \"localhost\", \"-pCHANGE_ME_mysql_root_pw\"]");
    L.push("      interval: 10s");
    L.push("      timeout: 5s");
    L.push("      retries: 5");
    L.push("    networks:");
    L.push("      - appnet");
    L.push("");
  }
  if (sel.postgres) {
    vols.push("postgres_data");
    L.push("  postgres:");
    L.push("    image: postgres:16");
    L.push("    restart: unless-stopped");
    L.push("    environment:");
    L.push("      POSTGRES_PASSWORD: \"CHANGE_ME_pg_pw\"");
    L.push("      POSTGRES_DB: appdb");
    L.push("    ports:");
    L.push("      - \"" + portMap("5432:5432") + "\"");
    L.push("    volumes:");
    L.push("      - postgres_data:/var/lib/postgresql/data");
    L.push("    healthcheck:");
    L.push("      test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]");
    L.push("      interval: 10s");
    L.push("      timeout: 5s");
    L.push("      retries: 5");
    L.push("    networks:");
    L.push("      - appnet");
    L.push("");
  }
  if (sel.redis) {
    vols.push("redis_data");
    L.push("  redis:");
    L.push("    image: redis:7");
    L.push("    restart: unless-stopped");
    L.push("    command: redis-server --appendonly yes");
    L.push("    ports:");
    L.push("      - \"" + portMap("6379:6379") + "\"");
    L.push("    volumes:");
    L.push("      - redis_data:/data");
    L.push("    healthcheck:");
    L.push("      test: [\"CMD\", \"redis-cli\", \"ping\"]");
    L.push("      interval: 10s");
    L.push("      timeout: 5s");
    L.push("      retries: 5");
    L.push("    networks:");
    L.push("      - appnet");
    L.push("");
  }
  if (sel.wordpress) {
    vols.push("wp_data");
    L.push("  wordpress:");
    L.push("    image: wordpress:6-apache");
    L.push("    restart: unless-stopped");
    L.push("    environment:");
    L.push("      WORDPRESS_DB_HOST: mysql:3306");
    L.push("      WORDPRESS_DB_NAME: appdb");
    L.push("      WORDPRESS_DB_USER: root");
    L.push("      WORDPRESS_DB_PASSWORD: \"CHANGE_ME_mysql_root_pw\"   # 与 mysql 的 root 密码占位符保持一致，教学示例用 root，生产建议建专用账号");
    L.push("    ports:");
    L.push("      - \"" + portMap("8080:80") + "\"");
    L.push("    volumes:");
    L.push("      - wp_data:/var/www/html");
    L.push("    depends_on:");
    L.push("      mysql:");
    L.push("        condition: service_healthy");
    L.push("    networks:");
    L.push("      - appnet");
    L.push("");
  }
  if (vols.length) {
    L.push("volumes:");
    for (var i = 0; i < vols.length; i++) { L.push("  " + vols[i] + ":"); }
    L.push("");
  }
  L.push("networks:");
  L.push("  appnet:");
  L.push("    driver: bridge");
  out.textContent = L.join("\n");
}
function lvmGenerate() {
  var out = document.getElementById("lvm-out");
  if (!out) { return; }
  var dev = document.getElementById("lvm-dev").value.trim();
  var isNew = document.getElementById("lvm-newpv").checked;
  var vg = document.getElementById("lvm-vg").value.trim();
  var lv = document.getElementById("lvm-lv").value.trim();
  var mount = document.getElementById("lvm-mount").value.trim();
  var mode = document.getElementById("lvm-mode").value;
  var sizeRaw = document.getElementById("lvm-size").value.trim();
  var unit = document.getElementById("lvm-unit").value;
  var fs = document.getElementById("lvm-fs").value;
  document.getElementById("lvm-grp-size").style.display = (mode === "add") ? "inline" : "none";
  var errs = [];
  if (!/^\/dev\/[A-Za-z0-9/_.-]+$/.test(dev)) { errs.push("PV 设备应为 /dev/ 开头的设备路径（如 /dev/sdb、/dev/nvme0n1p3）"); }
  if (!/^[A-Za-z0-9_+.-]+$/.test(vg)) { errs.push("VG 名不能为空，且只能含字母、数字与 _ + . -"); }
  if (!/^[A-Za-z0-9_+.-]+$/.test(lv)) { errs.push("LV 名不能为空，且只能含字母、数字与 _ + . -"); }
  if (!mount || mount.charAt(0) !== "/") { errs.push("挂载点必须是绝对路径（如 /data）"); }
  if (mode === "add") {
    if (!/^\d+(\.\d+)?$/.test(sizeRaw)) { errs.push("扩容量必须是正数"); }
    else if (parseFloat(sizeRaw) <= 0) { errs.push("扩容量必须大于 0"); }
  }
  var errBox = document.getElementById("lvm-err");
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入，不要执行任何步骤";
    return;
  }
  errBox.style.display = "none";
  var lvPath = "/dev/" + vg + "/" + lv;
  var step = 1;
  var L = [];
  L.push("# LVM 扩容步骤（只生成步骤，人工逐条执行并核对每步输出；本页不会替你执行）");
  L.push("# 扩容前先确认备份可恢复；缩容不在本工具范围内，不要反着套用这些步骤");
  L.push("");
  L.push("# 步骤 0：看清现状（设备、VG 空闲、LV 与挂载点逐项对上再动手）");
  L.push("lsblk");
  L.push("sudo pvs; sudo vgs; sudo lvs");
  L.push("df -h " + mount);
  if (isNew) {
    L.push("");
    L.push("# 步骤 " + step + "：把新设备初始化为 PV（会抹掉该设备原有签名与数据，再次逐字核对设备名）");
    L.push("sudo pvcreate " + dev);
    step++;
  }
  L.push("");
  L.push("# 步骤 " + step + "：把 PV 加入 VG");
  L.push("sudo vgextend " + vg + " " + dev);
  L.push("sudo vgs   # 确认 VFree 已按预期变大");
  step++;
  L.push("");
  L.push("# 步骤 " + step + "：扩展 LV");
  if (mode === "add") {
    L.push("sudo lvextend -L +" + sizeRaw + unit + " " + lvPath);
  } else {
    L.push("sudo lvextend -l +100%FREE " + lvPath);
  }
  L.push("sudo lvs   # 确认 LV 大小已变");
  step++;
  L.push("");
  L.push("# 步骤 " + step + "：扩展文件系统（在线操作，不要先卸载）");
  if (fs === "ext4") {
    L.push("sudo resize2fs " + lvPath);
  } else {
    L.push("sudo xfs_growfs " + mount + "   # XFS 按挂载点扩；XFS 不支持缩容");
  }
  step++;
  L.push("");
  L.push("# 步骤 " + step + "：验证（容量与预期对上才算完成）");
  L.push("df -h " + mount);
  out.textContent = L.join("\n");
}
function initSshGen() {
  var out = document.getElementById("ssh-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["ssh-type", "ssh-host", "ssh-user", "ssh-port", "ssh-key", "ssh-local", "ssh-remote", "ssh-listen", "ssh-thost", "ssh-tport", "ssh-jump"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", sshGenerate);
      el.addEventListener("change", sshGenerate);
    }
  });
  bindCopy("ssh-copy", "ssh-out", "ssh-msg");
  sshGenerate();
}
function initSshCfgGen() {
  var out = document.getElementById("cfg-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var ids = ["cfg-alive", "cfg-alivemax", "cfg-timeout"];
  for (var i = 1; i <= 3; i++) {
    ["alias", "host", "user", "port", "key", "jump"].forEach(function (k) { ids.push("cfg" + i + "-" + k); });
  }
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", sshConfigGenerate);
      el.addEventListener("change", sshConfigGenerate);
    }
  });
  bindCopy("cfg-copy", "cfg-out", "cfg-msg");
  sshConfigGenerate();
}
function initSubnetGen() {
  var out = document.getElementById("sub-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["sub-family", "sub-mode", "sub-ip", "sub-prefix", "sub-mask", "sub-prefix6"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", subGenerate);
      el.addEventListener("change", subGenerate);
    }
  });
  bindCopy("sub-copy", "sub-out", "sub-msg");
  subGenerate();
}
function initCronGen() {
  var out = document.getElementById("cron-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var preset = document.getElementById("cron-preset");
  if (preset) { preset.addEventListener("change", cronApplyPreset); }
  var fieldChanged = function () {
    var p = document.getElementById("cron-preset");
    if (p) { p.value = "custom"; }
    cronGenerate();
  };
  CRON_DEFS.forEach(function (d) {
    ["mode", "step", "at"].forEach(function (part) {
      var el = document.getElementById("cron-" + d.key + "-" + part);
      if (el) {
        el.addEventListener("input", fieldChanged);
        el.addEventListener("change", fieldChanged);
      }
    });
  });
  bindCopy("cron-copy", "cron-out", "cron-msg");
  cronGenerate();
}
function initUnitGen() {
  var out = document.getElementById("unit-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["unit-name", "unit-desc", "unit-exec", "unit-workdir", "unit-user", "unit-restart", "unit-restartsec", "unit-mem", "unit-cpu", "unit-envfile", "unit-envfile-opt", "unit-env", "unit-after", "unit-wants", "unit-requires", "unit-stdout", "unit-stderr", "unit-h-nnp", "unit-h-ptmp", "unit-h-psys", "unit-h-phome", "unit-h-pdev", "unit-h-pkt"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", unitGenerate);
      el.addEventListener("change", unitGenerate);
    }
  });
  bindCopy("unit-copy", "unit-out", "unit-msg");
  unitGenerate();
}
function initNginxGen() {
  var out = document.getElementById("ngx-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["ngx-domain", "ngx-proto", "ngx-host", "ngx-port", "ngx-ws", "ngx-https", "ngx-multi", "ngx-upname", "ngx-lb", "ngx-upstreams", "ngx-t-conn", "ngx-t-send", "ngx-t-read", "ngx-limit", "ngx-limit-rate", "ngx-limit-burst", "ngx-realip", "ngx-realip-from"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", ngxGenerate);
      el.addEventListener("change", ngxGenerate);
    }
  });
  bindCopy("ngx-copy", "ngx-out", "ngx-msg");
  ngxGenerate();
}
function initComposeGen() {
  var out = document.getElementById("dc-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  document.querySelectorAll(".dc-svc").forEach(function (el) {
    el.addEventListener("change", dcGenerate);
  });
  var local = document.getElementById("dc-local");
  if (local) { local.addEventListener("change", dcGenerate); }
  bindCopy("dc-copy", "dc-out", "dc-msg");
  dcGenerate();
}
function initLvmGen() {
  var out = document.getElementById("lvm-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["lvm-dev", "lvm-newpv", "lvm-vg", "lvm-lv", "lvm-mount", "lvm-mode", "lvm-size", "lvm-unit", "lvm-fs"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", lvmGenerate);
      el.addEventListener("change", lvmGenerate);
    }
  });
  bindCopy("lvm-copy", "lvm-out", "lvm-msg");
  lvmGenerate();
}
function bytesHex(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) {
    var h = bytes[i].toString(16);
    s += (h.length < 2 ? "0" : "") + h;
  }
  return s;
}
function b64DecodeStrict(s) {
  var clean = s.replace(/\s+/g, "");
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error("Base64 内容不完整或含非法字符");
  }
  var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = [];
  for (var i = 0; i < clean.length; i += 4) {
    var c0 = table.indexOf(clean.charAt(i));
    var c1 = table.indexOf(clean.charAt(i + 1));
    var p2 = clean.charAt(i + 2), p3 = clean.charAt(i + 3);
    var c2 = p2 === "=" ? 0 : table.indexOf(p2);
    var c3 = p3 === "=" ? 0 : table.indexOf(p3);
    var n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >> 16) & 255);
    if (p2 !== "=") { out.push((n >> 8) & 255); }
    if (p3 !== "=") { out.push(n & 255); }
  }
  return new Uint8Array(out);
}
var CERT_RDN_NAMES = { "2.5.4.3": "CN", "2.5.4.5": "serialNumber", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU", "1.2.840.113549.1.9.1": "emailAddress" };
var CERT_SIGALG_NAMES = {
  "1.2.840.113549.1.1.4": "md5WithRSAEncryption（MD5 已不安全）",
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption（SHA-1 已弃用）",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1（已弃用）",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448"
};
function derTlv(buf, off) {
  if (off + 2 > buf.length) { throw new Error("DER 数据不完整"); }
  var tag = buf[off];
  if ((tag & 0x1f) === 0x1f) { throw new Error("遇到多字节标签，无法解析"); }
  var lb = buf[off + 1];
  var len, hdr = 2;
  if (lb === 0x80) { throw new Error("DER 不定长形式不受支持"); }
  if (lb > 0x80) {
    var n = lb - 0x80;
    if (n > 4 || off + 2 + n > buf.length) { throw new Error("DER 长度字段非法"); }
    len = 0;
    for (var i = 0; i < n; i++) { len = len * 256 + buf[off + 2 + i]; }
    hdr = 2 + n;
  } else { len = lb; }
  if (off + hdr + len > buf.length) { throw new Error("DER 长度超出数据范围"); }
  return { tag: tag, head: off, start: off + hdr, len: len, end: off + hdr + len };
}
function derKids(buf, tlv) {
  var list = [], off = tlv.start;
  while (off < tlv.end) {
    var t = derTlv(buf, off);
    list.push(t);
    off = t.end;
  }
  if (off !== tlv.end) { throw new Error("DER 内部结构长度对不齐"); }
  return list;
}
function derOidStr(buf, tlv) {
  if (tlv.len < 1) { throw new Error("OID 内容为空"); }
  var vals = [], idx = tlv.start, end = tlv.end;
  while (idx < end) {
    var v = 0, b;
    do {
      if (idx >= end) { throw new Error("OID 编码不完整"); }
      b = buf[idx]; idx++;
      v = v * 128 + (b & 0x7f);
    } while (b & 0x80);
    vals.push(v);
  }
  var first = vals[0], head;
  if (first < 40) { head = [0, first]; } else if (first < 80) { head = [1, first - 40]; } else { head = [2, first - 80]; }
  return head.concat(vals.slice(1)).join(".");
}
function derText(buf, tlv) {
  var bytes = buf.subarray(tlv.start, tlv.end), s = "", i;
  if (tlv.tag === 0x1e) {
    for (i = 0; i + 1 < bytes.length; i += 2) { s += String.fromCharCode(bytes[i] * 256 + bytes[i + 1]); }
    return s;
  }
  if (tlv.tag === 0x14) {
    for (i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
    return s;
  }
  return new TextDecoder("utf-8").decode(bytes);
}
function derTimeMs(buf, tlv) {
  var s = "", i;
  for (i = tlv.start; i < tlv.end; i++) { s += String.fromCharCode(buf[i]); }
  var m, year, g;
  if (tlv.tag === 0x17) {
    m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/.exec(s);
    if (!m) { throw new Error("UTCTime 无法解析：" + s); }
    var yy = parseInt(m[1], 10);
    year = yy < 50 ? 2000 + yy : 1900 + yy;
    g = [m[2], m[3], m[4], m[5], m[6] || "00", m[7]];
  } else if (tlv.tag === 0x18) {
    m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/.exec(s);
    if (!m) { throw new Error("GeneralizedTime 无法解析：" + s); }
    year = parseInt(m[1], 10);
    g = [m[2], m[3], m[4], m[5], m[6] || "00", m[7]];
  } else { throw new Error("有效期字段不是时间类型"); }
  var ms = Date.UTC(year, parseInt(g[0], 10) - 1, parseInt(g[1], 10), parseInt(g[2], 10), parseInt(g[3], 10), parseInt(g[4], 10));
  var tz = g[5];
  if (tz !== "Z") {
    var sign = tz.charAt(0) === "+" ? 1 : -1;
    var offMin = parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10);
    ms -= sign * offMin * 60000;
  }
  return ms;
}
function derAlgName(buf, algTlv) {
  var kids = derKids(buf, algTlv);
  var oid = derOidStr(buf, kids[0]);
  return CERT_SIGALG_NAMES[oid] || ("未知算法（OID " + oid + "）");
}
function derNameStr(buf, nameTlv) {
  var parts = [];
  derKids(buf, nameTlv).forEach(function (setT) {
    derKids(buf, setT).forEach(function (ava) {
      var kv = derKids(buf, ava);
      if (kv.length < 2) { return; }
      var oid = derOidStr(buf, kv[0]);
      var label = CERT_RDN_NAMES[oid] || oid;
      var val;
      try { val = derText(buf, kv[1]); } catch (e) { val = "(无法解码)"; }
      parts.push(label + "=" + val);
    });
  });
  return parts.join(", ");
}
function derSerialHex(buf, intTlv) {
  var bytes = buf.subarray(intTlv.start, intTlv.end);
  var start = (bytes.length > 1 && bytes[0] === 0) ? 1 : 0;
  var hex = "";
  for (var i = start; i < bytes.length; i++) {
    var h = bytes[i].toString(16);
    hex += (h.length < 2 ? "0" : "") + h;
  }
  return hex.toUpperCase();
}
function certParseDer(der) {
  var top = derTlv(der, 0);
  if (top.tag !== 0x30) { throw new Error("顶层不是 SEQUENCE，可能不是 X.509 证书"); }
  var parts = derKids(der, top);
  if (parts.length !== 3) { throw new Error("证书应由 3 段组成，实际 " + parts.length + " 段"); }
  var tbs = derKids(der, parts[0]);
  var i = 0, version = 1;
  if (tbs.length && tbs[0].tag === 0xa0) {
    var vt = derTlv(der, tbs[0].start);
    var vb = der.subarray(vt.start, vt.end), vv = 0, k;
    for (k = 0; k < vb.length; k++) { vv = vv * 256 + vb[k]; }
    version = vv + 1;
    i = 1;
  }
  if (tbs.length < i + 6) { throw new Error("TBSCertificate 字段不完整"); }
  var serial = derSerialHex(der, tbs[i]); i++;
  i++;
  var issuerT = tbs[i]; var issuer = derNameStr(der, tbs[i]); i++;
  var validity = derKids(der, tbs[i]); i++;
  if (validity.length !== 2) { throw new Error("有效期字段不完整"); }
  var notBefore = derTimeMs(der, validity[0]);
  var notAfter = derTimeMs(der, validity[1]);
  var subjectT = tbs[i]; var subject = derNameStr(der, tbs[i]); i++;
  i++;
  var sans = [];
  for (; i < tbs.length; i++) {
    if (tbs[i].tag !== 0xa3) { continue; }
    var extSeq = derTlv(der, tbs[i].start);
    derKids(der, extSeq).forEach(function (ext) {
      var f = derKids(der, ext);
      if (f.length < 2) { return; }
      var oid = derOidStr(der, f[0]);
      if (oid !== "2.5.29.17") { return; }
      var valT = f[f.length - 1];
      var inner = derTlv(der, valT.start);
      derKids(der, inner).forEach(function (gn) {
        var raw = der.subarray(gn.start, gn.end), txt = "", q;
        if (gn.tag === 0x87) {
          if (raw.length === 4) { sans.push("IP: " + raw[0] + "." + raw[1] + "." + raw[2] + "." + raw[3]); }
          else if (raw.length === 16) {
            var gs = [];
            for (q = 0; q < 16; q += 2) { gs.push(raw[q] * 256 + raw[q + 1]); }
            sans.push("IP: " + ipv6Compress(gs));
          }
          return;
        }
        for (q = 0; q < raw.length; q++) { txt += String.fromCharCode(raw[q]); }
        if (gn.tag === 0x82) { sans.push("DNS: " + txt); }
        else if (gn.tag === 0x81) { sans.push("邮箱: " + txt); }
        else if (gn.tag === 0x86) { sans.push("URI: " + txt); }
      });
    });
  }
  var selfSigned = bytesHex(der.subarray(issuerT.head, issuerT.end)) === bytesHex(der.subarray(subjectT.head, subjectT.end));
  return {
    version: version, serial: serial, sigAlg: derAlgName(der, parts[1]),
    issuer: issuer, subject: subject, selfSigned: selfSigned,
    notBefore: notBefore, notAfter: notAfter, sans: sans
  };
}
function certFmtTime(ms) {
  var d = new Date(ms);
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " UTC";
}
function certGenerate() {
  var out = document.getElementById("cert-out");
  if (!out) { return; }
  var errBox = document.getElementById("cert-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var pem = document.getElementById("cert-pem").value;
  if (!pem.replace(/\s+/g, "")) {
    errBox.style.display = "none";
    out.textContent = "# 把证书 PEM 粘贴到上方文本框，这里会显示解析结果（有效期 / 签发者 / SAN / 指纹 / 剩余天数）";
    return;
  }
  if (/PRIVATE KEY/.test(pem)) {
    fail("检测到 PRIVATE KEY 内容：私钥绝不能粘贴到任何网页工具里。请只粘贴证书（CERTIFICATE 块）；若这段私钥曾在别处公开，应视为已泄露并立即更换。");
    return;
  }
  var m = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
  if (!m) {
    fail("没有找到 -----BEGIN CERTIFICATE----- 块，请粘贴完整的 PEM 证书（只含证书，不要私钥）。");
    return;
  }
  var domain = document.getElementById("cert-domain").value.trim();
  if (domain && !ngxValidDomain(domain)) {
    fail("域名格式不正确（如 example.com）。");
    return;
  }
  var der;
  try { der = b64DecodeStrict(m[1]); } catch (e) { fail("证书 Base64 解码失败：" + e.message); return; }
  var info;
  try { info = certParseDer(der); } catch (e) { fail("证书解析失败：" + e.message); return; }
  if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) {
    fail("当前环境不支持 SubtleCrypto（需要 HTTPS 页面），无法计算指纹。");
    return;
  }
  var scene = document.getElementById("cert-scene").value;
  crypto.subtle.digest("SHA-256", der).then(function (buf) {
    var fp = bytesHex(new Uint8Array(buf)).toUpperCase().replace(/(..)(?=.)/g, "$1:");
    var now = Date.now();
    var days = Math.floor((info.notAfter - now) / 86400000);
    var lines = [];
    lines.push("主体（Subject）：" + (info.subject || "(空)"));
    lines.push("签发者（Issuer）：" + (info.issuer || "(空)") + (info.selfSigned ? "（与主体相同：自签证书）" : ""));
    lines.push("序列号：" + info.serial);
    lines.push("版本：v" + info.version);
    lines.push("签名算法：" + info.sigAlg);
    lines.push("生效时间：" + certFmtTime(info.notBefore));
    lines.push("到期时间：" + certFmtTime(info.notAfter));
    if (info.notBefore > now) {
      lines.push("剩余天数：尚未生效（还有 " + Math.ceil((info.notBefore - now) / 86400000) + " 天生效）");
    } else if (info.notAfter <= now) {
      lines.push("剩余天数：已过期 " + Math.abs(days) + " 天（⚠ 立即续期，并排查自动续期为何失效）");
    } else {
      var grade = days > 30 ? "正常" : (days >= 15 ? "请确认自动续期在跑" : "⚠ 小于 15 天：立即手动续期并排查自动续期");
      lines.push("剩余天数：" + days + " 天（" + grade + "）");
    }
    lines.push("SAN（使用者别名）：");
    if (info.sans.length) {
      info.sans.forEach(function (s) { lines.push("  - " + s); });
    } else {
      lines.push("  （无 SAN 扩展）");
    }
    lines.push("SHA-256 指纹：" + fp);
    lines.push("");
    lines.push("# 边界说明：本工具只解析证书字段，不做证书链验证与吊销检查；");
    lines.push("# 解析成功不等于证书可信，可信与否以浏览器 / 系统的链验证结果为准。");
    lines.push("");
    var d = domain, q;
    if (!d) {
      for (q = 0; q < info.sans.length; q++) {
        if (info.sans[q].indexOf("DNS: ") === 0) { d = info.sans[q].slice(5); break; }
      }
      if (d) { lines.push("# 续期命令的域名取自证书 SAN 的第一个 DNS 名：" + d); }
      else { d = "example.com"; lines.push("# 未填域名且证书无 DNS SAN，命令中的 example.com 请替换为你的域名"); }
    }
    lines.push("# 续期检查命令（按所选场景生成）：");
    if (scene === "certbot") {
      lines.push("sudo certbot certificates");
      lines.push("sudo certbot renew --dry-run");
    } else if (scene === "acme") {
      lines.push("~/.acme.sh/acme.sh --list");
      lines.push("~/.acme.sh/acme.sh --renew -d " + d + " --ecc");
    } else {
      lines.push("echo | openssl s_client -connect " + d + ":443 -servername " + d + " 2>/dev/null | openssl x509 -noout -dates -subject -issuer");
      lines.push("curl -sv https://" + d + " --output /dev/null 2>&1 | grep -iE 'expire|start date'");
    }
    errBox.style.display = "none";
    out.textContent = lines.join("\n");
  }, function () { fail("指纹计算失败：SubtleCrypto 调用异常。"); });
}
var PERM_BIT_IDS = [["perm-o-r", 256], ["perm-o-w", 128], ["perm-o-x", 64], ["perm-g-r", 32], ["perm-g-w", 16], ["perm-g-x", 8], ["perm-t-r", 4], ["perm-t-w", 2], ["perm-t-x", 1], ["perm-suid", 2048], ["perm-sgid", 1024], ["perm-sticky", 512]];
var permModeVal = 420;
function permSymbolic(mode) {
  var chars = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  var s = chars[(mode >> 6) & 7] + chars[(mode >> 3) & 7] + chars[mode & 7];
  if (mode & 2048) { s = s.substring(0, 2) + ((mode & 64) ? "s" : "S") + s.substring(3); }
  if (mode & 1024) { s = s.substring(0, 5) + ((mode & 8) ? "s" : "S") + s.substring(6); }
  if (mode & 512) { s = s.substring(0, 8) + ((mode & 1) ? "t" : "T"); }
  return s;
}
function permOctStr(mode) {
  var s = mode.toString(8);
  var want = mode > 511 ? 4 : 3;
  while (s.length < want) { s = "0" + s; }
  return s;
}
function permClassText(mode, shift) {
  var b = (mode >> shift) & 7;
  var t = ((b & 4) ? "r" : "-") + ((b & 2) ? "w" : "-") + ((b & 1) ? "x" : "-");
  var words = [(b & 4) ? "可读" : "不可读", (b & 2) ? "可写" : "不可写", (b & 1) ? "可执行" : "不可执行"];
  return t + "（" + words.join("、") + "）";
}
function permFail(msg) {
  var errBox = document.getElementById("perm-err");
  var out = document.getElementById("perm-out");
  errBox.style.display = "block";
  errBox.textContent = "输入有误：" + msg;
  out.textContent = "# 请先修正上面的输入";
}
function permRender() {
  var out = document.getElementById("perm-out");
  if (!out) { return; }
  var umRaw = document.getElementById("perm-umask").value.trim();
  if (!/^[0-7]{3,4}$/.test(umRaw)) {
    permFail("umask 必须是 3–4 位八进制数字（如 022）");
    return;
  }
  var um = parseInt(umRaw, 8);
  var mode = permModeVal;
  var fileM = 438 & ~um;
  var dirM = 511 & ~um;
  var lines = [];
  lines.push("八进制：" + permOctStr(mode) + (mode > 511 ? "（最高位是特殊位：setuid/setgid/sticky）" : ""));
  lines.push("符号表示：" + permSymbolic(mode));
  lines.push("属主（user）：" + permClassText(mode, 6));
  lines.push("属组（group）：" + permClassText(mode, 3));
  lines.push("其他（other）：" + permClassText(mode, 0));
  if (mode & 2048) { lines.push("特殊位 setuid：执行该文件时以文件属主身份运行——只给极少数系统程序，普通文件不要加"); }
  if (mode & 1024) { lines.push("特殊位 setgid：文件执行时以属组身份运行；目录上表示目录内新建文件继承目录属组"); }
  if (mode & 512) { lines.push("特殊位 sticky：主要用在目录上——目录内文件只有属主能删（如 /tmp）"); }
  lines.push("");
  lines.push("umask " + umRaw + " 下的新建默认权限：");
  lines.push("  普通文件：0666 & ~umask = " + permOctStr(fileM) + "（" + permSymbolic(fileM) + "）");
  lines.push("  目录　　：0777 & ~umask = " + permOctStr(dirM) + "（" + permSymbolic(dirM) + "）");
  lines.push("");
  if (mode & 2) {
    lines.push("⚠ 其他人可写（o+w）：任何本地用户都能修改这个文件/目录——给普通文件 777 是最常见的权限错误，生产环境不要这样设。");
  }
  var missing = [];
  if (!(dirM & 64)) { missing.push("属主"); }
  if (!(dirM & 8)) { missing.push("属组"); }
  if (!(dirM & 1)) { missing.push("其他"); }
  if (missing.length) {
    lines.push("提示：当前 umask 下新建目录缺少 x 位的类别：" + missing.join("、") + "。目录没有 x 就不能进入（cd 失败）、也无法访问其中文件的元数据；目录的 r 只够列出文件名。");
  } else {
    lines.push("提示：目录的 x 位是「进入并访问其中文件」的前提，只给目录 r 不给 x 是常见误解。");
  }
  lines.push("说明：本工具只算基础权限位；ACL（getfacl/setfacl）与 capabilities 不在此列。");
  document.getElementById("perm-err").style.display = "none";
  out.textContent = lines.join("\n");
}
function permFromBoxes() {
  var v = 0;
  PERM_BIT_IDS.forEach(function (p) {
    var el = document.getElementById(p[0]);
    if (el && el.checked) { v += p[1]; }
  });
  permModeVal = v;
  var octEl = document.getElementById("perm-oct");
  if (octEl) { octEl.value = permOctStr(v); }
  permRender();
}
function permFromOct() {
  var raw = document.getElementById("perm-oct").value.trim();
  if (!/^[0-7]{3,4}$/.test(raw)) {
    permFail("八进制必须是 3–4 位 0–7 数字（如 644 或 4755）");
    return;
  }
  permModeVal = parseInt(raw, 8);
  PERM_BIT_IDS.forEach(function (p) {
    var el = document.getElementById(p[0]);
    if (el) { el.checked = (permModeVal & p[1]) !== 0; }
  });
  permRender();
}
function hashNormalizeExpect(raw, algo) {
  var s = raw.replace(/[\s:]/g, "").toLowerCase();
  if (!s) { return ""; }
  var want = algo === "SHA-512" ? 128 : 64;
  if (!/^[0-9a-f]+$/.test(s) || s.length !== want) { return null; }
  return s;
}
function hashShowResult(algo, hexLower, sourceDesc) {
  var out = document.getElementById("hash-out");
  var lines = [];
  lines.push("算法：" + algo);
  lines.push("来源：" + sourceDesc);
  lines.push("摘要：" + hexLower);
  var expect = hashNormalizeExpect(document.getElementById("hash-expect").value, algo);
  if (expect) {
    lines.push(expect === hexLower
      ? "与预期比对：一致 ✔"
      : "与预期比对：不一致 ✘ —— 内容可能损坏、被替换，或预期值填错；先停下核对来源，不要直接使用");
  }
  lines.push("说明：摘要相同只证明两份内容逐字节一致，不证明来源可信；来源可信要配合官方签名或发布页公布的指纹核对。");
  out.textContent = lines.join("\n");
}
function hashReadAll(file, done, failCb) {
  var chunks = [], off = 0, CHUNK = 262144;
  function step() {
    if (off >= file.size) {
      var total = 0, i;
      for (i = 0; i < chunks.length; i++) { total += chunks[i].length; }
      var all = new Uint8Array(total), pos = 0;
      for (i = 0; i < chunks.length; i++) { all.set(chunks[i], pos); pos += chunks[i].length; }
      done(all);
      return;
    }
    var part = file.slice(off, Math.min(off + CHUNK, file.size));
    part.arrayBuffer().then(function (ab) {
      chunks.push(new Uint8Array(ab));
      off += CHUNK;
      step();
    }, failCb);
  }
  step();
}
function hashRun() {
  var out = document.getElementById("hash-out");
  if (!out) { return; }
  var errBox = document.getElementById("hash-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var algo = document.getElementById("hash-algo").value;
  var expectRaw = document.getElementById("hash-expect").value;
  if (expectRaw.replace(/\s+/g, "") && hashNormalizeExpect(expectRaw, algo) === null) {
    fail("预期哈希格式不对：应为 " + (algo === "SHA-512" ? 128 : 64) + " 位十六进制（可带空格或冒号分隔）");
    return;
  }
  if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) {
    fail("当前环境不支持 SubtleCrypto（需要 HTTPS 页面），无法计算摘要。");
    return;
  }
  errBox.style.display = "none";
  var fileEl = document.getElementById("hash-file");
  var file = (fileEl && fileEl.files && fileEl.files.length) ? fileEl.files[0] : null;
  if (file) {
    out.textContent = "# 正在本地读取文件并计算…";
    hashReadAll(file, function (bytes) {
      crypto.subtle.digest(algo, bytes).then(function (buf) {
        hashShowResult(algo, bytesHex(new Uint8Array(buf)), "文件 " + file.name + "（" + file.size + " 字节，本地分块读取、未上传）");
      }, function () { fail("摘要计算失败"); });
    }, function () { fail("文件读取失败"); });
    return;
  }
  var text = document.getElementById("hash-text").value;
  if (!text) {
    out.textContent = "# 请输入文本或选择本地文件";
    return;
  }
  var bytes = new TextEncoder().encode(text);
  crypto.subtle.digest(algo, bytes).then(function (buf) {
    hashShowResult(algo, bytesHex(new Uint8Array(buf)), "文本输入（UTF-8 共 " + bytes.length + " 字节）");
  }, function () { fail("摘要计算失败"); });
}
function verParseSem(s) {
  var raw = s;
  s = s.trim();
  if (!s) { return { error: "版本号不能为空" }; }
  if (s.charAt(0) === "v" || s.charAt(0) === "V") { s = s.slice(1); }
  var build = null, bi = s.indexOf("+");
  if (bi >= 0) { build = s.slice(bi + 1); s = s.slice(0, bi); }
  var pre = null, pi = s.indexOf("-");
  if (pi >= 0) { pre = s.slice(pi + 1); s = s.slice(0, pi); }
  if (!s) { return { error: "缺少主版本部分" }; }
  var segs = s.split(".");
  if (segs.length > 3) { return { error: "主版本段数超过 3（SemVer 只允许 主.次.修订）" }; }
  var nums = [], warn = [], i;
  for (i = 0; i < segs.length; i++) {
    if (!/^\d+$/.test(segs[i])) { return { error: "主版本第 " + (i + 1) + " 段「" + segs[i] + "」不是数字，无法按 SemVer 解析" }; }
    if (segs[i].length > 1 && segs[i].charAt(0) === "0") { warn.push("第 " + (i + 1) + " 段「" + segs[i] + "」含前导零，非严格 SemVer，按数值比较"); }
    nums.push(parseInt(segs[i], 10));
  }
  var padded = false;
  while (nums.length < 3) { nums.push(0); padded = true; }
  var preIds = null;
  if (pre !== null) {
    if (pre === "") { return { error: "预发布部分（- 之后）为空" }; }
    preIds = pre.split(".");
    for (i = 0; i < preIds.length; i++) {
      if (!/^[0-9A-Za-z-]+$/.test(preIds[i])) { return { error: "预发布标识「" + preIds[i] + "」含非法字符" }; }
    }
  }
  return { nums: nums, pre: preIds, build: build, warn: warn, padded: padded };
}
function verCmpSem(a, b, steps) {
  var names = ["主版本", "次版本", "修订号"], i;
  for (i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) {
      steps.push(names[i] + "：" + a.nums[i] + (a.nums[i] > b.nums[i] ? " > " : " < ") + b.nums[i] + "，胜负已定");
      return a.nums[i] > b.nums[i] ? 1 : -1;
    }
  }
  steps.push("主版本三段相同（" + a.nums.join(".") + "）");
  if (a.pre === null && b.pre === null) { steps.push("两边都无预发布后缀"); return 0; }
  if (a.pre === null) { steps.push("A 无预发布后缀、B 有：正式版大于预发布版"); return 1; }
  if (b.pre === null) { steps.push("B 无预发布后缀、A 有：正式版大于预发布版"); return -1; }
  var n = Math.min(a.pre.length, b.pre.length), k;
  for (k = 0; k < n; k++) {
    var x = a.pre[k], y = b.pre[k];
    if (x === y) { continue; }
    var xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) {
      var xi = parseInt(x, 10), yi = parseInt(y, 10);
      if (xi !== yi) {
        steps.push("预发布第 " + (k + 1) + " 段同为数字：" + xi + (xi > yi ? " > " : " < ") + yi);
        return xi > yi ? 1 : -1;
      }
      continue;
    }
    if (xn !== yn) {
      steps.push("预发布第 " + (k + 1) + " 段：数字标识小于字母标识");
      return xn ? -1 : 1;
    }
    steps.push("预发布第 " + (k + 1) + " 段按 ASCII 比较：「" + x + "」" + (x > y ? " > " : " < ") + "「" + y + "」");
    return x > y ? 1 : -1;
  }
  if (a.pre.length !== b.pre.length) {
    steps.push("预发布前段全同，段数多的一方更大");
    return a.pre.length > b.pre.length ? 1 : -1;
  }
  steps.push("预发布部分完全相同");
  return 0;
}
function debParseVer(s) {
  var raw = s;
  s = s.trim();
  if (!s) { return { error: "版本号不能为空" }; }
  if (!/^[A-Za-z0-9.+~:-]+$/.test(s)) { return { error: "含 Debian 版本规则之外的字符" }; }
  var epoch = 0, rest = s, ci = s.indexOf(":");
  if (ci >= 0) {
    var e = s.slice(0, ci);
    if (!/^\d+$/.test(e)) { return { error: "冒号前的 epoch 必须是数字" }; }
    epoch = parseInt(e, 10);
    rest = s.slice(ci + 1);
    if (!rest) { return { error: "epoch 之后不能为空" }; }
  }
  var di = rest.lastIndexOf("-");
  var upstream = di >= 0 ? rest.slice(0, di) : rest;
  var revision = di >= 0 ? rest.slice(di + 1) : "";
  if (!upstream) { return { error: "上游版本部分为空" }; }
  if (!/^\d/.test(upstream)) { return { error: "Debian 上游版本必须以数字开头" }; }
  return { epoch: epoch, upstream: upstream, revision: revision, text: raw.trim() };
}
function debOrder(ch) {
  if (ch === "~") { return -1; }
  if (ch === "") { return 0; }
  var c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) { return 0; }
  if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) { return c; }
  return c + 256;
}
function debCmpPart(a, b) {
  var i = 0, j = 0;
  function isDig(ch) { return ch >= "0" && ch <= "9"; }
  while (i < a.length || j < b.length) {
    var firstDiff = 0;
    while ((i < a.length && !isDig(a.charAt(i))) || (j < b.length && !isDig(b.charAt(j)))) {
      var oa = debOrder(i < a.length ? a.charAt(i) : "");
      var ob = debOrder(j < b.length ? b.charAt(j) : "");
      if (oa !== ob) { return oa < ob ? -1 : 1; }
      if (i < a.length) { i++; }
      if (j < b.length) { j++; }
    }
    while (i < a.length && a.charAt(i) === "0") { i++; }
    while (j < b.length && b.charAt(j) === "0") { j++; }
    while (i < a.length && j < b.length && isDig(a.charAt(i)) && isDig(b.charAt(j))) {
      if (!firstDiff) { firstDiff = a.charCodeAt(i) - b.charCodeAt(j); }
      i++; j++;
    }
    if (i < a.length && isDig(a.charAt(i))) { return 1; }
    if (j < b.length && isDig(b.charAt(j))) { return -1; }
    if (firstDiff) { return firstDiff < 0 ? -1 : 1; }
  }
  return 0;
}
function verGenerate() {
  var out = document.getElementById("ver-out");
  if (!out) { return; }
  var errBox = document.getElementById("ver-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var aRaw = document.getElementById("ver-a").value;
  var bRaw = document.getElementById("ver-b").value;
  var mode = document.getElementById("ver-mode").value;
  var lines = [];
  if (mode === "debian") {
    var da = debParseVer(aRaw), db = debParseVer(bRaw);
    if (da.error) { fail("版本号 A：" + da.error); return; }
    if (db.error) { fail("版本号 B：" + db.error); return; }
    lines.push("规则：Debian / Ubuntu 包版本（dpkg 算法）");
    lines.push("A = epoch " + da.epoch + "，上游 " + da.upstream + "，修订 " + (da.revision === "" ? "(无)" : da.revision));
    lines.push("B = epoch " + db.epoch + "，上游 " + db.upstream + "，修订 " + (db.revision === "" ? "(无)" : db.revision));
    var cmp;
    if (da.epoch !== db.epoch) {
      lines.push("比较过程：epoch " + da.epoch + (da.epoch > db.epoch ? " > " : " < ") + db.epoch + "，胜负已定（epoch 优先于一切）");
      cmp = da.epoch > db.epoch ? 1 : -1;
    } else {
      var cu = debCmpPart(da.upstream, db.upstream);
      if (cu !== 0) {
        lines.push("比较过程：epoch 相同，上游版本 " + da.upstream + (cu > 0 ? " > " : " < ") + db.upstream + "，胜负已定");
        cmp = cu;
      } else {
        var cr = debCmpPart(da.revision, db.revision);
        lines.push("比较过程：epoch 与上游版本都相同，比修订号 " + (da.revision || "(无)") + (cr === 0 ? " = " : (cr > 0 ? " > " : " < ")) + (db.revision || "(无)"));
        cmp = cr;
      }
    }
    lines.push("结论：" + aRaw.trim() + (cmp > 0 ? " > " : (cmp < 0 ? " < " : " = ")) + bRaw.trim() + (cmp === 0 ? "（优先级相同）" : "（" + (cmp > 0 ? "A" : "B") + " 更新，升级时后装）"));
    lines.push("提醒：Debian 规则里 ~ 排在一切之前（1.0~beta1 < 1.0）；这套结论不能套用到 SemVer 软件上。");
  } else {
    var pa = verParseSem(aRaw), pb = verParseSem(bRaw);
    if (pa.error) { fail("版本号 A：" + pa.error); return; }
    if (pb.error) { fail("版本号 B：" + pb.error); return; }
    var steps = [];
    var cmp2 = verCmpSem(pa, pb, steps);
    lines.push("规则：SemVer（语义化版本）");
    lines.push("比较过程：");
    steps.forEach(function (s) { lines.push("  - " + s); });
    lines.push("结论：" + aRaw.trim() + (cmp2 > 0 ? " > " : (cmp2 < 0 ? " < " : " = ")) + bRaw.trim() + (cmp2 === 0 ? "（优先级相同）" : "（" + (cmp2 > 0 ? "A" : "B") + " 更新）"));
    if (pa.padded || pb.padded) { lines.push("注：不足三段的版本号已按 SemVer 惯例补 0（如 1.2 视为 1.2.0）。"); }
    pa.warn.concat(pb.warn).forEach(function (w) { lines.push("注：" + w); });
    if (pa.build !== null || pb.build !== null) { lines.push("注：构建元数据（+ 之后的部分）不参与 SemVer 优先级比较。"); }
    if (cmp2 === 0 && aRaw.trim() !== bRaw.trim()) { lines.push("注：两边优先级相同但写法不同（补零 / 构建元数据 / 前缀 v 的差异），不要当成两个不同版本。"); }
  }
  errBox.style.display = "none";
  out.textContent = lines.join("\n");
}
function dresParseMem(raw) {
  var m = /^(\d+(?:\.\d+)?)\s*([bBkKmMgG])?$/.exec(raw.trim());
  if (!m) { return null; }
  var v = parseFloat(m[1]);
  var unit = (m[2] || "b").toLowerCase();
  var mult = { b: 1, k: 1024, m: 1048576, g: 1073741824 }[unit];
  return Math.round(v * mult);
}
function dresHuman(bytes) {
  var units = [["GiB", 1073741824], ["MiB", 1048576], ["KiB", 1024]], i;
  for (i = 0; i < units.length; i++) {
    if (bytes >= units[i][1]) {
      var v = Math.round(bytes / units[i][1] * 100) / 100;
      return v + " " + units[i][0];
    }
  }
  return bytes + " B";
}
function dresComposeMem(bytes) {
  if (bytes % 1073741824 === 0) { return (bytes / 1073741824) + "g"; }
  if (bytes % 1048576 === 0) { return (bytes / 1048576) + "m"; }
  if (bytes % 1024 === 0) { return (bytes / 1024) + "k"; }
  return String(bytes);
}
function dresGenerate() {
  var out = document.getElementById("dres-out");
  if (!out) { return; }
  var errBox = document.getElementById("dres-err");
  var errs = [];
  var cpusRaw = document.getElementById("dres-cpus").value.trim();
  var sharesRaw = document.getElementById("dres-shares").value.trim();
  var memRaw = document.getElementById("dres-mem").value.trim();
  var storageRaw = document.getElementById("dres-storage").value.trim();
  var cpus = null, shares = null, memBytes = null, storageGB = null;
  if (cpusRaw) {
    if (!/^\d+(\.\d+)?$/.test(cpusRaw)) { errs.push("CPU 上限必须是数字（如 0.5、1.5、4）"); }
    else {
      cpus = parseFloat(cpusRaw);
      if (cpus <= 0 || cpus > 512) { errs.push("CPU 上限应在 0–512 核之间"); }
    }
  }
  if (sharesRaw) {
    if (!/^\d+$/.test(sharesRaw)) { errs.push("CPU 权重必须是整数"); }
    else {
      shares = parseInt(sharesRaw, 10);
      if (!(shares === 0 || (shares >= 2 && shares <= 262144))) { errs.push("CPU 权重应为 0（默认）或 2–262144"); }
    }
  }
  if (memRaw) {
    memBytes = dresParseMem(memRaw);
    if (memBytes === null || memBytes <= 0) { errs.push("内存上限格式不对，应如 512M、1.5G、2048K（可带小数）"); }
  }
  if (storageRaw) {
    if (!/^\d+$/.test(storageRaw)) { errs.push("存储配额必须是整数 GB"); }
    else {
      storageGB = parseInt(storageRaw, 10);
      if (storageGB < 1 || storageGB > 1048576) { errs.push("存储配额应在 1–1048576 GB 之间"); }
    }
  }
  if (!cpusRaw && !sharesRaw && !memRaw && !storageRaw) { errs.push("至少填写一项"); }
  if (errs.length) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + errs.join("；");
    out.textContent = "# 请先修正上面的输入";
    return;
  }
  errBox.style.display = "none";
  var lines = [];
  lines.push("# 换算结果");
  if (cpus !== null) {
    lines.push("CPU 上限：" + cpus + " 核（等价 nano_cpus = " + Math.round(cpus * 1000000000) + "）");
    lines.push("  说明：--cpus 是硬上限，" + cpus + " 表示最多用满 " + cpus + " 个核的算力");
  }
  if (shares !== null) {
    lines.push("CPU 权重：" + shares + "（相对默认值 1024 约 " + (Math.round(shares / 1024 * 100) / 100) + " 倍）");
    lines.push("  说明：权重只在多个容器抢 CPU 时按比例分配，不构成上限，也不保证最低算力");
  }
  if (memBytes !== null) {
    lines.push("内存上限：" + memBytes + " 字节 ≈ " + dresHuman(memBytes));
    lines.push("  说明：超出即触发容器内 OOM（进程被杀），不是宿主机内存预留");
  }
  if (storageGB !== null) {
    lines.push("存储配额：" + storageGB + " GB（--storage-opt size=" + storageGB + "G）");
    lines.push("  说明：依赖 overlay2 + XFS pquota 挂载，普通 ext4 环境通常不生效，落地前先验证");
  }
  lines.push("");
  var runFlags = [];
  if (cpus !== null) { runFlags.push("--cpus " + cpus); }
  if (shares !== null) { runFlags.push("--cpu-shares " + shares); }
  if (memBytes !== null) { runFlags.push("--memory " + memBytes); }
  if (storageGB !== null) { runFlags.push("--storage-opt size=" + storageGB + "G"); }
  lines.push("# docker run 片段：");
  lines.push("docker run " + runFlags.join(" ") + " <镜像>");
  lines.push("");
  lines.push("# docker compose 片段（服务级）：");
  if (shares !== null) { lines.push("    cpu_shares: " + shares); }
  if (cpus !== null || memBytes !== null) {
    lines.push("    deploy:");
    lines.push("      resources:");
    lines.push("        limits:");
    if (cpus !== null) { lines.push("          cpus: \"" + cpus + "\""); }
    if (memBytes !== null) { lines.push("          memory: " + dresComposeMem(memBytes)); }
  }
  lines.push("");
  lines.push("# 提醒：限制是上限不是保证——要预留资源请另用 reservations / --memory-reservation；");
  lines.push("# Docker Desktop（Mac / Windows）还有虚拟机总配额一层，语义与 Linux 原生不同。");
  out.textContent = lines.join("\n");
}
var HTTP_CLASS_TEXT = {
  "1": "1xx 信息类：请求已收到、继续处理，日常很少需要单独处理",
  "2": "2xx 成功类：请求已被成功处理",
  "3": "3xx 重定向类：需要按响应头 Location 进一步跳转",
  "4": "4xx 客户端错误：请求本身有问题（路径、权限、参数、方法、限流）",
  "5": "5xx 服务器错误：服务器或上游处理失败，先查服务状态与代理日志"
};
var HTTP_CODE_DATA = {
  "100": { name: "Continue", mean: "服务器已收到请求头，通知客户端继续发送请求体", cause: "带 Expect: 100-continue 的大文件上传", check: "一般无需处理；上传卡住时查代理是否吞了 Expect 头", link: null },
  "101": { name: "Switching Protocols", mean: "协议切换已同意（如 HTTP 升级为 WebSocket）", cause: "WebSocket / HTTP Upgrade 握手", check: "握手失败时查代理是否透传 Upgrade 与 Connection 头", link: null },
  "200": { name: "OK", mean: "请求成功", cause: "正常响应", check: "无需排查；内容不对时看响应体与缓存", link: null },
  "201": { name: "Created", mean: "请求成功并新建了资源", cause: "POST 创建成功（REST 接口常见）", check: "无需排查", link: null },
  "204": { name: "No Content", mean: "请求成功但无响应体", cause: "DELETE 成功、表单提交后无返回内容", check: "前端拿不到数据时先确认接口是否本就返回 204", link: null },
  "206": { name: "Partial Content", mean: "返回了请求范围内的部分内容", cause: "断点续传、视频拖动（Range 请求）", check: "下载异常时查服务端是否支持 Range", link: null },
  "301": { name: "Moved Permanently", mean: "资源永久重定向到新地址", cause: "HTTP 跳 HTTPS、域名迁移、路径规范化", check: "curl -I 看 Location 是否为预期目标；注意跳转死循环", link: ["../09-web-hosting/01-dns-resolution.md", "网站接入与 DNS 解析 · 场景三：状态码判读"] },
  "302": { name: "Found", mean: "资源临时重定向", cause: "临时跳转、登录回跳", check: "curl -I 看 Location；与 301 的区别是临时性，SEO 与缓存语义不同", link: ["../09-web-hosting/01-dns-resolution.md", "网站接入与 DNS 解析 · 场景三：状态码判读"] },
  "304": { name: "Not Modified", mean: "资源未修改，客户端可用缓存副本", cause: "If-Modified-Since / If-None-Match 条件请求命中", check: "属正常缓存行为；页面不更新时先强刷再查缓存头", link: null },
  "307": { name: "Temporary Redirect", mean: "临时重定向且保持原请求方法与请求体", cause: "临时迁移但要求 POST 仍为 POST", check: "curl -I 看 Location", link: null },
  "308": { name: "Permanent Redirect", mean: "永久重定向且保持原请求方法与请求体", cause: "301 的严格版（方法不变）", check: "curl -I 看 Location", link: null },
  "400": { name: "Bad Request", mean: "请求语法或参数不合法，服务器拒绝处理", cause: "参数缺失/格式错、请求头过大、接口校验不通过", check: "看应用日志的报错字段；用 curl 复现并逐项减参数定位", link: null },
  "401": { name: "Unauthorized", mean: "需要身份认证或认证已失效", cause: "未登录、token 过期、Basic 认证未带凭证", check: "查 WWW-Authenticate 响应头与认证服务状态", link: null },
  "403": { name: "Forbidden", mean: "服务器理解请求但拒绝执行", cause: "目录/文件权限不对、Nginx deny 规则、目录列表被禁且无默认页", check: "ls -ld 看目录权限（目录要 x）；查 nginx error.log 与 deny 配置", link: ["../09-web-hosting/01-dns-resolution.md", "网站接入与 DNS 解析 · 场景三：状态码判读"] },
  "404": { name: "Not Found", mean: "请求的路径不存在", cause: "root 目录写错、文件确实不存在、rewrite 规则把路径改错", check: "对照 nginx root 与请求路径在磁盘上逐段核对", link: ["../09-web-hosting/01-dns-resolution.md", "网站接入与 DNS 解析 · 场景三：状态码判读"] },
  "405": { name: "Method Not Allowed", mean: "路径存在但不允许该请求方法", cause: "对静态文件发 POST、接口只开了 GET", check: "看 Allow 响应头；查应用路由与代理的 limit_except", link: null },
  "408": { name: "Request Timeout", mean: "客户端发送请求太慢，服务器等超时", cause: "弱网大上传、客户端卡死、请求头迟迟不发完", check: "查 client_header_timeout / client_body_timeout 与网络质量", link: null },
  "409": { name: "Conflict", mean: "请求与资源当前状态冲突", cause: "重复创建、版本冲突（并发编辑）", check: "看应用日志的冲突记录，按接口语义重试或合并", link: null },
  "410": { name: "Gone", mean: "资源已被永久删除（比 404 更明确）", cause: "下线页面被显式标记 410", check: "属预期行为时无需处理", link: null },
  "413": { name: "Content Too Large", mean: "请求体超过服务器上限", cause: "上传文件超过 client_max_body_size 或应用限制", check: "查 nginx error.log 的 client intended to send too large body", link: null },
  "429": { name: "Too Many Requests", mean: "请求过于频繁，被限流", cause: "触发 limit_req / 应用限流 / 被爬虫猛刷", check: "看 Retry-After 头与限流配置；本站 Nginx 生成器有限流参数可参考", link: null },
  "500": { name: "Internal Server Error", mean: "服务器内部错误（应用代码或运行时异常）", cause: "应用抛异常、解释器/运行时崩了、配置错误", check: "先看应用日志与 nginx error.log 的具体堆栈，不要只重启了事", link: ["../08-troubleshooting/02-network-diagnosis.md", "网络排障：分层定位"] },
  "501": { name: "Not Implemented", mean: "服务器不支持该请求方法或功能", cause: "老旧服务、代理不支持的方法", check: "确认客户端方法是否用错；查服务版本", link: null },
  "502": { name: "Bad Gateway", mean: "反向代理连不上后端，或后端返回了无效响应", cause: "后端进程没启动/已崩溃、proxy_pass 端口写错、后端只监听了别的地址", check: "ss -tlnp 看后端监听；curl 直连后端验证；nginx error.log 常见 connect() failed (111)", link: ["../04-network/02-web-proxy.md", "Web 与反向代理 · 场景二：代理访问返回 502"] },
  "503": { name: "Service Unavailable", mean: "服务暂时不可用（过载、维护或后端全挂）", cause: "后端重启中、被限流熔断、upstream 全部不可用", check: "查后端服务状态与健康检查；看是否带 Retry-After", link: ["../08-troubleshooting/02-network-diagnosis.md", "网络排障：分层定位"] },
  "504": { name: "Gateway Timeout", mean: "代理连上了后端，但后端在超时时间内没响应", cause: "后端慢查询/死锁、proxy_read_timeout 太短、后端线程池打满", check: "直连后端测耗时；查后端慢日志；再对照 proxy_read_timeout 设置", link: ["../04-network/02-web-proxy.md", "Web 与反向代理（超时参数表）"] },
  "525": { name: "SSL Handshake Error", mean: "Cloudflare 与源站之间的 TLS 握手失败（Cloudflare 专用码）", cause: "源站证书过期/未配好、源站不支持 SNI 或 TLS 版本不符", check: "用 openssl s_client 直连源站 443 验证证书", link: ["../09-web-hosting/05-https-certificates.md", "HTTPS 自动化证书"] },
  "526": { name: "Invalid SSL Certificate", mean: "Cloudflare 校验源站证书不通过（严格模式）", cause: "源站自签/过期/域名不匹配的证书在 Full (Strict) 下被拒", check: "换受信任证书，或核对 Cloudflare 加密模式与源站证书是否匹配", link: ["../09-web-hosting/05-https-certificates.md", "HTTPS 自动化证书"] }
};
function httpEsc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function httpGenerate() {
  var out = document.getElementById("http-out");
  if (!out) { return; }
  var errBox = document.getElementById("http-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var code = document.getElementById("http-code").value.trim();
  var cls = document.getElementById("http-class").value;
  if (code) {
    if (!/^\d{3}$/.test(code)) { fail("状态码必须是 3 位数字（如 502）"); return; }
    var n = parseInt(code, 10);
    if (n < 100 || n > 599) { fail("状态码范围是 100–599"); return; }
    var d = HTTP_CODE_DATA[code];
    var html;
    if (d) {
      html = "<strong>" + code + " " + httpEsc(d.name) + "</strong>\n"
        + "含义：" + httpEsc(d.mean) + "\n"
        + "常见原因：" + httpEsc(d.cause) + "\n"
        + "排查命令/方法：" + httpEsc(d.check)
        + (d.link ? "\n对应教程：<a href=\"" + d.link[0] + "\">" + httpEsc(d.link[1]) + "</a>（" + d.link[0] + "）" : "");
    } else {
      html = "<strong>" + code + "（本站未单列）</strong>\n"
        + httpEsc(HTTP_CLASS_TEXT[code.charAt(0)]) + "\n"
        + "具体含义以返回该状态码的服务文档为准；先用 curl -I 看响应头与 Location，再按类别缩小范围。";
    }
    errBox.style.display = "none";
    out.innerHTML = html;
    return;
  }
  var keys = Object.keys(HTTP_CODE_DATA).filter(function (k) { return cls === "all" || k.charAt(0) === cls; }).sort();
  var text = keys.map(function (k) { return k + " " + HTTP_CODE_DATA[k].name + " —— " + HTTP_CODE_DATA[k].mean; }).join("\n");
  errBox.style.display = "none";
  out.innerHTML = httpEsc(text);
}
function initCertGen() {
  var out = document.getElementById("cert-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["cert-pem", "cert-domain", "cert-scene"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", certGenerate);
      el.addEventListener("change", certGenerate);
    }
  });
  bindCopy("cert-copy", "cert-out", "cert-msg");
  certGenerate();
}
function initPermGen() {
  var out = document.getElementById("perm-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  PERM_BIT_IDS.forEach(function (p) {
    var el = document.getElementById(p[0]);
    if (el) {
      el.addEventListener("input", permFromBoxes);
      el.addEventListener("change", permFromBoxes);
    }
  });
  var oct = document.getElementById("perm-oct");
  if (oct) {
    oct.addEventListener("input", permFromOct);
    oct.addEventListener("change", permFromOct);
  }
  var um = document.getElementById("perm-umask");
  if (um) {
    um.addEventListener("input", permRender);
    um.addEventListener("change", permRender);
  }
  bindCopy("perm-copy", "perm-out", "perm-msg");
  permFromOct();
}
function initHashGen() {
  var out = document.getElementById("hash-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["hash-text", "hash-expect", "hash-algo"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", hashRun);
      el.addEventListener("change", hashRun);
    }
  });
  var f = document.getElementById("hash-file");
  if (f) { f.addEventListener("change", hashRun); }
  bindCopy("hash-copy", "hash-out", "hash-msg");
  hashRun();
}
function initVerGen() {
  var out = document.getElementById("ver-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["ver-a", "ver-b", "ver-mode"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", verGenerate);
      el.addEventListener("change", verGenerate);
    }
  });
  bindCopy("ver-copy", "ver-out", "ver-msg");
  verGenerate();
}
function initDresGen() {
  var out = document.getElementById("dres-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["dres-cpus", "dres-shares", "dres-mem", "dres-storage"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", dresGenerate);
      el.addEventListener("change", dresGenerate);
    }
  });
  bindCopy("dres-copy", "dres-out", "dres-msg");
  dresGenerate();
}
function initHttpGen() {
  var out = document.getElementById("http-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["http-code", "http-class"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", httpGenerate);
      el.addEventListener("change", httpGenerate);
    }
  });
  bindCopy("http-copy", "http-out", "http-msg");
  httpGenerate();
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
  document.querySelectorAll(".ufw-plan").forEach(function (el) {
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
/* 批次 B 新增工具 JS（N-10 / N-12 / N-07 / N-13 / N-24 / N-28）
   风格与 docs/tools/index.md 现有脚本一致：ES5、var/function、字符串拼接、
   输出一律 textContent、复制走页面已有的 bindCopy 助手。
   集成时把本文件内容粘贴进页尾 <script> 块即可（init 函数名见文件末尾注释）。 */

/* ================= N-10 Linux 故障诊断决策树（diag） =================
   数据驱动：一棵决策树数据 + 统一渲染。节点两种：
   - 问题节点 { label?, q, options: [{ t: 选项文案, n: 下一节点 id }] }
   - 结论节点 { leaf: true, title, causes: [], checks: [], fixes: [], danger }
   本工具只展示检查命令，绝不执行任何命令。 */
var DIAG_TREE = {
  net: {
    label: "网络不通",
    q: "在故障机器上 ping 网关 IP（如 ip route 里 default via 的地址），通不通？",
    options: [
      { t: "网关能 ping 通", n: "netQ2a" },
      { t: "网关 ping 不通", n: "netQ2b" }
    ]
  },
  netQ2a: {
    q: "再 ping 一个公网 IP（如 223.5.5.5），通不通？",
    options: [
      { t: "公网 IP 能通，但域名打不开", n: "netDns" },
      { t: "公网 IP 也不通", n: "netRoute" }
    ]
  },
  netQ2b: {
    q: "ip link 看故障网卡的状态是 UP 吗？",
    options: [
      { t: "是 UP", n: "netQ3b" },
      { t: "DOWN 或显示 NO-CARRIER", n: "netLink" }
    ]
  },
  netQ3b: {
    q: "ip addr 看本机 IP 地址还在吗？",
    options: [
      { t: "地址还在，和规划一致", n: "netConflict" },
      { t: "地址没了或是 169.254.x.x", n: "netDhcp" }
    ]
  },
  netDns: {
    leaf: true,
    title: "DNS 解析故障（网络本身是通的）",
    causes: [
      "DNS 服务器不可达或配置错误 —— 可能性最高：IP 直连通、域名不通是 DNS 问题的典型特征",
      "/etc/resolv.conf 被 DHCP / netplan 覆盖成了错误地址",
      "本机 nsswitch / systemd-resolved 缓存了坏记录"
    ],
    checks: [
      "ping -c3 223.5.5.5",
      "getent hosts example.com",
      "dig example.com @223.5.5.5",
      "cat /etc/resolv.conf",
      "resolvectl status"
    ],
    fixes: [
      "dig 直连公共 DNS 能解析、系统解析不行 → 问题在本机解析链，按 resolvectl status 显示的当前 DNS 改 netplan / 网卡配置，不要只手改 /etc/resolv.conf（会被覆盖）",
      "所有 DNS 都解析不了 → 换一台可用的 DNS 服务器地址并持久化到 netplan，netplan apply 后复测"
    ],
    danger: "不要为了「试一试」把 resolv.conf 指向来路不明的 DNS：解析被劫持会把流量导向假站点。"
  },
  netRoute: {
    leaf: true,
    title: "默认路由或出口故障",
    causes: [
      "默认路由缺失或指错网关 —— 可能性最高：网关可达但出不去，先看路由表",
      "云厂商安全组 / 机房防火墙拦了出方向流量",
      "NAT / 出口设备故障（家宽路由器、云 NAT 网关）"
    ],
    checks: [
      "ip route",
      "traceroute -n 223.5.5.5",
      "ping -c3 $(ip route | awk '/default/ {print $3; exit}')",
      "curl -v --connect-timeout 5 http://223.5.5.5"
    ],
    fixes: [
      "没有 default 路由 → 在 netplan 里补 gateway / routes，不要只用 ip route add 临时加（重启即丢）",
      "traceroute 第一跳就断 → 本机路由/网关问题；能过网关、断在后面 → 出口或运营商侧问题，带上 traceroute 输出找云厂商/机房"
    ],
    danger: "改路由前先确认你不是靠这条路由远程连进来的：删错默认路由会把自己锁在机器外，只能走控制台/带外管理救。"
  },
  netLink: {
    leaf: true,
    title: "物理链路 / 网卡未启用",
    causes: [
      "网线没插好、交换机端口关闭或网卡硬件故障（NO-CARRIER 即物理层无信号）—— 可能性最高",
      "网卡被人为 down 或驱动未加载（虚拟机里常见于网卡未连接）",
      "虚拟机 / 云主机网卡未挂载或被禁用"
    ],
    checks: [
      "ip link",
      "ethtool eth0 | grep -i 'link detected'",
      "dmesg | grep -i -E 'eth|link' | tail -20",
      "lspci | grep -i ethernet"
    ],
    fixes: [
      "NO-CARRIER → 先查物理侧：换网线、换交换机口、确认虚拟机网卡勾选了「已连接」",
      "网卡根本不在 ip link 列表里 → 查驱动与硬件识别（lspci 有设备而 ip link 没有 = 驱动问题）"
    ],
    danger: "云主机上不要随意 ip link set down 正在用的网卡：SSH 会立刻断开，只能进云控制台处理。"
  },
  netConflict: {
    leaf: true,
    title: "IP 地址冲突或网关侧拦截",
    causes: [
      "局域网内有另一台机器用了相同 IP（地址冲突）—— 可能性最高：地址在、网关却 ping 不稳/不通",
      "网关侧 ARP 绑定 / MAC 白名单把本机拦了",
      "本机防火墙 OUTPUT/INPUT 链把流量丢了"
    ],
    checks: [
      "ip addr",
      "arping -D -I eth0 本机IP",
      "ip neigh",
      "sudo iptables -L -n --line-numbers | head -40",
      "ping -c3 网关IP 后立刻看 ip neigh 里网关的 MAC 是否稳定"
    ],
    fixes: [
      "arping 检出冲突 → 给本机换一个未被占用的地址，或找到冲突机器改它的地址，并把服务器地址改成 DHCP 保留/静态规划",
      "MAC 一直在变 → 冲突或 ARP 欺骗，抓包定位源 MAC 再处理"
    ],
    danger: "定位冲突时不要直接把「另一台」断网：它可能是正在跑业务的机器，先确认再动。"
  },
  netDhcp: {
    leaf: true,
    title: "IP 地址丢失（DHCP 未续约或静态配置没生效）",
    causes: [
      "DHCP 租约到期未续上、DHCP 服务器不可达，地址回落到 169.254 链路本地地址 —— 可能性最高",
      "netplan 配置写错，apply 没成功，重启后没地址",
      "网卡名变更（eth0 变 ens33 等）导致旧配置对不上"
    ],
    checks: [
      "ip addr",
      "ip link",
      "sudo netplan --debug apply 2>&1 | tail -30",
      "journalctl -u systemd-networkd -n 50 --no-pager",
      "ls /etc/netplan/"
    ],
    fixes: [
      "服务器一律改静态地址或 DHCP 地址保留，不要长期靠自动获取",
      "netplan apply 报错 → 按报错改 YAML（缩进、网卡名），再 apply 并立刻复测 ip addr"
    ],
    danger: "远程改 netplan 前先留好云控制台/带外入口：apply 错地址同样会把自己锁在外面。"
  },
  diskf: {
    label: "磁盘空间满",
    q: "df -h 里占用最高（接近 100%）的挂载点是哪类？",
    options: [
      { t: "根分区 /", n: "dkQ2a" },
      { t: "独立的数据分区", n: "dkQ2b" },
      { t: "都没满（都在 90% 以下），但应用仍报空间不足", n: "dkQ2c" }
    ]
  },
  dkQ2a: {
    q: "用 du 从 / 往下逐层排查，占大头的是什么？",
    options: [
      { t: "日志文件（/var/log）", n: "dkLog" },
      { t: "Docker 数据（/var/lib/docker）", n: "dkDocker" },
      { t: "/tmp 或缓存目录", n: "dkTmp" },
      { t: "du 找不到大文件，但 df 还是满的", n: "dkDeleted" }
    ]
  },
  dkQ2b: {
    q: "数据分区里占大头的是什么？",
    options: [
      { t: "备份文件一层层堆积", n: "dkBackup" },
      { t: "就是业务数据（数据库、上传文件）在自然增长", n: "dkGrow" }
    ]
  },
  dkQ2c: {
    q: "df -i 看 inode 使用率（IUse%）如何？",
    options: [
      { t: "inode 100%（小文件太多）", n: "dkInode" },
      { t: "inode 也正常", n: "dkQuota" }
    ]
  },
  dkLog: {
    leaf: true,
    title: "日志失控增长",
    causes: [
      "某个应用日志没做轮转，或报错刷屏把日志撑爆 —— 可能性最高",
      "journald 没设上限，系统日志无限保留",
      "logrotate 配置失效（轮转了但没压缩/没删除旧文件）"
    ],
    checks: [
      "df -h /",
      "sudo du -xhd1 /var/log | sort -h",
      "journalctl --disk-usage",
      "sudo ls -lhS /var/log | head -20"
    ],
    fixes: [
      "先定位刷屏的源头（哪个服务在狂写错误日志），治源头再清日志",
      "给 journald 设 SystemMaxUse、给应用日志配 logrotate（daily + rotate + compress），改完用 logrotate -d 干跑验证"
    ],
    danger: "不要直接 rm 正在被进程打开的日志文件：空间不会释放（句柄还占着），还丢排障证据。用 truncate 或重启/重开日志的服务，或先 cp 留样再清空。"
  },
  dkDocker: {
    leaf: true,
    title: "Docker 数据堆积",
    causes: [
      "悬空镜像、停止的容器、构建缓存长期不清 —— 可能性最高",
      "容器日志（json-file）没设上限，单个容器日志几个 G",
      "匿名 volume 越攒越多"
    ],
    checks: [
      "docker system df",
      "docker ps -a --size",
      "sudo du -xhd1 /var/lib/docker | sort -h",
      "docker images | head -30"
    ],
    fixes: [
      "先 docker system df 看分类，再针对性清：悬空镜像和构建缓存可清，容器与 volume 逐个确认",
      "给容器加 log 轮转（/etc/docker/daemon.json 里 log-opts max-size/max-file），从源头防日志撑爆"
    ],
    danger: "docker system prune -a --volumes 会删掉未运行容器的镜像与数据卷，可能直接删掉要用的镜像和数据。生产机上禁用一把梭，先逐项列清单再删。"
  },
  dkTmp: {
    leaf: true,
    title: "/tmp 或缓存失控",
    causes: [
      "任务/脚本把临时文件写进 /tmp 后从不清理 —— 可能性最高",
      "包管理缓存（apt archive cache）长期堆积",
      "应用把 /tmp 当数据目录用（还可能被 PrivateTmp 隔离误导排查）"
    ],
    checks: [
      "sudo du -xhd1 /tmp | sort -h",
      "sudo find /tmp -type f -size +100M -ls",
      "sudo du -sh /var/cache/apt/archives"
    ],
    fixes: [
      "按文件归属找到写入方，改它的清理策略；一次性存量按修改时间分批清，别按名字乱删",
      "确认 systemd-tmpfiles 的清理规则在跑（systemd-tmpfiles --clean），必要时给大目录单独定龄规则"
    ],
    danger: "/tmp 里可能有正在运行任务的临时文件与 socket：按「超过 N 天未修改」清，不要无差别清空。"
  },
  dkDeleted: {
    leaf: true,
    title: "文件已删但空间未释放（进程还握着句柄）",
    causes: [
      "大文件被 rm，但仍有进程打开着它，空间要等进程释放句柄才回收 —— 这正是 du 与 df 对不上的原因，可能性最高",
      "（少数）文件系统错误导致计数异常"
    ],
    checks: [
      "df -h /",
      "sudo du -xsh /",
      "sudo lsof +L1 | head -20",
      "sudo ls -l /proc/*/fd 2>/dev/null | grep deleted | head"
    ],
    fixes: [
      "lsof +L1 找到握着已删文件的进程，择机重启该服务释放句柄，空间立即回收",
      "以后删大文件改用先截断（: > 文件）再删，或直接截断不删，避免句柄占用"
    ],
    danger: "不要为了释放空间直接 kill -9 业务进程：先确认进程职责与影响面，按服务重启流程来。"
  },
  dkBackup: {
    leaf: true,
    title: "备份堆积没有保留策略",
    causes: [
      "备份脚本只进不出：每天全量往同一目录堆，没有过期删除 —— 可能性最高",
      "备份失败重试产生大量半成品文件",
      "备份和业务数据同分区，备份把业务的空间先占了"
    ],
    checks: [
      "df -h",
      "sudo du -xhd1 备份目录 | sort -h",
      "sudo ls -lt 备份目录 | head -30",
      "sudo find 备份目录 -type f | wc -l"
    ],
    fixes: [
      "给备份定保留策略（如保留 7 日 + 4 周），脚本里落地自动过期删除，并先干跑列出将删清单再启用",
      "备份尽量与业务数据分分区/分盘，至少给业务盘留警戒线"
    ],
    danger: "删旧备份前先验证最近一份备份真的可恢复（做过恢复演练再删）；把唯一一份好备份删了等于没备份。"
  },
  dkGrow: {
    leaf: true,
    title: "业务数据自然增长，需要扩容规划",
    causes: [
      "数据真实增长，容量见底 —— 先确认不是异常写入再按扩容处理，可能性最高",
      "某个表/目录异常膨胀（重试队列、回收站、软删数据没清）",
      "快照、备份点占用了没算进业务数据的空间"
    ],
    checks: [
      "df -h",
      "sudo du -xhd1 数据目录 | sort -h",
      "sudo du -xhd1 数据目录 | sort -h（隔几天对比增速）",
      "用本站「磁盘空间与容量规划器」按日增量算耗尽日期"
    ],
    fixes: [
      "先分清正常增长与异常膨胀：异常的治源头，正常的按增速规划扩容（LVM 在线扩容或加盘迁移）",
      "给磁盘使用率配告警线（如 80% 预警），别再等到 100% 才发现"
    ],
    danger: "扩容/迁移涉及分区与 LVM 操作：动手前做整盘或至少数据级备份，并准备回滚步骤，命令逐条核对设备名再回车。"
  },
  dkInode: {
    leaf: true,
    title: "inode 耗尽（小文件太多）",
    causes: [
      "海量小文件：缓存碎片、会话文件、邮件队列、未清理的临时小文件 —— 可能性最高",
      "某个程序按请求生成小文件且永不回收",
      "建盘时 inode 密度默认偏低而业务偏小文件"
    ],
    checks: [
      "df -i",
      "sudo find / -xdev -type d -exec sh -c 'echo $(ls -U \"$1\" | wc -l) $1' _ {} \\; 2>/dev/null | sort -rn | head",
      "sudo du --inodes -xhd1 /var | sort -h"
    ],
    fixes: [
      "定位小文件最集中的目录与生成方，改它的清理/落盘策略（如会话改存 Redis、缓存设上限）",
      "存量小文件分批清理；根治要重建文件系统调 inode 数或换独立分区，属规划事项不要在线上仓促做"
    ],
    danger: "按目录批量删小文件时别误伤正在用的会话/队列文件：先按时间过滤（如 30 天前）并小批量验证。"
  },
  dkQuota: {
    leaf: true,
    title: "不是磁盘满：配额、只读挂载或应用自身上限",
    causes: [
      "用户/目录配额（quota）或云盘配额到顶，df 看的是整盘当然不满 —— 可能性最高",
      "文件系统因错误被内核重挂为只读（应用会报空间/写入类错误）",
      "应用自身配置了存储上限（如对象存储桶配额、数据库表空间）"
    ],
    checks: [
      "df -h; df -i",
      "mount | grep -E 'ro,|error'",
      "dmesg | grep -i -E 'remount|read-only|I/O error' | tail",
      "quota -s 2>/dev/null; repquota -a 2>/dev/null | head"
    ],
    fixes: [
      "只读重挂 → 先查 dmesg 的 I/O 错误根源（盘坏、链路问题），处理硬件/云盘问题后再重挂读写，不要反复 remount 硬撑",
      "配额到顶 → 扩配额或按配额口径清数据，并把 df 与配额两套口径分开监控"
    ],
    danger: "文件系统只读重挂往往是底层故障信号：此时强行 remount,rw 继续写可能把文件系统写坏，先备份关键数据再修。"
  },
  memcpu: {
    label: "内存或 CPU 异常",
    q: "主要异常是哪一个？",
    options: [
      { t: "内存耗尽 / 出现 OOM", n: "mcQ2a" },
      { t: "CPU 长期打满", n: "mcQ2b" },
      { t: "负载（load）很高但 CPU 并不忙", n: "mcQ2c" }
    ]
  },
  mcQ2a: {
    q: "top 里占内存最大的是什么？",
    options: [
      { t: "某个业务进程，而且越占越多", n: "mcLeak" },
      { t: "buff/cache 占大头，available 其实还很多", n: "mcCache" },
      { t: "top 里看不到大进程，但内存就是满的", n: "mcShm" }
    ]
  },
  mcQ2b: {
    q: "top 里 CPU 大户是什么状态？",
    options: [
      { t: "业务进程，用户态（us）占比高", n: "mcCpuBiz" },
      { t: "%wa（IO 等待）占比高", n: "mcIowait" },
      { t: "不认识的进程名，或藏在奇怪路径下", n: "mcMiner" }
    ]
  },
  mcQ2c: {
    q: "ps 里 D 状态（不可中断睡眠）的进程多吗？",
    options: [
      { t: "很多 D 状态进程", n: "mcDstate" },
      { t: "D 状态不多，但进程总数异常多", n: "mcFlood" }
    ]
  },
  mcLeak: {
    leaf: true,
    title: "进程内存持续增长（疑似内存泄漏或无上限缓存）",
    causes: [
      "应用内存泄漏或缓存无上限，涨到触发 OOM 被杀 —— 可能性最高",
      "堆外内存 / 内存映射文件不算在 RSS 常规口径里，被低估",
      "容器/服务没设内存上限，一个进程吃光整机连累别人"
    ],
    checks: [
      "free -h",
      "ps aux --sort=-%mem | head -10",
      "dmesg | grep -i 'out of memory' | tail -5",
      "cat /proc/进程PID/status | grep -i vmrss（隔一段时间看两次比增速）"
    ],
    fixes: [
      "短期止血：给服务设 MemoryMax / 容器内存上限并配自动重启，把影响圈在它自己身上",
      "根治：按 RSS 增速与业务量定位泄漏点（结合堆转储与运行时剖析），修应用而不是无限加内存"
    ],
    danger: "不要用 echo 3 > /proc/sys/vm/drop_caches 当常规手段：它只丢缓存、治标都算不上，还会让随后一段时间 IO 变慢。"
  },
  mcCache: {
    leaf: true,
    title: "大概率是误报：缓存占用不等于内存不足",
    causes: [
      "Linux 把空闲内存用作页缓存（buff/cache），这是正常机制：应用真需要时会自动回收 —— 可能性最高",
      "监控只看了 used 没看 available，把缓存算成了已用"
    ],
    checks: [
      "free -h（重点看 available 一列）",
      "cat /proc/meminfo | grep -E 'MemAvailable|Cached|Buffers'",
      "dmesg | grep -i 'out of memory' | tail（没有 OOM 记录更佐证没真缺内存）"
    ],
    fixes: [
      "监控口径改成 MemAvailable 与 OOM 事件，不要按 used 百分比告警",
      "available 也真的低时，回到「内存耗尽」分支按泄漏方向排查"
    ],
    danger: "为了「好看」去清缓存或关缓存监控，会把真实问题藏起来；先改口径，别动系统。"
  },
  mcShm: {
    leaf: true,
    title: "内存被共享内存 / tmpfs / 内核占用",
    causes: [
      "/dev/shm 或 tmpfs 挂载被写满计入内存占用 —— 可能性最高",
      "内核 slab（目录项/ inode 缓存等）异常膨胀",
      "大页内存、驱动预留等不进进程 RSS 的占用"
    ],
    checks: [
      "free -h（看 shared 一列）",
      "df -h /dev/shm; sudo du -sh /dev/shm",
      "grep -E 'Slab|SUnreclaim' /proc/meminfo",
      "sudo slabtop -o | head -15"
    ],
    fixes: [
      "tmpfs 被当存储用 → 找到写入方改落盘路径，并给 tmpfs 挂载设 size 上限",
      "slab 异常 → 看 slabtop 里哪类缓存爆涨，多与小文件/目录项风暴有关，治生成源头"
    ],
    danger: "/dev/shm 里的内容可能被正在运行的进程当共享内存用：清之前先确认归属，别按普通文件直接删。"
  },
  mcCpuBiz: {
    leaf: true,
    title: "业务进程 CPU 打满（热点、死循环或流量突增）",
    causes: [
      "代码热点/死循环/正则回溯等把单核吃满 —— 可能性最高",
      "流量或任务量突增，正常业务被压满",
      "GC 频繁（堆太小或对象暴涨）表现为 CPU 高"
    ],
    checks: [
      "top -H -p 进程PID（看线程级）",
      "ps -eo pid,ppid,%cpu,etime,comm --sort=-%cpu | head",
      "uptime; nproc",
      "vmstat 1 5"
    ],
    fixes: [
      "先分清突增还是持续：突增看入口流量与队列，持续看线程栈/性能剖析定位热点函数",
      "止血手段按序考虑：限流、摘流量、扩容，最后才是重启（重启前先留现场：线程栈、剖析快照）"
    ],
    danger: "直接重启会丢掉定位死循环的全部现场：先抓栈（jstack / gdb / py-spy 等按语言选），再止血。"
  },
  mcIowait: {
    leaf: true,
    title: "CPU 在等 IO（磁盘慢或 IO 打满）",
    causes: [
      "磁盘吞吐/IOPS 到顶或磁盘变慢（云盘限流、盘故障）—— 可能性最高",
      "大量随机小 IO、同步刷盘（fsync）把队列堵住",
      "内存不足引发频繁 swap 换页，伪装成 IO 问题"
    ],
    checks: [
      "top（看 %wa 与 D 状态进程）",
      "iostat -x 1 3",
      "iotop -o（需要 root）",
      "free -h; vmstat 1 5（看 si/so 是否在换页）"
    ],
    fixes: [
      "iostat 里 %util 近 100% 且 await 高 → IO 就是瓶颈：定位写入大户（iotop），再谈扩容云盘规格或拆 IO",
      "si/so 持续非零 → 先解决内存不足，swap 中的机器谈 IO 优化没意义"
    ],
    danger: "不要在 IO 打满时再跑全盘 find/du 之类扫描命令，会把队列堵得更死；用 iostat/iotop 定向看。"
  },
  mcMiner: {
    leaf: true,
    title: "疑似被入侵：异常进程占满 CPU（挖矿木马特征）",
    causes: [
      "机器被入侵并植入挖矿程序 —— 不认识的进程名 + 路径在 /tmp、隐藏目录等位置时可能性最高",
      "（较小概率）运维/监控代理改名或新上的自研程序没登记"
    ],
    checks: [
      "ps -eo pid,ppid,user,%cpu,etime,args --sort=-%cpu | head",
      "ls -l /proc/进程PID/exe /proc/进程PID/cwd",
      "ss -tnp | grep 进程PID",
      "crontab -l; ls -la /etc/cron.d/ /var/spool/cron/crontabs/ 2>/dev/null",
      "last -a | head; grep -E 'Accepted' /var/log/auth.log | tail"
    ],
    fixes: [
      "先取证再处置：记录进程路径、对外连接、计划任务与登录日志，确认入侵入口（弱口令、未修漏洞、泄露密钥）",
      "处置顺序：隔离机器（安全组收口）→ 清持久化（cron、systemd、SSH 密钥）→ 改全部口令与密钥 → 优先重装/回滚到干净快照，而不是只杀进程"
    ],
    danger: "只 kill 进程等于没处理：持久化后门会把它再拉起来。在没取证、没改口令前也不要急着重启，证据会丢。"
  },
  mcDstate: {
    leaf: true,
    title: "大量进程卡在 D 状态（底层 IO 堵死）",
    causes: [
      "磁盘/云盘故障或极慢，进程等 IO 回不来 —— 可能性最高",
      "NFS 等网络文件系统服务端无响应，客户端进程集体卡 D",
      "存储链路（多路径、iSCSI）异常"
    ],
    checks: [
      "ps -eo state,pid,comm | awk '$1 ~ /^D/' ",
      "dmesg | tail -30",
      "cat /proc/进程PID/stack（需要 root，看卡在哪个内核调用）",
      "mount | grep -i nfs; timeout 5 ls NFS挂载点"
    ],
    fixes: [
      "本地盘问题 → 查云盘状态/dmesg 的 I/O error，先处理存储层，进程会自行恢复或需重启",
      "NFS 问题 → 先恢复服务端或链路；客户端进程多数在服务端恢复后自行醒来"
    ],
    danger: "D 状态进程 kill 不掉（不可中断），别反复强杀浪费时间；更不要在存储未恢复时重启业务，会一起卡死。"
  },
  mcFlood: {
    leaf: true,
    title: "进程数暴增或僵尸进程堆积",
    causes: [
      "父进程不回收子进程，僵尸（Z 状态）越攒越多 —— 可能性最高",
      "计划任务/脚本 fork 失控，反复拉起新进程",
      "连接或请求洪峰让 worker 进程数顶格"
    ],
    checks: [
      "ps -eo state,comm | sort | uniq -c | sort -rn | head",
      "ps -eo state,pid,ppid,comm | awk '$1 ~ /^Z/' | head",
      "ps aux | wc -l; cat /proc/loadavg",
      "top -bn1 | head -15"
    ],
    fixes: [
      "僵尸的回收责任在父进程：修父进程的信号处理/等待逻辑，临时处置是重启父进程让 init 接管回收",
      "fork 失控 → 先停掉拉起它的 cron/服务，再清存量"
    ],
    danger: "杀僵尸进程本身没有用（它已经死了）：要处理的是它的父进程，别把 ps 列表里的 Z 挨个 kill 一遍。"
  },
  svc: {
    label: "服务启动失败",
    q: "systemctl status 里服务退出的方式是哪种？",
    options: [
      { t: "启动后立刻退出（exit-code / failed）", n: "svQ2a" },
      { t: "启动超时被杀（timeout）", n: "svTimeout" },
      { t: "根本没被拉起来（依赖或条件问题）", n: "svQ2c" }
    ]
  },
  svQ2a: {
    q: "journalctl 日志里最关键的一条报错是什么？",
    options: [
      { t: "端口/地址已被占用（Address already in use）", n: "svPort" },
      { t: "权限不足 / 文件打不开（Permission denied）", n: "svPerm" },
      { t: "配置文件语法错误", n: "svConf" },
      { t: "可执行文件不存在 / 动态库找不到", n: "svExec" }
    ]
  },
  svQ2c: {
    q: "失败发生在哪一环？",
    options: [
      { t: "依赖的服务没起来，它被连带放弃", n: "svDep" },
      { t: "日志显示 condition 校验不满足、被跳过", n: "svCond" }
    ]
  },
  svTimeout: {
    leaf: true,
    title: "启动超时（Type 与程序行为不匹配最常见）",
    causes: [
      "Type=forking 但程序实际没 fork，或 Type=simple 的程序启动太慢超过 TimeoutStartSec —— 可能性最高",
      "程序在启动阶段卡住（连不上数据库、等某个端口）迟迟不就绪",
      "notify 型服务没有正确发 sd_notify"
    ],
    checks: [
      "systemctl status 服务名",
      "journalctl -u 服务名 -n 80 --no-pager",
      "systemctl show 服务名 -p Type -p TimeoutStartUSec",
      "手动用同样的 ExecStart 命令在前台跑一次看多久就绪"
    ],
    fixes: [
      "先手动前台跑通并计时：程序本身慢就调大 TimeoutStartSec 或拆初始化；程序卡住就修它等的依赖",
      "Type 与程序实际行为对齐：自带 daemon 化的用 forking，前台常驻的用 simple，不要靠加超时掩盖类型写错"
    ],
    danger: "把超时一味调大可能让开机流程被一个坏服务拖住几分钟：先确认程序真的在推进，而不是死等。"
  },
  svPort: {
    leaf: true,
    title: "端口已被占用",
    causes: [
      "同一程序被手动跑了一份，或旧进程没退干净还占着端口 —— 可能性最高",
      "另一个服务/容器恰好用了同一端口",
      "unit 里启了两份相同服务（改名残留）"
    ],
    checks: [
      "sudo ss -lntp | grep 端口",
      "systemctl status 服务名",
      "journalctl -u 服务名 -n 50 --no-pager",
      "sudo lsof -i :端口"
    ],
    fixes: [
      "ss 输出直接给出占用进程：是手动跑的残留就正常停掉它，是别的服务就给一方换端口并同步改配置与防火墙",
      "处理完确认端口空闲再 systemctl restart，不要连环重启碰运气"
    ],
    danger: "别不看归属就 kill 占用端口的进程：它可能正是线上在跑的那份，杀掉等于人为停机。"
  },
  svPerm: {
    leaf: true,
    title: "权限不足（用户、目录权限或加固选项）",
    causes: [
      "User= 指定的运行用户对工作目录/数据目录/日志路径没权限 —— 可能性最高",
      "勾了 ProtectSystem=strict、PrivateTmp 等加固项后，程序要写的地方变只读或不可见",
      "文件属主是 root 而服务以普通用户运行（部署时用 root 拷文件常见）"
    ],
    checks: [
      "journalctl -u 服务名 -n 50 --no-pager",
      "systemctl show 服务名 -p User -p WorkingDirectory -p ProtectSystem",
      "namei -l 出问题的文件完整路径",
      "sudo -u 运行用户 test -r 文件路径 && echo ok"
    ],
    fixes: [
      "按 namei -l 的逐级输出修属主/权限（chown 给运行用户、目录补 x 位）",
      "加固项导致的 → 给数据目录补 ReadWritePaths，或逐项回退加固开关二分定位是哪一项"
    ],
    danger: "不要用 chmod 777 图省事：把数据目录开成全员可写等于放弃权限隔离。用 chown 到运行用户 + 最小权限位解决。"
  },
  svConf: {
    leaf: true,
    title: "配置文件语法错误",
    causes: [
      "最近一次改配置引入语法错误（多/少符号、缩进、编码）—— 可能性最高",
      "配置模板变量没渲染，留下了占位符原文",
      "改的是 A 文件、服务读的却是 B 文件（路径写错）"
    ],
    checks: [
      "journalctl -u 服务名 -n 50 --no-pager（报错通常带行号）",
      "用程序自带的校验命令验配置（如 nginx -t、sshd -t、named-checkconf，按程序选）",
      "systemctl cat 服务名（确认 ExecStart 与配置文件路径）",
      "diff 一下备份配置与现配置"
    ],
    fixes: [
      "按校验命令给出的行号修配置，修完先跑校验通过再 restart",
      "养成改配置三步：先备份、过校验、再重启；校验不过绝不 restart（会把正在跑的好进程也停掉）"
    ],
    danger: "配置错的时候 restart 是最危险的操作：旧进程停了、新进程起不来，故障从「改坏待生效」升级成「服务全停」。先校验再重启。"
  },
  svExec: {
    leaf: true,
    title: "可执行文件或动态库缺失",
    causes: [
      "ExecStart 路径写错或程序根本没装到这台机器 —— 可能性最高",
      "程序是脚本但解释器路径不对（#!/usr/bin/env 与实际路径）",
      "二进制依赖的 .so 动态库缺失（换机器部署常见）"
    ],
    checks: [
      "systemctl cat 服务名",
      "ls -l ExecStart里的路径",
      "file 程序路径; head -1 脚本路径",
      "ldd 程序路径 | grep 'not found'"
    ],
    fixes: [
      "路径问题改 unit 后 daemon-reload 再启动；缺库按 ldd 的 not found 清单补对应的包",
      "脚本类确认解释器存在且脚本有可执行位（chmod +x）"
    ],
    danger: "不要从不明来源下载 .so 文件往系统库目录里塞：只用发行版包管理器装缺失的库，避免把系统库搞坏。"
  },
  svDep: {
    leaf: true,
    title: "依赖服务未就绪导致连带失败",
    causes: [
      "Requires 的强依赖服务自己挂了，本服务被连带停/不启动 —— 可能性最高",
      "只写了 After 没写 Requires/Wants：After 只管顺序不管拉起，依赖根本没被启动",
      "依赖只是「进程起来了」但还没真正就绪（数据库在恢复中），本服务抢先连失败"
    ],
    checks: [
      "systemctl status 服务名 依赖服务名",
      "journalctl -u 依赖服务名 -n 50 --no-pager",
      "systemctl list-dependencies 服务名",
      "systemctl cat 服务名 | grep -E 'After|Requires|Wants'"
    ],
    fixes: [
      "先把依赖服务本身修好启动，再启本服务；顺序反了怎么重启都没用",
      "需要一同拉起就补 Wants（弱）或 Requires（强）；就绪竞速则在应用侧加连接重试，而不是死等固定秒数"
    ],
    danger: "为了绕过依赖失败去删 Requires，等下次依赖真出事时本服务会在坏状态下硬跑，故障更难查。修依赖，不要拆保险。"
  },
  svCond: {
    leaf: true,
    title: "启动条件（Condition）不满足被跳过",
    causes: [
      "unit 里的 ConditionPathExists 等条件当前不成立，systemd 直接跳过（状态常显示 inactive 且带 condition 字样）—— 可能性最高",
      "Condition 不是报错而是设计如此：条件文件/主机名/虚拟化类型对不上都被跳过，容易被误报成「启动失败」"
    ],
    checks: [
      "systemctl status 服务名",
      "systemctl cat 服务名 | grep -i condition",
      "journalctl -u 服务名 -n 30 --no-pager",
      "systemd-analyze condition '条件表达式'（在目标机器上验证）"
    ],
    fixes: [
      "逐条核对条件与机器现状：该有的文件为什么不在，是部署漏了还是条件本就写错",
      "确认属误设就改/删条件行，daemon-reload 后再启动"
    ],
    danger: "别为了让服务「能起来」把全部 Condition 注释掉：有些条件是防误启的保险（如只在某主机运行），删前先搞清当初为什么加。"
  },
  perm: {
    label: "权限与访问问题",
    q: "具体表现是哪一种？",
    options: [
      { t: "SSH 登录被拒", n: "pmQ2a" },
      { t: "命令或程序报 Permission denied", n: "pmQ2b" },
      { t: "网站返回 403", n: "pmQ2c" }
    ]
  },
  pmQ2a: {
    q: "用的是哪种登录方式？",
    options: [
      { t: "密钥登录，被拒（publickey）", n: "pmKey" },
      { t: "密码登录，密码正确也进不去或连上就断", n: "pmSshd" }
    ]
  },
  pmQ2b: {
    q: "出问题的是哪类操作？",
    options: [
      { t: "执行脚本/程序时被拒", n: "pmExecbit" },
      { t: "往目录里写文件被拒", n: "pmQ3b" }
    ]
  },
  pmQ3b: {
    q: "ls -ld 看目标目录的属主和权限位是什么情况？",
    options: [
      { t: "属主不是当前用户、权限位也不给 others 写", n: "pmOwner" },
      { t: "权限位看着够，却还是被拒", n: "pmAcl" }
    ]
  },
  pmQ2c: {
    q: "403 出现在哪一层？",
    options: [
      { t: "直接访问静态文件就 403", n: "pmWebperm" },
      { t: "经过反向代理后才 403，直连后端正常", n: "pmProxy403" }
    ]
  },
  pmKey: {
    leaf: true,
    title: "SSH 密钥登录被拒",
    causes: [
      "服务器上 ~/.ssh 或 authorized_keys 权限过宽，sshd 的 StrictModes 直接拒绝用它 —— 可能性最高",
      "公钥没放对用户/对文件（放到了 root 的目录却用普通用户登）",
      "客户端用的私钥与 authorized_keys 里的公钥不是一对"
    ],
    checks: [
      "ssh -v 用户@主机 2>&1 | tail -30（看客户端提出哪把钥匙、服务器怎么拒）",
      "ls -ld ~/.ssh; ls -l ~/.ssh/authorized_keys（服务器侧，属主必须是登录用户、权限 700/600）",
      "tail -50 /var/log/auth.log（服务器侧看拒绝原因）",
      "ssh-keygen -lf ~/.ssh/authorized_keys（比对指纹）"
    ],
    fixes: [
      "权限修到位：~/.ssh 700、authorized_keys 600、家目录不要 group 可写，属主必须是登录用户本人",
      "指纹对不上就重新下发正确公钥，追加而不是覆盖 authorized_keys 里已有的钥匙"
    ],
    danger: "排障时不要把 StrictModes 关掉或把家目录改 777 图省事：等于把密钥校验的安全底线拆掉。用正确权限解决。"
  },
  pmSshd: {
    leaf: true,
    title: "SSHD 配置或账户状态问题",
    causes: [
      "sshd_config 禁了密码登录（PasswordAuthentication no）或限制了 AllowUsers —— 可能性最高",
      "账户被锁定/过期，或登录 shell 不存在导致连上就断",
      "fail2ban 把你的来源 IP 拉黑了（密码错太多次常见）"
    ],
    checks: [
      "sudo sshd -t; sudo sshd -T | grep -i -E 'passwordauthentication|allowusers|permitrootlogin'",
      "sudo grep -E 'Failed|refused|ban' /var/log/auth.log | tail -20",
      "sudo fail2ban-client status sshd 2>/dev/null",
      "getent passwd 用户名; sudo chage -l 用户名"
    ],
    fixes: [
      "按 sshd -T 的实际生效值改配置（注意 .d 目录里的片段会覆盖主文件），改完先 sshd -t 校验再 reload",
      "被 fail2ban 拉黑 → 解封自己的 IP 并改用密钥登录，别关掉 fail2ban"
    ],
    danger: "改 sshd 时务必留一个已登录的会话别关：新开窗口验证能登入再关旧的，否则配置写错就把自己锁在门外。"
  },
  pmExecbit: {
    leaf: true,
    title: "文件缺可执行位或挂载 noexec",
    causes: [
      "脚本/程序没有 x 执行位（拷贝、解压、git 拉取后常见）—— 可能性最高",
      "所在分区以 noexec 挂载（/tmp 常见），有执行位也跑不了",
      "解释器脚本的首行 shebang 指向不存在的解释器（报错形式相近，先分辨）"
    ],
    checks: [
      "ls -l 目标文件",
      "mount | grep -E 'noexec'",
      "head -1 脚本文件",
      "bash 脚本路径（能跑通说明就是执行位/挂载问题）"
    ],
    fixes: [
      "缺执行位 → chmod +x；noexec 分区 → 把程序移到允许执行的目录，不要为了跑个脚本把整分区改 exec",
      "shebang 错 → 改成机器上真实存在的解释器路径"
    ],
    danger: "来路不明的脚本先 cat 看内容再 +x 执行：Permission denied 有时正是最后一道提醒，别闭眼绕过。"
  },
  pmOwner: {
    leaf: true,
    title: "目录属主/权限位不对",
    causes: [
      "目录属主是 root（部署、解压、sudo 操作时留下的），业务用户写不进去 —— 可能性最高",
      "路径中间某一级目录缺 x（穿越）权限：只看最后一级会误判",
      "程序换了运行用户，老数据目录还归旧用户"
    ],
    checks: [
      "namei -l 目标目录完整路径（逐级看属主与权限）",
      "id 当前用户",
      "ls -ld 目录 目录的每一级父目录",
      "sudo -u 运行用户 touch 目录/测试文件 && echo ok"
    ],
    fixes: [
      "按 namei 的逐级结果修：该 chown 的 chown 给运行用户、该补 x 的补 x，改完用运行用户身份复测写入",
      "部署流程里加一步统一属主，避免下次发布又覆盖回 root"
    ],
    danger: "不要对业务目录递归 chmod 777/chown -R 到个人账号：先确认范围，递归改错目录（比如整个 /var）会把一堆服务的权限一起搞坏。"
  },
  pmAcl: {
    leaf: true,
    title: "权限位之外还有 ACL / 安全模块 / 只读挂载在拦",
    causes: [
      "目录上有 ACL（ls 显示权限位末尾带 +），默认条目与权限位口径不一致 —— 可能性最高",
      "SELinux / AppArmor 拒绝（权限位全对也拒，日志里有 AVC/denied）",
      "文件带 immutable 属性或分区只读挂载"
    ],
    checks: [
      "ls -l 目录; getfacl 目录",
      "lsattr -d 目录",
      "mount | grep 目录所在分区",
      "sudo ausearch -m AVC -ts recent 2>/dev/null | tail; sudo dmesg | grep -i denied | tail"
    ],
    fixes: [
      "ACL 问题用 setfacl 补对应用户/默认条目，不要只盯 chmod（chmod 改的是 mask 会连带影响 ACL 生效值）",
      "SELinux/AppArmor → 按审计日志确认是策略拦截后，用发行版正规方式加放行规则，不要图省事全局关闭安全模块"
    ],
    danger: "setenforce 0 / 关 AppArmor 只能用于临时定位，定位完必须恢复并补规则；长期关着等于裸奔。"
  },
  pmWebperm: {
    leaf: true,
    title: "Web 服务器读不到文件（属主/穿越权限）",
    causes: [
      "站点目录或文件属主不对，www-data 等运行用户读不到 —— 可能性最高",
      "路径中间某一级目录对运行用户缺 x 位（文件本身权限再对也没用）",
      "Nginx/Apache 配置里 root 指错目录，读的根本不是你以为的那份文件"
    ],
    checks: [
      "namei -l 站点文件完整路径",
      "sudo -u www-data test -r 文件 && echo ok",
      "tail -30 /var/log/nginx/error.log（403 时会写 Permission denied 与真实路径）",
      "nginx -T | grep -E 'root|server_name'"
    ],
    fixes: [
      "按 error.log 给出的真实路径逐级修权限：目录给运行用户 x、文件给 r，静态站点可统一属主为 www-data 或部署用户 + 组读",
      "root 指错就改配置并 nginx -t 校验后 reload"
    ],
    danger: "不要把整个站点目录 chmod -R 777：上传目录一旦可写又可被 Web 读执行，容易被利用。按最小权限逐级修。"
  },
  pmProxy403: {
    leaf: true,
    title: "代理层 403（后端权限没问题）",
    causes: [
      "代理或 CDN/WAF 的规则拦截（IP 白名单、地区、UA、速率）—— 可能性最高",
      "代理回源用的 Host 头与后端虚拟主机对不上，后端按默认站点拒绝",
      "后端只允许代理的回源 IP，来源变了（换 CDN、加节点）没同步白名单"
    ],
    checks: [
      "curl -I https://域名（经代理）与 curl --resolve 直连后端各测一次对比",
      "tail -30 后端 access.log（看 403 请求的来源 IP 与 Host）",
      "tail -30 /var/log/nginx/error.log",
      "检查 CDN/WAF 控制台的拦截日志与白名单"
    ],
    fixes: [
      "先按「请求到底到没到后端」定界：后端日志里根本没有这条 → 在代理/CDN 层处理；到了后端才 403 → 查 Host 与回源白名单",
      "回源白名单按 CDN 公布的回源段维护，不要放行 0.0.0.0/0 图省事"
    ],
    danger: "为了快速恢复去关 WAF/放行全部来源，等于把防护整体拆掉：只放行确有需要的回源段与路径，处理完复核规则。"
  }
};
var diagPath = [];
function diagNodeLabel(id) {
  var node = DIAG_TREE[id];
  if (!node) { return id; }
  return node.label || node.title || id;
}
function diagRender() {
  var steps = document.getElementById("diag-steps");
  if (!steps) { return; }
  while (steps.firstChild) { steps.removeChild(steps.firstChild); }
  var depth;
  for (depth = 0; depth < diagPath.length; depth++) {
    var node = DIAG_TREE[diagPath[depth]];
    if (!node || node.leaf) { break; }
    var p = document.createElement("p");
    var lab = document.createElement("label");
    lab.appendChild(document.createTextNode("第 " + (depth + 2) + " 步：" + node.q + " "));
    var sel = document.createElement("select");
    sel.setAttribute("data-depth", String(depth));
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.appendChild(document.createTextNode("—— 请选择 ——"));
    sel.appendChild(opt0);
    node.options.forEach(function (op) {
      var o = document.createElement("option");
      o.value = op.n;
      o.appendChild(document.createTextNode(op.t));
      sel.appendChild(o);
    });
    sel.value = diagPath[depth + 1] || "";
    sel.addEventListener("change", function () {
      var d = parseInt(this.getAttribute("data-depth"), 10);
      diagPath = diagPath.slice(0, d + 1);
      if (this.value) { diagPath.push(this.value); }
      diagRender();
      diagGenerate();
    });
    lab.appendChild(sel);
    p.appendChild(lab);
    steps.appendChild(p);
  }
}
function diagGenerate() {
  var out = document.getElementById("diag-out");
  if (!out) { return; }
  var errBox = document.getElementById("diag-err");
  errBox.style.display = "none";
  if (!diagPath.length) {
    out.textContent = "# 在上方选择症状大类开始诊断。本工具只展示检查命令与处理思路，不会执行任何命令。\n# 流程：逐级回答问题 → 得到最可能原因排序、可复制的检查命令、修复方向与危险操作警告。";
    return;
  }
  var lines = [];
  var summary = [];
  var i, node, chosen;
  for (i = 0; i < diagPath.length; i++) {
    node = DIAG_TREE[diagPath[i]];
    if (i === 0) { summary.push(node.label || node.title || diagPath[i]); continue; }
    var prev = DIAG_TREE[diagPath[i - 1]];
    var txt = diagPath[i];
    if (prev && prev.options) {
      for (var j = 0; j < prev.options.length; j++) {
        if (prev.options[j].n === diagPath[i]) { txt = prev.options[j].t; break; }
      }
    }
    summary.push(txt);
  }
  lines.push("已走路径：" + summary.join(" › "));
  lines.push("");
  chosen = DIAG_TREE[diagPath[diagPath.length - 1]];
  if (chosen && chosen.leaf) {
    lines.push("结论：" + chosen.title);
    lines.push("");
    lines.push("最可能原因（按可能性排序）：");
    chosen.causes.forEach(function (c, idx) { lines.push("  " + (idx + 1) + ". " + c); });
    lines.push("");
    lines.push("检查命令（逐条复制到目标机器执行，先只读检查、后动手修复）：");
    chosen.checks.forEach(function (c) { lines.push("  $ " + c); });
    lines.push("");
    lines.push("修复方向：");
    chosen.fixes.forEach(function (f) { lines.push("  - " + f); });
    lines.push("");
    lines.push("⚠ 危险操作警告：" + chosen.danger);
    lines.push("⚠ 通用红线：生产机上涉及 rm、kill -9、重启关键服务、改网络/权限配置的动作，先确认备份、回滚通道与带外入口再动手。");
  } else {
    lines.push("当前问题：" + (chosen ? chosen.q : ""));
    lines.push("请在上方「第 " + (diagPath.length + 1) + " 步」的下拉框里选择最接近你实际情况的一项，结论会随选择逐级收窄。");
    lines.push("提示：每个问题下面给的命令（如 df -h、ip link）就是判断这一项该怎么选的方法，先在机器上看一眼再选。");
  }
  out.textContent = lines.join("\n");
}
function initDiag() {
  var out = document.getElementById("diag-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var cat = document.getElementById("diag-cat");
  if (cat) {
    cat.addEventListener("change", function () {
      diagPath = this.value ? [this.value] : [];
      diagRender();
      diagGenerate();
    });
  }
  bindCopy("diag-copy", "diag-out", "diag-msg");
  var clearBtn = document.getElementById("diag-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (cat) { cat.value = ""; }
      diagPath = [];
      diagRender();
      diagGenerate();
      document.getElementById("diag-msg").textContent = "已清空";
    });
  }
  diagRender();
  diagGenerate();
}

/* ================= N-12 Docker Compose 安全审查器（csrev） =================
   基于缩进与行模式的务实扫描，不引入 YAML 解析库。
   边界：锚点(&)、合并键(<<:)、多文档(---)、长语法端口条目分组等复杂
   YAML 可能误判，输出里会明说。本工具不回显 environment 的值。 */
var CSREV_DB_PORTS = { "3306": 1, "5432": 1, "6379": 1, "27017": 1, "9200": 1, "9300": 1, "11211": 1, "1433": 1, "1521": 1, "5984": 1, "8086": 1 };
function csrevFind(findings, lv, line, svc, msg, basis, fix) {
  findings.push({ lv: lv, line: line, svc: svc || "", msg: msg, basis: basis, fix: fix });
}
function csrevStripVal(v) {
  var s = String(v == null ? "" : v).trim();
  var hash = s.indexOf(" #");
  if (hash >= 0 && s.charAt(0) !== '"' && s.charAt(0) !== "'") { s = s.slice(0, hash).trim(); }
  if (s.length >= 2 && ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))) {
    s = s.slice(1, -1);
  }
  return s;
}
function csrevCheckImage(findings, lineNo, svc, rawVal) {
  var v = csrevStripVal(rawVal);
  if (!v) { return; }
  if (v.indexOf("@sha256:") >= 0) { return; }
  var lastSeg = v.split("/").pop();
  var colon = lastSeg.lastIndexOf(":");
  if (colon < 0) {
    csrevFind(findings, 1, lineNo, svc, "镜像 " + v + " 未写 tag", "无 tag 时 Compose 默认拉取 latest，版本不可控、不可复现，出问题难回滚到确切版本。", "把镜像固定到确切版本 tag（如 nginx:1.27.3），更稳妥的是固定到 digest（image: 名称:tag@sha256:…）。");
  } else if (lastSeg.slice(colon + 1) === "latest") {
    csrevFind(findings, 1, lineNo, svc, "镜像 " + v + " 使用 :latest", "latest 指向会随时间漂移：同一份 compose 在不同时间拉到的镜像可能不同，升级不可控。", "改成确切版本 tag 并纳入变更流程；要升级时显式改 tag 再 pull。");
  }
}
function csrevCheckVolume(findings, lineNo, svc, item) {
  var v = csrevStripVal(item);
  if (!v) { return; }
  var src = v;
  var colon = v.indexOf(":");
  if (colon >= 0) { src = v.slice(0, colon); }
  if (src.charAt(0) !== "/" && src.charAt(0) !== "~") { return; }
  if (src === "/") {
    csrevFind(findings, 0, lineNo, svc, "把宿主机根目录 / 挂进容器", "容器内进程可读写整个宿主机文件系统，容器逃逸与否都已无区别，等同交出整台机器。", "只挂载确有需要的具体子目录，并优先加 :ro 只读；宿主机根目录绝不整盘挂载。");
  } else if (src === "/var/run/docker.sock" || /docker\.sock$/.test(src)) {
    csrevFind(findings, 0, lineNo, svc, "挂载 Docker 套接字 " + src, "能访问 docker.sock 就能向 Docker 守护进程下命令、再起一个特权容器，属于事实上的宿主机 root。", "除非该容器就是专门的 Docker 管理组件且你清楚后果，否则去掉这行挂载；需要编排能力时改走受控的 API 代理并限制来源。");
  } else if (src === "/etc" || src.indexOf("/etc/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载敏感目录 " + src, "/etc 含账户、服务配置与密钥材料，容器内可读会扩大泄露面，可写更可直接改宿主机配置。", "缩小到单个必要文件并加 :ro；密钥改用 secrets 或只读单文件挂载，不要整目录挂入。");
  } else if (src === "/root" || src.indexOf("/root/") === 0 || src === "/proc" || src.indexOf("/proc/") === 0 || src === "/sys" || src.indexOf("/sys/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载敏感目录 " + src, "该目录含高权限凭据或内核接口，挂入容器会显著扩大攻击面。", "取消挂载或缩小到具体文件并只读；确需内核信息时优先用受限的替代接口。");
  } else if (src === "/var/run" || src.indexOf("/var/run/") === 0) {
    csrevFind(findings, 1, lineNo, svc, "挂载运行时目录 " + src, "/var/run（/run）下有各服务的套接字与 pid 文件，整目录挂入会让容器碰到宿主机其他服务。", "只挂载确需的那一个套接字文件，并评估对方服务的权限模型。");
  }
}
function csrevCheckPort(findings, lineNo, svc, item) {
  var v = csrevStripVal(item);
  if (!v) { return; }
  v = v.replace(/\/(tcp|udp|sctp)$/i, "");
  var parts = v.split(":");
  if (parts.length < 2) { return; }
  var hostPort, bindIp = null;
  if (parts.length === 2) { hostPort = parts[0]; }
  else { bindIp = parts[0]; hostPort = parts[1]; }
  hostPort = hostPort.split("-")[0];
  if (!/^\d+$/.test(hostPort)) { return; }
  if (bindIp === "127.0.0.1" || bindIp === "::1") { return; }
  if (CSREV_DB_PORTS[hostPort]) {
    csrevFind(findings, 0, lineNo, svc, "数据库端口 " + hostPort + " 对所有网卡发布" + (bindIp ? "（" + bindIp + "）" : "（未写绑定 IP，默认 0.0.0.0）"), "数据库端口直接暴露在所有接口上，一旦弱口令或漏洞被利用就是数据泄露/被删库勒索的经典路径；且 Docker 发布端口默认绕过 UFW 等主机防火墙规则。", "改绑本机回环：如 \"127.0.0.1:" + hostPort + ":" + hostPort + "\"，应用与数据库在同一 compose 网络里用服务名互访即可；确需远程管理走 SSH 隧道或 VPN。");
  } else if (bindIp === "0.0.0.0" || bindIp === "[::]") {
    csrevFind(findings, 1, lineNo, svc, "端口 " + hostPort + " 显式绑定 0.0.0.0 对外发布", "显式全接口发布意味着任何能到达这台主机网络的人都能连这个端口；且 Docker 发布端口默认绕过 UFW 类主机防火墙。", "确认该端口确实要对外提供服务；只是本机/内网用就改绑 127.0.0.1 或内网 IP。");
  }
}
function csrevCheckEnv(findings, lineNo, svc, key, rawVal) {
  var v = csrevStripVal(rawVal);
  if (!v) { return; }
  if (v.charAt(0) === "$") { return; }
  if (/_FILE$/i.test(key)) { return; }
  if (/PASSWORD|PASSWD|SECRET|TOKEN/i.test(key)) {
    csrevFind(findings, 0, lineNo, svc, "environment 里明文写了 " + key + "（值不回显）", "密钥明文写进 compose 文件，会随文件进 Git、进备份、进截图，泄露面不可控；文件一旦提交过仓库，改掉也等于已泄露。", "改用 ${变量} 引用放进未入库的 .env（并加入 .gitignore），或用 Docker secrets；已经提交过仓库的密钥要按已泄露处理、立即更换。");
  } else if (/KEY/i.test(key)) {
    csrevFind(findings, 1, lineNo, svc, "environment 里明文写了 " + key + "（值不回显）", "键名带 KEY 的值多为 API 密钥类凭据，明文进 compose 文件同样会随文件扩散。", "改用 ${变量} 引用或 secrets 注入；确认这不是密钥时可忽略本条。");
  }
}
function csrevCheckCap(findings, lineNo, svc, item) {
  var v = csrevStripVal(item).toUpperCase();
  if (v === "ALL" || v === "SYS_ADMIN" || v === "SYS_MODULE") {
    csrevFind(findings, 0, lineNo, svc, "cap_add 包含高危项 " + v, v === "ALL" ? "ALL 等于放弃 capability 收口，容器接近特权状态。" : v + " 赋予接近宿主机管理级的内核能力，是容器逃逸的常见跳板。", "去掉该 capability；确实需要时逐项论证最小集合，并配合只读根文件系统与 user 限制。");
  } else if (v === "NET_ADMIN" || v === "SYS_PTRACE" || v === "DAC_OVERRIDE" || v === "SYS_TIME") {
    csrevFind(findings, 1, lineNo, svc, "cap_add 包含敏感项 " + v, "这类 capability 能改网络配置、窥探其他进程或绕过文件权限检查，不是普通应用需要的。", "确认业务真的需要它（如抓包、改路由的网络工具）再保留，并尽量缩小到单个容器；普通应用直接删除。");
  }
}
function csrevGenerate() {
  var out = document.getElementById("csrev-out");
  if (!out) { return; }
  var errBox = document.getElementById("csrev-err");
  errBox.style.display = "none";
  var raw = document.getElementById("csrev-input").value;
  if (!raw.replace(/\s+/g, "")) {
    out.textContent = "# 把 docker-compose.yml 的内容粘贴到上方，点「开始审查」。\n# 本工具在浏览器本地按行扫描，不上传、不保存；查不出的问题不等于不存在，上线前仍建议人工通读一遍。";
    return;
  }
  var truncated = false;
  var text = raw;
  if (text.length > 100000) { text = text.slice(0, 100000); truncated = true; }
  var lines = text.split("\n");
  var findings = [];
  var services = {};
  var svcOrder = [];
  var inServices = false, sawServices = false, svcIndent = -1, curSvc = null;
  var stack = [];
  var sawAnchor = /<<:/.test(text) || /(^|\s)&[A-Za-z_][\w-]*/.test(text) || /^\s*---/m.test(text);
  var sawTab = false;
  function stackHas(key) {
    for (var si = 0; si < stack.length; si++) { if (stack[si].key === key) { return true; } }
    return false;
  }
  function topKey() { return stack.length ? stack[stack.length - 1].key : ""; }
  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1;
    var rawLine = lines[i];
    if (rawLine.indexOf("\t") >= 0) { sawTab = true; }
    var trimmedAll = rawLine.replace(/^\s+/, "");
    if (!trimmedAll || trimmedAll.charAt(0) === "#") { continue; }
    var indent = rawLine.length - trimmedAll.length;
    var isItem = trimmedAll === "-" || trimmedAll.indexOf("- ") === 0;
    if (isItem) {
      while (stack.length && stack[stack.length - 1].indent > indent) { stack.pop(); }
      var itemText = trimmedAll === "-" ? "" : trimmedAll.slice(2);
      var parent = topKey();
      if (curSvc) {
        if (parent === "volumes") { csrevCheckVolume(findings, lineNo, curSvc, itemText); }
        else if (parent === "ports") { csrevCheckPort(findings, lineNo, curSvc, itemText); }
        else if (parent === "cap_add") { csrevCheckCap(findings, lineNo, curSvc, itemText); }
        else if (parent === "environment") {
          var em = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(csrevStripVal(itemText));
          if (em) { csrevCheckEnv(findings, lineNo, curSvc, em[1], em[2]); }
        }
      }
      continue;
    }
    var km = /^([^:\s][^:]*):\s*(.*)$/.exec(trimmedAll);
    if (!km) { continue; }
    var key = csrevStripVal(km[1]);
    var val = km[2];
    while (stack.length && stack[stack.length - 1].indent >= indent) { stack.pop(); }
    if (indent === 0) {
      inServices = key === "services";
      if (inServices) { sawServices = true; }
      curSvc = null; svcIndent = -1;
      stack.push({ indent: indent, key: key });
      continue;
    }
    if (inServices) {
      if (svcIndent < 0 || indent === svcIndent) {
        svcIndent = indent;
        curSvc = key;
        if (!services[curSvc]) {
          services[curSvc] = { line: lineNo, hasUser: false, hasMem: false, hasCpu: false, hasImage: false, hasBuild: false };
          svcOrder.push(curSvc);
        }
        stack.push({ indent: indent, key: key });
        continue;
      }
      if (indent < svcIndent) { curSvc = null; stack.push({ indent: indent, key: key }); continue; }
    }
    stack.push({ indent: indent, key: key });
    if (!curSvc) { continue; }
    var rec = services[curSvc];
    var valClean = csrevStripVal(val);
    if (key === "privileged" && /^true$/i.test(valClean)) {
      csrevFind(findings, 0, lineNo, curSvc, "privileged: true（特权模式）", "特权模式让容器拿到几乎全部宿主机能力与设备访问权，隔离基本失效，是 compose 里风险最高的一项。", "去掉 privileged: true；确实需要某项能力时改用 cap_add 逐项添加、devices 只给具体设备。");
    } else if (key === "network_mode" && (valClean === "host" || valClean === "\"host\"")) {
      csrevFind(findings, 0, lineNo, curSvc, "network_mode: host（与宿主机共用网络）", "容器直接使用宿主机网络栈：端口发布设置全部失效、无法用主机防火墙按容器隔离，容器里监听即等于在宿主机上监听。", "改回默认 bridge 网络并用 ports 显式发布需要的端口；确需 host 网络的组件（如某些监控探针）单独部署并收紧权限。");
    } else if (key === "image") {
      rec.hasImage = true;
      csrevCheckImage(findings, lineNo, curSvc, val);
    } else if (key === "build") {
      rec.hasBuild = true;
    } else if (key === "user") {
      rec.hasUser = true;
      if (valClean === "root" || valClean === "0" || valClean === "0:0" || valClean === "root:root") {
        csrevFind(findings, 1, lineNo, curSvc, "user 显式设为 root", "显式以 root 运行等于放弃容器内的第一道权限隔离；进程被攻破即拿到容器内最高权限。", "在镜像里建普通用户并把 user 改成它（或至少确认应用本身会降权），同时保证它对数据卷有必要权限。");
      }
    } else if (key === "mem_limit") {
      rec.hasMem = true;
    } else if (key === "cpus" || key === "nano_cpus") {
      rec.hasCpu = true;
    } else if (key === "memory" && stackHas("limits")) {
      rec.hasMem = true;
    } else if (key === "source" && stackHas("volumes")) {
      csrevCheckVolume(findings, lineNo, curSvc, val);
    } else if (key === "host_ip" && (valClean === "0.0.0.0" || valClean === "::" || valClean === "[::]")) {
      csrevFind(findings, 1, lineNo, curSvc, "长语法端口条目 host_ip 为 " + valClean, "该端口条目会绑定到所有网卡对外发布。", "把 host_ip 改成 127.0.0.1 或内网 IP；数据库类端口尤其不要全接口发布。");
    } else if (stackHas("environment")) {
      csrevCheckEnv(findings, lineNo, curSvc, key, val);
    }
  }
  svcOrder.forEach(function (name) {
    var r = services[name];
    if (!r.hasUser) {
      csrevFind(findings, 2, r.line, name, "未指定 user，默认以 root 运行", "没有 user: 时容器进程就是 root；配合任何挂载或 capability 问题，影响都会被放大。", "在镜像里建普通用户并在此写 user: 用户名/UID，确认数据卷权限匹配。");
    }
    if (!r.hasMem && !r.hasCpu) {
      csrevFind(findings, 1, r.line, name, "未设置任何资源限制（mem_limit / cpus 或 deploy.resources.limits）", "无限制的容器可以吃光宿主机内存与 CPU：一个服务内存泄漏就能拖死整机其他服务。", "按服务实际用量给 mem_limit 与 cpus（或 deploy 资源限制），先给宽松值再按监控收紧。");
    } else if (!r.hasMem || !r.hasCpu) {
      csrevFind(findings, 2, r.line, name, "只设置了一项资源限制（" + (r.hasMem ? "有内存无 CPU" : "有 CPU 无内存") + "）", "内存与 CPU 是两类不同的耗尽方式，只限一项仍可能被另一项拖垮整机。", "把另一项也补上。");
    }
    if (!r.hasImage && !r.hasBuild) {
      csrevFind(findings, 2, r.line, name, "既无 image 也无 build，无法判断镜像来源", "本工具按 image 字段核对标签固定情况；两项都没有时无法审查这一项。", "人工确认该服务的镜像来源与版本固定方式。");
    }
  });
  if (!sawServices) {
    csrevFind(findings, 1, 1, "", "未找到顶层 services:", "可能不是 docker-compose 文件、顶层键名写错，或缩进层级异常；上面的结果仅来自全局模式扫描，完整性有限。", "确认文件是 compose 格式且 services: 位于顶层（无缩进）。");
  }
  if (sawAnchor) {
    csrevFind(findings, 2, 1, "", "检测到 YAML 锚点 / 合并键 / 多文档等复杂语法", "本工具按行与缩进扫描、不解析锚点展开后的结构，这类写法的实际生效值可能与扫描结果不一致。", "复杂文件请以 docker compose config 展开后的结果为准再人工复核。");
  }
  if (sawTab) {
    csrevFind(findings, 2, 1, "", "检测到 Tab 缩进", "YAML 规范不允许用 Tab 缩进，Compose 解析会直接报错，本工具按空格缩进的推断也可能不准。", "把缩进统一改成空格（通常 2 个）。");
  }
  if (truncated) {
    csrevFind(findings, 2, 1, "", "输入超过 100000 字符，仅审查了前 100000 字符", "超长输入被截断，后半部分的风险项不在本次结果内。", "把文件拆成单个 compose 分别审查。");
  }
  findings.sort(function (a, b) {
    if (a.lv !== b.lv) { return a.lv - b.lv; }
    return a.line - b.line;
  });
  var counts = [0, 0, 0];
  findings.forEach(function (f) { counts[f.lv]++; });
  var LV = ["✗ 严重", "⚠ 警告", "提示"];
  var L = [];
  L.push("Compose 安全审查结果");
  L.push("识别到的服务：" + (svcOrder.length ? svcOrder.join("、") : "（无）"));
  L.push("合计：严重 " + counts[0] + " 项 / 警告 " + counts[1] + " 项 / 提示 " + counts[2] + " 项");
  L.push("");
  if (!findings.length) {
    L.push("✓ 在本工具覆盖范围内未发现风险项。");
  }
  findings.forEach(function (f) {
    L.push("[" + LV[f.lv] + "] 第 " + f.line + " 行" + (f.svc ? " · 服务 " + f.svc : "") + "：" + f.msg);
    L.push("  依据：" + f.basis);
    L.push("  建议：" + f.fix);
    L.push("");
  });
  L.push("说明：本工具按行与缩进做务实扫描，不引入 YAML 解析库；锚点(&)、合并键(<<:)、");
  L.push("多文档(---)与长语法端口分组等复杂写法可能误判，请以 docker compose config");
  L.push("展开结果人工复核为准。environment 的值全程不回显（包括非密钥项）。");
  out.textContent = L.join("\n");
}
function initCsrev() {
  var out = document.getElementById("csrev-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("csrev-run");
  if (run) { run.addEventListener("click", csrevGenerate); }
  bindCopy("csrev-copy", "csrev-out", "csrev-msg");
  var clearBtn = document.getElementById("csrev-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("csrev-input").value = "";
      csrevGenerate();
      document.getElementById("csrev-msg").textContent = "已清空";
    });
  }
  csrevGenerate();
}

/* ================= N-07 磁盘空间与容量规划器（disk） =================
   公式：已用 = 总容量 × 已用%（或直接填已用容量）；剩余 = 总容量 − 已用；
   耗尽天数 = 剩余 ÷ 日增长；到警戒线天数 = (警戒线容量 − 已用) ÷ 日增长；
   撑到目标天数需扩容 = 已用 + 日增长 × 目标天数 − 总容量（为正才需要）。 */
function diskNum(id, label, errs) {
  var raw = document.getElementById(id).value.trim();
  if (!raw) { return null; }
  var v = Number(raw);
  if (!isFinite(v)) { errs.push(label + " 不是有效数字"); return null; }
  return v;
}
function diskFmtDate(daysFromNow) {
  var d = new Date(Date.now() + daysFromNow * 86400000);
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}
function diskGenerate() {
  var out = document.getElementById("disk-out");
  if (!out) { return; }
  var errBox = document.getElementById("disk-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var errs = [];
  var total = diskNum("disk-total", "总容量", errs);
  var usedPct = diskNum("disk-usedpct", "已用百分比", errs);
  var usedGB = diskNum("disk-usedgb", "已用容量", errs);
  var growth = diskNum("disk-growth", "日增长量", errs);
  var warnPct = diskNum("disk-warnpct", "警戒线百分比", errs);
  var target = diskNum("disk-target", "目标天数", errs);
  if (errs.length) { fail(errs.join("；")); return; }
  if (total === null) { fail("请填写总容量"); return; }
  if (total <= 0) { fail("总容量必须大于 0"); return; }
  if (usedPct === null && usedGB === null) { fail("已用百分比与已用容量至少填一个"); return; }
  if (usedPct !== null && (usedPct < 0 || usedPct > 100)) { fail("已用百分比应在 0 到 100 之间"); return; }
  if (usedGB !== null && usedGB < 0) { fail("已用容量不能为负数"); return; }
  if (usedGB !== null && usedGB > total) { fail("已用容量不能大于总容量"); return; }
  if (growth === null) { fail("请填写日增长量（不增长就填 0）"); return; }
  if (growth < 0) { fail("日增长量不能为负数（数据在减少时填 0，并留意这通常不长久）"); return; }
  if (warnPct === null) { warnPct = 90; }
  if (warnPct <= 0 || warnPct > 100) { fail("警戒线百分比应在 1 到 100 之间"); return; }
  if (target === null) { target = 180; }
  if (target <= 0) { fail("目标天数必须大于 0"); return; }
  var used, usedFromNote = "";
  if (usedGB !== null) {
    used = usedGB;
    if (usedPct !== null && Math.abs(usedGB - total * usedPct / 100) > total * 0.01) {
      usedFromNote = "注：已用百分比与已用容量对不上，本次按已用容量 " + usedGB + " GB 计算。";
    }
  } else {
    used = total * usedPct / 100;
  }
  var usedPctEff = Math.round(used / total * 10000) / 100;
  var free = total - used;
  var warnGB = total * warnPct / 100;
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  var L = [];
  L.push("容量现状");
  L.push("  总容量：" + r1(total) + " GB");
  L.push("  已用：" + r1(used) + " GB（" + r2(usedPctEff) + "%）");
  L.push("  剩余：" + r1(free) + " GB");
  if (usedFromNote) { L.push("  " + usedFromNote); }
  L.push("");
  L.push("公式：剩余 = 总容量 − 已用；耗尽天数 = 剩余 ÷ 日增长量；预计日期 = 今天 + 耗尽天数。");
  L.push("");
  if (free <= 0) {
    L.push("⚠ 磁盘已经满了（剩余 0）：先按故障处理清空间，不要再谈规划。");
  } else if (growth === 0) {
    L.push("按日增长 0 GB/天：不会因自然增长耗尽（公式里除以 0 无意义，单独说明）。");
    L.push("注意：突发写入（日志刷屏、一次性大导入）不服从日均增速，警戒线监控仍要留。");
  } else {
    var daysLeft = free / growth;
    L.push("按当前增速耗尽：约 " + r1(daysLeft) + " 天后（预计 " + diskFmtDate(Math.floor(daysLeft)) + " 前后写满）");
    if (used >= warnGB) {
      L.push("⚠ 已超过警戒线：" + "当前已用 " + r2(usedPctEff) + "% ≥ 警戒线 " + warnPct + "%（" + r1(warnGB) + " GB），应立即着手清理或扩容。");
    } else {
      var daysWarn = (warnGB - used) / growth;
      L.push("到达警戒线 " + warnPct + "%（" + r1(warnGB) + " GB）：约 " + r1(daysWarn) + " 天后（预计 " + diskFmtDate(Math.floor(daysWarn)) + "）");
    }
  }
  L.push("");
  L.push("扩容测算（目标：撑 " + target + " 天）");
  L.push("公式：目标天数内总需求 = 已用 + 日增长 × 目标天数；需扩容 = 总需求 − 总容量（为正才需要）。");
  var need = used + growth * target;
  if (growth === 0) {
    L.push("  日增长为 0：现有容量即可撑过目标天数，无需扩容。");
  } else if (need > total) {
    L.push("  ⚠ 需要扩容约 " + r1(need - total) + " GB（总需求 " + r1(need) + " GB > 现有 " + r1(total) + " GB）。");
    L.push("  提示：实际采购/扩容请在此基础上再留 10%–20% 余量，并考虑盘的标称容量与可用容量差异。");
  } else {
    L.push("  现有容量可撑到目标天数：到期时预计已用 " + r1(need) + " GB（" + r2(need / total * 100) + "%），无需扩容。");
  }
  L.push("");
  L.push("说明：增速按恒定日均估算；业务有波峰波谷时请用高峰期增速复核，本工具不含文件系统保留块（ext4 默认 5%）等因素。");
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initDisk() {
  var out = document.getElementById("disk-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["disk-total", "disk-usedpct", "disk-usedgb", "disk-growth", "disk-warnpct", "disk-target"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", diskGenerate);
      el.addEventListener("change", diskGenerate);
    }
  });
  bindCopy("disk-copy", "disk-out", "disk-msg");
  var clearBtn = document.getElementById("disk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      ["disk-total", "disk-usedpct", "disk-usedgb", "disk-growth", "disk-warnpct", "disk-target"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.value = ""; }
      });
      diskGenerate();
      document.getElementById("disk-msg").textContent = "已清空";
    });
  }
  diskGenerate();
}

/* ================= N-13 备份策略与 RPO/RTO 计算器（bk） =================
   口径：一次全量 = 数据总量；每日增量 = 数据总量 × 每日变化率；
   保留期总存储 ≈ 全量 + 每日增量 × 保留天数（假设只保留最近一份全量、
   每天一份增量）；耗时按 容量(GB) × 8000 ÷ 带宽(Mbps) ÷ 3600 = 小时
   （1 GB 按 1000 MB 的网络口径粗算）。
   RPO = 备份间隔（最坏情况下丢最近一个间隔内的数据）；
   RTO 估算 = 恢复最近一次全量所需时间（不含回放增量与人工处理）。 */
function bkFmtDur(hours) {
  if (!isFinite(hours)) { return "—"; }
  if (hours < 1) { return Math.round(hours * 60) + " 分钟"; }
  if (hours < 48) { return (Math.round(hours * 10) / 10) + " 小时"; }
  return (Math.round(hours / 24 * 10) / 10) + " 天（" + (Math.round(hours * 10) / 10) + " 小时）";
}
function bkNum(id, label, errs) {
  var raw = document.getElementById(id).value.trim();
  if (!raw) { return null; }
  var v = Number(raw);
  if (!isFinite(v)) { errs.push(label + " 不是有效数字"); return null; }
  return v;
}
function bkGenerate() {
  var out = document.getElementById("bk-out");
  if (!out) { return; }
  var errBox = document.getElementById("bk-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var errs = [];
  var total = bkNum("bk-total", "数据总量", errs);
  var change = bkNum("bk-change", "每日变化率", errs);
  var interval = bkNum("bk-interval", "备份间隔", errs);
  var keep = bkNum("bk-keep", "保留天数", errs);
  var up = bkNum("bk-up", "备份带宽", errs);
  var down = bkNum("bk-down", "恢复带宽", errs);
  if (errs.length) { fail(errs.join("；")); return; }
  if (total === null || total <= 0) { fail("数据总量必须大于 0"); return; }
  if (change === null || change < 0 || change > 100) { fail("每日变化率应在 0 到 100 之间"); return; }
  if (interval === null || interval <= 0) { fail("备份间隔必须大于 0（小时）"); return; }
  if (keep === null || keep < 1) { fail("保留天数至少为 1"); return; }
  keep = Math.floor(keep);
  if (up === null || up <= 0) { fail("备份带宽必须大于 0（Mbps）"); return; }
  if (down === null || down <= 0) { fail("恢复带宽必须大于 0（Mbps）"); return; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  var full = total;
  var incr = total * change / 100;
  var storage = full + incr * keep;
  var fullHours = total * 8000 / up / 3600;
  var incrHours = incr * 8000 / up / 3600;
  var restoreHours = total * 8000 / down / 3600;
  var L = [];
  L.push("备份体量（公式：每日增量 = 数据总量 × 每日变化率）");
  L.push("  一次全量大小：" + r1(full) + " GB");
  L.push("  每日增量估算：" + r1(incr) + " GB/天（变化率 " + change + "%）");
  L.push("  保留期总存储估算：" + r1(storage) + " GB");
  L.push("    公式：总存储 ≈ 一次全量 + 每日增量 × 保留天数（" + r1(full) + " + " + r1(incr) + " × " + keep + "）");
  L.push("    假设：只保留最近一份全量、每天一份增量；若保留多份全量或做异地多副本，按份数倍增。");
  L.push("");
  L.push("RPO（数据能丢多少）");
  L.push("  RPO = 备份间隔 = " + interval + " 小时：最坏情况下，故障发生在下一次备份前一刻，");
  L.push("  会丢失最近 " + interval + " 小时内产生/修改的数据。想缩小 RPO 只能缩短备份间隔（或改持续同步）。");
  L.push("");
  L.push("耗时与 RTO（公式：耗时(小时) = 容量(GB) × 8000 ÷ 带宽(Mbps) ÷ 3600，1 GB 按 1000 MB 网络口径）");
  L.push("  单次全量备份耗时：约 " + bkFmtDur(fullHours) + "（带宽 " + up + " Mbps）");
  L.push("  单次增量备份耗时：约 " + bkFmtDur(incrHours));
  L.push("  整库恢复耗时（RTO 估算）：约 " + bkFmtDur(restoreHours) + "（恢复带宽 " + down + " Mbps）");
  L.push("    注：此 RTO 只算「把最近一次全量传回并写完」的时间；回放增量链、校验、");
  L.push("    起服务与人工决策都不在内，真实恢复时间只会更长。按有效带宽 70% 粗算约 " + bkFmtDur(restoreHours / 0.7) + "。");
  if (fullHours > interval) {
    L.push("  ⚠ 全量备份耗时（约 " + r1(fullHours) + " 小时）已超过备份间隔（" + interval + " 小时）：");
    L.push("    全量根本跑不完一轮，实际策略只能是「全量低频 + 增量高频」，或先扩带宽/拆分备份对象。");
  }
  L.push("");
  L.push("RPO 与 RTO 的区别");
  L.push("  RPO 管「丢多少数据」：由备份间隔决定，是时间点概念（恢复到哪一刻）。");
  L.push("  RTO 管「停多久业务」：由恢复耗时决定，是时长概念（多久能重新提供服务）。");
  L.push("  两者要分别定目标：RPO 达标不等于 RTO 达标——备份很勤，但整库恢复要两天，业务照样停摆。");
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initBk() {
  var out = document.getElementById("bk-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["bk-total", "bk-change", "bk-interval", "bk-keep", "bk-up", "bk-down"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", bkGenerate);
      el.addEventListener("change", bkGenerate);
    }
  });
  bindCopy("bk-copy", "bk-out", "bk-msg");
  var clearBtn = document.getElementById("bk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      ["bk-total", "bk-change", "bk-interval", "bk-keep", "bk-up", "bk-down"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.value = ""; }
      });
      bkGenerate();
      document.getElementById("bk-msg").textContent = "已清空";
    });
  }
  bkGenerate();
}

/* ================= N-24 正则表达式测试器（re） =================
   全局匹配上限 200 条防爆；零宽匹配手动推进 lastIndex 防死循环。
   本工具只做测试展示，不做「自动修复」表达式。 */
function reGenerate() {
  var out = document.getElementById("re-out");
  if (!out) { return; }
  var errBox = document.getElementById("re-err");
  function fail(msg) {
    errBox.style.display = "block";
    errBox.textContent = "输入有误：" + msg;
    out.textContent = "# 请先修正上面的输入";
  }
  var pattern = document.getElementById("re-pattern").value;
  var text = document.getElementById("re-text").value;
  if (!pattern) {
    errBox.style.display = "none";
    out.textContent = "# 在上方输入正则表达式，这里会列出全部匹配、捕获组与命名组。\n# 语法错误会明确报在上方红框里；本工具只测试、不自动修复表达式。";
    return;
  }
  var flags = "";
  ["g", "i", "m", "s", "u"].forEach(function (f) {
    var el = document.getElementById("re-f-" + f);
    if (el && el.checked) { flags += f; }
  });
  var rx;
  try {
    rx = new RegExp(pattern, flags);
  } catch (e) {
    fail("正则语法错误：" + e.message);
    return;
  }
  var MAX = 200;
  var results = [];
  var capped = false;
  var m;
  if (flags.indexOf("g") >= 0) {
    while ((m = rx.exec(text)) !== null) {
      results.push(m);
      if (results.length >= MAX) { capped = rx.lastIndex <= text.length; break; }
      if (m[0] === "") { rx.lastIndex++; }
      if (rx.lastIndex > text.length) { break; }
    }
  } else {
    m = rx.exec(text);
    if (m) { results.push(m); }
  }
  function showVal(v) {
    if (v === undefined) { return "（未参与匹配）"; }
    var s = v.length > 120 ? v.slice(0, 120) + "…（共 " + v.length + " 字符，已截断）" : v;
    return JSON.stringify(s);
  }
  var warnLines = [];
  if (/(\([^()]*[+*][^()]*\)\s*[+*])|([+*]\s*[+*])/.test(pattern)) {
    warnLines.push("");
    warnLines.push("⚠ 检测到疑似嵌套量词写法（如 (a+)+、(\\w+)*）：这类模式在「长串 + 不匹配结尾」时");
    warnLines.push("  可能指数级回溯，把 CPU 打满。本工具不自动修复；建议改写量词结构或限定字符集后重测。");
  }
  var L = [];
  L.push("模式：/" + pattern + "/" + flags);
  L.push("测试文本长度：" + text.length + " 字符（下标为 JS 字符串下标，0 起）");
  if (!results.length) {
    L.push("匹配：否（没有找到任何匹配）");
    warnLines.forEach(function (w) { L.push(w); });
    errBox.style.display = "none";
    out.textContent = L.join("\n");
    return;
  }
  L.push("匹配：是，共 " + results.length + " 处" + (capped ? "（已达上限 " + MAX + " 条，后续匹配未继续统计）" : ""));
  if (flags.indexOf("g") < 0 && results.length) {
    L.push("注：未勾选 g 时只报告第一处匹配。");
  }
  results.forEach(function (mm, idx) {
    var start = mm.index;
    var end = start + mm[0].length;
    L.push("");
    L.push("#" + (idx + 1) + " 下标 " + start + "–" + end + "（长度 " + mm[0].length + "）：" + showVal(mm[0]));
    for (var g = 1; g < mm.length; g++) {
      L.push("    捕获组 " + g + "：" + showVal(mm[g]));
    }
    if (mm.groups) {
      var names = Object.keys(mm.groups);
      if (names.length) {
        names.forEach(function (nm) {
          L.push("    命名组 " + nm + "：" + showVal(mm.groups[nm]));
        });
      }
    }
  });
  warnLines.forEach(function (w) { L.push(w); });
  errBox.style.display = "none";
  out.textContent = L.join("\n");
}
function initRe() {
  var out = document.getElementById("re-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  ["re-pattern", "re-text", "re-f-g", "re-f-i", "re-f-m", "re-f-s", "re-f-u"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", reGenerate);
      el.addEventListener("change", reGenerate);
    }
  });
  bindCopy("re-copy", "re-out", "re-msg");
  var clearBtn = document.getElementById("re-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("re-pattern").value = "";
      document.getElementById("re-text").value = "";
      reGenerate();
      document.getElementById("re-msg").textContent = "已清空";
    });
  }
  reGenerate();
}

/* ================= N-28 .env 文件检查器（env） =================
   隐私口径：全程本地运行、不存储；输出只出现键名与行号，
   任何一行的值都不回显（包括非敏感行），格式判断只在内存里做。 */
function envIsSensitiveKey(key) {
  return /KEY|SECRET|TOKEN|PASSWORD|PASSWD/i.test(key);
}
function envGenerate() {
  var out = document.getElementById("env-out");
  if (!out) { return; }
  var errBox = document.getElementById("env-err");
  errBox.style.display = "none";
  var raw = document.getElementById("env-input").value;
  if (!raw.replace(/\s+/g, "")) {
    out.textContent = "# 把 .env 文件内容粘贴到上方，点「开始检查」。\n# 本工具全程在浏览器本地运行、不存储；输出只有键名与行号，任何值都不会被回显。";
    return;
  }
  var truncated = false;
  var text = raw;
  if (text.length > 200000) { text = text.slice(0, 200000); truncated = true; }
  var lines = text.split("\n");
  var findings = [];
  function add(lv, lineNo, msg) { findings.push({ lv: lv, line: lineNo, msg: msg }); }
  var seen = {};
  var assignCount = 0;
  var exportLines = [];
  var plainCount = 0;
  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1;
    var t = lines[i].replace(/^\s+/, "").replace(/\s+$/, "");
    if (!t || t.charAt(0) === "#") { continue; }
    var hasExport = /^export\s+/.test(t);
    var body = hasExport ? t.replace(/^export\s+/, "") : t;
    var eq = body.indexOf("=");
    if (eq < 0) {
      add(1, lineNo, "第 " + lineNo + " 行：没有等号，无法解析为 KEY=VALUE（内容未回显）。若这是注释请以 # 开头。");
      continue;
    }
    var key = body.slice(0, eq).replace(/\s+$/, "");
    var valRaw = body.slice(eq + 1);
    var val = valRaw.replace(/^\s+/, "").replace(/\s+$/, "");
    assignCount++;
    if (hasExport) { exportLines.push(lineNo); } else { plainCount++; }
    if (!key) {
      add(1, lineNo, "第 " + lineNo + " 行：键名为空。");
      continue;
    }
    var keyShow = key.length > 40 ? key.slice(0, 40) + "…" : key;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      add(1, lineNo, "第 " + lineNo + " 行：键名「" + keyShow + "」不合法（应以字母或下划线开头，只含字母、数字、下划线；含空格、小写以外的字符或以数字开头都会让部分解析器报错或忽略）。");
    }
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」重复定义（首次在第 " + seen[key] + " 行）。多数解析器取最后一份，前面的值会被静默覆盖。");
    } else {
      seen[key] = lineNo;
    }
    var sensitive = envIsSensitiveKey(key);
    if (val === "") {
      add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值为空。确认是有意留空：有些框架把空字符串当作已设置，有些则当未设置，行为不一致。");
    } else {
      var first = val.charAt(0);
      if (first === '"' || first === "'") {
        if (val.length < 2 || val.charAt(val.length - 1) !== first) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值引号未闭合（值未回显）。");
        }
      } else {
        if (/\s#/.test(val)) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值未加引号却含空格与 #（值未回显）：多数解析器会把 # 后内容当注释截断，实际生效值与你写的不一致。给整体加引号。");
        } else if (/\s/.test(val)) {
          add(1, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的值未加引号却含空格（值未回显）：被 shell source 或部分解析器读取时会拆断或报错。给整体加引号。");
        } else if (val.indexOf("#") >= 0) {
          add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」的未加引号值含 #（值未回显）：不同解析器对值中 # 的处理不一致（有的当注释、有的保留），建议加引号消除歧义。");
        }
      }
    }
    if (sensitive) {
      add(2, lineNo, "第 " + lineNo + " 行：键「" + keyShow + "」疑似敏感项（键名含 KEY/SECRET/TOKEN/PASSWORD 类字样）。本工具不回显其值；请确认 .env 已加入 .gitignore、文件权限为 600，且没有被粘贴到聊天/工单/截图里扩散。");
    }
  }
  if (exportLines.length && plainCount) {
    var exList = exportLines.slice(0, 10).join("、") + (exportLines.length > 10 ? " 等" : "");
    add(2, exportLines[0], "export 前缀不一致：第 " + exList + " 行用了 export，其余 " + plainCount + " 条赋值没用。两种写法混用不影响 dotenv 解析，但被 shell source 时只有带 export 的会进环境变量，容易踩坑；统一一种写法。");
  }
  if (truncated) {
    add(2, 1, "输入超过 200000 字符，仅检查了前 200000 字符。");
  }
  findings.sort(function (a, b) {
    if (a.lv !== b.lv) { return a.lv - b.lv; }
    return a.line - b.line;
  });
  var counts = [0, 0, 0];
  findings.forEach(function (f) { counts[f.lv]++; });
  var LV = ["✗ 严重", "⚠ 警告", "提示"];
  var L = [];
  L.push(".env 检查结果");
  L.push("共扫描 " + lines.length + " 行，其中赋值行 " + assignCount + " 条；问题：严重 " + counts[0] + " 项 / 警告 " + counts[1] + " 项 / 提示 " + counts[2] + " 项");
  L.push("");
  if (!findings.length) {
    L.push("✓ 未发现格式问题（在本工具覆盖范围内）。");
  }
  findings.forEach(function (f) {
    L.push("[" + LV[f.lv] + "] " + f.msg);
  });
  L.push("");
  L.push("隐私说明：本工具全程在浏览器本地运行、不存储、不上传；输出只出现键名与行号，");
  L.push("任何一行的值（包括非敏感行）都不会被回显，格式判断只在内存中完成。");
  out.textContent = L.join("\n");
}
function initEnv() {
  var out = document.getElementById("env-out");
  if (!out || out.getAttribute("data-ready") === "1") { return; }
  out.setAttribute("data-ready", "1");
  var run = document.getElementById("env-run");
  if (run) { run.addEventListener("click", envGenerate); }
  bindCopy("env-copy", "env-out", "env-msg");
  var clearBtn = document.getElementById("env-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      document.getElementById("env-input").value = "";
      envGenerate();
      document.getElementById("env-msg").textContent = "已清空";
    });
  }
  envGenerate();
}

/* 批次 B init 函数清单（集成方在页尾统一调用，与现有工具同样的三路触发）：
   - initDiag   （N-10 Linux 故障诊断决策树）
   - initCsrev  （N-12 Docker Compose 安全审查器）
   - initDisk   （N-07 磁盘空间与容量规划器）
   - initBk     （N-13 备份策略与 RPO/RTO 计算器）
   - initRe     （N-24 正则表达式测试器）
   - initEnv    （N-28 .env 文件检查器）
   依赖：页面已有的 bindCopy(btnId, outId, msgId) 助手（与现有 15 个工具共用）。 */
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
if (window.document$ && typeof document$.subscribe === "function") {
  document$.subscribe(initGuideTools);
  document$.subscribe(initSshGen);
  document$.subscribe(initSshCfgGen);
  document$.subscribe(initSubnetGen);
  document$.subscribe(initCronGen);
  document$.subscribe(initUnitGen);
  document$.subscribe(initNginxGen);
  document$.subscribe(initComposeGen);
  document$.subscribe(initLvmGen);
  document$.subscribe(initCertGen);
  document$.subscribe(initPermGen);
  document$.subscribe(initHashGen);
  document$.subscribe(initVerGen);
  document$.subscribe(initDresGen);
  document$.subscribe(initHttpGen);
  document$.subscribe(initFmtGen);
  document$.subscribe(initDiffGen);
  document$.subscribe(initCiGen);
  document$.subscribe(initSshdGen);
  document$.subscribe(initTmrGen);
  document$.subscribe(initDiag);
  document$.subscribe(initCsrev);
  document$.subscribe(initDisk);
  document$.subscribe(initBk);
  document$.subscribe(initRe);
  document$.subscribe(initEnv);
  document$.subscribe(initGhaGen);
  document$.subscribe(initPlanGen);
  document$.subscribe(initLogGen);
  document$.subscribe(initAptGen);
  document$.subscribe(initMigGen);
  document$.subscribe(initCurlGen);
  document$.subscribe(initSshlogGen);
  document$.subscribe(initGitGen);
  document$.subscribe(initExplainGen);
  document$.subscribe(initDnsTool);
  document$.subscribe(initHdrTool);
  document$.subscribe(initFwmTool);
}
document.addEventListener("DOMContentLoaded", initGuideTools);
document.addEventListener("DOMContentLoaded", initSshGen);
document.addEventListener("DOMContentLoaded", initSshCfgGen);
document.addEventListener("DOMContentLoaded", initSubnetGen);
document.addEventListener("DOMContentLoaded", initCronGen);
document.addEventListener("DOMContentLoaded", initUnitGen);
document.addEventListener("DOMContentLoaded", initNginxGen);
document.addEventListener("DOMContentLoaded", initComposeGen);
document.addEventListener("DOMContentLoaded", initLvmGen);
document.addEventListener("DOMContentLoaded", initCertGen);
document.addEventListener("DOMContentLoaded", initPermGen);
document.addEventListener("DOMContentLoaded", initHashGen);
document.addEventListener("DOMContentLoaded", initVerGen);
document.addEventListener("DOMContentLoaded", initDresGen);
document.addEventListener("DOMContentLoaded", initHttpGen);
document.addEventListener("DOMContentLoaded", initFmtGen);
document.addEventListener("DOMContentLoaded", initDiffGen);
document.addEventListener("DOMContentLoaded", initCiGen);
document.addEventListener("DOMContentLoaded", initSshdGen);
document.addEventListener("DOMContentLoaded", initTmrGen);
document.addEventListener("DOMContentLoaded", initDiag);
document.addEventListener("DOMContentLoaded", initCsrev);
document.addEventListener("DOMContentLoaded", initDisk);
document.addEventListener("DOMContentLoaded", initBk);
document.addEventListener("DOMContentLoaded", initRe);
document.addEventListener("DOMContentLoaded", initEnv);
document.addEventListener("DOMContentLoaded", initGhaGen);
document.addEventListener("DOMContentLoaded", initPlanGen);
document.addEventListener("DOMContentLoaded", initLogGen);
document.addEventListener("DOMContentLoaded", initAptGen);
document.addEventListener("DOMContentLoaded", initMigGen);
document.addEventListener("DOMContentLoaded", initCurlGen);
document.addEventListener("DOMContentLoaded", initSshlogGen);
document.addEventListener("DOMContentLoaded", initGitGen);
document.addEventListener("DOMContentLoaded", initExplainGen);
document.addEventListener("DOMContentLoaded", initDnsTool);
document.addEventListener("DOMContentLoaded", initHdrTool);
document.addEventListener("DOMContentLoaded", initFwmTool);
initGuideTools();
initSshGen();
initSshCfgGen();
initSubnetGen();
initCronGen();
initUnitGen();
initNginxGen();
initComposeGen();
initLvmGen();
initCertGen();
initPermGen();
initHashGen();
initVerGen();
initDresGen();
initHttpGen();
initFmtGen();
initDiffGen();
initCiGen();
initSshdGen();
initTmrGen();
initDiag();
initCsrev();
initDisk();
initBk();
initRe();
initEnv();
initGhaGen();
initPlanGen();
initLogGen();
initAptGen();
initMigGen();
initCurlGen();
initSshlogGen();
initGitGen();
initExplainGen();
initDnsTool();
initHdrTool();
initFwmTool();
</script>
