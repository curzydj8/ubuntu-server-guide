package dev.toolkit.feature.tools.permissions

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionLogicTest {
    @Test fun `755 maps to rwxr-xr-x`() {
        val r = PermissionLogic.fromOctal("755") as AppResult.Success
        assertEquals("rwxr-xr-x", r.value.toSymbolic())
        assertEquals("chmod 755 /path/to/file", r.value.chmodCommand("/path/to/file"))
    }

    @Test fun `000 and 777 bounds`() {
        assertEquals("---------", (PermissionLogic.fromOctal("000") as AppResult.Success).value.toSymbolic())
        assertEquals("rwxrwxrwx", (PermissionLogic.fromOctal("777") as AppResult.Success).value.toSymbolic())
    }

    @Test fun `symbolic roundtrip`() {
        val p = (PermissionLogic.fromSymbolic("rw-r-----") as AppResult.Success).value
        assertEquals("640", p.toOctal())
    }

    @Test fun `invalid inputs fail with validation error`() {
        assertTrue(PermissionLogic.fromOctal("88") is AppResult.Failure)
        assertTrue(PermissionLogic.fromOctal("1234") is AppResult.Failure)
        assertTrue(PermissionLogic.fromSymbolic("rwxr-xr") is AppResult.Failure)
        assertTrue(PermissionLogic.fromSymbolic("abcdefghi") is AppResult.Failure)
    }
}
