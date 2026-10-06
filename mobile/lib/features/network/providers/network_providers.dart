import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/cache_for_extension.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/network_repository.dart';
import '../models/network_models.dart';

final networkRepositoryProvider = Provider<NetworkRepository>((ref) => NetworkRepository());

String? _token(Ref ref) => ref.watch(authProvider).user?.token;

/// Fil réseau paginé (page 1 pour le MVP ; pagination complète en phase 2).
final networkFeedProvider = FutureProvider<List<NetworkPost>>((ref) async {
  final token = _token(ref);
  if (token == null || token.isEmpty) return const <NetworkPost>[];
  ref.cacheFor(const Duration(minutes: 1));
  return ref.watch(networkRepositoryProvider).fetchFeed(token);
});

/// Commentaires d'un post (family par id, comme `chatProvider`).
final networkCommentsProvider =
    FutureProvider.family<List<NetworkComment>, String>((ref, postId) async {
  final token = _token(ref);
  if (token == null || token.isEmpty) return const <NetworkComment>[];
  return ref.watch(networkRepositoryProvider).fetchComments(token, postId);
});

/// Annuaire candidats filtrable.
final networkCandidatesProvider =
    FutureProvider.family<List<NetworkCandidate>, String>((ref, query) async {
  final token = _token(ref);
  if (token == null || token.isEmpty) return const <NetworkCandidate>[];
  ref.cacheFor(const Duration(minutes: 2));
  return ref.watch(networkRepositoryProvider).searchCandidates(token, query: query);
});

/// Actions (post / like / follow) avec invalidation ciblée du feed.
class NetworkActions extends AsyncNotifier<void> {
  @override
  Future<void> build() async {}

  Future<bool> publish(String content) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty || content.trim().isEmpty) return false;
    state = const AsyncLoading();
    try {
      await ref.read(networkRepositoryProvider).createPost(token, content.trim());
      ref.invalidate(networkFeedProvider);
      state = const AsyncData(null);
      return true;
    } catch (e) {
      state = AsyncError(e, StackTrace.current);
      return false;
    }
  }

  Future<void> toggleLike(NetworkPost post) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return;
    try {
      await ref.read(networkRepositoryProvider).toggleLike(token, post);
    } finally {
      ref.invalidate(networkFeedProvider);
    }
  }

  Future<void> comment(String postId, String content) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty || content.trim().isEmpty) return;
    await ref.read(networkRepositoryProvider).addComment(token, postId, content.trim());
    ref.invalidate(networkCommentsProvider(postId));
    ref.invalidate(networkFeedProvider);
  }

  Future<void> toggleFollow(NetworkCandidate candidate, String query) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty || candidate.isSelf) return;
    await ref.read(networkRepositoryProvider).toggleFollow(token, candidate.id);
    ref.invalidate(networkCandidatesProvider(query));
  }
}

final networkActionsProvider = AsyncNotifierProvider<NetworkActions, void>(NetworkActions.new);
