const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7, authHeader.length)
      : authHeader;

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
    return res.status(401).json({ error: 'Votre session n\'est pas valide.' });
  }
};
