import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_feedback.dart';
import '../data/recruiter_provider.dart';

class RecruiterJobsScreen extends ConsumerStatefulWidget {
  const RecruiterJobsScreen({super.key});

  @override
  ConsumerState<RecruiterJobsScreen> createState() => _RecruiterJobsScreenState();
}

class _RecruiterJobsScreenState extends ConsumerState<RecruiterJobsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(recruiterJobsControllerProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(recruiterJobsControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async => ref.read(recruiterJobsControllerProvider.notifier).load(),
        child: controller.when(
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 80),
              const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.secondaryText),
              const SizedBox(height: 12),
              const Text('Impossible de charger les offres.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.secondaryText)),
              const SizedBox(height: 14),
              FilledButton(onPressed: () => ref.read(recruiterJobsControllerProvider.notifier).load(), child: const Text('Réessayer')),
            ],
          ),
          data: (jobs) => CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text('Offres publiées', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.text)),
                      ),
                      FilledButton.icon(
                        onPressed: () => _showCreateJobSheet(context),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text('Publier'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (jobs.isEmpty)
                const SliverFillRemaining(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Column(
                      children: [
                        Icon(Icons.work_outline_rounded, size: 48, color: AppColors.secondaryText),
                        SizedBox(height: 12),
                        Text('Aucune offre publiée.', style: TextStyle(color: AppColors.secondaryText)),
                      ],
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  sliver: SliverList.separated(
                    itemCount: jobs.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, index) => _JobCard(job: jobs[index]),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showCreateJobSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _CreateJobSheet(
        onCreated: () => ref.read(recruiterJobsControllerProvider.notifier).load(),
      ),
    );
  }
}

// ============================================================
// JOB CARD
// ============================================================

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job});
  final dynamic job;

  @override
  Widget build(BuildContext context) {
    final isActive = job.status == 'active';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.background),
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
                  color: AppColors.primary.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.work_outline_rounded, size: 20, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(job.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.text)),
                    const SizedBox(height: 2),
                    Text(
                      [job.contractType, job.location].where((e) => e != null && e.isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, color: AppColors.secondaryText),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (isActive ? AppColors.accent : AppColors.secondaryText).withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(isActive ? 'Active' : 'Inactive', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isActive ? AppColors.accent : AppColors.secondaryText)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _InfoChip(icon: Icons.people_outline_rounded, label: '${job.applicationsCount} candidature${job.applicationsCount > 1 ? 's' : ''}'),
              const SizedBox(width: 10),
              if (job.createdAt != null)
                _InfoChip(icon: Icons.calendar_today_outlined, label: _formatDate(job.createdAt!)),
            ],
          ),
        ],
      ),
    );
  }

  static String _formatDate(DateTime date) {
    final months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.secondaryText),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.secondaryText)),
        ],
      ),
    );
  }
}

// ============================================================
// CREATE JOB SHEET
// ============================================================

class _CreateJobSheet extends ConsumerStatefulWidget {
  const _CreateJobSheet({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_CreateJobSheet> createState() => _CreateJobSheetState();
}

class _CreateJobSheetState extends ConsumerState<_CreateJobSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _departmentCtrl = TextEditingController();
  final _salaryMinCtrl = TextEditingController();
  final _salaryMaxCtrl = TextEditingController();
  String? _selectedContract;
  String? _selectedWorkMode;
  bool _submitting = false;

  static const _contractTypes = ['Temps plein', 'Temps partiel', 'Stage', 'Freelance', 'CDD'];
  static const _workModes = ['Présentiel', 'Télétravail', 'Hybride'];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _locationCtrl.dispose();
    _descriptionCtrl.dispose();
    _skillsCtrl.dispose();
    _departmentCtrl.dispose();
    _salaryMinCtrl.dispose();
    _salaryMaxCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, bottomInset + 20),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              const Text('Nouvelle offre', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.text)),
              const SizedBox(height: 4),
              const Text('Remplissez les informations de l\'offre.', style: TextStyle(fontSize: 13, color: AppColors.secondaryText)),
              const SizedBox(height: 18),
              _Field(label: 'Titre *', controller: _titleCtrl, hint: 'Développeur Flutter', validator: _required),
              const SizedBox(height: 12),
              _Field(label: 'Lieu *', controller: _locationCtrl, hint: 'Paris, France', validator: _required),
              const SizedBox(height: 12),
              _Field(label: 'Description *', controller: _descriptionCtrl, hint: 'Description du poste...', maxLines: 3, validator: _required),
              const SizedBox(height: 12),
              _Field(label: 'Compétences *', controller: _skillsCtrl, hint: 'Flutter, Dart, REST API', validator: _required),
              const SizedBox(height: 12),
              _Field(label: 'Département', controller: _departmentCtrl, hint: 'Technologie'),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _selectedContract,
                decoration: _inputDecoration('Type de contrat *'),
                items: _contractTypes.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: (v) => setState(() => _selectedContract = v),
                validator: (v) => v == null ? 'Champ requis' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _selectedWorkMode,
                decoration: _inputDecoration('Mode de travail'),
                items: _workModes.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: (v) => setState(() => _selectedWorkMode = v),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _Field(label: 'Salaire min.', controller: _salaryMinCtrl, hint: '30000', keyboardType: TextInputType.number)),
                  const SizedBox(width: 10),
                  Expanded(child: _Field(label: 'Salaire max.', controller: _salaryMaxCtrl, hint: '50000', keyboardType: TextInputType.number)),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Publier l\'offre'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null;

  static InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(fontSize: 13, color: AppColors.secondaryText),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.background)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.background)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    final data = <String, dynamic>{
      'title': _titleCtrl.text.trim(),
      'location': _locationCtrl.text.trim(),
      'description': _descriptionCtrl.text.trim(),
      'skills': _skillsCtrl.text.trim(),
    };
    if (_departmentCtrl.text.trim().isNotEmpty) data['department'] = _departmentCtrl.text.trim();
    if (_selectedContract != null) data['contractType'] = _selectedContract;
    if (_selectedWorkMode != null) data['workMode'] = _selectedWorkMode;
    if (_salaryMinCtrl.text.trim().isNotEmpty) data['salaryMin'] = int.tryParse(_salaryMinCtrl.text.trim());
    if (_salaryMaxCtrl.text.trim().isNotEmpty) data['salaryMax'] = int.tryParse(_salaryMaxCtrl.text.trim());

    final error = await ref.read(recruiterJobsControllerProvider.notifier).createJob(data);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error == null) {
      AppFeedback.success(context, 'Offre publiée avec succès.');
      widget.onCreated();
      if (!mounted) return;
      Navigator.of(context).pop();
    } else {
      AppFeedback.error(context, AppFeedback.humanizeError(error));
    }
  }
}

// ============================================================
// SHARED FIELD WIDGET
// ============================================================

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.controller, this.hint, this.maxLines = 1, this.keyboardType, this.validator});

  final String label;
  final TextEditingController controller;
  final String? hint;
  final int maxLines;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.text)),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          validator: validator,
          style: const TextStyle(fontSize: 14, color: AppColors.text),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: AppColors.secondaryText),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.background)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.background)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
            errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.error)),
          ),
        ),
      ],
    );
  }
}
