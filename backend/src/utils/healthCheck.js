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
const fs = require('fs/promises');
const path = require('path');

/**
 * Sonde le stockage de fichiers.
 *
 * Ne lève jamais : une dépendance en panne est une DONNÉE à remonter, pas une
 * exception à propager.
 *
 * Trois états, et non deux. La distinction `degraded` / `down` sépare deux
 * pannes qui n'ont rien en commun :
 *
 *   - `down`     : S3 configuré mais INJOIGNABLE, ou bucket absent. Aucun
 *                  fichier ne peut être lu ni écrit : le service ne peut pas
 *                  tenir sa promesse fonctionnelle.
 *   - `degraded` : le stockage FONCTIONNE, mais les écritures ne survivront pas.
 *                  C'est-à-dire `STORAGE_DRIVER=local` en production. Le cas
 *                  est OBSERVÉ : le disque d'un hébergeur managé est éphémère,
 *                  chaque redéploiement efface CV, CV et photos, qui répondent
 *                  alors `Cannot GET /uploads/…`. Aucun test ne le détectait —
 *                  le service démarrait « sain », l'API répondait 200, et la
 *                  perte n'apparaissait qu'à l'écran, sans trace.
 *   - `ok`       : S3 répond, ou le driver local est acceptable (dev).
 *
 * La sonde S3 fait un `HeadBucket` : appel de métadonnées, sans transfert
 * d'octets. Un `ListObjects` serait plus bavard et ne prouverait rien de plus.
 */
async function probeStorage() {
  const driver = process.env.STORAGE_DRIVER || 'local';
  const startedAt = process.hrtime.bigint();
  const ms = () => Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);

  if (driver === 's3') {
    if (!process.env.AWS_S3_BUCKET) {
      // La sonde précédente ne testait QUE `Boolean(AWS_S3_BUCKET)`. Une
      // variable DÉCLARÉE et un bucket réellement joignable sont deux choses
      // différentes — et la première se lit exactement comme la seconde dans
      // un tableau de santé.
      return {
        status: 'down',
        driver,
        latencyMs: null,
        reason: 'AWS_S3_BUCKET absent alors que STORAGE_DRIVER=s3.',
      };
    }
    try {
      const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region: process.env.AWS_S3_REGION || 'eu-west-1',
        endpoint: process.env.AWS_S3_ENDPOINT,
      });
      await client.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET }));
      return {
        status: 'ok',
        driver,
        latencyMs: ms(),
        reason: `Bucket ${process.env.AWS_S3_BUCKET} joignable.`,
      };
    } catch (err) {
      return {
        status: 'down',
        driver,
        latencyMs: ms(),
        reason: `Bucket injoignable : ${err?.name || err?.message || 'erreur inconnue'}.`,
      };
    }
  }

  // Driver local : on vérifie l'ÉCRITURE, pas seulement l'existence du dossier.
  const dir = process.env.VERCEL
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, '..', '..', 'uploads');
  try {
    await fs.mkdir(dir, { recursive: true });
    const sonde = path.join(dir, `.healthcheck-${process.pid}`);
    await fs.writeFile(sonde, String(Date.now()), { flag: 'w' });
    await fs.unlink(sonde);
  } catch (err) {
    return {
      status: 'down',
      driver,
      latencyMs: ms(),
      reason: `Dossier ${dir} non accessible en écriture : ${err?.code || err?.message}.`,
    };
  }

  if (process.env.NODE_ENV === 'production') {
    return {
      status: 'degraded',
      driver,
      latencyMs: ms(),
      reason: 'STORAGE_DRIVER=local en production : le disque est éphémère, les uploads seront perdus au prochain redéploiement.',
    };
  }
  return { status: 'ok', driver, latencyMs: ms(), reason: `Dossier local ${dir} accessible en écriture.` };
}

/**
 * Exécute la sonde et retourne l'état brut des dépendances.
 *
 * Ne lève jamais : une dépendance en panne est une DONNÉE à remonter, pas une
 * exception à propager. Le code HTTP (503 ou 200) est laissé au choix de
 * l'appelant, qui connaît son propre contrat.
 *
 * @returns {Promise<{status:'ok'|'degraded', db:'up'|'down', redis:'up'|'down', storage:object, dbLatencyMs:number|null}>}
 */
async function probe() {
  const redisUp = isRedisAvailable();
  const result = {
    status: 'ok',
    db: 'up',
    redis: redisUp ? 'up' : 'down',
    // ETAT P2 « Décider Redis » : sans Redis les quotas sont PAR INSTANCE
    // (N instances = N fois le quota). Explicite ici plutôt qu'une ligne
    // noyée : l'admin voit le mode, pas seulement une dépendance down.
    rateLimitMode: redisUp ? 'distributed' : 'per-instance',
    dbLatencyMs: null,
    storage: { status: 'ok', driver: process.env.STORAGE_DRIVER || 'local', latencyMs: null, reason: 'non sondé' },
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

  // Le stockage, lui, est sondé pour de vrai : c'est la dépendance dont la
  // panne est la plus SILENCIEUSE — l'API reste verte, tout est « normal »,
  // et seule l'image manque à l'écran.
  result.storage = await probeStorage();
  if (result.storage.status !== 'ok') result.status = 'degraded';

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
 *
 * `REQUIRE_STORAGE=true` applique la même idée au stockage. Inactif par
 * défaut : `STORAGE_DRIVER=local` reste acceptable en développement, et un 503
 * sur un disque parfaitement inscriptible dégraderait le service local.
 */
async function healthReport() {
  const p = await probe();
  const redisRequired = process.env.REQUIRE_REDIS === 'true';
  const storageRequired = process.env.REQUIRE_STORAGE === 'true';
  const unhealthy =
    p.db === 'down'
    || (redisRequired && p.redis === 'down')
    || (storageRequired && p.storage.status === 'down');
  return {
    statusCode: unhealthy ? 503 : 200,
    body: {
      status: p.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: p.db,
      redis: p.redis,
      rateLimitMode: p.rateLimitMode,
      storage: p.storage.status,
      storageDriver: p.storage.driver,
    },
  };
}

module.exports = { probe, healthReport, probeStorage };
