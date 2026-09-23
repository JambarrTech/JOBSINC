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
import '../../../core/widgets/app_text_field.dart';
import '../../auth/providers/auth_provider.dart';
import '../../candidate/home/candidate_home_screen.dart';
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('CV mis à jour avec succès.'),
            backgroundColor: AppColors.accent,
          ),
        );
      case CvUploadFailure(:final message):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message), backgroundColor: AppColors.error),
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

    final error = await ref
        .read(candidateProfileControllerProvider.notifier)
        .uploadAvatar(file);

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
          backgroundColor: AppColors.accent,
        ),
      );
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
      if (user?.photoUrl?.isNotEmpty != true) 'votre photo',
      if (cvUrl?.isNotEmpty != true) 'votre CV',
      if (!fields[3]) 'votre téléphone',
      if (!fields[4]) 'votre pays',
      if (!fields[5]) 'votre ville',
      if (!fields[8]) 'vos compétences',
    ];
    final hint = missingHints.isEmpty
        ? 'Profil complet : maximisez vos chances auprès des recruteurs !'
        : 'Complétez ${missingHints.take(2).join(' et ')} pour améliorer votre visibilité.';

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        const Text('Mon profil',
            style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppColors.text)),
        const SizedBox(height: 18),

        // ── Carte identité ────────────────────────────────────────────
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
                      backgroundColor: AppColors.primary.withValues(alpha: .12),
                      backgroundImage:
                          user?.photoUrl != null && user!.photoUrl!.isNotEmpty
                              ? CachedNetworkImageProvider(
                                  ApiClient.resolveUrl(user.photoUrl!))
                              : null,
                      child: (user?.photoUrl == null || user!.photoUrl!.isEmpty)
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
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: widget.employee
                              ? AppColors.accent.withValues(alpha: .14)
                              : AppColors.primary.withValues(alpha: .10),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          widget.employee
                              ? 'Collaborateur JOBSINC'
                              : 'Candidat',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: widget.employee
                                ? AppColors.accent
                                : AppColors.primary,
                          ),
                        ),
                      ),
                      if (user?.email.isNotEmpty == true) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(Icons.alternate_email,
                                size: 13, color: AppColors.secondaryText),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                user!.email,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.secondaryText),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Modifier le profil',
                  onPressed: _openEditSheet,
                  icon:
                      const Icon(Icons.edit_outlined, color: AppColors.primary),
                ),
                IconButton(
                  tooltip: 'Paramètres',
                  onPressed: () => context.push('/settings'),
                  icon: const Icon(Icons.settings_outlined,
                      color: AppColors.secondaryText),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // ── Complétion du profil ──────────────────────────────────────
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
                    color: completion >= 80
                        ? AppColors.success
                        : AppColors.primary,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  hint,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.secondaryText),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // ── Statistiques ────────────────────────────────────────────
        const ProfileStatsSection(),
        const SizedBox(height: 14),

        // ── Informations personnelles ─────────────────────────────────
        _ProfileSection(
          title: 'Informations personnelles',
          icon: Icons.person_outline,
          action: IconButton(
            tooltip: 'Modifier les informations',
            onPressed: _openEditSheet,
            icon: const Icon(Icons.edit_outlined,
                size: 20, color: AppColors.primary),
          ),
          child: isFetching && profile == null
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                )
              : Column(
                  children: [
                    _InfoRow(
                        icon: Icons.badge_outlined,
                        label: 'Prénom',
                        value: firstName),
                    _InfoRow(
                        icon: Icons.badge_outlined,
                        label: 'Nom',
                        value: lastName),
                    _InfoRow(
                        icon: Icons.phone_outlined,
                        label: 'Téléphone',
                        value: phone,
                        onTap: phone.isEmpty ? null : () {}),
                    _InfoRow(
                        icon: Icons.public_outlined,
                        label: 'Pays',
                        value: country),
                    _InfoRow(
                        icon: Icons.location_city_outlined,
                        label: 'Ville',
                        value: city),
                  ],
                ),
        ),
        const SizedBox(height: 12),

        // ── Compétences ───────────────────────────────────────────────
        _ProfileSection(
          title: 'Compétences',
          icon: Icons.auto_awesome_outlined,
          action: IconButton(
            tooltip: 'Modifier les compétences',
            onPressed: _openEditSheet,
            icon: const Icon(Icons.edit_outlined,
                size: 20, color: AppColors.primary),
          ),
          child: skills.isEmpty
              ? const Text(
                  'Aucune compétence renseignée.',
                  style:
                      TextStyle(fontSize: 13, color: AppColors.secondaryText),
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

        // ── CV et documents ───────────────────────────────────────────
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
                          fontSize: 13, color: AppColors.secondaryText),
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
                    style: const TextStyle(fontWeight: FontWeight.w600),
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
                  leading: const Icon(Icons.upload_file_outlined,
                      color: AppColors.primary),
                  title: const Text(
                    'Aucun CV ajouté',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: AppColors.secondaryText),
                  ),
                  subtitle: const Text('Ajoutez votre CV pour postuler'),
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

