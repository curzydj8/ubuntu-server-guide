package dev.toolkit.feature.tools.subnet

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import java.math.BigInteger
import java.net.InetAddress

/** N-21 子网计算纯逻辑：IPv4 CIDR 与 IPv6 前缀的网络地址/掩码/范围计算。 */
object SubnetLogic {

    data class Ipv4Subnet(
        val network: String, val broadcast: String, val netmask: String,
        val firstUsable: String, val lastUsable: String, val totalHosts: Long, val usableHosts: Long,
    )

    data class Ipv6Subnet(
        val network: String, val prefixLength: Int, val firstAddress: String, val lastAddress: String,
        val totalAddresses: BigInteger,
    )

    fun ipv4(input: String): AppResult<Ipv4Subnet> {
        val parts = input.trim().split("/")
        if (parts.size != 2) return failure("请输入 IPv4 CIDR（如 192.168.1.10/24）")
        val prefix = parts[1].toIntOrNull() ?: return failure("前缀必须是 0..32 的整数")
        if (prefix !in 0..32) return failure("前缀必须是 0..32 的整数")
        val ip = parseIpv4(parts[0]) ?: return failure("IPv4 地址不合法")
        val mask = if (prefix == 0) 0L else (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
        val network = ip and mask
        val broadcast = network or (0xFFFFFFFFL xor mask)
        val total = 1L shl (32 - prefix)
        val usable = when {
            prefix >= 31 -> 0L
            else -> total - 2
        }
        val first = if (prefix >= 31) network else network + 1
        val last = if (prefix >= 31) broadcast else broadcast - 1
        return AppResult.Success(
            Ipv4Subnet(
                network = toDotted(network), broadcast = toDotted(broadcast), netmask = toDotted(mask),
                firstUsable = toDotted(first), lastUsable = toDotted(last),
                totalHosts = total, usableHosts = usable,
            )
        )
    }

    fun ipv6(input: String): AppResult<Ipv6Subnet> {
        val parts = input.trim().split("/")
        if (parts.size != 2) return failure("请输入 IPv6 CIDR（如 2001:db8::1/64）")
        val prefix = parts[1].toIntOrNull() ?: return failure("前缀必须是 0..128 的整数")
        if (prefix !in 0..128) return failure("前缀必须是 0..128 的整数")
        val addr = try {
            val parsed = InetAddress.getByName(parts[0])
            if (parsed.address.size != 16) return failure("IPv6 地址不合法")
            BigInteger(1, parsed.address)
        } catch (e: Exception) {
            return failure("IPv6 地址不合法")
        }
        val hostBits = 128 - prefix
        val network = if (hostBits == 128) BigInteger.ZERO else addr.shiftRight(hostBits).shiftLeft(hostBits)
        val last = network.add(BigInteger.ONE.shiftLeft(hostBits)).subtract(BigInteger.ONE)
        return AppResult.Success(
            Ipv6Subnet(
                network = toIpv6(network), prefixLength = prefix,
                firstAddress = toIpv6(network), lastAddress = toIpv6(last),
                totalAddresses = BigInteger.ONE.shiftLeft(hostBits),
            )
        )
    }

    private fun failure(msg: String) = AppResult.Failure(AppError.Validation(msg))

    private fun parseIpv4(s: String): Long? {
        val octets = s.split(".")
        if (octets.size != 4) return null
        var value = 0L
        for (o in octets) {
            val n = o.toIntOrNull() ?: return null
            if (n !in 0..255 || o != n.toString()) return null
            value = (value shl 8) or n.toLong()
        }
        return value
    }

    private fun toDotted(v: Long): String =
        "${(v shr 24) and 0xFF}.${(v shr 16) and 0xFF}.${(v shr 8) and 0xFF}.${v and 0xFF}"

    private fun toIpv6(v: BigInteger): String {
        val bytes = ByteArray(16)
        val raw = v.toByteArray()
        val srcPos = maxOf(0, raw.size - 16)
        val len = minOf(raw.size, 16)
        System.arraycopy(raw, srcPos, bytes, 16 - len, len)
        return InetAddress.getByAddress(bytes).hostAddress
    }
}
