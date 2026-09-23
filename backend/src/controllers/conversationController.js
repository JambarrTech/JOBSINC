const service = require('../services/conversationService');

// ============================================================
// CONTRÔLEUR UNIFIÉ /api/conversations
// Endpoints role-aware : le rôle détermine le côté de la conversation
// (RECRUITER → côté entreprise ; CANDIDATE/EMPLOYEE → côté candidat).
// ============================================================

function fail(res, result) {
  res.status(result.error.status || 500).json({ error: result.error.error });
}

exports.list = async (req, res) => {
  try {
    res.json(await service.listForUser(req.user, req.query));
  } catch (error) {
    console.error('Erreur conversations.list:', error);
    res.status(500).json({ error: 'Impossible de charger les conversations.' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const result = await service.getAuthorizedConversation(req.user, req.params.conversationId);
    if (result.error) return fail(res, result);
    res.json({ conversation: service.serializeDetail(result.conversation, req.user.userId) });
  } catch (error) {
    console.error('Erreur conversations.getOne:', error);
    res.status(500).json({ error: 'Impossible de charger la conversation.' });
  }
};

exports.messages = async (req, res) => {
  try {
    const result = await service.listMessages(req.user, req.params.conversationId, req.query);
    if (result.error) return fail(res, result);
    res.json(result);
  } catch (error) {
    console.error('Erreur conversations.messages:', error);
    res.status(500).json({ error: 'Impossible de charger les messages.' });
  }
};

exports.send = async (req, res) => {
  try {
    const result = await service.sendMessage(req.user, req.params.conversationId, req.body?.content);
    if (result.error) return fail(res, result);
    res.status(201).json(result.message);
  } catch (error) {
    console.error('Erreur conversations.send:', error);
    res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
};

exports.markRead = async (req, res) => {
  try {
    const result = await service.markConversationAsRead(req.user, req.params.conversationId);
    if (result.error) return fail(res, result);
    res.json({ message: 'Messages marqués comme lus.' });
  } catch (error) {
    console.error('Erreur conversations.markRead:', error);
    res.status(500).json({ error: 'Impossible de marquer les messages.' });
  }
};
