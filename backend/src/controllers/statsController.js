const prisma = require('../config/prisma');

exports.getStats = async (_req, res) => {
  try {
    const [talents, companies, jobs, applications] = await Promise.all([
      prisma.candidateProfile.count(),
      prisma.company.count(),
      prisma.job.count({ where: { isOpen: true } }),
      prisma.application.count(),
    ]);
    return res.json({ talents, companies, jobs, applications });
  } catch (error) {
    console.error('Erreur stats:', error);
    return res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
};
