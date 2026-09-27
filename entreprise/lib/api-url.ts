/**
 * Source de vérité UNIQUE pour l'URL du backend.
 *
 * AVANT : l'expression
 *     (process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api')
 * était recopiée dans 5 modules et 7 sites (`lib/api.ts`, `lib/socket.ts`,
 * `lib/session.ts`, `proxy.ts`, `next.config.ts` ×3). Deux conséquences :
 *
 *  1. Toute correction d'URL devait être appliquée 7 fois, et une seule
 *     omission produisait deux origines différentes dans le même build.
 *  2. Le CD construisait avec `https://api.jobsinc.com/api`
 *     (.github/workflows/cd.yml) alors que TOUS les fallbacks codés en dur
 *     pointaient sur `https://jobsinc.onrender.com/api`. Le résultat : soit le
 *     build cassait, soit la valeur d'env l'emportait par accident, selon le
 *     module qui était lu. Le comportement devenait imprévisible.
 *
 * CORRECTION 2026-09-27 — l'inverse de ce qu'un lecteur pressé conclut.
 * Après vérification EN DIRECT :
 *     https://jobsinc.onrender.com/api/jobs -> 200, JSON JOBSINC
 *     https://api.jobsinc.com/health        -> erreur de certificat
 * `api.jobsinc.com` n'est PAS l'hôte de production : c'est un hôte qui ne sert
 * pas le backend. Les replis de ce module et de `mobile/…/app_config.dart`
 * pointaient donc sur le BON hôte, et `cd.yml` (repli) ainsi que
 * `render.yaml:APP_URL` portaient la MAUVAINE. Les deux sources sont
 * désormais alignées sur `jobsinc.onrender.com`.
 *
 * Le vrai point de friction n'était donc pas « deux origines en dur » mais
 * « une origine en dur et une URL de production IMAGINÉE ». Corriger cela
 * consistait à mesurer, pas à choisir.
 *
 * Ce module exporte l'URL résolue ET son origine. Il doit rester importable
 * depuis le client ET depuis `next.config.ts` (donc : aucune API serveur).
 *
 * IMPORTANT — l'accès est un membre LITTÉRAL (`process.env.NEXT_PUBLIC_API_URL`).
 * C'est la seule forme que Next insole au build. Ne jamais réécrire
 * `process.env[key]` ici : voir le détail dans `lib/admin-api.ts`.
 */

/** Fallback de secours. Doit rester aligné sur le backend de production. */
const FALLBACK_API_URL = 'https://jobsinc.onrender.com/api';

const RAW_API_URL = (process.env.NEXT_PUBLIC_API_URL || FALLBACK_API_URL).replace(/\/$/, '');

/**
 * URL de base de l'API, sans slash final. Ex : `https://jobsinc.onrender.com/api`.
 */
export const API_URL = RAW_API_URL;

/**
 * Origine du backend, sans chemin. Ex : `https://jobsinc.onrender.com`.
 *
 * Calculée défensivement : `new URL()` lève sur une valeur malformée, et
 * l'évaluation au chargement du module faisait planter tout le bundle — y
 * compris la page d'accueil publique — sur une simple faute de frappe dans la
 * variable d'environnement.
 */
export const API_ORIGIN = (() => {
  try {
    return new URL(RAW_API_URL).origin;
  } catch {
    return new URL(FALLBACK_API_URL).origin;
  }
})();

/** Nom d'hôte du backend, pour `images.remotePatterns` et la CSP. */
export const API_HOSTNAME = (() => {
  try {
    return new URL(API_ORIGIN).hostname;
  } catch {
    return new URL(FALLBACK_API_URL).hostname;
  }
})();

/** Origine WebSocket équivalente (`https:` → `wss:`), requise par la CSP. */
export const API_WS_ORIGIN = (() => {
  try {
    const { protocol, host } = new URL(RAW_API_URL);
    return `${protocol === 'http:' ? 'ws:' : 'wss:'}//${host}`;
  } catch {
    return 'wss://jobsinc.onrender.com';
  }
})();

/** Construit une URL absolue vers un endpoint de l'API. */
export const apiEndpoint = (path: string): string =>
  `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

