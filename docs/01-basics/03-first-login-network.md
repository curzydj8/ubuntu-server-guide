# 首次登录与网络初始化

## 一、概述与使用场景

系统装好后的第一小时决定这台服务器是否好管。本章完成三件事：首次登录后的基础核查与安全动作、用 Netplan 配置静态地址和 DNS、按需配置网桥与 VLAN。网络是服务器的命脉，地址规划不清、DNS 配错、网桥写错，都会直接表现为连不上、解析不了、虚拟机不通，而且这类故障在远程操作时还会把运维人员自己关在门外，因此本章对每一次改动都给出备份、校验和回退办法。

为什么服务器必须用静态地址，道理很直接：其他机器、监控系统、防火墙规则和证书申请都按地址来找它，地址一变，全部失效。DHCP 适合办公终端，服务器段应使用规划好的固定地址，或至少在 DHCP 服务器上做地址保留。本章采用 Netplan 直接写静态地址的方法，这是 Ubuntu Server 从 18.04 以来统一的网络配置方式，底层由 systemd-networkd 渲染生效。

DNS 配置常被低估。地址通但 DNS 错时，表现为能用地址访问却打不开任何域名，软件更新、时间同步和证书申请会接连失败。本章把网关连通、外网地址连通、域名解析三段测试拆开执行，故障出现在哪一段就查哪一段，不靠猜测。

网桥与 VLAN 是进阶场景：跑虚拟机并让它们像独立机器一样出现在局域网里，需要把物理网卡接入网桥；在一条物理链路上承载多个网段，需要用 VLAN 子接口配合交换机 trunk 口。两类配置写错都会立刻断网，远程操作必须先用带自动回退的试应用方式。

## 二、环境准备与前置条件

版本基线为 Ubuntu Server 22.04 LTS 和 24.04 LTS，两者默认都用 Netplan 管理网络，配置文件位于 /etc/netplan 目录，渲染器为 systemd-networkd。需要 sudo 权限，操作账号示例为 opsadmin。开始前先确认你手头有完整的地址规划信息，缺任何一项都不要动手改网络。

规划信息清单如下表，示例值全部来自文档地址段，请换成你的真实规划后再执行。

| 项目 | 示例值 | 获取方式 |
|------|--------|----------|
| 本机静态地址与掩码 | 192.0.2.10/24 | 网络规划表，确认未被占用 |
| 默认网关 | 192.0.2.1 | 路由器或网关设备地址 |
| DNS 服务器 | 192.0.2.53 与 198.51.100.53 | 内网 DNS 或运营商提供的 DNS |
| 物理网卡名 | enp3s0 | 用 ip link 在本机确认 |
| VLAN 编号与网段 | VLAN 20 对应 198.51.100.0/24 | 交换机配置与规划表一致 |
| 网桥成员与用途 | br0 承载虚拟机流量 | 虚拟化规划 |

依赖包方面，Netplan 是系统自带组件，不需要额外安装。需要用到的诊断工具 ip、ping、dig、resolvectl 都在默认安装中，dig 若缺失可安装 dnsutils 包补齐。操作通道方面，强烈建议第一次改网络时人站在机器旁边或使用带外管理控制台，纯远程操作时必须使用本章给出的试应用流程。

!!! warning "22.04 与 24.04 的网关写法差异"

    24.04 的 Netplan 已不再接受 gateway4 字段，写了会报废弃警告甚至校验失败。22.04 虽然兼容旧写法，也应统一改用 routes 写法指定默认路由。本章所有示例都使用 routes 写法，在两个版本上都能直接通过校验。

!!! note "cloud-init 管理的配置文件"

    云镜像或某些安装方式生成的配置文件名可能是 50-cloud-init.yaml，文件开头会注明由 cloud-init 生成。若你改完重启后配置被还原，说明 cloud-init 在开机时重新生成了它，应改在编号更大的文件中写配置，例如 99-config.yaml，Netplan 按文件名顺序合并，后写的文件优先级更高。

