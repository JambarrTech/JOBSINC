class JobOffer {
  const JobOffer({
    this.id,
    required this.title,
    required this.company,
    this.companyId,
    this.companyLogo,
    this.companySector,
    this.companyLocation,
    this.companyDescription,
    required this.location,
    required this.type,
    required this.category,
    required this.posted,
    this.salary,
    this.description,
    this.matchScore,
  });

  final String? id;
  final String title;
  final String company;
  final String? companyId;
  final String? companyLogo;
  final String? companySector;
  final String? companyLocation;
  final String? companyDescription;
  final String location;
  final String type;
  final String category;
  final String posted;
  final String? salary;
  final String? description;
  final num? matchScore;

  factory JobOffer.fromJson(Map<String, dynamic> json) {
    final company = json['company'] as Map<String, dynamic>?;
    final images = (company?['images'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final primaryImage = images.cast<Map<String, dynamic>?>().firstWhere(
          (image) => image?['isPrimary'] == true,
          orElse: () => images.isEmpty ? null : images.first,
        );
    final rawLogo = company?['logo']?.toString();
    final companyLogo = (rawLogo != null && rawLogo.isNotEmpty)
        ? rawLogo
        : primaryImage?['url']?.toString();
    final salaryMin = json['salaryMin'];
    final salaryMax = json['salaryMax'];
    final currency = json['currency']?.toString();
    final salary = salaryMin == null && salaryMax == null
        ? null
        : [salaryMin, salaryMax]
                .whereType<Object>()
                .map((value) => value.toString())
                .join(' – ') +
            (currency == null ? '' : ' $currency');
    return JobOffer(
      id: json['id']?.toString(),
      title: json['title']?.toString() ?? '',
      company: company?['name']?.toString() ?? '',
      companyId: company?['id']?.toString(),
      companyLogo: companyLogo,
      companySector: company?['sector']?.toString(),
      companyLocation: company?['location']?.toString(),
      companyDescription: company?['description']?.toString(),
      location: json['location']?.toString() ?? '',
      type: json['contractType']?.toString() ?? '',
      category: json['department']?.toString() ?? '',
      posted: json['publishedAt']?.toString() ?? '',
      salary: salary,
      description: json['description']?.toString(),
      matchScore: json['matchScore'] as num?,
    );
  }

  /// Égalité et hachage par IDENTITÉ D'OFFRE (`id`).
  ///
  /// `JobOffer` n'avait NI `operator ==` NI `hashCode` : il héritait donc de
  /// l'identité d'instance, alors qu'il est reconstruit intégralement depuis le
  /// JSON à CHAQUE appel réseau (`fromJson`, dans `jobs_provider`,
  /// `saved_jobs_provider`, `home_repository`, `similar_jobs_provider`).
  /// Conséquences SilentIEUSES :
  ///
  ///   - la moindre déduplication (`Set<JobOffer>`, `contains`, `indexOf`,
  ///     `distinct`) échoue : la même offre vue deux fois n'est jamais reconnue
  ///     comme la même, donc n'est jamais supprimée ;
  ///   - toute clé de `Provider.family` ou de `Map` paramétrée par l'offre
  ///     devient une nouvelle clé à chaque rafraîchissement — exactement le bug
  ///     déjà corrigé sur `Conversation` (cf. la note de
  ///     `lib/features/messages/models/conversation.dart`) et sur
  ///     `AuthState`/`AuthUser` ;
  ///   - `select`/`where` de Riverpod, qui comparent par `==`, ne corrèlent
  ///     jamais une notification, donc l'UI ne se rafraîchit pas.
  ///
  /// L'identité est le `id` SEUL, comme pour `Conversation` : `matchScore`,
  /// `salary` ou `description` changent au fil des rescans du backend, et les
  /// inclure recréerait l'identité en boucle.
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! JobOffer) return false;
    // Une offre SANS `id` (jamais persistée — c'est le cas de tous les
    // `JobOffer(title: '', ...)` de repli construits en dur) n'a aucune clé à
    // laquelle on puisse la rattacher : l'égalité par instance est alors la
    // seule réponse honnête, plutôt que de faire fusionner deux offres
    // inconnues.
    final a = id;
    if (a == null || other.id == null) return false;
    return a == other.id;
  }

  @override
  int get hashCode => id?.hashCode ?? identityHashCode(this);

  @override
  String toString() => 'JobOffer($id, $title)';
}
