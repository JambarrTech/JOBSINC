import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:flutter_localizations/flutter_localizations.dart';

import '../core/services/chat_socket_service.dart';
import '../core/services/fcm_service.dart';
import '../core/services/local_notification_service.dart';
import '../features/auth/models/auth_user.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/messages/providers/messages_provider.dart';
import 'router.dart';
import 'theme.dart';

class JobsincApp extends ConsumerStatefulWidget {
  const JobsincApp({super.key});

  @override
  ConsumerState<JobsincApp> createState() => _JobsincAppState();
}

class _JobsincAppState extends ConsumerState<JobsincApp> with WidgetsBindingObserver {
  StreamSubscription<String>? _socketMessageSub;
  StreamSubscription<String>? _notificationTapSub;
  ProviderSubscription<AuthState>? _authSub;
  bool _notificationInit = false;

  @override
  void initState() {
    super.initState();
    // L'app passe-t-elle au premier plan ou en arriere-plan ? Le backend
    // s'en sert pour decider d'envoyer un push : un socket mobile survit
    // au passage en arriere-plan, donc « connecte » ne veut pas dire
    // « l'utilisateur regarde l'ecran ». Sans ce signal, aucun push
    // n'arrivait jamais sur mobile.
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        ChatSocketService.instance.setVisible(true);
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        // `detached` inclus : sans cela le dernier état connu restait
        // « visible » alors que l'app se termine.
        ChatSocketService.instance.setVisible(false);
        break;
    }
  }

  // ------------------------------------------------------------
  // TEMPS RÉEL GLOBAL : le socket suit la session (connexion à
  // l'authentification, fermeture à la déconnexion) et chaque message
  // reçu hors de la conversation ouverte déclenche une notification
  // locale avec l'aperçu fraîchement chargé.
  // ------------------------------------------------------------
  void _bootstrap() {
    if (_notificationInit) return;
    _notificationInit = true;

    _authSub = ref.listenManual<AuthState>(authProvider, (_, next) {
      final token = next.user?.token;
      if (token != null && token.isNotEmpty) {
        ChatSocketService.instance.connect(token);
        // Enregistre l'appareil pour le push FCM (idempotent).
        FcmService.initAndRegister(token);
        // Un tap sur notification ayant lancé l'app est en attente tant que la
        // session n'est pas restaurée (le splash vient d'appeler initialize()).
        final pending = _pendingConversationId;
        if (pending != null) {
          _pendingConversationId = null;
          _openConversation(pending);
        }
      } else if (next.user == null) {
        FcmService.unregister();
        ChatSocketService.instance.disconnect();
      }
    }, fireImmediately: true);

    _socketMessageSub =
        ChatSocketService.instance.messageEvents.listen(_onIncomingMessage);

    // Appui sur une notification pendant que l'app tourne (local ET FCM).
    // Ni l'un ni l'autre n'était écouté : le `payload` (conversationId) était
    // bien renseigné à l'émission mais un tap ne produisait aucun effet.
    _notificationTapSub =
        LocalNotificationService.instance.onTap.listen(_openConversation);
    FcmService.onOpened.listen(_openConversation);

    // Tap ayant lancé l'app depuis l'état arrêté (cold start). Le payload FCM
    // arrive de façon asynchrone : on le consomme dès qu'il est disponible et
    // on l'ouvre une fois la session restaurée.
    //
    // `init()` est ATTENDU avant la consommation : il remplit `_launchPayload`
    // via `getNotificationAppLaunchDetails()`. Sans cet `await`, la
    // consommation partait avant que le payload ne soit disponible.
    _initNotificationsThenConsumeLaunchTap();
  }

  Future<void> _initNotificationsThenConsumeLaunchTap() async {
    try {
      await LocalNotificationService.instance.init();
    } catch (e) {
      debugPrint('[app] init notifications : $e');
    }
    await _consumeLaunchTap();
  }

  Future<void> _consumeLaunchTap() async {
    // Tap ayant lance l'app depuis l'etat arrete. Deux sources :
    //  - `getNotificationAppLaunchDetails()` (payload remonte par le plugin) ;
    //  - la cle SharedPreferences ecrite par l'isolate de fond.
    // Les deux etaient cablees mais JAMAIS consommees : `takeLaunchPayload()`
    // n'etait appele nulle part, et `_launchPayload` n'etait jamais assigne.
    final local = LocalNotificationService.instance.takeLaunchPayload();
    final background =
        await LocalNotificationService.instance.takePersistedLaunchPayload();
    final conversationId = local ?? background ?? await FcmService.takeLaunchConversationId();
    if (conversationId == null || !mounted) return;
    _openConversation(conversationId);
  }

  /// Ouvre la conversation ciblée par une notification. Utilisé par les taps
  /// locaux, FCM, et le cold start.
  void _openConversation(String conversationId) {
    if (!mounted || conversationId.isEmpty) return;
    final router = ref.read(routerProvider);
    // La session doit être restaurée avant de router vers une page privée,
    // sinon redirect() renvoie vers /login.
    final auth = ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      _pendingConversationId = conversationId;
      return;
    }
    final status = auth.user?.status;
    if (status == AccountStatus.recruiter) {
      router.go('/recruiter/chat', extra: conversationId);
    } else {
      router.go('/chat', extra: conversationId);
    }
  }

  /// Conversation en attente d'une session restaurée.
  String? _pendingConversationId;

  Future<void> _onIncomingMessage(String conversationId) async {
    // Message de la conversation affichée à l'écran : pas de notification.
    if (ChatSocketService.instance.viewingConversationId == conversationId) return;

    // Rafraîchit la liste (badges + aperçus) puis utilise l'aperçu frais.
    await ref.read(messagesProvider.notifier).refreshQuietly();

    var title = 'Nouveau message';
    var body = 'Vous avez reçu un nouveau message.';
    for (final conversation in ref.read(messagesProvider).conversations) {
      if (conversation.id == conversationId) {
        title = conversation.participantName;
        if (conversation.preview.isNotEmpty) body = conversation.preview;
        break;
      }
    }

    await LocalNotificationService.instance.showMessage(
      title: title,
      body: body,
      payload: conversationId,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // `ref.listenManual` ouvre un abonnement independant du cycle de vie des
    // widgets : sans cette annulation, il survivait au State et continuait
    // de connecter le socket / enregistrer le FCM sur un widget detruit.
    _authSub?.close();
    _socketMessageSub?.cancel();
    _notificationTapSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'JOBSINC',
        debugShowCheckedModeBanner: false,
        theme: JobsincTheme.light,
        // Les delegates Material sont bien nécessaires : ils fournissent à
        // `showDatePicker` et aux menus de sélection les chaines qui leur
        // conviennent. C'est leur SEUL rôle ici.
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        // Uniquement le français, et c'est assumé.
        //
        // `Locale('en', 'US')` était déclaré alors qu'il n'existe NI fichier
        // ARB, NI `AppLocalizations`, NI `context.l10n` : les ~400 chaînes de
        // l'application sont des littéraux français. Déclarer l'anglais comme
        // supporté produisait donc le pire des deux mondes sur un appareil
        // anglophone : l'interface en français, mais des date pickers, des
        // dialogues de confirmation et des menus de sélection en anglais.
        //
        // `supportedLocales` doit refléter ce qui est RÉELLEMENT traduit, sinon
        // il promet une traduction inexistante. Ajouter l'anglais suppose de
        // livrer les ARB — c'est une fonctionnalité, pas une correction.
        supportedLocales: const [Locale('fr', 'FR')],
        routerConfig: ref.watch(routerProvider),
      );
}
