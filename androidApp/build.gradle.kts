plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

kotlin {
  jvmToolchain(17)
}

android {
  namespace = "com.gravity.app"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.gravity.app"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "2.0.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.2")
  implementation("androidx.webkit:webkit:1.12.1")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

val webSource = rootProject.file("gravity-web")
val webAssets = file("src/main/assets/www")

tasks.register<Copy>("syncWebAssets") {
  from(webSource) {
    include("index.html", "css/**", "js/**")
    exclude("dev-server.js", "package.json", "node_modules/**")
  }
  into(webAssets)
}

tasks.named("preBuild") {
  dependsOn("syncWebAssets")
}
