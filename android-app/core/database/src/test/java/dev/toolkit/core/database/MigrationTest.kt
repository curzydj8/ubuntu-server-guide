package dev.toolkit.core.database

import androidx.sqlite.db.SupportSQLiteDatabase
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 迁移脚本的 JVM 侧验证：用动态代理记录 execSQL，断言 2->3 迁移的语句集合完整。
 * （真机上的 Room 运行时校验在第五阶段真机验收时补做。）
 */
class Migration23Test {

    private fun recordingDb(statements: MutableList<String>): SupportSQLiteDatabase {
        val handler = InvocationHandler { _, method, args ->
            if (method.name == "execSQL" && !args.isNullOrEmpty()) {
                statements += args[0] as String
            }
            when (method.returnType) {
                java.lang.Boolean.TYPE -> false
                java.lang.Integer.TYPE -> 0
                java.lang.Long.TYPE -> 0L
                else -> null
            }
        }
        return Proxy.newProxyInstance(
            javaClass.classLoader, arrayOf(SupportSQLiteDatabase::class.java), handler,
        ) as SupportSQLiteDatabase
    }

    @Test fun `migration 2 to 3 emits expected statements`() {
        val sql = mutableListOf<String>()
        ToolkitDatabase.MIGRATION_2_3.migrate(recordingDb(sql))
        assertEquals(7, sql.size)
        assertTrue(sql.any { it.startsWith("ALTER TABLE ssh_hosts ADD COLUMN groupName") })
        assertTrue(sql.any { it.startsWith("ALTER TABLE ssh_hosts ADD COLUMN authType") })
        assertTrue(sql.any { it.contains("CREATE TABLE IF NOT EXISTS host_keys") && it.contains("PRIMARY KEY(host, port)") })
        assertTrue(sql.any { it.contains("INSERT OR IGNORE INTO host_keys") && it.contains("hostKeyFingerprint") })
        assertTrue(sql.any { it.contains("CREATE TABLE IF NOT EXISTS op_audit") })
    }
}
