import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../models/job_offer.dart';
import 'job_feed_card.dart';

/// TODO: Supprimer ce fichier legacy — utiliser [JobFeedCard] directement.
/// Conservé uniquement pour éviter de casser les imports existants.
@Deprecated('JobCard est déprécié, utiliser JobFeedCard à la place.')
class JobCard extends StatelessWidget {
  const JobCard({super.key, required this.offer, this.onTap, this.onSave});

  final JobOffer offer;
  final VoidCallback? onTap;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    // Délègue à JobFeedCard pour unifier le design et l'accessibilité.
    return JobFeedCard(
      offer: offer,
      onTap: onTap,
      onSave: onSave,
    );
  }
}

// ignore: unused_element
class _OfferTag extends StatelessWidget {
  const _OfferTag({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 15, color: AppColors.secondaryText), const SizedBox(width: 5), Text(label, style: const TextStyle(fontSize: 12, color: AppColors.secondaryText))]),
      );
}
