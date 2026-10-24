package dev.toolkit.feature.tools.dres

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DockerResourceLogicTest {
    @Test fun `memory parsing`() {
        assertEquals(512L * 1024 * 1024, (DockerResourceLogic.parseMemory("512m") as AppResult.Success).value)
        assertEquals(2L * 1024 * 1024 * 1024, (DockerResourceLogic.parseMemory("2g") as AppResult.Success).value)
        assertEquals(1024L, (DockerResourceLogic.parseMemory("1k") as AppResult.Success).value)
        assertEquals(1000L, (DockerResourceLogic.parseMemory("1000") as AppResult.Success).value)
        assertEquals(1536L * 1024 * 1024, (DockerResourceLogic.parseMemory("1.5g") as AppResult.Success).value)
    }

    @Test fun `memory format roundtrip`() {
        assertEquals("512m", DockerResourceLogic.dockerMemoryString(512L * 1024 * 1024))
        assertEquals("2g", DockerResourceLogic.dockerMemoryString(2L * 1024 * 1024 * 1024))
        assertEquals("512 MiB", DockerResourceLogic.formatMemory(512L * 1024 * 1024))
    }

    @Test fun `cpu conversions`() {
        assertEquals(1024L, (DockerResourceLogic.cpusToShares(1.0) as AppResult.Success).value)
        assertEquals(2048L, (DockerResourceLogic.cpusToShares(2.0) as AppResult.Success).value)
        assertEquals(1.5, (DockerResourceLogic.sharesToCpus(1536) as AppResult.Success).value, 0.001)
        assertEquals(1_500_000_000L, (DockerResourceLogic.cpusToNanoCpus(1.5) as AppResult.Success).value)
    }

    @Test fun `invalid inputs rejected`() {
        assertTrue(DockerResourceLogic.parseMemory("abc") is AppResult.Failure)
        assertTrue(DockerResourceLogic.cpusToShares(0.0) is AppResult.Failure)
    }
}
