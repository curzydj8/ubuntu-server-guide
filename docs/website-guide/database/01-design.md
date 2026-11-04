# DB-01：数据库选型、表设计、SQL、索引、事务、连接池完整教程

> 任务编号：DB-01（网站建设与部署实战指南 · 数据库第 1 篇）
> 上一篇：[BE-05 Java 框架：Spring Boot、Spring MVC、Quarkus](../backend/05-java.md)；下一篇：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](./02-ops.md)。
> 本篇只讲数据库本身：怎么选、表怎么设计、SQL 怎么写、索引怎么建、事务怎么用、连接池怎么配。不讲备份恢复与主从复制（那是 DB-02），不讲某个后端框架的 ORM 具体用法（那是 BE-01 至 BE-05 各篇的范围）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 按数据形状和访问方式选数据库：知道什么时候用关系型、什么时候用文档型，什么时候 SQLite 就够了。
2. 设计三张能直接建库的表：用户、文章、评论，主键、外键、唯一约束、状态约束齐全。
3. 写出建表、增删改查、联表、聚合的 SQL，并能读懂执行计划，知道一条查询走没走索引。
4. 正确使用事务：知道提交与回滚的区别，知道隔离级别和死锁是怎么回事。
5. 配好连接池：知道池为什么存在、大小怎么定、泄漏怎么查。

## 2. 适用人群

- 已经会写后端接口，但建表全靠感觉、SQL 全靠拼接的初学者。
- 正在给自己的网站选数据库，在 MySQL、PostgreSQL、SQLite 之间拿不定主意的人。
- 遇到过“数据对不上”“越查越慢”但不知道从哪查起的人。

不适合只想抄一份配置就上线、不想理解表结构的人：本篇要求你亲手跑一遍 SQL，看到真实结果。

## 3. 适用系统和版本

- 操作系统：Ubuntu 24.04（示例命令在 Ubuntu 上验证；SQL 本身与操作系统无关）。
- 本机实测环境：SQLite 3.45.1（Python 3.12.3 自带 `sqlite3` 模块，命令行 `sqlite3` 也已安装）。本篇第 10 节的全部 SQL 和第 13 节的全部输出，都是在这个环境里真实跑出来的。
- 关系型数据库举例：MySQL 8.4 LTS、PostgreSQL。本篇引用它们只是为了讲清方言差异，安装时以官网当场公布的版本为准，不要凭本篇记住的版本号去安装。
- 本篇不要求你先装 MySQL 或 PostgreSQL：先用 SQLite 把概念跑通，再到自己的数据库上对照方言表改写。

## 4. 使用前提

1. 会用命令行进入一个目录、会用文本编辑器保存文件。
2. 知道什么是 HTTP 接口、什么是后端程序（BE-01 至 BE-05 任选一篇读过即可）。
3. 理解“用户、文章、评论”这个内容站模型：一个用户可以写多篇文章，一篇文章可以有多条评论，一条评论属于一个用户和一篇文章。

## 5. 所需资源

| 资源 | 说明 |
| --- | --- |
| 一台 Ubuntu 机器或虚拟机 | 本篇命令在 Ubuntu 24.04 上验证 |
| Python 3.12 | 自带 `sqlite3` 模块，不需要另外装数据库 |
| 一个空目录 `~/db-practice/` | 存放练习数据库和配置文件 |
| 可选：MySQL 或 PostgreSQL | 只在你想对照方言时才需要，本篇不强制 |

## 6. 技术原理

### 6.1 关系型与文档型：存的是“关系”还是“文档”

关系型数据库把数据拆成多张表，用主键和外键把表连起来。它的强项是：结构固定、约束严格、联表查询和事务成熟。用户、文章、评论这种“谁是谁的、谁属于谁”说得清的数据，最适合关系型。

