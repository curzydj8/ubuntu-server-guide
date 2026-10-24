package dev.toolkit.feature.tools.diff

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DiffLogicTest {
    @Test fun `basic add delete equal`() {
        val r = (DiffLogic.diff("a\nb\nc", "a\nx\nc") as AppResult.Success).value
        assertEquals(1, r.added); assertEquals(1, r.deleted); assertEquals(2, r.unchanged)
    }

    @Test fun `identical inputs all equal`() {
        val r = (DiffLogic.diff("same\nlines", "same\nlines") as AppResult.Success).value
        assertEquals(0, r.added); assertEquals(0, r.deleted); assertEquals(2, r.unchanged)
    }

    @Test fun `oversize rejected`() {
        val big = (1..5001).joinToString("\n") { "line$it" }
        assertTrue(DiffLogic.diff(big, "x") is AppResult.Failure)
        val wide = (1..3000).joinToString("\n") { "l$it" }
        assertTrue(DiffLogic.diff(wide, wide.replace('l', 'r')) is AppResult.Failure)
    }

    @Test fun `render marks changes`() {
        val r = (DiffLogic.diff("a", "b") as AppResult.Success).value
        val lines = DiffLogic.render(r)
        assertTrue(lines.any { it == "- a" })
        assertTrue(lines.any { it == "+ b" })
    }
}
