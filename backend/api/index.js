// api/index.js — Entrée « serverless » (secours / local)
//
// ============================================================
// STATUT : CE N'EST PAS LA CIBLE DE DÉPLOIEMENT
// ============================================================
// La production est déployée sur Render via le Blueprint racine `render.yaml`
// (instance unique, `autoDeploy: true`), qui lance `server.js` et obtient donc
// Socket.IO, les `setInterval` et le subscriber d'invalidation de cache.
//
// Ce fichier n'est conservé que comme point d'entrée « processus unique sans
// listener », utilisable pour un `node`-local scoped ou une plateforme
// serverless. Il ne doit pas être considéré comme un second déploiement.
//
// Ce qui a été corrigé ici
// -----------------------
// Ce fichier montrait `src/app` sans jamais brancher
// `bindInvalidationSubscriber()` (`src/utils/cache.js:84`). Sur une
// architecture où le cache applicatif est local à chaque instance, cela
// signifie qu'une écriture sur l'instance A laisse l'instance B servir une
// valeur périmée jusqu'à 30 s — et, pour `matching:pool:`, pas de la
// fraîcheur mais une INCOHÉRENCE : les recommandations dépendaient de
// l'instance qui avait répondu.
//
// Il manque aussi `connectRedis()`. Sans elle, le rate-limiting reste sur son
// `MemoryStore` (voir `middlewares/rateLimit.js`) et la diffusion
// d'invalidation n'a aucun canal.
//
// Les deux sont désormais branchés. Ce qui reste UTILEMENT différent de
// `server.js` est explicite et non caché : ni Socket.IO (il n'y a pas de
// serveur HTTP), ni les `setInterval` (le runtime les gèle entre les requêtes).
// ============================================================

require('dotenv').config();

const prisma = require('../src/config/prisma');
const { connectRedis, isRedisAvailable } = require('../src/config/redis');
const { bindInvalidationSubscriber } = require('../src/utils/cache');

const app = require('../src/app');

/**
 * Préparation paresseuse, exécutée une seule fois par instance.
 *
 * Volontairement non bloquante pour la première requête : Neon est en
 * scale-to-zero et `src/config/prisma.js` réessaie déjà sur P1001/P2024. On
 * n'ajoute donc pas un `await` dans le chemin d'import, qui retarderait le
 * *cold start* de chaque appel.
 */
let ready;
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      try {
        await prisma.$connect();
      } catch (err) {
        // Non bloquant : la requête qui suit obtiendra son propre retry via
        // le middleware d'erreurs, et l'échec sera journalisé.
        console.warn('[serverless] Connexion BDD différée :', err.message);
      }

      await connectRedis();
      if (isRedisAvailable()) {
        bindInvalidationSubscriber();
      } else if (process.env.REQUIRE_REDIS === 'true') {
        // On ne bloque pas la requête : `REQUIRE_REDIS` vaut « je veux être
        // alerté », et `/health` renvoie déjà 503 dans ce cas (voir
        // `utils/healthCheck.js`), ce qui suffit à Render à la détection.
        console.warn('[serverless] REQUIRE_REDIS=true mais Redis indisponible : /health renverra 503.');
      }
    })();
  }
  return ready;
}

// Express accepte une fonction middleware asynchrone à 4 arguments.
app.use((req, res, next) => {
  ensureReady().then(() => next(), next);
});

module.exports = app;
// Compat interop ESM (Vercel importe la valeur par défaut).
module.exports.default = app;
