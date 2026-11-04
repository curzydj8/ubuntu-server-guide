---
description: "24 现代计算机前沿研究：Exascale 与 Post-Exascale——exaflop 的定义与验证口径、四台已验证系统、功耗与数据搬运瓶颈，以及 zettaflop 路线图为什么还是目标而非事实。"
---

# Exascale 与 Post-Exascale

> 本篇是[超算与高性能计算入门](03-hpc-supercomputing.md)（总览）下的一篇三级文章。总览讲 HPC 的组织方式：并行模型、集群五部分、调度与互连、TOP500 的正确读法。本篇不重复总览的内容，只讲总览里留给本篇的三级主题：exaflop 这一量级是怎么定义的、它凭什么算“达到”、已经验证的系统长什么样，以及比它再高一级的 Post-Exascale 目前处在什么状态。

## 1. 研究问题

Exascale 要解决的问题可以一句话说清：有些科学问题在 petascale（每秒千万亿次，10^15）量级上算不起——不是算不出，而是算到结果出来时，科学窗口已经过去了。典型例子是总览提到的那几类：更高分辨率的天气预报、更长时程的分子模拟、更精细的核武器库存管理模拟、更大规模的材料与能源仿真。Exascale 的目标是把双精度浮点算力再推高一个数量级，到每秒百亿亿次（10^18），让这类问题在可接受的时间与功耗内算完。

Post-Exascale 问的是下一个问题：exaflop 之后，下一个数量级（zettaflop，10^21）能不能在功耗、散热、内存带宽、软件可移植性都不崩的前提下达到？这个问题目前没有已验证的答案——本篇把“已验证的事实”与“路线图目标”严格分开写，凡是目标都写成目标，不写成事实。

## 2. 基础理论

- **exaflop 的定义**：1 exaflop/s = 每秒 10^18 次双精度（IEEE 754 64 位）浮点运算。注意口径：这个定义说的是双精度；厂商宣传的混合精度（FP16/FP8）峰值算力口径不同，不能直接拿来与 exaflop 比较（总览第 7 节已强调这一点，本篇沿用）。
- **zettaflop 的定义**：1 zettaflop/s = 每秒 10^21 次浮点运算，即 exaflop 的 1000 倍。本篇用它只表示“下一个数量级目标”，不表示任何已交付系统的实测性能。
- **Amdahl 定律与 Gustafson 定律**：见总览第 2 节。本篇只补一句与 exascale 相关的含义：规模越大，串行部分与同步开销的权重越大，exaflop 系统的真实应用加速比从来不是“核数翻倍、速度翻倍”。
- **强扩展与弱扩展**：见总览第 2 节。报告 exascale 应用性能时必须说明是哪一种扩展、跑的是哪个应用、问题规模多大，否则数字没有意义。
- **能效口径**：Green500 以 Gflop/W（每瓦特十亿次浮点运算）衡量能效，测试条件与 HPL 榜单申报功耗挂钩。离开测试条件谈“最节能的超算”没有意义。

## 3. 技术路线

Exascale 不是靠“把 petascale 系统放大一千倍”实现的，实际走通的路线有三条，彼此互补：

- **加速器主导的异构节点**：计算主力从 CPU 转向 GPU/加速器，CPU 负责控制与不规则任务。已验证的四台 exascale 系统全部是异构系统（见第 5 节），没有一台是纯 CPU 系统——这是 exascale 时代最硬的事实之一。
- **高带宽内存与统一内存**：加速器算力增长快于内存带宽增长，于是节点内出现了 HBM（高带宽内存）与 CPU–GPU 统一内存设计（El Capitan 的 MI300A 是代表，见第 5 节），目标是让数据搬运不再先于计算成为瓶颈。
- **应用、软件栈与硬件协同设计（co-design）**：美国能源部（DOE）的 Exascale Computing Project（ECP，2016 年启动、已结束）把“应用、软件栈、硬件”三件事绑在一起做，而不是先造机器、再让应用去适配。ECP 的遗产之一是可移植的科学软件栈 E4S（Extreme-scale Scientific Software Stack），即同一套科学软件要在不同厂商的加速器上都能跑出效率（来源：ECP 官网 About 与 Impacts 页）。

Post-Exascale 目前讨论中的路线（均为研究与工程方向，不是已验证的系统）：

- **更激进的异构与专用化**：CPU + GPU + 专用 AI 加速器、乃至未来量子加速器拼进同一系统，统一编程与调度模型是关键难题（与本域[新型计算架构：光子与存算一体](08-new-computing-arch.md)中异构协同的讨论相通）。
- **光互连与共封装光学**：用光替代部分电互连，缓解节点间与机柜间的通信墙；总览第 10 节已将其列为已有研究在做的方向，本篇不展开其器件细节。
- **能效优先的系统设计**：在功耗封顶的前提下最大化科学产出，而非最大化 HPL 名次；Green500 与 HPCG 的权重上升是这一路线的风向标。
- **AI 与仿真混合**：AI 代理模型（surrogate）替代部分仿真步骤，再用传统数值方法校验——这条路线属于本分支后续三级主题“AI 与 HPC 融合”，本篇只点出关系，不展开。

