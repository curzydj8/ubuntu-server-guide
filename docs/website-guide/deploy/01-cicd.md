# DEPLOY-01：Git、GitHub、SSH 部署密钥、GitHub Actions 自动部署完整教程

> 任务编号：DEPLOY-01（网站建设与部署实战指南 · 部署第 1 篇）
> 上一篇：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)；下一篇：[DEPLOY-02 Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚](./02-docker.md)。
> 本篇只讲“代码怎么从本地可靠地送上服务器”：Git 部署用得上的工作流、GitHub 仓库与分支策略、SSH 部署密钥、GitHub Actions 自动部署。不讲 Docker 部署（那是 DEPLOY-02），不讲 HTTPS/CDN 上线全流程（那是 DEPLOY-03），不讲 Nginx/Apache/Caddy 的配置模板本身（那是 SRV-01），不讲 PHP-FPM 与 systemd 的配置细节（那是 SRV-02）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清一次自动部署的完整链路：本地提交、推送到 GitHub、Actions 跑流水线、文件同步到服务器、服务重载、健康检查、失败回滚，顺序不出错；
2. 给自己的网站建一个 GitHub 仓库并定好分支策略，做到 main 分支只接受合并、不直接推送；
3. 生成一对专用的 SSH 部署密钥，说清只读部署密钥与写权限密钥的区别，并知道什么时候必须轮换；
4. 写一份完整的 GitHub Actions 工作流，做到推送到 main 就自动部署，并能在 Actions 日志里定位哪一步失败；
5. 在部署失败时用符号链接回指上一版完成回滚，而不是手动把文件一个个拷回去。

## 2. 适用人群

- 已经有一个能在服务器上手动跑起来的网站（静态站、PHP、Node.js、Python 任一种），想把“改完代码、手动传文件、手动重启”换成“推送即部署”的读者；
- 读过 SRV-02，知道自己的应用在服务器上由什么进程管、用什么命令重载的读者；
- 不适合还没有服务器、还没有跑起来的网站的读者：先按 SRV-01、SRV-02 把网站在服务器上跑起来，再来做自动部署；
- 不适合已经在用 Docker Compose 或 Kubernetes 做部署的读者，那是 DEPLOY-02 的范围，本篇讲的是不依赖容器的直连部署。

## 3. 适用系统和版本

- 本地机器：Windows、macOS、Linux 均可，只要装了 Git；命令以 Linux/macOS 的终端为准，Windows 用 Git Bash 执行同样的命令；
- Git：随发行版或官网安装的 Git 2.x 即可，本篇不写死 Git 的补丁号，安装时以发行版或官网当场公布的版本为准，读者可用 `git --version` 确认本机版本；
- 服务器：Ubuntu 24.04 LTS（本篇命令以此为准），Ubuntu 22.04 LTS 大体相同，服务名里的 PHP 版本号不同，见 SRV-02；
- GitHub：需要一个 GitHub 账号与一个仓库，免费账号即可跑本篇的流水线（免费额度以 GitHub 当场公布的规则为准）；
- GitHub Actions 运行器：工作流里写 `runs-on: ubuntu-latest`，即 GitHub 提供的最新 Ubuntu 运行器，版本号由 GitHub 决定，不写死；
- OpenSSH：服务器与本地的 `ssh`、`ssh-keygen`、`rsync` 均随系统自带，不需要单独装；
- 示例站点：本篇以一个静态站为例（构建产物在 `dist/` 目录），PHP、Node.js、Python 站点的部署思路相同，只差构建命令与重载命令，见第 10.4 节的对照。

## 4. 使用前提

动手前请先确认下面五件事，缺一件就先补齐，不要硬往下走：

1. 本地已经装好 Git，`git --version` 能输出版本号；
2. 已经有一个 GitHub 账号，能新建仓库；
3. 已经有一台 Ubuntu 服务器，能用 SSH 登录，服务器上已经有一个能跑的网站（按 SRV-01、SRV-02 配好），并且你知道网站的目录与重载命令；
4. 域名已经解析到服务器（NET-01、NET-02），或者至少能用服务器 IP 加端口访问到网站；
5. 本地已经有一份网站源码，并且能在本地构建出产物（静态站就是能跑通构建命令，见第 9.2 节）。

## 5. 所需资源

| 资源 | 说明 | 去哪里拿 |
| --- | --- | --- |
| GitHub 仓库 | 放网站源码，一个仓库对应一个网站 | GitHub 上新建，见第 9.1 节 |
| SSH 部署密钥对 | 流水线登录服务器的专用钥匙，见第 9.3 节 | 本地用 `ssh-keygen` 生成 |
| 服务器部署账号 | 只用来部署的普通账号，不要用 root 部署 | 服务器上新建，见第 9.4 节 |
| GitHub Secrets | 存服务器地址、账号、密钥、路径，不进仓库 | 仓库 Settings → Secrets and variables → Actions 里填 |
| 服务器部署目录 | 放各版本与当前版符号链接的目录 | 服务器上建好，见第 9.4 节 |

## 6. 技术原理

### 6.1 Git 只讲部署用得上的四句话

