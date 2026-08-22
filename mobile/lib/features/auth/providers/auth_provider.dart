import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../../core/storage/local_storage.dart';
import '../models/auth_user.dart';

enum AuthStatus {
  loading,
  unauthenticated,
  authenticated,
  error,
}

class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.message,
  });

  const AuthState.loading() : this(status: AuthStatus.loading);

  const AuthState.unauthenticated() : this(status: AuthStatus.unauthenticated);

  const AuthState.authenticated(AuthUser user)
      : this(
          status: AuthStatus.authenticated,
          user: user,
        );

  const AuthState.error(String message)
      : this(
          status: AuthStatus.error,
          message: message,
        );

  final AuthStatus status;
  final AuthUser? user;
  final String? message;
}

class AuthController extends Notifier<AuthState> {
  LocalStorage? _storage;

  final ApiClient _api = ApiClient();

  @override
  AuthState build() => const AuthState.loading();

  Future<void> initialize() async {
    _storage ??= await LocalStorage.create();

    final token = _storage!.authToken;

    if (token == null || token.isEmpty) {
      state = const AuthState.unauthenticated();
      return;
    }

    try {
      final response = await _api.get(
        '/auth/me',
        token: token,
      );

      final rawUser = response['user'] as Map<String, dynamic>?;

      if (rawUser == null) {
        throw const ApiException(
          'Session invalide.',
        );
      }

      final user = _userFromApi(
        rawUser,
        token,
      );

      await _saveSession(user);

      state = AuthState.authenticated(user);
    } catch (_) {
      await _storage!.clearSession();

      state = const AuthState.unauthenticated();
    }
  }

  Future<bool> signIn({
    required String email,
    required String password,
  }) async {
    try {
      state = const AuthState.loading();

      final response = await _api.post(
        '/auth/login/candidate',
        {
          'email': email.trim(),
          'password': password,
        },
      );

      final rawUser = response['user'] as Map<String, dynamic>?;

      final token = response['token']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException(
          'Réponse de connexion invalide.',
        );
      }

      final user = _userFromApi(
        rawUser,
        token,
      );

      await _saveSession(user);

      state = AuthState.authenticated(user);

      return true;
    } catch (error) {
      state = AuthState.error(
        _messageFor(error),
      );

      return false;
    }
  }

  Future<bool> register({
    required String firstName,
    required String lastName,
    required DateTime birthDate,
    required String email,
    required String phone,
    required String country,
    required String city,
    required String password,
    File? avatar,
  }) async {
    try {
      state = const AuthState.loading();

      final fields = {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'birthDate': birthDate.toIso8601String(),
        'email': email.trim(),
        'phone': phone,
        'country': country.trim(),
        'city': city.trim(),
        'password': password,
      };

      Map<String, dynamic> response;

      if (avatar != null) {
        final bytes = await avatar.readAsBytes();
        response = await _api.postMultipart(
          '/auth/register/candidate',
          fields,
          file: http.MultipartFile.fromBytes('avatar', bytes,
              filename: 'avatar.jpg',
              contentType: MediaType('image', 'jpeg')),
        );
      } else {
        response = await _api.post(
          '/auth/register/candidate',
          fields,
        );
      }

      final rawUser = response['user'] as Map<String, dynamic>?;

      final token = response['token']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException(
          'Réponse d’inscription invalide.',
        );
      }

      final user = _userFromApi(
        rawUser,
        token,
      );

      await _saveSession(user);

      state = AuthState.authenticated(user);

      return true;
    } catch (error) {
      state = AuthState.error(
        _messageFor(error),
      );

      return false;
    }
  }

  Future<void> signOut() async {
    _storage ??= await LocalStorage.create();

    await _storage!.clearSession();

    state = const AuthState.unauthenticated();
  }

  AuthUser _userFromApi(
    Map<String, dynamic> rawUser,
    String token,
  ) {
    final role = rawUser['role']?.toString();

    final profile = rawUser['candidate'] as Map<String, dynamic>?;

    return AuthUser(
      id: rawUser['id']?.toString() ?? '',
      firstName: profile?['firstName']?.toString() ?? '',
      lastName: profile?['lastName']?.toString() ?? '',
      email: rawUser['email']?.toString() ?? '',
      phone: profile?['phone']?.toString(),
      birthDate: DateTime.tryParse(
        profile?['birthDate']?.toString() ?? '',
      ),
      country: profile?['country']?.toString(),
      city: profile?['city']?.toString(),
      status:
          role == 'EMPLOYEE' ? AccountStatus.employee : role == 'RECRUITER' ? AccountStatus.recruiter : AccountStatus.candidate,
      token: token,
      photoUrl: profile?['photoUrl']?.toString() ?? profile?['avatar']?.toString() ?? profile?['avatarUrl']?.toString(),
      cvUrl: profile?['cvUrl']?.toString(),
      skills: profile?['skills']?.toString(),
    );
  }

  Future<void> _saveSession(
    AuthUser user,
  ) async {
    _storage ??= await LocalStorage.create();

    await _storage!.saveSession(
      token: user.token!,
      id: user.id,
      status: user.status.storageValue,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      country: user.country,
      city: user.city,
      photoUrl: user.photoUrl,
      cvUrl: user.cvUrl,
    );
  }

  String _messageFor(Object error) {
    if (error is ApiException) {
      return error.message;
    }

    if (error is SocketException || error is TimeoutException) {
      return 'La connexion au serveur est indisponible. '
          'Vérifiez votre réseau puis réessayez.';
    }

    return 'Une erreur inattendue est survenue. '
        'Veuillez réessayer.';
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
