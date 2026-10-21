# 本地大模型运维助手（Ollama + Open WebUI）

## 一、概述与使用场景

运维排错时最常做的事，是把一段看不懂的日志、一串报错，翻译成「出了什么问题、下一步查什么」。过去只能靠经验和搜索引擎；现在可以在自己的服务器上跑一个本地大模型，随时提问，且**日志不出内网、断网也能用、不按次付费**。

本地大模型运维助手的典型场景：

- **日志解读**：把 `journalctl`、Nginx、systemd 的报错贴给模型，让它解释含义并给出排查方向。
- **命令释义**：遇到不熟悉的命令参数组合，先问模型再上手，避免误操作。
- **脚本起草**：让模型起草 Shell/Python 小脚本的初稿，人工修改后在测试机验证。
- **故障复盘辅助**：把故障时间线喂给模型，辅助整理复盘报告的结构。

不部署本地模型的瓶颈与风险：使用云端 AI 时，生产日志必须先脱敏再上传（见 [02 云端 AI CLI 助手](02-ai-cli.md)），流程繁琐且仍有合规顾虑；完全不用 AI 时，排错效率依赖个人经验积累，新人上手慢。本地模型的代价是占用磁盘、内存/显存，且能力弱于顶级云端模型——它适合做「第一响应助手」，复杂问题仍需人工判断或结合云端工具。

本章工具链：**Ollama** 负责模型下载、加载与 API 服务（默认端口 11434），**Open WebUI** 提供浏览器聊天界面，通过 Docker 部署。

!!! note "本地模型与云端 AI 如何分工"
    本地模型：处理含敏感信息的日志、离线场景、高频简单问题。云端 AI CLI：处理复杂脚本起草、长上下文分析。两者的安全通则见第 02 章，本章聚焦本地部署。

## 二、环境准备与前置条件

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Ubuntu 22.04 LTS 或 24.04 LTS（本章命令在两者上通用） |
| 权限 | 一个可 `sudo` 的普通用户（示例用 `ubuntu` / `opsadmin`） |
| CPU/内存 | 最低 4 核 8GB 可跑小参数模型；推荐 16GB 以上内存 |
| 显存（可选） | 有 NVIDIA GPU 时推理速度显著提升；无 GPU 用 CPU 推理亦可，只是较慢 |
| 磁盘 | 至少预留 20GB：单个 7B/8B 量化模型约 4~5GB，多备几个模型需更多 |
| 软件 | `curl`、`tar`；部署 Open WebUI 需 Docker（见第 05 部分容器章节） |

检查系统与资源：

```bash
lsb_release -a
free -h
df -h /
nproc
# 如有 NVIDIA 显卡，再执行：
nvidia-smi
```

安装基础依赖：

```bash
sudo apt update
sudo apt install -y curl tar ca-certificates
```

确认 Docker 可用（仅 Open WebUI 步骤需要）：

```bash
docker --version
docker compose version
sudo systemctl status docker --no-pager
```

!!! warning "先确认磁盘与内存再下模型"
    模型文件按 GB 计。在小内存机器上加载超出内存的模型会触发 OOM、拖垮同机业务。先按第三节的选型表选模型，不要盲目拉最大的。

## 三、手把手操作步骤

### 3.1 安装 Ollama：先审脚本，再决定安装路线

Ollama 官方提供一键安装脚本。**一键脚本的正确用法是先下载、审阅、再执行**，不要不看内容直接管道给 shell。

```bash
# 第一步：只下载，不执行
curl -fsSL https://ollama.com/install.sh -o /tmp/ollama-install.sh

# 第二步：审阅脚本内容，确认它只做下载二进制、创建 systemd 服务等预期动作
less /tmp/ollama-install.sh

# 第三步：确认无误后执行
sudo sh /tmp/ollama-install.sh
```

