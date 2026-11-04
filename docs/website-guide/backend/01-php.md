# BE-01：PHP 框架完整教程

> 任务编号：BE-01（网站建设与部署实战指南 · 后端第 1 篇）
> 上一篇：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)；下一篇：[BE-02 Python 框架：Django、Flask、FastAPI](./02-python.md)。
> 本篇只讲 PHP 框架：Laravel、Symfony、ThinkPHP，各框架独立小节。不讲 Python、Node.js、Go、Java 框架（那是 BE-02 至 BE-05）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说出 Laravel、Symfony、ThinkPHP 各自适合什么样的项目、不适合什么样的项目；
2. 在自己的机器上用三个框架分别建出第一个能跑起来的项目；
3. 写出路由、控制器、模型、数据库迁移、模板页面和 JSON 接口，并说出它们之间是怎么配合的；
4. 看懂一份 PHP 项目的 Nginx 配置和 `.env` 配置，知道每个关键配置项是干什么的；
5. 把一个 PHP 项目部署到 Ubuntu 服务器上，并按第 14 节的步骤验证它真的跑起来了；
6. 遇到常见错误时，按第 15、16 节的办法定位到日志和出错环节，而不是只靠重装。

## 2. 适用人群

本篇适合下面这些人：

- 会写 PHP 基础语法（变量、数组、函数、类），想系统学一个 PHP 框架的人；
- 读过 ARCH-03 决策树，落点是“管理后台”或“动态网站”，想选 PHP 框架的人；
- 已经能搭 Nginx 和 MySQL，想知道 PHP 代码在服务器上是怎么跑起来的人。

不适合只想做纯静态站的人：静态站不需要后端框架，回去读 ARCH-03 的静态站落点更合适。不适合完全没写过 PHP 的人：先补 PHP 基础语法，再读本篇，否则路由、控制器、模型这些概念会连不上。

## 3. 适用系统和版本

- 操作系统：开发机不限（Windows、macOS、Linux 都可以）；部署示例以 **Ubuntu 24.04 LTS** 为准，Nginx 配置路径按 Debian 系写。
- PHP：**PHP 8.4**。三个框架都支持 8.4，而且 Symfony 8.1 要求 PHP 8.4 或更高，所以统一用 8.4，不用再为每个框架各装一个版本。
- 数据库：MySQL 8.0（示例用它），三个框架也都支持 PostgreSQL、SQLite，换数据库只改 `.env` 里的连接配置，不改业务代码。
- 依赖管理：Composer 2。三个框架都用 Composer 安装和管理依赖，不用 Composer 就装不了它们。

### 3.1 三个框架的版本（核查日期 2026-11-03）

动手前用公开搜索分别核查了三个框架官网与版本记录站的最新稳定版，结果如下，安装时仍以官网为准：

| 框架 | 核查到的最新稳定版 | 说明 |
| --- | --- | --- |
| Laravel | 13 线，最新补丁 **13.39.0**（2026-10-27） | 大版本 13 发布于 2026-03-17，要求 PHP 8.3 至 8.5；错误修复到 2027 年 9 月，安全修复到 2028-03-17；Laravel 12 已只剩安全修复，Laravel 11 已停止维护，新项目不要再用 11 |
| Symfony | 稳定版 **8.1.10**（2026-10-28） | 大版本 8.1 发布于 2026-05-29，要求 PHP 8.4 或更高；长期支持版是 **7.4.22**，安全修复到 2029 年 11 月，需要长期不升级的项目选 7.4 LTS |
| ThinkPHP | 8.1 线，官网最新公告 **8.1.4** | 8.1 正式版兼容 PHP 8.4，8.1.4 维护版兼容 PHP 8.5；核查时 GitHub Releases 页显示的最新标签与官网公告的补丁号有出入，所以本文不把某一个补丁号写死，安装用 `^8.1` 范围、锁文件为准 |

核查来源：Laravel 与 Symfony 的版本与支持时间来自 endoflife.date 与 Symfony 官网 releases 页的公开记录；ThinkPHP 的版本来自 thinkphp.cn 官网公告与 GitHub top-think/think Releases 页。补丁号每天都可能变，照着本文的版本号去装，装到更新的补丁号是正常的，只要大版本对得上就行。

## 4. 使用前提

开始之前，你需要已经具备下面这些，缺哪项就先补哪项：

- PHP 基础语法：变量、数组、关联数组、函数、类与对象、命名空间。框架代码里全是类和方法，看不懂类就读不下去。
- 命令行基础：能在终端里切换目录、运行命令、看懂报错的前两行。
- 数据库基础：知道表、字段、主键是什么意思，会用命令行或图形工具连上 MySQL 看一眼表结构。
- 已读过 NET-01：知道域名、端口、HTTP 请求与响应是什么，否则 Nginx 配置那一节会看不懂。

不需要先学的东西：不需要先会写原生 PHP 的路由分发、数据库封装、模板引擎——这些正是框架要替你做的事，学完本篇你就知道它们是怎么被框架接管的。

## 5. 所需资源

