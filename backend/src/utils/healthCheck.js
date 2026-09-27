// ============================================================
// SONDE DE SANTÉ
//
// Pourquoi ce fichier existe
// --------------------------
// La logique de `/health` vivait inline dans `src/app.js`. La page d'état
// administrateur (`controllers/adminController.js`, entrée `system`) devait
// donc la réimplémenter — et c'est ce qu'elle faisait, à moitié : elle sondait
// réellement Postgres (`:658`) et le stockage (`:673`), mais renvoyait une
// LITTÉRALE pour l'API elle-même :
//
//     { id: 'api', status: 'operational', latency: '<1 ms' }
//
// Autrement dit, deux des trois indicateurs du tableau étaient honnêtes, et le
// troisième — celui qui interestsait le moins parce qu'il paraissait trivial —
// ne mesurait rien. Un_encart « API opérationnelle » affiché en vert permanent
// est pire qu'une absence d'indicateur : il apprend à l'administrateur à
// ignorer le tableau de santé, y compris le jour où la base est réellement
// tombée.
//
// Extraction en une seule fonction, réutilisée par les deux appelants : la
// duplication est précisément ce qui avait produit l'écart (cf. `utils/urls.js`
// pour le même motif appliqué à `absoluteUrl`).
// ============================================================

const { isRedisAvailable } = require('../config/redis');

/**
 * Exécute la sonde et retourne l'état brut des dépendances.
 *
 * Ne lève jamais : une dépendance en panne est une DONNÉE à remonter, pas une
 * exception à propager. Le code HTTP (503 ou 200) est laissé au choix de
 * l'appelant, qui connaît son propre contrat.
 *
 * @returns {Promise<{status:'ok'|'degraded', db:'up'|'down', redis:'up'|'down', dbLatencyMs:number|null}>}
 */
async function probe() {
  const redisUp = isRedisAvailable();
  const result = {
    status: 'ok',
    db: 'up',
    redis: redisUp ? 'up' : 'down',
    dbLatencyMs: null,
  };

  const startedAt = process.hrtime.bigint();
  try {
    await require('../config/prisma').$queryRaw`SELECT 1`;
    result.dbLatencyMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
  } catch {
    result.db = 'down';
    result.status = 'degraded';
    // On court-circuite : interroger Redis quand la base est tombée n'apporte
    // aucune information et allonge la réponse d'une page d'état qui doit
    // rester instantanée pour l'admin.
    return result;
  }

  // Redis absent n'est pas « down » au sens d'une panne : le service dégrade
  // proprement vers ses replis en mémoire (voir `config/redis.js` et
  // `utils/cache.js`). `REQUIRE_REDIS=true` déclare en revanche que l'absence
  // de Redis doit être traitée comme une panne.
  if (!redisUp) {
    result.status = 'degraded';
  }

  return result;
}

/**
 * Sonde + décision HTTP, pour l'endpoint `/health`.
 *
 * `REQUIRE_REDIS=true` transforme l'absence de Redis en 503. Sinon, Redis
 * indisponible reste un 200 `degraded` : c'est le contrat qui distingue
 * « l'instance répond » de « toutes les dépendances sont saines », et Render
 * ne doit pas tuer un conteneur parfaitement capable de servir parce que son
 * cache est parti.
 */
async function healthReport() {
  const p = await probe();
  const redisRequired = process.env.REQUIRE_REDIS === 'true';
  const unhealthy = p.db === 'down' || (redisRequired && p.redis === 'down');
  return {
    statusCode: unhealthy ? 503 : 200,
    body: {
      status: p.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: p.db,
      redis: p.redis,
    },
  };
}

module.exports = { probe, healthReport };
