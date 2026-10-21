---
description: "软件供应链安全：用 digest 锁定镜像版本，用 cosign 做签名验证，用 syft 生成 SBOM，用 trivy 扫描漏洞，把镜像从拉到部署的每一步都变成可核查的。"
---

# 软件供应链安全：镜像签名、SBOM 与漏洞扫描

## 一、概述与使用场景

本章是「文档核对」级别的操作手册，命令与参数按 cosign、syft、trivy 等工具的上游文档核对整理，适配 Ubuntu 22.04 LTS 与 24.04 LTS；Ubuntu 26.04 标注为「待核验」。文中不写死工具版本号，安装后先用版本命令确认实际版本与参数无异再执行后续步骤。

先把风险模型讲清。容器镜像的风险不在运行那一刻，而在它到达你服务器之前的整条链上，典型有三类：第一，上游镜像被投毒，仓库账号被盗或镜像被替换，同一个标签今天拉到的和昨天不是同一个东西，而部署脚本毫无察觉；第二，基础镜像老旧，半年前构建的基础层里躺着已公开的高危漏洞，应用代码再干净也跟着中招；第三，没人知道镜像里装了什么，出了漏洞事件只能逐台登录翻包列表。本章的四个动作正对这三类风险：digest 锁定解决「拉到的是不是预期的东西」，签名验证解决「是不是可信的人发布的」，SBOM 解决「里面装了什么」，漏洞扫描解决「已知的坑有没有踩中」。

与本部分 [01-docker](01-docker.md) 的分工：那一章讲镜像怎么构建、编排与运行，本章只讲镜像的可信与治理，两章在 digest 锁定上衔接——01 章要求生产固定版本标签，本章再往前一步，固定到内容摘要。只做到「能跑」而跳过本章，等于把信任根交给任何能往仓库推镜像的人。

## 二、环境准备与前置条件

操作环境需要已按 [01-docker](01-docker.md) 装好 Docker Engine 与 Buildx 插件，操作账号需要 `sudo` 权限并能访问目标镜像仓库。本章三个安全工具 cosign、syft、trivy 均为独立二进制，按各自上游官方文档提供的安装方式（官方发布包或官方安装脚本）安装，安装前先审脚本内容，安装后逐一打印版本确认可用：

```bash
cosign version
syft --version
trivy --version
docker buildx version
```

| 工具 | 用途 |
| --- | --- |
| `cosign` | Sigstore 项目的签名工具，给镜像签名并在部署前验签，支持无密钥与密钥对两种模式 |
| `syft` | Anchore 出品的 SBOM 生成工具，盘点镜像内软件包并输出 SPDX 或 CycloneDX 清单 |
| `trivy` | Aqua Security 出品的漏洞扫描器，按漏洞库比对镜像内软件包并分级报告 |
| `grype` | 与 syft 同出 Anchore 的扫描器，可直接消费 SBOM 文件做比对，本章只作替代选项 |

备份说明：本章操作会改动部署侧的版本引用（compose 文件、部署清单中的镜像地址）。动手前先备份现行部署文件，并把当前在跑镜像的 digest 记录在案，这个记录就是 3.5 节回滚的依据：

```bash
sudo cp /srv/demoapp/compose.yaml /srv/demoapp/compose.yaml.bak-2026-01-01
docker compose -f /srv/demoapp/compose.yaml config
docker inspect --format "{{index .RepoDigests 0}}" registry.example.com/app/web:1.4.2
```

示例约定：自有仓库统一写 `registry.example.com`，业务镜像以 `registry.example.com/app/web` 为例，当前版本标签 `1.4.2`，其 digest 在文中用一组示例摘要值表示，实际执行时必须替换为 3.1 节命令查到的真实值，照抄示例摘要只会拉取失败。

## 三、手把手操作步骤

### 3.1 来源治理：只用可信仓库，按 digest 锁定版本

来源治理先定三条纪律。第一，只从可信仓库拉镜像：官方镜像、组织自有仓库、或经审核同步的私有仓库，不从来历不明的第三方镜像站拉生产镜像，那类镜像无人对内容负责。第二，禁用 `latest`：它是一个会漂移的标签，同名同标签在不同时间拉到的内容可以完全不同，出问题时连「当时跑的是哪一版」都说不清。第三，生产引用一律带 digest，写法是标签加摘要：

