const prisma = require('../config/prisma');
const fs = require('fs/promises');
const path = require('path');
const { getCached, setCache } = require('../utils/cache');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');

const DAY_MS = 86400000;

function paginate(req) {
  return parsePagination(req.query);
}

function paginated(data, total, page, limit) {
  return buildPaginationResponse(data, total, page, limit);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function candidateName(candidate) {
  if (!candidate) return 'Utilisateur';
  return `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Utilisateur';
}

function baseUserRecord(user) {
  const name = [user.candidate?.firstName, user.candidate?.lastName].filter(Boolean).join(' ') || null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name,
    firstName: user.candidate?.firstName || null,
    lastName: user.candidate?.lastName || null,
    phone: user.candidate?.phone || null,
    status: 'active',
    createdAt: user.createdAt,
    registeredAt: user.createdAt,
    lastActivity: user.updatedAt,
    lastLogin: null,
  };
}

const userIncludeForList = {
  candidate: {
    include: {
      employments: { take: 1, orderBy: { startDate: 'desc' }, include: { company: { select: { name: true } } } },
    },
  },
  company: { select: { id: true, name: true, sector: true, city: true, country: true, isApproved: true } },
};

function decorateUserRecord(user) {
  const record = baseUserRecord(user);
  if (user.company) {
    record.companyName = user.company.name;
    record.company = user.company.name;
    record.sector = user.company.sector || null;
    record.location = [user.company.city, user.company.country].filter(Boolean).join(', ') || null;
    record.status = user.company.isApproved ? 'active' : 'pending';
  }
  if (user.role === 'EMPLOYEE' && user.candidate?.employments?.length) {
    record.companyName = user.candidate.employments[0].company?.name || null;
    record.company = record.companyName;
  }
  return record;
}

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

    let dbOk = true;
    try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
    let storageOk = true;
    if ((process.env.STORAGE_DRIVER || 'local') === 's3') {
      storageOk = Boolean(process.env.AWS_S3_BUCKET);
    } else {
      // Vercel : /tmp/uploads est le dossier écrivable, sinon ./uploads
      const candidates = process.env.VERCEL
        ? [path.join('/tmp', 'uploads'), path.join(__dirname, '../../uploads')]
        : [path.join(__dirname, '../../uploads'), path.join('/tmp', 'uploads')];
      storageOk = false;
      for (const p of candidates) {
        try { await fs.access(p, fs.constants.W_OK); storageOk = true; break; } catch {}
      }
      if (!storageOk && process.env.VERCEL) {
        try { await fs.mkdir(path.join('/tmp', 'uploads'), { recursive: true }); await fs.access(path.join('/tmp', 'uploads'), fs.constants.W_OK); storageOk = true; } catch {}
      }
    }

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
        { id: 'api', label: 'API JOBSINC', status: 'operational', description: 'Service HTTP en ligne.' },
        { id: 'storage', label: 'Stockage des fichiers', status: storageOk ? 'operational' : 'degraded', description: storageOk ? 'Dossier uploads accessible en écriture.' : 'Dossier uploads inaccessible.' },
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
    console.error('Erreur admin overview:', error);
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
    console.error('Erreur admin users:', error);
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
    console.error('Erreur admin userDetail:', error);
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
    console.error('Erreur admin candidates:', error);
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
    console.error('Erreur admin employees:', error);
    res.status(500).json({ error: 'Impossible de charger les employés.' });
  }
};

exports.companies = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.company.findMany({ include: { user: { select: { email: true } }, _count: { select: { jobs: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.company.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, name: row.name, email: row.user?.email || null, sector: row.sector || null, location: [row.city, row.country].filter(Boolean).join(', ') || null, status: row.isApproved ? 'active' : 'pending', jobsCount: row._count.jobs, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    console.error('Erreur admin companies:', error);
    res.status(500).json({ error: 'Impossible de charger les entreprises.' });
  }
};

exports.approveCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { isApproved: true },
      include: { user: { select: { email: true } } },
    });

    res.json({ message: 'Entreprise approuvée.', id: updated.id, name: updated.name, isApproved: updated.isApproved });
  } catch (error) {
    console.error('Erreur approveCompany:', error);
    res.status(500).json({ error: "Impossible d'approuver l'entreprise." });
  }
};

exports.rejectCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { isApproved: false },
      include: { user: { select: { email: true } } },
    });

    res.json({ message: 'Entreprise rejetée.', id: updated.id, name: updated.name, isApproved: updated.isApproved });
  } catch (error) {
    console.error('Erreur rejectCompany:', error);
    res.status(500).json({ error: "Impossible de rejeter l'entreprise." });
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
    console.error('Erreur admin administrators:', error);
    res.status(500).json({ error: 'Impossible de charger les administrateurs.' });
  }
};

exports.jobs = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.job.findMany({ include: { company: { select: { name: true } }, _count: { select: { applications: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, title: row.title, companyName: row.company?.name || null, location: row.location, status: row.isOpen ? 'active' : 'closed', applicationsCount: row._count.applications, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    console.error('Erreur admin jobs:', error);
    res.status(500).json({ error: 'Impossible de charger les offres.' });
  }
};

exports.applications = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.application.findMany({ include: { candidate: true, job: { include: { company: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.application.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, candidateName: candidateName(row.candidate), companyName: row.job?.company?.name || null, jobTitle: row.job?.title || null, status: row.status, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    console.error('Erreur admin applications:', error);
    res.status(500).json({ error: 'Impossible de charger les candidatures.' });
  }
};

exports.interviews = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.interview.findMany({ include: { application: { include: { candidate: true, job: { include: { company: { select: { name: true } } } } } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.interview.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, candidateName: candidateName(row.application?.candidate), companyName: row.application?.job?.company?.name || null, jobTitle: row.application?.job?.title || null, mode: row.mode, scheduledAt: row.scheduledAt, status: row.scheduledAt ? 'scheduled' : 'pending', createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    console.error('Erreur admin interviews:', error);
    res.status(500).json({ error: 'Impossible de charger les entretiens.' });
  }
};

exports.recruitments = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.employment.findMany({ include: { candidate: true, company: { select: { name: true } }, job: { select: { title: true } } }, orderBy: { startDate: 'desc' }, skip, take: limit }),
      prisma.employment.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, candidateName: candidateName(row.candidate), companyName: row.company?.name || null, jobTitle: row.position || row.job?.title || null, status: row.status === 'ACTIVE' ? 'completed' : 'inactive', startDate: row.startDate, endDate: row.endDate, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    console.error('Erreur admin recruitments:', error);
    res.status(500).json({ error: 'Impossible de charger les recrutements.' });
  }
};

// Sections Admin sans source de données métier : réservées, retournées
// vides volontairement dans adminRoutes (aucune donnée inventée côté API).
exports.emptyResource = (req, res) => {
  res.json([]);
};

exports.search = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [], companies: [], jobs: [], applications: [] });
    const contains = { contains: q, mode: 'insensitive' };

    const [users, companies, jobs, applications] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { email: contains },
            { candidate: { OR: [{ firstName: contains }, { lastName: contains }] } },
          ],
        },
        take: 5,
        select: { id: true, email: true, role: true, candidate: { select: { firstName: true, lastName: true } } },
      }),
      prisma.company.findMany({
        where: { OR: [{ name: contains }, { sector: contains }, { city: contains }] },
        take: 5,
        select: { id: true, name: true, sector: true, city: true, isApproved: true },
      }),
      prisma.job.findMany({
        where: { OR: [{ title: contains }, { location: contains }] },
        take: 5,
        select: { id: true, title: true, location: true, isOpen: true, company: { select: { name: true } } },
      }),
      prisma.application.findMany({
        where: {
          OR: [
            { job: { title: contains } },
            { candidate: { OR: [{ firstName: contains }, { lastName: contains }] } },
          ],
        },
        take: 5,
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          job: { select: { title: true, company: { select: { name: true } } } },
        },
      }),
    ]);

    res.json({
      users: users.map((u) => ({ id: u.id, label: [u.candidate?.firstName, u.candidate?.lastName].filter(Boolean).join(' ') || u.email, sub: `${u.email} · ${u.role}`, href: `/admin/users/${u.id}` })),
      companies: companies.map((c) => ({ id: c.id, label: c.name, sub: [c.sector, c.city].filter(Boolean).join(' · '), href: '/admin/companies' })),
      jobs: jobs.map((j) => ({ id: j.id, label: j.title, sub: `${j.company?.name || 'Entreprise'} · ${j.location || ''}`, href: '/admin/jobs' })),
      applications: applications.map((a) => ({ id: a.id, label: candidateName(a.candidate), sub: `${a.job?.title || 'Offre'} · ${a.job?.company?.name || ''}`, href: '/admin/applications' })),
    });
  } catch (error) {
    console.error('Erreur admin search:', error);
    res.status(500).json({ error: 'Impossible d’effectuer la recherche.' });
  }
};

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
    console.error('Erreur admin activity:', error);
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
    console.error('Erreur admin notifications:', error);
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
    console.error('Erreur admin analytics:', error);
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
    console.error('Erreur admin trends:', error);
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
    console.error('Erreur admin reportsAnalytics:', error);
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
    console.error('Erreur admin moderation:', error);
    res.status(500).json({ error: 'Impossible de charger la file de modération.' });
  }
};

exports.system = async (req, res) => {
  try {
    const checkedAt = new Date().toISOString();
    let dbStatus = 'operational';
    let dbLatency = '—';
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = `${Date.now() - start} ms`;
    } catch {
      dbStatus = 'down';
    }

    let storageStatus = 'operational';
    if ((process.env.STORAGE_DRIVER || 'local') === 's3') {
      storageStatus = process.env.AWS_S3_BUCKET ? 'operational' : 'degraded';
    } else {
      const candidates = process.env.VERCEL
        ? [path.join('/tmp', 'uploads'), path.join(__dirname, '../../uploads')]
        : [path.join(__dirname, '../../uploads'), path.join('/tmp', 'uploads')];
      storageStatus = 'degraded';
      for (const p of candidates) {
        try { await fs.access(p, fs.constants.W_OK); storageStatus = 'operational'; break; } catch {}
      }
      if (storageStatus === 'degraded' && process.env.VERCEL) {
        try { await fs.mkdir(path.join('/tmp', 'uploads'), { recursive: true }); await fs.access(path.join('/tmp', 'uploads'), fs.constants.W_OK); storageStatus = 'operational'; } catch {}
      }
    }

    res.json([
      { id: 'api', label: 'API JOBSINC', status: 'operational', latency: '<1 ms', checkedAt },
      { id: 'database', label: 'Base de données PostgreSQL', status: dbStatus, latency: dbLatency, checkedAt },
      { id: 'storage', label: 'Stockage des fichiers', status: storageStatus, latency: '—', checkedAt },
    ]);
  } catch (error) {
    console.error('Erreur admin system:', error);
    res.status(500).json({ error: 'Impossible de vérifier l’état du système.' });
  }
};
