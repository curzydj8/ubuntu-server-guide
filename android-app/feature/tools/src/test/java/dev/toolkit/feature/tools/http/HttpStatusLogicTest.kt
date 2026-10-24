package dev.toolkit.feature.tools.http

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpStatusLogicTest {
    @Test fun `lookup by code`() {
        assertEquals("Not Found", HttpStatusLogic.byCode(404)?.name)
        assertEquals("服务器错误", HttpStatusLogic.byCode(502)?.category)
        assertNull(HttpStatusLogic.byCode(999))
    }

    @Test fun `search by keyword and code`() {
        assertTrue(HttpStatusLogic.search("网关").any { it.code == 502 })
        assertEquals(listOf(429), HttpStatusLogic.search("429").map { it.code })
        assertNotNull(HttpStatusLogic.search(""))
    }

    @Test fun `table covers all five categories`() {
        val cats = HttpStatusLogic.ENTRIES.map { it.category }.toSet()
        assertEquals(setOf("信息", "成功", "重定向", "客户端错误", "服务器错误"), cats)
    }
}
