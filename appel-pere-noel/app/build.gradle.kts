plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

import java.net.URI

// sherpa-onnx (voix Piper) n'est pas publié sur Maven : son AAR est téléchargé une fois
// depuis les publications GitHub officielles du projet, dans app/libs/ (ignoré par git).
val sherpaVersion = "1.12.23"
val sherpaAar = file("libs/sherpa-onnx-$sherpaVersion.aar")
if (!sherpaAar.exists()) {
    sherpaAar.parentFile.mkdirs()
    val url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$sherpaVersion/sherpa-onnx-$sherpaVersion.aar"
    logger.lifecycle("Téléchargement de $url")
    val tmp = file("${sherpaAar.path}.part")
    URI(url).toURL().openStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
    tmp.renameTo(sherpaAar)
}

// Sur GitHub Actions, chaque compilation reçoit un numéro de version plus grand :
// le téléphone accepte alors la mise à jour par-dessus l'ancienne version (sans perdre les modèles).
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "fr.famille.appelperenoel"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.famille.appelperenoel"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "0.2.$buildNumber"
        ndk {
            // Téléphones récents uniquement (64 bits) : divise la taille de l'APK par trois.
            abiFilters += "arm64-v8a"
        }
    }

    signingConfigs {
        // Clé fixe versionnée dans le dépôt : indispensable pour pouvoir mettre l'appli à jour
        // sans la désinstaller (une désinstallation effacerait les modèles copiés).
        // Usage familial uniquement : cette clé n'a aucune valeur de sécurité.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            pickFirsts += "**/libc++_shared.so"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Oreilles : reconnaissance vocale hors-ligne.
    implementation("com.alphacephei:vosk-android:0.3.47@aar")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
    // Voix : Piper exécuté par sherpa-onnx.
    implementation(files(sherpaAar))
    // Cerveau : MediaPipe LLM Inference (Gemma).
    implementation("com.google.mediapipe:tasks-genai:0.10.35")
    // Décompression des modèles (.zip, .tar.bz2, .tar.gz) directement sur le téléphone.
    implementation("org.apache.commons:commons-compress:1.27.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
