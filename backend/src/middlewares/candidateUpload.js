const path = require('path');
const { createUploadMiddleware } = require('./multipartParser');

const ACCEPTED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

module.exports = createUploadMiddleware({
  fieldName: 'avatar',
  uploadDir: path.resolve(__dirname, '../../uploads/candidates'),
  acceptedTypes: ACCEPTED_TYPES,
});
