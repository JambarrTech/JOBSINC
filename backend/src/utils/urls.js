// ============================================================
// CONSTRUCTION D'URL ABSOLUES
//
// Pourquoi ce fichier existe
// --------------------------
// `absoluteUrl` était implémenté DEUX fois : dans `companyController.js` (avec
// un garde-fou contre l'injection d'en-tête Host) et dans `jobController.js`
// (SANS). Les deux fonctions n'étaient pas équivalentes, et celle de
// `jobController` servait la liste publique des offres — c'est-à-dire la seule
// réponse que reçoit un visiteur non authentifié.
//
// Conséquence concrète : un attaquant contrôlant l'en-tête `Host` (accès par IP
// directe, ou proxy mal configuré avec `TRUST_PROXY=1`, ce que le
// `render.yaml` active) pouvait faire renvoyer à TOUS les anonymes des URLs de
// logo et d'image pointant vers un domaine qu'il contrôle. Les deux copies
// obliged de les maintenir en phase, la divergence était acquise.
//
// Une seule implémentation, testable, gardée. C'est exactement la même
// correction de fond que celle appliquée à `getEffectiveDir`, dont la
// duplication avait provoqué le bypass d'autorisation des uploads.
//
// `APP_URL` doit donc être renseignée en production (déjà le cas dans le
// Blueprint `render.yaml`). Ce n'est pas une formalité : sans elle, cette
// fonction retombe sur l'en-tête `Host` du visiteur, et l'injection décrite
// ci-dessus redevient possible.
// ============================================================

/**
 * Hôte de repli quand aucune origine publique n'est déclarée.
 * Uniquement un environnement de développement : c'est `APP_URL` qui fait
 * autorité dès qu'elle est configurée (voir `requestOrigin`).
 */
const DEV_FALLBACK_HOST = 'localhost:5000';

/** `domaine[.domaine…][:port]` — le vecteur classique (CR/LF, espace, `@`, chemin) est exclu. */
const HOST_SHAPE = /^[a-zA-Z0-9.-]+(?::\d+)?$/;

/**
 * Origine publique déclarée par le déploiement, normalisée.
 *
 * `APP_URL` n'est pas une variable inventée pour ce fichier : elle est déjà
 * lue par `services/emailService.js` (`:18`) pour construire les liens de
 * vérification et de réinitialisation. La réintroduire ici ne crée donc pas une
 * seconde source de vérité — elle SUPPRIME une divergence.
 *
 * Concrètement, avant cette consolidation, un même déploiement pouvait répondre
 * `https://api.jobsinc.com` dans ses réponses JSON (via l'en-tête `Host`) et
 * `https://autre-chose` dans ses emails (via `APP_URL`), sans que rien ne
 * signale l'écart.
 */
function declaredOrigin() {
  const raw = String(process.env.APP_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Un chemin sur `APP_URL` est toléré (`https://api.jobsinc.com/api`) mais
    // ignoré : seules l'origine et le port servent à construire une URL absolue.
    return url.origin;
  } catch {
    // `APP_URL` malformée ne doit pas rendre l'API inopérante : on l'ignore et
    // on retombe sur la validation de l'en-tête, exactement comme sans elle.
    return null;
  }
}

/**
 * Construit une URL absolue à partir d'une valeur de base de données
 * potentiellement relative (`/uploads/...`).
 */
function absoluteUrl(req, value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${requestOrigin(req)}${value.startsWith('/') ? '' : '/'}${value}`;
}

/**
 * Origine publique de l'API, validée.
 *
 * ORDRE DE PRÉCÉDENCE (le point de fond de cette fonction)
 * ------------------------------------------------------
 * 1. `APP_URL` configurée → elle fait autorité, l'en-tête `Host` n'est JAMAIS
 *    consulté. C'est ce qui ferme réellement l'injection.
 * 2. sinon, en développement → l'en-tête `Host`, s'il a une forme valide.
 * 3. sinon → repli `localhost:5000`.
 *
 * Pourquoi 1 doit passer avant 2 : un garde-fou de FORME (`HOST_SHAPE`) n'est
 * pas un garde-fou d'IDENTITÉ. `evil.com` est une chaîne parfaitement
 * conforme à `HOST_SHAPE`. Derrière le proxy Render, `TRUST_PROXY=1` fait
 * descendre l'en-tête `Host` du client jusqu'à `req.get('host')` : un
 * visiteur anonyme pouvait donc demander la liste publique des offres avec
 * `Host: evil.com` et recevoir des URL de logo et de photo pointant vers un
 * domaine qu'il contrôle. La forme était vérifiée, l'identité ne l'était pas.
 *
 * Ce que le garde-fou de forme protège réellement, et qu'il faut garder : un
 * `Host` contenant CR/LF, un espace, un `@` ou un chemin. Ces valeurs peuvent
 * scinder un en-tête de réponse ou polluer un cache, indépendamment de toute
 * question d'identité. D'où les deux étages, et non un seul.
 *
 * La variable est lue à chaque appel, et non au chargement du module, pour
 * rester pilotable en test sans effet de bord à l'import — comme
 * `config/redis.js` et `isEmailConfigured` qui lisent `process.env` à l'usage.
 */
function requestOrigin(req) {
  const declared = declaredOrigin();
  if (declared) return declared;

  const rawHost = req?.get?.('host') || '';
  const host = HOST_SHAPE.test(rawHost) ? rawHost : DEV_FALLBACK_HOST;
  const proto = req?.protocol || 'http';
  return `${proto}://${host}`;
}

module.exports = { absoluteUrl, requestOrigin, declaredOrigin };
