# JOBSINC Backend — Déploiement Render (recommandé)

Render est adapté à ce backend : `server.js` long-lived + Socket.IO + `setInterval` + uploads locaux fonctionnent sans refacto.

## Fichiers préparés
- `backend/server.js:22` écoute `0.0.0.0` sur `PORT` (Render injecte `10000`, fallback `5000`)
- `backend/package.json:30` `start: node server.js`, `start:render: prisma migrate deploy && node server.js`, `engines node>=18`
- `backend/render.yaml:1` et `render.yaml` racine — déclaratif Render (runtime `node`, `healthCheckPath: /health`, `buildCommand: prisma generate && prisma migrate deploy`)
- `backend/Dockerfile:1` — alternative Docker (Render détecte auto, utile si besoin `binaryTargets` custom)
- `backend/src/app.js:1` conservé pour compat Vercel, mais Render utilise `server.js` (Socket.IO actif)
- `backend/.gitignore:11` ignore `.vercel`, `backend/vercel.json` n'impacte pas Render

## Déploiement Render Dashboard

1. **New Web Service → Connect repo `JOBSINC`**
   - Root Directory : `backend`
   - Runtime : `Node`
   - Build Command : `npm install && npx prisma generate && npx prisma migrate deploy`
   - Start Command : `node server.js` (ou `npm run start:render`)
   - Health Check Path : `/health`
   - Region : `Frankfurt` (proche Neon `eu-west`) ou `Oregon` si Neon `us-east-2` (`ep-curly-fog` actuel = `us-east-2`)
   - Auto-Deploy : Yes

2. **Environment Variables** (Render → Environment) :

| Variable | Exemple | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:...@ep-curly-fog-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5` | Neon pooler obligatoire |
| `JWT_SECRET` | `openssl rand -hex 32` | identique prod |
| `CORS_ORIGINS` | `https://votre-frontend.vercel.app,https://jobsinc.com` | frontend prod |
| `TRUST_PROXY` | `1` | déjà dans `render.yaml` |
| `NODE_ENV` | `production` | déjà dans `render.yaml` |
| `PORT` | `10000` | Render l'injecte, ne pas override |
| `REDIS_URL` | `rediss://default:...@us1-...upstash.io:6379` | optionnel, sinon rate-limit mémoire |
| `REDIS_TLS` | `true` | si `rediss://` |
| `STORAGE_DRIVER` | `local` (Render disque éphémère mais persisté entre restarts sur Starter) ou `s3` | `local` ok pour Render si pas de scale horizontal ; `s3` recommandé prod |
| `AWS_S3_BUCKET` etc. | si `STORAGE_DRIVER=s3` | idem Vercel |
| `FCM_SERVICE_ACCOUNT_JSON` | `cat serviceAccountKey.json | base64 -w0` | ou monter `serviceAccountKey.json` via Render Secret File |
| `SMTP_*` / `MAIL_FROM` | | si emails prod |
| `APP_URL` | `https://votre-backend.onrender.com` | pour liens emails |

3. **Deploy** → logs : `✅ Serveur démarré sur http://0.0.0.0:10000 (Socket.IO actif)` + `✅ Redis connecté` ou warning fallback

4. **Vérifier**
   - `GET https://xxx.onrender.com/` → `🚀 Serveur JOBSINC opérationnel !`
   - `GET https://xxx.onrender.com/health` → `{status:"ok", db:"up", redis:"up|down"}`
   - `wss://xxx.onrender.com/socket.io` → handshake Socket.IO ok (tester via frontend `lib/socket.ts`)
   - Upload `POST /api/candidate/avatar` → `avatarUrl` `/uploads/candidates/...` servi via `express.static` (`backend/src/app.js:45`)

## Notes Render spécifiques

- **Filesystem** : Render starter disque éphémère mais survit aux restarts (pas aux deploys). Pour persistance inter-deploys, utiliser `STORAGE_DRIVER=s3` ou Render Disk (paid, mount `/app/uploads`). Sans S3, les fichiers sont perdus au `git push`.
- **Neon scale-to-zero** : `backend/server.js:188` ping `prisma.user.count()` toutes les 2 min garde le compute actif tant que Render tourne (pas besoin de cron externe). `backend/src/config/prisma.js:8` retry `P1001/P2024` gère cold start.
- **Migrations** : `npx prisma migrate deploy` au build (déjà dans `render.yaml:8`). Ne jamais `prisma migrate dev` en prod.
- **Logs** : Render → Logs, rétention 7 jours starter.
- **Scaling** : Starter = 1 instance ; si scale horizontal, `STORAGE_DRIVER=s3` + `REDIS_URL` Upstash obligatoires (sinon uploads/rate-limit non partagés).
- **Alternative Docker** : si besoin `debian-openssl-3.0.x` spécifique, Render détecte `Dockerfile` automatiquement (même `CMD` avec `migrate deploy`).

## Frontend

Garder `entreprise` sur Vercel (Next.js), `CORS_ORIGINS` backend Render = URL Vercel frontend. Mobile pointe `API_URL` vers `https://xxx.onrender.com`.
