import { NextRequest, NextResponse } from 'next/server';
import { apiEndpoint } from '@/lib/api-url';
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, sessionCookieOptions } from '@/lib/auth-cookie';

/**
 * BFF cookie — la SEULE façon fiable de poser et d'effacer le cookie de session
 * du frontend.
 *
 * Pourquoi cette route existe : le frontend et le backend sont sur deux
 * domaines différents, et `proxy.ts` est le seul lecteur côté serveur — or il ne
 * peut lire que les cookies du domaine frontend. D'où ce « miroir » : le
 * client reçoit `{ token }` du backend et le route vers ce cookie HttpOnly,
 * inaccessible à JavaScript.
 *
 * ============================================================
 * GARDE CSRF
 * ============================================================
 * `SameSite=Lax` restreint l'ENVOI du cookie, pas la POSSIBILITÉ de le poser.
 * Un formulaire cross-site pouvait donc faire écrire un `jobsinc_token` choisi
 * par l'attaquant : la requête partait avec l'`Origin` de la victime, elle
 * passait, et la session de la victime était remplacée par celle de l'attaquant
 * (fixation de session), ou simplement détruite si le jetonplanté était invalide
 * (déconnexion forcée).
 *
 * Le contrôle est donc FAIL-CLOSED : une requête mutante SANS en-tête `Origin`
 * est REFUSÉE. C'est un changement de comportement assumé — le navigateur envoie
 * toujours `Origin` sur un `POST` Same-Origin initiated par fetch/XHR, donc
 * aucun appel légitime n'est perdu.
 *
 * On ne compare plus au header `Host` (influençable derrière certains reverse-
 * proxies) mais à l'ORIGINE de la requête, telle que vue par le serveur.
 */
function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  // Fail-closed : pas d'Origin sur une requête mutante = refus.
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * Vérifie le jeton auprès du backend AVANT de le poser en cookie.
 *
 * AVANT : la seule validation était une REGEX DE FORME
 * (`/^[\w-]+\.[\w-]+\.[\w-]+$/`). Aucun appel à l'API, aucune vérification de
 * signature, aucun contrôle d'expiration. La route était donc un
 * « set-cookie sur promesse » : n'importe quelle chaîne en forme de JWT était
 * acceptée comme session.
 *
 * L'impact direct était borné parce que `proxy.ts` revalide via `/auth/me` — un
 * jeton forgé était rejeté en aval. Mais deux conséquences réelles subsistaient :
 *   - fixation de session (planter un jeton que l'attaquant possède) ;
 *   - déconnexion FORCÉE de tout utilisateur réel, puisque le proxy détruit les
 *     cookies dès que `/auth/me` refuse le jeton.
 *
 * Interroger `/auth/me` ici déplace la vérification AVANT l'écriture : un jeton
 * invalide n'est jamais posé. Le coût est un aller-retour, payé une seule fois
 * par connexion et par refresh, et non à chaque requête (le proxy continue de
 * revalider, sans changement). */
async function isTokenAccepted(token: string): Promise<boolean> {
  try {
    const res = await fetch(apiEndpoint('/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    // Backend injoignable : on REFUSE d'écrire le cookie. Fail-closed — mieux
    // vaut une reconnexion lors d'une panne backend qu'une session non vérifiée.
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 });
  }

  let token: unknown;
  try {
    const body = await request.json().catch(() => null);
    token = body?.token;
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  if (!token || typeof token !== 'string' || token.length === 0) {
    return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
  }

  // Un JWT est toujours de la forme header.payload.signature. Ce filtre n'est
  // plus une "validation" (il ne l'a jamais été) mais un garde-fou grossier
  // qui évite de faire un appel réseau pour une chaîne manifestement fausse.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: 'Token invalide.' }, { status: 400 });
  }

  if (!(await isTokenAccepted(token))) {
    return NextResponse.json({ error: 'Jeton refusé par le serveur.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_COOKIE_MAX_AGE));
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  // `maxAge: 0` suffit à expirer : aucune option de cookie ne peut être écrite
  // depuis JS, donc cette route est le SEUL moyen fiable de les effacer.
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}