| 资源 | 用途 | 说明 |
| --- | --- | --- |
| PHP 8.4 | 运行框架代码 | 用 `php -v` 确认，输出里要有 8.4 字样 |
| Composer 2 | 安装框架与依赖 | 用 `composer -V` 确认，输出里要有 2 字样 |
| MySQL 8.0 | 存文章、用户这些业务数据 | 示例用它；本地练手也可以先用 SQLite，部署时再换 MySQL |
| Nginx | 生产环境对外提供服务 | 开发时三个框架都自带开发服务器，部署时才换 Nginx + PHP-FPM |
| Node.js（可选） | 编译 Laravel 的前端资源 | 只在你要改 Laravel 默认前端页面时才需要，纯接口项目可以不装 |
| Redis（可选） | 缓存与队列 | 三个框架都支持，不用它也能跑通本篇的示例 |

Ubuntu 24.04 上安装 PHP 8.4 的办法：系统自带源里的 PHP 是 8.3，要装 8.4 需要加 ondrej/php 源，命令在第 9 节的部署小节里给出。开发机上如果已经装了 PHP 8.3，Laravel 13 和 ThinkPHP 8.1 也能跑，但 Symfony 8.1 跑不起来，所以要学 Symfony 就必须装 8.4。

## 6. 技术原理

### 6.1 一个请求在框架里走过的路

不管用哪个框架，一个 HTTP 请求走的路都是一样的，区别只在每一步叫什么名字：

1. 用户在浏览器里打开一个地址，Nginx 把请求交给 PHP-FPM，PHP-FPM 找到项目的唯一入口文件（Laravel 是 `public/index.php`，Symfony 是 `public/index.php`，ThinkPHP 是 `public/index.php`，三个框架的入口都在 `public` 目录下，这不是巧合，是为了让 Web 服务器只能访问到 `public` 里的文件，源代码都在外面，别人从浏览器里够不着）。
2. 入口文件加载自动加载器和框架内核，内核按顺序跑中间件：有的中间件管跨域，有的管会话，有的管登录检查。
3. 路由器拿请求的地址和方法去匹配路由表，匹配到了就找到对应的控制器和方法。
4. 控制器做三件事：收参数并验证、调模型或服务层读写数据库、决定返回什么——返回模板渲染好的页面，或者返回 JSON。
5. 响应沿原路返回，经过中间件收尾，Nginx 把它发回浏览器。

记住这条路，第 16 节排错时就按这条路一段一段查：是 Nginx 没把请求交过来，还是路由没匹配上，还是控制器里报错，还是数据库连不上，每一段都有自己的日志。

### 6.2 MVC 与分层

三个框架都是 MVC 思想，但分工的叫法略有不同：

| 层 | 负责什么 | Laravel 里叫什么 | Symfony 里叫什么 | ThinkPHP 里叫什么 |
| --- | --- | --- | --- | --- |
| 路由 | 地址与方法的对照表 | `routes/web.php`、`routes/api.php` | 控制器方法上的 `#[Route]` 注解 | `route/app.php` |
| 控制器 | 收参数、调模型、返回响应 | `app/Http/Controllers` | `src/Controller` | `app/controller` |
| 模型 | 一张表对应一个类，封装读写 | `app/Models`（Eloquent） | `src/Entity`（Doctrine） | `app/model`（ThinkORM） |
| 视图 | 把数据拼成页面 | Blade 模板 `resources/views` | Twig 模板 `templates` | Think-Template `app/view` |
| 中间件 | 请求前后的通用检查 | `app/Http/Middleware` | 事件监听器与安全组件 | `app/middleware` |

### 6.3 三个框架的原理差异

- Laravel 的核心是服务容器加门面：你写的代码大多在调容器里已经注册好的服务，Eloquent 用活动记录模式，一个模型对象就是一行数据，写起来短。
- Symfony 的核心是一堆可独立使用的组件：路由、依赖注入、表单、验证、安全各是一个组件，你可以只拿其中几个，不用整个框架。它的控制器更“瘦”，逻辑习惯放在服务类里。
- ThinkPHP 的核心是轻量加约定：目录和命名有固定约定，照着约定放文件就不用写配置，中文文档全，入门最快；它的 ORM 也是活动记录风格，和 Laravel 的 Eloquent 写起来接近。

## 7. 架构说明

### 7.1 两种输出：页面与接口

同一个后端可以同时出两种东西：

- 页面：控制器返回模板渲染好的 HTML，浏览器直接显示。适合管理后台、内容站。
- 接口：控制器返回 JSON，前端（Vue、React、小程序、手机 App）拿 JSON 自己渲染。适合前后端分离。

三个框架都同时支持这两种输出，区别只在路由文件分不分开：Laravel 天生把 `routes/web.php`（页面）和 `routes/api.php`（接口）分开；Symfony 和 ThinkPHP 在同一个路由体系里写，返回模板还是返回 JSON 由控制器决定。

### 7.2 目录结构对照

| 位置 | Laravel | Symfony | ThinkPHP |
| --- | --- | --- | --- |
| 入口 | `public/index.php` | `public/index.php` | `public/index.php` |
| 路由 | `routes/` | 控制器上的 `#[Route]` | `route/` |
| 控制器 | `app/Http/Controllers/` | `src/Controller/` | `app/controller/` |
| 模型 | `app/Models/` | `src/Entity/` | `app/model/` |
| 视图 | `resources/views/`（Blade） | `templates/`（Twig） | `app/view/` |
| 配置 | `.env` + `config/` | `.env` + `config/` | `.env` + `config/` |
| 数据库迁移 | `database/migrations/` | `migrations/`（Doctrine Migrations） | `database/migrations/`（需装 think-migration） |
| 公共静态文件 | `public/` | `public/` | `public/` |