// Ligne d'information : icône + libellé + valeur (ou mention vide).
class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
  });

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
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 17, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: .3,
                        color: AppColors.secondaryText)),
                const SizedBox(height: 2),
                Text(
                  hasValue ? value : 'Non renseigné',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: hasValue
                          ? AppColors.text
                          : AppColors.secondaryText.withValues(alpha: .7)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({
    required this.title,
    required this.icon,
    required this.child,
    this.action,
  });
  final String title;
  final IconData icon;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(icon, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: AppColors.text)),
              ),
              if (action != null) action!,
            ]),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: child,
            ),
          ],
        ),
      ),
    );
  }
}

// Formulaire d'édition affiché en bottom sheet.
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
  late final TextEditingController _firstName =
      TextEditingController(text: widget.initialFirstName);
  late final TextEditingController _lastName =
      TextEditingController(text: widget.initialLastName);
  late final TextEditingController _phone =
      TextEditingController(text: widget.initialPhone);
  late final TextEditingController _country =
      TextEditingController(text: widget.initialCountry);
  late final TextEditingController _city =
      TextEditingController(text: widget.initialCity);
  late final TextEditingController _skills =
      TextEditingController(text: widget.initialSkills);
  late final TextEditingController _experienceYears =
      TextEditingController(text: widget.initialExperienceYears);
  late final TextEditingController _educationLevel =
      TextEditingController(text: widget.initialEducationLevel);
  late final TextEditingController _educationField =
      TextEditingController(text: widget.initialEducationField);
  late final TextEditingController _desiredContracts =
      TextEditingController(text: widget.initialDesiredContracts);
  late final TextEditingController _availableFrom =
      TextEditingController(text: widget.initialAvailableFrom);
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

    // Compétences : nettoyage (trim, dédoublonnage en conservant l'ordre).
    final seen = <String>{};
    final cleanedSkills = _skills.text
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty && seen.add(s.toLowerCase()))
        .toList();

    final experienceYears = int.tryParse(_experienceYears.text.trim());

    setState(() => _saving = true);

    final error = await ref
        .read(candidateProfileControllerProvider.notifier)
        .updateProfile(
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

    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    nav.pop();

    messenger.showSnackBar(
      error != null
          ? SnackBar(content: Text(error), backgroundColor: AppColors.error)
          : const SnackBar(
              content: Text('Profil mis à jour avec succès.'),
              backgroundColor: AppColors.accent,
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Form(
          key: _formKey,
          child: ListView(
            shrinkWrap: true,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Modifier mon profil',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text),
              ),
              const SizedBox(height: 18),
              AppTextField(
                label: 'Prénom',
                controller: _firstName,
                prefixIcon: Icons.badge_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                validator: (v) => Validators.name(v, label: 'Le prénom'),
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Nom',
                controller: _lastName,
                prefixIcon: Icons.badge_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                validator: (v) => Validators.name(v, label: 'Le nom'),
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Téléphone',
                controller: _phone,
                prefixIcon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                validator: Validators.phone,
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Pays',
                controller: _country,
                prefixIcon: Icons.public_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Ville',
                controller: _city,
                prefixIcon: Icons.location_city_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Compétences',
                controller: _skills,
                prefixIcon: Icons.auto_awesome_outlined,
                hintText: 'Ex : Flutter, React, Figma',
                textInputAction: TextInputAction.done,
              ),
              const SizedBox(height: 6),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Séparez vos compétences par des virgules.',
                  style:
                      TextStyle(fontSize: 11, color: AppColors.secondaryText),
                ),
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Expérience (années)',
                controller: _experienceYears,
                prefixIcon: Icons.work_history_outlined,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                hintText: 'Ex : 3',
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Niveau de formation',
                controller: _educationLevel,
                prefixIcon: Icons.school_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                hintText: 'Ex : Bac+2, Licence, Master…',
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Domaine de formation',
                controller: _educationField,
                prefixIcon: Icons.menu_book_outlined,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                hintText: 'Ex : Informatique, Génie logiciel…',
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Contrats recherchés',
                controller: _desiredContracts,
                prefixIcon: Icons.handshake_outlined,
                textInputAction: TextInputAction.next,
                hintText: 'Ex : CDI, CDD, Stage',
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Disponible à partir du',
                controller: _availableFrom,
                prefixIcon: Icons.event_outlined,
                keyboardType: TextInputType.datetime,
                textInputAction: TextInputAction.done,
                hintText: 'AAAA-MM-JJ (vide = non précisé)',
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 48,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_rounded, size: 20),
                  label: Text(_saving ? 'Enregistrement...' : 'Enregistrer'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
