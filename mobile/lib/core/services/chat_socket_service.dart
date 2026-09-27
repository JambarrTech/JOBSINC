import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as sio;

import 'api_client.dart';

/// Événement « en train d'écrire » reçu du serveur.
class TypingEvent {
  const TypingEvent({required this.conversationId, required this.typing});

  final String conversationId;
  final bool typing;
}

/// Connexion Socket.IO partagée pour la messagerie temps réel.
///
/// - Authentification par JWT transmis dans le handshake.
/// - Reconnexion automatique gérée par la librairie ; les rooms
///   rejointes sont ré-tablies après chaque reconnexion.
/// - Les événements `message:new` sont exposés sous forme de flux de
///   conversationId ; le contenu est toujours rechargé via l'API REST.
/// - `viewingConversationId` indique la conversation actuellement
///   ouverte à l'écran : utilisée pour ne pas notifier localement
///   l'utilisateur d'un message qu'il est en train de lire.
class ChatSocketService {
  ChatSocketService._();

  static final ChatSocketService instance = ChatSocketService._();

  /// Même origine que l'API : API_URL sans le suffixe /api.
  static final String socketUrl = ApiClient.serverBaseUrl;

  sio.Socket? _socket;
  String? _connectedToken;
  final Set<String> _joinedConversations = {};

  /// Conversation actuellement affichée à l'écran (null sinon).
  String? viewingConversationId;

  final StreamController<String> _messages =
      StreamController<String>.broadcast();
  final StreamController<TypingEvent> _typing =
      StreamController<TypingEvent>.broadcast();
  final StreamController<Map<String, dynamic>> _interviews =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Flux des conversationId ayant reçu un nouveau message.
  Stream<String> get messageEvents => _messages.stream;

  /// Flux des événements « en train d'écrire » des autres participants.
  Stream<TypingEvent> get typingEvents => _typing.stream;

  /// Flux des mises à jour d'entretien (démarrage, fin, annulation...).
  /// Payload : { interviewId, applicationId, status, ... }.
  Stream<Map<String, dynamic>> get interviewEvents => _interviews.stream;

  bool get isConnected => _socket?.connected ?? false;

  /// L'app est-elle a l'ecran (premier plan) ?
  ///
  /// Le backend supprime le push FCM d'un destinataire qu'il juge « actif ».
  /// Un socket mobile survit au passage en arriere-plan : sans ce signal, le
  /// backend confondait « connecte » et « devant son ecran » et n'envoyait
  /// donc jamais de push sur mobile.
  bool _visible = true;

  /// Signale au backend si l'app est au premier plan.
  void setVisible(bool visible) {
    if (_visible == visible) return;
    _visible = visible;
    if (_socket?.connected ?? false) {
      _socket!.emit('presence', {'visible': visible});
    }
  }

  bool get isVisible => _visible;

  /// Établit la connexion si nécessaire (idempotent).
  void connect(String token) {
    if (token.isEmpty) return;
    if (isConnected && _connectedToken == token) return;

    // Les rooms sont EJETÉES par `disconnect()`. On les sauvegarde avant pour
    // les rejouer sur la nouvelle connexion.
    //
    // Pourquoi cette branche existe : `AuthTokenRefresher` fait tourner le
    // jeton d'accès toutes les ~15 minutes, et `app.dart` rappelle `connect()`
    // avec le nouveau. Avant, ce chemin :
    //   1. vidait `_joinedConversations` ;
    //   2. recréait le socket.
    // Un `ChatScreen` ouvert ne re-rejoint sa conversation que dans son
    // `initState` : ses `message:new` cessaient donc d'arriver, sans erreur
    // visible, avec repli silencieux sur le polling de 15 s.
    final previouslyJoined = List<String>.from(_joinedConversations);

    // Un jeton différent EXIGE un socket neuf : `setAuth` n'est lu qu'à la
    // création. Le `??=` d'avant ne recréait donc jamais le socket, et celui-ci
    // continuait de s'authentifier avec un jeton devenu PÉRIMÉ — jusqu'à ce que
    // le backend le refuse et coupe la connexion.
    if (_connectedToken != null && _connectedToken != token) {
      _socket?.disconnect();
      _socket?.dispose();
      _socket = null;
      _connectedToken = null;
    }

    _connectedToken = token;
    _socket ??= sio.io(
      socketUrl,
      sio.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    final socket = _socket!;
    _joinedConversations
      ..clear()
      ..addAll(previouslyJoined);

    // Évite les listeners dupliqués à chaque connect()
    socket.off('connect');
    socket.off('message:new');
    socket.off('typing');
    socket.off('interview:update');

    socket.onConnect((_) {
      // Ré-tablit les rooms après une (re)connexion.
      for (final conversationId in List<String>.from(_joinedConversations)) {
        socket.emit('conversation:join', conversationId);
      }
      // Le socket seul ne dit PAS au backend si l'app est a l'ecran : il
      // reste vivant quand l'app passe en arriere-plan. Sans cette emission,
      // le backend croyait l'utilisateur « actif » et supprimait tout push.
      socket.emit('presence', {'visible': _visible});
    });

    socket.on('message:new', (data) {
      final conversationId = data is Map ? data['conversationId'] : null;
      if (conversationId is String && conversationId.isNotEmpty) {
        _messages.add(conversationId);
      }
    });

    socket.on('typing', (data) {
      if (data is! Map) return;
      final conversationId = data['conversationId'];
      if (conversationId is String && conversationId.isNotEmpty) {
        _typing.add(TypingEvent(
          conversationId: conversationId,
          typing: data['typing'] == true,
        ));
      }
    });

    socket.on('interview:update', (data) {
      if (data is Map<String, dynamic>) {
        _interviews.add(data);
      } else if (data is Map) {
        _interviews.add(Map<String, dynamic>.from(data));
      }
    });

    socket.connect();
  }

  /// Rejoint la room d'une conversation (mémorisée pour les reconnexions).
  void joinConversation(String conversationId) {
    if (conversationId.isEmpty) return;
    _joinedConversations.add(conversationId);
    if (_socket?.connected ?? false) {
      _socket!.emit('conversation:join', conversationId);
    }
  }

  /// Quitte la room d'une conversation (écran fermé).
  void leaveConversation(String conversationId) {
    _joinedConversations.remove(conversationId);
    if (_socket?.connected ?? false) {
      _socket!.emit('conversation:leave', conversationId);
    }
  }

  /// Signale aux autres membres que l'utilisateur est en train d'écrire
  /// (ou a arrêté). Throttling géré par l'appelant.
  void sendTyping(String conversationId, {required bool typing}) {
    if (conversationId.isEmpty || !(_socket?.connected ?? false)) return;
    _socket!.emit('conversation:typing',
        {'conversationId': conversationId, 'typing': typing});
  }

  /// Ferme la connexion et réinitialise l'état (déconnexion utilisateur).
  ///
  /// Vide aussi les rooms : c'est le comportement voulu pour une déconnexion
  /// VOLONTAIRE. La rotation de jeton ne passe plus par ici — `connect()`
  /// gère lui-même le changement de jeton en préservant les rooms.
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connectedToken = null;
    viewingConversationId = null;
    _joinedConversations.clear();
  }
}
