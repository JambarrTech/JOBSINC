# JOBSINC — Plan de correction V2 (26/09/2026)

Analyse: code analyst + full-stack + UI/UX + DevOps.
**Contrainte absolue : aucune nouvelle fonctionnalité.** Uniquement des corrections
de bugs, de sécurité, de dette et de qualité de livraison.

Chaque ligne porte une référence `fichier:ligne` vérifiée avant édition.

**État : toutes les sections A à F sont appliquées et vérifiées par exécution
(voir « Vérification » en bas).**

---

## A — DevOps

| # | Correction | Fichier | Pourquoi |
|---|---|---|---|
| A1 | ~~Supprimer `\|\| true` sur `vercel build` et `\|\| echo skip`~~ | `cd.yml` | Un build prod cassé passait au vert. |
| A2 | ~~Retirer `continue-on-error` du lint~~ | `ci.yml` | Porte de qualité décorative. |
| A3 | ~~Retirer `\|\| echo "no tests yet"`~~ | `ci.yml` | Un test mobile rouge ne bloquait rien. |
| A4 | `.gitignore` mobile + `git rm --cached` | `google-services.json` | Fichier de config projet commité. |
| A5 | **`node --check src/app.js \|\| true`** | `cd.yml` | **Trouvé par la vérification YAML, pas par la lecture** : masquait une erreur de syntaxe dans le graphe Express. |
| A6 | **`\|\| echo "hook skip"` sur le hook Render** | `cd.yml` | Le hook *est* le déclencheur du déploiement : son échec rendait un deploy cassé invisible. |
| A7 | **`npm test` ajouté au job backend du CD** | `cd.yml` | Le CD ne jouait aucun test backend. |

> Il reste **un** `|| true` dans `ci.yml` (`kill $SRV_PID`), qui est du
> **nettoyage** et non une porte : le commenter l'assumer le rend explicite.

---

## B — P0 fonctionnels

| # | Correction | Fichier | Pourquoi |
|---|---|---|---|
| B1 | Map littérale des endpoints Admin | `lib/admin-api.ts:99-141` | Next n'inline pas `process.env[key]` → **les 16 tables `/admin/<section>` étaient VIDES**, sans erreur ni log. |
| B2 | Bouton « Exporter » + état vide honnête | `AdminResourcePage.tsx:23-31, 46, 62` | `disabled` toujours vrai ; affichage « endpoint non configuré » au lieu d'un tableau vide muet. |
| B3 | `.env.example` + `README.md` réécrits | — | `SECURITY_ALERTS` était un nom **faux** (le `_` est supprimé par le `replace`) ; 6 variables absentes. |
| B4 | `lib/api-url.ts` — source de vérité unique | 5 modules, 7 sites | 7 copies codées en dur, désaccordées avec le CD (`api.jobsinc.com` vs `jobsinc.onrender.com`). |
| B5 | `remotePatterns` dérivé de l'API | `next.config.ts` | `api.jobsinc.com` absent → `next/image` 400 sur les uploads en prod. |
| B6 | CTA public « Postuler » | `app/jobs/[id]/page.tsx:111-127` | Poinçait vers `/register` = formulaire **entreprise** en 4 étapes. Remplacé par une note honnête vers l'app mobile. |

---

## C — Sécurité

| # | Correction | Fichier | Pourquoi |
|---|---|---|---|
| C1 | **Vérification du jeton via `/auth/me` avant écriture** | `app/api/auth/cookie/route.ts` | Le POST ne validait le jeton que par **regex de forme** : fixation de session + déconnexion forcée. |
| C2 | Garde CSRF **fail-closed** + comparaison à l'origine de la requête | `route.ts:33-41` | `if (!origin) return true` : toute requête mutante sans `Origin` passait. |
| C3 | Préfixe `__Host-` en production | `lib/auth-cookie.ts:46-56` | Ferme le trou `secure: NODE_ENV` — le navigateur, pas la config, devient l'autorité. |
| C4 | Un seul nom de cookie lu/écrit | `proxy.ts:81-83` | `accessToken` / `token` étaient promus en bearer tokens : **tout cookie portant ces noms génériques devenait une credential**. |
| C5 | Gardes client supprimés, identité transmise par le proxy | `DashboardShell`, `AdminShell`, `+Frame` | Leur `catch` inconditionnel **détruisait une session valide sur simple panne réseau**. Ce n'étaient pas des frontières de sécurité. |
| C6 | Rôle relu en base | `backend/src/middlewares/authMiddleware.js:27-56` | Le rôle venait du JWT : une rétrogradation restait active 15 min. `uploadAuth.js` faisait déjà mieux. |
| C7 | `tokenVersion` incrémenté à la promotion ADMIN | `backend/scripts/reset-admin.js:47-57` | Réinitialiser le mot de passe d'un admin laissait ses anciens tokens valides. |
| C8 | `DEFAULT_ADMIN_ROLES` aligné sur `enum Role` | `lib/admin-roles.ts:24-25` | `SUPER_ADMIN`/`SYSTEM_ADMIN` n'existent pas : le proxy admettait, le backend 403. |
| C9 | Filtre `SUPER_ADMIN` retiré du catalogue | `lib/admin-resources.ts:25` | Filtrer sur un rôle non accordable. |

