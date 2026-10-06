# JOBSINC — État d'avancement

**Source de vérité unique.** Ce document remplace `TODO_CORRECTIONS.md` et
`TODO_CORRECTIONS_V2.md`, qui se contredisaient : le second affirmait « tout
exécuté, rien supposé » alors que le premier comptait 16 points non traités.
Deux documents d'état contradictoires apprennent au prochain lecteur à se
méfier de l'un des deux. Les deux anciens sont conservés comme archive, mais
ne sont plus suivis.

Dernière mise à jour : **2026-10-06**.

---

## Session du 2026-10-06 : « tout le corrigeable en code » (sans chantiers gelés)

Périmètre validé avant exécution : a11y focus/Échap + Zod inscription alignés
+ tests. Explicitement exclus : CSP nonces, migration `multer`, i18n, split
mobile, décisions métier (`Employment`/`Conversation`), S3/Redis dashboard.

- [x] **`backend/serviceAccountKey.json` supprimé du poste.** Fichier local
      (2,3 Ko, gitignoré, jamais committé) effacé après vérification que
      `pushService` dégrade proprement sans clé (warn + push désactivé,
      `backend/src/services/pushService.js:51`). Restent côté humain : rotation
      Neon + clé Firebase `AIza…` (purge Git ne révoque rien) et config S3.
- [x] **`useEscapeToClose` corrigé (bug réel).** Le déclencheur était capturé
      au moment d'Échap — donc DANS le menu, retiré du DOM par `onClose()` —
      puis `document.contains(trigger)` toujours faux : focus jamais restitué.
      Déclencheur mémorisé À L'OUVERTURE + repli sur `button[aria-expanded]`
      (`entreprise/components/ui/useDialogFocus.ts`).
- [x] **Pipeline « Déplacer » : Échap + restitution focus.** `triggerRefs` par
      carte, listener Échap, `closeMovePanel()` avec `requestAnimationFrame`,
      `aria-expanded`/`aria-controls` conservés, `role="group"` conservé (pas
      de `menu` sans flèches — même piège que `AdminUserMenu`).
      (`entreprise/components/dashboard/PipelineOverview.tsx`).
- [x] **`AdminGlobalSearch` : Échap + focus.** Branché sur `useEscapeToClose`,
      `aria-expanded`/`aria-controls` + `id` panneau
      (`entreprise/components/admin/layout/AdminGlobalSearch.tsx`).
- [x] **Zod inscription alignés et branchés.** `candidateRegisterSchema` /
      `companyRegisterSchema` champ à champ avec `authService`
      (`companyName`, requis stricts, bornes `validateLength`/`validateAge`,
      `.passthrough()` pour les champs extra client) + garde de forme en tête
      de `createCandidate`/`createCompany` (Zod rejette tôt, contrôles
      existants gardent le dernier mot).
- [x] **Tests :** `backend/tests/registerValidation.test.js` (6 tests :
      parité requis/rejets + `VALIDATION_ERROR` 400 + pattern de branchement),
      câblé `test:registervalidation` dans `npm test` ;
      `entreprise/tests/a11yFocus.test.ts` (3 tests pattern de source).
      Vérifié : backend suite complète verte, web **25/25** + `typecheck`
      propre, `registerValidation` 6/6 + `uploadStorage` 2/2.
- Base non committée préservée : correctif 503 `multipartParser` + test
  `uploadStorage` intacts ; autres `M` de l'arbre (home/dashboard) non touchés.

---

## Session du 2026-10-06 : clé FCM installée + bug `logger.log` trouvé et fixé

- [x] **Nouvelle clé service installée en local** (fichier reçu par
      téléchargement) : copiée à `backend/serviceAccountKey.json` (gitignoré),
      `project_id=jobsinc-5db6c` vérifié, copie `Downloads` supprimée après
      contrôle d'empreinte identique. Reste côté humain : ~~révoquer l'ancienne
      clé (console Firebase → Comptes de service)~~ **fait le 2026-10-06**
      (ancienne clé supprimée, nouvelle `3d6ef079…` conservée, init push
      toujours verte) + poser le base64 dans `FCM_SERVICE_ACCOUNT_JSON`
      sur Render.
- [x] **Bug `logger.log` inexistant (2 sites).** `pushService.js:68` et
      `config/redis.js:34` appelaient `logger.log()`, qui n'existe pas (le
      logger expose info/warn/error/debug/exception) : côté push, le chemin
      SUCCÈS levait un TypeError rattrapé par le catch → `messaging = null`
      (clé valide mais push désactivé) ; côté redis, throw dans le handler
      `connect`. Fix `logger.info` + 4e test de discipline
      (`tests/loggingDiscipline.test.js`) interdisant tout `logger.METHODE`
      inconnue. Vérifié : `Push: Firebase initialisé (projet jobsinc-5db6c)`
      en `info`, discipline 4/4, suite backend complète verte.

