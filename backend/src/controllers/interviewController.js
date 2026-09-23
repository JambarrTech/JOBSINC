const prisma = require('../config/prisma');
const pushService = require('../services/pushService');
const socketService = require('../services/socketService');
const videoProvider = require('../services/videoProviderService');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');

// ============================================================
// ENTRETIENS — cycle de vie complet
//
// Statuts (enum Prisma InterviewStatus) :
//   PLANIFIE → EN_COURS → TERMINE
//        └──→ ANNULE (recruteur uniquement)
//
// Le lien de visioconférence est stocké dans streamingUrl (= meetUrl).
// Aucune intégration Google n'étant disponible dans le projet, le lien
// Meet reste fourni par le recruteur ; l'API expose aussi l'alias
// `meetUrl` pour brancher une future génération automatique sans
// casser les clients.
//
// Événements temps réel : `interview:update` sur les rooms user:<id>
// existantes (socketService). Push FCM via pushService.sendToUser.
// Fenêtre d'ouverture anticipée : INTERVIEW_START_WINDOW_MIN (défaut 10).
// ============================================================

const START_WINDOW_MINUTES = (() => {
  const value = Number.parseInt(process.env.INTERVIEW_START_WINDOW_MINUTES, 10);
  return Number.isFinite(value) && value >= 0 ? value : 10;
})();

function formatDateTimeFr(date) {
  return new Date(date).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function interviewDto(interview) {
  const application = interview.application;
  const job = application?.job;
  const company = job?.company;
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    mode: interview.mode,
    status: interview.status,
    scheduledAt: interview.scheduledAt,
    duration: interview.duration,
    meetUrl: interview.streamingUrl || null,
    streamingUrl: interview.streamingUrl || null,
    location: interview.location,
    notes: interview.notes,
    startedAt: interview.startedAt,
    finishedAt: interview.finishedAt,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    jobTitle: job?.title || null,
    companyName: company?.name || null,
    candidateName: application?.candidate
      ? `${application.candidate.firstName || ''} ${application.candidate.lastName || ''}`.trim() || 'Candidat'
      : 'Candidat',
    candidateUserId: application?.candidate?.userId || null,
    companyUserId: company?.userId || null,
    applicationStatus: application?.status || null,
  };
}

const applicationDetailInclude = { candidate: true, job: { include: { company: true } }, interview: true };
const interviewInclude = { application: { include: applicationDetailInclude } };

async function notifyInterviewUsers({ candidateUserId, companyUserId }, payload) {
  socketService.notifyInterviewUpdate(
    [candidateUserId, companyUserId].filter(Boolean),
    payload,
  );
}

// Notification en base + push FCM (systèmes existants réutilisés).
async function createNotification({ userId, title, body, event, applicationId }) {
  if (!userId) return;
  await prisma.notification.create({
    data: { userId, title, body, type: 'INTERVIEW', link: '/applications' },
  });
  await pushService.sendToUser(userId, { title, body }, {
    kind: event,
    applicationId: applicationId || '',
  }).catch((error) => console.warn('Push entretien:', error.message));
}

// Autorisation : entreprise propriétaire OU candidat concerné uniquement.
async function loadAuthorizedContext(req, applicationId) {
  if (!req.user?.userId) return {};
  const role = req.user.role;

  if (role === 'RECRUITER' || role === 'ADMIN') {
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return {};
    const application = await prisma.application.findFirst({
      where: { id: applicationId, job: { companyId: company.id } },
      include: applicationDetailInclude,
    });
    if (!application) return {};
    return { side: 'company', company, application, viewerUserId: req.user.userId };
  }

  if (role === 'CANDIDATE' || role === 'EMPLOYEE') {
    const application = await prisma.application.findFirst({
      where: { id: applicationId, candidate: { userId: req.user.userId } },
      include: applicationDetailInclude,
    });
    if (!application) return {};
    return { side: 'candidate', application, viewerUserId: req.user.userId };
  }

  return {};
}

