# FE-03：Angular 完整教程

> 任务编号：FE-03（网站建设与部署实战指南 · 前端框架第 3 篇）
> 上一篇：[FE-02 React](./02-react.md)；下一篇：[FE-04 Svelte](./04-svelte.md)。
> 本篇只讲 Angular：TypeScript 基础用法、模块与独立组件、服务与依赖注入、路由、响应式表单，以及一个含服务和路由的完整实战。不讲 Vue、React、Svelte，那些是 FE-01、FE-02、FE-04 的范围。

## 1. 本章目标

读完并动手做完本篇，你能：

1. 说清楚 Angular 是什么、它和 AngularJS（1.x）是什么关系；
2. 用 Angular CLI 建一个能跑起来的项目，说清每个目录是干什么的；
3. 写出独立组件，知道组件、模板、样式三者怎么分工；
4. 写一个服务，用依赖注入在组件之间共享数据；
5. 配出带参数的路由，在列表页和详情页之间跳转；
6. 用响应式表单做一个能校验、能提交的表单；
7. 跑通“开发服务器预览 → 生产构建 → 部署静态产物”的完整流程；
8. 判断一个项目适不适合用 Angular，而不是只凭听说选框架。

## 2. 适用人群

- 已经会写 JavaScript 和 TypeScript，能写函数、对象、数组，知道什么是异步和模块的人；
- 写过 JS-01、JS-02、JS-03 的读者最佳：本篇默认你已经会 TypeScript 的类型、接口和泛型；
- 准备接手别人用 Angular 写的项目，想先把组件、服务、路由这一套概念过一遍的人；
- 想做后台管理系统、数据录入系统、企业内部工具的人：这类“页面多、表单多、逻辑重”的项目最适合 Angular；
- 不适合完全零基础的人：如果你还分不清变量、函数、对象，建议先学 JS-01、JS-02、JS-03 再回来看本篇；
- 不适合只想快速做一个静态展示页的人：那种需求用 HTML + CSS（WEB-01 到 CSS-16）或轻量框架更快，Angular 反而重。

## 3. 适用系统和版本

- 操作系统：Windows、macOS、Linux 都可以，本篇不依赖任何服务器系统。
- Angular 版本：**22.2.4（22 线），核查日期 2026-11-03**。核查说明：22 大版本于 2026-06-03 发布，之后按新发布节奏每年出一个大版本，下一个大版本 23 预计在 2027 年 6 月左右；22 线的支持期约为 24 个月；核查时多个公开版本追踪来源一致指向 22.2.4 为最新稳定补丁版本（2026-10-29 发布）。安装时请以官网和 npm 当场查到的号为准，不要只信本篇写死的号，新建项目时 CLI 默认装的就是当时的最新稳定版。
- Angular 与 AngularJS 的区别，必须先讲清：AngularJS 是 1.x 那个老框架，已经停止维护；现代 Angular（2 版起，含本篇的 22 版）是重写后的框架，两者名字像、写法完全不同。本篇只讲现代 Angular，不要把 AngularJS 的教程套到现代 Angular 上。
- Node.js：以 Angular 官网兼容表为准。核查时 22 线要求较新的 LTS（22、24、26 线），装项目之前先用 `node -v` 核对，版本不对先升级 Node，不要硬装。
- TypeScript：Angular 22 线的编译器对应 TypeScript 6 线，装包时以 `ng new` 生成的版本为准，不要手动升到更新的 TypeScript 大版本，否则编译器可能报错。这一点和 JS-03 讲的通用 TypeScript 最新版不是一回事：框架用的 TypeScript 版本以框架的兼容表为准。
- 编辑器：VS Code 体验最好（装 Angular Language Service 插件后，模板里的变量名写错也能标红），其他编辑器只要能装 Angular 插件也可以。
- 浏览器：Chrome、Edge、Firefox、Safari 的现代版本即可；开发时用浏览器的开发者工具看控制台报错。

## 4. 使用前提

- 会写 JavaScript：变量、函数、对象、数组、条件、循环都会用，知道 `undefined` 和 `null` 不是同一个东西。
- 会写 TypeScript：类型标注、接口、泛型、类都会用，不会在看到 `private`、`inject`、`Observable` 时卡住。不会的先看 JS-03。
- 知道怎么在命令行进目录、怎么用 `node -v`、`npm -v` 看版本；知道 `npm install` 是装依赖，`npm run` 是跑 `package.json` 里写好的脚本。
- 有一台能装 Node.js 的电脑；本篇不需要服务器、不需要域名、不需要备案，开发服务器跑在本机。
- 心态前提：Angular 是“重框架”，规矩多、概念多，学起来比只写 HTML + JS 慢，但换来的是大型项目里不容易写乱。不要指望一小时速成，先把组件、服务、路由这三个概念走通。

