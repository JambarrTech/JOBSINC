const prisma = require('../config/prisma');
const fs = require('fs/promises');
const path = require('path');
const { getMatches } = require('../services/matchingService');

const jobInclude = { _count: { select: { applications: true } } };
const companyInclude = { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } };

function isRecruiter(req, res) {
  if (req.user?.role !== 'RECRUITER') {
    res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    return false;
  }
  return true;
}

async function getCompany(userId) {
  return prisma.company.findUnique({ where: { userId }, include: companyInclude });
}

function absoluteUrl(req, value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const host = req?.get?.('host') || 'localhost:5000';
  const proto = req?.protocol || 'http';
  return `${proto}://${host}${value.startsWith('/') ? '' : '/'}${value}`;
}

function companyDto(company, req) {
  const images = (company.images || []).map((image) => ({
    id: image.id, url: absoluteUrl(req, image.url), isPrimary: image.isPrimary, sortOrder: image.sortOrder,
  }));
  const primary = images.find((image) => image.isPrimary) || images[0] || null;
  return {
    id: company.id, name: company.name, description: company.description,
    website: company.website, sector: company.sector, size: company.size,
    country: company.country, city: company.city, address: company.address,
    foundedYear: company.foundedYear,
    images,
    photos: images.map((image) => image.url),
    image: primary ? primary.url : null,
  };
}

exports.listPublic = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({ include: companyInclude, orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: companies.map((company) => ({ ...companyDto(company, req), location: [company.city, company.country].filter(Boolean).join(', ') || null })) });
  } catch (error) {
    console.error('Erreur entreprises publiques:', error);
    return res.status(500).json({ success: false, error: 'Impossible de charger les entreprises.' });
  }
};

function jobDto(job) {
  return {
    id: job.id, title: job.title, description: job.description, location: job.location,
    contractType: job.contractType || job.jobType, status: job.isOpen ? 'active' : 'inactive',
    publishedAt: job.createdAt, createdAt: job.createdAt, department: job.department,
    workMode: job.workMode, experience: job.experience, salaryMin: job.salaryMin,
    salaryMax: job.salaryMax, currency: job.currency, deadline: job.deadline,
    responsibilities: job.responsibilities, skills: job.skills,
    applicationsCount: job._count?.applications || 0,
  };
}

function applicationDto(application) {
  const candidate = application.candidate;
  return {
    id: application.id,
    candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Candidat',
    candidateUserId: candidate?.userId || null,
    candidateAvatar: candidate?.avatarUrl || null,
    jobTitle: application.job?.title,
    date: application.createdAt,
    status: application.status,
    cvUrl: application.cvUrl || null,
    coverLetter: application.coverLetter || null,
    interview: application.interview || null,
  };
}

