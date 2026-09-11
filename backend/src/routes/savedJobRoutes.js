const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/savedJobController');

router.get('/', auth, controller.list);
router.get('/check', auth, controller.check);
router.post('/:jobId/toggle', auth, controller.toggle);

module.exports = router;
