---
description: "单元测试设计与测试替身：AAA 结构、边界与参数化写法，以及 dummy、stub、spy、mock、fake 五种替身的区别与选用。"
---

# 单元测试与测试替身

> 分工说明：本篇不重复[调试与测试方法](03-debugging-testing.md)已讲的内容——调试循环（复现、缩小、验证）、测试金字塔（单元、集成、端到端各管什么）、“替身什么时候用”只在该篇。本篇只深入两件事：单元测试本身怎么写得好，以及五种测试替身各自是什么、怎么选。读本篇前建议先读 03 篇。

## 1. 一句话定义

单元测试是针对最小可测单位（通常是一个函数或一个类的方法）编写的可重复检查：给定固定输入，断言固定输出或固定行为；测试替身是在测试中代替真实依赖的 stand-in，让被测代码在隔离、可控的条件下运行。

## 2. 为什么需要它

一个函数如果只能靠“跑起来看看”验证，每次验证都要凑齐真实依赖（数据库、网络、文件、时钟），又慢又不稳定。单元测试把验证变成毫秒级、可重复的检查：改动代码后一键重跑，就知道有没有把旧行为改坏。写测试的过程本身也有设计价值：一个函数如果很难写测试，往往是职责不清、依赖太多、输入输出不明确的信号——先把测试写清楚，常常等于先把接口想清楚。

但单元测试不是万能的：它只能证明“测过的场景是对的”，没测的场景仍然未知；替身用得越多，测试离真实行为越远。这一点 03 篇已讲过，本篇不再展开，只在选用替身时作为红线。

## 3. 核心含义

### 3.1 单元测试设计：AAA 结构

一个可读的单元测试通常分三段，俗称 AAA：

- **Arrange（准备）**：构造输入、替身、初始状态。
- **Act（执行）**：调用一次被测行为，只调用一次——一次测试只验证一个行为。
- **Assert（断言）**：断言结果或行为，断言要具体（“等于 80.0”），不要断言“大概对”。

三段之间用空行分开，读测试的人一眼就能看出“测的是什么”。一个测试里塞多个 Act、多个不相关的断言，是最常见的可读性杀手：失败时不知道是哪一个行为坏了。

### 3.2 边界：最容易漏的测试

函数逻辑最容易在边界处出错，选测试用例时要刻意覆盖：

- **区间的两端**：最小值、最大值，例如折扣率 0（不打折）和 1（全免）。
- **区间外一格**：刚好非法的值，例如折扣率 1.5、价格为负数，应触发预期的异常，而不是返回含糊结果。
- **特殊值**：0、空字符串、空列表、None（如果函数接受它）。
- **舍入与精度**：涉及浮点与金额时，要测舍入边界，例如 99.99 打九折是 89.99 还是 89.991。
- **等价类**：把输入按“走同一条分支”分组，每组至少取一个代表；边界值单独取，不要只测“中间很舒服的值”。

边界用例不是越多越好：每条边界对应一个“如果这里错了，线上会怎样”的理由；没有理由的用例，只是让测试套件变慢。

### 3.3 参数化：同一逻辑，多个输入

同一段逻辑要测多组输入时，不要把同一段断言复制十遍。标准库 `unittest` 提供 `subTest()` 上下文管理器：把多组输入写成数据表，循环里每个输入包一个 `subTest`。它的关键性质是：**某个子测试失败时，循环会继续跑完其余输入**，并在报告里标出是哪组参数失败的——比“第一个失败就中断的裸循环”定位快得多。注意：`setUp`/`tearDown` 是每个 `test_*` 方法跑一次，不是每个 `subTest` 跑一次；需要每个参数都隔离准备/清理时，改用独立的测试方法。

`pytest` 另有内置的 `@pytest.mark.parametrize` 装饰器（生成独立的测试用例），但本机未安装 pytest，本篇未实测，见文末未完成项。

### 3.4 测试替身：分类按“用法”分，不是按“类”分

