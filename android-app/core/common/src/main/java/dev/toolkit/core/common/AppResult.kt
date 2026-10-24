package dev.toolkit.core.common

/** 全项目统一的结果封装：业务逻辑不抛裸异常给 UI，错误一律走 AppError。 */
sealed interface AppResult<out T> {
    data class Success<T>(val value: T) : AppResult<T>
    data class Failure(val error: AppError) : AppResult<Nothing>
}

sealed interface AppError {
    val message: String

    data class Validation(override val message: String) : AppError
    data class Io(override val message: String, val cause: Throwable? = null) : AppError
    data class Network(override val message: String, val httpCode: Int? = null) : AppError
    data class Security(override val message: String) : AppError
    data class Unknown(override val message: String, val cause: Throwable? = null) : AppError
}

inline fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> = when (this) {
    is AppResult.Success -> AppResult.Success(transform(value))
    is AppResult.Failure -> this
}
