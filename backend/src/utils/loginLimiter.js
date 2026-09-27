const crypto = require('crypto');
const { getRedis, isRedisAvailable } = require('../config/redis');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const LOCKOUT_TTL = Math.ceil(LOCKOUT_MS / 1000);

// In-memory fallback for when Redis is not available
const memoryStore = new Map();

/**
 * Clé de lockout.
 *
 * Elle est désormais centrée sur le COMPTE, pas sur le couple (email, IP).
 * Avec l'IP dans la clé, un attaquant contournait le verrou en changeant
 * simplement d'adresse source : le quota était infini par compte. Verrouiller
 * par compte est ce qui protège réellement le mot de passe ; le rate limiting
 * par IP, lui, est déjà assuré en amont par `authLimiter` / `sensitiveAuthLimiter`.
 *
 * L'email est haché dans la clé : les identifiants ne doivent pas apparaître
 * en clair dans les clés Redis (visible via `KEYS`, les logs, les sauvegardes).
 */
function getLockoutKey(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  return `login:lockout:${digest}`;
}

async function recordFailedAttempt(email) {
  const key = getLockoutKey(email);
  const now = Date.now();

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const multi = redis.multi();
      multi.hincrby(key, 'count', 1);
      multi.hset(key, 'lastAt', now);
      multi.expire(key, LOCKOUT_TTL, 'EX');
      const results = await multi.exec();
      const count = results[0][1];
      if (count === 1) {
        await redis.hset(key, 'firstAt', now);
      }
      return count;
    } catch {
      // Fall through to in-memory if Redis fails
    }
  }

  // In-memory fallback
  const record = memoryStore.get(key) || { count: 0, firstAt: now, lastAt: now };
  if (now - record.firstAt > LOCKOUT_MS) {
    record.count = 0;
    record.firstAt = now;
  }
  record.count++;
  record.lastAt = now;
  memoryStore.set(key, record);
  return record.count;
}

async function isLocked(email) {
  const key = getLockoutKey(email);

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const data = await redis.hmget(key, 'count', 'firstAt');
      const count = parseInt(data[0], 10) || 0;
      const firstAt = parseInt(data[1], 10) || 0;

      if (count === 0) return false;
      if (Date.now() - firstAt > LOCKOUT_MS) {
        await redis.del(key);
        return false;
      }
      return count >= MAX_ATTEMPTS;
    } catch {
      // Fall through to in-memory if Redis fails
    }
  }

  // In-memory fallback
  const record = memoryStore.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAt > LOCKOUT_MS) {
    memoryStore.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

async function clearAttempts(email) {
  const key = getLockoutKey(email);

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      await redis.del(key);
      return;
    } catch {
      // Fall through to in-memory if Redis fails
    }
  }

  memoryStore.delete(key);
}

async function remainingSeconds(email) {
  const key = getLockoutKey(email);

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const data = await redis.hmget(key, 'count', 'firstAt');
      const count = parseInt(data[0], 10) || 0;
      const firstAt = parseInt(data[1], 10) || 0;
      if (count < MAX_ATTEMPTS || !firstAt || Number.isNaN(firstAt)) return 0;
      const elapsed = Date.now() - firstAt;
      if (Number.isNaN(elapsed) || elapsed < 0) return 0;
      const remaining = Math.max(0, Math.ceil((LOCKOUT_MS - elapsed) / 1000));
      return Number.isFinite(remaining) ? remaining : 0;
    } catch {
      // Fall through to in-memory if Redis fails
    }
  }

  // In-memory fallback
  const record = memoryStore.get(key);
  if (!record || record.count < MAX_ATTEMPTS) return 0;
  const now = Date.now();
  const firstAt = record.firstAt;
  if (!firstAt || Number.isNaN(firstAt) || now - firstAt > LOCKOUT_MS) {
    memoryStore.delete(key);
    return 0;
  }
  const elapsed = now - firstAt;
  if (Number.isNaN(elapsed) || elapsed < 0) return 0;
  const remaining = Math.max(0, Math.ceil((LOCKOUT_MS - elapsed) / 1000));
  return Number.isFinite(remaining) ? remaining : 0;
}

// Cleanup expired entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now - record.lastAt > LOCKOUT_MS) {
      memoryStore.delete(key);
    }
  }
}, 60000);
cleanupTimer.unref?.();

module.exports = { recordFailedAttempt, isLocked, clearAttempts, remainingSeconds };