import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_shell.dart';
import '../../applications/presentation/applications_screen.dart';
import '../../auth/providers/auth_provider.dart';
import '../../jobs/models/job_offer.dart';
import '../../jobs/presentation/job_detail_screen.dart';
import '../../jobs/presentation/offers_screen.dart';
import '../../jobs/widgets/job_feed_card.dart';
import '../../messages/presentation/messages_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import 'data/home_repository.dart';
import 'providers/home_provider.dart';

class CandidateHomeScreen extends ConsumerStatefulWidget {
  const CandidateHomeScreen({super.key});

  @override
  ConsumerState<CandidateHomeScreen> createState() =>
      _CandidateHomeScreenState();
}

class _CandidateHomeScreenState extends ConsumerState<CandidateHomeScreen> {
  final _searchController = TextEditingController();
  final _locationController = TextEditingController();

  int _tab = 0;

  @override
  void dispose() {
    _searchController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _submitSearch() {
    final query = _searchController.text.trim();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OffersScreen(
          initialQuery: query,
          initialLocation: _locationController.text,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      currentIndex: _tab,
      onDestinationSelected: (value) {
        setState(() => _tab = value);
      },
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_tab == 1) {
      return const ApplicationsScreen();
    }

    if (_tab == 2) {
      return const MessagesScreen(isCompanySide: false);
    }

    if (_tab == 3) {
      return const ProfileScreen();
    }

    final user = ref.watch(authProvider).user;
    final token = user?.token;

    if (token == null || token.isEmpty) {
      return _HomeLoadError(
        onRetry: () {},
      );
    }

    final dashboard = ref.watch(
      homeDashboardProvider(token),
    );

    return RefreshIndicator(
      onRefresh: () => ref.refresh(homeDashboardProvider(token).future),
      child: dashboard.when(
        loading: () => const HomeSkeleton(),
        error: (error, _) => _HomeLoadError(
          offline: error is SocketException,
          onRetry: () {
            ref.invalidate(homeDashboardProvider(token));
          },
        ),
        data: (data) => _HomeContent(
          firstName: user?.firstName,
          photoUrl: user?.photoUrl,
          data: data,
          searchController: _searchController,
          onSearchSubmit: _submitSearch,
          onOpenProfile: () => setState(() => _tab = 3),
        ),
      ),
    );
  }
}

// ============================================================
// HOME CONTENT
// ============================================================

class _HomeContent extends StatelessWidget {
  const _HomeContent({
    this.firstName,
    this.photoUrl,
    required this.data,
    required this.searchController,
    required this.onSearchSubmit,
    required this.onOpenProfile,
  });

  final String? firstName;
  final String? photoUrl;
  final HomeDashboardData data;
  final TextEditingController searchController;
  final VoidCallback onSearchSubmit;
  final VoidCallback onOpenProfile;

  void _openJobDetail(BuildContext context, JobOffer offer) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => JobDetailScreen(offer: offer)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        HomeHeader(
          firstName: firstName,
          photoUrl: photoUrl,
          searchController: searchController,
          onSearchSubmit: onSearchSubmit,
          onProfileTap: onOpenProfile,
          onNotificationsTap: () {
            context.push('/candidate/notifications');
          },
        ),

        const SizedBox(height: 20),

        if (data.jobs.isNotEmpty) ...[
          _SectionHeader(
            title: 'Offres recommandées',
            subtitle: 'Basé sur ton profil',
            actionLabel: 'Voir tout',
            filledAction: true,
            onAction: onSearchSubmit,
          ),
          const SizedBox(height: 12),
          ...data.jobs.take(2).map(
                (offer) => Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: JobFeedCard(
                    offer: offer,
                    onTap: () => _openJobDetail(context, offer),
                  ),
                ),
              ),
        ],

        if (data.jobs.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 40),
            child: EmptyState(
              icon: Icons.work_outline_rounded,
              message: 'Aucune offre pour le moment.',
              actionLabel: 'Explorer les offres',
              onAction: onSearchSubmit,
            ),
          ),

        const SizedBox(height: 18),
      ],
    );
  }
}

// ============================================================
// HEADER
// ============================================================

class HomeHeader extends StatefulWidget {
  const HomeHeader({
    super.key,
    this.firstName,
    this.photoUrl,
    required this.searchController,
    this.onSearchSubmit,
    required this.onProfileTap,
    this.onNotificationsTap,
  });

  final String? firstName;
  final String? photoUrl;
  final TextEditingController searchController;
  final VoidCallback? onSearchSubmit;
  final VoidCallback onProfileTap;
  final VoidCallback? onNotificationsTap;

