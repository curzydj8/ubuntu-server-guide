---
description: "第 1 章的工具只能看当下。生产环境还需要三件事：指标长期留存、阈值自动通知、多机统一视图。本章的 Prometheus 加 Grafana 加 Alertmanager 组合正是为这三件事设计的开源事实标准。"
---

# 企业级监控栈：Prometheus 与 Grafana

## 一、概述与使用场景

第 1 章的工具只能看当下。生产环境还需要三件事：指标长期留存、阈值自动通知、多机统一视图。本章的 Prometheus 加 Grafana 加 Alertmanager 组合正是为这三件事设计的开源事实标准。

架构分工：Node Exporter 部署在每台被监控机器上，暴露主机指标；Prometheus 在监控机上定时抓取并存入时序数据库；Grafana 连接 Prometheus 做可视化；Alertmanager 对告警做分组、去重与静默，再通过邮件发出通知。

不配这套系统的风险：故障发现靠用户投诉，容量规划靠感觉，复盘时拿不出数据。最典型的教训是磁盘缓慢写满：没有趋势曲线与提前告警时，往往等到服务写不进数据才发现，而 Prometheus 用一条表达式就能在预计四小时后写满时提前通知。本章聚焦单 Prometheus 实例监控数十台主机的标准落地；机器达到数百台时再考虑远程存储与联邦部署。

## 二、环境准备与前置条件

- 监控机一台：Ubuntu Server 22.04 LTS 或 24.04 LTS，建议至少 2 核 CPU、4 GB 内存、50 GB 可用磁盘，地址示例为 192.0.2.20。
- 被监控机一到多台：Ubuntu Server 22.04 或 24.04，地址示例为 192.0.2.21 与 192.0.2.22。
- 权限：所有机器上可使用 sudo 的账号 ubuntu。
- 端口规划：Prometheus 使用 9090，Grafana 使用 3000，Alertmanager 使用 9093，Node Exporter 使用 9100。云防火墙与主机防火墙只放行必要的来源网段，详见第六节。
- 时间同步：所有机器必须开启 NTP 同步，指标时间戳错位会导致曲线错乱与告警误判。

```bash
timedatectl status
sudo timedatectl set-ntp true
```

安装路线说明：Prometheus 无 apt 官方源且社区源版本滞后，故采用官方二进制加 systemd，升级与回滚可控；Grafana 有官方 apt 源故用 apt 安装；Node Exporter 同用二进制加 systemd。二进制均为撰写时最新稳定版，下载时到官方发布页选取即可。

## 三、手把手操作步骤

### 3.1 安装 Prometheus

创建专用系统用户与目录：

```bash
sudo useradd --no-create-home --shell /usr/sbin/nologin prometheus
sudo mkdir -p /etc/prometheus /var/lib/prometheus
```

下载并解压撰写时最新稳定版（文件名中的版本号以发布页实际为准）：

```bash
cd /tmp
curl -LO https://github.com/prometheus/prometheus/releases/download/vX.Y.Z/prometheus-X.Y.Z.linux-amd64.tar.gz
tar -xzf prometheus-X.Y.Z.linux-amd64.tar.gz
cd prometheus-X.Y.Z.linux-amd64
```

安装二进制与自带目录，并修正属主，同时把解压目录中的示例配置留一份作回滚基线：

```bash
sudo cp prometheus promtool /usr/local/bin/
sudo cp -r consoles console_libraries /etc/prometheus/
sudo cp prometheus.yml /etc/prometheus/prometheus.yml.example
sudo chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
```

后续每次修改该文件前，先执行带日期的备份命令 sudo cp /etc/prometheus/prometheus.yml /etc/prometheus/prometheus.yml.bak-20260101 再动手，首次安装跳过备份直接写入。配置文件路径为 /etc/prometheus/prometheus.yml，完整内容如下：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - "localhost:9093"

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  - job_name: "prometheus"
    static_configs:
      - targets:
            - "localhost:9090"

  - job_name: "node"
    scrape_interval: 15s
    static_configs:
      - targets:
            - "192.0.2.20:9100"
          labels:
            instance_name: "monitor-01"
      - targets:
            - "192.0.2.21:9100"
          labels:
            instance_name: "app-01"
