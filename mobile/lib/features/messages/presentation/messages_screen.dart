import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../models/conversation.dart';
import '../providers/messages_provider.dart';

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key, this.isCompanySide = true});

  /// true : espace entreprise (liste des candidats).
  /// false : espace candidat / employé (liste des entreprises).
  final bool isCompanySide;

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  String _query = '';
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(messagesProvider.notifier).load());
    // Rafraîchissement léger des badges de non-lus pendant que
    // l'écran reste visible (aucun système temps réel côté serveur).
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      ref.read(messagesProvider.notifier).refreshQuietly();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(messagesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.read(messagesProvider.notifier).load(),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Messages',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: AppColors.text,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: _totalUnread(state.conversations) > 0
                                ? AppColors.primary
                                : AppColors.primary.withValues(alpha: .1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '${_totalUnread(state.conversations)}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: _totalUnread(state.conversations) > 0
                                  ? Colors.white
                                  : AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.isCompanySide
                          ? 'Vos échanges avec les candidats'
                          : 'Vos échanges avec les entreprises',
                      style: const TextStyle(fontSize: 14, color: AppColors.secondaryText),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      onChanged: (value) => setState(() => _query = value),
                      decoration: InputDecoration(
                        hintText: 'Rechercher une conversation...',
                        prefixIcon:
                            const Icon(Icons.search_rounded, color: AppColors.secondaryText),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Colors.grey.shade200),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (state.isLoading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (state.error != null && state.conversations.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.cloud_off_rounded,
                          size: 48, color: AppColors.secondaryText),
                      const SizedBox(height: 12),
                      Text(
                        state.error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.secondaryText),
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => ref.read(messagesProvider.notifier).load(),
                        child: const Text('Réessayer'),
                      ),
                    ],
                  ),
                ),
              )
            else if (_filtered(state.conversations).isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: AppColors.turquoise.withValues(alpha: .1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.chat_bubble_outline_rounded,
                          size: 36,
                          color: AppColors.turquoise,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        _query.isEmpty ? 'Aucune conversation' : 'Aucun résultat',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _query.isEmpty
                            ? (widget.isCompanySide
                                ? "Démarrez un échange depuis la fiche d'un candidat."
                                : 'Vos échanges apparaîtront ici dès qu\'une entreprise ouvre la discussion.')
                            : 'Aucune conversation ne correspond à votre recherche.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppColors.secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
                sliver: SliverList.separated(
                  itemCount: _filtered(state.conversations).length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, index) {
                    final conversation = _filtered(state.conversations)[index];
                    return _ConversationTile(
                      conversation: conversation,
                      showContext: true,
                      onTap: () =>
                          context.push(widget.isCompanySide ? '/recruiter/chat' : '/chat', extra: conversation),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  int _totalUnread(List<Conversation> conversations) =>
      conversations.fold(0, (sum, c) => sum + c.unreadCount);

  List<Conversation> _filtered(List<Conversation> conversations) {
    if (_query.trim().isEmpty) return conversations;
    final query = _query.trim().toLowerCase();
    return conversations
        .where((c) =>
            c.participantName.toLowerCase().contains(query) ||
            c.preview.toLowerCase().contains(query) ||
            c.subject.toLowerCase().contains(query))
        .toList();
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, this.onTap, this.showContext = false});

  final Conversation conversation;
  final VoidCallback? onTap;
  final bool showContext;

  String get _contextLabel {
    if (conversation.jobTitle?.trim().isNotEmpty ?? false) return conversation.jobTitle!.trim();
    if (conversation.subject.trim().isNotEmpty) return conversation.subject.trim();
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final unread = conversation.unreadCount > 0;

    return Material(
      color: unread ? AppColors.primary.withValues(alpha: .04) : Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              _Avatar(conversation: conversation),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.participantName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: unread ? FontWeight.w800 : FontWeight.w600,
                              color: AppColors.text,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatDate(conversation.lastMessageAt),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                            color:
                                unread ? AppColors.primary : AppColors.secondaryText,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (showContext && _contextLabel.isNotEmpty) ...[
                      Row(
                        children: [
                          const Icon(Icons.work_outline_rounded, size: 12, color: AppColors.secondaryText),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              _contextLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12, color: AppColors.secondaryText),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                    ],
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.preview.isEmpty
                                ? 'Aucun message'
                                : conversation.preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.3,
                              color: unread
                                  ? AppColors.text.withValues(alpha: .75)
                                  : AppColors.secondaryText,
                            ),
                          ),
                        ),
                        if (unread) ...[
                          const SizedBox(width: 8),
                          Container(
                            constraints: const BoxConstraints(minWidth: 20),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              conversation.unreadCount > 99
                                  ? '99+'
                                  : '${conversation.unreadCount}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inMinutes < 1) return "À l'instant";
    if (diff.inHours < 24 && date.day == now.day) {
      return DateFormat('HH:mm').format(date);
    }
    if (diff.inDays < 7) return DateFormat('EEE', 'fr').format(date);
    return DateFormat('dd MMM', 'fr').format(date);
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final hasPhoto =
        conversation.avatarUrl != null && conversation.avatarUrl!.isNotEmpty;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 25,
          backgroundColor: AppColors.navy,
          backgroundImage:
              hasPhoto ? NetworkImage(ApiClient.resolveUrl(conversation.avatarUrl!)) : null,
          child: hasPhoto
              ? null
              : Text(
                  conversation.initials,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
        ),
        if (conversation.unreadCount > 0)
          Positioned(
            top: 0,
            right: 0,
            width: 12,
            height: 12,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}
