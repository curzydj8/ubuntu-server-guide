package dev.toolkit.core.testing

import dev.toolkit.core.common.AppResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InMemoryCredentialVaultTest {
    @Test fun `put get remove roundtrip`() = runTest {
        val vault = InMemoryCredentialVault()
        assertNull((vault.get("k1") as AppResult.Success).value)
        vault.put("k1", "s3cret".toCharArray())
        assertTrue(vault.contains("k1"))
        assertArrayEquals("s3cret".toCharArray(), (vault.get("k1") as AppResult.Success).value)
        vault.remove("k1")
        assertFalse(vault.contains("k1"))
    }
}
