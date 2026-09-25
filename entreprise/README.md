# JOBSINC — Frontend entreprise et console Admin

Frontend Next.js/React de JOBSINC. Cette application contient l’espace entreprise/recruteur et le console d’administration global sous `/admin`.

Le backend et l’application mobile sont hors de ce dossier et ne doivent pas être modifiés depuis ce projet.

## Démarrage

Prérequis : Node.js 18+ et npm.

```bash
npm install
npm run dev
```

Application locale : `http://localhost:3000`.

```bash
npm run build
npm run start
npm run lint
```

## Architecture

```text
app/
├── page.tsx                 # Accueil public
├── login/                   # Connexion entreprise
├── register/                # Inscription entreprise
├── dashboard/               # Espace entreprise/recruteur
└── admin/                   # Console Admin global

components/
├── admin/                   # Layout, UI, tables et états Admin
├── auth/                    # Authentification entreprise
├── dashboard/               # Espace entreprise
└── layout/                  # Header, footer et éléments partagés

lib/
├── api.ts                   # Client API commun
└── admin-api.ts             # Accès API Admin centralisé
```

## Sécurité frontend

- `/dashboard` exige une session frontend valide.
- `/admin` vérifie la session et le rôle retourné par l’authentification.
- `/admin/login` est la seule route de connexion Admin ; il n’existe pas de `/admin/register`.
- Une réponse backend `401` ou `403` entraîne le retrait de la session frontend et une redirection vers la connexion.
- Le frontend ne constitue pas une frontière de sécurité : les rôles, permissions et actions sensibles doivent toujours être validés par le backend.
- Le stockage actuel utilise `jobsinc_token` pour rester compatible avec l’authentification existante. Pour la production, privilégier un cookie `HttpOnly`, `Secure`, `SameSite` géré par le backend.
- Ne jamais placer de secret backend dans une variable `NEXT_PUBLIC_*`.

## Variables d’environnement

Créer un fichier local non commité, par exemple `.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Auth entreprise
NEXT_PUBLIC_LOGIN_ENDPOINT=/auth/login
NEXT_PUBLIC_REGISTER_ENDPOINT=/auth/register
NEXT_PUBLIC_SESSION_ENDPOINT=/auth/me
NEXT_PUBLIC_REGISTER_PHOTOS_FIELD=photos

# Données entreprise
NEXT_PUBLIC_DASHBOARD_ENDPOINT=/dashboard
NEXT_PUBLIC_COMPANIES_ENDPOINT=/companies
NEXT_PUBLIC_JOBS_ENDPOINT=/jobs
NEXT_PUBLIC_STATS_ENDPOINT=/stats
NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT=/companies/me/jobs
NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT=/companies/me/applications
NEXT_PUBLIC_COMPANY_MESSAGES_ENDPOINT=/companies/me/messages
NEXT_PUBLIC_MATCHING_ENDPOINT=/companies/me/matching

# Auth et données Admin — uniquement si ces routes existent côté backend
NEXT_PUBLIC_ADMIN_LOGIN_ENDPOINT=/auth/login/admin
NEXT_PUBLIC_ADMIN_SESSION_ENDPOINT=/auth/me
NEXT_PUBLIC_ADMIN_ROLES=ADMIN,SUPER_ADMIN,SYSTEM_ADMIN
NEXT_PUBLIC_ADMIN_DASHBOARD_ENDPOINT=/admin/overview
NEXT_PUBLIC_ADMIN_USERS_ENDPOINT=/admin/users
NEXT_PUBLIC_ADMIN_USER_ENDPOINT=/admin/users/[id]
```

Les routes Admin de ressources sont optionnelles et ne sont appelées que si leur variable est configurée : `CANDIDATES`, `EMPLOYEES`, `COMPANIES`, `ADMINISTRATORS`, `JOBS`, `APPLICATIONS`, `INTERVIEWS`, `RECRUITMENTS`, `REPORTS`, `MODERATION`, `ANALYTICS`, `TRENDS`, `REPORTS_ANALYTICS`, `ACTIVITY`, `AUDIT`, `SESSIONS`, `LOGINS`, `SECURITY_ALERTS`, `CONTENT`, `NOTIFICATIONS`, `SYSTEM`, `MAINTENANCE`.

