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
    }
    defaultConfig {
        applicationId = "dev.linuxserver.toolkit"
        minSdk = 26
        targetSdk = 36
        versionCode = 13
        versionName = "0.6.4"
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
        release { isMinifyEnabled = false }
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
    testImplementation(libs.junit)
}