## 5. 所需资源

| 资源 | 用途 | 获取方式 |
| --- | --- | --- |
| Node.js（较新 LTS） | 跑 Angular CLI 和开发服务器 | 官网下载安装包，或用版本管理工具装 |
| npm | 装 Angular CLI 和项目依赖，随 Node.js 一起装 | 装好 Node 后就有 |
| Angular CLI（`@angular/cli`） | 建项目、生成组件和服务、跑开发服务器、做生产构建 | `npm install -g @angular/cli` |
| VS Code + Angular Language Service 插件 | 写代码、模板报错标红 | 编辑器插件市场搜索安装 |
| 浏览器 | 打开开发服务器的页面、看控制台 | Chrome、Edge、Firefox、Safari 任选 |
| 一个空文件夹 | 放新建的项目，例如 `angular-shop` | 自己建，不用提前放任何文件 |

说明：全局装 CLI 只需要做一次，装好后 `ng` 命令在任何目录都能用。项目依赖（`@angular/core` 等）是每个项目单独装的，不会互相干扰。

## 6. 技术原理

Angular 的核心可以浓缩成六个概念，记住这六个，后面所有写法都有落点：

1. **组件（Component）**：页面由一个个组件拼成。每个组件 = 一个 TypeScript 类 + 一个模板（HTML）+ 一份样式（CSS）。类里放数据和方法，模板里写页面结构，样式只对这个组件生效（默认是样式隔离，不会漏到别的组件上）。
2. **模板与绑定**：模板不是静态 HTML，里面可以写绑定。`{{ 变量 }}` 是插值，把数据展示出来；`[属性]="表达式"` 是属性绑定，数据变了页面跟着变；`(事件)="方法()"` 是事件绑定，点按钮就执行方法；`[(ngModel)]` 是双向绑定（本篇实战用响应式表单，不用它，只在这里提一句让读者认得）。
3. **指令（Directive）**：写在标签上的特殊标记。现代 Angular 推荐用内置的控制流语法：`@if` 做条件显示，`@for` 做列表循环，`@else` 做否则分支。老写法 `*ngIf`、`*ngFor` 也还能用，但新项目建议用 `@if`、`@for`。
4. **服务与依赖注入（Service + DI）**：组件只管“显示和交互”，数据和业务逻辑放进服务。服务用 `@Injectable` 装饰，组件通过构造函数或 `inject()` 函数拿到服务实例，不用自己 `new`。同一个服务在整个应用里默认是单例，多个组件共享同一份数据，改一处、处处同步。
5. **路由（Router）**：单页应用里“换页”不是真的跳新 HTML，而是路由把 URL 映射到组件。`/` 显示列表，`/products/2` 显示编号 2 的商品详情，`/products/new` 显示新增表单。路由表写在一个 `Routes` 数组里，集中管理。
6. **信号（Signal）**：Angular 现代的响应式原语。`signal(初始值)` 建一个信号，模板里 `products()` 这样调用它取值，信号值变了，模板自动更新。比起老式的 `Observable` + 手动订阅，信号在“组件内部状态”这个场景下写法更短。本篇实战的商品列表就用信号存，服务改了信号，列表页自动刷新。

补充两个容易混的概念：

- **模块（NgModule）与独立组件（Standalone）**：老 Angular 用 `NgModule` 把组件、指令、服务打包成模块，新项目默认用独立组件，组件自己在 `@Component` 的 `imports` 里声明它依赖什么，不用再包一层模块。本篇全部用独立组件，只在第 15 节提一句老项目里见到 `NgModule` 时该怎么认。
- **变更检测**：数据变了，Angular 要知道页面哪部分要重画。默认机制会检查组件树；现代写法多用信号加 `OnPush` 策略，让检查范围变小、页面更快。初学者不用先深究机制，只要记住“改信号、改绑定到的数据，页面就会更新；直接改一个 Angular 不知道的对象，页面可能不更新”这一条就够。

## 7. 架构说明

一个 `ng new` 建出来的项目长这样（只列本篇用到的部分，完整文件在第 10、11 节）：

