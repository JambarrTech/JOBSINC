const prisma = require('../config/prisma');

function isRecruiter(req, res) {
  if (req.user?.role !== 'RECRUITER') {
    res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    return false;
  }
  return true;
}

exports.listConversations = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const conversations = await prisma.conversation.findMany({
      where: { companyUserId: req.user.userId },
      include: {
        candidateUser: { include: { candidate: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const result = conversations.map((conv) => {
      const candidate = conv.candidateUser?.candidate;
      const lastMsg = conv.messages[0] || null;
      const unreadCount = 0;
      return {
        id: conv.id,
        conversationId: conv.id,
        participantName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Candidat',
        candidateId: conv.candidateUser?.id || null,
        candidateUserId: conv.candidateUser?.id || null,
        avatar: candidate?.avatarUrl || null,
        subject: conv.subject || 'Conversation de recrutement',
        preview: lastMsg?.content?.substring(0, 120) || 'Aucun message',
        content: lastMsg?.content || '',
        date: lastMsg?.createdAt?.toISOString() || conv.createdAt.toISOString(),
        createdAt: conv.createdAt.toISOString(),
        unread: false,
        read: true,
      };
    });

    const unreadCounts = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        receiverId: req.user.userId,
        isRead: false,
      },
      _count: { id: true },
    });

    const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count.id]));
    for (const conv of result) {
      const count = unreadMap.get(conv.id) || 0;
      conv.unread = count > 0;
      conv.read = count === 0;
      conv.unreadCount = count;
    }

    res.json(result);
  } catch (error) {
    console.error('Erreur listConversations:', error);
    res.status(500).json({ error: 'Impossible de charger les conversations.' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const { conversationId } = req.params;
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyUserId: req.user.userId },
      include: { candidateUser: { include: { candidate: true } } },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable.' });

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const candidate = conversation.candidateUser?.candidate;
    res.json({
      conversation: {
        id: conversation.id,
        participantName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Candidat',
        avatar: candidate?.avatarUrl || null,
        subject: conversation.subject || 'Conversation de recrutement',
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        senderId: msg.senderId,
        content: msg.content,
        isRead: msg.isRead,
        isMine: msg.senderId === req.user.userId,
        createdAt: msg.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Erreur getMessages:', error);
    res.status(500).json({ error: 'Impossible de charger les messages.' });
  }
};

exports.send = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const { candidateUserId, content, subject } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    if (!candidateUserId) return res.status(400).json({ error: 'Destinataire manquant.' });

    const candidateUser = await prisma.user.findUnique({
      where: { id: candidateUserId },
      include: { candidate: true },
    });
    if (!candidateUser) return res.status(404).json({ error: 'Candidat introuvable.' });

    let conversation = await prisma.conversation.findUnique({
      where: { companyUserId_candidateUserId: { companyUserId: req.user.userId, candidateUserId } },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          companyUserId: req.user.userId,
          candidateUserId,
          subject: subject || null,
        },
      });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: req.user.userId,
        receiverId: candidateUserId,
        content: content.trim(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    const candidate = candidateUser.candidate;
    res.status(201).json({
      id: message.id,
      conversationId: conversation.id,
      senderId: message.senderId,
      content: message.content,
      isRead: false,
      isMine: true,
      createdAt: message.createdAt.toISOString(),
      participantName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Candidat',
    });
  } catch (error) {
    console.error('Erreur send:', error);
    res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const { conversationId } = req.params;
    await prisma.message.updateMany({
      where: { conversationId, receiverId: req.user.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'Messages marqués comme lus.' });
  } catch (error) {
    console.error('Erreur markAsRead:', error);
    res.status(500).json({ error: 'Impossible de marquer les messages.' });
  }
};