脚本路线说明：官方脚本会把 `ollama` 二进制装到 `/usr/local/bin/`，创建 `ollama` 系统用户，并注册 systemd 服务 `ollama.service`，开箱即有保活（见 3.5 节）。

如果你的环境不允许执行外部脚本，可走**二进制手动路线**：从 Ollama 官方发布页下载对应架构的压缩包，解压后把二进制放到 `/usr/local/bin/`，再按 3.5 节的 unit 结构自行编写 systemd 服务文件。两条路线的后续使用完全一致。下载地址与最新版本以 ollama.com 官方页面为准。

```bash
ollama --version
sudo systemctl status ollama --no-pager
```

### 3.2 模型管理与选型

```bash
# 拉取模型（以官方模型库常见模型为例，名称与版本以 ollama.com 模型库为准）
ollama pull llama3.1:8b
ollama pull qwen2.5:7b

# 查看本地已有模型及其占用
ollama list

# 交互运行一个模型（输入 /bye 退出）
ollama run llama3.1:8b

# 查看正在运行（已加载到内存/显存）的模型
ollama ps

# 删除不再需要的模型，释放磁盘
ollama rm qwen2.5:7b
```

模型选型参考（量化版本，实际占用以 `ollama list` 输出为准）：

| 模型规模 | 约需内存/显存 | 适用机器 | 运维助手表现 |
| --- | --- | --- | --- |
| 3B 级（如 llama3.2:3b） | 约 2~4GB | 8GB 内存小机器 | 简单问答、命令释义可用，复杂日志分析偏弱 |
| 7B/8B 级（如 qwen2.5:7b、llama3.1:8b） | 约 5~8GB | 16GB 内存或 8GB 显存 | 本章推荐档位：日志解读、脚本起草够用 |
| 14B 级（如 qwen2.5:14b） | 约 10~12GB | 32GB 内存或 12GB 以上显存 | 推理更好，速度更慢 |
| 32B 及以上 | 20GB 以上 | 大内存服务器/多卡 | 接近云端小模型体验，资源成本高 |

非交互调用 API（后续排错工作流与脚本集成都基于它）：

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "用一句话解释 Linux 的 load average 是什么",
  "stream": false
}'
```

### 3.3 用 Docker 部署 Open WebUI

先备份可能存在的旧编排文件：

```bash
mkdir -p ~/open-webui
cp ~/open-webui/docker-compose.yml ~/open-webui/docker-compose.yml.bak.$(date +%F) 2>/dev/null || echo "无旧文件，跳过备份"
```

编写 `~/open-webui/docker-compose.yml` 完整内容：

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    # 不映射 11434 到宿主机端口：仅供同 compose 网络内的 open-webui 访问
    expose:
      - "11434"

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    restart: unless-stopped
    depends_on:
      - ollama
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - open_webui_data:/app/backend/data
    ports:
      # 只绑本机回环：外网无法直连，需要时通过 SSH 隧道或内网反向代理访问
      - "127.0.0.1:3000:8080"

volumes:
  ollama_data:
  open_webui_data:
```

关键参数讲解：

| 参数 | 说明 |
| --- | --- |
| `127.0.0.1:3000:8080` | 端口只绑回环地址是安全底线。若确需内网访问，改为绑定内网地址如 `192.0.2.10:3000:8080`（此处为文档示例地址，请替换为你的内网地址写法并配合防火墙），**不要**写成 `3000:8080` 直接暴露到所有网卡 |
| `OLLAMA_BASE_URL` | WebUI 通过 Docker 内部网络访问 Ollama 服务名 `ollama`，因此 Ollama 无需对宿主机开端口 |
| `open_webui_data` 卷 | 存放账号、聊天记录与配置，删容器不丢数据 |
| `ollama_data` 卷 | 存放已拉取的模型，避免重建容器后重新下载 |
| `restart: unless-stopped` | 宿主机重启后自动恢复服务 |

