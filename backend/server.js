// server.js — Serveur long-lived (local / VPS) avec Socket.IO + intervals
// Sur Vercel ce fichier N'EST PAS utilisé : voir api/index.js + src/app.js
require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const prisma = require('./src/config/prisma');
const { connectRedis, closeRedis, isRedisAvailable } = require('./src/config/redis');
const { cleanupExpiredRefreshTokens } = require('./src/utils/tokenUtils');

// CORS origins réutilisées pour Socket.IO (doit matcher app.js)
const corsOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Socket.IO uniquement en mode long-lived (pas sur Vercel)
// Désactivable via DISABLE_SOCKET=true si besoin
if (process.env.DISABLE_SOCKET !== 'true') {
  const socketService = require('./src/services/socketService');
  socketService.init(server, corsOrigins);
} else {
  console.log('ℹ️ Socket.IO désactivé (DISABLE_SOCKET=true)');
}

require('./src/services/pushService').init();

async function connectWithRetry(attempts = 5, baseDelayMs = 5000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      const last = i === attempts;
      console.warn(
        `⚠️ Connexion BDD échouée (${i}/${attempts}) — ${err.message.split('\n')[0]}`
      );
      if (last) throw err;
      const delay = baseDelayMs * i;
      console.log(`↻ Nouvelle tentative dans ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function startServer() {
  try {
    await connectRedis();
    if (isRedisAvailable()) {
      console.log('✅ Redis connecté');
    } else {
      if (process.env.REQUIRE_REDIS === 'true') {
        throw new Error('Redis est obligatoire en production pour le rate-limiting distribué.');
      }
      console.warn('⚠️ Redis non disponible, utilisation du stockage en mémoire pour le rate-limiting (REQUIRE_REDIS=true pour bloquer le démarrage)');
    }
    await connectWithRetry();

    // Intervalles long-lived uniquement : désactivés sur Vercel (remplacés par cron)
    if (!process.env.VERCEL) {
      setInterval(() => cleanupExpiredRefreshTokens().catch(console.error), 60 * 60 * 1000);

      // Anti scale-to-zero Neon : ping toutes les 2 min
      setInterval(async () => {
        try {
          await prisma.user.count();
        } catch {
          try {
            await prisma.$disconnect();
            await prisma.$connect();
          } catch {
            // retry au prochain ping
          }
        }
      }, 2 * 60 * 1000);
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} déjà utilisé. Arrêtez l'ancien processus :`);
        console.error(`   PowerShell: Get-NetTCPConnection -LocalPort ${PORT} | % { Stop-Process -Id $_.OwningProcess -Force }`);
        console.error(`   ou changez PORT dans .env`);
        process.exit(1);
      }
      console.error('❌ Erreur serveur:', err);
      process.exit(1);
    });

    server.listen(PORT, '0.0.0.0', () => {
      const socketInfo = process.env.DISABLE_SOCKET === 'true' ? '' : ' (Socket.IO actif)';
      console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT}${socketInfo}`);
      if (process.env.VERCEL) {
        console.warn('⚠️ VERCEL détecté mais server.js utilisé : sur Vercel utilisez api/index.js via `vercel dev`');
      }
    });
  } catch (err) {
    console.error('❌ Erreur démarrage:', err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('🛑 Arrêt en cours...');
  try {
    await closeRedis();
  } catch (err) {
    console.warn('⚠️ Erreur fermeture Redis:', err.message);
  }
  await prisma.$disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    shutdown().catch(() => process.exit(1));
  }
});

startServer();
