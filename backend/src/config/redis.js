const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_TLS = process.env.REDIS_TLS === 'true';

let redis = null;
let redisAvailable = false;

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      tls: REDIS_TLS ? {} : undefined,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
      connectTimeout: 2000,
    });

    let hasLoggedError = false;
    redis.on('error', (err) => {
      redisAvailable = false;
      if (!hasLoggedError) {
        console.warn('[Redis] Not available:', err.message, '(suite en silencieux)');
        hasLoggedError = true;
      }
    });

    redis.on('connect', () => {
      redisAvailable = true;
      console.log('[Redis] Connected');
    });

    redis.on('close', () => {
      redisAvailable = false;
    });
  }
  return redis;
}

async function connectRedis() {
  const client = getRedis();
  if (['wait', 'close', 'end'].includes(client.status)) {
    try {
      await client.connect();
      redisAvailable = true;
    } catch (err) {
      console.warn('[Redis] Connection failed, falling back to in-memory:', err.message);
      redisAvailable = false;
    }
  }
  return client;
}

async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    redisAvailable = false;
  }
}

function isRedisAvailable() {
  return redisAvailable && redis?.status === 'ready';
}

module.exports = { getRedis, connectRedis, closeRedis, isRedisAvailable };