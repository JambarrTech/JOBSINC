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

  /// Conversations ouvertes via un appui sur une notification FCM alors que
  /// l'app tournait déjà (app en arrière-plan / au premier plan).
  static final _opened = StreamController<String>.broadcast();
  static Stream<String> get onOpened => _opened.stream;

  /// Payload de la notification FCM ayant lancé l'app depuis l'état arrêté
  /// (cold start).
  static Future<RemoteMessage?>? _initialMessageFuture;

  /// Attend et retourne l'identifiant de conversation de la notification ayant
  /// lancé l'app, puis le consomme (une seule fois).
  ///
  /// `getInitialMessage()` est asynchrone : le lire une fois au premier frame
  /// serait une course perdue dans la plupart des cas. On mémorise donc la
  /// Future et on l'attend au moment où l'on en a réellement besoin.
  static Future<String?> takeLaunchConversationId() async {
    final future = _initialMessageFuture;
    if (future == null) return null;
    try {
      final message = await future;
      return conversationIdOf(message);
    } catch (_) {
      return null;
    } finally {
      _initialMessageFuture = null;
    }
  }

  /// L'ecoute est idempotente : la poser plusieurs fois (chaque session
  /// authentifiee appelle initAndRegister) ne doit pas dupliquer les taps.
  static bool _openedListenerInstalled = false;

  /// Point d'entree UNIQUE pour brancher les taps FCM.
  ///
  /// Appele au bootstrap (main.dart) ET a chaque session authentifiee. Avant,
  /// `main.dart` appelait `listenForOpenedApp()` directement : le drapeau
  /// `_openedListenerInstalled` n'etait donc jamais pose, et le premier
  /// `initAndRegister` installait un SECOND listener sur le meme stream
  /// (navigation en double) tout en ecrasant `_initialMessageFuture` par un
  /// `getInitialMessage()` vierge, perdant le payload de lancement.
  static void ensureOpenedListener() {
    if (_openedListenerInstalled) return;
    _openedListenerInstalled = true;
    _listenForOpenedApp();
  }

  /// Extrait l'identifiant de conversation d'un message FCM.
  ///
  /// `firebase_messaging` 15 expose le payload `data` à la racine du message
  /// uniquement : `RemoteNotification` n'a pas de getter `data`. Le backend
  /// place `conversationId` dans le bloc `data`, ce qui est la source.
  static String? conversationIdOf(RemoteMessage? message) {
    if (message == null) return null;
    final fromData =
        message.data['conversationId'] ?? message.data['conversation_id'];
    if (fromData is String && fromData.isNotEmpty) return fromData;
    return null;
  }

  /// A brancher UNE FOIS au bootstrap : couvre le cold start et le tap alors que
  /// l'app tourne. Ne pas appeler directement : passer par
  /// [ensureOpenedListener], qui garantit l'unicite de l'ecoute.
  static void _listenForOpenedApp() {
    try {
      final messaging = FirebaseMessaging.instance;

      // App deja ouverte (premier plan ou background) -> l'utilisateur tape.
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        final id = conversationIdOf(message);
        if (id != null) _opened.add(id);
      });

      // App TUEe -> l'utilisateur tape sur la notification du tray.
      _initialMessageFuture = messaging.getInitialMessage();
    } catch (e) {
      debugPrint('[FcmService] listenForOpenedApp : $e');
    }
  }

  /// À appeler à chaque session authentifiée (idempotent).
  static Future<void> initAndRegister(String apiToken) async {
    if (apiToken.isEmpty) return;
    if (kIsWeb) return;
    try {
      ensureOpenedListener();
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
      _tokenSub = messaging.onTokenRefresh.listen((token) {
        // `_lastToken` doit suivre la rotation, sinon `unregister()` (logout)
        // désenregistre le token périmé et laisse le nouveau actif côté
        // backend : l'appareil continue de recevoir des notifications alors
        // que l'utilisateur est déconnecté.
        _lastToken = token;
        _register(apiToken, token);
      });

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
    // ApiClient() utilise un http.Client partagé : rien à fermer ici.
    try {
      await ApiClient().post(
        '/devices/unregister',
        {'token': fcmToken},
        token: apiToken,
      );
    } catch (e) {
      debugPrint('[FcmService] unregister : $e');
    }
    _registeredApiToken = null;
  }

  static Future<void> _register(String apiToken, String fcmToken) async {
    if (kIsWeb) return;
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      await ApiClient().post(
        '/devices/register',
        {'token': fcmToken, 'platform': platform},
        token: apiToken,
      );
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
