const router = require('express').Router();
const controller = require('../controllers/jobController');
router.get('/', controller.listPublic);
router.get('/:id/similar', controller.similar);
router.get('/:id', controller.getPublic);
module.exports = router;
