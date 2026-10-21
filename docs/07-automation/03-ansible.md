---
description: "Ansible 是目前使用最广的开源自动化配置管理工具。它的核心特点是无代理：控制节点通过 SSH 连接被管理节点，用 YAML 文件描述期望状态，再由 Ansible 负责把每台机器调整到期望状态。"
---

# Ansible 自动化配置管理

## 一、概述与使用场景

Ansible 是目前使用最广的开源自动化配置管理工具。它的核心特点是无代理：控制节点通过 SSH 连接被管理节点，用 YAML 文件描述期望状态，再由 Ansible 负责把每台机器调整到期望状态。不需要在被管理节点上预装任何代理程序，只要有 Python 和 SSH 就能纳管，这一点对存量机器特别友好。

典型场景包括：新机器批量初始化，统一建账号、装基础软件包、收紧 SSH 配置、设置时区和主机名；多台机器统一变更，例如批量换一个配置项、批量升级某个软件包；应用部署和配置下发，把同一份配置准确地推到整个集群；合规检查和信息收集，批量采集各节点的系统版本和配置现状。

不用 Ansible、全靠逐台 SSH 手工操作的瓶颈在机器超过五台后会集中爆发：操作不可重复，同一件事在十台机器上做十遍，必然出现某台漏做或做错；没有预演手段，命令敲下去才知道结果；变更无记录，事后无法回答谁在什么时候改了什么。Ansible 的声明式写法加幂等设计，正是为了解决这三个问题：Playbook 写的是目标状态而不是操作步骤，同一份 Playbook 执行多次结果一致，执行前还能用检查模式预演将要发生的变更。本章完成从安装到批量初始化实战的完整入门。

## 二、环境准备与前置条件

本章环境分两类机器。控制节点一台，Ubuntu 22.04 或 24.04，装 Ansible 本体，所有操作都在这台机器上发起。被管理节点若干台，Ubuntu 22.04 或 24.04，需要开启 SSH 服务、有一个可登录且能 sudo 的账号，被管理节点不需要安装 Ansible。

示例约定：控制节点上操作账号为 ubuntu，被管理节点统一使用 opsadmin 账号登录，节点地址使用文档段地址 192.0.2.21、192.0.2.22、192.0.2.23，主机名对应 node1、node2、node3。真实环境请替换为你自己的地址，地址清单只写在 inventory 文件一处，不要散落在各个 Playbook 里。

控制节点先做基础准备，并准备好到各节点的 SSH 免密登录。Ansible 虽然支持交互输入密码，但批量执行时免密密钥是标准做法：

```bash
lsb_release -a
sudo apt update
sudo apt install -y openssh-client sshpass
ls -l ~/.ssh/id_ed25519.pub
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519
ssh-copy-id -i ~/.ssh/id_ed25519.pub opsadmin@192.0.2.21
ssh opsadmin@192.0.2.21 "hostname && id"
```

!!! warning "先小范围再全量"

    Ansible 的危险之处和它的优点是同一件事：一条命令同时改很多台机器。任何新 Playbook 上线都必须走三步：先用 --limit 只跑一台测试节点，再用 --check 预演全量，最后才正式执行全量。本章实战部分会把这三步写进命令，请养成肌肉记忆，不要跳步。

## 三、手把手操作步骤

### 3.1 控制节点安装 Ansible

Ubuntu 上有两种主流装法，只选一种，不要混装。装法一用系统仓库，命令简单但版本偏旧；装法二用 pipx 以当前用户方式安装官方维护的 ansible 包，版本新且不污染系统 Python，本章推荐装法二。

装法一，系统仓库安装：

```bash
sudo apt update
sudo apt install -y ansible
ansible --version
```

装法二，pipx 用户级安装。先装 Python 工具链，再用 pipx 隔离安装，pipx 是官方推荐的命令行工具安装方式：

```bash
sudo apt update
sudo apt install -y python3 python3-pip pipx
pipx ensurepath
pipx install --include-deps ansible
ansible --version
```

执行 pipx ensurepath 后需要重新打开终端，ansible 命令才会在 PATH 里。ansible --version 能输出版本号和配置文件路径即安装成功，本章后文命令与装法无关，两种都适用。