exports.schedule = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER') return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });

    const { id } = req.params;
    const { mode, scheduledAt, duration, streamingUrl: providedUrl, location, notes } = req.body;

    if (!mode || !['ONLINE', 'PRESENTIEL'].includes(mode)) {
      return res.status(400).json({ error: 'Mode d\'entretien invalide (ONLINE ou PRESENTIEL).' });
    }
    // Lien visio : fourni par le recruteur OU généré par un fournisseur configuré.
    let streamingUrl = providedUrl || null;
    if (mode === 'ONLINE' && !streamingUrl) {
      const generated = await videoProvider.createRoom({ applicationId: id, scheduledAt }).catch(() => null);
      if (!generated?.url) {
        return res.status(400).json({ error: 'Le lien Google Meet / visioconférence est obligatoire pour un entretien en ligne.' });
      }
      streamingUrl = generated.url;
    }

    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const application = await prisma.application.findFirst({
      where: { id, job: { companyId: company.id } },
      include: { candidate: true, job: true },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });
    if (application.status !== 'INTERVIEW') {
      return res.status(400).json({ error: 'La candidature doit être en statut Entretien pour planifier un entretien.' });
    }

    // Un entretien terminé est figé : pas de re-planification possible.
    const existingInterview = await prisma.interview.findUnique({ where: { applicationId: id } });
    if (existingInterview?.status === 'TERMINE') {
      return res.status(409).json({ error: 'Cet entretien est déjà terminé : il ne peut plus être replanifié.' });
    }

    const interview = await prisma.interview.upsert({
      where: { applicationId: id },
      update: {
        mode,
        status: 'PLANIFIE',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        duration: duration ? Number(duration) : null,
        streamingUrl: streamingUrl || null,
        location: location || null,
        notes: notes || null,
        startedAt: null,
        finishedAt: null,
      },
      create: {
        applicationId: id,
        mode,
        status: 'PLANIFIE',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        duration: duration ? Number(duration) : null,
        streamingUrl: streamingUrl || null,
        location: location || null,
        notes: notes || null,
      },
    });

    const candidateUser = application.candidate?.userId;
    if (candidateUser) {
      let body = `Vous avez un entretien avec ${company.name || 'l\'entreprise'}`;
      if (scheduledAt) body += ` le ${formatDateTimeFr(scheduledAt)}`;
      body += '.';
      if (streamingUrl) body += `\nLien : ${streamingUrl}`;
      if (location) body += `\nLieu : ${location}`;
      if (duration) body += `\nDurée : ${duration} minutes`;
      if (notes) body += `\n\nNote : ${notes}`;

      await createNotification({
        userId: candidateUser,
        title: 'Entretien planifié',
        body,
        event: 'INTERVIEW_SCHEDULED',
        applicationId: id,
      });
    }

    await notifyInterviewUsers(
      { candidateUser, companyUserId: req.user.userId },
      { applicationId: id, status: interview.status },
    );

    res.status(201).json(interviewDto({ ...interview, application }));
  } catch (error) {
    console.error('Erreur planification entretien:', error);
    res.status(500).json({ error: 'Impossible de planifier l\'entretien.' });
  }
};

exports.start = async (req, res) => {
  try {
    const context = await loadAuthorizedContext(req, req.params.id);
    if (!context.application) return res.status(404).json({ error: 'Candidature introuvable.' });

    // Seul le recruteur propriétaire démarre l'entretien.
    if (context.side !== 'company') {
      return res.status(403).json({ error: 'Seul le recruteur peut démarrer l\'entretien.' });
    }

    const interview = context.application.interview;
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié pour cette candidature.' });
    if (interview.status === 'EN_COURS') {
      return res.json(interviewDto({ ...interview, application: context.application }));
    }
    if (interview.status === 'TERMINE') return res.status(409).json({ error: 'Cet entretien est déjà terminé.' });
    if (interview.status === 'ANNULE') return res.status(409).json({ error: 'Cet entretien a été annulé.' });

    // Fenêtre d'ouverture : pas avant (heure prévue - fenêtre configurable).
    if (interview.scheduledAt) {
      const opensAt = new Date(interview.scheduledAt.getTime() - START_WINDOW_MINUTES * 60000);
      if (new Date() < opensAt) {
        return res.status(409).json({
          error: `L'entretien pourra être démarré à partir du ${formatDateTimeFr(opensAt)}.`,
          opensAt: opensAt.toISOString(),
        });
      }
    }

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'EN_COURS', startedAt: new Date() },
      include: interviewInclude,
    });

    const dto = interviewDto(updated);
    const candidateUser = updated.application?.candidate?.userId;
    const companyName = updated.application?.job?.company?.name || 'l\'entreprise';
    if (candidateUser) {
      await createNotification({
        userId: candidateUser,
        title: 'Entretien en cours',
        body: `🔴 Votre entretien vient de commencer.\nRejoignez maintenant l'entretien avec ${companyName}.`,
        event: 'INTERVIEW_STARTED',
        applicationId: dto.applicationId,
      });
    }
    await notifyInterviewUsers(
      { candidateUser, companyUserId: context.viewerUserId },
      { applicationId: dto.applicationId, status: dto.status },
    );

    res.json(dto);
  } catch (error) {
    console.error('Erreur démarrage entretien:', error);
    res.status(500).json({ error: 'Impossible de démarrer l\'entretien.' });
  }
};

