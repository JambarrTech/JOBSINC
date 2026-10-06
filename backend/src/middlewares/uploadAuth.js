const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { getAccessTokenFromCookies } = require('../utils/tokenCookies');
const logger = require('../utils/logger');

// ============================================================
// UPLOAD AUTH — autorisation de LECTURE des fichiers protégés
// (/uploads/cvs/** et /uploads/candidates/**)
//
// Ces fichiers contiennent des données personnelles nominatives (CV, photo de
// profil). Historiquement, `uploadAuth` ne vérifiait que la présence d'une
// session valide : n'importe quel utilisateur authentifié — y compris un
// AUTRE CANDIDAT — pouvait télécharger le CV de n'importe quel autre candidat
// dont il connaissait l'URL. Les URL étant des UUID4, le modèle était « URL
// de capacité » et non contrôle d'accès ; or les URL ne sont pas Totally
// secrètes (`companyController.applicationDto` renvoie `cvUrl` aux recruteurs).
//
// Modèle retenu :
//   - CV (`/uploads/cvs/**`, PII sensible) :
//     - propriétaire du fichier        → autorisé
//     - ADMIN                          → autorisé (modération, support)
//     - RECRUITER                       → autorisé UNIQUEMENT s'il existe une
//                                       candidature liant ce candidat à une
//                                       offre de SA société (sinon : 403)
//     - CANDIDATE / EMPLOYEE tiers      → refusé (403)
//   - Avatar (`/uploads/candidates/**`, photo de profil) :
//     - tout utilisateur authentifié   → autorisé (affichage réseau,
//                                       messages, listes). Le fichier doit
//                                       rester référencé en base
//                                       (`FICHIER_INCONNU` sinon), mais aucun
//                                       lien de candidature n'est exigé.
//                                       Sans cela aucune photo de profil ne
//                                       s'affichait hors « Mon profil ».
//
// Le rôle vient du JWT (vérifié + `tokenVersion` relu en base), mais la
// RELATION est toujours vérifiée en base : un jeton valide ne suffit pas.
// ============================================================

const ROLE_RECRUITER = 'RECRUITER';
const ROLE_ADMIN = 'ADMIN';
const ROLE_CANDIDATE = 'CANDIDATE';
const ROLE_EMPLOYEE = 'EMPLOYEE';

/**
 * Traduit le chemin brut de la requête en chemin applicatif stocké en base.
 *
 * Tolère les deux formes rencontrées : `req.path` vaut `/cvs/x.pdf` sous le
 * montage `app.use('/uploads', ...)` (driver local), mais `/uploads/cvs/x.pdf`
 * pour une route déclarée en absolu (driver S3). Sans cette normalisation,
 * le chemin comparé en base aurait été `/uploads/uploads/...` et aucune
 * correspondance n'aurait jamais été trouvée — donc aucun CV n'aurait pu être
 * lu en S3, y compris par son propriétaire légitime.
 */
function storedPathFromRequest(req) {
  let relative = String(req.path || '');
  if (relative.startsWith('/uploads/')) relative = relative.slice('/uploads/'.length);
  else if (relative.startsWith('/uploads')) relative = relative.slice('/uploads'.length);
  if (!relative.startsWith('/')) relative = `/${relative}`;
  if (relative.includes('..') || relative.includes('\\') || relative.includes('\0')) {
    return null;
  }
  return `/uploads${relative}`;
}

function isCvPath(storedPath) {
  return Boolean(storedPath) && storedPath.startsWith('/uploads/cvs/');
}

function isCandidateMediaPath(storedPath) {
  return Boolean(storedPath) && storedPath.startsWith('/uploads/candidates/');
}

/** Le recruteur a-t-il une candidature sur ce profil ? */
async function recruiterCanReachCandidate(recruiterUserId, candidateProfileId) {
  const application = await prisma.application.findFirst({
    where: { candidateProfileId, job: { company: { userId: recruiterUserId } } },
    select: { id: true },
  });
  return Boolean(application);
}

/**
 * Décide si `user` a le droit de lire le fichier `storedPath`.
 * Retourne `{ allowed, reason }`.
 */
