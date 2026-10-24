package dev.toolkit.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ToolRegistryTest {
    private val registry = object : ToolRegistry {
        private val tools = listOf(
            ToolMeta(ToolId("N-17"), "权限计算器", ToolCategory.SYSTEM, ToolConnectivity.OFFLINE, "chmod 权限换算"),
            ToolMeta(ToolId("N-01"), "DNS 查询", ToolCategory.NETWORK, ToolConnectivity.ONLINE, "域名解析查询"),
        )
        override fun all() = tools
        override fun find(id: ToolId) = tools.firstOrNull { it.id == id }
    }

    @Test fun `find returns registered tool`() {
        assertEquals("权限计算器", registry.find(ToolId("N-17"))?.name)
    }

    @Test fun `find unknown returns null`() {
        assertNull(registry.find(ToolId("N-99")))
    }

    @Test fun `search matches name and summary`() {
        assertEquals(1, registry.search("dns").size)
        assertEquals(1, registry.search("换算").size)
        assertEquals(0, registry.search("不存在").size)
    }

    @Test fun `tool id format is enforced`() {
        assertThrows(IllegalArgumentException::class.java) { ToolId("X-01") }
        assertThrows(IllegalArgumentException::class.java) { ToolId("N-1") }
        ToolId("G-01") // 编号外生成器的 App 侧登记号应可构造
    }
}