```

逐行讲解：

| 配置项 | 含义 | 本章取值说明 |
| --- | --- | --- |
| global.scrape_interval | 默认抓取间隔 | 15 秒，兼顾精度与存储量 |
| global.evaluation_interval | 告警规则计算间隔 | 与抓取间隔一致 |
| alerting.alertmanagers | Alertmanager 地址列表 | 指向本机 9093 端口 |
| rule_files | 告警规则文件路径 | 使用通配符加载 rules 目录 |
| scrape_configs.job_name | 任务名 | node 为主机指标任务名 |
| static_configs.targets | 抓取目标地址与端口 | 每台机器一个条目 |

校验配置并创建 systemd 服务。先校验：

```bash
promtool check config /etc/prometheus/prometheus.yml
```

期望输出包含 SUCCESS 字样。用 sudo 编辑 /etc/systemd/system/prometheus.service，先备份同名旧文件（不存在则跳过备份），写入完整内容：

```ini
[Unit]
Description=Prometheus Monitoring System
Wants=network-online.target
After=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/var/lib/prometheus --storage.tsdb.retention.time=30d --web.console.templates=/etc/prometheus/consoles --web.console.libraries=/etc/prometheus/console_libraries --web.listen-address=0.0.0.0:9090
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

关键参数：storage.tsdb.path 为数据目录；storage.tsdb.retention.time 为保留 30 天，是控制磁盘占用的主开关。启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus
```

### 3.2 安装 Node Exporter（每台被监控机执行）

```bash
sudo useradd --no-create-home --shell /usr/sbin/nologin node_exporter
cd /tmp
curl -LO https://github.com/prometheus/node_exporter/releases/download/vX.Y.Z/node_exporter-X.Y.Z.linux-amd64.tar.gz
tar -xzf node_exporter-X.Y.Z.linux-amd64.tar.gz
sudo cp node_exporter-X.Y.Z.linux-amd64/node_exporter /usr/local/bin/
sudo chown node_exporter:node_exporter /usr/local/bin/node_exporter
```

写入 /etc/systemd/system/node_exporter.service 完整内容：

```ini
[Unit]
Description=Prometheus Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=0.0.0.0:9100
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

启动并验证：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
curl http://localhost:9100/metrics
```

期望输出为大量以 node_ 开头的指标行。

### 3.3 安装 Alertmanager

在监控机上执行。创建用户与目录，下载撰写时最新稳定版：

```bash
sudo useradd --no-create-home --shell /usr/sbin/nologin alertmanager
sudo mkdir -p /etc/alertmanager /var/lib/alertmanager
cd /tmp
curl -LO https://github.com/prometheus/alertmanager/releases/download/vX.Y.Z/alertmanager-X.Y.Z.linux-amd64.tar.gz
tar -xzf alertmanager-X.Y.Z.linux-amd64.tar.gz
sudo cp alertmanager-X.Y.Z.linux-amd64/alertmanager alertmanager-X.Y.Z.linux-amd64/amtool /usr/local/bin/
sudo chown -R alertmanager:alertmanager /etc/alertmanager /var/lib/alertmanager
```

配置文件路径为 /etc/alertmanager/alertmanager.yml，首次写入前若文件已存在先执行备份：

```bash
sudo cp /etc/alertmanager/alertmanager.yml /etc/alertmanager/alertmanager.yml.bak-20260101
```

完整配置如下（邮箱与邮件服务器均为示例，替换为你自己的真实发信配置后再启用，密码通过文件引用而不是写明文）：

```yaml
global:
  smtp_smarthost: "smtp.example.com:587"
  smtp_from: "alert@example.com"
  smtp_auth_username: "alert@example.com"
  smtp_auth_password_file: "/etc/alertmanager/smtp_password"
  smtp_require_tls: true

