---
description: "09 云计算与 DevOps：Kubernetes 架构与核心对象——控制平面与工作节点的分工、声明式期望状态、Pod、Deployment、Service、ConfigMap/Secret 的定位与关系。"
---

# Kubernetes 架构与核心对象：控制平面、工作节点与声明式模型

## 1. 本章目标

读完本篇，能说清 Kubernetes 是由哪些部件组成的、一次部署请求在集群里走过哪些步骤、Pod、Deployment、Service、ConfigMap、Secret 各自管什么、它们之间是什么关系。

## 2. 背景与问题

容器解决了“应用连同依赖一起打包”的问题，但只解决了一台机器上的问题。应用一多，新的问题就来了：

- 容器跑在哪台机器上？谁来决定？
- 容器挂了谁来重启？流量大了谁来加副本？
- 容器 IP 会变，调用方怎么找到它？
- 配置改了，应用怎么拿到新配置而不重打镜像？

一台机器上用 Docker Compose 可以管几个容器，但它不管多机调度、不管节点故障、不管跨机服务发现。Kubernetes 就是为“多机、多副本、持续对齐期望状态”这一层问题而存在的编排系统。它不是容器运行时，不直接跑容器；它是告诉各节点“应该跑什么”、并持续检查“实际是不是这样”的控制层。

容器本身怎么打镜像、怎么跑起来，是 05 域的内容，本篇不重复，只引用。

## 3. 总体架构

一个 Kubernetes 集群分两部分：控制平面（管决策）与工作节点（管运行）。

```text
控制平面（Control Plane）
  API Server ── 所有请求的唯一入口（kubectl、控制器、节点都只跟它说话）
  etcd ─────── 集群状态的唯一事实来源（期望状态与实际状态都记在这里）
  Scheduler ── 给未分配的 Pod 选一个合适的工作节点
  Controller Manager ── 一组控制器，持续把实际状态推向期望状态
  Cloud Controller Manager ── 与云厂商打交道（负载均衡、节点、路由等）

工作节点（Worker Node，每台都一样的结构）
  kubelet ──── 节点上的代理：按 Pod 规格拉起、监控、汇报容器
  kube-proxy ─ 维护节点上的转发规则，让 Service 能把流量送到后端 Pod
  容器运行时 ─ 真正跑容器的部件（如 containerd）
  Pod ──────── 跑在节点上的工作负载
```

关键设计：**所有部件只跟 API Server 说话，不互相直连**。API Server 是唯一入口，etcd 是唯一事实来源。这个“单入口 + 单事实来源”的结构，是后面一切机制（声明式、控制器、自愈）的前提。

## 4. 工作机制

一次部署请求在集群里的旅程，按顺序是这样的：

1. **提交期望状态**：你把一份 YAML（或等价的 API 调用）交给 API Server，里面写的是“想要什么”，不是“怎么做”。例如“Deployment 叫 web，想要 3 个副本，镜像是某版本”。
2. **校验与准入**：API Server 做身份认证、权限检查、字段校验，通过后把这份期望状态写入 etcd。写进 etcd，才算“被集群接受了”。
3. **调度**：Scheduler 发现有 Pod 还没有节点，就按资源、亲和性等条件选一个节点，把“Pod 应该跑在节点 X”这个决定写回 etcd。
4. **执行**：节点上的 kubelet 监听到属于自己的 Pod，就通知容器运行时拉起容器，并持续向 API Server 汇报状态。
5. **持续对齐**：Controller Manager 里的控制器不停地比较“期望状态”和“实际状态”，发现不一致就采取行动。副本少了就补，Pod 挂了就重建。这就是“自愈”的全部秘密：不是谁在盯着屏幕，而是控制循环一直在转。

这个模式叫**控制器模式（Control Loop）**：观察状态 → 比较期望 → 执行动作 → 再观察。它也是理解 Kubernetes 一切行为（扩缩、滚动更新、回滚）的钥匙。

## 5. 核心对象的定位与关系

Kubernetes 里一切皆对象。下面五个是最常用的，定位各不相同，不要混用：

