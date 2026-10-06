const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/networkController');

const router = express.Router();
router.use(auth);

router.get('/feed', controller.feed);
router.post('/posts', controller.createPost);
router.delete('/posts/:id', controller.deletePost);
router.post('/posts/:id/like-toggle', controller.toggleLike);
router.get('/posts/:id/comments', controller.listComments);
router.post('/posts/:id/comments', controller.createComment);
router.delete('/comments/:commentId', controller.deleteComment);
router.get('/candidates', controller.listCandidates);
router.post('/follow/:userId/toggle', controller.toggleFollow);

module.exports = router;
