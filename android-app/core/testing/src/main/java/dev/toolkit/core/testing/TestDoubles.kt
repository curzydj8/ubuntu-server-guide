package dev.toolkit.core.testing

import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.DispatcherProvider
import dev.toolkit.core.security.CredentialVault
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher

/** 测试用调度器提供者：全部指向同一个 TestDispatcher。 */
class TestDispatcherProvider(private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()) :
    DispatcherProvider {
    override val main: CoroutineDispatcher = dispatcher
    override val io: CoroutineDispatcher = dispatcher
    override val default: CoroutineDispatcher = dispatcher
}

/** 内存版保险库：供各 feature 的 JVM 单元测试验证凭据存取契约（不触 Keystore）。 */
class InMemoryCredentialVault : CredentialVault {
    private val store = mutableMapOf<String, CharArray>()
    override suspend fun put(ref: String, secret: CharArray): AppResult<Unit> {
        store[ref] = secret.copyOf()
        return AppResult.Success(Unit)
    }
    override suspend fun get(ref: String): AppResult<CharArray?> =
        AppResult.Success(store[ref]?.copyOf())
    override suspend fun remove(ref: String): AppResult<Unit> {
        store.remove(ref)
        return AppResult.Success(Unit)
    }
    override suspend fun contains(ref: String): Boolean = store.containsKey(ref)
}
