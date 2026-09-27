import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_feedback.dart';
import '../data/recruiter_provider.dart';

class RecruiterApplicationsScreen extends ConsumerStatefulWidget {
  const RecruiterApplicationsScreen({super.key});

  @override
  ConsumerState<RecruiterApplicationsScreen> createState() => _RecruiterApplicationsScreenState();
}

class _RecruiterApplicationsScreenState extends ConsumerState<RecruiterApplicationsScreen> {
  String _filter = 'ALL';

  static const _filters = [
    (value: 'ALL', label: 'Toutes'),
    (value: 'RECEIVED', label: 'Reçues'),
    (value: 'UNDER_REVIEW', label: 'En examen'),
    (value: 'INTERVIEW', label: 'Entretien'),
    (value: 'ACCEPTED', label: 'Acceptées'),
    (value: 'REJECTED', label: 'Refusées'),
  ];

  static const _statusColors = <String, Color>{
    'RECEIVED': AppColors.warning,
    'UNDER_REVIEW': AppColors.primary,
    'INTERVIEW': AppColors.accent,
    'ACCEPTED': AppColors.accent,
    'REJECTED': AppColors.error,
  };

  static const _statusLabels = <String, String>{
    'RECEIVED': 'Reçue',
    'UNDER_REVIEW': 'En examen',
    'INTERVIEW': 'Entretien',
    'ACCEPTED': 'Acceptée',
    'REJECTED': 'Refusée',
  };