async function authorizeStoredFile(user, storedPath) {
  const isCv = isCvPath(storedPath);
  const isMedia = isCandidateMediaPath(storedPath);
  if (!isCv && !isMedia) {
    // Un fichier « protégé » qui ne l'est pas vraiment : on refuse par
    // défaut plutôt que d'accorder.
    return { allowed: false, reason: 'CHEMIN_NON_PROTEGE' };
  }

  if (user.role === ROLE_ADMIN) {
    return { allowed: true, reason: 'ADMIN' };
  }

  const field = isCv ? 'cvUrl' : 'avatarUrl';
  let profile = await prisma.candidateProfile.findFirst({
    where: { [field]: storedPath },
    select: { id: true, userId: true },
  });

  // Données historiques : certaines lignes stockent encore l'URL absolue
  // d'époque (`http://localhost:5000/uploads/...`, ancien domaine) alors que
  // la requête arrive en chemin canonique. Repli par nom de fichier,
  // avatars uniquement (les CV restent en comparaison exacte).
  if (!profile && isMedia) {
    const filename = storedPath.split('/').pop();
    if (filename) {
      profile = await prisma.candidateProfile.findFirst({
        where: { [field]: { endsWith: `/${filename}` } },
        select: { id: true, userId: true },
      });
    }
  }

  // Fichier référencé par une candidature mais absent du profil (cas
  // historique : un CV déposé directement sur une candidature).
  let application = null;
  if (isCv && !profile) {
    application = await prisma.application.findFirst({
      where: { cvUrl: storedPath },
      select: { id: true, candidateProfileId: true },
    });
  }

  if (!profile && !application) {
    return { allowed: false, reason: 'FICHIER_INCONNU' };
  }

  // Avatar : tout utilisateur authentifié (le middleware a déjà vérifié le
  // JWT + tokenVersion). Le fichier reste inconnu s'il n'est référencé
  // nulle part, mais aucun lien de candidature n'est exigé.
  if (isMedia) {
    return { allowed: true, reason: profile && profile.userId === user.userId ? 'PROPRIETAIRE' : 'AVATAR_AUTHENTIFIE' };
  }

  // Ci-dessous : CV uniquement — modèle strict inchangé.
  // Propriétaire du fichier.
  if (profile && profile.userId === user.userId) {
    return { allowed: true, reason: 'PROPRIETAIRE' };
  }
  if (user.role === ROLE_CANDIDATE || user.role === ROLE_EMPLOYEE) {
    // Le propriétaire est déjà passé : un tiers ne passe pas.
    return { allowed: false, reason: 'PAS_PROPRIETAIRE' };
  }

  if (user.role === ROLE_RECRUITER) {
    if (profile) {
      const reach = await recruiterCanReachCandidate(user.userId, profile.id);
      return reach
        ? { allowed: true, reason: 'RECRUITER_CANDIDATURE' }
        : { allowed: false, reason: 'RECRUITER_SANS_CANDIDATURE' };
    }
    if (application) {
      const reach = await recruiterCanReachCandidate(user.userId, application.candidateProfileId);
      return reach
        ? { allowed: true, reason: 'RECRUITER_CANDIDATURE' }
        : { allowed: false, reason: 'RECRUITER_SANS_CANDIDATURE' };
    }
  }

  return { allowed: false, reason: 'ROLE_INSUFFISANT' };
}

/**
 * Middleware : protège `/uploads/cvs/**` et `/uploads/candidates/**`.
 *
 * Le débit d'accès à ce chemin est bridé par `uploadServingLimiter` monté sur
 * `/uploads` dans `app.js` : sans lui, une requête non autorisée coûtait déjà
 * une vérification JWT en base, et l Bronx était un vecteur de consommation de
 * bande passante non mété.
 */
const uploadAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  } else {
    token = getAccessTokenFromCookies(req.cookies);
  }
  if (!token) return res.status(401).json({ error: 'Accès non autorisé.' });

  if (!process.env.JWT_SECRET) {
    // Échec fermé : ne jamais valider localement un jeton sans secret.
    return res.status(500).json({ error: 'Service temporairement indisponible.' });
  }

  let user;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded?.userId) return res.status(401).json({ error: 'Token invalide.' });
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Session révoquée.' });
    }
  } catch {
    return res.status(401).json({ error: 'Token invalide.' });
  }

  const storedPath = storedPathFromRequest(req);
  if (!storedPath) {
    return res.status(400).json({ error: 'Chemin de fichier invalide.' });
  }

  const decision = await authorizeStoredFile({ userId: user.id, role: user.role }, storedPath)
    .catch((error) => {
      // Fail-closed : une erreur d'autorisation vaut refus, jamais accès.
      // Le journalisation passe par `utils/logger` (cf. `errors.js`) et non
      // `console.error`, pour rester dans le flux JSON et suivre `LOG_LEVEL` :
      // une panne d'autorisation de fichier est exactement ce qu'un opérateur
      // doit pouvoir remonter, et un `console.error` échappait aux deux.
      logger.exception(error, {
        message: 'uploadAuth: erreur inattendue',
        scope: 'uploadAuth',
      });
      return { allowed: false, reason: 'ERREUR' };
    });

  if (decision.allowed) {
    req.uploadDecision = decision;
    return next();
  }
  // 403 (et non 404) : l'appelant est authentifié, il n'a simplement pas le
  // droit. On ne révèle pas si la ressource existe.
  return res.status(403).json({ error: 'Accès refusé à ce fichier.' });
};

module.exports = {
  uploadAuth,
  // Exports pour les tests unitaires (logique pure, sans base).
  authorizeStoredFile,
  storedPathFromRequest,
  isCvPath,
  isCandidateMediaPath,
};
