import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Notifications locales pour les nouveaux messages reçus hors de la
/// conversation ouverte. Ne remplace pas le push FCM (app tuée) :
/// cela couvre l'app en avant/arrière-plan avec socket connecté.
class LocalNotificationService {
  LocalNotificationService._();

  static final LocalNotificationService instance =
      LocalNotificationService._();

  /// Identifiant du canal Android. DOIT correspondre au
  /// `com.google.firebase.messaging.default_notification_channel_id`
  /// du AndroidManifest, sinon Android supprime silencieusement les
  /// notifications recues en arriere-plan.
  static const String messagesChannelId = 'messages';

  static const String _tapsBackgroundKey = 'jobsinc_notification_tap';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _ready = false;

  /// Payload de la notification qui a lance l'app depuis un « tap » sur
  /// notification, consomme une seule fois par l'app au demarrage.
  ///
  /// L'isolate de fond (`notificationTapBackground`) et l'isolate principal ne
  /// partagent pas de memoire : le passage se fait donc par
  /// SharedPreferences. Sans ce mecanisme, un appui sur une notification
  /// alors que l'app etait tuee ne produisait RIEN.
  String? _launchPayload;

  /// Stream des payloads des notifications sur lesquelles l'utilisateur appuie
  /// pendant que l'app tourne.
  final _taps = StreamController<String>.broadcast();
  Stream<String> get onTap => _taps.stream;

  /// Payload en attente (lancement depuis un tap), a drainer par l'app.
  ///
  /// Lancement depuis l'etat ARRETE : payload fourni par
  /// `getNotificationAppLaunchDetails()` (voir `init`). Lancement depuis
  /// l'isolate de fond : relu depuis SharedPreferences, car l'isolate de fond
  /// et l'isolate principal ne partagent pas la memoire. Dans les deux cas la
  /// cle est retiree pour qu'un tap ne soit traite qu'une seule fois.
  String? takeLaunchPayload() {
    final payload = _launchPayload;
    _launchPayload = null;
    return payload;
  }

  /// Variante asynchrone : draine le payload de l'isolate de fond.
  ///
  /// `SharedPreferences.getInstance()` est asynchrone, ce qui est sans
  /// probleme ici (isolate principal) mais impossible dans le handler de
  /// fond, d'ou la separation.
  Future<String?> takePersistedLaunchPayload() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_tapsBackgroundKey);
      if (stored == null || stored.isEmpty) return null;
      await prefs.remove(_tapsBackgroundKey);
      return stored;
    } catch (e) {
      debugPrint('[LocalNotificationService] takePersistedLaunchPayload : $e');
      return null;
    }
  }

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

      // `initialize(onDidReceiveNotificationResponse:)` couvre Android ET iOS.
      // Poser le delegate iOS séparément n'est pas nécessaire et
      // `setNotificationResponseCallback` n'existe pas dans la version
      // courante du plugin : le callback unifié suffit.
      await _plugin.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
        onDidReceiveNotificationResponse: _onResponse,
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );

      // Cree explicitement le canal partage avec le push FCM. Android ne
      // cree JAMAIS un canal implicitement depuis une notification recue :
      // si le canal n'existe pas, la notification est supprimee sans trace.
      if (Platform.isAndroid) {
        await _plugin
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(
              const AndroidNotificationChannel(
                messagesChannelId,
                'Messages',
                description: 'Notifications des nouveaux messages JOBSINC',
                importance: Importance.high,
              ),
            );
      }
      _ready = true;

      // Tap sur une notification alors que l'app etait completement TUEE :
      // c'est le mecanisme prevu par le plugin pour ce cas, et le seul
      // qui soit exempt de course (l'isolate principal fait l'appel au
      // demarrage, avant que le payload ne puisse etre perdu).
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp ?? false) {
        final payload = launch?.notificationResponse?.payload;
        if (payload != null && payload.isNotEmpty) _launchPayload = payload;
      }
    } catch (e) {
      // Jamais bloquant : la messagerie reste utilisable sans notifs.
      debugPrint('[LocalNotificationService] init : $e');
    }
  }

  /// Handler Android + iOS (routé par `onDidReceiveNotificationResponse`).
  void _onResponse(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null || payload.isEmpty) return;
    _taps.add(payload);
  }

  Future<void> showMessage({
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_ready) return;
    const androidDetails = AndroidNotificationDetails(
      messagesChannelId,
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
      // ID monotone persistant : `millisecondsSinceEpoch % 100000` rebouclait
      // toutes les ~100 s, donc deux messages rapprochés se remplaçaient
      // mutuellement au lieu de s'empiler.
      _idCounter += 1;
      await _plugin.show(
        _idCounter,
        title,
        body,
        details,
        payload: payload,
      );
    } catch (e) {
      debugPrint('[LocalNotificationService] showMessage : $e');
    }
  }

  int _idCounter = 0;
}

/// Handler de notification en arriere-plan (Android) : doit etre une fonction
/// top-level annotee `@pragma('vm:entry-point')`.
///
/// Le corps etait VIDE. Le commentaire affirmait pourtant que « le payload est
/// simplement persiste pour etre lu au prochain demarrage » — il ne l'etait
/// pas. Consequence : un appui sur une notification alors que l'application
/// etait completement tuee demarrait l'app, mais sans aucune conversation
/// ciblee (retour a l'accueil ou a la liste). Le passage par isolate impose
/// un support de persistance : l'isolate de fond et l'isolate principal ne
/// partagent pas la memoire du processus.
@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) {
  final payload = response.payload;
  if (payload == null || payload.isEmpty) return;
  // L'API SharedPreferences est asynchrone : impossible d'attendre ici. Le
  // chemin nominal est de toute facon `getNotificationAppLaunchDetails()`
  // (cf. `init`), execute dans l'isolate principal des le demarrage ; cet
  // ecriture n'est qu'un filet de securite pour le cas ou le plugin n'a pas
  // remonte le payload au lancement.
  SharedPreferences.getInstance()
      .then((prefs) => prefs.setString(
            LocalNotificationService._tapsBackgroundKey,
            payload,
          ))
      .catchError((Object e) {
    debugPrint('[notificationTapBackground] $e');
    return false;
  });
}
