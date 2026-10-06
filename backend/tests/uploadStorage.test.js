// Non-régression — « CV : erreur serveur interne ».
//
// En production (STORAGE_DRIVER=s3, bucket injoignable — cf. /health
// `storage: down`), chaque upload CV/avatar/logo faisait échouer `saveS3`
// avec une erreur brute (CredentialsProviderError, NetworkingError…),
// remontée en 500 « Erreur serveur interne. » par le handler global.
//
// `saveFile` convertit désormais toute panne de stockage en AppError 503
// `STORAGE_UNAVAILABLE` : message explicite, statut actionnable.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { saveFile } = require('../src/middlewares/multipartParser');

const pdf = (size = 1024) => ({
  buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size)]),
  mimetype: 'application/pdf',
});

test('panne S3 : saveFile lève une AppError 503 STORAGE_UNAVAILABLE', async () => {
  const previous = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    AWS_S3_REGION: process.env.AWS_S3_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT,
  };
  process.env.STORAGE_DRIVER = 's3';
  process.env.AWS_S3_BUCKET = 'jobsinc-test-bucket';
  process.env.AWS_S3_REGION = 'eu-west-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  // Port fermé : refus de connexion immédiat, pas d'attente réseau.
  process.env.AWS_S3_ENDPOINT = 'http://127.0.0.1:9';
  try {
    await assert.rejects(
      saveFile(pdf(), '/uploads/cvs'),
      (error) =>
        error.name === 'AppError' &&
        error.statusCode === 503 &&
        error.code === 'STORAGE_UNAVAILABLE',
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('driver local : saveFile écrit le fichier et rend son nom', async () => {
  const previous = process.env.STORAGE_DRIVER;
  delete process.env.STORAGE_DRIVER;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobsinc-upload-'));
  try {
    const filename = await saveFile(pdf(), dir);
    assert.match(filename, /^[0-9a-f-]+\.pdf$/);
    await fs.access(path.join(dir, filename));
  } finally {
    if (previous !== undefined) process.env.STORAGE_DRIVER = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
