import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:flutter_localizations/flutter_localizations.dart';

import '../core/services/chat_socket_service.dart';
import '../core/services/local_notification_service.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/messages/providers/messages_provider.dart';
import 'router.dart';
import 'theme.dart';

class JobsincApp extends ConsumerStatefulWidget {
  const JobsincApp({super.key});

  @override
  ConsumerState<JobsincApp> createState() => _JobsincAppState();
}

class _JobsincAppState extends ConsumerState<JobsincApp> {
  StreamSubscription<String>? _socketMessageSub;
  bool _notificationInit = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
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
    LocalNotificationService.instance.init();

    ref.listenManual(authProvider, (_, next) {
      final token = next.user?.token;
      if (token != null && token.isNotEmpty) {
        ChatSocketService.instance.connect(token);
      } else if (next.user == null) {
        ChatSocketService.instance.disconnect();
      }
    }, fireImmediately: true);

    _socketMessageSub =
        ChatSocketService.instance.messageEvents.listen(_onIncomingMessage);
  }

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
    _socketMessageSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'JOBSINC',
        debugShowCheckedModeBanner: false,
        theme: JobsincTheme.light,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('fr', 'FR'),
          Locale('en', 'US'),
        ],
        routerConfig: ref.watch(routerProvider),
      );
}
