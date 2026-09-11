const express = require('express');
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const controller = require('../controllers/adminController');
const faqController = require('../controllers/faqController');
const feedbackController = require('../controllers/feedbackController');

const router = express.Router();
router.use(auth, admin);

router.get('/dashboard', controller.overview);
router.get('/search', controller.search);
router.get('/users', controller.users);
router.get('/users/:id', controller.userDetail);
router.get('/candidates', controller.candidates);
router.get('/employees', controller.employees);
router.get('/companies', controller.companies);
router.put('/companies/:id/approve', controller.approveCompany);
router.put('/companies/:id/reject', controller.rejectCompany);
router.get('/administrators', controller.administrators);
router.get('/jobs', controller.jobs);
router.get('/applications', controller.applications);
router.get('/interviews', controller.interviews);
router.get('/recruitments', controller.recruitments);
router.get('/notifications', controller.notifications);
router.get('/activity', controller.activity);
router.get('/audit', controller.audit);
router.get('/analytics', controller.analytics);
router.get('/trends', controller.trends);
router.get('/reportsAnalytics', controller.reportsAnalytics);
router.get('/moderation', controller.moderation);
router.get('/system', controller.system);

// FAQ admin
router.get('/faq', faqController.listAll);
router.put('/faq/:id', faqController.answer);
router.delete('/faq/:id', faqController.remove);

// Feedback admin
router.get('/feedback', feedbackController.listAll);
router.put('/feedback/:id', feedbackController.togglePublish);
router.delete('/feedback/:id', feedbackController.remove);

const empty = controller.emptyResource;
['logins', 'securityAlerts', 'content', 'reports', 'sessions', 'maintenance'].forEach((section) => {
  router.get(`/${section}`, empty);
});

module.exports = router;
