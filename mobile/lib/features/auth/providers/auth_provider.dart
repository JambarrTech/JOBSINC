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

    final token = await _storage!.authToken;

    // Aucune session locale : l'utilisateur n'a jamais de compte
    // sur cet appareil (première installation ou réinstallation).
    if (token == null || token.isEmpty) {
      state = const AuthState.unauthenticated();
      return;
    }

    // Session sauvegardée localement : on la restaure d'office
    // pour que l'utilisateur reste connecté même si le serveur
    // est momentanément injoignable.
    final localUser = _localUserFromStorage(token);

    try {
      final response = await _api.get(
        '/auth/me',
        token: token,
      );

      final rawUser = response['user'] as Map<String, dynamic>?;

      if (rawUser == null) {
        throw const ApiException(
          'Session invalide.',
          401,
        );
      }

      final user = _userFromApi(
        rawUser,
        token,
      );

      await _saveSession(user);

      state = AuthState.authenticated(user);
    } on ApiException catch (error) {
      // Le serveur a répondu : seule une session explicitement
      // rejetée (token expiré/révoqué) déconnecte l'utilisateur.
      if (_isUnauthorized(error.statusCode)) {
        await _storage!.clearSession();

        state = const AuthState.unauthenticated();
        return;
      }

      // Autre erreur serveur passagère : on conserve la session.
      state = localUser != null
          ? AuthState.authenticated(localUser)
          : const AuthState.unauthenticated();
    } catch (_) {
      // Erreur réseau ou timeout : on NE déconnecte PAS.
      // On restaure la session sauvegardée sur l'appareil.
      state = localUser != null
          ? AuthState.authenticated(localUser)
          : const AuthState.unauthenticated();
    }
  }

  bool _isUnauthorized(int? statusCode) =>
      statusCode == HttpStatus.unauthorized ||
      statusCode == HttpStatus.forbidden;

  AuthUser? _localUserFromStorage(String token) {
    final id = _storage?.userId;
    final status = accountStatusFromStorage(_storage?.accountStatus);

    if (id == null || id.isEmpty || status == null) {
      return null;
    }

    return AuthUser(
      id: id,
      firstName: _storage!.firstName ?? '',
      lastName: _storage!.lastName ?? '',
      email: _storage!.email ?? '',
      status: status,
      phone: _storage!.phone,
      birthDate: _storage!.birthDate,
      country: _storage!.country,
      city: _storage!.city,
      token: token,
      photoUrl: _storage!.photoUrl,
      cvUrl: _storage!.cvUrl,
    );
  }

  Future<bool> signIn({
    required String email,
    required String password,
  }) async {
    try {
      state = const AuthState.loading();

      final response = await _api.post(
        '/auth/login',
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
        final fileName = avatar.path.split(RegExp(r'[/\\]')).last;
        final ext = fileName.split('.').last.toLowerCase();
        final mediaType = switch (ext) {
          'png' => MediaType('image', 'png'),
          'gif' => MediaType('image', 'gif'),
          'webp' => MediaType('image', 'webp'),
          _ => MediaType('image', 'jpeg'),
        };
        response = await _api.postMultipart(
          '/auth/register/candidate',
          fields,
          file: http.MultipartFile.fromBytes('avatar', bytes,
              filename: fileName,
              contentType: mediaType),
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
          'Réponse d\'inscription invalide.',
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

  Future<bool> registerCompany({
    required String companyName,
    required String email,
    required String password,
  }) async {
    try {
      state = const AuthState.loading();

      final response = await _api.post(
        '/auth/register/company',
        {
          'companyName': companyName.trim(),
          'email': email.trim(),
          'password': password,
        },
      );

      final rawUser = response['user'] as Map<String, dynamic>?;
      final token = response['token']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException('Réponse d\'inscription invalide.');
      }

      final user = _userFromApi(rawUser, token);
      await _saveSession(user);
      state = AuthState.authenticated(user);
      return true;
    } catch (error) {
      state = AuthState.error(_messageFor(error));
      return false;
    }
  }

  Future<void> signOut() async {
    _storage ??= await LocalStorage.create();

    final token = await _storage!.authToken;
    if (token != null && token.isNotEmpty) {
      try {
        await _api.post('/auth/logout', {}, token: token);
      } catch (_) {}
    }

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
      companyId: rawUser['companyId']?.toString() ?? rawUser['company']?['id']?.toString(),
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
