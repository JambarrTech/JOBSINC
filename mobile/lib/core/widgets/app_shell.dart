import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Coquille à onglets (bottom navigation) partagée par les espaces candidat,
/// recruteur et employé.
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
    this.employee = false,
    this.recruiter = false,
  });

  final int currentIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget body;
  final bool employee;
  final bool recruiter;

  @override
  Widget build(BuildContext context) {
    final destinations = employee
        ? const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Accueil'),
            NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Emploi'),
            NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: 'Documents'),
            NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Messages'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profil'),
          ]
        : recruiter
            ? const [
                NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Accueil'),
                // Onglet « Offres » : sans lui, `RecruiterJobsScreen` n'était
                // atteignable par aucune route, et le recruteur ne pouvait
                // donc NI consulter NI publier une offre depuis l'application —
                // alors que le repository et le contrôleur existaient et
                // fonctionnaient. Le web, lui, permettait de publier.
                NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Offres'),
                NavigationDestination(icon: Icon(Icons.description_outlined), selectedIcon: Icon(Icons.description), label: 'Candidatures'),
                NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Messages'),
                NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profil'),
              ]
            : const [
                NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Accueil'),
                NavigationDestination(icon: Icon(Icons.description_outlined), selectedIcon: Icon(Icons.description), label: 'Candidatures'),
                NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Messages'),
                NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profil'),
              ];

    // Bornage défensif : garantit un index dans [0, destinations.length).
    final safeIndex =
        currentIndex.clamp(0, destinations.length - 1).toInt();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: body,
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (value) =>
            onDestinationSelected(value.clamp(0, destinations.length - 1)),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primary.withValues(alpha: .08),
        destinations: destinations
            .map(
              (d) => NavigationDestination(
                icon: Semantics(excludeSemantics: true, child: d.icon),
                selectedIcon:
                    Semantics(excludeSemantics: true, child: d.selectedIcon),
                label: d.label,
                tooltip: d.label,
              ),
            )
            .toList(),
      ),
    );
  }
}
