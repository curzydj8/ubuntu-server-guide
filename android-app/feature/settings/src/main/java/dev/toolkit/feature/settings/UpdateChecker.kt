package dev.toolkit.feature.settings

import dev.toolkit.core.common.AppResult
import dev.toolkit.core.common.MiniJson
import dev.toolkit.core.network.OkHttpNetworkClient

/**
 * 检查更新：拉取站点上的版本清单（app/latest.json），与本机版本比对。
 * 清单格式：{"versionName":"0.5.0","versionCode":5,"notes":"…","apkUrl":"https://…（可空）"}
 */
object UpdateChecker {

    const val MANIFEST_URL = "https://ubuntu-server-guide.lindemann-zhang.workers.dev/app/latest.json"

    sealed interface Result {
        data object UpToDate : Result
        data class Available(val versionName: String, val notes: String, val apkUrl: String) : Result
        data class Failed(val reason: String) : Result
    }

    suspend fun check(client: OkHttpNetworkClient, currentVersionCode: Int): Result {
        return when (val r = client.executeOnce(MANIFEST_URL)) {
            is AppResult.Failure -> Result.Failed(r.error.message)
            is AppResult.Success -> parse(r.value.second, currentVersionCode)
        }
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