## 三、手把手操作步骤

### 步骤一：首次登录核查与基础动作

用 opsadmin 在控制台或通过 DHCP 临时地址远程登录，依次执行以下命令建立系统基线。

```bash
whoami
hostnamectl
lsb_release -a
ip address show
ip route show
timedatectl
systemctl status ssh --no-pager
```

逐项确认：当前用户为 opsadmin 且能用 sudo 执行命令；主机名与安装规划一致；系统版本是预期的 LTS；网卡已拿到 DHCP 地址且默认路由存在；系统时间与时区正确，时区不对时执行 `sudo timedatectl set-timezone Asia/Shanghai` 修正；SSH 服务状态为 active。接着立刻打上第一批安全更新，避免新装系统带着已知漏洞长时间运行。

```bash
sudo apt update
sudo apt upgrade -y
```

### 步骤二：备份并查看现有 Netplan 配置

改任何网络配置前先备份，这是本章的硬性规则。先列出文件，再把要改的文件复制为带日期的备份。

```bash
ls -l /etc/netplan/
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.bak-20261021
sudo cat /etc/netplan/50-cloud-init.yaml
```

记下原文件中的网卡名和渲染器写法，后面的新配置要与之保持一致的缩进风格。若目录里有多个 yaml 文件，先分清每个文件的职责再动手，不要在多个文件里重复定义同一块网卡。

### 步骤三：配置静态地址与 DNS

用编辑器打开配置文件，把内容改成下面的完整示例。Netplan 使用 YAML 格式，只能用空格缩进，绝对不能用 Tab，同一层级的缩进必须对齐，这是本章最高频的出错点。

```bash
sudo nano /etc/netplan/50-cloud-init.yaml
```

写入以下完整内容，地址按你的规划替换。

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp3s0:
      dhcp4: false
      dhcp6: false
      addresses:
        - 192.0.2.10/24
      routes:
        - to: default
          via: 192.0.2.1
      nameservers:
        addresses:
          - 192.0.2.53
          - 198.51.100.53
        search:
          - example.com
```

参数逐行讲解如下表。

| 配置行 | 含义 | 填错后果 |
|--------|------|----------|
| version 2 | Netplan 配置格式版本 | 写错会被校验直接拒绝 |
| renderer networkd | 由 systemd-networkd 负责渲染 | 服务器保持 networkd，不要写 NetworkManager |
| dhcp4 false | 关闭 IPv4 的 DHCP | 不关闭时静态地址可能被动态地址干扰 |
| addresses | 本机地址列表，斜杠后是掩码位数 | 与他人重复会造成双方间歇断网 |
| routes to default | 默认路由，via 是网关地址 | 网关填错只能通本网段，出不了外网 |
| nameservers addresses | DNS 服务器列表，按顺序查询 | 全部填错时地址能通但域名无法解析 |
| nameservers search | 域名搜索后缀，短名自动补全 | 可选，写错只影响短名解析 |

保存后先校验语法，再试应用。校验命令只检查不生效，试应用在 120 秒内没有得到确认会自动回退旧配置，是远程操作的安全绳。

```bash
sudo netplan generate
sudo netplan try
```

在试应用的倒计时内完成第四节的连通测试，确认无误后按回车固化。若你就在控制台前操作，也可校验通过后直接执行 `sudo netplan apply` 生效。最后收紧文件权限，新版 Netplan 会对权限过宽的配置文件发出警告。

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
```

### 步骤四：配置网桥供虚拟机使用

需要跑虚拟机时，把地址从物理网卡移到网桥上，物理网卡只做桥的成员。改配置前同样先备份，本次把新配置写入独立文件便于回退。

```bash
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.before-bridge-20261021
sudo nano /etc/netplan/60-bridge.yaml
```

