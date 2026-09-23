const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const cookieParser = require('cookie-parser');
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
const { connectRedis, closeRedis, isRedisAvailable } = require('./src/config/redis');
const { cleanupExpiredRefreshTokens } = require('./src/utils/tokenUtils');

const app = express();

if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '0') {
  const parsed = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(parsed) && parsed >= 0 ? parsed : 1);
}

const corsOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use('/api', globalLimiter);

const PROTECTED_UPLOAD_PREFIXES = ['/cvs/', '/candidates/'];

const uploadAuth = async (req, res, next) => {
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
};

app.use('/uploads', (req, res, next) => {
  if (PROTECTED_UPLOAD_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return uploadAuth(req, res, next);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

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

const { handleError } = require('./src/utils/errors');

app.use((error, req, res, next) => {
  handleError(error, res);
});

app.get('/', (req, res) => {
  res.send('🚀 Serveur JOBSINC opérationnel !');
});

// Health check endpoint for load balancers / monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const socketService = require('./src/services/socketService');
socketService.init(server, corsOrigins);

require('./src/services/pushService').init();

async function connectWithRetry(attempts = 5, baseDelayMs = 5000) {
  // Neon (serveurless) suspend la base après ~5 min d'inactivité.
  // Le "cold start" peut prendre 5–30 s et échouer la 1re fois (P1001).
  // On réessaie donc avec un backoff progressif avant d'abandonner.
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      const last = i === attempts;
      console.warn(
        `⚠️ Connexion BDD échouée (${i}/${attempts}) — ${err.message.split('\n')[0]}`
      );
      if (last) throw err;
      const delay = baseDelayMs * i;
      console.log(`↻ Nouvelle tentative dans ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function startServer() {
  try {
    await connectRedis();
    if (isRedisAvailable()) {
      console.log('✅ Redis connecté');
    } else {
      console.warn('⚠️ Redis non disponible, utilisation du stockage en mémoire pour le rate-limiting');
    }
    await connectWithRetry();
    
    setInterval(() => cleanupExpiredRefreshTokens().catch(console.error), 60 * 60 * 1000);

    // Anti scale-to-zero Neon : un ping toutes les 2 min garde le compute
    // actif tant que le serveur tourne (seuil de suspension = 5 min).
    // NB : on passe par une opération MODÈLE (prisma.user.count) et non
    // $queryRaw : seul $allModels est couvert par le retry de prisma.js.
    // En cas d'échec (connexion du pool devenue cassée après suspension),
    // on répare le pool ($disconnect + $connect) pour forcer une
    // reconnexion propre au ping suivant.
    setInterval(async () => {
      try {
        await prisma.user.count();
      } catch {
        try {
          await prisma.$disconnect();
          await prisma.$connect();
        } catch {
          // Le compute est peut-être en réveil : le prochain ping réessaiera.
        }
      }
    }, 2 * 60 * 1000);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT} (Socket.IO actif)`);
    });
  } catch (err) {
    console.error('❌ Erreur démarrage:', err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('🛑 Arrêt en cours...');
  try {
    await closeRedis();
  } catch (err) {
    console.warn('⚠️ Erreur fermeture Redis:', err.message);
  }
  await prisma.$disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();