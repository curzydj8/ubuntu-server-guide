# JS-02：DOM、事件、异步完整教程

> 任务编号：JS-02（网站建设与部署实战指南 · JavaScript 第 2 篇）
> 上一篇：[JS-01 JavaScript 基础与语法](./01-basics.md)；下一篇：[JS-03 TypeScript](./03-typescript.md)。
> 本篇只讲 DOM、事件、异步和 ES 模块。不重讲 JS-01 的变量、类型、函数、对象、数组基础；不讲 TypeScript（那是 JS-03）；不讲 npm、Vite、打包构建（那是 JS-04）。

## 1. 本章目标

读完本篇，你能做到下面五件事：

1. 用代码选中页面上的元素，并改掉它的文字、样式、内容。
2. 给按钮、列表、表单加上点击、提交等事件，并知道冒泡和事件委托是怎么回事。
3. 用 `async/await` 和 `fetch` 从接口取数据，显示在页面上，取失败时给出错误提示而不是白屏。
4. 分清同步代码和异步代码的执行顺序，不再被“先打印的反而后执行”吓到。
5. 用 ES 模块把代码拆成两个以上文件，知道 `import` 和 `export` 各写在哪里。

## 2. 适用人群

适合已经学完 JS-01 的读者：会写变量、`if`、`for`、函数、对象和数组，会看懂 HTML 标签和 CSS 选择器，但还没有亲手让页面“动起来”。如果你连 HTML 标签都还不熟，先回头看 HTML 篇的第 1 篇和第 2 篇；如果你只想先做一个静态页面，不需要取数据，可以只读到第 9 节的事件部分，异步部分以后再回来看。

## 3. 适用系统和版本

本篇不依赖任何框架和构建工具，系统不限（Windows、macOS、Linux 都可以），只要有一个现代浏览器（Chrome、Edge、Firefox、Safari 近几年的版本均可）。JavaScript 语言标准写成 ES2015（ES6）及之后：`const`、`let`、箭头函数、`Promise`、`async/await`、`fetch`、ES 模块都是现代浏览器的内置能力，不需要另外安装。本篇不讲 Node.js 环境，不讲旧浏览器（IE）的兼容写法，旧浏览器不支持 `fetch` 和 ES 模块，遇到时应当升级浏览器而不是给本篇代码打补丁。

## 4. 使用前提

开始前请确认下面四项都已具备：

1. 会用记事本或编辑器新建一个 `.html` 文件，并能用浏览器打开它。
2. 看得懂 HTML 篇讲过的标签结构：`h1`、`p`、`button`、`ul`、`li`、`form`、`input`、`div`。
3. 会打开浏览器的开发者工具并找到“控制台（Console）”面板：按 F12 或右键选“检查”，报错信息先看控制台，不要靠猜。
4. 有一台能联网的电脑用于验证取数据那一步；如果暂时离线，取数据那一步会显示错误提示，这也是本篇特意设计的正常结果，不是你做错了。

## 5. 所需资源

本篇只需要下面两样东西，不需要装任何软件：

| 资源 | 说明 |
|---|---|
| 一个文本编辑器 | 系统自带的记事本就可以，VS Code、Notepad++ 更好用，只用来写文件，不装插件也能学 |
| 一个现代浏览器 | 用来打开示例页、看控制台报错；取数据一步需要联网 |

取数据用的公开占位接口是 `https://jsonplaceholder.typicode.com/posts/1`，它只返回一条假文章数据，专门给学习和测试用，不要把它当成真实业务接口，也不要往它上面提交真实个人信息。

## 6. 技术原理

先把三组概念一次讲清，后面操作就不会乱。

**DOM 是什么。** 浏览器把 HTML 文档读进来，变成一棵树，叫文档对象模型（Document Object Model，简称 DOM）。每个标签就是树上的一个节点，`document` 是整棵树的入口。JavaScript 改页面，本质上就是改这棵树：找到节点，改它的文字、属性、样式，或者增删节点。HTML 文件本身没有变，变的是浏览器内存里的这棵树，刷新页面就回到 HTML 原样。

