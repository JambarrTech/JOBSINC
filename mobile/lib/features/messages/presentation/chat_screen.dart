import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/services/api_client.dart';
import '../../../core/services/chat_socket_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/chat_message.dart';
import '../models/conversation.dart';
import '../providers/messages_provider.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversation});

  final Conversation conversation;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> with WidgetsBindingObserver {
  final _scrollController = ScrollController();
  final _inputController = TextEditingController();
  final _focusNode = FocusNode();
  String? _lastSeenBottomMessageId;
  Timer? _pollTimer;
  StreamSubscription<String>? _socketSub;

  // --- « En train d'écrire… » ---
  StreamSubscription<TypingEvent>? _typingSub;
  bool _peerTyping = false;
  Timer? _peerTypingReset;
  bool _typingActiveSent = false;
  DateTime _lastTypingSentAt = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scrollController.addListener(_onScroll);
    _inputController.addListener(_onInputChanged);
    Future.microtask(() => ref.read(chatProvider(widget.conversation).notifier).load());
    _connectSocket();
    _startPolling();
  }

  // ------------------------------------------------------------
  // TEMPS RÉEL (Socket.IO) : rejoint la room de la conversation et
  // resynchronise dès qu'un message y arrive. Le polling reste en
  // filet de sécurité si le socket est indisponible.
  // ------------------------------------------------------------
  void _connectSocket() {
    final token = ref.read(authProvider).user?.token;
    if (token != null && token.isNotEmpty) {
      ChatSocketService.instance.viewingConversationId = widget.conversation.id;
      ChatSocketService.instance.connect(token);
      _socketSub = ChatSocketService.instance.messageEvents.listen((conversationId) {
        if (mounted && conversationId == widget.conversation.id) _sync();
      });
      _typingSub = ChatSocketService.instance.typingEvents.listen(_onPeerTyping);
    }
    ChatSocketService.instance.joinConversation(widget.conversation.id);
  }

  void _onPeerTyping(TypingEvent event) {
    if (!mounted || event.conversationId != widget.conversation.id) return;
    setState(() => _peerTyping = event.typing);
    _peerTypingReset?.cancel();
    if (event.typing) {
      // Sécurité : l'état retombe si aucun nouveau signal n'arrive.
      _peerTypingReset = Timer(const Duration(seconds: 4), () {
        if (mounted) setState(() => _peerTyping = false);
      });
    }
  }

  // ------------------------------------------------------------
  // SIGNALE NOTRE SAISIE : au plus une émission toutes les 2 s tant
  // que du texte est présent, puis un « false » à l'effacement/envoi.
  // ------------------------------------------------------------
  void _onInputChanged() {
    final active = _inputController.text.trim().isNotEmpty;
    if (!active) {
      if (_typingActiveSent) {
        _typingActiveSent = false;
        ChatSocketService.instance.sendTyping(widget.conversation.id, typing: false);
      }
      return;
    }
    final now = DateTime.now();
    if (!_typingActiveSent || now.difference(_lastTypingSentAt).inMilliseconds >= 2000) {
      _typingActiveSent = true;
      _lastTypingSentAt = now;
      ChatSocketService.instance.sendTyping(widget.conversation.id, typing: true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _socketSub?.cancel();
    _typingSub?.cancel();
    _peerTypingReset?.cancel();
    if (_typingActiveSent) {
      ChatSocketService.instance.sendTyping(widget.conversation.id, typing: false);
    }
    if (ChatSocketService.instance.viewingConversationId == widget.conversation.id) {
      ChatSocketService.instance.viewingConversationId = null;
    }
    ChatSocketService.instance.leaveConversation(widget.conversation.id);
    _scrollController.removeListener(_onScroll);
    _inputController.removeListener(_onInputChanged);
    _scrollController.dispose();
    _inputController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------
  // FILET DE SÉCURITÉ (polling lent) : actif uniquement lorsque
  // l'écran est visible et l'application en premier plan.
  // ------------------------------------------------------------
  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted && !ChatSocketService.instance.isConnected) _sync();
    });
  }

  Future<void> _sync() => ref.read(chatProvider(widget.conversation).notifier).poll();

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _sync();
      _startPolling();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  // ------------------------------------------------------------
  // PAGINATION VERS LE HAUT : charge les messages plus anciens
  // lorsque l'utilisateur approche du haut de la liste.
  // ------------------------------------------------------------
  void _onScroll() {
    if (_scrollController.position.pixels > 240) return;
    final chat = ref.read(chatProvider(widget.conversation));
    if (!chat.hasMore || chat.isLoadingOlder || chat.isLoading || chat.messages.isEmpty) return;
    _loadOlderPreservingOffset();
  }

  Future<void> _loadOlderPreservingOffset() async {
    final distanceFromBottom =
        _scrollController.position.maxScrollExtent - _scrollController.position.pixels;
    await ref.read(chatProvider(widget.conversation).notifier).loadOlder();
    if (!mounted || !_scrollController.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final target = (_scrollController.position.maxScrollExtent - distanceFromBottom)
          .clamp(0.0, _scrollController.position.maxScrollExtent);
      _scrollController.jumpTo(target);
    });
  }

  void _scrollToBottom({bool animated = false}) {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position.maxScrollExtent;
    if (animated) {
      _scrollController.animateTo(
        position,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      });
    }
  }

  Future<void> _send() async {
    final content = _inputController.text.trim();
    if (content.isEmpty) return;
    _inputController.clear();
    _focusNode.unfocus();
    if (_typingActiveSent) {
      _typingActiveSent = false;
      ChatSocketService.instance.sendTyping(widget.conversation.id, typing: false);
    }

    final sent = await ref.read(chatProvider(widget.conversation).notifier).send(content);
    if (!mounted) return;

    if (!sent) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Impossible d'envoyer le message."),
          backgroundColor: AppColors.error,
        ),
      );
      _inputController.text = content;
    } else {
      _scrollToBottom(animated: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatProvider(widget.conversation));

    // Défile automatiquement vers le bas uniquement lorsqu'un NOUVEAU
    // message apparaît en fin de liste (pas lors du chargement de
    // messages plus anciens).
    ref.listen(chatProvider(widget.conversation).select((s) => s.messages.isEmpty ? null : s.messages.last.id),
        (previous, next) {
      if (next != null && next != _lastSeenBottomMessageId) {
        final isFirstLoad = _lastSeenBottomMessageId == null;
        _lastSeenBottomMessageId = next;
        if (!isFirstLoad || chat.messages.length <= 30) {
          _scrollToBottom(animated: !isFirstLoad);
        }
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 0,
        title: Row(
          children: [
            _HeaderAvatar(conversation: chat.conversation ?? widget.conversation),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    chat.conversation?.participantName ?? widget.conversation.participantName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.text,
                    ),
                  ),
                  Text(
                    _peerTyping
                        ? "En train d'écrire…"
                        : _headerSubtitle(chat.conversation ?? widget.conversation),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: _peerTyping ? FontWeight.w600 : FontWeight.w400,
                      color:
                          _peerTyping ? AppColors.primary : AppColors.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (chat.isReconnecting)
            const _ReconnectingBanner(),
          Expanded(
            child: chat.isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : chat.error != null && chat.messages.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.cloud_off_rounded,
                                  size: 48, color: AppColors.secondaryText),
                              const SizedBox(height: 12),
                              Text(
                                chat.error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: AppColors.secondaryText),
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: () => ref
                                    .read(chatProvider(widget.conversation).notifier)
                                    .load(),
                                child: const Text('Réessayer'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : chat.messages.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 72,
                                    height: 72,
                                    decoration: BoxDecoration(
                                      color: AppColors.primary.withValues(alpha: .08),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.chat_bubble_outline_rounded,
                                      size: 32,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  const Text(
                                    'Aucun message',
                                    style: TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.text,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Envoyez le premier message à ${chat.conversation?.participantName ?? widget.conversation.participantName}.',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: AppColors.secondaryText,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : Builder(builder: (context) {
                            final headerCount =
                                (chat.isLoadingOlder || chat.hasMore) ? 1 : 0;
                            return GestureDetector(
                              onTap: () => _focusNode.unfocus(),
                              child: ListView.builder(
                                controller: _scrollController,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                itemCount: chat.messages.length + headerCount,
                                itemBuilder: (context, index) {
                                  if (index < headerCount) {
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      child: Center(
                                        child: chat.isLoadingOlder
                                            ? const SizedBox(
                                                width: 22,
                                                height: 22,
                                                child: CircularProgressIndicator(
                                                    strokeWidth: 2.5, color: AppColors.primary),
                                              )
                                            : TextButton.icon(
                                                onPressed: _loadOlderPreservingOffset,
                                                icon: const Icon(Icons.expand_less_rounded, size: 18),
                                                label: const Text('Charger les messages précédents',
                                                    style: TextStyle(fontSize: 12)),
                                              ),
                                      ),
                                    );
                                  }
                                  final messageIndex = index - headerCount;
                                  final message = chat.messages[messageIndex];
                                  final previous = messageIndex > 0
                                      ? chat.messages[messageIndex - 1]
                                      : null;
                                  return _MessageBubble(
                                    message: message,
                                    showDateSeparator: previous == null ||
                                        !_isSameDay(previous.createdAt, message.createdAt),
                                  );
                                },
                              ),
                            );
                          }),
          ),
          _InputBar(
            controller: _inputController,
            focusNode: _focusNode,
            enabled: !chat.sending,
            sending: chat.sending,
            onSend: _send,
          ),
        ],
      ),
    );
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _headerSubtitle(Conversation conversation) {
    final job = conversation.jobTitle?.trim() ?? '';
    if (job.isNotEmpty) return job;
    return conversation.applicationStatus ?? 'Messagerie JOBSINC';
  }
}

