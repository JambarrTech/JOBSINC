import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../../core/widgets/app_skeleton.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/candidate_provider.dart';
import '../providers/candidate_stats_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key, this.employee = false});

  final bool employee;

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isUploadingCv = false;
  bool _isUploadingAvatar = false;

  String? _extractFileName(String? url) {
    if (url == null || url.isEmpty) return null;
    final parts = url.split('/');
    final last = parts.isNotEmpty ? parts.last : url;
    final name = Uri.decodeComponent(last);
    final queryIndex = name.indexOf('?');
    return queryIndex > 0 ? name.substring(0, queryIndex) : name;
  }

  Future<void> _pickCv() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'doc', 'docx'],
    );

    // ignore: unnecessary_null_comparison
    if (result == null) return;
    final dynamic dyn = result;
    final files = dyn.files ?? dyn;
    if (files is List && files.isEmpty) return;
    final pickedPath = files.first.path as String?;
    if (pickedPath == null) return;
    final file = File(pickedPath);

    setState(() => _isUploadingCv = true);

    final uploadResult = await ref
        .read(candidateProfileControllerProvider.notifier)
        .uploadCv(file);

    if (!mounted) return;

    setState(() => _isUploadingCv = false);

    switch (uploadResult) {
      case CvUploadSuccess():
        AppFeedback.success(context, 'CV mis à jour avec succès.');
      case CvUploadFailure(:final message):
        AppFeedback.error(context, AppFeedback.humanizeError(message));
    }
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
    );
    if (picked == null) return;

    final file = File(picked.path);
    final size = await file.length();
    if (size > CandidateProfileController.maxImageSizeBytes) {
      if (!mounted) return;
      AppFeedback.error(context, 'L\'image ne doit pas dépasser 15 Mo.');
      return;
    }

    setState(() => _isUploadingAvatar = true);

    final error = await ref
        .read(candidateProfileControllerProvider.notifier)
        .uploadAvatar(file);

    if (!mounted) return;

    setState(() => _isUploadingAvatar = false);

    if (error != null) {
      AppFeedback.error(context, AppFeedback.humanizeError(error));
    } else {
      AppFeedback.success(context, 'Photo de profil mise à jour.');
    }
  }

  void _openEditSheet() {
    final user = ref.read(authProvider).user;
    final profile = ref.read(candidateProfileProvider).valueOrNull;

    String pick(String? a, String? b) =>
        (a?.trim().isNotEmpty == true ? a : b)?.trim() ?? '';

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _ProfileEditSheet(
        initialFirstName: pick(profile?.firstName, user?.firstName),
        initialLastName: pick(profile?.lastName, user?.lastName),
        initialPhone: pick(profile?.phone, user?.phone),
        initialCountry: pick(profile?.country, user?.country),
        initialCity: pick(profile?.city, user?.city),
        initialSkills: pick(profile?.skills, user?.skills),
        initialExperienceYears: profile?.experienceYears?.toString() ?? '',
        initialEducationLevel: profile?.educationLevel ?? '',
        initialEducationField: profile?.educationField ?? '',
        initialDesiredContracts: profile?.desiredContracts ?? '',
        initialAvailableFrom: profile?.availableFrom == null
            ? ''
            : profile!.availableFrom!.toIso8601String().substring(0, 10),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final profileAsync = ref.watch(candidateProfileProvider);
    final profile = profileAsync.valueOrNull;
    final isFetching = profileAsync.isLoading;

    String pick(String? a, String? b) =>
        ((a?.trim().isNotEmpty == true ? a : b) ?? '').trim();

    final firstName = pick(profile?.firstName, user?.firstName);
    final lastName = pick(profile?.lastName, user?.lastName);
    final phone = pick(profile?.phone, user?.phone);
    final country = pick(profile?.country, user?.country);
    final city = pick(profile?.city, user?.city);

    final name =
        [firstName, lastName].where((value) => value.isNotEmpty).join(' ');
    final displayName = name.isEmpty ? 'Utilisateur JOBSINC' : name;
    final initials = displayName
        .split(' ')
        .where((value) => value.isNotEmpty)
        .take(2)
        .map((value) => value[0].toUpperCase())
        .join();

    final cvUrl = profile?.cvUrl ?? user?.cvUrl;
    final skillsRaw = profile?.skills ?? user?.skills;
    final skills = skillsRaw != null && skillsRaw.isNotEmpty
        ? skillsRaw
            .split(',')
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toSet()
            .toList()
        : <String>[];

    final fields = [
      firstName.isNotEmpty,
      lastName.isNotEmpty,
      (user?.email ?? '').isNotEmpty,
      phone.isNotEmpty,
      country.isNotEmpty,
      city.isNotEmpty,
      user?.photoUrl?.isNotEmpty == true,
      cvUrl?.isNotEmpty == true,
      skills.isNotEmpty,
    ];
    final completedFields = fields.where((f) => f).length;
    final completion = (completedFields / fields.length * 100).round();

    final missingHints = <String>[
      if (user?.photoUrl?.isNotEmpty != true) 'photo',
      if (cvUrl?.isNotEmpty != true) 'CV',
      if (!fields[3]) 'téléphone',
      if (!fields[4]) 'pays',
      if (!fields[5]) 'ville',
      if (!fields[8]) 'compétences',
    ];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        ref.invalidate(candidateProfileProvider);
        try {
          await ref.read(candidateProfileProvider.future);
        } catch (_) {}
        ref.invalidate(candidateStatsProvider);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // Header
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Row(
                children: [
                  const Text('Mon profil',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.text)),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Paramètres',
                    onPressed: () => context.push('/settings'),
                    icon: const Icon(Icons.settings_outlined, color: AppColors.secondaryText),
                    style: IconButton.styleFrom(backgroundColor: AppColors.surface, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: AppColors.borderLight))),
                  ),
                ],
              ),
            ),
          ),

          // Hero identity card with gradient
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF0B5FE0), Color(0xFF3B8BFF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: .18), blurRadius: 20, offset: const Offset(0, 8))],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(3),
                                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                                child: CircleAvatar(
                                  radius: 36,
                                  backgroundColor: AppColors.background,
                                  backgroundImage: user?.photoUrl != null && user!.photoUrl!.isNotEmpty
                                      ? CachedNetworkImageProvider(ApiClient.resolveUrl(user.photoUrl!))
                                      : null,
                                  child: (user?.photoUrl == null || user!.photoUrl!.isEmpty)
                                      ? Text(initials, style: const TextStyle(fontSize: 20, color: AppColors.primary, fontWeight: FontWeight.w800))
                                      : null,
                                ),
                              ),
                              Positioned(
                                right: -2,
                                bottom: -2,
                                child: Semantics(
                                  label: 'Modifier la photo de profil',
                                  button: true,
                                  child: GestureDetector(
                                    onTap: _isUploadingAvatar ? null : _pickAvatar,
                                    child: Container(
                                      width: 32,
                                      height: 32,
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: AppColors.primary, width: 2),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .08), blurRadius: 8)],
                                      ),
                                      child: _isUploadingAvatar
                                          ? const Padding(
                                              padding: EdgeInsets.all(7),
                                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                                            )
                                          : const Icon(Icons.camera_alt_rounded, size: 14, color: AppColors.primary),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 4),
                                if (user?.email.isNotEmpty == true)
                                  Row(
                                    children: [
                                      const Icon(Icons.alternate_email, size: 13, color: Colors.white70),
                                      const SizedBox(width: 4),
                                      Flexible(child: Text(user!.email, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70))),
                                    ],
                                  ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(widget.employee ? Icons.verified_user_rounded : Icons.school_rounded, size: 12, color: AppColors.primary),
                                      const SizedBox(width: 4),
                                      Text(widget.employee ? 'Collaborateur' : 'Candidat', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _openEditSheet,
                          icon: const Icon(Icons.edit_outlined, size: 16),
                          label: const Text('Modifier le profil'),
                          style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), padding: const EdgeInsets.symmetric(vertical: 12)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Completion card
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Card(
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: AppColors.borderLight)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 64,
                            height: 64,
                            child: CircularProgressIndicator(
                              value: completion / 100,
                              strokeWidth: 6,
                              backgroundColor: AppColors.borderLight,
                              valueColor: AlwaysStoppedAnimation<Color>(completion >= 80 ? AppColors.success : completion >= 50 ? AppColors.primary : AppColors.warning),
                            ),
                          ),
                          Text('$completion%', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.text)),
                        ],
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Profil complété', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.text, fontSize: 14)),
                            const SizedBox(height: 4),
                            Text(
                              missingHints.isEmpty ? 'Excellent ! Votre profil est complet.' : 'Ajoutez ${missingHints.take(2).join(' et ')} pour booster votre visibilité.',
                              style: const TextStyle(fontSize: 12, color: AppColors.secondaryText, height: 1.35),
                              maxLines: 2,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: missingHints.take(3).map((h) => Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(999), border: Border.all(color: AppColors.borderLight)),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.add_circle_outline, size: 12, color: AppColors.primary),
                                        const SizedBox(width: 4),
                                        Text(h, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText)),
                                      ],
                                    ),
                                  )).toList(),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Quick stats
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: _ProfileStatsCard(employee: widget.employee),
            ),
          ),

          // Personal info
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: _ProfileSection(
                title: 'Informations personnelles',
                icon: Icons.person_outline_rounded,
                action: IconButton(
                  tooltip: 'Modifier',
                  onPressed: _openEditSheet,
                  icon: const Icon(Icons.edit_outlined, size: 18, color: AppColors.primary),
                  style: IconButton.styleFrom(backgroundColor: AppColors.primary.withValues(alpha: .08), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                ),
                child: isFetching && profile == null
                    ? const _InfoSkeleton()
                    : Column(
                        children: [
                          _InfoRow(icon: Icons.badge_outlined, label: 'Prénom', value: firstName),
                          _InfoRow(icon: Icons.badge_outlined, label: 'Nom', value: lastName),
                          _InfoRow(icon: Icons.phone_outlined, label: 'Téléphone', value: phone),
                          _InfoRow(icon: Icons.public_outlined, label: 'Pays', value: country),
                          _InfoRow(icon: Icons.location_city_outlined, label: 'Ville', value: city),
                        ],
                      ),
              ),
            ),
          ),

          // Skills
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: _ProfileSection(
                title: 'Compétences',
                icon: Icons.auto_awesome_outlined,
                action: IconButton(
                  tooltip: 'Modifier',
                  onPressed: _openEditSheet,
                  icon: const Icon(Icons.edit_outlined, size: 18, color: AppColors.primary),
                  style: IconButton.styleFrom(backgroundColor: AppColors.primary.withValues(alpha: .08), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                ),
                child: skills.isEmpty
                    ? _EmptySkills(onEdit: _openEditSheet)
                    : Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: skills.map((s) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                              decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: .08), borderRadius: BorderRadius.circular(999), border: Border.all(color: AppColors.primary.withValues(alpha: .12))),
                              child: Text(s, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary)),
                            )).toList(),
                      ),
              ),
            ),
          ),

          // CV
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              child: _ProfileSection(
                title: 'CV et documents',
                icon: Icons.description_outlined,
                child: _CvCard(
                  cvUrl: cvUrl,
                  fileName: _extractFileName(cvUrl),
                  isUploading: _isUploadingCv,
                  onPick: _pickCv,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileStatsCard extends ConsumerWidget {
  const _ProfileStatsCard({this.employee = false});
  final bool employee;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(candidateStatsProvider);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: AppColors.borderLight)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: statsAsync.when(
          loading: () => const SizedBox(height: 72, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
          error: (_, __) => const Text('Stats indisponibles', style: TextStyle(color: AppColors.secondaryText, fontSize: 12)),
          data: (stats) {
            final items = [
              _StatItem(icon: Icons.send_outlined, label: 'Candidatures', value: '${stats.totalApplications}', color: AppColors.primary),
              _StatItem(icon: Icons.video_call_outlined, label: 'Entretiens', value: '${stats.interviewCount}', color: AppColors.success),
              _StatItem(icon: Icons.bookmark_border, label: 'Sauvegardés', value: '${stats.savedCount}', color: AppColors.warning),
            ];
            return Row(children: items.map((e) => Expanded(child: e)).toList());
          },
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: color.withValues(alpha: .10), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text)),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.secondaryText)),
      ],
    );
  }
}

