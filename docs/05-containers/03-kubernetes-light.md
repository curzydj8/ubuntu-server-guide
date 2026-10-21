# Kubernetes 轻量集群

## 一、概述与使用场景

标准 Kubernetes 功能强大，但组件多、资源占用高，对中小规模场景明显过重。轻量发行版把控制面打包成单个进程或少量组件，在保留 Kubernetes 核心 API 和用法的前提下，大幅降低安装和运维门槛。本章讲两个最主流的选择：k3s 和 microk8s。

适合轻量集群的场景包括：边缘网点、小型业务系统需要多节点冗余，但规模撑不起标准集群的运维成本；开发测试团队需要一套与生产用法一致、又能快速重建的练习环境；单机 Docker 已经满足不了需求，需要服务自愈、滚动更新和声明式配置，但节点数在十台以内。

不用集群、继续靠单机加手工运维的瓶颈也很清楚：宿主机宕机等于全部服务中断，没有自动重新调度；发布靠逐台登录替换，出错了回滚靠人工翻记录；配置散落在各台机器上，时间一长没人说得清哪台是准的。声明式集群把期望状态写进 YAML，系统持续把实际状态向期望状态靠拢，这正是容器数量和节点数量上来之后必须补的一课。


## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 和 Ubuntu 24.04 LTS。单节点体验最低要求 2 核 CPU、2 GB 内存、20 GB 磁盘；多节点实验建议准备三台机器，角色为一个控制面节点加两个工作节点，示例地址使用文档段地址 192.0.2.11、192.0.2.12、192.0.2.13，主机名分别设为 k8s-master、k8s-node1、k8s-node2，请按你自己的实际地址替换，域名示例统一使用 example.com。

每台机器都要先完成基础准备：设置主机名、确保各节点时间同步、关闭交换分区。Kubernetes 要求关闭 swap，否则 kubelet 会拒绝启动或行为异常。

```bash
sudo hostnamectl set-hostname k8s-master
sudo timedatectl set-ntp true
timedatectl status
sudo swapoff -a
free -h
```

关闭 swap 还需要处理开机自动挂载。修改前先备份 fstab，再把其中 swap 那一行注释掉：

```bash
sudo cp /etc/fstab /etc/fstab.bak
sudo nano /etc/fstab
```

在编辑器里找到包含 swap 字样的那一行，在行首加井号注释掉，保存退出后再次确认：

```bash
cat /etc/fstab
free -h
```


!!! warning "先审脚本再执行"

    本章 k3s 使用官方提供的安装脚本一键安装。任何从网络下载后直接用 root 执行的脚本都有供应链风险，正确做法是先把脚本下载到本地、打开看完内容、确认来源域名无误后再执行。本章给出的命令已经按先下载、后审查、再执行的顺序写好，请不要图省事把两步合并成一条管道命令在生产机上直接跑。

## 三、手把手操作步骤

### 3.1 k3s 与 microk8s 对比选型

先看对比表，再决定本节后半部分跟哪条路线走。两条路线的后续命令不同，选定一条执行即可，不要在同一台机器上混装。

| 对比项 | k3s | microk8s |
| --- | --- | --- |
| 出品方 | SUSE 旗下的 Rancher 团队 | Canonical，Ubuntu 母公司 |
| 安装方式 | 官方脚本或二进制单文件 | snap 包安装 |
| 默认存储后端 | 单节点默认 SQLite，可选 etcd 或外部数据库 | 基于 dqlite 的多节点存储 |
| 资源占用 | 更低，老旧和小内存机器更友好 | 稍高，但功能组件更全 |
| 附加组件 | 自带 Traefik 入口和本地存储等常用组件 | 通过 addons 按需开启 DNS、入口、存储等 |
| 与 Ubuntu 集成 | 一般发行版通用 | 与 Ubuntu 和 snap 生态结合紧密 |
| 上手难度 | 低，一条命令完成单节点 | 低，命令封装得更友好 |


### 3.2 路线 A：k3s 单节点与多节点搭建

第一步下载安装脚本并审查内容：

```bash
curl -sfL https://get.k3s.io -o /tmp/install-k3s.sh
less /tmp/install-k3s.sh
ls -l /tmp/install-k3s.sh
```

用 less 打开后重点确认脚本来源标识和主要动作是下载二进制并注册 systemd 服务，没有可疑的外连地址和额外命令，确认无误后退出 less 再执行安装。下面命令在控制面节点 k8s-master 上执行：

```bash
INSTALL_K3S_EXEC="server --write-kubeconfig-mode 644" sh /tmp/install-k3s.sh
sudo systemctl status k3s --no-pager
```



第二步在控制面节点查看加入令牌，并把集群配置复制给普通用户使用：

```bash
sudo cat /var/lib/rancher/k3s/server/node-token
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown ubuntu:ubuntu ~/.kube/config
sed -i "s/127.0.0.1/192.0.2.11/" ~/.kube/config
```


