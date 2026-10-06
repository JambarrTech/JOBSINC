// src/controllers/networkController.js — Réseau candidats : feed, likes,
// commentaires, follows. Auth exigée (route montée derrière `auth`).

const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { parsePagination } = require('../utils/pagination');
const service = require('../services/networkService');

const AUTHOR_INCLUDE = {
  author: { include: { candidate: true } },
};

async function notifyUser(userId, title, body, link) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, title, body, link: link || null } });
  } catch (_) {
    // Les notifications ne doivent jamais faire échouer l'action principale.
  }
}

// GET /api/network/feed?page&limit — posts récents avec compteurs.
exports.feed = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const me = req.user.userId;
    const [posts, total] = await Promise.all([
      prisma.networkPost.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          ...AUTHOR_INCLUDE,
          likes: { select: { userId: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.networkPost.count(),
    ]);
    const data = posts.map((p) => service.serializePost(p, me));
    return res.json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.feed:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de charger le fil réseau.' });
  }
};

// POST /api/network/posts {content, imageUrl?}
exports.createPost = async (req, res) => {
  try {
    if (!service.canPublish(req.user.role)) {
      return res.status(403).json({ error: 'Seuls les candidats peuvent publier.' });
    }
    const { text, error } = service.validatePost(req.body);
    if (error) return res.status(400).json({ error });
    const imageUrl = typeof req.body?.imageUrl === 'string' && req.body.imageUrl.trim()
      ? req.body.imageUrl.trim().slice(0, 500)
      : null;
    const post = await prisma.networkPost.create({
      data: { authorId: req.user.userId, content: text, imageUrl },
      include: { ...AUTHOR_INCLUDE, likes: { select: { userId: true } }, _count: { select: { likes: true, comments: true } } },
    });
    return res.status(201).json(service.serializePost(post, req.user.userId));
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.createPost:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de publier.' });
  }
};

// DELETE /api/network/posts/:id (auteur ou ADMIN)
exports.deletePost = async (req, res) => {
  try {
    const post = await prisma.networkPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Publication introuvable.' });
    if (post.authorId !== req.user.userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Suppression non autorisée.' });
    }
    await prisma.networkPost.delete({ where: { id: post.id } });
    return res.json({ message: 'Publication supprimée.' });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.deletePost:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de supprimer.' });
  }
};

// POST /api/network/posts/:id/like-toggle {liked, likesCount}
exports.toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;
    const post = await prisma.networkPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Publication introuvable.' });
    const existing = await prisma.networkLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    let liked;
    if (existing) {
      await prisma.networkLike.delete({ where: { id: existing.id } });
      liked = false;
    } else {
      try {
        await prisma.networkLike.create({ data: { postId, userId } });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
      }
      liked = true;
      if (post.authorId !== userId) {
        await notifyUser(post.authorId, 'Nouveau like', 'Un candidat a aimé votre publication.', `/candidate/network?post=${postId}`);
      }
    }
    const likesCount = await prisma.networkLike.count({ where: { postId } });
    return res.json({ liked, likesCount });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.toggleLike:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de liker.' });
  }
};

// GET /api/network/posts/:id/comments
exports.listComments = async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await prisma.networkPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Publication introuvable.' });
    const { page, limit, skip } = parsePagination(req.query);
    const [comments, total] = await Promise.all([
      prisma.networkComment.findMany({
        where: { postId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: { author: { include: { candidate: true } } },
      }),
      prisma.networkComment.count({ where: { postId } }),
    ]);
    return res.json({
      data: comments.map(service.serializeComment),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.listComments:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de charger les commentaires.' });
  }
};

// POST /api/network/posts/:id/comments {content}
exports.createComment = async (req, res) => {
  try {
    if (!service.canPublish(req.user.role)) {
      return res.status(403).json({ error: 'Seuls les candidats peuvent commenter.' });
    }
    const post = await prisma.networkPost.findUnique({ where: { id: req.params.id }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Publication introuvable.' });
    const { text, error } = service.validateComment(req.body);
    if (error) return res.status(400).json({ error });
    const comment = await prisma.networkComment.create({
      data: { postId: post.id, authorId: req.user.userId, content: text },
      include: { author: { include: { candidate: true } } },
    });
    if (post.authorId !== req.user.userId) {
      await notifyUser(post.authorId, 'Nouveau commentaire', 'Un candidat a commenté votre publication.', `/candidate/network?post=${post.id}`);
    }
    return res.status(201).json(service.serializeComment(comment));
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.createComment:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de commenter.' });
  }
};

// DELETE /api/network/comments/:commentId (auteur ou ADMIN)
exports.deleteComment = async (req, res) => {
  try {
    const comment = await prisma.networkComment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' });
    if (comment.authorId !== req.user.userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Suppression non autorisée.' });
    }
    await prisma.networkComment.delete({ where: { id: comment.id } });
    return res.json({ message: 'Commentaire supprimé.' });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.deleteComment:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de supprimer.' });
  }
};

// GET /api/network/candidates?q — annuaire candidats (sans emails).
exports.listCandidates = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const { page, limit, skip } = parsePagination(req.query);
    const where = {
      role: { in: ['CANDIDATE', 'EMPLOYEE'] },
      ...(q
        ? {
            OR: [
              { candidate: { firstName: { contains: q, mode: 'insensitive' } } },
              { candidate: { lastName: { contains: q, mode: 'insensitive' } } },
              { candidate: { skills: { contains: q, mode: 'insensitive' } } },
              { candidate: { city: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [users, total, myFollows] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, candidate: true },
      }),
      prisma.user.count({ where }),
      prisma.networkFollow.findMany({
        where: { followerId: req.user.userId },
        select: { followingId: true },
      }),
    ]);
    const followingIds = new Set(myFollows.map((f) => f.followingId));
    return res.json({
      data: users.map((u) => service.serializeCandidate(u, req.user.userId, followingIds)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.listCandidates:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de charger les candidats.' });
  }
};

// POST /api/network/follow/:userId/toggle
exports.toggleFollow = async (req, res) => {
  try {
    const followingId = req.params.userId;
    const followerId = req.user.userId;
    if (followingId === followerId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous suivre vous-même.' });
    }
    const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true, role: true } });
    if (!target || (target.role !== 'CANDIDATE' && target.role !== 'EMPLOYEE')) {
      return res.status(404).json({ error: 'Candidat introuvable.' });
    }
    const existing = await prisma.networkFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) {
      await prisma.networkFollow.delete({ where: { id: existing.id } });
      return res.json({ following: false });
    }
    try {
      await prisma.networkFollow.create({ data: { followerId, followingId } });
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
    await notifyUser(followingId, 'Nouvel abonné', 'Un candidat s\'est abonné à vous.', '/candidate/network');
    return res.json({ following: true });
  } catch (error) {
    logger.exception(error, { message: 'Erreur network.toggleFollow:', scope: 'networkController' });
    return res.status(500).json({ error: 'Impossible de modifier l\'abonnement.' });
  }
};
