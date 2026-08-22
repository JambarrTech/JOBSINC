import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_assets.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/hero_banner.dart';
import '../../candidate/home/data/home_repository.dart';
import '../providers/applications_provider.dart';

enum _Filter { all, received, interview, accepted, rejected }

class ApplicationsScreen extends ConsumerStatefulWidget {
  const ApplicationsScreen({super.key});

  @override
  ConsumerState<ApplicationsScreen> createState() => _ApplicationsScreenState();
}

class _ApplicationsScreenState extends ConsumerState<ApplicationsScreen> {
  _Filter _filter = _Filter.all;

  @override
  Widget build(BuildContext context) {
    final applicationsAsync = ref.watch(applicationsProvider);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        ref.invalidate(applicationsProvider);
        await ref.read(applicationsProvider.future);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          const Text(
            'Mes candidatures',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Suivez chaque étape de votre parcours professionnel.',
            style: TextStyle(color: AppColors.secondaryText),
          ),
          const SizedBox(height: 18),
          applicationsAsync.when(
            loading: () => const _SkeletonList(),
            error: (error, _) => _ErrorState(
              onRetry: () => ref.invalidate(applicationsProvider),
            ),
            data: (applications) {
              if (applications.isEmpty) return const _EmptyState();
              return _FilteredContent(applications: applications, filter: _filter, onFilterChanged: (f) => setState(() => _filter = f));
            },
          ),
        ],
      ),
    );
  }
}

// ============================================================
// FILTERED CONTENT
// ============================================================

class _FilteredContent extends StatelessWidget {
  const _FilteredContent({required this.applications, required this.filter, required this.onFilterChanged});
  final List<HomeApplication> applications;
  final _Filter filter;
  final ValueChanged<_Filter> onFilterChanged;

  List<HomeApplication> get _filtered {
    switch (filter) {
      case _Filter.all:
        return applications;
      case _Filter.received:
        return applications.where((a) => a.status == 'RECEIVED' || a.status == 'UNDER_REVIEW').toList();
      case _Filter.interview:
        return applications.where((a) => a.status == 'INTERVIEW').toList();
      case _Filter.accepted:
        return applications.where((a) => a.status == 'ACCEPTED').toList();
      case _Filter.rejected:
        return applications.where((a) => a.status == 'REJECTED').toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final counts = {
      _Filter.all: applications.length,
      _Filter.received: applications.where((a) => a.status == 'RECEIVED' || a.status == 'UNDER_REVIEW').length,
      _Filter.interview: applications.where((a) => a.status == 'INTERVIEW').length,
      _Filter.accepted: applications.where((a) => a.status == 'ACCEPTED').length,
      _Filter.rejected: applications.where((a) => a.status == 'REJECTED').length,
    };

    return Column(
      children: [
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: _Filter.values.map((f) {
              final isActive = f == filter;
              final count = counts[f] ?? 0;
              final labels = {_Filter.all: 'Toutes', _Filter.received: 'En cours', _Filter.interview: 'Entretien', _Filter.accepted: 'Acceptée', _Filter.rejected: 'Refusée'};
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text('${labels[f]} ($count)'),
                  selected: isActive,
                  onSelected: (_) => onFilterChanged(f),
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isActive ? Colors.white : AppColors.secondaryText,
                  ),
                  backgroundColor: AppColors.white,
                  side: BorderSide(color: isActive ? AppColors.primary : AppColors.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  showCheckmark: false,
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Column(
              children: [
                Icon(Icons.filter_list_off_rounded, size: 40, color: AppColors.secondaryText.withValues(alpha: .5)),
                const SizedBox(height: 12),
                const Text('Aucune candidature dans cette catégorie.', style: TextStyle(color: AppColors.secondaryText)),
              ],
            ),
          )
        else
          ...filtered.map(
            (app) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _ApplicationCard(application: app),
            ),
          ),
      ],
    );
  }
}

// ============================================================
// APPLICATION CARD
// ============================================================

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({required this.application});
  final HomeApplication application;

