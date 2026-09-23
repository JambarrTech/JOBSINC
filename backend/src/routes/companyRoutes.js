const express = require('express');
const auth = require('../middlewares/authMiddleware');
const companyApproval = require('../middlewares/companyApproval');
const companyUpload = require('../middlewares/companyUpload');
const controller = require('../controllers/companyController');
const faqController = require('../controllers/faqController');
const feedbackController = require('../controllers/feedbackController');
const messageController = require('../controllers/messageController');

const router = express.Router();
router.use(auth);

// Complétion du profil autorisée avant approbation (dossier de modération).
router.get('/profile', controller.profile);
router.put('/profile', controller.updateProfile);
router.post('/images', companyUpload, controller.uploadImage);
router.post('/logo', companyUpload, controller.uploadLogo);
router.delete('/images/:id', controller.deleteImage);

// Actions métier réservées aux entreprises approuvées par un admin.
router.use(companyApproval);

router.get('/dashboard', controller.dashboard);
router.get('/jobs', controller.jobs);
router.post('/jobs', controller.createJob);
router.get('/jobs/:id', controller.getJob);
router.get('/jobs/:id/matches', controller.jobMatches);
router.put('/jobs/:id', controller.updateJob);
router.delete('/jobs/:id', controller.deleteJob);
router.get('/applications', controller.applications);
router.get('/applications/:id', controller.applicationDetail);
router.get('/candidates', controller.candidates);
router.get('/matching', controller.matching);

// Messagerie recruteur (legacy /api/company/messages → conversationService)
router.get('/messages', messageController.listConversations);
router.get('/messages/:conversationId', messageController.getMessages);
router.post('/messages', messageController.send);
router.patch('/messages/:conversationId/read', messageController.markAsRead);

// FAQ entreprise
router.get('/faq', faqController.listByCompany);
router.post('/faq', faqController.create);

// Feedback entreprise
router.get('/feedback', feedbackController.listByCompany);
router.post('/feedback', feedbackController.create);

module.exports = router;