写入以下完整内容。注意物理网卡 enp3s0 在此文件中不再配置地址，宿主机地址落在 br0 上；若原文件还给 enp3s0 配了地址，要把原文件中该网卡的地址段删掉，避免同一网卡被两处定义。

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp3s0:
      dhcp4: false
      dhcp6: false
  bridges:
    br0:
      interfaces:
        - enp3s0
      dhcp4: false
      addresses:
        - 192.0.2.10/24
      routes:
        - to: default
          via: 192.0.2.1
      nameservers:
        addresses:
          - 192.0.2.53
      parameters:
        stp: false
        forward-delay: 0
```

参数讲解：interfaces 列出加入网桥的物理网卡；stp false 表示关闭生成树协议，单网卡接普通交换机时可关以加快转发，接入复杂拓扑时应听从网络管理员要求开启；forward-delay 0 表示端口立即进入转发状态。写完后依次执行 `sudo netplan generate` 和 `sudo netplan try`，确认连通后再固化。

### 步骤五：配置 VLAN 子接口

交换机侧先把连接本机的端口配成 trunk 并放行对应 VLAN，本机侧再建子接口。子接口命名规则是网卡名加圆点加 VLAN 编号，例如 enp3s0.20 表示在 enp3s0 上承载 VLAN 20。改配置前先备份要编辑的文件。

```bash
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.before-vlan-20261021
sudo nano /etc/netplan/70-vlan.yaml
```

写入以下完整内容，此例让物理网卡保留宿主机业务地址，同时新增 VLAN 20 子接口承载另一网段。

```yaml
network:
  version: 2
  renderer: networkd
  vlans:
    enp3s0.20:
      id: 20
      link: enp3s0
      dhcp4: false
      addresses:
        - 198.51.100.10/24
      nameservers:
        addresses:
          - 198.51.100.53
