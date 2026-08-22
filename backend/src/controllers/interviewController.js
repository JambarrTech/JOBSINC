const crypto = require('crypto');
const prisma = require('../config/prisma');

exports.schedule = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER') return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });

    const { id } = req.params;
    const { mode, scheduledAt, duration, streamingUrl, location, notes } = req.body;

    if (!mode || !['ONLINE', 'PRESENTIEL'].includes(mode)) {
      return res.status(400).json({ error: 'Mode d\'entretien invalide (ONLINE ou PRESENTIEL).' });
    }

    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const application = await prisma.application.findFirst({
      where: { id, job: { companyId: company.id } },
      include: { candidate: { include: { user: true } }, job: true },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });
    if (application.status !== 'INTERVIEW') {
      return res.status(400).json({ error: 'La candidature doit être en statut Entretien pour planifier un entretien.' });
    }

    const interview = await prisma.interview.upsert({
      where: { applicationId: id },
      update: {
        mode,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        duration: duration ? Number(duration) : null,
        streamingUrl: streamingUrl || null,
        location: location || null,
        notes: notes || null,
      },
      create: {
        applicationId: id,
        mode,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        duration: duration ? Number(duration) : null,
        streamingUrl: streamingUrl || null,
        location: location || null,
        notes: notes || null,
      },
    });

    const candidateUser = application.candidate?.userId;
    if (candidateUser) {
      const companyName = company?.name || 'L\'entreprise';
      const jobTitle = application.job?.title || 'le poste';
      let body = '';

      if (mode === 'ONLINE') {
        body = `${companyName} vous invite à un entretien en ligne pour "${jobTitle}".\n\n` +
          (streamingUrl ? `Lien : ${streamingUrl}\n` : '') +
          (scheduledAt ? `Date : ${new Date(scheduledAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n` : '') +
          (duration ? `Durée : ${duration} minutes\n` : '') +
          (notes ? `\nNote : ${notes}` : '');
      } else {
        body = `${companyName} vous invite à un entretien présentiel pour "${jobTitle}".\n\n` +
          (location ? `Lieu : ${location}\n` : '') +
          (scheduledAt ? `Date : ${new Date(scheduledAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n` : '') +
          (duration ? `Durée : ${duration} minutes\n` : '') +
          (notes ? `\nNote : ${notes}` : '');
      }

      await prisma.notification.create({
        data: {
          userId: candidateUser,
          title: `Entretien planifié — ${mode === 'ONLINE' ? 'En ligne' : 'Présentiel'}`,
          body,
          type: 'INTERVIEW',
          link: '/applications',
        },
      });
    }

    res.status(201).json(interview);
  } catch (error) {
    console.error('Erreur planification entretien:', error);
    res.status(500).json({ error: 'Impossible de planifier l\'entretien.' });
  }
};

exports.getByApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const interview = await prisma.interview.findUnique({ where: { applicationId: id } });
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié.' });
    res.json(interview);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger l\'entretien.' });
  }
};

exports.getByApplicationPublic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'CANDIDATE') return res.status(403).json({ error: 'Accès refusé.' });

    const application = await prisma.application.findFirst({
      where: { id, candidateProfile: { userId: req.user.userId } },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });

    const interview = await prisma.interview.findUnique({ where: { applicationId: id } });
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié.' });
    res.json(interview);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger l\'entretien.' });
  }
};
