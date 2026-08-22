class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.content,
    required this.isMine,
    this.isRead = false,
    this.isSending = false,
    required this.createdAt,
  });

  final String id;
  final String content;
  final bool isMine;
  final bool isRead;
  final bool isSending;
  final DateTime createdAt;

  ChatMessage copyWith({String? id, bool? isSending}) {
    return ChatMessage(
      id: id ?? this.id,
      content: content,
      isMine: isMine,
      isRead: isRead,
      isSending: isSending ?? this.isSending,
      createdAt: createdAt,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      isMine: json['isMine'] == true,
      isRead: json['isRead'] == true,
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }
}
