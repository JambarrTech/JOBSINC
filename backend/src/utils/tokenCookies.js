// Single source of truth for the authentication cookie names and extraction.
//
// Why this module exists: three call sites need to know "is this request
// cookie-authenticated?" — authMiddleware, the CSRF origin guard in app.js, and
// the uploadAuth guard. They previously each hardcoded their own list, and the
// CSRF guard was missing the legacy `token` cookie that authMiddleware accepted,
// so a `token`-only request bypassed the origin check on POST/PUT/PATCH/DELETE.
// Always derive the list from here instead of re-listing cookie names.

// Cookies carrying the 15-minute access token. `accessToken` and `token` are
// compatibility aliases kept for the web BFF and older mobile builds.
const ACCESS_COOKIE_NAMES = ['jobsinc_token', 'accessToken', 'token'];

// Cookies carrying the 30-day refresh token (scoped to /api/auth by the issuer).
const REFRESH_COOKIE_NAMES = ['refreshToken'];

/** Returns the access token from cookies, or null. Does not read the Authorization header. */
function getAccessTokenFromCookies(cookies) {
  if (!cookies) return null;
  for (const name of ACCESS_COOKIE_NAMES) {
    const value = cookies[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** True when the request carries an access token via cookie (not via Authorization header). */
function hasCookieAuth(cookies) {
  return getAccessTokenFromCookies(cookies) !== null;
}

/** Attributes used when setting an access-token cookie. Kept symmetric with authController. */
function accessCookieOptions(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

module.exports = {
  ACCESS_COOKIE_NAMES,
  REFRESH_COOKIE_NAMES,
  getAccessTokenFromCookies,
  hasCookieAuth,
  accessCookieOptions,
};
