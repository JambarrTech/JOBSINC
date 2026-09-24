import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class AppButton extends StatelessWidget {
  const AppButton({super.key, required this.label, required this.onPressed, this.outline = false, this.icon, this.loading = false, this.semanticLabel});
  final String label;
  final VoidCallback? onPressed;
  final bool outline;
  final IconData? icon;
  final bool loading;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
        : Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)], Text(label)]);
    final button = SizedBox(
      width: double.infinity,
      height: 52,
      child: outline
          ? OutlinedButton(
              onPressed: loading ? null : onPressed,
              style: OutlinedButton.styleFrom(foregroundColor: AppColors.primary, side: const BorderSide(color: AppColors.primary), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              child: child)
          : FilledButton(
              onPressed: loading ? null : onPressed,
              style: FilledButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              child: child),
    );
    return Semantics(button: true, label: semanticLabel ?? label, child: button);
  }
}