**事件是什么。** 用户点击、输入、提交、鼠标移动，都是事件。`addEventListener` 的意思是“给某个节点登记一个处理函数，等事件发生时再执行它”。登记时函数并不执行，点击时才执行，这是初学者最容易搞混的一点：写 `btn.addEventListener('click', sayHi)` 时，`sayHi` 后面不加括号，加括号就变成“立刻执行一次”，而不是“点击时执行”。

**异步是什么。** 有些操作要等，比如向服务器取数据，浏览器不会停在原地等它，而是先去做别的事，等数据到了再执行事先约好的回调函数。`Promise` 就是对“以后才有结果”这件事的承诺，有三种状态：等待中（pending）、成功（fulfilled）、失败（rejected）。`async/await` 是写异步代码的更直观的写法：`await` 后面的表达式是一个 Promise，代码会在这里“暂停一下”，等结果到了再往下走，但它不会卡住整个页面，其他代码和用户操作照常进行。

**事件冒泡是什么。** 点击一个 `li`，事件会先在 `li` 上触发，然后向上传到 `ul`、`div`、`body`，这叫冒泡。利用冒泡可以只在父元素上登记一次监听，靠 `event.target` 判断到底点的是哪个子元素，这叫事件委托。列表项很多、还会动态增加时，委托比给每个 `li` 各登记一次省事得多，也不会漏掉后来新增的项。

## 7. 架构说明

本篇示例页的结构只有三层，非常简单，特意不引入框架和构建工具：

1. **HTML 层**：负责结构和初始内容，每个要被改的元素都有一个 `id`，按钮、列表、表单、结果区各司其职。
2. **内联 `<script>` 层**：负责行为，放在 `</body>` 之前，这样执行时前面的元素都已经存在，不会出现“元素还没生成就去找它”的问题。
3. **网络层**：只有一步向外请求，就是 `fetch` 取一条假文章数据，成功显示标题，失败显示错误提示，成功和失败两条路都要写，不能只写成功那条路。

如果以后要把代码拆开，结构会变成：`dom-async.html`（页面）加 `main.js`（入口）加 `api.js`（取数据的函数），页面用 `<script type="module" src="main.js">` 引入入口，入口再 `import` 取数据函数。拆分的规则在第 9 节的模块部分讲，本篇第 10 节的完整示例为了“复制下来就能打开”，先用内联脚本，模块写法单独说明，不混进同一个脚本导致浏览器报错。

## 8. 操作前检查

动手前先做下面三项检查，少一项都先补齐再往下走：

1. 新建一个空文件夹，例如 `js-dom-demo`，本篇所有文件都放在里面，不要散落在桌面。
2. 确认浏览器能打开一个最简单的 HTML 文件：写一个只有一行文字的页面，浏览器里能看到文字，说明“写文件、打开文件”这条路是通的。
3. 确认会打开控制台：按 F12，能看到 Console 面板，后面报错先看这里。本篇第 16 节的每一条排查，第一步都是看控制台。

## 9. 逐步操作

按下面六步走，每一步都有一个可以立刻验证的小结果，不要跳步。

**第一步：选中元素。** 给要改的元素加 `id`，例如 `id="msg"`，然后用 `document.getElementById('msg')` 拿到它。用 `querySelector` 也可以，它接受 CSS 选择器写法，例如 `document.querySelector('#msg')` 选中同一个元素，`document.querySelectorAll('li')` 选中全部 `li`。记住：`id` 在一个页面里应当唯一，重复 `id` 会导致只选中第一个，查错时先看 `id` 有没有写重。

**第二步：改内容。** 拿到元素后，改文字用 `textContent`，不要用 `innerHTML` 拼用户输入的内容（原因见第 17 节）。改样式可以直接改 `style`，例如 `msg.style.color = 'red'`，但样式一多就应当改 `className` 或用 `classList.add`，把样式留在 CSS 里。

