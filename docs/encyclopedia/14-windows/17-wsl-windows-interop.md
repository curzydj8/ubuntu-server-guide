---
description: "14 Windows 深度技术：WSL 与 Windows 互操作——双向调用命令、文件系统互访、网络互通、VS Code Remote-WSL 开发、常见互操作问题。"
---

# WSL 与 Windows 互操作

> **实测说明**：Windows / WSL 专属命令无法在当前 Linux 虚拟机上实测。本文所有命令示例一律为**示例未实测**，仅按微软官方文档的命令形式给出；执行前请以官方文档为准，并在自己的 Windows 设备上先小范围验证。

## 1. 一句话定义

WSL 与 Windows 互操作是指 Windows 与 WSL 发行版之间互相调用命令、互相访问文件、互相访问对方网络服务、以及在 WSL 环境里直接做开发的一整套协作能力。

## 2. 为什么需要它

只装好 WSL 还不够：开发者的真实工作流是跨越边界的——在 Linux 里编译好的程序要在 Windows 里打开看效果，在 Windows 里下载的文件要拿到 Linux 里处理，编辑器装在 Windows 上、代码却跑在 Linux 环境里，浏览器在 Windows 上、要访问的服务却监听在 WSL 里。如果每次跨越边界都要靠手动复制文件、反复切换窗口，WSL 省下的时间又会被来回倒腾吃掉。互操作的价值就在于让边界变薄：命令可以互相调、文件可以直接读、服务可以直接连、编辑器可以直接连进 Linux 环境写代码。

本篇只讲互操作本身。安装、发行版选择与备份迁移见[WSL 安装与发行版管理](16-wsl-install-distro.md)，本文不重复；PowerShell 本身的语法与对象管道见[PowerShell 自动化](03-powershell-automation.md)，本文只写它与 WSL 衔接的那一小部分。

## 3. 核心含义

### 3.1 双向调用命令：两边都能当对方的命令行

互操作的第一层是“命令互调”，方向有两个：

**从 Windows 调用 Linux 命令**：在 PowerShell 或命令提示符里，`wsl` 后面直接跟 Linux 命令（示例未实测）：

```powershell
wsl ls -la /home/<用户名>
wsl -d Debian uname -a
```

读法：第一条在默认发行版里执行 `ls`；第二条用 `-d` 指定在 Debian 发行版里执行 `uname -a`。不带 `-d` 时进的是默认发行版——默认发行版是哪个，决定了这条命令跑在哪个发行版里，执行前可用 `wsl --list --verbose` 确认（管理命令见[WSL 安装与发行版管理](16-wsl-install-distro.md)）。

**从 WSL 调用 Windows 程序**：在 WSL 的 shell 里，Windows 可执行文件可以直接运行，文件名要带 `.exe` 后缀（示例未实测）：

```bash
explorer.exe .
notepad.exe README.md
```

读法：第一条用 Windows 资源管理器打开当前 Linux 目录；第二条用 Windows 记事本打开当前目录下的 `README.md`。默认情况下 WSL 会把 Windows 的 PATH 追加到 Linux 的 PATH 里，所以很多 Windows 程序不用写完整路径也能直接调用；如果希望隔离、不让 Windows 程序进 Linux 的 PATH，可以在发行版的 `/etc/wsl.conf` 里配置互操作相关选项（具体配置项以官方文档为准，改动后一般需要重启发行版才生效）。

两个方向各有一个实用要点：

- **管道可以跨边界**：Windows 一侧的 PowerShell 命令输出可以交给 Linux 工具处理，反过来也可以；但管道一旦接上对方的程序，传的就是文本而不是 PowerShell 对象——对象管道只在 PowerShell 内部成立（见[PowerShell 自动化](03-powershell-automation.md)），跨边界后要按文本处理。
- **调用前先确认“在哪个世界”**：同一条命令名在两边可能对应不同程序（例如两边都有名为 `python` 的程序时，跑的是哪一个取决于当前 shell 与 PATH）。排障时先确认当前在 Windows 终端还是 WSL shell，再确认要调的程序来自哪一边。

