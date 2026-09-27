const authService = require('../services/authService');
const { recordFailedAttempt, isLocked, clearAttempts, remainingSeconds } = require('../utils/loginLimiter');
const {
  generateAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
} = require('../utils/tokenUtils');
const { handleError, ValidationError, AuthenticationError, NotFoundError } = require('../utils/errors');
const { canonicalUploadPath } = require('../services/storageService');

function userDto(user) {
  const candidate = user.candidate ? {
    firstName: user.candidate.firstName,
    lastName: user.candidate.lastName,
    phone: user.candidate.phone,
    birthDate: user.candidate.birthDate,
    country: user.candidate.country,
    city: user.candidate.city,
    avatarUrl: canonicalUploadPath(user.candidate.avatarUrl),
    cvUrl: canonicalUploadPath(user.candidate.cvUrl),
    skills: user.candidate.skills,
  } : null;
  
  const company = user.company ? {
    id: user.company.id,
    name: user.company.name,
    logo: canonicalUploadPath(user.company.logo),
    sector: user.company.sector || null,
  } : null;
  
  const name = user.role === 'RECRUITER' || user.role === 'ADMIN'
    ? (company?.name || null)
    : (candidate ? [candidate.firstName, candidate.lastName].filter(Boolean).join(' ') || null : null);
    
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified || false,
    name,
    firstName: candidate?.firstName || null,
    lastName: candidate?.lastName || null,
    avatar: user.role === 'RECRUITER' || user.role === 'ADMIN'
      ? (company?.logo || null)
      : canonicalUploadPath(candidate?.avatarUrl),
    candidate,
    company,
  };
}

async function issueTokens(user, res) {
  const accessToken = generateAccessToken(user);
  const { hashAndStoreRefreshToken, generateRefreshToken } = require('../utils/tokenUtils');
  const refreshToken = await hashAndStoreRefreshToken(user.id, generateRefreshToken());

  const isProd = process.env.NODE_ENV === 'production';

  // HttpOnly Secure cookie pour le web (remplace localStorage.jobsinc_token)
  // SameSite None requis en cross-site (Vercel <> Render), Lax en dev
  res.cookie('jobsinc_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  // Alias accessToken pour compatibilité middleware
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });

  return { accessToken, token: accessToken, refreshToken, user: userDto(user) };
}

async function loginUser(req, res, user) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  clearAttempts(user.email);
  const tokens = await issueTokens(user, res);
  return res.json({ message: 'Connexion réussie.', ...tokens });
}

exports.registerCandidate = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);
    
    const data = {
      email: req.body.email,
      password: req.body.password,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      country: req.body.country,
      city: req.body.city,
      birthDate: req.body.birthDate,
      avatarUrl: req.avatarFile?.url || null,
    };
    
    const user = await authService.createCandidate(data);
    const tokens = await issueTokens(user, res);
    return res.status(201).json({ message: 'Compte créé avec succès.', ...tokens });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

/**
 * Enregistre un échec de connexion, sans jamais masquer l'erreur d'origine.
 *
 * ============================================================
 * POURQUOI CE HELPER EXISTE
 * ============================================================
 * Les quatre endpoints de connexion (`loginCandidate`, `login`,
 * `loginAdmin`, `loginCompany`)_make tous la même chose : declares
 * `const email = req.body.email;` à l'INTÉRIEUR du bloc `try`, puis
 * référencent `email` dans le bloc `catch`.
 *
 * En JavaScript, `const` est lié à son bloc. `email` était donc INVISIBLE depuis
 * le `catch`, qui levait :
 *
 *     ReferenceError: email is not defined
 *     at exports.loginCompany (src/controllers/authController.js:236:33)
 *
 * Deux conséquences, l'une visible et l'autre grave :
 *
 *  1. Tout mot de passe erroné renvoyait 500 au lieu de 401.
 *  2. `recordFailedAttempt(email)` n'était JAMAIS atteint. Le verrouillage par
 *     nombre de tentatives — implémenté dans `utils/loginLimiter.js` et testé
 *     par `tests/authTiming.test.js` — n'enregistrait donc aucune tentative, et
 *     le `isLocked(email)` du `try` restait toujours faux. Autrement dit :
 *     IL N'Y AVAIT AUCUN VERROUILLAGE DE COMPTE, sur aucun des quatre endpoints.
 *     La protection anti-bruteforce existait dans le code et neProtectait rien.
 *
 * `email` est désormais lu AVANT le `try`, donc visible dans le `catch`.
 * `req.body` est de toute façon disponible avant toute instruction.
 */
const readLoginEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email : undefined);
exports.loginCandidate = async (req, res) => {
  const email = readLoginEmail(req);
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);

    const password = req.body.password;
    if (!email || !password) return handleError(new ValidationError("L'adresse email et le mot de passe sont obligatoires."), res, req);

    if (await isLocked(email)) {
      const sec = remainingSeconds(email);
      const minutes = Number.isFinite(sec) && sec > 0 ? Math.ceil(sec / 60) : 1;
      return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${minutes} minute(s).` });
    }

    const user = await authService.authenticateUser(email, password, ['CANDIDATE']);
    return loginUser(req, res, user);
  } catch (cause) {
    if (cause.message === 'Identifiants invalides.') {
      await recordFailedAttempt(email);
    }
    return handleError(cause, res, req);
  }
};

exports.login = async (req, res) => {
  const email = readLoginEmail(req);
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);

    const password = req.body.password;
    if (!email || !password) return handleError(new ValidationError('L\'adresse email et le mot de passe sont obligatoires.'), res, req);

    if (await isLocked(email)) {
      const sec = remainingSeconds(email);
      const minutes = Number.isFinite(sec) && sec > 0 ? Math.ceil(sec / 60) : 1;
      return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${minutes} minute(s).` });
    }

    const user = await authService.authenticateUser(email, password);
    return loginUser(req, res, user);
  } catch (cause) {
    if (cause.message === 'Identifiants invalides.') {
      await recordFailedAttempt(email);
    }
    return handleError(cause, res, req);
  }
};

