const path = require('path');
const { createUploadMiddleware } = require('./multipartParser');
const { UPLOAD_CONFIGS } = require('../utils/uploadValidation');

const config = { ...UPLOAD_CONFIGS.avatar, uploadDir: path.resolve(__dirname, '../../uploads/candidates') };

module.exports = createUploadMiddleware(config);