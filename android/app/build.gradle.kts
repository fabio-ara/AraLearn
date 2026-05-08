import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
}

val webProjectDir = rootProject.projectDir.parentFile
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/web-assets/main")
val generatedWebAssetsRoot = generatedWebAssetsDir.get().asFile

val syncWebAssets by tasks.registering(Sync::class) {
    from(File(webProjectDir, "public")) {
        into("public")
    }
    from(File(webProjectDir, "src")) {
        into("src")
    }
    into(generatedWebAssetsRoot.resolve("www"))
}

android {
    namespace = "com.aralearn.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aralearn.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 100
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedWebAssetsRoot)
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.15.0")
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
