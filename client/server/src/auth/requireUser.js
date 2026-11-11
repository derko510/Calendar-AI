// Gate for routes that spend money (the AI chat): only signed-in, allowed users get through.
//
// The sign-in cookie is AES-GCM encrypted with SESSION_SECRET, so a cookie that decrypts was issued by this
// server after a real Google sign-in. No Google call is needed per request.
// ALLOWED_EMAILS (comma-separated) narrows it further to specific accounts; leave it unset to allow anyone
// who can sign in (Google limits unverified apps to 100 users).
// DEMO_CHAT_ENABLED=true lets the public demo (/?demo) chat without signing in. That spends your AI key for
// anyone who opens the demo, so it is off by default.
import { COOKIE_NAME, decryptSession, parseCookies } from './session.js';

export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email) {
  const list = allowedEmails();
  return list.length === 0 || list.includes(String(email || '').toLowerCase());
}

export function requireUser(req, res, next) {
  const session = decryptSession(parseCookies(req.get('cookie'))[COOKIE_NAME], process.env.SESSION_SECRET || '');
  if (session) {
    if (!isEmailAllowed(session.email)) {
      return res.status(403).json({ success: false, error: 'not_allowed', message: 'This Google account is not allowed to use the assistant.' });
    }
    req.user = { sub: session.sub, email: session.email };
    return next();
  }
  if (req.body?.demo === true) {
    if (process.env.DEMO_CHAT_ENABLED === 'true') {
      req.user = { demo: true };
      return next();
    }
    return res.status(403).json({ success: false, error: 'demo_chat_disabled', message: 'The assistant is turned off in the demo. Sign in with Google to use it on your own calendar.' });
  }
  return res.status(401).json({ success: false, error: 'signed_out', message: 'Your session ended. Sign in again to use the assistant.' });
}
