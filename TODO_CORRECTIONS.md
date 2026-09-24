# JOBSINC — TODO Corrections Full-Stack (24/09/2026)

## P0 — Bloquants (corrigés)
- [x] **Mobile Android** `mobile/android/app/build.gradle.kts:8` — `namespace` + `applicationId` `com.example.mobile` → `com.jobsinc.mobile`
- [x] **Mobile Android** — `usesCleartextTraffic` hardcodé `true` → `${usesCleartextTraffic}` + `manifestPlaceholders` debug:true / release:false `build.gradle.kts:30`
- [x] **Mobile Android** — `AndroidManifest.xml:9` → `${usesCleartextTraffic}`
- [x] **Mobile iOS** `mobile/ios/Runner/Info.plist:71` — ajout `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`, `NSDocumentsFolderUsageDescription`, `NSAppTransportSecurity` (localhost), `UIBackgroundModes` remote-notification/fetch
- [x] **Backend** `backend/server.js:33` — `TRUST_PROXY` robuste (support `true` string)
- [x] **Backend** `backend/server.js:44` — `helmet` HSTS + `cors` callback strict + `express.urlencoded` + `req.id`
- [x] **Backend** `backend/server.js:108` — `/health` check DB+Redis degraded 503
- [x] **Backend** `backend/server.js:216` — handlers `unhandledRejection`/`uncaughtException`
- [x] **Backend** `backend/src/utils/uploadValidation.js:27` — `sanitizeOriginalName`, magic bytes DOC/DOCX ZIP
- [x] **Backend** `backend/src/middlewares/multipartParser.js:15` — validation boundary, header size 8k, body 20M
- [x] **Backend** `backend/prisma/schema.prisma:152` — index `Job(location)`, `contractType`, composite `companyId,isOpen,createdAt`, `Application(jobId,status)`
- [x] **Backend** `backend/package.json:2` — ajout `zod ^3.23.8` + `npm install`
- [x] **Backend** `backend/src/utils/zodSchemas.js` — schémas `candidateRegister`, `companyRegister`, `jobCreate`, `pagination`
- [x] **Backend** `backend/src/controllers/companyController.js:4` — intégration `zod` sur `createJob`
- [x] **Web** `entreprise/next.config.ts:11` — `images.remotePatterns` + `headers` sécurité (nosniff, DENY, Referrer-Policy)
- [x] **Web** `entreprise/proxy.ts:15` — cache LRU 60s 500 entrées + `tryDecodeRole` fallback + `isPublicPath` strict
- [x] **Web** `entreprise/.env.example:1` — complété 20 endpoints admin + note `.env` non versionné
- [x] **Web** `entreprise/.gitignore:34` — `.env` strict (seul `.env.example` versionné)
- [x] **Web** `entreprise/app/not-found.tsx` — création `404` avec `next/link`
- [x] **Web** `entreprise/app/loading.tsx` — création skeleton
- [x] **Web** `entreprise/lib/api.ts:30` — `apiRequest` retry 503/429 + `getJobs` paginé
- [x] **Mobile** `mobile/lib/features/jobs/providers/jobs_provider.dart:21` — `loadJobs(page,limit)` paginé
- [x] **Mobile** `mobile/lib/core/storage/local_storage_provider.dart:1` — provider Riverpod singleton
- [x] **Mobile** `mobile/lib/core/constants/app_assets.dart:2` — doc asset legacy
- [x] **Backend** `backend/.env.example:38` — STORAGE_DRIVER S3 + FCM path
- [x] **Backend** `backend/.gitignore:5` — `*.key.json`
- [x] **Backend** `backend/src/services/storageService.js` — abstraction local/S3
- [x] **Vérif** `prisma validate` OK, `tsc --noEmit` OK, `flutter analyze` OK, `matching.test 27 pass`

## P1 — Avant scale (partiellement traité / reste à faire)
- [ ] Migrer `localStorage` web → `HttpOnly Secure` cookie (backend `Set-Cookie`, supprimer `localStorage.jobsinc_token`)
- [ ] Remplacer `multipartParser` maison par `multer` battle-tested (actuellement durci mais toujours custom)
- [ ] `TanStack Query` + `zod` côté web (partiel: retry + zod backend OK)
- [ ] `StatefulShellRoute` GoRouter mobile (actuel `int _tab` fragile)
- [ ] Découper monolithes `auth_screens.dart:1526l` / `candidate_home_screen.dart:1476l`
- [ ] OpenAPI `swagger-jsdoc`, `pino` logger structuré
- [ ] Cache Redis pub/sub pour multi-instance (actuel Map L1 incohérent)
- [ ] Assouplir `Conversation @@unique` si besoin multi-candidature par couple (actuel 1 conv/couple conservé volontairement)

## P2 — Dette (à planifier)
- [ ] `very_good_analysis` + `crashlytics` + `analytics` Firebase mobile
- [ ] CI GitHub Actions lint/typecheck/test/e2e
- [ ] `freezed/json_serializable` mobile

## Validation post-correctifs
- `npm test` backend: 27/27 OK
- `npx prisma validate`: valid
- `npx tsc --noEmit`: 0 error
- `flutter analyze`: No issues
- `npx eslint`: erreurs préexistantes (any, no-html-link) non bloquantes — 1 fix `not-found.tsx` appliqué