!!! warning "本节 Docker 版 Ollama 与 3.1 的宿主机 Ollama 二选一"
    若已按 3.1 在宿主机装了 Ollama，可删掉 compose 中的 `ollama` 服务，并把 `OLLAMA_BASE_URL` 改为 `http://host.docker.internal:11434`，同时给 `open-webui` 增加 `extra_hosts: ["host.docker.internal:host-gateway"]`。不要两套同时跑，会争抢内存且模型各存一份。

启动并查看状态：

```bash
cd ~/open-webui
docker compose up -d
docker compose ps
docker compose logs -f open-webui
```

浏览器访问方式（在你的办公电脑执行 SSH 隧道）：

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@192.0.2.10
# 然后在本机浏览器打开 http://127.0.0.1:3000 ，首次访问注册的账号即为管理员
```

### 3.4 Ollama systemd 保活与环境变量

官方脚本安装的 Ollama 已带 systemd 服务。查看与管理：

```bash
sudo systemctl status ollama --no-pager
sudo systemctl enable ollama
sudo journalctl -u ollama -f
```

如需修改环境变量（例如模型存放路径、并发），**先备份 unit，再用 override 机制改**，不要直接改主 unit 文件：

```bash
sudo cp /etc/systemd/system/ollama.service /etc/systemd/system/ollama.service.bak.$(date +%F) 2>/dev/null || sudo cp /lib/systemd/system/ollama.service /tmp/ollama.service.bak.$(date +%F)
sudo systemctl edit ollama
```

在打开的 override 编辑区写入：

```ini
[Service]
Environment="OLLAMA_MODELS=/data/ollama-models"
Environment="OLLAMA_NUM_PARALLEL=2"
```

保存后重载生效：

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
systemctl show ollama -p Environment
```

常用环境变量说明：

| 变量 | 作用 | 建议 |
| --- | --- | --- |
| `OLLAMA_HOST` | 服务监听地址，默认 `127.0.0.1:11434` | 保持默认；确需内网访问再改内网地址并配防火墙 |
| `OLLAMA_MODELS` | 模型存储目录 | 磁盘紧张时指到大分区 |
| `OLLAMA_NUM_PARALLEL` | 并行请求数 | 按内存量力而行，过大易 OOM |
| `OLLAMA_KEEP_ALIVE` | 模型在内存中保活时长，如 `30m` | 高频使用可调长，减少重复加载 |

!!! warning "OLLAMA_HOST 监听范围的安全警告"
    把 `OLLAMA_HOST` 改成 `0.0.0.0:11434` 等于把**无鉴权**的模型 API 暴露给所有能连通这台机器的网络：任何人都能调用、耗尽你的算力，还能通过接口枚举模型。生产环境保持 `127.0.0.1` 默认监听；确需共享时，只绑内网地址、加防火墙白名单，或在前面套带鉴权的反向代理。

### 3.5 本地模型辅助排错工作流示例

完整流程：**贴日志 → 先脱敏 → 结构化提问 → 人工核验命令 → 执行并回填结果**。示例：SSH 服务启动失败。

第一步，收集日志（只读操作，可直接执行）：

```bash
sudo systemctl status ssh --no-pager
sudo journalctl -u ssh -n 50 --no-pager
```

第二步，脱敏：把日志中的真实 IP、主机名替换为文档示例值（如 `192.0.2.10`、`server-a.example.com`）后再发送。本地模型虽不出内网，也应养成习惯，脱敏清单见 [02 章脱敏清单](02-ai-cli.md)。

第三步，向本地模型提问（提示词要带上下文与约束）：

```text
你是 Linux 运维助手。系统是 Ubuntu 24.04，sshd 启动失败，日志如下：
（粘贴脱敏后的 journalctl 输出）
请：1) 用一句话说明最可能的根因；2) 给出排查命令清单，每条注明作用；
3) 不要给出删除文件、重装服务类不可逆操作。
```

