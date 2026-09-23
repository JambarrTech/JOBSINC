const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const emailService = require('./emailService');
const { hashAndStoreRefreshToken, revokeAllRefreshTokens } = require('../utils/tokenUtils');
const { ValidationError, ConflictError, NotFoundError, AuthenticationError } = require('../utils/errors');
const { validateEmail, validatePhone, validatePassword, validateRequired, validateLength, validateAge, sanitizeEmail, sanitizeString } = require('../utils/validation');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function createCandidate(data) {
  validateRequired(data.email, 'Email');
  validateRequired(data.password, 'Mot de passe');
  validateRequired(data.firstName, 'Prénom');
  validateRequired(data.lastName, 'Nom');
  validateRequired(data.phone, 'Téléphone');
  validateRequired(data.country, 'Pays');
  validateRequired(data.city, 'Ville');
  validateRequired(data.birthDate, 'Date de naissance');

  if (!validateEmail(data.email)) throw new ValidationError('Email invalide.');
  if (!validatePassword(data.password)) throw new ValidationError('Le mot de passe doit contenir au moins 8 caractères.');
  if (!validatePhone(data.phone)) throw new ValidationError('Numéro de téléphone invalide.');
  validateLength(data.firstName, 'Prénom', 2, 50);
  validateLength(data.lastName, 'Nom', 2, 50);
  validateAge(data.birthDate);

  const email = sanitizeEmail(data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Cette adresse email est déjà utilisée.');

  const passwordHash = await hashPassword(data.password);
  
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'CANDIDATE',
      candidate: {
        create: {
          firstName: sanitizeString(data.firstName),
          lastName: sanitizeString(data.lastName),
          phone: sanitizeString(data.phone),
          birthDate: new Date(data.birthDate),
          country: sanitizeString(data.country),
          city: sanitizeString(data.city),
          avatarUrl: data.avatarUrl || null,
        },
      },
    },
    include: { candidate: true },
  });

  await prisma.notification.createMany({
    data: [
      { userId: user.id, title: 'Bienvenue sur JOBSINC !', body: `Bienvenue ${user.candidate.firstName} ! Créez votre profil complet pour maximiser vos chances.`, type: 'GENERAL' },
      { userId: user.id, title: 'Complétez votre profil', body: 'Ajoutez votre CV et vos compétences pour attirer les recruteurs.', type: 'GENERAL' },
      { userId: user.id, title: 'Explorez les offres', body: 'Des milliers d\'offres d\'emploi vous attendent. Commencez votre recherche maintenant !', type: 'APPLICATION' },
    ],
  });

  return user;
}

async function createCompany(data) {
  validateRequired(data.email, 'Email');
  validateRequired(data.password, 'Mot de passe');
  validateRequired(data.companyName, 'Nom de l\'entreprise');

  if (!validateEmail(data.email)) throw new ValidationError('Email invalide.');
  if (!validatePassword(data.password)) throw new ValidationError('Le mot de passe doit contenir au moins 8 caractères.');
  validateLength(data.companyName, 'Nom de l\'entreprise', 2, 100);

  const email = sanitizeEmail(data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Cette adresse email est déjà utilisée.');

  const passwordHash = await hashPassword(data.password);
  
  const companyImagesData = data.companyImages && data.companyImages.length > 0
    ? { create: data.companyImages.map((img, index) => ({ url: img.url, sortOrder: index, isPrimary: index === 0 })) }
    : undefined;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'RECRUITER',
      company: {
        create: {
          name: sanitizeString(data.companyName),
          logo: data.logo || null,
          images: companyImagesData,
        },
      },
    },
    include: { company: true },
  });

  return user;
}

async function authenticateUser(email, password, allowedRoles = null) {
  validateRequired(email, 'Email');
  validateRequired(password, 'Mot de passe');

  const user = await prisma.user.findUnique({ 
    where: { email: sanitizeEmail(email) }, 
    include: { candidate: true, company: true } 
  });
  
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthenticationError('Identifiants invalides.');
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new AuthenticationError('Type de compte non autorisé pour cette connexion.');
  }

  if (user.role === 'RECRUITER' && !user.company) {
    throw new AuthenticationError('Aucune entreprise associée à ce compte.');
  }

  return user;
}

async function requestPasswordReset(email) {
  validateRequired(email, 'Email');
  if (!validateEmail(email)) throw new ValidationError('Email invalide.');

  const user = await prisma.user.findUnique({ where: { email: sanitizeEmail(email) } });
  if (!user) return { success: true };

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  await prisma.passwordReset.deleteMany({ where: { userId: user.id, used: false } });
  await prisma.passwordReset.create({ data: { userId: user.id, token: tokenHash, expiresAt } });

  await emailService.sendPasswordReset(user.email, rawToken).catch(
    (cause) => console.error('Erreur envoi email reset:', cause.message),
  );

  return { success: true };
}

async function resetPassword(token, newPassword) {
  validateRequired(token, 'Token');
  validateRequired(newPassword, 'Nouveau mot de passe');
  if (!validatePassword(newPassword)) throw new ValidationError('Le mot de passe doit contenir au moins 8 caractères.');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await prisma.passwordReset.findUnique({ where: { token: tokenHash } });
  if (!reset || reset.used || reset.expiresAt < new Date()) {
    throw new ValidationError('Token invalide ou expiré.');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
  await prisma.passwordReset.update({ where: { id: reset.id }, data: { used: true } });
  await revokeAllRefreshTokens(reset.userId);

  return { success: true };
}

async function requestEmailVerification(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Utilisateur introuvable.');
  if (user.emailVerified) throw new ValidationError('Email déjà vérifié.');

  await prisma.emailVerification.deleteMany({ where: { userId: user.id, used: false } });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 3600000);

  await prisma.emailVerification.create({ data: { userId: user.id, token: tokenHash, expiresAt } });

  await emailService.sendEmailVerification(user.email, rawToken).catch(
    (cause) => console.error('Erreur envoi email vérification:', cause.message),
  );

  return { success: true };
}

async function verifyEmail(token) {
  validateRequired(token, 'Token');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const verification = await prisma.emailVerification.findUnique({ where: { token: tokenHash } });
  if (!verification || verification.used) throw new ValidationError('Token invalide ou déjà utilisé.');
  if (new Date() > verification.expiresAt) throw new ValidationError('Token expiré.');

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: verification.id }, data: { used: true } }),
    prisma.user.update({ where: { id: verification.userId }, data: { emailVerified: true } }),
  ]);

  return { success: true };
}

async function logout(userId, refreshToken) {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  if (refreshToken) {
    const { revokeRefreshToken } = require('../utils/tokenUtils');
    await revokeRefreshToken(userId, refreshToken);
  }
  return { success: true };
}

module.exports = {
  createCandidate,
  createCompany,
  authenticateUser,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmail,
  logout,
};