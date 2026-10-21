---
description: "日志分散在每台机器的本地文件里时，排障要逐台登录、逐个文件翻找，跨服务的调用链根本拼不起来。集中式日志收集把所有机器的日志实时汇聚到一处，用统一的查询界面按时间、主机、服务、关键字检索，"
---

# 集中式日志收集

## 一、概述与使用场景

日志分散在每台机器的本地文件里时，排障要逐台登录、逐个文件翻找，跨服务的调用链根本拼不起来。集中式日志收集把所有机器的日志实时汇聚到一处，用统一的查询界面按时间、主机、服务、关键字检索，这是从单机运维走向多机运维的分水岭。

使用场景主要有三类。第一类是故障溯源：接口报错后按请求标识或时间窗口，一次查出网关、应用、数据库三层的相关日志。第二类是安全审计：集中保存 SSH 登录、sudo 提权、权限拒绝等记录，单机被入侵后本地日志可能被删，集中端仍有副本。第三类是运营分析：统计错误量趋势、慢请求分布，为第 2 章的告警补上日志维度的证据。

不做集中收集的风险：日志随机器重建而丢失，保留周期各机不一致，磁盘写满时应用与日志互相拖累。更现实的瓶颈是磁盘：一台高流量应用一天可产生数 GB 日志，无规划的保留会在几周内吃满根分区。本章在给出落地方案的同时，专门用一节讲保留与磁盘规划，先算账再上线。

## 二、环境准备与前置条件

- 日志中心一台：Ubuntu Server 22.04 LTS 或 24.04 LTS，建议 2 核 CPU、4 GB 内存起步，独立数据盘更佳，地址示例为 192.0.2.30。
- 日志来源一到多台：Ubuntu Server 22.04 或 24.04，地址示例为 192.0.2.31。
- 权限：可使用 sudo 的账号 ubuntu。
- 端口：Loki 接收与查询使用 3100，Grafana 使用 3000（已在第 2 章安装时可复用同一台 Grafana），Vector 向 Loki 推送走 HTTP。
- 前置：第 2 章的 Grafana 已可用，本章只新增 Loki 数据源，不重复安装 Grafana。
- 组件版本：均为撰写时最新稳定版，安装时到官方发布页选取对应压缩包或软件源。

方案对比先行，选型理由放在第三节开头，环境准备阶段只需确认中心机磁盘：

```bash
df -h
free -h
lsblk
```

确认数据目录所在分区有足够空间，并记录可用容量，后面做保留测算时要用。

## 三、手把手操作步骤

### 3.1 架构对比与选型结论

| 方案 | 组成 | 资源占用 | 查询能力 | 运维成本 | 适合场景 |
| --- | --- | --- | --- | --- | --- |
| ELK | Elasticsearch 加 Logstash 加 Kibana | 高，内存常以数 GB 起步 | 全文检索最强 | 高，需调 JVM 与分片 | 大规模全文检索与合规分析 |
| EFK | Elasticsearch 加 Fluentd 加 Kibana | 高，同 ELK 量级 | 全文检索强 | 高 | 已有 Fluentd 体系的团队 |
| Loki 加 Vector 加 Grafana | Loki 存储加 Vector 采集加 Grafana 查询 | 低，单机小内存可跑 | 按标签加 LogQL 过滤，正文不建全文索引 | 低，与监控共用 Grafana | 中小规模、重运维排障的团队 |
| Loki 加 Promtail 加 Grafana | Loki 存储加 Promtail 采集加 Grafana 查询 | 低 | 同上 | 低 | 来源以 systemd 日志与文件为主 |

选型结论：本章主线选 Loki 加 Vector 加 Grafana。理由有三：一是 Loki 只给标签建索引，存储与内存成本远低于 Elasticsearch；二是 Vector 一个二进制同时支持文件、journald、syslog 等多种来源，规则处理能力强于 Promtail；三是查询入口与第 2 章共用 Grafana，团队只学一个界面。若你的来源非常单一、只想最快跑通，Promtail 配置更短，本章在 3.4 节给出等价的 Promtail 关键配置段供替换，二选一即可，不要在同一台来源机上同时装两个采集器。

