const prisma = require('../config/prisma');

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

exports.listSkills = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const where = q.length >= 2 ? { name: { contains: q, mode: 'insensitive' } } : {};
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.skill.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
      prisma.skill.count({ where }),
    ]);
    res.json({ data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Erreur listSkills:', error);
    res.status(500).json({ error: 'Impossible de charger les compétences.' });
  }
};

exports.syncCandidateSkills = async (req, res) => {
  try {
    if (req.user.role !== 'CANDIDATE') return res.status(403).json({ error: 'Accès réservé aux candidats.' });

    const { skillIds } = req.body;
    if (!Array.isArray(skillIds)) return res.status(400).json({ error: 'skillIds doit être un tableau.' });

    const uniqueIds = [...new Set(skillIds)];
    if (uniqueIds.length === 0) return res.status(400).json({ error: 'Aucune compétence fournie.' });

    const existingSkills = await prisma.skill.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
    const existingIds = new Set(existingSkills.map((s) => s.id));
    const invalidIds = uniqueIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) return res.status(400).json({ error: `Compétences introuvables: ${invalidIds.join(', ')}` });

    const candidate = await prisma.candidateProfile.findUnique({ where: { userId: req.user.userId } });
    if (!candidate) return res.status(404).json({ error: 'Profil candidat introuvable.' });

    await prisma.$transaction([
      prisma.candidateSkill.deleteMany({ where: { candidateId: candidate.id } }),
      ...uniqueIds.map((skillId) =>
        prisma.candidateSkill.create({ data: { candidateId: candidate.id, skillId } })
      ),
    ]);

    res.json({ message: 'Compétences mises à jour.', count: uniqueIds.length });
  } catch (error) {
    console.error('Erreur syncCandidateSkills:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour les compétences.' });
  }
};

exports.syncJobSkills = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Accès réservé aux recruteurs.' });

    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });

    const job = await prisma.job.findFirst({ where: { id: req.params.jobId, companyId: company.id } });
    if (!job) return res.status(404).json({ error: 'Offre introuvable.' });

    const { skillIds } = req.body;
    if (!Array.isArray(skillIds)) return res.status(400).json({ error: 'skillIds doit être un tableau.' });

    const uniqueIds = [...new Set(skillIds)];
    if (uniqueIds.length === 0) return res.status(400).json({ error: 'Aucune compétence fournie.' });

    const existingSkills = await prisma.skill.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
    const existingIds = new Set(existingSkills.map((s) => s.id));
    const invalidIds = uniqueIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) return res.status(400).json({ error: `Compétences introuvables: ${invalidIds.join(', ')}` });

    await prisma.$transaction([
      prisma.jobSkill.deleteMany({ where: { jobId: job.id } }),
      ...uniqueIds.map((skillId) =>
        prisma.jobSkill.create({ data: { jobId: job.id, skillId, required: true } })
      ),
    ]);

    res.json({ message: 'Compétences de l\'offre mises à jour.', count: uniqueIds.length });
  } catch (error) {
    console.error('Erreur syncJobSkills:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour les compétences.' });
  }
};
