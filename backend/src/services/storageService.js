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
    // Deux formes d'URL S3, et elles ne donnent PAS la meme cle :
    //   - virtual-host  : https://<bucket>.s3.<region>.amazonaws.com/<clé>
    //     le bucket est dans l'hote, le chemin EST deja la cle ;
    //   - path-style    : https://s3.<region>.amazonaws.com/<bucket>/<clé>
    //     le bucket est le PREMIER segment du chemin.
    // Sans cette distinction, la forme path-style renvoyait
    // `<bucket>/<clé>` comme cle : la lecture S3 echouait en `NoSuchKey`, donc
    // un fichier parfaitement deposit se retrouvait introuvable.
    const virtualHost = Boolean(bucket && url.hostname.startsWith(`${bucket}.`));
    // Rejette toute URL qui ne pointe pas vers NOTRE bucket.
    if (bucket && !virtualHost && !url.hostname.startsWith('s3.')) {
      return null;
    }
    value = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!virtualHost && bucket && value.startsWith(`${bucket}/`)) {
      value = value.slice(bucket.length + 1);
    }
  } else {
    value = value.replace(/^\/+/, '').replace(/^uploads\//, '');
  }

  if (!value || value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
  return value;
}

/**
 * Normalise une valeur de stockage vers le CHEMIN APPLICATIF `/uploads/<clé>`.
 *
 * Pourquoi cette fonction existe
 * -----------------------------
 * Les URLs d'upload arrivaient au frontend sous deux formes INCOMPATIBLES :
 *
 *   - `applicationController.applicationDto` renvoyait `cvUrl` TEL QU'ENREGISTRÉ
 *     (`/uploads/cvs/…`), donc un chemin relatif ;
 *   - `companyController.companyDto` et `jobController` passaient la même valeur
 *     par `absoluteUrl()`, qui la transformait en URL ABSOLUE sur l'hôte que le
 *     backend croit être le sien.
 *
 * Or le frontend ne complète un chemin relatif que par sa propre `API_ORIGIN`
 * (`lib/api.ts`), et `assetUrl` REFUSE toute origine différente. Sans `APP_URL`
 * — qui n'est PAS dans le Blueprint `render.yaml`, cf. `utils/urls.js:22` —
 * `absoluteUrl` retombe sur l'en-tête `Host`, c'est-à-dire l'hôte Render
 * (`…onrender.com`). L'API annonait donc des images sur un hôte que le web
 * `entreprise` rejetait : images cassées côté entreprise alors que le mobile,
 * dont `resolveUrl` renvoie les URL absolues telles quelles, les affichait
 * normalement. Deux plateformes, deux traitements du même champ, un bug.
 *
 * On renvoie donc TOUJOURS le chemin relatif : le frontend possède une source de
 * vérité autoritaire pour l'origine de l'API, le backend n'en a pas. `APP_URL`
 * reste nécessaire pour les liens d'email — plus aucun asset n'en dépend.
 *
 * S'appuie sur `s3KeyFromStoredUrl`, qui absorbe déjà les trois formes
 * historiques (clé relative, chemin applicatif, ancienne URL publique S3).
 * Une valeur irreconnaissable rend `null` : mieux vaut ne rien afficher qu'afficher
 * une image venue d'un tiers.
 */
function canonicalUploadPath(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  if (!value) return null;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;

  // URL absolue : seule `s3KeyFromStoredUrl` sait dire si l'hote est NOTRE
  // bucket. C'est lui qui refuse un hote inconnu — donc la reecriture est
  // bornee a ce que le backend peut reellement prouver.
  if (/^https?:\/\//i.test(value)) {
    const key = s3KeyFromStoredUrl(value);
    return key ? `/uploads/${key}` : null;
  }

  // deja un chemin applicatif d upload, avec ou sans slash initial
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;

  // Cle S3 nue (`cvs/a.pdf`) : c est la forme de `saveS3`, on prefixe.
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*\//.test(value)) return `/uploads/${value}`;

  // Toute autre racine (`/static/…`, `/images/…`, `public/x.png`) n est pas un
  // upload. Prefixer `/uploads/` dessus fabriquerait un chemin qui PARAIT
  // servi par l API alors que la ressource n a jamais existe : un 404 masquant
  // un mauvais stockage, au lieu d une absence franche. On refuse.
  return null;
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
  canonicalUploadPath,
  streamS3Object,
};