### 3.2 编写 inventory 清单

inventory 是 Ansible 的主机清单，决定命令对哪些机器执行。先建项目目录，再写清单文件：

```bash
mkdir -p ~/ansible-lab
cd ~/ansible-lab
nano inventory.ini
```

inventory.ini 完整内容如下：

```ini
[webservers]
node1 ansible_host=192.0.2.21
node2 ansible_host=192.0.2.22

[dbservers]
node3 ansible_host=192.0.2.23

[all:vars]
ansible_user=opsadmin
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_private_key_file=/home/ubuntu/.ssh/id_ed25519
```

逐段讲解：方括号是分组名，webservers 组包含两台，dbservers 组包含一台，一台机器可以同时出现在多个组里；ansible_host 是真实连接地址，左边的 node1 是 Ansible 内部使用的主机名，两者不要混为一谈；all:vars 段是对全组生效的变量，ansible_user 指定统一登录账号，ansible_python_interpreter 明确指定被管理节点的 Python 路径，可避免部分节点自动探测失败，私钥路径请按控制节点上 ubuntu 用户的实际路径填写。项目级配置文件 ansible.cfg 与 inventory 放在同一目录，完整内容如下，它把清单路径和常用默认项固定下来，后续命令就不用每次带 -i 参数：

```ini
[defaults]
inventory = inventory.ini
host_key_checking = False
retry_files_enabled = False
forks = 10

[privilege_escalation]
become = False
become_method = sudo
```

```bash
cd ~/ansible-lab
ansible all -m ping
ansible webservers -m ping
ansible all -a "hostname"
```

### 3.3 ad-hoc 临时命令

ad-hoc 是 Ansible 的一次性命令模式，不写 Playbook，直接在命令行指定模块执行，适合临时巡检和小变更。常用命令如下，逐条执行体会模块参数的写法：

```bash
ansible all -m setup -a "filter=ansible_distribution*"
ansible all -a "uptime"
ansible webservers -m apt -a "name=htop state=present" --become
ansible all -m copy -a "src=/tmp/motd.txt dest=/tmp/motd.txt mode=0644"
ansible all -m file -a "path=/tmp/motd.txt state=absent"
ansible dbservers -m service -a "name=cron state=restarted" --become
```

!!! tip "临时命令的选择顺序"

    同一件事优先用专用模块，其次才用 command 和 shell 模块。专用模块自带幂等判断，例如 apt 模块装已存在的包会直接返回无变更，而 command 模块每次都真实执行且永远报告已变更，还会掩盖真实状态。shell 模块支持管道和重定向，command 不支持，两者都属于兜底手段。

### 3.4 Playbook 实战：批量初始化节点

下面这份 Playbook 完成新节点初始化的四件标准事：创建统一运维账号、安装基础软件包、收紧 SSH 配置、设置时区。先写文件，文件名 init-nodes.yaml：

```bash
cd ~/ansible-lab
cp init-nodes.yaml init-nodes.yaml.bak 2>/dev/null || echo "无旧文件，跳过备份"
nano init-nodes.yaml
```

完整内容如下，不要删减任何任务：

```yaml
---
- name: 初始化全部节点
  hosts: all
  become: true
  vars:
    admin_user: opsadmin
    base_packages:
      - vim
      - curl
      - htop
      - net-tools
      - unattended-upgrades
  tasks:
    - name: 创建运维账号
      ansible.builtin.user:
        name: "{{ admin_user }}"
        groups: sudo
        shell: /bin/bash
        create_home: true
        state: present
    - name: 分发运维账号公钥
      ansible.builtin.authorized_key:
        user: "{{ admin_user }}"
        state: present
        key: "{{ lookup('file', '/home/ubuntu/.ssh/id_ed25519.pub') }}"
    - name: 更新软件包缓存
      ansible.builtin.apt:
        update_cache: true
        cache_valid_time: 3600
    - name: 安装基础软件包
      ansible.builtin.apt:
        name: "{{ base_packages }}"
        state: present
    - name: 设置时区为 Asia/Shanghai
      community.general.timezone:
        name: Asia/Shanghai
    - name: 备份并收紧 SSH 配置
      ansible.builtin.copy:
        src: /etc/ssh/sshd_config
        dest: /etc/ssh/sshd_config.bak
        remote_src: true
        force: false
    - name: 禁止 SSH 密码登录
      ansible.builtin.lineinfile:
        path: /etc/ssh/sshd_config
        regexp: "^#?PasswordAuthentication"
        line: "PasswordAuthentication no"
        validate: "/usr/sbin/sshd -t -f %s"
      notify: 重启 SSH 服务
    - name: 禁止 root 直接登录
      ansible.builtin.lineinfile:
        path: /etc/ssh/sshd_config
        regexp: "^#?PermitRootLogin"
        line: "PermitRootLogin no"
        validate: "/usr/sbin/sshd -t -f %s"
      notify: 重启 SSH 服务
  handlers:
    - name: 重启 SSH 服务
      ansible.builtin.service:
        name: ssh
        state: restarted
```

