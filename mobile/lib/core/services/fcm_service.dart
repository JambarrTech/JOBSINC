import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'chat_socket_service.dart';
import 'local_notification_service.dart';

/// Push FCM : permission, token, enregistrement backend et affichage
/// des messages reçus en avant-plan (arrière-plan/app tuée = tray
/// système automatique grâce au payload `notification`).
class FcmService {
  FcmService._();

  static String? _registeredApiToken;
  static String? _lastToken;
  static StreamSubscription<String>? _tokenSub;

  /// À appeler à chaque session authentifiée (idempotent).
  static Future<void> initAndRegister(String apiToken) async {
    if (apiToken.isEmpty) return;
    if (kIsWeb) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      // Canal partagé avec les notifications locales.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      await _tokenSub?.cancel();
      _tokenSub = messaging.onTokenRefresh.listen((token) => _register(apiToken, token));

      final token = await messaging.getToken();
      if (token != null) {
        _lastToken = token;
        await _register(apiToken, token);
        _registeredApiToken = apiToken;
      }
    } catch (e) {
      // Firebase indisponible (émulateur sans services, clé absente…)
      // : jamais bloquant pour l'application, mais on garde une trace
      // pour le diagnostic en développement.
      debugPrint('[FcmService] initAndRegister : $e');
    }
  }

  /// Désenregistre l'appareil à la déconnexion (best effort).
  static Future<void> unregister() async {
    await _tokenSub?.cancel();
    _tokenSub = null;
    final apiToken = _registeredApiToken;
    final fcmToken = _lastToken;
    if (apiToken == null || fcmToken == null) return;
    final client = ApiClient();
    try {
      await client.post('/devices/unregister', {'token': fcmToken}, token: apiToken);
    } catch (e) {
      debugPrint('[FcmService] unregister : $e');
    } finally {
      client.close();
    }
    _registeredApiToken = null;
  }

  static Future<void> _register(String apiToken, String fcmToken) async {
    if (kIsWeb) return;
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      final client = ApiClient();
      try {
        await client.post(
          '/devices/register',
          {'token': fcmToken, 'platform': platform},
          token: apiToken,
        );
      } finally {
        client.close();
      }
    } catch (e) {
      // Retenté au prochain onTokenRefresh / login ; tracé en dev.
      debugPrint('[FcmService] _register : $e');
    }
  }

  /// Message FCM reçu pendant que l'app est en PREMIER plan :
  /// le socket gère déjà la synchro, on n'affiche une notification
  /// locale QUE si l'utilisateur n'a pas la conversation ouverte.
  static void handleForegroundMessage(RemoteMessage message) {
    final conversationId = message.data['conversationId'];
    if (conversationId is String &&
        conversationId.isNotEmpty &&
        ChatSocketService.instance.viewingConversationId == conversationId) {
      return;
    }
    final notification = message.notification;
    if (notification == null) return;
    LocalNotificationService.instance.showMessage(
      title: notification.title ?? 'Nouveau message',
      body: notification.body ?? '',
      payload: conversationId is String ? conversationId : null,
    );
  }
}
