const express = require('express');
const controller = require('../controllers/companyController');

const router = express.Router();
router.get('/', controller.listPublic);
router.get('/:id/jobs', controller.publicCompanyJobs);

module.exports = router;
