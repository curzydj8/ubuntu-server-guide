# BE-05：Java 框架完整教程

> 任务编号：BE-05（网站建设与部署实战指南 · 后端第 5 篇）
> 上一篇：[BE-04 Go 框架：Gin、Echo、Fiber、标准库](./04-go.md)；下一篇：[DB-01 数据库选型、表设计、SQL、索引、事务、连接池](../database/01-design.md)。
> 本篇只讲 Java 后端框架：Spring Boot、Spring MVC、Quarkus。各框架独立小节，最后有一节三框架选型对照。不讲 PHP、Python、Node.js、Go 框架，那是 BE-01 至 BE-04 的范围。不讲数据库选型与表设计本身，那是 DB-01 的范围。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清 Spring Boot 与 Spring MVC 的关系，不再把它们当成两个互斥的框架来选；
2. 用 Spring Boot 从零搭一个带数据库的完整小应用：控制器、服务、仓库、API、错误处理齐全；
3. 用 Spring MVC 的最小配置跑通一个接口，理解它与 Boot 的区别到底在哪里；
4. 用 Quarkus 的最小项目跑通一个接口，理解它“编译期处理”是什么意思；
5. 对着选型对照表，给自己的项目选一个 Java 框架，并把应用部署到 Ubuntu 服务器上。

## 2. 适用人群

本篇适合下面这些人：

- 会写 Java 基础语法，想用 Java 做网站后端的人；
- 听说过 Spring，但分不清 Spring、Spring MVC、Spring Boot 三者关系的人；
- 想了解 Quarkus 这类云原生 Java 框架和传统 Spring 有什么不同的人；
- 读过 ARCH-03 选型决策树，落点是“管理后台”或“高并发 API”，想用 Java 落地的人。

不适合完全没写过 Java 的人：本篇不教 Java 语法本身，变量、类、方法、泛型这些前提默认你已经会。如果 Java 基础还没补，先补 Java 基础再回来。

## 3. 适用系统和版本

- 操作系统：开发机不限（Windows、macOS、Linux 都可以）；部署示例以 Ubuntu 24.04 LTS 为准，systemd 与 Nginx 的路径按 Ubuntu/Debian 系写。
- 数据库示例：PostgreSQL，版本以安装时发行版或官方仓库提供为准，本篇不依赖某个补丁版本的专属写法。
- 版本核实（核查日期 2026-11-03，安装时仍以官网为准）：

| 组件 | 核查到的版本 | 说明 |
| --- | --- | --- |
| Java | 当前 LTS 是 Java 25（2025 年 9 月发布）；Java 21 LTS 也在支持中 | 本篇示例统一用 Java 21，三个框架都支持；Spring Boot 4.x 要求 Java 17 以上，Quarkus 3.40 要求 Java 17 以上 |
| Spring Boot | 4.1.2（2026 年 10 月 22 日发布，4.1 线） | 4.1 线开源支持到 2027 年 7 月；4.0 线开源支持到 2026 年 12 月，新项目不要从 4.0 起步 |
| Spring Framework（含 Spring MVC） | 7.0.10（2026 年 10 月 22 日发布，7.0 线） | Spring MVC 没有独立版本号，它就是 Spring Framework 里的 Web MVC 模块，随 Framework 一起发布；7.0 线开源支持到 2027 年 7 月 |
| Quarkus | 3.40.1.1（3.40 LTS 线，2026 年 10 月 19 日发布） | 3.40 是 LTS 线，支持 12 个月；Quarkus 4.0 在核查时只有 Beta 版，不是正式版，新项目不要用 Beta 起步 |
| Maven | 3.9 以上 | 本篇示例用 Maven，Gradle 用户可对照换算，构建命令不同，代码本身不变 |
| Tomcat（仅 Spring MVC 一节） | 11 | 对应 Jakarta EE 11 与 Servlet 6.1，部署方式是打 war 包丢进 Tomcat |

- 阅读前提：不需要先装任何软件。第 8 节的操作前检查会带你逐项确认。

## 4. 使用前提

开始之前，先确认下面五件事，缺一项就先补齐：

1. 装好 JDK 21：命令行能跑出 `java -version`，并且主版本号是 21。不要用 Java 8 跑本篇的示例，Spring Boot 4 与 Quarkus 3.40 都不支持 Java 8。
2. 装好 Maven：命令行能跑出 `mvn -version`。不装 Maven 也行，但本篇所有构建命令都按 Maven 写，Gradle 用户要自己换算。
3. 有一个能连的 PostgreSQL：本地装一个，或者服务器上有一个，能建库建用户即可。数据库的表设计本身不讲，那是 DB-01 的范围。
4. 会用 curl 发请求：本篇的验证全部用 curl，不依赖 Postman 这类图形工具。
5. 知道“不要把真实口令写进代码”这条红线：本篇所有配置示例里的口令与密钥一律用占位符，运行前换成环境变量，见第 17 节。

## 5. 所需资源

| 资源 | 用途 | 备注 |
| --- | --- | --- |
| JDK 21 | 编译与运行 Java 代码 | 选 Temurin、Corretto、Oracle JDK 等发行版均可，关键是主版本号 21 |
| Maven 3.9 以上 | 依赖管理与构建 | 本篇示例全部用 Maven 命令 |
| PostgreSQL | 示例应用的数据存储 | 本地或服务器上的实例均可 |
| curl | 验证 API | 第 14 节全部用 curl |
| 编辑器或 IDE | 写代码 | 记事本级别的编辑器也能写，但 IDE 的补全与报错提示会省很多时间 |
| 一台 Ubuntu 24.04 服务器 | 第 11 节部署用 | 没有服务器也可以先在本地跑通，部署步骤留到有服务器时再做 |

常用组件对照（每个框架“开箱带什么”，选型时先看这张表）：