第三步在两个工作节点上执行加入命令。先在工作节点上同样下载并审查脚本，然后执行：

```bash
curl -sfL https://get.k3s.io -o /tmp/install-k3s.sh
less /tmp/install-k3s.sh
K3S_URL=https://192.0.2.11:6443 K3S_TOKEN=替换为上一步查到的令牌值 sh /tmp/install-k3s.sh
sudo systemctl status k3s-agent --no-pager
```


### 3.3 路线 B：microk8s 单节点与多节点搭建

microk8s 通过 snap 安装。先说明 snap 的特殊性：snap 是 Canonical 推行的打包格式，包自带依赖且自动更新，microk8s 只能用 snap 方式安装，没有等价的 apt 包；snap 自动更新意味着版本可能在无人操作时变化，生产环境要在理解这一点的前提下使用，并考虑用 snap refresh 的暂停命令锁定维护窗口。

```bash
sudo snap install microk8s --classic
sudo usermod -a -G microk8s ubuntu
mkdir -p ~/.kube
newgrp microk8s
microk8s status --wait-ready
```

--classic 参数表示经典模式，microk8s 需要访问系统级资源，必须带上，漏了会安装失败或功能受限。装完后建议先开启最常用的附加组件：

```bash
microk8s enable dns
microk8s enable hostpath-storage
microk8s enable ingress
microk8s enable dashboard
microk8s status
```


导出集群配置到标准位置，方便直接使用 kubectl 命令：

```bash
microk8s config > ~/.kube/config
chmod 600 ~/.kube/config
microk8s kubectl get nodes
```

多节点组建在控制面节点生成加入命令，再到工作节点执行。控制面节点执行：

```bash
microk8s add-node
```

把输出的 join 命令原样复制到工作节点执行，加入完成后回到控制面用 microk8s kubectl get nodes 检查，全部节点状态为 Ready 即组建完成。


!!! note "两条路线的 kubectl 一致性"

    无论选 k3s 还是 microk8s，后面 3.4 节开始的 kubectl 操作、YAML 内容和验证方法完全通用。k3s 自带 kubectl 可直接使用，也可通过 k3s kubectl 调用；microk8s 用 microk8s kubectl 或上面设置的别名。照本章继续操作时，把命令里的 kubectl 理解为你当前路线对应的那一种即可。

### 3.4 kubectl 基本操作

先掌握查看、创建、扩缩和删除这组高频命令：

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get services
kubectl get deployments
kubectl describe node k8s-master
kubectl cluster-info
kubectl create deployment hello --image=nginx:alpine --replicas=2
kubectl scale deployment hello --replicas=3
kubectl get pods -w
kubectl delete deployment hello
kubectl apply -f app.yaml
kubectl delete -f app.yaml
```


### 3.5 部署一个示例应用

下面用声明式方式部署一个完整的示例应用，包含 Deployment 和 Service 两份定义。先创建工作目录并写入文件。修改或新建配置前，如目录里已有同名文件，先备份：

```bash
mkdir -p ~/k8sdemo
cd ~/k8sdemo
cp app.yaml app.yaml.bak 2>/dev/null || echo "无旧文件，跳过备份"
nano app.yaml
```

app.yaml 完整内容如下：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webdemo
  labels:
    app: webdemo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webdemo
  template:
    metadata:
      labels:
        app: webdemo
    spec:
      containers:
        - name: nginx
          image: nginx:alpine
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: webdemo-svc
spec:
  type: NodePort
  selector:
    app: webdemo
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```


部署并验证访问：

```bash
kubectl apply -f app.yaml
kubectl rollout status deployment/webdemo
kubectl get pods -o wide
kubectl get service webdemo-svc
curl -s http://192.0.2.11:30080/
```


```bash
kubectl get pods
kubectl get pods -w
```

### 3.6 存储与 Ingress 入门

容器和 Pod 都是临时的，数据持久化要靠存储卷。轻量集群入门阶段先理解两个概念：PersistentVolumeClaim 是应用提出的存储申请，StorageClass 决定由谁来动态提供存储。k3s 自带 local-path 存储类，microk8s 开启 hostpath-storage 后提供对应存储类，都属于用节点本地磁盘供应的入门方案，适合实验和轻量业务，重要数据仍需独立备份，不能把本地盘当成可靠存储。