---

## Session du 2026-10-06 : réseau social candidats (pushé en prod)

- [x] **Backend `/api/network`** : `NetworkPost`, `NetworkLike`
      (`@@unique([postId,userId])`), `NetworkComment`, `NetworkFollow`
      (`@@unique([followerId,followingId])`) + migration
      `20261006142650_network` (appliquée prod). Service pur testé,
      contrôleur + routes montées sous `candidateLimiter`
      (`backend/src/app.js`). Publication réservée CANDIDATE/EMPLOYEE/ADMIN,
      lecture tout authentifié, notif `Notification` sur like/comment/follow.
- [x] **Mobile onglet Réseau** : `features/network/` (modèles, repository sur
      `ApiClient` partagé, providers Riverpod), `NetworkFeedScreen` (composer,
      fil + likes, bottom-sheet commentaires, annuaire + Suivre/Suivi).
      `AppShell` + `router.dart` passés à 5 onglets
      (Accueil/Candidatures/**Réseau**/Messages/Profil).
- [x] **`.gitignore` backend corrigé** : `*.sql` ignorait aussi les
      `prisma/migrations/*/migration.sql` (jamais suivies en Git) → `migrate
      deploy` Render ne voyait aucune migration. Ajout
      `!prisma/migrations/**/*.sql` (DDL uniquement, dumps toujours ignorés).
- [x] **Déployé** : commit `4080327` pushé sur `main`, Render a redéployé
      (uptime retombé, `/api/network/feed` sans token → 401 attendu).
      Vérifié : backend 18 scripts verts, mobile 34/34 + `flutter analyze`
      clean, `/health` + `/api/auth/login` prod OK.
- [ ] **Reste côté humain** : le login prod « Identifiants invalides » est un
      problème de compte (absent de la base prod ou mauvais mot de passe),
      pas de code — à trancher avec l'email testé.

---

## Convention

- `[x]` fait et **vérifié** par un test ou une exécution
- `[ ]` non fait, avec la raison
- `[→]` **bloqué sur une action humaine** : aucun code ne peut le résoudre

---

## P0 — Bloquant : action humaine requise

Ces trois points ne sont pas des tâches de développement. Ce sont des
operations sur des consoles tierces, et **aucune ligne de code ne les
remplacera**.

- [→] **Pivoter la clé Neon `neondb_owner`**, puis la clé API **Firebase
      `AIza…`** (compte de service : ancienne clé supprimée le 2026-10-06,
      nouvelle `3d6ef079…` en place, base64 posé sur Render ; clé API Android
      régénérée + restreinte à `com.jobsinc.mobile`, `google-services.json`
      re-téléchargé et vérifié le 2026-10-06 — supprimer l'ancienne clé dans
      Identifiants). Reste **Neon** (reset owner + `DATABASE_URL`/`DIRECT_URL`
      Render). L'historique Git a été purgé (49 commits réécrits), mais une
      purge **ne révoque rien** : tant que ces clés n'ont pas changées, elles
      restent utilisables par quiconque a lu l'ancien historique. Procédure :
      `DEPLOY.md` §6.2. *C'est le seul risque de sécurité réel du dossier.*
- [→] **Supprimer `backend/serviceAccountKey.json`** du poste de
      développement — **fait le 2026-10-06** (fichier effacé, `pushService`
      dégrade en warn sans clé). Reste la rotation éventuelle dans la console
      Firebase si la clé a été exposée.
- [→] **Configurer le stockage S3 dans le dashboard Render** :
      `STORAGE_DRIVER=s3`, `AWS_S3_BUCKET`, `AWS_S3_REGION`,
      `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, et `APP_URL=https://jobsinc.onrender.com`.
      Sans cela, chaque redéploiement efface les fichiers : c'est **observé**,
      les 16 logos référencés en base répondaient tous 404.

### Reprise des fichiers, une fois S3 configuré

- [x] **Script de migration** `backend/scripts/migrate-uploads-to-s3.js`.
      52 fichiers, 12,3 Mio, relevés sur la copie locale : 29 CV, 7 photos de
      candidats, 16 logos. Idempotent, réversible, mode inventaire par défaut.
- [ ] **Exécuter** `node backend/scripts/migrate-uploads-to-s3.js --apply`
      puis `--apply` depuis le dépôt. Ne peut pas être fait ici : il faut les
      credentials AWS.

