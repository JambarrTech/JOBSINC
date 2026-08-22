const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/messageController');

const router = express.Router();
router.use(auth);

router.get('/', controller.listConversations);
router.post('/', controller.send);
router.get('/:conversationId', controller.getMessages);
router.patch('/:conversationId/read', controller.markAsRead);

module.exports = router;
