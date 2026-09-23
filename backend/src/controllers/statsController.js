const prisma = require('../config/prisma');

exports.getStats = async (_req, res) => {
  try {
    const [talents, companies, jobs, applications] = await Promise.all([
      prisma.candidateProfile.count(),
      prisma.company.count({ where: { isApproved: true } }),
      prisma.job.count({ where: { isOpen: true, company: { isApproved: true } } }),
      prisma.application.count(),
    ]);
    return res.json({ talents, companies, jobs, applications });
  } catch (error) {
    console.error('Erreur stats:', error);
    return res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
};

exports.getOverview = async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      talentsCount,
      talentsThisMonth,
      talentsPrevMonth,
      activeJobs,
      applicationsToday,
      recentCandidates,
      activity,
    ] = await Promise.all([
      prisma.candidateProfile.count(),
      prisma.candidateProfile.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.candidateProfile.count({ where: { createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
      prisma.job.count({ where: { isOpen: true, company: { isApproved: true } } }),
      prisma.application.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
      prisma.candidateProfile.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          firstName: true,
          lastName: true,
          educationField: true,
          experienceYears: true,
          city: true,
        },
      }),
      (async () => {
        const weekPromises = [];
        for (let i = 4; i >= 0; i--) {
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() - i * 7);
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekStart.getDate() - 7);
          weekPromises.push(
            prisma.application.count({ where: { createdAt: { gte: weekStart, lt: weekEnd } } })
          );
        }
        return Promise.all(weekPromises);
      })(),
    ]);

    const growth = talentsPrevMonth > 0
      ? Math.round(((talentsThisMonth - talentsPrevMonth) / talentsPrevMonth) * 100)
      : talentsThisMonth > 0 ? 100 : 0;

    const maxActivity = Math.max(...activity, 1);
    const activityPct = activity.map((v) => Math.round((v / maxActivity) * 100));

    const candidates = recentCandidates.map((c) => {
      const initials = `${(c.firstName || '')[0] || ''}${(c.lastName || '')[0] || ''}`.toUpperCase();
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Candidat';
      const detail = c.educationField || (c.experienceYears ? `${c.experienceYears} ans d'expérience` : c.city || '');
      return { initials, name, detail };
    });

    return res.json({
      talents: talentsCount,
      growth,
      activeJobs,
      applicationsToday,
      candidates,
      activity: activityPct,
    });
  } catch (error) {
    console.error('Erreur overview stats:', error);
    return res.status(500).json({ error: 'Impossible de charger l\'aperçu.' });
  }
};
