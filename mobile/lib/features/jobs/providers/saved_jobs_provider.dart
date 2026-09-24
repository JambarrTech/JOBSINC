import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for_extension.dart';
import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../jobs/models/job_offer.dart';

class SavedJobEntry {
  const SavedJobEntry({
    required this.id,
    required this.savedAt,
    required this.job,
  });

  final String id;
  final DateTime savedAt;
  final JobOffer job;

  factory SavedJobEntry.fromJson(Map<String, dynamic> json) {
    final job = json['job'] as Map<String, dynamic>?;
    return SavedJobEntry(
      id: json['id']?.toString() ?? '',
      savedAt: DateTime.tryParse(json['savedAt']?.toString() ?? '') ?? DateTime.now(),
      job: job != null ? JobOffer.fromJson(job) : const JobOffer(title: '', company: '', location: '', type: '', category: '', posted: ''),
    );
  }
}

final savedJobsProvider = FutureProvider<List<SavedJobEntry>>((ref) async {
  ref.cacheFor(const Duration(minutes: 5));
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return const [];
  // Aucun catch ici : une erreur réseau doit remonter comme AsyncError
  // (le consommateur distingue « aucune offre sauvegardée » de « la
  // requête a échoué ») au lieu de renvoyer une liste vide mensongère.
  final response = await ApiClient().get('/saved-jobs', token: token);
  final data = response['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(SavedJobEntry.fromJson)
      .toList(growable: false);
});

Future<bool> toggleSavedJob(ApiClient api, String token, String jobId) async {
  final response = await api.post('/saved-jobs/$jobId/toggle', {}, token: token);
  return response['saved'] == true;
}
