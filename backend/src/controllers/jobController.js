const prisma = require('../config/prisma');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');

const companyImagesInclude = { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } };
// Les offres visibles publiquement proviennent uniquement d'entreprises approuvées.
// Fonction (pas constante) pour éviter Date figée au boot.
function getPublicJobWhere() {
  return { isOpen: true, company: { isApproved: true }, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] };
}

function absoluteUrl(req, value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const host = req?.get?.('host') || 'localhost:5000';
  const proto = req?.protocol || 'http';
  return `${proto}://${host}${value.startsWith('/') ? '' : '/'}${value}`;
}

function dto(job, req) {
  const images = (job.company.images || []).map((image) => ({
    id: image.id, url: absoluteUrl(req, image.url), isPrimary: image.isPrimary, sortOrder: image.sortOrder,
  }));
  const primary = images.find((image) => image.isPrimary) || images[0] || null;
  return { id: job.id, title: job.title, description: job.description, location: job.location, contractType: job.contractType || job.jobType, jobType: job.jobType, department: job.department, workMode: job.workMode, experience: job.experience, salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency, deadline: job.deadline, startsAt: job.startsAt, responsibilities: job.responsibilities, skills: job.skills, publishedAt: job.createdAt, company: { id: job.company.id, name: job.company.name, city: job.company.city, country: job.company.country, sector: job.company.sector || null, description: job.company.description || null, location: [job.company.city, job.company.country].filter(Boolean).join(', ') || null, logo: absoluteUrl(req, job.company.logo) || (primary ? primary.url : null), images, image: primary ? primary.url : null } };
}

function paginate(req) {
  return parsePagination(req.query);
}

function paginated(data, total, page, limit) {
  return buildPaginationResponse(data, total, page, limit);
}

exports.listPublic = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const where = getPublicJobWhere();
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, include: { company: { include: companyImagesInclude } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count({ where }),
    ]);
    res.json(paginated(jobs.map((job) => dto(job, req)), total, page, limit));
  } catch (error) { console.error('Erreur listPublic jobs:', error); res.status(500).json({ error: 'Impossible de charger les offres.' }); }
};
exports.getPublic = async (req, res) => {
  try { const job = await prisma.job.findFirst({ where: { id: req.params.id, isOpen: true, company: { isApproved: true } }, include: { company: { include: companyImagesInclude } } }); if (!job) return res.status(404).json({ error: 'Offre introuvable.' }); res.json(dto(job, req)); }
  catch (error) { console.error('Erreur getPublic job:', error); res.status(500).json({ error: "Impossible de charger l'offre." }); }
};

exports.similar = async (req, res) => {
  try {
    const job = await prisma.job.findFirst({ where: { id: req.params.id, isOpen: true, company: { isApproved: true } } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    const or = [];
    if (job.department) or.push({ department: job.department });
    if (job.contractType) or.push({ contractType: job.contractType });
    if (job.location) or.push({ location: job.location });

    const similar = await prisma.job.findMany({
      where: {
        isOpen: true,
        company: { isApproved: true },
        id: { not: job.id },
        ...(or.length > 0 ? { OR: or } : {}),
      },
      include: { company: { include: companyImagesInclude } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({ data: similar.map((j) => dto(j, req)) });
  } catch (error) {
    console.error('Erreur similar jobs:', error);
    res.status(500).json({ error: 'Impossible de charger les offres similaires.' });
  }
};