文档型数据库把数据存成一份份文档（通常是 JSON 形状），一份文档里可以嵌套数组和子对象。它的强项是：结构灵活、写起来快、横向扩展容易。字段经常变、每条记录长得不一样的数据（例如埋点、日志、配置）更适合文档型。

选型时先问数据一句话：这份数据有没有“必须同时成立”的关系？有，就先考虑关系型；没有、且结构天天变，再考虑文档型。不要反过来：先选了文档型，再用应用代码去拼关系和事务，那是把数据库该干的活推给了自己。

### 6.2 表、行、列、主键、外键

- 表是一类事物的集合，例如 `users` 表就是所有用户的集合。
- 行是一条记录，例如一个用户。
- 列是一个字段，例如用户名。
- 主键是唯一标识一行的列（或列组合），一张表有且只有一个主键，值不能重复、不能为空。
- 外键是一列指向另一张表主键的值，它的作用是保证“引用的那行一定存在”。例如 `articles.author_id` 指向 `users.id`，就保证了文章的作者一定是真实存在的用户。
- 唯一约束保证某一列（或列组合）不重复，例如用户名、邮箱。

### 6.3 B-Tree 索引：为什么查得快

索引是一份按某列排好序的目录。没有索引时，数据库要把整张表从头翻到尾（全表扫描）；有索引时，数据库可以按目录直接定位到符合条件的行，再回表取完整数据。这就是 B-Tree 索引的基本思想：用一份有序结构换查询速度，代价是写数据时要多维护一份目录、占一份磁盘空间。

索引不是越多越好：每个索引都会让插入、更新、删除变慢一点，也会让表结构更难理解。只给真正用来过滤、排序、联表的列建索引。

### 6.4 事务与 ACID

事务是一组“要么全做、要么全不做”的操作。ACID 是事务的四个性质：

| 性质 | 含义 |
| --- | --- |
| 原子性 Atomicity | 一组操作要么全部提交，要么全部回滚，不存在做一半的状态 |
| 一致性 Consistency | 事务前后，数据都满足所有约束（例如外键、唯一约束、检查约束） |
| 隔离性 Isolation | 并发事务之间互不干扰的程度，由隔离级别决定 |
| 持久性 Durability | 提交之后的数据不会因为断电或崩溃而丢失 |

隔离级别从低到高是：读未提交、读已提交、可重复读、串行化。级别越高，并发问题越少，并发能力通常越低。常见并发问题有脏读（读到别人还没提交的数据）、不可重复读（同一事务里两次读同一行结果不一样）、幻读（同一事务里两次查同一条件行数不一样）。本篇示例只演示提交与回滚，不演示并发脏读：并发问题需要在多连接下复现，单机单连接的演示写不出来，硬写就是编造。

### 6.5 连接池：为什么不能每次都新建连接

建立数据库连接要握手、认证、分配资源，成本不低。如果每个 HTTP 请求都新建连接、用完就关，高并发下光建连接就能把数据库拖垮。连接池的做法是：预先建好一批连接放在池里，请求来了从池里借一个，用完还回去，不关闭。池的大小、借用超时、空闲回收，就是第 11 节和第 12 节要配的东西。

## 7. 架构说明

### 7.1 三层结构

应用层只管业务逻辑，连接池管连接的借还，数据库管数据的存取。应用层永远不要绕过连接池直接新建连接，也不要把 SQL 拼接进字符串里执行（见第 17 节）。

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 应用层 | 业务逻辑、参数校验、调用连接池 | 不直接管理连接的生死 |
| 连接池 | 借还连接、限制并发连接数、检测泄漏 | 不理解业务含义 |
| 数据库 | 存数据、走索引、执行事务 | 不知道 HTTP 请求是谁发的 |

### 7.2 选型对照表

本表只给比较维度，不给“最好”的结论：没有哪一行是所有场景的答案。

