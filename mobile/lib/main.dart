import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/services/fcm_service.dart';

/// Messages FCM reçus app tuée / arrière-plan : le payload
/// `notification` est affiché par le système, rien à faire ici.
@pragma('vm:entry-point')
Future<void> fcmBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
    // Messages reçus app ouverte en premier plan.
    FirebaseMessaging.onMessage.listen(FcmService.handleForegroundMessage);
  } catch (_) {
    // Firebase indisponible : l'app fonctionne sans push.
  }
  runApp(const ProviderScope(child: JobsincApp()));
}
