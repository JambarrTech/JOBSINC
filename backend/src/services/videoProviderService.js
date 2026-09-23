/**
 * Fournisseur de visioconférence — point d'intégration unique.
 *
 * Règle absolue : ne JAMAIS générer/simuler de faux liens Google Meet.
 * Tant qu'aucun fournisseur n'est configuré, `createRoom()` renvoie null
 * et le recruteur doit fournir son propre lien (streamingUrl).
 *
 * Fournisseurs supportés:
 * - Daily.co (recommandé): DAILY_API_KEY
 * - Whereby: WHEREBY_API_KEY
 * - Google Meet: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (nécessite Workspace)
 */

const crypto = require('crypto');
const provider = process.env.VIDEO_PROVIDER || ''; // '', 'daily', 'whereby', 'google'

function isConfigured() {
  switch (provider) {
    case 'daily':
      return Boolean(process.env.DAILY_API_KEY);
    case 'whereby':
      return Boolean(process.env.WHEREBY_API_KEY);
    case 'google':
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    default:
      return false;
  }
}

function getDailyDomain() {
  return process.env.DAILY_DOMAIN || 'jobsinc.daily.co';
}

async function createDailyRoom({ applicationId, scheduledAt, durationMinutes = 60 }) {
  const roomName = `jobsinc-${applicationId}-${crypto.randomBytes(4).toString('hex')}`;
  
  const apiKey = process.env.DAILY_API_KEY;
  const privacy = process.env.DAILY_ROOM_PRIVACY || 'private';
  
  const body = {
    name: roomName,
    privacy,
    properties: {
      max_participants: 10,
      enable_screenshare: true,
      enable_chat: true,
      start_video_off: false,
      start_audio_off: false,
      lang: 'fr',
      exp: Math.floor((scheduledAt ? new Date(scheduledAt).getTime() : Date.now()) / 1000) + durationMinutes * 60 + 3600,
      nbf: Math.floor((scheduledAt ? new Date(scheduledAt).getTime() : Date.now()) / 1000) - 600,
    },
  };

  try {
    const response = await fetch(`https://api.daily.co/v1/rooms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Daily.co] Erreur création salle:', response.status, error);
      // Règle absolue : jamais de lien simulé. L'échec renvoie null et le
      // recruteur devra fournir son propre lien (streamingUrl).
      return null;
    }

    const data = await response.json();
    return { url: data.url, provider: 'daily', roomId: data.name };
  } catch (error) {
    console.error('[Daily.co] Erreur réseau:', error.message);
    return null;
  }
}

async function createWherebyRoom({ applicationId, scheduledAt, durationMinutes = 60 }) {
  const apiKey = process.env.WHEREBY_API_KEY;
  const roomName = `jobsinc-${applicationId}-${crypto.randomBytes(4).toString('hex')}`;

  const body = {
    roomName,
    roomMode: 'normal',
    endDate: scheduledAt 
      ? new Date(new Date(scheduledAt).getTime() + durationMinutes * 60000).toISOString()
      : new Date(Date.now() + durationMinutes * 60000 + 3600000).toISOString(),
    fields: ['roomUrl', 'roomName'],
  };

  try {
    const response = await fetch(`https://api.whereby.dev/v1/meetings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Whereby] Erreur création salle:', response.status, error);
      return null;
    }

    const data = await response.json();
    return { url: data.roomUrl, provider: 'whereby', roomId: data.roomName };
  } catch (error) {
    console.error('[Whereby] Erreur réseau:', error.message);
    return null;
  }
}

async function createGoogleMeetRoom({ applicationId, scheduledAt, durationMinutes = 60 }) {
  console.warn('[Google Meet] Intégration non implémentée - nécessite Google Workspace et API Meet');
  return null;
}

/**
 * Crée une salle de visioconférence pour un entretien.
 * @param {Object} params
 * @param {string} params.applicationId - ID de la candidature
 * @param {Date|string} [params.scheduledAt] - Date/heure planifiée
 * @param {number} [params.durationMinutes=60] - Durée en minutes
 * @returns {Promise<{url: string, provider: string, roomId?: string, warning?: string} | null>}
 *   null si non configuré ou non implémenté : le contrôleur demandera
 *   alors au recruteur de fournir le lien streamingUrl.
 */
async function createRoom({ applicationId, scheduledAt, durationMinutes = 60 }) {
  if (!isConfigured()) return null;

  switch (provider) {
    case 'daily':
      return createDailyRoom({ applicationId, scheduledAt, durationMinutes });
    case 'whereby':
      return createWherebyRoom({ applicationId, scheduledAt, durationMinutes });
    case 'google':
      return createGoogleMeetRoom({ applicationId, scheduledAt, durationMinutes });
    default:
      console.warn(`[videoProviderService] Fournisseur "${provider}" inconnu`);
      return null;
  }
}

async function deleteRoom(roomId, providerName = provider) {
  if (!roomId) return false;

  try {
    switch (providerName) {
      case 'daily': {
        const domain = getDailyDomain();
        const apiKey = process.env.DAILY_API_KEY;
        const response = await fetch(`https://api.daily.co/v1/rooms/${roomId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return response.ok;
      }
      case 'whereby': {
        const apiKey = process.env.WHEREBY_API_KEY;
        const response = await fetch(`https://api.whereby.dev/v1/meetings/${roomId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return response.ok;
      }
      default:
        return false;
    }
  } catch (error) {
    console.error(`[${providerName}] Erreur suppression salle:`, error.message);
    return false;
  }
}

async function getRoomInfo(roomId, providerName = provider) {
  if (!roomId) return null;

  try {
    switch (providerName) {
      case 'daily': {
        const apiKey = process.env.DAILY_API_KEY;
        const response = await fetch(`https://api.daily.co/v1/rooms/${roomId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!response.ok) return null;
        return await response.json();
      }
      case 'whereby': {
        const apiKey = process.env.WHEREBY_API_KEY;
        const response = await fetch(`https://api.whereby.dev/v1/meetings/${roomId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!response.ok) return null;
        return await response.json();
      }
      default:
        return null;
    }
  } catch (error) {
    console.error(`[${providerName}] Erreur info salle:`, error.message);
    return null;
  }
}

module.exports = { 
  provider, 
  isConfigured, 
  createRoom,
  deleteRoom,
  getRoomInfo,
};