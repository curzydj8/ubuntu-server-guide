# 游戏服务端实战：SteamCMD、Minecraft 与 Palworld

## 一、概述与使用场景

本章是整个第 10 部分的动手核心：把服务端真正装起来、配好、跑通第一次启动。三条路线有先后关系——先装 SteamCMD 建好统一底座（Palworld 靠它下载，大量 Steam 游戏服务端也靠它），再分别完成 Minecraft Java 版与 Palworld 的完整开服。不按规范装的风险很现实：用 root 长期跑游戏服，一旦服务端或插件出现漏洞，攻击者直接拿到最高权限；随手找的服务端 jar 来源不明，可能被植入后门；JDK 版本与游戏版本不匹配，服务端会在启动瞬间崩溃且报错晦涩难懂。

配置层面的风险同样常见：Minecraft 不改 `eula=true` 根本启动不了；堆内存参数乱填，4 GB 的小机器上给单个服务端分配 8 GB，必然被系统 OOM 杀掉；Palworld 的设置文件是单行长串格式，改错一个逗号整段配置失效。按本章路线走完，你会得到两个能被外网直连（配合第 01 章放行端口）、配置可复现、更新有固定流程的正式服务端。

## 二、环境准备与前置条件

- 系统：Ubuntu 22.04 LTS 或 24.04 LTS，已按第 01 章放行 25565/TCP 与 8211/UDP。
- 权限：`sudo` 账号一个；游戏进程一律使用专用低权限用户 `steam` 运行。
- 硬件下限：Minecraft 小型原版服 2 核 4 GB；Palworld 官方建议 4 核 16 GB，内存不足时先加 SWAP（见第 03 章）。
- 磁盘：预留 30 GB 以上，SteamCMD 与 Palworld 本体约占 10 GB，世界存档持续增长。

先统一更新系统并创建运行用户：

```bash
sudo apt update && sudo apt upgrade -y
sudo useradd -m -s /bin/bash steam
sudo mkdir -p /home/steam/servers
sudo chown -R steam:steam /home/steam
```

!!! warning "不要用 root 跑游戏服"
    本章所有下载与运行命令都在 `steam` 用户下执行。切换方式为 `sudo -iu steam`，需要管理员操作时再单独用 `sudo` 执行单条命令，不要整段脚本都挂在 root 下跑。

## 三、手把手操作步骤

### 路线一：SteamCMD 环境准备