## 4. 系统架构

Exascale 系统的架构仍是总览第 4 节的五部分（计算节点、互连、管理与登录节点、并行存储、调度器），但在 exascale 量级上，每一部分的约束都收紧了一档：

1. **计算节点**：异构节点成为默认形态。节点形态有两种已验证的范式：一是“独立 CPU + 独立加速器”（Frontier、Aurora、JUPITER Booster 均属此类，CPU 与加速器是分立器件）；二是“CPU 与 GPU 融合在同一封装、共享同一 HBM 内存池的 APU”（El Capitan 的 MI300A，见第 5 节）。两种范式没有高下之分，区别在于数据搬运路径与编程模型。
2. **互连网络**：Slingshot-11（前三台系统）与 InfiniBand NDR（JUPITER Booster）是已验证的互连技术；互连拓扑（胖树、dragonfly 等）决定大规模通信的拥塞形态，细节见本分支后续三级主题“高性能网络与并行文件系统”，本篇不展开。
3. **功耗与散热**：exaflop 级系统的榜单申报功耗已达数十兆瓦量级（El Capitan 约 29.7 兆瓦，见第 7 节），液冷成为标配；供电与散热已是与算力同等重要的约束，细节见本分支后续三级主题“液冷、能效与绿色超算”。
4. **并行存储与检查点**：节点数上万后，单点故障不再是小概率事件，检查点/重启动（checkpoint/restart）与容错成为系统架构的一部分，细节见本分支后续三级主题“集群调度、容错与资源管理”。
5. **Post-Exascale 的架构未知数**：下一代系统的节点形态、互连技术、内存体系目前都没有已验证的定论；任何写“下一代一定用 X”的表述在本篇都视为推测，必须标明。

## 5. 代表性实现与开源项目

只列已验证的系统与真实存在的项目，数字只写第 7 节已核查的项：

- **El Capitan（美国 LLNL）**：HPE Cray EX255a，AMD 第 4 代 EPYC 处理器 + AMD Instinct MI300A 加速器、Slingshot-11 互连。MI300A 是把 24 核 Zen 4 CPU 与 CDNA 3 GPU 集成在同一封装的 APU，单 APU 配 128 GB 统一 HBM3 内存、CPU 与 GPU 共享同一地址空间（来源：AMD MI300A 数据表）；每节点 4 颗 MI300A。TOP500 第 66 届榜单（2025 年 11 月）第 1 名。
- **Frontier（美国 ORNL）**：HPE Cray EX235a，AMD 第 3 代 EPYC 处理器 + AMD Instinct MI250X 加速器、Slingshot-11 互连；2022 年首个经验证的 exaflop 级系统。2025 年 11 月榜单第 2 名。
- **Aurora（美国阿贡）**：HPE Cray EX Intel Exascale Compute Blade，Intel Xeon CPU Max 处理器 + Intel Data Center GPU Max 加速器、Slingshot-11 互连。2025 年 11 月榜单第 3 名。
- **JUPITER Booster（德国于利希，EuroHPC）**：Eviden BullSequana XH3000，直接液冷架构，NVIDIA GH200 Grace Hopper Superchip、InfiniBand NDR200 互连。2025 年 11 月榜单第 4 名，欧洲首个 exaflop 级系统。
- **Exascale Computing Project（ECP，美国 DOE）**：2016 年启动、已结束的项目，目标是交付“可用的 exascale 生态”（应用 + 软件栈 + 硬件），而不仅是一台机器；其软件栈遗产为 E4S。来源：ECP 官网（https://www.exascaleproject.org/about/）。
- **EuroHPC 联合事业（EuroHPC JU）**：欧洲建设超算网络的联合机制，JUPITER 是其旗下系统；其下一代 exascale 系统 Alice Recoque（法国）目前为计划中状态，安装计划见第 7 节末尾，交付与实测性能以官方发布为准（待核实）。

## 6. 关键论文与标准

- **TOP500 榜单方法（事实标准）**：以 HPL 实测 Rmax 为排名依据，每年 6 月、11 月发布；榜单是自愿提交、实测验证的。HPCG 与 Green500 作为对照榜单，口径见总览第 5、7 节。
- **MPI 标准（MPI Forum）与 OpenMP 规范（OpenMP Architecture Review Board）**：exascale 应用的节点间与节点内并行接口，版本号未写入正文，以官方发布为准（待核实）。
- **代表性论文**：本篇不列具体论文篇目——exascale 的奠基性工作分散在 ECP 应用、系统软件、互连等多个方向，逐篇核对标题、作者与年份的工作尚未完成，宁缺毋滥（待核实）。读者可从 ECP 官网的应用与软件目录入手。