**第三步：登记事件。** 用 `addEventListener` 登记，例如 `btn.addEventListener('click', function () { ... })`。同一个元素、同一个事件可以登记多个处理函数，它们会按登记顺序依次执行，这是它比“直接写 `onclick` 属性”好的地方：后者写第二次会把第一次覆盖掉。

**第四步：处理事件对象。** 处理函数会收到一个事件对象，通常写成 `event`。点列表时用 `event.target` 判断到底点的是哪个子元素；表单提交时调用 `event.preventDefault()`，意思是“不要按浏览器默认行为提交并刷新页面”，由 JavaScript 自己处理输入内容。注意：`preventDefault` 只是阻止默认行为，不是阻止冒泡；阻止冒泡要用 `event.stopPropagation()`，本篇一般不需要它，不要顺手乱加。

**第五步：取数据。** 把取数据的函数写成 `async function`，里面先把状态文字改成“加载中”，再用 `await fetch(地址)` 等结果，用 `response.ok` 判断 HTTP 状态是不是成功，成功才 `await response.json()` 取数据，失败就主动抛错。整个过程包在 `try...catch` 里，`catch` 里把错误信息显示在页面上，而不是只打印到控制台——用户看不到控制台，看不到就等于没有提示。

**第六步：拆成模块（可选，做完前五步再做）。** 新建 `api.js`，把取数据函数用 `export` 导出去；新建 `main.js`，用 `import` 把它引进来；页面改成 `<script type="module" src="main.js">`。模块文件不能用双击文件的方式直接打开测试，必须用本地服务器（例如第 14 节的 `python3 -m http.server`）通过 `http://` 访问，否则浏览器会因为跨域安全规则拒绝加载模块文件。

模块的几种写法对照如下，行内代码即完整写法，不要再到处找：

| 写法 | 含义 |
|---|---|
| `export function getPost() { ... }` | 在 `api.js` 里导出一个具名函数 |
| `export default function getPost() { ... }` | 在 `api.js` 里导出一个默认函数，一个文件只能有一个默认导出 |
| `import { getPost } from './api.js'` | 在 `main.js` 里引入具名导出，花括号里的名字必须和导出时一致 |
| `import getPost from './api.js'` | 在 `main.js` 里引入默认导出，名字可以自己起，但容易看不出它原来叫什么，团队里优先用具名导出 |

## 10. 完整代码

下面是本篇唯一的完整示例页，复制下来保存为 `dom-async.html` 就能打开。注意三点：第一，按钮点击改内容、列表点击委托、表单提交阻止刷新、取数据并显示，四件事都在同一个页面里；第二，取数据失败时页面会显示错误提示，离线时看到错误提示是正常的；第三，模块写法没有塞进这个内联脚本，因为内联脚本不是模块，写 `import` 会直接报错，模块写法见第 9 节第六步的表格。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DOM、事件与异步示例</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; max-width: 640px; margin: 40px auto; padding: 0 16px; }
    #result { border: 1px solid #ccc; padding: 12px; min-height: 60px; }
    li { cursor: pointer; }
  </style>
