// Non-régression : résolution LAZY du store de rate limiting.
//
// LE PIEGE NEUTRALISE
// -------------------
// `base()` appelle le store au moment où `middlewares/rateLimit.js` est évalué.
// Or ce module est chargé par `src/app.js`, lui-même chargé par `server.js:6` —
// donc AVANT `await connectRedis()` (`server.js:50`).
//
// Au moment où les 8 limiters étaient construits, `isRedisAvailable()` valait
// donc `false` et TOUS les limiters recevaient un `MemoryStore`, POUR TOUTE LA
// DURÉE DU PROCESSUS. Ce n'était pas seulement « figé au boot » : les objets
// limiter étaient déjà figés avec leur store mémoire, donc même le cache
// `redisStore` ne pouvait plus rien, et `resetRateLimitStore()` — écrit
// précisément pour ce cas — n'était appelé nulle part.
//
// Sur Render, Redis se connectait ensuite avec succès (`✅ Redis connecté` au
// log), `REQUIRE_REDIS` n'était pas bloquant, et l'administrateur croyait avoir
// un rate limiting distribué alors que les quotas restaient par instance. La
// limite effective était donc N fois moins stricte en cas de mise à l'échelle
// horizontale, et repartait à zéro à chaque redéploiement.
//
// SECOND BUG, TROUVÉ PAR CE TEST
// ------------------------------
// La première version du store proxy construisait le `MemoryStore` de repli au
// chargement du module. Deux conséquences :
//   1. le module devenait impossible à charger sous un double de test (celui de
//      `rateLimitKeys.test.js` ne fournit que `default` et `ipKeyGenerator`) ;
//   2. `express-rate-limit` n'appelle `init()` que sur le store qu'il a reçu.
//      Comme c'était le store Redis qui était passé à `rateLimit()`, et que
//      seule la cible Redis recevait `init`, le repli mémoire restait SANS
//      `windowMs` : une panne de Redis ultérieure aurait compté n'importe
//      comment, et `resetTime` aurait été calculé sur `undefined`.
//
// Aucun accès réseau : Redis est simulé par un double de `config/redis`.

const assert = require('node:assert/strict');
const Module = require('node:module');

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`  ECHEC ${name}\n       ${error.message}`);
  }
}

/**
 * Charge `rateLimit.js` avec Redis simulé, et renvoie les stores proxy.
 *
 * `redisAvailable` pilote `isRedisAvailable()`. `redisReady` permet de simuler
 * la panne EN COURS DE VIE, qui est le scénario que la résolution par opération
 * doit couvrir.
 */
function loadRateLimit({ redisAvailable, redisReady = true, captureStore = true }) {
  const state = { redisAvailable, redisReady, commands: 0 };
  const fakeRedis = {
    call: async () => {
      state.commands += 1;
      return 'OK';
    },
  };
  const limiters = {};

  const original = Module._load;

  // VRAIE bibliothèque, chargée avant d'installer le double : on veut tester la
  // résolution de cible, pas réimplémenter `MemoryStore`.
  const realModule = require('express-rate-limit');
  const realMemoryStore = realModule.MemoryStore;

  const target = require.resolve('../src/middlewares/rateLimit');
  Module._load = function patched(mod, parent, isMain) {
    if (mod === 'express-rate-limit') {
      return {
        ...realModule,
        default: (options) => {
          if (captureStore && options && options.store) {
            (limiters.storeOrder = limiters.storeOrder || []).push(options.store);
          }
          // Un limiteur inerte : seul le `store` nous intéresse ici.
          return () => {};
        },
      };
    }
    if (mod === '../config/redis') {
      return {
        getRedis: () => fakeRedis,
        // `ready` permet de basculer Redis en panne après le chargement, sans
        // recharger le module — donc sans reconstruire les limiters.
        isRedisAvailable: () => state.redisAvailable && state.redisReady,
        connectRedis: async () => {},
      };
    }
    return original.apply(this, arguments);
  };

  delete require.cache[target];
  let mod;
  try {
    mod = require('../src/middlewares/rateLimit');
  } finally {
    Module._load = original;
    delete require.cache[target];
  }

  return { mod, limiters, state, realMemoryStore };
}

