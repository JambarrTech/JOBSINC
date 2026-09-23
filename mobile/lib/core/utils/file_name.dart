/// Extrait le nom de fichier lisible depuis une URL (avec décodage des
/// caractères encodés et suppression de la partie query).
String? fileNameFromUrl(String? url) {
  if (url == null || url.isEmpty) return null;
  final parts = url.split('/');
  final last = parts.isNotEmpty ? parts.last : url;
  final name = Uri.decodeComponent(last);
  final queryIndex = name.indexOf('?');
  return queryIndex > 0 ? name.substring(0, queryIndex) : name;
}