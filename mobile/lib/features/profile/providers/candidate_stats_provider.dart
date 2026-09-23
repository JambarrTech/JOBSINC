import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import 'dart:developer' as developer;

class CandidateStats {
  const CandidateStats({
    this.totalApplications = 0,
    this.interviewCount = 0,
    this.acceptedCount = 0,
    this.rejectedCount = 0,
    this.savedCount = 0,
    this.profileCompletion = 0,
    this.interviewRate = 0,
    this.acceptRate = 0,
    this.hasError = false,
  });

  final int totalApplications;
  final int interviewCount;
  final int acceptedCount;
  final int rejectedCount;
  final int savedCount;
  final int profileCompletion;
  final int interviewRate;
  final int acceptRate;
  final bool hasError;

  factory CandidateStats.fromJson(Map<String, dynamic> json) {
    return CandidateStats(
      totalApplications: json['totalApplications'] as int? ?? 0,
      interviewCount: json['interviewCount'] as int? ?? 0,
      acceptedCount: json['acceptedCount'] as int? ?? 0,
      rejectedCount: json['rejectedCount'] as int? ?? 0,
      savedCount: json['savedCount'] as int? ?? 0,
      profileCompletion: json['profileCompletion'] as int? ?? 0,
      interviewRate: json['interviewRate'] as int? ?? 0,
      acceptRate: json['acceptRate'] as int? ?? 0,
    );
  }

  static CandidateStats error() {
    return const CandidateStats(hasError: true);
  }
}

final candidateStatsProvider = FutureProvider.autoDispose<CandidateStats>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) return const CandidateStats();
  try {
    final response = await ApiClient().get('/candidate/stats', token: token);
    return CandidateStats.fromJson(response);
  } catch (e, stack) {
    developer.log('Erreur chargement stats candidat', name: 'CandidateStats', error: e, stackTrace: stack);
    return CandidateStats.error();
  }
});