### 3.2 在日志中心安装 Loki

创建用户与目录：

```bash
sudo useradd --no-create-home --shell /usr/sbin/nologin loki
sudo mkdir -p /etc/loki /var/lib/loki
cd /tmp
curl -LO https://github.com/grafana/loki/releases/download/vX.Y.Z/loki-linux-amd64.zip
sudo apt install -y unzip
unzip loki-linux-amd64.zip
sudo cp loki-linux-amd64 /usr/local/bin/loki
sudo chown -R loki:loki /etc/loki /var/lib/loki /usr/local/bin/loki
```

改配置前先备份的习惯从首次开始：本步为首次创建，写入前先确认目标文件不存在，存在则先备份再覆盖。

```bash
ls -l /etc/loki/config.yaml
sudo cp /etc/loki/config.yaml /etc/loki/config.yaml.bak-20260101
```

上面两条中，第二条仅在文件已存在时执行。配置文件路径为 /etc/loki/config.yaml，完整内容如下：

```yaml
auth_enabled: false

server:
  http_listen_address: 0.0.0.0
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /var/lib/loki
  storage:
    filesystem:
      chunks_directory: /var/lib/loki/chunks
      rules_directory: /var/lib/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 336h
  reject_old_samples: true
  reject_old_samples_max_age: 168h

compactor:
  working_directory: /var/lib/loki/compactor
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  delete_request_store: filesystem
```

逐项讲解：

| 配置项 | 含义 | 本章取值说明 |
| --- | --- | --- |
| auth_enabled | 是否开启多租户鉴权 | 单机自用设为 false，多团队共用必须开启 |
| server.http_listen_port | 接收与查询端口 | 3100，与 Grafana 数据源对应 |
| common.path_prefix | 数据根目录 | 必须位于已规划的大分区上 |
| replication_factor | 副本数 | 单机部署为 1，集群部署再调大 |
| schema_config.store | 索引存储类型 | tsdb 为当前推荐类型 |
| limits_config.retention_period | 日志保留时长 | 336h 即 14 天，测算见 3.5 节 |
| compactor.retention_enabled | 是否执行到期删除 | 必须为 true，否则只写不删 |

写入 systemd 服务文件 /etc/systemd/system/loki.service，完整内容：

```ini
[Unit]
Description=Grafana Loki Log Aggregation
Wants=network-online.target
After=network-online.target

[Service]
User=loki
Group=loki
Type=simple
ExecStart=/usr/local/bin/loki -config.file=/etc/loki/config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loki
curl http://localhost:3100/ready
```

期望输出为 ready 字样。

### 3.3 在来源机安装 Vector 并推送日志

Vector 采用官方 apt 源安装：

```bash
curl -1sLf https://setup.vector.dev | sudo -E bash
sudo apt install -y vector
sudo systemctl enable --now vector
```

先备份默认配置，再写入本章配置：

```bash
sudo cp /etc/vector/vector.yaml /etc/vector/vector.yaml.bak-20260101
```

配置文件路径为 /etc/vector/vector.yaml，完整内容如下（本例采集应用文件日志与 systemd 日志两路）：

```yaml
data_dir: /var/lib/vector

sources:
  app_file:
    type: file
    include:
      - /var/log/app/*.log
    read_from: end
  host_journal:
    type: journald
    current_boot_only: false

transforms:
  app_parsed:
    type: remap
    inputs:
      - app_file
    source: |
      .host = get_hostname()
      .service = "app"
      .level = "info"

sinks:
  loki_out:
    type: loki
    inputs:
      - app_parsed
      - host_journal
    endpoint: http://192.0.2.30:3100
    encoding:
      codec: json
    labels:
      host: "{{ host }}"
      job: "server-logs"
    healthcheck:
      enabled: true
```

逐项讲解：sources.app_file.include 为采集文件路径列表，按你的应用实际日志路径增删；read_from 为 end 表示只采新增内容，首次接入想补历史数据时改为 beginning；transforms 中的 remap 给每条日志补上 host 与 service 字段，标签设计原则是只放低基数维度如主机、服务、环境，正文中的请求号、用户号绝不能做标签，否则标签组合爆炸会拖垮 Loki；sinks.endpoint 为日志中心地址；labels 为写入 Loki 的标签集合。

