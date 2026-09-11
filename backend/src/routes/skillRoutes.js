const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/skillController');

const router = express.Router();

router.get('/', controller.listSkills);
router.post('/sync', auth, controller.syncCandidateSkills);
router.post('/job/:jobId/sync', auth, controller.syncJobSkills);

module.exports = router;
