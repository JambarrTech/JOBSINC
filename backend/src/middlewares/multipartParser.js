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
  const separator = Buffer.from(`--${boundary}`);
  const nextSeparator = Buffer.from(`\r\n--${boundary}`);
  const fields = {};
  const files = [];

  let position = buffer.indexOf(separator);
  while (position >= 0) {
    position += separator.length;
    if (buffer.subarray(position, position + 2).toString() === '--') break;
    if (buffer.subarray(position, position + 2).toString() !== '\r\n') throw badRequest('Corps multipart invalide.');
    position += 2;

    const headersEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), position);
    if (headersEnd < 0) throw badRequest('Corps multipart invalide.');

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
  return /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '')?.slice(1).find(Boolean);
}

async function saveFile(file, uploadDir) {
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = generateFilename(file.mimetype);
  await fs.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx' });
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
            const filename = await saveFile(file, uploadDir);
            return { 
              url: `/uploads/${path.basename(uploadDir)}/${filename}`,
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
    await fs.mkdir(uploadDir, { recursive: true });

    if (photos.length > 0) {
      validateFiles(photos, ['image/jpeg', 'image/png', 'image/webp'], { maxSize: 5 * 1024 * 1024, maxFiles: 6 });
      
      req.companyImages = await Promise.all(photos.map(async (file, index) => {
        const filename = await saveFile(file, uploadDir);
        return { url: `/uploads/companies/${filename}`, isPrimary: index === 0, sortOrder: index };
      }));
    }

    if (logos.length === 1) {
      validateFiles(logos, ['image/jpeg', 'image/png', 'image/webp'], { maxSize: 5 * 1024 * 1024, maxFiles: 1 });
      const filename = await saveFile(logos[0], uploadDir);
      req.companyLogo = { url: `/uploads/companies/${filename}` };
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