---
description: "Podman 是由 Red Hat 主导开发的容器引擎，命令行用法与 Docker 高度兼容，但架构上有两个根本区别：一是没有常驻守护进程，命令直接通过 fork 和 exec 拉起容器；"
---

# Podman 无根容器

## 一、概述与使用场景

Podman 是由 Red Hat 主导开发的容器引擎，命令行用法与 Docker 高度兼容，但架构上有两个根本区别：一是没有常驻守护进程，命令直接通过 fork 和 exec 拉起容器；二是默认支持无根模式，普通用户无需 root 权限即可创建和运行容器。

适合使用 Podman 的场景包括：多用户共用一台服务器、不能给每个人 root 级权限时，让每人用自己的账号跑自己的容器；安全要求高的环境，希望容器逃逸后攻击者也只拿到普通用户权限；需要让容器服务跟随 systemd 管理、开机自启并统一看日志的场景；已经熟悉 Docker 命令、想平滑迁移的团队。

如果不用无根容器，而是给所有人开放 Docker 守护进程访问权，风险非常直接：docker 组的成员等同于拥有 root 权限，可以挂载宿主机任意目录读写，任何一个账号失守都等于整台服务器失守。另外传统有根容器一旦发生逃逸，容器内的 root 就是宿主机的 root。Rootless 模式通过用户命名空间把容器内 root 映射为宿主机上的普通用户，把逃逸后的损失控制在一个普通账号范围内，这是本章要重点讲清的机制。

## 二、环境准备与前置条件

本章适用于 Ubuntu 22.04 LTS 和 Ubuntu 24.04 LTS。操作使用普通用户 ubuntu，全程尽量不使用 sudo，只有安装软件包和修改系统级配置时才用 sudo。无根模式依赖内核的用户命名空间功能，Ubuntu 默认已开启，可用下面命令确认：

```bash
lsb_release -a
cat /proc/sys/kernel/unprivileged_userns_clone
cat /proc/sys/user/max_user_namespaces
sysctl net.ipv4.ip_unprivileged_port_start
```

第一个文件的值为 1、第二个值大于 0，说明用户命名空间可用。最后一个命令查看普通用户可绑定端口的下限，Ubuntu 默认通常为 0，普通用户可以绑定 80 等低位端口；部分加固过的系统会设为 1024，此时无根容器映射 80 端口会失败，需要改用高位端口或由管理员调整该参数。

还需要确认账号已经分配了 subuid 和 subgid 范围，这是无根模式能工作的前提。检查命令放在第三节详细讲解，安装前先看一眼也不迟：

```bash
grep ubuntu /etc/subuid
grep ubuntu /etc/subgid
getent subuid ubuntu
```

## 三、手把手操作步骤

### 3.1 安装 Podman

Ubuntu 仓库直接提供 podman 包，安装一条命令即可：

```bash
sudo apt update
sudo apt install -y podman uidmap slirp4netns fuse-overlayfs
podman version
podman info
```

各组件作用如下：

| 包名 | 作用 |
| --- | --- |
| podman | 容器引擎本体，提供 podman 命令 |
| uidmap | 提供 newuidmap 和 newgidmap 工具，负责用户和组 ID 映射 |
| slirp4netns | 为无根容器提供用户态网络，容器无需 root 也能上网 |
| fuse-overlayfs | 在无特权条件下提供 overlay 存储驱动的备选实现 |

!!! note "Ubuntu 版本差异"

    Ubuntu 22.04 仓库中的 Podman 版本相对较旧，功能够用但部分新特性如 Quadlet 需要更高版本；Ubuntu 24.04 仓库版本更新，Quadlet 支持更完整。如果 22.04 上发现 quadlet 相关命令或目录不存在，多半是版本原因，不要反复重装，先用 podman version 确认版本，再决定是接受功能差异还是升级系统。不要为了追新版本去添加来历不明的第三方源。

安装后先做存储和网络的自检：

```bash
podman info --debug
podman run --rm docker.io/library/hello-world
```

