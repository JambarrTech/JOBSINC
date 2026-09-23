const prisma = require('../config/prisma');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');

exports.list = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const where = { userId: req.user.userId };

    const [saved, total] = await Promise.all([
      prisma.savedJob.findMany({
        where,
        include: {
          job: {
            include: {
              company: {
                include: { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.savedJob.count({ where }),
    ]);

    const data = saved.map((s) => ({
      id: s.id,
      savedAt: s.createdAt,
      job: {
        id: s.job.id,
        title: s.job.title,
        description: s.job.description,
        location: s.job.location,
        contractType: s.job.contractType || s.job.jobType,
        department: s.job.department,
        salaryMin: s.job.salaryMin,
        salaryMax: s.job.salaryMax,
        currency: s.job.currency,
        company: {
          id: s.job.company.id,
          name: s.job.company.name,
          sector: s.job.company.sector,
          city: s.job.company.city,
          country: s.job.company.country,
          logo: s.job.company.logo,
        },
      },
    }));

    res.json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Erreur savedJobs.list:', error);
    res.status(500).json({ error: 'Impossible de charger les offres sauvegardées.' });
  }
};

exports.toggle = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    const existing = await prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });

    if (existing) {
      await prisma.savedJob.delete({ where: { id: existing.id } });
      return res.json({ saved: false });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    try {
      await prisma.savedJob.create({ data: { userId, jobId } });
    } catch (e) {
      if (e.code === 'P2002') return res.json({ saved: true });
      throw e;
    }
    res.json({ saved: true });
  } catch (error) {
    console.error('Erreur savedJobs.toggle:', error);
    res.status(500).json({ error: 'Impossible de modifier le statut sauvegarde.' });
  }
};

exports.check = async (req, res) => {
  try {
    const { jobIds } = req.query;
    if (!jobIds) return res.json({ saved: {} });

    const ids = jobIds.split(',').filter(Boolean);
    const saved = await prisma.savedJob.findMany({
      where: { userId: req.user.userId, jobId: { in: ids } },
      select: { jobId: true },
    });

    const map = {};
    for (const s of saved) map[s.jobId] = true;
    res.json({ saved: map });
  } catch (error) {
    console.error('Erreur savedJobs.check:', error);
    res.status(500).json({ error: 'Impossible de vérifier les sauvegardes.' });
  }
};