| 能力 | Spring Boot | Spring MVC（单独用） | Quarkus |
| --- | --- | --- | --- |
| 内嵌服务器 | 自带 Tomcat，开箱即用 | 不带，要自己准备 Tomcat | 自带 Vert.x/Undertow，开箱即用 |
| 依赖管理 | Starter 一键拉一整套 | 要自己一个个加依赖 | Extension 一键拉一整套 |
| 配置方式 | application.properties/yml + 自动配置 | Java 配置类或 XML，二选一 | application.properties + 构建期配置 |
| 数据库访问 | Spring Data JPA（Hibernate） | 自己配 DataSource 与 JPA | Hibernate ORM with Panache |
| 模板页面 | Thymeleaf（需加 Starter） | JSP 或 Thymeleaf | Qute |
| 原生编译 | 不主推 | 不主推 | GraalVM 原生镜像是主打能力之一 |

## 6. 技术原理

### 6.1 Java 后端程序到底在跑什么

Java 代码先被编译成字节码，再由 JVM（Java 虚拟机）运行。网站后端程序的本质是一个长期运行的进程：它监听一个端口（示例里是 8080），收到 HTTP 请求后，交给框架分发到对应的方法，方法处理完再把结果写回响应。这个“监听、分发、处理、回写”的循环，就是本篇三个框架共同的底座，区别只在循环的每一环由谁来做、做到什么程度。

### 6.2 IoC 与依赖注入：三个框架共用的核心思想

IoC（控制反转）的意思是：对象不自己 new 依赖，而是由框架把依赖“注入”进来。写代码时你只声明“我需要一个 ArticleRepository”，框架在启动时负责把它造出来并传进来。好处是两点：第一，换实现不用改调用方；第二，测试时可以注入假的实现。Spring 用注解标记（`@Service`、`@Repository`、`@RestController`），Quarkus 用 CDI 注解（`@ApplicationScoped`、`@Inject`），名字不同，思想相同。

### 6.3 Spring Boot 的原理：约定加自动配置

Spring Boot 的核心是两条：第一，Starter 约定，`spring-boot-starter-web` 这一个依赖就把 Web、JSON、Tomcat 一整套拉进来，不用你一个个找版本号；第二，自动配置，框架在启动时看你的类路径里有什么，就自动配好什么——有 JPA 就配数据源，有 Web 就配 DispatcherServlet。自动配置不是魔法，它是一堆带条件的配置类，你随时可以用自己的配置覆盖它。

### 6.4 Spring MVC 的原理：DispatcherServlet 分发

Spring MVC 的核心是一个前端控制器 DispatcherServlet：所有请求先进它，它再按 URL 与方法匹配到对应的控制器方法，方法返回后，它负责把结果转成响应。单独用 Spring MVC 时，这个 DispatcherServlet 要你自己注册（见第 10 节的初始化类），服务器也要你自己准备。理解了这一点，就理解了 Boot 与 MVC 的关系，见第 7.2 节。

### 6.5 Quarkus 的原理：把工作挪到构建期

传统框架把很多事留到启动时做：扫描注解、生成代理、配依赖。Quarkus 把尽可能多的工作挪到构建期（编译打包时）做完，启动时只剩很少的事要做。结果是启动快、内存占用低，适合容器与 Serverless 场景。代价是构建时间变长，并且有些运行期动态特性（如运行期才确定的反射）要提前声明。Quarkus 也支持传统 JVM 模式，不用原生镜像也能跑，构建期处理的好处在 JVM 模式下同样存在，只是没有原生模式那么极致。

## 7. 架构说明

### 7.1 分层：三个框架通用的写法

本篇示例统一用三层，层与层之间只许单向依赖：

| 层 | 放什么 | 依赖谁 |
| --- | --- | --- |
| 控制器层（Controller/Resource） | 接收请求、校验入参、调用服务、返回响应 | 服务层 |
| 服务层（Service） | 业务逻辑、事务边界 | 仓库层 |
| 仓库层（Repository） | 只做数据读写，不写业务逻辑 | 数据库 |

控制器里不要直接写 SQL，不要直接操作数据库；服务层不要拼 HTTP 响应；仓库层不要做业务判断。违反这条，代码一长就没法维护，这是三个框架通用的规矩，不是某个框架的特殊要求。

### 7.2 Spring Boot 与 Spring MVC 的关系：先讲清，再选

这是本篇最容易混淆的一点，一句话讲清：**Spring Boot 不是 Spring MVC 的替代品，Boot 是基于 Spring MVC（以及整个 Spring 生态）的快速启动封装。**

- Spring Framework 是底座，里面有核心容器、Web MVC、数据访问、事务等模块。
- Spring MVC 是底座里的 Web 模块，负责请求分发与控制器模型。
- Spring Boot 是底座外面的一层封装，负责三件事：Starter 依赖打包、自动配置、内嵌服务器。你用 Boot 写控制器时，写的仍然是 Spring MVC 的注解（`@RestController`、`@GetMapping`），跑起来的分发器仍然是 DispatcherServlet。

所以选型问题从来不是“Boot 还是 MVC”，而是“要不要 Boot 的封装”：要快速起步、少写配置，选 Boot；要完全掌控每一个配置、或者必须部署到已有的外部 Tomcat 且不想要内嵌服务器，单独用 MVC。单独用 MVC 不等于“更底层更高级”，它只是把 Boot 帮你做的事重新手工做一遍。

### 7.3 Quarkus 的架构位置

Quarkus 的定位是“为容器与云原生优化的 Java 栈”：底层用 Vert.x 做事件循环与网络，用 Hibernate ORM 做数据访问，用 RESTEasy 做 REST 接口，用 CDI 做依赖注入。它与 Spring 的最大区别不在“能不能写 CRUD”，而在构建模型：Spring 是运行期扫描与代理为主，Quarkus 是构建期处理为主。选 Quarkus 的典型理由是启动速度与内存占用敏感（容器频繁启停、Serverless），而不是“Quarkus 的 CRUD 写起来更短”。