第四步，人工核验：模型通常会建议检查配置语法——这条命令要先理解再执行：

```bash
# 核验：sshd -t 只做配置语法检查，不重启服务，属于安全只读操作
sudo sshd -t
# 若输出指出某行错误，先备份再修改配置
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F-%H%M)
sudo nano /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl restart ssh
```

第五步，把修复结果回填给模型做复盘总结，并把全过程记入运维日志。**原则不变：模型建议的每条写操作命令，都要过「看得懂、在测试机或只读方式验证过」这一关。**

## 四、效果验证与测试

```bash
# 1. 服务状态：应显示 active (running)
sudo systemctl status ollama --no-pager

# 2. API 健康检查：返回版本号 JSON
curl http://127.0.0.1:11434/api/version

# 3. 模型列表：能看到已拉取模型
ollama list

# 4. 实际推理测试：能返回中文回答即链路通
ollama run llama3.1:8b "用两句话说明 df 和 du 的区别"

# 5. WebUI 容器状态：两个容器均为 Up
cd ~/open-webui && docker compose ps
```

期望输出示例（节选）：

```text
$ curl http://127.0.0.1:11434/api/version
{"version":"0.x.x"}

$ ollama list
NAME            ID              SIZE    MODIFIED
llama3.1:8b     46e0c10c039e    4.9 GB  2 hours ago
```

## 五、常见错误与排坑指南

**场景 1：`ollama run` 报显存/内存不足**

```text
Error: llama runner process has terminated: error loading model: cudaMalloc failed: out of memory
```

原因：所选模型规模超过可用显存/内存。修复：改用更小模型（如 `llama3.2:3b`），或关闭同机其他占内存服务后重试：

```bash
ollama pull llama3.2:3b
ollama run llama3.2:3b
free -h
```

**场景 2：外部机器连不上 11434**

```text
curl: (7) Failed to connect to 192.0.2.10 port 11434: Connection refused
```

原因：Ollama 默认只监听 `127.0.0.1`，这本身是安全设计而非故障。修复：优先用 SSH 隧道 `ssh -L 11434:127.0.0.1:11434 ubuntu@192.0.2.10` 访问；确需直连时按 3.4 节把 `OLLAMA_HOST` 改为内网地址，并同步配置防火墙白名单后重启服务。

**场景 3：Open WebUI 打开后没有可选模型**

```text
（WebUI 模型下拉为空，容器日志出现）Failed to connect to Ollama: Name or service not known
```

原因：`OLLAMA_BASE_URL` 写错，或 WebUI 与 Ollama 不在同一 compose 网络。修复：核对 compose 中地址为 `http://ollama:11434`，重建容器：

```bash
cd ~/open-webui
docker compose down
docker compose up -d
docker compose exec open-webui curl -s http://ollama:11434/api/version
```

## 六、生产环境最佳实践与安全建议

- **监听最小化**：Ollama 保持回环监听，WebUI 只绑 `127.0.0.1` 或受控内网，统一经 SSH 隧道/带鉴权的反向代理访问，并用 UFW 只放行必要来源。
- **资源隔离**：模型服务与核心业务同机时，用 systemd 的 `MemoryMax`、cgroup 或独立机器限制其资源上限，防止推理把业务挤到 OOM。
- **模型来源可信**：只从 Ollama 官方模型库拉取模型，记录每个模型的名称、标签与上线日期；升级前先在测试机验证回答质量。
- **账号与数据**：Open WebUI 首个注册账号即管理员，注册完成后在管理设置中关闭公开注册；聊天记录含排错细节，按敏感数据同等保管。
- **命令纪律**：本地模型同样会「一本正经地编造」参数。所有写操作命令执行前人工核验，危险命令按本部分导览的二次确认原则处理。
- **备份**：定期备份 `open_webui_data` 与 `ollama_data` 数据卷、compose 文件与 systemd override，纳入整机备份策略。
