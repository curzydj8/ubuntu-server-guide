# WEB-02：HTML 表单、表格、媒体

> 任务编号：WEB-02（网站建设与部署实战指南 · HTML 完整教程第 2 篇）
> 上一篇：[WEB-01 HTML 基础与语义化标签](./01-basics.md)；下一篇（待开始）：WEB-03 HTML SEO 与无障碍。
> 本篇只讲表单、表格、媒体三类内容，不讲 CSS 美化（那是 CSS-01 之后的事），不讲表单提交后的后端处理（那是 BE 阶段的事，本篇的表单提交只做到“浏览器能发出请求、地址栏能看到数据”为止）。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 写出一个能正常提交的表单，知道每个输入框的 `name` 是干什么的；
2. 分清 GET 和 POST 的区别，知道为什么搜索框用 GET、登录和密码不能用 GET；
3. 写出一个结构正确的表格，知道表格是用来放数据的，不是用来排版的；
4. 在页面里正确插入图片、音频、视频，知道 `alt` 为什么不能空着；
5. 说清楚“没有后端时，表单提交后会发生什么”，不再对着一个点完没反应的提交按钮发愣。

## 2. 适用人群

- 已完成 WEB-01，能写出语义化页面骨架的人；
- 想在页面里加留言、搜索、联系表单，或加一张成绩表、产品表、图片、视频的人；
- 以前复制过表单代码，但不知道 `label`、`name`、`method` 是干什么的人。

## 3. 适用系统和版本

- 与 WEB-01 相同：Windows、macOS、Linux 均可，HTML5，任意现代浏览器，任意纯文本编辑器。
- 本篇不需要服务器、不需要数据库。表单提交的后端验证、存储、登录，全部在后面的 BE 阶段讲，本篇不装、不配、不写后端代码。

## 4. 使用前提

- 已完成 WEB-01，或至少能写出 `<!DOCTYPE html>`、`<head>`、`<body>`、`<header>`、`<main>`、`<footer>` 的骨架；
- 知道怎么保存 UTF-8 编码的 `.html` 文件（WEB-01 第 4 节、第 15 节）；
- 知道浏览器地址栏、刷新、查看源代码这三件事怎么操作。

## 5. 所需资源

- 一台能打开浏览器的电脑，一个练习文件夹（可以沿用 WEB-01 的 `my-first-site`，也可以新建一个）；
- 本篇第 10 节的完整代码；
- 可选：一张你自己的图片（比如 `photo.jpg`），放在练习文件夹里，用来替换第 10 节示例里的占位图片路径，看到真实图片效果；没有也不影响，图片位置会显示 `alt` 文字，正好验证第 14 节。

## 6. 技术原理

### 表单：浏览器怎么把用户输入发出去

表单的本质是“收集输入，打包成一组名值对，发给 `action` 里的地址”：

- 每个输入框都有一个 `name`，用户填的值就是 `value`，发出去的数据就是 `name=value` 这样的成对数据。没有 `name` 的输入框，值是发不出去的——这是新手最常见的表单错误，页面上明明填了，提交后对方却收不到。
- `method` 决定怎么发：`get` 是把数据拼在地址后面发（地址栏能看到），`post` 是把数据放在请求体里发（地址栏看不到）。
- `action` 决定发给谁：可以是一个后端地址（比如 `/submit`），也可以暂时写 `#`，表示“先不发给任何后端，只做演示”。
- 没有后端时，`method="get" action="#"` 的表单提交后，页面会刷新，地址栏后面会出现 `?name=张三&email=...` 这样的查询串——这本身就是一次成功的验证，证明表单确实把数据发出去了，只是没有后端接住它。

### 表格：数据才用表格，排版不用

表格的本质是“行和列交叉的数据”，比如成绩表、价格表、配置参数表。它的结构标签是语义化的：

- `caption` 是表格标题；`thead` 是表头行；`tbody` 是数据行；`tfoot` 是表尾（比如合计行）；
- `th` 是表头单元格（默认加粗居中），`td` 是普通数据单元格；
- `scope="col"` 告诉读屏软件“这个 `th` 是这一列的表头”，`scope="row"` 是“这一行的表头”。

