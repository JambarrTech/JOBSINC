import '../../../core/services/api_client.dart';
import '../models/app_notification.dart';

class NotificationsRepository {
  NotificationsRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;

  Future<List<AppNotification>> fetchNotifications(String token) async {
    final response = await _api.get('/notifications', token: token);
    final list = (response['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList(growable: false);
    return list;
  }

  Future<int> fetchUnreadCount(String token) async {
    final response = await _api.get('/notifications', token: token);
    return (response['unreadCount'] as num?)?.toInt() ?? 0;
  }

  Future<void> markAsRead(String token, String id) async {
    await _api.patch('/notifications/$id/read', {}, token: token);
  }

  Future<void> markAllAsRead(String token) async {
    await _api.patch('/notifications/read-all', {}, token: token);
  }

  Future<void> deleteNotification(String token, String id) async {
    await _api.delete('/notifications/$id', token: token);
  }
}
