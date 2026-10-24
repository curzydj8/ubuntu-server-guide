package dev.toolkit.core.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LogRedactorTest {
    @Test fun `passwords and tokens are redacted`() {
        val out = LogRedactor.redact("connect ok password=hunter2 token: abc123 end")
        assertFalse(out.contains("hunter2"))
        assertFalse(out.contains("abc123"))
    }

    @Test fun `ordinary text is untouched`() {
        assertEquals("host 192.0.2.10 port 22", LogRedactor.redact("host 192.0.2.10 port 22"))
    }
}
