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

function loadServiceAccount() {
  // Priorité 1: JSON inline dans env (idéal Vercel : FCM_SERVICE_ACCOUNT_JSON)
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    try {
      // Supporte base64 (Vercel peut stocker le JSON en base64 pour éviter les problèmes d'échappement)
      let jsonStr = inline;
      if (!jsonStr.trim().startsWith('{')) {
        // Tente base64 decode
        try { jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8'); } catch {}
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn(`Push: FCM_SERVICE_ACCOUNT_JSON invalide (${e.message})`);
      return null;
    }
  }
  // Priorité 2: FCM_SERVICE_ACCOUNT_PATH (fichier)
  const keyPath = process.env.FCM_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, '..', '..', 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (e) {
    console.warn(`Push: lecture ${keyPath} impossible (${e.message})`);
    return null;
  }
}

function init() {
  if (initAttempted) return;
  initAttempted = true;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn('Push: clé de service Firebase introuvable — push désactivé. Définissez FCM_SERVICE_ACCOUNT_JSON sur Vercel ou fournissez serviceAccountKey.json.');
      return;
    }
    // Requires locaux : évite de charger Firebase quand il n'y a pas de clé.
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

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

// Erreurs DÉFINITIVES liées au token lui-même : le token ne doit plus
// être réutilisé (expiré, désenregistré ou malformé).
//
// NB : pour un token malformé, FCM renvoie souvent 'messaging/invalid-
// argument' avec le message « …not a valid FCM registration token ».
// On distingue ce cas d'un 'invalid-argument' causé par le payload du
// lot (qui, lui, ne doit PAS entraîner de suppression).
function isDefinitiveTokenError(error) {
  if (!error) return false;
  if (
    error.code === 'messaging/registration-token-not-registered' ||
    error.code === 'messaging/invalid-registration-token' ||
    error.code === 'messaging/unregistered'
  ) {
    return true;
  }
  return (
    error.code === 'messaging/invalid-argument' &&
    typeof error.message === 'string' &&
    /registration token/i.test(error.message)
  );
}

async function sendToUser(userId, notification, data = {}) {
  if (!messaging) return { sent: 0 };

  // `tokens` déclaré hors du try : nécessaire au nettoyage ci-dessous.
  let tokens = [];
  let response;
  try {
    tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return { sent: 0 };

    response = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification,
      data,
      android: { priority: 'high' },
    });
  } catch (error) {
    // Échec GLOBAL du lot (réseau, auth Firebase, quota…) : erreur
    // temporaire, on ne supprime aucun token.
    console.warn(`Push: envoi impossible (${error.code || 'sans code'}): ${error.message}`);
    return { sent: 0 };
  }

  const failedCodes = [];
  const invalid = [];
  response.responses.forEach((result, index) => {
    if (result.success || !result.error) return;

    failedCodes.push(result.error.code || 'sans code');
    if (isDefinitiveTokenError(result.error)) {
      invalid.push(tokens[index].token);
    }
  });

  if (invalid.length > 0) {
    const deleted = await prisma.deviceToken
      .deleteMany({ where: { token: { in: invalid } } })
      .then((r) => r.count)
      .catch((e) => {
        console.warn(`Push: suppression des tokens invalides impossible: ${e.message}`);
        return 0;
      });
    if (deleted > 0) {
      console.log(
        `Push: ${deleted} token(s) invalide(s) supprimé(s) de la base pour l'utilisateur ${userId}.`
      );
    }
  }

  // Échecs restants sans token supprimé : erreurs temporaires
  // (unavailable, quota, third-party…) ou payload rejeté pour tout le
  // lot. Tokens conservés, simple trace.
  if (failedCodes.length > 0 && invalid.length === 0) {
    console.warn(
      `Push: ${failedCodes.length} envoi(s) échoué(s), tokens conservés ` +
        `(codes: ${[...new Set(failedCodes)].join(', ')}).`
    );
  }

  return { sent: response.successCount };
}

module.exports = { init, sendToUser };
