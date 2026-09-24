import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for_extension.dart';
import '../../../core/services/api_client.dart';
import '../models/job_offer.dart';

final jobsRepositoryProvider = Provider<JobsRepository>(
  (ref) => JobsRepository(),
);

final jobsProvider = FutureProvider<List<JobOffer>>(
  (ref) async {
    ref.cacheFor(const Duration(minutes: 5));
    return ref.watch(jobsRepositoryProvider).loadJobs();
  },
);

class JobsRepository {
  JobsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  Future<List<JobOffer>> loadJobs({int page = 1, int limit = 20}) async {
    final response = await _api.get('/jobs?page=$page&limit=$limit');

    // Support paginated {data: [], total, page} ou legacy {data: []}
    final raw = response['data'];
    final data = raw is List ? raw : (response['results'] as List<dynamic>? ?? const []);

    return data
        .whereType<Map<String, dynamic>>()
        .map(JobOffer.fromJson)
        .where((job) => job.title.isNotEmpty)
        .toList(growable: false);
  }
}
