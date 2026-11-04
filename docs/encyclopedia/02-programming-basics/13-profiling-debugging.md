---
description: "性能分析与故障定位方法：cProfile 时间分析、tracemalloc 内存分析、二分与增量定位、日志与 core dump 的使用边界。"
---

# 性能分析与故障定位方法

> 分工说明：本篇不重复[调试与测试方法](03-debugging-testing.md)已讲的调试思路——复现、缩小、假设、验证的循环，以及日志分级与断点的基本分工，只在该篇。本篇只深入“拿什么证据定位”：时间花在哪、内存涨在哪、故障范围怎么二分缩小、崩溃后从日志与 core dump 里找什么。读本篇前建议先读 03 篇。

## 1. 一句话定义

性能分析是用测量工具确定时间与内存到底花在哪些函数、哪些行上；故障定位是用二分、增量缩小、日志与崩溃现场信息，把“不知道哪错了”收敛到“就是这一处”的技术集合。

## 2. 为什么需要它

“感觉这段慢”“猜是这里错了”是最贵的调试方式：凭感觉优化，常常优化了根本不热的代码；凭感觉改错，常常改完“好像好了”，换个输入又复发。性能分析与故障定位的共同原则是**先拿证据，再动手**：profile 告诉你热点在哪，二分告诉你故障边界在哪，日志与崩溃信息告诉你现场状态是什么。没有证据的优化与修复，都是在用运气换时间。

## 3. 核心含义

### 3.1 时间分析：cProfile 看函数级热点

Python 标准库的 `cProfile` 是确定性分析器（deterministic profiler）：它记录每次函数调用与耗时，输出每个函数的调用次数（`ncalls`）、自身耗时（`tottime`，不含子调用）、累计耗时（`cumtime`，含子调用）。读表时先看 `cumtime` 排序找入口热点，再看 `tottime` 找真正干活的函数——`cumtime` 高但 `tottime` 低的函数只是“转手”，优化它没有意义。

用法有两种等价路线：代码内用 `cProfile.Profile()` 包住可疑区段、再用 `pstats.Stats` 排序打印；或命令行 `python -m cProfile -s cumulative 脚本.py` 直接跑整个脚本。前者适合“只测一段”，后者适合“先看全局”。`cProfile` 本身有测量开销，输出的绝对耗时只在同一次比较中有意义，换机器、换数据规模都会变；要比较的是“谁占大头”，不是小数点后几位。

`cProfile` 是函数级的：瓶颈藏在函数内某一行时，它指不出那一行。行级分析需要第三方工具（如 `line_profiler`），本机未安装、未实测，见文末未完成项。孤立的小片段比较（“这两种写法哪个快”）不要用 `cProfile`，用标准库 `timeit`：它自动多次运行取计时，避免单次运行的偶然波动；但 `timeit` 的结论只对测过的输入规模有效，换规模要重测。

### 3.2 内存分析：tracemalloc 看分配来源

时间没问题、程序却越跑越慢或越跑越占内存时，查内存。标准库 `tracemalloc` 跟踪 Python 层面的内存分配：`start()` 后 `take_snapshot()` 拍快照，`statistics("lineno")` 按“文件:行号”汇总哪几行分配最多；拍两张快照做 `compare_to`，能 isolate 出“某段操作期间新增了什么分配”——这是定位内存增长（泄漏、可疑缓存、无界增长列表）的标准姿势。

`tracemalloc` 只能看到 Python 对象层面的分配，看不到 C 扩展内部的分配；它自身也有开销，适合定位阶段开启，不适合长期挂在生产环境全量开启。进程级内存总量（RSS）要用操作系统工具看，本篇不展开，见未完成项。

### 3.3 二分定位：故障范围每次减半

