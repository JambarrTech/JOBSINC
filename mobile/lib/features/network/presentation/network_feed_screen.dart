import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_cached_image.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../../core/widgets/app_states.dart';
import '../models/network_models.dart';
import '../providers/network_providers.dart';

/// Onglet « Réseau » de l'espace candidat : fil social + annuaire.
///
/// MVP : composer (texte), like/unlike, commentaires, recherche candidats
/// et follow/unfollow. La messagerie candidat↔candidat réutilise l'onglet
/// Messages existant (phase 2 backend).
class NetworkFeedScreen extends ConsumerStatefulWidget {
  const NetworkFeedScreen({super.key});

  @override
  ConsumerState<NetworkFeedScreen> createState() => _NetworkFeedScreenState();
}

class _NetworkFeedScreenState extends ConsumerState<NetworkFeedScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _composer = TextEditingController();
  final _search = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _composer.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _publish() async {
    final ok = await ref.read(networkActionsProvider.notifier).publish(_composer.text);
    if (!mounted) return;
    if (ok) {
      _composer.clear();
      AppFeedback.success(context, 'Publication partagée.');
    } else {
      AppFeedback.error(context, 'Impossible de publier.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: _ComposerField(controller: _composer, onSend: _publish),
        ),
        const SizedBox(height: 8),
        TabBar(
          controller: _tabs,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.secondaryText,
          indicatorColor: AppColors.primary,
          tabs: const [Tab(text: 'Fil'), Tab(text: 'Candidats')],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _FeedList(onComment: (post) => _openComments(context, post)),
              _CandidatesList(query: _query, onQuery: (v) => setState(() => _query = v), searchController: _search),
            ],
          ),
        ),
      ],
    );
  }

  void _openComments(BuildContext context, NetworkPost post) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CommentsSheet(post: post),
    );
  }
}

class _ComposerField extends StatelessWidget {
  const _ComposerField({required this.controller, required this.onSend});
  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.background),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              maxLines: 3,
              minLines: 1,
              maxLength: 2000,
              decoration: const InputDecoration(
                hintText: 'Partage une actu avec les candidats…',
                border: InputBorder.none,
                counterText: '',
              ),
            ),
          ),
          IconButton(
            tooltip: 'Publier',
            onPressed: onSend,
            icon: const Icon(Icons.send_rounded, color: AppColors.primary),
          ),
        ],
      ),
    );
  }
}

class _FeedList extends ConsumerWidget {
  const _FeedList({required this.onComment});
  final ValueChanged<NetworkPost> onComment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(networkFeedProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(networkFeedProvider.future),
      child: feed.when(
        loading: () => const Center(child: AppLoader(label: 'Chargement du fil')),
        error: (_, __) => ListView(
          children: [
            const SizedBox(height: 80),
            AppErrorState(
              message: 'Impossible de charger le fil.',
              onRetry: () => ref.invalidate(networkFeedProvider),
            ),
          ],
        ),
        data: (posts) {
          if (posts.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 60),
                Text('Aucune publication pour le moment. Sois le premier à partager !',
                    textAlign: TextAlign.center),
              ],
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            itemCount: posts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _PostCard(post: posts[i], onComment: () => onComment(posts[i])),
          );
        },
      ),
    );
  }
}

