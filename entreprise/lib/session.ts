/**
 * Nettoyage de session côté client.
 *
 * Les cookies d'accès sont posés en `httpOnly` par le BFF (`/api/auth/cookie`),
 * ce qui est précisément ce qui protège le jeton contre le vol par XSS. La
 * conséquence directe est qu'un `document.cookie = 'jobsinc_token=; max-age=0'`
 * n'a AUCUN effet : JavaScript ne peut pas écrire un cookie HttpOnly.
 * Les trois composants qui faisaient cela (DashboardSidebar, AdminShell,
 * AdminAuthGuard) donnaient l'illusion d'une déconnexion alors que la session
 * restait active. La suppression passe donc par l'API de suppression de cookies
 * + l'endpoint de déconnexion du backend, via cette fonction unique.
 */

import { apiEndpoint } from '@/lib/api-url';

/** Supprime les cookies d'accès du domaine frontend (BFF). */
export async function clearSessionCookies(): Promise<void> {
  try {
    await fetch('/api/auth/cookie', { method: 'DELETE', credentials: 'include', cache: 'no-store' });
  } catch {
    // Le BFF peut être injoignable : on poursuis la déconnexion côté backend.
  }
}

/** Déconnecte réellement : backend (révoque refresh tokens) puis cookies frontend. */
export async function signOut(): Promise<void> {
  // Le socket doit être fermé AVANT de supprimer le cookie : sans cela la
  // connexion restait active (et tentait de se reconnecter avec un token
  // révoqué) jusqu'au rechargement complet de la page.
  const { disconnectSocket } = await import('@/lib/socket');
  disconnectSocket();

  try {
    await fetch(apiEndpoint('/auth/logout'), { method: 'POST', credentials: 'include', cache: 'no-store' });
  } catch {
    // Idem : la révocation serveur peut échouer si le backend est down. Les
    // cookies sont néanmoins effacés localement.
  }
  await clearSessionCookies();
}
