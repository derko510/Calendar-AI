// Google sign-in that lasts for months: the browser gets a one-time authorization code from Google
// (GIS code client, popup mode), this server swaps it for a refresh token, and keeps that refresh
// token only in an encrypted httpOnly cookie. The browser asks /refresh for a fresh 1-hour access
// token whenever it needs one. Never log tokens, codes or emails here.
import express from 'express';
import {
  COOKIE_NAME,
  clearedSessionCookie,
  decryptSession,
  encryptSession,
  parseCookies,
  sessionCookie
} from '../auth/session.js';
import { isEmailAllowed } from '../auth/requireUser.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CSRF_HEADER_VALUE = 'calendar-ai';
const TIMEOUT_MS = 10_000;

const config = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  sessionSecret: process.env.SESSION_SECRET || ''
});

// Secure cookies everywhere except plain-http localhost (dev)
const isSecure = req => Boolean(process.env.VERCEL) || req.secure || req.get('x-forwarded-proto') === 'https';

const readSession = (req, secret) => decryptSession(parseCookies(req.get('cookie'))[COOKIE_NAME], secret);

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data: data && typeof data === 'object' ? data : {} };
}

// The id_token came straight from Google's token endpoint over TLS, so decoding (not verifying) it is enough;
// still sanity-check issuer and audience.
function profileFromIdToken(idToken, clientId) {
  if (typeof idToken !== 'string') return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8'));
    if (!GOOGLE_ISSUERS.has(claims.iss) || claims.aud !== clientId || !claims.sub) return null;
    return { sub: String(claims.sub), email: claims.email || '', name: claims.name || '', picture: claims.picture || '' };
  } catch {
    return null;
  }
}

async function profileFromUserinfo(accessToken) {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u?.sub) return null;
    return { sub: String(u.sub), email: u.email || '', name: u.name || '', picture: u.picture || '' };
  } catch {
    return null;
  }
}

const publicProfile = p => ({ email: p.email || '', name: p.name || '', picture: p.picture || '' });
const expiresAtFrom = expiresIn => Date.now() + (Number(expiresIn) > 0 ? Number(expiresIn) : 3600) * 1000;

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // CSRF: a custom header can't be sent cross-site without a CORS preflight, which our CORS policy refuses
  if (req.get('x-requested-with') !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
});

router.use(express.json({ limit: '16kb' }));

const requireConfig = (req, res, next) => {
  const { clientId, clientSecret, sessionSecret } = config();
  if (!clientId || !clientSecret || sessionSecret.length < 32) {
    console.error('Auth is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (32+ chars)');
    return res.status(503).json({ error: 'auth_not_configured' });
  }
  next();
};

// POST /api/auth/google { code } -> { accessToken, expiresAt, profile }
router.post('/google', requireConfig, async (req, res, next) => {
  try {
    const { clientId, clientSecret, sessionSecret } = config();
    const code = req.body?.code;
    if (typeof code !== 'string' || !code || code.length > 2048) {
      return res.status(400).json({ error: 'missing_code' });
    }

    const token = await postForm(TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'postmessage'
    });
    if (!token.ok || !token.data.access_token) {
      console.warn(`Google code exchange failed (${token.status} ${token.data.error || 'unknown'})`);
      const badCode = token.data.error === 'invalid_grant';
      return res.status(badCode ? 400 : 502).json({ error: badCode ? 'invalid_code' : 'google_error' });
    }

    const profile = profileFromIdToken(token.data.id_token, clientId) || await profileFromUserinfo(token.data.access_token);
    if (!profile) {
      return res.status(502).json({ error: 'profile_unavailable' });
    }

    // With PUBLIC_ACCESS=false only OWNER_EMAILS may sign in; otherwise anyone can (non-owners get the free Groq tier)
    if (!isEmailAllowed(profile.email)) {
      return res.status(403).json({ error: 'not_allowed' });
    }

    // Google only sends a refresh token the first time a user consents. On later sign-ins keep the
    // one already in this browser's cookie, as long as it belongs to the same Google account.
    let refreshToken = token.data.refresh_token;
    if (!refreshToken) {
      const existing = readSession(req, sessionSecret);
      if (existing && existing.sub === profile.sub) refreshToken = existing.refreshToken;
    }
    if (!refreshToken) {
      return res.status(409).json({ error: 'consent_required' });
    }

    res.set('Set-Cookie', sessionCookie(encryptSession({ refreshToken, ...profile }, sessionSecret), { secure: isSecure(req) }));
    res.json({
      accessToken: token.data.access_token,
      expiresAt: expiresAtFrom(token.data.expires_in),
      scope: token.data.scope || '',
      profile: publicProfile(profile)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh -> { accessToken, expiresAt, profile } | 401
router.post('/refresh', requireConfig, async (req, res, next) => {
  try {
    const { clientId, clientSecret, sessionSecret } = config();
    const secure = isSecure(req);
    const session = readSession(req, sessionSecret);
    if (!session) {
      res.set('Set-Cookie', clearedSessionCookie({ secure }));
      return res.status(401).json({ error: 'no_session' });
    }

    const token = await postForm(TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token'
    });
    if (!token.ok || !token.data.access_token) {
      const error = token.data.error || 'unknown';
      console.warn(`Google token refresh failed (${token.status} ${error})`);
      // invalid_grant: revoked, expired (7 days while the consent screen is in Testing), or password changed
      if (error === 'invalid_grant' || error === 'invalid_client' || error === 'unauthorized_client') {
        res.set('Set-Cookie', clearedSessionCookie({ secure }));
        return res.status(401).json({ error: 'session_expired' });
      }
      return res.status(502).json({ error: 'google_error' });
    }

    // Re-issue the cookie: slides the 180-day window and picks up a rotated refresh token if Google sent one
    // (encryptSession sets a new exp)
    const refreshToken = token.data.refresh_token || session.refreshToken;
    res.set('Set-Cookie', sessionCookie(encryptSession({ ...session, refreshToken }, sessionSecret), { secure }));
    res.json({
      accessToken: token.data.access_token,
      expiresAt: expiresAtFrom(token.data.expires_in),
      scope: token.data.scope || '',
      profile: publicProfile(session)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout -> revoke at Google (best effort) and clear the cookie
router.post('/logout', async (req, res) => {
  const session = readSession(req, config().sessionSecret);
  if (session) {
    try {
      const result = await postForm(REVOKE_URL, { token: session.refreshToken });
      if (!result.ok) console.warn(`Google token revoke failed (${result.status})`);
    } catch {
      console.warn('Google token revoke failed (network)');
    }
  }
  res.set('Set-Cookie', clearedSessionCookie({ secure: isSecure(req) }));
  res.json({ ok: true });
});

export default router;