### 7.3 三框架选型对照

| 维度 | Laravel | Symfony | ThinkPHP |
| --- | --- | --- | --- |
| 上手速度 | 快，文档与示例多，开箱即用的东西最多 | 慢，概念多、配置多，适合有经验的团队 | 最快，中文文档全，约定多、配置少 |
| 适用项目 | 内容站、管理后台、API 服务、中小型产品 | 大型、长期维护、企业级、需要严格分层的项目 | 国内中小型项目、快速交付、中文团队 |
| 生态 | 官方扩展全（队列、缓存、认证、计费都有官方包） | 组件生态最大，很多框架都在用它的组件 | 国内生态，扩展以中文社区为主 |
| 学习资料 | 英文官方文档为主，中文资料多 | 英文官方文档为主，中文资料相对少 | 中文官方文档，中文资料最多 |
| 长期维护 | 大版本一年一发，升级频繁，要跟得上 | LTS 线支持到 2029 年，适合不想频繁升级的项目 | 8.x 线稳定，升级相对平缓 |
| 不适合 | 追求极致轻量、只想写几个接口的项目（框架太重） | 赶工期的小项目、刚学 PHP 的新手（概念负担重） | 需要国际化团队协作、依赖国际生态的项目 |

选型结论一句话：新手或赶工期选 ThinkPHP 或 Laravel；要长期维护的大项目选 Symfony LTS；已经在用 PHP 且想要最多现成轮子的选 Laravel。没有哪一个是“永远最好”的，选错的代价比选慢的代价大，第 18 节讲了怎么回退。

## 8. 操作前检查

动手前先跑下面这组检查，全部通过再往下走，卡在哪一步就先修哪一步：

```bash
php -v
composer -V
mysql --version
nginx -v
```

检查项与通过标准：

| 检查项 | 通过标准 | 不通过的常见原因 |
| --- | --- | --- |
| `php -v` | 输出 PHP 8.4 字样 | 装了多个 PHP 版本，命令行用的是旧版本，改默认版本或用完整路径 |
| `composer -V` | 输出 Composer 2 字样 | 没装 Composer，或装的是 1.x，重新按官网装 2.x |
| `mysql --version` | 输出 MySQL 8.0 字样 | 没装 MySQL，或只装了客户端没装服务端 |
| `nginx -v` | 输出 nginx 版本 | 只在部署机上需要，开发机上没有也不要紧 |
| PHP 扩展 | `php -m` 输出里有 `pdo_mysql`、`mbstring`、`openssl`、`tokenizer`、`xml`、`ctype`、`json` | 扩展没装，Ubuntu 上用 `apt install php8.4-扩展名` 补装 |

另外确认两件事：项目目录所在磁盘还有空间（`vendor` 目录装完依赖有几十 MB）；数据库里已经建好一个空库（示例用 `blog` 这个库名，字符集用 `utf8mb4`，排序规则用 `utf8mb4_unicode_ci`），建库命令在第 9 节给出。

## 9. 逐步操作

下面按 Laravel、Symfony、ThinkPHP 的顺序各走一遍：安装、创建第一个项目、目录结构、路由、数据库与模型、API、模板页面、错误处理。每个框架的操作都在自己的小节里写全，互不依赖，你可以只做其中一个，也可以三个都做。

### 9.1 Laravel：安装与第一个项目

第 1 步，确认环境。第 8 节的检查全部通过后，在家目录下执行创建命令：

```bash
cd ~
composer create-project laravel/laravel blog
cd blog
```

这条命令会下载 Laravel 骨架和依赖，第一次下载比较慢，耐心等它跑完，不要中途按 Ctrl+C，断了就删掉 `blog` 目录重来。

第 2 步，配数据库。把项目根目录下的 `.env` 文件里的数据库几行改成你自己的库（口令写你自己的真实口令，不要照抄占位符）：

```text
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=blog
DB_USERNAME=blog_user
DB_PASSWORD=请填真实口令
```

建库和建用户的 SQL（在 MySQL 里执行，口令同样换成你自己的）：

```sql
CREATE DATABASE blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'blog_user'@'localhost' IDENTIFIED BY '请填真实口令';
GRANT ALL PRIVILEGES ON blog.* TO 'blog_user'@'localhost';
FLUSH PRIVILEGES;
```

第 3 步，生成应用密钥并启动开发服务器：

```bash
php artisan key:generate
php artisan serve
```

看到 `Server running on [http://127.0.0.1:8000]` 就说明跑起来了，浏览器打开这个地址，能看到 Laravel 欢迎页就是成功。开发服务器只用来本地调试，生产环境不要用它，生产用第 11 节的 Nginx 配置。

第 4 步，Laravel 的目录结构。创建完的项目里，你最常碰的目录是：

| 目录 | 放什么 |
| --- | --- |
| `app/Models/` | 模型，一个模型对应一张表 |
| `app/Http/Controllers/` | 控制器，收请求、调模型、返回响应 |
| `routes/` | 路由表，`web.php` 是页面，`api.php` 是接口 |
| `resources/views/` | Blade 模板，页面就是从这里渲染出来的 |
| `database/migrations/` | 数据库迁移，建表、改表都写在这里，不用手写 SQL 建表 |
| `public/` | 唯一对外暴露的目录，入口 `index.php` 和静态文件都在这里 |