```text
angular-shop/
  package.json
  tsconfig.json
  angular.json
  src/
    main.ts
    index.html
    styles.css
    app/
      app.component.ts
      app.config.ts
      app.routes.ts
      models/
        product.ts
      services/
        product.service.ts
      components/
        product-list/
          product-list.component.ts
          product-list.component.html
        product-detail/
          product-detail.component.ts
          product-detail.component.html
        product-form/
          product-form.component.ts
          product-form.component.html
```

数据流向是单向的，画成一句话就是：

```text
用户操作（点按钮、填表单、点链接）
  → 组件方法（改信号、调服务、跳路由）
    → 服务（改数据、算结果）
      → 信号值变化
        → 模板自动重画
```

举三个例子帮你把这条线走通：

- 点“删除”按钮 → 列表组件调 `service.removeProduct(id)` → 服务把信号里的那条数据去掉 → 列表模板自动少一行，不用手动操作 DOM。
- 点商品名 → 路由跳到 `/products/2` → 详情组件从路由参数里拿到 `2` → 问服务要编号 2 的商品 → 模板显示详情。
- 填完新增表单点提交 → 表单组件先校验（必填、价格大于 0）→ 校验通过才调 `service.addProduct()` → 服务把新商品推进信号 → 路由跳回列表页，新商品已经在列表里。

## 8. 操作前检查

动手之前先跑下面这组命令，全部通过再往下走，任何一项不通过都先修好，不要带着报错往下建项目：

| 检查项 | 命令 | 通过的样子 |
| --- | --- | --- |
| Node.js 已装且版本较新 | `node -v` | 输出 `v22.x.x`、`v24.x.x` 或 `v26.x.x` 这一类较新 LTS |
| npm 可用 | `npm -v` | 输出一个版本号，例如 `11.x.x` |
| Angular CLI 已装 | `ng version` | 输出 Angular CLI、Node、Package Manager 等信息 |
| 能联网装包 | `npm ping` | 输出成功提示（公司内网或离线环境会失败，见第 16 节） |
| 有空文件夹 | 自己建一个，例如 `angular-shop` 的父目录 | 目录存在、里面是空的 |

如果 `ng` 命令找不到，说明 CLI 没装或没装到全局路径，先跑 `npm install -g @angular/cli` 再重查。如果 Node 版本太旧，先升级 Node，不要用旧 Node 硬建新项目，装包阶段会报一堆看不懂的错。

## 9. 逐步操作

下面是完整流程，每一步都有“做完怎么确认”，不要跳步：

1. **建项目**：在空文件夹的父目录跑 `ng new angular-shop --standalone --routing --style=css`。三个选项的意思：`--standalone` 用独立组件（现代默认写法），`--routing` 带上路由，`--style=css` 用普通 CSS 写样式。确认：目录里出现 `package.json`、`angular.json`、`src`。
2. **进目录、装依赖**：`cd angular-shop`，`npm install`。确认：出现 `node_modules` 目录，命令最后没有 `ERR`。
3. **先跑起来看一眼**：`ng serve`，打开浏览器访问 `http://localhost:4200`，能看到 CLI 生成的欢迎页。确认：页面能打开、终端没有红字报错。先看一眼再改代码，后面出问题就知道是自己改出来的。
4. **生成模型和服务**：`ng generate interface models/product --type=model` 生成模型文件位置思路（也可以手工建文件，效果一样），再手工写 `src/app/services/product.service.ts`。确认：服务文件里有 `@Injectable` 和商品数据的信号。
5. **生成三个组件**：分别生成列表、详情、表单组件（`ng generate component components/product-list` 等，或手工建文件）。确认：每个组件都有 `.ts` 和 `.html` 两个文件，`.ts` 里 `standalone: true`。
6. **写路由表**：在 `src/app/app.routes.ts` 里写三条路由：空路径跳列表，`products/new` 是新增，`products/:id` 是详情。确认：路由表里没有拼错的路径，`:id` 前面有冒号。
7. **接通根组件**：根组件模板里放 `<router-outlet></router-outlet>`，这是路由显示页面的出口，没有它路由跳了页面也不会变。确认：根组件的 `imports` 里有 `RouterOutlet`。
8. **写表单**：表单组件用响应式表单，`FormGroup` 里放名称、价格、库存三个控件，加必填和大于 0 的校验。确认：空表单点提交时页面显示校验提示，而不是直接提交。
9. **再跑一遍全流程**：`ng serve`，依次点列表、详情、新增、提交、删除，每个动作都在浏览器里亲手点一遍。确认：第 14 节的五条全部通过。
10. **生产构建**：`ng build`，确认 `dist/angular-shop/browser` 里出现 `index.html` 和打包后的 JS 文件。这一步的产物就是可以部署的静态文件，部署方法见第 14 节最后一条。

