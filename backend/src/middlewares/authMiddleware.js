const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { getAccessTokenFromCookies } = require('../utils/tokenCookies');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  // Fallback HttpOnly cookie (web BFF) — la liste des noms vit dans
  // utils/tokenCookies pour rester alignée avec le guard CSRF de app.js.
  return getAccessTokenFromCookies(req.cookies);
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

    // Le rôle est RELU EN BASE, et non pris du JWT.
    //
    // Prendre `decoded.role` revenait à faire confiance au contenu du jeton
    // pendant toute sa durée de vie (15 min, `ACCESS_TOKEN_TTL`). Une
    // rétrogradation de rôle faite directement en base laissait donc l'ancien
    // rôle actif jusqu'à expiration — alors que le rôle est utilisé pour
    // AUTORISER (`adminMiddleware`, `companyController`, `applicationController`,
    // `interviewController`…).
    //
    // `uploadAuth.js` faisait déjà la bonne chose (`select: { tokenVersion, role }`).
    // On aligne le middleware d'authentification sur ce modèle : une seule
    // requête, deux champs, et aucune fenêtre de désynchronisation.
    //
    // Le coût est nul : la requête existait déjà pour `tokenVersion`, on
    // demande simplement une colonne de plus.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Compte introuvable.' });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Session révoquée. Veuillez vous reconnecter.' });
    }

    req.user = {
      userId,
      // Rôle de la base, source de vérité. Le rôle du JWT est ignoré.
      role: user.role,
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