exports.loginAdmin = async (req, res) => {
  const email = readLoginEmail(req);
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);

    const password = req.body.password;
    if (!email || !password) return handleError(new ValidationError('L\'adresse email et le mot de passe sont obligatoires.'), res, req);

    if (await isLocked(email)) {
      const sec = remainingSeconds(email);
      const minutes = Number.isFinite(sec) && sec > 0 ? Math.ceil(sec / 60) : 1;
      return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${minutes} minute(s).` });
    }

    const user = await authService.authenticateUser(email, password, ['ADMIN']);
    return loginUser(req, res, user);
  } catch (cause) {
    if (cause.message === 'Identifiants invalides.') {
      await recordFailedAttempt(email);
    }
    return handleError(cause, res, req);
  }
};

exports.registerCompany = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);
    
    const data = {
      email: req.body.email,
      password: req.body.password,
      companyName: req.body.companyName,
      companyImages: req.companyImages,
      logo: req.companyLogo?.url || null,
    };
    
    const user = await authService.createCompany(data);
    const tokens = await issueTokens(user, res);
    return res.status(201).json({ message: 'Compte entreprise créé avec succès.', ...tokens });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.loginCompany = async (req, res) => {
  const email = readLoginEmail(req);
  try {
    if (!process.env.JWT_SECRET) return handleError(new Error('Configuration de sécurité incomplète.'), res, req);

    const password = req.body.password;
    if (!email || !password) return handleError(new ValidationError("L'adresse email et le mot de passe sont obligatoires."), res, req);

    if (await isLocked(email)) {
      const sec = remainingSeconds(email);
      const minutes = Number.isFinite(sec) && sec > 0 ? Math.ceil(sec / 60) : 1;
      return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${minutes} minute(s).` });
    }

    const user = await authService.authenticateUser(email, password, ['RECRUITER', 'ADMIN']);
    return loginUser(req, res, user);
  } catch (cause) {
    if (cause.message === 'Identifiants invalides.') {
      await recordFailedAttempt(email);
    }
    return handleError(cause, res, req);
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return handleError(new AuthenticationError('Session invalide ou expirée.'), res, req);
    
    const prisma = require('../config/prisma');
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { candidate: true, company: true } });
    if (!user) return handleError(new NotFoundError('Utilisateur introuvable.'), res, req);
    if (!user.company && user.role === 'RECRUITER') {
      return handleError(new NotFoundError('Aucune entreprise associée à ce compte. Contactez le support.'), res, req);
    }
    // Format cohérent avec l'attente mobile : { user: {...} } sans wrapper success
    return res.json({ user: userDto(user) });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.refreshToken = async (req, res) => {
  try {
    // Support both cookie (web) and body (mobile) for refresh token
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawToken) return handleError(new ValidationError('Refresh token manquant.'), res, req);

    // Aucun authMiddleware sur cette route : le refresh token (cookie
    // httpOnly) est la seule preuve d'authenticité. On retrouve
    // l'utilisateur via le hash stocké en base.
    const stored = await verifyRefreshToken(null, rawToken);
    if (!stored) return handleError(new AuthenticationError('Refresh token invalide ou expiré.'), res, req);

    const prisma = require('../config/prisma');
    const user = await prisma.user.findUnique({ where: { id: stored.userId }, include: { candidate: true, company: true } });
    if (!user) return handleError(new NotFoundError('Utilisateur introuvable.'), res, req);

    const newRefreshToken = await rotateRefreshToken(user.id, rawToken);
    const accessToken = generateAccessToken(user);

    const isProd = process.env.NODE_ENV === 'production';
    // Rafraîchit aussi le cookie d'accès HttpOnly
    res.cookie('jobsinc_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    // Set cookie for web clients
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
    
    // Also return refresh token in body for mobile clients
    return res.json({ accessToken, refreshToken: newRefreshToken, user: userDto(user) });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) return handleError(new ValidationError('Email requis.'), res, req);
    
    const result = await authService.requestPasswordReset(email);
    return res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return handleError(new ValidationError('Token et nouveau mot de passe requis.'), res, req);
    
    await authService.resetPassword(token, newPassword);
    return res.json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.logout = async (req, res) => {
  try {
    const userId = req.user?.userId;
    // Support both cookie (web) and body (mobile) for refresh token
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    await authService.logout(userId, rawToken);

    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('refreshToken', { path: '/api/auth', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    res.clearCookie('jobsinc_token', { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    res.clearCookie('accessToken', { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    return res.json({ message: 'Déconnexion réussie.' });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.requestEmailVerification = async (req, res) => {
  try {
    await authService.requestEmailVerification(req.user.userId);
    return res.json({ message: 'Un lien de vérification a été envoyé à votre adresse email.' });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return handleError(new ValidationError('Token requis.'), res, req);
    
    await authService.verifyEmail(token);
    return res.json({ message: 'Email vérifié avec succès.' });
  } catch (cause) {
    return handleError(cause, res, req);
  }
};