## 10. 完整代码

实战题目：**商品清单**。一个小卖部的商品管理页：列表页看全部商品，点商品名进详情页，点“新增商品”进表单页填完提交回列表，列表页能删除商品。数据存在服务里的信号中，不接后端，刷新页面会回到初始数据（这是有意为之，见第 17 节说明）。

### 文件 1：`src/app/models/product.ts`

```ts
export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}
```

### 文件 2：`src/app/services/product.service.ts`

```ts
import { Injectable, signal } from '@angular/core';
import { Product } from '../models/product';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private nextId = 4;

  readonly products = signal<Product[]>([
    { id: 1, name: '笔记本', price: 12, stock: 40 },
    { id: 2, name: '水杯', price: 25, stock: 18 },
    { id: 3, name: '雨伞', price: 49, stock: 9 }
  ]);

  getProduct(id: number): Product | undefined {
    return this.products().find(function (item) {
      return item.id === id;
    });
  }

  addProduct(name: string, price: number, stock: number): void {
    const created: Product = {
      id: this.nextId,
      name: name,
      price: price,
      stock: stock
    };
    this.nextId = this.nextId + 1;
    this.products.update(function (current) {
      return current.concat([created]);
    });
  }

  removeProduct(id: number): void {
    this.products.update(function (current) {
      return current.filter(function (item) {
        return item.id !== id;
      });
    });
  }
}
```

### 文件 3：`src/app/app.routes.ts`

```ts
import { Routes } from '@angular/router';
import { ProductListComponent } from './components/product-list/product-list.component';
import { ProductDetailComponent } from './components/product-detail/product-detail.component';
import { ProductFormComponent } from './components/product-form/product-form.component';

export const routes: Routes = [
  { path: '', redirectTo: 'products', pathMatch: 'full' },
  { path: 'products', component: ProductListComponent },
  { path: 'products/new', component: ProductFormComponent },
  { path: 'products/:id', component: ProductDetailComponent }
];
```

注意路由顺序：`products/new` 必须写在 `products/:id` 前面。因为 `:id` 是通配参数，写在前面的话，`new` 会被当成编号去查详情，永远进不了新增页。这是新手最容易踩的坑之一。

### 文件 4：`src/app/app.config.ts`

```ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
```

### 文件 5：`src/app/app.component.ts`

```ts
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.component.html'
})
export class AppComponent {
  title = '商品清单';
}
```

根组件的模板单独放一个文件，见文件 6。根组件本身不放业务逻辑，只放标题、导航和路由出口。

### 文件 6：`src/app/app.component.html`

```html
<header>
  <h1>商品清单</h1>
  <nav>
    <a routerLink="/products">全部商品</a>
    <a routerLink="/products/new">新增商品</a>
  </nav>
</header>
<main>
  <router-outlet></router-outlet>
</main>
```

### 文件 7：`src/app/components/product-list/product-list.component.ts`

```ts
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './product-list.component.html'
})
export class ProductListComponent {
  private service = inject(ProductService);

  readonly products = this.service.products;

  remove(id: number): void {
    const ok = window.confirm('确定要删除这件商品吗？');
    if (ok) {
      this.service.removeProduct(id);
    }
  }
}
```

### 文件 8：`src/app/components/product-list/product-list.component.html`

```html
<h2>全部商品</h2>
<p>共 {{ products().length }} 件商品。</p>
<table>
  <thead>
    <tr>
      <th>名称</th>
      <th>价格（元）</th>
      <th>库存</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody>
    @for (item of products(); track item.id) {
      <tr>
        <td>
          <a [routerLink]="['/products', item.id]">{{ item.name }}</a>
        </td>
        <td>{{ item.price }}</td>
        <td>{{ item.stock }}</td>
        <td>
          <button type="button" (click)="remove(item.id)">删除</button>
        </td>
      </tr>
    }
  </tbody>
</table>
```

### 文件 9：`src/app/components/product-detail/product-detail.component.ts`

```ts
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../../models/product';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './product-detail.component.html'
})
export class ProductDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(ProductService);

  product: Product | undefined;

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    const id = Number(raw);
    this.product = this.service.getProduct(id);
  }
}
```

### 文件 10：`src/app/components/product-detail/product-detail.component.html`