用表格做页面排版是二十年前的老做法，现在排版用 CSS（Flex、Grid），本篇不教、以后也不要学。

### 媒体：浏览器怎么显示图片、声音、视频

- 图片：`<img src="路径" alt="替代文字">`，浏览器按 `src` 去取图片，取不到就显示 `alt` 文字。`alt` 不是装饰，是给看不到图片的人（视障用户、图片加载失败时）准备的。
- 音频和视频：`<audio controls>`、`<video controls>`，`controls` 是让浏览器显示播放、暂停、音量这些自带控件；不写 `controls`，页面上就什么都看不到，用户也没法点播放。
- `<source>` 是“多准备几个格式，浏览器挑一个自己能播的”，比如视频同时给 MP4 和 WebM，浏览器先试第一个，不支持再试下一个。
- `<figure>` + `<figcaption>` 是一组“图片 + 图注”，图注不是随便写在图片下面的段落，而是和图片绑在一起的说明。

## 7. 架构说明

本篇完整示例的页面结构，仍然是 WEB-01 的骨架，只在 `main` 里加了三节：

```text
header（页眉）
nav（导航）
main
├── section#contact（表单：一份联系表单）
├── section#scores（表格：一张成绩表）
└── section#media（媒体：一张图、一段音频、一段视频）
footer（页脚）
```

三节之间没有依赖关系，可以单独拿出来用：只要表单，就复制表单那一节；只要表格，就复制表格那一节。每一节内部也是独立的，删掉一节不影响另外两节。

## 8. 操作前检查

1. 练习文件夹里已经有 WEB-01 的 `index.html`，或者你新建了一个空文件夹，准备放本篇的 `forms-tables-media.html`；
2. 编辑器保存编码是 UTF-8；
3. 如果你想看到真实图片，提前把一张图片放进练习文件夹，记下它的文件名（比如 `photo.jpg`），第 10 节示例里的图片路径就改成它。

## 9. 逐步操作

1. 在练习文件夹里新建文件 `forms-tables-media.html`；
2. 把第 10 节的完整代码从头到尾复制进去，不要只复制表单或只复制表格；
3. 保存，UTF-8，双击用浏览器打开；
4. 先看表格和媒体那两节是不是都显示出来了，再回到表单那一节；
5. 在表单里填上名字和邮箱，选一个主题，点“提交”，看地址栏是不是出现了 `?name=...&email=...` 这样的查询串——出现了就说明表单发出去了；
6. 把图片路径改成你自己的图片文件名，保存刷新，看图片是不是换成了你的图；再故意把路径改错一个字母，保存刷新，看图片位置是不是显示了 `alt` 文字——这一步是让你亲眼看到 `alt` 的作用；
7. 把 `method="get"` 改成 `method="post"`，再提交一次，看地址栏是不是不再出现查询串了——这就是 GET 和 POST 最直观的区别。

## 10. 完整代码

