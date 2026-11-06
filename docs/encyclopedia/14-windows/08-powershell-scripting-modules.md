---
description: "14 Windows 深度技术：PowerShell 脚本编写与模块管理——脚本结构与函数、模块的安装与导入（PowerShell Gallery）、常用模块、日志与错误处理。"
---

# PowerShell 脚本编写与模块管理

> 说明：本文所有 PowerShell 命令示例均未在 Windows 上实测——Windows 专属命令无法在当前 Linux 虚拟机上运行，示例仅作语法示意，使用前请在目标 Windows 环境核对。执行策略的完整含义与策略值对照见[PowerShell 自动化](03-powershell-automation.md)第 4.3 节，本文只作要点回顾，不再重复展开。

## 1. 本章目标

读完本篇，能写出结构清晰的 PowerShell 脚本（参数、函数、注释帮助），会用 PowerShell Gallery 安装、导入、更新与卸载模块，能说出几个常用模块的用途，并能给脚本加上可用的错误处理与日志。

## 2. 背景与问题

交互式敲命令适合排障，不适合重复工作：巡检、备份、报表、批量改配置，这些事每周、每天都要做一遍，靠人一条一条敲既慢又容易敲错。把命令存进脚本（.ps1 文件），把反复用的功能打包成函数与模块，就是把“一次性的操作”变成“可重复、可分享、可审计的资产”。

脚本化带来三个新问题，本篇逐一回答：

1. **怎么写才不乱**：参数怎么声明、函数怎么写、帮助写在哪。
2. **功能从哪来**：内置命令不够用时，去哪找现成的模块，怎么装、怎么导入、版本怎么管。
3. **跑坏了怎么办**：脚本出错时如何分清“可恢复的小错”和“必须停下的大错”，以及如何留下日志供事后追查。

与[PowerShell 自动化](03-powershell-automation.md)的分工：那篇讲“对象管道与命令定位”，本篇讲“把命令组织成可复用的脚本与模块”。两篇合起来，才是完整的 PowerShell 自动化工作流。

## 3. 总体架构

脚本与模块是三层结构：

```
┌───────────────────────────────────────────────────────┐
│ 脚本（.ps1）：一次任务的完整流程，调用函数与 cmdlet    │
├───────────────────────────────────────────────────────┤
│ 函数：可复用的最小单元，带参数、输出对象、帮助注释     │
├───────────────────────────────────────────────────────┤
│ 模块（.psm1 + .psd1）：一组相关函数与命令的打包单位    │
│   来源：内置模块 / PowerShell Gallery / 自写模块       │
└───────────────────────────────────────────────────────┘
```

- **脚本（.ps1）**：纯文本文件，一行或多行命令；双击不会直接执行（默认用记事本打开），在 PowerShell 里用路径调用，例如 `.\巡检.ps1`。
- **函数**：脚本内部或模块内部的命名代码块；好的函数像 cmdlet 一样工作——接受参数、输出对象、支持管道。
- **模块**：命令的打包单位。模块由脚本模块文件（.psm1，函数定义）与模块清单（.psd1，元数据：版本、作者、导出哪些命令）组成；清单不是可选项——没有清单的模块，版本与依赖都管不住。
- **PowerShell Gallery**：微软官方的模块仓库（https://www.powershellgallery.com），`Install-Module` 的默认来源，相当于 PowerShell 世界的“应用商店”。

## 4. 工作机制

### 4.1 脚本结构与函数：先定骨架，再填命令

一段可维护的脚本通常按这个顺序组织：

