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
