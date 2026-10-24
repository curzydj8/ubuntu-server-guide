package dev.toolkit.core.network

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsClientTest {

    // 2026-10-23 经 curl 从两家解析商实取的真实响应（example.com），作解析器基线样本。
    private val cloudflareA = """{"Status":0,"TC":false,"RD":true,"RA":true,"AD":true,"CD":false,"Question":[{"name":"example.com","type":1}],"Answer":[{"name":"example.com","type":1,"TTL":236,"data":"104.20.23.154"},{"name":"example.com","type":1,"TTL":236,"data":"172.66.147.243"}]}"""
    private val googleMx = """{"Status":0,"TC":false,"RD":true,"RA":true,"AD":true,"CD":false,"Question":[{"name":"example.com.","type":15}],"Answer":[{"name":"example.com.","type":15,"TTL":132,"data":"0 ."}]}"""
    private val nxdomain = """{"Status":3,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"no-such-host.example","type":1}]}"""

    @Test fun `parses real cloudflare A response`() {
        val r = (DnsClient.parseResponse(cloudflareA) as AppResult.Success).value
        assertEquals(0, r.status)
        assertEquals(2, r.records.size)
        assertEquals("A", r.records.first().type)
        assertEquals(236L, r.records.first().ttl)
        assertEquals("104.20.23.154", r.records.first().data)
    }

    @Test fun `parses real google MX response`() {
        val r = (DnsClient.parseResponse(googleMx) as AppResult.Success).value
        assertEquals("MX", r.records.first().type)
        assertEquals("0 .", r.records.first().data)
    }

    @Test fun `nxdomain reported with empty records`() {
        val r = (DnsClient.parseResponse(nxdomain) as AppResult.Success).value
        assertEquals(3, r.status)
        assertTrue(r.statusText.contains("NXDOMAIN"))
        assertTrue(r.records.isEmpty())
    }

    @Test fun `name validation and url building`() {
        assertTrue(DnsClient.validateName("example.com") is AppResult.Success)
        assertTrue(DnsClient.validateName("-bad-.com") is AppResult.Failure)
        assertTrue(DnsClient.validateName("") is AppResult.Failure)
        assertEquals(
            "https://dns.google/resolve?name=example.com&type=AAAA",
            DnsClient.buildUrl(DnsClient.Provider.GOOGLE, "example.com", "AAAA"),
        )
    }
}
