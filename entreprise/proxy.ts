import { NextRequest, NextResponse } from 'next/server';
import { isAdminRole, isRecruiterRole } from '@/lib/admin-roles';
import { apiEndpoint } from '@/lib/api-url';
import { SESSION_COOKIE } from '@/lib/auth-cookie';

// `PUBLIC_PATHS` / `isPublicPath` ont été SUPPRIMÉS. Ils n'étaient
// INATTEIGNABLES : le `matcher` de ce fichier (`config.matcher`, en bas) ne
// lance le proxy que sur `/admin/:path*` et `/dashboard/:path*`, donc
// `pathname` ne peut jamais valoir `/`, `/login`, `/jobs`, `/_next`,
// `/favicon.ico` ou `/api`. La branche `if (isPublicPath(pathname)) return
// NextResponse.next()` était donc un `return` inatteignable : elle donnait
// l'illusion d'une liste d'exceptions maintenue à la main alors que le
// contrôle réel est, et doit rester, le `matcher` (voir le commentaire sur le
// lookahead `public` : un matcher mal écrit expose des pages, une liste
// d'exceptions ajoutée ici ne protège de rien). Toute nouvelle route publique
// se déclare dans le `matcher`, pas ici.
type SessionUser = { id: string; role?: string };

/**
 * Vérifie le jeton via l'API (source de vérité : `tokenVersion` permet la
 * révocation côté serveur).
 *
 * NOTE — pas de cache module-level ici. Next 16 exécute le proxy sur le runtime
 * Node et la doc recommande explicitement de ne pas compter sur des modules
 * partagés ou des globales (« you should not attempt relying on shared modules
 * or globals », `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:19`).
 * L'ancien `Map` était de toute façon étiqueté « LRU 60s » alors
 * que le TTL réel était de 10 s et que l'éviction était FIFO.
 *
 * Le cache est donc porté par la requête via `fetch` : la prochaine requête
 * sur la même session est tout de même couverte par le cache HTTP de la
 * plateforme. Le contrôle serveur reste ainsi exact, et une panne backend ne
 * peut jamais devenir une validation locale du JWT (fail-closed).
 */
async function verifyToken(token: string): Promise<{ valid: boolean; user?: SessionUser }> {
  try {
    const res = await fetch(apiEndpoint('/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { valid: false };
    const data = await res.json().catch(() => null);
    const id = data?.user?.id || data?.user?.userId || data?.id;
    const role = data?.user?.role || data?.role;
    if (!id) return { valid: false };
    return { valid: true, user: { id: String(id), role } };
  } catch {
    // Une panne backend ne doit jamais devenir une validation locale du JWT.
    return { valid: false };
  }
}

/**
 * Lit le cookie de session.
 *
 * UN SEUL nom est accepté : `SESSION_COOKIE`. Les alias `accessToken` et
 * `token` que le backend accepte pour ses propres clients n'ont JAMAIS été
 * écrits par cette application. Les lire ici revenait à promouvoir en
 * credential transportée n'importe quel cookie portant ces noms génériques sur
 * le domaine frontend — donc un cookie posé par un script tiers ou une app
 * voisine devenait un jeton d'accès. Voir le commentaire de `lib/auth-cookie.ts`.
 */
function readToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboardRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  if (!isAdminRoute && !isDashboardRoute) {
    return NextResponse.next();
  }

  const isAdminLogin = pathname === '/admin/login';
  const token = readToken(request);

  // `/admin/login` est la page de connexion : elle ne doit jamais rediriger
  // vers elle-même, sinon boucle sur utilisateur non connecté.
  if (isAdminLogin && !token) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL(isAdminRoute ? '/admin/login' : '/login', request.url));
  }

  const { valid, user } = await verifyToken(token);
  if (!valid || !user) {
    const response = NextResponse.redirect(new URL(isAdminRoute ? '/admin/login' : '/login', request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const role = user.role;

  // Rôles admin partagés avec lib/admin-api.ts : la liste de rôles provient
  // de `lib/admin-roles.ts`, qui est aligné sur `enum Role` du schéma Prisma.
  if (isAdminRoute) {
    if (isAdminLogin) {
      if (isAdminRole(role)) return NextResponse.redirect(new URL('/admin', request.url));
      return NextResponse.next();
    }
    if (!isAdminRole(role)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // L'ancien contrôle de présence du cookie `jobsinc_admin_user` a été
    // supprimé : c'était un cookie NON HttpOnly, donc modifiable en JavaScript
    // (`document.cookie = 'jobsinc_admin_user=x'` suffisait) et il n'apportait
    // aucune autorisation au-delà du contrôle de rôle fait juste au-dessus.
    //
    // On transmet l'identité RÉELLEMENT vérifiée par l'API, pour que les
    // composants serveur n'aient pas à refaire un aller-retour `/auth/me` et
    // ne puissent pas inventer un état d'authentification.
    const headers = new Headers(request.headers);
    headers.set('x-jobsinc-user-id', user.id);
    if (role) headers.set('x-jobsinc-user-role', role);
    return NextResponse.next({ request: { headers } });
  }

  if (!isRecruiterRole(role)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const headers = new Headers(request.headers);
  headers.set('x-jobsinc-user-id', user.id);
  if (role) headers.set('x-jobsinc-user-role', role);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Limité aux deux espaces réellement protégés. L'ancien matcher
  // `/((?!_next/static|_next/image|favicon.ico|public).*)` s'exécutait sur TOUTES
  // les pages (dont la page d'accueil publique) et, pire, sa lookahead
  // négative contenait un `public` sans `/` ni `.*` : n'importe quel segment
  // COMMENÇANT par « public » était exclu du proxy — donc non protégé.
  // Cibler les préfixes rend le matcher à la fois plus sûr et plus exact.
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
