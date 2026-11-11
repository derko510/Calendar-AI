// Browser side of the long-lived Google sign-in.
// The refresh token never reaches JavaScript: it sits in an encrypted httpOnly cookie that only
// /api/auth/* can read. This module keeps the 1-hour access token in memory and asks the API for a
// new one shortly before it expires.
import { API_BASE_URL } from '../utils/apiBase';

const AUTH_URL = `${API_BASE_URL}/api/auth`;
const REFRESH_EARLY_MS = 2 * 60 * 1000;

// Non-secret profile ({ email, name, picture }) kept for "has this browser signed in before" and a
// fast first paint. It reuses the old 'googleAuth' key on purpose: the Dashboard's sign-out button
// still removes that key and reloads, so a live cookie with no profile here means "signed out".
const PROFILE_KEY = 'googleAuth';

let accessToken = null;
let expiresAt = 0;
let profile = null;
let refreshing = null;
const signedOutListeners = new Set();

export class AuthError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function readStoredProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { available: true, profile: null };
    const parsed = JSON.parse(raw);
    // Legacy entries from the old implicit flow held an access token: drop them
    if (!parsed || typeof parsed !== 'object' || 'accessToken' in parsed) {
      localStorage.removeItem(PROFILE_KEY);
      return { available: true, profile: null };
    }
    return { available: true, profile: parsed };
  } catch {
    return { available: false, profile: null };
  }
}

function storeProfile(p) {
  try {
    if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: p.email || '', name: p.name || '', picture: p.picture || '' }));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // storage unavailable (private mode etc.): nothing to cache
  }
}

async function post(path, body) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'calendar-ai' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) throw new AuthError(data.error || `http_${res.status}`, res.status);
  return data;
}

function applyTokens(data) {
  accessToken = data.accessToken;
  expiresAt = Number(data.expiresAt) || Date.now() + 3600 * 1000;
  profile = data.profile || profile;
  storeProfile(profile);
  return credential();
}

function clearLocal() {
  accessToken = null;
  expiresAt = 0;
  profile = null;
  storeProfile(null);
}

function credential() {
  return { accessToken, expiresAt, email: profile?.email || '', name: profile?.name || '', picture: profile?.picture || '' };
}

function notifySignedOut() {
  for (const cb of signedOutListeners) {
    try { cb(); } catch { /* listener errors must not break auth */ }
  }
}

// One refresh at a time; concurrent callers share the same request
function refresh() {
  if (!refreshing) {
    refreshing = post('/refresh')
      .then(applyTokens)
      .catch(err => {
        if (err instanceof AuthError && err.status === 401) {
          clearLocal();
          notifySignedOut();
        }
        throw err;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// True when this browser has signed in before (used to skip the full consent screen)
export function hasSignedInBefore() {
  return Boolean(readStoredProfile().profile);
}

export function getCachedProfile() {
  return readStoredProfile().profile;
}

// On page load: returns the credential if the cookie session is still good, otherwise null
export async function restoreSession() {
  const stored = readStoredProfile();
  try {
    const cred = await refresh();
    if (stored.available && !stored.profile) {
      // Signed out elsewhere in the app (profile key removed) while the cookie lived on: finish the sign-out
      await signOut();
      return null;
    }
    return cred;
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) return null;
    throw err;
  }
}

// After the Google popup returns an authorization code
export async function signIn(code) {
  return applyTokens(await post('/google', { code }));
}

// A valid access token, refreshed ~2 minutes before it expires. force: skip the cache (after a 401).
export async function getAccessToken({ force = false } = {}) {
  if (!force && accessToken && Date.now() < expiresAt - REFRESH_EARLY_MS) return accessToken;
  const cred = await refresh();
  return cred.accessToken;
}

export async function signOut() {
  clearLocal();
  try {
    await post('/logout');
  } catch {
    // best effort: the cookie is httpOnly, so only the server can clear it
  }
}

// Called when the session ends on its own (refresh token revoked or expired)
export function onSignedOut(cb) {
  signedOutListeners.add(cb);
  return () => signedOutListeners.delete(cb);
}
