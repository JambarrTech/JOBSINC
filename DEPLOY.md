# Déploiement JOBSINC

Document de référence unique pour le déploiement des trois applications du dépôt.

Il remplace `backend/RENDER.md` et `backend/VERCEL.md`, qui décrivaient un état
devenu faux (ils pointaient vers `backend/render.yaml`, `backend/Dockerfile` et
`backend/vercel.json`, trois fichiers supprimés) et que rien ne référençait.

---

## 1. Les trois déploiables

Ce dépôt est un monorepo **sans workspace racine** : trois applications
indépendantes, trois chaînes de construction, aucune dépendance entre elles.

| Application | Cible | Racine de build | Point d'entrée |
|---|---|---|---|
| `backend/` | **Render** (service web) | `backend` | `server.js` |
| `entreprise/` | **Vercel** (framework Next.js) | `entreprise` | Next.js |
| `mobile/` | **Firebase App Distribution** | `mobile` | Flutter |

LeBlueprint Render est `render.yaml`, **à la racine du dépôt** : Render ne lit un
Blueprint que depuis la racine. `backend/render.yaml` existait aussi, était donc
inerte, et c'était précisément celui qui portait la documentation — c'est-à-dire
que la documentation décrivait un service que Render n'aurait jamais configuré.

---

## 2. Pourquoi Render uniquement pour le backend

Le backend a été préparé pour Vercel (`api/index.js` sans `listen()`,
`vercel.json`, `STORAGE_DRIVER` éphémère). Cette cible a été abandonnée.

Ce n'était pas un choix esthétique, mais une accumulation de contraintes réelles :

1. **Socket.IO ne fonctionne pas en serverless.** Vercel Functions n'ont pas de
   connexion persistante. La messagerie temps réel et les `interview:update`
   étaient donc perdus, avec repli sur du polling REST.
2. **Le filesystem est éphémère.** Hors `/tmp`, tout est read-only et perdu à
   chaque cold start, ce qui imposait `STORAGE_DRIVER=s3` en production.
3. **`setInterval` ne tourne pas.** Le nettoyage des `refreshToken` expirés
   devait être déplacé vers un cron externe.
4. **Le déploiement Vercel n'était pas amorcé.** Dans `.github/workflows/cd.yml`,
   `VERCEL_TOKEN`, `VERCEL_ORG_ID` et `VERCEL_PROJECT_ID` étaient déclarés dans
   le `env:` d'un `step` — or le `env:` d'un step **n'alimente pas son propre
   `if`**. Le job partait donc en vert sans jamais déployer. Le défaut est
   invisible : un déploiement qui ne se déclenche pas resemble à un déploiement
   réussi.

`api/index.js` est **conservé et corrigé**, mais explicitement étiqueté comme
secours : il exporte l'app sans démarrer de listener et sert de filet si le
service doit un jour être hebergé en serverless. Il ne doit pas être la cible.

---

## 3. Variables d'environnement du backend

À saisir dans le dashboard Render, **jamais dans `render.yaml`** : un Blueprint
est versionné dans Git.

### Obligatoires

| Variable | Rôle | Note |
|---|---|---|
| `DATABASE_URL` | Neon via le **pooler** | suffixe `-pooler`, `pgbouncer=true` |
| `DIRECT_URL` | Neon **directe** (sans `-pooler`) | requise par `prisma migrate deploy` |
| `JWT_SECRET` | signature des jetons | `openssl rand -hex 32` |
| `CORS_ORIGINS` | origines autorisées | URL(s) du front, séparées par des virgules |
| `APP_URL` | URL publique du service | **voir §4** |
| `PORT` | `10000` | déjà fixé par le Blueprint, ne pas surcharger à la main |

### Recommandées

| Variable | Rôle | Note |
|---|---|---|
| `NODE_ENV` | `production` | déjà fixé par le Blueprint |
| `TRUST_PROXY` | `1` | déjà fixé par le Blueprint ; sans lui `req.ip` vaut l'IP du proxy pour tout le trafic et le rate-limiting par IP plafonne le service d'un coup |
| `REDIS_URL` / `REDIS_TLS` | rate-limiting et invalidation de cache distribués | sans Redis, quotas **par instance** |
| `REQUIRE_REDIS` | `true` transforme l'absence de Redis en 503 | à n'utiliser que si la_hausse de trafic rend le quota global obligatoire |
| `SMTP_*`, `MAIL_FROM` | emails transactionnels | sans SMTP, les liens de réinitialisation ne sont **pas** envoyés |
| `FCM_SERVICE_ACCOUNT_JSON` | push, JSON du compte de service **en base64** | ou `FCM_SERVICE_ACCOUNT_PATH` si le fichier est monté |
| `CRON_SECRET` | protège `GET /api/cron/cleanup` | fail-closed si défini |
| `LOG_LEVEL` | `error`, `warn`, `info` (défaut), `debug` | logs JSON sur une ligne |

