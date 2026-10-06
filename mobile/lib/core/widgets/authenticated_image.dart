import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_client.dart';
import '../../features/auth/providers/auth_provider.dart';

/// Helpers image authentifiée.
///
/// Contexte : `/uploads/candidates/**` et `/uploads/cvs/**` sont protégés
/// par `uploadAuth` (JWT requis). `CachedNetworkImage` sans en-tête recevait
/// 401 et affichait le fallback — les photos de profil ne s'affichaient
/// donc jamais sur mobile, alors que les logos `/uploads/companies/**`
/// (publics) fonctionnaient. Ces helpers injectent `Authorization: Bearer`
/// uniquement pour les uploads protégés du backend, jamais vers un tiers.
Map<String, String> authImageHeaders(String? token, String? url) =>
    ApiClient.imageHeaders(token, url);

/// `ImageProvider` avec JWT quand requis. À utiliser pour `CircleAvatar.backgroundImage`.
ImageProvider? authenticatedAvatarProvider(String? url, String? token) {
  if (url == null || url.isEmpty) return null;
  final resolved = ApiClient.resolveUrl(url);
  if (resolved.isEmpty) return null;
  final headers = ApiClient.imageHeaders(token, url);
  // `headers` vide : constructeur sans en-tête (comportement inchangé).
  if (headers.isEmpty) return CachedNetworkImageProvider(resolved);
  return CachedNetworkImageProvider(resolved, headers: headers);
}

/// Diagnostic d'échec image, `debug` uniquement (silencieux en release).
/// Permet de trancher 401 (auth) vs 404 (fichier effacé) vs réseau avec
/// `flutter run` : l'erreur porte le statut HTTP.
void debugLogImageFailure(String? rawUrl, Object error) {
  if (!kDebugMode) return;
  debugPrint(
    '[JOBSINC:image] ECHEC raw=$rawUrl '
    'resolved=${ApiClient.resolveUrl(rawUrl)} error=$error',
  );
}

/// Avatar circulaire qui charge la photo protégée avec le token courant.
/// Retombe sur les initiales si absente ou en échec.
class AuthCircleAvatar extends ConsumerWidget {
  const AuthCircleAvatar({
    super.key,
    required this.url,
    required this.initials,
    this.radius = 25,
    this.backgroundColor,
  });

  final String? url;
  final String initials;
  final double radius;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final token = ref.watch(authProvider).user?.token;
    final hasPhoto = url != null && url!.isNotEmpty;
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor,
      backgroundImage:
          hasPhoto ? authenticatedAvatarProvider(url, token) : null,
      onBackgroundImageError: hasPhoto ? (_, __) {} : null,
      child: hasPhoto
          ? null
          : Text(
              initials,
              style: TextStyle(
                fontSize: radius * 0.64,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
    );
  }
}