  static const _statusColors = <String, Color>{
    'RECEIVED': AppColors.warning,
    'UNDER_REVIEW': AppColors.primary,
    'INTERVIEW': AppColors.turquoise,
    'ACCEPTED': AppColors.green,
    'REJECTED': AppColors.error,
  };

  Color get _statusColor => _statusColors[application.status] ?? AppColors.secondaryText;

  int get _activeStep {
    switch (application.status) {
      case 'RECEIVED':
        return 0;
      case 'UNDER_REVIEW':
        return 1;
      case 'INTERVIEW':
        return 2;
      case 'ACCEPTED':
      case 'REJECTED':
        return 3;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final date = application.createdAt;
    final dateLabel = date != null ? DateFormat('dd/MM/yyyy').format(date) : '';

    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => _ApplicationDetailScreen(application: application)),
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.background),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: .025),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.navy.withValues(alpha: .10),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.business_rounded, color: AppColors.navy, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        application.jobTitle ?? 'Offre',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.text),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              application.companyName ?? 'Entreprise',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: AppColors.secondaryText),
                            ),
                          ),
                          if (application.jobLocation != null && application.jobLocation!.isNotEmpty) ...[
                            const Text(' · ', style: TextStyle(color: AppColors.secondaryText, fontSize: 13)),
                            Flexible(
                              child: Text(
                                application.jobLocation!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12, color: AppColors.secondaryText),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                _StatusBadge(label: application.statusLabel, color: _statusColor),
              ],
            ),
            if (dateLabel.isNotEmpty) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  const Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.secondaryText),
                  const SizedBox(width: 6),
                  Text(
                    'Candidature envoyée le $dateLabel',
                    style: const TextStyle(fontSize: 12, color: AppColors.secondaryText),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            _ApplicationTimeline(activeStep: _activeStep, isRejected: application.status == 'REJECTED'),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// TIMELINE
// ============================================================

class _ApplicationTimeline extends StatelessWidget {
  const _ApplicationTimeline({required this.activeStep, this.isRejected = false});
  final int activeStep;
  final bool isRejected;

  @override
  Widget build(BuildContext context) {
    const labels = ['Envoyée', 'Examen', 'Entretien', 'Décision'];

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(labels.length, (index) {
        final isActive = index <= activeStep;
        final isCurrent = index == activeStep && !isRejected;
        final color = isRejected && index == activeStep
            ? AppColors.error
            : isActive
                ? AppColors.primary
                : AppColors.border;

        return Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                    child: isActive
                        ? Icon(
                            isRejected && index == activeStep ? Icons.close : Icons.check,
                            size: 14,
                            color: Colors.white,
                          )
                        : null,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    labels[index],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 10,
                      color: isActive ? color : AppColors.secondaryText,
                      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
              if (index < labels.length - 1)
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.only(top: 10),
                    height: 2,
                    color: index < activeStep ? AppColors.primary : AppColors.border,
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }
}

// ============================================================
// STATUS BADGE
// ============================================================

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: .3)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

// ============================================================
// APPLICATION DETAIL SCREEN
// ============================================================

class _ApplicationDetailScreen extends StatelessWidget {
  const _ApplicationDetailScreen({required this.application});
  final HomeApplication application;

  int get _activeStep {
    switch (application.status) {
      case 'RECEIVED': return 0;
      case 'UNDER_REVIEW': return 1;
      case 'INTERVIEW': return 2;
      case 'ACCEPTED':
      case 'REJECTED': return 3;
      default: return 0;
    }
  }

  bool _isInterviewFinished(InterviewInfo interview) {
    if (interview.scheduledAt == null) return false;
    final end = interview.scheduledAt!.add(Duration(minutes: interview.duration ?? 60));
    return DateTime.now().isAfter(end);
  }

  @override
  Widget build(BuildContext context) {
    final date = application.createdAt;
    final dateLabel = date != null ? DateFormat('dd MMMM yyyy', 'fr').format(date) : '';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: const Text('Détails', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.text)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.background),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.navy.withValues(alpha: .10),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.business_rounded, color: AppColors.navy, size: 24),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            application.jobTitle ?? 'Offre',
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.text),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            application.companyName ?? 'Entreprise',
                            style: const TextStyle(fontSize: 14, color: AppColors.secondaryText),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (application.jobLocation != null && application.jobLocation!.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 17, color: AppColors.secondaryText),
                      const SizedBox(width: 6),
                      Text(application.jobLocation!, style: const TextStyle(color: AppColors.secondaryText)),
                    ],
                  ),
                ],
                if (dateLabel.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 17, color: AppColors.secondaryText),
                      const SizedBox(width: 6),
                      Text(dateLabel, style: const TextStyle(color: AppColors.secondaryText)),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.background),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Progression', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.text)),
                const SizedBox(height: 16),
                _DetailTimeline(activeStep: _activeStep, isRejected: application.status == 'REJECTED'),
              ],
            ),
          ),
          if (application.status == 'INTERVIEW' && application.interview != null && !_isInterviewFinished(application.interview!)) ...[
            const SizedBox(height: 14),
            _InterviewDetailCard(interview: application.interview!),
          ],
          if (application.coverLetter != null && application.coverLetter!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.background),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Lettre de motivation', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.text)),
                  const SizedBox(height: 12),
                  Text(
                    application.coverLetter!,
                    style: const TextStyle(fontSize: 14, color: AppColors.secondaryText, height: 1.5),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailTimeline extends StatelessWidget {
  const _DetailTimeline({required this.activeStep, this.isRejected = false});
  final int activeStep;
  final bool isRejected;

  static const _steps = [
    (label: 'Candidature reçue', desc: 'Votre candidature a été transmise.', icon: Icons.send_outlined),
    (label: 'En cours d\'examen', desc: 'Le recruteur étudie votre profil.', icon: Icons.search_outlined),
    (label: 'Entretien', desc: 'Entretien planifié avec l\'entreprise.', icon: Icons.videocam_outlined),
    (label: 'Décision', desc: 'Résultat final de votre candidature.', icon: Icons.verified_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(_steps.length, (index) {
        final step = _steps[index];
        final isCompleted = index < activeStep;
        final isCurrent = index == activeStep;
        final color = isCurrent && isRejected
            ? AppColors.error
            : (isCompleted || isCurrent)
                ? AppColors.primary
                : AppColors.border;

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: isCompleted || isCurrent ? color : Colors.transparent,
                    border: Border.all(color: color, width: 2),
                    shape: BoxShape.circle,
                  ),
                  child: isCompleted
                      ? const Icon(Icons.check, size: 18, color: Colors.white)
                      : isCurrent
                          ? Icon(
                              isRejected ? Icons.close : step.icon,
                              size: 16,
                              color: isRejected ? Colors.white : Colors.white,
                            )
                          : null,
                ),
                if (index < _steps.length - 1)
                  Container(
                    width: 2,
                    height: 40,
                    color: isCompleted ? AppColors.primary : AppColors.border,
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w600,
                        color: isCompleted || isCurrent ? AppColors.text : AppColors.secondaryText,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      isCurrent && isRejected ? 'Candidature refusée.' : step.desc,
                      style: TextStyle(
                        fontSize: 12,
                        color: isCurrent && isRejected ? AppColors.error : AppColors.secondaryText,
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}

// ============================================================
// INTERVIEW DETAIL CARD
// ============================================================

class _InterviewDetailCard extends StatelessWidget {
  const _InterviewDetailCard({required this.interview});
  final InterviewInfo interview;

  @override
  Widget build(BuildContext context) {
    final isOnline = interview.isOnline;
    final bgColor = isOnline ? const Color(0xFFF5F3FF) : const Color(0xFFFFFDF5);
    final borderColor = isOnline ? const Color(0xFFDDD6FE) : const Color(0xFFFDE68A);
    final accentColor = isOnline ? AppColors.turquoise : AppColors.warning;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isOnline ? Icons.videocam_outlined : Icons.location_on_outlined, color: accentColor, size: 20),
              const SizedBox(width: 8),
              Text(
                isOnline ? 'Entretien en ligne' : 'Entretien présentiel',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: accentColor),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (interview.scheduledAt != null) ...[
            _InterviewInfoRow(
              icon: Icons.calendar_today_outlined,
              label: DateFormat('EEEE d MMMM yyyy', 'fr').format(interview.scheduledAt!),
            ),
            const SizedBox(height: 8),
            _InterviewInfoRow(
              icon: Icons.schedule_outlined,
              label: 'À ${DateFormat('HH:mm', 'fr').format(interview.scheduledAt!)}${interview.duration != null ? ' — ${interview.duration} min' : ''}',
            ),
          ],
          if (isOnline && interview.streamingUrl != null && interview.streamingUrl!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Lien de connexion', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.secondaryText)),
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () async {
                      final uri = Uri.tryParse(interview.streamingUrl!);
                      if (uri != null && await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      }
                    },
                    child: Text(
                      interview.streamingUrl!,
                      style: TextStyle(fontSize: 13, color: accentColor, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (!isOnline && interview.location != null && interview.location!.isNotEmpty) ...[
            const SizedBox(height: 10),
            _InterviewInfoRow(icon: Icons.place_outlined, label: interview.location!),
          ],
          if (interview.notes != null && interview.notes!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
              child: Text(interview.notes!, style: const TextStyle(fontSize: 13, color: AppColors.secondaryText, height: 1.4)),
            ),
          ],
        ],
      ),
    );
  }
}

class _InterviewInfoRow extends StatelessWidget {
  const _InterviewInfoRow({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.secondaryText),
        const SizedBox(width: 8),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.text))),
      ],
    );
  }
}

