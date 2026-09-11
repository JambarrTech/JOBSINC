import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../models/job_offer.dart';

final similarJobsProvider = FutureProvider.autoDispose.family<List<JobOffer>, String>((ref, jobId) async {
  if (jobId.isEmpty) return [];
  try {
    final response = await ApiClient().get('/jobs/$jobId/similar');
    final data = response['data'] as List<dynamic>? ?? const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(JobOffer.fromJson)
        .where((job) => job.title.isNotEmpty)
        .toList(growable: false);
  } catch (_) {
    return [];
  }
});
