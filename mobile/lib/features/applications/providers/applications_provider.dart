import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for_extension.dart';
import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../candidate/home/data/home_repository.dart';

final applicationsProvider = FutureProvider<List<HomeApplication>>(
  (ref) async {
    ref.cacheFor(const Duration(minutes: 5));
    final token = ref.watch(authProvider).user?.token;
    if (token == null || token.isEmpty) return [];
    final api = ApiClient();
    final response = await api.get('/applications/me', token: token);
    final data = response['data'] as List<dynamic>? ?? const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(HomeApplication.fromJson)
        .toList(growable: false);
  },
);

class ApplyState {
  const ApplyState({this.isLoading = false, this.error, this.success = false});
  final bool isLoading;
  final String? error;
  final bool success;

  ApplyState loading() => const ApplyState(isLoading: true);
  ApplyState done() => const ApplyState(success: true);
  ApplyState failed(String e) => ApplyState(error: e);
}

class ApplyController extends AutoDisposeNotifier<ApplyState> {
  @override
  ApplyState build() => const ApplyState();

  Future<bool> apply(String jobId, {String? cvUrl, String? coverLetter}) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) {
      state = const ApplyState(error: 'Non connecté.');
      return false;
    }

    if (jobId.isEmpty) {
      state = const ApplyState(error: 'Identifiant de l\'offre manquant.');
      return false;
    }

    state = state.loading();

    try {
      final api = ApiClient();
      await api.post(
        '/applications/jobs/$jobId',
        {
          if (cvUrl != null) 'cvUrl': cvUrl,
          if (coverLetter != null) 'coverLetter': coverLetter,
        },
        token: token,
      );
      state = state.done();
      ref.invalidate(applicationsProvider);
      return true;
    } on ApiException catch (e) {
      state = ApplyState(error: e.message);
      return false;
    } on TimeoutException catch (_) {
      state = const ApplyState(error: 'Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.');
      return false;
    } catch (e) {
      state = ApplyState(error: 'Erreur : ${e.toString()}');
      return false;
    }
  }

  void reset() => state = const ApplyState();
}

final applyProvider =
    NotifierProvider.autoDispose<ApplyController, ApplyState>(
  ApplyController.new,
);

/// Entretien actuellement EN_COURS côté backend (carte d'accueil candidat).
class ActiveInterview {
  const ActiveInterview({
    required this.applicationId,
    required this.jobTitle,
    required this.companyName,
    this.mode,
    this.scheduledAt,
    this.startedAt,
    this.meetUrl,
  });

  final String applicationId;
  final String jobTitle;
  final String companyName;
  final String? mode;
  final DateTime? scheduledAt;
  final DateTime? startedAt;
  final String? meetUrl;

  bool get isOnline => mode != 'PRESENTIEL';

  factory ActiveInterview.fromJson(Map<String, dynamic> json) {
    return ActiveInterview(
      applicationId: json['applicationId']?.toString() ?? '',
      jobTitle: json['jobTitle']?.toString() ?? 'Entretien',
      companyName: json['companyName']?.toString() ?? '',
      mode: json['mode']?.toString(),
      scheduledAt: DateTime.tryParse(json['scheduledAt']?.toString() ?? ''),
      startedAt: DateTime.tryParse(json['startedAt']?.toString() ?? ''),
      meetUrl: (json['meetUrl'] ?? json['streamingUrl'])?.toString(),
    );
  }
}

final activeInterviewProvider =
    FutureProvider<ActiveInterview?>((ref) async {
  ref.cacheFor(const Duration(minutes: 5));
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return null;
  try {
    final response =
        await ApiClient().get('/interviews/candidate', token: token);
    final list = response['data'] as List<dynamic>? ?? const [];
    final live = list.whereType<Map<String, dynamic>>().firstWhere(
          (item) => item['status']?.toString() == 'EN_COURS',
          orElse: () => const {},
        );
    if (live.isEmpty) return null;
    return ActiveInterview.fromJson(live);
  } catch (_) {
    return null;
  }
});

class InterviewActionState {
  const InterviewActionState({this.isLoading = false, this.error});
  final bool isLoading;
  final String? error;

  InterviewActionState loading() => const InterviewActionState(isLoading: true);
  InterviewActionState failed(String e) => InterviewActionState(error: e);
}

/// Actions candidat sur l'entretien en cours (Terminer).
class InterviewActionController
    extends AutoDisposeNotifier<InterviewActionState> {
  @override
  InterviewActionState build() => const InterviewActionState();

  Future<bool> finish(String applicationId) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) {
      state = const InterviewActionState(error: 'Non connecté.');
      return false;
    }
    state = state.loading();
    try {
      await ApiClient().post(
        '/interviews/applications/$applicationId/finish',
        const {},
        token: token,
      );
      ref.invalidate(activeInterviewProvider);
      ref.invalidate(applicationsProvider);
      state = const InterviewActionState();
      return true;
    } on ApiException catch (e) {
      state = state.failed(e.message);
      return false;
    } on TimeoutException catch (_) {
      state = state.failed('Le serveur met trop de temps à répondre.');
      return false;
    } catch (e) {
      state = state.failed('Erreur : ${e.toString()}');
      return false;
    }
  }
}

final interviewActionProvider =
    NotifierProvider.autoDispose<InterviewActionController, InterviewActionState>(
  InterviewActionController.new,
);
