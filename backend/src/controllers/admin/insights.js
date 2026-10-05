// Domaine « pilotage » : activité, notifications, analytiques, modération.
const {
  prisma, DAY_MS, paginate, paginated, candidateName,
} = require('./_shared');
const logger = require('../../utils/logger');

async function buildEventFeed(limit) {
  const [users, jobs, applications, messages, interviews] = await Promise.all([
    prisma.user.findMany({ take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, createdAt: true } }),
    prisma.job.findMany({ take: limit, orderBy: { createdAt: 'desc' }, include: { company: { select: { name: true } } } }),
    prisma.application.findMany({ take: limit, orderBy: { createdAt: 'desc' }, include: { candidate: true, job: { select: { title: true } } } }),
    prisma.message.findMany({ take: limit, orderBy: { createdAt: 'desc' }, include: { sender: { select: { email: true, role: true } } } }),
    prisma.interview.findMany({ take: limit, orderBy: { updatedAt: 'desc' }, include: { application: { include: { candidate: true, job: { select: { title: true } } } } } }),
  ]);

  return [
    ...users.map((u) => ({ actor: u.email, action: 'Inscription', resource: `Compte ${u.role.toLowerCase()}`, status: 'success', createdAt: u.createdAt })),
    ...jobs.map((j) => ({ actor: j.company?.name || 'Entreprise', action: 'Publication d’offre', resource: j.title, status: 'success', createdAt: j.createdAt })),
    ...applications.map((a) => ({ actor: candidateName(a.candidate), action: 'Candidature envoyée', resource: a.job?.title || 'Offre', status: a.status === 'REJECTED' ? 'failure' : 'success', createdAt: a.createdAt })),
    ...messages.map((m) => ({ actor: m.sender?.email || 'Utilisateur', action: 'Message envoyé', resource: 'Messagerie', status: 'success', createdAt: m.createdAt })),
    ...interviews.map((i) => ({ actor: candidateName(i.application?.candidate), action: 'Entretien planifié', resource: i.application?.job?.title || 'Offre', status: 'success', createdAt: i.updatedAt })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

exports.activity = async (req, res) => {
  try {
    res.json(await buildEventFeed(60));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin activity:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger l’activité.' });
  }
};

exports.audit = exports.activity;

exports.notifications = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { email: true, role: true } } },
      }),
      prisma.notification.count(),
    ]);
    res.json(paginated(rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.body,
      category: (n.type || 'GENERAL').toLowerCase(),
      read: n.isRead,
      recipient: n.user?.email || null,
      createdAt: n.createdAt,
    })), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin notifications:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les notifications.' });
  }
};

exports.analytics = async (req, res) => {
  try {
    const now = new Date().toISOString();
    const [users, candidates, employees, recruiters, admins, companies, jobs, activeJobs, applications, interviews, recruitments, messages] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CANDIDATE' } }),
      prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      prisma.user.count({ where: { role: 'RECRUITER' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.company.count(),
      prisma.job.count(),
      prisma.job.count({ where: { isOpen: true } }),
      prisma.application.count(),
      prisma.interview.count({ where: { scheduledAt: { not: null } } }),
      prisma.employment.count(),
      prisma.message.count(),
    ]);
    res.json([
      { label: 'Utilisateurs inscrits', value: users, period: 'total', updatedAt: now },
      { label: 'Candidats', value: candidates, period: 'total', updatedAt: now },
      { label: 'Employés', value: employees, period: 'total', updatedAt: now },
      { label: 'Recruteurs', value: recruiters, period: 'total', updatedAt: now },
      { label: 'Administrateurs', value: admins, period: 'total', updatedAt: now },
      { label: 'Entreprises présentes', value: companies, period: 'total', updatedAt: now },
      { label: 'Offres publiées', value: jobs, period: 'total', updatedAt: now },
      { label: 'Offres actives', value: activeJobs, period: 'total', updatedAt: now },
      { label: 'Candidatures reçues', value: applications, period: 'total', updatedAt: now },
      { label: 'Entretiens planifiés', value: interviews, period: 'total', updatedAt: now },
      { label: 'Recrutements finalisés', value: recruitments, period: 'total', updatedAt: now },
      { label: 'Messages échangés', value: messages, period: 'total', updatedAt: now },
    ]);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin analytics:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
};

function changeLabel(current, previous) {
  if (!previous) return current > 0 ? '+100%' : '0%';
  const delta = Math.round(((current - previous) / previous) * 100);
  return `${delta >= 0 ? '+' : ''}${delta}%`;
}

exports.trends = async (req, res) => {
  try {
    const now = Date.now();
    const currentStart = new Date(now - 30 * DAY_MS);
    const previousStart = new Date(now - 60 * DAY_MS);

    const [usersNow, usersPrev, jobsNow, jobsPrev, appsNow, appsPrev, msgsNow, msgsPrev] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: currentStart } } }),
      prisma.user.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
      prisma.job.count({ where: { createdAt: { gte: currentStart } } }),
      prisma.job.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
      prisma.application.count({ where: { createdAt: { gte: currentStart } } }),
      prisma.application.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
      prisma.message.count({ where: { createdAt: { gte: currentStart } } }),
      prisma.message.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
    ]);

    res.json([
      { label: 'Nouvelles inscriptions', value: usersNow, period: '30 jours vs 30 précédents', trend: changeLabel(usersNow, usersPrev) },
      { label: 'Offres publiées', value: jobsNow, period: '30 jours vs 30 précédents', trend: changeLabel(jobsNow, jobsPrev) },
      { label: 'Candidatures reçues', value: appsNow, period: '30 jours vs 30 précédents', trend: changeLabel(appsNow, appsPrev) },
      { label: 'Messages échangés', value: msgsNow, period: '30 jours vs 30 précédents', trend: changeLabel(msgsNow, msgsPrev) },
    ]);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin trends:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les tendances.' });
  }
};

exports.reportsAnalytics = async (req, res) => {
  try {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [byStatus, byMode, topCompanies] = await Promise.all([
      prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.interview.groupBy({ by: ['mode'], _count: { _all: true } }),
      prisma.company.findMany({ take: 5, orderBy: { jobs: { _count: 'desc' } }, select: { name: true, _count: { select: { jobs: true } } } }),
    ]);
    res.json([
      { label: `Candidatures par statut (${byStatus.map((g) => `${g.status}: ${g._count._all}`).join(', ') || 'aucune'})`, period: 'global', status: 'ready', createdAt: now },
      { label: `Entretiens par mode (${byMode.map((g) => `${g.mode}: ${g._count._all}`).join(', ') || 'aucun'})`, period: 'global', status: 'ready', createdAt: now },
      { label: `Top entreprises par offres (${topCompanies.map((c) => `${c.name}: ${c._count.jobs}`).join(', ') || 'aucune'})`, period: 'global', status: 'ready', createdAt: now },
      { label: 'Activité des 30 derniers jours', period: '30 jours', status: 'ready', createdAt: now, data: { since: since.toISOString() } },
    ]);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin reportsAnalytics:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les rapports.' });
  }
};

exports.moderation = async (req, res) => {
  try {
    const pending = await prisma.company.findMany({
      where: { isApproved: false },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(pending.map((c) => ({
      id: c.id,
      type: 'Entreprise',
      resource: c.name,
      author: c.user?.email || null,
      priority: 'high',
      status: 'new',
      createdAt: c.createdAt,
    })));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin moderation:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger la file de modération.' });
  }
};
