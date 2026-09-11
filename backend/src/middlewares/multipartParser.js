const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function badRequest(message) {
  const error = new Error(message);
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
      files.push({ fieldname: name, originalname: filename, mimetype: contentType, buffer: data });
    } else {
      fields[name] = data.toString('utf8');
    }

    position = dataEnd + 2;
  }

  return { fields, files };
}

async function collectBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_FILE_SIZE + 1024 * 1024) throw badRequest('Le fichier ne doit pas dépasser 15 Mo.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function extractBoundary(contentType) {
  return /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '')?.slice(1).find(Boolean);
}

async function saveFile(file, uploadDir, acceptedTypes) {
  if (!acceptedTypes.has(file.mimetype) || file.buffer.length > MAX_FILE_SIZE) {
    throw badRequest(`Type de fichier non accepté ou taille maximale dépassée.`);
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const ext = acceptedTypes.get(file.mimetype);
  const filename = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx' });
  return filename;
}

function createUploadMiddleware({ fieldName, uploadDir, acceptedTypes, maxFiles = 1 }) {
  return async (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();

    try {
      const boundary = extractBoundary(req.headers['content-type']);
      if (!boundary) throw badRequest('Limite multipart manquante.');

      const parsed = parseMultipart(await collectBody(req), boundary);
      const matchedFiles = parsed.files.filter((f) => f.fieldname === fieldName);

      if (matchedFiles.length > maxFiles) {
        throw badRequest(`Vous ne pouvez envoyer qu'un seul fichier ${fieldName}.`);
      }

      if (matchedFiles.length === 1) {
        const filename = await saveFile(matchedFiles[0], uploadDir, acceptedTypes);
        req[`${fieldName}File`] = { url: `/uploads/${path.basename(uploadDir)}/${filename}` };
      }

      req.body = { ...req.body, ...parsed.fields };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { parseMultipart, collectBody, extractBoundary, saveFile, createUploadMiddleware, badRequest, MAX_FILE_SIZE };
