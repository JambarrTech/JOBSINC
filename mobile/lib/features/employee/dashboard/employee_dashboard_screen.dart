import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_assets.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_section_screen.dart';
import '../../../core/widgets/app_shell.dart';
import '../../../core/widgets/hero_banner.dart';
import '../../auth/providers/auth_provider.dart';
import '../../messages/presentation/messages_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import '../employment/employment_overview_screen.dart';

class EmployeeDashboardScreen extends ConsumerStatefulWidget {
  const EmployeeDashboardScreen({super.key});

  @override
  ConsumerState<EmployeeDashboardScreen> createState() => _EmployeeDashboardScreenState();
}

class _EmployeeDashboardScreenState extends ConsumerState<EmployeeDashboardScreen> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    final firstName = ref.watch(authProvider).user?.firstName.trim();
    final displayName = firstName == null || firstName.isEmpty ? 'Utilisateur' : firstName;

    return AppShell(currentIndex: tab, onDestinationSelected: (value) => setState(() => tab = value), employee: true, body: _buildBody(displayName));
  }

  Widget _buildBody(String displayName) {
    if (tab == 1) return const EmploymentOverviewScreen();
    if (tab == 2) return const AppSectionScreen(title: 'Documents professionnels', description: 'Retrouvez vos contrats et vos documents de travail.', icon: Icons.folder_outlined);
    if (tab == 3) return const MessagesScreen(isCompanySide: false);
    if (tab == 4) return const ProfileScreen(employee: true);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        Text('Bonjour $displayName 👋', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.text)),
        const SizedBox(height: 6),
        const Text('Voici votre espace professionnel JOBSINC.', style: TextStyle(color: AppColors.secondaryText)),
        const SizedBox(height: 18),
        HeroBanner(assetPath: AppAssets.heroRecruitment, title: 'Félicitations pour cette nouvelle étape', subtitle: 'Votre compte conserve votre parcours et s’adapte à votre expérience professionnelle.', buttonLabel: 'Voir mon emploi', onPressed: () => setState(() => tab = 1), height: 250, semanticLabel: 'Poignée de main lors d’un recrutement'),
        const SizedBox(height: 18),
        Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Emploi actuel', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
          const SizedBox(height: 14),
          const Text('Aucun emploi actif pour le moment.', style: TextStyle(color: AppColors.secondaryText)),
        ]))),
      ],
    );
  }
}