```html
<h2>商品详情</h2>
@if (product) {
  <dl>
    <dt>名称</dt>
    <dd>{{ product.name }}</dd>
    <dt>价格</dt>
    <dd>{{ product.price }} 元</dd>
    <dt>库存</dt>
    <dd>{{ product.stock }} 件</dd>
  </dl>
} @else {
  <p>没有找到这件商品，请返回列表重新选择。</p>
}
<p>
  <a routerLink="/products">返回全部商品</a>
</p>
```

### 文件 11：`src/app/components/product-form/product-form.component.ts`

```ts
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './product-form.component.html'
})
export class ProductFormComponent {
  private service = inject(ProductService);
  private router = inject(Router);

  form = new FormGroup({
    name: new FormControl('', [Validators.required]),
    price: new FormControl(0, [Validators.required, Validators.min(1)]),
    stock: new FormControl(0, [Validators.required, Validators.min(0)])
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.value;
    this.service.addProduct(value.name as string, value.price as number, value.stock as number);
    this.router.navigate(['/products']);
  }
}
```

### 文件 12：`src/app/components/product-form/product-form.component.html`

```html
<h2>新增商品</h2>
<form [formGroup]="form" (ngSubmit)="submit()">
  <p>
    <label for="product-name">名称</label>
    <input id="product-name" type="text" formControlName="name">
  </p>
  @if (form.get('name')?.touched && form.get('name')?.invalid) {
    <p>名称是必填的。</p>
  }
  <p>
    <label for="product-price">价格（元）</label>
    <input id="product-price" type="number" formControlName="price">
  </p>
  @if (form.get('price')?.touched && form.get('price')?.invalid) {
    <p>价格是必填的，且必须大于 0。</p>
  }
  <p>
    <label for="product-stock">库存（件）</label>
    <input id="product-stock" type="number" formControlName="stock">
  </p>
  @if (form.get('stock')?.touched && form.get('stock')?.invalid) {
    <p>库存是必填的，且不能小于 0。</p>
  }
  <p>
    <button type="submit">提交</button>
  </p>
</form>
```

### 文件 13：`src/main.ts`

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch(function (err) {
  console.error(err);
});
```

### 文件 14：`src/index.html`

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>商品清单</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

注意 `<base href="/">` 这一行：路由要靠它算 URL，删掉它路由会乱。`ng new` 生成的文件里自带这一行，改代码时不要误删。

## 11. 完整配置文件

### 文件：`package.json`（项目根目录）

```json
{
  "name": "angular-shop",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "test": "ng test"
  },
  "dependencies": {
    "@angular/common": "^22.2.0",
    "@angular/compiler": "^22.2.0",
    "@angular/core": "^22.2.0",
    "@angular/forms": "^22.2.0",
    "@angular/platform-browser": "^22.2.0",
    "@angular/router": "^22.2.0",
    "rxjs": "^7.8.0",
    "tslib": "^2.3.0"
  },
  "devDependencies": {
    "@angular/build": "^22.2.0",
    "@angular/cli": "^22.2.0",
    "@angular/compiler-cli": "^22.2.0",
    "typescript": "~6.0.0"
  }
}
```

版本号说明：`^22.2.0` 的意思是“装 22.2.x 或更新的 22 大版本补丁，不要跨到 23”，装包时以当场查到的 22 线最新补丁为准，不要手动把 `^22.2.0` 改成 `^23.0.0`。TypeScript 用 `~6.0.0` 是因为 Angular 22 线的编译器对应 TypeScript 6 线，见第 3 节。

### 文件：`tsconfig.json`（项目根目录）

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "outDir": "./dist/out-tsc",
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "declaration": false,
    "experimentalDecorators": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "target": "ES2022",
    "module": "ES2022",
    "useDefineForClassFields": false,
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

### 文件：`tsconfig.app.json`（项目根目录）

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/app",
    "types": []
  },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"]
}
```

### 文件：`angular.json`（项目根目录）

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "angular-shop": {
      "projectType": "application",
      "schematics": {},
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "options": {
            "outputPath": "dist/angular-shop",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "assets": ["src/favicon.ico", "src/assets"],
            "styles": ["src/styles.css"],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kB",
                  "maximumError": "1MB"
                }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular/build:dev-server",
          "configurations": {
            "production": {
              "buildTarget": "angular-shop:build:production"
            },
            "development": {
              "buildTarget": "angular-shop:build:development"
            }
          },
          "defaultConfiguration": "development"
        },
        "test": {
          "builder": "@angular/build:karma",
          "options": {
            "tsConfig": "tsconfig.spec.json",
            "polyfills": ["zone.js", "zone.js/testing"]
          }
        }
      }
    }
  }
}
```

### 文件：`src/styles.css`（项目根目录下的 src 目录）

```css
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 16px;
}