class _InfoSkeleton extends StatelessWidget {
  const _InfoSkeleton();
  @override
  Widget build(BuildContext context) {
    return Column(children: List.generate(5, (_) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Row(children: [AppSkeleton(width: 34, height: 34, borderRadius: 10), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [AppSkeleton(width: 80, height: 10, borderRadius: 6), SizedBox(height: 6), AppSkeleton(width: double.infinity, height: 12, borderRadius: 6)]))]))));
  }
}

class _EmptySkills extends StatelessWidget {
  const _EmptySkills({required this.onEdit});
  final VoidCallback onEdit;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.borderLight)),
      child: Column(
        children: [
          const Icon(Icons.auto_awesome_outlined, size: 28, color: AppColors.secondaryText),
          const SizedBox(height: 8),
          const Text('Aucune compétence ajoutée', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.text)),
          const SizedBox(height: 4),
          const Text('Ajoutez vos compétences pour matcher les offres', style: TextStyle(fontSize: 12, color: AppColors.secondaryText), textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: onEdit, icon: const Icon(Icons.add_rounded, size: 16), label: const Text('Ajouter'), style: FilledButton.styleFrom(backgroundColor: AppColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)))),
        ],
      ),
    );
  }
}

class _CvCard extends StatelessWidget {
  const _CvCard({required this.cvUrl, required this.fileName, required this.isUploading, required this.onPick});
  final String? cvUrl;
  final String? fileName;
  final bool isUploading;
  final VoidCallback onPick;
  @override
  Widget build(BuildContext context) {
    if (isUploading) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(14)),
        child: const Row(children: [SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)), SizedBox(width: 12), Text('Upload en cours...', style: TextStyle(fontSize: 13, color: AppColors.secondaryText))]),
      );
    }
    if (cvUrl != null && cvUrl!.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.borderLight)),
        child: Row(
          children: [
            Container(width: 42, height: 42, decoration: BoxDecoration(color: AppColors.error.withValues(alpha: .10), borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.picture_as_pdf_rounded, color: AppColors.error)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(fileName ?? 'CV', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis), const Text('CV actuel • PDF/DOC', style: TextStyle(fontSize: 11, color: AppColors.secondaryText))])),
            IconButton(tooltip: 'Changer le CV', onPressed: onPick, icon: const Icon(Icons.swap_horiz_rounded), style: IconButton.styleFrom(backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: AppColors.borderLight)))),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: .06), borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.primary.withValues(alpha: .12))),
      child: Column(
        children: [
          const Icon(Icons.upload_file_rounded, size: 32, color: AppColors.primary),
          const SizedBox(height: 8),
          const Text('Aucun CV ajouté', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('Ajoutez votre CV pour postuler en un clic', style: TextStyle(fontSize: 12, color: AppColors.secondaryText), textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: onPick, icon: const Icon(Icons.add_rounded, size: 16), label: const Text('Importer mon CV'), style: FilledButton.styleFrom(backgroundColor: AppColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)))),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value, this.onTap});
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final hasValue = value.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(width: 34, height: 34, decoration: BoxDecoration(color: hasValue ? AppColors.primary.withValues(alpha: .08) : AppColors.background, borderRadius: BorderRadius.circular(10), border: Border.all(color: hasValue ? AppColors.primary.withValues(alpha: .12) : AppColors.borderLight)), child: Icon(icon, size: 17, color: hasValue ? AppColors.primary : AppColors.secondaryText)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: .3, color: AppColors.secondaryText)), const SizedBox(height: 2), Text(hasValue ? value : 'Non renseigné', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: hasValue ? AppColors.text : AppColors.secondaryText.withValues(alpha: .7)))])),
          if (hasValue && onTap != null) const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.secondaryText),
        ],
      ),
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({required this.title, required this.icon, required this.child, this.action});
  final String title;
  final IconData icon;
  final Widget child;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: AppColors.borderLight)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(width: 32, height: 32, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: .08), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: AppColors.primary, size: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text, fontSize: 14))),
              if (action != null) action!,
            ]),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}

