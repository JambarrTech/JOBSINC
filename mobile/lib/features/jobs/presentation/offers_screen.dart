import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../models/job_offer.dart';
import '../providers/jobs_provider.dart';
import '../widgets/job_feed_card.dart';

class OffersScreen extends ConsumerStatefulWidget {
  const OffersScreen({
    super.key,
    this.initialQuery = '',
    this.initialLocation = '',
  });

  final String initialQuery;
  final String initialLocation;

  @override
  ConsumerState<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends ConsumerState<OffersScreen> {
  late final TextEditingController _searchController;
  late final TextEditingController _locationController;
  String _selectedContract = 'Tous';
  Timer? _debounce;

  static const _contracts = ['Tous', 'CDI', 'CDD', 'Stage', 'Freelance'];

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: widget.initialQuery);
    _locationController = TextEditingController(text: widget.initialLocation);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() {});
    });
  }

  List<JobOffer> _filter(List<JobOffer> offers) {
    final query = _searchController.text.trim().toLowerCase();
    final location = _locationController.text.trim().toLowerCase();

    // Normalise les types backend variés vers les filtres UI
    String normalizeType(String t) {
      final v = t.toLowerCase();
      if (v.contains('temps plein') || v == 'full_time' || v == 'cdi') return 'cdi';
      if (v.contains('temps partiel') || v == 'part_time') return 'cdi';
      if (v.contains('cdd')) return 'cdd';
      if (v.contains('stage') || v == 'internship') return 'stage';
      if (v.contains('freelance') || v == 'freelance') return 'freelance';
      return v;
    }

    return offers.where((offer) {
      final text = '${offer.title} ${offer.company} ${offer.category}'.toLowerCase();
      final matchQuery = query.isEmpty || text.contains(query);
      final matchLocation = location.isEmpty || offer.location.toLowerCase().contains(location);
      final matchContract = _selectedContract == 'Tous' ||
          normalizeType(offer.type) == _selectedContract.toLowerCase();
      return matchQuery && matchLocation && matchContract;
    }).toList(growable: false);
  }

  bool get _hasFilters =>
      _searchController.text.trim().isNotEmpty ||
      _locationController.text.trim().isNotEmpty ||
      _selectedContract != 'Tous';

  void _clearFilters() {
    _searchController.clear();
    _locationController.clear();
    setState(() => _selectedContract = 'Tous');
  }

  void _openDetail(JobOffer offer) {
    context.push('/jobs/${offer.id ?? 'detail'}', extra: offer);
  }

  @override
  Widget build(BuildContext context) {
    final jobsAsync = ref.watch(jobsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(jobsProvider);
          await ref.read(jobsProvider.future);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              backgroundColor: AppColors.background,
              surfaceTintColor: Colors.transparent,
              title: const Text(
                'Toutes les offres',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                ),
              ),
              actions: [
                if (_hasFilters)
                  TextButton(
                    onPressed: _clearFilters,
                    child: const Text(
                      'Réinitialiser',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
              ],
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
              sliver: SliverList.list(
                children: [
                  _SearchField(
                    controller: _searchController,
                    hint: 'Rechercher un poste',
                    icon: Icons.search_rounded,
                    onChanged: _onSearchChanged,
                  ),
                  const SizedBox(height: 8),
                  _SearchField(
                    controller: _locationController,
                    hint: 'Ville ou localisation',
                    icon: Icons.location_on_outlined,
                    onChanged: _onSearchChanged,
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 38,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _contracts.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final contract = _contracts[index];
                        final selected = _selectedContract == contract;
                        return Semantics(
                          label: 'Filtrer par $contract',
                          selected: selected,
                          button: true,
                          child: ChoiceChip(
                            label: Text(contract),
                            selected: selected,
                            onSelected: (_) => setState(() => _selectedContract = contract),
                            selectedColor: AppColors.primary.withValues(alpha: .14),
                            labelStyle: TextStyle(
                              color: selected ? AppColors.primary : AppColors.secondaryText,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            side: BorderSide(
                              color: selected
                                  ? AppColors.primary.withValues(alpha: .3)
                                  : AppColors.background,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 18),
                  jobsAsync.when(
                    loading: () => const _SkeletonList(),
                    error: (_, __) => _ErrorState(
                      onRetry: () => ref.invalidate(jobsProvider),
                    ),
                    data: (offers) {
                      final filtered = _filter(offers);
                      if (filtered.isEmpty) {
                        return const _EmptyState();
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${filtered.length} opportunité${filtered.length > 1 ? 's' : ''}',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.text,
                            ),
                          ),
                          const SizedBox(height: 14),
                          ...filtered.map(
                            (offer) => Padding(
                              padding: const EdgeInsets.only(bottom: 14),
                              child: JobFeedCard(
                                offer: offer,
                                onTap: () => _openDetail(offer),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// SEARCH FIELD
// ============================================================

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hint,
    required this.icon,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      style: const TextStyle(fontSize: 13.5),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(
          color: AppColors.secondaryText,
          fontSize: 13.5,
        ),
        prefixIcon: Icon(
          icon,
          color: AppColors.secondaryText,
          size: 21,
        ),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Effacer',
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
                icon: const Icon(Icons.close, size: 18),
                color: AppColors.secondaryText,
              ),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
        filled: true,
        fillColor: AppColors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.background),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.background),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }
}

// ============================================================
// EMPTY STATE
// ============================================================

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Icon(
            Icons.search_off_rounded,
            size: 48,
            color: AppColors.secondaryText,
          ),
          SizedBox(height: 12),
          Text(
            'Aucune offre ne correspond à votre recherche.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.secondaryText,
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// SKELETON
// ============================================================

class _SkeletonList extends StatelessWidget {
  const _SkeletonList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        4,
        (_) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Container(
            height: 200,
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// ERROR
// ============================================================

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            size: 48,
            color: AppColors.secondaryText,
          ),
          const SizedBox(height: 12),
          const Text(
            'Impossible de charger les offres.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.secondaryText),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }
}