下面是本篇的完整示例，没有省略号，复制下来就是一个能打开的页面。存放位置：练习文件夹里的 `forms-tables-media.html`。注意：示例里的 `images/photo.jpg`、`audio/demo.mp3`、`video/demo.mp4` 是占位路径，你手头没有这些文件时，图片位置显示 `alt` 文字、音频视频控件显示但播不出内容，这是正常的，不是代码错了；换成你自己的文件路径就能正常显示和播放。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>表单、表格与媒体示例</title>
</head>
<body>
  <header>
    <h1>表单、表格与媒体示例</h1>
    <p>本页演示联系表单、成绩表格和图片音频视频的正确写法。</p>
  </header>
  <main>
    <section id="contact">
      <h2>联系表单</h2>
      <form method="get" action="#">
        <p>
          <label for="user-name">姓名：</label>
          <input type="text" id="user-name" name="name" required placeholder="请填写姓名">
        </p>
        <p>
          <label for="user-email">邮箱：</label>
          <input type="email" id="user-email" name="email" required placeholder="name@example.com">
        </p>
        <p>
          <label for="user-topic">主题：</label>
          <select id="user-topic" name="topic">
            <option value="question">咨询问题</option>
            <option value="suggest">意见建议</option>
            <option value="other">其他</option>
          </select>
        </p>
        <fieldset>
          <legend>希望通过哪种方式回复</legend>
          <p>
            <input type="radio" id="reply-email" name="reply" value="email" checked>
            <label for="reply-email">邮箱</label>
            <input type="radio" id="reply-phone" name="reply" value="phone">
            <label for="reply-phone">电话</label>
          </p>
        </fieldset>
        <p>
          <input type="checkbox" id="agree" name="agree" value="yes" required>
          <label for="agree">我已阅读并同意联系说明</label>
        </p>
        <p>
          <label for="user-message">留言：</label>
          <textarea id="user-message" name="message" rows="4" placeholder="请写下你的留言"></textarea>
        </p>
        <p>
          <button type="submit">提交</button>
          <button type="reset">清空</button>
        </p>
      </form>
    </section>
    <section id="scores">
      <h2>成绩表</h2>
      <table>
        <caption>2026 年春季学期成绩表</caption>
        <thead>
          <tr>
            <th scope="col">姓名</th>
            <th scope="col">语文</th>
            <th scope="col">数学</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">张三</th>
            <td>88</td>
            <td>92</td>
          </tr>
          <tr>
            <th scope="row">李四</th>
            <td>76</td>
            <td>85</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">平均分</th>
            <td>82</td>
            <td>88.5</td>
          </tr>
        </tfoot>
      </table>
    </section>
    <section id="media">
      <h2>图片、音频与视频</h2>
      <figure>
        <img src="images/photo.jpg" alt="一张示例图片，占位用">
        <figcaption>图 1：示例图片，换成你自己的图片路径即可显示</figcaption>
      </figure>
      <p>
        <audio controls src="audio/demo.mp3">你的浏览器不支持音频播放。</audio>
      </p>
      <p>
        <video controls width="480" poster="images/photo.jpg" src="video/demo.mp4">你的浏览器不支持视频播放。</video>
      </p>
    </section>
  </main>
  <footer>
    <p>© 2026 表单、表格与媒体示例</p>
  </footer>
</body>
</html>
```

下面是三个小片段，分别对应表单、表格、媒体里最容易单独拿出来用的部分，结构和第 10 节的完整示例一致，复制时注意 `label` 的 `for` 和输入框的 `id` 必须成对出现、值相同。

```html
<form method="post" action="/submit">
  <label for="login-name">用户名：</label>
  <input type="text" id="login-name" name="username" required>
  <label for="login-pass">密码：</label>
  <input type="password" id="login-pass" name="password" required>
  <button type="submit">登录</button>
</form>
```

```html
<table>
  <caption>产品价格表</caption>
  <thead>
    <tr>
      <th scope="col">产品</th>
      <th scope="col">价格</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>基础版</td>
      <td>免费</td>
    </tr>
  </tbody>
</table>
```

```html
<figure>
  <img src="images/photo.jpg" alt="一张示例图片，占位用">
  <figcaption>图注：图片的说明文字</figcaption>
