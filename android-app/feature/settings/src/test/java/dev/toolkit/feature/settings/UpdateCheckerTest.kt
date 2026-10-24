package dev.toolkit.feature.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerTest {
    @Test fun `newer remote reported as available`() {
        val r = UpdateChecker.parse(
            """{"versionName":"0.6.0","versionCode":6,"notes":"新功能","apkUrl":"https://example.com/a.apk"}""",
            currentVersionCode = 5,
        )
        assertTrue(r is UpdateChecker.Result.Available)
        assertEquals("0.6.0", (r as UpdateChecker.Result.Available).versionName)
    }

    @Test fun `same or older remote is up to date`() {
        assertTrue(UpdateChecker.parse("""{"versionCode":5}""", 5) is UpdateChecker.Result.UpToDate)
        assertTrue(UpdateChecker.parse("""{"versionCode":4}""", 5) is UpdateChecker.Result.UpToDate)
    }

    @Test fun `bad manifest fails gracefully`() {
        assertTrue(UpdateChecker.parse("not json", 5) is UpdateChecker.Result.Failed)
        assertTrue(UpdateChecker.parse("""{"versionName":"x"}""", 5) is UpdateChecker.Result.Failed)
    }
}