| 数据库 | 类型 | 适合场景 | 不适合场景 | 上手成本 |
| --- | --- | --- | --- | --- |
| SQLite | 关系型，单文件 | 练手、单机小站、测试、嵌入式 | 多人同时写、高并发、需要独立数据库服务 | 最低 |
| MySQL 8.4 LTS | 关系型，独立服务 | 内容站、电商、读多写少、PHP 生态 | 复杂分析查询、强 JSON/数组需求 | 中 |
| PostgreSQL | 关系型，独立服务 | 复杂查询、JSON 字段、分析、强一致性要求 | 只想零配置跑起来的单机小工具 | 中 |
| 文档型（以 MongoDB 为例） | 文档型 | 结构多变、海量写入、日志埋点 | 强事务、多表联查、严格约束 | 中 |

选型结论（按本篇示例）：内容站先选关系型；练手先用 SQLite；上线用 MySQL 或 PostgreSQL，二选一的依据是团队熟悉度和已有生态，不是本篇的排名。

### 7.3 表关系图（文字版）

用户表 `users` 是一，文章表 `articles` 是多：一个用户写多篇文章，`articles.author_id` 指向 `users.id`。文章表是一，评论表 `comments` 是多：一篇文章有多条评论，`comments.article_id` 指向 `articles.id`。用户表与评论表也是一对多：一个用户写多条评论，`comments.author_id` 指向 `users.id`。

## 8. 操作前检查

动手前先确认下面四项，缺一项就先补齐，不要跳过：

1. `python3 --version` 能输出版本号（本机为 Python 3.12.3）。
2. `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` 能输出 SQLite 版本（本机为 3.45.1）。
3. 空目录 `~/db-practice/` 已建好，练习数据库文件将放在这里，不会污染其他目录。
4. 明白本篇的口令写法：示例里的口令哈希一律写 `HASH-PLACEHOLDER-1` 这种占位符，真实项目里口令绝不能明文存库，要用 bcrypt 或 Argon2 这类慢哈希算法在应用层算好再存（见第 17 节）。

## 9. 逐步操作

第 1 步：建练习目录。

```bash
mkdir -p ~/db-practice
cd ~/db-practice
```

第 2 步：把第 10.1 节的建表 SQL 保存为 `schema.sql`，把第 10.2 节的索引 SQL 保存为 `indexes.sql`，把第 10.3 节的查询 SQL 保存为 `queries.sql`。三个文件都在 `~/db-practice/` 下。

第 3 步：用 Python 的 `sqlite3` 模块建库并执行建表与插入（第 10.1 节和第 10.4 节），不要直接用生产库练手。

第 4 步：先跑一次“建索引前”的执行计划，记下它是全表扫描；再建索引，跑一次“建索引后”的执行计划，确认它走了索引；最后跑一次前导通配符查询，确认它又回到了全表扫描。

第 5 步：跑事务示例：先插入一条评论再回滚，确认条数不变；再插入一条评论并提交，确认条数加一。

第 6 步：对照第 11 节写好配置文件，再对照第 14 节逐项验证，全部通过才算做完。

## 10. 完整代码

本节全部 SQL 都在 SQLite 3.45.1 上真实跑通过。第 10.6 节的方言对照表里，MySQL 与 PostgreSQL 的写法没有在本机跑过，只作为对照参考，读者要在自己的数据库上验证，不要把 SQLite 的结果冒充成它们的执行结果。

### 10.1 建表 SQL（文件：`~/db-practice/schema.sql`）

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

建表要点，逐条对照上面的 SQL：

- 主键用自增整数 `id`，三张表各有一个，不用业务字段（例如用户名、邮箱）当主键：业务字段会变，主键不应该变。
- `username` 和 `email` 各加 `UNIQUE`：注册时用户名和邮箱不能重复，靠约束保证，不靠应用层先查一遍再插（先查再插在并发下会漏网）。
- `articles.status` 用 `CHECK` 约束限定只能是 `draft` 或 `published`：状态值写错时建库阶段就能发现，不会等到页面上出现一个谁也没见过的状态。
- 外键用 `REFERENCES` 写清：`articles.author_id` 指向 `users.id`，`comments.article_id` 指向 `articles.id`，`comments.author_id` 指向 `users.id`。注意：SQLite 默认不强制外键，应用层要在连接后执行 `PRAGMA foreign_keys = ON;` 才会真正检查，见第 14 节。

