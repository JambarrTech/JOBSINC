const fs = require('fs/promises');
const path = require('path');

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
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
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
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;
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
};
