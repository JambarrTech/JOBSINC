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
  const ApplyState({this.isLoading = false, this.error, this.application});

  final bool isLoading;
  final String? error;

  /// Candidature créée par la dernière soumission réussie (null sinon).
  final HomeApplication? application;

  ApplyState loading() => const ApplyState(isLoading: true);
}

/// Résultat d'une soumission de candidature.
///
/// Il porte à la fois la candidature créée et le message d'erreur : l'écran
/// de candidature relisait `applyProvider` APRÈS l'`await`, ce qui était
/// peu fiable — le notifier étant `autoDispose`, il pouvait être détruit
/// pendant l'appel et renégocier un `ApplyState` vierge, d'où un message
/// d'erreur perdu remplacé par « Une erreur est survenue. ».
class ApplyResult {
  const ApplyResult.success(HomeApplication this.application) : error = null;
  const ApplyResult.failure(String this.error) : application = null;

  final HomeApplication? application;
  final String? error;

  bool get isSuccess => application != null;
}

class ApplyController extends AutoDisposeNotifier<ApplyState> {
  @override
  ApplyState build() => const ApplyState();

  /// Soumet la candidature et renvoie la candidature créée par le backend
  /// (`applicationController.create` répond `201` avec le DTO complet), ce
  /// qui permet de rediriger vers le suivi de CETTE candidature.
  Future<ApplyResult> apply(
    String jobId, {
    String? cvUrl,
    String? coverLetter,
  }) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) {
      return _fail('Non connecté.');
    }

    if (jobId.isEmpty) {
      return _fail('Identifiant de l\'offre manquant.');
    }

    state = state.loading();

    try {
      final api = ApiClient();
      final response = await api.post(
        '/applications/jobs/$jobId',
        {
          if (cvUrl != null) 'cvUrl': cvUrl,
          if (coverLetter != null) 'coverLetter': coverLetter,
        },
        token: token,
      );

      // Le DTO est renvoyé à plat ; on tolère aussi un éventuel `{ data: … }`.
      final payload = response['data'] is Map<String, dynamic>
          ? response['data'] as Map<String, dynamic>
          : response;
      final application = HomeApplication.fromJson(payload);

      state = ApplyState(application: application);
      ref.invalidate(applicationsProvider);
      return ApplyResult.success(application);
    } on ApiException catch (e) {
      return _fail(e.message);
    } on TimeoutException catch (_) {
      return _fail('Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.');
    } catch (e) {
      return _fail('Erreur : ${e.toString()}');
    }
  }

  ApplyResult _fail(String message) {
    state = ApplyState(error: message);
    return ApplyResult.failure(message);
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