  @override
  State<HomeHeader> createState() => _HomeHeaderState();
}

class _HomeHeaderState extends State<HomeHeader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animController;
  late final Animation<double> _fadeGreeting;
  late final Animation<double> _fadeSearch;
  late final Animation<Offset> _slideGreeting;
  late final Animation<Offset> _slideSearch;
  bool _showSearch = false;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    _fadeGreeting = Tween<double>(begin: 1, end: 0).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    _fadeSearch = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    _slideGreeting = Tween<Offset>(
      begin: Offset.zero,
      end: const Offset(0, -0.4),
    ).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    _slideSearch = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );

    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() => _showSearch = true);
        _animController.forward();
      }
    });
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  String get _initials {
    final name = widget.firstName?.trim();
    if (name == null || name.isEmpty) return '?';
    final parts = name.split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.firstName?.trim();
    final displayName = (name != null && name.isNotEmpty) ? name : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Semantics(
              label: 'Profil utilisateur',
              button: true,
              child: InkWell(
                onTap: widget.onProfileTap,
                borderRadius: BorderRadius.circular(26),
                child: _UserAvatar(
                  photoUrl: widget.photoUrl,
                  initials: _initials,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SizedBox(
                height: 48,
                child: Stack(
                  children: [
                    if (displayName != null && !_showSearch)
                      FadeTransition(
                        opacity: _fadeGreeting,
                        child: SlideTransition(
                          position: _slideGreeting,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Bonjour, $displayName',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.text,
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (_showSearch)
                      FadeTransition(
                        opacity: _fadeSearch,
                        child: SlideTransition(
                          position: _slideSearch,
                          child: Semantics(
                            label: 'Barre de recherche d\'emplois',
                            child: TextField(
                              controller: widget.searchController,
                              textInputAction: TextInputAction.search,
                              onSubmitted: (_) => widget.onSearchSubmit?.call(),
                              style: const TextStyle(fontSize: 13.5),
                              decoration: InputDecoration(
                                hintText: 'Rechercher un poste',
                                hintStyle: const TextStyle(
                                  color: AppColors.secondaryText,
                                  fontSize: 13.5,
                                ),
                                prefixIcon: const Icon(
                                  Icons.search_rounded,
                                  color: AppColors.secondaryText,
                                  size: 21,
                                ),
                                suffixIcon: Semantics(
                                  label: 'Filtrer les résultats',
                                  child: const Icon(
                                    Icons.tune_rounded,
                                    color: AppColors.secondaryText,
                                    size: 18,
                                  ),
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
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            _HeaderIconButton(
              icon: Icons.notifications_none_rounded,
              tooltip: 'Notifications',
              onPressed: widget.onNotificationsTap,
            ),
          ],
        ),
      ],
    );
  }
}

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({this.photoUrl, required this.initials});
  final String? photoUrl;
  final String initials;

  @override
  Widget build(BuildContext context) {
    if (photoUrl != null && photoUrl!.isNotEmpty) {
      return Container(
        width: 50,
        height: 50,
        decoration: const BoxDecoration(shape: BoxShape.circle),
        child: ClipOval(
          child: Image.network(
            ApiClient.resolveUrl(photoUrl!),
            width: 50,
            height: 50,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _initialsAvatar(),
          ),
        ),
      );
    }
    return _initialsAvatar();
  }

  Widget _initialsAvatar() {
    return Container(
      width: 50,
      height: 50,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.navy],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.background),
      ),
      child: Semantics(
        label: tooltip,
        button: true,
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon, color: AppColors.text),
        ),
      ),
    );
  }
}

// ============================================================
// SECTION HEADER
// ============================================================

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.filledAction = false,
    this.onAction,
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final bool filledAction;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                  if (subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.secondaryText,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (actionLabel != null)
              filledAction
                  ? FilledButton.tonal(
                      onPressed: onAction,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 36),
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        backgroundColor: AppColors.primary.withValues(alpha: .10),
                        foregroundColor: AppColors.primary,
                      ),
                      child: Text(
                        actionLabel!,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    )
                  : TextButton(
                      onPressed: onAction,
                      child: Text(
                        actionLabel!,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
          ],
        ),
      ],
    );
  }
}

// ============================================================
// PRESSABLE BUTTON
// ============================================================

class _PressableButton extends StatefulWidget {
  const _PressableButton({required this.child});
  final Widget child;

  @override
  State<_PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<_PressableButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Opacity(
          opacity: _pressed ? 0.8 : 1.0,
          child: widget.child,
        ),
      ),
    );
  }
}

