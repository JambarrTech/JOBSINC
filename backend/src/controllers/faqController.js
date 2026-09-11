const prisma = require('../config/prisma');

// ── Entreprise : poser une question ──
exports.create = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La question est requise.' });
    }
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) {
      return res.status(404).json({ error: 'Entreprise non trouvée.' });
    }
    const faq = await prisma.faq.create({
      data: { companyId: company.id, question: question.trim() },
    });
    return res.status(201).json(faq);
  } catch (error) {
    console.error('Erreur FAQ create:', error);
    return res.status(500).json({ error: 'Impossible de créer la question.' });
  }
};

// ── Entreprise : voir ses questions ──
exports.listByCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) {
      return res.status(404).json({ error: 'Entreprise non trouvée.' });
    }
    const items = await prisma.faq.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur FAQ list:', error);
    return res.status(500).json({ error: 'Impossible de charger les questions.' });
  }
};

// ── Public : questions/réponses publiées (pour la homepage) ──
exports.listPublic = async (_req, res) => {
  try {
    const items = await prisma.faq.findMany({
      where: { isPublished: true, answer: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { company: { select: { name: true } } },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur FAQ public:', error);
    return res.status(500).json({ error: 'Impossible de charger la FAQ.' });
  }
};

// ── Admin : voir toutes les questions ──
exports.listAll = async (_req, res) => {
  try {
    const items = await prisma.faq.findMany({
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    });
    return res.json(items);
  } catch (error) {
    console.error('Erreur FAQ admin list:', error);
    return res.status(500).json({ error: 'Impossible de charger les questions.' });
  }
};

// ── Admin : répondre à une question ──
exports.answer = async (req, res) => {
  try {
    const { id } = req.params;
    const { answer, isPublished } = req.body;
    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'La réponse est requise.' });
    }
    const faq = await prisma.faq.update({
      where: { id },
      data: {
        answer: answer.trim(),
        isPublished: isPublished !== undefined ? isPublished : true,
      },
    });
    return res.json(faq);
  } catch (error) {
    console.error('Erreur FAQ answer:', error);
    return res.status(500).json({ error: 'Impossible de modifier la question.' });
  }
};

// ── Admin : supprimer une question ──
exports.remove = async (req, res) => {
  try {
    await prisma.faq.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Question supprimée.' });
  } catch (error) {
    console.error('Erreur FAQ delete:', error);
    return res.status(500).json({ error: 'Impossible de supprimer la question.' });
  }
};
