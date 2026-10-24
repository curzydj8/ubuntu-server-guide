package dev.toolkit.feature.settings

import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.MiniJson
import dev.toolkit.core.network.NetworkClient

/**
 * 检查更新：依次拉取主清单与备用清单（app/latest.json），与本机版本比对。
 * 主清单走 Workers，备用清单走 GitHub Pages；两份清单内容必须保持一致（见 SYNC_NOTES）。
 * 每条地址内部用 NetworkClient.getText 自带重试（幂等 GET，默认 3 次）；主备都失败才报失败。
 * 清单格式：{"versionName":"0.6.4","versionCode":13,"notes":"…","apkUrl":"https://…（可空）"}
 */
object UpdateChecker {

    const val MANIFEST_URL = "https://ubuntu-server-guide.lindemann-zhang.workers.dev/app/latest.json"

    /** 备用清单：与主清单同内容，随每次版本发布同步刷新（gh-pages 分支）。 */
    const val FALLBACK_MANIFEST_URL = "https://curzydj8.github.io/ubuntu-server-guide/app/latest.json"

    sealed interface Result {
        data object UpToDate : Result
        data class Available(val versionName: String, val notes: String, val apkUrl: String) : Result
        data class Failed(val reason: String) : Result
    }

    suspend fun check(client: NetworkClient, currentVersionCode: Int): Result {
        val primary = attempt(client, MANIFEST_URL, currentVersionCode)
        if (primary !is Result.Failed) return primary
        val fallback = attempt(client, FALLBACK_MANIFEST_URL, currentVersionCode)
        if (fallback !is Result.Failed) return fallback
        return Result.Failed(
            "主地址：${(primary as Result.Failed).reason}；备用地址：${(fallback as Result.Failed).reason}",
        )
    }

    private suspend fun attempt(client: NetworkClient, url: String, currentVersionCode: Int): Result =
        when (val r = client.getText(url)) {
            is AppResult.Failure -> Result.Failed(r.error.message)
            is AppResult.Success -> parse(r.value, currentVersionCode)
        }

    internal fun parse(json: String, currentVersionCode: Int): Result {
        val root = try {
            (MiniJson.parse(json) as? MiniJson.V.Obj)?.map
        } catch (e: Exception) { null } ?: return Result.Failed("版本清单格式无法解析")
        val remoteCode = (root["versionCode"] as? MiniJson.V.Num)?.raw?.toIntOrNull()
            ?: return Result.Failed("版本清单缺少 versionCode")
        val remoteName = (root["versionName"] as? MiniJson.V.Str)?.value ?: remoteCode.toString()
        val notes = (root["notes"] as? MiniJson.V.Str)?.value ?: ""
        val apkUrl = (root["apkUrl"] as? MiniJson.V.Str)?.value ?: ""
        return if (remoteCode > currentVersionCode) {
            Result.Available(remoteName, notes, apkUrl)
        } else {
            Result.UpToDate
        }
    }
}
