const prisma = require('../config/prisma');
const fs = require('fs/promises');
const path = require('path');
const { getMatches, getCompanyMatches, getJobMatches, computeMatch } = require('../services/matchingService');
const { getCached, setCache, invalidate } = require('../utils/cache');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');
const { validate, jobCreateSchema } = require('../utils/zodSchemas');

const jobInclude = { _count: { select: { applications: true } } };
const companyInclude = { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } };

function paginate(req) {
  return parsePagination(req.query);
}

function paginated(data, total, page, limit) {
  return buildPaginationResponse(data, total, page, limit);
}

function isRecruiter(req, res) {
  if (req.user?.role !== 'RECRUITER' && req.user?.role !== 'ADMIN') {
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
  // Host header injection guard : n'accepte que host connu ou localhost
  const rawHost = req?.get?.('host') || 'localhost:5000';
  const host = /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(rawHost) ? rawHost : 'localhost:5000';
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
    logo: absoluteUrl(req, company.logo) || (primary ? primary.url : null),
    images,
    photos: images.map((image) => image.url),
    image: primary ? primary.url : null,
  };
}

exports.listPublic = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      prisma.company.findMany({ where: { isApproved: true }, include: companyInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.company.count({ where: { isApproved: true } }),
    ]);

    return res.json({
      success: true,
      data: companies.map((company) => ({ ...companyDto(company, req), location: [company.city, company.country].filter(Boolean).join(', ') || null })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Erreur entreprises publiques:', error);
    return res.status(500).json({ success: false, error: 'Impossible de charger les entreprises.' });
  }
};

exports.publicCompanyJobs = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id, isApproved: true } });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.job.findMany({ where: { companyId: company.id, isOpen: true }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count({ where: { companyId: company.id, isOpen: true } }),
    ]);
    res.json({ data: rows.map((j) => ({ id: j.id, title: j.title, location: j.location, contractType: j.contractType, jobType: j.jobType, createdAt: j.createdAt })), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Erreur publicCompanyJobs:', error);
    res.status(500).json({ error: 'Impossible de charger les offres.' });
  }
};

function jobDto(job) {
  return {
    id: job.id, title: job.title, description: job.description, location: job.location,
    contractType: job.contractType || job.jobType, status: job.isOpen ? 'active' : 'inactive',
    publishedAt: job.createdAt, createdAt: job.createdAt, department: job.department,
    workMode: job.workMode, experience: job.experience, salaryMin: job.salaryMin,
    salaryMax: job.salaryMax, currency: job.currency, deadline: job.deadline, startsAt: job.startsAt,
    responsibilities: job.responsibilities, skills: job.skills,
    educationLevel: job.educationLevel, minExperienceYears: job.minExperienceYears, maxExperienceYears: job.maxExperienceYears,
    applicationsCount: job._count?.applications || 0,
  };
}

function applicationDto(application, company) {
  const candidate = application.candidate;
  // Score de pertinence calculé côté serveur (aide à la décision,
  // jamais utilisé pour trier automatiquement ou statuer).
  const match = application.job && candidate
    ? computeMatch(application.job, candidate, { applicationId: application.id, company })
    : null;
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
    matchScore: match ? match.score : null,
    matchLevel: match ? match.level : null,
    matchLevelLabel: match ? match.levelLabel : null,
  };
}

