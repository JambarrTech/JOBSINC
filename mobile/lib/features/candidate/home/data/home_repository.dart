import '../../../../core/services/api_client.dart';
import '../../../jobs/models/job_offer.dart';

class HomeDashboardData {
  const HomeDashboardData({
    required this.jobs,
    required this.companies,
    required this.applications,
    this.savedJobs = const [],
  });

  final List<JobOffer> jobs;
  final List<HomeCompany> companies;
  final List<HomeApplication> applications;
  final List<JobOffer> savedJobs;
}

class HomeCompany {
  const HomeCompany({required this.id, required this.name, this.location, this.sector, this.logoUrl});

  final String id;
  final String name;
  final String? location;
  final String? sector;
  final String? logoUrl;

  factory HomeCompany.fromJson(Map<String, dynamic> json) {
    final images = (json['images'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final primaryImage = images.cast<Map<String, dynamic>?>().firstWhere(
          (image) => image?['isPrimary'] == true,
          orElse: () => images.isEmpty ? null : images.first,
        );
    return HomeCompany(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      location: json['location']?.toString(),
      sector: json['sector']?.toString(),
      logoUrl: primaryImage?['url']?.toString(),
    );
  }
}

class InterviewInfo {
  const InterviewInfo({this.mode, this.scheduledAt, this.duration, this.streamingUrl, this.location, this.notes});

  final String? mode;
  final DateTime? scheduledAt;
  final int? duration;
  final String? streamingUrl;
  final String? location;
  final String? notes;

  bool get isOnline => mode == 'ONLINE';

  factory InterviewInfo.fromJson(Map<String, dynamic> json) {
    return InterviewInfo(
      mode: json['mode']?.toString(),
      scheduledAt: DateTime.tryParse(json['scheduledAt']?.toString() ?? ''),
      duration: json['duration'] as int?,
      streamingUrl: json['streamingUrl']?.toString(),
      location: json['location']?.toString(),
      notes: json['notes']?.toString(),
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
    final results = await Future.wait([
      _api.get('/jobs'),
      _api.get('/companies'),
      _api.get('/applications/me', token: token),
    ]);
    final jobs = (results[0]['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(JobOffer.fromJson)
        .toList(growable: false);
    final companies = (results[1]['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HomeCompany.fromJson)
        .where((company) => company.id.isNotEmpty && company.name.isNotEmpty)
        .toList(growable: false);
    final applications = (results[2]['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HomeApplication.fromJson)
        .toList(growable: false);
    return HomeDashboardData(
      jobs: jobs, 
      companies: companies, 
      applications: applications,
      savedJobs: jobs.isNotEmpty && jobs.length > 1 ? [jobs[1]] : [],
    );
  }
}
