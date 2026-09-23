const prisma = require('../config/prisma');

// ============================================================
// APPROBATION D'ENTREPRISE
// Bloque les actions métier tant que Company.isApproved est false.
// La validation est relue en base à CHAQUE requête (jamais depuis le
// JWT) pour que l'approbation par un admin prenne effet immédiatement.
//
// Le profil (GET/PUT), le dépôt d'images et de logo restent autorisés
// avant approbation pour permettre aux recruteurs de compléter leur
// dossier pendant la modération.
// ============================================================

module.exports = async (req, res, next) => {
  if (req.user?.role === 'ADMIN') return next();
  if (req.user?.role !== 'RECRUITER') {
    return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { userId: req.user.userId },
      select: { isApproved: true },
    });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    if (!company.isApproved) {
      return res.status(403).json({
        error: 'Votre entreprise est en attente de validation par un administrateur.',
      });
    }
    return next();
  } catch (error) {
    console.error('Erreur middleware approbation entreprise:', error);
    return res.status(500).json({ error: "Impossible de vérifier le statut de l'entreprise." });
  }
};