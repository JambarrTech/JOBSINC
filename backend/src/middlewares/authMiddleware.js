const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  // Fallback HttpOnly cookie (web BFF) — supporte migration localStorage -> cookie
  if (req.cookies) {
    if (req.cookies.jobsinc_token) return req.cookies.jobsinc_token;
    if (req.cookies.accessToken) return req.cookies.accessToken;
    if (req.cookies.token) return req.cookies.token;
  }
  return null;
}

module.exports = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
    }

    if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'Configuration de sécurité incomplète.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userId = decoded.userId || decoded.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Compte introuvable.' });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Session révoquée. Veuillez vous reconnecter.' });
    }

    req.user = {
      userId,
      role: decoded.role,
      tokenVersion: decoded.tokenVersion,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Votre session a expiré.' });
    }
    if (error.code === 'P1001' || error.code === 'P2024' || error.code === 'P1000') {
      console.error('Auth middleware DB unreachable:', error.message);
      return res.status(503).json({ error: 'Service temporairement indisponible, réessayez.' });
    }
    return res.status(401).json({ error: 'Votre session n\'est pas valide.' });
  }
};
