const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

// ============================================================
// SOCKET SERVICE — Messagerie temps réel
//
// Authentification : JWT transmis dans handshake.auth.token.
// Rooms :
// - user:<userId>            → rejointe automatiquement à la connexion,
//                              sert à prévenir un destinataire hors conversation.
// - conversation:<id>        → rejointe sur demande (conversation:join),
//                              après vérification de l'appartenance en base.
//
// Événements serveur → clients :
// - message:new { conversationId } : minimal volontairement ; le client
//   recharge le contenu via l'API REST (sérialisation propre au viewer).
// - typing { conversationId, userId, typing } : relais « en train
//   d'écrire », envoyé uniquement aux autres membres de la room.
// Événements clients → serveur :
// - conversation:join / conversation:leave { conversationId }
// - conversation:typing { conversationId, typing }
// ============================================================

let io = null;

function membershipFieldFor(role) {
  // Même règle que messagingSide() du conversationService.
  return role === 'RECRUITER' ? 'companyUserId' : 'candidateUserId';
}

function init(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      // Aucune origine configurée (dev mobile natif) : on n'applique pas CORS.
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || !process.env.JWT_SECRET) return next(new Error('unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!decoded?.userId) return next(new Error('unauthorized'));

      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { tokenVersion: true } });
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return next(new Error('session_revoked'));
      }

      socket.data.userId = decoded.userId;
      socket.data.role = decoded.role || null;
      return next();
    } catch (_) {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);

    socket.on('conversation:join', async (conversationId, ack) => {
      if (typeof conversationId !== 'string' || !conversationId) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      try {
        const field = membershipFieldFor(socket.data.role);
        if (!field) {
          if (typeof ack === 'function') ack({ ok: false });
          return;
        }
        const membership = await prisma.conversation.findFirst({
          where: { id: conversationId, [field]: socket.data.userId },
          select: { id: true },
        });
        if (!membership) {
          if (typeof ack === 'function') ack({ ok: false });
          return;
        }
        await socket.join(`conversation:${conversationId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) {
        console.error('Erreur socket.conversation:join:', error);
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      if (typeof conversationId === 'string' && conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // Relais « en train d'écrire » : uniquement vers les AUTRES membres
    // de la room (socket.to exclut l'émetteur). L'appartenance est déjà
    // garantie par le join.
    socket.on('conversation:typing', (payload) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== 'string' || !conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.data.userId,
        typing: Boolean(payload.typing),
      });
    });
  });

  return io;
}

// Un utilisateur est « en ligne » s'il a au moins un socket connecté.
// Utilisé pour décider d'envoyer (ou non) une notification push FCM.
function isUserConnected(userId) {
  if (!io || !userId) return false;
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}

// Prévient les clients concernés qu'un nouveau message est arrivé.
// Le destinataire reçoit l'événement même s'il n'a pas ouvert la
// conversation (room user:<id>) afin de rafraîchir listes/badges.
function notifyNewMessage(conversationId, receiverUserId) {
  if (!io || !conversationId) return;
  const payload = { conversationId };
  io.to(`conversation:${conversationId}`).emit('message:new', payload);
  if (receiverUserId && typeof receiverUserId === 'string') {
    io.to(`user:${receiverUserId}`).emit('message:new', payload);
  }
}

// Prévient les clients concernés qu'un entretien a changé d'état
// (PLANIFIE / EN_COURS / TERMINE / ANNULE). Réutilise les rooms
// user:<id> : aucun nouveau système temps réel.
function notifyInterviewUpdate(userIds, payload) {
  if (!io || !Array.isArray(userIds)) return;
  for (const userId of userIds) {
    if (userId && typeof userId === 'string') {
      io.to(`user:${userId}`).emit('interview:update', payload || {});
    }
  }
}

module.exports = { init, notifyNewMessage, isUserConnected, notifyInterviewUpdate };
