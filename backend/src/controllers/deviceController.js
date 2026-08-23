const prisma = require('../config/prisma');

// ============================================================
// TOKENS D'APPAREILS (push FCM)
// Le userId est TOUJOURS déduit du token authentifié.
// ============================================================

const PLATFORMS = new Set(['android', 'ios', 'web']);

function cleanToken(value) {
  return typeof value === 'string' ? value.trim() : '';
}

exports.register = async (req, res) => {
  try {
    const token = cleanToken(req.body?.token);
    if (!token || token.length > 4096) {
      return res.status(400).json({ error: 'Token appareil invalide.' });
    }
    const platform = PLATFORMS.has(req.body?.platform) ? req.body.platform : 'android';

    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.user.userId, platform },
      create: { token, userId: req.user.userId, platform },
    });
    res.json({ message: 'Appareil enregistré.' });
  } catch (error) {
    console.error('Erreur devices.register:', error);
    res.status(500).json({ error: "Impossible d'enregistrer l'appareil." });
  }
};

exports.unregister = async (req, res) => {
  try {
    const token = cleanToken(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Token appareil invalide.' });

    // Sécurité : on ne supprime que le token APPARTENANT à l'utilisateur.
    await prisma.deviceToken.deleteMany({
      where: { token, userId: req.user.userId },
    });
    res.json({ message: 'Appareil désenregistré.' });
  } catch (error) {
    console.error('Erreur devices.unregister:', error);
    res.status(500).json({ error: "Impossible de désenregistrer l'appareil." });
  }
};