- 工作区是你改文件的地方，暂存区是你用 `git add` 挑出来准备提交的文件，仓库是你用 `git commit` 存下来的历史；
- 每一次提交都有一个哈希值，提交连成一条链，分支只是指向某个提交的指针，合并就是把两条链汇到一起；
- 远程仓库（GitHub）与本地仓库是两个仓库，`git push` 是把本地的提交送到远程，`git pull` 是把远程的提交拿回本地；
- 部署用得上的 Git 操作只有：提交、推送、拉取、打标签、看状态与看日志，完整 Git 教程不在本篇范围，见第 19 节。

### 6.2 SSH 密钥只讲部署用得上的一句话

SSH 密钥是一对：私钥自己留着、谁都不能给，公钥放到对方那里证明身份。流水线登录服务器时，服务器拿公钥验流水线手里的私钥，对上了才放行。私钥泄露等于钥匙丢了，唯一的补救是作废旧钥匙、换新钥匙，见第 18.3 节。

### 6.3 GitHub Actions 只讲部署用得上的一句话

GitHub Actions 是“仓库里发生某件事，就按工作流文件自动跑一串步骤”的服务：推送到 main 触发工作流，GitHub 派一台临时运行器，运行器按文件里的步骤执行（检出代码、构建、同步到服务器、重载服务、健康检查），跑完运行器就销毁，什么都不留。

### 6.4 部署的本质

部署的本质是三件事，按顺序做：第一，把新版本的文件完整地送到服务器；第二，让服务器用新版本对外服务（换符号链接、重载服务）；第三，验证新版本真的在对外服务（健康检查），验证不过就回滚。缺了第三步的部署叫“传文件”，不叫“部署完成”。

## 7. 架构说明

### 7.1 一次自动部署的完整链路

| 步骤 | 谁在做 | 做什么 |
| --- | --- | --- |
| 1 | 你在本地 | 改代码、提交、推送到 GitHub 的 main 分支 |
| 2 | GitHub | 收到推送，按工作流文件触发一次运行 |
| 3 | Actions 运行器 | 检出代码、安装依赖、构建出 `dist/` |
| 4 | Actions 运行器 | 用 rsync 把 `dist/` 同步到服务器的 staging 目录（新版本目录，不是线上目录） |
| 5 | Actions 运行器 | 用 SSH 在服务器上执行部署脚本 |
| 6 | 部署脚本 | 备份当前版、把符号链接指到新版本、重载服务 |
| 7 | 部署脚本 | 健康检查：请求本机地址，状态码正常才算成功 |
| 8 | 失败时 | 部署脚本把符号链接指回上一版、重载服务，流水线报失败 |

### 7.2 两种部署方式对照

| 方式 | 做法 | 适合 | 不适合 |
| --- | --- | --- | --- |
| rsync 同步（本篇主推） | 运行器构建完，用 rsync 把产物推到服务器 | 静态站、前后端分离的前端、构建产物明确的项目 | 服务器不能被外网 SSH 直连的网络 |
| SSH 直连拉取 | 运行器只发一条 SSH 命令，服务器自己 `git pull` | 服务器能直接访问 GitHub、源码直接可用的项目 | 需要构建步骤、构建依赖很重的项目（构建会占用服务器资源） |

两种方式不要混在同一个工作流里用同一个目录：rsync 推产物用 staging 目录加符号链接，SSH 拉取用 Git 工作目录，混用会在回滚时分不清哪个版本在线上。

### 7.3 密钥与机密的流向

| 东西 | 放在哪里 | 谁能看到 | 绝不能放在哪里 |
| --- | --- | --- | --- |
| SSH 私钥 | GitHub Secrets `DEPLOY_KEY` | 只有运行器在运行时能读到 | 仓库文件、聊天记录、工单、构建日志 |
| 服务器地址与账号 | GitHub Secrets `DEPLOY_HOST`、`DEPLOY_USER` | 只有运行器能读到 | 仓库文件（地址写进工作流正文也不推荐，见第 12 节） |
| 服务器主机密钥 | GitHub Secrets `DEPLOY_KNOWN_HOSTS` | 只有运行器能读到 | 不要每次用 `ssh-keyscan` 现场信任，见第 9.5 节 |
| 部署路径与服务名 | 工作流文件正文 | 所有人可见，无害 | 不适用 |

## 8. 操作前检查

动手前按下面清单逐项打勾，缺一项就先补齐：

1. 本地 `git status` 是干净的，或者你知道哪些改动还没提交；
2. 本地能用 `git remote -v` 看到远程仓库地址，并且知道当前分支名；
3. 服务器能用你自己的 SSH 密钥登录，并且知道网站目录、服务名、重载命令；
4. 服务器上已经建好部署目录结构（见第 9.4 节），并且部署账号对它有写权限；
5. 本地构建命令能跑通，并且知道构建产物在哪个目录（本篇示例是 `dist/`）；
6. 已经想好回滚时指回哪个版本：符号链接方案天然保留上一版，见第 18 节；
7. 已经确认网站没有把口令、密钥写进源码（用第 8 节末尾的自查命令扫一遍）。