第 5 步，Laravel 的路由、模型、API、模板、错误处理，本篇的完整实战在第 10 节写全，这里先把最小闭环讲清：路由文件里写 `Route::get('/posts', [PostController::class, 'index'])`，控制器里查模型，模型对应 `posts` 表，返回 Blade 视图就是页面，返回 `response()->json()` 就是接口。验证失败时，Laravel 会自动把错误信息和旧输入带回表单页，接口请求则返回 422 状态码和错误字段，这些都不用你手写。

### 9.2 Symfony：安装与第一个项目

第 1 步，装 Symfony 命令行工具（这是 Symfony 官方的脚手架工具，不是框架本身），然后创建项目。`--webapp` 表示装上常用的 Web 组件包（路由、模板、数据库、表单、验证全套），新手直接用它，别一个一个慢慢装：

```bash
symfony new blog_symfony --version=8.1 --webapp
cd blog_symfony
```

第 2 步，配数据库。同样改项目根目录下的 `.env` 文件，Symfony 的数据库连接是写在一行里的：

```text
DATABASE_URL="mysql://blog_user:请填真实口令@127.0.0.1:3306/blog?serverVersion=8.0&charset=utf8mb4"
```

第 3 步，启动开发服务器：

```bash
symfony serve
```

看到服务地址后浏览器打开，能看到 Symfony 欢迎页就是成功。Symfony 的目录结构里，你最常碰的是：

| 目录 | 放什么 |
| --- | --- |
| `src/Controller/` | 控制器，路由写在方法上面的 `#[Route]` 注解里 |
| `src/Entity/` | 实体类，一张表对应一个实体，配 Doctrine 用 |
| `templates/` | Twig 模板，页面从这里渲染 |
| `config/` | 路由、服务、数据库的配置文件 |
| `migrations/` | 数据库迁移，实体改了之后用命令生成迁移文件 |
| `public/` | 唯一对外暴露的目录，入口 `index.php` 在这里 |

第 4 步，Symfony 的最小闭环：控制器方法上写 `#[Route('/posts', name: 'post_index')]`，方法里用注入的仓库查实体，返回 `$this->render('post/index.html.twig', ['posts' => $posts])` 就是页面，返回 `$this->json($posts)` 就是接口。表单验证用验证器组件，在实体属性上写断言，验证失败会收集成错误列表，控制器里判断后重新渲染表单。

### 9.3 ThinkPHP：安装与第一个项目

第 1 步，用 Composer 创建项目。ThinkPHP 的应用骨架包名是 `topthink/think`：

```bash
cd ~
composer create-project topthink/think blog_tp
cd blog_tp
```

第 2 步，配数据库。改项目根目录下的 `.env` 文件：

```text
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=blog
DB_USER=blog_user
DB_PASS=请填真实口令
DB_CHARSET=utf8mb4
```

第 3 步，启动开发服务器。ThinkPHP 自带一个基于 PHP 内置服务器的启动命令：

```bash
php think run
```

看到服务地址后浏览器打开，能看到 ThinkPHP 欢迎页就是成功。ThinkPHP 的目录结构里，你最常碰的是：

| 目录 | 放什么 |
| --- | --- |
| `app/controller/` | 控制器，类名和方法名按约定对应地址 |
| `app/model/` | 模型，ThinkORM 的活动记录风格 |
| `app/view/` | 模板，Think-Template 语法 |
| `route/` | 路由文件，不写路由时按“控制器/方法”的约定自动解析地址 |
| `config/` | 数据库、缓存、会话的配置文件 |
| `public/` | 唯一对外暴露的目录，入口 `index.php` 在这里 |

第 4 步，ThinkPHP 的最小闭环：控制器里写 `public function index()`，方法里用模型查数据，返回 `view('index', ['posts' => $posts])` 就是页面，返回 `json($posts)` 就是接口。验证用验证器类，验证失败会抛异常或返回错误信息，控制器里捕获后重新渲染表单。

### 9.4 Ubuntu 部署通用步骤

三个框架部署到 Ubuntu 24.04 的步骤是一样的，只在第 11 节的 Nginx 配置里把项目路径换成你自己的：

第 1 步，装 PHP 8.4 与必需扩展。Ubuntu 24.04 自带源里的 PHP 是 8.3，要装 8.4 先加 ondrej/php 源：

```bash
sudo apt update
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:ondrej/php
sudo apt update
sudo apt install -y php8.4 php8.4-fpm php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-bcmath php8.4-intl nginx mysql-server composer
```

第 2 步，把项目传到服务器，放到 `/var/www/blog` 这样的目录，目录归属改成 Web 用户，存储与缓存目录要可写：

```bash
sudo chown -R www-data:www-data /var/www/blog
sudo chmod -R 755 /var/www/blog
sudo chmod -R 775 /var/www/blog/storage /var/www/blog/bootstrap/cache
```

上面最后一条是 Laravel 的目录，Symfony 对应的是 `var/cache` 与 `var/log`，ThinkPHP 对应的是 `runtime` 目录，换成你用的框架的目录再执行。

第 3 步，按第 11 节写 Nginx 配置，检查通过后重载，浏览器打开域名，能看到欢迎页就是部署成功。生产环境务必把调试模式关掉，办法在第 17 节。

## 10. 完整代码

本节以 Laravel 做一个完整的小应用：文章列表、发表文章、查看文章详情、接口返回文章 JSON。文件注明存放路径，复制到第 9.1 节建好的 `blog` 项目里对应位置就能用。其余两个框架的最小项目片段放在本节末尾。