### 10.2 索引 SQL（文件：`~/db-practice/indexes.sql`）

```sql
CREATE INDEX idx_articles_author_id ON articles(author_id);
CREATE INDEX idx_comments_article_id ON comments(article_id);
CREATE INDEX idx_articles_status_created ON articles(status, created_at);
```

建索引的理由，逐条对照：

- `idx_articles_author_id`：按作者查文章是最常见的过滤条件，第 13 节会证明它确实让查询从全表扫描变成了走索引。
- `idx_comments_article_id`：按文章查评论同样常见，评论列表页每次都要用。
- `idx_articles_status_created`：复合索引，服务于“已发布文章按时间倒序”这种组合条件：先按 `status` 过滤，再按 `created_at` 排序。复合索引里列的顺序很重要：等值过滤的列放前面，范围或排序的列放后面，顺序写反了就用不上。

什么时候不建索引：

| 场景 | 原因 |
| --- | --- |
| 只有几百行的小表 | 全表扫描本身就很快，索引省不了多少，还要多维护一份目录 |
| 写多读少的表 | 每次插入、更新、删除都要同步更新索引，写得越多亏得越多 |
| 区分度极低的列 | 例如只有“是/否”两个值的列，索引筛不出几行，不如全表扫描 |
| 从不在条件、排序、联表里出现的列 | 建了也没人用，白占空间 |

### 10.3 插入与查询 SQL（文件：`~/db-practice/queries.sql`）

插入示例数据：

```sql
INSERT INTO users (username, email, password_hash) VALUES
    ('dawei', 'dawei@example.com', 'HASH-PLACEHOLDER-1'),
    ('xiaomei', 'xiaomei@example.com', 'HASH-PLACEHOLDER-2');

INSERT INTO articles (author_id, title, body, status) VALUES
    (1, '我的第一篇建站笔记', '从买域名到上线，完整走一遍。', 'published'),
    (1, '草稿：还没写完的缓存笔记', '草稿内容。', 'draft'),
    (2, '给新手的索引入门', '索引不是越多越好。', 'published');

INSERT INTO comments (article_id, author_id, body) VALUES
    (1, 2, '写得很清楚，跟着做通了。'),
    (1, 2, '第二步的截图对不上，能补一张吗？'),
    (3, 1, '索引那段讲透了。');
```

查询示例（联表与聚合）：

```sql
SELECT a.title, u.username
FROM articles a
JOIN users u ON u.id = a.author_id
WHERE a.status = 'published'
ORDER BY a.id;

SELECT a.title, COUNT(c.id) AS comment_count
FROM articles a
LEFT JOIN comments c ON c.article_id = a.id
GROUP BY a.id
ORDER BY a.id;
```

第二条查询必须用 `LEFT JOIN` 而不是 `JOIN`：草稿文章没有评论，`JOIN` 会把它整行丢掉，`LEFT JOIN` 才会保留它并把评论数算成 0。第 13 节的输出里草稿文章的评论数确实是 0，这就是证明。

### 10.4 事务示例 SQL

回滚示例：插入一条评论，再回滚，条数不变。

```sql
BEGIN;
INSERT INTO comments (article_id, author_id, body) VALUES (1, 1, '这条会被回滚');
ROLLBACK;
SELECT COUNT(*) FROM comments;
```

提交示例：插入一条评论，再提交，条数加一。

```sql
BEGIN;
INSERT INTO comments (article_id, author_id, body) VALUES (1, 1, '这条提交了');
COMMIT;
SELECT COUNT(*) FROM comments;
```

