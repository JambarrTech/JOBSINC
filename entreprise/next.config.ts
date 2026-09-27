import type { NextConfig } from "next";

// Source de vérité unique pour l'URL du backend : voir `lib/api-url.ts` pour
// l'historique des 7 copies divergentes. DOIT rester sans API serveur, puisque
// ce fichier est évalué au build.
import { API_ORIGIN, API_HOSTNAME, API_WS_ORIGIN, API_URL } from "@/lib/api-url";

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy.
// - default-src 'self' : rien ne vient d'une origine tierce par défaut.
// - script-src autorise 'unsafe-inline' car Next.js injecte les bootstrap
//   scripts et les payloads RSC sous forme de scripts inline. À durcir avec des
//   nonces quand le déploiement le permet (proxy.ts + rendu dynamique).
// - connect-src doit inclure l'origine API (REST) ET le schéma ws/wss, sinon le
//   temps réel de la messagerie se déconnecte silencieusement sous CSP.
//   Les jokers `https:` et `wss:` ont été RETIRÉS : ils autorisaient en
//   réalité n'importe quelle origine, ce qui rendait `connect-src` inopérant
//   (une XSS réussie pouvait exfiltrer la session vers un serveur arbitraire
//   sans violer la CSP). On énumère donc les origines réellement utilisées :
//   l'API REST et sa déclinaison WebSocket.
const wsOrigin = API_WS_ORIGIN;

// Le nom d'hôte est également autorisé explicitement pour `img-src` : les
// logos d'entreprises et photos de candidats sont servis par le backend.
// `data:` et `blob:` restent nécessaires (aperçus, icônes inline).
// L'origine est importée directement de `lib/api-url` : plus de `API_HOST`
// local, qui était devenu inutile après centralisation (et qu'Eslint signalait
// comme variable non utilisée).

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${API_HOSTNAME}`,
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN} ${wsOrigin}${isProd ? '' : ' ws: http://localhost:*'}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // `upgrade-insecure-requests` n'est pas figé en dur : il force le passage
  // en HTTPS y compris sur `next dev` en http://localhost:3000, où il casse
  // les requêtes vers le backend local.
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].filter(Boolean).join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Aucune rewrite sur `/uploads` : elle était INATTEIGNABLE et son
  // commentaire décrivait une protection qui n'existait pas.
  //
  // `assetUrl()` et `cvHref()` (lib/api.ts) renvoient `new URL(v,
  // API_ORIGIN).toString()`, c'est-à-dire des URL ABSOLUES cross-origin. Le
  // chemin relatif `/uploads/...` que cette rewrite attendait n'était donc
  // jamais émis par un composant : la règle ne servait à rien.
  //
  // Et surtout : une rewrite Next.js est un SAUT serveur. Le cookie
  // HttpOnly du frontend ne l'est pas automatiquement, et le backend place
  // ses propres cookies sur SON domaine. La lecture des CV fonctionne
  // réellement parce que le navigateur vise directement le backend, qui pose
  // `jobsinc_token` avec `SameSite=None; Secure` en production — ce qui est
  // précisément ce que le commentaire attribuait à tort à la rewrite.
  //
  images: {
    remotePatterns: [
      // `localhost:5000` n'est utile qu'en développement : conservé ici car
      // NEXT_PUBLIC_API_URL peut pointer vers le backend local, mais retiré
      // du build de production via `isProd`.
      ...(isProd ? [] : [{ protocol: 'http' as const, hostname: 'localhost', port: '5000', pathname: '/uploads/**' }]),
      // L'hôte du backend est DÉRIVÉ de NEXT_PUBLIC_API_URL, pas écrit en dur.
      //
      // La liste en dur précédente (`jobsinc.onrender.com`, `jobsinc.com`)
      // oubliait `api.jobsinc.com`, qui est pourtant l'URL de production
      // (cf. .github/workflows/cd.yml). Résultat : `next/image` renvoyait
      // « hostname not configured » sur les logos d'entreprise et photos de
      // candidats en prod. Comme `assetUrl()`/`cvHref()` (lib/api.ts) servent
      // déjà des URL ABSOLUES cross-origin, la liste doit suivre l'API.
      { protocol: 'https', hostname: API_HOSTNAME, pathname: '/uploads/**' },
      // Le domaine marketing sert aussi des fichiers : conservé explicitement.
      //
      // Il est DÉRIVÉ de la même source que l'API. Écrit en dur
      // (`hostname: 'jobsinc.com'`), il ne suivait pas
      // `NEXT_PUBLIC_API_URL` : le jour où le backend change d'hôte, cette
      // entrée continuait d'autoriser un domaine qui ne sert plus rien, ou,
      // à l'inverse, le domaine marketing dynamique manquait et
      // `next/image` répondait « hostname not configured ». La source de
      // vérité reste `lib/api-url.ts` (`API_HOSTNAME`).
      //
      // Repli : le domaine marketing PAR DÉFAUT (`api.jobsinc.com` → son
      // domaine registrant `jobsinc.com`), et uniquement lorsque l'API pointe
      // ailleurs — donc jamais ajouté deux fois pour la prod, et jamais
      // perdu. On ne rajoute pas de liste de noms de domaine à la main : un
      // `remotePattern` de trop fait d'un domaine non contrôlé une source
      // d'images de confiance pour `next/image` (cf. le retrait du wildcard
      // `*.jobsinc.com` juste au-dessus).
      ...(API_HOSTNAME === 'api.jobsinc.com' ? [] : [{ protocol: 'https' as const, hostname: 'jobsinc.com', pathname: '/uploads/**' }]),
      // Le wildcard `*.jobsinc.com` a été retiré : une prise de contrôle d'un
      // sous-domaine transformait un domaine non contrôlé en source d'images
      // de confiance pour next/image, donc en canal d'exfiltration.
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: API_URL,
    NEXT_PUBLIC_SESSION_ENDPOINT: process.env.NEXT_PUBLIC_SESSION_ENDPOINT || '/auth/me',
    NEXT_PUBLIC_DASHBOARD_ENDPOINT: process.env.NEXT_PUBLIC_DASHBOARD_ENDPOINT || '/company/dashboard',
    NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT: process.env.NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT || '/company/jobs',
    NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT: process.env.NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT || '/company/applications',
    NEXT_PUBLIC_CREATE_JOB_ENDPOINT: process.env.NEXT_PUBLIC_CREATE_JOB_ENDPOINT || '/company/jobs',
    NEXT_PUBLIC_REGISTER_ENDPOINT: process.env.NEXT_PUBLIC_REGISTER_ENDPOINT || '/auth/register/company',
    NEXT_PUBLIC_LOGIN_ENDPOINT: process.env.NEXT_PUBLIC_LOGIN_ENDPOINT || '/auth/login/company',
  },
};

export default nextConfig;
