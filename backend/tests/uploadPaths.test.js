// BUG VERROUILLE — « les CV ne s'ouvrent pas et les photos ne s'affichent pas »
// (symptome entreprise, asymetrique avec le mobile).
//
// Les DTO de lecture renvoyaient les assets d'upload sous deux formes :
//   - `applicationController` : le chemin brut `/uploads/cvs/…` ;
//   - `companyController` / `jobController` : `absoluteUrl(req, …)`, qui
//     transforme ce chemin en URL ABSOLUE sur l'hote que le backend croit etre
//     le sien. Or `APP_URL` n'est PAS dans le Blueprint `render.yaml` : sans
//     elle, `absoluteUrl` retombe sur l'en-tete `Host`, soit l'hote Render.
// L'API annonait alors les images sur `…onrender.com`, que le web `entreprise`
// refuse (cf. entreprise/lib/assets.ts). Le mobile, dont `resolveUrl` renvoie
// les URL absolues telles quelles, les affichait encore.
//
// `canonicalUploadPath` supprime la divergence : tout sort en chemin relatif, et
// le client n'a plus d'hote a deviner.
const assert = require('node:assert/strict');
const test = require('node:test');

process.env.AWS_S3_BUCKET = 'jobsinc-media';

const { canonicalUploadPath, s3KeyFromStoredUrl } = require('../src/services/storageService');

test('un chemin applicatif relatif est renvoyé tel quel', () => {
  assert.equal(canonicalUploadPath('/uploads/cvs/a.pdf'), '/uploads/cvs/a.pdf');
  assert.equal(canonicalUploadPath('/uploads/candidates/a.jpg'), '/uploads/candidates/a.jpg');
  assert.equal(canonicalUploadPath('/uploads/companies/a.jpg'), '/uploads/companies/a.jpg');
});

test('une cle relative S3 est completée en chemin applicatif', () => {
  assert.equal(canonicalUploadPath('cvs/a.pdf'), '/uploads/cvs/a.pdf');
  assert.equal(canonicalUploadPath('candidates/a.jpg'), '/uploads/candidates/a.jpg');
});

test('une ancienne URL publique S3 est normalisee (les deux formes d hebergement)', () => {
  const attendu = '/uploads/candidates/a.jpg';
  assert.equal(
    canonicalUploadPath('https://jobsinc-media.s3.eu-west-1.amazonaws.com/candidates/a.jpg'),
    attendu
  );
  assert.equal(
    canonicalUploadPath('https://s3.eu-west-1.amazonaws.com/jobsinc-media/candidates/a.jpg'),
    attendu
  );
});

test('une URL absolue /uploads/ sur un hote inconnu est REFUSEE, pas reecrite', () => {
  // Frontiere de conception, verrouillee deliberement.
  //
  // `absoluteUrl` produisait cette forme quand `APP_URL` manquait : un chemin
  // applicatif transformé en URL absolue sur l'hote que le backend croyait etre
  // le sien. Le backend ne peut PAS la normaliser : il ne connait que SON
  // bucket, et accepter le chemin d'un hote arbitraire reviendrait a faire
  // confiance a cet hote.
  //
  // C'est donc le CLIENT qui la traite, parce que lui, il connait son
  // `API_ORIGIN` (entreprise/lib/assets.ts, `rebaseUploadPath`). Chaque
  // interet est resolu la ou la source de verite existe.
  assert.equal(
    canonicalUploadPath('https://jobsinc-backend.onrender.com/uploads/companies/a.jpg'),
    null
  );
  assert.equal(
    canonicalUploadPath('https://api.ancien-domaine.test/uploads/candidates/a.jpg'),
    null
  );
});

test('seul le prefixe uploads/ est accepte en relatif', () => {
  // Hors perimetre : le service ne sert que /uploads. Une autre racine ne doit
  // pas fabriquer un chemin qui paraitrait servi par l API.
  assert.equal(canonicalUploadPath('/static/a.png'), null);
  assert.equal(canonicalUploadPath('uploads/cvs/a.pdf'), '/uploads/cvs/a.pdf');
});

test('les valeurs inutilisables rendent null, jamais une URL inventee', () => {
  for (const v of [null, undefined, '', '   ', 42, {}]) {
    assert.equal(canonicalUploadPath(v), null, `${JSON.stringify(v)} devrait rendre null`);
  }
});

test('une URL pointant vers un AUTRE bucket est rejetee', () => {
  // `s3KeyFromStoredUrl` refuse un hote qui n est pas le notre bucket : sans
  // ce controle, un logo hostile stocke en base aurait ete reecrit en
  // `/uploads/…` et servi par NOTRE backend — donc presente comme un asset
  // de confiance alors qu il vient d ailleurs.
  assert.equal(
    canonicalUploadPath('https://bucket-pirate.s3.eu-west-1.amazonaws.com/candidates/a.jpg'),
    null
  );
  assert.equal(
    canonicalUploadPath('https://cdn.example.com/uploads/candidates/a.jpg'),
    null
  );
});

test('la traversee de repertoire reste impossible', () => {
  assert.equal(canonicalUploadPath('/uploads/../secret'), null);
  assert.equal(s3KeyFromStoredUrl('/uploads/../secret'), null);
});

test('les 3 formes absorbées par s3KeyFromStoredUrl donnent le meme resultat', () => {
  // Contrat de coherence : la cle qui sert au stockage S3 est exactement le
  // suffixe du chemin applicatif. Si ces trois formes divergeaient, un fichier
  // ecrit avec l une serait introuvable avec une autre.
  const formes = [
    'candidates/a.jpg',
    '/uploads/candidates/a.jpg',
    'https://jobsinc-media.s3.eu-west-1.amazonaws.com/candidates/a.jpg',
  ];
  const resultats = new Set(formes.map(canonicalUploadPath));
  assert.equal(resultats.size, 1, `attendu un seul resultat, obtenu ${[...resultats].join(' | ')}`);
});
