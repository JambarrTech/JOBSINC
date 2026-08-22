import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../applications/presentation/applications_screen.dart';
import '../../applications/providers/applications_provider.dart';
import '../../jobs/models/job_offer.dart';
import '../../profile/providers/candidate_provider.dart';

class ApplicationFlowScreen extends ConsumerStatefulWidget {
  const ApplicationFlowScreen({super.key, required this.offer});

  final JobOffer offer;

  @override
  ConsumerState<ApplicationFlowScreen> createState() =>
      _ApplicationFlowScreenState();
}

class _ApplicationFlowScreenState
    extends ConsumerState<ApplicationFlowScreen> {
  final _coverLetterController = TextEditingController();
  String? _cvUrl;
  bool _isUploadingCv = false;
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final profile = ref.read(candidateProfileProvider).valueOrNull;
      setState(() {
        _cvUrl = profile?.cvUrl;
      });
    });
  }

  @override
  void dispose() {
    _coverLetterController.dispose();
    super.dispose();
  }

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

    setState(() {
      _isUploadingCv = true;
      _error = null;
    });

    try {
      final cvUrl =
          await ref.read(candidateProfileControllerProvider.notifier).uploadCv(file);
      if (cvUrl == null || cvUrl.startsWith('Erreur') || cvUrl.startsWith('Le serveur') || cvUrl.startsWith('Non connecté')) {
        setState(() {
          _error = cvUrl ?? 'Erreur lors de l\'upload.';
          _isUploadingCv = false;
        });
        return;
      }

      setState(() {
        _cvUrl = cvUrl;
        _isUploadingCv = false;
      });
    } on TimeoutException catch (_) {
      setState(() {
        _error = 'Le serveur met trop de temps à répondre. Vérifiez votre connexion Internet et réessayez.';
        _isUploadingCv = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Erreur lors de l\'upload : $e';
        _isUploadingCv = false;
      });
    }
  }

  bool get _canSubmit {
    return _cvUrl != null &&
        _coverLetterController.text.trim().length >= 100 &&
        !_isUploadingCv &&
        !_isSubmitting;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final success = await ref
          .read(applyProvider.notifier)
          .apply(
            widget.offer.id ?? '',
            cvUrl: _cvUrl,
            coverLetter: _coverLetterController.text.trim(),
          );

      if (!mounted) return;

      if (success) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => const ApplicationSuccessScreen(),
          ),
        );
      } else {
        final applyState = ref.read(applyProvider);
        setState(() {
          _error = applyState.error ?? 'Une erreur est survenue.';
          _isSubmitting = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Erreur : $e';
        _isSubmitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final coverLetterLength = _coverLetterController.text.length;

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
          'Postuler',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.background),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.offer.title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
                if (widget.offer.company.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    widget.offer.company,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.secondaryText,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 20),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.background),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.description_outlined,
                        size: 20, color: AppColors.primary),
                    SizedBox(width: 8),
                    Text(
                      'CV',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
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
                          fontSize: 14,
                          color: AppColors.secondaryText,
                        ),
                      ),
                    ],
                  )
                else if (_cvUrl != null)
                  Row(
                    children: [
                      const Icon(Icons.picture_as_pdf_outlined,
                          color: AppColors.error, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _extractFileName(_cvUrl) ?? 'CV',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.text,
                              ),
                            ),
                            const SizedBox(height: 2),
                            const Text(
                              'CV actuel',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.green,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _pickCv,
                        icon: const Icon(Icons.swap_horiz, size: 18),
                        label: const Text('Changer de CV'),
                      ),
                    ],
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _pickCv,
                      icon: const Icon(Icons.upload_file_outlined, size: 20),
                      label: const Text('Ajouter un CV (PDF, DOC, DOCX)'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.background),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.mail_outline,
                        size: 20, color: AppColors.primary),
                    SizedBox(width: 8),
                    Text(
                      'Lettre de motivation',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _coverLetterController,
                  maxLines: 6,
                  minLines: 4,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText:
                        'Expliquez pourquoi vous êtes intéressé par ce poste et ce que vous pouvez apporter',
                    hintStyle: const TextStyle(
                      fontSize: 14,
                      color: AppColors.secondaryText,
                    ),
                    filled: true,
                    fillColor: AppColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                          color: AppColors.primary, width: 1.5),
                    ),
                    counterText: '',
                  ),
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.text,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      '$coverLetterLength / 100 caractères minimum',
                      style: TextStyle(
                        fontSize: 12,
                        color: coverLetterLength >= 100
                            ? AppColors.green
                            : AppColors.secondaryText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.error.withValues(alpha: .25),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    color: AppColors.error,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.error,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              onPressed: _canSubmit ? _submit : null,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(
                _isSubmitting ? 'Envoi en cours...' : 'Envoyer',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: _canSubmit
                    ? AppColors.primary
                    : AppColors.primary.withValues(alpha: .4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