</head>
<body>
  <h1 id="title">DOM、事件与异步示例</h1>
  <p id="msg">点下面的按钮，这段文字会被改掉。</p>
  <button id="changeBtn" type="button">改掉上面那段文字</button>
  <h2>点列表里的某一项（事件委托）</h2>
  <ul id="list">
    <li>苹果</li>
    <li>香蕉</li>
    <li>橙子</li>
  </ul>
  <p id="picked">你还没有点列表项。</p>
  <h2>表单（提交时不刷新页面）</h2>
  <form id="demoForm">
    <label>你的名字：<input id="nameInput" type="text"></label>
    <button type="submit">提交</button>
  </form>
  <p id="hello"></p>
  <h2>取一条数据（Fetch）</h2>
  <button id="loadBtn" type="button">加载一篇文章标题</button>
  <p id="status"></p>
  <div id="result">这里会显示取到的数据，失败时会显示错误提示。</div>
  <script>
    var msg = document.getElementById('msg');
    var title = document.getElementById('title');
    var changeBtn = document.getElementById('changeBtn');
    var list = document.getElementById('list');
    var picked = document.getElementById('picked');
    var demoForm = document.getElementById('demoForm');
    var nameInput = document.getElementById('nameInput');
    var hello = document.getElementById('hello');
    var loadBtn = document.getElementById('loadBtn');
    var status = document.getElementById('status');
    var result = document.getElementById('result');
    changeBtn.addEventListener('click', function () {
      msg.textContent = '文字已经改掉了！这是 JavaScript 改的 DOM，不是改 HTML 文件。';
      title.style.color = 'darkorange';
    });
    list.addEventListener('click', function (event) {
      if (event.target.tagName === 'LI') {
        picked.textContent = '你点了：' + event.target.textContent;
      }
    });
    demoForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hello.textContent = '你好，' + nameInput.value + '！页面没有刷新，这就是 preventDefault 的作用。';
    });
    loadBtn.addEventListener('click', async function () {
      status.textContent = '加载中……';
      result.textContent = '';
      try {
        var response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        if (!response.ok) {
          throw new Error('HTTP 状态：' + response.status);
        }
        var data = await response.json();
        status.textContent = '加载成功。';
        result.textContent = '标题：' + data.title;
      } catch (error) {
        status.textContent = '加载失败。';
        result.textContent = '加载失败：' + error.message + '（离线或接口不可用时会出现这句，这是正常的错误提示，不是页面坏了。）';
      }
    });
  </script>
</body>
</html>
```

## 11. 完整配置文件

本篇不需要构建配置，也没有 `package.json`、没有 Vite 配置文件，这一点要先说清，免得读者到处找一个不存在的配置文件。唯一需要交代清楚的是文件本身放在哪里：

| 文件 | 存放路径（相对示例文件夹） | 说明 |
|---|---|---|
| 示例页 | `js-dom-demo/dom-async.html` | 第 10 节的完整代码，复制下来就能打开，内联脚本，不依赖其他文件 |
| 模块入口（拆分时才需要） | `js-dom-demo/main.js` | 页面改成 `<script type="module" src="main.js">` 后才用，里面写事件登记和页面逻辑 |
| 取数据模块（拆分时才需要） | `js-dom-demo/api.js` | 只放取数据的函数并 `export` 出去，页面不直接引用它，由 `main.js` 引入 |
| 不需要的文件 | 无 | 本篇不建 `package.json`，不装依赖，不配构建工具，那些是 JS-04 的内容 |

模块拆分的目录结构就是上面三行：如果只学到第 9 节前五步，只需要第一行；做到第六步时再加后两行，不要一开始就把三个文件全建好，反而分不清哪段代码在哪里执行。

## 12. 每个关键配置项的解释

本篇没有传统意义上的配置文件，关键的“配置项”就是代码里每个 API 的用法和坑位，一项一项讲清：

| 写法 | 含义 | 容易错的地方 |
|---|---|---|
| `document.getElementById('msg')` | 按 `id` 找一个元素，找不到返回 `null` | `id` 写错或脚本放在元素前面执行，拿到 `null` 再改属性就会报错 |
| `document.querySelector('#msg')` | 按 CSS 选择器找第一个匹配的元素 | 选择器前面要加 `#`（按 `id`）或 `.`（按类名），漏了符号就选不到 |
| `document.querySelectorAll('li')` | 找全部匹配的元素，返回一个列表 | 它不是真正的数组，不能直接用数组的全部方法，遍历用 `forEach` 或 `for` 循环 |
| `element.textContent = '...'` | 改元素的纯文字 | 用户输入的内容也用它，不要用 `innerHTML` 拼用户输入，见第 17 节 |
| `addEventListener('click', fn)` | 登记事件处理函数 | 函数名后面不要加括号，加了就是立刻执行；同一个事件可登记多个，不会互相覆盖 |
| `event.target` | 真正触发事件的元素 | 列表委托时要判断它是不是 `li`，不要假设点 `ul` 空白处也会有 `li` |
| `event.preventDefault()` | 阻止浏览器默认行为，例如表单提交刷新 | 只阻止默认行为，不阻止冒泡；写在处理函数开头，不要等处理完了才写 |
| `fetch(地址)` | 发起网络请求，返回一个 Promise | `fetch` 只在断网、跨域被拦时才算失败，HTTP 404、500 不算失败，必须自己查 `response.ok` |
| `response.ok` | HTTP 状态是不是 200 到 299 | 不查它，404 也会被当成成功，后面 `response.json()` 很可能跟着报错 |
| `await` | 等一个 Promise 出结果再往下走 | 只能写在 `async function` 里面，普通函数里写 `await` 会直接语法报错 |
| `try...catch` | 包住可能失败的异步代码，失败时走 `catch` | 只包住 `fetch` 和解析，不包住整个页面逻辑，否则哪里错了都看不出来 |
| `<script type="module">` | 声明这是一个 ES 模块脚本 | 模块脚本默认是延迟执行的，且必须通过 `http://` 访问，双击文件打开会因安全规则加载失败 |
| `import` / `export` | 模块的引入和导出 | 导出名和引入名（具名导出时）必须一致；内联普通脚本里写 `import` 会报错 |

