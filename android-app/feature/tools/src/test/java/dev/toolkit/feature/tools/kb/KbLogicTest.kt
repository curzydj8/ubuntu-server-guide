package dev.toolkit.feature.tools.kb

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KbLogicTest {
    @Test fun `every diag option target exists and every conclusion reachable`() {
        // 结构完整性：所有选项指向存在的节点，且从 root 可达全部节点
        val seen = mutableSetOf<String>()
        val stack = mutableListOf("root")
        while (stack.isNotEmpty()) {
            val id = stack.removeLast()
            if (!seen.add(id)) continue
            val node = DiagLogic.node(id)
            assertNotNull("节点 $id 应存在", node)
            if (node is DiagLogic.Node.Question) {
                node.options.forEach { (_, next) ->
                    assertNotNull("选项目标 $next 应存在", DiagLogic.node(next))
                    stack += next
                }
            }
        }
        assertEquals(DiagLogic.NODES.keys, seen)
    }

    @Test fun `explain decomposes rsync and flags delete risk`() {
        val lines = (ExplainLogic.explain("rsync -avz --delete src/ dst/") as AppResult.Success).value
        assertTrue(lines.first().contains("增量同步"))
        assertTrue(lines.any { it.contains("--delete") && it.contains("删除目标端") })
        assertTrue(lines.any { it.startsWith("风险提示") })
    }

    @Test fun `explain unknown command fails honestly`() {
        assertTrue(ExplainLogic.explain("someobscurecmd -x") is AppResult.Failure)
    }

    @Test fun `tokenize respects quotes`() {
        assertEquals(listOf("grep", "-n", "a b", "/var/log/x"), ExplainLogic.tokenize("grep -n 'a b' /var/log/x"))
    }
}
