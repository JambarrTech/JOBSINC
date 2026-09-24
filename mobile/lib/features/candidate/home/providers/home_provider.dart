import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/cache_for_extension.dart';
import '../data/home_repository.dart';

final homeRepositoryProvider = Provider<HomeRepository>((ref) => HomeRepository());

final homeDashboardProvider = FutureProvider.family<HomeDashboardData, String>((ref, token) {
  ref.cacheFor(const Duration(minutes: 5));
  return ref.watch(homeRepositoryProvider).load(token);
});