## 13. 执行结果示例

按第 14 节操作，正常情况下你会依次看到下面这些结果：

1. 打开页面，看到标题、一段提示文字、“改掉上面那段文字”按钮、三个水果的列表、一个表单、一行“加载一篇文章标题”按钮。
2. 点“改掉上面那段文字”，提示文字变成“文字已经改掉了！这是 JavaScript 改的 DOM，不是改 HTML 文件。”，标题变成深橙色。
3. 点列表里的“香蕉”，“你还没有点列表项。”变成“你点了：香蕉”。
4. 在表单里输入名字并点提交，页面下方出现“你好，某某！页面没有刷新……”，页面没有刷新、输入框的内容没有被清空到初始状态之外（刷新才会丢）。
5. 联网时点“加载一篇文章标题”，状态先变成“加载中……”，随后变成“加载成功。”，结果区显示“标题：sunt aut facere repellat provident occaecati excepturi optio reprehenderit”。标题文字以接口返回为准，如果接口示例数据变了，以实际返回的标题为准。
6. 离线或接口不可用时点同一个按钮，状态变成“加载失败。”，结果区显示以“加载失败：”开头的错误提示，页面其他按钮照常能点，这就是正确的失败表现。

## 14. 成功验证

按下面五步验证，每一步都有明确的通过标准：

1. **文件能打开**：用浏览器打开 `dom-async.html`，能看到标题和全部按钮，没有空白页。空白页先看控制台，不要反复改代码。
2. **点击改文字**：点改文字按钮，提示文字变化且标题变色。只变一项、另一项没变，说明对应的那行代码没执行，去对照第 10 节检查 `id` 是否一致。
3. **列表委托**：分别点三个水果项，下方文字跟着变。点 `ul` 的空白处，下方文字不变，这说明 `event.target.tagName === 'LI'` 的判断在起作用。
4. **表单不刷新**：输入名字提交，页面不刷新且出现问候语。如果页面刷新了，说明 `preventDefault` 没写或没执行，检查表单监听是不是登记在 `form` 的 `submit` 事件上，而不是按钮的 `click` 上。
5. **取数据两条路都走一遍**：联网点加载按钮，看到成功标题；然后断网（或关掉网络）再点一次，看到“加载失败。”和错误提示。两条路都出现才算通过，只测成功那条路不算，因为真实用户一定会遇到失败那条路。

模块拆分的验证单独做：把代码拆成 `main.js` 和 `api.js` 后，必须用本地服务器通过 `http://` 访问，例如在示例文件夹里运行 `python3 -m http.server 18078`，再打开 `http://127.0.0.1:18078/dom-async.html`，能正常加载才算通过。直接双击文件打开、模块加载失败，是浏览器的安全规则，不是代码写错了，不要因此把模块写法改回内联脚本了事。

