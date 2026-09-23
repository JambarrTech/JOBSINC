const { PrismaClient } = require('@prisma/client');

// Neon (scale-to-zero) suspend le compute après ~5 min d'inactivité.
// Le réveil (cold start) prend 5–30 s et peut échouer sur les 1res
// tentatives : on réessaie les requêtes qui échouent sur une erreur
// de connexion au lieu de remonter l'erreur au contrôleur.
const RETRIABLE_CODES = new Set(['P1001', 'P2024', 'P1000']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const base = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; ; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const retriable = err && RETRIABLE_CODES.has(err.code);
            if (!retriable) throw err;
            // Le pool peut être « empoisonné » (PgBouncer a coupé les
            // connexions après une suspension Neon, Prisma ne les recrée
            // pas tout seul). Un $disconnect + $connect force un pool
            // neuf, qui se reconnecte en ~7 s (vérifié).
            try { await base.$disconnect(); } catch {}
            try { await base.$connect(); } catch {}
            if (attempt === MAX_ATTEMPTS) throw err;
            await sleep(2000 * attempt);
          }
        }
      },
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;