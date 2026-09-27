import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.jobsinc.mobile"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Requis par flutter_local_notifications.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.jobsinc.mobile"
        // `minSdk` / `targetSdk` sont ÉCRITS EN DUR, et non délégués à
        // `flutter.minSdkVersion` / `flutter.targetSdkVersion`.
        //
        // Ces deux valeurs sont la VALEUR PUBLIÉE de l'app : `targetSdk` décide
        // du comportement système (permissions, notifications, restrictions
        // arrière-plan) et Google Play refuse de facto toute mise à jour dont le
        // targetSdk est en dessous du sien. Or elles étaient lues dans le
        // toolchain Flutter : un simple bump de Flutter changeait donc le
        // target-SDK des builds publiés SANS AUCUNE MODIFICATION dans ce dépôt,
        // c'est-à-dire sans diff, sans revue, et sans que la CI le voie passer.
        // Le wrapper Gradle est versionné pour la même raison (le pin de la
        // toolchain doit être vérifiable) : un SDK Android ne doit pas
        // bouger parce qu'on a bumpé Flutter.
        //
        // Planchers imposés par les dépendances :
        //   - firebase_core 3.13 / firebase_messaging 15.2 exigent minSdk 23 ;
        //   - flutter_local_notifications 17.2 exige minSdk 21.
        // On garde 24 (et non le plancher 23) : c'est la valeur que
        // `flutter.minSdkVersion` résolvait déjà avec Flutter 3.47.5, donc le
        // pin est STRICTEMENT comportement-ivalent — le passer à 23 exclurait
        // Android 7.x pour rien. `compileSdk` reste aligné plus haut que
        // `targetSdk`, comme l'exige Google.
        minSdk = 24
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // --- Signature release --------------------------------------------------
    // `key.properties` est gitignoré et absent sur une machine de dev tant que
    // le secret CI n'est pas injecté. Sa lecture ne doit donc JAMAIS faire
    // échouer la configuration : sinon `flutter run` (assembleDebug) et le
    // build APK debug de la CD cassent sur toute station de travail.
    val keystorePropertiesFile = rootProject.file("key.properties")
    val keystoreProperties = Properties()
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
    }
    fun secret(name: String): String? =
        keystoreProperties.getProperty(name)?.trim()?.takeIf { it.isNotEmpty() }

    val missingSigningKeys =
        listOf("keyAlias", "keyPassword", "storeFile", "storePassword")
            .filter { secret(it) == null }

    val releaseSigning =
        if (missingSigningKeys.isEmpty()) {
            signingConfigs.create("release") {
                keyAlias = secret("keyAlias")
                keyPassword = secret("keyPassword")
                storeFile = file(secret("storeFile")!!)
                storePassword = secret("storePassword")
            }
        } else {
            null
        }

    // Le bloc `buildTypes` est évalué pour TOUTE commande Gradle, y compris
    // `assembleDebug` : exiger la clé de signature inconditionnellementcassait
    // le debug. On ne l'exige que lorsqu'une variante release est réellement
    // demandée (flutter build apk/appbundle, assembleRelease, gradlew build).
    val releaseRequested =
        gradle.startParameter.taskNames.any { requested ->
            val name = requested.substringAfterLast(':')
            name.contains("release", ignoreCase = true) || name == "assemble" || name == "build"
        }

    buildTypes {
        debug {
            // Debug: autorise le trafic HTTP clair pour 10.0.2.2 / 127.0.0.1 / LAN
            manifestPlaceholders["usesCleartextTraffic"] = true
        }
        release {
            // Release: HTTPS obligatoire, signature obligatoire.
            manifestPlaceholders["usesCleartextTraffic"] = false
            // ÉCHEC EXPLICITE si key.properties est absent ET qu'on construit
            // réellement du release.
            // Le comportement précédent retombait silencieusement sur la
            // config de signature debug : un APK "release" signé avec la clé
            // de debug était produit sans la moindre erreur, donc publiable,
            // mais ni installable en mise à jour ni distribuable sur le Play
            // Store. Mieux vaut un build rouge qu'un artefact piégé.
            val signing = releaseSigning
            when {
                signing != null -> signingConfig = signing
                releaseRequested ->
                    throw GradleException(
                        "Signature release introuvable : android/key.properties est absent ou incomplet " +
                            "(manquant : ${missingSigningKeys.joinToString(", ")}). " +
                            "Générez le keystore et le fichier key.properties avant de builder en release. " +
                            "Pour un build de smoke test, utilisez --debug."
                    )
                // Release non demandé (debug, sync IDE) : on ne casse rien, la
                // variante release resterait simplement non signée — inoffensif
                // tant qu'aucun artefact release n'est produit.
                else -> Unit
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
