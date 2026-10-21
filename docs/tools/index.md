---
description: "互动工具：九个纯前端小工具——Netplan、UFW、SSH、子网计算、Cron、systemd unit、Nginx 反代、Docker Compose 与 LVM 扩容，填表实时生成可直接复制的配置与命令，纯前端运行、不上传任何数据。"
---

# 互动工具

九个纯前端小工具：在浏览器里填表，实时生成可复制的配置与命令，**不上传任何数据**。本站工具只在浏览器本地生成文本，**不连接任何服务器、也不执行任何命令**；生成结果请先在目标机上核对、审阅、验证后再使用，不要把「生成成功」当成「已在真实服务器验证」。

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
    <label>来源 IP（可选，留空=任意） <input type="text" id="ufw-src" placeholder="192.0.2.100"></label>
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

### cron 还是 systemd timer：六维度对比与选型

两种调度方式的机制差异如下，选型时按任务特征对号入座：

| 维度 | cron | systemd timer |
|---|---|---|
| 执行环境 | 环境变量极简（只有 HOME、LOGNAME、PATH 等少数几个），不加载登录 shell 的配置，脚本要自备 PATH 与工作目录 | 作为 systemd 服务运行，可用 `Environment=` / `EnvironmentFile=` 明确注入环境变量，与服务管理一体化 |
| 日志 | 默认不留日志，命令输出靠本机邮件或自己在脚本里重定向到文件 | 输出自动进 journal，用 `journalctl -u 服务名` 查看，天然带时间戳与日志轮转 |
| 时区 | 跟随系统本地时区，修改时区或夏令时切换时触发时点可能漂移 | `OnCalendar` 按本地时区解释，写入前可用 `systemd-analyze calendar` 校验展开结果 |
| 补执行 | 没有补执行：关机、休眠期间到点的任务直接错过，不会补跑 | `Persistent=true` 时，开机后会补跑错过的触发 |
| 依赖关系 | 无依赖概念：任务之间、任务与系统服务之间不能声明先后与联动 | 可用 `After=` / `Requires=` 与其他 unit 编排，能跟目标服务一起启停 |
| 失败重试 | 无内建机制，重试与告警要靠脚本自己实现 | 服务侧可配 `Restart=` 等策略，失败状态在 `systemctl` 里可见、可联动告警 |

三个问题定选型：

- **错过时间点能接受吗？** 不能（例如夜间关机时段的备份）→ 选 systemd timer 并开启 `Persistent=true`；能接受 → 两者都行，看下一问。
- **任务要跟某个服务联动吗？** 要等服务就绪、随服务启停 → 选 systemd timer；完全独立的小脚本 → 看下一问。
- **只是固定周期跑一个独立脚本吗？** 是 → cron 最省事，直接用上方生成器拼表达式；需要查日志、看状态、配失败策略 → systemd timer 更省心。

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

## SSL 证书有效期检查（速查卡）

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

<div id="copy-toast" style="display: none; position: fixed; left: 50%; bottom: 1.4em; transform: translateX(-50%); z-index: 9999; max-width: 92vw; background: #b71c1c; color: #fff; padding: 0.7em 1.1em; border-radius: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); opacity: 0; transition: opacity 0.3s;">粘贴到服务器前请先逐行审阅，并确认已保留回滚通道。</div>

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
    if (src.indexOf(":") !== -1 && /^[0-9A-Fa-f:.]+$/.test(src)) {
      errs.push("来源暂只支持 IPv4 地址 / CIDR，IPv6 来源待后续支持");
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
    L.push("# 多后端负载均衡：请求按权重轮询分发（weight 越大分得越多，不写即 1）");
    L.push("upstream " + upname + " {");
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
    L.push("    image: mysql:8.0");
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
  ["ngx-domain", "ngx-proto", "ngx-host", "ngx-port", "ngx-ws", "ngx-https", "ngx-multi", "ngx-upname", "ngx-upstreams", "ngx-t-conn", "ngx-t-send", "ngx-t-read", "ngx-limit", "ngx-limit-rate", "ngx-limit-burst", "ngx-realip", "ngx-realip-from"].forEach(function (id) {
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
initGuideTools();
initSshGen();
initSshCfgGen();
initSubnetGen();
initCronGen();
initUnitGen();
initNginxGen();
initComposeGen();
initLvmGen();
</script>