// ============================================================
// COMPANIES
// ============================================================

class CompanyFeedCard extends StatelessWidget {
  const CompanyFeedCard({
    super.key,
    required this.company,
    required this.onViewOffers,
  });

  final HomeCompany company;
  final VoidCallback onViewOffers;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Entreprise : ${company.name}',
      button: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.background),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CompanyAvatar(
              logoUrl: company.logoUrl,
              name: company.name,
              size: 48,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    company.name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                  if (company.sector != null && company.sector!.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      company.sector!,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.secondaryText,
                      ),
                    ),
                  ],
                  if (company.location != null && company.location!.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 14,
                          color: AppColors.secondaryText,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            company.location!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.secondaryText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (company.openOffersCount > 0) ...[
                    const SizedBox(height: 6),
                    Text(
                      '${company.openOffersCount} offre${company.openOffersCount > 1 ? 's' : ''} ouverte${company.openOffersCount > 1 ? 's' : ''}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  _PressableButton(
                    child: OutlinedButton(
                      onPressed: onViewOffers,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(34),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        side: const BorderSide(color: AppColors.primary),
                      ),
                      child: const Text('Voir les offres'),
                    ),
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

class _CompanyAvatar extends StatelessWidget {
  const _CompanyAvatar({this.logoUrl, required this.name, this.size = 48});
  final String? logoUrl;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (logoUrl != null && logoUrl!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size / 2),
        child: Image.network(
          ApiClient.resolveUrl(logoUrl!),
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _fallback(),
        ),
      );
    }
    return _fallback();
  }

  Widget _fallback() {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: .10),
        shape: BoxShape.circle,
      ),
      child: Icon(
        Icons.business_outlined,
        color: AppColors.primary,
        size: size * 0.45,
      ),
    );
  }
}

// ============================================================
// EMPTY / LOADING / ERROR
// ============================================================

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: 24,
      ),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppColors.background,
        ),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            size: 30,
            color: AppColors.secondaryText,
          ),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.secondaryText,
              height: 1.4,
            ),
          ),
          if (actionLabel != null && onAction != null)
            Padding(
              padding: const EdgeInsets.only(top: 5),
              child: _PressableButton(
                child: TextButton(
                  onPressed: onAction,
                  child: Text(actionLabel!),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ============================================================
// SKELETON LOADER
// ============================================================

class HomeSkeleton extends StatefulWidget {
  const HomeSkeleton({super.key});

  @override
  State<HomeSkeleton> createState() => _HomeSkeletonState();
}

class _HomeSkeletonState extends State<HomeSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20),
          children: [
            _buildHeaderSkeleton(),
            const SizedBox(height: 20),
            _buildBannerSkeleton(),
            const SizedBox(height: 20),
            _buildSectionSkeleton(),
            const SizedBox(height: 14),
            _buildCardSkeleton(),
            const SizedBox(height: 14),
            _buildCardSkeleton(),
          ],
        );
      },
    );
  }

  Widget _shimmer(Widget child) {
    return Opacity(
      opacity: .5 + 0.5 * (1 - (_controller.value * 2 - 1).abs()),
      child: child,
    );
  }

  Widget _buildHeaderSkeleton() {
    return Row(
      children: [
        _shimmer(Container(
          width: 50, height: 50,
          decoration: const BoxDecoration(
            color: AppColors.background,
            shape: BoxShape.circle,
          ),
        )),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _shimmer(Container(
                width: 140, height: 18,
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(6),
                ),
              )),
              const SizedBox(height: 8),
              _shimmer(Container(
                width: double.infinity, height: 44,
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(14),
                ),
              )),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBannerSkeleton() {
    return _shimmer(Container(
      height: 120,
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(20),
      ),
    ));
  }

  Widget _buildSectionSkeleton() {
    return _shimmer(Row(
      children: [
        Container(
          width: 160, height: 20,
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(6),
          ),
        ),
      ],
    ));
  }

  Widget _buildCardSkeleton() {
    return _shimmer(Container(
      height: 200,
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(18),
      ),
    ));
  }
}

class _HomeLoadError extends StatelessWidget {
  const _HomeLoadError({
    required this.onRetry,
    this.offline = false,
  });

  final VoidCallback onRetry;
  final bool offline;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 120),
        EmptyState(
          icon: offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
          message: offline
              ? 'La connexion est indisponible.'
              : 'Impossible de charger ces informations.',
          actionLabel: 'Réessayer',
          onAction: onRetry,
        ),
      ],
    );
  }
}