---

## P1 — Corrigé et vérifié lors de cet audit

### Session du 2026-10-05 : photos de profil mobile + suite P2

- [x] **Photos de profil invisibles sur mobile (signalé).** Cause : deux
      couches. (1) `/uploads/candidates/**` et `/uploads/cvs/**` exigent un
      JWT (`uploadAuth`), mais `CachedNetworkImage` / `CachedNetworkImageProvider`
      n'envoyaient aucun en-tête → 401 systématique → fallback initiales. Les
      logos `/uploads/companies/**` (publics) marchaient, d'où le contraste.
      (2) Les avatars de conversation/matching sortaient en valeur brute DB
      (URL S3 publique historique possible) au lieu du chemin canonique.
      Correctif : `ApiClient.isProtectedUploadUrl` + `ApiClient.imageHeaders`
      (`mobile/lib/core/services/api_client.dart:61`), `AppCachedImage` passé en
      `ConsumerWidget` avec injection auto du Bearer
      (`mobile/lib/core/widgets/app_cached_image.dart:9`), nouveau
      `authenticatedAvatarProvider` / `AuthCircleAvatar`
      (`mobile/lib/core/widgets/authenticated_image.dart:1`), branché sur
      `profile_screen`, `messages_screen`, `chat_screen` ; JWT jamais envoyé
      hors backend (hôte tiers exclu). Éviction du cache à l'upload d'avatar
      (`candidate_provider.dart:250`). Backend : `canonicalUploadPath` appliqué
      aux avatars de `conversationService` (`avatarOf`, `serializeSummary`),
      `matchingService.toRecommendationFromMatch` et `companyController`
      (candidats). Vérifié : `flutter test` 26/26 (5 nouveaux tests
      `Images protégées`), backend 17/17, `flutter analyze` sans nouvelle
      alerte.
- [x] **`aria-describedby` formulaires login/inscription.**
      `ConfirmDialog` l'avait déjà (`aria-labelledby` + `aria-describedby`,
      `ConfirmDialog.tsx:78`). Restait : `AuthForm` et `RegistrationForm`
      (champs sans lien vers le `role="alert"`). Ajout `useId` + `aria-invalid`
      + `aria-describedby` sur tous les champs et `id` sur l'erreur, sans
      changer le flux (client fetch vers le BFF `/api/auth/cookie`, cf. guide
      Next `forms.md` + `backend-for-frontend.md` lus avant édition).
      Reste : alternative clavier au drag & drop pipeline, focus à la
      fermeture des panneaux.
- [x] **Redis rendu explicite (sans décider).** `/health` expose désormais
      `rateLimitMode: distributed|per-instance`
      (`backend/src/utils/healthCheck.js:138`) et l'encart admin `system`
      affiche une ligne « Quotas de requêtes » dédiée au lieu d'une mention
      noyée. La décision d'activer `REDIS_URL` + `REQUIRE_REDIS=true` reste
      humaine.
- [x] **`adminController` découpé (711 → façade).** `users.js`, `companies.js`,
      `content.js`, `insights.js`, `system.js` + `_shared.js`
      (`backend/src/controllers/admin/`), `adminController.js` réduit à la
      ré-exportation (routes inchangées). Équivalence vérifiée : mêmes clés
      d'export, corps identiques à la normalisation près (seul `system` porte
      l'ajout `rateLimitMode`), `companyControllerExports` + `appGraph` verts,
      discipline `logger` respectée (import direct par module).
- [x] **Zod inscription : statu quo documenté, pas de branchement.**
      `zodSchemas.js:1` démontre que les schémas supprimés divergeaient
      (`companyName` vs `name`, optionnels vs `validateRequired`) : les
      rebrancher affaiblirait la validation. Décision : frontière unique
      `authService.js`, à rouvrir seulement avec des schémas alignés.
- [x] **`multipartParser` → `multer` : non fait, assumé.** Durci + magic bytes,
      classé outillage par l'audit précédent. Remplacement = risque sans gain
      de sécurité ; à planifier comme chantier, pas comme correction.

- [x] **Journalisation normalisée.** 124 `console.*` convertis vers
      `utils/logger` dans 23 fichiers ; il en reste **0** (hors `logger.js`
      lui-même) pour 129 appels `logger`. `console.error('msg', err)` sortait
      la pile complète en texte libre sur stdout, et **ignorait `LOG_LEVEL`** :
      un `LOG_LEVEL=error` laissait passer les warnings de dégradation, soit
      l'inverse de l'effet recherché. `console.warn(3 args)` de `config/redis`
      Tail aussi converti.
