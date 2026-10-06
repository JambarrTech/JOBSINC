// Non-régression : autorisation de LECTURE des fichiers protégés.
//
// Régression 1 — `identify()` ignorait les cookies.
//   Le client web ne répercute JAMAIS son jeton dans un en-tête
//   `Authorization` : il s'authentifie par cookie HttpOnly posé par le backend.
//   En n'inspectant que l'en-tête, TOUTE session navigateur retombait sur la
//   clé IP — c'est-à-dire le défaut exact que le fichier prétendait corriger.
//   Derrière le proxy Render, un bureau entier partageait un seau et un
//   utilisateur pouvait saturer le quota de tous les autres.
//
// Régression 2 — `authorizeStoredFile` n'exigeait que « une session valide ».
//   N'importe quel candidat authentifié pouvait donc télécharger le CV d'un
//   autre candidat. Modèle retenu : propriétaire, ADMIN, ou recruteur
//   disposant d'une candidature sur ce profil — et rien d'autre.
//
// Aucun accès base ni réseau : `prisma` est remplacé par un stub via
// `Module._load`, comme dans `rateLimitKeys.test.js`.

const assert = require('node:assert/strict');
const Module = require('node:module');
const jwt = require('jsonwebtoken');

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

/** Exécute `fn` avec `prisma` remplacé par `stub`. */
function withPrisma(stub, fn) {
  const original = Module._load;
  const target = require.resolve('../src/middlewares/uploadAuth');
  Module._load = function patched(request) {
    if (request === '../config/prisma') return stub;
    return original.apply(this, arguments);
  };
  // `uploadAuth` capture `prisma` au chargement du module : il faut le
  // recharger pour que le stub soit pris en compte.
  delete require.cache[target];
  try {
    return fn(require('../src/middlewares/uploadAuth'));
  } finally {
    delete require.cache[target];
    Module._load = original;
  }
}

// ===========================================================================
// 1. identify() — le cookie doit compter comme une identité
// ===========================================================================

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-identite-cookie';

function loadKeyGenerator() {
  const captured = {};
  const original = Module._load;
  Module._load = function patched(request) {
    if (request === 'express-rate-limit') {
      const real = original.apply(this, arguments);
      return {
        default: (options) => {
          if (options && options.keyGenerator) captured.gen = options.keyGenerator;
          return { middleware: () => (req, res, next) => next() };
        },
        ipKeyGenerator: real.ipKeyGenerator,
      };
    }
    return original.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../src/middlewares/rateLimit')];
    require('../src/middlewares/rateLimit');
  } finally {
    Module._load = original;
  }
  if (!captured.gen) throw new Error("keyGenerator non capturé : le limiteur n'a pas été construit");
  return captured.gen;
}

const keyGen = loadKeyGenerator();
const IP = '10.0.0.9';
const req = (extra) => ({ ip: IP, headers: {}, ...extra });

const cookieToken = jwt.sign(
  { userId: 'user-cookie-1', id: 'user-cookie-1', role: 'RECRUITER', tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: '15m' },
);
const bearerToken = jwt.sign(
  { userId: 'user-bearer-1', id: 'user-bearer-1', role: 'CANDIDATE', tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: '15m' },
);

async function runIdentifyTests() {
  console.log('-- identify() : le cookie compte comme une identité --');

  await test('cookie jobsinc_token => clé par utilisateur, pas par IP', () => {
    const key = keyGen(req({ cookies: { jobsinc_token: cookieToken } }), {});
    assert.equal(key, 'uploads:u:user-cookie-1');
  });

  await test('alias accessToken également reconnu', () => {
    const key = keyGen(req({ cookies: { accessToken: cookieToken } }), {});
    assert.equal(key, 'uploads:u:user-cookie-1');
  });

  await test('alias token (legacy) également reconnu', () => {
    const key = keyGen(req({ cookies: { token: cookieToken } }), {});
    assert.equal(key, 'uploads:u:user-cookie-1');
  });

  await test('cookie invalide => repli sur IP (pas de bucket forgé)', () => {
    const key = keyGen(req({ cookies: { jobsinc_token: 'pas-un-jwt' } }), {});
    assert.match(key, /^uploads:ip:/);
  });

  await test('cookie signé avec la mauvaise clé => repli sur IP', () => {
    const foreign = jwt.sign({ userId: 'x' }, 'autre-secret', { expiresIn: '15m' });
    const key = keyGen(req({ cookies: { jobsinc_token: foreign } }), {});
    assert.match(key, /^uploads:ip:/);
  });

  await test('en-tête Bearer toujours pris en compte', () => {
    const key = keyGen(req({ headers: { authorization: `Bearer ${bearerToken}` } }), {});
    assert.equal(key, 'uploads:u:user-bearer-1');
  });

  await test('cookie et Bearer de deux utilisateurs => deux seaux distincts', () => {
    const a = keyGen(req({ cookies: { jobsinc_token: cookieToken } }), {});
    const b = keyGen(req({ headers: { authorization: `Bearer ${bearerToken}` } }), {});
    assert.notEqual(a, b);
  });

  await test('utilisateur cookie-authentifié ne partage pas le seau IP', () => {
    const cookieKey = keyGen(req({ cookies: { jobsinc_token: cookieToken } }), {});
    const anonKey = keyGen(req({}), {});
    assert.notEqual(cookieKey, anonKey);
  });

  await test('deux requêtes anonymes derrière la même IP partagent la clé', () => {
    const a = keyGen(req({}), {});
    const b = keyGen(req({}), {});
    assert.equal(a, b);
    assert.match(a, /^uploads:ip:/);
  });

  await test('req.cookies absent ne lève pas', () => {
    const key = keyGen(req({ headers: {} }), {});
    assert.match(key, /^uploads:ip:/);
  });

  await test('la clé ne contient ni le jeton, ni de PII', () => {
    const key = keyGen(req({ cookies: { jobsinc_token: cookieToken } }), {});
    assert.ok(!key.includes(cookieToken));
    assert.ok(!key.includes('.'));
  });
}