### C10 — trouvé en cours d'exécution, bien plus grave que le reste

**Les quatre endpoints de connexion n'avaient AUCUN verrouillage de compte.**

`const email = req.body.email;` était déclaré **dans** le bloc `try`, puis
`recordFailedAttempt(email)`` était appelé dans le `catch`. `const` étant lié à
son bloc, `email` était **invisible** depuis le `catch` :

```
ReferenceError: email is not defined
  at exports.loginCompany (src/controllers/authController.js:236:33)
```

Conséquences :
1. tout mot de passe erroné renvoyait **500** au lieu de 401 ;
2. `recordFailedAttempt` n'était **jamais** atteint → le compteur de tentatives
   ne montait jamais → `isLocked()` restait toujours faux. **La protection
   anti-bruteforce existait dans le code et ne protégeait rien.**

Corrigé sur `loginCandidate`, `login`, `loginAdmin`, `loginCompany`, et verrouillé
par `backend/tests/loginLockout.test.js` (7 tests, mecanique vérifiée).

---

## D — Qualité web / performance

| # | Correction | Fichier | Pourquoi |
|---|---|---|---|
| D1 | Retry 503/429 supprimé | `lib/api.ts` | **Code mort** : aucun appelant ne passait `retries`. Un retry sur 429 aggrave de surcroît le rate-limit par tentative. |
| D2 | Fusion non déterministe supprimée (×3) | `ApplicationsOverview`, `PipelineOverview`, `JobsOverview` | `own.length ? own : context` — deux sources concurrentes. **Correction d'analyse** : le dashboard limite à `take: 10` vs 20 paginées, donc la fusion **perdait** des lignes. |
| D3 | Polling conditionné au socket | `MessagesOverview.tsx` | Polling 10 s **et** socket en parallèle, sans tester l'état : `GET .../messages` toutes les 10 s même socket connecté. |
| D4 | Minuteur de fermeture annulé | `AdminGlobalSearch.tsx` | Fuite après unmount. |
| D5 | `matcher` restreint à `/admin` + `/dashboard` | `proxy.ts` | Le lookahead `public` sans `/` excluait du proxy tout segment commençant par « public ». |
| D6 | Liens `/admin/security` corrigés | `AdminOverview.tsx` ×2 | **404 réel** : `security` n'est pas une clé du catalogue. |
| D7 | Cartes de titres / fil d'Ariane alignées | `AdminHeader`, `AdminBreadcrumbs` | `/admin/security` et `/admin/settings` listés alors qu'ils n'existent pas. |
| D8 | Props mortes retirées | `DashboardShell` | `user` et `notifications` déclarés, jamais lus. |
| D9 | Cache-busting `?v=` supprimé | `SettingsOverview.tsx` | Inutile : le backend nomme chaque logo en UUID4. |
| D10 | `location.assign` → `router.push` + `refresh` | 4 composants | Recharge complète évitée ; `refresh()` rejoue le proxy. |
| D11 | Tailwind documenté comme preflight seul | `globals.css:1` | Zéro classe utilitaire. **Ne pas supprimer** : le reset de preflight est requis par le CSS maison. |

---

## E — Mobile

| # | Correction | Fichier | Pourquoi |
|---|---|---|---|
| E1 | `==` / `hashCode` sur `Conversation` | `models/conversation.dart` | Clé d'un `FamilyNotifier` : deux instances de même `id` = deux caches, historique perdu, scroll réinitialisé. |
| E2 | Socket recréé à la rotation de jeton, **rooms préservées** | `chat_socket_service.dart:78-115` | `??=` ne recréait jamais le socket (`setAuth` gardait un jeton **périmé**) **et** `disconnect()` vidait les rooms. |
| E3 | Contrat de `cacheFor` clarifié | `cache_for_extension.dart` | **Pas un bug** : le comportement est correct (non-autoDispose = cache permanent). Le contrat Documenté, lui, mentait. |
| E4 | 5 fichiers morts supprimés | `models/user`, `widgets/job_card`, `upcoming_interviews_provider`, `utils/file_name`, `local_storage_provider` | 0 import vérifié. |
| E5 | `_JobDetailByIdScreen` en `StatefulWidget` | `router.dart` | `FutureBuilder(future: _fetchJob(id))` **réévalué à chaque build** → une requête par frame. |
| E6 | Redirection `/recruiter` symétrique | `router.dart` | Retournait `/candidate/home` même pour un employé, alors que les branches jumelles renvoient leur propre destination. |
| E7 | Bouton inerte réparé | `applications_screen.dart` | `Navigator.pop()` sur un écran `go_router` (rien à dépiler) : **no-op absolu**. |
| E8 | Destination post-auth centralisée | `auth_screens.dart` | L'inscription codait `/candidate/home` en dur : un recruteur inscrit atterrissait côté candidat. |
| E9 | `supportedLocales` réduit au français | `app.dart` | `en` déclaré sans **aucun** ARB : app française avec date pickers anglais. |
| E10 | Verrou de vol sur `poll()` | `messages_provider.dart` | `state.isLoading` n'arrêtait rien (jamais positionné) : deux écritures concurrentes depuis un instantané périmé. |
| E11 | Purge des PII en clair au démarrage | `local_storage.dart` | La migration n'était appelée que depuis `saveSession` : qui ne se reconnectait pas gardait nom/email/téléphone/DDN en clair **indéfiniment**. |

---

## F — Tests ajoutés

| Fichier | Couvre |
|---|---|
| `entreprise/tests/adminEndpoints.test.ts` (5) | **B1** : interdit `process.env[key]`, exige une entrée littérale par section, verrouille la synchro avec le catalogue. |
| `entreprise/tests/authCookie.test.ts` (8) | **C1/C2/C3/C4** : fail-closed, vérification avant écriture, HttpOnly sans `domain`, un seul nom de cookie. |
| `backend/tests/loginLockout.test.js` (7) | **C10** : la tentative est-elle réellement enregistrée, sur les 4 endpoints. |
| `mobile/test/widget_test.dart` (+3) | **E1** : identité de conversation. |

> Les deux tests web analysent le **code** (commentaires exclus) : le bug B1
> était un motif de source, pas un comportement d'exécution — seul un test de
> motif peut le verrouiller. Vérifié en réintroduisant le bug : le test échoue.

---

## Vérification (tout exécuté, rien supposé)

| Cible | Avant | Après |
|---|---|---|
| `backend` tests unitaires | 8 suites | **9 suites, 124 assertions, 0 échec** |
| `backend` E2E | **8 / 19** | **20 / 20** |
| `entreprise` typecheck | propre | **propre** |
| `entreprise` tests | **0 fichier** | **13 / 13** |
| `entreprise` lint | 81 warnings, `continue-on-error` | **64 warnings, plafond bloquant** |
| `entreprise` build prod | — | **OK** (52 pages) |
| `mobile` analyze | OK | **OK** |
| `mobile` tests | 4 | **7 / 7** |
| Portes CI pouvant échouer | **0** | **toutes** |

L'E2E backend passait de 8/19 à 20/20 : le test était en retard sur un contrôle
de sécurité légitime (appartenance du CV) ajouté dans un travail non commité
précédent. **La validation a été conservée, c'est le test qui a été aligné** —
et un test négatif a été ajouté pour la protéger.

---

## Hors périmètre (constaté, non corrigé — serait une fonctionnalité)

- `features/employee/` : persona routée et typée mais **100 % statique**. La brancher = fonctionnalité. Seul le bouton inerte (E7) a été réparé.
- Absence de RBAC : `/admin` gaté par rôle seul, jamais par permission.
- Push iOS inopérant (pas de `GoogleService-Info.plist`).
- Vraie i18n (ARB) : E9 a rendu l'état honnête, pas l'i18n.
- Migration Tailwind : refonte design.
- `no-explicit-any` (38) et `set-state-in-effect` (16) : refactors de fond, documentés dans le ratchet CI.

