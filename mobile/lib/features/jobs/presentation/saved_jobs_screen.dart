import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/saved_jobs_provider.dart';
import '../widgets/job_feed_card.dart';

/// Liste complète des offres sauvegardées par le candidat.
///
/// Jusqu'ici, la section « Sauvegardées » du fil d'accueil limitait
/// l'affichage aux 3 dernières offres et n'exposait aucun accès à la
/// liste complète. Cet écran comble le manque (l'endpoint
/// `GET /saved-jobs` existait déjà côté backend).
class SavedJobsScreen extends ConsumerWidget {
  const SavedJobsScreen({super.key});

  Future<void> _refresh(WidgetRef ref) {
    ref.invalidate(savedJobsProvider);
    return ref.read(savedJobsProvider.future);
  }

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    SavedJobEntry entry,
  ) async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || entry.job.id == null) return;
    await toggleSavedJob(ApiClient(), token, entry.job.id!);
    if (context.mounted) {
      ref.invalidate(savedJobsProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final savedAsync = ref.watch(savedJobsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        title: const Text(
          'Offres sauvegardées',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: savedAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          error: (error, _) => _MessageState(
            icon: Icons.cloud_off_rounded,
            title: 'Impossible de charger vos offres',
            subtitle: 'Vérifiez votre connexion puis réessayez.',
            actionLabel: 'Réessayer',
            onAction: () => _refresh(ref),
          ),
          data: (entries) {
            if (entries.isEmpty) {
              return _MessageState(
                icon: Icons.bookmark_border_rounded,
                title: 'Aucune offre sauvegardée',
                subtitle:
                    'Touchez le marque-page d\'une offre pour la retrouver ici.',
                actionLabel: 'Parcourir les offres',
                onAction: () => context.push('/jobs'),
              );
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              itemCount: entries.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final entry = entries[index];
                return JobFeedCard(
                  offer: entry.job,
                  onTap: () => context.push(
                    '/jobs/${entry.job.id ?? 'detail'}',
                    extra: entry.job,
                  ),
                  onSave: () => _toggle(context, ref, entry),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _MessageState extends StatelessWidget {
  const _MessageState({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return ListView(
          // Permet au RefreshIndicator de fonctionner même à vide.
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: constraints.maxHeight,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 56, color: AppColors.secondaryText),
                      const SizedBox(height: 16),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        subtitle,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: AppColors.secondaryText,
                          height: 1.4,
                        ),
                      ),
                      if (actionLabel != null && onAction != null) ...[
                        const SizedBox(height: 20),
                        FilledButton.tonal(
                          onPressed: onAction,
                          style: FilledButton.styleFrom(
                            backgroundColor:
                                AppColors.primary.withValues(alpha: .12),
                            foregroundColor: AppColors.primary,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 22,
                              vertical: 10,
                            ),
                          ),
                          child: Text(
                            actionLabel!,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}