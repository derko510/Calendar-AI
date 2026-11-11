// The chat route's gate: no valid session, no AI spend.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, isEmailAllowed } from '../src/auth/requireUser.js';
import { encryptSession, COOKIE_NAME, COOKIE_PATH } from '../src/auth/session.js';

const SECRET = 'x'.repeat(40);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  delete process.env.ALLOWED_EMAILS;
  delete process.env.DEMO_CHAT_ENABLED;
});

function call({ cookie, body = {} } = {}) {
  const req = { body, get: (h) => (h.toLowerCase() === 'cookie' ? cookie : undefined) };
  const out = { status: 200, body: null, nextCalled: false };
  const res = {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; }
  };
  requireUser(req, res, () => { out.nextCalled = true; });
  return { ...out, user: req.user };
}

const cookieFor = (payload, secret = SECRET) =>
  `${COOKIE_NAME}=${encryptSession({ refreshToken: 'rt', sub: '123', ...payload }, secret)}`;

test('cookie path covers the chat route', () => {
  assert.equal(COOKIE_PATH, '/api');
});

test('no cookie → 401 signed_out, chat never runs', () => {
  const r = call();
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'signed_out');
  assert.equal(r.nextCalled, false);
});

test('tampered or foreign-secret cookie → 401', () => {
  const good = cookieFor({ email: 'me@example.com' });
  const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(call({ cookie: tampered }).status, 401);
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }, 'y'.repeat(40)) }).status, 401);
});

test('valid session → allowed through with the user attached', () => {
  const r = call({ cookie: cookieFor({ email: 'me@example.com' }) });
  assert.equal(r.nextCalled, true);
  assert.deepEqual(r.user, { sub: '123', email: 'me@example.com' });
});

test('ALLOWED_EMAILS blocks other accounts (case-insensitive)', () => {
  process.env.ALLOWED_EMAILS = ' Me@Example.com , friend@example.com';
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }) }).nextCalled, true);
  const blocked = call({ cookie: cookieFor({ email: 'stranger@example.com' }) });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'not_allowed');
  assert.equal(isEmailAllowed('FRIEND@example.com'), true);
});

test('demo chat is off by default, even when the request claims to be the demo', () => {
  const r = call({ body: { demo: true } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'demo_chat_disabled');
  assert.equal(r.nextCalled, false);
});

test('DEMO_CHAT_ENABLED=true opens chat for the demo only', () => {
  process.env.DEMO_CHAT_ENABLED = 'true';
  assert.equal(call({ body: { demo: true } }).nextCalled, true);
  assert.equal(call({ body: {} }).status, 401, 'non-demo requests still need a session');
});