</figure>
```

## 11. 完整配置文件

本篇不需要服务器配置文件，也不需要构建工具。唯一的文件就是第 10 节的 `forms-tables-media.html`，放在练习文件夹根目录。以后部署时，这个文件和它引用的媒体文件要一起放到网站目录里，并且保持相对路径不变：比如 HTML 里写的是 `images/photo.jpg`，那图片文件就必须放在网站目录下的 `images` 文件夹里，改名或挪位置都会导致图片加载失败。

## 12. 每个关键标签和属性的解释

### 表单

| 标签 / 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `<form>` | 表单容器，所有输入框都要放在它里面，放在外面的输入框提交时不会被发出去 | 漏写 `form`，只写了一堆 `input`，点提交没反应 |
| `method="get"` / `method="post"` | 发数据的方式：get 拼在地址后，post 放请求体里 | 搜索、筛选这种“只是查东西”用 get；登录、注册、留言、改数据用 post；密码、令牌绝对不能用 get，因为地址栏、浏览器历史、服务器日志都会留下 |
| `action` | 数据发给谁，不写默认发给当前页面地址 | 本篇演示写 `#`，正式上线必须改成真实后端地址，BE 阶段再讲 |
| `<label for="...">` | 输入框的文字说明，`for` 的值要等于对应输入框的 `id` | `for` 和 `id` 对不上，点文字就不能聚焦到输入框，读屏软件也读不出对应关系 |
| `<input type="text">` | 单行文本 | 密码不要用 `text`，要用 `password`，否则密码明文显示 |
| `<input type="email">` / `type="number"` / `type="date"` | 浏览器自带格式检查的输入框：邮箱格式不对、数字超出范围会先拦一下 | 浏览器检查只是第一道关，后端必须再检查一次，不能只靠浏览器 |
| `<input type="password">` | 密码框，输入显示为圆点 | 密码框本身不加密传输，加密靠 HTTPS，部署阶段再讲 |
| `<input type="checkbox">` / `type="radio">` | 多选 / 单选：同一组单选的 `name` 必须相同，否则就变成可以全选 | 单选组 `name` 写错，是新手最常见的单选失效原因 |
| `<input type="file">` | 文件上传 | 文件上传必须配 `method="post"` 和 `enctype="multipart/form-data"`，否则文件发不出去；本篇只讲标签，后端接收在 BE 阶段讲 |
| `<input type="hidden">` | 页面上不显示、但提交时一起发的数据 | 不要把密码、价格、权限这种敏感信息放 `hidden`，用户在源代码里全看得到 |
| `<select>` / `<option>` | 下拉框，`option` 的 `value` 是提交的值，标签里的文字是显示给用户看的 | 漏写 `value`，提交的值就变成显示文字，改显示文字就会影响后端 |
| `<textarea>` | 多行文本，`rows` 是默认显示几行 | 不要在 `textarea` 里写 `value` 属性，默认值写在开始和结束标签之间 |
| `<button type="submit">` / `type="reset"` / `type="button"` | 提交 / 清空 / 普通按钮 | `button` 不写 `type` 时，在表单里默认就是 `submit`，点一下就会提交，普通按钮必须写 `type="button"` |
| `<fieldset>` / `<legend>` | 把一组相关的输入框框起来，`legend` 是这组的标题 | 只起分组和语义作用，不影响提交 |
| `name` | 提交时数据的名字，没有 `name` 的值发不出去 | 每个要提交的输入框都必须有 `name`，且同一表单里不要重名（单选组除外） |
| `required` | 必填，不填就拦住不让提交 | 只靠 `required` 不够，后端必须再校验，浏览器检查可以被绕过 |
| `placeholder` | 输入框里的灰色提示文字，开始输入就消失 | `placeholder` 不能代替 `label`，提示文字消失后用户就不知道这个框是填什么的 |

### 表格

| 标签 / 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `<table>` | 表格容器 | 不要用表格做页面排版，排版用 CSS |
| `<caption>` | 表格标题，写在 `table` 里最前面 | 标题不要写成表格外面的 `h2` 冒充，`caption` 才是表格自己的标题 |
| `<thead>` / `<tbody>` / `<tfoot>` | 表头 / 数据 / 表尾的分组 | 顺序是 `thead`、`tbody`、`tfoot`，`tfoot` 写在最后面（HTML5 里写在 `tbody` 前面浏览器也能处理，但按顺序写最稳） |
| `<tr>` | 一行 | `tr` 里只能放 `th` 或 `td`，不能直接放文字 |
| `<th scope="col">` / `<th scope="row">` | 表头单元格，`scope` 说明它是列头还是行头 | 成绩表里第一列的姓名是行头，要用 `th scope="row"`，不要全写成 `td` |
| `<td>` | 普通数据单元格 | 数字、文字都放 `td`，只有表头用 `th` |
| `colspan` / `rowspan` | 一个单元格横跨几列 / 纵跨几行 | 跨列跨行后，总列数要对得上，对不上表格会错位，排查时先数每行的单元格总数 |

### 媒体

