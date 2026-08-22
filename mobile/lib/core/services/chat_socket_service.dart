import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as sio;

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
  static final String socketUrl =
      const String.fromEnvironment('API_URL', defaultValue: 'http://127.0.0.1:5000/api')
          .replaceFirst(RegExp(r'/api/?$'), '');

  sio.Socket? _socket;
  String? _connectedToken;
  final Set<String> _joinedConversations = {};

  /// Conversation actuellement affichée à l'écran (null sinon).
  String? viewingConversationId;

  final StreamController<String> _messages =
      StreamController<String>.broadcast();
  final StreamController<TypingEvent> _typing =
      StreamController<TypingEvent>.broadcast();

  /// Flux des conversationId ayant reçu un nouveau message.
  Stream<String> get messageEvents => _messages.stream;

  /// Flux des événements « en train d'écrire » des autres participants.
  Stream<TypingEvent> get typingEvents => _typing.stream;

  bool get isConnected => _socket?.connected ?? false;

  /// Établit la connexion si nécessaire (idempotent).
  void connect(String token) {
    if (token.isEmpty) return;
    if (isConnected && _connectedToken == token) return;
    if (_connectedToken != null && _connectedToken != token) disconnect();

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

    socket.onConnect((_) {
      // Ré-tablit les rooms après une (re)connexion.
      for (final conversationId in List<String>.from(_joinedConversations)) {
        socket.emit('conversation:join', [conversationId]);
      }
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

    socket.connect();
  }

  /// Rejoint la room d'une conversation (mémorisée pour les reconnexions).
  void joinConversation(String conversationId) {
    if (conversationId.isEmpty) return;
    _joinedConversations.add(conversationId);
    if (_socket?.connected ?? false) {
      _socket!.emit('conversation:join', [conversationId]);
    }
  }

  /// Quitte la room d'une conversation (écran fermé).
  void leaveConversation(String conversationId) {
    _joinedConversations.remove(conversationId);
    if (_socket?.connected ?? false) {
      _socket!.emit('conversation:leave', [conversationId]);
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
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connectedToken = null;
    viewingConversationId = null;
    _joinedConversations.clear();
  }
}
