const prisma = require('../config/prisma');
const { notifyNewMessage, isUserConnected } = require('./socketService');
const pushService = require('./pushService');

// ============================================================
// CONVERSATION SERVICE
// Logique métier partagée par /api/conversations et /api/company/messages.
//
// Règles de sécurité :
// - Le senderId est TOUJOURS déduit du token authentifié.
// - Chaque requête est filtrée par l'appartenance à la conversation
//   (companyUserId pour les recruteurs, candidateUserId pour les candidats).
// - Une conversation ne peut être créée que depuis une candidature
//   autorisée (statuts INTERVIEW ou ACCEPTED).
// - L'admin n'accède pas aux conversations (aucun système de
//   modération existant à réutiliser).
// ============================================================

const AUTHORIZED_APPLICATION_STATUSES = ['INTERVIEW', 'ACCEPTED'];
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_LIMIT = 200;
const MAX_PAGE_LIMIT = 200;

// --- Limitation de débit en mémoire (pas de dépendance externe) ---
const rateBuckets = new Map();
const RATE_LIMIT_MAX_MESSAGES = 20;
const RATE_LIMIT_WINDOW_MS = 10000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateBuckets) {
    if (now > value.resetAt) rateBuckets.delete(key);
  }
}, 60_000);

function isRateLimited(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_MESSAGES;
}

