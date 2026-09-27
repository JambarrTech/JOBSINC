// Non-regression : l'echantillonnage temporel du login ne doit pas reveler
// quels e-mails sont inscrits.
//
// Regression — `authenticateUser` evaluait `!user || !(await verifyPassword(...))`.
//   Le `||` court-circuitait : quand l'e-mail n'existait pas, AUCUN hachage
//   bcrypt n'etait calcule. Le temps de reponse distinguait alors
//   « e-mail inconnu » (~100 ms avec bcryptjs) de « e-mail connu, mauvais mot
//   de passe » (~600 ms). C'est une oracle d'enumeration de comptes
//   exploitable SANS authentification : il suffit de chronometrer des
//   connexions pour constituer la liste des comptes de la plateforme.
//
// Le correctif compare toujours (contre un hachage factice de cout 12 quand le
// compte est absent), et refuse de démarrer si ce hachage factice n'est pas
// reellement en cout 12 — sans quoi l'oracle renaîtrait, plus lentement.

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

const PASSWORD = 'un-mot-de-passe-assez-long';

/** Charge authService avec une base factice. */
function loadAuthService({ user }) {
  const target = require.resolve('../src/services/authService');
  const original = Module._load;
  Module._load = function patched(request) {
    if (request === '../config/prisma') {
      return {
        user: {
          findUnique: async () => user,
        },
        emailVerification: { create: async () => ({}), findFirst: async () => null, update: async () => ({}) },
        refreshToken: { deleteMany: async () => ({ count: 0 }), create: async () => ({}) },
        userPasswordReset: {},
        passwordReset: { create: async () => ({}), findFirst: async () => null, update: async () => ({}) },
        candidateProfile: { create: async () => ({}) },
        company: { create: async () => ({}) },
        notification: { createMany: async () => ({ count: 0 }) },
      };
    }
    return original.apply(this, arguments);
  };
  try {
    delete require.cache[target];
    return require('../src/services/authService');
  } finally {
    Module._load = original;
    delete require.cache[target];
  }
}

const existingUser = {
  id: 'u1',
  email: 'existe@jobsinc.test',
  role: 'CANDIDATE',
  tokenVersion: 0,
  candidate: { id: 'p1' },
  company: null,
  // bcryptjs hash du mot de passe « le-bon », cout 12.
  passwordHash: null,
};

(async () => {
  console.log('-- Login : pas d\'oracle d\'enumeration de comptes --');

  // On construit un utilisateur reel pour mesurer le cout des deux branches.
  const bcrypt = require('bcryptjs');
  const realHash = await bcrypt.hash('le-bon', 12);
  const user = { ...existingUser, passwordHash: realHash };

  await test('e-mail inconnu : AuthenticationError (message indistinct)', async () => {
    const svc = loadAuthService({ user: null });
    await assert.rejects(
      () => svc.authenticateUser('inconnu@jobsinc.test', PASSWORD),
      (error) => {
        assert.equal(error.name, 'AuthenticationError');
        assert.equal(error.message, 'Identifiants invalides.');
        return true;
      },
    );
  });

  await test('e-mail connu + mauvais mot de passe : message IDENTIQUE', async () => {
    const svc = loadAuthService({ user });
    await assert.rejects(
      () => svc.authenticateUser(user.email, 'mauvais'),
      (error) => {
        assert.equal(error.name, 'AuthenticationError');
        assert.equal(error.message, 'Identifiants invalides.');
        return true;
      },
    );
  });

  await test('le hachage factice est bien de cout 12', async () => {
    const svc = loadAuthService({ user: null });
    // `authenticateUser` sur un e-mail inconnu doit quand meme hacher.
    const t0 = process.hrtime.bigint();
    await svc.authenticateUser('inconnu@jobsinc.test', PASSWORD).catch(() => {});
    const unknownMs = Number(process.hrtime.bigint() - t0) / 1e6;

    const svc2 = loadAuthService({ user });
    const t1 = process.hrtime.bigint();
    await svc2.authenticateUser(user.email, 'mauvais').catch(() => {});
    const knownMs = Number(process.hrtime.bigint() - t1) / 1e6;

    const ratio = knownMs / unknownMs;
    console.log(
      `       (inconnu ${unknownMs.toFixed(0)} ms / connu ${knownMs.toFixed(0)} ms — ratio ${ratio.toFixed(2)})`,
    );
    // Sans hachage factice, l'e-mail inconnu serait ~10x plus rapide.
    assert.ok(
      unknownMs > knownMs * 0.5,
      `la branche « e-mail inconnu » ne paie pas le hachage : ${unknownMs.toFixed(0)} ms vs ${knownMs.toFixed(0)} ms`,
    );
  });

  await test('un role non autorise est refuse APRES verification du mot de passe', async () => {
    const svc = loadAuthService({ user: { ...user, role: 'ADMIN' } });
    await assert.rejects(
      () => svc.authenticateUser(user.email, 'le-bon', ['CANDIDATE']),
      (error) => {
        assert.equal(error.message, 'Type de compte non autorisé pour cette connexion.');
        return true;
      },
    );
  });

  await test('le bon mot de passe passe', async () => {
    const svc = loadAuthService({ user });
    const authenticated = await svc.authenticateUser(user.email, 'le-bon');
    assert.equal(authenticated.id, 'u1');
  });

  await test('le hachage factice est rejete s il n est pas en cout 12', () => {
    // On verifie la presence de la garde et du motif exact qu elle impose.
    const source = require('node:fs').readFileSync(
      require.resolve('../src/services/authService'),
      'utf8',
    );
    assert.match(source, /assertDummyHashIsCost12/, 'la garde doit exister');
    // Motif present dans la source : cout 12 exige pour bcrypt.
    assert.ok(
      source.includes('12$'),
      "la garde doit verifier le prefixe de cout 12",
    );
    const declared = source.match(/DUMMY_HASH = '([^']+)'/);
    assert.ok(declared, 'DUMMY_HASH doit etre declare');
    assert.match(
      declared[1],
      /^\$2[aby]\$12\$/,
      `DUMMY_HASH doit etre un cout 12, obtenu : ${declared[1].slice(0, 7)}`,
    );
  });

  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passes, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
