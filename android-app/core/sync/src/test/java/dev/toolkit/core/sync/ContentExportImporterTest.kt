package dev.toolkit.core.sync

import dev.toolkit.core.common.AppResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ContentExportImporterTest {

    private fun zipOf(files: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            for ((name, content) in files) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(content.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun fixture(articleBody: String = "# 标题\n\n正文内容", tamperHash: Boolean = false): ByteArray {
        val bodyBytes = articleBody.toByteArray(Charsets.UTF_8)
        val sha = ContentExportImporter.sha256Hex(bodyBytes)
        val catalog = """{"schema_version":1,"sections":[{"section":"01-basics","title":"基础","order":1}],
            "articles":[{"article_id":"01-basics/01-demo","title":"示例","description":"d","section":"01-basics","order":1,
            "path":"01-basics/01-demo.md","sha256":"$sha","bytes":${bodyBytes.size}}]}"""
        val catalogHash = ContentExportImporter.sha256Hex(catalog.toByteArray(Charsets.UTF_8))
        val manifest = """{"schema_version":1,"generated_at":"2026-10-23T00:00:00Z","article_count":1,"section_count":1,
            "catalog_file":"catalog.json","catalog_sha256":"${if (tamperHash) "0".repeat(64) else catalogHash}","articles_prefix":"articles/"}"""
        return zipOf(mapOf(
            "manifest.json" to manifest,
            "catalog.json" to catalog,
            "articles/01-basics/01-demo.md" to articleBody,
        ))
    }

    @Test fun `valid package imports with counts and body`() {
        val pkg = (ContentExportImporter.importZip(fixture()) as AppResult.Success).value
        assertEquals(1, pkg.sections.size)
        assertEquals(1, pkg.articles.size)
        assertTrue(pkg.articles.first().body.contains("正文内容"))
    }

    @Test fun `tampered catalog hash rejected`() {
        assertTrue(ContentExportImporter.importZip(fixture(tamperHash = true)) is AppResult.Failure)
    }

    @Test fun `tampered article body rejected`() {
        val originalBody = "# 标题\n\n正文内容"
        val sha = ContentExportImporter.sha256Hex(originalBody.toByteArray(Charsets.UTF_8))
        val catalog = """{"schema_version":1,"sections":[],"articles":[{"article_id":"a/1","title":"t","description":"","section":"a","order":1,"path":"a/1.md","sha256":"$sha","bytes":${originalBody.toByteArray(Charsets.UTF_8).size}}]}"""
        val catalogHash = ContentExportImporter.sha256Hex(catalog.toByteArray(Charsets.UTF_8))
        val manifest = """{"schema_version":1,"generated_at":"","article_count":1,"section_count":0,"catalog_file":"catalog.json","catalog_sha256":"$catalogHash","articles_prefix":"articles/"}"""
        val files = mapOf(
            "manifest.json" to manifest.toByteArray(Charsets.UTF_8),
            "catalog.json" to catalog.toByteArray(Charsets.UTF_8),
            "articles/a/1.md" to "# 被篡改的正文".toByteArray(Charsets.UTF_8),
        )
        assertTrue(ContentExportImporter.importFiles(files) is AppResult.Failure)
    }

    @Test fun `missing files rejected`() {
        assertTrue(ContentExportImporter.importFiles(emptyMap()) is AppResult.Failure)
    }
}
