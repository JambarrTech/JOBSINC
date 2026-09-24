import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for_extension.dart';
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
    bool clearError = false,
  }) {
    return NotificationsState(
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class NotificationsController extends Notifier<NotificationsState> {
  final _repo = NotificationsRepository();

  @override
  NotificationsState build() {
    ref.cacheFor(const Duration(minutes: 5));
    return const NotificationsState(isLoading: true);
  }

  String? get _token => ref.read(authProvider).user?.token;

  Future<void> load() async {
    final token = _token;
    if (token == null || token.isEmpty) {
      state = const NotificationsState(isLoading: false, error: 'Non connecté.');
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final (notifications, unreadCount) = await _repo.fetchAll(token);
      state = NotificationsState(
        notifications: notifications,
        unreadCount: unreadCount,
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

  void restoreNotification(AppNotification notification, {int? index}) {
    if (state.notifications.any((n) => n.id == notification.id)) return;
    final newList = List<AppNotification>.from(state.notifications);
    if (index != null && index >= 0 && index <= newList.length) {
      newList.insert(index, notification);
    } else {
      newList.insert(0, notification);
    }
    state = state.copyWith(
      notifications: newList,
      unreadCount: notification.isRead ? state.unreadCount : (state.unreadCount + 1).clamp(0, 999),
    );
  }
}

final notificationsProvider =
    NotifierProvider<NotificationsController, NotificationsState>(
  NotificationsController.new,
);
