package dev.toolkit.feature.tools.subnet

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.math.BigInteger
import java.net.InetAddress

/** IPv6 地址展开/压缩（N-21 配套）：展开为 8 组全零填充，压缩按最长零段折叠 :: 。 */
object Ipv6Format {

    fun expand(input: String): AppResult<String> {
        val groups = groupsOf(input) ?: return fail("IPv6 地址不合法")
        return AppResult.Success(groups.joinToString(":") { it.toString(16).padStart(4, '0') })
    }

    fun compress(input: String): AppResult<String> {
        val groups = groupsOf(input) ?: return fail("IPv6 地址不合法")
        // 找最长的连续零段（长度 ≥2 才折叠）
        var bestStart = -1; var bestLen = 0
        var i = 0
        while (i < 8) {
            if (groups[i] == 0) {
                var j = i
                while (j < 8 && groups[j] == 0) j++
                if (j - i > bestLen) { bestLen = j - i; bestStart = i }
                i = j
            } else i++
        }
        if (bestLen < 2) {
            return AppResult.Success(groups.joinToString(":") { it.toString(16) })
        }
        val left = groups.subList(0, bestStart).joinToString(":") { it.toString(16) }
        val right = groups.subList(bestStart + bestLen, 8).joinToString(":") { it.toString(16) }
        return AppResult.Success("$left::$right")
    }

    private fun groupsOf(input: String): List<Int>? {
        val addr = try { InetAddress.getByName(input.trim()) } catch (e: Exception) { return null }
        if (addr.address.size != 16) return null
        val v = BigInteger(1, addr.address)
        return (7 downTo 0).map { shift -> v.shiftRight(shift * 16).and(BigInteger("65535")).toInt() }
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
