package dev.toolkit.feature.tools.permissions

import dev.toolkit.core.common.AppError
import dev.toolkit.core.common.AppResult

/** N-17 权限计算器纯逻辑：八进制 <-> 符号权限互转，与网站版共享测试向量口径。 */
object PermissionLogic {

    data class ClassPerms(val read: Boolean, val write: Boolean, val execute: Boolean) {
        fun toSymbol(): String = buildString {
            append(if (read) 'r' else '-')
            append(if (write) 'w' else '-')
            append(if (execute) 'x' else '-')
        }
        fun toDigit(): Int = (if (read) 4 else 0) + (if (write) 2 else 0) + (if (execute) 1 else 0)
    }

    data class Permissions(val owner: ClassPerms, val group: ClassPerms, val others: ClassPerms) {
        fun toOctal(): String = "${owner.toDigit()}${group.toDigit()}${others.toDigit()}"
        fun toSymbolic(): String = owner.toSymbol() + group.toSymbol() + others.toSymbol()
        fun chmodCommand(path: String): String = "chmod ${toOctal()} $path"
    }

    fun fromOctal(input: String): AppResult<Permissions> {
        val s = input.trim()
        if (s.length != 3 || s.any { it !in '0'..'7' }) {
            return AppResult.Failure(AppError.Validation("请输入 3 位八进制权限（如 755）"))
        }
        fun digit(c: Char): ClassPerms {
            val v = c - '0'
            return ClassPerms(v and 4 != 0, v and 2 != 0, v and 1 != 0)
        }
        return AppResult.Success(Permissions(digit(s[0]), digit(s[1]), digit(s[2])))
    }

    fun fromSymbolic(input: String): AppResult<Permissions> {
        val s = input.trim().removePrefix("-").removePrefix("d")
        if (s.length != 9) return AppResult.Failure(AppError.Validation("请输入 9 位符号权限（如 rwxr-xr-x）"))
        fun part(offset: Int): ClassPerms? {
            val r = s[offset]; val w = s[offset + 1]; val x = s[offset + 2]
            if (r !in "r-" || w !in "w-" || x !in "x-") return null
            return ClassPerms(r == 'r', w == 'w', x == 'x')
        }
        val o = part(0); val g = part(3); val t = part(6)
        if (o == null || g == null || t == null) {
            return AppResult.Failure(AppError.Validation("符号权限每组必须形如 rwx（无权限用 -）"))
        }
        return AppResult.Success(Permissions(o, g, t))
    }
}
