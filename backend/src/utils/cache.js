/**
 * Cache applicatif en mémoire, avec invalidation distribuée via Redis pub/sub.
 *
 * POURQUOI LE PUB/SUB :
 * ce cache n'est que LOCAL à l'instance. Or les entrées qu'il porte sont
 * exactement celles qui pilotent l'affichage utilisateur :
 *   - `company:dashboard:<id>`  (30 s)
 *   - `stats:global`             (30 s, public)
 *   - `matching:pool:<id>`       (30 s, entrée du moteur de matching)
 *
 * `invalidate()` ne purgait que la Map locale. Avec plusieurs instances
 * Render (ou plusieurs lambdas Vercel), une écriture faite sur l'instance 1
 * laissait l'instance 2 servir une valeur périmée jusqu'à 30 s. Pour
 * `matching:pool:` ce n'est pas de la fraîcheur mais une INCOHÉRENCE : une
 * candidature ou une offre fraîchement créée pouvait manquer des
 * recommandations selon l'instance qui servait la requête.
 *
 * `publishInvalidation` diffuse donc le préfixe à toutes les instances, qui
 * vident leur Map locale. Sans Redis, le comportement est exactement celui
 * d'avant (purge locale seule) : la dégradation reste gracieuse.
 */

const { getRedis, isRedisAvailable } = require('../config/redis');

const cache = new Map();
const DEFAULT_TTL = 60000;
const INVALIDATION_CHANNEL = 'jobsinc:cache:invalidate';

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = DEFAULT_TTL) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// Nettoyage périodique des entrées expirées jamais relues (évite leak mémoire)
const CLEANUP_INTERVAL = 60 * 1000;
const cleanupCacheTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, CLEANUP_INTERVAL);
cleanupCacheTimer.unref?.();

/** Purge locale, sans diffusion. Utilisé par le subscriber pub/sub. */
function invalidateLocal(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Invalide toutes les entrées dont la clé commence par `prefix`
 * (ex. `company:dashboard:<id>` après une écriture métier), sur TOUTES les
 * instances.
 */
function invalidate(prefix) {
  invalidateLocal(prefix);

  if (!isRedisAvailable()) return;
  try {
    getRedis()
      .publish(INVALIDATION_CHANNEL, prefix)
      .catch(() => {});
  } catch (_) {
    // Redis indisponible : la purge locale a déjà eu lieu.
  }
}

let subscriberBound = false;

/**
 * Abonne l'instance au canal d'invalidation. Idempotent.
 * À appeler une fois au boot (server.js).
 */
function bindInvalidationSubscriber() {
  if (subscriberBound) return;
  if (!isRedisAvailable()) return;
  try {
    const subscriber = getRedis().duplicate();
    subscriber.on('error', () => {
      // Redis indisponible : on continue en cache local.
    });
    subscriber.subscribe(INVALIDATION_CHANNEL, (err) => {
      if (err) return;
      subscriber.on('message', (_channel, prefix) => {
        if (typeof prefix !== 'string' || prefix.length === 0) return;
        invalidateLocal(prefix);
      });
    });
    subscriberBound = true;
  } catch (_) {
    // Pas de subscriber : comportement dégradé (purge locale seule).
  }
}

module.exports = {
  getCached,
  setCache,
  invalidate,
  invalidateLocal,
  bindInvalidationSubscriber,
};