应用日志目录不存在时先创建并给权限示例：

```bash
sudo mkdir -p /var/log/app
sudo chown ubuntu:ubuntu /var/log/app
sudo systemctl restart vector
vector validate /etc/vector/vector.yaml
```

期望 validate 输出 Validated 字样。注意 Vector 服务默认以 vector 用户运行，对 /var/log/app 与 journal 的读取权限不足时日志会报 permission denied，按第五节处理。

### 3.4 Promtail 替代配置要点（与 Vector 二选一）

若选 Promtail，在来源机安装二进制后，配置文件 /etc/promtail/config.yaml 的核心段如下，其余 server 与 positions 段按官方示例补齐 clients 的 url 指向 http://192.0.2.30:3100/loki/api/v1/push ：

```yaml
clients:
  - url: http://192.0.2.30:3100/loki/api/v1/push

scrape_configs:
  - job_name: app
    static_configs:
      - targets:
          - localhost
        labels:
          job: server-logs
          host: app-01
          __path__: /var/log/app/*.log
```

标签同样只放 host 与 job 这类低基数维度。Promtail 适合来源单一的场景，复杂解析与多路汇聚仍建议回 Vector。

### 3.5 日志保留与磁盘规划

先测算再定保留天数。单机日增量估算方法：在来源机统计一天的日志增量。

```bash
sudo du -sh /var/log/app
journalctl --disk-usage
```

测算示例（数字为演示用的假设值，替换为你的实测值）：单机应用日志每天 0.5 GB，journal 每天 0.2 GB，5 台来源机合计每天约 3.5 GB 原始量；Loki 压缩后按原始量的三分之一估算，约每天 1.2 GB；保留 14 天约占 17 GB，再预留一半余量，数据盘准备 40 GB 即足够。若实测日增量翻倍，要么把保留改到 7 天，要么扩盘，二选一必须在上线前定好，不要等写满再处理。

配套动作有三个。第一，给 /var/lib/loki 用独立分区或独立数据盘，写满时只影响日志不影响业务。第二，来源机本地也要配 logrotate 兜底，集中链路中断时本地不至于无限堆积：

```bash
sudo cp /etc/logrotate.d/rsyslog /etc/logrotate.d/rsyslog.bak-20260101
```

编辑前先备份如上，应用自有日志在 /etc/logrotate.d/app 中写明 daily、rotate 7、compress、missingok、notifempty 五个指令即可。第三，在第 2 章的 Prometheus 中给日志中心加一条磁盘使用率告警，复用已有规则模式，阈值设为 80 percent 时提前通知。

!!! warning "保留不是越长越好"
    保留时长每翻一倍，磁盘与备份成本同步翻倍。排障日志保留 14 天、审计类日志按合规要求单独归档到对象存储，是成本与可用性的常见平衡点，不要把所有日志都按最长周期留在热存储里。

### 3.6 在 Grafana 中接入 Loki 并查询

操作顺序：进入 Connections 下的 Data sources，点击 Add data source 选择 Loki，URL 填 http://192.0.2.30:3100（与 Grafana 同机时填 http://localhost:3100），点击 Save and test 出现成功提示。进入 Explore 页面，数据源选 Loki，输入下面的 LogQL 查询验证：

```text
{job="server-logs", host="app-01"}
```

带关键字过滤的写法是在表达式后加管道过滤，下面的示例查包含 ERROR 的行：

```text
{job="server-logs"} |= "ERROR"
```

统计每分钟错误数的写法：

```text
sum(count_over_time({job="server-logs"} |= "ERROR" [1m]))
```

把常用查询保存为仪表盘面板，与第 2 章的指标面板放在同一个仪表盘中，故障时上下对照时间轴，效率最高。

## 四、效果验证与测试

第一步看服务状态与就绪接口：

```bash
sudo systemctl status loki vector
curl http://192.0.2.30:3100/ready
curl http://192.0.2.30:3100/metrics
```

