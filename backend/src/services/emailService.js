// ============================================================
// SERVICE EMAIL TRANSACTIONNEL
//
// Envoie les emails de vérification et de réinitialisation via SMTP
// (nodemailer). Configuration (voir .env.example) :
//   SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//   MAIL_FROM  (défaut « JOBSINC <no-reply@jobsinc.com> »)
//   APP_URL    (URL publique qui sert à construire les liens)
//
// Sans SMTP configuré, le mode développement journalise un APERÇU du lien
// ([DEV]) afin de préserver le flux de test. Le jeton lui-même n'est JAMAIS
// écrit dans les logs — voir `redactUrlToken` : c'est un moyen de se connecter
// au compte, pas une information de diagnostic.
// ============================================================

const { createHash } = require('crypto');

const APP_URL = process.env.APP_URL || 'http://localhost:5000';

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function mailTransport() {
  // Requis tardivement : nodemailer est une dépendance optionnelle,
  // chargée uniquement si un SMTP est réellement configuré.
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
}

function mailFrom() {
  return process.env.MAIL_FROM || 'JOBSINC <no-reply@jobsinc.com>';
}

// Un lien de réinitialisation de mot de passe est un jeton d'ACCES COMPLET :
// il ouvre un compte sans mot de passe, pendant 1h, sans second facteur.
// L'ecrire en clair dans les logs le transformait en :
//   1. du materiel de prise de compte dans l'agregateur de logs (acces en
//      lecture bien plus large que la base, retention bien plus longue) ;
//   2. un défaut qui se déclenchait pile pendant un incident, quand SMTP est
//      cassé et que le volume de logs et le nombre de personnes qui les lisent
//      sont au maximum.
//
// Le lien reste CONSULTABLE (c'est le seul moyen de tester le flux sans SMTP),
// mais le jeton n'est plus imprimé : il est journalisé sous forme d'empreinte
// tronquée, suffisante pour faire la correspondance, uselesse pour se connecter.
function logDevLink(subject, url) {
  const redacted = redactUrlToken(url);
  console.warn(
    `[DEV] Email ${subject} non envoyé (SMTP non configuré). `
    + `Lien : ${redacted} — jeton NON journalisé. `
    + 'Récupérez-le depuis la réponse de l’API en développement, ou configurez SMTP.'
  );
}

/**
 * Conserve la structure de l'URL pour le diagnostic et remplace le `token` par
 * son empreinte tronquée. Ne jamais renvoyer la valeur d'origine.
 */
function redactUrlToken(url) {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token');
    if (!token) return `${parsed.origin}${parsed.pathname}?token=<absent>`;
    const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 8);
    parsed.searchParams.set('token', `REDACTED:${fingerprint}`);
    return parsed.toString();
  } catch (_) {
    return '<url illisible>';
  }
}

async function sendMail({ to, subject, text, html }) {
  if (!isEmailConfigured()) return false;
  try {
    const transporter = mailTransport();
    await transporter.sendMail({ from: mailFrom(), to, subject, text, html });
    return true;
  } catch (error) {
    console.error(`Erreur envoi email (${subject}) :`, error.message);
    return false;
  }
}

/** Lien de réinitialisation de mot de passe. */
async function sendPasswordReset(email, token) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Réinitialisation de votre mot de passe JOBSINC';
  const text = `Bonjour,\n\nCliquez sur le lien suivant pour réinitialiser votre mot de passe :\n${url}\n\nCe lien est valable 1 heure.\nSi vous n'êtes pas à l'origine de la demande, ignorez cet email.`;
  if (isEmailConfigured()) {
    return sendMail({ to: email, subject, text });
  }
  logDevLink('réinitialisation de mot de passe', url);
  return false;
}

/** Lien de vérification de l'adresse email. */
async function sendEmailVerification(email, token) {
  const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Vérification de votre adresse email JOBSINC';
  const text = `Bonjour,\n\nVérifiez votre adresse email en cliquant sur le lien suivant :\n${url}\n\nCe lien est valable 24 heures.`;
  if (isEmailConfigured()) {
    return sendMail({ to: email, subject, text });
  }
  logDevLink('de vérification email', url);
  return false;
}

module.exports = {
  isEmailConfigured,
  sendPasswordReset,
  sendEmailVerification,
};