```

参数讲解：id 是 VLAN 编号，必须与交换机放行的编号一致；link 指明依附的物理网卡；子接口的地址网段必须与该 VLAN 在规划中的网段一致。VLAN 子接口默认不写默认路由，一个系统只应有一条默认路由，多条默认路由会造成出站路径混乱；确需按源地址选路时，那是单独的路由课题，不要在初始化阶段随手添加。校验和试应用命令与前面相同，generate 通过后再 try，确认新网段连通后固化。

!!! tip "VLAN 与网桥组合用法"

    虚拟机需要直接进入某个 VLAN 时，可让 VLAN 子接口充当网桥成员，例如先建 enp3s0.20，再建网桥 br20 把它加入，虚拟机网卡挂到 br20 上。组合配置务必分两步做：先验证 VLAN 子接口在宿主机上能通，再加网桥，避免一次改动叠加两层故障难以定位。

## 四、效果验证与测试

按从近到远的顺序逐段验证，每段都给出命令和期望结果，任一段失败就停在该段排障，不要跳过。

第一段验证本机地址与路由。

```bash
ip address show enp3s0
ip route show
resolvectl status
```

期望结果：静态配置下 enp3s0 或 br0 上出现规划地址 192.0.2.10/24；路由表中有一条 default via 192.0.2.1 的记录；resolvectl 输出的 DNS 服务器与配置文件一致。VLAN 场景再执行 `ip address show enp3s0.20`，应看到 198.51.100.10/24 且链路状态为 UP。

第二段验证网关与外网地址连通。

```bash
ping -c 3 192.0.2.1
ping -c 3 198.51.100.53
```

期望输出示例节选如下，两条都应有回复且丢失率为 0。

```text
3 packets transmitted, 3 received, 0% packet loss
```

第三段验证域名解析与综合连通。

```bash
dig @192.0.2.53 example.com
ping -c 3 example.com
getent hosts example.org
```

期望结果：dig 输出的 ANSWER SECTION 中有解析记录；ping 域名时第一行能显示解析出的地址并收到回复；getent 能返回 example.org 对应的地址记录。三段全过后，再从另一台机器远程登录新地址做最终确认。

```bash
ssh opsadmin@192.0.2.10
```

网桥场景额外执行 `bridge link show` 查看 enp3s0 是否已加入 br0，并从一台虚拟机内 ping 网关验证转发。VLAN 场景从新网段的另一台主机 ping 本机子接口地址验证 trunk 放行无误。

## 五、常见错误与排坑指南

### 错误一：YAML 缩进错误导致配置无法应用

报错原文片段如下。

```text
Error in network definition: line 8 column 4: mapping values are not allowed in this context
```

原因：文件中使用了 Tab 缩进，或同一层级缩进空格数不一致，YAML 解析直接失败。修复方法：用编辑器打开文件，把所有 Tab 替换为空格，并按每层两个空格的标准重新对齐；改前备份和改后校验的命令如下。注意 netplan generate 报错时会指出行号，按行号定位最快。

```bash
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.bad-indent
sudo nano /etc/netplan/50-cloud-init.yaml
sudo netplan generate
```

期望修复后 generate 没有任何输出且返回成功，随后试应用即可生效。

### 错误二：远程改地址后失联

现象：通过远程连接修改静态地址并直接应用后，会话立即断开，新地址和旧地址都连不上。原因：新配置中网关或地址写错，且没有使用试应用的自动回退，机器按错误配置运行后从网络上消失。修复方法只能通过控制台或带外管理登录本机，把备份文件还原后重新应用。

```bash
sudo cp /etc/netplan/50-cloud-init.yaml.bak-20261021 /etc/netplan/50-cloud-init.yaml
sudo netplan generate
sudo netplan apply
ip address show
```

预防重于修复：凡是远程改网络，一律先 generate 校验，再用 netplan try，并在倒计时内从新地址重新登录确认，确认成功后才让试应用固化。

### 错误三：能 ping 通地址但打不开域名

现象：`ping -c 3 198.51.100.53` 正常，`ping example.com` 却报下面的错误。

```text
ping: example.com: Temporary failure in name resolution
```

原因：默认路由和链路都没有问题，故障出在 DNS，常见情形是 nameservers 写错地址、配置文件里 DNS 段缩进错位没有生效、或本机 53 端口的本地解析服务异常。修复步骤：先用 resolvectl status 确认系统当前实际使用的 DNS 是否与配置一致；不一致就重新检查并修正配置文件，改前先备份，再校验和应用；一致但仍失败时，直接向该 DNS 服务器发查询验证它是否可用。

```bash
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.before-dns-fix
resolvectl status
dig @192.0.2.53 example.com
sudo netplan generate
sudo netplan apply
resolvectl flush-caches
```

期望修复后 dig 能返回解析记录，ping 域名恢复正常。

## 六、生产环境最佳实践与安全建议

第一，地址规划成文并预留余量。每台服务器的地址、网关、DNS、VLAN 归属都登记在统一规划表中，同一网段内给基础设施、业务主机和临时测试划出不同号段，新机器上线前先在表中占位查重，杜绝两台机器抢同一地址的事故。

第二，改网络永远走备份、校验、试应用、验证四步。备份文件带日期命名并保留到下一次成功变更之后；任何一步失败就回退备份，不要在故障状态下继续叠加修改。远程变更安排在有人能接触控制台的时间窗口内进行，并提前告知相关同事变更的地址和时间。

第三，DNS 至少配两个且来源不同。主备 DNS 分属不同服务器或不同提供方，单个 DNS 故障时解析自动切换。内部域名解析需求用内部 DNS 承担，不要把内网主机名写进每台机器的 hosts 文件四处散落。

第四，网桥和 VLAN 只在确有需求时启用，并把组合关系画成图存档。哪块网卡进了哪个桥、哪个 VLAN 对应哪个网段、交换机端口模式是什么，都要记录清楚。宿主机管理地址尽量保留在独立的管理网段中，与虚拟机业务流量分开。

第五，初始化收尾时关闭不需要的网络服务并确认防火墙状态，只开放管理端口和业务端口。今天配好的静态地址就是后续所有访问控制规则的锚点。
