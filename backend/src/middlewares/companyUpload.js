const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { parseMultipart, collectBody, extractBoundary, badRequest } = require('./multipartParser');

const MAX_FILES = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_BODY_SIZE = MAX_FILES * MAX_FILE_SIZE + 1024 * 1024;
const ACCEPTED_TYPES = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp']]);
const uploadDirectory = path.resolve(__dirname, '../../uploads/companies');

module.exports = async (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  try {
    const boundary = extractBoundary(req.headers['content-type']);
    if (!boundary) throw badRequest('Limite multipart manquante.');

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) throw badRequest('Les images ne doivent pas dépasser 5 Mo chacune (6 images maximum).');
      chunks.push(chunk);
    }

    const parsed = parseMultipart(Buffer.concat(chunks), boundary);
    const photos = parsed.files.filter((f) => f.fieldname === 'photos');
    const logos = parsed.files.filter((f) => f.fieldname === 'logo');

    if (parsed.files.length !== photos.length + logos.length || photos.length > MAX_FILES || logos.length > 1) {
      throw badRequest('Vous pouvez envoyer jusqu\'à 6 images de présentation et un logo.');
    }

    for (const file of [...photos, ...logos]) {
      if (!ACCEPTED_TYPES.has(file.mimetype) || file.buffer.length > MAX_FILE_SIZE) {
        throw badRequest('Utilisez des images JPG, PNG ou WEBP de 5 Mo maximum.');
      }
    }

    await fs.mkdir(uploadDirectory, { recursive: true });

    req.companyImages = await Promise.all(photos.map(async (file, index) => {
      const filename = `${crypto.randomUUID()}${ACCEPTED_TYPES.get(file.mimetype)}`;
      await fs.writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx' });
      return { url: `/uploads/companies/${filename}`, isPrimary: index === 0, sortOrder: index };
    }));

    if (logos.length === 1) {
      const filename = `${crypto.randomUUID()}${ACCEPTED_TYPES.get(logos[0].mimetype)}`;
      await fs.writeFile(path.join(uploadDirectory, filename), logos[0].buffer, { flag: 'wx' });
      req.companyLogo = { url: `/uploads/companies/${filename}` };
    }

    req.body = { ...req.body, ...parsed.fields };
    next();
  } catch (error) {
    next(error);
  }
};