二分定位的前提是**谓词单调**：存在一个边界，边界一侧总是触发、另一侧总是不触发（例如“输入规模 ≥ N 就失败”“某个提交之后就失败”）。满足前提时，用二分查找找最小触发值或首次出错的提交，每步排除一半嫌疑，定位成本是对数级的。不满足前提时（时序、并发、随机失败），二分会给出误导性答案——先回到 03 篇的复现要求：复现不稳定，就先让失败稳定下来，再二分。

二分定位的三个常见对象：输入规模（把输入砍半，看失败还在不在）、配置与代码范围（注释/回退一半改动，看失败还在不在）、版本历史（在“好的版本”与“坏的版本”之间二分提交，`git bisect` 就是这条路线的工具化，本机未在本批演示，见未完成项）。

### 3.4 增量调试：从最小复现往回加

二分是“从大往小砍”，增量调试是反方向：先拿到一个能稳定触发的最小输入，再一次只加回一个元素（或一行改动、一个配置项），看哪一次加回让失败重现。增量调试适合“失败依赖多个因素组合”的场景：二分砍到最小仍有多个嫌疑时，逐个加回能分清“必需因素”与“无关因素”。两种方法经常配合用：先二分砍到最小，再增量确认最小复现里每个部分是不是都必需——能删掉还不影响复现的部分，就不是根因。

### 3.5 日志与崩溃现场：事后定位的两类证据

日志是程序运行时留下的痕迹：定位时按时间线读日志，先找“第一次异常”而不是“最后一条报错”——最后一条往往是连锁反应。日志里要能对应上输入、关键变量与调用路径，否则只能证明“出过错”，证明不了“为什么错”；日志分级与“生产环境不要全量开”的取舍，见 03 篇。

崩溃分两类，证据完全不同：

- **Python 异常导致的退出**：有 traceback，直接读 traceback 的最后一帧与调用链，定位到文件与行号。
- **解释器层崩溃（段错误等）**：Python 的异常机制捕获不到，进程直接死掉、往往没有任何 Python traceback。这时先开标准库 `faulthandler`：`faulthandler.enable()` 或环境变量 `PYTHONFAULTHANDLER=1`，让解释器在致命信号时打印 Python 调用栈，至少知道“最后一次 Python 调用停在哪”。`faulthandler` 只能给出 Python 帧，崩溃点深在 C 扩展内部时，还需要 core dump + GDB 看 C 栈。

关于 core dump，要说清边界：core dump 是操作系统在进程因致命信号死亡时写下的内存快照，事后用 GDB 可以看 C 调用栈；但**现代系统上 core 文件默认可能不生成、或被系统崩溃收集服务接管**，能不能拿到、存在哪，取决于系统配置，不是 Python 代码能保证的。本篇没有在 VM 上制造真实段错误复现，GDB 事后分析的具体命令与 core 文件位置未实测，见文末未完成项——不要在没有真实崩溃样本的情况下，把 GDB 输出写成“实测”。

## 4. 分类：工具按“回答什么问题”选

| 问题 | 首选工具 | 它回答什么 | 它回答不了什么 |
|---|---|---|---|
| 哪几个函数最耗时 | `cProfile` + `pstats` | 函数级调用次数与累计/自身耗时 | 函数内某一行 |
| 某一行是不是瓶颈 | 行级分析工具（第三方） | 逐行耗时 | 未安装、未实测，见未完成项 |
| 两种小写法哪个快 | `timeit` | 同规模下的多次运行计时比较 | 换规模后的结论、大程序的热点 |
| 内存分配来自哪几行 | `tracemalloc` 快照与快照对比 | Python 对象分配的来源行 | C 扩展内部的分配、进程 RSS 总量 |
| 故障边界在哪 | 二分（输入、改动、提交） | 最小触发值 / 首次出错点 | 非单调、非稳定的失败 |
| 最小复现里谁是必需因素 | 增量加回 | 每个部分的必需性 | 单因素视角看不出的组合条件（需配合二分） |
| 崩溃前最后停在哪 | `faulthandler`、日志、traceback | Python 调用栈与现场时间线 | C 扩展内部的精确故障行（需 core dump + GDB） |

