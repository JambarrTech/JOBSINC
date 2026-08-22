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
  return { id: job.id, title: job.title, description: job.description, location: job.location, contractType: job.contractType || job.jobType, jobType: job.jobType, department: job.department, workMode: job.workMode, experience: job.experience, salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency, deadline: job.deadline, responsibilities: job.responsibilities, skills: job.skills, publishedAt: job.createdAt, company: { id: job.company.id, name: job.company.name, city: job.company.city, country: job.company.country, sector: job.company.sector || null, description: job.company.description || null, location: [job.company.city, job.company.country].filter(Boolean).join(', ') || null, images, image: primary ? primary.url : null } };
}

exports.listPublic = async (req, res) => {
  try { const jobs = await prisma.job.findMany({ where: { isOpen: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] }, include: { company: { include: companyImagesInclude } }, orderBy: { createdAt: 'desc' } }); res.json({ data: jobs.map((job) => dto(job, req)) }); }
  catch (_) { res.status(500).json({ error: 'Impossible de charger les offres.' }); }
};
exports.getPublic = async (req, res) => {
  try { const job = await prisma.job.findFirst({ where: { id: req.params.id, isOpen: true }, include: { company: { include: companyImagesInclude } } }); if (!job) return res.status(404).json({ error: 'Offre introuvable.' }); res.json(dto(job, req)); }
  catch (_) { res.status(500).json({ error: 'Impossible de charger l’offre.' }); }
};