自查命令（在网站源码根目录执行，搜常见的密钥写法，搜到结果就先清理再提交）：

```bash
grep -R -n -E "password\s*=\s*['\"][^'\"]+['\"]|api[_-]?key\s*=\s*['\"][^'\"]+['\"]|BEGIN.*PRIVATE KEY" --exclude-dir=.git --exclude-dir=node_modules . || echo "no obvious secrets found"
```

## 9. 逐步操作

### 9.1 新建仓库与分支策略

1. 在 GitHub 上新建一个仓库，名字与网站对应，例如 `my-site`，可见性按你的需要选公开或私有；
2. 本地进入网站源码目录，初始化并推送：

```bash
git init
git add .
git commit -m "init: first commit"
git branch -M main
git remote add origin git@github.com:YOUR_GITHUB_USER/my-site.git
git push -u origin main
```

上面命令里的 `YOUR_GITHUB_USER` 要换成你自己的 GitHub 用户名，`my-site` 换成你的仓库名。

3. 分支策略（从第一天就定好，不要等出事再定）：

| 分支 | 用途 | 谁能直接推送 |
| --- | --- | --- |
| `main` | 线上版本，唯一会被自动部署的分支 | 谁都不能直接推送，只接受合并 |
| `feature/xxx` | 每一个改动一个分支，例如 `feature/add-contact-page` | 改动的作者 |
| `hotfix/xxx` | 线上紧急修复，例如 `hotfix/fix-home-500` | 修复的作者 |

4. 在仓库 Settings → Branches 里给 `main` 加分支保护：勾选 Require a pull request before merging（合并前必须走合并请求），并勾选 Require status checks to pass（流水线通过才能合并）。这样即使有人误操作，也推不坏线上版本。

### 9.2 本地构建一次，确认产物目录

静态站示例（你的项目构建命令以 `package.json` 的 `scripts` 为准）：

```bash
npm ci
npm run build
ls dist/
```

`ls dist/` 应该列出构建产物（首页、样式、脚本等）。如果构建命令不存在或产物不在 `dist/`，先把构建修通，再往下走——流水线只是把这一步搬到运行器上跑，本地跑不通的构建，流水线也跑不通。

### 9.3 生成专用的 SSH 部署密钥

部署密钥必须专用：单独生成一对，只给这一个网站、这一个仓库用，不要复用你平时登录服务器的个人密钥。

```bash
ssh-keygen -t ed25519 -C "deploy@example.com" -f ~/.ssh/deploy_example -N ""
```

这条命令的四个要点：

- `-t ed25519`：密钥类型，当前推荐的类型；
- `-C "deploy@example.com"`：注释，只用来认出这把钥匙是干什么的，`example.com` 要换成你的域名；
- `-f ~/.ssh/deploy_example`：私钥文件路径，生成后会同时得到 `~/.ssh/deploy_example`（私钥）与 `~/.ssh/deploy_example.pub`（公钥）；
- `-N ""`：私钥口令为空。流水线无人值守，没法输口令，所以部署专用密钥只能无口令——代价是这把钥匙必须只读、专用、能随时作废，见第 17 节。

只读部署密钥与写权限密钥的区别（这是最容易混淆的一点）：

| 密钥 | 放在哪里 | 能干什么 | 本篇用哪种 |
| --- | --- | --- | --- |
| 只读部署密钥 | GitHub 仓库 Settings → Deploy keys | 流水线从 GitHub 拉取私有仓库代码（只读） | 服务器拉取模式才需要，见第 10.4 节 |
| SSH 登录密钥 | 服务器 `~/.ssh/authorized_keys` | 流水线登录服务器执行部署 | 本篇主推的 rsync 模式用这种 |
| 写权限密钥 | 绝不要为部署建 | 能往仓库写代码、改配置 | 本篇不用；流水线要回推仓库时才单独建、单独轮换 |

