package dev.toolkit.feature.tools.hash

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HashLogicTest {
    @Test fun `known vectors for abc`() {
        assertEquals("900150983cd24fb0d6963f7d28e17f72",
            (HashLogic.digestHex("abc", "MD5") as AppResult.Success).value)
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d",
            (HashLogic.digestHex("abc", "SHA-1") as AppResult.Success).value)
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            (HashLogic.digestHex("abc", "SHA-256") as AppResult.Success).value)
        assertEquals("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
            "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
            (HashLogic.digestHex("abc", "SHA-512") as AppResult.Success).value)
    }

    @Test fun `empty string sha256 vector`() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            (HashLogic.digestHex("", "SHA-256") as AppResult.Success).value)
    }

    @Test fun `unknown algorithm rejected`() {
        assertTrue(HashLogic.digestHex("x", "SHA-999") is AppResult.Failure)
    }
}