### Stockage des fichiers — `STORAGE_DRIVER` est OBLIGATOIRE ici

| Variable | Rôle |
|---|---|
| `STORAGE_DRIVER` | **`s3`**. `local` écrit les uploads sur le disque du service. |
| `AWS_S3_BUCKET` | nom du bucket |
| `AWS_S3_REGION` | ex. `eu-west-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sur ce bucket |

Ce tableau était auparavant sous « Recommandées », avec la mention « `local`
suffit à une seule instance ». **Cette formulation était fausse et a coûté des
données.** Le disque d'un hébergeur managé est éphémère, même sur une seule
instance : le service redémarre à chaque déploiement, et le contenu disparaît.

Le symptôme est trompeur, parce qu'il ne ressemble pas à une panne de stockage :

```
Cannot GET /uploads/cvs/a34edfbc-3cd5-49ba-99d5-85a6dd8c0d6a.pdf
```

C'est le 404 par défaut d'Express, pas une erreur du service. La route est bien
montée, l'autorisation passe, et le fichier n'est simplement **plus là**. Même
symptôme sur les photos, sous la forme d'une icône d'image cassée — la base
conserve le chemin, le disque ne contient plus l'octet.

Aucun déploiement ne peut récupérer les fichiers déjà perdus : il faut les
déposer à nouveau. D'où l'avertissement au démarrage dans `server.js`, qui
signale ce cas explicitement plutôt que de laisser une panne muette apparaître
des semaines plus tard.

Le bucket doit rester **privé** : `/uploads/cvs` et `/uploads/candidates` ne
sont servies qu'après le contrôle d'accès de `uploadAuth` (propriétaire, admin,
recruteur ayant une candidature). Un bucket public rendrait cette autorisation
inopérante.

### Reprise des fichiers déjà déposés

Quand le passage à S3 est configuré, les octets des fichiers déposés en
driver local sont **perdus** s'ils vivaient sur un hébergeur managé : le
disque est réinitialisé à chaque déploiement. Les **chemins** en base, eux,
restent valides — seuls les octets manquent, et aucun code ne les invente.

Si vous disposez encore d'une copie locale de `backend/uploads/`, le script
ci-dessous la téléverse sans rien toucher à la base :

```bash
cd backend

# 1. Inventaire : n'ecrit rien, ne demande AUCUNE credential
node scripts/migrate-uploads-to-s3.js

# 2. Televersement (idempotent : un objet deja present est ignore)
node scripts/migrate-uploads-to-s3.js --apply

# 3. Reecraser des objets existants (normalement inutile)
node scripts/migrate-uploads-to-s3.js --apply --force
```

Le script reprend la logique existante plutot que d'en creer une : cle S3 au
format `<dossier>/<nom>` produit par `multipartParser.saveFile`, `S3Client` et
`PutObjectCommand` de `storageService.saveS3`, et **type MIME deduit des
octets** selon les signatures de `utils/uploadValidation.js` — pas de
l'extension. Un fichier dont l'extension ment est donc stocke avec son vrai
type, ce que `streamS3Object` exige pour ne pas le refuser en 415. Rien n'est
supprime en local : la migration est reversible.

Releve au 2026-09-27 sur la copie locale : 52 fichiers, 12,3 Mio — 29 CV (PDF),
7 photos de candidats, 16 logos. Une anomalie : `candidates/332694ff-….jpg` est
en realite un **PNG**. Sans gravite pour l'affichage (le navigateur rend une
`<img>` malgre un `Content-Type` errone), mais le televersement la corrige
d'office en ecrivant `image/png`.

Si la copie locale n'existe pas, il n'y a rien a migrer : il faut redeposer les
fichiers depuis l'interface.

Le fichier `backend/.env.example` reste la référence exhaustive, variables
optionnelles comprises (visio Daily/Whereby/Google, `VIDEO_PROVIDER`).

---

## 4. `APP_URL` : ce que l'absence a réellement coûté

`APP_URL` détermine l'origine des URL **absolues** produites par
`src/utils/urls.js`.

Sans elle, l'origine est déduite de l'en-tête `Host` de la requête. Derrière le
proxy Render, `TRUST_PROXY=1` laisse descendre cet en-tête du client jusqu'à
`req.get('host')`. Un visiteur **anonyme** pouvait alors demander la liste
publique des offres avec un en-tête `Host` pointant vers un domaine qu'il
contrôle, et obtenir dans la réponse JSON des URL d'images qui y pointaient.

Il existe bien un garde-fou de forme qui rejette un `Host` contenant CR/LF, un
espace, un `@` ou un chemin — ces valeurs peuvent scinder un en-tête de
réponse ou polluer un cache. Mais un domaine bien formé n'est pas rejeté : la
forme était vérifiée, **l'identité ne l'était pas**.

Le même `APP_URL` est déjà utilisé par `services/emailService.js` pour construire
les liens de vérification et de réinitialisation. Avant la consolidation, un même
déploiement pouvait donc répondre `https://api.jobsinc.com` dans son JSON et
`https://autre-chose` dans ses emails, sans que rien ne signale l'écart.

