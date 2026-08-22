import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/providers/auth_provider.dart';
import 'recruiter_repository.dart';

final recruiterDashboardProvider = FutureProvider.autoDispose<RecruiterDashboardData>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return const RecruiterDashboardData(company: RecruiterCompany(id: '', name: ''), stats: RecruiterStats(), jobs: [], applications: [], actions: []);
  final repo = RecruiterRepository();
  return repo.loadDashboard(token);
});

final recruiterApplicationsProvider = FutureProvider.autoDispose<List<RecruiterApplication>>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return [];
  final repo = RecruiterRepository();
  return repo.loadApplications(token);
});

// ============================================================
// APPLICATIONS CONTROLLER
// ============================================================

class RecruiterApplicationsController extends AutoDisposeAsyncNotifier<List<RecruiterApplication>> {
  @override
  Future<List<RecruiterApplication>> build() async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return [];
    return RecruiterRepository().loadApplications(token);
  }

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final token = ref.read(authProvider).user?.token;
      if (token == null || token.isEmpty) {
        state = const AsyncValue.data([]);
        return;
      }
      state = AsyncValue.data(await RecruiterRepository().loadApplications(token));
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  Future<String?> updateStatus(String applicationId, String status) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return 'Non connecté.';
    try {
      await RecruiterRepository().updateApplicationStatus(token, applicationId, status);
      await load();
      return null;
    } catch (e) {
      return 'Erreur : $e';
    }
  }
}

final recruiterApplicationsControllerProvider =
    AsyncNotifierProvider.autoDispose<RecruiterApplicationsController, List<RecruiterApplication>>(
  RecruiterApplicationsController.new,
);

// ============================================================
// JOBS CONTROLLER
// ============================================================

final recruiterJobsProvider = FutureProvider.autoDispose<List<RecruiterJob>>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return [];
  final repo = RecruiterRepository();
  return repo.loadJobs(token);
});

class RecruiterJobsController extends AutoDisposeAsyncNotifier<List<RecruiterJob>> {
  @override
  Future<List<RecruiterJob>> build() async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return [];
    return RecruiterRepository().loadJobs(token);
  }

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final token = ref.read(authProvider).user?.token;
      if (token == null || token.isEmpty) {
        state = const AsyncValue.data([]);
        return;
      }
      state = AsyncValue.data(await RecruiterRepository().loadJobs(token));
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  Future<String?> createJob(Map<String, dynamic> data) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return 'Non connecté.';
    try {
      await RecruiterRepository().createJob(token, data);
      await load();
      return null;
    } catch (e) {
      return 'Erreur : $e';
    }
  }
}

final recruiterJobsControllerProvider =
    AsyncNotifierProvider.autoDispose<RecruiterJobsController, List<RecruiterJob>>(
  RecruiterJobsController.new,
);
