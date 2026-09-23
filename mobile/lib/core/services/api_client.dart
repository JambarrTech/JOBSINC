import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
}

/// Callback branché par l'auth provider : doit rafraîchir le token d'accès
/// via le refresh token stocké localement et retourner le NOUVEAU token
/// (ou `null` si le refresh échoue → session révoquée).
typedef TokenRefreshCallback = Future<String?> Function();

class ApiClient {
  ApiClient({http.Client? client, this.onTokenRefresh})
      : _client = client ?? http.Client();

  /// Registre GLOBAL branché par l'auth provider (une seule fois, au
  /// bootstrap). Permet à TOUTES les instances ApiClient des repositories
  /// de rafraîchir automatiquement le token sur 401 sans couplage direct.
  /// Remplacé l'ancien `onUnauthorized` (déconnexion immédiate) par un
  /// refresh transparent ; le logout n'intervient QUE si le refresh échoue.
  static TokenRefreshCallback? onTokenRefreshGlobal;

  /// Callback optionnel par instance (injection de tests, cas spécifiques).
  /// Prioritaire sur le registre global.
  final TokenRefreshCallback? onTokenRefresh;

  TokenRefreshCallback? get _refresher =>
      onTokenRefresh ?? onTokenRefreshGlobal;

  // URL du backend centralisée dans AppConfig (dart-define API_URL sinon défaut local).
  static const _baseUrl = AppConfig.apiBaseUrl;
  static final _serverBase = _baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
  final http.Client _client;

  static String get baseUrl => _baseUrl;
  static String get serverBaseUrl => _serverBase;

  static String resolveUrl(String? url) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '$_serverBase$url';
  }

  Uri _uri(String path) =>
      Uri.parse('$_baseUrl${path.startsWith('/') ? path : '/$path'}');

  Map<String, String> _headers(String? token) => {
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> getRaw(String path, {String? token}) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .get(_uri(path), headers: _headers(t))
          .timeout(const Duration(seconds: 45)),
      token,
    );
    if (response.body.isEmpty) return <String, dynamic>{};
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> get(String path, {String? token}) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .get(_uri(path), headers: _headers(t))
          .timeout(const Duration(seconds: 45)),
      token,
    );
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .post(
            _uri(path),
            headers: {'Content-Type': 'application/json', ..._headers(t)},
            body: jsonEncode(data),
          )
          .timeout(const Duration(seconds: 45)),
      token,
    );
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> put(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .put(
            _uri(path),
            headers: {'Content-Type': 'application/json', ..._headers(t)},
            body: jsonEncode(data),
          )
          .timeout(const Duration(seconds: 45)),
      token,
    );
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .patch(
            _uri(path),
            headers: {'Content-Type': 'application/json', ..._headers(t)},
            body: jsonEncode(data),
          )
          .timeout(const Duration(seconds: 45)),
      token,
    );
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> delete(String path, {String? token}) async {
    final response = await _requestWithTokenRefresh(
      (t) => _client
          .delete(_uri(path), headers: _headers(t))
          .timeout(const Duration(seconds: 45)),
      token,
    );
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> postMultipart(
    String path,
    Map<String, String> fields, {
    String? token,
    http.MultipartFile? file,
  }) async {
    Future<http.Response> build(String? t) async {
      final request = http.MultipartRequest('POST', _uri(path));
      request.headers.addAll(_headers(t));
      request.fields.addAll(fields);
      if (file != null) request.files.add(file);
      final streamResponse =
          await _client.send(request).timeout(const Duration(seconds: 60));
      return http.Response.fromStream(streamResponse);
    }

    final response = await _requestWithTokenRefresh(build, token);
    return _decodeResponse(response);
  }

  /// Exécute la requête ; sur 401 authentifié, tente UN refresh puis relance
  /// la requête avec le nouveau token. Échec de refresh → l'erreur 401
  /// d'origine remonte (le callback de refresh a alors déjà déconnecté).
  Future<http.Response> _requestWithTokenRefresh(
    Future<http.Response> Function(String? token) requestBuilder,
    String? token,
  ) async {
    var response = await requestBuilder(token);

    final hadToken = token != null && token.isNotEmpty;
    final refresher = _refresher;
    if (response.statusCode == HttpStatus.unauthorized &&
        hadToken &&
        refresher != null) {
      final newToken = await refresher();
      if (newToken != null && newToken.isNotEmpty) {
        response = await requestBuilder(newToken);
      }
    }
    return response;
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    final decoded = response.body.isEmpty
        ? null
        : jsonDecode(response.body);
    // Le backend renvoie parfois des tableaux (ex. /company/matching) :
    // on les expose sous la clé `data` pour ne pas casser le cast Map.
    final body = decoded is Map<String, dynamic>
        ? decoded
        : <String, dynamic>{if (decoded != null) 'data': decoded};
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        (body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(),
        response.statusCode,
      );
    }
    return body;
  }

  /// Refresh access token using refresh token (appel direct, sans retry).
  /// Returns new {'accessToken', 'refreshToken'} or throws.
  Future<Map<String, String>> refreshAccessToken(String refreshToken) async {
    final response = await _client
        .post(
          _uri('/auth/refresh'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'refreshToken': refreshToken}),
        )
        .timeout(const Duration(seconds: 45));
    final body = _decodeResponse(response);
    final newAccessToken = body['accessToken'] as String?;
    final newRefreshToken = body['refreshToken'] as String?;
    if (newAccessToken == null || newRefreshToken == null) {
      throw const ApiException('Réponse de rafraîchissement invalide.', 401);
    }
    return {'accessToken': newAccessToken, 'refreshToken': newRefreshToken};
  }
}