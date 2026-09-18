import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

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
    final response = await _client
        .get(_uri(path), headers: _headers(token))
        .timeout(const Duration(seconds: 30));
    if (response.body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body =
          decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
      throw ApiException(
        (body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(),
        response.statusCode,
      );
    }
    return decoded;
  }

  Future<Map<String, dynamic>> get(String path, {String? token}) async {
    final response = await _client
        .get(_uri(path), headers: _headers(token))
        .timeout(const Duration(seconds: 30));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _client
        .post(
          _uri(path),
          headers: {'Content-Type': 'application/json', ..._headers(token)},
          body: jsonEncode(data),
        )
        .timeout(const Duration(seconds: 30));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> put(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _client
        .put(
          _uri(path),
          headers: {'Content-Type': 'application/json', ..._headers(token)},
          body: jsonEncode(data),
        )
        .timeout(const Duration(seconds: 30));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> data, {
    String? token,
  }) async {
    final response = await _client
        .patch(
          _uri(path),
          headers: {'Content-Type': 'application/json', ..._headers(token)},
          body: jsonEncode(data),
        )
        .timeout(const Duration(seconds: 30));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> delete(String path, {String? token}) async {
    final response = await _client
        .delete(_uri(path), headers: _headers(token))
        .timeout(const Duration(seconds: 30));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> postMultipart(
    String path,
    Map<String, String> fields, {
    String? token,
    http.MultipartFile? file,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path));
    request.headers.addAll(_headers(token));
    request.fields.addAll(fields);
    if (file != null) request.files.add(file);
    final streamResponse = await _client.send(request).timeout(
          const Duration(seconds: 60),
        );
    return _decodeResponse(await http.Response.fromStream(streamResponse));
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
}
