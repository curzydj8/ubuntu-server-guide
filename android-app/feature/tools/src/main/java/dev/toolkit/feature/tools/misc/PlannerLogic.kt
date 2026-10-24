package dev.toolkit.feature.tools.misc

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult
import kotlin.math.ceil

/** 公式类工具集合：N-07 磁盘容量、N-13 备份 RPO/RTO、N-14 资源规划、N-20 迁移估算。假设均在输出中明示。 */
object PlannerLogic {

    fun diskPlan(dailyGrowthGb: Double, retainDays: Int, redundancyFactor: Double, currentFreeGb: Double): AppResult<List<String>> {
        if (dailyGrowthGb < 0 || retainDays <= 0 || redundancyFactor < 1.0 || currentFreeGb < 0) {
            return fail("参数不合法（增长≥0、保留≥1 天、冗余系数≥1、可用≥0）")
        }
        val needed = dailyGrowthGb * retainDays * redundancyFactor
        val daysLeft = if (dailyGrowthGb == 0.0) Double.POSITIVE_INFINITY else currentFreeGb / dailyGrowthGb
        return AppResult.Success(listOf(
            "保留期内新增数据（含冗余系数）：${fmt(needed)} GB",
            "按当前日增量，现有可用空间可用天数：${if (daysLeft.isInfinite()) "∞（无增长）" else fmt(daysLeft) + " 天"}",
            "建议预留总量：${fmt(needed * 1.2)} GB（含 20% 安全边际，假设口径）",
        ))
    }

    fun backupPlan(intervalHours: Double, backupMinutes: Double, dataGb: Double, restoreRateGbPerHour: Double): AppResult<List<String>> {
        if (intervalHours <= 0 || backupMinutes < 0 || dataGb < 0 || restoreRateGbPerHour <= 0) {
            return fail("参数不合法（间隔>0、用时≥0、数据量≥0、恢复速率>0）")
        }
        val rpo = intervalHours
        val rtoHours = backupMinutes / 60.0 + dataGb / restoreRateGbPerHour
        return AppResult.Success(listOf(
            "RPO（最坏数据丢失窗口）≈ ${fmt(rpo)} 小时（= 备份间隔，假设全量/等效全量口径）",
            "单次备份窗口占用：${fmt(backupMinutes)} 分钟",
            "RTO 估算 ≈ ${fmt(rtoHours)} 小时（= 最近备份用时 + 数据量/恢复速率；未含校验与人工确认时间）",
        ))
    }

    fun resourcePlan(peakConcurrent: Int, cpuMsPerRequest: Double, memMbPerRequest: Double, baseMemGb: Double): AppResult<List<String>> {
        if (peakConcurrent <= 0 || cpuMsPerRequest <= 0 || memMbPerRequest <= 0 || baseMemGb < 0) {
            return fail("参数不合法（并发>0、单请求 CPU>0、单请求内存>0、基础内存≥0）")
        }
        val cores = peakConcurrent * cpuMsPerRequest / 1000.0
        val memGb = baseMemGb + peakConcurrent * memMbPerRequest / 1024.0
        return AppResult.Success(listOf(
            "CPU 需求 ≈ ${fmt(cores)} 核（峰值并发 × 单请求 CPU 时间；建议 ×1.5 余量 → ${ceil(cores * 1.5).toInt()} 核）",
            "内存需求 ≈ ${fmt(memGb)} GB（基础 ${fmt(baseMemGb)} GB + 并发占用；建议取 ${ceil(memGb * 1.3).toInt()} GB 规格）",
            "假设口径：单请求资源恒定、无排队放大；仅作选型起点，须以压测复核",
        ))
    }

    fun migrationPlan(dataGb: Double, bandwidthMbps: Double, downtimeWindowHours: Double): AppResult<List<String>> {
        if (dataGb < 0 || bandwidthMbps <= 0 || downtimeWindowHours < 0) {
            return fail("参数不合法（数据量≥0、带宽>0、停机窗口≥0）")
        }
        val seconds = dataGb * 8 * 1024 / bandwidthMbps
        val hours = seconds / 3600.0
        val fits = hours <= downtimeWindowHours
        return AppResult.Success(listOf(
            "全量传输估算 ≈ ${fmt(hours)} 小时（数据量×8/带宽，未含协议开销，建议按 70% 有效带宽复核 → ${fmt(hours / 0.7)} 小时）",
            if (fits) "可在停机窗口内完成全量切换" else "超出停机窗口：需先做增量同步（rsync 两段式），停机窗口只传增量",
            "清单：备份校验 → 增量预同步 → 停服/降级 → 末次增量 → 配置与数据校验 → 切流 → 观察期保留源端可回滚",
        ))
    }

    private fun fmt(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else String.format(java.util.Locale.ROOT, "%.2f", v)

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