### 3.2 Rootless 原理与 subuid 和 subgid

无根模式的核心是 Linux 用户命名空间。容器内看到的 root 用户 ID 为 0，但它在宿主机上被映射为启动容器的那个普通用户的 ID，例如 1000；容器内的其他用户 ID 则映射到一段为该用户预留的宿主机 ID 区间。这段区间就记录在 /etc/subuid 和 /etc/subgid 两个文件里。

两个文件的格式完全一致，每行三段，用冒号分隔，格式为用户名、起始 ID、数量。示例内容如下：

```text
ubuntu:100000:65536
opsadmin:165536:65536
```

逐行讲解示例第一行：ubuntu 用户的映射区间从宿主机 ID 100000 开始，共 65536 个。也就是说容器内的 ID 1 会对应宿主机 100000，容器内 ID 2 对应 100001，依次类推。每个用户的区间不能重叠，重叠会导致映射混乱。新建普通用户时 Ubuntu 通常会自动追加一行；如果检查发现你的账号没有对应行，需要管理员手工补充。修改前先备份：

```bash
sudo cp /etc/subuid /etc/subuid.bak
sudo cp /etc/subgid /etc/subgid.bak
sudo usermod --add-subuids 200000-265535 --add-subgids 200000-265535 ubuntu
grep ubuntu /etc/subuid /etc/subgid
```

!!! warning "改完映射后要重置存储"

    如果在修改 subuid 和 subgid 之前已经以无根模式拉过镜像或建过容器，旧文件的属主 ID 会和新映射对不上，容器会报权限错误。此时对测试环境可执行 podman system reset 清除该用户的全部容器和镜像后重来；生产环境不要直接重置，先迁移数据再操作。这条命令会删除当前用户的全部 Podman 数据，执行前必须确认。

无根模式另外两个限制要心中有数。一是网络走 slirp4netns 用户态转发，大流量场景性能不如有根模式的网桥直通。二是容器内进程在宿主机上看就是普通用户进程，无法绑定宿主机上受限的资源，也无法修改宿主机系统设置，这是安全性的来源，也是部分需要特权的容器跑不起来的原因。

### 3.3 与 Docker 命令对照

Podman 的常用命令与 Docker 几乎一一对应，多数情况下把命令开头的 docker 换成 podman 即可。完整对照表如下：

| 功能 | Docker 命令 | Podman 命令 |
| --- | --- | --- |
| 拉取镜像 | docker pull nginx:alpine | podman pull nginx:alpine |
| 运行容器 | docker run -d --name web -p 8080:80 nginx:alpine | podman run -d --name web -p 8080:80 nginx:alpine |
| 查看容器 | docker ps -a | podman ps -a |
| 查看镜像 | docker images | podman images |
| 看日志 | docker logs web | podman logs web |
| 进入容器 | docker exec -it web sh | podman exec -it web sh |
| 停止容器 | docker stop web | podman stop web |
| 删除容器 | docker rm web | podman rm web |
| 构建镜像 | docker build -t app:1.0 . | podman build -t app:1.0 . |
| 卷管理 | docker volume ls | podman volume ls |
| 网络管理 | docker network ls | podman network ls |
| 系统清理 | docker system prune | podman system prune |
| Compose 编排 | docker compose up -d | podman compose up -d 或 podman-compose up -d |

```bash
podman pull docker.io/library/nginx:alpine
podman run -d --name web -p 8080:80 docker.io/library/nginx:alpine
podman ps
curl -s http://127.0.0.1:8080/
podman logs web
podman stop web
podman rm web
```

两点差异需要单独说明。第一，镜像名称：Docker 对官方镜像有默认简称，nginx 会被自动补全为 docker.io/library/nginx；Podman 倾向于写全名，未写全时可能弹出注册表选择提示，脚本里请一律写完整镜像名，避免交互卡住。第二，兼容套接字：Podman 可以启动一个兼容 Docker API 的用户级套接字服务，让少数依赖 Docker API 的工具继续工作，命令为 systemctl --user enable --now podman.socket，套接字路径为 /run/user/1000/podman/podman.sock，其中 1000 要换成你自己的用户 ID，用 id -u 查看。

