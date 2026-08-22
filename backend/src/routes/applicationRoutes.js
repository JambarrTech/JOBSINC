const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/applicationController');
router.use(auth);
router.get('/me', controller.mine);
router.post('/jobs/:jobId', controller.create);
router.patch('/:id/status', controller.updateStatus);
router.post('/:id/conversation', controller.ensureConversation);
module.exports = router;