事务的使用规矩：

1. 一组必须同时成功的操作才放进同一个事务，例如“扣库存并且生成订单”；单条查询不需要手动开事务。
2. 事务里不要放耗时的操作（例如调外部接口、等用户输入）：事务开得越久，锁占得越久，别人等得越久。
3. 出错就回滚，不要抱着“有一半成功也行”的心态提交。

### 10.5 执行计划示例 SQL

```sql
EXPLAIN QUERY PLAN SELECT id, title FROM articles WHERE author_id = 1;
EXPLAIN QUERY PLAN SELECT id, title FROM articles WHERE title LIKE '%入门%';
```

第一条在建索引前后各跑一次，对比结果就是第 13 节的核心证据。第二条的前导通配符 `LIKE '%入门%'` 没法用 B-Tree 索引定位，因为通配符在前面，索引的有序性用不上，只能全表扫描：这是“索引不是万能”的标准例子，不要以为建了索引所有查询都会变快。

### 10.6 方言对照表：SQLite、MySQL、PostgreSQL 的写法差异

下表只对照本篇用到的语法。MySQL 与 PostgreSQL 两列没有在本机跑过，读者要在自己的数据库上验证，不要直接照搬上线。

| 写法 | SQLite（本篇实测） | MySQL 8.4 LTS（对照，未在本机跑） | PostgreSQL（对照，未在本机跑） |
| --- | --- | --- | --- |
| 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGINT PRIMARY KEY AUTO_INCREMENT` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| 当前时间默认值 | `DEFAULT (datetime('now'))` | `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT now()` |
| 查看执行计划 | `EXPLAIN QUERY PLAN SELECT ...` | `EXPLAIN SELECT ...` | `EXPLAIN SELECT ...` |
| 布尔值 | 用 `INTEGER` 存 0 或 1 | `BOOLEAN`（实际是 `TINYINT(1)`） | `BOOLEAN` 原生支持 |
| 字符串类型 | `TEXT` | `VARCHAR(255)` 或 `TEXT` | `TEXT` 或 `VARCHAR(n)` |

还有两条方言规矩要记牢：第一，SQLite 的 `AUTOINCREMENT` 关键字和 MySQL 的 `AUTO_INCREMENT` 拼写不一样，复制粘贴时最容易错的就是这一处；第二，MySQL 的表默认字符集要显式设成 `utf8mb4` 才能存 emoji，PostgreSQL 建库时就要选好编码，事后改编码比事前选对要麻烦得多。

## 11. 完整配置文件

### 11.1 连接池配置文件（文件：`~/db-practice/config/database.yml`）

```yaml
database:
  engine: sqlite
  path: /home/dawei/db-practice/site.db
  foreign_keys: true
pool:
  min_size: 2
  max_size: 10
  acquire_timeout_seconds: 30
  idle_timeout_seconds: 300
  max_lifetime_seconds: 1800
```

注意：`path` 里写的是示例用户名 `dawei` 的家目录，读者要换成自己的实际路径。`engine` 在这里是给应用层读的标记，不是数据库自己的配置项：SQLite 是文件数据库，不需要主机、端口、用户名、口令；换成 MySQL 或 PostgreSQL 时，这一份文件要改成主机、端口、库名、用户名，口令绝不能写进这个文件，见第 12 节和第 17 节。

### 11.2 口令与敏感信息的存放方式（文件：`~/db-practice/.env`，权限 600）

口令只放进 `.env`，并且这个文件只给自己读：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=site
DB_USER=site_app
DB_PASSWORD=请填真实口令
```

`.env` 的权限必须是 600（只有属主能读写），并且绝不能提交进 Git。应用启动时从环境变量读口令，不要把口令写进代码、写进 `database.yml`、写进聊天记录。

## 12. 每个关键配置项的解释

