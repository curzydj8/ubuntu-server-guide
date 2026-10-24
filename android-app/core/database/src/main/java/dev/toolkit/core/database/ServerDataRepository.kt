package dev.toolkit.core.database

import kotlinx.coroutines.flow.Flow

/**
 * 第五阶段数据仓库：主机档案、TOFU 信任库、操作审计的统一入口。
 * 凭据本体永不入此——档案只存 Keystore 引用名（credentialRef）；
 * 审计的 command 必须由调用方脱敏后再写入。
 */
class ServerDataRepository(
    private val hosts: SshHostDao,
    private val hostKeys: HostKeyDao,
    private val audit: OpAuditDao,
) {
    fun observeHosts(): Flow<List<SshHostEntity>> = hosts.observeAll()

    suspend fun host(id: Long): SshHostEntity? = hosts.getById(id)

    suspend fun addHost(host: SshHostEntity): Long = hosts.insert(host)

    suspend fun updateHost(host: SshHostEntity) = hosts.update(host)

    suspend fun deleteHost(id: Long) = hosts.delete(id)

    suspend fun trustedFingerprint(host: String, port: Int): String? =
        hostKeys.get(host, port)?.fingerprint

    suspend fun trustHostKey(host: String, port: Int, fingerprint: String, keyType: String, nowMillis: Long) {
        val existing = hostKeys.get(host, port)
        hostKeys.upsert(
            HostKeyEntity(
                host = host, port = port, fingerprint = fingerprint, keyType = keyType,
                firstSeenAtMillis = existing?.firstSeenAtMillis ?: nowMillis,
                lastSeenAtMillis = nowMillis,
            )
        )
    }

    suspend fun forgetHostKey(host: String, port: Int) = hostKeys.delete(host, port)

    fun observeAudit(limit: Int = 200): Flow<List<OpAuditEntity>> = audit.observeRecent(limit)

    suspend fun appendAudit(entity: OpAuditEntity): Long = audit.insert(entity)
}
