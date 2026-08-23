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
}
