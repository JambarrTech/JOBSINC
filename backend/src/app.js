// src/app.js — Express app factory (sans server.listen / Socket.IO)
// Utilisé par server.js (cible de déploiement Render, via le Blueprint racine)
// et par api/index.js (entrée de secours sans listener — voir ce fichier).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const prisma = require('./config/prisma');
const logger = require('./utils/logger');
const { healthReport } = require('./utils/healthCheck');
const { globalLimiter, authLimiter, publicLimiter, candidateLimiter, recruiterLimiter, adminLimiter, messageLimiter, uploadServingLimiter } = require('./middlewares/rateLimit');
const { uploadAuth } = require('./middlewares/uploadAuth');

const { getCorsOrigins } = require('./config/corsOrigins');
const { getAccessTokenFromCookies, hasCookieAuth } = require('./utils/tokenCookies');

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
    // Origine refusée : `cors` rejette via une Error. On utilise une
    // AppError 403 pour que la réponse soit un refus explicite plutôt qu'un
    // 500 indistinguable d'une panne (et pour qu'aucune décision ne dépende
    // du client n'obtenant aucune en-tête CORS).
    const { AppError } = require('./utils/errors');
    return cb(new AppError('Origin non autorisée par CORS.', 403, 'CORS_DENIED'));
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
// La liste des cookies est dérivée de utils/tokenCookies : c'est le MÊME
// helper que celui utilisé par authMiddleware, donc impossible à contourner
// via un nom de cookie alternatif.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const cookieAuth = hasCookieAuth(req.cookies);
  const origin = req.headers.origin;
  if (cookieAuth && origin && !corsOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origine non autorisée.' });
  }
  return next();
});

// Request id minimal : c'est la clé de corrélation entre le access log et la
// ligne d'erreur émise par `utils/errors.js`. Les deux passent désormais par
// `utils/logger.js` et partagent le même schéma, donc ce suffixe suffit.
app.use((req, _res, next) => {
  req.id = require('crypto').randomUUID().slice(0, 8);
  next();
});

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.statusCode;
    // Le 5xx est journalisé en `error` (donc sur stderr) pour que les
    // agrégateurs remontent une alerte ; le reste en `info`. Auparavant la
    // ligne était TOUJOURS en `info` et un 500 était indiscernable d'un 200
    // autrement que par la relecture du champ `status`.
    logger[status >= 500 ? 'error' : 'info']({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user && req.user.userId ? req.user.userId : undefined,
    });
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

const PROTECTED_UPLOAD_PREFIXES = ['cvs/', 'candidates/'];

// Un chemin d'upload est public sauf s'il est sous un prefixe protege.
//
// ATTENTION au chemin compare. Les deux branches ne voient PAS la meme chose :
//  - driver local : `app.use('/uploads', ...)` RETIRE le prefixe, donc
//    `req.path` vaut `/cvs/x.pdf` ;
//  - driver S3 : la route est declaree en absolu
//    (`app.get('/uploads/{*splat}')`), donc `req.path` vaudrait
//    `/uploads/cvs/x.pdf` — comparer a `/cvs/` ne testait donc JAMAIS vrai, et
//    l'autorisation des CV y etait entierement contournee (le fichier etait
//    streame sans aucune verification).
// D'ou la normalisation du `splat` plus bas, et non `req.path`.
// `uploadAuth` applique la meme normalisation via `storedPathFromRequest`.
function isPublicUploadPath(relativePath) {
  return !PROTECTED_UPLOAD_PREFIXES.some((prefix) => relativePath.startsWith(`/${prefix}`));
}

if (DRIVER === 'local') {
  // Limiteur de service : `/uploads` n'est PAS sous `/api`, donc le
  // `globalLimiter` ne le couvrait pas. Chaque requête non autorisée
  // déclenchait malgré tout une vérification JWT en base, et la lecture de
  // fichiers n'était ni limitada en débit ni en bande passante.
  app.use('/uploads', uploadServingLimiter, (req, res, next) => {
    // Ici `req.path` est deja relatif au montage (`/cvs/...`).
    if (!isPublicUploadPath(req.path)) {
      return uploadAuth(req, res, next);
    }
    next();
  }, express.static(UPLOADS_DIR, {
    fallthrough: true,
    maxAge: '1d',
  }));
} else {
  // Driver S3 : le bucket reste PRIVÉ. On ne renvoie jamais d'URL publique —
  // sinon l'autorisation de /uploads/cvs et /uploads/candidates disparaît
  // totalement dès qu'on active STORAGE_DRIVER=s3 (obligatoire sur Vercel).
  // Les fichiers sont donc streamés par le backend, après uploadAuth, avec la
  // même sémantique d'autorisation que le driver local.
  //
  // ATTENTION à la syntaxe de route : Express 5 embarque path-to-regexp v8,
  // qui refuse un `*` anonyme et EXIGE un paramètre nommé. La forme
  // `/uploads/*` faisait donc lever un `PathError: Missing parameter name`
  // **au chargement du module** (donc au démarrage du process), dans cette
  // seule branche — latent en local, systématique en S3/Vercel. Et `req.params[0]`
  // n'existe plus en v5 : le paramètre se lit par son nom.
  const { streamS3Object, s3KeyFromStoredUrl } = require('./services/storageService');
  // `{*splat}` est un paramètre RÉPÉTÉ : path-to-regexp v8 le restitue sous
  // forme de TABLEAU de segments (`['cvs','a.pdf']`), pas de chaîne. Utilisé
  // tel quel, `/cvs/a.pdf` devenait `/cvs,a.pdf`, neRecognissait plus le
  // préfixe protégé, et l'autorisation était SAUTÉE. D'où la normalisation.
  const splatToPath = (value) =>
    (Array.isArray(value) ? value.join('/') : String(value || '')).replace(/^\/+/, '');
  app.get('/uploads/{*splat}', async (req, res, next) => {
    const splat = splatToPath(req.params.splat);
    if (!splat) return res.status(400).json({ error: 'Chemin de fichier invalide.' });
    // `splat` est deja relatif : c'est la source de verite, pas `req.path`.
    const isPublic = isPublicUploadPath(`/${splat}`);
    const key = s3KeyFromStoredUrl(`/uploads/${splat}`);
    if (!key) return res.status(400).json({ error: 'Chemin de fichier invalide.' });
    if (!isPublic) {
      return uploadAuth(req, res, async (err) => {
        if (err) return next(err);
        return streamS3Object(key, req, res, { public: false });
      });
    }
    return streamS3Object(key, req, res, { public: true });
  });
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

// Health check (utilisé par le monitoring et par la page d'état admin).
// La sonde elle-même vit dans `utils/healthCheck.js` : elle est partagée avec
// `controllers/adminController.js` pour que les deux ne puissent pas diverger.
app.get('/health', async (req, res) => {
  const { statusCode, body } = await healthReport();
  return res.status(statusCode).json(body);
});

// Nettoyage des refreshTokens expirés, déclenchable par CRON (sécurisé par
// CRON_SECRET). Sur Render, c'est le `setInterval` horaire de `server.js:69`
// qui s'en charge : cet endpoint sert de déclencheur manuel et de filet de
// sécurité si le plan Starter scaled to zero fait perdre le timer.
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
  // `next` est nécessaire au bon fonctionnement du handler d'erreur
  // d'Express (signature à 4 arguments), même s'il n'est pas appelé.
  if (res.headersSent) return next(error);
  return handleError(error, res, req);
});

module.exports = app;