期望 ready 返回 ready，metrics 能返回以 loki_ 开头的指标行。

第二步做端到端写入测试。在来源机写入一条带唯一标记的日志：

```bash
echo "LOKI-TEST-20260101-001 end to end check" | sudo tee -a /var/log/app/test.log
sleep 10
curl -s "http://192.0.2.30:3100/loki/api/v1/query_range" --data-urlencode 'query={job="server-logs"} |= "LOKI-TEST-20260101-001"' --data-urlencode 'limit=5' -G
```

期望返回的 JSON 中 result 不为空且能看到该标记行。Grafana Explore 中用同样的 LogQL 也应查到同一条记录，三处一致才算链路打通。

第三步验证保留生效。把测试环境的 retention_period 临时改为较小值并观察旧数据被 compactor 删除的现象，确认机制有效后再改回 336h，改前同样先 cp 备份配置文件。

## 五、常见错误与排坑指南

### 5.1 Vector 启动后无数据且日志报权限拒绝

报错原文片段：

```text
Failed to open file. error=Permission denied (os error 13) file=/var/log/app/test.log
```

原因：Vector 以 vector 用户运行，对应用日志文件或目录没有读权限。修复命令（把 vector 加入日志文件所属组，或给目录加读与执行权限，二选一，优先加组）：

```bash
sudo usermod -aG ubuntu vector
sudo chmod o+x /var/log/app
sudo systemctl restart vector
journalctl -u vector -n 50 --no-pager
```

注意把用户加入组后必须重启服务才生效。

### 5.2 Loki 查询报错条目超出限制

报错原文片段：

```text
the query would return too many results or entry out of order
```

常见伴随信息还有 too many outstanding requests。原因分两种：一是查询时间范围过大且无标签收窄；二是来源机时钟回拨导致日志时间戳乱序被拒收。修复方法：查询时先用 host 与 job 标签收窄范围再加大时间窗；乱序问题先校准来源机时间：

```bash
timedatectl status
sudo timedatectl set-ntp true
sudo systemctl restart vector
```

若仍有乱序，在 Loki 的 limits_config 中按官方说明评估是否放宽乱序窗口，改前先备份 config.yaml 并记录改动原因。

### 5.3 Grafana 中 Loki 数据源测试失败

现象：Save and test 报红色错误，片段为：

```text
Data source connected, but no labels received
```

原因：数据源本身连通但 Loki 中还没有任何数据，多见于刚部署且 Vector 尚未成功推送时。修复顺序：先按第四节做端到端写入测试，确认查询接口能返回数据后，再回 Grafana 重新测试，提示即会变为成功。不要在无数据时反复改数据源地址。

## 六、生产环境最佳实践与安全建议

第一，网络收口。Loki 的 3100 端口只允许来源机网段与 Grafana 所在机器访问，禁止暴露到公网；跨公网传输时必须套 TLS 或走专线与隧道，明文 HTTP 只适用于可信内网。

```bash
sudo ufw allow from 192.0.2.0/24 to any port 3100 proto tcp
sudo ufw status
```

第二，标签纪律。标签只放主机、服务、环境、级别这四类低基数维度，上线前评审标签清单；正文检索靠 LogQL 过滤，不要为了查得快就把高基数字段提升为标签。

第三，采集端缓冲。Vector 的 data_dir 要落在可靠磁盘上，中心端短时不可用时靠本地缓冲续传；同时给 Vector 本身设资源上限，避免日志风暴时采集器抢占业务资源。

第四，敏感信息脱敏。在 Vector 的 remap 中对密码、令牌、身份证号等字段做替换后再发送，集中存储一旦建立，脱敏必须在入口完成，事后清理成本极高。

第五，容量月度复盘。每月看一次 Loki 数据目录增速与实际保留天数是否匹配测算，业务增长后及时在扩盘与缩短保留之间做选择，并把结论记录到运维文档中。

!!! tip "先打通一条再批量推广"
    先用一台来源机跑通采集、传输、查询、保留全链路并稳定运行三天，再批量推广到其余机器。批量同时上线时出问题，很难判断是中心端还是采集端的问题。
