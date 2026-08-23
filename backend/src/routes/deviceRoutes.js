const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/deviceController');

const router = express.Router();
router.use(auth);

router.post('/register', controller.register);
router.post('/unregister', controller.unregister);

module.exports = router;
