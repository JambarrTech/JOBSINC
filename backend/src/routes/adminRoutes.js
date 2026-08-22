const express = require('express');
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const controller = require('../controllers/adminController');

const router = express.Router();
router.use(auth, admin);

router.get('/dashboard', controller.overview);
router.get('/search', controller.search);
router.get('/users', controller.users);
router.get('/users/:id', controller.userDetail);
router.get('/candidates', controller.candidates);
router.get('/employees', controller.employees);
router.get('/companies', controller.companies);
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

const empty = controller.emptyResource;
['logins', 'securityAlerts', 'content', 'reports', 'sessions', 'maintenance'].forEach((section) => {
  router.get(`/${section}`, empty);
});

module.exports = router;