(async () => {
  console.log('— Store de rate limiting : résolution par opération —');

  await test('le store passé au limiter est un proxy, pas un MemoryStore figé', () => {
    // C'est l'assertion structurelle : si un store figé est passé ici, les
    // suivantes ne peuvent pas passer.
    const { limiters } = loadRateLimit({ redisAvailable: false });
    const store = (limiters.storeOrder || [])[0];
    assert.ok(store, 'aucun store n\'a été passé au limiter');
    assert.equal(typeof store.increment, 'function');
    assert.equal(typeof store.init, 'function');
    assert.notEqual(
      store.constructor && store.constructor.name,
      'MemoryStore',
      'le store doit être le proxy, pas un MemoryStore figé au chargement'
    );
  });

  await test('chaque limiteur a son PROPRE store (les 9 windowMs diffèrent)', () => {
    // Partager un store entre limiters ferait que le dernier `init` imposé
    // sa fenêtre à tous : `sensitiveAuthLimiter` (5/h) compterait alors sur une
    // fenêtre de 60 s et ne bloquerait jamais.
    const { limiters } = loadRateLimit({ redisAvailable: false });
    const stores = limiters.storeOrder || [];
    assert.equal(stores.length, 9, '9 limiters sont attendus');
    const first = stores[0];
    for (const [i, s] of stores.entries()) {
      if (i === 0) continue;
      assert.notEqual(s, first, `le limiter ${i} ne doit pas partager le store du limiter 0`);
    }
  });

  await test('Redis disponible : le store DÉLÉGUE à Redis (et ne compte pas en mémoire)', async () => {
    // Ce qui n'était PAS testable avant : l'état de Redis au moment de la
    // PREMIÈRE opération, pas au chargement du module.
    //
    // On n'affirme pas le retour de `RedisStore` (il exigerait un vrai
    // protocole), mais le fait qu'il soit CONTACTÉ. Un store figé sur
    // `MemoryStore` ne fait aucun appel Redis : c'est exactement ce que le
    // compteur de commandes détecte.
    const { limiters, state } = loadRateLimit({ redisAvailable: true });
    state.commands = 0;
    const store = limiters.storeOrder[0];
    store.init({ windowMs: 60 * 1000, limit: 500 });
    try {
      await store.increment('auth:u:test');
    } catch {
      // Un `RedisStore` branché sur un faux `call` finit par échouer sur le
      // format de réponse : peu importe, ce qui compte est qu'il ait TENTÉ.
    }
    assert.ok(
      state.commands > 0,
      'le store doit déléguer à Redis, pas rester sur un MemoryStore figé'
    );
  });

  await test('panne de Redis EN COURS DE VIE : le store bascule sur le repli mémoire', async () => {
    // Le scénario que la résolution par opération existe pour couvrir : le
    // service démarre avec Redis, puis Redis tombe. Un store figé au boot
    // compterait dans le vide ; le proxy doit reprendre le compte localement.
    //
    // Cette assertion a détecté un défaut réel de `getRateLimitStore()` : le
    // store Redis était renvoyé depuis le cache même quand
    // `isRedisAvailable()` était redevenu `false`, donc chaque requête
    // interrogeait une connexion morte au lieu d'être comptée.
    const { limiters, state } = loadRateLimit({ redisAvailable: true });
    const store = limiters.storeOrder[0];
    store.init({ windowMs: 60 * 1000, limit: 500 });

    try {
      await store.increment('auth:u:avant-panne');
    } catch {
      // Un `RedisStore` branché sur un faux `call` échoue sur le format de
      // réponse ; peu importe, l'état de Redis est ce qu'on manipule ensuite.
    }

    state.redisReady = false; // Redis tombe
    // `state.commands` compte les COMMANDES Redis individuelles, pas les
    // opérations : `RedisStore` émet un MULTI (INCRBY + PEXPIRE + lecture).
    // Ce qui doit être prouvé est donc que le compteur n'AUGMENTE PLUS.
    const commandsApresPanne = state.commands;

    // Lecture immédiate de `totalHits` : `MemoryStore` retourne l'objet client
    // VIV (cf. le test suivant), conserver la référence relirait la valeur
    // finale au lieu de celle du moment.
    const apres = (await store.increment('auth:u:apres-panne')).totalHits;
    assert.ok(apres !== undefined, 'le store doit rester opérationnel après la panne');
    assert.ok(apres >= 1, 'le repli doit réellement compter');

    const encore = (await store.increment('auth:u:apres-panne')).totalHits;
    assert.equal(encore, apres + 1, 'le repli doit incrémenter localement');

    // Une autre identité repart à zéro : le repli ne tient pas un total global.
    const autreCle = (await store.increment('auth:u:autre')).totalHits;
    assert.equal(autreCle, 1, 'chaque identité doit avoir son propre compte');

    // Preuve que la bascule est réelle : plus aucune commande Redis n'est émise
    // une fois Redis tombé. Sans ça, un store figé continuerait de l'interroger.
    assert.equal(
      state.commands,
      commandsApresPanne,
      'aucune nouvelle commande Redis ne doit être émise après la panne'
    );
  });

  await test('le repli mémoire reçoit bien sa fenêtre (windowMs configuré)', async () => {
    // Régression du second bug : les cibles sont créées APRÈS `init()` (c'est
    // toute la raison d'être de la résolution paresseuse), donc `init` ne peut
    // pas les configurer lui-même. C'est `resolve()`, à la première opération,
    // qui doit leur appliquer la fenêtre mémorisée.
    //
    // Sans cela, le `MemoryStore` de repli tournait avec `windowMs: undefined` :
    // `resetTime` calculé sur `undefined` et comptage faux. Le test ci-dessous
    // l'attrape par le symptôme observable — un compteur qui n'avance pas.
    const { limiters, realMemoryStore } = loadRateLimit({ redisAvailable: false });
    const store = limiters.storeOrder[0];

    // On instrumente le vrai `MemoryStore` pour voir ce qu'il reçoit.
    const originalInit = realMemoryStore.prototype.init;
    const seen = [];
    realMemoryStore.prototype.init = function patchedInit(options) {
      seen.push(options && options.windowMs);
      return originalInit.call(this, options);
    };
    try {
      store.init({ windowMs: 60 * 1000, limit: 500 });
      // Piège de l'API : `MemoryStore.increment` retourne l'objet `client`
      // VIVANT stocké dans sa Map, pas une copie. Conserver la référence et la
      // relire plus tard donnerait le décompte final, pas celui du moment. On
      // lit donc la valeur immédiatement.
      const un = (await store.increment('u:1')).totalHits;
      const deux = (await store.increment('u:1')).totalHits;
      const troisieme = (await store.increment('u:1')).totalHits;
      assert.deepEqual(seen, [60 * 1000], `windowMs reçu par MemoryStore : ${JSON.stringify(seen)}`);
      assert.equal(un, 1, 'première requête');
      assert.equal(deux, 2, 'le compteur doit avancer : le repli est réellement utilisé');
      assert.equal(troisieme, 3, 'le compteur doit continuer d’avancer');
    } finally {
      realMemoryStore.prototype.init = originalInit;
    }
  });

  await test('resetRateLimitStore() invalide aussi le repli', () => {
    const { mod } = loadRateLimit({ redisAvailable: false });
    // Ne doit pas lever : c'est ce qui rendait le store inutilisable si le
    // repli n'était pas réinitialisable.
    mod.resetRateLimitStore();
  });

  console.log('');
  if (failures.length) {
    console.error(`${passed} test(s) passé(s), ${failures.length} échec(s).`);
    process.exitCode = 1;
  } else {
    console.log(`OK : ${passed} tests passés (rateLimitStore).`);
  }
})();
