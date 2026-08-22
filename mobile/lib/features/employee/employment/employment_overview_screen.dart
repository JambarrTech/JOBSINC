import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class EmploymentOverviewScreen extends StatelessWidget {
  const EmploymentOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: const [
        Text('Mon emploi', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.text)),
        SizedBox(height: 8),
        Text('Retrouvez les informations liées à votre expérience professionnelle.', style: TextStyle(color: AppColors.secondaryText)),
        SizedBox(height: 20),
        Card(child: Padding(padding: EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Emploi actuel', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
          SizedBox(height: 16),
          Text('Aucun emploi actif pour le moment.', style: TextStyle(color: AppColors.secondaryText)),
        ]))),
        SizedBox(height: 14),
        Card(child: Padding(padding: EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Historique professionnel', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
          SizedBox(height: 14),
          Text('Aucun historique pour le moment.', style: TextStyle(color: AppColors.secondaryText)),
        ]))),
        SizedBox(height: 16),
        Text('Les informations d\'emploi seront synchronisées après confirmation par l\'entreprise.', style: TextStyle(fontSize: 12, color: AppColors.secondaryText)),
      ],
    );
  }
}
