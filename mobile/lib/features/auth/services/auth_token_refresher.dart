import '../../../core/services/api_client.dart';
import '../../../core/storage/local_storage.dart';

/// Rafraîchit le token d'accès de façon « single-flight » : si plusieurs
/// requêtes reçoivent un 401 en même temps, elles partagent le même appel
/// réseau au lieu d'en déclencher N.
///
/// La rotation est persistée en storage immédiatement (même si l'état
/// applicatif n'est pas encore reconstruit) puis notifiée via les
/// callbacks [onRefreshed] / [onRefreshFailed].
class AuthTokenRefresher {
  AuthTokenRefresher({
    required ApiClient api,
    required LocalStorage storage,
    required Future<String?> Function() fetchRefreshToken,
    required Future<void> Function(String accessToken, String refreshToken)
        onRefreshed,
    required Future<void> Function() onRefreshFailed,
  })  : _api = api,
        _storage = storage,
        _fetchRefreshToken = fetchRefreshToken,
        _onRefreshed = onRefreshed,
        _onRefreshFailed = onRefreshFailed;

  final ApiClient _api;
  final LocalStorage _storage;
  final Future<String?> Function() _fetchRefreshToken;
  final Future<void> Function(String accessToken, String refreshToken)
      _onRefreshed;
  final Future<void> Function() _onRefreshFailed;

  /// Une seule rotation en cours, partagée par toutes les requêtes qui
  /// reçoivent un 401 simultanément.
  Future<String?>? _inFlightRefresh;

  /// Retourne le nouveau token d'accès, ou `null` si le refresh échoue
  /// (session révoquée/expirée → [onRefreshFailed] nettoie la session).
  Future<String?> refresh() async {
    if (_inFlightRefresh != null) return _inFlightRefresh;

    final refresh = _performRefresh();
    _inFlightRefresh = refresh;
    try {
      return await refresh;
    } finally {
      _inFlightRefresh = null;
    }
  }

  Future<String?> _performRefresh() async {
    final refreshToken = await _fetchRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return null;

    try {
      final tokens = await _api.refreshAccessToken(refreshToken);

      // Persiste la rotation immédiatement : les valeurs sont garanties
      // non-null par refreshAccessToken.
      await _storage.updateTokens(
        accessToken: tokens['accessToken']!,
        refreshToken: tokens['refreshToken']!,
      );

      await _onRefreshed(tokens['accessToken']!, tokens['refreshToken']!);

      return tokens['accessToken'];
    } catch (_) {
      // Refresh token révoqué/expiré → déconnexion propre.
      await _onRefreshFailed();
      return null;
    }
  }
}