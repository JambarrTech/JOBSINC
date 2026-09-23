const rateLimit = require('express-rate-limit');

const skipOptions = (req) => req.method === 'OPTIONS';
const stdHeaders = { standardHeaders: 'draft-7', legacyHeaders: false };

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
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

module.exports = { globalLimiter, authLimiter, sensitiveAuthLimiter };