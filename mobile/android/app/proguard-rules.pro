# Regles ProGuard/R8 pour le build release.
#
# minifyEnabled / shrinkResources sont actifs en release. Flutter fournit deja
# ses propres consumer rules ; on ne maintient ici que ce qui est propre a
# JOBSINC, et le strict necessaire.

# --- Flutter -----------------------------------------------------------------
# `io.flutter.**` etait conserve integralement, ce qui dupliquait les rules que
# le SDK Flutter deploie deja et empechait toute obfuscation de cette surface.
# Seul l'entrypoint Flutter demande d'etre preserve.
-keep class io.flutter.embedding.** { *; }
-dontwarn io.flutter.embedding.**

# --- Firebase Messaging ------------------------------------------------------
# Les ancres precedentes conservaient TOUTE la surface `com.google.firebase.**`
# et `com.google.android.gms.**`, ce qui neutralisait l'obfuscation sur un
# tres grand nombre de classes et gonflait l'APK sans raison.
#
# Ce qui est reellement necessaire :
#  1. les classes `$*` (sous-classes de Service/Receiver/BroadcastReceiver
#     instancies par nom depuis le manifest ou par FCM) ;
#  2. la classe de base du service de messagerie, si l'app en declare un ;
#  3. les annotations conservees pour le traitement des messages.
-keep class com.google.firebase.**$* { *; }
-keep class com.google.firebase.iid.FirebaseInstanceIdReceiver { *; }
-keep class com.google.firebase.iid.FirebaseMessagingService { *; }
-keep class com.google.firebase.provider.FirebaseInitProvider { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# L'API Google Play Services n'est requise que par Firebase (task, base64).
-dontwarn com.google.android.gms.**
-keep class com.google.android.gms.tasks.** { *; }
-keep class com.google.android.gms.internal.** { *; }

# --- Divers ------------------------------------------------------------------
# References optionnelles Kotlin/Java 8.
-dontwarn javax.annotation.**
-dontwarn javax.lang.model.**
