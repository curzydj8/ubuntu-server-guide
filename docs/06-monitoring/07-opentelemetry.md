---
description: "第 5 章讲了 OpenTelemetry 的概念，本章把它落地：在监控机装好 Collector，用一份最小配置把追踪、指标、日志收进统一接入层，再分发给已有的 Prometheus 与 Loki，应用只埋一次点。"
---

# OpenTelemetry 与 Collector：统一遥测接入层

## 一、概述与使用场景

第 5 章 [可观测性与告警治理](05-observability-alerting.md) 已讲清指标、日志、追踪三支柱的分工，也介绍了 OpenTelemetry（缩写 OTel）的概念。本章把概念落地：在监控机上部署 OTel 的数据汇聚组件 Collector，让应用的遥测数据先统一进这一层，再分发给第 2 章 [Prometheus 与 Grafana 监控栈](02-prometheus-grafana.md)、第 3 章 [集中式日志收集](03-logging-stack.md) 等既有后端。

先把四个角色分清，这是全章的地图：

| 角色 | 是什么 | 部署形态 | 职责 |
| --- | --- | --- | --- |
| SDK / API | 应用内的埋点库 | 随应用一起发布 | 产出 Span、指标与日志，带上服务名等资源属性 |
| OTLP | OTel 的原生传输协议 | gRPC 用 4317 端口，HTTP 用 4318 端口 | 把三类信号按统一格式送出 |
| Collector | 独立进程 | 装在监控机（也可每机一台） | 接收、加工（攒批、限内存、采样、脱敏）、转发 |
| 后端 | Prometheus、Loki、Tempo、Jaeger 等 | 按第 2、3 章既有部署 | 长期存储、查询与展示 |

Collector 的定位是「统一接入层」：应用只埋一次点、只连 Collector 一个地址。后端换了、要加采样或脱敏，只改 Collector 一处配置，不用推动所有应用改代码重新发版。第 5 章 3.2 节讲过直连后端的两个问题——地址与凭证散落、加工逻辑重复实现——Collector 就是为收敛这两件事而设的中间层。

边界同样要讲清：OTel 只负责产生与传输遥测数据，不做存储与查询，不要把它当成又一套监控系统去替代第 2 章的栈；已有的 Node Exporter、Loki 采集链路继续按原方式工作，Collector 服务的是「应用埋点」这类新数据来源，两边不抢同一份数据（呼应第 5 章 3.3 节「同一指标来源只进一套体系」的纪律）。

验证级别说明：本章的 Collector 配置原文与第四节的验证闭环，已经用写作时从官方 GitHub 发布页下载的 otelcol-contrib 0.163.2（官方 .deb 包，SHA-256 与官方校验文件核对一致）在沙箱环境实测——`validate` 子命令校验通过，实际启动后三条 OTLP/HTTP 测试数据（追踪、指标、日志）均被接收并正确导出。在真实 Ubuntu 服务器上以 systemd 方式长期运行、接真实应用 SDK 与 Tempo 等后端分发的部分为文档核对级别；Ubuntu 26.04 标记为待核验。3.5 与 3.6 两节的进阶配置片段按官方文档核对，未纳入本章实测范围，文中已逐处标明。

## 二、环境准备与前置条件

- 监控机一台：与第 2 章同一台（示例地址 192.0.2.20），Ubuntu Server 22.04 LTS 或 24.04 LTS，已部署 Prometheus 与 Grafana。
- 应用机一到多台：运行待接入的应用，能访问监控机的 4317 与 4318 端口。
- 权限：监控机上有可使用 sudo 的账号。
- 时间同步：所有机器开启 NTP。追踪数据靠时间戳拼调用链，时钟错位会让 Span 顺序错乱，接入前先按第 2 章的方法核对 `timedatectl status`。

端口规划先定死，后面所有配置与防火墙规则都按这张表走：

