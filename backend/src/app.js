// src/app.js — Express app factory (sans server.listen / Socket.IO)
// Utilisé à la fois par server.js (dev / VPS) et api/index.js (Vercel serverless)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

const prisma = require('./config/prisma');
const { globalLimiter, authLimiter, publicLimiter, candidateLimiter, recruiterLimiter, adminLimiter, messageLimiter } = require('./middlewares/rateLimit');

const { getCorsOrigins } = require('./config/corsOrigins');

const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const publicCompanyRoutes = require('./routes/publicCompanyRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const statsRoutes = require('./routes/statsRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const faqRoutes = require('./routes/faqRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const savedJobRoutes = require('./routes/savedJobRoutes');
const skillRoutes = require('./routes/skillRoutes');

const app = express();

// Trust proxy : indispensable derrière Vercel / Render / reverse-proxy
// Render/Vercel sont toujours derrière proxy → par défaut trust proxy 1 sauf TRUST_PROXY=0 explicite
if (process.env.TRUST_PROXY === '0') {
  // Explicitement désactivé
} else {
  const raw = String(process.env.TRUST_PROXY || '1').trim().toLowerCase();
  if (raw === 'true') app.set('trust proxy', true);
  else {
    const parsed = Number(raw);
    app.set('trust proxy', Number.isFinite(parsed) && parsed >= 0 ? parsed : 1);
  }
}

const corsOrigins = getCorsOrigins(process.env);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin non autorisée par CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Les clients mobiles utilisent Authorization: Bearer. Pour le web, les
// cookies d'authentification doivent aussi respecter l'origine approuvée.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const hasCookieAuth = Boolean(req.cookies?.jobsinc_token || req.cookies?.accessToken);
  const origin = req.headers.origin;
  if (hasCookieAuth && origin && !corsOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origine non autorisée.' });
  }
  return next();
});

// Request id minimal (utile pour logs Vercel)
app.use((req, _res, next) => {
  req.id = require('crypto').randomUUID().slice(0, 8);
  next();
});

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    }));
  });
  next();
});

app.use('/api', globalLimiter);

// ---- Uploads statiques ----
// Sur Vercel le filesystem est read-only sauf /tmp => les uploads éphémères
// doivent être servis depuis /tmp/uploads. En local on sert depuis ./uploads.
// Si STORAGE_DRIVER=s3 on ne sert pas local (les fichiers sont sur S3).
const DRIVER = process.env.STORAGE_DRIVER || 'local';
const IS_VERCEL = Boolean(process.env.VERCEL);
const UPLOADS_DIR = IS_VERCEL && DRIVER === 'local'
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', 'uploads');

const PROTECTED_UPLOAD_PREFIXES = ['/cvs/', '/candidates/'];

const uploadAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader) token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  else if (req.cookies?.jobsinc_token) token = req.cookies.jobsinc_token;
  else if (req.cookies?.accessToken) token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: 'Accès non autorisé.' });
  try {
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

if (DRIVER === 'local') {
  app.use('/uploads', (req, res, next) => {
    if (PROTECTED_UPLOAD_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return uploadAuth(req, res, next);
    }
    next();
  }, express.static(UPLOADS_DIR, {
    fallthrough: true,
    maxAge: '1d',
  }));
}

app.use('/api/auth', authLimiter, authRoutes);
// Séparation rate limiting par app : quotas isolés (keyGenerator par userId)
// Public (entreprise vitrine + mobile feed) — 120/min/IP
app.use('/api/companies', publicLimiter, publicCompanyRoutes);
app.use('/api/jobs', publicLimiter, jobRoutes);
app.use('/api/faq', publicLimiter, faqRoutes);
app.use('/api/feedback', publicLimiter, feedbackRoutes);
app.use('/api/skills', publicLimiter, skillRoutes);
// Recruteur (entreprise dashboard) — 200/min/user
app.use('/api/company', recruiterLimiter, companyRoutes);
app.use('/api/stats', recruiterLimiter, statsRoutes);
// Candidat (mobile + entreprise candidat) — 200/min/user
app.use('/api/candidate', candidateLimiter, candidateRoutes);
app.use('/api/applications', candidateLimiter, applicationRoutes);
app.use('/api/saved-jobs', candidateLimiter, savedJobRoutes);
app.use('/api/devices', candidateLimiter, deviceRoutes);
// Messagerie / entretiens — 60/min/user (anti-spam)
app.use('/api/interviews', messageLimiter, interviewRoutes);
app.use('/api/conversations', messageLimiter, conversationRoutes);
app.use('/api/notifications', messageLimiter, notificationRoutes);
// Admin — 60/min/user (strict)
app.use('/api/admin', adminLimiter, adminRoutes);

app.get('/', (req, res) => {
  res.send('🚀 Serveur JOBSINC opérationnel !');
});

// Health check (utilisé par Vercel + monitoring)
const { isRedisAvailable } = require('./config/redis');
app.get('/health', async (req, res) => {
  const redisUp = isRedisAvailable();
  const redisRequired = process.env.REQUIRE_REDIS === 'true';
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisUp ? 'up' : 'down',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'up';
  } catch (e) {
    checks.db = 'down';
    checks.status = 'degraded';
    return res.status(503).json(checks);
  }

  if (!redisUp && redisRequired) {
    checks.status = 'degraded';
    return res.status(503).json(checks);
  }

  if (!redisUp) {
    checks.status = 'degraded';
  }

  return res.json(checks);
});

// Cron endpoint pour Vercel Cron Jobs (sécurisé par CRON_SECRET)
// Nettoie les refreshTokens expirés. Appelé 1x/heure via vercel.json crons.
app.get('/api/cron/cleanup', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  // Si CRON_SECRET défini, on vérifie l'header Authorization Bearer
  if (secret) {
    const auth = req.headers.authorization || '';
    // Vercel Cron envoie Authorization: Bearer <CRON_SECRET>
    // On accepte aussi x-cron-secret pour compatibilité
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-cron-secret'];
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized cron' });
    }
  } else {
    return res.status(503).json({ error: 'CRON_SECRET non configuré.' });
  }
  try {
    const { cleanupExpiredRefreshTokens } = require('./utils/tokenUtils');
    await cleanupExpiredRefreshTokens();
    res.json({ ok: true, cleanedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

const { handleError } = require('./utils/errors');

app.use((error, req, res, next) => {
  handleError(error, res);
});

module.exports = app;