### 7.4 三框架选型对照

| 维度 | Spring Boot | Spring MVC（单独用） | Quarkus |
| --- | --- | --- | --- |
| 上手速度 | 快，Starter 与自动配置 | 慢，配置要手工写 | 中等，概念与 Spring 有差异 |
| 生态与资料 | 最大，中文资料最多 | 与 Boot 共享生态，但单独用的新资料少 |  growing，官方文档为主，中文资料相对少 |
| 启动速度与内存 | 中等 | 中等 | 快、低（构建期处理；原生镜像更进一步） |
| 部署形态 | 可执行 jar，内嵌 Tomcat | war 包，外部 Tomcat | 可执行 jar 或原生二进制 |
| 适合场景 | 绝大多数 Java 后端项目 | 已有 Tomcat 基础设施、要求完全手工配置 | 容器、Serverless、启动敏感场景 |
| 不适合场景 | 对启动速度与内存极度敏感 | 想快速起步的新项目 | 团队只熟悉 Spring 且不愿学新模型 |
| 团队要求 | 会 Spring 注解即可 | 要理解 Servlet 与 Spring 配置细节 | 要理解 CDI 与构建期模型 |

对照表的档位是定性判断（快、中、慢），不是实测数字。启动速度与内存的具体数值随应用大小、JVM 参数、部署环境变化很大，本篇不写没有来源的具体数字，读者按第 14 节在自己的机器上测。

## 8. 操作前检查

动手之前，在开发机上逐项跑一遍，缺一项就先装好：

```bash
java -version
mvn -version
curl --version
```

三条命令都应有输出，并且 `java -version` 的主版本号是 21。`mvn -version` 的输出里会同时显示它用的 Java 版本，两处 Java 版本应当一致，避免出现“命令行 java 是 21、Maven 用的却是 17”这类错位。

再确认三件事：8080 端口没有被别的程序占用；PostgreSQL 能连上，并且你有建库的权限；示例用的库名与用户名（`blogdb`、`bloguser`）还没有被别的项目占用，占用了就换个名字，全篇统一换掉即可。

## 9. 逐步操作

### 9.1 Spring Boot：创建第一个项目

1. 打开 Spring Initializr（start.spring.io），按下面选：Project 选 Maven，Language 选 Java，Spring Boot 选 4.1.x（不要选带 SNAPSHOT、M、RC 后缀的版本），Packaging 选 Jar，Java 选 21。
2. Dependencies 至少勾这五个：Spring Web、Spring Data JPA、Validation、Spring Boot Actuator、PostgreSQL Driver。测试依赖 Spring Boot Starter Test 默认会带上。
3. 点 Generate，下载压缩包，解压到工作目录，例如 `~/projects/blog-boot/`。
4. 在 PostgreSQL 里建库建用户，见第 10 节前的准备命令。
5. 把第 10 节的代码按文件路径放好，配好 `application.properties` 里的数据库连接信息（口令用环境变量，不要写真实口令）。
6. 在项目根目录跑 `mvn spring-boot:run`，看到启动日志里出现 Tomcat started on port 8080，就算跑起来了。

Spring Boot 项目的目录结构（第 10 节代码按这个结构放）：

```text
blog-boot/
├── pom.xml
└── src/main/
    ├── java/com/example/blog/
    │   ├── BlogApplication.java
    │   ├── controller/ArticleController.java
    │   ├── service/ArticleService.java
    │   ├── repository/ArticleRepository.java
    │   ├── model/Article.java
    │   └── exception/
    │       ├── ArticleNotFoundException.java
    │       └── GlobalExceptionHandler.java
    └── resources/application.properties
```

### 9.2 Spring MVC（单独用）：创建最小项目

1. 不用 Initializr，手工建一个 Maven 项目，目录结构见第 10 节的 MVC 一节。
2. `pom.xml` 里用 Spring Framework 的 BOM 统一版本（7.0.10），依赖只加 `spring-webmvc` 与 `jakarta.servlet-api`（provided  scope，由 Tomcat 提供）。
3. 写三个类：配置类（开 `@EnableWebMvc` 与包扫描）、初始化类（注册 DispatcherServlet）、控制器。
4. 打 war 包：`mvn package`，把 `target` 下的 war 文件放进 Tomcat 11 的 `webapps` 目录，启动 Tomcat。
5. 访问控制器地址验证。注意：单独用 MVC 时没有内嵌服务器，Tomcat 必须你自己装好并启动，这是它与 Boot 最大的操作区别。

### 9.3 Quarkus：创建最小项目

1. 装 Quarkus CLI，或者直接用 Maven 命令创建，二选一。CLI 命令是 `quarkus create app com.example:blog-quarkus`，Maven 命令见第 10 节的 Quarkus 一节。
2. 创建时选的扩展至少包括：REST（`quarkus-rest`）、REST Jackson（`quarkus-rest-jackson`）、Hibernate ORM Panache（`quarkus-hibernate-orm-panache`）、PostgreSQL 驱动（`quarkus-jdbc-postgresql`）。
3. 目录结构与 Maven 项目一致，代码放在 `src/main/java/` 下，配置放在 `src/main/resources/application.properties`。
4. 开发模式跑 `mvn quarkus:dev`，改代码不用重启，保存即生效，这是 Quarkus 开发模式的主打体验。
5. 打包跑 `mvn package`，产物在 `target/quarkus-app/` 下，用 `java -jar target/quarkus-app/quarkus-run.jar` 启动。

### 9.4 三个框架的“第一个项目”有什么不一样

Spring Boot 的第一个项目是“生成器 + Starter + 自动配置”，写完代码就能跑；Spring MVC 的第一个项目是“手工 pom + 手工配置 + 外部 Tomcat”，跑起来之前要先把基础设施搭好；Quarkus 的第一个项目是“CLI + 扩展 + 开发模式”，写代码时的反馈最快。三个“第一个项目”跑通后，控制器里写的业务代码长得很像，区别主要在启动与配置方式，不在业务写法。

