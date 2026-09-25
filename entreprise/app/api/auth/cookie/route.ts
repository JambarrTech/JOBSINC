import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'jobsinc_token';
const MAX_AGE = 15 * 60; // 15 minutes, aligné avec ACCESS_TOKEN_TTL backend

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === 'production';

    // HttpOnly Secure cookie sur le domaine frontend (lu par proxy.ts)
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    });

    // Alias pour compat middleware backend si jamais utilisé via rewrite
    response.cookies.set('accessToken', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true as const, secure: isProd, sameSite: 'lax' as const, path: '/' as const, maxAge: 0 };
  response.cookies.set(COOKIE_NAME, '', opts);
  response.cookies.set('accessToken', '', opts);
  // Nettoyage legacy non-httpOnly si présent
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