- [x] **Test de discipline de journalisation**
      (`tests/loggingDiscipline.test.js`, 3 assertions). Interdit la
      réintroduction d'un `console.*` et détecte un `logger` utilisé sans
      import — un cas qui passe le build et ne casse qu'à l'exécution, donc en
      production. Mutation-testé dans les deux sens.
- [x] **`.gitattributes` racine.** Il n'y en avait aucun alors que
      `core.autocrlf=true` : 8 fichiers étaient `i/mixed`, et c'est la cause
      racine du bug déjà rencontré sur `gradlew` (`\r: command not found` sur
      runner Unix). Les deux fichiers de build Android (`AndroidManifest.xml`,
      `gradle.properties`) ont été normalisés en LF ; les 3 CSS restants sont
      désormais marqués `eol=lf` et se normaliseront au prochain touchage —
      les forcer ici aurait produit un diff de plusieurs centaines de lignes
      sans risque de build.
- [x] **`.github/dependabot.yml`.** Aucun existed. `npm audit` n'a pas pu être
      exécuté faute de réseau lors de cet audit : **l'état des vulnérabilités
      des dépendances est donc inconnu**, et c'est le seul angle non mesuré.
      Dependabot ouvre une PR, donc la correction passe par la CI existante au
      lieu d'être subie. Couvre `backend`, `entreprise`, les actions GitHub et
      `mobile`.
- [x] **`package.json` racine.** Il n'y avait aucune commande unique de
      vérification, pour trois gestionnaires de paquets distincts. `npm run
      verify` enchaîne désormais typecheck web + suite backend + suite web ;
      `verify:all` ajoute Flutter. Aucune dépendance déclarée : ce n'est pas un
      workspace, c'est un point d'entrée de commandes.
- [x] **Primitive `.tap-target`.** La cible tactile de 44 px vivait dispersée :
      deux fois dans `pipeline.css`, une fois dans `globals.css`, et en
      `style={{ minHeight: '44px' }}` dans deux TSX. Le mesuremont était net :
      `min-height:44px` apparaissait 2 fois, `min-width:44px` **0 fois** —
      donc la cible était garantie en hauteur et pas en largeur, sur aucun
      contrôle. La primitive porte les deux axes.

---

## P2 — Restant, avec effort estimé

Classé par rapport coût/bénéfice, pas par gravité théorique.

### Faible coût, gain réel

- [x] **`aria-describedby` / `aria-labelledby` : dialogues et formulaires
      d'authentification.** `ConfirmDialog` déjà conforme ; `AuthForm` et
      `RegistrationForm` (12 champs + selects + textarea) associés à leur
      `role="alert"` le 2026-10-05. Reste : alternative clavier au drag & drop
      du pipeline, focus à la fermeture des panneaux.
- [x] **Redis rendu explicite.** `/health` expose `rateLimitMode` et l'encart
      admin affiche la ligne « Quotas de requêtes » (2026-10-05). Reste la
      DÉCISION humaine : activer `REDIS_URL` + `REQUIRE_REDIS=true` ou assumer
      par écrit les quotas par instance.
- [x] **`adminController` découpé.** Façade + 5 modules par domaine
      (`backend/src/controllers/admin/`, 2026-10-05), équivalence corps à corps
      vérifiée, suites vertes.
- [x] **Compléter le `TODO` d'accessibilité** (2026-10-06) : Échap +
      restitution du focus sur panneau pipeline (`triggerRefs`,
      `closeMovePanel`), `AdminGlobalSearch` branchée sur `useEscapeToClose`
      (déclencheur mémorisé à l'ouverture, bug du `contains` toujours faux
      corrigé). Le DnD pointeur subsiste avec son alternative clavier
      « Déplacer » (pattern `group` + `aria-expanded`, pas de `menu` sans
      flèches) : WCAG 2.1.1 couvert.

### Décision produit à trancher

(Tailwind est passé de l'autre côté : c'était un arbitrage technique, pas un
choix de design.)

- [x] **Tailwind retiré.** Il était installé, configuré dans
      `postcss.config.mjs`, et **zéro classe utilisée** : les 15 feuilles
      définissent des classes sémantiques maison. Il n'apportait que son
      `preflight`, dont l'équivalent est désormais écrit en tête de
      `app/globals.css` — chaque bloc justifié par un **comptage d'éléments**
      réellement présents dans les .tsx. `postcss.config.mjs` supprimé, les 2
      dépendances retirées, lockfile régénéré : **446 → 411 paquets**.
      *Ce que le retrait n'est PAS : un gain de performance. Le bundle ne
      déclarait que 38 variables, dont **zéro** variable de theme Tailwind
      inutilisée — Tailwind v4 n'émet que les variables employées. Le gain est
      125,1 → 120,5 Ko de CSS, soit 4 %.*