// ===========================================================================
// 2. authorizeStoredFile — qui a le droit de lire un CV / un avatar
// ===========================================================================

// `authorizeStoredFile` et `storedPathFromRequest` sont rechargés à chaque
// appel via `withPrisma` (voir ci-dessus) : seul le chemin, purement
// fonctionnel, est importé une fois.
const { storedPathFromRequest } = withPrisma(prismaStub({}), (mod) => mod);

const CV = '/uploads/cvs/11111111-2222-3333-4444-555555555555.pdf';
const AVATAR = '/uploads/candidates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const OWNER = 'user-owner';
const RECRUITER = 'user-recruiter';

function valueMatches(wanted, profile) {
  if (!wanted || !profile) return false;
  if (typeof wanted === 'string') {
    return profile.cvUrl === wanted || profile.avatarUrl === wanted;
  }
  // Repli nom de fichier (`{ endsWith: '/<fichier>' }`) des données historiques.
  if (typeof wanted === 'object' && typeof wanted.endsWith === 'string') {
    const suffix = wanted.endsWith;
    return (typeof profile.cvUrl === 'string' && profile.cvUrl.endsWith(suffix)) ||
      (typeof profile.avatarUrl === 'string' && profile.avatarUrl.endsWith(suffix));
  }
  return false;
}

function prismaStub({ profile = null, application = null, recruiterReaches = true } = {}) {
  return {
    candidateProfile: {
      findFirst: async ({ where }) => {
        const wanted = where.cvUrl || where.avatarUrl;
        if (!valueMatches(wanted, profile)) return null;
        return profile;
      },
    },
    application: {
      findFirst: async ({ where }) => {
        if (where.cvUrl) {
          return application && application.cvUrl === where.cvUrl ? application : null;
        }
        if (where.candidateProfileId) {
          return recruiterReaches ? { id: 'app-1' } : null;
        }
        return null;
      },
    },
  };
}

const decide = (user, path, stub) =>
  withPrisma(stub, (mod) => mod.authorizeStoredFile(user, path));

const ownerProfile = (url) => ({
  id: 'p1',
  userId: OWNER,
  ...(url === CV ? { cvUrl: url } : { avatarUrl: url }),
});

