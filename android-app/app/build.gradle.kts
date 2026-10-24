plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "dev.toolkit.app"
    compileSdk = 36
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // Release 签名（W4 定稿）：密钥由站长自备自管、永不入仓；构建只从 gradle properties
        //（releaseStoreFile / releaseStorePassword / releaseKeyAlias / releaseKeyPassword）读取，
        // 四项不齐则不建 release 签名配置，产出未签名 release APK，由站长在其机器上签名（见 docs/签名指南.md）。
        val releaseStoreFile = (findProperty("releaseStoreFile") as? String)?.let { rootProject.file(it) }
        val releaseStorePassword = findProperty("releaseStorePassword") as? String
        val releaseKeyAlias = findProperty("releaseKeyAlias") as? String
        val releaseKeyPassword = findProperty("releaseKeyPassword") as? String
        if (releaseStoreFile != null && releaseStoreFile.exists() && releaseStorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    defaultConfig {
        applicationId = "dev.linuxserver.toolkit"
        minSdk = 26
        targetSdk = 36
        versionCode = 15
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    // BouncyCastle 三件套自带同名 META-INF 文件，合并 APK 资源时排除重复项
    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE.md", "META-INF/LICENSE",
                "META-INF/NOTICE.md", "META-INF/NOTICE",
            )
        }
    }
    buildTypes {
        // W4 定稿：R8 + 资源收缩为 release 默认（W2 bench 实测：包体 −68%、冷启动 −66%，知识库冒烟通过；
        // 回归全绿才保留，见 docs/验收记录-第六阶段-W4.md）。
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { compose = true }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":core:database"))
    implementation(project(":core:network"))
    implementation(project(":core:security"))
    implementation(project(":feature:dashboard"))
    implementation(project(":feature:tools"))
    implementation(project(":feature:settings"))
    implementation(project(":feature:knowledge"))
    implementation(project(":core:sync"))
    implementation(project(":core:knowledge"))
    implementation(project(":core:ssh"))
    implementation(project(":feature:servers"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.work.runtime)
    debugImplementation(libs.compose.ui.test.manifest)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.test.runner)
    testImplementation(libs.junit)
}
