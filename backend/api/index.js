// api/index.js — Entrypoint Vercel serverless
// Vercel exécute ce fichier à chaque requête. On exporte l'app Express
// directement : @vercel/node la transforme en serverless function.
// Aucun app.listen() ici.
require('dotenv').config();

const app = require('../src/app');

// Optionnel: lazy init Prisma/Redis au cold start sans bloquer la requête
// Les helpers Prisma ont déjà un retry intégré (prisma.js) pour Neon scale-to-zero.
// Redis est lazyConnect, donc pas besoin de connectRedis() explicite sur Vercel.

module.exports = app;
// Pour compat Vercel ESM interop
module.exports.default = app;
