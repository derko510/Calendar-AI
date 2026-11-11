import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  decryptSession,
  encryptSession,
  parseCookies
} from '../src/auth/session.js';
import authRouter from '../src/routes/auth.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';

// --- session helpers ---

test('encrypt/decrypt round trip', () => {
  const payload = { refreshToken: 'rt-1', sub: '42', email: 'a@b.c', name: 'A', picture: '' };
  const cookie = encryptSession(payload, SECRET);
  assert.match(cookie, /^v1\.[A-Za-z0-9_-]+$/);
  const out = decryptSession(cookie, SECRET);
  assert.equal(out.refreshToken, 'rt-1');
  assert.equal(out.sub, '42');
  assert.equal(out.email, 'a@b.c');
  assert.ok(out.exp > Date.now());
  assert.ok(!cookie.includes('rt-1'));
});

test('two encryptions of the same payload differ (random IV)', () => {
  const p = { refreshToken: 'rt', sub: '1' };
  assert.notEqual(encryptSession(p, SECRET), encryptSession(p, SECRET));
});

test('tampered cookie is rejected', () => {
  const cookie = encryptSession({ refreshToken: 'rt', sub: '1' }, SECRET);
  const raw = Buffer.from(cookie.slice(3), 'base64url');
  for (const i of [0, 14, raw.length - 1]) {
    const copy = Buffer.from(raw);
    copy[i] ^= 1;
    assert.equal(decryptSession(`v1.${copy.toString('base64url')}`, SECRET), null, `byte ${i}`);
  }
  assert.equal(decryptSession(cookie.slice(0, -4), SECRET), null);
  assert.equal(decryptSession('v1.', SECRET), null);
  assert.equal(decryptSession('garbage', SECRET), null);
  assert.equal(decryptSession(undefined, SECRET), null);
});

test('wrong secret is rejected', () => {
  const cookie = encryptSession({ refreshToken: 'rt', sub: '1' }, SECRET);
  assert.equal(decryptSession(cookie, `${SECRET}-other`), null);
  assert.equal(decryptSession(cookie, ''), null);
});

test('expired cookie is rejected', () => {
  const issued = Date.now() - (MAX_AGE_SECONDS + 1) * 1000;
  const cookie = encryptSession({ refreshToken: 'rt', sub: '1' }, SECRET, issued);
  assert.equal(decryptSession(cookie, SECRET), null);
});

test('parseCookies handles spacing, quotes, encoding and duplicates', () => {
  assert.deepEqual(parseCookies('a=1; b = two ;c="q"; d=%20x; a=ignored; flag; =bad'), { a: '1', b: 'two', c: 'q', d: ' x' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.equal(parseCookies('x=%E0%A4%A')['x'], '%E0%A4%A');
});

// --- routes ---

const idToken = (claims) => [
  Buffer.from('{"alg":"none"}').toString('base64url'),
  Buffer.from(JSON.stringify(claims)).toString('base64url'),
  'sig'
].join('.');

const GOOD_ID_TOKEN = idToken({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '42', email: 'me@example.com', name: 'Me', picture: 'https://p/x.png' });

let server;
let port;
let realFetch;
let calls;
let tokenReply;
let revokeReply;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

before(async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = 'shh';
  process.env.SESSION_SECRET = SECRET;
  delete process.env.VERCEL;
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = Object.fromEntries(new URLSearchParams(init.body || ''));
    calls.push({ url: String(url), body });
    if (String(url) === 'https://oauth2.googleapis.com/token') return tokenReply(body);
    if (String(url) === 'https://oauth2.googleapis.com/revoke') return revokeReply(body);
    throw new Error(`unexpected fetch ${url}`);
  };
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  calls = [];
  tokenReply = () => json(500, { error: 'not_mocked' });
  revokeReply = () => new Response('', { status: 200 });
});

