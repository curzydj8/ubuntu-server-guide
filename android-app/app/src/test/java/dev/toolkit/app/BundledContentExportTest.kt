package dev.toolkit.app

import dev.toolkit.core.common.AppResult
import dev.toolkit.core.sync.ContentExportImporter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 真实导出包实测：对 App 内置的 content-export.zip 跑完整导入校验
 * （目录哈希链 + 文章计数 + 逐篇 sha256），与导出端自检口径一致。
 */
class BundledContentExportTest {
    @Test fun `bundled export imports fully`() {
        val zip = File("src/main/assets/content-export.zip")
        assertTrue("内置内容包应存在", zip.exists())
        val result = ContentExportImporter.importZip(zip.readBytes())
        assertTrue("导入应成功：$result", result is AppResult.Success)
        val pkg = (result as AppResult.Success).value
        assertEquals(99, pkg.articles.size)
        assertEquals(17, pkg.sections.size)
        assertTrue(pkg.articles.all { it.body.isNotBlank() })
    }
}
