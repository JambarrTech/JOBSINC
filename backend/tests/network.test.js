// Test réseau candidats : validation/sérialisation pures + montage route.
// Sans base (fonctions pures + graphe Express), sur le modèle de appGraph.test.js.

const assert = require('node:assert/strict');

const service = require('../src/services/networkService');

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

(async () => {
  console.log('-- Réseau candidats --');

  await test('validatePost refuse le vide et le trop long', () => {
    assert.equal(service.validatePost({ content: '  ' }).error, 'Le contenu est requis.');
    assert.ok(service.validatePost({ content: 'x'.repeat(2001) }).error);
    assert.equal(service.validatePost({ content: ' hello ' }).text, 'hello');
  });

  await test('validateComment plafonne à 500', () => {
    assert.ok(service.validateComment({ content: 'x'.repeat(501) }).error);
    assert.equal(service.validateComment({ content: 'ok' }).text, 'ok');
  });

  await test('canPublish : candidats/employés oui, recruteur non', () => {
    assert.equal(service.canPublish('CANDIDATE'), true);
    assert.equal(service.canPublish('EMPLOYEE'), true);
    assert.equal(service.canPublish('RECRUITER'), false);
  });

  await test('serializePost calcule compteurs + likedByMe', () => {
    const post = {
      id: 'p1', content: 'salut', imageUrl: null,
      createdAt: new Date(), updatedAt: new Date(),
      author: { id: 'u1', email: 'a@x.fr', candidate: { firstName: 'Awa', lastName: 'Diallo', avatarUrl: null } },
      likes: [{ userId: 'me' }],
      _count: { likes: 1, comments: 2 },
    };
    const out = service.serializePost(post, 'me');
    assert.equal(out.author.name, 'Awa Diallo');
    assert.equal(out.likedByMe, true);
    assert.equal(out.likesCount, 1);
    assert.equal(out.commentsCount, 2);
    assert.equal(service.serializePost(post, 'autre').likedByMe, false);
  });

  await test('serializeCandidate ne fuit pas d\'email quand le nom existe', () => {
    const out = service.serializeCandidate(
      { id: 'u2', email: 'secret@x.fr', candidate: { firstName: 'Ibra', lastName: ' Sow ', city: 'Dakar' } },
      'me',
      new Set(['u2']),
    );
    assert.equal(out.name, 'Ibra Sow');
    assert.equal(out.isFollowing, true);
    assert.equal(out.isSelf, false);
  });

  await test('routes réseau montées sur /api/network', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-reseau';
    const app = require('../src/app');
    assert.equal(typeof app, 'function', 'app.js doit exporter une application Express');
    const router = require('../src/routes/networkRoutes');
    const paths = (router.stack || [])
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods).join(',').toUpperCase()} ${l.route.path}`);
    for (const expected of [
      'GET /feed',
      'POST /posts',
      'POST /posts/:id/like-toggle',
      'GET /posts/:id/comments',
      'POST /posts/:id/comments',
      'GET /candidates',
      'POST /follow/:userId/toggle',
    ]) {
      assert.ok(paths.some((p) => p === expected), `route absente : ${expected} (trouvées : ${paths.join(' | ')})`);
    }
  });

  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passes, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
