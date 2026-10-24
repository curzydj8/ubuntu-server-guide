package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import dev.toolkit.feature.tools.subnet.SubnetLogic

/** Netplan 生成器（编号外）：表单 → YAML；地址/网关/DNS 校验复用子网工具口径。 */
object NetplanLogic {
    data class Input(
        val iface: String, val dhcp: Boolean, val addressCidr: String,
        val gateway: String, val dns: List<String>,
    )

    fun generate(input: Input): AppResult<String> {
        if (!input.iface.matches(Regex("[A-Za-z0-9_.:-]{1,15}"))) {
            return fail("接口名不合法（如 eth0、ens33）")
        }
        val sb = StringBuilder()
        sb.appendLine("network:")
        sb.appendLine("  version: 2")
        sb.appendLine("  ethernets:")
        sb.appendLine("    ${input.iface}:")
        if (input.dhcp) {
            sb.appendLine("      dhcp4: true")
            return AppResult.Success(sb.toString().trimEnd())
        }
        val check = SubnetLogic.ipv4(input.addressCidr)
        if (check is AppResult.Failure) return fail("静态地址须为 IPv4 CIDR：" + check.error.message)
        sb.appendLine("      dhcp4: false")
        sb.appendLine("      addresses:")
        sb.appendLine("        - ${input.addressCidr}")
        if (input.gateway.isNotBlank()) {
            if (SubnetLogic.ipv4(input.gateway + "/32") is AppResult.Failure) {
                return fail("网关不是合法 IPv4 地址")
            }
            sb.appendLine("      routes:")
            sb.appendLine("        - to: default")
            sb.appendLine("          via: ${input.gateway}")
        }
        val dnsList = input.dns.filter { it.isNotBlank() }
        for (d in dnsList) {
            if (SubnetLogic.ipv4("$d/32") is AppResult.Failure) return fail("DNS 不是合法 IPv4 地址：$d")
        }
        if (dnsList.isNotEmpty()) {
            sb.appendLine("      nameservers:")
            sb.appendLine("        addresses: [${dnsList.joinToString(", ")}]")
        }
        return AppResult.Success(sb.toString().trimEnd())
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
