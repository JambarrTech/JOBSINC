import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/candidate_provider.dart';

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

    if (result.isEmpty) return;

    final file = File(result.first.path!);

    setState(() => _isUploadingCv = true);

    final error =
        await ref.read(candidateProfileControllerProvider.notifier).uploadCv(file);

    if (!mounted) return;

    setState(() => _isUploadingCv = false);

    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: AppColors.error),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('CV mis à jour avec succès.'),
          backgroundColor: AppColors.green,
        ),
      );
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('L\'image ne doit pas dépasser 15 Mo.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _isUploadingAvatar = true);

    final error =
        await ref.read(candidateProfileControllerProvider.notifier).uploadAvatar(file);

    if (!mounted) return;

    setState(() => _isUploadingAvatar = false);

    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: AppColors.error),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Photo de profil mise à jour.'),
          backgroundColor: AppColors.green,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final profileAsync = ref.watch(candidateProfileProvider);
    final profile = profileAsync.valueOrNull;

    final name = [user?.firstName, user?.lastName]
        .whereType<String>()
        .where((value) => value.trim().isNotEmpty)
        .join(' ');
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
            .toList()
        : <String>[];

    final fields = [
      (user?.firstName ?? '').isNotEmpty,
      (user?.lastName ?? '').isNotEmpty,
      (user?.email ?? '').isNotEmpty,
      (user?.phone ?? '').isNotEmpty,
      (user?.country ?? '').isNotEmpty,
      (user?.city ?? '').isNotEmpty,
      user?.photoUrl?.isNotEmpty == true,
      cvUrl?.isNotEmpty == true,
      skills.isNotEmpty,
    ];
    final completedFields = fields.where((f) => f).length;
    final completion = (completedFields / fields.length * 100).round();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        const Text('Mon profil',
            style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppColors.text)),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    CircleAvatar(
                      radius: 32,
                      backgroundColor:
                          AppColors.primary.withValues(alpha: .12),
                      backgroundImage: user?.photoUrl != null &&
                              user!.photoUrl!.isNotEmpty
                          ? NetworkImage(ApiClient.resolveUrl(user.photoUrl!))
                          : null,
                      child: (user?.photoUrl == null ||
                              user!.photoUrl!.isEmpty)
                          ? Text(
                              initials,
                              style: const TextStyle(
                                  fontSize: 20,
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w800),
                            )
                          : null,
                    ),
                    Positioned(
                      right: -4,
                      bottom: -4,
                      child: GestureDetector(
                        onTap: _isUploadingAvatar ? null : _pickAvatar,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                          child: _isUploadingAvatar
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.camera_alt,
                                  size: 14, color: Colors.white),
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
                      Text(
                        displayName,
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.employee
                            ? 'Collaborateur JOBSINC'
                            : 'Candidat en recherche d\'opportunités',
                        style: const TextStyle(
                            color: AppColors.secondaryText),
                      ),
                      if (user?.email.isNotEmpty == true) ...[
                        const SizedBox(height: 4),
                        Text(
                          user!.email,
                          style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.secondaryText),
                        ),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Modifier le profil',
                  onPressed: () => ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(
                    content: Text(
                        'La modification sera reliée au backend.'),
                  )),
                  icon: const Icon(Icons.edit_outlined),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Profil complété',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppColors.text)),
                    Text('$completion %',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary)),
                  ],
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: completion / 100,
                    minHeight: 8,
                    backgroundColor: AppColors.border,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Ajoutez vos expériences et votre CV pour améliorer votre visibilité.',
                  style: TextStyle(
                      fontSize: 12, color: AppColors.secondaryText),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        _ProfileSection(
          title: 'Compétences',
          icon: Icons.auto_awesome_outlined,
          child: skills.isEmpty
              ? const Text(
                  'Aucune compétence renseignée.',
                  style: TextStyle(
                      fontSize: 13, color: AppColors.secondaryText),
                )
              : Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: skills
                      .map((skill) => Chip(
                            label: Text(skill),
                            backgroundColor: AppColors.background,
                            side: BorderSide.none,
                          ))
                      .toList(),
                ),
        ),
        const SizedBox(height: 12),
        _ProfileSection(
          title: 'CV et documents',
          icon: Icons.description_outlined,
          child: Column(
            children: [
              if (_isUploadingCv)
                const Row(
                  children: [
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primary,
                      ),
                    ),
                    SizedBox(width: 12),
                    Text(
                      'Upload en cours...',
                      style: TextStyle(
                          fontSize: 13,
                          color: AppColors.secondaryText),
                    ),
                  ],
                )
              else if (cvUrl != null && cvUrl.isNotEmpty)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.picture_as_pdf_outlined,
                      color: AppColors.error),
                  title: Text(
                    _extractFileName(cvUrl) ?? 'CV',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600),
                  ),
                  subtitle: const Text('CV actuel'),
                  trailing: IconButton(
                    tooltip: 'Changer le CV',
                    onPressed: _pickCv,
                    icon: const Icon(Icons.swap_horiz),
                  ),
                )
              else
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.upload_file_outlined,
                      color: AppColors.primary),
                  title: const Text(
                    'Aucun CV ajouté',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: AppColors.secondaryText),
                  ),
                  subtitle:
                      const Text('Ajoutez votre CV pour postuler'),
                  trailing: IconButton(
                    tooltip: 'Ajouter un CV',
                    onPressed: _pickCv,
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({required this.title, required this.icon, required this.child});
  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [Icon(icon, color: AppColors.primary), const SizedBox(width: 8), Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text))]),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}
