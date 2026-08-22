class Conversation {
  const Conversation({
    required this.id,
    required this.participantName,
    this.candidateUserId,
    this.avatarUrl,
    this.subject = '',
    this.preview = '',
    required this.lastMessageAt,
    this.unreadCount = 0,
    this.jobId,
    this.jobTitle,
    this.applicationId,
    this.companyName,
    this.applicationStatus,
  });

  final String id;
  final String participantName;
  final String? candidateUserId;
  final String? avatarUrl;
  final String subject;
  final String preview;
  final DateTime lastMessageAt;
  final int unreadCount;

  /// Contexte de la candidature liée (offre concernée par l'échange).
  final String? jobId;
  final String? jobTitle;
  final String? applicationId;
  final String? companyName;
  final String? applicationStatus;

  bool get hasContext => (jobTitle?.trim().isNotEmpty ?? false);

  String get initials {
    final parts =
        participantName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first[0].toUpperCase();
    final last = parts.length > 1 ? parts.last[0].toUpperCase() : '';
    return '$first$last';
  }

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id']?.toString() ?? '',
      participantName: _cleanName(json['participantName']?.toString()),
      candidateUserId: json['candidateUserId']?.toString(),
      avatarUrl: _cleanUrl(json['avatar']?.toString()),
      subject: json['subject']?.toString() ?? '',
      preview: json['preview']?.toString() ?? '',
      lastMessageAt:
          DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
      jobId: _optional(json['jobId']?.toString()),
      jobTitle: _optional(json['jobTitle']?.toString()),
      applicationId: _optional(json['applicationId']?.toString()),
      companyName: _optional(json['companyName']?.toString()),
      applicationStatus: _optional(json['applicationStatus']?.toString()),
    );
  }

  static String _cleanName(String? value) {
    if (value == null || value.trim().isEmpty) return 'Candidat';
    return value.trim();
  }

  static String? _cleanUrl(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    return value.trim();
  }

  static String? _optional(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    return value.trim();
  }

  Conversation copyWith({
    String? preview,
    DateTime? lastMessageAt,
    int? unreadCount,
  }) {
    return Conversation(
      id: id,
      participantName: participantName,
      candidateUserId: candidateUserId,
      avatarUrl: avatarUrl,
      subject: subject,
      preview: preview ?? this.preview,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      unreadCount: unreadCount ?? this.unreadCount,
      jobId: jobId,
      jobTitle: jobTitle,
      applicationId: applicationId,
      companyName: companyName,
      applicationStatus: applicationStatus,
    );
  }
}
