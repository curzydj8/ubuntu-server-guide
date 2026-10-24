package dev.toolkit.feature.servers

import dev.toolkit.core.ssh.RiskLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsPresetsTest {
    @Test
    fun `all presets are read-only per CommandRisk`() {
        Diagnostics.presets.forEach { preset ->
            assertEquals("预设 ${preset.id} 必须只读：${preset.command}", RiskLevel.READ_ONLY, Diagnostics.riskOf(preset))
        }
    }

    @Test
    fun `presets are non-empty with unique ids and commands`() {
        assertTrue(Diagnostics.presets.size >= 6)
        assertEquals(Diagnostics.presets.size, Diagnostics.presets.map { it.id }.distinct().size)
        Diagnostics.presets.forEach {
            assertTrue(it.command.isNotBlank())
            assertTrue(it.title.isNotBlank())
        }
    }
}

class HostFormTest {
    @Test
    fun `valid password form passes`() {
        assertNull(HostForm.validate("生产机", "192.168.1.10", "22", "root", HostForm.AUTH_PASSWORD, true))
    }

    @Test
    fun `missing credential is rejected with guidance`() {
        assertNotNull(HostForm.validate("生产机", "192.168.1.10", "22", "root", HostForm.AUTH_PASSWORD, false))
        assertNotNull(HostForm.validate("生产机", "192.168.1.10", "22", "root", HostForm.AUTH_PRIVATE_KEY, false))
    }

    @Test
    fun `bad ports and blanks are rejected`() {
        assertNotNull(HostForm.validate("", "h", "22", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", " ", "22", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", "exa mple.com", "22", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", "h", "0", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", "h", "65536", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", "h", "ssh", "u", HostForm.AUTH_PASSWORD, true))
        assertNotNull(HostForm.validate("a", "h", "22", "", HostForm.AUTH_PASSWORD, true))
        assertNull(HostForm.validate("a", "h", "65535", "u", HostForm.AUTH_PRIVATE_KEY, true))
    }

    @Test
    fun `tags parse trims dedups and joins`() {
        assertEquals(listOf("生产", "华东", "web"), HostForm.parseTags("生产, 华东，web,生产"))
        assertEquals(emptyList<String>(), HostForm.parseTags(" , ，"))
        assertEquals("生产,web", HostForm.joinTags(listOf("生产", "web")))
    }
}

class CredentialRefsTest {
    @Test
    fun `all refs satisfy the vault naming rule`() {
        // KeystoreCredentialVault.fileFor 只接受 [A-Za-z0-9._-]{1,64}
        val rule = Regex("[A-Za-z0-9._-]{1,64}")
        val base = CredentialRefs.baseFor(42)
        assertTrue(base.matches(rule))
        assertTrue(CredentialRefs.password(base).matches(rule))
        assertTrue(CredentialRefs.privateKey(base).matches(rule))
        assertTrue(CredentialRefs.keyPassphrase(base).matches(rule))
    }
}

class TerminalTextTest {
    @Test
    fun `ansi color sequences are stripped`() {
        val raw = "\u001B[32mOK\u001B[0m done"
        assertEquals("OK done", TerminalText.strip(raw))
    }

    @Test
    fun `carriage return keeps last segment of the line`() {
        assertEquals("Done", TerminalText.strip("downloading 10%\rdownloading 90%\rDone"))
    }

    @Test
    fun `append caps buffer keeping the tail`() {
        val big = "x".repeat(TerminalText.MAX_CHARS + 5000)
        val out = TerminalText.append("", big)
        assertEquals(TerminalText.MAX_CHARS, out.length)
        assertTrue(out.endsWith("x"))
    }

    @Test
    fun `crlf is normalized`() {
        assertEquals("a\nb\n", TerminalText.strip("a\r\nb\r\n"))
    }
}
