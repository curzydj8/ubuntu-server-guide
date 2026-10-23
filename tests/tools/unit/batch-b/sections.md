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