```powershell
# 示例未实测
#requires -Version 5.1
<#
.SYNOPSIS
    每日服务状态巡检：导出正在运行且为自动启动的服务清单。
.DESCRIPTION
    供任务计划每日调用；输出 CSV 到指定目录，失败时写错误日志并返回非零退出码。
.PARAMETER OutputPath
    输出 CSV 的目录，默认当前目录。
.EXAMPLE
    .\巡检.ps1 -OutputPath C:\Reports
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$OutputPath = '.'
)

function Get-RunningAutoService {
    [CmdletBinding()]
    param()
    Get-Service |
        Where-Object { $_.Status -eq 'Running' -and $_.StartType -eq 'Automatic' } |
        Select-Object Name, DisplayName
}

$services = Get-RunningAutoService
$services | Export-Csv -Path (Join-Path $OutputPath 'running-auto-services.csv') -NoTypeInformation -Encoding UTF8
```

结构要点逐条说清：

- **`#requires`**：声明脚本的最低版本要求（上例要求 PowerShell 5.1）；版本不够时脚本直接拒绝运行，而不是跑到一半才报错。
- **注释帮助（`<# ... #>`）**：写在 `param` 之前的注释块，`Get-Help 脚本路径` 能直接读出来。`.SYNOPSIS`（一句话用途）、`.DESCRIPTION`（详细说明）、`.PARAMETER`（参数含义）、`.EXAMPLE`（用法示例）是最常用的四个段。写脚本不写帮助，等于写了没人敢用的脚本。
- **`param` 块**：脚本的参数声明，放在文件开头。参数应该有类型（`[string]`）、默认值，必填参数用 `[Parameter(Mandatory = $true)]` 标记。参数名用中文还是英文，团队内统一即可；本文示例用英文参数名、中文注释，贴近常见写法。
- **`[CmdletBinding()]`**：让脚本或函数获得 cmdlet 的通用能力，最实用的是 `-Verbose`（显示详细过程）与 `-WhatIf`（只说要做什么、不真做，配合 `SupportsShouldProcess` 使用）。写批量改动类脚本时，建议加上它。
- **函数三段式**：`begin`（准备工作，执行一次）、`process`（对管道中每个对象执行一次）、`end`（收尾，执行一次）。函数不处理管道输入时，只写函数体即可；要支持管道输入（例如 `Get-Service | My-Function`）时，必须写 `process` 块，否则管道里的对象进不来。

函数命名沿用 cmdlet 的“动词-名词”规范（见[PowerShell 自动化](03-powershell-automation.md)第 3 节），动词从批准的动词表里选（Get、Set、New、Test 等），名词说明操作对象。名字起得规范，别人用 `Get-Command *Service*` 就能找到你的函数。

### 4.2 执行策略：要点回顾

执行策略决定 PowerShell **加载配置文件与运行脚本**的条件，完整策略值与各作用域优先级见[PowerShell 自动化](03-powershell-automation.md)第 4.3 节。这里只记三条与写脚本直接相关的结论：

1. **策略管的是“脚本文件”，不是“交互命令”**：在交互会话里逐行粘贴执行不受执行策略限制——所以它防误触、不防恶意，不要把它当安全边界。
2. **写脚本前先确认本机策略**：`Get-ExecutionPolicy -List` 看各作用域；个人临时跑脚本用 `-Scope Process`（只影响当前会话，关窗口即失效）；组织统一下发用组策略，不要逐台改。
3. **自动化调用要显式指定**：任务计划、CI 或其他程序调用脚本时，常用 `powershell -ExecutionPolicy Bypass -File 脚本路径`（示例未实测）的形式——这是在“已知脚本来源可信”的自动化场景下明确声明“不拦截”，而不是绕过安全检查；脚本本身的来源管控（只运行自己写或内部署名的脚本）才是真正的安全措施。

### 4.3 模块的安装与导入：从 Gallery 到本机

**模块装在哪**：PowerShell 按 `$env:PSModulePath` 列出的目录顺序找模块。Windows PowerShell 5.1 下常见的三处是：用户目录（`Documents\WindowsPowerShell\Modules`，当前用户可用）、系统目录（`C:\Program Files\WindowsPowerShell\Modules`，整机可用，需管理员权限）、内置目录（`C:\Windows\system32\WindowsPowerShell\v1.0\Modules`，系统自带）。PowerShell 7 的目录名是 `PowerShell` 而非 `WindowsPowerShell`，两者并存、不混用。