先说清一个容易误解的前提：**dummy、stub、spy、mock、fake 是五种角色，不对应 Python 里的五个类**。`unittest.mock` 的 `Mock`/`MagicMock` 可以扮演其中多种角色，分类依据是“它在测试里干什么、测试断言什么”，而不是“它是用哪个类创建的”。不同资料对这五个词的定义略有出入（例如 spy 算不算 mock 的一种），本篇采用 Gerard Meszaros 的五分法、经 Martin Fowler《Mocks Aren't Stubs》普及的版本；按这个版本，核心分界只有一条：**状态验证还是行为验证**。

- **状态验证**：跑完被测代码，检查结果或事后状态（返回值、对象状态）。stub 和 fake 服务于这种验证。
- **行为验证**：检查被测代码有没有按预期调用依赖（调了几次、参数是什么）。spy 和 mock 服务于这种验证。

## 4. 分类：五种替身的区别与选用

| 替身 | 它干什么 | 测试断言什么 | 典型例子 | 选用时机 |
|---|---|---|---|---|
| Dummy（哑元） | 只占位，测试路径上从未被调用 | 什么都不断言 | 满足签名的日志参数、未使用的上下文对象 | 参数必填，但这条测试路径根本用不到它 |
| Stub（桩） | 返回预先编好的固定答案（canned answer），不关心调用过程 | 被测代码的返回值/结果 | 查天气永远返回“晴天”；查用户永远返回固定用户 | 只需要控制依赖的返回值，走某条分支 |
| Spy（间谍） | 在 stub 的基础上记录调用过程；或包裹真实对象，真实行为照常执行、只记录 | 事后检查调用记录（次数、参数、顺序） | 包裹真实列表的 `append`，既真执行又记录 | 真实行为必须跑，但又要确认“确实被调用了” |
| Mock（模拟） | 预先编好“期望收到的调用”，并自行校验期望是否达成 | 交互本身（`assert_called_once_with` 等） | 断言“支付接口恰好被调用一次，参数是订单 42” | 被测行为就是“发出这次调用”（如发通知、扣款），返回值说明不了问题 |
| Fake（伪造） | 有真正能跑的简化实现，只是走了不适合生产的捷径 | 事后状态（存进去能不能查出来） | 内存版数据库：能增删查，但不落盘 | 需要依赖的真实行为（多步读写、状态变化），但固定答案不够用 |

选用决策按顺序问三个问题：

1. **真实依赖能不能直接用？** 能用就用真实依赖，不要替身（03 篇的原则）。
2. **只需要一个固定答案吗？** 是 → stub；最简单，优先选。
3. **需要多步真实行为吗？** 是 → fake；fake 比一堆 stub 拼出来的行为更接近真实。
4. **要验证的到底是结果还是调用？** 结果 → stub/fake（状态验证）；调用本身 → spy/mock（行为验证）。spy 与 mock 的差别在“谁来断言”：spy 只记录、由测试事后断言；mock 自带期望、期望未达成时测试直接失败。在 `unittest.mock` 里，`Mock(wraps=真实对象)` 是实现 spy 的常用写法；`assert_called_once_with` 是实现 mock 式行为验证的常用写法。

两个反模式要避开：

- **把 stub 当 mock 用**：只给了固定答案，却又断言它的调用次数——测试与实现细节绑死，重构一改调用方式测试就坏，即使行为是对的。
- **把 mock 当 stub 用**：明明只关心返回值，却用一堆 `assert_called_*` 把交互写死——同样是过度耦合。先想清“这条测试到底在验证什么”，再选替身。

### 4.1 `unittest.mock` 的三个工具

- **`Mock` / `MagicMock`**：`MagicMock` 是 `Mock` 的子类，预先实现了多数魔术方法（`__len__`、`__iter__` 等），需要模拟魔术方法时用它，否则用 `Mock` 即可。
- **`patch`**：在测试期间临时替换某个名字，退出后自动恢复。关键规则是**打补丁要打在使用处的名字，而不是定义处**：如果被测模块 `import` 了某个对象，就替换被测模块里的那个名字。单文件演示里可用 `patch.object(模块, 名字)` 达到同样效果。
- **`spec` / `autospec`**：让 mock 只接受真实对象拥有的方法，防止“拼错方法名、mock 照单全收、测试全过、上线才错”。涉及真实接口的 mock 建议加上，本篇示例未展开，见未完成项。

