plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "dev.toolkit.feature.servers"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { compose = true }
    // 与 core:ssh 同理：本模块经 core:ssh 间接引入 BouncyCastle 三件套，
    // androidTest 变体合并 Java 资源时会撞 META-INF/LICENSE.md，故同样排除
    // （W1 教训：只修 core:ssh 时失败顺延到本模块；凡依赖 core:ssh 的库模块都须有此块）。
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
    implementation(project(":core:ui"))
    implementation(project(":core:database"))
    implementation(project(":core:ssh"))
    implementation(project(":core:security"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.coroutines.android)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
}
