/**
 * Noms et attributs des cookies de session du BFF web.
 *
 * Source de vérité UNIQUE partagée par :
 *   - `app/api/auth/cookie/route.ts` (pose et efface les cookies)
 *   - `proxy.ts` (les lit pour revalider la session côté serveur)
 *
 * POURQUOI C'ETAIT UN SUJET DE SÉCURITÉ, PAS DE STYLE
 * ----------------------------------------------------
 * Le backend accepte trois noms de cookies porteur du jeton d'accès
 * (`accessToken`, `token` en plus de `jobsinc_token` — cf.
 * `backend/src/utils/tokenCookies.js`, où ils sont documentés comme alias de
 * compatibilité pour le BFF web et les anciens builds mobiles).
 *
 * `proxy.ts` les lisaient TOUS LES TROIS et transformait donc en credential
 * transportée en `Authorization: Bearer` n'importe quel cookie nommé `token`
 * posé sur le domaine frontend — y compris par un script tiers, une app sur un
 * sous-domaine voisin, ou une XSS sur ce même domaine. `accessToken` et `token`
 * sont des noms génériques : promus automatiquement en jeton, ils étendent la
 * surface d'authentification bien au-delà de ce que l'application écrit
 * réellement.
 *
 * Or l'application n'écrit QUE `jobsinc_token` (`route.ts` ligne `COOKIE_NAME`).
 * Les deux alias étaient donc des lectures mortes côté proxy : les supprimer
 * ne retire aucune session valide, uniquement la surface d'attaque.
 *
 * Le backend garde ses propres alias : ils servent la compatibilité avec ses
 * clients (mobile ancien, intégration tierce) et sont indépendés de ce que le
 * frontend décide d'accepter comme bearer token.
 */

/**
 * Nom du cookie de session du frontend. Seul nom écrit ET lu par cette app.
 *
 * Le préfixe `__Host-` est appliqué EN PRODUCTION. Il n'est pas décoratif : le
 * navigateur refuse alors de stocker un cookie qui ne satisfait pas les trois
 * conditions suivantes :
 *   - `Secure` obligatoire (donc HTTPS obligatoire),
 *   - `Path=/` obligatoire,
 *   - `Domain=` INTERDIT (donc impossible à écrire depuis un sous-domaine).
 *
 * Ce qui ferme le défaut `secure: process.env.NODE_ENV === 'production'` : une
 * instance servie en HTTP avec `NODE_ENV` mal réglé ne peut plus émettre de
 * cookie de session en clair. Le navigateur, pas la configuration, devient
 * l'autorité — ce qu'aucun code applicatif ne peut garantir.
 *
 * En développement le nom reste `jobsinc_token` : `__Host-` imposerait HTTPS,
 * ce qui casserait `next dev` sur http://localhost:3000.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-jobsinc_token'
  : 'jobsinc_token';

/** Durée de vie du cookie, alignée sur `ACCESS_TOKEN_TTL` (15 min) côté backend. */
export const SESSION_COOKIE_MAX_AGE = 15 * 60;

/**
 * Attributs du cookie de session.
 *
 * - `httpOnly` : le cœur de la défense contre le vol par XSS. JavaScript ne peut
 *   ni lire ni écrire le jeton. À ne jamais retirer.
 * - `secure` : en production, `__Host-` l'impose déjà ; on l'aligne quand même
 *   pour que le cookie soit conforme même hors du préfixe (dev).
 * - `sameSite: 'lax'` : cohérent avec un BFF déclenché par la navigation. Le
 *   jeton n'est donc pas envoyé lors d'un POST cross-site, ce qui est la
 *   protection CSRF de premier niveau. Le contrôle d'origine explicite de la
 *   route BFF est la seconde barrière.
 * - `path: '/'` : imposé par `__Host-`.
 * - PAS de `domain` : le cookie reste « host-only », donc ne peut pas être posé
 *   sur un domaine parent ou un sous-domaine. C'est le défaut sûr ; ne pas
 *   ajouter de `domain` ici.
 */
export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/' as const,
  maxAge,
});
