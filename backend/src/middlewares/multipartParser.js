const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { ValidationError } = require('../utils/errors');
const { validateFiles, generateFilename } = require('../utils/uploadValidation');

const DEFAULT_MAX_SIZE = 15 * 1024 * 1024;

function badRequest(message) {
  const error = new ValidationError(message);
  error.status = 400;
  return error;
}

function parseMultipart(buffer, boundary) {
  if (!boundary || boundary.length < 1 || boundary.length > 70) throw badRequest('Boundary invalide.');
  if (/[\u0000-\u001f\u007f]/.test(boundary)) throw badRequest('Boundary invalide.');
  const separator = Buffer.from(`--${boundary}`);
  const nextSeparator = Buffer.from(`\r\n--${boundary}`);
  const fields = {};
  const files = [];
  if (buffer.length > 20 * 1024 * 1024) throw badRequest('Corps multipart trop volumineux.');

  let position = buffer.indexOf(separator);
  while (position >= 0) {
    position += separator.length;
    if (buffer.subarray(position, position + 2).toString() === '--') break;
    if (buffer.subarray(position, position + 2).toString() !== '\r\n') throw badRequest('Corps multipart invalide.');
    position += 2;

    const headersEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), position);
    if (headersEnd < 0) throw badRequest('Corps multipart invalide.');
    if (headersEnd - position > 8192) throw badRequest('Headers multipart trop volumineux.');

    const headers = buffer.subarray(position, headersEnd).toString('utf8');
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase();

    const dataStart = headersEnd + 4;
    const dataEnd = buffer.indexOf(nextSeparator, dataStart);

    if (dataEnd < 0 || !name) throw badRequest('Corps multipart invalide.');

    const data = buffer.subarray(dataStart, dataEnd);

    if (filename) {
      files.push({ fieldname: name, originalname: filename, mimetype: contentType, buffer: data, size: data.length });
    } else {
      fields[name] = data.toString('utf8');
    }

    position = dataEnd + 2;
  }

  return { fields, files };
}

