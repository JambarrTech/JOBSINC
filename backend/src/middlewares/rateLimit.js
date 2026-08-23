const rateLimit = require('express-rate-limit');

// Limiteur global : protège toute l'API contre le scraping et les abus
// volumétriques. Assez large pour ne jamais gêner un usage normal
// (chargement d'images, polling des notifications).
// OPTIONS est ignoré pour ne pas compter les préflights CORS.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans un instant.' },
});

// Protection des routes d'authentification contre le brute force.
// OPTIONS est ignoré pour ne pas compter les préflights CORS.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

module.exports = { globalLimiter, authLimiter };