table {
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #999999;
  padding: 6px 10px;
  text-align: left;
}
```

## 12. 每个关键配置项的解释

### `package.json` 关键项

| 项 | 意思 |
| --- | --- |
| `private: true` | 这个包不发布到 npm，防止误操作把公司项目推到公开仓库 |
| `scripts.start` | `npm start` 就是跑 `ng serve`，启动开发服务器 |
| `scripts.build` | `npm run build` 就是跑 `ng build`，做生产构建 |
| `@angular/core` 等 | 框架本身的包，版本号要和 CLI 保持同一大版本，不要混装 21 和 22 |
| `@angular/router` | 路由功能，没有它路由表和 `routerLink` 都用不了 |
| `@angular/forms` | 表单功能，本篇响应式表单就靠它 |
| `rxjs` | Angular 内部用的响应式库，服务里如果用 `Observable` 也靠它 |
| `typescript` | 只在开发和构建时用，不会打进给用户下载的 JS 里 |

### `tsconfig.json` 关键项

| 项 | 意思 |
| --- | --- |
| `strict: true` | 严格模式总开关，空值、隐式 `any` 都会报错，新项目建议一直开着 |
| `experimentalDecorators: true` | 允许 `@Component`、`@Injectable` 这种装饰器写法，Angular 必备 |
| `strictTemplates: true` | 模板也要类型检查，模板里写错变量名会在构建时报错，而不是等到运行时 |
| `target` / `module` | 编译出来的 JS 用哪一代语法和模块格式，`ES2022` 是现代浏览器的常用选择 |
| `skipLibCheck: true` | 跳过第三方库声明文件的类型检查，省时间、少误报 |

### `angular.json` 关键项

| 项 | 意思 |
| --- | --- |
| `outputPath` | 生产构建产物放哪里，本篇是 `dist/angular-shop` |
| `index` / `browser` | 入口 HTML 和入口 TS 文件，构建从这两个文件开始找依赖 |
| `polyfills` | 兼容性垫片，`zone.js` 是 Angular 默认变更检测机制要用的 |
| `budgets` | 包体积预算，超了会警告或报错，防止不知不觉把首屏 JS 写得巨大 |
| `outputHashing` | 生产构建给文件名加哈希，改了代码用户下次访问就不会读到旧缓存 |
| `defaultConfiguration` | 不指定配置时默认用哪一套，构建默认生产、开发服务器默认开发 |

## 13. 执行结果示例

开发服务器跑起来后，终端里会看到类似下面的输出（端口号和耗时每次可能不同，这是正常的）：

```text
Initial chunk files   | Names         |  Raw size
main.js               | main          |  250.00 kB
styles.css            | styles        |   2.00 kB

Application bundle generation complete.
Watch mode enabled. Watching for file changes.
Local:   http://localhost:4200/
```

打开 `http://localhost:4200`，页面应该是这样：

- 顶部标题“商品清单”，下面有“全部商品”和“新增商品”两个链接；
- 列表页表格里有 3 行：笔记本 12 元库存 40、水杯 25 元库存 18、雨伞 49 元库存 9，顶部写“共 3 件商品”；
- 点“水杯”进详情页，显示名称、价格、库存和“返回全部商品”；
- 点“新增商品”，填名称“毛巾”、价格 15、库存 20，点提交后回到列表，顶部变成“共 4 件商品”，表格最后一行是毛巾；
- 在列表页点某行的“删除”，确认后那一行消失，件数减 1。

生产构建的输出类似这样：

```text
Initial chunk files   | Names         |  Raw size
main-ABC123.js        | main          | 120.00 kB
styles-DEF456.css     | styles        |   1.00 kB
```

文件名后面的哈希每次构建都可能变，这是 `outputHashing` 在起作用，不要手动改名。

## 14. 成功验证

下面五条要在你自己的机器上亲手跑通，本篇写作时没有在本机跑 `npm install`、`ng serve`、`ng build`，所以这五条是给读者的验证步骤，不是本篇作者已经跑通过的构建结果：