exports.finish = async (req, res) => {
  try {
    const context = await loadAuthorizedContext(req, req.params.id);
    if (!context.application) return res.status(404).json({ error: 'Candidature introuvable.' });

    const interview = context.application.interview;
    if (!interview) return res.status(404).json({ error: 'Aucun entretien pour cette candidature.' });
    if (interview.status === 'TERMINE') {
      return res.json(interviewDto({ ...interview, application: context.application }));
    }
    if (interview.status === 'ANNULE') return res.status(409).json({ error: 'Cet entretien a été annulé.' });

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'TERMINE', finishedAt: new Date(), ...(interview.status === 'PLANIFIE' ? { startedAt: new Date() } : {}) },
      include: interviewInclude,
    });

    const dto = interviewDto(updated);
    const candidateUser = updated.application?.candidate?.userId;
    const companyUserId = updated.application?.job?.company?.userId;
    const otherParty = context.side === 'company' ? candidateUser : companyUserId;
    if (otherParty) {
      await createNotification({
        userId: otherParty,
        title: 'Entretien terminé',
        body: `L'entretien "${updated.application?.job?.title || ''}" est terminé. Retrouvez-le dans votre historique.`,
        event: 'INTERVIEW_FINISHED',
        applicationId: dto.applicationId,
      });
    }
    await notifyInterviewUsers(
      { candidateUser, companyUserId },
      { applicationId: dto.applicationId, status: dto.status },
    );

    res.json(dto);
  } catch (error) {
    console.error('Erreur fin entretien:', error);
    res.status(500).json({ error: 'Impossible de terminer l\'entretien.' });
  }
};

exports.cancel = async (req, res) => {
  try {
    const context = await loadAuthorizedContext(req, req.params.id);
    if (!context.application) return res.status(404).json({ error: 'Candidature introuvable.' });
    if (context.side !== 'company') {
      return res.status(403).json({ error: 'Seul le recruteur peut annuler l\'entretien.' });
    }

    const interview = context.application.interview;
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié pour cette candidature.' });
    if (interview.status === 'ANNULE') {
      return res.json(interviewDto({ ...interview, application: context.application }));
    }
    if (interview.status === 'TERMINE') return res.status(409).json({ error: 'Impossible d\'annuler un entretien terminé.' });

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'ANNULE' },
      include: interviewInclude,
    });

    const dto = interviewDto(updated);
    const candidateUser = updated.application?.candidate?.userId;
    if (candidateUser) {
      await createNotification({
        userId: candidateUser,
        title: 'Entretien annulé',
        body: `Votre entretien avec ${dto.companyName || 'l\'entreprise'} a été annulé.`,
        event: 'INTERVIEW_CANCELLED',
        applicationId: dto.applicationId,
      });
    }
    await notifyInterviewUsers(
      { candidateUser, companyUserId: context.viewerUserId },
      { applicationId: dto.applicationId, status: dto.status },
    );

    res.json(dto);
  } catch (error) {
    console.error('Erreur annulation entretien:', error);
    res.status(500).json({ error: 'Impossible d\'annuler l\'entretien.' });
  }
};

exports.listCompany = async (req, res) => {
  try {
    if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    }
    const company = await prisma.company.findUnique({ where: { userId: req.user.userId } });
    if (!company) return res.status(404).json({ error: 'Profil entreprise introuvable.' });
    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.interview.findMany({ where: { application: { job: { companyId: company.id } } }, include: interviewInclude, orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }], skip, take: limit }),
      prisma.interview.count({ where: { application: { job: { companyId: company.id } } } }),
    ]);
    res.json(buildPaginationResponse(rows.map((item) => interviewDto(item)), total, page, limit));
  } catch (error) {
    console.error('Erreur liste entretiens entreprise:', error);
    res.status(500).json({ error: 'Impossible de charger les entretiens.' });
  }
};

exports.listCandidate = async (req, res) => {
  try {
    if (req.user.role !== 'CANDIDATE' && req.user.role !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Accès réservé aux candidats.' });
    }
    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.interview.findMany({ where: { application: { candidate: { userId: req.user.userId } } }, include: interviewInclude, orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }], skip, take: limit }),
      prisma.interview.count({ where: { application: { candidate: { userId: req.user.userId } } } }),
    ]);
    res.json(buildPaginationResponse(rows.map((item) => interviewDto(item)), total, page, limit));
  } catch (error) {
    console.error('Erreur liste entretiens candidat:', error);
    res.status(500).json({ error: 'Impossible de charger les entretiens.' });
  }
};

exports.getByApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await prisma.application.findUnique({
      where: { id },
      include: { job: { include: { company: { select: { userId: true } } } }, candidate: { select: { userId: true } } },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });

    const isRecruiter = req.user.role === 'RECRUITER' && application.job?.company?.userId === req.user.userId;
    const isCandidate = (req.user.role === 'CANDIDATE' || req.user.role === 'EMPLOYEE') && application.candidate?.userId === req.user.userId;
    if (!isRecruiter && !isCandidate && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    const interview = await prisma.interview.findUnique({ where: { applicationId: id } });
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié.' });
    res.json(interviewDto({ ...interview, application }));
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger l\'entretien.' });
  }
};

exports.getByApplicationPublic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'CANDIDATE') return res.status(403).json({ error: 'Accès refusé.' });

    const application = await prisma.application.findFirst({
      where: { id, candidate: { userId: req.user.userId } },
    });
    if (!application) return res.status(404).json({ error: 'Candidature introuvable.' });

    const interview = await prisma.interview.findUnique({ where: { applicationId: id } });
    if (!interview) return res.status(404).json({ error: 'Aucun entretien planifié.' });
    res.json(interviewDto({ ...interview, application: null }));
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger l\'entretien.' });
  }
};
