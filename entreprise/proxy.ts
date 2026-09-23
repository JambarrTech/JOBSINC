import { NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const PUBLIC_PATHS = ['/', '/login', '/register', '/_next', '/favicon.ico', '/api'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => p === '/' ? pathname === '/' : pathname.startsWith(p));
}

async function verifyToken(token: string): Promise<{ valid: boolean; role?: string }> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { valid: false };
    const data = await res.json().catch(() => null);
    const role = data?.user?.role || data?.role;
    return { valid: true, role };
  } catch {
    return { valid: false };
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
        const { valid } = await verifyToken(token);
        if (valid) return NextResponse.redirect(new URL('/admin', request.url));
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