### 3.4 Podman 与 systemd 集成

容器要做到开机自启、异常重启和统一日志，最稳妥的办法是交给 systemd 管理。当前主流做法有两条路线，本节把现状说清楚，避免你照着旧教程走弯路。

路线一是 Quadlet，这是现在的推荐做法，适用于较新的 Podman 版本。Quadlet 允许你写一个简洁的单元描述文件，systemd 的生成器会在开机或重载时把它自动转换成真正的 service 单元。用户级 Quadlet 文件放在 ~/.config/containers/systemd/ 目录下。先创建目录和文件：

```bash
mkdir -p ~/.config/containers/systemd
nano ~/.config/containers/systemd/web.container
```

web.container 完整内容如下：

```ini
[Unit]
Description=Demo web container
After=network-online.target
Wants=network-online.target

[Container]
Image=docker.io/library/nginx:alpine
PublishPort=8080:80
Volume=/home/ubuntu/webdata:/usr/share/nginx/html:ro

[Service]
Restart=always
TimeoutStartSec=120

[Install]
WantedBy=default.target
```

逐段讲解：Unit 段声明服务描述和启动依赖，保证网络就绪后再起容器；Container 段是 Quadlet 专用段，Image 指定镜像，PublishPort 对应 run 命令的端口映射，Volume 对应目录挂载，路径必须是宿主机上真实存在的目录，请先执行 mkdir -p /home/ubuntu/webdata 建好目录再引用；Service 段的 Restart 设为 always 实现异常自动重启；Install 段的用户级写法是 WantedBy=default.target，与系统级服务的 multi-user.target 不要混用。

写完后重载用户级 systemd 并启动：

```bash
systemctl --user daemon-reload
systemctl --user start web.service
systemctl --user status web.service --no-pager
systemctl --user enable web.service
loginctl enable-linger ubuntu
```

最后一条 loginctl enable-linger 很关键：默认情况下用户退出登录后，用户级服务会被停掉；开启 linger 后，用户级服务在开机时启动、关机时才停止，这才是服务器场景想要的效果。

路线二是 podman generate systemd 命令，它能根据已有容器生成 unit 文件。必须说明现状：该命令在新版本 Podman 中已经标记为弃用，官方明确建议迁移到 Quadlet，未来版本可能移除。它目前仍可用于快速生成一份参考配置或迁移存量容器，命令如下，但新建服务请优先用 Quadlet，不要把新系统建在已弃用功能上。

```bash
podman create --name web2 -p 8081:80 docker.io/library/nginx:alpine
podman generate systemd --name web2 --files --new
ls -l container-web2.service
```

### 3.5 Pod 管理

Pod 是 Podman 借鉴 Kubernetes 的概念：一组容器共享同一个网络命名空间，彼此之间可以用 localhost 加端口直接互访，对外只暴露 Pod 层面的端口。它适合把主应用和日志收集、监控探针这类边车容器绑在一起部署。

完整操作流程如下：

```bash
podman pod create --name demopod -p 8080:80
podman run -d --pod demopod --name podweb docker.io/library/nginx:alpine
podman run -d --pod demopod --name podside docker.io/library/alpine:latest sleep infinity
podman pod ps
podman ps -a --pod
podman pod inspect demopod
curl -s http://127.0.0.1:8080/
podman pod stop demopod
podman pod start demopod
podman pod rm -f demopod
```

要点讲解：端口映射只能在创建 Pod 时声明，加入 Pod 的单个容器不能再单独写端口映射参数，写了会直接报错；上面 podside 使用的 alpine:latest 仅为本地演示，生产环境请固定为具体版本标签；Pod 内容器共享网络，所以两个容器不能监听同一个端口；删除 Pod 会连带删除其中全部容器，执行 pod rm 前先确认数据已经落在卷上。

