import '../../../core/services/api_client.dart';
import '../models/network_models.dart';

/// Couche réseau du social candidats. Réplique le pattern
/// `MessagesRepository` : `ApiClient` partagé, token passé par appel,
/// jamais stocké. Le refresh 401 est géré par `ApiClient`.
class NetworkRepository {
  NetworkRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;

  Future<List<NetworkPost>> fetchFeed(String token, {int page = 1, int limit = 20}) async {
    final response = await _api.get('/network/feed?page=$page&limit=$limit', token: token);
    final list = response['data'] as List<dynamic>? ?? const <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(NetworkPost.fromJson).toList(growable: false);
  }

  Future<NetworkPost> createPost(String token, String content) async {
    final response = await _api.post('/network/posts', {'content': content}, token: token);
    return NetworkPost.fromJson(response);
  }

  Future<void> deletePost(String token, String postId) async {
    await _api.delete('/network/posts/$postId', token: token);
  }

  /// Retourne (liked, likesCount) — même contrat que le toggle backend.
  Future<(bool, int)> toggleLike(String token, NetworkPost post) async {
    final response = await _api.post('/network/posts/${post.id}/like-toggle', {}, token: token);
    final liked = response['liked'] == true;
    final count = (response['likesCount'] as num?)?.toInt() ?? (post.likesCount + (liked ? 1 : -1));
    return (liked, count < 0 ? 0 : count);
  }

  Future<List<NetworkComment>> fetchComments(String token, String postId) async {
    final response = await _api.get('/network/posts/$postId/comments?limit=50', token: token);
    final list = response['data'] as List<dynamic>? ?? const <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(NetworkComment.fromJson).toList(growable: false);
  }

  Future<NetworkComment> addComment(String token, String postId, String content) async {
    final response = await _api.post('/network/posts/$postId/comments', {'content': content}, token: token);
    return NetworkComment.fromJson(response);
  }

  Future<List<NetworkCandidate>> searchCandidates(String token, {String query = ''}) async {
    final q = Uri.encodeQueryComponent(query.trim());
    final response = await _api.get('/network/candidates?q=$q&limit=20', token: token);
    final list = response['data'] as List<dynamic>? ?? const <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(NetworkCandidate.fromJson).toList(growable: false);
  }

  Future<bool> toggleFollow(String token, String userId) async {
    final response = await _api.post('/network/follow/$userId/toggle', {}, token: token);
    return response['following'] == true;
  }
}
