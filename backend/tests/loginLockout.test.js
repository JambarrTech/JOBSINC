// Non-régression : le verrouillage anti-bruteforce doit SURVIVRE à l'échec
// d'authentification.
//
// Régression corrigée — `ReferenceError: email is not defined`.
// Les quatre handlers de connexion (`loginCandidate`, `login`, `loginAdmin`,
// `loginCompany`) déclaraient `const email = req.body.email;` à l'INTÉRIEUR du
// bloc `try`, puis appelaient `recordFailedAttempt(email)` dans le `catch`.
// En JavaScript `const` est lié à son bloc : `email` était invisible depuis le
// `catch`, qui levait un ReferenceError.
//
// Deux conséquences, dont une grave :
//   1. tout mot de passe erroné renvoyait 500 au lieu de 401 ;
//   2. `recordFailedAttempt` n'était JAMAIS atteint, donc le compteur de
//      tentatives ne montait jamais et `isLocked()` restait toujours faux.
//      Autrement dit : AUCUN verrouillage de compte, sur aucun des quatre
//      endpoints — alors que `utils/loginLimiter.js` existe et est testé.
//
// Ce test vérifie le mécanisme, pas seulement le code : on pilote le contrôleur
// avec un `loginLimiter` simulé et on compte les appels réellement effectués.

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
    failures.push(name);
    console.error(`  ECHEC ${name}\n       ${error.message}`);
  }
}

/**
 * Charge `authController` avec un `loginLimiter` simulé, et renvoie
 * `{ controller, attempts, locks }`.
 */
function loadAuthController() {
  const attempts = [];
  const locks = new Map();

  const original = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../utils/loginLimiter' || request.endsWith('utils/loginLimiter')) {
      return {
        recordFailedAttempt: async (email) => { attempts.push(email); },
        isLocked: async (email) => Boolean(locks.get(email)),
        clearAttempts: async () => {},
        remainingSeconds: () => 0,
      };
    }
    return original.call(this, request, parent, isMain);
  };

  try {
    // Le contrôleur tire ses autres dépendances (prisma, services) au require ;
    // on le charge avec un graphe minimal pour n'exécuter que le chemin testé.
    const controllerPath = require.resolve('../src/controllers/authController');
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    return { controller, attempts, locks };
  } finally {
    Module._load = original;
  }
}

/** Réponse `res` minimale, compatible avec le style `handleError`. */
function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    cookie() { return this; },
    clearCookie() { return this; },
  };
}

function makeReq(body, { ip = '203.0.113.9' } = {}) {
  return { body, ip, headers: {}, connection: { remoteAddress: ip } };
}

(async () => {
  console.log('-- Verrouillage anti-bruteforce : la tentative est-elle enregistree ? --');

  const ENDPOINTS = [
    ['loginCandidate', ['CANDIDATE']],
    ['login', null],
    ['loginAdmin', ['ADMIN']],
    ['loginCompany', ['RECRUITER', 'ADMIN']],
  ];

  for (const [name, allowedRoles] of ENDPOINTS) {
    await test(`${name} : un échec enregistre UNE tentative`, async () => {
      const { controller, attempts } = loadAuthController();

      // On force l'échec d'authentification en interceptant le service.
      // On lève la VRAIE `AuthenticationError` : c'est elle que
      // `authService.authenticateUser` produit, et c'est elle que `handleError`
      // sait convertir en 401. Un `Error` générique donnerait un 500 et le test
      // ne vérifierait pas le comportement réel.
      const authService = require('../src/services/authService');
      const { AuthenticationError } = require('../src/utils/errors');
      const originalAuthenticate = authService.authenticateUser;
      authService.authenticateUser = async () => {
        throw new AuthenticationError('Identifiants invalides.');
      };

      try {
        const res = makeRes();
        await controller[name](makeReq({ email: 'cible@e2e-test.local', password: 'mauvais' }), res);

        assert.equal(
          attempts.length,
          1,
          `recordFailedAttempt n'a pas ete appele (attempts=${JSON.stringify(attempts)}) — ` +
          'le ReferenceError "email is not defined" est de retour ?',
        );
        assert.deepEqual(attempts, ['cible@e2e-test.local']);
        assert.equal(
          res.statusCode,
          401,
          `un mot de passe errone doit renvoyer 401, pas ${res.statusCode} (${JSON.stringify(res.body)})`,
        );
      } finally {
        authService.authenticateUser = originalAuthenticate;
      }
    });
  }

  await test('un email absent de la requete ne leve pas', async () => {
    const { controller, attempts } = loadAuthController();
    const res = makeRes();
    // `recordFailedAttempt(undefined)` ne doit pas être atteint : la validation
    // des entrées renvoie 400 avant toute tentative d'authentification.
    await controller.loginCandidate(makeReq({}), res);
    assert.equal(res.statusCode, 400, `attendu 400, recu ${res.statusCode}`);
    assert.equal(attempts.length, 0, 'aucune tentative ne doit etre enregistree sans email');
  });

  await test('un email non-string ne leve pas', async () => {
    const { controller, attempts } = loadAuthController();
    const res = makeRes();
    await controller.loginCompany(makeReq({ email: { $ne: null }, password: 'x' }), res);
    assert.equal(res.statusCode, 400, `attendu 400, recu ${res.statusCode}`);
    assert.equal(attempts.length, 0);
  });

  await test('un compte verrouille repond 429 sans authenticer', async () => {
    const { controller, locks, attempts } = loadAuthController();
    locks.set('bloque@e2e-test.local', true);

    const authService = require('../src/services/authService');
    const originalAuthenticate = authService.authenticateUser;
    let called = false;
    authService.authenticateUser = async () => { called = true; return {}; };

    try {
      const res = makeRes();
      await controller.loginCompany(makeReq({ email: 'bloque@e2e-test.local', password: 'x' }), res);
      assert.equal(res.statusCode, 429, `attendu 429, recu ${res.statusCode}`);
      assert.equal(called, false, 'le service ne doit pas etre appele sur un compte verrouille');
      assert.equal(attempts.length, 0);
    } finally {
      authService.authenticateUser = originalAuthenticate;
    }
  });

  if (failures.length) {
    console.error(`\nECHEC : ${failures.length} test(s) en echec.`);
    process.exitCode = 1;
  } else {
    console.log(`\nOK : ${passed} tests passes, 0 echecs.`);
  }
})();
