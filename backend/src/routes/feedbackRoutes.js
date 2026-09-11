const express = require('express');
const auth = require('../middlewares/authMiddleware');
const controller = require('../controllers/feedbackController');

const router = express.Router();

// Public
router.get('/public', controller.listPublic);

// Entreprise (auth + recruiter)
router.post('/', auth, (req, res, next) => {
  if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
  }
  next();
}, controller.create);
router.get('/', auth, (req, res, next) => {
  if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
  }
  next();
}, controller.listByCompany);

module.exports = router;
