import { NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const PUBLIC_PATHS = ['/', '/login', '/register', '/_next', '/favicon.ico', '/api'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => p === '/' ? pathname === '/' : pathname.startsWith(p));
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
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
        const valid = await verifyToken(token);
        if (valid) return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    const valid = await verifyToken(token);
    if (!valid) {
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('jobsinc_token');
      return response;
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

    const valid = await verifyToken(token);
    if (!valid) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('jobsinc_token');
      return response;
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};