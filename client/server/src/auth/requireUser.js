// Gate for the AI chat. Decides WHO is asking, which decides which AI they get:
//
//   owner   — signed in with an email in OWNER_EMAILS (ALLOWED_EMAILS is the old name, still read).
//             Gets Claude Haiku (paid) with Groq as backup.
//   public  — any other signed-in Google account, and the no-login demo (/?demo).
//             Gets Groq's free tier only and can never spend the owner's Claude money.
//             Rate limited per visitor so one person can't burn the shared free quota.
//
// The sign-in cookie is AES-GCM encrypted with SESSION_SECRET, so a cookie that decrypts was issued by this
// server after a real Google sign-in. No Google call is needed per request.
//
// Switches: PUBLIC_ACCESS=false turns the public tier off entirely (owners only, demo chat off).
//           DEMO_CHAT_ENABLED=false turns off just the demo's chat.
import { COOKIE_NAME, decryptSession, parseCookies } from './session.js';

export function ownerEmails() {
  return (process.env.OWNER_EMAILS || process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwner(email) {
  return Boolean(email) && ownerEmails().includes(String(email).toLowerCase());
}

export const publicAccess = () => process.env.PUBLIC_ACCESS !== 'false';
export const demoChatEnabled = () => publicAccess() && process.env.DEMO_CHAT_ENABLED !== 'false';

// Who may sign in at all: everyone when the public tier is on, otherwise owners only
export function isEmailAllowed(email) {
  return publicAccess() || isOwner(email);
}

// --- Per-visitor rate limit for the public tier -------------------------------------------------
// In memory, so it is per warm serverless instance: a best-effort brake, not an exact quota.
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // key -> timestamps within the window

export const publicLimit = () => {
  const n = Number(process.env.PUBLIC_CHAT_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 20; // messages per 10 minutes
};

export function takeToken(key, now = Date.now(), limit = publicLimit()) {
  const recent = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing without bound on a long-lived instance
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (times.every(t => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}

export const resetRateLimit = () => hits.clear(); // tests

function clientIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

const deny = (res, status, error, message) => res.status(status).json({ success: false, error, message });
const tooMany = (res) => deny(res, 429, 'rate_limited', 'You have sent a lot of messages. Try again in a few minutes.');

export function requireUser(req, res, next) {
  const session = decryptSession(parseCookies(req.get('cookie'))[COOKIE_NAME], process.env.SESSION_SECRET || '');

  if (session) {
    if (isOwner(session.email)) {
      req.user = { sub: session.sub, email: session.email, owner: true };
      return next();
    }
    if (!publicAccess()) {
      return deny(res, 403, 'not_allowed', 'This Google account is not allowed to use the assistant.');
    }
    if (!takeToken(`sub:${session.sub || session.email}`)) return tooMany(res);
    req.user = { sub: session.sub, email: session.email, owner: false };
    return next();
  }

  if (req.body?.demo === true) {
    if (!demoChatEnabled()) {
      return deny(res, 403, 'demo_chat_disabled', 'The assistant is turned off in the demo. Sign in with Google to use it on your own calendar.');
    }
    if (!takeToken(`ip:${clientIp(req)}`)) return tooMany(res);
    req.user = { demo: true, owner: false };
    return next();
  }

  return deny(res, 401, 'signed_out', 'Your session ended. Sign in again to use the assistant.');
}
