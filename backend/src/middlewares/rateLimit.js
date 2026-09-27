const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { getRedis, isRedisAvailable } = require('../config/redis');
const { getAccessTokenFromCookies } = require('../utils/tokenCookies');
const logger = require('../utils/logger');

const skipOptions = (req) => req.method === 'OPTIONS';
const stdHeaders = { standardHeaders: 'draft-7', legacyHeaders: false };

/** Forme de retour attendue par `express-rate-limit` quand aucun store ne compte. */
function uncounted(windowMs) {
  return { totalHits: 0, resetTime: Date.now() + (windowMs || 60 * 1000) };
}

/**
 * Store Redis pour `express-rate-limit`.
 *
 * SANS CE STORE, les 9 limiters utilisaient le `MemoryStore` par défaut :
 * les compteurs étaient donc par INSTANCE. Sur Vercel (une lambda par région)
 * ou avec plusieurs instances Render, la limite effective était N fois celle
 * configurée, et repartait à zéro à chaque cold start — un attaquant pouvait
 * simplement étaler ses requêtes ou forcer des redéploiements.
 *
 * Retourne `undefined` si Redis n'est pas prêt : `express-rate-limit` retombe
 * alors sur son `MemoryStore`, donc le service reste fonctionnel (et borné par
 * instance) si Redis tombe.
 */
/**
 * Résolveurs de store enregistrés, pour que `resetRateLimitStore()` puisse
 * atteindre l'état privé de chaque limiteur.
 */
const storeResetters = [];

/**
 * Store Redis pour UN limiteur.
 *
 * SANS store Redis, les 9 limiters utilisent un `MemoryStore` : les compteurs
 * sont donc par INSTANCE. Avec plusieurs instances Render, la limite effective
 * était N fois celle configurée, et repartait à zéro à chaque cold start — un
 * attaquant pouvait étaler ses requêtes ou forcer des redéploiements.
 *
 * Un store PAR limiteur, et non un store partagé
 * ----------------------------------------------
 * Chaque limiteur a sa propre fenêtre : 60 s pour la plupart, 15 min pour
 * `authLimiter`, 60 min pour `sensitiveAuthLimiter`. Or `init(options)` — que
 * `express-rate-limit` appelle sur le store qu'il a reçu — fixe le `windowMs`
 * du store. Un store partagé verrait donc les 9 `init` s'écraser les uns les
 * autres, et le dernier déclaré fixerait la fenêtre de tous : le limiteur
 * « sensible » (5/h) aurait compté sur une fenêtre de 60 s, donc jamais bloqué.
 * Séparer l'état est ce qui rend les quotas réellement distincts.
 *
 * `null` n'est atteignable que si `rate-limit-redis` est absent : le service
 * reste alors fonctionnel, borné par instance.
 */
function makeRedisStore() {
  const { RedisStore } = require('rate-limit-redis');
  return new RedisStore({
    sendCommand: (...args) => getRedis().call(...args),
    prefix: 'rl:',
  });
}

/**
 * `MemoryStore` d'express-rate-limit pour UN limiteur, construit à la première
 * utilisation.
 *
 * Pourquoi pas au chargement du module : `middlewares/rateLimit.js` est évalué
 * par `src/app.js`, donc bien avant que quoi que ce soit soit prêt. Construire
 * la cible ici serait exactement le piège que ce module neutralise, et cela
 * rendait en plus le module impossible à charger sous un double de test (celui
 * de `rateLimitKeys.test.js` ne fournit que `default` et `ipKeyGenerator`).
 */
function makeFallbackStore() {
  const { MemoryStore } = require('express-rate-limit');
  if (typeof MemoryStore !== 'function') return null;
  return new MemoryStore();
}

/** Réinitialise les caches de store de tous les limiters. */
function resetRateLimitStore() {
  for (const reset of storeResetters) reset();
}

/**
 * Store à résolution LAZY, un par limiteur.
 *
 * Le piège que ce wrapper existe pour neutraliser
 * ------------------------------------------------
 * `base()` construisait le store au moment où le module
 * `middlewares/rateLimit.js` est évalué. Or ce module est chargé par
 * `src/app.js`, lui-même chargé par `server.js:6` — donc AVANT
 * `await connectRedis()` en `server.js:50`.
 *
 * Conséquence réelle : au moment où les 9 limiters étaient construits, Redis
 * n'était pas encore connecté, `isRedisAvailable()` valait `false`, et TOUS les
 * limiters recevaient un `MemoryStore`… POUR TOUTE LA DURÉE DU PROCESSUS. Le
 * store n'était pas seulement « figé au boot » : les objets limiter étaient
 * déjà figés avec leur store mémoire, donc même le cache Redis ne pouvait plus
 * aider. `resetRateLimitStore()` avait été écrit pour ce cas et n'était appelé
 * nulle part.
 *
 * Sur Render, Redis se connectait ensuite avec succès (`Redis connecté` au log),
 * `REQUIRE_REDIS` n'était pas bloquant, et l'administrateur croyait avoir un
 * rate limiting distribué alors que les quotas restaient par instance — donc
 * N fois moins stricts en cas de scale horizontal, et remis à zéro à chaque
 * redéploiement.
 *
 * Ce store ne résout sa cible qu'au moment de l'appel et délègue chaque
 * opération. La première requête arrive forcément APRÈS `connectRedis()`, donc
 * elle utilise réellement Redis. Si Redis tombe ensuite, le `MemoryStore` prend
 * le relais sans que le moindre appelant ne le sache — ce qui suppose de
 * REVÉRIFIER la disponibilité à chaque opération, pas seulement au premier
 * usage : voir `resolve()`.
 */