| 端口 | 用途 | 开放范围 |
| --- | --- | --- |
| 4317 | OTLP gRPC 入口，应用向 Collector 发送数据 | 仅应用机所在网段 |
| 4318 | OTLP HTTP 入口，同上 | 仅应用机所在网段 |
| 8889 | Collector 的 Prometheus 导出端点，供本机 Prometheus 抓取 | 仅本机与监控网段 |
| 13133 | health_check 扩展的健康检查接口 | 仅本机与运维网段 |
| 8888 | Collector 自身监控指标（组件吞吐、拒绝计数等） | 仅本机与监控网段 |

发行选择：Collector 官方有两个发行，core 只含核心组件，本章用到的 Prometheus 导出器、尾采样与属性处理器都在 contrib 发行里，所以服务器落地统一用 contrib 的 .deb 包（包名 otelcol-contrib）。官方包的事实以 0.163.2 的包内文件为准：二进制在 /usr/bin/otelcol-contrib，systemd 单元名为 otelcol-contrib，配置文件路径 /etc/otelcol-contrib/config.yaml，服务以专用系统用户 otelcol-contrib 运行（非 root）；其他版本若有出入，以所装版本的包内文件为准。

改配置的纪律与前几章一致：动 /etc/otelcol-contrib/config.yaml 之前先带日期备份，改完先用 `validate` 校验、通过了才重启服务，命令在 3.2 节给出。

## 三、手把手操作步骤

### 3.1 安装 otelcol-contrib

到 OpenTelemetry Collector 的官方 GitHub 发布页（opentelemetry-collector-releases 仓库的 Releases）下载 contrib 发行的 linux_amd64 .deb 包与同名 .sha256 校验文件。以下以本章实测的 0.163.2 为例，版本号以发布页实际为准：

```bash
cd /tmp
curl -LO https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.163.2/otelcol-contrib_0.163.2_linux_amd64.deb
curl -LO https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.163.2/otelcol-contrib_0.163.2_linux_amd64.deb.sha256
cat otelcol-contrib_0.163.2_linux_amd64.deb.sha256
sha256sum otelcol-contrib_0.163.2_linux_amd64.deb
```

两条命令输出的哈希值必须逐字一致，对不上就删掉重新下载，不要带病安装。校验通过后安装并先停下服务（官方包安装后会自动启用服务并载入包自带的一份示例配置，那份配置开着 Jaeger、Zipkin 等一堆本章不用的接收器，先停掉、换成本章配置再启动）：

```bash
sudo apt install -y ./otelcol-contrib_0.163.2_linux_amd64.deb
sudo systemctl stop otelcol-contrib
sudo cp /etc/otelcol-contrib/config.yaml /etc/otelcol-contrib/config.yaml.orig
```

config.yaml.orig 是包自带示例配置的留底，回滚与对照时用得上，不要删。

### 3.2 最小可用配置：先跑通本机闭环

本章主线配置只做一件事：把管线在本机跑通——追踪与日志先送 debug 导出器（打印到 Collector 日志里，肉眼可查），指标送 Prometheus 导出器（在 8889 端口开一个抓取端点，接回第 2 章的 Prometheus）。生产环境把 debug 换成真实后端只改导出器一处，见本节末尾。用 sudo 编辑 /etc/otelcol-contrib/config.yaml，整份替换为以下内容（文件已在 3.1 节备份过留底）：

```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  debug:
    verbosity: detailed
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
```

逐段讲解：

| 配置段 | 含义 | 本章取值说明 |
| --- | --- | --- |
| `extensions.health_check` | 健康检查扩展 | 在 13133 端口应答存活状态，供巡检与第四节验证 |
| `receivers.otlp.protocols` | OTLP 接收器双入口 | gRPC 4317 与 HTTP 4318 同时开，应用按所用 SDK 选其一 |
| `processors.memory_limiter` | 内存保护 | 每秒检查一次，超过 512 MiB 起拒绝新数据，防止 Collector 被洪峰打爆拖垮监控机；必须排在每条管道处理器的第一位 |
| `processors.batch` | 攒批发送 | 5 秒或攒满 1000 条发一批，降低导出开销 |
| `exporters.debug` | 把数据打印进 Collector 日志 | verbosity 为 detailed 时打印每条 Span 与日志的全文，本章验证就靠它；验证期过后改 basic 或从管道摘除，见第五节场景五 |
| `exporters.prometheus` | 指标导出端点 | 在 8889 暴露 /metrics 供 Prometheus 抓取；默认会把资源的 service.name 映射成 job 标签，这是第四节里能按服务查指标的原因 |
| `service.pipelines` | 按信号串起三段组件 | 定义了组件不等于启用，必须被某条管道引用才生效（第 5 章 3.2 节同一纪律） |

