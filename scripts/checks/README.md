# 自检脚本试点（scripts/checks）

本站的「自检脚本」试点：把若干章末尾的验证口径固化成可在服务器上直接运行的只读检查脚本。读者照章做完后跑一遍脚本，逐条得到 PASS / FAIL / WARN / SKIP，比对着正文逐项手查更不容易漏。本目录是试点，只含三个脚本；是否扩围看试跑反馈再定。

## 三脚本一览

| 脚本 | 用途 | 对应站点章节 | 是否需 root |
| --- | --- | --- | --- |
| `check-postinstall.sh` | 安装后自检：版本、systemd 健康、时间同步、磁盘、交换、SSH 服务、待重启、DNS 与主机名 | 第 01 部分各章及全站各章第四节 | 否（普通用户可跑全量） |
| `check-security-baseline.sh` | 安全基线自检：SSH 有效配置、额外 UID 0 账号、UFW、Fail2ban、自动更新、shadow 空口令、sudo 组成员 | 第 02 部分 01 / 03 / 04 / 07 章 | 完整结果需 root；非 root 时需 root 的检查组整组 SKIP 并注明 |
| `check-backup-readiness.sh` | 备份就绪自检：备份目录存在与新鲜度、校验和旁车验证、备份工具与定时任务在位、还原目标可写探活 | 第 03 部分 04 章、第 11 部分 11.4 | 否（目录权限不足时如实报 FAIL） |

对应章节文件：`docs/01-basics/`、`docs/02-security/01-ssh-hardening.md`、`docs/02-security/03-firewall.md`、`docs/02-security/04-defense.md`、`docs/02-security/07-unattended-upgrades.md`、`docs/03-storage/04-backup.md`、`docs/11-databases/04-mysql-backup-restore.md`。

## 共用合同（三脚本一致）

- **输出格式**：每条检查一行，前缀 `[PASS]` / `[FAIL]` / `[WARN]` / `[SKIP]`，后跟检查名与一句依据（如实测值）；结尾固定汇总行 `== 汇总：PASS n / FAIL n / WARN n / SKIP n ==`；有 FAIL 时汇总后点名关键 FAIL。
- **退出码**：0 = 无 FAIL；1 = 至少一条 FAIL；2 = 脚本自身无法运行（非 Ubuntu、缺必需命令、参数错误等）。WARN / SKIP 不影响退出码。三个脚本都支持 `--help`（退出 0），未知参数退出 2。
- **只读原则**：全程不修改系统文件与配置、不联网。两个明示例外：`check-postinstall.sh` 第 9 条用 `getent` 做一次 DNS 解析探活（失败只记 WARN）；`check-backup-readiness.sh` 在显式给了 `--restore-target` 时，会在该目录创建一个临时探活文件并立即删除，输出中明示。
- **降级纪律**：PID 1 非 systemd（容器 / proot 等）时，systemctl 类检查输出 SKIP 并注明原因，不报错、不误判 FAIL；需 root 的检查在非 root 时 SKIP 并注明；命令不存在时对应检查 SKIP（语义上是「该装未装」的，如 Fail2ban 未安装，在安全脚本里记 WARN 而非 SKIP，见脚本内注释）。

## 用法示例

```bash
# 安装后自检（普通用户即可）
./check-postinstall.sh

# 安全基线（完整结果用 sudo）
sudo ./check-security-baseline.sh
# 非 root 也可跑：sshd 配置组与 shadow 检查会整组 SKIP 并注明

# 备份就绪：默认查 /var/backups、最近一份须在 7 天内
./check-backup-readiness.sh
# 指定多个备份目录与更宽的新鲜度，并探活还原目标
./check-backup-readiness.sh --dir /var/backups --dir /data/backup --max-age-days 14 --restore-target /data/restore
```

把脚本输出接进工单或巡检记录时，连同退出码一起保存（`echo $?` 紧随脚本之后执行）。

## 版本与试跑状态

试点试跑已于 2026-10 完成（ShellCheck 0.11.0 默认规则三脚本 0 告警、零豁免）：

- **Ubuntu 24.04.5（真实主机环境，systemd 正常运行）**：三脚本以 root 与非特权用户各试跑。postinstall 汇总 PASS 7 / FAIL 0 / WARN 1 / SKIP 2、退出 0；security-baseline 为 PASS 3 / FAIL 0 / WARN 3 / SKIP 1、退出 0；backup-readiness 对默认 `/var/backups` 为 PASS 1 / FAIL 0 / WARN 3 / SKIP 2、退出 0，另以夹具目录试跑——新鲜备份+有效校验和时 PASS 5、退出 0，过期备份+损坏校验和+目录缺失时 FAIL 3、退出 1（FAIL 分支与退出码均实证）。非特权用户下需 root 的检查组按设计整组 SKIP。
- **Ubuntu 22.04.5（官方云镜像根文件系统 + proot 用户态试跑，无真实 systemd 与网络）**：三脚本均可运行并给出汇总。postinstall 为 PASS 3 / FAIL 0 / WARN 3 / SKIP 4、退出 0；backup-readiness 为 PASS 1 / FAIL 0 / WARN 2 / SKIP 3、退出 0；security-baseline 为 PASS 3 / FAIL 1 / WARN 2 / SKIP 1、退出 1——其中 FAIL 为 UFW 未启用（对未加固的原始镜像属正确判定）；`sshd -T` 组因镜像未生成主机密钥按设计 SKIP（此降级逻辑即由本次试跑发现并修正：早期版本曾将其误报为配置语法错误 FAIL）。
- 已知边界：试跑环境未安装 openssh-server（24.04 侧）、fail2ban、restic/borg，这些工具「已安装」分支的判定逻辑未在本次试跑中实测；systemd 处于 degraded 或存在失败单元时的 FAIL 分支亦未触发。上述分支待真实服务器环境补测，本目录按「试点」定位发布，不宣称全覆盖。

## ShellCheck 纪律

- 提交前本地对全部脚本跑 ShellCheck（默认规则），结果须为 0 告警；CI 同样会跑。
- 确需豁免的行内 `# shellcheck disable=...` 必须带注释说明原因，不许整文件豁免。
- 脚本不用 `set -e`（检查失败不许中断后续检查），只用 `set -u`；任何一条检查的失败都不能让脚本提前退出（退出 2 的环境/用法错误除外）。

## 已知边界

- **非 systemd 环境**：容器、proot、WSL 未启用 systemd 等场景下，systemd 相关检查一律 SKIP 并注明，这是设计行为不是脚本故障；这类环境请结合正文人工核对。
- **备份脚本不证明可还原**：`check-backup-readiness.sh` 只验证备份的「存在、新鲜、校验和完整」。备份能不能真还原，只能靠定期还原演练证明（见第 11 部分高可用与恢复演练章），脚本结尾也固定打印这条注记。
- **阈值是本站口径**：根分区 85% / 95%、备份新鲜度默认 7 天、sudo 组成员提示阈值 3 个，均为脚本顶部可改变量或参数，不是通用标准；与所在环境口径不一致时改阈值，不要改检查逻辑凑 PASS。
- **适用版本**：脚本按 Ubuntu 22.04 / 24.04 撰写；其他版本会 WARN 后继续（`check-postinstall.sh`），非 Ubuntu 直接退出 2；其他发行版行为未核验。
