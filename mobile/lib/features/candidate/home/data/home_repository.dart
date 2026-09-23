import 'package:flutter/foundation.dart';

import '../../../../core/services/api_client.dart';
import '../../../jobs/models/job_offer.dart';

class HomeDashboardData {
  const HomeDashboardData({
    required this.jobs,
    required this.companies,
  });

  final List<JobOffer> jobs;
  final List<HomeCompany> companies;
}

class HomeCompany {
  const HomeCompany({
    required this.id,
    required this.name,
    this.location,
    this.sector,
    this.logoUrl,
    this.openOffersCount = 0,
  });

  final String id;
  final String name;
  final String? location;
  final String? sector;
  final String? logoUrl;

  /// Nombre réel d'offres ouvertes (calculé côté client depuis /jobs).
  final int openOffersCount;

  HomeCompany copyWith({int? openOffersCount}) {
    return HomeCompany(
      id: id,
      name: name,
      location: location,
      sector: sector,
      logoUrl: logoUrl,
      openOffersCount: openOffersCount ?? this.openOffersCount,
    );
  }

  factory HomeCompany.fromJson(Map<String, dynamic> json) {
    final images = (json['images'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final primaryImage = images.cast<Map<String, dynamic>?>().firstWhere(
          (image) => image?['isPrimary'] == true,
          orElse: () => images.isEmpty ? null : images.first,
        );
    final rawLogo = json['logo']?.toString();
    return HomeCompany(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      location: json['location']?.toString(),
      sector: json['sector']?.toString(),
      logoUrl: (rawLogo != null && rawLogo.isNotEmpty)
          ? rawLogo
          : primaryImage?['url']?.toString(),
    );
  }
}

class InterviewInfo {
  const InterviewInfo({
    this.mode,
    this.scheduledAt,
    this.duration,
    this.streamingUrl,
    this.location,
    this.notes,
    this.status = 'PLANIFIE',
    this.startedAt,
    this.finishedAt,
  });

  final String? mode;
  final DateTime? scheduledAt;
  final int? duration;
  final String? streamingUrl;
  final String? location;
  final String? notes;

  /// Statut backend réel : PLANIFIE / EN_COURS / TERMINE / ANNULE.
  final String status;
  final DateTime? startedAt;
  final DateTime? finishedAt;

  bool get isOnline => mode == 'ONLINE';
  bool get isLive => status == 'EN_COURS' && startedAt != null && finishedAt == null;
  bool get isFinished => status == 'TERMINE';
  bool get isCancelled => status == 'ANNULE';

  /// Lien utilisable pour rejoindre (meetUrl côté API, fallback streamingUrl).
  String? get joinUrl {
    final url = streamingUrl ?? '';
    return url.isEmpty ? null : url;
  }

  factory InterviewInfo.fromJson(Map<String, dynamic> json) {
    final rawDuration = json['duration'];
    return InterviewInfo(
      mode: json['mode']?.toString(),
      scheduledAt: DateTime.tryParse(json['scheduledAt']?.toString() ?? ''),
      duration: rawDuration is int ? rawDuration : int.tryParse(rawDuration?.toString() ?? ''),
      streamingUrl: (json['meetUrl'] ?? json['streamingUrl'])?.toString(),
      location: json['location']?.toString(),
      notes: json['notes']?.toString(),
      status: json['status']?.toString() ?? 'PLANIFIE',
      startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? ''),
      finishedAt: DateTime.tryParse(json['finishedAt']?.toString() ?? ''),
    );
  }
}

class HomeApplication {
  const HomeApplication({required this.id, required this.status, required this.statusLabel, required this.createdAt, this.jobId, this.jobTitle, this.jobLocation, this.companyName, this.coverLetter, this.interview});

  final String id;
  final String status;
  final String statusLabel;
  final DateTime? createdAt;
  final String? jobId;
  final String? jobTitle;
  final String? jobLocation;
  final String? companyName;
  final String? coverLetter;
  final InterviewInfo? interview;

  factory HomeApplication.fromJson(Map<String, dynamic> json) {
    final job = json['job'] as Map<String, dynamic>?;
    final company = job?['company'] as Map<String, dynamic>?;
    final interviewData = json['interview'] as Map<String, dynamic>?;
    return HomeApplication(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      statusLabel: json['statusLabel']?.toString() ?? json['status']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      jobId: job?['id']?.toString(),
      jobTitle: job?['title']?.toString(),
      jobLocation: job?['location']?.toString(),
      companyName: company?['name']?.toString(),
      coverLetter: json['coverLetter']?.toString(),
      interview: interviewData != null ? InterviewInfo.fromJson(interviewData) : null,
    );
  }
}

class HomeRepository {
  HomeRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;

  Future<HomeDashboardData> load(String token) async {
    // Les deux sections sont chargées en parallèle mais INDÉPENDAMMENT :
    // si /jobs (ou /companies) échoue, l'autre section s'affiche quand
    // même au lieu de faire planter tout l'accueil (ancien fail-fast).
    final results = await Future.wait<Map<String, dynamic>?>([
      _safeGet('/jobs', token),
      _safeGet('/companies', token),
    ]);

    final jobsResponse = results[0];
    final companiesResponse = results[1];

    final jobs = (jobsResponse?['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(JobOffer.fromJson)
        .toList(growable: false);
    final companies = (companiesResponse?['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HomeCompany.fromJson)
        .where((company) => company.id.isNotEmpty && company.name.isNotEmpty)
        .toList(growable: false);

    // Compte réel des offres ouvertes par entreprise, dérivé de /jobs
    // (chaque offre expose company.id côté backend).
    final offersCount = <String, int>{};
    for (final job in jobs) {
      final companyId = job.companyId;
      if (companyId != null && companyId.isNotEmpty) {
        offersCount[companyId] = (offersCount[companyId] ?? 0) + 1;
      }
    }

    return HomeDashboardData(
      jobs: jobs,
      companies: companies
          .map((company) =>
              company.copyWith(openOffersCount: offersCount[company.id] ?? 0))
          .toList(growable: false),
    );
  }

  /// Get « sûr » : l'échec d'une section est loggé (diagnostic en dev) et
  /// traduit en `null` pour que l'appelant affiche une section vide plutôt
  /// que de bloquer le reste de la page.
  Future<Map<String, dynamic>?> _safeGet(
    String path,
    String token,
  ) async {
    try {
      return await _api.get(path, token: token);
    } catch (e) {
      debugPrint('[HomeRepository] Échec de $path : $e');
      return null;
    }
  }
}
