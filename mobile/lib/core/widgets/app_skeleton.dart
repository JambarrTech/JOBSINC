// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Boîte grise de base pour les skeletons.
///
/// Utilise [AppColors.borderLight] et un [borderRadius] cohérent avec les
/// cartes (r14/r18). L'effet shimmer est réalisé sans dépendance externe
/// via une animation d'opacité pulsante — fallback statique si l'animation
/// est désactivée.
class AppSkeleton extends StatefulWidget {
  const AppSkeleton({
    super.key,
    this.width,
    this.height,
    this.borderRadius = 8,
    this.circle = false,
    this.color,
  });

  final double? width;
  final double? height;
  final double borderRadius;
  final bool circle;
  final Color? color;

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        color: widget.color ?? AppColors.borderLight,
        borderRadius: widget.circle ? null : BorderRadius.circular(widget.borderRadius),
        shape: widget.circle ? BoxShape.circle : BoxShape.rectangle,
      ),
    );
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        // Pulse 0.5 -> 1.0 -> 0.5
        final opacity = 0.55 + 0.45 * (1 - (_controller.value * 2 - 1).abs());
        return Opacity(opacity: opacity, child: child);
      },
      child: base,
    );
  }
}

/// Skeleton d'une carte d'offre.
///
/// Reprend le même conteneur que [JobFeedCard] : `Container white r18 border
/// p16` avec avatar 36, titre, tags, description 2 lignes et bouton 40.
class JobCardSkeleton extends StatelessWidget {
  const JobCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.background),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header : avatar 36 + titre + tags
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppSkeleton(width: 36, height: 36, circle: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const AppSkeleton(width: 160, height: 14, borderRadius: 6),
                    const SizedBox(height: 8),
                    const AppSkeleton(width: 110, height: 12, borderRadius: 6),
                    const SizedBox(height: 10),
                    Row(
                      children: const [
                        AppSkeleton(width: 62, height: 20, borderRadius: 20),
                        SizedBox(width: 8),
                        AppSkeleton(width: 52, height: 20, borderRadius: 20),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Description 2 lignes
          const AppSkeleton(width: double.infinity, height: 12, borderRadius: 6),
          const SizedBox(height: 8),
          const AppSkeleton(width: 240, height: 12, borderRadius: 6),
          const SizedBox(height: 14),
          // Footer : tag + bouton 40
          Row(
            children: [
              const AppSkeleton(width: 72, height: 22, borderRadius: 20),
              const Spacer(),
              const AppSkeleton(width: 88, height: 36, borderRadius: 12),
            ],
          ),
        ],
      ),
    );
  }
}

/// Liste de [JobCardSkeleton] avec espacement de 12.
///
/// Utilisé comme placeholder pendant le premier chargement ; les reloads
/// ultérieurs conservent le cache via `skipLoadingOnReload`.
class JobCardSkeletonList extends StatelessWidget {
  const JobCardSkeletonList({super.key, this.count = 3});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (_) => const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: JobCardSkeleton(),
        ),
      ),
    );
  }
}

/// Alias pour l'écran candidatures — même visuel que [JobCardSkeletonList].
class ApplicationSkeletonList extends JobCardSkeletonList {
  const ApplicationSkeletonList({super.key, super.count});
}