function call(path, { body, cookie, csrf = true } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/auth${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(csrf ? { 'X-Requested-With': 'calendar-ai' } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        const setCookie = (res.headers['set-cookie'] || [])[0] || '';
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null, setCookie, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

const cookieValue = setCookie => setCookie.split(';')[0].slice(COOKIE_NAME.length + 1);
const sessionHeader = payload => `${COOKIE_NAME}=${encryptSession(payload, SECRET)}`;

test('POST /google exchanges the code and sets an encrypted httpOnly cookie', async () => {
  tokenReply = () => json(200, { access_token: 'at-1', expires_in: 3599, refresh_token: 'rt-1', id_token: GOOD_ID_TOKEN, scope: 'x' });
  const t0 = Date.now();
  const res = await call('/google', { body: { code: 'auth-code' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.accessToken, 'at-1');
  assert.ok(res.body.expiresAt >= t0 + 3599_000 && res.body.expiresAt <= Date.now() + 3599_000);
  assert.deepEqual(res.body.profile, { email: 'me@example.com', name: 'Me', picture: 'https://p/x.png' });
  assert.equal(res.body.refreshToken, undefined);
  assert.equal(res.headers['cache-control'], 'no-store');

  assert.deepEqual(calls[0].body, { client_id: CLIENT_ID, client_secret: 'shh', code: 'auth-code', grant_type: 'authorization_code', redirect_uri: 'postmessage' });

  assert.match(res.setCookie, /HttpOnly/);
  assert.match(res.setCookie, /SameSite=Lax/);
  assert.match(res.setCookie, /Path=\/api;/);
  assert.match(res.setCookie, new RegExp(`Max-Age=${MAX_AGE_SECONDS}`));
  assert.doesNotMatch(res.setCookie, /Secure/); // plain http localhost
  assert.doesNotMatch(res.setCookie, /rt-1/);
  const stored = decryptSession(cookieValue(res.setCookie), SECRET);
  assert.equal(stored.refreshToken, 'rt-1');
  assert.equal(stored.sub, '42');
});

test('POST /google with PUBLIC_ACCESS=false refuses non-owner accounts and sets no cookie', async () => {
  process.env.OWNER_EMAILS = 'someone-else@example.com';
  process.env.PUBLIC_ACCESS = 'false';
  try {
    tokenReply = () => json(200, { access_token: 'at-1', expires_in: 3599, refresh_token: 'rt-1', id_token: GOOD_ID_TOKEN, scope: 'x' });
    const res = await call('/google', { body: { code: 'auth-code' } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'not_allowed');
    assert.ok(!res.setCookie, 'no session cookie for a blocked account');
  } finally {
    delete process.env.OWNER_EMAILS;
    delete process.env.PUBLIC_ACCESS;
  }
});

test('POST /google lets a non-owner sign in when the public tier is on (the default)', async () => {
  process.env.OWNER_EMAILS = 'someone-else@example.com';
  try {
    tokenReply = () => json(200, { access_token: 'at-1', expires_in: 3599, refresh_token: 'rt-1', id_token: GOOD_ID_TOKEN, scope: 'x' });
    const res = await call('/google', { body: { code: 'auth-code' } });
    assert.equal(res.status, 200);
    assert.ok(res.setCookie);
  } finally {
    delete process.env.OWNER_EMAILS;
  }
});

test('POST /google sets Secure behind https', async () => {
  process.env.VERCEL = '1';
  try {
    tokenReply = () => json(200, { access_token: 'at', expires_in: 3600, refresh_token: 'rt', id_token: GOOD_ID_TOKEN });
    const res = await call('/google', { body: { code: 'c' } });
    assert.match(res.setCookie, /; Secure/);
  } finally {
    delete process.env.VERCEL;
  }
});

test('POST /google without a refresh token keeps the existing cookie token for the same account', async () => {
  tokenReply = () => json(200, { access_token: 'at-2', expires_in: 3600, id_token: GOOD_ID_TOKEN });
  const res = await call('/google', { body: { code: 'c' }, cookie: sessionHeader({ refreshToken: 'old-rt', sub: '42', email: 'me@example.com' }) });
  assert.equal(res.status, 200);
  assert.equal(decryptSession(cookieValue(res.setCookie), SECRET).refreshToken, 'old-rt');
});

test('POST /google without a refresh token and no usable cookie asks for consent', async () => {
  tokenReply = () => json(200, { access_token: 'at-2', expires_in: 3600, id_token: GOOD_ID_TOKEN });
  const none = await call('/google', { body: { code: 'c' } });
  assert.equal(none.status, 409);
  assert.equal(none.body.error, 'consent_required');
  assert.equal(none.setCookie, '');
  // a cookie belonging to a different Google account is not reused
  const other = await call('/google', { body: { code: 'c' }, cookie: sessionHeader({ refreshToken: 'someone-else', sub: '99' }) });
  assert.equal(other.status, 409);
});

test('POST /google rejects a bad code and a missing code', async () => {
  tokenReply = () => json(400, { error: 'invalid_grant' });
  assert.equal((await call('/google', { body: { code: 'used' } })).status, 400);
  const missing = await call('/google', { body: {} });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'missing_code');
});

test('POST /google ignores an id_token for another client', async () => {
  const wrongAud = idToken({ iss: 'https://accounts.google.com', aud: 'other', sub: '42' });
  tokenReply = () => json(200, { access_token: 'at', expires_in: 3600, refresh_token: 'rt', id_token: wrongAud });
  const realMock = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes('userinfo') ? json(401, {}) : realMock(url, init);
  try {
    const res = await call('/google', { body: { code: 'c' } });
    assert.equal(res.status, 502);
    assert.equal(res.body.error, 'profile_unavailable');
  } finally {
    globalThis.fetch = realMock;
  }
});

test('POST /refresh returns a new access token and renews the cookie', async () => {
  tokenReply = () => json(200, { access_token: 'at-new', expires_in: 3600 });
  const res = await call('/refresh', { cookie: sessionHeader({ refreshToken: 'rt-1', sub: '42', email: 'me@example.com', name: 'Me', picture: '' }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.accessToken, 'at-new');
  assert.deepEqual(res.body.profile, { email: 'me@example.com', name: 'Me', picture: '' });
  assert.deepEqual(calls[0].body, { client_id: CLIENT_ID, client_secret: 'shh', refresh_token: 'rt-1', grant_type: 'refresh_token' });
  assert.equal(decryptSession(cookieValue(res.setCookie), SECRET).refreshToken, 'rt-1');
});

test('POST /refresh with invalid_grant returns 401 and clears the cookie', async () => {
  tokenReply = () => json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
  const res = await call('/refresh', { cookie: sessionHeader({ refreshToken: 'revoked', sub: '42' }) });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'session_expired');
  assert.match(res.setCookie, new RegExp(`^${COOKIE_NAME}=;`));
  assert.match(res.setCookie, /Max-Age=0/);
});

test('POST /refresh with no or tampered cookie returns 401 without calling Google', async () => {
  assert.equal((await call('/refresh')).status, 401);
  const tampered = await call('/refresh', { cookie: `${COOKIE_NAME}=v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` });
  assert.equal(tampered.status, 401);
  assert.match(tampered.setCookie, /Max-Age=0/);
  assert.equal(calls.length, 0);
});

test('POST /refresh passes Google outages through as 502 and keeps the cookie', async () => {
  tokenReply = () => json(503, { error: 'backend_error' });
  const res = await call('/refresh', { cookie: sessionHeader({ refreshToken: 'rt', sub: '42' }) });
  assert.equal(res.status, 502);
  assert.equal(res.setCookie, '');
});

test('POST /logout revokes the refresh token and clears the cookie', async () => {
  const res = await call('/logout', { cookie: sessionHeader({ refreshToken: 'rt-bye', sub: '42' }) });
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/revoke');
  assert.deepEqual(calls[0].body, { token: 'rt-bye' });
  assert.match(res.setCookie, /Max-Age=0/);
});

test('POST /logout still clears the cookie when revoke fails', async () => {
  revokeReply = () => { throw new Error('network down'); };
  const res = await call('/logout', { cookie: sessionHeader({ refreshToken: 'rt', sub: '42' }) });
  assert.equal(res.status, 200);
  assert.match(res.setCookie, /Max-Age=0/);
});

test('all auth routes require X-Requested-With (CSRF)', async () => {
  for (const path of ['/google', '/refresh', '/logout']) {
    const res = await call(path, { body: { code: 'c' }, csrf: false, cookie: sessionHeader({ refreshToken: 'rt', sub: '42' }) });
    assert.equal(res.status, 403, path);
    assert.equal(res.setCookie, '', path);
  }
  assert.equal(calls.length, 0);
});

test('routes report missing configuration instead of failing silently', async () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'short';
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await call('/refresh');
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'auth_not_configured');
  } finally {
    console.error = originalError;
    process.env.SESSION_SECRET = saved;
  }
});
