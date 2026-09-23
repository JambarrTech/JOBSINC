const path = require('path');
const { createUploadMiddleware } = require('./multipartParser');
const { UPLOAD_CONFIGS } = require('../utils/uploadValidation');

const config = UPLOAD_CONFIGS.cv;
config.uploadDir = path.resolve(__dirname, '../../uploads/cvs');

module.exports = createUploadMiddleware(config);