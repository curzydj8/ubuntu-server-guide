package dev.toolkit.feature.tools.misc

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class Wave3LogicTest {

    @Test fun `cron parses and computes next runs for weekday schedule`() {
        val expr = (CronLogic.parse("30 2 * * 1-5") as AppResult.Success).value
        // 2026-10-23 是周五；从周五 03:00 起，下一次应为周一（2026-10-26）02:30
        val runs = CronLogic.nextRuns(expr, LocalDateTime.of(2026, 10, 23, 3, 0))
        assertEquals(LocalDateTime.of(2026, 10, 26, 2, 30), runs.first())
    }

    @Test fun `cron step and validation`() {
        assertTrue(CronLogic.parse("*/15 * * * *") is AppResult.Success)
        assertTrue(CronLogic.parse("61 * * * *") is AppResult.Failure)
        assertTrue(CronLogic.parse("* * * *") is AppResult.Failure)
        val every15 = (CronLogic.parse("*/15 * * * *") as AppResult.Success).value
        val runs = CronLogic.nextRuns(every15, LocalDateTime.of(2026, 1, 1, 0, 7))
        assertEquals(LocalDateTime.of(2026, 1, 1, 0, 15), runs.first())
    }

    @Test fun `planner formulas`() {
        val disk = (PlannerLogic.diskPlan(5.0, 30, 1.5, 200.0) as AppResult.Success).value
        assertTrue(disk[0].contains("225"))
        val bk = (PlannerLogic.backupPlan(24.0, 30.0, 100.0, 50.0) as AppResult.Success).value
        assertTrue(bk[2].contains("2.5"))
        val mig = (PlannerLogic.migrationPlan(500.0, 100.0, 4.0) as AppResult.Success).value
        assertTrue(mig[1].contains("增量"))
    }

    @Test fun `firewall matrix search`() {
        assertEquals(1, FirewallMatrixLogic.search("mysql").size)
        assertTrue(FirewallMatrixLogic.search("极高").size >= 4)
        assertTrue(FirewallMatrixLogic.search("").size >= 10)
    }

    @Test fun `json to yaml subset conversion`() {
        val yaml = (FormatLogic.jsonToYaml("{\"name\":\"demo\",\"replicas\":2,\"tags\":[\"a\",\"b\"],\"cfg\":{\"tls\":true}}") as AppResult.Success).value
        assertTrue(yaml.contains("name: demo"))
        assertTrue(yaml.contains("replicas: 2"))
        assertTrue(yaml.contains("- a"))
        assertTrue(yaml.contains("  tls: true"))
    }

    @Test fun `yaml to json roundtrip`() {
        val yaml = "name: demo\nreplicas: 2\nnested:\n  x: 1\n  y: two\nlist:\n  - 1\n  - 2"
        val json = (FormatLogic.yamlToJson(yaml) as AppResult.Success).value
        val back = (FormatLogic.jsonToYaml(json) as AppResult.Success).value
        assertTrue(back.contains("name: demo"))
        assertTrue(back.contains("replicas: 2"))
        val node = (FormatLogic.parseJson(json) as AppResult.Success).value
        assertTrue(node is FormatLogic.Node.Obj)
    }

    @Test fun `json validation rejects garbage`() {
        assertTrue(FormatLogic.parseJson("{bad json") is AppResult.Failure)
        assertTrue(FormatLogic.parseJson("[1,2,]") is AppResult.Failure)
        assertTrue(FormatLogic.validateJson("{\"a\":[1,2,{\"b\":null}]}") is AppResult.Success)
    }

    @Test fun `regex finds matches with groups and warns on nesting`() {
        val r = (RegexLogic.test("(\\d+)-(\\d+)", "a 12-34 b 56-78", false) as AppResult.Success).value
        assertEquals(2, r.matches.size)
        assertEquals(listOf("12", "34"), r.matches.first().groups)
        val danger = (RegexLogic.test("(a+)+$", "aaaa", false) as AppResult.Success).value
        assertTrue(danger.warnings.any { it.contains("回溯风险") })
        assertTrue(RegexLogic.test("(", "x", false) is AppResult.Failure)
    }
}
