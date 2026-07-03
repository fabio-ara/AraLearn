import org.gradle.api.tasks.Sync
import java.io.File

plugins {
    id("com.android.application")
}

val webProjectDir = rootProject.projectDir.parentFile
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/web-assets/main")
val generatedWebAssetsRoot = generatedWebAssetsDir.get().asFile
val userHome = System.getProperty("user.home") ?: ""
val debugKeystoreFile = File(userHome, ".android/debug.keystore")
val releaseKeystorePath = System.getenv("ARALEARN_ANDROID_KEYSTORE_PATH")?.trim().orEmpty()
val releaseStorePassword = System.getenv("ARALEARN_ANDROID_KEYSTORE_PASSWORD")?.trim().orEmpty()
val releaseKeyAlias = System.getenv("ARALEARN_ANDROID_KEY_ALIAS")?.trim().orEmpty()
val releaseKeyPassword = System.getenv("ARALEARN_ANDROID_KEY_PASSWORD")?.trim().orEmpty()
val hasCustomReleaseKeystore =
    releaseKeystorePath.isNotEmpty() &&
    releaseStorePassword.isNotEmpty() &&
    releaseKeyAlias.isNotEmpty() &&
    releaseKeyPassword.isNotEmpty()
val canUseDebugFallback = debugKeystoreFile.isFile

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
        versionCode = 125
        versionName = "0.0.5"
    }

    signingConfigs {
        create("release") {
            when {
                hasCustomReleaseKeystore -> {
                    storeFile = file(releaseKeystorePath)
                    storePassword = releaseStorePassword
                    keyAlias = releaseKeyAlias
                    keyPassword = releaseKeyPassword
                }
                canUseDebugFallback -> {
                    storeFile = debugKeystoreFile
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                }
                else -> {
                    throw GradleException(
                        "Nenhum keystore de release disponível. " +
                            "Defina ARALEARN_ANDROID_KEYSTORE_PATH, " +
                            "ARALEARN_ANDROID_KEYSTORE_PASSWORD, " +
                            "ARALEARN_ANDROID_KEY_ALIAS e " +
                            "ARALEARN_ANDROID_KEY_PASSWORD, " +
                            "ou disponibilize ~/.android/debug.keystore."
                    )
                }
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
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
