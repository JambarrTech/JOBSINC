const rateLimit = require('express-rate-limit');

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

module.exports = { authLimiter };