**从 Gallery 安装**（示例未实测）：

```powershell
# 示例未实测
Find-Module -Name Pester                 # 先在 Gallery 里查有没有这个模块
Install-Module -Name Pester -Scope CurrentUser   # 装到当前用户目录，不用管理员权限
Get-InstalledModule                       # 列出已安装的模块与版本
Update-Module -Name Pester                # 升级到 Gallery 上的最新版
Uninstall-Module -Name Pester             # 卸载
```

要点：

- **先查后装**：`Find-Module` 确认模块名拼对了、作者与下载量正常，再装。Gallery 是开放仓库，名字相近的仿冒模块存在，装之前看一眼作者与简介是基本功。
- **作用域**：`-Scope CurrentUser` 装到用户目录，不用管理员权限，是个人使用的默认选择；`-Scope AllUsers` 装到系统目录、整机可用，需要以管理员身份运行。
- **信任提示**：首次从 PSGallery 安装时，PowerShell 会提示该仓库“不受信任”，确认一次后可用 `Set-PSRepository -Name PSGallery -InstallationPolicy Trusted`（示例未实测）改为信任，之后不再逐次提示。只对官方 Gallery 做这个设置，不要对来历不明的仓库设信任。
- **版本管理**：同一模块可并存多个版本，`Import-Module -RequiredVersion 版本号` 指定用哪一个；`Update-Module` 升到最新版，旧版本默认保留，需手动 `Uninstall-Module -RequiredVersion 旧版本号` 清理。

**导入与使用**（示例未实测）：

```powershell
# 示例未实测
Import-Module -Name Pester               # 显式导入模块
Get-Module                                # 列出当前会话已加载的模块
Get-Command -Module Pester                # 列出该模块提供的命令
Remove-Module -Name Pester                # 从当前会话卸载（不删除文件）
```

补充两点：

