import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class AppLoader extends StatelessWidget {
  const AppLoader({super.key, this.label = 'Chargement en cours'});
  final String label;
  @override
  Widget build(BuildContext context) => Center(child: Semantics(label: label, child: const CircularProgressIndicator(color: AppColors.primary)));
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({super.key, required this.title, this.icon = Icons.inbox_outlined, this.actionLabel, this.onAction});
  final String title;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Center(
        child: Semantics(
          label: title,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 48, color: AppColors.secondaryText),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontFamily: 'Inter', color: AppColors.secondaryText, fontSize: 13), textAlign: TextAlign.center),
            if (actionLabel != null && onAction != null) ...[const SizedBox(height: 16), FilledButton(onPressed: onAction, child: Text(actionLabel!))],
          ]),
        ),
      );
}

class AppErrorState extends StatelessWidget {
  const AppErrorState({super.key, this.onRetry, this.message = 'Une erreur est survenue'});
  final VoidCallback? onRetry;
  final String message;
  @override
  Widget build(BuildContext context) => Center(
        child: Semantics(
          label: message,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.error),
            const SizedBox(height: 12),
            Text(message, style: const TextStyle(fontFamily: 'Inter', color: AppColors.secondaryText), textAlign: TextAlign.center),
            if (onRetry != null) ...[const SizedBox(height: 12), TextButton(onPressed: onRetry, child: const Text('Réessayer'))],
          ]),
        ),
      );
}
