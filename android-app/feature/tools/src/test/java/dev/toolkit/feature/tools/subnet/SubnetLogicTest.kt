package dev.toolkit.feature.tools.subnet

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SubnetLogicTest {
    @Test fun `ipv4 slash24`() {
        val s = (SubnetLogic.ipv4("192.168.1.10/24") as AppResult.Success).value
        assertEquals("192.168.1.0", s.network)
        assertEquals("192.168.1.255", s.broadcast)
        assertEquals("255.255.255.0", s.netmask)
        assertEquals("192.168.1.1", s.firstUsable)
        assertEquals("192.168.1.254", s.lastUsable)
        assertEquals(256L, s.totalHosts)
        assertEquals(254L, s.usableHosts)
    }

    @Test fun `ipv4 slash31 has no usable hosts`() {
        val s = (SubnetLogic.ipv4("10.0.0.0/31") as AppResult.Success).value
        assertEquals(2L, s.totalHosts)
        assertEquals(0L, s.usableHosts)
    }

    @Test fun `ipv4 invalid inputs`() {
        assertTrue(SubnetLogic.ipv4("999.1.1.1/24") is AppResult.Failure)
        assertTrue(SubnetLogic.ipv4("10.0.0.1/33") is AppResult.Failure)
        assertTrue(SubnetLogic.ipv4("10.0.0.1") is AppResult.Failure)
    }

    @Test fun `ipv6 slash64`() {
        val s = (SubnetLogic.ipv6("2001:db8::1/64") as AppResult.Success).value
        assertEquals("2001:db8:0:0:0:0:0:0", s.network)
        assertEquals("2001:db8:0:0:ffff:ffff:ffff:ffff", s.lastAddress)
        assertEquals(64, s.prefixLength)
        assertEquals("18446744073709551616", s.totalAddresses.toString())
    }

    @Test fun `ipv6 invalid inputs`() {
        assertTrue(SubnetLogic.ipv6("2001:db8::1/129") is AppResult.Failure)
        assertTrue(SubnetLogic.ipv6("not-an-ip/64") is AppResult.Failure)
    }
}

class Ipv6FormatTest {
    @Test fun `expand pads groups`() {
        assertEquals("2001:0db8:0000:0000:0000:0000:0000:0001",
            (dev.toolkit.feature.tools.subnet.Ipv6Format.expand("2001:db8::1") as dev.toolkit.core.common.AppResult.Success).value)
    }

    @Test fun `compress folds longest zero run`() {
        assertEquals("2001:db8::1",
            (dev.toolkit.feature.tools.subnet.Ipv6Format.compress("2001:0db8:0000:0000:0000:0000:0000:0001") as dev.toolkit.core.common.AppResult.Success).value)
        assertEquals("::",
            (dev.toolkit.feature.tools.subnet.Ipv6Format.compress("0:0:0:0:0:0:0:0") as dev.toolkit.core.common.AppResult.Success).value)
    }

    @Test fun `expand compress roundtrip`() {
        val expanded = (dev.toolkit.feature.tools.subnet.Ipv6Format.expand("fe80::a634:d9ff:fe07:c5a8") as dev.toolkit.core.common.AppResult.Success).value
        assertEquals("fe80::a634:d9ff:fe07:c5a8",
            (dev.toolkit.feature.tools.subnet.Ipv6Format.compress(expanded) as dev.toolkit.core.common.AppResult.Success).value)
    }

    @Test fun `invalid address rejected`() {
        assertTrue(dev.toolkit.feature.tools.subnet.Ipv6Format.expand("10.0.0.1") is dev.toolkit.core.common.AppResult.Failure)
    }
}
