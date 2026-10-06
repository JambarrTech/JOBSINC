import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/services/api_client.dart';
import '../features/applications/presentation/application_flow_screen.dart';
import '../features/applications/presentation/applications_screen.dart';
import '../features/applications/providers/applications_provider.dart';
import 'candidate_shell.dart';
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
import '../features/network/presentation/network_feed_screen.dart';
import '../features/messages/presentation/chat_screen.dart';
import '../features/messages/presentation/conversation_resolver.dart';
import '../features/messages/presentation/messages_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
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

/// Navigation vers un onglet de l'espace candidat via l'URL. Utilisé par les
/// écrans imbriqués qui n'ont pas accès au `StatefulNavigationShell`.
void navigationShellGo(BuildContext context, int index) {
  switch (index) {
    case 0:
      context.go('/candidate/home');
    case 1:
      context.go('/candidate/applications');
    case 2:
      context.go('/candidate/network');
    case 3:
      context.go('/candidate/messages');
    case 4:
      context.go('/candidate/profile');
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
    // Point d'entrée : le SplashScreen, et non /onboarding.
    //
    // SplashScreen est le SEUL appelant de `AuthController.initialize()`.
    // Tant qu'il n'était pas routé, la session stockée en secure storage
    // n'était jamais relue au démarrage : « se souvenir de moi » ne
    // fonctionnait pas, l'onboarding se réaffichait à chaque lancement, et
    // ChatSocketService.connect() / FcmService.initAndRegister() n'étaient
    // jamais appelés avant un login manuel.
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

        // Tant que la session stockée n'a pas été relue, on reste sur le
        // splash (spinner) au lieu de rediriger vers l'onboarding, ce qui
        // provoquerait un aller-retour visuel à chaque démarrage.
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
      final isAuthRoute = location == '/login' ||
          location == '/register' ||
          location == '/onboarding' ||
          location == '/splash' ||
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
        // Renvoie vers L'ESPACE DU PERSONNE, comme les deux branches
        // précédentes (5 et 6) le font. Le code retournait inconditionnellement
        // '/candidate/home' : un employé ou un candidat qui ouvrait
        // /recruiter/messages était projeté vers l'accueil candidat, alors que
        // les branches symétriques les renvoient vers /employee/dashboard et
        // /recruiter/dashboard. Un utilisateur dont le chat de recruteur était
        // dans ses liens profonde se retrouvait donc sur un écran sans rapport
        // avec sa demande.
        if (accountStatus == AccountStatus.employee) {
          return '/employee/dashboard';
        }
        return '/candidate/messages';
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

      // Splash : restaure la session avant d'afficher quoi que ce soit.
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
      // ESPACE CANDIDAT (StatefulShellRoute)
      // ---------------------------------------------------------
      // L'onglet actif vit dans l'URL (`/candidate/home/messages`) au lieu
      // d'un `int _tab` local au State. Conséquences :
      //  - la navigation arrière système restaure l'onglet précédent ;
      //  - un deep-link ou un partage d'URL ouvre le bon onglet ;
      //  - l'état n'est plus perdu quand le widget est reconstruit.
      // `IndexedStack` reste nécessaire pour conserver la position de scroll
      // et l'état de chaque onglet.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            CandidateShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/candidate/home',
                builder: (context, __) => CandidateHomeScreen(
                  // L'accueil navigue vers l'onglet Profil via l'URL.
                  onOpenProfile: () => navigationShellGo(context, 4),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/candidate/applications',
                builder: (_, __) => const ApplicationsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/candidate/network',
                builder: (_, __) => const NetworkFeedScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/candidate/messages',
                builder: (_, __) =>
                    const MessagesScreen(isCompanySide: false),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/candidate/profile',
                builder: (_, __) => const ProfileScreen(),
              ),
            ],
          ),
        ],
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
          final extra = state.extra;
          if (extra is Conversation) {
            return ChatScreen(conversation: extra);
          }
          // Identifiant brut (payload de notification) : le builder
          // retombait sur MessagesScreen dans tous les cas.
          return ConversationResolver(
            conversationId: extra is String ? extra : null,
            isCompanySide: true,
          );
        },
      ),

      // ---------------------------------------------------------
      // MESSAGERIE CANDIDAT / EMPLOYÉ
      // ---------------------------------------------------------
      GoRoute(
        path: '/chat',
        builder: (_, state) {
          final extra = state.extra;
          if (extra is Conversation) {
            return ChatScreen(conversation: extra);
          }
          return ConversationResolver(conversationId: extra is String ? extra : null);
        },
      ),

      // ---------------------------------------------------------
      // APPLICATIONS
      // ---------------------------------------------------------
      GoRoute(
        path: '/application/success',
        builder: (_, state) {
          // La candidature qui vient d'être créée est passée en `extra` par
          // l'écran de candidature : l'écran de succès peut ainsi ouvrir le
          // suivi de CETTE candidature. Sans `extra` (deep-link, pile
          // restaurée), il retombe sur la liste.
          final extra = state.extra;
          return ApplicationSuccessScreen(
            application: extra is HomeApplication ? extra : null,
          );
        },
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

/// Écran de détail d'une offre atteinte par deep link (`/jobs/:id`).
///
/// Converti en `StatefulWidget` : la version précédente était un
/// `StatelessWidget` qui construisait `FutureBuilder(future: _fetchJob(jobId))`.
/// `_fetchJob` était donc ré-éVALUÉ à chaque `build` — c'est-à-dire à chaque
/// frame pendant le chargement, et à chaque reconstruction du parent. Le
/// `Future` changeait d'identité à chaque fois, ce qui :
///   - relançait un `GET /jobs/:id` en boucle ;
///   - faisait repasser l'écran par l'état `waiting` (retour du spinner) ;
///   - saturait l'API et le réseau pour un simple deep link.
///
/// Le futur est désormais construit UNE FOIS, dans `initState`, et réutilisé.
class _JobDetailByIdScreen extends StatefulWidget {
  const _JobDetailByIdScreen({required this.jobId});
  final String jobId;

  @override
  State<_JobDetailByIdScreen> createState() => _JobDetailByIdScreenState();
}

class _JobDetailByIdScreenState extends State<_JobDetailByIdScreen> {
  late final Future<JobOffer?> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchJob(widget.jobId);
  }

  @override
  Widget build(BuildContext context) {
    // Charge l'offre par ID puis affiche le détail ; fallback sur la liste si échec.
    return FutureBuilder(
      future: _future,
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

// Helper d'accès API pour les routes de deep-link.
// `ApiClient()` utilise désormais un `http.Client` partagé : plus besoin de
// fermer quoi que ce soit, donc plus de fuite de socket sur ces chemins.
class _SimpleApi {
  const _SimpleApi();
  Future<dynamic> get(String path) => ApiClient().getRaw(path);
}
