import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jobsinc_mobile/core/services/api_client.dart';
import 'package:jobsinc_mobile/core/storage/local_storage.dart';
import 'package:jobsinc_mobile/core/widgets/pressable_button.dart';
import 'package:jobsinc_mobile/features/auth/models/auth_user.dart';
import 'package:jobsinc_mobile/features/auth/providers/auth_provider.dart';
import 'package:jobsinc_mobile/features/auth/services/auth_session_service.dart';
import 'package:jobsinc_mobile/features/jobs/models/job_offer.dart';
import 'package:jobsinc_mobile/features/jobs/widgets/date_helpers.dart';
import 'package:jobsinc_mobile/features/messages/models/conversation.dart';

void main() {
  // Aucun test de ce fichier n'est tautologique. Les deux qui l'étaient ont été
  // supprimés : l'un affirmait qu'un stub `async => null` défini 80 lignes plus
  // bas retournait `null` (structurellement impossible à faire échouer), l'autre
  // comptait les widgets d'un `SizedBox.shrink()` qu'il venait de construire.
  // Chaque cas couvert ci-dessous a été validé en réintroduisant le bug dans le
  // code de production : le test échoue bien.

  group('Cycle de vie de la session', () {
    test('l\'état initial de l\'auth est « loading » et sans utilisateur', () async {
      // Le test s'appelait « une session absente conduit à unauthenticated » alors
      // qu'il n'assertait QUE `status == loading` : le nom promettait la
      // résolution de l'état par `initialize()`, le corps ne le faisait jamais
      // (aucune attente, aucun appel). Le nom est réaligné sur ce qui est
      // réellement vérifié, et l'assertion est élargie au contrat complet de
      // l'état initial : « on ne sait pas encore » doit vouloir dire « pas de
      // user », sinon le routeur afficherait un profil vide avant même la
      // restauration de session.
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final state = container.read(authProvider);
      expect(state.status, AuthStatus.loading,
          reason: "l'état initial est loading : c'est initialize() qui doit le résoudre");
      expect(state.user, isNull,
          reason: 'un état « loading » ne doit jamais exposer d\'utilisateur : '
              'le routeur peindrait un profil vide avant la restauration');
      expect(state.message, isNull,
          reason: 'aucun message d\'erreur ne peut accompagner l\'état initial');
    });
  });

  group('Identité d\'offre', () {
    // `JobOffer` n'avait NI `operator ==` NI `hashCode` : il héritait de
    // l'identité d'instance, alors qu'il est reconstruit depuis le JSON à chaque
    // appel réseau. Même bug que celui corrigé sur `Conversation` et sur
    // `AuthState`/`AuthUser` : voir la note de job_offer.dart.
    test('deux offres de même id sont la même clé', () {
      final base = JobOffer.fromJson(_offerJson('job-1'));
      // Même id, mais rescan : le backend a renvoyé un `matchScore` et une
      // description à jour. L'instance diffère, l'identité non.
      final rescanned = JobOffer.fromJson({
        ..._offerJson('job-1'),
        'matchScore': 92,
        'description': 'Une description toute neuve.',
      });

      expect(rescanned, equals(base),
          reason: 'matchScore/description changent à chaque rescan : les inclure '
              'dans l\'identité recréerait la clé à chaque rafraîchissement');
      expect(rescanned.hashCode, equals(base.hashCode));
    });

    test('deux offres d\'id différents ne sont pas confondues', () {
      final a = JobOffer.fromJson(_offerJson('job-1'));
      final b = JobOffer.fromJson(_offerJson('job-2'));
      expect(a, isNot(equals(b)),
          reason: 'l\'id est le seul discriminant : deux offres distinctes ne '
              'doivent jamais partager un état de détail ni une clé de cache');
    });

    test('une offre reste utilisable comme clé de Set', () {
      // Symptôme observable du bug : la même offre rescannée apparaissait
      // plusieurs fois dans une liste censée être sans doublon.
      final base = JobOffer.fromJson(_offerJson('job-1'));
      final set = <JobOffer>{
        base,
        JobOffer.fromJson({..._offerJson('job-1'), 'matchScore': 42}),
        JobOffer.fromJson(_offerJson('job-2')),
      };
      expect(set.length, 2,
          reason: 'le rescan d\'une offre ne doit pas créer une entrée de plus');
    });

    test('deux offres sans id ne sont jamais égales', () {
      // Le repli `JobOffer(title: '', ...)` de saved_jobs_provider n'a pas d'id.
      // Le fusionner avec un autre repli ferait disparaître une ligne de la
      // liste des favoris au lieu de l'afficher.
      const a =
          JobOffer(title: '', company: '', location: '', type: '', category: '', posted: '');
      final b = JobOffer.fromJson(_offerJson('job-3')..remove('id'));
      expect(a, isNot(equals(b)));
    });
  });

  group('Rôle et statut de compte', () {
    late AuthSessionService session;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      // `userFromApi` ne touche jamais au stockage : il suffit d'injecter des
      // instances réelles, sans appel plateforme.
      session = AuthSessionService(
        LocalStorage(
          await SharedPreferences.getInstance(),
          const FlutterSecureStorage(),
        ),
      );
    });

    test('le rôle EMPLOYEE de l\'API devient AccountStatus.employee', () {
      // `userFromApi` mappe le rôle par comparaison de chaîne. Toute faute de
      // frappe ('EMPLYEE', 'employé', 'employee') fait retomber SILENCIEUSEMENT
      // sur `candidate` : l'employé se retrouve dans le mauvais espace, sans la
      // moindre erreur visible.
      final user = session.userFromApi(
        {
          'id': 7,
          'email': 'samira@example.com',
          'role': 'EMPLOYEE',
          'candidate': {'firstName': 'Samira', 'lastName': 'Traoré'},
        },
        'access-token',
      );

      expect(user.status, AccountStatus.employee);
      expect(user.id, '7',
          reason: 'l\'id numérique de l\'API doit être normalisé en chaîne');
      expect(user.firstName, 'Samira');
      expect(user.lastName, 'Traoré');
      expect(user.token, 'access-token');
    });

    test('RECRUITER devient recruiter, un rôle inconnu devient candidate', () {
      AuthUser build(String role) => session.userFromApi(
            {'id': 1, 'email': 'a@b.c', 'role': role},
            't',
          );

      expect(build('RECRUITER').status, AccountStatus.recruiter);
      // Le repli doit être explicite et testé : c'est lui qui masquerait une
      // évolution du backend.
      expect(build('ADMIN').status, AccountStatus.candidate);
    });

    test('deux profils de même id mais de rôle différent ne sont pas égaux', () {
      AuthUser withRole(AccountStatus status) => AuthUser(
            id: '7',
            firstName: 'Samira',
            lastName: 'Traoré',
            email: 'samira@example.com',
            status: status,
          );

      expect(withRole(AccountStatus.employee),
          isNot(equals(withRole(AccountStatus.recruiter))),
          reason: 'changer de rôle doit suffire à distinguer deux sessions');
      expect(withRole(AccountStatus.employee),
          equals(withRole(AccountStatus.employee)));
    });

    test('le statut survit à l\'aller-retour par le stockage', () {
      // `saveSession` écrit `status.storageValue`, `localUserFromStorage` relit
      // `accountStatusFromStorage`. Si l'un des deux noms change, l'utilisateur
      // est déconnecté au redémarrage de l'app, SANS message d'erreur.
      for (final status in AccountStatus.values) {
        expect(accountStatusFromStorage(status.storageValue), status,
            reason: '« ${status.storageValue} » doit survivre au round-trip');
      }
      // Et un rôle inconnu ne doit surtout pas être deviné en `candidate` par
      // défaut, qui autorise l'espace candidat.
      expect(accountStatusFromStorage('ADMIN'), isNull);
    });
  });

  group('Formatage des dates relatives', () {
    // `formatRelativeDate` est la fonction la plus exercée du feed : chaque
    // carte d'offre l'affiche. Les bornes ci-dessous sont exactement celles où
    // une comparaison `<` / `<=` mal placée fait basculer une ligne entière.
    final now = DateTime.now();

    String ago(Duration d) =>
        formatRelativeDate(now.subtract(d).toIso8601String());

    test('une date absente ne rend rien', () {
      // Un `posted` manquant ne doit PAS laisser le littéral « null » dans le
      // coin de la carte.
      expect(formatRelativeDate(null), '');
      expect(formatRelativeDate(''), '');
    });

    test('une date illisible est renvoyée telle quelle', () {
      // Repli volontaire : mieux vaut afficher la chaîne brute que « null », ou
      // une date de 1970 qui ferait croire à une offre ancienne.
      expect(formatRelativeDate('hier soir'), 'hier soir');
    });

    test('une date future ou de moins d\'une minute vaut « À l\'instant »', () {
      // Le futur n'est pas une erreur en soi : `diff.isNegative` absorbe aussi
      // le désynchronisme d'horloge entre le backend et le mobile.
      expect(ago(const Duration(seconds: 30)), 'À l\'instant');
      expect(formatRelativeDate(now.add(const Duration(hours: 3)).toIso8601String()),
          'À l\'instant');
    });

    test('les minutes et les heures tombent à l\'unité inférieure', () {
      expect(ago(const Duration(minutes: 1)), 'Il y a 1 min');
      expect(ago(const Duration(minutes: 59, seconds: 59)), 'Il y a 59 min');
      expect(ago(const Duration(hours: 1)), 'Il y a 1h');
      expect(ago(const Duration(hours: 23, minutes: 59)), 'Il y a 23h');
    });

    test('le passage à « Hier » a lieu à exactement 24 h', () {
      // 23 h 59 doit rester en heures, 24 h pile doit basculer sur « Hier ».
      expect(ago(const Duration(hours: 23, minutes: 59)), 'Il y a 23h');
      expect(ago(const Duration(days: 1)), 'Hier');
    });

    test('jours, puis semaines, puis date absolue s\'enchaînent', () {
      expect(ago(const Duration(days: 2)), 'Il y a 2 jours');
      expect(ago(const Duration(days: 6, hours: 23)), 'Il y a 6 jours');
      // Au-delà de 7 jours, affichage en semaines (semaine entamée = 1).
      expect(ago(const Duration(days: 7)), 'Il y a 1 sem.');
      expect(ago(const Duration(days: 20)), 'Il y a 2 sem.');
      // Puis la date absolue, en français, une fois passé un mois. Date fixe :
      // le libellé dépend du mois, pas de l'heure courante.
      expect(formatRelativeDate(DateTime(2025, 3, 14).toIso8601String()),
          'Le 14 mars 2025');
    });

    test('formatTime complète les heures et les minutes à deux chiffres', () {
      expect(formatTime(DateTime(2026, 1, 1, 9, 5)), '09:05');
      expect(formatTime(DateTime(2026, 1, 1, 23, 59)), '23:59');
      expect(formatTime(DateTime(2026, 1, 1, 0, 0)), '00:00');
    });
  });

  group('Identité de conversation', () {
    // `chatProvider` est un `NotifierProvider.family` paramétré par la
    // Conversation ENTIÈRE. Sans `==`, deux instances de même `id` — ce que
    // produit chaque `refreshQuietly()`, puisque la liste est reconstruite
    // depuis le JSON — étaient deux clés de provider différentes : deux
    // historiques de messages en parallèle, scroll perdu, familles orphelines.
    test('deux conversations de même id sont la même clé', () {
      final base = Conversation(
        id: 'conv-1',
        participantName: 'Alice Test',
        lastMessageAt: DateTime.utc(2026, 1, 1),
      );
      // Copie avec un nouveau message : l'instance diffère, l'identité non.
      final updated = base.copyWith(
        preview: 'Bonjour',
        lastMessageAt: DateTime.utc(2026, 1, 2),
        unreadCount: 1,
      );

      expect(updated, equals(base),
          reason: 'preview/lastMessageAt/unreadCount ne doivent PAS créer une '
              'nouvelle famille de providers — cela recréerait le cache à chaque '
              'message reçu');
      expect(updated.hashCode, equals(base.hashCode));
    });

    test('deux conversations d’id différents ne sont pas confondues', () {
      final a = Conversation(
        id: 'conv-1',
        participantName: 'Alice',
        lastMessageAt: DateTime.utc(2026, 1, 1),
      );
      final b = Conversation(
        id: 'conv-2',
        participantName: 'Alice',
        lastMessageAt: DateTime.utc(2026, 1, 1),
      );
      expect(a, isNot(equals(b)),
          reason: 'l’id est le seul discriminant : deux fils de discussion '
              'distincts ne doivent jamais partager un état de chat');
    });

    test('une conversation reste utilisable comme clé de Map', () {
      // Un `Set<Conversation>` doit dédupliquer : c'est le symptôme observable
      // du bug (la même conversation vue deux fois dans une liste).
      final base = Conversation(
        id: 'conv-1',
        participantName: 'Alice',
        lastMessageAt: DateTime.utc(2026, 1, 1),
      );
      final set = <Conversation>{
        base,
        base.copyWith(preview: 'x'),
        Conversation(
          id: 'conv-2',
          participantName: 'Bob',
          lastMessageAt: DateTime.utc(2026, 1, 1),
        ),
      };
      expect(set.length, 2);
    });
  });

  group('PressableButton', () {
    // Enfant de test : hit-testable SANS contenir le moindre recognizer.
    // `Listener(behavior: opaque)` sert uniquement de boîte qui « capte » le
    // pointeur — un `SizedBox` nu n'est pas hit-testable (deferToChild), ce qui
    // ferait échouer l'effet d'enfoncement pour une raison étrangère au bug.
    const child = Listener(
      behavior: HitTestBehavior.opaque,
      child: SizedBox(width: 100, height: 100),
    );

    testWidgets('n\'ajoute ni second tap ni second nœud de sémantique',
        (tester) async {
      // Régression sur les deux bugs corrigés dans pressable_button.dart :
      //  - le `GestureDetector` interne créait un `TapGestureRecognizer` en
      //    concurrence de celui de l'enfant ;
      //  - le `Semantics(button: true)` enveloppait celui de l'enfant, donc un
      //    lecteur d'écran annonçait « bouton » deux fois de suite.
      final handle = tester.ensureSemantics();

      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: Semantics(button: true, label: 'parent', child: const PressableButton(child: child)),
          ),
        ),
      );

      expect(
        find.descendant(
          of: find.byType(PressableButton),
          matching: find.byType(GestureDetector),
        ),
        findsNothing,
        reason: 'PressableButton n\'ajoute aucun GestureDetector : le tap '
            'appartient au seul enfant, sinon deux TapGestureRecognizer '
            's\'affrontent dans la même arène de gestes',
      );

      // Le nœud qui couvre la sous-arborescence DOIT être celui du parent : si
      // PressableButton publiait le sien, `getSemantics` s'arrêterait dessus et
      // son `label` serait vide au lieu de « parent ».
      final node = tester.getSemantics(find.byType(PressableButton));
      expect(node.getSemanticsData().label, 'parent',
          reason: 'PressableButton ne doit publier AUCUN nœud de sémantique '
              'propre : il n\'est pas un bouton, et un nœud supplémentaire y '
              'annonce « bouton » une seconde fois à l\'intérieur du parent');

      expect(_tappableDescendants(node), 0,
          reason: 'aucun descendant de PressableButton ne doit exposer une '
              'action `tap` : le tap appartient au seul enfant');

      // Disposé ICI, et non via `addTearDown` : le harnais vérifie les
      // handles actifs AVANT les tear-down, donc un handle laissé ouvert fait
      // échouer le test même si toutes les assertions passent.
      handle.dispose();
    });

    testWidgets('l\'effet d\'enfoncement est bien appliqué à l\'appui',
        (tester) async {
      // Le correctif ne doit pas avoir supprimé l'effet : c'est la seule chose
      // que ce composant apporte à l'appelant.
      await tester.pumpWidget(
        const MaterialApp(
          home: Center(child: PressableButton(child: child)),
        ),
      );

      expect(_scaleOf(tester), 1.0);

      final gesture =
          await tester.startGesture(tester.getCenter(find.byType(PressableButton)));
      await tester.pump(const Duration(milliseconds: 10));
      expect(_scaleOf(tester), 0.97,
          reason: 'l\'appui doit déclencher l\'effet d\'enfoncement 0.97');

      await gesture.up();
      await tester.pump(const Duration(milliseconds: 200));
      expect(_scaleOf(tester), 1.0,
          reason: 'le relâchement doit restaurer l\'échelle');
    });
  });

  group('Images protégées (photos de profil)', () {
    // Sans JWT, `uploadAuth` répond 401 et la photo ne s'affiche jamais :
    // c'était le bug « photos invisibles sur mobile ».
    test('les avatars /uploads/candidates exigent un Bearer', () {
      expect(
        ApiClient.isProtectedUploadUrl('/uploads/candidates/abc.jpg'),
        isTrue,
      );
      expect(
        ApiClient.imageHeaders('tok123', '/uploads/candidates/abc.jpg'),
        {'Authorization': 'Bearer tok123'},
      );
    });

    test('les CV /uploads/cvs exigent un Bearer', () {
      expect(ApiClient.isProtectedUploadUrl('/uploads/cvs/abc.pdf'), isTrue);
    });

    test('les logos /uploads/companies restent publics (pas de token)', () {
      expect(
        ApiClient.isProtectedUploadUrl('/uploads/companies/logo.png'),
        isFalse,
      );
      expect(
        ApiClient.imageHeaders('tok123', '/uploads/companies/logo.png'),
        isEmpty,
      );
    });

    test('jamais de token vers un hôte tiers', () {
      expect(
        ApiClient.imageHeaders(
            'tok123', 'https://evil.example/x/uploads/candidates/a.jpg'),
        isEmpty,
        reason: 'le JWT ne doit fuiter que vers le backend JOBSINC',
      );
    });

    test('sans token, aucun en-tête même sur upload protégé', () {
      expect(ApiClient.imageHeaders(null, '/uploads/candidates/a.jpg'),
          isEmpty);
      expect(ApiClient.imageHeaders('', '/uploads/candidates/a.jpg'), isEmpty);
    });
  });
}

/// Compte les nœuds de sémantique, descendants de [node], exposés comme
/// activables (action `tap`). Seuls les widgets réellement actionnables
/// publient une telle action : le texte ne la produit pas.
int _tappableDescendants(SemanticsNode node) {
  var count = 0;
  node.visitChildren((child) {
    if (child.getSemanticsData().hasAction(SemanticsAction.tap)) count++;
    count += _tappableDescendants(child);
    return true;
  });
  return count;
}

/// Échelle courante de l'effet d'enfoncement.
double _scaleOf(WidgetTester tester) => tester
    .widget<AnimatedScale>(
      find.descendant(
        of: find.byType(PressableButton),
        matching: find.byType(AnimatedScale),
      ),
    )
    .scale;

/// Payload API minimal d'une offre, avec un `id` pilotable.
Map<String, dynamic> _offerJson(String id) => {
      'id': id,
      'title': 'Développeur Flutter',
      'company': {'name': 'JOBSINC'},
      'location': 'Dakar',
      'contractType': 'CDI',
      'department': 'IT',
      'publishedAt': DateTime(2026, 1, 1).toIso8601String(),
    };
