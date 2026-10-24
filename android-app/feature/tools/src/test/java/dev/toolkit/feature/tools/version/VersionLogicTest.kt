package dev.toolkit.feature.tools.version

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionLogicTest {
    private fun cmp(a: String, b: String): Int =
        (VersionLogic.compareStrings(a, b) as AppResult.Success).value

    @Test fun `tilde sorts before release`() {
        assertTrue(cmp("1.0~rc1", "1.0") < 0)
        assertTrue(cmp("1.0~rc1", "1.0~rc2") < 0)
        assertTrue(cmp("1.0~~", "1.0~") < 0)
    }

    @Test fun `epoch dominates`() {
        assertTrue(cmp("1:1.0", "2.0") > 0)
        assertTrue(cmp("2:0.1", "1:9.9") > 0)
    }

    @Test fun `numeric segments compare numerically`() {
        assertTrue(cmp("1.9", "1.10") < 0)
        assertEquals(0, cmp("1.01", "1.1"))
    }

    @Test fun `revision compared after upstream`() {
        assertTrue(cmp("1.0-1", "1.0-2") < 0)
        assertEquals(0, cmp("1.0", "1.0-0"))
    }

    @Test fun `letters sort before non-letters except tilde`() {
        assertTrue(cmp("1.0a", "1.0+") < 0)
    }

    @Test fun `invalid versions rejected`() {
        assertTrue(VersionLogic.parse("") is AppResult.Failure)
        assertTrue(VersionLogic.parse("x:1.0") is AppResult.Failure)
        assertTrue(VersionLogic.parse("a1.0") is AppResult.Failure)
    }
}
