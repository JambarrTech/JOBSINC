import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();
  static const _baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://127.0.0.1:5000/api');
  static const _serverBase = 'http://127.0.0.1:5000';
  final http.Client _client;

  static String resolveUrl(String? url) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '$_serverBase$url';
  }

  Uri _uri(String path) => Uri.parse('$_baseUrl${path.startsWith('/') ? path : '/$path'}');

  Future<dynamic> getRaw(String path, {String? token}) async {
    final response = await _client.get(
      _uri(path),
      headers: {if (token != null) 'Authorization': 'Bearer $token'},
    );
    if (response.body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
      throw ApiException(
        (body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(),
        response.statusCode,
      );
    }
    return decoded;
  }

  Future<Map<String, dynamic>> get(String path, {String? token}) async {
    final response = await _client.get(
      _uri(path),
      headers: {if (token != null) 'Authorization': 'Bearer $token'},
    );
    final body = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        (body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(),
        response.statusCode,
      );
    }
    return body;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data, {String? token}) async {
    final response = await _client
        .post(_uri(path), headers: {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'}, body: jsonEncode(data))
        .timeout(const Duration(seconds: 30));
    final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException((body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(), response.statusCode);
    return body;
  }

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> data, {String? token}) async {
    final response = await _client
        .patch(_uri(path), headers: {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'}, body: jsonEncode(data))
        .timeout(const Duration(seconds: 30));
    final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException((body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(), response.statusCode);
    return body;
  }

  Future<Map<String, dynamic>> delete(String path, {String? token}) async {
    final response = await _client
        .delete(_uri(path), headers: {if (token != null) 'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 30));
    final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException((body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(), response.statusCode);
    return body;
  }

  Future<Map<String, dynamic>> postMultipart(
    String path,
    Map<String, String> fields, {
    String? token,
    http.MultipartFile? file,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path));

    if (token != null) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    request.fields.addAll(fields);

    if (file != null) {
      request.files.add(file);
    }

    final streamResponse = await _client.send(request).timeout(const Duration(seconds: 60));
    final response = await http.Response.fromStream(streamResponse);

    final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException((body['error'] ?? body['message'] ?? 'Erreur serveur.').toString(), response.statusCode);
    }
    return body;
  }
}
