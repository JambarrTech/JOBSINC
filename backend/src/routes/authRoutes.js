const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const candidateUpload = require('../middlewares/candidateUpload');

const companyUpload = require('../middlewares/companyUpload');

// Routes publiques
router.post('/register/candidate', candidateUpload, authController.registerCandidate);
router.post('/login/candidate', authController.loginCandidate);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.post('/register/company', companyUpload, authController.registerCompany);
router.post('/login/company', authController.loginCompany);

// Route protégée par token pour la session Next.js
router.get('/me', authMiddleware, authController.getMe);
router.post('/logout', authMiddleware, authController.logout);
router.post('/verify-email', authMiddleware, authController.requestEmailVerification);
router.post('/verify-email/confirm', authController.verifyEmail);

module.exports = router;