```yaml
services:
  web:
    image: registry.example.com/app/web:1.4.2@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    restart: unless-stopped
```

逐项讲解：`1.4.2` 是给人看的版本标签，便于沟通与排序；`@sha256:` 后面是镜像清单的内容摘要，内容变一个字节摘要就变；两者同时写时拉取以摘要为准、标签只作标注，于是标签被重推、被替换都不会让你在不知情的情况下换内容。这正是 digest 锁定的含义：你部署的不再是「某个名字」，而是「某一份确切内容」。

取 digest 的命令有两种，都不需要把镜像拉到本地：

```bash
docker buildx imagetools inspect registry.example.com/app/web:1.4.2
docker manifest inspect registry.example.com/app/web:1.4.2
```

`imagetools inspect` 的输出开头有 `Name` 与 `Digest` 两行，多架构镜像还会列出各平台的子清单摘要，锁定时记清单总摘要；`docker manifest inspect` 直接输出清单 JSON，两个命令任选其一固定使用。注意不要拿本地镜像的摘要与仓库摘要混用：经过本地重新打包的镜像，本地摘要未必等于仓库清单摘要，锁定要以仓库查询结果为准。

私有仓库做镜像同步时同样要验摘要：同步前后各查一次源仓库与私有仓库同一标签的 digest，两值一致才算同步完整；只对文件大小或标签名就放行，等于把投毒窗口开在同步环节。同步脚本应把摘要不一致作为失败退出，而不是警告后继续。

### 3.2 签名验证：cosign 的两种模式

digest 锁定只证明「内容没变」，不证明「内容是可信的人发布的」——攻击者替换镜像后把新摘要写进你的部署文件，锁定反而帮他固定了恶意版本。补上这一环的是签名：发布方对镜像摘要签名，部署方拉起之前验签，验不过就不部署。

本章用 Sigstore 项目的 cosign。理解三个词就够：Sigstore 是整套开源签名基础设施；Fulcio 是它的证书颁发组件，为无密钥模式签发短期证书；Rekor 是透明日志，签名记录公开可查。cosign 有两种模式：

| 模式 | 怎么签 | 适合场景 | 代价 |
| --- | --- | --- | --- |
| 无密钥（keyless） | 用 OIDC 身份换 Fulcio 短期证书，无长期私钥，签名记入 Rekor | 有 OIDC 身份的流水线，如托管平台的自动化构建 | 依赖 Sigstore 公共服务，离线环境不可用 |
| 密钥对 | 本地生成 `cosign.key` 私钥与 `cosign.pub` 公钥，私钥签名、公钥验签 | 内网、离线与自建仓库 | 私钥保管与轮换全靠自己，泄露等于签名体系失效 |

密钥对模式的完整流程如下，生成时私钥口令通过交互输入，不要写进脚本：

```bash
cosign generate-key-pair
cosign sign --key cosign.key registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
cosign verify --key cosign.pub registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

注意签名与验签的对象都写 digest 形式而不是标签形式：签名绑定的是内容摘要，签标签等于给「将来这个标签指向的任何东西」背书。无密钥模式不需要生成密钥，验签时改为声明期望的签名者身份与颁发方：

```bash
cosign verify --certificate-identity https://github.com/example-org/app/.github/workflows/release.yml@refs/heads/main --certificate-oidc-issuer https://token.actions.githubusercontent.com registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

其中 `--certificate-identity` 是期望的签名者身份（示例为某托管平台流水线的工作流地址），`--certificate-oidc-issuer` 是身份颁发方；两个值必须按实际发布流水线填写，填错必然失败，按第五节场景二排查。不要为了让命令通过而删掉身份参数——不带身份约束的无密钥验签只证明「有人签过」，证明不了「是该签的人签的」。

验签成功输出的判读示例：

```text
Verification for registry.example.com/app/web@sha256:0123... --
The following checks were performed on each of these signatures:
  - The cosign claims were validated
  - The signatures were verified against the specified public key
```