### Ce que ce document affirmait à tort

`src/utils/urls.js` affirmait dans son en-tête : « `APP_URL` doit donc être
renseignée en production (**déjà le cas dans le Blueprint `render.yaml`**) ». C'était
**faux**. `APP_URL` figurait dans la liste « à définir dans le dashboard », donc
hors de `envVars` — c'est-à-dire non versionnée, et donc absente en pratique.

Conséquence observée, sans rapport avec la sécurité : les DTO de
`companyController` et `jobController` passaient les logos et photos par
`absoluteUrl`, qui annonçait donc les images sur l'hôte Render. Le web
`entreprise` refuse toute origine différente de la sienne, si bien que **le même
logo s'affichait sur le mobile et pas sur le site**. Aucun message d'erreur : un
`null` silencieux côté client.

Deux mesures, l'une structurelle et l'autre de garde-fou :

- **Structurelle** : les assets d'upload sortent désormais en chemin **relatif**
  via `canonicalUploadPath` (`src/services/storageService.js`), comme le faisait
  déjà `applicationController` pour les CV. Le client possède une source de
  vérité pour l'origine de l'API ; le backend n'en a pas. `APP_URL` reste
  nécessaire pour les emails, plus pour aucun fichier.
- **Garde-fou** : `APP_URL` est maintenant **déclarée** dans le Blueprint
  (`value: https://jobsinc.onrender.com`, l'hôte réellement en service) et
  `server.js` avertit au démarrage si elle manque. Ce n'est pas un formalisme :
  sans elle, la correction ci-dessus reste inactive.

### L'hôte de production : mesuré, pas supposé

Ce document, `cd.yml` et `lib/api-url.ts` affirmaient tour à tour que
l'hôte de production était `api.jobsinc.com`. **C'est faux**, et la valeur
avait été recopiée de commentaires en commentaires au lieu d'être mesurée.

Vérification directe du 2026-09-27 :

| URL | Résultat |
|---|---|
| `https://jobsinc.onrender.com/api/jobs` | **200**, JSON JOBSINC (« Développeur Full Stack ») |
| `https://api.jobsinc.com/health` | erreur de vérification de certificat |
| `https://api.jobsinc.com/health` en HTTP | 200, corps `OK` — pas le JSON de `/health` |

Le backend est donc sur `jobsinc.onrender.com`. `api.jobsinc.com` résout et
répond en clair, mais ne sert pas cette application.

Conséquences corrigées dans le même commit :

- `render.yaml` — `APP_URL` valait `https://api.jobsinc.com`, ce qui aurait
  cassé **tous les liens de réinitialisation de mot de passe** (construits par
  `services/emailService.js` depuis `APP_URL`) vers un hôte au certificat
  invalide.
- `cd.yml` — le repli de `NEXT_PUBLIC_API_URL` pointait sur ce même hôte mort.
  Ce n'était pas inoffensif : **sans le secret GitHub, tout le front se
  compilait contre une API morte**, et le déploiement passait au vert. Un repli
  doit être le même hôte que le fallback du code, jamais une autre valeur.
- `entreprise/next.config.ts` — la condition
  `API_HOSTNAME === 'api.jobsinc.com' ? [] : [jobsinc.com]` n'était **jamais**
  satisfaite. `jobsinc.com` était donc ajouté à `images.remotePatterns` à chaque
  build, en toute innocence, alors que le commentaire juste au-dessus refuse
  précisément ce Canal d'exfiltration. Elle porte désormais sur le vrai hôte.

Le repli de `lib/api-url.ts` et de `mobile/…/app_config.dart` était, lui, sur
le bon hôte depuis le début.

**À faire de votre côté** : vérifier le secret GitHub `NEXT_PUBLIC_API_URL`. Il
prime sur le repli de `cd.yml` et je n'ai pas accès aux secrets. Il doit valoir
`https://jobsinc.onrender.com/api`.

---

## 5. Contrat de `/health`

`GET /health` interroge réellement Postgres, et Redis si `REQUIRE_REDIS=true`
(`src/utils/healthCheck.js`). Ce n'est pas un endpoint qui renvoie toujours 200 :
c'est ce qui permet à Render d'écarter une instance dont la base est injoignable.

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": 1234.5,
  "db": "up",
  "redis": "up"
}
```

`200` si la base répond, `503` sinon. La **même** sonde alimente l'encart
d'administration « Santé du système », qui renvoyait auparavant un statut en
littéral (`operational`, `<1 ms`) sans rien mesurer.

---

## 6. Secrets présents dans l'historique Git

Constat effectué sur l'ensemble des branches (`git log --all`) :

| Élément | Commit(s) | Gravité |
|---|---|---|
| `backend/scripts/migrate-to-neon.sql` | 2 | contient 4 emails réels et leurs hashes bcrypt, **dont deux comptes partagent le même hash** |
| `mobile/android/app/google-services.json` | 3 | clé API Firebase (`AIza…`) et identifiants de projet |
| `neondb_owner` (chaîne Neon avec mot de passe) | 1 | accès complet à la base |
| `PRIVATE KEY` (clé de service Firebase) | **0** | jamais commitée — `serviceAccountKey.json` a toujours été gitignoré |

Les deux fichiers ont été retirés du suivi dans le commit de correction
(`git rm --cached`). **Les retirer du working tree ne les efface d'aucun commit
précédent** : ils restent lisibles via `git show HEAD~1:<chemin>`.

### 6.1 Purge de l'historique

```bash
pip install git-filter-repo        # une seule fois
git filter-repo --path backend/scripts/migrate-to-neon.sql \
                --path mobile/android/app/google-services.json \
                --invert-paths
