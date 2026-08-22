import '../../../core/services/api_client.dart';

class RecruiterDashboardData {
  const RecruiterDashboardData({
    required this.company,
    required this.stats,
    required this.jobs,
    required this.applications,
    required this.actions,
  });

  final RecruiterCompany company;
  final RecruiterStats stats;
  final List<RecruiterJob> jobs;
  final List<RecruiterApplication> applications;
  final List<RecruiterAction> actions;

  factory RecruiterDashboardData.fromJson(Map<String, dynamic> json) {
    return RecruiterDashboardData(
      company: RecruiterCompany.fromJson(json['company'] as Map<String, dynamic>? ?? {}),
      stats: RecruiterStats.fromJson(json['stats'] as Map<String, dynamic>? ?? {}),
      jobs: (json['jobs'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RecruiterJob.fromJson)
          .toList(growable: false),
      applications: (json['applications'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RecruiterApplication.fromJson)
          .toList(growable: false),
      actions: (json['actions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RecruiterAction.fromJson)
          .toList(growable: false),
    );
  }
}

class RecruiterCompany {
  const RecruiterCompany({required this.id, required this.name, this.description, this.sector, this.city, this.country, this.website});

  final String id;
  final String name;
  final String? description;
  final String? sector;
  final String? city;
  final String? country;
  final String? website;

  factory RecruiterCompany.fromJson(Map<String, dynamic> json) {
    return RecruiterCompany(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      sector: json['sector']?.toString(),
      city: json['city']?.toString(),
      country: json['country']?.toString(),
      website: json['website']?.toString(),
    );
  }
}

class RecruiterStats {
  const RecruiterStats({this.activeJobs = 0, this.applications = 0, this.interviews = 0, this.hired = 0});

  final int activeJobs;
  final int applications;
  final int interviews;
  final int hired;

  factory RecruiterStats.fromJson(Map<String, dynamic> json) {
    return RecruiterStats(
      activeJobs: (json['activeJobs'] as num?)?.toInt() ?? 0,
      applications: (json['applications'] as num?)?.toInt() ?? 0,
      interviews: (json['interviews'] as num?)?.toInt() ?? 0,
      hired: (json['hired'] as num?)?.toInt() ?? 0,
    );
  }
}

class RecruiterJob {
  const RecruiterJob({required this.id, required this.title, this.location, this.contractType, this.status, this.applicationsCount = 0, this.createdAt});

  final String id;
  final String title;
  final String? location;
  final String? contractType;
  final String? status;
  final int applicationsCount;
  final DateTime? createdAt;

  factory RecruiterJob.fromJson(Map<String, dynamic> json) {
    return RecruiterJob(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      location: json['location']?.toString(),
      contractType: json['contractType']?.toString(),
      status: json['status']?.toString(),
      applicationsCount: (json['applicationsCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
    );
  }
}

class RecruiterApplication {
  const RecruiterApplication({required this.id, required this.candidateName, this.jobTitle, this.status, this.date, this.cvUrl, this.coverLetter, this.interview});

  final String id;
  final String candidateName;
  final String? jobTitle;
  final String? status;
  final DateTime? date;
  final String? cvUrl;
  final String? coverLetter;
  final Map<String, dynamic>? interview;

  factory RecruiterApplication.fromJson(Map<String, dynamic> json) {
    return RecruiterApplication(
      id: json['id']?.toString() ?? '',
      candidateName: json['candidateName']?.toString() ?? 'Candidat',
      jobTitle: json['jobTitle']?.toString(),
      status: json['status']?.toString(),
      date: DateTime.tryParse(json['date']?.toString() ?? ''),
      cvUrl: json['cvUrl']?.toString(),
      coverLetter: json['coverLetter']?.toString(),
      interview: json['interview'] as Map<String, dynamic>?,
    );
  }
}

class RecruiterAction {
  const RecruiterAction({required this.id, required this.label});

  final String id;
  final String label;

  factory RecruiterAction.fromJson(Map<String, dynamic> json) {
    return RecruiterAction(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
    );
  }
}

class RecruiterRepository {
  RecruiterRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;

  Future<RecruiterDashboardData> loadDashboard(String token) async {
    final response = await _api.get('/company/dashboard', token: token);
    return RecruiterDashboardData.fromJson(response);
  }

  Future<List<RecruiterJob>> loadJobs(String token) async {
    final response = await _api.getRaw('/company/jobs', token: token);
    final list = response is List ? response : <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(RecruiterJob.fromJson).toList(growable: false);
  }

  Future<List<RecruiterApplication>> loadApplications(String token) async {
    final response = await _api.getRaw('/company/applications', token: token);
    final list = response is List ? response : <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(RecruiterApplication.fromJson).toList(growable: false);
  }

  Future<void> updateApplicationStatus(String token, String applicationId, String status) async {
    await _api.patch('/applications/$applicationId/status', {'status': status}, token: token);
  }

  Future<void> createJob(String token, Map<String, dynamic> data) async {
    await _api.post('/company/jobs', data, token: token);
  }
}