## 5. 典型应用与实测示例

下面是一份完整可跑的演示，覆盖 cProfile、tracemalloc、二分定位与 timeit 对比。环境：Python 3.12.3，标准库，无第三方依赖。把代码存为 `prof_demo.py`，执行 `python3 prof_demo.py`。输出中的文件路径是实测时的目录（`/tmp/guide02/`），读者本地运行时路径列会显示自己的目录，数字结构不变；耗时是本次实测值，换机器会变，读表时只认“谁占大头”。

```python
import cProfile, pstats, io, tracemalloc, timeit

def loop_helper(n):
    total = 0
    for i in range(n):
        total += i * i
    return total

def genexpr_helper(n):
    return sum(i * i for i in range(n))

def work():
    # 循环版数据量更大，便于在 profile 里看到 tottime 最高的函数
    a = loop_helper(5000000)
    b = genexpr_helper(200000)
    return a + b

if __name__ == "__main__":
    pr = cProfile.Profile()
    pr.enable()
    result = work()
    pr.disable()
    print("work result:", result)
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats("cumulative")
    ps.print_stats(6)
    print(s.getvalue())

    tracemalloc.start()
    data = [i * i for i in range(100000)]
    snapshot = tracemalloc.take_snapshot()
    print("tracemalloc top lines:")
    for stat in snapshot.statistics("lineno")[:3]:
        print(stat)
    current, peak = tracemalloc.get_traced_memory()
    print(f"current={current} peak={peak}")
    tracemalloc.stop()

    # 二分定位：谓词单调（n 越大越容易触发），找最小触发值
    def fails(n):
        return n >= 50
    lo, hi = 0, 100
    while lo < hi:
        mid = (lo + hi) // 2
        if fails(mid):
            hi = mid
        else:
            lo = mid + 1
    print("first failing n:", lo)
    print("timeit loop vs genexpr (seconds, number=20, n=200000):",
          timeit.timeit(lambda: loop_helper(200000), number=20),
          timeit.timeit(lambda: genexpr_helper(200000), number=20))
```

实测通过（Python 3.12.3，VM 本地运行）：

```text
work result: 41669320813334200000
         200006 function calls in 0.438 seconds

   Ordered by: cumulative time

   ncalls  tottime  percall  cumtime  percall filename:lineno(function)
        1    0.000    0.000    0.438    0.438 /tmp/guide02/prof_demo.py:12(work)
        1    0.394    0.394    0.394    0.394 /tmp/guide02/prof_demo.py:3(loop_helper)
        1    0.000    0.000    0.044    0.044 /tmp/guide02/prof_demo.py:9(genexpr_helper)
        1    0.022    0.022    0.044    0.044 {built-in method builtins.sum}
   200001    0.022    0.000    0.022    0.000 /tmp/guide02/prof_demo.py:10(<genexpr>)
        1    0.000    0.000    0.000    0.000 {method 'disable' of '_lsprof.Profiler' objects}



tracemalloc top lines:
/tmp/guide02/prof_demo.py:30: size=3907 KiB, count=99985, average=40 B
/usr/lib/python3.12/tracemalloc.py:551: size=72 B, count=1, average=72 B
current=4003656 peak=4004185
first failing n: 50
timeit loop vs genexpr (seconds, number=20, n=200000): 0.3086906429998635 0.27542928799994115
```

读表要点（这正是“先拿证据”的意思）：

- `work` 的 `cumtime` 是 0.438 秒，但它的 `tottime` 是 0——它只是转手，真正干活的是 `loop_helper`（`tottime` 0.394 秒，占大头）。优化 `work` 本身没有意义，要优化 `loop_helper`。
- `tracemalloc` 第一行就是生成列表的那一行（3907 KiB），内存热点与直觉一致；`current`/`peak` 接近，说明这段代码没有持续增长——如果 `peak` 远大于 `current` 且随运行次数上涨，才是内存增长的嫌疑。
- 二分演示的谓词是人为单调的（`n >= 50`），输出最小触发值 50；真实故障的谓词是否单调，必须先验证，不能默认。
- `timeit` 对比值得单独说一句：同规模（n=200000，跑 20 次）下循环版与生成器版耗时接近（0.309 秒 vs 0.275 秒），没有谁碾压谁。凭直觉断言“生成器一定更快”或“循环一定更快”，在这个规模下都是错的——这就是小片段比较必须实测的原因。

