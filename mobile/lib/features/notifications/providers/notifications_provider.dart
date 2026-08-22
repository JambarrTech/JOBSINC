import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/providers/auth_provider.dart';
import '../data/notifications_repository.dart';
import '../models/app_notification.dart';

class NotificationsState {
  const NotificationsState({
    this.notifications = const [],
    this.unreadCount = 0,
    this.isLoading = true,
    this.error,
  });

  final List<AppNotification> notifications;
  final int unreadCount;
  final bool isLoading;
  final String? error;

  NotificationsState copyWith({
    List<AppNotification>? notifications,
    int? unreadCount,
    bool? isLoading,
    String? error,
  }) {
    return NotificationsState(
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class NotificationsController extends Notifier<NotificationsState> {
  final _repo = NotificationsRepository();

  @override
  NotificationsState build() => const NotificationsState(isLoading: true);

  String? get _token => ref.read(authProvider).user?.token;

  Future<void> load() async {
    final token = _token;
    if (token == null || token.isEmpty) {
      state = const NotificationsState(isLoading: false, error: 'Non connecté.');
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    try {
      final results = await Future.wait([
        _repo.fetchNotifications(token),
        _repo.fetchUnreadCount(token),
      ]);
      state = NotificationsState(
        notifications: results[0] as List<AppNotification>,
        unreadCount: results[1] as int,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Erreur de chargement.');
    }
  }

  Future<void> markAsRead(String id) async {
    final token = _token;
    if (token == null || token.isEmpty) return;

    try {
      await _repo.markAsRead(token, id);
      state = state.copyWith(
        notifications: state.notifications.map((n) {
          if (n.id == id) {
            return AppNotification(
              id: n.id,
              title: n.title,
              body: n.body,
              type: n.type,
              link: n.link,
              isRead: true,
              createdAt: n.createdAt,
            );
          }
          return n;
        }).toList(),
        unreadCount: (state.unreadCount - 1).clamp(0, 999),
      );
    } catch (_) {}
  }

  Future<void> markAllAsRead() async {
    final token = _token;
    if (token == null || token.isEmpty) return;

    try {
      await _repo.markAllAsRead(token);
      state = state.copyWith(
        notifications: state.notifications.map((n) {
          if (!n.isRead) {
            return AppNotification(
              id: n.id,
              title: n.title,
              body: n.body,
              type: n.type,
              link: n.link,
              isRead: true,
              createdAt: n.createdAt,
            );
          }
          return n;
        }).toList(),
        unreadCount: 0,
      );
    } catch (_) {}
  }

  Future<void> deleteNotification(String id) async {
    final token = _token;
    if (token == null || token.isEmpty) return;

    try {
      await _repo.deleteNotification(token, id);
      final removed = state.notifications.firstWhere((n) => n.id == id);
      state = state.copyWith(
        notifications: state.notifications.where((n) => n.id != id).toList(),
        unreadCount: removed.isRead ? state.unreadCount : (state.unreadCount - 1).clamp(0, 999),
      );
    } catch (_) {}
  }
}

final notificationsProvider =
    NotifierProvider<NotificationsController, NotificationsState>(
  NotificationsController.new,
);
