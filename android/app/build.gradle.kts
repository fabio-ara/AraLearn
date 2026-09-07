import org.gradle.api.tasks.Exec
import java.io.File
import java.net.URI

plugins {
    id("com.android.application")
}

val webProjectDir = rootProject.projectDir.parentFile
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/web-assets/main")
val generatedWebAssetsRoot = generatedWebAssetsDir.get().asFile
val releaseKeystorePath = System.getenv("ARALEARN_ANDROID_KEYSTORE_PATH")?.trim().orEmpty()
val releaseStorePassword = System.getenv("ARALEARN_ANDROID_KEYSTORE_PASSWORD").orEmpty()
val releaseKeyAlias = System.getenv("ARALEARN_ANDROID_KEY_ALIAS")?.trim().orEmpty()
val releaseKeyPassword = System.getenv("ARALEARN_ANDROID_KEY_PASSWORD").orEmpty()
val releaseCredentialsAreComplete =
    releaseKeystorePath.isNotEmpty() &&
    releaseStorePassword.isNotEmpty() &&
    releaseKeyAlias.isNotEmpty() &&
    releaseKeyPassword.isNotEmpty()
val releaseCredentialsWereProvided = listOf(
    releaseKeystorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).any(String::isNotEmpty)
val releaseKeystoreFile = releaseKeystorePath.takeIf(String::isNotEmpty)?.let(::file)
val releaseSigningIsReady = releaseCredentialsAreComplete && releaseKeystoreFile?.isFile == true
val historicalDebugKeystoreFile = File(System.getProperty("user.home"), ".android/debug.keystore")
val historicalSigningIsReady =
    !releaseCredentialsWereProvided &&
    historicalDebugKeystoreFile.isFile
val supabaseUrl = System.getenv("ARALEARN_SUPABASE_URL")?.trim().orEmpty()
val supabasePublishableKey = System.getenv("ARALEARN_SUPABASE_PUBLISHABLE_KEY")?.trim().orEmpty()

val stageWebRuntime by tasks.registering(Exec::class) {
    val stagingScript = File(webProjectDir, "scripts/stageWebRuntime.mjs")
    workingDir(webProjectDir)
    commandLine(
        "node",
        stagingScript.absolutePath,
        "--target",
        "android",
        "--output",
        generatedWebAssetsRoot.absolutePath
    )
    inputs.file(stagingScript)
    inputs.dir(File(webProjectDir, "public"))
    inputs.dir(File(webProjectDir, "src"))
    inputs.property("ARALEARN_SUPABASE_URL", supabaseUrl)
    inputs.property("ARALEARN_SUPABASE_PUBLISHABLE_KEY", supabasePublishableKey)
    outputs.dir(generatedWebAssetsRoot)
}

android {
    namespace = "com.aralearn.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aralearn.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 212
        versionName = "0.0.66"
    }

    signingConfigs {
        if (releaseSigningIsReady) {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseSigningIsReady) {
                signingConfig = signingConfigs.getByName("release")
            } else if (historicalSigningIsReady) {
                signingConfig = signingConfigs.getByName("debug")
            }
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
            assets.directories.add(generatedWebAssetsRoot.absolutePath)
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.activity:activity:1.12.4")
    implementation("androidx.core:core:1.17.0")
    implementation("androidx.webkit:webkit:1.15.0")
}

tasks.named("preBuild") {
    dependsOn(stageWebRuntime)
}

val requireReleaseSigning by tasks.registering {
    doLast {
        val buildRoot = layout.buildDirectory.get().asFile.canonicalFile
        val releaseArtifactDirectories = listOf(
            buildRoot.resolve("outputs/apk/release"),
            buildRoot.resolve("outputs/bundle/release")
        )
        releaseArtifactDirectories.forEach { directory ->
            val resolvedDirectory = directory.canonicalFile
            if (resolvedDirectory == buildRoot || !resolvedDirectory.toPath().startsWith(buildRoot.toPath())) {
                throw GradleException("Diretório de artefatos de release inválido: $resolvedDirectory")
            }
            delete(resolvedDirectory)
        }

        if (!releaseCredentialsAreComplete && !historicalSigningIsReady) {
            throw GradleException(
                "A assinatura de release exige as quatro variáveis ARALEARN_ANDROID_KEYSTORE_* " +
                    "ou a keystore histórica em ${historicalDebugKeystoreFile.absolutePath}."
            )
        }
        if (releaseCredentialsWereProvided && !releaseCredentialsAreComplete) {
            throw GradleException("As variáveis de assinatura de release precisam estar completas quando informadas.")
        }
        if (releaseCredentialsAreComplete && releaseKeystoreFile?.isFile != true) {
            throw GradleException(
                "ARALEARN_ANDROID_KEYSTORE_PATH deve apontar para um arquivo de keystore existente."
            )
        }
    }
}

val requireReleaseRuntimeConfig by tasks.registering {
    doLast {
        if (supabaseUrl.isEmpty() || supabasePublishableKey.isEmpty()) {
            throw GradleException(
                "A release exige ARALEARN_SUPABASE_URL e " +
                    "ARALEARN_SUPABASE_PUBLISHABLE_KEY."
            )
        }
        val projectUri = runCatching { URI(supabaseUrl) }.getOrNull()
        if (!projectUri?.scheme.equals("https", ignoreCase = true)) {
            throw GradleException("ARALEARN_SUPABASE_URL deve usar HTTPS na release Android.")
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(requireReleaseSigning, requireReleaseRuntimeConfig)
}
