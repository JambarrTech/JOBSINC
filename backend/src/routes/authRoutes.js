const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const candidateUpload = require('../middlewares/candidateUpload');
const companyUpload = require('../middlewares/companyUpload');
const { sensitiveAuthLimiter } = require('../middlewares/rateLimit');

router.post('/register/candidate', candidateUpload, authController.registerCandidate);
router.post('/login/candidate', authController.loginCandidate);
router.post('/login', authController.login);

router.post('/forgot-password', sensitiveAuthLimiter, authController.forgotPassword);
router.post('/reset-password', sensitiveAuthLimiter, authController.resetPassword);

router.post('/register/company', companyUpload, authController.registerCompany);
router.post('/login/company', authController.loginCompany);

router.get('/me', authMiddleware, authController.getMe);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);
router.post('/verify-email', authMiddleware, sensitiveAuthLimiter, authController.requestEmailVerification);
router.post('/verify-email/confirm', sensitiveAuthLimiter, authController.verifyEmail);

module.exports = router;