!!! warning "改 SSH 配置前确认密钥能登录"

    禁止密码登录的任务一旦生效，密钥失效的节点将无法再用密码补救。在执行这份 Playbook 前，必须先逐台验证 opsadmin 用密钥能正常登录且 sudo 可用，也就是 3.2 节的 ping 测试全部通过。执行顺序也要遵守：先 --limit 跑一台，亲手用密钥重新登录验证成功，再放行全量。

按标准三步执行：

```bash
cd ~/ansible-lab
ansible-playbook init-nodes.yaml --syntax-check
ansible-playbook init-nodes.yaml --check --diff --limit node1
ansible-playbook init-nodes.yaml --limit node1
ssh opsadmin@192.0.2.21 "id && sudo -n true && echo sudo-ok"
ansible-playbook init-nodes.yaml --check --diff
ansible-playbook init-nodes.yaml
```

--syntax-check 只查语法；--check 是预演模式，只报告将会发生的变更不真正改机器；--diff 同时显示文件内容的前后差异，改配置类任务必带；--limit 限定本次只对指定节点执行。三步都无异常才去掉 --limit 全量执行。

### 3.5 Role 结构入门

当 Playbook 越写越长、多个项目要复用同一套任务时，就该把任务拆成 Role。Role 是 Ansible 的标准目录组织方式，把任务、变量、模板、处理器各归其位。用官方脚手架生成一个名为 base 的 Role：

```bash
cd ~/ansible-lab
mkdir -p roles
cd roles
ansible-galaxy role init base
find base -type f | sort
```

| 目录 | 用途 |
| --- | --- |
| tasks | 任务入口，main.yaml 是主文件 |
| handlers | 处理器定义，放重启服务类任务 |
| defaults | 默认变量，优先级最低，给调用方留覆盖余地 |
| vars | 固定变量，优先级高于 defaults |
| templates | Jinja2 模板文件，生成的配置文件放这里 |
| files | 原样分发的静态文件 |
| meta | Role 的说明和依赖声明 |

把 base 的任务拆分完成后，主 Playbook 就简化为引用形式。新建 site.yaml，完整内容如下：

```yaml
---
- name: 应用基础初始化
  hosts: all
  become: true
  roles:
    - base
```

执行方式与普通 Playbook 完全相同，同样遵守先灰度再全量的顺序：

```bash
cd ~/ansible-lab
ansible-playbook site.yaml --check --diff --limit node1
ansible-playbook site.yaml --limit node1
ansible-playbook site.yaml
```

入门阶段做到会生成、会拆分、会引用即可，不要一开始就追求把所有逻辑都 Role 化。先有一份能跑的 Playbook，再在第二次复用时抽 Role，是最稳妥的演进节奏。

### 3.6 幂等与检查模式

幂等是 Ansible 最重要的概念：同一份 Playbook 对同一批节点重复执行多次，最终状态一致，且第二次执行时没有实际变更的任务应报告为 ok 而不是 changed。实现幂等靠的是模块自身的状态判断，例如 apt 模块发现包已安装就不再动手，lineinfile 发现目标行已存在就不再改文件。破坏幂等最常见的原因是滥用 command 和 shell 模块，以及用 shell 做文件追加。凡是能用专用模块表达的操作，一律不用 shell 兜底，这是写 Playbook 的硬性纪律。

