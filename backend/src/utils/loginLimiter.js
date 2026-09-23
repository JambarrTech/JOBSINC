const { getRedis, isRedisAvailable } = require('../config/redis');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const LOCKOUT_TTL = Math.ceil(LOCKOUT_MS / 1000);

// In-memory fallback for when Redis is not available
const memoryStore = new Map();

function getLockoutKey(email, ip) {
  return `login:lockout:${email.toLowerCase()}:${ip}`;
}

async function recordFailedAttempt(email, ip) {
  const key = getLockoutKey(email, ip);
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

async function isLocked(email, ip) {
  const key = getLockoutKey(email, ip);

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

async function clearAttempts(email, ip) {
  const key = getLockoutKey(email, ip);

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

async function remainingSeconds(email, ip) {
  const key = getLockoutKey(email, ip);

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
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now - record.lastAt > LOCKOUT_MS) {
      memoryStore.delete(key);
    }
  }
}, 60000);

module.exports = { recordFailedAttempt, isLocked, clearAttempts, remainingSeconds };