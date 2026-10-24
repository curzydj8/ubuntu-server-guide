package dev.toolkit.app

import android.content.Context
import dev.toolkit.core.common.DefaultDispatcherProvider
import dev.toolkit.core.common.DispatcherProvider
import dev.toolkit.core.database.ToolkitDatabase
import dev.toolkit.core.database.ToolUsageRepository
import dev.toolkit.core.knowledge.KnowledgeRepository
import dev.toolkit.core.sync.ContentExportImporter
import dev.toolkit.feature.knowledge.KnowledgeViewModel
import dev.toolkit.core.security.KeystoreCredentialVault
import dev.toolkit.feature.dashboard.DashboardViewModel
import dev.toolkit.feature.settings.SettingsRepository
import dev.toolkit.feature.tools.ToolsRegistryImpl
import java.io.File

/** 手工依赖装配（第一阶段不引入 DI 框架）：全应用唯一实例容器。 */
class AppContainer(context: Context) {
    val dispatchers: DispatcherProvider = DefaultDispatcherProvider()

    private val database: ToolkitDatabase = ToolkitDatabase.create(context)

    val usageRepository: ToolUsageRepository =
        ToolUsageRepository(database.favoriteToolDao(), database.recentToolDao())

    val settingsRepository: SettingsRepository = SettingsRepository(context.applicationContext)

    @Suppress("unused")
    val credentialVault: KeystoreCredentialVault =
        KeystoreCredentialVault(File(context.applicationContext.filesDir, "vault"))

    val knowledgeRepository: KnowledgeRepository =
        KnowledgeRepository(database.knowledgeArticleDao())

    // 第五阶段：服务器数据仓库 + TOFU 信任库（Room 实现）+ SSH 传输层
    val serverDataRepository: dev.toolkit.core.database.ServerDataRepository =
        dev.toolkit.core.database.ServerDataRepository(
            database.sshHostDao(), database.hostKeyDao(), database.opAuditDao(),
        )

    val hostKeyStore: dev.toolkit.core.ssh.HostKeyStore =
        object : dev.toolkit.core.ssh.HostKeyStore {
            override suspend fun lookup(host: String, port: Int): String? =
                serverDataRepository.trustedFingerprint(host, port)

            override suspend fun save(host: String, port: Int, fingerprint: String, keyType: String) {
                serverDataRepository.trustHostKey(
                    host, port, fingerprint, keyType, System.currentTimeMillis(),
                )
            }
        }

    val sshTransport: dev.toolkit.core.ssh.SshTransport =
        dev.toolkit.core.ssh.SshTransport(hostKeyStore)

    fun dashboardViewModel(): DashboardViewModel =
        DashboardViewModel(ToolsRegistryImpl, usageRepository, dispatchers)

    fun knowledgeViewModel(): KnowledgeViewModel =
        KnowledgeViewModel(knowledgeRepository, dispatchers)

    fun serversViewModel(): dev.toolkit.feature.servers.ServersViewModel =
        dev.toolkit.feature.servers.ServersViewModel(
            serverDataRepository, credentialVault, sshTransport, dispatchers,
        )

    /** 首次启动导入内置内容包（已存在文章则跳过）；返回导入篇数或已存在标记 -1。 */
    suspend fun importBundledContentIfEmpty(context: Context): Int {
        if (knowledgeRepository.count() > 0) return -1
        val zipBytes = context.assets.open("content-export.zip").use { it.readBytes() }
        return when (val r = ContentExportImporter.importZip(zipBytes)) {
            is dev.toolkit.core.common.AppResult.Success -> knowledgeRepository.importPackage(r.value)
            is dev.toolkit.core.common.AppResult.Failure ->
                throw IllegalStateException("内置内容包校验失败：${r.error.message}")
        }
    }
}
