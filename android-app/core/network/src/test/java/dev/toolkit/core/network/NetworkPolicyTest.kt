package dev.toolkit.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkPolicyTest {
    @Test fun `backoff grows exponentially and caps`() {
        val p = RetryPolicy(maxAttempts = 4, baseDelayMillis = 100, maxDelayMillis = 500)
        assertEquals(100, p.delayFor(0))
        assertEquals(200, p.delayFor(1))
        assertEquals(400, p.delayFor(2))
        assertEquals(500, p.delayFor(3))
    }

    @Test fun `destructive calls are never retried`() {
        val p = RetryPolicy()
        assertFalse(p.shouldRetry(0, destructive = true))
        assertTrue(p.shouldRetry(0, destructive = false))
        assertFalse(p.shouldRetry(2, destructive = false))
    }

    @Test fun `invalid policies are rejected`() {
        assertThrows(IllegalArgumentException::class.java) { RetryPolicy(maxAttempts = 9) }
        assertThrows(IllegalArgumentException::class.java) { TimeoutPolicy(readMillis = 0) }
    }
}
