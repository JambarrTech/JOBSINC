# JOBSINC — Frontend Entreprise

Vitrine publique, espace recruteur et console d'administration de la plateforme
JOBSINC. Le backend est un service séparé (`backend/`, Node + Express + Prisma) ;
ce dépôt ne constitue **pas** une frontière de sécurité.

## 🚀 Technologies

- **Next.js 16.3.0** — App Router, `proxy.ts` (l'ex-`middleware`, renommé et
  désormais obligatoire dans cette version), APIs de requête asynchrones
- **React 19.2.8**
- **TypeScript** (`strict: true`)
- **CSS artisanal** — voir la note ci-dessous
- **ESLint 9** (flat config)

### Note sur Tailwind

Tailwind 4 est installé et enregistré dans PostCSS, mais **aucune classe
utilitaire n'est utilisée dans le code** : la seule directive présente est
`@import "tailwindcss"` dans `app/globals.css`, qui ne sert qu'au *preflight*
(le reset CSS).

Le style est un design system maison : jetons dans `:root`
(`app/globals.css`), puis 16 feuilles CSS scopées par espacio
(`app/dashboard/*.css`, `app/admin/*.css`). Une part importante de l'UI
récente utilise en plus des `style={{...}}` en ligne.

Soit on adopter réellement Tailwind (migrer les feuilles), soit on le retire
des dépendances. L'état actuel est le pire des deux : une dépendance et une
config présents pour zéro classe écrite.

## 📁 Structure

```
entreprise/
├── app/
│   ├── page.tsx                    # Accueil public
│   ├── layout.tsx                  # Layout racine (lang="fr")
│   ├── globals.css                 # Jetons de design + site public
│   ├── error.tsx / not-found.tsx   # États d'erreur partagés (SectionError)
│   ├── login/ · register/          # Authentification
│   ├── jobs/[id]/                  # Offre publique (server component)
│   ├── api/auth/cookie/            # SEULE route handler : pose/efface
│   │                               #   le cookie HttpOnly du frontend
│   ├── dashboard/…                 # Espace recruteur (14 routes)
│   └── admin/…                     # Console admin (12 routes)
├── components/
│   ├── home/ · layout/ · auth/     # Site public
│   ├── dashboard/                  # 17 écrans de l'espace recruteur
│   ├── admin/                      # Console admin (data, layout, ui)
│   ├── company-registration/
│   └── ui/                         # Icon, SectionError, useDialogFocus
├── lib/
│   ├── api.ts                      # Client HTTP + types métier (~25 DTO)
│   ├── admin-api.ts                # Endpoints admin
│   ├── admin-roles.ts              # Rôles admin — source de vérité partagée
│   ├── admin-resources.ts          # Catalogue des 22 sections admin
│   ├── session.ts                  # Déconnexion fiable (DELETE BFF)
│   └── socket.ts                   # Socket.IO (signaux uniquement)
├── proxy.ts                        # Garde de routes (serveur)
└── next.config.ts                  # CSP, HSTS, images distantes
```

## 🔐 Authentification

Le frontend ne constitue pas une frontière de sécurité. Le jeton d'accès vit
dans un cookie **HttpOnly posé par le backend**, sur le domaine du backend.

- `proxy.ts` intercepte `/admin*` et `/dashboard*` : il lit
  `jobsinc_token` (cookie du **frontend**, posé via `POST /api/auth/cookie`),
  puis interroge `/auth/me` côté serveur. `cache: 'no-store'`, 3 s de timeout,
  **fail-closed** : une panne backend renvoie « non valide » plutôt que de
  valider localement le JWT.
- Les requêtes métier partent **directement vers le backend**, en
  cross-origin, avec `credentials: 'include'`. Elles ne sont donc PAS
  passantes par le proxy Next.js : l'authentification repose sur le cookie que
  le backend a posé sur son propre domaine (`SameSite=None; Secure` en prod).
- `/api/auth/cookie` est protégé par une vérification d'origine (le
  `SameSite=Lax` du cookie limite l'*envoi*, pas la *pose*).
- Rôles admin : `lib/admin-roles.ts` est importé **à la fois** par
  `proxy.ts` (serveur) et `lib/admin-api.ts` (client). Les deux listes
  avaient divergé auparavant, provoquant une boucle de redirection sur
  `SUPER_ADMIN`.

## 📡 Temps réel

`lib/socket.ts` ne transporte que des **signaux**
(`message:new`, `interview:update`) ; le contenu est rechargé en REST. Aucun
corps de message ne transite par le socket.

## 🚀 Démarrage

Prérequis : **Node.js 20.9+** (Next.js 16 refuse les versions antérieures).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Variables : voir `.env.example`. Seules des variables `NEXT_PUBLIC_*` sont
lues — **ne jamais y placer de secret backend** (elles sont inlinées dans le
bundle client).