### 3.2 文件系统互访：两条路，走哪条要看文件住在哪

Windows 与 WSL 各有一套文件系统，互访有两条路，性能与注意事项完全不同：

**从 WSL 访问 Windows 文件**：Windows 的固定磁盘会自动挂载到 WSL 的 `/mnt/` 下，C 盘对应 `/mnt/c`，D 盘对应 `/mnt/d`，以此类推（示例未实测）：

```bash
ls /mnt/c/Users/<Windows用户名>/Desktop/
cp /mnt/c/Users/<Windows用户名>/Downloads/data.csv ~/
```

读法：第一条列出 Windows 桌面上的文件；第二条把 Windows 下载目录里的文件复制到 Linux 家目录。路径写法要换算：Windows 的反斜杠与盘符（`C:\Users\...`）在 Linux 一侧写成正斜杠与挂载点（`/mnt/c/Users/...`）。

**从 Windows 访问 WSL 文件**：在文件资源管理器的地址栏输入 `\\wsl$`，回车后会看到已安装的发行版列表，再进入某个发行版即可浏览它的 Linux 文件系统，例如 `\\wsl$\Ubuntu\home\<用户名>\`。也可以在 WSL 里用 `explorer.exe .` 直接打开当前目录对应的资源管理器窗口（见 3.1 节）。

**最重要的一条性能规则**：项目文件放在哪里，决定了工具跑得快不快。Linux 工具频繁读写的文件（源代码、编译产物、Git 仓库）应放在 **Linux 文件系统内**（如家目录 `~/projects/`），在 WSL 2 下这条路径是快路径；反过来，把项目放在 `/mnt/c` 下、再让 Linux 工具去读写，跨文件系统操作会明显变慢。Windows 工具要编辑 Linux 里的文件时，走 `\\wsl$` 访问即可，不需要把文件拷回 Windows 一侧。反过来也一样：不要直接用 Windows 工具改写 WSL 发行版在磁盘上的虚拟磁盘文件本身，损坏风险见[WSL 安装与发行版管理](16-wsl-install-distro.md)第 5 节。

### 3.3 网络互通：localhost 是默认的桥

WSL 2 的网络默认与 Windows 共享同一台主机的网络视角：

- **Windows 访问 WSL 里的服务**：在 WSL 里启动一个监听在某个端口的服务（例如开发服务器监听 3000 端口），通常可以直接在 Windows 的浏览器里访问 `http://localhost:3000` 打开它，不需要查 WSL 的虚拟网卡地址。这是最常用的开发形态：服务跑在 Linux 里，浏览器留在 Windows 上。
- **WSL 访问 Windows 里的服务**：反方向上，WSL 里的程序访问 Windows 一侧监听的服务时，地址写法与网络模式有关，不同 WSL 版本与网络模式下的行为可能不同；本文不给出唯一地址写法，以官方发布为准（待核实），排障时先确认服务在 Windows 一侧确实在监听、再确认 WSL 一侧的访问地址。
- **局域网其他设备访问**：默认情况下，WSL 里的服务只对本机（Windows 侧 localhost）可见，不直接暴露给局域网；需要让局域网其他设备访问时，涉及 Windows 防火墙与端口转发等额外配置，本文不展开具体步骤，以官方文档与防火墙配置为准。

网络互通排障的通用顺序：先确认服务在它自己那一侧是否已启动并在监听（看服务自身的日志与端口状态），再确认另一侧用的地址与端口是否正确，最后才怀疑防火墙与网络模式；一上来就改网络配置，往往是把“服务没起来”误诊成“网络不通”。

### 3.4 VS Code Remote-WSL 开发：编辑器在 Windows 上，代码跑在 Linux 里

VS Code 的 Remote-WSL 扩展是 WSL 开发最常用的形态：编辑器窗口跑在 Windows 上，但打开的文件夹、终端、调试器与扩展的运行环境都在 WSL 发行版里。基本用法是：

