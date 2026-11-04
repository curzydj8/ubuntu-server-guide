---
description: "14 Windows 深度技术：PowerShell 自动化——管道与对象模型、常用管理命令的定位、脚本执行策略与安全边界、与传统 CMD 的分工。"
---

# PowerShell 自动化：管道、对象模型与安全边界

## 1. 本章目标

读完本篇，能说清 PowerShell 为什么是“对象管道”而不是“文本管道”，能按管理对象定位常用命令，能说清执行策略到底管什么、不管什么，以及什么时候该用 PowerShell、什么时候 CMD 就够了。

## 2. 背景与问题

Windows 传统的 CMD 批处理传的是**文本**：一条命令输出一堆文字，下一条命令想用其中的某一列，得靠字符串截取、for 循环解析，写起来脆弱、读起来费劲。管理员真正想要的不是“文字”，而是“服务的状态是不是 Running”“磁盘剩余空间是多少”——这些是**结构化数据**。

PowerShell 的解法是：命令之间传**对象**。`Get-Service` 返回的不是描述服务的文字，而是一组服务对象，每个对象带 Status、Name、DisplayName、StartType 等属性；下一条命令可以直接按属性过滤、排序、取值，不用解析文本。这就是 PowerShell 与 CMD 最根本的区别，也是本篇的中心思想。

## 3. 总体架构

PowerShell 由四层组成：

```
┌─────────────────────────────────────────────────┐
│ 宿主：控制台、VS Code、计划任务、远程会话        │
├─────────────────────────────────────────────────┤
│ 命令层：cmdlet（动词-名词）· 函数 · 脚本 · 模块  │
├─────────────────────────────────────────────────┤
│ 引擎层：管道（对象流）· 提供程序（PSDrive）      │
├─────────────────────────────────────────────────┤
│ 适配层：.NET 对象 · WMI/CIM · WinRM 远程处理     │
└─────────────────────────────────────────────────┘
```

- **cmdlet**：内置命令，统一用“动词-名词”命名（例如 `Get-Service`、`Set-Service`、`Start-Service`）。动词表是有限的（Get、Set、New、Remove、Start、Stop 等），名词是管理对象（Service、Process、Item 等）。不知道命令全名时，用动词 + 名词猜，再用 `Get-Command *Service*` 验证——命名规范本身就是一种“可发现性”设计。
- **提供程序（Provider）与 PSDrive**：把不同存储抽象成“驱动器”。文件系统是 `C:`，注册表是 `HKLM:`、`HKCU:`，证书是 `Cert:`。于是同一套 `Get-ChildItem`、`Get-ItemProperty` 既能列目录，也能读注册表（见[注册表与组策略](02-registry-group-policy.md)）。
- **模块（Module）**：命令按功能打包。管理类命令多在内置模块里（例如服务、任务计划、存储、本地账户各有模块），用 `Get-Module -ListAvailable` 可列出本机已装模块。
- **远程处理（Remoting）**：基于 WinRM 协议，用 `Invoke-Command`、`Enter-PSSession` 在远程机器上执行命令。远程管理的对照：Linux 世界用 SSH（见[SSH 原理与服务端安装](../../14-ssh/01-principles-install.md)），Windows 世界用 WinRM；两者目标相同，协议与信任模型不同。

版本说明：Windows 10/11 内置的是 **Windows PowerShell 5.1**；另有跨平台的 **PowerShell 7**（需另行安装，与 5.1 并存）。两者命令大体相通，但 Windows 专属模块仍以 5.1 为主；本文命令以 5.1 可用子集为主，跨版本差异列入未完成项。

## 4. 工作机制

### 4.1 管道与对象模型：先理解“传的是对象”

看一条典型命令：

```powershell
Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object Name, DisplayName, StartType -First 5
```

执行过程分三步：

1. `Get-Service` 产生一组服务对象（不是文字）。
2. `Where-Object` 按属性过滤：只保留 Status 为 Running 的对象。`$_` 代表管道中当前流过的对象。
3. `Select-Object` 按属性取值：只输出 Name、DisplayName、StartType 三列，并取前 5 个。

屏幕上看到的表格只是对象的**默认显示格式**，不是对象本身。这一点决定了三个实用技巧：

- **过滤用属性，不用文本匹配**：`Where-Object Status -eq 'Running'` 比“找包含 Running 的行”可靠，因为它不依赖显示格式。
- **排序与分组用属性**：`Sort-Object StartType`、`Group-Object Status` 直接对属性操作。
- **导出用对象**：`Export-Csv` 导出的是属性表，而不是屏幕表格的截图；下游程序可以直接读。

对象还有方法（对象能做的事），例如服务对象的 `Stop()`、`Start()` 方法；但日常管理更多用 cmdlet（`Stop-Service`）而不是直接调方法，cmdlet 会处理权限、确认与错误。

### 4.2 常用管理命令的定位：按管理对象查，不要背命令大全

PowerShell 的命令按管理对象组织，定位时先问“管什么”，再拼“动词-名词”：