1. **开发服务器能打开**：`ng serve` 后打开 `http://localhost:4200`，能看到标题和 3 件商品，终端没有红字报错。
2. **路由三条都通**：点商品名进详情、点“新增商品”进表单、点“返回全部商品”回列表，地址栏分别是 `/products/2`、`products/new`、`/products` 这一类，刷新详情页后内容还在（开发服务器下刷新会重新加载应用，再按路由显示详情，这是正常的）。
3. **新增流程通**：空表单点提交时页面显示校验提示，不跳转；填好提交后回列表，件数加 1，新商品在表格里。
4. **删除流程通**：点删除、点确认后行消失，件数减 1；刷新页面后数据恢复成初始 3 件（因为数据只在内存信号里，刷新会重置，这正是本篇有意为之的设计，见第 17 节）。
5. **生产构建通**：`ng build` 成功，`dist/angular-shop/browser` 里有 `index.html` 和带哈希的 JS 文件。把这个 `browser` 目录里的文件放到任何静态服务器（Nginx、对象存储静态托管都行）根目录，就能直接打开；注意单页应用的路由要配“找不到的路径都回 `index.html`”，否则直接刷新 `/products/2` 会 404，具体配法看你用的服务器文档，本篇不展开。

## 15. 常见错误

| 现象 | 原因 | 办法 |
| --- | --- | --- |
| `ng` 命令找不到 | CLI 没装或没装到全局路径 | 跑 `npm install -g @angular/cli`，重开终端再试 |
| `npm install` 报版本冲突 | Node 太旧，或手动改了某个 Angular 包的大版本 | 先升级 Node，再删 `node_modules` 和 `package-lock.json` 重装，不要只改一个包的版本 |
| 页面空白，控制台报 `NullInjectorError` | 某个服务没加 `@Injectable`，或组件没用 `inject()` 拿到服务 | 检查服务文件有没有 `@Injectable({ providedIn: 'root' })`，组件里是不是用 `inject(服务类)` |
| 路由跳了页面没变 | 根组件模板里没有 `<router-outlet>` | 在根组件模板里加上 `<router-outlet></router-outlet>`，并确认 `imports` 里有 `RouterOutlet` |
| 点“新增商品”进了详情页 | 路由顺序错了，`products/:id` 写在 `products/new` 前面 | 把 `products/new` 移到 `products/:id` 前面，见第 10 节文件 3 的注释 |
| 表单控件报错 `formControlName` 找不到 | 表单组件没导入 `ReactiveFormsModule`，或控件名和 `FormGroup` 里的键对不上 | 组件 `imports` 里加 `ReactiveFormsModule`，逐个核对模板里的 `formControlName` 和 `FormGroup` 的键 |
| 模板里变量名标红或构建报模板类型错 | `strictTemplates` 开着，模板变量名写错或类型不对 | 按报错行改模板或改组件里的变量名，不要为了消错关掉 `strictTemplates` |
| 老项目里看到 `NgModule` 不知道是什么 | 那是 Angular 老的模块写法 | 认得就行：模块是把组件打包的旧方式，新项目用独立组件，不用把老项目全改成独立组件也能跑 |
| 构建报包体积超预算 | 首屏 JS 太大 | 先看构建输出里最大的文件是哪个，再决定是拆路由懒加载还是换更小的库，不要直接把预算数字改大糊弄过去 |

## 16. 故障排查

按下面这个顺序查，不要一上来就删目录重装：

1. **先看终端和浏览器控制台的第一条红字**：Angular 的报错通常第一条就是根因，后面的红字大多是连锁反应。先修第一条，再重新跑。
2. **确认改的是哪个文件**：组件改了 `.ts` 没改 `.html`、路由改了表没改链接，都是常见漏改。对照第 10 节的文件清单，逐个确认。
3. **确认导入齐了没有**：独立组件的坑九成在 `imports`：用了 `RouterLink` 就要在组件 `imports` 里加 `RouterLink`，用了响应式表单就要加 `ReactiveFormsModule`，用了 `@for` 不用额外导入（它是内置语法）。
4. **确认服务是不是单例**：如果两个组件里的数据对不上，先查服务是不是 `providedIn: 'root'`，是不是有人在某个组件的 `providers` 里又单独提供了一份服务，导致各用各的数据。
5. **确认路由参数类型**：路由参数永远是字符串，`Number(raw)` 这一步不能省；直接拿字符串和数字 `id` 比大小，永远找不到商品，详情页会一直显示“没有找到”。
6. **网络问题**：`npm install` 很慢或失败时，先看是不是公司内网、代理或镜像问题，换镜像源或等网络恢复再试，不要反复删 `node_modules`。
7. **还不行就最小化复现**：新建一个空项目，只放出问题的那一个组件和路由，能复现就说明问题在组件本身，不能复现就说明问题在原项目的某个配置里，再逐个把配置加回去比对。