### 5.1 Pod：最小调度单位

Pod 是 Kubernetes 能调度、能启停的最小单位，里面可以装一个或多个容器。同一 Pod 里的容器共享网络（同一个 IP、同一个 localhost）和存储卷，生死与共：Pod 被删，里面的容器全删；Pod 被调度到哪个节点，里面的容器就都在那个节点。

新手最容易错的一点：**不要把 Pod 当成部署单位**。Pod 本身不自愈、不扩缩、不滚动更新。直接建 Pod，挂了就是挂了。生产里几乎不直接建 Pod，而是让 Deployment 去管 Pod。

### 5.2 Deployment：管 Pod 副本与更新的控制器

Deployment 是最常用的工作负载控制器，管三件事：

- **副本数**：想要几个 Pod，就保持几个。少了补，多了删。
- **自愈**：Pod 异常退出，控制器按 Pod 模板重建一个。
- **滚动更新与回滚**：改镜像或改配置时，逐步用新 Pod 替换旧 Pod，并保留历史版本以便回滚（回滚的具体思想见本系列第 2 篇）。

关系链是：Deployment → ReplicaSet（管某一版本的副本集合）→ Pod。日常操作只跟 Deployment 打交道，ReplicaSet 是中间层，一般不用直接改它。

### 5.3 Service：给一组 Pod 一个稳定访问入口

Pod 的 IP 是临时的：Pod 重建，IP 就变。调用方不能依赖 Pod IP，于是需要 Service：

- Service 有一个**固定不变的虚拟 IP（ClusterIP）与 DNS 名**，指向一组带指定标签的 Pod。
- 流量打到 Service，kube-proxy 按规则把它转发到后端的健康 Pod 上；后端 Pod 增减，Service 自动跟上。
- 对外暴露还有两类：NodePort（通过节点端口访问，适合测试）、LoadBalancer（请云厂商分配外部负载均衡器，适合生产对外服务）。

记住这个关系：**应用之间互相调用，调的是 Service，不是 Pod**。

### 5.4 ConfigMap 与 Secret：把配置从镜像里拿出来

镜像应该是不变的，环境是会变的。把配置写死进镜像，每换一个环境就要重打一次镜像，这是反模式。Kubernetes 的做法是配置与镜像分离：

- **ConfigMap**：存普通配置（配置文件、环境变量、命令行参数）。Pod 挂载它或以环境变量读它，配置一改，应用重启或重载就能拿到新值。
- **Secret**：存敏感信息（密码、令牌、证书）。用法与 ConfigMap 类似，但有两点必须说清：第一，Secret 默认只是 Base64 编码，**不是加密**，能读 API 的人就能解开；第二，真正的安全要靠 RBAC 限制谁能读、以及按需启用静态加密等机制。Secret 的管理细节见 02-security 的秘密信息管理篇，本篇不展开。

### 5.5 Namespace：逻辑分组

Namespace 是把一个集群里的对象分组的机制：开发、测试、生产可以各用一个 Namespace，名字互不冲突，配额与权限也可以按组管理。

但要说清边界：**Namespace 是逻辑隔离，不是安全隔离**。同一集群、不同 Namespace 的 Pod 默认仍可能互相访问网络；真正隔离要靠 NetworkPolicy 与 RBAC 配合。这个边界在第 2 篇还会讲。

### 5.6 对象关系总图

```text
用户提交 Deployment（想要 3 副本，镜像 v2，配置来自 ConfigMap，密码来自 Secret）
  → Deployment 管 ReplicaSet（v2 版本的副本集合）
    → ReplicaSet 管 Pod（3 个，跑在不同节点上）
      → Pod 里的容器读 ConfigMap（配置）与 Secret（密码）
调用方 → Service（固定 DNS 名与 ClusterIP）→ kube-proxy 转发 → 健康的 Pod
```

## 6. 关键设计取舍

