plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "dev.toolkit.core.testing"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:security"))
    implementation(libs.junit)
    implementation(libs.coroutines.test)
    implementation(libs.coroutines.android)
    testImplementation(libs.junit)
}
