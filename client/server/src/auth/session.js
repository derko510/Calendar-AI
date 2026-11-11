// The sign-in session lives entirely in one encrypted cookie, so the API stays stateless (no database).
// AES-256-GCM: the key is SHA-256(SESSION_SECRET), every cookie gets a random 12-byte IV, and the
// auth tag means any edit to the cookie (or a different secret) makes it fail to decrypt.
import crypto from 'node:crypto';

export const COOKIE_NAME = 'cal_session';
// /api (not just /api/auth) so the chat route can check the session too; it is still never sent to page URLs
export const COOKIE_PATH = '/api';
export const MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days, renewed on every refresh

const VERSION = 'v1';
const AAD = Buffer.from(`${COOKIE_NAME}.${VERSION}`);
const IV_BYTES = 12;
const TAG_BYTES = 16;

const keyFrom = secret => crypto.createHash('sha256').update(String(secret)).digest();

// payload: { refreshToken, sub, email, name, picture }. Adds exp so the server enforces the lifetime too.
export function encryptSession(payload, secret, now = Date.now()) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  cipher.setAAD(AAD);
  const plaintext = Buffer.from(JSON.stringify({ ...payload, exp: now + MAX_AGE_SECONDS * 1000 }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
}

// Returns the payload, or null if the cookie is missing, malformed, tampered with, from another secret, or expired
export function decryptSession(value, secret, now = Date.now()) {
  if (typeof value !== 'string' || !value.startsWith(`${VERSION}.`) || !secret) return null;
  try {
    const raw = Buffer.from(value.slice(VERSION.length + 1), 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), raw.subarray(0, IV_BYTES));
    decipher.setAAD(AAD);
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plaintext = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (!payload || typeof payload.refreshToken !== 'string' || !payload.refreshToken) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

// Minimal Cookie header parser (no cookie-parser dependency). First occurrence of a name wins.
export function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name || Object.hasOwn(out, name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function sessionCookie(value, { secure }) {
  return [
    `${COOKIE_NAME}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

export function clearedSessionCookie({ secure }) {
  return [
    `${COOKIE_NAME}=`,
    `Path=${COOKIE_PATH}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}