- **声明式换掉了命令式**：你只写“想要什么”，不写“怎么做”。好处是控制器能持续对齐、能自愈；代价是你必须学会用“状态”思考，出问题时要查“期望与实际差在哪”，而不是找“哪条命令没执行”。
- **Pod 一组容器换掉了单容器直管**：边车（日志、代理）容器可以与主容器同生共死、共享网络；代价是 Pod 成了调度的原子，出问题要整个 Pod 看，不能只盯单个容器。
- **Service 抽象换掉了直连 IP**：调用方稳定了；代价是多了一层转发与排障链路，出问题要同时看 Service、Endpoints（后端 Pod 列表）与 kube-proxy 规则。
- **etcd 单事实来源换掉了各部件自治**：状态一致了；代价是 etcd 本身成了集群的心脏，它的备份与高可用就是集群的高可用，丢了 etcd 就丢了集群状态。

## 7. 应用与限制

适合用 Kubernetes 的场景：多副本、多服务、需要扩缩与自愈、需要多环境一致部署的应用；团队规模与服务数量大到单机编排已经管不过来。

不适合直接上的场景：

- 单机小应用、个人项目、几个容器就能跑完的服务：单机编排（Docker Compose）更简单，Kubernetes 的运维成本反而高于收益。
- 对本地硬件有强依赖的场景（如直连某块物理卡）：调度抽象会成为障碍，要先确认设备插件与调度约束能否满足。
- 团队还没有容器基础：先补 05 域的容器内容，再进 Kubernetes，否则排障时会同时面对容器与编排两层问题。

学习路径原则（硬性提醒）：**先在本地测试集群或测试集群上练，再碰生产**。本地练手可用 kind、minikube 这类在单机上起测试集群的工具；本篇不展开它们的安装步骤，读者按官方文档在测试环境操作。示例 YAML 一律不得直接套用到生产集群，先讲清命名空间隔离与测试集群原则（见第 2 篇）。

## 8. 常见误解

- 误解一：“Kubernetes 就是容器运行时”：错。它是编排层，真正跑容器的是节点上的容器运行时；Kubernetes 只负责决策与对齐。
- 误解二：“Pod IP 可以写进配置”：错。Pod IP 随时会变，服务间调用要走 Service 的 DNS 名。
- 误解三：“Secret 就是加密存储”：错。默认只是 Base64 编码，能读 API 就能解；安全靠 RBAC 与静态加密等机制叠加。
- 误解四：“Deployment 直接管容器”：错。Deployment 管 ReplicaSet，ReplicaSet 管 Pod，Pod 管容器；排障时按这条链逐层看。

---

## 文章信息（统一字段）

- 来源：Kubernetes 官方文档——集群架构（https://kubernetes.io/docs/concepts/overview/components/）、Pod 概念（https://kubernetes.io/docs/concepts/workloads/pods/）、Deployment（https://kubernetes.io/docs/concepts/workloads/controllers/deployment/）、Service（https://kubernetes.io/docs/concepts/services-networking/service/）、ConfigMap（https://kubernetes.io/docs/concepts/configuration/configmap/）、Secret（https://kubernetes.io/docs/concepts/configuration/secret/）、Namespace（https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/）
- 适用版本：Kubernetes 1.37（2026-08-26 发布，截至 2026-11-04 的受支持小版本之一；对象字段以官方文档为准）
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[Docker 基础与进阶](../../05-containers/01-docker.md)、[Kubernetes 轻量集群](../../05-containers/03-kubernetes-light.md)、[DNS 服务器搭建](../../04-network/01-dns.md)
- 相关主题：[Kubernetes 部署与运维入门](02-kubernetes-operations.md)、[CI/CD 流水线设计](03-cicd-pipeline-design.md)、[企业级监控栈：Prometheus 与 Grafana](../../06-monitoring/02-prometheus-grafana.md)、[秘密信息管理](../../02-security/09-secrets-management.md)
- 未完成项：本机无 Kubernetes 集群、Docker 不能跑容器，本文无集群实测，机制描述均引自官方文档；示例 YAML 未在本机集群验证，读者不得直接套用于生产集群
