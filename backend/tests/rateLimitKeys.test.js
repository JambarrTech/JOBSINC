// Tests du keyGenerator de rate limiting.
//
// Les quotas étaient keyés par IP alors que les commentaires annonçaient
// « par userId » : derrière un même proxy/NAT, tous les recruteurs d'une
// entreprise partageaient un seau de 200/min. Ces tests verrouillent le
// comportement correct : identité = utilisateur authentifié, repli sur l'IP.
//
// Exécution : `node tests/rateLimitKeys.test.js`.

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-de-rate-limit-1234567890';

// On intercepte la construction des limiters pour récupérer chaque
// keyGenerator, sans démarrer de serveur ni de base.
const captured = [];
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'express-rate-limit') {
    return {
      default: (options) => {
        if (options && options.keyGenerator) captured.push(options.keyGenerator);
        return () => {};
      },
      // Reproduit le comportement de la vraie lib (IP brute ou hash réseau).
      ipKeyGenerator: (ip) => String(ip),
    };
  }
  return originalLoad(request, parent, isMain);
};

require('../src/middlewares/rateLimit');
Module._load = originalLoad;

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });

const reqFor = ({ ip, token }) => ({
  ip: ip || '10.0.0.1',
  headers: token ? { authorization: 'Bearer ' + token } : {},
});

// La clé produite par identify() commence par le scope de l'application
// (auth:, cand:, rec:…). On indexe les keyGenerator par ce scope pour que le
// test reste indépendant de l'ordre de déclaration des limiters.
const SAMPLE = reqFor({ token: sign({ userId: 'probe' }), ip: '10.0.0.9' });
const byScope = new Map();
for (const keyGenerator of captured) {
  byScope.set(keyGenerator(SAMPLE, {}).split(':')[0], keyGenerator);
}

const keyFor = (scope) => {
  const keyGenerator = byScope.get(scope);
  assert.ok(
    keyGenerator,
    'scope ' + scope + ' introuvable (capturés : ' + Array.from(byScope.keys()).join(', ') + ')',
  );
  return keyGenerator;
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL ' + name);
    console.error('       ' + error.message);
  }
}

const SCOPES = ['auth', 'sensitive', 'public', 'cand', 'rec', 'adm', 'msg'];

console.log('-- Isolation des quotas par application --');

test('chaque application a son propre prefixe de cle', () => {
  for (const scope of SCOPES) {
    const key = keyFor(scope)(reqFor({ token: sign({ userId: 'u1' }) }), {});
    assert.ok(key.indexOf(scope + ':') === 0, 'scope ' + scope + ' -> cle ' + key);
  }
  const keys = SCOPES.map((scope) => keyFor(scope)(reqFor({ token: sign({ userId: 'u1' }) }), {}));
  assert.equal(new Set(keys).size, keys.length, 'cles dupliquees : ' + keys.join(', '));
});

test('le meme utilisateur a la meme cle sur deux appels', () => {
  const recruiterKey = keyFor('rec');
  const token = sign({ userId: 'u1', role: 'RECRUITER' });
  const a = recruiterKey(reqFor({ token, ip: '10.0.0.1' }), {});
  const b = recruiterKey(reqFor({ token, ip: '10.0.0.2' }), {});
  assert.equal(a, b);
});

test('deux utilisateurs distincts ont des cles distinctes', () => {
  const recruiterKey = keyFor('rec');
  const a = recruiterKey(reqFor({ token: sign({ userId: 'alice' }), ip: '10.0.0.1' }), {});
  const b = recruiterKey(reqFor({ token: sign({ userId: 'bob' }), ip: '10.0.0.1' }), {});
  assert.notEqual(a, b);
});

console.log('-- Deux utilisateurs derriere la meme IP --');

test('meme IP mais tokens differents => quotas separes', () => {
  // C'est precisement le defaut corrige : avant, ces trois requetes
  // partageaient un seul seau de 200/min.
  const candidateKey = keyFor('cand');
  const ip = '203.0.113.7';
  const a = candidateKey(reqFor({ token: sign({ userId: 'a' }), ip }), {});
  const b = candidateKey(reqFor({ token: sign({ userId: 'b' }), ip }), {});
  const c = candidateKey(reqFor({ token: sign({ userId: 'c' }), ip }), {});
  assert.equal(new Set([a, b, c]).size, 3);
});

test('un utilisateur derriere plusieurs IP partage bien son quota', () => {
  // Garde-fou : le quota doit suivre la personne, pas le reseau.
  const candidateKey = keyFor('cand');
  const token = sign({ userId: 'alice' });
  const keys = ['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((ip) =>
    candidateKey(reqFor({ token, ip }), {}),
  );
  assert.equal(new Set(keys).size, 1);
});

console.log('-- Repli sur IP et robustesse --');

test('requete non authentifiee => cle par IP', () => {
  const authKey = keyFor('auth');
  const a = authKey(reqFor({ ip: '10.1.1.1' }), {});
  const b = authKey(reqFor({ ip: '10.1.1.2' }), {});
  assert.notEqual(a, b, 'deux IP anonymes doivent avoir deux quotas');
  assert.ok(a.indexOf('auth:ip:') === 0, 'prefixe inattendu : ' + a);
});

test('token invalide => repli sur IP (pas de crash, pas de bucket forge)', () => {
  const recruiterKey = keyFor('rec');
  const key = recruiterKey(reqFor({ token: 'not-a-jwt', ip: '10.2.2.2' }), {});
  assert.ok(key.indexOf('rec:ip:') === 0, 'attendu un repli IP, obtenu : ' + key);
});

test('token signe avec la mauvaise cle => repli sur IP', () => {
  const adminKey = keyFor('adm');
  const bad = jwt.sign({ userId: 'mallory' }, 'mauvaise-cle-1234567890', { algorithm: 'HS256' });
  const key = adminKey(reqFor({ token: bad, ip: '10.3.3.3' }), {});
  assert.ok(
    key.indexOf('adm:ip:') === 0,
    'un JWT non verifie ne doit pas pouvoir creer de bucket : ' + key,
  );
});

test('token sans userId => repli sur IP', () => {
  const messageKey = keyFor('msg');
  const token = jwt.sign({ sub: 'xyz' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const key = messageKey(reqFor({ token, ip: '10.4.4.4' }), {});
  assert.ok(key.indexOf('msg:ip:') === 0, 'obtenu : ' + key);
});

test('Authorization sans prefixe Bearer => repli sur IP', () => {
  const publicKey = keyFor('public');
  const token = sign({ userId: 'alice' });
  const key = publicKey({ ip: '10.5.5.5', headers: { authorization: token } }, {});
  assert.ok(key.indexOf('public:ip:') === 0, 'obtenu : ' + key);
});

test('la cle ne contient que l identifiant de compte, pas de PII', () => {
  const recruiterKey = keyFor('rec');
  const key = recruiterKey(reqFor({ token: sign({ userId: 'user-123' }) }), {});
  assert.ok(key.indexOf('@') === -1, 'aucun email dans la cle');
  assert.equal(key, 'rec:u:user-123');
});

console.log('');
if (failed > 0) {
  console.error('ECHEC : ' + passed + ' passes, ' + failed + ' echoues.');
  process.exit(1);
}
console.log('OK : ' + passed + ' tests passes.');