| 标签 / 属性 | 作用 | 容易错的地方 |
|---|---|---|
| `<img src="..." alt="...">` | 图片，`src` 是路径，`alt` 是替代文字 | `alt` 空着、或写成“图片”这种废话，等于没写；装饰性图片（纯背景、纯分隔）才可以 `alt=""`，表示“这张图没有信息，读屏软件可以跳过” |
| `width` / `height` | 图片、视频的显示尺寸 | 只写一个，另一个按比例自动算；两个都写错比例会把图拉变形 |
| `<figure>` / `<figcaption>` | 图片 + 图注的一组 | 图注不要写成图片下面的普通段落，`figcaption` 才是和图片绑定的说明 |
| `<audio controls>` / `<video controls>` | 音频 / 视频，`controls` 显示自带播放控件 | 漏写 `controls`，页面上看不到播放器，用户没法播放 |
| `<source src="..." type="...">` | 多准备几个格式，浏览器挑能播的 | `type` 要写对（比如 `video/mp4`、`video/webm`），写错浏览器会跳过这个源 |
| `poster` | 视频没播之前的封面图 | 不写 `poster`，视频区在播放前是黑的，用户不知道这是什么视频 |
| `<iframe>` | 在页面里嵌另一个页面（比如地图、视频网站的嵌入代码） | 嵌别人的页面要确认对方允许被嵌，且尽量加 `sandbox` 限制、加 `title` 说明；不要嵌自己不信任的页面，里面的脚本和跳转不受你控制 |

## 13. 执行结果示例

双击打开后，你应该看到：

- 标题“表单、表格与媒体示例”和一行说明；
- 联系表单：姓名、邮箱、主题下拉框、一组单选（邮箱/电话）、一个必勾的复选框、留言框、提交和清空两个按钮；
- 成绩表：标题“2026 年春季学期成绩表”，表头是姓名、语文、数学，两行数据（张三、李四），最后一行是平均分；
- 媒体区：一张图片位置（没有你自己的图片文件时显示 `alt` 文字“一张示例图片，占位用”，下面有图注）、一个音频播放器、一个视频播放器；
- 点表单的“提交”后，页面刷新，地址栏出现 `?name=...&email=...&topic=...&reply=...&agree=...&message=...` 这样的查询串——这就是 GET 提交成功的样子；
- 把 `method` 改成 `post` 再提交，地址栏不再出现查询串——这就是 POST 和 GET 最直观的区别。

## 14. 成功验证

按顺序做，全部通过才算本篇完成：

1. **表单验证**：姓名、邮箱不填点提交，浏览器拦住不让提交（`required` 在起作用）；填好点提交，地址栏出现查询串，且查询串里有你填的名字和邮箱；
2. **单选验证**：邮箱和电话两个单选只能选中一个，点一个另一个自动取消；
3. **标签验证**：点“姓名：”这几个字，光标跳到姓名输入框里（`label` 的 `for` 和 `id` 对上了）；
4. **表格验证**：表头、数据行、平均分行都对齐，没有错位；第一列姓名是加粗的（因为用了 `th scope="row"`）；
5. **媒体验证**：图片位置显示 `alt` 文字或你的图片；音频、视频控件能看到播放按钮；把图片路径改错一个字母，图片位置立刻变成 `alt` 文字，证明 `alt` 确实是图片加载失败时的替代内容；
6. **可选的本地服务验证**：在练习文件夹里运行 `python3 -m http.server 8000`，打开 `http://127.0.0.1:8000/forms-tables-media.html`，能看到同一个页面。

## 15. 常见错误

| 错误 | 现象 | 改法 |
|---|---|---|
| 输入框没有 `name` | 填了东西，提交后对方收不到 | 每个要提交的输入框都加 `name` |
| 单选组 `name` 各不相同 | 单选变成多选，全都能选中 | 同一组单选的 `name` 写成同一个值 |
| `label` 的 `for` 和输入框 `id` 对不上 | 点文字光标不跳，读屏软件读不出对应关系 | 改成一模一样的值 |
| 密码用 GET 提交 | 密码出现在地址栏、浏览器历史、服务器日志里 | 登录、注册、改密码一律用 POST，且上线后必须走 HTTPS |
| 敏感信息放 `hidden` | 用户看源代码就看到价格、权限、令牌 | `hidden` 只放无害的标识（比如当前页码），敏感信息放后端会话里 |
| 用表格排版 | 页面在手机上乱成一团，改起来牵一发而动全身 | 表格只放数据，排版交给 CSS（Flex、Grid） |
| 表格行列数对不上 | 表格错位、某一行多出一格或少一格 | 数每行的单元格总数，`colspan`/`rowspan` 跨了几列就要相应少写几个单元格 |
| 图片没有 `alt` | 图片加载失败时一片空白，读屏用户不知道这是什么图 | 每张有信息的图片都写 `alt`，说清楚图里是什么 |
| 音频视频没有 `controls` | 页面上看不到播放器，用户没法播放 | 加上 `controls` |
| 文件上传没配 `enctype` | 点提交文件发不出去 | 表单加 `method="post"` 和 `enctype="multipart/form-data"`，后端接收在 BE 阶段讲 |
| `button` 没写 `type` 就放在表单里 | 点一个普通按钮，表单却提交了 | 普通按钮写 `type="button"`，提交按钮写 `type="submit"` |