- [ ] **CSP : nonces.** `script-src` conserve `'unsafe-inline'`, nécessaire
      aujourd'hui aux scripts inline de Next.js. Supprimer ce `'unsafe-inline'`
      impose les nonces et donc un rendu dynamique — c'est un choix technique,
      pas un nettoyage. *Décision + architecture.*
- [ ] **Internationalisation.** 465 lignes de français en dur côté web, et le
      mobile aussi. Aucun fichier i18n. Défendable si le marché reste
      francophone ; sinon une refonte, pas une traduction. *Décision.*

### Refactorings à risque

- [ ] **Découper `candidate_home_screen.dart` (1 562 l.) et
      `auth_screens.dart` (1 409 l.).** Non fait délibérément. C'est le ratio
      de test le plus défavorable de la plateforme — 16 688 lignes de Dart pour
      **un seul** fichier de test, contre 17 fichiers côté backend — donc
      précisément les bugs d'affichage qui vous ont signalé des photos
      cassées. Mais sans filet de test, découper augmente le risque au lieu de
      le réduire. *L'ordre qui compte : écrire les tests d'abord.*
- [x] **Zod sur l'inscription** (2026-10-06) : `candidateRegisterSchema` /
      `companyRegisterSchema` réécrits ALIGNÉS (`companyName`, requis stricts,
      bornes `validateLength`/`validateAge` exactes) + branchés en garde de
      forme dans `createCandidate`/`createCompany` (les contrôles existants
      gardent le dernier mot). Parité verrouillée par
      `tests/registerValidation.test.js` (6 tests). Modèle suivi :
      `jobCreateSchema`.
- [ ] **Remplacer le `multipartParser` maison par `multer`.** Durci, avec
      contrôle des magic bytes, mais toujours sur mesure. *Outillage, pas
      sécurité.*

### À vérifier côté métier

- [ ] `conversation.@@unique([companyUserId, candidateUserId])` : une seule
      conversation par paire. **Contrainte de schéma** — à valider avec le
      produit, pas à corriger.
- [ ] `Employment` n'est jamais mis `INACTIVE` : l'enum existe, l'API non.
- [ ] `upgrade-insecure-requests` est en place en production ; il ne l'est pas
      en développement, délibérément (il casserait les requêtes vers le backend
      local en `http://localhost:3000`).

---

## Ce qui a été vérifié lors de cet audit

Mesures brutes, pour que l'état ci-dessus soit contestable :

| Mesure | Valeur |
|---|---|
| `console.*` dans `backend/src` | 124 → **0** |
| Fichiers de test | backend 18, web 3, mobile 1 (mobile : 21 → **26 tests**) |
| `adminController` | 711 l. monolithe → **façade + 5 modules** (`admin/`) |
| Avatars mobile | 401 sans JWT → **Bearer auto** (protégés), public/tiers inchangés |
| Avatars backend | bruts DB (conversations, matching, candidats) → **`canonicalUploadPath`** |
| `/health` | `redis: down` seul → **`rateLimitMode`** + ligne admin dédiée |
| Lignes de code | backend 14 105, entreprise 7 150, mobile 16 688 |
| Secrets dans l'arbre de travail | **0** (Neon, Google, JWT, clé privée, AWS) |
| `.gitattributes` / `.editorconfig` | absents → **ajoutés** |
| `dependabot.yml` | absent → **ajouté** |
| Fichiers à fins de ligne mixtes | 8 → 3 (marqués `eol=lf`, normalisés au prochain touchage) |
| `min-width:44px` | 0 → règle globale via `.tap-target` |
| Paquets npm (`entreprise`) | 446 → **411** (Tailwind retiré) |
| CSS compilé | 125,1 → **120,5 Ko** |
| Dépendances | 3 registres couverts par Dependabot |

Suites exécutées : backend **17 scripts**, web **22 tests**, typecheck web,
build web — tous verts.

Session 2026-10-05 : backend **17/17 (EXIT:0)**, web **22/22** + typecheck +
build (52+ pages), mobile **26/26** (`flutter test`), `flutter analyze`
sans nouvelle alerte (5 infos + 1 warning préexistants).

## Angle non mesuré

`npm audit` n'a pas pu être exécuté (pas d'accès réseau). L'état des
vulnérabilités des dépendances est donc **inconnu**. Dependabot couvrira le
suivi à partir du moment où cette branche est fusionnée.
