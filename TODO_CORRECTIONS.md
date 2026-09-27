# JOBSINC — TODO Corrections Full-Stack (25/09/2026)

> ⚠️ **DOCUMENT ARCHIVÉ — NE PAS UTILISER COMME ÉTAT COURANT.**
>
> L'état d'avancement fait foi : voir **[ETAT.md](ETAT.md)**.
>
> Les deux anciens documents d'état se contredisaient — le second
> affirmait « tout exécuté, rien supposé » là où le premier comptait 16 points non
> traités. Deux sources d'état contradictoires apprennent au prochain lecteur à
> se méfier de tout ce qu'il lit. Ils sont conservés comme archive
> historique, pas comme plan de travail.


État après la revue de sécurité et la campagne de corrections des 4 semaines.

## P0 — Bloquants (corrigés le 25/09/2026)

### Autorisation
- [x] **Backend** `interviewController.finish` ne vérifiait pas le côté (recruteur) — un
      candidat pouvait clore son propre entretien (`TERMINE` + `finishedAt`), ce qui
      figeait définitivement le dossier (`schedule` refuse ensuite de re-planifier).
      Ajout du même garde que `start`/`cancel`.
- [x] **Backend** `conversationService.membershipWhere` — l'ordre de fusion
      (`...extra` puis propriétaire) permettait à un `extra` contenant
      `companyUserId` d'écraser le filtre d'appartenance. Corrigé + couvert par un
      test de non-régression.
- [x] **Backend** `applicationController.create` acceptait **toute URL absolue** en
      `cvUrl` quand `STORAGE_DRIVER=s3`, et ne vérifiait pas que le CV appartenait
      au candidat. Validation durcie + contrôle de propriété.
- [x] **Web** `SUPER_ADMIN` / `SYSTEM_ADMIN` bloqués hors de `/admin` : le proxy
      exigeait `role === 'ADMIN'` alors que le client autorisait 3 rôles. Liste
      partagée dans `lib/admin-roles.ts`.

### Stockage
- [x] **Backend** `STORAGE_DRIVER=s3` supprimait l'autorisation sur les CV
      (bucket public + montage statique désactivé). Le bucket reste privé, les
      fichiers sont streamés par `app.js` après `uploadAuth`. `saveS3` retourne
      désormais la clé applicative (`/uploads/cvs/…`) et non une URL publique.

### CSRF / cookies
- [x] **Backend** le cookie `token` (accepté par `authMiddleware`) échappait au
      guard CSRF d'`app.js`. Source de vérité unique dans `utils/tokenCookies.js`,
      utilisé par l'auth, le guard CSRF et `uploadAuth`.
- [x] **Web** `POST /api/auth/cookie` sans garde CSRF (un formulaire cross-site
      pouvait poser un `jobsinc_token` choisi par l'attaquant) et sans validation
      du format du token.
- [x] **Web** les 3 `document.cookie = 'jobsinc_token=…'` de déconnexion étaient
      **sans effet** (cookie HttpOnly) : l'illusion d'une déconnexion. Remplacé par
      `lib/session.ts` (DELETE BFF + `/auth/logout` + fermeture du socket).

### Mobile
- [x] **Mobile** `SplashScreen` n'était routé nulle part → `AuthController.initialize()`
      n'était jamais appelé → la session n'était jamais restaurée, l'onboarding
      s'affichait à chaque démarrage, socket et FCM ne se connectaient jamais.
      Route `/splash` ajoutée en `initialLocation`.
- [x] **Mobile** aucun gestionnaire de tap sur notification (ni local, ni FCM)
      alors que `payload`/`link` étaient câblés. Ajout de
      `onDidReceiveNotificationResponse`, `onMessageOpenedApp` et
      `getInitialMessage` (avec gestion de la course au démarrage à froid).
- [x] **Mobile** PII (nom, email, téléphone, date de naissance) en clair dans
      `SharedPreferences`. Tout est passé en `FlutterSecureStorage` (cache mémoire
      hydraté), avec migration et purge des données en clair existantes.
- [x] **Android** le build `release` retombait **silencieusement** sur la config de
      signature `debug` si `key.properties` était absent. Échec explicite.

## P1 — Cohérence & performance (corrigés le 25/09/2026)

- [x] **Backend** rate limiting distribué : les 8 limiters utilisaient le
      `MemoryStore` (limite effective ×N sur multi-instance, remise à zéro à chaque
      cold start). Store Redis + clés par **utilisateur** (JWT vérifié) au lieu de
      l'IP.
- [x] **Backend** lockout de login verrouillé par couple (email, IP) → contourné
      par rotation d'IP. Verrouillage par compte, clé Redis hachée (pas d'e-mail en
      clair dans les clés).