公钥长什么样（格式说明，不要照抄）：公钥是一行，以 `ssh-ed25519` 开头，中间是一长串字符，结尾是注释，例如：

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI（此处截断，完整公钥以你自己生成的为准，不要照抄示例公钥） deploy@example.com
```

### 9.4 服务器端：部署账号与目录

1. 在服务器上新建部署账号（不要用 root 部署）：

```bash
sudo adduser deploy
sudo mkdir -p /opt/www/example/releases /opt/www/example/backups
sudo chown -R deploy:deploy /opt/www/example
```

2. 把上一步生成的公钥放到部署账号的授权文件里（`~/.ssh/deploy_example.pub` 的内容，整行复制，不要只复制一半）：

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy bash -c "cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/deploy_example.pub
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

上面第二条命令是在你本地执行的，`~/.ssh/deploy_example.pub` 是你本地的公钥文件；如果你是在服务器上操作，改成直接把公钥内容追加到文件里。

3. 给部署账号“只重载指定服务”的 sudo 权限，不要给全部 sudo（完整文件见第 11.3 节）。

4. 目录结构（部署脚本按这个结构工作）：

```text
/opt/www/example/
├── releases/
│   ├── 20261103230000/
│   └── 20261103231500/
├── backups/
│   └── current-20261103230000.tar.gz
└── current -> releases/20261103231500
```

`current` 是一个符号链接，永远指向正在对外服务的版本；Nginx 的 root 指向 `/opt/www/example/current`，换版本就是换符号链接的指向，见 SRV-01。

### 9.5 服务器主机密钥：先核对，再钉住

不要在流水线里每次用 `ssh-keyscan` 现场信任服务器——第一次连接时如果有人冒充服务器，流水线就会把冒充者的密钥当成真的。正确做法是：

1. 在服务器上看主机密钥指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

2. 在本地第一次 SSH 登录时，客户端显示的指纹要与上面那条命令的输出一致，对上了才输入 yes；
3. 把本地 `~/.ssh/known_hosts` 里对应服务器的那一行，完整复制到 GitHub Secret `DEPLOY_KNOWN_HOSTS` 里，流水线每次都用这一行验服务器，不再现场信任。

### 9.6 GitHub Secrets：填什么、怎么填

在仓库 Settings → Secrets and variables → Actions → New repository secret 里逐个新建：

| Secret 名 | 填什么 | 例子（格式说明，不是真实值） |
| --- | --- | --- |
| `DEPLOY_HOST` | 服务器地址 | `example.com`（换成你的域名或 IP） |
| `DEPLOY_PORT` | SSH 端口 | `22`（改过端口就填改过的端口） |
| `DEPLOY_USER` | 部署账号 | `deploy` |
| `DEPLOY_KEY` | SSH 私钥全文 | `~/.ssh/deploy_example` 的全部内容，含首尾行，原样粘贴 |
| `DEPLOY_KNOWN_HOSTS` | 服务器主机密钥行 | 本地 `known_hosts` 里对应服务器的那一行 |
| `DEPLOY_PATH` | 网站部署根目录 | `/opt/www/example` |

填完后逐个核对名字拼写：工作流里引用 `secrets.DEPLOY_KEY`，Secret 名差一个字母，流水线就会拿到空值，见第 15 节。

### 9.7 写工作流与部署脚本，推送触发

1. 把第 10 节的工作流存为 `.github/workflows/deploy.yml`，部署脚本存为 `scripts/deploy.sh`；
2. 提交并推送到 `main`：

```bash
git add .github/workflows/deploy.yml scripts/deploy.sh
git commit -m "ci: add deploy workflow"
git push origin main
```

3. 到仓库 Actions 标签页看这一次运行：每一步前面是绿勾就是通过，红叉就是失败，点进失败的那一步看日志，见第 16 节。

### 9.8 回滚：先演练一次，再算完成

第一次部署成功后，故意演练一次回滚：用第 18.1 节的命令把符号链接指回上一版，确认网站回到上一版，再重新部署一次回到新版。没演练过的回滚等于没有回滚。

## 10. 完整代码

### 10.1 完整的 GitHub Actions 工作流

文件存放路径：仓库里的 `.github/workflows/deploy.yml`。这份工作流做五件事：检出代码、安装依赖并构建、用 rsync 把产物同步到服务器的新版本目录、用 SSH 执行部署脚本、健康检查失败时流水线报失败（回滚由部署脚本自己做，见第 10.2 节）。

```yaml
name: deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Prepare deploy timestamp
        id: timestamp
        run: echo "value=$(date +%Y%m%d%H%M%S)" >> "$GITHUB_OUTPUT"

      - name: Sync build output to server
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_PORT: ${{ secrets.DEPLOY_PORT }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
          TIMESTAMP: ${{ steps.timestamp.outputs.value }}
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts
          rsync -az --delete \
            -e "ssh -i ~/.ssh/deploy_key -p $DEPLOY_PORT -o StrictHostKeyChecking=yes" \
            dist/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/releases/$TIMESTAMP/"
          ssh -i ~/.ssh/deploy_key -p "$DEPLOY_PORT" -o StrictHostKeyChecking=yes \
            "$DEPLOY_USER@$DEPLOY_HOST" \
            "bash $DEPLOY_PATH/deploy.sh $TIMESTAMP"

      - name: Health check
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          curl -fsS "https://$DEPLOY_HOST/" -o /dev/null
          echo "health check passed"
```

注意上面工作流里的三个设计选择，不要随手改掉：

- `permissions: contents: read`：工作流只需要读仓库，就不要给写权限；
- `concurrency` 的 `cancel-in-progress: false`：正在部署时又有新推送，不要取消正在进行的部署，等它跑完再跑下一次，取消到一半的部署最容易留下一个换了一半的网站；
- rsync 的目标是 `releases/$TIMESTAMP/` 这个新目录，不是线上目录，所以 `--delete` 只删这个新目录里多余的文件，不会删线上文件；真正切换线上版本的是部署脚本里的符号链接。

### 10.2 完整的部署脚本

文件存放路径：服务器上的 `/opt/www/example/deploy.sh`（部署账号可读可执行）。工作流在 SSH 那一步用 `bash $DEPLOY_PATH/deploy.sh $TIMESTAMP` 调用它，`$TIMESTAMP` 就是工作流里生成的版本号。脚本做五件事：校验参数、备份当前版、切换符号链接、重载服务、健康检查，健康检查不过就自动指回上一版。

```bash
#!/bin/bash
set -euo pipefail

APP_DIR="/opt/www/example"
RELEASES_DIR="$APP_DIR/releases"
BACKUPS_DIR="$APP_DIR/backups"
CURRENT_LINK="$APP_DIR/current"

TIMESTAMP="${1:-}"
if [ -z "$TIMESTAMP" ]; then
  echo "usage: deploy.sh TIMESTAMP" >&2
  exit 2
fi

NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"
if [ ! -d "$NEW_RELEASE" ]; then
  echo "release directory not found: $NEW_RELEASE" >&2
  exit 2
fi

PREVIOUS_TARGET=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_TARGET="$(readlink "$CURRENT_LINK")"
fi

echo "backing up current release"
if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
  tar -czf "$BACKUPS_DIR/current-$(date +%Y%m%d%H%M%S).tar.gz" -C "$APP_DIR" "current"
fi

echo "switching current to $NEW_RELEASE"
ln -sfn "$NEW_RELEASE" "$CURRENT_LINK"

echo "reloading web server"
sudo systemctl reload nginx

echo "running health check"
if curl -fsS http://127.0.0.1/ -o /dev/null; then
  echo "deploy succeeded: $TIMESTAMP is live"
  exit 0
fi

echo "health check failed, rolling back" >&2
if [ -n "$PREVIOUS_TARGET" ]; then
  ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
  sudo systemctl reload nginx
  echo "rolled back to $PREVIOUS_TARGET" >&2
else
  echo "no previous release to roll back to" >&2
fi
exit 1
```

脚本里的 `sudo systemctl reload nginx` 能跑，是因为第 11.3 节给了部署账号“只重载 nginx”这一条 sudo 权限，不是全部 sudo。静态站重载就够了，不需要重启；PHP、Node.js、Python 站点的重载命令对照见第 10.4 节。

### 10.3 部署脚本的权限

脚本存到服务器后，权限只给部署账号可读可执行，不要给全局可写：

```bash
sudo chown deploy:deploy /opt/www/example/deploy.sh
sudo chmod 755 /opt/www/example/deploy.sh
```

### 10.4 其他技术栈的改法对照

工作流与脚本的主干不变，只换三处，换之前先确认你自己的构建命令、产物目录、重载命令：

| 技术栈 | 构建命令（工作流里换） | 产物目录（rsync 来源换） | 重载命令（脚本里换） |
| --- | --- | --- | --- |
| 静态站（本篇示例） | `npm run build` | `dist/` | `sudo systemctl reload nginx` |
| PHP（BE-01） | 不需要构建，或 `composer install --no-dev` | 源码目录本身 | `sudo systemctl reload php8.4-fpm` |
| Node.js（BE-03） | `npm ci` 与 `npm run build`（有构建才需要） | 源码目录本身 | `sudo systemctl restart myapp` |
| Python（BE-02） | 不需要构建 | 源码目录本身 | `sudo systemctl restart myapp` |

上面表格里的 `myapp` 是你自己的服务单元名，要换成 SRV-02 里实际建的服务名；`php8.4-fpm` 的版本号以你服务器上实际装的 PHP 版本为准。

### 10.5 另一种方式：SSH 直连拉取（完整示例）

如果你的服务器能直接访问 GitHub，并且源码拉下来就能跑（不需要构建），也可以不用 rsync，工作流里只发一条 SSH 命令，让服务器自己拉取。完整命令如下，存为工作流里的一个步骤即可（其余步骤与第 10.1 节相同，只是不要再有 rsync 步骤）：

```bash
ssh -i ~/.ssh/deploy_key -p "$DEPLOY_PORT" -o StrictHostKeyChecking=yes \
  "$DEPLOY_USER@$DEPLOY_HOST" \
  "cd /opt/www/example/current && git pull --ff-only && sudo systemctl reload nginx"
```

`--ff-only` 的意思是“只接受快进式拉取”：服务器上的版本只能往前走，不能出现合并冲突；一旦服务器上有人手动改过文件，拉取就会失败而不是悄悄合并，这是故意设计的保护，不是 bug。选哪种方式看第 7.2 节的对照，不要两种方式共用同一个目录。

## 11. 完整配置文件

### 11.1 工作流文件与部署脚本的存放路径

| 文件 | 存放路径 | 谁能改 |
| --- | --- | --- |
| 工作流 | 仓库里的 `.github/workflows/deploy.yml` | 仓库协作者，改动走合并请求 |
| 部署脚本 | 服务器上的 `/opt/www/example/deploy.sh` | 部署账号，改动前先备份旧脚本 |
| 忽略文件 | 仓库里的 `.gitignore`（见第 11.2 节） | 仓库协作者 |

### 11.2 完整的 `.gitignore`

文件存放路径：仓库根目录的 `.gitignore`。它的作用只有一条：口令、密钥、构建产物、依赖目录绝不进仓库。

```text
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

### 11.3 只重载指定服务的 sudo 权限

文件存放路径：服务器上的 `/etc/sudoers.d/deploy`，用 `visudo` 编辑，权限必须是 440，改错会导致 sudo 整个不可用，改之前先备份原文件。

```text
deploy ALL=(root) NOPASSWD: /bin/systemctl reload nginx
deploy ALL=(root) NOPASSWD: /bin/systemctl restart myapp
```

上面第二行里的 `myapp` 是你自己的服务单元名，没有 Node.js/Python 服务时就不要写这一行；不要写成 `deploy ALL=(ALL) NOPASSWD: ALL`，那等于给了部署账号全部 root 权限，部署密钥一旦泄露，服务器就全丢了。

### 11.4 Secrets 清单（再贴一遍，照着填）

| Secret 名 | 填什么 |
| --- | --- |
| `DEPLOY_HOST` | 服务器地址 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_USER` | 部署账号 |
| `DEPLOY_KEY` | SSH 私钥全文，原样粘贴 |
| `DEPLOY_KNOWN_HOSTS` | 服务器主机密钥行 |
| `DEPLOY_PATH` | 网站部署根目录，例如 `/opt/www/example` |

## 12. 每个关键配置项的解释

### 12.1 工作流文件逐项解释

| 配置项 | 写在哪里 | 含义 | 改错的后果 |
| --- | --- | --- | --- |
| `on.push.branches: main` | 工作流顶部 | 只有推送到 main 才部署，推送到 feature 分支不部署 | 写成全部支都触发，半成品也会上线上 |
| `on.workflow_dispatch` | 工作流顶部 | 允许在 Actions 页面手动点运行 | 不写就不能手动重跑，只能靠再推一次提交触发 |
| `permissions.contents: read` | 工作流顶部 | 工作流对仓库只有读权限 | 给写权限后，工作流一旦被利用就能改仓库 |
| `concurrency.group` | 工作流顶部 | 同一组的运行排队，不并行部署 | 不写，两次部署并行跑，符号链接会被来回切换 |
| `concurrency.cancel-in-progress: false` | 工作流顶部 | 正在部署的不被取消 | 写成 true，部署会被取消在半路，留下一个换了一半的网站 |
| `runs-on: ubuntu-latest` | 任务里 | 运行器系统，由 GitHub 决定具体版本 | 写死旧版本，未来可能被 GitHub 下线 |
| `actions/checkout@v4` | 步骤里 | 把仓库代码检出到运行器 | 版本号写错，步骤直接失败 |
| `actions/setup-node@v4` 与 `node-version: "22"` | 步骤里 | 装 Node.js 22 并缓存 npm 依赖 | 版本与本地不一致，构建结果可能不一致 |
| `npm ci` | 步骤里 | 按锁文件精确安装依赖，比 `npm install` 更可重复 | 用 `npm install` 会按范围装新版，构建结果每次都可能变 |
| `rsync -az --delete` | 步骤里 | `-a` 归档模式（保留权限与时间），`-z` 压缩，`--delete` 删目标多余文件 | 目标写成线上目录，`--delete` 会删线上文件；本篇目标是新版本目录，所以安全 |
| `-o StrictHostKeyChecking=yes` | ssh 与 rsync 的 ssh 参数里 | 必须验服务器主机密钥，验不过就拒绝连接 | 写成 no，第一次连接被冒充也不会发现 |
| `curl -fsS https://$DEPLOY_HOST/` | 健康检查步骤里 | `-f` 失败时返回非零退出码，`-sS` 安静但出错时显示原因 | 不加 `-f`，404 也会返回退出码 0，健康检查永远通过 |

### 12.2 部署脚本逐项解释

| 写法 | 含义 | 改错的后果 |
| --- | --- | --- |
| `set -euo pipefail` | 任一命令失败就退出、未定义变量就报错、管道中任一环节失败就报错 | 不写，某一步失败了脚本还会继续往下跑，留下一个坏版本在线上 |
| `TIMESTAMP="${1:-}"` 与空值检查 | 工作流必须传版本号，没传就退出并提示用法 | 不检查，没传版本号会把符号链接指到一个不存在的目录 |
| `readlink "$CURRENT_LINK"` | 部署前先记下当前版，留着回滚用 | 不记，健康检查失败时不知道指回哪里 |
| `tar -czf "$BACKUPS_DIR/current-<时间戳>.tar.gz" -C "$APP_DIR" "current"` | 部署前把当前版打一个带时间戳的包 | 不备份，回滚时只能靠上一版目录，上一版目录被删就没退路 |
| `ln -sfn` | `-s` 建符号链接，`-f` 强制覆盖旧链接，`-n` 不跟随旧链接本身 | 不加 `-n`，旧链接指向目录时，新链接会建到旧目录里面去 |
| `curl -fsS http://127.0.0.1/` | 在服务器本机做健康检查，不走外网 | 只在运行器上检查外网地址，外网一时不通会误判部署失败 |

### 12.3 sudoers 文件逐项解释

| 写法 | 含义 |
| --- | --- |
| `deploy` | 被授权的账号 |
| `ALL=(root)` | 在所有主机上以 root 身份执行（单机场景下就是本机） |
| `NOPASSWD:` | 执行时不需要输密码，流水线无人值守必须如此 |
| `/bin/systemctl reload nginx` | 只允许这一条命令，写绝对路径，不写相对路径 |

## 13. 执行结果示例

下面三段输出都已明确标注为示例输出，不是本机实测输出：本机没有跑通一条真实的 GitHub Actions 流水线（需要真实仓库与真实服务器），读者在自己仓库里应看到的样子与下面一致，实际时间、提交哈希、版本号以自己仓库为准。

### 13.1 Actions 运行日志示例

```text
deploy
  Checkout code: passed
  Set up Node.js: passed
  Install dependencies: passed
  Build site: passed
  Prepare deploy timestamp: passed
  Sync build output to server: passed
  Health check: passed
  health check passed
```

### 13.2 服务器部署目录示例

部署两次之后，服务器上的目录应该是下面这个样子（时间戳以实际部署时间为准）：

```text
/opt/www/example/
├── releases/
│   ├── 20261103230000/
│   └── 20261103231500/
├── backups/
│   └── current-20261103230000.tar.gz
└── current -> releases/20261103231500
```

### 13.3 健康检查示例

部署脚本在服务器本机跑健康检查，成功时应看到：

```text
backing up current release
switching current to /opt/www/example/releases/20261103231500
reloading web server
running health check
deploy succeeded: 20261103231500 is live
```

健康检查失败时应看到（这是故意设计的回滚输出，不是故障本身）：

```text
running health check
health check failed, rolling back
rolled back to /opt/www/example/releases/20261103230000
```

## 14. 成功验证

按下面清单逐项核对，全部通过才算部署完成，缺一项就按第 16 节排查：

1. 仓库 Actions 标签页里，这一次运行的每一步前面都是绿勾；
2. 服务器上 `ls -l /opt/www/example/current` 显示的符号链接指向最新版本号的目录；
3. 服务器本机 `curl -fsS http://127.0.0.1/ -o /dev/null && echo ok` 输出 `ok`；
4. 外网 `curl -I https://example.com/`（把 `example.com` 换成你的域名）返回 200，首页内容是最新的；
5. 服务器上 `sudo systemctl status nginx`（或你自己的服务）显示 active；
6. 故意演练一次回滚：按第 18.1 节把符号链接指回上一版，确认网站回到上一版，再重新部署一次回到新版；
7. 确认仓库里没有密钥：`git log --all -p | grep -E "BEGIN.*PRIVATE KEY"` 没有输出（这条命令搜的是历史记录，搜到就说明密钥已经进过仓库，按第 18.3 节轮换）。

## 15. 常见错误

| 现象 | 常见原因 | 先查哪里 |
| --- | --- | --- |
| `Permission denied (publickey)` | 私钥粘贴时丢了首尾行、换行被破坏，或公钥没放到服务器的 `authorized_keys` 里 | 先在本地用 `ssh -i ~/.ssh/deploy_example -p 端口 deploy@服务器` 手动登录一次 |
| `Host key verification failed` | Secret `DEPLOY_KNOWN_HOSTS` 里没有服务器那一行，或服务器重装后主机密钥变了 | 按第 9.5 节重新核对指纹、更新 Secret |
| 流水线在 rsync 那一步报空值错误 | Secret 名拼错（例如 `DEPLOY_KEY` 写成 `DEPLOY_KEYS`） | 对照第 11.4 节的清单逐个核对 Secret 名 |
| 流水线根本没触发 | 推送的分支不是 main，或工作流文件不在 main 分支上 | 确认当前分支是 main，确认 `.github/workflows/deploy.yml` 已经在 main 里 |
| 构建步骤失败 | 本地能构建、运行器上失败，多半是 Node 版本不一致或锁文件没提交 | 确认 `package-lock.json` 已提交，确认工作流的 Node 版本与本地一致 |
| 部署成功但网站还是旧内容 | Nginx 的 root 没指向 `current` 符号链接，或浏览器缓存 | 先查 Nginx 配置的 root，再清浏览器缓存或用 `curl` 验证 |
| 服务没重载 | sudoers 文件没生效（权限不是 440、或服务名写错） | 在服务器上用部署账号跑 `sudo -n systemctl reload nginx` 看报不报错 |
| 符号链接指到了目录里面 | 部署脚本里 `ln` 没加 `-n` | 对照第 12.2 节，确认脚本里是 `ln -sfn` |

下面这些写法是错的，只写在表格与行内代码里，不要写进工作流或脚本：把私钥全文直接写进工作流文件；在步骤里打印密钥，例如 `run: echo ${{ secrets.DEPLOY_KEY }}`；给部署账号全部 sudo，例如 `deploy ALL=(ALL) NOPASSWD: ALL`；关掉主机密钥校验，例如 `StrictHostKeyChecking=no`；在 main 分支上直接强推，例如 `git push --force origin main`。

## 16. 故障排查

按“先定位到哪一步红，再查那一步”的顺序走，不要一上来就重跑整个流水线：

1. 打开仓库 Actions 标签页，点进失败的那一次运行，看红叉落在哪一步；
2. 如果红在检出、安装、构建这三步：问题在仓库与代码，先在本地复现同一条命令（`npm ci`、`npm run build`），本地复现不了就不是部署的问题；
3. 如果红在同步步骤：先在本地手动跑一次 SSH 登录（见第 15 节第一行），登录不通就是密钥或网络问题；登录通但 rsync 失败，就在本地对 rsync 加 `--dry-run` 先看它打算同步哪些文件、到哪个目录；
4. 如果红在健康检查步骤：先到服务器上看部署脚本的输出（它会写明是切换失败、重载失败还是健康检查失败），再看 `sudo systemctl status nginx` 与 `sudo journalctl -u nginx --since "10 minutes ago"`；
5. 如果每一步都绿但网站还是旧的：先确认 Nginx 的 root 是不是指向 `current` 符号链接，再确认符号链接指向的版本号是不是最新一次的，再用 `curl` 绕过浏览器缓存验证；
6. 如果怀疑是 Secret 的问题：不要把 Secret 的值打印出来验证，改成核对 Secret 名、重新粘贴一次私钥全文、重新核对主机密钥指纹这三件事。

## 17. 安全注意事项

1. 私钥绝不进仓库、绝不贴进聊天记录或工单、绝不截图发出来；一旦贴出过，就按第 18.3 节轮换，不要只删掉那条记录了事；
2. 部署密钥必须专用、只读（或只登录服务器）、能随时作废；不要用你平时登录服务器的个人密钥做部署，个人密钥丢了影响的是你这个人，部署密钥丢了影响的是这一个网站；
3. 工作流的 `permissions` 只给最小权限（本篇是 `contents: read`），不要图省事给写权限；
4. 不要在步骤里 `echo` 任何 Secret：GitHub 会把日志里的 Secret 打码，但打码不是万能的，拼接、截断、编码后的 Secret 可能打码不住；
5. 第三方 Action（本篇刻意一个都没用）如果以后要用，必须钉住提交哈希而不是只写主版本分支，分支指向的提交随时会变；
6. 分支保护从第一天就开：main 只接受合并请求，并且要求流水线通过才能合并，见第 9.1 节；
7. 部署账号不要用 root，sudo 只给指定的重载命令，见第 11.3 节；
8. 主机密钥必须钉住（第 9.5 节），不要用 `StrictHostKeyChecking=no` 图省事；
9. 定期轮换：部署密钥、服务器主机密钥、GitHub 的访问令牌都要有轮换节奏，至少做到“人员变动、密钥疑似泄露、服务器重装”这三件事发生时立即轮换；
10. 备份目录与旧版本目录要定期清理（见第 18.2 节），不要让磁盘被旧版本占满导致部署失败。

## 18. 回滚和恢复

### 18.1 回滚到上一版（符号链接方案）

在服务器上用部署账号执行下面两条命令，把符号链接指回上一版并重载（`20261103230000` 换成实际的上一版时间戳）：

```bash
ln -sfn /opt/www/example/releases/20261103230000 /opt/www/example/current
sudo systemctl reload nginx
```

然后按第 14 节的第 3、4 条验证：本机 `curl` 与外网 `curl` 都要回到上一版的内容，才算回滚完成。

### 18.2 清理旧版本与旧备份

保留最近 5 个版本与最近 5 份备份就够了，清理命令示例（在服务器上执行，先用 `ls` 确认要删的目录，再删）：

```bash
ls -lt /opt/www/example/releases/
ls -lt /opt/www/example/backups/
```

上面两条命令只列出目录，不删除；确认哪几个是最旧的之后，再用 `rm -rf` 删掉最旧的几个，删之前确认 `current` 符号链接指向的版本不在删除名单里。

### 18.3 密钥泄露后的轮换流程

1. 立即从服务器的 `authorized_keys` 里删掉泄露密钥对应的公钥行；
2. 重新生成一对部署密钥（第 9.3 节的命令，文件名换一个新的）；
3. 把新公钥放到服务器的 `authorized_keys` 里，把新私钥全文更新到 GitHub Secret `DEPLOY_KEY` 里；
4. 检查服务器日志与仓库 Actions 日志，看泄露期间有没有异常登录或异常运行；
5. 如果泄露的是能写仓库的密钥，还要检查仓库近期有没有异常提交，必要时联系仓库管理员。

## 19. 延伸阅读

- GitHub Actions 官方文档：工作流语法、触发条件、Secrets 的用法，以官网当场公布的内容为准；
- GitHub Deploy keys 官方文档：只读部署密钥的添加与管理；
- Git 官方文档：分支、合并、远程仓库的基础概念；
- OpenSSH 手册：`ssh-keygen`、`ssh`、`known_hosts` 的完整参数；
- rsync 手册：`-a`、`-z`、`--delete`、`--dry-run` 的完整说明；
- 本指南的相关章节见第 20 节。

## 20. 相关章节链接

- 服务器运行环境：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：[SRV-02 PHP-FPM、systemd、运行环境与进程管理](../server/02-runtime.md)
- 下一篇：[DEPLOY-02 Docker、Docker Compose 多容器网站平台、蓝绿/滚动部署、回滚](./02-docker.md)