逐项讲解：出现 `Verification for` 一行且退出码为 0 才算通过；`The cosign claims were validated` 表示签名载荷中的镜像引用与摘要和待验镜像对得上；密钥对模式下第二行是针对指定公钥验证通过，无密钥模式下则换成证书与透明日志相关的校验行。部署前验签的位置是概念级的固定点：拉取镜像之后、启动或更新服务之前，失败即终止部署并告警，绝不允许「先跑起来再补验」。各容器平台自带的准入策略细节不在本章展开，本章只要求这道人工或脚本卡点真实存在。

!!! danger "私钥与验签纪律"

    `cosign.key` 私钥一旦泄露，任何人都能冒充发布方签名，处置等同于口令泄露：立即停用该密钥对、生成新密钥对、对全部在用镜像重新签名，并把旧公钥从所有部署机的信任清单中删除。私钥只存放在发布侧受控环境，不进代码仓库、不随部署文件下发；部署侧只需要公钥或身份约束。回滚口径：新密钥启用出问题时可先回退到旧公钥验签加 digest 锁定双控过渡，但要记录旧密钥已不可信，不要长期沿用。

### 3.3 SBOM：用 syft 给镜像开一张物料清单

SBOM（Software Bill of Materials，软件物料清单）是镜像内全部软件包的清单：包名、版本、类型、许可证等逐项列明。它的价值在出事那一刻兑现：某基础库爆出高危漏洞时，不需要逐台登录排查，把所有镜像的 SBOM 按包名一搜，受影响镜像立刻现形，也是审计问「镜像里有什么」时的直接答卷。

用 syft 为指定 digest 的镜像生成 SPDX 格式清单并落文件保存：

```bash
syft registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef -o spdx-json=sbom-web-1.4.2.spdx.json
ls -lh sbom-web-1.4.2.spdx.json
syft registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef -o table
```

逐项讲解：`-o spdx-json=文件名` 表示输出 SPDX 标准的 JSON 清单并写入文件，SPDX 与 CycloneDX 是两种主流清单格式，团队内固定一种，不要混存；旧版 syft 的写法带 `packages` 子命令（如 `syft packages 镜像 -o spdx-json`），现行版本已改为直接跟镜像名，照旧教程敲多半报错，按装到的版本 `--help` 为准；第二条 `-o table` 把同一份盘点以表格打到终端，适合人工抽查。生成对象必须带 digest，与部署的是同一份内容，清单才有意义。

SBOM 的存放纪律：按镜像加版本命名、与发布记录放在一起长期保存，不要只留在构建机的临时目录里。漏洞事件时的反查就一条命令的思路——在清单库里按受影响包名检索，命中的文件名直接对应受影响镜像：

```bash
grep -l "log4shell-affected-lib" sbom-*.spdx.json
grep -o "\"name\": \"[^\"]*\"" sbom-web-1.4.2.spdx.json | sort -u | head -n 50
```

第一行在全部清单里找出包含某受影响包的文件（包名换成事件中公布的实际包名），第二行列出某份清单的包名概览。把这两条写进应急预案，比临时现扫快得多。

### 3.4 漏洞扫描：trivy 扫镜像并分级处置

SBOM 回答「装了什么」，漏洞扫描再往前一步：把清单与公开漏洞库比对，指出哪些包中了哪些已知漏洞、有没有修复版本。用 trivy 扫指定镜像，只看高危与严重两档：

```bash
trivy image --severity HIGH,CRITICAL registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

逐项讲解：`--severity HIGH,CRITICAL` 只报告高与严重两档，先把噪音压下去；`--ignore-unfixed` 只保留已有修复版本的条目，没有修复办法的先不列入阻塞清单（处置原则见第五节）；`--exit-code 1` 表示有命中时命令以 1 退出，便于把扫描放进部署脚本做卡点——验签管「是不是真的」，扫描管「干不干净」，两道卡点都过才部署。trivy 首次运行要下载漏洞库，离线环境需提前备好库的同步方式。

输出判读示例（节选）：

```text
registry.example.com/app/web (debian 12.5)
Total: 2 (HIGH: 1, CRITICAL: 1)