git push --force-with-lease origin main
```

`--force-with-lease` et non `--force` : le dépôt est partagé, et cette option
refuse l'écriture si quelqu'un a poussé entre-temps.

### 6.2 Rotation des clés — ACTION MANUELLE REQUISE

La purge de l'historique **ne révoque rien**. Un secret déjà poussé sur un remote
reste à Considerer compromis tant qu'il n'est pas changé. Ces deux rotations
demandent un accès à une console web, elles ne peuvent pas être faites depuis le
dépôt.

**Neon** — console Neon → le projet concerné → *Reset* sur le mot de passe owner.
Si l'endpoint `-pooler` est utilisé, `DIRECT_URL` change aussi. Reporter les
nouvelles valeurs dans `DATABASE_URL` / `DIRECT_URL` sur Render.

**Firebase** — console Firebase → *Project settings* → *Service accounts* →
générer une nouvelle clé, puis :
1. `FCM_SERVICE_ACCOUNT_JSON` sur Render = JSON de la nouvelle clé, en base64
   (`cat nouvelle-cle.json | base64 -w0` sous Git Bash, ou `[Convert]::ToBase64String([IO.File]::ReadAllBytes(...))` sous PowerShell) ;
2. supprimer `backend/serviceAccountKey.json` du poste de développement ;
3. révoquer l'ancienne clé dans la console.

**À propos de `serviceAccountKey.json`** : la clé privée n'a jamais été
commitée, mais elle résidait en clair sur le poste. Le `backend/Dockerfile` —
qui faisait un `COPY . .` et l'aurait embarqué dans l'image — a été supprimé, et
un `backend/.dockerignore` a été ajouté comme barrière au cas où un
`Dockerfile` réapparaîtrait. Une clé de service ne se committe jamais, sous
aucune forme : `backend/.gitignore` la couvre, et `*.key.json` avec.

---

## 7. Développement local

```bash
# Backend — port 5000 par défaut
cd backend && npm ci && npm run dev
curl http://localhost:5000/health

# Front
cd entreprise && npm ci && npm run dev

# Mobile
cd mobile && flutter pub get && flutter run
```

Suite de tests backend (`npm test`) : 14 scripts enchaînés, arrêt au premier
échec. Les tests sont des scripts `node:assert` sans framework, et chacun
nomme le bug qu'il verrouille.

`npm run test:e2e` est volontairement **hors** de `npm test` : il demande une
base atteignable. Il tourne en CI.

---

## 8. Dépuiser

Le premier `git push` sur `main` déclenche le Blueprint Render. Si le service
n'existe pas encore dans le dashboard, le créer d'abord : le Blueprint ne le crée
que pour un service déjà lié, ou il faut le créer depuis *New → Blueprint* en
sélectionnant le dépôt.

Côté CI (`.github/workflows/`), deux points méritent d'être connus parce qu'ils
étaient tous deux silencieusement inopérants :

- le `env:` d'un **step** n'alimente pas le `if:` de ce même step — les
  variables de déploiement sont donc déclarées au niveau du **job** ;
- `NEXT_PUBLIC_API_URL` est au niveau du job car `vercel build --prod`
  **reconstruit** le projet : la variable doit être présente au build, pas
  seulement au déploiement.