| 配置项 | 含义 | 配错的后果 |
| --- | --- | --- |
| `database.engine` | 用哪种数据库，`sqlite`、`mysql`、`postgres` 三选一 | 写错会导致应用连错数据库或直接启动失败 |
| `database.path` | SQLite 文件的完整路径（只对 SQLite 有效） | 路径写错会建出一个空库，旧数据“凭空消失”其实是连错了文件 |
| `database.foreign_keys` | 是否强制外键检查（SQLite 需要显式开启） | 不开会导致脏数据：评论指向不存在的文章也不会报错 |
| `pool.min_size` | 池里常驻的最小连接数 | 设成 0 会导致每个请求都要现建连接，首个请求变慢 |
| `pool.max_size` | 池里最多同时存在的连接数 | 设得太大，数据库会被并发连接压垮；设得太小，请求会排队超时 |
| `pool.acquire_timeout_seconds` | 从池里借连接最长等多久 | 设得太短，忙时正常请求也会报错；设得太长，故障时用户要等很久才看到错误 |
| `pool.idle_timeout_seconds` | 空闲连接多久没人用就回收 | 设得太短，连接反复建反复关，省不下成本；设得太长，闲置连接占着数据库名额 |
| `pool.max_lifetime_seconds` | 一条连接最长活多久，到期强制换新 | 不设会导致一条连接用到底，数据库端重启或超时断开后池里全是死连接 |

池大小怎么定（经验起点，不是实测结论）：先按“同一时刻真正同时在查库的请求数”估算。单机小站从 `max_size: 10` 起步，观察一段时间再调：经常借不到连接就适当调大，数据库 CPU 或连接数先到瓶颈就调小。不要照搬网上“核数乘几加几”的公式：那是某种数据库在某种负载下的经验，不是本篇的实测结论，读者的机器和负载不同，照搬就是错。

## 13. 执行结果示例

本节全部输出都是本机真实跑出来的，环境是 SQLite 3.45.1，数据库是按第 10 节建的练习库。输出里的中文标题、用户名、评论内容就是第 10.3 节插入的示例数据，不是编造的。

建表与插入后，三张表的内容：

```text
-- 用户表
[(1, 'dawei', 'dawei@example.com'), (2, 'xiaomei', 'xiaomei@example.com')]
-- 文章表
[(1, 1, '我的第一篇建站笔记', 'published'), (2, 1, '草稿：还没写完的缓存笔记', 'draft'), (3, 2, '给新手的索引入门', 'published')]
-- 评论表
[(1, 1, 2, '写得很清楚，跟着做通了。'), (2, 1, 2, '第二步的截图对不上，能补一张吗？'), (3, 3, 1, '索引那段讲透了。')]
```

联表查询（已发布文章与作者名）与聚合查询（每篇文章的评论数）：

```text
-- 联表：文章+作者名
[('我的第一篇建站笔记', 'dawei'), ('给新手的索引入门', 'xiaomei')]
-- 聚合：每篇文章的评论数
[('我的第一篇建站笔记', 2), ('草稿：还没写完的缓存笔记', 0), ('给新手的索引入门', 1)]
```

注意草稿文章的评论数是 0 而不是被丢掉：这正是 `LEFT JOIN` 的作用，`JOIN` 会把这一行直接丢掉。

索引的执行计划对比（本节最关键的证据）：

```text
-- EXPLAIN：建索引前按作者查文章
[(2, 0, 0, 'SCAN articles')]
-- EXPLAIN：建索引后按作者查文章
[(3, 0, 0, 'SEARCH articles USING INDEX idx_articles_author_id (author_id=?)')]
-- EXPLAIN：前导通配符 LIKE 不走索引
[(2, 0, 0, 'SCAN articles')]
```

读法：`SCAN articles` 是全表扫描，`SEARCH articles USING INDEX idx_articles_author_id` 是走了索引。建索引前是 SCAN，建索引后是 SEARCH，前导通配符查询即使建了索引也是 SCAN。三行结果合起来就是第 6.3 节和第 10.5 节的结论：索引能让等值查询变快，但救不了前导通配符查询。

