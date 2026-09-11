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

function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

module.exports = { getCached, setCache, invalidate };
