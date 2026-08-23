/**
 * Fournisseur de visioconférence — point d'intégration unique.
 *
 * Règle absolue : ne JAMAIS générer/simuler de faux liens Google Meet.
 * Tant qu'aucun fournisseur n'est configuré, `createRoom()` renvoie null
 * et le recruteur doit fournir son propre lien (streamingUrl).
 *
 * Pour brancher un vrai fournisseur (ex. Google Meet API, Daily, Whereby) :
 *  1. renseigner les variables d'env correspondantes dans .env ;
 *  2. implémenter l'appel API réel dans createRoom() ci-dessous ;
 *  3. le contrôleur interviewController.schedule utilisera la valeur
 *     retournée quand streamingUrl n'est pas fournie.
 */

const provider = process.env.VIDEO_PROVIDER || ''; // '', 'google', 'daily', ...

function isConfigured() {
  switch (provider) {
    case 'google':
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case 'daily':
      return Boolean(process.env.DAILY_API_KEY);
    default:
      return false;
  }
}

/**
 * Crée une salle de visioconférence pour un entretien.
 * @returns {Promise<{url: string, provider: string} | null>} null si non configuré.
 */
async function createRoom({ applicationId, scheduledAt }) {
  if (!isConfigured()) return null;
  // TODO: appel réel au fournisseur choisi (Google Meet API / Daily / ...).
  // Ex. Google : créer un espace "meetingSpaces" puis retourner meetingUri.
  throw new Error(`Fournisseur vidéo "${provider}" déclaré mais non implémenté — fournissez un lien streamingUrl.`);
}

module.exports = { provider, isConfigured, createRoom };