### 10.1 数据库迁移

文件：`database/migrations/2026_11_03_000000_create_posts_table.php`。迁移文件名的时间戳按你实际生成的时间写，内容如下：

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('body');
            $table->boolean('published')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
```

执行迁移的命令：

```bash
php artisan migrate
```

### 10.2 模型

文件：`app/Models/Post.php`。`$fillable` 列出允许批量赋值的字段，不在里面的字段从表单提交过来也不会被写进数据库，这是防批量赋值漏洞的关键一行：

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $fillable = ['title', 'body', 'published'];

    protected $casts = [
        'published' => 'boolean',
    ];
}
```

### 10.3 控制器

文件：`app/Http/Controllers/PostController.php`。`store` 方法里的 `validate` 会在验证失败时自动把错误带回表单页，不用手写判断：

```php
<?php

namespace App\Http\Controllers;

use App\Models\Post;
use Illuminate\Http\Request;

class PostController extends Controller
{
    public function index()
    {
        $posts = Post::where('published', true)->latest()->get();
        return view('posts.index', ['posts' => $posts]);
    }

    public function create()
    {
        return view('posts.create');
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => 'required|string|max:100',
            'body' => 'required|string',
        ]);
        $data['published'] = true;
        $post = Post::create($data);
        return redirect()->route('posts.show', $post);
    }

    public function show(Post $post)
    {
        return view('posts.show', ['post' => $post]);
    }
}
```

### 10.4 路由

文件：`routes/web.php`，页面路由：

```php
<?php

use App\Http\Controllers\PostController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PostController::class, 'index']);
Route::resource('posts', PostController::class)->only(['index', 'create', 'store', 'show']);
```

文件：`routes/api.php`，接口路由，返回 JSON，不走页面模板：

```php
<?php

use App\Models\Post;
use Illuminate\Support\Facades\Route;

Route::get('/posts', function () {
    return Post::where('published', true)->latest()->get(['id', 'title', 'body']);
});
```

### 10.5 模板

文件：`resources/views/layouts/app.blade.php`，公共布局，三个页面都套用它：

```php
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? '文章' }}</title>
</head>
<body>
    <header>
        <a href="/">首页</a>
        <a href="/posts/create">写文章</a>
    </header>
    <main>
        @yield('content')
    </main>
</body>
</html>
```

文件：`resources/views/posts/index.blade.php`，文章列表页：

```php
@extends('layouts.app')

@section('content')
    <h1>文章列表</h1>
    @foreach ($posts as $post)
        <article>
            <h2><a href="/posts/{{ $post->id }}">{{ $post->title }}</a></h2>
        </article>
    @endforeach
@endsection
```

文件：`resources/views/posts/create.blade.php`，发表文章的表单页。`@csrf` 会生成防跨站请求伪造的隐藏字段，没有它表单提交会被框架拒绝：

```php
@extends('layouts.app')

@section('content')
    <h1>写文章</h1>
    <form method="post" action="/posts">
        @csrf
        <div>
            <label for="title">标题</label>
            <input id="title" name="title" value="{{ old('title') }}">
        </div>
        <div>
            <label for="body">正文</label>
            <textarea id="body" name="body">{{ old('body') }}</textarea>
        </div>
        <button type="submit">发布</button>
    </form>
@endsection
```

文件：`resources/views/posts/show.blade.php`，文章详情页：

```php
@extends('layouts.app')

@section('content')
    <h1>{{ $post->title }}</h1>
    <p>{{ $post->body }}</p>
    <p><a href="/posts">返回列表</a></p>
@endsection
```

### 10.6 种子数据

文件：`database/seeders/PostSeeder.php`，用来往空库里填两篇示例文章，方便验证：

```php
<?php

namespace Database\Seeders;

use App\Models\Post;
use Illuminate\Database\Seeder;

class PostSeeder extends Seeder
{
    public function run(): void
    {
        Post::create(['title' => '第一篇文章', 'body' => '这是第一篇示例文章的正文。', 'published' => true]);
        Post::create(['title' => '第二篇文章', 'body' => '这是第二篇示例文章的正文。', 'published' => true]);
    }
}
```

执行种子的命令：

```bash
php artisan db:seed --class=PostSeeder
```

### 10.7 Symfony 最小项目片段

文件：`src/Controller/PostController.php`。路由写在方法上面的 `#[Route]` 注解里，`{id}` 是占位符，会按名字传给方法参数：

```php
<?php

namespace App\Controller;

use App\Repository\PostRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class PostController extends AbstractController
{
    #[Route('/posts', name: 'post_index')]
    public function index(PostRepository $posts): Response
    {
        return $this->render('post/index.html.twig', [
            'posts' => $posts->findAll(),
        ]);
    }

    #[Route('/api/posts', name: 'api_post_index')]
    public function apiIndex(PostRepository $posts): Response
    {
        return $this->json($posts->findAll());
    }
}
```

文件：`templates/post/index.html.twig`，Twig 模板片段：

```php
{% extends 'base.html.twig' %}
{% block body %}
    <h1>文章列表</h1>
    {% for post in posts %}
        <article>
            <h2>{{ post.title }}</h2>
        </article>
    {% endfor %}
{% endblock %}
```

### 10.8 ThinkPHP 最小项目片段

文件：`app/controller/Index.php`。不写路由文件时，地址按“控制器/方法”的约定解析，`index` 方法对应首页：