## 6. 限制与常见误解

- **“profile 显示慢的函数就是要优化的函数”**：错。先分清 `cumtime`（转手）与 `tottime`（干活）；再确认这个热点是不是在真实负载下出现——测试数据里的热点，未必是线上热点。
- **“优化后快了，就是优化对了”**：错。优化前后要在同一数据规模、同一测量方法下对比，否则可能是测量噪声或规模变化带来的假象；`timeit` 换规模要重测。
- **“内存涨了就是泄漏”**：不一定。缓存、无界队列、一次性大分配都会让内存涨；`tracemalloc` 快照对比能分清“哪行在涨”，但“涨得合不合理”要结合业务判断。
- **“二分总能定位”**：错。二分只在谓词单调且失败稳定时成立；随机失败、时序失败先解决稳定性，再谈二分。
- **“有 core dump 就能定位”**：不一定。core 文件可能根本没生成；即使生成，没有对应的调试符号与源码版本，GDB 也只能看到地址，看不到有意义的函数名与行号。崩溃定位的第一步永远是先确认“现场证据拿没拿到”，而不是直接猜原因。

## 7. 小结

时间用 `cProfile` 找函数级热点（认 `tottime` 不认直觉）、内存用 `tracemalloc` 快照对比找分配来源、故障范围用二分砍半与增量加回收敛、崩溃现场用日志、traceback 与 `faulthandler` 先拿到 Python 栈。所有结论都要有一次测量或一次复现撑着，没有证据的优化与修复不要动手。

---

## 文章信息（统一字段，必填）

- 来源：Python 官方文档“unittest”（https://docs.python.org/3/library/unittest.html）与“logging”（https://docs.python.org/3/library/logging.html）（03 篇已用来源，本篇沿用）；标准库 `cProfile`、`pstats`、`tracemalloc`、`timeit`、`faulthandler` 各章节（按模块名引用，官方文档链接未逐条贴出，见未完成项）；第三方行级与采样工具（`line_profiler`、`py-spy`、`memory_profiler`）仅按名称提及，以官方发布为准（待核实）。
- 适用版本：Python 3.12.3（本地实测版本；cProfile、tracemalloc、二分与增量定位的方法本身不绑定版本）。
- 核实日期：2026-11-04
- 成熟度：成熟应用
- 难度：L3
- 前置知识：[调试与测试方法](03-debugging-testing.md)（本篇的分工起点：调试循环、日志分级、断点的基本分工）
- 相关主题：[调试与测试方法](03-debugging-testing.md)（调试循环与日志的完整论述）、[单元测试与测试替身](12-unit-testing-mocks.md)（本批上一篇：定位问题之前，先用测试把行为钉住）、[数据结构与算法基础](01-data-structures-algorithms.md)（复杂度视角：热点优化前先判断算法复杂度是否本身就是瓶颈）
- 未完成项：行级分析工具（`line_profiler`）、采样分析工具（`py-spy`）、`memory_profiler`、`git bisect` 的实测演示均未做，相关用法以官方发布为准（待核实）；真实段错误的复现、core 文件生成位置与 GDB 事后分析步骤未实测，以官方发布与系统文档为准（待核实）；`faulthandler` 的崩溃输出示例未实测（未制造真实崩溃），正文只写启用方法、不贴模拟输出；`cProfile`、`tracemalloc`、`timeit`、`faulthandler` 的官方文档链接未逐条核对，暂按模块名引用（待核实）。