## 15. 常见错误

下面是初学者最常踩的坑，先对照，再改代码：

| 错误现象 | 原因 | 改法 |
|---|---|---|
| 控制台报 `Cannot read properties of null` | 元素没找到，`id` 写错，或脚本在元素生成之前执行 | 核对 `id` 拼写，把脚本放在 `</body>` 之前，或等页面加载完再执行 |
| 点击按钮没反应，控制台没有报错 | 处理函数名后加了括号，变成登记时立刻执行了一次，点击时无事可做 | 把 `addEventListener('click', fn())` 改成 `addEventListener('click', fn)` |
| 点按钮只执行一次想要的效果，第二次没反应 | 上一次处理函数里把按钮本身删掉或改掉了 `id` | 不要在处理函数里删触发事件的元素本身，改文字、改样式即可 |
| 表单一点提交页面就刷新，输入全丢了 | 忘了写 `event.preventDefault()`，或把它写在了按钮点击而不是表单提交上 | 在 `form` 的 `submit` 处理函数开头写 `preventDefault` |
| 列表后来新增的项点它没反应 | 给每个 `li` 各登记了一次，新增的项没有登记 | 改成在 `ul` 上登记一次，用 `event.target` 判断点的是哪个 `li` |
| `await` 写在普通函数里直接报错 | `await` 只能出现在 `async function` 里 | 把函数声明改成 `async function`，或改用 `Promise` 的 `then` 写法 |
| `fetch` 拿到 404 还当成成功往下走 | `fetch` 的 Promise 在 HTTP 404、500 时不会失败 | 先查 `response.ok`，不成功就主动抛错，进 `catch` 显示提示 |
| 控制台先打印“完成”，数据后打印 | 异步代码不会等，打印“完成”的那行先执行，取数据的回调后执行 | 把依赖数据的操作写进 `await` 之后或 `then` 里面，不要写在 `fetch` 后面的下一行就假设数据已经到了 |
| 模块文件双击打开报错，提示跨域 | 模块必须通过 `http://` 加载，`file://` 会被浏览器安全规则拦住 | 用本地服务器访问，不要双击文件 |
| 内联脚本里写 `import` 直接报错 | 普通内联脚本不是模块，不认 `import` 语法 | 要么用 `<script type="module">`，要么把模块代码放进独立的 `.js` 文件 |

## 16. 故障排查

按“先看控制台、再核对 `id`、再核对事件名、最后核对网络”的顺序查，不要一上来就重写整页：

1. **控制台有红色报错**：把报错信息完整读一遍，重点看第一行和它指出的行号。`null` 相关报错先核对 `id`；`await` 相关报错先看函数是不是 `async`；`import` 相关报错先看脚本是不是模块。
2. **控制台没有报错但点击没反应**：检查三处，一是按钮的 `id` 和代码里找的 `id` 是否一致，二是事件名是不是 `click`（不是 `onclick`，`addEventListener` 里写事件名不带 `on`），三是脚本是不是真的被页面加载了（在脚本开头临时加一行控制台打印能最快确认，但确认完要删掉这行调试代码）。
3. **取数据一直显示“加载中”**：大概率是 `await` 后面的 Promise 一直没返回，先看网络面板有没有发出请求，再看请求地址有没有拼错，最后看是不是跨域被拦（控制台会有跨域相关的报错，本篇用的公开占位接口允许跨域，换成别的接口时要先确认它支不支持跨域）。
4. **取数据失败但页面一片空白**：说明失败分支没有把提示写到页面上，只打印到了控制台。回到第 9 节第五步，把 `catch` 里的提示写进结果区，用户看不到控制台。
5. **模块拆分后页面不动**：先确认是不是用 `http://` 打开的，再确认 `main.js` 和 `api.js` 在同一个文件夹、引入路径写的是 `./api.js` 而不是 `api.js` 漏了 `./`（相对路径的写法要和页面文件的位置对应），最后确认导出名和引入名一致。

