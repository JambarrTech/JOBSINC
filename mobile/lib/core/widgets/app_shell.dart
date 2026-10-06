import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Coquille à onglets (bottom navigation) partagée par les espaces candidat
/// et recruteur. Il n'y a pas d'espace employé dans le mobile.
///
/// Le nombre d'onglets dépend du rôle. `currentIndex` était appliqué tel quel à
/// `NavigationBar.selectedIndex` : une valeur hors plage (obtenue après un
/// changement de rôle, ou par un parent qui passe un index statique) faisait
/// lever une assertion dans `NavigationBar`. On borne désormais l'index.
class AppShell extends StatelessWidget {
  const AppShell({
    super.key,
    required this.currentIndex,
    required this.onDestinationSelected,
    required this.body,
    this.recruiter = false,
  });

  final int currentIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget body;
  final bool recruiter;

  @override
  Widget build(BuildContext context) {
    // Anti-débordement : `Candidatures` (12 lettres) + 4 autres libellés ne
    // tiennent pas sur 320-360 px avec le scale système à 1.0, et encore moins
    // en gros caractères. On bascule sur des libellés courts en écran étroit
    // ou en texte agrandi, et on borne le scale du seul `NavigationBar` à 1.2
    // (le reste de l'app suit toujours le réglage d'accessibilité).
    final width = MediaQuery.sizeOf(context).width;
    final textScale = MediaQuery.textScalerOf(context).scale(12) / 12;
    final compact = width < 380 || textScale > 1.15;
    final clampedScaler = TextScaler.linear(textScale.clamp(1.0, 1.2));

    // (icône, icône sélectionnée, libellé large, libellé compact).
    final tabs = recruiter
        ? const [
            (Icons.dashboard_outlined, Icons.dashboard, 'Accueil', 'Accueil'),
            // Onglet « Offres » : sans lui, `RecruiterJobsScreen` n'était
            // atteignable par aucune route, et le recruteur ne pouvait
            // donc NI consulter NI publier une offre depuis l'application —
            // alors que le repository et le contrôleur existaient et
            // fonctionnaient. Le web, lui, permettait de publier.
            (Icons.work_outline, Icons.work, 'Offres', 'Offres'),
            (
              Icons.description_outlined,
              Icons.description,
              'Candidatures',
              'Suivi',
            ),
            (
              Icons.chat_bubble_outline,
              Icons.chat_bubble,
              'Messages',
              'Messages',
            ),
            (Icons.person_outline, Icons.person, 'Profil', 'Profil'),
          ]
        : const [
            (Icons.home_outlined, Icons.home, 'Accueil', 'Accueil'),
            (
              Icons.description_outlined,
              Icons.description,
              'Candidatures',
              'Suivi',
            ),
            (Icons.people_outline, Icons.people, 'Réseau', 'Réseau'),
            (
              Icons.chat_bubble_outline,
              Icons.chat_bubble,
              'Messages',
              'Messages',
            ),
            (Icons.person_outline, Icons.person, 'Profil', 'Profil'),
          ];

    // Indicateur compact 44x24 : la pastille M3 par défaut (64x32)
    // est trop large sur 5 onglets — voir capture.
    final destinations = [
      for (final tab in tabs)
        NavigationDestination(
          icon: Semantics(
            excludeSemantics: true,
            child: SizedBox(height: 24, child: Icon(tab.$1, size: 20)),
          ),
          selectedIcon: Semantics(
            excludeSemantics: true,
            child: Container(
              width: 44,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(tab.$2, size: 20, color: AppColors.primary),
            ),
          ),
          label: compact ? tab.$4 : tab.$3,
          tooltip: tab.$3,
        ),
    ];

    // Bornage défensif : garantit un index dans [0, destinations.length).
    final safeIndex = currentIndex.clamp(0, destinations.length - 1).toInt();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: body,
          ),
        ),
      ),
      bottomNavigationBar: MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: clampedScaler),
        // Barre dockee en bas (non flottante), hauteur reduite a 48.
        // `bottom: false` + padding manuel de 2px : le SafeArea complet
        // ajoutait tout l'inset système (~16-24px) sous la barre.
        child: SafeArea(
          top: false,
          bottom: false,
          minimum: EdgeInsets.zero,
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).padding.bottom > 0 ? 4 : 2,
            ),
            child: DecoratedBox(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(
                  top: BorderSide(color: AppColors.borderLight, width: 1),
                ),
              ),
              child: NavigationBar(
                height: 48,
                selectedIndex: safeIndex,
                onDestinationSelected: (value) => onDestinationSelected(
                  value.clamp(0, destinations.length - 1),
                ),
                backgroundColor: AppColors.surface,
                elevation: 0,
                indicatorColor: Colors.transparent,
                indicatorShape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: destinations,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