## 16. 故障排查

- **提交没反应**：先看输入框是不是都在 `form` 里面，再看必填项是不是没填（浏览器会把第一个没填的必填项标出来并跳过去）。
- **提交后地址栏没有查询串**：看 `method` 是不是 `post`（POST 本来就不在地址栏显示），或者 `action` 是不是指向了别的页面；改回 `get` 再试一次，对照第 13 节。
- **表格错位**：从第一行开始数每行的单元格个数，`colspan`/`rowspan` 的行要单独数，多数错位都是某一行多写或少写了一个 `td`。
- **图片不显示**：按顺序查：文件名拼写、大小写（Linux 服务器区分大小写，`Photo.jpg` 和 `photo.jpg` 是两个文件）、相对路径（HTML 在根目录，图片在 `images` 文件夹里，路径就要写 `images/photo.jpg`，不能只写 `photo.jpg`）。
- **音频视频播不出来**：先看文件路径对不对，再看浏览器支不支持这个格式（MP4、MP3 最通用），再看是不是漏了 `controls`。
- **改了代码刷新没变**：确认保存了，再按 Ctrl+F5 强制刷新，排除浏览器缓存。

## 17. 安全注意事项

- 密码、短信验证码、令牌、支付信息，一律用 POST + HTTPS，绝不用 GET；GET 的数据会留在地址栏、历史记录、服务器日志和 Referer 里。
- 浏览器端的 `required`、邮箱格式检查、数字范围检查，都只是“帮用户少填错”，不是安全防线；后端必须再校验一次，BE 阶段会反复强调这一点。
- 文件上传是高风险功能：只允许上传、只存到非 Web 目录或做后缀和内容双重检查、上传的文件绝不能直接当脚本执行——本篇只讲标签，不讲接收，BE 阶段讲接收时再讲防护。
- `iframe` 嵌别人的页面时，对方页面的脚本、跳转、Cookie 都不受你控制，只嵌可信来源，尽量加 `sandbox` 和 `title`。
- 不要把真实用户的邮箱、电话、地址写进示例代码里公开发布，示例用“张三”“name@example.com”这种占位数据就够了。

## 18. 回滚和恢复

本篇和 WEB-01 一样，没有服务器、没有数据库、没有配置改动，回滚就是：

- 改错了：编辑器里 Ctrl+Z 撤销，或把第 10 节的完整代码重新复制覆盖一次；
- 文件删错了：重新新建 `forms-tables-media.html`，把第 10 节代码再贴一遍；
- 没有任何线上内容会被影响，因为本篇文件只在你的练习文件夹里，还没有部署到 crozz.me。

## 19. 延伸阅读

- MDN 表单入门：https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/form
- MDN 表格：https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/table
- MDN 图片、音频、视频：https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/img
- MDN 输入框类型一览：https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/input

## 20. 相关章节链接

- 上一篇：[WEB-01 HTML 基础与语义化标签](./01-basics.md)
- 本指南的规划和任务表：[总计划](../MASTER_PLAN.md)、[任务索引](../TASK_INDEX.md)、[路线图](../ROADMAP.md)
- 下一篇：[WEB-03 HTML SEO 与无障碍](./03-seo-a11y.md)
- 再往后：CSS-01 CSS 基础语法与选择器、JS-01 JavaScript 基础（都在任务索引里，顺序见路线图）
