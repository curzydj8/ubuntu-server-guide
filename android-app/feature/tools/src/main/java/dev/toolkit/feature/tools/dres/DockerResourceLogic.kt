package dev.toolkit.feature.tools.dres

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import kotlin.math.roundToLong

/**
 * N-30 Docker 资源换算：内存单位与 CPU 配额互算。
 * 口径：内存按二进制（1 KiB=1024 B）并兼容 Docker 的 k/m/g 后缀；CPU shares 以 1 核=1024 为基准
 * （Docker 相对权重，范围 2..262144）；cpus 为绝对核数（nanoCPUs = 核数×1e9）。
 */
object DockerResourceLogic {

    fun parseMemory(input: String): AppResult<Long> {
        val s = input.trim().lowercase()
        if (s.isEmpty()) return fail("请输入内存值（如 512m、2g、1073741824）")
        val suffix = s.last()
        val (numStr, mult) = when (suffix) {
            'k' -> s.dropLast(1) to 1024L
            'm' -> s.dropLast(1) to 1024L * 1024
            'g' -> s.dropLast(1) to 1024L * 1024 * 1024
            'b' -> s.dropLast(1) to 1L
            else -> s to 1L
        }
        val value = numStr.toDoubleOrNull() ?: return fail("内存数值不合法")
        if (value < 0) return fail("内存不能为负")
        return AppResult.Success((value * mult).roundToLong())
    }

    fun formatMemory(bytes: Long): String = when {
        bytes >= 1024L * 1024 * 1024 -> trimZeros(bytes.toDouble() / (1024.0 * 1024 * 1024)) + " GiB"
        bytes >= 1024L * 1024 -> trimZeros(bytes.toDouble() / (1024.0 * 1024)) + " MiB"
        bytes >= 1024L -> trimZeros(bytes.toDouble() / 1024.0) + " KiB"
        else -> "$bytes B"
    }

    fun dockerMemoryString(bytes: Long): String = when {
        bytes % (1024L * 1024 * 1024) == 0L -> "${bytes / (1024L * 1024 * 1024)}g"
        bytes % (1024L * 1024) == 0L -> "${bytes / (1024L * 1024)}m"
        bytes % 1024L == 0L -> "${bytes / 1024}k"
        else -> "${bytes}b"
    }

    fun cpusToShares(cpus: Double): AppResult<Long> {
        if (cpus <= 0) return fail("核数必须为正")
        return AppResult.Success((cpus * 1024).roundToLong().coerceIn(2, 262144))
    }

    fun sharesToCpus(shares: Long): AppResult<Double> {
        if (shares <= 0) return fail("shares 必须为正")
        return AppResult.Success(shares / 1024.0)
    }

    fun cpusToNanoCpus(cpus: Double): AppResult<Long> {
        if (cpus <= 0) return fail("核数必须为正")
        return AppResult.Success((cpus * 1e9).roundToLong())
    }

    private fun trimZeros(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else String.format(java.util.Locale.ROOT, "%.2f", v).trimEnd('0').trimEnd('.')

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
