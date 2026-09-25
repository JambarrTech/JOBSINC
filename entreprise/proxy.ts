import { NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api').replace(/\/$/, '');

const PUBLIC_PATHS = ['/', '/login', '/register', '/_next', '/favicon.ico', '/api'];

function isPublicPath(pathname: string): boolean {
  // Évite faux positif /_nextxxx : check strict ou préfixe avec /
  return PUBLIC_PATHS.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname === p || pathname.startsWith(p + '/') || p === '/_next' && pathname.startsWith('/_next/');
  });
}

// Cache LRU en mémoire edge (60s) pour éviter fetch /auth/me par requête
const tokenCache = new Map<string, { valid: boolean; role?: string; exp: number }>();
const CACHE_TTL_MS = 10_000;
const MAX_CACHE_SIZE = 500;

function getCached(token: string): { valid: boolean; role?: string } | null {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    tokenCache.delete(token);
    return null;
  }
  return { valid: entry.valid, role: entry.role };
}
function setCached(token: string, result: { valid: boolean; role?: string }) {
  if (tokenCache.size >= MAX_CACHE_SIZE) {
    const firstKey = tokenCache.keys().next().value as string | undefined;
    if (firstKey) tokenCache.delete(firstKey);
  }
  tokenCache.set(token, { ...result, exp: Date.now() + CACHE_TTL_MS });
}

async function verifyToken(token: string): Promise<{ valid: boolean; role?: string }> {
  const cached = getCached(token);
  if (cached) return cached;
  // Fast-path: si JWT non expiré, on tente decode local pour rôle, mais on vérifie validité via fetch si cache miss
  // On garde le fetch comme source de vérité pour tokenVersion (revocation)
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      const result = { valid: false };
      setCached(token, result);
      return result;
    }
    const data = await res.json().catch(() => null);
    const role = data?.user?.role || data?.role;
    const result = { valid: true, role };
    setCached(token, result);
    return result;
  } catch {
    // Une panne backend ne doit jamais devenir une validation locale du JWT.
    const result = { valid: false };
    setCached(token, result);
    return result;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('jobsinc_token')?.value;

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      if (token) {
        const { valid, role } = await verifyToken(token);
        if (valid && role === 'ADMIN') return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    const { valid, role } = await verifyToken(token);
    if (!valid) {
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('jobsinc_token');
      return response;
    }
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const storedUser = request.cookies.get('jobsinc_admin_user')?.value;
    if (!storedUser) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { valid, role } = await verifyToken(token);
    if (!valid) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('jobsinc_token');
      return response;
    }
    if (role !== 'RECRUITER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};