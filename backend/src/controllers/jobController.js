const prisma = require('../config/prisma');

const companyImagesInclude = { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } };

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
  return { id: job.id, title: job.title, description: job.description, location: job.location, contractType: job.contractType || job.jobType, jobType: job.jobType, department: job.department, workMode: job.workMode, experience: job.experience, salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency, deadline: job.deadline, responsibilities: job.responsibilities, skills: job.skills, publishedAt: job.createdAt, company: { id: job.company.id, name: job.company.name, city: job.company.city, country: job.company.country, sector: job.company.sector || null, description: job.company.description || null, location: [job.company.city, job.company.country].filter(Boolean).join(', ') || null, logo: absoluteUrl(req, job.company.logo) || (primary ? primary.url : null), images, image: primary ? primary.url : null } };
}

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginated(data, total, page, limit) {
  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

exports.listPublic = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const where = { isOpen: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] };
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, include: { company: { include: companyImagesInclude } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.job.count({ where }),
    ]);
    res.json(paginated(jobs.map((job) => dto(job, req)), total, page, limit));
  } catch (_) { res.status(500).json({ error: 'Impossible de charger les offres.' }); }
};
exports.getPublic = async (req, res) => {
  try { const job = await prisma.job.findFirst({ where: { id: req.params.id, isOpen: true }, include: { company: { include: companyImagesInclude } } }); if (!job) return res.status(404).json({ error: 'Offre introuvable.' }); res.json(dto(job, req)); }
  catch (_) { res.status(500).json({ error: "Impossible de charger l'offre." }); }
};

exports.similar = async (req, res) => {
  try {
    const job = await prisma.job.findFirst({ where: { id: req.params.id, isOpen: true } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    const or = [];
    if (job.department) or.push({ department: job.department });
    if (job.contractType) or.push({ contractType: job.contractType });
    if (job.location) or.push({ location: job.location });

    const similar = await prisma.job.findMany({
      where: {
        isOpen: true,
        id: { not: job.id },
        ...(or.length > 0 ? { OR: or } : {}),
      },
      include: { company: { include: companyImagesInclude } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({ data: similar.map((j) => dto(j, req)) });
  } catch (_) {
    res.status(500).json({ error: 'Impossible de charger les offres similaires.' });
  }
};