| 管理对象 | 常用命令（定位用） | 说明 |
|---|---|---|
| 服务 | `Get-Service`、`Set-Service`、`Start-Service`、`Stop-Service`、`Restart-Service` | 对应服务控制台的操作；改启动类型用 `Set-Service -StartupType` |
| 进程 | `Get-Process`、`Stop-Process` | 查进程、结束进程；结束前先确认进程归属 |
| 计划任务 | `Get-ScheduledTask`、`Enable-ScheduledTask`、`Disable-ScheduledTask`、`Start-ScheduledTask` | 对应任务计划程序；任务定义本身用任务计划程序或 `Register-ScheduledTask` 创建 |
| 磁盘与卷 | `Get-Disk`、`Get-Volume`、`Get-Partition` | 查磁盘、卷、分区状态与剩余空间 |
| 本地账户 | `Get-LocalUser`、`Get-LocalGroupMember` | 查本地用户与组成员；改动账户需要管理员权限 |
| 事件日志 | `Get-WinEvent` | 查系统与应用日志；排障时按日志名与级别过滤 |
| 注册表 | `Get-ItemProperty`、`Set-ItemProperty`（配合 `HKLM:`、`HKCU:` 驱动器） | 见[注册表与组策略](02-registry-group-policy.md) |
| 执行策略 | `Get-ExecutionPolicy`、`Set-ExecutionPolicy` | 见 4.3 节 |
| 远程管理 | `Invoke-Command`、`Enter-PSSession` | 需目标机器启用 WinRM 远程处理并放行相应防火墙规则 |

两条使用纪律：

1. **先查后改**：改动类命令（Set、Stop、Disable、Remove）执行前，先用对应的 Get 命令确认对象正是你要改的那一个；`Stop-Process` 停错进程的代价比多敲一条命令大得多。
2. **需要管理员权限的操作仍需提权**：以管理员身份运行 PowerShell（右键“以管理员身份运行”），否则改动类命令会因权限不足失败；提权机制见[Windows 系统管理](01-system-management.md)的 UAC 一节。

### 4.3 执行策略与安全边界：它防误触，不防恶意

执行策略（Execution Policy）决定 PowerShell **加载配置文件与运行脚本**的条件。先说结论，再展开：**执行策略不是安全边界**——微软官方文档明确写了这一点。它的作用是防止“不小心运行了脚本”，而不是防止“恶意代码运行”：任何能在本机交互执行命令的人，都可以用多种方式绕过它（例如把脚本内容粘贴到交互会话里逐行执行）。所以“改成 Bypass 就不安全了”和“改成 AllSigned 就安全了”都是误解。

**策略值**（按从严到宽松）：

| 策略 | 含义 |
|---|---|
| Restricted | 不运行任何脚本与配置文件；Windows 客户端的默认策略 |
| AllSigned | 所有脚本（含本地）必须有可信签名 |
| RemoteSigned | 本地脚本可直接运行；从网络下载的脚本必须有签名，或先解除锁定 |
| Unrestricted | 脚本都可运行；对下载的未签名脚本给出警告 |
| Bypass | 不拦截、不提示；用于自动化场景，但要意识到它同时关掉了误触保护 |
| Undefined | 取消本作用域的设置，退回更高优先级作用域的决定 |

**作用域与优先级**（微软官方文档，见文末来源）：

- `MachinePolicy`、`UserPolicy`：由组策略设定，**不能用 cmdlet 修改**；组策略一旦定了执行策略，本地改动无效。
- 其余作用域按优先级决定生效策略：`Process`（仅当前会话，关闭即失效）> `CurrentUser`（仅当前用户）> `LocalMachine`（整机默认）。

实用建议：

- **个人临时跑脚本**：用 `-Scope Process`，只影响当前会话，关窗口即失效，不留持久改动：
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
  ```
- **本机长期开发**：用 `-Scope CurrentUser` 设 RemoteSigned，只影响自己，不影响其他用户。
- **组织统一管控**：用组策略（MachinePolicy/UserPolicy）下发，不要逐台改 LocalMachine。
- **查看现状**：`Get-ExecutionPolicy -List` 列出各作用域的设置，生效的是优先级最高的非 Undefined 项。

脚本签名的补充：AllSigned 要求脚本有可信发布者的签名；签名本身需要证书与签名流程（`Set-AuthenticodeSignature`），小型团队通常用 RemoteSigned + 脚本来源管控（只运行自己写的或内部署名的脚本）代替全量签名。签名体系的原理见[哈希与数字签名](../13-cryptography/02-hash-signature.md)。

### 4.4 与 CMD 的分工：不是谁取代谁

| 场景 | 选谁 | 原因 |
|---|---|---|
| 简单批处理、旧脚本维护 | CMD（.bat） | 存量脚本、启动简单、无需对象处理 |
| 系统管理、批量运维、报表 | PowerShell | 对象管道、结构化输出、可远程 |
| 跨平台脚本（Windows + Linux） | PowerShell 7 或各平台原生工具 | 5.1 只在 Windows 上；跨平台要评估模块可用性 |
| 开机、登录等系统钩子 | 两者皆可，视已有资产定 | 任务计划、组策略脚本均可调用两者 |

混用方式：CMD 里调用 PowerShell 用 `powershell -File 脚本路径`；PowerShell 里调用外部程序直接写程序名，输出是文本（外部程序不返回对象），后续处理要按文本对待——这是混用时最常见的坑：管道一旦接上外部程序，对象就变成了文本。

### 4.5 示例：服务状态报表（示例输出，非实测）

下面是一段“列出正在运行、且为自动启动的服务”的脚本骨架与**示例输出**（示意格式，未在 Windows 上实测；实际输出的服务名与数量因机器而异）：

```powershell
Get-Service | Where-Object { $_.Status -eq 'Running' -and $_.StartType -eq 'Automatic' } |
    Select-Object Name, DisplayName |
    Export-Csv -Path .\running-auto-services.csv -NoTypeInformation -Encoding UTF8
