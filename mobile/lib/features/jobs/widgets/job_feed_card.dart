import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_cached_image.dart';
import '../../../core/widgets/pressable_button.dart';
import '../models/job_offer.dart';
import 'date_helpers.dart';

class JobFeedCard extends StatelessWidget {
  const JobFeedCard({
    super.key,
    required this.offer,
    this.onTap,
    this.onSave,
  });

  final JobOffer offer;
  final VoidCallback? onTap;
  final VoidCallback? onSave;

  static const _contractColors = <String, Color>{
    'stage': AppColors.accent,
    'alternance': AppColors.accent,
    'cdi': AppColors.primary,
    'cdd': AppColors.warning,
    'freelance': Color(0xFF3B8BFF),
    'interim': Color(0xFF0644B0),
    'saisonnier': Color(0xFFF97316),
  };

  Color get _contractColor {
    final key = offer.type.toLowerCase();
    for (final entry in _contractColors.entries) {
      if (key.contains(entry.key)) return entry.value;
    }
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Offre d\'emploi : ${offer.title} chez ${offer.company}',
      button: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.background),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .025),
                blurRadius: 14,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top accent line
              Container(
                height: 3,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      _contractColor.withValues(alpha: .6),
                      _contractColor.withValues(alpha: .15),
                    ],
                  ),
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(18),
                  ),
                ),
              ),

              // Header: company + date + bookmark
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 0),
                child: Row(
                  children: [
                    _CompanyAvatar(
                      logoUrl: offer.companyLogo,
                      name: offer.company,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offer.company.isNotEmpty ? offer.company : 'Entreprise',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5,
                              color: AppColors.text,
                            ),
                          ),
                          if (offer.companySector != null &&
                              offer.companySector!.isNotEmpty)
                            Text(
                              offer.companySector!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppColors.secondaryText,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Text(
                      formatRelativeDate(offer.posted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.secondaryText,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Semantics(
                      label: 'Sauvegarder cette offre',
                      button: true,
                      child: PressableButton(
                        child: IconButton(
                          onPressed: onSave,
                          icon: const Icon(
                            Icons.bookmark_border_rounded,
                            color: AppColors.secondaryText,
                            size: 22,
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 36,
                            minHeight: 36,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Job title
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Text(
                  offer.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                    height: 1.3,
                  ),
                ),
              ),

              // Tags
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    if (offer.type.isNotEmpty)
                      _ContractTag(
                        label: offer.type,
                        color: _contractColor,
                      ),
                    if (offer.location.isNotEmpty)
                      _FeedTag(
                        icon: Icons.location_on_outlined,
                        label: offer.location,
                      ),
                    if (offer.salary != null)
                      _FeedTag(
                        icon: Icons.payments_outlined,
                        label: offer.salary!,
                      ),
                    if (offer.matchScore != null)
                      _MatchTag(score: offer.matchScore!),
                  ],
                ),
              ),

              // Description preview
              if (offer.description != null && offer.description!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                  child: Text(
                    offer.description!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.secondaryText,
                      height: 1.45,
                    ),
                  ),
                ),

              // Action button
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                child: FilledButton.icon(
                  onPressed: onTap,
                  icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                  label: const Text('Voir l\'offre'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(11),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompanyAvatar extends StatelessWidget {
  const _CompanyAvatar({
    required this.logoUrl,
    required this.name,
  });

  final String? logoUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    const size = 36.0;
    // AppCachedImage gère lui-même l'URL vide, le chargement et l'erreur
    // (retombée sur le fallback entreprise).
    return AppCachedImage(
      url: logoUrl,
      width: size,
      height: size,
      borderRadius: BorderRadius.circular(size / 2),
      errorWidget: (_, __, ___) => _fallbackAvatar(),
    );
  }

  Widget _fallbackAvatar() {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: .10),
        shape: BoxShape.circle,
      ),
      child: const Icon(
        Icons.business_outlined,
        color: AppColors.primary,
        size: 18,
      ),
    );
  }
}

class _ContractTag extends StatelessWidget {
  const _ContractTag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: .3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _MatchTag extends StatelessWidget {
  const _MatchTag({required this.score});
  final num score;

  @override
  Widget build(BuildContext context) {
    final color = score >= 80
        ? AppColors.accent
        : score >= 60
            ? AppColors.primary
            : AppColors.secondaryText;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: .3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome_outlined, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            '$score%',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _FeedTag extends StatelessWidget {
  const _FeedTag({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.secondaryText),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.secondaryText,
            ),
          ),
        ],
      ),
    );
  }
}