## 7. 当前实验结果

本节数字全部来自 TOP500 第 66 届榜单（2025 年 11 月发布），测试条件统一为 HPL 实测 Rmax（双精度 sustained 性能），另注 HPCG 与功耗以作对照；缺测试条件的数字一律不写。与总览第 7 节的表一致，本篇只取与 exascale 门槛相关的读法：

| 排名 | 系统（地点） | HPL Rmax | HPCG（对照） | 榜单申报功耗 |
|---|---|---|---|---|
| 1 | El Capitan（美国 LLNL） | 1.809 Eflop/s | 17.41 Pflop/s | 约 29,685 千瓦（约 29.7 兆瓦） |
| 2 | Frontier（美国 ORNL） | 1.353 Eflop/s | 14.05 Pflop/s | 约 24,607 千瓦 |
| 3 | Aurora（美国阿贡） | 1.012 Eflop/s | 5.61 Pflop/s | 约 38,698 千瓦 |
| 4 | JUPITER Booster（德国于利希） | 1.000 Eflop/s | 以官方榜单为准（待核实） | 约 15,794 千瓦 |

读法要点有三：

1. **exaflop 门槛已被四台系统跨过，但只是刚跨过**：第 4 名 JUPITER Booster 恰好是 1.000 Eflop/s，第 3 名 Aurora 是 1.012 Eflop/s——“exaflop 时代”目前是“四台系统刚刚达标”，不是“普遍达到”。
2. **HPL 与 HPCG 的差距仍是两个数量级左右**：El Capitan 的 HPL 是 1.809 Eflop/s，HPCG 只有 17.41 Pflop/s；这说明稠密线性代数跑得快不等于稀疏迭代、分子模拟都快，榜单名次不是应用性能的保证。
3. **功耗没有随算力线性下降**：四台系统的榜单申报功耗都在 15–39 兆瓦区间，能效（El Capitan 为 60.94 Gflop/W，Green500 口径）是下一代系统必须优先优化的指标，而不是附带指标。

关于 Post-Exascale 的现状（目标，非事实）：

- 截至 2025 年 11 月榜单，**没有任何一台已验证的 FP64 zettaflop 级系统**；全部 500 台系统合计 HPL 为 14.99 Eflop/s，离 1 zettaflop/s（1000 Eflop/s）还差两个数量级。
- 欧洲方面，EuroHPC 网络计划在 2026 年新增四台系统，其中法国的 Alice Recoque 计划为第二台欧洲 exascale 系统（AMD EPYC“Venice”处理器 + Instinct MI430X 加速器，据 EuroCC 捷克国家中心 2025 年 12 月的报道）；该系统尚未交付、尚未有 HPL 实测，性能与上线时间以官方发布为准（待核实）。
- 美国 DOE 下一代系统的媒体报道（如 Oak Ridge、Argonne、Los Alamos 的新系统计划）本篇不转述具体系统名与性能数字，因为官方规格与时间表尚未以可核对的发布为准（待核实）。
- **本文推测**：zettaflop 的第一个可信验证口径，很可能仍是 HPL 双精度 Rmax，但“第一个 zettaflop 系统”这个头衔的实际意义，可能小于“在功耗封顶下跑出可用的科学应用”这一标准；检验标准是首个自称 zettaflop 的系统是否同时公布 HPL、HPCG 与功耗三项可核对数字。

## 8. 技术瓶颈

- **功耗墙**：exaflop 已达数十兆瓦，zettaflop 若按同样能效外推将触及供电与散热的硬上限；能效必须比算力增长得更快，这一点目前没有已验证的通用解法。
- **内存与通信墙**：处理器算力增长快于内存带宽与互连带宽增长，数据搬运正在成为主导成本；统一内存（MI300A 路线）与光互连（研究方向）是两条应对思路，但都未证明能在 zettaflop 规模上通用。
- **并行效率衰减**：规模越大，同步、负载不均、通信开销占比越高；弱扩展尚可、强扩展先见顶是常态，exaflop 应用的调优重点是减少同步与重叠通信计算。
- **软件与人才**：跨代硬件移植（CPU → GPU → 下一代加速器）成本高；“程序能跑”与“程序跑得有效率”之间隔着性能工程的完整工作；可移植编程模型（Kokkos、RAJA 等抽象层，见第 3 节 ECP 软件栈）仍在工程发展中。
- **基准与采购误读**：以 HPL 名次选系统、以混合精度峰值冒充双精度 exaflop、以核数比大小，都是报道与采购里的常见误读；正确做法是拿自己的应用在目标系统上实测弱扩展与强扩展曲线。

