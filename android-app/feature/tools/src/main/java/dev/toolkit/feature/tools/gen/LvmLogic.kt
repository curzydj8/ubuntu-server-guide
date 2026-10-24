package dev.toolkit.feature.tools.gen

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** LVM 扩容步骤生成器（编号外）：按文件系统类型给出扩容命令序列与前置检查。 */
object LvmLogic {
    fun extendSteps(vg: String, lv: String, size: String, fsType: String, newDisk: String): AppResult<String> {
        if (!vg.matches(Regex("[A-Za-z0-9_.-]+")) || !lv.matches(Regex("[A-Za-z0-9_.-]+"))) {
            return fail("VG/LV 名不合法")
        }
        if (!size.matches(Regex("\\+?\\d+(\\.\\d+)?[KMGT]")) && size != "+100%FREE") {
            return fail("大小格式如 +10G 或 +100%FREE")
        }
        if (fsType !in listOf("ext4", "xfs")) return fail("文件系统只支持 ext4 / xfs")
        val lvPath = "/dev/$vg/$lv"
        val lines = mutableListOf<String>()
        lines += "# 0) 先看现状（务必先备份重要数据）"
        lines += "sudo vgs; sudo lvs; df -h $lvPath"
        if (newDisk.isNotBlank()) {
            if (!newDisk.startsWith("/dev/")) return fail("新盘须为 /dev/ 路径")
            lines += "# 1) 新盘加入 VG"
            lines += "sudo pvcreate $newDisk"
            lines += "sudo vgextend $vg $newDisk"
        }
        lines += "# ${if (newDisk.isNotBlank()) 2 else 1}) 扩展 LV"
        lines += "sudo lvextend -L $size $lvPath"
        lines += "# ${if (newDisk.isNotBlank()) 3 else 2}) 扩展文件系统（${fsType}）"
        lines += if (fsType == "ext4") "sudo resize2fs $lvPath"
        else "sudo xfs_growfs $lvPath   # xfs 只能扩不能缩，且命令作用于挂载点亦可"
        lines += "# 复核"
        lines += "df -h $lvPath"
        return AppResult.Success(lines.joinToString("\n"))
    }

    private fun fail(msg: String) = AppResult.Failure(AppError.Validation(msg))
}
