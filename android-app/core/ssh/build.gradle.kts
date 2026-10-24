plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "dev.toolkit.core.ssh"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    // BouncyCastle 三件套自带同名 META-INF 文件：主包靠 app 模块的排除项兜底，
    // 但本模块 androidTest 变体自己合并 Java 资源时也会撞上，故这里同样排除
    // （W1 测试包构建失败根因：:core:ssh:mergeDebugAndroidTestJavaResource 报
    // META-INF/LICENSE.md 在 bcpkix/bcutil/bcprov 三个 jar 里重复）。
    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE.md", "META-INF/LICENSE",
                "META-INF/NOTICE.md", "META-INF/NOTICE",
            )
        }
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(libs.coroutines.android)
    implementation(libs.sshj)
    implementation(libs.bcprov)
    implementation(libs.bcpkix)
    implementation(libs.slf4j.api)
    runtimeOnly(libs.slf4j.simple)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.junit)
    testImplementation(libs.mina.sshd.core)
}
