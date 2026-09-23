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

function validateFile(file, allowedMimes, limits = DEFAULT_LIMITS.image) {
  if (!allowedMimes.includes(file.mimetype)) {
    throw new ValidationError(
      `Type de fichier non autorisé. Types acceptés: ${allowedMimes.join(', ')}`
    );
  }
  
  if (file.size > limits.maxSize) {
    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
    throw new ValidationError(`Fichier trop volumineux. Taille max: ${maxMB} MB`);
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
  generateFilename,
  UPLOAD_CONFIGS,
};