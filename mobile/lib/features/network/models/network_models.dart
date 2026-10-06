class NetworkAuthor {
  const NetworkAuthor({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.city,
    this.skills,
  });

  final String id;
  final String name;
  final String? avatarUrl;
  final String? city;
  final String? skills;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first[0].toUpperCase();
    final last = parts.length > 1 ? parts.last[0].toUpperCase() : '';
    return '$first$last';
  }

  factory NetworkAuthor.fromJson(Map<String, dynamic> json) {
    String? clean(String? v) {
      final t = v?.trim();
      return (t == null || t.isEmpty) ? null : t;
    }

    return NetworkAuthor(
      id: json['id']?.toString() ?? '',
      name: (json['name']?.toString().trim().isNotEmpty ?? false) ? json['name'].toString().trim() : 'Candidat',
      avatarUrl: clean(json['avatarUrl']?.toString()),
      city: clean(json['city']?.toString()),
      skills: clean(json['skills']?.toString()),
    );
  }
}

class NetworkPost {
  const NetworkPost({
    required this.id,
    required this.content,
    this.imageUrl,
    required this.createdAt,
    this.updatedAt,
    required this.author,
    this.likesCount = 0,
    this.commentsCount = 0,
    this.likedByMe = false,
  });

  final String id;
  final String content;
  final String? imageUrl;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final NetworkAuthor author;
  final int likesCount;
  final int commentsCount;
  final bool likedByMe;

  NetworkPost copyWith({int? likesCount, int? commentsCount, bool? likedByMe}) {
    return NetworkPost(
      id: id,
      content: content,
      imageUrl: imageUrl,
      createdAt: createdAt,
      updatedAt: updatedAt,
      author: author,
      likesCount: likesCount ?? this.likesCount,
      commentsCount: commentsCount ?? this.commentsCount,
      likedByMe: likedByMe ?? this.likedByMe,
    );
  }

  factory NetworkPost.fromJson(Map<String, dynamic> json) {
    return NetworkPost(
      id: json['id']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      imageUrl: (json['imageUrl']?.toString().isNotEmpty ?? false) ? json['imageUrl'].toString() : null,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? ''),
      author: json['author'] is Map<String, dynamic>
          ? NetworkAuthor.fromJson(json['author'] as Map<String, dynamic>)
          : const NetworkAuthor(id: '', name: 'Candidat'),
      likesCount: (json['likesCount'] as num?)?.toInt() ?? 0,
      commentsCount: (json['commentsCount'] as num?)?.toInt() ?? 0,
      likedByMe: json['likedByMe'] == true,
    );
  }

  @override
  bool operator ==(Object other) => identical(this, other) || (other is NetworkPost && other.id == id);

  @override
  int get hashCode => id.hashCode;
}

class NetworkComment {
  const NetworkComment({
    required this.id,
    required this.postId,
    required this.content,
    required this.createdAt,
    required this.author,
  });

  final String id;
  final String postId;
  final String content;
  final DateTime createdAt;
  final NetworkAuthor author;

  factory NetworkComment.fromJson(Map<String, dynamic> json) {
    return NetworkComment(
      id: json['id']?.toString() ?? '',
      postId: json['postId']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      author: json['author'] is Map<String, dynamic>
          ? NetworkAuthor.fromJson(json['author'] as Map<String, dynamic>)
          : const NetworkAuthor(id: '', name: 'Candidat'),
    );
  }
}

class NetworkCandidate {
  const NetworkCandidate({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.city,
    this.country,
    this.skills,
    this.isSelf = false,
    this.isFollowing = false,
  });

  final String id;
  final String name;
  final String? avatarUrl;
  final String? city;
  final String? country;
  final String? skills;
  final bool isSelf;
  final bool isFollowing;

  NetworkCandidate copyWith({bool? isFollowing}) {
    return NetworkCandidate(
      id: id,
      name: name,
      avatarUrl: avatarUrl,
      city: city,
      country: country,
      skills: skills,
      isSelf: isSelf,
      isFollowing: isFollowing ?? this.isFollowing,
    );
  }

  factory NetworkCandidate.fromJson(Map<String, dynamic> json) {
    String? clean(String? v) {
      final t = v?.trim();
      return (t == null || t.isEmpty) ? null : t;
    }

    return NetworkCandidate(
      id: json['id']?.toString() ?? '',
      name: (json['name']?.toString().trim().isNotEmpty ?? false) ? json['name'].toString().trim() : 'Candidat',
      avatarUrl: clean(json['avatarUrl']?.toString()),
      city: clean(json['city']?.toString()),
      country: clean(json['country']?.toString()),
      skills: clean(json['skills']?.toString()),
      isSelf: json['isSelf'] == true,
      isFollowing: json['isFollowing'] == true,
    );
  }
}