class _ProfileEditSheet extends ConsumerStatefulWidget {
  const _ProfileEditSheet({
    required this.initialFirstName,
    required this.initialLastName,
    required this.initialPhone,
    required this.initialCountry,
    required this.initialCity,
    required this.initialSkills,
    required this.initialExperienceYears,
    required this.initialEducationLevel,
    required this.initialEducationField,
    required this.initialDesiredContracts,
    required this.initialAvailableFrom,
  });

  final String initialFirstName;
  final String initialLastName;
  final String initialPhone;
  final String initialCountry;
  final String initialCity;
  final String initialSkills;
  final String initialExperienceYears;
  final String initialEducationLevel;
  final String initialEducationField;
  final String initialDesiredContracts;
  final String initialAvailableFrom;

  @override
  ConsumerState<_ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends ConsumerState<_ProfileEditSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstName = TextEditingController(text: widget.initialFirstName);
  late final TextEditingController _lastName = TextEditingController(text: widget.initialLastName);
  late final TextEditingController _phone = TextEditingController(text: widget.initialPhone);
  late final TextEditingController _country = TextEditingController(text: widget.initialCountry);
  late final TextEditingController _city = TextEditingController(text: widget.initialCity);
  late final TextEditingController _skills = TextEditingController(text: widget.initialSkills);
  late final TextEditingController _experienceYears = TextEditingController(text: widget.initialExperienceYears);
  late final TextEditingController _educationLevel = TextEditingController(text: widget.initialEducationLevel);
  late final TextEditingController _educationField = TextEditingController(text: widget.initialEducationField);
  late final TextEditingController _desiredContracts = TextEditingController(text: widget.initialDesiredContracts);
  late final TextEditingController _availableFrom = TextEditingController(text: widget.initialAvailableFrom);
  bool _saving = false;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _country.dispose();
    _city.dispose();
    _skills.dispose();
    _experienceYears.dispose();
    _educationLevel.dispose();
    _educationField.dispose();
    _desiredContracts.dispose();
    _availableFrom.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final seen = <String>{};
    final cleanedSkills = _skills.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty && seen.add(s.toLowerCase())).toList();
    final experienceYears = int.tryParse(_experienceYears.text.trim());
    setState(() => _saving = true);
    final error = await ref.read(candidateProfileControllerProvider.notifier).updateProfile(
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          phone: _phone.text.trim(),
          country: _country.text.trim(),
          city: _city.text.trim(),
          skills: cleanedSkills.join(', '),
          experienceYears: experienceYears,
          educationLevel: _educationLevel.text.trim(),
          educationField: _educationField.text.trim(),
          desiredContracts: _desiredContracts.text.trim(),
          availableFrom: DateTime.tryParse(_availableFrom.text.trim()),
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (error != null) {
      AppFeedback.error(context, AppFeedback.humanizeError(error));
    } else {
      AppFeedback.success(context, 'Profil mis à jour avec succès.');
    }
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 12, bottom: MediaQuery.of(context).viewInsets.bottom + 16),
        child: Form(
          key: _formKey,
          child: ListView(
            shrinkWrap: true,
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 14),
              const Text('Modifier mon profil', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text)),
              const SizedBox(height: 4),
              const Text('Vos informations sont visibles par les recruteurs', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.secondaryText)),
              const SizedBox(height: 18),
              _SectionLabel('Identité'),
              AppTextField(label: 'Prénom', controller: _firstName, prefixIcon: Icons.badge_outlined, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next, validator: (v) => Validators.name(v, label: 'Le prénom')),
              const SizedBox(height: 12),
              AppTextField(label: 'Nom', controller: _lastName, prefixIcon: Icons.badge_outlined, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next, validator: (v) => Validators.name(v, label: 'Le nom')),
              const SizedBox(height: 14),
              _SectionLabel('Contact'),
              AppTextField(label: 'Téléphone', controller: _phone, prefixIcon: Icons.phone_outlined, keyboardType: TextInputType.phone, textInputAction: TextInputAction.next, validator: Validators.phone),
              const SizedBox(height: 12),
              Row(children: [Expanded(child: AppTextField(label: 'Pays', controller: _country, prefixIcon: Icons.public_outlined, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next)), const SizedBox(width: 12), Expanded(child: AppTextField(label: 'Ville', controller: _city, prefixIcon: Icons.location_city_outlined, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next))]),
              const SizedBox(height: 14),
              _SectionLabel('Professionnel'),
              AppTextField(label: 'Compétences', controller: _skills, prefixIcon: Icons.auto_awesome_outlined, hintText: 'Ex : Flutter, React, Figma', textInputAction: TextInputAction.next),
              const SizedBox(height: 6),
              const Text('Séparez par des virgules', style: TextStyle(fontSize: 11, color: AppColors.secondaryText)),
              const SizedBox(height: 12),
              Row(children: [Expanded(child: AppTextField(label: 'Expérience (années)', controller: _experienceYears, prefixIcon: Icons.work_history_outlined, keyboardType: TextInputType.number, hintText: '3')), const SizedBox(width: 12), Expanded(child: AppTextField(label: 'Disponible dès', controller: _availableFrom, prefixIcon: Icons.event_outlined, hintText: 'AAAA-MM-JJ'))]),
              const SizedBox(height: 12),
              AppTextField(label: 'Niveau formation', controller: _educationLevel, prefixIcon: Icons.school_outlined, hintText: 'Licence, Master…'),
              const SizedBox(height: 12),
              AppTextField(label: 'Domaine', controller: _educationField, prefixIcon: Icons.menu_book_outlined, hintText: 'Informatique…'),
              const SizedBox(height: 12),
              AppTextField(label: 'Contrats recherchés', controller: _desiredContracts, prefixIcon: Icons.handshake_outlined, hintText: 'CDI, Freelance…'),
              const SizedBox(height: 18),
              SizedBox(height: 48, child: FilledButton.icon(style: FilledButton.styleFrom(backgroundColor: AppColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))), onPressed: _saving ? null : _save, icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_rounded, size: 20), label: Text(_saving ? 'Enregistrement...' : 'Enregistrer'))),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 2),
      child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .6, color: AppColors.primary)),
    );
  }
}
