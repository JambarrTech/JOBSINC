const prisma = require('../config/prisma');
const conversationService = require('../services/conversationService');

const labels = { RECEIVED: 'Reçue', UNDER_REVIEW: 'En cours d\'examen', INTERVIEW: 'Entretien', ACCEPTED: 'Acceptée', REJECTED: 'Refusée' };
const transitions = {
  RECEIVED:     ['UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED'],
  UNDER_REVIEW: ['INTERVIEW', 'ACCEPTED', 'REJECTED'],
  INTERVIEW:    ['ACCEPTED', 'REJECTED'],
  ACCEPTED:     [],
  REJECTED:     [],
};
const dto = (value) => ({
  id: value.id,
  status: value.status,
  statusLabel: labels[value.status] || value.status,
  cvUrl: value.cvUrl,
  coverLetter: value.coverLetter,
  interview: value.interview || null,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  candidateName: value.candidate
    ? `${value.candidate.firstName || ''} ${value.candidate.lastName || ''}`.trim() || 'Candidat'
    : 'Candidat',
  candidateAvatar: value.candidate?.avatarUrl || null,
  candidateUserId: value.candidate?.userId || null,
  job: value.job && {
    id: value.job.id,
    title: value.job.title,
    location: value.job.location,
    contractType: value.job.contractType || value.job.jobType,
    company: value.job.company && { id: value.job.company.id, name: value.job.company.name },
  },
});
const candidateFor = (userId) => prisma.candidateProfile.findUnique({ where: { userId } });

exports.create = async (req, res) => {
  try {
    if (req.user.role !== 'CANDIDATE') return res.status(403).json({ error: 'Seuls les candidats peuvent postuler.' });
    const candidate = await candidateFor(req.user.userId); if (!candidate) return res.status(409).json({ error: 'Profil candidat incomplet.' });
    const job = await prisma.job.findFirst({ where: { id: req.params.jobId, isOpen: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] }, include: { company: true } }); if (!job) return res.status(404).json({ error: 'Offre introuvable ou fermée.' });
    const { cvUrl, coverLetter } = req.body;
    const cvUrlStr = String(cvUrl || '').trim();
    const coverLetterStr = String(coverLetter || '').trim();
    if (!cvUrlStr) return res.status(400).json({ error: 'Le lien du CV est obligatoire.' });
    if (!coverLetterStr) return res.status(400).json({ error: 'La lettre de motivation est obligatoire.' });
    const application = await prisma.application.create({
      data: { jobId: job.id, candidateProfileId: candidate.id, cvUrl: cvUrlStr, coverLetter: coverLetterStr },
      include: { job: { include: { company: true } }, candidate: true },
    });

    const companyUserId = job.company?.userId;
    if (companyUserId) {
      await prisma.notification.create({
        data: {
          userId: companyUserId,
          title: 'Nouvelle candidature',
          body: `${dto(application).candidateName} a postulé pour "${job.title}".`,
          type: 'APPLICATION',
          link: '/dashboard/applications',
        },
      });
    }

    res.status(201).json(dto(application));
  } catch (error) { if (error.code === 'P2002') return res.status(409).json({ error: 'Vous avez déjà postulé à cette offre.' }); res.status(500).json({ error: 'Impossible d\'envoyer la candidature.' }); }
};

exports.mine = async (req, res) => {
  try {
    const candidate = await candidateFor(req.user.userId);
    if (!candidate) return res.json({ data: [] });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { candidateProfileId: candidate.id };
    const [values, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: { job: { include: { company: true } }, candidate: true, interview: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.application.count({ where }),
    ]);

    res.json({
      data: values.map(dto),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (_) { res.status(500).json({ error: 'Impossible de charger les candidatures.' }); }
};

exports.updateStatus = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    const status = req.body.status;
    if (!['UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Statut de candidature invalide.' });

    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const application = await prisma.application.findFirst({
      where: { id: req.params.id, job: { companyId: company.id } },
      include: { candidate: { include: { user: true } }, job: { include: { company: true } } },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });

    const allowed = transitions[application.status];
    if (allowed && !allowed.includes(status)) {
      return res.status(400).json({
        error: `Transition invalide : ${labels[application.status]} → ${labels[status]}`,
        currentStatus: application.status,
        allowedTransitions: allowed,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: application.id },
        data: { status },
        include: { job: { include: { company: true } }, candidate: true },
      });

      if (status === 'ACCEPTED') {
        await tx.employment.upsert({
          where: { applicationId: application.id },
          update: {},
          create: {
            applicationId: application.id,
            candidateId: application.candidateProfileId,
            jobId: application.jobId,
            companyId: application.job.companyId,
            position: application.job.title,
          },
        });
        await tx.user.update({ where: { id: application.candidate.userId }, data: { role: 'EMPLOYEE' } });
      }

      // Messagerie : la sélection (entretien) ou l'acceptation ouvre
      // l'échange candidat ↔ entreprise. Création silencieuse : ne doit
      // jamais bloquer le changement de statut.
      if (conversationService.AUTHORIZED_APPLICATION_STATUSES.includes(status)) {
        await conversationService.ensureWithinTransaction(tx, updated);
      }

      if (application.candidate?.userId) {
        const notifType = status === 'INTERVIEW' ? 'INTERVIEW' : 'APPLICATION';
        const recruiterName = company?.name || 'L\'entreprise';
        await tx.notification.create({
          data: {
            userId: application.candidate.userId,
            title: `Candidature ${labels[status]?.toLowerCase() || status.toLowerCase()}`,
            body: `Votre candidature pour "${application.job.title}" chez ${recruiterName} est maintenant : ${labels[status]}.`,
            type: notifType,
            link: '/applications',
          },
        });
      }

      return updated;
    });

    res.json(dto(result));
  } catch (_) { res.status(500).json({ error: 'Impossible de mettre à jour la candidature.' }); }
};

// Ouvre (ou récupère) la conversation autorisée associée à une candidature.
// Réservé au recruteur propriétaire ; candidature INTERVIEW ou ACCEPTED requise.
exports.ensureConversation = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER') return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    const result = await conversationService.ensureForApplication(req.user, req.params.id);
    if (result.error) return res.status(result.error.status || 500).json({ error: result.error.error, currentStatus: result.error.currentStatus });
    res.status(result.created ? 201 : 200).json({
      conversation: conversationService.serializeDetail(result.conversation, req.user.userId),
      created: Boolean(result.created),
    });
  } catch (error) {
    console.error('Erreur ensureConversation:', error);
    res.status(500).json({ error: "Impossible d'ouvrir la conversation." });
  }
};

exports.labels = labels;
exports.transitions = transitions;