```

示例输出（`running-auto-services.csv` 的示意内容，非实测）：

```csv
"Name","DisplayName"
"Dnscache","DNS Client"
"LanmanWorkstation","Workstation"
```

读法：脚本本身不“打印报表”，它输出的是结构化数据文件；报表、统计、告警都在下游（Excel、监控、下一条命令）里做。这就是对象管道的工作方式：**管理命令负责拿数据，数据处理交给下一环**。

## 5. 关键设计取舍

- **对象管道 vs 文本管道**：对象换来了结构化与可组合，代价是学习曲线——必须理解“属性”与“方法”，不能只凭屏幕文字猜。
- **动词-名词命名 vs 简短命令**：名字长，但可猜、可发现；`Get-Command *Disk*` 就能找回记不清的磁盘命令，换成缩写为主的命名就做不到。
- **执行策略 vs 真正的安全边界**：执行策略只防误触；真正的边界是账户权限、应用控制（如 AppLocker / WDAC）、杀毒扫描。把执行策略当成安全边界，会在它被绕过时毫无防备。
- **Windows PowerShell 5.1 vs PowerShell 7**：5.1 内置、Windows 模块最全；7 跨平台、新特性多，但部分 Windows 专属模块不可用。选型按“跑在哪、用什么模块”定，不要只追新。

## 6. 分类与变体

- **交互式命令**：一条一条敲，即时反馈；适合排障。
- **脚本（.ps1）**：多条命令存文件，可重复执行；受执行策略约束。
- **模块**：命令的打包单位；按功能装卸，`Import-Module` 显式加载。
- **远程会话**：`Enter-PSSession` 交互式远程、`Invoke-Command` 批量远程；目标机需启用 WinRM。
- **Windows PowerShell 5.1 与 PowerShell 7**：并存关系，不是升级替代；命令以 5.1 子集为本文基准。

## 7. 应用与限制

- **批量巡检**：一台机器上写好的巡检脚本，靠远程处理推到多台机器，输出统一格式的 CSV，适合日报、周报。
- **服务与任务治理**：定期导出服务清单与任务清单，对照基线发现“谁偷偷加了自启服务”。
- **日志排障**：`Get-WinEvent` 按时间、级别、事件 ID 过滤，比在事件查看器里逐条翻快得多。
- **限制**：执行策略不是安全边界；跨平台时模块可用性要逐项核对；外部程序的输出是文本，进了管道就不再是对象；需要管理员权限的操作仍需提权，脚本不能替你绕过 UAC。

## 8. 常见误解

- **“Bypass 就是关掉了安全”**：不准确。Bypass 关掉的是“脚本加载的误触保护”，不是系统安全；真正的安全靠账户权限与应用控制。
- **“PowerShell 就是 CMD 的升级版”**：错。两者传的东西根本不同：CMD 传文本，PowerShell 传对象；按 CMD 的文本思路写 PowerShell，是最常见的写不好原因。
- **“改执行策略能防病毒”**：错。恶意代码有多种绕过执行策略的方式；防病毒靠杀毒、应用控制与权限收敛，不靠执行策略。
- **“管道输出的表格就是数据”**：错。表格只是显示格式；要数据就用 `Select-Object` 取属性、用 `Export-Csv` 导出结构化文件。

---

## 文章信息（统一字段）

- 来源：Microsoft Learn《about_Execution_Policies》（https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-7.5&WT.mc_id=CDM-MVP-5004073）；Microsoft Learn《Group Policy processing》（https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-policy/group-policy-processing）
- 适用版本：Windows PowerShell 5.1（Windows 10/11 内置）为主；PowerShell 7 需另行安装，本文命令以 5.1 可用子集为准
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[Windows 系统管理](01-system-management.md)、[注册表与组策略](02-registry-group-policy.md)、[用户、Sudo 与 PAM](../../02-security/02-users-sudo-pam.md)
- 相关主题：[SSH 原理与服务端安装](../../14-ssh/01-principles-install.md)、[哈希与数字签名](../13-cryptography/02-hash-signature.md)、[systemd Timer](../../07-automation/02-systemd-timers.md)
- 未完成项：各 cmdlet 在 PowerShell 7 与 5.1 间的可用性差异未逐条核对；示例输出为示意格式，未在 Windows 上实测；WinRM 远程处理的具体启用步骤与防火墙规则未展开，需以微软官方文档为准
