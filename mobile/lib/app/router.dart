import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/services/api_client.dart';
import '../features/applications/presentation/application_flow_screen.dart';
import '../features/applications/presentation/applications_screen.dart';
import '../features/applications/providers/applications_provider.dart';
import '../features/candidate/home/data/home_repository.dart';
import '../features/auth/models/auth_user.dart';
import '../features/auth/presentation/auth_screens.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/candidate/home/candidate_home_screen.dart';
import '../features/employee/dashboard/employee_dashboard_screen.dart';
import '../features/jobs/models/job_offer.dart';
import '../features/jobs/presentation/job_detail_screen.dart';
import '../features/jobs/presentation/offers_screen.dart';
import '../features/jobs/presentation/saved_jobs_screen.dart';
import '../features/messages/models/conversation.dart';
import '../features/messages/presentation/chat_screen.dart';
import '../features/messages/presentation/messages_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/settings_screen.dart';
import '../features/recruiter/dashboard/recruiter_dashboard_screen.dart';

/// Permet à GoRouter de se rafraîchir lorsque l'état
/// d'authentification change, sans recréer le GoRouter.
class AuthRouterNotifier extends ChangeNotifier {
  AuthRouterNotifier(this._authState);

  AuthState _authState;

  AuthState get authState => _authState;