class _ReconnectingBanner extends StatelessWidget {
  const _ReconnectingBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.warning.withValues(alpha: .12),
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 13,
            height: 13,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.warning),
          ),
          const SizedBox(width: 8),
          Text(
            'Connexion interrompue — reprise automatique...',
            style: TextStyle(fontSize: 12, color: Colors.deepOrange.shade800),
          ),
        ],
      ),
    );
  }
}

class _DateSeparator extends StatelessWidget {
  const _DateSeparator({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = DateTime(now.year, now.month, now.day - 1);
    final dateOnly = DateTime(date.year, date.month, date.day);
    String label;
    if (dateOnly == today) {
      label = "Aujourd'hui";
    } else if (dateOnly == yesterday) {
      label = 'Hier';
    } else {
      label = DateFormat('dd MMMM yyyy', 'fr').format(date);
    }

    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.navy.withValues(alpha: .06),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppColors.secondaryText,
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.showDateSeparator});

  final ChatMessage message;
  final bool showDateSeparator;

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.of(context).size.width * .78;

    return Column(
      children: [
        if (showDateSeparator) _DateSeparator(date: message.createdAt),
        Align(
          alignment: message.isMine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: EdgeInsets.only(
              left: message.isMine ? 60 : 20,
              right: message.isMine ? 20 : 60,
              top: 3,
              bottom: 3,
            ),
            constraints: BoxConstraints(maxWidth: maxWidth),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: message.isMine ? AppColors.primary : Colors.white,
              border: message.isMine
                  ? null
                  : Border.all(color: AppColors.border.withValues(alpha: .6)),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(message.isMine ? 16 : 4),
                bottomRight: Radius.circular(message.isMine ? 4 : 16),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  message.content,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.35,
                    color: message.isMine ? Colors.white : AppColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      DateFormat('HH:mm').format(message.createdAt),
                      style: TextStyle(
                        fontSize: 10,
                        color: message.isMine
                            ? Colors.white.withValues(alpha: .75)
                            : AppColors.secondaryText,
                      ),
                    ),
                    if (message.isMine) ...[
                      const SizedBox(width: 4),
                      Icon(
                        message.isSending
                            ? Icons.schedule_rounded
                            : Icons.done_all_rounded,
                        size: 13,
                        color: message.isSending
                            ? Colors.white.withValues(alpha: .7)
                            : Colors.white.withValues(alpha: .9),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InputBar extends StatelessWidget {
  const _InputBar({
    required this.controller,
    required this.focusNode,
    required this.enabled,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool enabled;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: AppColors.navy.withValues(alpha: .05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, value, _) {
                  final canSend = value.text.trim().isNotEmpty && !sending;
                  return TextField(
                    controller: controller,
                    focusNode: focusNode,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    onSubmitted: (_) => onSend(),
                    style: const TextStyle(fontSize: 14, color: AppColors.text),
                    decoration: InputDecoration(
                      hintText: 'Écrivez votre message...',
                      hintStyle:
                          const TextStyle(fontSize: 14, color: AppColors.secondaryText),
                      filled: true,
                      fillColor: AppColors.background,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide(color: Colors.grey.shade200),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: AppColors.primary),
                      ),
                      suffixIcon: canSend
                          ? IconButton(
                              icon: const Icon(Icons.send_rounded,
                                  color: AppColors.primary),
                              onPressed: onSend,
                            )
                          : null,
                    ),
                  );
                },
              ),
            ),
            if (sending)
              const Padding(
                padding: EdgeInsets.only(left: 10),
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.primary),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _HeaderAvatar extends StatelessWidget {
  const _HeaderAvatar({required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = conversation.avatarUrl != null && conversation.avatarUrl!.isNotEmpty;

    return CircleAvatar(
      radius: 18,
      backgroundColor: AppColors.navy,
      backgroundImage:
          hasPhoto ? CachedNetworkImageProvider(ApiClient.resolveUrl(conversation.avatarUrl!)) : null,
      child: hasPhoto
          ? null
          : Text(
              conversation.initials,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
    );
  }
}
