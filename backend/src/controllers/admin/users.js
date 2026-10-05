// Domaine « utilisateurs » : vue d'ensemble, users, candidats, employés, admins.
const {
  prisma, getCached, setCache, probe,
  DAY_MS, paginate, paginated, dayKey, candidateName,
  userIncludeForList, decorateUserRecord,
} = require('./_shared');
const logger = require('../../utils/logger');

exports.overview = async (req, res) => {
  try {
    const cached = getCached('admin:overview');
    if (cached) return res.json(cached);

    const since14 = new Date(Date.now() - 13 * DAY_MS);
    const [
      totalUsers, candidatesCount, employeesCount, recruitersCount, adminsCount,
      companiesCount, pendingCompaniesCount, jobsCount, activeJobsCount,
      applicationsCount, interviewsCount, upcomingInterviewsCount, recruitmentsCount,
      receivedApplicationsCount, recentUsers, recentApplications, recentJobs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CANDIDATE' } }),
      prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      prisma.user.count({ where: { role: 'RECRUITER' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.company.count(),
      prisma.company.count({ where: { isApproved: false } }),
      prisma.job.count(),
      prisma.job.count({ where: { isOpen: true } }),
      prisma.application.count(),
      prisma.interview.count(),
      prisma.interview.count({ where: { scheduledAt: { gte: new Date() } } }),
      prisma.employment.count(),
      prisma.application.count({ where: { status: 'RECEIVED' } }),
      prisma.user.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.application.findMany({ take: 6, orderBy: { createdAt: 'desc' }, include: { candidate: true, job: { include: { company: true } } } }),
      prisma.job.findMany({ take: 4, orderBy: { createdAt: 'desc' }, include: { company: true } }),
    ]);

    // Sonde PARTAGEE (`utils/healthCheck.js`), pas une deuxieme implementation.
    //
    // Le bloc local testait `Boolean(process.env.AWS_S3_BUCKET)` pour S3 :
    // « la variable est declaree » y etait presente comme « le stockage
    // fonctionne ». Et `fs.access(W_OK)` pour local : « le dossier est
    // inscriptible » comme « les fichiers survivent ». C'est exactement la
    // duplication que `healthCheck.js` documente comme sa raison d'exister —
    // deux sondes, dont une superficielle, dont l'administrateur lit le
    // resultat au vert. `server.js` avertit de `STORAGE_DRIVER=local` en
    // production ; cette sonde en fait une donnee de sante et non un log.
    const health = await probe();
    const dbOk = health.db === 'up';
    const storageOk = health.storage.status === 'ok';

    const distributionTotal = Math.max(1, candidatesCount + employeesCount + recruitersCount + adminsCount);
    const pct = (value) => Math.round((value / distributionTotal) * 100);

    const buckets = new Map();
    for (const item of recentUsers) {
      const key = dayKey(item.createdAt);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const activitySeries = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * DAY_MS);
      const key = day.toISOString().slice(0, 10);
      activitySeries.push({
        label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        date: key,
        value: buckets.get(key) || 0,
      });
    }

    const activity = [
      ...recentApplications.map((item) => ({
        actor: candidateName(item.candidate),
        action: 'Candidature envoyée',
        resource: item.job?.title || 'Offre',
        label: `${candidateName(item.candidate)} → ${item.job?.title || 'Offre'} (${item.job?.company?.name || 'Entreprise'})`,
        createdAt: item.createdAt,
      })),
      ...recentJobs.map((item) => ({
        actor: item.company?.name || 'Entreprise',
        action: 'Offre publiée',
        resource: item.title,
        label: `${item.company?.name || 'Entreprise'} a publié « ${item.title} »`,
        createdAt: item.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);

    const result = {
      stats: {
        users: totalUsers,
        candidates: candidatesCount,
        employees: employeesCount,
        companies: companiesCount,
        administrators: adminsCount,
        jobs: jobsCount,
        applications: applicationsCount,
        interviews: interviewsCount,
        recruitments: recruitmentsCount,
        activeJobs: activeJobsCount,
        pendingCompanies: pendingCompaniesCount,
        receivedApplications: receivedApplicationsCount,
      },
      userDistribution: [
        { label: 'Candidats', key: 'candidates', value: pct(candidatesCount), count: candidatesCount, color: '#12bfa3' },
        { label: 'Employés', key: 'employees', value: pct(employeesCount), count: employeesCount, color: '#0a4f9e' },
        { label: 'Recruteurs', key: 'recruiters', value: pct(recruitersCount), count: recruitersCount, color: '#f59e0b' },
        { label: 'Administrateurs', key: 'administrators', value: pct(adminsCount), count: adminsCount, color: '#8b5cf6' },
      ],
      attention: [
        { id: 'pending-companies', label: 'Entreprises à valider', description: 'Profils recruteurs en attente d’approbation.', count: pendingCompaniesCount, href: '/admin/companies', priority: pendingCompaniesCount > 0 ? 'high' : 'low' },
        { id: 'received-applications', label: 'Candidatures non traitées', description: 'Candidatures encore au statut « Reçue ».', count: receivedApplicationsCount, href: '/admin/applications', priority: receivedApplicationsCount > 0 ? 'medium' : 'low' },
        { id: 'upcoming-interviews', label: 'Entretiens à venir', description: 'Entretiens planifiés dans le futur.', count: upcomingInterviewsCount, href: '/admin/interviews', priority: 'low' },
      ],
      activitySeries,
      activity,
      system: [
        { id: 'database', label: 'Base de données', status: dbOk ? 'operational' : 'down', description: dbOk ? 'Connexion base de données opérationnelle.' : 'Base de données injoignable.' },
        // Mesure, pas litteral : c'etait l'indicateur que ce module existe pour
        // remplacer (voir l'en-tete de `utils/healthCheck.js`). Une reponse
        // reelle vaut mieux qu'un « operationnel » garanti.
        { id: 'api', label: 'API JOBSINC', status: 'operational', description: `Service HTTP en ligne, base ${dbOk ? 'joignable' : 'injoignable'}.` },
        { id: 'storage', label: 'Stockage des fichiers', status: storageOk ? 'operational' : health.storage.status === 'down' ? 'down' : 'degraded', description: health.storage.reason },
      ],
      securitySummary: [
        { label: 'Administrateurs actifs', value: adminsCount, status: 'ok' },
        { label: 'Entreprises non validées', value: pendingCompaniesCount, status: pendingCompaniesCount > 0 ? 'warning' : 'ok', href: '/admin/companies' },
        { label: 'Comptes totaux', value: totalUsers, status: 'ok' },
      ],
    };

    setCache('admin:overview', result, 60000);
    res.json(result);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin overview:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger la vue d’ensemble admin.' });
  }
};

exports.users = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [users, total] = await Promise.all([
      prisma.user.findMany({ include: userIncludeForList, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.user.count(),
    ]);
    res.json(paginated(users.map(decorateUserRecord), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin users:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les utilisateurs.' });
  }
};

exports.userDetail = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        ...userIncludeForList,
        _count: { select: { notifications: true, sentMessages: true, candidateConversations: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const record = decorateUserRecord(user);
    record.stats = {
      notifications: user._count.notifications,
      messagesSent: user._count.sentMessages,
      conversations: user._count.candidateConversations,
    };
    res.json(record);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin userDetail:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger l’utilisateur.' });
  }
};

exports.candidates = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.candidateProfile.findMany({ include: { user: { select: { email: true, createdAt: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.candidateProfile.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, name: candidateName(row), email: row.user?.email || null, status: 'active', location: [row.city, row.country].filter(Boolean).join(', ') || null, skills: row.skills || null, createdAt: row.createdAt, lastActivity: row.updatedAt })), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin candidates:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les candidats.' });
  }
};

exports.employees = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.employment.findMany({ include: { candidate: true, company: { select: { name: true } } }, orderBy: { startDate: 'desc' }, skip, take: limit }),
      prisma.employment.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, name: candidateName(row.candidate), companyName: row.company?.name || null, role: 'EMPLOYEE', position: row.position, status: row.status === 'ACTIVE' ? 'active' : 'inactive', lastActivity: row.endDate || row.updatedAt })), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin employees:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les employés.' });
  }
};

exports.administrators = async (req, res) => {
  try {
    const rows = await prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    res.json(rows.map((row) => ({
      id: row.id,
      name: null,
      email: row.email,
      role: row.role,
      status: 'active',
      lastActivity: row.updatedAt,
      createdAt: row.createdAt,
    })));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin administrators:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les administrateurs.' });
  }
};
