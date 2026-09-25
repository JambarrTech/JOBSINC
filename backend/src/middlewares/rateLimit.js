const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');

const skipOptions = (req) => req.method === 'OPTIONS';
const stdHeaders = { standardHeaders: 'draft-7', legacyHeaders: false };

// Global souple (filet de sécurité) — 500/min/IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 500,
  skip: skipOptions,
  ...stdHeaders,
  message: { error: 'Trop de requêtes. Réessayez dans un instant.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: skipOptions,
  ...stdHeaders,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

const sensitiveAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skip: skipOptions,
  ...stdHeaders,
  message: { error: 'Trop de demandes. Réessayez dans une heure.' },
});

// Séparation par app (même IP, quotas isolés)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  skip: skipOptions,
  ...stdHeaders,
  message: { error: 'Trop de requêtes publiques. Réessayez.' },
});

const candidateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  skip: skipOptions,
  ...stdHeaders,
  keyGenerator: (req) => `cand:${ipKeyGenerator(req.ip)}`,
  message: { error: 'Trop de requêtes candidat.' },
});

const recruiterLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  skip: skipOptions,
  ...stdHeaders,
  keyGenerator: (req) => `rec:${ipKeyGenerator(req.ip)}`,
  message: { error: 'Trop de requêtes recruteur.' },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: skipOptions,
  ...stdHeaders,
  keyGenerator: (req) => `adm:${ipKeyGenerator(req.ip)}`,
  message: { error: 'Trop de requêtes admin.' },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: skipOptions,
  ...stdHeaders,
  keyGenerator: (req) => `msg:${ipKeyGenerator(req.ip)}`,
  message: { error: 'Trop de messages. Ralentissez.' },
});

module.exports = { globalLimiter, authLimiter, sensitiveAuthLimiter, publicLimiter, candidateLimiter, recruiterLimiter, adminLimiter, messageLimiter };