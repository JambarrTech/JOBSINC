const { ValidationError } = require('../utils/errors');

const MIME_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const DEFAULT_LIMITS = {
  image: { maxSize: 5 * 1024 * 1024, maxFiles: 1 },
  document: { maxSize: 15 * 1024 * 1024, maxFiles: 1 },
  gallery: { maxSize: 5 * 1024 * 1024, maxFiles: 6 },
};

function sanitizeOriginalName(name) {
  if (!name) return 'file';
  // Retire chemins, caractères de contrôle et limite longueur
  const base = name.split(/[\\/]/).pop() || name;
  return base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function validateFile(file, allowedMimes, limits = DEFAULT_LIMITS.image) {
  if (!allowedMimes.includes(file.mimetype)) {
    throw new ValidationError(
      `Type de fichier non autorisé. Types acceptés: ${allowedMimes.join(', ')}`
    );
  }
  // Sanitization nom original (évite path traversal / injection)
  if (file.originalname) file.originalname = sanitizeOriginalName(file.originalname);
  
  if (file.size > limits.maxSize) {
    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
    throw new ValidationError(`Fichier trop volumineux. Taille max: ${maxMB} MB`);
  }

  // Vérification magic bytes (évite .exe renommé .jpg)
  if (file.buffer) {
    const header = file.buffer.subarray(0, 10);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    const isWebp = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
    const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
    // DOC = OLE CF  D0 CF 11 E0 A1 B1 1A E1, DOCX = ZIP PK 03 04
    const isDoc = header[0] === 0xD0 && header[1] === 0xCF && header[2] === 0x11 && header[3] === 0xE0;
    const isDocx = header[0] === 0x50 && header[1] === 0x4B && (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07);
    if (file.mimetype.startsWith('image/') && !(isJpeg || isPng || isWebp)) {
      throw new ValidationError('Contenu du fichier image invalide (magic bytes).');
    }
    if (file.mimetype === 'application/pdf' && !isPdf) {
      throw new ValidationError('Contenu PDF invalide.');
    }
    if (file.mimetype === 'application/msword' && !isDoc) {
      throw new ValidationError('Contenu DOC invalide.');
    }
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && !(isDocx || isDoc)) {
      throw new ValidationError('Contenu DOCX invalide (ZIP attendu).');
    }
  }
  
  return true;
}

function validateFiles(files, allowedMimes, limits = DEFAULT_LIMITS.image) {
  if (files.length > limits.maxFiles) {
    throw new ValidationError(`Trop de fichiers. Maximum: ${limits.maxFiles}`);
  }
  
  for (const file of files) {
    validateFile(file, allowedMimes, limits);
  }
  
  return true;
}

function getExtension(mimetype) {
  return EXTENSIONS[mimetype] || '';
}

function generateFilename(mimetype) {
  const crypto = require('crypto');
  return `${crypto.randomUUID()}${getExtension(mimetype)}`;
}

function sanitizeOriginalNameExport(name) {
  return sanitizeOriginalName(name);
}

function createUploadConfig(options = {}) {
  const {
    fieldName,
    allowedMimes = MIME_TYPES.images,
    maxSize = DEFAULT_LIMITS.image.maxSize,
    maxFiles = DEFAULT_LIMITS.image.maxFiles,
    uploadDir,
  } = options;
  
  return {
    fieldName,
    allowedMimes,
    maxSize,
    maxFiles,
    uploadDir,
    limits: { maxSize, maxFiles },
  };
}

const UPLOAD_CONFIGS = {
  avatar: createUploadConfig({
    fieldName: 'avatar',
    allowedMimes: MIME_TYPES.images,
    maxSize: 5 * 1024 * 1024,
    maxFiles: 1,
  }),
  cv: createUploadConfig({
    fieldName: 'cv',
    allowedMimes: MIME_TYPES.documents,
    maxSize: 15 * 1024 * 1024,
    maxFiles: 1,
  }),
  companyLogo: createUploadConfig({
    fieldName: 'logo',
    allowedMimes: MIME_TYPES.images,
    maxSize: 5 * 1024 * 1024,
    maxFiles: 1,
  }),
  companyPhotos: createUploadConfig({
    fieldName: 'photos',
    allowedMimes: MIME_TYPES.images,
    maxSize: 5 * 1024 * 1024,
    maxFiles: 6,
  }),
};

module.exports = {
  validateFiles,
  validateFile,
  generateFilename,
  UPLOAD_CONFIGS,
  MIME_TYPES,
  EXTENSIONS,
  sanitizeOriginalName: sanitizeOriginalNameExport,
};