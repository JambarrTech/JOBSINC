import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../auth/models/auth_user.dart';
import '../../auth/providers/auth_provider.dart';

/// Paramètres du compte candidat / collaborateur.
///
/// Premier écran de l'application à exposer une déconnexion : la
/// méthode `signOut()` de l'AuthController n'était appelée nulle part,
/// rendant l'utilisateur incapable de quitter son compte.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _askForgotPassword(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.white,
        title: const Text(
          'Réinitialiser le mot de passe',
          style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.text),
        ),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Adresse e-mail',
            hintText: 'vous@exemple.com',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Envoyer'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (email == null || email.isEmpty || !context.mounted) return;

    final error = await ref
        .read(authProvider.notifier)
        .forgotPassword(email);

    if (!context.mounted) return;
    if (error == null) {
      AppFeedback.success(context, 'Un lien de réinitialisation a été envoyé à $email.');
    } else {
      AppFeedback.error(context, AppFeedback.humanizeError(error));
    }
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.white,
        title: const Text(
          'Se déconnecter ?',
          style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.text),
        ),
        content: const Text(
          'Vous pourrez vous reconnecter à tout moment avec vos identifiants.',
          style: TextStyle(color: AppColors.secondaryText, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authProvider.notifier).signOut();
  }

  String _roleLabel(AccountStatus status) => switch (status) {
        AccountStatus.candidate => 'Candidat',
        AccountStatus.employee => 'Collaborateur',
        AccountStatus.recruiter => 'Recruteur',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;

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
          'Paramètres',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          const Text(
            'Compte',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryText,
            ),
          ),
          const SizedBox(height: 8),
          Card(
            margin: EdgeInsets.zero,
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.person_outline,
                      color: AppColors.primary),
                  title: Text(
                    '${user?.firstName ?? '—'} ${user?.lastName ?? ''}'.trim(),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: AppColors.text),
                  ),
                  subtitle: Text(
                    user?.email ?? '',
                    style: const TextStyle(color: AppColors.secondaryText),
                  ),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.badge_outlined,
                      color: AppColors.secondaryText),
                  title: const Text(
                    'Type de compte',
                    style: TextStyle(color: AppColors.text),
                  ),
                  trailing: Text(
                    user != null ? _roleLabel(user.status) : '',
                    style: const TextStyle(
                      color: AppColors.secondaryText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Sécurité',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryText,
            ),
          ),
          const SizedBox(height: 8),
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: const Icon(Icons.lock_reset_rounded,
                  color: AppColors.primary),
              title: const Text(
                'Mot de passe oublié',
                style: TextStyle(color: AppColors.text),
              ),
              subtitle: const Text(
                'Recevoir un lien de réinitialisation',
                style: TextStyle(color: AppColors.secondaryText),
              ),
              trailing: const Icon(Icons.chevron_right_rounded,
                  color: AppColors.secondaryText),
              onTap: () => _askForgotPassword(context, ref),
            ),
          ),
          const SizedBox(height: 24),
          Card(
            margin: EdgeInsets.zero,
            color: AppColors.error.withValues(alpha: .06),
            child: ListTile(
              leading: const Icon(Icons.logout_rounded, color: AppColors.error),
              title: const Text(
                'Se déconnecter',
                style: TextStyle(
                  color: AppColors.error,
                  fontWeight: FontWeight.w700,
                ),
              ),
              onTap: () => _confirmSignOut(context, ref),
            ),
          ),
        ],
      ),
    );
  }
}