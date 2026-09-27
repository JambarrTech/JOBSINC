const logger = require('./logger');

class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    // `name` n'était jamais positionné : toutes les erreurs applicatives
    // se présentaient comme 'Error'. Conséquences réelles :
    //  - les agrégateurs de logs ne pouvaient pas les regrouper par type ;
    //  - `isLikelyClientError` teste `err.name` et ne pouvait donc pas
    //    distinguer une ValidationError d'une panne serveur.
    this.name = new.target.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Non authentifié') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflit de données') {
    super(message, 409, 'CONFLICT');
  }
}

function isAppError(err) {
  return err instanceof AppError;
}

function handleError(err, res, req) {
  if (isAppError(err)) {
    const response = { error: err.message };
    if (err.code) response.code = err.code;
    if (err.details) response.details = err.details;
    return res.status(err.statusCode).json(response);
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR', details: err.errors });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Cette valeur est déjà utilisée.', code: 'DUPLICATE_ENTRY' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Enregistrement introuvable.', code: 'NOT_FOUND' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'Référence invalide (clé étrangère).', code: 'FOREIGN_KEY_ERROR' });
    }
    if (err.code === 'P2014') {
      return res.status(400).json({ error: 'Relation invalide.', code: 'RELATION_ERROR' });
    }
    if (err.code === 'P2024') {
      return res.status(503).json({ error: 'Service temporairement indisponible, réessayez.', code: 'POOL_TIMEOUT' });
    }
  }
  if (err.code === 'P1001' || err.code === 'P1000') {
    return res.status(503).json({ error: 'Base de données temporairement indisponible.', code: 'DB_UNAVAILABLE' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token invalide.', code: 'INVALID_TOKEN' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Session expirée.', code: 'TOKEN_EXPIRED' });
  }

  // Erreur non-Application remontée au handler global : c'est souvent une
  // erreur « fonctionnelle » (mauvais JSON, valeur absente, type invalide)
  // qui ne doit pas être exposée comme une panne 500. On ne traite pas comme
  // erreur client ce qui ressemble à une panne (DB, réseau, null/undefined).
  const statusCode = isLikelyClientError(err) ? 400 : 500;
  // `reqId` est posé par le middleware de logging de app.js. Sans le propager
  // ici, chaque 500 s'affichait `[ERR no-id]` et ne pouvait pas être relié à la
  // ligne correspondante du access log.
  const reqId = req?.id || err.reqId || 'no-id';
  // Même schéma que le access log (voir `utils/logger.js`) : une seule requête
  // produit maintenant deux lignes JSON partageant le même `requestId`, donc
  // corrélables mécaniquement et non à la main. Le `path` est ajouté pour qu'une
  // ligne d'erreur soit exploitable même si la ligne d'accès a été échantillonnée.
  const context = {
    requestId: reqId,
    method: req?.method,
    path: req?.originalUrl,
    userId: req?.user?.userId,
  };
  if (statusCode === 500) {
    logger.exception(err, { ...context, message: err.message, scope: err.name });
  } else {
    logger.warn({ ...context, message: err.message, scope: err.name, code: 'BAD_REQUEST' });
  }
  return res.status(statusCode).json({
    error: statusCode === 500 ? 'Erreur serveur interne.' : 'Requête invalide.',
    code: statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
  });
}

/**
 * Distingue une erreur « client » d'une panne serveur.
 *
 * Un `new Error(...)` à usage de contrôle de flux (mauvais body JSON, champ
 * manquant, identifiant malformé) est remonté tel quel par les controllers.
 * Lui renvoyer 500 empujait l'API à annoncer une panne pour une simple saisie
 * invalide, et empoisonnait les logs d'alerte. On ne traite PAS comme client
 * error ce qui ressemble à une panne (null, undefined, erreur réseau, DB).
 */
function isLikelyClientError(err) {
  if (!err || typeof err !== 'object') return false;
  const name = err.name;
  if (name === 'SyntaxError') return true; // JSON malformé
  if (name === 'TypeError' || name === 'RangeError') return true;
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) return true;
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) return true;
  // Les erreurs avec un code Prisma/entête connue ont déjà été traitées
  // ci-dessus : si on arrive ici c'est une panne.
  return false;
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  isAppError,
  handleError,
};