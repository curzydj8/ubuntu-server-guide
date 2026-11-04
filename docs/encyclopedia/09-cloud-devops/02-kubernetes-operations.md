---
description: "09 云计算与 DevOps：Kubernetes 部署与运维入门——命名空间、资源配额、探针、滚动更新与回滚的思想、日志与排障思路，只讲原理与命令思路，不声称集群实测。"
---

# Kubernetes 部署与运维入门：命名空间、配额、探针、滚动更新与排障

## 1. 本章目标

读完本篇，能说清一次 Kubernetes 部署应该按什么顺序准备、命名空间与配额起什么作用、三种探针各防什么问题、滚动更新与回滚是怎么回事、出问题时应该按什么思路排障。

## 2. 背景与问题

第 1 篇讲了 Kubernetes 由什么组成。本篇讲“怎么用它部署与运维”。部署不是把 YAML 交给集群就完事了，真正的工作在交之前与交之后：

- 交之前：这个应用归哪个组？能用多少资源？配置与密码放哪？
- 交之后：怎么知道它真的健康？新版出问题怎么退回去？日志去哪看？

跳过这些直接上生产，是新手集群事故最常见的来源。本篇按“准备 → 部署 → 观察 → 回滚 → 排障”的顺序讲思想与要点，不讲某一次真实部署的操作记录（本机无集群可实测）。

## 3. 总体架构：部署涉及的四层

一次部署涉及四层，层层都要有准备：

```text
第 1 层：隔离与配额 ── Namespace（分组）、ResourceQuota（组内总量上限）、LimitRange（单个 Pod 默认值与上下限）
第 2 层：配置 ────── ConfigMap（普通配置）、Secret（敏感信息，见第 1 篇的 Base64 提醒）
第 3 层：工作负载 ── Deployment（副本与更新策略）、Service（稳定入口）
第 4 层：可观测性 ── 探针（健康信号）、日志（事后证据）、事件（集群的“黑匣子”记录）
```

## 4. 工作机制

### 4.1 准备：先定分组与配额

**命名空间（Namespace）是第一步**。按环境或团队分组，例如开发、测试、生产各一个 Namespace。分组的好处是名字互不冲突、配额与权限可以按组管。但边界要重申：Namespace 只是逻辑分组，**不是安全边界**。同一集群内不同 Namespace 的 Pod 默认仍可互访；需要隔离时，要叠加 NetworkPolicy（网络策略）与 RBAC（谁能对哪些对象做什么）。

**资源配额是第二步**，分两个层次：

- ResourceQuota：限制某个 Namespace 内所有 Pod 的资源总量（CPU、内存、对象数），防止一个组把整集群吃光。
- LimitRange：给 Namespace 内单个 Pod 或容器定默认值与上下限，防止有人忘了写资源配置就把集群拖垮。

与之配套的是 Pod 自己的两个字段：requests（调度时要预留的资源，调度器按它算节点够不够）与 limits（运行时的上限，超了会被节流或终止）。这两个字段写错，是生产事故的高频来源：requests 写太小，节点超售后一起抢资源；limits 写太小，应用还没跑稳就被杀。

### 4.2 部署：按顺序交，不要一次全交

推荐的提交顺序是：Namespace → 配额 → ConfigMap/Secret → Deployment → Service，最后再观察。顺序的道理是依赖关系：Deployment 引用的配置必须先存在，Service 指向的 Pod 标签必须与 Deployment 一致。

示例（仅作结构示意，**未在本机集群验证，不得直接套用于生产集群**）：

