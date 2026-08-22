const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/interviewController');
router.use(auth);
router.post('/applications/:id/schedule', controller.schedule);
router.get('/applications/:id/interview', controller.getByApplicationPublic);
router.get('/applications/:id/interview/recruiter', controller.getByApplication);
module.exports = router;
