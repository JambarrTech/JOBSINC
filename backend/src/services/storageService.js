const fs = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');

const DRIVER = process.env.STORAGE_DRIVER || 'local';

// Sur Vercel le filesystem est read-only sauf /tmp. On redirige donc
// tout dossier .../uploads/... vers /tmp/uploads/... quand VERCEL=1.
function getEffectiveDir(uploadDir) {
  if (!process.env.VERCEL) return uploadDir;
  // uploadDir est du type /app/backend/uploads/cvs ou D:\...\uploads\cvs
  // On extrait le segment après 'uploads' et on le réplique sous /tmp/uploads
  const normalized = uploadDir.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/uploads');
  if (idx !== -1) {
    const suffix = normalized.slice(idx + '/uploads'.length); // ex: /cvs
    return path.join('/tmp', 'uploads') + suffix.replace(/\//g, path.sep);
  }
  return uploadDir;
}

async function saveLocal(buffer, uploadDir, filename) {
  const effectiveDir = getEffectiveDir(uploadDir);
  await fs.mkdir(effectiveDir, { recursive: true });
  const fullPath = path.join(effectiveDir, filename);
  await fs.writeFile(fullPath, buffer, { flag: 'wx' });
  return filename;
}

async function removeLocal(fileUrl) {
  if (!fileUrl) return;
  if (isS3()) return removeS3(fileUrl);
  if (!fileUrl.startsWith('/uploads/')) return;
  // Fichiers S3 (http) ne sont pas locaux
  if (fileUrl.startsWith('http')) return;
  const relative = fileUrl.replace(/^\//, ''); // uploads/cvs/xxx.pdf
  const candidates = [
    path.join(__dirname, '../../', relative),
    path.join('/tmp', relative),
  ];
  for (const p of candidates) {
    try { await fs.unlink(p); } catch {}
  }
}

/** Supprime un objet S3. Silencieux : la suppression est un best-effort. */
async function removeS3(fileUrl) {
  const key = s3KeyFromStoredUrl(fileUrl);
  if (!key) return;
  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }));
  } catch (err) {
    // Une suppression S3 en echec ne doit pas interrompre l'appelant — le
    // fichier peut deja etre absent, ou le stockage indisponible. Mais
    // l'echec doit rester visible : `logger.exception` le porte dans le flux
    // JSON et respecte `LOG_LEVEL`, ce que ne faisait pas le `console.error`
    // d'origine.
    logger.exception(err, { message: 'Erreur suppression S3', scope: 'storage' });
  }
}

// Driver S3 (optionnel, activé si STORAGE_DRIVER=s3)
async function saveS3(buffer, key, mimetype) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.AWS_S3_REGION || 'eu-west-1',
    endpoint: process.env.AWS_S3_ENDPOINT,
  });
  await client.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  // On stocke la CLÉ relative, pas une URL publique : le bucket doit rester
  // privé et l'autorisation (/uploads/cvs protégé) doit continuer de s'appliquer.
  return `/uploads/${key}`;
}

function s3Client() {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_S3_REGION || 'eu-west-1',
    endpoint: process.env.AWS_S3_ENDPOINT,
  });
}

/**
 * Normalise une valeur stockée en base vers la clé S3.
 * Accepte :
 *   - une clé relative            `cvs/abc.pdf`
 *   - un chemin applicatif        `/uploads/cvs/abc.pdf`
 *   - une ancienne URL publique   `https://bucket.s3.region.amazonaws.com/cvs/abc.pdf`
 * Rejette toute traversée de répertoire (`..`) et toute barre oblique de tête.
 */
function s3KeyFromStoredUrl(stored) {
  if (!stored || typeof stored !== 'string') return null;
  let value = stored.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    // Migre les enregistrements historiques qui contenaient une URL publique.
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    const bucket = process.env.AWS_S3_BUCKET;
    // Rejette toute URL qui ne pointe pas vers NOTRE bucket.
    if (bucket && !url.hostname.startsWith(`${bucket}.`) && !url.hostname.startsWith('s3.')) {
      return null;
    }
    value = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } else {
    value = value.replace(/^\/+/, '').replace(/^uploads\//, '');
  }

  if (!value || value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
  return value;
}

const STREAMABLE_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function isStreamableContentType(contentType) {
  if (!contentType) return false;
  if (STREAMABLE_CONTENT_TYPES.has(contentType.toLowerCase())) return true;
  // Rejette tout ce qui pourrait être interprété comme du HTML/script
  // (XSS stocké via un bucket mal configuré) tout en gardant les familles
  // image/* et les documents bureautiques usuels.
  return contentType.toLowerCase().startsWith('image/');
}

/**
 * Streame un objet S3 vers la réponse, après contrôle d'autorisation.
 * Applique les en-têtes de sécurité d'un upload local (X-Content-Type-Options,
 * pas d'exécution, nom en attachment pour les documents non-images).
 */
async function streamS3Object(key, req, res, { public: isPublic = false } = {}) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  let object;
  try {
    object = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }));
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode || err?.statusCode;
    if (status === 404 || err?.name === 'NoSuchKey' || err?.name === 'NotFound') {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }
    if (status === 403) {
      return res.status(403).json({ error: 'Accès refusé au fichier.' });
    }
    // 404 et 403 sont des reponses VOLONTAIRES, déjà traitées ci-dessus : ce
    // qui reste est une panne de stockage. Journalisée comme telle.
    logger.exception(err, { message: 'Erreur lecture S3', scope: 'storage' });
    return res.status(502).json({ error: 'Stockage indisponible.' });
  }

  const contentType = object.ContentType || 'application/octet-stream';
  if (!isStreamableContentType(contentType)) {
    return res.status(415).json({ error: 'Type de contenu non autorisé.' });
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', isPublic ? 'inline' : 'attachment');
  if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
  if (object.ETag) res.setHeader('ETag', object.ETag);
  if (object.LastModified) res.setHeader('Last-Modified', new Date(object.LastModified).toUTCString());
  res.setHeader('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, no-store');

  if (req.method === 'HEAD') return res.end();

  const body = object.Body;
  if (!body) return res.end();
  // Le SDK renvoie un Readable (node) ou un web ReadableStream selon la version.
  if (typeof body.pipe === 'function') {
    return body.pipe(res);
  }
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) await new Promise((r) => res.once('drain', r));
    }
    return res.end();
  }
  return res.end(Buffer.from(await body.transformToByteArray()));
}

function isS3() {
  // Lecture dynamique : permet de changer STORAGE_DRIVER sans redémarrer le module
  return (process.env.STORAGE_DRIVER || 'local') === 's3';
}

module.exports = {
  driver: DRIVER,
  saveLocal,
  removeLocal,
  saveS3,
  isS3,
  getEffectiveDir,
  s3KeyFromStoredUrl,
  streamS3Object,
};