  void update(AuthState newState) {
    if (_authState == newState) return;

    _authState = newState;
    notifyListeners();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  // IMPORTANT :
  // On utilise read() et non watch().
  // Le GoRouter ne sera donc créé qu'une seule fois.
  final authNotifier = AuthRouterNotifier(
    ref.read(authProvider),
  );

  // On écoute uniquement les changements d'authentification
  // pour demander à GoRouter de réévaluer redirect().
  final subscription = ref.listen<AuthState>(
    authProvider,
    (_, next) {
      authNotifier.update(next);
    },
  );

  // Nettoyage lorsque le provider est détruit.
  ref.onDispose(() {
    subscription.close();
    authNotifier.dispose();
  });

  return GoRouter(
    initialLocation: '/splash',

    // GoRouter réévalue redirect() lorsque l'authentification change.
    refreshListenable: authNotifier,

    redirect: (context, state) {
      final auth = authNotifier.authState;
      final location = state.uri.path;

      const publicRoutes = {
        '/splash',
        '/onboarding',
        '/login',
        '/register',
        '/forgot-password',
      };

      final isPublicRoute = publicRoutes.contains(location);

      // ---------------------------------------------------------
      // 1. AUTHENTIFICATION EN COURS
      // ---------------------------------------------------------
      if (auth.status == AuthStatus.loading) {
        if (isPublicRoute) {
          return null;
        }

        return '/splash';
      }

      // ---------------------------------------------------------
      // 2. UTILISATEUR NON CONNECTÉ
      // ---------------------------------------------------------
      if (auth.status != AuthStatus.authenticated) {
        // Les pages publiques restent accessibles.
        if (isPublicRoute) {
          return null;
        }

        // Toute page privée renvoie vers la connexion.
        return '/login';
      }

      // ---------------------------------------------------------
      // 3. UTILISATEUR CONNECTÉ
      // ---------------------------------------------------------
      final user = auth.user;

      // Sécurité supplémentaire.
      if (user == null) {
        return '/login';
      }

      final accountStatus = user.status;

      // ---------------------------------------------------------
      // 4. EMPÊCHER UN UTILISATEUR CONNECTÉ DE RETOURNER
      //    SUR LOGIN / REGISTER / SPLASH / ONBOARDING
      // ---------------------------------------------------------
      final isAuthRoute = location == '/splash' ||
          location == '/login' ||
          location == '/register' ||
          location == '/onboarding' ||
          location == '/forgot-password';

      if (isAuthRoute) {
        if (accountStatus == AccountStatus.recruiter) {
          return '/recruiter/dashboard';
        }
        if (accountStatus == AccountStatus.candidate) {
          return '/candidate/home';
        }

        return '/employee/dashboard';
      }

      // ---------------------------------------------------------
      // 5. PROTECTION DE L'ESPACE CANDIDAT
      // ---------------------------------------------------------
      if (location.startsWith('/candidate') &&
          accountStatus != AccountStatus.candidate) {
        if (accountStatus == AccountStatus.recruiter) {
          return '/recruiter/dashboard';
        }
        return '/employee/dashboard';
      }

      // ---------------------------------------------------------
      // 6. PROTECTION DE L'ESPACE EMPLOYÉ
      // ---------------------------------------------------------
      if (location.startsWith('/employee') &&
          accountStatus != AccountStatus.employee) {
        if (accountStatus == AccountStatus.recruiter) {
          return '/recruiter/dashboard';
        }
        return '/candidate/home';
      }

      // ---------------------------------------------------------
      // 6b. PROTECTION DE L'ESPACE RECRUTEUR
      // ---------------------------------------------------------
      if (location.startsWith('/recruiter') &&
          accountStatus != AccountStatus.recruiter) {
        return '/candidate/home';
      }

      // ---------------------------------------------------------
      // 7. ROUTE AUTORISÉE
      // ---------------------------------------------------------
      return null;
    },

    routes: [
      // ---------------------------------------------------------
      // ROOT
      // ---------------------------------------------------------
      GoRoute(
        path: '/',
        redirect: (_, __) => '/splash',
      ),

      GoRoute(
        path: '/splash',
        builder: (_, __) => const SplashScreen(),
      ),

      GoRoute(
        path: '/onboarding',
        builder: (_, __) => const OnboardingScreen(),
      ),

      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),

      GoRoute(
        path: '/register',
        builder: (_, __) => const RegisterScreen(),
      ),

      GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordScreen(),
      ),

      // ---------------------------------------------------------
      // CANDIDAT
      // ---------------------------------------------------------
      GoRoute(
        path: '/candidate/home',
        builder: (_, __) => const CandidateHomeScreen(),
      ),

      GoRoute(
        path: '/candidate/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),

      GoRoute(
        path: '/candidate/saved-jobs',
        builder: (_, __) => const SavedJobsScreen(),
      ),

      // ---------------------------------------------------------
      // OFFRES (recherche + détail, via la carte du fil d'accueil)
      // ---------------------------------------------------------
      GoRoute(
        path: '/jobs',
        builder: (_, state) => OffersScreen(
          initialQuery: state.uri.queryParameters['q'] ?? '',
          initialLocation: state.uri.queryParameters['loc'] ?? '',
        ),
      ),

      GoRoute(
        path: '/jobs/:id',
        builder: (_, state) {
          final extra = state.extra;
          if (extra is JobOffer) {
            return JobDetailScreen(offer: extra);
          }
          // Deep-link sans objet (notification/partage) : charge par ID
          final jobId = state.pathParameters['id'] ?? '';
          return _JobDetailByIdScreen(jobId: jobId);
        },
      ),
      GoRoute(
        path: '/application/flow',
        builder: (_, state) {
          final extra = state.extra;
          if (extra is JobOffer) return ApplicationFlowScreen(offer: extra);
          return const OffersScreen();
        },
      ),

      // ---------------------------------------------------------
      // PARAMÈTRES (déconnexion, réinitialisation mot de passe)
      // ---------------------------------------------------------
      GoRoute(
        path: '/settings',
        builder: (_, __) => const SettingsScreen(),
      ),

      // ---------------------------------------------------------
      // EMPLOYÉ / ENTREPRISE
      // ---------------------------------------------------------
      GoRoute(
        path: '/employee/dashboard',
        builder: (_, __) => const EmployeeDashboardScreen(),
      ),

      // ---------------------------------------------------------
      // RECRUTEUR
      // ---------------------------------------------------------
      GoRoute(
        path: '/recruiter/dashboard',
        builder: (_, __) => const RecruiterDashboardScreen(),
      ),

      GoRoute(
        path: '/recruiter/messages',
        builder: (_, __) => const MessagesScreen(),
      ),

      GoRoute(
        path: '/recruiter/chat',
        builder: (_, state) {
          final conversation = state.extra;
          if (conversation is Conversation) {
            return ChatScreen(conversation: conversation);
          }
          return const MessagesScreen();
        },
      ),

      // ---------------------------------------------------------
      // MESSAGERIE CANDIDAT / EMPLOYÉ
      // ---------------------------------------------------------
      GoRoute(
        path: '/chat',
        builder: (_, state) {
          final conversation = state.extra;
          if (conversation is Conversation) {
            return ChatScreen(conversation: conversation);
          }
          return const MessagesScreen(isCompanySide: false);
        },
      ),

      // ---------------------------------------------------------
      // APPLICATIONS
      // ---------------------------------------------------------
      GoRoute(
        path: '/application/success',
        builder: (_, __) => const ApplicationSuccessScreen(),
      ),

      GoRoute(
        path: '/recruitment/confirmed',
        builder: (_, __) => const RecruitmentConfirmedScreen(),
      ),

      GoRoute(
        path: '/applications/:id',
        builder: (_, state) {
          final extra = state.extra;
          if (extra is HomeApplication) {
            return ApplicationDetailScreen(application: extra);
          }
          final appId = state.pathParameters['id'] ?? '';
          if (appId.isNotEmpty) {
            return _ApplicationDetailByIdScreen(applicationId: appId);
          }
          return const Scaffold(
            body: Center(child: Text('Candidature introuvable')),
          );
        },
      ),
    ],
  );
});