1. 在 Windows 上安装 VS Code，并安装 Remote-WSL 扩展（扩展名称以 VS Code 官方扩展市场为准）。
2. 在 WSL 的 shell 里进入项目目录，执行（示例未实测）：
   ```bash
   code .
   ```
   这条命令会在 Windows 上打开一个已连接到该 WSL 发行版的 VS Code 窗口，当前目录即为工作区。
3. 在这个窗口里打开的集成终端是 WSL 的 shell，运行的命令、安装的扩展（开发相关的部分）、调试的目标都在 Linux 环境里；文件保存在 Linux 文件系统内，符合 3.2 节的性能规则。

这个形态解决了一个实际矛盾：既想用 Windows 上熟悉的编辑器与桌面工具，又想让构建、测试与运行环境与 Linux 服务器一致。需要注意的是：Remote-WSL 窗口与普通 VS Code 窗口是两种连接状态，窗口左下角会显示当前连接到的发行版；如果 `code .` 没有打开远程窗口，先确认 Remote-WSL 扩展已安装、再确认当前 shell 确实在 WSL 里而不是 Windows 终端里。

### 3.5 互操作开关：/etc/wsl.conf

发行版内的 `/etc/wsl.conf` 文件可以配置互操作行为，例如是否允许从 WSL 调用 Windows 程序、是否把 Windows 的 PATH 追加到 Linux 的 PATH、Windows 磁盘的自动挂载是否开启。配置示例（示例未实测，仅示意配置项形式，具体选项以官方文档为准）：

```ini
[interop]
enabled=true
appendWindowsPath=true
```

读法：`enabled` 控制互操作总开关，`appendWindowsPath` 控制是否追加 Windows PATH。改动这类配置后，一般需要用 `wsl --terminate <发行版名称>` 停止发行版再重新进入才能生效。需要隔离的场景（如某个发行版只做构建、不希望 Windows 程序进入它的 PATH）可以关掉相应开关；日常开发保持默认开启即可。

## 4. 典型应用

- **前后端联调**：后端服务跑在 WSL 里监听本地端口，前端浏览器与调试工具留在 Windows 上，通过 `localhost:端口` 直接访问，不用在两边各装一套。
- **跨平台脚本处理**：Windows 一侧用 PowerShell 拿到一批文件清单，交给 WSL 里的 `grep`、`awk` 等 Linux 工具做文本处理；处理完的结果再回到 Windows 一侧归档。
- **Linux 环境开发、Windows 桌面收尾**：代码与构建全在 WSL 里，写文档、做演示、发邮件留在 Windows 上；文件通过 `\\wsl$` 与 `/mnt/c` 双向取用，不用反复复制。
- **教学演示**：同一台电脑上既能演示 Windows 操作，又能立刻切到 Linux shell 演示同一任务的 Linux 做法，对照直观。

## 5. 常见互操作问题

| 现象 | 可能原因 | 处理方向 |
|---|---|---|
| `code .` 没有打开远程窗口 | Remote-WSL 扩展未安装，或当前 shell 不在 WSL 里 | 先确认扩展已安装，再确认终端是 WSL shell 而不是 Windows 终端 |
| 在 `/mnt/c` 下编译、跑测试特别慢 | 项目放在 Windows 文件系统上，Linux 工具跨文件系统读写 | 把项目移到 Linux 文件系统内（如 `~/projects/`），再重新编译验证 |
| Windows 侧 `localhost:端口` 打不开 WSL 里的服务 | 服务未在 WSL 内启动或监听地址不对，或端口号记错 | 先在 WSL 内确认服务已启动并在监听，再核对 Windows 浏览器里的地址与端口 |
| 从 WSL 调 Windows 程序提示找不到命令 | Windows PATH 未追加到 Linux PATH，或程序名漏了 `.exe` | 确认命令带 `.exe` 后缀，再检查 `/etc/wsl.conf` 的互操作配置 |
| 文件在两边看上去内容一样、工具却报错 | 换行符差异（Windows 用 CRLF，Linux 用 LF）或大小写敏感差异 | 文本文件统一换行符（编辑器或版本控制里配置），Linux 文件系统区分大小写、文件名不要只差大小写 |
| 在 Windows 资源管理器里直接改了 WSL 的文件后发行版异常 | 用 Windows 工具直接改写了发行版的数据文件或虚拟磁盘文件 | 改 Linux 文件只走 `\\wsl$`；发行版数据文件的备份与迁移只走 `--export` / `--import`（见[WSL 安装与发行版管理](16-wsl-install-distro.md)） |
| WSL 里看不到某个 Windows 磁盘 | 该磁盘未自动挂载，或挂载配置被改过 | 检查 `/etc/wsl.conf` 的自动挂载配置，确认磁盘在 Windows 一侧正常挂载 |