exports.dashboard = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });

    const [user, jobs, applications, receivedActions, stats, activityRaw, notifications, matches] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, role: true } }),
      prisma.job.findMany({ where: { companyId: company.id }, include: jobInclude, orderBy: { createdAt: 'desc' } }),
      prisma.application.findMany({ where: { job: { companyId: company.id } }, include: { job: true, candidate: true, interview: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.application.findMany({ where: { job: { companyId: company.id }, status: 'RECEIVED' }, include: { job: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.$transaction([
        prisma.job.count({ where: { companyId: company.id, isOpen: true } }),
        prisma.job.count({ where: { companyId: company.id } }),
        prisma.application.count({ where: { job: { companyId: company.id } } }),
        prisma.application.groupBy({ by: ['status'], where: { job: { companyId: company.id } }, _count: { _all: true } }),
        prisma.interview.count({ where: { application: { job: { companyId: company.id } } } }),
      ]),
      prisma.application.findMany({
        where: { job: { companyId: company.id }, createdAt: { gte: new Date(Date.now() - 29 * 86400000) } },
        select: { createdAt: true },
      }),
      prisma.notification.findMany({ where: { userId: req.user.userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      getMatches(company.id).catch(() => []),
    ]);

    const [activeJobsCount, , totalApplications, statusGroups, interviewCount] = stats;
    const statusMap = new Map(statusGroups.map((group) => [group.status, group._count._all]));
    const byStatus = (status) => statusMap.get(status) || 0;

    const buckets = new Map();
    for (const item of activityRaw) {
      const key = new Date(item.createdAt).toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const activity = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 86400000);
      const key = day.toISOString().slice(0, 10);
      activity.push({
        label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        value: buckets.get(key) || 0,
        date: key,
      });
    }

    res.json({
      user: {
        id: user?.id || req.user.userId,
        email: user?.email || null,
        role: req.user.role,
        name: company.name,
      },
      company: companyDto(company, req),
      stats: {
        activeJobs: activeJobsCount,
        totalJobs: jobs.length,
        applications: totalApplications,
        interviews: interviewCount || byStatus('INTERVIEW'),
        hired: byStatus('ACCEPTED'),
        received: byStatus('RECEIVED'),
        underReview: byStatus('UNDER_REVIEW'),
        rejected: byStatus('REJECTED'),
      },
      actions: receivedActions.map((item) => ({
        id: item.id,
        type: 'application',
        label: `Nouvelle candidature pour ${item.job.title}`,
        href: `/dashboard/applications/${item.id}`,
        count: 1,
      })),
      activity,
      jobs: jobs.map(jobDto),
      applications: applications.map(applicationDto),
      matching: matches.slice(0, 6),
      notifications: notifications.map((n) => ({ id: n.id, label: n.title, body: n.body, type: n.type, link: n.link, read: n.isRead, date: n.createdAt })),
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ error: 'Impossible de charger le tableau de bord.' });
  }
};

exports.profile = async (req, res) => {
  try { if (!isRecruiter(req, res)) return; const company = await getCompany(req.user.userId); if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' }); res.json(companyDto(company, req)); }
  catch { res.status(500).json({ error: 'Impossible de charger le profil entreprise.' }); }
};

exports.jobs = async (req, res) => {
  try { if (!isRecruiter(req, res)) return; const company = await getCompany(req.user.userId); if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' }); const jobs = await prisma.job.findMany({ where: { companyId: company.id }, include: jobInclude, orderBy: { createdAt: 'desc' } }); res.json(jobs.map(jobDto)); }
  catch { res.status(500).json({ error: 'Impossible de charger les offres.' }); }
};

exports.createJob = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const { title, description, location, contractType, department, workMode, experience, salaryMin, salaryMax, currency, deadline, responsibilities, skills } = req.body;
    if (!title?.trim() || !description?.trim() || !location?.trim() || !contractType || !skills?.trim()) return res.status(400).json({ error: 'Les champs obligatoires de l’offre sont manquants.' });
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const types = { 'Temps plein': 'FULL_TIME', 'Temps partiel': 'PART_TIME', Stage: 'INTERNSHIP', Freelance: 'FREELANCE', CDD: 'FULL_TIME' };
    const job = await prisma.job.create({ data: { companyId: company.id, title: title.trim(), description: description.trim(), location: location.trim(), jobType: types[contractType] || 'FULL_TIME', contractType, department: department || null, workMode: workMode || null, experience: experience || null, salaryMin: salaryMin === null || salaryMin === '' ? null : Number(salaryMin), salaryMax: salaryMax === null || salaryMax === '' ? null : Number(salaryMax), currency: currency || null, deadline: deadline ? new Date(deadline) : null, responsibilities: responsibilities || null, skills: skills.trim() }, include: jobInclude });
    res.status(201).json(jobDto(job));
  } catch { res.status(500).json({ error: 'Impossible de créer l’offre.' }); }
};

exports.applications = async (req, res) => {
  try { if (!isRecruiter(req, res)) return; const company = await getCompany(req.user.userId); if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' }); const applications = await prisma.application.findMany({ where: { job: { companyId: company.id } }, include: { job: true, candidate: true, interview: true }, orderBy: { createdAt: 'desc' } }); res.json(applications.map(applicationDto)); }
  catch { res.status(500).json({ error: 'Impossible de charger les candidatures.' }); }
};

exports.applicationDetail = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const application = await prisma.application.findFirst({
      where: { id: req.params.id, job: { companyId: company.id } },
      include: { job: true, candidate: true, interview: true },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });
    res.json(applicationDto(application));
  } catch (error) {
    console.error('Erreur applicationDetail:', error);
    res.status(500).json({ error: 'Impossible de charger la candidature.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const { name, description, website, sector, size, country, city, address, foundedYear } = req.body;
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(website !== undefined && { website }),
        ...(sector !== undefined && { sector }),
        ...(size !== undefined && { size }),
        ...(country !== undefined && { country }),
        ...(city !== undefined && { city }),
        ...(address !== undefined && { address }),
        ...(foundedYear !== undefined && { foundedYear: foundedYear ? Number(foundedYear) : null }),
      },
      include: companyInclude,
    });
    res.json(companyDto(updated, req));
  } catch (error) {
    console.error('Erreur updateProfile:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le profil.' });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    if (!req.companyImages || req.companyImages.length === 0) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const images = await prisma.$transaction(
      req.companyImages.map((img) =>
        prisma.companyImage.create({
          data: { companyId: company.id, url: img.url, isPrimary: img.isPrimary, sortOrder: img.sortOrder },
        })
      )
    );
    res.status(201).json({ images: images.map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary, sortOrder: i.sortOrder })) });
  } catch (error) {
    console.error('Erreur uploadImage:', error);
    res.status(500).json({ error: "Impossible d'uploader les images." });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const image = await prisma.companyImage.findFirst({ where: { id: req.params.id, companyId: company.id } });
    if (!image) return res.status(404).json({ error: 'Image introuvable.' });
    const filePath = path.resolve(__dirname, '../..', image.url);
    await fs.unlink(filePath).catch(() => {});
    await prisma.companyImage.delete({ where: { id: image.id } });
    res.json({ message: 'Image supprimée.' });
  } catch (error) {
    console.error('Erreur deleteImage:', error);
    res.status(500).json({ error: "Impossible de supprimer l'image." });
  }
};