- **自动导入**：多数情况下不需要手动 `Import-Module`——PowerShell 3.0 起，调用某个模块的命令时会自动加载该模块。显式导入主要用于“确认模块确实可用”“指定版本”“在脚本开头声明依赖”三种场景。
- **自写模块的安装**：把 `.psm1` 与 `.psd1` 放进 `$env:PSModulePath` 下的 `模块名\版本号\` 目录，就算“安装”完成；也可以用 `Import-Module .\MyModule.psm1` 直接从路径导入（适合开发调试）。自写模块的清单用 `New-ModuleManifest` 生成骨架再填，不要手写空清单。

### 4.4 常用模块举例：按用途找，不要背清单

下表只列用途明确、来源可查的常见模块；是否装、装哪个版本，以 PowerShell Gallery 当前发布为准（待核实），不要照抄版本号。

| 用途 | 模块（Gallery 上的名称） | 说明 |
|---|---|---|
| 脚本质量 | PSScriptAnalyzer | 静态检查：命名、风格、常见错误，相当于 PowerShell 的“代码检查器” |
| 脚本测试 | Pester | 单元测试框架：给函数写测试用例，改动后一键验证 |
| 包管理 | PowerShellGet | 提供 `Install-Module`、`Find-Module` 等命令；5.1 内置，7 的新版本功能更多 |
| 云平台 | Az | 微软 Azure 的管理模块；按服务分子模块，可只装需要的部分 |
| 云平台 | AWS.Tools | 亚马逊云科技的管理模块；同样按服务分子模块 |
| 虚拟化 | VMware.PowerCLI | VMware vSphere 的管理模块 |
| 目录服务 | ActiveDirectory | 域内用户、计算机、组的管理；需安装 RSAT 工具后可用，域环境才有意义 |
| 数据库 | SqlServer | SQL Server 的管理模块 |
| 协作平台 | Microsoft.Graph、PnP.PowerShell | 分别面向 Microsoft Graph 与 SharePoint/Teams 的管理 |

选模块的三条纪律：先在 Gallery 核对作者与最新版（不要装无人维护的旧版本）；只装当前任务需要的模块（模块装得多，加载与冲突的排查成本就高）；生产脚本的开头用 `Import-Module -RequiredVersion` 锁定版本，避免“今天能跑、明天 Gallery 更新后跑不了”。

### 4.5 日志与错误处理：出错时要能定位，不要只靠屏幕

**两类错误，先分清**（示例未实测）：

```powershell
# 示例未实测
# 非终止错误：单条命令失败，脚本继续往下跑
Get-Item C:\不存在的文件.txt -ErrorAction Continue
# 终止错误：整个脚本停下，除非被 try/catch 接住
Get-Item C:\不存在的文件.txt -ErrorAction Stop
```

- **非终止错误**：单条命令失败（例如文件不存在、某台机器连不上），默认只显示错误信息、脚本继续执行。适合“批量处理一百台机器、坏一台不要停全部”的场景。
- **终止错误**：脚本直接停下。多数 cmdlet 的错误默认是非终止的；要把它变成终止错误（以便 `try/catch` 接住），用 `-ErrorAction Stop`，或把 `$ErrorActionPreference = 'Stop'` 写在脚本开头（作用是全局的，慎用）。
- **`try / catch / finally`**：`try` 里放可能失败的操作，`catch` 里写失败后的处理（记日志、重试、清理），`finally` 里放无论成败都要做的事（关闭连接、释放资源）。`catch` 块里用 `$_` 取到当前错误对象，`$_.Exception.Message` 是错误文本。
- **`$Error`**：最近错误的列表，`$Error[0]` 是最新一条；交互排障时先看它，再决定要不要加日志。

**日志的四种出口，按场景选**：

| 出口 | 适用场景 | 示例（示例未实测） |
|---|---|---|
| 屏幕信息流 | 交互运行与调试 | `Write-Verbose`（加 `-Verbose` 才显示）、`Write-Warning`（警告）、`Write-Debug`（调试细节） |
| 文本日志文件 | 任务计划、定时脚本的事后追查 | `Add-Content -Path $logFile -Value "$(Get-Date) 开始巡检"`；或 `Start-Transcript` / `Stop-Transcript` 整段录下会话输出 |
| 结构化文件 | 报表与下游处理 | `Export-Csv`（见[PowerShell 自动化](03-powershell-automation.md)第 4.5 节） |
| Windows 事件日志 | 需要进系统日志体系、与监控联动的场景 | `Write-EventLog`；写入前需先用 `New-EventLog` 注册事件源（需管理员权限），以官方发布为准（待核实） |

日志纪律三条：

1. **每条日志带时间戳**：没有时间的日志，事后排障时无法对应“几点出的事”。
2. **日志里不写口令与密钥**：错误信息有时会把连接字符串、凭据原样打出来；记日志前先确认输出内容不含敏感信息，见[Windows 系统管理](01-system-management.md)的凭据管理原则。
3. **失败要留退出码**：任务计划调用的脚本，出错时用 `exit 1` 返回非零退出码，任务计划才能据此判断“这次跑失败了”并触发重试或告警；静默失败的脚本比报错的脚本更危险。

## 5. 关键设计取舍

- **函数 vs 直接写命令**：函数多一层抽象，换来复用与测试；只跑一次的临时操作，直接写命令更省事。判断标准是“这段逻辑会不会第二次出现”。
- **模块 vs 脚本里内嵌函数**：模块换来版本管理与跨脚本共享，代价是多一份清单与目录结构；只在单个脚本里用的函数，内嵌即可。
- **Gallery 安装 vs 手动复制文件**：Gallery 安装换来版本、依赖与更新管理，代价是依赖外部仓库；离线环境只能手动复制模块目录（`Save-Module` 先在联网机器上下载、再拷过去），以官方发布为准（待核实）。
- **终止错误 vs 非终止错误**：默认非终止换来“批量任务不被一台坏机器拖垮”，代价是错误容易被忽略；关键步骤显式加 `-ErrorAction Stop`，把“必须停下的错”和“可以跳过的错”分开。

## 6. 分类与变体

- **脚本（.ps1）**：一次任务的流程；可带参数、可被任务计划调用。
- **函数**：脚本或模块内的复用单元；支持管道时用 `begin / process / end`。
- **脚本模块（.psm1）**：函数集合；开发调试时直接 `Import-Module` 路径导入。
- **二进制模块（.dll）**：用 C# 等语言编写的模块；性能要求高的场景用，日常管理脚本不需要。
- **模块清单（.psd1）**：模块的元数据；决定版本、导出命令与依赖，发布模块时必填。
- **Windows PowerShell 5.1 与 PowerShell 7**：模块路径不同（`WindowsPowerShell` 与 `PowerShell` 目录）、Gallery 客户端版本不同；跨版本共用模块前，先核对该模块在目标版本的可用性。

## 7. 应用与限制

- **每日巡检脚本**：函数取数据、脚本组装流程、CSV 落盘、日志记时间戳；任务计划定时调用，失败靠退出码告警。
- **模块化运维工具箱**：把“查服务、查磁盘、查任务”写成一个自写模块，团队内共享；新人装模块就能用，不用每人重写。
- **测试先行**：Pester 给关键函数写测试，改动后先跑测试再上线；配合 PSScriptAnalyzer 做静态检查，拦截低级错误。
- **限制**：执行策略不是安全边界（见[PowerShell 自动化](03-powershell-automation.md)第 4.3 节）；Gallery 模块质量参差不齐，生产使用前要核对作者与维护状态；跨平台时模块可用性要逐项核对；日志文件本身要管轮转与保留期，否则磁盘会被日志写满。

## 8. 常见误解

- **“脚本写好了就能双击运行”**：错。双击 .ps1 默认用记事本打开；运行脚本要在 PowerShell 里用路径调用，且受执行策略约束。
- **“Install-Module 装完就能用”**：基本对，但有例外——模块可能要求特定 PowerShell 版本、.NET 版本或额外组件（如 RSAT）；装完先用 `Get-Command -Module 模块名` 确认命令确实可用。
- **“try/catch 能接住所有错误”**：错。它只接终止错误；非终止错误要先加 `-ErrorAction Stop` 转换，或用 `-ErrorVariable` 收集后自行判断。
- **“日志越多越好”**：错。日志要的是“出事时能定位”，不是“把每一步都记下来”；无时间戳、含敏感信息、不轮转的日志，比没有日志更糟。

---

## 文章信息（统一字段）

- 来源：Microsoft Learn《about_Functions》（https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_functions）；Microsoft Learn《about_Modules》（https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_modules）；Microsoft Learn《PowerShell Gallery 入门》（https://learn.microsoft.com/en-us/powershell/gallery/getting-started/installing-powershellget）；Microsoft Learn《about_Try_Catch_Finally》（https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally）；Microsoft Learn《about_Execution_Policies》（https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies）
- 适用版本：Windows PowerShell 5.1、PowerShell 7、Windows 10/11、Windows Server 2022/2025
- 核实日期：2026-11-06
- 成熟度：成熟应用
- 难度：L2
- 前置知识：[PowerShell 自动化](03-powershell-automation.md)、[Windows 系统管理](01-system-management.md)
- 相关主题：[远程管理与 WinRM](09-powershell-remoting-winrm.md)、[注册表与组策略](02-registry-group-policy.md)、[systemd Timer](../../07-automation/02-systemd-timers.md)
- 未完成项：文中所有 PowerShell 命令示例均未在 Windows 上实测，示例仅作语法示意；常用模块的最新版本与在 PowerShell 7 下的可用性未逐项核对，以 PowerShell Gallery 当前发布为准；Write-EventLog 的事件源注册细节未逐项核对；Save-Module 离线分发流程未实测，以官方发布为准