// ============================================================
// EMPTY STATE
// ============================================================

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: .08),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.send_outlined, size: 30, color: AppColors.primary),
          ),
          const SizedBox(height: 16),
          const Text(
            'Aucune candidature pour le moment',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          const SizedBox(height: 8),
          const Text(
            'Postulez à une offre pour suivre\nvotre progression ici.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.secondaryText, height: 1.4),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// SKELETON
// ============================================================

class _SkeletonList extends StatelessWidget {
  const _SkeletonList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        3,
        (_) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(
            height: 140,
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// ERROR
// ============================================================

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.secondaryText),
          const SizedBox(height: 12),
          const Text(
            'Impossible de charger vos candidatures.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.secondaryText),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// SUCCESS SCREENS (used by router)
// ============================================================

class ApplicationSuccessScreen extends StatelessWidget {
  const ApplicationSuccessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            const HeroBanner(
              assetPath: AppAssets.heroRecruitment,
              title: 'Candidature envoyée !',
              subtitle: 'Votre candidature a bien été transmise à l\'entreprise.',
              height: 270,
              semanticLabel: 'Poignée de main lors d\'un entretien professionnel',
            ),
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.background),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: .1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.mark_email_read_outlined, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('La prochaine étape ?', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.text)),
                        SizedBox(height: 6),
                        Text(
                          'Vous recevrez une notification dès que l\'entreprise aura consulté votre candidature.',
                          style: TextStyle(color: AppColors.secondaryText, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Suivre ma candidature'),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Voir mes candidatures'),
            ),
          ],
        ),
      ),
    );
  }
}

class RecruitmentConfirmedScreen extends StatelessWidget {
  const RecruitmentConfirmedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            HeroBanner(
              assetPath: AppAssets.heroRecruitment,
              title: 'Félicitations !',
              subtitle: 'Votre parcours professionnel évolue avec JOBSINC.',
              buttonLabel: 'Accéder à mon espace employé',
              onPressed: () => Navigator.of(context).pop(),
              height: 286,
              semanticLabel: 'Poignée de main après une réussite professionnelle',
            ),
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.background),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: .1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.verified_outlined, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Recrutement confirmé', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.text)),
                        SizedBox(height: 6),
                        Text(
                          'Votre statut est mis à jour par le système après confirmation de l\'entreprise. Vous conservez votre compte et l\'historique de vos candidatures.',
                          style: TextStyle(color: AppColors.secondaryText, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