// --- Validation du contenu d'un message ---
function validateContent(rawContent) {
  if (typeof rawContent !== 'string') return { error: 'Le contenu du message est invalide.' };
  // Supprime les caractères de contrôle invisibles (anti-injection),
  // sauf les sauts de ligne et tabulations.
  const cleaned = rawContent.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!cleaned) return { error: 'Le message ne peut pas être vide.' };
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    return { error: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.` };
  }
  return { content: cleaned };
}

// --- Contrôle du rôle ---
function messagingSide(user) {
  if (!user || !user.userId) return null;
  if (user.role === 'RECRUITER') return 'company';
  if (user.role === 'CANDIDATE' || user.role === 'EMPLOYEE') return 'candidate';
  return null;
}

// Filtre d'appartenance : ne jamais faire confiance à un id reçu du client.
function membershipWhere(user, extra = {}) {
  const side = messagingSide(user);
  return {
    ...(side === 'company' ? { companyUserId: user.userId } : { candidateUserId: user.userId }),
    ...extra,
  };
}

// --- Inclusions Prisma partagées ---
const conversationInclude = {
  companyUser: { select: { id: true, company: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
  candidateUser: { select: { id: true, candidate: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
  application: { select: { id: true, status: true, job: { select: { id: true, title: true } } } },
};

// ============================================================
// SÉRIALISATION
// ============================================================

function participantNameOf(conversation) {
  const candidate = conversation.candidateUser?.candidate;
  return candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidat' : 'Candidat';
}

function companyNameOf(conversation) {
  return conversation.companyUser?.company?.name || 'Entreprise';
}

function avatarOf(conversation) {
  return (
    conversation.companyUser?.company?.images?.find((image) => image.isPrimary)?.url ||
    conversation.candidateUser?.candidate?.avatarUrl ||
    null
  );
}

function serializeMessage(message, viewerUserId) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    isRead: Boolean(message.isRead),
    isMine: message.senderId === viewerUserId,
    createdAt: message.createdAt.toISOString(),
  };
}

function contextOf(conversation) {
  const application = conversation.application;
  return {
    applicationId: application?.id || null,
    applicationStatus: application?.status || null,
    jobId: application?.job?.id || null,
    jobTitle: application?.job?.title || null,
    companyName: companyNameOf(conversation),
    companyId: conversation.companyUser?.company?.id || null,
    participantName: participantNameOf(conversation),
    avatar: avatarOf(conversation),
  };
}

// Résumé de conversation utilisé par toutes les listes.
function serializeSummary(conversation, viewerUserId, unreadCount, lastMessage) {
  const side = conversation.companyUserId === viewerUserId ? 'company' : 'candidate';
  return {
    id: conversation.id,
    conversationId: conversation.id,
    participantName:
      side === 'company' ? participantNameOf(conversation) : companyNameOf(conversation),
    candidateId: conversation.candidateUser?.candidate?.id || null,
    candidateUserId: conversation.candidateUserId,
    avatar: side === 'company'
      ? conversation.candidateUser?.candidate?.avatarUrl || null
      : conversation.companyUser?.company?.images?.find((image) => image.isPrimary)?.url || null,
    subject: conversation.subject || null,
    ...contextOf(conversation),
    preview: lastMessage?.content?.substring(0, 120) || '',
    content: lastMessage?.content || '',
    date: (lastMessage?.createdAt || conversation.lastMessageAt).toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    unreadCount: unreadCount || 0,
    unread: (unreadCount || 0) > 0,
    read: (unreadCount || 0) === 0,
  };
}

async function unreadCountsFor(conversationIds, userId) {
  if (conversationIds.length === 0) return new Map();
  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: conversationIds }, receiverId: userId, isRead: false },
    _count: { id: true },
  });
  return new Map(grouped.map((row) => [row.conversationId, row._count.id]));
}

async function lastMessagesFor(conversationIds) {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.message.findMany({
    where: { conversationId: { in: conversationIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['conversationId'],
  });
  return new Map(rows.map((message) => [message.conversationId, message]));
}

// ============================================================
// LISTE DES CONVERSATIONS DE L'UTILISATEUR CONNECTÉ
// ============================================================

exports.listForUser = async (user) => {
  const conversations = await prisma.conversation.findMany({
    where: membershipWhere(user),
    include: conversationInclude,
    orderBy: { lastMessageAt: 'desc' },
  });

  const ids = conversations.map((conversation) => conversation.id);
  const [unreadMap, lastMap] = await Promise.all([
    unreadCountsFor(ids, user.userId),
    lastMessagesFor(ids),
  ]);

  const items = conversations.map((conversation) =>
    serializeSummary(
      conversation,
      user.userId,
      unreadMap.get(conversation.id) || 0,
      lastMap.get(conversation.id) || null,
    ),
  );

  return { data: items, unreadTotal: items.reduce((total, item) => total + item.unreadCount, 0) };
};

// ============================================================
// ACCÈS À UNE CONVERSATION (403 si non membre)
// ============================================================

exports.getAuthorizedConversation = async (user, conversationId) => {
  const conversation = await prisma.conversation.findFirst({
    where: membershipWhere(user, { id: conversationId }),
    include: conversationInclude,
  });
  if (!conversation) return { error: { status: 403, error: 'Accès refusé : cette conversation ne vous est pas destinée.' } };
  return { conversation };
};

exports.serializeDetail = (conversation, viewerUserId) => ({
  id: conversation.id,
  conversationId: conversation.id,
  ...contextOf(conversation),
  subject: conversation.subject || contextOf(conversation).jobTitle || 'Conversation de recrutement',
  createdAt: conversation.createdAt.toISOString(),
});

// ============================================================
// MESSAGES : LECTURE AVEC PAGINATION + SYNC INCRÉMENTALE
// ============================================================
// limit   : taille de page (défaut DEFAULT_PAGE_LIMIT, max MAX_PAGE_LIMIT)
// before  : id de message — charge les messages ANTÉRIEURS (pagination vers le haut)
// after   : id de message ou date ISO — charge les messages POSTÉRIEURS (polling)

exports.listMessages = async (user, conversationId, query = {}) => {
  const found = await exports.getAuthorizedConversation(user, conversationId);
  if (found.error) return found;
  const conversation = found.conversation;

  let limit = parseInt(query.limit, 10);
  if (Number.isNaN(limit)) limit = DEFAULT_PAGE_LIMIT;
  limit = Math.max(1, Math.min(limit, MAX_PAGE_LIMIT));

  const where = { conversationId };
  const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
  const options = { where, orderBy, take: limit + 1 };

  if (query.before) {
    // Le curseur doit appartenir à la conversation : jamais accepté tel quel.
    const anchor = await prisma.message.findFirst({
      where: { id: query.before, conversationId },
      select: { createdAt: true, id: true },
    });
    if (!anchor) return { error: { status: 400, error: "Curseur 'before' invalide." } };
    options.cursor = { id: anchor.id };
    options.skip = 1;
  } else if (query.after) {
    const asDate = new Date(query.after);
    if (!Number.isNaN(asDate.getTime())) {
      where.createdAt = { gt: asDate };
    } else {
      const anchor = await prisma.message.findFirst({
        where: { id: query.after, conversationId },
        select: { createdAt: true },
      });
      if (!anchor) return { error: { status: 400, error: "Curseur 'after' invalide." } };
      where.createdAt = { gt: anchor.createdAt };
    }
    options.take = MAX_PAGE_LIMIT + 1;
  }

  const rows = await prisma.message.findMany(options);
  const fetchLimit = options.take - 1;
  const hasMore = rows.length > fetchLimit;
  const page = rows.slice(0, fetchLimit);

  return {
    conversation: exports.serializeDetail(conversation, user.userId),
    messages: page.reverse().map((message) => serializeMessage(message, user.userId)),
    hasMore,
  };
};

// ============================================================
// ENVOI D'UN MESSAGE
// ============================================================

exports.sendMessage = async function sendMessage(user, conversationId, rawContent) {
  if (isRateLimited(user.userId)) {
    return { error: { status: 429, error: 'Trop de messages envoyés. Réessayez dans un instant.' } };
  }

  const found = await exports.getAuthorizedConversation(user, conversationId);
  if (found.error) return found;
  const conversation = found.conversation;

  const validation = validateContent(rawContent);
  if (validation.error) return { error: { status: 400, error: validation.error } };

  const receiverId =
    user.userId === conversation.companyUserId ? conversation.candidateUserId : conversation.companyUserId;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.userId,
        receiverId,
        content: validation.content,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: created.createdAt },
    });
    await tx.notification.create({
      data: {
        userId: receiverId,
        title: 'Nouveau message',
        body: `Vous avez reçu un nouveau message de ${
          user.userId === conversation.companyUserId ? companyNameOf(conversation) : participantNameOf(conversation)
        }.`,
        type: 'MESSAGE',
        link: '/messages',
      },
    });
    return created;
  });

  // Temps réel : prévient les clients connectés (room conversation +
  // room du destinataire) après la persistance.
  notifyNewMessage(conversation.id, receiverId);

  // Push FCM uniquement si le destinataire n'est pas connecté en
  // temps réel (sinon le socket suffit et éviterait les doublons).
  if (!isUserConnected(receiverId)) {
    const senderName =
      user.userId === conversation.companyUserId ? companyNameOf(conversation) : participantNameOf(conversation);
    pushService
      .sendToUser(
        receiverId,
        { title: senderName, body: validation.content.substring(0, 120) },
        { conversationId: conversation.id, type: 'MESSAGE' },
      )
      .catch(() => {});
  }

  return { message: serializeMessage(message, user.userId), receiverId };
};

// ============================================================
// MARQUER COMME LU
// ============================================================

exports.markConversationAsRead = async (user, conversationId) => {
  const found = await exports.getAuthorizedConversation(user, conversationId);
  if (found.error) return found;
  await prisma.message.updateMany({
    where: { conversationId, receiverId: user.userId, isRead: false },
    data: { isRead: true },
  });
  return { updated: true };
};

// ============================================================
// CRÉATION / RÉCUPÉRATION DEPUIS UNE CANDIDATURE
// Uniquement RECRUITER propriétaire, candidature autorisée (INTERVIEW/ACCEPTED).
// ============================================================

exports.ensureForApplication = async (recruiterUser, applicationId) => {
  const company = await prisma.company.findUnique({ where: { userId: recruiterUser.userId } });
  if (!company) return { error: { status: 404, error: 'Profil entreprise introuvable.' } };

  const application = await prisma.application.findFirst({
    where: { id: applicationId, job: { companyId: company.id } },
    include: { job: { include: { company: true } }, candidate: { include: { user: true } } },
  });
  if (!application) return { error: { status: 404, error: 'Candidature introuvable.' } };

  if (!AUTHORIZED_APPLICATION_STATUSES.includes(application.status)) {
    return {
      error: {
        status: 403,
        error:
          "La messagerie s'ouvre lorsque la candidature est sélectionnée pour un entretien ou acceptée.",
        currentStatus: application.status,
        requiredStatuses: AUTHORIZED_APPLICATION_STATUSES,
      },
    };
  }

  const candidateUserId = application.candidate?.userId;
  if (!candidateUserId) return { error: { status: 409, error: 'Profil utilisateur du candidat introuvable.' } };

  // Une conversation existe déjà pour cette candidature ?
  const linked = await prisma.conversation.findUnique({ where: { applicationId: application.id } });
  if (linked && linked.companyUserId === recruiterUser.userId) {
    return { conversation: await reload(linked.id) };
  }

  const conversation = await prisma.conversation.upsert({
    where: { companyUserId_candidateUserId: { companyUserId: recruiterUser.userId, candidateUserId } },
    update: { applicationId: application.id },
    create: {
      companyUserId: recruiterUser.userId,
      candidateUserId,
      applicationId: application.id,
      subject: application.job.title,
    },
  });

  return { conversation: await reload(conversation.id), created: !linked };
};

async function reload(conversationId) {
  return prisma.conversation.findUnique({ where: { id: conversationId }, include: conversationInclude });
}

// Variante flux historique : le recruteur écrit à un candidat connu par
// son userId. Exige qu'AU MOINS une candidature autorisée (INTERVIEW ou
// ACCEPTED) relie ce candidat à l'entreprise du recruteur connecté.
exports.ensureForCandidate = async (recruiterUser, candidateUserId) => {
  const company = await prisma.company.findUnique({ where: { userId: recruiterUser.userId } });
  if (!company) return { error: { status: 404, error: 'Profil entreprise introuvable.' } };

  const candidateUser = await prisma.user.findUnique({
    where: { id: candidateUserId },
    select: { id: true, candidate: true },
  });
  if (!candidateUser) return { error: { status: 404, error: 'Candidat introuvable.' } };

  const existingConversation = await prisma.conversation.findUnique({
    where: {
      companyUserId_candidateUserId: { companyUserId: recruiterUser.userId, candidateUserId },
    },
  });
  if (existingConversation) {
    return { conversation: await reload(existingConversation.id) };
  }

  const authorizedApplication = await prisma.application.findFirst({
    where: {
      job: { companyId: company.id },
      candidateProfileId: candidateUser.candidate?.id,
      status: { in: AUTHORIZED_APPLICATION_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
    include: { job: { select: { title: true } } },
  });

  if (!authorizedApplication) {
    return {
      error: {
        status: 403,
        error:
          "La messagerie s'ouvre lorsque vous sélectionnez ce candidat pour un entretien ou acceptez sa candidature.",
        requiredStatuses: AUTHORIZED_APPLICATION_STATUSES,
      },
    };
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      companyUserId_candidateUserId: { companyUserId: recruiterUser.userId, candidateUserId },
    },
    create: {
      companyUserId: recruiterUser.userId,
      candidateUserId,
      applicationId: authorizedApplication.id,
      subject: authorizedApplication.job.title,
    },
    update: {
      applicationId: authorizedApplication.id,
      subject: authorizedApplication.job.title,
    },
  });
  return { conversation: await reload(conversation.id), created: true };
};

// Version transactionnelle utilisée lors du changement de statut
// d'une candidature (création silencieuse, sans erreur bloquante).
exports.ensureWithinTransaction = async (tx, application) => {
  try {
    const candidateUserId = application.candidate?.userId;
    if (!candidateUserId) return null;
    const companyUserId = application.job?.company?.userId;
    if (!companyUserId) return null;

    const existing = await tx.conversation.findUnique({ where: { applicationId: application.id } });
    if (existing) return existing.id;

    const conversation = await tx.conversation.upsert({
      where: { companyUserId_candidateUserId: { companyUserId, candidateUserId } },
      update: { applicationId: application.id },
      create: {
        companyUserId,
        candidateUserId,
        applicationId: application.id,
        subject: application.job.title,
      },
    });
    return conversation.id;
  } catch (_) {
    // Ne jamais faire échouer le changement de statut pour autant.
    return null;
  }
};

exports.AUTHORIZED_APPLICATION_STATUSES = AUTHORIZED_APPLICATION_STATUSES;
exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
exports.messagingSide = messagingSide;