## 10. 完整代码

### 10.1 准备：建库建用户（三个框架共用）

在 PostgreSQL 所在的机器上跑下面这条命令进入 psql：

```bash
sudo -u postgres psql
```

进入 psql 后依次执行（口令不要写在命令里，用交互命令设置）：

```text
CREATE DATABASE blogdb;
CREATE USER bloguser WITH LOGIN;
GRANT ALL PRIVILEGES ON DATABASE blogdb TO bloguser;
\password bloguser
\q
```

`\password` 会交互提示你输入两次口令，口令不回显、不进命令历史。记好这个口令，后面跑应用时要通过环境变量 `DB_PASSWORD` 传给应用，不要写进任何配置文件。

### 10.2 Spring Boot 完整小应用：文章 API

下面是一个完整应用，功能是文章的增删改查。文件路径全部写清，照着放就能对上号。应用名 `blog-boot`，包名 `com.example.blog`。

文件一：`blog-boot/pom.xml`（Maven 配置，版本来自第 3 节的核查结果）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>4.1.2</version>
        <relativePath />
    </parent>
    <groupId>com.example</groupId>
    <artifactId>blog-boot</artifactId>
    <version>0.1.0</version>
    <properties>
        <java.version>21</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

文件二：`blog-boot/src/main/resources/application.properties`（口令只写占位符，运行时从环境变量取）。

```properties
server.port=8080
spring.datasource.url=jdbc:postgresql://localhost:5432/blogdb
spring.datasource.username=bloguser
spring.datasource.password=${DB_PASSWORD}
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=false
spring.jpa.properties.hibernate.format_sql=false
management.endpoints.web.exposure.include=health
```

文件三：`blog-boot/src/main/java/com/example/blog/model/Article.java`（实体类，表名 articles）。

```java
package com.example.blog.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

@Entity
@Table(name = "articles")
public class Article {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    @Size(max = 200)
    @Column(nullable = false, length = 200)
    private String title;

    @NotBlank
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Size(max = 100)
    @Column(length = 100)
    private String author;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getAuthor() {
        return author;
    }

    public void setAuthor(String author) {
        this.author = author;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
```

文件四：`blog-boot/src/main/java/com/example/blog/repository/ArticleRepository.java`（仓库层，只做读写）。

```java
package com.example.blog.repository;

import com.example.blog.model.Article;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArticleRepository extends JpaRepository<Article, Long> {
}
```

文件五：`blog-boot/src/main/java/com/example/blog/service/ArticleService.java`（服务层，事务边界在这里）。

```java
package com.example.blog.service;

import com.example.blog.exception.ArticleNotFoundException;
import com.example.blog.model.Article;
import com.example.blog.repository.ArticleRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ArticleService {
    private final ArticleRepository repository;

    public ArticleService(ArticleRepository repository) {
        this.repository = repository;
    }

    public List<Article> list() {
        return repository.findAll();
    }

    public Article get(Long id) {
        return repository.findById(id).orElseThrow(() -> new ArticleNotFoundException(id));
    }

    @Transactional
    public Article create(Article article) {
        return repository.save(article);
    }

    @Transactional
    public Article update(Long id, Article input) {
        Article article = get(id);
        article.setTitle(input.getTitle());
        article.setContent(input.getContent());
        article.setAuthor(input.getAuthor());
        return repository.save(article);
    }

    @Transactional
    public void delete(Long id) {
        Article article = get(id);
        repository.delete(article);
    }
}
```

文件六：`blog-boot/src/main/java/com/example/blog/controller/ArticleController.java`（控制器层，只做请求与响应）。

```java
package com.example.blog.controller;

import com.example.blog.model.Article;
import com.example.blog.service.ArticleService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/articles")
public class ArticleController {
    private final ArticleService service;

    public ArticleController(ArticleService service) {
        this.service = service;
    }

    @GetMapping
    public List<Article> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public Article get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Article create(@Valid @RequestBody Article article) {
        return service.create(article);
    }

    @PutMapping("/{id}")
    public Article update(@PathVariable Long id, @Valid @RequestBody Article input) {
        return service.update(id, input);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
```

文件七：`blog-boot/src/main/java/com/example/blog/exception/ArticleNotFoundException.java`（业务异常）。

```java
package com.example.blog.exception;

public class ArticleNotFoundException extends RuntimeException {
    public ArticleNotFoundException(Long id) {
        super("Article not found: " + id);
    }
}
```

文件八：`blog-boot/src/main/java/com/example/blog/exception/GlobalExceptionHandler.java`（统一错误响应，见第 12 节的说明）。

```java
package com.example.blog.exception;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ArticleNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, String> handleNotFound(ArticleNotFoundException ex) {
        return Map.of("error", ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleValidation(MethodArgumentNotValidException ex) {
        return Map.of("error", "Request validation failed");
    }
}
```

文件九：`blog-boot/src/main/java/com/example/blog/BlogApplication.java`（启动类）。

```java
package com.example.blog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BlogApplication {
    public static void main(String[] args) {
        SpringApplication.run(BlogApplication.class, args);
    }
}
```

启动命令（在 `blog-boot` 目录下，口令从环境变量传入，不要写进命令历史之外的任何文件）：

```bash
DB_PASSWORD=你的数据库口令 mvn spring-boot:run
```

注意：上面命令里的“你的数据库口令”是占位写法，实际运行时换成你在 10.1 节用交互命令设好的那个口令。更稳妥的做法是先在 shell 里 `export DB_PASSWORD=...` 再跑命令，或者用 systemd 的 EnvironmentFile，见第 11 节。

### 10.3 Spring MVC 最小项目：同一个接口，手工配置版