## 17. 安全注意事项

本篇代码量小，但有三条安全红线必须现在就养成习惯：

1. **不要用 `innerHTML` 拼用户输入或接口返回的文字。** 用户输入里可能带有 HTML 标签甚至脚本，拼进 `innerHTML` 就会被浏览器当成代码执行，这叫跨站脚本攻击（XSS）。显示文字一律用 `textContent`，本篇示例就是这么写的。
2. **不要把密钥、密码、Token 写进前端代码。** 浏览器里的代码任何人都能看到，写进去就等于公开。本篇用的占位接口不需要密钥，正好说明“不需要密钥的接口才能直接从浏览器调”；需要密钥的接口要走自己的后端转发，那是后端篇的内容，不要在本篇图省事把密钥写进页面。
3. **取数据失败时不要把完整报错堆栈原样显示给用户。** 本篇示例只显示一句简短的错误提示，详细的错误信息应当只记到控制台或日志里。把堆栈、接口地址、内部错误原样贴到页面上，会把实现细节暴露给攻击者，也会把用户吓到。

另外提醒一点：表单提交阻止刷新只是“页面行为”，不是“安全校验”。真正重要的数据校验必须在后端再做一次，前端校验只能改善体验，不能当成防线。本篇不讲后端校验，只先把这个观念立住。

## 18. 回滚和恢复

本篇没有服务器、没有数据库、没有构建产物，回滚非常简单：

1. **页面改坏了**：刷新浏览器，页面回到 HTML 文件的初始状态，因为 JavaScript 改的只是内存里的 DOM，不是 HTML 文件本身。刷新后如果还是坏的，说明 HTML 文件本身被改坏了，对照第 10 节重新复制一份。
2. **脚本改坏了**：把 `<script>` 里的改动逐段删回上一个能跑的版本。建议每做完第 9 节的一步就把文件复制一份，命名为 `dom-async-步骤1.html` 这样，坏了直接用上一份覆盖。
3. **模块拆分改坏了**：把页面改回内联脚本的版本（第 10 节的完整代码），先恢复到能跑的状态，再重新做拆分，不要在坏的拆分版本上继续改。
4. **接口换了或不可用了**：把 `fetch` 的地址换回本篇的占位接口，先确认页面本身没问题，再换自己的接口。不要同时改页面逻辑和接口地址，两个变量一起变，出问题就分不清是谁的错。

## 19. 延伸阅读

按顺序读，不要跳着读，每一篇都是下一篇的前置知识：

1. 本指南 HTML 篇第 1 篇：文档结构、文本标签、语义化布局——看不懂页面结构就写不好 DOM 操作。
2. 本指南 HTML 篇第 2 篇：表单、表格、媒体——表单的 `name`、`required`、提交行为是本篇表单事件的前置知识。
3. 本指南 CSS 篇第 1 篇：基础语法与选择器——`querySelector` 用的就是 CSS 选择器写法。
4. 本指南 JS 篇第 1 篇（JS-01）：变量、类型、函数、对象、数组——本篇默认你已经会这些，不再重复讲。
5. 下一篇 JS-03 TypeScript：给本篇的取数据函数加上类型，接口返回的数据结构不再靠猜。
6. 再往后的 JS-04 前端工程化：本篇的手工拆分只是起点，文件一多就要用 Vite、ESLint、Prettier 来管，那时再学构建工具。

## 20. 相关章节链接

- 规划文件：[MASTER_PLAN.md](../MASTER_PLAN.md)、[TASK_INDEX.md](../TASK_INDEX.md)、[ROADMAP.md](../ROADMAP.md)
- HTML 基础：[HTML 01 基础与语义化](../html/01-basics.md)、[HTML 02 表单、表格、媒体](../html/02-forms-tables-media.md)
- CSS 基础：[CSS-01 基础语法与选择器](../css/01-basics.md)
- 下一篇：[JS-03 TypeScript](./03-typescript.md)
