const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/conversationController');
const service = require('../services/conversationService');

const router = express.Router();
router.use(auth);

// RECRUITER → côté entreprise ; CANDIDATE/EMPLOYEE → côté candidat.
// ADMIN : pas d'accès (aucun système de modération existant à réutiliser).
function requireMessagingAccess(req, res, next) {
  if (!service.messagingSide(req.user)) {
    return res.status(403).json({ error: "Votre rôle ne permet pas d'accéder à la messagerie." });
  }
  return next();
}

router.use(requireMessagingAccess);

router.get('/', controller.list);
router.get('/:conversationId', controller.getOne);
router.get('/:conversationId/messages', controller.messages);
router.post('/:conversationId/messages', controller.send);
router.patch('/:conversationId/read', controller.markRead);

module.exports = router;
