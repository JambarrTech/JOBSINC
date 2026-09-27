// Non-regression : le graphe Express doit se CONSTRUIRE, et repondre.
//
// Regression — `app.get('/uploads/*')` etait invalide sous Express 5.
//   Express 5 embarque path-to-regexp v8, qui refuse un `*` anonyme et exige
//   un parametre nomme. La route levait donc un `PathError: Missing parameter
//   name` AU CHARGEMENT DU MODULE, dans la seule branche `STORAGE_DRIVER=s3`
//   — la configuration declaree OBLIGATOIRE en production Vercel. Aucun test
//   ne le voyait : le E2E tournait en `local` (branche jamais atteinte) et
//   `npm test` ne chargeait aucun des 4 fichiers de test absents du script.
//
// Ce test monte le graphe complet dans les DEUX modes de stockage, puis
// interroge `/health` sur une vraie socket. C'est donc un test de fumee du
// serveur, pas seulement de la route S3.

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
 * Charge `src/app.js` avec l'environnement donne. `require` et les
 * sous-modules sont purges pour qu'un mode de stockage ne puisse pas masquer
 * l'autre.
 */
function loadApp({ storageDriver }) {
  const previous = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    JWT_SECRET: process.env.JWT_SECRET,
    VERCEL: process.env.VERCEL,
  };
  if (storageDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = storageDriver;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-graphe';
  delete process.env.VERCEL;

  const target = require.resolve('../src/app');
  delete require.cache[target];

  // `firebase-admin` n'est pas utilise au chargement : on le neutralise pour
  // eviter de charger le SDK complet en test.
  const originalLoad = Module._load;
  Module._load = function patched(request) {
    if (typeof request === 'string' && request.startsWith('firebase-admin')) {
      return new Proxy({}, { get: () => () => ({}) });
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return require('../src/app');
  } finally {
    Module._load = originalLoad;
    delete require.cache[target];
    if (previous.STORAGE_DRIVER === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = previous.STORAGE_DRIVER;
    if (previous.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.JWT_SECRET;
    if (previous.VERCEL !== undefined) process.env.VERCEL = previous.VERCEL;
  }
}

/** Monte l'app, appelle `path`, puis referme le serveur. */
async function withServer(app, path, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}${path}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * `/health` interroge la base. Enchainement de fichiers de test, le pool
 * Prisma peut etre sature par les tests precedents : le endpoint repond
 * alors 503 « degrade » — ce qui PROUVE au contraire que la route est montee
 * et que le gestionnaire s'execute. Seuls 404/500 seraient anormaux.
 */
async function expectHealthReachable(url) {
  const response = await fetch(url);
  assert.ok(
    response.status === 200 || response.status === 503,
    `/health doit repondre 200 (ou 503 si base indisponible), obtenu ${response.status}`,
  );
  const body = await response.json();
  assert.equal(typeof body.status, 'string', 'le corps doit decrire un etat');
  return response.status;
}

(async () => {
  console.log('-- Graphe Express : construction et reponse dans les deux modes --');

  await test('STORAGE_DRIVER=local : le graphe se construit', () => {
    const app = loadApp({ storageDriver: 'local' });
    assert.equal(typeof app, 'function', 'app.js doit exporter une application Express');
  });

  await test('STORAGE_DRIVER=local : /health est joignable', async () => {
    const app = loadApp({ storageDriver: 'local' });
    await withServer(app, '/health', expectHealthReachable);
  });

  // C'est ce test qui detecte le `PathError` sur `/uploads/*`.
  await test('STORAGE_DRIVER=s3 : le graphe se construit (regression /uploads/*)', () => {
    const app = loadApp({ storageDriver: 's3' });
    assert.equal(typeof app, 'function');
  });

  await test('STORAGE_DRIVER=s3 : /health est joignable', async () => {
    const app = loadApp({ storageDriver: 's3' });
    await withServer(app, '/health', expectHealthReachable);
  });

  await test('STORAGE_DRIVER=s3 : /uploads/cvs/anon est refuse (401)', async () => {
    const app = loadApp({ storageDriver: 's3' });
    await withServer(app, '/uploads/cvs/inexistant.pdf', async (url) => {
      const response = await fetch(url);
      // 401 : la protection `/uploads/cvs` exige une session, meme en S3.
      // Avant correction, `{*splat}` renvoyait un TABLEAU de segments :
      // `/cvs/a.pdf` devenait `/cvs,a.pdf`, le préfixe protégé n'était plus
      // reconnu, et le fichier était streamé sans AUCUNE vérification.
      assert.equal(response.status, 401, `statut inattendu : ${response.status}`);
    });
  });

  await test('STORAGE_DRIVER=s3 : /uploads/candidates/anon est refuse (401)', async () => {
    const app = loadApp({ storageDriver: 's3' });
    await withServer(app, '/uploads/candidates/inexistant.jpg', async (url) => {
      const response = await fetch(url);
      assert.equal(response.status, 401, `statut inattendu : ${response.status}`);
    });
  });

  await test('aucun STORAGE_DRIVER : le defaut local se construit', () => {
    const app = loadApp({ storageDriver: undefined });
    assert.equal(typeof app, 'function');
  });

  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passes, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