class _JobDetailByIdScreen extends StatelessWidget {
  const _JobDetailByIdScreen({required this.jobId});
  final String jobId;
  @override
  Widget build(BuildContext context) {
    // Charge l'offre par ID puis affiche le détail ; fallback sur la liste si échec.
    return FutureBuilder(
      future: _fetchJob(jobId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final offer = snapshot.data;
        if (offer != null) return JobDetailScreen(offer: offer);
        return const OffersScreen();
      },
    );
  }

  Future<JobOffer?> _fetchJob(String id) async {
    try {
      // Lecture sans token pour les offres publiques ; token optionnel si disponible
      final data = await _fetchPublicJob(id);
      return data;
    } catch (_) {
      return null;
    }
  }

  Future<JobOffer?> _fetchPublicJob(String id) async {
    // Appel direct sans dépendance Riverpod pour rester léger côté router
    try {
      const api = _SimpleApi();
      final json = await api.get('/jobs/$id');
      // Réponse { ...job } ou { data: ... } selon DTO
      final map = json is Map<String, dynamic> ? (json['data'] is Map ? json['data'] as Map<String, dynamic> : json) : null;
      if (map == null) return null;
      return JobOffer.fromJson(map);
    } catch (_) {
      return null;
    }
  }
}

class _ApplicationDetailByIdScreen extends ConsumerWidget {
  const _ApplicationDetailByIdScreen({required this.applicationId});
  final String applicationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Charge la liste des candidatures puis retrouve celle demandée.
    final asyncApps = ref.watch(applicationsProvider);
    return asyncApps.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => Scaffold(
        appBar: AppBar(title: const Text('Détails')),
        body: const Center(child: Text('Impossible de charger la candidature.')),
      ),
      data: (apps) {
        final match = apps.where((a) => a.id == applicationId).toList();
        if (match.isNotEmpty) return ApplicationDetailScreen(application: match.first);
        return Scaffold(
          appBar: AppBar(title: const Text('Détails')),
          body: Center(child: Text('Candidature $applicationId introuvable.')),
        );
      },
    );
  }
}

// Minimal Api helper sans http.Client leak (utilise ApiClient partagé brièvement)
class _SimpleApi {
  const _SimpleApi();
  Future<dynamic> get(String path) async {
    // ignore: avoid-creation via ApiClient temporaire fermé immédiatement
    final client = ApiClient();
    try {
      return await client.getRaw(path);
    } finally {
      client.close();
    }
  }
}