检查模式 --check 用来在动手前预演，配合 --diff 看内容差异。需要注意两个边界：一是个别不支持检查模式的模块会被跳过并给出提示，预演结果里要留意 skipped 的数量；二是检查模式下，后续任务依赖前面任务实际产物时，预演结果可能与真实执行不完全一致。因此检查模式是重要参考而不是绝对保证，灰度一台真实执行这一步永远不能省。本章所有全量执行命令前都放了检查模式命令，请保持这个顺序。

## 四、效果验证与测试

Playbook 全量执行后做四项验证：

```bash
cd ~/ansible-lab
ansible-playbook init-nodes.yaml
ansible all -a "id opsadmin"
ansible all -a "timedatectl show -p Timezone --value"
ansible all -m shell -a "grep -E '^(PasswordAuthentication|PermitRootLogin)' /etc/ssh/sshd_config"
ssh opsadmin@192.0.2.22 "hostname && dpkg -l htop | tail -n 1"
```

期望结果：第二次完整执行 init-nodes.yaml 时，汇总行里 changed 的数量应为 0 或接近 0，全部任务以 ok 为主，这就是幂等生效的证据；id 命令在每台上都能查到 opsadmin 且在 sudo 组里；时区统一输出 Asia/Shanghai；SSH 配置在每台上都输出 PasswordAuthentication no 和 PermitRootLogin no 两行；任意抽查一台，htop 已安装。最后单独保留一份执行输出存档，命令为 ansible-playbook init-nodes.yaml | tee /tmp/ansible-run-log.txt，作为本次变更记录。

## 五、常见错误与排坑指南

场景一：连接阶段报主机密钥校验失败。报错原文片段如下：

```text
Host key verification failed
```

原因是节点重装系统后主机密钥变了，控制节点的 known_hosts 里还是旧记录。修复命令是删掉该地址的旧记录后重新连接确认：

```bash
ssh-keygen -R 192.0.2.21
ssh opsadmin@192.0.2.21
ansible node1 -m ping
```

场景二：提权失败。报错原文片段如下：

```text
Missing sudo password
```

原因是任务需要 sudo，但被管理节点的 opsadmin 执行 sudo 需要输密码，而本次执行没有提供。两种处理：临时在命令后加 --ask-become-pass，执行前统一输入一次；长期方案是在确认安全要求后，给运维账号配置受限的免密 sudo 规则。不要把 sudo 密码明文写进 Playbook 和变量文件，这类文件一旦进了仓库就等于公开。

场景三：模块找不到。报错原文片段如下：

```text
couldn't resolve module/action 'community.general.timezone'
```

原因是该模块属于社区合集，当前安装没有包含。修复命令：

```bash
ansible-galaxy collection install community.general
ansible-doc community.general.timezone
```

装完先用 ansible-doc 确认模块存在，再重跑 Playbook。遇到同类报错时先判断模块属于核心还是某个合集，按报错里点分名字的前两段去安装对应合集，不要盲目重装整个 Ansible。

## 六、生产环境最佳实践与安全建议

第二，敏感变量用 Ansible Vault 加密，不要明文写在变量文件里。创建加密变量文件的命令为 ansible-vault create group_vars/all/vault.yaml，执行 Playbook 时加 --ask-vault-pass 输入口令。Vault 口令本身按团队密钥管理规范保管，不与仓库放在一起。

第三，执行纪律固定化：语法检查、单台灰度、全量预演、全量执行、结果验证五步缺一不可，并把每次全量执行的输出留档。批量工具的价值建立在可控上，跳步省下的几分钟，远不够赔一次批量误操作。

第四，账号与密钥定期轮换。各节点统一使用密钥登录并关闭密码登录后，控制节点的私钥就是核心资产，权限必须为 600，存放在加密磁盘上，人员离岗时立即从全部节点的 authorized_keys 里移除对应公钥，用 Ansible 本身就能批量完成这件事。

第五，控制节点本身要纳入备份和管控。能免密登录全部节点的控制节点一旦失守，等于整个机群失守。控制节点只允许少数运维人员登录，开启登录审计，不在上面运行无关服务。