exports.dashboard = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId, req.user.role);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });

    const cacheKey = `company:dashboard:${company.id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 30, 7), 365);

    const [companyUser, jobs, applications, receivedActions, stats, activityRaw, notifications, matches, interviews] = await Promise.all([
      prisma.user.findUnique({ where: { id: company.userId }, select: { id: true, email: true, role: true } }),
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
        where: { job: { companyId: company.id }, createdAt: { gte: new Date(Date.now() - (days - 1) * 86400000) } },
        select: { createdAt: true },
      }),
      prisma.notification.findMany({ where: { userId: req.user.userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      getMatches(company.id).catch(() => []),
      prisma.interview.findMany({
        where: { application: { job: { companyId: company.id } }, status: { in: ['PLANIFIE', 'EN_COURS'] } },
        include: { application: { include: { candidate: true, job: true } } },
        orderBy: [{ status: 'desc' }, { scheduledAt: 'asc' }],
        take: 5,
      }),
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
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 86400000);
      const key = day.toISOString().slice(0, 10);
      activity.push({
        label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        value: buckets.get(key) || 0,
        date: key,
      });
    }

    const result = {
      user: {
        id: companyUser?.id || req.user.userId,
        email: companyUser?.email || null,
        role: req.user.role,
        name: company.name,
        avatar: company.logo || null,
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
      applications: applications.map((application) => applicationDto(application, company)),
      matching: matches.slice(0, 6),
      interviews: interviews.map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        status: item.status,
        mode: item.mode,
        scheduledAt: item.scheduledAt,
        duration: item.duration,
        meetUrl: item.streamingUrl || null,
        startedAt: item.startedAt,
        jobTitle: item.application?.job?.title || null,
        candidateName: item.application?.candidate
          ? `${item.application.candidate.firstName || ''} ${item.application.candidate.lastName || ''}`.trim() || 'Candidat'
          : 'Candidat',
      })),
      notifications: notifications.map((n) => ({ id: n.id, label: n.title, body: n.body, type: n.type, link: n.link, read: n.isRead, date: n.createdAt })),
    };

    setCache(cacheKey, result, 30000);
    res.json(result);
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ error: 'Impossible de charger le tableau de bord.' });
  }
};

exports.profile = async (req, res) => {
  try { if (!isRecruiter(req, res)) return; const company = await getCompany(req.user.userId); if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' }); res.json(companyDto(company, req)); }
  catch (error) { console.error('Erreur profile:', error); res.status(500).json({ error: 'Impossible de charger le profil entreprise.' }); }
};

exports.jobs = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });

    const { page, limit, skip } = paginate(req);
    const where = { companyId: company.id };
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, include: jobInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count({ where }),
    ]);

    res.json(paginated(jobs.map(jobDto), total, page, limit));
  } catch (error) { console.error('Erreur jobs:', error); res.status(500).json({ error: 'Impossible de charger les offres.' }); }
};

exports.createJob = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    // Validation zod (garde compat contractType français)
    const normalized = {
      ...req.body,
      contractType: req.body.contractType,
      title: req.body.title?.trim(),
      description: req.body.description?.trim(),
      location: req.body.location?.trim(),
      skills: req.body.skills?.trim(),
    };
    // Pre-validate zod puis mappe contractType legacy
    const validContractTypesLegacy = ['Temps plein','Temps partiel','Stage','Freelance','CDD','CDI'];
    let bodyForZod = { ...normalized };
    if (validContractTypesLegacy.includes(bodyForZod.contractType)) {
      bodyForZod.contractType = bodyForZod.contractType;
    }
    // Utilise zod pour les champs communs, puis vérif contractType élargie
    try { validate(jobCreateSchema, { ...bodyForZod, jobType: undefined }); } catch (e) { return res.status(400).json({ error: e.message, details: e.details }); }
    const { title, description, location, contractType, department, workMode, experience, salaryMin, salaryMax, currency, deadline, startsAt, responsibilities, skills, educationLevel, minExperienceYears, maxExperienceYears } = req.body;
    if (deadline && new Date(deadline) < new Date()) return res.status(400).json({ error: 'La date limite ne peut pas être dans le passé.' });
    const validContractTypes = ['Temps plein','Temps partiel','Stage','Freelance','CDD','CDI','FULL_TIME','PART_TIME','INTERNSHIP','FREELANCE'];
    if (!validContractTypes.includes(contractType)) return res.status(400).json({ error: `contractType invalide: ${contractType}` });
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const types = { 'Temps plein': 'FULL_TIME', 'Temps partiel': 'PART_TIME', Stage: 'INTERNSHIP', Freelance: 'FREELANCE', CDD: 'FULL_TIME' };
    const job = await prisma.job.create({ data: { companyId: company.id, title: title.trim(), description: description.trim(), location: location.trim(), jobType: types[contractType] || 'FULL_TIME', contractType, department: department || null, workMode: workMode || null, experience: experience || null, salaryMin: salaryMin === null || salaryMin === '' ? null : Number(salaryMin), salaryMax: salaryMax === null || salaryMax === '' ? null : Number(salaryMax), currency: currency || null, deadline: deadline ? new Date(deadline) : null, startsAt: startsAt ? new Date(startsAt) : null, responsibilities: responsibilities || null, skills: skills.trim(), educationLevel: educationLevel || null, minExperienceYears: minExperienceYears == null || minExperienceYears === '' ? null : Math.max(0, Number(minExperienceYears)), maxExperienceYears: maxExperienceYears == null || maxExperienceYears === '' ? null : Math.max(0, Number(maxExperienceYears)) }, include: jobInclude });
    invalidate(`company:dashboard:${company.id}`);
    invalidate(`matching:pool:`);
    invalidate(`matching:match:`);
    res.status(201).json(jobDto(job));
  } catch (error) {
    console.error('Erreur createJob:', error);
    res.status(500).json({ error: 'Impossible de créer l’offre.' });
  }
};

exports.applications = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.application.findMany({ where: { job: { companyId: company.id } }, include: { job: true, candidate: true, interview: true }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.application.count({ where: { job: { companyId: company.id } } }),
    ]);
    res.json(paginated(rows.map((a) => applicationDto(a, company)), total, page, limit));
  } catch (error) { console.error('Erreur applications:', error); res.status(500).json({ error: 'Impossible de charger les candidatures.' }); }
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
    res.json(applicationDto(application, company));
  } catch (error) {
    console.error('Erreur applicationDetail:', error);
    res.status(500).json({ error: 'Impossible de charger la candidature.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId, req.user.role);
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
    invalidate(`company:dashboard:${company.id}`);
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
    const existingCount = await prisma.companyImage.count({ where: { companyId: company.id } });
    if (existingCount + req.companyImages.length > 20) return res.status(400).json({ error: 'Limite de 20 images atteinte.' });
    const images = await prisma.$transaction(
      req.companyImages.map((img) =>
        prisma.companyImage.create({
          data: { companyId: company.id, url: img.url, isPrimary: img.isPrimary, sortOrder: img.sortOrder },
        })
      )
    );
    invalidate(`company:dashboard:${company.id}`);
    res.status(201).json({ images: images.map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary, sortOrder: i.sortOrder })) });
  } catch (error) {
    console.error('Erreur uploadImage:', error);
    res.status(500).json({ error: "Impossible d'uploader les images." });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    if (!req.companyLogo) return res.status(400).json({ error: 'Aucun logo fourni.' });
    const company = await getCompany(req.user.userId, req.user.role);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    if (company.logo) {
      // Sur Vercel les fichiers sont dans /tmp/uploads, sur local dans ./uploads,
      // et sur S3 l'URL est http : on utilise removeLocal qui gère les 3 cas.
      const { removeLocal } = require('../services/storageService');
      // Compat: ancien logo peut être /uploads/... ou https://...
      if (company.logo.startsWith('/uploads/')) {
        await removeLocal(company.logo).catch(() => {});
      } else {
        const oldPath = path.join(__dirname, '../..', '.' + company.logo);
        await fs.unlink(oldPath).catch(() => {});
      }
    }
    const updated = await prisma.company.update({ where: { id: company.id }, data: { logo: req.companyLogo.url }, include: companyInclude });
    invalidate(`company:dashboard:${company.id}`);
    res.json(companyDto(updated, req));
  } catch (error) {
    console.error('Erreur uploadLogo:', error);
    res.status(500).json({ error: "Impossible d'uploader le logo." });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const image = await prisma.companyImage.findFirst({ where: { id: req.params.id, companyId: company.id } });
    if (!image) return res.status(404).json({ error: 'Image introuvable.' });
    // Ne pas supprimer la primary sans réassignation : si c'est la primary et qu'il reste d'autres images, promouvoir la suivante
    if (image.isPrimary) {
      const other = await prisma.companyImage.findFirst({ where: { companyId: company.id, id: { not: image.id } }, orderBy: { sortOrder: 'asc' } });
      if (other) await prisma.companyImage.update({ where: { id: other.id }, data: { isPrimary: true } });
    }
    // Suppression compatible Vercel (/tmp) + local + S3 (no-op)
    if (image.url && image.url.startsWith('/uploads/')) {
      const { removeLocal } = require('../services/storageService');
      await removeLocal(image.url).catch(() => {});
    } else {
      const filePath = path.join(__dirname, '../..', '.' + image.url);
      await fs.unlink(filePath).catch(() => {});
    }
    await prisma.companyImage.delete({ where: { id: image.id } });
    invalidate(`company:dashboard:${company.id}`);
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
    const { title, description, location, contractType, department, workMode, experience, salaryMin, salaryMax, currency, deadline, startsAt, responsibilities, skills, isOpen, educationLevel, minExperienceYears, maxExperienceYears } = req.body;
    if (salaryMin !== undefined && salaryMin !== null && salaryMin !== '' && Number.isNaN(Number(salaryMin))) return res.status(400).json({ error: 'salaryMin invalide.' });
    if (salaryMax !== undefined && salaryMax !== null && salaryMax !== '' && Number.isNaN(Number(salaryMax))) return res.status(400).json({ error: 'salaryMax invalide.' });
    if (deadline && new Date(deadline) < new Date()) return res.status(400).json({ error: 'La date limite ne peut pas être dans le passé.' });
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
        ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
        ...(responsibilities !== undefined && { responsibilities }),
        ...(skills !== undefined && { skills: skills.trim() }),
        ...(educationLevel !== undefined && { educationLevel }),
        ...(minExperienceYears !== undefined && { minExperienceYears: minExperienceYears === null || minExperienceYears === '' ? null : Math.max(0, Number(minExperienceYears)) }),
        ...(maxExperienceYears !== undefined && { maxExperienceYears: maxExperienceYears === null || maxExperienceYears === '' ? null : Math.max(0, Number(maxExperienceYears)) }),
        ...(isOpen !== undefined && { isOpen: Boolean(isOpen) }),
      },
      include: jobInclude,
    });
    invalidate(`company:dashboard:${company.id}`);
    invalidate(`matching:pool:`);
    invalidate(`matching:match:`);
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
    invalidate(`company:dashboard:${company.id}`);
    invalidate(`matching:pool:`);
    invalidate(`matching:match:`);
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
    const { page, limit, skip } = paginate(req);

    const [rowCount, distinctRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT p."id") AS "total"
        FROM "CandidateProfile" p
        INNER JOIN "Application" a ON a."candidateProfileId" = p."id"
        INNER JOIN "Job" j ON j."id" = a."jobId"
        WHERE j."companyId" = ${company.id}
      `,
      prisma.$queryRaw`
        SELECT DISTINCT p."id", p."firstName", p."lastName", p."avatarUrl", p."skills", p."country", p."city"
        FROM "CandidateProfile" p
        INNER JOIN "Application" a ON a."candidateProfileId" = p."id"
        INNER JOIN "Job" j ON j."id" = a."jobId"
        WHERE j."companyId" = ${company.id}
        ORDER BY p."firstName" ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
    ]);

    const total = Number(rowCount[0]?.total) || 0;
    const paged = distinctRows.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      avatar: r.avatarUrl || null,
      skills: r.skills || null,
      country: r.country || null,
      city: r.city || null,
    }));

    res.json(paginated(paged, total, page, limit));
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
    const { minScore, jobId, skill, location, contractType } = req.query;
    const matches = await getCompanyMatches(company.id, { minScore, jobId, skill, location, contractType }, company);
    res.json(matches);
  } catch (error) {
    console.error('Erreur matching:', error);
    res.status(500).json({ error: 'Impossible de charger les correspondances.' });
  }
};

// Recommandations pour une offre précise : /api/company/jobs/:id/matches?minScore=70
exports.jobMatches = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const company = await getCompany(req.user.userId);
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const { minScore, skill, location, contractType } = req.query;
    const matches = await getJobMatches(company.id, req.params.id, { minScore, skill, location, contractType }, company);
    if (!matches) return res.status(404).json({ error: 'Offre introuvable.' });
    res.json(matches);
  } catch (error) {
    console.error('Erreur jobMatches:', error);
    res.status(500).json({ error: 'Impossible de charger les recommandations de cette offre.' });
  }
};
