enum NotificationType { application, interview, message, general }

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    this.type = NotificationType.general,
    this.link,
    this.isRead = false,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final NotificationType type;
  final String? link;
  final bool isRead;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      type: _parseType(json['type']?.toString()),
      link: json['link']?.toString(),
      isRead: json['isRead'] == true,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  static NotificationType _parseType(String? value) {
    switch (value?.toUpperCase()) {
      case 'APPLICATION':
        return NotificationType.application;
      case 'INTERVIEW':
        return NotificationType.interview;
      case 'MESSAGE':
        return NotificationType.message;
      default:
        return NotificationType.general;
    }
  }
}
