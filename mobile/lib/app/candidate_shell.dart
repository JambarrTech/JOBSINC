import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/widgets/app_shell.dart';

/// Coquille de l'espace candidat.
///
/// L'onglet actif est piloté par `StatefulNavigationShell` — donc par l'URL —
/// au lieu d'un `int _tab` local au State. Conséquences directes :
///  - la navigation arrière système restaure l'onglet précédent ;
///  - un deep-link ouvre le bon onglet ;
///  - l'état de chaque onglet survit à la reconstruction du widget.
///
/// `StatefulShellRoute.indexedStack` fournit lui-même l'`IndexedStack` (chaque
/// branche possède son propre Navigator, donc son propre état et sa position
/// de défilement) : il suffit de rendre le `navigationShell` comme corps.
class CandidateShell extends StatelessWidget {
  const CandidateShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return AppShell(
      currentIndex: navigationShell.currentIndex,
      onDestinationSelected: (index) {
        // `initialLocation: index == currentIndex` : re-taper sur l'onglet
        // courant le ramène à sa racine, comportement attendu d'une bottom
        // navigation.
        navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        );
      },
      body: navigationShell,
    );
  }
}