class _PostCard extends ConsumerWidget {
  const _PostCard({required this.post, required this.onComment});
  final NetworkPost post;
  final VoidCallback onComment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.background),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Avatar(author: post.author, size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(post.author.name,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                    if (post.author.city != null)
                      Text(post.author.city!,
                          style: const TextStyle(fontSize: 12, color: AppColors.secondaryText)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(post.content, style: const TextStyle(fontSize: 14, height: 1.45)),
          const SizedBox(height: 10),
          Row(
            children: [
              TextButton.icon(
                onPressed: () => ref.read(networkActionsProvider.notifier).toggleLike(post),
                icon: Icon(
                  post.likedByMe ? Icons.favorite : Icons.favorite_border,
                  size: 18,
                  color: post.likedByMe ? AppColors.error : AppColors.secondaryText,
                ),
                label: Text('${post.likesCount}',
                    style: const TextStyle(color: AppColors.secondaryText)),
              ),
              TextButton.icon(
                onPressed: onComment,
                icon: const Icon(Icons.chat_bubble_outline, size: 18, color: AppColors.secondaryText),
                label: Text('${post.commentsCount}',
                    style: const TextStyle(color: AppColors.secondaryText)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.author, this.size = 40});
  final NetworkAuthor author;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (author.avatarUrl != null && author.avatarUrl!.isNotEmpty) {
      return AppCachedImage(
        url: author.avatarUrl,
        width: size,
        height: size,
        borderRadius: BorderRadius.circular(size / 2),
        errorWidget: (_, __, ___) => _fallback(),
      );
    }
    return _fallback();
  }

  Widget _fallback() {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [AppColors.primary, AppColors.navy]),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(author.initials,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _CommentsSheet extends ConsumerStatefulWidget {
  const _CommentsSheet({required this.post});
  final NetworkPost post;

  @override
  ConsumerState<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<_CommentsSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final comments = ref.watch(networkCommentsProvider(widget.post.id));
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(width: 40, height: 4,
                decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            const Text('Commentaires', style: TextStyle(fontWeight: FontWeight.w800)),
            Expanded(
              child: comments.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => const Center(child: Text('Impossible de charger.')),
                data: (items) => ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Avatar(author: items[i].author, size: 32),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.background.withValues(alpha: .4),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(items[i].author.name,
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                              Text(items[i].content, style: const TextStyle(fontSize: 13.5)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      maxLength: 500,
                      decoration: const InputDecoration(
                        hintText: 'Ajouter un commentaire…',
                        border: OutlineInputBorder(),
                        counterText: '',
                        isDense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Envoyer',
                    icon: const Icon(Icons.send_rounded, color: AppColors.primary),
                    onPressed: () async {
                      await ref
                          .read(networkActionsProvider.notifier)
                          .comment(widget.post.id, _controller.text);
                      _controller.clear();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CandidatesList extends ConsumerWidget {
  const _CandidatesList({required this.query, required this.onQuery, required this.searchController});
  final String query;
  final ValueChanged<String> onQuery;
  final TextEditingController searchController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final candidates = ref.watch(networkCandidatesProvider(query));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: TextField(
            controller: searchController,
            onSubmitted: onQuery,
            decoration: InputDecoration(
              hintText: 'Rechercher (nom, compétence, ville)',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: IconButton(
                tooltip: 'Rechercher',
                icon: const Icon(Icons.arrow_forward_rounded),
                onPressed: () => onQuery(searchController.text.trim()),
              ),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              isDense: true,
            ),
          ),
        ),
        Expanded(
          child: candidates.when(
            loading: () => const Center(child: AppLoader(label: 'Recherche')),
            error: (_, __) => Center(
              child: AppErrorState(
                message: 'Impossible de charger.',
                onRetry: () => ref.invalidate(networkCandidatesProvider(query)),
              ),
            ),
            data: (items) {
              final visible = items.where((c) => !c.isSelf).toList(growable: false);
              if (visible.isEmpty) {
                return const Center(child: Text('Aucun candidat trouvé.'));
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                itemCount: visible.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final c = visible[i];
                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: const BorderSide(color: AppColors.background),
                    ),
                    leading: _Avatar(
                      author: NetworkAuthor(id: c.id, name: c.name, avatarUrl: c.avatarUrl, city: c.city),
                    ),
                    title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: c.city != null ? Text(c.city!) : (c.skills != null ? Text(c.skills!, maxLines: 1, overflow: TextOverflow.ellipsis) : null),
                    trailing: OutlinedButton(
                      onPressed: () => ref.read(networkActionsProvider.notifier).toggleFollow(c, query),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                      child: Text(c.isFollowing ? 'Suivi' : 'Suivre'),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