!!! tip "Pod 与 Kubernetes 的关系"

    Podman 的 Pod 在概念上和 Kubernetes 的 Pod 对齐，还可以用 podman generate kube 把 Pod 导出为 Kubernetes 的 YAML 文件，用 podman play kube 再导回来。先在 Podman 上理解 Pod，再去学第 3 章的 Kubernetes，概念迁移成本会低很多。

## 四、效果验证与测试

依次执行以下命令验证本章成果：

```bash
podman version
id
podman ps
systemctl --user status web.service --no-pager
loginctl show-user ubuntu | grep Linger
curl -s http://127.0.0.1:8080/
```

期望结果：podman version 正常输出客户端版本号且不报错；podman ps 能看到 web 容器处于 running 状态，且整个过程没有使用 sudo；systemctl --user status 显示 web.service 为 active 且 running；Linger 一项显示 yes，说明退出登录后服务仍会保持运行；curl 返回 Nginx 欢迎页或你放在 webdata 目录里的页面内容，说明 Quadlet 托管的容器端口和挂载都生效。再补一条进程检查，在宿主机上确认容器进程属主是普通用户：

```bash
ps aux | grep nginx
```

输出中进程属主应为 ubuntu 而不是 root，这就是无根模式生效的直接证据。

## 五、常见错误与排坑指南

场景一：无根容器启动报 ID 映射相关错误。报错原文片段如下：

```text
Error: cannot set up namespace using newuidmap: exit status 1
```

原因是 /etc/subuid 或 /etc/subgid 里没有当前用户的条目，或 uidmap 包没有装。修复命令：

```bash
sudo apt install -y uidmap
grep ubuntu /etc/subuid /etc/subgid
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ubuntu
podman system reset -f
podman run --rm docker.io/library/alpine:latest echo ok
```

其中区间数值要与文件里其他用户已占用的区间错开，不要照抄到与别人重叠。重置命令会清空当前用户的 Podman 数据，仅在测试或确认无重要数据时执行。

场景二：用户级服务在退出登录后被停掉。现象是 systemctl --user status 显示服务 inactive，journal 里有 Stopping user manager 字样。原因是没有开启 linger。修复命令：

```bash
loginctl enable-linger ubuntu
loginctl show-user ubuntu | grep Linger
systemctl --user enable --now web.service
```

场景三：无根容器映射低位端口失败。报错原文片段如下：

```text
Error: rootlessport cannot expose privileged port 80, you can add net.ipv4.ip_unprivileged_port_start=0 to /etc/sysctl.conf
```

原因是系统把普通用户可绑定端口下限设成了 1024。两种修复办法：业务侧把映射改成高位端口，例如 -p 8080:80，这是推荐做法，不动系统参数；确需使用 80 端口时，由管理员备份 /etc/sysctl.conf 后追加参数并生效：