function lazyStore() {
  // État privé de CE limiteur : cible Redis, cible mémoire, et options reçues.
  let redisTarget;
  let fallback;
  let redisUnusable = false;
  let initOptions = null;
  let warned = false;

  const warnOnce = (message) => {
    if (warned) return;
    warned = true;
    // Passe par `utils/logger` et non par `console.warn` : ces deux messages
    // signalent une DÉGRADATION silencieuse (quotas comptés par instance, ou
    // pas comptés du tout) et c'est précisément le genre d'information qu'un
    // aggregateur doit pouvoir remonter. Un `console.warn` les sortirait du
    // flux JSON, et ignorerait `LOG_LEVEL` — un `LOG_LEVEL=error` en
    // production aurait quand même laissé passer l'alerte.
    logger.warn({ message, scope: 'rateLimit' });
  };

  /**
   * Cible effective pour une opération : Redis si joignable, sinon le repli.
   *
   * Résolu À CHAQUE APPEL — c'est le cœur de la correction.
   */
  function resolve() {
    // La disponibilité est revérifiée À CHAQUE APPEL, et c'est ce `if` qui porte
    // toute la correction : une panne de Redis survenue APRÈS le démarrage fait
    // sauter le bloc ci-dessous, et l'exécution bascule sur le repli mémoire.
    //
    // Une première version invalidait aussi le cache (`redisTarget = undefined`)
    // dans un bloc séparé, en amont, sur l'idée qu'un store Redis mis en cache
    // pouvait rester joignable. Le test de mutation a montré que ce bloc était
    // INUTILE — le store en cache n'est atteint que si Redis est disponible —
    // et surtout que sa suppression ne changeait rien. Il a donc été retiré :
    // `getRedis()` renvoie le client ioredis unique, qui se reconnecte tout seul,
    // donc réutiliser le même `RedisStore` après un incident est correct.
    if (!redisUnusable && isRedisAvailable()) {
      if (redisTarget === undefined) {
        try {
          redisTarget = makeRedisStore();
          // `init` porte le `windowMs` de ce limiteur : sans lui, `resetTime`
          // serait calculé sur `undefined`.
          if (initOptions) redisTarget.init(initOptions);
        } catch (err) {
          // `rate-limit-redis` est optionnel : sans lui, on reste en mémoire.
          redisUnusable = true;
          warnOnce(`rate-limit-redis indisponible, quotas comptés par instance : ${err.message}`);
        }
      }
      if (redisTarget) return redisTarget;
    }

    if (fallback === undefined) {
      try {
        fallback = makeFallbackStore();
        // Même raison que pour Redis : les deux cibles sont créées APRÈS
        // `init()` (résolution paresseuse), donc c'est ici, et seulement ici,
        // qu'elles peuvent recevoir leur fenêtre. Le faire dans `init()`
        // ne configurerait RIEN, les cibles n'existant pas encore.
        if (fallback && initOptions) fallback.init(initOptions);
      } catch (err) {
        fallback = null;
        warnOnce(`MemoryStore indisponible, quotas non comptés : ${err.message}`);
      }
    }
    return fallback;
  }

  const currentWindowMs = () =>
    (initOptions && Number.isFinite(initOptions.windowMs) ? initOptions.windowMs : 60 * 1000);

  const store = {
    /**
     * `express-rate-limit` appelle `init` une seule fois, au premier passage.
     * On mémorise les options : les deux cibles seront créées plus tard, à la
     * première opération, et c'est `resolve()` qui leur appliquera cette
     * fenêtre. Ne configurer que la cible déjà active laisserait le repli privé
     * de `windowMs`, donc une panne de Redis ultérieure compterait n'importe
     * comment.
     */
    init(options) {
      initOptions = options || null;
      if (redisTarget) redisTarget.init(initOptions);
      if (fallback) fallback.init(initOptions);
    },
    async increment(key) {
      const target = resolve();
      return target ? target.increment(key) : uncounted(currentWindowMs());
    },
    async decrement(key) {
      const target = resolve();
      return target ? target.decrement(key) : uncounted(currentWindowMs());
    },
    async resetKey(key) {
      const target = resolve();
      return target ? target.resetKey(key) : uncounted(currentWindowMs());
    },
    async resetAll() {
      const target = resolve();
      if (target) return target.resetAll();
      return undefined;
    },
    // `express-rate-limit` appelle `shutdown()` à la fermeture, y compris sur
    // un store qu'il n'a pas initialisé.
    async shutdown() {
      const target = resolve();
      if (target && typeof target.shutdown === 'function') return target.shutdown();
      return undefined;
    },
  };

  storeResetters.push(() => {
    redisTarget = undefined;
    fallback = undefined;
    redisUnusable = false;
  });

  return store;
}