exports.getJob = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const job = await prisma.job.findFirst({ where: { id: req.params.id, companyId: company.id }, include: jobInclude });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });
    res.json(jobDto(job));
  } catch (error) {
    console.error('Erreur getJob:', error);
    res.status(500).json({ error: "Impossible de charger l'offre." });
  }
};

exports.updateJob = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const job = await prisma.job.findFirst({ where: { id: req.params.id, companyId: company.id } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });
    const { title, description, location, contractType, department, workMode, experience, salaryMin, salaryMax, currency, deadline, responsibilities, skills, isOpen } = req.body;
    const types = { 'Temps plein': 'FULL_TIME', 'Temps partiel': 'PART_TIME', Stage: 'INTERNSHIP', Freelance: 'FREELANCE', CDD: 'FULL_TIME' };
    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(location !== undefined && { location: location.trim() }),
        ...(contractType !== undefined && { contractType, jobType: types[contractType] || job.jobType }),
        ...(department !== undefined && { department }),
        ...(workMode !== undefined && { workMode }),
        ...(experience !== undefined && { experience }),
        ...(salaryMin !== undefined && { salaryMin: salaryMin === null || salaryMin === '' ? null : Number(salaryMin) }),
        ...(salaryMax !== undefined && { salaryMax: salaryMax === null || salaryMax === '' ? null : Number(salaryMax) }),
        ...(currency !== undefined && { currency }),
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
        ...(responsibilities !== undefined && { responsibilities }),
        ...(skills !== undefined && { skills: skills.trim() }),
        ...(isOpen !== undefined && { isOpen: Boolean(isOpen) }),
      },
      include: jobInclude,
    });
    res.json(jobDto(updated));
  } catch (error) {
    console.error('Erreur updateJob:', error);
    res.status(500).json({ error: "Impossible de mettre à jour l'offre." });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const job = await prisma.job.findFirst({ where: { id: req.params.id, companyId: company.id }, include: { _count: { select: { applications: true } } } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });
    if (job._count.applications > 0) {
      return res.status(400).json({ error: "Impossible de supprimer une offre avec des candidatures. Utilisez la désactivation à la place." });
    }
    await prisma.job.delete({ where: { id: job.id } });
    res.json({ message: 'Offre supprimée.' });
  } catch (error) {
    console.error('Erreur deleteJob:', error);
    res.status(500).json({ error: "Impossible de supprimer l'offre." });
  }
};

exports.candidates = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const applications = await prisma.application.findMany({
      where: { job: { companyId: company.id } },
      include: { candidate: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Set();
    const candidates = [];
    for (const app of applications) {
      if (!app.candidate || seen.has(app.candidate.id)) continue;
      seen.add(app.candidate.id);
      candidates.push({
        id: app.candidate.id,
        name: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
        avatar: app.candidate.avatarUrl || null,
        skills: app.candidate.skills || null,
        country: app.candidate.country || null,
        city: app.candidate.city || null,
        appliedTo: app.job?.title || null,
        appliedAt: app.createdAt,
      });
    }
    res.json(candidates);
  } catch (error) {
    console.error('Erreur candidates:', error);
    res.status(500).json({ error: 'Impossible de charger les candidats.' });
  }
};

exports.matching = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const matches = await getMatches(company.id);
    res.json(matches);
  } catch (error) {
    console.error('Erreur matching:', error);
    res.status(500).json({ error: 'Impossible de charger les correspondances.' });
  }
};
