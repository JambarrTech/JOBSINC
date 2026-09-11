const prisma = require('../config/prisma');

// ── Entreprise : laisser un feedback ──
exports.create = async (req, res) => {
  try {
    const { author, role, text } = req.body;
    if (!author || !author.trim()) {
      return res.status(400).json({ error: 'Le nom de l\'auteur est requis.' });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Le témoignage est requis.' });
    }
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) {
      return res.status(404).json({ error: 'Entreprise non trouvée.' });
    }
    const feedback = await prisma.feedback.create({
      data: {
        companyId: company.id,
        author: author.trim(),
        role: role?.trim() || null,
        text: text.trim(),
      },
    });
    return res.status(201).json(feedback);
  } catch (error) {
    console.error('Erreur Feedback create:', error);
    return res.status(500).json({ error: 'Impossible de créer le témoignage.' });
  }
};

// ── Entreprise : voir ses feedbacks ──
exports.listByCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) {
      return res.status(404).json({ error: 'Entreprise non trouvée.' });
    }
    const items = await prisma.feedback.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur Feedback list:', error);
    return res.status(500).json({ error: 'Impossible de charger les témoignages.' });
  }
};

// ── Public : feedbacks publiés (pour la homepage) ──
exports.listPublic = async (_req, res) => {
  try {
    const items = await prisma.feedback.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { company: { select: { name: true } } },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur Feedback public:', error);
    return res.status(500).json({ error: 'Impossible de charger les témoignages.' });
  }
};

// ── Admin : voir tous les feedbacks ──
exports.listAll = async (_req, res) => {
  try {
    const items = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur Feedback admin list:', error);
    return res.status(500).json({ error: 'Impossible de charger les témoignages.' });
  }
};

// ── Admin : publier / dépublier un feedback ──
exports.togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;
    const feedback = await prisma.feedback.update({
      where: { id },
      data: { isPublished: Boolean(isPublished) },
    });
    return res.json(feedback);
  } catch (error) {
    console.error('Erreur Feedback toggle:', error);
    return res.status(500).json({ error: 'Impossible de modifier le témoignage.' });
  }
};

// ── Admin : supprimer un feedback ──
exports.remove = async (req, res) => {
  try {
    await prisma.feedback.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Témoignage supprimé.' });
  } catch (error) {
    console.error('Erreur Feedback delete:', error);
    return res.status(500).json({ error: 'Impossible de supprimer le témoignage.' });
  }
};
