import 'dart:io' show Platform;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notifications locales pour les nouveaux messages reçus hors de la
/// conversation ouverte. Ne remplace pas le push FCM (app tuée) :
/// cela couvre l'app en avant/arrière-plan avec socket connecté.
class LocalNotificationService {
  LocalNotificationService._();

  static final LocalNotificationService instance =
      LocalNotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _ready = false;

  Future<void> init() async {
    if (_ready) return;
    try {
      if (Platform.isAndroid) {
        // Android 13+ : permission runtime obligatoire.
        await _plugin
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      } else if (Platform.isIOS) {
        await _plugin
            .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: true, sound: true);
      } else {
        // Plateforme non supportée (web, desktop) : no-op silencieux.
        return;
      }

      const androidInit =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings();
      await _plugin.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
      );
      _ready = true;
    } catch (_) {
      // Jamais bloquant : la messagerie reste utilisable sans notifs.
    }
  }

  Future<void> showMessage({
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_ready) return;
    const androidDetails = AndroidNotificationDetails(
      'messages',
      'Messages',
      channelDescription: 'Notifications des nouveaux messages JOBSINC',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(),
    );
    try {
      await _plugin.show(
        DateTime.now().millisecondsSinceEpoch.remainder(100000),
        title,
        body,
        details,
        payload: payload,
      );
    } catch (_) {}
  }
}
