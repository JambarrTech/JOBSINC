const express = require('express');
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const router = express.Router();

router.get('/', statsController.getStats);
router.get('/overview', authMiddleware, adminMiddleware, statsController.getOverview);

module.exports = router;
