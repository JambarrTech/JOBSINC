import 'dart:async';
import 'dart:io';

import '../../../core/services/api_client.dart';
import '../../../core/storage/local_storage.dart';
import '../models/auth_user.dart';

/// Persistance et mapping de la session : construction de l'[AuthUser]
/// depuis les réponses API, restauration depuis le stockage local et
/// écriture de session.
///
/// Séparé du contrôleur d'authentification pour isoler la sérialisation
/// (réseau ↔ modèle ↔ stockage) de la logique d'état (Riverpod).
class AuthSessionService {
  AuthSessionService(this._storage);

  final LocalStorage _storage;

  /// Construit un [AuthUser] depuis la réponse d'un endpoint d'auth
  /// (clé `user` + `token` + `refreshToken` éventuel).
  AuthUser userFromApi(
    Map<String, dynamic> rawUser,
    String token, {
    String? refreshToken,
  }) {
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
      refreshToken: refreshToken,
      companyId: rawUser['companyId']?.toString() ?? rawUser['company']?['id']?.toString(),
      photoUrl: profile?['photoUrl']?.toString() ?? profile?['avatar']?.toString() ?? profile?['avatarUrl']?.toString(),
      cvUrl: profile?['cvUrl']?.toString(),
      skills: profile?['skills']?.toString(),
    );
  }

  /// Restaure la session sauvegardée sur l'appareil (hors réseau).
  Future<AuthUser?> localUserFromStorage(String token) async {
    final id = _storage.userId;
    final status = accountStatusFromStorage(_storage.accountStatus);

    if (id == null || id.isEmpty || status == null) {
      return null;
    }

    final refreshToken = await _storage.refreshToken;

    return AuthUser(
      id: id,
      firstName: _storage.firstName ?? '',
      lastName: _storage.lastName ?? '',
      email: _storage.email ?? '',
      status: status,
      phone: _storage.phone,
      birthDate: _storage.birthDate,
      country: _storage.country,
      city: _storage.city,
      token: token,
      refreshToken: refreshToken,
      photoUrl: _storage.photoUrl,
      cvUrl: _storage.cvUrl,
    );
  }

  /// Persiste la session complète sur l'appareil.
  Future<void> saveSession(AuthUser user) async {
    await _storage.saveSession(
      token: user.token!,
      refreshToken: user.refreshToken,
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

  Future<void> clearSession() => _storage.clearSession();

  Future<String?> get authToken => _storage.authToken;

  Future<String?> get refreshToken => _storage.refreshToken;

  /// 401/403 = session rejetée par le serveur, quel que soit l'endpoint.
  static bool isUnauthorized(int? statusCode) =>
      statusCode == HttpStatus.unauthorized ||
      statusCode == HttpStatus.forbidden;

  /// Message utilisateur lisible depuis une erreur.
  static String messageFor(Object error) {
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