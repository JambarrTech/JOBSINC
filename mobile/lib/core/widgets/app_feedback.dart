import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum FeedbackType { success, error, warning, info }

class AppFeedback {
  static void show(
    BuildContext context, {
    required String message,
    FeedbackType type = FeedbackType.info,
    Duration duration = const Duration(seconds: 3),
    SnackBarAction? action,
    bool clearPrevious = true,
  }) {
    final messenger = ScaffoldMessenger.of(context);
    if (clearPrevious) messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(_iconFor(type), color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600))),
          ],
        ),
        backgroundColor: _bgFor(type),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        duration: duration,
        action: action,
        elevation: 6,
      ),
    );
  }

  static void success(BuildContext context, String message, {SnackBarAction? action}) => show(context, message: message, type: FeedbackType.success, action: action);
  static void error(BuildContext context, String message, {SnackBarAction? action}) => show(context, message: message, type: FeedbackType.error, duration: const Duration(seconds: 4), action: action);
  static void warning(BuildContext context, String message, {SnackBarAction? action}) => show(context, message: message, type: FeedbackType.warning, action: action);
  static void info(BuildContext context, String message, {SnackBarAction? action}) => show(context, message: message, type: FeedbackType.info, action: action);

  static Color _bgFor(FeedbackType t) {
    switch (t) {
      case FeedbackType.success:
        return AppColors.success;
      case FeedbackType.error:
        return AppColors.error;
      case FeedbackType.warning:
        return const Color(0xFFB7791F);
      case FeedbackType.info:
        return AppColors.navy;
    }
  }

  static IconData _iconFor(FeedbackType t) {
    switch (t) {
      case FeedbackType.success:
        return Icons.check_circle_outline;
      case FeedbackType.error:
        return Icons.error_outline;
      case FeedbackType.warning:
        return Icons.warning_amber_rounded;
      case FeedbackType.info:
        return Icons.info_outline;
    }
  }

  /// Mappe ApiException / statusCode → message utilisateur FR
  static String humanizeError(Object error, {int? statusCode}) {
    final msg = error.toString();
    if (msg.contains('SocketException') || msg.contains('Failed host lookup') || msg.contains('Connection')) return 'Connexion impossible. Vérifiez votre réseau.';
    if (statusCode == 401) return 'Session expirée. Veuillez vous reconnecter.';
    if (statusCode == 403) return 'Action non autorisée.';
    if (statusCode == 404) return 'Ressource introuvable.';
    if (statusCode == 409) return 'Conflit : cette action a déjà été effectuée.';
    if (statusCode == 413) return 'Fichier trop volumineux.';
    if (statusCode == 422) return 'Données invalides. Vérifiez le formulaire.';
    if (statusCode == 429) return 'Trop de requêtes. Réessayez dans un instant.';
    if (statusCode != null && statusCode >= 500) return 'Erreur serveur. Réessayez plus tard.';
    // Nettoie "Exception: ..." et ApiException message
    final cleaned = msg.replaceFirst(RegExp(r'^.*Exception:\s*'), '').replaceFirst('ApiException: ', '').trim();
    if (cleaned.isEmpty) return 'Une erreur est survenue.';
    if (cleaned.length > 180) return '${cleaned.substring(0, 177)}...';
    return cleaned;
  }
}

/// Message inline (remplace _InlineAuthError dupliqué) — bordure + icône sémantique
class AppInlineMessage extends StatelessWidget {
  const AppInlineMessage({super.key, required this.message, this.type = FeedbackType.error});
  final String message;
  final FeedbackType type;

  @override
  Widget build(BuildContext context) {
    final bg = type == FeedbackType.error
        ? AppColors.error.withValues(alpha: .08)
        : type == FeedbackType.success
            ? AppColors.success.withValues(alpha: .10)
            : type == FeedbackType.warning
                ? const Color(0xFFFFF8E1)
                : AppColors.navy.withValues(alpha: .06);
    final border = type == FeedbackType.error
        ? AppColors.error.withValues(alpha: .20)
        : type == FeedbackType.success
            ? AppColors.success.withValues(alpha: .30)
            : const Color(0xFFFFE082);
    final icon = type == FeedbackType.error
        ? Icons.error_outline
        : type == FeedbackType.success
            ? Icons.check_circle_outline
            : Icons.info_outline;
    final iconColor = type == FeedbackType.error ? AppColors.error : type == FeedbackType.success ? AppColors.success : AppColors.navy;
    final textColor = type == FeedbackType.error ? const Color(0xFF7A1F1F) : type == FeedbackType.success ? const Color(0xFF14532D) : AppColors.text;

    return Semantics(
      label: message,
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: iconColor, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: TextStyle(color: textColor, fontSize: 13, height: 1.35, fontWeight: FontWeight.w600))),
          ],
        ),
      ),
    );
  }
}