下面是单独用 Spring MVC 跑通一个接口的最小代码，目的是让你亲手摸到 Boot 帮你省掉的部分。包名 `com.example.mvc`。

文件一：`blog-mvc/pom.xml`（BOM 统一版本，Servlet API 由 Tomcat 提供，所以是 provided 作用域）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>blog-mvc</artifactId>
    <version>0.1.0</version>
    <packaging>war</packaging>
    <properties>
        <java.version>21</java.version>
        <maven.compiler.release>21</maven.compiler.release>
    </properties>
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework</groupId>
                <artifactId>spring-framework-bom</artifactId>
                <version>7.0.10</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-webmvc</artifactId>
        </dependency>
        <dependency>
            <groupId>jakarta.servlet</groupId>
            <artifactId>jakarta.servlet-api</artifactId>
            <version>6.1.0</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-war-plugin</artifactId>
                <version>3.4.0</version>
                <configuration>
                    <failOnMissingWebXml>false</failOnMissingWebXml>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

文件二：`blog-mvc/src/main/java/com/example/mvc/config/WebConfig.java`（Java 配置类，代替 web.xml 的一部分）。

```java
package com.example.mvc.config;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@Configuration
@EnableWebMvc
@ComponentScan("com.example.mvc.controller")
public class WebConfig {
}
```

文件三：`blog-mvc/src/main/java/com/example/mvc/config/WebAppInitializer.java`（注册 DispatcherServlet，Servlet 3.0 以上不需要 web.xml 也能注册）。

```java
package com.example.mvc.config;

import org.springframework.web.servlet.support.AbstractAnnotationConfigDispatcherServletInitializer;

public class WebAppInitializer extends AbstractAnnotationConfigDispatcherServletInitializer {
    @Override
    protected Class<?>[] getRootConfigClasses() {
        return null;
    }

    @Override
    protected Class<?>[] getServletConfigClasses() {
        return new Class<?>[] { WebConfig.class };
    }

    @Override
    protected String[] getServletMappings() {
        return new String[] { "/" };
    }
}
```

文件四：`blog-mvc/src/main/java/com/example/mvc/controller/HelloController.java`（一个最小接口）。

```java
package com.example.mvc.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {
    @GetMapping("/api/hello")
    public Map<String, String> hello() {
        return Map.of("message", "Hello from Spring MVC");
    }
}
```

打包与部署：

```bash
mvn package
cp target/blog-mvc-0.1.0.war /var/lib/tomcat11/webapps/blog-mvc.war
```

Tomcat 的 webapps 路径以你装的 Tomcat 版本与发行版为准，上面写的是 Ubuntu 上 Tomcat 11 的常见路径，实际路径以本机为准。启动 Tomcat 后访问 `http://服务器地址:8080/blog-mvc/api/hello`，注意 URL 里多了 war 包名这一级上下文路径，这是外部 Tomcat 部署与 Boot 内嵌部署的一个可见区别。

页面编写补充：Spring MVC 也可以渲染页面，常见搭配是 Thymeleaf。下面是一个文章列表模板的片段，文件路径是 `src/main/webapp/WEB-INF/templates/articles.html`，使用它还需要另加 Thymeleaf 依赖与视图解析器配置，本篇不展开，只让你认出模板长什么样：

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org" lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>文章列表</title>
</head>
<body>
<h1>文章列表</h1>
<ul>
<li th:each="article : ${articles}" th:text="${article.title}">示例标题</li>
</ul>
</body>
</html>
```

### 10.4 Quarkus 最小项目：同一个接口，云原生版

下面是 Quarkus 的最小项目，同样是文章接口，但写法换成了 Quarkus 的模型：实体继承 PanacheEntity，接口用 Jakarta REST 注解。包名 `com.example.quarkus`。

创建命令（用 Maven 插件创建，不用先装 CLI）：

```bash
mvn io.quarkus.platform:quarkus-maven-plugin:3.40.1.1:create -DprojectGroupId=com.example -DprojectArtifactId=blog-quarkus -Dextensions="quarkus-rest,quarkus-rest-jackson,quarkus-hibernate-orm-panache,quarkus-jdbc-postgresql"
```

文件一：`blog-quarkus/pom.xml`（BOM 是 Quarkus 自己的平台 BOM，与 Spring 的 BOM 不是同一个）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>blog-quarkus</artifactId>
    <version>0.1.0</version>
    <properties>
        <quarkus.platform.version>3.40.1.1</quarkus.platform.version>
        <maven.compiler.release>21</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>io.quarkus.platform</groupId>
                <artifactId>quarkus-bom</artifactId>
                <version>${quarkus.platform.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>io.quarkus</groupId>
            <artifactId>quarkus-rest</artifactId>
        </dependency>
        <dependency>
            <groupId>io.quarkus</groupId>
            <artifactId>quarkus-rest-jackson</artifactId>
        </dependency>
        <dependency>
            <groupId>io.quarkus</groupId>
            <artifactId>quarkus-hibernate-orm-panache</artifactId>
        </dependency>
        <dependency>
            <groupId>io.quarkus</groupId>
            <artifactId>quarkus-jdbc-postgresql</artifactId>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>io.quarkus.platform</groupId>
                <artifactId>quarkus-maven-plugin</artifactId>
                <version>${quarkus.platform.version}</version>
                <extensions>true</extensions>
                <executions>
                    <execution>
                        <goals>
                            <goal>build</goal>
                            <goal>generate-code</goal>
                            <goal>generate-code-tests</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

文件二：`blog-quarkus/src/main/java/com/example/quarkus/model/Article.java`（Panache 实体，id 字段由父类提供，字段直接写 public，这是 Panache 的约定写法）。

```java
package com.example.quarkus.model;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Entity
@Table(name = "articles")
public class Article extends PanacheEntity {
    @NotBlank
    @Size(max = 200)
    @Column(nullable = false, length = 200)
    public String title;

