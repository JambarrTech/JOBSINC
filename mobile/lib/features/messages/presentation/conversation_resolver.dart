import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/app_states.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/messages_repository.dart';
import '../models/conversation.dart';
import '../providers/messages_provider.dart';
import 'chat_screen.dart';
import 'messages_screen.dart';

/// Resout un identifiant de conversation vers un ecran de discussion.
///
/// Les routes `/chat` et `/recruiter/chat` recoivent l'identifiant brut dans
/// `GoRouterState.extra` (c'est la seule forme disponible dans le payload d'une
/// notification, FCM comme locale), mais leur builder attendait un objet
/// `Conversation` :
///
/// ```dart
/// final conversation = state.extra;
/// if (conversation is Conversation) return ChatScreen(...);
/// return const MessagesScreen();   // <- toujours pris
/// ```
///
/// Le `String` ne passait donc jamais le test de type et **tout** appui sur
/// notification atterrissait sur la liste des conversations.
///
/// Ce widget accepte les deux formes et resout l'identifiant aupres de l'API
/// lorsque la conversation n'est pas encore dans la liste chargee (demarrage a
/// froid, liste vide).
class ConversationResolver extends ConsumerStatefulWidget {
  const ConversationResolver({
    super.key,
    this.conversationId,
    this.conversation,
    this.isCompanySide = false,
  });

  /// Identifiant brut (payload de notification, lien profond).
  final String? conversationId;

  /// Conversation deja resolue, si elle est connue.
  final Conversation? conversation;

  /// `true` pour l'interface recruteur (liste et repli).
  final bool isCompanySide;

  @override
  ConsumerState<ConversationResolver> createState() => _ConversationResolverState();
}

class _ConversationResolverState extends ConsumerState<ConversationResolver> {
  late final String? _id = widget.conversation?.id ?? widget.conversationId;
  Future<Conversation?>? _resolution;

  @override
  void initState() {
    super.initState();
    final id = _id;
    if (id != null && id.isNotEmpty && widget.conversation == null) {
      _resolution = _resolve(id);
    }
  }

  /// Cherche d'abord dans la liste deja chargee, puis va chercher l'element.
  Future<Conversation?> _resolve(String id) async {
    final cached = _fromProvider(id);
    if (cached != null) return cached;

    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return null;
    try {
      final (conversation, _, _) = await MessagesRepository().fetchFirstPage(token, id);
      return conversation;
    } catch (_) {
      return null;
    }
  }

  Conversation? _fromProvider(String id) {
    for (final conversation in ref.read(messagesProvider).conversations) {
      if (conversation.id == id) return conversation;
    }
    return null;
  }

  Widget _fallback() {
    // Conversation inaccessible (supprimee, ou sans rapport de visibilite) :
    // on retombe sur la liste plutot que sur un ecran vide sans issue.
    return MessagesScreen(isCompanySide: widget.isCompanySide);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.conversation != null) {
      return ChatScreen(conversation: widget.conversation!);
    }

    final id = _id;
    if (id == null || id.isEmpty) {
      return MessagesScreen(isCompanySide: widget.isCompanySide);
    }

    final known = _fromProvider(id);
    if (known != null) return ChatScreen(conversation: known);

    return FutureBuilder<Conversation?>(
      future: _resolution,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: AppLoader()));
        }
        final conversation = snapshot.data;
        if (conversation == null) return _fallback();
        return ChatScreen(conversation: conversation);
      },
    );
  }
}