const base = (options) => ({
  skip: skipOptions,
  ...stdHeaders,
  // Store distribué quand Redis est disponible, MemoryStore sinon. Résolution
  // différée à chaque opération — voir `lazyStore` pour le piège neutralisé.
  store: lazyStore(),
  ...options,
});

/**
 * Clé de comptage.
 *
 * Les quotas sont isolés par APP (préfixe) comme avant, mais l'identité est
 * de préférence l'UTILISATEUR authentifié et non l'IP. Les commentaires
 * précédents annonçaient « quotas par userId » alors que toutes les clés
 * étaient des IP : derrière un même proxy/NAT ou un réseau d'entreprise, tous
 * les recruteurs d'une même boîte partageaient un seau de 200/min.
 *
 * On retombe sur l'IP pour les requêtes non authentifiées (public, auth), où
 * l'IP est la seule identité disponible.
 *
 * Les JWT sont vérifiés avec `verify` (pas `decode`) : une signature invalide
 * ne doit pas pouvoir fabriquer un bucket de quota arbitraire. Le coût est
 * borné car le middleware d'auth le fait de toute façon en aval.
 */
function identify(scope) {
  return (req, res) => {
    // Deux sources de jeton, car les clients ne s'authentifient PAS de la même
    // façon :
    //   - mobile / scripts : en-tête `Authorization: Bearer`;
    //   - web : cookie HttpOnly posé par le backend, et RIEN dans les
    //     en-têtes (le frontend ne répercute jamais son `jobsinc_token`).
    //
    // Avant, seul l'en-tête était inspecté : **toute session navigateur
    // retombait sur l'IP** — c'est-à-dire exactement le défaut que le
    // commentaire ci-dessus prétend corriger. Derrière le proxy Render
    // (`trust proxy`), un bureau, un réseau d'entreprise ou une CGNAT mobile
    // partageaient un seul seau, et un seul utilisateur pouvait saturer le
    // quota de tous les autres.
    const header = req.headers.authorization;
    let token = null;
    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7);
    } else if (req.cookies) {
      token = getAccessTokenFromCookies(req.cookies);
    }

    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
          const userId = decoded.userId || decoded.id;
          if (userId) return `${scope}:u:${userId}`;
        }
      } catch {
        // JWT invalide : on retombe sur l'IP (l'authentification échouera de
        // toute façon en aval avec un 401).
      }
    }
    return `${scope}:ip:${ipKeyGenerator(req.ip)}`;
  };
}

// Global souple (filet de sécurité) — 500/min par identité
//
// `/api/cron/cleanup` est explicitement exclu. Le job est déclenché par une
// planification externe (Vercel Cron) dont l'adresse IP de sortie est PARTAGÉE
// entre toutes les invocations de la plateforme : la limiter par IP pouvait
// faire échouer silencieusement le nettoyage des refresh tokens, sans aucune
// erreur applicative. Le coût du job est nul côté utilisateur, et il est
// protégé autrement : `CRON_SECRET` obligatoire, comparaison fail-closed à
// `app.js`, et retour 503 si le secret n'est pas défini.
const globalLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 500,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/cron/cleanup',
  message: { error: 'Trop de requêtes. Réessayez dans un instant.' },
}));

const authLimiter = rateLimit(base({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: identify('auth'),
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
}));

const sensitiveAuthLimiter = rateLimit(base({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: identify('sensitive'),
  message: { error: 'Trop de demandes. Réessayez dans une heure.' },
}));

// Séparation par app (quotas isolés), clé par utilisateur authentifié
const publicLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: identify('public'),
  message: { error: 'Trop de requêtes publiques. Réessayez.' },
}));

const candidateLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 200,
  keyGenerator: identify('cand'),
  message: { error: 'Trop de requêtes candidat.' },
}));

const recruiterLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 200,
  keyGenerator: identify('rec'),
  message: { error: 'Trop de requêtes recruteur.' },
}));

const adminLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: identify('adm'),
  message: { error: 'Trop de requêtes admin.' },
}));

const messageLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: identify('msg'),
  message: { error: 'Trop de messages. Ralentissez.' },
}));

// Service de fichiers. `/uploads` est monté HORS de `/api`, donc le
// `globalLimiter` ne le couvrait pas : la lecture de fichiers n'était ni
// limitée en débit, ni en bande passante, ni protégée contre l'épuisement de
// connexions. Quota volontairement généreux (les vignettes et logos sont
// rechargés par page) mais borné par identité.
const uploadServingLimiter = rateLimit(base({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: identify('uploads'),
  message: { error: 'Trop de requêtes de fichiers. Ralentissez.' },
}));

module.exports = {
  globalLimiter,
  authLimiter,
  sensitiveAuthLimiter,
  publicLimiter,
  candidateLimiter,
  recruiterLimiter,
  adminLimiter,
  messageLimiter,
  uploadServingLimiter,
  resetRateLimitStore,
};