生产分发只动导出器：追踪把 debug 换成 otlp 导出器指向 Tempo 或 Jaeger 的 OTLP 入口；日志用 otlphttp 导出器指向 Loki 的 OTLP 入口（第 3 章的 Loki 若为支持 OTLP 的版本）；指标除本机抓取外，也可换 prometheusremotewrite 导出器直推。各后端的入口路径与认证写法以其当前官方文档为准，本章不展开。

### 3.3 校验并启动

先校验再启动，这是本章的固定动作顺序：

```bash
sudo otelcol-contrib validate --config=/etc/otelcol-contrib/config.yaml
sudo systemctl enable --now otelcol-contrib
sudo systemctl status otelcol-contrib
journalctl -u otelcol-contrib -n 30 --no-pager
```

validate 无输出且退出码为 0 即配置合法（组件名拼写、管道引用、参数类型都过了一遍）。日志中出现 Everything is ready 字样，说明三条管道与健康检查扩展都已就绪。

### 3.4 应用侧埋点纪律：服务名是命脉

应用侧只需要知道两件事：Collector 的地址，以及自己叫什么名字。绝大多数语言的 SDK 都认一组标准环境变量，不用改代码即可完成基础接入：

```bash
OTEL_SERVICE_NAME=checkout-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://192.0.2.20:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

逐项说明：OTEL_SERVICE_NAME 设定服务名，它会成为资源属性 service.name，是后端里分组、查询、告警的第一维度；OTEL_EXPORTER_OTLP_ENDPOINT 是 Collector 地址，用 gRPC 的应用把端口换成 4317、协议换成 grpc。用 systemd 托管的应用把这三行写进单元的 Environment=，容器则写进编排的环境变量段，形态不同、变量名一致。

服务名纪律三条，接入前就定死：

- 必须显式设置。没设服务名的应用在后端里会落成 unknown_service 一类占位名，混在一起无法区分，等数据攒多了再改名，历史数据的前后口径就断了。
- 命名用小写加短横线、全栈唯一，如 checkout-api、billing-worker；同一个服务的所有实例共用一个服务名。
- 不要把主机名、IP、实例编号写进服务名。一台机器一个名字会让服务数量随扩容线性膨胀，这正是第 5 章场景三的高基数问题在追踪侧的翻版；实例级区分由 SDK 自动附带的 service.instance.id 负责。

资源属性也可以走 OTEL_RESOURCE_ATTRIBUTES 一次带多个（形如 service.name=checkout-api,deployment.environment=prod），与 OTEL_SERVICE_NAME 冲突时以 OTEL_SERVICE_NAME 为准。官方另有 telemetrygen 工具可以合成遥测数据做压测与冒烟，本章第四节用 curl 手发即可，不必多装。

### 3.5 采样与成本控制（进阶片段，按官方文档核对，未纳入本章实测）

追踪是三类信号里量最大、最需要采样的。两种采样位置对应两种取舍：

头部采样（head sampling）在应用侧、请求开始时就决定留不留，靠 SDK 环境变量配置：

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

含义是按 Trace ID 比例保留约一成、并尊重上游已做出的采样决定。它实现简单、无状态，代价是决定做得太早：报错的那条请求也可能正好被丢掉（第 5 章场景四）。

尾部采样（tail sampling）把决定推迟到 Collector 侧、整条追踪到齐之后，能实现「错误全留、正常抽样」。它是 contrib 发行的 tail_sampling 处理器，配置片段如下（并入 3.2 节配置的 processors 段、并把组件名加进 traces 管道的 processors 列表后，必须重跑 validate 才可启用）：

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 1000
    policies:
      - name: keep-errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: baseline-probabilistic
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

逐项说明：decision_wait 是等一条追踪到齐的窗口；num_traces 是同时缓存的追踪条数上限，直接决定内存占用；两条 policy 并列时任一命中即保留（组合语义以官方文档当前版本为准）。代价写明：缓存整条追踪意味着 Collector 要扛状态与内存，量大时这一段要单独评估容量；同一条追踪的 Span 必须进同一个 Collector 实例，多副本部署要先解决分流一致性。

结论给新接入者：先全量接入跑一到两周，看清真实量与成本再上采样；要上先上头部概率采样止血，错误优先的需求明确了再评估尾部采样，不要一上来就堆复杂策略。

### 3.6 敏感属性过滤（进阶片段，按官方文档核对，未纳入本章实测）

Span 与日志会把请求头、SQL 语句一类内容原样带进来，落库之后再脱敏就来不及了（第 5 章第六节第五条同一纪律）。contrib 的 attributes 处理器在 Collector 这一层统一处理，片段如下（并入与启用方式同 3.5 节）：

```yaml
processors:
  attributes:
    actions:
      - key: http.request.header.authorization
        action: delete
      - key: http.request.header.cookie
        action: delete
      - key: db.statement
        action: hash
