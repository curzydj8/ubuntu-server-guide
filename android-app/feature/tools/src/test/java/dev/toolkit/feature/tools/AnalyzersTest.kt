package dev.toolkit.feature.tools

import dev.toolkit.core.common.AppResult
import dev.toolkit.feature.tools.analyze.Analyzers
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalyzersTest {

    private fun text(result: AppResult<ToolOutput>): String =
        (result as AppResult.Success).value.lines.joinToString("\n")

    @Test fun `compose review flags privileged and sock without echoing secret value`() {
        val out = text(Analyzers.composeReview("""
            services:
              app:
                image: myapp:latest
                privileged: true
                environment:
                  - DB_PASSWORD=supersecretvalue123
                volumes:
                  - /var/run/docker.sock:/var/run/docker.sock
        """.trimIndent()))
        assertTrue(out.contains("privileged"))
        assertTrue(out.contains("docker.sock"))
        assertTrue(out.contains("未固定版本"))
        assertTrue(!out.contains("supersecretvalue123"))
    }

    @Test fun `log analysis counts levels and ips`() {
        val out = text(Analyzers.logAnalyze("""
            2026-10-23T10:00:01 INFO started from 10.0.0.8
            2026-10-23T10:00:02 ERROR disk full on /dev/sda from 10.0.0.8
            2026-10-23T10:00:03 WARN retrying
        """.trimIndent()))
        assertTrue(out.contains("ERROR 1"))
        assertTrue(out.contains("10.0.0.8×2"))
    }

    @Test fun `ssh log analysis rates small failures as observe`() {
        val out = text(Analyzers.sshLogAnalyze("""
            Oct 23 10:00:01 host sshd[1]: Failed password for invalid user admin from 203.0.113.9 port 51234 ssh2
            Oct 23 10:00:02 host sshd[1]: Failed password for root from 203.0.113.9 port 51235 ssh2
            Oct 23 10:00:03 host sshd[1]: Accepted publickey for zhang from 192.0.2.5 port 40000 ssh2
        """.trimIndent()))
        assertTrue(out.contains("登录失败 2 次"))
        assertTrue(out.contains("登录成功 1 次"))
        assertTrue(out.contains("观察"))
        assertTrue(out.contains("203.0.113.9×2"))
    }

    @Test fun `apt helper classifies sources and builds pin`() {
        val out = text(Analyzers.aptHelper(
            """
            deb http://archive.ubuntu.com/ubuntu noble main
            deb https://example.com/ubuntu noble main
            """.trimIndent(), "nginx", "1.24.*"))
        assertTrue(out.contains("[建议] archive.ubuntu.com"))
        assertTrue(out.contains("[第三方] example.com"))
        assertTrue(out.contains("Pin: version 1.24.*"))
    }

    @Test fun `env check never echoes values and flags weak secret by length only`() {
        val out = text(Analyzers.envCheck("""
            APP_NAME=demo
            API_TOKEN=abc123
            EMPTY_KEY=
            DUP=1
            DUP=2
        """.trimIndent()))
        assertTrue(!out.contains("abc123"))
        assertTrue(out.contains("[弱密钥] 键 API_TOKEN"))
        assertTrue(out.contains("长度仅 6"))
        assertTrue(out.contains("[空值] 键 EMPTY_KEY"))
        assertTrue(out.contains("[重复] 键 DUP"))
    }
}
