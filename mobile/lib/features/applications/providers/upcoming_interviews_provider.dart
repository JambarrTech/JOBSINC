import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../candidate/home/data/home_repository.dart';

final upcomingInterviewsProvider = FutureProvider.autoDispose<List<HomeApplication>>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return [];
  try {
    final response = await ApiClient().get('/interviews/candidate', token: token);
    final data = response['data'] as List<dynamic>? ?? const [];
    return data
        .whereType<Map<String, dynamic>>()
        .where((item) => item['status']?.toString() == 'PLANIFIE')
        .map(HomeApplication.fromJson)
        .toList(growable: false);
  } catch (_) {
    return [];
  }
});
