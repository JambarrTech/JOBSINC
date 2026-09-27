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

// Sockets connectés par utilisateur : socketId -> { visible, lastSeen }.
// Permet de distinguer « connecté » (WebSocket vivant) de « actif »
// (au moins un socket au premier plan). Voir isUserConnected/isUserActive.
const presenceByUser = new Map();

function trackPresence(socket, visible) {
  const userId = socket.data?.userId;
  if (!userId) return;
  let sockets = presenceByUser.get(userId);
  if (!sockets) {
    sockets = new Map();
    presenceByUser.set(userId, sockets);
  }
  // `visible === null` = déconnexion : on retire le socket.
  if (visible === null) {
    sockets.delete(socket.id);
    if (sockets.size === 0) presenceByUser.delete(userId);
    return;
  }
  sockets.set(socket.id, { visible, lastSeen: Date.now() });
}

function membershipFieldFor(role) {
  if (role === 'RECRUITER') return 'companyUserId';
  if (role === 'CANDIDATE' || role === 'EMPLOYEE') return 'candidateUserId';
  // ADMIN n'a pas de côté fixe — on vérifie les deux champs côté appelant.
  return null;
}

function init(httpServer, corsOrigins) {
  if (!corsOrigins.length) {
    console.warn('⚠️ CORS origins vide — Socket.IO autorise toute origine (dev mobile). Restreindre CORS_ORIGINS en prod.');
  }
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  function getTokenFromHandshake(socket) {
    if (socket.handshake.auth?.token) return socket.handshake.auth.token;
    // Fallback cookie HttpOnly (web BFF)
    const cookieHeader = socket.handshake.headers?.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }));
    return cookies.jobsinc_token || cookies.accessToken || cookies.token || null;
  }

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);
      if (!token || !process.env.JWT_SECRET) return next(new Error('unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!decoded?.userId) return next(new Error('unauthorized'));

      // `role` est relu en base pour la MEME raison que dans
      // `middlewares/authMiddleware.js` : le rôle du JWT peut être périmé
      // (promotion / rétrogradation / réinitialisation) pendant toute la
      // durée de vie du token d'accès (15 min).
      //
      // Ce n'était PAS cosmétique ici. `socket.data.role`.select
      // `membershipFieldFor()` (lignes 139 et 176) pour choisir la colonne
      // d'appartenance d'une room : un recruteur rétrogradé en base gardait
      // donc `role === 'RECRUITER'` et pouvait continuer à rejoindre les
      // rooms côté entreprise, alors que le meme utilisateur était déjà
      // rejeté en HTTP. Le rôle du socket et celui du middleware divergeaient
      // sur la seule donnée qui autorise l'accès.
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { tokenVersion: true, role: true },
      });
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return next(new Error('session_revoked'));
      }

      socket.data.userId = decoded.userId;
      // Rôle de la base, source de vérité. Le rôle du JWT est ignoré.
      socket.data.role = user.role;
      return next();
    } catch (_) {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);

    // ------------------------------------------------------------
    // PRÉSENCE : visible (app au premier plan) vs caché (arrière-plan).
    //
    // `isUserConnected` ne suffit PAS pour décider d'envoyer un push :
    // un socket mobile reste vivant quand l'app passe en arrière-plan
    // (le processus Flutter survit, le WebSocket est maintenu), donc
    // « connecté » ne veut pas dire « l'utilisateur regarde l'écran ».
    // Sans cette distinction, le destinataire d'un message envoyé
    // depuis le web n'était JAMAIS prévenu sur mobile.
    //
    // Le client émet `presence: { visible: bool }`. Par défaut on
    // considère le socket VISIBLE : les clients web n'émettent rien et
    // conservent exactement le comportement historique.
    // ------------------------------------------------------------
    socket.data.visible = true;
    trackPresence(socket, true);

    socket.on('presence', (payload) => {
      const visible = Boolean(payload?.visible);
      if (typeof socket.data.visible === 'boolean' && socket.data.visible === visible) {
        return;
      }
      socket.data.visible = visible;
      trackPresence(socket, visible);
    });

    socket.on('disconnect', () => {
      trackPresence(socket, null);
    });

    socket.on('conversation:join', async (conversationId, ack) => {
      if (typeof conversationId !== 'string' || !conversationId) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      try {
        const field = membershipFieldFor(socket.data.role);
        let membership = null;
        if (field) {
          membership = await prisma.conversation.findFirst({
            where: { id: conversationId, [field]: socket.data.userId },
            select: { id: true },
          });
        } else {
          membership = await prisma.conversation.findFirst({
            where: { id: conversationId, OR: [{ companyUserId: socket.data.userId }, { candidateUserId: socket.data.userId }] },
            select: { id: true },
          });
        }
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

    // Relais « en train d'écrire » : vérifie l'appartenance (contrairement
    // au join, le client pourrait émettre sans avoir rejoint).
    socket.on('conversation:typing', async (payload) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== 'string' || !conversationId) return;
      try {
        const field = membershipFieldFor(socket.data.role);
        let isMember = false;
        if (field) {
          const m = await prisma.conversation.findFirst({ where: { id: conversationId, [field]: socket.data.userId }, select: { id: true } });
          isMember = Boolean(m);
        } else {
          // ADMIN : vérifie les deux côtés
          const m = await prisma.conversation.findFirst({ where: { id: conversationId, OR: [{ companyUserId: socket.data.userId }, { candidateUserId: socket.data.userId }] }, select: { id: true } });
          isMember = Boolean(m);
        }
        if (!isMember) return;
      } catch { return; }
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

// Un utilisateur est « ACTIF » s'il a au moins un socket au PREMIER PLAN.
//
// C'est ce prédicat, et non `isUserConnected`, qui doit piloter l'envoi d'un
// push : un socket mobile survit au passage en arrière-plan, donc se fier à
// la seule connexion revenait à supprimer tout push sur mobile — exactement
// le symptôme « aucune notification en arrière-plan ».
//
// Repli : si le client n'a jamais émis `presence` (web actuel, ancien binaire
// mobile), on retombe sur l'ancienne sémantique « connecté = actif » afin de
// ne pas dégrader les clients qui ne savent pas encore signaler leur état.
function isUserActive(userId) {
  if (!userId) return false;
  const sockets = presenceByUser.get(userId);
  if (!sockets || sockets.size === 0) return isUserConnected(userId);
  for (const state of sockets.values()) {
    if (state.visible) return true;
  }
  return false;
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

module.exports = { init, notifyNewMessage, isUserConnected, isUserActive, notifyInterviewUpdate };
