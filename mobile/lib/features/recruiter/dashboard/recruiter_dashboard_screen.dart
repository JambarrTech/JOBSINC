import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_shell.dart';
import '../../auth/providers/auth_provider.dart';
import '../../messages/presentation/messages_screen.dart';
import '../applications/recruiter_applications_screen.dart';
import '../data/recruiter_provider.dart';
import '../../profile/presentation/profile_screen.dart';

class RecruiterDashboardScreen extends ConsumerStatefulWidget {
  const RecruiterDashboardScreen({super.key});

  @override
  ConsumerState<RecruiterDashboardScreen> createState() => _RecruiterDashboardScreenState();
}

class _RecruiterDashboardScreenState extends ConsumerState<RecruiterDashboardScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final firstName = ref.watch(authProvider).user?.firstName.trim();
    final displayName = firstName == null || firstName.isEmpty ? 'Recruteur' : firstName;

    return AppShell(
      currentIndex: _tab,
      onDestinationSelected: (value) => setState(() => _tab = value),
      employee: true,
      body: _buildBody(displayName),
    );
  }

  Widget _buildBody(String displayName) {
    if (_tab == 1) return const RecruiterApplicationsScreen();
    if (_tab == 3) return const MessagesScreen();
    if (_tab == 2 || _tab == 4) return const ProfileScreen(employee: true);

    final dashboard = ref.watch(recruiterDashboardProvider);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(recruiterDashboardProvider),
      child: dashboard.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (error, _) => ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 100),
            const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.secondaryText),
            const SizedBox(height: 12),
            const Text('Impossible de charger le tableau de bord.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.secondaryText)),
            const SizedBox(height: 14),
            FilledButton(onPressed: () => ref.invalidate(recruiterDashboardProvider), child: const Text('Réessayer')),
          ],
        ),
        data: (data) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            Text('Bonjour $displayName', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.text)),
            const SizedBox(height: 4),
            Text(data.company.name.isNotEmpty ? data.company.name : 'Espace recruteur', style: const TextStyle(fontSize: 15, color: AppColors.secondaryText)),
            const SizedBox(height: 22),
            _StatsRow(stats: data.stats),
            if (data.actions.isNotEmpty) ...[
              const SizedBox(height: 22),
              _SectionHeader(title: 'Actions requises', count: data.actions.length),
              const SizedBox(height: 10),
              ...data.actions.map((action) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ActionTile(label: action.label),
              )),
            ],
            const SizedBox(height: 22),
            _SectionHeader(title: 'Offres publiées', count: data.jobs.length, onSeeAll: () => setState(() => _tab = 1)),
            const SizedBox(height: 10),
            if (data.jobs.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('Aucune offre publiée.', style: TextStyle(color: AppColors.secondaryText)),
              )
            else
              ...data.jobs.take(4).map((job) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _JobMiniCard(job: job),
              )),
            const SizedBox(height: 22),
            _SectionHeader(title: 'Dernières candidatures', count: data.applications.length),
            const SizedBox(height: 10),
            if (data.applications.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('Aucune candidature reçue.', style: TextStyle(color: AppColors.secondaryText)),
              )
            else
              ...data.applications.take(4).map((app) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ApplicationMiniCard(application: app),
              )),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// STATS ROW
// ============================================================

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});
  final dynamic stats;

  @override
  Widget build(BuildContext context) {
    final items = [
      (label: 'Offres actives', value: '${stats.activeJobs}', icon: Icons.work_outline_rounded, color: AppColors.primary),
      (label: 'Candidatures', value: '${stats.applications}', icon: Icons.description_outlined, color: AppColors.turquoise),
      (label: 'Entretiens', value: '${stats.interviews}', icon: Icons.videocam_outlined, color: AppColors.warning),
      (label: 'Recrutés', value: '${stats.hired}', icon: Icons.verified_outlined, color: AppColors.green),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: items.map((item) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.background),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(item.icon, size: 20, color: item.color),
            Text(item.value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: item.color)),
            Text(item.label, style: const TextStyle(fontSize: 11, color: AppColors.secondaryText)),
          ],
        ),
      )).toList(),
    );
  }
}

// ============================================================
// SECTION HEADER
// ============================================================

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.count, this.onSeeAll});
  final String title;
  final int? count;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
        if (count != null && count! > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: .1), borderRadius: BorderRadius.circular(10)),
            child: Text('$count', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
          ),
        ],
        const Spacer(),
        if (onSeeAll != null)
          TextButton(onPressed: onSeeAll, child: const Text('Voir tout', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary))),
      ],
    );
  }
}

// ============================================================
// ACTION TILE
// ============================================================

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: .06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: .2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.notifications_active_outlined, size: 18, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: AppColors.text)),
          ),
          const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.secondaryText),
        ],
      ),
    );
  }
}

// ============================================================
// JOB MINI CARD
// ============================================================

class _JobMiniCard extends StatelessWidget {
  const _JobMiniCard({required this.job});
  final dynamic job;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.background),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.work_outline_rounded, size: 18, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(job.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.text)),
                const SizedBox(height: 2),
                Text(
                  [job.contractType, job.location].where((e) => e != null && e.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.secondaryText),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: job.status == 'active' ? AppColors.green.withValues(alpha: .1) : AppColors.secondaryText.withValues(alpha: .1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${job.applicationsCount} postul.',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: job.status == 'active' ? AppColors.green : AppColors.secondaryText),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// APPLICATION MINI CARD
// ============================================================

class _ApplicationMiniCard extends StatelessWidget {
  const _ApplicationMiniCard({required this.application});
  final dynamic application;

  static const _statusColors = <String, Color>{
    'RECEIVED': AppColors.warning,
    'UNDER_REVIEW': AppColors.primary,
    'INTERVIEW': AppColors.primary,
    'ACCEPTED': AppColors.green,
    'REJECTED': AppColors.error,
  };

  @override
  Widget build(BuildContext context) {
    final color = _statusColors[application.status] ?? AppColors.secondaryText;
    final labels = {'RECEIVED': 'Reçue', 'UNDER_REVIEW': 'Examen', 'INTERVIEW': 'Entretien', 'ACCEPTED': 'Acceptée', 'REJECTED': 'Refusée'};

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.background),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.navy.withValues(alpha: .1),
            child: Text(
              application.candidateName.isNotEmpty ? application.candidateName[0].toUpperCase() : '?',
              style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy, fontSize: 14),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(application.candidateName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.text)),
                const SizedBox(height: 2),
                Text(application.jobTitle ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.secondaryText)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(labels[application.status] ?? application.status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
          ),
        ],
      ),
    );
  }
}