## 5. 典型应用与实测示例

下面是一份完整可跑的示例，覆盖 AAA、边界、参数化（`subTest`）与五种替身。环境：Python 3.12.3，标准库 `unittest`（本机未安装 pytest，故全部用 `unittest`，不写未经验证的 pytest 命令）。把代码存为 `test_unit_doubles.py`，在同一目录执行 `python3 -m unittest -v test_unit_doubles`。

```python
import sys
import unittest
from unittest.mock import Mock, patch

def apply_discount(price, rate):
    if price < 0:
        raise ValueError("price must be >= 0")
    if not 0 <= rate <= 1:
        raise ValueError("rate must be in [0, 1]")
    return round(price * (1 - rate), 2)

def notify_order(notifier, order_id):
    notifier.send(f"order {order_id} confirmed")

class FakeStore:
    """内存版 store：有真实增查行为，但不落盘，不可用于生产。"""
    def __init__(self):
        self._data = {}
    def save(self, key, value):
        self._data[key] = value
    def get(self, key):
        return self._data.get(key)

def save_and_get(store, key, value):
    store.save(key, value)
    return store.get(key)

def render(user, logger):
    # 本测试路径不调用 logger：logger 是 dummy，只占位
    return f"hi {user.name}"

class TestAAAAndBoundary(unittest.TestCase):
    def test_apply_discount_aaa(self):
        # Arrange：准备输入
        price, rate = 100, 0.2
        # Act：执行被测行为
        result = apply_discount(price, rate)
        # Assert：断言结果
        self.assertEqual(result, 80.0)

    def test_apply_discount_boundaries(self):
        cases = [
            (100, 0, 100.0),      # 下界：不打折
            (100, 1, 0.0),        # 上界：全免
            (0, 0.5, 0.0),        # 零价
            (99.99, 0.1, 89.99),  # 舍入边界
        ]
        for price, rate, expected in cases:
            with self.subTest(price=price, rate=rate):
                self.assertEqual(apply_discount(price, rate), expected)

    def test_apply_discount_invalid(self):
        with self.assertRaises(ValueError):
            apply_discount(-1, 0.1)
        with self.assertRaises(ValueError):
            apply_discount(100, 1.5)

class TestDoubles(unittest.TestCase):
    def test_stub_returns_canned_answer(self):
        stub = Mock(return_value="晴天")
        self.assertEqual(stub("北京"), "晴天")
        # stub 用法只关心返回值，不断言调用过程

    def test_mock_verifies_interaction(self):
        mock_notifier = Mock()
        notify_order(mock_notifier, 42)
        mock_notifier.send.assert_called_once_with("order 42 confirmed")

    def test_spy_wraps_real_object(self):
        real = []
        spy = Mock(wraps=real.append)
        spy("a")
        spy.assert_called_once_with("a")
        self.assertEqual(real, ["a"])  # 真实行为仍执行

    def test_fake_has_working_behavior(self):
        store = FakeStore()
        self.assertEqual(save_and_get(store, "k", "v"), "v")
        self.assertEqual(store.get("missing"), None)

    def test_dummy_fills_parameter(self):
        class User:
            name = "dawei"
        dummy_logger = object()  # 从未被调用，只为满足签名
        self.assertEqual(render(User(), dummy_logger), "hi dawei")

    def test_patch_replaces_where_used(self):
        with patch.object(sys.modules[__name__], "apply_discount",
                          return_value=0.0) as m:
            self.assertEqual(apply_discount(100, 0.2), 0.0)
            m.assert_called_once_with(100, 0.2)
        # patch 退出后恢复原函数
        self.assertEqual(apply_discount(100, 0.2), 80.0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
```

实测通过（Python 3.12.3，VM 本地运行，`python3 -m unittest -v test_unit_doubles`）：

