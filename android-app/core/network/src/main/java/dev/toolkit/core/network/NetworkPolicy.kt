package dev.toolkit.core.network

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import kotlin.math.min

/** 联网策略（第四阶段实链使用）：所有请求必须带超时，破坏性操作禁止自动重试。 */
data class RetryPolicy(
    val maxAttempts: Int = 3,
    val baseDelayMillis: Long = 300,
    val maxDelayMillis: Long = 3_000,
) {
    init {
        require(maxAttempts in 1..5) { "重试次数 1..5" }
        require(baseDelayMillis > 0 && maxDelayMillis >= baseDelayMillis) { "退避参数非法" }
    }

    /** 第 attempt 次失败后（从 0 计）的退避毫秒数：指数退避 + 上限。 */
    fun delayFor(attempt: Int): Long {
        require(attempt >= 0) { "attempt 不能为负" }
        return min(maxDelayMillis, baseDelayMillis shl min(attempt, 10))
    }

    fun shouldRetry(attempt: Int, destructive: Boolean): Boolean =
        !destructive && attempt + 1 < maxAttempts
}

data class TimeoutPolicy(
    val connectMillis: Long = 5_000,
    val readMillis: Long = 10_000,
    val callMillis: Long = 20_000,
) {
    init { require(connectMillis > 0 && readMillis > 0 && callMillis >= readMillis) { "超时参数非法" } }
}

/** 网络客户端契约：第四阶段由 OkHttp 实现；现在先行冻结接口与策略。 */
interface NetworkClient {
    suspend fun getText(url: String, policy: RetryPolicy = RetryPolicy()): AppResult<String>
}