```php
<?php

namespace app\controller;

use app\model\Post;
use think\facade\View;

class Index
{
    public function index()
    {
        $posts = Post::where('published', 1)->order('id', 'desc')->select();
        return View::fetch('index', ['posts' => $posts]);
    }

    public function apiPosts()
    {
        $posts = Post::where('published', 1)->order('id', 'desc')->select();
        return json($posts);
    }
}
```

文件：`route/app.php`，显式路由，想把地址写死时用它：

```php
<?php

use think\facade\Route;

Route::get('/', 'index/index');
Route::get('api/posts', 'index/apiPosts');
```

文件：`app/view/index/index.html`，Think-Template 模板片段：

```php
<h1>文章列表</h1>
{foreach $posts as $post}
    <article>
        <h2>{$post.title}</h2>
    </article>
{/foreach}
```

## 11. 完整配置文件

### 11.1 环境配置

文件：项目根目录下的 `.env`，以 Laravel 为例。口令一律写占位符，部署时换成你自己的真实口令，真实口令绝不要写进教程、截图、聊天记录或版本库：

```text
APP_NAME=blog
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=blog
DB_USERNAME=blog_user
DB_PASSWORD=请填真实口令
```

Symfony 的数据库连接写在一行里，见第 9.2 节；ThinkPHP 的数据库配置见第 9.3 节，键名不同，意思一样。

### 11.2 Nginx 配置

文件：`/etc/nginx/sites-available/blog`，Ubuntu/Debian 系。启用办法是把它软链接到 `sites-enabled` 目录，再检查配置、重载 Nginx，命令在第 14 节。注意 `root` 指向 `public` 目录，不是项目根目录，指向项目根目录会把源代码和 `.env` 暴露出去：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/blog/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

部署前先按第 9.4 节把项目放到 `/var/www/blog`，把 `server_name` 换成你自己的域名，把 `php8.4-fpm.sock` 的版本号换成你实际装的 PHP 版本，三个地方都换完再重载。

### 11.3 Composer 依赖声明

文件：项目根目录下的 `composer.json`，以 Laravel 项目为例。`require` 里是运行时依赖，`require-dev` 里是只在开发时用的依赖，部署时可以用不装开发依赖的办法省空间：

```json
{
    "name": "example/blog",
    "type": "project",
    "require": {
        "php": "^8.4",
        "laravel/framework": "^13.0"
    },
    "require-dev": {
        "fakerphp/faker": "^1.24"
    },
    "autoload": {
        "psr-4": {
            "App\\": "app/",
            "Database\\Seeders\\": "database/seeders/"
        }
    },
    "minimum-stability": "stable"
}
```

## 12. 每个关键配置项的解释

### 12.1 `.env` 关键项

| 配置项 | 意思 | 填错会怎样 |
| --- | --- | --- |
| `APP_ENV` | 运行环境，`production` 是生产，`local` 是本地开发 | 生产写成 `local`，错误信息会暴露给访客 |
| `APP_DEBUG` | 是否把详细报错显示在页面上 | 生产设成 `true`，数据库结构、文件路径都会泄露给访客，必须是 `false` |
| `APP_URL` | 网站对外地址，生成链接和重定向时用它 | 填错会导致登录后跳到错误地址，或生成的链接打不开 |
| `DB_HOST` | 数据库地址，`127.0.0.1` 表示本机 | 填成域名时，解析失败就连不上库 |
| `DB_DATABASE` | 库名 | 库名不存在，迁移和查询都会报库不存在 |
| `DB_USERNAME`、`DB_PASSWORD` | 数据库账号和口令 | 账号没权限或口令错，表现为连接被拒绝，查第 16 节 |

### 12.2 Nginx 关键项

| 配置项 | 意思 | 填错会怎样 |
| --- | --- | --- |
| `server_name` | 这个配置管哪个域名 | 域名对不上，Nginx 会交给默认站点，打开是别人的页面或 404 |
| `root` | 网站根目录，必须指向 `public` | 指到项目根目录，`.env` 和源代码就能从浏览器直接下载 |
| `try_files $uri $uri/ /index.php?$query_string` | 先找静态文件，找不到就交给框架入口，并把查询串带过去 | 少了这一行，所有非首页地址都会 404，只有首页能打开 |
| `fastcgi_pass` | PHP-FPM 的监听地址，`unix:/run/php/php8.4-fpm.sock` 是套接字文件 | 版本号对不上，Nginx 报 502，意思是 PHP-FPM 没接上 |
| `location ~ /\.ht` 的 `deny all` | 拒绝访问以点开头的文件 | 没这一行，`.env` 一旦被放到可访问目录就有泄露风险 |

### 12.3 `composer.json` 关键项

