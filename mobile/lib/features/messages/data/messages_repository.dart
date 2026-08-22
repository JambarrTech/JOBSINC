import '../../../core/services/api_client.dart';
import '../models/chat_message.dart';
import '../models/conversation.dart';

/// Taille de page utilisée pour l'historique d'une conversation.
const int kChatPageSize = 30;

class MessagesRepository {
  MessagesRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;

  // Endpoints unifiés /conversations : le backend détermine le côté de
  // chaque utilisateur (entreprise ou candidat) à partir du rôle du token.
  // Aucun identifiant sensible n'est envoyé par le client : le serveur ne
  // fait jamais confiance aux ids transmis.

  Future<List<Conversation>> fetchConversations(String token) async {
    final response = await _api.get('/conversations', token: token);
    final list = response['data'] as List<dynamic>? ?? const <dynamic>[];
    return list
        .whereType<Map<String, dynamic>>()
        .map(Conversation.fromJson)
        .toList(growable: false);
  }

  Future<(Conversation?, List<ChatMessage>, bool)> fetchFirstPage(
    String token,
    String conversationId,
  ) async {
    final response = await _api.get(
      '/conversations/$conversationId/messages?limit=$kChatPageSize',
      token: token,
    );
    return _parsePage(response);
  }

  /// Charge les messages plus anciens que [beforeId] (pagination vers le haut).
  Future<(Conversation?, List<ChatMessage>, bool)> fetchOlderPage(
    String token,
    String conversationId, {
    required String beforeId,
  }) async {
    final response = await _api.get(
      '/conversations/$conversationId/messages?limit=$kChatPageSize&before=$beforeId',
      token: token,
    );
    return _parsePage(response);
  }

  /// Récupère uniquement les messages postérieurs à [afterId] (temps réel).
  Future<List<ChatMessage>> fetchNewSince(
    String token,
    String conversationId, {
    required String afterId,
  }) async {
    final response = await _api.get(
      '/conversations/$conversationId/messages?after=$afterId',
      token: token,
    );
    return _decodeMessages(response['messages']);
  }

  Future<ChatMessage> sendMessage({
    required String token,
    required String conversationId,
    required String content,
  }) async {
    final response = await _api.post(
      '/conversations/$conversationId/messages',
      {'content': content},
      token: token,
    );
    return ChatMessage.fromJson(response);
  }

  Future<void> markAsRead(String token, String conversationId) async {
    try {
      await _api.patch('/conversations/$conversationId/read', {}, token: token);
    } catch (_) {}
  }

  (Conversation?, List<ChatMessage>, bool) _parsePage(Map<String, dynamic> response) {
    final conversationJson = response['conversation'];
    final conversation =
        conversationJson is Map<String, dynamic> ? Conversation.fromJson(conversationJson) : null;
    final messages = _decodeMessages(response['messages']);
    final hasMore = response['hasMore'] == true;
    return (conversation, messages, hasMore);
  }

  List<ChatMessage> _decodeMessages(dynamic raw) {
    return (raw as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(growable: false);
  }
}
