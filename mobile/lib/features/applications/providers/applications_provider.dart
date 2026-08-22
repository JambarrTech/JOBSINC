import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../candidate/home/data/home_repository.dart';

final applicationsProvider = FutureProvider.autoDispose<List<HomeApplication>>(
  (ref) async {
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
