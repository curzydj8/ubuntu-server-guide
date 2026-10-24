package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratorsTest {

    @Test fun `netplan static renders yaml with gateway and dns`() {
        val out = (NetplanLogic.generate(NetplanLogic.Input("eth0", false, "192.168.1.10/24", "192.168.1.1", listOf("1.1.1.1"))) as AppResult.Success).value
        assertTrue(out.contains("addresses:\n        - 192.168.1.10/24"))
        assertTrue(out.contains("via: 192.168.1.1"))
        assertTrue(out.contains("addresses: [1.1.1.1]"))
    }

    @Test fun `netplan rejects bad cidr`() {
        assertTrue(NetplanLogic.generate(NetplanLogic.Input("eth0", false, "999.1.1.1/24", "", emptyList())) is AppResult.Failure)
    }

    @Test fun `ufw puts ssh first and enables at end`() {
        val out = (UfwLogic.generate(listOf("https", "ssh"), emptyList(), "") as AppResult.Success).value
        assertTrue(out.indexOf("allow 22/tcp") in 0 until out.indexOf("allow 443/tcp"))
        assertTrue(out.contains("sudo ufw enable"))
    }

    @Test fun `ufw ipv6 source accepted ipv4 garbage rejected`() {
        assertTrue(UfwLogic.validateSource("2001:db8::/32") is AppResult.Success)
        assertTrue(UfwLogic.validateSource("not-an-ip") is AppResult.Failure)
        assertTrue(UfwLogic.generate(listOf("ssh"), emptyList(), "10.0.0.0/8") is AppResult.Success)
    }

    @Test fun `ssh command quotes key path and appends remote command`() {
        val out = (SshCommandLogic.ssh("ubuntu", "192.0.2.10", 2222, "/home/u/my key.pem", "", "uptime") as AppResult.Success).value
        assertTrue(out.startsWith("ssh -p 2222"))
        assertTrue(out.contains("-i '/home/u/my key.pem'"))
        assertTrue(out.endsWith("'uptime'"))
    }

    @Test fun `sshd refuses all auth disabled`() {
        assertTrue(SshdLogic.generate(22, "no", passwordAuth = false, pubkeyAuth = false, "", 3) is AppResult.Failure)
        assertTrue(SshdLogic.generate(22, "prohibit-password", false, true, "alice", 3) is AppResult.Success)
    }

    @Test fun `systemd unit requires absolute exec`() {
        assertTrue(SystemdLogic.unit("d", "relative/cmd", "", "", "no", false) is AppResult.Failure)
        val ok = (SystemdLogic.unit("d", "/usr/bin/x", "root", "", "on-failure", true) as AppResult.Success).value
        assertTrue(ok.contains("WantedBy=multi-user.target"))
    }

    @Test fun `timer rejects shell metachars`() {
        assertTrue(SystemdLogic.timer("backup", "daily; rm -rf /", true) is AppResult.Failure)
        assertTrue(SystemdLogic.timer("backup", "*-*-* 02:00:00", true) is AppResult.Success)
    }

    @Test fun `nginx renders websocket headers only when enabled`() {
        val plain = (NginxLogic.reverseProxy("a.com", "127.0.0.1", 8080, false, 10) as AppResult.Success).value
        assertFalse(plain.contains("Upgrade"))
        val ws = (NginxLogic.reverseProxy("a.com", "127.0.0.1", 8080, true, 10) as AppResult.Success).value
        assertTrue(ws.contains("proxy_set_header Upgrade"))
    }

    @Test fun `compose assembles services and volumes`() {
        val out = (ComposeLogic.generate(listOf("mysql", "redis")) as AppResult.Success).value
        assertTrue(out.contains("image: mysql:8.4"))
        assertTrue(out.contains("volumes:\n  mysql-data:"))
        assertTrue(ComposeLogic.generate(emptyList()) is AppResult.Failure)
    }

    @Test fun `lvm xfs uses growfs ext4 uses resize2fs`() {
        val ext = (LvmLogic.extendSteps("vg0", "data", "+10G", "ext4", "") as AppResult.Success).value
        assertTrue(ext.contains("resize2fs /dev/vg0/data"))
        val xfs = (LvmLogic.extendSteps("vg0", "data", "+10G", "xfs", "/dev/sdb") as AppResult.Success).value
        assertTrue(xfs.contains("xfs_growfs"))
        assertTrue(xfs.contains("vgextend vg0 /dev/sdb"))
    }

    @Test fun `cloud init validates username and key`() {
        assertTrue(CloudInitLogic.generate("Bad Name", "", emptyList(), "") is AppResult.Failure)
        val ok = (CloudInitLogic.generate("deploy", "ssh-ed25519 AAAA", listOf("curl"), "Asia/Shanghai") as AppResult.Success).value
        assertTrue(ok.startsWith("#cloud-config"))
        assertTrue(ok.contains("ssh_pwauth: false"))
    }

    @Test fun `actions generates runtime setup`() {
        val out = (ActionsLogic.generate("CI", "main", "python", "3.12") as AppResult.Success).value
        assertTrue(out.contains("actions/setup-python@v5"))
        assertTrue(ActionsLogic.generate("CI", "main", "ruby", "3") is AppResult.Failure)
    }

    @Test fun `curl quotes body and headers`() {
        val out = (CurlLogic.build("https://example.com/api", "POST", listOf("Content-Type: application/json"), "{\"a\":1}", false) as AppResult.Success).value
        assertTrue(out.contains("-X POST"))
        assertTrue(out.contains("-H 'Content-Type: application/json'"))
    }

    @Test fun `git force push only with lease`() {
        val out = (GitLogic.generate("force-push-safe", "main") as AppResult.Success).value
        assertTrue(out.contains("--force-with-lease"))
        assertFalse(out.lines().any { it.trim().startsWith("git push --force ") || it.trim() == "git push --force" })
        assertEquals(false, out.contains("push --force origin"))
        assertTrue(GitLogic.generate("nope", "") is AppResult.Failure)
        assertTrue(GitLogic.generate("new-branch", "a;rm") is AppResult.Failure)
    }
}
