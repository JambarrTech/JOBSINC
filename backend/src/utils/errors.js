class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
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

function handleError(err, res) {
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

  console.error('Erreur non gérée:', err);
  return res.status(500).json({ error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' });
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