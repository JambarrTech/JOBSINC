const cache = new Map();
const DEFAULT_TTL = 60000;

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

/**
 * Invalide toutes les entrées dont la clé commence par `prefix`
 * (ex. `company:dashboard:<id>` après une écriture métier).
 */
function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

module.exports = { getCached, setCache, invalidate };