## 17. 安全注意事项

- **前端代码用户全看得到**：不要把密码、密钥、数据库连接串写进组件、服务或配置文件。需要密钥的逻辑放后端，前端只拿后端给的结果。
- **插值默认会转义**：`{{ 变量 }}` 显示用户输入时，Angular 会把 HTML 标签转义成文本，这是防 XSS 的第一道防线。不要为了“显示富文本”就绕过它去直接插 HTML，除非你已经确认内容来源可信并做了清洗。
- **表单校验要前后端各做一遍**：前端校验是为了用户体验，后端必须再校验一次，因为前端校验可以被绕过。本篇实战没有后端，所以只做了前端校验，真实项目里后端校验不能省。
- **依赖要定期更新**：`npm audit` 能看到已知漏洞，定期跑、定期升。Angular 大版本一年一更，升级前先看官方升级指南，不要直接改 `package.json` 里的版本号就装。
- **生产构建不要开调试信息**：`ng build` 默认是生产配置，`sourceMap` 是关的，不要为了调试方便在生产配置里打开它，也不要把开发服务器（`ng serve`）直接暴露到公网。
- **刷新会丢数据是设计，不是漏洞**：本篇数据只在内存信号里，刷新就重置。真实项目要把数据存后端或浏览器存储，存浏览器存储时敏感数据要加密、不要明文存令牌。

## 18. 回滚和恢复

- **代码改坏了**：如果项目已经用 Git 管理，先 `git status` 看改了哪些文件，再 `git diff` 看具体改动，只还原改坏的那一个文件，不要整仓还原。没用 Git 的话，从现在开始建一个，`git init` 后先提交一次能跑的版本再改。
- **依赖装坏了**：删 `node_modules` 和 `package-lock.json`，再跑一次 `npm install`。只删 `node_modules` 不删锁文件时，版本还是锁定的那一套；两个都删才会重新解析版本，升级前先备份锁文件。
- **Angular 升版升坏了**：不要直接改 `package.json` 里的版本号硬升。正确做法是按官方升级指南跑 `ng update`，一次升一个大版本，升完跑通第 14 节的五条再升下一个。升坏了就用 Git 回到升级前的提交。
- **路由或表单改乱了**：回到第 10 节的文件清单，逐个文件对照：路由表顺序、根组件的 `<router-outlet>`、表单组件的 `ReactiveFormsModule` 导入，这三处是最高频的改乱点。
- **构建产物坏了**：`dist` 目录是生成的，删掉重跑 `ng build` 就行，不要手动改 `dist` 里的文件，改了下次构建也会被覆盖。

## 19. 延伸阅读

- Angular 官网文档（angular.dev）：从教程、组件、信号、路由、表单到部署的完整官方文档，遇到本篇没讲的 API 先查这里。
- [Angular 版本与发布说明](https://Angular.dev/reference/releases)：大版本一年一更、支持期约 24 个月的官方发布节奏，升版前先看这张表。
- JS-03 TypeScript：本篇用到的类型、接口、泛型都在那里讲透了，Angular 代码里的类型问题先回 JS-03 查。
- JS-04 前端工程化：`package.json`、构建、ESLint、Prettier 的通用做法，本篇第 11、12 节只讲了 Angular 这一套里的对应项。
- Angular CLI 官方文档：`ng new`、`ng generate`、`ng serve`、`ng build`、`ng update` 每个命令的全部选项，命令行跑 `ng help` 也能看到简版。

## 20. 相关章节链接

- JavaScript 基础：[JS-01 JavaScript 基础完整教程](../javascript/01-basics.md)
- DOM 与异步：[JS-02 DOM、事件、异步完整教程](../javascript/02-dom-async.md)
- TypeScript：[JS-03 TypeScript 完整教程](../javascript/03-typescript.md)
- 前端工程化：[JS-04 npm、pnpm、Vite、前端工程化完整教程](../javascript/04-tooling.md)
- 建站指南总计划：[MASTER_PLAN.md](../MASTER_PLAN.md)
- 任务索引：[TASK_INDEX.md](../TASK_INDEX.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 下一篇：[FE-04 Svelte](./04-svelte.md)