SteamCMD 是 Valve 官方的命令行版 Steam 客户端，它本身是 32 位程序，所以必须先补 32 位运行库，这是新手最常漏的一步。

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y lib32gcc-s1 lib32stdc++6 libc6-i386 libcurl4:i386
```

Ubuntu 22.04 软件源里可直接装包管理器版：先启用 multiverse 源，安装时会出现 Steam 许可协议，用 Tab 键选中接受即可：

```bash
sudo add-apt-repository multiverse -y
sudo apt update
sudo apt install -y steamcmd
```

装完切换到 `steam` 用户验证并做首次运行（首次运行会自动更新自身组件）：

```bash
sudo -iu steam
steamcmd +login anonymous +quit
```

登录分两种：多数专用服务器（包括 Palworld）支持匿名登录 `anonymous`，无需账号；少数游戏（如需要验证购买资格的服务端）用自己的 Steam 账号登录，命令为 `steamcmd +login <user>` 后按提示输入密码与令牌。原则上优先匿名，确需账号时用专门的小号，不要使用挂有库存与支付方式的主账号。

更新与安装游戏服务端的通用流程只有一条命令，把应用编号换掉即可复用：

```bash
steamcmd +force_install_dir /home/steam/servers/<game> +login anonymous +app_update <APP_ID> validate +quit
```

其中 `force_install_dir` 指定安装目录，`validate` 表示校验文件完整性。日后更新游戏版本时，原样重跑同一条命令就会增量更新到最新版，更新前记得先备份世界存档。

### 路线二：Minecraft Java 版服务端

第一步选 JDK。版本对应关系是硬性要求：Minecraft 1.20.5 及之后版本必须用 JDK 21，1.18 至 1.20.4 用 JDK 17，1.17 用 JDK 16，1.16 及更早用 JDK 8。本章以当前主流的 JDK 21 为例：

```bash
sudo apt install -y openjdk-21-jre-headless
java -version
```

期望看到 `openjdk version "21"` 字样。第二步下载官方服务端 jar（从 Mojang 官方启动器接口获取 `server.jar`，不要从来路不明的整合站下载），放入独立目录：

```bash
sudo -iu steam
mkdir -p /home/steam/minecraft
cd /home/steam/minecraft
curl -o server.jar https://example.com/minecraft/server.jar
```

实际使用时把上面地址换成 Mojang 官方在 minecraft.net 发布的当期版本下载地址，并核对官网公布的 SHA1 校验值一致后再启动。第三步首次启动生成配置文件：

```bash
java -Xms2G -Xmx2G -jar server.jar nogui
```

首次启动会生成 `eula.txt` 后自行退出，这是正常现象。改任何配置前先备份，再同意协议：

```bash
cp -a eula.txt eula.txt.bak
sed -i 's/eula=false/eula=true/' eula.txt
cp -a server.properties server.properties.bak
```

第四步逐行改 `server.properties` 关键项，其余保持默认：

```ini
# 服务器监听端口，需与安全组、UFW 放行一致
server-port=25565
# 绑定地址，留空表示监听全部地址（0.0.0.0），切勿填 127.0.0.1
server-ip=
# 最大玩家数，按机器性能填，小型服 10 足够
max-players=10
# 正版验证，拥有正版账号的玩家服保持 true，不要为盗版玩家改 false
online-mode=true
# 视距（单位：区块），卡顿调优第一刀，生存服建议 6 到 8
view-distance=8
# 模拟距离，大于视距无意义，通常与视距相同或小 1
simulation-distance=6
# 难度：peaceful、easy、normal、hard
difficulty=normal
# 是否允许玩家间攻击
pvp=true
# 白名单，正规小服建议开启并维护 white-list.json
white-list=false
# 进服欢迎语，会显示在玩家聊天框
motd=A Minecraft Server
```

第五步是正式启动参数。`-Xms` 是初始堆内存，`-Xmx` 是最大堆内存，两者设成相同值可避免堆动态伸缩带来的卡顿；给系统至少预留 1 GB，不要把物理内存全分给游戏。4 GB 机器的起步写法：

```bash
java -Xms2G -Xmx2G -jar server.jar nogui
```

玩家较多、内存 8 GB 以上时推荐 Aikar flags——这是一套经社区长期验证的 G1GC 调优参数组合，核心思路是使用 G1 垃圾回收器、固定新生代比例、让 GC 在卡顿出现前主动工作，避免默认参数下周期性的全服顿卡。完整写法如下（内存数值按机器改，示例为 6 GB 堆）：

```bash
java -Xms6G -Xmx6G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true -jar server.jar nogui
```

### 路线三：Palworld 专用服务器

Palworld 专用服务器的 Steam 应用编号是 2394010，支持匿名下载。用路线一的通用命令装到独立目录：

```bash
sudo -iu steam
steamcmd +force_install_dir /home/steam/palworld +login anonymous +app_update 2394010 validate +quit
```

先直接启动一次让它生成配置与存档目录，看到日志出现服务器就绪字样后按 Ctrl+C 停服：

```bash
cd /home/steam/palworld
./PalServer.sh -port=8211 -players=16
```

改配置前先备份。生效的配置文件是 `/home/steam/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini`，同目录下还有一份 `DefaultPalWorldSettings.ini` 是官方模板，只作对照参考，改它不生效——正确做法是把模板内容复制到生效文件再改：

```bash
cd /home/steam/palworld/Pal/Saved/Config/LinuxServer/
cp -a PalWorldSettings.ini PalWorldSettings.ini.bak
cp -a /home/steam/palworld/DefaultPalWorldSettings.ini ./PalWorldSettings.ini
nano PalWorldSettings.ini
```

该文件是 `[/Script/Pal.PalGameWorldSettings]` 段加一整行以 `OptionSettings=` 开头的括号参数串格式，所有参数逗号分隔写在同一行里，改值时不要增删逗号与括号。关键项说明如下：

| 参数 | 示例值 | 说明 |
| --- | --- | --- |
| `ServerName` | `"My Palworld Server"` | 服务器名称，玩家在列表中看到的名字 |
| `ServerDescription` | `""` | 服务器简介，可留空 |
| `ServerPassword` | `"<server-password>"` | 进服密码，填占位符后换成你的强口令 |
| `AdminPassword` | `"<admin-password>"` | 管理员密码，游戏内启用管理员命令时用，务必与进服密码不同 |
| `PublicPort` | `8211` | 对外公布端口，与实际监听一致 |
| `RCONEnabled` | `False` | 是否开启 RCON 远程管理，需要时改 True |
| `RCONPort` | `25575` | RCON 端口，开启后只对管理 IP 放行 |
| `ServerPlayerMaxNum` | `16` | 最大玩家数，与启动参数 `-players` 保持一致 |
| `Difficulty` | `None` | 难度预设，一般保持 None 用细项参数控制 |
| `ExpRate` | `1.000000` | 经验倍率，1 为原版速度 |
| `PalCaptureRate` | `1.000000` | 帕鲁捕获率倍率 |
| `DeathPenalty` | `Item` | 死亡惩罚：None、Item、ItemAndEquipment、All |

改完保存，再次用 `./PalServer.sh -port=8211 -players=16` 启动即完成开服。

## 四、效果验证与测试

Minecraft 验证三步：

```bash
ss -tulnp | grep 25565
tail -n 20 /home/steam/minecraft/logs/latest.log
```

日志出现 `Done (x.xxxs)! For help, type "help"` 表示启动成功；再由外网设备用游戏客户端直连 `198.51.100.10:25565`，能进入世界且能挖方块，即为完整通过。控制台内输入 `list` 应能回显在线玩家数为 0 或当前人数。

Palworld 验证：

```bash
ss -tulnp | grep 8211
ps aux | grep -i palserver | grep -v grep
```

看到 UDP 8211 处于监听、进程存在后，玩家在游戏内选择「加入多人游戏」输入 `198.51.100.10:8211` 与进服密码，能正常进入并创建角色即通过。SteamCMD 本身的验证是重跑 `app_update` 命令，结尾出现 `Success! App '2394010' fully installed.` 即文件完整。

## 五、常见错误与排坑指南

**场景 1：SteamCMD 启动即闪退，报错缺少共享库。** 报错原文片段：

```text
/home/steam/.local/share/Steam/steamcmd/steamcmd.sh: line 37: /home/steam/.local/share/Steam/ubuntu12_32/steamcmd: No such file or directory
```

文件明明存在却报不存在，是典型的缺 32 位运行库。修复是补装路线一的依赖后重试：

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y lib32gcc-s1 lib32stdc++6 libc6-i386
```