换行符问题值得单独说明：同一个文本文件在 Windows 与 Linux 工具之间来回传递时，行尾的 CRLF 与 LF 差异可能导致脚本执行失败或版本控制出现整文件 diff。处理原则是“在源头统一”：编辑器与版本控制里配好换行符规则，而不是每次出问题再逐文件转换。

## 6. 限制与常见误解

- **互操作不是“两个系统合二为一”**：Windows 程序与 Linux 程序仍然跑在各自的运行环境里，只是可以互相调用与互相访问文件；Windows 的 `.exe` 在 Linux 里跑不起来原生 Linux 二进制，反之亦然，调用关系要分清方向。
- **localhost 转发不是万能的**：它解决的是本机开发场景；局域网访问、公网暴露、防火墙放行是另外的问题，不要把本机能访问等同于“哪里都能访问”。
- **文件互访不等于文件共享性能一致**：`\\wsl$` 与 `/mnt/c` 只是“能访问”，跨文件系统读写的性能代价仍在；性能敏感的操作要把文件放在执行工具所在的那一侧文件系统里。
- **VS Code Remote-WSL 不是“在 Windows 上装了个 Linux 插件”**：它是在 WSL 里起了一个 VS Code 服务器，编辑器窗口只是前端；断开 WSL 后，窗口里的终端与调试会话也会随之中断。
- **本文不写绕过类操作**：互操作配置只讲官方提供的开关（`/etc/wsl.conf` 的互操作与挂载选项）；任何绕过系统检测、绕过权限管控的操作步骤不在本文范围。

## 7. 小结

WSL 与 Windows 互操作 = 命令双向调（Windows 用 `wsl <命令>`，WSL 里直接跑 `*.exe`）→ 文件双向访（Windows 走 `\\wsl$`，WSL 走 `/mnt/c`，项目放 Linux 文件系统内）→ 网络经 localhost 连通（服务跑在 WSL、浏览器留在 Windows）→ 开发用 VS Code Remote-WSL 连进 Linux 环境。边界变薄不等于边界消失：调用前确认方向，性能敏感的文件放对地方，出问题先分清是哪一侧没起来。

---

## 文章信息（统一字段）

- 来源：Microsoft Learn《安装 WSL》（https://learn.microsoft.com/zh-cn/windows/wsl/install）；Microsoft Learn《Set up a WSL development environment》（https://learn.microsoft.com/en-us/windows/wsl/setup/environment）；Microsoft Learn《FAQ's about Windows Subsystem for Linux》（https://learn.microsoft.com/en-us/windows/wsl/faq）
- 适用版本：Windows 10 2004+（内部版本 19041+）/ Windows 11、WSL 2
- 核实日期：2026-11-06
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[WSL 安装与发行版管理](16-wsl-install-distro.md)、[Windows 系统管理](01-system-management.md)、[PowerShell 自动化](03-powershell-automation.md)
- 相关主题：[WSL 安装与发行版管理](16-wsl-install-distro.md)、[PowerShell 自动化](03-powershell-automation.md)
- 未完成项：本文所有命令示例均未在 Windows/WSL 环境实测，需在真实 Windows 设备上逐条验证后补实测结果；WSL 访问 Windows 一侧服务的地址写法因网络模式而异，以官方发布为准（待核实）；局域网访问与防火墙、端口转发配置未展开；/etc/wsl.conf 各配置项的完整清单与默认值以官方发布为准（待核实）；VS Code Remote-WSL 扩展的版本与具体操作界面以官方发布为准（待核实）
