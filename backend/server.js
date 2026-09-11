const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
require('dotenv').config();

const path = require('path');
const jwt = require('jsonwebtoken');
const authRoutes = require('./src/routes/authRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const publicCompanyRoutes = require('./src/routes/publicCompanyRoutes');
const jobRoutes = require('./src/routes/jobRoutes');
const applicationRoutes = require('./src/routes/applicationRoutes');
const interviewRoutes = require('./src/routes/interviewRoutes');
const candidateRoutes = require('./src/routes/candidateRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const conversationRoutes = require('./src/routes/conversationRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const prisma = require('./src/config/prisma');
const faqRoutes = require('./src/routes/faqRoutes');
const feedbackRoutes = require('./src/routes/feedbackRoutes');
const savedJobRoutes = require('./src/routes/savedJobRoutes');
const skillRoutes = require('./src/routes/skillRoutes');
const { globalLimiter, authLimiter } = require('./src/middlewares/rateLimit');

const app = express();

// Derrière un reverse-proxy (nginx, etc.), définir TRUST_PROXY=1 pour que
// express-rate-limit et Express identifient la vraie adresse IP client.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Origines autorisées : liste séparée par des virgules dans CORS_ORIGINS.
// En développement, on retombe sur les origines locales du frontend Next.js.
const corsOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Headers de sécurité.
// crossOriginResourcePolicy 'cross-origin' : indispensable pour que les
// images /uploads restent chargeables par le web (localhost:3000) et le mobile.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

// Limiteur global appliqué à toute l'API (le limiter auth plus strict
// reste en place sur /api/auth). Les fichiers statiques /uploads ne
// passent pas par ce limiter pour ne pas pénaliser le chargement d'images.
app.use('/api', globalLimiter);

app.use('/uploads', async (req, res, next) => {
  if (req.path.startsWith('/cvs/')) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Accès non autorisé.' });
    try {
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!decoded?.userId) return res.status(401).json({ error: 'Token invalide.' });
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { tokenVersion: true } });
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ error: 'Session révoquée.' });
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'Token invalide.' });
    }
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Routes API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/companies', publicCompanyRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/saved-jobs', savedJobRoutes);
app.use('/api/skills', skillRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

app.use((error, req, res, next) => {
  if (error?.status === 400) return res.status(400).json({ error: error.message });
  console.error('Erreur API:', error);
  return res.status(500).json({ error: 'Erreur serveur.' });
});

app.get('/', (req, res) => {
  res.send('🚀 Serveur JOBSINC opérationnel !');
});

const PORT = process.env.PORT || 5000;

// Socket.IO partage le même serveur HTTP qu'Express.
const server = http.createServer(app);
const socketService = require('./src/services/socketService');
socketService.init(server, corsOrigins);

// Push FCM (no-op si la clé de service est absente).
require('./src/services/pushService').init();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT} (Socket.IO actif)`);
});
