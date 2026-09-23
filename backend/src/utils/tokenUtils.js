const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, id: user.id, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

async function hashAndStoreRefreshToken(userId, rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  
  return rawToken;
}

// `userId` est facultatif : passé en null sur l'endpoint /refresh où le
// refresh token (cookie httpOnly) est lui-même la preuve d'authenticité.
async function verifyRefreshToken(userId, rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });
  
  if (!stored || (userId && stored.userId !== userId)) return null;
  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return null;
  }
  
  return stored;
}

async function rotateRefreshToken(userId, oldRawToken) {
  await prisma.refreshToken.deleteMany({
    where: { userId, tokenHash: crypto.createHash('sha256').update(oldRawToken).digest('hex') },
  });
  
  return hashAndStoreRefreshToken(userId, generateRefreshToken());
}

async function revokeAllRefreshTokens(userId) {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

async function revokeRefreshToken(userId, rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.refreshToken.deleteMany({ where: { userId, tokenHash } });
}

async function cleanupExpiredRefreshTokens() {
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashAndStoreRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  cleanupExpiredRefreshTokens,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
};