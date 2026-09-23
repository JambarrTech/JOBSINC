import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_cached_image.dart';
import '../../applications/presentation/application_flow_screen.dart';
import '../../applications/providers/applications_provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/job_offer.dart';
import '../providers/saved_jobs_provider.dart';
import '../providers/similar_jobs_provider.dart';
import '../widgets/job_feed_card.dart';

class JobDetailScreen extends ConsumerStatefulWidget {
  const JobDetailScreen({super.key, required this.offer});

  final JobOffer offer;

  @override
  ConsumerState<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends ConsumerState<JobDetailScreen> {
  bool _isSaved = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(applyProvider.notifier).reset();
        _checkSaved();
      }
    });
  }

  Future<void> _checkSaved() async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || widget.offer.id == null) return;
    try {
      final response = await ApiClient().get(
        '/saved-jobs/check?jobIds=${widget.offer.id}',
        token: token,
      );
      final saved = response['saved'] as Map<String, dynamic>? ?? {};
      if (mounted) setState(() => _isSaved = saved[widget.offer.id] == true);
    } catch (_) {}
  }

  Future<void> _toggleSave() async {
    final token = ref.read(authProvider).user?.token;
    if (token == null || widget.offer.id == null) return;
    final result = await toggleSavedJob(ApiClient(), token, widget.offer.id!);
    if (mounted) {
      setState(() => _isSaved = result);
      ref.invalidate(savedJobsProvider);
    }
  }

  void _confirmApply() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ApplicationFlowScreen(offer: widget.offer),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
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
        title: Text(
          widget.offer.company,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: _toggleSave,
            icon: Icon(
              _isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
              color: _isSaved ? AppColors.primary : AppColors.secondaryText,
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
        children: [
          _CompanyProfileHeader(offer: widget.offer),

          const SizedBox(height: 20),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (widget.offer.location.isNotEmpty)
                  _DetailChip(
                      icon: Icons.location_on_outlined,
                      label: widget.offer.location),
                if (widget.offer.type.isNotEmpty)
                  _DetailChip(
                      icon: Icons.work_outline, label: widget.offer.type),
                if (widget.offer.category.isNotEmpty)
                  _DetailChip(
                      icon: Icons.category_outlined,
                      label: widget.offer.category),
                if (widget.offer.salary != null)
                  _DetailChip(
                      icon: Icons.payments_outlined,
                      label: widget.offer.salary!),
                if (widget.offer.matchScore != null)
                  _DetailChip(
                    icon: Icons.auto_awesome_outlined,
                    label: '${widget.offer.matchScore}% compatible',
                  ),
              ],
            ),
          ),

          if (widget.offer.description != null &&
              widget.offer.description!.isNotEmpty) ...[
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _SectionBlock(
                title: 'Description du poste',
                child: Text(
                  widget.offer.description!,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.text,
                    height: 1.6,
                  ),
                ),
              ),
            ),
          ],

          if (widget.offer.companyDescription != null ||
              widget.offer.companySector != null ||
              widget.offer.companyLocation != null) ...[
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _SectionBlock(
                title: 'À propos de l\'entreprise',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.offer.companyDescription != null &&
                        widget.offer.companyDescription!.isNotEmpty)
                      Text(
                        widget.offer.companyDescription!,
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppColors.text,
                          height: 1.6,
                        ),
                      ),
                    if (widget.offer.companyDescription != null &&
                        widget.offer.companyDescription!.isNotEmpty)
                      const SizedBox(height: 16),
                    _CompanyInfoRow(
                      icon: Icons.business_outlined,
                      label: 'Secteur',
                      value: widget.offer.companySector ?? 'Non renseigné',
                    ),
                    if (widget.offer.companyLocation != null) ...[
                      const SizedBox(height: 10),
                      _CompanyInfoRow(
                        icon: Icons.location_on_outlined,
                        label: 'Localisation',
                        value: widget.offer.companyLocation!,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],

          const SizedBox(height: 28),

          // Offres similaires
          if (widget.offer.id != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _SimilarJobsSection(jobId: widget.offer.id!),
            ),

          const SizedBox(height: 20),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: _confirmApply,
                icon: const Icon(Icons.send_outlined),
                label: const Text(
                  'Postuler',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// COMPANY PROFILE HEADER
// ============================================================

class _CompanyProfileHeader extends StatelessWidget {
  const _CompanyProfileHeader({required this.offer});
  final JobOffer offer;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.white,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        children: [
          AppCachedImage(
            url: offer.companyLogo,
            width: 80,
            height: 80,
            borderRadius: BorderRadius.circular(20),
            errorWidget: (_, __, ___) => _logoFallback(),
          ),

          const SizedBox(height: 16),

          Text(
            offer.company,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),

          if (offer.companySector != null &&
              offer.companySector!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                offer.companySector!,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
          ],

          if (offer.companyLocation != null &&
              offer.companyLocation!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.location_on_outlined,
                    size: 16, color: AppColors.secondaryText),
                const SizedBox(width: 4),
                Text(
                  offer.companyLocation!,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.secondaryText,
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: 18),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              offer.title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _logoFallback() {
    return Container(
      width: 80,
      height: 80,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Icon(
        Icons.business_outlined,
        color: AppColors.primary,
        size: 36,
      ),
    );
  }
}

// ============================================================
// SECTION BLOCK
// ============================================================

class _SectionBlock extends StatelessWidget {
  const _SectionBlock({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
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
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

// ============================================================
// COMPANY INFO ROW
// ============================================================

class _CompanyInfoRow extends StatelessWidget {
  const _CompanyInfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.secondaryText),
        const SizedBox(width: 10),
        Text(
          '$label : ',
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.secondaryText,
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
        ),
      ],
    );
  }
}

// ============================================================
// DETAIL CHIP
// ============================================================

class _DetailChip extends StatelessWidget {
  const _DetailChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.background),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.primary),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// SIMILAR JOBS SECTION
// ============================================================

class _SimilarJobsSection extends ConsumerWidget {
  const _SimilarJobsSection({required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similar = ref.watch(similarJobsProvider(jobId));
    return similar.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        if (data.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
                  const Text(
                    'Offres similaires',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${data.length} offre${data.length > 1 ? 's' : ''} correspondant à ton profil',
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.secondaryText,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ...data.take(3).map(
                    (offer) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: JobFeedCard(
                        offer: offer,
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => JobDetailScreen(offer: offer),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
