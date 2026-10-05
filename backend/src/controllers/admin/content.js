// Domaine « contenu » : offres, candidatures, entretiens, recrutements,
// ressource vide, recherche globale.
const { prisma, paginate, paginated, candidateName } = require('./_shared');
const logger = require('../../utils/logger');

exports.jobs = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.job.findMany({ include: { company: { select: { name: true } }, _count: { select: { applications: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, title: row.title, companyName: row.company?.name || null, location: row.location, status: row.isOpen ? 'active' : 'closed', applicationsCount: row._count.applications, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin jobs:', scope: 'adminController' });
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
    logger.exception(error, { message: 'Erreur admin applications:', scope: 'adminController' });
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
    logger.exception(error, { message: 'Erreur admin interviews:', scope: 'adminController' });
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
    logger.exception(error, { message: 'Erreur admin recruitments:', scope: 'adminController' });
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
    logger.exception(error, { message: 'Erreur admin search:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible d’effectuer la recherche.' });
  }
};