```text
test_apply_discount_aaa (test_unit_doubles.TestAAAAndBoundary.test_apply_discount_aaa) ... ok
test_apply_discount_boundaries (test_unit_doubles.TestAAAAndBoundary.test_apply_discount_boundaries) ... ok
test_apply_discount_invalid (test_unit_doubles.TestAAAAndBoundary.test_apply_discount_invalid) ... ok
test_dummy_fills_parameter (test_unit_doubles.TestDoubles.test_dummy_fills_parameter) ... ok
test_fake_has_working_behavior (test_unit_doubles.TestDoubles.test_fake_has_working_behavior) ... ok
test_mock_verifies_interaction (test_unit_doubles.TestDoubles.test_mock_verifies_interaction) ... ok
test_patch_replaces_where_used (test_unit_doubles.TestDoubles.test_patch_replaces_where_used) ... ok
test_spy_wraps_real_object (test_unit_doubles.TestDoubles.test_spy_wraps_real_object) ... ok
test_stub_returns_canned_answer (test_unit_doubles.TestDoubles.test_stub_returns_canned_answer) ... ok

----------------------------------------------------------------------
Ran 9 tests in 0.001s

OK
```

一点实测教训，值得写进正文：初版 `patch("__main__.apply_discount")` 在 `python3 -m unittest` 方式下报错，因为此时 `__main__` 是 unittest 自身的入口模块、没有这个属性；改成 `patch.object(当前模块, 名字)` 后才通过。这正是“打补丁要打在使用处的名字”这条规则的活例子：补丁目标写错，测试还没跑被测逻辑就先失败。

## 6. 限制与常见误解

- **“mock 越多，测试越专业”**：错。替身是隔离手段，不是专业标志；过度替身会让测试与真实行为脱节，测试全过、上线仍错。
- **“替身分类是五个类”**：错。分类是按角色与断言方式分的；`Mock` 一个类可以扮演 stub、spy、mock 多种角色，写测试时要先说清自己在用哪种角色。
- **“边界测了几个值就够了”**：错。边界的意义在于“每条边界对应一个分支或一种错误”；只测中间值，等于没测分支条件。
- **参数化不等于覆盖**：`subTest` 只是把多组输入跑一遍；输入表本身选得不好（全是同类值），参数化再多也是重复。
- **替身掩盖契约变化**：真实依赖改了接口，替身不会跟着变，测试仍过。关键路径上至少要有一部分测试用真实依赖（03 篇的原则），替身测试不能是唯一防线。

## 7. 小结

单元测试按 AAA 写清“准备、执行、断言”，用边界值与参数化把输入空间测全；替身按“状态验证还是行为验证”选：固定答案用 stub、多步真实行为用 fake、只占位用 dummy、要验证调用用 spy 或 mock。先想清这条测试在验证什么，再选替身，顺序不要反。

---

## 文章信息（统一字段，必填）

- 来源：Python 官方文档“unittest”（https://docs.python.org/3/library/unittest.html）、“unittest.mock”（https://docs.python.org/3/library/unittest.mock.html）；Gerard Meszaros《xUnit Test Patterns》中的测试替身五分法、Martin Fowler《Mocks Aren't Stubs》对状态验证与行为验证的区分（按书名与文章名引用，未在正文贴 Fowler 原文链接，见未完成项）。
- 适用版本：Python 3.12.3（本地实测版本；AAA、边界、参数化与替身分类的方法本身不绑定版本）。
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[调试与测试方法](03-debugging-testing.md)（本篇的分工起点：调试循环、测试金字塔、替身何时用）
- 相关主题：[调试与测试方法](03-debugging-testing.md)（金字塔与调试循环的完整论述）、[性能分析与故障定位方法](13-profiling-debugging.md)（本批下一篇：定位到性能与故障证据的方法，与本篇的“事前预防”互补）
- 未完成项：pytest 的 `@pytest.mark.parametrize` 写法本机未安装 pytest、未实测，示例与命令以官方发布为准（待核实）；`unittest.mock` 的 `spec`/`autospec` 防拼错用法未展开示例，以官方发布为准（待核实）；Fowler 原文链接未逐条核对，暂按书名与文章名引用（待核实）。
