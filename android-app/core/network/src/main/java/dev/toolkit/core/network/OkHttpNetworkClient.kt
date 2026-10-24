package dev.toolkit.core.network

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * NetworkClient 的 OkHttp 实现：超时走 TimeoutPolicy；重试只对幂等 GET 且受 RetryPolicy 约束
 * （破坏性请求永不自动重试）；每次请求都带明确的超时，不做无界等待。
 */
class OkHttpNetworkClient(
    private val timeouts: TimeoutPolicy = TimeoutPolicy(),
    private val clientFactory: (TimeoutPolicy) -> OkHttpClient = { t ->
        OkHttpClient.Builder()
            .connectTimeout(t.connectMillis, TimeUnit.MILLISECONDS)
            .readTimeout(t.readMillis, TimeUnit.MILLISECONDS)
            .callTimeout(t.callMillis, TimeUnit.MILLISECONDS)
            .build()
    },
) : NetworkClient {

    override suspend fun getText(url: String, policy: RetryPolicy): AppResult<String> {
        var attempt = 0
        while (true) {
            when (val result = execute(url, emptyMap())) {
                is AppResult.Success -> return AppResult.Success(result.value.second)
                is AppResult.Failure -> {
                    val retryable = result.error is AppError.Network
                    if (!retryable || !policy.shouldRetry(attempt, destructive = false)) return result
                    delay(policy.delayFor(attempt))
                    attempt++
                }
            }
        }
    }

    /** 执行一次 GET（不重试），供需要精细控制的调用方（如 DNS、取头）直接使用。 */
    fun executeOnce(url: String, headers: Map<String, String> = emptyMap()): AppResult<Pair<Int, String>> =
        execute(url, headers).let { r ->
            when (r) {
                is AppResult.Success -> AppResult.Success(r.value)
                is AppResult.Failure -> r
            }
        }

    private fun execute(url: String, headers: Map<String, String>): AppResult<Pair<Int, String>> {
        val request = Request.Builder().url(url).apply {
            headers.forEach { (k, v) -> header(k, v) }
        }.get().build()
        return try {
            clientFactory(timeouts).newCall(request).execute().use { response: Response ->
                val body = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    AppResult.Success(response.code to body)
                } else {
                    AppResult.Failure(AppError.Network("HTTP ${response.code}", response.code))
                }
            }
        } catch (e: IOException) {
            AppResult.Failure(AppError.Network("网络请求失败：${e.message ?: e.javaClass.simpleName}"))
        } catch (e: IllegalArgumentException) {
            AppResult.Failure(AppError.Validation("URL 不合法：${e.message}"))
        }
    }

    /** 取响应头（HEAD 优先，服务器不支持时回退 GET 只读头）。 */
    fun fetchHeaders(url: String): AppResult<Map<String, List<String>>> {
        val client = clientFactory(timeouts)
        return try {
            val headReq = Request.Builder().url(url).head().build()
            client.newCall(headReq).execute().use { resp ->
                if (resp.code == 405 || resp.code == 501) {
                    val getReq = Request.Builder().url(url).get().build()
                    client.newCall(getReq).execute().use { getResp ->
                        AppResult.Success(getResp.headers.toMultimap().mapKeys { it.key.lowercase() })
                    }
                } else {
                    AppResult.Success(resp.headers.toMultimap().mapKeys { it.key.lowercase() })
                }
            }
        } catch (e: IOException) {
            AppResult.Failure(AppError.Network("取响应头失败：${e.message ?: e.javaClass.simpleName}"))
        } catch (e: IllegalArgumentException) {
            AppResult.Failure(AppError.Validation("URL 不合法：${e.message}"))
        }
    }
}
