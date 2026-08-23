const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');

// ============================================================
// PUSH SERVICE — Notifications FCM (firebase-admin >= 13)
//
// - Initialisation paresseuse via la clé de service déclarée par
//   FCM_SERVICE_ACCOUNT_PATH (défaut : ./serviceAccountKey.json).
//   Sans clé, tout est no-op et le serveur démarre normalement.
// - sendToUser : envoie à TOUS les appareils de l'utilisateur et
//   nettoie les tokens devenus invalides.
// - API modulaire : firebase-admin/app + firebase-admin/messaging.
// ============================================================

let messaging = null;
let initAttempted = false;

function init() {
  if (initAttempted) return;
  initAttempted = true;
  try {
    const keyPath = process.env.FCM_SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, '..', '..', 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
      console.warn('Push: clé de service Firebase introuvable — push désactivé.');
      return;
    }
    // Requires locaux : évite de charger Firebase quand il n'y a pas de clé.
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    messaging = getMessaging();
    console.log(`Push: Firebase initialisé (projet ${serviceAccount.project_id}).`);
  } catch (error) {
    console.warn(`Push: initialisation impossible (${error.message}).`);
    messaging = null;
  }
}

function isInvalidTokenError(error) {
  // 'invalid-argument' : token malformé rejeté par FCM.
  // 'registration-token-not-registered' / 'unregistered' : token expiré.
  return error &&
    (error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/unregistered' ||
      error.code === 'messaging/invalid-argument');
}

async function sendToUser(userId, notification, data = {}) {
  if (!messaging) return { sent: 0 };
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return { sent: 0 };

  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification,
    data,
    android: { priority: 'high' },
  });

  // Supprime les tokens que FCM déclare morts.
  const invalid = [];
  response.responses.forEach((result, index) => {
    if (!result.success && isInvalidTokenError(result.error)) {
      invalid.push(tokens[index].token);
    }
  });
  if (invalid.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } }).catch(() => {});
  }

  return { sent: response.successCount };
}

module.exports = { init, sendToUser };
