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

let reconnecting = null;
async function safeReconnect() {
  if (reconnecting) return reconnecting;
  reconnecting = (async () => {
    try { await base.$disconnect(); } catch {}
    // Attente avant reconnect pour laisser Neon sortir du suspend
    await sleep(3000);
    try { await base.$connect(); } catch {}
  })().finally(() => { reconnecting = null; });
  return reconnecting;
}

const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const MAX_ATTEMPTS = 4;
        for (let attempt = 1; ; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const retriable = err && RETRIABLE_CODES.has(err.code);
            if (!retriable) throw err;
            if (attempt === MAX_ATTEMPTS) throw err;
            await safeReconnect();
            await sleep(3000 * attempt);
          }
        }
      },
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  if (!global.prisma) global.prisma = prisma;
}

process.on('beforeExit', async () => {
  try { await prisma.$disconnect(); } catch {}
});

module.exports = prisma;