**场景 2：Minecraft 改完配置仍立刻退出。** 日志或终端出现：

```text
[ServerMain/INFO]: You need to agree to the EULA in order to run the server.
```

原因是 `eula.txt` 仍是 `eula=false`，或改的是备份文件。确认并修复：

```bash
grep eula /home/steam/minecraft/eula.txt
sed -i 's/eula=false/eula=true/' /home/steam/minecraft/eula.txt
```

**场景 3：Palworld 改了模板文件，设置不生效。** 现象是服务器名、密码仍是默认值。原因是改了 `DefaultPalWorldSettings.ini` 而不是 `LinuxServer` 目录下的生效文件，或把长行配置改出了缺逗号的语法错误。修复：从备份恢复生效文件后重新逐项改值，只改等号右边的数值，不动结构：

```bash
cp -a PalWorldSettings.ini.bak PalWorldSettings.ini
```

## 六、生产环境最佳实践与安全建议

服务端只用 `steam` 等低权限用户运行，目录权限收敛到该用户，不要给游戏目录开放全局可写。下载只认官方渠道：Minecraft 只用 Mojang 官方 jar 并核验校验值，Steam 游戏只用 SteamCMD，拒绝第三方整合包与一键脚本。更新走固定节奏：先在游戏内公告、再备份世界存档、再跑 `app_update` 或换新 jar、最后验证版本号，玩家在线时不要直接更新。进服密码与管理员密码必须是两个不同的强口令，只通过私聊发给玩家，绝不贴在公开页面；`online-mode` 保持 `true`，关闭它等于允许冒名顶替登录。最后把两个服务端都交给第 03 章的 systemd 守护，让手动启动只停留在调试阶段，正式运营一律用服务方式运行。
