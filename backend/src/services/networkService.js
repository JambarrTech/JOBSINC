// src/services/networkService.js — Sérialisation + validation du réseau candidats.
//
// Fonctions pures (testables sans base) séparées du contrôleur, sur le même
// modèle que conversationService pour la partie sérialisation.

const MAX_POST_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 500;

function cleanText(value, max) {
  const text = String(value || '').trim();
  if (!text) return { error: 'Le contenu est requis.' };
  if (text.length > max) return { error: `Maximum ${max} caractères.` };
  return { text };
}

function validatePost(body) {
  return cleanText(body?.content, MAX_POST_LENGTH);
}

function validateComment(body) {
  return cleanText(body?.content, MAX_COMMENT_LENGTH);
}

// Rôles autorisés à PUBLIER (lecture : tout utilisateur authentifié).
function canPublish(role) {
  return role === 'CANDIDATE' || role === 'EMPLOYEE' || role === 'ADMIN';
}

function authorView(user) {
  if (!user) return { id: '', name: 'Candidat', avatarUrl: null };
  const profile = user.candidate || null;
  const first = (profile?.firstName || '').trim();
  const last = (profile?.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  return {
    id: user.id,
    name: full || user.email || 'Candidat',
    avatarUrl: profile?.avatarUrl || null,
    city: profile?.city || null,
    skills: profile?.skills || null,
  };
}

function serializePost(post, currentUserId) {
  const likes = post.likes || [];
  const comments = post.comments || [];
  const likeCount = typeof post._count?.likes === 'number' ? post._count.likes : likes.length;
  const commentCount = typeof post._count?.comments === 'number' ? post._count.comments : comments.length;
  return {
    id: post.id,
    content: post.content,
    imageUrl: post.imageUrl || null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: authorView(post.author),
    likesCount: likeCount,
    commentsCount: commentCount,
    likedByMe: currentUserId
      ? likes.some((l) => (l.userId || l.user?.id) === currentUserId)
      : false,
  };
}

function serializeComment(comment) {
  return {
    id: comment.id,
    postId: comment.postId,
    content: comment.content,
    createdAt: comment.createdAt,
    author: authorView(comment.author),
  };
}

function serializeCandidate(user, currentUserId, followingIds) {
  const profile = user.candidate || null;
  const first = (profile?.firstName || '').trim();
  const last = (profile?.lastName || '').trim();
  return {
    id: user.id,
    name: `${first} ${last}`.trim() || user.email,
    avatarUrl: profile?.avatarUrl || null,
    city: profile?.city || null,
    country: profile?.country || null,
    skills: profile?.skills || null,
    isSelf: user.id === currentUserId,
    isFollowing: followingIds ? followingIds.has(user.id) : false,
  };
}

module.exports = {
  MAX_POST_LENGTH,
  MAX_COMMENT_LENGTH,
  validatePost,
  validateComment,
  canPublish,
  authorView,
  serializePost,
  serializeComment,
  serializeCandidate,
};
