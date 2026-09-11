import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../../../core/services/api_client.dart';
import '../../auth/providers/auth_provider.dart';

class CandidateProfile {
  const CandidateProfile({
    this.id,
    this.firstName,
    this.lastName,
    this.phone,
    this.country,
    this.city,
    this.avatarUrl,
    this.cvUrl,
    this.skills,
    this.experienceYears,
    this.educationLevel,
    this.educationField,
    this.desiredContracts,
    this.availableFrom,
  });

  final String? id;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final String? country;
  final String? city;
  final String? avatarUrl;
  final String? cvUrl;
  final String? skills;
  final int? experienceYears;
  final String? educationLevel;
  final String? educationField;
  final String? desiredContracts;
  final DateTime? availableFrom;

  factory CandidateProfile.fromJson(Map<String, dynamic> json) {
    return CandidateProfile(
      id: json['id']?.toString(),
      firstName: json['firstName']?.toString(),
      lastName: json['lastName']?.toString(),
      phone: json['phone']?.toString(),
      country: json['country']?.toString(),
      city: json['city']?.toString(),
      avatarUrl: json['avatarUrl']?.toString() ?? json['photoUrl']?.toString() ?? json['avatar']?.toString(),
      cvUrl: json['cvUrl']?.toString(),
      skills: json['skills']?.toString(),
      experienceYears: json['experienceYears'] == null ? null : int.tryParse(json['experienceYears'].toString()),
      educationLevel: json['educationLevel']?.toString(),
      educationField: json['educationField']?.toString(),
      desiredContracts: json['desiredContracts']?.toString(),
      availableFrom: json['availableFrom'] == null ? null : DateTime.tryParse(json['availableFrom'].toString()),
    );
  }
}

final candidateProfileProvider =
    FutureProvider.autoDispose<CandidateProfile>((ref) async {
  final token = ref.watch(authProvider).user?.token;
  if (token == null || token.isEmpty) {
    return const CandidateProfile();
  }
  final api = ApiClient();
  try {
    final response = await api.get('/candidate/profile', token: token);
    final profile = response['data'] as Map<String, dynamic>? ?? response;
    return CandidateProfile.fromJson(profile);
  } on ApiException catch (e) {
    if (e.statusCode == 404) return const CandidateProfile();
    rethrow;
  }
});

class CandidateProfileController
    extends AutoDisposeNotifier<CandidateProfile> {

  static const int maxImageSizeBytes = 15 * 1024 * 1024;

  @override
  CandidateProfile build() {
    final profile = ref.watch(candidateProfileProvider);
    return profile.maybeWhen(
      data: (data) => data,
      orElse: () => const CandidateProfile(),
    );
  }

  Future<void> refresh() async {
    ref.invalidate(candidateProfileProvider);
  }

  Future<String?> updateProfile({
    String? firstName,
    String? lastName,
    String? phone,
    String? country,
    String? city,
    String? skills,
    int? experienceYears,
    String? educationLevel,
    String? educationField,
    String? desiredContracts,
    DateTime? availableFrom,
  }) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return 'Non connecté.';

    final fields = <String, dynamic>{};
    if (firstName != null) fields['firstName'] = firstName;
    if (lastName != null) fields['lastName'] = lastName;
    if (phone != null) fields['phone'] = phone;
    if (country != null) fields['country'] = country;
    if (city != null) fields['city'] = city;
    if (skills != null) fields['skills'] = skills;
    if (experienceYears != null) fields['experienceYears'] = experienceYears;
    if (educationLevel != null) fields['educationLevel'] = educationLevel;
    if (educationField != null) fields['educationField'] = educationField;
    if (desiredContracts != null) fields['desiredContracts'] = desiredContracts;
    if (availableFrom != null) {
      fields['availableFrom'] = availableFrom.toIso8601String();
    }

    try {
      final api = ApiClient();
      final updated = await api.put('/candidate/profile', fields, token: token);
      ref.invalidate(candidateProfileProvider);

      // Synchronise l'état auth pour que l'en-tête reflète les changements.
      final currentUser = ref.read(authProvider).user;
      if (currentUser != null) {
        ref.read(authProvider.notifier).state = AuthState.authenticated(
          currentUser.copyWith(
            firstName: updated['firstName']?.toString() ?? (fields['firstName'] as String?),
            lastName: updated['lastName']?.toString() ?? (fields['lastName'] as String?),
            phone: updated['phone']?.toString() ?? (fields['phone'] as String?),
            country: updated['country']?.toString() ?? (fields['country'] as String?),
            city: updated['city']?.toString() ?? (fields['city'] as String?),
            skills: updated['skills']?.toString() ?? (fields['skills'] as String?),
          ),
        );
      }
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
      return 'Erreur : $e';
    }
  }

  Future<String?> uploadCv(File file) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return 'Non connecté.';

    try {
      final api = ApiClient();
      final bytes = await file.readAsBytes();
      final fileName = file.path.split(RegExp(r'[/\\]')).last;
      final ext = fileName.split('.').last.toLowerCase();
      final mediaType = switch (ext) {
        'pdf' => MediaType('application', 'pdf'),
        'doc' => MediaType('application', 'msword'),
        'docx' => MediaType('application', 'vnd.openxmlformats-officedocument.wordprocessingml.document'),
        _ => MediaType('application', 'octet-stream'),
      };
      final multipartFile = http.MultipartFile.fromBytes('cv', bytes,
          filename: fileName,
          contentType: mediaType);
      final response = await api.postMultipart(
        '/candidate/cv',
        {},
        token: token,
        file: multipartFile,
      );
      ref.invalidate(candidateProfileProvider);
      return response['cvUrl']?.toString();
    } on ApiException catch (e) {
      return e.message;
    } on TimeoutException catch (_) {
      return 'Le serveur met trop de temps à répondre. Vérifiez votre connexion Internet.';
    } catch (e) {
      return 'Erreur : $e';
    }
  }

  Future<String?> uploadAvatar(File file) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || token.isEmpty) return 'Non connecté.';

    final size = await file.length();
    if (size > maxImageSizeBytes) {
      return 'L\'image ne doit pas dépasser 15 Mo.';
    }

    try {
      final api = ApiClient();
      final bytes = await file.readAsBytes();
      final fileName = file.path.split(RegExp(r'[/\\]')).last;
      final ext = fileName.split('.').last.toLowerCase();
      final mediaType = switch (ext) {
        'png' => MediaType('image', 'png'),
        'gif' => MediaType('image', 'gif'),
        'webp' => MediaType('image', 'webp'),
        _ => MediaType('image', 'jpeg'),
      };
      final multipartFile = http.MultipartFile.fromBytes('avatar', bytes,
          filename: fileName,
          contentType: mediaType);
      final response = await api.postMultipart(
        '/candidate/avatar',
        {},
        token: token,
        file: multipartFile,
      );
      final newAvatarUrl = response['avatarUrl']?.toString();
      ref.invalidate(candidateProfileProvider);
      if (newAvatarUrl != null) {
        final currentUser = ref.read(authProvider).user;
        if (currentUser != null) {
          ref.read(authProvider.notifier).state = AuthState.authenticated(
            currentUser.copyWith(photoUrl: newAvatarUrl),
          );
        }
      }
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
      return 'Erreur : $e';
    }
  }
}

final candidateProfileControllerProvider =
    NotifierProvider.autoDispose<CandidateProfileController, CandidateProfile>(
  CandidateProfileController.new,
);
