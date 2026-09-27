// BUG VERROUILLE — stockage « sain » en production alors que les fichiers
// disparaissent a chaque redeploiement.
//
// AVANT, la sonde du tableau d'etat admin (et celle de `/health`) ne testaient
// pas reellement le stockage :
//   - s3     : `Boolean(process.env.AWS_S3_BUCKET)` → « la variable est
//     declaree » presente comme « le stockage fonctionne » ;
//   - local  : `fs.access(dir, W_OK)` → « le dossier est inscriptible » presente
//     comme « les fichiers survivent ».
//
// Les deux sont vrais, et tous deux sans consequence : sur un hebergeur manage
// le disque est ephemere, donc le service demarrait vert, l'API repondait 200,
// et la perte n'apparaissait qu'a l'ecran — observe en production, ou les 16
// logos references en base repondaient `Cannot GET /uploads/...`.
//
// `probeStorage` distingue desormais trois etats, dont `degraded` : le stockage
// FONCTIONNE mais les ecritures ne survivront pas.
const assert = require('node:assert/strict');
const test = require('node:test');

const SAUV = { ...process.env };

function restaurer() {
  for (const k of ['NODE_ENV', 'STORAGE_DRIVER', 'AWS_S3_BUCKET', 'AWS_S3_REGION', 'VERCEL']) {
    if (SAUV[k] === undefined) delete process.env[k];
    else process.env[k] = SAUV[k];
  }
}

// Le module lit `process.env` a chaque appel, pas au chargement : on peut donc
// changer de scenario sans recharger, ce qui evite d'avoir a purger le cache.
const { probeStorage } = require('../src/utils/healthCheck');

test('driver local en PRODUCTION : degraded, car les ecritures ne survivront pas', async () => {
  process.env.NODE_ENV = 'production';
  process.env.STORAGE_DRIVER = 'local';
  delete process.env.VERCEL;
  delete process.env.AWS_S3_BUCKET;

  const p = await probeStorage();
  assert.equal(p.status, 'degraded', 'un disque ephemere ne doit PAS etre « ok »');
  assert.equal(p.driver, 'local');
  // Motif tolerant aux accents : « éphémère » ne matche pas /ephem/i. Un faux
  // echec serait alors attribue au code, alors qu il est dans le test.
  assert.match(p.reason, /[ée]ph/i, 'la raison doit nommer la cause');
  restaurer();
});

test('driver local en developpement : ok', async () => {
  process.env.NODE_ENV = 'development';
  process.env.STORAGE_DRIVER = 'local';
  delete process.env.VERCEL;

  const p = await probeStorage();
  assert.equal(p.status, 'ok');
  assert.match(p.reason, /écriture|writ/i);
  restaurer();
});

test('driver s3 sans AWS_S3_BUCKET : down, pas « ca marche puisque la variable existe »', async () => {
  // C'est le cas que l'ancienne sonde ne voyait pas : elle ne testait que
  // `Boolean(AWS_S3_BUCKET)` et ne distinguait pas « absent » de « joignable ».
  process.env.NODE_ENV = 'production';
  process.env.STORAGE_DRIVER = 's3';
  delete process.env.AWS_S3_BUCKET;

  const p = await probeStorage();
  assert.equal(p.status, 'down', 's3 sans bucket ne peut pas servir un fichier');
  assert.match(p.reason, /AWS_S3_BUCKET/);
  restaurer();
});

test('la sonde ne leve jamais, meme sur une destination insolite', async () => {
  // Contrat le plus important : une panne est une DONNEE a remonter, jamais une
  // exception. `/health` ne doit pas pouvoir renvoyer une 500 a Render parce
  // qu'une dependance est tombee — ce qui ferait tuer un conteneur sain.
  process.env.NODE_ENV = 'production';
  process.env.STORAGE_DRIVER = 'local';
  process.env.VERCEL = '1';
  // Sous Vercel la sonde vise /tmp/uploads ; on le rend inecrivable.
  process.env.AWS_S3_BUCKET = 'peu-importe';

  let p;
  try {
    p = await probeStorage();
  } catch (e) {
    restaurer();
    assert.fail(`la sonde a leve : ${e && e.message}`);
  }
  assert.ok(['ok', 'degraded', 'down'].includes(p.status), `etat inattendu : ${p.status}`);
  restaurer();
});

test('aucun fichier de sonde ne reste sur le disque', async () => {
  // La sonde ecrit puis supprime un temoin. Un temoin oublier polluerait le
  // dossier d'upload, qui est ensuite servi tel quel par `express.static`.
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'uploads');
  const restes = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('.healthcheck-')) : [];
  assert.deepEqual(restes, [], `fichier(s) de sonde abandonne(s) : ${restes.join(', ')}`);
});