  static const _nextStatuses = <String, List<String>>{
    'RECEIVED': ['UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED'],
    'UNDER_REVIEW': ['INTERVIEW', 'ACCEPTED', 'REJECTED'],
    'INTERVIEW': ['ACCEPTED', 'REJECTED'],
    'ACCEPTED': ['REJECTED'],
    'REJECTED': [],
  };

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(recruiterApplicationsControllerProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(recruiterApplicationsControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async => ref.read(recruiterApplicationsControllerProvider.notifier).load(),
        child: controller.when(
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 80),
              const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.secondaryText),
              const SizedBox(height: 12),
              const Text('Impossible de charger les candidatures.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.secondaryText)),
              const SizedBox(height: 14),
              FilledButton(onPressed: () => ref.read(recruiterApplicationsControllerProvider.notifier).load(), child: const Text('Réessayer')),
            ],
          ),
          data: (applications) {
            final filtered = _filter == 'ALL' ? applications : applications.where((a) => a.status == _filter).toList();

            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Expanded(child: Text('Candidatures', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.text))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: .1), borderRadius: BorderRadius.circular(10)),
                              child: Text('${filtered.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        SizedBox(
                          // 44 : le `height: 34` d'origine imposait une zone
                          // de tap de 34 px sur les seules chips de filtre, et
                          // ce `GestureDetector` n'était ni focusable ni
                          // exposé au lecteur d'écran.
                          height: 44,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _filters.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 8),
                            itemBuilder: (_, index) {
                              final f = _filters[index];
                              final selected = _filter == f.value;
                              return Semantics(
                                label: 'Filtrer par ${f.label}',
                                selected: selected,
                                child: GestureDetector(
                                  onTap: () => setState(() => _filter = f.value),
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 200),
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: selected ? AppColors.primary : Colors.white,
                                      borderRadius: BorderRadius.circular(18),
                                      border: Border.all(color: selected ? AppColors.primary : AppColors.background),
                                    ),
                                    child: Text(f.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: selected ? Colors.white : AppColors.text)),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                ),
                ),
                if (filtered.isEmpty)
                  const SliverFillRemaining(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Column(
                        children: [
                          Icon(Icons.inbox_outlined, size: 48, color: AppColors.secondaryText),
                          SizedBox(height: 12),
                          Text('Aucune candidature trouvée.', style: TextStyle(color: AppColors.secondaryText)),
                        ],
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                    sliver: SliverList.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, index) => _ApplicationCard(
                        application: filtered[index],
                        statusColors: _statusColors,
                        statusLabels: _statusLabels,
                        nextStatuses: _nextStatuses,
                        onStatusChanged: (newStatus) async {
                          final error = await ref.read(recruiterApplicationsControllerProvider.notifier).updateStatus(filtered[index].id, newStatus);
                          if (error != null && context.mounted) {
                            AppFeedback.error(context, AppFeedback.humanizeError(error));
                          }
                        },
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ============================================================
// APPLICATION CARD
// ============================================================

// ============================================================
// ALTERNATIVE NON TACTILE AU DRAG-AND-DROP
// ============================================================

/// Action « Déplacer vers <étape suivante> », sans glisser-déposer.
///
/// Le board de candidatures était manipulable par DRAG-AND-DROP seulement. Or
/// un glisser-déposer n'est réalisable ni au doigt, ni à la voix, ni au clavier,
/// ni avec un écran de lecteur d'écran : sur mobile — la seule plateforme de
/// cette app — un recruteur ne pouvait littéralement pas faire avancer une
/// candidature. C'est un perdant fonctionnel, pas une Ergonomie.
///
/// Ce menu expose EXACTEMENT les mêmes transitions que la feuille de détail
/// (`_nextStatuses`), donc il ne déverrouille aucune écriture qui n'était déjà
/// possible. Les statuts sont ceux du backend
/// (`applicationController.updateStatus` : UNDER_REVIEW, INTERVIEW, ACCEPTED,
/// REJECTED), et `RECEIVED` n'est proposé par personne côté Transitions, puisque
/// le backend le refuse en entrée.
class _MoveMenu extends StatelessWidget {
  const _MoveMenu({
    required this.candidateName,
    required this.currentStatusLabel,
    required this.transitions,
    required this.statusColors,
    required this.statusLabels,
    required this.onSelected,
  });

  final String candidateName;
  final String currentStatusLabel;
  final List<String> transitions;
  final Map<String, Color> statusColors;
  final Map<String, String> statusLabels;
  final Future<void> Function(String) onSelected;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      // PAS de `button: true` ici : `PopupMenuButton` fournit déjà son nœud
      // bouton via l'`InkWell` interne. Le remettre ici recréait exactement le
      // « bouton dans un bouton » que `PressableButton` vient d'éliminer.
      label: 'Déplacer la candidature de $candidateName, '
          'actuellement $currentStatusLabel, vers une autre étape',
      child: PopupMenuButton<String>(
        tooltip: 'Déplacer vers une autre étape',
        position: PopupMenuPosition.under,
        onSelected: (status) => onSelected(status),
        itemBuilder: (context) => [
          for (final status in transitions)
            PopupMenuItem<String>(
              value: status,
              // 44 de haut : un `PopupMenuItem` de ~32 est impossible à viser
              // au doigt et échoue aux guidelines d'accessibilité.
              child: Row(
                children: [
                  Icon(
                    _ApplicationCardIcon.forStatus(status),
                    size: 18,
                    color: statusColors[status] ?? AppColors.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Déplacer vers ${statusLabels[status] ?? status}',
                      style: const TextStyle(fontSize: 14, color: AppColors.text),
                    ),
                  ),
                ],
              ),
            ),
        ],
        // Enfant de 44 de haut : le `PopupMenuButton` par défaut rétrécit la
        // zone de tap à la taille du contenu quand il reçoit un `child`.
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.drive_file_move_outlined,
                size: 16,
                color: AppColors.secondaryText,
              ),
              SizedBox(width: 8),
              Text(
                'Déplacer vers…',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.secondaryText,
                ),
              ),
              SizedBox(width: 4),
              Icon(
                Icons.arrow_drop_down_rounded,
                size: 18,
                color: AppColors.secondaryText,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Icône d'étape, extraite de `_ApplicationCard._iconForStatus` pour être
/// réutilisée par le menu sans dupliquer la table.
class _ApplicationCardIcon {
  const _ApplicationCardIcon._();

  static IconData forStatus(String status) {
    switch (status) {
      case 'UNDER_REVIEW':
        return Icons.search_rounded;
      case 'INTERVIEW':
        return Icons.videocam_outlined;
      case 'ACCEPTED':
        return Icons.check_circle_outline;
      case 'REJECTED':
        return Icons.cancel_outlined;
      default:
        return Icons.arrow_forward_rounded;
    }
  }
}

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({
    required this.application,
    required this.statusColors,
    required this.statusLabels,
    required this.nextStatuses,
    required this.onStatusChanged,
  });

  final dynamic application;
  final Map<String, Color> statusColors;
  final Map<String, String> statusLabels;
  final Map<String, List<String>> nextStatuses;
  final Future<void> Function(String) onStatusChanged;

  @override
  Widget build(BuildContext context) {
    final status = application.status as String? ?? 'RECEIVED';
    final color = statusColors[status] ?? AppColors.secondaryText;
    final label = statusLabels[status] ?? status;
    final transitions = nextStatuses[status] ?? const <String>[];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: .25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Zone « ouvrir le détail ». Elle était un `GestureDetector` Nu :
          // ni focusable, ni exposé aux lecteurs d'écran, donc la seule façon
          // d'atteindre la feuille de détail était le doigt. `InkWell` apporte
          // le nœud de sémantique `button` ET le focus clavier (Entrée) — la
          // feuille de détail reste donc accessible sans tactile.
          InkWell(
            onTap: () => _showActions(context, status),
            borderRadius: BorderRadius.circular(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: AppColors.navy.withValues(alpha: .08),
                      child: Text(
                        application.candidateName.toString().isNotEmpty ? application.candidateName.toString()[0].toUpperCase() : '?',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy, fontSize: 15),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            application.candidateName.toString(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.text),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            application.jobTitle?.toString() ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, color: AppColors.secondaryText),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
                    ),
                  ],
                ),
                if (application.date != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 13, color: AppColors.secondaryText),
                      const SizedBox(width: 5),
                      Text(
                        _formatDate(application.date!),
                        style: const TextStyle(fontSize: 12, color: AppColors.secondaryText),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          // Le menu de transition est HORS de l'`InkWell` ci-dessus : les deux
          // sont des cibles tactiles, et les empiler aurait remis deux
          // recognizers concurrents sur la même arène de gestes — le bug
          // exact que `PressableButton` vient de subir.
          if (transitions.isNotEmpty) ...[
            const SizedBox(height: 6),
            const Divider(height: 17),
            _MoveMenu(
              candidateName: application.candidateName.toString(),
              currentStatusLabel: label,
              transitions: transitions,
              statusColors: statusColors,
              statusLabels: statusLabels,
              onSelected: onStatusChanged,
            ),
          ],
        ],
      ),
    );
  }

  void _showActions(BuildContext context, String currentStatus) {
    final actions = nextStatuses[currentStatus] ?? [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.9,
          expand: false,
          builder: (_, scrollController) => ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 16),
              Text(application.candidateName.toString(), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
              if (application.jobTitle != null) ...[
                const SizedBox(height: 4),
                Text(application.jobTitle!, style: const TextStyle(fontSize: 13, color: AppColors.secondaryText)),
              ],
              const SizedBox(height: 20),

              if (application.coverLetter != null && application.coverLetter!.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: .05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.primary.withValues(alpha: .15)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.mail_outline, size: 16, color: AppColors.primary),
                          SizedBox(width: 6),
                          Text('Lettre de motivation', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(application.coverLetter!, style: const TextStyle(fontSize: 13, color: AppColors.text, height: 1.5)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              if (application.cvUrl != null && application.cvUrl!.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.background),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.picture_as_pdf_outlined, size: 20, color: AppColors.error),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('CV', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text)),
                            const SizedBox(height: 2),
                            Text(
                              application.cvUrl!.split('/').last,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, color: AppColors.secondaryText),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.open_in_new_rounded, size: 18, color: AppColors.primary),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              if (actions.isNotEmpty) ...[
                const Divider(height: 1),
                const SizedBox(height: 12),
                const Text('Modifier le statut', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text)),
                const SizedBox(height: 10),
                ...actions.map((status) {
                  final color = statusColors[status] ?? AppColors.primary;
                  final label = statusLabels[status] ?? status;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.of(context).pop();
                          onStatusChanged(status);
                        },
                        icon: Icon(_iconForStatus(status), size: 18, color: color),
                        label: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: color.withValues(alpha: .3)),
                          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static IconData _iconForStatus(String status) =>
      _ApplicationCardIcon.forStatus(status);

  static String _formatDate(DateTime date) {
    final months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }
}