Library       CVE-ID         Severity  Installed Version  Fixed Version
openssl       CVE-2024-0001  CRITICAL  3.0.11             3.0.13
libcurl4      CVE-2024-0002  HIGH      7.88.1             7.88.2
```

判读表如下，上表示例中的 CVE 编号为格式示意，实际以扫描输出为准；不可修复的条目在输出中表现为 `Fixed Version` 为空：

| 列 | 含义 | 怎么用 |
| --- | --- | --- |
| `Total` 汇总行 | 按等级统计的命中总数 | 先看 CRITICAL 是否为 0 |
| `Library` | 中招的软件包 | 判断是基础层带的还是应用装的，决定找谁修 |
| `CVE-ID` | 漏洞编号 | 查公开说明确认影响范围，不要只看等级拍脑袋 |
| `Severity` | 严重程度分级 | CRITICAL 与 HIGH 进阻塞清单，低等级进定期修复队列 |
| `Installed Version` 与 `Fixed Version` | 当前版本与修复版本 | 有修复版本就升级重建；为空即不可修复，按第五节处理 |

扫描结果的处理流程固定为四步：能修基础镜像的，更新基础镜像或包后重新构建、重扫、重新签名，一条龙走完，不要只在运行中的容器里热修——热修过的镜像与仓库里的不是一份东西，下次重建又会复发；能修应用依赖的，在依赖清单里升级对应包；暂时修不了的，进风险接受流程留记录（见第五节场景一）；最后把扫描报告与 SBOM、digest 一起归档到发布记录。替代工具一句带过：grype 能直接吃 syft 产出的 SBOM 文件离线比对：

```bash
grype sbom:sbom-web-1.4.2.spdx.json
```

### 3.5 基础镜像更新策略与回滚

漏洞是持续被发现的，镜像治理不是一次性工程。基础镜像更新定三条节奏：第一，定期重建，即使应用代码没改，也按固定周期（如每月）用同一份代码重新构建一次，吃进基础镜像与系统包的安全更新，重建后走完整的扫描、签名、SBOM 流程；第二，事件驱动重建，基础层爆出 CRITICAL 漏洞时不等周期，立即重建并优先发布；第三，digest 更新要评审，新 digest 进部署文件之前做一遍对比检查：SBOM 与上一版相比多了什么包、扫描结论是否变差，来源与签名是否齐全，评审结论留记录再上线，不要把「换个摘要数字」当无风险操作。

digest 锁定此时兑现另一个好处：天然回滚点。回滚不需要重新构建任何东西，把部署文件中的镜像引用改回上一版 digest 即可，内容就是当时那一份。前提是旧镜像没有被仓库清理策略删掉，因此仓库侧要给已上线版本设置保留期。回滚操作示例：

```bash
sudo cp /srv/demoapp/compose.yaml.bak-2026-01-01 /srv/demoapp/compose.yaml
docker compose -f /srv/demoapp/compose.yaml up -d
docker compose -f /srv/demoapp/compose.yaml ps
```

!!! warning "更新与回滚的共同前提"

    无论更新还是回滚，上线前都要对目标 digest 重新执行验签与扫描：旧版本当时干净，不代表按今天更新的漏洞库重扫还干净；新版本构建无误，也不代表推到仓库的就是它。把「验签加扫描」绑定在 digest 上，才不会在回滚这种紧张时刻漏掉卡点。

## 四、效果验证与测试

逐项执行并对照期望结果，四项全过才算链路成立：

```bash
grep "image:" /srv/demoapp/compose.yaml
cosign verify --key cosign.pub registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ls -lh sbom-web-1.4.2.spdx.json
trivy image --severity HIGH,CRITICAL --ignore-unfixed registry.example.com/app/web@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
echo $?
```

| 检查项 | 期望结果 | 不符合时说明 |
| --- | --- | --- |
| 部署文件中的镜像引用 | 标签加 `@sha256:` 摘要形式，无裸 `latest` | 仍是纯标签说明锁定没落地，按 3.1 改 |
| `cosign verify` | 输出 `Verification for` 与校验通过行，退出码 0 | 失败按第五节场景二排查，不许跳过 |
| SBOM 文件 | 存在且非空，包名概览能列出主要组件 | 为空说明 syft 没扫到目标镜像，先查引用与认证 |
| trivy 扫描 | 报告正常产出，无可修复高危时退出码为 0 | 扫不了先查漏洞库与仓库认证，不要当作「无漏洞」放行 |

最后做一次负向验证：故意把部署文件里的 digest 改掉一位再执行验签与拉取，应当分别得到验签失败与拉取失败，证明卡点真的在工作。验证完改回正确摘要并留记录。

## 五、常见错误与排坑指南

场景一：第一次全量扫描扫出几百条漏洞，团队被吓住或干脆想关掉扫描。根因是把「历史存量」与「新增风险」混在一起看：老镜像里大量条目是低等级、不可修复、或不在可利用路径上的包。分级处理固定为四档：可修复的 CRITICAL 与 HIGH 阻塞发布、限期清零；不可修复的高等级条目逐条查 CVE 说明，确认利用条件（如需要本地权限、默认配置不触发）后走风险接受，必须留书面记录，写明编号、理由、接受人与复查日期；低等级条目进定期重建队列，靠 3.5 的周期重建消化；明显误报（如发行版已回移植修复但版本号没变，扫描器按上游版本号误判）要留判定依据再忽略。用 `--ignore-unfixed` 与等级过滤把每次发布的关注面收敛到「新增且可修」，存量另开专项治理，不要用存量绑架日常发布，也不要用日常发布豁免存量。

场景二：验签失败，部署卡住。不要第一反应就是关掉验签放行，失败本身可能正是攻击信号。排查顺序固定：先核对验的对象，命令里写的是不是目标 digest，摘要抄错一位都会失败；再核对信任材料，公钥是不是发布方现行公钥、轮换后有没有只换了一边，无密钥模式核对身份与颁发方参数是否与发布流水线一致；再查仓库侧，签名是与摘要绑定的附加对象，镜像被重推或同步时只同步了镜像没同步签名，会导致「镜像在、签名不在」；再查时间，无密钥模式的短期证书对系统时间敏感，时钟漂移过大也会验不过；最后才考虑发布流程漏签，回发布侧查签名记录。全部排除后仍失败，就按「镜像可能已被替换」处理：冻结该版本、保留现场、走安全事件流程，不要重签一个来历不明的镜像让它变「合法」。

场景三：按 digest 拉取报 `manifest unknown` 或摘要不匹配。根因按概率排序：摘要抄写错误（少一位、混入空格），重新用 3.1 命令从仓库查，不要手抄；目标仓库没有这一版，同步未完成或被保留策略提前清理，查仓库侧版本列表与保留期；多架构镜像锁错层级，把子清单摘要当成了总清单摘要，回到 `imagetools inspect` 记第一行的总摘要。修复后把摘要获取固化进部署脚本，杜绝人工转抄。

场景四：cosign、syft、trivy 在本机运行正常，一到服务器就拉不到私有仓库镜像，报未授权或证书错误。根因通常不在工具：这三个工具读取的是各自或 Docker 的仓库认证与系统证书存储，登录态没有给到当前执行账号（如给普通用户 `docker login`、却用 `sudo` 跑扫描），或私有仓库用自签证书而服务器没导入对应 CA。修复是统一执行账号与认证来源，逐个工具做最小连通验证（先验公开镜像，再验私有镜像），自签证书按规范导入 CA 存储，不要用跳过证书校验的参数当长期方案。

## 六、生产环境最佳实践与安全建议

第一，信任链四件套缺一不可：可信仓库、digest 锁定、部署前验签、发布前扫描，任何一环缺失，其他三环的价值都会打折；新项目从第一天就上齐。

第二，所有卡点自动化并留痕。验签与扫描写进部署脚本或流水线，失败即终止，结果与 SBOM、digest 一起归档到发布记录；靠人记的卡点迟早会被绕过。

第三，密钥与身份当资产管理。签名私钥进受控保管并定期轮换，无密钥模式的身份约束写进版本库受评审；人员变动时同步复核谁还能触发签名。

第四，存量治理单独立项。老镜像按场景一的分级办法排出清零计划；新进镜像从第一版起执行全套纪律。

第五，回滚点要真实可用。已上线版本的镜像与部署文件备份按保留期留存，每季度抽查一次按旧 digest 能否拉起服务；回滚方案只有演练过的算数。

第六，工具与漏洞库保持更新。扫描器与漏洞库过期会系统性漏报，工具大版本变化可能改命令写法（见 syft 子命令的例子），升级时先在测试镜像上回归一遍四项验证再推广。