Exemple : `NEXT_PUBLIC_ADMIN_CANDIDATES_ENDPOINT=/admin/candidates`.

Le frontend ne crée aucune de ces routes. Le binôme backend doit confirmer les chemins, méthodes, permissions et formats réels avant configuration.

## Contrats attendus

### Authentification

La connexion doit retourner au minimum :

```json
{
  "token": "...",
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": "ADMIN"
  }
}
```

Le rôle doit être une valeur réellement définie par le backend. Le frontend refuse l’accès Admin si aucun rôle autorisé n’est retourné.

### Listes Admin

Une ressource peut retourner soit un tableau, soit une enveloppe :

```json
[]
```

ou :

```json
{ "data": [], "total": 0, "page": 1, "pageSize": 20 }
```

Le frontend lit actuellement `data`, `results` ou `users`. Pour une pagination backend complète, ajouter le contrat confirmé dans `lib/admin-api.ts` avant de brancher les pages volumineuses.

### Dashboard Admin

`NEXT_PUBLIC_ADMIN_DASHBOARD_ENDPOINT` peut retourner :

```json
{
  "stats": {
    "users": 0,
    "candidates": 0,
    "employees": 0,
    "companies": 0,
    "administrators": 0,
    "jobs": 0,
    "applications": 0,
    "interviews": 0,
    "recruitments": 0
  },
  "userDistribution": [],
  "attention": [],
  "activity": [],
  "activitySeries": [],
  "securitySummary": [],
  "system": []
}
```

Les tableaux et graphiques restent vides si les données ne sont pas disponibles. Aucune statistique n’est inventée côté frontend.

## Routes principales

### Entreprise

- `/`
- `/login`
- `/register`
- `/dashboard`
- `/dashboard/jobs`
- `/dashboard/applications`
- `/dashboard/pipeline`
- `/dashboard/matching`
- `/dashboard/messages`
- `/dashboard/analytics`
- `/dashboard/company`
- `/dashboard/settings`

### Admin

- `/admin/login`
- `/admin`
- `/admin/users`
- `/admin/candidates`
- `/admin/employees`
- `/admin/companies`
- `/admin/administrators`
- `/admin/jobs`
- `/admin/applications`
- `/admin/interviews`
- `/admin/recruitments`
- `/admin/moderation`
- `/admin/reports`
- `/admin/analytics`
- `/admin/activity`
- `/admin/sessions`
- `/admin/security`
- `/admin/notifications`
- `/admin/system`
- `/admin/maintenance`
- `/admin/settings`

## Travail du binôme backend

Avant intégration, confirmer pour chaque endpoint :

1. chemin et méthode HTTP ;
2. authentification attendue ;
3. rôle et permission nécessaires ;
4. paramètres de recherche, filtre, tri et pagination ;
5. forme exacte de la réponse ;
6. statuts `401`, `403`, `404`, `422` et `500` ;
7. actions sensibles disponibles et leurs réponses ;
8. stratégie de session, idéalement cookie `HttpOnly` en production.

Ne pas créer d’endpoint uniquement pour faire disparaître un état vide. Si une donnée n’existe pas encore, conserver l’état vide et documenter le besoin.

## Checklist de livraison backend/frontend

- [ ] API URL configurée dans `.env.local`.
- [ ] Login entreprise et Admin testés.
- [ ] Endpoint session confirmé.
- [ ] Rôles Admin confirmés.
- [ ] Permissions et réponses `403` testées.
- [ ] Endpoints de listes configurés un par un.
- [ ] Aucune donnée de démonstration utilisée comme donnée réelle.
- [ ] `npm run build` réussi.
- [ ] Backend et mobile inchangés par le frontend.
