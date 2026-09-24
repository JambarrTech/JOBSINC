import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class HeroBanner extends StatelessWidget {
  const HeroBanner({super.key, required this.assetPath, required this.title, required this.subtitle, this.buttonLabel, this.onPressed, this.height = 248, this.semanticLabel});

  final String assetPath;
  final String title;
  final String subtitle;
  final String? buttonLabel;
  final VoidCallback? onPressed;
  final double height;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.sizeOf(context).width >= 600;
    final resolvedHeight = isTablet ? height + 72 : height;
    return Semantics(
      label: semanticLabel ?? title,
      header: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: SizedBox(
          height: resolvedHeight,
          width: double.infinity,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                assetPath,
                fit: BoxFit.cover,
                semanticLabel: semanticLabel,
                errorBuilder: (_, __, ___) => const ColoredBox(color: AppColors.navy),
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Color(0xE6082B52), Color(0x99082B52), Color(0x22082B52)],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 275),
                      child: Text(title, style: const TextStyle(color: Colors.white, fontSize: 25, height: 1.1, fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(height: 9),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 290),
                      child: Text(subtitle, style: const TextStyle(color: Colors.white, height: 1.35)),
                    ),
                    if (buttonLabel != null && onPressed != null) ...[
                      const SizedBox(height: 16),
                      Semantics(
                        button: true,
                        label: buttonLabel,
                        child: SizedBox(
                          height: 48,
                          child: FilledButton.icon(
                            onPressed: onPressed,
                            icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                            label: Text(buttonLabel!),
                            style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.navy, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