    @NotBlank
    @Column(nullable = false, columnDefinition = "TEXT")
    public String content;

    @Size(max = 100)
    @Column(length = 100)
    public String author;
}
```

文件三：`blog-quarkus/src/main/java/com/example/quarkus/resource/ArticleResource.java`（接口层，Quarkus 里叫 Resource，对应 Spring 的 Controller）。

```java
package com.example.quarkus.resource;

import com.example.quarkus.model.Article;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.List;

@Path("/api/articles")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ArticleResource {
    @GET
    public List<Article> list() {
        return Article.listAll();
    }

    @GET
    @Path("/{id}")
    public Article get(@PathParam("id") Long id) {
        Article article = Article.findById(id);
        if (article == null) {
            throw new NotFoundException("Article not found: " + id);
        }
        return article;
    }

    @POST
    @Transactional
    public Response create(Article input) {
        input.persist();
        return Response.created(URI.create("/api/articles/" + input.id)).entity(input).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Article update(@PathParam("id") Long id, Article input) {
        Article article = Article.findById(id);
        if (article == null) {
            throw new NotFoundException("Article not found: " + id);
        }
        article.title = input.title;
        article.content = input.content;
        article.author = input.author;
        return article;
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public Response delete(@PathParam("id") Long id) {
        Article article = Article.findById(id);
        if (article == null) {
            throw new NotFoundException("Article not found: " + id);
        }
        article.delete();
        return Response.noContent().build();
    }
}
```

文件四：`blog-quarkus/src/main/resources/application.properties`（Quarkus 的配置键名与 Spring 不同，不要照搬 Spring 的键名）。

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.username=bloguser
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/blogdb
quarkus.hibernate-orm.database.generation=update
```

开发模式启动（在 `blog-quarkus` 目录下，改代码保存即生效，不用重启）：

```bash
DB_PASSWORD=你的数据库口令 mvn quarkus:dev
```

打包与启动（JVM 模式，不用原生镜像也能跑）：

```bash
mvn package
java -jar target/quarkus-app/quarkus-run.jar
```

原生镜像是另外一条路，需要装 GraalVM 并加 `-Pnative` 打包，构建时间长、产物是独立二进制。本篇不展开原生镜像的构建步骤，只说明它存在、适合什么场景，见第 7.3 节与第 17 节。

## 11. 完整配置文件

下面三份配置构成 Spring Boot 应用在 Ubuntu 上的完整部署形态：应用配置、systemd 服务、Nginx 反向代理。路径全部写清，改之前先备份原文件。

文件一：`blog-boot/src/main/resources/application.yml`（与 10.2 节的 properties 二选一，不要两个同时留着，避免配置打架；这里用 yml 重写一遍，方便对照两种写法）。

```yaml
server:
  port: 8080
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/blogdb
    username: bloguser
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: false
    properties:
      hibernate:
        format_sql: false
management:
  endpoints:
    web:
      exposure:
        include: health
```

文件二：`/etc/systemd/system/blog.service`（systemd 服务文件，应用以普通用户 blogapp 运行，不要用 root 跑应用）。

```text
[Unit]
Description=Blog Spring Boot Application
After=network.target postgresql.service
Wants=postgresql.service

[Service]
User=blogapp
Group=blogapp
WorkingDirectory=/opt/blog
EnvironmentFile=/etc/blog/blog.env
ExecStart=/usr/bin/java -jar /opt/blog/blog-boot-0.1.0.jar
Restart=on-failure
RestartSec=5
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
```

文件三：`/etc/blog/blog.env`（环境变量文件，只放占位说明，部署时由管理员填入真实口令，文件权限必须是 600，不要提交到代码仓库）。

```text
DB_PASSWORD=部署时填入的数据库口令
```

文件四：`/etc/nginx/sites-available/blog.conf`（Nginx 反向代理，HTTPS 部分见指南的 HTTPS 章节，这里先写 HTTP 形态，证书配好后再补 443 段）。

```nginx
server {
    listen 80;
    server_name example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

部署步骤（在 Ubuntu 服务器上，按顺序做）：

```bash
sudo useradd -r -m -d /opt/blog blogapp
sudo mkdir -p /opt/blog /etc/blog
sudo cp blog-boot-0.1.0.jar /opt/blog/blog-boot-0.1.0.jar
sudo chown -R blogapp:blogapp /opt/blog
sudo chmod 600 /etc/blog/blog.env
sudo ln -s /etc/nginx/sites-available/blog.conf /etc/nginx/sites-enabled/blog.conf
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now blog
```

注意：上面命令里的 jar 文件名以你打包出来的实际文件名为准；`blog-boot-0.1.0.jar` 是按 10.2 节 pom 里的 artifactId 与 version 推导出来的名字，打包后先用 `ls target/` 确认。

## 12. 每个关键配置项的解释

| 配置项 | 含义 | 改错了会怎样 |
| --- | --- | --- |
| server.port | 应用监听的端口 | 与别的程序冲突会启动失败；Nginx 的 proxy_pass 必须与它一致 |
| spring.datasource.url | 数据库地址、端口、库名 | 库名写错会连不上或连到错的库 |
| spring.datasource.username | 数据库用户名 | 用户不存在或权限不足会认证失败 |
| spring.datasource.password | 数据库口令，占位符表示从环境变量取 | 环境变量没设，应用启动时就会报错退出，这是好事，比用默认口令跑起来安全 |
| spring.jpa.hibernate.ddl-auto=update | 启动时按实体自动更新表结构 | 学习阶段方便，生产环境不要用它，见第 17 节；生产用 validate 加迁移工具 |
| management.endpoints.web.exposure.include=health | 只暴露健康检查端点 | 暴露太多端点等于把内部信息公开，生产环境只开 health |
| systemd 的 User/Group | 应用以哪个系统用户运行 | 用 root 跑应用，应用被攻破就等于拿到 root |
| systemd 的 EnvironmentFile | 口令从哪个文件读 | 文件权限不是 600，任何本地用户都能读到口令 |
| systemd 的 Restart=on-failure | 崩溃后自动重启 | 不设的话，应用半夜崩了要等人工发现 |
| Nginx 的 proxy_pass | 转发给谁 | 端口与应用不一致会报 502 |
| Nginx 的 X-Forwarded-For / X-Forwarded-Proto | 把真实访客 IP 与协议传给应用 | 不传的话，应用日志里全是 127.0.0.1，拿不到真实 IP |
| Nginx 的 client_max_body_size | 允许的请求体上限 | 上传大内容时不设会报 413 |
| Quarkus 的 quarkus.datasource.db-kind | 数据库类型 | 类型与驱动对不上会启动失败 |
| Quarkus 的 quarkus.hibernate-orm.database.generation | 表结构生成策略 | 与 Spring 的 ddl-auto 同理，生产不要用 update |

## 13. 执行结果示例

下面是读者在自己机器上构建运行后应看到的输出，不是本机跑出来的结果（本机没有构建运行，见第 14 节的说明）。先新建一篇文章：

```bash
curl -s -X POST http://localhost:8080/api/articles -H "Content-Type: application/json" -d '{"title":"第一篇","content":"你好，世界。","author":"dawei"}'
```

应返回 201 与新建的文章（id 由数据库生成，示例里的 1 只是示意，实际值以你库里的为准）：

```json
{"id":1,"title":"第一篇","content":"你好，世界。","author":"dawei","createdAt":"2026-11-03T15:30:00"}
```

再查列表：

```bash
curl -s http://localhost:8080/api/articles
```

应返回 200 与数组，里面包含上面那篇文章。查一个不存在的 id：

```bash
curl -s http://localhost:8080/api/articles/9999
```

应返回 404 与统一的错误体：

```json
{"error":"Article not found: 9999"}
```

发一个标题为空的请求，应返回 400 与统一的错误体：

```json
{"error":"Request validation failed"}
```

健康检查：

```bash
curl -s http://localhost:8080/actuator/health
```

应返回 200 与 `{"status":"UP"}`。如果健康检查返回 DOWN，先看数据库连通性，见第 16 节。

## 14. 成功验证

按下面清单逐项验证，全部通过才算跑通。注意：本篇作者在本机没有跑 Maven 构建（原因见本节末尾的如实说明），所以这份清单是给读者的验证步骤，不是作者已经跑通过的记录。

1. 启动日志里出现 Tomcat started on port 8080（Boot）或 Quarkus started（Quarkus），没有异常堆栈。
2. `curl http://localhost:8080/actuator/health` 返回 `{"status":"UP"}`（Boot，Quarkus 的健康检查在 `/q/health`，需要加健康扩展才有，不要把两个地址混用）。
3. POST 新建文章返回 201，GET 列表里能看到它，PUT 能改它，DELETE 后再 GET 返回 404。
4. 标题为空的 POST 返回 400，说明校验生效，不是数据库报错。
5. 数据库里直接查表，确认数据真的落库了，不是只存在内存里。
6. 部署到服务器后，从外网经 Nginx 访问域名能拿到同样的结果，并且应用日志里记录的是真实访客 IP，不是 127.0.0.1。
7. 停掉应用再用 systemd 启动一次，确认 `systemctl status blog` 是 active，并且重启后数据还在。

如实说明：本机验证环境里虽然有 JDK 21 与 Maven，但没有预先下载好的 Spring 与 Quarkus 依赖包，框架代码无法在本机直接编译验证；所以本篇没有声称“构建通过”。验证方法是代码块大括号平衡、XML 与 YAML 解析、结构核对，见第 5 节的汇报。读者在自己机器上跑 `mvn package` 时，Maven 会从中央仓库下载依赖，第一次构建需要联网并等待一段时间，这是正常的。

## 15. 常见错误

| 现象 | 常见原因 | 解决办法 |
| --- | --- | --- |
| 端口被占用，启动失败 | 8080 已被别的程序占用 | 换端口，或者停掉占用程序，不要两个应用抢一个端口 |
| 数据库连接被拒绝 | PostgreSQL 没启动、地址写错、用户不存在 | 先确认 PostgreSQL 在跑，再用 psql 手动连一次，确认库名与用户名无误 |
| 启动时报数据源配置错误 | 环境变量 DB_PASSWORD 没设 | 设好环境变量再启动，不要为了跑起来而把真实口令写进配置文件 |
| 404 | URL 写错、控制器没被扫描到、上下文路径多了一级 | 对照第 10 节的路径逐段核对；外部 Tomcat 部署时 URL 里有 war 包名那一级 |
| 405 Method Not Allowed | 路径对了，方法错了，例如对只支持 GET 的地址发 POST | 检查注解是 GetMapping 还是 PostMapping，与请求方法对上 |
| 400 | 入参校验失败，例如标题为空 | 看返回的错误体，补齐必填字段，不要猜 |
| 500 空指针 | 查不存在的记录后直接用了返回值 | 用本篇的异常处理模式：查不到就抛业务异常，由统一处理器转成 404 |
| LazyInitializationException | 在事务之外访问了懒加载的关联 | 把访问放进事务里，或者改成查询时直接取出来，不要在控制器里碰懒加载属性 |
| 部署后 502 | Nginx 的 proxy_pass 端口与应用端口不一致，或应用没启动 | 先确认应用在跑且端口一致，再看 Nginx 错误日志 |
| 部署后日志全是 127.0.0.1 | 没配 X-Forwarded-For | 按第 11 节补齐代理头配置 |
| Quarkus 开发模式端口冲突 | 8080 已被占用 | 换端口或停掉占用程序；开发模式的端口与 JVM 模式一致，不要记成两个端口 |

反面例子只写在这里的表格与行内代码里：例如控制器里直接写 SQL、把真实口令写进 `application.properties`、生产环境用 `ddl-auto=update`，这些都是错误做法，不要把它们写成能直接复制的完整代码块。

## 16. 故障排查

按下面顺序查，不要跳步：

1. 看应用日志：本地看启动日志，服务器上看 `sudo journalctl -u blog -n 100 --no-pager`，先找到第一条异常堆栈，而不是最后一条。
2. 看端口：`ss -tlnp | grep 8080`，确认应用真的在监听，并且监听的端口与 Nginx 配的一致。
3. 看数据库：用 psql 手动连一次，确认库、用户、口令都没问题，再回头查应用配置。
4. 看配置：确认 `application.properties` 与 `application.yml` 没有同时存在并打架；确认环境变量真的传进了进程（systemd 看 EnvironmentFile，命令行看 export）。
5. 看 Nginx：`sudo nginx -t` 测配置，`sudo tail -n 50 /var/log/nginx/error.log` 看转发错误。
6. 看依赖：如果构建时报依赖下载失败，先确认网络能到 Maven 中央仓库，再看是不是版本号写错（例如把 4.1.2 写成不存在的版本）。
7. 看版本：如果报错提到“不支持的类文件版本”或类似表述，基本是 Java 版本不对，回到第 8 节重新确认 `java -version` 与 `mvn -version` 里的 Java 版本一致且是 21。

## 17. 安全注意事项

1. 口令与密钥只走环境变量或权限 600 的环境文件，绝不写进代码、配置文件、命令历史、聊天记录。示例里的 `DB_PASSWORD` 占位符就是这条规矩的写法。
2. 生产环境不要用 `ddl-auto=update` 或 Quarkus 的 `generation=update`，它们会在启动时改表结构，出问题没有回滚脚本。用 `validate` 加数据库迁移工具，迁移脚本随代码评审一起走。
3. 本篇示例没有登录鉴权，只适合本地学习。直接暴露到公网之前，必须加鉴权（Spring Security 或 Quarkus 的安全扩展），并且只暴露必要的端点，不要把 Actuator 全量暴露。
4. 用 JPA 与参数化查询，不要自己拼 SQL 字符串，这是防 SQL 注入最基本的一条。用户输入拼进 SQL 是错误做法，不要写。
5. 浏览器表单场景要注意 CSRF：纯 API 场景用 Token 鉴权时，Cookie 方案要配 CSRF 防护；本篇示例是纯 API，没有浏览器表单登录流程，不要把 API 的鉴权方式直接套用到浏览器表单上。
6. 依赖要跟进补丁：Spring Boot 每个小版本只有约 13 个月的开源支持窗口，4.0 线在 2026 年 12 月结束开源支持，新项目从 4.1 线起步，并且要规划定期升级，不要把补丁版本钉死后几年不升级。
7. 原生镜像不等于更安全：Quarkus 原生镜像启动快、体积小，但它不解决鉴权、注入、密钥管理这些问题，安全措施一样都不能少。

## 18. 回滚和恢复

1. 改配置之前先备份：`sudo cp /etc/nginx/sites-available/blog.conf /etc/nginx/sites-available/blog.conf.bak`，应用配置同理，备份文件与原文件放同一目录，名字加 `.bak`。
2. 发新版本之前先留旧 jar：不要直接覆盖 `/opt/blog/` 下正在跑的 jar，先把新 jar 放到带版本号的名字，再改 systemd 的 ExecStart 指向，或者先停服务再替换，替换失败时把旧 jar 换回来就能恢复。
3. 回滚服务：`sudo systemctl stop blog`，换回旧 jar 与旧配置，`sudo systemctl daemon-reload`，`sudo systemctl start blog`，再按第 14 节的清单重新验证一遍。
4. 数据库备份：发版前用 `pg_dump` 备份一次，命令是 `pg_dump -U bloguser -h localhost blogdb > blogdb-备份日期.sql`，恢复时用 `psql` 导回去。备份文件不要与应用放同一台机器，异地备份的选型见指南的备份章节。
5. 回滚的判断标准：健康检查连续失败、核心接口 500、数据写入异常，三者出现其一就回滚，不要在生产环境上边修边试。

## 19. 延伸阅读

- Spring Boot 官方文档（spring.io 上的 Spring Boot 项目页，含入门指南与配置参考）：先读“入门”与“自动配置”两部分，再读 Actuator 与部署部分。
- Spring Framework 参考文档（docs.spring.io 上的 Spring Framework 文档）：重点读 Web MVC 一章，理解 DispatcherServlet 与控制器模型。
- Quarkus 官方文档与指南（quarkus.io）：重点读“入门”与“开发模式”两部分，原生镜像单独读一章，不要与 JVM 模式混着看。
- Jakarta EE 规范文档：本篇代码用的 `jakarta.*` 包名来自 Jakarta EE，遇到 `javax.*` 的老资料时要意识到那是旧命名空间，Spring Boot 4 与 Quarkus 3 都用 `jakarta.*`。
- PostgreSQL 官方文档：建库、用户、权限、备份恢复的具体命令以官方文档为准，本篇只给最小可用示例。
- 本指南的 ARCH-03 选型决策树：选型之前先走一遍决策树，确认 Java 是合适的落点，而不是先学了框架再反推需求。
- 本指南的 DB-01（待开始）：数据库选型、表设计、索引、事务、连接池的完整内容在 DB-01，读完本篇后继续读它。

## 20. 相关章节链接

- 选型方法：[ARCH-03 建站方案选型决策树](../architecture/03-decision-tree.md)
- 网络基础：[NET-01 互联网、HTTP/HTTPS、浏览器、DNS、域名、IP、端口](../basics/01-internet.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[DB-01 数据库选型、表设计、SQL、索引、事务、连接池](../database/01-design.md)