async function collectBody(req, maxSize = DEFAULT_MAX_SIZE + 1024 * 1024) {
  const chunks = [];
  let size = 0;
  const timeoutMs = 30000;
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(badRequest('Timeout lecture du corps.')), timeoutMs);
  });
  try {
    const readPromise = (async () => {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxSize) throw badRequest(`Corps de requête trop volumineux (max ${Math.round(maxSize / 1024 / 1024)} MB).`);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    })();
    const result = await Promise.race([readPromise, timeoutPromise]);
    clearTimeout(timeout);
    return result;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function extractBoundary(contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  const b = m?.slice(1).find(Boolean);
  if (!b) return null;
  // Limite RFC 2046 + sanitization
  const trimmed = b.trim().slice(0, 70);
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function getEffectiveDir(uploadDir) {
  if (!process.env.VERCEL) return uploadDir;
  const normalized = uploadDir.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/uploads');
  if (idx !== -1) {
    const suffix = normalized.slice(idx + '/uploads'.length);
    return path.join('/tmp', 'uploads') + suffix.replace(/\//g, path.sep);
  }
  return uploadDir;
}

async function saveFile(file, uploadDir) {
  // Si S3 activé, on upload direct vers S3 et on retourne le nom (l'URL sera construite par l'appelant)
  if ((process.env.STORAGE_DRIVER || 'local') === 's3') {
    const { saveS3 } = require('../services/storageService');
    const filename = generateFilename(file.mimetype);
    const sub = path.basename(uploadDir); // cvs, candidates, companies
    const key = `${sub}/${filename}`;
    const s3Url = await saveS3(file.buffer, key, file.mimetype);
    // On retourne une structure spéciale pour que l'appelant sache qu'il a une URL S3
    // Pour compat on encode l'URL complète dans le filename avec un préfixe
    // Mais on va plutôt retourner l'URL directement via un objet
    // Astuce: on retourne s3Url encodé comme filename et l'appelant détectera http
    return { filename, s3Url };
  }
  const effectiveDir = getEffectiveDir(uploadDir);
  await fs.mkdir(effectiveDir, { recursive: true });
  const filename = generateFilename(file.mimetype);
  await fs.writeFile(path.join(effectiveDir, filename), file.buffer, { flag: 'wx' });
  return filename;
}

function createUploadMiddleware(config) {
  const {
    fieldName,
    uploadDir,
    allowedMimes,
    maxFiles = 1,
    maxSize = DEFAULT_MAX_SIZE,
  } = config;

  return async (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();

    try {
      const boundary = extractBoundary(req.headers['content-type']);
      if (!boundary) throw badRequest('Limite multipart manquante.');

      const parsed = parseMultipart(await collectBody(req, maxSize + 1024 * 1024), boundary);
      const matchedFiles = parsed.files.filter((f) => f.fieldname === fieldName);

      if (matchedFiles.length > maxFiles) {
        throw badRequest(`Vous ne pouvez envoyer que ${maxFiles} fichier(s) pour le champ "${fieldName}".`);
      }

      if (matchedFiles.length > 0) {
        validateFiles(matchedFiles, allowedMimes, { maxSize, maxFiles });
        
        const savedFiles = await Promise.all(
          matchedFiles.map(async (file) => {
            const result = await saveFile(file, uploadDir);
            // saveFile retourne soit une string (local legacy) soit {filename, s3Url}
            let url;
            if (result && typeof result === 'object' && result.s3Url) {
              url = result.s3Url;
            } else if (typeof result === 'string') {
              url = `/uploads/${path.basename(uploadDir)}/${result}`;
            } else {
              // futur: result.url
              url = result.url || `/uploads/${path.basename(uploadDir)}/${result.filename}`;
            }
            return { 
              url,
              originalName: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            };
          })
        );

        if (maxFiles === 1) {
          req[`${fieldName}File`] = savedFiles[0];
        } else {
          req[`${fieldName}Files`] = savedFiles;
        }
      }

      req.body = { ...req.body, ...parsed.fields };
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function handleCompanyUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  
  try {
    const boundary = extractBoundary(req.headers['content-type']);
    if (!boundary) throw badRequest('Limite multipart manquante.');

    const parsed = parseMultipart(await collectBody(req), boundary);
    const photos = parsed.files.filter((f) => f.fieldname === 'photos');
    const logos = parsed.files.filter((f) => f.fieldname === 'logo');

    if (parsed.files.length !== photos.length + logos.length || photos.length > 6 || logos.length > 1) {
      throw badRequest('Vous pouvez envoyer jusqu\'à 6 images de présentation et un logo.');
    }

    const uploadDir = path.resolve(__dirname, '../../uploads/companies');
    // Sur Vercel on n'a besoin de mkdir que pour driver local (dans /tmp)
    const isS3 = (process.env.STORAGE_DRIVER || 'local') === 's3';
    if (!isS3) {
      const effectiveDir = getEffectiveDir(uploadDir);
      await fs.mkdir(effectiveDir, { recursive: true });
    }

    if (photos.length > 0) {
      validateFiles(photos, ['image/jpeg', 'image/png', 'image/webp'], { maxSize: 5 * 1024 * 1024, maxFiles: 6 });
      
      req.companyImages = await Promise.all(photos.map(async (file, index) => {
        const result = await saveFile(file, uploadDir);
        let url;
        if (result && typeof result === 'object' && result.s3Url) url = result.s3Url;
        else if (typeof result === 'string') url = `/uploads/companies/${result}`;
        else url = result.url || `/uploads/companies/${result.filename}`;
        return { url, isPrimary: index === 0, sortOrder: index };
      }));
    }

    if (logos.length === 1) {
      validateFiles(logos, ['image/jpeg', 'image/png', 'image/webp'], { maxSize: 5 * 1024 * 1024, maxFiles: 1 });
      const result = await saveFile(logos[0], uploadDir);
      let url;
      if (result && typeof result === 'object' && result.s3Url) url = result.s3Url;
      else if (typeof result === 'string') url = `/uploads/companies/${result}`;
      else url = result.url || `/uploads/companies/${result.filename}`;
      req.companyLogo = { url };
    }

    req.body = { ...req.body, ...parsed.fields };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { 
  createUploadMiddleware, 
  handleCompanyUpload,
};