route:
  receiver: "ops-mail"
  group_by:
    - "alertname"
    - "instance"
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: "ops-mail"
    email_configs:
      - to: "opsadmin@example.com"
        send_resolved: true
```

逐项讲解：smtp_smarthost 为邮件服务器地址与端口；smtp_auth_password_file 指向只含密码一行的文件，避免密码进入配置文件；route.group_by 定义分组维度，同告警名与同实例合并发送；group_wait 为首次等待 30 秒以便聚合突发告警；repeat_interval 为未恢复告警每 4 小时重发；send_resolved 为 true 表示恢复时也发通知。

创建密码文件（权限 600）并用 sudo 编辑写入真实密码一行，再写入服务文件 /etc/systemd/system/alertmanager.service ：

```bash
sudo install -m 600 -o alertmanager -g alertmanager /dev/null /etc/alertmanager/smtp_password
```

```ini
[Unit]
Description=Prometheus Alertmanager
Wants=network-online.target
After=network-online.target

[Service]
User=alertmanager
Group=alertmanager
Type=simple
ExecStart=/usr/local/bin/alertmanager --config.file=/etc/alertmanager/alertmanager.yml --storage.path=/var/lib/alertmanager --web.listen-address=0.0.0.0:9093
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
amtool check-config /etc/alertmanager/alertmanager.yml
sudo systemctl daemon-reload
sudo systemctl enable --now alertmanager
```

### 3.4 编写告警规则

先备份规则目录中的已有文件（首次创建可跳过），再写入 /etc/prometheus/rules/node-alerts.yml 完整内容：

```yaml
groups:
  - name: node-basic
    interval: 30s
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "实例 {{ $labels.instance }} 已失联"
          description: "目标 {{ $labels.instance }} 连续 1 分钟无法抓取，请立即检查主机与 Node Exporter 状态。"
      - alert: HighCpuUsage
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "实例 {{ $labels.instance }} CPU 使用率过高"
          description: "最近 5 分钟平均 CPU 使用率已超过 85 percent，当前值约 {{ $value }}。"
      - alert: DiskWillFillSoon
        expr: predict_linear(node_filesystem_free_bytes{mountpoint="/", fstype!="rootfs"}[6h], 4 * 3600) < 0
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "实例 {{ $labels.instance }} 根分区预计四小时内写满"
          description: "按最近 6 小时增速推算，根分区将在 4 小时内耗尽，请清理或扩容。"
```

校验规则并重载 Prometheus：

```bash
promtool check rules /etc/prometheus/rules/node-alerts.yml
sudo systemctl reload prometheus
```

!!! warning "改配置前先备份"
    每次修改 prometheus.yml、告警规则或 Alertmanager 配置前，都先执行带日期的 cp 备份，再改文件，最后用 promtool 或 amtool 校验通过后才 reload。跳过校验直接重启是生产事故的常见来源。

### 3.5 安装 Grafana 并接入数据源

Grafana 采用官方 apt 源。先安装前置包并导入仓库签名密钥，再添加源：

```bash
sudo apt install -y apt-transport-https software-properties-common wget
sudo mkdir -p /etc/apt/keyrings
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt update
sudo apt install -y grafana
sudo systemctl enable --now grafana-server
```

浏览器访问 http://192.0.2.20:3000 ，首次登录用户名与密码均为 admin，登录后系统会强制要求修改密码，立即改为强密码并妥善保存到密码管理器，不要继续使用默认密码。

接入数据源：在左侧菜单进入 Connections 下的 Data sources，点击 Add data source 选择 Prometheus，URL 填 http://localhost:9090 ，点击 Save and test 出现成功提示即连通。再进入 Dashboards 点击 New 下的 Import，输入仪表盘编号 1860 并 Load，选择该数据源后 Import，即可得到 Node Exporter Full 仪表盘。用顶部的 instance 下拉框切换 192.0.2.21:9100 等目标。

如需限制 Grafana 只监听内网地址，先执行 sudo cp /etc/grafana/grafana.ini /etc/grafana/grafana.ini.bak-20260101 备份，再编辑 /etc/grafana/grafana.ini 的 server 段把 http_addr 改为内网地址，改完执行 sudo systemctl restart grafana-server 生效。对外访问应套反向代理并启用 HTTPS，不要把 3000 端口直接暴露到公网。

## 四、效果验证与测试

第一步看服务状态，执行 sudo systemctl status prometheus alertmanager grafana-server node_exporter 。

期望均为 active (running)。第二步看抓取目标。打开 http://192.0.2.20:9090/targets ，所有目标的 State 应为 UP。

第三步用 PromQL 验证。在 Graph 页面输入下面的表达式并执行：

```text
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

