const express = require('express');
const auth = require('../middlewares/authMiddleware');
const companyUpload = require('../middlewares/companyUpload');
const controller = require('../controllers/companyController');

const router = express.Router();
router.use(auth);

router.get('/dashboard', controller.dashboard);
router.get('/profile', controller.profile);
router.put('/profile', controller.updateProfile);
router.post('/images', companyUpload, controller.uploadImage);
router.post('/logo', companyUpload, controller.uploadLogo);
router.delete('/images/:id', controller.deleteImage);
router.get('/jobs', controller.jobs);
router.post('/jobs', controller.createJob);
router.get('/jobs/:id', controller.getJob);
router.get('/jobs/:id/matches', controller.jobMatches);
router.put('/jobs/:id', controller.updateJob);
router.delete('/jobs/:id', controller.deleteJob);
router.get('/applications', controller.applications);
router.get('/applications/:id', controller.applicationDetail);
router.get('/candidates', controller.candidates);
router.get('/matching', controller.matching);

module.exports = router;
