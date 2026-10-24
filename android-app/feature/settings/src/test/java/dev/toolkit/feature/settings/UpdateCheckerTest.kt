package dev.toolkit.feature.settings

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import dev.toolkit.core.network.NetworkClient
import dev.toolkit.core.network.RetryPolicy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerTest {

    /** 按 URL 脚本化返回的假客户端：check() 每地址只调一次 getText（重试在 getText 内部）。 */
    private class FakeClient(private val script: Map<String, AppResult<String>>) : NetworkClient {
        val calls = mutableListOf<String>()
        override suspend fun getText(url: String, policy: RetryPolicy): AppResult<String> {
            calls += url
            return script[url] ?: AppResult.Failure(AppError.Network("无脚本：$url"))
        }
    }

    private fun networkFailure(msg: String) = AppResult.Failure(AppError.Network(msg))

    @Test fun `primary failure falls back to Pages manifest`() = runTest {
        val client = FakeClient(
            mapOf(
                UpdateChecker.MANIFEST_URL to networkFailure("主地址不通"),
                UpdateChecker.FALLBACK_MANIFEST_URL to
                    AppResult.Success("""{"versionName":"0.6.4","versionCode":13,"notes":"","apkUrl":""}"""),
            ),
        )
        val r = UpdateChecker.check(client, currentVersionCode = 14)
        assertTrue(r is UpdateChecker.Result.UpToDate)
        assertEquals(
            listOf(UpdateChecker.MANIFEST_URL, UpdateChecker.FALLBACK_MANIFEST_URL),
            client.calls,
        )
    }

    @Test fun `primary success never touches fallback`() = runTest {
        val client = FakeClient(
            mapOf(
                UpdateChecker.MANIFEST_URL to
                    AppResult.Success("""{"versionName":"0.7.0","versionCode":15,"notes":"新","apkUrl":""}"""),
            ),
        )
        val r = UpdateChecker.check(client, currentVersionCode = 14)
        assertTrue(r is UpdateChecker.Result.Available)
        assertEquals(listOf(UpdateChecker.MANIFEST_URL), client.calls)
    }

    @Test fun `primary garbage body falls back too`() = runTest {
        val client = FakeClient(
            mapOf(
                UpdateChecker.MANIFEST_URL to AppResult.Success("not json"),
                UpdateChecker.FALLBACK_MANIFEST_URL to
                    AppResult.Success("""{"versionCode":14}"""),
            ),
        )
        val r = UpdateChecker.check(client, currentVersionCode = 14)
        assertTrue(r is UpdateChecker.Result.UpToDate)
    }

    @Test fun `both addresses failing reports both reasons`() = runTest {
        val client = FakeClient(
            mapOf(
                UpdateChecker.MANIFEST_URL to networkFailure("主地址不通"),
                UpdateChecker.FALLBACK_MANIFEST_URL to networkFailure("备用地址不通"),
            ),
        )
        val r = UpdateChecker.check(client, currentVersionCode = 14)
        assertTrue(r is UpdateChecker.Result.Failed)
        val reason = (r as UpdateChecker.Result.Failed).reason
        assertTrue(reason.contains("主地址不通"))
        assertTrue(reason.contains("备用地址不通"))
    }

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