async function runUploadAuthTests() {
  console.log('-- authorizeStoredFile : autorisation de lecture des CV --');

  await test('propriétaire : autorisé', async () => {
    const d = await decide({ userId: OWNER, role: 'CANDIDATE' }, CV, prismaStub({ profile: ownerProfile(CV) }));
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'PROPRIETAIRE');
  });

  await test('candidat tiers : refusé (fuite de PII inter-candidats)', async () => {
    const d = await decide({ userId: 'user-other', role: 'CANDIDATE' }, CV, prismaStub({ profile: ownerProfile(CV) }));
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'PAS_PROPRIETAIRE');
  });

  await test('employé tiers : refusé', async () => {
    const d = await decide({ userId: 'user-emp', role: 'EMPLOYEE' }, CV, prismaStub({ profile: ownerProfile(CV) }));
    assert.equal(d.allowed, false);
  });

  await test('recruteur AVEC candidature : autorisé', async () => {
    const d = await decide({ userId: RECRUITER, role: 'RECRUITER' }, CV,
      prismaStub({ profile: ownerProfile(CV), recruiterReaches: true }));
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'RECRUITER_CANDIDATURE');
  });

  await test('recruteur SANS candidature : refusé (URL devinée ne suffit pas)', async () => {
    const d = await decide({ userId: 'stranger', role: 'RECRUITER' }, CV,
      prismaStub({ profile: ownerProfile(CV), recruiterReaches: false }));
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'RECRUITER_SANS_CANDIDATURE');
  });

  await test('ADMIN : autorisé sans condition', async () => {
    const d = await decide({ userId: 'admin', role: 'ADMIN' }, CV,
      prismaStub({ profile: ownerProfile(CV), recruiterReaches: false }));
    assert.equal(d.allowed, true);
  });

  await test('CV référencé par une candidature mais absent du profil', async () => {
    const stub = prismaStub({
      profile: null,
      application: { id: 'app-9', cvUrl: CV, candidateProfileId: 'p9' },
      recruiterReaches: true,
    });
    const d = await decide({ userId: RECRUITER, role: 'RECRUITER' }, CV, stub);
    assert.equal(d.allowed, true);
  });

  await test('fichier inconnu : refusé par défaut', async () => {
    const d = await decide({ userId: 'user-x', role: 'RECRUITER' }, CV, prismaStub({}));
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'FICHIER_INCONNU');
  });

  await test('avatar : propriétaire autorisé', async () => {
    const d = await decide({ userId: OWNER, role: 'CANDIDATE' }, AVATAR, prismaStub({ profile: ownerProfile(AVATAR) }));
    assert.equal(d.allowed, true);
  });

  await test('avatar : recruteur autorisé (listes de candidats)', async () => {
    const d = await decide({ userId: RECRUITER, role: 'RECRUITER' }, AVATAR, prismaStub({ profile: ownerProfile(AVATAR) }));
    assert.equal(d.allowed, true);
  });

  await test('avatar : recruteur SANS candidature autorisé (photo non sensible)', async () => {
    const d = await decide({ userId: 'stranger', role: 'RECRUITER' }, AVATAR,
      prismaStub({ profile: ownerProfile(AVATAR), recruiterReaches: false }));
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'AVATAR_AUTHENTIFIE');
  });

  await test('avatar : autre candidat autorisé (photo non sensible)', async () => {
    const d = await decide({ userId: 'user-other', role: 'CANDIDATE' }, AVATAR, prismaStub({ profile: ownerProfile(AVATAR) }));
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'AVATAR_AUTHENTIFIE');
  });

  await test('avatar : valeur historique absolue retrouvée par nom de fichier', async () => {
    const legacy = { id: 'p1', userId: OWNER, avatarUrl: 'http://localhost:5000/uploads/candidates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg' };
    const d = await decide({ userId: 'user-other', role: 'CANDIDATE' }, AVATAR, prismaStub({ profile: legacy }));
    assert.equal(d.allowed, true);
  });

  await test('CV : autre candidat TOUJOURS refusé (PII sensible)', async () => {
    const d = await decide({ userId: 'user-other', role: 'CANDIDATE' }, CV, prismaStub({ profile: ownerProfile(CV) }));
    assert.equal(d.allowed, false);
  });

  await test('prefixe non protégé refusé même pour un ADMIN', async () => {
    const d = await decide({ userId: 'admin', role: 'ADMIN' }, '/uploads/companies/logo.png', prismaStub({}));
    assert.equal(d.allowed, false);
  });

  await test('chemin de traversal rejete', () => {
    assert.equal(storedPathFromRequest({ path: '/cvs/../../etc/passwd' }), null);
    assert.equal(storedPathFromRequest({ path: '/cvs/a\\b' }), null);
  });

  await test('chemin nominal accepte (driver local : relatif au montage)', () => {
    assert.equal(storedPathFromRequest({ path: '/cvs/ok.pdf' }), '/uploads/cvs/ok.pdf');
    assert.equal(storedPathFromRequest({ path: 'cvs/ok.pdf' }), '/uploads/cvs/ok.pdf');
  });

  // Driver S3 : la route est declaree en absolu, `req.path` garde `/uploads`.
  // Sans normalisation, le chemin compare en base aurait ete
  // `/uploads/uploads/cvs/...` : aucune correspondance, donc refus systematique
  // — y compris pour le proprietaire legitime.
  await test('chemin absolu du driver S3 normalise identiquement', () => {
    assert.equal(storedPathFromRequest({ path: '/uploads/cvs/ok.pdf' }), '/uploads/cvs/ok.pdf');
    assert.equal(
      storedPathFromRequest({ path: '/uploads/cvs/ok.pdf' }),
      storedPathFromRequest({ path: '/cvs/ok.pdf' }),
      'les deux drivers doivent produire le meme chemin applicatif',
    );
  });

  await test('chemin S3 de traversee rejete', () => {
    assert.equal(storedPathFromRequest({ path: '/uploads/cvs/../../etc/passwd' }), null);
  });
}

(async () => {
  await runIdentifyTests();
  await runUploadAuthTests();
  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passés, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