## 9. 成熟度判断

- **成熟度：工程发展中。** 判断依据一句话：exaflop 本身已投产（四台系统在国家实验室稳定运行并支撑生产级科学负载，见第 7 节），但本篇的完整主题包含 Post-Exascale——zettaflop 尚无已验证系统，下一代架构、互连与能效方案仍在工程路线阶段，所以整篇的成熟度取两者的交集：工程发展中，而非成熟应用。

## 10. 未来研究问题

- **已有研究在做**：下一代互连（光互连、共封装光学）能否缓解通信墙；异构加速器如何统一进同一套编程与调度模型；AI surrogate 模型与传统数值仿真的混合工作流。
- **已有研究在做**：能效优先的系统设计——在功耗封顶的前提下最大化科学产出，而非最大化 HPL 名次。
- **本文推测**：Post-Exascale 的第一台系统可能不是“通用 zettaflop”，而是“在特定应用上先达到 zettaflop 量级有效算力”的专用系统；检验标准是首个 zettaflop 宣称是否限定了应用与精度口径。
- **本文推测**：量子计算短期内最现实的 HPC 角色是“加速器”而非“替代者”（总览第 10 节已有此推测，本篇沿用）；检验标准是是否有经同行评议的混合算例在真实科学问题上复现优势。

---

## 文章信息（统一字段）

- 来源：TOP500 第 66 届榜单（2025 年 11 月，https://www.top500.org/lists/top500/2025/11/）与榜单亮点页（https://www.top500.org/lists/top500/2025/11/highs/）：El Capitan 1.809 Eflop/s、HPCG 17.41 Pflop/s、能效 60.94 Gflop/W、功耗 29,685 千瓦，Frontier 1.353 Eflop/s、HPCG 14.05 Pflop/s，Aurora 1.012 Eflop/s、HPCG 5.61 Pflop/s，JUPITER Booster 1.000 Eflop/s，合计 14.99 Eflop/s；美国 DOE Exascale Computing Project 官网 About 页（https://www.exascaleproject.org/about/）与 Impacts 页（https://www.exascaleproject.org/impacts/）：ECP 2016 年启动、已结束，应用 + 软件栈 + 硬件协同设计，E4S 可移植软件栈；AMD Instinct MI300A 数据表（24 核 Zen 4 CPU + CDNA 3 GPU、128 GB 统一 HBM3、峰值理论带宽 5.3 TB/s，峰值理论值非实测 sustained 值）；EuroCC 捷克国家中心 2025 年 12 月报道（https://www.eurocc-czechia.cz/en/europe-to-double-the-performance-of-its-supercomputers-available-to-businesses-and-research-by-2026/）：Alice Recoque 计划中、AMD Venice + MI430X；MPI Forum《MPI 标准》与 OpenMP Architecture Review Board《OpenMP 规范》（标准层面来源，版本号未写入正文，以官方发布为准）。
- 适用版本：不适用（量级综述；TOP500 数字以 2025 年 11 月第 66 届榜单为准，后续榜单以官方发布为准）。
- 核实日期：2026-11-04
- 成熟度：工程发展中
- 难度：L5
- 前置知识：[超算与高性能计算入门](03-hpc-supercomputing.md)（本篇的总览，必读）、[CPU 组成与指令集](../01-computer-basics/02-cpu-instruction-set.md)（单核与多核的背景）、[内存层次与缓存](../01-computer-basics/03-memory-hierarchy-cache.md)（HBM 与访存成本的背景）
- 相关主题：[GPU 集群与异构集群](11-gpu-hetero-clusters.md)（exascale 系统的节点形态与集群组织）、[新型存储与互连：HBM 与 CXL](09-new-storage-interconnect.md)（HBM 各代与内存池化的背景）、[新型计算架构：光子与存算一体](08-new-computing-arch.md)（光互连与存算一体等 Post-Exascale 候选路线）、[量子计算基础](01-quantum-computing.md)（混合计算中量子加速器的另一端）、[指令集对比：x86 与 ARM 与 RISC-V](../01-computer-basics/05-isa-comparison.md)（计算节点的处理器选型背景）
- 未完成项：JUPITER Booster 的 HPCG 数值未逐项核对（缺可核对的来源，故在表中写“以官方榜单为准（待核实）”）；Alice Recoque 的交付与实测性能未验证（计划中，以官方发布为准，待核实）；美国 DOE 下一代系统的具体规格与时间表未以官方发布核对，未写入正文（待核实）；代表性论文未逐篇核对，未列具体篇目（待核实）；MPI、OpenMP 的具体版本号未核对，未写入正文；本篇无集群命令与并行程序示例，故无“示例未实测”项。