```bash
sudo cp /etc/sysctl.conf /etc/sysctl.conf.bak
echo "net.ipv4.ip_unprivileged_port_start=0" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 回滚与恢复：Podman 升级或迁移失败如何退回

无根 Podman 的全部数据都在当前用户目录下，回退是否走得通，取决于动手前有没有导出三样东西：镜像、卷数据、systemd 单元文件。升级 Podman 版本或做迁移之前，先留一份底：

```bash
mkdir -p ~/podman-backup
podman version > ~/podman-backup/before.txt
podman ps -a >> ~/podman-backup/before.txt
podman images >> ~/podman-backup/before.txt
podman volume ls >> ~/podman-backup/before.txt
podman save -o ~/podman-backup/nginx-alpine.tar docker.io/library/nginx:alpine
cp -a ~/.config/containers/systemd ~/podman-backup/systemd-units
```

镜像有几个关键的就逐个 save 几个。卷数据按存放方式分两种备份：3.4 节 Quadlet 示例用的绑定目录直接打包；命名卷（卷名换成 `podman volume ls` 里的实际名字，本例写作 appdata）用一个临时容器把卷内容打成 tar 包：

```bash
tar -czf ~/podman-backup/webdata.tar.gz -C /home/ubuntu webdata
podman run --rm -v appdata:/data:ro -v "$HOME/podman-backup:/backup" docker.io/library/alpine:latest tar -czf /backup/appdata.tar.gz -C /data .
```

版本回退：升级后容器起不来或行为异常，先把 Podman 本体降回旧版。版本号不要凭记忆写，先查仓库里还提供哪些版本，再指定旧版本号安装（命令里的版本号以查询结果为准）：

```bash
apt-cache policy podman
sudo apt install -y "podman=<上一步查到的旧版本号>"
podman version
podman ps -a
```

降级后若 `podman info` 报存储不兼容，不要执行 `podman system reset`——那是清空全部数据的命令。先把用户存储改名封存、让旧版重建空存储，再用留底的 tar 把镜像导回来：

```bash
mv ~/.local/share/containers ~/.local/share/containers.after-upgrade
podman load -i ~/podman-backup/nginx-alpine.tar
podman images
```

卷数据随之恢复：绑定目录解包回原位置；命名卷先建空卷再把 tar 内容灌回去：

```bash
tar -xzf ~/podman-backup/webdata.tar.gz -C /home/ubuntu
podman volume create appdata
podman run --rm -v appdata:/data -v "$HOME/podman-backup:/backup" docker.io/library/alpine:latest tar -xzf /backup/appdata.tar.gz -C /data
```

systemd 单元恢复：Quadlet 单元改坏或被误删时，从留底目录拷回、重载并重新拉起（路线二 `podman generate systemd` 生成的 `.service` 文件同理，备份文件拷回 `~/.config/systemd/user/` 后执行同样的 daemon-reload 与 enable）：

```bash
cp -a ~/podman-backup/systemd-units/. ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user enable --now web.service
systemctl --user status web.service --no-pager
```

若决定整体退回第 1 章的 Docker：save 出的镜像 tar 是 OCI 通用格式，Docker 可直接 load。先停掉 Podman 侧的单元，再在 Docker 侧导镜像、按第 1 章的方式重建容器，卷数据用上面的解包方法灌进 Docker 的卷或绑定目录：

```bash
systemctl --user disable --now web.service
docker load -i ~/podman-backup/nginx-alpine.tar
docker images
```

退完按第四节同一套口径验收：`podman version` 为目标版本、`podman ps` 中容器在跑、`curl -s http://127.0.0.1:8080/` 返回页面、`systemctl --user status web.service` 为 active，四项全对才算回退完成；封存的 containers.after-upgrade 目录先保留，观察确认无碍后再清理。

## 六、生产环境最佳实践与安全建议

第一，无根模式要作为默认选择。只有确实需要特权能力的容器才考虑有根运行，并且要在部署文档里写明原因和影响范围，能拆分的尽量拆分，把特权范围压到最小。

第二，每个服务使用独立的系统账号运行，不要所有容器都挤在同一个用户下。账号隔离加上 subuid 区间隔离后，单个服务出问题不会波及其他服务的数据目录。

第三，配合 systemd 管理时统一开启 linger、设置 Restart 和启动超时，并用 journalctl --user -u 服务名 集中查看日志，纳入宿主机统一的日志收集，不要让容器日志散落在各处无人查看。

第四，镜像同样要固定版本标签并定期更新，无根模式不等于镜像可以不打补丁。容器内应用的漏洞与有根模式下完全相同，更新节奏保持一致。

第五，注意无根网络的性能边界。对外高并发服务上线前做一次压测，如果 slirp4netns 成为瓶颈，再评估改用有根模式或把该服务迁移到独立机器，不要在没有数据的情况下凭感觉选型。

第六，做好数据卷权限的预期管理。由于 ID 映射的存在，宿主机目录挂进容器后看到的属主会发生偏移，这是正常现象。排查权限问题时先用 podman unshare ls -ln 在映射后的视角看文件属主，再决定是否调整，不要直接对宿主机目录执行大范围的 chmod 递归修改。
