// server.js — Serveur long-lived avec Socket.IO + intervals
// C'EST l'entrée de déploiement (Render, via le Blueprint racine `render.yaml`).
// `api/index.js` existe pour un runtime sans listener — voir son en-tête.
require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const prisma = require('./src/config/prisma');
const { getCorsOrigins } = require('./src/config/corsOrigins');
const { connectRedis, closeRedis, isRedisAvailable } = require('./src/config/redis');
const { cleanupExpiredRefreshTokens } = require('./src/utils/tokenUtils');

// CORS origins réutilisées pour Socket.IO (doit matcher app.js)
const corsOrigins = getCorsOrigins(process.env);

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
      // Invalidation de cache inter-instances : sans cela, une écriture faite
      // sur l'instance A laisse l'instance B servir un dashboard périmé, et
      // `matching:pool:` peut ignorer une candidature fraichement déposée.
      const { bindInvalidationSubscriber } = require('./src/utils/cache');
      bindInvalidationSubscriber();
      console.log('✅ Cache applicatif synchronisé entre instances');
    } else {
      if (process.env.REQUIRE_REDIS === 'true') {
        throw new Error('Redis est obligatoire en production pour le rate-limiting distribué.');
      }
      console.warn('⚠️ Redis non disponible : rate-limiting et invalidation de cache limités à cette instance (REQUIRE_REDIS=true pour bloquer le démarrage)');
    }
    await connectWithRetry();

    // `APP_URL` n'est pas cosmétique : c'est lui qui fait autorité pour
    // construire les URL absolues servies au public (`src/utils/urls.js`).
    //
    // Sans lui, `absoluteUrl` retombe sur l'en-tête `Host` de la requête. Derrière
    // le proxy Render, `TRUST_PROXY=1` laisse descendre cet en-tête tel quel :
    // un visiteur anonyme pourrait alors demander la liste PUBLIQUE des offres
    // avec `Host: <domaine-qui-lui-appartient>` et obtenir des URL de logo et de
    // photo pointant vers ce domaine. Un garde-fou de FORME existe en repli
    // (il bloque CR/LF, espaces, `@`, chemin), mais un domaine bien formé passe.
    //
    // L'avertissement est donc émis au démarrage, et non à la première
    // construction d'URL : un défaut de configuration doit se voir quand on
    // déploie, pas quand un visiteur le déclenche.
    if (!String(process.env.APP_URL || '').trim()) {
      console.warn(
        '⚠️ APP_URL absente : les URL absolues (logos, photos, pièces jointes) '
        + 'seront construites depuis l\'en-tête Host du visiteur, ce qui les rend '
        + 'injectables. Renseigner APP_URL avec l\'URL publique du service.'
      );
    }

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

      // Garde-fou STORAGE_DRIVER. Nécessaire parce que le Blueprint laisse
      // `STORAGE_DRIVER` facultatif : sans lui, le driver retombe sur `local`,
      // et le disque d'un hébergeur managé est ÉPHÉMÈRE. Les fichiers déposés
      // sont alors perdus à chaque redéploiement — le symptôme exact observé :
      // `Cannot GET /uploads/cvs/<uuid>.pdf` (404 d'Express : la route est
      // montée et l'authentification passe, le FICHIER n'est simplement plus
      // là), et les photos cassées.
      //
      // On avertit au DÉMARRAGE et non à la première lecture : au moment où un
      // utilisateur découvre la perte, l'information est inutile.
      if (process.env.NODE_ENV === 'production' && (process.env.STORAGE_DRIVER || 'local') !== 's3') {
        console.warn(
          '⚠️  STORAGE_DRIVER n\'est pas « s3 » en production : les uploads sont écrits sur le'
          + ' DISQUE LOCAL, qui est ÉPHÉMÈRE sur un hébergeur managé. Les CV, CV et photos'
          + ' déposés disparaitront au prochain redéploiement (404 « Cannot GET /uploads/… »).'
          + ' Définissez STORAGE_DRIVER=s3 et AWS_S3_BUCKET/AWS_S3_REGION/'
          + ' AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY — voir DEPLOY.md §4.'
        );
      }
      if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
        console.warn(
          '⚠️  APP_URL absente : les liens des emails (vérification, réinitialisation) seront'
          + ' construits sur l\'en-tête Host. Voir DEPLOY.md §3.'
        );
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