- [x] **Backend** `getJobMatches` sans plafond : une offre à 5 000 candidatures
      produisait 5 000 recommandations et 5 000 allers-retours Redis. Plafond
      appliqué **après tri** + préchargement en un seul `MGET`.
- [x] **Backend** cache applicatif (`company:dashboard:*`, `stats:global`,
      `matching:pool:*`) purely local : une écriture sur l'instance A laissait
      l'instance B servir 30 s de données périmées — et pouvait **exclure une
      candidature fraîche des recommandations** (incohérence, pas seulement
      fraîcheur). Invalidation distribuée par Redis pub/sub.
- [x] **Backend** deux systèmes d'erreurs concurrents : `authController`
      renvoyait 500 pour des erreurs client (`new Error` au lieu de
      `ValidationError`/`NotFoundError`). `handleError` distingue désormais les
      erreurs client, propage `reqId`, et le rejet CORS renvoie 403 au lieu de 500.
- [x] **Backend** recherche `ILIKE '%…%'` sans index → seq scan. 2 migrations :
      8 index B-tree manquants + index trigram `pg_trgm` (GIN) sur les colonnes
      effectivement filtrées. Déclarés dans `schema.prisma`.
- [x] **Web** `next.config.ts` : CSP (avec `connect-src` `ws:`/`wss:` requis par le
      temps réel), HSTS en prod, `poweredByHeader: false`, retrait du wildcard
      `*.jobsinc.com` (source d'images de confiance) et de `localhost:5000` en prod,
      `API_ORIGIN` calculé de façon défensive.
- [x] **Web** `/admin/[section]` affichait **silencieusement** la table Activité
      pour toute section inconnue (`configs[section] || configs.activity`), y
      compris `/admin/settings` et `/admin/security` qui sont liés dans la nav.
      Validation serveur + `notFound()`. Liens morts retirés.
- [x] **Web** helper durci `cvHref` inutilisé, remplacé par une réimplémentation
      faible (`startsWith('http')`, pas de rejet `..`) → XSS stocké / open redirect
      sur le lien CV. Le helper partagé est désormais utilisé.
- [x] **Web** `new URL(API_URL)` au chargement du module faisait planter tout le
      bundle client (y compris l'accueil public) sur une valeur d'env malformée.
- [x] **Web** `/jobs/[id]` déclenchait 2 requêtes réseau (metadata + page) car
      `no-store` désactive la mémoïsation. `cache()` de React.
- [x] **Web** `isApiConfigured()` toujours `true` (fallback codé en dur) : 7 guards
      inatteignables, dont un message utilisateur qui ne pouvait jamais s'afficher.
- [x] **Mobile** 28 `ApiClient()`, 4 `close()` → fuite de sockets `http.Client`,
      y compris des constructions dans des callbacks de widget. Client HTTP partagé
      + `close()` sans effet s'il n'est pas possédé.
- [x] **Mobile** `AuthState`/`AuthUser` sans égalité → la déduplication de
      `AuthRouterNotifier` ne se déclenchait jamais.
- [x] **Mobile** `AppShell` appliquait `selectedIndex` sans bornage → assertion dans
      `NavigationBar` sur index hors plage.

## P2 — Dette (corrigés le 25/09/2026)

- [x] **Tests** `conversationService` — le module qui porte **tout** le modèle
      d'autorisation de la messagerie — n'avait aucun test. 24 tests ajoutés
      (`tests/conversationAuth.test.js`), branchés sur `npm test`. **Ils ont détecté
      une faille réelle** (voir P0 `membershipWhere`).
- [x] **Mobile** `int _tab` fragile dans l'espace candidat → `StatefulShellRoute`
      (onglet dans l'URL, navigation arrière et deep-links fonctionnels).
- [x] **Web** 13 fichiers `error.tsx` quasi identiques, avec de l'encodage corrompu
      dans le texte visible (`Réessayer`, `témoignages`) → 3 fichiers + un composant
      partagé. Accents corrigés.
- [x] **Code mort supprimé** : `AdminModal`, `AdminCard`, `AdminStatCard`,
      `getConversationMessages`, `getCompanyInterviews`, import de `getJobMatches`,
      `isApiConfigured` + ses 7 gardes, 2 `MainActivity.kt` obsolètes
      (`com.example.*`), client FCM `com.example.mobile` dupliqué dans
      `google-services.json`, `candidate_shell.dart` (prototype abandonné),
      `KeepAliveWrapper` devenu inutile.
- [x] **Mobile** `RecruiterJobsScreen` (424 lignes) non routé : le corps du
      tableau `/recruiter/jobs` n'est plus atteint (l'onglet Candidatures du
      dashboard recruteur est le point d'entrée réel).
- [x] **Android** R8/ProGuard activés en release (`proguard-rules.pro` ajouté).
- [x] **Web** `disconnectSocket` était un export mort — c'était en réalité une fuite :
      le socket n'était jamais fermé à la déconnexion. Branché sur `signOut()`.

## P3 — Dette restante (à planifier)

- [ ] Découper `auth_screens.dart` (~1 400 l) et `candidate_home_screen.dart`
      (~1 500 l) en un fichier par écran. Le `StatefulShellRoute` a déjà isolé la
      coquille.
- [ ] Remplacer `multipartParser` maison par `multer` (durci, mais toujours custom).
- [ ] `freezed`/`json_serializable` mobile ; `swr`/`TanStack Query` + `zod` côté web.
- [ ] Réécrire `globals.css` (lignes minifiées multi-Ko) ou adopter réellement
      Tailwind, aujourd'hui installé et configuré mais **zéro classe utilisée**.
- [ ] Tests unitaires sur `rateLimit`, `cache`, `loginLimiter`, `matchingService`
      (cache/pool), `uploadValidation` (magic bytes).
- [ ] A11y : drag & drop du pipeline sans alternative clavier ; focus management de
      `MeetingJoinModal` ; `<label>` sans `htmlFor` dans le formulaire d'entretien.
- [ ] `conversation.@@unique([companyUserId, candidateUserId])` : 1 seule
      conversation par couple, conservé volontairement.
- [ ] `very_good_analysis` + `crashlytics` + `analytics` Firebase mobile.
- [ ] Centraliser l'URL backend (actuellement dupliquée dans 8 fichiers web).
- [x] Nettoyer `scripts/` : identifiants admin en clair et PII de candidats.
      `reset-admin.js` et `test-login.js` lisaient `Admin123!` et l'e-mail de
      l'admin **en dur**, et `reset-admin` promeut un compte en `ADMIN` avec un
      coût bcrypt 10 (contre 12 partout ailleurs). Mot de passe, e-mail et
      coût passent désormais par l'environnement, avec refus explicite si le
      mot de passe fait moins de 12 caractères.

---

# P0 — Bloquants (corrigés le 25/09/2026, 2e vague)

Ces défauts ont été trouvés par une revue d'architecture **postérieure** à la
campagne ci-dessus. Ils sont tous liés : la CI existante ne pouvait pas les
voir, et un test écrit pour l'un d'eux en a révélé un autre.

## Démarrage serveur (production Vercel)

- [x] **`/uploads/*` n'existe pas sous Express 5.** `path-to-regexp` v8 (livré
      avec Express 5) refuse un `*` anonyme et exige un paramètre nommé : la
      route levait un `PathError: Missing parameter name` **au chargement du
      module**, donc au démarrage du process. Le bug était *latent* — il vit
      dans la seule branche `STORAGE_DRIVER=s3`, précisément la configuration
      déclarée **obligatoire** en production Vercel. Le E2E tournait en `local`
      et ne touchait jamais cette branche. Corrigé en `/uploads/{*splat}`,
      plus `req.params.splat` (v5 n'a plus d'index numérique).
- [x] **`{*splat}` renvoie un TABLEAU**, pas une chaîne : `['cvs','a.pdf']`.
      Interpolé, il donnait `/cvs,a.pdf`.
- [x] **Autorisation des CV entièrement contournée en S3.** `req.path` vaut
      `/uploads/cvs/x.pdf` sur une route déclarée en absolu, alors que le test
      portait sur `/cvs/…` : **jamais vrai**. Le fichier était streamé sans
      aucune vérification, et l'appel recevait 502 au lieu de 401. Les deux
      branches partagent maintenant la même décision, calculée sur le `splat`
      normalisé. `storedPathFromRequest` (côté `uploadAuth`) applique la même
      normalisation, sans quoi aucun CV n'aurait pu être lu en S3, pas même
      par son propriétaire.

## Divulgation de données personnelles

- [x] **`/uploads/cvs/**` et `/uploads/candidates/**` : « une session valide »
      suffisait.** N'importe quel candidat authentifié pouvait donc télécharger
      le CV ou la photo d'un *autre* candidat. Les URL sont des UUID4, donc le
      modèle était « URL de capacité », pas contrôle d'accès — et elles ne
      sont pas secrètes (`companyController.applicationDto` renvoie `cvUrl` aux
      recruteurs). Nouveau `src/middlewares/uploadAuth.js` : propriétaire,
      `ADMIN`, ou recruteur **disposant d'une candidature sur ce profil** — et
      rien d'autre. Index `CandidateProfile(cvUrl)` / `(avatarUrl)` pour que la
      résolution ne soit pas un seq scan.
- [x] **`/uploads` n'était pas rate-limité** (monté hors de `/api`) : débit et
      bande passante non bornés, et une vérification JWT en base par requête
      non autorisée. Nouveau `uploadServingLimiter`.
- [x] **Web** : `assetUrl` / `cvHref` acceptaient n'importe quelle URL
      `https://`. Combiné au `img-src https:`, un logo d'entreprise hostile
      stocké en base devenait un pixel de suivi. Les deux n'acceptent plus que
      l'origine de l'API.
- [x] **Web** : la rewrite `/uploads/:path*` de `next.config.ts` était
      **inatteignable** (`assetUrl` renvoie des URL absolues) et son commentaire
      décrivait une protection inexistante. Supprimée ; le mécanisme réel est
      documenté (cookie du backend en `SameSite=None`).

## Push en arrière-plan (mobile)

- [x] **Aucun push n'était jamais envoyé en arrière-plan sur mobile.**
      `conversationService` testait `!isUserConnected(userId)`, c'est-à-dire
      « aucun WebSocket ouvert ». Or **le socket mobile survit au passage en
      arrière-plan** : `isUserConnected` renvoyait toujours `true`, donc aucun
      push n'était envoyé et l'utilisateur n'était jamais prévenu. Ce
      garde-fou était conçu pour le web, où un onglet ouvert implique un écran
      visible. Nouveau prédicat `isUserActive` (au moins un socket au *premier
      plan*) : le client mobile émet `presence: { visible }` via le cycle de
      vie de l'app. Repli sur l'ancienne sémantique pour les clients qui
      n'émettent pas (web).
- [x] **Le tap sur notification n'ouvrait jamais la conversation.** Les routes
      `/chat` et `/recruiter/chat` reçoivent l'identifiant **brut** dans
      `GoRouterState.extra` (seule forme disponible dans un payload de
      notification) alors que leur builder attendait un objet `Conversation` :
      le `String` ne passait jamais le `is` et **tout** tap atterrissait sur la
      liste. Nouveau `ConversationResolver`, qui accepte les deux formes et
      résout l'identifiant auprès de l'API si la liste ne le contient pas.
- [x] **`notificationTapBackground` avait un corps VIDE** alors que son
      commentaire affirmait que le payload était persisté. Un tap alors que
      l'app est tuée démarrait l'app sans conversation cible. Branché sur
      `getNotificationAppLaunchDetails()` (mécanisme officiel, sans course) plus
      un filet via SharedPreferences.
- [x] **`takeLaunchPayload()` n'était appelé nulle part** et `_launchPayload`
      n'était jamais assigné. Consommé au démarrage, après `init()`.
- [x] **Double listener `onMessageOpenedApp`** : `main.dart` appelait
      `listenForOpenedApp()` directement, sans poser le drapeau d'unicité, donc
      le premier `initAndRegister` en installait un second (navigation en
      double) et écrasait le payload de lancement par un `getInitialMessage()`
      vierge. Point d'entrée unique `ensureOpenedListener()`.
- [x] **`unregister()` désenregistrait un token périmé** : `_lastToken` n'était
      mis à jour que par le `getToken()` initial, jamais dans le listener
      `onTokenRefresh`. L'appareil continuait de recevoir des notifications
      après déconnexion.
- [x] **Canal Android recréé dans le handler de fond.** Le manifeste déclare
      `default_notification_channel_id=messages`, et Android **supprime
      silencieusement** une notification dont le canal n'existe pas. Le canal
      n'était créé que par `LocalNotificationService.init()` — donc pas dans le
      cas qui compte : processus froid, app tuée. Créé aussi dans l'isolate de
      fond, et `messagesChannelId` partagé entre les deux.

## Rate limiting

- [x] **L'identité des quotas ignorait les cookies.** `identify()` n'inspectait
      que `Authorization: Bearer`, alors que le client web s'authentifie
      **exclusivement** par cookie HttpOnly. Toute session navigateur retombait
      sur l'IP — c'est-à-dire exactement le défaut que le commentaire du
      fichier prétendait corriger, et que `rateLimitKeys.test.js` avait été
      écrit pour empêcher. Les alias (`jobsinc_token`, `accessToken`, `token`)
      sont désormais lus.

## Identification de comptes

- [x] **Oracle d'énumération par le temps de réponse.** `!user || !(await
      verifyPassword(...))` court-circuitait : quand l'e-mail n'existait pas,
      **aucun** hachage n'était calculé. Chronométrer des connexions suffisait
      pour lister les comptes de la plateforme. Comparaison désormais
      systématique, contre un hachage factice de **coût 12**, avec garde au
      chargement qui refuse de démarrer si ce hachage factice n'est pas
      réellement en coût 12 (sinon l'oracle renaît, plus lentement).

---

# P1 — Cohérence (2e vague)

- [x] **Backend** `AppError` ne positionnait jamais `name` : toutes les erreurs
      applicatives se présentaient comme `Error`, donc non regroupables dans
      les logs et indistinguables pour `isLikelyClientError` (qui teste
      `err.name`).
- [x] **Backend** `applicationDto` ne renvoyait pas `jobId`, alors que le lien
      « Voir les candidatures » du détail d'une offre filtre la liste sur ce
      paramètre. Le lien était un **no-op silencieux** qui affichait toutes les
      candidatures de l'entreprise. `jobId` ajouté au DTO, paramètre lu côté web
      (avec boundary `Suspense` pour garder la page prérendable).
- [x] **Web** le cookie `jobsinc_admin_user` — non HttpOnly, contenant des PII,
      et lu par personne — était toujours écrit par `AdminLoginForm` alors que
      `proxy.ts` avait déjà cessé de s'y fier. Supprimé.
- [x] **Web** `AdminNavItem.permission` était déclaré (`manage_admins`) mais
      **jamais appliqué** : le lien s'affichait pour tous les admins. Le backend
      n'expose aucune permission granulaire — la notion était fictive des deux
      côtés. Champ retiré plutôt que de laisser une garantie non appliquée.
- [x] **Mobile** `ref.listenManual` ouvrait un abonnement indépendant du cycle
      de vie du widget, jamais annulé : il survivait au `State` et continuait de
      connecter le socket / enregistrer le FCM sur un widget détruit.
- [x] **Mobile** `RecruiterJobsScreen` (424 l) n'était routé nulle part : les
      recruteurs ne pouvaient **pas publier d'offre** depuis l'app, alors que le
      repository et le contrôleur existaient. Onglet « Offres » ajouté.
- [x] **Mobile** `copyWith` ne pouvait pas effacer un champ nullable
      (`error ?? this.error` rendait `error: null` inopérant) : l'erreur restait
      affichée après un envoi réussi. `clearError` explicite, comme
      `NotificationsState` l'avait déjà fait.
- [x] **Mobile** `deleteNotification` : `firstWhere` levait une `StateError`
      avalée par un `catch` muet, la ligne retirée réapparaissait au
      rafraîchissement suivant.
- [x] **Tests** les **4** fichiers de test absents de `npm test` sont branchés
      (`web-cors`, `jobInput`, `companyControllerExports`, + les nouveaux). C'est
      précisément `companyControllerExports` — le seul test qui vérifie que le
      graphe de routes charge — qui aurait attrapé le `PathError` du P0 n° 1.

## Nouveaux fichiers de test (non-régression)

| Fichier | Couvre |
|---|---|
| `uploadAuth.test.js` (27) | Autorisation de lecture CV/avatar : propriétaire, tiers, recruteur avec/sans candidature, ADMIN, traversée de chemin, **normalisation S3** |
| `uploadRouting.test.js` (6) | Par HTTP : `/uploads/cvs/**` protégé dans les **deux** drivers, `/uploads/companies/**` public |
| `presence.test.js` (9) | Machine à états de présence : arrière-plan, retour, multi-appareils, déconnexion, repli web |
| `authTiming.test.js` (6) | Oracle d'énumération refermé, messages indistincts, garde du coût 12 |
| `appGraph.test.js` (7) | Le graphe Express se **construit et répond** dans les deux modes de stockage |

## Validation (2e vague)

| Commande | Résultat |
|---|---|
| `npm test` (backend) | **117 tests** — 8 fichiers, tous verts |
| `node --check` × 90 fichiers backend | 0 échec |
| `npx prisma validate` | valide (index `cvUrl`/`avatarUrl` + migration) |
| `npx tsc --noEmit` (web) | 0 erreur |
| `npm run build` (web) | ✓ 52 pages générées |
| `npx eslint` (web) | 0 erreur, 81 warnings (préexistants) |
| `flutter analyze` | **No issues found** |
| `flutter test` | 4 tests verts |
| `flutter build apk --debug` | ✓ APK construit (manifeste + ressources validés) |

## Reste à faire (non traité — nécessite un accès plateforme)

- [ ] **Tourner la clé de service Firebase.** `backend/serviceAccountKey.json`
      contient une clé privée RSA live (projet `jobsinc-5db6c`) et **n'est pas
      suivi par git** — vérifié — mais il est présent dans l'arbre de travail
      et chargé par défaut (`pushService.js`). Idem
      `backend/backups/*.sql` (2 dumps complets) et `backend/uploads/` (23 CV,
      7 photos). Aucun n'est versionné, donc rien à purger dans l'historique
      **à condition qu'ils n'aient jamais été commités**.
- [ ] Configurer iOS : `GoogleService-Info.plist`, `Runner.entitlements`,
      `aps-environment`, `DEVELOPMENT_TEAM`. L'identifiant de bundle a été
      aligné sur `com.jobsinc.mobile`, mais iOS reste non livrable.
- [ ] Zod sur l'inscription (`candidateRegisterSchema` / `companyRegisterSchema`
      sont toujours du code mort) et `handleError` dans les 15 autres
      controllers.
- [ ] Découper les fichiers > 1 300 l côté mobile, ~730 l côté web.
- [ ] Supprimer ou adopter réellement Tailwind (installé, zéro classe utilisée).
- [ ] `upgrade-insecure-requests` / nonces CSP : le premier est désormais
      conditionné à la prod, les nonces restent à faire.
- [ ] `Employment` n'est jamais mis `INACTIVE` (l'enum existe, l'API non) ; le
      rôle `CANDIDATE` → `EMPLOYEE` n'a pas de retour arrière.

| Commande | Résultat |
|---|---|
| `npm test` (backend) | **51/51** — 27 matching + 24 autorisation messagerie |
| `node --check` × 71 fichiers backend | 0 échec |
| `npx prisma validate` | valide |
| `npx tsc --noEmit` (web) | 0 erreur |
| `npm run build` (web) | ✓ 52 pages générées |
| `npx eslint` (web) | 0 erreur, 82 warnings (préexistants, tolérés en CI) |
| `flutter analyze` | **No issues found** |

## Notes

- La **CI existe déjà** (`.github/workflows/ci.yml` + `cd.yml`) : Postgres 16 en
  service, `prisma migrate deploy`, tests unitaires + E2E, `tsc --noEmit`,
  `next build`, `flutter analyze` + build APK. Ce document la listait
  historiquement comme dette.
- `lint` web en `continue-on-error` avec ~30 warnings tolérés : à passer à 0.
- Le build APK `release` échoue désormais explicitement sans `key.properties` ;
  le job CD (`build-mobile`) utilise `--release` et **nécessite donc le secret**
  `android/key.properties` pour passer en CI.
- Ce garde-fou est **conditionnel à une variante release réellement demandée**
  (`build.gradle.kts` inspecte `gradle.startParameter.taskNames`) : sans cela il
  s'exécutait aussi pour `assembleDebug` et cassait `flutter run` en local. Même
  règle pour le `key.properties` incomplet, qui levait un `ClassCastException`
  illisible dès la configuration.
