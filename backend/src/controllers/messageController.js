const service = require('../services/conversationService');

// ============================================================
// CONTRÔLEUR LEGACY /api/company/messages (recruteur)
// Adaptateurs minces au-dessus de conversationService : les formes de
// réponse d'origine sont conservées pour ne rien casser côté web
// (entreprise) et mobile recruteur. Toute la logique métier et de
// sécurité est déléguée au service partagé.
// ============================================================

function isRecruiter(req, res) {
  if (req.user?.role !== 'RECRUITER') {
    res.status(403).json({ error: 'Cet espace est réservé aux recruteurs.' });
    return false;
  }
  return true;
}

function fail(res, result) {
  res.status(result.error.status || 500).json({ error: result.error.error });
}

exports.listConversations = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const result = await service.listForUser(req.user);
    // Forme historique : tableau simple.
    res.json(result.data);
  } catch (error) {
    console.error('Erreur listConversations:', error);
    res.status(500).json({ error: 'Impossible de charger les conversations.' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const result = await service.listMessages(req.user, req.params.conversationId, req.query);
    if (result.error) return fail(res, result);
    res.json(result);
  } catch (error) {
    console.error('Erreur getMessages:', error);
    res.status(500).json({ error: 'Impossible de charger les messages.' });
  }
};

exports.send = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const { candidateUserId, content } = req.body;
    if (!candidateUserId) return res.status(400).json({ error: 'Destinataire manquant.' });

    const ensured = await service.ensureForCandidate(req.user, candidateUserId);
    if (ensured.error) return fail(res, ensured);

    const sent = await service.sendMessage(req.user, ensured.conversation.id, content);
    if (sent.error) return fail(res, sent);

    const detail = service.serializeDetail(ensured.conversation, req.user.userId);
    res.status(201).json({
      ...sent.message,
      participantName: detail.participantName,
      subject: detail.subject,
      jobTitle: detail.jobTitle,
    });
  } catch (error) {
    console.error('Erreur send:', error);
    res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    if (!isRecruiter(req, res)) return;
    const result = await service.markConversationAsRead(req.user, req.params.conversationId);
    if (result.error) return fail(res, result);
    res.json({ message: 'Messages marqués comme lus.' });
  } catch (error) {
    console.error('Erreur markAsRead:', error);
    res.status(500).json({ error: 'Impossible de marquer les messages.' });
  }
};
