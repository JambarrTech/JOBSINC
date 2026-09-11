const path = require('path');
const { createUploadMiddleware } = require('./multipartParser');

const ACCEPTED_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
]);

module.exports = createUploadMiddleware({
  fieldName: 'cv',
  uploadDir: path.resolve(__dirname, '../../uploads/cvs'),
  acceptedTypes: ACCEPTED_TYPES,
});
