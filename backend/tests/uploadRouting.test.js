// Non-regression : le routage d'autorisation des fichiers uploades.
//
// Deux pièges distincts ont rendu l'autorisation des CV inopérante en mode S3
// (la configuration déclarée OBLIGATOIRE en production Vercel) :
//
//  1. La route `app.get('/uploads/*')` est invalide sous Express 5
//     (path-to-regexp v8 exige un paramètre nommé) et levait un `PathError`
//     AU CHARGEMENT DU MODULE. Le process ne démarrait pas.
//
//  2. Une fois la route corrigée en `/uploads/{*splat}`, deux pièges
//     restaient, tous deux dans le même sens — l'autorisation sautée :
//       a) `req.path` vaut `/uploads/cvs/x.pdf` sur une route déclarée en
//          absolu, alors que le test portait sur `/cvs/…` : jamais vrai.
//       b) `{*splat}` est un paramètre RÉPÉTÉ : path-to-regexp renvoie un
//          TABLEAU (`['cvs','a.pdf']`). Interpolé, il donnait `/cvs,a.pdf`,
//          qui ne correspond plus à `/cvs/`.
//
// Résultat : le fichier était streamé sans aucune vérification, et l'appel
// recevait 502 (credentials AWS absents) au lieu de 401.
//
// Ces tests vérifient la décision de routage elle-même, par HTTP, sans base
// ni AWS : un fichier protégé doit répondre 401, un fichier public ne doit pas
// l'être.

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

function loadApp({ storageDriver }) {
  const previous = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    JWT_SECRET: process.env.JWT_SECRET,
    VERCEL: process.env.VERCEL,
  };
  if (storageDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = storageDriver;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-uploads';
  delete process.env.VERCEL;

  const target = require.resolve('../src/app');
  delete require.cache[target];
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

const statusOf = async (url) => (await fetch(url)).status;

// Toute autre valeur — en particulier 200 ou 502 — signifie que le fichier a
// été servi ou mis en lecture AVANT que l'autorisation ne tranche.
const PROTECTED_STATUSES = [401, 403, 404];

(async () => {
  console.log('-- Routage des fichiers proteges : la protection joue-t-elle ? --');

  const app = loadApp({ storageDriver: 's3' });

  await test('S3 : /uploads/cvs/... est protege', async () => {
    const status = await withServer(app, '/uploads/cvs/secret.pdf', statusOf);
    assert.ok(
      PROTECTED_STATUSES.includes(status),
      `/uploads/cvs/secret.pdf a repondu ${status} — la protection n'a pas joue`,
    );
    assert.notEqual(status, 200, 'un CV ne doit jamais etre servi sans session');
  });

  await test('S3 : /uploads/candidates/... est protege', async () => {
    const status = await withServer(app, '/uploads/candidates/photo.jpg', statusOf);
    assert.ok(
      PROTECTED_STATUSES.includes(status),
      `/uploads/candidates/photo.jpg a repondu ${status} — la protection n'a pas joue`,
    );
  });

  await test('S3 : chemin imbrique sous /uploads/cvs/ reste protege', async () => {
    // Le piège (a) ne se voyait qu'avec un préfixe exact ; on vérifie aussi
    // que le filtrage ne dépend pas du nombre de segments.
    const status = await withServer(app, '/uploads/cvs/sous/dossier/secret.pdf', statusOf);
    assert.ok(
      PROTECTED_STATUSES.includes(status),
      `chemin imbrique a repondu ${status}`,
    );
  });

  await test('S3 : /uploads/companies/... n est PAS protege (logos publics)', async () => {
    const status = await withServer(app, '/uploads/companies/logo.png', statusOf);
    // 502 = tentative de lecture S3 réelle (credentials absents en test), donc
    // la demande a bien atteint le lecteur : elle n'a PAS été rejetée par
    // l'authentification, ce qui est le comportement voulu.
    assert.ok(
      status === 502 || status === 404,
      `/uploads/companies/logo.png a repondu ${status} — un logo public ne doit pas exiger de session`,
    );
    assert.notEqual(status, 401, 'les logos doivent rester publiquement lisibles');
    assert.notEqual(status, 403, 'les logos doivent rester publiquement lisibles');
  });

  await test('local : /uploads/cvs/... est protege', async () => {
    const localApp = loadApp({ storageDriver: 'local' });
    const status = await withServer(localApp, '/uploads/cvs/secret.pdf', statusOf);
    assert.equal(status, 401, `/uploads/cvs/secret.pdf a repondu ${status}`);
  });

  await test('local : /uploads/companies/... n est PAS protege', async () => {
    const localApp = loadApp({ storageDriver: 'local' });
    const status = await withServer(localApp, '/uploads/companies/absent.png', statusOf);
    // 404 = le lecteur statique a été atteint et n'a pas trouvé le fichier.
    assert.equal(status, 404, `attendu 404 (fichier absent, public), obtenu ${status}`);
  });

  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passes, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