事务的提交与回滚：

```text
-- 回滚前评论数
[(3,)]
-- 回滚后评论数
[(3,)]
-- 提交后评论数
[(4,)]
-- 提交后最后一条评论
[(4, 1, '这条提交了')]
```

读法：回滚前 3 条，回滚后还是 3 条（被回滚的那条没有留下）；提交后变成 4 条，最后一条就是提交的那条。回滚与提交的区别，用条数变化就能看出来，不需要相信任何文字描述。

## 14. 成功验证

读者在自己机器上按下面清单逐项验证，全部通过才算做完：

1. `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` 能输出版本号。
2. 执行第 10.1 节的建表 SQL 不报错，三张表都建出来了。
3. 执行第 10.3 节的插入 SQL 后，三张表的行数分别是用户 2 行、文章 3 行、评论 3 行。
4. 联表查询只返回 2 篇已发布文章，聚合查询里草稿文章的评论数是 0。
5. 建索引前执行计划是 `SCAN articles`，建索引后是 `SEARCH articles USING INDEX idx_articles_author_id`，前导通配符查询是 `SCAN articles`。
6. 回滚后评论数不变，提交后评论数加一。
7. 连接 SQLite 时执行了 `PRAGMA foreign_keys = ON;`，再试着插入一条指向不存在文章的评论，数据库会报错而不是悄悄存进去。

本机验证清单（作者已做）：第 1 至 7 项全部在本机跑通过，输出就是第 13 节贴出来的真实输出；第 7 项的外键强制检查也已实测：在开启 `PRAGMA foreign_keys = ON` 的连接里插入一条指向不存在文章的评论，数据库报 `IntegrityError`，没有悄悄存进去。

## 15. 常见错误

错误写法只写在表格和行内代码里，没有写成带围栏的 SQL 代码块，避免读者复制错。

| 错误 | 后果 | 正确做法 |
| --- | --- | --- |
| 用业务字段当主键，例如用 `username` 当主键 | 用户一改名，所有外键都要跟着改 | 主键用自增 `id`，业务字段加 `UNIQUE` |
| 拼接 SQL 字符串，例如 `"SELECT * FROM users WHERE id = " + user_input` | SQL 注入，攻击者可以改写查询 | 一律用参数化查询，占位符传参 |
| 口令明文存库，例如 `password` 列存 `123456` | 数据库一泄露，所有口令全泄露 | 存 bcrypt 或 Argon2 算好的哈希值 |
| 给每一列都建索引 | 写操作变慢，表结构难维护 | 只给过滤、排序、联表用的列建索引 |
| 聚合查询用 `JOIN` 而不是 `LEFT JOIN` | 没有评论的文章整行消失 | 需要保留左表全部行时用 `LEFT JOIN` |
| 事务里调外部接口或等用户输入 | 锁占得久，别人全被堵住 | 事务里只放数据库操作，越短越好 |
| 拿 SQLite 的执行计划去论证 MySQL 一定快 | 不同数据库的优化器不一样，结论不通用 | 在目标数据库上自己跑 `EXPLAIN` |
| 把口令写进配置文件并提交进 Git | 口令进版本历史，删都删不干净 | 口令只放权限 600 的 `.env`，用环境变量读 |

## 16. 故障排查

