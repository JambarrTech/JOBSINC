import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../../core/storage/local_storage.dart';
import '../models/auth_user.dart';
import '../services/auth_session_service.dart';
import '../services/auth_token_refresher.dart';

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
  // L'instance auth est branchée sur le refresh automatique : login,
  // logout, /auth/me et le refresh lui-même en bénéficient.
  late final ApiClient _api = ApiClient(onTokenRefresh: _refreshAccessToken);

  LocalStorage? _storage;
  AuthSessionService? _session;
  AuthTokenRefresher? _refresher;

  // Empêche les déconnexions réentrantes (ex. signOut qui reçoit un 401
  // sur /auth/logout pendant la déconnexion en cours).
  bool _handlingSessionExpired = false;

  @override
  AuthState build() {
    // Point de branchement UNIQUE : toutes les instances ApiClient des
    // repositories rafraîchissent le token sur 401 via ce callback.
    ApiClient.onTokenRefreshGlobal = _refreshAccessToken;
    return const AuthState.loading();
  }

  Future<AuthSessionService> _sessionService() async {
    _storage ??= await LocalStorage.create();
    return _session ??= AuthSessionService(_storage!);
  }

  Future<AuthTokenRefresher> _tokenRefresher() async {
    final session = await _sessionService();
    return _refresher ??= AuthTokenRefresher(
      api: _api,
      storage: _storage!,
      fetchRefreshToken: () async =>
          await _storage!.refreshToken ?? state.user?.refreshToken,
      onRefreshed: (accessToken, refreshToken) async {
        final current = state.user;
        if (current == null) return;
        final patched = current.copyWith(
          token: accessToken,
          refreshToken: refreshToken,
        );
        await session.saveSession(patched);
        state = AuthState.authenticated(patched);
      },
      onRefreshFailed: handleSessionExpired,
    );
  }

  Future<String?> _refreshAccessToken() =>
      _tokenRefresher().then((refresher) => refresher.refresh());

  /// Rejet de session par le serveur (token expiré / révoqué) :
  /// on vide la session locale et on repasse non authentifié. Le router
  /// redirige alors automatiquement vers /login.
  Future<void> handleSessionExpired() async {
    if (_handlingSessionExpired) return;
    if (state.status != AuthStatus.authenticated) return;

    _handlingSessionExpired = true;
    try {
      final session = await _sessionService();
      await session.clearSession();
      // L'état est réécrit APRÈS le nettoyage pour éviter une fenêtre où
      // l'app considérerait l'utilisateur connecté sans token.
      state = const AuthState.unauthenticated();
    } finally {
      _handlingSessionExpired = false;
    }
  }

  /// Met à jour les champs du profil LOCAL (après édition/upload) sans
  /// nouvel appel réseau. Les autres features doivent passer par cette
  /// méthode pour synchroniser l'état auth au lieu d'écrire directement
  /// dans `state` (anti-pattern).
  void patchUser(AuthUser Function(AuthUser user) patch) {
    final current = state.user;
    if (current == null) return;
    state = AuthState.authenticated(patch(current));
  }

  Future<void> initialize() async {
    final session = await _sessionService();

    final token = await session.authToken;

    // Aucune session locale : l'utilisateur n'a jamais de compte
    // sur cet appareil (première installation ou réinstallation).
    if (token == null || token.isEmpty) {
      state = const AuthState.unauthenticated();
      return;
    }

    // Session sauvegardée localement : on la restaure d'office
    // pour que l'utilisateur reste connecté même si le serveur
    // est momentanément injoignable.
    final localUser = await session.localUserFromStorage(token);

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

      // Si un refresh a eu lieu pendant cet appel (401 → retry), le token
      // actuel est déjà persisté en storage : on le réutilise tel quel pour
      // ne pas réécrire un token périmé dans la session locale.
      final effectiveToken = await session.authToken ?? token;

      final user = session.userFromApi(
        rawUser,
        effectiveToken,
      );

      await session.saveSession(user);

      state = AuthState.authenticated(user);
    } on ApiException catch (error) {
      // Le serveur a répondu : seule une session explicitement
      // rejetée (token expiré/révoqué) déconnecte l'utilisateur.
      if (AuthSessionService.isUnauthorized(error.statusCode)) {
        await session.clearSession();

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
      final refreshToken = response['refreshToken']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException(
          'Réponse de connexion invalide.',
        );
      }

      final session = await _sessionService();
      final user = session.userFromApi(
        rawUser,
        token,
        refreshToken: refreshToken,
      );

      await session.saveSession(user);

      state = AuthState.authenticated(user);

      return true;
    } catch (error) {
      state = AuthState.error(
        AuthSessionService.messageFor(error),
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
      final refreshToken = response['refreshToken']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException(
          'Réponse d\'inscription invalide.',
        );
      }

      final session = await _sessionService();
      final user = session.userFromApi(
        rawUser,
        token,
        refreshToken: refreshToken,
      );

      await session.saveSession(user);

      state = AuthState.authenticated(user);

      return true;
    } catch (error) {
      state = AuthState.error(
        AuthSessionService.messageFor(error),
      );

      return false;
    }
  }

  @Deprecated('Inscription entreprise désactivée sur mobile — utiliser le web (entreprise). Conservé pour compat API.')
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
      final refreshToken = response['refreshToken']?.toString();

      if (rawUser == null || token == null || token.isEmpty) {
        throw const ApiException('Réponse d\'inscription invalide.');
      }

      final session = await _sessionService();
      final user = session.userFromApi(rawUser, token, refreshToken: refreshToken);
      await session.saveSession(user);
      state = AuthState.authenticated(user);
      return true;
    } catch (error) {
      state = AuthState.error(AuthSessionService.messageFor(error));
      return false;
    }
  }

  Future<void> signOut() async {
    final session = await _sessionService();

    final token = await session.authToken;
    final refreshToken = await session.refreshToken;
    if (token != null && token.isNotEmpty) {
      try {
        await _api.post('/auth/logout', {'refreshToken': refreshToken}, token: token);
      } catch (_) {}
    }

    await session.clearSession();

    state = const AuthState.unauthenticated();
  }

  /// Demande l'envoi d'un lien de réinitialisation de mot de passe.
  /// Retourne `null` en cas de succès, sinon un message d'erreur.
  Future<String?> forgotPassword(String email) async {
    try {
      await _api.post(
        '/auth/forgot-password',
        {'email': email.trim()},
      );
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (error) {
      return AuthSessionService.messageFor(error);
    }
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);