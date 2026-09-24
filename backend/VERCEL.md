# JOBSINC Backend — Guide déploiement Vercel

Ce backend a été adapté pour fonctionner en **serverless** sur Vercel tout en restant compatible avec un serveur long-lived (local / VPS).

## Architecture après préparation

| Fichier | Rôle |
|---|---|
| `src/app.js` | **Express app pure** sans `listen()`, sans `Socket.IO`, sans `setInterval`. Importable par `server.js` et `api/index.js` |
| `api/index.js` | Entrypoint Vercel : importe `src/app.js` et l'exporte comme Serverless Function |
| `server.js` | Serveur long-lived (dev / VPS) : importe `src/app.js`, ajoute `http.createServer`, `Socket.IO`, `Redis`, `intervalles Neon` |
| `vercel.json` | Règle de routage + Cron |
| `src/services/storageService.js` + `src/middlewares/multipartParser.js` | Détection `VERCEL=1` → redirige `uploads/*` vers `/tmp/uploads` (éphémère) + support `STORAGE_DRIVER=s3` |
| `src/services/pushService.js` | Supporte `FCM_SERVICE_ACCOUNT_JSON` (inline JSON ou base64) pour Vercel |

## Incompatibilités Vercel et corrections

### 1. Filesystem éphémère
- **Problème** : Vercel est read-only sauf `/tmp` (512 MB, perdu après la requête). `express.static('uploads')` initial échouait en écriture.
- **Fix** :
  - Si `VERCEL=1 && STORAGE_DRIVER=local` → dossier effectif = `/tmp/uploads`
  - Si `STORAGE_DRIVER=s3` → upload direct vers S3 via `@aws-sdk/client-s3`, aucune écriture locale
  - `storageService.removeLocal` + `multipartParser.getEffectiveDir()` gèrent les deux chemins
  - **En prod Vercel : configurez obligatoirement `STORAGE_DRIVER=s3`** (sinon les CV/avatars disparaissent à chaque cold start)

### 2. Socket.IO / WebSockets
- **Problème** : Vercel Functions sont stateless, pas de connexion persistante.
- **Fix** :
  - `server.js` garde Socket.IO pour dev/VPS
  - Sur Vercel `api/index.js` n'initialise pas Socket.IO
  - `DISABLE_SOCKET=true` désactive complètement le real-time
  - **Conséquence** : chat & `interview:update` ne sont plus temps réel sur Vercel. Le frontend restera fonctionnel via polling REST (`/api/conversations`, `/api/notifications`).
  - **Options pour garder le temps réel** :
    - Héberger le backend complet (avec socket) sur Render/Fly/Railway et utiliser Vercel uniquement pour le frontend
    - Ou extraire Socket.IO dans un micro-service dédié et configurer `SOCKET_URL` côté frontend
    - Ou remplacer par Pusher/Ably (refacto `socketService.js`)

### 3. `setInterval` / tâches de fond
- **Problème** : `setInterval(cleanupExpiredRefreshTokens)` et ping Neon anti scale-to-zero ne fonctionnent pas en serverless.
- **Fix** :
  - Intervalles conservés uniquement si `!process.env.VERCEL` (dans `server.js`)
  - Sur Vercel remplacés par **Cron Job** : `GET /api/cron/cleanup` toutes les heures via `vercel.json`
  ```json
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 * * * *" }]
  ```
  - Sécurisez avec `CRON_SECRET` (header `Authorization: Bearer <secret>`). Sans secret le cron reste ouvert en mode Hobby ; avec secret Vercel envoie automatiquement le Bearer.

### 4. Redis
- `ioredis` en `lazyConnect:true` est compatible serverless (1 tentative, reconnect silencieux).
- Recommandé sur Vercel : **Upstash Redis** (TLS). Définissez `REDIS_URL=rediss://...` et `REDIS_TLS=true`.
- Sans Redis le rate-limit tombe en mémoire (non partagé entre instances, mais fonctionnel).

### 5. Prisma / Neon
- `binaryTargets = ["native","debian-openssl-3.0.x"]` déjà présent pour lambda Debian.
- Retry `P1001/P2024/P1000` intégré dans `src/config/prisma.js` pour cold start Neon.
- `prisma generate` exécuté via `vercel-build` / `postinstall` (Vercel lance `npm install` → génère le client).