| 现象 | 先查什么 | 常见原因 |
| --- | --- | --- |
| 建表报“表已存在” | 是不是重复执行了建表 SQL | 练习时重复跑脚本；解决办法是删掉练习库文件重建，不要在生产库上删表 |
| 插入报唯一约束冲突 | 是不是重复插入了相同的用户名或邮箱 | 注册流程没有先处理“已存在”的分支 |
| 插入报外键约束失败 | 指向的用户或文章存不存在 | 先插子表、后插父表的顺序错了；或 SQLite 没开 `PRAGMA foreign_keys = ON` |
| 查询越来越慢 | 先跑 `EXPLAIN QUERY PLAN` 看是 SCAN 还是 SEARCH | 缺索引，或查询条件写成了前导通配符、函数套列 |
| 连接池报“借不到连接”或超时 | 池是不是满了、有没有连接没还 | 连接借出后没关闭、没还回池里；或 `max_size` 定得太小 |
| 事务提交后数据“丢了” | 连的是不是同一个库文件 | SQLite 的典型坑：路径写错，连到了一个新生成的空库 |
| 中文乱码 | 建库、连接、页面三处的编码是不是一致 | MySQL 要用 `utf8mb4`，不要用 `utf8`（那是阉割版） |

排查的通用顺序：先看报错原文，再看执行计划，再看连接与配置，最后才怀疑数据库本身有问题。九成问题出在前三步。

## 17. 安全注意事项

1. 绝不拼接 SQL：所有带用户输入的查询都用参数化查询，这是防 SQL 注入的唯一可靠办法，转义和过滤都靠不住。
2. 口令绝不明文存储：存慢哈希（bcrypt 或 Argon2），不要存 MD5 或 SHA1 的简单哈希，那两种算得太快，撞库成本低。
3. 数据库账号按最小权限给：应用用的账号只能读写它自己的库，不能建库、不能删库、不能读别的库，更不能用 root 账号连应用。
4. 数据库不要暴露在公网：只监听内网或本机，远程管理走 SSH 隧道或内网通道（见指南 14-ssh 章节）。
5. 口令、密钥、连接串只放权限 600 的 `.env`，绝不进 Git、绝不贴进聊天记录、绝不写进文章示例。
6. 删数据先备份：`DELETE` 和 `DROP` 没有回收站，执行前先确认 `WHERE` 条件，先 `SELECT` 一遍要删的行，再执行删除。

## 18. 回滚和恢复

回滚分三层，不要混为一谈：

1. 事务回滚：还没提交的操作用 `ROLLBACK` 撤销，第 10.4 节演示的就是这一层。
2. 误操作恢复：已经提交的删除或修改，靠备份恢复，事务救不回来。备份与恢复的具体做法在 DB-02，不在本篇展开。
3. 表结构回滚：改表结构前先备份结构（把建表 SQL 存一份），改错了用旧的建表 SQL 重建空表再导数据，不要直接在生产表上反复试。

练习库的回滚最简单：删掉 `~/db-practice/site.db`，重新执行第 10.1 节和第 10.3 节，就回到初始状态。生产库绝不能这么干。

## 19. 延伸阅读

- 本指南 11-databases 章节：MySQL 的安装、安全、调优、备份（与本篇的选型、SQL 形成互补，安装细节以那一章为准）。
- SQLite 官方文档的 `EXPLAIN QUERY PLAN` 与 `PRAGMA foreign_keys` 说明：执行计划的完整输出格式以官方文档为准。
- MySQL 8.4 参考手册的优化章节与 PostgreSQL 文档的 `EXPLAIN` 章节：方言与执行计划的细节以各自官方文档为准，不要以本篇的 SQLite 输出去推断它们。
- 本指南 BE-01 至 BE-05 各篇：各语言里怎么用参数化查询、怎么接连接池，以各框架篇的写法为准。

## 20. 相关章节链接

- 上一篇：[BE-05 Java 框架：Spring Boot、Spring MVC、Quarkus](../backend/05-java.md)。
- 选型总纲：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)。
- 后端框架：[BE-01 PHP 框架：Laravel、Symfony、ThinkPHP](../backend/01-php.md)、[BE-02 Python 框架：Django、Flask、FastAPI](../backend/02-python.md)。
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)。
- 下一篇：[DB-02 备份、恢复、迁移、慢查询、主从复制、高可用](./02-ops.md)。
