# JOBSINC — État d'avancement

**Source de vérité unique.** Ce document remplace `TODO_CORRECTIONS.md` et
`TODO_CORRECTIONS_V2.md`, qui se contredisaient : le second affirmait « tout
exécuté, rien supposé » alors que le premier comptait 16 points non traités.
Deux documents d'état contradictoires apprennent au prochain lecteur à se
méfier de l'un des deux. Les deux anciens sont conservés comme archive, mais
ne sont plus suivis.

Dernière mise à jour : **2026-09-27**.

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
      `AIza…`**. L'historique Git a été purgé (49 commits réécrits), mais une
      purge **ne révoque rien** : tant que ces clés n'ont pas changées, elles
      restent utilisables par quiconque a lu l'ancien historique. Procédure :
      `DEPLOY.md` §6.2. *C'est le seul risque de sécurité réel du dossier.*
- [→] **Supprimer `backend/serviceAccountKey.json`** du poste de
      développement. Clé privée RSA vivante sur disque, gitignorée, jamais
      committée — mais présente.
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

- [ ] **`aria-describedby` / `aria-labelledby` sur les dialogues et les erreurs
      de formulaire.** Mesure : 62 `aria-label` mais **2** `aria-describedby`.
      Il y a des étiquettes et presque aucune relation programmatique. Un
      lecteur d'écran énonce le titre d'un dialogue sans le rattacher à son
      corps, et les champs ne sont pas associés à leur message d'erreur.
      *Estimation : quelques heures sur `ConfirmDialog`, les formulaires de
      login/inscription et les états d'erreur du dashboard.*
- [ ] **Décider Redis.** `/health` renvoie `redis: down` en production : le
      service dégrade proprement, mais les quotas de rate-limiting sont **par
      instance**. Sur N instances, un attaquant dispose de N fois le quota, et
      rien ne le signale au-delà d'une ligne dans un tableau de santé. Il faut
      soit activer `REDIS_URL` + `REQUIRE_REDIS=true`, soit assumer par écrit
      que les quotas sont par instance. *Décision, pas développement.*
- [ ] **Réduire `adminController`.** 711 lignes, 21 appels de journalisation.
      Le fichier concentre à lui seul un tiers de la surface du contrôleur.
      *Estimation : une demi-journée de découpage par domaine (users, companies,
      jobs, applications, moderation, system).*
- [ ] **Compléter le `TODO` d'accessibilité** : drag & drop du pipeline sans
      alternative clavier, gestion du focus à la fermeture des panneaux.

### Décision produit à trancher

- [ ] **Tailwind : adopter ou retirer.** Installé, configuré dans
      `postcss.config.mjs`, **zéro classe utilisée** — les 15 feuilles
      définissent des classes sémantiques maison (`admin-card`,
      `dashboard-panel`, `jobs-grid`). Le coût est réel : une dépendance
      présente dans le bundle, et une question à laquelle chaque nouveau
      développeur doit répondre. *Décision.*
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
- [ ] **Zod sur l'inscription** (`candidateRegisterSchema`,
      `companyRegisterSchema`). Les schémas existent mais ne sont pas branchés :
      les brancher affaiblirait la validation actuelle, qui distingue `name` et
      `companyName`. *À faire avec le même soin que `jobCreateSchema`.*
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
| Fichiers de test | backend 18, web 3, mobile 1 |
| Lignes de code | backend 14 105, entreprise 7 150, mobile 16 688 |
| Secrets dans l'arbre de travail | **0** (Neon, Google, JWT, clé privée, AWS) |
| `.gitattributes` / `.editorconfig` | absents → **ajoutés** |
| `dependabot.yml` | absent → **ajouté** |
| Fichiers à fins de ligne mixtes | 8 → 3 (marqués `eol=lf`, normalisés au prochain touchage) |
| `min-width:44px` | 0 → règle globale via `.tap-target` |

Suites exécutées : backend **17 scripts**, web **22 tests**, typecheck web,
build web — tous verts.

## Angle non mesuré

`npm audit` n'a pas pu être exécuté (pas d'accès réseau). L'état des
vulnérabilités des dépendances est donc **inconnu**. Dependabot couvrira le
suivi à partir du moment où cette branche est fusionnée.