```yaml
# 示例：Deployment 的关键字段示意，不是可直接投产的清单
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: staging        # 先在测试用命名空间验证，再谈生产
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web            # 必须与 selector 一致，否则 Service 找不到 Pod
    spec:
      containers:
        - name: web
          image: example/web:1.2.3   # 用固定版本标签，不用 latest
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

### 4.3 健康信号：三种探针各防什么

探针是 kubelet 定期问容器“你还好吗”的机制，三种用途完全不同，配错会自己制造事故：

- **存活探针（livenessProbe）**：判断容器是不是死了。失败时 kubelet 会重启容器。适用：死锁、进程僵死这类“进程还在、但已不能工作”的情况。
- **就绪探针（readinessProbe）**：判断容器能不能接流量。失败时 Service 会把该 Pod 从后端列表摘掉，但不重启它。适用：启动慢、依赖还没就绪、需要预热的情况。
- **启动探针（startupProbe）**：给启动慢的应用留出时间。在启动探针成功之前，存活与就绪探针不生效。适用：启动要几十秒甚至几分钟的应用。

最常见的配错：用存活探针去判断“能不能接流量”，结果依赖一抖就重启，重启又加重依赖负担，最后雪崩。记住分工：**能不能接流量用就绪探针，死没死用存活探针，启动慢用启动探针兜底**。

### 4.4 滚动更新与回滚的思想

Deployment 的默认更新策略是滚动更新：逐步用新版本 Pod 替换旧版本 Pod，过程中始终有旧 Pod 在接流量，服务不中断。关键点：

- **新旧共存是常态**：滚动期间新旧版本同时在线，应用必须能容忍两个版本并存（数据库兼容、接口兼容都要提前想）。
- **回滚靠历史版本**：每次更新，Deployment 都会保留旧的 ReplicaSet 作为历史。发现新版有问题，可以回滚到上一个版本，本质是“把期望状态改回旧版”，再由控制器慢慢对齐。
- **回滚不是万能**：代码能回滚，数据迁移不一定能。数据库结构改了、数据格式变了，回滚代码不等于回滚数据。凡是涉及数据格式的变更，回滚方案要单独设计，不能只依赖 Deployment 回滚。

与之对应的部署策略（蓝绿、金丝雀）属于发布策略的选型，在第 3 篇 CI/CD 里讲，本篇不展开。

### 4.5 观察与排障思路

出问题时按“从外到内、从期望到实际”的顺序查，不要一上来就重启：

1. **看 Deployment 与 Pod 状态**：副本数够不够？有没有 Pod 一直起不来（CrashLoopBackOff）、一直没就绪？
2. **看事件（Events）**：事件是集群的“黑匣子”记录，调度失败、拉镜像失败、探针失败都会记在这里，先看事件再动手。
3. **看日志**：容器日志是事后证据。单 Pod 可以直接看日志；多副本、多服务要靠集群级日志聚合（把日志收到统一地方查），这部分与 06 域的监控日志体系衔接，本篇不重复讲采集工具。
4. **按对象链逐层看**：Deployment → ReplicaSet → Pod → 容器，期望与实际差在哪一层，就在哪一层找原因。上一层没问题，就往下一层走。

常用命令名（官方文档中的标准命令，思路用，不附“实测输出”）：`kubectl get` 看对象列表与状态，`kubectl describe` 看对象详情与事件，`kubectl logs` 看容器日志，`kubectl rollout status` 看滚动进度，`kubectl rollout undo` 回滚到上一版本。

## 5. 关键设计取舍

- **滚动更新换停机时间**：服务不中断，代价是新旧共存期的兼容责任转移给了应用本身。
- **探针严格换误杀风险**：探针越严，发现故障越快；但阈值太严，抖动也会被当成故障。探针参数要按应用真实启动与恢复时间调，不能照抄示例。
- **配额紧换安全，配额松换弹性**：配额太紧，正常扩缩会被挡住；太松，一个组就能拖垮整集群。配额要按实测用量定，定完还要定期复核。
- **命名空间分组换管理成本**：组越多，配额与权限越好管；但跨组协作、共享服务的复杂度也随之上升。分组粒度要按团队与环境定，不要按服务个数设组。

## 6. 应用与限制

本篇的方法适用于：多环境（开发、测试、生产）的 Kubernetes 应用部署；需要滚动更新与回滚能力的服务；需要配额与健康信号的共享集群。

不适用的场景：

- 单机应用：本篇的 Namespace、配额、探针体系都是为共享集群准备的，单机用 Docker Compose 更直接。
- 没有测试集群的团队：**不要把示例直接套到生产集群**。先在 kind、minikube 这类本地测试集群或独立的测试集群上把流程走通，确认探针、配额、回滚都符合预期，再谈生产。
- 数据迁移场景：回滚只解决代码版本，数据格式变更要单独的迁移与回滚方案，本篇的方法覆盖不了。

## 7. 常见误解

- 误解一：“Namespace 就是安全隔离”：错。只是逻辑分组，网络隔离要靠 NetworkPolicy，权限隔离要靠 RBAC。
- 误解二：“limits 定了，性能就有保证”：错。limits 是上限不是保证；保证靠 requests 与节点容量规划。
- 误解三：“探针配上就万事大吉”：错。探针配错（尤其是用存活探针判断就绪）会制造重启雪崩。
- 误解四：“回滚能解决一切”：错。数据格式变了，回滚代码救不了数据。

---

## 文章信息（统一字段）

- 来源：Kubernetes 官方文档——Namespace（https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/）、资源配额（https://kubernetes.io/docs/concepts/policy/resource-quotas/）、容器探针（https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/）、Deployment 滚动更新（https://kubernetes.io/docs/concepts/workloads/controllers/deployment/）、Service（https://kubernetes.io/docs/concepts/services-networking/service/）
- 适用版本：Kubernetes 1.37（2026-08-26 发布，截至 2026-11-04 的受支持小版本之一；对象字段以官方文档为准）
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[Kubernetes 架构与核心对象](01-kubernetes-architecture-objects.md)、[Docker 基础与进阶](../../05-containers/01-docker.md)、[企业级监控栈：Prometheus 与 Grafana](../../06-monitoring/02-prometheus-grafana.md)
- 相关主题：[CI/CD 流水线设计](03-cicd-pipeline-design.md)、[秘密信息管理](../../02-security/09-secrets-management.md)、[DNS 服务器搭建](../../04-network/01-dns.md)
- 未完成项：本机无 Kubernetes 集群、Docker 不能跑容器，本文无集群实测，机制与命令均引自官方文档；示例 YAML 未在本机集群验证，读者不得直接套用于生产集群；NetworkPolicy 与 RBAC 的完整配置方法不在本篇展开，属 10 域后续内容
