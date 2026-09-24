import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for_extension.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../core/services/api_client.dart';
import '../data/messages_repository.dart';
import '../models/chat_message.dart';
import '../models/conversation.dart';

class MessagesState {
  const MessagesState({
    this.conversations = const [],
    this.isLoading = true,
    this.error,
  });

  final List<Conversation> conversations;
  final bool isLoading;
  final String? error;

  MessagesState copyWith({
    List<Conversation>? conversations,
    bool? isLoading,
    String? error,
  }) {
    return MessagesState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

class MessagesController extends Notifier<MessagesState> {
  final _repo = MessagesRepository();

  @override
  MessagesState build() {
    ref.cacheFor(const Duration(minutes: 5));
    return const MessagesState();
  }

  String? get _token => ref.read(authProvider).user?.token;

  Future<void> load() async {
    final token = _token;
    if (token == null || token.isEmpty) {
      state = const MessagesState(isLoading: false, error: 'Non connecté.');
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    try {
      final conversations = await _repo.fetchConversations(token);
      state = MessagesState(conversations: conversations, isLoading: false);
    } catch (_) {
      state = state.copyWith(isLoading: false, error: 'Erreur de chargement.');
    }
  }

  void clearUnread(String conversationId) {
    state = state.copyWith(
      conversations: state.conversations
          .map((c) => c.id == conversationId ? c.copyWith(unreadCount: 0) : c)
          .toList(growable: false),
    );
  }

  void updateLastMessage(String conversationId, String preview, DateTime at) {
    state = state.copyWith(
      conversations: state.conversations
          .map((c) =>
              c.id == conversationId ? c.copyWith(preview: preview, lastMessageAt: at) : c)
          .toList(growable: false),
    );
  }

  /// Rafraîchit silencieusement les badges de non-lus (polling léger).
  Future<void> refreshQuietly() async {
    final token = _token;
    if (token == null || token.isEmpty) return;
    try {
      final conversations = await _repo.fetchConversations(token);
      if (conversations.isEmpty && state.conversations.isNotEmpty) return;
      state = state.copyWith(conversations: conversations);
    } catch (_) {
      // Silencieux : l'état courant reste affiché hors connexion.
    }
  }
}

final messagesProvider =
    NotifierProvider<MessagesController, MessagesState>(MessagesController.new);

class ChatState {
  const ChatState({
    this.conversation,
    this.messages = const [],
    this.isLoading = true,
    this.sending = false,
    this.error,
    this.hasMore = false,
    this.isLoadingOlder = false,
    this.isReconnecting = false,
  });

  final Conversation? conversation;
  final List<ChatMessage> messages;
  final bool isLoading;
  final bool sending;
  final String? error;

  /// Pagination : des messages plus anciens existent côté serveur.
  final bool hasMore;
  final bool isLoadingOlder;

  /// Indique une reconnexion en cours après un échec réseau du polling.
  final bool isReconnecting;

  ChatState copyWith({
    Conversation? conversation,
    List<ChatMessage>? messages,
    bool? isLoading,
    bool? sending,
    String? error,
    bool? hasMore,
    bool? isLoadingOlder,
    bool? isReconnecting,
  }) {
    return ChatState(
      conversation: conversation ?? this.conversation,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      sending: sending ?? this.sending,
      error: error ?? this.error,
      hasMore: hasMore ?? this.hasMore,
      isLoadingOlder: isLoadingOlder ?? this.isLoadingOlder,
      isReconnecting: isReconnecting ?? this.isReconnecting,
    );
  }
}

List<ChatMessage> _mergeById(List<ChatMessage> current, List<ChatMessage> incoming) {
  if (incoming.isEmpty) return current;
  final known = current.map((m) => m.id).toSet();
  final merged = [...current];
  for (final message in incoming) {
    if (!known.contains(message.id)) {
      merged.add(message);
      known.add(message.id);
    }
  }
  merged.sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return merged;
}

class ChatController extends FamilyNotifier<ChatState, Conversation> {
  final _repo = MessagesRepository();

  @override
  ChatState build(Conversation arg) {
    ref.cacheFor(const Duration(minutes: 5));
    return ChatState(conversation: arg);
  }

  String? get _token => ref.read(authProvider).user?.token;

  /// Id du dernier message réel (hors messages optimistes temporaires).
  String? get _lastRealMessageId {
    for (final message in state.messages.reversed) {
      if (!message.id.startsWith('temp-')) return message.id;
    }
    return null;
  }

  Future<void> load() async {
    final token = _token;
    if (token == null || token.isEmpty) {
      state = state.copyWith(isLoading: false, error: 'Non connecté.');
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    try {
      final (conversation, messages, hasMore) =
          await _repo.fetchFirstPage(token, arg.id);
      state = ChatState(
        conversation: conversation ?? arg,
        messages: messages,
        hasMore: hasMore,
        // Le constructeur met isLoading à true par défaut : sans ce
        // paramètre, l'écran resterait bloqué sur le spinner.
        isLoading: false,
      );
      await _repo.markAsRead(token, arg.id);
      ref.read(messagesProvider.notifier).clearUnread(arg.id);
    } on ApiException catch (error) {
      state = state.copyWith(isLoading: false, error: error.message);
    } catch (_) {
      state = state.copyWith(isLoading: false, error: 'Erreur de chargement.');
    }
  }

  /// Charge la page plus ancienne lorsque l'utilisateur remonte dans
  /// l'historique (pagination serveur par curseur).
  Future<void> loadOlder() async {
    final token = _token;
    if (token == null ||
        token.isEmpty ||
        !state.hasMore ||
        state.isLoadingOlder ||
        state.messages.isEmpty) {
      return;
    }

    final firstId = state.messages.first.id;
    state = state.copyWith(isLoadingOlder: true);

    try {
      final (_, older, hasMore) = await _repo.fetchOlderPage(
        token,
        arg.id,
        beforeId: firstId,
      );
      final existingIds = state.messages.map((m) => m.id).toSet();
      final fresh = older.where((m) => !existingIds.contains(m.id)).toList();
      state = state.copyWith(
        messages: [...fresh, ...state.messages],
        hasMore: hasMore,
        isLoadingOlder: false,
      );
    } catch (_) {
      state = state.copyWith(isLoadingOlder: false);
    }
  }

  /// Synchro temps réel (polling incrémental) : récupère uniquement les
  /// messages apparus depuis le dernier connu et les fusionne.
  Future<void> poll() async {
    final token = _token;
    if (token == null || token.isEmpty || state.isLoading) return;

    final anchorId = _lastRealMessageId;
    try {
      final List<ChatMessage> fresh;
      if (anchorId == null) {
        final (_, messages, _) = await _repo.fetchFirstPage(token, arg.id);
        fresh = messages;
      } else {
        fresh = await _repo.fetchNewSince(token, arg.id, afterId: anchorId);
      }

      final incomingOthers = fresh.any((m) => !m.isMine);
      final merged = _mergeById(state.messages, fresh);
      if (merged.length != state.messages.length) {
        state = state.copyWith(messages: merged, isReconnecting: false);
        final last = merged.last;
        ref.read(messagesProvider.notifier)
            .updateLastMessage(arg.id, last.content, last.createdAt);
        if (incomingOthers) {
          await _repo.markAsRead(token, arg.id);
          ref.read(messagesProvider.notifier).clearUnread(arg.id);
        }
      } else {
        state = state.copyWith(isReconnecting: false);
      }
    } on ApiException catch (error) {
      // Accès refusé ou conversation fermée : on arrête le polling proprement.
      state = state.copyWith(isReconnecting: false, error: error.message);
    } catch (_) {
      state = state.copyWith(isReconnecting: true);
    }
  }

  Future<bool> send(String rawContent) async {
    final content = rawContent.trim();
    final token = _token;
    if (content.isEmpty || token == null || token.isEmpty) return false;

    final temp = ChatMessage(
      id: 'temp-${DateTime.now().microsecondsSinceEpoch}',
      content: content,
      isMine: true,
      isSending: true,
      createdAt: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, temp],
      sending: true,
      error: null,
    );

    try {
      final sent = await _repo.sendMessage(
        token: token,
        conversationId: arg.id,
        content: content,
      );
      state = state.copyWith(
        messages: state.messages.map((m) => m.id == temp.id ? sent : m).toList(),
        sending: false,
        conversation:
            state.conversation?.copyWith(preview: content, lastMessageAt: sent.createdAt),
      );
      ref.read(messagesProvider.notifier).updateLastMessage(arg.id, content, sent.createdAt);
      return true;
    } catch (_) {
      state = state.copyWith(
        messages: state.messages.where((m) => m.id != temp.id).toList(),
        sending: false,
        error: "Impossible d'envoyer le message.",
      );
      return false;
    }
  }
}

final chatProvider = NotifierProvider.family<ChatController, ChatState, Conversation>(
  ChatController.new,
);
