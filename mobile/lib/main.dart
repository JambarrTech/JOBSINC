import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'app/app.dart';
import 'core/services/fcm_service.dart';
import 'core/services/local_notification_service.dart';

/// Messages FCM recus app tuee / arriere-plan.
///
/// Le backend envoie un bloc `notification` (titre + corps), donc Android
/// affiche la notification systeme sans intervention. Ce handler ne sert
/// qu'a garantir que le canal Android existe : le manifeste declare
/// `default_notification_channel_id=messages`, et **si ce canal n'existe pas
/// encore, Android SUPPRIME silencieusement la notification** (il refuse de
/// creer un canal implicite depuis un message recu). Le canal etant cree par
/// `LocalNotificationService.init()`, il pouvait manquer precisement dans le
/// cas qui compte ici : processus froid, app tuee, aucune isolation Flutter
/// encore demarree. On le cree donc aussi ici.
@pragma('vm:entry-point')
Future<void> fcmBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  try {
    if (Platform.isAndroid) {
      const settings = InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      );
      await FlutterLocalNotificationsPlugin().initialize(settings);
      await FlutterLocalNotificationsPlugin()
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(
            const AndroidNotificationChannel(
              LocalNotificationService.messagesChannelId,
              'Messages',
              description: 'Notifications des nouveaux messages JOBSINC',
              importance: Importance.high,
            ),
          );
    }
  } catch (_) {
    // Le message sera de toute facon affiche par le tray systeme si le
    // canal existe deja. Ne jamais faire echouer le handler.
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
    // Handler de fond : DOIT etre enregistre avant runApp.
    FirebaseMessaging.onBackgroundMessage(fcmBackgroundHandler);
    FirebaseMessaging.onMessage.listen(FcmService.handleForegroundMessage);
    // Tap sur notification alors que l'app tourne, et tap ayant lance l'app
    // depuis l'etat arrete. Passe par `ensureOpenedListener` (et plus
    // `listenForOpenedApp`) : l'ancien appel direct ne posait pas le
    // drapeau d'unicite, donc le premier `initAndRegister` installait un
    // second listener (navigation en double) et ecrasait le payload de
    // lancement par un `getInitialMessage()` vierge.
    FcmService.ensureOpenedListener();
  } catch (e, stack) {
    // Firebase indisponible (binaire sans google-services, plateforme non
    // configuree) : l'app fonctionne sans push. La trace etait avalee sans
    // diagnostic, ce qui rendait ce mode inexplicable a l'usage.
    debugPrint('[main] Firebase indisponible, push desactive : $e\n$stack');
  }
  runApp(const ProviderScope(child: JobsincApp()));
}