```

口径：凭证类属性（Authorization、Cookie）直接 delete，不要留哈希给人猜；语句类内容（db.statement）用 hash 动作替换成摘要，既能按相同语句聚合排查、又不落原文。属性名以应用埋点实际产生的名称为准，上线前用第四节的方法发一条带这些属性的测试数据，在 debug 输出里确认已被删除或哈希，再转生产。

## 四、效果验证与测试

验证思路是本机闭环：不依赖任何真实应用与外部后端，用 curl 向 4318 端口手发三条 OTLP/HTTP 测试数据，分别在日志与指标端点里找到它们，管线即通。以下命令与期望输出均为本章实测口径（0.163.2）。

第一步，看健康检查接口：

```bash
curl http://localhost:13133/
```

期望返回一行 JSON，其中包含 "status":"Server available" 字样。

第二步，发一条测试追踪。先把下面的 OTLP/JSON 存成文件（时间戳为示例值，验证只看管线通不通，不必与当前时刻对齐）：

```bash
cat > /tmp/otlp-trace.json <<'EOF'
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "checkout-test" } }
        ]
      },
      "scopeSpans": [
        {
          "scope": { "name": "chapter-smoke-test" },
          "spans": [
            {
              "traceId": "5b8efff798038103d269b633813fc60c",
              "spanId": "eee19b7ec3c1b174",
              "name": "otel-chapter-smoke-test",
              "kind": 1,
              "startTimeUnixNano": "1792742400000000000",
              "endTimeUnixNano": "1792742401000000000"
            }
          ]
        }
      ]
    }
  ]
}
EOF
curl -s -X POST http://localhost:4318/v1/traces -H "Content-Type: application/json" -d @/tmp/otlp-trace.json
```

期望返回 {"partialSuccess":{}}，表示整条被接受（有部分被拒时这里会写明数量与原因）。等 batch 的 5 秒窗口过后看日志：

```bash
journalctl -u otelcol-contrib -n 100 --no-pager | grep -A 3 "service.name"
```

期望在 debug 导出器的输出里看到 Resource attributes 一行 -> service.name: Str(checkout-test)，其后 Span 的 Name 为 otel-chapter-smoke-test。服务名与 Span 名都对，追踪管道通过。

第三步，发一条测试指标并接回 Prometheus：

```bash
cat > /tmp/otlp-metric.json <<'EOF'
{
  "resourceMetrics": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "checkout-test" } }
        ]
      },
      "scopeMetrics": [
        {
          "scope": { "name": "chapter-smoke-test" },
          "metrics": [
            {
              "name": "chapter.test.requests",
              "sum": {
                "aggregationTemporality": 2,
                "isMonotonic": true,
                "dataPoints": [
                  {
                    "asInt": "7",
                    "startTimeUnixNano": "1792742400000000000",
                    "timeUnixNano": "1792742401000000000"
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
EOF
curl -s -X POST http://localhost:4318/v1/metrics -H "Content-Type: application/json" -d @/tmp/otlp-metric.json
sleep 6
curl -s http://localhost:8889/metrics | grep chapter
```

期望最后一行输出为 chapter_test_requests_total{job="checkout-test",otel_scope_name="chapter-smoke-test",otel_scope_schema_url="",otel_scope_version=""} 7：点号被转成下划线、计数型指标带 `_total` 后缀是 Prometheus 导出器的既定行为，job 标签等于测试服务名证明 service.name 已正确映射。然后把这个端点加进第 2 章的 Prometheus 抓取配置（改前按第 2 章纪律先备份 prometheus.yml）：

```yaml
  - job_name: "otel-collector"
    static_configs:
      - targets:
          - "localhost:8889"
```

promtool check config 校验通过后 reload Prometheus，在其 Targets 页面确认 otel-collector 为 UP，再到 Grafana 用 chapter_test_requests_total 查到这条数据，指标管道即与既有栈打通。

第四步，发一条测试日志，路径与第二步同构：把 resourceLogs 结构（含同一 service.name 与一条正文为 otel chapter smoke test log 的 logRecords）POST 到 http://localhost:4318/v1/logs ，期望同样返回 {"partialSuccess":{}}，随后在 journalctl 输出的 LogRecord 里能看到 Body: Str(otel chapter smoke test log)。日志管道走 debug 只是验证形态，生产去向按 3.2 节末尾换成 Loki 的 OTLP 入口。

四步全过，本机闭环成立。真实应用接入后重复第二步的观察点（日志里出现该应用的 service.name 与 Span）做逐服务验收，不要等所有服务都接完才第一次看数据。

## 五、常见错误与排坑指南

场景一：应用报连接失败，Collector 日志里也毫无动静。十有八九是协议与端口对错位：gRPC 的 SDK 连了 4318、或 HTTP 的连了 4317，两边协议对不上时接收器直接拒绝，表面看就像没发过。先对着 3.4 节核对端点与协议的搭配，再用第四节的 curl 命令从应用机上发一条，能通说明网络与 Collector 都没问题，问题在应用配置。

场景二：数据进来了，但 Prometheus 里按服务查不到。先看 8889 端点的原始输出里 job 标签是什么：若是 unknown_service 开头，是应用没设 OTEL_SERVICE_NAME，回 3.4 节补；若标签正确但 Prometheus 查不到，是抓取配置没加或没 reload，按第四节第三步补齐并在 Targets 页面确认 UP；若 8889 本身没有这条指标，看指标管道是否把 prometheus 导出器写进了 pipelines——只在 exporters 段定义、管道没引用是最常见的漏写。

场景三：Collector 内存持续上涨甚至被系统杀掉。先确认 memory_limiter 在配置里且排在每条管道处理器的第一位，上限值明显高于机器可承受范围等于没配；再看 8888 自监控口里处理器拒绝与丢弃相关的计数是否在涨，涨说明上游量已超过下游处理能力，要么扩 Collector 资源、要么按 3.5 节上采样，不要靠调大 batch 的队列硬扛。

场景四：改了配置重启后服务起不来。改前没跑 validate 是主因。journalctl 看第一条报错定位到具体组件与字段，改回或用 3.1 节的备份覆盖恢复：

```bash
sudo cp /etc/otelcol-contrib/config.yaml.bak-20260101 /etc/otelcol-contrib/config.yaml
sudo otelcol-contrib validate --config=/etc/otelcol-contrib/config.yaml
sudo systemctl restart otelcol-contrib
```

（备份文件名按你改前实际执行的那次备份替换。）纪律重申：任何配置变更都是「备份、改、validate、重启」四步，缺一不可。

场景五：验证通过后日志被 debug 输出刷满、磁盘涨得快。detailed 级别的 debug 导出器会打印每条数据的全文，它是验证工具不是生产组件。上线前把 verbosity 改成 basic 只留计数汇总，或直接把 traces 与 logs 管道的导出器换成真实后端、摘掉 debug；改完按场景四的四步纪律重启并复查日志速率。

## 六、生产环境最佳实践与安全建议

第一，接收端口绝不裸奔公网。4317 与 4318 默认无认证，谁能连上谁就能往你的监控与日志里灌任意数据，既污染数据又能打存储。防火墙只放行应用网段，主机侧示例：

```bash
sudo ufw allow from 192.0.2.0/24 to any port 4317 proto tcp
sudo ufw allow from 192.0.2.0/24 to any port 4318 proto tcp
sudo ufw status numbered
```

网段按真实应用网段替换；8889、13133、8888 三个口只对本机与监控、运维网段开放，口径同表见第二节。

第二，跨机器传输要加密。应用与 Collector 不在同一信任域时，给 otlp 接收器配 TLS（receivers.otlp.protocols 下的 tls_settings 段引用证书与私钥文件），或让流量走既有内网与隧道；证书的签发与轮换按第 02 部分证书生命周期一章的纪律管理，本章不重复展开。

第三，保持非 root 运行与最小权限。官方包的单元已用专用用户 otelcol-contrib 运行，不要为了读某个文件方便就改回 root；配置文件里若引用了证书、口令文件，按属主与 600 权限单独授权给该用户。

第四，配置纳入版本管理。config.yaml（不含任何口令明文）提交私有 Git 仓库，每次变更在提交信息里写清动机；上线流程固定为 validate 先行，校验不过不重启。

第五，Collector 自己也要被监控。8888 端口是它给自己的自监控指标口（组件吞吐、队列、拒绝计数），把这个口加进第 2 章 Prometheus 的抓取，并在主监控之外保留第 5 章说的独立健康探针，Collector 挂掉时要有人知道「接入层挂了」，而不是等报表缺数据才发现。

第六，成本按月评审。采样策略、日志保留与属性基数是遥测成本的三个总闸，口径与第 5 章告警月度评审合并进行；新服务接入先走第四节验收、再看一周量级，异常膨胀当周处理，不要攒到账单与磁盘告警时才回头查。

### 回滚与恢复：摘除 Collector，回到接入前形态

Collector 是旁路组件：它只转发、不持有业务数据的权威副本，摘除它不涉及任何数据迁移，既有后端里已经落库的历史数据也不受影响；摘除只影响摘除之后的新数据接入。按与安装相反的顺序摘除：

第一步，先动应用侧。把各应用的 OTel 埋点开关关掉，或把 OTEL_EXPORTER_OTLP_ENDPOINT 改回接入前的上报方式（原本直连后端的改回直连、原本没有的直接下线变量），逐服务发版生效。这一步必须在停 Collector 之前完成，反过来做会让应用在一段时间内把数据发向一个不存在的地址、刷满错误日志。

第二步，确认既有栈不受影响。第 2 章 Prometheus 对 Node Exporter 等原有目标的抓取、第 3 章 Loki 原有采集链路都不经过 Collector，逐项看一眼 Targets 与日志流入正常；第四节里加进 prometheus.yml 的 otel-collector 抓取目标则要同步摘掉（备份、删除该 job、promtool 校验、reload），否则会多出一个长期 DOWN 的目标。

第三步，停用并移除 Collector：

```bash
sudo systemctl disable --now otelcol-contrib
sudo apt remove -y otelcol-contrib
```

配置文件与 3.1 节的留底先拷一份到 /root 或配置仓库再移除，不要连回滚依据一起删。

第四步，回收防火墙规则。按第一节上架时加的顺序，用 sudo ufw status numbered 找到 4317、4318、8889 的放行规则编号并逐条 delete，删完再 status 一遍确认无残留。

摘除验证：ss -tlnp 里不再有 4317、4318、8889、13133 的监听；Prometheus Targets 无新增 DOWN；各应用错误日志里没有连不上 OTLP 端点的报错。三条都成立，接入层才算干净退出，日后要重新接入按第三节顺序重装即可。