创建一份申请并绑定到测试 Pod，storage.yaml 完整内容如下：

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: storage-test
spec:
  containers:
    - name: busybox
      image: busybox:latest
      command: ["sh", "-c", "echo hello-pvc > /data/hello.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: demo-pvc
```

这里 busybox:latest 仅用于快速实验，正式环境请换成固定版本标签。执行与检查：

```bash
kubectl apply -f storage.yaml
kubectl get pvc
kubectl get pv
kubectl exec storage-test -- cat /data/hello.txt
kubectl delete -f storage.yaml
```

pvc 状态变为 Bound 才说明存储供应成功；如果长时间停在 Pending，多半是集群里没有可用的默认存储类，用 kubectl get storageclass 检查并按对应发行版开启存储组件。


```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webdemo-ingress
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webdemo-svc
                port:
                  number: 80
```

应用并测试。测试机上需要把 app.example.com 解析到节点地址，实验环境可在测试机的 hosts 文件里加一行 192.0.2.11 app.example.com，改 hosts 前先备份该文件：

```bash
kubectl apply -f ingress.yaml
kubectl get ingress
curl -s -H "Host: app.example.com" http://192.0.2.11/
```


### 3.7 卸载与清理

实验结束后按路线选择对应卸载方法，卸载会删除集群内的全部应用和数据，先确认没有需要保留的内容。

k3s 控制面节点卸载：

```bash
sudo /usr/local/bin/k3s-uninstall.sh
```

k3s 工作节点卸载：

```bash
sudo /usr/local/bin/k3s-agent-uninstall.sh
```

microk8s 卸载，先删集群数据再删 snap 包：

```bash
microk8s reset --destroy-storage
sudo snap remove microk8s
```


```bash
ls -la ~/.kube/
rm -f ~/.kube/config
sudo ss -tlnp | grep 6443
```


## 四、效果验证与测试

按顺序执行并核对结果：

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get deployment webdemo
kubectl get service webdemo-svc
curl -s http://192.0.2.12:30080/
```

期望结果：get nodes 显示全部节点状态为 Ready，版本列有输出；系统命名空间里的 DNS、入口等核心 Pod 全部为 Running，没有反复重启的 CrashLoopBackOff；webdemo 的可用副本数等于期望副本数 2；通过任意节点地址加 30080 端口都能打开页面，换一个节点再测一次也成功，才算多节点调度真正生效。

## 五、常见错误与排坑指南

场景一：节点状态为 NotReady。执行 kubectl get nodes 看到节点显示 NotReady，describe 里有内存或磁盘压力提示。常见原因是内存不足或 swap 没有关干净。修复步骤：

```bash
kubectl describe node k8s-node1
free -h
sudo swapoff -a
cat /etc/fstab
```

确认 swap 已关闭且 fstab 里已注释后，重启对应节点上的 k3s 或 microk8s 服务再观察状态。

场景二：Pod 一直 Pending。kubectl get pods 显示 Pod 长时间 Pending，describe 末尾事件里有 FailedScheduling 字样。原因通常是资源申请超过节点可分配量，或 PVC 没有绑定成功。排查命令：

```bash
kubectl describe pod webdemo-替换为实际Pod名
kubectl get pvc
kubectl get storageclass
kubectl describe node k8s-master
```

对照事件信息处理：资源不够就调小 requests 或增加节点；PVC 问题就先开启存储组件并确认存在默认存储类。

场景三：镜像拉取失败 ImagePullBackOff。Pod 状态显示 ImagePullBackOff，事件里有拉取超时或清单不存在的提示。原因分两类：镜像名或标签写错，以及节点访问镜像仓库网络不通。排查命令：

```bash
kubectl describe pod webdemo-替换为实际Pod名
kubectl get pods
ping -c 3 registry-1.docker.io
```

先核对 YAML 里的镜像名和标签拼写，再在对应节点上测网络。网络不通时改走合规出口或把镜像同步到内网仓库，不要在每个节点上随意改 hosts 造假解析。

## 六、生产环境最佳实践与安全建议

第一，控制面要做备份。k3s 使用 SQLite 时重点备份 /var/lib/rancher/k3s/server 目录和令牌相关文件，使用 etcd 时按官方方式做快照；microk8s 按官方文档备份 dqlite 数据。没有备份的集群只能算实验环境。

第二，kubeconfig 和加入令牌按密钥标准管理。配置文件权限收紧为 600，令牌只走安全渠道传递，人员变动时及时轮换，不要把配置长期放在共享目录里。

第三，全部工作负载都写资源 requests 和 limits，并使用命名空间做业务隔离，配合资源配额防止单个业务抢光集群资源。默认命名空间只用于实验，正式业务一律建独立命名空间。

第四，对外只暴露 Ingress 一个入口，关闭不必要的 NodePort。Service 默认优先用 ClusterIP，确需 NodePort 时记录用途并纳入防火墙统一管理。

第五，升级要先在测试集群演练。轻量发行版升级同样可能带来兼容问题，尤其是 microk8s 的 snap 自动更新特性，生产环境要规划维护窗口并提前确认版本锁定方式，升级前先备份再操作。

第六，本地存储只适合入门和轻量数据。承载重要业务数据时，使用独立的网络存储或云盘类存储类，并单独制定备份和恢复演练计划，不要等丢数据了才发现 PVC 删了就无法找回。