| 配置项 | 意思 |
| --- | --- |
| `require.php` | 要求 PHP 版本，`^8.4` 表示 8.4.x 都可以，8.5 不行 |
| `require.laravel/framework` | 框架本身，`^13.0` 表示 13.x 都可以 |
| `autoload.psr-4` | 命名空间与目录的对照，`App\` 对应 `app/` 目录，类文件放错目录就找不到类 |
| `minimum-stability` | 只装稳定版，不装开发版，生产项目必须是 `stable` |

## 13. 执行结果示例

下面是读者在本机按第 9、10 节跑通后应看到的样子，标明“示例输出”的都是应看到的样式，实际时间戳、进程号、内存数字以你本机为准：

第 1 组，迁移与种子执行后应看到的样式（示例输出）：

```text
INFO  Running migrations.
2026_11_03_000000_create_posts_table           12ms DONE
INFO  Seeding database.
Database\Seeders\PostSeeder                   DONE
```

第 2 组，路由列表。Laravel 用 `php artisan route:list` 查看，输出里应有下面这几行，地址和方法对得上就说明路由注册成功了：

```text
GET  /                     PostController@index
GET  posts                 PostController@index
GET  posts/create          PostController@create
POST posts                 PostController@store
GET  posts/{post}          PostController@show
```

第 3 组，浏览器打开首页应看到的样子：页面标题是文章列表，下面列出两篇种子文章的标题，点标题能进详情页，点“写文章”能打开表单，填完标题和正文提交后回到详情页，能看到刚发表的文章。

第 4 组，接口返回。浏览器或 curl 打开 `/api/posts`，应返回 JSON 数组，结构如下（示例输出，文章内容以你库里的数据为准）：

```json
[
    {
        "id": 1,
        "title": "第一篇文章",
        "body": "这是第一篇示例文章的正文。"
    },
    {
        "id": 2,
        "title": "第二篇文章",
        "body": "这是第二篇示例文章的正文。"
    }
]
```

## 14. 成功验证

按顺序做完下面 8 步，全部通过才算跑通，哪一步失败就按第 16 节查哪一步：

1. 环境检查：`php -v` 输出 PHP 8.4，`composer -V` 输出 Composer 2。
2. 欢迎页：开发服务器跑起来后，浏览器打开服务地址，能看到框架欢迎页。
3. 迁移成功：`php artisan migrate`（Laravel）或对应框架的迁移命令跑完不报错，数据库里出现 `posts` 表。
4. 首页能打开：浏览器打开 `/`，能看到两篇种子文章的标题。
5. 发表能成功：打开 `/posts/create`，填标题和正文提交，跳到详情页，能看到刚发表的文章；标题留空提交时，应回到表单页并提示标题必填，而不是直接报 500。
6. 接口能返回：打开 `/api/posts`，返回 JSON 数组，里面有种子文章。
7. Nginx 检查：部署机上执行 `sudo nginx -t`，输出 `syntax is ok` 和 `test is successful`，再执行 `sudo systemctl reload nginx`，浏览器打开域名，能看到首页。
8. 生产调试已关：部署机上的 `.env` 里 `APP_DEBUG=false`，故意打开一个不存在的地址，应看到通用错误页，而不是带文件路径和数据库信息的详细报错页。

## 15. 常见错误

| 现象 | 原因 | 解决办法 |
| --- | --- | --- |
| `composer create-project` 卡住或报内存不足 | 依赖多，默认内存上限不够，或网络慢 | 加大内存上限再跑，或换网络重试，不要删一半的 `vendor` 目录继续用 |
| `php artisan` 报找不到 `pdo_mysql` | PHP 的 MySQL 扩展没装 | Ubuntu 上装 `php8.4-mysql`，再重启 PHP-FPM |
| 迁移报连接被拒绝 | 数据库没启动、地址或口令错、用户没权限 | 先确认 MySQL 在跑，再核对 `.env` 里的地址、库名、账号、口令，再查用户权限 |
| 首页能打开，其他地址全是 404 | Nginx 缺少 `try_files` 那一行 | 按第 11.2 节把 `try_files` 补上，重载 Nginx |
| 打开页面报 502 | Nginx 连不上 PHP-FPM | 核对 `fastcgi_pass` 里的套接字路径与 PHP 版本，确认 `php8.4-fpm` 服务在跑 |
| 表单提交报 419 | 缺少防跨站请求伪造字段 | Laravel 表单里加上 `@csrf`，接口请求要带上约定的请求头，见框架文档的 CSRF 一节 |
| 页面样式全乱或空白 | 静态文件路径不对，或前端资源没编译 | 先确认 `public` 目录下的文件能直接访问，再按框架文档编译前端资源 |
| 生产页面显示详细报错 | `APP_DEBUG` 还是 `true` | 改成 `false`，并清掉配置缓存，见第 17 节 |
| 改了 `.env` 不生效 | 配置被缓存了 | Laravel 执行 `php artisan config:clear` 清配置缓存，Symfony 与 ThinkPHP 按各自文档清缓存 |
| 上传文件后打不开 | 存储目录权限不对，或软链接没建 | Laravel 要执行 `php artisan storage:link` 建软链接，并确认目录归属是 Web 用户 |

## 16. 故障排查

按请求走过的路一段一段查，不要一上来就重装：

第 1 步，看 Nginx 日志。文件在 `/var/log/nginx/error.log`，看最后几行：

```bash
sudo tail -20 /var/log/nginx/error.log
```

如果里面有 `connect() to unix:/run/php/php8.4-fpm.sock failed`，说明 PHP-FPM 没跑或路径不对，去查 PHP-FPM 服务状态。

第 2 步，看 PHP-FPM 与框架日志。Laravel 的日志在 `storage/logs/laravel.log`，Symfony 的在 `var/log/`，ThinkPHP 的在 `runtime/log/`。看报错的第一行和堆栈的第一段，定位到是哪个文件、哪一行：

```bash
tail -30 storage/logs/laravel.log
```

第 3 步，分段定位。按下面这张表对号入座：

| 报错位置 | 说明 | 下一步 |
| --- | --- | --- |
| Nginx 日志里有 502 | 请求没到 PHP | 查 PHP-FPM 服务与套接字路径 |
| 框架日志里有路由相关报错 | 地址没匹配上路由 | 查路由表，确认方法与地址写对了 |
| 框架日志里有数据库连接报错 | 库没连上 | 核对 `.env`，再查数据库服务与用户权限 |
| 框架日志里有类找不到 | 命名空间或目录放错了 | 核对类名、命名空间、文件路径三者是否一致 |
| 页面 500 但日志是空的 | 日志目录不可写，或错误被吞了 | 先确认日志目录归属与权限，再开开发环境的调试看一次 |

第 4 步，隔离验证。新建一个最简单的路由，只返回一句话，能打开说明框架与 Nginx 是通的，问题在业务代码里；打不开说明问题在环境与配置里，继续查前两步。验证完把测试路由删掉，不要留在生产项目里。

## 17. 安全注意事项

- 口令与密钥只放 `.env`，绝不要写进代码、教程、截图、聊天记录。`.env` 文件绝不要提交进版本库，版本库里只放 `.env.example` 这样的模板文件，模板里的口令写占位符。
- 生产环境 `APP_DEBUG` 必须是 `false`，`APP_ENV` 必须是 `production`。开发环境的详细报错页会泄露文件路径、数据库结构、配置信息，访客看到就等于送了半张系统地图。
- 数据库查询一律用框架的查询构造器或模型，不要自己拼 SQL 字符串。用户输入拼进 SQL 就是注入漏洞，参数绑定是框架默认做的事，别绕过它。
- 输出到页面的用户内容要转义。Laravel 的 Blade 用 `{{ }}` 默认转义，不要图方便换成不转义的写法；Symfony 的 Twig 与 ThinkPHP 的模板同样默认转义，保持默认就是安全的。
- 表单一律带防跨站请求伪造字段，接口按框架文档的要求带请求头。删掉这个字段会让表单能用，但也让跨站伪造能得手。
- 文件上传要限制类型与大小，上传目录不要允许执行 PHP。只按扩展名判断类型是不够的，还要按框架文档检查文件内容类型，上传目录的 Nginx 配置里要禁掉 PHP 执行。
- 依赖要定期更新。Composer 依赖里爆出安全漏洞时，先看官方公告的影响范围，再升级对应包并跑一遍第 14 节的验证，不要只升版本号不验证。
- 管理后台与接口要做登录检查，不要只靠“地址没人知道”。后台路由必须挂登录中间件，接口必须校验调用方身份，检查办法见第 14 节的第 5 步与第 6 步。
- 旧版本要及时升：Laravel 11 已停止维护，Symfony 8.0 已停止维护，继续用停止维护的版本等于公开已知漏洞不补，升级前先按第 18 节做好备份。

## 18. 回滚和恢复

### 18.1 上线前必须有的备份

- 代码备份：项目用 Git 管理，上线前提交一次，记下提交号，回滚时 checkout 回这个提交号就行。
- 数据库备份：上线前用 `mysqldump` 导出一份，文件名带日期，放到服务器之外的地方。
- 配置备份：把能跑通的 `.env` 与 Nginx 配置各复制一份到备份目录，文件名带日期，回滚时直接覆盖回去。

### 18.2 代码回滚

```bash
git log --oneline -5
git checkout 上线前的提交号
```

回滚后要清配置缓存、重启 PHP-FPM，再跑一遍第 14 节的验证，确认首页与接口都正常才算回滚完成。

### 18.3 数据库回滚

- 迁移回滚：Laravel 用 `php artisan migrate:rollback` 退回最后一批迁移；Symfony 用 Doctrine Migrations 的回滚命令；ThinkPHP 用 think-migration 的回滚命令。回滚前先确认这批迁移没有删掉已有数据，删数据的迁移不要直接回滚，先恢复备份库。
- 备份恢复：用上线前导出的备份文件恢复数据库，恢复后同样跑一遍第 14 节的验证。

### 18.4 配置回滚

把备份的 `.env` 与 Nginx 配置覆盖回去，执行 `nginx -t` 检查通过后再重载 Nginx，确认首页能打开。回滚不是“把服务器恢复出厂”，只是回到上一个能跑通的状态，回滚完一定要验证，不要凭感觉认为回去了。

## 19. 延伸阅读

- Laravel 官方文档（laravel.com）：路由、Eloquent、Blade、队列、认证的完整说明，安装时查版本与 PHP 要求以它为准。
- Symfony 官方文档（symfony.com）：组件、依赖注入、表单、安全的完整说明，LTS 与稳定版的支持时间以它的 releases 页为准。
- ThinkPHP 官方文档（doc.thinkphp.cn）：路由、模型、验证器、模板的完整中文说明，版本公告以 thinkphp.cn 官网为准。
- 本指南的 ARCH-03 决策树：选方案之前先走一遍决策树，确认 PHP 框架这个落点适合你的项目。
- 本指南的 NET-01：域名、端口、HTTP 请求与响应的基础，读不懂 Nginx 配置时回去补。
- 本指南的 09-web-hosting 相关文章：HTTPS 证书的签发与配置细节，生产环境上 HTTPS 后再读。

## 20. 相关章节链接

- 选型总览：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 上一篇：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)
- 下一篇：[BE-02 Python 框架：Django、Flask、FastAPI](./02-python.md)