### 6. Firebase Admin
- Avant : lecture obligatoire de `serviceAccountKey.json` (fichier non committé, donc manquant sur Vercel).
- Après : priorité à `FCM_SERVICE_ACCOUNT_JSON` (ou `FIREBASE_SERVICE_ACCOUNT`) :
  - JSON inline : `{"type":"service_account",...}`
  - ou base64 : `cat serviceAccountKey.json | base64 -w0` → coller dans Vercel Env

## Déploiement pas-à-pas (Vercel Dashboard)

1. **Importer le projet**
   - Root Directory : `backend`
   - Framework Preset : `Other`
   - Build Command : `npm run vercel-build` (défini dans `vercel.json`)
   - Output Directory : `.` (pas de build frontend)
   - Install Command : `npm install`

2. **Variables d'environnement** (Settings → Environment Variables) :

| Variable | Valeur exemple | Obligatoire |
|---|---|---|
| `DATABASE_URL` | `postgresql://...@ep-...neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5` | oui |
| `JWT_SECRET` | `openssl rand -hex 32` (64 hex chars) | oui |
| `CORS_ORIGINS` | `https://votre-frontend.vercel.app,https://jobsinc.com` | oui |
| `TRUST_PROXY` | `1` (forcé auto si VERCEL=1) | non |
| `NODE_ENV` | `production` | oui |
| `STORAGE_DRIVER` | `s3` (recommandé) ou `local` (éphémère) | prod → `s3` |
| `AWS_S3_BUCKET` | `jobsinc-uploads` | si s3 |
| `AWS_S3_REGION` | `eu-west-1` | si s3 |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | si s3 |
| `AWS_SECRET_ACCESS_KEY` | `...` | si s3 |
| `AWS_S3_ENDPOINT` | `https://s3.eu-west-1.amazonaws.com` (optionnel) | non |
| `REDIS_URL` | `rediss://default:...@upstash...:6379` | non |
| `REDIS_TLS` | `true` si rediss | non |
| `FCM_SERVICE_ACCOUNT_JSON` | contenu JSON ou base64 de `serviceAccountKey.json` | non (sinon push désactivé) |
| `CRON_SECRET` | `un-secret-aleatoire-32-chars` | conseillé |
| `DISABLE_SOCKET` | `true` sur Vercel (socket non supporté) | conseillé |

3. **Déployer** : `git push` ou `vercel --prod`

4. **Vérifier**
   - `https://votre-backend.vercel.app/` → `🚀 Serveur JOBSINC opérationnel !`
   - `https://votre-backend.vercel.app/health` → `{status:"ok", db:"up"}`
   - `https://votre-backend.vercel.app/api/cron/cleanup` (avec header `Authorization: Bearer $CRON_SECRET`)
   - Logs : Vercel → Deployments → Functions → Logs

## Commandes locales de vérification

```bash
# Vérifier que l'app s'importe sans listen
node -e "require('./src/app'); console.log('app ok')"

# Syntax check
node --check src/app.js && node --check api/index.js && node --check server.js

# Lancer en local (toujours via server.js, pas api/index.js)
npm run dev
# puis curl http://localhost:5000/health
```

## Stockage : migration vers S3

1. Créer bucket S3 (ou R2, ou Vercel Blob via S3 compat)
2. Créer IAM user avec `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sur le bucket
3. Définir les 4 vars `AWS_*` + `STORAGE_DRIVER=s3` sur Vercel
4. Redéployer
5. Tester upload : `POST /api/candidate/avatar` → URL retournée doit être `https://bucket.s3.region.amazonaws.com/...`
6. Pour les anciens fichiers `/uploads/...`, ils restent en base mais seront 404 sur Vercel si restés en local. Prévoir script de migration ou accepter perte (fichiers éphémères).

## Limitations connues sur Vercel

- **Uploads locaux** : perdus au cold start (d'où s3 obligatoire)
- **Socket.IO** : désactivé
- **Rate-limit** : non distribué sans Redis (Upstash recommandé)
- **Emails SMTP** : fonctionne si `SMTP_HOST` configuré ; sinon logs `[DEV]`
- **Logs** : `console.log` → Vercel Logs (rétention limitée Hobby)
- **Timeout** : `maxDuration: 30s` dans `vercel.json` (limite 10s Hobby, 60s Pro — ajustez selon plan)

## Alternative recommandée si besoin temps réel

Si le chat temps réel est critique, **ne pas héberger l'API sur Vercel**. Préférez :
- Render (Docker), Railway, Fly.io, VPS — `server.js` tel quel
- Vercel uniquement pour le frontend `entreprise` (Next.js)

Le code reste compatible des deux modes : Vercel détecte `VERCEL=1` automatiquement.
