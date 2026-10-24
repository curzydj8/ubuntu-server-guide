package dev.toolkit.core.sync

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.MiniJson
import dev.toolkit.core.common.AppResult
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * 内容同步协议 V1 消费端：导入 content-export.zip 并全链校验——
 * manifest 的目录哈希、文章计数、逐篇 sha256 与字节数，任一不符整包拒绝（不写半成品）。
 */
object ContentExportImporter {

    data class Section(val id: String, val title: String, val order: Int)
    data class Article(
        val id: String, val title: String, val description: String,
        val section: String, val order: Int, val sha256: String, val body: String,
    )
    data class Package(val sections: List<Section>, val articles: List<Article>, val generatedAt: String)

    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(java.util.Locale.ROOT, it) }

    fun importZip(zipBytes: ByteArray): AppResult<Package> {
        val files = mutableMapOf<String, ByteArray>()
        try {
            ZipInputStream(ByteArrayInputStream(zipBytes)).use { zip ->
                var entry = zip.nextEntry
                while (entry != null) {
                    if (!entry.isDirectory) files[entry.name] = zip.readBytes()
                    entry = zip.nextEntry
                }
            }
        } catch (e: Exception) {
            return fail("导出包不是合法 zip：${e.javaClass.simpleName}")
        }
        return importFiles(files)
    }

    fun importFiles(files: Map<String, ByteArray>): AppResult<Package> {
        val manifestBytes = files["manifest.json"] ?: return fail("导出包缺 manifest.json")
        val catalogBytes = files["catalog.json"] ?: return fail("导出包缺 catalog.json")
        val manifest = parseObj(manifestBytes) ?: return fail("manifest.json 不合法")
        val catalog = parseObj(catalogBytes) ?: return fail("catalog.json 不合法")

        val expectedCatalogHash = (manifest["catalog_sha256"] as? MiniJson.V.Str)?.value
            ?: return fail("manifest 缺 catalog_sha256")
        if (sha256Hex(catalogBytes) != expectedCatalogHash) {
            return fail("catalog 哈希与 manifest 不一致，导出包已损坏或被替换")
        }
        val declaredCount = (manifest["article_count"] as? MiniJson.V.Num)?.raw?.toIntOrNull()
            ?: return fail("manifest 缺 article_count")

        val sections = ((catalog["sections"] as? MiniJson.V.Arr)?.items ?: emptyList()).mapNotNull { item ->
            val o = (item as? MiniJson.V.Obj)?.map ?: return@mapNotNull null
            Section(
                id = (o["section"] as? MiniJson.V.Str)?.value ?: return@mapNotNull null,
                title = (o["title"] as? MiniJson.V.Str)?.value ?: "",
                order = (o["order"] as? MiniJson.V.Num)?.raw?.toIntOrNull() ?: 0,
            )
        }
        val articleItems = (catalog["articles"] as? MiniJson.V.Arr)?.items ?: return fail("catalog 缺 articles")
        if (articleItems.size != declaredCount) {
            return fail("文章数不符：manifest 声明 $declaredCount，catalog 实际 ${articleItems.size}")
        }
        val articles = mutableListOf<Article>()
        val seenIds = mutableSetOf<String>()
        for (item in articleItems) {
            val o = (item as? MiniJson.V.Obj)?.map ?: return fail("catalog 文章条目结构不合法")
            val id = (o["article_id"] as? MiniJson.V.Str)?.value ?: return fail("文章缺 article_id")
            if (!seenIds.add(id)) return fail("文章 ID 重复：$id")
            val path = (o["path"] as? MiniJson.V.Str)?.value ?: return fail("文章 $id 缺 path")
            val sha = (o["sha256"] as? MiniJson.V.Str)?.value ?: return fail("文章 $id 缺 sha256")
            val declaredBytes = (o["bytes"] as? MiniJson.V.Num)?.raw?.toLongOrNull()
            val bodyBytes = files["articles/$path"] ?: return fail("导出包缺文章文件：articles/$path")
            if (declaredBytes != null && bodyBytes.size.toLong() != declaredBytes) {
                return fail("文章 $id 字节数不符")
            }
            if (sha256Hex(bodyBytes) != sha) return fail("文章 $id 哈希不符")
            articles += Article(
                id = id,
                title = (o["title"] as? MiniJson.V.Str)?.value ?: id,
                description = (o["description"] as? MiniJson.V.Str)?.value ?: "",
                section = (o["section"] as? MiniJson.V.Str)?.value ?: "",
                order = (o["order"] as? MiniJson.V.Num)?.raw?.toIntOrNull() ?: 0,
                sha256 = sha,
                body = bodyBytes.toString(Charsets.UTF_8),
            )
        }
        val generatedAt = (manifest["generated_at"] as? MiniJson.V.Str)?.value ?: ""
        return AppResult.Success(Package(sections, articles, generatedAt))
    }

    private fun parseObj(bytes: ByteArray): Map<String, MiniJson.V>? =
        try {
            (MiniJson.parse(bytes.toString(Charsets.UTF_8)) as? MiniJson.V.Obj)?.map
        } catch (e: Exception) { null }

    private fun fail(msg: String) = AppResult.Failure(AppError.Io(msg))
}
