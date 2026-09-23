// ============================================================
// SERVICE EMAIL TRANSACTIONNEL
//
// Envoie les emails de vérification et de réinitialisation via SMTP
// (nodemailer). Configuration (voir .env.example) :
//   SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//   MAIL_FROM  (défaut « JOBSINC <no-reply@jobsinc.com> »)
//   APP_URL    (URL publique qui sert à construire les liens)
//
// Sans SMTP configuré, le mode développement se contente de journaliser
// le lien en console ([DEV]) afin de préserver le flux de test SANS
// jamais retourner le jeton dans une réponse HTTP.
// ============================================================

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

function logDevLink(subject, url) {
  console.log(`[DEV] Email ${subject} non envoyé (SMTP non configuré). Lien : ${url}`);
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