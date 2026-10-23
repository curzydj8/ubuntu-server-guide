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