期望返回每台机器一条结果，数值在 0 到 100 之间。

第四步验证告警链路。用 amtool 发送一条测试告警：

```bash
amtool alert add TestAlert instance="192.0.2.21:9100" severity="warning" --alertmanager.url=http://localhost:9093 --annotation=summary="手动测试告警"
```

期望 opsadmin@example.com 在一分钟内收到标题含 TestAlert 的邮件。Grafana 侧打开 1860 仪表盘，各机器曲线连续无断点即为全部通过。

## 五、常见错误与排坑指南

### 5.1 Prometheus 启动失败提示权限拒绝

报错原文片段：

```text
Failed to start prometheus.service: permission denied opening /var/lib/prometheus
```

原因：数据目录属主不是 prometheus 用户，常见于手动用 root 拷贝后未改属主。修复命令：

```bash
sudo chown -R prometheus:prometheus /var/lib/prometheus /etc/prometheus
sudo systemctl restart prometheus
journalctl -u prometheus -n 50 --no-pager
```

### 5.2 目标一直 DOWN 且提示连接被拒绝

在 Targets 页面看到 DOWN，错误信息片段为：

```text
Get "http://192.0.2.21:9100/metrics": dial tcp 192.0.2.21:9100: connect: connection refused
```

原因分两种：被监控机上 Node Exporter 未启动，或主机防火墙未放行 9100。依次修复：

```bash
sudo systemctl status node_exporter
curl http://localhost:9100/metrics
sudo ufw allow from 192.0.2.20 to any port 9100 proto tcp
```

### 5.3 Grafana 登录后数据源测试失败

现象：Save and test 报红色错误，片段为：

```text
HTTP Error Bad Gateway
```

原因：URL 写错或 Prometheus 未运行。Grafana 在服务器本机发起请求，URL 应填 http://localhost:9090 。先在本机验证：

```bash
curl http://localhost:9090/-/healthy
```

期望返回 Prometheus Server is Healthy 字样，再回 Grafana 重新测试。

## 六、生产环境最佳实践与安全建议

第一，端口收口。9100 只允许监控机地址访问，9090 与 9093 只允许运维网段访问，3000 通过反向代理加 HTTPS 对外，ufw 规则示例为 sudo ufw allow from 192.0.2.0/24 to any port 9090 proto tcp ，9093 同理添加，地址按真实网段替换后再执行。

第二，保留时长与磁盘匹配。提前估算日增量并给 /var/lib/prometheus 预留独立分区，避免监控数据挤满根分区。

第三，告警要可行动。每条告警的 description 写清影响与第一步排查动作；阈值上线后观察两周再收紧；维护期用 silence 静默而不是关掉规则。配置文件（不含密码文件）提交私有 Git 仓库，密码文件权限保持 600。最后用外部定时任务请求两个健康检查接口，失败时走独立通道通知。

!!! tip "先少后多"
    上线第一周只启用 InstanceDown 一条高确定性告警，确认通知链路稳定后再逐条加入其余规则。
